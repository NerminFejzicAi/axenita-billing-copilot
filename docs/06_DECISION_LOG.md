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
- **Dopuna (D-050, 2026-08-14):** Kanonski **mehanizam autorstva** migracija definisan je u D-050: `prisma migrate diff --from-config-datasource --to-schema=... --script -o ...`, uz ručnu dopunu custom SQL-a, ljudski pregled, validaciju na jednokratnoj praznoj bazi i primjenu kroz `prisma migrate deploy`. `prisma migrate dev --create-only` **nije** kanonski mehanizam za ovaj repozitorij. Podjela odgovornosti iz ove odluke — Prisma za modele/client, migration SQL za native security — ostaje nepromijenjena. Vidi D-050.

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
- **Dopuna (D-054, 2026-08-17):** Imena **`PracticeContextGuard`** i **`TenantDatabaseService`** iz ove odluke su **koncepti**, ne obavezni framework artefakti, a historijski potpis `TenantDatabaseService.run(practiceId, userId, callback)` **nije normativan**. Sigurnosni **sadržaj** ove odluke — PracticeContext, tenant facade, RLS, composite FK i interaktivna transakcija — ostaje **nepromijenjen i ne slabi se**. Pri konfliktu imena i redoslijeda, zamrznuti redoslijed iz `03` §3.7.1 i D-047, klauzule 10 je **nadređen**. Obavezna svojstva svake buduće konkretne implementacije su D-054, klauzule 6–10. Vidi D-054.

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
- **Amandman (D-051, 2026-08-14) — isključivo vlasništvo paketa i faze:** User-scoped RLS nad `platform_role_assignments` iz klauzule 11 (`02` §17.2) premješta se iz paketa `013_rls_policies`/faze 4 u paket **`002_identity_and_practices`/fazu 3**. Imena i tijela politika `platform_role_assignments_self_select` i `platform_role_assignments_system_select` ostaju **identična**; `copilot_system` zadržava `SELECT` + `USING (true)`; `PUBLIC` nema pristup; nijedan novi write grant se ne uvodi. **Invarijanta klauzule 11 — `copilot_app` NEMA neograničen SELECT nad `platform_role_assignments` — važi od faze 3 nadalje.** Dodatno pojašnjenje: `platformRoles[]` u `GET /me` predstavlja tekuće dodjele, pa doprinose isključivo redovi sa `revoked_at IS NULL`; revoke administracijski put se ovim **ne uvodi**. Vidi D-051.

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
- **Dopuna (D-060, 2026-08-22) — tijelo ove odluke se ne mijenja.** D-060 uvodi **namjenski HMAC ključ `K_hmac`**, odvojen od ključa podataka `K_enc` iz ove odluke, i **zabranjuje** upotrebu `K_enc` za HMAC. Razlog je klauzula 7 ove odluke: re-enkripcija pri rotaciji **ne mijenja `*_hash` kolone**, pa `*_hash` ne smije zavisiti od `K_enc` — inače bi rotacija razbila deterministički lookup identitet. D-060 takođe utvrđuje da ponovni pokušaj redakcije mora koristiti **svjež IV**, što je primjena klauzule 6, ne izuzetak od nje. **Nijedna klauzula 1–14 se ne mijenja, ne slabi ni ne opoziva.** Vidi D-060.

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
- **Amandman (D-049, 2026-08-14) — fazni dio klauzule 4 je POVUČEN:** Tvrdnja da puni `PATCH /practices/{practiceId}/settings` pripada **fazi 3**, a time i tvrdnja da optimistic locking počinje u fazi 3, **više ne važi**. Settings runtime put — `GET`, `PATCH`, `ETag`, `If-Match`, `428`, `409 VERSION_CONFLICT` i atomičan inkrement `version` — pripada **fazi 4** i paketu `013_rls_policies`. **Klauzule 1–3 ostaju u cijelosti nepromijenjene**: `409 REQUEST_ALREADY_IN_PROGRESS` za idempotency u toku, `428 PRECONDITION_REQUIRED` za nedostajući `If-Match`, `425` se ne koristi, `428` ostaje u tabeli `03` §9. Ne smije se tvrditi da klauzula 4 ostaje nepromijenjeno zadovoljena. Vidi D-049.

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
- **Amandman (D-049, 2026-08-14) — isključivo vrijeme implementacije i testiranja:** **Schema odluka ostaje prihvaćena i nepromijenjena** — `practice_settings` i dalje dobija `version integer not null default 1` i `check (version >= 1)` u paketu `002_identity_and_practices`, faza 3. Mijenja se isključivo ono što je naslijedilo raniju faznu pripadnost iz D-028 klauzule 4: **runtime optimistic-locking testovi za `practice_settings` pripadaju fazi 4**, zajedno sa `GET`/`PATCH` settings rutama. Tvrdnja iz `Posljedice` da „optimistic locking počinje u fazi 3" više ne važi. Za preostalih pet resursa iz obuhvata ništa se ne mijenja. Vidi D-049.

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
- **Dopuna (D-050, 2026-08-14) — isključivo mehanizam autorstva:** Formulacija „`--create-only` migration SQL" iz klauzule 2 `Posljedica` čita se od sada kroz D-050: constraint se piše kao **ručno dopunjen custom SQL u `migration.sql` fajlu paketa**, autorisan kroz `prisma migrate diff`. Schema semantika, `NULLS NOT DISTINCT` i pravilo da se očekivani drift **ne ispravlja** ostaju **nepromijenjeni**. Vidi D-050, klauzulu 4.

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
- **Amandman (D-047, 2026-08-12) — isključivo vlasništvo paketa, bez izmjene sigurnosne semantike:** Klauzula 2 je ispunjena — tačan database put `auth_subject` → `users.id` definisan je u D-047, klauzulama 1–4, kao `set_auth_subject_context` uz bootstrap RLS politiku nad `users`, bez `SECURITY DEFINER`. Kreiranje funkcije `app_security.set_user_context` premješta se iz migration paketa `013_rls_policies` u paket **`002_identity_and_practices`**, jer faza 3 već zahtijeva autentifikovan user context, a `02` §22.13 i `04` §6.2.3 su po tom pitanju bili u međusobnom neslaganju (D-047, klauzula 17). **Nijedna klauzula 1–15 ove odluke se ne mijenja**; tijela, potpisi, `SECURITY INVOKER` mod, brisanje prije validacije, validacija aktivnog membershipa i ograničenja pozivaoca za `set_user_context` i `set_request_context` ostaju **identični**. `set_request_context` ostaje u paketu `013` i u fazi 4, zajedno sa `practice_memberships` politikom iz klauzula 5–6.

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

# D-038 — Multi-role tenant membership i kompozicija efektivnih permisija

- **Status:** ACCEPTED
- **Datum:** 2026-08-04
- **Kontekst/problem:** Trenutni model ima jedan `practice_memberships` red po ordinaciji i korisniku, singularnu kolonu `practice_memberships.role` i `unique (practice_id, user_id)`. Takav model dopušta **tačno jednu tenant rolu po korisniku po ordinaciji**. Ne može predstaviti korisnika koji je legitimno istovremeno `PRACTICE_ADMIN` i `PHYSICIAN`, `PHYSICIAN` i `BILLING_SPECIALIST`, ili neku drugu prihvaćenu kombinaciju. Nasljeđivanje rola je odbijeno jer bi svakog `PRACTICE_ADMIN`-a učinilo klinički ovlaštenim. Per-membership permission override je odbijen jer bi stvorio drugi, teško auditabilan authorization sistem izvan role matrice.
- **Odluka:**
  1. Zadržava se **tačno jedan** `practice_memberships` red po korisniku i ordinaciji.
  2. `role` se u kasnijoj schema izmjeni **uklanja** kao singularni atribut `practice_memberships`.
  3. Uvodi se `practice_membership_roles` kao izvor dodjele tenant rola.
  4. Jedan membership može nositi **nula, jednu ili više** tenant aplikacijskih rola.
  5. Svaka rola se za jedan membership može pojaviti **najviše jednom**.
  6. Prihvaćeni katalog tenant rola ostaje nepromijenjen: `PRACTICE_ADMIN`, `PHYSICIAN`, `MPA`, `BILLING_SPECIALIST`, `AUDITOR`, `READ_ONLY`.
  7. **Efektivne tenant permisije su unija** permisija koje daju sve aktivne tenant role dodijeljene aktivnom membershipu za tekuću ordinaciju.
  8. Unija permisija važi **isključivo** između tenant rola istog membershipa i iste ordinacije.
  9. `DENY` ćelija u role matrici znači da ta rola **ne doprinosi grant** za tu permisiju. **Nije negativni override** koji poništava `ALLOW` dobijen od druge dodijeljene tenant role.
  10. U v1 **nema per-user permission overrida**.
  11. U v1 **nema implicitnog nasljeđivanja rola**.
  12. `platformRoles` se **nikada** ne spajaju unijom sa tenant rolama.
  13. `SYSTEM_ADMIN` **ne dobija** tenant permisije kroz svoju platform rolu.
  14. `SYSTEM_ADMIN` smije koristiti tenant permisije **samo** kada isti korisnik ima i aktivan membership u toj ordinaciji i potrebnu dodjelu tenant role.
  15. `copilot_system`, `copilot_app` i `copilot_migrator` su **database role** i nikada ne učestvuju u kompoziciji aplikacijskih permisija.
  16. Neaktivan `practice_memberships` red **ne doprinosi** nijednu tenant rolu ni tenant permisiju.
  17. Aktivan membership sa **nula** dodijeljenih rola ne autorizuje nijednu tenant operaciju. Autorizacija je **deny-by-default**.
  18. Uslovne permisije zahtijevaju **oboje**: dodijeljenu rolu koja je podobna za tu permisiju **i** odgovarajuću prihvaćenu practice postavku ili runtime uslov. Konkretno: `MPA` odobravanje zahtijeva `allow_mpa_approval = true`; `BILLING_SPECIALIST` odobravanje zahtijeva `allow_billing_specialist_approval = true`.
  19. Dodjele rola **nikada ne prelaze granicu ordinacije**.
  20. Autorizacija evaluira role **tek nakon** uspješnog D-033 tenant bootstrapa.
  21. D-033 `set_request_context(p_practice_id uuid)` ostaje **nepromijenjen**: validira aktivan membership; ne prima rolu; ne prima `user_id`; ne uspostavlja platform context.
  22. `practice_membership_roles` zahtijeva **user-scoped bootstrap-readable pristup** za `GET /me` i enumeraciju vlastitih membershipa autentifikovanog korisnika.
  23. Bootstrap-readable pristup nad `practice_membership_roles` **nije** generički role-administration pristup i **ne rješava D-OPEN-011**.
  24. Generička dodjela rola i administracija practice membershipa ostaju **izvan aktivnog v1 runtime permission kataloga** dok ne budu zasebno prihvaćene.
  25. `practice_membership_roles` čuva **isključivo trenutno efektivne dodjele** tenant rola.
  26. Tabela **nije append-only history tabela**.
  27. U v1 uklanjanje role **briše** odgovarajući trenutni red dodjele.
  28. Ponovna dodjela iste role kasnije **kreira novi trenutni red dodjele**.
  29. Prihvaćeni constraint ostaje **`unique (practice_id, membership_id, role)`** i klauzula 27 ga ne mijenja — brisanjem reda par se oslobađa, pa ponovna dodjela iz klauzule 28 ne pada na tom constraintu.
  30. Historijski dokaz dodjele i uklanjanja pripada **audit tragu**, a ne zadržanim opozvanim redovima dodjele.
  31. Kada budući prihvaćeni role-administration put bude uveden, **svaka** dodjela i **svako** uklanjanje moraju proizvesti auditabilan dokaz koji sadrži najmanje: aktera; ordinaciju; membership; rolu; radnju; vrijeme; prethodno i rezultujuće stanje dodjele; i authorization put.
  32. U v1 se **ne uvode**: `revoked_at`; `revoked_by`; `active` na `practice_membership_roles`; `valid_from` / `valid_to`; append-only historija dodjele rola; per-user permission overrid.
  33. Aktivnost membershipa ostaje u vlasništvu **`practice_memberships.active`**, ne kolone na `practice_membership_roles`.
  34. Deaktivacija vlasničkog membershipa čini da **sve** pripadajuće role dodjele doprinose **nula** efektivnih permisija, čak i kada ti redovi ostanu pohranjeni. Ovo je posljedica klauzule 16 i ne zahtijeva brisanje role redova.
  35. Brisanje trenutnog role reda uz upis mutacije u audit **nije isto** što i brisanje audit historije. Audit zapisi ostaju **immutable** prema prihvaćenom audit modelu.
  36. Generička runtime dodjela i uklanjanje rola ostaju **izvan aktivnog v1 permission kataloga** dok ne budu zasebno prihvaćeni; klauzula 24 se ovim potvrđuje, ne mijenja.
  37. Ovo pojašnjenje **ne kreira** endpoint, komandu ni API permisiju za role administration.
- **Napomena o pojašnjenju:** Klauzule 25–37 pojašnjavaju **životni ciklus dodjela** unutar već prihvaćenog D-038. One **ne mijenjaju** nijednu klauzulu 1–24, **ne uvode novi ADR**, **ne mijenjaju** D-023 ni D-033, **ne uvode** nijednu permisiju ni endpoint i **ne rješavaju D-OPEN-011**. Vlasništvo migration paketa ostaje nepromijenjeno.
- **Posljedica za API contract:** `GET /me` mijenja `memberships[].role: string` u `memberships[].roles: membership_role[]`. Niz `roles` mora sadržavati **jedinstvene** vrijednosti; koristiti **isključivo** prihvaćene `membership_role` vrijednosti; imati **deterministički redoslijed**; predstavljati **samo** role pripadajućeg membershipa; i **nikada** uključivati `platformRoles`. `platformRoles` ostaje **zaseban top-level blok**.
- **Schema smjer:** Kasnija `02` izmjena uvodi `practice_membership_roles` sa najmanje: aplikacijski generisanim `id`; `practice_id`; `membership_id`; `role`; timestampovima prema projektnim konvencijama; `unique (practice_id, id)`; `unique (practice_id, membership_id, role)`; i composite FK `(practice_id, membership_id)` → `practice_memberships(practice_id, id)`. **Tačna schema pripada kasnijoj `02` izmjeni, ne ovom Decision Log batchu.**
- **Razlog:** Unija dodijeljenih rola je jedini model koji dopušta da ordinacija izrazi "administrator **i** ljekar" bez da svaki administrator postane klinički ovlašten. Klauzula 9 čuva least-privilege čitljivost matrice: rola ili doprinosi grant ili ne doprinosi ništa, pa se efektivne permisije mogu izračunati bez rezolucije konflikata. Klauzule 12–15 čuvaju razdvajanje uvedeno u D-023 i D-033.
- **Alternative:**
  1. Nasljeđivanje `PHYSICIAN` permisija u `PRACTICE_ADMIN` — odbijeno jer čini nekliničke administratore klinički ovlaštenim.
  2. Tabela individualnih permission overrida — odbijena jer stvara teško provjerljive izuzetke izvan normativne role matrice.
  3. Clinical-eligibility boolean — odbijen jer rješava samo jednu kombinaciju rola i postaje drugi authorization model.
  4. Odvojeni korisnički nalozi za administrativni i klinički rad — odbijeni jer štete upotrebljivosti, kontinuitetu audit identiteta i operativnoj sigurnosti.
- **Posljedice:** Kasnije kontrolisane izmjene su obavezne u: `02` (schema i RLS); `03` (`GET /me` contract i authorization pravila); `04` (implementacijski plan); `05` (checklist); `07` (fazni promptovi); `08` (test fixtures i pokrivenost). `14` ne zahtijeva izmjenu zbog kompozicije rola, osim ako neki budući dijagram eksplicitno prikazuje `memberships[].role`. Zbog klauzula 25–37, `02` §6.3a se **mora kasnije uskladiti** tako da se ukloni formulacija koja ovu interakciju constrainta ostavlja neodlučenom; `04` **već odražava** ovaj prihvaćeni smjer i ne zahtijeva izmjenu u ovom batchu. **D-OPEN-011 ostaje otvoren i nepromijenjen.**
- **Security/privacy uticaj:** Dodjela i uklanjanje role moraju biti auditabilni. Osjetljive authorization odluke moraju ostati reproducibilne iz: aktera, ordinacije, aktivnog membershipa, dodijeljenih tenant rola, tražene permisije i relevantnih uslovnih practice postavki. **Nije dozvoljeno implicitno zaključivanje role** iz naziva radnog mjesta, email domene, platform role ni database role. Multi-role kompozicija **ne slabi** cross-tenant izolaciju.
- **Migration/rollout:** Vlasništvo ostaje `002_identity_and_practices`. **Ne uvodi se novi broj migration paketa.** Projekat nema produkcijske podatke, pa produkcijska backfill strategija nije potrebna. Seed i fixture podaci moraju kreirati **eksplicitne** membership-role redove.
- **Test dokaz:** Kasniji testovi moraju dokazati:
  - jedan membership može imati više jedinstvenih rola;
  - duplirana dodjela iste role je odbijena;
  - dodjela role ne može referencirati membership u drugoj ordinaciji;
  - neaktivan membership ne daje nijednu efektivnu permisiju;
  - aktivan membership sa nula rola ne daje nijednu efektivnu permisiju;
  - `PHYSICIAN` + `PRACTICE_ADMIN` dobija uniju tih tenant permisija;
  - `DENY` u jednoj roli ne poništava `ALLOW` iz druge dodijeljene tenant role;
  - `platformRoles` nikada ne doprinose tenant permission uniji;
  - `SYSTEM_ADMIN` bez aktivnog tenant membershipa dobija `403`;
  - uslovno odobravanje i dalje zahtijeva odgovarajući practice flag;
  - `GET /me` vraća `roles[]` odvojeno od `platformRoles`;
  - dodjele rola jedne ordinacije ne mogu uticati na drugu;
  - enumeracija rola kroz bootstrap politiku izlaže isključivo vlastite membership role autentifikovanog korisnika;
  - uklanjanje role **briše** trenutni red dodjele;
  - ista rola se **može ponovo dodijeliti** nakon uklanjanja, bez sudara sa `unique (practice_id, membership_id, role)`;
  - deaktivacija vlasničkog membershipa daje **nula** efektivnih permisija dok role redovi ostaju pohranjeni.
- **Zavisnosti:** D-023, D-033, D-035, D-036, D-OPEN-011.

---

# D-039 — Definicije tenant rola i osnovne workflow permisije

- **Status:** ACCEPTED
- **Datum:** 2026-08-05
- **Kontekst/problem:** D-038 je prihvatio multi-role model i pravilo kompozicije, ali nijedna konkretna dodjela permisija rolama nije bila prihvaćena. Od 32 aktivne permisije samo dvije su imale prihvaćenog vlasnika — `integration.read` (D-032, klauzula 8) i `tariff.manage` (D-023, klauzula 9). Bez prihvaćene matrice implementacija bi morala pogađati grantove, a `03` §28.4 i `08` §17.1 izričito zabranjuju dodjelu permisija rolama izvan prihvaćene odluke.
- **Odluka:** Ovaj ADR prihvata **tačno deset** osnovnih workflow permisija. Matrica je normativna i potpuna — nijedna ćelija nije prazna ni `OPEN`.

| Permisija | PRACTICE_ADMIN | PHYSICIAN | MPA | BILLING_SPECIALIST | AUDITOR | READ_ONLY | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|---|
| `patient_reference.read` | DENY | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY |
| `patient_reference.create` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY |
| `encounter.read` | DENY | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY |
| `encounter.create` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY |
| `encounter.update` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY |
| `encounter.document.list` | DENY | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY |
| `encounter.document.read` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY |
| `encounter.document.create` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY |
| `analysis.read` | DENY | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY |
| `analysis.run` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY |

**Definicije rola (v1):**

1. `PHYSICIAN` — klinički ovlašten korisnik; nosi punu kliničku radnu putanju.
2. `MPA` — medicinski asistent; nosi unos, dokumentaciju i pokretanje analize, ali nema kliničku odluku ni korekciju.
3. `BILLING_SPECIALIST` — obračunska uloga; čita pacijentsku referencu, encounter, listu dokumenata i analizu radi provjere obračuna.
4. `PRACTICE_ADMIN` — **isključivo administrativna** rola (D-039 klauzula 6, detaljno u D-044). Ne dobija nijednu kliničku permisiju iz ovog ADR-a.
5. `AUDITOR` — nadzorna rola; obuhvat je u D-043.
6. `READ_ONLY` — zadržana u `membership_role` enumu, ali je u v1 **deny-all**; ne dobija nijednu aktivnu permisiju.
7. `SYSTEM_ADMIN` — platform rola; **ne dobija nijednu tenant permisiju** (D-038, klauzula 13).

**Odluka o `READ_ONLY` (Q4):** enum vrijednost se **zadržava** u `02` §4.1. Uklanjanje bi tražilo izmjenu prihvaćenog enum kataloga i migraciju, bez dobiti. Rola ostaje neaktivna dok joj se zaseban ADR ne dodijeli profil.

- **Negativna ograničenja:**
  - `PRACTICE_ADMIN` **ne dobija** nijednu od ovih deset permisija samo zato što je administrator;
  - korisnik kojem treba i klinička ovlast **mora zasebno nositi `PHYSICIAN`** kroz D-038 multi-role membership;
  - `BILLING_SPECIALIST` **ne dobija** `encounter.document.read` — obračunska provjera se oslanja na izvučene service kandidate, ne na klinički tekst;
  - `BILLING_SPECIALIST` **ne dobija** `patient_reference.create`, `encounter.create` ni `encounter.update`;
  - `AUDITOR` i `READ_ONLY` **ne dobijaju nijednu** od ovih deset permisija;
  - `SYSTEM_ADMIN` **ne dobija nijednu** tenant permisiju kroz platform rolu.
- **Semantika matrice (D-038, klauzule 7–11):** efektivne permisije su **unija** `ALLOW` grantova dodijeljenih tenant rola istog aktivnog membershipa i iste ordinacije. `DENY` **ne doprinosi** grant i **ne poništava** `ALLOW` druge dodijeljene role. `platformRoles` se nikada ne spajaju unijom sa tenant rolama. Database role (`copilot_app`, `copilot_migrator`, `copilot_system`) **nikada nisu kolone ove matrice**. Neaktivan membership i aktivan membership sa nula rola doprinose **nula** permisija.
- **Razlog:** Podjela `PHYSICIAN` / `MPA` / `BILLING_SPECIALIST` prati stvarni tok rada u ordinaciji: asistent priprema i pokreće, ljekar odlučuje, obračunska uloga provjerava rezultat. Administrativna rola je namjerno odvojena da administracija ne bi tiho postala klinička ovlast — što je upravo defekt koji je D-038 otvorio.
- **Alternative:** Dati `PRACTICE_ADMIN` puni tenant read (odbijeno — protivno `09` §3 data minimization i prijetnji T10); ukloniti `READ_ONLY` iz enuma (odbijeno — mijenja prihvaćeni katalog bez dobiti); dati `BILLING_SPECIALIST` pristup dokumentima (odbijeno u v1 — klinički tekst je Class A prema `09` §2).
- **Security/privacy uticaj:** Klinički dokumenti (`09` Class A) ostaju dostupni isključivo `PHYSICIAN` i `MPA` rolama. Nijedna nadzorna ni administrativna rola ne dobija klinički read kroz ovaj ADR. Least privilege iz `09` §6 je očuvan.
- **Operativni nedostaci:** `BILLING_SPECIALIST` ne može otvoriti dokument da provjeri da li dokumentacija podupire obračunatu uslugu; takav upit zahtijeva `PHYSICIAN`. Ordinacija u kojoj je administrator ujedno i ljekar mora eksplicitno dodijeliti obje role.
- **Implementacijske posljedice:** Matrica se materijalizuje u budućem `docs/15`; resolver iz `04` §6.4.1 je konzumira. Ne uvodi se nijedan endpoint, permisija, schema kolona, database rola ni migration paket.
- **Test dokaz:** Za svaku od deset permisija — pozitivan test za svaku `ALLOW` rolu i negativan `403` test za svaku `DENY` rolu; test da `PRACTICE_ADMIN` bez `PHYSICIAN` dobija `403`; test da `PRACTICE_ADMIN` **sa** `PHYSICIAN` dobija uniju; test da `READ_ONLY` dobija `403` na svih deset; test da `SYSTEM_ADMIN` bez aktivnog membershipa dobija `403`.
- **Zavisnosti:** D-023, D-032, D-036, D-038.
- **Dokumenti za kasniju rekonsilijaciju:** `docs/15` (kreiranje matrice); `03` §28.4; `05` Faze 3–4; `07` Faza 3; `08` §24.8.

---

# D-040 — Kliničke i obračunske korekcije i rješavanje findinga

- **Status:** ACCEPTED
- **Datum:** 2026-08-05
- **Kontekst/problem:** Korekcije mijenjaju sadržaj analize prije odobrenja, a `finding.resolve` zatvara sigurnosni nalaz. Nijedna od te tri permisije nije imala prihvaćenog vlasnika. `finding.resolve` je dodatno grub jer jedna permisija pokriva tri različita ishoda.
- **Odluka:**

| Permisija | PRACTICE_ADMIN | PHYSICIAN | MPA | BILLING_SPECIALIST | AUDITOR | READ_ONLY | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|---|
| `analysis.correct_fact` | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| `analysis.correct_service` | DENY | ALLOW | DENY | ALLOW | DENY | DENY | DENY |
| `finding.resolve` | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |

**Granularnost `finding.resolve` (Q6):** permisija ostaje **gruba** i pokriva sva tri ishoda — `RESOLVED`, `ACCEPTED_RISK` i `DISMISSED`. To je **prihvatljivo u v1 isključivo zato što je dodijeljena samo `PHYSICIAN` roli**. `ACCEPTED_RISK` je klinička i pravna prihvatanje rizika; nijedna neklinička rola je ne smije izvršiti.

- **Negativna ograničenja:**
  - `MPA` **ne smije** korigovati ni činjenice ni usluge;
  - `BILLING_SPECIALIST` **ne smije** korigovati klinički izvučene činjenice (`analysis.correct_fact` DENY);
  - `BILLING_SPECIALIST` **ne dobija** `finding.resolve` — ako mu ikada zatreba, permisija se **prvo mora podijeliti**, ne proširiti;
  - `PRACTICE_ADMIN` **ne dobija** nijednu od tri permisije bez zasebne `PHYSICIAN` role.
- **Semantika matrice:** kao u D-039 (D-038, klauzule 7–11).
- **Razlog:** Činjenice su klinička ekstrakcija i pripadaju ljekaru. Service kandidati su tarifno-obračunski i legitimno ih koriguje i obračunska uloga. Rješavanje findinga nosi prihvatanje rizika i ostaje klinička odluka.
- **Alternative:** Podijeliti `finding.resolve` na `finding.resolve` / `finding.accept_risk` / `finding.dismiss` (odgođeno — povećava katalog i nije potrebno dok je permisija `PHYSICIAN`-only); dati `MPA` korekciju činjenica (odbijeno — klinička odluka).
- **Security/privacy uticaj:** Prihvatanje rizika ostaje u rukama klinički ovlaštene osobe, što čuva vrijednost audit traga o tome ko je prihvatio rizik.
- **Operativni nedostaci:** `finding.resolve` ostaje gruba; svako buduće proširenje na druge role zahtijeva prethodnu podjelu permisije i novi ADR. `MPA` ne može ispraviti ni očitu grešku u ekstrakciji.
- **Implementacijske posljedice:** Bez izmjene kataloga. `03` §16, §17 i §19 zadržavaju postojeće permisije po endpointu.
- **Test dokaz:** `PHYSICIAN` koriguje činjenicu i uslugu; `BILLING_SPECIALIST` koriguje uslugu ali dobija `403` na činjenicu; `MPA` dobija `403` na sve tri; `PRACTICE_ADMIN` bez `PHYSICIAN` dobija `403`; `finding.resolve` sa `ACCEPTED_RISK` uspijeva samo za `PHYSICIAN`.
- **Zavisnosti:** D-030, D-036, D-038, D-039.
- **Dokumenti za kasniju rekonsilijaciju:** `docs/15`; `08` §24.8.

---

# D-041 — Review, odobravanje i opoziv odobrenja

- **Status:** ACCEPTED
- **Datum:** 2026-08-05
- **Kontekst/problem:** `analysis.review_decision` je **grupna** permisija: D-036 iz nje izvodi `REJECT`, `REQUEST_CHANGES` i `SAVE_DRAFT`. `REJECT` je po D-031 klauzuli 1 **terminalan** za tu analysis reviziju, pa svaka rola koja dobije grupnu permisiju dobija i pravo terminalnog odbijanja. Odobravanje ima dva prihvaćena uslovna flaga, a opoziv odobrenja nije imao definisanog vlasnika.
- **Odluka:**

| Permisija | PRACTICE_ADMIN | PHYSICIAN | MPA | BILLING_SPECIALIST | AUDITOR | READ_ONLY | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|---|
| `analysis.review_decision` | DENY | ALLOW | DENY | ALLOW | DENY | DENY | DENY |
| `analysis.approve` | DENY | ALLOW | CONDITIONAL | CONDITIONAL | DENY | DENY | DENY |
| `analysis.approval.revoke` | DENY | ALLOW | CONDITIONAL | CONDITIONAL | DENY | DENY | DENY |

**Uslovna pravila:**

1. `MPA` `analysis.approve` — grant postoji **isključivo** kada je `allow_mpa_approval = true`.
2. `BILLING_SPECIALIST` `analysis.approve` — grant postoji **isključivo** kada je `allow_billing_specialist_approval = true`.
3. `MPA` `analysis.approval.revoke` — isti uslov kao klauzula 1.
4. `BILLING_SPECIALIST` `analysis.approval.revoke` — isti uslov kao klauzula 2.
5. `CONDITIONAL` doprinosi grant **samo** kada su zadovoljeni **i** dodijeljena rola **i** prihvaćeni uslov (D-038, klauzula 18).

**Granularnost (Q1):** `analysis.review_decision` **ostaje grupna** u v1. Katalog ostaje na **32** aktivne permisije. `REJECT`, `REQUEST_CHANGES` i `SAVE_DRAFT` se i dalje izvode iz te jedne permisije prema D-036.

**Pravila opoziva (Q7):**

6. Opozivalac **ne mora biti originalni odobravatelj**.
7. Podobnost role se evaluira **u trenutku opoziva**, ne u trenutku odobrenja.
8. `reason` je **obavezan**.
9. Dokaz odobrenja se **nikada ne briše**.
10. Immutable approval historija ostaje netaknuta (D-016).
11. Revocation audit event je **obavezan**.
12. Opozivačka ovlast **nikada ne prelazi** ovlast odobravanja — matrica opoziva je identična matrici odobravanja.

- **Negativna ograničenja:**
  - `MPA` **ne dobija** `analysis.review_decision`, jer bi time dobio i pravo **terminalnog** `REJECT`;
  - `PRACTICE_ADMIN` **ne odobrava i ne opoziva** samo na osnovu administrativne role; to je moguće isključivo ako isti korisnik zasebno nosi `PHYSICIAN` kroz D-038;
  - `AUDITOR`, `READ_ONLY` i `SYSTEM_ADMIN` **ne dobijaju** nijednu od tri permisije;
  - uključen practice flag **bez** podobne role **ne daje** grant;
  - podobna rola **bez** uključenog flaga **ne daje** grant.
- **Semantika matrice:** kao u D-039 (D-038, klauzule 7–11 i 18).
- **Razlog:** Zadržavanje grupne permisije izbjegava izmjenu prihvaćenog D-036 i očuvanje kataloga od 32 permisije. Cijena je da rola koja smije pisati review bilješku nužno smije i terminalno odbiti — zato je grupna permisija data samo rolama kojima je terminalno odbijanje legitimno. Opoziv koji prati odobravanje sprječava zastoj kada originalni odobravatelj više nije dostupan, a istovremeno onemogućava da neklinička administracija poništi kliničko odobrenje.
- **Alternative:** Podjela na `analysis.reject` i `analysis.review_note` (odbijeno u v1 — podiže katalog na 33 i **amandmanira prihvaćeni D-036**; zabilježeno u D-045 kao buduća odluka); opoziv isključivo od strane originalnog odobravatelja (odbijeno — zastoj pri odlasku osoblja); opoziv za `PRACTICE_ADMIN` (odbijeno — neklinička rola nad kliničkim odobrenjem).
- **Security/privacy uticaj:** Odobrenje i opoziv su pravno najteže radnje u sistemu. Opozivačka ovlast ograničena na odobravačku ovlast sprječava tihu eskalaciju prava. Obavezan `reason` i revocation audit event čuvaju rekonstrukciju odluke.
- **Operativni nedostaci:** **`MPA` u v1 nema nikakav put za review bilješku** — ne može poslati ni `SAVE_DRAFT` ni `REQUEST_CHANGES`. Ovo je poznata i prihvaćena posljedica opcije Q1-A. Ordinacija koja to treba mora sačekati podjelu permisije.
- **Implementacijske posljedice:** D-036 izvođenje permisije iz polja `decision` ostaje **nepromijenjeno**. Uslovni flagovi se čitaju iz `practice_settings` (`02` §6.4).
- **Test dokaz:** `PHYSICIAN` šalje sve četiri odluke; `BILLING_SPECIALIST` šalje sve četiri; `MPA` dobija `403` na sve četiri; `PRACTICE_ADMIN` bez `PHYSICIAN` dobija `403`; `MPA` sa `allow_mpa_approval = true` odobrava, sa `false` dobija `403`; isto za `BILLING_SPECIALIST`; opoziv od drugog `PHYSICIAN`-a koji nije originalni odobravatelj uspijeva; opoziv bez `reason` daje `422`; opoziv upisuje audit event; approval payload ostaje immutable nakon opoziva.
- **Zavisnosti:** D-016, D-031, D-036, D-038, D-039.
- **Dokumenti za kasniju rekonsilijaciju:** `docs/15`; `03` §10 i §20; `08` §17.1 i §24.9.

---

# D-042 — Ovlast otkazivanja i arhiviranja

- **Status:** ACCEPTED
- **Datum:** 2026-08-05
- **Kontekst/problem:** D-035 je definisao semantiku otkazivanja i kaskadu, ali ne i koja rola smije otkazati. `encounter.cancel` je posebno osjetljiv jer autorizuje **kompletnu kaskadu** nad tekućom aktivnom analizom.
- **Odluka:**

| Permisija | PRACTICE_ADMIN | PHYSICIAN | MPA | BILLING_SPECIALIST | AUDITOR | READ_ONLY | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|---|
| `encounter.cancel` | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| `analysis.cancel` | DENY | ALLOW | ALLOW | DENY | DENY | DENY | DENY |
| `encounter.document.archive` | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |

**Očuvanje D-035:**

1. `encounter.cancel` autorizuje **kompletnu komandu i njenu internu kaskadu** (D-035, klauzula 9).
2. `analysis.cancel` se **ne traži dodatno** za internu kaskadu (D-035, klauzula 10).
3. Rola koja nosi samo `analysis.cancel` **ne može** pokrenuti encounter kaskadu.

- **Negativna ograničenja:**
  - `MPA` **ne smije** otkazati encounter, jer bi time kaskadno otkazao i tekuću analizu;
  - `MPA` **ne smije** arhivirati dokument;
  - `BILLING_SPECIALIST` **ne dobija** nijednu od tri permisije;
  - `PRACTICE_ADMIN` **ne dobija** nijednu bez zasebne `PHYSICIAN` role.
- **Semantika matrice:** kao u D-039.
- **Razlog:** Otkazivanje encountera je nepovratna promjena kliničkog zapisa sa kaskadom; ostaje kod klinički ovlaštene osobe. Otkazivanje pojedinačne analize je operativna radnja koju asistent koji je analizu i pokrenuo mora moći zaustaviti.
- **Alternative:** Dati `MPA` `encounter.cancel` (odbijeno — kaskada); podijeliti `encounter.cancel` na odbacivanje `DRAFT` encountera i kaskadno otkazivanje (odgođeno — zabilježeno u D-045).
- **Security/privacy uticaj:** Otkazivanje i arhiviranje ostaju auditabilne radnje klinički ovlaštene osobe; retention i audit tok se ne mijenjaju.
- **Operativni nedostaci:** **`MPA` ne može odbaciti vlastiti pogrešno kreiran `DRAFT` encounter** i mora tražiti ljekara. Permisija je gruba — pokriva i odbacivanje praznog nacrta i kaskadno otkazivanje analize u toku.
- **Implementacijske posljedice:** Bez izmjene state machinea i bez novog endpointa.
- **Test dokaz:** `PHYSICIAN` otkazuje encounter i kaskada otkazuje tekuću analizu; `MPA` dobija `403` na `encounter.cancel`; `MPA` uspješno otkazuje analizu; `MPA` dobija `403` na arhiviranje dokumenta; korisnik sa samo `analysis.cancel` dobija `403` na encounter cancel; ponovljeno otkazivanje ne kreira dodatni audit event (D-035).
- **Zavisnosti:** D-027, D-031, D-035, D-038, D-039.
- **Dokumenti za kasniju rekonsilijaciju:** `docs/15`; `08` §23 i §24.8.

---

# D-043 — Export, osjetljiva čitanja, tarifni rezultat i audit permisije

- **Status:** ACCEPTED
- **Datum:** 2026-08-05
- **Kontekst/problem:** Sedam permisija u ovoj grupi nose najosjetljivija čitanja u sistemu — originalni klinički dokument, sirovi tarifni odgovor, export artefakt i audit paket. `09` §6 ih izričito navodi kao posebne permisije. `analysis.export.read` dodatno gate-uje **i** status export joba **i** preuzimanje artefakta.
- **Odluka:**

| Permisija | PRACTICE_ADMIN | PHYSICIAN | MPA | BILLING_SPECIALIST | AUDITOR | READ_ONLY | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|---|
| `encounter.document.read_original` | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| `analysis.export` | DENY | ALLOW | DENY | ALLOW | DENY | DENY | DENY |
| `analysis.export.read` | DENY | ALLOW | DENY | ALLOW | DENY | DENY | DENY |
| `tariff_evaluation.read` | DENY | ALLOW | DENY | ALLOW | DENY | DENY | DENY |
| `tariff.raw_result.read` | ALLOW | DENY | DENY | DENY | DENY | DENY | DENY |
| `audit.read` | ALLOW | DENY | DENY | DENY | ALLOW | DENY | DENY |
| `audit.export` | ALLOW | DENY | DENY | DENY | ALLOW | DENY | DENY |

**Granularnost `analysis.export.read` (Q2):** permisija **ostaje jedna** i pokriva i status export joba i pristup artefaktu. Katalog se **ne proširuje**. Nijedna nadzorna rola ne traži status bez artefakta — `AUDITOR` prati export kroz audit evente, ne kroz export API.

**Obuhvat `AUDITOR` role (Q5):** `AUDITOR` dobija **isključivo** `audit.read` i `audit.export`. Nijedan discovery ni listing endpoint se **ne uvodi**. U v1 se analysis ID-evi auditoru dostavljaju **izvan sistema**.

- **Negativna ograničenja:**
  - `AUDITOR` **ne dobija** `tariff.raw_result.read`;
  - `AUDITOR` **ne dobija** pristup encounterima, analizama, dokumentima ni tarifnim rezultatima;
  - `MPA` **ne dobija** nijednu od sedam permisija;
  - `PHYSICIAN` **ne dobija** `tariff.raw_result.read`, `audit.read` ni `audit.export`;
  - `BILLING_SPECIALIST` **ne dobija** `encounter.document.read_original`;
  - `READ_ONLY` i `SYSTEM_ADMIN` **ne dobijaju** nijednu.
- **Semantika matrice:** kao u D-039.
- **Razlog:** Originalni dokument je Class A (`09` §2) i ostaje isključivo klinički. Sirovi tarifni odgovor je tarifno-tehnički, ne medicinski, pa pripada administrativnoj roli koja inače nema klinički read. Audit je nadzorna funkcija: nosi je `AUDITOR`, ali i `PRACTICE_ADMIN`, jer ordinacija mora moći proizvesti vlastiti audit paket bez prisustva vanjskog auditora.
- **Alternative:** Podijeliti `analysis.export.read` na status i artefakt (odgođeno — zabilježeno u D-045); dati `tariff.raw_result.read` i `AUDITOR` roli (odbijeno — proširuje obuhvat auditora izvan Q5); dati `audit.export` samo `AUDITOR` roli (odbijeno — ordinacija bi ostala bez vlastitog audit izlaza).
- **Security/privacy uticaj:** Sva osjetljiva čitanja iz `09` §6 imaju najviše dvije role. `PRACTICE_ADMIN` i dalje nema nijedan klinički read — `tariff.raw_result.read` je tarifni payload, a `audit.read` metapodaci o radnjama. Prijetnja T10 je adresirana time što nijedna rola ne nosi istovremeno klinički read i audit export.
- **Operativni nedostaci:** **`AUDITOR` mora dobiti analysis ID-eve izvan sistema** — nema listing putanje. `PHYSICIAN` ne može pročitati audit trag vlastite analize bez `PRACTICE_ADMIN` ili `AUDITOR` role.
- **Implementacijske posljedice:** `03` §18.3 trenutno kaže da je `tariff.raw_result.read` „tipično admin/auditor". To je **prozni nagovještaj iz D-026, nikada prihvaćena dodjela**. Konačno prihvaćeno značenje je **`PRACTICE_ADMIN` only**; formulacija se mora ispraviti u kasnijem kontrolisanom `03` batchu.
- **Test dokaz:** `PHYSICIAN` čita original i dobija `DOCUMENT_VIEWED` audit event; `MPA` dobija `403` na original; `BILLING_SPECIALIST` exportuje i čita export status i artefakt; `AUDITOR` dobija `403` na `tariff_evaluation.read`, `tariff.raw_result.read` i export rute; `AUDITOR` čita i exportuje audit; `PRACTICE_ADMIN` čita sirovi tarifni rezultat i audit; `PRACTICE_ADMIN` dobija `403` na `analysis.export`; pozivalac sa `audit.read` bez `audit.export` dobija `403` na audit paket.
- **Zavisnosti:** D-023, D-024, D-026, D-032, D-037, D-038, D-039.
- **Dokumenti za kasniju rekonsilijaciju:** `docs/15`; **`03` §18.3 (obavezna ispravka formulacije)**; `08` §24.8.

---

# D-044 — Practice postavke i obuhvat zatvaranja encountera

- **Status:** ACCEPTED
- **Datum:** 2026-08-05
- **Kontekst/problem:** Practice postavke sadrže i approval flagove koji upravljaju uslovnim permisijama iz D-041, pa je pristup njima sam po sebi sigurnosno osjetljiv. Zatvaranje encountera je dozvoljeno isključivo iz `EXPORTED` (`03` §29.1) i predstavlja završetak obračunskog ciklusa.
- **Odluka:**

| Permisija | PRACTICE_ADMIN | PHYSICIAN | MPA | BILLING_SPECIALIST | AUDITOR | READ_ONLY | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|---|
| `practice.settings.read` | ALLOW | DENY | DENY | DENY | DENY | DENY | DENY |
| `practice.settings.manage` | ALLOW | DENY | DENY | DENY | DENY | DENY | DENY |
| `encounter.close` | ALLOW | ALLOW | DENY | ALLOW | DENY | DENY | DENY |

**Obuhvat `PRACTICE_ADMIN` (Q3):** rola je **isključivo administrativna** i u cijelom v1 katalogu nosi tačno sedam permisija: `practice.settings.read`, `practice.settings.manage`, `encounter.close`, `tariff.raw_result.read` (D-043), `audit.read` (D-043), `audit.export` (D-043) i `integration.read` (D-032, već prihvaćeno). Nijednu drugu.

- **Negativna ograničenja:**
  - druge role **ne dobijaju** puni settings dokument; ako im treba ponašanje izvedeno iz postavke, dobijaju **izvedeni flag**, ne dokument;
  - `PRACTICE_ADMIN` **ne dobija** kliničku ovlast ni kroz jednu od ovih permisija;
  - `MPA` **ne zatvara** encounter;
  - `AUDITOR`, `READ_ONLY` i `SYSTEM_ADMIN` **ne dobijaju** nijednu od tri permisije.
- **Semantika matrice:** kao u D-039.
- **Razlog:** Postavke uključuju `allow_mpa_approval` i `allow_billing_specialist_approval`; ko ih mijenja, indirektno mijenja skup odobravatelja. Zato pripadaju isključivo administratoru. Zatvaranje encountera nakon exporta je zajednička administrativno-obračunsko-klinička radnja, pa ga nose sve tri odgovorne role.
- **Alternative:** Dati `encounter.close` samo `PRACTICE_ADMIN` i `BILLING_SPECIALIST` (odbijeno vlasničkom odlukom — ljekar mora moći zatvoriti vlastiti encounter); dati `practice.settings.read` svim rolama (odbijeno — postavke otkrivaju konfiguraciju odobravanja).
- **Security/privacy uticaj:** Kontrola nad approval flagovima je koncentrisana u jednoj roli i podliježe optimistic lockingu i audit tragu. `practice_settings.configuration` ne sadrži secrets (`02` §6.4).
- **Operativni nedostaci:** Ordinacija bez dodijeljenog `PRACTICE_ADMIN`-a ne može promijeniti nijednu postavku niti uključiti uslovno odobravanje. `MPA` ne može zatvoriti ni potpuno obrađen encounter.
- **Implementacijske posljedice:** `PATCH /practices/{id}/settings` zadržava `If-Match` i `version` (D-029). Bez novog endpointa i bez izmjene kataloga.
- **Test dokaz:** `PRACTICE_ADMIN` čita i mijenja postavke; sve ostale role dobijaju `403` na oba; `PHYSICIAN`, `PRACTICE_ADMIN` i `BILLING_SPECIALIST` zatvaraju encounter iz `EXPORTED`; `MPA` dobija `403`; zatvaranje iz stanja različitog od `EXPORTED` daje `409 INVALID_STATE_TRANSITION` bez obzira na rolu.
- **Zavisnosti:** D-027, D-029, D-032, D-038, D-039, D-041, D-043.
- **Dokumenti za kasniju rekonsilijaciju:** `docs/15`; `03` §10; `08` §24.8.
- **Amandman (D-049, 2026-08-14) — isključivo faza implementacije endpointa:** **Semantika ove odluke se ne mijenja.** `practice.settings.read` i `practice.settings.manage` ostaju isključivo `PRACTICE_ADMIN`; obuhvat `PRACTICE_ADMIN` od tačno sedam permisija ostaje nepromijenjen; nijedna ćelija matrice se ne mijenja i `15` ostaje nepromijenjen. Mijenja se isključivo **faza u kojoj se settings endpoint implementira**: `GET` i `PATCH /practices/{practiceId}/settings` pripadaju **fazi 4** i paketu `013_rls_policies`. U fazi 3 nijedna settings ruta nije registrovana, a `copilot_app` ima isključivo `SELECT (practice_id, allow_mpa_approval, allow_billing_specialist_approval)` — minimum potreban za uslovne permisije u `GET /me`. Vidi D-049.

---

# D-045 — Operacije izvan v1 i neriješene granice pristupa

- **Status:** ACCEPTED
- **Datum:** 2026-08-05
- **Kontekst/problem:** Prihvaćena matrica pokriva 32 aktivne permisije. Postoje operacije koje se u praksi očekuju, ali nisu ni permisija ni endpoint u v1. Bez eksplicitne klasifikacije implementacija bi ih mogla tiho uvesti, a `practice.read` bi mogao dobiti dodjelu uprkos otvorenom D-OPEN-011.
- **Odluka:**

**1. `practice.read` ostaje blokiran.**

| Permisija | PRACTICE_ADMIN | PHYSICIAN | MPA | BILLING_SPECIALIST | AUDITOR | READ_ONLY | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|---|
| `practice.read` | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 | BLOCKED — D-OPEN-011 |

`BLOCKED` se **ne smije** pretvoriti u `DENY` ni u `ALLOW`. `DENY` bi značilo da je odluka donesena; `BLOCKED` znači da je nije dozvoljeno donijeti dok D-OPEN-011 ne bude prihvaćen.

**2. Klasifikacija operacija izvan matrice od 32 permisije:**

| Operacija | Klasifikacija |
|---|---|
| generički runtime read/write nad `users` | BLOCKED — D-OPEN-011 |
| generički runtime read/write nad `practices` | BLOCKED — D-OPEN-011 |
| `practice.read` | BLOCKED — D-OPEN-011 |
| generički cross-practice pristup nad `users`/`practices` | BLOCKED — D-OPEN-011 |
| kreiranje, deaktivacija i administracija membershipa | OUT OF V1 |
| dodjela i uklanjanje tenant rola | OUT OF V1 |
| cross-practice support pristup | OUT OF V1 |
| otkazivanje export joba | OUT OF V1 |
| generička platform administracija izvan `tariff.manage` | REQUIRES NEW PERMISSION AND ADR |
| `AUDITOR` discovery/listing putanja | REQUIRES NEW PERMISSION AND ADR |
| buduća podjela `analysis.review_decision` | REQUIRES NEW PERMISSION AND ADR |
| buduća podjela `analysis.export.read` | REQUIRES NEW PERMISSION AND ADR |
| finija permisija za rješavanje findinga | REQUIRES NEW PERMISSION AND ADR |
| `analysis.run_tariff` | RESERVED |
| `configuration.manage` | RESERVED |
| `integration.manage` | RESERVED |

**3. Rezervisane permisije se ne dodjeljuju nijednoj roli** i ne gate-uju nijedan aktivni endpoint (`03` §28.2–28.3). Katalog ostaje **32 aktivne** i **3 rezervisane**.

**4. Dokaz pokrivenosti — svih 32 aktivnih permisija ima tačno jednog vlasnika:**

| Vlasnik | Broj permisija |
|---|---:|
| D-023 (`tariff.manage`) | 1 |
| D-032 (`integration.read`) | 1 |
| D-039 | 10 |
| D-040 | 3 |
| D-041 | 3 |
| D-042 | 3 |
| D-043 | 7 |
| D-044 | 3 |
| D-045 (`practice.read`, BLOCKED) | 1 |
| **Ukupno** | **32** |

Nijedan red se ne pojavljuje dva puta i nijedan red ne nedostaje.

- **Negativna ograničenja:**
  - nijedna operacija iz tabele klasifikacije **ne smije** biti implementirana kao tiho proširenje postojeće permisije;
  - `OUT OF V1` **nije** dozvola za implementaciju bez ADR-a;
  - `REQUIRES NEW PERMISSION AND ADR` znači da i permisija i endpoint zahtijevaju zasebnu prihvaćenu odluku;
  - `RESERVED` identifikatori se **nikada** ne smiju iskoristiti za drugu radnju.
- **Semantika matrice:** kao u D-039. `BLOCKED` nije član unije i ne doprinosi nijedan grant.
- **Razlog:** Eksplicitna klasifikacija sprječava da neriješena pitanja postanu implementacijske pretpostavke. Ista disciplina je već primijenjena na D-OPEN-011 kroz `02` §28.2, `08` §21.5 i `13` §16.
- **Alternative:** Ostaviti operacije nenavedene (odbijeno — nenavedeno se u praksi čita kao dozvoljeno); označiti `practice.read` kao `DENY` (odbijeno — prikriva otvorenu odluku).
- **Security/privacy uticaj:** Zabrane iz `13` §16.3 ostaju na snazi. Nijedan `SECURITY DEFINER` bypass i nijedan generički grant prema `PUBLIC` se ne uvodi.
- **Operativni nedostaci:** Administracija membershipa i dodjela rola u v1 su isključivo migracijski/seed tok. Ordinacija ne može samostalno dodati člana kroz aplikaciju.
- **Implementacijske posljedice:** Phase gate pada ako implementacija uvede bilo koju blokiranu operaciju bez prihvaćene odluke (`05` Faze 3–4, `07` Faze 3–4).
- **Test dokaz:** `practice.read` nema nijednu rolu koja ga dobija; guard testovi iz `08` §21.5 ostaju obavezni; nijedna rezervisana permisija ne gate-uje aktivni endpoint; test da nijedna rola ne dobija membership ni role administration.
- **Zavisnosti:** D-023, D-026, D-032, D-036, D-038, D-039, D-040, D-041, D-042, D-043, D-044, D-OPEN-011.
- **Dokumenti za kasniju rekonsilijaciju:** `docs/15`; `03` §28.4; `13` §16.
- **Amandman (D-047, 2026-08-12):** Klauzula 1 i red `practice.read` u klauzuli 2 su **iscrpljeni**. D-OPEN-011 je riješen odlukom D-047, pa `practice.read` više nije `BLOCKED`: `PRACTICE_ADMIN` **ALLOW**, ostalih šest rola **DENY** (D-047, klauzula 11). Iz tabele klasifikacije u klauzuli 2 iscrpljene su i tri preostale `BLOCKED — D-OPEN-011` stavke — generički runtime read/write nad `users`, isto nad `practices`, i generički cross-practice pristup — sve riješene klauzulama 3–6 i 13–14 odluke D-047. **Redovi `OUT OF V1`, `REQUIRES NEW PERMISSION AND ADR` i `RESERVED` ostaju nepromijenjeni i na snazi**, jednako kao sva negativna ograničenja iz ove odluke. Vlasništvo permisije `practice.read` u dokazu pokrivenosti (klauzula 4) prelazi sa D-045 na **D-047**; ukupan broj ostaje **32 aktivne + 3 rezervisane**. Disciplina eksplicitne klasifikacije koju D-045 uvodi ostaje obavezna za svako buduće neriješeno pitanje.

---

# D-046 — Immutable correction events i deterministička pokrivenost review odluka

- **Status:** ACCEPTED
- **Datum:** 2026-08-05
- **Kontekst/problem:** `02` sadrži tri međusobno protivrječne normativne tvrdnje o relaciji `review_item_changes` → `review_decisions`: §13.2 kaže da composite FK **nije deklarisan**, §28.1 je navodi među osam nedeklarisanih relacija, a §22.9 tvrdi da ga paket `009_review_approvals` **kreira**. Uz to, `review_item_changes` **nema nijednu analysis ni revision kolonu**, pa se korekcija ne može pripisati reviziji nijednim putem. Kolona `review_decision_id` je definisana kao obavezna, dok korekcije nastaju kroz `PATCH /analyses/{id}/facts/{factId}` i `PATCH /analyses/{id}/service-candidates/{candidateId}` — endpointe koji ne traže postojanje odluke. Tabela je append-only i `copilot_app` nema `UPDATE` grant (§18.1), pa se veza ne može ni naknadno upisati.
- **Odluka:**

  **Proizvodna pravila**

  1. Korekcija izvučene činjenice ili service kandidata smije biti perzistirana **prije** i **bez** ijednog `review_decisions` reda.
  2. `review_item_changes` predstavlja **nezavisan immutable correction event**.
  3. Svaki `review_item_changes` red pripada **tačno jednoj** analysis reviziji kroz obavezan `analysis_run_id`.
  4. Jedan `analysis_runs` red je jedna analysis revizija; **`analysis_run_id` je autoritativni identitet revizije**.
  5. Kada se kreira review odluka, ona pokriva **svaki** `review_item_changes` red koji: pripada istom `practice_id`; pripada istom `analysis_run_id`; i **commitovan je i vidljiv** kada decision transakcija uspostavi svoju determinističku granicu pokrivenosti.
  6. Korekcije već povezane sa **ranijom** review odlukom **takođe se povezuju** sa kasnijom odlukom za isti `analysis_run_id` kada su vidljive na kasnijoj granici.
  7. Korekcija commitovana **nakon** granice pokrivenosti **nije** povezana sa tom odlukom i smije biti povezana sa kasnijom.
  8. Klijent **ne šalje** `review_item_change` ID-eve u `POST /analyses/{id}/decisions`.
  9. Asocijacija odluke i promjene se **izvodi serverski**.
  10. Postojeći correction redovi se **nikada ne updateuju** radi dodavanja veze prema odluci.
  11. Correction eventi i decision/change linkovi su **append-only**.
  12. Brisanje **nikada** ne smije ukloniti correction ni decision-link audit dokaz.

  **Uklanjanje direktne relacije**

  13. `review_item_changes` **više ne sadrži** `review_decision_id`.
  14. Tabela **ne smije** sadržavati ni nullable ni obavezan direktan `review_decision_id`.
  15. **Naknadni `UPDATE` se ne koristi** za povezivanje korekcije sa odlukom.

  Nullable direktna veza je odbijena jer: korekcije mogu prethoditi odlukama; `review_item_changes` je append-only; kolona bi zato u normalnom toku **trajno ostala `NULL`**; i implicirala bi asocijaciju koju sistem ne može održavati.

  **Model `review_item_changes`**

  16. Postojeća identitetska i correction-event polja ostaju nepromijenjena.
  17. **Uklanja se** `review_decision_id`.
  18. **Dodaje se** `analysis_run_id uuid NOT NULL`.
  19. Constraints:

```sql
primary key (id)
unique (practice_id, id)
unique (practice_id, analysis_run_id, id)

foreign key (practice_id, analysis_run_id)
  references analysis_runs(practice_id, id)
  on delete no action
  on update no action
```

  20. Lifecycle i grants: **append-only**; `copilot_app` `SELECT` i `INSERT` prema prihvaćenom grant modelu; **bez `UPDATE` granta**; **bez `DELETE` granta**. `analysis_revision_number` se **ne dodaje** na ovu tabelu.

  **Dopune `review_decisions`**

  21. Sve postojeće kolone ostaju.
  22. `analysis_revision_number` ostaje **immutable informacijski audit podatak**; D-046 ga **ne uklanja i ne preimenuje**.
  23. Dodaju se:

```sql
unique (practice_id, analysis_run_id, id)

foreign key (practice_id, analysis_run_id)
  references analysis_runs(practice_id, id)
  on delete no action
  on update no action
```

  24. `review_decisions` ostaje **append-only**.

  **D-046 ne sprovodi** database saglasnost između `review_decisions.analysis_revision_number` i `analysis_runs.revision_number`. To je **postojeće pitanje denormalizovanog snapshota**, izvan obuhvata D-046, može zahtijevati zasebnu buduću schema-governance odluku i **nije preduslov** za integritet decision/change linkova.

  **Nova tabela `review_decision_change_links`**

  25. Ime tabele je **prihvaćeno**: `review_decision_change_links`.
  26. Kolone: `id uuid`; `practice_id uuid NOT NULL`; `analysis_run_id uuid NOT NULL`; `review_decision_id uuid NOT NULL`; `review_item_change_id uuid NOT NULL`; `created_at timestamptz NOT NULL`.
  27. Constraints:

```sql
primary key (id)
unique (practice_id, id)
unique (practice_id, review_decision_id, review_item_change_id)

foreign key (practice_id, analysis_run_id, review_decision_id)
  references review_decisions(practice_id, analysis_run_id, id)
  on delete no action
  on update no action

foreign key (practice_id, analysis_run_id, review_item_change_id)
  references review_item_changes(practice_id, analysis_run_id, id)
  on delete no action
  on update no action
```

  28. Lifecycle: **append-only**; **bez `UPDATE` granta**; **bez `DELETE` granta**.
  29. **Jedan `analysis_run_id` u link redu konzumiraju oba composite FK-a.** Zato sama baza sprječava: cross-practice linkove; **same-practice ali cross-analysis-run linkove**; cross-revision linkove; orphan decision linkove; orphan correction linkove.
  30. Vrijednost `analysis_run_id` u link redu **ne može odstupiti** od nijednog roditelja — oba FK-a je vežu.

  **Kardinalnost**

  31. Jedna review odluka → **nula ili više** `review_item_changes`.
  32. Jedan `review_item_change` → **nula ili više** review odluka.
  33. Jedan par odluka/promjena → **najviše jedan** link red.

  `unique (practice_id, review_item_change_id)` se **ne dodaje**, jer bi netačno ograničio korekciju na jednu odluku. Već povezane korekcije se **ne isključuju** iz kasnijih odluka.

  **Deterministička granica pokrivenosti**

  34. Obje transakcije — correction i review-decision — **prvo** zauzimaju isti revision lock:

```sql
select ...
from analysis_runs
where practice_id = :practice_id
  and id = :analysis_run_id
for update;
```

  35. `analysis_runs` row lock je **prvi zajednički domenski lock** koji zauzimaju obje vrste transakcija.
  36. **Granica pokrivenosti nastaje u trenutku kada decision transakcija zauzme taj lock.**
  37. Korekcija commitovana **prije** nego što odluka zauzme lock je vidljiva i **uključena**.
  38. Correction transakcija koja dođe do iste revizije dok je decision lock držan **čeka**.
  39. Korekcija commitovana **nakon** što odluka otpusti lock je **isključena** iz tekuće odluke i smije biti pokrivena kasnijom.
  40. **D-029 optimistic locking** nad `extracted_facts` odnosno `service_candidates` redom ostaje **nepromijenjen**.
  41. Zajednički revision lock **dopunjuje, a ne zamjenjuje** `version` / `If-Match` provjere.
  42. Zaključava se **jedan resurs u jednoj dosljednoj prvoj poziciji**, pa lock-order ciklus nije moguć.
  43. Rollback otpušta lock i **ne ostavlja** parcijalnu odluku, link ni audit stanje.

  **Decision transakcija**

  44. `POST /analyses/{id}/decisions` interno izvršava **jednu atomarnu transakciju**: autentifikacija i tenant context prema prihvaćenom authorization toku (D-033, `03` §3.7) → zaključavanje odabranog `analysis_runs` reda `FOR UPDATE` → validacija tekuće revizije i stanja → izbor **svih** `review_item_changes` redova sa istim `practice_id` i `analysis_run_id` → **bez** filtriranja već povezanih promjena → `INSERT` u `review_decisions` → `INSERT` jednog `review_decision_change_links` reda po odabranoj promjeni → upis obaveznog audit dokaza → atomarni `COMMIT`.
  45. **Nula odabranih promjena je validno stanje** — odluka bez korekcija je legitimna.
  46. **Ne dodaje se** polje za correction ID-eve u request payload.
  47. **Ne dodaje se** nijedno novo polje u response payload.
  48. Kasnija odluka smije ponovo povezati istu korekciju.
  49. Duplirani linkovi za **istu** odluku su spriječeni prihvaćenim unique constraintom iz klauzule 27.
  50. Neuspjeh **rollback-uje** odluku, sve linkove i audit upise.
  51. Već prihvaćeno idempotency ponašanje za `POST /decisions` ostaje **nepromijenjeno**.
  52. Korekcije za jednu analysis reviziju su **serijalizovane** naspram kreiranja odluke.

- **Podjela odgovornosti sprovođenja:**

| Pravilo | Sprovodi |
|---|---|
| ista ordinacija | **database constraint** — oba composite FK-a |
| isti `analysis_run_id` | **database constraint** — zajednička kolona u oba trokolonska FK-a |
| ista revizija | **database constraint** — revizija **jeste** `analysis_runs` red |
| odluka postoji | **database constraint** — FK |
| korekcija postoji | **database constraint** — FK |
| nema dupliranog para | **database constraint** — unique |
| nema orphan linka | **database constraint** — `NOT NULL` + FK |
| zaštita roditelja | **database constraint** — `ON DELETE NO ACTION` |
| **vidljivost korekcije na granici** | **transaction/lock redoslijed** — jedino pravilo koje nije izrazivo constraintom |
| cross-user pristup | **RLS** i aplikacijska autorizacija |
| endpoint permisije | aplikacijska autorizacija (`03` §3.7, `15`) |
| tenant pristup | **RLS** i database constraint |
| nema kasnije mutacije | **grants** — bez `UPDATE` |
| nema brisanja | **grants** — bez `DELETE` |

- **Razlog:** Trokolonski composite FK-ovi pretvaraju "ista ordinacija i ista revizija" iz aplikacijskog obećanja u **database garanciju**. Dvokolonski model bi zaustavio cross-practice linkove, ali bi unutar iste ordinacije i dalje dopuštao da odluka iz revizije A referencira korekciju iz revizije B. Nezavisni correction event uz immutable link tabelu je jedini model koji istovremeno poštuje append-only semantiku i proizvodno pravilo da korekcija smije prethoditi odluci.
- **Alternative:**
  1. **Nullable direktni `review_decision_id`** — odbijen jer bi u normalnom toku trajno ostao `NULL`; popunjavanje bi tražilo `UPDATE` koji ne postoji kao grant.
  2. **Obavezan direktni `review_decision_id`** — odbijen jer bi zabranio korekciju prije odluke, protivno prihvaćenom proizvodnom pravilu.
  3. **Bez FK-a, isključivo aplikacijska korelacija** — odbijena jer odbacuje besplatnu database zaštitu tenant i revision integriteta.
  4. **Uklanjanje kolone bez link tabele** — odbijeno jer trajno gubi dokaz koje je korekcije odluka pokrila.
  5. **`SERIALIZABLE` bez zajedničkog locka** — odbijen jer traži retry logiku na svakom putu, a repozitorij nema `SERIALIZABLE` konvenciju.
- **Vlasništvo migracija:** Schema vlasništvo ostaje **`009_review_approvals`** i obuhvata: novi candidate key na `review_decisions`; composite FK `review_decisions` → `analysis_runs`; uklanjanje `review_decision_id` sa `review_item_changes`; dodavanje `analysis_run_id`; novi candidate key na `review_item_changes`; composite FK `review_item_changes` → `analysis_runs`; tabelu `review_decision_change_links`; njen primarni ključ; oba unique constrainta; oba trokolonska composite FK-a; i prihvaćene table grantove. **RLS vlasništvo ostaje `013_rls_policies`** i obuhvata `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` i tenant politiku nad `review_decision_change_links` koja koristi postojeći predikat `practice_id = app.practice_id`. **RLS se ne premješta u paket `009`. Nijedan migration paket se ne dodaje niti renumeriše.**
- **RLS i grants:** `review_decision_change_links` je **obična tenant tabela**. Inventar tenant tabela raste **sa 29 na 30**. RLS je `ENABLE` **i** `FORCE`. `copilot_app` dobija **isključivo `SELECT` i `INSERT`**; **bez `UPDATE`**; **bez `DELETE`**. `copilot_system` **ne dobija** nijedan automatski grant nad tenant tabelom (D-023). `PUBLIC` **ne dobija** nijedan grant. **Nijedan bootstrap izuzetak se ne primjenjuje** — tenant context mora već biti uspostavljen prije čitanja.
- **Indeksi:** D-046 **ne uvodi nijedan spekulativni samostalni indeks**. Prihvaćeni unique constrainti već obezbjeđuju potrebne btree indekse za: ciljeve roditeljskih FK-ova; izbor korekcija po prefiksu `(practice_id, analysis_run_id)`; pretragu linkova po prefiksu `(practice_id, review_decision_id)`; i sprječavanje dupliranih linkova. Za v1 se **eksplicitno odbijaju**, dok mjereni query ne pokaže potrebu: `review_item_changes (practice_id, analysis_run_id, changed_at, id)` i `review_decision_change_links (practice_id, review_item_change_id)`. Vrijedi postojeće pravilo o zabrani spekulativnih indeksa (`02` §21).
- **Posljedica za API:** **Nijedan javni endpoint se ne dodaje ni uklanja.** Nema izmjene request payloada. Nema izmjene response payloada. Nijedna permisija se ne dodaje, uklanja, preimenuje, dijeli ni spaja — **32 aktivne i 3 rezervisane ostaju nepromijenjene**. Nema izmjene HTTP statusa ni API error kodova. Nema izmjene state machine tranzicija. **D-029** optimistic-locking ugovor, **D-034** semantika lanca revizija, **D-036** izvođenje permisije i **D-037** export greške ostaju nepromijenjeni. **`docs/15` role-permission matrica je nepromijenjena.**
- **Security/privacy uticaj:** Svaka korekcija je pripisiva **tačnoj ordinaciji i tačnoj analysis reviziji**. Svaka review odluka može dokazati **tačno koje** correction evente je pokrila. Ista immutable korekcija smije legitimno biti dokaz za **više** odluka. Pokrivenost odluke je **reproducibilna iz immutable link redova**, ne iz naknadne rekonstrukcije. Nijedna korekcija ni link se ne mijenja nakon inserta. Brisanje ne može kaskadno uništiti audit dokaz. Database constrainti sprječavaju **same-tenant cross-revision** pogrešno povezivanje. RLS ostaje nezavisan sloj tenant pristupa. Aplikacijska validacija **nije jedina zaštita** integriteta roditelja.
- **Operativni nedostaci:** Zajednički revision lock uvodi **ograničenu kontenciju po analizi** — korekcije za istu reviziju serijalizuju se naspram kreiranja odluke. Vlasnik **prihvata** taj trošak: review rad je ljudskog tempa i vezan za jednu analizu, a lock kupuje **determinističku i auditabilnu granicu pokrivenosti**. Bez njega pravilo iz klauzule 5 nije implementabilno, jer bi korekcija mogla commitovati usred odluke bez definisanog odgovora o pokrivenosti.
- **Implementacijske posljedice:** Correction endpointi zahtijevaju **internu** izmjenu — zauzimanje `analysis_runs` row locka na početku transakcije. **Javni ugovor se ne mijenja**: `If-Match`, `version`, payloadi, statusi i error kodovi ostaju identični. Decision transakcija već koristi `SELECT … FOR UPDATE` prema `14` §9, pa se obrazac proširuje, ne uvodi.
- **Test dokaz:** Kasnija rekonsilijacija mora zahtijevati testove za:
  - validan same-practice, same-run link;
  - **odbijen cross-practice link**;
  - **odbijen same-practice ali cross-analysis-run link — na database constraintu, ne u aplikaciji**;
  - odbijenu nepostojeću odluku;
  - odbijenu nepostojeću korekciju;
  - odbijen duplirani par odluka/promjena;
  - jednu odluku povezanu sa više korekcija;
  - jednu korekciju povezanu sa više odluka;
  - odluku sa nula korekcija;
  - korekciju commitovanu prije granice — uključenu;
  - konkurentnu korekciju koja **čeka** na zajedničkom `analysis_runs` locku;
  - korekciju nakon granice — isključenu iz tekuće odluke;
  - kasniju odluku koja tu korekciju smije uključiti;
  - retry koji **ne duplira** linkove;
  - potpun rollback bez parcijalne odluke, linkova ni audit dokaza;
  - odbijen `UPDATE`;
  - odbijen `DELETE`;
  - brisanje bilo kojeg roditelja blokirano `NO ACTION`-om;
  - odbijeno cross-tenant RLS čitanje;
  - introspekciju constrainta i migration paketa;
  - introspekciju vlasništva RLS paketa.
- **Eksplicitna isključenja:** D-046 **ne uključuje**: FK rad za `extracted_facts.analysis_run_id`; FK rad za `service_candidates.analysis_run_id`; ispravku njihovog izostanka iz `02` §28.1; sprovođenje saglasnosti između `review_decisions.analysis_revision_number` i `analysis_runs.revision_number`; `analysis_revision_number` na `review_item_changes`; `analysis_revision_number` na `review_decision_change_links`; nove samostalne indekse; novi endpoint; novo payload polje; novu permisiju; novu aplikacijsku rolu; novu database rolu; novi migration paket; izmjenu `docs/15`; rješavanje D-OPEN-011; čišćenje navodnika u `04`. **Nedostajući `analysis_run` FK-ovi na `extracted_facts` i `service_candidates` su zasebno schema-governance pitanje. Saglasnost revision-number snapshota u `review_decisions` je zasebno schema-governance pitanje. Nijedno nije preduslov za D-046.**
- **Posljedice za rješavanje kontradikcije:** Kasnija `02` rekonsilijacija mora: ukloniti direktnu relaciju `review_item_changes.review_decision_id`; dodati prihvaćeni `analysis_run_id` anchor; dodati `review_decision_change_links`; uskladiti §13.1; uskladiti §13.2; uskladiti §22.9; uskladiti §25.2; uskladiti §28.1; **ispraviti lažnu tvrdnju o phantom FK-u**; **ispraviti broj deklarisanih composite FK-ova**; ažurirati inventar tenant tabela **29 → 30**; ažurirati listu objekata paketa `009`; i ažurirati RLS pokrivenost paketa `013`. **Te izmjene se ne izvršavaju u ovom batchu.**
- **Dokumenti za kasniju rekonsilijaciju:** redoslijed je **`02` → `04` → `05` → `07` → `08` → opciono `14` → `MANIFEST.md`**. `14` se uključuje samo ako vlasnik želi da sekvencijalni dijagram prikaže link upise i correction-side lock; §9 dijagram je i bez toga tačan, samo nepotpun. **`03` se ne usklađuje jer se javni API ugovor ne mijenja.** **`docs/15` nije zahvaćen.** **`MANIFEST.md` se osvježava tačno jednom, na kraju sekvence** — nikada nakon pojedinačnog međukoraka.
- **Zavisnosti:** D-006, D-016, D-022, D-023, D-029, D-031, D-033, D-034, D-036, D-038.

---

# D-047 — Runtime access model za `users` i `practices` (Bootstrap-Scoped RLS)

- **Status:** ACCEPTED
- **Datum:** 2026-08-12
- **Supersedes:** D-OPEN-011.
- **Kontekst/problem:** D-OPEN-011 je ostavio runtime access model za `users` i `practices` neriješenim i blokirao fazu 3. Tri ograničenja se sijeku:
  1. `users.auth_subject` se mora rezolvirati u `users.id` **prije** nego što `app.user_id` postoji, pa self-scoped politika vezana za `app.user_id` ne može bootstrapovati samu sebe (D-033, klauzula 2);
  2. zamrznuti `GET /me` ugovor zahtijeva `memberships[].practiceName` (`03` §10, `04` §5.4.1, `05` §4, `08` §24) na **neutralnoj** ruti bez practice contexta, pa `practices` mora biti čitljiv **prije** nego `app.practice_id` postoji — model "practices je čitljiv samo uz `app.practice_id`" **ne zadovoljava zamrznuti ugovor**;
  3. `practices.zsr_number` je osjetljiv poslovni podatak (`02` §6.1, `09` §2 klasa B), a nijedna od dvije tabele ne smije biti neograničeno runtime-čitljiva (`02` §18.3, §28.2; `13` §16.3).
- **Metod:** Svako PostgreSQL ponašanje navedeno u ovoj odluci je **empirijski dokazano** na PostgreSQL 16.14 (identičan image digest kao razvojna instanca, D-003) kroz transakcijski ograničene probe u `copilot_test`, sa punim rollbackom i verifikacijom da nijedan probe objekat nije ostao. Nijedna klauzula nije uslovna ni pretpostavljena.

## Odluka

### 1. `app.auth_subject`

Uvodi se transakcijski lokalna varijabla `app.auth_subject`. Postoji **isključivo** za identity bootstrap i ni za jednu drugu svrhu.

### 2. `app_security.set_auth_subject_context`

```sql
create or replace function app_security.set_auth_subject_context(
  p_auth_subject text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_auth_subject is null or p_auth_subject = '' then
    raise exception using
      errcode = '42501',
      message = 'Auth subject context requires a subject';
  end if;

  perform set_config('app.practice_id',  '', true);
  perform set_config('app.user_id',      '', true);
  perform set_config('app.auth_subject', p_auth_subject, true);
end;
$$;

revoke all on function app_security.set_auth_subject_context(text) from public;
grant execute on function app_security.set_auth_subject_context(text) to copilot_app;
```

Obavezne osobine: **SECURITY INVOKER**; fiksiran `search_path`; null/prazan ulaz odbijen sa SQLSTATE `42501`; briše `app.user_id`; briše `app.practice_id`; postavlja `app.auth_subject` transakcijski lokalno (`set_config(..., true)`); `PUBLIC` nema `EXECUTE`; `EXECUTE` isključivo `copilot_app`; vlasnik objekta je `copilot_migrator`.

**Nijedna `SECURITY DEFINER` funkcija se ne uvodi.** Zabrana iz `02` §17.3, §17.4, `04` §6.2.2 i `14` §2.1 ostaje na snazi.

### 3. `users` RLS

`users` koristi `ENABLE ROW LEVEL SECURITY` **i** `FORCE ROW LEVEL SECURITY`, sa dvije **PERMISSIVE** `SELECT` politike.

**Bootstrap politika** — `users_bootstrap_subject_select`:

```sql
nullif(current_setting('app.user_id', true), '') is null
and auth_subject = nullif(current_setting('app.auth_subject', true), '')
```

**Guard `app.user_id IS NULL` je obavezan i normativan.** Razlog je empirijski: permissive politike se kombinuju kroz `OR`, a `set_user_context` ne briše `app.auth_subject`. Bez guarda je dokazano da neusklađeni `app.auth_subject` / `app.user_id` konteksti izlažu **dva** korisnička reda istovremeno; sa guardom je vidljiv **tačno jedan**.

**Self politika** — `users_self_select`:

```sql
id = nullif(current_setting('app.user_id', true), '')::uuid
```

Politike su time **međusobno isključive po konstrukciji**: tačno jedna je aktivna u datom trenutku — bootstrap prije nego interni user context postoji, self nakon toga. Vidljivost nikada ne prelazi jedan red. Zastarjeli `app.auth_subject` nakon `set_user_context` dokazano nema nikakav efekat, pa se `set_user_context` **ne mijenja**.

### 4. `users` grants

`copilot_app` dobija `SELECT` isključivo na `(id, email, display_name, preferred_language, status)`.

**Ne dobija** `SELECT` na: `auth_subject`, `last_login_at`, `created_at`, `updated_at`.

Dokazano na PostgreSQL 16.14: **RLS politika smije referencirati `auth_subject` nad vlastitom tabelom bez da pozivalac ima column `SELECT` na `auth_subject`.** Istovremeno, aplikacijski `SELECT auth_subject` i `WHERE auth_subject = ...` padaju sa SQLSTATE `42501`. Politika je zato **jedini** put do te kolone, a aplikacija je ne može zaobići vlastitim filterom.

Nijedna runtime rola ne dobija `INSERT`, `UPDATE` ni `DELETE` nad `users`.

### 5. `practices` RLS

`practices` koristi `ENABLE ROW LEVEL SECURITY` **i** `FORCE ROW LEVEL SECURITY`, sa **dvije politike različitog moda**. Jedna generička permissive politika **nije dovoljna** i ne smije se koristiti.

**Membership politika** — `practices_membership_select`, **PERMISSIVE**:

```sql
exists (
  select 1
  from practice_memberships pm
  where pm.practice_id = practices.id
    and pm.user_id = nullif(current_setting('app.user_id', true), '')::uuid
)
```

Politika **namjerno ne filtrira `pm.active`**. Razlog: zamrznuti `GET /me` zahtijeva da i neaktivni membershipi prikažu `practiceName` (`03` §10). Isti obrazac i isto obrazloženje već su prihvaćeni u §17.4 — RLS ovdje uređuje **vidljivost vlastitih redova**, ne autorizaciju.

**Context narrowing** — `practices_context_narrow`, **RESTRICTIVE**:

```sql
nullif(current_setting('app.practice_id', true), '') is null
or practices.id = nullif(current_setting('app.practice_id', true), '')::uuid
```

**RESTRICTIVE mod je obavezan i normativan.** Ponašanje:

- prije `app.practice_id` — pozivalac vidi isključivo ordinacije iz vlastitog membership skupa;
- nakon `app.practice_id` — vidljivost se sužava na **tačno tekuću ordinaciju**;
- buduće permissive politike **ne mogu `OR`-om ukloniti** pravilo sužavanja.

Empirijski dokaz koji čini ovaj mod normativnim: uz simuliranu buduću široku permissive politiku (`using (true)`), kombinovana permissive varijanta vraća **3 reda** — uključujući ordinaciju u kojoj korisnik **nema nijedan membership** — dok PERMISSIVE + RESTRICTIVE varijanta vraća **1 red**.

### 6. `practices` grants

`copilot_app` dobija `SELECT` isključivo na `(id, code, name, default_language, timezone, status)`.

**Ne dobija** `SELECT` na: `legal_name`, `zsr_number`, `gln_number`, `created_at`, `updated_at`.

Nijedna runtime rola ne dobija `INSERT`, `UPDATE` ni `DELETE` nad `practices`. `copilot_system` **nema nijedan grant** nad `users` ni nad `practices`. `PUBLIC` nema nijedan grant.

Osjetljiva polja ostaju nedostupna **i pri kompromitovanom `copilot_app` credentialu**, jer column grants ne zavise od konteksta i preživljavaju podmetnut `app.*` GUC.

### 7. Zavisnost politike od `practice_memberships` — dokazana invarijanta

Dokazano na PostgreSQL 16.14: politika nad `practices` koja sadrži podupit nad `practice_memberships` **zahtijeva da pozivalac ima privilegije nad referenciranom tabelom/kolonama**. Bez granta upit pada sa SQLSTATE `42501`.

Minimalno dovoljno: `SELECT` na `(practice_id, user_id)`.

PostgreSQL je ovdje **asimetričan**, i ta asimetrija je normativna za sve buduće politike:

| Referenca unutar RLS politike | Potreban grant pozivaocu |
|---|---|
| kolona **vlastite** tabele politike | **ne** |
| **druga** tabela | **da** |

Repozitorij već prihvata širi, table-level `SELECT` za `copilot_app` nad `practice_memberships` (`02` §20.2), pa **D-047 ne uvodi nijedan novi membership grant**. Zavisnost ipak postaje **eksplicitna invarijanta**: sužavanje ili ukidanje membership granta **ne smije tiho slomiti** politiku nad `practices`. Svaka takva izmjena mora prvo provjeriti ovu zavisnost.

**Posljedica za fazu 3:** pošto `practice_memberships` dobija svoju user-scoped RLS tek u fazi 4 (§17.3, paket `013`), `copilot_app` u fazi 3 može čitati generičke membership redove na nivou baze. To je **zatečeno zamrznuto stanje faze 3** (`02` §20.2 i `05` faza 3), a **ne** posljedica D-047. Faza 4 ga zatvara.

### 8. Transakcijska atomarnost

Za **svaki** autentifikovani request sljedeći bootstrap lanac se izvršava unutar **jedne interaktivne PostgreSQL transakcije**:

1. verifikovani token subjekt;
2. `set_auth_subject_context`;
3. `users` lookup;
4. validacija `users.status`;
5. `set_user_context`;
6. `/me` bootstrap čitanja ili precheck tražene ordinacije;
7. kada faza 4 postoji: `set_request_context`;
8. tenant autorizacija i upit;
9. `COMMIT` / `ROLLBACK`.

Granica transakcije je **obavezna** jer: sav `app.*` kontekst je transakcijski lokalan; razdvajanje sekvence izgubilo bi pouzdan kontekst; transakcija je i dio TOCTOU kontrole. **Nijedan session-scoped identity ni practice kontekst se ne smije uvesti.**

### 9. Status korisnika

Rezolviran korisnik čiji `status` nije `ACTIVE` odbija se sa `403 ACCESS_DENIED` **prije** `set_user_context`. Identitet se smije rezolvirati isključivo da bi se dobio `status` potreban za tu odluku.

Neaktivan korisnik ne smije: uspostaviti `app.user_id`; enumerisati membershipe; uspostaviti tenant kontekst.

### 10. Status ordinacije

Svaka tražena ordinacija čiji `status` nije `ACTIVE` odbija se sa `403 ACCESS_DENIED` uz `ROLLBACK`. Redoslijed je normativan:

1. verifikovan korisnik;
2. `set_user_context`;
3. parsiranje traženog `practiceId`;
4. membership-scoped čitanje `status` te tražene ordinacije;
5. nula redova → `403 ACCESS_DENIED`;
6. `status <> 'ACTIVE'` → `403 ACCESS_DENIED` + `ROLLBACK`;
7. tek tada, kada faza 4 postoji, poziv `set_request_context`;
8. tamo se **nezavisno** validira aktivan membership;
9. tek tada `app.practice_id` postoji.

Time **nijedna ne-ACTIVE ordinacija nikada ne dobija tenant kontekst**, a privilegovani prozor je nulte dužine. Korak 4 je izvodiv jer pre-context grana politike iz klauzule 5 dozvoljava čitanje tražene ordinacije po ID-u; dokazano.

Korak 4 dokazuje **postojanje** membershipa (politika ne filtrira `active`), korak 8 dokazuje **aktivan** membership. Oba su potrebna; nijedan ne zamjenjuje drugi.

**Tijelo `set_request_context` se ne mijenja.**

### 11. `practice.read`

| Rola | `practice.read` |
|---|---|
| `PRACTICE_ADMIN` | **ALLOW** |
| `PHYSICIAN` | DENY |
| `MPA` | DENY |
| `BILLING_SPECIALIST` | DENY |
| `AUDITOR` | DENY |
| `READ_ONLY` | DENY |
| `SYSTEM_ADMIN` | DENY |

Status `BLOCKED — D-OPEN-011` nestaje.

`practice.read` autorizuje **isključivo** čitanje neosjetljivog DTO-a **tekuće** tenant ordinacije. **Ne** autorizuje: listu ni direktorij ordinacija; prikaz `zsr_number`, `gln_number` ni `legal_name`; cross-practice ni platform pristup; bilo kakav upis nad `practices`; tenant pristup za `SYSTEM_ADMIN`.

`SYSTEM_ADMIN` dobija tenant `practice.read` isključivo ako isti korisnik **nezavisno** ima aktivan tenant membership i dodijeljenu `PRACTICE_ADMIN` tenant rolu. Platform rola sama po sebi ne doprinosi ništa (D-023 klauzula 10, D-038 klauzule 13–14).

Ostale role ne gube ništa: `/me` već vraća `practiceId` i `practiceName` za svaki membership. Dodjela je namjerno **minimum koji rješava blokadu** — proširenje je kasnije aditivan ADR, sužavanje bi bilo breaking izmjena.

### 12. Co-member `displayName`

Pristup redu **drugog** korisnika, koji kasnije traže `responsiblePhysician.displayName` (`03` §12, §15) i `approvedBy.displayName` (`03` §20), je u v1:

**`DENY / NOT IMPLEMENTED`**

Treća `users` politika se **ne** dodaje sada. Uvodi se imenovani obavezni gate:

**`BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS`**

Buduća odluka mora obraditi dokazano PostgreSQL ograničenje da su **column grants vezani za rolu, ne za politiku**: svaki red koji politika propusti čitljiv je u **svim** grantovanim kolonama, pa bi co-member politika izložila i `email`, a ne samo `display_name`. Nijedan konzument faze 5 ne smije tiho dobiti generičku vidljivost nad `users`.

### 13. Platform put

**U v1 ne postoji platform read ni write put nad `users` ni nad `practices`.** `SYSTEM_ADMIN` sam po sebi ne smije čitati tenant `users` ni `practices`. Nijedan platform endpoint se ne uvodi.

Buduća cross-practice platform administracija zahtijeva: eksplicitan produktni use case; novu permisiju; novi ADR; eksplicitan database put; eksplicitan audit model. Do tada put **pada zatvoreno**.

### 14. System/service put

`copilot_system` ne dobija grant nad `users` ni nad `practices`. Nijedan konzument u fazi 3 niti poznati zahtjev faze 6 ih ne traži (`02` §20.1, D-023 klauzula 5, D-024). Budući system konzument zahtijeva novi ADR.

### 15. Runtime upisi u v1

`users`: `INSERT` DENY; `UPDATE` DENY; `DELETE` DENY; deaktivacija DENY; promjena `auth_subject` DENY; `last_login_at` **NOT IMPLEMENTED**.

`practices`: `INSERT` DENY; `UPDATE` DENY; `DELETE` DENY; deaktivacija/arhiviranje DENY; izmjena `zsr_number`/`gln_number` DENY.

`practice_settings` ostaje **zasebna, već odlučena tabela i putanja** (D-028 klauzula 4, D-029, D-044) i **nije** izuzetak od zabrane upisa nad `practices`.

Nijedan runtime write grant ne postoji nad te dvije tabele. Obje se pune isključivo migracijom i seedom (`02` §23), jednako kao `practice_memberships` (D-033 klauzula 13), `practice_membership_roles` (D-038 klauzula 24) i `platform_role_assignments` (D-023 klauzula 11). Posljedica koja se prihvata eksplicitno: `users.last_login_at` ostaje `NULL` kroz cijeli v1.

### 16. Vlasništvo faza i migration paketa — sekvenciranje S1

**Paket `002_identity_and_practices` — faza 3** dobija: `app_security` schemu ako već ne postoji (`create schema if not exists`); `set_auth_subject_context`; **`set_user_context` — premješten iz paketa `013`**; `users` column grant; `practices` column grant; `ENABLE` + `FORCE RLS` za `users`; `ENABLE` + `FORCE RLS` za `practices`; `users` bootstrap politiku; `users` self politiku; `practices` membership PERMISSIVE politiku; `practices` context RESTRICTIVE politiku.

**Paket `013_rls_policies` — faza 4** zadržava: `set_request_context`; `practice_memberships` self-RLS (§17.3); `practice_membership_roles` RLS (§17.4); `platform_role_assignments` RLS (§17.2); sve preostale tenant politike; završni transakcijski tenant-isolation gate.

**Nijedan novi broj paketa se ne uvodi.** §17.3 i opšta tenant RLS faze 4 **se ne premještaju** u fazu 3.

Politike nad `users` i `practices` napisane u paketu `002` su **konačne**. Faza 4 ih ne prepisuje — ona samo počinje postavljati `app.practice_id`, čime se RESTRICTIVE grana aktivira **automatski**. Dokazano: identična politika daje identičan rezultat prije i nakon što `practice_memberships` dobije `FORCE RLS`.

### 17. Rekonsilijacija sa D-033

**Sigurnosna semantika D-033 se ne dira.** Nepromijenjeni ostaju: tijelo `set_user_context`; tijelo `set_request_context`; oba potpisa; `SECURITY INVOKER`; brisanje prije validacije; validacija aktivnog membershipa; ograničenja pozivaoca; klauzule 1–15.

Mijenja se **isključivo vlasništvo paketa** za `set_user_context`: paket `013` → paket `002`. Razlog: faza 3 već zahtijeva autentifikovan user context, a zamrznuti dokumenti su po tom pitanju bili u **međusobnom neslaganju** — `02` §22.13 je funkciju dodjeljivao paketu `013`/fazi 4, dok je `04` §6.2.3 artefakt "autentifikovani user context (auth subject → `users.id`)" dodjeljivao paketu `002`/fazi 3, a D-033 klauzula 3 njenu **upotrebu** smješta u autentifikacijski put faze 3. Prema `README` §2, konflikt koji se ne može riješiti redoslijedom autoriteta rješava se novim unosom u Decision Log — što je ovdje i učinjeno.

Ovo je **package/rollout rekonsilijacija, ne amandman na sigurnosnu semantiku.**

### 18. Faza 3 kao međustanje

**`PHASE 3 IS AN INTERMEDIATE NON-PILOT SECURITY STATE`**

U fazi 3: `users` je već zaštićen RLS-om; `practices` je već zaštićen RLS-om; vidljivost `practices` je ograničena membershipom; konačno sužavanje kroz `app.practice_id` još ne postoji; `practice_memberships` još nema RLS faze 4; `copilot_app` zato može čitati generičke `practice_memberships` redove na nivou baze; tenant sužavanje za `GET /practices/{id}` je u fazi 3 **dodatno** sprovedeno aplikacijski.

To stanje je prihvatljivo **isključivo** zato što na tom gateu ne postoje stvarni pilot korisnici ni podaci, i zato što je faza 4 obavezna prije faze 5.

Zamrznuti gate ostaje na snazi: **`ALL RLS TESTS GREEN — required before phase 5`**. Nijedan pilot ni rad faze 5 ne smije se izvoditi nad sigurnosnim stanjem faze 3.

### 19. Audit i logging

Pre-tenant bootstrap i sigurnosni događaji **ne mogu** kreirati redove u `audit_events`, jer je `audit_events.practice_id` `NOT NULL` (D-023 klauzule 1–2) i `system_audit_events` se namjerno ne kreira. Za njih se koristi **strukturirani operativni log** (`09` §11): rezolucija subjekta — uspjeh i neuspjeh; odbijanje po statusu korisnika; neuspjeh membershipa; odbijanje po statusu ordinacije; uspostava konteksta.

Nikada se ne logira: sirovi JWT; sirovi `auth_subject`; credentials; database URL; nepotrebni PII.

Obično, neosjetljivo `practice.read` **ne zahtijeva** trajni audit red u v1 — vraća ni PHI ni klasu B. Ako se ubuduće uvede osjetljiv practice DTO, trajni audit postaje dio tog budućeg ADR-a.

### 20. Granica pri kompromitovanom credentialu

**RLS ne autentifikuje krajnjeg korisnika kada je dijeljeni `copilot_app` credential ukraden.** Držalac credentiala može sam postaviti `app.auth_subject`, `app.user_id` i `app.practice_id` kroz `set_config`; postojanje context funkcija nije privilegijska granica.

RLS zato prvenstveno štiti od: aplikacijskih grešaka; zaboravljenih filtera; običnih cross-tenant bugova.

Kontrole koje **preživljavaju** krađu `copilot_app` credentiala: column-level `SELECT` ograničenje; nepostojanje write grantova; nepostojanje vlasništva; `NOBYPASSRLS`; nepostojanje DDL prava.

**Jača database identity garancija se ne tvrdi.** Ovo je dosljedno D-023 klauzuli 13 i D-033 (*Ograničenje*): tačka sprovođenja autorizacije je API, ne baza.

### 21. Autorizacija faze 3

Prihvatanje ove odluke od strane vlasnika autorizuje **isključivo**: `D-047 FORMALIZATION + CONTROLLED DOCUMENTATION RECONCILIATION`.

Implementacija faze 3 ostaje **NIJE AUTORIZOVANA** dok se ne ispuni sve: D-047 zabilježen; svi autoritativni dokumenti usklađeni; nezavisan governance review prošao; rekonsilijacijski commit merged u kanonski `main`; kanonski `main` verifikovan; D-OPEN-011 formalno superseded od D-047.

Tek nakon toga: `PHASE 3 IMPLEMENTATION: AUTHORIZED`. Do merge-a: **`PHASE 3 IMPLEMENTATION IS NOT AUTHORIZED`**.

## Razlog

Model rješava bootstrap ciklus **proširenjem već prihvaćenog bootstrap-safe RLS obrasca** (§17.3, §17.4) na jedan korak ranije u lancu, umjesto uvođenjem novog mehanizma. Ne uvodi database rolu, `SECURITY DEFINER` funkciju, tabelu, permisiju ni migration paket. Column grants su primarna kontrola jer su jedina koja preživljava krađu credentiala.

## Alternative

- **Neograničeni grants uz aplikacijsko filtriranje** — odbijeno: to je upravo neograničen `SELECT` koji `13` §16.3 zabranjuje.
- **Čista RLS vezana samo za `app.user_id`** — odbijeno: self politika ne može bootstrapovati samu sebe; usvojena je kao druga polovina ovog modela.
- **`SECURITY DEFINER` resolver** — odbijeno: uvodi konstrukciju koju je D-033 odbio za strukturno identičan problem; pod `FORCE RLS` bi i sama bila filtrirana, pa bi tražila dodatno slabljenje `02` §18/§27; stvara privilegovan callable sa proizvoljnim ulazom.
- **Zasebna bootstrap database rola i konekcija** — odbijeno: stvarna ali marginalna dobit protiv ukradenog credentiala, uz četvrtu rolu (ADR-level izmjena D-005/D-023), drugi secret u runtime procesu i drugi pool; dobit nestaje čim `copilot_app` ionako mora čitati vlastiti red za `/me`.
- **Zasebna struktura mapiranja identiteta** — odbijeno: duplira `auth_subject`, uvodi sinhronizaciju životnog ciklusa, bez privilegijskog razdvajanja.
- **Bootstrap politika bez `app.user_id IS NULL` guarda** — odbijeno: dokazano izlaže dva reda.
- **Jedna kombinovana permissive `practices` politika** — odbijeno: dokazano se urušava na 3 reda pod budućom širokom permissive politikom.
- **Provjera statusa ordinacije nakon `set_request_context`** — odbijeno: ostavlja privilegovan prozor u kojem tenant kontekst postoji za ne-ACTIVE ordinaciju.
- **`practice.read` = ALLOW za svih šest tenant rola** — odbijeno: srušilo bi zamrznute invarijante `READ_ONLY` = nula `ALLOW` i `AUDITOR` bez treće permisije, i dodijelilo polja koja nijedan workflow ne konzumira.

## Posljedice

- Faza 3 postaje implementabilna; `practice.read` postaje dodjeljiv; `BLOCKED` klasifikacija nestaje iz `15` §5 i §8.1.
- Administracija identiteta ostaje u cijelosti izvan runtimea u v1; `users.last_login_at` nema upisivača.
- Politika nad `practices` trajno zavisi od membership granta (klauzula 7).
- Faza 3 je nepilotsko međustanje; faza 4 ostaje obavezan sigurnosni gate.
- Katalog permisija ostaje **32 aktivne + 3 rezervisane**; nijedna permisija, rola, endpoint, tabela ni paket se ne uvodi.

## Security/privacy uticaj

Zatvara neriješenu granicu koja je blokirala fazu 3, uz striktnu minimizaciju kolona: `zsr_number`, `gln_number`, `legal_name`, `auth_subject` i `last_login_at` nisu dostupni nijednoj runtime roli. Jača kontrole T1 i T10 iz `09` §18 protiv aplikacijskih grešaka; eksplicitno **ne** jača ih protiv ukradenog dijeljenog credentiala.

## Migration/rollout

Artefakti i vlasništvo prema klauzuli 16. Redoslijed unutar paketa `002`: tabele → grants → `ENABLE`/`FORCE RLS` → politike → funkcije; `practices` politika se kreira nakon `practice_memberships`. Politike, `FORCE RLS`, column grants i funkcije se pišu u `--create-only` migration SQL-u prema D-004; `prisma migrate diff` može prijavljivati drift na njima, što je očekivano i ne ispravlja se (D-030).

**Rollback:** `DROP POLICY` ×4; `DISABLE ROW LEVEL SECURITY` nad dvije tabele; `REVOKE` grantova; `DROP FUNCTION set_auth_subject_context`. Nedestruktivno, bez gubitka podataka — projekat nema produkcijske podatke (`02` §22.2) — i pada zatvoreno. Migracija je sigurna upravo zato što stvarni korisnici još ne postoje.

## Test dokaz

Puni pozitivni i negativni test ugovor je u `08` §21.5. Obavezni minimum: bootstrap sa validnim subjektom; nepoznat subjekt; neaktivan korisnik; **neusklađeni** `auth_subject`/`user_id` konteksti; **zastarjeli** `auth_subject`; bez konteksta; vlastiti red; tuđi red odbijen; `42501` za svaku negrantovanu kolonu; `42501` za svaki upis; pre-context vidljivost vlastitih membership ordinacija; post-context sužavanje na jednu ordinaciju; neaktivan membership vidljiv samo za `/me` ime; ordinacija bez membershipa; pogođen `practiceId`; zaštita RESTRICTIVE politike; osjetljive kolone `42501`; `copilot_system` odbijen; generička membership vidljivost faze 3 dokumentovana kao očekivano međustanje; zatvaranje te vidljivosti u fazi 4; brisanje konteksta na kraju transakcije; izolacija pooled konekcije. Test kompromitovanog credentiala mora **tvrditi prihvaćeno ograničenje**, nikada lažno tvrditi database autentifikaciju korisnika.

## Zavisnosti

D-002, D-005, D-006, D-023, D-024, D-028, D-029, D-033, D-038, D-044, D-045.

## Amandmani

*(Ovaj odjeljak je dodan 2026-08-14 i stoji izvan izvornog historijskog tijela odluke. Klauzule
1–21, `Razlog`, `Alternative`, `Posljedice`, `Security/privacy uticaj`, `Migration/rollout`,
`Test dokaz` i `Zavisnosti` iznad ostaju **nepromijenjeni**.)*

- **Amandman (D-048, 2026-08-14) — klauzula 15:** D-048 definiše **pouzdani seed/migration
  mehanizam** za tabele koje već nose `FORCE ROW LEVEL SECURITY`, kroz jednu eksplicitnu
  transakciju u vlasništvu `copilot_migrator`-a. Klauzula 15 je time **dopunjena, ne oslabljena**:
  nijedan runtime write grant se ne uvodi, `BYPASSRLS`, `SECURITY DEFINER`, superuser seed
  credential i trajna migrator RLS politika ostaju zabranjeni, a steady-state runtime threat model
  D-047 ostaje **nepromijenjen**. Vidi D-048.
- **Amandman (D-051, 2026-08-14) — klauzule 16 i 18:** Kompletni već prihvaćeni sigurnosni
  artefakti `02` §17.2 (`platform_role_assignments`) i §17.4 (`practice_membership_roles`)
  premješteni su iz paketa `013_rls_policies`/faze 4 u paket `002_identity_and_practices`/fazu 3.
  Imena politika, tijela politika i grantovi ostaju **identični**. `practice_memberships` §17.3,
  `practice_settings` RLS, `set_request_context`, uspostava `app.practice_id`,
  `PracticeContextGuard` i `TenantDatabaseService` **ostaju u fazi 4**, pa opis međustanja iz
  klauzule 18 ostaje na snazi u dijelu koji se odnosi na generičku vidljivost
  `practice_memberships`. Vidi D-051.
- **Dopuna (D-050, 2026-08-14) — isključivo mehanizam autorstva:** Formulacija „`--create-only`
  migration SQL" iz odjeljka `Migration/rollout` čita se od sada kroz D-050: politike, `FORCE RLS`,
  column grants i funkcije pišu se kao **ručno dopunjen custom SQL u `migration.sql` fajlu paketa
  `002`**, autorisan kroz `prisma migrate diff`. Redoslijed artefakata, njihov sadržaj, rollback
  plan i pravilo da se očekivani drift **ne ispravlja** ostaju **nepromijenjeni**. Vidi D-050,
  klauzulu 4.
- **Amandman (D-056, 2026-08-20) — klauzula 16, dio o `TenantDatabaseService`-u:** Sigurnosni
  **koncept** `TenantDatabaseService`-a **ostaje kanonski i nepromijenjen**. **Nadiđeno je
  isključivo vlasništvo faze 4 nad konkretnom klasom**: konkretan facade **nije** deliverable
  zatvaranja faze 4. On je **uslovno odgođen** (`EXPLICITLY_DEFERRED`) i postaje obavezan **tek
  kada stvarni tenant business modul zatraži tu apstrakciju** — a ne dolaskom bilo kojeg broja
  faze; faza 5 je evidentirana samo kao **najranija očekivana** business-modul faza. Tenant
  kontekst semantika iz ove klauzule — uspostava `app.practice_id`, `set_request_context`,
  `PracticeContextGuard` kao naziv faze admisije, `practice_memberships` §17.3 i
  `practice_settings` RLS — **ostaje u fazi 4 i ne slabi se**. **D-054, klauzule 6–10 ostaju
  binding** i moraju biti ponovo dokazane prije prihvatanja bilo kojeg budućeg konkretnog facadea.
  Klauzula 10 ove odluke i `03` §3.7.1 ostaju **nadređeni**. Vidi D-056, dio A.

---

# D-048 — Protokol održavanja `FORCE RLS` pri pouzdanom seedu i migraciji

- **Status:** ACCEPTED
- **Datum:** 2026-08-14
- **Amandman na:** D-047, klauzula 15 — definiše pouzdani seed/migration mehanizam. **Ne slabi**
  steady-state runtime threat model D-047.
- **Kontekst/problem:** Tabele koje pouzdani migration/seed put popunjava mogu već nositi
  `FORCE ROW LEVEL SECURITY`. Pod `FORCE RLS` i **vlasnik tabele** `copilot_migrator` podliježe
  politikama, a nijedna prihvaćena politika ne dozvoljava owner-write. Pouzdani seed DML zato pada,
  iako je riječ o migracijskom, a ne runtime putu.

## Odluka

### 1. Odbijene trajne alternative

Sljedeće se **ne uvode ni u jednom obliku**:

- `BYPASSRLS` na bilo kojoj roli;
- `SECURITY DEFINER` funkcija za seed ili migraciju;
- superuser seed credential;
- trajna `copilot_migrator` RLS politika;
- globalno isključivanje RLS-a.

### 2. Prihvaćeni mehanizam

Jedna **eksplicitna PostgreSQL transakcija**, u vlasništvu i izvršenju pouzdanog
`copilot_migrator` maintenance puta.

### 3. Obavezni protokol

```text
BEGIN

  -> verifikuj da je ciljna tabela eksplicitno na allowlisti

  -> ALTER TABLE <table> NO FORCE ROW LEVEL SECURITY

  -> assert:
       relrowsecurity      = true
       relforcerowsecurity = false

  -> isključivo pouzdani seed/migration DML

  -> ALTER TABLE <table> FORCE ROW LEVEL SECURITY

  -> assert prije COMMIT-a:
       relrowsecurity      = true
       relforcerowsecurity = true

COMMIT
```

### 4. Normativna pravila

- autocommit je **zabranjen**;
- `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` je **zabranjen** u forward migracijama, seedu i
  maintenance prozoru — svugdje gdje bi bio zamjena za `NO FORCE`. Ne odnosi se na eksplicitno
  dokumentovan rollback koji u cijelosti poništava migraciju i uklanja i politike;
- RLS ostaje **`ENABLED` kroz cijeli prozor** — mijenja se isključivo `FORCE` atribut;
- `BYPASSRLS` je zabranjen;
- `SECURITY DEFINER` je zabranjen;
- superuser seed credential je zabranjen;
- trajna migrator RLS politika je zabranjena;
- **nepovezani sigurnosni DDL unutar maintenance prozora je zabranjen**;
- neuspjela restore asercija **mora podići izuzetak i prekinuti transakciju**;
- rollback **nikada** ne smije ostaviti `FORCE` isključenim;
- trajni regresijski testovi moraju dokazivati steady-state `relrowsecurity = true` i
  `relforcerowsecurity = true`;
- mehanizam je **isključivo maintenance** i **nikada** ne smije biti dohvatljiv iz
  request/runtime aplikacijskih putanja.

### 5. Allowlist faze 3

Pošto je D-051 takođe prihvaćen, allowlist faze 3 sadrži **tačno četiri** tabele:

```text
users
practices
practice_membership_roles
platform_role_assignments
```

**Ne ulaze** u allowlist faze 3:

```text
practice_memberships
practice_settings
```

Obje dobijaju `FORCE RLS` tek u fazi 4 (`02` §17.3 i §22.13), pa u fazi 3 nemaju maintenance
prozor jer im on nije potreban.

### 6. Proširenje allowlista

Svako buduće proširenje allowlista zahtijeva **eksplicitnu prihvaćenu odluku** ili **eksplicitnu
klauzulu u paketu koji za tu tabelu uvodi `FORCE RLS`**. Tiho proširenje je zabranjeno.

## Razlog

Prozor je uzak, eksplicitan, transakcijski ograničen i mehanički provjerljiv. Sve odbijene
alternative su **trajne** promjene privilegijskog modela koje bi preživjele i nakon seeda; ova je
**prolazna** i pada zatvoreno. RLS ostaje uključen, pa ni u prozoru ne postoji stanje u kojem
tabela nema politike.

## Alternative

- **`BYPASSRLS` na `copilot_migrator`** — odbijeno: trajna privilegija koja preživljava seed i
  obara negativne privilege testove iz `02` §20.4.
- **`SECURITY DEFINER` seed funkcija** — odbijeno: uvodi konstrukciju koju su D-033 i D-047
  (klauzula 2) već odbili, i pod `FORCE RLS` bi i sama bila filtrirana.
- **Superuser seed credential** — odbijeno: četvrti credential izvan `02` §3.4 matrice.
- **Trajna owner-write politika za `copilot_migrator`** — odbijeno: trajno slabi model i mora se
  održavati na svakoj tabeli.
- **`DISABLE ROW LEVEL SECURITY` umjesto `NO FORCE`** — odbijeno: uklanja i politike za runtime
  role, pa prozor postaje stvarna sigurnosna rupa, a ne samo owner izuzetak.
- **Globalno isključivanje RLS-a tokom seeda** — odbijeno iz istog razloga, u većem obimu.

## Posljedice

- Paket `002` i seed faze 3 dobijaju eksplicitan, imenovan i testiran maintenance obrazac.
- Svaka `FORCE RLS` tabela koju pouzdani put popunjava mora biti allowlistana **prije** upisa.
- Steady-state asercije postaju trajni regresijski testovi, ne jednokratna provjera.
- Prekinut ili neuspio seed **ne smije** ostaviti tabelu bez `FORCE RLS`; to je zaseban test.

## Security/privacy uticaj

Runtime threat model se **ne mijenja**: nijedna runtime rola ne dobija novi grant, novu politiku
ni novu privilegiju. Prozor postoji isključivo na migration credentialu, izvan request putanje, i
zatvara se u istoj transakciji. Neuspjeh restore asercije abortira transakciju, pa `FORCE` ne može
ostati isključen ni pri grešci.

## Migration/rollout

Protokol se izvršava unutar paketa/seeda koji upisuje redove, nakon što tabela već ima
`ENABLE` + `FORCE RLS`. Redoslijed unutar paketa `002` iz `02` §22.2 se **ne mijenja**;
maintenance prozor dolazi nakon kreiranja politika. Normativni tekst je u `02` §23.4.

## Test dokaz

`02` §20.4 i §25.1.2; `08` §21.6. Obavezni minimum: steady-state `relrowsecurity = true` i
`relforcerowsecurity = true` za sve četiri allowlistane tabele nakon migracije i nakon seeda;
tabela izvan allowliste odbijena; prekinut/neuspio seed ostavlja `FORCE` uključenim;
`DISABLE ROW LEVEL SECURITY` se ne pojavljuje ni u jednoj forward migraciji ni seed skripti; nijedna rola
nema `BYPASSRLS`; nijedna `SECURITY DEFINER` funkcija ne postoji; mehanizam nije dohvatljiv iz
runtime koda.

## Zavisnosti

D-004, D-005, D-023, D-033, D-038, D-047, D-050, D-051.

---

# D-049 — Vlasništvo faza za `practice_settings` i minimalno čitanje u fazi 3

- **Status:** ACCEPTED
- **Datum:** 2026-08-14
- **Supersedes/amends:** **fazni dio D-028, klauzule 4.** Tvrdnja da puni
  `PATCH /practices/{practiceId}/settings` pripada fazi 3 je **POVUČENA**. Ne smije se tvrditi da
  D-028 klauzula 4 ostaje u cijelosti nepromijenjeno zadovoljena.
- **Kontekst/problem:** Faza 3 ne posjeduje tenant RLS nad `practice_settings` (`02` §17.1, §22.13,
  faza 4), ni `app.practice_id`, ni `PracticeContextGuard`, ni `TenantDatabaseService`. Funkcionalan
  settings endpoint u fazi 3 bi zato tražio write grant nad tabelom bez ijedne tenant politike koja
  taj write ograničava. Istovremeno `GET /me` faze 3 mora izračunati **uslovne** permisije
  (D-041, D-044), za šta su potrebna tačno dva flaga iz te iste tabele.

## Odluka

### 1. Vlasništvo faze 3

Paket `002_identity_and_practices` i dalje kreira **kompletnu prihvaćenu `practice_settings`
schemu**. Zadržavaju se: `version`; `check (version >= 1)`; `updated_by`; sva prihvaćena
konfiguraciona polja; **oba** uslovna approval flaga. Prihvaćeni optimistic-concurrency API ugovor
ostaje **dokumentovan** za svoju kasniju runtime implementaciju.

U fazi 3 se **ne registruje nijedna settings ruta**:

```text
NEMA GET   /api/v1/practices/{practiceId}/settings
NEMA PATCH /api/v1/practices/{practiceId}/settings
```

Nema runtime `INSERT`, `UPDATE` ni `DELETE` granta nad `practice_settings`.
`copilot_system` nema nijedan grant. `PUBLIC` nema nijedan grant.

### 2. Tačna čitljiva površina za `copilot_app`

`copilot_app` dobija **isključivo**:

```sql
grant select (practice_id, allow_mpa_approval, allow_billing_specialist_approval)
  on practice_settings to copilot_app;
```

Tačno ta površina je **potrebna i dovoljna** za izračun uslovnih permisija u `GET /me` faze 3.

**Nema table-level `SELECT`.** Nema pristupa kolonama `id`, `version`, `updated_at`, `updated_by`,
`configuration`, `retention_policy_code`, `billing_review_required`,
`require_reason_for_manual_change`, `ai_enabled`, `axenita_export_enabled`, ni bilo kojoj drugoj
koloni te tabele.

### 3. Imenovana izloženost faze 3

```text
PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE
```

Pošto `practice_settings` u fazi 3 još **nema** RLS faze 4, držalac dijeljenog `copilot_app`
credentiala može enumerisati `practice_id`, `allow_mpa_approval` i
`allow_billing_specialist_approval` **za svaki** `practice_settings` red, te utvrditi broj redova i
postojanje reda.

**To je stvarna izloženost sigurnosne konfiguracije i ne smije se umanjivati.** Prihvaćena je
**isključivo** za nepilotsko međustanje faze 3, jednako i pod istim uslovima kao izloženost iz
D-047 klauzule 18: na tom gateu ne postoje stvarni pilot korisnici ni podaci, a faza 4 je obavezna
prije faze 5.

### 4. Obavezni dokazi

Testovi moraju dokazati:

- da su čitljive **tačno tri** dozvoljene kolone;
- da `SELECT *` pada sa `42501`;
- da nedozvoljena kolona pada sa `42501` **i kada se koristi samo u predikatu ili u `ORDER BY`**;
- da **svaki** upis pada sa `42501`;
- da `copilot_system` pristup pada.

### 5. Vlasništvo faze 4

Paket `013_rls_policies` i faza 4 posjeduju:

- `practice_settings` `ENABLE ROW LEVEL SECURITY`;
- `practice_settings` `FORCE ROW LEVEL SECURITY`;
- tenant politiku `practice_id = app.practice_id`;
- proširenu čitljivu površinu koju settings endpoint zahtijeva;
- ograničen `UPDATE` grant;
- `GET /practices/{practiceId}/settings`;
- `PATCH /practices/{practiceId}/settings`;
- `ETag`; `If-Match`; `428 PRECONDITION_REQUIRED`; `409 VERSION_CONFLICT`; atomičan inkrement
  `version`.

**Grant i RLS politika koja ograničava tu write sposobnost uvode se zajedno, u istom paketu.**
Write grant bez pripadajuće tenant politike je zabranjen.

### 6. Odnos prema D-029 i D-044

**Schema odluka D-029 ostaje prihvaćena i nepromijenjena.** Mijenja se isključivo **vrijeme
implementacije i testiranja** onog njenog dijela koji je naslijedio raniju faznu pripadnost iz
D-028 klauzule 4: optimistic-locking runtime testovi za `practice_settings` pripadaju **fazi 4**.
Za preostalih pet resursa iz D-029 ništa se ne mijenja.

**D-044 ostaje semantički nepromijenjen:** `practice.settings.read` i `practice.settings.manage`
ostaju isključivo `PRACTICE_ADMIN`. Mijenja se **samo faza u kojoj se endpoint implementira**.
Nijedna permisija, rola ni ćelija matrice se ne mijenja; `15` ostaje nepromijenjen.

### 7. Pojašnjenje vlasništva permission resolvera

Ovo je pojašnjenje već postojećeg vlasništva, **ne nova permission odluka**.

Faza 3 posjeduje: prihvaćenu reprezentaciju matrice; konformnost matrice; čitanje uslovne
postavke; izvođenje `permissions[]` za `GET /me`.

Faza 4 posjeduje: generalizovani tenant endpoint authorization/enforcement pipeline.

## Razlog

Uslovna permisija u `GET /me` traži **dva boolean flaga**, ne settings dokument. Column grant od
tri kolone je najmanja površina koja zadovoljava zamrznuti ugovor, a istovremeno ne otvara nijedan
write put nad tabelom koja u fazi 3 nema nijednu politiku koja bi ga ograničila. Pravilo "grant i
politika koja ga ograničava se uvode zajedno" je isti obrazac koji je već prihvaćen za tenant
tabele u `02` §18.1.

## Alternative

- **Puni settings endpoint u fazi 3** — odbijeno: zahtijeva `UPDATE` grant nad tabelom bez tenant
  politike, bez `app.practice_id` i bez `PracticeContextGuard`-a.
- **Table-level `SELECT` nad `practice_settings` u fazi 3** — odbijeno: izlaže `configuration`,
  `retention_policy_code` i ostale kolone koje nijedan konzument faze 3 ne traži.
- **Denormalizacija flagova u `practices`** — odbijeno: duplira izvor istine za sigurnosnu
  konfiguraciju i traži sinhronizaciju.
- **Odgađanje uslovnih permisija u `GET /me` do faze 4** — odbijeno: `permissions[]` je dio
  zamršenog zamrznutog `/me` ugovora (`03` §10) koji faza 3 mora ispuniti.
- **Read-only `GET` settings ruta u fazi 3** — odbijeno: traži širu čitljivu površinu od tri
  kolone i uvodi rutu bez tenant enforcement pipelinea.

## Posljedice

- `03` §10 settings sekcije dobijaju eksplicitnu faznu oznaku; nijedan implementator faze 3 više
  ne dobija uputu da kreira funkcionalan settings endpoint.
- `04`, `05` i `07` gube settings endpoint iz obuhvata faze 3 i dobijaju ga u fazi 4.
- Optimistic-locking test ugovor za `practice_settings` (`08` §10) se izvršava u fazi 4.
- Imenovana izloženost postaje trajno dokumentovana stavka koju faza 4 zatvara.
- Nijedna permisija, rola, tabela, kolona ni migration paket se ne uvodi.

## Security/privacy uticaj

Uvodi se **realna, imenovana i vremenski ograničena** izloženost sigurnosne konfiguracije u fazi 3
(klauzula 3). U zamjenu se **uklanja** znatno veći rizik: write grant nad `practice_settings` bez
ijedne tenant politike. `configuration` ne sadrži secrets (`02` §6.4), pa izloženost obuhvata
isključivo dva approval flaga i tenant identifikator. Faza 4 je zatvara RLS-om.

## Migration/rollout

Paket `002` kreira punu schemu i **isključivo** trokolonski `SELECT` grant. Paket `013` dodaje
`ENABLE` + `FORCE RLS`, tenant politiku, proširen `SELECT` i ograničen `UPDATE` — **zajedno**.
Nijedan novi broj paketa se ne uvodi.

## Test dokaz

`02` §25.1.3; `08` §10 i §21.7. Minimum: tri dozvoljene kolone čitljive; `SELECT *` → `42501`;
svaka nedozvoljena kolona → `42501`, uključujući upotrebu isključivo u `WHERE` i `ORDER BY`;
`INSERT`/`UPDATE`/`DELETE` → `42501`; `copilot_system` odbijen; nijedna settings ruta nije
registrovana u fazi 3; uslovne permisije u `GET /me` tačne za oba stanja oba flaga.

## Zavisnosti

D-009, D-028, D-029, D-038, D-041, D-044, D-047, D-051.

- **Amandman (D-053, 2026-08-16) — isključivo prebrojavanje površine faze 4:** Formulacije
  „proširena čitljiva površina koju settings endpoint zahtijeva" i „ograničen `UPDATE` grant" iz
  klauzule 5 čitaju se od sada kroz D-053, dijelove A i B: `SELECT` je **tačno devet** imenovanih
  kolona, `UPDATE` je **tačno devet** imenovanih kolona, `updated_by` ostaje izvan obje površine,
  a `GET`/`PATCH` vraćaju jednu zamrznutu osmopoljnu reprezentaciju sa `version` isključivo u
  `ETag`-u. **Klauzule 1–4, 6 i 7 se ne mijenjaju**; trokolonska površina faze 3 ostaje
  **nepromijenjena** i postaje strogi podskup, bez ijednog opozvanog granta. Pravilo „grant i
  politika koja ga ograničava se uvode zajedno" ostaje **nepromijenjeno**. Dodatno, D-053 dio D
  rekonsiliše `GET /me` uslovni read sa tenant RLS-om te tabele, **bez ijednog slabljenja**
  politike. Vidi D-053.

---

# D-050 — Kanonski workflow autorstva Prisma migracija

- **Status:** ACCEPTED
- **Datum:** 2026-08-14
- **Kontekst/problem:** Migracija `001` **namjerno** validira stvarno vlasništvo i privilegije nad
  bazom i schemom. `prisma migrate dev --create-only` kreira i zahtijeva shadow bazu čije je
  podrazumijevano vlasništvo i privilegije nad `public` schemom **strukturno nespojivo** sa tim
  namjernim guardovima migracije `001`.

## Odluka

### 1. `prisma migrate dev --create-only` nije kanonski mehanizam

Za ovaj repozitorij `prisma migrate dev --create-only` **nije** kanonski mehanizam autorstva
migracija. **Nijedan guard migracije `001` se ne smije oslabiti** da bi shadow baza radila.

### 2. Kanonski tok autorstva (Prisma 7.9.1)

1. koristiti **ispravno bootstrapovanu tekuću kanonsku migration bazu** kao izvorno stanje;
2. generisati inkrementalni SQL kandidat:

   ```powershell
   npx prisma migrate diff `
     --from-config-datasource `
     --to-schema=prisma/schema.prisma `
     --script `
     -o prisma/migrations/<timestamp>_<package>/migration.sql
   ```

3. ručno dopuniti custom SQL za: constrainte koje Prisma ne izražava; grants; revokes; RLS;
   politike; funkcije; sigurnosne asercije; komentare;
4. **ljudski pregled** kompletnog generisanog **i** ručno napisanog SQL-a;
5. validirati kompletan migration lanac na **jednokratnoj, ispravno bootstrapovanoj praznoj bazi**;
6. primijeniti kroz `prisma migrate deploy`;
7. mehanički verifikovati schemu, vlasništvo, privilegije i sigurnosne objekte.

### 3. Normativne tvrdnje

- izlaz `migrate diff` je **kandidat, ne istina**;
- `prisma db push` ostaje **zabranjen**;
- primijenjene migracije ostaju **immutable**;
- `prisma migrate deploy` ostaje kanonski put primjene i deploymenta;
- `--from-empty` **nije** normalni izvor inkrementalnog autorstva;
- `--from-migrations` ostaje neprikladan jer zahtijeva shadow bazu;
- **nijedan guard migracije `001` se ne smije oslabiti** radi Prisma shadow baze.

### 4. Zatečene formulacije koje ovaj tok zamjenjuje

Sljedeći raniji tekstovi opisuju `--create-only` kao mjesto/mehanizam ručnog SQL-a i **od sada se
čitaju kroz D-050**; njihova sigurnosna i schema semantika se **ne mijenja**, mijenja se isključivo
imenovani mehanizam autorstva:

- D-030 (`unique nulls not distinct` kao custom migration SQL);
- D-047, `Migration/rollout` (politike, `FORCE RLS`, column grants i funkcije kao custom SQL);
- `02` §12.3, §22.8 i §26.2;
- `00` §6.2; `10` §7 i §13; `11` §2; `AGENTS.md` §5.1.

Očekivani `migrate diff` drift na objektima koje Prisma ne modelira ostaje **očekivan i ne
ispravlja se** (D-030; `02` §26.2).

## Razlog

Guardovi migracije `001` su namjerna sigurnosna kontrola vlasništva i privilegija, a ne
implementacijski detalj. Alat koji zahtijeva okruženje strukturno nespojivo sa tom kontrolom mora
ustupiti mjesto alatu koji je ne zahtijeva. `migrate diff` daje isti generisani SQL bez shadow
baze, a ljudski pregled i validacija na praznoj bazi zadržavaju sve dosadašnje garancije.

## Alternative

- **Oslabiti guardove migracije `001`** — odbijeno: žrtvuje stvarnu sigurnosnu kontrolu radi
  udobnosti alata.
- **Zaseban shadow database URL sa širim privilegijama** — odbijeno: uvodi credential sa
  privilegijama koje `02` §3.4 ne poznaje, i i dalje ne prolazi guardove.
- **`--from-empty` kao izvor** — odbijeno: proizvodi pun, a ne inkrementalan skript, pa svaki
  kandidat traži ručno uklanjanje već primijenjenih objekata.
- **`--from-migrations`** — odbijeno: interno zahtijeva shadow bazu, pa dijeli isti defekt.
- **`prisma db push`** — odbijeno: već zabranjeno (`00` §6.2, `AGENTS.md` §3 i §12).

## Posljedice

- `AGENTS.md`, `00`, `10` i `11` gube `migrate dev --create-only` kao operativnu uputu.
- `migrate deploy` ostaje jedini kanonski put primjene; ništa se ne uklanja iz deploy toka.
- Skripta `db:migrate:dev` u `package.json` **nije** kanonski put autorstva; njeno usklađivanje je
  implementacijski zadatak, ne dio ove dokumentacione odluke.
- Korak 5 (validacija na jednokratnoj praznoj bazi) postaje obavezan dio DoD-a za migraciju.

## Security/privacy uticaj

Pozitivan: namjerni guardovi vlasništva i privilegija iz migracije `001` ostaju netaknuti. Nijedan
novi credential, rola ni privilegija se ne uvodi.

## Migration/rollout

Primjenjuje se od paketa `002` nadalje. Već primijenjene migracije se **ne prepisuju**.

## Test dokaz

`08` §5 i §5.1; `11` §2. Minimum: kompletan lanac prolazi na jednokratnoj, ispravno bootstrapovanoj
praznoj bazi; `migrate deploy` prolazi; mehanička verifikacija schema/ownership/privilegija/
sigurnosnih objekata prolazi; `db push` se ne pojavljuje ni u jednoj skripti; nijedan guard
migracije `001` nije oslabljen.

## Zavisnosti

D-004, D-005, D-030, D-047, D-048.

---

# D-051 — Premještanje user-scoped RLS-a u paket `002` i fazu 3

- **Status:** ACCEPTED
- **Datum:** 2026-08-14
- **Amandman na:** D-047, klauzule 16 i 18, i svu izvedenu dokumentaciju o vlasništvu paketa i faza.
- **Kontekst/problem:** `02` §17.2 i §17.4 su **već prihvaćeni** sigurnosni artefakti čije politike
  zavise isključivo od `app.user_id` — varijable koju faza 3 već uspostavlja kroz `set_user_context`
  (D-047, klauzula 16). Njihovo držanje u fazi 4 ostavlja `platform_role_assignments` i
  `practice_membership_roles` bez RLS-a upravo u fazi u kojoj ih `GET /me` čita.

## Odluka

### 1. Šta se premješta

Kompletni, **već prihvaćeni** artefakti §17.2 i §17.4 premještaju se iz `013_rls_policies`/faze 4
u `002_identity_and_practices`/fazu 3.

**`platform_role_assignments` (§17.2):**

- `ENABLE ROW LEVEL SECURITY`;
- `FORCE ROW LEVEL SECURITY`;
- politika `platform_role_assignments_self_select`;
- politika `platform_role_assignments_system_select`.

**`practice_membership_roles` (§17.4):**

- `ENABLE ROW LEVEL SECURITY`;
- `FORCE ROW LEVEL SECURITY`;
- politika `practice_membership_roles_self_select`.

**Imena politika ostaju nepromijenjena. Tijela politika ostaju nepromijenjena.**

### 2. `platform_role_assignments` — nepromijenjena semantika

Self politika za `copilot_app` ostaje zasnovana **isključivo** na `app.user_id` i **ne koristi**
`app.practice_id`, `set_request_context`, `PracticeContextGuard` ni `TenantDatabaseService`.

`copilot_system` zadržava postojeće prihvaćeno `SELECT` + `USING (true)` ponašanje. `PUBLIC` nema
pristup. Postojeći prihvaćeni grantovi ostaju **table-level** tamo gdje `02` §20.2 i §20.4
zahtijevaju tačno taj skup privilegija.

**Invarijanta D-023, klauzula 11 — `copilot_app` NEMA neograničen `SELECT` nad
`platform_role_assignments` — važi od faze 3 nadalje.**

### 3. Pojašnjenje semantike tekućih platform rola

`platformRoles[]` u `GET /me` predstavlja **tekuće, neopozvane** dodjele platform rola. Doprinose
isključivo redovi gdje je `revoked_at IS NULL`.

Ova odluka **ne uvodi** revoke administracijski endpoint, **ne uvodi** nijedan novi write grant i
**ne stvara** funkcionalnost administracije rola. To je pojašnjenje čitanja, ne nova sposobnost.

### 4. `practice_membership_roles` — nepromijenjena semantika

Prihvaćeni `EXISTS` filter i dalje koristi `practice_memberships` i uslov
`pm.user_id = app.user_id`. Politika **ne zahtijeva** §17.3 RLS nad `practice_memberships` da bi
radila. Podupirući `SELECT` grant nad `practice_memberships` ostaje **obavezan** — ista dokazana
asimetrija iz D-047, klauzule 7.

### 5. Šta se izričito **ne** premješta

```text
practice_memberships §17.3 RLS   -> paket 013 / faza 4
practice_settings RLS            -> paket 013 / faza 4
set_request_context              -> faza 4
uspostava app.practice_id        -> faza 4
PracticeContextGuard             -> faza 4
TenantDatabaseService            -> faza 4
```

**Anotacija (D-056, 2026-08-20) — nadiđen isključivo red `TenantDatabaseService`.** Blok iznad je
**historijski i ostaje nepromijenjen**. Njegov posljednji red — `TenantDatabaseService -> faza 4` —
**nadiđen je odlukom D-056, dio A**: konkretan facade **nije** deliverable zatvaranja faze 4, nego
je **uslovno odgođen** dok ga stvarni tenant business modul ne zatraži. **Preostalih pet redova
bloka ostaje na snazi u cijelosti** — `practice_memberships` §17.3 RLS, `practice_settings` RLS,
`set_request_context` i uspostava `app.practice_id` ostaju u fazi 4, a `PracticeContextGuard` ostaje
naziv faze tenant admisije (D-054, klauzule 2–4). **Nijedan sigurnosni zahtjev ovog bloka nije
uklonjen ni oslabljen.** Vidi D-056.

### 6. Vlasništvo paketa

Paket `002_identity_and_practices` postaje **konačni vlasnik** §17.2 i §17.4.

**Paket `013_rls_policies` ih ne smije ponovo kreirati, zamijeniti ni prepisati.** Faza 4 smije
dodati isključivo preostale tenant sigurnosne artefakte koje sama posjeduje.

### 7. Odnos prema D-048

Pošto ova odluka uvodi `FORCE RLS` za dvije tabele koje faza 3 seeduje, allowlist maintenance
protokola D-048 za fazu 3 obuhvata i `practice_membership_roles` i `platform_role_assignments`.

### 8. Šta se ne mijenja

Nijedna nova rola. Nijedna nova permisija. Nijedna izmjena permission matrice. `15` ostaje
nepromijenjen.

## Razlog

Oba obrasca su **bootstrap-safe po konstrukciji** i zavise isključivo od `app.user_id`, koji faza 3
već uspostavlja. Držanje njihove RLS u fazi 4 nije sigurnosna odluka nego zaostatak sekvenciranja:
ostavlja dvije tabele koje `GET /me` faze 3 stvarno čita bez ijedne politike. Premještanje je isti
argument koji je D-047 klauzula 17 već prihvatio za `set_user_context`.

## Alternative

- **Zadržati status quo** — odbijeno: `GET /me` faze 3 čita obje tabele bez ijedne politike, iako
  su politike već prihvaćene i primjenjive.
- **Premjestiti i §17.3** — odbijeno: `practice_memberships` je vezan za `set_request_context` i
  tenant bootstrap faze 4; D-047 klauzula 16 ga izričito zadržava tamo.
- **Premjestiti samo §17.4** — odbijeno: ostavlja `platform_role_assignments` bez RLS-a, a
  `GET /me` ga čita u istoj transakciji.
- **Uvesti novi migration paket za premještene artefakte** — odbijeno: `02` §22 brojevi su
  redoslijed zavisnosti; novi broj bi bio čista renumeracija.

## Posljedice

- Paket `002` dobija dvije `ENABLE` + `FORCE RLS` tabele i tri politike više.
- Paket `013` ih gubi i **ne smije** ih rekreirati; `02` §22.13 se sužava.
- Test vlasništvo za `08` §24.4 i za §17.2 asercije prelazi u fazu 3.
- D-048 allowlist faze 3 raste sa dvije na četiri tabele.
- Međustanje faze 3 iz D-047, klauzule 18, **sužava se**: generička vidljivost ostaje isključivo
  nad `practice_memberships`, koju zatvara faza 4.
- Nijedna politika se ne prepisuje niti mijenja sadržajno; mijenja se isključivo paket i faza.

## Security/privacy uticaj

Strogo poboljšanje: dvije tabele koje faza 3 stvarno čita dobijaju `FORCE RLS` i self-scoped
politike **u istoj fazi**, umjesto jednu fazu kasnije. Nijedan grant se ne proširuje; nijedna
politika se ne oslabljuje. Invarijanta D-023 klauzule 11 stupa na snagu ranije.

## Migration/rollout

Unutar paketa `002` redoslijed ostaje: tabele → grantovi → `ENABLE`/`FORCE RLS` → politike →
funkcije. Politika §17.4 se kreira **nakon** `practice_memberships` i njegovog `SELECT` granta.
Nijedan novi broj paketa se ne uvodi. Rollback je nedestruktivan — `DROP POLICY` ×3 i
`DISABLE ROW LEVEL SECURITY` nad dvije tabele.

## Test dokaz

`02` §20.4 i §25.1.4; `08` §21.6, §24.4 i §26.1. Minimum: obje tabele nose `relrowsecurity = true`
i `relforcerowsecurity = true` već nakon paketa `002`; korisnik A ne čita platform rolu korisnika B;
bez `app.user_id` obje tabele vraćaju nula redova; `copilot_system` vidi sve redove
`platform_role_assignments` i **nijedan** red `practice_membership_roles`; §17.4 politika radi bez
§17.3; ukidanje `SELECT` granta nad `practice_memberships` obara §17.4 politiku sa `42501`;
`platformRoles[]` sadrži isključivo redove sa `revoked_at IS NULL`; paket `013` ne sadrži nijedan
`CREATE POLICY` za te dvije tabele.

## Zavisnosti

D-023, D-033, D-038, D-047, D-048.

---

# D-052 — Odgođeni RLS slice `review_decision_change_links` i allowlist faze 4

- **Status:** ACCEPTED
- **Datum:** 2026-08-16
- **Amandman na:** D-046, klauzule 25–33 — isključivo u dijelu **izvršne faze** RLS/grant slicea; i
  D-048, §23.4.4 — u dijelu **eksplicitnog proširenja allowliste** za tabele kojima fazu 4 prvi put
  uvodi `FORCE RLS`. Amandman obuhvata i svu izvedenu dokumentaciju o fazi izvršenja i allowlisti.
- **Kontekst/problem:** Dvije nezavisne kontradikcije otkrivene su na gateu P4-0, prije planiranja
  faze 4.

  **OD-1 — nemoguća zavisnost.** Nekoliko kanonskih izvora dodjeljuje `ENABLE`/`FORCE ROW LEVEL
  SECURITY`, tenant politiku i grantove nad `review_decision_change_links` **fazi 4** kroz paket
  `013_rls_policies` (`02` §17.0, §22.13; `04` §6.3; `05` Faza 4; `07` Faza 4; `08` §26.1), dok
  **samu tabelu kreira paket `009_review_approvals` u fazi 10** (`02` §22.9; `04` §12.3, aktivnost
  13; `07` Faza 10). Tabela **trenutno ne postoji**. Faza 4 bi time morala izvršiti RLS i grantove
  nad nepostojećim objektom, što nije izvodivo, pa faza 4 **ne bi mogla istinito zatvoriti**.
  Repozitorij je već bio interno nesaglasan: `04` §12.3, aktivnost 14, isti RLS slice navodi kao
  aktivnost **faze 10**, dok ga `04` §6.3 navodi kao obuhvat **faze 4**.

  **OD-2 — allowlist.** Faza 4 prvi put uvodi `FORCE ROW LEVEL SECURITY` nad `practice_memberships`
  i `practice_settings` (`02` §17.0, §17.3, §22.13; D-049, klauzula 5). Postojeća D-048 allowlist
  (`02` §23.4.4) je **allowlist faze 3** i te dvije tabele **izričito isključuje**. Pouzdani seed
  put u njih upisuje. `02` §23.4.4 dopušta proširenje **isključivo** kroz eksplicitnu prihvaćenu
  odluku ili eksplicitnu klauzulu paketa koji za tu tabelu uvodi `FORCE RLS`; **tiho proširenje je
  zabranjeno**, a `08` §26.2 obara phase gate ako do njega dođe.

## Odluka

# Dio A — `review_decision_change_links`

### A.1 Faza 4 ne kreira tabelu

Faza 4 **ne kreira** `review_decision_change_links` i **ne uvodi** nijedan njen schema objekat.

### A.2 Faza 4 ne piše RLS ni grantove nad nepostojećom tabelom

Faza 4 **ne implementira** `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, tenant politiku
ni ijedan grant nad `review_decision_change_links`. Nijedan artefakt faze 4 ne smije referencirati
tu tabelu kao postojeću.

### A.3 Vlasništvo schema objekata — nepromijenjeno

Schema vlasništvo ostaje **paket `009_review_approvals`, faza 10** (`02` §22.9). Ova odluka ga **ne
dira**.

### A.4 Vlasništvo RLS/grant koncepta — nepromijenjeno

Konceptualno vlasništvo RLS-a i grantova ostaje **paket `013_rls_policies`** (`02` §22.13). RLS se
**ne premješta** u paket `009`.

### A.5 Izvršna tačka — odgođena u fazu 10

Slice paketa `013_rls_policies` koji se odnosi na `review_decision_change_links` **izvršava se u
fazi 10, neposredno nakon što paket `009_review_approvals` kreira tabelu**.

Razdvajaju se dva pojma koja je ranija dokumentacija spajala:

```text
vlasništvo paketa   -> 013_rls_policies   (nepromijenjeno)
izvršna faza        -> faza 10            (odgođeno ovom odlukom, ranije faza 4)
```

### A.6 Nijedan paket se ne uvodi ni renumeriše

**Ne uvodi se nijedan novi broj migration paketa** i **nijedan postojeći se ne renumeriše.**
Brojevi u `02` §22 ostaju redoslijed zavisnosti, ne brojevi faza (`04` §6.2).

### A.7 Rekonsilijacija checkliste i testova

Stavke checkliste i test grupe koje zahtijevaju postojanje `review_decision_change_links` **prelaze
u fazu 10**. Nijedna se **ne briše**, **ne oslabljuje** i **ne označava završenom**. Faza 4
zadržava isključivo negativne, u fazi 4 provjerljive tvrdnje — da tabela nije kreirana i da paket
`013` u fazi 4 ne sadrži nijedan RLS objekat za nju.

### A.8 Faza 4 zadržava generički tenant RLS obrazac

Faza 4 i dalje **uspostavlja generički tenant RLS obrazac i test harness** koji kasnije faze
proširuju (`04` §6.3). `practice_settings` ostaje tenant tabela na kojoj se obrazac primjenjuje u
punom obimu (D-049, klauzula 5). Odgođen je **jedan slice nad jednom nepostojećom tabelom**, ne
obrazac.

### A.9 Sigurnosne semantike se ne mijenjaju

Konačni zahtjevi iz D-046, klauzula 25–33, ostaju **doslovno nepromijenjeni**:

- `ENABLE` **i** `FORCE ROW LEVEL SECURITY`;
- standardna tenant politika `practice_id = app.practice_id` iz `02` §17.1;
- **nijedan bootstrap izuzetak** — tenant kontekst mora već biti uspostavljen prije čitanja;
- `copilot_app` dobija **isključivo** `SELECT` i `INSERT`; **bez** `UPDATE`; **bez** `DELETE`;
- `copilot_system` **ne dobija** nijedan grant (D-023);
- `PUBLIC` **ne dobija** nijedan grant;
- owner ostaje `copilot_migrator`;
- cross-tenant čitanje je odbijeno.

**Mijenja se isključivo faza izvršenja i tačka zavisnosti — nijedna sigurnosna semantika.**

# Dio B — Proširenje D-048 allowliste u fazi 4

### B.1 Eksplicitno ovlaštenje

Ovo je **eksplicitna prihvaćena odluka** koju `02` §23.4.4 zahtijeva. Kada paket
`013_rls_policies` uvede `FORCE ROW LEVEL SECURITY` za `practice_memberships` i
`practice_settings`, D-048 seed/maintenance allowlist **se proširuje** tačno onim tabelama faze 4
u koje `seed.ts` stvarno upisuje.

### B.2 Obuhvat proširenja

Pouzdani seed put upisuje u **obje** tabele, pa allowlist faze 4 obuhvata **tačno dvije** tabele:

```text
practice_memberships
practice_settings
```

Allowlist faze 3 (`users`, `practices`, `practice_membership_roles`, `platform_role_assignments`)
ostaje **nepromijenjena**; faza 4 je **proširuje**, ne zamjenjuje.

### B.3 Obavezni uslovi proširenja

- proširenje je **eksplicitno**, nikada tiho;
- `FORCE RLS` se **obnavlja nakon seeda**;
- **putevi neuspjeha i rollbacka obnavljaju `FORCE RLS`**;
- **bez `BYPASSRLS`**;
- **bez `SECURITY DEFINER` zaobilaznice**;
- **bez superuser runtime puta**;
- **bez `DISABLE ROW LEVEL SECURITY`**;
- **bez trajne owner-write politike**;
- testovi dokazuju steady-state `ENABLE` **i** `FORCE` **prije i nakon** seeda.

Protokol iz `02` §23.4.3 i normativna pravila iz `02` §23.4.5 primjenjuju se **nepromijenjeni**.

### B.4 Ova odluka ništa ne implementira

Ova odluka **evidentira ovlaštenje**. `seed.ts`, migracije i allowlist kod se ovom odlukom **ne
mijenjaju**. Implementacija pripada implementacijskom gateu faze 4.

## Razlog

**Dio A.** Zavisnost je fizička, ne stilska: RLS politika i grantovi ne mogu postojati nad tabelom
koja nije kreirana. Držanje slicea u fazi 4 čini fazu 4 nezatvorivom bez neistinite tvrdnje.
Odgađanje **izvršenja** uz zadržavanje **vlasništva paketa** rješava kontradikciju bez ijedne
sigurnosne koncesije i bez renumeracije — isti obrazac razdvajanja koji su D-047 klauzula 17 i
D-051 već primijenili na vlasništvo paketa.

**Dio B.** `02` §23.4.4 traži eksplicitno ovlaštenje prije proširenja, a `08` §26.2 obara gate na
tihom proširenju. Bez ove klauzule faza 4 bi se našla u mrtvom uglu: `FORCE RLS` nad tabelama koje
seed puni, bez ijednog dozvoljenog načina da ih seed popuni. Isti obrazac je D-051, klauzula 7,
već primijenio za fazu 3.

## Alternative

- **Premjestiti kreiranje tabele u fazu 4** — odbijeno: povlači cijeli D-046 review/approval domen
  šest faza ranije, bez ijednog potrošača u fazi 4.
- **Premjestiti RLS slice u paket `009`** — odbijeno: D-046 i `02` §22.9 izričito drže RLS izvan
  paketa `009`; premještanje bi oborilo §24a.6 introspekciju vlasništva.
- **Uvesti novi migration paket za odgođeni slice** — odbijeno: `02` §22 brojevi su redoslijed
  zavisnosti; novi broj bi bio čista renumeracija, koju ova odluka izričito zabranjuje.
- **Ostaviti stavke u fazi 4 i označiti ih „nije primjenjivo"** — odbijeno: gubi konačni sigurnosni
  zahtjev i dopušta da faza 10 prođe bez RLS-a nad tabelom.
- **Tiho proširiti allowlist pri implementaciji** — odbijeno: `02` §23.4.4 to izričito zabranjuje,
  a `08` §26.2 obara phase gate.

## Posljedice

- `02` §22.13 se **sužava** za fazu 4: slice `review_decision_change_links` ostaje u paketu, ali se
  izvršava u fazi 10.
- `04` §6.3 gubi `review_decision_change_links` iz obuhvata faze 4; `04` §12.3, aktivnost 14,
  postaje jedina izvršna tačka i time prestaje kontradikcija unutar `04`.
- `05` Faza 4 gubi trinaest neostvarivih stavki; iste stavke, **nepromijenjene**, ulaze u `05`
  Faza 10.
- `08` §24a.5 prelazi iz faze 4 u fazu 10; vlasništvo paketa ostaje `013_rls_policies`.
- `08` §26.2 D-046 blok postaje isključivo gate faze 10.
- D-048 allowlist dobija **imenovanu allowlistu faze 4** sa tačno dvije tabele.
- Faza 4 postaje **istinito zatvoriva** bez `review_decision_change_links`.
- Nijedan broj paketa nije dodan ni renumerisan. Nijedan endpoint, payload, permisija, rola ni
  error kod nije dodirnut.

## Security/privacy uticaj

**Neutralan po dijelu A, strogo pozitivan po dijelu B.**

Dio A ne uklanja, ne oslabljuje i ne odgađa nijednu zaštitu nad postojećim podacima:
`review_decision_change_links` ne postoji, ne sadrži nijedan red i nije dohvatljiva. Tabela dobija
`ENABLE` + `FORCE RLS` i konačne grantove **u istoj fazi u kojoj prvi put može primiti podatak** —
nikada ne postoji prozor u kojem tabela sa podacima nema RLS.

Dio B sprječava stvarnu regresiju: bez njega bi implementacija faze 4 bila gurnuta prema
`BYPASSRLS`, `SECURITY DEFINER` ili `DISABLE ROW LEVEL SECURITY` zaobilaznici. Klauzula B.3
zabranjuje sve četiri i zahtijeva dokaz steady-statea prije i nakon seeda.

## Migration/rollout

Redoslijed u fazi 10 ostaje: paket `009_review_approvals` kreira tabelu, constrainte i grantove →
odgođeni slice paketa `013_rls_policies` dodaje `ENABLE`, `FORCE` i tenant politiku. Nijedan novi
broj paketa. Rollback odgođenog slicea je nedestruktivan — `DROP POLICY` i
`DISABLE ROW LEVEL SECURITY` nad jednom tabelom, u okviru poništavanja migracije (`02` §23.4.5).

Proširenje allowliste iz dijela B izvršava se **u paketu `013_rls_policies`**, u istoj migraciji
koja tim tabelama uvodi `FORCE RLS`, i **ne mijenja** protokol iz `02` §23.4.3.

## Test dokaz

`02` §25.2.2; `05` Faze 4 i 10; `08` §21.8, §24a.5, §26.1 i §26.2.

Minimum za fazu 4: `review_decision_change_links` **ne postoji** nakon faze 4; paket
`013_rls_policies` u fazi 4 ne sadrži nijedan RLS objekat za nju; generički tenant RLS obrazac i
harness postoje i dokazani su nad `practice_settings`; obje tabele allowliste faze 4 nose
steady-state `relrowsecurity = true` i `relforcerowsecurity = true` **prije i nakon** seeda;
prekinut seed ne ostavlja `FORCE` isključenim; nijedna `BYPASSRLS` rola, `SECURITY DEFINER`
funkcija ni `DISABLE ROW LEVEL SECURITY` ne postoji.

Minimum za fazu 10: sve tvrdnje `08` §24a.5 prolaze nakon što paket `009` kreira tabelu.

## Zavisnosti

D-023, D-029, D-033, D-038, D-046, D-047, D-048, D-049, D-050, D-051.

---

# D-053 — Zamrznut settings ugovor, tačna `practice_settings` runtime površina, redoslijed autorizacije i adaptacija `GET /me` u fazi 4

- **Status:** ACCEPTED
- **Datum:** 2026-08-16
- **Amandman na:** **D-049, klauzula 5** — isključivo u dijelu u kojem stoji neodređena
  formulacija „proširena čitljiva površina koju settings endpoint zahtijeva" i „ograničen `UPDATE`
  grant"; obje se ovom odlukom **zamjenjuju tačnim, prebrojivim listama kolona**. **D-047,
  klauzula 10** se ne mijenja, nego se **restituira** u tri izvedena dokumenta koja su je
  ispustila. **D-041, D-044 i D-049, klauzula 3** ostaju nepromijenjeni u dijelu koji definiše
  uslovne permisije. Amandman obuhvata i svu izvedenu dokumentaciju o settings ugovoru,
  `practice_settings` grantovima, redoslijedu autorizacije i `GET /me` runtime putu.
- **Dopuna (D-055, 2026-08-19):** Mehanika `If-Match`-a iz **dijela B** je **dopunjena, ne izmijenjena**. **D-055** dodaje ono što ova odluka ne navodi: prihvaćenu gramatiku jednog jakog verzijskog taga `"<N>"`, `400 VALIDATION_ERROR` za **sintaksno neprihvaćen** validator, jaku i tačnu komparaciju na `PATCH`-u, `400 VALIDATION_ERROR` za **prazno** tijelo, zabranu aplikacijskog pre-reada i `409 VERSION_CONFLICT` za **nula pogođenih redova iz oba uzroka**. `428` za **nedostajući** `If-Match` i `409` za **zastarjeli** ostaju **doslovno nepromijenjeni**, kao i osmopoljna reprezentacija iz dijela A i obje devetokolonske površine. **Nijedna klauzula ove odluke se ne opoziva.** D-055 dodatno kanonizuje autorizovan `304` na `GET` revalidaciji i invarijant nedostajućeg reda (`500 INTERNAL_ERROR`). Vidi D-055.
- **Kontekst/problem:** Tri blokera i jedna dodatna regresija otkriveni su na gateu P4-1, prije
  autorizacije implementacije faze 4.

  **OD-1 — settings reprezentacija nije kanonizovana.** `02` §6.4, §18.1 i §22.13, `04` §6.3, `05`
  Faza 4 i `07` Faza 4 zahtijevaju „proširenu čitljivu površinu koju settings endpoint zahtijeva",
  ali **nijedan kanonski izvor ne navodi koje su to kolone**, niti kako izgleda tijelo odgovora
  `GET`/`PATCH /practices/{practiceId}/settings`. `03` §10 navodi polja **zahtjeva** `PATCH`-a, ali
  ne i **odgovora**. Implementator faze 4 bi morao izmisliti i grant i reprezentaciju, a `02`
  §20.2b izričito zabranjuje table-level `SELECT`.

  **OD-2 — write površina nije razriješena.** Ista formulacija „ograničen `UPDATE` grant" ne
  odgovara na tri pitanja bez kojih optimistic locking iz D-029 nije izvodiv: smije li `copilot_app`
  pisati `version`, `updated_at` i `updated_by`. Bez `UPDATE (version)` atomičan inkrement iz `03`
  §5.2 nije moguć bez trigera, `SECURITY DEFINER` funkcije ili izmjene paketa `014`.

  **OD-3 — zastarjeli redoslijed autorizacije.** `04` §6.2.1, `05` „Redoslijed autorizacije",
  `07` Faza 4 i `08` §24.6 ponavljaju **desetokoračni** redoslijed koji **izostavlja**
  membership-scoped čitanje `status`-a tražene ordinacije prije `set_request_context`. Taj korak je
  obavezan po **D-047, klauzuli 10**, i autoritativni **jedanaestokoračni** redoslijed već stoji u
  `03` §3.7.1 i u dijagramu `14` §2. Izvedeni dokumenti su zaostali za autoritativnim.

  **OD-4 — regresija `GET /me` nakon `practice_settings` RLS-a.** Mehanički provjereno nad
  zatečenim kodom faze 3: `GET /me` izvodi uslovne permisije čitanjem `allow_mpa_approval` i
  `allow_billing_specialist_approval`, a taj se read izvršava **bez ikakvog tenant konteksta** —
  `/me` je neutralna ruta, ne traži `X-Practice-ID` i nikada ne poziva `set_request_context`.
  Tenant politika koju faza 4 uvodi glasi

  ```sql
  practice_id = nullif(current_setting('app.practice_id', true), '')::uuid
  ```

  i uz nepostavljen `app.practice_id` daje `practice_id = NULL`, dakle **nula redova za svaki
  membership**. Resolver uslovnih permisija pada **fail-closed** na oba flaga `false`, pa bi
  `MPA` i `BILLING_SPECIALIST` **tiho izgubili** `analysis.approve` i `analysis.approval.revoke`
  i u ordinaciji koja ih je izričito uključila. Regresija ne baca grešku — mijenja **sadržaj**
  zamrznutog odgovora `03` §10.

## Odluka

# Dio A — Settings reprezentacija i tačna `SELECT` površina

### A.1 Jedna reprezentacija za obje rute

`GET /api/v1/practices/{practiceId}/settings` i **uspješan**
`PATCH /api/v1/practices/{practiceId}/settings` vraćaju **istu** reprezentaciju resursa, tačno
ovih **osam** polja i nijedno drugo:

```json
{
  "practiceId": "<uuid>",
  "billingReviewRequired": true,
  "allowMpaApproval": false,
  "allowBillingSpecialistApproval": false,
  "requireReasonForManualChange": true,
  "aiEnabled": true,
  "axenitaExportEnabled": true,
  "retentionPolicyCode": null
}
```

`retentionPolicyCode` je `string|null`; preostalih šest polja su `boolean`; `practiceId` je `uuid`.

### A.2 `version` se ne duplira u tijelo

Obje rute vraćaju:

```http
ETag: "<version>"
```

Vrijednost je **integer** `practice_settings.version` iz `02` §6.4. **`version` se ne pojavljuje
kao polje JSON tijela** — ni u `GET` odgovoru, ni u `PATCH` odgovoru, ni u `PATCH` zahtjevu.
Postoji **tačno jedan** kanal za tekuću verziju resursa, i to je `ETag`.

### A.3 Tačna `SELECT` površina faze 4

`copilot_app` `SELECT` površina nad `practice_settings` u fazi 4 je **tačno devet** kolona:

```sql
grant select (
  practice_id,
  billing_review_required,
  allow_mpa_approval,
  allow_billing_specialist_approval,
  require_reason_for_manual_change,
  ai_enabled,
  axenita_export_enabled,
  retention_policy_code,
  version
) on practice_settings to copilot_app;
```

Osam kolona pokriva reprezentaciju iz A.1, deveta (`version`) `ETag` iz A.2.

### A.4 Kolone koje ostaju nečitljive

`copilot_app` **ne dobija `SELECT`** ni nad jednom drugom kolonom te tabele, imenovano:

```text
id            (ako postoji u kanonskoj schemi)
configuration
updated_at
updated_by
```

**Nema table-level `SELECT`.** Interna metadata se **ne izlaže samo zato što postoji u tabeli**.
Nedozvoljena kolona pada sa `42501` **i kada se koristi isključivo u `WHERE` predikatu ili u
`ORDER BY`** (`02` §20.2b).

### A.5 Odnos prema fazi 3

Trokolonska površina faze 3 iz D-049, klauzule 2 — `practice_id`, `allow_mpa_approval`,
`allow_billing_specialist_approval` — je **strogi podskup** ove devetokolonske. Faza 4 je
**proširuje**; **nijedan postojeći grant se ne opoziva** i nijedan konzument faze 3 se ne lomi.

# Dio B — Tačna `UPDATE` površina i optimistic locking

### B.1 Tačna `UPDATE` površina faze 4

`copilot_app` `UPDATE` površina nad `practice_settings` je **tačno devet** kolona:

```sql
grant update (
  billing_review_required,
  allow_mpa_approval,
  allow_billing_specialist_approval,
  require_reason_for_manual_change,
  ai_enabled,
  axenita_export_enabled,
  retention_policy_code,
  version,
  updated_at
) on practice_settings to copilot_app;
```

Sedam su poslovne postavke, dvije su concurrency/maintenance metadata.

### B.2 Kolone koje ostaju bez `UPDATE`-a

`copilot_app` **ne smije dobiti `UPDATE`** ni nad jednom drugom kolonom, imenovano:

```text
practice_id
id            (ako postoji u kanonskoj schemi)
configuration
updated_by
```

**Nema table-level `UPDATE`.** `UPDATE` grant se, prema D-049, klauzuli 5, uvodi **zajedno** sa
tenant politikom koja ga ograničava; grant bez politike **obara phase gate**.

### B.3 `updated_by` ostaje netaknut

Settings endpoint faze 4 **ne piše** `updated_by`. Ta kolona se **ne tretira kao autoritativno
audit polje**. Odgovornost za akterstvo i promjenu ostaje u kanonskom audit modelu.

**Ne uvodi se nijedan novi triger za tu svrhu.** Vlasništvo paketa `014_immutability_triggers`
ostaje **nepromijenjeno**.

### B.4 Mehanika optimističkog update-a

- `PATCH` nosi **obavezan** `If-Match` (`03` §5.2); nedostajući `If-Match` → **`428
  PRECONDITION_REQUIRED`**;
- **očekivana verzija se izvodi isključivo iz `If-Match`**;
- izvršava se **jedan atomičan SQL `UPDATE`** koji:
  - postavlja **samo poslana** poslovna polja;
  - postavlja `version = version + 1`;
  - postavlja `updated_at` na **tekuće vrijeme baze**;
  - ima predikat `practice_id = <uspostavljeni tenant> and version = <očekivana verzija>`;
- **nula pogođenih redova zbog zastarjele očekivane verzije → `409 VERSION_CONFLICT`**;
- uspjeh vraća reprezentaciju iz A.1 i **novi** `ETag` iz A.2.

Ne postoji prozor u kojem je resurs izmijenjen a `version` nepromijenjen (`03` §5.2).

### B.5 Runtime `UPDATE (version)` je prihvaćen minimum

Runtime privilegija `UPDATE (version)` je **prihvaćena kao minimalan mehanizam** koji postojeća
optimistic-locking arhitektura (D-029, D-009, `03` §5.2) zahtijeva. **Ne uvodi se**:

- triger nad `version`;
- `SECURITY DEFINER`;
- privilegovana helper funkcija;
- izmjena paketa `014_immutability_triggers`;
- novi migration paket;
- API polje za proizvoljnu verziju.

### B.6 Ono što pozivalac nikada ne šalje

- **`version`** se ne prihvata u tijelu zahtjeva — dolazi **isključivo** iz `If-Match`;
- **`updated_at`** se ne prihvata — postavlja ga server/baza;
- **`updated_by`** se ne prihvata.

# Dio C — Autoritativni redoslijed autorizacije

### C.1 Nijedna nova sigurnosna semantika

Ovaj dio **ne uvodi** nijednu novu sigurnosnu semantiku i **ne mijenja** nijedno implementacijsko
ponašanje. On **rekonsiliše zastarjele restatemente** sa već prihvaćenim izvorom.

### C.2 Autoritativni izvor

Autoritativan je **jedanaestokoračni** redoslijed poslije D-047 iz `03` §3.7.1, identičan
dijagramu `14` §2.

### C.3 Obavezan korak prije `set_request_context`

Prije poziva `set_request_context` **mora** postojati **membership-scoped čitanje `status`-a
tražene ordinacije** (D-047, klauzula 10):

- **nula vidljivih redova → `403 ACCESS_DENIED`**;
- **`status <> 'ACTIVE'` → `403 ACCESS_DENIED` uz rollback**;
- **`app.practice_id` se ne uspostavlja dok taj korak ne uspije.**

Provjera je **aplikacijska**; tijelo `set_request_context` se **ne mijenja** (`02` §16.2.3).

### C.4 Obuhvat rekonsilijacije

Svaki zastarjeli desetokoračni restatement faze 4 se rekonsiliše: `04` §6.2.1, `05` „Redoslijed
autorizacije", `07` Faza 4 i `08` §24.6. **Nijedan drugi korak se ne uklanja** i nijedno
implementacijsko ponašanje se ne mijenja.

# Dio D — Adaptacija `GET /me` nakon `practice_settings` RLS-a

### D.1 Stroga tenant RLS ostaje nepromijenjena

Politika nad `practice_settings` ostaje **doslovno** standardni tenant predikat iz `02` §17.1:

```sql
practice_id = nullif(current_setting('app.practice_id', true), '')::uuid
```

**Ne uvodi se bootstrap izuzetak, membership-wide grana ni ijedno drugo slabljenje.** Rješenje
regresije OD-4 je **isključivo** adaptacija aplikacijskog puta.

### D.2 `GET /me` ostaje neutralna ruta

Zamrznuti ugovor iz `03` §10 ostaje **nepromijenjen**:

- ruta je **autentifikovana i neutralna**;
- `X-Practice-ID` **nije potreban i ne uvodi se**;
- **nema klijentski odabranog tenanta**;
- neaktivni membershipi ostaju **vidljivi**, sa `permissions = []`;
- `platformRoles` ostaje **odvojen blok**;
- `permissions` ostaje **membership-scoped**.

### D.3 Porijeklo identifikatora ordinacije

Svaki `practice_id` upotrijebljen za ovu internu operaciju dolazi **isključivo iz već razriješenih
membership redova za `app.user_id`**. **Nijedna vrijednost iz tijela, query parametra, headera ni
putanje ne učestvuje.**

### D.4 Neaktivan membership ne dobija kontekst

Neaktivan membership **ne zahtijeva** tenant kontekst — `permissions` mu je `[]` po `15` §3.2,
bez obzira na role i flagove. Za njega se `set_request_context` **ne poziva**. To je i tehnički
obavezno: funkcija validira `pm.active = true` i za neaktivan membership podiže `42501`
(`02` §16.2.3).

### D.5 Kontekst po membershipu, kroz prihvaćeni put

Za **aktivan** membership čije izvođenje efektivnih permisija stvarno zahtijeva uslovne postavke,
server uspostavlja **transakcijski lokalni** `app.practice_id` **za taj membership**, kroz
**prihvaćeni `set_request_context` put** (`02` §16.2.3), i **tek onda** čita `practice_settings`.

### D.6 Čitanje pod istom strogom RLS-om

Taj read se izvršava **pod istom strogom tenant RLS-om** iz D.1. Ne postoji drugi put do te
tabele.

### D.7 Zabrana cross-practice doprinosa

Postavke ordinacije A **nikada** ne doprinose permisijama ordinacije B. Obrada više membershipa
**nikada** ne unijira postavke ni role preko ordinacija.

### D.8 Obavezan redoslijed čitanja

**Svako čitanje koje nije uređeno tenant predikatom mora se završiti prije prvog
`set_request_context` poziva u toj transakciji.** To su čitanja `users` (§17.5), `practices`
(§17.6), `practice_memberships` (§17.3), `practice_membership_roles` (§17.4) i
`platform_role_assignments` (§17.2).

Razlog je **RESTRICTIVE** politika `practices_context_narrow` iz `02` §17.6: čim `app.practice_id`
postoji, `practices` vraća **tačno jednu** ordinaciju. Čitanje `practiceName` za više membershipa
nakon uspostavljenog konteksta bilo bi **tiha regresija** `03` §10.

### D.9 Izolacija između membershipa i nakon transakcije

**Ne uvodi se nijedan novi mehanizam čišćenja konteksta.** Postojeći su dovoljni i kanonski:

- **između membershipa** — `set_request_context` po D-033, klauzuli 10, **briše `app.practice_id`
  prije validacije** i postavlja ga tek nakon uspjeha (`02` §16.2.3), pa uzastopni pozivi ne mogu
  akumulirati niti pomiješati kontekst;
- **nakon transakcije** — `app.*` su transakcijski lokalne i gase se sa krajem transakcije;
  pooled konekcija ne nasljeđuje kontekst (`02` §16.2, `14` §2).

**Ne uvodi se `SECURITY DEFINER`, `BYPASSRLS`, superuser put ni ijedna zaobilaznica.**

### D.10 Provjera statusa ordinacije se na `/me` ne uvodi

Korak iz **dijela C** je vezan za **klijentski poslan `X-Practice-ID`** na tenant ruti i tu ostaje
obavezan. Na `/me` **ne postoji** klijentski odabran tenant, `/me` **ne autorizuje nijednu tenant
operaciju**, a identifikatori dolaze isključivo iz vlastitih membership redova (D.3). Uvođenje te
provjere na `/me` **promijenilo bi** zamrznuti odgovor `03` §10 za aktivan membership u
ne-`ACTIVE` ordinaciji, što D.2 zabranjuje. **Dio C i dio D se time ne kose.**

### D.11 Zabrana slabljenja

`practice_settings` RLS se **ne slabi** da bi se sačuvao `/me`.

### D.12 Obavezan regresijski dokaz

Regresijski test faze 4 mora dokazati:

- da **iste kanonske `GET /me` fixture daju iste `memberships[].permissions` prije i nakon**
  uvođenja `practice_settings` RLS-a;
- da uslovno ponašanje `MPA` i `BILLING_SPECIALIST` ostaje **tačno za oba stanja oba flaga**;
- da neaktivan membership ostaje `permissions = []`;
- da multi-practice membership koristi postavke **svoje** ordinacije, nezavisno;
- da **nijedan tenant kontekst ne curi** nakon transakcije;
- da **nijedan klijentski poslan practice identifikator** ne učestvuje u neutralnom `/me`;
- da `practiceName` za **svaki** membership ostaje prisutan, čime se dokazuje redoslijed iz D.8.

### D.13 Ova odluka ništa ne implementira

Ova odluka **evidencira ugovor i vlasništvo**. Aplikacijski kod, testovi, `seed.ts`, Prisma schema
i migracije se **ovom odlukom ne mijenjaju**. Implementacija pripada implementacijskom gateu faze
4.

## Razlog

**Dio A i B.** „Proširena površina" nije izvršiv zahtjev. Dok se ne prebroji, implementator faze 4
bira između izmišljanja granta i table-level `SELECT`-a koji `02` §20.2b zabranjuje, a
introspekcijski test nema šta da tvrdi. Devet čitljivih i devet upisnih kolona je **najmanji skup
koji zamrznuti ugovor `03` §5.2 i §10 zaista traži** — osam za reprezentaciju, `version` za `ETag`
i atomičan inkrement, `updated_at` za maintenance vrijeme. `updated_by` ostaje izvan te površine
jer bi ga runtime write pretvorio u prividno audit polje bez ijedne garancije koju kanonski audit
model daje. Alternative za inkrement `version`-a — triger, `SECURITY DEFINER` ili izmjena paketa
`014` — sve uvode konstrukcije koje su D-033 i D-047 već odbili, radi jedne kolone koju API
pozivalac ionako ne može poslati (B.6).

**Dio C.** Autoritativni izvor je već ispravan. Zastarjeli restatement u izvedenom dokumentu je
**operativno opasniji od nedostajuće dokumentacije**, jer implementator faze 4 čita `04`, `05` i
`07`, a ne `03`. Isti obrazac restitucije koji je D-052 primijenio na fazu izvršenja.

**Dio D.** Regresija je stvarna i **tiha** — fail-closed put ne baca grešku, nego izostavlja
permisiju. Slabljenje RLS-a bilo bi razmjena trajne sigurnosne garancije za jedan aplikacijski
problem koji ima čisto aplikacijsko rješenje: identifikatori su ionako već razriješeni iz
vlastitih membership redova, a `set_request_context` već nosi tačno onu semantiku brisanja i
validacije koju izolacija po membershipu traži.

## Alternative

- **Bootstrap/membership-wide izuzetak u `practice_settings` politici** — odbijeno: vratio bi
  izloženost koju D-049, klauzula 3, imenuje i koju faza 4 postoji da zatvori, i to trajno.
- **`X-Practice-ID` na `/me`** — odbijeno: mijenja zamršeni zamrznuti ugovor `03` §10 i pretvara
  neutralnu rutu u tenant rutu.
- **`SECURITY DEFINER` čitač postavki za `/me`** — odbijeno: D-047, klauzula 2, drži model bez
  ijedne takve funkcije.
- **Denormalizacija oba flaga u `practices`** — odbijeno: već odbijeno u D-049; duplira izvor
  istine za sigurnosnu konfiguraciju.
- **Ukloniti uslovne permisije iz `/me`** — odbijeno: `permissions[]` je dio zamrznutog ugovora.
- **Triger koji inkrementira `version`** — odbijeno: skriva concurrency semantiku u paket `014`,
  čije vlasništvo ova odluka izričito ne dira.
- **Runtime write nad `updated_by`** — odbijeno: prividno audit polje bez garancija kanonskog
  audit modela.
- **Table-level `SELECT`/`UPDATE` „radi jednostavnosti"** — odbijeno: `02` §20.2b i §18.1 to
  zabranjuju, a izložilo bi `configuration` i internu metadatu.
- **Novi migration paket za settings runtime put** — odbijeno: `02` §22 brojevi su redoslijed
  zavisnosti; nova numeracija je zabranjena isto kao u D-052, klauzuli A.6.

## Posljedice

- `02` §20.2b dobija **imenovanu devetokolonsku `SELECT` i devetokolonsku `UPDATE` površinu faze
  4**; formulacija „proširena čitljiva površina" prestaje biti neodređena.
- `02` §18.1, §22.13 i §25.1.3 dobijaju eksplicitnu referencu na te dvije liste.
- `03` §10 dobija **zamrznutu reprezentaciju odgovora** obje settings rute i eksplicitno pravilo
  da `version` postoji samo kao `ETag`.
- `03` §10 `GET /me` dobija odjeljak o adaptaciji faze 4.
- `04` §6.2.1, `05`, `07` i `08` §24.6 prelaze na **jedanaest** koraka.
- `04` §6.3, `05` Faza 4, `07` Faza 4 i `08` dobijaju tačne liste kolona i `/me` regresijski
  ugovor.
- `14` dobija napomenu o internom, per-membership kontekstu na neutralnoj ruti.
- **Nijedan endpoint, permisija, rola, error kod ni migration paket se ne uvodi**, i nijedan se ne
  renumeriše. `15` ostaje nepromijenjen.

## Security/privacy uticaj

**Strogo pozitivan.**

Dio A i B **sužavaju** ono što je ranije bilo neodređeno: umjesto „proširene površine" koju bi
implementator mogao razriješiti kao table-level grant, kanon sada imenuje **tačno devet** čitljivih
i **tačno devet** upisnih kolona. `configuration`, `updated_by`, `updated_at` (za čitanje) i `id`
ostaju nedohvatljivi runtime roli. `practice_id` ostaje bez `UPDATE`-a, pa runtime ne može
premjestiti settings red u drugu ordinaciju.

Dio C vraća **obavezan sigurnosni korak** u tri dokumenta iz kojih je ispao. Bez njega bi
implementator faze 4 mogao uspostaviti `app.practice_id` za ordinaciju koja nije `ACTIVE`.

Dio D **čuva strogu RLS**. Bez njega bi pritisak da `/me` proradi vodio prema bootstrap izuzetku
nad `practice_settings` — trajnoj rupi. Umjesto toga se mijenja aplikacijski put, koji ionako
nikada ne prima practice identifikator od klijenta. Prijelaz na per-membership kontekst je
**pooštrenje**: read koji je u fazi 3 bio potpuno neograničen postaje ograničen tenant politikom,
jedan membership po jedan.

## Migration/rollout

Bez izmjene redoslijeda. Paket `013_rls_policies` u fazi 4 uvodi `ENABLE` + `FORCE RLS`, tenant
politiku, **devetokolonski `SELECT`** i **devetokolonski `UPDATE`** — **zajedno**, u istoj
migraciji (D-049, klauzula 5). Trokolonski grant faze 3 je podskup i **ne opoziva se**. **Nijedan
novi broj paketa se ne uvodi i nijedan se ne renumeriše.** Paket `014_immutability_triggers` se ne
dira. Dijelovi C i D ne proizvode nijedan schema objekat.

## Test dokaz

`02` §20.4, §25.1.3 i §25.1.3a; `03` §5.2, §3.7.1 i §10; `05` Faza 4; `08` §10, §21.7.5, §21.7.6,
§24.6 i §26.2.

Minimum za fazu 4:

- `SELECT` **tačno devet** dozvoljenih kolona prolazi; `SELECT *` → `42501`; `id`, `configuration`,
  `updated_at` i `updated_by` → `42501`, uključujući upotrebu isključivo u `WHERE` ili `ORDER BY`;
- `UPDATE` **tačno devet** dozvoljenih kolona prolazi; `UPDATE` nad `practice_id`, `id`,
  `configuration` ili `updated_by` → `42501`; `DELETE` i `INSERT` → `42501`;
- `UPDATE` grant bez pripadajuće tenant politike **obara gate**;
- `GET` i uspješan `PATCH` vraćaju **identičnu** osmopoljnu reprezentaciju; nijedan odgovor ne
  sadrži `version` kao polje; oba nose `ETag`;
- `PATCH` bez `If-Match` → `428`; sa zastarjelim `If-Match` → `409 VERSION_CONFLICT`; sa tačnim →
  `200`, `version + 1`, novi `ETag`;
- poslan `version`, `updated_at` ili `updated_by` u tijelu se **odbija**;
- `updated_by` je **nepromijenjen** nakon uspješnog `PATCH`-a;
- redoslijed autorizacije ima **jedanaest** koraka i status tražene ordinacije se provjerava
  **prije** `set_request_context`;
- regresijski dokaz `GET /me` iz klauzule D.12 u punom obimu.

## Zavisnosti

D-009, D-023, D-028, D-029, D-033, D-038, D-041, D-044, D-046, D-047, D-048, D-049, D-050, D-051,
D-052.

---

# D-054 — Orkestracija tenant konteksta u fazi 4 i tumačenje `TenantDatabaseService`-a

- **Status:** ACCEPTED
- **Datum:** 2026-08-17
- **Amandman na:** **D-006** i **AGENTS.md §5.3** — isključivo u dijelu **tumačenja imena**
  `PracticeContextGuard` i doslovnog potpisa `TenantDatabaseService.run(practiceId, userId,
  callback)`. Sigurnosni **sadržaj** oba zahtjeva ostaje nepromijenjen i ne slabi se. **D-047,
  klauzula 10** i **`03` §3.7.1** se **ne mijenjaju** — ova ih odluka izričito potvrđuje kao
  **nadređene** svakom izvedenom imenu artefakta. **D-049 i D-053** ostaju nepromijenjeni.
- **Status klauzule 12 (evidentirano u D-055, 2026-08-19):** **RIJEŠENO na kanonskom `main`-u.** PR #17 (`2229724`) je merged; kanonski potpis je sada **`TenantRequestPipeline.admit(session, request)`**, pa `userId` seam iz klauzule 12 **više ne postoji** i pogrešan korisnik nije izraziv. Prva dodatna tenant ruta (P4-5C, PR #18) dodana je **tek nakon** toga, čime je precondition klauzule 12 ispoštovan. Zapažanje **O4** u `05`, Faza 4 je **ZATVORENO**. Obrazloženje i historija ove odluke se **ne mijenjaju** — bilježi se **ishod**, ne razlog.
- **Kontekst/problem:** Nezavisni review gatea **P4-5BR** nad prihvaćenom implementacijom **P4-5B**
  (`fdef469`, merged u kanonski `main` kroz PR #15, `530295d`) mehanički je utvrdio da dva
  kanonska **imena** iz planske dokumentacije nemaju jednoznačno tumačenje, i da doslovno čitanje
  jednog od njih **direktno protivriječi** zamrznutom redoslijedu.

  **OD-1 — `PracticeContextGuard` kao NestJS `CanActivate` je neizvodiv.** Nest guard se izvršava
  **prije** kontrolera, dakle **prije** nego što se interaktivna transakcija iz D-047, klauzule 8
  uopšte otvori. Iz toga slijede tri nezavisne posljedice: (a) validacija `X-Practice-ID` headera
  je u `03` §3.7.1 zamrznuta **nakon** admisije korisnika (koraci 1–2), a guard bi odgovorio
  pozivaocu čiji identitet još nije primljen; (b) transakcijski lokalan `app.practice_id` **ne
  može** biti uspostavljen izvan pinovane interaktivne transakcije, pa guard ne može izvršiti
  korake 5–7; (c) trajni regresijski testovi zahtijevaju da nepoznat ili neaktivan korisnik dobije
  `403` **prije** nego što izostanak headera može proizvesti `400` — guard bi taj poredak obrnuo.

  **OD-2 — doslovno čitanje `TenantDatabaseService.run(practiceId, userId, callback)`.** Potpis
  napisan u planskoj fazi, prije D-047, čita se kao ovlaštenje za drugu transakciju, drugi
  `PrismaClient`, postavljanje `app.practice_id` odmah pri ulasku i **caller-supplied `userId`**
  kao identitet. Svako od ta četiri čitanja krši D-047 i `03` §3.7.1. Ime i njegovo **svojstvo**
  ostaju ispravni; **potpis** nije normativan.

  Ambiguitet je governance problem, ne implementacijski: prihvaćeni kod je konforman, a
  dokumentacija ga opisuje imenima koja dopuštaju nekonformno čitanje.

## Odluka

# Dio A — Redoslijed je nadređen imenu artefakta

### A.1 Klauzula 1 — zamrznut redoslijed ostaje autoritativan

**D-047, klauzula 10** i **`03` §3.7.1** ostaju **jedini autoritativni** izvor redoslijeda
tenant zahtjeva. Nijedno ime artefakta iz izvedene planske dokumentacije (`01`, `04`, `07`, `09`,
`10`, `AGENTS.md`) ne smije se čitati kao ovlaštenje za odstupanje od tog redoslijeda. Pri
konfliktu **redoslijed pobjeđuje ime**.

# Dio B — `PracticeContextGuard`

### B.1 Klauzula 2 — koncept, ne framework artefakt

`PracticeContextGuard` je **semantički arhitektonski koncept** — faza tenant admisije i uspostave
konteksta unutar autentifikovanog zahtjeva. **Nije** nužno NestJS framework `Guard`. Ime se u
kanonskim dokumentima zadržava kao naziv **faze**, ne kao naziv klase.

### B.2 Klauzula 3 — prihvaćena realizacija za tekući slice

Za tekući identity/practice slice ruta, taj koncept je realizovan klasom **`TenantRequestPipeline`**
(`apps/api/src/identity/application/tenant-request.pipeline.ts`), koja izvršava korake **3–10**
`03` §3.7.1 **unutar** već otvorene autentifikovane interaktivne transakcije. Korak 11 ostaje na
servisu rute. To je **prihvaćena** realizacija, a ne privremeni zaobilazak.

### B.3 Klauzula 4 — zabrana

**Zabranjeno je** uvesti `PracticeContextGuard` kao NestJS `CanActivate` **tamo gdje bi validirao
tenant kontekst prije admisije autentifikovanog korisnika**. Takav artefakt obara gate. Zabrana je
uslovna po svojoj semantici, a ne po imenu: ono što je zabranjeno je **inverzija redoslijeda**.

# Dio C — `TenantDatabaseService`

### C.1 Klauzula 5 — koncept ostaje kanonski

`TenantDatabaseService` **ostaje kanonski facade koncept** za tenant business module (D-006,
`01` §6.2 i §10, `09` §5). Ova odluka ga **ne ukida** i ne pretvara u opcionu preporuku.

### C.2 Klauzule 6–10 — obavezna svojstva svake buduće konkretne implementacije

Svaki budući konkretan `TenantDatabaseService` mora:

6. **koristiti postojeću** pinovanu transakciju/sesiju autentifikovanog zahtjeva;
7. **ne posjedovati vlastiti `PrismaClient`** — runtime ima tačno jedan `PrismaService` i tačno
   jedan `copilot_app` klijent;
8. **ne otvarati drugu, ugniježdenu ni paralelnu** aplikacijsku transakciju;
9. **ne postavljati `app.practice_id` prije** kanonskih provjera `practices.status` i aktivnog
   membershipa (`03` §3.7.1, koraci 3–4; D-047, klauzula 10);
10. **nikada ne tretirati caller-supplied `userId` kao granicu povjerenja** — identitet korisnika
    se izvodi **isključivo** iz autentifikovanog admission/session stanja (`app.user_id`,
    D-047, klauzule 2–4 i 9).

Dodatno i bez izuzetka: jedna autentifikovana interaktivna transakcija, jedna pinovana sesija,
`set_request_context` **unutar te iste** transakcije, tenant business komanda **tek nakon**
uspostavljenog konteksta, i **default-deny** kada tenant konteksta nema.

Smije biti **tanak facade** nad postojećom transakcijom/sesijom i `TenantRequestPipeline`-om.
**Ne smije** postati paralelan database stack.

# Dio D — Status prihvaćenog P4-5B

### D.1 Klauzula 11 — konformnost

Prihvaćena P4-5B implementacija rute `GET /api/v1/practices/{practiceId}` je **konformna** sa
`03` §3.7.1, D-047 i ovom odlukom: `set_request_context` je jedini put do `app.practice_id`, obje
membership barijere su zadržane, provjera statusa ordinacije je strogo prije poziva funkcije, a
privilegovani prozor je dužine nula.

### D.2 Klauzula 12 — `userId` seam

`TenantRequestPipeline.admit(session, userId, request)` trenutno prima `userId` kao parametar.
Za tekuću jedinu tenant rutu taj parametar dolazi isključivo iz admisijom utvrđenog identiteta i
nije eksternalno dostupan. **Prije nego što se doda ijedna dodatna tenant ruta**, taj seam se mora
**mehanički ukloniti ili vezati za autentifikovani session identitet**, tako da pogrešan korisnik
ne bude ni izraziv. Do tada se ne tvrdi da je seam zatvoren.

### D.3 Klauzula 13 — nema database promjene

Ova odluka **ne uvodi nijednu** promjenu schema, migracija, RLS politika, grantova, funkcija,
rola, permission matrice ni resolvera. Nijedan novi paket se ne uvodi i nijedan se ne renumeriše.

### D.4 Klauzula 14 — ne otvara settings slice

Ova odluka **ne ovlašćuje** implementaciju `GET`/`PATCH /practices/{practiceId}/settings`. Settings
ugovor ostaje zamrznut u D-053 i njegova implementacija zahtijeva zaseban gate.

## Razlog

Zamrznut redoslijed je sigurnosni invarijant, a imena artefakata su planski jezik nastao prije
njega. Kad se to dvoje razilazi, jedini ispravan potez je **eksplicitno zapisati koje ime opisuje
koncept, a koje artefakt**, umjesto da se invarijant tiho prilagodi imenu. Alternativa — doslovna
implementacija guarda — bila je mehanički oborena: proizvela bi odgovor neadmitiranom pozivaocu i
ne bi mogla uspostaviti transakcijski lokalan GUC.

## Alternative

- **Implementirati `CanActivate` guard i pomjeriti redoslijed** — odbijeno: mijenja zamrznuti
  D-047 / `03` §3.7.1 ugovor i obara trajne regresijske testove.
- **Ukloniti oba imena iz kanonske dokumentacije** — odbijeno: `TenantDatabaseService` nosi
  stvarno sigurnosno svojstvo za buduće business module, a brisanje imena bi to svojstvo izgubilo.
- **Uvesti prazan `TenantDatabaseService` odmah, radi imena** — odbijeno: facade koji ne posjeduje
  klijent, ne otvara transakciju i ne drži konekciju dodao bi ime bez svojstva.

## Posljedice

- Izvedena dokumentacija koja pominje `PracticeContextGuard` čita se kao **naziv faze**;
- `AGENTS.md` §5.3 je preformulisan tako da nosi isto sigurnosno pravilo bez neizvodivog potpisa;
- `05`, Faza 4 označava **koncept** kao implementiran za tekuću rutu, a **konkretan
  `TenantDatabaseService` facade ostaje neoznačen** dok ga stvarni business modul ne zatraži;
- prenesena hardening zapažanja iz P4-5BR (O2/O3, O4, O5, O6, O7) ostaju **otvorena** i vode se u
  `05`, Faza 4; nijedno se ne rješava ovom odlukom.

## Security/privacy uticaj

Nema promjene sigurnosne površine. Odluka **pooštrava** tumačenje: eksplicitno zabranjuje četiri
konkretna nekonformna čitanja (druga transakcija, drugi klijent, rano postavljanje
`app.practice_id`, caller-supplied identitet) koja su ranije bila dopuštena doslovnim čitanjem.
Nijedna zabrana se ne uklanja.

## Migration/rollout

Nijedna. Bez schema objekta, bez migracije, bez izmjene baze. Isključivo governance/dokumentacija.

## Test dokaz

Bez novih testova — svojstva su već dokazana testovima prihvaćenim u P4-5B:

- `03` §3.7.1 korak 4 prije koraka 5, sa rollbackom za ne-`ACTIVE` ordinaciju;
- nepoznat i neaktivan korisnik odbijeni **prije** razmatranja headera;
- `app.practice_id` uspostavljen za **tačno** traženu ordinaciju, unutar transakcije;
- kontekst ne preživi `COMMIT` ni `ROLLBACK` i ne curi na pooled konekciju;
- odbijen tenant zahtjev ne kontaminira sljedeći prihvaćeni;
- `42501` iz `set_request_context` se prevodi u zajednički `403 ACCESS_DENIED`, bez otkrivanja
  SQLSTATE-a, iskaza, imena funkcije ni database poruke.

Budući konkretan `TenantDatabaseService` mora ponovo dokazati klauzule 6–10 prije prihvatanja.

## Zavisnosti

D-006, D-023, D-033, D-038, D-041, D-047, D-049, D-051, D-052, D-053.

---

# D-055 — HTTP validatori i optimistička konkurentnost `practice_settings` ruta

- **Status:** ACCEPTED
- **Datum:** 2026-08-19
- **Amandman na:** **D-053, dio B** — isključivo u dijelu u kojem `If-Match` mehanika navodi
  **nedostajući** i **zastarjeli** validator, ali **ne navodi prihvaćeni oblik** samog tokena, ne
  razlikuje **sintaksno neispravan** validator od zastarjelog, i ne imenuje ishod **praznog**
  `PATCH` tijela. Sve tri praznine se ovom odlukom **zatvaraju tačnim, prebrojivim pravilima**.
  **Nijedna klauzula D-053 se ne opoziva**: `428` za nedostajući `If-Match` i `409
  VERSION_CONFLICT` za zastarjeli ostaju **doslovno nepromijenjeni**. **D-047 (posebno klauzule 8,
  10, 11 i 18), D-049 i D-054 ostaju nepromijenjeni**; ova ih odluka izričito potvrđuje kao
  **nadređene**. `15` ostaje nepromijenjen.
- **Kontekst/problem:** Slice **P4-5C** (`GET /api/v1/practices/{practiceId}/settings`) je merged u
  kanonski `main` kroz **PR #18** (`0411ae4`, merge `be675fd`). Nezavisni review gatea **P4-5CR**
  mehanički je utvrdio dva ponašanja koja **postoje na `main`-u**, a nijedan kanonski dokument ih
  ne opisuje, i jedan skup ambiguiteta koji bi implementator **P4-5D** morao izmisliti.

  **OD-1 — autorizovani `304` nije kanonizovan.** Ruta postavlja **jak** `ETag: "<version>"`
  eksplicitno, prije serijalizacije tijela. Time taj validator ulazi u **običnu HTTP
  revalidaciju**: potpuno autentifikovan, admitiran i autorizovan `GET` sa podudarajućim
  `If-None-Match` headerom dobija **`304 Not Modified`** i **prazno tijelo**. Ponašanje je
  ispravno i posljedica je jakog taga koji D-053, klauzula A.2 zahtijeva, ali `03` ga nigdje ne
  navodi. Bez kanonizacije, sljedeći review bi ga mogao pročitati kao **curenje** zamrznute
  osmopoljne reprezentacije ili kao **zaobilaženje** autorizacije, a implementator P4-5D bi ga
  mogao „popraviti" i time slomiti ispravno ponašanje.

  **OD-2 — invarijant nedostajućeg reda nije kanonizovan.** Vlasnička odluka gatea P4-5C —
  nedostajući `practice_settings` red **nakon** uspješne autorizacije je **interni invarijant**,
  ne autorizacijski ishod — implementirana je i pokrivena testovima, ali postoji **isključivo** u
  komentaru izvornog koda i u commit poruci. Nijedan kanonski dokument ne kaže da ishod nije
  `404` ni `403`.

  **OD-3 — `PATCH` validator nije razriješen.** D-053, klauzula B.4 imenuje **nedostajući**
  (`428`) i **zastarjeli** (`409`) `If-Match`, ali ne odgovara na četiri pitanja bez kojih P4-5D
  nije izvodiv: (a) koji je **tačan prihvaćen oblik** tokena; (b) šta se dešava sa **sintaksno
  neispravnim** validatorom, `W/"1"`, `*`, listom validatora ili praznom vrijednošću; (c) da li
  slaba komparacija ikada zadovoljava `If-Match`; (d) šta je ishod **praznog** tijela `{}`.
  Dodatno, `03` §5.2 kaže da se `400` **ne koristi za nedostajući** `If-Match`, što je bez izričite
  distinkcije lako pročitati kao „`400` se uopšte ne koristi na ovoj ruti".

  **OD-4 — nula pogođenih redova ima dva uzroka.** D-053, klauzula B.4 imenuje `409` za nula
  redova **zbog zastarjele verzije**. Isti atomičan `UPDATE` daje nula redova i kada red **ne
  postoji**. Bez odluke, implementator bi uveo **pre-read diskriminator** — dodatno čitanje prije
  upisa, koje je po definiciji **race-prone** i koje bi razbilo jednoiskaznu optimističku
  konkurentnost.

  **OD-5 — cache politika.** P4-5CR je zapazio da autentifikovani tenant odgovori trenutno nemaju
  eksplicitnu `Cache-Control` politiku. Zapažanje je stvarno, ali **nije** vlasništvo settings
  slicea.

## Odluka

# Dio A — D-053 ostaje bazni settings ugovor

### A.1 Klauzula 1 — reprezentacija i rute su nepromijenjene

Ova odluka **ne mijenja** nijedno slovo zamrznutog ugovora:

- `GET /api/v1/practices/{practiceId}/settings`;
- `PATCH /api/v1/practices/{practiceId}/settings`;
- zajednička uspješna reprezentacija je **tačno osam** javnih polja i nijedno drugo — `practiceId`,
  `billingReviewRequired`, `allowMpaApproval`, `allowBillingSpecialistApproval`,
  `requireReasonForManualChange`, `aiEnabled`, `axenitaExportEnabled`, `retentionPolicyCode`
  (D-053, klauzula A.1).

### A.2 Klauzula 2 — polja koja tijelo nikada ne nosi

U javnom tijelu **ne postoje** i ovom odlukom se **ne uvode**:

```text
version
id
configuration
updatedAt
updatedBy
```

`ETag` ostaje **jedini javni kanal** tekuće verzije resursa (D-053, klauzula A.2). Nijedan validator
kanonizovan ovom odlukom ne otvara drugi kanal.

# Dio B — Uslovni `GET`, `If-None-Match` i `304`

### B.1 Klauzula 3 — jak `ETag` učestvuje u običnoj revalidaciji

Za **potpuno autentifikovan, admitiran i autorizovan** `GET /api/v1/practices/{practiceId}/settings`,
jak verzijski `ETag` učestvuje u **običnoj HTTP `If-None-Match` revalidaciji**. Podudaran validator
**smije** rezultirati:

```http
304 Not Modified
```

uz:

- **prazno tijelo**;
- **zadržan tekući `ETag`**;
- **bez** zamrznute osmopoljne reprezentacije, jer `304` po definiciji **ne nosi reprezentaciju**.

`304` **nije izuzetak** od klauzule A.1 — on je odgovor **bez** reprezentacije, pa je zamrznuta
reprezentacija na njemu neprimjenjiva, a ne prekršena.

### B.2 Klauzula 4 — revalidacija je strogo **nakon** cijelog D-047 pipelinea

Ponašanje iz klauzule 3 nastupa **isključivo nakon** kompletnog redoslijeda `03` §3.7.1, koraci
1–10. `If-None-Match` **ne smije** zaobići, skratiti ni preurediti:

- autentifikaciju;
- tenant admisiju;
- provjeru `practices.status`;
- obje membership barijere;
- uspostavu tenant konteksta;
- izvođenje i evaluaciju `practice.settings.read`.

Neautorizovan zahtjev zadržava **svoj kanonski ishod** — `401`, `403` ili `400` — **bez obzira** na
prisustvo, odsustvo ili vrijednost `If-None-Match` headera. **Ne postoji** `If-None-Match`
vrijednost koja od odbijenog zahtjeva pravi `304`.

### B.3 Klauzula 5 — slaba komparacija na `GET`-u je očekivana HTTP semantika

`If-None-Match` po HTTP-u koristi **slabu komparaciju**. Zbog toga validator u slabom obliku
(`W/"3"`) **smije** poklopiti isti resursni tag pri `GET` revalidaciji. To je **evidentirano kao
očekivano**, a ne kao odstupanje.

Ta činjenica:

- **ne slabi** jak `ETag` koji server emituje — server i dalje emituje **isključivo** `"<version>"`
  (D-053, klauzula A.2);
- **ne definiše** `PATCH` konkurentnost ni na koji način (vidi dio D i klauzulu 13).

### B.4 Klauzula 6 — ovaj gate ne ovlašćuje kod ni testove za `304`

Ova odluka **kanonizuje zatečeno ponašanje**. Trajne izmjene aplikacijskog koda, novi `304` testovi
i bilo kakva namjenska `304` grana **nisu ovlašteni** ovim governance gateom. Implementacija P4-5D
**ne smije** uvesti novo `304` ponašanje, niti ukloniti postojeće.

# Dio C — `GET` bez `practice_settings` reda

### C.1 Klauzula 7 — nedostajući red je interni invarijant, ne autorizacijski ishod

Kada su **svi** sljedeći uslovi ispunjeni:

- autentifikacija;
- tenant admisija;
- **aktivan** membership;
- **`ACTIVE`** ordinacija;
- permisija `practice.settings.read`;
- uspostavljen tenant kontekst;

a admitirana ordinacija **nema** `practice_settings` red, to je **interni data-integrity invarijant
failure**.

Eksterni ishod je:

```text
500 INTERNAL_ERROR
```

sa **statičnim, neosjetljivim** Problem Details tijelom (`09` §11): bez imena ordinacije,
membershipa, korisnika, tabele, kolone, iskaza i bez database poruke.

### C.2 Klauzula 8 — zabranjena tumačenja

Nedostajući red se **ne** tumači kao:

```text
404
403
prazne postavke
default postavke
```

`403` bi zajedničku anti-enumeracijsku refuzaciju pretvorio u „ponekad smo pokvareni"; `404` bi
novo otkrio da ordinacija postoji ali nema postavke; izmišljene default vrijednosti bi
API-jem proizveden approval-konfiguracijski dokument predstavile kao **stvarne** postavke te
ordinacije.

### C.3 Klauzula 9 — ništa se ne kreira i ne popravlja

Red se **ne kreira**, **ne popravlja** i **ne dopunjuje**. To nije samo zabranjeno nego i
**neizrazivo**: nijedna runtime rola nema `INSERT` nad `practice_settings` (D-053, klauzula B.2;
`02` §20.2b.1).

# Dio D — `If-Match` na `PATCH`-u

### D.1 Klauzula 10 — `If-Match` je obavezan kanal

`PATCH` zahtijeva `If-Match`. Nedostajući header ostaje:

```text
428 PRECONDITION_REQUIRED
```

**Nepromijenjeno** iz D-053, klauzule B.4 i `03` §5.2.

### D.2 Klauzula 11 — prihvaćena gramatika je tačno jedan jak verzijski tag

Za P4-5D se prihvata **tačno jedan** kanonski jak verzijski `ETag`, u **tačno onom obliku koji
`GET` emituje**:

```text
"<N>"
```

gdje je `N` **kanonska nenegativna decimalna** cjelobrojna reprezentacija.

Prihvaćeni primjeri:

```text
"0"
"1"
"27"
```

**Neprihvaćeni** primjeri, imenovano:

```text
1                 (bez navodnika)
W/"1"             (slab validator)
*                 (wildcard)
"01"              (nekanonska decimalna reprezentacija)
"1", "2"          (više validatora)
"abc"             (nije cijeli broj)
                  (prazna vrijednost)
"1                (neispravno navođenje)
```

Endpoint **namjerno** koristi **užu aplikacijsku gramatiku** od pune generičke HTTP `If-Match`
gramatike, jer je taj token **jedini kanal optimističke konkurentnosti** ovog resursa. Uža
gramatika je **pooštrenje**, ne odstupanje.

### D.3 Klauzula 12 — normativna razlika `400` naspram `409` naspram `428`

| Slučaj | Status | Code |
|---|---:|---|
| `If-Match` **nedostaje** | **`428`** | `PRECONDITION_REQUIRED` |
| `If-Match` je **sintaksno neprihvaćen** po klauzuli 11 | **`400`** | `VALIDATION_ERROR` |
| `If-Match` je **prihvaćen**, ali verzija **ne odgovara** tekućem stanju | **`409`** | `VERSION_CONFLICT` |

Razlika je **normativna**:

- **`400`** = pozivalac **nije poslao valjan verzijski token**;
- **`409`** = pozivalac **jeste** poslao valjan jak verzijski token, ali on **više ne odgovara**
  perzistiranom stanju.

Sintaksno neprihvaćen `If-Match` **nikada** ne postaje `409 VERSION_CONFLICT` ni
`428 PRECONDITION_REQUIRED`.

**Odnos prema `03` §5.2.** Pravilo „`400` se ne koristi za **nedostajući** `If-Match`" (D-028,
klauzula 2) ostaje **doslovno na snazi** i ovom se odlukom **ne dira**. Ono se odnosi **isključivo**
na **odsustvo** headera. Prisutan ali neispravno formatiran header je **format headera**, dakle
`400` po `03` §9. Dva pravila se **ne kose** i moraju se čitati zajedno.

### D.4 Klauzula 13 — komparacija na `PATCH`-u je jaka i tačna

`PATCH` komparacija je **jaka i tačna**. Slab validator:

```text
W/"1"
```

**nikada** ne zadovoljava:

```http
If-Match: "1"
```

i odbija se već po klauzuli 11, kao neprihvaćena gramatika.

Ponašanje slabe komparacije iz klauzule 5 **nije presedan** za `PATCH`. `GET` i `PATCH` dijele
**isti emitovani `ETag` token**, ali koriste **različitu HTTP precondition semantiku**: `GET`
revalidira, `PATCH` autorizuje upis nad tačno jednom verzijom.

### D.5 Klauzula 14 — prazno `PATCH` tijelo

Tijelo mora sadržavati **najmanje jedno** prihvaćeno mutabilno polje. Skup mutabilnih polja ostaje
**tačno sedam**, nepromijenjen iz D-053:

```text
billingReviewRequired
allowMpaApproval
allowBillingSpecialistApproval
requireReasonForManualChange
aiEnabled
axenitaExportEnabled
retentionPolicyCode
```

Prazan JSON objekat `{}` daje:

```text
400 VALIDATION_ERROR
```

i pri tome:

- **nema `UPDATE`-a**;
- **nema inkrementa `version`-a**;
- **nema promjene `updated_at`**.

Prazno tijelo je **odsustvo zahtjeva za izmjenom**, a ne izmjena koja slučajno ništa ne mijenja;
zato se odbija **prije** ijednog upisa i ne smije potrošiti verziju. Ovaj ishod je
**endpoint-specifičan i namjerno `400`**, u skladu sa `03` §9 („header/query/request format"), i
**ne izvodi se** iz generičkog `422` puta `ValidationPipe` fabrike.

Nepoznata i neugovorna polja ostaju nevažeća po **normalnim** pravilima validacije zahtjeva ovog
repozitorija; ova odluka ta pravila **ne mijenja** i **ne uvodi** nijedno novo polje.

`version`, `updated_at` i `updated_by` se u tijelu i dalje **ne primaju** (D-053, klauzula B.6).

# Dio E — Atomičan optimistički `UPDATE`

### E.1 Klauzula 15 — jedan iskaz, obavezan predikat

Upis je **jedan atomičan optimistic-concurrency `UPDATE`**, sa obaveznim semantičkim predikatom:

```text
practice_id = <uspostavljena/admitirana tenant ordinacija>
AND
version     = <očekivana verzija iz If-Match>
```

### E.2 Klauzula 16 — zabranjen aplikacijski pre-read

**Nijedno aplikacijsko čitanje prije upisa ne smije se koristiti da odluči da li je verzija
tekuća.** Očekivana verzija dolazi **isključivo** iz `If-Match`, a njena tekućnost se utvrđuje
**isključivo** predikatom iskaza.

### E.3 Klauzula 17 — tačan skup kolona koje iskaz piše

`UPDATE` postavlja:

- **samo poslana** poslovna polja;
- `version = version + 1`;
- `updated_at` na **tekuće vrijeme baze**.

`updated_by` ostaje **netaknut** (D-053, klauzula B.3).

**Nema `INSERT`, nema `DELETE`, nema `upsert`.**

### E.4 Klauzula 18 — `UPDATE` površina je nepromijenjena

Prihvaćena `UPDATE` površina D-053, klauzule B.1 se **doslovno preslikava** i **ne proširuje**.
Dozvoljene poslovne kolone:

```text
billing_review_required
allow_mpa_approval
allow_billing_specialist_approval
require_reason_for_manual_change
ai_enabled
axenita_export_enabled
retention_policy_code
```

plus:

```text
version
updated_at
```

— **tačno devet** `UPDATE` kolona. **Ne pišu se** `practice_id`, `updated_by`, `id` ni
`configuration`.

# Dio F — Nula pogođenih redova

### F.1 Klauzula 19 — jedan ishod za oba uzroka

Ako atomičan `UPDATE` pogodi **nula redova**, ishod je:

```text
409 VERSION_CONFLICT
```

**bez obzira** da li je nula redova nastala zbog:

- **zastarjele verzije**; ili
- **nedostajućeg `practice_settings` reda**.

### F.2 Klauzula 20 — zabranjen diskriminator

Aplikacija **ne smije** izvesti dodatno čitanje da bi ta dva uzroka razlikovala.

### F.3 Klauzula 21 — asimetrija `GET`/`PATCH` je namjerna

| Ruta | Nedostajući red nakon autorizacije | Ishod |
|---|---|---:|
| `GET` | otkriven **čitanjem** | **`500 INTERNAL_ERROR`** (klauzula 7) |
| `PATCH` | otkriven **nulom pogođenih redova** | **`409 VERSION_CONFLICT`** (klauzula 19) |

Asimetrija je **namjerna i prihvaćena**: `PATCH` čuva **jednoiskaznu atomičnu optimističku
konkurentnost** i **ne uvodi race-prone read-before-write diskriminator**. `GET` nema upis koji bi
mu tu informaciju dao besplatno, pa je za njega nedostajući red **isključivo** invarijant.

# Dio G — Uspješan `PATCH`

### G.1 Klauzula 22 — status, reprezentacija i novi validator

Uspješan `PATCH` vraća:

```text
200 OK
```

sa **istom zamrznutom osmopoljnom reprezentacijom** kao `GET` (klauzula 1) i **novim jakim**
validatorom:

```http
ETag: "<newVersion>"
```

gdje je `newVersion = oldVersion + 1`.

### G.2 Klauzula 23 — jedan izvor istine za odgovor

Reprezentacija **i** `ETag` se izvode iz reda koji vraća **isti** atomičan
`UPDATE ... RETURNING` iskaz. **Nijedno drugo čitanje postavki nije potrebno** za konstrukciju
uspješnog odgovora, i ne smije se uvesti: drugi read bi otvorio prozor u kojem tijelo i validator
opisuju dva različita stanja.

`version` se **ne izlaže u tijelu** (klauzula 2).

# Dio H — Razdvajanje conditional headera

### H.1 Klauzula 24 — svaki header ima tačno jednu ulogu

- `If-None-Match` je kanonizovan **isključivo** za `GET` revalidaciju (dio B);
- `If-Match` je **jedini** kanal optimističke konkurentnosti za `PATCH` (dio D).

Aplikacijski kod P4-5D **ne smije** koristiti `If-None-Match` da odluči o uspjehu `PATCH`-a.

### H.2 Klauzula 25 — nema novih precondition headera

U fazi 4 se **ne uvodi** nijedan dodatni precondition header.

# Dio I — Cache politika je odgođena

### I.1 Klauzula 26 — zapažanje je priznato, ali nije bloker

Zapažanje P4-5CR da autentifikovani tenant odgovori trenutno nemaju eksplicitnu `Cache-Control`
politiku je **priznato**. **Nije bloker** za implementaciju P4-5D.

### I.2 Klauzula 27 — odgoda u zaseban slice

Svaka repozitorijski široka odluka o:

```text
Cache-Control
private
no-store
Vary: Authorization
```

se **odgađa u zaseban hardening/governance slice**. **P4-5D ne smije oportunistički mijenjati
globalnu cache politiku**, ni na settings rutama ni bilo gdje drugo.

# Dio J — Tenant i sigurnosni model su nepromijenjeni

### J.1 Klauzula 28 — isti pipeline, ista permisija

Budući `PATCH` mora koristiti **isti prihvaćeni** `TenantRequestPipeline`, kroz **isti**
jedanaestokoračni redoslijed `03` §3.7.1.

Tražena permisija je:

```text
practice.settings.manage
```

izvedena **isključivo** kroz jedinstvenu aplikacijsku reprezentaciju matrice `15`.

### J.2 Klauzula 29 — imenovane zabrane

**Zabranjeno je**, bez izuzetka:

- hard-kodirana `PRACTICE_ADMIN` provjera;
- `SYSTEM_ADMIN` tenant bypass;
- caller-supplied `userId` u bilo kojem obliku;
- drugi `PrismaClient`;
- druga request transakcija.

### J.3 Klauzula 30 — nema database promjene

Ova odluka **ne zahtijeva i ne uvodi** nijednu promjenu RLS politika, grantova, schema objekata,
`app_security` funkcija, migration paketa, permission matrice ni resolvera. Nijedan paket se ne
uvodi i nijedan se ne renumeriše.

# Dio K — Idempotency

### K.1 Klauzula 31 — bez idempotency ključa

`PATCH /practices/{practiceId}/settings` **ne zahtijeva** `Idempotency-Key`. Token optimističke
konkurentnosti je **`If-Match`/`version`**, i on je jedini. **Nepromijenjeno** iz D-053 i `03` §5.3.

# Dio L — Status D-054, klauzule 12

### L.1 Klauzula 32 — `userId` seam je zatvoren na `main`-u

Mehanički se evidentira, bez izmjene historijskog obrazloženja D-054:

- **PR #17 je merged** u kanonski `main` (`2229724`);
- kanonski potpis tenant pipelinea je sada **`TenantRequestPipeline.admit(session, request)`**;
- **precondition D-054, klauzule 12 je RIJEŠEN** na `main`-u — dodatna tenant ruta (P4-5C) dodana
  je **tek nakon** uklanjanja seama;
- zapažanje **O4 je ZATVORENO** i tako se vodi u `05`, Faza 4.

Historijsko obrazloženje D-054 se **ne briše i ne prepisuje**. Ova klauzula bilježi **ishod**, ne
mijenja **razlog**.

# Dio M — Ova odluka ništa ne implementira

### M.1 Klauzula 33 — governance-only

Ova odluka **evidencira ugovor**. Aplikacijski kod, testovi, `seed.ts`, Prisma schema, migracije i
lokalna baza se **ovom odlukom ne mijenjaju**. Implementacija `PATCH`-a pripada **implementacijskom
gateu P4-5D**, koji ova odluka **ne otvara** — ona ga samo čini izvodivim.

**Zamrznut ugovor nije implementacija.** `05` **ne smije** označiti nijednu `PATCH` stavku
završenom na osnovu ove odluke.

## Razlog

**Dio B.** Ponašanje već postoji na `main`-u i **posljedica je jakog taga koji ugovor zahtijeva**.
Nekanonizovano ispravno ponašanje je governance dug: sljedeći review ga mora ili odobriti bez
osnova ili prijaviti kao regresiju. Kanonizacija uz izričitu ogradu — **`304` tek nakon cijelog
D-047 pipelinea** — čuva i ponašanje i sigurnosnu granicu, i sprečava da implementator P4-5D
„popravi" nešto što nije pokvareno.

**Dio C.** Nakon što je pozivalac autentifikovan, admitiran i autorizovan, a ordinacija dokazano
`ACTIVE`, jedini preostali uzrok nula redova je **nekonzistentna baza**: `practice_id` je `NOT
NULL` i `UNIQUE`, a red piše pouzdan seed put (`02` §6.4, §23.4). Odgovoriti `403` ili `404` znači
**lagati o autorizaciji zbog interne greške**, i to na ruti čija refuzacija ima anti-enumeracijsko
značenje.

**Dio D.** Generička HTTP `If-Match` gramatika dopušta `*`, liste i slabe forme. Za resurs čiji je
validator **cjelobrojna verzija**, svaka od tih formi je ili besmislena ili opasna: `*` bi značio
„piši bez obzira na verziju", a to je **tačno suprotno** od optimističke konkurentnosti. Uža
gramatika je jedini način da token ostane **jedini kanal verzije**. Razlika `400`/`409` je nužna
jer nosi **različitu informaciju pozivaocu**: `400` traži ispravan token, `409` traži **ponovno
čitanje resursa**. Spajanje ta dva ishoda naučilo bi klijente da na `409` ponavljaju isti neispravan
zahtjev.

**Dio E i F.** Jednoiskazna optimistička konkurentnost je **jedina** koja nema prozor između
provjere i upisa. Svaki pre-read koji bi razlikovao „zastarjelo" od „ne postoji" taj prozor
**stvara**, i to radi informacije koju pozivalac ne smije ni dobiti — postojanje reda je interno
stanje, a ne dio ugovora. `409` za oba uzroka je **fail-safe**: kaže „tvoja pretpostavka o stanju ne
vrijedi, pročitaj ponovo", što je istina u oba slučaja.

**Dio G.** `UPDATE ... RETURNING` je jedini oblik koji garantuje da tijelo i `ETag` opisuju
**isti red iste transakcije**. Drugi read bi mogao vidjeti sljedeću verziju.

**Dio I.** Cache politika je **repozitorijski široka** odluka. Rješavanje unutar settings slicea
značilo bi da jedna ruta dobija politiku koju ostale nemaju, i to bez ADR-a koji tu politiku
definiše za sve.

## Alternative

- **`412 PRECONDITION_FAILED` za zastarjeli `If-Match`** — odbijeno: `03` §5.2 i D-009 zamrzavaju
  `409 VERSION_CONFLICT` za svih šest resursa; uvođenje `412` na jednom bi razbilo jedinstvenu
  semantiku i tabelu §8.1.
- **`409` za sintaksno neispravan `If-Match`** — odbijeno: `409` znači „stanje se promijenilo" i
  naveo bi klijenta da ponavlja isti neispravan zahtjev.
- **`428` za sintaksno neispravan `If-Match`** — odbijeno: header **jeste** prisutan; `428` bi
  klijenta uputio da doda ono što je već poslao.
- **Puna generička HTTP `If-Match` gramatika, uključujući `*`** — odbijeno: `*` je semantički
  „bezuslovni upis", što ukida optimističku konkurentnost koju ovaj token postoji da nosi.
- **Prihvatiti `W/"N"` na `PATCH`-u „radi tolerancije"** — odbijeno: slaba komparacija tvrdi
  semantičku ekvivalentnost, a upis zahtijeva **tačnu** verziju.
- **`404` za nedostajući red na `PATCH`-u** — odbijeno: zahtijeva pre-read, otkriva interno stanje
  i uvodi race.
- **`500` za nula pogođenih redova na `PATCH`-u** — odbijeno: zahtijeva isti pre-read da bi se
  uopšte razlikovalo od zastarjele verzije.
- **`404` ili `403` za nedostajući red na `GET`-u** — odbijeno: laž o autorizaciji, i kontaminacija
  anti-enumeracijskog značenja zajedničke refuzacije.
- **Kreirati ili popraviti nedostajući red** — odbijeno: izmišljena approval konfiguracija
  predstavljena kao stvarna, i bez `INSERT` granta neizvodiva.
- **`204 No Content` za prazan `PATCH`** — odbijeno: sugeriše uspješan upis koji se nije dogodio.
- **`200` sa nepromijenjenom reprezentacijom za prazan `PATCH`** — odbijeno: pozivalac ne bi
  razlikovao „ništa nisi poslao" od „upisano".
- **Ukloniti `304` ponašanje** — odbijeno: posljedica je jakog taga koji ugovor **zahtijeva**;
  uklanjanje bi tražilo ili slab tag ili namjensko gušenje ispravne HTTP semantike.
- **Riješiti `Cache-Control` u P4-5D** — odbijeno: repozitorijski široka odluka bez vlastitog ADR-a.

## Posljedice

- `03` §10 („GET/PATCH `/practices/{practiceId}/settings`") dobija: autorizovan `304`, invarijant
  nedostajućeg reda, prihvaćenu `If-Match` gramatiku, tabelu `400`/`409`/`428`, prazno tijelo,
  atomičnu `UPDATE` semantiku i uspješan `200` sa inkrementiranim `ETag`-om;
- `03` §5.2 dobija **izričitu distinkciju** nedostajućeg naspram neispravnog `If-Match`-a, tako da
  se D-028, klauzula 2 ne čita šire nego što glasi;
- `05`, Faza 4 se **rekonsiliše sa stvarno merganim stanjem**: `GET` implementacija, jak `ETag` i
  reprezentacija su **završeni**; O4 je **zatvoren**; `PATCH`, `If-Match` put i optimistički
  `UPDATE` ostaju **neimplementirani**; faza ostaje `IN_PROGRESS`;
- D-053 dobija usku back-referencu na ovu odluku; D-006 dobija ranije dugovanu back-referencu na
  D-054;
- **nijedan endpoint, permisija, rola, error code ni migration paket se ne uvodi**, i nijedan se ne
  renumeriše; `15` ostaje nepromijenjen;
- P4-5D dobija **izvodiv** ugovor: nijedna njegova odluka više nije prepuštena implementatoru.

## Security/privacy uticaj

**Strogo pozitivan ili neutralan.**

- **Dio B** ne dodaje nijedan put do podataka. `304` nosi **prazno tijelo**, a nastupa **isključivo
  nakon** pune autorizacije; klauzula 4 to čini izričitim, čime **zatvara** čitanje po kojem bi
  conditional header mogao biti tretiran kao prečica.
- **Dio C** sprečava dvije stvarne regresije: lažni `403` koji bi razvodnio anti-enumeracijsko
  značenje zajedničke refuzacije, i `404` koji bi otkrio postojanje ordinacije bez postavki.
  Statično `500` tijelo ne otkriva ništa.
- **Dio D** **sužava** prihvaćeni ulaz u odnosu na generički HTTP: `*` i liste su izričito odbijeni,
  pa ne postoji validator koji znači „piši bez obzira na verziju".
- **Dio E i F** eliminišu **race prozor** koji bi pre-read diskriminator uveo, i uskraćuju
  pozivaocu razlikovanje internog stanja.
- **Dio J** ponavlja i pooštrava postojeće zabrane; nijedna se ne uklanja.
- Površina baze se **ne mijenja** — devet `SELECT` i devet `UPDATE` kolona, bez `INSERT`-a i bez
  `DELETE`-a.

## Migration/rollout

**Nijedna.** Bez schema objekta, bez migracije, bez DDL-a, bez DML-a, bez izmjene lokalne baze.
Paket `013_rls_policies` ostaje **nepromijenjen**; paket `014_immutability_triggers` se **ne dira**.
Isključivo governance/dokumentacija.

## Test dokaz

**Ovaj gate ne uvodi nijedan test.** Testovi ispod su **obavezan minimum gatea P4-5D**, i do tada se
**ne tvrdi** da postoje.

Već dokazano u P4-5C (merged, PR #18):

- `GET` prolazi kompletan jedanaestokoračni redoslijed i vraća **tačno osam** polja;
- `ETag` je **jak** i izveden iz `version`-a iste pročitane vrste;
- `version` se **ne pojavljuje** u tijelu;
- nedostajući red nakon autorizacije daje **`500 INTERNAL_ERROR`** sa statičnim tijelom;
- `PATCH` ruta **nije registrovana**.

Obavezan minimum za P4-5D:

- `PATCH` bez `If-Match` → **`428`**;
- `If-Match` u svakom neprihvaćenom obliku iz klauzule 11 → **`400 VALIDATION_ERROR`**, imenovano
  najmanje: bez navodnika, `W/"N"`, `*`, `"01"`, lista validatora, ne-cjelobrojna vrijednost,
  prazna vrijednost i neispravno navođenje;
- `W/"N"` **nikada** ne zadovoljava `If-Match: "N"`;
- prihvaćen ali zastarjeo `If-Match` → **`409 VERSION_CONFLICT`**;
- prazno tijelo `{}` → **`400 VALIDATION_ERROR`**, uz dokaz da `version` i `updated_at` **nisu**
  promijenjeni;
- tačan `If-Match` → **`200`**, `version + 1`, **novi** `ETag`, **ista** osmopoljna reprezentacija,
  bez `version`-a u tijelu;
- upis je **jedan** iskaz sa predikatom `practice_id` **i** `version`; **nema** pre-reada;
- nula pogođenih redova → **`409`**, i za zastarjelu verziju **i** za nedostajući red, **bez**
  dodatnog čitanja;
- `updated_by` je **nepromijenjen** nakon uspješnog `PATCH`-a;
- `PATCH` bez `practice.settings.manage` → **`403 ACCESS_DENIED`**, bez upisa;
- `If-None-Match` **ne pretvara** nijedan odbijen zahtjev u `304`;
- **nijedna** globalna cache politika nije uvedena.

## Zavisnosti

D-006, D-009, D-028, D-029, D-033, D-038, D-041, D-044, D-047, D-049, D-051, D-052, **D-053**,
**D-054**.

---

# D-056 — Autoritet zatvaranja faze 4, uslovno odgađanje konkretnog `TenantDatabaseService` facadea i model kanonskog pokazivača u `05`

- **Status:** ACCEPTED
- **Datum:** 2026-08-20
- **Amandman na:** **D-047, klauzulu 16** (kako ju je izmijenio **D-051**), **D-051, klauzulu 5**,
  **tumačenje D-054, klauzule 5** i svu izvedenu dokumentaciju koja iz njih izvodi **bezuslovno
  vlasništvo faze 4 nad konkretnom klasom** `TenantDatabaseService` (`02` §17.0, `04` §6.2.3, §6.3
  i §6.5, `07` Faza 4, `05` Faza 4). **Sigurnosni sadržaj** tih odluka se **ne mijenja i ne
  slabi**. **D-047, klauzula 10**, **`03` §3.7.1**, **D-049**, **D-053**, **D-054, klauzule 6–10**
  i **D-055** ostaju **nepromijenjeni**; ova ih odluka izričito potvrđuje kao nadređene.
- **Vlasnička ratifikacija:** četiri ovdje evidentirane odluke (**OD-1**–**OD-4**) donio je i
  zamrznuo **project owner** u gateu **P4-FC-GOV1**; ovaj zapis ih **implementira**, ne izvodi.

## Kontekst/problem — sukob autoriteta

Gate **P4-FC** (`BLOCKED_PHASE_4_CLOSURE`) i njegov nastavak **P4-FC-GOV1** mehanički su utvrdili
da faza 4 ne može biti ni zatvorena ni odbijena bez odluke vlasnika, i to iz četiri nezavisna
razloga.

**C1 — konkretan `TenantDatabaseService` je bezuslovni deliverable faze 4 u prihvaćenom
autoritetu.** D-047, klauzula 16, kako ju je D-051, klauzula 5 potvrdila i suzila, doslovno vodi
`TenantDatabaseService -> faza 4`. `02` §17.0, `04` §6.2.3 i `07` Faza 4 to restatiraju.

**C2 — konkretna klasa na kanonskom `main`-u ne postoji.** Runtime faze 4 realizovan je
`TenantRequestPipeline`-om, unutar jedne pinovane interaktivne transakcije.

**C3 — D-054, klauzula 5 zadržava koncept kao kanonski**, a klauzule 6–10 propisuju obavezna
svojstva svake buduće konkretne implementacije, ali **ne** presuđuju u kojoj fazi ta klasa mora
nastati.

**C4 — checklist faze 4 nosi neoznačene redove** koji nisu ni dokazani ni raspoređeni pod ijednu
prihvaćenu dispoziciju, pa nijedan mehanički kriterij nije mogao odlučiti zatvara li se faza.

**C5 — `05` je nosio samoreferentni metapodatak** koji pokušava sadržavati tačan **živi** SHA
vlastitog `origin/main` stanja. Takvo polje postaje **neistinito u trenutku vlastitog merge-a**, pa
dokumentacija strukturno ne može biti tačna.

Uz to, jedan neoznačen red faze 4 — autorizovan `304` na `If-None-Match` — nosio je obrazloženje
koje je **zastarjelo**: opisivao je odsustvo namjenskih testova, dok trajni testovi na kanonskom
`main`-u to ponašanje već dokazuju.

## Odluka

# Dio A — konkretan `TenantDatabaseService` facade

### A.1 Klauzula 1 — ruling `T2_FORMALLY_DEFER`

Konkretna klasa `TenantDatabaseService` **nije deliverable zatvaranja faze 4**. Vlasništvo faze 4
nad **konkretnim facadeom**, izvedeno iz D-047, klauzule 16 i D-051, klauzule 5, je **nadiđeno**.

### A.2 Klauzula 2 — sigurnosna semantika koncepta je već zadovoljena

Tekući runtime na kanonskom `main`-u već zadovoljava sigurnosnu semantiku koju koncept predstavlja:

- **jedan** Prisma klijent;
- **jedna** pinovana interaktivna transakcija;
- tenant kontekst uspostavljen **na toj istoj sesiji**;
- kanonski **D-047 redoslijed** (`03` §3.7.1, koraci 1–11);
- **nijedan** caller-supplied identitetski seam;
- **nijedna** druga, ugniježdena ni paralelna transakcija;
- **nijedan** izlazak iz transakcije;
- tenant poslovne operacije se izvršavaju **isključivo nakon** tenant admisije, pod RLS-om.

Ova klauzula **ne** proglašava konkretnu klasu implementiranom. Ona konstatuje da su **svojstva**
koja koncept štiti **već dokazana** drugim, prihvaćenim artefaktom.

### A.3 Klauzula 3 — koncept ostaje kanonski

`TenantDatabaseService` **ostaje kanonski facade koncept** za tenant business module (D-006;
D-054, klauzula 5; `01` §6.2 i §10; `09` §4). Ova odluka ga **ne ukida**, **ne slabi** i **ne
pretvara** u opcionu preporuku.

### A.4 Klauzula 4 — uslovno odgađanje, ne fazno

Konkretan facade je **uslovno odgođen** (`EXPLICITLY_DEFERRED`). Obaveza se aktivira **kada stvarni
tenant business modul zatraži tu apstrakciju**, a **ne** dolaskom bilo kojeg broja faze.

**Faza 5** se smije evidentirati kao **najranija očekivana** business-modul faza — repozitorij je
već tako imenuje — ali obaveza ostaje **uslovna**, a ne zagarantovana brojem faze. Dolazak faze 5
sam po sebi **ne** stvara obavezu ako nijedan tenant business modul ne zatraži facade; jednako,
raniji tenant business modul obavezu aktivira **odmah**.

### A.5 Klauzula 5 — obavezna svojstva svakog budućeg konkretnog facadea

Svaki budući konkretan `TenantDatabaseService` mora:

1. **omotati postojeću** pinovanu sesijsku/transakcijsku granicu (`TenantRequestPipeline`);
2. **ne posjedovati** vlastiti `PrismaClient`;
3. **ne otvarati** drugu, ugniježdenu ni paralelnu transakciju;
4. **ne uspostavljati** `app.practice_id` prije kanonske admisije (`03` §3.7.1, koraci 3–4;
   D-047, klauzula 10);
5. **ne primati** caller-supplied identitet;
6. **ponovo dokazati D-054, klauzule 6–10** prije prihvatanja.

**D-054, klauzule 6–10 ostaju binding u cijelosti.** Ova klauzula ih **ne zamjenjuje** nego ih
mehanički ponavlja kao uslov prihvatanja.

### A.6 Klauzula 6 — šta ova odluka ne ovlašćuje

Ova odluka **ne ovlašćuje** implementaciju konkretne klase, **ne ovlašćuje** dummy klasu ni stub,
**ne ovlašćuje** novi database sloj i **ne ovlašćuje** ijednu izmjenu aplikacijskog ponašanja.
Označavanje konkretnog facadea završenim **ostaje zabranjeno** dok ne postoji, sa dokazom.

# Dio B — autorizovan `304` red faze 4

### B.1 Klauzula 7 — dispozicija `SATISFIED`

Neoznačen red faze 4 „**Autorizovan `304` na `If-None-Match`**" dobija dispoziciju
**`SATISFIED_BY_EVIDENCE`**. Njegovo dotadašnje obrazloženje bilo je **zastarjelo**.

### B.2 Klauzula 8 — postojeći trajni dokaz

Trajni testovi na kanonskom `main`-u već dokazuju sva četiri tražena ponašanja:

- autorizovan `GET` sa **podudarajućim** `If-None-Match` daje **`304`** sa praznim tijelom;
- **nakon `PATCH`-a** stari tag **više ne** revalidira — daje **`200`**;
- **novi** tag daje **`304`**;
- **odbijen/neautorizovan** `GET` **ne može** biti pretvoren u `304` — zadržava `403`.

Izvor: `apps/api/test/phase4-practice-settings-patch.security.ts`, blok
`non-regression of everything this slice did not own` — testovi
`keeps the GET conditional 304 behaviour unchanged (D-055 clauses 3 and 6)` i
`keeps an If-None-Match from turning a REFUSED GET into a 304 (clause 4)`.

### B.3 Klauzula 9 — odnos prema D-055, klauzuli 6

**D-055, klauzula 6 se ne opoziva.** Ona je **uskratila ovlaštenje** za **novi** `304` rad u
**svom** gateu — novi aplikacijski kod, novu `304` granu i **nove namjenske testove**. Ona **nije**
i nikada nije bila **trajna zabrana prepoznavanja postojećeg mehaničkog dokaza**.

Iz toga slijedi: red se označava **citiranjem postojećih trajnih testova**, i to je jedini dopušten
put. **Nijedan novi test se ne uvodi. Nijedna izmjena aplikacijskog koda se ne uvodi.**

# Dio C — normativni rubrik zatvaranja faze

### C.1 Klauzula 10 — `ZERO_UNCHECKED_IS_NORMATIVE_REQUIREMENT = NO`

Doslovno „nula neoznačenih kućica" **nije** normativno pravilo zatvaranja faze. Svaki dokument koji
ga je tako čitao čita se od sada kroz ovu odluku.

### C.2 Klauzula 11 — prihvaćeno pravilo

**Faza se smije zatvoriti kada je `UNRESOLVED_REQUIRED = 0`.**

Svaka checklist stavka koja pripada toj fazi mora biti **ili**:

1. **`SATISFIED_BY_EVIDENCE`** — označena, uz citiranu komandu/test/dokaz prema `00` §14;

**ili** nositi eksplicitnu dispoziciju potkrijepljenu **prihvaćenim autoritetom**:

2. **`SUPERSEDED`**;
3. **`HISTORICAL`**;
4. **`NOT_APPLICABLE_IN_V1`**;
5. **`EXPLICITLY_DEFERRED`**;
6. **`FUTURE_SCOPE`**.

### C.3 Klauzula 12 — očuvanje živih obaveza

Za svaku dispoziciju koja ostavlja **živu obavezu za kasniji obuhvat**, ta obaveza mora biti
**očuvana/premještena u sekciju faze koja je posjeduje**, prema **precedentu D-052**.

### C.4 Klauzula 13 — zabrane

Nijedan zahtjev se ne smije:

- tiho izbrisati;
- oslabiti;
- implicitno penzionisati;
- proglasiti `N/A` **samo zato** da bi se faza zatvorila.

### C.5 Klauzula 14 — definicija blokera

Svaka stavka **bez dokaza** i **bez eksplicitne dispozicije potkrijepljene prihvaćenim
autoritetom** je **`UNRESOLVED_REQUIRED`** i **blokira zatvaranje faze**. Proizvoljna neoznačena
rezidua **nije dopuštena**.

# Dio D — model kanonskog pokazivača u `05`

### D.1 Klauzula 15 — samoreferentni živi SHA se ukida

`05` **ne smije** pokušavati sadržavati tačan **živi** SHA vlastitog tekućeg `origin/main` stanja u
polju koje postaje **neistinito** čim taj dokument bude merged.

### D.2 Klauzula 16 — prihvaćeni model

- **kanonska remote grana** je **`origin/main`**;
- **živi kanonski commit se rezolvira iz te reference**, a ne prepisuje u dokument;
- ova **samoverzionisana** checklista **ne ugrađuje SHA vlastitog budućeg merge commita**;
- **tačni SHA-ovi se bilježe isključivo kao nepromjenljivi lifecycle/historijski događaji**.

### D.3 Klauzula 17 — evidentiran lifecycle događaj

Merge implementacije faze 4 **prije** ove governance rekonsilijacije:

```text
PR #20      MERGED
MERGE SHA   3658c6e2d9c08e3ca3f0c306d8dbeaf41a6a01f5
MERGED AT   2026-08-20T15:31:49Z
MERGED BY   NerminFejzicAi
SLICE       P4-5D — settings PATCH
```

Historijska provenijencija **PR #19** i **PR #12** ostaje **netaknuta**.

### D.4 Klauzula 18 — zabrana pogađanja

Budući merge SHA **ove** governance grane se **ne pogađa i ne upisuje**.

# Dio E — status faze 4

### E.1 Klauzula 19 — faza 4 ostaje `IN_PROGRESS`

Ova odluka **ne zatvara** fazu 4 i **ne označava** je `DONE`. Nakon nje faza 4 ostaje
**`IN_PROGRESS`**, jer je preostao još jedan obavezan gate.

**Anotacija (D-059, 2026-08-21) — tijelo klauzule se ne mijenja.** Gornja tvrdnja je
**istinita za trenutak D-056** i ostaje historijski zapis: ova odluka zaista nije zatvorila
fazu 4. Najavljeni preostali gate `P4-013` je u međuvremenu **`COMPLETE`**, a zaseban,
vlasnički pregledan gate zatvaranja je **izvršen** odlukom **D-059**:

```text
PHASE_4_STATUS   IN_PROGRESS -> DONE   (D-059, 2026-08-21)
```

**Rubrik iz dijela C se ne mijenja** — D-059 ga **primjenjuje**, ne prepisuje. Vidi **D-059**.

### E.2 Klauzula 20 — preostali gate `P4-013`

Preostali obavezan gate zatvaranja faze 4 je **retrospektivni evidence audit `P4-013`**, čije su
činjenice zamrznute:

```text
P4_013_GATE_TYPE                               READ_ONLY_RETROSPECTIVE_EVIDENCE_AUDIT
P4_013_CHECKLIST_ROWS_IN_SCOPE                 294
  strogi DB/migration artefakt podskup         64
  aplikacijski/permission/fixture/test ostatak 230
P4_013_NEW_APPLICATION_IMPLEMENTATION_EXPECTED NO
```

Taj gate je **odvojen** i **ne izvršava se** ovom odlukom. Uvođenje rubrika iz dijela C **ne
ovlašćuje** klasifikaciju ni označavanje tih 294 reda.

**Anotacija (D-057, 2026-08-20) — nadiđena su isključivo polja obuhvata.** Zamrznuti blok iznad
**ostaje historijski zapis i ne prepisuje se**, ali je **operativno nadiđen odlukom D-057**:
`P4_013_CHECKLIST_ROWS_IN_SCOPE = 294` i podjela `64 / 230` **više nisu** obuhvat gatea `P4-013`.
Broj **294** odgovara `docs/05` na commitu **`258f646`** i bio je zastario **već pri usvajanju ove
odluke** — revizija koja je uvodi (`9b8ebc1`) nosi **398** checklist redova Faze 4. Obuhvat je
**rebaziran na kanonski HEAD** i definisan **strukturnim pravilom** (D-057, klauzule 3–6), a fiksna
binarna podjela `64 / 230` je **povučena kao ne-normativna auditorska pogodnost** (D-057, klauzule
7–10) jer nije imala zapisano pravilo izvođenja i ne ulazi ni u jednu invarijantu zatvaranja. Isto
vrijedi za svako spominjanje „**294 reda**" u klauzuli 21 i u sekciji *Alternative* ove odluke.
**Nijedna druga klauzula ove odluke nije dirnuta**; `P4_013_GATE_TYPE`,
`P4_013_NEW_APPLICATION_IMPLEMENTATION_EXPECTED = NO` i `UNRESOLVED_REQUIRED = 0` iz dijela C
ostaju **nepromijenjeni**. Vidi **D-057**.

# Dio F — obuhvat izvan ove odluke

### F.1 Klauzula 21 — šta ova odluka izričito ne radi

Ova odluka **ne**:

- implementira `TenantDatabaseService`;
- mijenja aplikacijsko ponašanje, testove, schemu, migracije, seed, RLS ni grantove;
- izvršava `P4-013` audit i **ne** klasifikuje njegova 294 reda;
- zatvara fazu 4 i **ne** je označava `DONE`;
- mijenja stanje ijedne baze.

### F.2 Klauzula 22 — hygiene backlog

Zastario komentar u `apps/api/src/database/database.module.ts` je **`NON_BLOCKING`** i klasifikuje
se kao **`DOCUMENTATION_BACKLOG`**. Njegova izmjena **nije ovlaštena** ovom odlukom.

## Razlog

Sva četiri problema su **problemi autoriteta**, ne implementacije. C1/C2 su sukob između
prihvaćenog vlasništva faze i stvarnog, prihvaćenog runtimea koji istu sigurnosnu semantiku već
zadovoljava — sukob koji se ne smije riješiti ni tihom implementacijom klase koju nijedan poslovni
modul još ne treba, ni tihim brisanjem zahtjeva. C4 je posljedica toga što repozitorij nikada nije
imao **mehanički kriterij** zatvaranja faze: „svi checkboxi" je neprovodivo za fazu koja legitimno
sadrži odgođene, historijske i izvan-v1 redove, a bez kriterija je svaka odluka o zatvaranju
proizvoljna. C5 je strukturna nemogućnost — polje koje sadrži vlastiti budući merge SHA ne može
biti tačno ni u jednom trenutku nakon merge-a.

Zastarjelo obrazloženje `304` reda je poseban slučaj iste bolesti: red je ostao neoznačen zato što
je njegov tekst opisivao stanje koje je u međuvremenu prestalo važiti.

## Alternative

- **`T1` — implementirati konkretan `TenantDatabaseService` u fazi 4** — odbijeno: uvela bi
  apstrakciju koju nijedan postojeći poslovni modul ne koristi, na granici koja je već dokazana,
  čime bi se povećala površina bez ijedne nove sigurnosne garancije.
- **`T3` — obrisati zahtjev za konkretnim facadeom** — odbijeno: to je tiho penzionisanje
  prihvaćenog sigurnosnog zahtjeva, izričito zabranjeno klauzulom 13.
- **Zadržati doslovno „nula neoznačenih" pravilo** — odbijeno: nijedna faza sa legitimno odgođenim
  ili izvan-v1 redovima ne bi mogla biti zatvorena, pa bi pravilo bilo ili neprovodivo ili bi
  poticalo lažno označavanje.
- **Napisati novi `304` test da bi se red označio** — odbijeno: D-055, klauzula 6 to ne ovlašćuje,
  a postojeći trajni dokaz je već potpun.
- **Zadržati živi SHA pokazivač i ručno ga ispravljati nakon svakog merge-a** — odbijeno:
  dokument bi bio neistinit između merge-a i sljedeće korekcije, a korekcija bi ponovo bila
  samoreferentna.
- **Izvršiti `P4-013` audit u istom gateu** — odbijeno: to je read-only retrospektivni audit nad
  294 reda i zahtijeva vlastiti gate.

## Posljedice

- `02` §17.0, `04` §6.2.3, §6.3 i §6.5, `07` Faza 4 i `05` Faza 4 **razdvajaju** tenant kontekst
  semantiku (ostaje obaveza faze 4) od **konkretnog facadea** (uslovno odgođen).
- U `05` **nijedan red faze 4 više nije neriješeni zahtjev za konkretnim facadeom**; živa obaveza
  je **očuvana u sekciji faze 5** prema precedentu D-052.
- `05` dobija zabilježen rubrik zatvaranja iz dijela C; `11` §11 se čita kroz njega.
- `304` red faze 4 je označen citiranjem **postojećih** testova; **nijedan test nije dodan**.
- Lifecycle metapodaci `05` za **PR #20** su ispravljeni u `MERGED`; samoreferentni živi SHA
  pokazivač je uklonjen.
- **Faza 4 ostaje `IN_PROGRESS`**; `P4-013` ostaje obavezan.

## Security/privacy uticaj

**Neutralan po konstrukciji.** Nijedna politika, nijedan grant, nijedna RLS semantika, nijedan
redoslijed autorizacije i nijedno aplikacijsko ponašanje se ne mijenja. `02` §17.1 se **ne
oslabljuje**. D-047, klauzula 10 i `03` §3.7.1 ostaju nadređeni. D-054, klauzule 6–10 ostaju
binding i **moraju** biti ponovo dokazane prije prihvatanja bilo kojeg budućeg konkretnog facadea.
Sigurnosna svojstva koja koncept štiti već su dokazana na kanonskom `main`-u (klauzula 2), pa
odgađanje **ne otvara** nijedan prozor.

## Migration/rollout

**Nema.** Ovo je governance/dokumentaciona odluka. Nijedna migracija, nijedna schema promjena,
nijedan seed, nijedan grant i nijedna izmjena baze. `apps/**`, `packages/**`, `tests/**` i
`prisma/**` ostaju **netaknuti**.

## Test dokaz

**Nijedan novi test se ne uvodi.** Dokaz za dio B su **postojeći trajni testovi** citirani u
klauzuli 8. Dokaz za dio A, klauzulu 2 su postojeći trajni testovi tenant pipelinea i settings ruta
iz slice-eva P4-5B, P4-5R1, P4-5C i P4-5D (`05`, Faza 4). Dio C je normativno pravilo i nema
testni artefakt. Dio D je metapodatkovni model i verifikuje se rezolucijom `origin/main`.

## Supersedes

**Ne supersedira nijednu odluku u cijelosti.** Amandmanski nadilazi **isključivo**:

- **D-047, klauzulu 16** (kako ju je izmijenio D-051) — u dijelu koji konkretnu klasu
  `TenantDatabaseService` vodi kao **bezuslovni** artefakt faze 4;
- **D-051, klauzulu 5** — u redu `TenantDatabaseService -> faza 4`;
- **tumačenje D-054, klauzule 5** — u dijelu iz kojeg se izvodi fazno vlasništvo konkretne klase.

**D-054, klauzule 6–10 se ne diraju.** Historijska tijela D-006, D-047, D-049, D-051, D-052,
D-053, D-054 i D-055 se **ne prepisuju**; anotacije stoje izvan njih.

## Zavisnosti

D-006, D-023, D-033, D-038, D-046, D-047, D-049, D-051, **D-052**, D-053, **D-054**, **D-055**.

---

# D-057 — Rebaziranje obuhvata `P4-013` na kanonsku Fazu 4 i pravilo izvođenja obuhvata

- **Status:** ACCEPTED
- **Datum:** 2026-08-20
- **Amandman na:** **D-056, klauzulu 20** (dio E.2) — **isključivo** u poljima obuhvata
  `P4_013_CHECKLIST_ROWS_IN_SCOPE = 294`, `strogi DB/migration artefakt podskup = 64` i
  `aplikacijski/permission/fixture/test ostatak = 230`, te u svakom tekstu D-056 koji te brojeve
  **operativno zahtijeva** (klauzula 21 i sekcija *Alternative*). **Nijedna druga klauzula D-056
  se ne dira i ne slabi.** Rubrik zatvaranja faze (D-056, dio C), uslovno odgađanje konkretnog
  `TenantDatabaseService` facadea (dio A), autorizovani `304` (dio B; D-055) i model kanonskog
  pokazivača (dio D) ostaju **nepromijenjeni i nadređeni**.
- **Vlasnička ratifikacija:** vlasnik je u gateu **P4-013-SCOPE** izabrao **OPCIJU 1 —
  rebaziranje obuhvata `P4-013` na kanonski HEAD**. Ovaj zapis tu odluku **implementira**, ne
  izvodi.

## Kontekst/problem — zastario obuhvat je zaustavio audit

### Trigger

Prvi pokušaj retrospektivnog evidence audita, gate **`P4-013A`**, zaustavljen je **prije ijedne
klasifikacije reda**, sa verdiktom:

```text
P4_013A_VERDICT = P4_013A_HOLD
BLOCKER         = P4_013_SCOPE_RECONCILIATION_FAILURE
```

Razlog: D-056, klauzula 20 zamrzava obuhvat od **294** reda, dok kanonska Faza 4 na `main`-u nosi
**398** checklist redova. Audit nad zamrznutim obuhvatom koji na kanonskom stablu ne postoji ne bi
bio ni potpun ni reproducibilan, a tiho bi ispustio **104** živa zahtjeva.

### Uzrok — mehanička rekonstrukcija

Brojanje Faze 4 kroz historiju `docs/05_IMPLEMENTATION_CHECKLIST.md` daje:

```text
258f646  docs(governance): record D-052 and reconcile Phase-4 scope        294
bba5092  docs(governance): record D-053 and freeze Phase-4 settings        345   (+51)
41570d2  docs(governance): reconcile Phase 4 tenant context orchestration  355   (+10)
b976346  docs(governance): freeze settings patch concurrency contract      379   (+24)
f3ae77f  docs(governance): reconcile Phase 4 checklist with PATCH slice    393   (+14)
9b8ebc1  docs(governance): adopt Phase 4 closure authority  (D-056)        398   (+5)
```

Broj **294** odgovara `docs/05` na commitu **`258f646`** (rekonsilijacija obuhvata uz D-052).
**Revizija koja uvodi samu D-056 (`9b8ebc1`) već nosi 398 redova.** Broj 294 je, dakle, bio
zastario **u trenutku usvajanja D-056** — nije postao zastario naknadno. Prenesen je iz ranije
rekonsilijacije bez ponovnog mjerenja.

Rast od **+104** reda **nije odbaciva buka**. Nose ga zamrzavanje settings ugovora (D-053),
rekonsilijacija orkestracije tenant konteksta, zamrzavanje `PATCH` concurrency ugovora (D-055),
rekonsilijacija **implementiranog i merged** `PATCH` slicea (P4-5D, PR #20) i sama D-056. To je
**živi Faza-4 materijal**: tenant/RLS, `practice_settings` RLS i runtime put, autorizacija i
dokazi merged slice-eva.

### Uzrok — podjela bez pravila

**Za podjelu `64 / 230` u repozitoriju ne postoji zapisano pravilo izvođenja.** Ni D-056 ni ijedan
raniji zapis ne navode koje sekcije, redovi ili kriteriji čine „strogi DB/migration artefakt
podskup". Podjela je neizvediva i neprovjerljiva kakva jeste.

## Odluka

# Dio A — obuhvat `P4-013` je kanonska Faza 4

### Klauzula 1

`P4-013` auditira **kanonsku Fazu 4 na `main`-u**, a ne historijski snapshot. Obuhvat se
**rebazira** na kanonski HEAD.

### Klauzula 2

**Nijedan zahtjev Faze 4 ne smije izbjeći retrospektivni audit** samo zato što je dodan nakon
snapshota od 294 reda. **Tiho isključenje živog reda iz obuhvata je zabranjeno** i obara gate.

# Dio B — normativno pravilo izvođenja obuhvata

### Klauzula 3 — strukturno pravilo

Obuhvat je definisan **strukturno**, ne brojem:

> Univerzum retrospektivnog evidence audita `P4-013` je **svaka Markdown checklist stavka** koja
> odgovara regularnom izrazu `^\s*-\s\[[ xX]\]` unutar kanonske **top-level** sekcije
> `# 5. Faza 4 — Tenant/RLS` dokumenta `docs/05_IMPLEMENTATION_CHECKLIST.md`, omeđene **sljedećim
> top-level naslovom faze** (`# 6. Faza 5 — Encounter/documents`).

Stavke unutar ograđenih blokova koda se **ne broje**. Na baseline reviziji takvih stavki ima
**nula**, pa je pravilo tu neosjetljivo, ali ostaje normativno za buduća mjerenja.

### Klauzula 4 — baseline

```text
P4_013_SCOPE_RULE               STRUCTURAL_EXTRACTION (klauzula 3)
P4_013_CHECKLIST_ROWS_IN_SCOPE  398
P4_013_BASELINE_COMMIT          890aee2270bf6824928a3c5dbc7ccf77adf6ebe4
SUPERSEDED_D056_TOTAL           294
SUPERSEDED_SCOPE_PROVENANCE     docs/05 na commitu 258f646
```

### Klauzula 5 — pravilo je normativno, broj je izmjerena vrijednost

**Normativno je pravilo iz klauzule 3**; `398` je **izmjerena vrijednost tog pravila** na baseline
commitu. Kasnija dokumentaciona promjena broja redova **ne redefinira tiho audit koji je u toku** i
sama po sebi **ne mijenja** ovu odluku.

### Klauzula 6 — svako izvršenje bilježi svoj commit

Svako stvarno izvršenje `P4-013` **mora zabilježiti tačan kanonski commit SHA koji auditira** i
**broj redova izmjeren na tom commitu**. Razlika u odnosu na `398` **nije automatski bloker**, ali
mora biti **objašnjena i izvedena iz commit historije** prije nastavka. Svrha je
**reproducibilnost**, ne oslanjanje na neobjašnjen broj.

# Dio C — podjela DB/migration naspram ostatka

### Klauzula 7 — binarna podjela po subsekcijama nije branjiva

Gate P4-013-SCOPE je mehanički prošao svih **43** subsekcije Faze 4 koje nose redove i utvrdio da
**podjela na nivou naslova subsekcije nije semantički branjiva**, jer su sekcije **interno
heterogene na nivou reda**. Reprezentativno:

- **„RLS i runtime put za `practice_settings` — D-049" (15 redova)** — u istoj sekciji stoje čisti
  DDL redovi (`ENABLE`/`FORCE ROW LEVEL SECURITY`, standardna tenant politika), grant redovi
  (`copilot_system`/`PUBLIC` bez grantova) i čisto HTTP/aplikacijski redovi (`ETag`, obavezan
  `If-Match`, `428`, `409 VERSION_CONFLICT`, registracija ruta).
- **„Guard i servisi" (4 reda)** — dva aplikacijska reda (guard kao koncept, odgođeni facade) i
  dva čista DDL reda (`RLS enabled`, `FORCE RLS`).
- **„Database grants" (8 redova)** — šest grant redova i dva **governance** reda o odnosu database
  rola i aplikacijskih rola (`SYSTEM_ADMIN` nije `copilot_system`).
- **„Membership validacija" (13 redova)** — bootstrap RLS politika (DB) i `403` mapiranje
  (aplikacija) u istoj listi.
- **„Proširenje D-048 allowliste — D-052, dio B" (13 redova)** — migracioni i seed DDL, protokol
  seeda i **testni** dokazi steady-state stanja u istoj sekciji.
- **„Testovi" (18) i „Testovi — D-038" (42)** — **artefakt** je test, ali **dokazani zahtjev** je
  pretežno DB/RLS semantika. Podjela „po artefaktu" i podjela „po temi zahtjeva" ovdje daju
  **različite** rezultate, a D-056 ne kaže koja se od te dvije primjenjuje.

Svaka binarna dodjela **cijelih** ovih sekcija u jedan od dva podskupa **pogrešno klasifikuje**
redove koje sekcija sadrži.

### Klauzula 8 — podjela po tipu dokaza zahtijeva rad koji ovaj gate ne smije obaviti

Oznaka iz D-056 — „strogi DB/migration **artefakt** podskup" naspram
„aplikacijski/permission/fixture/test **ostatak**" — je podjela **po tipu dokaznog artefakta**, ne
po temi zahtjeva. Tip dokaza za pojedini red **ne može se očitati iz strukture naslova**; utvrđuje
se **tek pregledom dokaza za taj red**. To je **upravo posao koji `P4-013` treba da obavi**, a za
koji gate obuhvata **nije ovlašten**. Zamrzavanje bilo kojeg novog broja ovdje bi, dakle, ili
**ponovilo defekt D-056** (neizveden broj), ili izvršilo **neovlaštenu klasifikaciju**.

Iz istog razloga se **odbija** i mehanička zamjena `64 / 230` sa `119 / 279` ili bilo kojim drugim
parom izvedenim iz proporcije: to bi bio broj biran prije pravila.

### Klauzula 9 — podjela nije invarijanta zatvaranja

Podjela `64 / 230` **ne ulazi ni u jedno pravilo zatvaranja**. Rubrik zatvaranja faze (D-056, dio
C) govori o **svakoj** stavci faze i o **`UNRESOLVED_REQUIRED = 0`**; nijedan zapis u repozitoriju
ne računa sa `64` ni sa `230`. Podjela je bila **auditorska pogodnost**, a ne invarijanta
zatvaranja.

### Klauzula 10 — odluka o podjeli

Fiksna binarna podjela `64 / 230` se **povlači kao ne-normativna**. `P4-013` klasifikuje **cijeli**
univerzum iz klauzule 3 i **svakom** redu dodjeljuje **ne-terminalnu evidence-domain oznaku**:

```text
EVIDENCE_DOMAIN =
  DB_MIGRATION | APPLICATION | PERMISSION | FIXTURE | TEST | GOVERNANCE | MIXED
```

Agregati po domenu su **izvještajni** i izvode se **iz klasifikacije**, a ne obrnuto.

### Klauzula 11 — evidence-domain oznaka nije dispozicija

`EVIDENCE_DOMAIN` je **ne-terminalna** oznaka tipa dokaza. Ona **ne mijenja, ne proširuje i ne
zamjenjuje** zamrznuti rječnik **terminalnih dispozicija** iz D-056, dio C —
`SATISFIED_BY_EVIDENCE`, `SUPERSEDED`, `HISTORICAL`, `NOT_APPLICABLE_IN_V1`,
`EXPLICITLY_DEFERRED`, `FUTURE_SCOPE`. **Svaki red i dalje mora dobiti terminalnu dispoziciju**;
`EVIDENCE_DOMAIN` bilježi samo **gdje se dokaz traži**. Oznaka domena **nikada** nije razlog za
dispoziciju.

# Dio D — granica nadilaženja D-056

### Klauzula 12 — šta se nadilazi

D-057 nadilazi **isključivo** ova polja i tekstove koji ih operativno zahtijevaju:

```text
P4_013_CHECKLIST_ROWS_IN_SCOPE                 294   -> 398 (strukturno pravilo, klauzula 3)
  strogi DB/migration artefakt podskup         64    -> POVUČENO (klauzule 7-10)
  aplikacijski/permission/fixture/test ostatak 230   -> POVUČENO (klauzule 7-10)
```

### Klauzula 13 — šta ostaje netaknuto

Sve ostale odredbe D-056 ostaju **nadređene i nepromijenjene**, izričito uključujući:

- **`UNRESOLVED_REQUIRED = 0`** kao kriterij zatvaranja faze (dio C);
- **zamrznuti rječnik terminalnih dispozicija** (dio C);
- zabranu **tihog penzionisanja** žive obaveze i obavezu njenog **očuvanja/premještanja** po
  precedentu D-052 (dio C);
- **uslovno odgađanje konkretnog `TenantDatabaseService` facadea** (dio A) — nepromijenjeno;
- **očuvanje tenant-database semantike** i D-054, klauzula 6–10 kao binding (dio A);
- **autorizovani `304` `SATISFIED_BY_EVIDENCE`** (dio B; D-055, klauzule 3, 6 i 10);
- **model kanonskog pokazivača** u `05` (dio D);
- `P4_013_GATE_TYPE = READ_ONLY_RETROSPECTIVE_EVIDENCE_AUDIT` i
  `P4_013_NEW_APPLICATION_IMPLEMENTATION_EXPECTED = NO`;
- **Faza 4 ostaje `IN_PROGRESS`** dok `P4-013` i zahtjevi zatvaranja nisu zadovoljeni.

Historijsko tijelo D-056 se **ne prepisuje**; anotacija stoji izvan njega.

# Dio E — invarijanta zatvaranja

### Klauzula 14

Kriterij zatvaranja se **ne mijenja**:

```text
UNRESOLVED_REQUIRED = 0
```

Rebaziranje **proširuje** obuhvat sa 294 na 398 reda, pa se kriterij zatvaranja time
**pooštrava**, a nikako ne slabi. **Nijedan red nije uklonjen iz obuhvata ovom odlukom.**

# Dio F — status `P4-013` i pravilo ponovnog pokretanja

### Klauzula 15 — evidentiran neuspjeli pokušaj

Pokušaj 1 gatea `P4-013A` bilježi se **kako se stvarno završio**, bez izmišljenog rezultata:

```text
P4_013A_ATTEMPT_1                 HOLD
BLOCKER                           P4_013_SCOPE_RECONCILIATION_FAILURE
očekivano po D-056                294 / 64 / 230
kanonski ukupno pronađeno         398
porijeklo historijskog 294        258f646
izvršena klasifikacija redova     NO
mutacija repozitorija u auditu    NO
mutacija baze u auditu            NO
```

```text
P4-013   NOT COMPLETE
Faza 4   IN_PROGRESS
```

### Klauzula 16 — pravilo ponovnog pokretanja

Nakon što D-057 bude merged u kanonski `main`, `P4-013A` se pokreće **iznova**, u **svježem
read-only gateu**, protiv **tačno tog kanonskog commita**. Audit se **ne nastavlja** iz pokušaja 1
— nijedan red nije validno klasifikovan, pa nema djelimičnog rezultata koji bi se preuzeo.

### Klauzula 17 — šta ova odluka ne radi

Ova odluka **ne**:

- izvršava `P4-013` i **ne** klasifikuje nijedan od tih 398 redova;
- dodjeljuje ijednu terminalnu dispoziciju ijednom redu;
- označava, odznačava ni premješta ijedan checklist red zato što izgleda zadovoljeno;
- mijenja aplikacijski kod, testove, fixture, Prisma schemu, migracije, seed, RLS ni grantove;
- mijenja stanje ijedne baze;
- zatvara fazu 4 i **ne** je označava `DONE`.

## Razlog

Audit obuhvata koji na kanonskom stablu ne postoji nije audit. Alternativa — zadržati 294 —
zahtijevala bi da **104 živa zahtjeva Faze 4**, uključujući dokaze merged tenant/RLS i settings
slice-eva, **nikada ne prođu retrospektivni evidence gate**, i to bez ijedne vlasničke odluke o
njihovom penzionisanju. To bi bilo **tiho slabljenje** zatvaranja faze, što D-056, dio C izričito
zabranjuje.

Strukturno pravilo je izabrano umjesto novog fiksnog broja jer je **broj bez pravila izvođenja**
upravo defekt koji je zaustavio `P4-013A`. Pravilo je mehanički izvršivo, reproducibilno nad bilo
kojim commitom i **ne zavisi od željenog ukupnog zbira**.

## Alternative

- **Zadržati obuhvat od 294 reda** — odbijeno: tiho isključuje 104 živa zahtjeva Faze 4 i slabi
  zatvaranje; protivno D-056, dio C.
- **Vratiti `docs/05` na stanje od `258f646` da bi 294 opet važilo** — odbijeno: brisanje merged
  evidence materijala i normativnih ugovora (D-053, D-055) radi očuvanja zastarjelog broja.
- **Zamijeniti `64 / 230` sa `119 / 279` ili sličnim parom** — odbijeno: reprodukuje defekt D-056
  (broj bez izvođenja) i bira brojeve prije pravila (klauzula 8).
- **Izvesti binarnu podjelu po naslovima subsekcija** — odbijeno: sekcije su interno heterogene na
  nivou reda, pa je svaka takva podjela pogrešna za dio redova (klauzula 7).
- **Izvesti binarnu podjelu klasifikacijom red-po-red u ovom gateu** — odbijeno: to je posao
  `P4-013`, za koji gate obuhvata nije ovlašten (klauzula 8).
- **Ukinuti `P4-013`** — odbijeno: nije predloženo i ukinulo bi obavezan gate zatvaranja.

## Posljedice

- Obuhvat `P4-013` je **398 redova** na baseline commitu, izveden **strukturnim pravilom**.
- Fiksna podjela `64 / 230` **više ne postoji** kao normativno polje.
- `P4-013A` se pokreće **iznova** nakon merge-a ove odluke, protiv kanonskog commita.
- **Faza 4 ostaje `IN_PROGRESS`**; `P4-013` ostaje **obavezan i nezavršen**.
- Buduće izvršenje mora zabilježiti **commit i izmjereni broj redova**.

**Status posljedica (anotacija `P4-013B`, 2026-08-21) — tijelo odluke se ne mijenja.** Strukturno
pravilo iz klauzule 3 je **ponovo primijenjeno** na kanonskom `main`-u i dalo je **isti** broj, pa
obuhvat nije driftovao:

```text
P4_013B_AUDIT_COMMIT   58f83d49c524bef0434d0ba1d6d04079ca6ece52
P4_013B_ROWS_FOUND     398          (= baseline 890aee2; bez drifta)
P4-013A v2             COMPLETE_WITH_REQUIRED_GAPS, UNRESOLVED_REQUIRED = 12
D-058 / P4-013V        12 -> 0
P4_013_STATUS          COMPLETE
PHASE_4_STATUS         IN_PROGRESS   (zatvaranje je zaseban vlasnicki gate)
```

Posljedica „`P4-013` ostaje obavezan i nezavršen" je bila **tačna na dan odluke** i ostaje
historijski zapis; obaveza je od tada **ispunjena**, a ne ukinuta. Klauzula 6 (svako izvršenje
bilježi commit i izmjereni broj) je ovim ispoštovana.

## Security/privacy uticaj

**Nijedan sigurnosni zahtjev nije uklonjen, oslabljen ni označen završenim.** Efekt je **suprotan**
slabljenju: obuhvat obaveznog retrospektivnog evidence audita **raste** za 104 reda, među kojima su
tenant/RLS i `practice_settings` RLS i runtime dokazi. Tenant-database semantika (D-006; D-054,
klauzule 5–10), RESTRICTIVE politike nad `practices`, `FORCE RLS` allowlist disciplina i
deny-by-default autorizacija ostaju **nepromijenjeni i nadređeni**. Odgađanje konkretnog
`TenantDatabaseService` facadea ostaje **tačno onakvo kakvim ga je D-056 odredila**.

## Migration/rollout

**Dokumentacija isključivo.** Nema schema, migracionih, seed, DDL/DML ni runtime promjena.
Zahvaćeni su `docs/05_IMPLEMENTATION_CHECKLIST.md`, `docs/06_DECISION_LOG.md` i `MANIFEST.md`.

## Test dokaz

**Nijedan novi test se ne uvodi.** Dokaz ove odluke je **mehanički i reproducibilan** nad Git
historijom: brojanje po pravilu iz klauzule 3 daje `398` na `890aee2` i `294` na `258f646`, uz
tabelu porijekla iz sekcije *Uzrok*. Provjera je ponovljiva postupkom koji izdvaja top-level
sekciju `# 5. Faza 4 — Tenant/RLS` do sljedećeg top-level naslova faze i broji stavke izvan
ograđenih blokova koda.

## Supersedes

**Ne supersedira nijednu odluku u cijelosti.** Amandmanski nadilazi **isključivo**:

- **D-056, klauzulu 20** (dio E.2) — u poljima `P4_013_CHECKLIST_ROWS_IN_SCOPE = 294`,
  `strogi DB/migration artefakt podskup = 64` i
  `aplikacijski/permission/fixture/test ostatak = 230`;
- **D-056, klauzulu 21** i sekciju *Alternative* D-056 — **isključivo** u dijelu koji obuhvat
  `P4-013` navodi kao „294 reda".

**Svaka druga odredba D-056 ostaje na snazi** (klauzula 13). Historijska tijela D-052, D-053,
D-054, D-055 i D-056 se **ne prepisuju**; anotacije stoje izvan njih.

## Zavisnosti

D-038, D-046, D-047, D-049, D-051, **D-052**, D-053, D-054, D-055, **D-056**.

---

# D-058 — Vlasništvo faza za odobravanje i opoziv odobrenja i dispozicija sedam redova `P4-013`

- **Status:** ACCEPTED
- **Datum:** 2026-08-20
- **Tip:** governance dispozicija, gate `P4-013F`. **Dokumentacija isključivo.**
- **Amandman na:** **nijednu odluku.** Ova odluka **primjenjuje** rubrik D-056, dio C na sedam
  konkretno imenovanih redova i **premješta** žive obaveze po **precedentu D-052, A.7**. **Nijedna
  klauzula D-041 se ne dira, ne slabi, ne opoziva ni ne prepisuje.**
- **Vlasnička ratifikacija:** vlasnik je u gateu `P4-013F` izabrao politiku *„Faza 4 posjeduje i
  dokazuje permission/authorization preduslove za buduće ponašanje odobravanja i opoziva, ali ne
  mora implementirati produkt workflow odobravanja/opoziva koji inače nije u njenom
  implementacijskom obuhvatu."* Ovaj zapis tu politiku **implementira**, ne izvodi.

## Kontekst/problem — trigger

### Trigger

Drugi pokušaj retrospektivnog evidence audita, **`P4-013A` v2**, izvršen je nad kanonskim obuhvatom
rebaziranim odlukom D-057 i završio je **bez izmišljenog rezultata**:

```text
P4_013A_V2_VERDICT           P4_013A_V2_COMPLETE_WITH_REQUIRED_GAPS
P4_013_TOTAL_ROWS            398
UNRESOLVED_REQUIRED          12
SECURITY_CLOSURE_BLOCKERS    1
```

**`COMPLETE_WITH_REQUIRED_GAPS` nije `PASS`.** Audit je pokrio cijeli univerzum, ali je ostavio
dvanaest redova bez dokaza i bez autoritetom potkrijepljene dispozicije, što ih po D-056, klauzuli
14 čini `UNRESOLVED_REQUIRED` i blokerima zatvaranja Faze 4.

Sedam od tih dvanaest redova čini **jedan governance-osjetljiv klaster** odobravanja i opoziva. Ta
odluka nije bila auditorska — nije je smio donijeti evidence audit, jer traži **vlasničku ocjenu
obuhvata faze**. Zato je audit te redove ostavio otvorenim i eskalirao ih ovom gateu.

### Tačan predmet — sedam redova na kanonskom `main`-u

Locirano strukturnim pravilom D-057, klauzule 3, nad `docs/05_IMPLEMENTATION_CHECKLIST.md` na
commitu `01b9995`:

| Red | Linija | Sekcija | Doslovan tekst | Kućica |
|---|---:|---|---|---|
| `R267` | 1843 | `Role matrica — prihvaćene dodjele` → `Uslovno odobravanje i opoziv` | Podobnost se evaluira **u trenutku opoziva**. | `[ ]` |
| `R268` | 1844 | isto | **Opozivalac ne mora biti originalni odobravatelj.** | `[ ]` |
| `R269` | 1845 | isto | `reason` je **obavezan**. | `[ ]` |
| `R270` | 1846 | isto | Dokaz odobrenja se **nikada ne briše**. | `[ ]` |
| `R271` | 1847 | isto | Approval historija ostaje **immutable**. | `[ ]` |
| `R272` | 1848 | isto | **Revocation audit event** je emitovan. | `[ ]` |
| `R303` | 1897 | `Endpoint authorization guards` → `Negativne provjere` | isključen approval flag → `403`. | `[ ]` |

Preslikavanje na normativni izvor je **jedan-na-jedan** i potpuno:

```text
R267 -> D-041, klauzula 7    R270 -> D-041, klauzula 9
R268 -> D-041, klauzula 6    R271 -> D-041, klauzula 10 (uz D-016)
R269 -> D-041, klauzula 8    R272 -> D-041, klauzula 11
R303 -> D-041, klauzule 1-5 (uslovne celije) uz D-038, klauzulu 18
```

### Uzrok — jedna sekcija nosi dvije različite klase obaveza

`docs/05`, Faza 4, sekcija „Uslovno odobravanje i opoziv" preslikava **cijeli** D-041 — i matricu
permisija (klauzule 1–5 i 12) **i pravila opoziva** (klauzule 6–11). Te dvije grupe nemaju isti
vlasnik faze:

- klauzule 1–5 i 12 opisuju **permission model** — ćelije matrice, uslovne flagove i kompoziciju.
  To je **obuhvat Faze 4** i Faza 4 ga je **implementirala i dokazala**;
- klauzule 6–11 opisuju **ponašanje write puta opoziva** — evaluaciju podobnosti u trenutku
  opoziva, obavezan `reason`, neuništivost dokaza odobrenja, immutable historiju i revocation audit
  event. To ponašanje **nema nosioca u Fazi 4**.

Faza 4 taj write put **ne implementira i nije ovlaštena da ga implementira**:

- tabelu `analysis_approvals` kreira paket **`009_review_approvals` u Fazi 10** (`02` §22.9;
  `04` §12.2 i §12.3, aktivnost 13). U Fazi 4 **ne postoji**;
- `04` §12.2 svrstava `revocation` u **obuhvat Faze 10**, a §12.3 kao **aktivnost 10 — `revoke`**;
- `07`, Prompt — Faza 4 izričito zabranjuje: **„Ne kreiraj: … novi endpoint."**;
- kanonsko stablo to potvrđuje: na `01b9995` postoje tačno četiri kontrolera
  (`health`, `me`, `practices`, `practice-settings`), tri migraciona paketa
  (`001_extensions_and_roles`, `002_identity_and_practices`, `013_rls_policies`) i **nijedan**
  approval, revocation ni `analysis` schema objekat.

To je **ista strukturna kontradikcija** koju je D-052 evidentirala kao **OD-1**: kanonska
dokumentacija je fazi dodijelila obavezu nad objektom koji u toj fazi ne postoji, pa faza **ne bi
mogla istinito zatvoriti**. D-052 ju je riješila **odgađanjem izvršne tačke uz doslovno očuvanje
semantike**. Ova odluka primjenjuje isti postupak na ne-DB obaveze.

## Odluka

# Dio A — razdvajanje dvije klase obaveza

### A.1 Klauzula 1 — normativno razdvajanje

U svakoj fazi se razdvajaju dvije klase obaveza koje je ranija dokumentacija spajala:

```text
A. Faza-4 permission/security semantika    -> ostaje u Fazi 4, obavezna, nedirnuta
B. Ponasanje workflowa odobravanja/opoziva -> Faza 10, uz ocuvanu obavezu
```

Razdvajanje je **kriterij izvodivosti, ne kriterij težine**: red pripada klasi B **isključivo** ako
zahtijeva schema objekat, endpoint ili write put koji u fazi domaćinu **ne postoji**. Nijedan red
ne prelazi u klasu B zato što ga je teško dokazati.

### A.2 Klauzula 2 — Faza 4 zadržava svu permission i security semantiku

**Nijedna Faza-4 sigurnosna semantika se ovom odlukom ne premješta, ne slabi ni ne odgađa.** U
Fazi 4 **ostaju obavezni i nedirnuti**, uključujući ali ne ograničeno na:

- ćelije `analysis.approve` i `analysis.approval.revoke` iz `15` §6 i D-041 (redovi `R259`–`R263`);
- pravilo da **flag bez podobne role ne daje permisiju** (`R264`);
- pravilo da je **rola bez uključenog flaga odbijena** (`R265`);
- pravilo da je **neaktivan membership odbijen i kada je flag uključen** (`R266`);
- identičnost matrice opoziva i matrice odobravanja (D-041, klauzula 12);
- kompozicija efektivnih permisija i uslovna ćelija (D-038, klauzula 18);
- tenant izolacija, cross-practice i cross-user izolacija i deny-by-default guard semantika
  (`R296`–`R305`).

### A.3 Klauzula 3 — Faza 10 posjeduje ponašanje workflowa

**Vlasnik ponašanja odobravanja i opoziva je Faza 10 — Review/approval.** To je već stanje
kanonske dokumentacije (`02` §22.9; `04` §12.2, §12.3 i §12.4; `05` Faza 10; `07` Prompt — Faza
10); ova odluka to **eksplicira** i u nju **premješta** obaveze koje su do sada visjele u Fazi 4.

**Konceptualno vlasništvo normativnog pravila ostaje D-041.** Premješta se **izvršna i dokazna
tačka**, ne pravilo:

```text
normativno pravilo   -> D-041, klauzule 6-11   (nepromijenjeno)
izvrsna/dokazna faza -> Faza 10                (eksplicirano ovom odlukom)
```

# Dio B — dispozicija red po red

### B.1 Klauzula 4 — šest redova opoziva

Iz zamrznutog rječnika terminalnih dispozicija (D-056, klauzula 11) primjenjuje se
**`FUTURE_SCOPE`**, a **ne** `EXPLICITLY_DEFERRED`: te obaveze nikada nisu bile u
implementacijskom obuhvatu Faze 4, pa nema izvršenja koje bi se odgađalo. Razlika je zabilježena
namjerno i **ne slabi** obavezu — obje dispozicije po D-056, klauzuli 12 nose **istu** dužnost
očuvanja.

| Red | Dispozicija | Vlasnička faza | Autoritet |
|---|---|---|---|
| `R267` | `FUTURE_SCOPE` | **Faza 10** | D-058, klauzule 3–4; D-041, klauzula 7; D-052, A.7 |
| `R268` | `FUTURE_SCOPE` | **Faza 10** | D-058, klauzule 3–4; D-041, klauzula 6; D-052, A.7 |
| `R269` | `FUTURE_SCOPE` | **Faza 10** | D-058, klauzule 3–4; D-041, klauzula 8; D-052, A.7 |
| `R270` | `FUTURE_SCOPE` | **Faza 10** | D-058, klauzule 3–4; D-041, klauzula 9; D-052, A.7 |
| `R271` | `FUTURE_SCOPE` | **Faza 10** | D-058, klauzule 3–4; D-041, klauzula 10; D-016; D-052, A.7 |
| `R272` | `FUTURE_SCOPE` | **Faza 10** | D-058, klauzule 3–4; D-041, klauzula 11; D-052, A.7 |

### B.2 Klauzula 5 — `R303` je dokazan u Fazi 4 i **ne premješta se**

`R303` — „isključen approval flag → `403`" — stoji u klasteru `Endpoint authorization guards →
Negativne provjere` (`R296`–`R305`), čije susjedne tvrdnje Faza 4 dokazuje istim guard harnessom.
Red traži **guard ishod pri isključenom flagu**, i taj ishod **postoji kao trajan mehanički dokaz**
na kanonskom stablu:

```text
DISPOZICIJA        SATISFIED_BY_EVIDENCE
EVIDENCE_DOMAIN    PERMISSION (ne-terminalna oznaka, D-057, klauzule 7-11)
```

Dokaz — **postojeći trajni testovi, bez ijednog novog testa** (put dopušten D-056, klauzulom 9):

- `apps/api/src/identity/domain/effective-permissions.spec.ts`, blok
  `F, G, H — conditional grants`: `withholds analysis.approve from MPA while allowMpaApproval is
  false` i `withholds analysis.approval.revoke from MPA while allowMpaApproval is false`, iste
  dvije tvrdnje za `BILLING_SPECIALIST`, unakrsni parovi „tuđi flag ne kvalifikuje rolu", te
  `treats a non-boolean flag value as disabled` — resolver **uskraćuje** obje uslovne permisije dok
  je flag isključen;
- `apps/api/src/identity/application/tenant-request.pipeline.spec.ts`:
  `never lets another practice's settings contribute` — `MPA` sa `allowMpaApproval = false` na
  **traženoj** ordinaciji i tražena permisija `analysis.approve` daju **`403`**, i kada je isti
  flag uključen u **drugoj** ordinaciji; ogledalski test
  `grants a CONDITIONAL cell from the requested practice's own flag` dokazuje suprotni smjer.

Zajedno daju tačno par koji `R303` traži: **flag isključen → `403`; flag uključen na vlastitoj
ordinaciji → dopušteno.**

### B.3 Klauzula 6 — rezidua `R303` na nivou endpointa se ipak očuvava

Guard je dokazan; **konkretni endpointi odobravanja i opoziva iz `03` §10 i §20 u Fazi 4 ne
postoje**, pa isti ishod na tim rutama Faza 4 **ne može** pokazati. Ta rezidua se **ne gubi**: u
Fazi 10 se otvara zaseban red koji je traži nad stvarnim rutama.

**Rezidua ne mijenja dispoziciju `R303`** i **ne vraća ga** u `UNRESOLVED_REQUIRED`. Ona je
**proširenje pokrivenosti Faze 10**, ne relokacija iz Faze 4 — Faza 4 svoj sloj tog zahtjeva
dokazuje u cijelosti.

### B.4 Klauzula 7 — kućice se u ovom gateu **ne mijenjaju**

`P4-013F` je **governance dispozicija**, ne checklist rekonsilijacija. Nijedna od sedam kućica se
**ne označava**, a `273` retrospektivno dokazana reda iz `P4-013A` v2 se **ne diraju**.

Razlog je auditabilnost: `[x]` u ovom repozitoriju znači **`SATISFIED_BY_EVIDENCE` uz citirani
dokaz** (`00` §14). Označavanje reda koji nosi `FUTURE_SCOPE` **zamaglilo bi razliku** između
implementacijskog dokaza i autoritetom potkrijepljene dispozicije, a upravo ta razlika je predmet
D-056, dijela C. Označavanje se izvršava u namjenskom gateu **`P4-013B`**.

# Dio C — mapa relokacije

### C.1 Klauzula 8 — eksplicitna mapa jedan-na-jedan

Svaki premješteni red dobija **tačno jedan** konkretan ciljni red. Redovi se **ne spajaju** i **ne
sažimaju**:

| Izvorni red | Izvorni zahtjev | Dispozicija | Ciljna faza | Ciljna sekcija | Ciljni red |
|---|---|---|---|---|---|
| `R267` | Podobnost se evaluira **u trenutku opoziva**. | `FUTURE_SCOPE` | Faza 10 | `Opoziv odobrenja — preuzeto iz Faze 4 (D-058)` | doslovno preuzet red |
| `R268` | **Opozivalac ne mora biti originalni odobravatelj.** | `FUTURE_SCOPE` | Faza 10 | isto | doslovno preuzet red |
| `R269` | `reason` je **obavezan**. | `FUTURE_SCOPE` | Faza 10 | isto | doslovno preuzet red |
| `R270` | Dokaz odobrenja se **nikada ne briše**. | `FUTURE_SCOPE` | Faza 10 | isto | doslovno preuzet red |
| `R271` | Approval historija ostaje **immutable**. | `FUTURE_SCOPE` | Faza 10 | isto | doslovno preuzet red |
| `R272` | **Revocation audit event** je emitovan. | `FUTURE_SCOPE` | Faza 10 | isto | doslovno preuzet red |
| `R303` | isključen approval flag → `403`. | `SATISFIED_BY_EVIDENCE` | **ostaje Faza 4** | — | — (rezidua nad rutama `03` §10/§20 dodana u Fazi 10, klauzula 6) |

### C.2 Klauzula 9 — semantika se preuzima doslovno

Ciljni redovi preuzimaju **doslovan tekst** izvornih redova. Formulacija se **ne skraćuje, ne
generalizuje i ne ublažava** radi zatvaranja. Postojeći sažeti redovi Faze 10 (`revoke`,
`revoke history preserved`, `immutable trigger`) su **djelimična pokrivenost** i **ne zamjenjuju**
preuzete redove — oni ostaju, a preuzeti redovi se dodaju **uz** njih.

### C.3 Klauzula 10 — zabrana tihog penzionisanja

```text
SILENT_RETIREMENTS = 0
```

Nijedan od sedam zahtjeva se ne briše, ne slabi, ne penzioniše implicitno niti proglašava `N/A`
radi zatvaranja faze (D-056, klauzula 13). Šest premještenih redova **postoji u Fazi 10 nakon ovog
gatea**; bez toga dispozicija `FUTURE_SCOPE` ne bi bila važeća (D-056, klauzula 12).

# Dio D — obuhvat izvan ove odluke

### D.1 Klauzula 11 — nikakva implementacija nije ovlaštena

Ova odluka **ne ovlašćuje** nijednu izmjenu aplikacijskog koda, testova, fixtura, scheme, migracija
ni seeda, i **ne ovlašćuje** izvršenje ijednog security testa. Gate `P4-013F` je **dokumentacija
isključivo**.

### D.2 Klauzula 12 — preostalih pet redova se **ne** dispozicionira

Ova odluka dispozicionira **isključivo** `R267`–`R272` i `R303`. Preostali `UNRESOLVED_REQUIRED`
redovi iz `P4-013A` v2 — verifikacijski klaster **`R347`, `R348`, `R369`, `R373`, `R382`**, u kojem
je `R373` (`ALL RLS TESTS GREEN — required before phase 5`) jedini `SECURITY_CLOSURE_BLOCKER` —
**ostaju otvoreni i nedirnuti** i pripadaju gateu **`P4-013V`**. Njihovo spajanje u ovu odluku bilo
bi upravo ono što D-056, klauzula 13 zabranjuje.

### D.3 Klauzula 13 — status faze i gatea

```text
PHASE_4_STATUS   IN_PROGRESS
P4_013_STATUS    NOT COMPLETE
P4_013A_V2       COMPLETE_WITH_REQUIRED_GAPS   (nije PASS)
```

Ova odluka **ne zatvara** Fazu 4, **ne završava** `P4-013` i **ne prepisuje** verdikt
`P4-013A` v2 kao da je prošao.

### D.4 Klauzula 14 — očekivano računovodstvo

Ovaj gate **ne pokreće** ponovo audit nad 398 redova. Računa se **isključivo** delta koju
proizvode sedam dispozicija iz dijela B:

```text
START_UNRESOLVED_REQUIRED                 12
ROWS_RESOLVED_BY_THIS_GATE                 7   (R267-R272 FUTURE_SCOPE; R303 SATISFIED_BY_EVIDENCE)
EXPECTED_UNRESOLVED_REQUIRED_AFTER_GATE    5
EXPECTED_REMAINING_ROWS                    R347, R348, R369, R373, R382
SECURITY_CLOSURE_BLOCKERS                  1   (R373, nepromijenjeno)
```

Brojka `5` je **očekivanje ove odluke, a ne izmjereni rezultat audita**. Mjerodavnu potvrdu daje
`P4-013V`; ako se pri toj mjeri razlikuje, **mjera pobjeđuje**, a ne ovo očekivanje.

## Razlog

Sedam redova je bilo **istovremeno obavezno i nedokazivo** u fazi u kojoj su stajali. Rubrik
D-056, dio C ne dopušta ni tiho brisanje ni proizvoljnu neoznačenu reziduu, pa je jedini legitiman
izlaz bio **autoritetom potkrijepljena dispozicija uz očuvanje obaveze** — tačno postupak koji je
D-052 već uspostavila za `review_decision_change_links`.

Razdvajanje po **izvodivosti** čuva sigurnosnu vrijednost gatea: Faza 4 i dalje mora dokazati
**svaki** preduslov permission modela nad kojim opoziv kasnije stoji — uslovne ćelije, odbijanje
neaktivnog membershipa, izolaciju ordinacija i `403` pri isključenom flagu. Premješta se samo ono
što traži tabelu i rute koje Faza 4 ne smije kreirati.

## Alternative

- **Ostaviti sedam redova `UNRESOLVED_REQUIRED`** — odbijeno: trajno blokira zatvaranje Faze 4 na
  obavezama koje Faza 4 ne smije ispuniti, bez ijednog sigurnosnog dobitka.
- **Označiti ih `[x]` jer D-041 postoji** — odbijeno: `[x]` znači dokaz (`00` §14). Odluka nije
  dokaz ponašanja i to bi bilo tiho penzionisanje (D-056, klauzula 13).
- **Proglasiti ih `NOT_APPLICABLE_IN_V1`** — odbijeno i **činjenično netačno**: opoziv **jeste** u
  v1, u obuhvatu Faze 10 (`04` §12.2).
- **`FUTURE_SCOPE` bez ciljnih redova u Fazi 10** — odbijeno: krši D-056, klauzulu 12 i proizvodi
  tačno tiho penzionisanje koje D-056, klauzula 13 zabranjuje.
- **Sažeti šest redova u jedan „opoziv po D-041" red Faze 10** — odbijeno: gubi auditabilnost po
  zahtjevu; šest materijalno različitih obaveza ne bi imalo šest dokaza.
- **Premjestiti i `R303`** — odbijeno: Faza 4 taj guard ishod **dokazuje**, a premještanje bi
  oslabilo njen sigurnosni preduslov, protivno D-056, klauzuli 13.
- **Dispozicionirati i preostalih pet redova ovdje** — odbijeno: drugačija priroda (izvršenje
  verifikacije), pripadaju `P4-013V` (klauzula 12).

## Posljedice

- Sedam redova više nije bez autoriteta; očekivani `UNRESOLVED_REQUIRED` pada sa **12 na 5**.
- Faza 10 dobija **sedam novih checklist redova** — šest preuzetih i jednu reziduu na nivou rute.
- Broj checklist redova **Faze 4 ostaje `398`** — ovaj gate u sekciji Faze 4 dodaje **isključivo
  prozu**, nijednu checklist stavku (D-057, klauzula 3 ostaje mjerljiva i nepromijenjena).
- `P4-013` ostaje **obavezan i nezavršen**; **Faza 4 ostaje `IN_PROGRESS`**.
- Sljedeći gate je **`P4-013V`** za preostalih pet redova, potom **`P4-013B`** za označavanje.

**Status posljedica (anotacija `P4-013B`, 2026-08-21) — tijelo odluke se ne mijenja.** Oba
najavljena gatea su izvršena, pa su gornje posljedice **ispunjene**, a ne opozvane:

```text
P4-013V-A   R373                     -> SATISFIED_BY_EVIDENCE  (570 / 570 PASS, SHA 4b48a008)
P4-013V-B   R347 R348 R369 R382      -> SATISFIED_BY_EVIDENCE  (PR #23, 579 / 579 PASS)
P4-013B     oznacavanje izvrseno     -> 279 kucica; 376 [x] / 22 [ ]
UNRESOLVED_REQUIRED   12 -> 5 (D-058: 7 redova) -> 0 (P4-013V: 5 redova)
P4_013_STATUS         COMPLETE
PHASE_4_STATUS        IN_PROGRESS     (zatvaranje je zaseban vlasnicki gate)
```

**Anotacija (D-059, 2026-08-21) — ni tijelo odluke ni gornja anotacija se ne mijenjaju.**
Najavljeni zaseban vlasnički gate zatvaranja je **izvršen**; `PHASE_4_STATUS` iz gornjeg
bloka je **historijska vrijednost trenutka `P4-013B`**, a tekuće stanje je:

```text
PHASE_4_STATUS        DONE            (D-059, 2026-08-21)
PHASE_5_STATUS        NOT_STARTED
PHASE_10_STATUS       NOT_STARTED
```

Dispozicije ove odluke — `R267`–`R272` (`FUTURE_SCOPE`, Faza 10) i `R303`
(`SATISFIED_BY_EVIDENCE`, Faza 4) — D-059 **ne preispituje i ne mijenja**; te obaveze
**ostaju žive** u Fazi 10 i zatvaranjem Faze 4 **nisu retirirane**. Vidi **D-059**.

Dispozicije `R267`–`R272` (`FUTURE_SCOPE`, Faza 10) i `R303` (`SATISFIED_BY_EVIDENCE`, Faza 4) iz
ove odluke su u `P4-013B` **primijenjene doslovno i nepromijenjeno**; `P4-013B` ih **ne
preispituje**.

## Security/privacy uticaj

**Nijedan sigurnosni zahtjev nije uklonjen, oslabljen ni označen završenim.** Odobravanje i opoziv
su po D-041 pravno najteže radnje u sistemu; sve njihove kontrole — obavezan `reason`,
neuništivost dokaza odobrenja, immutable historija i revocation audit event — **preživljavaju
doslovno**, u fazi koja ih jedina može izvršiti i dokazati.

Faza 4 pritom **ne gubi nijedan preduslov**: uslovne ćelije, pravilo „flag bez role ne daje
permisiju", pravilo „rola bez flaga je odbijena", odbijanje neaktivnog membershipa, cross-practice
i cross-user izolacija i `403` pri isključenom flagu ostaju **obavezni u Fazi 4**, a `R303` je
ovdje **dokazan**, ne premješten. Efekt na Fazu 10 je **strožiji**, jer sada nosi šest eksplicitnih
redova umjesto tri sažeta.

## Migration/rollout

**Dokumentacija isključivo.** Nema schema, migracionih, seed, DDL/DML, fixture, test ni runtime
promjena. Zahvaćeni su `docs/04_BACKEND_IMPLEMENTATION_PLAN_V1.md`,
`docs/05_IMPLEMENTATION_CHECKLIST.md`, `docs/06_DECISION_LOG.md`,
`docs/07_CURSOR_PHASE_PROMPTS.md`, `docs/11_DEFINITION_OF_DONE_AND_ACCEPTANCE.md` i `MANIFEST.md`.

## Test dokaz

**Nijedan novi test se ne uvodi i nijedan se ne izvršava u ovom gateu.** Dokaz klauzule 5 su
**postojeći trajni testovi** citirani u dijelu B.2, prepoznati putem koji D-056, klauzula 9
izričito dopušta. Dokaz klauzula 1–4 je **mehanički i reproducibilan** nad kanonskim stablom:
odsustvo `analysis_approvals` u `apps/api/prisma/`, odsustvo approval i revocation kontrolera u
`apps/api/src/`, i tri postojeća migraciona paketa.

## Supersedes

**Ne supersedira i ne amandmanira nijednu odluku.** D-041 ostaje **na snazi u cijelosti**;
klauzule 6–11 se **ne mijenjaju** — mijenja se samo **faza u kojoj se izvršavaju i dokazuju**, po
uzoru na D-052, A.5. Rubrik D-056, dio C i obuhvat iz D-057 ostaju **nepromijenjeni i nadređeni**;
ova odluka ih **primjenjuje**.

## Zavisnosti

D-016, D-038, **D-041**, D-045, D-046, **D-052**, **D-056**, **D-057**.

---

# D-059 — Formalno zatvaranje Faze 4

- **Status:** ACCEPTED
- **Datum:** 2026-08-21
- **Tip:** governance odluka o zatvaranju faze. **Dokumentacija isključivo.**
- **Amandman na:** **nijednu odluku.** Ova odluka **primjenjuje** rubrik D-056, dio C na Fazu 4 i
  **evidentira lifecycle prelazak**. **Nijedna klauzula D-056, D-057 ni D-058 se ne dira, ne
  slabi, ne opoziva ni ne prepisuje**, i **nijedna dispozicija reda `P4-013` se ne preispituje.**
- **Vlasnička ratifikacija:** vlasnik je prihvatio finalni **read-only** audit zatvaranja Faze 4 i
  donio ruling: **„Faza 4 je autorizovana za formalno zatvaranje."**

## Kontekst/problem — trigger

Finalni **read-only** audit zatvaranja Faze 4, izvršen nad kanonskim `main`-om
`9b8fcdd21a51935b7cc6cd810e0e91e44ec281e3`, vratio je:

```text
PHASE4_FINAL_CLOSURE_AUDIT_PASS
PHASE4_READY_FOR_FORMAL_CLOSURE   YES
```

Taj audit **nije napravio nijednu izmjenu repozitorija**. Time je nestao posljednji uslov koji su
D-056, klauzula 19 i `P4-013B` držali otvorenim: **završetak `P4-013` je bio nužan, ali ne i
dovoljan** — sam prelazak `IN_PROGRESS → DONE` bio je rezervisan za **zaseban, vlasnički pregledan
gate**. Ova odluka je taj gate.

## Odluka

# Dio A — autoritet zatvaranja

Zatvaranje se oslanja **isključivo** na već prihvaćene autoritete; nijedan novi rubrik se ne uvodi:

- **D-056, dio C** — normativni rubrik zatvaranja faze: faza se smije zatvoriti kada je
  `UNRESOLVED_REQUIRED = 0`, uz očuvanje živih obaveza (klauzula 12) i zabrane iz klauzule 13;
- **D-057** — kanonski **strukturni** obuhvat gatea `P4-013` (klauzule 3–6): **398** redova;
- **D-058** — vlasništvo faza za odobravanje/opoziv i dispozicija sedam redova;
- **`P4-013B`** — kanonska rekonsilijacija dokumentacije, merged kroz **PR #24**;
- **finalni read-only audit zatvaranja** — `PASS`.

# Dio B — konačno računovodstvo Faze 4

Preuzeto iz `P4-013B` i **ponovo potvrđeno**, ne ponovo izvedeno. Puni ledger od 398 redova se
**ne reprodukuje** ovdje; kanonski je u `05` §5.

```text
TOTAL_ROWS                  398

SATISFIED_BY_EVIDENCE       375
HISTORICAL                    1
NOT_APPLICABLE_IN_V1          8
EXPLICITLY_DEFERRED           2
FUTURE_SCOPE                 12
SUPERSEDED                    0
UNRESOLVED_REQUIRED           0
                            ---
                            398

SECURITY_CLOSURE_BLOCKERS     0
OPEN_PHASE4_BLOCKERS          0
SILENT_RETIREMENTS            0
TARGET_OWNERS_VERIFIED      YES   (R267-R272 -> 6 doslovnih redova u Fazi 10, 1:1)
```

# Dio C — sigurnosni dokaz

Pointeri, **bez reprodukcije logova**:

```text
P4-013V-A             pnpm test:security   570 / 570 PASS   (SHA 4b48a008)
P4-013V-B / PR #23    pnpm test:security   579 / 579 PASS   (evidence commit 111d91d;
                                                             kanonski merge 58f83d49)
```

`R373` (`ALL RLS TESTS GREEN — required before phase 5`) je bio **jedini**
`SECURITY_CLOSURE_BLOCKER`; zatvoren je u `P4-013V-A`, čime je
`SECURITY_CLOSURE_BLOCKERS 1 -> 0`.

# Dio D — vlasnički ruling i status faze

### D.1 Klauzula 1 — prelazak statusa

```text
PHASE_4_STATUS   IN_PROGRESS -> DONE
```

`DONE` je **postojeći kanonski status završene faze** ovog repozitorija (`05` §0: `NOT_STARTED`,
`IN_PROGRESS`, `BLOCKED`, `DONE`), isti koji nose Faze 1–3. **Nijedna nova statusna riječ se ne
uvodi.**

### D.2 Klauzula 2 — `DONE` je rezervisani lifecycle status

Kao što je `05` §4 utvrdio za Fazu 3, `DONE` je u ovom repozitoriju **rezervisan za lifecycle
zatvaranja merged u kanonski `main`**. Ova odluka nastaje na **zatvaračkoj grani** i **postaje
kanonska merge-om te grane u `origin/main`**, tačno po presedanu Faze 3 (`9af070d`, zatvaranje
nakon merge-a PR #12). Do tog merge-a zapis je **vlasnički odobren, ali ne još kanonski**.

### D.3 Klauzula 3 — šta `DONE` ne tvrdi

`DONE` Faze 4 **ne** znači produkcijsku spremnost, **ne** znači pilot readiness i **ne**
autorizuje nijednu narednu fazu.

# Dio E — buduće obaveze se ne retiriraju

### E.1 Klauzula 4 — zatvaranje ne zadovoljava nijednu odgođenu obavezu

Zatvaranje Faze 4 **ne retirira, ne zadovoljava i ne slabi** nijednu `FUTURE_SCOPE` ni
`EXPLICITLY_DEFERRED` obavezu. Sve ostaju **žive i u vlasništvu svojih kanonskih budućih faza**:

- konkretan **`TenantDatabaseService` facade** (`R9`, `R320`) — `EXPLICITLY_DEFERRED` (D-056, dio
  A); trigger je **uslovan, ne fazni**; najranije očekivano Faza 5 (`05` §6);
- **`R267`–`R272`** — `FUTURE_SCOPE`, **Faza 10**, doslovno preuzeti redovi (D-058, kl. 3–4, 8–9);
- **rezidua `R303` na nivou rute** — zaseban red **Faze 10** (D-058, kl. 6). Sam `R303` ostaje
  `SATISFIED_BY_EVIDENCE` u Fazi 4 i njegova dispozicija se **ne mijenja** (D-058, kl. 5);
- **`R314`–`R318`** i **`R370`** — `FUTURE_SCOPE`; **`R306`–`R313`** — `NOT_APPLICABLE_IN_V1`
  (D-045).

### E.2 Klauzula 5 — `SILENT_RETIREMENTS = 0` ostaje mjerljivo

Registar dispozicija u `05` §5 i ciljni redovi Faze 10 ostaju **nepromijenjeni ovom odlukom**.
Ovaj gate **nije dodao, uklonio ni označio nijednu checklist kućicu**.

# Dio F — granica prema Fazi 5

### F.1 Klauzula 6 — Faza 5 ostaje `NOT_STARTED`

```text
PHASE_5_STATUS    NOT_STARTED
PHASE_10_STATUS   NOT_STARTED
```

Ova odluka zatvara **isključivo** Fazu 4. **Ne autorizuje** implementaciju Faze 5, ne otvara njen
branch, ne izvršava njen prompt (`07`, „Prompt — Faza 5") i **ne označava nijednu njenu kućicu**.
Pokretanje Faze 5 je **zaseban gate**.

# Dio G — konačnost

### G.1 Klauzula 7 — nema otvorene remedijacije

Nijedna Faza-4 implementacijska remedijacija nije otvorena: `OPEN_PHASE4_BLOCKERS = 0`.

### G.2 Klauzula 8 — zatvaranje se ne otvara tiho

Svaka buduća izmjena **završenog ponašanja Faze 4** traži **novu, eksplicitnu
odluku/governance putanju**. Ovaj zapis zatvaranja se **ne reinterpretira i ne otvara tiho**, i
**ne smije** se koristiti kao autoritet za promjenu dispozicija `P4-013`.

## Razlog

Rubrik D-056, dio C je ispunjen i **izmjeren**, ne pretpostavljen: obuhvat je kanonski (D-057),
svih 398 redova nosi ili dokaz ili autoritetom potkrijepljenu dispoziciju, `UNRESOLVED_REQUIRED` i
`SECURITY_CLOSURE_BLOCKERS` su nula, a žive obaveze su **premještene, ne izbrisane**. Držati fazu
`IN_PROGRESS` nakon toga značilo bi da rubrik zatvaranja nema izlaz — što bi ga učinilo
neupotrebljivim.

## Alternative

- **Ostaviti Fazu 4 `IN_PROGRESS`** — odbijeno: svi uslovi rubrika D-056, dio C su ispunjeni i
  izmjereni; status bi prestao da nosi informaciju.
- **Uvesti novi status `CLOSED`** — odbijeno: `05` §0 zamrzava rječnik na `NOT_STARTED`,
  `IN_PROGRESS`, `BLOCKED`, `DONE`; dvije riječi za isto stanje su governance šum.
- **Zatvoriti Fazu 4 i istovremeno autorizovati Fazu 5** — odbijeno: to su **dva** gatea; spajanje
  bi ponovilo grešku koju D-056, klauzula 13 zabranjuje u drugom obliku.
- **Zatvoriti i proglasiti odgođene obaveze zadovoljenim** — odbijeno: to je tačno tiho
  penzionisanje iz D-056, klauzule 13.
- **Prepisati D-056/D-057/D-058 kao da je Faza 4 oduvijek bila zatvorena** — odbijeno: `06`
  zabranjuje tihu izmjenu prihvaćene odluke; koristi se **anotacija**, po presedanu D-057 i
  `P4-013B`.

## Posljedice

- **Faza 4 je `DONE`**; posljednja završena faza u `05` §0 je sada Faza 4.
- `P4-013` ostaje **`COMPLETE`**; nijedna njegova dispozicija nije dirnuta.
- **Faza 5 i Faza 10 ostaju `NOT_STARTED`**; broj označenih kućica u obje je **nepromijenjen**.
- Odgođene i buduće obaveze ostaju **žive** u svojim fazama.
- Naredni korak je **vlasnički pregled → objava grane → PR → merge → kanonska post-merge
  atestacija**; tek merge čini `DONE` kanonskim.

## Security/privacy uticaj

**Nijedan sigurnosni zahtjev nije uklonjen, oslabljen ni označen završenim.** Zatvaranje je
evidencijski čin nad već dokazanim stanjem: `SECURITY_CLOSURE_BLOCKERS = 0` je **izmjeren**
(`P4-013V-A`, `P4-013V-B`), a ne pretpostavljen. Sigurnosni preduslovi Faze 4 — tenant izolacija,
RLS i `FORCE RLS`, pinovana transakcijska granica sa `set_request_context`, odbijanje neaktivnog
membershipa, cross-practice i cross-user izolacija i `403` pri isključenom flagu — ostaju
**obavezni i dokazani**, i **ne smiju se oslabiti** pozivom na zatvorenost faze.

## Migration/rollout

**Dokumentacija isključivo.** Nema aplikacijskih, test, fixture, schema, migracionih, seed ni
permission promjena, i nijedna implementaciona komanda nije izvršena. Zahvaćeni su
`docs/05_IMPLEMENTATION_CHECKLIST.md`, `docs/06_DECISION_LOG.md` i `MANIFEST.md`.

## Test dokaz

**Nijedan novi test se ne uvodi i nijedan se ne izvršava u ovom gateu.** Dokaz su **postojeći,
već izvršeni i citirani** rezultati iz dijela C (`570 / 570` i `579 / 579` PASS) i mehanička
provjera računovodstva iz dijela B nad kanonskim `05` §5.

## Supersedes

**Ne supersedira nijednu odluku.** D-056, D-057 i D-058 ostaju **na snazi u cijelosti** i
**nadređeni** su ovoj odluci; ona ih **primjenjuje**. Njihova tijela se **ne prepisuju** —
dodaje se isključivo **anotacija tekućeg statusa**, po presedanu D-057 (nad D-056) i `P4-013B`
(nad D-058).

## Zavisnosti

D-041, D-045, D-052, D-053, D-054, D-055, **D-056**, **D-057**, **D-058**.

---

# D-060 — PHI dizajn Faze 5: HMAC eksternog ID-a, pseudonim, normalizacija teksta, hashing, deterministička redakcija i statusni rječnici

- **Status:** ACCEPTED
- **Datum:** 2026-08-22
- **Tip:** dizajnerska odluka o PHI/sigurnosnim ugovorima Faze 5. **Dokumentacija isključivo.**
- **Amandman na:** **nijednu odluku.** Ova odluka **dopunjuje** D-018 i D-025 novim, susjednim
  ugovorom (keyed lookup token, pseudonim, normalizacija, hashing, redakcija). **Nijedna klauzula
  D-025 se ne mijenja, ne slabi ni ne opoziva**, a D-OPEN-004a **ostaje otvoren**.
- **Vlasnička ratifikacija:** vlasnik je prihvatio nalaze read-only dizajn audita `P5-D1-A` i
  ratifikovao odluke D1–D16 iz tog audita. Ovaj zapis je njihova **objava**, ne njihovo ponovno
  izvođenje.

## Kontekst/problem — trigger

`02` §7.1 i §8.2 već fiksiraju kolone `external_*_ref_hash`, `pseudonym`, `source_text_hash`,
`redacted_text_hash`, `processing_status` i `redaction_status`, a `03` §11 i §13 već fiksiraju
endpointe koji ih pune. Ono što **nije** bilo kanonski određeno je **značenje** tih polja:

- `09` §8 traži „keyed HMAC" za external ID, ali ne imenuje ključ, poruku, domensku separaciju,
  encoding ni oblik verzionisanja;
- `02` §7.1 zabranjuje pseudonim izveden skraćivanjem eksternog ID-a, ali ne definiše sintaksu,
  izvor entropije, entropijski cilj ni semantiku pretrage;
- „normalized text" i `source_text_hash` se pominju u `01` §12 i `02` §8.2 bez normativnog
  redoslijeda operacija — a hash bez fiksne normalizacije nije reproducibilan;
- „redaction" je u `04` §7.5 opisan kao „mock/basic rule", bez granice šta jeste, a naročito **šta
  nije**;
- `processing_status` i `redaction_status` su `varchar(30)` bez ijednog kanonskog rječnika;
- `03` §13 nudi `redactBeforeAiProcessing` i `view=original` bez definisane semantike.

Svako od tih polja je PHI-nosivo ili PHI-vezano. Implementirati ih bez prethodno zamrznutog ugovora
značilo bi da prvi napisani kod postaje neformalna specifikacija — a normalizacija i hashing su
**immutable čim postoji ijedan perzistirani red**. Zato ovaj gate prethodi svakoj schema i business
implementaciji Faze 5.

## Odluka

# Dio A — HMAC eksternog ID-a

### A.1 Klauzula 1 — algoritam i namjenski ključ

Deterministički lookup token eksternog identifikatora računa se **HMAC-SHA256** algoritmom, uz
**namjenski HMAC ključ `K_hmac`**, odvojen od AES-GCM ključa podataka `K_enc` iz D-025.

`K_hmac` **ne smije** biti jednak `K_enc` niti direktno izveden iz njega.

### A.2 Klauzula 2 — zašto ponovna upotreba AES ključa nije dozvoljena

Zabrana nije stilska. D-025, klauzula 7 propisuje da **re-enkripcija pri rotaciji ključa ne mijenja
`*_hash` kolone**. Da `*_hash` zavisi od `K_enc`, rotacija enkripcijskog ključa bi promijenila
identitet deterministički pretraživog tokena i **razbila lookup identitet** postojećih redova, ili
bi zahtijevala rewrite svih `*_hash` vrijednosti — što D-025 izričito ne radi. Odvojen `K_hmac`
čini enkripcijsku rotaciju i lookup identitet **nezavisnim osama**.

### A.3 Klauzula 3 — kanonska HMAC poruka i domenska separacija

HMAC poruka je kanonski UTF-8 string, LF separatori, **bez završnog praznog reda**, po istoj
filozofiji kao kanonski AAD iz D-025, klauzule 5:

```text
v1
domain=<token domain>
practice_id=<canonical UUID>
source_system=<canonical enum literal>
value=<normalized external identifier>
```

Redoslijed redova je **normativan**. Prvi red je **verzija formata HMAC poruke**, ne verzija ključa.

### A.4 Klauzula 4 — katalog domena

```text
patient_external_ref
encounter_external_ref
document_external_ref
```

Domen je **obavezan** i ulazi u poruku. Isti eksterni string u dvije domene daje **dva različita**
tokena. Isto važi za dvije ordinacije i dva `source_system` literala.

### A.5 Klauzula 5 — encoding tokena

Rezultat je **lowercase heksadecimalni** zapis od tačno **64** znaka.

### A.6 Klauzula 6 — perzistirani oblik i generacijski marker

Perzistira se u **postojeću** `varchar(128)` kolonu, u obliku:

```text
h1.<64 lowercase hex>
```

Ukupna dužina v1 tokena je 67 znakova, unutar postojećeg `varchar(128)`. **Nijedna schema promjena
nije potrebna.**

### A.7 Klauzula 7 — šta `h1` znači, a šta ne znači

`h1` je **identifikator generacije HMAC tokena**. On veže **tri** stvari zajedno:

- porodicu/verziju HMAC algoritma;
- generaciju/verziju HMAC ključa;
- generaciju kanonskog formata HMAC poruke (klauzula 3).

`h1` **nije** verzija normalizacionog profila eksternog ID-a. Profil normalizacije je **odvojeno**
verzionisan (Dio B) i **ne smije se tiho poistovjetiti** sa `h1`.

### A.8 Klauzula 8 — operativna politika v1 i buduće generacije

- v1 ima **jednu aktivnu generaciju HMAC ključa**;
- **rutinska rotacija HMAC ključa nije planirana u Fazi 5**;
- format tokena svejedno **mora** podržati više generacija;
- budući lookup smije izračunati **više kandidata po generaciji** i porediti ih jednakošću ili `IN`
  listom;
- **ne uvodi se** kolona za verziju HMAC ključa; marker živi unutar tokena.

### A.9 Klauzula 9 — budući startup guard (zahtjev, ne implementacija)

Budući startup guard mora odbiti start ako je `K_hmac == K_enc`. Ovo je **dizajnerski zahtjev**;
ovaj gate ga **ne implementira** i ne mijenja nijedan postojeći guard iz D-025, klauzule 10.

# Dio B — normalizacija eksternog identifikatora

### B.1 Klauzula 10 — profil `MANUAL`, verzija 1

Prije HMAC-a eksterni identifikator prolazi **minimalan** normalizacioni profil. Aktivni profil je
**`MANUAL`, verzija 1**. Operacije, **tim redoslijedom**:

1. ulaz mora biti validan aplikacijski string / validan Unicode;
2. odbij `NUL`;
3. odbij C0/C1 kontrolne znakove;
4. ukloni vodeći `U+FEFF` (BOM) ako postoji;
5. skrati vodeći i prateći Unicode whitespace;
6. Unicode normalizacija **NFC**;
7. odbij prazan rezultat nakon normalizacije;
8. primijeni eksplicitan maksimum dužine identifikatora, preuzet iz postojećih schema/API
   ograničenja;
9. kodiraj kao UTF-8 na HMAC granici.

### B.2 Klauzula 11 — izričito zabranjene operacije

Profil **ne smije**:

- primijeniti `NFKC`;
- raditi case-folding;
- uklanjati vodeće nule;
- sažimati unutrašnji whitespace;
- mijenjati interpunkciju;
- raditi homoglyph/confusable folding.

Razlog je da su eksterni identifikatori **poslovno značajni nizovi**: `0012` i `12` mogu biti
različiti pacijenti, a `a` i `A` različiti zapisi u izvornom sistemu. Agresivna normalizacija bi
proizvela **tihe kolizije identiteta** koje nijedan constraint ne bi otkrio.

### B.3 Klauzula 12 — immutability profila

Normalizacioni profil je **immutable od trenutka kad pod njim postoji ijedan perzistirani red**.
Promjena ponašanja zahtijeva **novi profil/verziju**, ne izmjenu postojećeg.

Buduća Axenita integracija smije definisati **zaseban profil `AXENITA`** — i to **tek nakon** što
D-OPEN-009 bude odblokiran. **Axenita normalizacija se ovdje ne izmišlja.**

# Dio C — pseudonim pacijenta

### C.1 Klauzula 13 — sintaksa v1

```text
P- + 10 velikih Crockford Base32 znakova
```

Kanonska v1 sintaksa je `P-` praćeno tačno deset znakova iz Crockford Base32 abecede, velikim
slovima. Primjer **oblika**, ne fiksni uzorak: `P-K7M2QX4TB9`.

### C.2 Klauzula 14 — porijeklo i nepovezanost sa eksternim ID-em

Pseudonim:

- **mora** biti generisan iz CSPRNG-a;
- **ne smije** biti izveden iz eksternog identifikatora pacijenta;
- **ne smije** biti hash, skraćivanje ni HMAC eksternog identifikatora;
- **ne smije** biti reverzibilan;
- **mora** ostati stabilan za cijeli životni vijek reda `patient_references`.

Ovo pooštrava i **ne slabi** postojeće pravilo `02` §7.1 („produkcijski pseudonim ne smije biti
izveden direktnim skraćivanjem eksternog ID-a").

### C.3 Klauzula 15 — entropija, kolizije, immutability

- ciljna entropija: **približno 50 bita ili više**;
- kanonski perzistirani oblik: **velika slova**;
- jedinstvenost: **postojeći** `unique (practice_id, pseudonym)`;
- kolizija: **ograničen** regenerate-and-retry pri unique violationu;
- **nema** determinističkog fallbacka; pri iscrpljenim pokušajima zahtjev pada;
- pseudonim je **immutable** nakon kreiranja.

### C.4 Klauzula 16 — semantika pretrage bez schema promjene

Baza **ne** dobija posebnu case-insensitive semantiku poređenja. Umjesto toga:

- generiši velikim slovima;
- perzistiraj velikim slovima;
- **ulazni** `patientPseudonym` iz query parametra kanonizuj u velika slova **prije** obične
  jednakosne pretrage.

**Ne uvode se** `citext`, `LOWER(kolona)`, posebne kolacije ni funkcijski indeksi, i **schema se ne
mijenja** radi case-insensitive pretrage.

# Dio D — normalizacija kliničkog teksta

### D.1 Klauzula 17 — normativni v1 pipeline

Normalizacija je **minimalna i semantički lossless**. Operacije, **tim redoslijedom**:

1. validiraj aplikacijski string / validan Unicode;
2. normalizuj `CRLF` i samostalni `CR` u `LF`;
3. odbij `NUL`;
4. odbij C0/C1 kontrolne znakove **osim** `LF` i `TAB`;
5. ukloni **jedan** vodeći `U+FEFF` (BOM) ako postoji;
6. Unicode normalizacija **NFC**;
7. skrati vodeći i prateći whitespace **isključivo na nivou cijelog dokumenta**;
8. odbij prazan rezultat nakon normalizacije;
9. primijeni maksimum manuelnog teksta (klauzula 35);
10. **nikada ne skraćuj sadržaj.**

### D.2 Klauzula 18 — obavezno očuvani sadržaj

Normalizacija **mora očuvati**: velika/mala slova; interpunkciju; unutrašnji whitespace; tabove;
ponovljene prazne redove; medicinski značajne simbole; decimalne zareze i tačke; jedinice; datume;
nazive lijekova; doziranja; dijagnoze; nalaze.

`NFKC` se **ne smije** koristiti — on mijenja znakove nosioce kliničkog značenja (razlomke,
indekse, tipografske varijante) i time normalizacija prestaje biti lossless.

### D.3 Klauzula 19 — normalizacija je dio hashing ugovora

Tačan redoslijed operacija iz klauzule 17 je **dio ugovora o hashovanju** i **ne smije se tiho
mijenjati**. Promjena ponašanja zahtijeva novu, eksplicitnu odluku, jer bi inače `source_text_hash`
postojećih redova prestao biti reproducibilan.

# Dio E — `source_text_hash`

### E.1 Klauzula 20 — definicija

`source_text_hash` je **lowercase hex SHA-256 UTF-8 kodiranja kanonski normalizovanog,
neredigovanog teksta**.

### E.2 Klauzula 21 — normativni redoslijed

```text
sirovi request
  -> normalizacija (Dio D)
  -> normalizovani UTF-8
  -> SHA-256
  -> lowercase hex
  -> source_text_hash
  -> enkripcija i pohrana normalizovanog teksta (D-025)
```

Posljedica je namjerna: hash je **reproducibilan iz perzistiranog ciphertexta** nakon ovlaštene
dekripcije. **Ne uvodi se druga kolona** za hash sirovog ulaza.

`redacted_text_hash` se računa istim postupkom nad **redigovanim** tekstom.

# Dio F — deterministička redakcija Faze 5

### F.1 Klauzula 22 — šta redakcija Faze 5 jeste

Deterministički, **ne-AI**, osnovni ruleset za uklanjanje identifikatora.

### F.2 Klauzula 23 — šta redakcija Faze 5 **nije**

Redakcija **nije** anonimizacija. **Nije** de-identifikacija. **Nije** zamjena za enkripciju ni
RLS. **Redigovani izlaz ostaje Class A medicinski podatak** (`09` §2) i nosi sve kontrole te klase.

### F.3 Klauzula 24 — minimalni ruleset Faze 5

Podržane klase:

- e-mail adrese;
- `http`/`https` i `www.` URL-ovi;
- švicarski AHV/AVS broj **isključivo** kad format i kontrolna cifra prođu validaciju;
- švicarski IBAN **isključivo** kad checksum prođe validaciju;
- identifikatori osiguranja/kartice **isključivo** tamo gdje je kanonski definisan visokopouzdan,
  validiran uzorak;
- **eksplicitna eksterna referenca pacijenta iz tekućeg intake zahtjeva**, ako se pojavljuje u
  tekstu;
- švicarski telefonski brojevi **isključivo** kroz konzervativan prepoznavač.

### F.4 Klauzula 25 — stroga posture za telefonske brojeve

**Ne koristi se širok generički telefonski regex.** Koristi se **isključivo strog švicarski**
prepoznavač sa dovoljno jakim strukturnim dokazom. **Kad je signal dvosmislen — ne rediguje se.**

**Lažno negativni rezultati su prihvaćeni i dokumentovani za Fazu 5**, jer je lažno pozitivna
redakcija doziranja, laboratorijske vrijednosti ili tarifnog koda **klinički opasnija** od
propuštenog broja u tekstu koji ionako ostaje enkriptovan i pod RLS-om.

### F.5 Klauzula 26 — šta se **ne** rediguje automatski

Imena osoba; adrese; dijagnoze; simptomi; lijekovi; doziranja; mjerenja; medicinski nužni datumi;
klinički nalazi.

Njihovo uklanjanje traži budući viši nivo redakcije/NER logike i **nije obuhvat Faze 5**. Nijedan
dokument, test ni komentar **ne smije tvrditi** da su te klase pokrivene.

### F.6 Klauzula 27 — zamjenski tokeni

Zamjenski token je **konstantan po klasi**, na primjer:

```text
[REDACTED:EMAIL]
```

Token **ne smije** sadržavati: hash; originalni prefiks ni sufiks; skraćeni original; niti bilo
kakav stabilan derivat uklonjene vrijednosti. Stabilan derivat bi ponovo uveo linkabilnost koju
redakcija treba ukloniti.

### F.7 Klauzula 28 — verzija ruleseta

Verzija ruleseta je **immutable identifikator na nivou koda/konfiguracije**:

```text
phase5-basic-v1
```

- verzija je dio ugovora koda/konfiguracije;
- ponašanje verzije je **immutable** čim je upotrijebljena nad perzistiranim dokumentima;
- promjena ponašanja zahtijeva **novu verziju ruleseta**;
- **ne uvodi se** kolona za verziju ruleseta po dokumentu u Fazi 5;
- P5-D2 smije preispitati perzistenciju **samo** ako zaseban audit/provenance zahtjev to naloži.

# Dio G — statusni rječnici

### G.1 Klauzula 29 — `processing_status`

Kanonski rječnik Faze 5, na aplikacijskom nivou:

```text
READY
FAILED
```

- **`READY`** — normalizacija je uspjela, a normalizovani source-side artefakt je validan,
  enkriptovan i hash-konzistentan.
- **`FAILED`** — dokument postoji, ali source-side artefakt obrade nije upotrebljiv.

**Nema** `PENDING`. **Nema** `PROCESSING`. **Nema** `ARCHIVED` statusa — arhiviranje i dalje nosi
`archived_at` (`02` §8.2). **Ne uvode se** stanja upload putanje.

### G.2 Klauzula 30 — `redaction_status`

```text
COMPLETED
FAILED
```

- **`COMPLETED`** — kompletan deterministički ruleset Faze 5, u verziji konfigurisanoj za
  aplikaciju, izvršen je uspješno i proizveo je enkriptovani redigovani tekst i hash redigovanog
  teksta.
- **`FAILED`** — redakcija nije proizvela upotrebljiv redigovani artefakt.

### G.3 Klauzula 31 — normativna klauzula iskrenosti za `COMPLETED`

`COMPLETED` znači **isključivo** da je konfigurisani deterministički ruleset Faze 5 izvršen
uspješno.

`COMPLETED` **ne tvrdi**: anonimizaciju; de-identifikaciju; odsustvo svih identifikatora; niti
sigurnost za neograničeno otkrivanje. **Rezultat ostaje Class A medicinski podatak.**

### G.4 Klauzula 32 — ponašanje pri `FAILED` redakciji

- `redacted_text_*` i `redacted_text_hash` ostaju null/odsutni, kako schema već dozvoljava;
- **`view=redacted` NE SMIJE pasti nazad na normalizovani ni originalni tekst**;
- dokument **ne može** zadovoljiti PHI-readiness predikat Faze 5;
- deterministička redakcija se smije **kasnije ponoviti pod istom verzijom ruleseta**;
- ponovni pokušaj **mora** koristiti **svjež AES-GCM IV** (D-025, klauzula 6).

**Nema** `SKIPPED`.

### G.5 Klauzula 33 — sloj sprovođenja

U Fazi 5 oba rječnika sprovodi **aplikacijska/domenska logika**. **U ovom gateu se ne dodaju
database `CHECK` constrainti.** Odluku da li rječnici postaju DB-sprovedeni **posjeduje P5-D2**.

# Dio H — API semantika

### H.1 Klauzula 34 — `view=original`

API parametar `view=original` **ostaje** i kanonski znači:

> **dekriptovan, neredigovan, kanonski normalizovan tekst dokumenta.**

To **nije** obećanje tačnih sirovih HTTP/request bajtova. Kanonska schema **ne perzistira**
pre-normalizacioni sirovi manuelni tekst. API se **ne preimenuje** i **ne dodaje se** kolona za
sirovi tekst.

Ponašanje permisija iz D-043 se **ne mijenja**: `view=redacted` traži običnu permisiju čitanja
dokumenta; `view=original` **dodatno** traži `encounter.document.read_original` i proizvodi
`DOCUMENT_VIEWED` audit ponašanje prema postojećem autoritetu.

### H.2 Klauzula 35 — maksimalna veličina aktivnog manuelnog teksta

Maksimum je **256 KiB UTF-8** ulaznog teksta za aktivni manual-text endpoint.

- primjenjuje se na **dekodirani tekst zahtjeva prije normalizacije**;
- prekoračenje → **`422 VALIDATION_ERROR`**;
- **nikada se ne skraćuje**;
- tekst se **nikada ne vraća** u validacionom odgovoru ni u logu;
- **i izlaz normalizacije** mora ostati unutar istog maksimuma;
- ako bi normalizacija proizvela nevalidan rezultat, zahtjev se **odbija**, a ne dodatno mijenja.

`413 Payload Too Large` u `03` §9 ostaje vezan **isključivo za DEFERRED upload putanju** (`03`
§13.2). Validacija manuelnog teksta u Fazi 5 koristi **validacioni ugovor API-ja**
(`422 VALIDATION_ERROR`), ne grešku odgođene upload putanje.

Generički transportni body limit (`09` §14, `API_BODY_LIMIT`) je **odvojen, infrastrukturni**
vanjski čuvar i **nije** ugovor ovog endpointa; njegova tekuća podrazumijevana vrijednost (`1mb`)
je **iznad** 256 KiB, pa endpoint-level maksimum ostaje dostižan i mjerodavan.

### H.3 Klauzula 36 — `redactBeforeAiProcessing`

Za aktivni v1:

```text
redactBeforeAiProcessing = false  ->  422 VALIDATION_ERROR
```

Razlog:

- kanonski tokovi **rediguju bezuslovno**;
- **nijedna kolona ne perzistira** ovu politiku kao trajno svojstvo dokumenta;
- prihvatanje `false` bi proizvelo **nedefinisanu semantiku `view=redacted`** i moglo bi potkopati
  D-043.

**Ne uvodi se** `SKIPPED` status. Polje se **ne uklanja** iz zahtjeva — ograničava se **skup
prihvaćenih vrijednosti**.

### H.4 Klauzula 37 — `POST /patient-references`

Ugovor se pojašnjava **bez promjene oblika zahtjeva ni odgovora**: eksterni ID se normalizuje
profilom `MANUAL` v1; HMAC se opisuje **apstraktno, bez izlaganja materijala ključa**; pseudonim
prati v1 sintaksu; **čisti eksterni ID se nikada ne vraća i nikada ne logira**.

# Dio I — sigurnost logova i grešaka

### I.1 Klauzula 38 — klasifikacija

- **HMAC token eksternog ID-a je osjetljiv i linkabilan** i **nije loggable**;
- **pseudonim je Class C** (`09` §2) i **nije** na allowlisti tehničkog loga (`09` §11);
- **tekst dokumenta ostaje Class A i nakon redakcije.**

### I.2 Klauzula 39 — apsolutna zabrana u logovima i greškama

Log i error putanje **nikada** ne smiju sadržavati: eksterne ID-eve; HMAC tokene; pseudonime;
izvorni, normalizovani ni redigovani tekst; ciphertext; ključeve; IV ni auth tag; niti **spornu PHI
vrijednost koja je pala validaciju**.

### I.3 Klauzula 40 — Problem Details poruke

Validacione poruke za PHI i eksterne identifikatore koriste **sigurne generičke poruke**. Polje
`errors[].message` (`03` §8) **ne smije** citirati odbijenu vrijednost, njen prefiks, sufiks, niti
bilo koji njen derivat.

### I.4 Klauzula 41 — redakcija nije sigurnosna granica

Redakcija je **pomoć pri egressu i minimizaciji podataka**, ne sigurnosna granica. Sigurnosne
granice ostaju: autentifikacija, permisije, tenant izolacija/RLS i aplikacijska enkripcija. Nijedna
kontrola se **ne smije oslabiti** pozivom na to da je tekst redigovan.

# Dio J — granice

### J.1 Klauzula 42 — ovo je objava autoriteta, ne autorizacija implementacije

Ova odluka **objavljuje dizajnerski autoritet**. Ona **ne autorizuje** njegovu implementaciju:
nijedan servis, endpoint, tabela, migracija ni test se ovim gateom ne uvode.

### J.2 Klauzula 43 — Faza 5 ostaje `NOT_STARTED`

```text
PHASE_5_STATUS   NOT_STARTED
```

Nijedna kućica Faze 5 nije označena. Pokretanje Faze 5 ostaje **zaseban gate**.

### J.3 Klauzula 44 — schema se ne mijenja

**Nijedna kolona se ne dodaje, ne uklanja i ne mijenja.** Konkretno se **ne uvode**: kolona za
verziju HMAC ključa; kolona za verziju redakcionog ruleseta; kolona za sirovi tekst; drugi hash
sirovog ulaza; `citext` ni funkcijski indeks za pseudonim; `CHECK` constraint za statusne rječnike.

### J.4 Klauzula 45 — otvorena pitanja koja ova odluka **ne** zatvara

- **D-OPEN-004a** ostaje **OPEN/DEFERRED** i **produkcijski**: KMS provider, produkcijski model
  pristupa ključu, rotation cadence, recovery/backup procedura i uslovni per-row DEK/crypto-
  shredding. Ova odluka **ne kreira produkcijski KMS dizajn**;
- **`BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS`** (`13` §19) ostaje **otvoren** i vlasništvo je
  **narednog, zasebnog gatea `P5-G1`**. Ovaj gate ga **ne rješava**;
- **D-OPEN-009** (Axenita) ostaje otvoren; profil normalizacije `AXENITA` se **ne izmišlja**;
- **P5-D2** zadržava vlasništvo nad schemom, referencijalnim akcijama, migration paketom, state
  machineom i pitanjem DB-sprovedenih statusnih rječnika.

## Razlog

Sva četiri ugovora — HMAC, pseudonim, normalizacija/hash i redakcija — dijele jedno svojstvo:
**postaju immutable čim postoji prvi perzistirani red**. Deterministički token, hash normalizovanog
teksta i pseudonim nisu izvedene vrijednosti koje se mogu naknadno preračunati; oni **jesu
identitet** reda. Zato je jedini trenutak u kojem se smiju zamrznuti **prije** schema i business
implementacije.

Domenska separacija u HMAC poruci nije dekoracija: bez `practice_id`, `domain` i `source_system`
isti eksterni string bi u dvije ordinacije dao isti token, pa bi jednakost tokena postala
**cross-tenant orakl** — tačno klasa izloženosti koju `02` §2.5 i RLS uklanjaju.

Klauzula iskrenosti za `COMPLETED` postoji jer je najveći rizik ovog dijela sistema **pogrešno
povjerenje**: statusna riječ koja zvuči kao „očišćeno" navela bi buduće faze da redigovani tekst
tretiraju kao manje osjetljiv nego što jeste. Dokumentovan lažno negativan rezultat je siguran;
neopravdano povjerenje nije.

## Alternative — odbijene

- **Obični SHA-256 bez ključa za eksterni ID** — odbijeno: eksterni ID-evi su low-entropy i
  podložni dictionary napadu (`09` §8).
- **Ponovna upotreba `K_enc` kao HMAC ključa** — odbijeno: sudara se sa D-025, klauzulom 7
  (rotacija ne dira `*_hash`) i razbija lookup identitet.
- **Zasebna kolona za verziju HMAC ključa** — odbijeno: marker unutar `varchar(128)` tokena nosi
  istu informaciju bez schema promjene i bez migracije nad popunjenom tabelom.
- **Pseudonim izveden iz eksternog ID-a (hash/skraćivanje)** — odbijeno: rekonstruktivan i vezan za
  eksterni identitet; direktno protivno `02` §7.1.
- **Case-insensitive kolacija / `citext` / `LOWER(kolona)` indeks za pseudonim** — odbijeno:
  kanonizacija ulaza u velika slova daje isti rezultat bez schema promjene, novog tipa i posebnog
  ponašanja indeksa.
- **`NFKC` za tekst i za identifikatore** — odbijeno: nije lossless nad kliničkim sadržajem i
  proizvodi tihe kolizije identiteta.
- **Hash sirovog ulaza kao druga hash kolona** — odbijeno: sirovi ulaz se ne perzistira, pa takav
  hash ne bi bio provjerljiv; udvostručio bi hash površinu bez ijednog čitaoca.
- **Širok generički telefonski regex** — odbijeno: rediguje doze, laboratorijske vrijednosti,
  tarifne i ICD kodove; klinička šteta lažno pozitivnog nadmašuje korist.
- **Zamjenski token sa hashom ili skraćenim originalom** — odbijeno: stabilan derivat vraća
  linkabilnost.
- **Prihvatiti `redactBeforeAiProcessing = false`** — odbijeno: nema kolone koja bi to trajno
  nosila, `view=redacted` bi ostao nedefinisan, a D-043 potkopan.
- **Uvesti `SKIPPED`, `PENDING`, `PROCESSING` ili `ARCHIVED`** — odbijeno: nijedan aktivni tok Faze
  5 ih ne proizvodi; arhiviranje već nosi `archived_at`.
- **`view=redacted` sa fallbackom na normalizovani tekst pri `FAILED`** — odbijeno: to je tiho
  zaobilaženje `encounter.document.read_original` i najozbiljniji mogući defekt ovog dizajna.
- **Preimenovati `view=original` u `view=normalized`** — odbijeno: mijenja javni API ugovor bez
  dobitka; definicija uklanja dvosmislenost jednako dobro.
- **DB `CHECK` constrainti za statusne rječnike već sada** — odbijeno: rječnici pripadaju domenskom
  sloju dok P5-D2 ne odluči o schemi; prerani constraint bi zaključao vokabular prije schema gatea.
- **Odgoditi ove odluke do implementacije Faze 5** — odbijeno: prvi napisani kod bi postao
  neformalna specifikacija immutable ugovora.

## Posljedice

- Faza 5 ulazi u implementaciju sa **zamrznutim** PHI ugovorima; P5-D2 nasljeđuje definisano, ne
  otvoreno stanje.
- `02` dobija kanonske sekcije za lookup token, pseudonim, normalizaciju/hash i statusne rječnike;
  `03` dobija nedvosmislenu semantiku za `view`, `redactBeforeAiProcessing` i maksimum teksta.
- `09` dobija eksplicitnu klasifikaciju HMAC tokena i pseudonima i eksplicitnu granicu redakcije.
- `08` dobija dokumentovane, **još neizvršene**, test obaveze.
- Nijedan artefakt implementacije ne nastaje.

## Schema uticaj

**Nijedan.** Sve odluke staju u postojeće kolone: `varchar(128)` za `external_*_ref_hash`,
`varchar(50)` za `pseudonym`, `varchar(64)` za oba hasha i `varchar(30)` za oba statusa. Postojeći
`unique (practice_id, source_system, external_patient_ref_hash)` i `unique (practice_id, pseudonym)`
su dovoljni i **ostaju nepromijenjeni**.

## Migration uticaj

**Nijedan.** Nijedna migracija se ne kreira, ne mijenja niti primjenjuje; nijedna baza se ne dira.

## Implementacijske zavisnosti

Prije implementacije ovih ugovora moraju postojati: encryption service interface i lokalna
implementacija po D-025; tenant granica zahtjeva sa `set_request_context` (D-047, D-054);
`patient_references`, `encounters` i `encounter_documents` sa RLS-om — a njihov schema/migration
dizajn **posjeduje P5-D2**, ne ovaj gate.

## Test obaveze

Testovi se **ne implementiraju i ne izvršavaju u ovom gateu**. Obaveze su dokumentovane u `08`
§12.1–§12.7 i obuhvataju: determinizam i domensku separaciju HMAC-a; zabranu `K_hmac == K_enc`;
sigurno odbijanje nepoznatog generacijskog prefiksa; profil normalizacije eksternog ID-a (NFC,
vanjski trim, očuvane vodeće nule i veličina slova, bez `NFKC`); format pseudonima, mockabilan
CSPRNG seam, retry pri koliziji i put `lowercase query -> uppercase -> jednakost`; normalizaciju
teksta (`CRLF`/`CR` -> `LF`, NFC, očuvani tabovi i klinički simboli, 256 KiB, bez skraćivanja);
redakciju po klasama, stroge negativne slučajeve za telefon, neredigovanje medicinskih brojeva,
semantiku `COMPLETED` i **odsustvo fallbacka `view=redacted` pri `FAILED`**; reproducibilnost oba
hasha iz dekriptovanog teksta; i odsustvo PHI u logovima i greškama.

## Granice prema budućim fazama

Naredni gate je **`P5-G1` — `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS`**, zatim **`P5-D2`** —
schema, referencijalne akcije, migration paket i state machine. **Tek nakon njih** smije biti
eksplicitno autorizovan implementacijski gate.

## Supersedes

**Ne supersedira nijednu odluku.** D-018, D-025 i D-043 ostaju **na snazi u cijelosti**; ova odluka
ih **dopunjuje** susjednim ugovorom i **ne prepisuje** nijedno njihovo tijelo.

## Zavisnosti

D-018, **D-025**, D-022, D-023, D-028, D-033, D-043, D-047, D-054; D-OPEN-004a, D-OPEN-007 i
D-OPEN-009 ostaju otvoreni.

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
- **Anotacija tekućeg statusa (D-060, 2026-08-22) — historijsko tijelo se ne mijenja.** Kanonska podjela je danas nedvosmislena. **Zatvoreno u D-025:** format AES-GCM ciphertexta; `iv`/`auth_tag`/AAD; granularnost DEK-a u v1 (verzionisani aplikacijski ključ, bez per-row DEK-a); ugovor local development adaptera; mehanika `encryption_version` po redu; mehanika rotacije. **Ostaje otvoreno i isključivo produkcijsko, u D-OPEN-004a:** izbor KMS/providera; produkcijski model pristupa ključu; rotation cadence; procedura recoveryja/backupa ključa; uslovni per-row DEK i crypto-shredding ako to retention (D-OPEN-007) kasnije zahtijeva. **D-060 ne zatvara nijednu od tih stavki** i **ne kreira produkcijski KMS dizajn**; on uvodi isključivo **odvojen HMAC ključ `K_hmac`** za deterministički lookup token, što je zaseban ključni materijal i **ne dira** hijerarhiju KEK/DEK. Vidi D-025, D-060.

## D-OPEN-004a — KMS provider i rotation cadence

- **Status:** DEFERRED
- **Izdvojen iz:** D-OPEN-004, 2026-08-02.
- **Potrebno odlučiti:** KMS provider, granularnost KEK-a, rotation cadence, recovery procedura, access audit.
- **Vezano za:** produkcijski hosting (D-OPEN-002, `13` §4) — provider se bira zajedno sa hosting odlukom.
- **MVP:** D-025 koristi verzionisani aplikacijski ključ iz secrets managera i local static key adapter za development. Local static key nikada nije produkcijski spreman.
- **Uslovna revizija:** Ako D-OPEN-007 zahtijeva crypto-shredding, prelazak na per-row DEK je obavezan prije pilota (D-025).
- **Anotacija tekućeg statusa (D-060, 2026-08-22):** ovo pitanje **ostaje OTVORENO** i **`DEFERRED`**, i **ostaje produkcijsko**. D-060 ga **ne zatvara, ne sužava i ne prejudicira**; nijedan produkcijski KMS dizajn, provider, cadence ni recovery procedura nisu ovim odabrani. Namjenski HMAC ključ `K_hmac` iz D-060 je **zaseban ključni materijal** za deterministički lookup token; njegov produkcijski životni ciklus (provisioning, čuvanje, rotacija, recovery) **pada pod isti otvoreni produkcijski gate** kao i `K_enc` i biće riješen zajedno sa ovim pitanjem. Local static key i dalje **nikada nije produkcijski spreman**.

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

- **Status:** SUPERSEDED BY D-047
- **Riješeno:** 2026-08-12 odlukom **D-047 — Runtime access model za `users` i `practices` (Bootstrap-Scoped RLS)**.
- **Napomena:** Izvorni problem, kontekst i ograničenja ispod se **zadržavaju nepromijenjeni** radi audita i historije. Ne opisuju više otvoreno pitanje. Svaki izlazni kriterij iz `13` §16.6 zatvoren je odgovarajućom klauzulom D-047; zabrane iz `13` §16.3 su ili sprovedene kao trajna pravila ili eksplicitno riješene:
  - tačan database put `auth_subject` → `users.id` — D-047 klauzule 1–4;
  - self-scoped pristup vlastitom `users` redu — D-047 klauzula 3;
  - pristup `practices` — D-047 klauzule 5–6;
  - grant naspram RLS politike naspram resolver funkcije — riješeno kao **grant + RLS**, bez resolver funkcije i bez `SECURITY DEFINER` (D-047 klauzula 2);
  - negativni testovi i ograničenja pri kompromitaciji credentiala — D-047 klauzule 20 i *Test dokaz*.
- **Ne bira se prećutno** (izvorna zabrana, i dalje na snazi kao trajno pravilo): `SECURITY DEFINER` nije uveden nijednom klauzulom D-047; neograničen `SELECT` nije dodijeljen; pristup bez RLS-a ne postoji — obje tabele nose `ENABLE` **i** `FORCE ROW LEVEL SECURITY`.

---

### Izvorni zapis (historijski, nepromijenjen)

- **Izvorni status:** MUST DECIDE BEFORE PHASE 3
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

*(Kraj historijskog zapisa. Sve gore navedeno opisuje stanje prije 2026-08-12 i zadržano je nepromijenjeno. Formulacije tipa "odluka ostaje eksplicitno otvorena" i "potrebno do: prije implementacije faze 3" odnose se na tada otvoreno pitanje i **više ne opisuju tekuće stanje** — D-047 je prihvaćen i mjerodavan.)*

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
