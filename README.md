# Auditabilni Axenita TARDOC Billing Safety Copilot

## Backend Documentation Pack v1.0

Ovaj repozitorij predstavlja tehničku osnovu za razvoj sistema **Auditabilni Axenita TARDOC Billing Safety Copilot**. Sistem je zamišljen kao pomoćni alat za švicarske ambulantne prakse koji:

- preuzima ili prima dokumentaciju konsultacije;
- izdvaja strukturirane činjenice iz medicinskog teksta;
- predlaže LKAAT usluge;
- poziva službeni tarifni engine preko zasebnog adaptera;
- određuje TARDOC ili ambulantni paušalni put;
- izvršava dodatna deterministička sigurnosna pravila;
- prikazuje dokaze i upozorenja;
- zahtijeva ljudski pregled i odobrenje;
- čuva potpuni audit trag;
- izvozi samo odobreni billing draft.

Sistem **nije** zamišljen kao zamjena za doktora, automatski obračunski autoritet, kompletan medicinski karton ili autonoman sistem za slanje konačnih računa.

---

## 1. Status dokumentacije

| Stavka | Status |
|---|---|
| Backend arhitektura | Definisana za MVP v1 |
| Database schema | Definisana na konceptualnom i implementacijskom nivou |
| REST API contract | Definisan za API v1 |
| Implementacijske faze | Definisane |
| Test strategija | Definisana |
| Security/privacy baseline | Definisan |
| Axenita produkcijski API | Vanjska zavisnost, još nije dostupan |
| OAAT produkcijski paket | Vanjska zavisnost, još nije integrisan |
| Produkcijski identity provider | Odluka otvorena |
| Produkcijski hosting | Odluka otvorena |

---

## 2. Autoritativni redoslijed dokumentacije

Kada se dokumenti ili kod ne slažu, koristi se ovaj redoslijed autoriteta:

1. `docs/00_PROJECT_RULES.md`
2. `docs/06_DECISION_LOG.md`
3. `docs/02_DATABASE_SCHEMA_V1.md`
4. `docs/03_API_CONTRACT_V1.md`
5. `docs/01_BACKEND_ARCHITECTURE_V1.md`
6. `docs/04_BACKEND_IMPLEMENTATION_PLAN_V1.md`
7. `docs/08_TEST_STRATEGY_V1.md`
8. `docs/09_SECURITY_PRIVACY_BASELINE_V1.md`
9. postojeći kod i migracije
10. ostala dokumentacija

Ako postoji konflikt koji se ne može riješiti ovim redoslijedom:

- ne improvizovati;
- ne mijenjati arhitekturu;
- evidentirati problem u `docs/13_OPEN_QUESTIONS_AND_EXTERNAL_DEPENDENCIES.md`;
- donijeti odluku kroz novi unos u `docs/06_DECISION_LOG.md`.

---

## 3. Obavezno čitanje prije rada

Svaki čovjek ili AI coding agent mora prije implementacije pročitati:

```text
AGENTS.md
docs/00_PROJECT_RULES.md
docs/01_BACKEND_ARCHITECTURE_V1.md
docs/02_DATABASE_SCHEMA_V1.md
docs/03_API_CONTRACT_V1.md
docs/04_BACKEND_IMPLEMENTATION_PLAN_V1.md
docs/05_IMPLEMENTATION_CHECKLIST.md
docs/06_DECISION_LOG.md
```

Za konkretnu fazu dodatno pročitati:

```text
docs/07_CURSOR_PHASE_PROMPTS.md
docs/08_TEST_STRATEGY_V1.md
docs/09_SECURITY_PRIVACY_BASELINE_V1.md
docs/10_LOCAL_DEVELOPMENT_RUNBOOK.md
docs/11_DEFINITION_OF_DONE_AND_ACCEPTANCE.md
docs/12_NAMING_AND_CODE_STANDARDS.md
docs/13_OPEN_QUESTIONS_AND_EXTERNAL_DEPENDENCIES.md
docs/14_DATA_FLOW_AND_SEQUENCE_DIAGRAMS.md
```

---

## 4. Ciljana struktura repozitorija

```text
axenita-billing-copilot/
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── compose.yaml
├── .env.example
├── .gitignore
│
├── apps/
│   └── api/
│       ├── src/
│       ├── prisma/
│       ├── test/
│       ├── package.json
│       └── prisma.config.ts
│
├── services/
│   └── tariff-engine-java/
│       ├── src/
│       ├── pom.xml ili build.gradle
│       └── README.md
│
├── packages/
│   └── contracts/
│
├── infra/
│   ├── database/
│   │   ├── init/
│   │   └── scripts/
│   ├── docker/
│   └── deployment/
│
├── scripts/
│
└── docs/
    ├── 00_PROJECT_RULES.md
    ├── 01_BACKEND_ARCHITECTURE_V1.md
    ├── 02_DATABASE_SCHEMA_V1.md
    ├── 03_API_CONTRACT_V1.md
    ├── 04_BACKEND_IMPLEMENTATION_PLAN_V1.md
    ├── 05_IMPLEMENTATION_CHECKLIST.md
    ├── 06_DECISION_LOG.md
    ├── 07_CURSOR_PHASE_PROMPTS.md
    ├── 08_TEST_STRATEGY_V1.md
    ├── 09_SECURITY_PRIVACY_BASELINE_V1.md
    ├── 10_LOCAL_DEVELOPMENT_RUNBOOK.md
    ├── 11_DEFINITION_OF_DONE_AND_ACCEPTANCE.md
    ├── 12_NAMING_AND_CODE_STANDARDS.md
    ├── 13_OPEN_QUESTIONS_AND_EXTERNAL_DEPENDENCIES.md
    └── 14_DATA_FLOW_AND_SEQUENCE_DIAGRAMS.md
```

---

## 5. Zaključani tehnološki smjer za MVP

| Sloj | Smjer |
|---|---|
| Runtime | Node.js LTS, zaključana major/minor verzija u fazi 1 |
| Backend framework | NestJS 11 |
| Jezik | TypeScript strict |
| Package manager | pnpm |
| Database | PostgreSQL 16, najnoviji dostupni patch unutar major verzije |
| ORM/migracije | Prisma ORM 7 + ručno dopunjen SQL |
| Queue | Redis 7 + BullMQ |
| Object storage | S3-compatible storage, lokalno MinIO |
| Tarifni servis | Java 21 LTS + Spring Boot wrapper |
| API | REST, URI versioning `/api/v1` |
| Contract | OpenAPI 3.1 |
| Auth | OIDC/JWT; produkcijski provider se bira kasnije |
| Testing | Jest/Vitest prema Nest konfiguraciji, Supertest, stvarni test PostgreSQL |
| Deployment | Container-based; Kubernetes nije MVP zahtjev |

Tačne patch verzije moraju biti zaključane u `package.json`, lockfileu i container image digestima tokom faze 1. Coding agent ne smije proizvoljno vršiti major upgrade.

---

## 6. Implementacijski princip

Implementacija ide isključivo fazno:

```text
Faza 1  → Repository i lokalna infrastruktura
Faza 2  → Prisma, DB role i konfiguracija
Faza 3  → Identity i practice domena
Faza 4  → Tenant isolation i RLS
Faza 5  → Patient reference, encounter i dokumenti
Faza 6  → Tarifne verzije
Faza 7  → Analysis modeli, outbox i queue
Faza 8  → Mock AI i mock Tarif Engine
Faza 9  → Safety rules
Faza 10 → Review, findings i approval
Faza 11 → Manual export i audit package
Faza 12 → Hardening, OpenAPI, CI i pilot readiness
```

Nakon svake faze:

1. pokrenuti sve propisane provjere;
2. ažurirati checklistu;
3. prikazati Git diff;
4. kreirati poseban commit;
5. tek tada početi narednu fazu.

---

## 7. Najvažnija sigurnosna pravila

- Runtime API nikada ne koristi database owner/migrator credentials.
- Sve tenant tabele imaju `practice_id`.
- Sve tenant tabele imaju PostgreSQL RLS.
- Tenant context se postavlja u istoj database transakciji u kojoj se vrše poslovni upiti.
- Cross-tenant veze se sprečavaju composite foreign key ograničenjima.
- Medicinski tekst ne ide u Redis, obične logove niti telemetry atribute.
- AI provider ne dobija direktne identifikatore pacijenta.
- Analiza, tarifni rezultat i odobreni payload moraju biti verzionirani i hashirani.
- Export koristi samo immutable `approved_payload_json`.
- Nijedan MVP tok ne šalje automatski konačan račun.

---

## 8. Brzi početak

Detaljne komande se nalaze u:

```text
docs/10_LOCAL_DEVELOPMENT_RUNBOOK.md
```

Fazni promptovi za Cursor nalaze se u:

```text
docs/07_CURSOR_PHASE_PROMPTS.md
```

Prije prvog prompta:

1. kopirati cijeli dokumentacijski paket u root projekta;
2. otvoriti root folder u Cursoru;
3. potvrditi da Cursor vidi `AGENTS.md` i `docs/`;
4. započeti samo fazu 1;
5. ne dozvoliti automatski prelazak na fazu 2.

---

## 9. Definicija prvog funkcionalnog milestonea

Prvi kompletan backend milestone je postignut kada radi:

```text
dev autentifikacija
→ odabir ordinacije
→ kreiranje pseudonimizovane patient reference
→ kreiranje encountera
→ unos medicinskog teksta
→ kreiranje analysis joba
→ mock AI ekstrakcija
→ mock tarifna evaluacija
→ determinističko upozorenje
→ ručna korekcija
→ ljudsko odobrenje
→ manual JSON export
→ audit package
```

Stvarni AI, Axenita i OAAT integracije se priključuju tek nakon ovog milestonea.

---

## 10. Važna napomena

Ova dokumentacija je tehnički projektni standard za MVP. Ne predstavlja pravno mišljenje, tarifno odobrenje niti zamjenu za službenu OAAT/Axenita dokumentaciju. Produkcijski pilot zahtijeva provjeru ugovora, licenci, zaštite podataka, hostinga, podobrađivača i službenih integracijskih uslova.
