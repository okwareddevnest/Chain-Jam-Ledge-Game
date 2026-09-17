/**
 * Deploys LedgeGame.sol to a real network.
 *
 * Config comes from the environment and is validated before anything is compiled or sent.
 * Nothing here is interactive and nothing is hardcoded: no key, no RPC, no chain.
 *
 *   LEDGE_RPC_URL        JSON-RPC endpoint to deploy against        (required)
 *   LEDGE_DEPLOYER_KEY   0x-prefixed private key of the deployer    (required)
 *   LEDGE_CONFIRM        must equal the chain id to actually send   (required to broadcast)
 *
 * Without LEDGE_CONFIRM the script compiles, simulates and reports cost, then stops.
 * That dry run is the default so a mainnet deploy can never happen by accident.
 *
 *   npm run deploy:ledge          # dry run: compile + simulate + estimate
 *   LEDGE_CONFIRM=84532 npm run deploy:ledge   # broadcast to Base Sepolia
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import solc from 'solc';
import { createPublicClient, createWalletClient, formatEther, http, type Chain, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const CONTRACTS = join(REPO_ROOT, 'simulator', 'contracts');

/**
 * Networks this game is expected to live on. Passing the real chain definition (rather
 * than null) is what gives viem correct EIP-1559 fee handling and the right chainId in
 * the signed transaction on an L2. Anything else — a local node, say — falls back to null,
 * where viem reads the chainId off the RPC.
 */
const CHAINS: Record<number, { chain: Chain; explorer: string }> = {
  [base.id]: { chain: base, explorer: 'https://basescan.org' },
  [baseSepolia.id]: { chain: baseSepolia, explorer: 'https://sepolia.basescan.org' },
};

class ConfigError extends Error {}

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigError(`${name} is not set. See the header of scripts/deploy-ledge.ts.`);
  return value;
};

const readConfig = () => {
  const rpcUrl = requireEnv('LEDGE_RPC_URL');
  const deployerKey = requireEnv('LEDGE_DEPLOYER_KEY');

  if (!/^0x[0-9a-fA-F]{64}$/.test(deployerKey)) {
    throw new ConfigError('LEDGE_DEPLOYER_KEY must be a 0x-prefixed 32-byte hex private key.');
  }
  if (!/^https?:\/\//.test(rpcUrl)) {
    throw new ConfigError('LEDGE_RPC_URL must be an http(s) URL.');
  }

  return { rpcUrl, deployerKey: deployerKey as Hex, confirm: process.env.LEDGE_CONFIRM?.trim() };
};

const compile = (): { abi: unknown[]; bytecode: Hex } => {
  const source = readFileSync(join(CONTRACTS, 'LedgeGame.sol'), 'utf8');
  const iface = readFileSync(join(CONTRACTS, 'ICasinoGameV2.sol'), 'utf8');

  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources: { 'LedgeGame.sol': { content: source } },
        settings: {
          viaIR: true,
          optimizer: { enabled: true, runs: 200 },
          outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
        },
      }),
      {
        import: (path: string) =>
          path.endsWith('ICasinoGameV2.sol') ? { contents: iface } : { error: 'File not found' },
      },
    ),
  ) as {
    errors?: Array<{ severity: string; formattedMessage: string }>;
    contracts: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
  };

  const errors = (output.errors ?? []).filter(entry => entry.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`Compilation failed:\n${errors.map(e => e.formattedMessage).join('\n')}`);
  }

  const artifact = output.contracts['LedgeGame.sol']?.LedgeGame;
  if (!artifact) throw new Error('LedgeGame not found in compiler output.');

  return { abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` as Hex };
};

const main = async (): Promise<void> => {
  const { rpcUrl, deployerKey, confirm } = readConfig();

  const account = privateKeyToAccount(deployerKey);
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  const known = CHAINS[chainId];

  console.log(`network      ${known?.chain.name ?? 'unknown'} (chainId ${chainId})`);
  console.log(`deployer     ${account.address}`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`balance      ${formatEther(balance)} ETH`);

  // Check funding before estimating: estimateGas on an empty account fails with an
  // "exceeds allowance" dump of the whole bytecode, which tells nobody anything.
  if (balance === 0n) {
    throw new ConfigError(
      `Deployer ${account.address} holds no ETH on ${known?.chain.name ?? `chain ${chainId}`}.` +
        (chainId === baseSepolia.id
          ? '\nFund it from a Base Sepolia faucet, e.g. https://www.alchemy.com/faucets/base-sepolia'
          : ''),
    );
  }

  const { abi, bytecode } = compile();
  console.log(`bytecode     ${(bytecode.length - 2) / 2} bytes`);

  let gas: bigint;
  try {
    gas = await publicClient.estimateGas({ account, data: bytecode });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new Error(`Gas estimation failed against ${rpcUrl}: ${detail}`);
  }

  const fees = await publicClient.estimateFeesPerGas();
  const cost = gas * (fees.maxFeePerGas ?? 0n);
  console.log(`gas          ${gas} @ ${formatEther(fees.maxFeePerGas ?? 0n)} ETH  =>  ~${formatEther(cost)} ETH`);

  if (balance < cost) {
    throw new Error(
      `Deployer holds ${formatEther(balance)} ETH but the deployment needs about ${formatEther(cost)} ETH.`,
    );
  }

  if (confirm !== String(chainId)) {
    console.log(
      `\nDRY RUN — compiled and simulated, nothing sent.\n` +
        `To broadcast, re-run with LEDGE_CONFIRM=${chainId}.`,
    );
    return;
  }

  const chain = known?.chain ?? null;
  const walletClient = createWalletClient({ account, transport: http(rpcUrl), chain });
  const hash = await walletClient.deployContract({ abi, bytecode, account, chain });
  console.log(`\ntx           ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new Error(`Deployment reverted (status ${receipt.status}).`);
  }

  console.log(`address      ${receipt.contractAddress}`);
  console.log(`gas used     ${receipt.gasUsed}`);
  if (known) console.log(`explorer     ${known.explorer}/address/${receipt.contractAddress}`);

  const outDir = join(REPO_ROOT, 'deployments');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${chainId}.json`);
  writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        chainId,
        network: known?.chain.name ?? null,
        contract: 'LedgeGame',
        address: receipt.contractAddress,
        deployer: account.address,
        transactionHash: hash,
        blockNumber: Number(receipt.blockNumber),
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`recorded     ${outFile}`);
  console.log(
    `\nNext: send this address to the Chain.wtf team. Until CasinoGameFacet whitelists it,\n` +
      `openSession reverts with CasinoGameFacet__GameNotWhitelisted.`,
  );
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error instanceof ConfigError ? `Config error: ${message}` : `Deploy failed: ${message}`);
  process.exitCode = 1;
});
