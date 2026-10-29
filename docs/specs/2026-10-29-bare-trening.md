# Bare trening, og plan uten Garmin

**Status:** godkjent i chat 2026-10-29.

## 1. Hvorfor
En venn av brukeren vil prøve Ganba. Han har ikke Garmin og bryr seg ikke om kalorier, han vil bare ha en løpeplan. I dag går ikke det:
- Oppstarten krever kropp, mål og kalorier.
- Treningsplanen krever Garmin, fordi startvolumet hentes fra løpene, øktene sendes til klokka og gjennomførte økter leses derfra.

Brukeren: «kult om ikke appen føles som om den mangler masse om man ikke bruker mat og Garmin».

## 2. Mål
1. **«Training only»-modus.** Man velger den ved oppstart. Ingen kropps- eller kaloriespørsmål. Food, Body og «+» er borte. Appen føles hel uten dem.
2. **Plan uten Garmin**, for alle uten Garmin:
   - Veiviseren spør om startvolum.
   - «Done» på en økt registrerer en løpetur for hånd.
   - Planen reagerer på det som før.
3. **Ingenting endres for brukere med Garmin og mat.** Brukeren: «jeg vil ikke at noe skal endre seg for meg».

## 3. Ikke-mål
- Strava. Et nytt Strava-API-oppsett tillater bare eieren til Strava godkjenner appen, så det kommer senere.
- Puls, Form og Recovery uten Garmin.
- Import av turer fra andre klokker.

## 4. Anti-mål
- **Tomme kort og mas.** Ingen «Connect Garmin to…», ingen 0 kcal, ingen tomme vektgrafer i Training only.
- **Endringer for eksisterende brukere.** Alle får modus `full`, og de nye flytene vises bare uten Garmin.
- **Coach som snakker om mat eller vekt** med en Training only-bruker.

## 5. Modus
- `profiles.mode`: `full` (standard, alle eksisterende) eller `training`.
- **Kroppsfelt:** `sex`, `birth_date` og `height_cm` kan være tomme for `training`. All mat- og kroppskode kjøres bare i `full`.
- **Oppstart:**
  - Første steg er et valg: «Food & training» eller «Training only».
  - **Training only** lagrer profil (tidssone), modus og `onboarded_at`, og sender brukeren til «Create a plan».
  - **Food & training** er dagens flyt, uendret.
- **Bytte senere:** Profile har «Track food too». Den åpner oppstarten med kroppsstegene, og når den er fullført settes modus til `full`. Motsatt vei finnes ikke; en `full`-bruker kan bare la være å logge mat.

## 6. Training only i appen
- **Menyen:** Today · Training · Coach. Body og «+» er skjult. Direkte lenker til `/food`, `/body` og `/food/log` sender til Today.
- **Today:**
  - Ukestripa (økter, ingen matprikker) og dagens økt som bib.
  - På hviledag vises neste økt, som i dag.
  - Under kommer **ukeskortet** med km gjort mot planlagt denne uka, antall økter gjort og neste økt, slik at siden ikke føles tom.
  - Ingen kcal-blokk, måltider, vekt eller innsjekk.
  - Uten plan: et kort «Create your plan».
- **Profile:** ingen kort for mål, aktivitet, makro eller innsjekkdag. Garmin-kortet beholdes som et valg. Nytt kort: «Track food too».
- **Coach:**
  - Ingen verktøy for mat eller vekt.
  - Konteksten sier «The person uses Ganba for training only: no food or weight talk».
  - Forslagsknappene handler om trening.
- **Form og Recovery** vises ikke, men gjør det fortsatt hvis Garmin kobles til.

## 7. Plan uten Garmin (alle uten Garmin)
- **Training-fanen:** «Create plan» i stedet for «Connect Garmin».
- **Veiviseren:**
  - Finnes ingen løpeturer siste fire uker (Garmin eller manuelle), spør den: «Kilometres per week lately» (0–150) og «Longest run lately» (km).
  - Svarene brukes som startvolum og lengste tur, i stedet for det som ellers regnes fra løpene.
  - Uten svar brukes reglene for ingen trening som i dag.
- **«Done» på økta** (Today-bib og øktsiden, bare for planlagte økter i dag eller tidligere, og bare uten Garmin):
  - Et lite ark med km, ferdig utfylt med planlagte km, og tid (valgfri, mm:ss eller h:mm:ss).
  - Lagres som en **manuell aktivitet** i `activities`:
    - `source = 'manual'`
    - `garmin_activity_id` tom
    - `type_key` er `running`, eller `cycling` for en sykkeløkt.
  - Matchingen som kjører allerede, markerer økta som gjort. Startvolum, forslag ved uteblitte økter, coachen og ukestripa bruker turen uten ny kode.
- **«Undo»** på en gjort manuell økt sletter den manuelle aktiviteten, og økta blir planlagt igjen.
- **Ingen sending til klokke** uten Garmin. Dette skjer allerede: `pushToGarmin` gjør ingenting uten Garmin-tokens.

## 8. Data
- **Migrasjon:**
  - `profiles.mode text not null default 'full' check (mode in ('full','training'))`.
  - `sex`, `birth_date` og `height_cm` kan være `null`.
  - `activities.source text not null default 'garmin' check (source in ('garmin','manual'))`.
  - `garmin_activity_id` kan være `null`. Unik-kravet `(user_id, garmin_activity_id)` står; `null` kolliderer ikke.
- **Garmin-synk** rører ikke manuelle aktiviteter.

## 9. Tester
Integrasjon:
- Oppstart i Training only uten kroppsfelt.
- `todaysWorkout` og ukestripa uten Garmin.
- En manuell tur gjør økta til gjort, og «Undo» gjør den planlagt igjen.
- Plan uten Garmin med oppgitt startvolum.
- Coach-konteksten i Training only har ikke matverktøy.

Røyk (`training-only-smoke.mjs`, lys og mørk):
- Registrering → Training only → plan → Today med bib og ukeskort → «Done» → gjort.
- Menyen har tre faner.
- Ingen kcal-tekst noe sted.

De eksisterende røyktestene skal være grønne uendret.

## 10. Valg Claude tok
- **Sykkelplan** er også tilgjengelig i Training only.
- **«Done»** gjelder bare uten Garmin. Med Garmin kommer turene fra klokka.
- **Ingen vei tilbake** fra `full` til `training`. Det er ikke spurt om, og en `full`-bruker kan la være å logge mat.
- **Ukeskortet** er Claudes forslag for at Today skal føles hel.
