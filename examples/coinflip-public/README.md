# Coinflip — example casino game

Reference guest UI for `CoinflipGame.sol`, showing how to build a Chain.wtf casino
game: the host loads it inside an iframe and drives it entirely over the
`@chain/casino-sdk` bridge — no wallet code in the game. The UI mirrors the
production coinflip: the chain.wtf design tokens and card recipes live in
`src/styles/` (plain CSS, no framework), the sidebar carries the bet controls and
the gradient BET CTA, and the canvas renders the backdrop art, the CSS-3D coin
grid, the recent-results rail, the profit/win-chance stats strip and the WIN
celebration overlay.

## Run

```sh
vp dev        # serves http://localhost:3100 (joins the root `bun dev` orchestrator too)
vp build      # static bundle in dist/
```

Point the game's `url` in the Convex `game_details` data at the served origin
(dev: `http://localhost:3100/`). The host fetches `game.manifest.json` from that
origin (served from `public/`, CORS open) and embeds the page.

## How a round works

1. Player picks heads/tails, coin count (1–10) and required hits; the bet is
   ABI-encoded as `(bool pickHeads, uint8 coinCount, uint8 minWins)` and sent via
   `hostApi.openSession` (instant game — no `submitAction`).
2. The coins tumble while the snapshot pushes catch up; once the session row for
   our `sessionKey` turns terminal, the settled `gameState` is decoded and each
   coin toss-lands on randomness bit `i` (`1` = heads), exactly like
   `_countHeads` on-chain.
3. After the landing animation, `hostApi.revealOutcome` releases the withheld
   payout into the host's balance displays, the result badges + WIN overlay show,
   and the round lands in the history rail. The Fast Mode toggle skips the
   animation and reveals the instant the outcome is known.

`src/lib/coinflip.ts` mirrors the contract's combinatorics (win ways, 98% RTP payout
floor math) for the multiplier/probability preview and the client-side risk-limit
check against `casino.maxAllowedReservedProfit` — the chain stays authoritative.
