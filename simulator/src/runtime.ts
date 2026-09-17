// The production host signs bets with a session key and submits them
// gaslessly on the player's behalf; the harness replaces that with direct EOA
// transactions against the local chain while preserving the same two-phase
// timing games observe: `onAccepted` fires at broadcast, the returned promise
// resolves with the receipt.
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

import type { SimulatorConfig } from './config';
import { erc20Abi, localCasinoHostExtrasAbi } from './casino-abi';
import type { BatchAction } from './casino';
import { createSessionEventFeed, type SessionEventFeed } from './session-events';
import { createSessionStore, type SessionStore } from './session-store';

export type SimulatorRuntime = {
  chainId: number;
  account: PrivateKeyAccount;
  publicClient: PublicClient;
  proxy: Address;
  liquidityVault: Address;
  token: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  feed: SessionEventFeed;
  sessionStore: SessionStore;
  sendActions: (
    actions: BatchAction[],
    onAccepted?: (transactionHash: Hex) => void,
  ) => Promise<{ transactionHash: Hex; receipt: TransactionReceipt }>;
  fetchTokenBalance: () => Promise<bigint | undefined>;
  stop: () => void;
};

function localChain(chainId: number, rpcUrl: string): Chain {
  return defineChain({
    id: chainId,
    name: `Local chain ${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

export async function createSimulatorRuntime(
  config: SimulatorConfig,
  lags: { flashblockLagMs: () => number; indexerLagMs: () => number },
): Promise<SimulatorRuntime> {
  if (!config.proxy || !config.liquidityVault || !config.token) {
    throw new Error('Missing contract addresses.');
  }
  const proxy = config.proxy;
  const liquidityVault = config.liquidityVault;
  const token = config.token;

  const probeClient = createPublicClient({ transport: http(config.rpcUrl) });
  const chainId = await probeClient.getChainId();
  const chain = localChain(chainId, config.rpcUrl);
  // Fast polling keeps local receipts near-instant, matching how quickly the
  // production host learns about inclusion.
  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl),
    pollingInterval: 250,
  });
  const account = privateKeyToAccount(config.playerPrivateKey);
  const walletClient: WalletClient = createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl),
  });

  const [tokenSymbol, tokenDecimals] = await Promise.all([
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  ]);

  // The LocalCasinoHost whitelist is permissionless, so an unregistered game
  // (a developer's fresh deployment) is registered on the fly under the
  // configured name. Skipped silently when the host doesn't expose it.
  if (config.gameAddress && config.gameName) {
    try {
      const registeredName = await publicClient.readContract({
        address: proxy,
        abi: localCasinoHostExtrasAbi,
        functionName: 'getGameName',
        args: [config.gameAddress],
      });
      if (!registeredName) {
        const hash = await walletClient.writeContract({
          address: proxy,
          abi: localCasinoHostExtrasAbi,
          functionName: 'registerGame',
          args: [config.gameAddress, config.gameName],
          account,
          chain,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
    } catch {
      // Not a LocalCasinoHost — leave registration to whoever owns the host.
    }
  }

  const feed = createSessionEventFeed({
    publicClient,
    proxy,
    flashblockLagMs: lags.flashblockLagMs,
    indexerLagMs: lags.indexerLagMs,
  });
  const sessionStore = createSessionStore(chainId);
  const unsubscribeIndexed = feed.subscribeIndexed(event => sessionStore.applyEvent(event));

  // In production the actions of one bet execute atomically from the player's
  // smart vault; here each action is its own EOA transaction. Prior actions
  // (the approve) are confirmed before the final one broadcasts, and the whole
  // harness shares one queue so pipelined bets never race the account nonce.
  let sendQueue: Promise<unknown> = Promise.resolve();
  const sendActions: SimulatorRuntime['sendActions'] = (actions, onAccepted) => {
    if (actions.length === 0) return Promise.reject(new Error('No actions to send.'));
    const result = sendQueue.then(async () => {
      for (const action of actions.slice(0, -1)) {
        const hash = await walletClient.sendTransaction({
          account,
          chain,
          to: action.target,
          value: action.value,
          data: action.data,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error('Transaction failed.');
      }
      const finalAction = actions[actions.length - 1]!;
      const transactionHash = await walletClient.sendTransaction({
        account,
        chain,
        to: finalAction.target,
        value: finalAction.value,
        data: finalAction.data,
      });
      onAccepted?.(transactionHash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
      if (receipt.status !== 'success') throw new Error('Transaction failed.');
      return { transactionHash, receipt };
    });
    sendQueue = result.catch(() => undefined);
    return result;
  };

  return {
    chainId,
    account,
    publicClient,
    proxy,
    liquidityVault,
    token,
    tokenSymbol,
    tokenDecimals: Number(tokenDecimals),
    feed,
    sessionStore,
    sendActions,
    fetchTokenBalance: async () => {
      try {
        return await publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [account.address],
        });
      } catch {
        return undefined;
      }
    },
    stop: () => {
      unsubscribeIndexed();
      feed.stop();
    },
  };
}
