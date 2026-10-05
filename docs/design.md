# Ganba — designretning «Tasuki»

Hentet fra japansk løpekultur: *ganbaru* (stå på) og ekiden-stafetten, der løperne bærer en tasuki (skrå stripe over brystet) og et startnummer. Spec: [specs/2026-10-04-redesign-tasuki.md](specs/2026-10-04-redesign-tasuki.md). Mockup: [mockups/2026-10-04-tasuki.html](mockups/2026-10-04-tasuki.html).

## Prinsipper
- **Startnummeret er hovedelementet.** Dagens økt vises som et hvitt startnummer med fire nålehull og en skrå tasuki-stripe i økttypens farge. Alltid hvitt papir med svart trykk, også i mørk modus. Hviledag = lite startnummer med grå stripe og neste økt.
- **Én aksent: karmosinrød.** Brukes på valgt dag, aktiv fane, denne uka i kartet, «+activity»-merket og lenker. Ikke som dekor.
- **Svart/hvitt ellers.** Lys modus: grå-hvit bakgrunn, hvite flater, svart tekst. Mørk modus: svart bakgrunn, mørkegrå flater, hvit tekst. Følger telefonens innstilling.
- **Store, smale tall.** Det viktigste tallet på hver skjerm (startnummer, kcal igjen, trendvekt, løpsdistanse) i smal, kraftig Archivo, tabular-nums.
- **Typografi og streker bærer hierarkiet, ikke kort.** Seksjonsoverskrift med 2 px strek under, 1 px linje mellom rader. Kort bare der noe trykkes som én enhet (startnummer, ark, innsjekk).
- **Faste farger for data.** Protein, karbo og fett har alltid samme farge og egne barer. Hver økttype har sin farge, brukt som skrå stripe overalt (uke-stripe, lister, kart, startnummer).
- **Minst mulig innsats** (produktprinsipp): store trykkflater, numerisk tastatur, forhåndsvalg.

## Tokens (i `apps/web/app/globals.css`)

| Token | Lys | Mørk | Bruk |
|---|---|---|---|
| background | `#eef0f2` | `#000000` | app-bakgrunn |
| card | `#ffffff` | `#16171a` | flater, logget-dag-bokser |
| popover | `#ffffff` | `#1c1d21` | ark, menyer |
| muted | `#e2e5e9` | `#222428` | skjelett, inputflater |
| foreground | `#000000` | `#ffffff` | tekst, spor, streker |
| muted-foreground | `#5f646d` | `#9aa0aa` | sekundærtekst |
| border | `#d6d9de` | `#2b2d32` | linjer, tomme barer |
| **primary** | `#c8102e` | `#ff3b55` | aksent |
| paper / paper-ink | `#ffffff` / `#000000` | samme | startnummeret |
| protein / carbs / fat | `#e8336b` / `#e89a1a` / `#7a5cf0` | samme | makrobarer |
| success / warning / destructive | `#138a5e` / `#b86e00` / `#c62828` | `#34d399` / `#ffb547` / `#ff5c5c` | status |
| w-easy / w-long / w-intervals / w-threshold / w-tempo / w-strides / w-race | `#1fa98a` / `#2f6fd6` / `#e8336b` / `#e89a1a` / `#7a5cf0` / `#34b37a` / `#d4a20f` | samme | økttyper |
| w-rest | `#b9bec6` | `#6b7079` | hviledag-stripe |
| plus-bg / plus-fg | svart / hvit | hvit / svart | «+»-knappen |

Tailwind-klasser: `bg-primary`, `bg-paper`, `text-paper-ink`, `text-protein`, `bg-carbs` osv. Økttyper: `style={{ background: "var(--w-…)" }}` eller `typeColor()` i `lib/training/format.ts`.

## Typografi
- **Archivo** (variabel, `wdth` 62–125), eneste font.
- `.cond`: overskrifter (smal 70 %, vekt 900). `.num`: tall (smal 75 %, tabular-nums). Største tall bruker `[font-stretch:62%]`.
- Skala (px): 104 startnummer, 84 løpsdistanse, 72 kcal igjen / trendvekt, 34 sidetittel, 22 seksjon, 17 listetall, 15 brødtekst, 13 sekundær, 11 ukedag.

## Form
- Radius: 6 px (startnummer, bokser), pille for knapper og merker, firkantede kartmarkører, 18 px øverst på ark.
- Ingen glød, ingen gradienter, ingen store avrundede kort.

## Komponenter
- `components/tasuki/`: `Sash` (skrå stripe; hel = gjort, stripet = planlagt, omriss = misset), `Bib` + `RestBib`, `SectionHead`, `ListRow`, `StatRow`.
- `components/today/WeekStrip` (uke med mat-logging og økt-striper), `KcalBlock` (kcal igjen, «+activity», makrobarer, utregning ved trykk), `TodayBib`.
- `components/training/TrainingMap` (linjekart med km-bar per uke, sjakkflagg på løpsdag); `components/coach/` (`CoachButton`, `CoachSheet` i ca. 92 % høyde, `OptionCard`, `NotesPanel`).
- Logo: startnummer med «G» — `apps/web/scripts/icons/bib.svg`, PNG-er via `node apps/web/scripts/make-icons.mjs`.

## Tekst
- Engelsk UI, kort og konkret. Ingen tankestreker, ingen «·»-kjeder, ingen etiketter i store bokstaver.
- Hjelpetekst bare der den hindrer feil.
