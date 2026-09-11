# Prompt 6 — Generate the Tranche 2 recorded-demo script

You generate **`docs/demo-script-t2.md`**: the teleprompter for the T2
submission video. Every `[EXPECT]` block must come from actually running the
command (or agent tool) the same day you write the script — reviewers paste
hashes; RPC retention already ate one set.

## Design principle (non-negotiable)

Do **not** make a five-feature tour. Make **one continuous story on one real
flow**, where each deliverable appears as a step the story needs. T1's video
proved an engine; T2's has to prove the thing the submission is named for — an
**agent using that engine safely, with the chain enforcing the result**. A
checklist video gets skimmed; a narrative gets watched.

**Opening line / arc in one sentence:**

> In Tranche 1 this worked from the command line — in Tranche 2, an agent can
> use it, a human still signs, and the chain enforces what was granted.

## Beat list amendment (replaces the prior Prompt 6 split)

**Prior mistake:** treating the MCP session and the skill conversation as
separate beats. **Do not.** Merge them into one agent conversation. Also add
the proof-wall close and the conditional Scenario-3 rejection shot.

| Time (≈)   | Beat | Deliverables shown | Notes |
| ---------- | ---- | ------------------ | ----- |
| 0:00–0:25  | Cold open | repo, green CI, docs roadmap (T1 approved, T2 rows flipped) | One framing sentence. No history lesson. |
| 0:25–1:15  | **The agent asks** (single conversation) | **D2.2 + D2.1** | Claude with skill loaded. Natural ask → MCP `record` + `synthesize` fire visibly → skill clarification question → human answers → plain-language rule + warnings + unaudited banner. |
| 1:15–2:00  | Prove it's not too loose | **D2.3** | Continue same conversation: "show me what this would deny." Simulate table: original permitted, over-cap denied, BLND→XLM flagged with constraints off / denied with them on. |
| 2:00–2:40  | What it actually produced | **D2.4** | Side-by-side: composed `spending_limit` config with OZ source citation + generated Rust with banner. One line on the boundary. |
| 2:40–3:50  | Install and enforce | **D2.5** | Simulate-first → Freighter popup (hold) → approve → submit → verify diff green → explorer C-address with rule/policies live. **Conditional:** if Prompt R Scenario 3 passed, ~10s over-cap rejected by the chain. If Scenario 3 was honestly blocked, **cut this and say nothing implied**. |
| 3:50–4:30  | Proof wall and honest close | evidence pack | Scroll `EVIDENCE.md` (criteria verbatim → links), live docs pages, limits out loud, end card with repo + docs URLs. |

Total ≈4:30 inside the ~5:00 form guidance.

## What to put in `docs/demo-script-t2.md`

For each beat, emit:

1. **Lower-third tag** — e.g. `D2.2 · Claude skill`
2. **SHOW** — exact UI / terminal / browser steps
3. **SAY** — calm, factual; numbers and the Freighter popup sell; adjectives subtract
4. **DO** — commands or agent actions
5. **`[EXPECT]`** — verbatim captured output from a real run (mark `_deterministic_` when byte-stable; mark `_live YYYY-MM-DD_` when network-dependent)
6. **GATE** — if a surface is not shipped, write `GATE: not recordable until <surface>` and leave the `[EXPECT]` as a placeholder with the reproduction command — never invent Freighter, explorer, or on-chain reject frames

## Production rules to bake into the script header

- Fresh hashes, same day as recording.
- Lower-third deliverable tags every beat.
- Honest editing: agent tool calls take real seconds; jump-cut with visible timestamps rather than splicing instant results.
- Terminal ≥16pt dark, 1080p+, clean browser profile; testnet Freighter fine on screen; seed phrases and `.env` never.
- Record beat-by-beat, assemble, upload public or unlisted, test the link logged out.

## Agent conversation (the merged D2.1 + D2.2 beat)

Type this natural ask (adapt amounts to the morning recording):

> Here are two testnet transactions — claiming my Blend yield and swapping to
> USDC. Draft the tightest policy that lets a delegate repeat exactly this.

The money moment is the skill's clarification question, e.g. capping at the
observed amount vs allowing more per window — **not** assuming. Answer it; the
skill then presents the rule in plain language with warnings and the unaudited
banner. That single exchange must demonstrate both D2.1 (MCP tools) and D2.2
(skill) in the shape the RFP prescribed.

## D2.3 deny beat (continue same conversation)

> show me what this would deny.

Capture the simulate table with constraints off, then on, so the BLND→XLM
before/after is visible in ~10 seconds.

## D2.4 boundary line (spoken)

> Stock OpenZeppelin where it can express the constraint; generated code only
> where it can't.

## Close limits (spoken, required)

Testnet-only; unaudited until the Tranche 3 Audit Bank audit; T3 is audit,
mainnet, and the three walkthroughs.

## Output

Write `docs/demo-script-t2.md` only. Do not invent on-chain verdicts. If
Scenario 3 is blocked, omit that shot from the script with one honest note.
