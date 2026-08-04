# 15 — Role-Permission Matrix V1

**Projekt:** Auditabilni Axenita TARDOC Billing Safety Copilot
**Status:** ACCEPTED
**Datum:** 2026-08-05
**Verzija:** v1.0

---

# 1. Svrha i autoritet

Ovaj dokument je **normativna konsolidovana matrica** dodjele aplikacijskih permisija tenant i
platform rolama u v1.

Izvorne odluke ostaju zabilježene u `06_DECISION_LOG.md`. Ovaj dokument ih **objedinjuje**, ne
zamjenjuje i ne proširuje.

Pravilo prioriteta pri budućem neslaganju:

1. **posljednji ACCEPTED ADR u `06` je mjerodavan**;
2. `15` se nakon toga **mora uskladiti** kontrolisanim batchom;
3. implementacija **ne smije tiho birati** između dokumenata koji se ne slažu — takav slučaj je
   defekt i zaustavlja fazu.

Ovaj dokument **ne uvodi** nijednu novu: aplikacijsku rolu; database rolu; permisiju; endpoint;
schema kolonu; migration paket; uslovni flag; hijerarhiju rola; per-user override.

---

# 2. Inventar rola

## 2.1 Tenant aplikacijske role

```text
PRACTICE_ADMIN
PHYSICIAN
MPA
BILLING_SPECIALIST
AUDITOR
READ_ONLY
```

Izvor: `02` §4.1 enum `membership_role`. Dodjela se čuva u `practice_membership_roles` (`02` §6.3a).

## 2.2 Platform aplikacijska rola

```text
SYSTEM_ADMIN
```

Izvor: `02` §4.16 enum `platform_role`. Dodjela se čuva u `platform_role_assignments` (`02` §6.5).

## 2.3 Database role — nisu kolone ove matrice

```text
copilot_app
copilot_migrator
copilot_system
```

Izvor: `02` §3.1–§3.3.

Eksplicitno:

- **`SYSTEM_ADMIN` nije `copilot_system`.** Prva je aplikacijska platform rola, druga database rola.
- **Database grant nikada ne zadovoljava permisiju endpointa.**
- **Platform role nisu tenant role.**
- **`SYSTEM_ADMIN` ne dobija nijedan automatski tenant pristup** (D-038, klauzula 13).

---

# 3. Semantika matrice

Normativni izvor: **D-038**.

## 3.1 Vrijednosti ćelija

**`ALLOW`**

- rola **doprinosi** tu permisiju efektivnom skupu.

**`DENY`**

- rola **ne doprinosi** nijedan grant;
- **`DENY` nije negativni override**;
- `ALLOW` iz **druge** dodijeljene tenant role i dalje doprinosi kroz D-038 uniju.

**`CONDITIONAL`**

Permisija doprinosi **isključivo** kada su zadovoljena **sva četiri** uslova:

1. korisnik nosi navedenu tenant rolu;
2. odgovarajući prihvaćeni practice flag je uključen;
3. membership je **aktivan**;
4. svi uslovi specifični za endpoint su zadovoljeni.

**`BLOCKED — D-OPEN-011`**

- nijedna dodjela **nije prihvaćena**;
- implementacija mora **pasti zatvoreno**;
- **ne smije** se pretvoriti u `ALLOW` ni u obični `DENY` dok D-OPEN-011 ne bude riješen.

## 3.2 Pravila kompozicije

- permisije se komponuju **isključivo** između rola istog **aktivnog** membershipa i **iste**
  ordinacije;
- **neaktivan membership daje nula permisija**;
- **aktivan membership sa nula rola daje nula permisija**;
- **nema nasljeđivanja rola**;
- **nema per-user permission overrida**;
- **`platformRoles` nikada ne ulaze u tenant uniju**;
- permisije se **izvode**, ne čuvaju se na `practice_memberships`.

---

# 4. Katalog permisija

## 4.1 Aktivne permisije — tačno 32

Reprodukcija `03` §28.1, bez izmjene:

```text
practice.read
practice.settings.read
practice.settings.manage

patient_reference.read
patient_reference.create

encounter.read
encounter.create
encounter.update
encounter.cancel
encounter.close

encounter.document.list
encounter.document.read
encounter.document.read_original
encounter.document.create
encounter.document.archive

analysis.read
analysis.run
analysis.cancel
analysis.correct_fact
analysis.correct_service
analysis.review_decision
analysis.approve
analysis.approval.revoke
analysis.export
analysis.export.read

tariff_evaluation.read
tariff.raw_result.read

finding.resolve

audit.read
audit.export

integration.read

tariff.manage
```

## 4.2 Rezervisane permisije — tačno 3

```text
analysis.run_tariff
configuration.manage
integration.manage
```

Reprodukcija `03` §28.2. Rezervisane permisije:

- **nisu** aktivni redovi ove matrice;
- **nisu dodijeljene nijednoj roli**;
- **ne smiju** biti implementirane kao produkcijski grant bez nove prihvaćene odluke (D-045).

---

# 5. Kompletna matrica — 32 reda

| Permission | PRACTICE_ADMIN | PHYSICIAN | MPA | BILLING_SPECIALIST | AUDITOR | READ_ONLY | SYSTEM_ADMIN | Source |
|---|---|---|---|---|---|---|---|---|
| `practice.read` | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 | D-045 |
| `practice.settings.read` | ALLOW | DENY | DENY | DENY | DENY | DENY | DENY | D-044 |
| `practice.settings.manage` | ALLOW | DENY | DENY | DENY | DENY | DENY | DENY | D-044 |
| `patient_reference.read` | DENY | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY | D-039 |
| `patient_reference.create` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY | D-039 |
| `encounter.read` | DENY | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY | D-039 |
| `encounter.create` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY | D-039 |
| `encounter.update` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY | D-039 |
| `encounter.cancel` | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY | D-042 |
| `encounter.close` | ALLOW | ALLOW | DENY | ALLOW | DENY | DENY | DENY | D-044 |
| `encounter.document.list` | DENY | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY | D-039 |
| `encounter.document.read` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY | D-039 |
| `encounter.document.read_original` | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY | D-043 |
| `encounter.document.create` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY | D-039 |
| `encounter.document.archive` | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY | D-042 |
| `analysis.read` | DENY | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY | D-039 |
| `analysis.run` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY | D-039 |
| `analysis.cancel` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY | D-042 |
| `analysis.correct_fact` | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY | D-040 |
| `analysis.correct_service` | DENY | ALLOW | DENY | ALLOW | DENY | DENY | DENY | D-040 |
| `analysis.review_decision` | DENY | ALLOW | DENY | ALLOW | DENY | DENY | DENY | D-041 |
| `analysis.approve` | DENY | ALLOW | CONDITIONAL | CONDITIONAL | DENY | DENY | DENY | D-041 |
| `analysis.approval.revoke` | DENY | ALLOW | CONDITIONAL | CONDITIONAL | DENY | DENY | DENY | D-041 |
| `analysis.export` | DENY | ALLOW | DENY | ALLOW | DENY | DENY | DENY | D-043 |
| `analysis.export.read` | DENY | ALLOW | DENY | ALLOW | DENY | DENY | DENY | D-043 |
| `tariff_evaluation.read` | DENY | ALLOW | DENY | ALLOW | DENY | DENY | DENY | D-043 |
| `tariff.raw_result.read` | ALLOW | DENY | DENY | DENY | DENY | DENY | DENY | D-043 |
| `finding.resolve` | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY | D-040 |
| `audit.read` | ALLOW | DENY | DENY | DENY | ALLOW | DENY | DENY | D-043 |
| `audit.export` | ALLOW | DENY | DENY | DENY | ALLOW | DENY | DENY | D-043 |
| `integration.read` | ALLOW | DENY | DENY | DENY | DENY | DENY | DENY | D-032 |
| `tariff.manage` | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW | D-023 |

Svaki red ima **tačno jedan** izvorni ADR. Nijedna ćelija nije prazna ni `OPEN`.

---

# 6. Uslovna pravila

Normativni izvor: **D-041**, uz D-038 klauzulu 18.

## 6.1 `analysis.approve` — MPA

- zahtijeva **dodijeljenu `MPA` rolu**;
- zahtijeva **`allow_mpa_approval = true`** (`02` §6.4);
- **neaktivan membership i dalje odbija**, bez obzira na flag;
- **nijedna druga rola ne zadovoljava ovaj uslov implicitno.**

## 6.2 `analysis.approve` — BILLING_SPECIALIST

- zahtijeva **dodijeljenu `BILLING_SPECIALIST` rolu**;
- zahtijeva **`allow_billing_specialist_approval = true`**;
- neaktivan membership i dalje odbija;
- nijedna druga rola ne zadovoljava ovaj uslov implicitno.

## 6.3 `analysis.approval.revoke` — MPA

- **isti trenutni uslov podobnosti** kao MPA odobravanje (§6.1);
- **opozivalac ne mora biti originalni odobravatelj.**

## 6.4 `analysis.approval.revoke` — BILLING_SPECIALIST

- **isti trenutni uslov podobnosti** kao BILLING_SPECIALIST odobravanje (§6.2);
- **opozivalac ne mora biti originalni odobravatelj.**

## 6.5 Pravila koja važe za svaki opoziv

- **`reason` je obavezan**;
- **dokaz odobrenja se nikada ne briše**;
- **immutable approval historija ostaje** (D-016);
- **revocation audit event je obavezan**;
- **podobnost role i flaga se evaluira u trenutku opoziva**, ne u trenutku odobrenja.

---

# 7. Sažeci po roli — izvedeno, neformativno

Sažeci su **mehanički izvedeni** iz tabele u §5 i služe samo za čitljivost. U slučaju neslaganja,
**tabela §5 je mjerodavna**.

## 7.1 PRACTICE_ADMIN

- ALLOW: **7**
- CONDITIONAL: **0**
- BLOCKED: **1**
- DENY: **24**

ALLOW permisije: `practice.settings.read`, `practice.settings.manage`, `encounter.close`,
`tariff.raw_result.read`, `audit.read`, `audit.export`, `integration.read`.

BLOCKED: `practice.read`.

Rola je **isključivo administrativna** (D-044). Nema nijednu kliničku permisiju.

## 7.2 PHYSICIAN

- ALLOW: **24**
- CONDITIONAL: **0**
- BLOCKED: **1**
- DENY: **7**

ALLOW permisije: `patient_reference.read`, `patient_reference.create`, `encounter.read`,
`encounter.create`, `encounter.update`, `encounter.cancel`, `encounter.close`,
`encounter.document.list`, `encounter.document.read`, `encounter.document.read_original`,
`encounter.document.create`, `encounter.document.archive`, `analysis.read`, `analysis.run`,
`analysis.cancel`, `analysis.correct_fact`, `analysis.correct_service`, `analysis.review_decision`,
`analysis.approve`, `analysis.approval.revoke`, `analysis.export`, `analysis.export.read`,
`tariff_evaluation.read`, `finding.resolve`.

DENY permisije: `practice.settings.read`, `practice.settings.manage`, `tariff.raw_result.read`,
`audit.read`, `audit.export`, `integration.read`, `tariff.manage`.

BLOCKED: `practice.read`.

## 7.3 MPA

- ALLOW: **11**
- CONDITIONAL: **2**
- BLOCKED: **1**
- DENY: **18**

ALLOW permisije: `patient_reference.read`, `patient_reference.create`, `encounter.read`,
`encounter.create`, `encounter.update`, `encounter.document.list`, `encounter.document.read`,
`encounter.document.create`, `analysis.read`, `analysis.run`, `analysis.cancel`.

CONDITIONAL permisije: `analysis.approve`, `analysis.approval.revoke`.

BLOCKED: `practice.read`.

`MPA` **nema** `analysis.review_decision`, jer bi ta grupna permisija nosila i terminalni `REJECT`
(D-041).

## 7.4 BILLING_SPECIALIST

- ALLOW: **10**
- CONDITIONAL: **2**
- BLOCKED: **1**
- DENY: **19**

ALLOW permisije: `patient_reference.read`, `encounter.read`, `encounter.close`,
`encounter.document.list`, `analysis.read`, `analysis.correct_service`, `analysis.review_decision`,
`analysis.export`, `analysis.export.read`, `tariff_evaluation.read`.

CONDITIONAL permisije: `analysis.approve`, `analysis.approval.revoke`.

BLOCKED: `practice.read`.

## 7.5 AUDITOR

- ALLOW: **2**
- CONDITIONAL: **0**
- BLOCKED: **1**
- DENY: **29**

ALLOW permisije: `audit.read`, `audit.export`.

BLOCKED: `practice.read`.

`AUDITOR` **ne pregleda** encountere, analize, dokumente ni tarifne rezultate. U v1 se analysis
ID-evi dostavljaju **izvan sistema** (D-043).

## 7.6 READ_ONLY

- ALLOW: **0**
- CONDITIONAL: **0**
- BLOCKED: **1**
- DENY: **31**

BLOCKED: `practice.read`.

Enum vrijednost je **zadržana** u `02` §4.1, ali je rola u v1 **deny-all** (D-039). Ne dobija
nijednu aktivnu permisiju.

## 7.7 SYSTEM_ADMIN

- ALLOW: **1**
- CONDITIONAL: **0**
- BLOCKED: **1**
- DENY: **30**

ALLOW permisije: `tariff.manage`.

BLOCKED: `practice.read`.

**Nijedna tenant permisija nije `ALLOW`.** Platform rola ne daje automatski tenant pristup; tenant
rad zahtijeva zaseban aktivan membership i odgovarajuću tenant rolu (D-038, klauzule 13–14).

---

# 8. Granice

## 8.1 BLOCKED — D-OPEN-011

- `practice.read`;
- generički runtime pristup nad `users`;
- generički runtime pristup nad `practices`;
- generički cross-practice pristup nad `users` i `practices`.

Implementacija mora **pasti zatvoreno**. Nijedna od ovih stavki se ne smije pretvoriti u `ALLOW` ni
u obični `DENY` dok D-OPEN-011 ne bude prihvaćen (`13` §16).

## 8.2 OUT OF V1

- kreiranje membershipa;
- deaktivacija membershipa;
- administracija membershipa;
- dodjela tenant role;
- uklanjanje tenant role;
- generička runtime administracija rola;
- cross-practice support pristup;
- otkazivanje export joba.

Ove operacije **nisu** permisije ni endpointi u v1. `OUT OF V1` **nije** dozvola za implementaciju
bez ADR-a.

## 8.3 REQUIRES NEW PERMISSION AND ADR

- generička platform administracija izvan `tariff.manage`;
- `AUDITOR` discovery/listing endpoint;
- podjela `analysis.review_decision`;
- podjela `analysis.export.read`;
- finija permisija za rješavanje findinga.

Svaka od njih zahtijeva **i** novu permisiju **i** zasebnu prihvaćenu odluku.

## 8.4 RESERVED

- `analysis.run_tariff`;
- `configuration.manage`;
- `integration.manage`.

Identifikatori su zauzeti da se **nikada ne iskoriste za drugu radnju**. Ne gate-uju nijedan aktivni
endpoint i nisu dodijeljeni nijednoj roli.

---

# 9. Eksplicitna negativna ograničenja

Ovaj dokument **ne autorizuje**:

- caller-supplied role;
- unos role kroz request body, query parametar, header ni nepouzdane JWT claimove;
- `SYSTEM_ADMIN` tenant bypass;
- izjednačavanje database role sa aplikacijskom rolom;
- implicitnu hijerarhiju rola;
- klinički pristup za `PRACTICE_ADMIN` bez zasebne kliničke role;
- pregled encountera ni analiza za `AUDITOR`;
- bilo kakav pristup za `READ_ONLY` u v1;
- terminalnu review odluku za `MPA`;
- odobravanje ni opoziv odobrenja za `PRACTICE_ADMIN` isključivo kroz administrativnu rolu;
- upotrebu rezervisanih permisija;
- generičku administraciju membershipa ni rola.

---

# 10. Implementacijsko pravilo

Effective-permission resolver **mora**:

1. zahtijevati autentifikovanog korisnika;
2. rezolvirati **aktivan** membership za odabranu ordinaciju;
3. učitati trenutne `practice_membership_roles` redove tog membershipa;
4. evaluirati **svaku** dodijeljenu tenant rolu prema ovoj matrici;
5. **unijom spojiti** `ALLOW` grantove;
6. evaluirati `CONDITIONAL` grantove prema prihvaćenim practice flagovima;
7. **ignorisati `DENY` kao negativni override**;
8. **isključiti `platformRoles`** iz tenant kompozicije;
9. primijeniti **deny-by-default**;
10. izvršiti endpoint pod tenant RLS-om.

Ovaj dokument **nije** API ni migration specifikacija. Ugovor endpointa je u `03`, schema u `02`,
implementacijski plan u `04`.

---

# 11. Traceability

| Grupa permisija | Mjerodavna odluka |
|---|---|
| baseline workflow permisije | D-039 |
| korekcije i rješavanje findinga | D-040 |
| review, odobravanje i opoziv | D-041 |
| otkazivanje i arhiviranje | D-042 |
| export, tarifni rezultat, audit i osjetljiva čitanja | D-043 |
| practice postavke i zatvaranje encountera | D-044 |
| blokirane i out-of-v1 granice | D-045 |
| `integration.read` | D-032 |
| `tariff.manage` | D-023 |
| semantika kompozicije permisija | D-038 |
| bootstrap membership konteksta | D-033 |
| semantika kaskade otkazivanja | D-035 |
| izvođenje permisije iz tipa odluke | D-036 |
| approval greške pri exportu | D-037 |

---

# 12. Poznate naknadne rekonsilijacije

**Kreiranje ovog dokumenta samo po sebi ne mijenja nijedan drugi dokument.**

Sljedeći kontrolisani batchevi su obavezni i **nisu** izvršeni u ovom batchu:

- `03` §10 — formulacija podobnosti za odobravanje;
- `03` §18.3 — nagovještaj da je `tariff.raw_result.read` „tipično admin/auditor"; prihvaćeno
  značenje je **`PRACTICE_ADMIN` only** (D-043);
- `03` — referenca na kompletnu matricu iz `15`;
- `04` — implementacijski plan;
- `05` — checklist;
- `07` — Cursor fazni promptovi;
- `08` — test strategija;
- `MANIFEST.md`.

Do tada `05`, `07` i `08` zadržavaju `BLOCKED` oznake za produkcijske role grantove; njihovo
uklanjanje pripada tim batchevima, ne ovom.
