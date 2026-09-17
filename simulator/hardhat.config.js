// Minimal config for the in-memory chain behind `npm run local-node`. Hardhat
// is only used as a JSON-RPC node here — contracts compile via solc (see
// local-node/game-contracts.ts and scripts/compile-contracts.mjs).
export default { solidity: { version: '0.8.30' } };
