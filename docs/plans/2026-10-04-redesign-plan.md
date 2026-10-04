# Redesign «Tasuki» — implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mål:** Gi hele appen Tasuki-uttrykket (startnummer, tasuki-striper, smal Archivo, svart/hvitt + karmosinrød, lys og mørk) og ny layout som viser det viktigste uten scrolling.

**Arkitektur:** Nye design-tokens i `globals.css` (lys på `:root`, mørk via `prefers-color-scheme`), Archivo som eneste font. Et lite sett delte komponenter i `components/tasuki/` (Sash, Bib, SectionHead, ListRow, StatRow) og nye domenekomponenter (WeekStrip, KcalBlock, TrainingMap). Skjermene bygges om på disse; data-laget endres bare der nye visninger trenger data (uke-stripe, neste økt).

**Stack:** Next.js (App Router, server components), Tailwind v4, shadcn/ui, next-intl, Supabase, Playwright (smoke + skjermbilder).

**Spec:** [docs/specs/2026-10-04-redesign-tasuki.md](../specs/2026-10-04-redesign-tasuki.md). Mockup: [docs/mockups/2026-10-04-tasuki.html](../mockups/2026-10-04-tasuki.html). Specen er bindende; ved tvil, se mockupen.

## Globale regler

- Gren `redesign` fra `main`. Én commit per oppgave. **Ingen `Co-Authored-By: Claude`** eller annen Claude-attribusjon i commits (prosjektregel, overstyrer standard).
- Ingen enhetstester (prosjektregel). Verifisering per oppgave = `pnpm typecheck` + skjermbilde i lys og mørk av berørte skjermer. Til slutt `pnpm build` + smoke-skriptene.
- Ingen hardkodede personverdier. UI-tekst på engelsk via `apps/web/messages/en.json`; docs på norsk.
- UI-tekst: ingen tankestreker (—), ingen «·»-kjeder, ingen etiketter i store bokstaver. Hjelpetekst bare der den hindrer feil.
- Farger kun via tokens (`var(--…)` / Tailwind-klasser fra tokens), aldri literal hex i komponenter (unntak: SVG-ikonfilene).
- Store tall: klassen `num` (smal + tabular-nums). Overskrifter: `cond`.
- Startnummeret er alltid hvitt papir med svart trykk, også i mørk modus (`bg-paper text-paper-ink`).
- Kommandoer kjøres fra repo-roten med pnpm (`pnpm typecheck`, `pnpm dev`).

## Review Focus

- **Lange titler og navn:** økttitler som «Long run with marathon-pace finish», matvarer med lange navn, store tall (kcal over 9999, 100+ km/uke). Forventet: avkorting med ellipse eller bryting, aldri overlapp med tasuki-stripen eller tall til høyre.
- **Over mål:** spist > mål gir negativ «kcal left». Forventet: viser «N over» i advarselsfarge (som i dag), makrobarer fylt til 100 %, ingen negativ bredde.
- **Uten Garmin / uten plan / manuelt mål / gulv:** ingen startnummer når det ikke finnes plan; ingen «+activity»-merke ved manuelt mål eller når målet er gulvet; uke-stripen viser bare mat-logging. Ingen tomme rammer.
- **Mørk modus:** startnummeret forblir hvitt med svart tekst; ukedag-bokser, kart-spor og barer bytter til lyse streker; kontrast ≥ 4.5:1 for tekst.
- **Uke-stripe på kanten:** to økter samme dag, uplanlagt løp uten plan-økt, misset økt, tilbakeblikk til tidligere uker og grensen ved inneværende uke (ingen «neste uke» forbi i dag).

---

### Oppgave 1: Gren, tokens, font, tema

**Filer:**
- Endre: `apps/web/app/globals.css` (hele token-delen)
- Endre: `apps/web/app/layout.tsx`
- Endre: `apps/web/app/manifest.ts`
- Endre: `apps/web/components/ui/sonner.tsx` (tema = system)

**Grensesnitt:**
- Produserer: Tailwind-farger `background, foreground, card, popover, muted, muted-foreground, border, primary, paper, paper-ink, protein, carbs, fat, success, warning, destructive`, CSS-variabler `--w-easy … --w-race`, klassene `.cond` og `.num`, font-variabel `--font-archivo`.

- [ ] **Steg 1: Lag gren**

```bash
git checkout -b redesign
```

- [ ] **Steg 2: Erstatt token-blokkene i `globals.css`**

Behold de tre `@import`-linjene øverst. Fjern `@custom-variant dark (&:is(.dark *));`. Erstatt `@theme inline { … }`, `:root { … }` og `@layer base { … }` med:

```css
@custom-variant dark (@media (prefers-color-scheme: dark));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-archivo);
  --font-heading: var(--font-archivo);
  --font-display: var(--font-archivo);
  --color-card: var(--card);
  --color-card-foreground: var(--foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--muted);
  --color-secondary-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--muted);
  --color-accent-foreground: var(--foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-paper: var(--paper);
  --color-paper-ink: var(--paper-ink);
  --color-protein: var(--protein);
  --color-carbs: var(--carbs);
  --color-fat: var(--fat);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 14px;
  --radius-3xl: 18px;
}

:root {
  /* Ganba «Tasuki»: lys grunnpalett. Se docs/design.md og docs/specs/2026-10-04-redesign-tasuki.md */
  color-scheme: light;
  --background: #eef0f2;
  --foreground: #000000;
  --card: #ffffff;
  --popover: #ffffff;
  --muted: #e2e5e9;
  --muted-foreground: #5f646d;
  --border: #d6d9de;
  --input: #c9cdd3;
  --ring: #c8102e;
  --primary: #c8102e;
  --primary-foreground: #ffffff;
  --destructive: #c62828;
  --paper: #ffffff;
  --paper-ink: #000000;
  --protein: #e8336b;
  --carbs: #e89a1a;
  --fat: #7a5cf0;
  --success: #138a5e;
  --warning: #b86e00;
  --w-easy: #1fa98a;
  --w-long: #2f6fd6;
  --w-intervals: #e8336b;
  --w-threshold: #e89a1a;
  --w-tempo: #7a5cf0;
  --w-strides: #34b37a;
  --w-race: #d4a20f;
  --w-rest: #b9bec6;
  --plus-bg: #000000;
  --plus-fg: #ffffff;
  --radius: 6px;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --background: #000000;
    --foreground: #ffffff;
    --card: #16171a;
    --popover: #1c1d21;
    --muted: #222428;
    --muted-foreground: #9aa0aa;
    --border: #2b2d32;
    --input: #3a3d44;
    --ring: #ff3b55;
    --primary: #ff3b55;
    --destructive: #ff5c5c;
    --success: #34d399;
    --warning: #ffb547;
    --w-rest: #6b7079;
    --plus-bg: #ffffff;
    --plus-fg: #000000;
  }
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    @apply font-sans;
  }
  body {
    @apply bg-background text-foreground;
    -webkit-tap-highlight-color: transparent;
  }
  .cond {
    font-stretch: 70%;
    font-weight: 900;
    letter-spacing: -0.01em;
  }
  .num {
    font-stretch: 75%;
    font-variant-numeric: tabular-nums;
  }
  :focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
}
```

- [ ] **Steg 3: Font og tema i `layout.tsx`**

Erstatt font-importene og `<html>`-klassene:

```tsx
import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "Ganba",
  description: "Training and nutrition in one place",
  appleWebApp: { capable: true, title: "Ganba", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0f2" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Steg 4: Manifest og sonner**

`manifest.ts`: `background_color: "#eef0f2"`, `theme_color: "#eef0f2"`. `sonner.tsx`: sett `theme="system"` (fjern eventuell `useTheme`/`dark`-logikk).

- [ ] **Steg 5: Finn rester av gamle fonter og `dark`-klassen**

Run: `grep -rn "font-sora\|geist\|Sora\|className=\"dark\|dark:" apps/web/app apps/web/components`
Forventet: bare `dark:`-varianter i `components/ui/*` (fungerer nå via media). Fjern `font-sora`/`geist`-treff.

- [ ] **Steg 6: Verifiser**

Run: `pnpm typecheck` → ingen feil. Start `pnpm dev`, åpne `/today` i lys og mørk (Playwright `colorScheme`). Forventet: lys grå bakgrunn i lys modus, svart i mørk, Archivo overalt. Layout er fortsatt gammel; det er riktig nå.

- [ ] **Steg 7: Commit**

```bash
git add apps/web/app/globals.css apps/web/app/layout.tsx apps/web/app/manifest.ts apps/web/components/ui/sonner.tsx
git commit -m "feat(design): Tasuki tokens, Archivo, light and dark from system setting"
```

---

### Oppgave 2: Logo og app-ikoner

**Filer:**
- Endre: `apps/web/app/icon.svg` (favicon-variant)
- Opprett: `apps/web/scripts/icons/bib.svg` (full variant, kilde)
- Opprett: `apps/web/scripts/make-icons.mjs`
- Erstatt: `apps/web/app/apple-icon.png`, `apps/web/public/icon-192.png`, `apps/web/public/icon-512.png`
- Slett: `apps/web/app/favicon.ico` (SVG-ikonet tar over; Safari bruker apple-icon)

**Grensesnitt:** Produserer ikonfilene; ingen kode avhenger av dem utover Next-konvensjonen.

- [ ] **Steg 1: Full variant `scripts/icons/bib.svg`**

G-en er en strøket path (ingen fontavhengighet):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#c8102e"/>
  <rect x="64" y="104" width="384" height="304" rx="16" fill="#ffffff"/>
  <circle cx="98" cy="138" r="13" fill="#c8102e"/>
  <circle cx="414" cy="138" r="13" fill="#c8102e"/>
  <circle cx="98" cy="374" r="13" fill="#c8102e"/>
  <circle cx="414" cy="374" r="13" fill="#c8102e"/>
  <path d="M306 228 V212 a40 40 0 0 0 -40 -40 h-20 a40 40 0 0 0 -40 40 v88 a40 40 0 0 0 40 40 h20 a40 40 0 0 0 40 -40 v-50 h-46"
        fill="none" stroke="#000000" stroke-width="40" stroke-linejoin="miter"/>
</svg>
```

- [ ] **Steg 2: Favicon-variant `app/icon.svg`**

Uten nåler, større startnummer, tykkere G:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#c8102e"/>
  <rect x="56" y="88" width="400" height="336" rx="24" fill="#ffffff"/>
  <path d="M316 232 V210 a50 50 0 0 0 -50 -50 h-20 a50 50 0 0 0 -50 50 v92 a50 50 0 0 0 50 50 h20 a50 50 0 0 0 50 -50 v-54 h-56"
        fill="none" stroke="#000000" stroke-width="58" stroke-linejoin="miter"/>
</svg>
```

- [ ] **Steg 3: PNG-skript `scripts/make-icons.mjs`**

```js
// Renders the bib logo to PNG app icons. Run: node apps/web/scripts/make-icons.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const svg = readFileSync(join(here, "icons", "bib.svg"), "utf8");
const targets = [
  [180, join(web, "app", "apple-icon.png")],
  [192, join(web, "public", "icon-192.png")],
  [512, join(web, "public", "icon-512.png")],
];

const browser = await chromium.launch();
for (const [size, out] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: out, omitBackground: false });
  await page.close();
}
await browser.close();
console.log("icons written");
```

- [ ] **Steg 4: Kjør og se på resultatet**

Run: `node apps/web/scripts/make-icons.mjs` → «icons written». Åpne `apps/web/public/icon-512.png` og `apps/web/app/apple-icon.png`: rød bakgrunn, hvitt startnummer, fire nåler, svart G sentrert. Slett `apps/web/app/favicon.ico`.

- [ ] **Steg 5: Commit**

```bash
git add apps/web/app/icon.svg apps/web/app/apple-icon.png apps/web/public/icon-192.png apps/web/public/icon-512.png apps/web/scripts/icons/bib.svg apps/web/scripts/make-icons.mjs
git rm apps/web/app/favicon.ico
git commit -m "feat(design): bib logo and app icons"
```

---

### Oppgave 3: Delte Tasuki-komponenter

**Filer:**
- Opprett: `apps/web/components/tasuki/Sash.tsx`
- Opprett: `apps/web/components/tasuki/SectionHead.tsx`
- Opprett: `apps/web/components/tasuki/ListRow.tsx`
- Opprett: `apps/web/components/tasuki/StatRow.tsx`
- Opprett: `apps/web/components/tasuki/Bib.tsx`

**Grensesnitt (produserer):**
- `Sash({ type, state?, className? })` — `type: WorkoutType | "rest" | "other"`, `state: "done" | "planned" | "missed"` (default `"done"`).
- `SectionHead({ title, action?, children? })` — `action?: React.ReactNode` til høyre; `children` = tall/tekst til høyre.
- `ListRow({ title, sub?, value?, href?, onClick?, leading?, trailing? })`.
- `StatRow({ items: { value: React.ReactNode; label: string }[] })`.
- `Bib({ label, big, unit?, meta, footer?, type, href? })` og `RestBib({ next })` med `next: { type: WorkoutType; text: string } | null`.

- [ ] **Steg 1: `Sash.tsx`**

```tsx
import type { WorkoutType } from "@loop/core";
import { cn } from "@/lib/utils";

/** Slanted tasuki stripe in a session type's colour. Solid = done, striped = planned, outline = missed. */
export function Sash({
  type,
  state = "done",
  className,
}: {
  type: WorkoutType | "rest" | "other";
  state?: "done" | "planned" | "missed";
  className?: string;
}) {
  const c = type === "other" ? "var(--foreground)" : `var(--w-${type})`;
  const style =
    state === "done"
      ? { background: c }
      : state === "planned"
        ? { background: `repeating-linear-gradient(90deg, ${c} 0 3px, transparent 3px 5px)` }
        : { boxShadow: "inset 0 0 0 1.5px var(--muted-foreground)" };
  return <span aria-hidden className={cn("block -skew-x-[20deg]", className)} style={style} />;
}
```

- [ ] **Steg 2: `SectionHead.tsx`**

```tsx
export function SectionHead({ title, action, children }: { title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-baseline justify-between border-b-2 border-foreground pb-1.5">
      <h2 className="cond text-[22px] leading-none">{title}</h2>
      {children && <span className="num text-sm font-bold text-muted-foreground">{children}</span>}
      {action}
    </div>
  );
}
```

- [ ] **Steg 3: `ListRow.tsx`**

```tsx
import Link from "next/link";

export function ListRow({
  title,
  sub,
  value,
  href,
  onClick,
  leading,
  trailing,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  value?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{title}</span>
        {sub && <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>}
      </span>
      {value != null && <span className="num text-[17px] font-extrabold">{value}</span>}
      {trailing}
    </>
  );
  const cls = "flex w-full items-center gap-3 border-b border-border py-3 text-left active:bg-muted/60";
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}
```

- [ ] **Steg 4: `StatRow.tsx`**

```tsx
export function StatRow({ items }: { items: { value: React.ReactNode; label: string }[] }) {
  return (
    <div className="grid border-t-2 border-foreground pt-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <p className="num truncate text-xl font-extrabold">{it.value}</p>
          <p className="text-xs text-muted-foreground">{it.label}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Steg 5: `Bib.tsx`**

```tsx
import Link from "next/link";
import type { WorkoutType } from "@loop/core";

const Pins = () => (
  <>
    {["left-2 top-2", "right-2 top-2", "left-2 bottom-2", "right-2 bottom-2"].map((p) => (
      <span key={p} aria-hidden className={`absolute ${p} size-[7px] rounded-full bg-background shadow-[inset_0_0_0_1px_rgb(0_0_0/12%)]`} />
    ))}
  </>
);

/** Race bib for today's session: always white paper with black print, sash in the session colour. */
export function Bib({
  label,
  big,
  unit,
  meta,
  footer,
  type,
  href,
}: {
  label: string;
  big: string;
  unit?: string;
  meta: React.ReactNode;
  footer?: React.ReactNode;
  type: WorkoutType;
  href?: string;
}) {
  const inner = (
    <>
      <span aria-hidden className="absolute -top-2.5 right-[84px] h-[220px] w-[30px] origin-top -rotate-[52deg]" style={{ background: `var(--w-${type})` }} />
      <Pins />
      <p className="relative pl-1 text-[13px] font-bold">{label}</p>
      <p className="num relative mt-1.5 truncate pr-16 text-[clamp(64px,26vw,104px)] font-black leading-[.86] [font-stretch:62%]">
        {big}
        {unit && <small className="ml-0.5 text-[34px] font-extrabold">{unit}</small>}
      </p>
      <p className="relative mt-1 text-[15px] font-semibold">{meta}</p>
      {footer && <div className="relative mt-3 flex items-center gap-2 border-t-2 border-paper-ink pt-2.5 text-[13px]">{footer}</div>}
    </>
  );
  const cls = "relative block overflow-hidden rounded-md bg-paper px-[18px] py-3.5 text-paper-ink shadow-[0_1px_0_var(--border),0_10px_24px_-16px_rgb(0_0_0/40%)]";
  return href ? <Link href={href} className={cls}>{inner}</Link> : <section className={cls}>{inner}</section>;
}

export function RestBib({ title, nextLabel, next }: { title: string; nextLabel: string; next: { type: WorkoutType; text: string } | null }) {
  return (
    <section className="relative overflow-hidden rounded-md bg-paper px-[18px] py-3 text-paper-ink">
      <span aria-hidden className="absolute -top-2.5 right-16 h-[170px] w-[30px] origin-top -rotate-[52deg]" style={{ background: "var(--w-rest)" }} />
      <Pins />
      <p className="relative mt-1 text-[52px] font-black leading-[.9] [font-stretch:62%]">{title}</p>
      {next && (
        <p className="relative mt-2.5 flex items-center gap-2 border-t-2 border-paper-ink pt-2 text-[13px]">
          <span aria-hidden className="size-3.5 shrink-0 -skew-x-[18deg]" style={{ background: `var(--w-${next.type})` }} />
          {nextLabel} <b className="font-bold">{next.text}</b>
        </p>
      )}
    </section>
  );
}
```

- [ ] **Steg 6: Verifiser**

Run: `pnpm typecheck` → ingen feil (komponentene er ikke i bruk ennå).

- [ ] **Steg 7: Commit**

```bash
git add apps/web/components/tasuki
git commit -m "feat(design): shared Tasuki components (sash, bib, section head, rows, stats)"
```

---

### Oppgave 4: Uke-stripe (data + komponent)

**Filer:**
- Opprett: `apps/web/lib/db/week.ts`
- Opprett: `apps/web/components/today/WeekStrip.tsx`
- Endre: `apps/web/lib/training/view.ts` (legg til `nextWorkout`)
- Endre: `apps/web/messages/en.json` (`today.prevWeek`, `today.nextWeek`, `today.backToToday`, `today.weekStrip`)

**Grensesnitt:**
- Konsumerer: `Sash` (oppgave 3), `mondayOf`, `addDays` fra `@loop/core`.
- Produserer:
  - `loadWeekStrip(supabase: DB, userId: string, date: ISODate): Promise<WeekDay[]>`
  - `interface WeekDay { date: ISODate; logged: boolean; sessions: { type: WorkoutType | "other"; state: "done" | "planned" | "missed" }[] }`
  - `nextWorkout(userId: string, after: ISODate): Promise<{ date: ISODate; type: WorkoutType; title: string; plannedKm: number } | null>`
  - `<WeekStrip days={WeekDay[]} date today basePath />` (server component)

- [ ] **Steg 1: `lib/db/week.ts`**

```ts
import "server-only";
import { addDays, isRun, mondayOf, type ISODate, type WorkoutType } from "@loop/core";
import type { DB } from "./current";

export interface WeekDay {
  date: ISODate;
  logged: boolean;
  sessions: { type: WorkoutType | "other"; state: "done" | "planned" | "missed" }[];
}

/** Mon–Sun around `date`: which days have food logged and which sessions were planned or run. */
export async function loadWeekStrip(supabase: DB, userId: string, date: ISODate): Promise<WeekDay[]> {
  const monday = mondayOf(date);
  const sunday = addDays(monday, 6);
  const [food, planned, acts] = await Promise.all([
    supabase.from("food_entries").select("local_date").eq("user_id", userId).gte("local_date", monday).lte("local_date", sunday),
    supabase
      .from("planned_workouts")
      .select("date, type, status, activity_id, plan:training_plans!inner(status)")
      .eq("user_id", userId)
      .gte("date", monday)
      .lte("date", sunday)
      .neq("status", "removed")
      .eq("plan.status", "active"),
    supabase.from("activities").select("id, local_date, type_key").eq("user_id", userId).gte("local_date", monday).lte("local_date", sunday),
  ]);
  const logged = new Set((food.data ?? []).map((r) => r.local_date));
  const linked = new Set((planned.data ?? []).map((w) => w.activity_id).filter(Boolean));
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    const sessions: WeekDay["sessions"] = (planned.data ?? [])
      .filter((w) => w.date === d)
      .map((w) => ({ type: w.type as WorkoutType, state: w.status === "done" ? "done" : w.status === "missed" ? "missed" : "planned" }));
    for (const a of acts.data ?? []) {
      if (a.local_date === d && isRun(a.type_key) && !linked.has(a.id)) sessions.push({ type: "other", state: "done" });
    }
    return { date: d, logged: logged.has(d), sessions };
  });
}
```

Merk: uplanlagte løp vises som nøytral (forgrunnsfarge) stripe, `type: "other"`. Sjekk at `isRun` og `mondayOf` er eksportert fra `@loop/core` (de brukes allerede i `lib/db/activity.ts` og `lib/training/view.ts`).

- [ ] **Steg 2: `nextWorkout` i `lib/training/view.ts`**

```ts
/** First planned session after `after` in the active plan (for the rest-day bib). */
export async function nextWorkout(userId: string, after: ISODate): Promise<{ date: ISODate; type: WorkoutType; title: string; plannedKm: number } | null> {
  const plan = await activePlan(userId);
  if (!plan) return null;
  const { data } = await createAdminSupabase()
    .from("planned_workouts")
    .select("date, type, title, planned_km")
    .eq("plan_id", plan.id)
    .gt("date", after)
    .eq("status", "planned")
    .order("date")
    .limit(1)
    .maybeSingle();
  return data ? { date: data.date, type: data.type, title: data.title, plannedKm: Number(data.planned_km) } : null;
}
```

- [ ] **Steg 3: `components/today/WeekStrip.tsx`**

```tsx
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { addDays, mondayOf } from "@loop/core";
import { Sash } from "@/components/tasuki/Sash";
import type { WeekDay } from "@/lib/db/week";
import { cn } from "@/lib/utils";

/** Date line + Mon–Sun strip. White box = food logged, red = selected day, stripes = sessions. */
export async function WeekStrip({
  days,
  date,
  today,
  basePath,
  profileLink = false,
}: {
  days: WeekDay[];
  date: string;
  today: string;
  basePath: string;
  profileLink?: boolean;
}) {
  const t = await getTranslations("today");
  const format = await getFormatter();
  const href = (d: string) => (d === today ? basePath : `${basePath}?date=${d}`);
  const prevWeek = addDays(mondayOf(date), -7);
  const nextMonday = addDays(mondayOf(date), 7);
  const canNext = nextMonday <= today;
  const label = format.dateTime(new Date(`${date}T00:00:00Z`), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return (
    <header className="pt-4">
      <div className="flex items-center gap-1">
        <Link href={href(prevWeek)} className="-ml-2 p-2 text-muted-foreground" aria-label={t("prevWeek")}>
          <ChevronLeft className="size-4" />
        </Link>
        <h1 className="cond text-[15px] [font-stretch:75%]">{label}</h1>
        {canNext && (
          <Link href={href(nextMonday)} className="p-2 text-muted-foreground" aria-label={t("nextWeek")}>
            <ChevronRight className="size-4" />
          </Link>
        )}
        {date !== today && (
          <Link href={basePath} className="ml-1 text-[13px] font-semibold text-primary">
            {t("backToToday")}
          </Link>
        )}
        {profileLink && (
          <Link href="/profile" className="ml-auto grid size-[34px] place-items-center rounded-full border border-border bg-card" aria-label={t("profile")}>
            <UserRound className="size-4" />
          </Link>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-1 text-center" aria-label={t("weekStrip")}>
        {days.map((d) => {
          const future = d.date > today;
          const selected = d.date === date;
          const box = (
            <>
              <span className="text-[11px] text-muted-foreground">
                {format.dateTime(new Date(`${d.date}T00:00:00Z`), { weekday: "narrow", timeZone: "UTC" })}
              </span>
              <b
                className={cn(
                  "num mt-[3px] grid h-[34px] place-items-center rounded-md text-[15px] font-bold",
                  selected ? "bg-primary text-primary-foreground" : d.logged && "bg-card",
                )}
              >
                {Number(d.date.slice(8))}
              </b>
              <span className="mx-1 mt-[5px] flex h-1.5 gap-0.5">
                {d.sessions.map((s, i) => (
                  <Sash key={i} type={s.type} state={s.state} className="h-full flex-1" />
                ))}
              </span>
            </>
          );
          return <li key={d.date}>{future ? <span className="block">{box}</span> : <Link href={href(d.date)} className="block">{box}</Link>}</li>;
        })}
      </ol>
    </header>
  );
}
```

- [ ] **Steg 4: Tekster i `en.json` under `today`**

```json
"prevWeek": "Previous week",
"nextWeek": "Next week",
"backToToday": "Today",
"weekStrip": "This week"
```

- [ ] **Steg 5: Verifiser og commit**

Run: `pnpm typecheck` → ingen feil.

```bash
git add apps/web/lib/db/week.ts apps/web/lib/training/view.ts apps/web/components/today/WeekStrip.tsx apps/web/messages/en.json
git commit -m "feat(today): week strip with food logging and session stripes"
```

---

### Oppgave 5: Kcal-blokk

**Filer:**
- Opprett: `apps/web/components/today/KcalBlock.tsx` (server) og `apps/web/components/today/TargetSheet.tsx` (klient)
- Endre: `apps/web/messages/en.json` (`today.activityTag`, `today.leftToday`, `today.overToday`, `today.targetHow`)

**Grensesnitt:**
- Konsumerer: `Macros` fra `@loop/core`, `BottomSheet` fra `components/common/BottomSheet`.
- Produserer: `<KcalBlock intake target floored activityKcal breakdown />` der `activityKcal: number | null` (null = ingen merke) og `breakdown: { base: number; activity: number; goal: number } | null` (null = ingen trykk-utregning).

- [ ] **Steg 1: `TargetSheet.tsx`** — klientkomponent: knapp rundt mål-tallet som åpner `BottomSheet` med én linje «Base {base} + activity {activity} − goal {goal} = {target}» (store smale tall) og ingen annen tekst.

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BottomSheet } from "@/components/common/BottomSheet";

export function TargetSheet({ target, breakdown, children }: { target: number; breakdown: { base: number; activity: number; goal: number }; children: React.ReactNode }) {
  const t = useTranslations("today");
  const [open, setOpen] = useState(false);
  const signed = (n: number) => (n >= 0 ? `+ ${n}` : `− ${Math.abs(n)}`);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-right">
        {children}
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title={t("targetHow")}>
        <p className="num text-lg">
          {t("breakdown.base")} <b>{breakdown.base}</b> {signed(breakdown.activity)} {t("breakdown.activity").toLowerCase()} − {t("breakdown.goal").toLowerCase()} <b>{breakdown.goal}</b> = <b className="text-primary">{target}</b>
        </p>
      </BottomSheet>
    </>
  );
}
```

Sjekk `BottomSheet`-propsene (`components/common/BottomSheet.tsx`) før bruk; tilpass navnene (`open`, `onOpenChange`, `title`) til det som finnes.

- [ ] **Steg 2: `KcalBlock.tsx`**

```tsx
import { getTranslations } from "next-intl/server";
import type { Macros } from "@loop/core";
import { TargetSheet } from "./TargetSheet";

function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="min-w-0">
      <p className="num text-[15px] font-extrabold">
        {Math.round(value)}/{max} g
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
      <span className="mt-1.5 block h-1.5 bg-border">
        <span className="block h-full" style={{ width: `${pct}%`, background: color }} />
      </span>
    </div>
  );
}

export async function KcalBlock({
  intake,
  target,
  floored,
  activityKcal,
  breakdown,
}: {
  intake: Macros;
  target: Macros;
  floored: boolean;
  activityKcal: number | null;
  breakdown: { base: number; activity: number; goal: number } | null;
}) {
  const t = await getTranslations("today");
  const remaining = Math.round(target.kcal - intake.kcal);
  const side = (
    <span className="block text-right text-[13px] leading-normal text-muted-foreground">
      <b className="num text-base font-extrabold text-foreground">{Math.round(intake.kcal)}</b> {t("eaten").toLowerCase()}
      <br />
      <b className="num text-base font-extrabold text-foreground">{target.kcal}</b> {t("target").toLowerCase()}
      {activityKcal != null && activityKcal > 0 && (
        <>
          <br />
          <span className="num mt-0.5 inline-block -skew-x-12 bg-primary px-[7px] py-px text-[13px] font-extrabold text-primary-foreground">
            {t("activityTag", { kcal: Math.round(activityKcal) })}
          </span>
        </>
      )}
    </span>
  );
  return (
    <section className="mt-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={`num text-[72px] font-black leading-[.9] [font-stretch:62%] ${remaining < 0 ? "text-warning" : ""}`}>{Math.abs(remaining)}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{remaining < 0 ? t("overToday") : t("leftToday")}</p>
        </div>
        {breakdown ? <TargetSheet target={target.kcal} breakdown={breakdown}>{side}</TargetSheet> : side}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3.5">
        <MacroBar label={t("protein")} value={intake.proteinG} max={target.proteinG} color="var(--protein)" />
        <MacroBar label={t("carbs")} value={intake.carbsG} max={target.carbsG} color="var(--carbs)" />
        <MacroBar label={t("fat")} value={intake.fatG} max={target.fatG} color="var(--fat)" />
      </div>
      {floored && <p className="mt-3 text-xs text-warning">{t("floored")}</p>}
    </section>
  );
}
```

- [ ] **Steg 3: Tekster under `today`**

```json
"activityTag": "+{kcal} activity",
"leftToday": "kcal left today",
"overToday": "kcal over today",
"targetHow": "How today's target is set"
```

`today.breakdown.base/activity/goal` finnes; endre `breakdown.activity` til «Activity» hvis den heter noe annet, og fjern `breakdown.planned` og `breakdown.averaged` hvis ingen andre bruker dem (sjekk med grep).

- [ ] **Steg 4: Verifiser og commit**

Run: `pnpm typecheck`.

```bash
git add apps/web/components/today/KcalBlock.tsx apps/web/components/today/TargetSheet.tsx apps/web/messages/en.json
git commit -m "feat(today): kcal block with activity tag and target breakdown sheet"
```

---

### Oppgave 6: I dag-skjermen

**Filer:**
- Endre: `apps/web/app/(app)/today/page.tsx`
- Endre: `apps/web/components/today/MealsList.tsx`, `apps/web/components/today/CheckinCard.tsx`
- Opprett: `apps/web/components/today/TodayBib.tsx`, `apps/web/components/today/WeightRow.tsx`
- Slett: `components/today/DateNav.tsx` (etter at Mat også er flyttet, oppgave 10), `KcalCard.tsx`, `TargetBreakdown.tsx`, `WorkoutCard.tsx`, `WeightCard.tsx`, `MiniTrend.tsx`

**Grensesnitt:**
- Konsumerer: `WeekStrip`, `loadWeekStrip`, `nextWorkout`, `KcalBlock`, `Bib`, `RestBib`, `SectionHead`, `ListRow`, `fuelingFor` fra `@loop/core`, `fmtMinutes` fra `lib/training/format`.
- Produserer: `<TodayBib workout kg date />` (server), `<WeightRow trendKg weeklyChangeKg goalKg etaDate />`.

- [ ] **Steg 1: `TodayBib.tsx`** — erstatter `WorkoutCard`. Logikk fra `WorkoutCard` (fuel-linje, gjort/planlagt, klokke) beholdes:
  - `workout == null` → `RestBib` med `title = t("rest")` («Rest day»), `nextLabel = t("next")` («Next:»), `next` fra `nextWorkout(userId, date)` formatert som «{weekday}, {type lowercased} {km} km».
  - Ellers `Bib` med `label = t(\`types.${type}\`)`, `big` = strukturen fra tittelen når den matcher `/(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(km|m|min)/` (f.eks. «5×1» + unit «km»), ellers `plannedKm` med unit «km»; `meta` = «{km} km in about {fmtMinutes}» (planlagt) eller «Done: {actualKm} km» med `Check`-ikon i `text-success` (gjort); `footer` = fuel-linje med `UtensilsCrossed`-ikon og klokke-ikon til høyre når `push === "pushed"`; `href = /training/workout/{id}`.
  - Props: `{ workout: WorkoutListItem | null; kg: number; next: { date: string; type: WorkoutType; title: string; plannedKm: number } | null }`.

- [ ] **Steg 2: `WeightRow.tsx`**

```tsx
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { SectionHead } from "@/components/tasuki/SectionHead";

export async function WeightRow({ trendKg, weeklyChangeKg, goalKg, etaDate }: { trendKg: number | null; weeklyChangeKg: number | null; goalKg: number; etaDate: string | null }) {
  const t = await getTranslations("today");
  const format = await getFormatter();
  const change =
    weeklyChangeKg == null || weeklyChangeKg === 0
      ? t("weightSteady")
      : t(weeklyChangeKg < 0 ? "weightDown" : "weightUp", { kg: Math.abs(weeklyChangeKg).toFixed(1) });
  const eta = etaDate ? t("goalEta", { kg: goalKg, date: format.dateTime(new Date(`${etaDate}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" }) }) : t("goalOnly", { kg: goalKg });
  return (
    <>
      <SectionHead title={t("weight")} />
      <Link href="/body" className="block border-b border-border py-3">
        <span className="num block text-[17px] font-extrabold">{trendKg?.toFixed(1) ?? "–"} kg</span>
        <span className="block text-[13px] text-muted-foreground">
          {change} {eta}
        </span>
      </Link>
    </>
  );
}
```

Tekster under `today`: `"weight": "Weight"`, `"weightDown": "Down {kg} kg a week."`, `"weightUp": "Up {kg} kg a week."`, `"weightSteady": "Steady."`, `"goalEta": "Goal {kg} kg around {date}."`, `"goalOnly": "Goal {kg} kg."`.

- [ ] **Steg 3: `MealsList.tsx`** — én liste: `SectionHead title={t("meals")} action={<Link href="/food/log?…" className="text-[13px] font-semibold text-primary">{t("add")}</Link>}`, deretter én `ListRow` per måltid som har oppføringer: `title` = måltidsnavn, `sub` = varenavn kommaseparert, `value` = sum kcal, klikk åpner samme redigering som i dag. Behold eksisterende AI-ikon (Sparkles) som `leading` bare hvis det finnes i dag; ellers ingen. Tom dag: én linje «Nothing logged yet.» i `text-muted-foreground` + `Add`-lenken.

- [ ] **Steg 4: `CheckinCard.tsx`** — behold logikk og knapper. Stil: `rounded-md bg-card p-4`, tittel `cond text-lg`, tall `num`, knapper som piller (`rounded-full`). Fjern store bokstaver og «·».

- [ ] **Steg 5: `today/page.tsx`**

```tsx
const [checkinView, session, week, t] = await Promise.all([
  /* checkin som før */,
  snap.garmin ? todaysWorkout(user.id, snap.date) : { plan: false, workout: null },
  loadWeekStrip(supabase, user.id, snap.date),
  getTranslations("today"),
]);
const next = session.plan && !session.workout ? await nextWorkout(user.id, snap.date) : null;
const showActivity = !!snap.activity && !snap.manualTarget && !snap.target.floored;
const goalKcal = Math.round((snap.goal.rateKgPerWeek * KCAL_PER_KG) / 7);

return (
  <main className="flex flex-col px-[18px] pb-4">
    <WeekStrip days={week} date={snap.date} today={snap.today} basePath="/today" profileLink />
    {/* Garmin reauth-banner som før, restylet: rounded-md border-warning/50 bg-warning/10 */}
    {checkinView && <div className="mt-4"><CheckinCard view={checkinView} /></div>}
    {session.plan && <div className="mt-4"><TodayBib workout={session.workout} kg={snap.latestTrendKg ?? 70} next={next} /></div>}
    <KcalBlock
      intake={snap.intake}
      target={snap.macrosTarget}
      floored={snap.target.floored}
      activityKcal={showActivity ? snap.activity!.total : null}
      breakdown={showActivity ? { base: snap.baseKcal, activity: snap.activity!.total, goal: goalKcal } : null}
    />
    <MealsList entries={snap.entries} date={snap.date} />
    <WeightRow trendKg={snap.latestTrendKg} weeklyChangeKg={snap.weeklyChangeKg} goalKg={snap.goal.targetWeightKg} etaDate={snap.forecast.etaDate} />
  </main>
);
```

Behold `toCheckinView` uendret.

- [ ] **Steg 6: Slett erstattede komponenter** — `KcalCard.tsx`, `TargetBreakdown.tsx`, `WorkoutCard.tsx`, `WeightCard.tsx`, `MiniTrend.tsx`. Run `grep -rn "KcalCard\|TargetBreakdown\|WorkoutCard\|WeightCard\|MiniTrend" apps/web` → ingen treff. (`DateNav` slettes i oppgave 10.)

- [ ] **Steg 7: Verifiser**

Run: `pnpm typecheck`. Skjermbilder av `/today` i lys og mørk (390×844) med testbruker som har plan (bruk `tests/smoke/seed.mjs`): økt-dag, hviledag (`?date=` til en hviledag), dag uten logging, over mål. Forventet: matcher mockupen «Today: week strip and rest days»; økt, kcal og makroer over folden.

- [ ] **Steg 8: Commit**

```bash
git add -A apps/web/app/(app)/today apps/web/components/today apps/web/messages/en.json
git commit -m "feat(today): Tasuki layout with week strip, bib, kcal block and meal list"
```

---

### Oppgave 7: Bunnmeny, pluss-meny og ark

**Filer:**
- Endre: `apps/web/components/nav/BottomNav.tsx`, `apps/web/components/nav/PlusMenu.tsx`, `apps/web/components/common/BottomSheet.tsx`, `apps/web/components/common/Chip.tsx`, `apps/web/components/ui/button.tsx`

- [ ] **Steg 1: `BottomNav.tsx`** — `nav`: `bg-card border-t border-border` (ikke blur). Aktiv fane `text-primary`. Inaktiv `text-muted-foreground`.
- [ ] **Steg 2: `PlusMenu.tsx`** — utløserknapp: `size-[54px] rounded-[14px] bg-[var(--plus-bg)] text-[var(--plus-fg)]`, ingen skygge/glød. Arket: fire valg i 2×2, hver `rounded-md bg-muted p-4`, ikonflate `size-10 rounded-md bg-card grid place-items-center`, tittel `font-bold`, undertekst `text-[13px] text-muted-foreground` (behold tekstene «AI estimates it» osv.).
- [ ] **Steg 3: `BottomSheet.tsx`** — `bg-popover rounded-t-[18px]`, tittel `cond text-2xl`, lukkeknapp beholdes.
- [ ] **Steg 4: `Chip.tsx` og `button.tsx`** — piller: `rounded-full`. Primærknapp `bg-primary text-primary-foreground`. Sekundær `bg-card border border-border`. Fjern store radius-verdier (`rounded-2xl/3xl`) fra varianter.
- [ ] **Steg 5: Verifiser og commit** — `pnpm typecheck`; skjermbilde av åpen pluss-meny i lys og mørk.

```bash
git add apps/web/components/nav apps/web/components/common apps/web/components/ui/button.tsx
git commit -m "feat(design): Tasuki bottom nav, plus menu, sheets and buttons"
```

---

### Oppgave 8: Treningskart og Trening-fanen

**Filer:**
- Opprett: `apps/web/components/training/TrainingMap.tsx` (klient)
- Opprett: `apps/web/components/training/AdjustPlanButton.tsx` (klient; erstatter `PlanActions.tsx`)
- Endre: `apps/web/app/(app)/training/page.tsx`, `apps/web/components/training/WorkoutRow.tsx`, `apps/web/components/training/ProposalCard.tsx`
- Slett: `apps/web/components/training/PlanActions.tsx`
- Endre: `apps/web/messages/en.json` (`training.raceDay`, `training.thisWeek` finnes, `training.finish`, fjern `garminRequiredHint`/`noPlanHint` per oppgave 12)

**Grensesnitt:**
- Konsumerer: `TrainingView`, `WeekView`, `WorkoutListItem` (`lib/training/view.ts`), `Sash`, `StatRow`.
- Produserer: `<TrainingMap thisWeek={WeekView | null} upcoming={WeekView[]} today raceLabel={string | null} raceDateLabel={string | null} />`; `<AdjustPlanButton />`.

- [ ] **Steg 1: `WorkoutRow.tsx`** — rad uten kort: `grid grid-cols-[42px_6px_1fr_auto] items-center gap-2.5 border-b border-border py-2.5`. Kolonne 1: ukedag (11 px, muted) over dato (`num text-lg font-extrabold`). Kolonne 2: `<Sash type={w.type} state={…} className="h-[30px] w-1.5" />` (state fra `w.status`: done/missed/planned). Kolonne 3: tittel `font-bold truncate`, under: «On your watch» når `push === "pushed"` og planlagt, ellers «Done: {actualKm} km»/«Missed». Kolonne 4: `num font-extrabold` km. Ingen «·».

- [ ] **Steg 2: `TrainingMap.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { WeekView } from "@/lib/training/view";
import { WorkoutRow } from "./WorkoutRow";
import { cn } from "@/lib/utils";

const EASY = new Set(["recovery", "taper"]);

/** Plan as a line map: one square stop per week, km bar from a shared start line, chequered finish. */
export function TrainingMap({
  thisWeek,
  upcoming,
  today,
  raceLabel,
  raceDateLabel,
}: {
  thisWeek: WeekView | null;
  upcoming: WeekView[];
  today: string;
  raceLabel: string | null;
  raceDateLabel: string | null;
}) {
  const t = useTranslations("training");
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...[thisWeek, ...upcoming].filter(Boolean).map((w) => w!.plannedKm));
  const bar = (km: number) => `${Math.round((km / max) * 124)}px`;

  const Stop = ({ w, now }: { w: WeekView; now?: boolean }) => {
    const easy = EASY.has(w.phase);
    const isOpen = now || open === w.monday;
    return (
      <>
        <button
          type="button"
          disabled={now}
          onClick={() => setOpen(isOpen ? null : w.monday)}
          aria-expanded={isOpen}
          className="relative grid min-h-[42px] w-full grid-cols-[30px_1fr_auto] items-center gap-2.5 text-left"
        >
          <span aria-hidden className={cn("absolute bottom-0 left-[11px] top-0 w-2", easy ? "bg-[repeating-linear-gradient(180deg,var(--muted-foreground)_0_5px,transparent_5px_9px)]" : "bg-foreground", now && "top-1/2")} />
          <span aria-hidden className={cn("relative justify-self-center", now ? "size-[26px] bg-primary" : cn("size-[18px] border-4 bg-background", easy ? "border-muted-foreground" : "border-foreground"))} />
          <span className={cn("whitespace-nowrap", now && "text-primary")}>
            <span className="cond text-[21px] leading-none">{now ? t("thisWeek") : t("week", { n: w.week })}</span>
            {!now && w.phase !== "build" && <span className="block text-xs text-muted-foreground">{t(`phase.${w.phase}`)}</span>}
          </span>
          <span className="grid grid-cols-[124px_44px] items-center gap-1.5">
            <span
              className={cn("block h-2.5", now ? "bg-primary" : easy ? "bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_2px,transparent_2px_5px)] shadow-[inset_0_0_0_1px_var(--muted-foreground)]" : "bg-foreground")}
              style={{ width: bar(w.plannedKm) }}
            />
            <span className={cn("num text-right text-lg font-extrabold", now && "text-primary")}>{w.plannedKm}</span>
          </span>
        </button>
        {isOpen && (
          <div className="relative ml-10 pb-2">
            <span aria-hidden className="absolute -left-[29px] bottom-0 top-0 w-2 bg-foreground" />
            {w.workouts.map((x) => (
              <WorkoutRow key={x.id} w={x} today={today} />
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="mt-5">
      {thisWeek && <Stop w={thisWeek} now />}
      {upcoming.map((w) => (
        <Stop key={w.monday} w={w} />
      ))}
      {raceLabel && (
        <div className="relative grid grid-cols-[30px_1fr_auto] items-center gap-2.5 pt-1.5">
          <span aria-hidden className="absolute left-[11px] top-0 h-1/2 w-2 bg-foreground" />
          <span aria-hidden className="relative size-[30px] justify-self-center shadow-[0_0_0_3px_var(--foreground)] [background:conic-gradient(var(--foreground)_25%,var(--background)_0_50%,var(--foreground)_0_75%,var(--background)_0)_0_0/15px_15px]" />
          <span className="cond text-2xl leading-none">
            {t("raceDay")}
            <span className="mt-0.5 block text-xs font-medium text-muted-foreground [font-stretch:100%]">{raceDateLabel}</span>
          </span>
          <span className="num text-[34px] font-black leading-none text-primary [font-stretch:62%]">{raceLabel}</span>
        </div>
      )}
    </div>
  );
}
```

Faser (`Phase` i `packages/core/src/training/types.ts`): `base`, `build`, `peak`, `taper`, `recovery`. Lette uker = `recovery` og `taper` (stiplet spor, grå markør, fasenavn under). Løpsuka er siste uke i `upcoming` og vises som vanlig stopp før målflagget.

- [ ] **Steg 3: `AdjustPlanButton.tsx`** — flytt logikken fra `PlanActions` (adjust-fetch, feilkoder, toasts, end-plan med bekreftelse). Utløser: pille `rounded-full border border-border bg-card px-3 py-[7px] text-[13px] font-semibold` med `Sparkles` i `text-primary` og teksten «Adjust plan». Arket: tekstfelt + «Adjust»-knapp; nederst i arket «End plan» som tekstknapp i `text-destructive` med samme inline-bekreftelse som før.

- [ ] **Steg 4: `training/page.tsx`**
  - Header: `<div className="flex items-center justify-between"><h1 className="cond text-[34px] leading-none">{t("title")}</h1><AdjustPlanButton /></div>`.
  - Løpsblokk: `<div className="mt-4 flex items-end gap-3"><p className="num text-[84px] font-black leading-[.82] [font-stretch:62%]">{distance}</p><p className="pb-1 text-sm"><b className="num block text-lg font-extrabold">{dato lang}</b>{t("raceDay")}</p></div>`; bygg-plan: «Build» i samme stil uten dato.
  - `StatRow` med weeks left, predicted/target (`fmtClock`), VDOT.
  - Forslag som før (restylet kort, oppgave 8 steg 5).
  - `TrainingMap` med `raceLabel = distance` og `raceDateLabel` = «Saturday 13 December» (formatert) når `goal === "race"`.
  - `SectionHead title={t("paces")}` + `StatRow` med fire soner (easy-intervall med en-dash er greit).
  - Tomtilstander (ingen Garmin, ingen plan): `h2.cond text-2xl`, én setning, én primærknapp. Ingen gradient.
  - Fjern `<PlanActions />` og uke-`details`.

- [ ] **Steg 5: `ProposalCard.tsx`** — `rounded-md bg-card p-4 border-l-4 border-primary`, tittel `font-bold`, knapper som piller.

- [ ] **Steg 6: Verifiser og commit** — `pnpm typecheck`; skjermbilder av `/training` i lys og mørk med seedet plan; åpne uke 2 (klikk) og ta skjermbilde. Forventet: hele kartet + «Adjust plan» synlig uten å scrolle til bunnen; samsvar med mockupen «Tasuki training map», høyre variant.

```bash
git add -A apps/web/app/(app)/training/page.tsx apps/web/components/training apps/web/messages/en.json
git commit -m "feat(training): Tasuki line map with km bars, adjust plan in header"
```

---

### Oppgave 9: Øktside, veiviser og fueling

**Filer:**
- Endre: `apps/web/app/(app)/training/workout/[id]/page.tsx`, `apps/web/components/training/FuelSection.tsx`, `apps/web/components/training/PlanWizard.tsx`, `apps/web/app/(app)/training/new/page.tsx`

- [ ] **Steg 1: Øktside-topp** — bruk `Bib` (`label` = type, `big`/`unit` som i `TodayBib`, `meta` = «{lang dato}, {Planned|Done}», `footer` = klokke-ikon + «On your watch» når pushet). Tilbakelenke over: `ChevronLeft` + «Training» i `text-muted-foreground`.
- [ ] **Steg 2: Steg-liste** — `SectionHead title={t("steps")}`; hvert steg som `ListRow` (`title` = «Warm up 2 km», `value` = tempoområde). Repetisjonsblokk: rad med «5×» i `text-primary font-extrabold`, så løp/hvile-rader innrykket med venstrestrek `border-l-2 border-foreground pl-3`. Over listen: stripet rad (`flex h-2.5 gap-[3px]`) med ett segment per steg, bredde ∝ distanse/varighet, farge = `var(--w-easy)` for oppvarming/nedjogg og `var(--w-{type})` for drag; hvile som `bg-border`.
- [ ] **Steg 3: `FuelSection.tsx`** — `SectionHead title={t("fuel")}`; «Before» og «After» som `ListRow` (`title` = tid, `sub` = mengder); «Suggest food» som tekstknapp med `Sparkles` i `text-primary`. Fjern «·».
- [ ] **Steg 4: `PlanWizard.tsx`** — steg-overskrifter `cond text-[28px]`, valg som piller (`Chip`), dagvelger som 7 kvadratiske bokser (samme stil som uke-stripen), forhåndsvisning med `StatRow`. Fjern `buildHint`/`recentHint` (oppgave 12) og «·».
- [ ] **Steg 5: Verifiser og commit** — `pnpm typecheck`; skjermbilder av øktside (intervall-økt) og veiviser steg 1 og forhåndsvisning, lys og mørk.

```bash
git add -A apps/web/app/(app)/training apps/web/components/training
git commit -m "feat(training): bib header on workout page, step stripe, fuel and wizard restyle"
```

---

### Oppgave 10: Mat, logg mat og mat-ark

**Filer:**
- Endre: `apps/web/app/(app)/food/page.tsx`, `apps/web/app/(app)/food/log/page.tsx`, `apps/web/components/food/DayFoodList.tsx`, `apps/web/components/food/FoodLogger.tsx`, `apps/web/components/food/ItemRow.tsx`, `apps/web/components/food/EditEntrySheet.tsx`, `apps/web/components/food/QuickAddSheet.tsx`
- Slett: `apps/web/components/today/DateNav.tsx`

**Grensesnitt:** Konsumerer `WeekStrip` + `loadWeekStrip`, `KcalBlock`, `SectionHead`, `ListRow`.

- [ ] **Steg 1: `food/page.tsx`** — erstatt `DateNav` + `Total`-rutenettet med `WeekStrip basePath="/food"` og `KcalBlock` (samme `activityKcal`/`breakdown`-utregning som på I dag; hent `snap.activity` på samme måte). Fjern «{pct}% of today's target»-linjen. Behold `DayFoodList`.
- [ ] **Steg 2: `DayFoodList.tsx`** — `SectionHead` per måltid med kcal-sum til høyre; varer som `ListRow` (`title` = navn, `sub` = «{P}P {C}C {F}F» med mellomrom, ikke «·», `value` = kcal). Bilder som små kvadratiske miniatyrer (`rounded-sm`).
- [ ] **Steg 3: `FoodLogger.tsx`** — total: «Total» liten, så `num text-[72px] font-black [font-stretch:62%]` + «kcal», makroer under i sine farger (`text-protein` osv.) adskilt med mellomrom. AI-notat som én linje i `text-[13px] text-muted-foreground`.
- [ ] **Steg 4: `ItemRow.tsx`** — ikke kort. Rad: konfidens-prikk + navn `font-bold` + slett-ikon; under: fem tall-felter i én linje (`grid grid-cols-5 gap-1.5`), hvert felt `rounded-md bg-muted px-2 py-1.5` med liten etikett (g, kcal, P, C, F; P/C/F i makrofarge) og verdi `num text-right font-bold`; notat `text-[13px] text-muted-foreground`. Skillelinje `border-b border-border` mellom varer.
- [ ] **Steg 5: Ark** — `EditEntrySheet` og `QuickAddSheet` arver `BottomSheet`-stilen; felter `rounded-md`, store tall `num`. Fjern `·` og hint-tekster per oppgave 12.
- [ ] **Steg 6: Slett `DateNav.tsx`** — `grep -rn DateNav apps/web` → ingen treff.
- [ ] **Steg 7: Verifiser og commit** — `pnpm typecheck`; skjermbilder av `/food`, `/food/log` (AI-gjennomgang, bruk smoke-flyten), hurtiglegg-ark, lys og mørk.

```bash
git add -A apps/web/app/(app)/food apps/web/components/food apps/web/components/today
git commit -m "feat(food): Tasuki food page, logger rows and sheets"
```

---

### Oppgave 11: Kropp

**Filer:**
- Endre: `apps/web/app/(app)/body/page.tsx`, `apps/web/components/body/WeightChart.tsx`, `apps/web/components/body/WeightList.tsx`, `apps/web/components/body/PhotoGallery.tsx`, `apps/web/components/body/WeightSheet.tsx`

- [ ] **Steg 1: Topp** — `h1.cond text-[34px]` «Body». Under: `num text-[72px] font-black [font-stretch:62%]` trendvekt + «kg», til høyre/under: «−0.5 kg per week» og «Goal 80 kg around 11 Dec» (`text-[13px]`, tall i `num font-extrabold text-foreground`). Fjern de tre stat-kortene og setningen «At this pace…» (prognosen står i linjen).
- [ ] **Steg 2: `WeightChart.tsx`** — trendlinje `var(--foreground)` 2.5 px, målepunkter `var(--muted-foreground)` 40 % opasitet, prognose stiplet `var(--primary)`, mål stiplet `var(--success)`, rutenett `var(--border)`, aksetekst `var(--muted-foreground)`. Ingen kort rundt; periodevalg som piller under.
- [ ] **Steg 3: Bilder og historikk** — `SectionHead` «Progress photos» og «History»; historikk som `ListRow` (`title` = dato, `value` = «84.1 kg», `trailing` = slett-ikon). Tom bildeliste: én linje «No photos yet.» + knapp «Add photo» (åpner vekt-arket).
- [ ] **Steg 4: `WeightSheet.tsx`** — stor `num`-inndata, behold vekt-tipset forkortet: «Best in the morning, before food.»
- [ ] **Steg 5: Verifiser og commit** — `pnpm typecheck`; skjermbilder av `/body` med 30+ dager data og uten data, lys og mørk.

```bash
git add apps/web/app/(app)/body apps/web/components/body
git commit -m "feat(body): big trend number, ink chart, list history"
```

---

### Oppgave 12: Profil, onboarding, innlogging og tekst-pass

**Filer:**
- Endre: `apps/web/app/(app)/profile/page.tsx`, `apps/web/components/profile/ProfileCards.tsx`, `apps/web/components/profile/GarminCard.tsx`, `apps/web/components/profile/ApiKeyCard.tsx`, `apps/web/app/onboarding/page.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/(app)/loading.tsx`, `apps/web/messages/en.json`

- [ ] **Steg 1: Profil** — seksjoner med `SectionHead`, felter som `ListRow` med verdi til høyre; Garmin- og API-nøkkel-kort `rounded-md bg-card p-4`. Fjern `overrideHint`, `activityHint`, `stepsHint`, `otherHint`.
- [ ] **Steg 2: Onboarding og innlogging** — overskrifter `cond text-[34px]`, valg som piller, primærknapp i full bredde `h-12 rounded-full`. Innlogging: startnummer-logoen (inline SVG fra `scripts/icons/bib.svg`, 72 px, `rounded-[16px]`) over «Ganba» i `cond text-5xl`.
- [ ] **Steg 3: `loading.tsx`** — skjelett som matcher ny layout (uke-stripe, startnummer-blokk, tall), `bg-muted rounded-md`, ingen store avrundede kort.
- [ ] **Steg 4: Tekst-pass i `en.json`**
  - Fjern nøklene: `stepsHint`, `otherHint`, `compareHint`, `overrideHint`, `restHint`, `garminRequiredHint`, `noPlanHint`, `buildHint`, `recentHint`, `activityHint` og deres bruk i komponentene.
  - Forkort: vekt-tips → «Best in the morning, before food.»; `targetTimeHint` → «h:mm:ss or mm:ss. Leave empty to use your predicted time.»; skade-tips → «Injured or taking a break? Set running to 0 and your target drops.»
  - Skriv om de resterende tankestrekene til komma eller to setninger: `too_early` → «Keep logging. Your first adaptive update comes after about two weeks.»; `pushFailed` → «Couldn’t send to watch. Will retry.»; `sparse` → «Few recent runs, so the plan starts gently.»; `didQuality` → «Recent fast laps found, so sessions start a level up.»; `default` (fitness) → «No recent runs found. Starting cautiously.»
  - Fjern «·» i `en.json` (2 steder) og i komponentene (`grep -rn "·" apps/web/app apps/web/components`).
- [ ] **Steg 5: Kontroll**

Run: `grep -n "—" apps/web/messages/en.json; grep -rn "—\|·" apps/web/app apps/web/components --include=*.tsx; grep -rn "uppercase" apps/web/app apps/web/components --include=*.tsx`
Forventet: ingen treff (kommentarer i kode er unntatt; sjekk treff manuelt).

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/messages/en.json','utf8'))"` → ingen feil. `pnpm typecheck` → ingen feil (next-intl gir typefeil for fjernede nøkler som fortsatt brukes).

- [ ] **Steg 6: Commit**

```bash
git add -A apps/web/app apps/web/components apps/web/messages/en.json
git commit -m "feat(design): profile, onboarding and login restyle; copy pass without hints and dashes"
```

---

### Oppgave 13: Docs, verifisering og avslutning

**Filer:**
- Endre: `docs/design.md` (skrives om), `CLAUDE.md` (lenke til spec under «Les først»), `docs/02-decisions.md` (eventuelle valg tatt underveis)
- Opprett: `tests/smoke/redesign-shots.mjs`
- Endre: `tests/smoke/smoke.mjs`, `checkin-smoke.mjs`, `profile-smoke.mjs`, `training-smoke.mjs` (selektorer)

- [ ] **Steg 1: `docs/design.md`** — ny retning «Tasuki»: prinsipper (startnummer, tasuki-stripe, smal Archivo, én aksent, kort bare der noe trykkes som enhet, lys/mørk følger telefonen), token-tabellen fra spec §1, typografi-skala, komponentliste (`components/tasuki`, WeekStrip, KcalBlock, TrainingMap), tekstregler (ingen tankestreker, ingen «·», ingen store bokstaver). Fjern Runna-inspirasjonen og den gamle token-tabellen.
- [ ] **Steg 2: `CLAUDE.md`** — legg til under «Les først»: `- [docs/specs/2026-10-04-redesign-tasuki.md](docs/specs/2026-10-04-redesign-tasuki.md) — **redesign** (Tasuki-uttrykket, tokens, komponenter)`.
- [ ] **Steg 3: Skjermbilde-skript `tests/smoke/redesign-shots.mjs`**

```js
// Screenshots every main screen in light and dark. Usage: node tests/smoke/redesign-shots.mjs [baseUrl]
// Expects a logged-in storage state from smoke.mjs (tests/smoke/out/state.json) or set SMOKE_STATE.
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const state = process.env.SMOKE_STATE ?? "tests/smoke/out/state.json";
const pages = ["/today", "/training", "/food", "/body", "/profile", "/food/log?mode=text"];

const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    storageState: existsSync(state) ? state : undefined,
  });
  const page = await ctx.newPage();
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    const name = p.replace(/[/?=]+/g, "-").replace(/^-/, "") || "root";
    await page.screenshot({ path: `tests/smoke/out/redesign-${scheme}-${name}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log("screenshots in tests/smoke/out/");
```

Sjekk hvordan `smoke.mjs` logger inn; hvis det ikke lagrer `storageState`, legg til `await context.storageState({ path: "tests/smoke/out/state.json" })` etter innlogging der.

- [ ] **Steg 4: Smoke-selektorer** — kjør hvert smoke-skript mot `pnpm dev` (port 3100 som skriptene forventer). Oppdater selektorer som pekte på fjernede elementer (f.eks. «Today»-tittel i `DateNav`, uke-`details`, «Adjust with AI»-knapp nederst, `KcalCard`-tekster). Ikke endre hva flytene tester.

Run: `node tests/smoke/smoke.mjs && node tests/smoke/checkin-smoke.mjs && node tests/smoke/profile-smoke.mjs && node tests/smoke/training-smoke.mjs`
Forventet: alle fullfører uten feil.

- [ ] **Steg 5: Bygg og skjermbilder**

Run: `pnpm typecheck && pnpm build` → grønt. Run: `node tests/smoke/redesign-shots.mjs` og gå gjennom alle 12 bildene mot mockupen og Review Focus-listen (lange titler, over mål, uten plan, mørk modus, uke-stripe på kanten). Kontrast: sjekk muted-foreground mot background og card i begge moduser (≥ 4.5:1).

- [ ] **Steg 6: Commit**

```bash
git add docs/design.md CLAUDE.md docs/02-decisions.md tests/smoke
git commit -m "docs(design): Tasuki design doc; smoke selectors and redesign screenshots"
```

- [ ] **Steg 7: Helhetlig review** — fersk reviewer på sterkeste modell gjennomgår hele grenen mot spec og Review Focus. Én fiksrunde. Deretter `superpowers:finishing-a-development-branch`.
