# Randomness verification (fairness / "verify" UI)

**Audience:** Agents and humans building the provably-fair / verify-randomness section of a casino game iframe.

**Applies to:** Any game that wants to (a) display the VRF words behind a session, (b) re-derive the outcome from them, and (c) show a cryptographic verdict that the words were generated fairly by Verify Network.

---

## Where the randomness comes from

The casino protocol requests randomness from **Verify Network** - a network of off-chain TEE (Trusted Execution Environment) nodes that run ECVRF logic (secp256k1, cipher suite `SECP256K1-SHA256-TAI`) while producing proofs of fairness. For every request the platform creates on-chain, the network publishes the random word, an ECVRF proof, and an EIP-712 signature from the fulfilling node's enclave key. The host app reads and verifies these artifacts; games render the result.

A session can make **several** randomness requests (multi-step games request one per step). Each request is identified by its `nonce` — the session step that made it — so nonces are strictly increasing but not consecutive (a coinflip's only request is nonce `"1"`).

## What players should understand

The verify view is for a player who just wants to know the game was not rigged. Lead with this story; keep hex, proofs, and explorer links as optional detail.

1. **The bet is public.** Opening the session is an on-chain transaction. Nobody can quietly rewrite it after the fact.
2. **The random number is not picked by the game.** The protocol asks Verify Network — independent TEE nodes — for a random word. The game, the host, and chain.wtf do not choose that word.
3. **The fulfilling node is not picked by anyone either.** When the request is created, the Verify Network router smart contract assigns a node deterministically. Nobody — not the game, not the player, not the node operators — chooses who rolls. Only that assigned enclave can fulfill; a signature from any other node is rejected.
4. **The node proves the word was generated fairly.** It publishes the word with a cryptographic proof and a signature from its enclave. Those artifacts are in the fulfillment transaction and anyone can re-check them.
5. **The outcome is just that word, run through fixed rules.** Same word + same game logic = same result, every time. If the displayed result does not match the word, the animation is wrong — the on-chain result is authoritative.
6. **The check runs in the player's own browser.** The host reads the on-chain artifacts and verifies them locally. A pass means the proofs checked out. Explorer links only prove a transaction exists; they are not the fairness verdict.

A session with several steps has one word per step. Show each step as its own check so the player can see which word produced which outcome.

### TEEs — the hardware lockbox

A **Trusted Execution Environment** is a sealed region of a processor (an _enclave_). Code and keys inside it cannot be read or changed by the machine's operator — not the node runner, not the OS, not chain.wtf. Verify Network nodes generate the random word _inside_ that enclave. The operator can request a word and publish the result; they cannot peek at the secret key or steer the output toward a particular outcome.

That is why the word is not "whatever the server rolled." The generator is hardware-isolated from everyone who might want to cheat, including the people running the node. _Which_ node runs is also closed: the router contract assigns the fulfiller at request time, so there is no room to shop for a friendlier node after the bet is in.

### Proofs — why you don't have to trust the node

Two artifacts travel with every word. Both are written on-chain and both are re-checked in the player's browser:

- **ECVRF proof** — a verifiable-random-function proof. It shows that _this_ word is the only valid output for (this node's public key + this request id). Anyone with the public key can check it; you cannot invent a different word that still verifies. That is `vrfProofValid` and `vrfBetaMatchesRandomness`.
- **Enclave signature** — an EIP-712 signature from the enclave's key, binding the word to this request. Recovering the signer and matching it to the assigned fulfiller is `enclaveSignatureValid` and `signerMatchesFulfiller`.

The router accepts a fulfillment only after recovering that signature to the node it assigned, so
the `RandomnessFulfilled` log in the fulfillment transaction is the router's own record of what it
accepted. A proof that fails to verify is exactly what the router's permissionless
`challengeFulfillment` takes — the same `request`, `proof` and `enclaveSignature` the host returns.

Together they answer: the word came from the assigned enclave, it was produced by the VRF (not chosen by hand), and it matches what the chain accepted at fulfillment. The raw hex of the proof is optional detail for curious players; the verdict is the thing to lead with.

## What the snapshot gives you

Each session item's `raw` block carries the request list:

```ts
raw: {
  gameData?: HexString;
  gameState?: HexString;
  randomness?: HexString;             // first fulfilled word (single-shot games: THE word)
  requestId?: HexString;              // latest request id
  randomnessRequests?: Array<{
    nonce: string;                    // session step that made the request ("1", "3", ...), strictly increasing
    requestId: HexString;
    randomness?: HexString;           // set once fulfilled
    fulfilled: boolean;
    transactionHash?: HexString;      // VRF fulfillment tx; set once fulfilled
  }>;
  openTransactionHash?: HexString;    // tx that opened the session (the bet)
  settleTransactionHash?: HexString;  // tx that settled the session; set once settled
}
```

The three transaction hashes back real block-explorer `/tx/` links (e.g. basescan). They prove a
transaction exists, not that the randomness is fair — keep the cryptographic verdict below as the
primary fairness signal and treat explorer links as secondary. All three are optional: older hosts
omit them, and sessions projected before the fields existed have none, so always fall back (e.g. to
an address link) when absent.

Use `randomnessRequests` for anything fairness-related; `raw.randomness` / `raw.requestId` are conveniences for single-request games. Re-derive outcomes with your game's `*FromRandomness` mirror of the contract logic and cross-check against the outcome decoded from `gameState`.

## Cryptographic verification

Call the host method (optional — **feature-detect**, older hosts don't have it):

```ts
if (host.getRandomnessVerification) {
  const verification = await host.getRandomnessVerification({ sessionId });
}
```

Returns `RandomnessVerificationV1`:

```ts
{
  supported: boolean;        // false on environments without Verify Network
  chainId: number;
  routerAddress?: HexString; // Verify Network router the artifacts were checked against
  requests: Array<RandomnessRequestV1 & {
    artifacts?: {            // from the router's RandomnessFulfilled log, for independent re-verification
      randomness: HexString;
      proof: [HexString, HexString, HexString, HexString];       // ECVRF [gammaX, gammaY, c, s]
      enclaveSignature: HexString;                                // EIP-712 Fulfillment(requestId, proofCommitment)
      alpha: HexString;                                           // VRF input == requestId
    };
    request?: {                            // the router request echoed in the fulfillment calldata
      consumer: HexString;                 //   (the casino randomness adapter)
      sequence: string;
      fulfiller: HexString;                //   the enclave the router assigned at request time
      assignedAt: string;
      fee: string;
      gasPrice: string;
      callbackGasLimit: string;
      callbackData: HexString;
    };
    fulfiller?: HexString;                 // assigned enclave address (from `request`)
    nodePublicKey?: [HexString, HexString]; // the signing enclave's secp256k1 key [x, y]
    checks?: {
      vrfProofValid: boolean;              // ECVRF proof verifies under the signing key for alpha == requestId
      vrfBetaMatchesRandomness: boolean;   // proof output == router word == recorded word (if present)
      enclaveSignatureValid: boolean;      // EIP-712 signature recovers as the router recovers it
      signerMatchesFulfiller: boolean;     // signer == assigned enclave (echoed request hashes to requestId)
    };
    valid?: boolean;                       // all four checks passed
  }>;
}
```

The router keeps no per-request state beyond the id of an open request: the assigned request is
hashed into `requestId`, echoed back by the node in the fulfillment calldata, and forgotten once the
request closes. The host therefore reads the fulfillment transaction — the `RandomnessFulfilled`
log for `randomness`, `proof` and `enclaveSignature`, and the calldata for the echoed `request`
(accepted only when it hashes back to `requestId`, which is what makes its `fulfiller`
trustworthy). The enclave key comes from the signature itself: the router registers every node
under the address of its key, so a signature that recovers to the assigned fulfiller was made with
that node's key, and that is the key the ECVRF proof is checked under. No router view is read.

### Rendering rules

The host preserves the request's recorded `randomness` when present and compares it with the
router's word in `artifacts.randomness`. A mismatch makes `vrfBetaMatchesRandomness` and `valid`
false. If no word was recorded, the host fills it from the router. Malformed proofs return
`vrfProofValid: false`; fetch failures leave the checks absent. All reads use the requested chain,
including router discovery, whose cache is separate for each chain.

- `supported === false` → hide or grey out the verify section ("not available on this network"). Do not treat it as a failure.
- A request with `fulfilled: false` and no `checks` → still pending; render as waiting.
- A **fulfilled** request with `checks` absent → the host could not reach the chain; offer a retry. This is "could not verify", **not** "invalid".
- `valid === false` → render prominently as a failed verification, per failing check.
- Verification is on-demand and does a few RPC reads per request — call it when the user opens the verify view, not on every snapshot.

### Trust model

The host verifies client-side (in the user's browser) against on-chain data: it reads the fulfillment transaction and runs the ECVRF + EIP-712 checks locally. The `artifacts`, `request`, `fulfiller`, `nodePublicKey`, and `routerAddress` fields are returned precisely so anyone can repeat the verification without trusting the host's verdict — the inputs are all public chain data keyed by `requestId`, and `request` + `proof` + `enclaveSignature` are exactly the arguments of the router's permissionless `challengeFulfillment`, should a proof ever fail to verify.
