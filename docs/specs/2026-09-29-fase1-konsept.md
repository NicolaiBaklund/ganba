# Loop — Fase 1 konsept-spec: Mat + vekt

Status: **konsept godkjent i diskusjon, venter på gjennomlesing**. Teknisk design (stack, hosting, datamodell) kommer i egen spec.
Bakgrunn og full beslutningslogg: [../00-idea.md](../00-idea.md), [../02-decisions.md](../02-decisions.md).

## 1. Mål og avgrensning

Loop er en mobilvennlig webapp som samler treningsplan, aktivitet, ernæring og vektendring. Den bygges i faser:

| Fase | Innhold |
|------|---------|
| **1 (denne spec)** | Kontoer, oppstart med mål, kalorimål (startestimat + adaptivt), AI-matlogg + hurtigtillegg, vektlogg m/ bilder + trend, hjemskjerm |
| 2 | Garmin-synk (lese aktiviteter), treningsplan (løping, ukentlig justering), økt-kort på hjemskjerm, dagsmål som varierer med trening |
| 3 | AI-coach (ukentlig innsikt trening ↔ mat ↔ vekt), sende økter til klokka |
| Senere | Matdatabase/strekkode/oppskrifter, søvn/HRV, daglig plantilpasning, bodyfat/kroppsmål |

**Fase 1 er ferdig når** en bruker kan opprette konto, sette mål, få et begrunnet kalorimål, logge mat med bilde/tekst/hurtigtillegg, logge vekt med bilde, se trend, og etter 2–3 uker motta ukentlige justerte mål.

**Utenfor fase 1:** trening/Garmin, AI-coach, matdatabase, strekkode, imperiale enheter, sosiale funksjoner.

## 2. Brukere

- Generelt system for flere brukere. Hver bruker har egen konto og ser kun egne data.
- Første bruker er eieren; appen skal kunne åpnes for andre uten omskriving.
- Alle kjønn, alle mål (ned / opp / holde vekt).

## 3. Oppstart (onboarding)

Samles én gang, kan endres i Profil:

- Kjønn (for formel), fødselsdato, høyde, nåværende vekt.
- Aktivitet: snitt skritt/dag, løpe-km/uke, timer annen trening/uke (styrke, sykkel osv.).
- Mål: målvekt + tempo i kg/uke.
  - Nedgang: typisk −0.25 til −1.0.
  - Oppgang: +0.25 til +0.5.
  - Hold: 0.
  - **Tak:** maks ~1 % av kroppsvekt/uke ned, maks ~0.5 kg/uke opp.
- Vektmål er påkrevd.

## 4. Kalorimål

### 4.1 Startestimat (lagdelt)

```
Vedlikehold = BMR × 1.2
            + gange-tillegg   (skritt over grunnnivå, ~0.4 kcal/kg/km netto)
            + løping          (~1 kcal/kg/km brutto, snitt per dag, minus hvile-overlapp)
            + annen trening   (MET-tabell × timer × kg, snitt per dag)
BMR         = Mifflin-St Jeor (kjønnsspesifikk)
Mål         = Vedlikehold − (tempo_kg_per_uke × 7700 / 7)
```

- Vises som tall + område + forklaring per lag (f.eks. "2450 (2300–2600): hvile …, hverdag …, løping …").
- Skritt fra løping må ikke telles dobbelt.
- **Kcal-gulv** (kjønnsavhengig, grovt 1500 menn / 1200 kvinner). Hvis mål treffer gulvet: advarsel + foreslå lavere tempo.
- Samme mål hver dag i fase 1.

### 4.2 Adaptivt forbruk

- Aktiveres automatisk etter **14 dager** med minst **10 loggede matdager** og minst **4 veiinger**. Før det gjelder startestimatet.
- **Forbruk = snitt faktisk inntak − (endring i trendvekt × 7700) / dager**, over glidende vindu 2–3 uker.
- Bruker aldri forrige mål i beregningen — kun hva brukeren faktisk spiste og hva trendvekten faktisk gjorde.
- Kun dager med logget mat teller. Uke med < 5/7 loggede dager gir ingen justering.

### 4.2.1 Grunnforbruk vs. treningsforbruk

Problem: ett samlet forbrukstall antar at treningen er lik hver uke. Uke uten trening (skade, ferie) med samme inntak → vektøkning.

Løsning: forbruk deles i to.

```
Grunnforbruk  = snitt inntak − (trendendring × 7700) / dager − snitt treningskcal i vinduet
Mål (periode) = Grunnforbruk + treningskcal (periode) − (tempo × 7700 / 7)
```

- **Fase 1** (ingen Garmin): treningskcal = konstant fra oppstart (løpe-km + annen trening). Brukeren kan oppdatere treningsnivå i Profil (f.eks. "skadet, ingen trening nå") → mål faller tilsvarende.
- **Fase 2** (Garmin): treningskcal fra faktiske økter → dagsmål varierer med trening. Løpekcal (~1 kcal/kg/km) brukes framfor klokkas pulsbaserte tall der mulig.
- Systematisk feil i treningskcal (f.eks. klokke overestimerer) absorberes av grunnforbruket over tid, så lenge feilen er stabil.

### 4.3 Ukentlig innsjekk

- Fast ukedag. Kort på hjemskjermen:
  "Trend −0.4 kg/uke (mål −0.5). Beregnet forbruk 2980. Nytt mål 2430 (−70)."
- Knapper: **Godta** / **Behold forrige**. Ingen automatisk aksept; ubesvart = forrige mål gjelder.
- Endring begrenset til ±150 kcal per uke.
- For lite data → kortet sier "for lite data denne uka" og foreslår ingen endring.

### 4.4 Makroer

- Protein: 2.0 g/kg ved nedgang, 1.8 g/kg ved hold/oppgang.
- Fett: ~25 % av kcal.
- Karbo: resten.
- Alt kan overstyres manuelt.

## 5. Matlogging

### 5.1 AI-logg (bilde og/eller tekst)

1. Bruker tar/velger bilde, skriver tekst, eller begge ("middag, litt ekstra saus").
2. AI returnerer strukturert liste: per matvare navn, estimert gram, kcal, protein, karbo, fett, sikkerhet, antakelser; pluss total.
3. Bruker redigerer linjer (gram, slett, legg til) eller skriver korrigering ("2 egg, ikke 3") → AI oppdaterer.
4. Lagre. Måltidstype (frokost/lunsj/middag/kvelds/snacks) foreslås fra klokkeslett, kan endres.
5. Bildet lagres med innslaget.

- Modell: Claude Opus 5.5 via API (server-side, nøkkel aldri i klient).
- Prompten itereres gjennom ekte testing; bør ha et sett testmåltider for sammenligning.
- Feil fra AI (timeout, ugyldig svar): vis feilmelding, behold bilde/tekst så brukeren kan prøve igjen eller bytte til hurtigtillegg.

### 5.2 Hurtigtillegg

- Én linje: kcal (påkrevd), protein/karbo/fett (valgfritt), navn (valgfritt), måltidstype.

### 5.3 Redigering

- Alle innslag kan redigeres og slettes i etterkant, også på tidligere dager.

## 6. Vekt og kropp

- Ett-trykk-logging: vekt + tidspunkt. Anbefaling i UI: morgen, etter toalett, før mat.
- **Trendvekt** (eksponentielt glattet) er hovedtallet, med ukeendring ("94.6 ↓ 0.4 kg/uke").
- Graf: daglige målinger (prikker), trendlinje, stiplet prognose mot mål med estimert dato.
- Tåler dager uten veiing.
- Valgfritt bilde per vektlogg. Private. Egen visning for side-om-side-sammenligning av to datoer.

## 7. Hjemskjerm og navigasjon

**"I dag"** (kortbasert, trykk for detaljer):
1. Kcal-kort: kcal igjen (ring + tall), makrobarer.
2. Dagens måltider.
3. Trendvekt-kort med ukeendring.
4. Mini trendgraf.
5. Ukentlig innsjekk-kort når aktuelt.

(Fase 2: økt-kort øverst — planlagt økt hvis ikke gjort, faktisk prestasjon hvis gjort.)

- Stor **"+"** nederst i midten → Bilde / Tekst / Hurtig / Vekt.
- Bunnmeny: **I dag · Mat · Kropp · Profil**.
- Dato-navigasjon for å se/redigere tidligere dager.

## 8. Personvern

- Kun egne data synlige. Bilder private som standard.
- Bruker kan slette konto og alle data (inkl. bilder).
- Mat- og kroppsbilder sendes til Anthropic API kun for estimering (matbilder); kroppsbilder sendes ikke til AI i fase 1.
- Før åpning for andre: GDPR-vurdering (helsedata = særlig kategori), personvernerklæring.

## 9. Enheter og språk

- Metrisk (kg, cm, kcal) i fase 1. Lagres slik at imperialt kan legges til.
- UI-språk: **ikke bestemt** (norsk vs. engelsk) — avklares i teknisk fase.

## 10. Kjente risikoer

- Garmin offisiell API krever bedrift og kan være pauset → påvirker fase 2 for andre brukere.
- Strava API-vilkår begrenser AI-bruk/deling → må sjekkes før fase 2 åpnes for andre.
- AI-estimat av mat er iboende usikkert → vis sikkerhet og gjør retting enkelt; adaptivt forbruk kompenserer for systematisk feil i logging over tid.
- AI-kost per logg → må estimeres i teknisk fase.
