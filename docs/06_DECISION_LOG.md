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

**ANOTACIJA TEKUĆEG STATUSA (D-070, 2026-08-28) — tijelo klauzule 10 se ne prepisuje.** Stavka 8
iznad upućuje na „postojeća schema/API ograničenja" koja **ne postoje**: čisti eksterni
identifikator se **nikada ne perzistira** — perzistira se isključivo token `h1.<hex64>` u
`varchar(128)` (§A) — pa nijedna kolona i nijedno API polje ne nose taj maksimum. Referent je time
bio **prazan**. **D-070, `RULING 2` (`OD-P5-I3-2`) ga zamjenjuje eksplicitnom vrijednošću:**
maksimum profila `MANUAL` v1 je **`255` UTF-8 bajtova**, mjeren nad **finalnim normalizovanim**
oblikom — poslije koraka 1–7, a **neposredno prije** koraka 9 (UTF-8 HMAC granica). **Nije** 255
UTF-16 code unita, **nije** 255 code pointa, **nije** 255 grapheme clustera i **nije** pre-NFC
brojanje. Vrijednost je **dio immutable profila `MANUAL` v1** (klauzula 12); drugačiji maksimum
traži **novu, izričito upravljanu verziju profila**. **Redoslijed i sadržaj koraka 1–9 se ne
mijenjaju.** Vidi `02` §2.8.5, `03` §11, `08` §12.2.

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

**ANOTACIJA TEKUĆEG STATUSA (D-070, 2026-08-28) — tijela klauzula 24 i 25 se ne prepisuju.**
Obje klauzule ostaju na snazi; D-070 im **precizira obuhvat v1** i **ne proširuje** ga.

**Uz klauzulu 24 (D-070, `RULING 4` / `OD-P5-I3-4`).** Stavka „identifikatori osiguranja/kartice
**isključivo** tamo gdje je kanonski definisan visokopouzdan, validiran uzorak" je **uslovna**, i
taj uslov **u v1 nikada nije ispunjen**: nijedan kanonski uzorak za generički identifikator
osiguranja, identifikator kartice osiguranja, **VeKa** identifikator ni broj članstva/kartice
**nije definisan**. Zato `phase5-basic-v1` **zadržava validiran `AHV`/`AVS` kao svoju jedinu
identifikatorsku klasu te vrste** i **ne tvrdi** zasebnu podršku za osiguranje/karticu. **Obavezna
pozitivna test matrica ne smije tražiti zaseban pozitivan slučaj za osiguranje/karticu.** Buduće
dodavanje traži **novu verziju ruleseta** (npr. `phase5-basic-v2`) uz zaseban kanonski uzorak i
vlasničko odobrenje. **Zahtjev iskrenosti iz klauzule 26 važi i za ovu klasu.**

**Uz klauzulu 25 (D-070, `RULING 5` / `OD-P5-I3-5`).** „Dovoljno jak strukturni dokaz" dobija
**tačnu, potpuno nabrojanu v1 sintaksu**. Međunarodno: `+41` ili `0041` uz **tačno 9** decimalnih
cifara, kompaktno ili grupisano kao `XX XXX XX XX` odnosno `XX-XXX-XX-XX`, uz **jedan konzistentan
separator**. Nacionalno: **isključivo** uz neposrednu oznaku `Tel`, `Tel.`, `Telefon`, `Mobile`,
`Natel` ili `Fax` (case-insensitive, uz whitespace i opciono jednu `:`), pa `0` + **tačno 9** cifara
ili `0XX XXX XX XX` / `0XX-XXX-XX-XX`. Prva cifra područja je `1`–`9`; kandidat **ne smije** biti
podniz dužeg decimalnog niza. **Ne prepoznaju se:** goli nacionalni brojevi bez oznake, oblici sa
tačkama, `(0)` varijante, miješani separatori i svi oblici izvan te sintakse. **Kandidat koji ne
prođe prepoznavač ostaje nepromijenjen; fallback generički telefonski regex se ne primjenjuje** —
što je doslovna primjena posture „dvosmisleno → ne rediguj" iz ove klauzule.

**Obje precizacije su ulaz za budući `P5-I6`**, koji posjeduje implementaciju `phase5-basic-v1`
(D-070, `RULING 1`). **Nijedna od njih ne autorizuje implementaciju.** Vidi `03` §13.1, `08` §12.5,
`09` §8.3 i §10.

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

# D-061 — Co-member `displayName` u Fazi 5: izostavljanje umjesto proširenja pristupa, i repointiranje obaveznog gatea

- **Status:** ACCEPTED
- **Datum:** 2026-08-23
- **Tip:** dizajnerska odluka o pristupu identitetu i o ugovoru odgovora Faze 5. **Dokumentacija
  isključivo.**
- **Amandman na:** **nijednu odluku.** D-047, klauzula 12 se **ne opoziva, ne slabi i ne mijenja** —
  pristup redu **drugog** korisnika ostaje `DENY / NOT IMPLEMENTED` u v1. Ova odluka **ne otvara**
  taj pristup; ona uklanja njegovog jedinog konzumenta u Fazi 5 i **premješta trigger** imenovanog
  gatea. D-060 ostaje na snazi u cijelosti; D-OPEN-004a ostaje otvoren.
- **Vlasnička ratifikacija:** vlasnik je prihvatio nalaze read-only audita `P5-G1` i ratifikovao
  opciju **G1-A**. Ovaj zapis je **objava** te ratifikacije, ne njeno ponovno izvođenje.

## Kontekst/problem — trigger

`03` §12 (`GET /encounters`) je jedina površina **Faze 5** koja u zamrznutom v1 obliku vraća
`responsiblePhysician.displayName` — dakle **`display_name` drugog korisnika**. D-047, klauzula 12
je taj pristup ostavila kao `DENY / NOT IMPLEMENTED` i uvela imenovani obavezni gate
`BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (`13` §19). Faza 5 je time bila blokirana na tom
gateu prije nego što je uopšte počela.

Gate je otvoren da bi se odlučilo **kako** co-member ime postaje čitljivo. Audit `P5-G1` je pokazao
da svaki poznati mehanizam u tekućoj arhitekturi plaća cijenu koja je **veća** od koristi jednog
prikaznog polja u listi, i da Faza 5 tu korist uopšte ne mora kupiti sada.

## Odluka

# Dio A — dokazano stanje baze koje odluka mora nositi

### A.1 Klauzula 1 — tekući column grant nad `users`

`copilot_app` danas ima **column-level `SELECT`** nad `users` na tačno pet kolona
(`002_identity_and_practices`, `02` §20.2a):

```text
id, email, display_name, preferred_language, status
```

`auth_subject`, `last_login_at`, `created_at` i `updated_at` **nemaju grant**. Nijedan
`INSERT`/`UPDATE`/`DELETE` grant ne postoji. `users` nosi `ENABLE` **i** `FORCE ROW LEVEL SECURITY`.

### A.2 Klauzula 2 — RLS bira redove, ne kolone

PostgreSQL RLS je **row-level**. Politika određuje **koji redovi** su vidljivi; **koje kolone** su
čitljive određuje **column grant vezan za rolu**, ne politika. Te dvije ravni su nezavisne i
politika ne može suziti projekciju.

Posljedica je direktna i neizbježna: **svaka politika koja učini red drugog korisnika vidljivim
učini ga čitljivim u svih pet grantovanih kolona**, dakle uključujući **`email`**. Traženo je bilo
jedno polje — `display_name`; dobio bi se cijeli grantovani red.

### A.3 Klauzula 3 — aplikacijska disciplina nije least privilege

Tvrdnja „aplikacija ionako ne selektuje `email`" **nije** kontrola sprovedena u bazi. Ona je
konvencija koju obara svaki budući `SELECT`, svaki Prisma `include`, svaki debug upit i svaki
držalac `copilot_app` credentiala (`09` §4; D-047, klauzula 20). Sigurnosna granica koju ovaj
projekat brani je **ono što baza odbija**, ne ono što kod trenutno ne pita.

### A.4 Klauzula 4 — drugorazredni nalaz: co-member politika nema ni dokaz membershipa

Politika koja bi propustila **co-membera iste ordinacije** mora dokazati da ciljni korisnik jeste
član tekuće ordinacije. Jedini izvor tog dokaza je `practice_memberships`.

`practice_memberships` od paketa `013_rls_policies` nosi `ENABLE` + `FORCE ROW LEVEL SECURITY` i
**tačno jednu** politiku:

```text
practice_memberships_self_select  USING (user_id = app.user_id)
```

To je **caller-self** opseg. **RLS referencirane tabele primjenjuje se i unutar podupita politike**
— isto svojstvo koje paket `013` već dokumentuje za `practices_membership_select` i
`practice_membership_roles_self_select`. Naivna co-member politika nad `users` zato **ne bi ni
pronašla** red membershipa ciljnog korisnika: podupit bi vratio nula redova, pa bi politika
propustila nula redova.

### A.5 Klauzula 5 — cijena druge širine

Da bi takva politika uopšte radila, moralo bi se **dodatno proširiti i `practice_memberships` RLS**
na co-member vidljivost. `practice_memberships` ima **table-level `SELECT` grant** (sve kolone,
`02` §20.2), pa bi to proširenje izložilo i membership podatke, uključujući **`professional_gln`**.

Traženo je jedno prikazno polje. Cijena bi bila **dvije proširene sigurnosne granice** i **dva nova
skupa izloženih kolona**.

# Dio B — odluka: opcija G1-A, izostavljanje

### B.1 Klauzula 6 — Faza 5 ne konzumira co-member `display_name`

**Faza 5 ne implementira pristup co-member `display_name` polju ni u jednom obliku.** Nijedan
endpoint Faze 5 ne vraća ime, prezime ni bilo koji drugi identifikacioni atribut **drugog**
korisnika.

### B.2 Klauzula 7 — aktivni oblik `GET /encounters` u Fazi 5

Aktivna projekcija odgovornog ljekara u `GET /encounters` (`03` §12) je, kada je
`responsible_physician_id` **različit od `NULL`**:

```json
"responsiblePhysician": {
  "id": "uuid"
}
```

### B.3 Klauzula 8 — `displayName` je ODSUTAN, ne `null`

Ključ `displayName` se u Fazi 5 **ne emituje uopšte**. **Ne** emituje se kao `null`, **ne** kao
prazan string, **ne** kao placeholder. Prisutan ključ sa praznom vrijednošću bi tvrdio da polje
postoji i da je vrijednost nepoznata; odsutan ključ tačno kaže da **površina ne postoji**.

### B.4 Klauzula 9 — `NULL` odgovorni ljekar

Kada je `responsible_physician_id` `NULL`, cijeli objekat je `null`:

```json
"responsiblePhysician": null
```

Razlika je normativna: `null` objekat znači **nema odgovornog ljekara**; objekat sa samo `id`-em
znači **ima ga, ime nije dio ugovora Faze 5**.

### B.5 Klauzula 10 — šta ostaje nepromijenjeno

- `responsiblePhysician.id` **ostaje** u odgovoru;
- query filter **`responsiblePhysicianId` ostaje** funkcionalan i nepromijenjen;
- `GET /me` ostaje nepromijenjen — vlastiti `email` i `displayName` su **caller-self** pristup, već
  pokriven politikom `users_self_select`, i **nisu** predmet ovog gatea.

### B.6 Klauzula 11 — apsolutne zabrane koje ova odluka potvrđuje

Faza 5 **ne** smije uvesti nijedno od sljedećeg, ni kao „privremeno", ni kao „samo za listu":

- **nikakav zamjenski identifikator** umjesto imena (inicijali, skraćeno ime, hash imena, stabilan
  nadimak, „Dr. X" derivat);
- **nikakav novi user-directory ni user-lookup API**;
- **nijednu novu `users` politiku** — treća `users` politika se **ne kreira**;
- **nikakvo proširenje `users` column granta**;
- **nikakvo proširenje `practice_memberships` RLS-a** ni njegovog granta;
- **nikakvu denormalizaciju `display_name`** u tenant tabelu (`encounters` ili bilo koju drugu);
- **nikakvu `SECURITY DEFINER` funkciju** za identity lookup;
- **nikakvu četvrtu database rolu**;
- **nikakav drugi Prisma klijent ni privilegovanu database putanju** (D-054, klauzula 7).

### B.7 Klauzula 12 — ovo je sužavanje ugovora prije implementacije, ne pojašnjenje

Ovo je **namjerno sužavanje** zamrznutog v1 oblika odgovora za aktivni obuhvat Faze 5, a ne
pojašnjenje postojećeg teksta. Tekst se mijenja i to se ovdje **eksplicitno priznaje**.

Sužavanje je dozvoljeno bez kompatibilnog rollouta i **bez shima** po presedanu **D-038**, koji je
`GET /me` promijenio iz `memberships[].role: string` u `memberships[].roles[]` **prije** nego što je
ijedna implementacija ili ijedan klijent postojao. Isti uslovi vrijede i ovdje i moraju biti
istinita **sva tri**:

1. nijedan produkcijski kod ne implementira `GET /encounters` — Faza 5 je `NOT_STARTED`;
2. nijedan klijent ne konzumira taj odgovor;
3. nijedan perzistirani red ne zavisi od tog oblika.

Kada ti uslovi prestanu važiti, isto sužavanje bi bilo **breaking izmjena** i tražilo bi v2 ili
kompatibilan rollout (D-007).

# Dio C — repointiranje obaveznog gatea

### C.1 Klauzula 13 — historijska labela se zadržava

Naziv gatea ostaje **doslovno**:

```text
BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS
```

Labela se **ne preimenuje**. Ona je citirana u D-047, klauzuli 12, u `02` §17.5, `04`, `05`, `07`,
`08` §21.5.2, `09` §4, `13` §19, `14` §2 i `15` §8.1 — i u SQL komentaru migracije
`002_identity_and_practices` — pa bi preimenovanje pokidalo sve te unakrsne reference bez ijedne
sigurnosne koristi.

### C.2 Klauzula 14 — trigger se redefiniše

Trigger **više nije faza**. Gate se **mora ponovo otvoriti**:

> **prije implementacije prvog endpointa ili toka koji vraća `display_name` drugog korisnika.**

Ime gatea zadržava riječi „BEFORE PHASE 5" kao **historijsku oznaku porijekla**, ne kao opis tekućeg
trigera.

### C.3 Klauzula 15 — tekući prvi poznati kanonski konzument

Tekući prvi poznati konzument je:

```text
GET /analyses/{analysisId}/workspace
```

čiji zamrznuti kompletan v1 oblik (`03` §15) sadrži `encounter.responsiblePhysician.displayName`.

**Vlasnička faza tog endpointa je Faza 8 — Mock AI/Tariff** (`04` §10.3; `05` §9, red
„workspace endpoint"), a ne Faza 7. Vlasnička ratifikacija je taj konzument navela pod brojem faze
7; **broj faze nije normativni dio trigera** i ovdje se usklađuje sa kanonskim vlasništvom obuhvata
i checkliste, bez izmjene supstance ratifikovanog trigera.

### C.4 Klauzula 16 — „ili ranije, šta prije nastupi"

Ako **bilo koji raniji** konzument stekne prihvaćen zahtjev da vrati ime drugog korisnika, gate se
otvara **tada**, u toj fazi, a ne čeka Fazu 8. Vrijedi pravilo **šta prije nastupi**.

### C.5 Klauzula 17 — `approvedBy.displayName` nije co-member trigger

`approvedBy.displayName` u zamrznutom odgovoru kreiranja odobrenja (`03` §20, Faza 10) **sam po sebi
nije** co-member trigger: odobravatelj **jeste pozivalac**, a caller-self pristup vlastitom `users`
redu već postoji kroz `users_self_select`.

Ograničenje je uslovno i mora biti provjereno prije implementacije: čim bilo koja **read-back**
površina (lista odobrenja, detalj analize, audit paket, export) vrati `approvedBy.displayName` za
odobrenje koje **nije** napravio pozivalac, to je co-member pristup i **aktivira gate**.

### C.6 Klauzula 18 — trajno pravilo

**Svaka** buduća površina koja doda ime, prezime, email ili drugi identifikacioni atribut **drugog**
korisnika mora **prvo** otvoriti i zatvoriti ovaj gate prihvaćenom odlukom. Tiho dodavanje takvog
polja je **phase-gate defekt**, ne propust u dizajnu odgovora.

# Dio D — naslijeđena obaveza za `P5-D2`

### D.1 Klauzula 19 — otkriven, ovdje **neriješen** problem

Audit `P5-G1` je usput dokazao zaseban problem koji **ova odluka ne rješava**:

Validacija `responsiblePhysicianId` na `POST /encounters` — i na `PATCH /encounters/{encounterId}`
ako on to polje mijenja — vjerovatno mora provjeriti da referencirani korisnik **jeste odgovarajući
član tekuće ordinacije**. Prirodan upit za tu provjeru ide nad `practice_memberships`, čiji je RLS
**caller-self** (klauzula 4). Naivna cross-member provjera bi zato vratila **nula redova** i
validacija bi tiho pala — ili bi implementator posegnuo za proširenjem RLS-a, što je tačno ono što
klauzula 11 zabranjuje.

### D.2 Klauzula 20 — klasifikacija i vlasništvo

```text
P5-D2 BLOCKING DESIGN OBLIGATION
```

Obaveza je **blokirajuća prije implementacije encounter jezgra** i vlasništvo je gatea **`P5-D2`**.
`P5-D2` mora odrediti ispravan dizajn domenske validacije **bez slabljenja sigurnosnih invarijanti
Faze 4**. Ova odluka **ne bira** mehanizam i **ne prejudicira** ishod; ona ga samo **evidentira kao
naslijeđen ulaz**.

### D.3 Klauzula 21 — postojeći RLS ostaje netaknut

Nijedna politika, nijedan grant i nijedna migracija se ovom odlukom **ne mijenjaju**.
`practice_memberships_self_select` ostaje **nepromijenjen** i po imenu i po tijelu.

# Dio E — granice

### E.1 Klauzula 22 — ovo je objava autoriteta, ne autorizacija implementacije

Ova odluka **objavljuje** vlasnički ratifikovano pravilo. Ona **ne autorizuje** implementaciju:
nijedan servis, endpoint, tabela, migracija, politika, grant ni test se ovim gateom ne uvode.

### E.2 Klauzula 23 — Faza 5 ostaje `NOT_STARTED`

```text
PHASE_5_STATUS   NOT_STARTED
```

Nijedna kućica Faze 5 nije označena; broj redova i broj označenih ostaje **49 / 0**. Pokretanje Faze
5 ostaje **zaseban gate**.

### E.3 Klauzula 24 — baza se ne dira

**Nijedna kolona, politika, grant, rola ni migracija se ne dodaje, ne uklanja i ne mijenja.**
Konkretno se **ne uvode**: treća `users` politika; prošireni `users` grant; proširen
`practice_memberships` RLS ili grant; `display_name` kolona na `encounters`; `SECURITY DEFINER`
lookup; četvrta database rola.

### E.4 Klauzula 25 — šta ova odluka **ne** zatvara

- **temeljni problem pristupa co-member identitetu ostaje OTVOREN i NEIMPLEMENTIRAN.** Ova odluka ga
  **ne rješava** — ona uklanja njegovog konzumenta u Fazi 5 i pomjera trenutak u kojem mora biti
  riješen. Zahtjevi iz `13` §19.3 ostaju **na snazi u cijelosti** za tu buduću odluku;
- **D-OPEN-004a** ostaje `DEFERRED` i produkcijski; ova odluka ga ne dodiruje;
- **D-OPEN-007** i **D-OPEN-009** ostaju nepromijenjeni;
- **`P5-D2`** zadržava vlasništvo nad schemom, referencijalnim akcijama, migration paketom i state
  machineom — i **dodatno** nasljeđuje obavezu iz klauzule 19.

## Razlog

Odluka počiva na jednoj asimetriji: **korist je jedno prikazno polje u listi; cijena je trajno
proširenje sigurnosne granice na dvije tabele i na kolone koje niko nije tražio.**

`email` je Class B podatak (`09` §2) i njegova izloženost nije nusprodukt koji se prihvata usput.
`professional_gln` je profesionalni identifikator. Nijedno od to dvoje nije bilo predmet zahtjeva —
oba bi ušla kao **posljedica** mehanizma, ne kao odluka. Kada mehanizam donosi više nego što je
traženo, mehanizam je pogrešan.

Drugi razlog je vremenski. Gate je bio **fazni**, pa je Faza 5 nasljeđivala obavezu da riješi problem
identiteta prije nego što napiše ijedan encounter red — iako joj rješenje **nije potrebno**. Fazni
trigger je time proizvodio pritisak na sigurnosnu odluku bez ijednog stvarnog konzumenta. Trigger
vezan za **stvarnog konzumenta** uklanja taj pritisak, a **ne uklanja obavezu**: kada prvi endpoint
zaista zatraži tuđe ime, gate stoji tačno ispred njega.

Treći razlog je iskrenost ugovora. Odsutan ključ je jedina reprezentacija koja ne laže: `null` bi
tvrdio da ime postoji ali je nepoznato, a zamjenski identifikator bi tvrdio da je problem riješen.
Faza 5 nema ime i **ne pretvara se** da ga ima.

## Alternative — odbijene

- **Direktno proširenje `users` RLS-a trećom co-member politikom** — odbijeno: RLS je row-level, pa
  bi propušten red bio čitljiv u **svim** grantovanim kolonama, uključujući `email` (klauzula 2). Uz
  to politici treba membership dokaz koji caller-self `practice_memberships` RLS ne daje (klauzula
  4), pa bi tražila **i drugo** proširenje (klauzula 5).
- **Redizajn grantova — suziti `users` grant na `(id, display_name)` pa onda proširiti RLS** —
  odbijeno: `GET /me` legitimno vraća vlastiti `email` (`03` §10), pa bi suženi grant oborio
  postojeći zamrznuti ugovor. Grant je vezan za **rolu**, ne za upit, pa ista rola ne može biti uska
  za co-member čitanje i široka za self čitanje bez uvođenja **četvrte database role** — što je
  zasebno zabranjeno.
- **Projekcijski view nad `users` sa uskim skupom kolona** — odbijeno: view sa vlastitim grantom je
  **nova sigurnosna površina** izvan dokazanog dvopolitičkog modela `users`. Ili nasljeđuje RLS bazne
  tabele — pa ne rješava ništa; ili se piše bez `security_invoker` — što je `SECURITY DEFINER` u
  drugom obliku i podliježe istoj zabrani (D-047, klauzula 2; D-OPEN-011 „ne bira se prećutno").
- **`SECURITY DEFINER` funkcija za identity lookup** — odbijeno: `02` §17.5, D-047, klauzula 2 i
  D-OPEN-011 izričito drže da se `SECURITY DEFINER` **ne uvodi prećutno**. Funkcija bi zaobišla
  `FORCE RLS` i postala jedina putanja bez politike u sistemu koji je cijelu Fazu 4 potrošio na to
  da takva putanja ne postoji.
- **Denormalizacija `display_name` u `encounters`** — odbijeno: kopija identitetnog podatka u tenant
  tabelu je **tiho zaobilaženje** gatea (`13` §19.4), postaje **stale** čim se ime promijeni, i širi
  identitet na tabelu čiji retention i export put za njega nisu dizajnirani.
- **Privilegovan aplikacijski lookup / drugi Prisma klijent ili druga konekcija** — odbijeno:
  D-054, klauzula 7 dopušta **tačno jedan** `PrismaService` i **tačno jedan** `copilot_app` klijent.
  Drugi klijent bi bio paralelan database stack izvan pinovane tenant transakcije — tačno ono što
  D-054, dio C.2 zabranjuje.
- **Zamjenski identifikator (inicijali, skraćeno ime, hash imena)** — odbijeno: stabilan derivat
  imena je **linkabilan** i nosi dio iste informacije, uz privid da je problem riješen. Ista logika
  kojom je D-060 odbio „zamjenski token sa hashom ili skraćenim originalom".
- **Emitovati `displayName: null`** — odbijeno: tvrdi da polje postoji a vrijednost je nepoznata, i
  navodi klijenta da gradi UI za vrijednost koja nikad neće doći.
- **Zadržati zamrznuti oblik i riješiti pristup sada, prije Faze 5** — odbijeno: to bi značilo
  donijeti trajnu odluku o pristupu identitetu radi jednog polja u listi, bez ijednog stvarnog
  konzumenta i bez produktnog zahtjeva koji bi opravdao izloženost `email`-a.
- **Preimenovati gate da odrazi novi trigger** — odbijeno: labela je citirana u devet dokumenata i u
  SQL komentaru migracije `002`; preimenovanje bi pokidalo unakrsne reference bez sigurnosne koristi.
  Trigger se redefiniše, ime ostaje.
- **Riješiti i validaciju `responsiblePhysicianId` u ovom gateu** — odbijeno: to je schema i domenski
  problem i pripada `P5-D2`. Rješavanje ovdje bi tražilo upravo ono proširenje RLS-a koje ova odluka
  zabranjuje.

**Nijedna odbijena alternativa nije uslovno odobrena.** Odbijanje ovdje **ne** znači „kasnije bez
odluke" — svaka od njih i dalje zahtijeva prihvaćen ADR i prolazak imenovanog gatea.

## Posljedice

- Faza 5 **više nije blokirana** gateom co-member identiteta; ulazi u `P5-D2` bez te obaveze.
- `03` §12 dobija **uži** aktivni oblik odgovora; `03` §15 dobija eksplicitnu oznaku da njegov
  `displayName` **aktivira gate prije implementacije**.
- `13` §19 dobija dispoziciju koja razlikuje **konzumenta Faze 5** (riješen izostavljanjem) od
  **temeljnog problema pristupa** (i dalje otvoren).
- `08` dobija dokumentovane, **još neizvršene** test obaveze za oblik bez `displayName`.
- `P5-D2` nasljeđuje **novu blokirajuću obavezu** (klauzula 19).
- Klijent koji jednog dana zatreba ime odgovornog ljekara mora proći kroz prihvaćenu odluku — što je
  **namjeravana** posljedica, ne trošak.

## Schema uticaj

**Nijedan.** Nijedna kolona se ne dodaje, ne uklanja i ne mijenja.
`encounters.responsible_physician_id` ostaje onakav kakvim ga `P5-D2` bude definisao; ova odluka o
njemu ne odlučuje ništa osim da se njegova vrijednost **vraća kao `id`**.

## Migration uticaj

**Nijedan.** Nijedna migracija se ne kreira, ne mijenja niti primjenjuje. Nijedna politika, nijedan
grant, nijedna rola i nijedna baza se ne diraju.

## Test obaveze

Testovi se **ne implementiraju i ne izvršavaju u ovom gateu**. Obaveze su dokumentovane u `08` §12.8
i obuhvataju: odsustvo ključa `displayName` u `GET /encounters`; `responsiblePhysician: null` pri
`NULL` vrijednosti; očuvano filtriranje po `responsiblePhysicianId`; **odsustvo ijednog upita nad
`users`** pri serviranju te liste; te regresijske testove koji moraju ostati **nepromijenjeni i
zeleni** — cross-user čitanje `users` daje nula redova, `users` ima **tačno dvije** politike, `users`
grantovi su nepromijenjeni, `FORCE RLS` je `true`, i `GET /me` i dalje vraća vlastiti `email` i
`displayName`.

## Granice prema budućim fazama

Naredni gate je **`P5-D2`** — schema, referencijalne akcije, vlasništvo migration paketa i encounter
state machine, uz **naslijeđenu blokirajuću obavezu** iz klauzule 19. **Tek nakon njega** smije biti
eksplicitno autorizovan implementacijski gate Faze 5.

Gate `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` ostaje **otvoren** i ponovo se otvara prije prvog
stvarnog konzumenta tuđeg `display_name`-a — tekuće `GET /analyses/{analysisId}/workspace` (Faza 8),
ili raniji konzument, **šta prije nastupi**.

## Supersedes

**Ne supersedira nijednu odluku.** D-047 ostaje na snazi u cijelosti; njegova klauzula 12 se ovom
odlukom **potvrđuje**, a ne opoziva — pristup redu drugog korisnika i dalje je
`DENY / NOT IMPLEMENTED`. D-060 i D-038 ostaju nepromijenjeni.

## Zavisnosti

D-007, **D-038**, D-041, D-043, **D-047**, D-049, D-051, D-054, D-058, D-059, **D-060**;
D-OPEN-004a, D-OPEN-007 i D-OPEN-009 ostaju otvoreni. `13` §19 ostaje otvoren u dijelu temeljnog
pristupa identitetu.

---

# D-062 — Schema Faze 5, referencijalni integritet, vlasništvo migration paketa, encounter/document state i domenska validacija

- **Status:** ACCEPTED
- **Datum:** 2026-08-23
- **Tip:** dizajnerska odluka o schemi, referencijalnim akcijama, vlasništvu migration paketa,
  state semantici i domenskoj validaciji Faze 5. **Dokumentacija isključivo.**
- **Amandman na:** **nijednu odluku.** D-060 i D-061 ostaju na snazi **u cijelosti** i ova ih
  odluka **ne prepisuje, ne slabi i ne mijenja**. D-023, D-025, D-033, D-038, D-042, D-043, D-046,
  D-047, D-048, D-049, D-051, D-052, D-053, D-054 i D-056 ostaju nepromijenjeni. **Nijedna Faza-4
  RLS/grant invarijanta se ne slabi.**
- **Vlasnička ratifikacija:** vlasnik je prihvatio nalaze read-only audita `P5-D2` i **ratifikovao
  preporučeni skup odluka `OD-P5-D2-1` … `OD-P5-D2-14`**, uz eksplicitnu potvrdu **`A + A+`** za
  `OD-P5-D2-6`. Ovaj zapis je **objava** te ratifikacije, ne njeno ponovno izvođenje i ne novo
  biranje opcija.
- **Ovaj gate ne autorizuje implementaciju.** Faza 5 ostaje `NOT_STARTED`, implementacijski
  checklist Faze 5 ostaje **49 / 0**, i nijedan schema, migration, RLS, grant, trigger ni test
  artefakt se ovom odlukom ne kreira.

## Kontekst/problem — trigger

Nakon D-060 (PHI dizajn) i D-061 (co-member `displayName`) Faza 5 je ostala blokirana na četiri
klase neriješenih pitanja koja `02` §28.1, `02` §2.11.4 i D-061, klauzule 19–21, **eksplicitno
dodjeljuju gateu `P5-D2`**:

1. **referencijalne akcije** za četiri već deklarisana composite FK-a koje kreira paket
   `003_patient_encounter_documents`, uz rok "**prije paketa `003`**" (`02` §28.1);
2. **naslijeđena blokirajuća obaveza D-061, klauzula 19** — kako `POST`/`PATCH` encounter operacije
   validiraju `responsiblePhysicianId` kao člana **tekuće** ordinacije, dok `practice_memberships`
   RLS ostaje caller-self;
3. **statusni rječnici dokumenta** — da li `processing_status` i `redaction_status` dobijaju
   database `CHECK` (`02` §2.11.4, D-060, klauzula 33);
4. **encounter/document state semantika, vlasništvo migration paketa, RLS/grant površina Faze 5,
   indeksi i vrijednosni rječnici** — bez kojih implementacijski gate ne može biti autorizovan.

Audit `P5-D2` je zaključen sa `P5_D2_PASS_READY_FOR_OWNER_DECISIONS` i spakovao je četrnaest
stvarno otvorenih vlasničkih odluka. Ova odluka ih objavljuje kao kanonske.

# Dio A — ratifikovani skup odluka (normativna matrica)

Svih četrnaest odluka ratifikovano je u **preporučenoj** opciji. Matrica je normativna; dijelovi
B–M su njena razrada, ne njen izvor.

| OD | Pitanje | Ratifikovana opcija | Sažetak ratifikovanog sadržaja |
|---|---|---|---|
| `OD-P5-D2-1` | Vlasništvo migration paketa i redoslijed za Fazu 5 | **A** | Tri broja paketa / četiri fajla: `003` (schema, **bez granta i bez RLS-a**), Faza-5 slice paketa `011` (**samo** `idempotency_keys` i `audit_events`), Faza-5 slice paketa `013` (grant → `ENABLE`/`FORCE` → politike), Faza-5 slice paketa `014` (AAD funkcija + **tri** trigera) |
| `OD-P5-D2-2` | Referencijalne akcije za četiri kanonska composite FK-a Faze 5 | **A** | `ON DELETE NO ACTION ON UPDATE NO ACTION` na sva četiri |
| `OD-P5-D2-3` | Tri nedeklarisane relacije Faze 5 | **A** | Deklarisati **sve tri** odmah, `NO ACTION` / `NO ACTION` |
| `OD-P5-D2-4` | Invarijanta pri dodjeli odgovornog ljekara | **A** | Korisnik sa **bilo kojim** `practice_memberships` redom u **istoj** ordinaciji. Rola i `active` se **ne** traže |
| `OD-P5-D2-5` | Mehanizam validacije odgovornog ljekara *(naslijeđena obaveza D-061)* | **A** (`RP-B` + `RP-E`) | Composite FK `encounters (practice_id, responsible_physician_id)` → `practice_memberships (practice_id, user_id)`, `MATCH SIMPLE`, `NO ACTION`/`NO ACTION`, uz **eksplicitno odgađanje** validacije role i aktivnosti |
| `OD-P5-D2-6` | Database sprovođenje statusnih rječnika | **A + A+** *(eksplicitna vlasnička potvrda)* | Dva vokabularna `CHECK`-a nad postojećim `varchar(30)` kolonama **plus** artefakt-konzistencijski `CHECK`. **Bez** konverzije u PostgreSQL enum |
| `OD-P5-D2-7` | Dosežni podskup encounter stanja i `DRAFT → READY_FOR_ANALYSIS` trigger | **A** | Postavlja ga komanda unosa dokumenta, **isključivo iz `DRAFT`**, pri **svakom** uspješnom unosu, idempotentno, **bez** `version` inkrementa, uz zaseban audit događaj; unos dokumenta se **odbija** pri `CANCELLED` |
| `OD-P5-D2-8` | Skup polja koja `PATCH /encounters/{encounterId}` smije mijenjati | **A** | Tačno osam polja; `status`, `patientReferenceId`, `sourceSystem`, `version`, `diagnoses[]`, svaki `id`, svaki timestamp i svaka actor kolona **nisu** patchable |
| `OD-P5-D2-9` | Semantika greške i retry-a dokumenta | **A** | **Odgoditi retry.** `UPDATE (archived_at)` je jedini `UPDATE` grant nad `encounter_documents`. `processing_status = FAILED` je u Fazi 5 **nedosežan** |
| `OD-P5-D2-10` | Filtriranje arhiviranih dokumenata pri čitanju | **A** | Lista **isključuje** `archived_at IS NOT NULL`; detaljna ruta i dalje vraća arhivirani dokument; **nema** restore rute; ponovno arhiviranje je **idempotentan uspjeh** |
| `OD-P5-D2-11` | Nedefinisani vrijednosni rječnici i `NOT NULL` kolone bez API izvora | **A** | `review_state = 'UNREVIEWED'`, `source = 'MANUAL'` pri kreiranju; šest rječnika ostaju **free-form u v1** uz validaciju dužine/charseta na API sloju, **bez** DB `CHECK`-a i **bez** schema izmjene |
| `OD-P5-D2-12` | Površina odgovora i filtera za domene koje još ne postoje | **A** | Ključevi se **izostavljaju u cijelosti** (odsutni, ne `null`); `hasBlockingFindings` se **ne registruje**; `sort` vokabular Faze 5 je `treatmentDate desc, id desc`; cursor kodira `(treatment_date, id)` i **nikada** pseudonim |
| `OD-P5-D2-13` | Pomirenje indeksa između `02` §7.2 i `02` §21 | **A** | Kreiraju se **sva tri** encounter indeksa uz `id desc` tie-breaker, plus `documents_encounter_idx` |
| `OD-P5-D2-14` | Seed politika za PHI tabele Faze 5 i `FORCE RLS` allowlista | **A** | **Nijedna PHI tabela Faze 5 se ne seeda.** Allowlista iz `02` §23.4 ostaje na **šest** tabela; **nijedna `§23.4.4b` klauzula se ne uvodi** |

**Nijedna od četrnaest odluka nije zamijenjena drugom opcijom, prećutno pojednostavljena ni
djelimično objavljena.**

# Dio B — schema delta i vlasništvo migration paketa

## B.1 Delta (paket `003_patient_encounter_documents`)

Paket `003` je **prvi kreator** svih navedenih objekata:

| Klasa | Broj | Sadržaj |
|---|---:|---|
| Enumi | **5** | `integration_provider`, `encounter_status`, `review_state`, `document_type`, `document_source` |
| Tabele | **5** | `patient_references`, `encounters`, `encounter_diagnoses`, `storage_objects`, `encounter_documents` |
| Primarni ključevi | **5** | po jedan po tabeli |
| Unique constrainti/indeksi | **9** | `patient_references`: `(practice_id, source_system, external_patient_ref_hash)`, `(practice_id, pseudonym)`, `(practice_id, id)` · `encounters`: `(practice_id, id)` · `encounter_diagnoses`: `(practice_id, id)`, `(practice_id, encounter_id, coding_system, diagnosis_code)` · `storage_objects`: `(bucket_name, object_key)`, `(practice_id, id)` · `encounter_documents`: `(practice_id, id)` |
| Composite FK — kanonski deklarisani | **4** | Dio C, redovi 2, 6, 9, 10 |
| FK — novodeklarisani ovom odlukom | **4** | Dio C, redovi 1, 4, 7, 11 |
| Ne-unique indeksi | **4** | Dio J |
| `CHECK` constrainti iz zamrznute scheme | **18** | `patient_references` 5, `encounters` 6, `storage_objects` 1, `encounter_documents` 10 |
| `CHECK` constrainti uvedeni ovom odlukom | **3** | Dio E |
| Defaults | 2 klase | `created_at default current_timestamp`; `version default 1` na `encounters`. **Nigdje `gen_random_uuid()`** (`02` §2.2, §26.1) |

> **KOREKCIJA — D-063, klauzula 6 (kasniji autoritet).** Red „`CHECK` constrainti iz zamrznute
> scheme" iznad je **aritmetički pogrešan** i **superseded**. Zadržan je nepromijenjen kao
> historijski dokaz nalaza gatea `P5-I0`. Mehaničko prebrojavanje eksplicitno nabrojanih tijela
> constrainata u `02` §7.1, §7.2, §7.3, §8.1 i §8.2 daje **20**, a ne 18: `patient_references` 5,
> `encounters` 6, `encounter_diagnoses` **0**, `storage_objects` 1, `encounter_documents` **8**
> (ne 10). Uz **tri** `CHECK`-a iz Dijela E, mjerodavan ukupan broj paketa `003` je **23**.
> Kanonska imena svih 23 nabrojana su u D-063, klauzuli 7. **Nijedno tijelo constrainta se ne
> mijenja — mijenja se isključivo sažeti broj.**

**Enumi se dodaju u `02` §22.3.** Njihov izostanak iz §22.3 bio je dokumentaciona nepotpunost, ne
otvoreno dizajnersko pitanje: sve vrijednosti su zamrznute u `02` §4.3–§4.8. Fizička imena prate
precedent §2.1 + §22.2 (`entity_status`, `membership_role`, `platform_role`): snake_case jednina,
`@@map`-irano.

**Nijedno schema polje se ovom odlukom ne dodaje** izvan gore navedenog — vidi Dio B.2.

## B.2 D-060 ne traži nijednu novu kolonu

Provjereno stavku po stavku prema D-060, klauzula 44. **Ne uvode se:**

- kolona za verziju HMAC ključa — generacijski marker `h1` živi **unutar** tokena, a `h1.<64 hex>`
  = 67 znakova ≤ `varchar(128)`;
- kolona za sirovi tekst prije normalizacije — `02` §2.10.1;
- druga hash kolona za sirovi ulaz;
- kolona za verziju redakcionog ruleseta — `phase5-basic-v1` je identifikator koda/konfiguracije
  (`02` §2.11.3);
- denormalizovani co-member `display_name` — D-061, klauzule B.6 i E.3;
- `citext`, funkcionalni indeks ni collation za pseudonim — `02` §2.9.4;
- **enum tipovi za dva statusna rječnika dokumenta** — Dio E.

## B.3 Vlasništvo paketa, redoslijed i atomičnost (`OD-P5-D2-1`)

Faza 5 izvršava **četiri migracijska fajla nad tri postojeća broja paketa**. **Nijedan novi broj
paketa se ne uvodi i nijedan se ne renumeriše.**

| # | Paket | Faza-5 sadržaj | Grant? | RLS? |
|---|---|---|---|---|
| 1 | `003_patient_encounter_documents` | 5 enuma, 5 tabela, svi constrainti, svi FK-ovi sa **eksplicitnim** akcijama, svi `CHECK`-ovi, 4 indeksa | **nijedan** | **nijedan** |
| 2 | `011_jobs_idempotency_outbox_audit` — Faza-5 slice | **isključivo** `idempotency_keys` i `audit_events` | prema `011` | prema `011` |
| 3 | `013_rls_policies` — Faza-5 slice | grantovi → `ENABLE`/`FORCE` → politike, **tim redoslijedom** | da | da |
| 4 | `014_immutability_triggers` — Faza-5 slice | dijeljena `app_security.reject_aad_bound_column_change()` + **tri** trigera: `patient_references`, `encounters`, `encounter_documents` | — | — |

**`outbox_events` i `async_jobs` se u Fazi 5 ne kreiraju** — nemaju konzumenta Faze 5.
**Preostala dva AAD trigera iz `02` §19.3 slijede u vlastitim fazama**, primjenom precedenta D-052
u **ranijem** smjeru: paket zadržava vlasništvo, a izvršava se nad tabelom koja u datoj fazi
postoji.

**Redoslijed izvršenja:** `003` → `011`-slice → `013`-slice → `014`-slice.

**Atomičnost.** Svaki fajl se primjenjuje u **jednoj transakciji**. `CREATE INDEX CONCURRENTLY` i
svaki drugi iskaz koji lomi transakciju je **zabranjen** — i nepotreban, jer su tabele prazne.

**Očuvana invarijanta — nova PHI tabela ne dobija runtime sposobnost prije nego što RLS/grant paket
atomično uvede grant i ograničavajuću politiku.** Ta invarijanta ovdje **nije** obezbijeđena
spajanjem fajlova nego **grant disciplinom**: paket `003` ne izdaje **nijedan** `GRANT`, migracija
`001` već tvrdi da nad schemom `public` ne postoje `DEFAULT PRIVILEGES`, a `copilot_app` nema
`CREATE` nad schemom. Tabela koju kreira `003` dosežna je time **nijednoj** runtime roli sve dok je
`013` ne dodijeli — a `013` je dodjeljuje u **istoj transakciji** koja RLS uključuje i forsira.
Prozor između migracija time **ne sadrži nikakvu sposobnost**, što je jače od tvrdnje da je prozor
kratak. Ovo doslovno ispunjava D-049, klauzulu 5.

**Rollback/reverzija — konvencija repozitorija se ne mijenja.** Down-migration fajl **ne postoji**.
Skripta pune reverzije dokumentuje se kao komentar **unutar** forward migracije (precedent `013`
§7), nikada se ne izvršava, nije zamjena za maintenance prozor iz `02` §23.4, i **ne smije**
ostaviti tabelu sa `ENABLE`, a bez `FORCE` RLS-a. Rollback opoziva isključivo ono što je **taj**
paket dodao.

**Dokumentacija u SQL-u** ostaje `--` komentar kolociran u fajlu, kao u sva tri postojeća fajla.
**Nijedan `COMMENT ON` objekat se ne uvodi.**

## B.4 Obavezne post-migracijske katalog tvrdnje

- `relrowsecurity = true` **i** `relforcerowsecurity = true` za svih pet novih tabela — **trajna
  regresija**;
- tačan skup i broj imena politika nad tih pet tabela;
- tačan skup grantova po roli iz `information_schema.role_table_grants` i `column_privileges`:
  `copilot_system` = **nula** grantova nad svih pet (D-023), `PUBLIC` = nula;
- FK inventar iz `pg_constraint` sa `confdeltype = 'a'` **i** `confupdtype = 'a'` za **svaki** FK
  Faze 5;
- `unique (practice_id, id)` na svih pet (`02` §2.5) — ukupno nakon Faze 5 = **8 od 30** tenant
  tabela;
- svih 18 zamrznutih `CHECK`-ova **plus** tri `CHECK`-a iz Dijela E; *(**superseded — D-063, klauzula 6**: zamrznutih je **20**, ukupno **23**. Tvrdnja je uz to **pooštrena** D-063, klauzulom 8: katalog se provjerava **strogom jednakošću punog skupa** nad `conname` + tabelom + `pg_get_constraintdef()`, a ne brojanjem.)*
- **negativne tvrdnje:** nema nove role, nema `BYPASSRLS`, nema `SECURITY DEFINER` funkcije, nema
  četvrte database role, nema drugog Prisma klijenta, nema treće `users` politike, i **nema
  nijedne izmjene politike ni granta nad `practice_memberships`** (D-061, klauzula 11 i E.3 —
  mehanički provjerljivo).

# Dio C — referencijalne akcije (`OD-P5-D2-2`, `OD-P5-D2-3`, `OD-P5-D2-5`)

## C.1 Potpuna FK matrica Faze 5

**Svaki** FK Faze 5 nosi **eksplicitno** `ON DELETE NO ACTION ON UPDATE NO ACTION`. Prisma defaulti
se **ne koriste ni u jednoj poziciji**.

| # | Child | Parent | Oblik FK-a | Nullability | ON DELETE | ON UPDATE | Status prije ove odluke |
|---|---|---|---|---|---|---|---|
| 1 | `patient_references (practice_id)` | `practices (id)` | jednokolonski | `NOT NULL` | `NO ACTION` | `NO ACTION` | **nedeklarisan** → deklariše se (`OD-3`) |
| 2 | `encounters (practice_id, patient_reference_id)` | `patient_references (practice_id, id)` | **composite** | `NOT NULL` | `NO ACTION` | `NO ACTION` | deklarisan, akcije otvorene (`OD-2`) |
| 4 | `encounters (practice_id, responsible_physician_id)` | `practice_memberships (practice_id, user_id)` | **composite, `MATCH SIMPLE`** | **`NULL` dozvoljen** | `NO ACTION` | `NO ACTION` | **nedeklarisan** → deklariše se (`OD-5`) |
| 6 | `encounter_diagnoses (practice_id, encounter_id)` | `encounters (practice_id, id)` | **composite** | `NOT NULL` | `NO ACTION` | `NO ACTION` | deklarisan, akcije otvorene (`OD-2`) |
| 7 | `storage_objects (practice_id)` | `practices (id)` | jednokolonski | `NOT NULL` | `NO ACTION` | `NO ACTION` | **nedeklarisan** → deklariše se (`OD-3`) |
| 9 | `encounter_documents (practice_id, encounter_id)` | `encounters (practice_id, id)` | **composite** | `NOT NULL` | `NO ACTION` | `NO ACTION` | deklarisan, akcije otvorene (`OD-2`) |
| 10 | `encounter_documents (practice_id, storage_object_id)` | `storage_objects (practice_id, id)` | **composite, `MATCH SIMPLE`** | **`NULL` dozvoljen** | `NO ACTION` | `NO ACTION` | deklarisan, akcije otvorene (`OD-2`) |
| 11 | `encounter_documents (practice_id, source_storage_object_id)` | `storage_objects (practice_id, id)` | **composite, `MATCH SIMPLE`** | **`NULL` dozvoljen** | `NO ACTION` | `NO ACTION` | **nedeklarisan** → deklariše se (`OD-3`) |

**Relacije koje se namjerno NE deklarišu:**

| Relacija | Razlog |
|---|---|
| `encounters (practice_id)` → `practices (id)` | Tenant ključ se nosi **tranzitivno** kroz FK #2 → #1; direktan FK bi duplirao istu garanciju (precedent `02` §6.3a) |
| `encounters.created_by` / `updated_by` → `users` | **Aplikacijska invarijanta**, ne FK. Precedent `02` §6.5 (`granted_by`, `revoked_by`): globalni identifikator aktora, ne tenant referenca. Prihvaćeni constraint skup se ne širi |
| `storage_objects.created_by` → `users` | isto |
| `encounter_documents.created_by` → `users` | isto |
| `encounters.responsible_physician_id` → `users (id)` | **Nepotreban.** Postojanje membershipa tranzitivno garantuje postojanje korisnika kroz već postojeći `practice_memberships_user_fk`. Drugi direktan FK dodao bi globalno spregnuće i **nula** dodatne garancije |

## C.2 `MATCH SIMPLE` je obavezan za #4, #10 i #11

Sva tri para imaju `NOT NULL` `practice_id` uz **nullable** drugu kolonu. Pod defaultnim
`MATCH SIMPLE` constraint je zadovoljen kad je **bilo koja** referencirajuća kolona `NULL` — pa
"nema odgovornog ljekara" i "nema storage objekta" prolaze bez FK provjere. **`MATCH FULL` bi ih
odbio i ovdje se ne smije koristiti nikada.**

## C.3 Zašto `NO ACTION`, a ne `RESTRICT` ni `CASCADE`

- **`CASCADE` se odbija u svakoj poziciji.** `02` §28.1 to navodi direktno ("`CASCADE` nikada nije
  default"). U Fazi 5 **ne postoji nijedna delete sposobnost** — `02` §18.1 ne dodjeljuje `DELETE`
  nijednoj tabeli Faze 5, a `09` §20 zabranjuje ad-hoc `DELETE` API. `CASCADE` time nema
  **nijedan legitiman okidač**, a ima jedan destruktivan: jedan zalutali iskaz nad roditeljem
  obrisao bi encountere, dijagnoze i dokumente cijelog tenanta. To je najveći pojedinačni vektor
  gubitka PHI u schemi.
- **`SET NULL` je nemoguć** nad `NOT NULL` tenant/parent ključevima, a nad nullable pozicijama bi
  tiho odvojio dokument od njegovog bloba.
- **`RESTRICT` i `NO ACTION` su ekvivalentna odbijanja.** `NO ACTION` je provjerljiv na kraju
  iskaza i po potrebi deferrable; `RESTRICT` to nikada nije. Migracija `002` koristi `NO ACTION`
  za svih pet postojećih FK-ova — druga konvencija se ne uvodi.
- **`ON UPDATE` je nedosežan.** Svaki parent ključ je `(practice_id, id)` ili
  `(practice_id, user_id)`; `id` i `practice_id` su AAD-vezani i immutable nakon `INSERT`-a
  (`02` §2.7.8, §19.3), a `user_id` je globalno immutable. Nijedna vrijednost parent ključa ne može
  se promijeniti — `NO ACTION` je time i tačan i nedosežan, što je željeno stanje.

**Historijski medicinski integritet je očuvan:** historijski encounteri, dijagnoze i dokumenti
preživljavaju svako brisanje roditelja, jer se brisanje roditelja **odbija**, a ne kaskadira.

## C.4 Obaveza prema Prisma sloju — normativno

**Prisma default se ne smije osloniti ni u jednoj relaciji.** Prisma za obaveznu relaciju
podrazumijeva `onDelete: Restrict, onUpdate: Cascade` — izmišljeno pravilo koje je migracija `002`
eksplicitno odbila. **Svaka** Prisma relacija Faze 5 mora nositi doslovno:

```prisma
onDelete: NoAction, onUpdate: NoAction
```

Bez toga `prisma migrate diff` pri regeneraciji **tiho vraća** Prisma akcije. Ovo je normativni
zahtjev prema budućem slice-u `P5-I1`, ne opis postojećeg stanja.

# Dio D — odgovorni ljekar (`OD-P5-D2-4`, `OD-P5-D2-5`)

Ovaj dio **razrješava naslijeđenu blokirajuću obavezu D-061, klauzule 19–21**.

## D.1 Dvije invarijante se moraju razlikovati

### D.1.1 Invarijanta u trenutku dodjele (procjenjuje se pri `INSERT`-u i pri svakom `PATCH`-u koji postavlja polje)

| Pitanje | Ratifikovani odgovor | Sloj sprovođenja |
|---|---|---|
| Nullable? | **Da.** `02` §7.2 kolonu deklariše nullable, a D-061, klauzula 9, `null` vrijednosti daje zasebno normativno značenje ("nema odgovornog ljekara"). **Nullable semantika se očuvava** | schema |
| Referencira `users.id` ili membership identitet? | **Pohranjena vrijednost ostaje `users.id`** — `03` §12 vraća `responsiblePhysician.id` i filtrira po njemu. **Cilj FK-a je membership red**, ključen `(practice_id, user_id)` | schema |
| Mora li imati membership? | **Da, u istoj ordinaciji** — sprovedeno bazom | composite FK, D.2 |
| Ista ordinacija? | **Da** — strukturno, ne validacijom | composite FK |
| Mora li rola biti `PHYSICIAN`? | **Ne.** Nijedan kanonski izvor to ne traži, i **nije sprovodivo u Fazi 5** bez proširenja `practice_memberships` RLS-a koje D-061, klauzula 11, zabranjuje | — |
| Smije li MPA biti odgovorni ljekar? | **Da, u Fazi 5** — ratifikovana i eksplicitno zapisana posljedica, ne neotkrivena rupa | — |
| Mora li membership biti `active`? | **Nije sprovodivo u Fazi 5.** `active` je kolona `practice_memberships`, čitljiva isključivo pod caller-self politikom | — |

### D.1.2 Invarijanta historijske perzistencije (vrijedi zauvijek nakon dodjele)

| Pitanje | Ratifikovani odgovor |
|---|---|
| Zadržava li historijski encounter `user_id`? | **Da, bezuslovno.** Ništa ne prepisuje `responsible_physician_id`: nema trigera, nema kaskade, nema `ON UPDATE` puta |
| Šta ako membership kasnije postane neaktivan? | **Ništa.** `active = false` je `UPDATE`, ne `DELETE`; parent red preživljava; encounter je netaknut. Tvrdnja "Dr X je bio odgovoran 2026-07-17" ostaje tačna i čitljiva |
| Šta ako se membership u cijelosti ukloni? | **Blokirano `ON DELETE NO ACTION`-om.** Dodjela ne može ostati siroče |
| Smije li se odgovorni ljekar promijeniti nakon kreiranja? | **Da**, kroz `PATCH /encounters/{encounterId}` uz obavezan `If-Match`, dok je status u nefinalnom stanju dosežnom u Fazi 5 (`DRAFT`, `READY_FOR_ANALYSIS`). Isti FK revalidira novu vrijednost. **Zabranjeno iz `CANCELLED`** (terminalno) |

**Zapisana posljedica `ON DELETE NO ACTION`-a.** Membership red koji ijedan encounter imenuje
**ne može se obrisati**. To danas ne košta ništa — `practice_memberships` nema `DELETE` grant
nijednoj runtime roli, a administracija membershipa je izvan aktivnog v1 permission kataloga
(`02` §20.2, D-038, klauzula 24) — i **poželjno je**, jer čuva historijsku dodjelu. Buduća
funkcija uklanjanja člana mora koristiti `active = false` ili **eksplicitno odlučiti** kako
tretira historijske reference. Ova posljedica je ovdje zapisana, a ne ostavljena da bude otkrivena.

## D.2 Ratifikovani mehanizam — `RP-B` + `RP-E`

```sql
alter table encounters
  add constraint encounters_responsible_physician_membership_fk
  foreign key (practice_id, responsible_physician_id)
  references practice_memberships (practice_id, user_id)
  match simple
  on delete no action on update no action;
```

**Parent ključ već postoji.** `practice_memberships_practice_user_key` — `unique (practice_id,
user_id)` — kreiran je migracijom `002`. **Nijedan novi indeks i nijedan novi constraint nad
`practice_memberships` se ne uvodi.**

**Baza čini cross-practice dodjelu odgovornog ljekara nemogućom**, a ne samo odbijenom: red koji bi
imenovao člana druge ordinacije **nema parent red** i ne može postojati.

Uz FK se **eksplicitno odgađa** validacija role i aktivnosti (`RP-E`): oba atributa su u Fazi 5
nedosežna svakim dozvoljenim mehanizmom, a nijedan kanonski izvor ih ne traži. Odgađanje **ne
stvara sposobnost** — ono odbija da je stvori.

## D.3 Sigurnosni ishod koji se mora očuvati

Ratifikovani mehanizam uvodi **nula** nove sposobnosti čitanja:

| | |
|---|---|
| Nova RLS politika | **nijedna** |
| Izmjena `practice_memberships_self_select` | **nijedna** — ime i tijelo identični (D-061, klauzula 21) |
| Proširenje `practice_memberships` RLS-a | **nijedno** |
| Proširenje `users` RLS-a | **nijedno** |
| Dodatni identitetski `SELECT` grant | **nijedan** |
| `SECURITY DEFINER` membership lookup | **nijedan** |
| Treća `users` politika | **nijedna** |
| Četvrta database rola | **nijedna** |
| Drugi Prisma klijent / privilegovani put | **nijedan** |
| Denormalizovani `display_name` | **nijedan** |
| Zamjenski identifikator | **nijedan** |
| Nova kolona | **nijedna** |
| Izmjena API oblika | **nijedna** |
| Novi indeks | **nijedan** |

**Nema co-member directory sposobnosti.** FK evaluira database mašinerija referencijalnog
integriteta: **nijedan red ne ulazi u aplikaciju, nijedna kolona se ne projektuje, nijedan upit ne
imenuje ciljnog korisnika**. To je materijalno jače od aplikacijske provjere koja pročita pa
odbaci — discipline koju D-061, klauzula 3, izričito odbija prihvatiti kao kontrolu.

Rezidualna površina je **boolean orakl dodjeljivosti** nad UUID-om koji pozivalac već posjeduje,
ograničen na **vlastiti tenant**. To je kategorijski različito od čitanja identiteta: ne vraća se
ni ime, ni email, ni GLN, ni rola, ni status.

**Temeljni problem co-member identiteta ostaje `OPEN / NOT IMPLEMENTED`** (`13` §19). Ova odluka ga
**ne rješava, ne rješava ga djelimično, i ne smije se opisivati kao da ga rješava.** Imenovani gate
`BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` zadržava repointirani trigger iz D-061, klauzule
13–16, i svi zahtjevi `13` §19.3 ostaju na snazi.

## D.4 Autorizacija naspram domenske validacije

| | **Autorizacija** | **Domenska validacija** |
|---|---|---|
| Pitanje | Smije li **ovaj pozivalac** kreirati/mijenjati encounter u **ovoj** ordinaciji? | Je li `responsiblePhysicianId` validna dodjeljiva vrijednost za **ovu** ordinaciju? |
| Subjekt | pozivalac | treća osoba imenovana u tijelu zahtjeva |
| Mehanizam | `TenantRequestPipeline.admit` — nepromijenjen | composite FK iz D.2 |
| Greška | `403 ACCESS_DENIED` | `422 VALIDATION_ERROR` |
| Daje sposobnost čitanja? | već uspostavljena za pozivaoca | **ne** |

**Postojeći permission model rute ostaje mjerodavan i ne dira se.** `encounter.create` i
`encounter.update` drže isključivo `PHYSICIAN` i `MPA`; `encounter.cancel` isključivo `PHYSICIAN`
(`15`). **Nijedna permisija se ne dodaje, ne uklanja ni ne uslovljava.**

## D.5 Mapiranje greške — usko, normativno

Povreda podiže `SQLSTATE 23503` sa imenom constrainta
`encounters_responsible_physician_membership_fk`. Mora se hvatati **tačno onako kako se danas hvata
`TenantContextRejectedError`**: jedan `catch`, oko jednog iskaza, ključen na **to jedno** ime
constrainta, preveden u `422 VALIDATION_ERROR` sa generičkom porukom koja **ne citira nijednu
vrijednost** (D-060, klauzule 39–40).

**Globalno mapiranje `23503 → 422` je zabranjeno.** Povreda bilo kojeg drugog constrainta ostaje
interna greška, po istoj logici koju migracija `013` zapisuje za `42501`.

## D.6 Obavezni implementacijski gate — RI naspram RLS-a

**Ponašanje RI-a pod `FORCE RLS` modelom NIJE dokazano samim tim što ga D-062 dokumentuje.**

Mehanizam počiva na jednoj nosećoj pretpostavci: **PostgreSQL provjere referencijalnog integriteta
zaobilaze row-level security**. To je dokumentovano ponašanje i već je u ovom repozitoriju
izvršeno kroz `practice_membership_roles_membership_fk`, ali **nije izvršeno ni u jednom gateu do
sada**, jer su svi bili read-only ili dokumentacijski.

**Normativni gate:**

> Prije nego što se implementacija encounter jezgra smije osloniti na ovaj FK mehanizam, slice
> **`P5-I2` MORA empirijski dokazati** — nad **stvarnim PostgreSQL-om** i pod **stvarnim runtime
> rolama** — da se composite FK ponaša ispravno pod postojećim `FORCE RLS` modelom.

**Oblik dokaza (`★`).** U **istoj transakciji**, pod `copilot_app` i uspostavljenim tenant
kontekstom:

1. `INSERT` u `encounters` koji imenuje `user_id` **co-membera** (ne pozivaoca) **uspijeva**;
2. direktan `SELECT` **tog istog** membership reda vraća **nula redova**.

Oba iskaza moraju vrijediti istovremeno. Prvi dokazuje da RI radi; drugi dokazuje da se RLS **nije**
oslabio.

**Neuspjeh tog dokaza je HARD HOLD.** Vraća se u dizajn i ponovo otvara `OD-P5-D2-5`.
**Ne autorizuje slabljenje RLS-a**, proširenje `practice_memberships` politike, uvođenje
`SECURITY DEFINER` primitiva ni bilo koje drugo proširenje Faza-4 sigurnosne granice.

Pretpostavka je **fail-loud**, ne fail-silent: da je netačna, **svaka** dodjela co-membera podigla
bi `23503` i prvi test slice-a `P5-I2` bi to odmah uhvatio. Vodi se kao `RISK-07`.

**`P5-I5` (encounter jezgro) ne smije početi prije nego što `★` prođe.**

# Dio E — statusni rječnici dokumenta (`OD-P5-D2-6`, ratifikovano `A + A+`)

**Fizički tip obje kolone ostaje `varchar(30)`** (`02` §8.2). **Konverzija u PostgreSQL enum nije
autorizovana** — `02` §8.2 fiksira fizički tip, a D-060, klauzula 44, zabranjuje izmjenu kolone.

Vokabular ostaje doslovno onaj iz D-060 i `02` §2.11:

```text
processing_status ∈ { READY, FAILED }
redaction_status  ∈ { COMPLETED, FAILED }
```

**Ne uvode se** `PENDING`, `PROCESSING`, `ARCHIVED` ni `SKIPPED` — ni u jednoj poziciji.
Arhiviranje i dalje nosi `archived_at`, nikada statusnu vrijednost.

## E.1 Ratifikovani `CHECK` constrainti (paket `003`)

**Opcija A — vokabularni `CHECK`-ovi:**

```sql
check (processing_status in ('READY','FAILED'))
check (redaction_status in ('COMPLETED','FAILED'))
```

**Opcija A+ — artefakt-konzistencijski `CHECK`** (izveden iz D-060, klauzule 30 i 32):

```sql
check (
  (redaction_status = 'COMPLETED'
   and redacted_text_ciphertext is not null
   and redacted_text_hash is not null)
  or
  (redaction_status = 'FAILED'
   and redacted_text_ciphertext is null
   and redacted_text_hash is null)
)
```

Ukupno **tri** nova `CHECK` constrainta nad praznom tabelom.

## E.2 Nemoguća kombinacija statusa — očuvana odluka P5-D2

Kombinacija `processing_status = 'FAILED'` uz `redaction_status = 'COMPLETED'` je **logički
nemoguća**: redakcija operiše nad normalizovanim artefaktom i ne može uspjeti nad neupotrebljivim
izvorom. **Ta ratifikovana odluka se očuvava**: kombinacija se **odbija**, i implementacija je ne
smije proizvesti ni prihvatiti.

Artefakt-konzistencijski `CHECK` iz E.1 je već isključuje u dijelu koji je database-provjerljiv
(`COMPLETED` bez artefakta je nemoguć). Domenski sloj je dodatno ne smije konstruisati.

## E.3 Zašto `CHECK` sada, a ne ranije

Prigovor D-060 bio je **vremenski, ne suštinski**: "*prerani constraint bi zaključao vokabular
prije schema gatea*". **Taj prigovor istječe tačno ovdje**, na schema gateu. Vokabular je zamrznut
prihvaćenom odlukom (D-060, klauzule 29–30, uz eksplicitno isključenje
`PENDING`/`PROCESSING`/`ARCHIVED`/`SKIPPED`), pa `CHECK` kodira **ratifikovanu činjenicu**, a ne
pretpostavlja neratifikovanu.

**Kontrast sa `OD-P5-D2-11`**, gdje se `CHECK` **ne** uvodi: ondje vokabular **nije** ratifikovan.
Razlika je ratifikacija, ne sklonost prema `CHECK`-ovima.

Buduća izmjena vokabulara time traži migraciju — što je ispravno, jer je takva izmjena događaj na
nivou odluke.

# Dio F — encounter state machine (`OD-P5-D2-7`)

Kanonski vokabular (`02` §4.3, devet vrijednosti) i kanonski skup od **tačno 15 tranzicija**
(`03` §29.1, D-027; `08` §11.1) **ostaju zamrznuti i ne otvaraju se**.

## F.1 Dosežni podskup Faze 5 — tačno 4 od 15

**Stanje kreiranja Faze 5:** `DRAFT`, jedino i uvijek.

| # | Tranzicija | Okidač | Akter | Timestamp | `version` |
|---|---|---|---|---|---|
| 1 | *(kreiranje)* → `DRAFT` | `POST /encounters` | `encounter.create` — PHYSICIAN, MPA | `created_at`, `created_by` | `version = 1`, `ETag: "1"` |
| 2 | `DRAFT` → `READY_FOR_ANALYSIS` | uspješan unos dokumenta | `encounter.document.create` — PHYSICIAN, MPA | `updated_at`, `updated_by` | **bez inkrementa** |
| 3 | `DRAFT` → `CANCELLED` | `POST …/cancel` | `encounter.cancel` — **isključivo PHYSICIAN** | `updated_at`, `updated_by` | inkrement |
| 4 | `READY_FOR_ANALYSIS` → `CANCELLED` | `POST …/cancel` | `encounter.cancel` — isključivo PHYSICIAN | `updated_at`, `updated_by` | inkrement |

**Nedosežna stanja u Fazi 5:** `ANALYSIS_IN_PROGRESS`, `REVIEW_REQUIRED`, `APPROVED`,
`EXPORT_PENDING`, `EXPORTED`, `CLOSED`.

**Preostalih 11 tranzicija mora biti implementirano kao eksplicitno zabranjeno** →
`409 INVALID_STATE_TRANSITION`, a **ne prećutno odsutno**. `08` §11.1 traži table-driven test nad
**cijelom** mašinom.

**Ponašanje Faze 7+ se ne uvlači u Fazu 5.** Nijedna analiza, nijedan approval i nijedan export put
nije dio Faze 5.

## F.2 `DRAFT → READY_FOR_ANALYSIS` — ratifikovani trigger

- postavlja ga **komanda unosa dokumenta**, ne klijent;
- **isključivo iz `DRAFT`**;
- pri **svakom** uspješnom unosu, **idempotentno** — ako je encounter već `READY_FOR_ANALYSIS`, to
  je **no-op, ne greška**;
- **ne troši `version` inkrement** — istovremeni `PATCH` sa važećim `ETag`-om se ne obara;
- emituje **vlastiti** audit događaj `ENCOUNTER_READY_FOR_ANALYSIS`;
- **nema klijentske rute za promjenu statusa** — `03` §12 zabranjuje proizvoljnu promjenu statusa.

## F.3 Cancel, terminalnost, zatvaranje i ograničenja mutacije

- **Cancel:** `POST /encounters/{encounterId}/cancel`, permisija `encounter.cancel`, isključivo
  `PHYSICIAN` (D-042). Dozvoljen iz `DRAFT` i `READY_FOR_ANALYSIS`.
- **`reason` pri cancelu se ne perzistira u `encounters`** — **kolona ne postoji i ne uvodi se**.
  Zapisuje se **isključivo u audit trag**, i **mora biti sanitizovan** prije zapisa, jer je
  slobodan tekst i može sadržavati PHI (`02` §15.4, `09` §11, D-060, klauzula 39).
- **Terminalnost:** `CANCELLED` je terminalno — **nema izlaznih tranzicija, nema reopen-a**, i
  `CANCELLED → CLOSED` je eksplicitno zabranjeno (`03` §29.1). Nakon njega nema nikakve mutacije.
- **Zatvaranje:** `CLOSED` je **nedosežan u Fazi 5** — traži `EXPORTED` i rutu `close`, a nijedno
  ne postoji u Fazi 5. `04` §7.3 ne navodi `POST …/close`, i to **nije kontradikcija** sa
  `03` §12, nego tačna posljedica nedosežnosti.
- **Arhiviranje encountera ne postoji** — `encounters` nema `archived_at` kolonu. Arhiviranje je
  **isključivo koncept dokumenta**.
- **Ograničenja mutacije:** `PATCH` je dozvoljen isključivo u nefinalnim stanjima (`DRAFT`,
  `READY_FOR_ANALYSIS`), uz obavezan `If-Match`.
- **Efekt na dokumente:** unos dokumenta se **odbija** kad je encounter `CANCELLED` →
  `409 INVALID_STATE_TRANSITION`.
- **Odgovorni ljekar:** promjenjiv u `DRAFT` i `READY_FOR_ANALYSIS`, odbijen iz `CANCELLED`.

## F.4 Sloj sprovođenja

**Aplikacijski/domenski, ne database.** **Nijedan trigger, `CHECK` ni constraint nad statusnom
kolonom se ne uvodi.** `02` §22.14 dodjeljuje immutability trigere paketu `014` i navodi tačno dva
guarda plus AAD i revision-identity guard — **encounter-status trigger u kanonu ne postoji** i
njegovo uvođenje bi stvorilo klasu artefakta koju nijedna odluka nije autorizovala. **Vokabular**
statusa je već sproveden enum tipom `encounter_status`; **graf tranzicija** je aplikacijski, tačno
kako `03` §29 navodi.

## F.5 Ispravka rasporeda u test strategiji

`08` §26.1 dodjeljuje "§23.2 kaskada → Faza 5". **To je netačno i ispravlja se:** kaskada
otkazivanja iz D-035 zahtijeva `analysis_runs`, koje kreira paket `005` u **Fazi 7**. **Ta kaskada
se ne može u cijelosti testirati u Fazi 5** i **repointira se na fazu vlasnika stanja**. Faza 5
testira isključivo svoje četiri dosežne tranzicije i eksplicitno odbijanje preostalih jedanaest.

Obrnuto, "§22.1 immutability trigger" se **repointira na Fazu 5** za tri tabele koje Faza 5 kreira
i koje nose ciphertext ili AAD-vezane ključeve (Dio B.3).

# Dio G — document state, retry i arhiva (`OD-P5-D2-9`, `OD-P5-D2-10`)

## G.1 Tabela kombinacija

| # | `processing_status` | `redaction_status` | Validno? | Dosežno u Fazi 5? | Sadržaj reda | PHI/AI podobnost |
|---|---|---|---|---|---|---|
| 1 | `READY` | `COMPLETED` | **da** | **da — normalna putanja** | `normalized_text_*`, `source_text_hash`, `redacted_text_*`, `redacted_text_hash` — svi non-null; `encryption_*` postavljeni | **zadovoljena** |
| 2 | `READY` | `FAILED` | **da** | **da** | normalizovana strana potpuna; `redacted_text_*` i `redacted_text_hash` **null** | **nije zadovoljena** |
| 3 | `FAILED` | `FAILED` | **da** | **ne** — G.2 | obje strane null | nije zadovoljena |
| 4 | `FAILED` | `COMPLETED` | **NEMOGUĆE** | — | — | — |

**PHI/AI predikat podobnosti** (D-060 G.4):

```text
processing_status = 'READY'
and redaction_status = 'COMPLETED'
and redacted_text_ciphertext is not null
and redacted_text_hash is not null
```

Nijedna ruta Faze 5 ga ne konzumira — to je ugovor koji će konzumirati ulaz analize Faze 7.

## G.2 `processing_status = FAILED` je nedosežan u Fazi 5

`POST /encounters/{encounterId}/documents/text` je **jedina aktivna** putanja kreiranja dokumenta
(`03` §13.1; upload putanja je `DEFERRED`, §13.2). Za nju je D-060, klauzula 35, eksplicitna: ako
bi normalizacija proizvela nevalidan rezultat, **zahtjev se odbija**. Odbijen zahtjev je `422` —
**i ne kreira red**.

Dakle: ili normalizacija uspije i red se upisuje sa `processing_status = READY`, ili reda nema.
`FAILED` procesiranje postaje dosežno tek kad se odmrzne upload putanja.

**Zapisane posljedice:** tabela stanja Faze 5 ima **dvije** dosežne kombinacije, ne tri;
`processing_status` je u Fazi 5 efektivno konstanta `'READY'`; **kolona, vokabular i testovi
ostaju**, jer ih upload putanja aktivira. Ovo se zapisuje da ne bi kasnije bilo pogrešno shvaćeno
kao nedostajuća kodna grana.

## G.3 Kreiranje, atomičnost i retry

- **Kreiranje:** jedan red po uspješnom `POST`-u, `source = MANUAL_TEXT`,
  `processing_status = READY`, `redaction_status` prema ishodu redakcije. Normativni redoslijed
  obrade (`03` §13.1): normalizacija → `source_text_hash` → enkripcija i pohrana normalizovanog →
  redakcija → `redacted_text_hash` → enkripcija i pohrana redigovanog.
- **Atomičnost statusa i artefakata — normativno.** Red se upisuje **jednim `INSERT`-om unutar
  jedne pinovane transakcije**. Status, ciphertexti, IV-ovi, auth tagovi i **oba** hasha su kolone
  **istog reda u istom iskazu**. **Ne postoji prozor u kojem status ne odgovara svojim
  artefaktima**, zbog čega su row-level i per-field `CHECK` constrainti dovoljni i **nijedan
  trigger nije potreban**.
- **Retry se odgađa.** D-060, klauzula 32, **ostaje nepromijenjena i neopozvana** — ponavljanje
  redakcije pod **istom** verzijom ruleseta uz **svjež IV** ostaje ugovorno dozvoljeno. Odgađa se
  isključivo **površina**: `03` §13.3 ne izlaže retry rutu, i **Faza 5 je ne uvodi**. Ovo je isti
  obrazac vlasništvo-naspram-izvršenja koji uspostavlja D-052.
- **Posljedica za grant:** `encounter_documents` dobija `UPDATE` **isključivo nad `archived_at`**.
  Sve ostale kolone su nakon `INSERT`-a **nezapisive na nivou privilegije**.
- **Ako buduća odluka uvede retry rutu**, grant se proširuje na **tačno**
  `redaction_status`, `redacted_text_ciphertext`, `redacted_text_iv`, `redacted_text_auth_tag`,
  `redacted_text_hash` — i **ne** na `encryption_key_ref` ni `encryption_key_version`, jer retry
  istim ključem njih ne mijenja.

## G.4 Čitanje, `view` i apsolutna zabrana

- **`view=redacted`** — permisija `encounter.document.read`; vraća **dekriptovani redigovani
  tekst**.
- **`view=original`** — **dodatno** traži `encounter.document.read_original` i emituje audit
  događaj `DOCUMENT_VIEWED`. Ponašanje D-043 je nepromijenjeno.
- **Očuvano D-060:** **`view=original` znači dekriptovani kanonski normalizovani izvorni tekst, a
  ne sirove bajtove zahtjeva.** Sirovi tekst prije normalizacije se **ne perzistira** (`02`
  §2.10.1).
- **Apsolutna zabrana:** pri `redaction_status = FAILED` `view=redacted` **mora odbiti** i **nikada
  ne smije pasti nazad** na normalizovani ni originalni tekst. D-060 to imenuje "**najozbiljnijim
  mogućim defektom ovog dizajna**" — tiho bi zaobišlo `encounter.document.read_original` i
  poništilo D-043. Pripada **trajnoj regresijskoj suiti**.
- **Neuspjeli dokumenti su listabilni.** Dokument sa `redaction_status = FAILED` je običan red pod
  tenant politikom: metapodaci su vidljivi, `view=original` je čitljiv uz odgovarajuću permisiju,
  i **isključivo** `view=redacted` odbija.

## G.5 Arhiva (`OD-P5-D2-10`)

- `POST /encounters/{encounterId}/documents/{documentId}/archive` postavlja `archived_at`.
  Permisija `encounter.document.archive`, isključivo `PHYSICIAN`. **Nijedna statusna vrijednost se
  ne mijenja.**
- **Lista `GET /encounters/{encounterId}/documents` isključuje** `archived_at IS NOT NULL`.
- **Detaljna ruta `GET …/documents/{documentId}` i dalje vraća arhivirani dokument**, sa prisutnim
  `archivedAt`. Time ostaje dosežan za audit — što stvarno brisanje ne bi bilo.
- **Ponovno arhiviranje već arhiviranog dokumenta je idempotentan uspjeh**, ne `409`.
- **Restore ruta ne postoji i ne uvodi se.** `includeArchived` parametar se **ne uvodi**.
- **Arhiva nikada ne smije postati RLS predikat** (Dio I) — to bi sakrilo redove od audita i
  učinilo stanje nepovratnim.
- **Fizičko brisanje ne postoji nigdje u Fazi 5** i **ne uvodi se nijedna delete ruta.**

# Dio H — API / schema pomirenje (`OD-P5-D2-8`, `OD-P5-D2-11`, `OD-P5-D2-12`)

**Nijedno API polje se ne kreira samo da bi schema kolona bila popunjena.** Obrnuto vrijedi
jednako: kolona bez pisca Faze 5 ostaje `NULL` **po dizajnu**, i to je zapisano, a ne otkriveno.

## H.1 `GET /patient-references/{patientReferenceId}`

Oblik odgovora **je isti kao tijelo `201` odgovora na `POST /patient-references`**: `id`,
`pseudonym`, `sourceSystem`, `birthYear`, `sexCode`, `createdAt`.

**`external_patient_ref_hash` je odsutan iz svakog odgovora po dizajnu** (D-060, klauzula 38).
Eksterni identifikator se **nikada** ne vraća i **nikada** ne loguje.

`patient_references` nema `PATCH`, nema `version`, nema `archived_at`, nema `status` i nema delete
rutu. Model je: **kreiraj jednom, čitaj, nikada ne mijenjaj, nikada ne arhiviraj, nikada ne briši.**
**Nijedan `UPDATE` grant i nijedna `UPDATE` politika se u Fazi 5 ne uvode.**

## H.2 `PATCH /encounters/{encounterId}` — tačan skup polja (`OD-P5-D2-8`)

**Patchable — tačno osam:**

```text
occurredAt, treatmentDate, responsiblePhysicianId, guarantorType,
insuranceContext, specialtyCode, patientAgeAtEncounter, patientSexAtEncounter
```

**Nije patchable — normativno:**

```text
status, patientReferenceId, sourceSystem, version, diagnoses[],
svaki id, svaki timestamp, svaka actor kolona (created_by, updated_by)
```

- Dozvoljen **isključivo u nefinalnim stanjima**; obavezan `If-Match`.
- **`patientReferenceId` nije patchable** — inače bi se encounter mogao tiho prepokazati na drugog
  pacijenta nakon što su dokumenti već zavedeni.
- **`diagnoses[]` nije patchable u Fazi 5** — `02` §18.1 ne dodjeljuje `DELETE` nad
  `encounter_diagnoses` ni u v1, a Faza 5 nema ni `UPDATE` grant nad tom tabelom.
- **Sprovodi se dvostruko:** aplikacijskom allowlistom **i** column-level `UPDATE` grantom iz
  Dijela I, koji `patient_reference_id` i `source_system` uskraćuje na nivou privilegije. To je
  svojstvo "dvije nezavisne barijere" koje projekat već primjenjuje na `practice_settings.practice_id`.

## H.3 Vrijednosni rječnici i `NOT NULL` kolone bez API izvora (`OD-P5-D2-11`)

**Ratifikovane vrijednosti Faze 5:**

| Kolona | Vrijednost pri kreiranju | Obrazloženje |
|---|---|---|
| `encounter_diagnoses.review_state` | **`'UNREVIEWED'`** | jedini smislen član `02` §4.8 za tek zavedenu dijagnozu |
| `encounter_diagnoses.source` | **`'MANUAL'`** | usklađeno sa `integration_provider` literalom koji zahtjev nosi |

**Free-form u v1** — validacija **isključivo** dužine i charseta na API sloju, **bez DB `CHECK`-a,
bez enuma, bez schema izmjene**, i eksplicitno zapisano kao "*vokabular neodlučen u v1*":

```text
guarantorType, insuranceContext, sexCode, patientSexAtEncounter,
specialtyCode, diagnosisType
```

`codingSystem` se već vodi kao otvorena eksterna zavisnost (`13` §13); validira se **isključivo**
dužina/charset. **Ostaje free-form u v1.**

Ovo doslovno preslikava precedent `02` §2.11.4: aplikacijsko sprovođenje dok je vokabular
neodlučen, uz netaknutu schemu. **Kontrast sa Dijelom E je ratifikacija vokabulara, ne sklonost.**

## H.4 Polja bez modela u Fazi 5 (`OD-P5-D2-12`)

**Ključevi se izostavljaju u cijelosti — odsutni, ne `null`:**

- `latestAnalysis` blok — `analysis_runs` je paket `005`, Faza 7;
- approval / export summary blok — Faza 10 / 11;
- **`hasBlockingFindings` filter se ne registruje** — `rule_findings` je paket `008`, Faza 9.
  Nepoznat query parametar se **odbija** (`08` §12, `05` §6 — "unknown field rejected").

**Obrazloženje je već kanonsko** — D-061, klauzula 8, uspostavljena je **za tu istu rutu** i za
tačno tu razliku: prisutan ključ sa praznom vrijednošću tvrdio bi da polje postoji i da je
vrijednost nepoznata; **odsutan ključ tačno kaže da površina ne postoji**. Prihvatiti pa ignorisati
filter je najopasnija varijanta — vratio bi **širi** skup nego što je pozivalac tražio, tiho.

**`sort` vokabular Faze 5:** `treatmentDate desc, id desc` — **default i jedina vrijednost**.
**Cursor kodira `(treatment_date, id)`** i **nikada pseudonim** — pseudonim je Class C, nije
log-safe, a cursor je vidljiv klijentu. Nevalidan cursor → `400 INVALID_CURSOR`.

## H.5 Kolone bez pisca u Fazi 5 — ostaju `NULL` po dizajnu

| Kolona / tabela | Stanje u Fazi 5 |
|---|---|
| **`storage_objects` — cijela tabela** | **nema pisca u Fazi 5**; upload putanja je `DEFERRED` (`03` §13.2). Tabela postoji jer je FK roditelj, i drži **nula redova** |
| `encounters.external_encounter_ref_hash` / `_ciphertext` / `_iv` / `_auth_tag` | **nema pisca** — nijedno API polje ne nosi eksternu encounter referencu. **`encounters` u Fazi 5 ne nosi nikakav ciphertext** |
| `encounters.encryption_*` (četiri kolone) | `NULL`; row-level `CHECK` je zadovoljen vakuumski |
| `encounter_documents.external_document_ref_hash` | **nema pisca** — ostaje `NULL` |
| `patient_references.external_patient_ref_ciphertext` / `_iv` / `_auth_tag` / `encryption_*` | opcioni envelope; **u Fazi 5 neiskorišten** (write-back je Axenita, iza `D-OPEN-009`) |
| `encounter_documents.source_storage_object_id` | **nema pisca**; FK je deklarisan (Dio C, #11), vrijednost ostaje `NULL` |
| `storage_objects.archived_at` / `retention_delete_after` | neiskorišteni u Fazi 5 |

## H.6 Ostala pomirenja

- **`POST /encounters` odgovor:** `status` je izvedeno i **uvijek `"DRAFT"`**; `version` = 1,
  `ETag: "1"`; `patient.pseudonym` je **obično čitanje** `patient_references.pseudonym` u istom
  tenantu, ne dekripcija.
- **`POST …/documents/text` odgovor:** `source` je izvedeno i **uvijek `"MANUAL_TEXT"`**;
  `processingStatus` je izvedeno i **uvijek `"READY"`** u Fazi 5 (Dio G.2); `redactedTextHash` se
  **izostavlja** kada je redakcija neuspjela.
- **`redactBeforeAiProcessing`** se prima **isključivo kao `true`**; `false` → `422`
  (D-060, klauzula 36). **Ne pohranjuje se ni u jednu kolonu.**
- **`text` je Class A**: normalizuje se, hashira, **enkriptuje**; **nikada se ne pohranjuje sirov**
  i **nikada se ne vraća** u validacijskom tijelu ni logu.
- **Cancel `reason`** — audit-only i sanitizovan (Dio F.3).
- **`04` §7.3 ne navodi `POST …/close`, a `03` §12 ga definiše** — to **nije kontradikcija**:
  `EXPORTED` je nedosežan u Fazi 5, pa je ruta izvan obuhvata Faze 5 (Dio F.3).
- **`02` §28.1 tvrdi da je paket `003` "prvi koji kreira izvornu tabelu sa composite FK-om"** —
  to je **manja dokumentaciona netačnost**: paket `002` je to već učinio za
  `practice_membership_roles`. **Suština roka je nepromijenjena** i ovom odlukom je ispunjena.

# Dio I — RLS i grantovi Faze 5

**Objavljuje se dizajn. Politike i grantovi se ovim gateom NE implementiraju.**

## I.1 RLS po tabeli

| Tabela | `ENABLE` | `FORCE` | SELECT | INSERT | UPDATE | DELETE | `USING` | `WITH CHECK` |
|---|---|---|---|---|---|---|---|---|
| `patient_references` | **da** | **da** | `patient_references_select` | `patient_references_insert` | **nijedna u Fazi 5** | **nijedna** | tenant predikat | tenant predikat (INSERT) |
| `encounters` | **da** | **da** | `encounters_select` | `encounters_insert` | `encounters_update` | **nijedna** | tenant predikat | tenant predikat na INSERT **i** UPDATE |
| `encounter_diagnoses` | **da** | **da** | `encounter_diagnoses_select` | `encounter_diagnoses_insert` | **nijedna u Fazi 5** | **nijedna** | tenant predikat | tenant predikat (INSERT) |
| `storage_objects` | **da** | **da** | **nijedna** | **nijedna** | **nijedna** | **nijedna** | — | — |
| `encounter_documents` | **da** | **da** | `encounter_documents_select` | `encounter_documents_insert` | `encounter_documents_update` | **nijedna** | tenant predikat | tenant predikat na INSERT **i** UPDATE |

**Tenant predikat je doslovno oblik `02` §17.1, neoslabljen:**

```sql
practice_id = nullif(current_setting('app.practice_id', true), '')::uuid
```

Ukupno **8 novih politika**. Nakon Faze 5: **18 politika** nad **11 tabela** sa `ENABLE` + `FORCE`.

> **KOREKCIJA — D-064, `OD-6` (kasniji autoritet).** Rečenica iznad je **tačna kao PHI-only /
> pre-paket-`011` podzbir**, ali **nije puni post-`P5-I2` katalog** i **ne smije se koristiti kao
> exit tvrdnja `P5-I2`**. Puno kanonsko stanje nakon `P5-I2` je **23 politike** nad **13 tabela**
> sa `ENABLE` + `FORCE` (10 Faza-3/4 + 8 PHI + 3 `idempotency_keys` + 2 `audit_events`).
> Tijelo D-062 se **ne prepisuje** — anotira se, po precedentu D-063. Vidi `02` §29.4a.

> **Superseded za aritmetiku politika `P5-I2B` — D-065, `RULING 1`; imenovani katalog
> kontroliše. Vidi D-065.** Član „**8** novih politika" je **aritmetička greška** u odnosu na
> tabelu I.1 neposredno iznad, koja nabraja **deset** imenovanih politika (`patient_references`
> 2, `encounters` 3, `encounter_diagnoses` 2, `storage_objects` 0, `encounter_documents` 3).
> Time je i izvedeni `18 / 11` netačan, a i `23` iz korekcije D-064 iznad. **Kanonski je: PHI =
> 10, `P5-I2B` = 15 novih politika, puni post-`P5-I2B` total = 25 nad 13 tabela
> (`10 + 10 + 3 + 2`).** **Nijedna politika se ne briše da bi stari zbir ostao tačan.** Tijela
> D-062 i D-064 se **ne prepisuju** — anotiraju se, po precedentu D-063.

## I.2 Normativna ograničenja dizajna politika

- **`practice_id` je `NOT NULL` na svih pet** (`02` §2.5), pa pretpostavka §17.1 vrijedi i nijedan
  red ne može se sakriti iza `NULL` tenant ključa.
- **Nijedan permission predikat** — permisije pozivaoca ostaju u aplikaciji
  (`03` §3.7.1 korak 10, §28.5; `15`). RLS nosi tenant granicu i **ne smije** postati drugi,
  divergentni permission engine.
- **Nijedan archive/soft-delete predikat** — filtriranje po `archived_at` je **upitno pitanje, ne
  sigurnosna granica**.
- **`FORCE` je obavezan uz `ENABLE`** — bez njega vlasnik `copilot_migrator` tiho zaobilazi svaku
  politiku.
- **Nijedna politika Faze 5 ne sadrži podupit** — svih osam su obična poređenja kolone sa GUC-om.
  Time **strukturno ne postoji površina** kroz koju bi co-member identitet mogao procuriti, i
  izbjegnut je tačan defekt koji dokumentuje D-061, klauzula 4.
- **Nijedna politika Faze 5 ne referencira `users` ni `practice_memberships`.**
- **Nema bootstrap izuzetka i nijedan se ne smije dodati** — nijedna tabela Faze 5 ne čita se
  prije uspostavljenog tenant konteksta. Bez `app.practice_id` predikat daje **nula redova za svaku
  ordinaciju** (fail-closed).
- **`set_request_context` ostaje nepromijenjen** — tijelo, potpis i `SECURITY INVOKER` mod.

## I.3 Tačni runtime grantovi Faze 5 — default deny

`copilot_system` dobija **ništa** nad svih pet (D-023). `PUBLIC` dobija **ništa**;
`REVOKE ALL … FROM PUBLIC` prethodi svakom grantu, prema obrascu `002`. Vlasnik ostaje
`copilot_migrator`.

| Tabela | SELECT | INSERT | UPDATE | DELETE | Sequences |
|---|---|---|---|---|---|
| `patient_references` | table-level | table-level | **nijedan** | **nijedan** | nijedan |
| `encounters` | table-level | table-level | **column-level, usko** (I.4) | **nijedan** | nijedan |
| `encounter_diagnoses` | table-level | table-level | **nijedan** | **nijedan** | nijedan |
| `storage_objects` | **nijedan** | **nijedan** | **nijedan** | **nijedan** | nijedan |
| `encounter_documents` | table-level | table-level | **column-level: isključivo `archived_at`** | **nijedan** | nijedan |

**`02` §18.1 opisuje v1 krajnje stanje, a NE stanje Faze 5.** Čitati ga kao obuhvat Faze 5 značilo
bi dodijeliti `UPDATE` nad `patient_references` i `INSERT` nad `storage_objects` **bez ijednog
konzumenta**. Sposobnost raste po fazi (precedent D-049), i **grant se nikada ne izdaje prije svog
konzumenta**.

**`storage_objects` namjerno dobija nula sposobnosti:** tabela mora postojati jer je FK roditelj,
ali **nijedna ruta Faze 5 je ne čita ni ne piše**. `ENABLE` + `FORCE`, **bez politike, bez granta**
— default deny, dokazivo nedosežna. **Ne dobija Faza-5 writer grant.**

**Nijedan fizički `DELETE` grant nigdje** — nije ratifikovan i ne uvodi se.

## I.4 Column-level `UPDATE` grant nad `encounters`

```text
status, version, updated_by, updated_at,
occurred_at, treatment_date, responsible_physician_id,
guarantor_type, insurance_context, specialty_code,
patient_age_at_encounter, patient_sex_at_encounter
```

**Uskraćeno — bez `UPDATE` privilegije:**

```text
id, practice_id, patient_reference_id, source_system, created_by, created_at,
external_encounter_ref_hash, external_encounter_ref_ciphertext,
external_encounter_ref_iv, external_encounter_ref_auth_tag,
encryption_algorithm, encryption_version, encryption_key_ref, encryption_key_version
```

Tri svojstva koja sama politika ne daje:

1. **`practice_id` i `id` postaju nepomjerivi na nivou privilegije** — "dvije nezavisne barijere",
   primijenjeno na tenant ključ **i** primarni ključ.
2. **Bitno ublažava vremenski jaz AAD immutability-ja** — AAD-vezane kolone su tačno `id` i
   `practice_id`; bez `UPDATE` granta runtime rola ih ne može promijeniti, sa trigerom ili bez.
3. **`patient_reference_id` postaje immutable** — encounter se ne može tiho prepokazati na drugog
   pacijenta.

## I.5 Column-level `UPDATE` grant nad `encounter_documents`

```text
archived_at
```

**To je potpuna lista.** Posljedično su `id`, `practice_id`, `encounter_id`, **obje** statusne
kolone, **oba** ciphertext trojca, **oba** hasha, sve četiri `encryption_*` kolone te
`created_by`/`created_at` **nezapisivi nakon `INSERT`-a na nivou privilegije** — per-document
immutability jača od bilo kojeg trigera, dobijena besplatno.

## I.6 Column-level `SELECT` se ne uvodi

`002` je koristio column-level `SELECT` nad `users` i `practices` da `auth_subject`, `legal_name`,
`zsr_number` i `gln_number` učini nedosežnim i pri ukradenom credentialu. **Nijedna kolona Faze 5
nema to svojstvo**: svaka je ili potrebna u odgovoru, ili u `WHERE` predikatu, ili je ciphertext
bezvrijedan bez ključa koji se drži izvan baze. `external_patient_ref_hash` **mora** nositi
`SELECT`, jer se deterministički lookup oslanja na njega u `WHERE` predikatu, a kolona bez granta
pada na `42501` i kad se koristi isključivo u `WHERE` (`02` §20.2b). Table-level `SELECT` uz usku
aplikacijsku projekciju je iskren izbor.

# Dio J — indeksi (`OD-P5-D2-13`)

`02` §7.2 i `02` §21 su se **razilazili**: §7.2 deklariše `responsible_physician_id` indeks koji
§21 izostavlja; §21 dodaje `id desc` na patient-timeline indeks, a §7.2 ne. **Ratifikovana je
unija, sa specifičnijim `id desc` tie-breakerom.**

```sql
create index encounters_review_queue_idx
on encounters(practice_id, status, treatment_date desc, id desc);

create index encounters_patient_timeline_idx
on encounters(practice_id, patient_reference_id, treatment_date desc, id desc);

create index encounters_responsible_physician_idx
on encounters(practice_id, responsible_physician_id, treatment_date desc, id desc);

create index documents_encounter_idx
on encounter_documents(practice_id, encounter_id, created_at);
```

- **`encounters_responsible_physician_idx` se NE uklanja** samo zato što ga minimalni katalog §21
  izostavlja — filter `responsiblePhysicianId` je kanonski i **eksplicitno očuvan** D-061,
  klauzulom 10, pa indeks nije spekulativan.
- **`id desc` je obavezan** na sva tri encounter indeksa — bez njega je rep sortiranja nestabilan i
  cursor paginacija se lomi (`03` §7 traži stabilan sort).
- Nijedan od četiri nije spekulativan: svaki ima dokumentovanu putanju upita u zamrznutom ugovoru.
- **Kreira ih paket `003`.** Paket `012_constraints_indexes` ih kasnije **verifikuje**, ne kreira —
  precedent `platform_role_assignments_user_idx` iz paketa `002`.

# Dio K — seed politika (`OD-P5-D2-14`)

- **Nijedna PHI tabela Faze 5 se ne seeda.** Nijedan pouzdani DML nikada ne dodiruje PHI tabelu.
- **Allowlista iz `02` §23.4 ostaje na tačno šest tabela.** **Nijedna `§23.4.4b` klauzula se ne
  uvodi**, i **nijedan `NO FORCE ROW LEVEL SECURITY` prozor se ne otvara nad medicinskim
  podacima** — trajno, i za svaku kasniju fazu.
- `02` §23.2 demo encounter označava **opcionim**. Odricanje od njega ne košta ništa.
- Ako se demo encounter poželi, kreira se **kroz autentifikovani API** u razvojnoj skripti — što
  ujedno dokazuje rutu umjesto da je zaobilazi.
- **Tiho proširenje allowliste ostaje zabranjeno** (`02` §23.4.4, `08` §26.2) i ova odluka ga ne
  uvodi.

# Dio L — implementacijski slice-ovi, gateovi i test obaveze

**Slice-ovi se ovdje isključivo objavljuju kao dizajn. Nijedan se ovim gateom ne autorizuje.**

| Slice | Obuhvat | Zavisi od |
|---|---|---|
| `P5-I1` | Prisma modeli + paket `003` + Faza-5 slice paketa `011`; svi FK-ovi sa eksplicitnim `NoAction`; svi `CHECK`-ovi; 4 indeksa. **Bez granta, bez politike, bez trigera, bez servisa** | OD-1, 2, 3, 5, 6, 13, 14 |
| `P5-I2` | Faza-5 slice paketa `013` (grant → `ENABLE`/`FORCE` → politike, jedna transakcija); Faza-5 slice paketa `014`; **trajna negative-privilege i steady-state regresijska suita**; **`★` dokaz iz Dijela D.6** | `P5-I1`; OD-1, 4, 5 |
| `P5-I3` | Kripto/HMAC/normalizacijski primitivi (bez baze) — paralelizabilno | isključivo OD |
| `P5-I4` | Servis i rute `patient_references` | `P5-I2`, `P5-I3` |
| `P5-I5` | **Encounter jezgro** — `POST`, `PATCH`, `cancel`, table-driven state machine nad svih 15 tranzicija sa 4 dosežne; usko `23503 → 422` mapiranje | `P5-I2` **uključujući `★`**, `P5-I3`, `P5-I4` |
| `P5-I6` | Ručni unos dokumenta i redakcija | `P5-I3`, `P5-I5` |
| `P5-I7` | Čitanje, lista, filteri, arhiva | `P5-I5`, `P5-I6` |
| `P5-I8` | Integracijsko i sigurnosno zatvaranje Faze 5 | sve |

> **KOREKCIJA — D-063, klauzule 1–5 (kasniji autoritet).** Red `P5-I1` iznad je **superseded u
> jednoj tački** i zadržan nepromijenjen kao historijski dokaz. **Faza-5 slice paketa `011`
> (`idempotency_keys`, `audit_events`) više NIJE u `P5-I1`** — odgođen je u **`P5-I2`**, jer je
> `P5-I1` istovremeno nosio obavezu da te tabele kreira i zabranu da im izda **ijedan** grant,
> `ENABLE`/`FORCE RLS` ili politiku, a grant disciplina iz Dijela B.3 nigdje nije bila zapisana za
> te dvije §15 tabele. **`P5-I1` je time isključivo strukturni slice:** Prisma schema Faze 5,
> paket `003` i schema/katalog testovi paketa `003`. **`P5-I2` uz `013`-slice, `014`-slice i `★`
> dokaz sada nosi i `011`-slice**, uz obaveznu enumeraciju iz D-063, klauzule 4, i zabranu iz
> D-063, klauzule 5 — **nijedna runtime rola ne dobija sposobnost nad `idempotency_keys` ni
> `audit_events` prije nego što je njena ograničavajuća tenant politika na snazi**. **Vlasništvo
> paketa, redoslijed migracija (`003` → `011` → `013` → `014`) i sve ostale ratifikacije D-062
> ostaju nepromijenjeni.**

## L.1 Tvrdi gateovi

1. **`P5-I0`** — zaseban **implementacijski autorizacijski gate**. Bez njega Faza 5 ne počinje.
   Autorizuje **isključivo** `P5-I1`, i ništa preko toga.
2. **`★` RI-naspram-RLS dokaz u `P5-I2`** — **tvrdi preduslov za `P5-I5`**. Neuspjeh je **HARD
   HOLD** i vraća se u dizajn (Dio D.6). **Ne autorizuje slabljenje RLS-a.**
3. **Trajne regresije** koje moraju ostati zelene i nepromijenjene: `practice_memberships` ima
   **tačno jednu** politiku, bajt-identičnu Faza-4 tijelu; `users` ima **tačno dvije** politike;
   grantovi nad `users`, `practices`, `practice_memberships` i `practice_membership_roles` su
   nepromijenjeni; `FORCE RLS` je `true`; `GET /me` i dalje vraća vlastiti `email` i `displayName`;
   **odsustvo ključa `displayName`** u `GET /encounters`, provjereno nad **sirovim** payloadom.

## L.2 Test obaveze (dokumentuju se, ne izvršavaju se u ovom gateu)

- **`★`** — Dio D.6, oba iskaza u istoj transakciji.
- Cross-practice dodjela odgovornog ljekara → **`422`**, i **neuspjeh nastaje u bazi**, ne u
  aplikacijskoj validaciji.
- "Encounter A → Patient B" mora pasti **na bazi**, ne u aplikaciji.
- `confdeltype = 'a'` i `confupdtype = 'a'` na **svakom** FK-u Faze 5.
- Svih 15 tranzicija: 4 uspijevaju, **11 daje `409 INVALID_STATE_TRANSITION`**.
- `view=redacted` pri `FAILED` **odbija i ne pada nazad** — trajna regresija.
- Arhivirani dokument **nije** u listi, **jest** na detaljnoj ruti; ponovno arhiviranje uspijeva.
- Lista `GET /encounters` **ne dodiruje `users`** — provjereno nad planom upita.
- `latestAnalysis`, approval/export blok i `hasBlockingFindings` — **odsutni ključevi**, nepoznat
  parametar **odbijen**.
- `copilot_system` ima **nula** grantova nad svih pet tabela; `PUBLIC` nula.
- Tačan skup column-level `UPDATE` kolona iz I.4 i I.5.

# Dio M — granice ove odluke

**Ova odluka objavljuje dizajnersku vlast. Ona tu vlast ne implementira.**

Ovaj gate **ne** radi ništa od sljedećeg, i ništa od toga se ne smije izvesti iz njega:

- **ne** mijenja Prisma schemu i **ne** kreira migration SQL;
- **ne** mijenja aplikacijski izvorni kod ni testove;
- **ne** kontaktira i **ne** mutira bazu;
- **ne** mijenja nijednu postojeću RLS politiku, grant, rolu ni funkciju;
- **ne** kreira tabele Faze 5;
- **ne** implementira kripto, HMAC ni redakciju;
- **ne** implementira patient/encounter/document rute;
- **ne** kreira `TenantDatabaseService` — obaveza iz D-056 ostaje **nepromijenjena**;
- **ne** čekira nijedan red implementacijskog checklista Faze 5;
- **ne** mijenja status Faze 5;
- **ne** autorizuje `P5-I1`.

**Ako se ratifikovani dizajn ne bi mogao izraziti dokumentacijom bez izmjene
aplikacijskog/schema/migration koda — postupak je STOP, a ne proširenje Faza-4 sigurnosne
granice.** Ta situacija u ovom gateu **nije nastupila**.

## M.1 Šta ostaje otvoreno — nepromijenjeno

- **`D-OPEN-004a` ostaje OPEN i produkcijski-ograničen.** Ova odluka ga **ne zatvara** i **ne
  pred-odlučuje**. Naprotiv, izbor `NO ACTION` čuva **oba** buduća puta brisanja: eksplicitni
  auditovani purge **i** crypto-shredding uništavanjem ključa.
- **`D-OPEN-007` (retencija) ostaje otvoren.** `09` §20 i dalje traži da se retencija dokumenata,
  analiza i audita definiše prije produkcije. **Nijedno pravno ni retenciono pitanje se ovom
  odlukom ne zatvara**, i **nijedna ruta fizičkog brisanja se ne izmišlja.**
- **`D-OPEN-009` (Axenita write-back) ostaje otvoren** — zato envelope kolone
  `patient_references` ostaju neiskorištene u Fazi 5.
- **`13` §19 — temeljni pristup co-member identitetu ostaje `OPEN / NOT IMPLEMENTED`.** Gate
  `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` ostaje **otvoren** i **consumer-triggered**;
  prvi poznati trigger ostaje `GET /analyses/{analysisId}/workspace` (**Faza 8**) ili raniji
  prihvaćeni konzument, **šta prije nastupi**. **Co-member `displayName` ostaje izostavljen u
  Fazi 5.**
- **Šest `analysis_run_id` relacija** iz `02` §28.1 ostaje zasebna otvorena stavka schema
  governance-a — **izvan** obuhvata ove odluke.
- **Preostalih šest od deset nedeklarisanih referencijalnih akcija** iz `02` §28.1 (paketi `005`,
  `007`, `010`) ostaju otvoreni; ova odluka rješava **isključivo** četiri koje posjeduje paket
  `003`, plus četiri koje sama deklariše.

## Posljedice

- `02` §28.1 je za paket `003` **ispunjen prije roka** — sve četiri relacije koje taj paket kreira
  imaju ratifikovane akcije, i dodane su još četiri deklaracije.
- **D-061, klauzule 19–21, su RAZRIJEŠENE** — mehanizmom koji ne dira nijednu politiku, nijedan
  grant i nijednu rolu, **i uz obavezan empirijski dokaz prije oslanjanja**.
- `02` §2.11.4 je razriješen — statusni rječnici dobijaju DB sprovođenje.
- Faza 5 ulazi u implementacijski gate sa **potpuno određenom** schemom, referencijalnim akcijama,
  vlasništvom paketa, state semantikom, RLS/grant površinom i indeksima.
- **Broj tenant tabela sa `unique (practice_id, id)` raste sa 3 na 8 od 30.**
- **Broj politika raste sa 10 na 18; broj tabela sa `ENABLE` + `FORCE RLS` sa 6 na 11.**
  *(**Superseded za aritmetiku politika `P5-I2B` — D-065, `RULING 1`**: PHI politika ima **10**,
  ne 8, pa je PHI-only međuzbir **20**, a **puni post-`P5-I2B` katalog je 25 politika nad 13
  tabela**. Ni `18 / 11` ni `23` nisu valjana exit tvrdnja `P5-I2`. Imenovani katalog kontroliše.
  Vidi D-065.)*
- Buduća funkcija uklanjanja člana mora koristiti `active = false` ili eksplicitno odlučiti o
  historijskim referencama (Dio D.1.2).

## Security/privacy uticaj

- **Nula nove sposobnosti čitanja identiteta.** Dio D.3 nabraja svaku zabranu D-061, klauzule 11, i
  E.3, i svaka je ispunjena **doslovno i mehanički**.
- **Cross-practice povezivanje je strukturno nemoguće** na svakoj referenci Faze 5 — composite
  ključem ili korijenom u `practices`.
- **Nijedan `SECURITY DEFINER`, nijedan `BYPASSRLS`, nijedna četvrta rola, nijedan drugi klijent.**
- **Default deny** na grantovima; `storage_objects` ostaje bez ijedne sposobnosti.
- **Najveći vektor gubitka PHI (`CASCADE`) je zatvoren** u svakoj poziciji.
- **Klauzula iskrenosti D-060 je ojačana**: `redaction_status = 'COMPLETED'` više ne može postojati
  bez svog redigovanog artefakta — sada strukturno, a ne konvencijom.
- **Nijedna Faza-4 invarijanta nije oslabljena**, i to je mehanički provjerljivo.

## Migration/rollout

Ništa se ne izvršava u ovom gateu. Objavljeni redoslijed je `003` → `011`-slice → `013`-slice →
`014`-slice, svaki u jednoj transakciji, uz katalog tvrdnje iz Dijela B.4. Prvi mutirajući korak
smije nastupiti tek nakon zasebnog gatea `P5-I0`.

## Test dokaz

Testovi se **ne implementiraju i ne izvršavaju u ovom gateu.** Obaveze su zapisane u Dijelu L.2 i
razrađene u `08`.

## Supersedes

**Ne supersedira nijednu odluku.** D-060 i D-061 ostaju na snazi **u cijelosti**; ova odluka
**razrješava obavezu koju je D-061 njoj proslijedio** i **ne dira** nijedno tijelo D-060 ni D-061.
D-023, D-025, D-027, D-029, D-033, D-035, D-038, D-042, D-043, D-046, D-047, D-048, D-049, D-051,
D-052, D-053, D-054 i D-056 ostaju nepromijenjeni. D-047, klauzula 12, se **potvrđuje**, a ne
opoziva.

## Zavisnosti

D-023, D-025, D-027, D-029, D-033, D-035, D-038, D-042, D-043, D-046, **D-047**, D-048, **D-049**,
D-051, **D-052**, D-053, D-054, D-056, D-059, **D-060**, **D-061**; `D-OPEN-004a`, `D-OPEN-007` i
`D-OPEN-009` **ostaju otvoreni**. `13` §19 ostaje otvoren u dijelu temeljnog pristupa identitetu.

## Granice prema budućim fazama

Naredni gate je **`P5-I0` — implementacijska autorizacija Faze 5**, koji autorizuje **isključivo**
slice `P5-I1`. Prije njega Faza 5 ostaje `NOT_STARTED`, a checklist **49 / 0**.

Redoslijed gateova: `P5-D1-A` → `D-060` → `P5-G1` → `D-061` → `P5-D2` → **`P5-D2-B` / `D-062` (ovaj
zapis)** → `P5-I0` → `P5-I1` … `P5-I8`.

---

# D-063 — Korekcija implementacijske granice Faze 5: vrijeme izvršenja Faza-5 slicea paketa `011` i katalog `CHECK` constrainata paketa `003`

- **Status:** ACCEPTED
- **Datum:** 2026-08-23
- **Tip:** uska korektivna odluka o **implementacijskoj granici i dokumentacionoj tačnosti**.
  **Dokumentacija isključivo.**
- **Amandman na:** **D-062, i to isključivo u dvije tačke** navedene niže. Sva ostala tijela D-062
  ostaju **nepromijenjena i na snazi**. **D-060 i D-061 se ne diraju ni u jednoj klauzuli.**
- **Vlasnička ratifikacija:** vlasnik je prihvatio oba nalaza read-only gatea **`P5-I0`** i
  ratifikovao obje korekcije. Ovaj zapis je **objava** te ratifikacije, ne novo biranje opcija.
- **Ovaj gate ne autorizuje implementaciju.** Faza 5 ostaje `NOT_STARTED`, implementacijski
  checklist Faze 5 ostaje **49 / 0**, i nijedan schema, migration, RLS, grant, trigger ni test
  artefakt se ovom odlukom ne kreira. **`P5-I1` se ovom odlukom ne autorizuje — ona ga sužava.**

## Kontekst/problem — trigger

Read-only gate **`P5-I0`** je, prije prvog implementacijskog slicea Faze 5, otkrio dvije greške u
objavljenom kanonskom autoritetu D-062:

1. **Slice `P5-I1` je nosio Faza-5 slice paketa `011`** (`idempotency_keys`, `audit_events`), a
   istovremeno mu je bilo zabranjeno da izda **ijedan** `GRANT`, `ENABLE`/`FORCE RLS` ili politiku.
   D-062, Dio B.3, tu invarijantu za **pet PHI tabela** obezbjeđuje **grant disciplinom** — paket
   `003` ne izdaje nijedan grant, pa je tabela dosežna **nijednoj** runtime roli dok je Faza-5 slice
   paketa `013` ne dodijeli **atomično sa politikom**. Za `idempotency_keys` i `audit_events` **ta
   ista disciplina nigdje nije bila zapisana**: nijedan kanonski dokument ne imenuje ko im, u kojoj
   transakciji i kojim redoslijedom uvodi `ENABLE RLS`, `FORCE RLS`, politike i runtime grantove u
   Fazi 5. `02` §29.4 i §29.5 pokrivaju **isključivo** pet PHI tabela; `02` §18.1 daje generički
   matrični red, ne izvršni ugovor Faze 5. Slice sa **strukturnom** obavezom, **bez** pripadajuće
   **sigurnosne** obaveze, je stanje u kojem se PHI-adjacentna audit tabela može naći bez
   ograničavajuće tenant politike.
2. **Sažeti broj zamrznutih `CHECK` constrainata paketa `003` bio je aritmetički pogrešan.**
   Objavljeno je **18** uz podjelu koja `encounter_documents` pripisuje **10**. Mehaničko
   prebrojavanje **eksplicitno nabrojanih tijela constrainata** u `02` §7.1, §7.2, §7.3, §8.1 i
   §8.2 daje **20**, uz `encounter_documents` = **8**.

## Odluka

### Klauzula 1 — `P5-I1` se sužava

**Slice `P5-I1` posjeduje isključivo:**

1. **Prisma schema temelj Faze 5** — pet modela i pet enuma, sa `onDelete: NoAction` i
   `onUpdate: NoAction` doslovno pinovanim na **svakoj** relaciji (D-062, Dio C.4);
2. **migration paket `003_patient_encounter_documents`** u punom obuhvatu iz `02` §29 i D-062,
   Dio B.1;
3. **schema/katalog testove paketa `003`** — uključujući ugovor iz klauzule 8 niže.

### Klauzula 2 — šta `P5-I1` ne smije ni kreirati ni mijenjati

`P5-I1` **ne smije** kreirati ni mijenjati **nijedno** od sljedećeg:

- `idempotency_keys`;
- `audit_events`;
- `outbox_events`;
- `async_jobs`;
- Faza-5 slice paketa `011`;
- Faza-5 slice paketa `013`;
- Faza-5 slice paketa `014`;
- **ijedan** runtime `GRANT`;
- **ijedan** `REVOKE`;
- **ijednu** `ENABLE`/`FORCE ROW LEVEL SECURITY` zastavicu;
- **ijednu** RLS politiku;
- **ijedan** trigger ili funkciju;
- **ijedan** aplikacijski servis, modul, rutu ni DTO.

### Klauzula 3 — Faza-5 slice paketa `011` se odgađa u `P5-I2`

**Faza-5 slice paketa `011` se uklanja iz `P5-I1` i odgađa u `P5-I2`**, gdje se njegovo
**strukturno** i **sigurnosno** izvršenje mora razriješiti **zajedno**, u istoj sigurnosnoj granici
kao Faza-5 slice paketa `013`, i **prije** bilo kojeg servisa koji se oslanja na `idempotency_keys`
ili `audit_events`.

**Vlasništvo paketa se ne mijenja** — paket `011_jobs_idempotency_outbox_audit` i dalje posjeduje
sve četiri §15 tabele (`02` §22.11). **Nijedan novi broj paketa se ne uvodi i nijedan se ne
renumeriše.** Mijenja se **isključivo tačka izvršenja unutar Faze 5**, po istom precedentu D-052
koji je i sam Faza-5 slice već koristio. **`outbox_events` i `async_jobs` se u Fazi 5 i dalje NE
kreiraju.**

**Redoslijed izvršenja migracija Faze 5 se ovom odlukom ne mijenja**: `003` → `011`-slice →
`013`-slice → `014`-slice. Mijenja se **slice u kojem `011`-slice nastaje** — iz `P5-I1` u
`P5-I2`, gdje `013`-slice i `014`-slice već jesu.

### Klauzula 4 — obavezna enumeracija koju `P5-I2` mora objaviti prije izvršenja

Za **svaku** od tabela `idempotency_keys` i `audit_events`, `P5-I2` mora **eksplicitno nabrojati**:

1. **koji paket kreira tabelu**;
2. **redoslijed izvršenja** u odnosu na grant i politiku;
3. `ENABLE ROW LEVEL SECURITY`;
4. `FORCE ROW LEVEL SECURITY`;
5. **tačna tijela politika**;
6. **tačne runtime grantove** po roli;
7. **negativne grantove** — ko **nema** koju sposobnost, uključujući `copilot_system` i `PUBLIC`;
8. **tenant predikat**;
9. **katalog tvrdnje** koje sve navedeno mehanički provjeravaju.

### Klauzula 5 — sigurnosna invarijanta, normativno

**Nijedna runtime rola ne smije dobiti `SELECT`, `INSERT` ni `UPDATE` sposobnost nad
`idempotency_keys` ili `audit_events` prije nego što je njena ograničavajuća tenant politika na
snazi.** Grant i ograničavajuća politika moraju nastati **u istoj transakciji**, po istom obrascu
koji D-062, Dio B.3, i `02` §29.4 propisuju za pet PHI tabela.

**Stanje u kojem je `audit_events` runtime-čitljiv preko granica ordinacija je kategorički
zabranjeno.**

### Klauzula 6 — mjerodavan katalog `CHECK` constrainata paketa `003`

Mjerodavni brojevi su:

| Tabela | Zamrznuti `CHECK`-ovi | Novi `CHECK`-ovi (D-062, Dio E) | Ukupno |
|---|---:|---:|---:|
| `patient_references` | **5** | 0 | **5** |
| `encounters` | **6** | 0 | **6** |
| `encounter_diagnoses` | **0** | 0 | **0** |
| `storage_objects` | **1** | 0 | **1** |
| `encounter_documents` | **8** | **3** | **11** |
| **Ukupno** | **20** | **3** | **23** |

**Svaki raniji sažetak koji navodi `18`, ili koji `encounter_documents` pripisuje `10` zamrznutih
`CHECK`-ova, superseded je kao aritmetička/dokumentaciona greška.** Zahvaćeni su: D-062, Dio B.1
(red tabele), D-062, Dio B.4, i `02` §29.7.

**Nijedan constraint se ne izmišlja da bi se došlo do broja 23.** Mjerodavan izvor su **eksplicitno
nabrojana tijela constrainata** u `02` §7.1, §7.2, §7.3, §8.1, §8.2 i §2.11.4. **Nijedno tijelo
constrainta se ovom odlukom ne mijenja, ne dodaje i ne uklanja** — mijenja se **isključivo sažeti
broj**.

### Klauzula 7 — kanonska imena svih 23 `CHECK` constrainta

Sva 23 constrainta nose **eksplicitno ime** po standardu `12` §8 — `<table>_<rule>_check` — po
precedentu `practice_settings_version_check` iz paketa `002`. **Ime je dio ugovora, ne slobodan
izbor implementatora.**

**`patient_references` — 5:**

```text
patient_references_birth_year_check
patient_references_external_patient_ref_envelope_check
patient_references_external_patient_ref_iv_length_check
patient_references_external_patient_ref_auth_tag_length_check
patient_references_encryption_metadata_check
```

**`encounters` — 6:**

```text
encounters_version_check
encounters_patient_age_check
encounters_external_encounter_ref_envelope_check
encounters_external_encounter_ref_iv_length_check
encounters_external_encounter_ref_auth_tag_length_check
encounters_encryption_metadata_check
```

**`encounter_diagnoses` — 0.** Tabela nema **nijedan** `CHECK` constraint. To je **ratifikovano
odsustvo**, ne propust: njena ograničenja su primarni ključ, dva unique constrainta i composite FK
(`02` §7.3).

**`storage_objects` — 1:**

```text
storage_objects_byte_size_check
```

**`encounter_documents` — 8 zamrznutih:**

```text
encounter_documents_page_count_check
encounter_documents_normalized_text_envelope_check
encounter_documents_normalized_text_iv_length_check
encounter_documents_normalized_text_auth_tag_length_check
encounter_documents_redacted_text_envelope_check
encounter_documents_redacted_text_iv_length_check
encounter_documents_redacted_text_auth_tag_length_check
encounter_documents_encryption_metadata_check
```

**`encounter_documents` — 3 nova (D-062, Dio E, `OD-P5-D2-6`):**

```text
encounter_documents_processing_status_check
encounter_documents_redaction_status_check
encounter_documents_redacted_artifact_consistency_check
```

### Klauzula 8 — ugovor katalog testa `CHECK` constrainata (`P5-I1`)

Katalog test paketa `003` **mora nabrojati potpun očekivani skup** `CHECK` constrainata i za
**svaki** tvrditi **najmanje**:

- `conname`;
- tabelu vlasnika (`conrelid::regclass`);
- `pg_get_constraintdef(oid)`.

**Poređenje je stroga jednakost punog skupa.** Očekivani skup i stvarni skup iz `pg_constraint`
(`contype = 'c'`, nad pet tabela Faze 5) moraju biti **identični** — nijedan višak, nijedan
manjak, nijedno odstupanje u tijelu ni u imenu.

**Postojeća tvrdnja tačnog skupa se nikada ne smije oslabiti u `contains`/`subset` poređenje.** Ta
zabrana je trajna i važi za svaku buduću izmjenu ovog testa.

Numerički total **23** smije se tvrditi **dodatno**, ali **nije primarni autoritet**. Test koji
provjerava **isključivo** `count = 23` je **nedovoljan** i ne ispunjava ovaj ugovor.

## Razlog

- **Sužavanje `P5-I1` je jedini potez koji ne stvara sposobnost bez ograničenja.** Alternativa —
  dozvoliti `P5-I1` da kreira `idempotency_keys` i `audit_events` — zahtijevala bi ili da slice
  izda grantove i politike, što mu D-062 izričito zabranjuje, ili da tabele ostanu u
  nedokumentovanom stanju do `P5-I2`. Prvo krši D-062; drugo ostavlja audit tabelu bez zapisanog
  sigurnosnog ugovora.
- **Grant disciplina koja štiti pet PHI tabela nije bila zapisana za dvije §15 tabele.** Ona se ne
  smije **pretpostaviti** — mora se **enumerisati**, i to prije izvršenja.
- **Aritmetička greška je zabilježena, a ne prećutno prepisana.** Tijelo D-062 ostaje historijski
  dokaz; ova odluka je kasniji autoritet. Prećutna izmjena broja unutar D-062 uklonila bi trag
  greške i oslabila auditabilnost.
- **Broj sam po sebi nije ugovor.** Test koji tvrdi `count = 23` prolazi i kada su dva constrainta
  zamijenjena, jedan preimenovan ili jedno tijelo oslabljeno. Zato je primarni autoritet **stroga
  jednakost punog skupa** nad `conname` + tabelom + `pg_get_constraintdef()`.

## Alternative

- **Ostaviti `011`-slice u `P5-I1` i dodati mu grant/RLS ovlaštenje** — **odbijeno.** To bi
  proširilo `P5-I1` iz čisto strukturnog u sigurnosni slice i razbilo pravilo da grant i politika
  nastaju atomično, u jednoj transakciji.
- **Prepisati broj `18` u `23` unutar tijela D-062** — **odbijeno.** Gate `P5-I0` je grešku otkrio;
  taj nalaz je dio revizijskog traga.
- **Zadržati numeričku tvrdnju `count = 23` kao primarni test** — **odbijeno**, iz razloga gore.
- **Uvesti novi broj migration paketa za `idempotency_keys` i `audit_events`** — **odbijeno.**
  D-062, `OD-P5-D2-1`, zabranjuje uvođenje i renumeraciju paketa; ova odluka to potvrđuje.

## Posljedice

- **`P5-I1` je uži nego u D-062** i sada je čisto strukturni slice: Prisma schema, paket `003`,
  schema/katalog testovi. Ništa više.
- **`P5-I2` je širi**: uz Faza-5 slice paketa `013` i `014` te `★` dokaz, nosi i Faza-5 slice
  paketa `011` **zajedno sa njegovom obaveznom sigurnosnom enumeracijom** iz klauzule 4.
- **Zavisnosti slice-ova `P5-I3` … `P5-I8` se ne mijenjaju.**
- **Redoslijed migracijskih fajlova Faze 5 se ne mijenja.**
- **Broj `CHECK` constrainata paketa `003` u tekućem autoritetu je 23** (20 + 3), sa
  `encounter_documents` = 11 ukupno.
- Katalog test paketa `003` dobija **stroži** ugovor nego što ga je D-062 zapisao.

## Security/privacy uticaj

- **Nula nove sposobnosti.** Ova odluka **ne dodjeljuje nijedan grant**, **ne kreira nijednu
  politiku** i **ne mijenja nijednu postojeću**.
- **Sigurnosna površina se sužava, ne širi:** slice koji je smio kreirati audit tabelu bez
  pripadajućeg RLS/grant ugovora to više ne smije.
- **`audit_events` dobija eksplicitnu, mehanički provjerljivu zabranu cross-practice čitljivosti**
  koja ranije nije bila zapisana.
- **Nijedna Faza-4 invarijanta nije dirnuta.** `practice_memberships_self_select` ostaje
  bajt-identična; `users` i dalje ima tačno dvije politike; grantovi Faze 4 su nepromijenjeni.
- **`★` RI-naspram-RLS dokaz u `P5-I2` ostaje tvrdi preduslov za `P5-I5`, nepromijenjen**, i
  **neuspjeh je i dalje HARD HOLD**.

## Migration/rollout

Ništa se ne izvršava u ovom gateu. Objavljeni redoslijed migracija Faze 5 ostaje `003` →
`011`-slice → `013`-slice → `014`-slice; `003` nastaje u `P5-I1`, preostala tri u `P5-I2`. Prvi
mutirajući korak Faze 5 smije nastupiti tek kroz zasebno autorizovan slice `P5-I1`.

## Test dokaz

Testovi se **ne implementiraju i ne izvršavaju u ovom gateu.** Ugovor katalog testa `CHECK`
constrainata zapisan je u klauzuli 8 i razrađen u `08` §12.9.3. Obaveze iz D-062, Dio L.2, ostaju
**nepromijenjene**.

## Supersedes

**Supersedira isključivo dvije tačke D-062:**

1. **red `P5-I1` u D-062, Dio L**, i njegov odraz u `04` §7.2 — u dijelu koji Faza-5 slice paketa
   `011` smješta u `P5-I1`;
2. **sažete `CHECK` brojeve** u D-062, Dio B.1 (red tabele `18` / `encounter_documents` `10`) i
   D-062, Dio B.4 („svih 18 zamrznutih `CHECK`-ova"), te njihov odraz u `02` §29.7.

**Sve ostalo u D-062 ostaje nepromijenjeno i na snazi**, uključujući svih četrnaest `OD-P5-D2-*`
ratifikacija, Dio C (referencijalne akcije), Dio D (odgovorni ljekar i `★` dokaz), Dio E (tri nova
`CHECK`-a), Dio I (RLS i grantovi pet PHI tabela), Dio J, Dio K i Dio M.

**D-060 i D-061 se ne diraju ni u jednoj klauzuli.** `D-OPEN-004a`, `D-OPEN-007`, `D-OPEN-009` i
`13` §19 ostaju **otvoreni i nepromijenjeni**.

## Zavisnosti

D-023, D-049, D-052, D-053, D-056, D-059, **D-060**, **D-061**, **D-062**; `02` §7.1–§7.3, §8.1,
§8.2, §2.11.4, §18.1, §22.11, §29; `04` §7.2; `08` §12.9; `12` §8.

## Granice prema budućim fazama

Naredni gate je **`P5-I1`** — prvi implementacijski slice Faze 5, u **suženom** obuhvatu iz
klauzula 1 i 2. Prije njega Faza 5 ostaje `NOT_STARTED`, a checklist **49 / 0**.

Redoslijed gateova: `P5-D1-A` → `D-060` → `P5-G1` → `D-061` → `P5-D2` → `P5-D2-B` / `D-062` →
`P5-I0` → **`P5-I0-B` / `D-063` (ovaj zapis)** → `P5-I1` → `P5-I2` … `P5-I8`.

---


# D-064 — `P5-I2` sigurnosna granica i implementacijski ugovor

- **Status:** ACCEPTED
- **Datum:** 2026-08-23
- **Tip:** vlasnička ratifikacija **sigurnosnog dizajna i implementacijskog ugovora** slicea
  `P5-I2`, plus dvije korekcije nađene u vlasničkom pregledu. **Dokumentacija isključivo.**
- **Amandman na:** **D-062, Dio I** (sažeti katalog politika/tabela) i na **preflight izvještaj
  `P5-I2`** (broj migracijskih direktorija; obrazac behavioural testa AAD trigera). Sva ostala
  tijela D-062 ostaju **nepromijenjena i na snazi**. **D-060, D-061 i D-063 se ne diraju ni u
  jednoj klauzuli.**
- **Vlasnička ratifikacija:** read-only preflight gate `P5-I2` je zaključen ishodom
  `P5_I2_PREFLIGHT_PASS_READY_FOR_OWNER_REVIEW` i vlasniku predao **devet** otvorenih
  sigurnosno-dizajnerskih pitanja. Vlasnik ih je sva riješio. Ovaj zapis je **objava** tih rješenja,
  ne novo biranje opcija. **`OWNER_DECISIONS_REQUIRED` za `P5-I2` je time `0`.**
- **Ovaj gate ne autorizuje implementaciju.** `P5-I2` **nije implementiran i nije autorizovan** —
  ni ovim zapisom, ni kanoničnošću `P5-I1`-a. Faza 5 ostaje `IN_PROGRESS`, implementacijski
  checklist Faze 5 ostaje **49 / 8**, i nijedan schema, migration, RLS, grant, trigger, Prisma
  model ni test artefakt se ovom odlukom ne kreira. **Pokretanje `P5-I2` ostaje zaseban, vlasnički
  kontrolisan gate.**

## Kontekst/problem — trigger

D-063, klauzula 4, obavezala je `P5-I2` da **prije izvršenja** objavi punu sigurnosnu enumeraciju za
`idempotency_keys` i `audit_events`. Read-only preflight gate `P5-I2` je tu enumeraciju pripremio i
pritom utvrdio da **devet** tačaka nije izvedivo iz postojećeg kanonskog autoriteta, nego traži
vlasničku odluku: vlasništvo sigurnosnih iskaza po paketu, tačni runtime grantovi obje tabele,
`practices` FK-ovi paketa `011`, obuhvat Prisma modela, **puni** post-`P5-I2` katalog politika,
vlasništvo audit indeksa, imenovanje migracijskih direktorija i dozvoljena evolucija exact-set
testova.

Uz to su u vlasničkom pregledu nađene **dvije greške** — jedna u samom preflight izvještaju
(broj migracijskih direktorija), jedna u obrascu dokazivanja AAD trigera (test koji pod
`FORCE RLS` modelom nije jednoznačan).

## Odluka

### `OD-1` — vlasništvo sigurnosnih iskaza po paketu

**Faza-5 slice paketa `013` je isključivi vlasnik** iskaza `GRANT`, `REVOKE`,
`ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` i `CREATE POLICY` za **svih sedam** tenant
tabela u obuhvatu `P5-I2`:

```text
patient_references
encounters
encounter_diagnoses
storage_objects
encounter_documents
idempotency_keys
audit_events
```

**Faza-5 slice paketa `011` kreira isključivo strukturne objekte.** Nakon `011`, a prije `013`,
kanonsko međustanje obje nove tabele je:

| Svojstvo | Vrijednost nakon `011`, prije `013` |
|---|---|
| tabela postoji | **da** |
| runtime grantovi | **nula** |
| politike | **nula** |
| `relrowsecurity` | **false** |
| `relforcerowsecurity` | **false** |

**U tom međustanju ne postoji nijedna runtime sposobnost** — tabela nije dosežna nijednoj runtime
roli, pa odsustvo RLS-a ne stvara izloženost. To je isti obrazac koji paket `003` već koristi za
pet PHI tabela (D-062, Dio B.3).

**Faza-5 migracija paketa `013` izdaje grant, `ENABLE`, `FORCE` i pripadajuće politike unutar JEDNE
transakcije.** **Nijedno commitovano međustanje ne smije izložiti runtime sposobnost bez njenog
tenant ograničenja.**

> **DOPUNA MEHANIZMA — D-065, `RULING 2`.** Zahtjev iznad ostaje **nepromijenjen u namjeri**;
> D-065 mu dodaje **izvršni mehanizam**: „JEDNA transakcija" znači **tačno jedna eksplicitna
> `BEGIN` / `COMMIT` transakcijska granica najvišeg nivoa, doslovno napisana u `migration.sql`**.
> **Atomičnost se ne smije oslanjati na pretpostavku da Prisma implicitno omotava `migration.sql`
> u transakciju.** Svi iskazi — `REVOKE`, `GRANT`, `ENABLE RLS`, `FORCE RLS`, `CREATE POLICY` —
> idu unutar te iste transakcije, **bez međukoraka `COMMIT`** i **bez transakcijski prekidajućeg
> iskaza**. Vidi D-065 i `02` §29.4a.0.

### `OD-2` — runtime grant `idempotency_keys`

`copilot_app`:

```sql
grant select on idempotency_keys to copilot_app;
grant insert on idempotency_keys to copilot_app;
grant update (response_status, response_body, locked_at, completed_at)
  on idempotency_keys to copilot_app;
```

**Bez `UPDATE` privilegije nad:**

```text
id, practice_id, user_id, idempotency_key, endpoint, request_sha256, expires_at, created_at
```

**Bez `DELETE`. Bez `TRUNCATE`. Bez blanket table-level `UPDATE`-a.**

RLS politike — tri:

```text
idempotency_keys_select
idempotency_keys_insert
idempotency_keys_update
```

Sve tri nose **kanonski tenant predikat** iz `02` §17.1, doslovno i neoslabljeno. `INSERT` nosi
`WITH CHECK`; **`UPDATE` nosi i `USING` i `WITH CHECK`**.

**`locked_at` je namjerno mutabilan** — to je concurrency/claim state polje, i bez njega
idempotency claim nema mehanizam. **`expires_at` nije mutabilan u Fazi 5** — retencija i cleanup
job nemaju konzumenta Faze 5, pa se grant ne izdaje prije svog konzumenta (D-049).

### `OD-3` — runtime grant `audit_events`

`copilot_app`:

```sql
grant select on audit_events to copilot_app;
grant insert on audit_events to copilot_app;
```

**Bez `UPDATE`. Bez `DELETE`. Bez `TRUNCATE`.** Time je append-only ugovor iz `02` §15.4 sproveden
**grantom**, koji je primarna kontrola (`02` §19.2).

RLS politike — dvije:

```text
audit_events_select
audit_events_insert
```

Tenant predikat je **kanonski i practice-scoped**. **Cross-practice čitljivost `audit_events` je
kategorički zabranjena** (D-063, klauzula 5) — negativni test je trajna regresija.

**`copilot_system` = nula runtime sposobnosti. `PUBLIC` = nula runtime sposobnosti**;
`REVOKE ALL … FROM PUBLIC` prethodi svakom grantu.

Ovo slijedi **tabelarno specifičan ugovor `02` §15.4**, ne generički matrični red `02` §18.1.

### `OD-4` — `practices` FK-ovi paketa `011`

Faza-5 slice paketa `011` deklariše **tačno dva** nova FK-a:

```text
idempotency_keys (practice_id) -> practices (id)
audit_events     (practice_id) -> practices (id)
```

Oba: **`ON DELETE NO ACTION ON UPDATE NO ACTION`**, po istom pravilu koje D-062, Dio C, propisuje za
Fazu 5.

Imena slijede repozitorijsko FK pravilo `12` §8 (`<table>_<relation>_fk`) i precedent
`patient_references_practice_fk` / `storage_objects_practice_fk` iz paketa `003`:

```text
idempotency_keys_practice_fk
audit_events_practice_fk
```

**Ne izmišlja se nijedna druga relacija.** Konkretno se **NE** deklarišu:

- `idempotency_keys.user_id → users`;
- `audit_events.actor_user_id → users`;
- bilo koji actor/service directory FK;
- bilo koja druga nova relacija.

Presedan je `02` §6.5 i §29.2: actor kolone su **aplikacijska invarijanta**, a ne FK, jer bi FK
prema `users` uveo identitetsku relaciju koju D-061 izričito ne širi.

### `OD-5` — Prisma modeli

`P5-I2A` dodaje u `schema.prisma` **tačno dva** modela:

```text
IdempotencyKey
AuditEvent
```

sa kanonskim kolonskim ugovorima iz `02` §15.2, §15.4 i D-023.

**U Fazi 5 se NE dodaju `OutboxEvent` ni `AsyncJob`** — nemaju konzumenta Faze 5 (D-062,
`OD-P5-D2-1`; D-063, klauzula 3).

**RLS, grantovi, politike, funkcije i trigeri ostaju custom migration SQL** i **ne** reprezentuju se
kao Prisma sigurnosna metadata.

Ako Prisma zahtijeva back-relacije na `Practice` za dva FK-a iz `OD-4`, one se smiju dodati kao
**Prisma-only relacije**, ali **ne smiju emitovati nijednu strukturnu izmjenu nad postojećom
tabelom `practices`** izvan ta dva eksplicitno autorizovana FK-a.

Generisani Prisma izlaz ostaje pod repozitorijskom tracking konvencijom: `db:generate` se izvršava
po potrebi, ali se **ignorisani/generisani artefakti ne dodaju u repozitorij** samo zato što ih je
generacija proizvela.

### `OD-6` — puni post-`P5-I2` sigurnosni katalog

**Kanonsko puno stanje nakon `P5-I2`:**

| Veličina | Vrijednost |
|---|---:|
| tabela sa `ENABLE` + `FORCE ROW LEVEL SECURITY` | **13** |
| ukupno politika | **23** |

Na **svih 13** tabela vrijedi `relrowsecurity = true` **i** `relforcerowsecurity = true`.

**Aritmetika broja politika:**

| Izvor | Broj |
|---|---:|
| postojeće politike Faze 3/4 | **10** |
| Faza-5 politike nad pet PHI tabela | **8** |
| `idempotency_keys` politike | **3** |
| `audit_events` politike | **2** |
| **Ukupno** | **23** |

**Ranije objavljeno „`18` politika nad `11` tabela" NIJE puni post-`P5-I2` katalog.** To je
**PHI-only / pre-paket-`011` podzbir** — tačan za skup koji opisuje, netačan kao exit tvrdnja
`P5-I2`. Historijski tekst se **zadržava gdje je historijski tačan i anotira**, ne prepisuje
(precedent D-063). Zahvaćeni su `02` §29.4, D-062, Dio I.1, i `08` §12.9.4, stavka 18.

**Nijedan implementator ne smije koristiti `18 / 11` kao exit asercija `P5-I2`.**

> **Superseded za aritmetiku — D-065, `RULING 1`; imenovani katalog kontroliše. Vidi D-065.**
> Zabrana korištenja `18 / 11` kao exit tvrdnje **ostaje na snazi**, ali je i sam total **23**
> iz tabele iznad **netačan**: PHI član je bio **8**, a imenovani katalog `02` §29.4 nabraja
> **deset** politika (`patient_references` 2, `encounters` 3, `encounter_diagnoses` 2,
> `storage_objects` 0, `encounter_documents` 3). **Kanonska aritmetika je `10 + 10 + 3 + 2 = 25`
> politika nad 13 tabela**; `P5-I2B` uvodi **15** novih. Broj tabela **13** ostaje
> **nepromijenjen i tačan**. **Nijedno ime politike se ne uklanja da bi total `23` opstao** —
> `encounters_update` i `encounter_documents_update` ostaju obavezni, `storage_objects` ostaje
> `ENABLE` + `FORCE` sa nula politika i nula grantova. Tijelo D-064 se **ne prepisuje**.

### `OD-7` — vlasništvo audit indeksa

Faza-5 **creator** migracija paketa `011` kreira i **oba** audit indeksa iz `02` §21:

```sql
create index audit_resource_idx
on audit_events(practice_id, resource_type, resource_id, occurred_at);

create index audit_actor_idx
on audit_events(practice_id, actor_user_id, occurred_at desc);
```

Paket `012` ih smije kasnije **verifikovati/pomiriti**. **Kreiranje se ne odgađa** samo zato što je
`02` §21 katalogizovan pod paketom `012` — tabela bez svojih indeksa nije dovršena, a `012` u Fazi 5
ne postoji.

### `OD-8` — imenovanje migracijskih direktorija

Nepromjenjiva konvencija za **tri buduća** Faza-5 direktorija:

```text
<timestamp>_011_jobs_idempotency_outbox_audit_phase5
<timestamp>_013_rls_policies_phase5
<timestamp>_014_immutability_triggers_phase5
```

**Timestampovi se u D-064 ne izmišljaju** — stvarni timestamp se bira **isključivo** u trenutku
autorstva pojedine migracije.

**Kanonski hronološki lanac nakon uspješnog `P5-I2` sadrži TAČNO SEDAM migracijskih direktorija:**

```text
001              extensions and roles
002              identity and practices
013              [postojeći Faza-4 slice]
003              [P5-I1]
011_phase5
013_phase5
014_phase5
```

**Broj paketa izražava vlasništvo, ne hronološki redoslijed timestampova** (D-052). Otuda `013`
prethodi `003` u lancu, a `013_phase5` slijedi nakon `011_phase5`.

**Očekivani konačni tačan broj migracija = 7.**

### `OD-9` — evolucija exact-set testova

Vlasnik **eksplicitno autorizuje** da exact-set regresijske ekspektacije evoluiraju

```text
STARI TAČAN SKUP  →  NOVI TAČAN SKUP
```

kada kanonski `P5-I2` **namjerno** mijenja stanje baze. **To NIJE slabljenje dokaza.**

**I dalje je kategorički zabranjeno:**

- `exact` → `contains`;
- `exact` → `subset`;
- `exact` → `partial`;
- uklanjanje sigurnosne invarijante zato što je postala nezgodna.

**Obavezna podjela vlasništva testova:**

**A. `phase5-schema-catalogue.security.ts`** — zadržava vlasništvo nad: Faza-5 schema katalogom ·
enumima · tabelama · FK-ovima · `CHECK`-ovima · unique/index katalogom · strukturnim ugovorom paketa
`003`. Njegovi **globalni** exact skupovi smiju se **mehanički proširiti** kada se kanonski puni
migracijski lanac promijeni.

**Tvrdnja ZERO-CAPABILITY paketa `003` ne smije jednostavno nestati.** Nakon `P5-I2` konačno stanje
baze **više nema** nula sposobnosti, pa ta tvrdnja mora ostati mehanički dokaziva kao
**package-boundary / statička** asercija **nad samom migracijom `003`**, a ne nad završnim stanjem
baze.

**B. novi `phase5-rls-grants.security.ts`** — vlasnik **steady-state** sigurnosnog kataloga i
ponašanja `P5-I2`: 13 tabela `true`/`true` · **tačno 23** politike · tačni table grantovi · tačni
column grantovi · **nula** `PUBLIC` · **nula** `copilot_system` nad Faza-5 tenant objektima ·
tenant izolacija · negativno privilegijsko ponašanje.
*(**Superseded za broj politika — D-065, `RULING 1`**: očekivana vrijednost je **tačno 25**, ne
23. Ostatak ugovora ovog fajla — 13 tabela, grantovi, negativne tvrdnje, izolacija — ostaje
**nepromijenjen**, kao i zabrana slabljenja `exact` u `contains`/`subset`/`partial` iz `OD-9`.
Vidi D-065.)*

**C. zaseban `phase5-responsible-physician-ri.security.ts`** — i dalje **preporučen**. `★` dokaz
mora ostati **vizuelno i mehanički izolovan** od ostatka sigurnosnog paketa.

## Korekcija A — broj migracijskih direktorija

Fraza iz **§11 preflight izvještaja `P5-I2`**:

```text
"migration chain (exact set, 6 files)"
```

je **superseded**.

Kanonski tačan broj nakon `P5-I2` je **7 migracijskih direktorija**, jer tekući kanonski lanac već
ima **četiri** (`001`, `002`, `013` Faza-4, `003` `P5-I1`), a `P5-I2` dodaje **tri**
(`011_phase5`, `013_phase5`, `014_phase5`).

**Historijski preflight dokaz se ne prepisuje prećutno** — korekcija se **zapisuje** (precedent
D-063).

## Korekcija B — behavioural test AAD trigera

**Sljedeći dokaz se NE traži jer je pod `P5-I2B` modelom nevaljan/dvosmislen:**

```text
"copilot_migrator mijenja id/practice_id na produkcijskoj Faza-5 tabeli nakon FORCE RLS
 i dobija trigger SQLSTATE 23514"
```

**Razlog.** Nakon `P5-I2B` je i migrator/vlasnik tabele **sam podložan `FORCE RLS`-u** i **nema
primjenjivu runtime politiku**, pa RLS može spriječiti da red uopšte dođe do `BEFORE UPDATE`
trigera. Test bi tada prolazio iz **pogrešnog razloga** ili padao bez informacije o trigeru.

**Ispravna podjela dokaza — tri odvojena testa:**

**1. Dokaz atačiranja / katalog nad produkcijom.** Mehanički se tvrdi nad **stvarnim** Faza-5
tabelama:

- **tačno 3** ciljna trigera;
- **tačna imena** (`patient_references_aad_immutable_trg`, `encounters_aad_immutable_trg`,
  `encounter_documents_aad_immutable_trg`);
- `BEFORE UPDATE`;
- `FOR EACH ROW`;
- **bez `WHEN` klauzule**;
- **tačna ciljna funkcija** `app_security.reject_aad_bound_column_change()`.

**2. Runtime prva barijera.** `copilot_app` pokušaj mutacije `id` ili `practice_id` ostaje odbijen
**grantom/RLS-om** (uskraćen column-level `UPDATE`, `02` §29.5). **Ne smije se tvrditi da to
odbijanje dokazuje izvršenje trigera** — ono dokazuje prvu barijeru, ne drugu.

**3. Ponašanje trigger funkcije.** **Isključivo na guarded disposable bazi**:

- kao migrator/test owner kreirati **test-only privremenu** tabelu sa kolonama `id` + `practice_id`;
- atačirati **istu kanonsku** funkciju `app_security.reject_aad_bound_column_change()` na tu
  privremenu tabelu;
- izmjena zaštićene kolone mora podići **SQLSTATE `23514`**;
- `UPDATE` koji ostavlja `id` i `practice_id` nepromijenjenima mora vratiti `NEW` / uspjeti;
- privremeni objekat **nestaje ili se eksplicitno rollbackuje**.

**Ne smije se dodati:** owner politika · četvrta rola · `BYPASSRLS` · trajna test tabela ·
proširenje produkcijskog granta.

Time je **druga barijera dokazana bez slabljenja `FORCE RLS`-a**.

## Higijena ACL-a funkcije paketa `014`

Ratifikuje se:

```sql
revoke all on function app_security.reject_aad_bound_column_change() from public;
```

**Nijedan direktan `EXECUTE` grant se ne izdaje** ni `copilot_app`-u ni `copilot_system`-u.
Semantika izvršenja trigera se time **ne mijenja** — trigger funkciju izvršava sistem u kontekstu
trigera, ne pozivalac kroz direktan poziv.

Funkcija ostaje: **`SECURITY INVOKER`** · `LANGUAGE plpgsql` · `RETURNS trigger` · **fiksiran
kanonski `search_path`** · **SQLSTATE `23514`** pri mutaciji zaštićene kolone (`02` §19.3).

## Očuvani ratifikovani autoritet

**Ne otvaraju se ponovo:** **D-060**, **D-061**, **D-062**, **D-063**, **`D-OPEN-004a`**.

**Ostaje na snazi, nepromijenjeno:**

- Faza-5 obuhvat paketa `011` = **isključivo** `idempotency_keys` + `audit_events`;
- **`outbox_events` i `async_jobs` ostaju odgođeni** i u Fazi 5 se ne kreiraju;
- **nijedna nova runtime rola**;
- **nijedan `BYPASSRLS`**;
- **nijedan `SECURITY DEFINER`** za dodatke `P5-I2`;
- **nijedan drugi Prisma klijent**;
- **nijedna treća `users` politika**;
- **nijedno širenje co-member identitetskog čitanja**;
- **`02` §23.4 maintenance allowlista ostaje tačno šest tabela**;
- **`P5-I2` `★` hard stop prije `P5-I5`**.

**Imenovanje politika porodice `P5-I2`** slijedi **već kanonska konkretna imena** oblika
`<table>_<command>` (`idempotency_keys_select`, `audit_events_insert`, …), **bez** preimenovanja
postojećih primijenjenih politika radi generičke `_policy` sufiks konvencije iz `12` §8.
**Nijedna postojeća politika se ne preimenuje.** `12` §8 dobija minimalnu grandfathering napomenu,
bez izmjene ijednog primijenjenog imena.

## `★` hard stop — očuvan doslovno

**`P5-I2` `★` ostaje obavezan.** Budući empirijski dokaz mora **istovremeno** ustanoviti, pod
**stvarnim** `copilot_app`, **stvarnim `FORCE RLS`**, u **istoj transakciji** i **istom tenant
kontekstu**:

**A.** `INSERT` u `encounters` koji imenuje **istoordinacijskog co-member** odgovornog ljekara
**uspijeva** kroz composite FK;

**I**

**B.** direktan `SELECT` **tog istog** `practice_memberships` reda vraća **NULA REDOVA**.

**B mora biti nula redova, ne puko `SQLSTATE 42501`.** Negativni slučajevi ostaju obavezni.

**Neuspjeh: `HARD HOLD` + ponovo se otvara `OD-P5-D2-5`.**

**Neuspjeh NE autorizuje:** `SECURITY DEFINER` · četvrtu DB rolu · drugi Prisma klijent · širenje
`users` politike · širenje `practice_memberships` · `BYPASSRLS` · denormalizaciju `displayName`-a.

## Segmentacija implementacije — ratifikovano

Ratifikuju se **četiri** buduća pod-gatea:

| Pod-gate | Obuhvat |
|---|---|
| **`P5-I2A`** | strukturni preduslov — Faza-5 slice paketa `011` (dvije tabele, dva `practices` FK-a, dva audit indeksa, dva Prisma modela) |
| **`P5-I2B`** | Faza-5 slice paketa `013` — RLS, grantovi, sigurnosni testovi |
| **`P5-I2C`** | Faza-5 slice paketa `014` — AAD trigger slice |
| **`P5-I2V`** | **`★`** RI-naspram-RLS dokaz + trajne regresije |

**Nijedan gate ne smije prećutno apsorbovati naredni:**

- **`P5-I2A` NE autorizuje `P5-I2B`**;
- **`P5-I2B` NE autorizuje `P5-I2C`**;
- **`P5-I2C` NE razrješava `★`**;
- **`P5-I5` ostaje blokiran dok `P5-I2V PASS` ne postane kanonski.**

## Prognoza checklista

**Ovim gateom se ne mijenja nijedna kućica.** Tekuće stanje ostaje **49 / 8**.

Nakon što **cijeli** `P5-I2` bude implementiran, verifikovan i kanonski, **jedini** red Faza-5
checklista koji se prognozira kao novo završen je:

```text
Schema:  RLS
```

**Prognoza: 49 / 9.**

**`Tests → cross-tenant FK` se u `P5-I2` NE smije označiti**, jer značenje tog reda uključuje i
kasnije API/`422` ponašanje koje posjeduje `P5-I5`. **Svi Services/API/facade redovi ostaju
netaknuti.**

## Razlog

- **Grant i njegovo tenant ograničenje moraju nastati atomično.** `OD-1` to pretvara iz namjere u
  vlasništvo paketa: struktura je `011`, sposobnost je `013`, i međustanje je dokazivo prazno.
- **Column-level `UPDATE` na `idempotency_keys` je uža površina od table-level `UPDATE`-a.** Blanket
  `UPDATE` bi pozivaocu dao i mutaciju `practice_id`-a i `idempotency_key`-a — dvije kolone koje su
  nosioci tenant granice i ključa deduplikacije.
- **`audit_events` bez `UPDATE`/`DELETE` je jedini oblik u kojem je audit trag vjerodostojan.**
  Grant je primarna kontrola; trigger iz `02` §19.2 je dodatna, ne zamjenska.
- **Puni katalog mora biti objavljen prije nego što ga test tvrdi.** `18 / 11` je tačan podzbir i
  netačna exit tvrdnja; bez ove korekcije bi `P5-I2B` napisao test koji **prolazi** dok dvije nove
  tabele nemaju nijednu politiku.
- **Exact-set testovi moraju smjeti da rastu.** Bez `OD-9` implementator bi imao samo dva izlaza:
  oslabiti poređenje u `contains` (zabranjeno) ili tvrditi zastarjelo stanje. Autorizovana je
  **tačno jedna** operacija: zamjena starog tačnog skupa novim tačnim skupom.
- **Behavioural test AAD trigera je morao biti razdvojen** jer pod `FORCE RLS`-om jedan iskaz ne
  može istovremeno dokazati atačiranje, runtime barijeru i logiku funkcije. Tri odvojena dokaza
  dokazuju sve tri stvari **bez** ijednog izuzetka u sigurnosnom modelu.
- **Broj `7` je zapisan jer je `6` bio broj koji bi prošao „exact set" test i sakrio jedan
  nedostajući direktorij.**

## Alternative

- **Dati paketu `011` i grantove/RLS** — **odbijeno.** To bi ga pretvorilo u sigurnosni paket i
  razbilo atomičnost grant + politika, istu koju D-063, klauzula 5, već traži.
- **Table-level `UPDATE` na `idempotency_keys`** — **odbijeno.** Uključuje `practice_id` i
  `idempotency_key`; kolone koje nose tenant granicu i ključ deduplikacije ne smiju biti mutabilne.
- **`UPDATE`/`DELETE` grant nad `audit_events` „za cleanup"** — **odbijeno.** Retencija nema
  konzumenta Faze 5, a append-only audit koji se smije mijenjati nije audit.
- **FK `audit_events.actor_user_id → users`** — **odbijeno.** Uvodi identitetsku relaciju koju
  D-061 izričito ne širi; actor kolone ostaju aplikacijska invarijanta (`02` §6.5).
- **Dodati `OutboxEvent`/`AsyncJob` „dok smo tu"** — **odbijeno.** D-062, `OD-P5-D2-1`, i D-063,
  klauzula 3; tabela se ne uvodi prije svog konzumenta.
- **Prepisati `18 / 11` unutar tijela D-062** — **odbijeno.** Historijski tekst se anotira, ne
  prepisuje (precedent D-063).
- **Odgoditi audit indekse u paket `012`** — **odbijeno.** `012` u Fazi 5 ne postoji; tabela bi
  ostala bez indeksa koje njen vlastiti katalog propisuje.
- **Preimenovati postojeće politike u `_policy` sufiks** — **odbijeno.** Deset primijenjenih
  politika Faze 3/4 nosi konkretna imena; preimenovanje bi bila migracija sigurnosnih objekata bez
  ijedne sigurnosne dobiti.
- **Jedan monolitni `P5-I2` gate** — **odbijeno.** Četiri pod-gatea sprečavaju da strukturni korak
  prećutno povuče sigurnosni, a sigurnosni prećutno razriješi `★`.

## Posljedice

- **`P5-I2` ima objavljen, potpun sigurnosni ugovor** i time ispunjava obavezu enumeracije iz
  D-063, klauzule 4, **prije** izvršenja.
- **`P5-I2` se izvršava kao četiri odvojena, pojedinačno autorizovana pod-gatea.**
- **Post-`P5-I2` katalog je 13 tabela / 23 politike / 7 migracijskih direktorija** — mjerodavno.
  *(**Superseded za broj politika — D-065, `RULING 1`**: **13 tabela / 25 politika / 7
  migracijskih direktorija**. Vidi D-065.)*
- **Novi test fajl `phase5-rls-grants.security.ts` postaje vlasnik steady-state sigurnosnog
  kataloga**; `phase5-schema-catalogue.security.ts` zadržava strukturni katalog i
  package-boundary ZERO-CAPABILITY tvrdnju nad migracijom `003`.
- **`08` §12.9.4, stavka 18 (`18` / `11`) je anotirana** i više se ne smije čitati kao exit tvrdnja
  `P5-I2`. *(**Dopunjeno — D-065, `RULING 1`**: sama stavka 18 je uz to i **aritmetički
  korigovana** — PHI politika ima **deset**, ne osam.)*
- **`02` §25.8 dobija Faza-5 korekciju obrasca dokazivanja AAD trigera.**
- **Checklist Faze 5 ostaje 49 / 8**; prognoza nakon punog `P5-I2` je **49 / 9**.

## Security/privacy uticaj

- **Nula nove sposobnosti u ovom gateu.** Ne dodjeljuje se nijedan grant, ne kreira nijedna
  politika, nijedan trigger, nijedna funkcija i ne mijenja nijedan postojeći objekat.
- **Sigurnosna površina se sužava, ne širi:** `idempotency_keys` dobija **column-level**, ne
  table-level `UPDATE`; `audit_events` dobija **isključivo** `SELECT` + `INSERT`; funkcija paketa
  `014` gubi `PUBLIC` `EXECUTE`.
- **`audit_events` cross-practice čitljivost ostaje kategorički zabranjena** i sada ima objavljen
  tačan skup politika koji to mehanički dokazuje.
- **Nijedna Faza-3/4 invarijanta nije dirnuta.** `practice_memberships_self_select` ostaje
  bajt-identična; `users` i dalje ima tačno dvije politike; deset postojećih politika se ne
  preimenuje i ne mijenja.
- **`FORCE RLS` se ne slabi ni u jednom testu** — korekcija B dokazuje trigger logiku na
  privremenom objektu disposable baze, bez ijednog izuzetka nad produkcijskim tabelama.
- **`★` RI-naspram-RLS dokaz ostaje tvrdi preduslov za `P5-I5`, doslovno nepromijenjen**, i
  **neuspjeh je i dalje `HARD HOLD`**.

## Migration/rollout

**Ništa se ne izvršava u ovom gateu.** Nijedna migracija se ne kreira, ne imenuje konkretnim
timestampom i ne primjenjuje; **nijedna baza se ne kontaktira.**

Objavljeni redoslijed izvršenja Faze 5 ostaje `003` → `011`-slice → `013`-slice → `014`-slice.
Prvi mutirajući korak `P5-I2` smije nastupiti tek kroz zasebno autorizovan pod-gate **`P5-I2A`**.

## Test dokaz

**Testovi se ne implementiraju i ne izvršavaju u ovom gateu.** Ugovori su zapisani u `OD-9`
(vlasništvo i evolucija exact-set testova) i u korekciji B (trodijelni dokaz AAD trigera), a
razrađeni u `08` §12.9.4. Obaveze iz D-062, Dio L.2, i D-063, klauzule 8, ostaju **nepromijenjene**.

## Supersedes

**Supersedira tačno tri stvari:**

1. **sažetak „`18` politika nad `11` tabela"** kao **puni post-Faza-5/post-`P5-I2` katalog** —
   u `02` §29.4, D-062, Dio I.1, i `08` §12.9.4, stavka 18. Zadržava se kao **PHI-only podzbir**;
2. **frazu §11 preflight izvještaja `P5-I2` „migration chain (exact set, 6 files)"** — tačan broj
   je **7**;
3. **obrazac behavioural testa AAD trigera** koji je tražio `SQLSTATE 23514` od migratora nad
   produkcijskom Faza-5 tabelom pod `FORCE RLS`-om (`02` §25.8, za Fazu 5).

**Sve ostalo u D-062 i D-063 ostaje nepromijenjeno i na snazi.** **D-060 i D-061 se ne diraju ni u
jednoj klauzuli.** `D-OPEN-004a`, `D-OPEN-007`, `D-OPEN-009` i `13` §19 ostaju **otvoreni i
nepromijenjeni**.

## Zavisnosti

D-023, D-025, D-033, D-038, D-047, D-048, D-049, D-052, D-053, D-056, D-059, **D-060**, **D-061**,
**D-062**, **D-063**; `02` §6.5, §15.2, §15.4, §17.1, §18.1, §19.2, §19.3, §21, §22.11, §22.13,
§22.14, §23.4, §25.8, §29; `04` §7.2, §7.5, §7.6a; `08` §12.9; `12` §8.

## Granice prema budućim fazama

Naredni gate je **`P5-I2A`** — strukturni preduslov `P5-I2`, i **on se ovim zapisom NE autorizuje**;
autorizacija je zaseban vlasnički potez. Do tada `P5-I2` ostaje **NOT IMPLEMENTED**, paket `011`
**NOT IMPLEMENTED**, Faza-5 RLS/grantovi **NOT IMPLEMENTED**, Faza-5 AAD trigeri paketa `014`
**NOT IMPLEMENTED**, **`★` NOT EXECUTED**, a **`P5-I5` neautorizovan**.

> **ANOTACIJA STATUSA — D-066 (2026-08-25); pasus iznad se ne prepisuje.** Nabrajanje
> „**NOT IMPLEMENTED**" je **tačan historijski zapis stanja na dan D-064 (2026-08-23)** i ostaje
> nepromijenjeno. **Dvije od tih stavki su u međuvremenu ispunjene zasebno autorizovanim
> pod-gateovima:** paket `011` je kanonski od `P5-I2A` (PR #33), a **Faza-5 RLS/grantovi su
> kanonski od `P5-I2B`** (PR #36, merge `0e4d113f0eedddcd2db890180767768c5b422264`; D-066).
> **Ostatak pasusa ostaje doslovno na snazi:** Faza-5 AAD trigeri paketa `014` (`P5-I2C`) su
> **NOT IMPLEMENTED** i **NOT AUTHORIZED**, **`★` je NOT EXECUTED**, **`P5-I5` je neautorizovan**,
> i **`P5-I2` u cjelini nije zatvoren**.

> **ANOTACIJA STATUSA — D-067 (2026-08-26); ni pasus ni anotacija iznad se ne prepisuju.**
> Rečenica „Faza-5 AAD trigeri paketa `014` (`P5-I2C`) su **NOT IMPLEMENTED** i
> **NOT AUTHORIZED**" je **tačan historijski zapis stanja na dan D-066 (2026-08-25)** i ostaje
> nepromijenjena. **Ona više ne opisuje tekuće stanje.** Vlasnik je nakon D-066 **zasebnim
> potezom** autorizovao pod-gate `P5-I2C`; implementacija je izvedena commitom
> `fc6b38cea354f680f88ff9bf75d5e68a84538740`, nezavisno auditirana ishodom
> `P5_I2C_I_A_PASS_READY_FOR_PUBLICATION` i objavljena kroz **PR #38**, merge SHA
> `46e65a7819e29e6e7bdb9cee6ec71bd90c0eb2ee`. **Sve tri Faza-5 migracije su time kanonske; broj
> migracijskih direktorija = 7.** **Ostatak pasusa ostaje doslovno na snazi:** **`★` je
> NOT EXECUTED**, **`P5-I5` je neautorizovan**, i **`P5-I2` u cjelini nije zatvoren** — vidi
> **D-067**.

Redoslijed gateova: `P5-D1-A` → `D-060` → `P5-G1` → `D-061` → `P5-D2` → `P5-D2-B` / `D-062` →
`P5-I0` → `P5-I0-B` / `D-063` → `P5-I1` → `P5-I1-D` → `P5-I2` preflight →
**`P5-I2-D` / `D-064` (ovaj zapis)** → `P5-I2A` → `P5-I2B` → `P5-I2C` → `P5-I2V` → `P5-I3` …
`P5-I8`.

---


# D-065 — `P5-I2B` pomirenje sigurnosnog ugovora

- **Status:** ACCEPTED / OWNER-RATIFIED
- **Datum:** 2026-08-25
- **Tip:** vlasnički ratifikovana **governance korekcija** sigurnosnog ugovora pod-gatea
  `P5-I2B`. **Dokumentacija isključivo.**
- **Amandman na:** **D-062, Dio I.1** (izvedeni zbir politika) i **D-064, `OD-1` i `OD-6`**
  (izvedeni total politika; mehanizam atomičnosti). Sva ostala tijela D-062 i D-064 ostaju
  **nepromijenjena i na snazi**. **D-060, D-061 i D-063 se ne diraju ni u jednoj klauzuli.**
- **Ovaj gate ne autorizuje implementaciju.** `P5-I2B` **nije implementiran i nije autorizovan** —
  ni ovom odlukom, ni kanoničnošću `P5-I2A`-a. Faza 5 ostaje `IN_PROGRESS`, implementacijski
  checklist Faze 5 ostaje **49 / 8**, i nijedna migracija, schema, RLS, grant, politika, Prisma
  model ni izvršna test asercija se ovom odlukom ne kreira i ne mijenja.

> **ANOTACIJA STATUSA — D-066 (2026-08-25); tijelo D-065 se ne prepisuje.** Formulacija
> „`P5-I2B` nije implementiran i nije autorizovan" je **tačan historijski zapis stanja na dan
> D-065** i ostaje nepromijenjena kao takva. **Ona više ne opisuje tekuće stanje.** Vlasnik je
> nakon D-065 autorizovao pod-gate `P5-I2B`; implementacija je izvedena commitom
> `6efee207c9ca52a22ca2cdeb97773832931711e7`, nezavisno auditirana ishodom
> `P5_I2B_I_A_PASS_READY_FOR_PUBLICATION` i objavljena kroz **PR #36**, merge SHA
> `0e4d113f0eedddcd2db890180767768c5b422264`. **Autorizacija je time potrošena.** Tekući status
> `P5-I2B` je `IMPLEMENTED` / `AUDITED` / `MERGED` / `CANONICAL` / **formalno zatvoren**, po
> D-066. **Checklist Faze 5 i dalje stoji na 49 / 8** — vidi D-066, `RULING C`. `P5-I2C`,
> `P5-I2V` / `★`, `P5-I5` i `P5-I2` u cjelini **ostaju nepromijenjeni** i otvoreni.

## Kontekst/problem — trigger

Read-only **Security Boundary Preflight** pod-gatea `P5-I2B` završio je ishodom **`HOLD`**, sa
razlogom **`B-1` = `POLICY_CATALOGUE_ARITHMETIC_INCONSISTENT`**.

**Nalaz 1 — unutrašnja kontradikcija kataloga politika.** `02` §29.4 i D-062, Dio I.1, nabrajaju
**deset** imenovanih Faza-5 PHI politika, a njihov vlastiti sažetak u istom odjeljku tvrdi
**osam**. Iz te greške izveden je i `18 / 11`, a potom i puni total **23** iz D-064, `OD-6`
(`10 + 8 + 3 + 2`). Katalog imena i katalog brojeva **nisu se poklapali**, pa `P5-I2B` nije imao
jednoznačnu exit tvrdnju.

**Nalaz 2 — mehanizam atomičnosti nije bio izvršno jednoznačan.** D-064, `OD-1`, traži da grant,
`ENABLE`, `FORCE` i politike nastanu „unutar JEDNE transakcije", ali **ne propisuje kako** se ta
jedna transakcija postiže. Nijedna postojeća migracija repozitorija (`001`, `002`, `013`, `003`,
`011_phase5`) ne sadrži eksplicitan `begin;` / `commit;` — sve se oslanjaju na implicitno
ponašanje migration runtimea. Za **sigurnosnu** migraciju to je neprihvatljiva pretpostavka:
sigurnosna tvrdnja ne smije zavisiti od neopisanog ponašanja alata.

Vlasnik je oba nalaza riješio. Ovaj zapis je **objava** tih rješenja.

## Odluka

### `RULING 1` — katalog politika

- **Imenovani katalog politika je autoritativan.** Brojevi se ispravljaju prema imenima; **imena
  se nikada ne uklanjaju da bi zbir odgovarao.**
- **Faza-5 PHI politika ima 10, ne 8.**
- **`P5-I2B` uvodi 15 novih politika.**
- **Puni post-`P5-I2B` total je 25 politika** nad **13** tabela sa `ENABLE` + `FORCE`.
- **`storage_objects` ostaje `ENABLE` + `FORCE ROW LEVEL SECURITY` sa nula politika i nula
  runtime grantova.**
- **`encounters_update` ostaje obavezna.**
- **`encounter_documents_update` ostaje obavezna.**
- **Nijedna sigurnosna sposobnost se ne uklanja radi zastarjelog totala.**

**Obavezna aritmetika:**

```text
  10  postojeće politike Faze 3/4
+ 10  Faza-5 PHI politike
+  3  idempotency_keys
+  2  audit_events
= 25  ukupno
```

**Deset Faza-5 PHI politika:**

```text
patient_references_select
patient_references_insert

encounters_select
encounters_insert
encounters_update

encounter_diagnoses_select
encounter_diagnoses_insert

encounter_documents_select
encounter_documents_insert
encounter_documents_update
```

**`storage_objects` namjerno ima nula politika.**

**Dodatnih pet politika `P5-I2B`:**

```text
idempotency_keys_select
idempotency_keys_insert
idempotency_keys_update

audit_events_select
audit_events_insert
```

**Posljedice za izvedene tvrdnje:**

- historijske i tekuće izvedene tvrdnje „**8** PHI politika" su **superseded**;
- historijske i tekuće izvedene tvrdnje „**23** politike nakon `P5-I2`" su **superseded**;
- historijska `18 / 11` PHI-podzbir aritmetika **nije valjana puna exit tvrdnja `P5-I2`** —
  ta zabrana iz D-064, `OD-6`, **ostaje na snazi**;
- **tenant predikat se ne mijenja** — ostaje doslovno `02` §17.1, neoslabljen;
- broj tabela **13** ostaje **nepromijenjen i tačan**.

### `RULING 2` — eksplicitna transakcija

- **Faza-5 migracija paketa `013` (`P5-I2B`) mora biti jedna eksplicitno transakcijska
  PostgreSQL migracija.**
- Mora sadržavati **tačno jednu transakcijsku granicu najvišeg nivoa**:

```sql
begin;

-- svi sigurnosni iskazi P5-I2B

commit;
```

- **Atomičnost se NE smije oslanjati na pretpostavku da Prisma migration runtime projekta
  implicitno omotava `migration.sql` u transakciju.**
- **Sve** operacije `P5-I2B` pripadaju toj jednoj eksplicitnoj transakciji, za **svih sedam**
  tabela (`patient_references`, `encounters`, `encounter_diagnoses`, `storage_objects`,
  `encounter_documents`, `idempotency_keys`, `audit_events`):
  - `REVOKE`
  - `GRANT`
  - `ENABLE ROW LEVEL SECURITY`
  - `FORCE ROW LEVEL SECURITY`
  - `CREATE POLICY`
- **Nijedan međukoračni `COMMIT`.**
- **Nijedan transakcijski prekidajući iskaz.**
- Ovo je **izvršni mehanizam** obaveze atomičnosti iz D-064, `OD-1`; **namjeravana sigurnosna
  granica se ne mijenja.**
- **Ovaj ruling ne autorizuje kreiranje te migracije u ovom gateu.**
- **Ovaj ruling se ne proširuje u opštu projektnu politiku transakcijskog omotavanja migracija** —
  vrijedi **specifično** za Faza-5 sigurnosnu migraciju paketa `013`.

## Očuvanje historijskog zapisa

**Ranija aritmetika `8` / `18` / `23` ostaje u Decision Logu kao historijski dokaz superseded
izvođenja i ne smije se tiho izbrisati.** Tijela D-062 i D-064 se **ne prepisuju**; anotiraju se
supersession napomenom koja pokazuje na D-065, po precedentu D-063.

Anotirani lokusi:

- **D-062, Dio I.1** — „Ukupno **8** novih politika … **18** politika nad **11** tabela";
- **D-062, `Posljedice`** — „Broj politika raste sa 10 na 18 …";
- **D-064, `OD-1`** — „unutar JEDNE transakcije" (dopuna mehanizma, `RULING 2`);
- **D-064, `OD-6`** — tabela `10 + 8 + 3 + 2 = 23`;
- **D-064, `OD-9`, dio B** — „tačno **23** politike" kao ugovor `phase5-rls-grants.security.ts`;
- **D-064, `Posljedice`** — „13 tabela / 23 politike / 7 migracijskih direktorija".

**Historijski vlasnički zapis se suštinski ne mijenja** — mijenja se samo ono što je **tekuća
normativna tvrdnja** u dokumentima tekućeg autoriteta (`02`, `04`, `05`, `08`).

## Neizvršni komentari u testovima

Preflight je utvrdio zastarjelu formulaciju „eight policies" u neizvršnim komentarima:

```text
apps/api/test/phase3-schema-catalogue.security.ts
apps/api/test/phase5-schema-catalogue.security.ts
```

- **Neizvršna zastarjela komentarska formulacija u testovima je podređena korigovanoj kanonskoj
  dokumentaciji.** Kanonski broj je **deset**.
- **Nijedna izvršna asercija ovim gateom nije promijenjena.** Izvršne asercije tih fajlova tvrde
  **nula** politika nad pet PHI tabela i **tačno deset** politika u cijeloj šemi — što je i dalje
  **tačno zatečeno stanje** nakon `P5-I2A`.
- **Izvršne exact-set asercije evoluiraju isključivo u zasebno autorizovanom implementacijskom
  gateu `P5-I2B`, pod D-064, `OD-9`** — **stari tačan skup → novi tačan skup**, bez slabljenja.
  **`exact` → `contains`/`subset`/`partial` ostaje kategorički zabranjeno.**

## Obuhvat

D-065:

- **rješava** aritmetički bloker preflighta `P5-I2B`;
- **rješava** dvosmislenost mehanizma transakcije;
- **NE autorizuje** implementaciju `P5-I2B`;
- **NE kreira** nijednu migraciju;
- **NE ispunjava** `P5-I2B`;
- **NE autorizuje** `P5-I2C`;
- **NE izvršava i ne slabi** `P5-I2V` / **`★`**;
- **NE odblokira** `P5-I5`;
- **NE zatvara** `P5-I2` ni Fazu 5.

## Naredni obavezni gate

Nakon što D-065 postane kanonski:

**Security Boundary Preflight `P5-I2B` mora se ponoviti** nad novim kanonskim `main`-om.

**Samo** ishod

```text
P5_I2B_PREFLIGHT_PASS_READY_FOR_OWNER_AUTHORIZATION
```

smije voditi u **zaseban** vlasnički autorizacijski gate implementacije.

## Razlog

- **Katalog imena je jedina provjerljiva istina.** Broj politika je izvedena veličina; ime
  politike je objekat u `pg_policies`. Kada se to dvoje razilazi, ispravlja se broj — jer
  suprotan smjer znači **brisanje sigurnosne sposobnosti radi računske ljepote**. `10` PHI
  politika je ono što `02` §29.4 stvarno nabraja i što `P5-I2B` stvarno mora kreirati.
- **Netačan exit broj je sigurnosni rizik, ne kozmetika.** Exact-set test koji očekuje `23`
  pao bi nad ispravnom implementacijom sa `25`, i pritisak bi bio da se **implementacija**
  prilagodi testu — tj. da se izbriše `encounters_update` ili `encounter_documents_update`.
  Korekcija prije implementacije uklanja taj pritisak.
- **Sigurnosna tvrdnja ne smije zavisiti od nedokumentovanog ponašanja alata.** „Jedna
  transakcija" bez eksplicitnog `begin;` / `commit;` znači da atomičnost garantuje **Prisma**,
  a ne migracija. Ako se to ponašanje promijeni verzijom, opcijom ili prvim iskazom koji ne
  može u transakcionom bloku, dobija se commitovano međustanje u kojem runtime rola ima `GRANT`
  bez politike koja ga ograničava — **tačno stanje koje D-064, `OD-1`, zabranjuje**. Eksplicitan
  blok čini garanciju svojstvom fajla, čitljivim u code reviewu.
- **Precedent postoji u repozitoriju.** Maintenance protokol `02` §23.4 (D-048) već propisuje
  eksplicitnu `begin;` … `commit;` granicu za `NO FORCE` → DML → `FORCE` sekvencu, iz istog
  razloga.

## Alternative

- **Ukloniti `encounters_update` i `encounter_documents_update` da bi PHI broj bio 8** —
  **odbijeno**. Obje su zahtijevane funkcionalnošću Faze 5 (`PATCH /encounters`, arhiviranje
  dokumenta); bez njih runtime rola ima `UPDATE` grant bez ograničavajuće politike ili
  funkcionalnost uopšte ne radi. Prilagođavanje sigurnosti zastarjelom broju je **anti-obrazac**.
- **Zadržati `23` i tretirati razliku kao „dokumentacionu nepreciznost"** — **odbijeno**.
  Razlika bi se materijalizovala kao pad exact-set testa u implementacijskom gateu, gdje je
  najskuplja i najopasnija.
- **Osloniti se na implicitno transakcijsko omotavanje Prisme** — **odbijeno**. Vidi `Razlog`.
- **Proglasiti eksplicitni `BEGIN`/`COMMIT` opštom politikom za sve migracije** — **odbijeno u
  ovom gateu**. Postojeće migracije su primijenjene i ne smiju se mijenjati (`AGENTS.md` §5.1);
  opšta politika je zaseban zahvat sa vlastitim dokazom. D-065 obavezuje **samo** paket `013`
  Faze 5.

## Posljedice

- **`P5-I2B` ima jednoznačan, unutrašnje konzistentan sigurnosni ugovor** — po imenima i po
  brojevima.
- **Očekivani exact-set testa steady-statea je 25 politika nad 13 tabela**, a `P5-I2B` uvodi
  **15** novih.
- **Migracija paketa `013` Faze 5 mora nositi eksplicitan `begin;` / `commit;` blok.**
- **Preflight `P5-I2B` se mora ponoviti**; njegov `HOLD` **nije** razriješen samim postojanjem
  ove odluke, nego tek ponovljenim `PASS`-om nad kanonskim `main`-om.
- **Checklist Faze 5 ostaje 49 / 8.** Odluka o pomirenju **nije** završena implementacijska
  stavka i **ne smije** naduvati zvaničnu aritmetiku checklista.
- **`P5-I2A` ostaje kanonski i nedirnut.**

## Security/privacy uticaj

- **Nula nove sposobnosti.** Odluka ne dodaje nijedan grant, nijednu rolu, nijednu politiku i
  nijedan izuzetak.
- **Sigurnosna površina se povećava u odnosu na zastarjeli zapis, ne smanjuje** — dvije politike
  koje su ranije nedostajale u zbiru (`encounters_update`, `encounter_documents_update`) time su
  **potvrđene kao obavezne**, umjesto da tiho ispadnu.
- **`storage_objects` ostaje dokazivo nedosežan** — `ENABLE` + `FORCE`, nula politika, nula
  grantova, nula redova.
- **Tenant predikat ostaje neoslabljen** i **cross-practice čitljivost `audit_events` ostaje
  kategorički zabranjena** (D-063, klauzula 5).
- **Eksplicitna transakcija uklanja jedini put do commitovanog stanja „grant bez politike".**

## Migration/rollout

**Nijedna migracija se ovom odlukom ne kreira, ne mijenja i ne izvršava.** Nijedna baza se ne
kontaktira. Kanonski lanac ostaje na **pet** primijenjenih direktorija; očekivani konačan broj
nakon punog `P5-I2` ostaje **sedam** (D-064, `OD-8`, nepromijenjen).

## Test dokaz

**Testovi se ovim gateom ne implementiraju, ne mijenjaju i ne izvršavaju.** Korigovani ugovori
zapisani su u `08` §12.9.4, stavke 18, 26d i 26e, i u `02` §29.4a. Njihova izvršna realizacija
pripada zasebno autorizovanom `P5-I2B`.

## Supersedes

- **D-062, Dio I.1** — izvedeni zbir „8 novih politika / 18 nad 11 tabela" (aritmetika);
- **D-062, `Posljedice`** — „broj politika raste sa 10 na 18";
- **D-064, `OD-6`** — total `23` i član `8 PHI` (broj tabela **13** ostaje na snazi);
- **D-064, `OD-9`, dio B** — „tačno 23 politike" → **tačno 25**;
- **D-064, `Posljedice`** — „13 tabela / 23 politike".

**Dopunjuje bez ukidanja:** **D-064, `OD-1`** — zahtjev jedne transakcije ostaje, dobija
eksplicitan mehanizam.

**Ostaje na snazi bez izmjene:** D-064 `OD-2`, `OD-3`, `OD-4`, `OD-5`, `OD-7`, `OD-8`, `OD-9`
(zabrana slabljenja), obje korekcije D-064, `★` hard stop, segmentacija na četiri pod-gatea,
i cjelokupni D-060, D-061, D-063.

## Zavisnosti

- **D-062** — schema i dizajn politika Faze 5;
- **D-063** — obaveza enumeracije prije izvršenja;
- **D-064** — sigurnosna granica i implementacijski ugovor `P5-I2`;
- **D-048** — precedent eksplicitne transakcijske granice u sigurnosnom SQL-u;
- **D-050** — kanonski workflow autorstva migracija.

## Granice prema budućim fazama

- **`P5-I2B` ostaje `NOT IMPLEMENTED` i `NOT AUTHORIZED`.**
- **`P5-I2C` ostaje `NOT IMPLEMENTED` i `NOT AUTHORIZED`.**
- **`P5-I2V` / `★` ostaje `NOT EXECUTED`.**
- **`P5-I5` ostaje `BLOCKED`** dok `P5-I2V PASS` ne postane kanonski.
- **`P5-I2` nije zatvoren; Faza 5 nije `DONE`.**

> **ANOTACIJA STATUSA — D-066 (2026-08-25); lista iznad se ne prepisuje.** Prva stavka je
> **historijska granica na dan D-065** i ostaje zapisana kao takva. **Superseded je isključivo u
> toj jednoj stavci:** `P5-I2B` je danas **kanonski i formalno zatvoren** (D-066; PR #36, merge
> `0e4d113f0eedddcd2db890180767768c5b422264`). **Preostale četiri stavke ostaju doslovno na
> snazi:** `P5-I2C` = `NOT IMPLEMENTED` / `NOT AUTHORIZED`; `P5-I2V` / `★` = `NOT EXECUTED`;
> `P5-I5` = `BLOCKED`; `P5-I2` nije zatvoren i Faza 5 nije `DONE`.

---

# D-066 — `P5-I2B` post-merge pomirenje implementacije i formalno zatvaranje pod-gatea

- **Status:** ACCEPTED / OWNER-RATIFIED
- **Datum:** 2026-08-25
- **Tip:** vlasnički ratifikovano **činjenično pomirenje** governance dokumentacije sa **već
  kanonskom** implementacijom pod-gatea `P5-I2B`, i **formalno zatvaranje** tog pod-gatea.
  **Dokumentacija isključivo.**
- **Amandman na:** **statusne tvrdnje** — ne na sigurnosni dizajn. Sigurnosni ugovor iz **D-064**
  i njegova korekcija iz **D-065** ostaju **doslovno na snazi i nepromijenjeni**. **D-060, D-061,
  D-062 i D-063 se ne diraju ni u jednoj klauzuli.**
- **Ova odluka NE uvodi nijedan novi sigurnosni dizajn.** Ne dodaje se nijedan grant, nijedna
  rola, nijedna politika, nijedan trigger, nijedna funkcija i nijedan izuzetak. Ne kreira se i ne
  mijenja se nijedna migracija, schema, Prisma model ni izvršna test asercija. **Nijedna baza nije
  kontaktirana.**
- **Ova odluka NE autorizuje nijedan naredni gate.** `P5-I2C` i `P5-I2V` / `★` ostaju
  neautorizovani.

## Kontekst/problem — trigger

D-065 je zatvorio dva blokera preflighta `P5-I2B` i izričito zabilježio da **ne autorizuje
implementaciju**. Vlasnik je nakon toga, **zasebnim potezom**, autorizovao pod-gate `P5-I2B`,
implementacija je izvedena, **nezavisno auditirana** i **objavljena u kanonski `main`**.

Time je nastao **statusni drift**: kanonska dokumentacija je na više mjesta i dalje tvrdila
`P5-I2B` = `NOT IMPLEMENTED` / `NOT AUTHORIZED`, dok je `P5-I2B` već bio kanonski. Te tvrdnje su
bile tačne **na dan svog zapisa**, a **netačne kao tekući status**.

**Ovaj zapis ne bira nijednu opciju.** On **konstatuje činjenice** i uklanja drift.

## Odluka

### `RULING A` — `P5-I2B` je kanonski i formalno zatvoren

**`P5-I2B` = `IMPLEMENTED` / `AUDITED` / `MERGED` / `CANONICAL` / `FORMALLY CLOSED`.**

**Vlasnička autorizacija pod-gatea `P5-I2B` je potrošena** dovršenom kanonskom implementacijom.
Formulacije „implementiran na grani", „čeka publikaciju" i „nije autorizovan" **više se ne smiju
koristiti kao tekući status `P5-I2B`**.

**Kanonski dokaz:**

```text
IMPLEMENTATION COMMIT:  6efee207c9ca52a22ca2cdeb97773832931711e7
                        feat(db): implement P5-I2B RLS security boundary
INDEPENDENT AUDIT:      P5_I2B_I_A_PASS_READY_FOR_PUBLICATION
PULL REQUEST:           #36   (MERGED)
MERGE COMMIT:           0e4d113f0eedddcd2db890180767768c5b422264
PARENT 1:               3cfbf5ea7909998c0ea8d24b9ccacd74500ae897
PARENT 2:               6efee207c9ca52a22ca2cdeb97773832931711e7
CANONICAL MIGRATION:    apps/api/prisma/migrations/
                        20260825013452_013_rls_policies_phase5/migration.sql
CANONICAL OWNER TEST:   apps/api/test/phase5-rls-grants.security.ts
```

**Implementacija je nezavisno auditirana prije publikacije, a auditirani commit je merged
nepromijenjen.** `6efee207` je `parent 2` merge commita `0e4d113f` i njegov je predak — merge nije
uveo nijednu izmjenu preko auditiranog stanja.

### `RULING B` — kanonsko post-`P5-I2B` sigurnosno stanje

Sljedeće je **zatečeno kanonsko stanje**, ne ciljni katalog:

| Svojstvo | Vrijednost |
|---|---|
| migracijskih direktorija | **6** |
| novih politika u `P5-I2B` | **15** |
| ukupan katalog politika | **25** (`10 + 10 + 3 + 2`) |
| tenant tabela pod `ENABLE` + `FORCE RLS` | **13 / 13** |
| `§23.4` maintenance allowlista | **6** tabela — **neproširena** |
| aplikacijski izvor / `schema.prisma` | **nula izmjena** |

- **`storage_objects` ostaje `ENABLE` + `FORCE ROW LEVEL SECURITY` sa nula politika i nula
  runtime grantova** — default-deny je sigurnosna kontrola, ne propust.
- **Tačna ograničena `UPDATE` površina ostaje kako je ratifikovana:** column-level `UPDATE` nad
  `encounters` (12 kolona), `encounter_documents` (**isključivo** `archived_at`) i
  `idempotency_keys` (`response_status`, `response_body`, `locked_at`, `completed_at`). **Nijedan
  table-level `UPDATE`, nijedan `DELETE`, nijedan `TRUNCATE`, nijedna sekvencijalna privilegija.**
- **`PUBLIC` ima nula runtime sposobnosti** nad svih sedam tabela `P5-I2B` — `REVOKE ALL … FROM
  PUBLIC` prethodi **svakom** grantu.
- **`copilot_system` ima nula runtime sposobnosti** nad tih sedam tabela.
- **Statički dokaz zero-capability granice paketa `003` je očuvan.**
- **Statički dokaz zero-capability granice paketa `011` je očuvan.**
- **Tenant predikat `02` §17.1 je unesen doslovno i neoslabljeno** u svih 15 politika.

**Atomičnost.** Faza-5 migracija paketa `013` nosi **kanonski eksplicitan transakcijski mehanizam
najvišeg nivoa koji D-065, `RULING 2`, zahtijeva** — **jedan** `BEGIN` i **jedan** `COMMIT`
doslovno napisani u `migration.sql`, sa svim `REVOKE`, `GRANT`, `ENABLE RLS`, `FORCE RLS` i
`CREATE POLICY` iskazima unutar te iste transakcije, bez međukoraka `COMMIT`. **Atomičnost je
svojstvo fajla, ne pretpostavka o migration runtimeu.**

### `RULING C` — checklist Faze 5 ostaje **49 / 8**

**Nijedna kućica se ovim zatvaranjem ne označava.**

Jedini Faza-5 red koji `P5-I2` uopšte može označiti je **`Schema → RLS`**, a njegov **ratifikovani
kriterij prihvatanja** je — doslovno, D-064, *Prognoza checklista*, potvrđeno anotacijom
`P5-I2A-C` — **kompletan, verifikovan i kanonski `P5-I2`**, a ne pojedinačni pod-gate. `P5-I2C` i
`P5-I2V` nisu izvršeni, pa **antecedent nije ispunjen** i red ostaje **neoznačen**.

**`Tests → cross-tenant FK` se u `P5-I2` ne smije označiti** (D-064) — značenje tog reda uključuje
i kasnije API/`422` ponašanje koje posjeduje `P5-I5`. **Svi Services/API/facade redovi ostaju
netaknuti.**

**Zvanična aritmetika, prebrojana iz stvarnog stanja kućica u `05` §6:**

```text
ukupno redova      49
označeno           8
neoznačeno         41
notacija           49 / 8   (nepromijenjeno)
```

**Prognoza nakon punog `P5-I2` ostaje 49 / 9** i **ostaje prognoza**.

### `RULING D` — očuvanje historijskog zapisa

**Historijske tvrdnje „`P5-I2B` NOT IMPLEMENTED" i „`P5-I2B` NOT AUTHORIZED" unutar ranijih,
datiranih vlasničkih odluka su historijski tačne i ne smiju se prepisivati.** Tijela **D-064** i
**D-065** se **ne mijenjaju**; dobijaju **kratku statusnu anotaciju** koja pokazuje na D-066, po
precedentu D-063 i D-065.

**Tekuće normativne sekcije izvan historijskih zapisa odluka moraju odražavati novo kanonsko
stanje** — `02`, `04`, `05` i `08`.

## Obuhvat

D-066:

- **konstatuje** kanoničnost i formalno zatvaranje `P5-I2B`;
- **pomiruje** tekuće statusne tvrdnje `02`, `04`, `05` i `08`;
- **NE mijenja** nijednu klauzulu sigurnosnog ugovora D-064 / D-065;
- **NE uvodi** nijedan novi sigurnosni dizajn;
- **NE označava** nijednu kućicu checklista;
- **NE autorizuje** `P5-I2C`;
- **NE izvršava i ne slabi** `P5-I2V` / **`★`**;
- **NE odblokira** `P5-I5`;
- **NE zatvara** `P5-I2` ni Fazu 5;
- **NE dokumentuje** paket `014` kao implementiran.

## Razlog

- **Potrošena autorizacija mora biti vidljiva kao potrošena.** Dokumentacija koja i dalje tvrdi
  „nije autorizovan" nad već kanonskom sigurnosnom migracijom stvara dvije podjednako opasne
  greške: ponovno „autorizovanje" već izvršenog posla, i tretiranje kanonske sigurnosne granice
  kao da još ne postoji.
- **Zatvaranje pod-gatea nije zatvaranje roditelja.** `P5-I2B` je jedan od **četiri** pod-gatea.
  D-064 izričito zabranjuje da gate prećutno apsorbuje naredni; formalno zatvaranje `P5-I2B`
  zato **mora** biti zapisano zajedno sa nepromijenjenim statusom `P5-I2C`, `P5-I2V` i `P5-I2`.
- **Aritmetika checklista se izvodi, ne pretpostavlja.** Kriterij reda `Schema → RLS` je
  ratifikovan kao **kompletan** `P5-I2`. Označiti ga sada značilo bi tvrditi ispunjenje uslova
  koji nije nastupio — i, gore, prećutno tvrditi da su `P5-I2C` i `★` nekako obuhvaćeni.
- **Historijski zapis je dokaz, ne šum.** Datirane vlasničke tvrdnje su jedini trag redoslijeda
  odlučivanja. Prepisati ih značilo bi izgubiti dokaz da `P5-I2B` **nije** bio prećutno
  autorizovan D-065-om.

## Alternative

- **Označiti `Schema → RLS` i objaviti 49 / 9** — **odbijeno.** Kriterij prihvatanja tog reda je
  **cijeli** `P5-I2` (D-064), a `P5-I2C` i `P5-I2V` nisu izvršeni. To bi bila naduvana progres
  aritmetika i prećutna apsorpcija dva neautorizovana gatea.
- **Proglasiti `P5-I2` zatvorenim jer je „sigurnosni dio gotov"** — **odbijeno.** Segmentacija na
  četiri pod-gatea je ratifikovana upravo da bi se to spriječilo.
- **Prepisati D-064 / D-065 tako da glase kao da je `P5-I2B` oduvijek bio implementiran** —
  **odbijeno.** Vidi `RULING D`.
- **Ne zapisivati zatvaranje i pustiti da kanoničnost implicitno „važi"** — **odbijeno.** Statusni
  drift je već jednom proizveo blokirajući `HOLD` (preflight `P5-I2B`, `B-1`).

## Posljedice

- **`P5-I2B` je formalno zatvoren** i njegov status se u tekućim normativnim sekcijama više ne
  vodi kao budući ili neautorizovan.
- **Kanonski lanac migracija ima šest direktorija**; očekivani konačan broj nakon punog `P5-I2`
  ostaje **sedam** (D-064, `OD-8`) — nedostaje isključivo `014_phase5`, vlasništvo `P5-I2C`.
- **Steady-state sigurnosni katalog `02` §29.4a više nije samo ciljni katalog** — on je zatečeno
  stanje, sa `phase5-rls-grants.security.ts` kao trajnim vlasnikom dokaza.
- **Checklist Faze 5 ostaje 49 / 8.**
- **Naredni implementacijski pod-gate je `P5-I2C`**, i **ovom odlukom nije autorizovan**.

## Security/privacy uticaj

- **Nula nove sposobnosti.** Odluka je isključivo dokumentaciona.
- **Sigurnosna površina se ne mijenja** — grantovi, politike, `FORCE RLS` i allowlista ostaju
  tačno onakvi kakvi su merged u `0e4d113f`.
- **Sigurnosna površina se u odnosu na prethodni zapis povećava, ne smanjuje:** sedam tabela je
  prešlo iz stanja „bez RLS-a, ali i bez ijednog granta" u **`ENABLE` + `FORCE` sa tačno
  ograničenim grantom i tenant politikom**.
- **`storage_objects` ostaje dokazivo nedosežan** — `ENABLE` + `FORCE`, nula politika, nula
  grantova, nula redova.
- **`audit_events` je append-only na nivou granta**, i cross-practice čitljivost ostaje
  kategorički zabranjena (D-063, klauzula 5).
- **`★` RI-naspram-RLS dokaz ostaje tvrdi preduslov za `P5-I5`, doslovno nepromijenjen**, i
  **neuspjeh je i dalje `HARD HOLD`**.

## Migration/rollout

**Nijedna migracija se ovom odlukom ne kreira, ne mijenja, ne preimenuje i ne izvršava; nijedna
baza nije kontaktirana.** Kanonski primijenjen lanac je:

```text
001          extensions and roles
002          identity and practices
013          [Faza-4 slice]
003          [P5-I1]
011_phase5   [P5-I2A]
013_phase5   [P5-I2B]   20260825013452_013_rls_policies_phase5
```

**Preostaje `014_phase5`** — vlasništvo `P5-I2C`, **neautorizovano**.

## Test dokaz

**Testovi se ovom odlukom ne implementiraju, ne mijenjaju i ne izvršavaju.** Trajni vlasnik
steady-state sigurnosnog dokaza je **`apps/api/test/phase5-rls-grants.security.ts`**, uveden
kanonskom implementacijom `P5-I2B` po D-064, `OD-9`, dio B. Exact-set ekspektacije su evoluirale
**stari tačan skup → novi tačan skup**; **nijedna tvrdnja nije oslabljena** u
`contains`/`subset`/`partial`. Statički package-boundary dokazi paketa `003` i paketa `011` su
**očuvani**. **Dokaz paketa `014` i `★` dokaz ostaju odsutni i budući.**

## Supersedes

**Supersedira isključivo statusne tvrdnje, i to tačno tri:**

1. **`P5-I2B` = `NOT IMPLEMENTED`** — kao **tekuću** tvrdnju, gdje god stoji izvan datiranog
   historijskog zapisa odluke;
2. **`P5-I2B` = `NOT AUTHORIZED`** — kao **tekuću** tvrdnju, iz istog razloga;
3. **„Faza-5 RLS/grantovi `NOT IMPLEMENTED`"** i **„puni sigurnosni katalog `02` §29.4a nije
   zatečeno stanje"** — kao tekuće tvrdnje.

**Ne supersedira nijednu sigurnosnu klauzulu.** D-064 (`OD-1`–`OD-9`, obje korekcije, `★` hard
stop, segmentacija na četiri pod-gatea) i D-065 (`RULING 1`, `RULING 2`) ostaju **na snazi bez
izmjene**. **D-060, D-061, D-062 i D-063 se ne diraju.**

## Zavisnosti

- **D-064** — sigurnosna granica i implementacijski ugovor `P5-I2`; segmentacija na četiri
  pod-gatea; `OD-9` vlasništvo testova;
- **D-065** — korigovana aritmetika kataloga politika i eksplicitni transakcijski mehanizam;
- **D-062, D-063** — dizajn i implementacijska granica Faze 5;
- **D-050** — kanonski workflow autorstva migracija.

## Granice prema budućim fazama

- **`P5-I2B` je `CANONICAL` i `FORMALLY CLOSED`.**
- **`P5-I2C` ostaje `NOT IMPLEMENTED` i `NOT AUTHORIZED`.**
- **`P5-I2V` / `★` ostaje `NOT EXECUTED`.**
- **`P5-I5` ostaje `BLOCKED`** dok `P5-I2V PASS` ne postane kanonski.
- **`P5-I2` ostaje `IN_PROGRESS` / `NOT COMPLETE`.**
- **Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.**

> **ANOTACIJA STATUSA — D-067 (2026-08-26); lista iznad se ne prepisuje.** Druga stavka
> („**`P5-I2C` ostaje `NOT IMPLEMENTED` i `NOT AUTHORIZED`**") je **tačan historijski zapis
> stanja na dan D-066** i ostaje nepromijenjena; **ona više ne opisuje tekuće stanje**.
> **`P5-I2C` je od 2026-08-25 `IMPLEMENTED` / `AUDITED` / `MERGED` / `CANONICAL` i formalno je
> zatvoren D-067** — commit `fc6b38cea354f680f88ff9bf75d5e68a84538740`, **PR #38**, merge SHA
> `46e65a7819e29e6e7bdb9cee6ec71bd90c0eb2ee`, migracija
> `20260825214248_014_immutability_triggers_phase5`, vlasnik dokaza
> `apps/api/test/phase5-aad-immutability.security.ts`. **Sve ostale stavke liste ostaju doslovno
> na snazi i nepromijenjene:** `P5-I2B` je `CANONICAL` i `FORMALLY CLOSED`, **`P5-I2V` / `★`
> ostaje `NOT EXECUTED`**, **`P5-I5` ostaje `BLOCKED`**, **`P5-I2` ostaje `IN_PROGRESS` /
> `NOT COMPLETE`**, i **Faza 5 ostaje `IN_PROGRESS`**. Rečenica *Naredni obavezni gate* ispod
> („`P5-I2C` … ovom odlukom nije autorizovan") je takođe historijski tačna — D-066 ga zaista
> nije autorizovao; **naredni obavezni gate je od D-067 `P5-I2V`**.

## Naredni obavezni gate

**`P5-I2C`** — Faza-5 slice paketa `014` (AAD funkcija i tri trigera). **Ovom odlukom nije
autorizovan**; autorizacija je **zaseban vlasnički potez**.

---

# D-067 — `P5-I2C` post-merge pomirenje implementacije i formalno zatvaranje pod-gatea

- **Status:** ACCEPTED / OWNER-RATIFIED
- **Datum:** 2026-08-26
- **Tip:** vlasnički ratifikovano **činjenično pomirenje** governance dokumentacije sa **već
  kanonskom** implementacijom pod-gatea `P5-I2C`, i **formalno zatvaranje** tog pod-gatea.
  **Dokumentacija isključivo.**
- **Amandman na:** **statusne tvrdnje** — ne na sigurnosni dizajn. Sigurnosni ugovor iz **D-064**,
  njegova korekcija iz **D-065** i statusno pomirenje **D-066** ostaju **doslovno na snazi i
  nepromijenjeni**. **D-060, D-061, D-062 i D-063 se ne diraju ni u jednoj klauzuli.**
- **Ova odluka NE uvodi nijedan novi sigurnosni dizajn.** Ne dodaje se nijedan grant, nijedna
  rola, nijedna politika, nijedan trigger, nijedna funkcija i nijedan izuzetak. Ne kreira se i ne
  mijenja se nijedna migracija, schema, Prisma model ni izvršna test asercija. **Nijedna baza nije
  kontaktirana.**
- **Ova odluka NE redizajnira paket `014`** i **NE autorizuje `★`**. `P5-I2V` ostaje
  neautorizovan i neizvršen.

## Kontekst/problem — trigger

D-066 je formalno zatvorio pod-gate `P5-I2B` i izričito zabilježio da **ne autorizuje `P5-I2C`**.
Vlasnik je nakon toga, **zasebnim potezom**, autorizovao pod-gate `P5-I2C`, implementacija je
izvedena, **nezavisno auditirana** i **objavljena u kanonski `main`**.

Time je nastao isti oblik **statusnog drifta** koji je D-066 uklonio za `P5-I2B`: kanonska
dokumentacija je na više mjesta i dalje tvrdila `P5-I2C` = `NOT IMPLEMENTED` / `NOT AUTHORIZED` i
paket `014` = **budući**, dok je `P5-I2C` već bio kanonski. Te tvrdnje su bile tačne **na dan
svog zapisa**, a **netačne kao tekući status**.

**Ovaj zapis ne bira nijednu opciju.** On **konstatuje činjenice** i uklanja drift.

## Odluka

### `RULING A` — `P5-I2C` je kanonski i formalno zatvoren

**`P5-I2C` = `IMPLEMENTED` / `AUDITED` / `MERGED` / `CANONICAL` / `FORMALLY CLOSED`.**

**Vlasnička autorizacija pod-gatea `P5-I2C` je potrošena** dovršenom kanonskom implementacijom.
Formulacije „implementiran na grani", „čeka publikaciju", „nije autorizovan" i „paket `014` je
budući" **više se ne smiju koristiti kao tekući status `P5-I2C`**.

**Kanonski dokaz:**

```text
IMPLEMENTATION COMMIT:  fc6b38cea354f680f88ff9bf75d5e68a84538740
                        feat(db): implement P5-I2C AAD immutability
INDEPENDENT AUDIT:      P5_I2C_I_A_PASS_READY_FOR_PUBLICATION
PULL REQUEST:           #38   (MERGED)
MERGE COMMIT:           46e65a7819e29e6e7bdb9cee6ec71bd90c0eb2ee
PARENT 1:               0b85b15fc058f1a1ad7ede46e76f7ba97a6ae509
PARENT 2:               fc6b38cea354f680f88ff9bf75d5e68a84538740
CANONICAL MIGRATION:    apps/api/prisma/migrations/
                        20260825214248_014_immutability_triggers_phase5/migration.sql
CANONICAL OWNER TEST:   apps/api/test/phase5-aad-immutability.security.ts
```

**Implementacija je nezavisno auditirana prije publikacije, a auditirani commit je merged
nepromijenjen.** `fc6b38ce` je `parent 2` merge commita `46e65a78` i njegov je predak; **stablo
merge commita je identično stablu implementacijskog commita** (`82b52fec`) — merge nije uveo
nijednu izmjenu preko auditiranog stanja.

### `RULING B` — kanonsko stanje paketa `014`

Sljedeće je **zatečeno kanonsko stanje**, ne ciljni katalog:

| Svojstvo | Vrijednost |
|---|---|
| migracijskih direktorija | **7** |
| Faza-5 migracija paketa `014` | **kanonska** — `20260825214248_014_immutability_triggers_phase5` |
| eksplicitna transakcija | **1** `BEGIN` / **1** `COMMIT`, na najvišem nivou |
| novih funkcija | **1** — `app_security.reject_aad_bound_column_change()` |
| funkcija u `app_security` | **4** |
| novih trigera | **3** |
| ne-internih trigera u schemi | **3** |
| ACL mutacija nad tabelama | **nula** |
| aplikacijski izvor / `schema.prisma` | **nula izmjena** |

**Funkcija — doslovno kako je `02` §19.3 zamrzava:**

```text
app_security.reject_aad_bound_column_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = pg_catalog, pg_temp
```

- **Zaštićene kolone reda:** `id` i `practice_id` — i **nijedna druga**.
- **Poređenje je `IS DISTINCT FROM`**, ne `<>`. `<>` daje `NULL` kada je bilo koja strana `NULL`,
  a `NULL` u `IF`-u bi propao na `RETURN NEW` — AAD-vezana kolona prepisana u `NULL` ili iz
  `NULL` prošla bi tiho. `IS DISTINCT FROM` je `NULL`-safe i uz to čini **dodjelu iste
  vrijednosti** uspješnom, što je ispravan ishod: AAD vezivanje je nepromijenjeno.
- **Odbijanje:** `SQLSTATE 23514`, poruka
  `AAD-bound column (id, practice_id) is immutable after INSERT`.
- **Uspjeh:** `RETURN NEW`.

**ACL funkcije — tačan zatečeni skup:**

```text
REVOKE ALL ON FUNCTION app_security.reject_aad_bound_column_change() FROM PUBLIC;

PUBLIC            — nijedan EXECUTE
copilot_app       — nijedan EXECUTE
copilot_system    — nijedan EXECUTE
copilot_migrator  — isključivo vlasnička prava
```

**Nijedan `GRANT EXECUTE` nije izdat i nijedan se ne smije izdati** (D-064). Semantika izvršenja
trigera time nije okrnjena: PostgreSQL provjerava `EXECUTE` **u trenutku kreiranja trigera** —
ovdje, od vlasnika, unutar iste migracije — a poslije funkciju izvršava sistem u kontekstu
trigera, ne pozivalac kroz direktan poziv.

**Trigeri — tačno tri, tačna imena:**

```text
patient_references_aad_immutable_trg
encounters_aad_immutable_trg
encounter_documents_aad_immutable_trg
```

Sva tri su **`BEFORE UPDATE`**, **`FOR EACH ROW`**, **bez `WHEN` klauzule**, **bez
`UPDATE OF`**, i sva tri pokazuju na **istu** kanonsku funkciju. Golo `UPDATE` je namjerno:
`UPDATE OF` sužava uslov okidanja u definiciji trigera, gdje ga kasnija izmjena scheme može tiho
prerasti; funkcija sama poredi stari i novi red i ostaje tačna bez obzira koje kolone iskaz
imenuje.

**Atomičnost.** Faza-5 migracija paketa `014` nosi **tačno jedan** `BEGIN` i **tačno jedan**
`COMMIT` doslovno napisan u `migration.sql`, sa funkcijom, njenim `REVOKE`-om i sva tri trigera
unutar te iste transakcije, bez međukoraka `COMMIT`. **Atomičnost je svojstvo fajla, ne
pretpostavka o migration runtimeu.** Ovo je **lokalni sigurnosni izbor za ovu migraciju**; D-065,
`RULING 2`, propisuje eksplicitnu granicu za Faza-5 slice paketa `013` i **ne uspostavlja opštu
projektnu politiku** transakcijskog omotavanja migracija.

**Tri od pet, namjerno.** `02` §19.3 imenuje **pet** AAD trigera. `candidate_evidence` i
`external_resource_links` **ne postoje u Fazi 5**, pa `candidate_evidence_aad_immutable_trg` i
`external_resource_links_aad_immutable_trg` **ostaju budući** i pripadaju fazi vlasnika njihovog
stanja (`02` §22.14). **Ne smije se tvrditi da svih pet trigera iz §19.3 postoji.**

### `RULING C` — dvije nezavisne barijere, trajno razdvojene

`P5-I2C` trajno dokazuje **dvije nezavisne barijere**, i **nijedna nije dokaz za drugu**
(`02` §25.8a, dokazi 2 i 3).

**PRVA BARIJERA — privilegija.** Stvarni `copilot_app` nad stvarnim Faza-5 tabelama: pokušaj
mutacije `id` ili `practice_id` pada sa **`SQLSTATE 42501`**, jer `copilot_app` nema column-level
`UPDATE` nad tim kolonama (`02` §29.5). **Ovo dokazuje privilegijsku granicu `P5-I2B`. Ovo NE
dokazuje da je trigger okinuo.**

**DRUGA BARIJERA — ponašanje funkcije.** `copilot_migrator` / test owner, **isključivo na
guarded disposable bazi**, nad **test-only privremenom** tabelom, sa **istom kanonskom**
funkcijom:

```text
izmjena samo id            → SQLSTATE 23514
izmjena samo practice_id   → SQLSTATE 23514
izmjena ne-AAD kolone      → uspjeh
dodjela iste vrijednosti   → uspjeh
```

Uz to je dokazano da **nijedan test objekat ne preživi** — privremeni objekat nestaje ili se
eksplicitno rollbackuje.

**`42501` ≠ `23514`.** Dvije barijere moraju ostati **semantički razdvojene**; zamjena jedne
drugom je zabranjena, i test ih eksplicitno razdvaja.

### `RULING D` — `P5-I2B` je očuvan, nije redizajniran

`P5-I2C` **ne redizajnira `P5-I2B`**. Očuvano kanonsko sigurnosno stanje:

| Svojstvo | Vrijednost |
|---|---|
| tenant tabela pod `ENABLE` + `FORCE RLS` | **13 / 13** |
| ukupan katalog politika | **25** |
| tačni table grantovi | **nepromijenjeni** |
| tačni column grantovi | **nepromijenjeni** |
| `storage_objects` | **nula runtime sposobnosti** |
| `PUBLIC` nad tabelama `P5-I2B` | **nula** |
| `copilot_system` nad tabelama `P5-I2B` | **nula** |
| `§23.4` maintenance allowlista | **tačno 6** — neproširena |
| role | **nepromijenjene**, sve `NOBYPASSRLS` |
| politike `copilot_migrator`-a | **nula** |

**Jedina ACL mutacija paketa `014` je `REVOKE` nad njegovom vlastitom funkcijom.** Nijedan iskaz
ovog paketa ne dira ACL ni RLS zastavicu nijedne tabele.

### `RULING E` — statičke package granice su očuvane

**Svih šest migracija koje prethode paketu `014` ostaju bajt-nepromijenjene.** Trajni dokaz
ostaje:

- **paket `003`** — statička zero-capability granica;
- **paket `011`** — statička zero-capability granica;
- **Faza-5 migracija paketa `013` (`P5-I2B`)** — statički dokaz da **nije** kreirala nijedan
  objekat paketa `014`, ni funkciju ni trigger;
- **paket `014` (`P5-I2C`)** — vlasnik **tačno** jedne funkcije i **tri** trigera.

**Vlasništvo starijih paketa se ne prepisuje.** Statički package-boundary dokazi dokazuju
**forward SQL svog paketa**, ne tekuće živo stanje, pa ih kanoničnost `P5-I2C` ne obesmišljava.

### `RULING F` — checklist Faze 5 ostaje **49 / 8**

**Nijedna kućica se ovim zatvaranjem ne označava.**

**Checklist nema nijedan red u vlasništvu `P5-I2C`.** Jedini Faza-5 red koji `P5-I2` uopšte može
označiti je **`Schema → RLS`**, a njegov **ratifikovani kriterij prihvatanja** je — doslovno,
D-064, *Prognoza checklista*, potvrđeno anotacijama `P5-I2A-C` i `P5-I2B-D` te D-066,
`RULING C` — **kompletan, verifikovan i kanonski `P5-I2`**, a ne pojedinačni pod-gate.
**`P5-I2V` / `★` nije izvršen**, pa **antecedent nije ispunjen** i red ostaje **neoznačen**.

**`Tests → cross-tenant FK` se u `P5-I2` ne smije označiti** (D-064) — značenje tog reda uključuje
i kasnije API/`422` ponašanje koje posjeduje `P5-I5`. **Svi Services/API/facade redovi ostaju
netaknuti.**

**Zvanična aritmetika, prebrojana iz stvarnog stanja kućica u `05` §6:**

```text
                   prije      poslije
ukupno redova      49         49
označeno            8          8
neoznačeno         41         41
notacija           49 / 8     49 / 8
```

**Prognoza nakon punog `P5-I2` ostaje 49 / 9** i **ostaje prognoza**.

### `RULING G` — očuvanje historijskog zapisa

**Historijske tvrdnje „`P5-I2C` NOT IMPLEMENTED", „`P5-I2C` NOT AUTHORIZED" i „paket `014` je
budući" unutar ranijih, datiranih vlasničkih odluka su historijski tačne i ne smiju se
prepisivati.** Tijela **D-064**, **D-065** i **D-066** se **ne mijenjaju**; dobijaju **kratku
statusnu anotaciju** koja pokazuje na D-067, po precedentu D-063, D-065 i D-066.

**Tekuće normativne sekcije izvan historijskih zapisa odluka moraju odražavati novo kanonsko
stanje** — `02`, `04`, `05` i `08`.

## Obuhvat

D-067:

- **konstatuje** kanoničnost i formalno zatvaranje `P5-I2C`;
- **pomiruje** tekuće statusne tvrdnje `02`, `04`, `05` i `08`;
- **NE mijenja** nijednu klauzulu sigurnosnog ugovora D-064 / D-065 / D-066;
- **NE redizajnira** paket `014`;
- **NE uvodi** nijedan novi sigurnosni dizajn;
- **NE označava** nijednu kućicu checklista;
- **NE izvršava, ne slabi i ne autorizuje** `P5-I2V` / **`★`**;
- **NE odblokira** `P5-I5`;
- **NE zatvara** `P5-I2` ni Fazu 5;
- **NE tvrdi** da svih pet AAD trigera iz `02` §19.3 postoji.

## Razlog

- **Potrošena autorizacija mora biti vidljiva kao potrošena.** Dokumentacija koja i dalje tvrdi
  „paket `014` je budući" nad već kanonskom migracijom stvara dvije podjednako opasne greške:
  ponovno „autorizovanje" već izvršenog posla, i tretiranje kanonskog AAD sprovođenja kao da još
  ne postoji.
- **Zatvaranje pod-gatea nije zatvaranje roditelja.** `P5-I2C` je **treći od četiri** pod-gatea.
  D-064 izričito zabranjuje da gate prećutno apsorbuje naredni; formalno zatvaranje `P5-I2C`
  zato **mora** biti zapisano zajedno sa nepromijenjenim statusom `P5-I2V` i `P5-I2`.
- **Dvije barijere su dvije tvrdnje.** Zapisati `42501` i `23514` kao „isto odbijanje" značilo bi
  izgubiti tačno onaj dokaz zbog kojeg je `02` §25.8a i napisan.
- **Aritmetika checklista se izvodi, ne pretpostavlja.** `P5-I2C` **nema** vlastitu kućicu, a red
  `Schema → RLS` traži **kompletan** `P5-I2`. Označiti ga sada značilo bi prećutno tvrditi da je
  **`★`** nekako obuhvaćen.
- **Historijski zapis je dokaz, ne šum.** Datirane vlasničke tvrdnje su jedini trag redoslijeda
  odlučivanja. Prepisati ih značilo bi izgubiti dokaz da `P5-I2C` **nije** bio prećutno
  autorizovan D-066-om.

## Alternative

- **Označiti `Schema → RLS` i objaviti 49 / 9** — **odbijeno.** Kriterij prihvatanja tog reda je
  **cijeli** `P5-I2` (D-064), a `P5-I2V` nije izvršen.
- **Proglasiti `P5-I2` zatvorenim jer su „sve tri migracije gotove"** — **odbijeno.**
  Segmentacija na **četiri** pod-gatea je ratifikovana upravo da bi se to spriječilo; `P5-I2V` je
  pod-gate, ne formalnost.
- **Tvrditi da `42501` iz prve barijere dokazuje trigger** — **odbijeno**, i **trajno**. To je
  tačan defekt koji `02` §25.8a zabranjuje.
- **Dokumentovati svih pet trigera §19.3 kao postojeće** — **odbijeno.** Dvije tabele ne postoje
  u Fazi 5; njihovi trigeri su budući (`02` §22.14).
- **Prepisati D-064 / D-065 / D-066 tako da glase kao da je `P5-I2C` oduvijek bio implementiran**
  — **odbijeno.** Vidi `RULING G`.

## Posljedice

- **`P5-I2C` je formalno zatvoren** i njegov status se u tekućim normativnim sekcijama više ne
  vodi kao budući ili neautorizovan.
- **Kanonski lanac migracija ima sedam direktorija** — očekivani konačan broj nakon punog
  `P5-I2` (D-064, `OD-8`) je time **dostignut**. **Nijedna Faza-5 migracija ne preostaje.**
- **Sve tri Faza-5 migracije su kanonske**; `02` §29.10 više nema budući direktorij.
- **`02` §19.3, §22.14, §25.8 i §25.8a više ne opisuju budući posao** za tri Faza-5 trigera —
  opisuju zatečeno stanje, sa `phase5-aad-immutability.security.ts` kao trajnim vlasnikom dokaza.
- **Checklist Faze 5 ostaje 49 / 8.**
- **Naredni obavezni gate je `P5-I2V`**, i **ovom odlukom nije autorizovan**.

## Security/privacy uticaj

- **Nula nove sposobnosti.** Odluka je isključivo dokumentaciona.
- **Sigurnosna površina se ne mijenja** — grantovi, politike, `FORCE RLS` i allowlista ostaju
  tačno onakvi kakvi su merged u `46e65a78`.
- **Sigurnosna površina se u odnosu na prethodni zapis povećava, ne smanjuje:** tri Faza-5 tabele
  koje nose ciphertext dobile su **`BEFORE UPDATE` sprovođenje AAD nepromjenjivosti**, koje RLS
  po konstrukciji ne može dati — same-tenant prepisivanje `id`-a ili `practice_id`-a je iz ugla
  politike legalno, a proizvelo bi **trajno nedekriptabilne podatke**.
- **Nijedan `SECURITY DEFINER` nije uveden**; funkcija je `SECURITY INVOKER`, i dokaz to tvrdi nad
  **cijelom** bazom, ne samo nad `app_security`.
- **`PUBLIC` ne drži `EXECUTE`** nad sigurnosnom funkcijom; nijedna runtime rola ne može je
  pozvati direktno.
- **`★` RI-naspram-RLS dokaz ostaje tvrdi preduslov za `P5-I5`, doslovno nepromijenjen**, i
  **neuspjeh je i dalje `HARD HOLD`**.

## Migration/rollout

**Nijedna migracija se ovom odlukom ne kreira, ne mijenja, ne preimenuje i ne izvršava; nijedna
baza nije kontaktirana.** Kanonski primijenjen lanac je:

```text
001          extensions and roles
002          identity and practices
013          [Faza-4 slice]
003          [P5-I1]
011_phase5   [P5-I2A]   20260823211546_011_jobs_idempotency_outbox_audit_phase5
013_phase5   [P5-I2B]   20260825013452_013_rls_policies_phase5
014_phase5   [P5-I2C]   20260825214248_014_immutability_triggers_phase5
```

**Nijedna Faza-5 migracija ne preostaje.** `02` §29.10 je time ispunjen: **tačan broj
migracijskih direktorija = 7**.

## Test dokaz

**Testovi se ovom odlukom ne implementiraju, ne mijenjaju i ne izvršavaju.** Trajni vlasnik
steady-state dokaza `P5-I2C` je **`apps/api/test/phase5-aad-immutability.security.ts`**, uveden
kanonskom implementacijom `P5-I2C` po D-064, `OD-9`. Taj fajl posjeduje:

- **tačan lanac migracija = 7**, i tvrdnju da paket `014` dodaje **tačno jedan** direktorij;
- **statički dokaz eksplicitne transakcije** nad tekstom migracije — jedan `BEGIN`, jedan
  `COMMIT`, bez transakcijski prekidajućeg iskaza;
- **tačno jedna funkcija, tačno tri trigera, nijedan grant, nijedna politika, nijedna RLS
  zastavica, nijedna rola i nijedan red** u forward SQL-u paketa;
- **`app_security` drži tačno četiri funkcije**, sve `SECURITY INVOKER`, i **nijedna funkcija
  nigdje u bazi nije `SECURITY DEFINER`**;
- **tačan ACL funkcije** — `PUBLIC`, `copilot_app` i `copilot_system` bez `EXECUTE`;
- **tačno tri ne-interna trigera** u schemi, sa tačnim kataloškim bitovima `BEFORE` + `ROW` +
  `UPDATE` i bez `WHEN`;
- **prvu barijeru** — `42501` pod stvarnim `copilot_app`-om, uz eksplicitnu tvrdnju da
  `42501 ≠ 23514`;
- **drugu barijeru** — `23514` nad test-only privremenom tabelom, za `id` i za `practice_id`
  zasebno, uz kanonsku poruku;
- **uspjeh ne-AAD `UPDATE`-a** i **uspjeh dodjele iste vrijednosti**;
- **odsustvo curenja test objekata**;
- **regresiju `P5-I2B`** — `13 / 13`, **25** politika, tačan column-grant katalog,
  `storage_objects` bez sposobnosti, `PUBLIC` i `copilot_system` na nuli, role `NOBYPASSRLS`,
  allowlista **tačno 6**;
- **eksplicitnu tvrdnju da `★` nije razriješen** i da `P5-I5` ostaje `BLOCKED`.

**Exact-set ekspektacije su evoluirale isključivo `stari tačan skup → novi tačan skup`**;
**nijedna tvrdnja nije oslabljena** u `contains`/`subset`/`partial`. Statički package-boundary
dokazi paketa `003`, `011` i Faza-5 paketa `013` su **očuvani**.

**`apps/api/test/phase5-responsible-physician-ri.security.ts` i dalje NE POSTOJI** — **`★`**
dokaz je budući i u vlasništvu `P5-I2V`.

## Supersedes

**Supersedira isključivo statusne tvrdnje, i to tačno tri:**

1. **`P5-I2C` = `NOT IMPLEMENTED`** — kao **tekuću** tvrdnju, gdje god stoji izvan datiranog
   historijskog zapisa odluke;
2. **`P5-I2C` = `NOT AUTHORIZED`** — kao **tekuću** tvrdnju, iz istog razloga;
3. **„paket `014` je budući / odsutan", „broj migracijskih direktorija = 6"** i **„dokaz paketa
   `014` je odsutan"** — kao tekuće tvrdnje.

**Ne supersedira nijednu sigurnosnu klauzulu.** D-064 (`OD-1`–`OD-9`, obje korekcije, `★` hard
stop, segmentacija na četiri pod-gatea), D-065 (`RULING 1`, `RULING 2`) i D-066
(`RULING A`–`RULING D`) ostaju **na snazi bez izmjene**. **D-060, D-061, D-062 i D-063 se ne
diraju.**

## Zavisnosti

- **D-064** — sigurnosna granica i implementacijski ugovor `P5-I2`; segmentacija na četiri
  pod-gatea; higijena ACL-a funkcije paketa `014`; korekcija B obrasca dokazivanja; `OD-9`
  vlasništvo testova;
- **D-065** — korigovana aritmetika kataloga politika i eksplicitni transakcijski mehanizam;
- **D-066** — statusno pomirenje i formalno zatvaranje `P5-I2B`;
- **D-062** (`OD-P5-D2-1`) — repointiranje AAD slicea paketa `014` na Fazu 5;
- **D-025**, klauzula 12 — kanonski AAD i njegovo vezivanje;
- **D-050** — kanonski workflow autorstva migracija.

## Granice prema budućim fazama

- **`P5-I2C` je `CANONICAL` i `FORMALLY CLOSED`.**
- **`P5-I2V` / `★` ostaje `NOT EXECUTED` i `NOT AUTHORIZED`.**
- **`P5-I5` ostaje `BLOCKED`** dok `P5-I2V PASS` ne postane kanonski.
- **`P5-I2` ostaje `IN_PROGRESS` / `NOT COMPLETE`.**
- **Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.**
- **Preostala dva AAD trigera iz `02` §19.3** — `candidate_evidence_aad_immutable_trg` i
  `external_resource_links_aad_immutable_trg` — **ostaju budući**, u fazi vlasnika stanja svojih
  tabela (`02` §22.14).

## Naredni obavezni gate

**`P5-I2V`** — **`★`** RI-naspram-RLS dokaz iz `04` §7.6a, uz trajne regresije. **Ovom odlukom
nije autorizovan**; autorizacija je **zaseban vlasnički potez**.

**`★` traži, u JEDNOJ transakciji, pod stvarnim `copilot_app`-om i stvarnim `FORCE RLS`-om,
istovremeno:**

```text
A.  INSERT encountera sa responsible_physician_id co-membera iste ordinacije
    USPIJEVA kroz composite FK;
B.  direktan SELECT tog istog practice_memberships reda, u istoj transakciji
    i istom kontekstu, vraća NULA REDOVA.
```

**`SQLSTATE 42501` NIJE ekvivalent dokazu B**, i **paket `014` ne doprinosi dokazu B ni u jednom
dijelu.** Ne autorizuju se: `SECURITY DEFINER`, `BYPASSRLS`, nova rola, owner politika,
proširenje politike, drugi klijent ni proširenje allowliste.

---

# D-068 — `P5-I2V` RI-naspram-RLS dokaz, formalno zatvaranje `P5-I2V` i kompletiranje roditeljskog gatea `P5-I2`

- **Status:** ACCEPTED / OWNER-RATIFIED
- **Datum:** 2026-08-27
- **Tip:** vlasnički ratifikovano **činjenično pomirenje** governance dokumentacije sa **već
  kanonskim** dokazom pod-gatea `P5-I2V`, **formalno zatvaranje** tog pod-gatea, **kompletiranje
  roditeljskog gatea `P5-I2`**, njegova **posljedica na checklist** i **granica podobnosti
  `P5-I5`**. **Dokumentacija isključivo.**
- **Amandman na:** **statusne tvrdnje** — ne na sigurnosni dizajn. Sigurnosni ugovor iz **D-064**,
  njegova korekcija iz **D-065** i statusna pomirenja **D-066** i **D-067** ostaju **doslovno na
  snazi i nepromijenjeni**. **D-060, D-061, D-062 i D-063 se ne diraju ni u jednoj klauzuli.**
- **Ova odluka NE uvodi nijedan novi sigurnosni dizajn.** Ne dodaje se nijedan grant, nijedna
  rola, nijedna politika, nijedan trigger, nijedna funkcija i nijedan izuzetak. Ne kreira se i ne
  mijenja se nijedna migracija, schema, Prisma model ni izvršna test asercija. **Nijedna baza nije
  kontaktirana** i **nijedan test se ovom odlukom ne izvršava.**
- **Ova odluka NE redizajnira RI-naspram-RLS mehanizam**, **ne mijenja FK semantiku** i **ne
  uvodi nijedan novi tehnički zahtjev Faze 5.**
- **Ova odluka NE autorizuje `P5-I5`.** Ona ga čini **podobnim za zasebnu vlasničku
  autorizaciju** tek nakon što sama postane kanonska — vidi `RULING H`.

## Kontekst/problem — trigger

D-067 je formalno zatvorio pod-gate `P5-I2C` i izričito zabilježio da **ne autorizuje `P5-I2V`**.
Vlasnik je nakon toga, **zasebnim potezom**, autorizovao pod-gate `P5-I2V`, dokaz je izveden,
**nezavisno auditiran** i **objavljen u kanonski `main`**.

Time je nastao isti oblik **statusnog drifta** koji su D-066 i D-067 uklonili za `P5-I2B` i
`P5-I2C`: kanonska dokumentacija je na više mjesta i dalje tvrdila `P5-I2V` / **`★`** =
`NOT EXECUTED` / `NOT AUTHORIZED` i da `apps/api/test/phase5-responsible-physician-ri.security.ts`
**ne postoji**, dok je **`★`** već bio kanonski i nezavisno auditiran. Te tvrdnje su bile tačne
**na dan svog zapisa**, a **netačne kao tekući status**.

Uz to, `P5-I2V` je **četvrti i posljednji** od četiri ratifikovana pod-gatea (D-064,
*Segmentacija implementacije*). Njegovim zatvaranjem **prvi put** postaje ispunjen antecedent
koji D-064 postavlja za red checklista `Schema → RLS` — **kompletan, verifikovan i kanonski
`P5-I2`** — pa ovaj zapis mora, pored statusnog pomirenja, izvesti i **kompletiranje roditeljskog
gatea** i **tačno jednu** posljedicu na checklist.

**Ovaj zapis ne bira nijednu opciju.** On **konstatuje činjenice**, uklanja drift i izvodi
posljedicu koja je već ratifikovana u D-064.

## Odluka

### `RULING A` — `P5-I2V` je kanonski i formalno zatvoren

**`P5-I2V` = `IMPLEMENTED` / `INDEPENDENTLY AUDITED` / `MERGED` / `CANONICAL` /
`FORMALLY CLOSED`.**

**Vlasnička autorizacija pod-gatea `P5-I2V` je potrošena** dovršenim kanonskim dokazom.
Formulacije „nije izvršen", „nije autorizovan", „čeka publikaciju" i „taj fajl ne postoji"
**više se ne smiju koristiti kao tekući status `P5-I2V`**.

**Kanonski dokaz:**

```text
IMPLEMENTATION COMMIT:  5b61a95a990b7179d62aa3338f8685cfa1c605fc
                        test(security): prove P5-I2V RI-vs-RLS
INDEPENDENT AUDIT:      P5_I2V_I_A_PASS_READY_FOR_PUBLICATION
PULL REQUEST:           #40   (MERGED)
MERGE COMMIT:           31de95230da6ff1b97a28e6386ee93b5da19aca5
CANONICAL OWNER TEST:   apps/api/test/phase5-responsible-physician-ri.security.ts
P5-I2C EVOLVED TEST:    apps/api/test/phase5-aad-immutability.security.ts
```

**Implementacija je nezavisno auditirana prije publikacije, a auditirani commit je merged
nepromijenjen.** `5b61a95a` je **predak** merge commita `31de9523`, a **stablo merge commita je
bajt-identično stablu nezavisno auditirane implementacije** — merge nije uveo nijednu izmjenu
preko auditiranog stanja.

**`P5-I2V` je bio TEST-ONLY.** Nije kreirana nijedna migracija, nijedna schema izmjena, nijedan
`GRANT`, nijedna politika, nijedna rola, nijedna funkcija i nijedna izmjena aplikacijskog izvora.

**Neblokirajuće opservacije nezavisnog audita `R1`–`R8` ostaju `NON-BLOCKING`.** **Nijedna od
njih se ovom odlukom ne promoviše u bloker zatvaranja**, i **`R1` se u ovom dokumentacijskom
gateu ne popravlja.**

### `RULING B` — `★` nalaz, doslovno i istovremeno

**`★` je dokazan kao KONJUNKCIJA**, u **jednoj** transakciji, nad **stvarnim** `copilot_app`-om i
**stvarnim** `FORCE RLS`-om, na **istom** `pg.Client`-u, u **istoj** PostgreSQL transakciji i pod
**istim** autentifikovanim user/practice kontekstom:

```text
A.  same-practice co-member B je PRIHVAĆEN kao encounters.responsible_physician_id
    kroz encounters_responsible_physician_membership_fk, sa tačnom relacijom

        encounters (practice_id, responsible_physician_id)
          ->  practice_memberships (practice_id, user_id)

    I ISTOVREMENO

B.  direktan SELECT tačno tog istog B practice_memberships reda, u istoj
    transakciji i istom kontekstu, vraća NULA REDOVA.
```

**Obje polovine su asertirane zajedno, u jednom strogom poređenju**, tako da se **nijedna ne može
izvještavati, citirati ni regresirati zasebno**. Polovina B se uzima **tek nakon** što je
polovina A uspjela, jer polovina B iz već abortirane transakcije ne dokazuje ništa.

**`SQLSTATE 42501` NIJE ekvivalent polovini B.** To je zapisano kao **izvršna tvrdnja**, ne kao
proza: `proofB` se eksplicitno poredi sa `42501` i taj slučaj je odbijen.

### `RULING C` — sigurnosno stanje pod kojim je `★` dokazan

Sljedeće je **zatečeno kanonsko stanje** koje dokaz kataloški pina, ne ciljni katalog:

**Composite FK — puna kataloška identičnost:**

| Svojstvo | Vrijednost |
|---|---|
| ime | **`encounters_responsible_physician_membership_fk`** |
| oblik | **`MATCH SIMPLE`** |
| `ON DELETE` / `ON UPDATE` | **`NO ACTION` / `NO ACTION`** |
| `convalidated` | **`true`** — validiran, ne `NOT VALID` |
| `condeferrable` | **`false`** — nije odgodiv |
| `condeferred` | **`false`** — nije inicijalno odgođen |
| roditeljski ključ | **`practice_memberships_practice_user_key`** |
| kolone roditeljskog ključa | **`practice_id`, `user_id`** — unique, valid, total |

**`practice_memberships` — RLS, politika i grant:**

| Svojstvo | Vrijednost |
|---|---|
| `relrowsecurity` | **`true`** — `ENABLE` |
| `relforcerowsecurity` | **`true`** — `FORCE` |
| broj politika | **tačno 1** — `practice_memberships_self_select` |
| tip / komanda / rola | **`PERMISSIVE`** / **`SELECT`** / **`TO copilot_app`** |
| semantika politike | **`user_id = app.user_id`** — bajt-identična Faza-4 tijelu |
| `copilot_app` | **`SELECT` da**; `INSERT`, `UPDATE`, `DELETE` — **ne** |
| `PUBLIC` | **nula** |
| `copilot_system` | **nula** |

**Nijedno proširenje sigurnosne površine nije izvedeno ni traženo.**

### `RULING D` — zašto je `B = 0` pripisivo RLS-u

**Zero rows je tvrdnja o politici tek kada su svi alternativni uzroci mehanički isključeni.**
Kanonske kontrole, sve u vlasništvu **`★`** testa:

- **fizičko postojanje `B`** — u **zasebnoj** transakciji, na **istoj** konekciji, sa **istim**
  SQL-om i **istim** `(P, B)` parametrima, razlikujući se **ni u čemu osim `app.user_id`**,
  lookup vraća **tačno jedan** red, i to **tačno kanonski `B` membership** ordinacije `P`;
- **isti lookup pod `★` kontekstom `A`** vraća **nula redova**;
- **own-membership kontrola unutar `★`** — isti oblik upita nad vlastitim `P/A` membershipom
  vraća **tačno jedan** red, čime je dokazano da `SELECT` **izvršava**, da je privilegija
  **prisutna**, da `app.user_id` **stvarno jeste `A`** i da politika **propušta** redove koje
  treba da propusti;
- **polovina A je rezolvirala `P/B` kroz živi, validirani FK**, dakle roditeljski red je za RI
  provjeru **dosežan**;
- **`SELECT` privilegija postoji** (`RULING C`), pa **nula redova nije uskraćenje privilegije**;
- **jedan klijent, jedna transakcija** — `pg_backend_pid()` je isti, `pg_current_xact_id()` je
  unutar `★` **nepromijenjen** od otvaranja do zatvaranja, i **različit** od kontrolne
  transakcije, koja je rollbackovana **prije** nego što je `★` počeo;
- **`A` nije `B`** je asertirano, ne pretpostavljeno — i na nivou korisnika i na nivou
  membership identiteta;
- **red koji polovina B nije vidjela je tačno onaj roditeljski red na koji je ključ polovine A
  rezolvirao** — ista ordinacija, isti korisnik, isti membership identitet.

**Nijedan preostali lažno pozitivan uzrok** — odsustvo reda, pogrešan identifikator, nedostajuća
privilegija, mrtav kontekst, druga transakcija ili druga konekcija — **nije ostao otvoren.**

**Uz to je dokazano da `★` transakcija nije ostavila ništa za sobom** — svaki red je rollbackovan.

### `RULING E` — nijedan izlaz nije otvoren

Zatečeno kanonsko stanje je ostalo:

| Svojstvo | Vrijednost |
|---|---|
| tačan skup rola | **`copilot_app`, `copilot_migrator`, `copilot_system`** |
| `rolsuper` | **`false`** za sve |
| `rolbypassrls` | **`false`** za sve |
| `SECURITY DEFINER` funkcije | **nula**, nad **cijelom** bazom |
| `§23.4` `FORCE RLS` maintenance allowlista | **tačno 6** — neproširena |
| politike nad `practice_memberships` koje ciljaju `copilot_migrator` | **nula** |
| proširenje granta | **nijedno** |
| proširenje politike | **nijedno** |
| nova rola | **nijedna** |
| migracija / schema / izvor | **nijedna izmjena** |

**AAD trigger nad `encounters` je `BEFORE UPDATE` i samo `BEFORE UPDATE`**, pa na **`★`**, koji
je `INSERT`, **nije mogao okinuti** — paket `014` **ne doprinosi** dokazu **`★`** ni u jednom
dijelu. Ta tvrdnja je izvršna, ne prozna.

### `RULING F` — roditeljski gate `P5-I2` je kompletan i formalno zatvoren

**Ratifikovana segmentacija `P5-I2` je i ostaje TAČNO ČETIRI pod-gatea** (D-064, *Segmentacija
implementacije*). **Nijedan peti pod-gate ne postoji** u kanonskoj segmentaciji.

```text
P5-I2A     CANONICAL                                   (PR #33)
P5-I2B     CANONICAL / FORMALLY CLOSED                 (PR #36, D-066)
P5-I2C     CANONICAL / FORMALLY CLOSED                 (PR #38, D-067)
P5-I2V     CANONICAL / FORMALLY CLOSED                 (PR #40, D-068)
```

**Sva četiri pod-gatea su zadovoljena**, i **nijedan drugi `P5-I2`-owned zahtjev ne ostaje
otvoren** u kanonskom autoritetu.

**`P5-I2` = `COMPLETE` / `VERIFIED` / `CANONICAL` / `FORMALLY CLOSED`.**

Ovo je **tačno onaj uslov kompletiranja roditeljskog gatea** koji su D-064, D-066 (`RULING C`) i
D-067 (`RULING F`) unaprijed formulisali i **odbili prećutno pretpostaviti** dok posljednji
pod-gate nije bio kanonski.

### `RULING G` — checklist Faze 5 prelazi na **49 / 9**

**Ovom odlukom se mijenja tačno JEDNA kućica.**

Jedini Faza-5 red u vlasništvu kompletiranja `P5-I2` je **`Schema → RLS`**, a njegov
**ratifikovani kriterij prihvatanja** je — doslovno, D-064, *Prognoza checklista*, potvrđeno
anotacijama `P5-I2A-C` i `P5-I2B-D`, D-066 `RULING C` i D-067 `RULING F` — **kompletan,
verifikovan i kanonski `P5-I2`**, a **ne** pojedinačni pod-gate. **`RULING F` taj antecedent
ispunjava**, pa red prelazi:

```text
Schema:  RLS      [ ]  ->  [x]
```

**Zvanična aritmetika, prebrojana iz stvarnog stanja kućica u `05` §6:**

```text
                   prije      poslije
ukupno redova      49         49
označeno            8          9
neoznačeno         41         40
notacija           49 / 8     49 / 9
```

**Prognoza `49 / 9` iz D-064 time prestaje biti prognoza i postaje zatečeno stanje.**

**`Tests → cross-tenant FK` se NE označava** i ostaje **neoznačen**: značenje tog reda uključuje
i kasnije API/`422` ponašanje koje posjeduje **`P5-I5`** (D-064). **Svi Services, API, route i
facade redovi ostaju netaknuti.** **Nijedna druga kućica se ne mijenja.**

### `RULING H` — granica podobnosti `P5-I5`

Kanonski autoritet glasi: **`P5-I5` ostaje `BLOCKED` dok `P5-I2V PASS` ne postane kanonski**
(D-064). Ta tranzicija se ovom odlukom čini preciznom:

- **`P5-I2V PASS` jeste kanonski** (`RULING A`), i **`★` je prošao** (`RULING B`);
- **`HARD HOLD` uslov nije nastupio**, i `OD-P5-D2-5` se **ne otvara ponovo**;
- **nakon što D-068 sam postane kanonski**, **`P5-I5` = `ELIGIBLE FOR SEPARATE OWNER
  AUTHORIZATION`**;
- **`P5-I5` = `NOT AUTHORIZED`.** Nijedna implementacija `P5-I5` ne počinje automatski, ni ovom
  odlukom, ni kanoničnošću `P5-I2`, ni ispunjenjem njegovog tvrdog preduslova.

**Podobnost nije autorizacija.** Autorizacija `P5-I5` ostaje **zaseban vlasnički potez**, po
istom pravilu po kojem je svaki od četiri pod-gatea `P5-I2` tražio svoj.

**Dok ova dokumentacijska grana ne bude merged, kanonski `main` i dalje nosi `P5-I5` =
`BLOCKED`.**

### `RULING I` — očuvanje historijskog zapisa

**Historijske tvrdnje „`P5-I2V` NOT EXECUTED", „`P5-I2V` NOT AUTHORIZED",
„`phase5-responsible-physician-ri.security.ts` NE POSTOJI", „`P5-I5` BLOCKED",
„`P5-I2` IN_PROGRESS / NOT COMPLETE" i „checklist 49 / 8" unutar ranijih, datiranih vlasničkih
odluka i as-of-time blokova su historijski tačne i ne smiju se prepisivati.** Tijela **D-062**,
**D-064**, **D-065**, **D-066** i **D-067** se **ne mijenjaju**; njihove zaključne statusne
formulacije su **as-of-time** i supersedirane su isključivo kao **tekući status**, po precedentu
D-063, D-065, D-066 i D-067.

**Tekuće normativne sekcije izvan historijskih zapisa odluka moraju odražavati novo kanonsko
stanje** — `02`, `04`, `05` i `08`.

## Obuhvat

D-068:

- **konstatuje** kanoničnost i **formalno zatvara** `P5-I2V`;
- **konstatuje** da je ratifikovana segmentacija `P5-I2` tačno **četiri** pod-gatea i da su **sva
  četiri** zadovoljena;
- **formalno zatvara roditeljski gate `P5-I2`** kao `COMPLETE` / `VERIFIED` / `CANONICAL`;
- **označava tačno jednu** kućicu — `Schema → RLS` — i objavljuje **49 / 9**;
- **pomiruje** tekuće statusne tvrdnje `02`, `04`, `05` i `08`;
- **precizira** granicu podobnosti `P5-I5`;
- **NE mijenja** nijednu klauzulu sigurnosnog ugovora D-064 / D-065 / D-066 / D-067;
- **NE redizajnira** RI-naspram-RLS mehanizam i **ne mijenja** FK semantiku;
- **NE uvodi** nijedan novi sigurnosni dizajn i **nijedan novi tehnički zahtjev Faze 5**;
- **NE označava** `Tests → cross-tenant FK` ni ijednu drugu kućicu;
- **NE autorizuje** `P5-I5` i **ne pokreće** nijedan njegov korak;
- **NE zatvara** Fazu 5;
- **NE promoviše** nijednu neblokirajuću opservaciju audita `R1`–`R8` u bloker.

## Razlog

- **Potrošena autorizacija mora biti vidljiva kao potrošena.** Dokumentacija koja i dalje tvrdi
  da **`★`** nije izvršen i da njegov fajl ne postoji, nad već kanonskim i nezavisno auditiranim
  dokazom, stvara dvije podjednako opasne greške: ponovno „autorizovanje" već izvršenog posla, i
  tretiranje kanonski dokazane RI-naspram-RLS granice kao da još nije utvrđena.
- **Roditeljski gate se zatvara kada se zatvori njegov posljednji pod-gate — ne ranije i ne
  kasnije.** D-064 je segmentaciju na četiri pod-gatea ratifikovao upravo da bi kompletiranje
  `P5-I2` bilo **izvedeno**, a ne pretpostavljeno. Sada je izvedeno.
- **Aritmetika checklista se izvodi, ne pretpostavlja.** Kriterij reda `Schema → RLS` je od
  D-064 doslovno **kompletan `P5-I2`**. Tri prethodna zatvaranja su ga s pravom odbila označiti
  jer antecedent nije bio ispunjen; odbiti ga i sada značilo bi tvrditi da ratifikovani kriterij
  nikada ne može biti ispunjen.
- **`★` je konjunkcija i mora ostati konjunkcija.** Zapisati polovinu A bez polovine B, ili
  polovinu B bez konteksta u kojem je uzeta, značilo bi izgubiti tačno onaj dokaz zbog kojeg je
  obaveza i uvedena — da RI radi **a da RLS nije oslabljen**.
- **Zero rows nije dokaz sam po sebi.** Bez fizičko-egzistencijalne kontrole, own-membership
  kontrole i dokaza o istoj konekciji i istoj transakciji, „nula redova" jednako dobro opisuje
  mrtav kontekst ili nepostojeći red. Zato `RULING D` postoji.
- **`42501` nije `★`.** To je isti oblik zamjene koji `02` §25.8a trajno zabranjuje za `P5-I2C`,
  i ovdje je zabranjen izvršnom tvrdnjom, ne prozom.
- **Podobnost i autorizacija su dvije različite stvari.** Spojiti ih značilo bi da tvrdi
  preduslov, kada padne, sam po sebi pokreće naredni slice — tačno ono što segmentacija D-064
  zabranjuje.
- **Historijski zapis je dokaz, ne šum.** Datirane vlasničke tvrdnje su jedini trag redoslijeda
  odlučivanja. Prepisati ih značilo bi izgubiti dokaz da `P5-I2V` **nije** bio prećutno
  autorizovan D-067-om.

## Alternative

- **Ostaviti `Schema → RLS` neoznačenim i zadržati 49 / 8** — **odbijeno.** Ratifikovani kriterij
  prihvatanja je **kompletan, verifikovan i kanonski `P5-I2`** (D-064), a `RULING F` ga
  ispunjava. Zadržati red neoznačenim značilo bi kriterij učiniti neispunjivim.
- **Označiti i `Tests → cross-tenant FK`** — **odbijeno, i trajno.** Značenje tog reda uključuje
  API/`422` ponašanje u vlasništvu `P5-I5` (D-064). **`P5-I2` ga ne smije označiti.**
- **Proglasiti `P5-I5` autorizovanim jer je njegov tvrdi preduslov ispunjen** — **odbijeno.**
  Ispunjen preduslov uklanja **blokadu**, ne zamjenjuje **autorizaciju**.
- **Tvrditi da polovina A sama dokazuje `★`** — **odbijeno.** Test koji dokaže samo prvi iskaz je
  po `08` §12.9.1 **nevažeći**.
- **Tvrditi da `42501` dokazuje polovinu B** — **odbijeno**, i **trajno**.
- **Promovisati neku od opservacija `R1`–`R8` u bloker zatvaranja** — **odbijeno.** Nezavisni
  audit ih je klasifikovao kao **neblokirajuće**; njihova naknadna prekvalifikacija u ovom
  dokumentacijskom gateu bila bi tiha izmjena ishoda audita.
- **Prepisati D-064 / D-066 / D-067 tako da glase kao da je `★` oduvijek bio izvršen** —
  **odbijeno.** Vidi `RULING I`.

## Posljedice

- **`P5-I2V` je formalno zatvoren**; njegov status se u tekućim normativnim sekcijama više ne
  vodi kao budući, neizvršen ni neautorizovan.
- **`P5-I2` je kompletan, verifikovan, kanonski i formalno zatvoren.** Sva četiri ratifikovana
  pod-gatea su iscrpljena; **nijedan `P5-I2` posao ne preostaje.**
- **Checklist Faze 5 je 49 / 9.** Red `Schema → RLS` je označen; `Tests → cross-tenant FK` ostaje
  neoznačen.
- **`04` §7.6a *NOVA BLOKIRAJUĆA OBAVEZA* je ispunjena**, a ne uklonjena — obaveza ostaje
  zapisana, sa `phase5-responsible-physician-ri.security.ts` kao trajnim vlasnikom njenog dokaza
  i **trajnom regresijom**.
- **`08` §12.9.1 više ne opisuje budući posao** — opisuje zatečeni, izvršeni i auditirani dokaz.
- **`P5-I5` postaje `ELIGIBLE FOR SEPARATE OWNER AUTHORIZATION` nakon što D-068 postane
  kanonski**, i **ostaje `NOT AUTHORIZED`.**
- **Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.** Preostalih **šest** slice-ova (`P5-I3`–`P5-I8`)
  ostaje **`NOT_STARTED`**.
- **Neblokirajuće opservacije `R1`–`R8` ostaju otvorene kao neblokirajuće** i **nisu** uslov
  zatvaranja `P5-I2V` ni `P5-I2`.

## Security/privacy uticaj

- **Nula nove sposobnosti.** Odluka je isključivo dokumentaciona, a i sam `P5-I2V` je bio
  **TEST-ONLY**.
- **Sigurnosna površina se ne mijenja** — grantovi, politike, `FORCE RLS`, role i allowlista
  ostaju tačno onakvi kakvi su merged u `31de9523`.
- **Sigurnosna površina je u odnosu na prethodni zapis dokazana, ne proširena:** noseća
  pretpostavka mehanizma iz D-062, Dio D — **da PostgreSQL provjere referencijalnog integriteta
  zaobilaze RLS** — prestaje biti pretpostavka i postaje **empirijski dokazana nad Faza-5
  schemom**, pod stvarnim rolama i stvarnim `FORCE RLS`-om.
- **RLS nije oslabljen da bi RI prošao.** To je tačno tvrdnja polovine B, i ona je dokazana uz
  potpuno isključenje lažno pozitivnih uzroka (`RULING D`).
- **Nijedan `SECURITY DEFINER`, `BYPASSRLS`, četvrta rola, owner politika, proširenje politike
  `practice_memberships_self_select`, drugi klijent ni proširenje allowliste nisu uvedeni** —
  ni kao rješenje, ni kao zaobilaznica, ni kao dijagnostika.
- **`copilot_app` i dalje drži isključivo `SELECT` nad `practice_memberships`**, `PUBLIC` i
  `copilot_system` **nulu**.
- **Co-member identitet i dalje ne curi** — polovina B je upravo dokaz da ne curi.

## Migration/rollout

**Nijedna migracija se ovom odlukom ne kreira, ne mijenja, ne preimenuje i ne izvršava; nijedna
baza nije kontaktirana.** `P5-I2V` **nije uveo nijednu migraciju.** Kanonski primijenjen lanac
ostaje **sedam** direktorija, nepromijenjen od D-067:

```text
001          extensions and roles
002          identity and practices
013          [Faza-4 slice]
003          [P5-I1]
011_phase5   [P5-I2A]   20260823211546_011_jobs_idempotency_outbox_audit_phase5
013_phase5   [P5-I2B]   20260825013452_013_rls_policies_phase5
014_phase5   [P5-I2C]   20260825214248_014_immutability_triggers_phase5
```

**Nijedna Faza-5 migracija ne preostaje.**

## Test dokaz

**Testovi se ovom odlukom ne implementiraju, ne mijenjaju i ne izvršavaju.** Trajni vlasnik
dokaza **`★`** je **`apps/api/test/phase5-responsible-physician-ri.security.ts`**, uveden
kanonskom implementacijom `P5-I2V` po D-064, `OD-9`. **Taj fajl postoji i kanonski je** — **13**
testova. Taj fajl posjeduje:

- **punu katalošku identičnost composite FK-a** u jednom strogom poređenju cijelog reda —
  `MATCH SIMPLE`, `NO ACTION` / `NO ACTION`, `convalidated`, ne-odgodiv, ne inicijalno odgođen,
  i tačan roditeljski indeks;
- **pozicijsko mapiranje kolona FK-a** — `(practice_id, responsible_physician_id)` →
  `(practice_id, user_id)`;
- **identičnost roditeljskog ključa** — `practice_memberships_practice_user_key`, unique, valid,
  total, tačno `(practice_id, user_id)`;
- **`practice_memberships` `ENABLE` + `FORCE ROW LEVEL SECURITY`**;
- **tačno jednu politiku** — `practice_memberships_self_select`, `PERMISSIVE`, `SELECT`,
  `TO copilot_app`, **bajt-identična i neoslabljena**;
- **tačan grant** — `copilot_app` drži `SELECT` **i ništa drugo**; `PUBLIC` i `copilot_system`
  **ništa**;
- **fizičko-egzistencijalnu diferencijalnu kontrolu za `B`** — zasebna transakcija, ista
  konekcija, isti SQL, isti parametri, **tačno jedan** red;
- **`★` u jednoj transakciji na istom klijentu** — dokazano kroz `pg_backend_pid()` i
  `pg_current_xact_id()`, uz dokaz da je kontrolna transakcija bila **druga** i rollbackovana
  **prije** `★`;
- **polovinu A** — `INSERT` uspijeva, red je asertiran kolonu po kolonu i
  `responsible_physician_id` **nije `NULL`**;
- **polovinu B** — **nula redova**, uzeto **nakon** uspjeha polovine A, u istom kontekstu;
- **own-membership kontrolu unutar `★`** — **tačno jedan** red;
- **izvršnu tvrdnju da `42501` nije polovina B**;
- **dokaz da `★` nije ostavio nijedan red** — sve je rollbackovano;
- **no-widening regresiju** — tri kanonske role bez `BYPASSRLS`, **nijedna** `SECURITY DEFINER`
  funkcija u bazi, **nijedna** politika nad `practice_memberships` koja cilja vlasnika,
  `§23.4` allowlista **tačno šest**, i dokaz da je AAD trigger nad `encounters` **`BEFORE UPDATE`
  only** i da na `★` **nije mogao okinuti**.

**Steady-state dokazi ostalih pod-gateova su očuvani i neoslabljeni:**
`phase5-schema-catalogue.security.ts` (paket `003`), `phase5-package011-catalogue.security.ts`
(paket `011`), `phase5-rls-grants.security.ts` (`P5-I2B`) i
`phase5-aad-immutability.security.ts` (`P5-I2C`). **Exact-set ekspektacije su i ovdje smjele
evoluirati isključivo `stari tačan skup → novi tačan skup`**; **`exact` → `contains`/`subset`/
`partial` ostaje kategorički zabranjeno.**

## Supersedes

**Supersedira isključivo statusne tvrdnje, i to tačno pet:**

1. **`P5-I2V` / `★` = `NOT EXECUTED`** — kao **tekuću** tvrdnju, gdje god stoji izvan datiranog
   historijskog zapisa odluke ili as-of-time bloka;
2. **`P5-I2V` / `★` = `NOT AUTHORIZED`** — kao **tekuću** tvrdnju, iz istog razloga;
3. **„`apps/api/test/phase5-responsible-physician-ri.security.ts` NE POSTOJI" / „dokaz `★` je
   odsutan"** — kao tekuće tvrdnje;
4. **`P5-I2` = `IN_PROGRESS` / `NOT COMPLETE`** i **„checklist Faze 5 = 49 / 8"** — kao tekuće
   tvrdnje;
5. **`P5-I5` = `BLOCKED`** — kao **tekuću** tvrdnju, i **isključivo** u smjeru
   `BLOCKED → ELIGIBLE`, **nikada** u smjeru `BLOCKED → AUTHORIZED`.

**Ne supersedira nijednu sigurnosnu klauzulu.** D-064 (`OD-1`–`OD-9`, obje korekcije, `★` hard
stop kao trajna regresija, segmentacija na četiri pod-gatea), D-065 (`RULING 1`, `RULING 2`),
D-066 (`RULING A`–`RULING D`) i D-067 (`RULING A`–`RULING G`) ostaju **na snazi bez izmjene**.
**D-060, D-061, D-062 i D-063 se ne diraju.**

## Zavisnosti

- **D-064** — sigurnosna granica i implementacijski ugovor `P5-I2`; segmentacija na **četiri**
  pod-gatea; *Prognoza checklista* i ratifikovani kriterij reda `Schema → RLS`; `OD-9` vlasništvo
  testova; `★` hard stop;
- **D-065** — korigovana aritmetika kataloga politika i eksplicitni transakcijski mehanizam;
- **D-066** — statusno pomirenje i formalno zatvaranje `P5-I2B`;
- **D-067** — statusno pomirenje i formalno zatvaranje `P5-I2C`;
- **D-062** (`OD-P5-D2-5`, Dio D) — composite FK `responsible_physician_id` i noseća pretpostavka
  koju **`★`** dokazuje;
- **D-061** — izostavljanje co-member `displayName`-a umjesto proširenja pristupa;
- **D-047** — bootstrap-scoped RLS i `practice_memberships_self_select`.

## Granice prema budućim fazama

- **`P5-I2V` je `CANONICAL` i `FORMALLY CLOSED`.**
- **`P5-I2` je `COMPLETE` / `VERIFIED` / `CANONICAL` / `FORMALLY CLOSED`.**
- **`P5-I5` je `ELIGIBLE FOR SEPARATE OWNER AUTHORIZATION`** — **nakon** što D-068 postane
  kanonski — i **`NOT AUTHORIZED`**. **Nijedan njegov korak ne počinje automatski.**
- **Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.**
- **`P5-I3`–`P5-I8` ostaju `NOT_STARTED`.**
- **Neblokirajuće opservacije `R1`–`R8` ostaju neblokirajuće** i ne uslovljavaju nijedan naredni
  gate.
- **`★` ostaje trajna regresija** — njegovo buduće rušenje je i dalje `HARD HOLD` i ponovo otvara
  `OD-P5-D2-5`.

## Naredni obavezni gate

**`P5-I5` — Encounter jezgro.** Njegov tvrdi preduslov **`★`** je **ispunjen**, pa je gate
**podoban za zasebnu vlasničku autorizaciju** nakon što ova odluka postane kanonska. **Ovom
odlukom nije autorizovan**; autorizacija je **zaseban vlasnički potez**, uz nepromijenjene
zavisnosti `P5-I3` i `P5-I4` (`04` §7.5).

**Ne autorizuju se, ni sada ni kasnije, kao dio `P5-I5`:** `SECURITY DEFINER`, `BYPASSRLS`, nova
rola, owner politika, proširenje `practice_memberships_self_select`, drugi Prisma klijent,
proširenje `§23.4` allowliste, denormalizacija `displayName`-a ni globalno `23503 → 422`
mapiranje.

## Anotacija tekućeg statusa (D-069, 2026-08-27) — historijsko tijelo D-068 se ne mijenja

**Ova anotacija stoji IZVAN i NAKON historijskog tijela D-068.** Nijedna rečenica iznad nije
prepisana, uklonjena ni preformulisana; sve gore navedeno ostaje **tačno na dan svog zapisa
(2026-08-27)**.

**Šta se precizira.** Formulacija *„Naredni obavezni gate — `P5-I5` — Encounter jezgro"* iznad je
**planska statusna tvrdnja** zapisana dok su **`P5-I3` i `P5-I4` bili `NOT_STARTED`** — što su i
ostali. Ona konstatuje da je `P5-I2` uklonio **tvrdi preduslov `★`** i time otvorio `P5-I5` kao
naredni **gate**; ona **nije** waivovala, preuredila, supersedirala ni uklonila deklarisane
zavisnosti `P5-I5`.

**D-069 razrješava tu dvosmislenost izvršnog redoslijeda bez prepisivanja D-068.**

**TEKUĆI izvršni redoslijed je:**

```text
P5-I3   ->   P5-I4   ->   P5-I5
```

jer **kolona zavisnosti D-062 (`04` §7.5) ostaje mjerodavna i nikada nije waivovana** — što D-068
i sam izričito potvrđuje rečenicom *„uz nepromijenjene zavisnosti `P5-I3` i `P5-I4` (`04` §7.5)"*.

**Status `P5-I5` „`ELIGIBLE FOR SEPARATE OWNER AUTHORIZATION`" iz `RULING H` znači:**

```text
podoban NAKON ispunjenja svojih deklarisanih zavisnosti
```

**a NE:**

```text
ovlašten da preskoči P5-I3 i P5-I4
```

**Tekući status (D-069):** **`P5-I3` = `NEXT` / `NOT AUTHORIZED`**; **`P5-I4` = poslije `P5-I3` /
`NOT_STARTED`**, i **posjeduje** D-056 facade obavezu, idempotency servis, audit writer,
`request_sha256` kanonizaciju i audit self-hash; **`P5-I5` = `POLICY-RESOLVED` /
`DEPENDENCY-BLOCKED` / `NOT AUTHORIZED` / `NOT STARTED`**. **Checklist Faze 5 ostaje `49 / 9`** —
D-069 **ne mijenja nijednu kućicu**. **Faza 5 ostaje `IN_PROGRESS`.**

**Nijedna sigurnosna klauzula D-068 nije dirnuta**; `RULING A`–`RULING I` ostaju na snazi bez
izmjene, uključujući **`★` kao trajnu regresiju**.

---

# D-069 — `P5-I5` preflight vlasničke odluke: redoslijed zavisnosti i cross-cutting ugovori

- **Status:** ACCEPTED / OWNER-RATIFIED
- **Datum:** 2026-08-27
- **Tip:** vlasnički ratifikovan **governance zapis pet preflight odluka** koje su prethodno
  držale kanonski read-only preflight `P5-I5` u ishodu
  `P5_I5_PREFLIGHT_HOLD_OWNER_DECISION_REQUIRED`. **Dokumentacija isključivo.**
- **Amandman na:** **statusne i ugovorne tvrdnje** — ne na sigurnosni dizajn. Sigurnosni ugovori
  **D-054**, **D-055**, **D-056**, **D-060**, **D-061**, **D-062**, **D-063**, **D-064**,
  **D-065**, **D-066**, **D-067** i **D-068** ostaju **doslovno na snazi i nepromijenjeni**.
- **Ova odluka NE implementira ništa.** Ne implementira `P5-I3`, `P5-I4` ni `P5-I5`; ne implementira
  idempotency servis, audit writer, `TenantDatabaseService` facade, encounter rute, kripto/HMAC ni
  normalizaciju; ne mijenja nijednu migraciju, schemu, Prisma model, contract TypeScript, test ni
  sigurnosni objekat baze. **Nijedna baza nije kontaktirana** i **nijedan test se ovom odlukom ne
  izvršava.**
- **Ova odluka NE označava nijednu kućicu.** Checklist Faze 5 ostaje **`49 / 9`**.
- **Ova odluka NE autorizuje nijedan slice.** Ni `P5-I3`, ni `P5-I4`, ni `P5-I5`.

## Kontekst/problem — trigger

Nakon što je D-068 zatvorio `P5-I2V` i kompletirao roditeljski gate `P5-I2`, izveden je kanonski
**read-only preflight `P5-I5`**. Njegov ishod je bio
**`P5_I5_PREFLIGHT_HOLD_OWNER_DECISION_REQUIRED`**, sa **pet** neriješenih vlasničkih pitanja:

```text
OD-P5-I5-1   redoslijed zavisnosti naspram D-068 formulacije "naredni obavezni gate"
OD-P5-I5-2   not-found / conflict semantika encounter write putanje
OD-P5-I5-3   vlasništvo idempotency servisa i audit writera
OD-P5-I5-4   definicija idempotency_keys.request_sha256
OD-P5-I5-5   definicija audit_events.event_sha256 i previous_event_sha256
```

**Vlasnik je ratifikovao svih pet.** Ovaj zapis ih konstatuje kao odluke i izvodi njihovo
dokumentaciono pomirenje. **On ne bira nijednu opciju iznova** i **ne pretvara riješeni preflight
u implementacijsku autorizaciju.**

## Odluka

### `RULING 1` — `OD-P5-I5-1`: kanonski redoslijed izvršenja je `P5-I3 → P5-I4 → P5-I5`

**Kanonski redoslijed izvršenja ostaje:**

```text
P5-I3   ->   P5-I4   ->   P5-I5
```

**Deklaracije zavisnosti iz D-062, materijalizovane u `04` §7.5, ostaju mjerodavne i nisu
waivovane.** `P5-I5` zavisi od **`P5-I2` uključujući `★`**, od **`P5-I3`** i od **`P5-I4`**.

```text
P5-I2 / ★     COMPLETE / VERIFIED / CANONICAL / FORMALLY CLOSED   (D-068)
P5-I3         NOT_STARTED
P5-I4         NOT_STARTED
```

**Zato se `P5-I5` NE SMIJE implementirati prije nego što `P5-I3` i `P5-I4` postanu kanonski.**

**Formulacija D-068 da je `P5-I5` „naredni obavezni gate" NIJE waivovala, preuredila, supersedirala
ni uklonila te zavisnosti.** Ona je **planska statusna formulacija** zapisana dok su `P5-I3` i
`P5-I4` bili — i ostali — `NOT_STARTED`, i **tačna je kao takva**: `P5-I5` jeste naredni gate koji
je `P5-I2` odblokirao. **Za TEKUĆE sekvenciranje izvršenja ona je supersedirana ovom odlukom**,
aditivno, bez prepisivanja tijela D-068 (`RULING 7`).

**Naredni implementacijski slice je `P5-I3`.** Nakon kanonskog `P5-I3` slijedi **`P5-I4`**. Nakon
kanonskog `P5-I4` slijedi **`P5-I5`**.

**Podobnost `P5-I5` iz D-068 `RULING H` znači: podoban NAKON ispunjenja deklarisanih zavisnosti** —
**ne** ovlašten da preskoči `P5-I3` i `P5-I4`.

### `RULING 2` — `OD-P5-I5-2`: not-found / conflict semantika encounter write putanje

#### 2.1 `PATCH /api/v1/encounters/{encounterId}`

**Jedan atomičan optimistički `UPDATE`. Diskriminirajući pre-read NIJE dozvoljen.**

Ako atomičan `UPDATE` vrati **nula redova**:

```text
HTTP 409   VERSION_CONFLICT
```

**bez obzira** je li nula redova nastala zbog **zastarjele verzije**, **nepostojećeg reda** ili
**tenant-nevidljivog reda.** Write putanja te uzroke **ne razlikuje pre-readom**.

Ovo **namjerno slijedi ratifikovani presedan D-055** (klauzule 16, 19–21), doslovno preuzet iz
`03` §10, *Mehanika optimističkog update-a*: zabranjen aplikacijski pre-read, jedan ishod za nulu
pogođenih redova, i namjerna asimetrija `GET`/`PATCH` koja **ne uvodi race-prone
read-before-write diskriminator**.

#### 2.2 `POST /api/v1/encounters/{encounterId}/cancel`

**API semantika je:**

| Slučaj | Status | Code |
|---|---:|---|
| encounter je **vidljiv**, ali tranzicija/stanje nije dozvoljeno | **`409`** | **`INVALID_STATE_TRANSITION`** |
| encounter **ne postoji** ili je **tenant-nevidljiv** | **`404`** | **`RESOURCE_NOT_FOUND`** |

**Implementacija tu razliku mora dobiti race-free.**

**Opšti read-before-write existence oracle NIJE ovlašten.**

**Preferirana implementacijska pozicija:** **jedan ograničen atomičan SQL iskaz / CTE** ili
ekvivalentan database-side oblik iskaza, **unutar iste admitovane tenant transakcije**.

**Usko ograničen naknadni iskaz** smije se koristiti **isključivo** ako eventualna implementacija
dokaže da je nužan **i** ako očuva **istu semantiku**: ista transakcija, tenant-filtrirano, bez
enumeracije. **Nijedan generički cross-tenant existence oracle nije ovlašten.**

#### 2.3 `POST /api/v1/encounters` — `patientReferenceId`

**Cross-tenant ili nepostojeći `patientReferenceId` koji obori**

```text
encounters_patient_reference_fk
```

**NE SMIJE se mapirati kroz translator odgovornog ljekara.** On **ostaje izvan** uskog izuzetka
`23503 → 422` i **propada u kanonsku internal-error putanju**.

**Isključivo**

```text
encounters_responsible_physician_membership_fk
```

**dobija specijalno mapiranje `422 VALIDATION_ERROR`**, sa generičkom porukom koja ne citira
vrijednost (D-062, Dio D; `04` §7.6a; `08` §12.9.2).

**Globalno `23503 → 422` mapiranje ostaje ZABRANJENO.**

### `RULING 3` — `OD-P5-I5-3`: `P5-I4` posjeduje idempotency servis, audit writer i D-056 facade

**`P5-I4` posjeduje i implementira Faza-5 cross-cutting kapacitete:**

- **idempotency servis**;
- **audit writer**.

**`P5-I4` je njihov prvi kanonski konzument.** **`P5-I5` ih konzumira nepromijenjene.**

**Zato `P5-I5` NE SMIJE samostalno izmisliti ni forkovati:** idempotency semantiku; request
hashing; audit-event hashing; audit writer; duplicate-key handling; request-in-progress handling;
audit transakcijsku semantiku.

**`P5-I4` mora implementirati te cross-cutting kapacitete prije nego što `P5-I5` smije početi.**

**Ova odluka takođe AKTIVIRA kanonsku uslovnu obavezu D-056.** `P5-I4` je **prvi stvarni Faza-5
tenant business modul** koji traži da se poslovni SQL izvršava nad **istom pinovanom tenant
transakcijom**. Time je uslovni trigger iz D-056, dio A — „**kada stvarni tenant business
repozitorij/modul zatraži tu apstrakciju**" — **ispunjen imenovanim vlasnikom**.

**Zato `P5-I4` posjeduje uspostavu `TenantDatabaseService` facadea** — ili kanonski ekvivalentne
tanke apstrakcije koju D-056 već imenuje.

**Devet checklist obaveza D-056 (`05` §6, *Konkretan `TenantDatabaseService` facade — prenesena
obaveza*) postaju kriteriji prihvatanja u vlasništvu `P5-I4`.** Nijedna nije uklonjena, oslabljena
ni označena završenom. Facade mora očuvati:

```text
jedan PrismaClient
jedna interaktivna transakcija
kanonski redoslijed admisije
nema caller-supplied identiteta
nema ranog app.practice_id
nema drugog neograničenog DB puta
nema RLS bypassa
nema sigurnosnog proširenja
```

**`P5-I5` kasnije ponovo koristi tu apstrakciju.** **Nijedan facade kod nije ovlašten ovim
dokumentacijskim gateom.**

### `RULING 4` — `OD-P5-I5-4`: `idempotency_keys.request_sha256`

**Definicija:**

```text
request_sha256 = SHA-256(
    RFC 8785 (JSON Canonicalization Scheme) reprezentacija
    VALIDIRANOG PARSIRANOG TIJELA ZAHTJEVA
)
```

- **Encoding ulaza:** UTF-8 bajtovi kanonskog JSON-a.
- **Izlaz:** **64 mala heksadecimalna znaka** (lowercase hex).

**Uključeno:** **isključivo validirano tijelo klijentskog zahtjeva.**

**Isključeno:** HTTP metod; ruta/path; query string; headeri; sam `Idempotency-Key`;
autentifikacijski identitet; identitet ordinacije; request id; server-generisani id-evi;
server-izvedeni status; server timestampovi; svako drugo server-izvedeno polje.

**Razlog:** kanonski idempotency scope **već sadrži `endpoint` zasebno** (`03` §4: *key scope =
practice + user + endpoint*; `02` §11 `unique (practice_id, user_id, endpoint, idempotency_key)`).
Metod i path se zato **ne dupliraju** u request hash.

**Semantički zahtjevi:**

- **`null` i odsustvo polja ostaju različiti**;
- **redoslijed elemenata niza ostaje značajan**;
- **ulazni redoslijed ključeva objekta je irelevantan** — RFC 8785 ga kanonizuje;
- **razlike u whitespaceu su irelevantne**;
- **ekvivalentni parsirani JSON objekti kanonizuju se u isti digest**;
- **različita validirana tijela daju različite digeste**, osim pri kriptografskoj koliziji.

**Format je perzistentan i MORA biti pinovan fiksnim test vektorima.**

**Vlasnik implementacije: `P5-I4`.**

### `RULING 5` — `OD-P5-I5-5`: Faza-5 audit hash je SELF-HASH ONLY

**Faza 5 koristi ISKLJUČIVO self-hash.**

**Za svaki Faza-5 audit događaj:**

```text
previous_event_sha256 = NULL
```

**Nijedan Faza-5 linearni hash lanac se NE tvrdi.** Per-practice, per-resource i globalno
predecessor ulančavanje su **eksplicitno ODGOĐENI** u kasniju governance odluku. Ta buduća odluka
mora zasebno riješiti: **obuhvat lanca; redoslijed; zaključavanje; konkurentne pisce; sprečavanje
forka; interakciju sa retentionom; genesis semantiku.** **Faza 5 te semantike NE SMIJE prećutno
izmisliti.**

**Definicija `event_sha256`:**

```text
event_sha256 = SHA-256(
    RFC 8785 (JSON Canonicalization Scheme) reprezentacija
    KONAČNOG POHRANJENOG AUDIT PAYLOADA,
    bez samog event_sha256
)
```

- **Encoding ulaza:** UTF-8 bajtovi kanonskog JSON-a.
- **Izlaz:** **64 mala heksadecimalna znaka** (lowercase hex).
- **JSON ključevi MORAJU koristiti imena kolona baze.**

**Kanonski hash payload sadrži tačno ova konačna pohranjena polja:**

```text
id
practice_id
occurred_at
actor_type
actor_user_id
actor_service
action
resource_type
resource_id
request_id
session_id_hash
ip_address
user_agent_hash
previous_value
new_value
metadata
previous_event_sha256
```

**Obavezno:**

- **`previous_event_sha256` je u payloadu predstavljen kao JSON `null`** — polje je prisutno, ne
  izostavljeno;
- **`event_sha256` je isključen** iz payloada;
- **`id` i `occurred_at` MORAJU biti generisani tačno jednom prije hashiranja**, i **iste**
  vrijednosti korištene u hash payloadu **MORAJU** biti upisane u `audit_events`. **Putanja
  „generiši ponovo tokom `INSERT`-a" nije dozvoljena** — nijedan database default ni aplikacijski
  ponovni poziv ne smije proizvesti vrijednost različitu od hashirane;
- **`previous_value`, `new_value` i `metadata` moraju koristiti svoju konačnu sanitizovanu
  pohranjenu reprezentaciju prije hashiranja** (`02` §15.4; `09` §12; D-062, Dio F.3).

**Vlasnik implementacije: `P5-I4`.**

### `RULING 6` — posljedica po preflight `P5-I5`

**Svih pet vlasničkih politika pitanja je RIJEŠENO / VLASNIČKI RATIFIKOVANO:**

```text
OWNER_DECISIONS_REQUIRED_FOR_P5_I5 = 0
```

**Ishod preflighta se time NE pretvara** u
`P5_I5_PREFLIGHT_PASS_READY_FOR_OWNER_AUTHORIZATION`, jer `RULING 1` čini **`P5-I3`** narednim
izvršnim ciljem.

**Tačna tekuća dispozicija:**

```text
P5-I5   POLICY-RESOLVED / DEPENDENCY-BLOCKED / NOT AUTHORIZED / NOT STARTED
```

Preostale zavisnosti: **`P5-I3`** i **`P5-I4`**. **Formulacija „ready for implementation now" je
netačna i ne smije se koristiti.** Svjež preflight `P5-I5` ili uzak pre-execution checkpoint smije
se izvesti **nakon `P5-I4`**, ako je potrebno potvrditi da nije nastao drift.

### `RULING 7` — očuvanje historijskog zapisa

**Historijska tijela odluka D-055, D-056, D-060, D-062, D-064 i D-068 — i svake ranije odluke — se
NE prepisuju.** D-069 je **aditivan**. Formulacija D-068 „naredni obavezni gate je `P5-I5`" je
**tačna na dan svog zapisa** i ostaje zapisana; supersedirana je **isključivo kao tekuće
sekvenciranje izvršenja**, po precedentu D-063, D-065, D-066, D-067 i D-068.

**Nema renumeracije odluka. Nema brisanja historijski tačnog as-of-time teksta.**

## Obuhvat

D-069:

- **konstatuje** vlasničku ratifikaciju svih pet preflight odluka `OD-P5-I5-1` … `OD-P5-I5-5`;
- **fiksira** tekući izvršni redoslijed `P5-I3 → P5-I4 → P5-I5`;
- **fiksira** not-found / conflict semantiku encounter write putanje;
- **dodjeljuje** `P5-I4` vlasništvo nad idempotency servisom, audit writerom i D-056 facadeom;
- **definiše** `request_sha256` i `event_sha256`;
- **odgađa** predecessor ulančavanje audita izvan Faze 5;
- **NE mijenja** nijednu sigurnosnu klauzulu;
- **NE označava** nijednu kućicu — checklist ostaje `49 / 9`;
- **NE autorizuje** `P5-I3`, `P5-I4` ni `P5-I5`;
- **NE implementira** nijednu liniju koda;
- **NE zatvara** Fazu 5.

## Razlog

- **Deklarisana zavisnost se ne gasi planskom formulacijom.** D-068 je `P5-I5` nazvao narednim
  obaveznim gateom jer je upravo uklonio njegov **tvrdi preduslov `★`**. Uklonjena blokada nije
  ispunjena zavisnost: `04` §7.5 i dalje traži `P5-I3` i `P5-I4`, i sam D-068 to izričito potvrđuje
  („zavisnosti `P5-I3` i `P5-I4` ostaju nepromijenjene"). Čitati to kao dozvolu za preskakanje
  značilo bi tiho waivovati D-062.
- **Optimistička write putanja mora ostati jednoiskazna.** D-055 je već ratifikovao da `PATCH`
  nulu pogođenih redova rješava **bez** diskriminirajućeg čitanja. Uvesti pre-read na
  `PATCH /encounters` značilo bi uvesti tačno onaj race-prone diskriminator koji je Faza 4 odbila.
- **`cancel` ipak mora razlikovati `404` i `409`**, jer su to dvije različite poruke klijentu; ali
  ta razlika se mora dobiti **unutar iste tenant transakcije**, a ne opštim existence oracleom koji
  bi postao cross-tenant enumeracijski kanal.
- **Usko FK mapiranje mora ostati usko.** `encounters_patient_reference_fk` i
  `encounters_responsible_physician_membership_fk` imaju različit uzrok i različitog klijenta;
  spojiti ih pod isti `422` značilo bi de facto uvesti globalno `23503 → 422`, koje je zabranjeno.
- **Cross-cutting se piše jednom, kod prvog konzumenta.** Da idempotency i audit ostanu
  nedodijeljeni do `P5-I5`, `P5-I4` bi ih morao improvizovati ili duplirati, pa bi Faza 5 završila
  sa dva različita request-hash i audit-hash ponašanja.
- **D-056 trigger je uslovan, i uslov je sada imenovan.** `P5-I4` je prvi stvarni tenant business
  modul Faze 5; dodijeliti obavezu njemu je jedino čitanje D-056 koje ne ostavlja obavezu bez
  vlasnika.
- **Hash koji nije pinovan nije ugovor.** `request_sha256` i `event_sha256` su perzistentni;
  promjena algoritma nakon prvog upisa retroaktivno obezvrjeđuje sve ranije redove. Zato su ovdje
  definisani do bajta, sa RFC 8785 kao jedinim kanonizatorom i fiksnim test vektorima kao obavezom.
- **Lanac koji se ne može dokazati ne smije se tvrditi.** Predecessor ulančavanje traži rješenje
  obuhvata, redoslijeda, zaključavanja, konkurentnih pisaca i genesis semantike. Tvrditi lanac dok
  ta pitanja nisu riješena značilo bi obećati tamper-evidence koju sistem ne pruža; zato Faza 5
  eksplicitno piše `previous_event_sha256 = NULL`.
- **Riješena politika nije autorizacija.** Isto pravilo koje je razdvojilo podobnost od
  autorizacije u D-068 `RULING H` vrijedi i ovdje: nula preostalih vlasničkih odluka ne pokreće
  nijedan slice.

## Alternative

- **Implementirati `P5-I5` odmah, jer je D-068 nazvao „narednim obaveznim gateom"** — **odbijeno.**
  Zavisnosti `P5-I3` i `P5-I4` nikada nisu waivovane, a D-068 ih izričito zove nepromijenjenim.
- **Prepisati D-068 tako da glasi kao da je oduvijek pokazivao na `P5-I3`** — **odbijeno.**
  `RULING 7`; D-068 je bio tačan na dan zapisa.
- **Uvesti pre-read na `PATCH /encounters` radi „boljeg" `404`** — **odbijeno.** Prekršilo bi
  D-055, klauzule 16 i 19–21 i uvelo race-prone diskriminator.
- **Vratiti `409 VERSION_CONFLICT` i za `cancel` nepostojećeg encountera** — **odbijeno.** `cancel`
  nema `If-Match` ugovor; `409` bi klijentu tvrdio konflikt verzija koji ne postoji.
- **Uvesti opšti existence oracle za oba write endpointa** — **odbijeno, i trajno.** To je
  cross-tenant enumeracijski kanal, bez obzira na formulaciju.
- **Proširiti `23503 → 422` i na `encounters_patient_reference_fk`** — **odbijeno.** Prvi korak ka
  globalnom mapiranju koje je zabranjeno.
- **Dati `P5-I5` vlasništvo nad idempotency/auditom jer ih „najviše koristi"** — **odbijeno.**
  `P5-I4` ih treba prvi; odgoditi vlasništvo znači ili duplikaciju ili blokadu `P5-I4`.
- **Otvoriti zaseban slice samo za facade + idempotency + audit** — **odbijeno.** To bi promijenilo
  ratifikovanu segmentaciju od osam slice-ova; kapaciteti su **podržavajuće obaveze `P5-I4`**, ne
  novi slice.
- **Hashirati sirovi request body umjesto validiranog parsiranog tijela** — **odbijeno.** Sirovi
  bajtovi čine whitespace i redoslijed ključeva semantički značajnim, pa bi identičan poslovni
  zahtjev dobio dva ključa.
- **Uključiti metod, path ili `Idempotency-Key` u `request_sha256`** — **odbijeno.** `endpoint` je
  već dio scopea; duplikacija stvara dva izvora istine.
- **Implementirati linearni audit lanac u Fazi 5** — **odbijeno.** Vidi `RULING 5`.
- **Izostaviti `previous_event_sha256` iz hash payloada umjesto da bude `null`** — **odbijeno.**
  Payload bi tada morao mijenjati oblik kada lanac kasnije bude uveden, čime bi svi Faza-5 digesti
  postali neprovjerljivi.

## Posljedice

- **Naredni implementacijski slice je `P5-I3`**, i on je **`NOT AUTHORIZED`** — traži zaseban
  read-only preflight i zasebnu vlasničku autorizaciju.
- **`P5-I4` je poslije `P5-I3`**, `NOT_STARTED`, i **nosi pet dodatnih obaveza**: D-056 facade,
  idempotency servis, audit writer, `request_sha256` kanonizacija, audit self-hash.
- **`P5-I5` je policy-resolved i dependency-blocked**, `NOT AUTHORIZED`, `NOT STARTED`.
- **`OWNER_DECISIONS_REQUIRED_FOR_P5_I5 = 0`.**
- **Devet D-056 facade redova ostaje NEOZNAČENO** i ostaje neoznačeno dok `P5-I4` ne bude
  implementiran, verifikovan, kanonski i formalno pomiren.
- **Checklist Faze 5 ostaje `49 / 9`.** **Nijedna kućica se ovom odlukom ne mijenja.**
- **Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.** Šest slice-ova (`P5-I3`–`P5-I8`) ostaje
  **`NOT_STARTED`**.
- **`02` §11 i §15 kolone `request_sha256`, `event_sha256` i `previous_event_sha256` dobijaju
  algoritamski ugovor**, koji do sada nije postojao ni u jednom kanonskom dokumentu. Kolone,
  tipovi i constrainti se **ne mijenjaju**.
- **`09` §8 stavka „audit chain: SHA-256" se čita kao primjena SHA-256 na audit integritet**, a
  **ne** kao tvrdnja da Faza 5 već implementira predecessor lanac.

## Security/privacy uticaj

- **Nijedno sigurnosno proširenje.** Ne uvodi se nijedan grant, `REVOKE`, rola, politika, trigger,
  funkcija, `SECURITY DEFINER`, `BYPASSRLS` ni migracija.
- **Zabrana existence oraclea je sigurnosna klauzula**, ne stilska: opšti read-before-write
  diskriminator nad `encounters` bio bi cross-tenant enumeracijski kanal (`T1`, `09` §18.1).
- **Zabrana globalnog `23503 → 422` ostaje na snazi**, i `encounters_patient_reference_fk` je
  eksplicitno izvan uskog izuzetka — inače bi klijent iz statusnog koda mogao zaključivati o
  postojanju tuđih `patient_references` redova.
- **`request_sha256` se računa nad validiranim tijelom**, koje u Fazi 5 može sadržavati PHI; digest
  je jednosmjeran, ali **sam digest nije redakcija** — pravilo `09` §8 („SHA-256 nije enkripcija")
  i zabrana logovanja tijela ostaju nepromijenjeni.
- **Audit payload se hashira tek nakon sanitizacije** `previous_value`, `new_value` i `metadata`,
  pa hash nikada ne pina nesanitizovan PHI (`02` §15.4; `09` §12; D-062, Dio F.3).
- **Odsustvo lanca je zapisano, ne prećutno.** `previous_event_sha256 = NULL` znači da Faza 5 daje
  **per-event integritet**, ne **tamper-evident sekvencu**; append-only garancija i dalje počiva na
  `revoke update, delete, truncate` nad `audit_events` (`02` §15).

## Test dokaz

**Ovom odlukom se nijedan test ne izvršava i nijedan test fajl ne kreira.** Zapisuju se obaveze
budućih vlasnika:

- **`P5-I4`** — fiksni test vektori za `request_sha256`: isti parsirani objekat sa različitim
  redoslijedom ključeva daje **isti** digest; `null` naspram odsutnog polja daje **različit**
  digest; različit redoslijed elemenata niza daje **različit** digest; razlike u whitespaceu daju
  **isti** digest.
- **`P5-I4`** — fiksni test vektori za `event_sha256`: hash je nezavisan od redoslijeda ključeva;
  `previous_event_sha256` je u payloadu `null`; `event_sha256` nije u payloadu; `id` i `occurred_at`
  u pohranjenom redu su **identični** onima korištenim pri hashiranju.
- **`P5-I4`** — D-054, klauzule 6–10 ponovo dokazane prije prihvatanja facadea (D-056, klauzula 5).
- **`P5-I5`** — `PATCH` nad nepostojećim, tenant-nevidljivim i stale encounterom daje **`409
  VERSION_CONFLICT`** bez ijednog dodatnog čitanja; `cancel` nad vidljivim encounterom u
  nedozvoljenom stanju daje **`409 INVALID_STATE_TRANSITION`**, a nad nepostojećim/nevidljivim
  **`404 RESOURCE_NOT_FOUND`**; `POST /encounters` sa cross-tenant `patientReferenceId` **ne** daje
  `422`.

## Supersedes

**Supersedira isključivo statusne i sekvencijske tvrdnje, i to tačno tri:**

1. **„Naredni obavezni gate je `P5-I5`"** — kao **tekuću tvrdnju o sekvenciranju izvršenja**,
   gdje god stoji izvan datiranog historijskog zapisa odluke ili as-of-time bloka. Tekući naredni
   izvršni slice je **`P5-I3`**.
2. **`P5-I5` = `ELIGIBLE FOR SEPARATE OWNER AUTHORIZATION`** — **precizira se**, ne poništava:
   podobnost vrijedi **nakon** ispunjenja deklarisanih zavisnosti; tekuća dispozicija je
   **`POLICY-RESOLVED` / `DEPENDENCY-BLOCKED` / `NOT AUTHORIZED` / `NOT STARTED`**.
3. **`P5_I5_PREFLIGHT_HOLD_OWNER_DECISION_REQUIRED` sa pet neriješenih odluka** — kao **tekući**
   ishod preflighta. Historijski zapis tog ishoda ostaje tačan; **tekuće** je
   `OWNER_DECISIONS_REQUIRED_FOR_P5_I5 = 0`.

**Ne supersedira nijednu sigurnosnu klauzulu.** D-054, D-055, D-056, D-060, D-061, D-062, D-063,
D-064, D-065, D-066, D-067 i D-068 ostaju **na snazi bez izmjene**.

## Zavisnosti

- **D-062** (`04` §7.5) — deklaracije zavisnosti slice-ova Faze 5; `OD-P5-D2-5` composite FK i usko
  mapiranje `23503`; Dio F.3 sanitizacija `reason`-a; Dio H.2 patchable skup.
- **D-055** (klauzule 16, 19–21) — presedan jednoiskazne optimističke write putanje bez pre-reada.
- **D-056** (dio A, klauzula 5) — uslovno odgođen `TenantDatabaseService` facade i njegov trigger.
- **D-054** (klauzule 6–10) — invarijanti koje facade mora ponovo dokazati.
- **D-060** (klauzule 39–41) — generičke poruke greške, sanitizacija, redakcija nije granica.
- **D-064** — ratifikovana segmentacija `P5-I2` i vlasništvo reda `Tests → cross-tenant FK` u
  `P5-I5`.
- **D-068** — kompletiranje `P5-I2`, checklist `49 / 9`, granica podobnosti `P5-I5`.
- **D-028** / **D-029** — idempotency scope i optimistic locking ugovor.

## Granice prema budućim fazama

- **`P5-I3` je naredni implementacijski slice** i **`NOT AUTHORIZED`**. Traži zaseban read-only
  preflight i zasebnu vlasničku autorizaciju. **Ovom odlukom nije autorizovan.**
- **`P5-I4` je poslije `P5-I3`**, **`NOT_STARTED`**, i **`NOT AUTHORIZED`**. Ostaje **slice
  `patient_references`**; cross-cutting kapaciteti su **njegove podržavajuće obaveze**, ne novi
  slice.
- **`P5-I5` je policy-resolved i dependency-blocked**, **`NOT AUTHORIZED`**, **`NOT STARTED`**.
- **Predecessor ulančavanje audita je odgođeno** u zasebnu buduću governance odluku.
- **Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.** Checklist ostaje **`49 / 9`**.
- **`★` ostaje trajna regresija** — njegovo buduće rušenje je i dalje `HARD HOLD` i ponovo otvara
  `OD-P5-D2-5`.
- **Ne autorizuju se, ni sada ni kasnije, kao dio `P5-I3`, `P5-I4` ni `P5-I5`:** `SECURITY DEFINER`,
  `BYPASSRLS`, nova rola, owner politika, proširenje `practice_memberships_self_select`, drugi
  Prisma klijent, proširenje `§23.4` allowliste, denormalizacija `displayName`-a, globalno
  `23503 → 422` mapiranje, opšti cross-tenant existence oracle ni Faza-5 linearni audit lanac.

## Naredni obavezni gate

**`P5-I3` — kripto/HMAC/normalizacijski primitivi.** Njegova kolona zavisnosti je prazna
(`04` §7.5), pa je on **tekući izvršni cilj**. **Ovom odlukom nije autorizovan**; autorizacija je
**zaseban vlasnički potez** nakon zasebnog read-only preflighta.

**Prije toga, sama D-069 mora postati kanonska** — kroz zaseban push/PR gate i zaseban
merge/verifikacijski gate. **Dok D-069 ne bude merged, kanonski `main` i dalje nosi D-068
formulaciju „naredni obavezni gate je `P5-I5`".**

---

# D-070 — `P5-I3` preflight vlasničke odluke: vlasništvo primitiva, `MANUAL` v1 maksimum, konfiguracija ključeva i ugovor redakcije

- **Status:** ACCEPTED / OWNER-RATIFIED
- **Datum:** 2026-08-28
- **Tip:** vlasnički ratifikovan **governance zapis pet preflight odluka** koje su prethodno
  držale kanonski read-only preflight `P5-I3` u ishodu
  `P5_I3_PREFLIGHT_HOLD_OWNER_DECISION_REQUIRED`. **Dokumentacija isključivo.**
- **Amandman na:** **statusne i ugovorne tvrdnje**, plus **jedan prazan referent** iz D-060
  (klauzula 10, stavka 8) — **ne** na sigurnosni dizajn. Sigurnosni ugovori **D-018**, **D-025**,
  **D-054**, **D-055**, **D-056**, **D-060**, **D-061**, **D-062**, **D-063**, **D-064**,
  **D-065**, **D-066**, **D-067**, **D-068** i **D-069** ostaju **doslovno na snazi i
  nepromijenjeni**.
- **Ova odluka NE implementira ništa.** Ne implementira `P5-I3` (ni `P5-I3A`, ni `P5-I3B`, ni
  `P5-I3C`), `P5-I4`, `P5-I5` ni `P5-I6`; ne uvodi encryption servis, key provider, AAD builder,
  HMAC servis, normalizaciju, SHA-256 helper, generator pseudonima ni redakcioni ruleset; ne
  mijenja nijednu migraciju, schemu, Prisma model, contract TypeScript, test, `.env.example` ni
  sigurnosni objekat baze. **Nijedna baza nije kontaktirana** i **nijedan test se ovom odlukom ne
  izvršava.**
- **Ova odluka NE označava nijednu kućicu.** Checklist Faze 5 ostaje **`49 / 9`**.
- **Ova odluka NE autorizuje nijedan slice.** Ni `P5-I3`, ni `P5-I4`, ni `P5-I5`, ni `P5-I6`.

## Kontekst/problem — trigger

Nakon što je D-069 ratifikovao pet `P5-I5` preflight odluka i utvrdio kanonski izvršni redoslijed
`P5-I3 → P5-I4 → P5-I5`, izveden je kanonski **read-only preflight `P5-I3`**. Njegov ishod je bio
**`P5_I3_PREFLIGHT_HOLD_OWNER_DECISION_REQUIRED`**, sa **pet** neriješenih vlasničkih pitanja:

```text
OD-P5-I3-1   kanonski skup primitiva P5-I3 i vlasništvo redakcije
OD-P5-I3-2   maksimum eksternog identifikatora profila MANUAL v1
OD-P5-I3-3   lokalna konfiguracija K_enc / K_hmac i startup guard razdvajanja ključeva
OD-P5-I3-4   obuhvat identifikatora osiguranja/kartice u phase5-basic-v1
OD-P5-I3-5   tačna sintaksa strogog švicarskog prepoznavača telefona u phase5-basic-v1
```

**Vlasnik je ratifikovao svih pet.** Ovaj zapis ih konstatuje kao odluke i izvodi njihovo
dokumentaciono pomirenje. **On ne bira nijednu opciju iznova** i **ne pretvara riješeni preflight
u implementacijsku autorizaciju.**

## Odluka

### `RULING 1` — `OD-P5-I3-1`: kanonski skup primitiva `P5-I3` i vlasništvo redakcije

**`P5-I3` posjeduje sljedeće ponovo upotrebljive primitive bez baze:**

```text
 1  encryption servis/interface i kanonska ENCRYPTION_SERVICE granica
 2  LocalStaticKeyProvider
 3  lokalna AES-256-GCM enkripcija/dekripcija po D-025
 4  kanonski D-025 AAD builder
 5  MANUAL v1 normalizacija eksternog identifikatora
 6  HMAC servis eksterne reference i katalog domena
 7  startup enforcement za K_hmac != K_enc
 8  normalizacija kliničkog teksta
 9  generički SHA-256 helper: UTF-8 ulaz -> SHA-256 -> 64 lowercase hex znaka
10  generator pseudonima i helper za kanonizaciju pseudonima u velika slova
```

**`P5-I3` NE posjeduje:**

- implementaciju redakcionog ruleseta **`phase5-basic-v1`**;
- orkestraciju redakcije;
- stanje obrade dokumenta (`processing_status`);
- rukovanje statusom redakcije (`redaction_status`);
- semantiku fallbacka za `view=redacted`;
- perzistenciju dokumenta.

**Te stavke pripadaju `P5-I6` / `P5-I7`**, prema **postojećim** granicama slice-ova dokumenta iz
`04` §7.5 (D-062). **Nijedna granica iz te tabele se ovom odlukom ne mijenja.**

#### 1.1 Pojašnjenje vlasništva hasha

**`P5-I3` posjeduje ponovo upotrebljiv generički SHA-256 tekstualni primitiv** — i **samo njega**.

**`P5-I6` ga kasnije konzumira** da izračuna i perzistira:

```text
source_text_hash
redacted_text_hash
```

prema **već ratifikovanom redoslijedu obrade iz D-060** (`02` §2.10.3, `03` §13.1).

**`P5-I3` ne smije kreirati perzistenciju dokumenta** samo da bi vježbao te dvije polje-specifične
upotrebe. Primitiv se dokazuje **bez baze**.

#### 1.2 Tvrde ekskluzije ostaju očuvane

**D-069 ostaje mjerodavan** da **`P5-I4`** posjeduje:

- konkretan `TenantDatabaseService` facade;
- idempotency servis;
- `request_sha256`;
- audit writer;
- Faza-5 audit self-hash.

**`P5-I3` ih ne smije povlačiti unaprijed.**

#### 1.3 Posljedica za redakciju

**`phase5-basic-v1` postaje implementacijski preduslov `P5-I6`, a NE implementacijski preduslov
`P5-I3`.**

**`OD-P5-I3-4` i `OD-P5-I3-5` zato više ne blokiraju `P5-I3`.** Njihovi ugovori su **ratifikovani
sada** i zapisani su kao **ulaz za budući `P5-I6`**.

### `RULING 2` — `OD-P5-I3-2`: maksimum eksternog identifikatora profila `MANUAL` v1

**Maksimum eksternog identifikatora profila `MANUAL` v1 je:**

```text
255 UTF-8 bajtova
```

**Mjerenje se izvodi nad kanonskim izlazom `MANUAL` v1 normalizacije** — dakle:

- poslije validacije validnog Unicodea;
- poslije odbijanja `NUL` i C0/C1 kontrolnih znakova;
- poslije uklanjanja opcionog vodećeg BOM-a (`U+FEFF`);
- poslije vanjskog trima Unicode whitespacea;
- poslije **NFC** normalizacije;
- poslije odbijanja praznog rezultata nakon normalizacije;
- **neposredno prije** UTF-8 HMAC granice.

**Maksimum NIJE:**

- 255 JavaScript UTF-16 code unita;
- 255 Unicode code pointa;
- 255 grapheme clustera;
- pre-NFC brojanje.

To je **dužina u bajtovima finalne normalizovane UTF-8 reprezentacije**. Ako je

```text
UTF8_BYTE_LENGTH(normalizovani_identifikator) > 255
```

identifikator se **odbija**.

**Sam primitiv nikada ne smije eho-vati vrijednost u grešci.** Budući `P5-I4` mapira to odbijanje
na svoj kanonski generički, ne-eho ugovor **`422 VALIDATION_ERROR`** (`03` §8; D-060, klauzula 39).

#### 2.1 Zašto je ovo bio prazan referent

D-060, klauzula 10, stavka 8 nalaže „eksplicitan maksimum dužine identifikatora, preuzet iz
postojećih schema/API ograničenja". **Taj referent ne postoji.** Čisti eksterni identifikator se
**nikada ne perzistira** — perzistira se isključivo token `h1.<hex64>` u `varchar(128)`
(`02` §2.8) — pa **nijedna kolona i nijedno API polje ne nose taj maksimum**. Delegirani referent
je time bio **prazan**, a tri tekuća normativna mjesta (`02` §2.8.5, `03` §11, `08` §12.2)
oslanjala su se na njega. **`RULING 2` ga zamjenjuje eksplicitnom vrijednošću.**

#### 2.2 Immutability profila

**Vrijednost `255` UTF-8 bajtova postaje dio immutable ugovora profila `MANUAL` v1** (D-060,
klauzula 12).

**Budući drugačiji maksimum traži novu, izričito upravljanu verziju profila.** **`MANUAL` v1 se ne
smije tiho promijeniti.**

### `RULING 3` — `OD-P5-I3-3`: lokalna konfiguracija `K_enc` / `K_hmac` i startup guard

#### 3.1 Lokalna / razvojna konfiguracija

**Kanonske Faza-5 varijable lokalnog razvoja su:**

```text
ENCRYPTION_LOCAL_KEY
ENCRYPTION_KEY_VERSION
HMAC_LOCAL_KEY
```

**U Fazi 5 NE postoji varijabla okruženja `HMAC_KEY_VERSION`.**

**Aktivnu Faza-5 HMAC generaciju predstavlja kanonski perzistirani prefiks tokena:**

```text
h1.
```

**Buduća višegeneracijska kompatibilnost iz D-060 ostaje očuvana** (`02` §2.8.6) — marker
generacije i dalje živi **unutar** tokena, i **nijedna kolona za verziju HMAC ključa se ne uvodi**.

#### 3.2 Enkodiranje ključeva

Obje varijable — **`ENCRYPTION_LOCAL_KEY`** i **`HMAC_LOCAL_KEY`** — koriste

```text
RFC 4648 standardni Base64
```

Zahtjevi:

- **bez whitespacea**;
- strogo validna Base64 reprezentacija;
- dekodiranje mora uspjeti;
- dekodirana vrijednost mora biti **tačno `32` bajta**.

**Nevalidan Base64 ili dekodirana dužina različita od 32 bajta je startup/konfiguraciona greška.**

**`ENCRYPTION_KEY_VERSION` ostaje obavezan po D-025** — klauzula 10 već odbija start kad key
version nedostaje — i mora predstavljati **aktivnu verziju enkripcijskog ključa** koju taj ugovor
prihvata (D-025, klauzula 14: `encryption_key_version >= 1`).

#### 3.3 Guard razdvajanja ključeva

**Startup guard poredi dekodirane bajtove ključeva, ne tekstualne Base64 reprezentacije.**

**Mora koristiti poređenje u konstantnom vremenu** — npr. Node `timingSafeEqual` ili semantički
ekvivalentan primitiv konstantnog vremena.

Ako su dekodirane 32-bajtne vrijednosti identične — dakle

```text
K_hmac == K_enc
```

— **aplikacija MORA odbiti start.**

**Poređenje isključivo sirovih Base64 stringova NIJE usklađeno** s ovim ugovorom: dvije različite
Base64 reprezentacije mogu dekodirati u **isti** ključ, pa bi tekstualno poređenje propustilo
stvarnu jednakost ključnog materijala.

#### 3.4 Zabrana izvedenosti

**Jača politika iz D-060 ostaje na snazi:** **`K_hmac` ne smije biti jednak `K_enc` niti izveden iz
njega** (`09` §8.1).

**Runtime kod je obavezan mehanički odbiti jednakost bajtova.**

**Provenijencija ključa / neizvedenost ostaje obaveza secret-provisioninga i operativnog
upravljanja** i **ne smije se lažno predstaviti** kao matematički dokazana startup poređenjem.
Guard dokazuje **nejednakost**, ne **nezavisnost**.

#### 3.5 `.env.example`

**Buduća implementacija smije dodati imena varijabli u praćeni `.env.example`**, ali svaka
primjer-vrijednost ključa mora biti **namjerno nevalidan placeholder** — po presedanu D-025,
klauzule 9 — tako da startup guard padne ako se primjer isporuči.

**Nijedan funkcionalan razvojni ključ ni secret se ne smije commitovati** (`09` §9).

**Ovaj governance gate `.env.example` NE mijenja.**

#### 3.6 Produkcijski KMS

**Ova odluka ne zatvara i ne slabi `D-OPEN-004a`.** Produkcijski životni ciklus key providera/KMS-a
— izbor providera, model pristupa ključu, rotation cadence, recovery — **ostaje odgođen**
(`13` §3.1). **Local static key i dalje nikada nije produkcijski spreman.**

### `RULING 4` — `OD-P5-I3-4`: obuhvat identifikatora osiguranja/kartice u `phase5-basic-v1`

**`phase5-basic-v1` i dalje podržava validiran**

```text
AHV / AVS
```

**kao svoju izričitu postojeću klasu identifikatora.**

**Ne tvrdi dodatnu podršku** za bilo koji generički ili zaseban:

- identifikator osiguranja;
- identifikator kartice osiguranja;
- **VeKa** identifikator;
- broj članstva/kartice osiguranja;

**osim ako buduća verzija ruleseta dobije zaseban kanonski definisan uzorak i vlasničko
odobrenje.**

**Zato se svaka TEKUĆA formulacija koja implicira dodatan „kanonski definisan visokopouzdan
identifikator osiguranja/kartice" pomiruje sa stvarnim obuhvatom v1** (`03` §13.1, `08` §12.5,
`09` §8.3 i §10).

**Obavezna pozitivna test matrica redakcije NE SMIJE tražiti zaseban pozitivan slučaj za
osiguranje/karticu u `phase5-basic-v1`.**

Buduće dodavanje traži **novu verziju ruleseta** — npr. `phase5-basic-v2` — ili zaseban, odvojeno
upravljan identifikator.

#### 4.1 Zahtjev iskrenosti

**Nijedan kanonski dokument, test ni budući implementacijski komentar ne smije tvrditi pokrivenost
za uzorak identifikatora osiguranja/kartice koji v1 stvarno ne implementira.** Ovo je primjena
D-060, klauzule 26, i `09` §8.3 na istu klasu.

**Ova odluka je ulaz za budući `P5-I6` i NIJE bloker za `P5-I3`** nakon `RULING 1`.

### `RULING 5` — `OD-P5-I3-5`: strog švicarski prepoznavač telefona u `phase5-basic-v1`

#### 5.1 Opšta posture

**Prepoznavač je namjerno konzervativan.** **Dvosmislen numerički materijal MORA ostati
neredigovan.** **Lažno negativni rezultati su prihvaćeni.** **Prepoznavač nije generički ekstraktor
telefonskih brojeva.**

#### 5.2 A — međunarodni oblik

Prepoznaju se **isključivo kompletni kandidati** u jednom od ovih strukturnih oblika:

**Kompaktno:**

```text
+41   praćeno tačno 9 decimalnih cifara
0041  praćeno tačno 9 decimalnih cifara
```

**Grupisano:**

```text
+41 XX XXX XX XX
0041 XX XXX XX XX
```

ili identično grupisanje sa crticama:

```text
+41-XX-XXX-XX-XX
0041-XX-XXX-XX-XX
```

Zahtjevi:

- **prva cifra `XX` područja mora biti `1`–`9`**;
- grupisani oblici koriste **jedan konzistentan separator**;
- **razmaci i crtice se ne smiju miješati**;
- kandidat **ne smije biti puki podniz dužeg decimalnog niza**.

**Nijedna šira međunarodna sintaksa nije implicirana.**

#### 5.3 B — nacionalni oblik

**Švicarski nacionalni kandidat se prepoznaje ISKLJUČIVO kad mu neposredno prethodi — bez obzira na
veličinu slova — jedna od ovih izričitih oznaka:**

```text
Tel
Tel.
Telefon
Mobile
Natel
Fax
```

Između oznake i kandidata dozvoljeni su:

- whitespace;
- i opciono **jedna** `:`.

Poslije te oznake prihvaćeni su oblici:

**Kompaktno:**

```text
0 praćeno tačno 9 decimalnih cifara
```

**Grupisano razmacima:**

```text
0XX XXX XX XX
```

**Grupisano crticama:**

```text
0XX-XXX-XX-XX
```

Zahtjevi:

- **`XX` počinje ciframa `1`–`9`**;
- **bez miješanih separatora grupisanja**;
- kandidat **ne smije biti podniz dužeg decimalnog niza**.

#### 5.4 Šta se u `phase5-basic-v1` NE prepoznaje

Sljedeće **ostaje neredigovano** po telefonskom pravilu:

- **goli** nacionalni švicarski brojevi **bez prihvaćene oznake**;
- dvosmisleni numerički nizovi;
- oblici sa tačkama kao separatorima;
- međunarodne varijante sa `(0)` u zagradi;
- oblici sa **miješanim** separatorima;
- proizvoljni nizovi cifara nalik doziranju, laboratorijskom, tarifnom, ICD, datumskom ili mjernom
  materijalu;
- svi oblici izvan izričite v1 sintakse.

#### 5.5 Sigurnosno pravilo

**Kandidat koji ne prođe tačan v1 prepoznavač MORA ostati nepromijenjen.**

**Ne primjenjuje se fallback generički telefonski regex.**

Ovo čuva posture iz D-060, klauzule 25 —

```text
dvosmisleno -> ne rediguj
```

— i klinički sigurnosni zahtjev da ruleset **ne smije široko uklanjati doziranja, laboratorijske,
tarifne, ICD, datumske ni mjerne vrijednosti** (`09` §8.3).

**Ova odluka je ulaz za budući `P5-I6` i NIJE bloker za `P5-I3`** nakon `RULING 1`.

## Planska posljedica — oblik izvršenja `P5-I3`

**Ova sekcija je planska posljedica, ne izvršena implementacija.**

**`P5-I3` ostaje `POLICY-RESOLVED` / `NEXT` / `NOT AUTHORIZED` / `NOT STARTED`.**

Kada svjež preflight prođe **i** kada vlasnik zasebno autorizuje implementaciju, preporučena
segmentacija je:

### `P5-I3A` — granica enkripcije

- encryption interface / `ENCRYPTION_SERVICE`;
- kanonski D-025 AAD;
- `LocalStaticKeyProvider`;
- AES-256-GCM implementacija;
- lokalna konfiguracija `K_enc` i startup guardovi.

### `P5-I3B` — granica identiteta eksterne reference

- `MANUAL` v1 normalizacija eksternog identifikatora;
- maksimum **255 UTF-8 bajtova**;
- HMAC eksterne reference;
- katalog HMAC domena;
- `HMAC_LOCAL_KEY`;
- startup guard `K_hmac != K_enc` nad **dekodiranim bajtovima**.

**Zavisnost:** **`P5-I3B` zavisi od `P5-I3A`** zbog dijeljene granice ključa/konfiguracije i
cross-key guarda.

### `P5-I3C` — deterministički primitivi bez baze

- normalizacija kliničkog teksta;
- generički UTF-8 SHA-256 lowercase-hex helper;
- generator pseudonima;
- helper za kanonizaciju pseudonima u velika slova.

**`P5-I3C` je tehnički nezavisan od A/B**, iako stvarno izvršenje smije ostati sekvencijalno radi
gate discipline.

### Nema `P5-I3D`

**Ne postoji redakcioni pod-gate `P5-I3`.** **Implementacija `phase5-basic-v1` pripada `P5-I6`.**

**Ova sekcija bilježi isključivo budući oblik pregleda/izvršenja. Ona NE autorizuje nijednu
implementaciju.**

## Razlog

**`RULING 1`** čuva već objavljene granice slice-ova iz `04` §7.5: `P5-I6` je „ručni unos dokumenta
i redakcija", pa bi povlačenje redakcije u `P5-I3` značilo ili dvostruko vlasništvo ili tiho
premještanje obuhvata. Uz to, redakcija bez perzistencije dokumenta nema konzumenta, a
perzistencija dokumenta je izričito izvan `P5-I3` — čiji je obuhvat „bez baze".

**`RULING 2`** zatvara jedini stvarno **prazan** referent u D-060: delegirani maksimum ne postoji
nigdje jer čisti identifikator nema kolonu. Bajtno mjerenje **poslije** NFC-a je jedina definicija
koja je stabilna preko jezika i runtimea i koja odgovara stvarnoj HMAC granici; brojanje u UTF-16
code unitima bilo bi JavaScript-specifičan artefakt, a brojanje code pointa ili graphemea ne bi
ograničilo stvarnu veličinu poruke.

**`RULING 3`** postoji zato što bi tekstualno poređenje Base64 stringova bilo **lažna sigurnosna
tvrdnja**: dvije različite Base64 reprezentacije mogu dekodirati u isti ključ, pa bi guard prošao
nad stvarno identičnim ključnim materijalom. Poređenje zato mora biti nad dekodiranim bajtovima, i
mora biti u konstantnom vremenu jer se izvodi nad ključnim materijalom. Izostanak
`HMAC_KEY_VERSION` je namjeran: D-060 već nosi generaciju **unutar** tokena (`h1.`), pa bi zasebna
varijabla uvela drugi izvor istine.

**`RULING 4`** i **`RULING 5`** primjenjuju **zahtjev iskrenosti** iz D-060, klauzule 26: ruleset
ne smije tvrditi pokrivenost koju nema. „Kanonski definisan visokopouzdan identifikator
osiguranja" nikada nije dobio kanonsku definiciju uzorka, pa je kao tvrdnja bio neispunjiv, a kao
obavezan pozitivan test neizvršiv. Za telefon je konzervativan, potpuno nabrojan prepoznavač jedini
oblik koji čini `08` §12.5 izvršivim bez uvođenja klinički opasnih lažno pozitivnih rezultata.

## Alternative

- **Redakcija unutar `P5-I3`** — odbijeno: traži perzistenciju dokumenta i statusnu mašineriju koje
  su izričito izvan „bez baze" obuhvata i pripadaju `P5-I6`/`P5-I7`.
- **Maksimum od 255 code pointa ili grapheme clustera** — odbijeno: ne ograničava stvarnu veličinu
  UTF-8 poruke na HMAC granici i uvodi nestabilno brojanje.
- **Maksimum od 255 UTF-16 code unita** — odbijeno: JavaScript-specifično, nije jezički neutralan
  ugovor.
- **Poređenje Base64 stringova u startup guardu** — odbijeno: lažna sigurnosna tvrdnja, propušta
  jednakost ključa pri različitoj reprezentaciji.
- **Zasebna varijabla `HMAC_KEY_VERSION`** — odbijeno: drugi izvor istine pored `h1.` prefiksa iz
  D-060.
- **Zadržavanje generičke klase identifikatora osiguranja u v1** — odbijeno: nema kanonski definisan
  uzorak, pa je tvrdnja neispunjiva i krši zahtjev iskrenosti.
- **Širi/generički telefonski regex uz fallback** — odbijeno: D-060, klauzula 25 to izričito
  zabranjuje, a lažno pozitivna redakcija doziranja ili laboratorijske vrijednosti je klinički
  opasnija od propuštenog broja.

## Posljedice — dokumentaciono pomirenje

Pomirenje je **aditivno** gdje historijska tijela moraju ostati očuvana, i **direktno** isključivo
tamo gdje je TEKUĆI normativni tekst zavisio od praznog referenta ili je tvrdio nepostojeću
pokrivenost.

| Dokument | Pomirenje |
|---|---|
| `02` §2.8.5 | prazan referent maksimuma zamijenjen eksplicitnim **255 UTF-8 bajtova poslije NFC-a** |
| `02` §2.11.3 | aditivna anotacija: vlasništvo `phase5-basic-v1` je **`P5-I6`**; v1 obuhvat po `RULING 4`/`RULING 5` |
| `03` §11 | „maksimum dužine" zamijenjen eksplicitnim ugovorom od 255 UTF-8 bajtova |
| `03` §13.1 | tvrdnja o pokrivenosti pomirena — bez klase osiguranja/kartice; telefon po tačnom v1 prepoznavaču |
| `04` §7.5 | aditivna anotacija: inventar primitiva `P5-I3`, ekskluzije, `P5-I6` redakcija, segmentacija A/B/C bez D |
| `05` §6 | aditivna anotacija; **nijedna kućica se ne mijenja**; checklist ostaje `49 / 9` |
| `06` | D-060, klauzula 10 i klauzule 24–25 dobijaju **aditivne** anotacije tekućeg statusa; tijela se ne prepisuju |
| `08` §12.1 | guard `K_hmac != K_enc` precizira se kao poređenje **dekodiranih bajtova** u konstantnom vremenu |
| `08` §12.2 | test prekoračenja dužine dobija tačnu granicu **255 UTF-8 bajtova poslije NFC-a** |
| `08` §12.5 | pozitivan slučaj za osiguranje/karticu **uklonjen**; dodati tačni pozitivni/negativni telefonski slučajevi |
| `09` §8.1 | ugovor lokalne konfiguracije ključeva, Base64/32 bajta, bez `HMAC_KEY_VERSION`, `h1.`, guard nad dekodiranim bajtovima |
| `09` §8.3, §10 | tvrdnje o obuhvatu redakcije pomirene sa stvarnim v1 obuhvatom |
| `13` §3.1 | aditivna anotacija imena lokalnih varijabli; **`D-OPEN-004a` ostaje otvoren** |
| `MANIFEST.md` | preračunati bajtovi i SHA-256 za izmijenjene dokumente |

## Šta D-070 ne mijenja

- **Ne mijenja nijedno vlasništvo iz D-069.** `P5-I4` i dalje posjeduje `TenantDatabaseService`
  facade, idempotency servis, `request_sha256`, audit writer i Faza-5 audit self-hash.
- **Ne mijenja kanonski redoslijed izvršenja** `P5-I3 → P5-I4 → P5-I5`.
- **Ne mijenja tabelu zavisnosti slice-ova** iz `04` §7.5 (D-062).
- **Ne mijenja nijednu klauzulu D-025** (1–14) ni format enkripcije.
- **Ne mijenja normalizacione operacije `MANUAL` v1 ni njihov redoslijed** — dodaje **isključivo**
  numeričku vrijednost praznom koraku 8.
- **Ne mijenja** `processing_status` ni `redaction_status` rječnike, njihov sloj sprovođenja, ni
  zabranu fallbacka za `view=redacted`.
- **Ne mijenja** klauzulu iskrenosti: **redakcija nije anonimizacija, nije de-identifikacija i nije
  sigurnosna granica**; redigovani izlaz **ostaje Class A**.
- **Ne uvodi nijednu kolonu, tip, constraint, migraciju ni grant.**
- **Ne mijenja `.env.example`.**
- **Ne označava nijednu kućicu.** Checklist Faze 5 ostaje **`49 / 9`**.

## Otvorena pitanja koja D-070 ne zatvara

Sljedeće ostaje **OTVORENO / NEBLOKIRAJUĆE** i **ne zatvara se prećutno**:

- **`D-OPEN-004a`** — produkcijski KMS / životni ciklus produkcijskog key providera, rotation
  cadence, recovery. `RULING 3` je **isključivo lokalni/razvojni** ugovor.
- **`D-OPEN-009`** — normalizacioni profil `AXENITA`. Profil se smije definisati **tek nakon**
  odblokiranja (D-060, klauzula 12). `RULING 2` vrijedi za **`MANUAL` v1**, ne za `AXENITA`.
- **Budući viši nivo redakcije / NER logike** — i dalje **nije obuhvat Faze 5** (D-060, klauzula
  26; `09` §8.3, §10).
- **Buduća operativna rotacija više HMAC generacija** izvan Faza-5 v1 — format je pripremljen
  (`02` §2.8.6), operativni ugovor nije donesen.
- **Buduće predecessor ulančavanje audita** — ostaje odgođeno u zasebnu buduću governance odluku
  (D-069).

## Zavisnosti

- **D-025** (klauzule 1–14) — format AES-256-GCM, kanonski AAD, `LocalStaticKeyProvider`, startup
  guardovi, obavezan key version.
- **D-060** (Dio A, klauzule 8–9) — `K_hmac` odvojen od `K_enc`, budući startup guard.
- **D-060** (Dio B, klauzule 10–12) — profil `MANUAL` v1, zabranjene operacije, immutability.
- **D-060** (Dio E) — redoslijed obrade, `source_text_hash`, `redacted_text_hash`.
- **D-060** (Dio F, klauzule 22–28) — obuhvat i posture `phase5-basic-v1`, verzija ruleseta.
- **D-060** (klauzula 39) — generičke poruke greške bez eho-vanja vrijednosti.
- **D-062** (`04` §7.5) — deklaracije zavisnosti i obuhvati slice-ova `P5-I1`–`P5-I8`.
- **D-069** — kanonski redoslijed `P5-I3 → P5-I4 → P5-I5` i cross-cutting vlasništvo `P5-I4`.
- **D-OPEN-004a** — produkcijski KMS, **ostaje otvoren**.

## Granice prema budućim fazama

- **`P5-I3` je `POLICY-RESOLVED` / `NEXT` / `NOT AUTHORIZED` / `NOT STARTED`.** Traži **svjež
  read-only preflight** nad kanonskim `main`-om koji sadrži D-070, i **zasebnu vlasničku
  autorizaciju**. **Ovom odlukom nije autorizovan.**
- **`P5-I3A` / `P5-I3B` / `P5-I3C` nisu autorizovani.** To je **preporučena segmentacija**, ne
  odobren plan izvršenja.
- **`P5-I4` je poslije `P5-I3`**, **`NOT_STARTED`**, **`NOT AUTHORIZED`**, sa nepromijenjenim
  cross-cutting vlasništvom iz D-069.
- **`P5-I5` je `POLICY-RESOLVED` / `DEPENDENCY-BLOCKED` / `NOT AUTHORIZED` / `NOT STARTED`**;
  **`OWNER_DECISIONS_REQUIRED_FOR_P5_I5 = 0`**.
- **`P5-I6` posjeduje `phase5-basic-v1`** i **nije autorizovan**. `RULING 4` i `RULING 5` su
  **njegovi ulazi**, ne njegova autorizacija.
- **Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.** Checklist ostaje **`49 / 9`**.
- **`★` ostaje trajna regresija** — njegovo buduće rušenje je i dalje `HARD HOLD`.
- **Ne autorizuju se, ni sada ni kasnije, kao dio `P5-I3`:** perzistencija dokumenta, redakciona
  orkestracija, statusna mašinerija dokumenta, `TenantDatabaseService` facade, idempotency servis,
  audit writer, `request_sha256`, audit self-hash, izmjena `.env.example`, nova migracija, novi
  grant, nova rola, `SECURITY DEFINER` ni `BYPASSRLS`.

## Naredni obavezni gate

**Vlasnički pregled D-070, pa zaseban D-070 publikacioni gate** (push / PR / merge). **Tek nakon
što D-070 postane kanonski** smije se izvesti **svjež read-only preflight `P5-I3`**.

```text
OWNER_DECISIONS_REQUIRED_FOR_P5_I3 = 0     (u D-070 branch stanju)
P5-I3 IMPLEMENTATION AUTHORIZED = NO
P5-I3 IMPLEMENTATION STARTED    = NO
```

**Dok D-070 ne bude merged, kanonski `main` i dalje nosi ishod
`P5_I3_PREFLIGHT_HOLD_OWNER_DECISION_REQUIRED` sa pet neriješenih odluka.** Ishod se **ovom odlukom
ne pretvara** u `P5_I3_PREFLIGHT_PASS_READY_FOR_OWNER_AUTHORIZATION` — **svjež preflight je i dalje
obavezan.**

---

# D-071 — Formalno zatvaranje `P5-I3`: semantika checklista, prenesene obaveze i dispozicija AXENITA

- **Status:** ACCEPTED / OWNER-RATIFIED
- **Datum:** 2026-08-29
- **Tip:** vlasnički ratifikovan **governance zapis formalnog zatvaranja `P5-I3`**. On konstatuje
  kanonsko stanje izvršenja tri pod-gatea `P5-I3A`, `P5-I3B` i `P5-I3C`, ratifikuje **semantiku**
  pet Services redova checklista koji se njime zatvaraju, upisuje **dvije prenesene obaveze** u
  vlasništvo `P5-I4` i utvrđuje **dispoziciju AXENITA normalizacije**. **Dokumentacija isključivo.**
- **Amandman na:** **statusne tvrdnje i aritmetiku checklista**. Sigurnosni ugovori **D-018**,
  **D-025**, **D-054**, **D-055**, **D-056**, **D-060**, **D-061**, **D-062**, **D-063**, **D-064**,
  **D-065**, **D-066**, **D-067**, **D-068**, **D-069** i **D-070** ostaju **doslovno na snazi i
  nepromijenjeni**. Nijedan raniji zapis se ne prepisuje; sve promjene su **aditivne anotacije** ili
  ažuriranje **tekućeg/normativnog** stanja.
- **Ova odluka NE implementira ništa.** Ne uvodi nijednu liniju izvornog koda, nijedan test,
  nijednu migraciju, schemu, Prisma model, contract TypeScript, API rutu, grant, rolu, politiku ni
  izmjenu `.env.example`. **Nijedna baza nije kontaktirana** i **nijedan test se ovom odlukom ne
  izvršava.**
- **Ova odluka označava tačno PET kućica** — pet Services redova iz `05` §6 nabrojanih u
  `RULING 1`. **Nijedna druga kućica se ne mijenja**, i **nijedan novi red se ne kreira.**
  Checklist Faze 5 prelazi sa **`49 / 9`** na **`49 / 14`**.
- **Ova odluka NE autorizuje `P5-I4`.** `P5-I4` postaje `NEXT` i `DEPENDENCY-SATISFIED`, ali ostaje
  **`NOT AUTHORIZED`** i **`NOT STARTED`**. **Podobnost nije autorizacija.**

## Kontekst/problem — trigger

D-070 je ratifikovao pet preflight odluka `P5-I3` i objavio **preporučenu segmentaciju**
`P5-I3A` / `P5-I3B` / `P5-I3C`, uz izričitu konstataciju da **`P5-I3D` ne postoji**. Nakon zasebne
vlasničke autorizacije, sva tri pod-gatea su implementirana, verifikovana, vlasnički pregledana i
merged u kanonski `main`. **Implementacijski sadržaj `P5-I3` je time kompletan**, ali **formalno
zatvaranje nije bilo izvedeno**: checklist Faze 5 je i dalje stajao na `49 / 9`, nijedan Services
red nije bio označen, i nije postojao zapis koji utvrđuje **šta označena kućica primitiva znači**,
a šta **ne** znači.

Zatvaranje je otvorilo **tri** vlasnička pitanja:

```text
OD-P5-I3-CLOSE-1   koji tacno redovi checklista se smiju zatvoriti i sa kojom semantikom
OD-P5-I3-CLOSE-2   kako se pri zatvaranju primitiva cuvaju nizvodne obaveze P5-I4
OD-P5-I3-CLOSE-3   dispozicija AXENITA normalizacije naspram zatvaranja P5-I3
```

**Vlasnik je ratifikovao sva tri.** Ovaj zapis ih konstatuje kao odluke i izvodi njihovo
dokumentaciono pomirenje. **On ne bira nijednu opciju iznova.**

## Kanonsko stanje izvršenja `P5-I3`

```text
P5-I3A   implementacijski commit   65a1cd962c52f72762468d8573c9e55b31984586
         kanonski merge            ea0769f1bc34baf8670aa8d4b4b5dfc3433e94db

P5-I3B   implementacijski commit   29aae651ab487cac2c77fd7b272ce6ffa976843c
         kanonski merge            13bee31fcdd5e4717eface4677e41f0d949ff080

P5-I3C   implementacijski commit   0e171b53d136987213d96c8af1aa4d0a6dcba165
         kanonski merge            6cffd9bf319068b78fa395b29ec76d9327593062
```

**`P5-I3A/B/C = IMPLEMENTED / VERIFIED / OWNER-REVIEWED / MERGED / CANONICAL`.**

**Segmentacija iz D-070 je `COMPLETE`.** Sva tri objavljena pod-gatea su iscrpljena, i
**`NO P5-I3D`** — redakcioni pod-gate `P5-I3` **ne postoji i nikada nije postojao**. **Redakcija
ostaje `P5-I6`**: implementacija `phase5-basic-v1`, redakciona orkestracija, stanje obrade
dokumenta, rukovanje statusom redakcije, semantika fallbacka za `view=redacted` i perzistencija
dokumenta **nisu i neće biti dio `P5-I3`** (D-070, `RULING 1`).

**Svih deset primitiva iz D-070 je kanonsko:**

```text
 1  encryption servis/interface i kanonska ENCRYPTION_SERVICE granica      P5-I3A
 2  LocalStaticKeyProvider                                                 P5-I3A
 3  lokalna AES-256-GCM enkripcija/dekripcija po D-025                     P5-I3A
 4  kanonski D-025 AAD builder                                             P5-I3A
 5  MANUAL v1 normalizacija eksternog identifikatora (max 255 UTF-8 B)     P5-I3B
 6  HMAC servis eksterne reference i katalog domena                        P5-I3B
 7  startup enforcement K_hmac != K_enc nad dekodiranim bajtovima          P5-I3B
 8  normalizacija klinickog teksta                                         P5-I3C
 9  genericki SHA-256 helper: UTF-8 -> 64 mala heksadecimalna znaka        P5-I3C
10  generator pseudonima i uppercase kanonizator pseudonima                P5-I3C
```

## Odluka

### `RULING 1` — `OD-P5-I3-CLOSE-1`: obuhvat i semantika redova checklista

**`OD-P5-I3-CLOSE-1 = APPROVED`.**

**Tačno pet postojećih Services redova** iz `05` §6 je ovlašteno da se zatvori:

```text
Services -> pseudonym generator
Services -> external ID HMAC
Services -> encryption interface
Services -> local encryption implementation
Services -> text normalization
```

**Ne postoji šesti red.** **Generički SHA-256 nema zasebnu Faza-5 Services kućicu** — on je
kanonski primitiv bez vlastitog reda, i **ne smije se izmisliti novi red da bi ga se označilo**.
**Nijedan novi checkbox red se ovom odlukom ne kreira ni u jednom dokumentu.**

**Ratifikovano semantičko pravilo.** Označen `P5-I3` Services red znači **isključivo** da je
odgovarajuća **`P5-I3` primitivna sposobnost**:

```text
IMPLEMENTED / VERIFIED / OWNER-REVIEWED / CANONICAL
```

**On NE znači** da su sve kasnije obaveze **perzistencije, API-ja, baze i poslovne konzumacije**
te sposobnosti završene. Te obaveze pripadaju kasnijim slice-ovima i **ostaju žive** — vidi
`RULING 2`.

**Redovi koji se izričito NE označavaju:** `Services → redaction` (vlasnik `P5-I6`),
`Services → state machine`, `Services → idempotency service`, `Services → optimistic locking`,
`Services → audit`, `Services → outbox base`, **svi API redovi**, **svi Tests redovi** i **devet
D-056 facade redova**. **Svi ostaju neoznačeni.**

### `RULING 2` — `OD-P5-I3-CLOSE-2`: očuvanje prenesenih obaveza

**`OD-P5-I3-CLOSE-2 = APPROVED`.**

**Označavanje reda primitiva mora sačuvati nizvodne obaveze.** Zatvaranje se izvodi uz
**eksplicitan registar prenesenih obaveza**, tako da se nijedna obaveza ne retirira tiho. Registar
je **ne-checkbox** zapis: on **ne smije** koristiti checkbox sintaksu i **ne smije** uticati na
aritmetiku kućica Faze 5.

Prenose se **dvije** obaveze:

#### `CO-P5-I3-I4-1`

```text
ID                CO-P5-I3-I4-1
Izvorni red       Services -> pseudonym generator
Ciljni vlasnik    P5-I4
Dispozicija       CARRIED_FORWARD / REQUIRED_IN_P5-I4
```

**Zadovoljeno u `P5-I3` (kanonski):**

- generator pseudonima — format `P-` plus tačno 10 velikih Crockford Base32 znakova;
- **CSPRNG** kao izvor entropije, kroz mockabilan seam, **bez determinističke grane** u
  produkcijskom putu;
- **uppercase kanonizator** pseudonima.

**Preneseno u `P5-I4` — i dalje obavezno:**

- **jedinstvenost pseudonima u tenant bazi** — `unique (practice_id, pseudonym)`;
- **ograničen regenerate-and-retry** pri povredi jedinstvenosti, sa **padom** nakon iscrpljenih
  pokušaja;
- **nikakav deterministički fallback** — zabrana je apsolutna;
- **uppercase kanonizacija i validacija na lookup putu** — `patientPseudonym` u malim slovima,
  kanonizacija u velika, pa **obična jednakost**; **nijedan `LOWER()`, `citext` ni posebna
  kolacija**;
- **tenant-scoped lookup** pseudonima.

#### `CO-P5-I3-I4-2`

```text
ID                CO-P5-I3-I4-2
Izvorni red       Services -> external ID HMAC
Ciljni vlasnik    P5-I4
Dispozicija       CARRIED_FORWARD / REQUIRED_IN_P5-I4
```

**Zadovoljeno u `P5-I3` (kanonski):**

- **`MANUAL` v1** normalizacija eksternog identifikatora, uključujući maksimum **255 UTF-8 bajtova**
  mjeren nad post-NFC oblikom (D-070, `RULING 2`);
- **kanonska HMAC poruka** i katalog domena;
- **HMAC-SHA256**;
- kanonski oblik tokena **`h1.<hex64>`**;
- primitivi **ključa, konfiguracije i razdvajanja** — `HMAC_LOCAL_KEY`, strogi Base64 i tačno 32
  dekodirana bajta, startup guard `K_hmac != K_enc` nad **dekodiranim** bajtovima u konstantnom
  vremenu.

**Preneseno u `P5-I4` — i dalje obavezno:**

- **perzistencija `external_ref_hmac`**;
- **tenant-scoped lookup** po tokenu;
- **kanonska integracija ordinacije, `source_system`-a i domene** u stvarnu HMAC poruku po zahtjevu;
- **poslovna validacija i mapiranje grešaka**;
- **primjenjivo rukovanje jedinstvenošću i konfliktom**.

**Nijedna od ove dvije obaveze ne dobija novi checkbox red**, ni sada ni kasnije, i **nijedna nije
oslabljena, uklonjena ni označena završenom.**

### `RULING 3` — `OD-P5-I3-CLOSE-3`: dispozicija AXENITA normalizacije

**`OD-P5-I3-CLOSE-3 = APPROVED`.**

**AXENITA normalizacija je `BLOCKED EXTERNAL` / `EXPLICITLY DEFERRED`.** Cilj očuvanja je
**`D-OPEN-009`**, i on **ostaje neriješen i otvoren**.

Kanonski utvrđeno:

- **`MANUAL` v1 postoji** i kanonski je (`P5-I3B`);
- **normalizacija kliničkog teksta postoji** i kanonska je (`P5-I3C`);
- **AXENITA normalizacija NE postoji**;
- **nijedna AXENITA semantika se ne izmišlja** — ni u kodu, ni u testu, ni u dokumentu;
- **odsustvo profila `AXENITA` NE blokira zatvaranje `P5-I3`**, jer su **svi profili koje `P5-I3`
  posjeduje i koji su trenutno implementabilni** kanonski;
- **`D-OPEN-009` ostaje neriješen i otvoren.**

Rezultujuća klasifikacija je:

```text
D-OPEN-009 = OPEN / BLOCKED_EXTERNAL / DOES_NOT_BLOCK_P5-I3_CLOSURE
```

**Red `Services → text normalization` se zatvara na osnovu `MANUAL` v1 i kliničke normalizacije, i
NE tvrdi podršku za AXENITA normalizaciju.** Zaseban profil `AXENITA` smije biti definisan **tek
nakon** odblokiranja `D-OPEN-009` i saznanja stvarnog formata identifikatora, i tražiće **novu
verziju profila**, ne izmjenu `MANUAL` v1.

## Aritmetika checklista — mehanički izvedena, ne pretpostavljena

```text
                        prije       poslije
ukupno redova (§6)      49          49
oznaceno                 9          14
neoznaceno              40          35
notacija                49 / 9      49 / 14
```

**Formalno zatvaranje `P5-I3` izvodi tačno pet tranzicija neoznačeno u označeno**, i **ukupan broj
redova ostaje 49**. Kanonska skraćenica je:

```text
CHECKLIST = 49 / 14
```

**Nijedan novi checkbox red se ne kreira**, a registar prenesenih obaveza iz `RULING 2` je
**ne-checkbox** i **ne ulazi u ovu aritmetiku**.

## Agregatna dokazna evidencija `P5-I3`

```text
unit (tekuci kanonski)   35 fajlova / 882 testa    PASS
e2e / bootstrap           5 fajlova /  41 test     PASS
typecheck                                          PASS
lint                                               PASS
formatiranje u vlasnistvu P5-I3                    PASS
repo-wide format          PASS_WITH_PRE_EXISTING_BASELINE_EXCEPTION
```

**Izuzetak repo-wide formata je predefinisan i nije u vlasništvu `P5-I3`.** Jedini fajl je:

```text
apps/api/test/phase4-membership-role-assignment-constraints.security.ts
kanonski blob   05002fde83376e894af9e245fa65395242debb92
```

**On je nepromijenjen kroz cijeli `P5-I3`**, nije dodirnut nijednim od tri pod-gatea, i **ne smije
se popravljati u zatvaračkom governance zahvatu.**

**Historijska korekcija — kanonski lanac dokaza.** Ranije zabilježen preflight broj **`609`** kao
pre-`P5-I3A` unit count je **bio netačan**. Kanonski lanac je:

```text
526  ->  615  ->  753  ->  882
      +89      +138     +129
      P5-I3A   P5-I3B   P5-I3C
```

**Netačna vrijednost `609` se ne resuscitira** ni u jednom dokumentu, izvještaju ni gate zapisu.

**U `P5-I3` nije izvedena nijedna mutacija baze, API-ja ni runtime zavisnosti paketa.** Slice je
bio **primitivi bez baze**, tačno kako je D-070 propisao.

## Formalno kompletiranje

Kada ovo governance zatvaranje bude **autorisano, verifikovano, vlasnički pregledano, objavljeno i
merged u kanonski `main`**, `P5-I3` postaje:

```text
P5-I3   COMPLETE / VERIFIED / CANONICAL / FORMALLY CLOSED
P5-I4   NEXT / DEPENDENCY-SATISFIED / NOT AUTHORIZED / NOT STARTED
P5-I5   STILL DEPENDENCY-BLOCKED / NOT AUTHORIZED / NOT STARTED
P5-I6   NOT AUTHORIZED / NOT STARTED
```

**Ratifikacija D-071 NE autorizuje implementaciju `P5-I4`.** Autorizacija je **zaseban vlasnički
potez**, i traži zaseban read-only preflight po istom presedanu kao `P5-I2B`, `P5-I5` i `P5-I3`.

## Razlog

- **Implementacijski sadržaj je bio kompletan, a formalni zapis nije.** Neusklađenost između
  kanonskog koda i governance zapisa je sama po sebi rizik: bez zapisa, sljedeći gate ne može
  mehanički utvrditi šta je zatvoreno.
- **Kućica primitiva bez semantičkog pravila je zamka.** Bez `RULING 1`, označen red
  `Services → pseudonym generator` bi se kasnije mogao pročitati kao tvrdnja da su pseudonimi
  gotovi, uključujući jedinstvenost u bazi i lookup put — što **nije** tačno.
- **Registar prenesenih obaveza je jeftiniji od tihe regresije.** `CO-P5-I3-I4-1` i
  `CO-P5-I3-I4-2` čine rezidualne obaveze **mehanički pronalazivim** u trenutku kada `P5-I4` bude
  autorizovan.
- **AXENITA se ne smije prešutjeti ni u jednom smjeru.** Ni tvrdnjom da je red zatvoren jer je
  normalizacija gotova — bilo bi netačno; ni blokiranjem zatvaranja zbog nedostatka AXENITA profila
  — bilo bi blokiranje na obavezi koju `P5-I3` nikada nije posjedovao.

## Alternative

- **Ne zatvarati `P5-I3` formalno i preći odmah na `P5-I4`** — **odbijeno.** Faza bi nosila
  kanonski kod bez kanonskog zapisa, a `49 / 9` bi postala trajno netačna.
- **Označiti i `Services → redaction`** — **odbijeno.** Redakcija je `P5-I6` (D-070, `RULING 1`);
  označavanje bi bilo lažna tvrdnja.
- **Uvesti novi checkbox red za generički SHA-256 i za prenesene obaveze** — **odbijeno.** Ukupan
  broj redova Faze 5 je **49** i **ne mijenja se**; registar prenesenih obaveza je ne-checkbox
  zapis.
- **Zatvoriti `D-OPEN-009` kao nije-primjenjivo-u-v1** — **odbijeno.** Pitanje je blokirano na
  **stvarnoj eksternoj zavisnosti** i ostaje otvoreno.
- **Prepisati historijske `49 / 9` i `NOT STARTED` zapise** — **odbijeno.** Historijski zapisi su
  tačni na dan svog zapisa; pomirenje je **aditivno**.

## Posljedice — dokumentaciono pomirenje

| Dokument | Zahvat |
|---|---|
| `06` | ovaj zapis D-071; **D-070 se ne prenumeriše i ne mijenja** |
| `05` §0, §6 | tekući status Faze 5; **pet** kućica prelazi u označeno; dokazna sekcija formalnog zatvaranja `P5-I3`; **ne-checkbox** registar prenesenih obaveza; checklist `49 / 9` u `49 / 14` |
| `04` §7.5 | tekući status `P5-I3` / `P5-I4` / `P5-I5` / `P5-I6`; reference `CO-P5-I3-I4-1` i `CO-P5-I3-I4-2`; **D-069 vlasništvo `P5-I4` očuvano** |
| `08` §12 | dokazna evidencija zatvaranja: `35 / 882`, delte `+89` / `+138` / `+129`, `5 / 41`, typecheck, lint, klasifikacija format izuzetka |
| `09` §8 | kanonski status sigurnosnih primitiva Faze 5, uz očuvane granice tvrdnje |
| `13` §7 | aditivna anotacija posljedice zatvaranja; **`D-OPEN-009` ostaje `BLOCKED EXTERNAL`** |
| `MANIFEST.md` | ponovno izračunati bajtovi i SHA-256 za izmijenjene dokumente; **19 redova ostaje 19** |

**Nijedan drugi dokument se ne mijenja.** `02`, `03`, `10`, `README.md` i `AGENTS.md` ostaju
netaknuti, kao i sav izvorni kod, testovi, migracije, Prisma, SQL, paketi i `.env.example`.

## Šta D-071 ne mijenja

- **Ne mijenja nijedan sigurnosni dizajn.** D-018, D-025 i D-054 do D-070 ostaju doslovno na snazi.
- **Ne tvrdi produkcijski KMS.** `D-OPEN-004a` ostaje otvoren; **local static key i dalje nikada
  nije produkcijski spreman**.
- **Ne tvrdi da je redakcija implementirana.** `phase5-basic-v1` je `P5-I6` i **nije implementiran**.
- **Ne tvrdi da je DB/API ponašanje `patient_references` završeno.** To je `P5-I4`.
- **Ne zatvara Fazu 5.** Faza 5 ostaje **`IN_PROGRESS`**; **nije `DONE`**.
- **Ne mijenja `★`.** `★` ostaje **trajna regresija**, a njegovo buduće rušenje je i dalje
  `HARD HOLD`.
- **Ne prepisuje nijedan historijski zapis.** `HISTORICAL_RECORDS_REWRITTEN = 0`.

## Otvorena pitanja koja D-071 ne zatvara

- **`D-OPEN-004a`** — KMS provider, produkcijski model pristupa ključu, rotation cadence, recovery.
- **`D-OPEN-009`** — Axenita API scope; **`BLOCKED EXTERNAL`**, i profil `AXENITA` s njim.
- **`D-OPEN-007`** — retention politika, koja i dalje uslovljava per-row DEK i crypto-shredding.

## Zavisnosti

- **`P5-I4` zavisi od `P5-I2` i `P5-I3`** (`04` §7.5). Obje zavisnosti su sada **ispunjene**, pa je
  `P5-I4` **`DEPENDENCY-SATISFIED`** — i **`NOT AUTHORIZED`**.
- **`P5-I5` zavisi od `P5-I2` uključujući `★`, `P5-I3` i `P5-I4`.** `P5-I4` **nije** kanonski, pa
  `P5-I5` ostaje **`DEPENDENCY-BLOCKED`**.
- **`P5-I6` zavisi od `P5-I3` i `P5-I5`** i ostaje **`NOT AUTHORIZED` / `NOT STARTED`**.

## Granice prema budućim fazama

- **`P5-I4` je `NEXT` / `DEPENDENCY-SATISFIED` / `NOT AUTHORIZED` / `NOT STARTED`.** Traži
  **zaseban read-only preflight** i **zasebnu vlasničku autorizaciju**. **Ovom odlukom nije
  autorizovan**, nijedna grana nije kreirana, nijedan izvorni fajl nije dodirnut i nijedna ruta ni
  schema nije započeta.
- **`P5-I4` zadržava nepromijenjeno cross-cutting vlasništvo iz D-069:** konkretan
  `TenantDatabaseService` facade (D-056), **idempotency servis**, **`request_sha256`**, **audit
  writer** i **Faza-5 audit self-hash** (`04` §7.5a). **Devet facade redova ostaje NEOZNAČENO.**
- **`P5-I4` dodatno preuzima `CO-P5-I3-I4-1` i `CO-P5-I3-I4-2`** kao kriterije prihvatanja.
- **`P5-I5` je `STILL DEPENDENCY-BLOCKED` / `NOT AUTHORIZED` / `NOT STARTED`.**
- **`P5-I6` je `NOT AUTHORIZED` / `NOT STARTED`**, i **posjeduje redakciju**. Red
  `Services → redaction` **ostaje neoznačen**.
- **Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.** Checklist je **`49 / 14`**.

## Naredni obavezni gate

**Vlasnički pregled D-071 i adjudikacija dokaza formalnog zatvaranja `P5-I3`**, pa zaseban
publikacioni gate (push / PR / merge).

```text
P5-I3 FORMAL CLOSURE AUTHORED   = YES
P5-I3 FORMAL CLOSURE CANONICAL  = NO      (do merge-a u origin/main)
P5-I4 IMPLEMENTATION AUTHORIZED = NO
P5-I4 IMPLEMENTATION STARTED    = NO
```

**Dok ova zatvaračka grana ne bude merged, kanonski `origin/main` i dalje nosi pred-zatvaračko
governance stanje** — `P5-I3` bez formalnog zapisa i checklist `49 / 9`. **Tek merge-om** postaje
kanonsko stanje `P5-I3 = COMPLETE / VERIFIED / CANONICAL / FORMALLY CLOSED` i **`49 / 14`**.

---

# D-072 — `P5-I4` implementacijski ugovor: transakciona idempotencija, perzistentni hash formati i semantika patient reference

- **Status:** ACCEPTED / OWNER-RATIFIED
- **Datum:** 2026-08-29
- **Tip:** vlasnički ratifikovan **governance zapis implementacijskog ugovora `P5-I4`**. On
  zamrzava **četrnaest** preflight odluka `OD-P5-I4-1` … `OD-P5-I4-14`, ratifikovanu segmentaciju
  `P5-I4A` → `P5-I4B` → `P5-I4C`, perzistentne hash formate, model idempotencijske transakcije,
  audit model i vlasništvo lookup sposobnosti. **Dokumentacija isključivo.**
- **Amandman na:** **implementacijski ugovor `P5-I4`** i **normativni dio `03` §4, §8 i §11**.
  Sigurnosni ugovori **D-006**, **D-018**, **D-022**, **D-025**, **D-028**, **D-029**, **D-047**,
  **D-054**, **D-055**, **D-056**, **D-060**, **D-061**, **D-062**, **D-063**, **D-064**,
  **D-065**, **D-066**, **D-067**, **D-068**, **D-069**, **D-070** i **D-071** ostaju **doslovno
  na snazi i nepromijenjeni**. Nijedan raniji zapis se ne prepisuje; sve promjene su **aditivne
  anotacije** ili ažuriranje **tekućeg/normativnog** stanja.
- **Ova odluka NE implementira ništa.** Ne uvodi nijednu liniju izvornog koda, nijedan test,
  nijednu migraciju, schemu, Prisma model, contract TypeScript, API rutu, grant, rolu, politiku,
  izmjenu `package.json`/lockfilea ni izmjenu `.env.example`. **Nijedna baza nije kontaktirana** i
  **nijedan test se ovom odlukom ne izvršava.**
- **Ova odluka NE mijenja nijednu kućicu.** Checklist Faze 5 ostaje **`49 / 14`**. Ona objavljuje
  **forecast** od **sedamnaest** redova koji se smiju označiti **tek pri zatvaranju roditeljskog
  gatea `P5-I4`**, čime bi checklist prešao na **`49 / 31`**. **Forecast nije označavanje.**
- **Ova odluka NE autorizuje `P5-I4`.** `P5-I4` ostaje **`NEXT` / `DEPENDENCY-SATISFIED` /
  `NOT AUTHORIZED` / `NOT STARTED`**. **Ratifikacija ugovora nije autorizacija implementacije.**

## Kontekst/problem — trigger

D-071 je formalno zatvorio `P5-I3` i utvrdio `P5-I4` kao `NEXT` i `DEPENDENCY-SATISFIED`, uz
prenesene obaveze `CO-P5-I3-I4-1` i `CO-P5-I3-I4-2` i nepromijenjeno cross-cutting vlasništvo iz
D-069 — konkretan `TenantDatabaseService` facade (D-056), idempotency servis, `request_sha256`,
audit writer i Faza-5 audit self-hash.

`P5-I4` je pritom **prvi slice koji istovremeno dodiruje tri perzistentne, retroaktivno
nepopravljive površine**: `idempotency_keys.request_sha256`, `audit_events.event_sha256` i
`patient_references.external_patient_ref_hash`. Svaka od njih postaje **immutable čim postoji prvi
perzistirani red** — promjena algoritma nakon prvog upisa retroaktivno obezvrjeđuje sve ranije
redove. Uz to, `P5-I4` prvi put traži **konkretan tenant database facade** i uvodi **prvog
konkurentnog pisca** nad `idempotency_keys`.

Preflight je otvorio **četrnaest** vlasničkih pitanja:

```text
OD-P5-I4-1    ogranicen retry pri koliziji pseudonima
OD-P5-I4-2    strategija ON CONFLICT i model idempotencijske transakcije
OD-P5-I4-3    tacan ulaz u request_sha256
OD-P5-I4-4    tacan perzistentni audit hash payload
OD-P5-I4-5    porijeklo RFC 8785 implementacije
OD-P5-I4-6    audit rjecnik P5-I4
OD-P5-I4-7    HTTP status za nedostajuci Idempotency-Key
OD-P5-I4-8    idempotency TTL i sadrzaj minimalnog casha
OD-P5-I4-9    prihvaceni sourceSystem u P5-I4
OD-P5-I4-10   duplirana eksterna referenca
OD-P5-I4-11   obuhvat audita u P5-I4
OD-P5-I4-12   dokazivanje facade granice
OD-P5-I4-13   segmentacija P5-I4
OD-P5-I4-14   smjestaj lookup sposobnosti
```

**Vlasnik je ratifikovao svih četrnaest.** Ovaj zapis ih konstatuje kao odluke i izvodi njihovo
dokumentaciono pomirenje. **On ne bira nijednu opciju iznova.**

```text
OD-P5-I4-1    APPROVED
OD-P5-I4-2    APPROVED
OD-P5-I4-3    APPROVED
OD-P5-I4-4    APPROVED
OD-P5-I4-5    APPROVED
OD-P5-I4-6    APPROVED
OD-P5-I4-7    APPROVED
OD-P5-I4-8    APPROVED
OD-P5-I4-9    APPROVED
OD-P5-I4-10   APPROVED
OD-P5-I4-11   APPROVED
OD-P5-I4-12   APPROVED
OD-P5-I4-13   APPROVED
OD-P5-I4-14   APPROVED
```

## `OD-P5-I4-1` — ograničen retry pri koliziji pseudonima — `APPROVED`

```text
PSEUDONYM_INSERT_MAX_ATTEMPTS = 5
```

**Značenje je doslovno pet ukupnih `INSERT` kandidata**, ne pet dodatnih pokušaja nakon prvog.

- Svaki kandidat traži **svjež kanonski CSPRNG poziv** kroz mockabilan seam iz `P5-I3C`.
- **Nijedan kandidat se ne ponovo koristi** unutar istog zahtjeva.
- **Deterministički fallback ne postoji** — ni brojač, ni sufiks, ni izvođenje iz eksternog
  identifikatora, `practice_id`-a ili vremena. `P5-I3` je izričito zabranio determinističku granu
  u produkciji i ta zabrana se **ne slabi**.
- **Iscrpljenih pet kolizija pseudonima → `500 INTERNAL_ERROR`** sa **statičnim, ne-PHI** Problem
  Details tijelom.
- **Broj kolizija, broj pokušaja i bilo koji kandidat pseudonima se nikada ne izlažu** — ni u
  odgovoru, ni u Problem Details tijelu, ni u logu, ni u auditu.

Ovo zatvara rezidualni dio `CO-P5-I3-I4-1` koji glasi „**ograničen regenerate-and-retry** uz pad
nakon iscrpljenih pokušaja; **nikakav deterministički fallback**" (D-071, `RULING 2`).

## `OD-P5-I4-2`, dio A — strategija konflikta pseudonima — `APPROVED`

```text
PSEUDONYM_CONFLICT_STRATEGY = TARGETED_ON_CONFLICT_DO_NOTHING_RETURNING
PSEUDONYM_CONFLICT_STRATEGY_LONG_FORM =
    TARGETED_INDEX_INFERENCE_ON_CONFLICT_DO_NOTHING_RETURNING
```

**Oba imena označavaju JEDNU te istu strategiju.** Kratka forma je kanonska konstanta; duga forma
eksplicitno imenuje mehanizam — **index inference kroz column-list** — i koristi se u gate
izvještajima. **Ne postoje dvije strategije.**

### Utvrđena PostgreSQL činjenica — pojašnjenje iz vlasničke verifikacije

Provjerom kanonskog migration paketa `003` utvrđeno je da je

```text
patient_references_pseudonym_key
```

**imenovani UNIQUE INDEX**, kreiran kao

```sql
CREATE UNIQUE INDEX "patient_references_pseudonym_key"
    ON "patient_references"("practice_id", "pseudonym");
```

a **ne** table-level `UNIQUE CONSTRAINT`. PostgreSQL `ON CONFLICT ON CONSTRAINT <ime>` prihvata
**isključivo ime constrainta**; nad imenom samostalnog indeksa **nije važeće** i pada u izvršavanju.
**Zato se forma `ON CONFLICT ON CONSTRAINT patient_references_pseudonym_key` izričito NE
propisuje.**

### Kanonska izvršiva forma

```sql
INSERT INTO patient_references (...)
VALUES (...)
ON CONFLICT ("practice_id", "pseudonym") DO NOTHING
RETURNING id, pseudonym, birth_year, sex_code, source_system, created_at;
```

**Column-list inference `("practice_id", "pseudonym")` ciljano pogađa tačno onaj objekat
jedinstvenosti koji `OD-P5-I4-2` semantički zahtijeva** — indeks
`patient_references_pseudonym_key` — i **nijedan drugi**.

### Obavezna semantika

- **Vraćen red → uspjeh.** Kandidat je prihvaćen; retry petlja se prekida.
- **Nula redova → kolizija pseudonima** → **svjež** kandidat, sljedeći pokušaj.
- **Maksimalno pet pokušaja** (`OD-P5-I4-1`).
- **Bez pre-reada** — nikakav `SELECT` „da li pseudonim postoji" prije `INSERT`-a. Pre-read je
  istovremeno race i oracle.
- **Bez `SAVEPOINT`**, **bez ugniježdene transakcije**, **bez druge transakcije**.
- **Bez neciljanog `ON CONFLICT DO NOTHING`.** Neciljana forma bi progutala **i** konflikt eksterne
  reference **i** tenant konflikt, i pretvorila `OD-P5-I4-10` u tiho ništa.

### Nezavisna osmotrivost druge jedinstvenosti

```text
patient_references_source_external_ref_key
    unique (practice_id, source_system, external_patient_ref_hash)
```

**mora ostati nezavisno osmotriva.** Ciljano `ON CONFLICT` nad `("practice_id", "pseudonym")` je
**ne dodiruje**, pa njena povreda i dalje podiže `23505` sa **tim** imenom indeksa — jedini
dozvoljeni okidač iz `OD-P5-I4-10`.

## `OD-P5-I4-2`, dio B — model idempotencijske transakcije — `APPROVED`

```text
IDEMPOTENCY_TRANSACTION_MODEL = ONE_ADMITTED_TRANSACTION
IDEMPOTENCY_CONCURRENCY_GUARD = TRANSACTION_SCOPED_ADVISORY_LOCK
```

**Kanonski redoslijed komandi — normativan i potpun:**

```text
1.  koristi postojecu admitted pinovanu tenant transakciju (D-054, klauzula 6)
2.  pribavi validiran request_sha256 (OD-P5-I4-3)
3.  pokusaj NEBLOKIRAJUCI transaction-scoped advisory lock nad idempotency scopeom
4.  lock nedostupan            -> 409 REQUEST_ALREADY_IN_PROGRESS
5.  lock pribavljen            -> inspekcija kanonskog idempotency scopea
6.  completed + isti hash      -> replay (OD-P5-I4-8)
7.  completed + drugi hash     -> 409 IDEMPOTENCY_CONFLICT
8.  postojeci nezavrsen claim  -> 409 REQUEST_ALREADY_IN_PROGRESS
9.  odsutan                    -> kreiraj claim
10. izvrsi poslovnu mutaciju
11. upisi success audit dogadjaj
12. finalizuj idempotency zapis
13. jedan commit
```

**Obavezno:**

- **Poslovni ili audit neuspjeh → rollback cijele transakcije.** Ne postoji putanja u kojoj
  poslovni red izostane, a idempotency zapis ostane `completed`.
- **Nema completed casha bez uspješne poslovne mutacije.**
- **Nema lažnog success audit zapisa.**
- **Nema druge, ugniježdene ni paralelne aplikacijske transakcije** (D-054, klauzula 8).
- **Nema preuzimanja ustajalog claima (`stale-claim takeover`) u `P5-I4`.** Nezavršen claim je
  `409 REQUEST_ALREADY_IN_PROGRESS`, tačka. Politika isteka i preuzimanja je zaseban budući
  governance predmet i **ne izmišlja se ovdje**.

Kanonski idempotency scope ostaje nepromijenjen (`02` §11; `03` §4):

```text
unique (practice_id, user_id, endpoint, idempotency_key)
```

### Ugovor advisory locka

Identitet advisory locka je **deterministički izveden** iz **tačno** četiri komponente scopea:

```text
practice_id, user_id, endpoint, idempotency_key
```

izvođenjem:

```text
1. nedvosmislena length-prefixed UTF-8 reprezentacija scopea
2. SHA-256 nad tom reprezentacijom
3. prvih 8 bajtova digesta
4. network / big-endian redoslijed
5. interpretacija kao signed two-s-complement int64
```

**Obavezno:**

- **Tačni enkodirani bajtovi i očekivani int64 izlaz MORAJU biti pinovani fiksnim implementacijskim
  test vektorima prije prihvatanja `P5-I4C`.**
- **Bez ad-hoc konkatenacije sa delimiterom.** Konkatenacija razdvojena znakom je ranjiva na
  koliziju granica polja i **nije dozvoljena**; zato je propisan **length-prefixed** oblik.
- **Bez direktne konverzije korisnički kontrolisanog stringa** u PostgreSQL lock integer.
- **Lock ključ se ne perzistira** — ni u koloni, ni u auditu, ni u logu.
- Lock je **transaction-scoped**; oslobađa se commitom ili rollbackom, bez eksplicitnog unlocka.

**Advisory lock je mehanizam kontrole konkurencije, NE sigurnosna ni autorizacijska granica.**
Stvarnu tenant granicu i dalje nose **RLS** i **admitted tenant sesija** (`09` §4, §4.2).

## `OD-P5-I4-3` — kanonski ulaz u `request_sha256` — `APPROVED`

```text
REQUEST_SHA256_INPUT = VALIDATED_ORIGINAL_PARSED_BODY
```

```text
request_sha256 = SHA-256( UTF8( RFC8785_JCS( validated_original_parsed_body ) ) )
```

**Kanonski pipeline:**

```text
parse -> sacuvaj ORIGINALNU parsiranu JSON vrijednost -> validiraj
      -> JCS nad SACUVANOM parsiranom vrijednoscu -> SHA-256
```

**Ulaz NIJE:**

- sirovi HTTP bajtovi;
- pre-parse JSON tekst;
- transformisani DTO;
- instanca klase;
- server-proširena ili server-defaultovana reprezentacija.

**Kanonska isključenja iz D-069, `RULING 4` ostaju doslovno na snazi** i ne slabe se: HTTP metod;
ruta/path; query string; headeri; sam `Idempotency-Key`; autentifikacijski identitet; identitet
ordinacije; request id; server-generisani id-evi; server-izvedeni status; server timestampovi;
svako drugo server-izvedeno polje.

**Eksplicitna semantika:**

- **odsutno polje != eksplicitni `null`**;
- **redoslijed elemenata niza je značajan**;
- **ulazni redoslijed ključeva objekta je irelevantan** — JCS ga kanonizuje;
- **whitespace je irelevantan nakon parsiranja**;
- **nepoznata polja se odbijaju** prije hashiranja, pa nikada ne ulaze u digest;
- **server defaulti se NE uvode** u hashiranu vrijednost.

Izlaz ostaje **64 mala heksadecimalna znaka**, što odgovara `varchar(64)` (`02` §11).

## `OD-P5-I4-4` — `AUDIT_EVENT_HASH_PAYLOAD_V1` — `APPROVED`

```text
AUDIT_HASH_FORMAT = AUDIT_EVENT_HASH_PAYLOAD_V1
event_sha256      = SHA-256( UTF8( RFC8785_JCS( AUDIT_EVENT_HASH_PAYLOAD_V1 ) ) )
```

Payload sadrži **tačno sedamnaest ključeva**, i to **imena kolona baze** iz D-069, `RULING 5`:

```text
id, practice_id, occurred_at, actor_type, actor_user_id, actor_service,
action, resource_type, resource_id, request_id, session_id_hash,
ip_address, user_agent_hash, previous_value, new_value, metadata,
previous_event_sha256
```

**Isključen je isključivo `event_sha256`.**

### Pravila vrijednosti

**UUID.** Serijalizuje se kao **mala kanonska hyphenated** string reprezentacija. Nullable UUID
kolone (`actor_user_id`, `resource_id`) koje su `NULL` serijalizuju se kao JSON `null`.

**`occurred_at`.**

```text
AUDIT_OCCURRED_AT_FORMAT = UTC_RFC3339_6_FRACTIONAL_DIGITS_LAST_3_ZERO
```

Primjer oblika:

```text
2026-08-29T12:34:56.123000Z
```

- Aplikacija **generiše timestamp tačno jednom** prije hashiranja.
- **Preciznost u Fazi 5 je milisekunda.**
- Kanonski string **uvijek nosi šest decimalnih cifara**, a **posljednje tri su `000`**.
- **Isti instant se perzistira** u `audit_events.occurred_at` (`timestamptz(6)`).
- **Nikakav DB-generisani zamjenski timestamp** (`now()`, `CURRENT_TIMESTAMP`, default) se ne
  koristi za ovu kolonu — put „generiši ponovo tokom `INSERT`-a" je i dalje zabranjen (D-069,
  `RULING 5`).

**JSONB kolone.** `previous_value`, `new_value` i `metadata` se ugrađuju kao **JSON vrijednosti**,
**ne kao JSON stringovi** koji sadrže serijalizovani JSON. Moraju biti validne I-JSON / JCS-
kompatibilne vrijednosti. Hashira se **konačna sanitizovana pohranjena** reprezentacija (`02`
§15.4; `09` §12).

**Opcionalna audit telemetrija u Fazi 5.**

```text
session_id_hash  = null
ip_address       = null
user_agent_hash  = null
```

**Nikakva `inet` serijalizacija se ne izmišlja.** Faza 5 ta tri polja ne popunjava, pa pitanje
kanonskog tekstualnog oblika `inet` vrijednosti **ne nastaje** i **ne prejudicira se**.

**`previous_event_sha256`.** Uvijek **prisutan** kao JSON `null`. **Nikada se ne izostavlja.**
Faza 5 i dalje **NE tvrdi linearni hash lanac** (D-069, `RULING 5`).

### Obavezna reprodukcija iz pohranjenog reda

**Obavezno:** iz **pohranjenog** audit reda mora se rekonstruisati **svih sedamnaest** vrijednosti
i **reprodukovati tačan `event_sha256`**. Test koji hashira in-memory objekat prije `INSERT`-a
**ne zadovoljava** ovaj zahtjev.

## `OD-P5-I4-5` — porijeklo RFC 8785 implementacije — `APPROVED`

```text
RFC8785_IMPLEMENTATION        = LOCAL / PINNED_OFFICIAL_VECTORS
NEW_RUNTIME_DEPENDENCY_REQUIRED = NO
```

- **Lokalna implementacija u repozitoriju.** **Nijedan JCS paket nije ovlašten** ovom odlukom.
- Implementacija mora reprodukovati **stvarno ponašanje RFC 8785**, uključujući kanonizaciju
  brojeva, escapiranje stringova i sortiranje ključeva po UTF-16 code unitima.
- **Zabranjen je reducirani vlastiti podskup predstavljen kao JCS.** „Dovoljno za naša tijela"
  nije JCS i **ne smije se tako imenovati**.
- Mora biti pinovana **fiksnim službenim/javnim vektorima** — **doslovni očekivani kanonski
  izlazi** i **doslovne očekivane digest vrijednosti** tamo gdje su primjenjive.
- **Implementacija ne smije generisati vlastite očekivane vrijednosti.** Vektor koji je izračunat
  istom implementacijom koja se testira nije dokaz.

## `OD-P5-I4-6` — audit rječnik `P5-I4` — `APPROVED`

Tačni literali koje `P5-I4` upisuje:

```text
AUDIT_ACTOR_TYPE     = USER
AUDIT_RESOURCE_TYPE  = PATIENT_REFERENCE
AUDIT_ACTION         = PATIENT_REFERENCE_CREATED
```

- **`P5-I4` ne uvodi nijednu read akciju.**
- **`DOCUMENT_VIEWED` se ne reciklira** ni za jedan `patient_references` događaj.

## `OD-P5-I4-7` — nedostajući `Idempotency-Key` — `APPROVED`

```text
HTTP                       400
ProblemDetails code        IDEMPOTENCY_KEY_REQUIRED
poruka                     staticna, bez odraza ulaza
```

- **`428` se NE koristi.** `428 Precondition Required` u ovom repozitoriju pripada isključivo
  `PRECONDITION_REQUIRED` semantici nedostajućeg `If-Match` nad šest optimistic-locking resursa
  (`03` §5.1, §8.1; D-028). **Ta semantika se ne dira.**
- `IDEMPOTENCY_KEY_REQUIRED` već postoji u stabilnom error code katalogu (`03` §8); D-072 mu
  **dodaje eksplicitno mapiranje na status**, ne novi kod.

## `OD-P5-I4-8` — idempotency TTL i minimalni cash — `APPROVED`

```text
IDEMPOTENCY_TTL_HOURS = 48
expires_at            = claim_time + 48 sati
```

- **`claim_time` se generiše tačno jednom** pri kreiranju claima.
- `48` sati je unutar kanonskog raspona `retention 24–72 sata prema endpointu` (`03` §4) i
  **ne mijenja ga**.

**Sadržaj zapisa pri kompletiranju:**

```text
response_status = 201
response_body   = {"resourceId":"<patient-reference-uuid>"}
completed_at    = postavljen
locked_at       = null
```

- **Nikakav PHI ni puna reprezentacija resursa se ne cashira.** `pseudonym`, `birthYear`,
  `sexCode`, `sourceSystem` i `createdAt` **ne ulaze** u `response_body`.
- **Replay istog ključa sa istim hashem** izvodi se ovako: pročitaj `resourceId` iz casha →
  **tenant-scoped immutable read** `patient_references` reda → **rekonstruiši kanonsko `201`
  tijelo** iz `03` §11. Cash je **pokazivač**, ne kopija.
- **Completed cash koji pokazuje na nerazrješiv resurs → `500 INTERNAL_ERROR`.** Ne izmišlja se
  odgovor, ne vraća se `404`, i ne briše se zapis.
- **Nema cleanupa u `P5-I4`.** Brisanje isteklih ključeva je zaseban budući predmet.
- **Nema preuzimanja ustajalog claima.**
- **`expires_at` se nikada kasnije ne mijenja** — ni pri kompletiranju, ni pri replayu.

## `OD-P5-I4-9` — prihvaćeni `sourceSystem` — `APPROVED`

```text
SOURCE_SYSTEM_ACCEPTED = MANUAL_ONLY
```

- **`sourceSystem` je obavezan** u tijelu `POST /patient-references`.
- **Prihvaćeno u `P5-I4`:** `MANUAL`.
- **Odbijeno u `P5-I4`:** `AXENITA`, `CSV`, `FHIR`, `OTHER` → **`422 VALIDATION_ERROR`** sa
  **generičkom, statičnom porukom** koja ne citira vrijednost (`03` §8).
- **Schema enum se NE mijenja.** Vrijednosti ostaju u bazi i tipu; `P5-I4` ih odbija na
  **aplikacijskom sloju**, jer ne posjeduje njihove normalizacijske profile.
- **Nikakva provider normalizacija se ne izmišlja.** Profil `AXENITA` ne postoji.
- **`D-OPEN-009` ostaje `BLOCKED EXTERNAL`** (`13` §7). `OD-P5-I4-9` **ne mijenja** njegov status
  i ne traži izmjenu `13`.

## `OD-P5-I4-10` — duplirana eksterna referenca — `APPROVED`

Novi kanonski ProblemDetails kod:

```text
PATIENT_REFERENCE_ALREADY_EXISTS      HTTP 409
```

**Okidač je isključivo** povreda jedinstvenosti eksterne reference:

```text
patient_references_source_external_ref_key
    unique (practice_id, source_system, external_patient_ref_hash)
```

**Obavezno:**

- **nikakav „uspješan" `200` fallback** — duplikat nije uspjeh;
- **nikakvo otkrivanje postojećeg reda** — bez `id`-a, bez pseudonima, bez `createdAt`-a, bez
  ikakvog polja postojećeg resursa u odgovoru;
- **nikakva reupotreba `IDEMPOTENCY_CONFLICT`** — to je drugačiji uzrok i drugačiji ugovor;
- **nikakav pre-read** — postojanje se utvrđuje **isključivo** iz greške baze;
- **nikakav globalni prevod `23505`** u ovaj kod.

**Kanonsko mapiranje `23505`:**

```text
patient_references_pseudonym_key            -> ciljani retry mehanizam (OD-P5-I4-1, OD-P5-I4-2)
patient_references_source_external_ref_key  -> 409 PATIENT_REFERENCE_ALREADY_EXISTS
bilo koji drugi 23505                       -> 500 INTERNAL_ERROR, osim ako je zasebno kanonski
```

## `OD-P5-I4-11` — obuhvat i minimizacija audita — `APPROVED`

```text
P5_I4_AUDIT_SCOPE = SUCCESSFUL_CREATE_ONLY
```

- **Uspješan `POST /patient-references`** → **trajan** audit događaj `PATIENT_REFERENCE_CREATED`.
- **`GET /patient-references/{id}`** → **nijedan trajan `P5-I4` audit red.** Sensitive-read audit
  iz `09` §12 ostaje kanonska obaveza kasnijih slice-ova nad dokumentima; `P5-I4` ga **ne uvodi i
  ne prejudicira**.
- **Neuspješan `POST`** → **nijedan trajan failure audit red.**
- **Poslovni `INSERT` i audit `INSERT` su u ISTOJ transakciji**; neuspjeh bilo kojeg → **rollback
  oba**.

**Minimalni sadržaj audit zapisa:**

```text
previous_value = null
new_value      = null
metadata       = {"sourceSystem":"MANUAL"}
```

**U audit payload se NE upisuje:**

- sirova eksterna referenca;
- HMAC eksterne reference (`external_patient_ref_hash`);
- pseudonim;
- `birthYear`;
- `sexCode`;
- sirovo tijelo zahtjeva.

`resource_id` nosi UUID kreiranog `patient_references` reda i to je **jedini** identifikator
resursa u zapisu.

## `OD-P5-I4-12` — dokazivanje facade granice — `APPROVED`

**Obavezne su OBJE klase dokaza. Lint pravilo samo po sebi NIJE dovoljno.**

### Statički dokaz

**Trajan import/source-boundary test** koji dokazuje da `P5-I4` poslovni/aplikacijski kod **ne
može direktno koristiti**:

- `PrismaService`;
- `PrismaClient`;
- sirove database client primitive

**izvan ovlaštenog facade/adapter sloja**.

### Bihevioralni dokaz

**Trajan recording-session / fake-session test** koji dokazuje:

- korištenje **postojeće admitted pinovane sesije**;
- **nijednu drugu transakciju**;
- **tenant kontekst uspostavljen prije** poslovnog iskaza;
- **tačan redoslijed izvršenih iskaza**;
- **nikakav caller-supplied identitet**.

Oba dokaza su **kriteriji prihvatanja** i ponovo dokazuju **D-054, klauzule 6–10** i **D-056,
klauzulu 5**, bez slabljenja ijednog od devet facade redova iz `05` §6.

## `OD-P5-I4-13` — segmentacija `P5-I4` — `APPROVED`

```text
P5-I4A -> P5-I4B -> P5-I4C
NO P5-I4D
```

Redoslijed je **strogo sekvencijalan**; nijedan pod-gate se ne izvršava prije kanoničnosti
prethodnog.

### `P5-I4A` — `TenantDatabaseService` facade + `GET` patient reference

Obuhvat:

- **konkretan facade**;
- **ponovni dokaz D-054, klauzula 6–10**;
- **trajni facade testovi** (obje klase iz `OD-P5-I4-12`);
- **`GET /patient-references/{id}`**;
- **tenant-scoped read**;
- **not-found i cross-tenant su nerazlučivi `404`**;
- potrebno contract/DTO/module ožičenje.

Izvan obuhvata `P5-I4A`: `POST`; JCS; `request_sha256`; idempotencija; audit writer i audit hash.

### `P5-I4B` — DB-free deterministički formati

Obuhvat:

- **lokalni RFC 8785 (JCS)**;
- **`request_sha256`**;
- **`AUDIT_EVENT_HASH_PAYLOAD_V1`**;
- **`event_sha256` helper**;
- **pinovani doslovni test vektori**.

Izvan obuhvata `P5-I4B`: svi database writeri i `POST` ruta.

### `P5-I4C` — idempotencija, audit writer i `POST`

Obuhvat:

- **idempotency servis**;
- **advisory-lock kontrola konkurencije**;
- **audit writer**;
- **`POST /patient-references`**;
- **konzumacija `MANUAL` v1 normalizacije**;
- **perzistencija HMAC-a** (`external_patient_ref_hash`);
- **ciljani retry pseudonima**;
- **`PATIENT_REFERENCE_ALREADY_EXISTS`**;
- **servisni lookup po pseudonimu**;
- **servisni lookup po eksternoj referenci**;
- **`CO-P5-I3-I4-1`**;
- **`CO-P5-I3-I4-2`**;
- integracioni, sigurnosni, API i concurrency dokazi.

### Pravilo označavanja

**Nijedan pod-gate `P5-I4A/B/C` ne označava nijednu kućicu roditeljskog checklista.** Sedamnaest
redova iz forecasta niže označava **isključivo zatvaranje roditeljskog gatea `P5-I4`**, zasebnim
governance potezom.

## `OD-P5-I4-14` — smještaj lookup sposobnosti — `APPROVED`

**`P5-I4C` implementira obje lookup sposobnosti isključivo na SERVISNOM nivou. Nova HTTP ruta se
NE uvodi.**

### Lookup po pseudonimu

- koristi **kanonski `P5-I3` ASCII uppercase helper** — **bez mutacije `P5-I3` kanonizatora**;
- uvodi **zaseban, aditivan v1 validator** sintakse;
- sintaksa: `P-` + **tačno 10** znakova iz azbuke

```text
0123456789ABCDEFGHJKMNPQRSTVWXYZ
```

- **tenant-scoped**, **obična jednakost**;
- **bez `LOWER()`**, **bez `citext`**, **bez posebne kolacije** (`02` §2.9.4).

### Lookup po eksternoj referenci

- **`MANUAL` v1 normalizacija** ulaza;
- domen **`patient_external_ref`**;
- **admitted `practice_id`** — nikada caller-supplied;
- `sourceSystem` = **`MANUAL`**;
- **HMAC-SHA256** po kanonskoj poruci (D-060; D-070);
- **tenant-scoped lookup po jednakosti** nad `external_patient_ref_hash`.

**Obavezno:**

- **nikakva plaintext perzistencija** eksterne reference u lookup putu;
- **nikakav javni lookup endpoint** u Fazi 5;
- **`P5-I5` kasnije konzumira sposobnost lookupa po pseudonimu NEPROMIJENJENU** i ne smije je
  forkovati ni izmisliti iznova.

## Zamrzavanje scheme i sigurnosne osnove

```text
PRISMA_SCHEMA_MUTATION_REQUIRED = NO
MIGRATION_REQUIRED              = NO
RLS_POLICY_MUTATION_REQUIRED    = NO
GRANT_MUTATION_REQUIRED         = NO
```

`P5-I4` **konzumira kanonsku `P5-I2` sigurnosnu osnovu nepromijenjenu** — 25 politika nad 13
tabela sa `ENABLE` + `FORCE ROW LEVEL SECURITY`, immutability trigeri paketa `014` i kanonski
grantovi. **Svaki kasnije otkriven zahtjev za izmjenom bilo koje od tih površina uzrokuje `HOLD` i
novu governance odluku** — ne tihu izmjenu unutar implementacijskog gatea.

## Zamrzavanje zavisnosti

```text
NEW_RUNTIME_DEPENDENCY_REQUIRED = NO
```

**Podrazumijevano stanje je `NO NEW DEPENDENCY`.** **D-072 ne ovlašćuje nijednu instalaciju
paketa**, ni runtime ni dev. RFC 8785 se implementira lokalno (`OD-P5-I4-5`).

## Forecast checklista — sedamnaest redova

**Ovo je FORECAST, ne označavanje.** **Nijedna kućica se ovom odlukom ne mijenja.**

Tačno **sedamnaest** postojećih redova `05` §6 zatvara se **tek pri zatvaranju roditeljskog gatea
`P5-I4`**:

**Devet redova D-056 facade obaveze** (`05` §6, „Konkretan `TenantDatabaseService` facade —
prenesena obaveza (D-056)") — doslovan postojeći tekst, nepromijenjen.

**Dva `API` reda:**

```text
POST patient reference.
GET patient reference.
```

**Dva `Services` reda:**

```text
idempotency service.
audit.
```

**Četiri `Tests` reda:**

```text
unknown field rejected.
duplicate idempotency.
idempotency conflict.
cross-tenant GET.
```

```text
prije D-072                          49 / 14
forecast                             17 x [ ] -> [x]
pri zatvaranju roditelja P5-I4       49 / 31
poslije D-072 (mehanicki, sada)      49 / 14
```

**Nijedna trenutna kućica se ne mijenja.** Ako se mehanički broj nakon ovog zapisa razlikuje od
`49 / 14`, zapis je neispravan i mora se ispraviti prije mergea.

## Posljedice

- `03` dobija `PATIENT_REFERENCE_ALREADY_EXISTS` u stabilnom error code katalogu i mapiranje na
  `409`, plus eksplicitno mapiranje `IDEMPOTENCY_KEY_REQUIRED` → `400`; **`428` semantika
  `If-Match` se ne dira**.
- `04` dobija ugovor D-072 i segmentaciju `P5-I4A/B/C` u §7.5a; **status `P5-I4` ostaje
  `NEXT` / `DEPENDENCY-SATISFIED` / `NOT AUTHORIZED` / `NOT STARTED`**.
- `05` dobija aditivnu forecast sekciju bez ijedne promjene kućice.
- `08` dobija obavezne dokaze `P5-I4A/B/C`; **nijedan test se ovom odlukom ne piše ni izvršava**.
- `09` dobija sekciju minimizacije `P5-I4` audita i granice tvrdnje advisory locka.
- `MANIFEST.md` se preračunava; **broj redova ostaje 19**.

## Security/privacy uticaj

- **Audit minimizacija je pooštrena, ne oslabljena**: `previous_value` i `new_value` su `null`, a
  `metadata` nosi isključivo `{"sourceSystem":"MANUAL"}`.
- **Nijedan Class A ni Class C identifikator ne ulazi u audit payload** — ni sirova eksterna
  referenca, ni HMAC, ni pseudonim, ni `birthYear`, ni `sexCode`.
- **`AUDIT_EVENT_HASH_PAYLOAD_V1` hashira konačne sanitizovane pohranjene vrijednosti**, pa nikada
  ne pina nesanitizovan PHI.
- **Advisory lock nije sigurnosna granica** i ne smije se tako predstavljati; tenant granicu nose
  RLS i admitted sesija.
- **Produkcijski KMS se i dalje ne tvrdi**; `D-OPEN-004a` ostaje otvoren.
- **AXENITA implementacija ne postoji**; `D-OPEN-009` ostaje `BLOCKED EXTERNAL`.

## Test dokaz

Obavezni dokazi po pod-gateu su nabrojani u `08` §12.10 (`P5-I4A`), §12.11 (`P5-I4B`) i §12.12
(`P5-I4C`). **D-072 ne izvršava nijedan test** i ne tvrdi nijedan rezultat.

## Granice ove odluke

```text
D-072 ratifikuje ugovor          = YES
D-072 autorizuje P5-I4           = NO
D-072 autorizuje P5-I4A          = NO
D-072 mijenja kucice             = NO
D-072 mijenja schemu/RLS/grants  = NO
D-072 instalira zavisnosti       = NO
D-072 odblokira P5-I5            = NO
D-072 autorizuje P5-I6           = NO
```

**`P5-I4` = `CONTRACT RATIFIED` / `NEXT` / `DEPENDENCY-SATISFIED` / `NOT AUTHORIZED` /
`NOT STARTED`.** Traži **zaseban read-only preflight** i **zaseban vlasnički autorizacijski potez**
za `P5-I4A`.

**`P5-I5` ostaje `STILL DEPENDENCY-BLOCKED` / `NOT AUTHORIZED` / `NOT STARTED`** — po `04` §7.5
zavisi i od `P5-I4`, koji nije kanonski. **`P5-I6` ostaje `NOT AUTHORIZED` / `NOT STARTED`** i
**posjeduje redakciju**; red `Services → redaction` u `05` §6 **ostaje neoznačen**. **Nikakva
encounter, document ni redakcijska implementacija nije ovlaštena.** **Faza 5 ostaje
`IN_PROGRESS`; nije `DONE`.** **`★` ostaje trajna regresija.**

## Naredni obavezni gate

**Vlasnički pregled D-072 i adjudikacija dokaza**, pa zaseban publikacioni gate (push / PR /
merge).

```text
D-072 AUTHORED                  = YES
D-072 CANONICAL                 = NO      (do merge-a u origin/main)
P5-I4 IMPLEMENTATION AUTHORIZED = NO
P5-I4 IMPLEMENTATION STARTED    = NO
CURRENT_CHECKLIST               = 49 / 14
```

**Dok ova governance grana ne bude merged, kanonski `origin/main` i dalje nosi pred-D-072
governance stanje.**

---

# D-073 — `P5-I4A` implementacijski ugovor: tenant admission scope, validacija resource ID-a i wire ugovor timestampa

- **Status:** ACCEPTED / OWNER-RATIFIED
- **Datum:** 2026-08-29
- **Tip:** vlasnički ratifikovan **governance zapis rafiniranja implementacijskog ugovora
  `P5-I4A`**. On zamrzava **tri** preflight odluke `OD-P5-I4A-1` … `OD-P5-I4A-3` — zatvoreni model
  tenant request scopea, ugovor malformisanog resource UUID-a i javni wire format `createdAt`-a.
  **Dokumentacija isključivo.**
- **Amandman na:** **implementacijski ugovor `P5-I4A`** unutar ratifikovanog `P5-I4` ugovora
  (D-072) i **normativni dio `03` §11**. Sigurnosni i ugovorni zapisi **D-006**, **D-018**,
  **D-022**, **D-025**, **D-028**, **D-029**, **D-047**, **D-054**, **D-055**, **D-056**,
  **D-060**, **D-061**, **D-062**, **D-063**, **D-064**, **D-065**, **D-066**, **D-067**,
  **D-068**, **D-069**, **D-070**, **D-071** i **D-072** ostaju **doslovno na snazi i
  nepromijenjeni**. **Nijedan raniji zapis se ne prepisuje**; sve promjene su **aditivne
  anotacije** ili ažuriranje **tekućeg/normativnog** stanja.
- **Ova odluka NE implementira ništa.** Ne uvodi nijednu liniju izvornog koda, nijedan test,
  nijednu migraciju, schemu, Prisma model, contract TypeScript, API rutu, grant, rolu, politiku,
  izmjenu `package.json`/lockfilea ni izmjenu `.env.example`. **Nijedna baza nije kontaktirana** i
  **nijedan test se ovom odlukom ne izvršava.**
- **Ova odluka NE mijenja nijednu kućicu.** Checklist Faze 5 ostaje **`49 / 14`**, a forecast
  roditeljskog gatea `P5-I4` ostaje **`49 / 31`** (D-072). **`PHASE5_CHECKBOX_TRANSITIONS = 0`.**
- **Ova odluka NE autorizuje `P5-I4A`.** `P5-I4A` ostaje **`NOT AUTHORIZED` / `NOT STARTED`**.
  **Ratifikacija ugovora nije autorizacija implementacije.**

## Kontekst/problem — trigger

D-072 je ratifikovao implementacijski ugovor `P5-I4` i segmentaciju `P5-I4A` → `P5-I4B` →
`P5-I4C`. Zaseban read-only preflight `P5-I4A` je zatim otkrio **tri** mjesta na kojima ugovor
`P5-I4A` još nije bio deterministički, a svako od njih je moglo proizvesti tihu sigurnosnu ili
kompatibilnosnu regresiju:

```text
OD-P5-I4A-1   tenant request scope za rutu bez practiceId u pathu
OD-P5-I4A-2   ponasanje pri malformisanom resource UUID-u
OD-P5-I4A-3   javni wire format patient-reference createdAt polja
```

**Vlasnik je ratifikovao sve tri.** Ovaj zapis ih konstatuje kao odluke i izvodi njihovo
dokumentaciono pomirenje. **On ne bira nijednu opciju iznova i ne otvara četvrtu.**

```text
OD-P5-I4A-1   APPROVED
OD-P5-I4A-2   APPROVED
OD-P5-I4A-3   APPROVED
```

```text
OWNER_DECISIONS_REQUIRED_FOR_P5_I4A = 0
```

**Nijedan `OD-P5-I4A-*` nije ostao nerazriješen**, i **`OD-P5-I4A-4` ne postoji**. Ugovor
`P5-I4A` je time **dovoljno determinističan da kasnija, zasebna vlasnička autorizacija
implementacije bude moguća** nakon što D-073 postane kanonski. **Sam D-073 tu autorizaciju NE
daje.**

## `OD-P5-I4A-1` — zatvoreni model tenant request scopea — `APPROVED`

```text
TENANT_REQUEST_SCOPE_MODEL = CLOSED_DISCRIMINATED_UNION
TENANT_ADMISSION_PIPELINE_COUNT = 1
```

Model ima **tačno dvije semantičke varijante**, i **svako tenant call mjesto mora eksplicitno
navesti svoju varijantu**. **Treća varijanta ne postoji**, a **implicitni default ne postoji**.

### Varijanta `PRACTICE_PATH`

Za tenant rute **čiji path eksplicitno nosi identitet ordinacije**.

Nosi:

```text
requestedPracticeId: string
```

**obavezno** — nikada opciono.

Ponašanje:

- pročitaj i validiraj `X-Practice-ID`;
- **uporedi `practiceId` iz patha sa admitted header practice kontekstom**;
- **neslaganje zadržava kanonsko `403 ACCESS_DENIED`** (`03` §3.7.1);
- nastavi kroz **nepromijenjenu** admission sekvencu — postojanje ordinacije, `practices.status`,
  aktivan membership, uspostava konteksta, provjera permisije.

### Varijanta `HEADER_ONLY`

Za kanonske tenant rute **čiji path ne nosi identitet ordinacije**.

Nosi:

**nijedan path/caller `practiceId` član** — ni obavezan, ni opcioni, ni nullable.

Ponašanje:

- pročitaj i validiraj `X-Practice-ID`;
- **ne izvodi nikakvo lažno poređenje patha i headera**;
- nastavi kroz **iste** kanonske admission korake;
- admitted `practiceId` se izvodi **isključivo** iz validiranog header/kontekst puta.

### Kanonske dodjele

```text
PATIENT_REFERENCE_GET_TENANT_SCOPE = HEADER_ONLY
EXISTING_PRACTICE_ROUTES_TENANT_SCOPE = PRACTICE_PATH
```

Obje varijante ulaze u **jedan te isti** `TenantRequestPipeline`. **Postoji tačno jedan tenant
admission pipeline** (`TENANT_ADMISSION_PIPELINE_COUNT = 1`).

## `OD-P5-I4A-1` — zabranjeni sigurnosni šavovi

Sljedeće je **izričito zabranjeno**:

```text
requestedPracticeId?: string
requestedPracticeId: string | undefined
```

- **opcioni ili `undefined`-nosivi `requestedPracticeId` član** — opcionalnost pretvara tenant
  provjeru u tiho preskočenu granu;
- **prosljeđivanje vrijednosti headera nazad kao lažnog path `practiceId`-a**;
- **poređenje header-izvedenog `practiceId`-a sa samim sobom** — tautologija koja izgleda kao
  provjera, a ne provjerava ništa;
- **drugi tenant admission pipeline**;
- **zaobilaženje `TenantRequestPipeline`-a**;
- **zasebna ili slabija admission putanja za patient-reference `GET`**.

**Tačna implementacijska imena tipova ostaju implementacijski detalj.** Normativna je **zatvorena
dvovarijantna semantika**, ne njeno imenovanje.

## `OD-P5-I4A-1` — ne-regresija postojećih ruta

Postojeće rute čiji path sadrži `{practiceId}` ostaju **`PRACTICE_PATH`**, i njihovo kanonsko
ponašanje pri neslaganju patha i headera ostaje **`403 ACCESS_DENIED`**, nepromijenjeno.

**Nijedna promjena** ne uvodi se u:

- practice read;
- practice settings `GET`;
- practice settings `PATCH`.

**Svi kasniji admission koraci ostaju dijeljeni** između `PRACTICE_PATH` i `HEADER_ONLY` — razlika
postoji **isključivo** u prvom koraku, u tome da li se path `practiceId` uopšte pojavljuje.
**D-073 ne ovlašćuje drugu admission implementaciju.**

## `OD-P5-I4A-2` — malformisan resource UUID — `APPROVED`

Za:

```text
GET /api/v1/patient-references/{id}
```

malformisan `{id}` **po postojećoj repozitorijskoj UUID-shape semantici** vraća:

```text
MALFORMED_PATIENT_REFERENCE_ID = 400 VALIDATION_ERROR
MALFORMED_RESOURCE_UUID_DB_READS = 0
```

**Obavezno:**

- **statično ProblemDetails tijelo** (§9 u `03`);
- **nikakvo odražavanje `id`-a** u odgovoru;
- **nikakav skraćeni `id`**, **nikakav prefiks**, **nikakav sufiks**;
- **nikakav namjenski field error** uveden isključivo za ovaj slučaj;
- **nijedno čitanje baze** — ni tenant-scoped, ni bilo kakvo drugo;
- **nikakav cross-tenant lookup**;
- **nikakav novi error kod** — `VALIDATION_ERROR` već postoji u stabilnom katalogu (`03` §8).

Format je **saznatljiv prije ikakvog upita nad resursom**, pa se odbijanje dešava **prije**
resource lookupa. **Nula čitanja `patient_references` reda** je mehanički zahtjev, ne stilski.

### Postojeća UUID semantika

`P5-I4A` **ponovo koristi postojeću UUID-shape semantiku repozitorija**. **Ne uvodi se:**

- ograničenje **verzije** UUID-a;
- ograničenje **varijante** UUID-a;
- `ParseUUIDPipe` kao kanonski zahtjev;
- **nikakva UUID zavisnost ni biblioteka** (`NEW_RUNTIME_DEPENDENCY_REQUIRED = NO`).

Implementacija smije **ponovo iskoristiti, eksportovati ili refaktorisati postojeći helper
isključivo ako se njegova prihvaćena semantika ne mijenja**. Promjena skupa prihvaćenih ulaza je
promjena ugovora i traži **zasebnu** odluku.

## Zaštićeni `404` par — nepromijenjen

```text
CROSS_TENANT_PATIENT_REFERENCE_GET = 404 RESOURCE_NOT_FOUND
```

| Slučaj | Ishod |
|---|---|
| **validan UUID + nepostojeća patient reference** | `404 RESOURCE_NOT_FOUND` |
| **validan UUID + patient reference druge ordinacije** | `404 RESOURCE_NOT_FOUND` |

Ta **dva slučaja validnog ID-a moraju ostati osmotrivo nerazlučiva** — identično tijelo, kod,
poruka, zaglavlja i mjerljivo ponašanje (D-072, `OD-P5-I4-13`; `08` §12.10, tačke 5–6).

**Malformisana sintaksa je IZVAN ovog zaštićenog para**, jer je greška formata saznatljiva
**prije** bilo kakvog upita nad resursom i stoga **ne otkriva ništa o postojanju ijednog reda**.
**Nikakav existence oracle se ne stvara** (`09` §18.1, `T1`).

## `OD-P5-I4A-3` — javni wire ugovor `createdAt`-a — `APPROVED`

```text
PATIENT_REFERENCE_CREATED_AT_FORMAT = UTC_ISO8601_MILLISECONDS_Z
PATIENT_REFERENCE_CREATED_AT_SERIALIZER = DATE_TO_ISO_STRING
```

Kanonski wire oblik:

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

**Obavezno:**

- **UTC**;
- **terminalno veliko `Z`**;
- **tačno tri decimalne cifre**;
- **milisekunde se čuvaju**;
- **`.000` se emituje za punu sekundu** — nikada se ne izostavlja;
- **bez `+00:00`**;
- **bez locale renderinga**;
- **bez javnog timestampa sa šest decimalnih cifara**;
- **bez izmišljenog mikrosekundnog API formata**.

Kanonski primjeri:

```text
puna sekunda    2026-07-18T10:00:00.000Z
milisekunde     2026-07-18T10:00:00.123Z
```

**Serijalizator je `.toISOString()` semantika nad `Date` vrijednošću** — iz nje deterministički
slijede i UTC, i terminalno `Z`, i tačno tri decimalne cifre.

## Pojašnjenje postojećeg primjera u `03` §11

Postojeći primjer

```text
2026-07-18T10:00:00Z
```

u `03` §11 **se NE briše i NE prepisuje**. On je **ilustrativan UTC ISO timestamp**, a **ne
bytewise zabrana decimalnih sekundi**. **Stvarni javni serijalizacijski ugovor definiše D-073**, i
izlaz implementacije koristi `.toISOString()` semantiku, pa **uvijek nosi tačno tri decimalne
cifre**. Isti instant se u kanonskom wire obliku zapisuje kao `2026-07-18T10:00:00.000Z`.

`03` §11 dobija **aditivnu** normativnu klauzulu uz postojeće primjere; **historijski tekst
ostaje netaknut**.

## Razdvajanje wire timestampa i audit hash timestampa

Postoje **dvije različite kanonske reprezentacijske površine**, i one **nisu konkurentski
formati**:

| Površina | Konstanta | Decimalne cifre |
|---|---|---|
| **javni patient-reference API `createdAt`** | `PATIENT_REFERENCE_CREATED_AT_FORMAT = UTC_ISO8601_MILLISECONDS_Z` | **tri** |
| **audit self-hash payload `occurred_at`** | `AUDIT_OCCURRED_AT_FORMAT = UTC_RFC3339_6_FRACTIONAL_DIGITS_LAST_3_ZERO` (D-072, `OD-P5-I4-4`) | **šest, posljednje tri `000`** |

- Prva upravlja **javnom API serijalizacijom** `patient_references.created_at` polja.
- Druga upravlja **perzistentnom kanonizacijom hash payloada** `audit_events.occurred_at`, koja
  mora ostati stabilna jer je `event_sha256` retroaktivno nepopravljiv.

**D-073 ne mijenja D-072 ni `09`.** **Nijedno ponašanje `P5-I4B` ni `P5-I4C` se D-073 odlukom ne
mijenja.**

## Baza naspram javne preciznosti

- `patient_references.created_at` ostaje **`timestamptz(6)`** (`02` §11);
- **D-073 ne mijenja nijedan DB tip**;
- **javna reprezentacija je milisekundne preciznosti**;
- **API ne obećava očuvanje sub-milisekundne preciznosti**;
- **nikakav custom PostgreSQL parser nije potreban**;
- **nikakva schema ni migracija se ne mijenja**;
- **nikakva zavisnost se ne uvodi**.

**D-073 upravlja isključivo wire reprezentacijom.**

## Posljedica po response DTO

Javni oblik `P5-I4A` odgovora:

```ts
interface PatientReferenceResponseDto {
  readonly id: string;
  readonly pseudonym: string;
  readonly birthYear: number | null;
  readonly sexCode: string | null;
  readonly sourceSystem: string;
  readonly createdAt: string;
}
```

`createdAt` prati D-073. **Nijedan dodatni član ne postoji.**

**Eksplicitno odsutno:**

```text
practiceId
updatedAt
eksterni identifikator
hash eksternog identifikatora
ciphertext
IV
authentication tag
enkripcijski metapodaci
```

**Ovo autorstvo ugovora NE kreira nijedan izvorni fajl.**

## Posljedica po read upit

**D-073 ne mijenja** kanonsku read semantiku `P5-I4A` koju je preflight već povratio:

- **jedan** tenant-scoped `SELECT`;
- eksplicitan `practice_id = admittedPracticeId`;
- `id = resourceId`;
- **`FORCE RLS` ostaje primarna DB granica** (`09` §4, §4.2);
- projektuje se **tačno šest javnih polja**;
- **bez `SELECT *`**;
- **bez drugog existence upita**;
- **bez cross-tenant diskriminatora**.

Izbor između sirovog SQL-a i Prisma kompozitnog selektora ostaje **implementacijski izbor**
podređen ovim kanonskim invarijantama. **Ovo nije četvrta vlasnička odluka.**

## Arhitektura `TenantDatabaseService`-a

```text
P5_I4A_SESSION_REUSE = SMALL_ADAPTER
```

Čuva se:

- postojeći **`IdentityBootstrapSession`** — **bez preimenovanja i bez generalizacije** samo zbog
  `P5-I4A`;
- `TenantDatabaseService` **ne posjeduje `PrismaService`**;
- **ne posjeduje `PrismaClient`**;
- **ne otvara transakciju**;
- **ne uspostavlja identitet**;
- **ne uspostavlja `app.practice_id`**;
- **ostaje tanak** (D-054, dio C.2; D-056, klauzula 5);
- **feature-specifično patient-reference DB ponašanje ostaje u feature adapteru**.

**Ovo nije nova vlasnička odluka** — to je implementacijska posljedica koju je prihvaćeni preflight
već povratio iz D-054 i D-056.

## Zamrzavanje scheme, sigurnosne osnove i zavisnosti

```text
PRISMA_SCHEMA_MUTATION_REQUIRED = NO
MIGRATION_REQUIRED = NO
RLS_POLICY_MUTATION_REQUIRED = NO
GRANT_MUTATION_REQUIRED = NO
NEW_RUNTIME_DEPENDENCY_REQUIRED = NO
```

`P5-I4A` **konzumira kanonsku `P5-I2` sigurnosnu osnovu nepromijenjenu**. **`09` se ovom odlukom
ne mijenja** — ove konstante se ovdje ne ponavljaju u `09`.

## Mehaničko računovodstvo checklista

```text
prije D-073                            49 / 14
poslije D-073 (mehanicki, sada)        49 / 14
PHASE5_CHECKBOX_TRANSITIONS            0
EXPECTED_POST_P5_I4_CLOSURE_CHECKLIST  49 / 31
```

**Nijedna trenutna kućica se ne mijenja**, i **nijedan checklist red se ne dodaje**. Dokazni blok
roditeljske D-056 obaveze **se još ne popunjava**.

## Posljedice

- `03` §11 dobija **aditivna** pojašnjenja: malformisan `{id}` → `400 VALIDATION_ERROR` prije
  ikakvog čitanja baze; nepromijenjen zaštićeni `404` par; egzaktan `createdAt` wire format i
  pojašnjenje postojećih primjera pune sekunde. **Broj endpointa, permisije, role, polja `GET`
  odgovora, autentifikacija, pravila `X-Practice-ID`-a, D-072 `POST` ugovor, `If-Match` i
  idempotencija se NE mijenjaju.**
- `04` §7.5a dobija ograničenu D-073 / `P5-I4A` sekciju pojašnjenja; **status `P5-I4A` ostaje
  `NOT AUTHORIZED` / `NOT STARTED`**.
- `05` §6 dobija **jednu kratku ne-checkbox** anotaciju; **`PHASE5_CHECKBOX_TRANSITIONS = 0`**.
- `08` §12.10a dobija aditivne dokazne obaveze za `OD-P5-I4A-1..3`; **nijedan test se ne piše ni
  izvršava**.
- `MANIFEST.md` se preračunava; **broj redova ostaje 19**.
- **`09` i `12` se NE mijenjaju.**

## Security/privacy uticaj

- **`HEADER_ONLY` ne slabi tenant granicu**: ista admission sekvenca, isti `TenantRequestPipeline`,
  isti `FORCE RLS`. Uklonjeno je **isključivo lažno poređenje** koje bi upoređivalo header sa samim
  sobom i tako proizvelo **lažni osjećaj provjere**.
- **Zabrana opcionog `requestedPracticeId`-a je pooštrenje**, ne olakšica: opcionalnost bi
  dozvolila tihu granu bez tenant provjere.
- **`400` na malformisan `{id}` ne otkriva postojanje** — odgovor je statičan, `id` se ne
  odražava, i **nijedan red se ne čita**.
- **Zaštićeni `404` par ostaje nerazlučiv**, pa se **existence oracle ne stvara** (`09` §18.1).
- **`createdAt` nije PHI identifikator**, a njegov wire format ne izlaže nijedno dodatno polje;
  DTO ostaje na **šest** javnih članova, bez `practiceId`-a i bez ijednog kriptografskog artefakta.
- **Produkcijski KMS se i dalje ne tvrdi**; `D-OPEN-004a` ostaje otvoren.

## Test dokaz

Obavezni dokazi su nabrojani u `08` §12.10a. **D-073 ne izvršava nijedan test** i ne tvrdi nijedan
rezultat.

## Granice ove odluke

```text
D-073 ratifikuje P5-I4A rafiniranja = YES
D-073 autorizuje P5-I4              = NO
D-073 autorizuje P5-I4A             = NO
D-073 autorizuje P5-I4B             = NO
D-073 autorizuje P5-I4C             = NO
D-073 mijenja kucice                = NO
D-073 mijenja schemu/RLS/grants     = NO
D-073 mijenja D-072 ni docs/09      = NO
D-073 instalira zavisnosti          = NO
D-073 odblokira P5-I5               = NO
D-073 autorizuje P5-I6              = NO
```

**`P5-I4A` = `CONTRACT FULLY DETERMINISTIC` / `NOT AUTHORIZED` / `NOT STARTED`.** Traži **zaseban
vlasnički autorizacijski potez** nakon što D-073 postane kanonski.

**`P5-I4B` ostaje `NOT AUTHORIZED` / `NOT STARTED`. `P5-I4C` ostaje `NOT AUTHORIZED` /
`NOT STARTED`. `P5-I5` ostaje `STILL DEPENDENCY-BLOCKED` / `NOT AUTHORIZED` / `NOT STARTED`.
`P5-I6` ostaje `NOT AUTHORIZED` / `NOT STARTED`** i **posjeduje redakciju**; red
`Services → redaction` u `05` §6 **ostaje neoznačen**. **Faza 5 ostaje `IN_PROGRESS`; nije
`DONE`.** **`★` ostaje trajna regresija.**

## Naredni obavezni gate

**Vlasnički pregled D-073 i adjudikacija dokaza**, pa zaseban publikacioni gate (push / PR /
merge).

```text
D-073 AUTHORED                      = YES
D-073 CANONICAL                     = NO      (do merge-a u origin/main)
P5-I4A IMPLEMENTATION AUTHORIZED    = NO
P5-I4A IMPLEMENTATION STARTED       = NO
OWNER_DECISIONS_REQUIRED_FOR_P5_I4A = 0
CURRENT_CHECKLIST                   = 49 / 14
```

**Dok ova governance grana ne bude merged, kanonski `origin/main` i dalje nosi pred-D-073
governance stanje.**

---

# D-074 — Vlasnička autorizacija implementacije `P5-I4A`: odluka, uslovna efektivnost i granica izvršenja

- **Status:** ACCEPTED / OWNER-RATIFIED — **LOCAL / NOT CANONICAL**
- **Datum:** 2026-08-30
- **Tip:** vlasnički ratifikovan **governance zapis autorizacije implementacije `P5-I4A`**. On
  konstatuje **jedan vlasnički potez** — odobrenje autorizacije implementacije `P5-I4A` unutar
  već kanonskog ugovora **D-072 + D-073** — i **zamrzava uslove pod kojima ta autorizacija
  postaje operativno efektivna**. **Dokumentacija isključivo.**
- **Amandman na:** **status autorizacije `P5-I4A`** utvrđen u D-072 (segmentacija `P5-I4A` →
  `P5-I4B` → `P5-I4C`) i D-073 (*Granice ove odluke*). Ugovorni, sigurnosni i API zapisi
  **D-006**, **D-018**, **D-022**, **D-025**, **D-028**, **D-029**, **D-047**, **D-054**,
  **D-055**, **D-056**, **D-060**, **D-061**, **D-062**, **D-063**, **D-064**, **D-065**,
  **D-066**, **D-067**, **D-068**, **D-069**, **D-070**, **D-071**, **D-072** i **D-073** ostaju
  **doslovno na snazi i nepromijenjeni**. **Nijedan raniji zapis se ne prepisuje**; sve promjene
  su **aditivne**. **D-072 i D-073 ostaju bajt-identični.**
- **Ova odluka NE implementira ništa.** Ne uvodi nijednu liniju izvornog koda, nijedan test,
  nijednu migraciju, schemu, Prisma model, contract TypeScript, API rutu, grant, rolu, politiku,
  izmjenu `package.json`/lockfilea ni izmjenu `.env.example`. **Nijedna baza nije kontaktirana** i
  **nijedan test se ovom odlukom ne izvršava.**
- **Ova odluka NE mijenja nijednu kućicu.** Checklist Faze 5 ostaje **`49 / 14`**, a forecast
  roditeljskog gatea `P5-I4` ostaje **`49 / 31`** (D-072). **`PHASE5_CHECKBOX_TRANSITIONS = 0`.**
- **Ova odluka NE pokreće `P5-I4A`.** **`P5-I4A IMPLEMENTATION STARTED = NO`.** Autorizacija nije
  izvršenje, a **autorstvo autorizacije nije ni autorizacija ni izvršenje**.

## Kontekst/problem — trigger

D-072 je ratifikovao implementacijski ugovor `P5-I4` i segmentaciju `P5-I4A` → `P5-I4B` →
`P5-I4C`. D-073 je zatvorio posljednje tri nedeterministične tačke ugovora `P5-I4A`
(`OD-P5-I4A-1` … `OD-P5-I4A-3`) i izričito konstatovao da **ratifikacija ugovora nije autorizacija
implementacije** te da je potreban **zaseban vlasnički autorizacijski potez**.

Nad kanonskim `origin/main`-om koji nosi D-073 izveden je **zaseban read-only preflight
autorizacije implementacije `P5-I4A`**. Njegov ishod je vlasnički adjudiciran kao:

```text
READY_FOR_OWNER_IMPLEMENTATION_AUTHORIZATION_WITH_NON_BLOCKING_NOTES
```

D-074 je **taj zaseban vlasnički potez**. On **ne bira nijednu ugovornu opciju iznova**, **ne
otvara `OD-P5-I4A-4`** i **ne mijenja nijednu klauzulu D-072 ni D-073**.

```text
OWNER_DECISIONS_REQUIRED_FOR_P5_I4A = 0
D-073 AUTORIZUJE P5-I4A             = NO
D-074 AUTORIZUJE P5-I4A             = YES (uslovno efektivno, vidi nize)
```

## Kanonska dokazna osnova

Autorizacija se izvodi **isključivo** iz sljedećih kanonskih zapisa; nijedan od njih se ovom
odlukom ne mijenja:

| Zapis | Doprinos autorizacijskoj osnovi |
|---|---|
| **D-054** | tenant orkestracija; klauzule 6–10 kao obavezan ponovni dokaz |
| **D-056** | uslovno odgađanje konkretnog `TenantDatabaseService` facadea; klauzula 5 |
| **D-062** | schema Faze 5 i vlasništvo migration paketa — **nepromijenjeni** |
| **D-069** | cross-cutting ugovori i redoslijed zavisnosti `P5-I3` → `P5-I4` → `P5-I5` |
| **D-071** | formalno zatvaranje `P5-I3`; `P5-I4` = `NEXT` / `DEPENDENCY-SATISFIED` |
| **D-072** | implementacijski ugovor `P5-I4` i segmentacija `P5-I4A/B/C` |
| **D-073** | ugovor `P5-I4A`: tenant scope, malformisan resource UUID, wire `createdAt` |

Prateća normativna površina: `03` §11, `04` §7.5a, `05` §6, `08` §12.10 i §12.10a, `09` §4, §4.2
i §18.1.

## Vlasnička odluka

```text
P5-I4A IMPLEMENTATION AUTHORIZATION = APPROVED
```

Vlasnik autorizuje implementaciju **isključivo `P5-I4A`**, i to **tačno unutar već kanonskog
ugovora D-072 + D-073**. **Nijedan drugi gate, pod-gate ni obuhvat nije autorizovan.**

## Uslovna efektivnost autorizacije

**Vlasnička odluka je donesena. Autorizacija time još nije operativno efektivna.**

D-074 razdvaja **dva različita stanja** koja se **ne smiju stapati**:

| Stanje | Značenje | Vrijednost u trenutku autorstva |
|---|---|---|
| **vlasnička odluka donesena** | vlasnik je adjudicirao preflight i odobrio autorizaciju | **YES** |
| **autorizacija operativno efektivna** | implementacija smije biti pokrenuta zasebnim gateom | **NO** |

Kanonsko pravilo:

```text
P5-I4A IMPLEMENTATION AUTHORIZATION EFFECTIVE =
ONLY AFTER D-074 IS OWNER-ACCEPTED, CANONICAL, AND PUBLICATION-VERIFIED
```

Autorizacija postaje efektivna **tek kada su ispunjena svih šest uslova, redom**:

1. **D-074 je autoriran** — ovaj zapis;
2. **nezavisno vlasnički pregledan i dokazno adjudiciran**;
3. **vlasnički prihvaćen**;
4. **objavljen / merged**;
5. **kanonski na `origin/main`**;
6. **post-publikaciona verifikacija prolazi**.

**Dok svih šest uslova nije ispunjeno:**

```text
P5-I4A IMPLEMENTATION EXECUTION = PROHIBITED
```

**Lokalni, nepublikovani commit autorstva D-074 NE čini autorizaciju efektivnom.** Postojanje ovog
teksta na governance grani **nije** dozvola za pisanje koda. **Autorstvo nije prihvatanje;
prihvatanje nije publikacija; publikacija nije izvršenje.**

Nakon što svih šest uslova bude ispunjeno, i **tek nakon što se otvori zaseban gate izvršenja
implementacije**:

```text
P5-I4A IMPLEMENTATION EXECUTION = ELIGIBLE
```

**Kanonizacija D-074 sama po sebi ne pokreće implementaciju.** Ona je **nužan, ali ne i dovoljan**
uslov; izvršenje traži **zaseban gate izvršenja**.

## Statusni model

**Prije publikacije D-074 — tekuće stanje:**

```text
OWNER DECISION                   = P5-I4A IMPLEMENTATION AUTHORIZATION APPROVED
D-074                            = OWNER-RATIFIED / LOCAL / NOT CANONICAL
P5-I4A IMPLEMENTATION EXECUTION  = BLOCKED
```

**Nakon buduće uspješne publikacije i verifikacije:**

```text
D-074                            = OWNER-RATIFIED / CANONICAL / PUBLICATION VERIFIED
P5-I4A IMPLEMENTATION            = AUTHORIZED / NOT STARTED
```

**Tek nakon zasebnog budućeg gatea izvršenja:**

```text
P5-I4A IMPLEMENTATION            = AUTHORIZED / STARTED
```

**Ova tri stanja se ne stapaju** i **ne smiju se međusobno izvoditi**.

## Autorizovan obuhvat `P5-I4A`

Autorizacija pokriva **tačno** sljedeće, i ništa izvan toga.

### Facade i sesijska granica

1. **Konkretan tanak `TenantDatabaseService` facade** koji traže D-056, D-069 i D-072.
2. **Ponovni dokaz D-054, klauzula 6–10** (D-056, klauzula 5).
3. **Obje obavezne dokazne klase facadea** (`OD-P5-I4-12`; `08` §12.10):
   - **statički import/source-boundary dokaz**;
   - **bihevioralni recording-session dokaz**.
4. **`P5_I4A_SESSION_REUSE = SMALL_ADAPTER`** — postojeći **`IdentityBootstrapSession`** ostaje
   kanonska pinovana sesijska granica, **bez preimenovanja i bez generalizacije**.

### Tenant admission

5. **Zatvorena diskriminisana unija tenant request scopea**
   (`TENANT_REQUEST_SCOPE_MODEL = CLOSED_DISCRIMINATED_UNION`).
6. **Tačno dvije varijante**: `PRACTICE_PATH` i `HEADER_ONLY`. **Treća ne postoji.**
7. **Postojeća practice-path tenant call mjesta eksplicitno koriste `PRACTICE_PATH`**, uz
   **očuvano postojeće vanjsko ponašanje**.
8. **`GET /api/v1/patient-references/{id}` koristi `HEADER_ONLY`.**
9. **Tačno jedan `TenantRequestPipeline`** (`TENANT_ADMISSION_PIPELINE_COUNT = 1`).
10. **Nikakav opcioni / `undefined`-nosivi `requestedPracticeId` šav.**
11. **Neslaganje patha i headera na postojećim practice rutama ostaje `403 ACCESS_DENIED`.**

### Validacija resource ID-a

12. **Malformisan patient-reference UUID → `400 VALIDATION_ERROR`.**
13. **Odbijanje prije ikakvog čitanja resursa iz baze**;
    **`MALFORMED_RESOURCE_UUID_DB_READS = 0`.**
14. **Statično ProblemDetails tijelo** za malformisan UUID.
15. **Nikakvo odražavanje malformisanog identifikatora** u tijelu odgovora.

### Zaštićeni `404` par i read upit

16. **Validan, nepostojeći patient reference → `404 RESOURCE_NOT_FOUND`.**
17. **Validan, cross-tenant patient reference → `404 RESOURCE_NOT_FOUND`.**
18. **Ta dva slučaja ostaju osmotrivo nerazlučiva.**
19. **Tačno jedan tenant-scoped patient-reference `SELECT`.**
20. **Eksplicitni predikati `practice_id = admittedPracticeId` i `id = resourceId`.**
21. **Bez `SELECT *`.**
22. **Bez drugog existence upita.**
23. **Bez existence-oracle pre-reada.**
24. **`FORCE RLS` ostaje primarna database granica izolacije.**
25. **Aplikacijski tenant predikat ostaje dodatna barijera**, a **ne zamjena za RLS**.

### Javni odgovor

26. **Javni patient-reference response DTO nosi tačno kanonskih šest javnih polja.**
27. **Nikakvo curenje internih/osjetljivih polja** zabranjenih odlukom D-073.
28. **Javni `createdAt` se serijalizuje u kanonskom obliku `YYYY-MM-DDTHH:mm:ss.sssZ`** kroz
    ratifikovanu `Date` → ISO semantiku.
29. **Razdvojenost javnog patient-reference timestamp formatiranja od audit timestamp/hash
    formatiranja**, koje pripada kasnijem `P5-I4` radu.

### Wiring i dokazi

30. **Contract / DTO / modul / kontroler / servis / adapter wiring strogo nužan** da `P5-I4A`
    bude izvršiv.
31. **Svi kanonski `P5-I4A` testovi i dokazne obaveze** iz D-072, D-073 i `08` §12.10 i §12.10a.

## Isključen obuhvat

**Ova autorizacija NE autorizuje** nijedan drugi gate:

```text
P5-I4B   NOT AUTHORIZED
P5-I4C   NOT AUTHORIZED
P5-I5    NOT AUTHORIZED
P5-I6    NOT AUTHORIZED
```

**Ne autorizuje** nijednu od sljedećih radnji:

- `POST /api/v1/patient-references`;
- `request_sha256`;
- JCS / RFC 8785 kanonizaciju;
- `AUDIT_EVENT_HASH_PAYLOAD_V1`;
- `event_sha256`;
- implementaciju audit self-hasha;
- implementaciju idempotency servisa;
- implementaciju audit writera;
- rad na advisory-lock konkurentnosti;
- perzistenciju HMAC-a;
- implementaciju jedinstvenosti pseudonima i retry petlje;
- implementaciju lookupa po pseudonimu;
- implementaciju lookupa po eksternoj referenci;
- izvršenje `CO-P5-I3-I4-1`;
- izvršenje `CO-P5-I3-I4-2`;
- implementaciju encountera;
- implementaciju dokumenata;
- implementaciju analize;
- implementaciju redakcije;
- nove javne lookup rute;
- nepovezan refaktoring;
- nepovezanu dokumentacionu higijenu.

**Ne autorizuje** nijednu izmjenu osnove:

- Prisma schema;
- Prisma modeli;
- migracije;
- RLS politike;
- grantovi;
- role;
- runtime zavisnosti;
- environment/konfiguracijski dodaci.

**Ne autorizuje nijedan prelazak kućice Faze 5 tokom implementacije `P5-I4A`.** Označavanje
kanonskog checklista roditeljskog gatea ostaje **odgođeno pravilima zatvaranja `P5-I4`**
(D-072; `05` §6).

## Zamrznuti mutacijski predikati

```text
PRISMA_SCHEMA_MUTATION_REQUIRED = NO
MIGRATION_REQUIRED = NO
RLS_POLICY_MUTATION_REQUIRED = NO
GRANT_MUTATION_REQUIRED = NO
NEW_RUNTIME_DEPENDENCY_REQUIRED = NO
```

`P5-I4A` **konzumira kanonsku `P5-I2` sigurnosnu osnovu nepromijenjenu**. **`09` se ovom odlukom
ne mijenja.**

## Autorizacijski firewall

```text
P5-I4B IMPLEMENTATION AUTHORIZED = NO
P5-I4C IMPLEMENTATION AUTHORIZED = NO
P5-I5  IMPLEMENTATION AUTHORIZED = NO
P5-I6  IMPLEMENTATION AUTHORIZED = NO
```

Redoslijed **`P5-I3` → `P5-I4` → `P5-I5`** (D-069, D-071) ostaje **nepromijenjen**. **`P5-I5`
ostaje `STILL DEPENDENCY-BLOCKED`**; D-074 ga **ne odblokira**. **`P5-I6` posjeduje redakciju**, i
red `Services → redaction` u `05` §6 **ostaje neoznačen**.

## Ne-blokirajuće preflight napomene

Vlasnik prihvata preporuku preflighta **uz ne-blokirajuće napomene**. Obje su **napomene
implementacijske discipline**, izvedene iz već ratifikovanog ugovora i tekuće tehničke osnove.
**Nijedna nije nova vlasnička odluka**, i **`OD-P5-I4A-4` i dalje ne postoji**.

### `M-1` — table-level `SELECT` grant nad `patient_references`

Kanonska database osnova dodjeljuje **`SELECT` na nivou tabele** nad `patient_references`
(migration paket `013`; `02` §16). Baza stoga **ne pruža kolonski `42501` backstop** protiv
slučajne over-projekcije.

Implementacija zato mora očuvati **već kanonske zahtjeve D-073**:

- **tačno šest javnih polja**;
- **eksplicitno imenovanje kolona**;
- **bez `SELECT *`**;
- **projekcija odgovora član po član**;
- **nikakvo curenje internih/osjetljivih kolona**.

Odgovarajući **strukturni, unit, e2e i sigurnosni testovi su nosivi** — oni, a ne baza, drže ovu
granicu.

**Ova napomena NE autorizuje izmjenu granta.**

```text
GRANT_MUTATION_REQUIRED = NO
```

### `M-2` — šav feature adaptera i pinovane sesije

**`IdentityBootstrapSession` ostaje kanonska pinovana sesijska granica.** `P5-I4A` smije uvesti
**isključivo** već ratifikovanu implementacijsku posljedicu:

```text
P5_I4A_SESSION_REUSE = SMALL_ADAPTER
```

Implementacija **ne smije**:

- kreirati **drugi Prisma klijent**;
- kreirati **drugi database stack**;
- izložiti **neograničeno sirovo database vlasništvo** poslovnom/aplikacijskom kodu;
- otvoriti **konkurentsku ili ugniježdenu transakciju**;
- **nezavisno uspostavljati identitet**;
- **nezavisno postavljati `app.practice_id`**;
- premjestiti **feature-specifično patient-reference ponašanje u identity port**;
- **preimenovati ili generalizovati `IdentityBootstrapSession`** samo zbog `P5-I4A`.

**Obje dokazne klase ostaju obavezne.** Ova napomena traži **implementacijsku disciplinu**, ne
vlasničko pomirenje.

## Očuvana ugovorna i sigurnosna semantika

D-074 **potvrđuje i ne mijenja**:

- **tenant, sigurnosnu i API semantiku D-073** u cijelosti;
- **nerazlučiv zaštićeni `404` par** (`08` §12.10, tačke 5–6; `09` §18.1, `T1`);
- **tačan javni šestočlani DTO**;
- **`.sssZ` javni wire format timestampa**;
- **ograničenja tankog facadea i `SMALL_ADAPTER` šava** (D-054, dio C.2; D-056, klauzula 5);
- **`FORCE RLS` kao primarnu database granicu** (`09` §4, §4.2).

## Mehaničko računovodstvo checklista

```text
prije D-074                            49 / 14
poslije D-074 (mehanicki, sada)        49 / 14
PHASE5_CHECKBOX_TRANSITIONS            0
EXPECTED_POST_P5_I4_CLOSURE_CHECKLIST  49 / 31
```

**Nijedna kućica se ne mijenja**, i **nijedan checklist red se ne dodaje**. Dokazni blok
roditeljske D-056 obaveze **se još ne popunjava**.

## Posljedice

- `03` §11 dobija **jednu aditivnu, ne-normativnu statusnu anotaciju**; **nijedan endpoint,
  permisija, rola, polje, error kod, pravilo `X-Practice-ID`-a ni ugovor odgovora se NE mijenja.**
- `04` §7.5a dobija **aditivnu D-074 statusnu sekciju**; ugovorne klauzule D-072 i D-073 se **ne
  prepisuju**.
- `05` §6 dobija **jednu kratku ne-checkbox anotaciju**; **`PHASE5_CHECKBOX_TRANSITIONS = 0`**.
- `08` §12.10a dobija **statusnu anotaciju bez ijedne nove dokazne obaveze**; **nijedan test se ne
  piše, ne mijenja ni izvršava**.
- `MANIFEST.md` se preračunava; **broj redova ostaje 19**.
- **`02`, `09` i `12` se NE mijenjaju.**

## Security/privacy uticaj

- **Autorizacija ne mijenja nijednu sigurnosnu granicu.** `FORCE RLS`, tenant admission sekvenca,
  zaštićeni `404` par i šestočlani javni DTO ostaju **nepromijenjeni**.
- **`M-1` pooštrava, a ne olakšava**: odsustvo kolonskog `42501` backstopa čini dokazne testove
  projekcije **nosivim**, i **ne otvara** prostor za izmjenu granta.
- **`M-2` pooštrava, a ne olakšava**: zabranjuje drugi database stack, ugniježdenu transakciju i
  nezavisno uspostavljanje identiteta.
- **Nikakav existence oracle se ne stvara** (`09` §18.1).
- **Produkcijski KMS se i dalje ne tvrdi**; `D-OPEN-004a` ostaje otvoren.

## Test dokaz

**D-074 ne izvršava nijedan test i ne tvrdi nijedan rezultat.** Obavezni dokazi `P5-I4A` ostaju
tačno oni nabrojani u `08` §12.10 i §12.10a; **D-074 im ne dodaje nijedan novi i nijedan ne
uklanja.**

## Granice ove odluke

```text
D-074 evidentira vlasnicku autorizaciju P5-I4A = YES
D-074 cini autorizaciju odmah efektivnom       = NO
D-074 izvrsava implementaciju                  = NO
D-074 pokrece P5-I4A                           = NO
D-074 tvrdi da je P5-I4A implementiran         = NO
D-074 tvrdi da su testovi prosli               = NO
D-074 tvrdi da je P5-I4 zavrsen                = NO
D-074 tvrdi da je Faza 5 zavrsena              = NO
D-074 tvrdi da je D-074 kanonski               = NO
D-074 tvrdi da je publikacija izvrsena         = NO
D-074 mijenja kucice                           = NO
D-074 mijenja schemu/migracije/RLS/grants      = NO
D-074 instalira zavisnosti                     = NO
D-074 mijenja D-072 ni D-073                   = NO
D-074 autorizuje P5-I4B                        = NO
D-074 autorizuje P5-I4C                        = NO
D-074 odblokira P5-I5                          = NO
D-074 autorizuje P5-I6                         = NO
```

**Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.** **`★` ostaje trajna regresija.**

## Naredni obavezni gate

**Vlasnički pregled D-074 i adjudikacija dokaza**, pa **zaseban publikacioni gate**
(push / PR / merge) i **post-publikaciona verifikacija**. **Tek nakon toga** smije se otvoriti
**zaseban gate izvršenja implementacije `P5-I4A`**.

```text
D-074 AUTHORED                                = YES
D-074 CANONICAL                               = NO      (do merge-a u origin/main)
P5-I4A IMPLEMENTATION AUTHORIZATION DECISION  = APPROVED
P5-I4A IMPLEMENTATION AUTHORIZATION EFFECTIVE = NO
P5-I4A IMPLEMENTATION STARTED                 = NO
P5-I4B IMPLEMENTATION AUTHORIZED              = NO
P5-I4C IMPLEMENTATION AUTHORIZED              = NO
P5-I5  IMPLEMENTATION AUTHORIZED              = NO
P5-I6  IMPLEMENTATION AUTHORIZED              = NO
OWNER_DECISIONS_REQUIRED_FOR_P5_I4A           = 0
CURRENT_CHECKLIST                             = 49 / 14
```

**Dok ova governance grana ne bude merged, kanonski `origin/main` i dalje nosi pred-D-074
governance stanje**, u kojem je `P5-I4A` **`NOT AUTHORIZED` / `NOT STARTED`**. **Implementacija
`P5-I4A` ne smije početi prije nego što D-074 bude vlasnički prihvaćen, kanonski i publikaciono
verifikovan.**

---

# D-075 — `P5-I4A` semantika `instance`-a u Problem Details odgovoru na malformisan `{id}`

- **Status:** ACCEPTED / OWNER-RATIFIED — **LOCAL / NOT CANONICAL**
- **Datum:** 2026-08-30
- **Tip:** vlasnički ratifikovan **governance zapis interpretativnog pomirenja**. On rješava
  **tačno jednu** ambiguitetnu tačku između kanonskog cross-cutting ugovora Problem Details-a
  (**D-008**, `03` §8, `03` §3.5) i kanonskog `P5-I4A` pravila o malformisanom identifikatoru
  (**D-073**, `03` §11, `08` §12.10a, **D-074**, klauzule 12–15). **Dokumentacija isključivo.**
- **Amandman na:** **ništa.** D-075 je **čisto aditivan interpretativni zapis**. **D-008**,
  **D-055**, **D-069**, **D-070**, **D-071**, **D-072**, **D-073** i **D-074** ostaju **doslovno
  na snazi i nepromijenjeni**; **nijedan raniji zapis se ne prepisuje**, **nijedan raniji primjer
  Problem Details tijela se ne mijenja** i **D-072, D-073 i D-074 ostaju bajt-identični**.
- **Ova odluka NE implementira ništa.** Ne uvodi nijednu liniju izvornog koda, nijedan test,
  nijednu migraciju, schemu, Prisma model, contract TypeScript, API rutu, grant, rolu, politiku,
  izmjenu `package.json`/lockfilea ni izmjenu `.env.example`. **Nijedna baza nije kontaktirana** i
  **nijedan test se ovom odlukom ne izvršava.**
- **Ova odluka NE mijenja nijednu kućicu.** Checklist Faze 5 ostaje **`49 / 14`**;
  **`PHASE5_CHECKBOX_TRANSITIONS = 0`**.
- **Ova odluka NE mijenja `ProblemDetailsFilter`** ni ijedno postojeće practice/settings error
  ponašanje. **Nijedna izmjena koda nije autorizovana odlukom D-075.**

## Kontekst/problem — trigger

Nad lokalno commitovanim, **nepublikovanim** implementacijskim kandidatom `P5-I4A`
(`1d84e2210f81ac5efbc131cb7f3f27971e8a417f`) izveden je **nezavisan vlasnički review**. Njegov
ishod je:

```text
P5_I4A_OWNER_REVIEW_HOLD_RECONCILIATION_REQUIRED
```

Review je kandidata našao **konformnim na svakoj pregledanoj `P5-I4A` osi**, uz **tačno jednu**
blokirajuću governance ambiguitetnu tačku:

> Da li kanonsko pravilo „nema odražavanja" malformisanog `{id}`-a (D-073 / `03` §11 / `08`
> §12.10a / D-074, klauzule 14–15) obuhvata i **cross-cutting** RFC 9457 član **`instance`**,
> koji **dijeljeni `ProblemDetailsFilter`** popunjava iz **request targeta**?

### Kanonska osnova ambiguiteta

Ambiguitet je **stvaran**, a ne konstruisan. Obje strane postoje u kanonskom tekstu:

| Kanonska površina | Tekst koji stvara ambiguitet |
|---|---|
| **D-008**, `03` §8 | standardno Problem Details tijelo **sadrži `instance`** (primjer: `"instance": "/api/v1/encounters"`) i `requestId` |
| `03` §3.5 | **`requestId` je obavezan korelacijski član** na svakom problem dokumentu |
| **D-073**, `03` §11 | „**statično Problem Details tijelo**"; „**`id` se ne odražava** — ni cijel, ni skraćen, ni kao prefiks ili sufiks" |
| **D-073**, `08` §12.10a, tačka 9 | „**Problem Details tijelo je nepromjenljivo i ne zavisi od ulaza**" |
| **D-073**, `08` §12.10a, tačka 10 | „**`id` se ne odražava**" |
| **D-074**, klauzule 14–15 | „**Statično ProblemDetails tijelo**"; „**Nikakvo odražavanje malformisanog identifikatora u tijelu odgovora**" |

Tehnička činjenica koja te dvije površine sudara je **postojeća, pred-`P5-I4A`** i
**cross-cutting**: jedini globalni filter

```text
apps/api/src/common/problem-details/problem-details.filter.ts
```

popunjava `instance` **uniformno za svaku rutu API-ja** vrijednošću `request.originalUrl`. Za
zahtjev

```text
GET /api/v1/patient-references/<malformisan-id>
```

`instance` stoga **nužno** sadrži malformisani segment patha — ne zato što ga endpoint upisuje,
nego zato što je to **request target koji je pozivalac sam poslao**.

### Postojeći kanonski presedan istog razlikovanja

Repozitorij **već** pravi upravo to razlikovanje, i to u kanonskim, zelenim sigurnosnim testovima
Faze 3 i Faze 4, koji **prethode** `P5-I4A`-u:

| Kanonski dokaz | Ponašanje |
|---|---|
| `apps/api/test/phase4-practice-settings-patch.security.ts` | `instance` je **namjerno isključen** iz disclosure sweepa; sweep se izvodi nad **endpoint-autorskim** članovima `title` / `detail` / `code` |
| `apps/api/test/phase4-practice-settings-read.security.ts` | `instance` je opisan kao **jedini član koji legitimno odražava practice id, jer ga je KLIJENT poslao u URL-u**; tvrdi se **zasebno**, a `detail` mora ostati generički |
| `apps/api/test/phase3-practice-read.security.ts` | `instance` i `requestId` se **izuzimaju** pri poređenju dva problem dokumenta; ostatak tijela mora biti identičan |
| `apps/api/test/phase4-practice-settings-read.security.ts` | postojeći test **„STATIC document — two failures differ only in their correlation members"** |

Drugim riječima: kanonska praksa repozitorija **već** čita „statično tijelo" kao **statičan
aplikacijski semantički sadržaj**, uz **dozvoljenu varijaciju cross-cutting request/korelacijskih
članova**. `P5-I4A` tekst tu praksu nije eksplicitno preslikao, i to je **jedina** praznina koju
D-075 zatvara.

## Vlasnička odluka

```text
MALFORMED_ID_NO_REFLECTION_EXTENDS_TO_SHARED_INSTANCE = NO
```

**Zabrana odražavanja malformisanog patient-reference identifikatora NE obuhvata postojeći
cross-cutting RFC 9457 član `instance`** kada ga **dijeljeni `ProblemDetailsFilter` popunjava
uniformno iz request targeta.**

Vlasnik dalje utvrđuje da je ovo **usko interpretativno pomirenje**, a **ne** široko popuštanje
kontrola odražavanja ulaza.

## Normativna interpretacija

Za malformisan `{id}` nad `GET /api/v1/patient-references/{id}` i ishod
**`400 VALIDATION_ERROR`**:

### Površine koje MORAJU ostati nezavisne od malformisanog identifikatora

Sljedeći **aplikacijski kontrolisani semantički** članovi Problem Details dokumenta ostaju
**statični i nezavisni od ulaza**:

1. `type` semantika;
2. `title`;
3. HTTP status;
4. stabilni error `code`;
5. `detail`;
6. `errors[]` / sadržaj field errora;
7. svaki endpoint-specifičan extension član;
8. svaki novouvedeni član odgovora.

Malformisani identifikator se **ne smije** kopirati, interpolirati, skraćivati, prefiksirati,
sufiksirati, transformisati, enkodirati **ni na koji drugi način ponavljati** u ijedan takav
endpoint-autorski semantički član. **Endpoint ne smije uvesti nikakav namjenski echo
identifikatora.**

### Površine koje NISU obuhvaćene tom zabranom

Sljedeći **postojeći cross-cutting** request/envelope metapodaci **nisu** predmet zabrane:

- **`instance`**, kada ga popunjava **jedini dijeljeni `ProblemDetailsFilter`** iz **request
  targeta**;
- **request/korelacijski metapodaci** poput **`requestId`**, već uređeni zajedničkom Problem
  Details infrastrukturom (`03` §3.5, D-008).

Za `instance` se **postojeće cross-cutting ponašanje čuva nepromijenjeno**.

### Šta ova odluka NE traži i NE autorizuje

```text
uklanjanje `instance`-a                                = NE
redakcija `instance`-a                                 = NE
endpoint-specificno prepisivanje `instance`-a          = NE
supstitucija route templatea                           = NE
izmjena globalnog ProblemDetailsFilter-a               = NE
izmjena postojeceg practice-route Problem Details-a    = NE
novi oblik greske                                      = NE
novi error kod                                         = NE
```

## Petnaest evidentiranih klauzula

1. **Ova odluka je uska.** Ona rješava **isključivo** odnos malformisanog `{id}`-a i dijeljenog
   `instance` člana na ruti `GET /api/v1/patient-references/{id}`.
2. **Ne stvara opštu dozvolu odražavanja ulaza.** Nijedna druga ruta, nijedan drugi član i
   nijedan drugi ulaz nisu ovim otvoreni.
3. **Aplikacijski kontrolisana semantička polja greške ostaju statična i nezavisna od ulaza.**
4. **`instance` ostaje cross-cutting request-target metapodatak**, u vlasništvu dijeljene Problem
   Details infrastrukture, a **ne** endpointa.
5. **`requestId` ostaje korelacijski metapodatak** (`03` §3.5) i smije varirati po zahtjevu.
6. **Nikakav namjenski field error za malformisan `{id}` nije dozvoljen** — `errors[]` ostaje
   odsutan za ovaj slučaj.
7. **Malformisani `id` se ne smije pojaviti** u `detail`-u, `title`-u, `code`-u, `errors[]`-u ni
   u ijednom extension članu.
8. **`MALFORMED_RESOURCE_UUID_DB_READS = 0` ostaje nepromijenjeno.**
9. **Zaštićeni `404` par ostaje nepromijenjen** i **nerazlučiv**.
10. **Nikakva mutacija `ProblemDetailsFilter`-a nije potrebna ni autorizovana.**
11. **Nijedno postojeće practice/settings error ponašanje se ne mijenja.**
12. **D-075 ne izvodi nikakvu mutaciju implementacije `P5-I4A`.**
13. **Postojeći implementacijski commit `1d84e221…` ostaje `NON-CANONICAL`** i traži **kasniju
    vlasničku re-adjudikaciju**.
14. **`P5-I4B`, `P5-I4C`, `P5-I5` i `P5-I6` ostaju `NOT AUTHORIZED`.**
15. **Pet zamrznutih mutacijskih predikata D-073/D-074 ostaje nepromijenjeno** (vidi ispod).

## Pomirenje terminologije „statičnog tijela"

Kanonske formulacije

```text
"staticno ProblemDetails tijelo"
"Problem Details tijelo je nepromjenljivo i ne zavisi od ulaza"
```

se za `P5-I4A` čitaju kao da se odnose na **APLIKACIJSKI KONTROLISAN SEMANTIČKI SADRŽAJ GREŠKE**,
a **ne** na cross-cutting request/korelacijske metapodatke čija je svrha **identifikacija
zahtjeva/pojave greške**.

```text
STATICAN SEMANTICKI SADRZAJ GRESKE                    = OBAVEZNO
BAJT-IDENTICAN CIJELI RFC 9457 DOKUMENT PREKO
RAZLICITIH REQUEST TARGETA / REQUEST ID-eva           = NIJE OBAVEZNO
```

**Ovo pojašnjenje važi isključivo za razrješenje ambiguiteta D-073/D-074 koji je identifikovao
nezavisni vlasnički review `P5-I4A`.** **Ne generalizuje se** ni na jednu drugu API semantiku.

## Granica sigurnosnog obrazloženja

Sigurnosno značenje pravila o malformisanom `{id}`-u ostaje **nepromijenjeno**:

1. Aplikacija **ne smije otkriti** da li malformisana vrijednost odgovara, liči na, ili bi mogla
   identifikovati ijedan pohranjeni resurs.
2. Aplikacija **ne smije izvesti existence lookup** nad `patient_references` za malformisanu
   sintaksu.
3. **`MALFORMED_RESOURCE_UUID_DB_READS = 0`** ostaje na snazi.
4. Semantički `400` odgovor **ne smije varirati** po postojanju resursa, tenant vlasništvu ni
   stanju baze.
5. **Caller-known request-target metapodatak u `instance`-u nije otkrivanje postojanja** samo
   zato što reprodukuje request target koji je **taj isti pozivalac poslao**.
6. Ova odluka **ne dopušta** odražavanje ulaza u `detail`, `title`, `code`, `errors[]`, extension
   članove ni u ijednu novu endpoint-kontrolisanu semantičku površinu.
7. **Nikakav novi cross-tenant diskriminator ni existence oracle nije dozvoljen** (`09` §18.1,
   `T1`).

## Zaštićeni `404` par — nepromijenjen

D-075 **ne mijenja** zaštićeni `404` ugovor. Za **validan** UUID:

| Slučaj | Ishod |
|---|---|
| validan UUID + **nepostojeća** patient reference | **`404 RESOURCE_NOT_FOUND`** |
| validan UUID + patient reference **druge ordinacije** | **`404 RESOURCE_NOT_FOUND`** |

Ta dva slučaja ostaju **osmotrivo nerazlučiva** pod kanonskim `P5-I4A` pravilima. Kada se za oba
uslova koristi **isti request target**, `instance` je **nužno identičan**, jer je **request target
identičan**. **Nijedan zahtjev ekvivalencije `404` para se ovom odlukom ne popušta.**

## Posljedica po implementaciju `P5-I4A`

Tekući implementacijski kandidat je:

```text
1d84e2210f81ac5efbc131cb7f3f27971e8a417f
```

Njegov status je:

```text
LOKALNO COMMITOVAN
NIJE PUSHOVAN
NIJE KANONSKI
```

Nezavisni vlasnički review našao ga je konformnim na svakoj pregledanoj `P5-I4A` osi **osim** u
neriješenoj governance interpretaciji `instance`-a.

```text
NIJEDNA IZMJENA KODA NIJE AUTORIZOVANA ODLUKOM D-075.
```

D-075 je **isključivo governance zapis pomirenja**. **Nakon** što D-075 postane kanonski,
postojeća implementacija `P5-I4A` mora proći **zasebnu re-adjudikaciju / nastavak vlasničkog
reviewa** koji utvrđuje da li je commit `1d84e221…` konforman **KAKAV JESTE**. **Prihvatanje se
ne smije tvrditi prije tog reviewa.**

## Autorizacijski firewall

```text
P5-I4A PUBLIKACIJA                = NOT AUTHORIZED
P5-I4A PRIHVATANJE                = NOT AUTHORIZED
P5-I4A AMANDMAN IMPLEMENTACIJE    = NOT AUTHORIZED
ProblemDetailsFilter IZMJENA      = NOT AUTHORIZED
P5-I4B IMPLEMENTATION AUTHORIZED  = NO
P5-I4C IMPLEMENTATION AUTHORIZED  = NO
P5-I5  IMPLEMENTATION AUTHORIZED  = NO
P5-I6  IMPLEMENTATION AUTHORIZED  = NO
```

D-075 **ne autorizuje** ni `POST /patient-references`, ni `request_sha256`, ni JCS kanonizaciju,
ni idempotency servis, ni audit writer, ni audit hashiranje, ni schema izmjene, ni migracije, ni
RLS izmjene, ni grant izmjene, ni rola izmjene, ni runtime zavisnosti, ni ijedan prelazak kućice
Faze 5.

## Zamrznuti mutacijski predikati — nepromijenjeni

```text
PRISMA_SCHEMA_MUTATION_REQUIRED = NO
MIGRATION_REQUIRED = NO
RLS_POLICY_MUTATION_REQUIRED = NO
GRANT_MUTATION_REQUIRED = NO
NEW_RUNTIME_DEPENDENCY_REQUIRED = NO
```

## Mehaničko računovodstvo checklista

```text
prije D-075                            49 / 14
poslije D-075 (mehanicki, sada)        49 / 14
PHASE5_CHECKBOX_TRANSITIONS            0
EXPECTED_POST_P5_I4_CLOSURE_CHECKLIST  49 / 31
```

**Nijedna kućica se ne mijenja**, i **nijedan checklist red se ne dodaje**. Dokazni blok
roditeljske D-056 obaveze **se još ne popunjava**.

## Posljedice

- `03` §11 dobija **jedno aditivno normativno pojašnjenje** malformisanog `{id}` slučaja;
  **nijedan endpoint, permisija, rola, polje, error kod, statusni kod ni ugovor odgovora se NE
  mijenja**, i **nijedan raniji pasus se ne prepisuje**.
- `04` §7.5a dobija **aditivno pojašnjenje** uz postojeći opis „Malformisan resource UUID", jer
  taj tekst **doslovno ponavlja** ambiguitetnu formulaciju „statično Problem Details tijelo, bez
  odražavanja `id`-a" i bez pojašnjenja bi reprodukovao istu prazninu.
- `08` §12.10a dobija **aditivno precizirane dokazne zahtjeve** za tačke 8–11; **nijedna
  postojeća dokazna obaveza se ne uklanja i nijedna se ne slabi**.
- `05` §6 se **NE mijenja**. Taj dokument **ne ponavlja** ambiguitetnu formulaciju, **nijedna
  kućica se ne mijenja**, i D-075 **ne mijenja nijedan statusni model** koji `05` vodi. Izostanak
  anotacije u `05` je **namjeran**, po pravilu **najužeg aditivnog pomirenja**.
- `03` §8 se **NE mijenja**. Opšti Problem Details ugovor **već** nosi `instance` i `requestId` i
  **nije izvor ambiguiteta**; prepisivanje te sekcije bi bilo **šire od pomirenja**.
- `MANIFEST.md` se preračunava; **broj redova ostaje 19**.
- **`02`, `09`, `12` i `15` se NE mijenjaju.**

## Security/privacy uticaj

- **Nijedna sigurnosna granica se ne mijenja.** `FORCE RLS`, tenant admission sekvenca, zaštićeni
  `404` par i šestočlani javni DTO ostaju **nepromijenjeni**.
- **Nikakav existence oracle se ne stvara** (`09` §18.1, `T1`). `instance` reprodukuje **isključivo
  request target koji je pozivalac sam poslao** i **ne nosi nijednu server-izvedenu informaciju o
  resursu** — ni postojanje, ni vlasništvo, ni stanje baze.
- **Odluka pooštrava, a ne olakšava, na semantičkoj strani**: eksplicitno nabraja **osam**
  aplikacijski kontrolisanih površina koje moraju ostati nezavisne od ulaza, uključujući **svaki
  novouvedeni član odgovora**, čime zatvara i buduće pokušaje uvođenja echo polja.
- **Nula čitanja baze prije odbijanja malformisane sintakse ostaje obavezno.**

## Test dokaz

**D-075 ne izvršava nijedan test i ne tvrdi nijedan rezultat.** Obavezni dokazi `P5-I4A` ostaju
**tačno** `08` §12.10 i §12.10a; D-075 im **ne dodaje nijednu novu obavezu** i **nijednu ne
uklanja** — on **precizira** kako se već postojeće tačke 8–11 mjere. **Nijedan test iz §12.10 ni
§12.10a nije implementiran ni izvršen ovom odlukom.**

## Granice ove odluke

```text
D-075 rjesava malformed-id / `instance` interpretaciju = YES
D-075 prosiruje zabranu odrazavanja na `instance`      = NO
D-075 dopusta odrazavanje u detail/title/code/errors   = NO
D-075 dopusta novi echo clan                           = NO
D-075 mijenja ProblemDetailsFilter                     = NO
D-075 mijenja practice/settings error ponasanje        = NO
D-075 mijenja zasticeni 404 par                        = NO
D-075 mijenja MALFORMED_RESOURCE_UUID_DB_READS         = NO
D-075 mijenja D-008 / D-072 / D-073 / D-074            = NO
D-075 mijenja kucice                                   = NO
D-075 mijenja schemu/migracije/RLS/grants              = NO
D-075 izvrsava implementaciju                          = NO
D-075 mijenja implementacijski commit 1d84e221...      = NO
D-075 prihvata implementaciju P5-I4A                   = NO
D-075 dopusta publikaciju P5-I4A                       = NO
D-075 tvrdi da je D-075 kanonski                       = NO
D-075 autorizuje P5-I4B                                = NO
D-075 autorizuje P5-I4C                                = NO
D-075 odblokira P5-I5                                  = NO
D-075 autorizuje P5-I6                                 = NO
```

**Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.** **`★` ostaje trajna regresija.**

## Naredni obavezni gate

**Vlasnički pregled D-075 i adjudikacija dokaza**, pa **zaseban publikacioni gate** (push / PR /
merge) i **post-publikaciona verifikacija**. **Tek nakon toga** smije se otvoriti **zasebna
re-adjudikacija implementacijskog kandidata `P5-I4A`** koja utvrđuje da li commit
`1d84e2210f81ac5efbc131cb7f3f27971e8a417f` **kakav jeste** zadovoljava kanonski ugovor.

```text
D-075 AUTHORED                                = YES
D-075 CANONICAL                               = NO      (do merge-a u origin/main)
D-075 OWNER RULING MADE                       = YES
P5-I4A IMPLEMENTATION CANDIDATE               = LOCAL / NOT CANONICAL
P5-I4A IMPLEMENTATION PUBLICATION             = BLOCKED
P5-I4A IMPLEMENTATION ACCEPTED                = NO
P5-I4B IMPLEMENTATION AUTHORIZED              = NO
P5-I4C IMPLEMENTATION AUTHORIZED              = NO
P5-I5  IMPLEMENTATION AUTHORIZED              = NO
P5-I6  IMPLEMENTATION AUTHORIZED              = NO
OWNER_DECISIONS_REQUIRED_FOR_P5_I4A           = 0
CURRENT_CHECKLIST                             = 49 / 14
```

**Dok ova governance grana ne bude merged, kanonski `origin/main` i dalje nosi pred-D-075
governance stanje.** **Implementacijski commit `1d84e221…` mora ostati nepushovan.**

---

# D-076 — `P5-I4A` post-merge pomirenje i formalno zatvaranje pod-gatea

- **Status:** ACCEPTED / OWNER-RATIFIED
- **Datum:** 2026-08-30
- **Tip:** vlasnički ratifikovano **činjenično pomirenje** governance dokumentacije sa **već
  kanonskom** implementacijom pod-gatea `P5-I4A`, i **formalno zatvaranje** tog pod-gatea.
  **Dokumentacija isključivo.**
- **Amandman na:** **statusne tvrdnje** — ne na ugovor. Implementacijski ugovor **D-072**, njegova
  `P5-I4A` rafinacija **D-073**, vlasnička autorizacija **D-074** i semantičko pomirenje **D-075**
  ostaju **doslovno na snazi i nepromijenjeni**. **Nijedna klauzula D-072, D-073, D-074 i D-075 se
  ne prepisuje**, i **nijedan njihov historijski zapis se ne briše.**
- **Ova odluka NE implementira ništa.** Ne uvodi nijednu liniju izvornog koda, nijedan test,
  nijednu migraciju, schemu, Prisma model, contract TypeScript, API rutu, grant, rolu, politiku ni
  izmjenu `.env.example`. **Nijedna baza nije kontaktirana** i **nijedan test se ovom odlukom ne
  izvršava.**
- **Ova odluka NE označava nijednu kućicu.** Checklist Faze 5 ostaje **`49 / 14`**;
  **`PHASE5_CHECKBOX_TRANSITIONS = 0`.**
- **Ova odluka NE autorizuje nijedan naredni gate.** `P5-I4B` postaje **podoban za zaseban
  autorizacijski preflight**, ali ostaje **`NOT AUTHORIZED`** i **`NOT STARTED`**. **Podobnost nije
  autorizacija.**

## Kontekst/problem — trigger

D-074 je evidentirao vlasničku autorizaciju implementacije **isključivo** `P5-I4A`, a D-075 je
zatvorio posljednji interpretativni ambiguitet (`instance` u Problem Details odgovoru na
malformisan `{id}`) i izričito zadržao implementacijski kandidat kao **nekanonski**, uz zahtjev za
**zasebnom re-adjudikacijom**. Vlasnik je nakon toga, **zasebnim potezima**, izveo re-adjudikaciju,
prihvatio implementaciju, objavio je kroz **PR #52** i mergeovao u kanonski `main`.

Time je nastao isti oblik **statusnog drifta** koji su D-066, D-067 i D-068 uklonili za `P5-I2B`,
`P5-I2C` i `P5-I2V`: kanonska dokumentacija na više mjesta i dalje nosi tvrdnje

```text
P5-I4A IMPLEMENTATION STARTED   = NO
P5-I4A NOT AUTHORIZED / NOT STARTED
P5-I4A IMPLEMENTATION EXECUTION = PROHIBITED
P5-I4A IMPLEMENTATION CANDIDATE = LOCAL / NOT CANONICAL
```

dok je `P5-I4A` **već kanonski na `origin/main`**. Te tvrdnje su bile **tačne na dan svog zapisa** i
**netačne kao tekući status**.

Uz to, dovršen je **nezavisni closure review** `P5-I4A`, sa ishodom

```text
P5_I4A_CLOSURE_REVIEW_READY_FOR_FORMAL_CLOSURE
```

pa ovaj zapis mora, pored uklanjanja drifta, **kanonizovati dokazni blok**, **konstatovati konačnu
dispoziciju nalaza tog reviewa** i **utvrditi status narednog pod-gatea** — bez ijedne kućice i bez
ijedne autorizacije.

**Ovaj zapis ne bira nijednu opciju.** On **konstatuje činjenice** i uklanja drift.

## Odluka

### `RULING A` — kanonski dokazni blok `P5-I4A`

**Vlasnička odluka o formalnom zatvaranju `P5-I4A` je donesena:**

```text
P5-I4A FORMAL CLOSURE OWNER DECISION = APPROVED
```

**Kanonski dokaz:**

```text
IMPLEMENTATION COMMIT:   1d84e2210f81ac5efbc131cb7f3f27971e8a417f
                         feat: implement P5-I4A patient reference read
IMPLEMENTATION TREE:     20ddb7b2eb81cfe33f932b47de2c6a25d9e0dae3
PULL REQUEST:            #52   (MERGED)
MERGE COMMIT:            1247eea20a07d547a6912ed931c72c5b310a8702
PARENT 1:                9d4854230145ccee0eab4470952a4599f66541a9
PARENT 2:                1d84e2210f81ac5efbc131cb7f3f27971e8a417f
CANONICAL TREE:          4d6bd5f6c540c2e4ba01d91f803978b61c2f27dd
REVIEWED BLOBS:          29 / 29 BYTE-IDENTICAL
IMPLEMENTATION DRIFT:    ZERO
D-075 PRESERVED:         YES
```

**Implementacija je vlasnički pregledana i re-adjudicirana prije publikacije, a pregledani commit je
merged nepromijenjen.** `1d84e221` je **`parent 2`** merge commita `1247eea2` i njegov je predak.
**Svih dvadeset devet putanja koje implementacijski commit mijenja ili uvodi nosi u kanonskom
stablu `4d6bd5f6` tačno isti blob kao u pregledanom stablu `20ddb7b2`** — mehanički provjereno blob
po blob, sa **nula** odstupanja. **Merge nije uveo nijednu izmjenu preko pregledanog stanja.**

**`D-075` je očuvan.** Razlika između pregledanog implementacijskog stabla `20ddb7b2` i kanonskog
stabla `4d6bd5f6` je **isključivo governance sadržaj `parent 1`-a** — `MANIFEST.md`, `03`, `04`,
`06` i `08` — dakle **D-075 i njegova sinhronizacija**, i **nijedan implementacijski fajl**.
Publikacija `P5-I4A` **nije poništila, oslabila ni prepisala** nijednu klauzulu D-075.

**Uslovi efektivnosti zatvaranja.** Vlasnička odluka je donesena, ali **formalno zatvaranje nije
odmah efektivno**:

```text
P5-I4A FORMAL CLOSURE OWNER DECISION MADE = YES
P5-I4A FORMAL CLOSURE EFFECTIVE           = NO   (do ispunjenja sest uslova)
```

Zatvaranje postaje efektivno **tek nakon što D-076 sam bude**:

1. **autorstvom dovršen**;
2. **nezavisno vlasnički pregledan**;
3. **vlasnički prihvaćen**;
4. **objavljen / merged**;
5. **kanonski na `origin/main`**;
6. **post-publikaciono verifikovan**.

**Do ispunjenja svih šest**, `P5-I4A` ostaje **tehnički i kanonski implementiran**, ali **zapis
formalnog zatvaranja nije kanonski**.

### `RULING B` — tekuće stanje `P5-I4A`

**`P5-I4A` = `IMPLEMENTED` / `OWNER-REVIEWED` / `OWNER-ACCEPTED` / `MERGED` / `CANONICAL` /
`PUBLICATION-VERIFIED` / `VERIFICATION PASS` / `FORMALLY CLOSED`.**

**Vlasnička autorizacija pod-gatea `P5-I4A` iz D-074 je potrošena** dovršenom kanonskom
implementacijom. Formulacije „nije autorizovan", „nije započet", „izvršenje zabranjeno",
„implementacijski kandidat je lokalan i nekanonski" i „čeka publikaciju" **više se ne smiju
koristiti kao tekući status `P5-I4A`**.

```text
P5-I4A IMPLEMENTATION                = IMPLEMENTED
P5-I4A OWNER REVIEW                  = COMPLETE
P5-I4A OWNER ACCEPTANCE              = YES
P5-I4A MERGED                        = YES
P5-I4A CANONICAL                     = YES
P5-I4A PUBLICATION VERIFIED          = YES
P5-I4A VERIFICATION                  = PASS
P5-I4A UNRESOLVED OWNER DECISIONS    = 0
P5-I4A FORMAL CLOSURE                = YES   (efektivno tek po RULING A, sest uslova)
```

**Osnov zatvaranja** je konjunkcija, ne pojedinačni dokaz:

- **D-072** — kanonsko sekvenciranje i obuhvat `P5-I4`;
- **D-073** — kanonske ugovorne rafinacije `P5-I4A`;
- **D-074** — kanonska vlasnička autorizacija implementacije;
- **D-075** — kanonsko pomirenje semantike `instance`-a;
- **implementacijski commit `1d84e221…`**;
- **vlasničko prihvatanje implementacije**;
- **publikacija kroz PR #52**;
- **merge commit `1247eea2…`**;
- **tačno očuvanje 29 / 29 blobova**;
- **nula implementacijskog drifta**;
- **kompletan verifikacijski stack** (vidi *Verifikacijski dokaz*);
- **`M-1` razriješen**, **`M-2` razriješen**;
- **nijedan blokirajući raniji nalaz**;
- **nijedna neriješena vlasnička odluka**;
- **očuvani zamrznuti mutacijski predikati**;
- **nijedna nizvodna implementacija**;
- **integritet `MANIFEST`-a i checklista**.

### `RULING C` — dispozicija ranijih nalaza

**Konačna dispozicija nalaza nezavisnog vlasničkog reviewa i closure reviewa `P5-I4A` je kanonski
zaključena.** **Nijedan nalaz se ovim zapisom ne promoviše u bloker** i **nijedan ne autorizuje
implementacijsku korekciju.**

| Nalaz | Klasa i provenijencija | Dispozicija |
|---|---|---|
| **`M-1`** | ne-blokirajuća preflight napomena **D-074** — **table-level `SELECT` grant nad `patient_references`** (migration paket `013`; `02` §16); baza **ne pruža** kolonski `42501` backstop, pa granicu drže ugovor i testovi: tačno šest javnih polja, eksplicitno imenovanje kolona, bez `SELECT *`, projekcija član po član | **`RESOLVED`** |
| **`M-2`** | ne-blokirajuća preflight napomena **D-074** — **šav feature adaptera i pinovane sesije**; `IdentityBootstrapSession` ostaje kanonska pinovana granica, `P5_I4A_SESSION_REUSE = SMALL_ADAPTER`, bez drugog Prisma klijenta, drugog database stacka, konkurentske/ugniježdene transakcije i nezavisnog identiteta | **`RESOLVED`** |
| **`L-1`** | nalaz niskog prioriteta **nezavisnog closure reviewa `P5-I4A`** | **`NON-BLOCKING / ACCEPTED AS-IS`** |
| **`L-2`** | nalaz niskog prioriteta **nezavisnog closure reviewa `P5-I4A`** | **`NON-BLOCKING / ACCEPTED AS-IS`** |
| **`I-1`** | opservacija **nezavisnog closure reviewa `P5-I4A`** | **`INFORMATIONAL / NON-BLOCKING`** |
| **`I-2`** | opservacija **nezavisnog closure reviewa `P5-I4A`** | **`INFORMATIONAL / NON-BLOCKING`** |
| **`I-3`** | opservacija **nezavisnog closure reviewa `P5-I4A`** | **`INFORMATIONAL / NON-BLOCKING`** |
| **`I-4`** | opservacija **nezavisnog closure reviewa `P5-I4A`** | **`INFORMATIONAL / NON-BLOCKING`** |
| **`F-07`** | dokazna tvrdnja **nezavisnog closure reviewa `P5-I4A`** | **`CONFORMANT_AND_NON_CIRCULAR`** |

**Provenijencija — precizno.** `M-1` i `M-2` su **kanonski zapisani u D-074** (*Ne-blokirajuće
preflight napomene*) i njihov puni tekst ostaje tamo, **nepromijenjen**; ovaj zapis im dodaje
**isključivo konačnu dispoziciju**. `L-1`, `L-2`, `I-1` … `I-4` i `F-07` su nalazi **nezavisnog
closure reviewa `P5-I4A`** izvedenog nad kanonskim `origin/main` **`1247eea2…`**; **njihova puna
sesijska analiza se ovdje namjerno ne reprodukuje** — kanonizuje se **dispozicija**, jer je
dispozicija ono što je trajno i mehanički mjerodavno. **Ovaj zapis ne tvrdi da su tijela tih nalaza
zapisana u repozitoriju**, i **ne izmišlja im sadržaj**.

```text
BLOCKING FINDINGS OPEN                = 0
IMPLEMENTATION AMENDMENT AUTHORIZED   = NO
OWNER_DECISIONS_REQUIRED_FOR_P5_I4A   = 0
```

**Nijedan nalaz iz ove tabele ne autorizuje izmjenu koda, granta, scheme, testa ni ugovora.**

### `RULING D` — mehaničko računovodstvo checklista

**Nijedna kućica se ovim zatvaranjem ne označava.**

**Kanonsko pravilo je zadržano i ponovo potvrđeno:** **pod-gate `P5-I4A` / `P5-I4B` / `P5-I4C` ne
prevodi nijedan red roditeljskog checklista `P5-I4`** (D-072, *Forecast checklista*; `05` §6,
*Sedamnaest redova u forecastu*). Sedamnaest forecast redova označava se **isključivo pri zasebnom
zatvaranju roditeljskog gatea `P5-I4`, nakon `P5-I4C`**.

```text
                        prije       poslije
ukupno redova (§6)      49          49
oznaceno                14          14
neoznaceno              35          35
notacija                49 / 14     49 / 14

PHASE5_CHECKBOX_TRANSITIONS            0
P5-I4 FORECAST ROWS UNCHECKED          17
EXPECTED_POST_P5_I4_CLOSURE_CHECKLIST  49 / 31
```

**Izričito:** iako `P5-I4A` posjeduje dokaz za redove **`API → GET patient reference`**,
**`Tests → cross-tenant GET`** i **dio devet D-056 facade obaveza**, ti redovi ostaju **`[ ]`** do
zasebnog roditeljskog zatvaranja. **Nijedan novi checklist red se ne kreira.**

### `RULING E` — status narednog pod-gatea `P5-I4B`

**`P5-I4B` = `NEXT` / `DEPENDENCY-SATISFIED` / `CONTRACT DETERMINISTIC` /
`IMPLEMENTATION AUTHORIZATION PREFLIGHT ELIGIBLE` / `NOT AUTHORIZED` / `NOT STARTED`.**

```text
P5_I4B_DEPENDENCIES_SATISFIED                          = YES
P5_I4B_CONTRACT_DETERMINISTIC                          = YES
P5_I4B_OWNER_DECISIONS_REQUIRED                        = 0
P5_I4B_IMPLEMENTATION_AUTHORIZATION_PREFLIGHT_ELIGIBLE = YES
P5_I4B_IMPLEMENTATION_AUTHORIZED                       = NO
P5_I4B_IMPLEMENTATION_STARTED                          = NO
```

**Ova podobnost postaje efektivna tek u post-D-076-kanonskom stanju** — dakle tek nakon što svih
šest uslova iz `RULING A` bude ispunjeno. Do tada je i sama podobnost **neefektivna**.

**Zavisnost je ispunjena** jer je `P5-I4A` kanonski (`RULING A`, `RULING B`), a redoslijed
`P5-I4A → P5-I4B → P5-I4C` je strogo sekvencijalan (D-072, `OD-P5-I4-13`). **Ugovor je
determinističan** jer je obuhvat `P5-I4B` **već kanonski zamrznut** i ovdje se **samo referiše, ne
proširuje i ne reinterpretira**: DB-free deterministički formati, **lokalni** RFC 8785 / JCS
kanonizator, format `request_sha256`, `AUDIT_EVENT_HASH_PAYLOAD_V1`, helper `event_sha256`,
**ponovna upotreba `P5-I3` SHA-256 helpera**, **nijedan JCS npm paket**, **nijedan database
writer**, **nijedna javna ruta**, **nijedan schema / migration / RLS / grant zahvat**. **Idempotency
servis i audit writer ostaju `P5-I4C`.**

**`P5-I4B PREFLIGHT ELIGIBLE` NE znači `P5-I4B AUTHORIZED`.** Obavezni su, redom i zasebno:
**`P5-I4B` implementacijski autorizacijski preflight**, pa **eksplicitan vlasnički autorizacijski
potez**. **D-076 ne izvodi nijedan od njih.**

### `RULING F` — autorizacijski firewall

```text
P5-I4B IMPLEMENTATION AUTHORIZED = NO
P5-I4C IMPLEMENTATION AUTHORIZED = NO
P5-I5  IMPLEMENTATION AUTHORIZED = NO
P5-I6  IMPLEMENTATION AUTHORIZED = NO
```

- **`P5-I4C` je `NOT AUTHORIZED` / `NOT STARTED`.**
- **Roditeljski `P5-I4` je `INCOMPLETE` / `OPEN`** — dva od tri pod-gatea nisu izvršena.
- **`P5-I5` je `STILL DEPENDENCY-BLOCKED` / `NOT AUTHORIZED` / `NOT STARTED`** — zavisi od
  **kompletnog** `P5-I4`, a ne od `P5-I4A`. **D-076 ga ne odblokira.**
- **`P5-I6` je `NOT AUTHORIZED` / `NOT STARTED`** i **posjeduje redakciju**; red
  `Services → redaction` **ostaje neoznačen**.
- **Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.**
- **`★` ostaje trajna regresija.**
- **D-076 ne dodjeljuje nijednu implementacijsku autorizaciju** i **sam ne implementira ništa**.

## Verifikacijski dokaz

**Kanonski verifikacijski stack `P5-I4A`, šest nivoa:**

```text
pnpm typecheck        PASS
pnpm lint             PASS
pnpm test             PASS    40 fajlova /  967 testova
pnpm test:e2e         PASS     5 fajlova /   41 test
pnpm test:integration PASS     4 fajla   /   46 testova
pnpm test:security    PASS    22 fajla   /  813 testova

AGREGAT               71 fajlova / 1867 testova / 0 padova / 0 preskoka
```

**Provenijencija dokaza — precizno razdvojena.**

- **Poruka implementacijskog commita `1d84e221…`** — kanonski Git objekat — atestira **pet
  imenovanih verifikacijskih traka** koje su tamo dostupne: `typecheck`, `test`, `test:e2e`,
  `test:integration` i `test:security`. **Ona ne sadrži `lint` i ne sadrži nijedan broj fajlova ni
  testova.** **Ovaj zapis ne tvrdi drugačije.**
- **Kompletan šestonivovski stack sa brojevima iznad reprodukovan je nezavisnim vlasničkim
  reviewom, re-adjudikacijom i post-publikacionom verifikacijom** nad kanonskim `origin/main`
  **`1247eea2…`**, i **vlasnički je ratifikovan** ovim zapisom.
- **Brojevi fajlova su nezavisno mehanički izvedeni iz kanonskog stabla `4d6bd5f6`** primjenom
  `include` obrazaca vitest konfiguracija: `src/**/*.spec.ts` = **40**,
  `test/**/*.e2e-spec.ts` = **5**, `test/**/*.integration.ts` = **4**,
  `test/**/*.security.ts` = **22**; zbir **71**.
- **D-076 je vlasnički ratifikovan kanonski zapis zatvaranja koji taj kompletan dokazni blok čini
  trajnim.**

**Nijedan test se ovom odlukom ne izvršava, ne mijenja i ne uvodi.**

## Obuhvat

D-076:

- **konstatuje** kanoničnost, publikacionu verifikovanost i formalno zatvaranje `P5-I4A`;
- **kanonizuje** dokazni blok i verifikacijski stack;
- **konstatuje** konačnu dispoziciju nalaza `M-1`, `M-2`, `L-1`, `L-2`, `I-1` … `I-4` i `F-07`;
- **pomiruje** tekuće statusne tvrdnje u `03`, `04`, `05` i `08` **aditivnim anotacijama**;
- **evidentira** podobnost `P5-I4B` za zaseban autorizacijski preflight;
- **NE mijenja** nijednu klauzulu D-072, D-073, D-074 i D-075;
- **NE briše** nijednu historijski tačnu autorizacijsku tvrdnju;
- **NE označava** nijednu kućicu checklista;
- **NE kreira** nijedan novi checklist red;
- **NE autorizuje** `P5-I4B`, `P5-I4C`, `P5-I5` ni `P5-I6`;
- **NE zatvara** roditeljski `P5-I4` ni Fazu 5;
- **NE implementira** nijednu liniju koda i **ne izvršava nijedan test**.

## Razlog

- **Potrošena autorizacija mora biti vidljiva kao potrošena.** Dokumentacija koja i dalje tvrdi
  `IMPLEMENTATION EXECUTION = PROHIBITED` nad već kanonskom rutom stvara dvije podjednako opasne
  greške: ponovno „autorizovanje" već izvršenog posla, i tretiranje kanonske tenant read granice
  kao da još ne postoji.
- **Zatvaranje pod-gatea nije zatvaranje roditelja.** `P5-I4A` je **prvi od tri** pod-gatea. D-072
  izričito zabranjuje da pod-gate prećutno apsorbuje naredni; zato formalno zatvaranje `P5-I4A`
  **mora** biti zapisano zajedno sa nepromijenjenim statusom `P5-I4B`, `P5-I4C` i `P5-I4`.
- **Dokazni blok je trajniji od sesije.** Merge SHA, oba roditelja, kanonsko stablo i `29 / 29`
  očuvanje blobova su jedini mehanički provjerljiv dokaz da su **pregledani** i **objavljeni**
  artefakt isti. Bez zapisa, taj dokaz živi samo u prolaznoj sesiji.
- **Dispozicija nalaza mora biti zaključena eksplicitno.** Nalaz bez zapisane dispozicije kasnije
  se čita ili kao neriješeni bloker ili kao tiho odbačen — oba su pogrešna.
- **Aritmetika checklista se izvodi, ne pretpostavlja.** Sedamnaest forecast redova ima
  ratifikovan antecedent — **kompletan** `P5-I4`. Označiti ih sada značilo bi prećutno tvrditi da
  su `P5-I4B` i `P5-I4C` obuhvaćeni.
- **Historijski zapis je dokaz, ne šum.** Datirane tvrdnje „`P5-I4A` nije autorizovan" i
  „izvršenje zabranjeno" su jedini trag da `P5-I4A` **nije** bio prećutno autorizovan D-072-om ni
  D-073-om. Prepisati ih značilo bi izgubiti taj dokaz.

## Alternative

- **Označiti `API → GET patient reference` i `Tests → cross-tenant GET` i objaviti `49 / 16`** —
  **odbijeno.** Antecedent tih redova je **kompletan `P5-I4`** (D-072); označavanje bi bila naduvana
  progres aritmetika i prećutna apsorpcija dva neautorizovana pod-gatea.
- **Proglasiti `P5-I4` zatvorenim jer je „read put gotov"** — **odbijeno.** Segmentacija na tri
  pod-gatea je ratifikovana upravo da bi se to spriječilo.
- **Autorizovati `P5-I4B` istim potezom, jer su zavisnost i ugovor ispunjeni** — **odbijeno.**
  Podobnost nije autorizacija; presedan `P5-I2B`, `P5-I2C`, `P5-I2V` i `P5-I3` traži **zaseban
  preflight i zaseban vlasnički potez**.
- **Prepisati D-073 / D-074 / D-075 tako da glase kao da je `P5-I4A` oduvijek bio kanonski** —
  **odbijeno.** Vidi *Razlog*, posljednja stavka; pomirenje je **aditivno**.
- **Zapisati šest verifikacijskih linija kao da su sve već stajale u tijelu implementacijskog
  commita** — **odbijeno.** Primarni Git dokaz to ne pokazuje; provenijencija je zato razdvojena
  doslovno.
- **Ne zapisivati zatvaranje i pustiti da kanoničnost implicitno „važi"** — **odbijeno.** Statusni
  drift je već ranije proizveo blokirajući `HOLD` u preflightu `P5-I2B`.

## Posljedice — dokumentaciono pomirenje

| Dokument | Zahvat |
|---|---|
| `06` | ovaj zapis D-076; **D-072, D-073, D-074 i D-075 se ne prenumerišu i ne mijenjaju** |
| `03` §11 | aditivna statusna/supersesijska anotacija — `P5-I4A` je implementiran i kanonski; ugovorna pojašnjenja D-073 i D-075 ostaju nepromijenjena |
| `04` §7.5a | aditivna sekcija formalnog zatvaranja `P5-I4A`; dokazni blok; status `P5-I4B`, `P5-I4C`, `P5-I4`, `P5-I5` i `P5-I6` |
| `05` §6 | ne-checkbox anotacija formalnog zatvaranja; **nijedna kućica se ne mijenja**; `49 / 14` ostaje `49 / 14` |
| `08` §12.10a | kanonski status dokaza `P5-I4A` i kompletan verifikacijski proof block |
| `MANIFEST.md` | ponovo izračunati bajtovi i SHA-256 za izmijenjene dokumente; **19 redova ostaje 19** |

**Nijedan drugi dokument se ne mijenja.** `00`, `01`, `02`, `07`, `09`–`15`, `README.md` i
`AGENTS.md` ostaju netaknuti, kao i sav izvorni kod, testovi, migracije, Prisma, SQL, paketi i
`.env.example`.

## Zamrznuti mutacijski predikati

**Nepromijenjeni:**

```text
PRISMA_SCHEMA_MUTATION_REQUIRED = NO
MIGRATION_REQUIRED = NO
RLS_POLICY_MUTATION_REQUIRED = NO
GRANT_MUTATION_REQUIRED = NO
NEW_RUNTIME_DEPENDENCY_REQUIRED = NO
```

**Za sam D-076:**

```text
implementation mutation = NONE
test mutation           = NONE
runtime mutation        = NONE
schema mutation         = NONE
migration               = NONE
RLS mutation            = NONE
grant mutation          = NONE
dependency mutation     = NONE
environment mutation    = NONE
```

## Šta D-076 ne mijenja

- **Ne mijenja nijedan ugovor.** D-072, D-073, D-074 i D-075 ostaju doslovno na snazi.
- **Ne mijenja nijedan endpoint, permisiju, rolu, polje, error kod ni statusni kod.**
- **Ne mijenja pravila `X-Practice-ID`-a** ni postojeće `PRACTICE_PATH` ponašanje.
- **Ne slabi zaštićeni `404` par** ni `MALFORMED_RESOURCE_UUID_DB_READS = 0`.
- **Ne slabi i ne uklanja nijednu dokaznu obavezu** iz `08` §12.10 i §12.10a.
- **Ne tvrdi da je `POST /patient-references` implementiran** — to je `P5-I4C`.
- **Ne tvrdi da su `CO-P5-I3-I4-1` i `CO-P5-I3-I4-2` ispunjeni** — oni ostaju ne-checkbox kriteriji
  prihvatanja roditeljskog `P5-I4`.
- **Ne zatvara Fazu 5** i ne mijenja njen status `IN_PROGRESS`.
- **Ne prepisuje nijedan historijski zapis.** `HISTORICAL_RECORDS_REWRITTEN = 0`.

## Security/privacy uticaj

- **Nula nove sposobnosti.** Odluka je isključivo dokumentaciona.
- **Sigurnosna površina se ne mijenja** — grantovi, politike, `FORCE RLS`, admission lanac i tenant
  predikati ostaju tačno onakvi kakvi su merged u `1247eea2`.
- **Zatečena sigurnosna korist `P5-I4A` se ovim zapisom čini vidljivom, ne uvodi:** jedan
  tenant-scoped `SELECT` sa eksplicitnim `practice_id` i `id` predikatom kao **drugom** barijerom uz
  `FORCE RLS` kao primarnom, nerazlučiv `404` par bez existence oraclea, i `400` na malformisan
  `{id}` **bez ijednog čitanja baze**.
- **`M-1` ostaje razriješen bez izmjene granta** — `GRANT_MUTATION_REQUIRED = NO`.
- **`★` ostaje tvrdi preduslov za `P5-I5`, doslovno nepromijenjen**, i **neuspjeh je i dalje
  `HARD HOLD`**.

## Test dokaz

**Testovi se ovom odlukom ne implementiraju, ne mijenjaju i ne izvršavaju.** Kanonski dokazni
vlasnici `P5-I4A` su fajlovi uvedeni implementacijskim commitom `1d84e221…` i očuvani
**bajt-identično** u kanonskom stablu `4d6bd5f6` — među njima **obje obavezne dokazne klase
facadea** (statički import/source-boundary dokaz i bihevioralni recording-session dokaz) i sigurnosni
dokaz `apps/api/test/phase5-patient-reference-read.security.ts`. Agregatni rezultat je zapisan u
*Verifikacijski dokaz* iznad, uz **razdvojenu provenijenciju**. **Dokazi `P5-I4B` (§12.11) i
`P5-I4C` (§12.12) ostaju odsutni i budući.**

## Supersedes

**Supersedira isključivo statusne tvrdnje, i to tačno četiri:**

1. **`P5-I4A IMPLEMENTATION STARTED = NO`** — kao **tekuću** tvrdnju, gdje god stoji izvan datiranog
   historijskog zapisa odluke;
2. **`P5-I4A` = `NOT AUTHORIZED` / `NOT STARTED`** — kao **tekuću** tvrdnju, iz istog razloga;
3. **`P5-I4A IMPLEMENTATION EXECUTION = PROHIBITED`** — kao **tekuću** tvrdnju;
4. **`P5-I4A IMPLEMENTATION CANDIDATE = LOCAL / NOT CANONICAL`** i
   **`P5-I4A IMPLEMENTATION PUBLICATION = BLOCKED`** (D-075, *Naredni obavezni gate*) — kao
   **tekuće** tvrdnje.

**Ne supersedira nijednu ugovornu ni sigurnosnu klauzulu.** D-072 (`OD-P5-I4-1` … `OD-P5-I4-13`),
D-073 (`OD-P5-I4A-1` … `OD-P5-I4A-3`), D-074 (autorizacija, obuhvat, `M-1`, `M-2`) i D-075 (petnaest
klauzula, `MALFORMED_ID_NO_REFLECTION_EXTENDS_TO_SHARED_INSTANCE = NO`) ostaju **na snazi bez
izmjene**.

## Zavisnosti

- **D-072** — implementacijski ugovor `P5-I4` i segmentacija na tri pod-gatea;
- **D-073** — ugovorne rafinacije `P5-I4A`;
- **D-074** — vlasnička autorizacija implementacije `P5-I4A`, `M-1` i `M-2`;
- **D-075** — semantika `instance`-a u Problem Details odgovoru na malformisan `{id}`;
- **D-066, D-067, D-068** — presedan post-merge pomirenja i formalnog zatvaranja pod-gatea;
- **D-071** — presedan formalnog zatvaranja sa razgraničenjem podobnosti i autorizacije;
- **D-054, D-056** — facade i sesijska granica, obje dokazne obaveze.

## Granice prema budućim fazama

- **`P5-I4A` je `CANONICAL` i `FORMALLY CLOSED`** — efektivno po `RULING A`, šest uslova.
- **`P5-I4B` je `NEXT` / `DEPENDENCY-SATISFIED` / `CONTRACT DETERMINISTIC` /
  `AUTHORIZATION-PREFLIGHT ELIGIBLE` / `NOT AUTHORIZED` / `NOT STARTED`.** Traži **zaseban
  autorizacijski preflight** i **zaseban vlasnički autorizacijski potez**. **Ovom odlukom nije
  autorizovan**, nijedna grana nije kreirana i nijedan izvorni fajl nije dodirnut.
- **`P5-I4C` ostaje `NOT AUTHORIZED` / `NOT STARTED`.**
- **Roditeljski `P5-I4` ostaje `INCOMPLETE` / `OPEN`**; sedamnaest forecast redova ostaje
  **neoznačeno**, a `EXPECTED_POST_P5_I4_CLOSURE_CHECKLIST` ostaje **`49 / 31`**.
- **`P5-I5` ostaje `STILL DEPENDENCY-BLOCKED` / `NOT AUTHORIZED` / `NOT STARTED`.**
- **`P5-I6` ostaje `NOT AUTHORIZED` / `NOT STARTED`** i **posjeduje redakciju**.
- **Faza 5 ostaje `IN_PROGRESS`; nije `DONE`.** Checklist je **`49 / 14`**.

## Naredni obavezni gate

**Vlasnički pregled D-076 i adjudikacija dokaza formalnog zatvaranja `P5-I4A`**, pa **zaseban
publikacioni gate** (push / PR / merge) i **post-publikaciona verifikacija**.

```text
D-076 AUTHORED                          = YES
D-076 LOCALLY COMMITTED                 = YES
D-076 PUSHED                            = NO
D-076 CANONICAL                         = NO      (do merge-a u origin/main)
P5-I4A FORMAL CLOSURE OWNER DECISION    = APPROVED
P5-I4A FORMAL CLOSURE EFFECTIVE         = NO
P5-I4B PREFLIGHT ELIGIBILITY EFFECTIVE  = NO
P5-I4B IMPLEMENTATION AUTHORIZED        = NO
P5-I4B IMPLEMENTATION STARTED           = NO
P5-I4C IMPLEMENTATION STARTED           = NO
P5-I4  PARENT COMPLETE                  = NO
P5-I5  IMPLEMENTATION AUTHORIZED        = NO
P5-I6  IMPLEMENTATION AUTHORIZED        = NO
OWNER_DECISIONS_REQUIRED_FOR_P5_I4A     = 0
CURRENT_CHECKLIST                       = 49 / 14
```

**Dok ova zatvaračka grana ne bude merged, kanonski `origin/main` i dalje nosi pred-zatvaračko
governance stanje** — `P5-I4A` kanonski implementiran, ali **bez** formalnog zapisa zatvaranja.
**Tek merge-om i post-publikacionom verifikacijom** postaje kanonsko stanje
`P5-I4A = FORMALLY CLOSED` i `P5-I4B = AUTHORIZATION-PREFLIGHT ELIGIBLE`.

**`P5-I4B` autorizacijski preflight NE SMIJE početi prije nego što D-076 bude vlasnički prihvaćen,
kanonski i post-publikaciono verifikovan.**

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
- **Anotacija tekućeg statusa (D-070, 2026-08-28):** ovo pitanje **ostaje OTVORENO** i **`DEFERRED`**. D-070, `RULING 3` (`OD-P5-I3-3`) utvrđuje **isključivo lokalni/razvojni** ugovor konfiguracije ključeva — kanonske varijable `ENCRYPTION_LOCAL_KEY`, `ENCRYPTION_KEY_VERSION` i `HMAC_LOCAL_KEY`, RFC 4648 standardni Base64 sa dekodiranih **tačno 32 bajta**, izostanak varijable `HMAC_KEY_VERSION` u Fazi 5, aktivnu generaciju označenu prefiksom `h1.` i startup guard `K_hmac != K_enc` nad **dekodiranim bajtovima** uz poređenje u konstantnom vremenu. **Nijedan produkcijski KMS provider, model pristupa ključu, rotation cadence ni recovery procedura ovim nisu odabrani ni prejudicirani.** Provenijencija ključa i **neizvedenost** `K_hmac` iz `K_enc` ostaju obaveza **secret-provisioninga i operativnog upravljanja** — startup guard dokazuje **nejednakost**, ne **nezavisnost**, i to se ne smije lažno predstaviti. **Local static key i dalje nikada nije produkcijski spreman.**
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
