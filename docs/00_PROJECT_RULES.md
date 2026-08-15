# 00 — Project Rules

**Projekt:** Auditabilni Axenita TARDOC Billing Safety Copilot  
**Dokument:** Obavezna projektna pravila  
**Verzija:** 1.0  
**Status:** AUTHORITATIVE  
**Primjena:** Backend MVP i sve naredne backend faze

---

# 1. Svrha dokumenta

Ovaj dokument definiše pravila koja imaju najveći autoritet u projektu. Njegov cilj je spriječiti:

- arhitektonski drift;
- preskakanje sigurnosnih koraka;
- nekontrolisane database izmjene;
- cross-tenant curenje podataka;
- gubitak auditabilnosti;
- spajanje eksperimentalnog AI izlaza sa konačnim billing rezultatom;
- automatski export neodobrenih podataka;
- zavisnost core domena od nedokumentovanog Axenita API-ja;
- tehnički dug nastao pokušajem implementacije cijelog sistema odjednom.

Ako kod ili niži dokument odstupa od ovih pravila, kod ili niži dokument mora biti ispravljen ili odstupanje mora biti eksplicitno odobreno kroz Decision Log.

---

# 2. Osnovni principi proizvoda

## 2.1 Copilot, ne autoritet

Sistem je pomoćni alat. On:

- predlaže;
- provjerava;
- objašnjava;
- označava nedostajuće podatke;
- čuva trag;
- priprema draft.

Sistem ne:

- donosi konačnu kliničku odluku;
- automatski potvrđuje tarifnu ispravnost bez ljudskog pregleda;
- šalje konačan račun u MVP-u;
- zamjenjuje službeni OAAT tarifni engine;
- proizvodi pozicije isključivo na osnovu generativnog AI modela.

## 2.2 Deterministički rezultat ima prednost

Redoslijed autoriteta unutar analize:

1. službeni tarifni engine i njegove verzionisane poruke;
2. deterministička safety pravila;
3. strukturirane činjenice koje je korisnik potvrdio;
4. AI ekstrakcija kao prijedlog;
5. ručni unos, uz identitet korisnika i razlog.

AI confidence nije isto što i tarifna validnost.

## 2.3 Ljudsko odobrenje je obavezno

Prije exporta mora postojati:

- završena analysis revision;
- validna tarifna evaluacija;
- riješeni blocking findings;
- immutable approval snapshot;
- identitet korisnika;
- timestamp;
- payload hash.

## 2.4 Reproduktivnost

Za svaki rezultat mora biti moguće odgovoriti:

- koji je input korišten;
- koji su dokumenti korišteni;
- koji hash je imao input;
- koji AI provider, model i prompt verzija su korišteni;
- koja tarifna verzija je korištena;
- koji TarifMatcher/CaseMaster/Grouper/Mapper build je korišten;
- koja safety rule verzija je korištena;
- šta je korisnik promijenio;
- ko je odobrio;
- šta je tačno izvezeno.

---

# 3. Zaključana arhitektura za MVP

MVP je modularni monolit sa jednim glavnim NestJS backendom.

```text
Next.js frontend
        │
        ▼
NestJS REST API
        ├── PostgreSQL
        ├── Redis/BullMQ
        ├── S3/MinIO
        ├── AI provider adapter
        ├── Tarif Engine HTTP client
        └── Practice System adapter
                  │
                  ▼
        Java Tarif Engine wrapper
```

Dozvoljeni odvojeni procesi:

- API proces;
- worker proces, kada se izdvoji iz iste codebase;
- Java tarifni servis;
- PostgreSQL;
- Redis;
- object storage.

Nije dozvoljeno prije stvarne potrebe:

- mikroservis po modulu;
- event streaming platforma;
- Kubernetes;
- service mesh;
- više baza po modulu;
- CQRS framework;
- GraphQL;
- vlastiti TARDOC engine.

---

# 4. Tehnološka pravila

## 4.1 Backend

- NestJS 11.
- TypeScript strict mode.
- pnpm workspace.
- Node.js LTS, zaključan u `.nvmrc`/`.node-version` i `package.json engines`.
- ESM ili CommonJS mora biti jedna dokumentovana odluka za cijeli backend.
- Ne miješati module sisteme.

## 4.2 Baza

- PostgreSQL 16 major verzija za MVP.
- Najnoviji provjereni security/patch release unutar major verzije.
- Prisma ORM 7 za modele, tipove i migration workflow.
- Custom SQL je obavezan za RLS, grants, triggers, composite constraints i funkcije koje Prisma ne izražava adekvatno.
- PostgreSQL je poslovni source of truth.

## 4.3 Queue

- Redis 7.
- BullMQ.
- Redis nije trajni poslovni source of truth.
- Poslovni status svakog posla postoji u PostgreSQL-u.

## 4.4 Object storage

- S3-compatible API.
- Lokalno MinIO.
- Produkcijski provider mora biti odobren security/privacy procesom.
- Baza čuva metadata i reference, ne velike fajlove.

## 4.5 Tarifni servis

- Java 21 LTS.
- Spring Boot wrapper ili ekvivalentan minimalni HTTP servis.
- Browser ga ne poziva direktno.
- Core backend komunicira kroz stabilni interni contract.
- Dok službeni paket nije dostupan koristi se mock.

---

# 5. Repository i dependency pravila

## 5.1 Monorepo

```text
apps/api
services/tariff-engine-java
packages/contracts
infra
docs
scripts
```

## 5.2 Dependency smjer

Dozvoljeno:

```text
controller → application service → domain/repository → database/external adapter
```

Zabranjeno:

```text
repository → controller
domain → Nest HTTP request
domain → Prisma generated type kao javni API model
frontend → database
frontend → Tariff Engine
AI provider → direktan database write
```

## 5.3 Package discipline

- Ne instalirati biblioteku ako standardni Node/Nest API rješava problem jednostavno i sigurno.
- Novi package mora imati jasnu svrhu.
- Major upgrade zahtijeva Decision Log.
- Lockfile se obavezno commitova.
- Ne koristiti `latest` tag u production imageu.
- Container image mora biti major/minor/patch ili digest zaključan u release pipelineu.

---

# 6. Database pravila

## 6.1 Uloge

### `copilot_migrator`

- owner schema objekata;
- pokreće migracije;
- kreira funkcije, policyje, triggere;
- nije runtime API korisnik.

### `copilot_app`

- runtime API;
- login role;
- `NOSUPERUSER`;
- `NOCREATEDB`;
- `NOCREATEROLE`;
- `NOBYPASSRLS`;
- nije owner tabela;
- dobija samo minimalna prava.

### Opcionalno kasnije

- `copilot_worker`;
- `copilot_auditor`;
- `copilot_backup`.

Nove role se uvode samo kroz Decision Log.

## 6.2 Migracije

- Svaka schema promjena je migracija.
- **Autorstvo migracije prati kanonski tok iz D-050** (`02` §26.3, `10` §7.1): `prisma migrate
  diff` kao kandidat → ručna dopuna custom SQL-a → ljudski pregled → validacija na jednokratnoj
  praznoj bazi → primjena.
- `prisma migrate dev --create-only` **nije** kanonski mehanizam autorstva; njegova shadow baza je
  strukturno nespojiva sa guardovima migracije `001`.
- **Nijedan guard migracije `001` se ne smije oslabiti** radi Prisma shadow baze.
- Development, staging i production primjenjuju kroz `migrate deploy`.
- `db push` je zabranjen.
- Primijenjena migracija se ne mijenja.
- Custom SQL se ručno dopunjuje u `migration.sql` fajlu paketa.
- Svaka migracija mora imati test na praznoj bazi.
- Destruktivna migracija mora imati poseban rollout plan.
- Rename se radi expand/migrate/contract pristupom.

## 6.3 Tenant kolona

Svaka tenant tabela sadrži:

```sql
practice_id uuid not null
```

U pravilu sadrži i:

```sql
unique (practice_id, id)
```

## 6.4 Composite foreign key

Veza između tenant tabela mora vezati i tenant:

```sql
foreign key (practice_id, encounter_id)
references encounters(practice_id, id)
```

Samo `foreign key (encounter_id) references encounters(id)` nije dovoljno.

## 6.5 RLS

Sve tenant tabele:

```sql
enable row level security
```

Kritične tabele:

```sql
force row level security
```

Pod `force row level security` i **vlasnik tabele** podliježe politikama, pa pouzdani seed/migration
DML ide isključivo kroz maintenance protokol iz `02` §23.4 (D-048): jedna eksplicitna transakcija,
`no force` → asercija → DML → `force` → asercija → `commit`. **`disable row level security`,
`BYPASSRLS`, `SECURITY DEFINER` i superuser seed credential su zabranjeni.**

Bez postavljenog contexta politika je default-deny.

Tenant context se postavlja kroz kontrolisanu funkciju koja validira membership.

## 6.6 Transakcijski context

RLS context i query moraju biti na istoj connection sesiji. Zbog poolinga se koriste Prisma interactive transakcije.

Zabranjen obrazac:

```ts
await prisma.$executeRaw`select set_config(...)`;
return prisma.encounter.findMany();
```

Obavezan obrazac:

```ts
return prisma.$transaction(async (tx) => {
  await tx.$executeRaw`select app_security.set_request_context(...)`;
  return tx.encounter.findMany();
});
```

## 6.7 Delete politika

Normalni poslovni tok ne koristi fizički delete za:

- encounter;
- dokument nakon analize;
- analysis;
- tariff evaluation;
- finding historiju;
- review;
- approval;
- export;
- audit.

Koristi se status, archive ili retention workflow.

## 6.8 Numeric vrijednosti

- CHF: `numeric(14,2)`.
- Količine: `numeric(12,4)`.
- Points: `numeric(14,4)`.
- Ne koristiti `real`, `double precision` ili JavaScript floating-point za finalne obračunske vrijednosti.

## 6.9 Hash

SHA-256 se čuva za:

- source dokument;
- redacted tekst;
- analysis input;
- AI request/response reference;
- Tarif Engine request/response;
- approval payload;
- import/export artefakt;
- audit integrity event.

---

# 7. Domain pravila

## 7.1 Patient reference

Copilot nije patient master.

Dozvoljeno je čuvati:

- interni UUID;
- pseudonim;
- HMAC/hash eksternog ID-a;
- enkriptovani eksterni ID kada je nužan za write-back;
- birth year ili age at encounter;
- sex code kada je tarifno potreban.

Ne kopirati kompletan demografski profil bez opravdane svrhe.

## 7.2 Encounter

Encounter predstavlja jedan obračunski/medicinski kontakt.

Mora imati:

- practice;
- patient reference;
- datum/vrijeme;
- treatment date;
- source system;
- status;
- version za optimistic locking.

## 7.3 Analysis

Jedan `analysis_run` je jedna immutable revizija.

Korekcija koja mijenja tarifni rezultat stvara novu reviziju.

Dozvoljeno je označiti staru reviziju kao `SUPERSEDED`, ali ne mijenjati historijski rezultat.

## 7.4 Findings

Finding mora imati:

- kod;
- severity;
- status;
- source/rule version;
- objašnjenje;
- preporučenu akciju;
- dokaz;
- resolution identitet i razlog.

## 7.5 Approval

Approval je zaseban immutable zapis. Ne svodi se samo na `analysis.status = APPROVED`.

## 7.6 Export

Export job referencira approval hash. Ako approval bude opozvan, novi export se ne može pokrenuti.

---

# 8. API pravila

## 8.1 Versioning

- URI versioning.
- Prefix `/api/v1`.
- Breaking promjena zahtijeva `/api/v2` ili kompatibilnu tranziciju.

## 8.2 Headeri

Obavezni prema kontekstu:

```http
Authorization: Bearer ...
X-Practice-ID: uuid
X-Request-ID: uuid
Idempotency-Key: string
If-Match: "version"
Accept-Language: de-CH
```

## 8.3 Errors

Svi error response objekti koriste Problem Details:

```json
{
  "type": "https://api.example.ch/problems/version-conflict",
  "title": "Version conflict",
  "status": 409,
  "code": "VERSION_CONFLICT",
  "detail": "Resource was modified by another user.",
  "instance": "/api/v1/encounters/...",
  "requestId": "..."
}
```

## 8.4 Validation

Globalni validation pipe:

- whitelist;
- forbid non-whitelisted;
- transform uz eksplicitne DTO tipove;
- nema implicitnog pretvaranja sigurnosno osjetljivih vrijednosti.

## 8.5 Idempotency

Obavezno za komande koje kreiraju poslovne posljedice:

- create encounter;
- create analysis;
- create revision;
- approve/reject decision;
- create export;
- retry export;
- import webhook processing.

## 8.6 Optimistic locking

Mutable resursi imaju `version`. PATCH zahtjev bez odgovarajućeg `If-Match` se odbija.

---

# 9. AI pravila

- AI je provider-neutralan adapter.
- Prva implementacija je mock.
- AI output mora proći JSON schema validaciju.
- Nevalidan output se ne koristi djelimično.
- AI ne smije direktno pisati u finalne tariff items.
- AI candidate uvijek ima origin, confidence i evidence.
- Confidence se prikazuje odvojeno od rule/tariff statusa.
- Prompt verzija je immutable.
- Direct identifiers se uklanjaju prije poziva.
- Raw request/response se čuva samo u kontrolisanom enkriptovanom storageu, ako je retention opravdan.

---

# 10. Tariff Engine pravila

- Ne implementirati TARDOC logiku od nule.
- External/service response se čuva raw i normalizovan.
- Sve verzije engine komponenti se čuvaju.
- Timeout i retry politika je eksplicitna.
- 4xx business/validation odgovor se ne retrya automatski.
- Network/5xx može imati ograničen retry sa backoffom.
- Response schema se validira.
- Nepoznata response struktura označava evaluaciju kao failed, ne silently ignored.

---

# 11. Queue i outbox pravila

- DB commit i queue enqueue ne smiju biti nekonzistentni.
- Kreiranje posla zapisuje `outbox_events` u istoj transakciji.
- Publisher koristi `FOR UPDATE SKIP LOCKED`.
- Publisher označava `published_at` tek nakon uspješnog enqueuea.
- Job ID je deterministički kada je moguće.
- Processor je idempotentan.
- Svaki pipeline korak provjerava postojeći završeni zapis.
- Max attempts i backoff su definisani po job tipu.
- Dead/failed job ostaje vidljiv u PostgreSQL-u.

---

# 12. Security i privacy pravila

- Data minimization.
- Privacy by design.
- Encryption in transit.
- Encryption at rest.
- Application-level encryption za posebno osjetljiv sadržaj gdje je definisano.
- MFA za produkcijske korisnike.
- RBAC/permissions.
- Audit čitanja osjetljivih dokumenata.
- Secrets manager u produkciji.
- Zabranjeni PHI/PII u logovima.
- Backup enkriptovan.
- Restore test periodičan.
- Retention politika dokumentovana.
- Produkcijski hosting i podobrađivači moraju biti odobreni prije pilota.

---

# 13. Test pravila

Nijedna faza nije završena samo zato što se aplikacija kompajlira.

Obavezni slojevi:

- unit;
- repository/integration;
- migration;
- RLS;
- API e2e;
- queue idempotency;
- contract;
- security regression;
- tariff baseline, kada stvarni engine bude dostupan.

Kritične funkcije moraju imati negative test:

- cross-tenant pristup;
- approval sa blockerom;
- export bez approvala;
- duplicate idempotency;
- stale `If-Match`;
- missing context;
- runtime attempt to update audit.

---

# 14. Git i fazni rad

- Jedna faza, jedan branch.
- Jedan jasan commit po završnoj funkcionalnoj cjelini.
- Ne miješati nepovezane refactore.
- Ne koristiti force push bez eksplicitne odluke.
- Checklist se ažurira u istom commitu.
- Decision Log se ažurira samo kada se stvarno donese odluka.
- Ne označavati checkbox završenim bez evidence komande/testa.

---

# 15. Produkcijski stop uslovi

Produkcijski pilot se ne pokreće dok nisu zatvoreni:

- Axenita API/partnerstvo;
- OAAT licenca i distribucija paketa;
- produkcijski OIDC provider;
- hosting lokacija;
- KMS/secrets;
- DPIA/pravna provjera;
- incident response;
- backup/restore;
- monitoring;
- penetration/security pregled;
- data retention;
- ugovori sa podobrađivačima.

---

# 16. Promjena ovih pravila

Promjena zahtijeva:

1. novi zapis u `docs/06_DECISION_LOG.md`;
2. razlog;
3. alternative;
4. posljedice;
5. migration/rollout plan kada je primjenjivo;
6. odobrenje project ownera.

Silentna promjena ovog dokumenta nije dozvoljena.
