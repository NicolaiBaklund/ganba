# Restitusjon del 2 (skjerm og AI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recovery-fanen (funn, kurver, dagsark, lister) i Tasuki-stil, Profil-bryter for helsedata til AI, og AI-delene A (ukesoppsummering), B («Why?» for en dag) og C (AI foreslår spørsmål), alt bygget på motoren fra del 1.

**Architecture:** Serverside lastere i `apps/web/lib/recovery/` (`view.ts`, `day.ts`, `insights.ts`) gir skjermen ferdige tall; motoren i core får kurver, terskel-transform og bredere forskyvning. AI går gjennom ett injiserbart grensesnitt (`RecoveryAi`), alltid bak samtykke-bryteren, og hver setning må ha gyldige henvisninger (`finding:<id>` / `day:<dato>:<felt>`) — resten fjernes før lagring.

**Tech Stack:** Next.js 16 App Router (server components + client components), next-intl, Tailwind 4 + Tasuki-tokens, recharts, Supabase, `@anthropic-ai/sdk` (structured output via `zodOutputFormat`), zod v4, Vitest, Playwright.

**Spec:** `docs/specs/2026-10-04-restitusjon.md` (§3, §6 AI-tabeller, §7, §8, §9, §10). Del 1-plan: `docs/plans/2026-10-04-restitusjon-del1-plan.md`.

## Global Constraints

- **Ingen enhetstester / TDD** (prosjektregel): kode først, så integrasjonstest i `tests/integration/`, kjør. Ren TS-logikk testes også der (som motortestene i del 1).
- **Ingen `Co-Authored-By`/Claude-attribusjon i commits.** Aldri `git add -A`; legg til bare filene oppgaven nevner.
- Jobb på egen gren `restitusjon-del2` i worktree `C:/loop-recovery2` (kopier `apps/web/.env.local` og `supabase/.temp/` fra `C:/loop`). Ikke push/merge uten at brukeren ber om det.
- DB: ny migrasjon + `pnpm db:push` (regenererer `apps/web/lib/db/types.ts`). Rent additiv.
- **UI på engelsk**, kort, ingen tankestreker, ingen «·»-kjeder, ingen emojier, ingen store bokstaver-etiketter (`docs/design.md`).
- **Tasuki:** smale tall (`.num`, `[font-stretch:62%]` på det største), `.cond`-overskrifter, `SectionHead`/`ListRow`/`StatRow`, linjer framfor kort, karmosinrød (`text-primary`) bare for det viktigste, lys/mørk via tokens. Ark = `BottomSheet`.
- **Samtykke:** `profiles.ai_health_consent` false som standard. Av → **null AI-kall**, AI-delene skjult, liten lenke «Turn on AI insights» (→ `/profile#ai`). Bryterteksten sier hva som sendes: daglige tall og funn, ingen bilder, ingen navn.
- **Grunnregel AI:** AI får bare tabeller fra motoren/dagsdata. Strukturert svar der hver setning har ≥ 1 henvisning, og alle henvisninger må finnes i det AI fikk. Setninger som bryter dette fjernes. Står ingenting igjen, vises ingenting.
- Brukerens egen Anthropic-nøkkel (`resolveAnthropicKey`). Modell `AI_RECOVERY_MODEL` (default `claude-sonnet-5`). Svarspråk = `profiles.locale` (samme kart som matrådene).
- Del 1 er i produksjon: ikke endre oppførselen til synk/motor utover det oppgavene sier.
- Kommandoer: `pnpm typecheck`, `pnpm test:int`, `pnpm exec vitest run tests/integration/<fil>`, `pnpm build`, `pnpm dev` (port 3000) / smoke mot `http://localhost:3100` (`pnpm --filter web exec next dev -p 3100`).

## Review Focus

1. **Bryter av midt i bruk:** en klient som fortsatt har siden åpen og trykker «Why?» eller laster ukesoppsummering etter at bryteren er slått av → serveren må nekte (403 `consent_required`) uten AI-kall. Test i Task 7.
2. **Ingen nøkkel / ugyldig nøkkel:** funn og kurver virker; AI-delene viser kort melding, ingen krasj. Test i Task 7 (`no_key`).
3. **Utdatert «Why?»:** maten for dagen før rettes etter at svaret ble laget → «Data changed», nytt svar bare ved nytt trykk. Test i Task 7.
4. **Ny bruker / lite data:** ingen Garmin, Garmin uten netter, historikk under henting, 0 funn → fanen viser riktig tom tilstand, ingen tomme grafer som krasjer. Test i Task 4 (`loadRecoveryView`) og smoke i Task 9.
5. **AI foreslår tull:** ukjent faktor, terskel uten verdi, kopi av eksisterende spørsmål, eller mer enn 3 → avvises før lagring; AI-spørsmål blir aldri funn uten q ≤ 0,05. Test i Task 7.

---

## File Structure

| Fil | Ansvar |
|---|---|
| `supabase/migrations/20261006000000_recovery_ai.sql` | samtykke, AI-tabeller, `ai_question_id` |
| `packages/core/src/recovery/questions.ts` (endres) | `lag` −3..+1, `threshold`-transform |
| `packages/core/src/recovery/analyze.ts` (endres) | terskel-split |
| `packages/core/src/recovery/variables.ts` (endres) | eksporter `recoveryRunForm` |
| `packages/core/src/recovery/curves.ts` (ny) | kurvepunkter med normalbånd |
| `packages/core/src/recovery/ai.ts` (ny) | skjemaer, prompts, meldingsbyggere, `keepGrounded` |
| `packages/core/src/index.ts` (endres) | eksport |
| `apps/web/lib/recovery/consent.ts` (ny) | les/sett samtykke |
| `apps/web/app/api/settings/ai-health/route.ts` (ny) | PUT bryter |
| `apps/web/components/profile/AiHealthCard.tsx` (ny) | bryter i Profil |
| `apps/web/components/nav/BottomNav.tsx` (endres) | Recovery erstatter Food |
| `apps/web/components/today/MealsList.tsx` (endres) | «All meals»-lenke |
| `apps/web/lib/db/today.ts`, `components/food/{DayFoodList,EditEntrySheet}.tsx`, `app/(app)/food/page.tsx` (endres) | klokkeslett i redigeringsarket |
| `apps/web/lib/recovery/view.ts` (ny) | data til fanen |
| `apps/web/lib/recovery/day.ts` (ny) | data til dagsarket |
| `apps/web/lib/recovery/text.ts` (ny) | tekstparametre for funn |
| `apps/web/app/(app)/recovery/page.tsx` (ny) | fanen |
| `apps/web/components/recovery/{FindingsList,FindingSheet,RecoveryCurves,DaySheet,MoreLists,WeeklySummary,AiOff}.tsx` (nye) | UI |
| `apps/web/app/api/recovery/day/[date]/route.ts`, `.../why/route.ts`, `app/api/recovery/summary/route.ts`, `app/api/recovery/questions/route.ts` (nye) | API |
| `apps/web/lib/ai/language.ts` (ny), `apps/web/app/api/training/workout/[id]/fuel/route.ts` (endres) | felles språkkart |
| `apps/web/lib/ai/recovery.ts` (ny) | Anthropic-kall bak `RecoveryAi` |
| `apps/web/lib/recovery/insights.ts` (ny) | A, B, C med samtykke, nøkkel, lagring |
| `apps/web/lib/recovery/compute.ts` (endres) | kjører AI-spørsmål (q ≤ 0,05) |
| `apps/web/messages/en.json` (endres) | tekster |
| tester: `recovery-engine.test.ts` (endres), `recovery-view.test.ts`, `recovery-ai.test.ts` (nye); `tests/smoke/recovery-smoke.mjs` (ny); `scripts/screenshots.mjs` (endres) | |

---

### Task 1: Migrasjon, samtykke og Profil-bryter

**Files:**
- Create: `supabase/migrations/20261006000000_recovery_ai.sql`, `apps/web/lib/recovery/consent.ts`, `apps/web/app/api/settings/ai-health/route.ts`, `apps/web/components/profile/AiHealthCard.tsx`
- Modify: `apps/web/app/(app)/profile/page.tsx`, `apps/web/messages/en.json`, `apps/web/lib/db/types.ts` (generert)
- Test: `tests/integration/recovery-view.test.ts` (første describe)

**Interfaces:**
- Produces: `getAiHealthConsent(userId: string): Promise<boolean>`, `setAiHealthConsent(userId: string, on: boolean): Promise<void>`; tabeller `recovery_ai_questions`, `recovery_summaries`, `recovery_day_answers`; kolonner `profiles.ai_health_consent`, `profiles.ai_health_consent_at`, `recovery_findings.ai_question_id`.

- [ ] **Step 1: Migrasjon**

```sql
-- Recovery part 2: consent to send health data to AI, and the AI layer's stored output.

alter table profiles
  add column ai_health_consent boolean not null default false,
  add column ai_health_consent_at timestamptz;

create table recovery_ai_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  spec jsonb not null, -- {factor, transform, threshold, outcome, lag}
  rationale text not null,
  status text not null default 'testing' check (status in ('testing', 'accepted', 'rejected')),
  model text,
  prompt_version integer,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on recovery_ai_questions (user_id, status);

alter table recovery_findings add column ai_question_id uuid references recovery_ai_questions on delete cascade;

create table recovery_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  week_start date not null,
  content jsonb not null,
  model text,
  prompt_version integer,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table recovery_day_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  local_date date not null,
  question text not null default 'why',
  content jsonb not null,
  input_hash text not null,
  model text,
  prompt_version integer,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10,5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date, question)
);

do $$
declare t text;
begin
  foreach t in array array['recovery_ai_questions', 'recovery_summaries', 'recovery_day_answers'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows on %I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
```

Run: `pnpm db:push` → Expected: «Migrations pushed and … regenerated», `types.ts` inneholder `ai_health_consent`, `recovery_summaries`.

- [ ] **Step 2: `lib/recovery/consent.ts`**

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Has the user agreed to send their health data (sleep, HRV, food, training) to AI? Off by default. */
export async function getAiHealthConsent(userId: string): Promise<boolean> {
  const { data } = await createAdminSupabase().from("profiles").select("ai_health_consent").eq("user_id", userId).maybeSingle();
  return !!data?.ai_health_consent;
}

export async function setAiHealthConsent(userId: string, on: boolean): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("profiles")
    .update({ ai_health_consent: on, ai_health_consent_at: on ? new Date().toISOString() : null })
    .eq("user_id", userId);
  if (error) throw error;
}
```

- [ ] **Step 3: API-rute `app/api/settings/ai-health/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { setAiHealthConsent } from "@/lib/recovery/consent";

const Body = z.object({ enabled: z.boolean() });

export async function PUT(req: Request) {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  await setAiHealthConsent(u.user.id, body.data.enabled);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: `components/profile/AiHealthCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Opt-in switch: sleep, HRV, food and training numbers may be sent to AI for recovery insights. */
export function AiHealthCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations("aiHealth");
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setBusy(true);
    const res = await fetch("/api/settings/ai-health", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("error"));
    setOn(next);
    router.refresh();
  }

  return (
    <section id="ai" className="rounded-md bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="cond text-lg leading-none">{t("title")}</h2>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("explain")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("title")}
          disabled={busy}
          onClick={toggle}
          className={cn("relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted")}
        >
          <span className={cn("absolute top-1 size-5 rounded-full bg-card shadow transition-[left]", on ? "left-6" : "left-1")} />
        </button>
      </div>
    </section>
  );
}
```

I `profile/page.tsx`: importer `AiHealthCard` og `getAiHealthConsent`; legg `getAiHealthConsent(user.id)` til `Promise.all` (som `consent`), og render `<AiHealthCard enabled={consent} />` rett etter `<ApiKeyCard … />`.

- [ ] **Step 5: Tekster** (`messages/en.json`, ny toppnøkkel)

```json
"aiHealth": {
  "title": "Use my health data with AI",
  "explain": "Lets AI write your weekly recovery summary, explain a single day and suggest new things to test. Sends daily numbers (sleep, HRV, resting heart rate, food totals, training) and findings. Never photos or your name.",
  "error": "Couldn’t save. Try again."
}
```

- [ ] **Step 6: Integrasjonstest** — ny fil `tests/integration/recovery-view.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAiHealthConsent, setAiHealthConsent } from "@/lib/recovery/consent";
// @ts-expect-error — plain JS helper shared with the smoke scripts
import { seedUser } from "../smoke/seed.mjs";
import { admin, cleanup, createTestUser, type TestUser } from "./setup";

describe("recovery: AI consent", () => {
  let u: TestUser;
  beforeAll(async () => {
    u = await createTestUser("consent");
    await seedUser(admin(), u.id, { days: 2 });
  });
  afterAll(cleanup);

  it("is off by default and can be switched on and off", async () => {
    expect(await getAiHealthConsent(u.id)).toBe(false);
    await setAiHealthConsent(u.id, true);
    expect(await getAiHealthConsent(u.id)).toBe(true);
    const { data } = await admin().from("profiles").select("ai_health_consent_at").eq("user_id", u.id).single();
    expect(data!.ai_health_consent_at).not.toBeNull();
    await setAiHealthConsent(u.id, false);
    expect(await getAiHealthConsent(u.id)).toBe(false);
  });

  it("a signed-in user only sees their own AI rows", async () => {
    await admin().from("recovery_summaries").insert({ user_id: u.id, week_start: "2026-09-28", content: { headline: "x", sentences: [], tips: [] } });
    const { data } = await u.client.from("recovery_summaries").select("week_start");
    expect(data).toHaveLength(1);
  });
});
```

Run: `pnpm typecheck && pnpm exec vitest run tests/integration/recovery-view.test.ts` → Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261006000000_recovery_ai.sql apps/web/lib/db/types.ts apps/web/lib/recovery/consent.ts apps/web/app/api/settings/ai-health/route.ts apps/web/components/profile/AiHealthCard.tsx "apps/web/app/(app)/profile/page.tsx" apps/web/messages/en.json tests/integration/recovery-view.test.ts
git commit -m "feat(recovery): AI consent switch in Profile and tables for the AI layer"
```

---

### Task 2: Navigasjon og klokkeslett på måltider

**Files:**
- Modify: `apps/web/components/nav/BottomNav.tsx`, `apps/web/components/today/MealsList.tsx`, `apps/web/lib/db/today.ts`, `apps/web/components/food/DayFoodList.tsx`, `apps/web/components/food/EditEntrySheet.tsx`, `apps/web/app/(app)/food/page.tsx`, `apps/web/messages/en.json`
- Create: `apps/web/app/(app)/recovery/page.tsx` (midlertidig enkel side; fylles i Task 5)

**Interfaces:**
- Consumes: `UpdateEntry.time` (`"HH:MM"`) fra del 1; `localDate`, `localHour` fra core.
- Produces: rute `/recovery`; `FoodEntryWithItems.local_date: string`; `DayFoodList` og `EditEntrySheet` får prop `timezone: string`.

- [ ] **Step 1: Bunnmeny** — i `BottomNav.tsx`: bytt `Utensils` med `HeartPulse` i importen, og `RIGHT` blir

```ts
const RIGHT = [
  { href: "/recovery", key: "recovery", Icon: HeartPulse },
  { href: "/body", key: "body", Icon: Scale },
] as const;
```

`messages/en.json` → `nav`: legg til `"recovery": "Recovery"` (behold `"food"`; brukes i overskrifter).

- [ ] **Step 2: «All meals»** — i `MealsList.tsx`, erstatt `add`-konstanten med

```tsx
  const add = (
    <span className="flex gap-4">
      <Link href={`/food?date=${date}`} className="text-[13px] font-semibold text-muted-foreground">
        {t("allMeals")}
      </Link>
      <Link href={`/food/log?mode=text${date === today ? "" : `&date=${date}`}`} className="text-[13px] font-semibold text-primary">
        {t("add")}
      </Link>
    </span>
  );
```

`today`-nøkkelen i `en.json`: `"allMeals": "All meals"`.

- [ ] **Step 3: Midlertidig `/recovery`-side** (erstattes i Task 5)

```tsx
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";

export default async function RecoveryPage() {
  await requireUser();
  const t = await getTranslations("recovery");
  return (
    <main className="flex flex-col px-[18px] pb-4 pt-5">
      <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
    </main>
  );
}
```

`en.json` ny toppnøkkel `"recovery": { "title": "Recovery" }` (utvides senere).

- [ ] **Step 4: Klokkeslett i redigeringsarket**
  - `lib/db/today.ts`: `FoodEntryWithItems` får `local_date: string;` og select-strengen `"id, logged_at, local_date, meal_type, …"`.
  - `food/page.tsx`: `<DayFoodList entries={snap.entries} photoUrls={urls} timezone={snap.timezone} />`.
  - `DayFoodList.tsx`: ny prop `timezone: string`, sendes videre: `<EditEntrySheet entry={…} timezone={timezone} onClose={…} />`.
  - `EditEntrySheet.tsx`: ny prop `timezone: string`; importer `localDate`, `localHour` fra `@loop/core`. Legg til tilstand og felt:

```tsx
  const [time, setTime] = useState("");
  const [initialTime, setInitialTime] = useState("");
```

i `useEffect` (etter `setMeal`):

```tsx
    // Time is only known when the entry was logged on its own day; otherwise the field starts empty.
    const at = new Date(entry.logged_at);
    const known = localDate(timezone, at) === entry.local_date;
    const hhmm = known ? new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at) : "";
    setTime(hhmm);
    setInitialTime(hhmm);
```

(og legg `timezone` i dependency-lista; importer bare `localDate` fra core). I `save()`-kroppen: `...(time && time !== initialTime ? { time } : {}),` ved siden av `mealType`. Feltet, rett etter måltids-chipsene:

```tsx
        <label className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm">
          <span className="font-semibold">{t("time")}</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="num rounded-md bg-muted px-3 py-1.5 text-base"
            aria-label={t("time")}
          />
        </label>
        {!initialTime && <p className="-mt-2 text-xs text-muted-foreground">{t("timeUnknown")}</p>}
```

`en.json` → `food`: `"time": "Time"`, `"timeUnknown": "Logged on another day. Set the time if it was a late meal."`

- [ ] **Step 5: Sjekk**

Run: `pnpm typecheck && pnpm exec vitest run tests/integration/food-entries.test.ts tests/integration/flow.test.ts`
Expected: rent; alle PASS. Start appen (`pnpm --filter web exec next dev -p 3100`) og sjekk med `node tests/smoke/smoke.mjs` at eksisterende flyt fortsatt går (bunnmenyen har nå Recovery). Hvis en smoke-test leter etter «Food» i menyen: oppdater selektoren til lenka «All meals» og før en `Ruling:`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/nav/BottomNav.tsx apps/web/components/today/MealsList.tsx apps/web/lib/db/today.ts apps/web/components/food/DayFoodList.tsx apps/web/components/food/EditEntrySheet.tsx "apps/web/app/(app)/food/page.tsx" "apps/web/app/(app)/recovery/page.tsx" apps/web/messages/en.json
git commit -m "feat(nav): Recovery tab replaces Food; All meals link; meal time in the edit sheet"
```

---

### Task 3: Motor: kurver, terskel og bredere forskyvning

**Files:**
- Create: `packages/core/src/recovery/curves.ts`
- Modify: `packages/core/src/recovery/questions.ts`, `analyze.ts`, `variables.ts`, `packages/core/src/index.ts`
- Test: `tests/integration/recovery-engine.test.ts` (nye `it`)

**Interfaces:**
- Produces: `RecoveryQuestion { id; factor; transform: "tertile" | "binary" | "threshold"; threshold?: number; outcome; lag: number /* −3..+1 */ }`; `recoveryRunForm(days): Map<ISODate, number>`; `CurvePoint { date: ISODate; value: number; low: number | null; high: number | null }`; `recoveryCurve(series: Map<ISODate, number>, from: ISODate, to: ISODate, lookback?: number, minValues?: number): CurvePoint[]`; `nightSeries(days, key: "sleepScore" | "hrv" | "restingHr"): Map<ISODate, number>`.

- [ ] **Step 1: Spørsmål** — i `questions.ts`:

```ts
export interface RecoveryQuestion {
  id: string;
  factor: RecoveryFactor;
  transform: "tertile" | "binary" | "threshold";
  /** For "threshold": factor ≥ threshold is the high group. */
  threshold?: number;
  outcome: RecoveryOutcome;
  /** Outcome date − factor date, −3..+1 (night outcomes: +1 = the next morning). */
  lag: number;
}
```

og `q(...)`-hjelperens `lag`-parameter blir `number`.

- [ ] **Step 2: Terskel-split** — i `analyze.ts`, `split(values, transform)` får tredje parameter og ny gren først:

```ts
function split(values: number[], transform: RecoveryQuestion["transform"], threshold?: number): Split | null {
  if (transform === "threshold") {
    if (threshold == null || !Number.isFinite(threshold)) return null;
    return { labels: values.map((v) => (v >= threshold ? 1 : -1)), low: threshold, high: threshold };
  }
  // … (binary og tertile som før)
```

og kallet: `const s = split(pairs.map((p) => p.x), q.transform, q.threshold);`.

- [ ] **Step 3: Eksporter løpsform** — i `variables.ts`: gi `runForm` navnet `recoveryRunForm` og `export` den (oppdater kallet i `buildRecoveryRows`). Legg til

```ts
/** Raw nightly values (morning of each date) for one night metric. */
export const nightSeries = (days: readonly RecoveryDayInput[], key: "sleepScore" | "hrv" | "restingHr"): Map<ISODate, number> =>
  seriesOf(days, (d) => d[key]);
```

- [ ] **Step 4: `curves.ts`**

```ts
import { addDays, type ISODate } from "../dates";

export interface CurvePoint {
  date: ISODate;
  value: number;
  /** The user's normal range for that day: 25th–75th percentile of the previous `lookback` days. */
  low: number | null;
  high: number | null;
}

function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Points for [from, to] with a normal band from each day's own history (null band until enough history). */
export function recoveryCurve(series: ReadonlyMap<ISODate, number>, from: ISODate, to: ISODate, lookback = 28, minValues = 14): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const value = series.get(date);
    if (value == null) continue;
    const prev: number[] = [];
    for (let i = 1; i <= lookback; i++) {
      const p = series.get(addDays(date, -i));
      if (p != null) prev.push(p);
    }
    const sorted = prev.sort((a, b) => a - b);
    const enough = sorted.length >= minValues;
    out.push({ date, value, low: enough ? quantile(sorted, 0.25) : null, high: enough ? quantile(sorted, 0.75) : null });
  }
  return out;
}
```

`index.ts`: `export * from "./recovery/curves";`

- [ ] **Step 5: Tester** — legg til i `recovery-engine.test.ts` (inne i `describe`; importer `recoveryCurve`, `RECOVERY_QUESTIONS`, `type RecoveryQuestion` fra `@loop/core`):

```ts
  it("threshold questions and negative lags work (AI-proposed shapes)", () => {
    const rows = buildRecoveryRows(synth({ seed: 7, plant: true }), FROM, END);
    const qs: RecoveryQuestion[] = [
      { id: "t", factor: "deficit", transform: "threshold", threshold: 600, outcome: "hrv", lag: 1 },
      { id: "n", factor: "carbs", transform: "tertile", outcome: "sleepScore", lag: -1 },
      { id: "bad", factor: "deficit", transform: "threshold", outcome: "hrv", lag: 1 },
    ];
    const rs = analyzeRecovery(rows, qs, { maxQ: 0.05 });
    expect(byId(rs, "t")!.kind).toBe("finding");
    expect(byId(rs, "t")!.groups.high.bound).toBe(600);
    expect(byId(rs, "n")!.groups.high.n).toBeGreaterThan(0);
    expect(byId(rs, "bad")!.reason).toBe("few_days"); // no threshold → nothing to compare
  });

  it("curves: a band from each day's own history, none before 14 earlier values", () => {
    const s = new Map(Array.from({ length: 40 }, (_, i) => [addDays(END, i - 39), 50 + (i % 10)] as const));
    const pts = recoveryCurve(s, addDays(END, -39), END);
    expect(pts).toHaveLength(40);
    expect(pts[5]!.low).toBeNull();
    const last = pts.at(-1)!;
    expect(last.low).toBeGreaterThanOrEqual(50);
    expect(last.high).toBeLessThanOrEqual(59);
    expect(last.low!).toBeLessThan(last.high!);
  });
```

Run: `pnpm typecheck && pnpm exec vitest run tests/integration/recovery-engine.test.ts` → Expected: 13 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/recovery packages/core/src/index.ts tests/integration/recovery-engine.test.ts
git commit -m "feat(core): recovery curves with a personal normal band; threshold and wider lags for questions"
```

---

### Task 4: Data til fanen og dagsarket

**Files:**
- Create: `apps/web/lib/recovery/view.ts`, `apps/web/lib/recovery/day.ts`, `apps/web/app/api/recovery/day/[date]/route.ts`
- Test: `tests/integration/recovery-view.test.ts` (ny describe)

**Interfaces:**
- Consumes: `loadRecoveryDays` (del 1), `nightSeries`, `recoveryRunForm`, `recoveryCurve` (Task 3), `getAiHealthConsent` (Task 1), `getApiKeyStatus`, `getGarminStatus`, `backfillProgress`, `RECOVERY_HISTORY_DAYS`, `getDaySnapshot`, `sumItems`.
- Produces:
  - `FindingRow { questionId; factor: RecoveryFactor; outcome: RecoveryOutcome; lag: number; kind; reason; high: RecoveryGroup; low: RecoveryGroup; needed: number; effectSd: number | null; qValue: number | null; controlOk: boolean | null; rank: number | null; source: "engine" | "ai" }`
  - `RecoveryView { garmin: "none" | "active" | "reauth_required"; consent: boolean; hasKey: boolean; historyDays: number; findings: FindingRow[] /* ≤ 5, rank order */; noEffect: FindingRow[]; needsData: FindingRow[]; curves: Record<"sleepScore" | "hrv" | "restingHr" | "runForm", CurvePoint[]>; today: ISODate }`
  - `loadRecoveryView(userId: string): Promise<RecoveryView>`
  - `RecoveryDay { date; night: { sleepS; deepS; lightS; remS; awakeS; sleepScore; hrv; restingHr; hrvLow; hrvHigh } | null; normal: Record<"sleepScore" | "hrv" | "restingHr", { low: number | null; high: number | null }>; before: { date; kcal: number; targetKcal: number; carbsG: number; proteinG: number; alcoholG: number; lateKcal: number | null; meals: number; training: { typeKey: string; km: number | null; minutes: number }[] } }`
  - `loadRecoveryDay(userId: string, date: ISODate): Promise<RecoveryDay>`
  - `GET /api/recovery/day/[date]` → `RecoveryDay`

- [ ] **Step 1: `view.ts`**

```ts
import "server-only";
import { addDays, localDate, nightSeries, recoveryCurve, recoveryRunForm, type CurvePoint, type ISODate, type RecoveryFactor, type RecoveryGroup, type RecoveryOutcome } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getApiKeyStatus } from "@/lib/ai/keys";
import { getGarminStatus } from "@/lib/garmin/accounts";
import { getAiHealthConsent } from "./consent";
import { backfillProgress } from "./fetch";
import { loadRecoveryDays } from "./load";

export const CURVE_DAYS = 30;
const MAX_FINDINGS = 5;

export interface FindingRow {
  questionId: string;
  factor: RecoveryFactor;
  outcome: RecoveryOutcome;
  lag: number;
  kind: "finding" | "no_effect" | "needs_data";
  reason: "few_days" | "unclear" | "training" | null;
  high: RecoveryGroup;
  low: RecoveryGroup;
  needed: number;
  effectSd: number | null;
  qValue: number | null;
  controlOk: boolean | null;
  rank: number | null;
  source: "engine" | "ai";
}

export interface RecoveryView {
  garmin: "none" | "active" | "reauth_required";
  consent: boolean;
  hasKey: boolean;
  historyDays: number;
  findings: FindingRow[];
  noEffect: FindingRow[];
  needsData: FindingRow[];
  curves: Record<"sleepScore" | "hrv" | "restingHr" | "runForm", CurvePoint[]>;
  today: ISODate;
}

type Groups = { high: RecoveryGroup; low: RecoveryGroup; needed: number };

export async function loadRecoveryView(userId: string): Promise<RecoveryView> {
  const db = createAdminSupabase();
  const [{ data: profile }, garmin, consent, key] = await Promise.all([
    db.from("profiles").select("timezone").eq("user_id", userId).single(),
    getGarminStatus(userId),
    getAiHealthConsent(userId),
    getApiKeyStatus(userId),
  ]);
  const today = localDate(profile?.timezone ?? "UTC");
  const empty = { sleepScore: [], hrv: [], restingHr: [], runForm: [] };
  if (!garmin) return { garmin: "none", consent, hasKey: !!key, historyDays: 0, findings: [], noEffect: [], needsData: [], curves: empty, today };

  const [{ data: acct }, { data: rows }, days] = await Promise.all([
    db.from("garmin_accounts").select("recovery_backfilled_until").eq("user_id", userId).single(),
    db.from("recovery_findings").select("*").eq("user_id", userId),
    loadRecoveryDays(userId, today),
  ]);
  const all: FindingRow[] = (rows ?? []).map((r) => {
    const g = r.groups as unknown as Groups;
    return {
      questionId: r.question_id,
      factor: r.factor as RecoveryFactor,
      outcome: r.outcome as RecoveryOutcome,
      lag: r.lag,
      kind: r.kind as FindingRow["kind"],
      reason: r.reason as FindingRow["reason"],
      high: g.high,
      low: g.low,
      needed: g.needed,
      effectSd: r.effect_sd == null ? null : Number(r.effect_sd),
      qValue: r.q_value == null ? null : Number(r.q_value),
      controlOk: r.control_ok,
      rank: r.rank,
      source: r.source as FindingRow["source"],
    };
  });
  const from = addDays(today, -(CURVE_DAYS - 1));
  return {
    garmin: garmin.status,
    consent,
    hasKey: !!key,
    historyDays: backfillProgress(today, acct?.recovery_backfilled_until ?? null),
    findings: all
      .filter((f) => f.kind === "finding")
      .sort((a, b) => Math.abs(b.effectSd ?? 0) - Math.abs(a.effectSd ?? 0))
      .slice(0, MAX_FINDINGS),
    noEffect: all.filter((f) => f.kind === "no_effect" && f.source === "engine"),
    // AI questions that have not passed stay out of sight (spec §7.4: only passing ones are shown).
    needsData: all
      .filter((f) => f.kind === "needs_data" && f.source === "engine")
      .sort((a, b) => Math.min(b.high.n, b.low.n) / b.needed - Math.min(a.high.n, a.low.n) / a.needed),
    curves: {
      sleepScore: recoveryCurve(nightSeries(days, "sleepScore"), from, today),
      hrv: recoveryCurve(nightSeries(days, "hrv"), from, today),
      restingHr: recoveryCurve(nightSeries(days, "restingHr"), from, today),
      runForm: recoveryCurve(recoveryRunForm(days), from, today, 30, 5),
    },
    today,
  };
}
```

- [ ] **Step 2: `day.ts`**

```ts
import "server-only";
import { addDays, localDate, localHour, nightSeries, recoveryCurve, type ISODate } from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getDaySnapshot, sumItems } from "@/lib/db/today";
import { loadRecoveryDays } from "./load";

export interface RecoveryDay {
  date: ISODate;
  night: {
    sleepS: number | null;
    deepS: number | null;
    lightS: number | null;
    remS: number | null;
    awakeS: number | null;
    sleepScore: number | null;
    hrv: number | null;
    restingHr: number | null;
    hrvLow: number | null;
    hrvHigh: number | null;
  } | null;
  normal: Record<"sleepScore" | "hrv" | "restingHr", { low: number | null; high: number | null }>;
  before: {
    date: ISODate;
    kcal: number;
    targetKcal: number;
    carbsG: number;
    proteinG: number;
    alcoholG: number;
    /** Null when a meal was logged on another day (time unknown). */
    lateKcal: number | null;
    meals: number;
    training: { typeKey: string; km: number | null; minutes: number }[];
  };
}

/** The morning of `date` (the night before) and the day before it: what the day sheet shows. */
export async function loadRecoveryDay(userId: string, date: ISODate): Promise<RecoveryDay> {
  const db = createAdminSupabase();
  const prev = addDays(date, -1);
  const [{ data: n }, days, snap, { data: acts }] = await Promise.all([
    db.from("recovery_days").select("*").eq("user_id", userId).eq("local_date", date).maybeSingle(),
    loadRecoveryDays(userId, date),
    getDaySnapshot(db, userId, prev),
    db.from("activities").select("type_key, distance_m, duration_s").eq("user_id", userId).eq("local_date", prev),
  ]);
  const band = (key: "sleepScore" | "hrv" | "restingHr") => {
    const p = recoveryCurve(nightSeries(days, key), date, date).at(0);
    return { low: p?.low ?? null, high: p?.high ?? null };
  };
  const tz = snap.timezone;
  const items = snap.entries.flatMap((e) => e.items);
  const timeKnown = snap.entries.every((e) => localDate(tz, new Date(e.logged_at)) === prev);
  return {
    date,
    night: n
      ? {
          sleepS: n.sleep_s,
          deepS: n.deep_s,
          lightS: n.light_s,
          remS: n.rem_s,
          awakeS: n.awake_s,
          sleepScore: n.sleep_score,
          hrv: n.hrv_avg,
          restingHr: n.resting_hr,
          hrvLow: n.hrv_baseline_low,
          hrvHigh: n.hrv_baseline_high,
        }
      : null,
    normal: { sleepScore: band("sleepScore"), hrv: band("hrv"), restingHr: band("restingHr") },
    before: {
      date: prev,
      kcal: Math.round(snap.intake.kcal),
      targetKcal: snap.target.kcal,
      carbsG: Math.round(snap.intake.carbsG),
      proteinG: Math.round(snap.intake.proteinG),
      alcoholG: Math.round(items.reduce((s, i) => s + Number(i.alcohol_g ?? 0), 0)),
      lateKcal: timeKnown
        ? Math.round(sumItems(snap.entries.filter((e) => localHour(tz, new Date(e.logged_at)) >= 20).flatMap((e) => e.items)).kcal)
        : null,
      meals: snap.entries.length,
      training: (acts ?? []).map((a) => ({
        typeKey: a.type_key,
        km: a.distance_m == null ? null : Math.round(Number(a.distance_m) / 100) / 10,
        minutes: Math.round(Number(a.duration_s ?? 0) / 60),
      })),
    },
  };
}
```

- [ ] **Step 3: Rute `app/api/recovery/day/[date]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { loadRecoveryDay } from "@/lib/recovery/day";

export async function GET(_req: Request, ctx: RouteContext<"/api/recovery/day/[date]">) {
  const { date } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  return NextResponse.json(await loadRecoveryDay(u.user.id, date));
}
```

- [ ] **Step 4: Test** — i `recovery-view.test.ts`, ny `describe` (importer `addDays`, `zonedTime` fra `@loop/core`, `saveTokens` fra `@/lib/garmin/accounts`, `computeRecovery`, `loadRecoveryView`, `loadRecoveryDay`):

```ts
describe("recovery: tab and day sheet data", () => {
  let u: TestUser;
  let today: string;
  const TZ = "Europe/Oslo";

  beforeAll(async () => {
    u = await createTestUser("recovery-view");
    ({ today } = await seedUser(admin(), u.id, { days: 2 }));
  });
  afterAll(cleanup);

  it("without Garmin: an empty tab, no crash", async () => {
    const v = await loadRecoveryView(u.id);
    expect(v.garmin).toBe("none");
    expect(v.findings).toEqual([]);
    expect(v.curves.hrv).toEqual([]);
  });

  it("with nights and food: curves with a normal band, findings in rank order, progress", async () => {
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    await admin().from("garmin_accounts").update({ recovery_backfilled_until: addDays(today, -39) }).eq("user_id", u.id);
    const nights = Array.from({ length: 60 }, (_, i) => ({
      user_id: u.id,
      local_date: addDays(today, -i),
      sleep_s: 27000,
      deep_s: 5400,
      light_s: 15000,
      rem_s: 6000,
      awake_s: 600,
      sleep_score: 70 + (i % 9),
      hrv_avg: 55 + (i % 7),
      resting_hr: 48 + (i % 4),
    }));
    await admin().from("recovery_days").insert(nights);
    const y = addDays(today, -1);
    const { data: es } = await admin()
      .from("food_entries")
      .insert([
        { user_id: u.id, logged_at: zonedTime(y, "12:00", TZ).toISOString(), local_date: y, meal_type: "lunch", source: "quick" },
        { user_id: u.id, logged_at: zonedTime(y, "21:15", TZ).toISOString(), local_date: y, meal_type: "dinner", source: "quick" },
      ])
      .select("id");
    await admin().from("food_items").insert(es!.map((e, i) => ({ user_id: u.id, food_entry_id: e.id, name: i ? "Wine" : "Pasta", kcal: i ? 250 : 900, carbs_g: i ? 5 : 120, protein_g: 30, alcohol_g: i ? 24 : 0 })));
    await computeRecovery(u.id, today, { force: true });

    const v = await loadRecoveryView(u.id);
    expect(v.garmin).toBe("active");
    expect(v.historyDays).toBe(40);
    expect(v.curves.hrv).toHaveLength(30);
    expect(v.curves.hrv.at(-1)!.low).not.toBeNull();
    expect(v.findings.length).toBeLessThanOrEqual(5);
    expect(v.needsData.every((f) => f.kind === "needs_data" && f.source === "engine")).toBe(true);

    const d = await loadRecoveryDay(u.id, today);
    expect(d.night!.sleepS).toBe(27000);
    expect(d.normal.hrv.low).not.toBeNull();
    expect(d.before.kcal).toBe(2600 + 900 + 250); // seeded day + pasta + wine
    expect(d.before.meals).toBe(3); // seeded day entry + 2
    expect(d.before.alcoholG).toBe(24);
    expect(d.before.lateKcal).toBe(250);
  });
});
```

Run: `pnpm typecheck && pnpm exec vitest run tests/integration/recovery-view.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/recovery/view.ts apps/web/lib/recovery/day.ts "apps/web/app/api/recovery/day/[date]/route.ts" tests/integration/recovery-view.test.ts
git commit -m "feat(recovery): data for the tab (findings, curves, progress) and the day sheet"
```

---

### Task 5: Fanen (uten AI)

**Files:**
- Create: `apps/web/lib/recovery/text.ts`, `apps/web/components/recovery/FindingsList.tsx`, `FindingSheet.tsx`, `RecoveryCurves.tsx`, `DaySheet.tsx`, `MoreLists.tsx`, `RecoveryScreen.tsx`
- Modify: `apps/web/app/(app)/recovery/page.tsx`, `apps/web/messages/en.json`

**Interfaces:**
- Consumes: `RecoveryView`, `FindingRow`, `RecoveryDay` (Task 4); `GET /api/recovery/day/[date]`.
- Produces: `findingParams(f: FindingRow): { factor: string; high: string; low: string; outcome: string; diff: string; better: boolean }` (tekstparametre, ingen i18n), komponentene over. `DaySheet` tar `{ date: ISODate | null; onClose; whySlot?: (date: ISODate) => React.ReactNode }` så Task 8 kan sette inn «Why?».

- [ ] **Step 1: `lib/recovery/text.ts`** (rene funksjoner, ingen server-only — brukes av klientkomponenter)

```ts
import type { RecoveryFactor, RecoveryOutcome } from "@loop/core";
import type { FindingRow } from "./view";

const fmt = (v: number | null, digits = 0) => (v == null ? "" : v.toLocaleString("en", { maximumFractionDigits: digits }));
const UNIT: Record<RecoveryFactor, { digits: number; unit: string }> = {
  deficit: { digits: 0, unit: "kcal" },
  deficit3: { digits: 0, unit: "kcal" },
  carbs: { digits: 1, unit: "g/kg" },
  protein: { digits: 1, unit: "g/kg" },
  steps: { digits: 0, unit: "steps" },
  sleepScore: { digits: 0, unit: "" },
  hrv: { digits: 0, unit: "ms" },
  daysSinceHard: { digits: 0, unit: "days" },
  alcohol: { digits: 0, unit: "" },
  late: { digits: 0, unit: "" },
  hard: { digits: 0, unit: "" },
  long: { digits: 0, unit: "" },
};
const OUT_UNIT: Record<RecoveryOutcome, string> = { sleepScore: "", hrv: " ms", restingHr: " bpm", runForm: " SD" };
/** Higher is better for these outcomes; resting HR is better lower. */
const HIGHER_IS_BETTER: Record<RecoveryOutcome, boolean> = { sleepScore: true, hrv: true, restingHr: false, runForm: true };

/** Numbers for the i18n templates: bounds in the factor's unit, the outcome difference with sign and unit. */
export function findingParams(f: FindingRow) {
  const u = UNIT[f.factor];
  const diff = f.high.mean != null && f.low.mean != null ? f.high.mean - f.low.mean : 0;
  const shown = f.outcome === "runForm" ? Math.round(diff * 10) / 10 : Math.round(diff);
  return {
    high: `${fmt(f.high.bound, u.digits)}${u.unit ? ` ${u.unit}` : ""}`,
    low: `${fmt(f.low.bound, u.digits)}${u.unit ? ` ${u.unit}` : ""}`,
    diff: `${shown > 0 ? "+" : shown < 0 ? "−" : ""}${Math.abs(shown)}${OUT_UNIT[f.outcome]}`,
    better: diff === 0 ? true : (diff > 0) === HIGHER_IS_BETTER[f.outcome],
    nHigh: f.high.n,
    nLow: f.low.n,
    have: Math.min(f.high.n, f.low.n),
    needed: f.needed,
  };
}
```

- [ ] **Step 2: Tekster** (`recovery` i `en.json` blir)

```json
"recovery": {
  "title": "Recovery",
  "findings": "What affects you",
  "noFindings": "No clear links yet. Keep logging food and wearing your watch at night.",
  "curves": "Last 30 days",
  "more": "More",
  "noEffect": "No clear link",
  "needsData": "Needs more data",
  "progress": "{have} of {needed} days",
  "unclear": "Not clear yet",
  "training": "Likely training",
  "fromAi": "Suggested by AI",
  "controlled": "Holds without hard training days",
  "nights": "{high} vs {low} days",
  "daysHigh": "days, first group",
  "daysLow": "days, second group",
  "noGarmin": "Connect Garmin to see how food, training and sleep affect each other.",
  "connect": "Connect Garmin",
  "fetching": "Fetching sleep data: {days} of 90 days",
  "metric": { "sleepScore": "Sleep score", "hrv": "HRV", "restingHr": "Resting HR", "runForm": "Run form" },
  "factor": {
    "deficit": { "high": "Deficit over {v}", "low": "under {v}" },
    "deficit3": { "high": "3-day deficit over {v}", "low": "under {v}" },
    "carbs": { "high": "Carbs over {v}", "low": "under {v}" },
    "protein": { "high": "Protein over {v}", "low": "under {v}" },
    "steps": { "high": "Over {v}", "low": "under {v}" },
    "sleepScore": { "high": "Sleep score over {v}", "low": "under {v}" },
    "hrv": { "high": "HRV over {v}", "low": "under {v}" },
    "daysSinceHard": { "high": "{v} or more since a hard day", "low": "{v} or fewer" },
    "alcohol": { "high": "Days with alcohol", "low": "days without" },
    "late": { "high": "Late meals (300+ kcal after 8 pm)", "low": "days without" },
    "hard": { "high": "Hard training days", "low": "other days" },
    "long": { "high": "Long runs", "low": "other days" }
  },
  "outcome": {
    "sleepScore": "sleep score {diff}",
    "hrv": "HRV {diff}",
    "restingHr": "resting HR {diff}",
    "runForm": "run form {diff}"
  },
  "when": { "next": "the next morning", "same": "the same day", "before": "the days before" },
  "day": {
    "sleep": "Sleep",
    "deep": "Deep", "light": "Light", "rem": "REM", "awake": "Awake",
    "normal": "normal {low}–{high}",
    "dayBefore": "The day before",
    "kcal": "{kcal} of {target} kcal",
    "carbs": "Carbs", "protein": "Protein", "alcohol": "Alcohol", "late": "After 8 pm", "lateUnknown": "time not set",
    "training": "Training", "rest": "Rest day",
    "noNight": "No sleep recorded this night."
  }
}
```

- [ ] **Step 3: `FindingsList.tsx` + `FindingSheet.tsx`**

`FindingsList.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ListRow } from "@/components/tasuki/ListRow";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { findingParams } from "@/lib/recovery/text";
import type { FindingRow } from "@/lib/recovery/view";
import { FindingSheet } from "./FindingSheet";

/** One line per finding: "Deficit over 820 kcal: HRV −6 ms the next morning", with n under. Tap → sheet. */
export function FindingsList({ findings }: { findings: FindingRow[] }) {
  const t = useTranslations("recovery");
  const [open, setOpen] = useState<FindingRow | null>(null);
  return (
    <section>
      <SectionHead title={t("findings")} />
      {!findings.length && <p className="border-b border-border py-3 text-[13px] text-muted-foreground">{t("noFindings")}</p>}
      {findings.map((f) => {
        const p = findingParams(f);
        return (
          <ListRow
            key={f.questionId}
            onClick={() => setOpen(f)}
            title={`${t(`factor.${f.factor}.high`, { v: p.high })}: ${t(`outcome.${f.outcome}`, { diff: p.diff })}`}
            sub={`${t(`when.${f.lag > 0 ? "next" : f.lag === 0 ? "same" : "before"}`)}, ${t("nights", { high: p.nHigh, low: p.nLow })}${f.source === "ai" ? `, ${t("fromAi").toLowerCase()}` : ""}`}
            leading={<span aria-hidden className={p.better ? "h-8 w-1 bg-success" : "h-8 w-1 bg-primary"} />}
          />
        );
      })}
      <FindingSheet finding={open} onClose={() => setOpen(null)} />
    </section>
  );
}
```

`FindingSheet.tsx` (to grupper som punkt + snitt-strek; bruker `recharts` som `WeightChart`):

```tsx
"use client";

import { useTranslations } from "next-intl";
import { BottomSheet } from "@/components/common/BottomSheet";
import { StatRow } from "@/components/tasuki/StatRow";
import { findingParams } from "@/lib/recovery/text";
import type { FindingRow } from "@/lib/recovery/view";

/** The two groups side by side: mean difference, how many days each, what was controlled for. */
export function FindingSheet({ finding, onClose }: { finding: FindingRow | null; onClose: () => void }) {
  const t = useTranslations("recovery");
  if (!finding) return <BottomSheet open={false} onOpenChange={onClose} title="">{null}</BottomSheet>;
  const p = findingParams(finding);
  const max = Math.max(Math.abs(finding.high.mean ?? 0), Math.abs(finding.low.mean ?? 0), 1);
  const bar = (m: number | null) => `${Math.round((Math.abs(m ?? 0) / max) * 100)}%`;
  return (
    <BottomSheet open onOpenChange={(o) => !o && onClose()} title={t(`metric.${finding.outcome}`)}>
      <div className="flex flex-col gap-4 pt-3">
        <p className="num text-[44px] font-black leading-none [font-stretch:62%]">{p.diff}</p>
        <div className="flex flex-col gap-3">
          {[
            { label: t(`factor.${finding.factor}.high`, { v: p.high }), g: finding.high },
            { label: t(`factor.${finding.factor}.low`, { v: p.low }), g: finding.low },
          ].map(({ label, g }) => (
            <div key={label}>
              <p className="text-[13px] font-semibold">{label}</p>
              <div className="mt-1 h-2.5 w-full bg-muted">
                <div className="h-full bg-foreground" style={{ width: bar(g.mean) }} />
              </div>
            </div>
          ))}
        </div>
        <StatRow items={[{ value: p.nHigh, label: t("daysHigh") }, { value: p.nLow, label: t("daysLow") }]} />
        {finding.controlOk && <p className="text-[13px] text-muted-foreground">{t("controlled")}</p>}
        {finding.source === "ai" && <p className="text-[13px] text-muted-foreground">{t("fromAi")}</p>}
      </div>
    </BottomSheet>
  );
}
```

(Stolpene viser avvik fra egen normal i hver gruppe; begge grupper normaliseres mot den største.)

- [ ] **Step 4: `RecoveryCurves.tsx`** (klient; én liten graf per mål, bånd som skygge, trykk på punkt → `onPick(date)`)

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Area, ComposedChart, Line, ResponsiveContainer, Scatter, XAxis, YAxis } from "recharts";
import type { CurvePoint, ISODate } from "@loop/core";
import { SectionHead } from "@/components/tasuki/SectionHead";

type Key = "sleepScore" | "hrv" | "restingHr" | "runForm";
const ts = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

export function RecoveryCurves({ curves, onPick }: { curves: Record<Key, CurvePoint[]>; onPick: (date: ISODate) => void }) {
  const t = useTranslations("recovery");
  const keys: Key[] = ["sleepScore", "hrv", "restingHr", "runForm"];
  return (
    <section>
      <SectionHead title={t("curves")} />
      {keys.map((k) => {
        const pts = curves[k];
        if (!pts.length) return null;
        const last = pts.at(-1)!;
        const data = pts.map((p) => ({ x: ts(p.date), date: p.date, v: p.value, band: p.low != null && p.high != null ? [p.low, p.high] : null }));
        return (
          <div key={k} className="border-b border-border py-3">
            <div className="flex items-baseline justify-between">
              <p className="font-bold">{t(`metric.${k}`)}</p>
              <p className="num text-[17px] font-extrabold">{k === "runForm" ? last.value.toFixed(1) : Math.round(last.value)}</p>
            </div>
            <div className="mt-1 h-16 w-full">
              <ResponsiveContainer>
                <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} onClick={(e) => e?.activePayload?.[0] && onPick(e.activePayload[0].payload.date)}>
                  <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} hide />
                  <YAxis domain={["auto", "auto"]} hide />
                  <Area dataKey="band" stroke="none" fill="var(--muted)" isAnimationActive={false} />
                  <Line dataKey="v" stroke="var(--foreground)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Scatter data={[data.at(-1)]} dataKey="v" fill="var(--primary)" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </section>
  );
}
```

(Hvis recharts-typene for `onClick`-payload ikke stemmer med denne versjonen: hent `date` via `activeLabel` (x-verdien) og slå opp i `data`; ingen ruling nødvendig.)

- [ ] **Step 5: `DaySheet.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ISODate } from "@loop/core";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ListRow } from "@/components/tasuki/ListRow";
import { SectionHead } from "@/components/tasuki/SectionHead";
import type { RecoveryDay } from "@/lib/recovery/day";

const PHASES = [
  { key: "deep", field: "deepS", color: "var(--w-long)" },
  { key: "light", field: "lightS", color: "var(--w-easy)" },
  { key: "rem", field: "remS", color: "var(--w-tempo)" },
  { key: "awake", field: "awakeS", color: "var(--border)" },
] as const;
const hm = (s: number | null) => (s == null ? "–" : `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`);

export function DaySheet({ date, onClose, whySlot }: { date: ISODate | null; onClose: () => void; whySlot?: (date: ISODate) => React.ReactNode }) {
  const t = useTranslations("recovery");
  const format = useFormatter();
  const [day, setDay] = useState<RecoveryDay | null>(null);
  useEffect(() => {
    setDay(null);
    if (!date) return;
    fetch(`/api/recovery/day/${date}`).then((r) => (r.ok ? r.json() : null)).then(setDay).catch(() => setDay(null));
  }, [date]);

  const title = date ? format.dateTime(new Date(`${date}T00:00:00Z`), { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }) : "";
  const n = day?.night;
  const total = n ? PHASES.reduce((s, p) => s + (n[p.field] ?? 0), 0) : 0;
  const normal = (k: "sleepScore" | "hrv" | "restingHr") =>
    day?.normal[k].low != null ? t("day.normal", { low: Math.round(day.normal[k].low!), high: Math.round(day.normal[k].high!) }) : undefined;

  return (
    <BottomSheet open={!!date} onOpenChange={(o) => !o && onClose()} title={title}>
      {!day ? (
        <div className="mt-4 h-40 animate-pulse rounded-md bg-muted" />
      ) : (
        <div className="flex flex-col pt-2">
          {n ? (
            <>
              <p className="num text-[44px] font-black leading-none [font-stretch:62%]">{hm(n.sleepS)}</p>
              <div aria-hidden className="mt-2 flex h-3 w-full gap-[2px]">
                {PHASES.map((p) => (
                  <span key={p.key} style={{ flex: n[p.field] ?? 0, background: p.color }} />
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {PHASES.filter((p) => total > 0).map((p) => `${t(`day.${p.key}`)} ${hm(n[p.field])}`).join(", ")}
              </p>
              <ListRow title={t("metric.sleepScore")} sub={normal("sleepScore")} value={n.sleepScore ?? "–"} />
              <ListRow title={t("metric.hrv")} sub={normal("hrv")} value={n.hrv != null ? `${n.hrv} ms` : "–"} />
              <ListRow title={t("metric.restingHr")} sub={normal("restingHr")} value={n.restingHr ?? "–"} />
            </>
          ) : (
            <p className="py-3 text-[13px] text-muted-foreground">{t("day.noNight")}</p>
          )}

          <SectionHead title={t("day.dayBefore")} />
          <ListRow title={t("day.kcal", { kcal: day.before.kcal, target: day.before.targetKcal })} />
          <ListRow title={t("day.carbs")} value={`${day.before.carbsG} g`} />
          <ListRow title={t("day.protein")} value={`${day.before.proteinG} g`} />
          {day.before.alcoholG > 0 && <ListRow title={t("day.alcohol")} value={`${day.before.alcoholG} g`} />}
          <ListRow title={t("day.late")} value={day.before.lateKcal == null ? t("day.lateUnknown") : `${day.before.lateKcal} kcal`} />
          <ListRow
            title={t("day.training")}
            sub={day.before.training.length ? day.before.training.map((a) => `${a.typeKey.replace(/_/g, " ")} ${a.km != null ? `${a.km} km` : `${a.minutes} min`}`).join(", ") : t("day.rest")}
          />
          {whySlot && date && <div className="mt-4">{whySlot(date)}</div>}
        </div>
      )}
    </BottomSheet>
  );
}
```

- [ ] **Step 6: `MoreLists.tsx`** (sammenfoldet)

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { ListRow } from "@/components/tasuki/ListRow";
import { findingParams } from "@/lib/recovery/text";
import type { FindingRow } from "@/lib/recovery/view";
import { cn } from "@/lib/utils";

/** "No clear link" and "Needs more data", folded away by default. */
export function MoreLists({ noEffect, needsData }: { noEffect: FindingRow[]; needsData: FindingRow[] }) {
  const t = useTranslations("recovery");
  const [open, setOpen] = useState(false);
  if (!noEffect.length && !needsData.length) return null;
  const name = (f: FindingRow) => `${t(`factor.${f.factor}.high`, { v: findingParams(f).high })}: ${t(`metric.${f.outcome}`)}`;
  const status = (f: FindingRow) => {
    const p = findingParams(f);
    return f.reason === "few_days" ? t("progress", { have: p.have, needed: p.needed }) : t(f.reason === "training" ? "training" : "unclear");
  };
  return (
    <section className="mt-6">
      <button onClick={() => setOpen(!open)} className="flex w-full items-baseline justify-between border-b-2 border-foreground pb-1.5">
        <span className="cond text-[22px] leading-none">{t("more")}</span>
        <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          {!!noEffect.length && <p className="mt-3 text-[13px] font-bold">{t("noEffect")}</p>}
          {noEffect.map((f) => <ListRow key={f.questionId} title={name(f)} />)}
          {!!needsData.length && <p className="mt-3 text-[13px] font-bold">{t("needsData")}</p>}
          {needsData.map((f) => <ListRow key={f.questionId} title={name(f)} sub={status(f)} />)}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Siden** — `app/(app)/recovery/page.tsx`:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/supabase/server";
import { loadRecoveryView } from "@/lib/recovery/view";
import { RECOVERY_HISTORY_DAYS } from "@/lib/recovery/fetch";
import { RecoveryScreen } from "@/components/recovery/RecoveryScreen";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function RecoveryPage() {
  const { user } = await requireUser();
  const t = await getTranslations("recovery");
  const v = await loadRecoveryView(user.id);

  if (v.garmin === "none") {
    return (
      <main className="flex flex-col px-[18px] pt-5">
        <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
        <p className="mt-6 text-[15px]">{t("noGarmin")}</p>
        <Link href="/profile#garmin" className={cn(buttonVariants(), "mt-4 h-12 self-start px-5")}>
          {t("connect")}
        </Link>
      </main>
    );
  }
  return (
    <main className="flex flex-col px-[18px] pb-4 pt-5">
      <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
      {v.historyDays < RECOVERY_HISTORY_DAYS && <p className="mt-2 text-[13px] text-muted-foreground">{t("fetching", { days: v.historyDays })}</p>}
      <RecoveryScreen view={v} />
    </main>
  );
}
```

`components/recovery/RecoveryScreen.tsx` (klient-skall som eier dagsarket; Task 8 setter inn AI):

```tsx
"use client";

import { useState } from "react";
import type { ISODate } from "@loop/core";
import type { RecoveryView } from "@/lib/recovery/view";
import { FindingsList } from "./FindingsList";
import { RecoveryCurves } from "./RecoveryCurves";
import { MoreLists } from "./MoreLists";
import { DaySheet } from "./DaySheet";

export function RecoveryScreen({ view, top, whySlot }: { view: RecoveryView; top?: React.ReactNode; whySlot?: (date: ISODate) => React.ReactNode }) {
  const [day, setDay] = useState<ISODate | null>(null);
  return (
    <>
      {top}
      <FindingsList findings={view.findings} />
      <RecoveryCurves curves={view.curves} onPick={setDay} />
      <MoreLists noEffect={view.noEffect} needsData={view.needsData} />
      <DaySheet date={day} onClose={() => setDay(null)} whySlot={whySlot} />
    </>
  );
}
```

- [ ] **Step 8: Sjekk**

Run: `pnpm typecheck && pnpm build`
Expected: rent. Kjør appen og åpne `/recovery` som en innlogget bruker med data (bruk smoke-seeden fra Task 9 hvis den allerede finnes, ellers din egen bruker lokalt): ingen konsollfeil, dagsark åpner ved trykk på kurve.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/recovery/text.ts apps/web/components/recovery "apps/web/app/(app)/recovery/page.tsx" apps/web/messages/en.json
git commit -m "feat(recovery): the Recovery tab with findings, curves, day sheet and folded lists"
```

---

### Task 6: AI-kjernen (skjemaer, prompts, grunnregel)

**Files:**
- Create: `packages/core/src/recovery/ai.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/integration/recovery-ai.test.ts` (første describe, ren)

**Interfaces:**
- Produces:
  - `RECOVERY_PROMPT_VERSION = 1`
  - `GroundedSentence = { text: string; refs: string[] }`, `WeeklySummarySchema` (`{ headline: string; sentences: GroundedSentence[]; tips: GroundedSentence[] }`), `DayAnswerSchema` (`{ sentences: GroundedSentence[] }`), `QuestionProposalsSchema` (`{ proposals: { factor; transform; threshold: number | null; outcome; lag: number; rationale: string }[] }`)
  - `keepGrounded(sentences: GroundedSentence[], allowed: ReadonlySet<string>, max: number): GroundedSentence[]`
  - `DAY_FIELDS` (feltnavn som kan henvises til), `dayRefs(rows: AiDayRow[]): Set<string>`, `AiDayRow`, `AiFinding`
  - `RECOVERY_SUMMARY_PROMPT`, `RECOVERY_DAY_PROMPT`, `RECOVERY_QUESTIONS_PROMPT`
  - `summaryMessage(i)`, `dayMessage(i)`, `questionsMessage(i)` → `string`
  - `validateProposals(p, existing: RecoveryQuestion[]): RecoveryQuestion-spec[]` (fjerner ugyldige og kopier, maks 3)

- [ ] **Step 1: `ai.ts`**

```ts
import { z } from "zod";
import type { ISODate } from "../dates";
import { RECOVERY_FACTORS, RECOVERY_OUTCOMES, type RecoveryFactor, type RecoveryOutcome } from "./variables";
import type { RecoveryQuestion } from "./questions";

export const RECOVERY_PROMPT_VERSION = 1;

export const GroundedSentenceSchema = z.object({ text: z.string(), refs: z.array(z.string()) });
export type GroundedSentence = z.infer<typeof GroundedSentenceSchema>;
export const WeeklySummarySchema = z.object({ headline: z.string(), sentences: z.array(GroundedSentenceSchema), tips: z.array(GroundedSentenceSchema) });
export type WeeklySummary = z.infer<typeof WeeklySummarySchema>;
export const DayAnswerSchema = z.object({ sentences: z.array(GroundedSentenceSchema) });
export type DayAnswer = z.infer<typeof DayAnswerSchema>;
export const QuestionProposalsSchema = z.object({
  proposals: z.array(
    z.object({
      factor: z.enum(RECOVERY_FACTORS),
      transform: z.enum(["tertile", "binary", "threshold"]),
      threshold: z.number().nullable(),
      outcome: z.enum(RECOVERY_OUTCOMES),
      lag: z.number().int(),
      rationale: z.string(),
    }),
  ),
});
export type QuestionProposals = z.infer<typeof QuestionProposalsSchema>;

/** Fields the AI may cite per day: `day:<date>:<field>`. */
export const DAY_FIELDS = ["sleepScore", "hrv", "restingHr", "deficitKcal", "carbsPerKg", "proteinPerKg", "alcoholG", "lateKcal", "hard", "long", "steps"] as const;
export type DayField = (typeof DAY_FIELDS)[number];
export type AiDayRow = { date: ISODate } & Partial<Record<DayField, number | boolean | null>> & {
  /** Deviation from the user's own normal for night metrics (value − median of the previous 28 days). */
  vsNormal?: Partial<Record<"sleepScore" | "hrv" | "restingHr", number | null>>;
};
export interface AiFinding {
  id: string; // question id; cited as finding:<id>
  factor: RecoveryFactor;
  outcome: RecoveryOutcome;
  lag: number;
  highBound: number | null;
  lowBound: number | null;
  difference: number; // outcome units, high − low
  nHigh: number;
  nLow: number;
}

/** Every reference that points at something the AI was actually given. */
export function dayRefs(rows: readonly AiDayRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) for (const f of DAY_FIELDS) if (r[f] != null) out.add(`day:${r.date}:${f}`);
  return out;
}
export const findingRefs = (fs: readonly AiFinding[]) => new Set(fs.map((f) => `finding:${f.id}`));

/** The ground rule: a sentence stays only if it cites something and every citation is real. */
export function keepGrounded(sentences: readonly GroundedSentence[], allowed: ReadonlySet<string>, max: number): GroundedSentence[] {
  return sentences
    .filter((s) => s.text.trim() && s.refs.length > 0 && s.refs.every((r) => allowed.has(r)))
    .slice(0, max)
    .map((s) => ({ text: s.text.trim().slice(0, 300), refs: s.refs }));
}

const RULES = `Rules:
- Use only the numbers in the tables. Never guess, never add outside knowledge about the person.
- Every sentence needs refs: "finding:<id>" for a finding, "day:<date>:<field>" for a value in the day table. A sentence without valid refs is deleted.
- Correlation, not cause: say "on days with …", never "X causes Y". No medical advice, no diagnosis.
- Plain, short sentences. No emojis.
- Answer in the language given.`;

export const RECOVERY_SUMMARY_PROMPT = `You write a short weekly recovery summary for a runner from their own data.
You get last week's daily table (sleep score, HRV, resting heart rate with their deviation from the person's own normal, food and training), verified findings from a statistics engine, and next week's planned sessions.
Return a headline (max 8 words), 3–5 sentences about what stood out last week, and 1–2 concrete tips for next week that build on the findings.
${RULES}`;

export const RECOVERY_DAY_PROMPT = `You explain one morning's recovery numbers for a runner: why sleep, HRV or resting heart rate looked the way they did.
You get that morning and the day before, each number's deviation from the person's own normal, and verified findings.
Return 2–4 sentences. If no factor stands out, say so honestly in one sentence that cites the day's numbers.
${RULES}`;

export const RECOVERY_QUESTIONS_PROMPT = `You propose new questions for a statistics engine that looks for links in one person's data.
You get the variable catalogue (name, unit, mean, spread, number of days) and the questions already tested. You do not get any results linking variables to each other.
Propose at most 3 new questions: factor (from the catalogue), transform ("tertile" = top vs bottom third, "binary" = yes/no factors only, "threshold" = factor ≥ threshold, give the threshold), outcome, lag in days from −3 to 1 (1 = the outcome the next morning), and a one-sentence rationale.
Do not repeat existing questions. Prefer questions a runner would find useful.
Answer in the language given (the rationale only).`;

const table = (rows: readonly object[]) => JSON.stringify(rows);

export function summaryMessage(i: { language: string; weekStart: ISODate; days: AiDayRow[]; findings: AiFinding[]; nextWeek: { date: ISODate; title: string }[] }): string {
  return `Language: ${i.language}
Week starting ${i.weekStart}.
Day table: ${table(i.days)}
Findings: ${table(i.findings)}
Next week's sessions: ${table(i.nextWeek)}`;
}

export function dayMessage(i: { language: string; date: ISODate; days: AiDayRow[]; findings: AiFinding[] }): string {
  return `Language: ${i.language}
Explain the morning of ${i.date} (sleep the night before).
Day table (the day before, then the morning): ${table(i.days)}
Findings: ${table(i.findings)}`;
}

export function questionsMessage(i: {
  language: string;
  catalogue: { name: RecoveryFactor | RecoveryOutcome; kind: "factor" | "outcome"; unit: string; mean: number | null; sd: number | null; days: number }[];
  existing: { factor: string; transform: string; outcome: string; lag: number }[];
}): string {
  return `Language: ${i.language}
Catalogue: ${table(i.catalogue)}
Already tested: ${table(i.existing)}`;
}

const BINARY = new Set<RecoveryFactor>(["alcohol", "late", "hard", "long"]);
export const MAX_AI_QUESTIONS = 3;

/** Drops proposals the engine cannot test or already tests; at most 3 survive. */
export function validateProposals(p: QuestionProposals, existing: readonly Pick<RecoveryQuestion, "factor" | "outcome" | "lag">[]): (Omit<RecoveryQuestion, "id"> & { rationale: string })[] {
  const seen = new Set(existing.map((q) => `${q.factor}|${q.outcome}|${q.lag}`));
  const out: (Omit<RecoveryQuestion, "id"> & { rationale: string })[] = [];
  for (const q of p.proposals) {
    if (q.lag < -3 || q.lag > 1) continue;
    if (q.transform === "binary" && !BINARY.has(q.factor)) continue;
    if (q.transform !== "binary" && BINARY.has(q.factor)) continue;
    if (q.transform === "threshold" && (q.threshold == null || !Number.isFinite(q.threshold))) continue;
    const key = `${q.factor}|${q.outcome}|${q.lag}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ factor: q.factor, transform: q.transform, ...(q.transform === "threshold" ? { threshold: q.threshold! } : {}), outcome: q.outcome, lag: q.lag, rationale: q.rationale.slice(0, 300) });
    if (out.length === MAX_AI_QUESTIONS) break;
  }
  return out;
}
```

`index.ts`: `export * from "./recovery/ai";`

- [ ] **Step 2: Test** — ny fil `tests/integration/recovery-ai.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dayRefs, findingRefs, keepGrounded, RECOVERY_QUESTIONS, validateProposals } from "@loop/core";

describe("recovery AI: the ground rule and proposal checks", () => {
  const allowed = new Set([...dayRefs([{ date: "2026-10-01", hrv: 52, deficitKcal: 900, alcoholG: null }]), ...findingRefs([{ id: "deficit-hrv" } as never])]);

  it("keeps only sentences whose every reference exists", () => {
    const out = keepGrounded(
      [
        { text: "HRV was 52 ms.", refs: ["day:2026-10-01:hrv"] },
        { text: "Big deficits lower your HRV.", refs: ["finding:deficit-hrv", "day:2026-10-01:deficitKcal"] },
        { text: "You drank wine.", refs: ["day:2026-10-01:alcoholG"] }, // null in the table → not citable
        { text: "Sleep was great.", refs: [] },
        { text: "Made up.", refs: ["finding:nope"] },
      ],
      allowed,
      5,
    );
    expect(out.map((s) => s.text)).toEqual(["HRV was 52 ms.", "Big deficits lower your HRV."]);
  });

  it("proposals: unknown shapes, copies and more than 3 are dropped", () => {
    const out = validateProposals(
      {
        proposals: [
          { factor: "deficit", transform: "tertile", threshold: null, outcome: "hrv", lag: 1, rationale: "copy" },
          { factor: "steps", transform: "binary", threshold: null, outcome: "sleepScore", lag: 1, rationale: "binary on numbers" },
          { factor: "carbs", transform: "threshold", threshold: null, outcome: "runForm", lag: 1, rationale: "no threshold" },
          { factor: "protein", transform: "tertile", threshold: null, outcome: "restingHr", lag: 1, rationale: "ok 1" },
          { factor: "steps", transform: "threshold", threshold: 15000, outcome: "hrv", lag: 1, rationale: "ok 2" },
          { factor: "late", transform: "binary", threshold: null, outcome: "hrv", lag: 1, rationale: "ok 3" },
          { factor: "alcohol", transform: "binary", threshold: null, outcome: "runForm", lag: 1, rationale: "4th" },
          { factor: "hrv", transform: "tertile", threshold: null, outcome: "sleepScore", lag: -4, rationale: "lag out of range" },
        ],
      },
      RECOVERY_QUESTIONS,
    );
    expect(out.map((q) => q.rationale)).toEqual(["ok 1", "ok 2", "ok 3"]);
  });
});
```

Run: `pnpm typecheck && pnpm exec vitest run tests/integration/recovery-ai.test.ts` → Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/recovery/ai.ts packages/core/src/index.ts tests/integration/recovery-ai.test.ts
git commit -m "feat(core): recovery AI schemas, prompts and the citation ground rule"
```

---

### Task 7: AI-tjenesten (A, B, C) med samtykke og lagring

**Files:**
- Create: `apps/web/lib/ai/language.ts`, `apps/web/lib/ai/recovery.ts`, `apps/web/lib/recovery/insights.ts`, `apps/web/lib/recovery/status.ts`, `apps/web/app/api/recovery/summary/route.ts`, `apps/web/app/api/recovery/day/[date]/why/route.ts`, `apps/web/app/api/recovery/questions/route.ts`
- Modify: `apps/web/app/api/training/workout/[id]/fuel/route.ts` (bruk felles språkkart), `apps/web/lib/recovery/compute.ts` (kjør AI-spørsmål), `apps/web/lib/ai/pricing.ts` (ingen endring hvis modellen finnes)
- Test: `tests/integration/recovery-ai.test.ts` (ny describe med falsk AI)

**Interfaces:**
- Consumes: Task 6 (skjemaer, prompts, `keepGrounded`, `validateProposals`), `loadRecoveryDays`, `buildRecoveryRows`, `analyzeRecovery`, `getAiHealthConsent`, `resolveAnthropicKey`, `costUsd`, `weekStartOn`.
- Produces:
  - `languageOf(locale: string | null | undefined): string`
  - `interface RecoveryAi { ask<T>(apiKey: string, system: string, message: string, schema: z.ZodType<T>): Promise<AiResult<T>> }`, `type AiResult<T> = { ok: true; value: T; usage: TokenUsage; model: string } | { ok: false; error: "invalid_key" | "unavailable" | "refused" | "invalid_output"; usage: TokenUsage; model: string }`, `anthropicRecoveryAi: RecoveryAi`, `RECOVERY_MODEL`
  - `type InsightError = "consent_required" | "no_key" | "not_enough_data" | "invalid_key" | "unavailable" | "refused" | "invalid_output"`
  - `weeklySummary(userId, opts?: { ai?: RecoveryAi; today?: ISODate }): Promise<{ ok: true; summary: WeeklySummary; weekStart: ISODate } | { ok: false; error: InsightError }>`
  - `dayAnswer(userId, date, opts?: { ai?: RecoveryAi; refresh?: boolean }): Promise<{ ok: true; answer: DayAnswer; stale: boolean } | { ok: false; error: InsightError }>`
  - `proposeQuestions(userId, opts?: { ai?: RecoveryAi; today?: ISODate }): Promise<{ ok: true; created: number } | { ok: false; error: InsightError | "not_due" }>`
  - API: `POST /api/recovery/summary`, `POST /api/recovery/day/[date]/why` (body `{ refresh?: boolean }`), `POST /api/recovery/questions`; feil som `{ error }` med status 403 (`consent_required`), 402 (`no_key`), 409 (`not_enough_data`/`not_due`), 401/503/422 (AI-feil).

- [ ] **Step 1: `lib/ai/language.ts`** (flytt kartet ut av fuel-ruta og bruk det der)

```ts
const LANGUAGE: Record<string, string> = { nb: "Norwegian (bokmål)", nn: "Norwegian (nynorsk)", en: "English" };
export const languageOf = (locale: string | null | undefined): string => LANGUAGE[locale ?? "en"] ?? "English";
```

I fuel-ruta: slett den lokale `LANGUAGE`, importer `languageOf`, og bruk `language: languageOf(profile?.locale)`.

- [ ] **Step 2: `lib/ai/recovery.ts`**

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { TokenUsage } from "./pricing";

export const RECOVERY_MODEL = process.env.AI_RECOVERY_MODEL ?? "claude-sonnet-5";
const EFFORT = (process.env.AI_RECOVERY_EFFORT ?? "low") as "low" | "medium" | "high";

export type AiError = "invalid_key" | "unavailable" | "refused" | "invalid_output";
export type AiResult<T> = { ok: true; value: T; usage: TokenUsage; model: string } | { ok: false; error: AiError; usage: TokenUsage; model: string };

/** One structured question to the model. Tests pass a fake. */
export interface RecoveryAi {
  ask<T>(apiKey: string, system: string, message: string, schema: z.ZodType<T>): Promise<AiResult<T>>;
}

export const anthropicRecoveryAi: RecoveryAi = {
  async ask<T>(apiKey: string, system: string, message: string, schema: z.ZodType<T>): Promise<AiResult<T>> {
    const client = new Anthropic({ apiKey, maxRetries: 2 });
    const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const fail = (error: AiError): AiResult<T> => ({ ok: false, error, usage, model: RECOVERY_MODEL });
    let res: Anthropic.Message;
    try {
      res = await client.messages.create({
        model: RECOVERY_MODEL,
        max_tokens: 4000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: message }],
        output_config: { effort: EFFORT, format: zodOutputFormat(schema as z.ZodType<T> & z.ZodObject) },
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return fail("invalid_key");
      return fail("unavailable");
    }
    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
    if (res.stop_reason === "refusal") return fail("refused");
    if (res.stop_reason === "max_tokens") return fail("invalid_output");
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    try {
      const parsed = schema.safeParse(JSON.parse(text ?? ""));
      return parsed.success ? { ok: true, value: parsed.data, usage, model: RECOVERY_MODEL } : fail("invalid_output");
    } catch {
      return fail("invalid_output");
    }
  },
};
```

(Hvis `zodOutputFormat`-typen ikke godtar castet, bruk samme mønster som `fuel.ts` med `as never`; atferd uendret.)

- [ ] **Step 3: `lib/recovery/insights.ts`**

```ts
import "server-only";
import { createHash } from "node:crypto";
import {
  addDays,
  buildRecoveryRows,
  DayAnswerSchema,
  dayMessage,
  dayRefs,
  findingRefs,
  keepGrounded,
  localDate,
  questionsMessage,
  QuestionProposalsSchema,
  RECOVERY_DAY_PROMPT,
  RECOVERY_FACTORS,
  RECOVERY_OUTCOMES,
  RECOVERY_PROMPT_VERSION,
  RECOVERY_QUESTIONS,
  RECOVERY_QUESTIONS_PROMPT,
  RECOVERY_SUMMARY_PROMPT,
  summaryMessage,
  validateProposals,
  weekStartOn,
  WeeklySummarySchema,
  type AiDayRow,
  type AiFinding,
  type DayAnswer,
  type ISODate,
  type RecoveryDayInput,
  type RecoveryQuestion,
  type RecoveryRow,
  type WeeklySummary,
} from "@loop/core";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/db/types";
import { resolveAnthropicKey } from "@/lib/ai/keys";
import { costUsd } from "@/lib/ai/pricing";
import { languageOf } from "@/lib/ai/language";
import { anthropicRecoveryAi, type AiError, type RecoveryAi } from "@/lib/ai/recovery";
import { getAiHealthConsent } from "./consent";
import { loadRecoveryDays } from "./load";

export type InsightError = "consent_required" | "no_key" | "not_enough_data" | AiError;
const MIN_WEEK_NIGHTS = 3;
const QUESTIONS_EVERY_DAYS = 30;
const QUESTIONS_MIN_DAYS = 60;
const MAX_ACTIVE_AI_QUESTIONS = 9;

const db = () => createAdminSupabase();
const round = (v: number | null | undefined, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Consent first (no AI call without it), then the key. */
async function gate(userId: string): Promise<{ ok: true; apiKey: string; language: string; today: ISODate } | { ok: false; error: InsightError }> {
  if (!(await getAiHealthConsent(userId))) return { ok: false, error: "consent_required" };
  const apiKey = await resolveAnthropicKey(userId);
  if (!apiKey) return { ok: false, error: "no_key" };
  const { data: p } = await db().from("profiles").select("locale, timezone").eq("user_id", userId).single();
  return { ok: true, apiKey, language: languageOf(p?.locale), today: localDate(p?.timezone ?? "UTC") };
}

function aiRow(d: RecoveryDayInput, r: RecoveryRow | undefined): AiDayRow {
  return {
    date: d.date,
    sleepScore: d.sleepScore,
    hrv: d.hrv,
    restingHr: d.restingHr,
    deficitKcal: round(d.food?.deficitKcal),
    carbsPerKg: round(d.food?.carbsPerKg, 1),
    proteinPerKg: round(d.food?.proteinPerKg, 1),
    alcoholG: d.food && d.food.alcoholG > 0 ? round(d.food.alcoholG) : null,
    lateKcal: round(d.food?.lateKcal),
    hard: d.hard,
    long: d.long,
    steps: d.steps,
    vsNormal: { sleepScore: round(r?.outcomes.sleepScore), hrv: round(r?.outcomes.hrv), restingHr: round(r?.outcomes.restingHr) },
  };
}

async function verifiedFindings(userId: string): Promise<AiFinding[]> {
  const { data } = await db().from("recovery_findings").select("question_id, factor, outcome, lag, groups").eq("user_id", userId).eq("kind", "finding");
  return (data ?? []).map((f) => {
    const g = f.groups as unknown as { high: { n: number; mean: number | null; bound: number | null }; low: { n: number; mean: number | null; bound: number | null } };
    return {
      id: f.question_id,
      factor: f.factor as AiFinding["factor"],
      outcome: f.outcome as AiFinding["outcome"],
      lag: f.lag,
      highBound: round(g.high.bound, 1),
      lowBound: round(g.low.bound, 1),
      difference: round((g.high.mean ?? 0) - (g.low.mean ?? 0), 1) ?? 0,
      nHigh: g.high.n,
      nLow: g.low.n,
    };
  });
}

const usageCols = (r: { usage: { input: number; output: number; cacheRead: number; cacheWrite: number }; model: string }) => ({
  model: r.model,
  prompt_version: RECOVERY_PROMPT_VERSION,
  input_tokens: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite,
  output_tokens: r.usage.output,
  cost_usd: costUsd(r.model, r.usage),
});

/** A) Last full week (Monday–Sunday), made once the first time the tab opens after it ends. */
export async function weeklySummary(userId: string, opts: { ai?: RecoveryAi; today?: ISODate } = {}) {
  const g = await gate(userId);
  if (!g.ok) return g;
  const today = opts.today ?? g.today;
  const weekStart = addDays(weekStartOn(today, 1), -7);
  const { data: cached } = await db().from("recovery_summaries").select("content").eq("user_id", userId).eq("week_start", weekStart).maybeSingle();
  if (cached) return { ok: true as const, summary: cached.content as unknown as WeeklySummary, weekStart };

  const days = await loadRecoveryDays(userId, today);
  const rows = new Map(buildRecoveryRows(days, addDays(today, -89), today).map((r) => [r.date, r]));
  const week = days.filter((d) => d.date >= weekStart && d.date <= addDays(weekStart, 6));
  if (week.filter((d) => d.sleepScore != null || d.hrv != null).length < MIN_WEEK_NIGHTS) return { ok: false as const, error: "not_enough_data" as const };
  const table = week.map((d) => aiRow(d, rows.get(d.date)));
  const findings = await verifiedFindings(userId);
  const { data: next } = await db()
    .from("planned_workouts")
    .select("date, title")
    .eq("user_id", userId)
    .eq("status", "planned")
    .gte("date", today)
    .lte("date", addDays(weekStart, 13))
    .order("date");

  const ai = opts.ai ?? anthropicRecoveryAi;
  const res = await ai.ask(g.apiKey, RECOVERY_SUMMARY_PROMPT, summaryMessage({ language: g.language, weekStart, days: table, findings, nextWeek: next ?? [] }), WeeklySummarySchema);
  if (!res.ok) return { ok: false as const, error: res.error };
  const allowed = new Set([...dayRefs(table), ...findingRefs(findings)]);
  const summary: WeeklySummary = {
    headline: res.value.headline.trim().slice(0, 80),
    sentences: keepGrounded(res.value.sentences, allowed, 5),
    tips: keepGrounded(res.value.tips, allowed, 2),
  };
  // Nothing grounded left → nothing shown (headline alone says nothing).
  if (!summary.sentences.length && !summary.tips.length) summary.headline = "";
  await db().from("recovery_summaries").upsert({ user_id: userId, week_start: weekStart, content: summary as unknown as Json, ...usageCols(res) }, { onConflict: "user_id,week_start" });
  return { ok: true as const, summary, weekStart };
}

/** B) "Why?" for one morning. Stored with a fingerprint of its input; changed data → stale until asked again. */
export async function dayAnswer(userId: string, date: ISODate, opts: { ai?: RecoveryAi; refresh?: boolean } = {}) {
  const g = await gate(userId);
  if (!g.ok) return g;
  const days = await loadRecoveryDays(userId, date);
  const rows = new Map(buildRecoveryRows(days, addDays(date, -1), date).map((r) => [r.date, r]));
  const pick = [addDays(date, -1), date].map((d) => days.find((x) => x.date === d)).filter((d): d is RecoveryDayInput => !!d);
  const table = pick.map((d) => aiRow(d, rows.get(d.date)));
  if (!table.some((r) => r.sleepScore != null || r.hrv != null || r.restingHr != null)) return { ok: false as const, error: "not_enough_data" as const };
  const findings = await verifiedFindings(userId);
  const message = dayMessage({ language: g.language, date, days: table, findings });
  const inputHash = createHash("sha256").update(`${RECOVERY_PROMPT_VERSION}\n${message}`).digest("hex");

  const { data: cached } = await db().from("recovery_day_answers").select("content, input_hash").eq("user_id", userId).eq("local_date", date).eq("question", "why").maybeSingle();
  if (cached && !opts.refresh) return { ok: true as const, answer: cached.content as unknown as DayAnswer, stale: cached.input_hash !== inputHash };

  const ai = opts.ai ?? anthropicRecoveryAi;
  const res = await ai.ask(g.apiKey, RECOVERY_DAY_PROMPT, message, DayAnswerSchema);
  if (!res.ok) return { ok: false as const, error: res.error };
  const answer: DayAnswer = { sentences: keepGrounded(res.value.sentences, new Set([...dayRefs(table), ...findingRefs(findings)]), 4) };
  await db()
    .from("recovery_day_answers")
    .upsert({ user_id: userId, local_date: date, question: "why", content: answer as unknown as Json, input_hash: inputHash, ...usageCols(res) }, { onConflict: "user_id,local_date,question" });
  return { ok: true as const, answer, stale: false };
}

/** C) Once a month with ≥ 60 days of data: up to 3 new questions, tested by the engine with q ≤ 0.05. */
export async function proposeQuestions(userId: string, opts: { ai?: RecoveryAi; today?: ISODate } = {}) {
  const g = await gate(userId);
  if (!g.ok) return g;
  const today = opts.today ?? g.today;
  const { data: recent } = await db().from("recovery_ai_questions").select("id, created_at, spec, status").eq("user_id", userId).order("created_at", { ascending: false });
  const last = recent?.[0]?.created_at;
  if (last && Date.now() - Date.parse(last) < QUESTIONS_EVERY_DAYS * 86_400_000) return { ok: false as const, error: "not_due" as const };
  const days = await loadRecoveryDays(userId, today);
  const rows = buildRecoveryRows(days, addDays(today, -89), today);
  const withData = days.filter((d) => d.sleepScore != null || d.hrv != null).length;
  if (withData < QUESTIONS_MIN_DAYS) return { ok: false as const, error: "not_enough_data" as const };

  const stat = (vals: number[]) => {
    if (!vals.length) return { mean: null, sd: null };
    const m = vals.reduce((s, v) => s + v, 0) / vals.length;
    return { mean: round(m, 2), sd: round(Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, vals.length - 1)), 2) };
  };
  const UNIT: Record<string, string> = { deficit: "kcal", deficit3: "kcal", carbs: "g/kg", protein: "g/kg", steps: "steps", sleepScore: "score", hrv: "ms", restingHr: "bpm", runForm: "SD", daysSinceHard: "days" };
  // Per-variable numbers only: never anything that links a factor to an outcome (that would bias the test).
  const catalogue = [
    ...RECOVERY_FACTORS.map((f) => {
      const vals = rows.flatMap((r) => (r.factors[f] == null ? [] : [r.factors[f]!]));
      return { name: f, kind: "factor" as const, unit: UNIT[f] ?? "yes/no", ...stat(vals), days: vals.length };
    }),
    ...RECOVERY_OUTCOMES.map((o) => {
      const vals = rows.flatMap((r) => (r.outcomes[o] == null ? [] : [r.outcomes[o]!]));
      return { name: o, kind: "outcome" as const, unit: `${UNIT[o]} vs own normal`, ...stat(vals), days: vals.length };
    }),
  ];
  const existing: Pick<RecoveryQuestion, "factor" | "outcome" | "lag" | "transform">[] = [
    ...RECOVERY_QUESTIONS,
    ...(recent ?? []).map((r) => r.spec as unknown as RecoveryQuestion),
  ];
  const ai = opts.ai ?? anthropicRecoveryAi;
  const res = await ai.ask(g.apiKey, RECOVERY_QUESTIONS_PROMPT, questionsMessage({ language: g.language, catalogue, existing }), QuestionProposalsSchema);
  if (!res.ok) return { ok: false as const, error: res.error };
  const valid = validateProposals(res.value, existing);
  if (valid.length) {
    const { error } = await db()
      .from("recovery_ai_questions")
      .insert(valid.map(({ rationale, ...spec }) => ({ user_id: userId, spec: spec as unknown as Json, rationale, status: "testing", ...usageCols(res) })));
    if (error) throw error;
  }
  // Keep the newest few active; older testing questions that never passed are retired.
  const testing = (recent ?? []).filter((r) => r.status === "testing");
  const overflow = testing.length + valid.length - MAX_ACTIVE_AI_QUESTIONS;
  if (overflow > 0) await db().from("recovery_ai_questions").update({ status: "rejected" }).in("id", testing.slice(-overflow).map((r) => r.id));
  return { ok: true as const, created: valid.length };
}
```

- [ ] **Step 4: Motor kjører AI-spørsmål** — i `compute.ts`, etter `const results = analyzeRecovery(…)`:

```ts
  const { data: aiQs } = await db.from("recovery_ai_questions").select("id, spec").eq("user_id", userId).in("status", ["testing", "accepted"]);
  const aiQuestions: RecoveryQuestion[] = (aiQs ?? []).map((q) => ({ ...(q.spec as unknown as Omit<RecoveryQuestion, "id">), id: `ai-${q.id.slice(0, 8)}` }));
  // Stricter: q ≤ 0.05 within the AI family (spec §7.4).
  const aiResults = aiQuestions.length ? analyzeRecovery(rows, aiQuestions, { maxQ: 0.05 }) : [];
  const aiIdOf = new Map((aiQs ?? []).map((q) => [`ai-${q.id.slice(0, 8)}`, q.id]));
```

der `rows` er `buildRecoveryRows(...)`-resultatet (trekk det ut i en egen `const rows = …` og bruk det i begge kall). `insert`-mappingen tar `[...results.map((r) => ({ ...base(r), source: "engine" })), ...aiResults.map((r) => ({ ...base(r), source: "ai", ai_question_id: aiIdOf.get(r.questionId) }))]`, med `base(r)` = dagens felter. Etter insert:

```ts
  for (const r of aiResults) {
    await db.from("recovery_ai_questions").update({ status: r.kind === "finding" ? "accepted" : "testing" }).eq("id", aiIdOf.get(r.questionId)!);
  }
```

Importer `type RecoveryQuestion` fra `@loop/core`.

- [ ] **Step 5: API-ruter**

`lib/recovery/status.ts` (Next.js tillater ikke andre eksporter enn HTTP-metoder og konfig fra `route.ts`):

```ts
import type { InsightError } from "./insights";

export const STATUS: Record<InsightError | "not_due", number> = {
  consent_required: 403,
  no_key: 402,
  not_enough_data: 409,
  not_due: 409,
  invalid_key: 401,
  unavailable: 503,
  refused: 422,
  invalid_output: 422,
};
```

`app/api/recovery/summary/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { weeklySummary } from "@/lib/recovery/insights";
import { STATUS } from "@/lib/recovery/status";

export const maxDuration = 60;

export async function POST() {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await weeklySummary(u.user.id);
  return r.ok ? NextResponse.json({ summary: r.summary, weekStart: r.weekStart }) : NextResponse.json({ error: r.error }, { status: STATUS[r.error] });
}
```

`app/api/recovery/day/[date]/why/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/api/user";
import { dayAnswer } from "@/lib/recovery/insights";
import { STATUS } from "@/lib/recovery/status";

export const maxDuration = 60;
const Body = z.object({ refresh: z.boolean().optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/recovery/day/[date]/why">) {
  const { date } = await ctx.params;
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { refresh } = Body.parse((await req.json().catch(() => ({}))) ?? {});
  const r = await dayAnswer(u.user.id, date, { refresh });
  return r.ok ? NextResponse.json({ answer: r.answer, stale: r.stale }) : NextResponse.json({ error: r.error }, { status: STATUS[r.error] });
}
```

`app/api/recovery/questions/route.ts`:

```ts
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api/user";
import { proposeQuestions } from "@/lib/recovery/insights";
import { STATUS } from "@/lib/recovery/status";

export const maxDuration = 60;

export async function POST() {
  const u = await apiUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await proposeQuestions(u.user.id);
  return r.ok ? NextResponse.json({ created: r.created }) : NextResponse.json({ error: r.error }, { status: STATUS[r.error] });
}
```

- [ ] **Step 6: Integrasjonstest med falsk AI** — i `recovery-ai.test.ts`, ny `describe` (importer `afterAll, beforeAll`, `addDays`, `weekStartOn`, `zonedTime`, `encryptSecret` fra `@/lib/ai/crypto`, `saveTokens`, `setAiHealthConsent`, `weeklySummary`, `dayAnswer`, `proposeQuestions`, `computeRecovery`, `type RecoveryAi`, `seedUser`, `admin, cleanup, createTestUser`):

```ts
class FakeAi implements RecoveryAi {
  calls: { system: string; message: string }[] = [];
  next: unknown = null;
  async ask<T>(_k: string, system: string, message: string) {
    this.calls.push({ system, message });
    return { ok: true as const, value: this.next as T, usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, model: "claude-sonnet-5" };
  }
}

describe("recovery AI: consent, grounding, caching", () => {
  let u: TestUser;
  let today: string;
  const ai = new FakeAi();
  const TZ = "Europe/Oslo";

  beforeAll(async () => {
    u = await createTestUser("recovery-ai");
    ({ today } = await seedUser(admin(), u.id, { days: 2 }));
    await saveTokens(u.id, JSON.stringify({ di_token: "fake" }));
    const nights = Array.from({ length: 75 }, (_, i) => ({ user_id: u.id, local_date: addDays(today, -i), sleep_s: 27000, sleep_score: 70 + (i % 9), hrv_avg: 55 + (i % 7), resting_hr: 48 + (i % 4) }));
    await admin().from("recovery_days").insert(nights);
  });
  afterAll(cleanup);

  it("consent off: no AI call at all", async () => {
    expect(await weeklySummary(u.id, { ai })).toEqual({ ok: false, error: "consent_required" });
    expect(await dayAnswer(u.id, today, { ai })).toEqual({ ok: false, error: "consent_required" });
    expect(await proposeQuestions(u.id, { ai })).toEqual({ ok: false, error: "consent_required" });
    expect(ai.calls).toHaveLength(0);
  });

  it("consent on but no key: a clear error, still no AI call", async () => {
    await setAiHealthConsent(u.id, true);
    expect(await weeklySummary(u.id, { ai })).toEqual({ ok: false, error: "no_key" });
    expect(ai.calls).toHaveLength(0);
    const enc = encryptSecret("sk-ant-test-0000000000000000");
    await admin().from("api_keys").insert({ user_id: u.id, provider: "anthropic", ciphertext: enc.ciphertext, iv: enc.iv, auth_tag: enc.authTag, last4: "0000" });
  });

  it("weekly summary: sentences with made-up references are removed; stored once per week", async () => {
    const weekStart = addDays(weekStartOn(today, 1), -7);
    ai.next = {
      headline: "Steady week",
      sentences: [
        { text: "HRV held up.", refs: [`day:${addDays(weekStart, 2)}:hrv`] },
        { text: "Invented.", refs: ["finding:made-up"] },
        { text: "No refs.", refs: [] },
      ],
      tips: [{ text: "Keep it up.", refs: [`day:${addDays(weekStart, 3)}:sleepScore`] }],
    };
    const r = await weeklySummary(u.id, { ai });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.sentences.map((s) => s.text)).toEqual(["HRV held up."]);
    expect(r.summary.tips).toHaveLength(1);
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.message).toContain("Day table");
    await weeklySummary(u.id, { ai });
    expect(ai.calls).toHaveLength(1); // cached
  });

  it("nothing grounded left → nothing shown", async () => {
    await admin().from("recovery_summaries").delete().eq("user_id", u.id);
    ai.next = { headline: "Wow", sentences: [{ text: "Made up.", refs: ["finding:x"] }], tips: [] };
    const r = await weeklySummary(u.id, { ai });
    expect(r.ok && r.summary).toEqual({ headline: "", sentences: [], tips: [] });
  });

  it("Why?: cached per day, marked stale when the day's food changes, refreshed only on request", async () => {
    ai.next = { sentences: [{ text: "HRV was in your normal range.", refs: [`day:${today}:hrv`] }] };
    const first = await dayAnswer(u.id, today, { ai });
    expect(first.ok && first.answer.sentences).toHaveLength(1);
    const calls = ai.calls.length;
    const again = await dayAnswer(u.id, today, { ai });
    expect(again.ok && again.stale).toBe(false);
    expect(ai.calls.length).toBe(calls);

    const y = addDays(today, -1);
    const { data: es } = await admin()
      .from("food_entries")
      .insert([
        { user_id: u.id, logged_at: zonedTime(y, "12:00", TZ).toISOString(), local_date: y, meal_type: "lunch", source: "quick" },
        { user_id: u.id, logged_at: zonedTime(y, "18:00", TZ).toISOString(), local_date: y, meal_type: "dinner", source: "quick" },
      ])
      .select("id");
    await admin().from("food_items").insert(es!.map((e) => ({ user_id: u.id, food_entry_id: e.id, name: "Meal", kcal: 900, carbs_g: 100, protein_g: 40 })));
    const stale = await dayAnswer(u.id, today, { ai });
    expect(stale.ok && stale.stale).toBe(true);
    expect(ai.calls.length).toBe(calls);
    const fresh = await dayAnswer(u.id, today, { ai, refresh: true });
    expect(fresh.ok && fresh.stale).toBe(false);
    expect(ai.calls.length).toBe(calls + 1);
  });

  it("AI questions: the catalogue has no factor–outcome numbers; valid ones are stored and tested with q ≤ 0.05", async () => {
    ai.next = {
      proposals: [
        { factor: "steps", transform: "threshold", threshold: 12000, outcome: "hrv", lag: 1, rationale: "Busy days" },
        { factor: "deficit", transform: "tertile", threshold: null, outcome: "hrv", lag: 1, rationale: "copy" },
      ],
    };
    const r = await proposeQuestions(u.id, { ai });
    expect(r).toEqual({ ok: true, created: 1 });
    const msg = ai.calls.at(-1)!.message;
    expect(msg).toContain("Catalogue");
    expect(msg).not.toMatch(/effect|q_value|finding/i);
    expect(await proposeQuestions(u.id, { ai })).toEqual({ ok: false, error: "not_due" });

    await computeRecovery(u.id, today, { force: true });
    const { data: rows } = await admin().from("recovery_findings").select("question_id, source, ai_question_id").eq("user_id", u.id).eq("source", "ai");
    expect(rows).toHaveLength(1);
    expect(rows![0]!.ai_question_id).not.toBeNull();
  });

  it("switching consent off again stops everything", async () => {
    await setAiHealthConsent(u.id, false);
    const n = ai.calls.length;
    expect((await dayAnswer(u.id, today, { ai, refresh: true })).ok).toBe(false);
    expect(ai.calls.length).toBe(n);
  });
});
```

Run: `pnpm typecheck && pnpm exec vitest run tests/integration/recovery-ai.test.ts tests/integration/recovery-compute.test.ts tests/integration/training.test.ts`
Expected: alle PASS (training dekker fuel-ruta indirekte via typecheck; compute-testen viser at motoren uten AI-spørsmål er uendret).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/ai/language.ts apps/web/lib/ai/recovery.ts apps/web/lib/recovery/insights.ts apps/web/lib/recovery/status.ts apps/web/lib/recovery/compute.ts apps/web/app/api/recovery "apps/web/app/api/training/workout/[id]/fuel/route.ts" tests/integration/recovery-ai.test.ts
git commit -m "feat(recovery): AI weekly summary, Why? and question proposals behind consent, citations enforced"
```

---

### Task 8: AI i fanen

**Files:**
- Create: `apps/web/components/recovery/WeeklySummary.tsx`, `apps/web/components/recovery/WhyButton.tsx`, `apps/web/components/recovery/AiOff.tsx`
- Modify: `apps/web/app/(app)/recovery/page.tsx`, `apps/web/components/recovery/RecoveryScreen.tsx` (ingen endring hvis props allerede finnes), `apps/web/messages/en.json`

**Interfaces:**
- Consumes: `POST /api/recovery/summary`, `POST /api/recovery/day/[date]/why`, `POST /api/recovery/questions`; `RecoveryView.consent`, `.hasKey`.

- [ ] **Step 1: Tekster** (i `recovery`)

```json
"ai": {
  "summary": "This week",
  "loading": "Writing your summary",
  "tips": "Next week",
  "nothing": "Nothing stood out with enough data behind it.",
  "why": "Why?",
  "stale": "Data changed since this answer.",
  "ask": "Ask again",
  "off": "Turn on AI insights",
  "noKey": "Add your Anthropic key in Profile to get AI insights.",
  "error": "AI is unavailable right now.",
  "notEnough": "Not enough data for this yet."
}
```

- [ ] **Step 2: `WeeklySummary.tsx`** (henter ved visning; sammenfoldbar; kaller også C i bakgrunnen én gang)

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { WeeklySummary as Summary } from "@loop/core";
import { SectionHead } from "@/components/tasuki/SectionHead";
import { cn } from "@/lib/utils";

export function WeeklySummary() {
  const t = useTranslations("recovery.ai");
  const [state, setState] = useState<{ summary: Summary } | { error: string } | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    fetch("/api/recovery/summary", { method: "POST" })
      .then(async (r) => ((await r.json().catch(() => ({ error: "unavailable" }))) as { summary: Summary } | { error: string }))
      .then(setState)
      .catch(() => setState({ error: "unavailable" }));
    // Monthly AI questions: fire and forget; the server decides whether it is due.
    fetch("/api/recovery/questions", { method: "POST" }).catch(() => null);
  }, []);

  if (!state) return <div className="mt-6 h-24 animate-pulse rounded-md bg-muted" aria-label={t("loading")} />;
  if ("error" in state) {
    if (state.error === "not_enough_data") return null;
    return <p className="mt-6 text-[13px] text-muted-foreground">{state.error === "no_key" ? t("noKey") : t("error")}</p>;
  }
  const s = state.summary;
  if (!s.sentences.length && !s.tips.length) return null;
  return (
    <section>
      <SectionHead
        title={t("summary")}
        action={
          <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t("summary")}>
            <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
          </button>
        }
      />
      {open && (
        <div className="pt-2">
          {s.headline && <p className="cond text-xl leading-tight">{s.headline}</p>}
          {s.sentences.map((x) => (
            <p key={x.text} className="mt-1.5 text-[15px]">{x.text}</p>
          ))}
          {!!s.tips.length && (
            <>
              <p className="mt-3 text-[13px] font-bold">{t("tips")}</p>
              {s.tips.map((x) => (
                <p key={x.text} className="mt-1 text-[15px]">{x.text}</p>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: `WhyButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import type { DayAnswer } from "@loop/core";

export function WhyButton({ date }: { date: string }) {
  const t = useTranslations("recovery.ai");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ answer: DayAnswer; stale: boolean } | { error: string } | null>(null);

  async function ask(refresh = false) {
    setBusy(true);
    const r = await fetch(`/api/recovery/day/${date}/why`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh }),
    }).catch(() => null);
    setRes(((await r?.json().catch(() => null)) ?? { error: "unavailable" }) as typeof res);
    setBusy(false);
  }

  if (!res)
    return (
      <button onClick={() => ask()} disabled={busy} className="flex items-center gap-1.5 text-sm font-semibold text-primary">
        <Sparkles className="size-4" /> {t("why")}
      </button>
    );
  if ("error" in res) return <p className="text-[13px] text-muted-foreground">{res.error === "not_enough_data" ? t("notEnough") : res.error === "no_key" ? t("noKey") : t("error")}</p>;
  return (
    <div>
      {res.answer.sentences.length ? res.answer.sentences.map((s) => <p key={s.text} className="mt-1 text-[15px]">{s.text}</p>) : <p className="text-[13px] text-muted-foreground">{t("nothing")}</p>}
      {res.stale && (
        <p className="mt-2 text-[13px] text-muted-foreground">
          {t("stale")}{" "}
          <button onClick={() => ask(true)} disabled={busy} className="font-semibold text-primary">{t("ask")}</button>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `AiOff.tsx`**

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function AiOff() {
  const t = await getTranslations("recovery.ai");
  return (
    <Link href="/profile#ai" className="mt-3 self-start text-[13px] font-semibold text-muted-foreground underline underline-offset-2">
      {t("off")}
    </Link>
  );
}
```

- [ ] **Step 5: Koble inn i siden** — i `recovery/page.tsx`, siste `return` blir:

```tsx
  return (
    <main className="flex flex-col px-[18px] pb-4 pt-5">
      <h1 className="cond text-[34px] leading-none">{t("title")}</h1>
      {v.historyDays < RECOVERY_HISTORY_DAYS && <p className="mt-2 text-[13px] text-muted-foreground">{t("fetching", { days: v.historyDays })}</p>}
      {!v.consent && <AiOff />}
      <RecoveryScreen view={v} top={v.consent ? <WeeklySummary /> : null} ai={v.consent} />
    </main>
  );
```

`RecoveryScreen` får prop `ai: boolean` og sender `whySlot={ai ? (d) => <WhyButton date={d} /> : undefined}` til `DaySheet` (importer `WhyButton`). Fjern `whySlot`-propen fra `RecoveryScreen` sitt grensesnitt (den lages nå inni). Importer `AiOff`, `WeeklySummary` i siden.

- [ ] **Step 6: Sjekk**

Run: `pnpm typecheck && pnpm build`
Expected: rent. Manuelt: med bryter av vises bare lenka «Turn on AI insights», ingen nettverkskall til `/api/recovery/summary` (sjekk i nettverksfanen). Med bryter på og uten nøkkel: kort melding.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/recovery "apps/web/app/(app)/recovery/page.tsx" apps/web/messages/en.json
git commit -m "feat(recovery): weekly summary, Why? and the AI-off link on the tab"
```

---

### Task 9: Røyktest, skjermbilder og docs

**Files:**
- Create: `tests/smoke/recovery-smoke.mjs`
- Modify: `scripts/screenshots.mjs`, `README.md`, `CLAUDE.md`, `docs/02-decisions.md`, `docs/specs/2026-10-04-restitusjon.md` (status)

- [ ] **Step 1: `tests/smoke/recovery-smoke.mjs`** (demo-data rett i DB; motoren kjøres ikke i JS, så funn settes inn som rader)

```js
// Recovery: Garmin-connected user with 60 nights and a few stored findings opens the tab, a finding, a day,
// and Profile's AI switch. AI stays off: no AI request may be made.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { seedUser } from "./seed.mjs";

config({ path: "apps/web/.env.local" });
const BASE = process.argv[2] ?? "http://localhost:3100";
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(U).hostname.split(".")[0];
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `recovery+${Date.now()}@loop.test`, password = `P-${crypto.randomUUID()}`;
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = c.user.id;
let failed = false;
const addDays = (d, n) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const check = (ok, msg) => {
  if (!ok) {
    failed = true;
    console.error("FAIL", msg);
  }
};
try {
  const { today } = await seedUser(admin, uid, { days: 20 });
  await admin.from("garmin_accounts").insert({ user_id: uid, ciphertext: "x", iv: "x", auth_tag: "x", last_synced_at: new Date().toISOString(), history_imported_at: new Date().toISOString(), recovery_backfilled_until: addDays(today, -89), recovery_computed_at: new Date().toISOString() });
  await admin.from("recovery_days").insert(
    Array.from({ length: 60 }, (_, i) => ({
      user_id: uid, local_date: addDays(today, -i), sleep_s: 26000 + (i % 5) * 900, deep_s: 5000, light_s: 14000, rem_s: 6000, awake_s: 700,
      sleep_score: 68 + ((i * 7) % 15), hrv_avg: 50 + ((i * 3) % 12), resting_hr: 47 + (i % 5), hrv_baseline_low: 48, hrv_baseline_high: 62,
    })),
  );
  const g = (n, mean, bound) => ({ n, mean, bound });
  await admin.from("recovery_findings").insert([
    { user_id: uid, computed_at: new Date().toISOString(), question_id: "deficit-hrv", factor: "deficit", outcome: "hrv", lag: 1, kind: "finding", groups: { high: g(24, -4.1, 820), low: g(23, 2.2, 240), needed: 9 }, effect_sd: -0.9, q_value: 0.02, control_ok: true, rank: 1 },
    { user_id: uid, computed_at: new Date().toISOString(), question_id: "alcohol-sleep", factor: "alcohol", outcome: "sleepScore", lag: 1, kind: "finding", groups: { high: g(9, -6, null), low: g(60, 1, null), needed: 8 }, effect_sd: -0.8, q_value: 0.04, control_ok: true, rank: 2 },
    { user_id: uid, computed_at: new Date().toISOString(), question_id: "steps-sleep", factor: "steps", outcome: "sleepScore", lag: 1, kind: "no_effect", groups: { high: g(25, 0.3, 12000), low: g(25, 0.1, 7000), needed: 8 }, effect_sd: 0.05, rank: null },
    { user_id: uid, computed_at: new Date().toISOString(), question_id: "rest-run", factor: "daysSinceHard", outcome: "runForm", lag: 0, kind: "needs_data", reason: "few_days", groups: { high: g(4, 0.2, 3), low: g(5, -0.1, 1), needed: 8 }, rank: null },
  ]);

  const anon = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email, password });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, timezoneId: "Europe/Oslo" });
  await ctx.addCookies([{ name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url"), domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  const errors = [];
  const aiCalls = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 3000)));
  page.on("request", (r) => /\/api\/recovery\/(summary|questions)|\/why/.test(r.url()) && aiCalls.push(r.url()));
  const shot = (name) => page.screenshot({ path: `tests/smoke/out/${name}.png`, fullPage: true, caret: "initial" });

  await page.goto(`${BASE}/recovery`);
  await page.getByText("What affects you").waitFor();
  await shot("60-recovery");
  check(await page.getByText("Deficit over 820 kcal").count(), "finding line with the real bound");
  check(await page.getByText("Turn on AI insights").count(), "AI-off link");
  await page.getByText("Deficit over 820 kcal").click();
  await shot("61-recovery-finding");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More" }).click();
  check(await page.getByText("No clear link").count(), "no-effect list");
  check(await page.getByText("4 of 8 days").count(), "progress line");
  await shot("62-recovery-more");
  await page.locator(".recharts-surface").first().click({ position: { x: 300, y: 30 } });
  await page.getByText("The day before").waitFor();
  await shot("63-recovery-day");
  check(!(await page.getByText("Why?").count()), "no Why? while AI is off");
  check(aiCalls.length === 0, `no AI requests with consent off (${aiCalls.join(", ")})`);

  await page.goto(`${BASE}/today`);
  check(await page.getByRole("link", { name: "All meals" }).count(), "All meals link on Today");
  await page.goto(`${BASE}/profile`);
  check(await page.getByRole("switch", { name: "Use my health data with AI" }).count(), "AI switch in Profile");
  await shot("64-profile-ai");
  check(!errors.length, `console errors: ${errors.join(" | ")}`);
  await browser.close();
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await admin.auth.admin.deleteUser(uid);
}
console.log(failed ? "recovery smoke FAILED" : "recovery smoke OK");
process.exit(failed ? 1 : 0);
```

Run: start appen på 3100, så `node tests/smoke/recovery-smoke.mjs`
Expected: `recovery smoke OK`; se bildene `tests/smoke/out/60–64*.png` (lys modus). Kjør også `node tests/smoke/smoke.mjs` og `node tests/smoke/training-smoke.mjs` → OK (bunnmenyen er endret).

- [ ] **Step 2: README-skjermbilde** — i `scripts/screenshots.mjs`, etter Garmin-seeden: sett inn de samme `recovery_days`- og `recovery_findings`-radene som i smoke-testen for demobrukeren (kopier blokken), og etter `body`-skuddet:

```js
  await page.goto(`${BASE}/recovery`);
  await page.getByText("What affects you").waitFor();
  await shot("recovery");
```

I `README.md`: under Features, ny seksjon

```md
### Recovery
- What affects your sleep, HRV and resting heart rate, and how your runs go: links found in your own data, each with the numbers behind it.
- Strict statistics first; links that only come from hard training days are filtered out.
- Optional AI on top (off by default): a weekly summary and "Why?" for a single day, citing only verified numbers.
```

Skjermbilde-tabellen: legg til kolonnen `Recovery` med `<img src="docs/screenshots/recovery.png" width="150">`. Plan-tabellen: `| Next | Recovery tab (sleep, HRV, readiness) | Planned |` → `| 2 | Recovery tab: links between food, training and sleep, optional AI | Done |`.

Run: `node scripts/screenshots.mjs` (app på 3100) → nye `docs/screenshots/recovery.png` m.fl.

- [ ] **Step 3: Docs**
  - `CLAUDE.md`: i «Kjøre og teste» legg `recovery-smoke.mjs` til lista over smoke-skript.
  - `docs/02-decisions.md`: ny rad 2026-10-05 «Restitusjon del 2: fanen (funn med ekte grenser, kurver med normalbånd = 25.–75. persentil av forrige 28 dager, dagsark), bryter for helsedata til AI (av som standard), AI A/B/C med henvisningskrav; AI-spørsmål kan ha terskel og forskyvning −3..+1, testes med q ≤ 0,05, maks 9 aktive» + eventuelle rulings fra ledgeren.
  - Specen: `Status:` → «godkjent; del 1 og 2 levert».

- [ ] **Step 4: Full verifisering**

Run: `pnpm typecheck && pnpm test:int && pnpm build`
Expected: alt grønt.

- [ ] **Step 5: Commit**

```bash
git add tests/smoke/recovery-smoke.mjs scripts/screenshots.mjs docs/screenshots README.md CLAUDE.md docs/02-decisions.md docs/specs/2026-10-04-restitusjon.md
git commit -m "test(recovery): smoke for the tab; README screenshots and docs"
```
