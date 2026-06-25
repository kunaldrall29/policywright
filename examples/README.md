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
| `simulation-report.md` | Dry-run report for the standard scenarios. |
| `FrequencyLimitPolicy.rs` | The generated **illustrative, unaudited** Rust policy. |

They reflect the default synthesis config (`constrainArguments` off), so the
unobserved-route scenario is **flagged** rather than denied. Running
`npm run cli -- simulate --constrain-arguments` enforces it as a denial instead.

These are generated artefacts and are intentionally excluded from Prettier so
they match the tool's raw output verbatim.
