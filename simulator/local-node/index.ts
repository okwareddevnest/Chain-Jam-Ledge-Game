// One-command local backend for the casino-sdk simulator: a chain (spawns the
// bundled in-memory Hardhat node unless an RPC is already listening), the real
// Verify Network VRF router + fulfilling node (from the SDK's bundled
// local-verify-network), and a minimal casino deployment (test token,
// LocalCasinoHost + vault, the real CoinflipGame). Also compiles, deploys and
// registers every game contract dropped into contracts/ and keeps watching the
// folder. Writes local-node/deployed.json for the harness UI and keeps
// fulfilling randomness until stopped.
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Abi,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  localCasinoHostAbi,
  localCasinoHostBytecode,
  localTestTokenAbi,
  localTestTokenBytecode,
} from '../src/local-node/artifacts.ts';
import { coinflipGameAbi, coinflipGameBytecode } from '../src/local-node/coinflip-game-artifact.ts';
import { watchGameContracts, type DeployedGame } from './game-contracts.ts';

const here = dirname(fileURLToPath(import.meta.url));

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
// Anvil/Hardhat default mnemonic account #0 — deployer and default player.
const DEPLOYER_PRIVATE_KEY = (process.env.DEPLOYER_PRIVATE_KEY ??
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as Hex;
const PLAYER_FUNDS = parseEther(process.env.PLAYER_TOKEN_FUNDS ?? '1000000');
// Prod-scale pool: the harness derives the snapshot's `casino` bet limits from
// this balance at the production 1% per-bet risk cap, so a small pool would
// clamp high-multiplier games below their own minimum bet (500M → 5M cap →
// ~1000 max bet for a 5000x game).
const VAULT_LIQUIDITY = parseEther(process.env.VAULT_LIQUIDITY ?? '500000000');
const VRF_CLIENT_DEPOSIT_ETH = parseEther(process.env.VRF_CLIENT_DEPOSIT_ETH ?? '1000');

// The sibling package resolves its own viem install, so its client types are
// a different identity than ours; only those two fields are loosened.
type LocalVerifyNetworkExports = typeof import('../../local-verify-network/src/index.ts');

type WithLooseClients<Fn> = Fn extends (input: infer Input) => infer Result
  ? (
      input: Omit<Input, 'publicClient' | 'walletClient'> & {
        publicClient: unknown;
        walletClient: unknown;
      },
    ) => Result
  : Fn;

type LocalVerifyNetworkModule = {
  [
    K in
      | 'LOCAL_VRF_NODE_PRIVATE_KEY'
      | 'setupLocalVerifyNetwork'
      | 'depositLocalVrfBalance'
      | 'startLocalVerifyNetworkNode'
  ]: WithLooseClients<LocalVerifyNetworkExports[K]>;
};

// The Verify Network simulator ships next to the simulator in the casino-sdk
// package. Loaded dynamically so a missing install fails with a hint instead
// of a bare resolution error.
async function loadLocalVerifyNetwork(): Promise<LocalVerifyNetworkModule> {
  try {
    return (await import('../../local-verify-network/src/index.ts')) as LocalVerifyNetworkModule;
  } catch (error) {
    console.error(
      '\nCould not load ../local-verify-network (bundled with the casino-sdk package).\n' +
        'Run `npm install` inside the local-verify-network directory first.\n',
    );
    throw error;
  }
}

async function probeRpc(url: string): Promise<number | undefined> {
  try {
    const client = createPublicClient({ transport: http(url, { timeout: 1_000, retryCount: 0 }) });
    return await client.getChainId();
  } catch {
    return undefined;
  }
}

// The hardhat package exposes its CLI only through the package.json bin entry,
// so resolve it and run it with the current Node — no global install or PATH
// binary needed.
function resolveHardhatCli(): string {
  const packageJsonPath = fileURLToPath(import.meta.resolve('hardhat/package.json'));
  const { bin } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const relativeBin = typeof bin === 'string' ? bin : bin?.hardhat;
  if (!relativeBin) throw new Error('Could not locate the hardhat CLI in node_modules.');
  return resolve(dirname(packageJsonPath), relativeBin);
}

async function ensureChain(url: string): Promise<{ chainId: number; chainProcess?: ChildProcess }> {
  const existing = await probeRpc(url);
  if (existing !== undefined) {
    console.log(`[local-node] Using already-running chain at ${url} (chainId ${existing})`);
    return { chainId: existing };
  }

  const parsed = new URL(url);
  const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (!isLocal) {
    throw new Error(
      `No chain reachable at ${url} and it is not local, so the in-memory node cannot stand in.`,
    );
  }

  const port = parsed.port || '8545';
  console.log(`[local-node] Starting the in-memory Hardhat node on port ${port}…`);
  const chainProcess = spawn(
    process.execPath,
    [resolveHardhatCli(), 'node', '--hostname', '127.0.0.1', '--port', port],
    {
      cwd: resolve(here, '..'),
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, HARDHAT_DISABLE_TELEMETRY_PROMPT: 'true', DO_NOT_TRACK: '1' },
    },
  );
  chainProcess.on('error', error => {
    console.error(
      `[local-node] Failed to start the Hardhat node (${error.message}). Run \`npm install\` in ` +
        'the simulator, or start your own chain and point RPC_URL at it.',
    );
    process.exit(1);
  });
  chainProcess.on('exit', code => {
    console.error(`[local-node] Hardhat node exited with code ${code}`);
    process.exit(code ?? 1);
  });

  const deadline = Date.now() + 60_000;
  for (;;) {
    const chainId = await probeRpc(url);
    if (chainId !== undefined) return { chainId, chainProcess };
    if (Date.now() > deadline) throw new Error(`Hardhat node did not become ready at ${url}`);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
}

function buildChain(chainId: number, url: string): Chain {
  return defineChain({
    id: chainId,
    name: `Local chain ${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
}

async function deployContract(
  publicClient: PublicClient,
  walletClient: ReturnType<typeof createWalletClient>,
  abi: Abi,
  bytecode: Hex,
  args: readonly unknown[] = [],
): Promise<Address> {
  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args,
    chain: walletClient.chain,
    account: walletClient.account!,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error('Deployment produced no contract address');
  return receipt.contractAddress;
}

async function main() {
  const verifyNetwork = await loadLocalVerifyNetwork();
  const { chainId, chainProcess } = await ensureChain(RPC_URL);
  const chain = buildChain(chainId, RPC_URL);
  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL),
    pollingInterval: 200,
  });

  const deployerAccount = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
  const deployer = createWalletClient({
    account: deployerAccount,
    chain,
    transport: http(RPC_URL),
  });
  const nodeAccount = privateKeyToAccount(verifyNetwork.LOCAL_VRF_NODE_PRIVATE_KEY);
  const nodeWallet = createWalletClient({ account: nodeAccount, chain, transport: http(RPC_URL) });

  console.log('[local-node] Deploying Verify Network router + registering the local node…');
  const routerAddress = await verifyNetwork.setupLocalVerifyNetwork({
    publicClient,
    walletClient: nodeWallet,
  });
  console.log(`[local-node] Verify Network router: ${routerAddress}`);

  console.log('[local-node] Deploying test token, casino host and the CoinflipGame…');
  const token = await deployContract(
    publicClient,
    deployer,
    localTestTokenAbi,
    localTestTokenBytecode,
  );
  const host = await deployContract(
    publicClient,
    deployer,
    localCasinoHostAbi,
    localCasinoHostBytecode,
    [token, routerAddress],
  );
  const vault = (await publicClient.readContract({
    address: host,
    abi: localCasinoHostAbi,
    functionName: 'vault',
  })) as Address;
  const coinflip = await deployContract(
    publicClient,
    deployer,
    coinflipGameAbi,
    coinflipGameBytecode,
  );

  const registerHash = await deployer.writeContract({
    address: host,
    abi: localCasinoHostAbi,
    functionName: 'registerGame',
    args: [coinflip, 'CoinflipGame'],
    chain,
    account: deployerAccount,
  });
  await publicClient.waitForTransactionReceipt({ hash: registerHash });

  for (const [recipient, amount] of [
    [deployerAccount.address, PLAYER_FUNDS],
    [vault, VAULT_LIQUIDITY],
  ] as const) {
    const hash = await deployer.writeContract({
      address: token,
      abi: localTestTokenAbi,
      functionName: 'mint',
      args: [recipient, amount],
      chain,
      account: deployerAccount,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  // The host requests VRF as its own router client; requests are paid from
  // this prepaid balance.
  await verifyNetwork.depositLocalVrfBalance({
    publicClient,
    walletClient: deployer,
    routerAddress,
    account: host,
    amount: VRF_CLIENT_DEPOSIT_ETH,
  });

  const deployedPath = resolve(here, 'deployed.json');
  let dynamicGames: DeployedGame[] = [];
  let initialScanDone = false;
  const writeDeployed = () => {
    const deployed = {
      chainId,
      rpcUrl: RPC_URL,
      host,
      vault,
      token,
      router: routerAddress,
      games: [
        { name: 'CoinflipGame', address: coinflip },
        ...dynamicGames.map(({ name, address }) => ({ name, address })),
      ],
    };
    writeFileSync(deployedPath, `${JSON.stringify(deployed, null, 2)}\n`);
    console.log(`[local-node] Wrote ${deployedPath}`);
    console.log('[local-node] Deployment:', deployed);
  };

  // deployed.json is written only after the initial contracts/ scan so the
  // harness never sees a version missing the games already in the folder.
  await watchGameContracts({
    contractsDir: resolve(here, '../contracts'),
    deployGame: (abi, bytecode) => deployContract(publicClient, deployer, abi, bytecode),
    registerGame: async (address, name) => {
      const hash = await deployer.writeContract({
        address: host,
        abi: localCasinoHostAbi,
        functionName: 'registerGame',
        args: [address, name],
        chain,
        account: deployerAccount,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    },
    onGamesChanged: games => {
      dynamicGames = games;
      if (initialScanDone) writeDeployed();
    },
  });
  initialScanDone = true;
  writeDeployed();

  verifyNetwork.startLocalVerifyNetworkNode({
    publicClient,
    walletClient: nodeWallet,
    routerAddress,
  });
  console.log('[local-node] Ready. The harness picks the deployment up automatically.');

  const shutdown = () => {
    chainProcess?.kill();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main().catch(error => {
  console.error('[local-node] Failed:', error);
  process.exit(1);
});
