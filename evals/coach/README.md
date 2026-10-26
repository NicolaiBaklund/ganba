# Coach eval

Runs a few fixed conversations against the real model, with the coach's read tools answered from fixtures. Use it to see whether a prompt change gives good answers before it ships:

- food advice in light of tomorrow's session,
- talking through a session that went badly,
- helping without a plan.

```bash
ANTHROPIC_API_KEY=sk-ant-... npx tsx evals/coach/run.mts                         # all cases, claude-opus-5-5
ANTHROPIC_API_KEY=sk-ant-... npx tsx evals/coach/run.mts --case gave-up-after-one-rep
```

**Costs real money**: roughly $0.10–0.40 per case on Opus 5.5, because the coach fetches data over a few rounds.

Answers are written to `evals/coach/out/` (git-ignored) as Markdown for you to read. There is no score: judge whether the coach used the right data, connected it, and gave concrete, honest advice.

## Adding cases
Each entry in `cases.json` has:
- `id`,
- `context`: the text the coach gets, in the app's format,
- `message`: what the person asks,
- `tools`: the text each read tool returns.
