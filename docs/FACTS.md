# FACTS

The single source of truth for verified external facts: dependency versions,
contract IDs, and decoded on-chain/protocol shapes.

**Rules of this file.** Nothing here is asserted from memory. Every entry cites
a source that can be re-checked (a pinned file + line, a command, or a URL) and
the date it was verified. If you need a fact that is not here, verify it first,
then add it. If a fact here turns out to be wrong, correct it and note the
change — do not silently delete.

Dates are ISO (UTC). "Verified by" is the exact command or URL used.
Divergences between this repository's assumptions and these facts are tracked
in [RECONCILIATION.md](RECONCILIATION.md).

---

## GATE 1 — Toolchain

### 1.1 Versions

| Fact                                    | Value                                                                                   | Verified by                                                                     | Date       |
| --------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| Node.js (dev machine)                   | `v22.20.0`                                                                              | `node --version`                                                                | 2026-08-03 |
| npm                                     | `11.6.2`                                                                                | `npm --version`                                                                 | 2026-08-03 |
| stellar-cli latest stable release       | `v27.1.0` (published 2026-07-31, not prerelease)                                        | `GET /repos/stellar/stellar-cli/releases/latest`                                | 2026-08-03 |
| stellar-cli installed                   | `27.1.0 (8e402ea28202950b272fbabc34caad4d2f64fe87)` — upgraded from 26.0.0 this session | `brew upgrade stellar-cli && stellar --version`                                 | 2026-08-03 |
| stellar-cli install method              | Homebrew (`/opt/homebrew/Cellar/stellar-cli`)                                           | `which -a stellar; brew list --versions stellar-cli`                            | 2026-08-03 |
| `soroban-sdk` latest stable (crates.io) | `27.0.4` (2026-07-31)                                                                   | `GET https://crates.io/api/v1/crates/soroban-sdk`                               | 2026-08-03 |
| `@stellar/stellar-sdk` latest (npm)     | `16.2.0` (2026-07-29)                                                                   | `npm view @stellar/stellar-sdk version`                                         | 2026-08-03 |
| `@stellar/stellar-sdk` installed here   | `15.1.0` (package.json pins exact `15.1.0` since D1.1; was `^15.1.0`)                   | `node -p "require('./node_modules/@stellar/stellar-sdk/package.json').version"` | 2026-08-03 |
| rustc / cargo                           | `1.90.0` / `1.90.0` (Homebrew)                                                          | `rustc --version; cargo --version`                                              | 2026-08-03 |
| rustup targets installed                | `aarch64-apple-darwin`, `wasm32-unknown-unknown`, `wasm32v1-none`                       | `rustup target list --installed`                                                | 2026-08-03 |

**Version pins to use for generated/compiled Rust:** `soroban-sdk` must match
what OpenZeppelin's contracts pin — OZ v0.7.2 pins **`soroban-sdk = "26.1.0"`**
(workspace `Cargo.toml:55` in the OZ repo), NOT the crates.io latest 27.0.4.
Compiling against OZ v0.7.2 therefore means soroban-sdk 26.1.0.

### 1.2 `stellar contract build --verifiable`: does NOT exist

**No.** Verified three ways, 2026-08-03:

1. `stellar contract build --help` on installed 26.0.0 — no such flag.
2. `stellar contract build --help` on installed 27.1.0 (after upgrade) —
   `grep -ic verifiable` = 0.
3. The complete v27.1.0 help reference
   ([FULL_HELP_DOCS.md](https://raw.githubusercontent.com/stellar/stellar-cli/v27.1.0/FULL_HELP_DOCS.md),
   290,555 bytes) contains zero occurrences of "verifiable".

There is consequently no digest-pinned build image to record. What the CLI
_does_ provide toward reproducibility (v27.1.0
`cmd/soroban-cli/src/commands/contract/build.rs:615-684`): it remaps dependency
paths via `CARGO_BUILD_RUSTFLAGS=--remap-path-prefix=<cargo-home>/registry/src=`
and warns when `RUSTFLAGS`/`CARGO_ENCODED_RUSTFLAGS` would break remapping
("builds may not be reproducible").

### 1.3 Wasm build target: `wasm32v1-none`, selected by rustc version

Empirical, not assumed — `stellar contract build --print-commands-only` against
a minimal cdylib crate on both installed CLI versions emits:

```
cargo rustc … --crate-type=cdylib --target=wasm32v1-none --release
```

Selection logic, verified in v27.1.0 `build.rs:209-210, 718-740`:

| rustc version       | Target                                    |
| ------------------- | ----------------------------------------- |
| `< 1.82.0`          | `wasm32-unknown-unknown` (the old target) |
| `1.82.0 – <1.84.0`  | **rejected** (`Error::RustVersion`)       |
| `>= 1.84.0`         | `wasm32v1-none`                           |
| `== 1.91.0` exactly | **rejected** (`Error::RustVersion`)       |

Local rustc is 1.90.0 → `wasm32v1-none` (target already installed).

### 1.4 Compiling against soroban-sdk 26.1.0 — rustc and dependency pins (D1.3, verified 2026-08-03)

All empirical, from building `contracts/` on this machine:

- **`soroban-sdk` 26.1.0 declares `rust-version` 1.91.0** — cargo refuses to
  build it on the Homebrew rustc 1.90.0 (`error: rustc 1.90.0 is not supported
by ... soroban-sdk@26.1.0 requires rustc 1.91.0`). Combined with stellar-cli
  rejecting exactly 1.91.0 (§1.3), the working range is **rustc ≥ 1.92**.
  [contracts/rust-toolchain.toml](../contracts/rust-toolchain.toml) pins
  **1.97.1** (latest stable at verification) with the `wasm32v1-none` target.
  The pin is honored by rustup's shims (`~/.cargo/bin`), NOT by the Homebrew
  cargo — builds must run with `PATH="$HOME/.cargo/bin:$PATH"` (the deploy
  script does this).
- **Fresh lockfile resolution is broken upstream**: `soroban-env-host` 26.1.3
  declares `ed25519-dalek = ">=2.0.0"` (unbounded), which now resolves to
  3.0.0 — and its changed `rand_core`/`CryptoRng` API fails to compile
  env-host's own testutils (`SigningKey::generate(chacha)`, E0277). Fixed by
  `cargo update ed25519-dalek@3.0.0 --precise 2.2.0`; the pin lives in the
  committed [contracts/Cargo.lock](../contracts/Cargo.lock).
- **`stellar-accounts` IS published on crates.io**: versions 0.5.0 (2025-10-28),
  0.6.0, 0.7.0, 0.7.1, 0.7.2 (2026-06-09); `max_stable_version` 0.7.2, none
  yanked. `contracts/` depends on `stellar-accounts = "=0.7.2"` +
  `soroban-sdk = "=26.1.0"`. The `experimental_spec_shaking_v2` sdk feature OZ
  enables arrives transitively via stellar-accounts' own dependency, and
  stellar-cli exports `SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1`
  during builds regardless.

### 1.5 The D1.3 build command and its reproducibility (verified 2026-08-03)

`stellar contract build --package frequency-limit-policy` (cwd `contracts/`,
stellar-cli 27.1.0) executes exactly (per `--print-commands-only`):

```
CARGO_BUILD_RUSTFLAGS=--remap-path-prefix=/Users/kunal/.cargo/registry/src= \
SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1 \
cargo rustc --manifest-path=frequency-limit-policy/Cargo.toml \
  --crate-type=cdylib --target=wasm32v1-none --release
```

Output: `contracts/target/wasm32v1-none/release/frequency_limit_policy.wasm`,
12,639 bytes, exports `enforce` / `get_frequency_limit_data` / `install` /
`uninstall`. **Reproducibility check: two builds from clean (`rm -rf target`)
produced the identical SHA-256**
`42227f2b6150c95a7084bb7c5ff2e7a40793eae39bf0c5dc95bd752d18ee6eed`.
(An earlier pre-review build hashed `ae7f960a…9547`; the adversarial-review
fixes — install-time `max_calls` cap, removal of the then-unreachable
`HistoryCapacityExceeded` runtime check — changed the wasm.)
(No `--verifiable` flag exists — §1.2; reproducibility rests on the path
remapping above. macOS note: `cargo clean` can fail on this volume's
AppleDouble `._*` sidecar files — `rm -rf target` instead.)

**Cross-platform reproducibility (verified 2026-08-03, D1.4):** the CI
`contracts` job on `ubuntu-latest` (x86_64 Linux, same pinned 1.97.1
toolchain + committed Cargo.lock, stellar-cli 27.1.0 via the official
action) produced the **identical** SHA-256
`42227f2b6150c95a7084bb7c5ff2e7a40793eae39bf0c5dc95bd752d18ee6eed` as the
macOS arm64 builds — see the "wasm hash" step of
[run 30839117017](https://github.com/kunal-drall/policywright/actions/runs/30839117017).
CI asserts this equality on every run since.

### 1.6 stellar-cli 27.1.0 upload/deploy/fetch surface (verified 2026-08-03; corrected against the real D1.3 deploy run)

- `stellar contract upload --wasm <path> --network testnet` prints the
  **64-hex wasm hash to stdout**. The submitted transaction appears on stderr
  as `Signing transaction: <hex>` plus an explorer link
  (`🔗 https://stellar.expert/explorer/testnet/tx/<hex>`) — NOT as the
  `Transaction hash is <hex>` string found in the binary; scripts must parse
  the explorer-link line (and must not pass `-q`, which silences stderr).
  Verified empirically during the D1.3 deploy. Re-upload of
  existing wasm is idempotent (`Skipping install because wasm already
installed`, hash still printed, no new tx). `stellar contract install` is
  deprecated in favor of `upload`.
- `stellar contract deploy --wasm-hash <hex> --network testnet` prints the
  **`C...` contract id to stdout** (tx hash again on stderr). `--alias <name>`
  writes `.stellar/contract-ids/<name>.json` under the cwd, overwriting
  without prompting (gitignored here).
- `--source-account` is backed by env **`STELLAR_ACCOUNT`** and explicitly
  accepts a raw secret key (`--source SC36…` per help), which then also signs.
  No confirmation prompts anywhere in upload/deploy; inclusion fee defaults to
  100 stroops; resource fee is auto-simulated.
- A named `--network` and `--rpc-url` are **mutually exclusive** (`cannot use
both`); scripts must unset `STELLAR_RPC_URL` when passing `--network`.
  **stellar-cli also dotenv-loads `./.env` from the cwd**: a `STELLAR_RPC_URL`
  line there without `STELLAR_NETWORK_PASSPHRASE` makes every `--network`
  invocation from that directory fail (`rpc-url is used but network passphrase
  is missing`) — so the repo's `.env` must NOT set `STELLAR_RPC_URL`. Found
  and verified empirically during the D1.3 deploy.
- On-chain wasm retrieval for hash verification: `stellar contract fetch
--id <C...> --network testnet -o <file>`. (`stellar contract info hash`
  also outputs the SHA-256 of a contract's wasm; there is no `info wasm`
  subcommand.)

### 1.7 Installing stellar-cli in CI (verified 2026-08-03)

The `stellar/stellar-cli` repository doubles as an **official composite
GitHub Action**: `uses: stellar/stellar-cli@v27.1.0` downloads the release
binary matching the action ref (`stellar-cli-27.1.0-x86_64-unknown-linux-gnu.tar.gz`
on `ubuntu-latest`) into `$HOME/.local/bin` and adds it to `PATH`. Verified by
reading `action.yml` at tag `v27.1.0`
(`gh api "repos/stellar/stellar-cli/contents/action.yml?ref=v27.1.0"`) and
the release asset list for v27.1.0. Used by the `contracts` CI job since D1.4.

---

## GATE 2 — OpenZeppelin Stellar contracts

Reference point for every claim policywright makes about the smart-account
model. Repository: **`OpenZeppelin/stellar-contracts`** (located via GitHub —
the org's Stellar/Soroban contracts monorepo; the accounts model lives in
`packages/accounts`). Cloned locally and **pinned to tag `v0.7.2`**
(`a9c42169000638da937577f592ebf61a7a3c94ca`), the latest stable at verification
time; `v0.8.0-rc.3` exists but is a release candidate. `main` was at
`9b5ed96f67aa28a8be73c538f7bfdef65925c6bc` (2026-07-31). All file:line
references below are within that tag. Verified 2026-08-03.

The Rust package name is **`stellar-accounts`** (`packages/accounts/Cargo.toml:2`).

### 2.1 The `Policy` trait — real name and full lifecycle

Source: `packages/accounts/src/policies/mod.rs:47-160`.

The trait is named **`Policy`**. It has exactly **three** lifecycle methods
plus one associated type. **There is no `can_enforce` hook** — the spike's
assumed `install / can_enforce / enforce / uninstall` lifecycle is wrong;
validation and state mutation both happen in `enforce`.

```rust
pub trait Policy {
    type AccountParams: FromVal<Env, Val>;

    fn enforce(
        e: &Env,
        context: Context,
        authenticated_signers: Vec<Signer>,
        context_rule: ContextRule,
        smart_account: Address,
    );

    fn install(
        e: &Env,
        install_params: Self::AccountParams,
        context_rule: ContextRule,
        smart_account: Address,
    );

    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address);
}
```

Rejection mechanism, quoted from the trait docs (`mod.rs:44-46`): _"`enforce`:
Performs both validation and state changes; must be authorized by the smart
account. Should panic if the policy conditions are not met."_

`#[contractclient]` cannot handle traits with associated types, so OZ declares
a parallel private `PolicyClientInterface` (`mod.rs:163-185`, with
`install_params: Val`) purely to generate `PolicyClient`.

### 2.2 `ContextRule` and `ContextRuleType`

Source: `packages/accounts/src/smart_account/storage.rs:143-174`.

```rust
pub enum ContextRuleType {
    Default,                      // applies to any context
    CallContract(Address),        // one specific contract
    CreateContract(BytesN<32>),   // one specific WASM hash
}

pub struct ContextRule {
    pub id: u32,
    pub context_type: ContextRuleType,
    pub name: String,
    pub signers: Vec<Signer>,
    pub signer_ids: Vec<u32>,
    pub policies: Vec<Address>,
    pub policy_ids: Vec<u32>,
    pub valid_until: Option<u32>,
}
```

**`valid_until` is a ledger sequence, not a Unix timestamp.** Doc comment:
_"Optional expiration ledger sequence for the rule"_; runtime comparison
(`storage.rs:282, 651, 786`):

```rust
if valid_until < e.ledger().sequence() { /* PastValidUntil */ }
```

**Context matching is contract-level only** (`storage.rs:289-304`): the
required rule type is derived from the auth context discarding the function
name, then `context_type_matches = (rule is Default) || (rule == required)`.
One `ContextRule` binds to one contract; it cannot express a set of contracts
or a function name.

The function name _is_ available to a policy: `soroban_sdk::auth::ContractContext`
is `{ contract: Address, fn_name: Symbol, args: Vec<Val> }`
([soroban-sdk `src/auth.rs`](https://raw.githubusercontent.com/stellar/rs-soroban-sdk/main/soroban-sdk/src/auth.rs)),
and `enforce` receives the full `Context`. Function-level and argument-level
narrowing are expressible **in a policy**, not in a context rule.

### 2.3 Limits

Source: `packages/accounts/src/smart_account/mod.rs:522-530`.

| Constant                | Value | Meaning                                     |
| ----------------------- | ----- | ------------------------------------------- |
| `MAX_POLICIES`          | `5`   | Max policies per context rule.              |
| `MAX_SIGNERS`           | `15`  | Max signers per context rule.               |
| `MAX_NAME_SIZE`         | `20`  | Max context-rule name length, **in bytes**. |
| `MAX_EXTERNAL_KEY_SIZE` | `256` | Max external key size.                      |

Exceeding them panics (`SmartAccountError::TooManyPolicies` = 3011,
`NameTooLong`; `storage.rs:383-384, 426-427`).

### 2.4 Stock policy modules — what actually ships

Source: `packages/accounts/src/policies/` @ v0.7.2. The RFP named
`spending_limit`, `simple_threshold`, `weighted_threshold` — all three exist,
**as free-function modules, not as deployable contracts**. Each exposes
`install` / `enforce` / `uninstall` / getters as plain functions; a deployable
policy contract is a thin wrapper implementing the `Policy` trait by
delegating to them (reference wrappers live in
`examples/multisig-smart-account/*-policy/src/contract.rs`).

| Module               | Install params (`AccountParams`)                                                      | Storage key (per account+rule)                              | Source                                   |
| -------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `simple_threshold`   | `SimpleThresholdAccountParams { threshold: u32 }`                                     | `SimpleThresholdStorageKey::AccountContext(Address, u32)`   | `simple_threshold.rs:97-105, 120-124`    |
| `spending_limit`     | `SpendingLimitAccountParams { spending_limit: i128, period_ledgers: u32 }`            | `SpendingLimitStorageKey::AccountContext(Address, u32)`     | `spending_limit.rs:86-95, 144-149`       |
| `weighted_threshold` | `WeightedThresholdAccountParams { signer_weights: Map<Signer, u32>, threshold: u32 }` | `WeightedThresholdStorageKey::AccountContext(Address, u32)` | `weighted_threshold.rs:126-135, 153-160` |

**The storage/segregation pattern** is uniform: every stock policy keys all
state on `AccountContext(smart_account: Address, context_rule_id: u32)` in
persistent storage, with TTL constants (`DAY_IN_LEDGERS = 17280`,
`*_EXTEND_AMOUNT = 30 * DAY_IN_LEDGERS`, `*_TTL_THRESHOLD = EXTEND - DAY`).
`install` panics `AlreadyInstalled` if the key exists
(`simple_threshold.rs:287-291`); `enforce` starts with
`smart_account.require_auth()`.

**Critical `spending_limit` semantics** (`spending_limit.rs:222-294`):

- The window is measured in **ledgers** (`period_ledgers: u32`), cleaned up
  against `e.ledger().sequence()` — not in seconds.
- `enforce` only recognises `Context::Contract` where
  `fn_name == symbol_short!("transfer")`, and reads the amount from
  **`args.get(2)`** as `i128`. Any other context — any other function name,
  including a router swap — panics `NotAllowed`. It does NOT track token
  outflow generally; it meters direct `transfer` calls only.
- It is **asset-blind**: one limit per (account, rule), whatever token the
  `transfer` belongs to (the metered token is the contract in the rule's
  `CallContract` scope).
- History is capped: `MAX_HISTORY_ENTRIES = 1000`, exceeding panics
  `HistoryCapacityExceeded`.

There is **no** stock policy for call frequency, function-name scoping, or
argument-value scoping.

### 2.5 Install surface and authorization matching (verified 2026-08-03)

Re-verified against a fresh shallow clone of tag `v0.7.2` (HEAD confirmed
`a9c42169000638da937577f592ebf61a7a3c94ca`); the earlier local clone was gone.

- **`add_context_rule` — the install entry point a synthesized rule must
  satisfy** (`packages/accounts/src/smart_account/mod.rs:238-248`):

  ```rust
  fn add_context_rule(
      e: &Env,
      context_type: ContextRuleType,
      name: String,
      valid_until: Option<u32>,
      signers: Vec<Signer>,
      policies: Map<Address, Val>,   // policy contract address -> install params
  ) -> ContextRule;
  ```

  Requires `e.current_contract_address().require_auth()`. Policy install
  params travel as the `Val` in the `policies` map (decoded via the policy's
  `AccountParams: FromVal<Env, Val>`).

- **Every `require_auth` call produces its own `Context` at `__check_auth`**
  (`mod.rs:25-33`): _"`__check_auth` receives `auth_contexts: Vec<Context>` —
  one entry per `require_auth` call."_ A nested token `transfer` inside a
  router swap therefore arrives as its own `Contract` context and needs its
  own matching rule — a least-privilege account authorizing the recorded
  swap needs a `CallContract(token)` rule for the token as well as the
  `CallContract(router)` rule. That token rule is exactly where the stock
  `spending_limit` composes (it meters direct `transfer` calls, §2.4).
- **No rule auto-discovery** (`mod.rs:43-46, 69-73`;
  `storage.rs:435-475`): the caller supplies exactly one `ContextRule` id per
  context via `AuthPayload.context_rule_ids`, aligned by index with
  `auth_contexts`; mismatched lengths reject.
- **Each rule must contain at least one signer or one policy** (`mod.rs:20-21`).
- **`spending_limit` install guards** (`spending_limit.rs:367-405`): panics
  `OnlyCallContractAllowed` (3227) unless the rule's type is
  `CallContract(_)` (`:376-378`); `InvalidLimitOrPeriod` unless
  `spending_limit > 0 && period_ledgers > 0` (`:380-382`); `AlreadyInstalled`
  on key collision (`:385-387`). The exact params struct is
  `SpendingLimitAccountParams { spending_limit: i128, period_ledgers: u32 }`
  (`:88-94`).
- **`spending_limit::enforce` additionally requires non-empty
  `authenticated_signers`** (`spending_limit.rs:232-234`) — a policy-only
  rule with zero authenticated signers is rejected `NotAllowed`.

---

## GATE 3 — Live-chain truth (Stellar testnet)

Captured with [scripts/capture.ts](../scripts/capture.ts) (raw-preservation:
complete `getTransaction` JSON-RPC responses, no decoding at capture time).
Node: `https://soroban-testnet.stellar.org`, RPC version `27.1.1`, captive core
`stellar-core 27.1.0`, **protocol 27**, ledger head 3935527 at capture.
Retention observed: ~7.0 days (oldest 3814616 at latest 3935575). All decoded
findings below were derived from the committed raw captures with
`@stellar/stellar-sdk` 15.1.0 (`xdr.TransactionEnvelope.fromXDR`,
`xdr.ContractEvent.fromXDR`, `scValToNative`). Verified 2026-08-03.

### 3.1 Captured transactions (committed under `examples/live/`)

| File (`examples/live/<hash>.json`)                                 | What it is                                                                                                          | Status                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `c857cacab895d1a88ff07dc56c706c60ea1d074f6a58a35c4352694f917aa09d` | A third-party perps-DEX order tx rich in SAC events (found via `getEvents` transfer-topic filter)                   | SUCCESS, ledger 3933527 |
| `acf256a0688e7f9c36520f4fc20cfa924d1b2e593033d85b0e443ce770b2d452` | A real **Blend TestnetV2 pool claim** (the only tx emitting the pool's `claim` event in the whole retention window) | SUCCESS, ledger 3818886 |
| `2dcff6618ff12fb629700cab627b3870afa3f0dd000becf88b2eb7826d0b2c1b` | A real **Soroswap router `swap_exact_tokens_for_tokens`**                                                           | SUCCESS, ledger 3817770 |

Also committed under `examples/live/` (both 2026-08-03):

- `simulated-soroswap-swap.json` — a raw `simulateTransaction` exchange
  (§3.6), the fixture for the simulated-path recorder.
- `recorded-claim-swap.json` — the RecordedTx the D1.1 recorder produced LIVE
  from the two real flow hashes above (this is recorder **output**, not a raw
  capture; evidence trail in [EVIDENCE.md](../evidence/EVIDENCE.md)).

The user's own claim/swap flow has not been executed yet. When those hashes
exist, capture them with:

```bash
npx tsx scripts/capture.ts <claimTxHash> <swapTxHash> --network testnet
```

### 3.2 Operation structure

- Every captured Soroban tx carries **exactly one operation**, of type
  `InvokeHostFunction` with host function `hostFunctionTypeInvokeContract` —
  the single-InvokeHostFunction-per-transaction rule confirmed against real
  envelopes (all three captures).
- **Fee-bump envelopes occur in the wild**: capture `c857…` is
  `envelopeTypeTxFeeBump`; the invocation lives at
  `feeBump().tx().innerTx().v1().tx()`. Decoders must handle both this and
  plain `envelopeTypeTx`. (`getTransaction` also surfaces `feeBump: true`.)
- `getTransaction` (RPC 27.1.1) response fields observed: `latestLedger`,
  `latestLedgerCloseTime`, `oldestLedger`, `oldestLedgerCloseTime`, `status`,
  `txHash`, `applicationOrder`, `feeBump`, `envelopeXdr`, `resultXdr`,
  `resultMetaXdr`, `diagnosticEventsXdr` (deprecated shape, still present),
  **`events`** (new structured field: `{ transactionEventsXdr: [...],
contractEventsXdr: [[...per-op...]] }`), `ledger`, `createdAt`.
- **`createdAt` is a JSON _string_** (`"createdAt": "1785107316"` in capture
  `2dcff6…`), and `@stellar/stellar-sdk` 15.1.0 passes it through verbatim
  despite typing it `number` (`lib/rpc/parsers.js:43`:
  `createdAt: raw.createdAt`). Callers must `Number()` it. Verified
  2026-08-03 against the raw capture and the installed SDK source.
- SDK 15.1.0 DOES parse the new `events` field into
  `xdr.TransactionEvent[]` / `xdr.ContractEvent[][]` (`lib/rpc/parsers.js:50,
55`; `lib/rpc/api.d.ts:153-154`). Verified 2026-08-03.
- **Retention re-check 2026-08-03 (~19:45 UTC):** both flow hashes were still
  fetchable (node oldest ledger 3814839 vs tx ledgers 3817770/3818886) but
  only ~3,000–4,000 ledgers (≈4–6 h) from falling out of the ~7-day window.
  After expiry the committed captures under `examples/live/` are the only
  reproduction path for these exact transactions; explorer links keep working
  (explorers run archival stores).
- **Retention EXPIRED (verified 2026-08-03, D1.4 session):** the same `npm
run record` command now returns `[TX_NOT_FOUND]` for both hashes — the node's
  oldest retained ledger is 3830508, past tx ledgers 3817770/3818886. The
  typed error names the retention window exactly as designed. The committed
  captures and `recorded-claim-swap.json` are now the reproduction path
  (docs/demo-script.md Beat 1 states this in the demo).

### 3.3 Contract-event shapes actually present at protocol 27

Decoded from the captures — both transfer-event shapes **coexist**:

| Emitter                                                                   | Topics                                                                                                             | Data          | Observed in                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------ |
| **SAC** (Stellar Asset Contract, e.g. native XLM, issued USDC) `transfer` | **4**: `[Symbol("transfer"), from: Address, to: Address, sep0011_asset: String]` (e.g. `"native"`, `"USDC:GC4V…"`) | `i128` amount | `2dcff6…` ev[0], `c857…` ev[4] |
| **Plain SEP-41 token** (Soroswap test token) `transfer`                   | **3**: `[Symbol("transfer"), from: Address, to: Address]`                                                          | `i128` amount | `2dcff6…` ev[1]                |

So the historical 3-topic assumption is wrong **for SAC events** (they carry
the SEP-0011 asset string as a 4th topic, per CAP-67) but still right for
plain SEP-41 tokens. A robust decoder must accept both and must not treat
`topics[3]` as guaranteed.

Additionally per CAP-67 (verified in
[cap-0067.md](https://raw.githubusercontent.com/stellar/stellar-protocol/master/core/cap-0067.md),
"Muxed event information"): when a muxed destination or memo is involved, the
`transfer`/`mint` event `data` becomes an `SCV_MAP`
`{ amount: i128, to_muxed_id: u64|bytes|string }` instead of a bare `i128`.
Not observed in these captures, but a decoder must not assume `data` is always
`i128`.

**Complete CAP-67 unified SAC event schemas** (verified 2026-08-03 from the
same cap-0067.md; the `burn` shape is additionally confirmed by capture
`c857…` ev[1]):

| Event      | Topics                                                      | Data                        |
| ---------- | ----------------------------------------------------------- | --------------------------- |
| `transfer` | 4: `[transfer, from: Addr, to: Addr, sep0011: String]`      | `i128` or muxed map (above) |
| `mint`     | 3: `[mint, to: Addr, sep0011: String]` — **no admin topic** | `i128` or muxed map         |
| `burn`     | 3: `[burn, from: Addr, sep0011: String]`                    | `i128`                      |
| `clawback` | 3: `[clawback, from: Addr, sep0011: String]`                | `i128`                      |
| `fee`      | 2: `[fee, from: Addr]` (transaction-level)                  | `i128` (refunds negative)   |

The SEP-0011 asset string (`"native"`, `"CODE:G..."`) is never itself a valid
strkey, which is how the recorder tells the SAC 3-topic `mint`/`burn` forms
apart from hypothetical non-SAC layouts with an address in that position —
non-SAC `mint`/`burn` layouts are NOT assumed and are surfaced as warnings
instead of decoded by guesswork (src/sources/decode.ts).

Other real shapes observed (capture `c857…`):

- SAC `approve`: topics `[approve, from, spender, sep0011_asset]`, data
  `scvVec [amount: i128, live_until_ledger: u32]` — not a bare i128.
- SAC `burn`: topics `[burn, from, sep0011_asset]`, data `i128`.
- Custom contract events use map data freely (e.g. `fee_collected` with
  `scvMap {amount, token}`).
- **Transaction-level events** exist at protocol 27
  (`events.transactionEventsXdr`): `fee` events with stages
  `transactionEventStageBeforeAllTxes` / `AfterAllTxes`, data `i128`
  (refunds negative).

### 3.4 Blend claim — as actually decoded

- **Signature, verified from source**
  ([blend-contracts-v2 `pool/src/contract.rs:233-241, 539`](https://github.com/blend-capital/blend-contracts-v2/blob/main/pool/src/contract.rs)):

  ```rust
  fn claim(e: Env, from: Address, reserve_token_ids: Vec<u32>, to: Address) -> i128;
  // reserve_token_id = reserve_index * 2  (dTokens / borrow)
  // reserve_token_id = reserve_index * 2 + 1  (bTokens / supply-collateral)
  // returns tokens claimed
  ```

- **On-chain, as captured** (`acf256…`): the only claim in retention is
  **nested** — the top-level invocation is `harvest(GCH2MMBN…)` on a wrapper
  contract `CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357`, which
  internally calls the Blend pool. The pool
  `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` emits event
  topics `[Symbol("claim"), claimer: Address]`, data
  `scvVec [reserve_token_ids: Vec<u32>, amount: i128]` (observed:
  `[[1], 0]`). Lesson for the recorder: the authorized _call_ can be one
  contract while the _scoped effect_ (the claim) happens a level deeper —
  top-level-op decoding alone does not see it.

### 3.5 Soroswap swap — as actually decoded

Capture `2dcff6…`, router `CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD`,
function `swap_exact_tokens_for_tokens`, args exactly matching the source
signature (§4.2):

```
arg[0] scvI128  10000000            (amount_in)
arg[1] scvI128  293170              (amount_out_min)
arg[2] scvVec   [XLM-SAC, token]    (path: Vec<Address>)
arg[3] scvAddress                    (to)
arg[4] scvU64   1785107613          (deadline, unix seconds)
```

Events: the two token `transfer`s (§3.3), plus pair `sync`/`swap` and router
`swap` events whose topic[0] is the **contract-name string** (`"SoroswapPair"`,
`"SoroswapRouter"`) with map data — another shape a decoder must tolerate.

### 3.6 `simulateTransaction` — raw result shape as actually captured

Captured 2026-08-03 with [scripts/capture-simulation.ts](../scripts/capture-simulation.ts)
(raw-preservation, same discipline as capture.ts) and committed as
[`examples/live/simulated-soroswap-swap.json`](../examples/live/simulated-soroswap-swap.json):
an UNSIGNED Soroswap-router `swap_exact_tokens_for_tokens` envelope (1 XLM →
token over the §3.5 path, friendbot-funded throwaway source
`GABJUTWU2LMN…`, no secret retained) simulated against
`https://soroban-testnet.stellar.org` at ledger 3935941.

Raw JSON-RPC `result` fields observed: `latestLedger`, `minResourceFee`,
`transactionData` (base64 `SorobanTransactionData`), **`events`** (flat array
of base64 **`DiagnosticEvent`**, 19 observed — NOT the per-op `ContractEvent`
structure `getTransaction` uses; each wraps
`{inSuccessfulContractCall: bool, event: ContractEvent}`), **`results`**
(single-element array `{auth: [base64 SorobanAuthorizationEntry], xdr}` —
simulation DISCOVERS the auth tree an unsigned envelope does not carry,
including the nested token `transfer`), `stateChanges`. Request must pass
`xdrFormat: "base64"`. Signatures are not required for simulation.

---

## GATE 4 — Swap venue (testnet BLND↔USDC)

All contract IDs below were confirmed to exist on testnet on 2026-08-03 via
`getLedgerEntries` (contract-instance keys), and liquidity was read via
`simulateTransaction` against the public testnet RPC.

### 4.1 Blend testnet deployment (source: [blend-utils `testnet.contracts.json`](https://raw.githubusercontent.com/blend-capital/blend-utils/main/testnet.contracts.json))

| Name                                   | Contract ID                                                | On-chain? |
| -------------------------------------- | ---------------------------------------------------------- | --------- |
| BLND token                             | `CB22KRA3YZVCNCQI64JQ5WE7UY2VAV7WFLK6A2JN3HEX56T2EDAFO7QF` | ✅        |
| USDC token                             | `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU` | ✅        |
| **Comet BLND:USDC pool** (backstop LP) | `CA5UTUUPHYL5K22UBRUVC37EARZUGYOSGK3IKIXG2JLCC5ZZLI4BDWDM` | ✅        |
| Blend pool "TestnetV2"                 | `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` | ✅        |
| backstopV2                             | `CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA` | ✅        |

Simulated reads on the Comet pool: `get_tokens()` = `[BLND, USDC]` (exactly the
Blend testnet mints); `get_balance(BLND)` = `44_282_235_119_120` (≈4.43M BLND at
7 decimals); `get_balance(USDC)` = `3_244_691_639_171` (≈324K USDC). Deep
liquidity — this is the pair the Blend testnet backstop depends on.

### 4.2 Soroswap testnet deployment (source: [soroswap/core `public/testnet.contracts.json`](https://raw.githubusercontent.com/soroswap/core/main/public/testnet.contracts.json))

| Name                                                                         | Contract ID                                                | On-chain? |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- | --------- |
| Router                                                                       | `CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD` | ✅        |
| Factory                                                                      | `CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY` | ✅        |
| **BLND:USDC pair** (for the Blend mints, via `factory.get_pair(BLND, USDC)`) | `CCLDDDTH2CWR32CMZVFNVW5W5CKDI3M5VN4XRF7IEQZUSMQOS7CA3Q2K` | ✅        |

Simulated reads on the pair: `token_0` = USDC, `token_1` = BLND,
`get_reserves()` = `[4_970_267_932, 10_060_000_000]` → **497.0 USDC / 1,006.0
BLND**. Real but shallow liquidity; small swaps only.

### 4.3 Real swap function signatures (verified from source)

**Soroswap router**
([soroswap/core `contracts/router/src/lib.rs:255-262, 577`](https://github.com/soroswap/core/blob/main/contracts/router/src/lib.rs)):

```rust
fn swap_exact_tokens_for_tokens(
    e: Env,
    amount_in: i128,
    amount_out_min: i128,
    path: Vec<Address>,
    to: Address,
    deadline: u64,
) -> Result<Vec<i128>, CombinedRouterError>;
```

**Comet pool**
([CometDEX/comet-contracts-v1 `contracts/src/c_pool/comet.rs:80-102`](https://github.com/CometDEX/comet-contracts-v1/blob/main/contracts/src/c_pool/comet.rs)
— note the repo is `CometDEX/comet-contracts-v1`, not under blend-capital):

```rust
pub fn swap_exact_amount_in(
    e: Env,
    token_in: Address,
    token_amount_in: i128,
    token_out: Address,
    min_amount_out: i128,
    max_price: i128,
    user: Address,
) -> (i128, i128);   // (token_amount_out, spot_price_after)
```

### 4.4 Chosen venue: **Soroswap router** (primary), Comet as fallback

Both are practically executable today — nothing needs to be created or seeded:

- **Soroswap (chosen).** The BLND:USDC pair for the Blend mints exists with
  nonzero reserves (§4.2), the router is live, and a real router swap was
  captured in retention (§3.5). Its `swap_exact_tokens_for_tokens(amount_in,
amount_out_min, path, to, deadline)` matches the repo's recorded-flow model
  (the `path: Vec<Address>` argument is what argument-scope derivation reads).
  Constraint: reserves are ~1,006 BLND / ~497 USDC, so the demo swap must stay
  small (tens of BLND) to avoid absurd slippage.
- **Comet (fallback / large amounts).** Far deeper liquidity (§4.1) on the
  exact same mints, but a different call shape: `swap_exact_amount_in` has no
  `path` vector — token_in/token_out are separate `Address` args, and there is
  a `max_price` bound instead of a deadline. Choosing it would require the
  recorder/synthesizer to handle that shape (see RECONCILIATION).

**How the human executes one swap (Soroswap, testnet):**

1. Fund a testnet account (friendbot), hold Blend-testnet BLND (claim first, or
   swap a little USDC→BLND the same way).
2. Easiest UI: <https://app.soroswap.finance> switched to Testnet, select the
   Blend BLND and USDC mints (§4.1) — the pair `CCLDDD…` is what the router
   routes through.
3. Script outline (matches §4.3): build an `InvokeContract` op on the router
   `CCJUD55A…` calling `swap_exact_tokens_for_tokens(amount_in,
amount_out_min, [BLND, USDC], your_address, now+300)`, sign with the .env
   testnet key, submit, note the tx hash.
4. Capture it: `npx tsx scripts/capture.ts <hash> --network testnet`.

---

## 5. Contract IDs, the committed fixture, and the D1.3 deployment

**The committed fixture contains no real deployments.** Every address in
[fixtures/recorded-tx.json](../fixtures/recorded-tx.json) is a well-formed but
**synthetic** StrKey placeholder (fixture's own `note` says so). Verified with
`StrKey.isValidContract` per address, 2026-08-03. The real testnet IDs are in
GATE 4 above; the fixture predates their verification.

**Fixture transaction hash.** A Stellar tx hash is 32 bytes / 64 hex chars.
The fixture's hash was **65** hex chars until 2026-08-03 (now corrected in the
working tree); it remains a synthetic placeholder, not a real tx.

**The one real deployment (D1.3, 2026-08-03).** The generated
frequency-limit policy is deployed on testnet, from the `.env` identity
`GATUKCIMLZTQHNW3IFRNJWJZ5YDT5S2VFSTYMW3EXCKNPYVAYQCKKS3W`:

| Fact                       | Value                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Contract ID                | `CDSVPSTSKMJ2EEP4FOJ3NNIJZY5DKVA3VV5BM453AOYIWCLD4NMG2ZPP`                                                 |
| Wasm hash (local=on-chain) | `42227f2b6150c95a7084bb7c5ff2e7a40793eae39bf0c5dc95bd752d18ee6eed`                                         |
| Wasm upload tx             | `5ac3320d84e3b2952d641f159e497a76b76c0aca74162dbcf901ecb39c082e2c`                                         |
| Deploy tx                  | `35ddaeaa935af7233dbee577942edfcea2abda1ab12c1cd37d51b4c432236af0`                                         |
| Verified by                | `scripts/deploy-testnet.sh`: `stellar contract fetch --id <ID> --network testnet` → SHA-256 == local build |

An additional instance `CBZHVZJFMYKRM7U27IWG6AEYS3GMXB2N3IMDDGW74SC6UK5NHAN54BHS`
(same wasm hash, deploy tx `2b42587f3011119f64b480d1642179944321fe07c35c70e78ea20d9482da321e`)
exists from an interrupted first run of the deploy script — the script died
after deployment but before hash verification because it grepped for a
`Transaction hash is` stderr line 27.1.0 does not actually print (§1.6). The
evidence trail cites the fully-verified `CDSVPSTS…` instance.

**On-chain hash re-verified 2026-08-03 (D1.4 session):** `stellar contract
fetch --id CDSVPSTS… --network testnet` + `shasum -a 256` again produced
`42227f2b6150c95a7084bb7c5ff2e7a40793eae39bf0c5dc95bd752d18ee6eed`.

---

## 6. The funded SCF submission — public facts

Verified 2026-08-03 against
<https://communityfund.stellar.org/project/policywright-j8x>:

| Fact             | Value                                                  |
| ---------------- | ------------------------------------------------------ |
| SCF round        | **SCF #44** (NOT #43 as the README claimed until D1.4) |
| Submission title | "Record-to-Policy MCP + Agent skill"                   |
| Award            | $55.0K Build Award; status "Build phase, Awarded"      |
| Team size        | 2                                                      |
| Category         | Developer Tooling                                      |

"OZ accounts policy builder" is a **different** SCF #44 project (by
Gateway.fm, `/project/oz-accounts-policy-builder-by-gatewayfm-mqp`) — likely
the RFP policywright responded to, but the portal page does not say so; do
not conflate the two. The public page does not expose per-deliverable
completion criteria; the criteria quoted in evidence/EVIDENCE.md come from
the tranche plan as recorded in this repository.

---

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-03 | File created (toolchain, OZ trait/ContextRule/limits/stock policies, fixture audit). Restructured same day around the four pre-flight gates; added stellar-cli 26.0.0→27.1.0 upgrade, `--verifiable` finding, `wasm32v1-none`, live-chain captures (protocol 27 event shapes, fee-bump, Blend claim, Soroswap swap), swap-venue verification (Comet + Soroswap with on-chain liquidity), and version pins.                                                                                                                                                                                                                                                                                                           |
| 2026-08-03 | D1.2 session: added §2.5 — `add_context_rule` install surface, one-`Context`-per-`require_auth` at `__check_auth` (nested transfers need their own rule; that is where `spending_limit` composes), no rule auto-discovery, ≥1 signer-or-policy per rule, `spending_limit` install guards (`OnlyCallContractAllowed`/`InvalidLimitOrPeriod`/`AlreadyInstalled`) and the non-empty-signers requirement in `enforce`. Verified against a fresh v0.7.2 clone (same commit `a9c4216…`).                                                                                                                                                                                                                                   |
| 2026-08-03 | D1.1 session: pinned `@stellar/stellar-sdk` exact `15.1.0`; verified `createdAt` is a JSON string the SDK passes through untyped-correctly; verified SDK parses the protocol-27 `events` field; recorded the complete CAP-67 unified SAC event schemas (mint has NO admin topic; sep0011 string is never a strkey); captured and documented the raw `simulateTransaction` result shape (§3.6, committed fixture); retention re-check for the two flow hashes (still live, ≈4–6 h left).                                                                                                                                                                                                                              |
| 2026-08-03 | D1.3 session: added §1.4 (soroban-sdk 26.1.0 declares rust-version 1.91.0 → rustc ≥ 1.92 required alongside §1.3's ==1.91.0 rejection; toolchain pinned 1.97.1; upstream `ed25519-dalek >=2.0.0` range resolves to a 3.0.0 that breaks soroban-env-host 26.1.3 testutils — locked to 2.2.0; `stellar-accounts` published on crates.io through 0.7.2), §1.5 (exact build command; two clean builds reproduce SHA-256 `42227f2b…6eed`), §1.6 (upload/deploy/fetch CLI surface: wasm hash & contract id on stdout, submitted-tx explorer links on stderr, `STELLAR_ACCOUNT` accepts a raw secret, `--network` vs `STELLAR_RPC_URL` exclusivity plus the cwd-`.env` dotenv pitfall, `contract fetch` for on-chain wasm). |
