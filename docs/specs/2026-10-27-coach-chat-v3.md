# Coach-chat v3: utseende, kortere svar, ekte strømming

**Status:** utkast til godkjenning, 2026-10-27. Bygger på [coach v2](2026-10-26-coach-v2.md).

## 1. Hvorfor
Brukeren har brukt Coach-fanen og sier:
- **Utseendet:** chatten «ser ut som basic HTML». Det brukeren liker er ukeforhåndsvisningen av planendringer, og ønsker seg å kunne trykke på en dag og se bib-en.
- **Lengden:** coachen «skriver litt mye». Den nevner alt den kan hver gang. Eksempel: «skal løpe en 5K i dag» ga også matråd. Svarene er lange når det ikke trengs, men den skal heller ikke si for lite.
- **Advarslene:** brukeren er lei av advarselslister som «this day is not a running day». Coachen skal si fra når motoren advarer om noe viktig.
- **Strømmingen** virker ikke. Svaret kommer i én klump til slutt.
- **Minnet:** en sykdomslapp står fortsatt selv om brukeren er frisk. Brukeren vil at minnet skal «føles smooth».

Inspirasjon: claude.ai. Rolig tekst, og planendringer vises som et artefakt-aktig kort.

## 2. Mål
1. **Utseende etter skisse A** (brainstorm 2026-10-27, «Draft A in detail»):
   - Coachen skriver ren tekst, uten boble.
   - Dine meldinger står som en dempet boble til høyre.
   - Samtalen er sammenhengende, med dagsskiller.
2. **Arbeidslinje:** mens coachen jobber, vises en levende linje med hva den gjør. Den blir et stille «✓ …»-sammendrag når svaret starter.
3. **Ekte strømming** av svarteksten mens den skrives.
4. **Planendringer som kort:**
   - Tittelen sier hva som skjer.
   - Uka vises med endrede dager markert.
   - Trykk på en dag åpner bib-en dens i kortet.
   - Én knapp: «Use this».
   - Flere alternativer ligger sammenbrettet under det første.
   - Etter bruk krymper kortet til én linje med hake.
5. **Ingen advarselsbokser.** Motoren varsler fortsatt coachen (`check_plan_changes`), og coachen sier det viktige med én setning.
6. **Kortere, mer treffsikre svar:**
   - Svar på det som spørres om, med lengde etter spørsmålet.
   - Ikke list opp hva coachen kan.
   - Ta inn andre temaer bare når de endrer svaret.
7. **Minnet føles smooth:**
   - Når coachen husker eller glemmer noe, står det en stille linje under svaret. Trykk på den for å se og endre.
   - Midlertidige lapper (syk, skade) sjekkes mot dataene, og coachen spør eller rydder når de ikke lenger stemmer.
8. **Smooth følelse:**
   - Rolige overganger når kort åpnes og lukkes og bib-en kommer fram.
   - Strømmende tekst uten hopp.
   - Rulling som følger svaret bare når du allerede er nederst.

## 3. Ikke-mål
- Coachen tar ikke kontakt selv (fortsatt på vent).
- Ingen nye datakilder eller verktøy.
- Coachen logger ikke mat.

## 4. Anti-mål
- Lange svar på korte spørsmål, eller oppramsing av «jeg kan også…».
- **For lite:** å sløyfe noe som endrer rådet. Dårlig søvn før en hard økt skal fortsatt nevnes.
- Advarselsstøy, for eksempel «X is not a running day» uten betydning.
- Rå JSON eller verktøyinnhold synlig for brukeren. Bare meldingsteksten strømmes. Brukeren: «vi vil ikke streame replies som er verktøykall».
- Kort som hopper eller flimrer mens svaret strømmer.

## 5. Svarene (prompt)
Prinsipper, ikke regler. Prompt-versjonen økes.
- **Svar på det som spørres om.** Lengden følger spørsmålet: et kort spørsmål får 1–3 setninger, en ekte gjennomgang (en økt som gikk dårlig, en ny plan) kan få mer.
- **Ingen oppramsing** av hva coachen kan, og ingen «jeg kan også…».
- **Andre temaer bare når de endrer svaret.** Mat nevnes ved en 5K-økt bare hvis noe i dataene gjør det viktig, for eksempel nesten ingen karbo i går.
- **Motorens advarsler:** si de alvorlige med én setning og tall. Overse småting som en uvanlig dag.
- **Push tilbake ved dårlige idéer** (brukeren: «vil at coach skal pushe tilbake ved dårlig idé»). Når en forespørsel er uklok, for eksempel to harde dager på rad, et volumhopp, intensitet rett etter sykdom eller en hard økt med lav Form, gjelder dette:
  - Første setning sier tydelig at coachen ikke anbefaler det, med konkret grunn og tall.
  - Det bedre alternativet legges først.
  - Det brukeren ba om, ligger som andre alternativ, så brukeren bestemmer selv.
  - Coachen er kort og direkte, ikke belærende. Den gir seg ikke bare fordi brukeren spør på nytt, men aksepterer en bevisst beslutning.
- **Midlertidige lapper:** stemmer ikke lappen med det dataene viser (for eksempel «syk», men normale turer og puls), spør kort eller oppdater den.

**Vurdering:** `evals/coach` får tilfellet «Doing a 5K today». Svaret skal være kort og uten matråd når dataene ikke tilsier det. De eksisterende tilfellene leses for lengde.

## 6. Strømming
- **Årsaken til feilen:** API-et holder tilbake verktøyinput som standard. Derfor kommer `reply.message` i én klump.
- **Løsning:** `eager_input_streaming: true` på `reply`-verktøyet. Inputen valideres mot skjemaet før den brukes, som nå med zod, og en kuttet tur (`max_tokens`) håndteres som i dag.
- **Bare `message`-feltet strømmes til klienten.** Andre verktøy vises bare som statuslinje, og alternativene kommer først i `done`, etter sjekk i motoren.

## 7. Planendringskort
- **Innhold:**
  - Tittelen er alternativets tittel fra coachen.
  - Under står uka det gjelder og ukas km.
  - Ukeraden har sju dager. Endrede dager er markert, og cellene viser km (minutter for sykkel) og type-farge.
- **Trykk på en dag:**
  - Bib-en for økta den dagen åpnes inni kortet: type, stort tall (samme `bibNumber`-logikk som Today og økt-siden), km/varighet og «Was Thursday» når økta er flyttet.
  - Trykk igjen lukker.
  - Dager uten økt viser «Rest».
- **Data:** forhåndsvisningscellene må ha det bib-en trenger (tittel, varighet, sport og dato økta kom fra). Det lagres i alternativet når det lages. Gamle alternativer uten feltene viser ukeraden uten bib.
- **Flere alternativer:** det første er åpent, de andre er sammenbrettet til én linje («Intervals → Saturday · show»). Når coachen pusher tilbake, er det første alternativet coachens anbefaling, og brukerens eget ønske ligger sammenbrettet under.
- **Etter «Use this»:** kortet krymper til én linje med hake og «On your watch» / «Applied». De andre alternativene forsvinner fra visningen. Trykk på linjen åpner uka igjen, kun til visning.
- **Hvis planen har endret seg siden forslaget:**
  - Gjelder ikke endringen lenger, står det kort i kortet («No longer fits the plan: …»), og knappen forsvinner.
  - Gjelder den fortsatt, brukes den direkte. Det spørres ikke på nytt om advarsler, siden de ikke vises lenger.

## 8. Minne
- **Etter et svar:** har coachen lagt til eller fjernet lapper i turen, vises én stille linje under svaret, for eksempel «Remembered: lives in Nakano, Tokyo» eller «Forgot: sick». Trykk åpner notatpanelet.
- **Notatpanelet** viser dato og hvem som skrev lappen (coach eller deg), og lar deg redigere og slette som i dag.
- **I konteksten** markeres midlertidige lapper («temporary, until …»), sammen med prinsippet i §5.

## 9. Utseende (Tasuki, mørk og lys)
- **Overskrift og ikoner:** «Coach» som i dag, med ikoner for minne og meny.
- **Dagsskiller** står mellom dager, i liten grå tekst.
- **Meldingene:**
  - Brukerens melding er en avrundet, dempet boble til høyre, uten rød bakgrunn.
  - Coachens tekst har normal størrelse og god linjeavstand, og fet skrift for nøkkeltall som i dag.
- **Arbeidslinje:** liten tekst med en pulserende prikk mens coachen jobber, og «✓ Checked …» etterpå.
- **Feltet nederst:** avrundet, med forslagsknapper over når det er tomt, som i dag.
- **Historikk:** ingen sammenbretting. Hele samtalen kan blas i.

## 10. Tester
Integrasjonstester:
- `reply`-verktøyet har `eager_input_streaming`.
- Forhåndsvisningscellene har tittel, varighet og sport.
- Et alternativ med gyldige endringer brukes selv om advarslene har endret seg.
- Lapper lagt til eller fjernet i en tur følger med i `done`.

Røyktest (lys og mørk, stubbet strøm som nå):
- Statuslinje blir ✓-linje.
- Trykk på en dag i kortet viser bib-en.
- «Use this» gir én linje.
- «Remembered»-linjen åpner notatpanelet.
- Ingen advarselslister.

## 11. Valg Claude tok (sjekk gjerne)
- **Ingen stopp-knapp** i denne runden. Skissen viste en, men ekte stopp krever avbrudd på serveren. Send er deaktivert mens coachen svarer.
- **Advarsler endrer ikke lenger om et alternativ kan brukes.** Gyldighet avgjør, og coachen har allerede sagt det viktige.
- **Gamle lagrede alternativer** vises med det nye kortet, men uten bib når cellene mangler tittel.
- **«Ask the coach»-snarveiene** (økt, dag) og forslagsknappene er uendret.
