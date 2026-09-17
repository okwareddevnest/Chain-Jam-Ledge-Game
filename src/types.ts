export type HexString = `0x${string}`;

export type CasinoGameManifestV1 = {
  schemaVersion: 1;
  gameId: string;
  apiVersion: 1;
  defaultLocale: string;
  locales: Record<
    string,
    {
      name: string;
      description?: string;
    }
  >;
  assets?: {
    iconUrl?: string;
    coverUrl?: string;
  };
};

export type RandomnessRequestV1 = {
  /** Session step that made the request; strictly increasing, multi-step games make several. */
  nonce: string;
  requestId: HexString;
  randomness?: HexString;
  fulfilled: boolean;
  /** Hash of the VRF fulfillment transaction; absent until fulfilled (or on older hosts). */
  transactionHash?: HexString;
};

export type VrfVerificationChecksV1 = {
  /** The ECVRF proof verifies under the signing enclave's key for `alpha` == `requestId`. */
  vrfProofValid: boolean;
  /** The proof's output equals the router's word and the recorded request randomness, if present. */
  vrfBetaMatchesRandomness: boolean;
  /** The EIP-712 `Fulfillment(requestId, proofCommitment)` signature recovers as the router recovers it. */
  enclaveSignatureValid: boolean;
  /** The signer is the fulfiller the router assigned: the request echoed at fulfillment hashes to `requestId`. */
  signerMatchesFulfiller: boolean;
};

/** The router request as echoed by the fulfilling node; hashing it reproduces `requestId`. */
export type RandomnessRequestEchoV1 = {
  consumer: HexString;
  sequence: string;
  fulfiller: HexString;
  assignedAt: string;
  fee: string;
  gasPrice: string;
  callbackGasLimit: string;
  callbackData: HexString;
};

export type RandomnessRequestVerificationV1 = RandomnessRequestV1 & {
  /**
   * Fulfillment artifacts read from the router's `RandomnessFulfilled` log,
   * so the result can be re-verified independently of the host's verdict.
   */
  artifacts?: {
    randomness: HexString;
    proof: [HexString, HexString, HexString, HexString];
    enclaveSignature: HexString;
    /** VRF input; always equals `requestId`. */
    alpha: HexString;
  };
  /** The request echoed in the fulfillment calldata; absent when it could not be decoded. */
  request?: RandomnessRequestEchoV1;
  /** Enclave address assigned to fulfill the request (from `request`). */
  fulfiller?: HexString;
  /** The signing enclave's secp256k1 key as [x, y]; nodes register under its address. */
  nodePublicKey?: [HexString, HexString];
  checks?: VrfVerificationChecksV1;
  /** True when every check passed. */
  valid?: boolean;
};

/** Mirrors the `SessionPhase` enum in `ICasinoGameV2.sol`. */
export const SessionPhase = {
  NONE: 0,
  WAITING_RANDOMNESS: 1,
  WAITING_PLAYER_ACTION: 2,
  SETTLED: 3,
  FORFEITED: 4,
  CANCELLED: 5,
} as const;

export type SessionPhase = (typeof SessionPhase)[keyof typeof SessionPhase];

export type SessionPhaseName = keyof typeof SessionPhase;

export type RandomnessVerificationV1 = {
  /** False when the environment does not use Verify Network VRF. */
  supported: boolean;
  chainId: number;
  routerAddress?: HexString;
  requests: RandomnessRequestVerificationV1[];
};

export type HostSnapshotV1 = {
  apiVersion: number;
  integration: {
    chainId: number;
    slug: string;
    gameAddress: `0x${string}`;
    manifest: CasinoGameManifestV1;
  };
  wallet: {
    address?: `0x${string}`;
    smartVaultAddress?: `0x${string}`;
    status: 'ready' | 'disconnected' | 'setup-required' | 'session-key-mismatch';
  };
  token: {
    symbol?: string;
    decimals?: number;
    iconUrl?: string;
  };
  balances: {
    smartVaultBalance?: string;
  };
  /**
   * Live platform risk limits for betting against the house vault. Games
   * should derive their maximum bet from these (see `computeMaxWager`) so
   * players can't submit wagers the casino facet would reject. Absent on
   * hosts that predate this field — treat as "unknown", not "unlimited".
   */
  casino?: {
    /** Vault `totalAssets` minus committed liquidity, in token base units. */
    availableLiquidity?: string;
    /** Per-bet risk ceiling as basis points of `availableLiquidity`. */
    maxBetRiskBps?: number;
    /**
     * Largest reserved profit (worst-case payout minus wager) a single bet
     * may carry right now: `availableLiquidity * maxBetRiskBps / 10000`.
     * `openSession` reverts with `BetRiskExceedsLimit` when the game's
     * quoted `maxReservedProfit` exceeds it.
     */
    maxAllowedReservedProfit?: string;
    /**
     * Absolute wager ceiling for this game in token base units, when the
     * platform has configured one. Unset or `'0'` means no ceiling.
     */
    maxBetAmount?: string;
  };
  sessions: {
    items: Array<{
      sessionId: string;
      sessionKey: string;
      gameAddress: `0x${string}`;
      /** Compare against `SessionPhase`, e.g. `phase === SessionPhase.SETTLED`. */
      phase?: number;
      phaseName?: SessionPhaseName;
      wager?: string;
      /**
       * Total escrowed stake — `wager` plus mid-session increases (e.g. a
       * blackjack double). Absent on older hosts and on sessions from before
       * `CasinoSessionEscrowUpdated` existed; fall back to `wager`.
       */
      stake?: string;
      payout?: string;
      isSettled: boolean;
      openedAt?: number;
      settledAt?: number;
      lastEventTimestamp: number;
      raw: {
        gameData?: HexString;
        gameState?: HexString;
        /** First fulfilled VRF word; multi-step games get the full list below. */
        randomness?: HexString;
        requestId?: HexString;
        randomnessRequests?: RandomnessRequestV1[];
        /** Hash of the transaction that opened the session; absent on older hosts. */
        openTransactionHash?: HexString;
        /** Hash of the transaction that settled the session; absent until settled. */
        settleTransactionHash?: HexString;
      };
    }>;
  };
  ui: {
    locale: string;
    theme: 'light' | 'dark' | 'system';
    viewport?: {
      /**
       * Height in px from the top of the game's iframe to the bottom edge of
       * the visible screen, before the user scrolls. Excludes host chrome
       * overlaying the viewport bottom (e.g. the mobile navigation bar).
       * Layouts that want their primary action at the screen edge should size
       * the content above it to `availableHeight` minus the action's own
       * height.
       */
      availableHeight: number;
    };
  };
};

export type HostApiV1 = {
  reportContentSize?(input: { minHeight: number }): Promise<void>;
  openSession(input: {
    wager: string;
    gameData: HexString;
    /** @deprecated Ignored: the casino facet requests randomness itself. */
    randomnessRequestData?: HexString;
  }): Promise<{ sessionKey: string; transactionHash: HexString }>;
  submitAction(input: {
    sessionId: string;
    actionData: HexString;
    /** @deprecated Ignored: the casino facet requests randomness itself. */
    randomnessRequestData?: HexString;
    approvalAmount?: string;
  }): Promise<{ transactionHash: HexString }>;
  cancelStuckRandomness(input: { sessionId: string }): Promise<{ transactionHash: HexString }>;
  revealOutcome(input: { sessionId: string }): Promise<void>;
  /** Optional — feature-detect. Verifies every VRF fulfillment of a session. */
  getRandomnessVerification?(input: { sessionId: string }): Promise<RandomnessVerificationV1>;
};

export type GuestApiV1 = {
  setState(snapshot: HostSnapshotV1 | null): Promise<void>;
};

export type CasinoGameManifestValidationResult =
  | {
      ok: true;
      manifest: CasinoGameManifestV1;
    }
  | {
      ok: false;
      reason: string;
    };

export type GameManifestLocale = {
  locale: string;
  name: string;
  description?: string;
};

export type GameManifestMetadata = {
  locale: string;
  name: string;
  description?: string;
  iconUrl?: string;
  coverUrl?: string;
};
