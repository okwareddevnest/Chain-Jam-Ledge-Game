# LEDGE — how it fits together

Three diagrams: where a bet goes, what the UI is doing while it waits, and which
parts you have to trust.

## A bet, end to end

The guest holds no wallet and signs nothing. It asks the host to open a session, then
waits for the chain to tell it what happened.

```mermaid
sequenceDiagram
    autonumber
    participant P as Player
    participant G as LEDGE guest<br/>(sandboxed iframe)
    participant H as chain.wtf host
    participant C as CasinoGameFacet
    participant L as LedgeGame.sol
    participant V as VRF

    P->>G: load 5 coins, press Drop
    G->>H: openSession(wager, abi(uint8[5]))
    H->>C: signed tx
    C->>L: quoteCaps / quoteRiskParams
    L-->>C: caps, maxPayout, probabilityWad
    C->>C: commit portfolio risk, pull wager
    C->>L: onSessionStart(ctx)
    L-->>C: reserve profit, WAITING_RANDOMNESS
    C->>V: request randomness
    H-->>G: snapshot: phase WAITING_RANDOMNESS
    V-->>C: bytes32 randomness
    C->>L: onRandomness(ctx, randomness)
    L-->>C: toppled lanes, payout, SETTLED
    C->>C: payout <= escrow + reserve, then pay
    H-->>G: snapshot: SETTLED + gameState
    G->>G: decode gameState, play the cascade
    G->>H: revealOutcome(sessionId)
    H-->>P: balance updates once the animation lands
```

`revealOutcome` matters: until it is called the host hides the payout from its own balance
display, so the top bar cannot spoil a result the animation has not reached yet.

## What the UI is doing

One round, one state machine. The demo path exists because the jam requires the game to
be playable standalone, and the guest can never sign a real bet on its own.

```mermaid
stateDiagram-v2
    [*] --> idle

    idle --> opening: drop() — latched, one bet only
    opening --> waiting: host accepted, sessionKey known
    opening --> error: rejected, or 45s with no answer
    opening --> revealing: demo resolves locally

    waiting --> revealing: session row reaches SETTLED
    waiting --> error: FORFEITED / CANCELLED
    waiting --> waiting: 30s — offer Recover the bet

    revealing --> settled: cascade finishes, revealOutcome sent

    settled --> idle: set up the next drop
    error --> idle: set up the next drop

    note right of opening
        A synchronous latch blocks a second bet
        in the same tick. Without it three clicks
        charged three wagers.
    end note
```

## What you have to trust

The contract decides the outcome. The TypeScript mirror only re-derives it so the
animation can replay what already happened — and `parity.test.ts` holds the two together
across all 126 allocations and 150 random seeds.

```mermaid
flowchart LR
    subgraph chain["On chain — authoritative"]
        SOL["LedgeGame.sol<br/>rejection sampler<br/>exact integer paytable"]
        VRF["Verifiable randomness"]
        VRF --> SOL
    end

    subgraph client["In the browser — replay only"]
        TS["ledge.ts<br/>same sampler, same constants"]
        UI["Board cascade"]
        TS --> UI
    end

    SOL -- "gameState bytes" --> UI
    SOL -. "must agree" .-> TS
    TS -. "parity.test.ts<br/>126 allocations x 150 seeds" .-> SOL

    style chain fill:#f5f4f1,stroke:#8a867e
    style client fill:#ffffff,stroke:#d6d2ca
```

If those two ever disagreed, the game would show one result and pay another. That is the
single failure this project guards hardest against.

## The numbers, in one place

| | |
| --- | --- |
| Prizes | `1x, 2x, 5x, 15x, 50x` of the full stake |
| Topple thresholds | `72000, 36000, 14400, 4800, 1440` over `375000` per coin |
| Invariant | `prize x threshold = 72000` on every lane |
| Declared RTP | **96.00%**, identical for all 126 allocations |
| Worst-case payout | 73x — under the 100x heavy-tail threshold, so that reserve path never engages |
| Randomness | 3-byte draws, reject `>= 16500000`, then `% 375000`; re-hash the seed when it runs out |

Full derivation: [DESIGN.md](./DESIGN.md).
