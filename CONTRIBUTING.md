# Contributing

Thanks for your interest. policywright is a small, evidence-driven codebase;
contributions are welcome as long as they keep it that way.

## Ground rules

- **Verification before implementation.** Never assert a protocol, library, or
  API fact from memory. [docs/FACTS.md](docs/FACTS.md) is the single source of
  truth for versions, contract IDs, and decoded shapes — consult it before
  coding against an external shape, and update it (with date + source) when you
  verify something new.
- **Honesty in artifacts.** Generated Rust keeps its unaudited banner verbatim.
  README and docs claim only what the repo can prove.
- **`npm run demo` stays green at every commit.** It is the offline smoke test.
- **Secrets** (testnet-only) live in the gitignored `.env` — see
  [.env.example](.env.example). Never print a secret in logs, errors, or
  commits.

## Workflow

```bash
npm ci
npm run lint && npm run format:check && npm run typecheck && npm test && npm run demo
(cd contracts && cargo fmt --check && cargo clippy --all-targets --locked -- -D warnings && cargo test --locked)
```

All of the above must pass — CI runs exactly this
([.github/workflows/ci.yml](.github/workflows/ci.yml)).

Commits follow [Conventional Commits](https://www.conventionalcommits.org/),
one logical change each.

## Scope

Tranche 1 scope only (see the Deliverables section of the
[README](README.md)). Work that belongs to later tranches is parked in
[docs/T2-NOTES.md](docs/T2-NOTES.md) rather than merged early.

## License

By contributing you agree your contributions are licensed under the
[MIT License](LICENSE).
