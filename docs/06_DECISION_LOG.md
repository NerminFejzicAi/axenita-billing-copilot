# 06 — Decision Log

**Format:** Lightweight Architecture Decision Records  
**Pravilo:** Prihvaćena odluka se ne mijenja silentno. Nova odluka dobija novi ID.

Statusi:

```text
PROPOSED
ACCEPTED
SUPERSEDED
REJECTED
DEFERRED
```

---

# D-001 — Modularni monolit za MVP

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** Glavni backend je jedan modularni NestJS monolit. Java Tarif Engine je jedini odvojeni poslovni servis u MVP arhitekturi.
- **Razlog:** Mala ekipa, brža isporuka, jednostavnije transakcije, audit i deployment.
- **Alternative:** mikroservisi po modulu; serverless funkcije.
- **Posljedice:** stroge module granice su obavezne; kasnije izdvajanje je moguće kroz adaptere/outbox.
- **Ne dozvoljava:** proizvoljno kreiranje novih servisa.

---

# D-002 — PostgreSQL kao source of truth

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** PostgreSQL čuva sve trajno poslovno stanje, job status, outbox i audit metadata.
- **Alternative:** Redis state; event store; NoSQL.
- **Posljedice:** Redis outage ne smije izgubiti komandu; outbox je obavezan.

---

# D-003 — PostgreSQL 16 major verzija za MVP

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** MVP se implementira i testira na PostgreSQL 16, uz najnoviji odobreni patch unutar major verzije.
- **Razlog:** prethodno definisan stack, stabilnost i dovoljno dug support period.
- **Posljedice:** ne prelaziti na 17/18 bez migration testova i novog ADR-a.

---

# D-004 — Prisma 7 + custom SQL

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** Prisma se koristi za modele, client i migration workflow; RLS, grants, functions, triggers i napredni constraints se pišu u migration SQL-u.
- **Alternative:** TypeORM; Drizzle; čisti SQL.
- **Posljedice:** `schema.prisma` nije kompletan source svih database pravila; migration SQL je autoritativan za native security.

---

# D-005 — Odvojeni DB korisnici

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** `copilot_migrator` i `copilot_app` su odvojeni.
- **Posljedice:** runtime nije owner i nema BYPASSRLS.
- **Test:** current_user/owner/RLS test obavezan.

---

# D-006 — Database-level tenant isolation

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** Tenant zaštita koristi PracticeContext + TenantDatabaseService + RLS + composite FK.
- **Alternative:** application WHERE filter.
- **Razlog:** defense in depth.
- **Posljedice:** svi tenant business upiti moraju biti u interactive transactionu.

---

# D-007 — URI REST API versioning

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** API koristi `/api/v1`.
- **Alternative:** header versioning; GraphQL.
- **Posljedice:** breaking contract ide u v2 ili kompatibilan rollout.

---

# D-008 — Problem Details format

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** Sve greške koriste `application/problem+json` sa stabilnim `code`.
- **Posljedice:** controlleri ne vraćaju ad-hoc error shape.

---

# D-009 — Idempotency i optimistic locking

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** Command POST koristi Idempotency-Key; mutable PATCH koristi If-Match/ETag.
- **Posljedice:** idempotency tabela i version kolone su dio schema v1.

---

# D-010 — Asinhroni analysis pipeline

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** AI, tariff, PDF i export ne rade unutar HTTP requesta.
- **Tehnologija:** BullMQ + Redis.
- **Posljedice:** HTTP vraća 202; PostgreSQL čuva status.

---

# D-011 — Transactional outbox

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** DB command i enqueue koordiniraju se kroz outbox.
- **Alternative:** direktni `queue.add()` nakon commita.
- **Posljedice:** publisher i idempotentni processor su obavezni.

---

# D-012 — AI kao provider-neutralni prijedlog

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** AI output je strukturirani prijedlog, ne finalni billing rezultat.
- **Posljedice:** schema validation, evidence, confidence i human review.

---

# D-013 — Mock-first external integracije

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** Prvo Mock AI, Mock Tariff Engine i ManualAdapter.
- **Posljedice:** stvarni provider se ne priključuje prije kompletnog core e2e toka.

---

# D-014 — Ne implementirati TARDOC engine

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** Sistem koristi službeni/odobreni OAAT TarifMatcher kroz Java wrapper.
- **Posljedice:** bez službenog paketa koristi se mock; ne rekreirati tarifnu logiku prema PDF-u.

---

# D-015 — Immutable analysis revisions

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** Značajna korekcija stvara novu analysis revision.
- **Posljedice:** stara revizija postaje SUPERSEDED, ali ostaje dostupna za audit.

---

# D-016 — Immutable approval snapshot

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** Approval ima vlastiti payload JSON i SHA-256.
- **Posljedice:** export ne čita "trenutne" candidate/item tabele nego odobreni payload.

---

# D-017 — ManualAdapter prije Axenite

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** MVP export proizvodi manual JSON/audit artefakt.
- **Posljedice:** Axenita adapter je stub dok nema službenog ugovora.

---

# D-018 — Application-level encryption za medicinski tekst

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** Originalni/normalized/redacted medicinski tekst se čuva enkriptovan, uz hash i verziju ključa.
- **Detalj algoritma:** Otvoren u D-OPEN-004.
- **Posljedice:** encryption interface se implementira prije document storagea.

---

# D-019 — Decimalne vrijednosti kao string u API-ju

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** Prisma Decimal/numeric se serializuje kao string.
- **Razlog:** preciznost.
- **Posljedice:** frontend contract mora to poštovati.

---

# D-020 — Njemački UI, stabilni tehnički kodovi

- **Status:** ACCEPTED
- **Datum:** 2026-07-18
- **Odluka:** MVP user-facing tekst je `de-CH`; tehnički error/rule/status kodovi su stabilni English uppercase identifiers.
- **Posljedice:** lokalizacija ne mijenja API logiku.

---

# Otvorene odluke

## D-OPEN-001 — Produkcijski OIDC provider

- **Status:** DEFERRED
- **Opcije:** Keycloak, Azure Entra ID, Auth0, drugi odobreni OIDC.
- **Potrebno do:** prije produkcijskog pilota.
- **MVP razvoj:** izolovani dev auth, nikada uključen u production.

## D-OPEN-002 — Produkcijski hosting

- **Status:** DEFERRED
- **Kriteriji:** Swiss region, ugovori, backups, KMS, monitoring, cijena.

## D-OPEN-003 — AI provider

- **Status:** DEFERRED
- **Kriteriji:** DPA, region, retention/training, structured output, latency, cijena.

## D-OPEN-004 — Encryption format/KMS

- **Status:** PROPOSED
- **Preporuka:** AES-256-GCM envelope encryption; DEK po dokumentu ili kontrolisanoj grupi; KEK u KMS.
- **Treba odlučiti:** format ciphertexta, IV/tag kolone, rotation, access.

## D-OPEN-005 — ESM ili CommonJS

- **Status:** PROPOSED
- **Preporuka:** ESM/NodeNext ako Nest/Prisma baseline testovi prolaze.
- **Rok:** Faza 1–2.
- **Nakon odluke:** upisati novi accepted ADR; ne mijenjati usred projekta.

## D-OPEN-006 — PDF generator

- **Status:** DEFERRED
- **MVP:** JSON audit package je obavezan; PDF može biti faza 11/12.

## D-OPEN-007 — Retention politika

- **Status:** DEFERRED
- **Vlasnik odluke:** practice/legal/security.
- **Potrebno prije:** produkcijski pilot.

## D-OPEN-008 — Raw AI request/response retention

- **Status:** DEFERRED
- **Opcije:** ne čuvati raw; enkriptovano kratko; enkriptovano prema audit periodu.
- **Kriterij:** reproduktivnost naspram data minimization.

## D-OPEN-009 — Axenita API scope

- **Status:** BLOCKED EXTERNAL
- **Potrebno:** partner docs, sandbox, auth, read/write scope.

## D-OPEN-010 — OAAT package/licenca

- **Status:** BLOCKED EXTERNAL
- **Potrebno:** službeni paket, distribucijska prava, versioning i Java integration docs.

---

# Template za novu odluku

```text
# D-XXX — Naslov

- Status:
- Datum:
- Kontext/problem:
- Odluka:
- Razlog:
- Alternative:
- Posljedice:
- Security/privacy uticaj:
- Migration/rollout:
- Test dokaz:
- Supersedes:
```
