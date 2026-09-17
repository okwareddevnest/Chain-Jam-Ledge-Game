import { useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_CONFIG,
  fetchLocalDeployedContracts,
  loadConfig,
  saveConfig,
  type LocalDeployedContracts,
  type SimulatorConfig,
} from './config';
import type { GameIntegration } from './casino';
import { createSimulatorRuntime, type SimulatorRuntime } from './runtime';
import { GameViewport } from './GameViewport';
import { SetupPanel } from './SetupPanel';
import ChainSmallLogo from './ChainSmallLogo';

const PANEL_COLLAPSED_KEY = 'casino-sdk-simulator.panel-collapsed';

export function App() {
  const [config, setConfig] = useState<SimulatorConfig>(() => loadConfig());
  const [detected, setDetected] = useState<LocalDeployedContracts | undefined>(undefined);
  const [appliedConfig, setAppliedConfig] = useState<SimulatorConfig | undefined>(undefined);
  const [runtime, setRuntime] = useState<SimulatorRuntime | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(PANEL_COLLAPSED_KEY);
    if (stored !== null) return stored === 'true';
    // Phones need the game full-bleed; open the panel only when asked.
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  });
  // The event feed reads the lags through these getters, so slider changes
  // apply live without tearing the harness down.
  const lagsRef = useRef({ flashblockLagMs: 100, indexerLagMs: 600 });
  lagsRef.current = {
    flashblockLagMs: config.flashblockLagMs,
    indexerLagMs: config.indexerLagMs,
  };

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  useEffect(() => {
    localStorage.setItem(PANEL_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  // Phone loads should not inherit an expanded desktop panel — that steals
  // width and letterboxes the game. Collapse whenever we land on a narrow viewport.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const collapseOnPhone = () => {
      if (mq.matches) setCollapsed(true);
    };
    collapseOnPhone();
    mq.addEventListener('change', collapseOnPhone);
    return () => mq.removeEventListener('change', collapseOnPhone);
  }, []);

  const configRef = useRef(config);
  configRef.current = config;

  // Under the one-command flow the harness page is usually up before the
  // local node finishes deploying, so poll until the addresses appear, then
  // fill the panel and start the harness automatically. Polling keeps going
  // afterwards so games dropped into contracts/ show up in the picker live.
  useEffect(() => {
    let cancelled = false;
    let autoFilled = false;
    const poll = async () => {
      const contracts = await fetchLocalDeployedContracts();
      if (cancelled || !contracts) return;
      setDetected(previous =>
        previous && JSON.stringify(previous) === JSON.stringify(contracts) ? previous : contracts,
      );
      if (autoFilled) return;
      autoFilled = true;
      const current = configRef.current;
      const merged: SimulatorConfig = {
        ...current,
        // The local node owns the host infrastructure and redeploys it per
        // boot, so its fresh addresses always replace saved ones; the game
        // address stays the developer's choice once set.
        proxy: contracts.host,
        token: contracts.token,
        liquidityVault: contracts.vault,
        rpcUrl:
          current.rpcUrl === DEFAULT_CONFIG.rpcUrl && contracts.rpcUrl
            ? contracts.rpcUrl
            : current.rpcUrl,
        gameAddress: current.gameAddress || (contracts.games[0]?.address ?? ''),
        gameName:
          current.gameName === 'SimulatedGame' && contracts.games[0]
            ? contracts.games[0].name
            : current.gameName,
      };
      setConfig(merged);
      setAppliedConfig(previous => previous ?? merged);
    };
    void poll();
    const interval = setInterval(() => void poll(), 2_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Creating the runtime inside the effect (and stopping it in the cleanup)
  // keeps StrictMode's dev double-mount from killing a live event feed.
  useEffect(() => {
    if (!appliedConfig) return;
    let cancelled = false;
    let created: SimulatorRuntime | undefined;
    setStarting(true);
    setError(undefined);
    void createSimulatorRuntime(appliedConfig, {
      flashblockLagMs: () => lagsRef.current.flashblockLagMs,
      indexerLagMs: () => lagsRef.current.indexerLagMs,
    })
      .then(next => {
        if (cancelled) {
          next.stop();
          return;
        }
        created = next;
        setRuntime(next);
      })
      .catch((startError: unknown) => {
        if (!cancelled) {
          setError(startError instanceof Error ? startError.message : String(startError));
        }
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });
    return () => {
      cancelled = true;
      created?.stop();
      setRuntime(current => (current === created ? undefined : current));
    };
  }, [appliedConfig]);

  const start = () => setAppliedConfig({ ...config });

  // Derived from the applied config, not the live one — edits in the panel
  // (including half-typed URLs) only reach the frame on Start/Restart.
  const integration = useMemo<GameIntegration | undefined>(() => {
    if (!appliedConfig?.gameAddress || !appliedConfig.gameUrl) return undefined;
    return {
      slug: appliedConfig.gameName.toLowerCase(),
      gameAddress: appliedConfig.gameAddress,
      gameName: appliedConfig.gameName,
      name: appliedConfig.gameName,
      url: appliedConfig.gameUrl,
    };
  }, [appliedConfig]);

  const status = error
    ? `error: ${error}`
    : starting
      ? 'starting…'
      : runtime && integration
        ? `chain ${runtime.chainId} · ${runtime.tokenSymbol} · player ${runtime.account.address.slice(0, 8)}…`
        : 'not started — configure and start the harness';

  const setupPanel = (
    <SetupPanel
      config={config}
      onChange={setConfig}
      detected={detected}
      running={Boolean(runtime)}
      onApply={start}
      status={status}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Desktop rail — simulator chrome only; production lays the game out in-page. */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 transition-[width] duration-200 md:flex ${
          collapsed ? 'w-11' : 'w-80'
        }`}
      >
        <div
          className={`flex items-center gap-2 border-b border-neutral-800 p-2 ${
            collapsed ? 'flex-col' : 'justify-between'
          }`}
        >
          {collapsed ? (
            <ChainSmallLogo linesOnly className="h-4" />
          ) : (
            <div className="flex min-w-0 items-center gap-2 pl-1">
              <ChainSmallLogo className="h-5 w-auto shrink-0" />
              <h1 className="truncate text-sm font-semibold">Casino SDK simulator</h1>
            </div>
          )}
          <button
            type="button"
            aria-label={collapsed ? 'Expand setup panel' : 'Collapse setup panel'}
            className="cursor-pointer rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            onClick={() => setCollapsed(current => !current)}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
        {!collapsed && setupPanel}
      </aside>

      {/* Phone: setup as an overlay drawer so the iframe owns the whole viewport. */}
      {!collapsed && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close setup panel"
            className="absolute inset-0 bg-black/60"
            onClick={() => setCollapsed(true)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,100%)] flex-col border-r border-neutral-800 bg-neutral-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-800 p-2">
              <div className="flex min-w-0 items-center gap-2 pl-1">
                <ChainSmallLogo className="h-5 w-auto shrink-0" />
                <h1 className="truncate text-sm font-semibold">Casino SDK simulator</h1>
              </div>
              <button
                type="button"
                aria-label="Close setup panel"
                className="cursor-pointer rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                onClick={() => setCollapsed(true)}
              >
                «
              </button>
            </div>
            {setupPanel}
          </aside>
        </div>
      )}

      <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
        <button
          type="button"
          aria-label="Open setup panel"
          className="fixed top-2 left-2 z-30 cursor-pointer rounded-md border border-neutral-700 bg-neutral-900/90 px-2.5 py-1.5 text-xs text-neutral-200 backdrop-blur md:hidden"
          onClick={() => setCollapsed(false)}
        >
          Setup
        </button>
        {runtime && integration ? (
          // Same page chrome spacing as production's game route so
          // `availableHeight` (svh − top offset) matches chain.wtf.
          <div className="container mx-auto flex flex-col p-1 sm:p-6 sm:pb-10">
            <GameViewport
              key={`${integration.gameAddress}:${integration.url}:${runtime.chainId}`}
              runtime={runtime}
              integration={integration}
              walletStatus={config.walletStatus}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <p className="max-w-lg text-sm leading-relaxed text-neutral-400">
              Point the harness at a locally served game and a local chain, then start it. The game
              mounts in an iframe exactly like on chain.wtf: same bridge, same snapshot, same
              optimistic timing.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
