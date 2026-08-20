# 11 — Definition of Done and Acceptance

Ovaj dokument definiše kada se zadatak, faza, milestone ili pilot može smatrati završenim.

---

# 1. DoD za pojedinačni zadatak

- scope je jasno ispunjen;
- nema nedokumentovanog scope creepa;
- kod je formatiran;
- lint prolazi;
- typecheck prolazi;
- relevantni testovi prolaze;
- error handling je implementiran;
- security/privacy pravila su provjerena;
- audit je dodat za business command;
- OpenAPI je ažuriran kada je API promijenjen;
- migration je dodana kada je schema promijenjena;
- checklist je ažurirana;
- nema secrets/PHI;
- Git diff je pregledan;
- završni report postoji.

---

# 2. DoD za database migraciju

- migracija autorisana kanonskim tokom iz D-050 (`02` §26.3, `10` §7.1) — `migrate diff` kandidat,
  ručna dopuna, **ljudski pregled kompletnog SQL-a**; bez `migrate dev --create-only` i bez
  slabljenja guardova migracije `001`;
- radi na jednokratnoj, ispravno bootstrapovanoj praznoj DB;
- radi kroz `migrate deploy`;
- backward/rollout razmatran;
- constraints postoje;
- indeks postoji gdje je potreban;
- grants minimalni;
- RLS policy dodana;
- FORCE RLS gdje treba;
- steady-state `relrowsecurity = true` i `relforcerowsecurity = true` provjereni nakon migracije i
  nakon seeda; svaki seed upis u `FORCE RLS` tabelu ide kroz protokol iz `02` §23.4 (D-048);
- runtime nije owner;
- composite FK;
- testovi;
- nema destruktivnog implicitnog gubitka podataka.

---

# 3. DoD za tenant tabelu

- practice_id;
- unique practice+id;
- composite FK;
- RLS select/insert/update prema matrici;
- nema delete policy bez potrebe;
- FORCE RLS;
- A/B test;
- no-context test;
- runtime grant test;
- indeks sa practice_id kao leading key za glavne queryje.

---

# 4. DoD za API endpoint

- URI v1;
- permission;
- practice context;
- DTO;
- unknown fields rejected;
- response DTO;
- OpenAPI;
- Problem Details;
- request ID;
- idempotency ako command;
- ETag ako mutable;
- state validation;
- transaction;
- audit;
- tests: auth, permission, validation, tenant, happy, failure.

---

# 5. DoD za async job

- DB async_job;
- outbox command;
- minimal payload;
- no medical text;
- idempotent processor;
- checkpoint;
- retry classification;
- max attempts;
- safe error;
- progress/status;
- test Redis outage;
- test duplicate delivery;
- audit final state.

---

# 6. DoD za AI provider

- interface;
- mock;
- schema;
- validation;
- redaction;
- no identifiers;
- timeout;
- retry;
- provider metadata;
- request/response hash;
- baseline fixtures;
- invalid output;
- no final billing direct write.

---

# 7. DoD za tariff provider

- internal contract;
- mock;
- versions;
- timeout/retry;
- raw result;
- normalized result;
- schema validation;
- package hash;
- baseline;
- historical replay;
- no browser access.

---

# 8. DoD za safety rule

- code;
- version;
- metadata;
- blocking;
- allowAcceptedRisk;
- deterministic implementation;
- positive/negative/boundary tests;
- evidence;
- dedup;
- remediation text;
- approval impact.

---

# 9. DoD za approval

- readiness centralno;
- row lock;
- expected revision;
- no blockers;
- ack policy;
- correction reasons;
- canonical payload;
- SHA-256;
- immutable DB;
- audit;
- concurrent test;
- revoke.

---

# 10. DoD za export

- active approval;
- hash comparison;
- adapter;
- async;
- idempotency;
- retry;
- artifact hash;
- safe response;
- audit;
- no current unapproved data;
- negative tests.

---

# 11. Phase acceptance

Svaka faza je DONE samo kada:

- `UNRESOLVED_REQUIRED = 0` za tu fazu (rubrik ispod);
- sve propisane komande;
- nema BLOCKER/HIGH review nalaza;
- dokumentacija;
- branch commit;
- working tree čist.

## 11.1 Rubrik `UNRESOLVED_REQUIRED` — D-056, dio C

**Doslovno „nula neoznačenih kućica" NIJE pravilo zatvaranja faze**
(`ZERO_UNCHECKED_IS_NORMATIVE_REQUIREMENT = NO`). Raniju formulaciju „svi checkboxi faze" treba
čitati kroz ovaj rubrik.

Svaka checklist stavka koja pripada fazi mora biti **ili**:

1. `SATISFIED_BY_EVIDENCE` — označena, uz citiranu komandu/test/dokaz prema `00` §14;

**ili** nositi eksplicitnu dispoziciju potkrijepljenu **prihvaćenim autoritetom**:

2. `SUPERSEDED`;
3. `HISTORICAL`;
4. `NOT_APPLICABLE_IN_V1`;
5. `EXPLICITLY_DEFERRED`;
6. `FUTURE_SCOPE`.

Za svaku dispoziciju koja ostavlja **živu obavezu za kasniji obuhvat**, ta obaveza mora biti
**očuvana/premještena u sekciju faze koja je posjeduje**, prema precedentu D-052.

Nijedan zahtjev se ne smije tiho izbrisati, oslabiti, implicitno penzionisati ni proglasiti `N/A`
samo zato da bi se faza zatvorila. Stavka bez dokaza i bez eksplicitne, autoritetom potkrijepljene
dispozicije je `UNRESOLVED_REQUIRED` i **blokira zatvaranje faze**. Proizvoljna neoznačena rezidua
nije dopuštena.

---

# 12. Core MVP milestone

Obavezno:

- auth/dev;
- practice context;
- RLS;
- patient reference;
- encounter;
- document;
- analysis job;
- mock AI;
- mock tariff;
- safety finding;
- review;
- approval;
- manual export;
- audit package;
- OpenAPI;
- CI;
- backup restore.

Nije potrebno:

- stvarni Axenita;
- stvarni OAAT;
- stvarni AI;
- PDF ako nije odlučen;
- production hosting.

---

# 13. Production pilot acceptance

Pored core MVP:

- produkcijski OIDC/MFA;
- Swiss hosting approved;
- secrets/KMS;
- real provider contracts;
- OAAT license/package;
- Axenita sandbox/integration ili odobren manual pilot;
- DPIA/privacy/legal;
- retention;
- incident response;
- monitoring;
- alerts;
- backup/restore;
- security assessment;
- operator runbook;
- support owner;
- rollback;
- pilot users/training;
- acceptance dataset.

---

# 14. Nije završeno ako

- samo se kompajlira;
- test je preskočen;
- RLS nije testiran runtime rolom;
- Cursor kaže "implemented" bez command outputa;
- migracija je samo `db push`;
- migracija je autorisana kroz `migrate dev --create-only` ili je oslabljen guard migracije `001`;
- seed je upisao u `FORCE RLS` tabelu izvan protokola iz `02` §23.4, ili je ostavio `FORCE`
  isključenim;
- write grant je uveden bez RLS politike koja ga ograničava;
- endpoint nema permission;
- queue payload ima tekst;
- approval nema snapshot/hash;
- export čita mutable table state;
- log sadrži PHI;
- external dependency je pretpostavljena bez ugovora.
