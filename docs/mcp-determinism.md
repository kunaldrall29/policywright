# MCP determinism map

How each policywright MCP tool behaves with respect to purity and
reproducibility. Agents and CI should rely on this map — do **not** claim
purity for tools that touch the network.

| Tool         | Pure?                            | Determinism contract                                                                                                                                                                                                              |
| ------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `synthesize` | **Yes**                          | Same `RecordedTx` + `SynthConfig` → identical artefacts (summary, spec, context-rule, Rust). No I/O beyond optional `outDir` writes.                                                                                              |
| `simulate`   | **Yes**                          | Same inputs as synthesize → identical scenario decisions and report. Built from the pure synthesizer + offline harness.                                                                                                           |
| `record`     | **No** (when fetching)           | Deterministic **per (hashes / simulation doc, chain state, RPC view)**. Replaying the same hashes after retention expiry yields `TX_NOT_FOUND`. Inline `recordedTx` / committed captures are network-free and fully reproducible. |
| `verify`     | **No** (when reading live chain) | Deterministic **per (emitted context-rule, on-chain snapshot / chain state)**. Fixture snapshots under `fixtures/verify/` make verify network-free and bit-stable in CI.                                                          |

## What verify is (and is not)

- **Is:** structural diff of emitted context rules + attached policy install
  params against an on-chain recon (or fixture standing in for that recon).
- **Is not:** the offline dry-run scenario self-check used by `npm run demo`
  (`pipelineVerifyScenarios`). That path stays demo/CLI-internal.

## Env / config

- `STELLAR_NETWORK` — default network when a tool omits `network`.
- `STELLAR_RPC_URL` — optional RPC override (never commit secrets).
- The server never reads signing keys and never submits transactions.
