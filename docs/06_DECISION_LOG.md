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
BLOCKED EXTERNAL
MUST DECIDE BEFORE <faza>
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
- **Posljedice:** stara revizija ostaje dostupna za audit.
- **Amandman (D-031, 2026-08-02):** Ulazak u `SUPERSEDED` je dozvoljen isključivo iz `REVIEW_REQUIRED` ili `COMPLETED`. Kreiranje child revizije NE mijenja status roditelja koji je `REJECTED`, `FAILED`, `EXTRACTION_FAILED`, `TARIFF_EVALUATION_FAILED` ili `CANCELLED` — ti statusi nose informaciju koja bi se prepisivanjem izgubila. `APPROVED` mora prvo biti revoked u `REVIEW_REQUIRED` prije nego što ga druga revizija može zamijeniti. Veza dijete → roditelj je uvijek vidljiva kroz `parent_analysis_run_id`, bez obzira na status roditelja.

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
- **Detalj algoritma:** Zaključan u D-025 (AES-256-GCM, verzionisani aplikacijski ključ, kanonski AAD). Izbor KMS providera ostaje otvoren u D-OPEN-004a.
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

# D-021 — Module format: ESM/NodeNext

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `00_PROJECT_RULES.md` §4.1 zahtijeva jedan dokumentovan module sistem za cijeli backend. D-OPEN-005 je ostao PROPOSED, `13` §2 je odluku označio kao MUST DECIDE PHASE 1, a fazni prompt u `07` ju je delegirao coding agentu — što `00` §16 ne dozvoljava.
- **Odluka:** Backend koristi ESM sa `"type": "module"` i TypeScript `module`/`moduleResolution` = `NodeNext`. Odluka važi za `apps/api`, `packages/contracts` i sve buduće Node pakete u workspaceu.
- **Razlog:** Node LTS i Prisma 7 su ESM-native. `13` §2 zabranjuje promjenu nakon faze 2, pa je jeftinije odlučiti sada nego migrirati kasnije.
- **Alternative:** CommonJS — NestJS default, širi ekosistem, jednostavnija Jest konfiguracija. Odbijen kao primarni izbor, zadržan kao unaprijed odobren fallback.
- **Spike:** Tehnička provjera u fazi 1 ograničena je na jednu fokusiranu sesiju ili dva sata.
- **Fallback (unaprijed odobren):** Ako `lint`, `typecheck`, `test` i `build` ne mogu proći zbog sistemskih ESM kompatibilnih problema, rad se zaustavlja i predlaže se superseding CommonJS ADR prije faze 2. Fallback se ne primjenjuje bez tog ADR-a.
- **Posljedice:** Jest ESM konfiguracija ili Vitest; nema `__dirname`/`require`; `prisma.config.ts` i generisani client se verifikuju u fazi 1.
- **Security/privacy uticaj:** Nema.
- **Migration/rollout:** Primjenjuje se pri kreiranju prvog `package.json` u fazi 1.
- **Test dokaz:** Acceptance komande faze 1 — `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- **Supersedes:** D-OPEN-005.

---

# D-022 — Bezuslovni `unique (practice_id, id)` na tenant tabelama

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `02` §2.5 uslovno propisuje `unique (practice_id, id)` samo tamo gdje druge tenant tabele referenciraju tabelu. Constraint je deklarisan na šest tabela, a nedostaje na šest koje isti dokument koristi kao composite FK ciljeve: `encounter_documents`, `service_candidates`, `tariff_evaluations`, `rule_findings`, `analysis_approvals`, `integration_connections`. PostgreSQL composite foreign key zahtijeva unique constraint nad tačno referenciranim parom kolona, pa se ti FK-ovi ne mogu kreirati.
- **Odluka:** Svaka tenant tabela obavezno ima `unique (practice_id, id)`, bez obzira da li je trenutno FK cilj. `02` §2.5 se prepisuje kao bezuslovno pravilo.
- **Razlog:** Uklanja procjenu po tabeli, koja je i proizvela ovaj propust. Čini `11` §3 mehanički provjerljivim i omogućava buduće composite FK bez migracije nad popunjenom tabelom.
- **Alternative:** Dodati constraint samo na šest tabela koje su danas FK ciljevi; ukloniti composite FK i osloniti se na aplikacijske provjere (odbijeno — protivno `00` §6.4, D-006 i `08` §7).
- **Posljedice:** Dodatni unique index po tenant tabeli, zanemarive cijene na MVP obimu. Migration paketi 003, 006, 007, 008, 009 i 010 se dopunjuju.
- **Security/privacy uticaj:** Pozitivan — omogućava cross-tenant zaštitu na nivou baze (D-006), koja bi inače ostala samo aplikacijska.
- **Test dokaz:** `08` §7 composite FK testovi; svaki pokušaj cross-tenant reference mora pasti na database constraintu, ne na aplikacijskoj validaciji.
- **Ne obuhvata:** optimistic locking `version` kolone — predmet D-029.

---

# D-023 — Minimalni tenant/system split, rola `copilot_system` i platform rola SYSTEM_ADMIN

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `audit_events`, `outbox_events`, `async_jobs` i `webhook_receipts` imaju nullable `practice_id`, a `02` §17/§18 propisuju FORCE RLS sa equality politikom. `NULL = <uuid>` daje `NULL`, pa red sa `practice_id IS NULL` runtime rola ne može ni upisati ni pročitati — tiho, bez greške. Istovremeno `02` §20.1 nije odlučio kako admin endpointi pišu globalnu konfiguraciju bez migrator credentiala.
- **Analiza scopea:** Nakon odgoda (AI prompt admin CRUD, safety rule admin CRUD, integration credential/test/activation, webhooks, import) MVP ima tačno jedan system-scope upis: aktivacija/deaktivacija tarifne verzije u fazi 6. Za nju već postoji globalna append-only tabela `tariff_release_activation_history` (`02` §9.5).
- **Odluka:**
  1. `practice_id` je `NOT NULL` na `audit_events`, `outbox_events` i `async_jobs`.
  2. Ne kreiraju se `system_audit_events`, `system_outbox_events`, `system_async_jobs` ni `system_webhook_receipts`.
  3. Uvodi se treća login rola `copilot_system` (`LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`, nije owner), credential `SYSTEM_DATABASE_URL`.
  4. `copilot_app` ima isključivo SELECT na globalnim tarifnim tabelama i column-level SELECT na metadata `system_storage_objects` (D-024).
  5. `copilot_system` piše globalnu tarifnu konfiguraciju i `tariff_release_activation_history`.
  6. Migrator credential se nikada ne koristi u runtimeu.
  7. Globalne tarifne i system-storage tabele NE koriste tenant RLS. Zaštita je ownership, uski GRANT i negativni privilege testovi.
  8. Uvodi se platform aplikacijska rola `SYSTEM_ADMIN`, odvojena od `practice_memberships`, u novoj globalnoj tabeli `platform_role_assignments`.
  9. `tariff.manage` pripada isključivo `SYSTEM_ADMIN`, nikada `PRACTICE_ADMIN`.
  10. `SYSTEM_ADMIN` nema automatski pristup encounterima, analizama ni medicinskim dokumentima; pristup tenant podacima zahtijeva aktivan `practice_memberships` red.
  11. `copilot_app` NEMA neograničen SELECT nad `platform_role_assignments`. Tabela koristi user-scoped RLS: politika za `copilot_app` propušta isključivo redove gdje `user_id = nullif(current_setting('app.user_id', true), '')::uuid`. Uvodi se `app_security.set_user_context(p_user_id uuid)` koja postavlja SAMO `app.user_id` i briše `app.practice_id`, transakcijski lokalno, bez membership validacije — jer `SYSTEM_ADMIN` nema membership, pa bi `set_request_context` podigao `42501` i korisnik nikada ne bi mogao pročitati vlastitu platform rolu. `copilot_system` ima SELECT nad svim redovima; upis je u MVP-u isključivo seed/migracija.
  12. Klauzula 7 se odnosi na tarifne i system-storage tabele. `platform_role_assignments` koristi user-scoped RLS, što nije tenant RLS i nije u koliziji sa klauzulom 7.
  13. Trust boundary za `set_user_context` dokumentovan je u `02` §16.2a i `09` §6: `p_user_id` dolazi isključivo iz kriptografski verifikovanog JWT/OIDC subjekta, nikada iz bodyja, query parametra ili nepouzdanog headera; poziva se samo unutar kratke autentifikacione transakcije; samo `AuthService` ga smije pozvati. Mehanizam ograničava normalni query scope i aplikacijske greške, ali NE autentifikuje korisnika nezavisno nakon kompromitacije dijeljenog `copilot_app` credentiala. Tačka sprovođenja autorizacije je API, ne baza.
- **Razlog:** Zatvara defekt uklanjanjem nullable kolone umjesto dodavanjem infrastrukture koja bi je podržala. Obrazac odvojene globalne tabele već je zaključan u `02` §9.2 za `system_storage_objects`.
- **Alternative:** Opcija 1 — zasebne `system_*` tabele uz `copilot_system`; Opcija 2 — dijeljene tabele sa nullable `practice_id` i politikama po roli; Opcija 3a — bez nove DB role, uz samo aplikacijsku permission (odbijeno jer slabi kontrolu za T2).
- **Posljedice:** Budući non-tenant audit zahtijeva migraciju; prelaz na Opciju 1 je aditivan, prelaz na Opciju 2 više nije. `/admin/tariff-releases*` postaje platform ruta i ne zahtijeva `X-Practice-ID`. `GET /me` mora vraćati platform role. `webhook_receipts` i `import_batches` ostaju DEFERRED do Axenita epica, gdje se odlučuje njihov tenancy model.
- **Security/privacy uticaj:** Uklanja tihi gubitak audit zapisa; runtime credential ne može pisati globalnu tarifnu konfiguraciju (T2); administracija platforme je odvojena od pristupa medicinskim podacima (T10).
- **Migration/rollout:** Migration paket 001 kreira `copilot_system`; paket 002 kreira `platform_role_assignments`.
- **Test dokaz:** Negativni privilege testovi za `copilot_app` i `copilot_system`; faza 6 aktivacija upisuje tačno jedan red u `tariff_release_activation_history`; `SYSTEM_ADMIN` bez membershipa dobija 403 na tenant rutama; korisnik A ne može pročitati platform rolu korisnika B; bez postavljenog `app.user_id` tabela vraća nula redova; API ne može odabrati proizvoljan `user_id` iz requesta.
- **Zavisnosti:** D-002, D-005, D-006. Uvodi novu DB rolu prema `00` §6.1.
- **Amandman (D-033, 2026-08-02):** Klauzula 13 se proširuje sa `set_user_context` na `set_request_context`. Potpis je `set_request_context(p_practice_id uuid)`, funkcija je SECURITY INVOKER i ne prima `p_user_id`. `practice_memberships` dobija ENABLE + FORCE RLS uz user-scoped self-select politiku. Vidi D-033.

---

# D-024 — Tarifni artefakti koriste `system_storage_objects`

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `02` §9.2 zaključava preporuku da globalni tarifni artefakti idu u `system_storage_objects`, ali kolona u istoj sekciji i dalje glasi `storage_object_id` i pokazuje na tenant tabelu. `02` §9.3 i `04` §8.3 se ne slažu oko toga smije li runtime rola čitati tu tabelu.
- **Odluka:**
  1. Kolona se zove `system_storage_object_id` i referencira `system_storage_objects(id)`.
  2. Grants za MVP: `copilot_app` dobija column-level SELECT na `(id, original_filename, content_type, byte_size, sha256, created_at)`; bez `bucket_name`, `object_key`, `antivirus_status`, `created_by`, `retention_delete_after` i svih `encryption_*` kolona.
  3. `copilot_system` dobija SELECT nad svim kolonama, INSERT, i column-level UPDATE isključivo na `(sha256, byte_size, antivirus_status)` — completion i validation metadata.
  4. DELETE nema nijedna runtime rola.
  5. Owner je `copilot_migrator`; nijedna runtime rola nije owner.
  6. Sadržaj artefakta se i dalje dohvata kroz storage adapter uz posebnu permission.
- **Razlog:** Honoriše već zaključanu preporuku iz §9.2, drži tenant RLS uniformnim i odgovara `system_*` obrascu iz D-023.
- **Alternative:** nullable `practice_id` na `storage_objects` (odbijeno — vraća defekt koji D-023 zatvara); inline metadata bez storage object reda (gubi hash/AV/retention pipeline koji `09` §13 zahtijeva).
- **Posljedice:** Storage servis dobija scope parametar (tenant/system). Migration paket 004 kreira `system_storage_objects` prije `tariff_release_artifacts`. Proširenje bilo kojeg granta zahtijeva novi ADR.
- **Security/privacy uticaj:** Runtime rola ne vidi lokaciju objekta ni referencu ključa; least privilege prema `09` §6.
- **Test dokaz:** Faza 6 — obični physician ne upravlja releaseom; `copilot_app` SELECT nad `object_key` pada; `copilot_system` UPDATE nad `archived_at` pada; DELETE pada za obje role; nijedna nije `tableowner`.
- **Zavisnosti:** D-023.

---

# D-025 — Format aplikacijske enkripcije (AES-256-GCM, verzionisani aplikacijski ključ)

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** D-018 je prihvatio aplikacijsku enkripciju, ali je format ostao otvoren u D-OPEN-004, dok `02` §8.2 već fiksira kolone. Uz to, četiri `*_ciphertext` kolone (`02` §7.1, §7.2, §10.7, §14.2) nemaju `_iv` ni `_auth_tag`, pa su kako su napisane nedekriptibilne i neprovjerljive.
- **Odluka:**
  1. Algoritam AES-256-GCM; `envelope_version` počinje od 1; ključ je tačno 32 bajta.
  2. Po polju: `<field>_ciphertext bytea`, `<field>_iv bytea` (12 bajtova), `<field>_auth_tag bytea` (16 bajtova).
  3. Po redu: `encryption_algorithm varchar(30)`, `encryption_version integer`, `encryption_key_ref varchar(255)`, `encryption_key_version integer`. SVA enkriptovana polja u jednom redu dijele jedan `encryption_key_ref` i jedan `encryption_key_version`.
  4. Ključ je verzionisani aplikacijski ključ iz secrets managera. Nema per-row DEK u v1.
  5. AAD je kanonski UTF-8 string, LF separatori, bez završnog praznog reda:

     ```text
     v1
     practice_id=<canonical UUID or SYSTEM>
     table=<table name>
     row_id=<canonical UUID>
     column=<column name>
     envelope_version=<integer>
     ```

  6. IV je uvijek svjež po polju i po upisu. Ponovna upotreba IV-a sa istim ključem je zabranjena; svaki UPDATE ciphertext kolone generiše novi IV.
  7. Rotacija: pri prelasku reda na novu verziju ključa SVA non-null enkriptovana polja tog reda se ponovo enkriptuju atomarno, u jednoj transakciji, sa svježim IV-ovima. Re-enkripcija ne mijenja `*_hash` kolone. Stare verzije ključa se čuvaju za dekripciju kroz cijeli retention period.
  8. Layout se primjenjuje na SVE `*_ciphertext` kolone, uključujući `02` §7.1, §7.2, §8.2, §10.7 i §14.2.
  9. Local development koristi `LocalStaticKeyProvider` i ključ iz `ENCRYPTION_LOCAL_KEY`; `.env.example` sadrži nevažeći placeholder kako bi startup guard pao ako se primjer isporuči.
  10. Startup guard odbija start pri: `NODE_ENV=production` uz local provider; ključ nije 32 bajta; SHA-256 ključa odgovara poznatom development fixtureu; nedostaje key version.
  11. Row UUID generiše aplikacija i eksplicitno ga navodi u INSERT-u, prije enkripcije, jer `row_id` ulazi u AAD. Projektno pravilo je u `02` §2.2 i važi i izvan enkriptovanih tabela.
  12. AAD-vezana polja — `id`, `practice_id`, ime tabele i ime kolone — su immutable nakon INSERT-a. Enforcement je jedna zajednička trigger funkcija `app_security.reject_aad_bound_column_change()` i pet imenovanih BEFORE UPDATE triggera nad `patient_references`, `encounters`, `encounter_documents`, `candidate_evidence` i `external_resource_links`.
  13. Po enkriptovanom polju obavezni su CHECK constrainti: ciphertext, IV i auth tag su ili svi NULL ili svi non-NULL; `octet_length(iv) = 12`; `octet_length(auth_tag) = 16`.
  14. Ako je bilo koje enkriptovano polje u redu non-NULL, obavezno je `encryption_algorithm = 'AES-256-GCM'`, `encryption_version >= 1`, `encryption_key_ref IS NOT NULL` i `encryption_key_version >= 1`.
- **Razlog:** KMS provider je odgođen (`13` §4), a obje prednosti per-row DEK-a — jeftina rotacija KEK-a i crypto-shredding — proizlaze upravo iz KEK/KMS odnosa koji još ne postoji. Verzionisani envelope pretvara kasniji prelaz u promjenu verzije, ne u redizajn. AAD veže ciphertext za tačnu lokaciju i sprečava premještanje ciphertexta između redova, što RLS ne može spriječiti.
- **Alternative:** per-row DEK envelope (jača rotacija i crypto-shredding, ali zavisi od još neizabranog KMS providera); jedan self-describing blob (kontradiktira `02` §8.2); `pgcrypto` ili database-side enkripcija (ključ ulazi u bazu i ruši kontrolu za T2).
- **Uslovna revizija:** Ako odluka o retentionu (D-OPEN-007) zahtijeva crypto-shredding, prelazak na per-row DEK je obavezan prije pilota; prelaz je `encryption_version = 2`.
- **Posljedice:** Encryption interface se implementira prije document storagea (D-018). Migration paketi 003, 006 i 010 dobijaju iv/tag/key kolone i CHECK constrainte.
- **Security/privacy uticaj:** Ključ ne ulazi u bazu ni u log (`09` §9, §11). AAD jača kontrole za T1 i T7.
- **Test dokaz:** `08` §12 — ciphertext ≠ plaintext; dekripcija sa pogrešnim ključem ili verzijom pada; izmijenjen auth tag pada; ciphertext premješten u drugi red ne dekriptuje; neusklađena NULL trojka odbijena; IV od 11 bajtova odbijen; tag od 15 bajtova odbijen; UPDATE nad `id` ili `practice_id` pada sa `23514`.
- **Ostaje otvoreno:** KMS provider (D-OPEN-004a), rotation cadence.
- **Supersedes:** D-OPEN-004 djelimično — format je zatvoren, izbor KMS providera nije.

---

# D-026 — Jedna tarifna evaluacija po analysis runu

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `02` §11.1 propisuje `unique (analysis_run_id)` na `tariff_evaluations`, dok `03` §18 dozvoljava ponovnu evaluaciju unutar iste neodobrene revizije. Druga evaluacija istog runa bi prekršila constraint, pa oboje ne može važiti.
- **Odluka:**
  1. `unique (analysis_run_id)` ostaje.
  2. `POST /analyses/{analysisId}/tariff-evaluation` se uklanja iz API v1. Ponovna evaluacija ide isključivo kroz `POST /analyses/{id}/revisions`.
  3. Permission `analysis.run_tariff` se uklanja iz aktivnog v1 kataloga. Rezervisan je i ne koristi se ni za jedan drugi endpoint.
  4. Uvodi se `tariff_evaluation.read` za normalizovani rezultat.
  5. `tariff.raw_result.read` se dodaje u katalog `03` §28 — bio je u upotrebi u §18, ali nije bio katalogiziran.
  6. Workspace: `tariffEvaluation` blok se izostavlja ako korisnik nema `tariff_evaluation.read`, a response sadrži `"redacted": ["tariffEvaluation"]`. To se razlikuje od `"tariffEvaluation": null`, koje znači da evaluacija još ne postoji.
- **Razlog:** Usklađeno sa D-015. Approval payload builder, workspace i audit package se oslanjaju na "jedna evaluacija po runu" bez dodatnog pravila izbora. Bez klauzule 6 novi permission bi bio dekorativan, jer workspace vraća isti sadržaj.
- **Alternative:** `unique (analysis_run_id, attempt_number)` uz partial unique index za tekuću evaluaciju; zadržavanje `analysis.run_tariff` za GET rute; dodjela `tariff_evaluation.read` svim rolama koje imaju `analysis.read` (odbijeno — permission bez značenja).
- **Ne mijenja:** Retry nakon tehničke greške — `14` §7 checkpoint ponovo koristi postojeći red i ne kreira drugu evaluaciju.
- **Posljedice:** `03` §18 zadržava samo GET rute. OpenAPI mora označiti `tariffEvaluation` blok kao opcion i dokumentovati `redacted` marker.
- **Security/privacy uticaj:** Tarifni iznosi se mogu uskratiti rolama koje smiju čitati klinički kontekst; raw matcher odgovor je ograničen na admin/auditor.
- **Test dokaz:** `08` §15 — duplicate retry ne kreira drugu evaluaciju; negativni test — rola bez `tariff_evaluation.read` ne dobija `tariffEvaluation` blok ni na jednoj ruti.
- **Zavisnosti:** D-015.

---

# D-027 — `03` §29.1 je normativni izvor encounter state machinea

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** Encounter state machine je definisan u `03` §29.1, `08` §11 i `14` §12, i nijedna dva se ne slažu. `08` §11 izostavlja cancel, revoke i export-failure grane; `14` §12 dodaje dvije grane kojih nema ni u jednom drugom dokumentu. `08` §11 traži test svake dozvoljene i zabranjene tranzicije, što je nemoguće nad tri različite liste.
- **Odluka:** `03_API_CONTRACT_V1.md` §29.1 je jedini normativni izvor i sadrži uniju sve tri liste. `08` §11 i `14` §12 se prepisuju da ga tačno preslikavaju i eksplicitno na njega upućuju. `CANCELLED` i `CLOSED` su terminalna stanja; `CANCELLED → CLOSED` nije dozvoljen.
- **Razlog:** Redoslijed autoriteta iz `README.md` §2 stavlja `03` iznad `08` i `14`; `14` već sam sebe podređuje autoritativnim dokumentima. State machine pripada uz endpointe koji tranzicije pokreću.
- **Alternative:** proglasiti `14` §12 normativnim (dijagram je čitljiviji, ali `14` sam sebe podređuje); premjestiti state machine u `02` (najviši autoritet za podatke, ali tranzicije su API/domain koncern).
- **Posljedice:** Dijagram u `14` §12 se održava ručno u skladu sa §29.1.
- **Security/privacy uticaj:** Nema direktnog; jasan state model je preduslov za kontrole T6.
- **Test dokaz:** `08` §11.1 — test svake dozvoljene i svake zabranjene tranzicije prema jednoj listi.
- **Amandman (D-035, 2026-08-02):** Tranzicija `ANALYSIS_IN_PROGRESS → CANCELLED` izvršava se kao atomarna kaskada koja prvo otkazuje tekuću aktivnu analizu, pa encounter. Permisija `encounter.cancel` autorizuje cijelu komandu i njenu internu kaskadu. Vidi D-035.

---

# D-028 — Status kodovi za in-progress idempotency i nedostajući `If-Match`

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `03` §4 ostavlja izbor između `409` i `425`, `08` §10 između `428` i `400`, a tabela statusa u `03` §9 ne sadrži ni `425` ni `428`. `03` §34 zahtijeva potpun Problem Details katalog, a `08` §20 test po error familiji — ni jedno nije moguće dok je skup kodova neodlučen.
- **Odluka:**
  1. Request u toku sa istim idempotency keyem → `409` uz kod `REQUEST_ALREADY_IN_PROGRESS`. `425` se ne koristi.
  2. Nedostajući obavezni `If-Match` → `428` uz novi kod `PRECONDITION_REQUIRED`. `400` se za ovaj slučaj ne koristi.
  3. `428` se dodaje u tabelu `03` §9; `425` se ne dodaje.
  4. Optimistic locking počinje u fazi 3, ne u fazi 5, jer puni `PATCH /practices/{id}/settings` pripada fazi 3. Idempotency ostaje u fazi 5.
- **Razlog:** `425 Too Early` (RFC 8470) semantički pokriva TLS early data, ne concurrency. `428` (RFC 6585) je definisan tačno za nedostajući precondition i razlikuje se od `409` (stale verzija) i `422` (semantička validacija).
- **Alternative:** `409` + `400`, bez novih status kodova — konflatira protokolarni precondition sa validacijom bodyja i slabi asercije iz `08` §20.
- **Posljedice:** `03` §8 katalog dobija `PRECONDITION_REQUIRED`; generisani client obrađuje `428` odvojeno. `04` §7.4 gubi ETag/If-Match iz cross-cutting liste faze 5; `04` §5 ih dobija.
- **Security/privacy uticaj:** Nema.
- **Test dokaz:** `08` §10 i §20 — po jedna asercija za `409` i za `428`, po resursu iz D-029.
- **Zavisnosti:** D-009, D-029.
- **Amandman (D-037, 2026-08-02):** Katalog statusa se proširuje mapiranjem za export bez važećeg approvala — `409 APPROVAL_REQUIRED` i `409 APPROVAL_REVOKED`. Vidi D-037.

---

# D-029 — Optimistic locking `version` kolone

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `03` §5 propisuje `If-Match`/`ETag` za mutable resurse, ali revizija svih PATCH endpointa u `03` pokazuje da četiri od šest zaštićenih tabela nemaju `version` kolonu, a peta je ima bez check constrainta. `03` §16 čak referencira verziju uslovno — "ako je implementiran" — nad kolonom koja ne postoji.
- **Odluka:** Svaki resurs zaštićen `If-Match`/`ETag` ima:

  ```sql
  version integer not null default 1
  check (version >= 1)
  ```

  Obuhvat prema reviziji: `practice_settings`, `integration_connections`, `extracted_facts` i `service_candidates` dobijaju obje stavke; `rule_findings` ima kolonu i dobija samo check; `encounters` je već usklađen. `If-Match` postaje obavezan na `PATCH /analyses/{id}/facts/{factId}` i `PATCH /analyses/{id}/service-candidates/{candidateId}`, a uslovna formulacija u `03` §16 se briše.
- **Razlog:** Bez `version` kolone dva recenzenta koja istovremeno koriguju istu činjenicu proizvode lost update. `review_item_changes` čini gubitak auditabilnim, ali ga ne sprečava.
- **Alternative:** Osloniti se na `expectedAnalysisRevision` i append-only `review_item_changes` za facts i candidates — odbijeno jer ostavlja lost-update prozor.
- **Namjerno izostavljeni, uz razlog:** `analysis_approvals` (revoke je POST, concurrency kroz `SELECT … FOR UPDATE`), `tariff_releases` (aktivacija je POST, concurrency kroz partial unique index), `export_jobs` i `async_jobs` (worker ih mijenja, nema klijentskog PATCH-a), `encounter_diagnoses`, `patient_references`, `encounter_documents` i `storage_objects` (nemaju PATCH endpoint).
- **Posljedice:** Optimistic locking počinje u fazi 3 (D-028). Migration paketi 002, 006, 008 i 010 se dopunjuju.
- **Security/privacy uticaj:** Sprečava tihu prepisanu korekciju bez traga o tome čija je izmjena izgubljena.
- **Test dokaz:** `08` §10 za svih šest optimistic-locking resursa — `encounters`, `practice_settings`, `integration_connections`, `extracted_facts`, `service_candidates` i `rule_findings`. Za svaki od njih testirati sva tri slučaja:
  - tačan `If-Match` → uspjeh, inkrementiran `version` i novi `ETag`;
  - stale `If-Match` → `409 VERSION_CONFLICT`;
  - nedostajući obavezni `If-Match` → `428 PRECONDITION_REQUIRED`.
- **Zavisnosti:** D-009, D-028.

---

# D-030 — Deduplikacija rule findings kroz `UNIQUE NULLS NOT DISTINCT`

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `02` §12.3 propisuje petokolonski unique constraint sa dvije nullable kolone. U standardnoj SQL semantici NULL nije jednak NULL, pa dva identična findinga bez relacijskih kolona oba prolaze — što ruši zahtjev iz `04` §11.4 i `08` §16.
- **Odluka:** Koristi se PostgreSQL sintaksa:

  ```sql
  unique nulls not distinct (
    analysis_run_id,
    safety_rule_version_id,
    finding_code,
    related_service_candidate_id,
    related_tariff_item_id
  )
  ```

  `finding_dedup_key` se ne kreira. Expression unique index se ne koristi.
- **Razlog:** Baza rješava problem direktno, bez generisane kolone koja bi morala ostati sinhronizovana i bez expression indeksa koji je teže čitati u migraciji.
- **Alternative:** generisani `finding_dedup_key`; expression unique index sa `coalesce`; sentinel UUID umjesto NULL.
- **Posljedice:**
  1. Schema ima tvrdi minimum PostgreSQL 15. D-003 već zaključava 16, pa je uslov ispunjen; downgrade ispod 15 zahtijeva novi ADR.
  2. Prisma ne izražava `NULLS NOT DISTINCT`. Constraint se piše u `--create-only` migration SQL-u prema D-004, i `prisma migrate diff` može prijavljivati drift na njemu. To je očekivano i ne ispravlja se.
- **Security/privacy uticaj:** Nema direktnog; determinističko ponovno izvršavanje pravila je preduslov za reproduktivnost iz `00` §2.4.
- **Test dokaz:** Migration test i retry test — dva identična findinga sa NULL `related_service_candidate_id` i NULL `related_tariff_item_id` ne mogu oba biti upisana; drugi INSERT pada na database constraintu, ne na aplikacijskoj provjeri.
- **Zavisnosti:** D-003, D-004.

---

# D-031 — Analysis terminalna stanja, tehnički retry i supersession

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `02` §4.7 definiše 14 analysis statusa. `REJECTED` i `FAILED` nisu imali ulaznu granu ni u `03` §29.2 ni u `14` §13, iako `02` §4.13 definiše `REJECT` decision i `03` §20 ga prima. Retry semantika za `EXTRACTION_FAILED` i `TARIFF_EVALUATION_FAILED` nije bila eksplicitna, a D-015 je implicirao da svaka zamijenjena revizija postaje `SUPERSEDED`.
- **Odluka:**
  1. `REVIEW_REQUIRED → REJECTED`. `REJECTED` je terminalno za tu analysis reviziju. Encounter ostaje `REVIEW_REQUIRED`; `03` §29.1 se ne mijenja.
  2. `PREPARING_INPUT → FAILED` i `APPLYING_SAFETY_RULES → FAILED`. `FAILED` je terminalno.
  3. `EXTRACTING → EXTRACTION_FAILED` i `EVALUATING_TARIFF → TARIFF_EVALUATION_FAILED`. Oba su oporaviva.
  4. Eksplicitne tehničke retry tranzicije su `EXTRACTION_FAILED → EXTRACTING` i `TARIFF_EVALUATION_FAILED → EVALUATING_TARIFF`. Retry se vraća na svoj korak, nikada naprijed.
  5. Generički `FAILED` nema automatsku retry tranziciju jer stage oporavka nije poznat. Oporavak zahtijeva novu reviziju ili zasebno dokumentovanu recovery komandu.
  6. Supersession, uz amandman na D-015:
     - `REVIEW_REQUIRED` i `COMPLETED` mogu postati `SUPERSEDED`;
     - `REJECTED`, `FAILED`, `EXTRACTION_FAILED`, `TARIFF_EVALUATION_FAILED` i `CANCELLED` zadržavaju svoj status kada se kreira child revizija;
     - `APPROVED` mora prvo biti revoked u `REVIEW_REQUIRED` prije nego što ga druga revizija može zamijeniti;
     - `parent_analysis_run_id` čuva vezu revizija bez obzira na status roditelja.
  7. `SUPERSEDED` je terminalno.
  8. Cancel je dozvoljen iz svih aktivnih async stanja prema postojećem tekstu `03` §15 — `QUEUED`, `PREPARING_INPUT`, `EXTRACTING`, `EVALUATING_TARIFF`, `APPLYING_SAFETY_RULES`. `14` §13 je prikazivao samo `QUEUED → CANCELLED`; `03` je viši autoritet.
  9. Audit: `review_decisions` već nosi `decision`, `reason`, `decided_by` i `analysis_revision_number`, pa nova kolona nije potrebna. Dodatno se upisuje `audit_events` red sa akcijom `ANALYSIS_REJECTED`.
- **Razlog:** Prepisivanje odbijenog ili neuspjelog statusa u `SUPERSEDED` izgubilo bi informaciju zbog koje revizija nije završena. Generički `FAILED` bez poznatog stagea ne smije imati automatski retry jer bi mogao preskočiti ili ponoviti korak.
- **Alternative:** REJECT upisuje samo `review_decisions` bez promjene statusa, uz brisanje `REJECTED` iz enuma; `FAILED` sa retry granom na `PREPARING_INPUT`.
- **Posljedice:** `03` §29.2 postaje normativna lista; `14` §13 i `08` §11.2 je preslikavaju. `02` §4.7 enum ostaje nepromijenjen.
- **Security/privacy uticaj:** Očuvanje terminalnog statusa čuva audit trag o tome da je revizija odbijena ili neuspjela.
- **Test dokaz:** `08` §11.2 — svaka dozvoljena i svaka zabranjena tranzicija; posebno `APPROVED → SUPERSEDED` mora pasti, `EXTRACTION_FAILED → EVALUATING_TARIFF` mora pasti, a child revizija nad `REJECTED` ili `FAILED` roditeljem ne smije promijeniti status roditelja.
- **Zavisnosti:** D-015 (amandman), D-027.
- **Amandman (D-034, 2026-08-02):** Klauzula 6 ostaje na snazi — roditelj zadržava terminalni status — ali zadržani status više ne dozvoljava neograničen broj djece. Svaka revizija ima najviše jedno direktno dijete, a historija revizija je linearni lanac. Vidi D-034.

---

# D-032 — Deterministička rezolucija integration konekcije pri exportu

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `POST /analyses/{id}/exports` zahtijeva `integrationConnectionId`, ali `integration.read` pripada samo `PRACTICE_ADMIN`, dok `analysis.export` imaju i `PHYSICIAN` i `BILLING_SPECIALIST`. Te dvije role mogu pokrenuti export, ali ne mogu izlistati konekciju da je imenuju.
- **Odluka:**
  1. `integrationConnectionId` je opcionalan u MVP export komandi.
  2. Ako je izostavljen, server rezolvira konekciju determinističkim upitom nad `integration_connections` gdje `provider = 'MANUAL'` i `status = 'ACTIVE'` unutar practice contexta.
  3. Tačno jedna aktivna konekcija → koristi se.
  4. Nula aktivnih → `409 INTEGRATION_CONNECTION_NOT_CONFIGURED`.
  5. Više od jedne aktivne → `422 INTEGRATION_CONNECTION_REQUIRED`.
  6. Ako je `integrationConnectionId` poslan, rezolucija se ne izvršava; primjenjuje se normalna validacija — konekcija postoji, aktivna je i pripada practiceu.
  7. Rezolvirani ID se upisuje u `export_jobs.integration_connection_id` i u audit/export metadata, bez obzira da li je poslan ili rezolviran.
  8. `integration.read` ostaje ograničen na `PRACTICE_ADMIN`.
- **Razlog:** ManualAdapter konekcija se kreira seedom (`02` §23), pa je u MVP-u jedina aktivna. Deterministička rezolucija uklanja potrebu za listanjem bez proširivanja permission modela.
- **Alternative:** dodijeliti `integration.read` svim rolama sa `analysis.export`; vratiti listu konekcija u analysis workspace responseu.
- **Opseg rezolucije:** Ograničen na `provider = 'MANUAL'`. Kada Axenita adapter postane dostupan, automatska rezolucija se mora ponovo razmotriti novim ADR-om — višestruki provideri traže eksplicitan izbor.
- **Posljedice:** `03` §8 dobija dva nova error koda; `03` §21 označava polje kao opcionalno i dokumentuje tri slučaja.
- **Security/privacy uticaj:** Ne proširuje pristup integration konfiguraciji; rezolucija se izvršava unutar tenant contexta.
- **Test dokaz:** `08` §18 — nula aktivnih daje 409; dvije aktivne daju 422; jedna aktivna daje 202 uz rezolviran ID u `export_jobs` i u audit eventu.
- **Zavisnosti:** D-017.

---

# D-033 — Tenant context bootstrap kroz user-scoped membership RLS

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** D-023 klauzula 11 uvodi `app_security.set_user_context` i user-scoped RLS nad `platform_role_assignments`, ali ne dotiče `set_request_context`. `02` §16.2 je u baselineu bio `SECURITY DEFINER` sa potpisom `(p_practice_id uuid, p_user_id uuid)`, gdje `p_user_id` dolazi kao argument koji kontroliše poziv. Istovremeno `practice_memberships` nije imao nijednu RLS politiku ni red u `02` §18. Kada se ta tabela stavi pod FORCE RLS — što `02` §27 traži za sve tenant tabele — `SECURITY DEFINER` poziv se izvršava kao owner, ne poklapa se ni sa jednom politikom i vraća nula redova, pa svaka promjena konteksta pada sa `42501`. Bootstrap je cikličan: membership se mora pročitati prije nego `app.practice_id` uopšte postoji.
- **Odluka:**
  1. Potpis, issuer, audience i istek JWT/OIDC tokena verifikuju se **prije** poziva bilo koje database context funkcije. Neverifikovan token ne smije doći do baze.
  2. Verifikovani auth subjekt se rezolvira u `users.id`. Tačan database put te rezolucije je otvoren u D-OPEN-011.
  3. `AuthService` poziva `app_security.set_user_context` isključivo sa autentifikovanim internim `users.id`.
  4. `set_user_context(p_user_id uuid)` postavlja **transakcijski lokalni** `app.user_id` i briše `app.practice_id`. Bez membership validacije — `SYSTEM_ADMIN` nema membership.
  5. `practice_memberships` koristi `ENABLE ROW LEVEL SECURITY` **i** `FORCE ROW LEVEL SECURITY`.
  6. `copilot_app` smije čitati isključivo membership redove koji pripadaju `app.user_id`: `using (user_id = nullif(current_setting('app.user_id', true), '')::uuid)`.
  7. Potpis je `app_security.set_request_context(p_practice_id uuid)`.
  8. `set_request_context` je **SECURITY INVOKER**.
  9. Korisnik se izvodi **isključivo** iz `app.user_id`. Funkcija **ne prima** `p_user_id`.
  10. `app.practice_id` se briše **prije** validacije.
  11. Funkcija verifikuje **aktivan** membership (`active = true`) za `app.user_id` i `p_practice_id`.
  12. `app.practice_id` se postavlja transakcijski lokalno **tek nakon** uspješne validacije.
  13. `copilot_app` nema INSERT, UPDATE ni DELETE grant nad `practice_memberships`.
  14. Na nivou aplikacijske arhitekture samo `AuthService` smije pozivati context funkcije.
  15. Request body, query parametri i nepouzdani headeri **ne smiju** birati `user_id`.
- **Razlog:** SECURITY INVOKER čini membership provjeru predmetom iste politike koja ograničava pozivaoca, pa podmetnut `user_id` ne vraća nijedan red i funkcija pada zatvoreno. Uklanjanje `p_user_id` argumenta strukturno onemogućava da API odabere proizvoljnog korisnika. Brisanje prije validacije uklanja klasu grešaka gdje neuspješan context switch ostavlja prethodni tenant scope.
- **Alternative:** Zadržati `SECURITY DEFINER` uz dodatnu politiku za owner rolu — radi, ali ostavlja `p_user_id` kao argument iz requesta i traži politiku koja propušta sve redove. `ENABLE` bez `FORCE RLS` na `practice_memberships` — owner zaobilazi politiku, ali ruši uniformno pravilo iz `02` §18 i §27. Bez RLS-a nad `practice_memberships` — baseline stanje; svaki korisnik bi mogao čitati tuđe membership redove.
- **Ograničenje:** Mehanizam ograničava normalni query scope i aplikacijske greške, ali **ne autentifikuje korisnika nezavisno nakon kompromitacije dijeljenog `copilot_app` database credentiala**. Napadač sa tim credentialom može sam pozvati `set_user_context` sa proizvoljnim `user_id`. Tačka sprovođenja autorizacije je API, ne baza.
- **Posljedice:** `AuthService` je jedini pozivalac obje funkcije, unutar jedne kratke transakcije. Svaki upit nad `practice_memberships` bez postavljenog `app.user_id` vraća nula redova. Administracija membershipa nije runtime operacija `copilot_app` role u v1. `02` §16.2, §17.3, §18.1 i §20.2 se usklađuju sa ovom odlukom. `07`, `14`, `08`, `09`, `01`, `04` i `05` sadrže zastarjelu formulaciju i moraju se uskladiti.
- **Security/privacy uticaj:** Uklanja request-controlled `user_id`; sprečava čitanje tuđih membership redova; sprečava preživljavanje stale tenant contexta. Jača kontrole T1 i T10.
- **Migration/rollout:** Migration paket `013_rls_policies` kreira obje funkcije i politiku. Primjenjuje se prije prvog tenant upita u fazi 3.
- **Test dokaz:** Negativni testovi:
  - bez postavljenog `app.user_id` — `practice_memberships` vraća nula redova;
  - korisnik A ne može pročitati membership redove korisnika B;
  - neaktivan ili tuđi membership odbija kreiranje konteksta;
  - neuspješan context switch ostavlja `app.practice_id` obrisan;
  - `user_id` poslan u requestu nema nikakav efekat;
  - SECURITY INVOKER izvršavanje ostaje non-owner i `NOBYPASSRLS`.
- **Amandman na:** D-023 klauzula 13.
- **Supersedes:** Svaku raniju dokumentacijsku formulaciju koja opisuje `set_request_context` kao `SECURITY DEFINER` ili koja prima `p_user_id` — uključujući `02` §16.2 baseline tekst, `07` §180 i `14` §50.
- **Zavisnosti:** D-005, D-006, D-023. D-OPEN-011 mora biti zatvoren prije implementacije faze 3 radi tačnog database puta za `users` i `practices`; D-033 i bez toga definiše prihvaćeni membership bootstrap model.

---

# D-034 — Linearni lanac analysis revizija i konkurentno kreiranje revizije

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `02` §10.2 propisuje `unique (encounter_id, revision_number)` i self-FK na `analysis_runs`, ali ne ograničava broj redova koji pokazuju na istog roditelja. D-031 klauzula 6 zadržava status roditelja za `REJECTED`, `FAILED`, `EXTRACTION_FAILED`, `TARIFF_EVALUATION_FAILED` i `CANCELLED`, pa status guard te roditelje nikada ne zatvara. Posljedica: dva reda mogu nositi isti `parent_analysis_run_id` sa različitim `revision_number` vrijednostima, pa historija revizija postaje stablo, a "sljedbenik" roditelja nije jednoznačan. Konkurentno je gore — dva zahtjeva pročitaju isti `MAX(revision_number)`, jedan izgubi na unique constraintu, a naivni retry alocira N+2 i uspije, tiho kreirajući drugo dijete istog roditelja.
- **Odluka:**
  1. Historija analysis revizija je **linearni lanac, ne stablo**.
  2. Svaka revizija ima **najviše jedno direktno dijete**.
  3. Inicijalna revizija ima `revision_number = 1` i `parent_analysis_run_id IS NULL`.
  4. Svaka kasnija revizija ima `revision_number > 1` i `parent_analysis_run_id IS NOT NULL`.
  5. Roditelj i dijete moraju pripadati istom `practice_id` i istom `encounter_id`.
  6. Revizija ne može referencirati samu sebe kao roditelja.
  7. `parent_analysis_run_id` i `revision_number` su **immutable nakon INSERT-a**.
  8. `revision_number` djeteta je uvijek `roditelj.revision_number + 1`. **Nikada se ne računa ponovnim čitanjem `MAX(revision_number)`.**
  9. Zaključavanje roditelja, provjera postojanja djeteta, validacija statusa roditelja, update roditelja, alokacija `revision_number` i INSERT djeteta izvršavaju se **atomarno**, u jednoj transakciji. Roditelj se zaključava prije bilo koje provjere.
  10. Redoslijed provjera:
      - dijete već postoji → **`409 REVISION_CONFLICT`**, bez obzira na status roditelja;
      - dijete ne postoji, status roditelja nije dozvoljen → **`409 INVALID_STATE_TRANSITION`**;
      - dijete ne postoji, status je dozvoljen → kreira se dijete.
  11. Database uniqueness konflikt prevodi se u **`REVISION_CONFLICT`**, nikada u generičku `500` grešku.
  12. **Retry nikada ne smije tiho kreirati reviziju N+2 od istog roditelja.**
- **Schema smjer:**

  ```sql
  create unique index analysis_runs_one_child_per_parent_idx
  on analysis_runs(practice_id, parent_analysis_run_id)
  where parent_analysis_run_id is not null;

  unique (practice_id, encounter_id, id)

  foreign key (practice_id, encounter_id, parent_analysis_run_id)
    references analysis_runs(practice_id, encounter_id, id)

  check (
    (revision_number = 1 and parent_analysis_run_id is null)
    or
    (revision_number > 1 and parent_analysis_run_id is not null)
  )

  check (
    parent_analysis_run_id is null
    or parent_analysis_run_id <> id
  )
  ```

  **Parcijalni indeks namjerno dopušta više `NULL` roditelja**, jer svaki encounter ima vlastitu inicijalnu reviziju sa `parent_analysis_run_id IS NULL`. Klauzula `where parent_analysis_run_id is not null` izuzima te redove iz indeksa u potpunosti. Ovo se **ne** smije zamijeniti sa `NULLS NOT DISTINCT` iz D-030 — tamo je izjednačavanje NULL-ova bilo cilj, ovdje bi dozvolilo samo jednu inicijalnu reviziju u cijeloj tabeli. Razlika je namjerna i ne ujednačava se.

  Trokolonski FK `(practice_id, encounter_id, parent_analysis_run_id)` sprovodi klauzulu 5 na nivou baze i zahtijeva `unique (practice_id, encounter_id, id)` kao cilj.
- **Razlog:** Linearni lanac čini "sljedeću reviziju" jednoznačnom, što approval payload builder, workspace i audit package već pretpostavljaju. Redoslijed provjera — prvo postojanje djeteta, pa status — daje deterministički kod greške nezavisno od toga da li roditelj mijenja status, čime nestaje asimetrija koju je uvela D-031 klauzula 6. Klauzula 8 uklanja klasu grešaka u kojoj retry "popravlja" konflikt tako što preskoči broj.
- **Alternative:** Dozvoliti stablo revizija uz eksplicitan koncept aktivne grane u API-ju i audit paketu (odbijeno — proširuje domenski model bez potrebe); osloniti se samo na `unique (encounter_id, revision_number)` (odbijeno — ne sprečava drugo dijete, samo isti broj).
- **Posljedice:**
  1. `02` §10.2 dobija parcijalni indeks, `unique (practice_id, encounter_id, id)`, trokolonski FK i dva CHECK constrainta.
  2. `02` §19.3 dobija imenovani trigger `analysis_runs_revision_immutable_trg` — `BEFORE UPDATE ON analysis_runs`, `FOR EACH ROW`, bez `WHEN` klauzule, `SECURITY INVOKER`, fiksiran `search_path` — koji odbija izmjenu `parent_analysis_run_id` ili `revision_number` sa SQLSTATE `23514`. Bez njega klauzula 7 ostaje samo namjera.
  3. Migration paket `005_ai_prompts_and_analysis` se dopunjuje; `014_immutability_triggers` dobija novi trigger.
  4. `03` §15.3 se prepisuje prema klauzuli 10; postojeći tekst koji dijeli ponašanje po statusu roditelja je superseded.
- **Security/privacy uticaj:** Nema direktnog. Jednoznačan lanac revizija je preduslov za reproduktivnost iz `00` §2.4 i za audit paket koji tvrdi koja revizija je zamijenila koju.
- **Migration/rollout:** Paketi `005_ai_prompts_and_analysis` i `014_immutability_triggers`.
- **Test dokaz:** Dvije istovremene revision komande nad istim roditeljem daju tačno jedno dijete, a gubitnik `409 REVISION_CONFLICT`; sekvencijalni drugi pokušaj nad `REJECTED` roditeljem koji već ima dijete daje `409 REVISION_CONFLICT`, ne novo dijete; retry nakon unique violationa ne kreira reviziju N+2; roditelj sa nedozvoljenim statusom i bez djeteta daje `409 INVALID_STATE_TRANSITION`; UPDATE nad `revision_number` ili `parent_analysis_run_id` pada sa `23514`; dijete sa drugim `encounter_id` od roditelja pada na FK; red sa `revision_number = 1` i non-NULL roditeljem pada na CHECK.
- **Zavisnosti:** D-015, D-031.
- **Amandman na:** D-031 klauzula 6 — status roditelja se i dalje zadržava, ali zadržani status više ne dozvoljava neograničen broj djece.

---

# D-035 — Semantika otkazivanja analize i encountera

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `03` §15 je za `POST /analyses/{id}/cancel` navodio samo "dozvoljeno samo u aktivnom async stanju" — bez permisije, status kodova i ponašanja pri ponovljenom pozivu. Istovremeno D-027 dozvoljava `ANALYSIS_IN_PROGRESS → CANCELLED` na encounteru, što implicira sudbinu analize koja je u tom trenutku aktivna, a to nigdje nije bilo opisano.
- **Odluka:**

  **Otkazivanje analize**

  1. Endpoint `POST /analyses/{id}/cancel`, permisija **`analysis.cancel`**.
  2. Iz aktivnog async stanja — `QUEUED`, `PREPARING_INPUT`, `EXTRACTING`, `EVALUATING_TARIFF`, `APPLYING_SAFETY_RULES` — → **`202`** uz `CANCELLED` reprezentaciju.
  3. Analiza je već `CANCELLED` → **`200`** uz postojeću reprezentaciju i **bez ikakve promjene stanja**.
  4. Bilo koje drugo neaktivno ili terminalno stanje → **`409 INVALID_STATE_TRANSITION`**.
  5. `Idempotency-Key` **nije obavezan**; komanda je state-idempotentna.
  6. **Ponovljeno otkazivanje ne kreira dodatnu audit mutaciju.** Audit event se upisuje isključivo pri stvarnom prelasku u `CANCELLED`.

  **Otkazivanje encountera**

  7. `POST /encounters/{id}/cancel` iz `ANALYSIS_IN_PROGRESS` **atomarno** otkazuje tekuću aktivnu analizu i encounter.
  8. **Tekuća aktivna analiza** je vrh linearnog lanca revizija (D-034) — revizija bez djeteta — čiji je status jedan od aktivnih async statusa iz klauzule 2.
  9. **`encounter.cancel` autorizuje kompletnu komandu i njenu internu kaskadu.**
  10. **`analysis.cancel` se ne traži dodatno** za internu kaskadu.
  11. Ova odluka **ne dodjeljuje nijednu permisiju konkretnoj roli**; kompletna role matrica pripada `docs/15`.
  12. **Historijske i terminalne revizije ostaju nepromijenjene** — `REJECTED`, `FAILED`, `SUPERSEDED`, `EXTRACTION_FAILED`, `TARIFF_EVALUATION_FAILED` i ranije `CANCELLED` revizije zadržavaju svoj status.
  13. Audit bilježi tranziciju analize i tranziciju encountera kao **dva odvojena eventa**.
  14. **Ako otkazivanje aktivne analize ne uspije, kompletno otkazivanje encountera se rollback-uje.**
  15. **Djelimičan ishod nije dozvoljen.**
- **Razlog:** Kaskada bez rollbacka ostavila bi otkazan encounter sa analizom koja i dalje radi i troši AI i tarifne resurse. Traženje `analysis.cancel` uz `encounter.cancel` blokiralo bi rolu koja smije otkazati kontakt, a nema operativnu permisiju nad pipelineom. Ograničenje na tekuću aktivnu analizu čuva audit trag zbog kojeg su terminalni statusi u D-031 uopšte zadržani. Klauzula 6 sprečava da ponovljeni klijentski poziv proizvede lažan trag višestrukog otkazivanja.
- **Alternative:** Klijent prvo otkazuje analizu, pa encounter — dva poziva i dvije permisije (odbijeno, jer encounter tada nikada ne prelazi direktno iz `ANALYSIS_IN_PROGRESS` kako `03` §29.1 propisuje); kaskada uz obje permisije (odbijeno — vidi razlog); `204` umjesto `200` pri ponovljenom otkazivanju (odbijeno — klijent treba reprezentaciju).
- **Posljedice:** `03` §12 i §15.4 se dopunjuju klauzulama 6 i 12–15. `02` ne mijenja šemu.
- **Security/privacy uticaj:** Sprečava zombie pipeline nad otkazanim kontaktom i lažan audit trag ponovljenog otkazivanja.
- **Test dokaz:** Ponovljeni cancel ne kreira drugi audit event; cancel iz terminalnog stanja ne mijenja stanje i vraća `409`; kaskada upisuje dva audit eventa; simulirani neuspjeh otkazivanja analize ostavlja encounter neizmijenjen; terminalne revizije ostaju netaknute nakon kaskade.
- **Zavisnosti:** D-027, D-031, D-034.
- **Amandman na:** D-027 — tranzicija `ANALYSIS_IN_PROGRESS → CANCELLED` dobija eksplicitnu kaskadnu semantiku.

---

# D-036 — Izvođenje permisija za analysis decisions

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `POST /analyses/{analysisId}/decisions` prima četiri tipa odluke — `SAVE_DRAFT`, `REQUEST_CHANGES`, `REJECT` i `APPROVE` — ali `03` §20 navodi permisiju samo za `APPROVE`. Aktivni katalog nema `analysis.reject` ni `analysis.review`, pa je taj endpoint ostao jedini aktivni endpoint bez potpunog pravila izvođenja, što krši pravilo iz `03` §28.3. Korištenje `analysis.read` za write radnju nije prihvatljivo — read permisija ne smije autorizovati upis u `review_decisions`.
- **Odluka:**
  1. `APPROVE` → **`analysis.approve`**.
  2. `REJECT` → **`analysis.review_decision`**.
  3. `REQUEST_CHANGES` → **`analysis.review_decision`**.
  4. `SAVE_DRAFT` → **`analysis.review_decision`**.
  5. Uvodi se nova aktivna permisija **`analysis.review_decision`**.
  6. Aktivni katalog raste sa 31 na **32** permisije. Rezervisani katalog ostaje na **3**.
  7. **Nijedna write radnja ne smije biti autorizovana kroz `analysis.read`.**
  8. Ova odluka **ne dodjeljuje permisije rolama**; kompletna role matrica pripada `docs/15`.
- **Razlog:** `REJECT`, `REQUEST_CHANGES` i `SAVE_DRAFT` upisuju `review_decisions` red i mijenjaju tok pregleda, pa su write radnje i traže vlastitu write permisiju. `APPROVE` ostaje odvojen jer nosi pravnu težinu odobrenja i pokreće immutable approval payload (D-016); rola koja smije tražiti izmjene ne mora smjeti odobriti obračun.
- **Alternative:** Sve četiri odluke pod `analysis.approve` (odbijeno — blokira recenzenta bez prava odobravanja da uopšte zabilježi `REQUEST_CHANGES`); `analysis.read` za tri ne-approve odluke (odbijeno — read permisija ne autorizuje upis); zasebne `analysis.reject`, `analysis.request_changes` i `analysis.save_draft` (odbijeno — dijele isti nivo ovlaštenja, tri permisije bi bile dekorativne).
- **Posljedice:** `03` §20 dobija pravilo izvođenja po tipu odluke; `03` §28.1 raste na 32 permisije; `03` §28.3 gubi izuzetak iz pravila 2, a blockquote "Otvorena stavka" se briše. `docs/15` mora dodijeliti `analysis.review_decision` rolama koje učestvuju u pregledu.
- **Security/privacy uticaj:** Uklanja aktivni endpoint bez potpunog authorization pravila i sprečava da read permisija autorizuje upis.
- **Test dokaz:** Rola sa `analysis.review_decision` a bez `analysis.approve` može poslati `REJECT`, `REQUEST_CHANGES` i `SAVE_DRAFT`, ali na `APPROVE` dobija `403`; rola sa samo `analysis.read` dobija `403` na sve četiri odluke.
- **Zavisnosti:** D-016, D-031.

---

# D-037 — Error mapping za export bez važećeg approvala

- **Status:** ACCEPTED
- **Datum:** 2026-08-02
- **Kontekst/problem:** `03` §8 katalog sadrži `APPROVAL_REQUIRED` i `APPROVAL_REVOKED`, ali nijednom kodu nikada nije bio dodijeljen HTTP status. `03` §21 propisuje da export zahtijeva aktivan, neopozvan approval, pa je ponašanje pri neispunjenom uslovu bilo nedefinisano. D-028 je zatvorio status kodove za idempotency i `If-Match`, ali ne i za approval.
- **Odluka:**
  1. Export bez aktivnog, neopozvanog approvala → **`409 APPROVAL_REQUIRED`**.
  2. Kada eksplicitno referencirani approval postoji, ali je opozvan → **`409 APPROVAL_REVOKED`**.
- **Razlog:** Oba slučaja su konflikt stanja resursa, ne greška validacije bodyja, pa `409` odgovara semantici iz `03` §9. Razdvajanje dva koda čini razliku vidljivom klijentu: u prvom slučaju approval treba kreirati, u drugom je postojao i namjerno je povučen, što je informacija koju bi generički kod izgubio.
- **Alternative:** Jedan kod za oba slučaja (odbijeno — klijent ne može razlikovati "nikad odobreno" od "odobrenje povučeno"); `422` (odbijeno — nije semantička greška bodyja); `412` (odbijeno — nije precondition header, a ta porodica je u D-028 vezana za `If-Match`).
- **Posljedice:** `03` §21 dobija oba mapiranja. Generisani client razlikuje dva `409` slučaja po `code` polju, ne po statusu.
- **Security/privacy uticaj:** Nema. Nijedan od kodova ne otkriva sadržaj approvala.
- **Test dokaz:** `08` §18 — export nad analizom bez approvala daje `409 APPROVAL_REQUIRED`; export koji referencira opozvan approval daje `409 APPROVAL_REVOKED`.
- **Zavisnosti:** D-016, D-028.
- **Amandman na:** D-028 — katalog statusa se proširuje mapiranjem za approval greške.

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

- **Status:** SUPERSEDED by D-025 (2026-08-02) — djelimično. Format ciphertexta, IV/tag kolone i AAD su zaključani u D-025. Izbor KMS providera i rotation cadence ostaju otvoreni i preseljeni su u D-OPEN-004a.
- **Historijska preporuka:** AES-256-GCM envelope encryption; DEK po dokumentu ili kontrolisanoj grupi; KEK u KMS.
- **Historijski otvorena pitanja:** format ciphertexta, IV/tag kolone, rotation, access.

## D-OPEN-004a — KMS provider i rotation cadence

- **Status:** DEFERRED
- **Izdvojen iz:** D-OPEN-004, 2026-08-02.
- **Potrebno odlučiti:** KMS provider, granularnost KEK-a, rotation cadence, recovery procedura, access audit.
- **Vezano za:** produkcijski hosting (D-OPEN-002, `13` §4) — provider se bira zajedno sa hosting odlukom.
- **MVP:** D-025 koristi verzionisani aplikacijski ključ iz secrets managera i local static key adapter za development. Local static key nikada nije produkcijski spreman.
- **Uslovna revizija:** Ako D-OPEN-007 zahtijeva crypto-shredding, prelazak na per-row DEK je obavezan prije pilota (D-025).

## D-OPEN-005 — ESM ili CommonJS

- **Status:** SUPERSEDED by D-021 (2026-08-02).
- **Historijska preporuka:** ESM/NodeNext ako Nest/Prisma baseline testovi prolaze.
- **Historijski rok:** Faza 1–2. D-021 ga sužava na fazu 1, u skladu sa `13` §2.
- **Ishod:** ESM/NodeNext, uz vremenski ograničen spike u fazi 1 i unaprijed odobren CommonJS fallback koji zahtijeva superseding ADR prije faze 2.

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

## D-OPEN-011 — Runtime access model za `users` i `practices`

- **Status:** MUST DECIDE BEFORE PHASE 3
- **Kontekst:**
  - `users.auth_subject` se mora rezolvirati u `users.id` **prije** nego što `app.user_id` postoji, pa ta rezolucija ne može zavisiti od user-scoped politike koja tek treba biti postavljena;
  - `practices` sadrži osjetljive identifikatore, uključujući ZSR broj (`02` §6.1);
  - nijedna od dvije tabele ne smije se tretirati kao neograničen globalni runtime-čitljiv podatak;
  - `02` §28.2 ovo trenutno vodi kao neriješeno.
- **Potrebno odlučiti:**
  - tačan ograničen database put za verifikovani `auth_subject` → `users.id`;
  - self-scoped pristup `users` redu autentifikovanog korisnika;
  - pristup `practices` tek nakon uspješne membership validacije i postavljenog `app.practice_id`;
  - da li se koristi grant, RLS politika ili usko ograničena resolver funkcija;
  - negativni testovi i ograničenja pri kompromitaciji database credentiala.
- **Ne bira se prećutno:** `SECURITY DEFINER`, neograničen `SELECT` ni pristup bez RLS-a. Nijedna od tih opcija nije prihvaćena ovim ADR-om — odluka ostaje eksplicitno otvorena.
- **Vezano za:** D-033 (membership bootstrap koji ovu rezoluciju poziva), D-023, D-006.
- **Potrebno do:** prije implementacije faze 3.

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
