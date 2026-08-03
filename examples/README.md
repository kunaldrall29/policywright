# Example output

These files are a committed sample run, so reviewers can see policywright's
output without executing anything. They were generated from the bundled fixture
([`fixtures/recorded-tx.json`](../fixtures/recorded-tx.json)) with the default
configuration:

```bash
npm run demo   # writes the same artefacts to out/
```

| File | What it is |
| --- | --- |
| `summary.txt` | Human-readable summary of the recording and synthesized spec. |
| `spec.json` | Machine-readable `SmartAccountSpec` (amounts as decimal strings). |
| `context-rule.json` | Installable OZ context rules + policy install params ([schema](../docs/context-rule-schema.md)). |
| `simulation-report.md` | Dry-run report for the standard scenarios. |
| `FrequencyLimitPolicy.rs` | The generated **illustrative, unaudited** Rust policy — byte-identical to the compiled-and-tested crate at [`contracts/frequency-limit-policy`](../contracts/frequency-limit-policy) at the demo defaults. |

The fixture carries no authorization trees, so its `context-rule.json` records the
BLND spend cap as a **delta note** (the stock spending-limit policy cannot fire
without a subject-authorized direct `transfer`). The committed artifact for the
**real** recorded testnet sequence — where the authorization tree is present and the
cap composes onto a token rule as stock `spending_limit` params — is
[`live/context-rule.json`](live/context-rule.json), regenerable with:

```bash
npm run cli -- synth --input examples/live/recorded-claim-swap.json
```

They reflect the default synthesis config (`constrainArguments` off), so the
unobserved-route scenario is **flagged** rather than denied. Running
`npm run cli -- simulate --constrain-arguments` enforces it as a denial instead.

These are generated artefacts and are intentionally excluded from Prettier so
they match the tool's raw output verbatim.
