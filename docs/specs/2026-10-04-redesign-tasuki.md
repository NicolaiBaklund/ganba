# Redesign «Tasuki»

Dato: 2026-10-04. Status: til godkjenning.
Mockup: [docs/mockups/2026-10-04-tasuki.html](../mockups/2026-10-04-tasuki.html) (åpne i nettleser; lys/mørk-bryter øverst).
Beslutninger: se `docs/02-decisions.md`, rader merket 2026-10-04 «Redesign».

## Mål

Appen ser generisk ut (mørk marineblå + elektrisk blå + like, store, avrundede kort) og krever mye scrolling. Redesignet skal gi Ganba en egen identitet hentet fra japansk løpekultur (*ganbaru*, ekiden-stafett), og vise det viktigste på hver skjerm uten scrolling.

**Suksess:**
- Et skjermbilde kjennes igjen som Ganba uten logo.
- I dag: økt, kcal igjen og makroer synlig uten scrolling på en vanlig telefon (ca. 390×844).
- Trening: hele planen og «Juster plan» synlig uten å scrolle til bunnen.
- Ingen tankestreker (—) og ingen «·»-kjeder i UI-tekst. Hjelpetekster bare der de hindrer feil.

## Utenfor scope

- Nye funksjoner eller endret datalogikk. Samme data, samme API-er.
- Mat-fanens struktur (kun ny stil). Brukeren legger til en restitusjons-fane senere og ordner fanene da.
- Enhetstester (prosjektregel).

## Leveranse

Alt på én gang: gren `redesign`, alle skjermer, slås sammen samlet. Internt bygges fundament og delte komponenter først, så skjermene.

---

## 1. Fundament

### Farger (tokens i `apps/web/app/globals.css`)

Lys er grunnpaletten på `:root`. Mørk overstyrer bare tokens under `@media (prefers-color-scheme: dark)`. Appen følger telefonens innstilling; ingen egen bryter nå.

| Token | Lys | Mørk | Bruk |
|---|---|---|---|
| background | `#eef0f2` | `#000000` | app-bakgrunn |
| surface (card) | `#ffffff` | `#16171a` | flater, logget-dag-bokser, knapper |
| popover | `#ffffff` | `#1c1d21` | ark, menyer |
| foreground (ink) | `#000000` | `#ffffff` | tekst, spor, streker |
| muted-foreground | `#5f646d` | `#9aa0aa` | sekundærtekst |
| border (line) | `#d6d9de` | `#2b2d32` | skillelinjer, tomme barer |
| **primary (red)** | `#c8102e` | `#ff3b55` | aksent: i dag, aktiv fane, denne uka, aktivitets-merke, lenker |
| paper / paper-ink | `#ffffff` / `#000000` | samme | startnummeret er alltid hvitt papir med svart trykk |
| protein / carbs / fat | `#e8336b` / `#e89a1a` / `#7a5cf0` | samme | makrobarer |
| success / warning / destructive | beholdes, justeres for kontrast i begge moduser | | |
| w-easy / w-long / w-intervals / w-threshold / w-tempo / w-strides / w-race | `#1fa98a` / `#2f6fd6` / `#e8336b` / `#e89a1a` / `#7a5cf0` / `#34b37a` / `#d4a20f` | samme (sjekk kontrast mot svart) | økttyper: tasuki-striper, ukestripe, kart |

`color-scheme` settes til `light` på `:root` og `dark` i mørk-blokken. Den gamle tvungne mørke modusen og `@custom-variant dark (&:is(.dark *))` erstattes med media-basert mørk modus. `sonner.tsx` følger systemtema.

### Typografi

- **Archivo** (variabel, akser `wdth` 62–125 og `wght`), via `next/font/google`. Erstatter Sora og Geist.
- To bruksmåter av samme familie:
  - **Smal** (`font-stretch: 62–75%`, vekt 800–900): store tall og overskrifter. Klasse `.cond`; `.num` = smal + `tabular-nums`.
  - **Normal** bredde, vekt 400–700: brødtekst og etiketter.
- Skala (px): 104 (startnummer-tall), 72 (kcal igjen), 34 (sidetittel), 22 (seksjon), 17 (listetall), 15 (brødtekst), 13 (sekundær), 11 (ukedag, tegnforklaring).
- Ingen store bokstaver i etiketter.

### Form

- Startnummer og ukebokser: radius 6 px. Knapper og merker: pille (999 px). Kartmarkører: firkanter.
- Kort brukes bare der noe trykkes som én enhet (startnummer, ark). Ellers bærer typografi og streker hierarkiet: 2 px svart strek under seksjonsoverskrift, 1 px linje mellom rader.
- Ingen glød, ingen gradienter.

### Logo og ikoner

- **Startnummer:** karmosinrød bakgrunn, hvitt startnummer med fire sikkerhetsnåler, svart smal «G» (Archivo 900, 62 %).
- SVG-kilde i `apps/web/app/icon.svg`. Bokstaven konverteres til path (ingen fontavhengighet).
- Favicon 16–32 px: forenklet variant uten nåler, tykkere G.
- PNG-er genereres fra SVG med et lite skript (Playwright finnes allerede): `apple-icon.png` (180), `public/icon-192.png`, `public/icon-512.png`, `favicon.ico`.
- `manifest.ts` og `viewport.themeColor`: lys `#eef0f2`, mørk `#000000` (themeColor som liste med `media`).

## 2. Delte komponenter

Nye/omskrevne, hver med én jobb:

| Komponent | Gjør | Erstatter |
|---|---|---|
| `Bib` | Startnummer for dagens økt: øktype (etikett), stort tall (struktur eller km), varighet, fueling-linje, klokke-ikon. Tasuki-stripe i økttypens farge øverst til høyre. Fire nålehull. | `today/WorkoutCard` |
| `Bib` (hvile-variant) | Lite startnummer: grå stripe, «Rest day», «Next: Friday, easy run 6 km» med fargestripe | tom tilstand i WorkoutCard |
| `Sash` | Skrå fargestripe (skewX) for en økttype; brukes i lister, ukestripe, kart | farge-streker i `WorkoutRow` |
| `WeekStrip` | Uka (man–søn) for valgt dato. Boks: hvit = mat logget, rød = valgt/i dag. Under boksen: én stripe per økt, hel = gjennomført, stripet = planlagt. Trykk dag = gå dit. Små piler i datolinjen for forrige/neste uke (ikke forbi inneværende uke). Når valgt dag ikke er i dag, viser datolinjen «Today»-lenke tilbake. | `today/DateNav` (pilene) |
| `KcalBlock` | Kcal igjen (smalt, stort), spist og mål, merke «+N activity» alltid synlig, tre separate makrobarer. Trykk på mål åpner ark med utregning (Base + activity − goal). | `today/KcalCard`, `today/TargetBreakdown`, toppen av Mat-siden |
| `SectionHead` | Smal overskrift + valgfri handling (lenke/knapp) + 2 px strek | ad hoc `h2` |
| `ListRow` | Tittel, undertekst, tall til høyre | kort per rad |
| `StatRow` | 2–4 verdier med etikett under | stat-kort på Kropp, race-kort |
| `TrainingMap` | Linjekart: tykt spor, firkantet markør per uke, lette/taper-uker stiplet og grå, denne uka rød blokk, sjakkflagg på løpsdag. Km-bar per uke fra felles startlinje + km-tall. Denne uka alltid åpen; én annen uke åpen om gangen; trykk økt → øktside. | uke-`details` på Trening |
| `BottomNav` | Samme faner. «+» = svart (lys) / hvit (mørk) firkant med radius 14, ingen glød. Aktiv fane rød. | restyle |

## 3. Skjermer

### I dag
1. Datolinje («Sunday 4 October», smal fet) + profil-avatar. Ingen tilbakepil.
2. `WeekStrip`.
3. `Bib` (eller hvile-variant).
4. `KcalBlock`.
5. Måltider: `SectionHead` «Meals» + «Add», én liste (måltid, varer som undertekst, kcal). Trykk rad = rediger som i dag.
6. Innsjekk-kort (når aktivt) og vekt-rad: «84.6 kg», «Down 0.5 kg a week. Goal 80 kg around 11 Dec.»

### Trening
1. «Training» + pille «Adjust plan» (sparkle-ikon) til høyre; åpner eksisterende juster-ark. «End plan» flyttes inn i arket (med samme bekreftelse).
2. Løpsblokk: «10K» stort smalt, dato, «Race day». Bygg-plan uten løp: «Build» i samme stil.
3. `StatRow`: weeks left, predicted/target, VDOT.
4. Forslag (`ProposalCard`) som i dag, restylet.
5. `TrainingMap`.
6. Tempo: `StatRow` med fire soner nederst.
7. Tomtilstander (ingen Garmin / ingen plan): stor smal overskrift, én setning, én knapp.

### Øktside
- Topp som startnummer: type, stort tall, dato og status, «On your watch».
- Steg som liste; intervall-blokken også som stripet rad (oppvarming, dragene, nedjogg) i økttypens farger.
- Fueling-seksjon restylet; «Suggest food» beholdes.

### Logg mat (`FoodLogger`)
- Total øverst stort og smalt med makroer under.
- Hver vare som kompakt rad: navn + slett, tall-felter (g, kcal, P, C, F) i én linje, notat som undertekst. Ikke kort per vare.

### Mat
- Samme struktur. Toppen bruker `KcalBlock`. Lister med `ListRow`.

### Kropp
- Trendvekt stort og smalt, «−0.5 kg per week» og «Goal 80 kg» på samme linje. De tre stat-kortene og den gjentatte setningen fjernes (målprognosen står i linjen).
- Graf: svart trendlinje, punkter grå, prognose stiplet rød, mål stiplet. Periodevalg som piller.
- Bilder og historikk som liste.

### Profil, planveiviser, onboarding, innlogging, ark
- Samme byggeklosser: `SectionHead`, `ListRow`, piller, smale tall.
- Pluss-menyen: fire valg som 2×2 med firkantede ikonflater, kort tekst.
- Ark: popover-flate, radius bare øverst.

## 4. Tekst

- Fjern hjelpetekster som ikke hindrer feil. Kandidater (`messages/en.json`): `stepsHint`, `otherHint`, `compareHint`, `overrideHint`, `restHint`, `garminRequiredHint`, `noPlanHint`, `buildHint`, `recentHint`, `activityHint`. Pluss-menyens korte undertekster («AI estimates it» osv.) beholdes; de er etiketter, ikke notater. Beholdes forkortet: vekt-tips («Best in the morning, before food.»), `targetTimeHint` (format), skade-tips om løp = 0.
- Ingen tankestreker: 9 i `en.json`. Skriv om til to setninger eller komma.
- Ingen «·»-kjeder: 13 steder i komponenter, 2 i `en.json`. Bruk linjeskift, komma eller layout.
- Ingen etiketter i store bokstaver (f.eks. «TODAY'S SESSION · INTERVALS» forsvinner; økttypen står på startnummeret).
- Ord: «activity» (ikke «training») for skritt over grunnivå + gjennomførte økter + planlagt løp som ikke er gjort.

## 5. Teknisk

- `globals.css`: ny token-blokk (lys + mørk), `@theme inline` peker på nye fonter, radius-skala justeres. Fjern sidebar-/chart-tokens som ikke brukes.
- `app/layout.tsx`: Archivo inn, Sora/Geist ut. `viewport.themeColor` per modus.
- shadcn-komponenter (`components/ui`) beholdes, restyles via tokens.
- `docs/design.md` skrives om til Tasuki-retningen og nye tokens.
- Komponenter som erstattes slettes når erstatningen står: `today/DateNav`, `today/KcalCard`, `today/TargetBreakdown`, `today/WorkoutCard`. `today/WeightCard` + `MiniTrend` erstattes av vekt-raden på I dag (minitrend-grafen utgår der; full graf finnes på Kropp).

## 6. Verifisering

- `pnpm typecheck` og `pnpm build`.
- Smoke-skriptene (`smoke.mjs`, `checkin-smoke.mjs`, `profile-smoke.mjs`, `training-smoke.mjs`) kjøres; selektorer oppdateres der layouten endres.
- Skjermbilder av alle skjermer i lys og mørk (Playwright `colorScheme`), gjennomgått mot mockupen.
- Kontrast: tekst mot bakgrunn minst 4.5:1, store tall og ikoner minst 3:1, i begge moduser.
- Tastaturfokus synlig; `prefers-reduced-motion` respekteres.
