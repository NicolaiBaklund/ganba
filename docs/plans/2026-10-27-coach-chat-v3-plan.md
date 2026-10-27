# Coach-chat v3 – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coachen ser og føles som skisse A: ren tekst, ekte strømming, planendringer som kort med bib ved trykk, ingen advarselsbokser, kortere svar som pusher tilbake, og et minne som sier fra.

**Architecture:**
- **Server:** `reply` strømmer med `eager_input_streaming`. Hver coach-melding lagrer en `meta` med verktøystatus og hva som ble husket eller glemt. Forhåndsvisningscellene får det en bib trenger. Advarsler avgjør ikke lenger om et forslag kan brukes. Prompten blir v6.
- **Klient:** `CoachChat` tegnes om. `OptionCard` erstattes av `PlanCard` med ukerad og bib.

**Tech Stack:** Next.js 16, Anthropic SDK (`messages.stream`), Supabase, Vitest (integrasjon), Playwright (røyk).

**Spec:** `docs/specs/2026-10-27-coach-chat-v3.md`

## Global Constraints
- Ingen enhetstester eller TDD. Integrasjonstester og røyktester.
- Ingen Claude-attribusjon. Gren `coach-chat-v3`. Kodegjennomgang og push til main til slutt.
- UI på engelsk, Tasuki, lys og mørk. Coachen svarer på brukerens språk.
- Bare `reply.message` strømmes til klienten. Aldri rå JSON eller annet verktøyinnhold.
- Ingen advarselslister i UI. Motoren varsler coachen, og coachen sier det viktige.

## Review Focus
1. **Lang strømmet tekst:** ingen hopp i rulling når du har bladd opp. Du skal ikke bli dratt ned (røyk i Task 2).
2. **Forslag som ikke lenger passer planen:** kortet sier hvorfor, og knappen forsvinner. Det skal ikke feile stille (test i Task 1).
3. **Gamle lagrede forslag uten tittel i cellene:** kortet vises uten bib og kræsjer ikke (røyk i Task 2, seedet gammelt alternativ).
4. **Tur der coachen både la til og fjernet en lapp:** begge vises i minnelinjen (test i Task 1).
5. **`max_tokens` midt i `reply` med eager streaming:** ingen halv input brukes, og svaret faller tilbake som i dag (test i Task 1).

---

### Task 1: Server: strømming, meta, celler, bruk uten advarsler, prompt v6

**Files:**
- Create: `supabase/migrations/20261027000000_coach_message_meta.sql` (`alter table coach_messages add column meta jsonb not null default '{}'`)
- Modify:
  - `apps/web/lib/ai/coach.ts`
  - `apps/web/lib/coach/run.ts`
  - `apps/web/lib/coach/store.ts`
  - `apps/web/lib/coach/apply.ts`
  - `apps/web/lib/coach/context.ts` (midlertidige lapper)
  - `packages/core/src/training/coach.ts` (PreviewCell og prompt v6)
  - `evals/coach/cases.json`
- Test: `tests/integration/coach-v3.test.ts`

**Interfaces:**
- Produces:
  - `CoachMessage.meta: { tools: string[]; remembered: string[]; forgot: string[] }` (tom for brukermeldinger og gamle meldinger).
  - `CoachNote.createdAt: string`.
  - `PreviewCell` får `{ title: string; durationS: number; fromDate: ISODate | null }`. `fromDate` er satt når økta ble flyttet til denne dagen.
  - `COACH_PROMPT_VERSION = 6`.

- [ ] **Step 1:** Skriv testene i `coach-v3.test.ts` (seedet bruker og falsk AI som i `coach-v2.test.ts`):
  - `"the reply tool streams eagerly"`: verktøyet `reply` i første kall har `eager_input_streaming: true`.
  - `"a coach message stores the tools it used and what it remembered or forgot"`. Script:
    1. `food_log`
    2. `update_notes` med add «Lives in Tokyo» og remove (en eksisterende lapps id)
    3. `reply`

    Forventet: `message.meta` er `{ tools: [TOOL_LABELS.food_log, TOOL_LABELS.update_notes], remembered: ["Lives in Tokyo"], forgot: [<den fjernede lappens tekst>] }`, og `recentMessages` gir samme `meta` etter lagring.
  - `"preview cells carry what a bib needs"`: et `move`-alternativ. Cellen på måldagen har `title`, `durationS > 0` og `fromDate` lik den opprinnelige datoen.
  - `"an option still valid is applied even when warnings changed"`: lagret alternativ med `warnings: []`, men planen har fått en hard økt dagen før. `applyOption` gir `{ ok: true }` uten `confirm`.
  - `"an option that no longer fits says why"`: økta i alternativet er slettet. Resultatet er `invalid` med `reason`.
  - `"a cut-off reply is never applied"`: `stop_reason: "max_tokens"` med en halv `reply`. Ingen alternativer, og teksten slutter med kutt-merknaden.
  - `"temporary notes are marked in the context"`: lapp med `until`. Konteksten inneholder `(temporary, until YYYY-MM-DD)`.
- [ ] **Step 2:** Kjør `pnpm exec vitest run tests/integration/coach-v3.test.ts`. Forventet: FAIL.
- [ ] **Step 3:** Migrasjon og `pnpm db:push`. Deretter:
  - `reply` får `eager_input_streaming: true` (TS-typen mangler feltet i eldre SDK; spre det på verktøyet).
  - `runCoach` samler `meta`:
    - `tools` er etikettene for kalte verktøy, unike og i rekkefølge.
    - `remembered` og `forgot` kommer fra `update_notes`. For `remove` slås lappens tekst opp før den slettes.
    - `meta` lagres via `addMessage`.
  - `store.ts` leser og skriver `meta` og `CoachNote.createdAt`.
  - `weekPreview` fyller de nye cellefeltene.
  - `applyOption` dropper sammenligningen av advarsler og `confirm`-flyten. Gyldige endringer brukes, og ugyldige gir `invalid` med `reason`.
  - Konteksten merker lapper med `until` som `(temporary, until …)`.
- [ ] **Step 4:** Prompt v6 (spec §5): svar på det som spørres om, lengde etter spørsmålet, ingen oppramsing, andre temaer bare når de endrer svaret, alvorlige advarsler i én setning, push tilbake (anbefalingen som første alternativ), og midlertidige lapper sjekkes mot dataene. Legg til tilfellet `five-k-today` i `evals/coach/cases.json`. Forventet: kort svar uten matråd. Kjør testene, `coach.test.ts` og `coach-v2.test.ts`. Forventet: PASS. Oppdater de eksisterende testene som brukte `confirm`/`stale`.
- [ ] **Step 5:** Commit `feat(coach): stream replies, message meta, preview cells for bibs, prompt v6`.

### Task 2: Klient: utseende A, PlanCard med bib, minnelinje, smooth

**Files:**
- Create:
  - `apps/web/components/coach/PlanCard.tsx` (erstatter `OptionCard.tsx`, som slettes)
  - `apps/web/components/coach/MemoryLine.tsx`
- Modify:
  - `apps/web/components/coach/CoachChat.tsx`
  - `apps/web/components/coach/WeekPreview.tsx` (trykkbare celler)
  - `apps/web/components/coach/NotesPanel.tsx` (dato og kilde)
  - `apps/web/components/tasuki/Bib.tsx` (`size?: "full" | "compact"`)
  - `apps/web/messages/en.json`
- Test: `tests/smoke/coach-smoke.mjs`

**Interfaces:**
- Consumes: `CoachMessage.meta`, `PreviewCell.title/durationS/fromDate`, `CoachNote.createdAt` (Task 1).
- Produces: `PlanCard({ messageId, option, open, onChange })` og `MemoryLine({ meta, onOpen })`.

- [ ] **Step 1:** `CoachChat`:
  - **Samtalen:** coachens tekst uten boble, brukerens melding som dempet boble, dagsskiller («Today 07:42», «Yesterday», ellers dato) og ingen sammenbretting.
  - **Arbeidslinje:** pulserende prikk med siste status mens coachen jobber. Under hvert lagrede svar står «✓ » og `meta.tools` slått sammen (maks to, ellers «+N»).
  - **Alternativer:** det første i et svar er `open`, resten er sammenbrettet.
  - **Etter bruk:** brukte alternativer vises som én linje med hake, og de ubrukte skjules.
  - **Rulling** følger med bare når du er innen 80 px fra bunnen.
- [ ] **Step 2:** `PlanCard`: tittel, uke og km, ukerad og «Use this». Trykk på en dag veksler `Bib size="compact"` for cellens økt (`bibNumber`, type-farge, «Was {weekday}» når `fromDate` finnes, «Rest» uten økt). `invalid` viser `reason` uten knapp. Overgangene er `grid-template-rows` 0fr↔1fr på 200 ms og respekterer `prefers-reduced-motion`.
- [ ] **Step 3:** `MemoryLine`: «Remembered: …» og «Forgot: …» (forkortet) under svaret. Trykk åpner notatpanelet. Notatpanelet viser dato og «by coach» eller «by you».
- [ ] **Step 4:** Oppdater `coach-smoke.mjs` (lys og mørk, stubbet strøm). Sjekk:
  - statuslinjen blir «✓ …»,
  - trykk på en endret dag viser bib med «Was»,
  - «Use this» gir én linje med hake,
  - et seedet gammelt alternativ uten celletitler vises uten bib og uten feil,
  - minnelinjen åpner panelet,
  - ingen advarselstekst («not one of your running days») finnes,
  - bladd opp under strømming: rulleposisjonen står stille.

  Kjør. Forventet: alle `true`.
- [ ] **Step 5:** Commit `feat(coach): chat redesign with plan cards, bibs and memory line`.

### Task 3: Eval, docs, verifisering, gjennomgang, push

**Files:** `docs/02-decisions.md`, `CLAUDE.md` (Les først), `scripts/screenshots.mjs` (spørsmålet viser et kort), README-skjermbilder.

- [ ] **Step 1:** Kjør `evals/coach` én gang med brukerens nøkkel og les svarene (lengde, ingen oppramsing, push tilbake).
- [ ] **Step 2:** Beslutninger og CLAUDE.md. Lag skjermbildene på nytt.
- [ ] **Step 3:** Kjør `pnpm typecheck`, `pnpm build`, `pnpm test:int` og røyktestene coach, training, recovery, ride og cross. Forventet: grønt.
- [ ] **Step 4:** Kodegjennomgang, rett funnene, merge `--no-ff` til main og push.
