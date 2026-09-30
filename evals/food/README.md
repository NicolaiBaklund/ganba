# Food estimate eval

Checks how close the AI's calorie estimates are to known values, so prompt or model changes can be compared.

```bash
ANTHROPIC_API_KEY=sk-ant-... npx tsx evals/food/run.mts                      # default: claude-opus-5-5, effort medium
ANTHROPIC_API_KEY=sk-ant-... npx tsx evals/food/run.mts --model claude-sonnet-5 --effort low
```

**Costs real money** (roughly $0.03–0.05 per case on Opus 5.5). Results are written to `evals/food/results/` (git-ignored).

## Adding cases

`cases.json` entries: `id`, `text` and/or `image` (path under `evals/food/`, e.g. `images/pasta.jpg`), and `expected.kcal` (+ optional `protein_g`).
The best cases are real meals you weighed yourself. Aim for 15–30.

## Workflow

1. Change `FOOD_SYSTEM_PROMPT` in `packages/core/src/food-ai/prompt.ts` and bump `FOOD_PROMPT_VERSION`.
2. Run the eval, compare the mean absolute error with the previous result file.
3. Keep the change only if it is better (or equal and cheaper).
