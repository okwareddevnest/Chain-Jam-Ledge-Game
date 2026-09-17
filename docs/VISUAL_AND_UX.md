# Visual & UX expectations for casino iframe games

## Runtime environment

- The main app embeds your game in an **iframe** with  
  `sandbox="allow-scripts allow-same-origin"`  
  (see `packages/web/src/features/casino/CasinoGameFrameClient.tsx`).  
  Design for a **single-page guest** that does not navigate away or open new windows unless you intentionally handle it (some flows may be limited by sandbox).
- The host owns wallet, Smart Vault, and signing. Your UI should assume **no direct wallet access** — reflect state from **`HostSnapshotV1`** only.

## Snapshot-driven UI

The host pushes:

- **`wallet`**, **`token`**, **`balances`** (e.g. Smart Vault balance as string)
- **`sessions`** — active/settled sessions with `raw.gameData`, `raw.gameState`, `raw.randomness`, phases
- **`ui.locale`**, **`ui.theme`** — **`light` | `dark` | `system`**

A polished guest should **respect `ui.theme` and `ui.locale`** where practical (CSS variables, `prefers-color-scheme` when `system`, or reading parent theme if you mirror tokens).

## Manifest (`game.manifest.json`)

Served at **`{gameBaseUrl}/game.manifest.json`** (same origin as the game). Validated by `validateCasinoGameManifest` in `/casino-sdk` (`src/manifest.ts`). Required fields include:

- **`presentation`**: `mode` (`full-iframe` | `embedded`), `hostPanels` toggles (whether the host shows open-session / history / status chrome — your layout can leave room accordingly).
- **`capabilities`**: `openSession` must be `true` for betting games; booleans for `submitAction`, `forfeitExpiredSession`, `cancelStuckRandomness`, `resize`.
- **Dynamic height**: call `observeGameContentSize(hostApi)` from `@chain/casino-sdk/guest` after the bridge resolves so the host can size the iframe to your current content.

Example: [`examples/coinflip-public/game.manifest.json`](./examples/coinflip-public/game.manifest.json).

**`gameId`**: Must match the canonical id derived from on-chain game registration (`canonicalCasinoGameId` in `manifest.ts` — strips trailing `Game`, lowercases, alphanumeric only). Host rejects mismatches.

## Alignment with main web app (if integrated in-repo later)

Internal rules for the Next.js app:

- User-visible strings go through **i18n** (`packages/web/src/i18n/locales/en.json`), not hardcoded English in JSX.
- Follow existing **shadcn / Tailwind** patterns if contributing UI inside `packages/web` (not required for a static guest bundle).

## Motion & accessibility

- Slot games often use heavy animation; prefer **reduced motion** via `prefers-reduced-motion` for accessibility.
- Ensure **tap targets** and contrast work at the height your game reports to the host.

## Assets

`manifest.assets.iconUrl` / `coverUrl` are optional; used in catalog/discovery when provided.
