# The `context-rule.json` schema

`context-rule.json` is the installable half of policywright's output: the
OpenZeppelin smart-account context rules (plus per-rule policy install
parameters) that authorize exactly the recorded flow. It is emitted by
`npm run demo` (to `out/`), by `npm run cli -- synth`, and is committed for
the real recorded sequence at
[`examples/live/context-rule.json`](../examples/live/context-rule.json).

Everything in the file targets a **pinned OZ release** and uses that release's
**real parameter names and units** — verified against source, never assumed
(see [FACTS.md](FACTS.md) §2.4–2.5). JSON has no comments, so every policy
binding carries its OZ file:line citation in a `paramsSource` field.

## Versioning

| Field           | Meaning                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| `schemaVersion` | Integer, currently **1**. Bumped on any change to the emitted shape; this file documents it. |

Consumers must reject documents whose `schemaVersion` they do not know.

## Version 1 — top level

| Field             | Type   | Meaning                                                                                                                                                              |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`   | int    | `1`.                                                                                                                                                                 |
| `generatedBy`     | string | `"policywright"`.                                                                                                                                                    |
| `target`          | object | The OZ release the shapes are verified against: `package`, `version` (`v0.7.2`), `commit`, and `installEntryPoint` (the `add_context_rule` signature + file:line).   |
| `source`          | object | Provenance of the recording: `network`, `recordedFrom` (`fixture \| rpc \| simulation`), `subject`, `ledger`, `sourceHashes` (every tx hash in the merged sequence). |
| `ledgerTimeBasis` | object | `estimatedSecsPerLedger` (5) and a note: every ledger-denominated value below was converted from configured seconds at this estimated rate.                          |
| `contextRules`    | array  | The installable rules — see below.                                                                                                                                   |
| `notes`           | array  | **Composition deltas**: unit conversions performed, constraints the stock policies cannot express, and install-time obligations. Read these before installing.       |
| `config`          | object | The `SynthConfig` the spec was synthesized with (reproducibility).                                                                                                   |

## Version 1 — one context rule

Each entry maps 1:1 onto the arguments of
`SmartAccount::add_context_rule(context_type, name, valid_until, signers, policies)`
(`packages/accounts/src/smart_account/mod.rs:238-248` at the `target` commit):

| Field              | Type        | Maps to        | Notes                                                                                                                                                                                                                                                     |
| ------------------ | ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextType`      | object      | `context_type` | Always `{ "type": "CallContract", "contract": "C..." }` — one rule binds exactly one contract; `Default` is never emitted (it would authorize everything).                                                                                                |
| `name`             | string      | `name`         | ≤ 20 **bytes** (OZ `MAX_NAME_SIZE`).                                                                                                                                                                                                                      |
| `validUntilLedger` | int \| null | `valid_until`  | A **ledger sequence**, not a Unix time. Computed from the recording's ledger + configured lifetime at ~5 s/ledger; **recompute from the live ledger head at install** (the recording ledger is in the past). `null` when the recording carries no ledger. |
| `signers`          | array       | `signers`      | Emitted empty: signers are the installer's decision. OZ requires ≥ 1 signer or policy per rule, and the stock `spending_limit` rejects when no signers authenticated — attach the account's signer(s).                                                    |
| `observedFns`      | array       | _(nothing)_    | Advisory. Rules cannot carry function names (matching is contract-level); function-level narrowing must live in a policy (Tranche 2).                                                                                                                     |
| `policies`         | array       | `policies` map | One entry per policy to attach — see below.                                                                                                                                                                                                               |

## Version 1 — one policy binding

`add_context_rule` takes policies as `Map<Address, Val>` (policy contract
address → install params). Addresses are unknown until the policy contracts
are deployed, so each binding is emitted as:

| Field           | Type   | Meaning                                                                                                              |
| --------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `policy`        | string | `"stock:spending_limit"` or `"custom:FrequencyLimitPolicy"`.                                                         |
| `address`       | null   | Fill in with the deployed policy contract's address at install.                                                      |
| `installParams` | object | The policy's **real** `AccountParams` field names, exactly as the target contract decodes them.                      |
| `paramsSource`  | string | The file:line (at the `target` commit) the param shape was verified against — the "comment" JSON cannot carry.       |
| `derivedFrom`   | object | (`stock:spending_limit` only) the observed asset, gross outflow, and configured window the params were derived from. |

The two shapes emitted today:

- **`stock:spending_limit`** — `{ "spending_limit": "<i128 as decimal string>",
"period_ledgers": <u32> }`
  (`packages/accounts/src/policies/spending_limit.rs:88-94`). Bound only to a
  token's `CallContract` rule where the recording's subject authorized a
  direct `transfer` of that token — the only context the stock policy meters;
  anything else panics `NotAllowed` (`spending_limit.rs:222-294`). Amounts are
  decimal strings because JSON numbers cannot carry i128.
- **`custom:FrequencyLimitPolicy`** — `{ "window_secs": <u64>, "max_calls":
<u32> }`, matching the generated Rust's `FrequencyLimitParams`
  (contracts/frequency-limit-policy/src/lib.rs, emitted by src/rust-policy.ts —
  the compiled crate's tests exercise exactly this shape). The generated
  contract is illustrative and unaudited — see the banner it carries.

## Why several rules, and why a token rule

An OZ context rule binds **one** contract, and `__check_auth` receives **one
`Context` per `require_auth` call** in the authorized tree (FACTS §2.5). The
recorded claim+swap flow therefore needs a rule per called contract **and** a
rule for the token whose `transfer` the subject authorized inside the swap —
that token rule is exactly where the stock spending limit attaches and meters
the outflow. Spend caps for assets with **no** subject-authorized direct
transfer cannot fire on-chain via the stock policy; they are recorded as
`DELTA` notes instead of being emitted in a shape the real contract would
reject, and remain enforced in the offline dry run.
