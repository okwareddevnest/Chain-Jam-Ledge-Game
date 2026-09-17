import type { LocalDeployedContracts, SimulatorConfig, WalletStatusOverride } from './config';

const inputClasses =
  'rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-indigo-500';
const labelClasses = 'text-xs text-neutral-400';

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono = true,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  invalid?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClasses}>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        className={`${inputClasses} ${mono ? 'font-mono text-xs' : ''} ${
          invalid ? 'border-red-500 focus:border-red-500' : ''
        }`}
        onChange={event => onChange(event.target.value.trim())}
      />
    </label>
  );
}

export function SetupPanel({
  config,
  onChange,
  detected,
  running,
  onApply,
  status,
}: {
  config: SimulatorConfig;
  onChange: (config: SimulatorConfig) => void;
  detected: LocalDeployedContracts | undefined;
  running: boolean;
  onApply: () => void;
  status: string;
}) {
  const set = <K extends keyof SimulatorConfig>(key: K, value: SimulatorConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <p className="text-xs leading-relaxed text-neutral-400">{status}</p>

      <Field
        label="Game URL"
        value={config.gameUrl}
        onChange={value => set('gameUrl', value)}
        placeholder="http://localhost:3100"
        mono={false}
        invalid={config.gameUrl !== '' && !isValidUrl(config.gameUrl)}
      />
      <Field
        label="RPC URL"
        value={config.rpcUrl}
        onChange={value => set('rpcUrl', value)}
        placeholder="http://127.0.0.1:8545"
        mono={false}
        invalid={config.rpcUrl !== '' && !isValidUrl(config.rpcUrl)}
      />
      <Field
        label="Player private key"
        value={config.playerPrivateKey}
        onChange={value => set('playerPrivateKey', value as SimulatorConfig['playerPrivateKey'])}
      />
      <label className="flex flex-col gap-1">
        <span className={labelClasses}>Game contract</span>
        {detected && detected.games.length > 0 ? (
          <select
            value={config.gameAddress}
            className={inputClasses}
            onChange={event => {
              const game = detected.games.find(g => g.address === event.target.value);
              onChange({
                ...config,
                gameAddress: event.target.value as SimulatorConfig['gameAddress'],
                gameName: game?.name ?? config.gameName,
              });
            }}
          >
            <option value="">— pick a deployed game —</option>
            {detected.games.map(game => (
              <option key={game.address} value={game.address}>
                {game.name} ({game.address.slice(0, 10)}…)
              </option>
            ))}
          </select>
        ) : (
          <input
            value={config.gameAddress}
            className={`${inputClasses} font-mono text-xs`}
            spellCheck={false}
            placeholder="0x… (your game contract)"
            onChange={event =>
              set('gameAddress', event.target.value.trim() as SimulatorConfig['gameAddress'])
            }
          />
        )}
      </label>
      <Field
        label="Casino host"
        value={config.proxy}
        onChange={value => set('proxy', value as SimulatorConfig['proxy'])}
        placeholder="0x…"
      />
      <Field
        label="Liquidity vault"
        value={config.liquidityVault}
        onChange={value => set('liquidityVault', value as SimulatorConfig['liquidityVault'])}
        placeholder="0x…"
      />
      <Field
        label="Token (ERC20)"
        value={config.token}
        onChange={value => set('token', value as SimulatorConfig['token'])}
        placeholder="0x…"
      />
      <label className="flex flex-col gap-1">
        <span className={labelClasses}>Wallet status (live)</span>
        <select
          value={config.walletStatus}
          className={inputClasses}
          onChange={event => set('walletStatus', event.target.value as WalletStatusOverride)}
        >
          <option value="ready">ready</option>
          <option value="disconnected">disconnected</option>
          <option value="setup-required">setup-required</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClasses}>Indexer lag: {config.indexerLagMs} ms (live)</span>
        <input
          type="range"
          min={0}
          max={5000}
          step={100}
          value={config.indexerLagMs}
          className="accent-indigo-500"
          onChange={event => set('indexerLagMs', Number(event.target.value))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClasses}>Flashblock lag: {config.flashblockLagMs} ms (live)</span>
        <input
          type="range"
          min={0}
          max={2000}
          step={50}
          value={config.flashblockLagMs}
          className="accent-indigo-500"
          onChange={event => set('flashblockLagMs', Number(event.target.value))}
        />
      </label>

      <button
        type="button"
        className="mt-1 cursor-pointer rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        onClick={onApply}
      >
        {running ? 'Restart harness' : 'Start harness'}
      </button>
    </div>
  );
}
