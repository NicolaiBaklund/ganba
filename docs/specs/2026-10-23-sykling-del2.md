# Sykling del 2: watt og kombinasjon med løping

**Status:** godkjent (brukeren: «Bare gjør alt»), 2026-10-23. Bygger på [sykling del 1](2026-10-23-sykling.md).

## 1. Mål
- **Watt** når rytteren har effektmåler eller smarttrainer: øktene får wattmål, og en trainer i ERG-modus følger dem selv. Uten watt er alt som før (puls, ingen watt nevnt).
- **Kombinasjon:** en løpeplan kan ha sykkelturer, og en sykkelplan kan ha løpeturer. Hovedsporten har målet. Den andre sporten gir rolig, aerob trening på egne dager.

**Ikke med:** rute-/GPX-import, kvalitetsøkter i sidesporten, triatlon.

## 2. Watt

### FTP (funksjonell terskeleffekt)
Hentes i denne rekkefølgen, uten at brukeren gjør noe:
1. **Garmin-FTP** for sykling, hvis den ikke er merket gammel (`isStale`) og er satt de siste 180 dagene.
2. **Fra sykkelturer** de siste 8 ukene: høyeste av 0,95 × beste 20 min og beste 60 min (Garmins `maxAvgPower_1200` / `maxAvgPower_3600`).
3. **Fra sykkeltesten** (30 min): FTP = snittwatt på testrunden (Friel). Testen foreslår FTP sammen med terskelpuls.

Uten FTP finnes ikke watt-valget.

### Valg
- **Veiviseren:** «Power targets» vises når FTP er kjent. Bryteren er på når turer de siste 8 ukene hadde watt, ellers av. Hint: «For a power meter or smart trainer (ERG). Heart rate otherwise.»
- **Treningssiden:** samme bryter ved siden av «Riding indoors». Den bytter målene på kommende turer (watt ↔ puls). Lengder, struktur og endringer fra coachen beholdes.

### Soner (Coggan, % av FTP)
| Sone | Z1 | Z2 | Z3 | SS | Z4 | Z5 |
|---|---|---|---|---|---|---|
| % FTP | 40–55 | 56–75 | 76–90 | 88–94 | 91–105 | 106–120 |

Samme sonenavn som puls, så øktene, rotasjonen og coachen er like. Bare målet byttes.

### Garmin
Wattsteg sendes som `power.zone` (type 2) med watt i `targetValueOne/Two`. Klokke og Edge styrer en trainer i ERG-modus etter dem.

## 3. Kombinasjon

### Valg
**Bare når brukeren ber om det.** Ingen får sideøkter av seg selv.

- **Veiviseren:** en lukket lenke, «+ Add rides on other days» (løpeplan) eller «+ Add runs on other days» (sykkelplan), åpner ukedagene som hovedsporten ikke bruker. Ingen dager er valgt fra start.
- **Uten valgte dager** er planen nøyaktig som før.
- **Senere:** dagene kan legges til, endres eller fjernes på treningssiden. Da bygges kommende sideøkter på nytt.

### Sideøkter
Alltid rolige:
- **Sykkeltur i løpeplan:** Z2, 60 min som vokser mot 90 min (120 for erfarne syklister) i takt med planen. Lett uke × 0,75 (minst 45). Nedtrapping 45 min.
- **Løpetur i sykkelplan:** rolig tur, 5 km som vokser mot 8 km. Lett uke og nedtrapping 5 km.
- **Ingen sideøkt dagen før eller på løps-/rittdagen.**

Sideøktene teller ikke i hovedsportens volum, økning eller forslag om volum. De gir likevel energi, Form og belastning som alle andre aktiviteter.

### Per økt
Hver økt har sin egen sport. Det styrer:
- matching mot aktivitet,
- Garmin-sporttype,
- visning (km eller tid),
- matråd,
- coach (sone og grenser),
- byggingen av økta.

## 4. Volumtak
Se beslutning 2026-10-23: taket kommer fra målet.

## 5. Data
- `planned_workouts.sport` (`run|ride`, fylles fra planen for eksisterende økter).
- `training_plans.cross_weekdays smallint[]`, `ftp smallint`, `power boolean`.
- `garmin_accounts.ftp_cycling`, `ftp_cycling_at`.
- `save_plan_changes` tar `sport` på nye økter.
- `training_plans.week1_grows` fjernes: uke 1 matcher startvolumet i alle planer.

## 6. Tester
Integrasjonstester:
- FTP-kilder.
- Wattplan med Garmin-JSON.
- Bytte watt ↔ puls beholder struktur.
- Testen gir FTP.
- Løpeplan med sykkeldager (riktig sport per økt, matching, push, ingen sideøkt før løpet).
- Sykkelplan med løpedager.
- Endring av sidedager.
- Coach på sideøkt.
