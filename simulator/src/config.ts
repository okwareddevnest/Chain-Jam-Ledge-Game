import type { Address, Hex } from 'viem';

export type WalletStatusOverride = 'ready' | 'disconnected' | 'setup-required';

export type SimulatorConfig = {
  /** Origin the game iframe is served from, e.g. http://localhost:3100 */
  gameUrl: string;
  rpcUrl: string;
  /** EOA that plays; must hold the wagered token. Defaults to dev-mnemonic account #0. */
  playerPrivateKey: Hex;
  /** LocalCasinoHost address — the harness stand-in for the diamond proxy. */
  proxy: Address | '';
  liquidityVault: Address | '';
  token: Address | '';
  gameAddress: Address | '';
  gameName: string;
  /** Simulated latency of the indexed session feed. */
  indexerLagMs: number;
  /** Simulated latency of the flashblock event push. */
  flashblockLagMs: number;
  /** Lets game developers exercise their non-ready wallet UI states. */
  walletStatus: WalletStatusOverride;
};

// Hardhat/Anvil default mnemonic account #0 — the local-node deployment mints
// the test token to it.
export const DEFAULT_PLAYER_PRIVATE_KEY: Hex =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

export const DEFAULT_CONFIG: SimulatorConfig = {
  gameUrl: 'http://localhost:3100',
  rpcUrl: 'http://127.0.0.1:8545',
  playerPrivateKey: DEFAULT_PLAYER_PRIVATE_KEY,
  proxy: '',
  liquidityVault: '',
  token: '',
  gameAddress: '',
  gameName: 'SimulatedGame',
  indexerLagMs: 600,
  flashblockLagMs: 100,
  walletStatus: 'ready',
};

const STORAGE_KEY = 'casino-sdk-simulator.config';

export function loadConfig(): SimulatorConfig {
  let stored: Partial<SimulatorConfig> = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<SimulatorConfig>;
  } catch {
    stored = {};
  }
  const config = { ...DEFAULT_CONFIG, ...stored };

  const params = new URLSearchParams(location.search);
  const game = params.get('game');
  if (game) config.gameUrl = game;
  const rpc = params.get('rpc');
  if (rpc) config.rpcUrl = rpc;
  const gameAddress = params.get('gameAddress');
  if (gameAddress) config.gameAddress = gameAddress as Address;
  return config;
}

export function saveConfig(config: SimulatorConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export type LocalDeployedContracts = {
  host: Address;
  vault: Address;
  token: Address;
  rpcUrl?: string;
  games: Array<{ name: string; address: Address }>;
};

/**
 * Reads local-node/deployed.json (written by `npm run local-node`) served by
 * the vite plugin. Absent (404) until the local node has deployed — the panel
 * then relies on manually entered addresses.
 */
export async function fetchLocalDeployedContracts(): Promise<LocalDeployedContracts | undefined> {
  try {
    const response = await fetch('/__local-contracts.json');
    if (!response.ok) return undefined;
    const raw = (await response.json()) as Partial<LocalDeployedContracts>;
    if (!raw.host || !raw.vault || !raw.token) return undefined;
    return {
      host: raw.host,
      vault: raw.vault,
      token: raw.token,
      rpcUrl: raw.rpcUrl,
      games: raw.games ?? [],
    };
  } catch {
    return undefined;
  }
}
