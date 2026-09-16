# Argument-level scope (`--constrain-arguments`)

Dry-run harness evidence for D2.3: how policywright derives swap-path token
constraints from a recording, when they are advisory vs enforced, and how to
reproduce the committed dual reports against the real claim→swap sequence.

## Default: off (opt-in tightening)

`SynthConfig.constrainArguments` defaults to **`false`**
([`DEFAULT_SYNTH_CONFIG`](../src/types.ts)). Passing `--constrain-arguments` on
`synth` or `simulate` turns enforcement on.

| Mode      | Flag                    | Unobserved swap route | Observed route |
| --------- | ----------------------- | --------------------- | -------------- |
| Default   | omit / off              | **flag** (advisory)   | **permit**     |
| Tightened | `--constrain-arguments` | **deny**              | **permit**     |

The synthesizer **always** records observations as `spec.argumentScopes`. Only
when the flag is on are those observations copied into `spec.policies` as
`argument-constraint` policies that the dry-run **denies** on. With the flag
off, the demo and default pipeline keep the pre-existing advisory behaviour.

## Derivation rules (swap `path` only)

Implemented in [`src/synthesizer.ts`](../src/synthesizer.ts)
(`findPathArg` / `deriveArgumentScopes`):

1. Walk every top-level call in the recording.
2. Consider only functions whose name **includes** `"swap"` (today:
   Soroswap `swap_exact_tokens_for_tokens`).
3. Find the first argument that is a non-empty `Vec` of address strings — that
   is the `path` (index 2 on the live Soroswap shape).
4. Union the path tokens into an allow-set keyed by
   `(contract, fnName, argIndex)`, with `argName: "path"`.

Non-swap calls (e.g. Blend `claim` / `harvest`) and array-of-non-address args
are ignored.

On the committed live sequence
[`examples/live/recorded-claim-swap.json`](../examples/live/recorded-claim-swap.json)
the observed path is **XLM(native) → USDC**:

| Symbol       | Contract ID                                                |
| ------------ | ---------------------------------------------------------- |
| XLM / native | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC         | `CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F` |

## Honest limits

Argument scope constrains the **set of token addresses** a swap `path` may
touch — nothing else:

- **Not** path ordering (A→B vs B→A through the same set).
- **Not** hop count (extra intermediate hops are allowed if every hop token was
  observed).
- **Not** amounts (those are the spending-limit policy).
- **Not** non-`path` arguments, and not non-swap functions.
- Offline dry-run only today: no stock OZ policy expresses this; codegen is
  noted as a composition delta ([T2-NOTES](T2-NOTES.md)).

## Criterion case: BLND→XLM

The dry-run harness ([`buildScenarios`](../src/simulate.ts)) includes:

1. A generic synthetic probe (`route through an unobserved token` with a
   `CZZZ…` address) — preserves the original demo scenario.
2. A labeled **`BLND→XLM (unobserved route)`** scenario using real FACTS
   testnet IDs:
   - BLND: `CB22KRA3YZVCNCQI64JQ5WE7UY2VAV7WFLK6A2JN3HEX56T2EDAFO7QF`
   - XLM/native: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`

Against the live recording (observed XLM→USDC), BLND is unobserved, so this
case **flags** when constraints are off and **denies** when
`--constrain-arguments` is on — naming the violated `path` argument constraint
in the reason string.

## Reproduce the committed reports

From the repo root (no network required; uses the committed recording):

```bash
# Advisory mode (default) — original permit; BLND→XLM FLAG
npx tsx src/cli.ts simulate \
  --input examples/live/recorded-claim-swap.json \
  > examples/live/simulation-report-args-off.md

# Enforced mode — same BLND→XLM case DENIED
npx tsx src/cli.ts simulate \
  --input examples/live/recorded-claim-swap.json \
  --constrain-arguments \
  > examples/live/simulation-report-args-on.md
```

Equivalent via the npm script (use `--silent` so the npm banner is not captured):

```bash
npm run --silent cli -- simulate --input examples/live/recorded-claim-swap.json \
  > examples/live/simulation-report-args-off.md
npm run --silent cli -- simulate --input examples/live/recorded-claim-swap.json \
  --constrain-arguments \
  > examples/live/simulation-report-args-on.md
```

Committed copies:

- [`examples/live/simulation-report-args-off.md`](../examples/live/simulation-report-args-off.md)
- [`examples/live/simulation-report-args-on.md`](../examples/live/simulation-report-args-on.md)

The fixture demo (`npm run demo`) stays on the default **off** path and still
**flags** unobserved routes; it does not require `--constrain-arguments`.
