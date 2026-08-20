# AGENTS.md

## Obavezna pravila za Cursor i druge AI coding agente

Ovaj fajl je ulazna tačka za svaki AI coding agent koji radi na projektu **Auditabilni Axenita TARDOC Billing Safety Copilot**.

Agent mora poštovati ovaj dokument prije bilo kakve izmjene koda, baze, infrastrukture ili dokumentacije.

---

# 1. Obavezni redoslijed prije rada

Prije svake izmjene:

1. pročitaj `README.md`;
2. pročitaj `docs/00_PROJECT_RULES.md`;
3. pročitaj relevantni dio `docs/06_DECISION_LOG.md`;
4. pročitaj dokumente vezane za traženu fazu;
5. pregledaj Git status;
6. pregledaj postojeće migracije;
7. pregledaj trenutni `schema.prisma`;
8. pregledaj postojeće testove;
9. prikaži plan prije pisanja koda.

Ne pretpostavljaj da je zadatak greenfield ako repozitorij već sadrži kod.

---

# 2. Autoritet dokumentacije

Redoslijed autoriteta:

1. `docs/00_PROJECT_RULES.md`
2. `docs/06_DECISION_LOG.md`
3. `docs/02_DATABASE_SCHEMA_V1.md`
4. `docs/03_API_CONTRACT_V1.md`
5. `docs/01_BACKEND_ARCHITECTURE_V1.md`
6. `docs/04_BACKEND_IMPLEMENTATION_PLAN_V1.md`
7. `docs/08_TEST_STRATEGY_V1.md`
8. `docs/09_SECURITY_PRIVACY_BASELINE_V1.md`
9. postojeće migracije i kod

Ako je zahtjev u suprotnosti sa višim autoritetom:

- ne izvršavaj kontradiktornu promjenu;
- jasno prijavi konflikt;
- predloži ADR/Decision Log unos;
- ne improvizuj privremeno rješenje koje slabi sigurnost.

---

# 3. Scope discipline

Implementiraj samo traženu fazu ili tačno definisan zadatak.

Zabranjeno je bez eksplicitnog zahtjeva:

- prelaziti na narednu fazu;
- raditi veliki refactoring nepovezan sa zadatkom;
- mijenjati framework;
- mijenjati ORM;
- mijenjati module format;
- uvoditi mikroservise;
- priključivati stvarni AI;
- priključivati Axenita produkcijski API;
- priključivati stvarni OAAT TarifMatcher;
- dodavati frontend funkcionalnosti;
- uvoditi Kubernetes;
- zamijeniti REST GraphQL-om;
- automatski mijenjati bazu pomoću `prisma db push`.

---

# 4. Obavezni plan prije implementacije

Prije izmjene prikaži:

1. cilj zadatka;
2. relevantne zahtjeve iz dokumentacije;
3. fajlove koji će biti kreirani;
4. fajlove koji će biti izmijenjeni;
5. migracije koje će biti kreirane;
6. endpointove koji će biti dodani ili promijenjeni;
7. testove koji će biti dodani;
8. rizike;
9. pretpostavke;
10. očekivani završni kriterij.

Ne počinji izmjenu dok plan nije logički konzistentan sa dokumentacijom.

---

# 5. Database pravila

## 5.1 Migracije

Normativna odluka za autorstvo migracija je **D-050** (`docs/02` §26.3, `docs/10` §7.1).

- Nikada ne koristi `prisma db push`.
- **`prisma migrate dev --create-only` nije kanonski mehanizam autorstva** — zahtijeva shadow bazu
  strukturno nespojivu sa namjernim guardovima migracije `001`.
- **Nikada ne oslabljuj guard migracije `001`** da bi shadow baza radila.
- Kanonski tok autorstva:
  1. ispravno bootstrapovana tekuća kanonska migration baza je izvorno stanje;
  2. `prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script -o
     prisma/migrations/<timestamp>_<package>/migration.sql`;
     repozitorijska skripta za isti korak, iz root-a:
     `pnpm db:migrate:diff -o prisma/migrations/<timestamp>_<package>/migration.sql`
     (iz `apps/api`: `pnpm run db:migrate:diff -o ...`).
     **Ne umeći `--` prije `-o`** — pnpm 11 prosljeđuje literalni separator Prismi, koja onda može
     tiho ignorisati izlaznu opciju: SQL ode na stdout, fajl se ne kreira, exit kod ostaje `0`;
  3. ručno dopuni custom SQL — constrainti, grants, revokes, RLS, politike, funkcije, asercije,
     komentari;
  4. ljudski pregled kompletnog generisanog **i** ručno napisanog SQL-a;
  5. validacija kompletnog lanca na jednokratnoj, ispravno bootstrapovanoj praznoj bazi;
  6. primjena kroz `prisma migrate deploy`;
  7. mehanička verifikacija scheme, vlasništva, privilegija i sigurnosnih objekata.
- Izlaz `migrate diff` je **kandidat, ne istina**.
- `--from-empty` nije izvor inkrementalnog autorstva; `--from-migrations` zahtijeva shadow bazu.
- Primjena u svim okruženjima ide kroz `prisma migrate deploy`.
- Nikada ne mijenjaj migraciju koja je već primijenjena na zajedničkom okruženju.
- Ne briši migration history.
- Ne izvršavaj `migrate reset` bez eksplicitnog odobrenja korisnika.
- Ne koristi produkcijsku bazu za testove.

## 5.2 Database role

- `copilot_migrator`: owner i migracije.
- `copilot_app`: runtime API, `NOBYPASSRLS`, nije owner.
- Runtime aplikacija ne smije koristiti `MIGRATION_DATABASE_URL`.
- Migracije ne smiju koristiti `DATABASE_URL` runtime korisnika.
- Testovi moraju dokazati da `copilot_app` ne može zaobići RLS.

## 5.3 Tenant isolation

- Svaka tenant tabela ima `practice_id`.
- Svaka tenant tabela ima `UNIQUE (practice_id, id)` ako je potrebna composite referenca.
- Cross-tenant relacije moraju koristiti composite foreign key.
- Sve tenant tabele imaju `ENABLE ROW LEVEL SECURITY`.
- Kritične tenant tabele imaju `FORCE ROW LEVEL SECURITY`.
- Pod `FORCE ROW LEVEL SECURITY` i vlasnik tabele podliježe politikama. Pouzdani seed/migration DML
  ide **isključivo** kroz maintenance protokol iz `docs/02` §23.4 (D-048): jedna eksplicitna
  transakcija, `NO FORCE` → asercija → DML → `FORCE` → asercija → `COMMIT`.
- Zabranjeno: `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`, `BYPASSRLS`, `SECURITY DEFINER`,
  superuser seed credential, trajna `copilot_migrator` RLS politika.
- Write grant i RLS politika koja ga ograničava uvode se **zajedno**, u istom migration paketu.
- Tenant business servis ne pristupa direktno globalnom PrismaServiceu.
- Tenant zahtjev se izvršava u **jednoj** autentifikovanoj interaktivnoj transakciji, na **jednoj**
  pinovanoj sesiji. RLS request context se postavlja pozivom `set_request_context(p_practice_id
  uuid)` **unutar te iste** transakcije, i **tek nakon** koraka 1–4 iz `03` §3.7.1 (D-047,
  klauzula 10).
- `TenantDatabaseService` ostaje **kanonski facade koncept** za tenant business module. Historijski
  zapis `TenantDatabaseService.run(practiceId, userId, callback)` opisuje **obavezno svojstvo**, ne
  obavezan potpis (D-054, klauzule 5–10). Svaka konkretna implementacija mora biti **tanak facade**
  nad postojećom transakcijom/sesijom i tenant request pipelineom, i mora: koristiti postojeću
  pinovanu transakciju; **ne** posjedovati vlastiti `PrismaClient`; **ne** otvarati drugu,
  ugniježdenu ni paralelnu transakciju; **ne** postavljati `app.practice_id` prije kanonskih
  provjera statusa ordinacije i aktivnog membershipa; i **nikada** ne tretirati caller-supplied
  `userId` kao granicu povjerenja — identitet dolazi isključivo iz autentifikovanog
  admission/session stanja.
- **Konkretan `TenantDatabaseService` facade je uslovno odgođen (D-056, dio A).** Konkretna klasa
  **nije** deliverable zatvaranja faze 4; uvodi se **tek kada stvarni tenant business modul zatraži
  tu apstrakciju**, a ne dolaskom bilo kojeg broja faze. Do tada tenant database granicu nosi
  postojeći `TenantRequestPipeline` unutar jedne pinovane interaktivne transakcije, i **svi
  sigurnosni invarijanti iz prethodne dvije stavke važe nepromijenjeno**. Uvođenje dummy klase ili
  stuba **nije ovlašteno**; svaki budući konkretan facade mora **ponovo dokazati D-054, klauzule
  6–10** prije prihvatanja.
- `PracticeContextGuard` je **naziv faze** tenant admisije i uspostave konteksta, ne obavezno
  NestJS `Guard`. **Zabranjen je** `CanActivate` koji bi validirao tenant kontekst **prije**
  admisije autentifikovanog korisnika (D-054, klauzule 2–4).
- Ovo nije preporuka. Tenant business modul koji zaobiđe ovaj put **obara gate**.
- Bez request contexta pristup tenant podacima mora biti default-deny.

## 5.4 Immutability

Nakon završetka ili odobrenja ne mijenjati:

- analysis input snapshot;
- AI raw response reference;
- tariff evaluation request/response;
- tariff evaluation items;
- review decision history;
- approval payload;
- audit events.

Korekcija stvara novu reviziju ili novi event, ne overwrite historije.

---

# 6. API pravila

- Base prefix: `/api/v1`.
- REST resursi koriste plural imenice.
- Svaki tenant endpoint zahtijeva `Authorization` i `X-Practice-ID`.
- Svaki request dobija `X-Request-ID`.
- Command POST endpointi zahtijevaju `Idempotency-Key`.
- PATCH zahtjevi nad mutable resursima koriste `If-Match`.
- Response vraća `ETag`.
- Greške koriste `application/problem+json`.
- DTO validacija koristi whitelist i `forbidNonWhitelisted`.
- Ne vraćaj Prisma modele direktno iz controllera.
- Koristi response DTO ili mapper.
- Ne izlaži raw stack trace, SQL, secrets ili interne URL-ove.
- Ne izlaži Tariff Engine direktno browseru.
- Frontend ne odlučuje approval readiness.
- Export koristi samo odobreni snapshot.

---

# 7. Asinhroni procesi

- AI, tarifna evaluacija, PDF i export ne rade u HTTP requestu.
- HTTP request kreira DB stanje i outbox event.
- Outbox publisher šalje job u BullMQ.
- Job payload sadrži samo tehničke ID-eve i request ID.
- Ne stavljaj medicinski tekst u Redis.
- Processor mora biti idempotentan.
- Retry mora nastaviti od posljednjeg sigurnog koraka.
- Unique constraints moraju sprečavati duplikate.
- Failed job mora ostaviti jasan poslovni status u PostgreSQL-u.

---

# 8. Privatnost i logovi

Nikada ne loguj:

- ime i prezime pacijenta;
- adresu;
- telefon;
- e-mail;
- AHV;
- broj osiguranja;
- čisti Axenita patient/encounter ID;
- kompletan medicinski tekst;
- AI prompt sa medicinskim tekstom;
- JWT;
- API ključ;
- database connection string;
- enkripcijski ključ.

Dozvoljeni log atributi:

- request ID;
- practice ID, samo tehnički UUID;
- user ID, samo tehnički UUID;
- encounter ID;
- analysis ID;
- job ID;
- status;
- trajanje;
- kontrolisani error code;
- dependency name.

---

# 9. Code quality

- TypeScript strict mode mora ostati uključen.
- Ne koristiti `any` bez jasnog komentara i opravdanja.
- Ne koristiti non-null assertion kada se vrijednost može validirati.
- Dependency injection umjesto globalnih singletona.
- Controller je tanak.
- Business logika je u service/domain sloju.
- Prisma query logika ide u repository ili strogo definisan service.
- State transition logika je centralizovana.
- External provider integracije koriste interfej/adapter.
- Vrijednosti novca i količina ne obrađivati kao binary floating point.
- Ne duplicirati permission stringove.
- Ne hardkodirati tarifne kodove u controllerima.

---

# 10. Testovi

Za svaki zadatak dodaj relevantne testove.

Obavezno za database promjene:

- migracija na praznoj test bazi;
- Prisma validate;
- RLS test;
- cross-tenant test;
- constraint test;
- runtime-role test.

Obavezno za API promjene:

- happy path;
- validation error;
- authentication;
- authorization;
- tenant isolation;
- idempotency ili optimistic locking, kada je relevantno;
- audit event;
- state transition.

Test ne smije biti uklonjen ili oslabljen samo da bi build prošao.

Ako test ne prolazi:

- ne označavaj zadatak završenim;
- prijavi tačan test i grešku;
- popravi uzrok ili jasno ostavi blocker.

---

# 11. Završni izvještaj nakon svake faze

Na kraju prikaži:

## Rezultat

- šta je završeno;
- šta nije završeno;
- da li scope odstupa od plana.

## Fajlovi

- kreirani fajlovi;
- izmijenjeni fajlovi;
- obrisani fajlovi, ako ih je bilo.

## Baza

- naziv nove migracije;
- tabele;
- indeksi;
- constrainti;
- RLS policy;
- grants/revokes.

## API

- endpointi;
- request/response DTO;
- status kodovi;
- permissions.

## Provjere

Navedi komandu i rezultat za:

- format;
- lint;
- typecheck;
- Prisma validate;
- migration;
- unit tests;
- integration tests;
- e2e tests;
- RLS tests;
- build.

## Otvoreni problemi

- blocker;
- rizik;
- odgođeni zadatak;
- nova odluka.

## Dokumentacija

- ažuriran `docs/05_IMPLEMENTATION_CHECKLIST.md`;
- ažuriran `docs/06_DECISION_LOG.md` samo ako je donesena odluka.

Zaustavi se nakon izvještaja. Ne započinji narednu fazu.

---

# 12. Zabranjene komande bez eksplicitne dozvole

```text
prisma db push
prisma migrate reset
DROP DATABASE
DROP SCHEMA public CASCADE
TRUNCATE ... CASCADE
git reset --hard
git clean -fd
git push --force
docker compose down -v
```

Dodatno, **`prisma migrate dev --create-only` se ne koristi kao mehanizam autorstva migracija**
(D-050, §5.1). Nije na listi iznad jer ne uništava podatke, nego zato što zahtijeva shadow bazu
nespojivu sa guardovima migracije `001`; kanonski tok je `migrate diff` → ručna dopuna → pregled →
validacija na praznoj bazi → `migrate deploy`.

Ako je neka od komandi iz liste iznad stvarno potrebna u lokalnom developmentu, prvo objasni:

- zašto;
- koji podaci se gube;
- postoji li sigurnija alternativa;
- tačnu bazu/volume na koju se odnosi.

---

# 13. Stop uslovi

Odmah se zaustavi i prijavi problem ako:

- dokumentacija je kontradiktorna;
- nije jasno je li migracija već primijenjena;
- Git working tree sadrži nepoznate promjene koje bi bile prepisane;
- test baza nije jasno odvojena;
- runtime koristi migrator credentials;
- RLS test ne prolazi;
- osjetljivi podatak bi završio u logu ili Redis jobu;
- produkcijski external API ugovor nije dostupan;
- zadatak zahtijeva pravnu ili tarifnu odluku koja nije dokumentovana.

Ne zaustavljaj se zbog običnog implementacijskog problema koji se može riješiti pregledom koda i testovima.
