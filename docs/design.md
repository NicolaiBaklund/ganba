# Loop — designretning

Inspirert av Runna (sporty, mørk, tydelige tall og fargekoder), men med egen identitet. Vi kopierer ikke Runnas merkevare (indigo + lime).

## Prinsipper
- **Mørk først.** Nesten svart bakgrunn med blåtone, kort litt lysere. Lys modus senere.
- **Én aksentfarge: elektrisk blå.** Brukes på primærhandlinger ("+", lagre), kcal-ring og aktive faner. Ikke som dekor.
- **Faste farger for data.** Protein, karbo og fett har alltid samme farge. Senere: økttyper får egne faste farger.
- **Store, fete tall.** Det viktigste tallet på hver skjerm (kcal igjen, trendvekt) i Sora, tabular-nums.
- **Kort med luft.** Avrundede (radius 1rem), trykk for detaljer.
- **Lite tekst.** Ikon + tall der mulig. Hjelpetekst kun der den hindrer feil.
- **Minst mulig innsats** (produktprinsipp): store trykkflater, numerisk tastatur, forhåndsvalg.

## Tokens (i `apps/web/app/globals.css`)

| Token | Verdi | Bruk |
|---|---|---|
| background | `#0a0c12` | app-bakgrunn |
| card | `#141824` | kort |
| popover | `#181d2a` | ark, menyer |
| muted / secondary | `#1e2433` | inputs, sekundærknapper, spor i barer |
| border | hvit 8 % | skiller |
| foreground | `#f3f5fa` | tekst |
| muted-foreground | `#8c95a8` | sekundærtekst |
| **primary** | `#2f8cff` | aksent (elektrisk blå) |
| protein | `#ff6b8a` | protein |
| carbs | `#ffb547` | karbo |
| fat | `#a78bfa` | fett |
| success | `#34d399` | på mål / fremgang |
| warning | `#ffb547` | advarsler (gulv, tempo) |
| destructive | `#ff5c5c` | slett, feil |
| w-easy / w-long / w-intervals / w-threshold / w-tempo / w-strides / w-race | `#5eead4` / `#2f8cff` / `#ff6b8a` / `#ffb547` / `#a78bfa` / `#34d399` / `#facc15` | økttyper (fase 2), `style={{ color: var(--w-…) }}` |

Tailwind-klasser: `bg-primary`, `text-protein`, `bg-carbs`, `text-fat`, `text-success` osv.

## Typografi
- **Sora** (`font-heading`, klasse `.num` for tall): overskrifter og nøkkeltall.
- **Geist** (`font-sans`): brødtekst.

## Inspirasjonskilder
- [Mobbin — Health & Fitness](https://mobbin.com/explore/mobile/app-categories/health-fitness) (søk Runna, Strava, MacroFactor, MyFitnessPal)
- [Refero](https://refero.design) — flyter
- [Spectr — Runna](https://www.spectr.to/gallery/runna) — Runnas designsystem
- [Dribbble — running app](https://dribbble.com/search/running-app) — stemning
