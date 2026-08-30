# 03 — API Contract v1

**Projekt:** Auditabilni Axenita TARDOC Billing Safety Copilot  
**Stil:** REST  
**Base path:** `/api/v1`  
**Contract format:** OpenAPI 3.1  
**Verzija:** 1.0  
**Status:** IMPLEMENTATION BASELINE

---

# 1. Opšti principi

API v1 mora biti:

- eksplicitno verzionisan;
- tenant-aware;
- idempotentan za command operacije;
- optimistically locked za mutable resurse;
- auditabilan;
- bez direktnog izlaganja Prisma modela;
- bez osjetljivih detalja u greškama;
- pogodan za generisani TypeScript frontend client.

---

# 2. Base URL i content type

Primjer:

```text
https://api.example.ch/api/v1
```

Request/response:

```http
Accept: application/json
Content-Type: application/json
```

Greške:

```http
Content-Type: application/problem+json
```

Upload preko presigned URL-a ili multipart endpointa pripada **DEFERRED** upload putanji
(§13.2). U aktivnom v1 dokumenti se kreiraju isključivo kao tekst (§13.1).

---

# 3. Autentifikacija i context

## 3.1 Bearer token

```http
Authorization: Bearer <JWT>
```

Normativna odluka: **D-033**.

Redoslijed je obavezan. Prije nego što se pozove bilo koja database context funkcija,
verifikuje se:

- signature;
- issuer;
- audience;
- expiration;
- subject.

Tek nakon uspješne verifikacije server rezolvira auth subjekt u interni `users.id`.

Pravila:

- **request body, query parametri i nepouzdani headeri ne mogu birati `user_id`**;
- korisnik dolazi isključivo iz kriptografski verifikovanog JWT/OIDC subjekta;
- context funkcije poziva samo `AuthService`, unutar kratke transakcije;
- `app.user_id` je transakcijski lokalan i ne preživljava request.

Tačan database put rezolucije `auth_subject` → `users.id` definisan je odlukom **D-047**
(`02` §16.2.1, §16.2.4, §17.5). Redoslijed je:

1. verifikacija tokena (gore);
2. `app_security.set_auth_subject_context(<verifikovani subjekt>)`;
3. čitanje `users` kroz bootstrap politiku — upit **ne navodi** `auth_subject` u `WHERE`
   klauzuli, jer ga politika sama filtrira i vraća najviše jedan red;
4. nula redova → `403 ACCESS_DENIED` uz `ROLLBACK`; `status <> 'ACTIVE'` →
   `403 ACCESS_DENIED` uz `ROLLBACK`. Obje odbijenice nastupaju **prije**
   `set_user_context`, pa `app.user_id` nikada nije uspostavljen;
5. `app_security.set_user_context(users.id)`.

`401 INVALID_TOKEN` je rezervisan isključivo za neuspjelu verifikaciju tokena iz ove sekcije.
Kriptografski **validan** token čiji verifikovani subjekt nema `users` red nije `INVALID_TOKEN`
— to je neuspjeh admisije, pa je odgovor `403 ACCESS_DENIED`. Odgovor namjerno **ne razlikuje**
nepoznat subjekt od poznatog ali ne-`ACTIVE` korisnika i ne otkriva nijednu lokalnu membership
ni tenant informaciju.

Cijeli lanac se izvršava u **jednoj interaktivnoj transakciji** (D-047, klauzula 8); sav
`app.*` kontekst je transakcijski lokalan i ne preživljava request.

`app.auth_subject` podliježe **istoj granici povjerenja** kao `app.user_id`: dolazi isključivo
iz kriptografski verifikovanog JWT/OIDC subjekta i **nikada** iz bodyja, query parametra ni
nepouzdanog headera.

Mehanizam ograničava normalni query scope i aplikacijske greške, ali ne autentifikuje
korisnika nezavisno nakon kompromitacije dijeljenog database credentiala. Tačka
sprovođenja autorizacije je API.

## 3.2 Practice context

```http
X-Practice-ID: <uuid>
```

**Obavezan za tenant rute.** Practice context se kreira tek nakon validacije **aktivnog**
membershipa za traženu ordinaciju.

Ponašanje:

- header nedostaje na tenant ruti → `400 PRACTICE_CONTEXT_REQUIRED`;
- header nije validan UUID → `400 PRACTICE_CONTEXT_INVALID`;
- korisnik nema aktivan membership → **`403 ACCESS_DENIED`, i practice context se ne
  kreira**;
- neuspješna validacija ne ostavlja prethodni tenant scope aktivnim.

Server prima samo `p_practice_id`; **nijedan endpoint ne prima `p_user_id` kao parametar
za izbor konteksta** (D-033).

**Kontekst nije autorizacija (D-038).** Uspješno uspostavljen practice context dokazuje
**aktivan membership**, a ne pravo na bilo koju operaciju. Membership sa **nula**
dodijeljenih tenant rola smije uspostaviti kontekst i i dalje dobija `403` na svakoj
permission-gated operaciji. Redoslijed autorizacije je u §3.7.

## 3.3 Platform context

Platform rute ne koriste practice context.

- **`X-Practice-ID` se ne šalje** i ignoriše se ako je poslan;
- pristup zahtijeva platform rolu `SYSTEM_ADMIN` (D-023);
- `SYSTEM_ADMIN` je odvojen od `practice_memberships` i **ne daje automatski pristup**
  encounterima, analizama, pacijentima ni medicinskim dokumentima;
- korisnik koji je istovremeno `SYSTEM_ADMIN` i član ordinacije dobija dva **nezavisna**
  skupa permisija; jedan se ne izvodi iz drugog.

Dopuna prema D-038, klauzule 12–14:

- `platformRoles` se **nikada ne spajaju unijom** sa tenant rolama;
- `SYSTEM_ADMIN` **ne dobija nijednu tenant permisiju** kroz svoju platform rolu;
- korisnik koji je i `SYSTEM_ADMIN` i član ordinacije koristi tenant permisije izvedene
  **isključivo** iz tenant rola tog membershipa.

## 3.4 Klasifikacija ruta

| Klasa | `X-Practice-ID` | Primjeri |
|---|---|---|
| Tenant | **obavezan** | `/encounters*`, `/analyses*`, `/exports*`, `/practices/{id}*`, `/admin/integrations` (read) |
| Platform | **ne šalje se** | `/admin/tariff-releases*` |
| Neutralno | nije primjenjiv | `/me`, `/health/*` |

## 3.5 Request ID

Klijent može poslati:

```http
X-Request-ID: <uuid>
```

Ako ne pošalje, server generiše.

Server uvijek vraća:

```http
X-Request-ID: <uuid>
```

## 3.6 Jezik

```http
Accept-Language: de-CH
```

MVP podržava `de-CH`; error code je stabilan bez obzira na lokalizovanu poruku.

## 3.7 Autorizacija tenant ruta

**Normativna odluka: D-038, uz D-033 i D-047.**

### 3.7.1 Redoslijed

Redoslijed je obavezan i nema preskakanja koraka. Cijeli lanac se izvršava u **jednoj
interaktivnoj transakciji** (D-047, klauzula 8):

1. autentifikacija bearer tokena (§3.1);
2. izvođenje pouzdanog `app.user_id` iz verifikovanog subjekta — `set_auth_subject_context`,
   čitanje `users`, provjera `users.status`, pa `set_user_context` (§3.1, D-047 klauzule 2–4 i 9);
3. čitanje i validacija `X-Practice-ID` (§3.2);
4. **membership-scoped čitanje `status` tražene ordinacije, prije promjene konteksta**
   (D-047, klauzula 10): nula redova → `403 ACCESS_DENIED`; `status <> 'ACTIVE'` →
   `403 ACCESS_DENIED` uz rollback;
5. poziv SECURITY INVOKER funkcije `set_request_context(p_practice_id uuid)`;
6. provjera **aktivnog** `practice_memberships` reda;
7. uspostavljanje transakcijski lokalnog tenant konteksta;
8. učitavanje dodijeljenih tenant rola za taj membership i tu ordinaciju;
9. izvođenje efektivnih tenant permisija (§28.5);
10. evaluacija permisije koju endpoint zahtijeva i svakog prihvaćenog uslovnog pravila;
11. izvršenje komande pod tenant RLS-om.

Pojašnjenja:

- `set_request_context` **ne prima rolu**;
- `set_request_context` **ne prima `user_id`**;
- `set_request_context` **ne uspostavlja platform kontekst**;
- **tijelo `set_request_context` se ne mijenja** — provjera statusa ordinacije iz koraka 4 je
  aplikacijska i izvršava se **prije** poziva, pa `app.practice_id` nikada ne postoji za
  ne-ACTIVE ordinaciju (D-047, klauzula 10);
- korak 4 dokazuje **postojanje** membershipa, korak 6 dokazuje **aktivan** membership; oba su
  potrebna i nijedan ne zamjenjuje drugi;
- `practice_membership_roles` **nije potreban** za provjeru postojanja membershipa —
  koraci 5–7 čitaju isključivo `practice_memberships` (D-038, klauzule 20–21);
- role se evaluiraju **tek nakon** uspješnog bootstrapa, u koracima 8–10;
- aktivan membership sa **nula** rola prolazi korake 1–7 i pada na koraku 10.

**Vlasništvo faza (D-047, klauzula 16).** Koraci 1–4 pripadaju **fazi 3**; koraci 5–7 pripadaju
**fazi 4** zajedno sa `set_request_context` i PracticeContext guardom. U fazi 3 `app.practice_id`
još ne postoji, pa se sužavanje na traženu ordinaciju dodatno sprovodi aplikacijski. Faza 3 je
**nepilotsko međustanje**; faza 4 ostaje obavezan sigurnosni gate prije faze 5.

### 3.7.2 Ponašanje pri greškama

| Situacija | Ishod |
|---|---|
| nema aktivnog membershipa za traženu ordinaciju | **`403 ACCESS_DENIED`**, tenant context se ne kreira |
| neaktivan membership | **`403 ACCESS_DENIED`** pri uspostavljanju konteksta |
| ordinacija čiji `status` nije `ACTIVE` | **`403 ACCESS_DENIED`** uz rollback, **prije** `set_request_context`; `app.practice_id` se nikada ne postavlja (D-047, klauzula 10) |
| korisnik čiji `status` nije `ACTIVE` | **`403 ACCESS_DENIED`** prije `set_user_context`; membershipi se ne enumerišu (D-047, klauzula 9) |
| aktivan membership sa nula rola | kontekst se uspostavlja; svaka permission-gated operacija vraća uobičajeni **`403 ACCESS_DENIED`** |
| aktivan membership sa rolama, ali bez tražene permisije | **`403 ACCESS_DENIED`** |
| tenant rola dodijeljena u drugoj ordinaciji | **ne doprinosi** autorizaciju; ishod je isti kao da rola ne postoji |
| samo `platformRoles`, bez tenant membershipa | **`403 ACCESS_DENIED`** na svakoj tenant ruti |

**Nijedan novi error code se ne uvodi.** Sve navedeno koristi već prihvaćeni
`403 ACCESS_DENIED` i tabelu iz §9.

### 3.7.3 Audit dokaz autorizacije

Autorizaciona odluka za osjetljive operacije mora biti reproducibilna iz:

- autentifikovanog korisnika;
- odabrane ordinacije;
- aktivnog membershipa;
- dodijeljenih tenant rola;
- tražene permisije;
- relevantne uslovne postavke;
- rezultata autorizacije.

**Audit event ne čuva jednu "aktivnu rolu".** Jednu permisiju može doprinijeti više
dodijeljenih rola, pa bi izbor jedne bio proizvoljan i neistinit. Audit bilježi
**iskorištenu permisiju** i **identitet aktera**; historija dodjele rola pripada
schema/audit modelu (`02` §6.3a).

### 3.7.4 Normativni izvor dodjele permisija rolama

**`15_ROLE_PERMISSION_MATRIX_V1.md` je konsolidovana normativna v1 role-permission matrica.**
Izvorne prihvaćene odluke su u `06` — D-023, D-032 i D-039 do D-045.

- sekcije endpointa u ovom dokumentu definišu **traženu permisiju**, a ne kompletnu dodjelu
  rolama;
- implementacija **ne smije izvoditi role grantove iz proznih primjera** ovog dokumenta;
- pri neslaganju `03` i `15` mjerodavan je **posljednji ACCEPTED ADR u `06`**, a dokumenti se
  moraju **uskladiti kontrolisanim batchom**, nikada tiho protumačiti.

Kompletna matrica se ovdje **ne duplira**; jedna normativna referenca je namjerna, da ne bi
postojale dvije nezavisno uređive matrice.

---

# 4. Idempotency

Header:

```http
Idempotency-Key: <client-generated-key>
```

Obavezno za:

- `POST /patient-references`;
- `POST /encounters`;
- `POST /encounters/{id}/documents/text`;
- `POST /encounters/{id}/analyses`;
- `POST /analyses/{id}/revisions`;
- `POST /analyses/{id}/decisions`;
- `POST /analyses/{id}/exports`;
- `POST /exports/{id}/retry`;
- admin aktivacije/import komande.

Pravila:

- isti key + isti canonical request hash → isti poslovni rezultat;
- isti key + drugi hash → `409 IDEMPOTENCY_CONFLICT`;
- request in progress → **`409 REQUEST_ALREADY_IN_PROGRESS`** (D-028, klauzula 1);
- key scope: practice + user + endpoint;
- minimalni response cache;
- retention 24–72 sata prema endpointu.

**`425` se ne koristi.** `425 Too Early` (RFC 8470) semantički pokriva TLS early data, ne
concurrency. Nijedan endpoint ne vraća `425` i status se ne pojavljuje u §9.

`POST /analyses/{id}/cancel` namjerno **nije** na listi obaveznih `Idempotency-Key`
endpointa: komanda je state-idempotentna (§15.4), pa ponovljeni poziv ne mijenja stanje.

## 4.1 Kanonski request hash — `idempotency_keys.request_sha256` (D-069, `RULING 4`)

**Ovo je jedini kanonski algoritam „canonical request hasha" iz §4.** Kolona je `varchar(64)`
(`02` §11); D-069 ne mijenja nijednu kolonu, tip ni constraint.

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

**Zašto metod i path nisu uključeni:** key scope iz §4 **već sadrži `endpoint` zasebno**
(`practice + user + endpoint`; `02` §11 `unique (practice_id, user_id, endpoint,
idempotency_key)`), pa bi njihovo uključivanje u hash stvorilo drugi izvor iste istine.

**Semantika:**

- **`null` i odsustvo polja ostaju različiti**;
- **redoslijed elemenata niza ostaje značajan**;
- **ulazni redoslijed ključeva objekta je irelevantan** — RFC 8785 ga kanonizuje;
- **razlike u whitespaceu su irelevantne**;
- **ekvivalentna parsirana tijela daju isti digest**;
- **različita validirana tijela daju različit digest**, osim pri kriptografskoj koliziji.

**Format je perzistentan i MORA biti pinovan fiksnim test vektorima** (`08` §9).

**Vlasnik implementacije je slice `P5-I4`** (`04` §7.5a). **`P5-I5` ga konzumira nepromijenjenog i
ne smije ga izmisliti ni forkovati.** Pravila iz §4 — isti key + isti hash → isti poslovni
rezultat, isti key + drugi hash → **`409 IDEMPOTENCY_CONFLICT`** — ostaju **nepromijenjena**.

---

## 4.2 `POST /patient-references` — idempotency pojašnjenja `P5-I4` (D-072, `OD-P5-I4-3`, `OD-P5-I4-7`, `OD-P5-I4-8`)

**§4 i §4.1 iznad se NE prepisuju.** Ova sekcija ih **specijalizuje za jedan endpoint** i ne
proširuje broj endpointa.

**Nedostajući `Idempotency-Key`:**

```text
HTTP                 400
ProblemDetails code  IDEMPOTENCY_KEY_REQUIRED
poruka               staticna, bez odraza ulaza
```

**`428` se za ovo NE koristi.** `428 PRECONDITION_REQUIRED` ostaje rezervisan **isključivo** za
nedostajući `If-Match` nad šest optimistic-locking resursa (§5.1, §8.1; D-028), i **ta semantika se
ne dira**.

**TTL i minimalni cash:**

```text
IDEMPOTENCY_TTL_HOURS = 48
expires_at            = claim_time + 48 sati       (claim_time se generise tacno jednom)
response_status       = 201
response_body         = {"resourceId":"<patient-reference-uuid>"}
completed_at          = postavljen
locked_at             = null
```

`48` sati je unutar kanonskog raspona „retention 24–72 sata prema endpointu" iz §4 i **ne mijenja
ga**. **`expires_at` se nikada kasnije ne mijenja.**

- **Minimalni cash sadrži ISKLJUČIVO `resourceId`.** `pseudonym`, `birthYear`, `sexCode`,
  `sourceSystem` i `createdAt` se **ne cashiraju**; nikakav PHI ni puna reprezentacija resursa ne
  ulazi u `idempotency_keys.response_body`.
- **Replay istog ključa sa istim hashem rekonstruiše kanonsko `201` tijelo** iz §11: pročita
  `resourceId`, izvrši **tenant-scoped immutable read** `patient_references` reda i sastavi
  odgovor. Cash je **pokazivač**, ne kopija.
- **Completed cash koji pokazuje na nerazrješiv resurs → `500 INTERNAL_ERROR`.** Ne izmišlja se
  odgovor i ne vraća se `404`.
- **Isti ključ, drugi hash → `409 IDEMPOTENCY_CONFLICT`**; **nezavršen claim →
  `409 REQUEST_ALREADY_IN_PROGRESS`** — oba nepromijenjena u odnosu na §4.

**`request_sha256` za ovaj endpoint koristi `VALIDATED_ORIGINAL_PARSED_BODY`** (`OD-P5-I4-3`):

```text
request_sha256 = SHA-256( UTF8( RFC8785_JCS( validirano ORIGINALNO parsirano tijelo ) ) )
parse -> sacuvaj originalnu parsiranu vrijednost -> validiraj -> JCS -> SHA-256
```

Ulaz **nije** sirovi HTTP bajt-stream, **nije** pre-parse JSON tekst, **nije** transformisani DTO,
**nije** instanca klase i **nije** server-proširena/defaultovana reprezentacija. Sva isključenja iz
§4.1 ostaju doslovno na snazi; **nepoznata polja se odbijaju prije hashiranja**, a **server defaulti
se ne uvode** u hashiranu vrijednost.

**Ovo je ugovor, ne implementacija.** Vlasnik je `P5-I4C`, koji je `NOT AUTHORIZED` /
`NOT STARTED`. Vidi D-072 u `06`.

---

# 5. Optimistic locking

Normativne odluke: **D-029** i **D-028**. Ova sekcija je jedini autoritativni spisak
resursa pod optimistic lockingom; pojedinačne sekcije je referenciraju, ne proširuju.

## 5.1 Obuhvat — tačno šest resursa

| Resurs | Endpoint | Permission |
|---|---|---|
| encounter | `PATCH /encounters/{encounterId}` | `encounter.update` |
| practice settings | `PATCH /practices/{practiceId}/settings` | `practice.settings.manage` |
| integration connection | `PATCH /admin/integrations/{id}` — **DEFERRED** | `integration.manage` (reserved) |
| extracted fact | `PATCH /analyses/{analysisId}/facts/{factId}` | `analysis.correct_fact` |
| service candidate | `PATCH /analyses/{analysisId}/service-candidates/{candidateId}` | `analysis.correct_service` |
| rule finding | `PATCH /analyses/{analysisId}/findings/{findingId}` | `finding.resolve` |

Svaki od šest ima `version integer not null default 1` i `check (version >= 1)` u
`02` §6.4, §7.2, §10.5, §10.6, §12.3 i §14.1.

Integration connection zadržava dokumentovan `If-Match` iako je write endpoint DEFERRED,
kako bi ugovor bio potpun kada endpoint postane aktivan.

**Vlasništvo faze za `practice settings` (D-049).** `PATCH /practices/{practiceId}/settings` — a
time i njegov optimistic-locking runtime ugovor i testovi — pripada **fazi 4**, ne fazi 3. Tvrdnja
D-028 klauzule 4 da „optimistic locking počinje u fazi 3, jer puni settings PATCH pripada fazi 3"
je **povučena**. **Schema odluka D-029 ostaje nepromijenjena**: `version` i `check (version >= 1)`
na `practice_settings` i dalje nastaju u paketu `002_identity_and_practices`, faza 3. Za preostalih
pet resursa iz ove tabele ništa se ne mijenja.

## 5.2 Protokol

Mutable resurs vraća:

```http
ETag: "4"
```

PATCH mora poslati:

```http
If-Match: "4"
```

`If-Match` je **obavezan** na sva šest PATCH endpointa. Nije uslovan i ne zavisi od
implementacije.

| Slučaj | Status | Code |
|---|---:|---|
| tačan `If-Match` | `200` | — uspjeh, `version` inkrementiran, novi `ETag` u odgovoru |
| `If-Match` nedostaje | **`428`** | **`PRECONDITION_REQUIRED`** |
| `If-Match` je stale | **`409`** | **`VERSION_CONFLICT`** |

Pravila:

- inkrement `version` je atomičan sa upisom; nema prozora u kojem je resurs izmijenjen a
  `version` nepromijenjen;
- uspješan odgovor **uvijek** vraća novi `ETag`;
- `400` se ne koristi za nedostajući `If-Match` (D-028, klauzula 2).

**Nedostajući naspram neispravnog validatora (D-055, klauzula 12).** Pravilo iznad se odnosi
**isključivo na odsustvo** headera. Header koji **jeste prisutan**, ali čiji oblik endpoint ne
prihvata, je **format headera** i daje **`400 VALIDATION_ERROR`** po §9 — nikada `428` (header
nije odsutan) i nikada `409` (nije poslana valjana verzija koja bi mogla biti zastarjela).
Prihvaćeni oblik validatora je vlasništvo pojedinačnog endpointa; za settings rutu je zamrznut u
D-055, klauzuli 11.

## 5.3 Ograničenje

Optimistic locking se **ne primjenjuje na command-style POST endpointe**. Nijedan `POST`
ne zahtijeva `If-Match` osim ako to eksplicitno traži prihvaćena odluka; trenutno takve
odluke nema.

Concurrency na command endpointima rješavaju `Idempotency-Key` (§4), state guard (§29) i
`expectedAnalysisRevision` gdje je dokumentovan (§20).

Analysis revision sama po sebi nije "edit in place"; kreira se nova revizija (§15.3).

---

# 6. Decimal serialization

Decimalne vrijednosti vraćaju se kao string:

```json
{
  "quantity": "2.0000",
  "amountChf": "84.50",
  "confidence": "0.9500"
}
```

Frontend ne smije pretpostaviti binary float preciznost.

---

# 7. Pagination

Cursor pagination:

```http
GET /encounters?limit=25&cursor=<opaque>
```

Response:

```json
{
  "data": [],
  "page": {
    "limit": 25,
    "hasMore": true,
    "nextCursor": "opaque"
  }
}
```

Pravila:

- default 25;
- max 100;
- cursor je opaque;
- stabilan sort `createdAt desc, id desc` ili domain-specific;
- invalid cursor → `400 INVALID_CURSOR`.

---

# 8. Problem Details

Standard:

```json
{
  "type": "https://api.example.ch/problems/validation-error",
  "title": "Validation failed",
  "status": 422,
  "code": "VALIDATION_ERROR",
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/encounters",
  "requestId": "uuid",
  "errors": [
    {
      "field": "treatmentDate",
      "code": "INVALID_DATE",
      "message": "treatmentDate must be a valid date."
    }
  ]
}
```

Stabilni error code katalog:

```text
AUTHENTICATION_REQUIRED
INVALID_TOKEN
ACCESS_DENIED
PRACTICE_CONTEXT_REQUIRED
PRACTICE_CONTEXT_INVALID
RESOURCE_NOT_FOUND
VALIDATION_ERROR
INVALID_CURSOR
VERSION_CONFLICT
PRECONDITION_REQUIRED
IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_CONFLICT
REQUEST_ALREADY_IN_PROGRESS
PATIENT_REFERENCE_ALREADY_EXISTS
INVALID_STATE_TRANSITION
REVISION_CONFLICT
ENCOUNTER_NOT_ANALYSABLE
ANALYSIS_ALREADY_RUNNING
ANALYSIS_NOT_APPROVABLE
OPEN_BLOCKING_FINDINGS
APPROVAL_REQUIRED
APPROVAL_REVOKED
INTEGRATION_CONNECTION_NOT_CONFIGURED
INTEGRATION_CONNECTION_REQUIRED
TARIFF_RELEASE_NOT_FOUND
TARIFF_RELEASE_NOT_ACTIVE
TARIFF_ENGINE_UNAVAILABLE
TARIFF_RESPONSE_INVALID
AI_EXTRACTION_FAILED
AI_RESPONSE_INVALID
INTEGRATION_UNAVAILABLE
EXPORT_FAILED
RATE_LIMIT_EXCEEDED
DEPENDENCY_UNAVAILABLE
INTERNAL_ERROR
```

## 8.1 Mapiranje konflikata i preconditiona

Normativno mapiranje koda na status:

| Code | Status | Endpoint familija | Odluka |
|---|---:|---|---|
| `PRECONDITION_REQUIRED` | **428** | svih šest `If-Match` PATCH endpointa (§5.1) | D-028 |
| `VERSION_CONFLICT` | 409 | svih šest `If-Match` PATCH endpointa (§5.1) | D-009 |
| `REQUEST_ALREADY_IN_PROGRESS` | 409 | svi endpointi sa `Idempotency-Key` (§4) | D-028 |
| `IDEMPOTENCY_KEY_REQUIRED` | **400** | svi endpointi sa `Idempotency-Key` (§4) | D-072 |
| `PATIENT_REFERENCE_ALREADY_EXISTS` | 409 | `POST /patient-references` (§11) | D-072 |
| `INVALID_STATE_TRANSITION` | 409 | revisions, cancel, close, decisions | D-027, D-031 |
| `REVISION_CONFLICT` | 409 | `POST /analyses/{id}/revisions` | D-034 |
| `APPROVAL_REQUIRED` | 409 | `POST /analyses/{id}/exports`, `POST /exports/{id}/retry` | D-037 |
| `APPROVAL_REVOKED` | 409 | `POST /analyses/{id}/exports`, `POST /exports/{id}/retry` | D-037 |
| `INTEGRATION_CONNECTION_NOT_CONFIGURED` | 409 | `POST /analyses/{id}/exports` | D-032 |
| `INTEGRATION_CONNECTION_REQUIRED` | **422** | `POST /analyses/{id}/exports` | D-032 |

### Značenje `REVISION_CONFLICT`

`REVISION_CONFLICT` znači **isključivo** jedno od dvoje:

- traženi roditelj **već ima direktno dijete**; ili
- database parcijalni unique indeks je prijavio **konkurentno kreiranje djeteta**.

**Ne zavisi od toga da li roditelj zadržava ili mijenja status.** Provjera postojanja djeteta
prethodi svakoj provjeri statusa (§15.3, D-034).

---

# 9. Standardni status kodovi

| Status | Upotreba |
|---:|---|
| 200 | read/update uspjeh |
| 201 | kreiran resurs |
| 202 | async komanda prihvaćena |
| 204 | uspješna komanda bez bodyja |
| 400 | header/query/request format |
| 401 | nema/invalid auth |
| 403 | nema permission, nema membership, ili aktivan membership bez dodijeljene tenant role (§3.7.2) |
| 404 | resurs nije vidljiv ili ne postoji |
| 409 | state/version/idempotency konflikt |
| 413 | upload prevelik — **samo DEFERRED upload putanja (§13.2)** |
| 415 | content type nije podržan — **samo DEFERRED upload putanja (§13.2)** |
| 422 | semantička validacija |
| 428 | nedostaje obavezan `If-Match` (§5.2) |
| 429 | rate limit |
| 500 | neočekivana interna greška |
| 502/503 | dependency problem |

`425` se ne koristi ni na jednom endpointu (§4).

`413` i `415` nisu dostižni u aktivnom MVP-u, jer aktivna document putanja prima samo
tekst (§13.1). Zadržani su u tabeli kako bi ugovor bio potpun kada upload putanja postane
aktivna.

**Prekoračenje maksimuma manuelnog teksta nije `413` (D-060, klauzula 35).** Aktivni manual-text
endpoint ima vlastiti maksimum od **256 KiB** i prekoračenje mapira na **`422 VALIDATION_ERROR`**
(§13.1), jer je to semantička validacija tijela zahtjeva, a ne odgođena upload putanja. Generički
transportni body limit (`09` §14) je odvojen, infrastrukturni vanjski čuvar i **nije** ugovor
nijednog endpointa; njegova tekuća podrazumijevana vrijednost je iznad 256 KiB, pa endpoint-level
maksimum ostaje mjerodavan.

Cross-tenant resource se u pravilu vraća kao `404` da se ne potvrđuje postojanje.

---

# 10. `/me` i practice

## GET `/me`

Permission: authenticated. Nije ni tenant ni platform ruta; `X-Practice-ID` nije primjenjiv.

Response:

```json
{
  "id": "user-uuid",
  "email": "arzt@example.ch",
  "displayName": "Dr. Anna Muster",
  "preferredLanguage": "de-CH",
  "platformRoles": [
    {
      "role": "SYSTEM_ADMIN",
      "permissions": [
        "tariff.manage"
      ]
    }
  ],
  "memberships": [
    {
      "membershipId": "membership-uuid",
      "practiceId": "practice-uuid",
      "practiceName": "Praxis Muster",
      "active": true,
      "roles": [
        "PHYSICIAN",
        "PRACTICE_ADMIN"
      ],
      "permissions": [
        "..."
      ]
    }
  ]
}
```

Pravila (D-023):

- `platformRoles` i `memberships` su **odvojeni blokovi**; platform rola se nikada ne
  prikazuje kao membership niti se membership prikazuje kao platform rola;
- `platformRoles` je prazan niz za korisnika bez platform role;
- korisnik koji je `SYSTEM_ADMIN` **i** član ordinacije dobija oba bloka, sa dva nezavisna
  skupa permisija; unija se ne izvodi automatski;
- `SYSTEM_ADMIN` bez aktivnog membershipa ne dobija pristup nijednoj tenant ruti.

**Semantika tekućih dodjela (D-051, klauzula 3).** `platformRoles[]` predstavlja **tekuće,
neopozvane** dodjele platform rola: doprinose isključivo `platform_role_assignments` redovi gdje je
`revoked_at IS NULL`. Opozvana dodjela se **ne** vraća. Ovo je pojašnjenje čitanja — **revoke
administracijski endpoint, permisija ni write grant se ovim ne uvode**, a `15` ostaje
nepromijenjen.

### Breaking izmjena ugovora (D-038)

`memberships[].role` → `memberships[].roles`

Ovo je **breaking pre-implementation ispravka v1 ugovora**. Projekat nema produkcijsku
implementaciju ni klijente, pa se **ne uvodi** compatibility endpoint ni prelazni period sa
dva polja. **`role` i `roles` nikada ne postoje istovremeno** unutar `memberships[]`.

### `memberships[].roles`

Tip: `membership_role[]`.

- sadrži **nula, jednu ili više** tenant rola;
- vrijednosti su **jedinstvene**;
- koriste se **isključivo** prihvaćene `membership_role` vrijednosti (`02` §4.1);
- sadrži **isključivo role tog tačnog membershipa i te ordinacije**;
- redoslijed je **determinističan**;
- **nikada** ne sadrži `platformRoles`;
- **prazan niz** za aktivan membership bez dodijeljenih rola;
- ostaje popunjen i za **neaktivne** membershipe autentifikovanog korisnika, u mjeri u kojoj
  bootstrap-readable politika (`02` §17.4) dozvoljava enumeraciju.

### `memberships[].permissions`

Vrijednost u primjeru je **elidirana** namjerno. Lista je **unija** grantova svih
dodijeljenih tenant rola tog membershipa, uvećana za prihvaćene uslovne rezultate (§28.5).

**Primjer ne dodjeljuje nijednu permisiju nijednoj roli.** Stvarna role-to-permission
matrica pripada `docs/15` i odlukama od D-039 nadalje (§28.4).

### Vidljivost naspram autorizacije

- `active: false` membership **smije biti vidljiv** u `/me`;
- vidljiv neaktivan membership **nikada ne doprinosi** efektivne permisije (§28.5);
- autorizacija ide isključivo kroz **aktivan, odabrani** membership i redoslijed iz §3.7.

### Bootstrap self-enumeracija

`GET /me` smije nabrojati membershipe autentifikovanog korisnika i njihove dodijeljene
tenant role **prije** nego što je izabran ijedan tenant kontekst. Ta self-enumeracija:

- ograničena je na **autentifikovanog korisnika**;
- **ne izlaže** membershipe ni role drugog korisnika;
- **nije** generička role administration;
- **ne autorizuje** nijednu tenant operaciju;
- **ne definiše** generički pristup nad `users` ni `practices`;
- **nije** cross-practice ni platform pristup;
- **nije** riješila D-OPEN-011 — to je učinio D-047, zasebnom odlukom.

**Database put (D-047).** `practiceName` po membershipu čita se kroz membership-scoped politiku
nad `practices` (`02` §17.6), koja radi i **prije** nego `app.practice_id` postoji. Politika
namjerno ne filtrira `pm.active`, pa neaktivan membership i dalje prikazuje ime ordinacije, u
skladu sa pravilima vidljivosti iznad. Vlastiti `users` red čita se kroz self politiku
(`02` §17.5). Nijedno od toga ne daje pristup redu drugog korisnika.

### Adaptacija faze 4 — uslovne postavke pod `practice_settings` RLS-om

**Normativna odluka: D-053, dio D.** Puni obrazac je u `02` §17.1a.

Uslovne permisije u `permissions[]` (§28.5) izvode se iz `allow_mpa_approval` i
`allow_billing_specialist_approval`. Kada faza 4 uvede tenant politiku nad `practice_settings`
(`02` §17.1, §22.13), taj se read **više ne izvršava bez tenant konteksta**: uz nepostavljen
`app.practice_id` politika vraća nula redova, resolver pada fail-closed i `MPA` odnosno
`BILLING_SPECIALIST` bi **tiho izgubili** `analysis.approve` i `analysis.approval.revoke`.

**Ugovor `/me` iznad se time ne mijenja.** Faza 4 adaptira **isključivo interni put**:

- **`GET /me` ostaje neutralna, autentifikovana ruta** — `X-Practice-ID` se **ne uvodi** i nije
  primjenjiv; klijent **ne bira** tenant;
- **svaki `practice_id` upotrijebljen za taj interni read dolazi isključivo iz već razriješenih
  membership redova** autentifikovanog korisnika; nijedna vrijednost iz tijela, query parametra,
  headera ni putanje ne učestvuje;
- **neaktivan membership ne dobija tenant kontekst** i ostaje `permissions = []`;
- za **aktivan** membership čije izvođenje stvarno zahtijeva uslovne postavke, kontekst se
  uspostavlja **za taj membership**, kroz prihvaćeni `set_request_context` put (`02` §16.2.3), i
  postavke se čitaju **pod istom strogom tenant politikom**;
- **postavke ordinacije A nikada ne doprinose ordinaciji B**; obrada više membershipa **ne
  unijira** postavke ni role preko ordinacija;
- **sva čitanja koja nisu tenant-scoped — uključujući `practiceName` za sve membershipe — završavaju
  se prije prvog uspostavljanja konteksta** (RESTRICTIVE politika `02` §17.6 nakon toga sužava
  `practices` na tačno jednu ordinaciju);
- **tenant kontekst ne curi** nakon transakcije.

**Politika se ne slabi.** Ne uvodi se bootstrap izuzetak, membership-wide grana, `SECURITY
DEFINER` ni ijedna zaobilaznica (D-053, klauzule D.1 i D.11).

**Korak provjere `practices.status` iz §3.7.1 se na `/me` ne uvodi** — on štiti **klijentski
poslan** `X-Practice-ID` na tenant ruti, dok `/me` ne bira tenant i ne autorizuje nijednu tenant
operaciju (D-053, klauzula D.10).

**Regresijski dokaz je obavezan** (D-053, klauzula D.12; `08` §21.7.6): iste kanonske fixture daju
**iste** `memberships[].permissions` prije i nakon uvođenja RLS-a.

## GET `/practices/{practiceId}`

Permission: `practice.read`.

**Normativna odluka: D-047, klauzula 11.** Ranija klasifikacija `BLOCKED — D-OPEN-011` više ne
važi; D-OPEN-011 je riješen 2026-08-12.

Podobne role (matrica u `15` §5): `PRACTICE_ADMIN` **ALLOW**; `PHYSICIAN`, `MPA`,
`BILLING_SPECIALIST`, `AUDITOR`, `READ_ONLY` i `SYSTEM_ADMIN` **DENY**.

`practice.read` autorizuje **isključivo** čitanje neosjetljivog DTO-a **tekuće** tenant
ordinacije. `practiceId` iz putanje mora odgovarati uspostavljenom practice contextu.

Response projekcija — tačno ova polja:

```json
{
  "id": "practice-uuid",
  "code": "PRX-1",
  "name": "Praxis Muster",
  "defaultLanguage": "de-CH",
  "timezone": "Europe/Zurich",
  "status": "ACTIVE"
}
```

**`zsrNumber`, `glnNumber` i `legalName` se ne vraćaju.** Te kolone nemaju grant nijednoj runtime
roli (`02` §20.2a), pa nisu dostupne ni na nivou baze. Osjetljivi/admin DTO **ne postoji** u v1;
uvođenje bi zahtijevalo novu permisiju, novi ADR, prošireni grant i trajni audit red.

Ova ruta **ne autorizuje**: listu ni direktorij ordinacija — takva ruta ne postoji; cross-practice
ni platform pristup; bilo kakav upis nad `practices`; tenant pristup za `SYSTEM_ADMIN`.

`SYSTEM_ADMIN` dobija ovu permisiju isključivo ako isti korisnik **nezavisno** ima aktivan tenant
membership i dodijeljenu `PRACTICE_ADMIN` tenant rolu; platform rola sama po sebi ne doprinosi
ništa (D-023 klauzula 10, D-038 klauzule 13–14).

Negativni slučajevi:

- nedostaje `X-Practice-ID` → `400 PRACTICE_CONTEXT_REQUIRED`;
- `X-Practice-ID` nije validan UUID → `400 PRACTICE_CONTEXT_INVALID`;
- korisnik nema membership u traženoj ordinaciji → `403 ACCESS_DENIED`;
- membership postoji ali nije aktivan → `403 ACCESS_DENIED`;
- **ordinacija nije `ACTIVE`** → `403 ACCESS_DENIED` uz rollback (D-047, klauzula 10);
- `practiceId` iz putanje ≠ practice context → `403 ACCESS_DENIED`;
- rola bez `practice.read` → `403 ACCESS_DENIED`;
- nepostojeća ordinacija → `403 ACCESS_DENIED`, nerazlučivo od slučaja bez membershipa, čime se
  sprječava enumeracija.

Nijedan novi error kod se ne uvodi; katalog iz §8 je dovoljan.

## Settings rute — vlasništvo faze (D-049)

**Normativna odluka: D-049.** Obje settings rute pripadaju **fazi 4** i paketu `013_rls_policies`.

Raniji fazni dio **D-028, klauzule 4** — tvrdnja da puni `PATCH /practices/{practiceId}/settings`
pripada fazi 3 — je **POVUČEN**. Klauzule 1–3 D-028 ostaju nepromijenjene: `428
PRECONDITION_REQUIRED` za nedostajući `If-Match`, `409 REQUEST_ALREADY_IN_PROGRESS` za idempotency
u toku, `425` se ne koristi, `428` ostaje u tabeli §9.

U **fazi 3**:

```text
NEMA GET   /api/v1/practices/{practiceId}/settings
NEMA PATCH /api/v1/practices/{practiceId}/settings
```

Faza 3 ne registruje nijednu settings rutu i nema nijedan upisni grant nad `practice_settings`.
`copilot_app` u fazi 3 ima **isključivo** `SELECT (practice_id, allow_mpa_approval,
allow_billing_specialist_approval)` — tačno onoliko koliko `GET /me` treba za uslovne permisije
(`02` §20.2b). Ta izloženost je imenovana i prihvaćena kao
**`PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE`** (D-049, klauzula 3).

**Semantika permisija se ne mijenja** (D-044): `practice.settings.read` i
`practice.settings.manage` ostaju isključivo `PRACTICE_ADMIN`; `15` ostaje nepromijenjen. Mijenja
se **isključivo faza implementacije endpointa**.

Ugovor obje rute ispod ostaje **zamrznut i normativan** za svoju implementaciju u fazi 4.

## Settings reprezentacija — zamrznuta (D-053, dio A)

**Normativna odluka: D-053, dio A.** `GET` i **uspješan** `PATCH` vraćaju **istu** reprezentaciju
resursa, tačno ovih **osam** polja i nijedno drugo:

```json
{
  "practiceId": "practice-uuid",
  "billingReviewRequired": true,
  "allowMpaApproval": false,
  "allowBillingSpecialistApproval": false,
  "requireReasonForManualChange": true,
  "aiEnabled": true,
  "axenitaExportEnabled": true,
  "retentionPolicyCode": null
}
```

| Polje | Tip |
|---|---|
| `practiceId` | uuid |
| `billingReviewRequired` | boolean |
| `allowMpaApproval` | boolean |
| `allowBillingSpecialistApproval` | boolean |
| `requireReasonForManualChange` | boolean |
| `aiEnabled` | boolean |
| `axenitaExportEnabled` | boolean |
| `retentionPolicyCode` | string, nullable |

Obje rute vraćaju:

```http
ETag: "<version>"
```

Vrijednost je **integer** `practice_settings.version` (`02` §6.4).

**`version` se ne duplira u JSON tijelo.** Ne pojavljuje se ni u `GET` odgovoru, ni u `PATCH`
odgovoru, ni u `PATCH` zahtjevu. Postoji **tačno jedan** kanal za tekuću verziju resursa, i to je
`ETag`.

**`updated_at` i `updated_by` se ne vraćaju** i **ne primaju**. `updated_by` **nije autoritativno
audit polje** i settings endpoint ga ne dira; akterstvo ostaje u kanonskom audit modelu (`02`
§20.2b.1; D-053, klauzula B.3). `configuration` se **ne izlaže** — nema grant nijednoj runtime roli
(`02` §20.2b.1), pa nije dostupan ni na nivou baze.

Runtime površina baze koja ovu reprezentaciju nosi je **tačno devet** `SELECT` kolona — osam iz
tabele iznad plus `version` za `ETag` (`02` §20.2b.1).

## GET `/practices/{practiceId}/settings`

**Faza 4** (D-049).

Permission: `practice.settings.read`.

Podobne role (D-044; matrica u `15`): `PRACTICE_ADMIN` **ALLOW**, sve ostale **DENY**. Isto
važi za `practice.settings.manage` na `PATCH` ruti.

Vraća reprezentaciju iznad i `ETag` za optimistic locking (§5.2).

### Uslovni `GET` — `If-None-Match` i `304` (D-055, dio B)

Jak verzijski `ETag` učestvuje u **običnoj HTTP `If-None-Match` revalidaciji**. Za **potpuno
autentifikovan, admitiran i autorizovan** `GET`, podudaran validator **smije** dati:

```http
304 Not Modified
```

uz **prazno tijelo** i **zadržan tekući `ETag`**. Zamrznuta osmopoljna reprezentacija se na `304`
**ne primjenjuje**, jer `304` po definiciji **ne nosi reprezentaciju**; to **nije** izuzetak od
zamrznutog ugovora.

**Revalidacija je strogo nakon cijelog redoslijeda §3.7.1, koraka 1–10.** `If-None-Match` **ne
zaobilazi i ne preuređuje** autentifikaciju, tenant admisiju, provjeru `practices.status`, nijednu
membership barijeru, uspostavu tenant konteksta ni evaluaciju `practice.settings.read`.
Neautorizovan zahtjev zadržava **svoj kanonski ishod** — `401`, `403` ili `400` — **bez obzira** na
prisustvo ili vrijednost headera. **Ne postoji vrijednost `If-None-Match`-a koja od odbijenog
zahtjeva pravi `304`.**

`If-None-Match` po HTTP-u koristi **slabu komparaciju**, pa validator u slabom obliku (`W/"3"`)
**smije** poklopiti isti resursni tag pri `GET` revalidaciji. To je **očekivano** i **ne slabi** jak
`ETag` koji server emituje, niti definiše `PATCH` konkurentnost (D-055, klauzule 5 i 13).

### Nedostajući `practice_settings` red (D-055, dio C)

Kada su autentifikacija, tenant admisija, **aktivan** membership, **`ACTIVE`** ordinacija,
permisija `practice.settings.read` i tenant kontekst **svi uspješni**, a admitirana ordinacija
**nema** `practice_settings` red, to je **interni data-integrity invarijant failure**:

```text
500 INTERNAL_ERROR
```

sa **statičnim, neosjetljivim** Problem Details tijelom (`09` §11).

**Ne tumači se** kao `404`, `403`, prazne postavke ni default postavke. **Red se ne kreira i ne
popravlja** — nijedna runtime rola nema `INSERT` nad `practice_settings` (`02` §20.2b.1; D-053,
klauzula B.2).

## PATCH `/practices/{practiceId}/settings`

**Faza 4** (D-049). Puni PATCH ostaje u **aktivnom v1 scopeu**; njegov **fazni** dio iz D-028,
klauzule 4, je povučen i sada pripada fazi 4 zajedno sa `practice_settings` tenant RLS-om,
ograničenim `UPDATE` grantom i tenant enforcement pipelineom.

Permission: `practice.settings.manage`.

Headers — **obavezno** (§5.2):

```http
If-Match: "3"
```

Request primjer:

```json
{
  "billingReviewRequired": true,
  "allowMpaApproval": false,
  "allowBillingSpecialistApproval": false,
  "requireReasonForManualChange": true
}
```

Polja:

| Polje | Tip | Default | Napomena |
|---|---|---|---|
| `billingReviewRequired` | boolean | — | |
| `allowMpaApproval` | boolean | **`false`** | uslovna podobnost odobravanja za `MPA` (D-041) |
| `allowBillingSpecialistApproval` | boolean | **`false`** | uslovna podobnost odobravanja za `BILLING_SPECIALIST` (D-041) |
| `requireReasonForManualChange` | boolean | — | |
| `aiEnabled` | boolean | — | |
| `axenitaExportEnabled` | boolean | — | |
| `retentionPolicyCode` | string, nullable | — | |

Oba approval flaga imaju default `false` prema `02` §6.4.

**Podobnost za `analysis.approve` (D-041; matrica u `15`):**

- `PHYSICIAN` — **ALLOW**;
- `MPA` — **CONDITIONAL**, isključivo kada je `allowMpaApproval = true`;
- `BILLING_SPECIALIST` — **CONDITIONAL**, isključivo kada je `allowBillingSpecialistApproval = true`;
- `PRACTICE_ADMIN` — **DENY** kroz administrativnu rolu samu po sebi. Odobravanje je moguće
  isključivo ako isti korisnik **zasebno nosi `PHYSICIAN`** kroz D-038 multi-role membership;
- `AUDITOR`, `READ_ONLY` i `SYSTEM_ADMIN` — **DENY**.

Pojašnjenja:

- flag **proširuje podobnost isključivo na svoju odgovarajuću tenant rolu** — `allowMpaApproval`
  ne čini `BILLING_SPECIALIST`-a podobnim i obratno;
- **flag sam po sebi ne daje permisiju**; bez dodijeljene podobne role nema granta;
- **neaktivan membership uvijek odbija**, bez obzira na flag;
- **platform rola nikada ne zadovoljava** uslov tenant podobnosti za odobravanje.

Odgovor `200` vraća **zamrznutu osmopoljnu reprezentaciju** iz „Settings reprezentacija" iznad i
**novi `ETag`**; `version` je inkrementiran atomično.

Greške: `428 PRECONDITION_REQUIRED` bez `If-Match`, `409 VERSION_CONFLICT` na stale
`If-Match`, `400 VALIDATION_ERROR` na sintaksno neprihvaćen `If-Match` ili prazno tijelo
(D-055, dio D).

### Prihvaćeni oblik `If-Match`-a (D-055, klauzula 11)

Prihvata se **tačno jedan** kanonski **jak** verzijski tag, u **tačno onom obliku koji `GET`
emituje**:

```text
"<N>"
```

gdje je `N` **kanonska nenegativna decimalna** cjelobrojna reprezentacija.

| Prihvaćeno | Neprihvaćeno |
|---|---|
| `"0"` | `1` (bez navodnika) |
| `"1"` | `W/"1"` (slab validator) |
| `"27"` | `*` (wildcard) |
| | `"01"` (nekanonska decimalna reprezentacija) |
| | `"1", "2"` (više validatora) |
| | `"abc"` (nije cijeli broj) |
| | prazna vrijednost |
| | neispravno navođenje |

Endpoint **namjerno** koristi **užu aplikacijsku gramatiku** od pune generičke HTTP `If-Match`
gramatike, jer je taj token **jedini kanal optimističke konkurentnosti** ovog resursa. Uža
gramatika je **pooštrenje**, ne odstupanje.

**Komparacija je jaka i tačna.** `W/"1"` **nikada** ne zadovoljava `If-Match: "1"`. Slaba
komparacija dozvoljena na `GET` revalidaciji **nije presedan** za `PATCH`: obje rute dijele **isti
emitovani token**, ali koriste **različitu HTTP precondition semantiku** (D-055, klauzula 13).

### Normativno razdvajanje `428` / `400` / `409` (D-055, klauzula 12)

| Slučaj | Status | Code |
|---|---:|---|
| `If-Match` **nedostaje** | **`428`** | `PRECONDITION_REQUIRED` |
| `If-Match` je **sintaksno neprihvaćen** | **`400`** | `VALIDATION_ERROR` |
| `If-Match` je **prihvaćen**, ali verzija **ne odgovara** tekućem stanju | **`409`** | `VERSION_CONFLICT` |

- **`400`** = pozivalac **nije poslao valjan verzijski token**;
- **`409`** = pozivalac **jeste** poslao valjan jak verzijski token, ali on **više ne odgovara**
  perzistiranom stanju.

Sintaksno neprihvaćen `If-Match` **nikada** ne postaje `409` ni `428`. Pravilo „`400` se ne koristi
za nedostajući `If-Match`" (§5.2, D-028, klauzula 2) ostaje **na snazi** i odnosi se **isključivo**
na **odsustvo** headera.

### Prazno tijelo (D-055, klauzula 14)

Tijelo mora sadržavati **najmanje jedno** od **tačno sedam** mutabilnih polja iz tabele iznad.
Prazan JSON objekat:

```json
{}
```

daje **`400 VALIDATION_ERROR`**, uz **nikakav `UPDATE`**, **bez inkrementa `version`-a** i **bez
promjene `updated_at`**. Prazno tijelo je **odsustvo zahtjeva za izmjenom** i ne smije potrošiti
verziju.

Nepoznata i neugovorna polja ostaju nevažeća po normalnim pravilima validacije zahtjeva; `version`,
`updated_at` i `updated_by` se i dalje **ne primaju**.

### Mehanika optimističkog update-a (D-053, dio B)

- `If-Match` je **obavezan** (§5.2); nedostajući → **`428 PRECONDITION_REQUIRED`**;
- **očekivana verzija se izvodi isključivo iz `If-Match`**;
- izvršava se **jedan atomičan SQL `UPDATE`** koji:
  - postavlja **samo poslana** poslovna polja;
  - postavlja `version = version + 1`;
  - postavlja `updated_at` na **tekuće vrijeme baze**;
  - nosi predikat `practice_id = <uspostavljeni tenant> and version = <očekivana verzija>`;
- **nula pogođenih redova zbog zastarjele očekivane verzije → `409 VERSION_CONFLICT`**;
- uspjeh vraća reprezentaciju i **novi** `ETag`.

**Zabranjen aplikacijski pre-read (D-055, klauzula 16).** Nijedno aplikacijsko čitanje prije upisa
ne smije se koristiti da odluči da li je verzija tekuća. Očekivana verzija dolazi **isključivo** iz
`If-Match`-a, a njena tekućnost se utvrđuje **isključivo** predikatom iskaza.

**Nula pogođenih redova ima jedan ishod (D-055, klauzule 19–21).** `409 VERSION_CONFLICT` važi
**bez obzira** da li je nula redova nastala zbog **zastarjele verzije** ili zbog **nedostajućeg
`practice_settings` reda**. Aplikacija **ne smije** izvesti dodatno čitanje da bi ta dva uzroka
razlikovala.

| Ruta | Nedostajući red nakon autorizacije | Ishod |
|---|---|---:|
| `GET` | otkriven **čitanjem** | **`500 INTERNAL_ERROR`** |
| `PATCH` | otkriven **nulom pogođenih redova** | **`409 VERSION_CONFLICT`** |

Asimetrija je **namjerna**: `PATCH` čuva jednoiskaznu atomičnu optimističku konkurentnost i **ne
uvodi race-prone read-before-write diskriminator**.

**Jedan izvor istine za uspješan odgovor (D-055, klauzule 22–23).** Uspjeh je **`200 OK`** sa
**istom** zamrznutom osmopoljnom reprezentacijom kao `GET` i **novim jakim** `ETag: "<newVersion>"`,
gdje je `newVersion = oldVersion + 1`. Reprezentacija **i** `ETag` se izvode iz reda koji vraća
**isti** atomičan `UPDATE ... RETURNING` iskaz; **drugo čitanje postavki nije potrebno i ne smije se
uvesti**, jer bi otvorilo prozor u kojem tijelo i validator opisuju dva različita stanja. `version`
se **ne izlaže u tijelu**.

**Razdvajanje conditional headera (D-055, klauzule 24–25).** `If-None-Match` je kanonizovan
**isključivo** za `GET` revalidaciju i **ne smije** učestvovati u odluci o uspjehu `PATCH`-a;
`If-Match` je **jedini** kanal optimističke konkurentnosti. U fazi 4 se **ne uvodi** nijedan
dodatni precondition header.

**Idempotency (D-055, klauzula 31).** Ova ruta **ne zahtijeva** `Idempotency-Key`; token
optimističke konkurentnosti je `If-Match`/`version` (§5.3).

**Cache politika (D-055, dio I).** Repozitorijski široka odluka o `Cache-Control`, `private`,
`no-store` i `Vary: Authorization` je **odgođena u zaseban hardening/governance slice**;
implementacija settings `PATCH`-a je **ne mijenja**.

Runtime write površina baze je **tačno devet** `UPDATE` kolona — sedam poslovnih polja iz tabele
iznad plus `version` i `updated_at` (`02` §20.2b.1). Runtime privilegija `UPDATE (version)` je
prihvaćena kao **minimalan mehanizam** koji ovaj ugovor zahtijeva; **triger, `SECURITY DEFINER`,
privilegovana helper funkcija, izmjena paketa `014` i novi migration paket se ne uvode** (D-053,
klauzula B.5).

**Polja koja pozivalac nikada ne šalje:**

| Polje | Porijeklo |
|---|---|
| `version` | isključivo `If-Match` — **nikada tijelo zahtjeva** |
| `updated_at` | postavlja **server/baza** |
| `updated_by` | **ne prima se**; settings endpoint ga ne piše |

Poslano `version`, `updated_at` ili `updated_by` u tijelu se **odbija**; proizvoljno API polje za
verziju **ne postoji**.

---

# 11. Patient reference API

## POST `/patient-references`

Permission: `patient_reference.create`.

Headers:

```http
Idempotency-Key: ...
```

Request:

```json
{
  "sourceSystem": "MANUAL",
  "externalPatientReference": "LOCAL-12345",
  "birthYear": 1968,
  "sexCode": "F"
}
```

Server:

- HMAC/hash external reference;
- opciono enkriptuje;
- generiše pseudonim;
- nikada ne vraća čisti ID.

**Normativna pojašnjenja (D-060; `02` §2.8, §2.9). Oblik zahtjeva i odgovora se ne mijenja.**

- **Normalizacija.** `externalPatientReference` prolazi profil **`MANUAL` v1** prije bilo kakve
  upotrebe: validan Unicode; odbijanje `NUL` i C0/C1 kontrolnih znakova; uklanjanje vodećeg BOM-a;
  vanjski trim; **NFC**; odbijanje praznog rezultata; **maksimum od `255` UTF-8 bajtova mjeren nad
  finalnim normalizovanim oblikom, neposredno prije UTF-8 HMAC granice** (D-070; `02` §2.8.5) —
  **ne** 255 UTF-16 code unita, **ne** 255 code pointa, **ne** 255 grapheme clustera i **ne**
  pre-NFC brojanje; UTF-8. **Bez `NFKC`, bez
  case-foldinga, bez uklanjanja vodećih nula, bez sažimanja unutrašnjeg whitespacea.** Nevalidan
  ulaz → `422 VALIDATION_ERROR` sa **generičkom porukom koja ne citira vrijednost** (§8).
- **Deterministički token.** Server računa **keyed HMAC-SHA256** nad domenski separisanom kanonskom
  porukom (domen, `practice_id`, `source_system`, normalizovana vrijednost) i perzistira ga kao
  `h1.<64 lowercase hex>`. **Ključ, njegova referenca, verzija i sam token se nikada ne izlažu** —
  ni u odgovoru, ni u Problem Details tijelu, ni u logu. Token **nije** dio nijednog javnog
  odgovora.
- **Pseudonim.** Vraćeni `pseudonym` prati kanonsku v1 sintaksu `P-` + 10 velikih Crockford Base32
  znakova, generisan iz CSPRNG-a i **ni na koji način izveden iz eksternog identifikatora**. Primjer
  u odgovoru ispod je **oblik**, ne fiksni uzorak.
- **Čisti eksterni ID** se **nikada ne vraća** ni na jednom endpointu i **nikada ne logira**
  (`09` §11).

Response `201`:

```json
{
  "id": "uuid",
  "pseudonym": "P-K7M2QX4TB9",
  "birthYear": 1968,
  "sexCode": "F",
  "sourceSystem": "MANUAL",
  "createdAt": "2026-07-18T10:00:00Z"
}
```

**NORMATIVNA POJAŠNJENJA `P5-I4` (D-072, 2026-08-29) — oblik zahtjeva i odgovora iznad se NE
mijenja, i nijedan pasus se ne prepisuje.**

- **`sourceSystem` je obavezan.** Odsutan `sourceSystem` je `422 VALIDATION_ERROR`.
- **`P5-I4` prihvata isključivo `MANUAL`** (`SOURCE_SYSTEM_ACCEPTED = MANUAL_ONLY`,
  `OD-P5-I4-9`). Sintaksno validne, ali u `P5-I4` neprihvaćene vrijednosti — `AXENITA`, `CSV`,
  `FHIR`, `OTHER` — vraćaju **`422 VALIDATION_ERROR`** sa **generičkom, statičnom porukom koja ne
  citira vrijednost** (§8). **Schema enum se ne mijenja**, i **nikakva provider normalizacija se ne
  izmišlja**; profil `AXENITA` ne postoji, a `D-OPEN-009` ostaje `BLOCKED EXTERNAL` (`13` §7).
- **Duplirana eksterna referenca → `409 PATIENT_REFERENCE_ALREADY_EXISTS`** (§8, §8.1;
  `OD-P5-I4-10`). Okidač je **isključivo** povreda jedinstvenosti
  `patient_references_source_external_ref_key` — `unique (practice_id, source_system,
  external_patient_ref_hash)`. **Nema uspješnog `200` fallbacka**, **nema otkrivanja postojećeg
  reda** (ni `id`, ni `pseudonym`, ni `createdAt`), i **nema reupotrebe `IDEMPOTENCY_CONFLICT`**.
- **Nema pre-read oracle-a.** Postojanje se utvrđuje **isključivo** iz greške baze; nijedan
  `SELECT` „da li ovo već postoji" ne prethodi `INSERT`-u — ni za eksternu referencu, ni za
  pseudonim. Kolizija pseudonima se rješava **ciljanim `ON CONFLICT` retryjem** sa najviše
  **`PSEUDONYM_INSERT_MAX_ATTEMPTS = 5`** kandidata, a iscrpljenje pokušaja je
  **`500 INTERNAL_ERROR`** sa statičnim tijelom (`OD-P5-I4-1`, `OD-P5-I4-2`).

**Ovo su ugovorna pojašnjenja, ne implementacija.** `P5-I4` je `NEXT` / `DEPENDENCY-SATISFIED` /
`NOT AUTHORIZED` / `NOT STARTED`. Vidi D-072 u `06`.

## GET `/patient-references/{id}`

Permission: `patient_reference.read`.

Ne vraća external plaintext.

**Oblik odgovora — objavljeno (D-062, Dio H.1).** Tijelo `200` odgovora je **identično tijelu
`201` odgovora `POST /patient-references`**:

```json
{
  "id": "uuid",
  "pseudonym": "P-K7M2QX4TB9",
  "birthYear": 1968,
  "sexCode": "F",
  "sourceSystem": "MANUAL",
  "createdAt": "2026-07-18T10:00:00Z"
}
```

`external_patient_ref_hash` je **odsutan iz svakog odgovora po dizajnu** (D-060, klauzula 38).

**Lifecycle `patient_references` u Fazi 5:** kreiraj jednom, čitaj, **nikada ne mijenjaj, nikada ne
arhiviraj, nikada ne briši.** Nema `PATCH`, nema `version`, nema `archived_at`, nema `status` i
nema delete rute. `UPDATE` grant se u Fazi 5 **ne dodjeljuje** (`02` §29.5).

**NORMATIVNA POJAŠNJENJA `P5-I4A` (D-073, 2026-08-29) — oblik odgovora iznad se NE mijenja,
nijedan pasus se ne prepisuje, i nijedan raniji primjer se ne briše.**

### Malformisan `{id}` — odbijanje prije čitanja baze

```text
MALFORMED_PATIENT_REFERENCE_ID = 400 VALIDATION_ERROR
MALFORMED_RESOURCE_UUID_DB_READS = 0
```

Sintaksno malformisan `{id}` — po **postojećoj repozitorijskoj UUID-shape semantici**, bez novih
ograničenja verzije ili varijante UUID-a i **bez nove zavisnosti** — vraća **`400
VALIDATION_ERROR`** (§8, §9) **prije ikakvog resource lookupa**.

- **statično Problem Details tijelo**;
- **`id` se ne odražava** — ni cijel, ni skraćen, ni kao prefiks ili sufiks;
- **nikakav namjenski field error** uveden samo za ovaj slučaj;
- **nijedno čitanje `patient_references` reda**, ni tenant-scoped ni bilo kakvo drugo;
- **nikakav cross-tenant lookup**;
- **nikakav novi error kod** — `VALIDATION_ERROR` već postoji u stabilnom katalogu (§8).

### Zaštićeni `404` par — nepromijenjen

```text
CROSS_TENANT_PATIENT_REFERENCE_GET = 404 RESOURCE_NOT_FOUND
```

| Slučaj | Ishod |
|---|---|
| validan UUID + **nepostojeća** patient reference | **`404 RESOURCE_NOT_FOUND`** |
| validan UUID + patient reference **druge ordinacije** | **`404 RESOURCE_NOT_FOUND`** |

Ta dva slučaja moraju ostati **osmotrivo nerazlučiva** — identično tijelo, kod, poruka, zaglavlja i
mjerljivo ponašanje. **Malformisana sintaksa je izvan ovog para**, jer je greška formata
saznatljiva **prije** upita nad resursom i **ne otkriva postojanje nijednog reda**; **nikakav
existence oracle se ne stvara** (`09` §18.1, `T1`).

### `createdAt` — egzaktan javni wire format

```text
PATIENT_REFERENCE_CREATED_AT_FORMAT = UTC_ISO8601_MILLISECONDS_Z
PATIENT_REFERENCE_CREATED_AT_SERIALIZER = DATE_TO_ISO_STRING
```

Kanonski oblik je

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

sa **`.toISOString()` semantikom**: **UTC**, **terminalno veliko `Z`**, **tačno tri decimalne
cifre**, **milisekunde očuvane**, i **`.000` emitovano za punu sekundu**. **Bez `+00:00`**, **bez
locale renderinga**, **bez javnog timestampa sa šest decimalnih cifara** i **bez izmišljenog
mikrosekundnog API formata**.

```text
puna sekunda    2026-07-18T10:00:00.000Z
milisekunde     2026-07-18T10:00:00.123Z
```

**Pojašnjenje postojećih primjera iznad.** Primjer `"createdAt": "2026-07-18T10:00:00Z"` u `201` i
`200` tijelima iznad je **ilustrativan UTC ISO timestamp**, a **ne bytewise zabrana decimalnih
sekundi**. **Stvarni javni serijalizacijski ugovor definiše D-073**; isti instant se u kanonskom
wire obliku emituje kao **`2026-07-18T10:00:00.000Z`**. Postojeći primjeri **ostaju netaknuti** i
ne prepisuju se.

**Baza naspram javne preciznosti.** `patient_references.created_at` ostaje **`timestamptz(6)`**
(`02` §11). **D-073 ne mijenja nijedan DB tip, nijednu schemu i nijednu migraciju**; javna
reprezentacija je **milisekundne** preciznosti i API **ne obećava** očuvanje sub-milisekundne
preciznosti. **Nikakav custom PostgreSQL parser nije potreban.**

**Razdvajanje od audit hash timestampa.** `PATIENT_REFERENCE_CREATED_AT_FORMAT` (tri decimalne
cifre) i `AUDIT_OCCURRED_AT_FORMAT = UTC_RFC3339_6_FRACTIONAL_DIGITS_LAST_3_ZERO` (šest decimalnih
cifara, posljednje tri `000`; D-072, `OD-P5-I4-4`) **nisu konkurentski formati**. Prvi upravlja
**javnom API serijalizacijom** `patient_references.created_at`, drugi **perzistentnom
kanonizacijom hash payloada** `audit_events.occurred_at`. **D-073 ne mijenja D-072 ni `09`.**

### Javni oblik odgovora — tačno šest polja

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

**Nijedan dodatni član ne postoji.** Eksplicitno odsutni su `practiceId`, `updatedAt`, eksterni
identifikator, hash eksternog identifikatora, ciphertext, IV, authentication tag i svaki
enkripcijski metapodatak.

### Tenant admission scope ove rute

```text
PATIENT_REFERENCE_GET_TENANT_SCOPE = HEADER_ONLY
TENANT_ADMISSION_PIPELINE_COUNT = 1
```

Path ove rute **ne nosi identitet ordinacije**, pa se `X-Practice-ID` čita i validira, a **nikakvo
lažno poređenje patha i headera se ne izvodi**. Ruta prolazi kroz **isti jedan**
`TenantRequestPipeline` i **iste** kanonske admission korake (§3.7.1). **Pravila `X-Practice-ID`-a
se ne mijenjaju.** Postojeće rute sa `{practiceId}` u pathu ostaju **`PRACTICE_PATH`** i zadržavaju
kanonsko **`403 ACCESS_DENIED`** pri neslaganju patha i headera.

**Ovo su ugovorna pojašnjenja, ne implementacija.** `P5-I4A` je `NOT AUTHORIZED` / `NOT STARTED`.
Vidi D-073 u `06`.

**STATUSNA ANOTACIJA (D-074, 2026-08-30) — ugovorna pojašnjenja iznad se NE mijenjaju.** D-074
evidentira vlasničku autorizaciju implementacije `P5-I4A`
(`P5-I4A IMPLEMENTATION AUTHORIZATION DECISION = APPROVED`). **Nijedan endpoint, permisija, rola,
polje, error kod, statusni kod, pravilo `X-Practice-ID`-a ni ugovor odgovora se ovom anotacijom NE
mijenja.** Autorizacija postaje operativno efektivna **tek nakon što D-074 bude vlasnički
prihvaćen, kanonski i publikaciono verifikovan**, a implementacija smije početi **tek nakon
zasebnog gatea izvršenja**; rečenica iznad opisuje **pred-D-074 stanje** i **ne prepisuje se**.
**`P5-I4A IMPLEMENTATION STARTED = NO`**; `P5-I4B`, `P5-I4C`, `P5-I5` i `P5-I6` ostaju
**`NOT AUTHORIZED`**. Vidi D-074 u `06`.

### Semantika `instance`-a u odgovoru na malformisan `{id}` (D-075, 2026-08-30)

**Ovo je aditivno normativno pojašnjenje.** Podsekcija „Malformisan `{id}` — odbijanje prije
čitanja baze" iznad se **NE prepisuje**, **nijedan njen zahtjev se ne uklanja**, i **nijedan
raniji primjer Problem Details tijela se ne mijenja**. §8 se **ne mijenja**.

D-075 rješava **tačno jednu** interpretativnu prazninu: da li zabrana odražavanja malformisanog
`{id}`-a obuhvata i **cross-cutting** RFC 9457 član **`instance`**, koji **dijeljeni globalni
Problem Details filter** popunjava **uniformno za svaku rutu** iz **request targeta** (§8, §3.5,
D-008).

```text
MALFORMED_ID_NO_REFLECTION_EXTENDS_TO_SHARED_INSTANCE = NO
```

**Aplikacijski kontrolisane semantičke površine** odgovora `400 VALIDATION_ERROR` na malformisan
`{id}` **moraju ostati statične i nezavisne od ulaza**:

- `type` semantika;
- `title`;
- HTTP status;
- stabilni error `code`;
- `detail`;
- `errors[]` / sadržaj field errora;
- svaki endpoint-specifičan extension član;
- **svaki novouvedeni član odgovora**.

Malformisani identifikator se **ne smije** kopirati, interpolirati, skraćivati, prefiksirati,
sufiksirati, transformisati, enkodirati ni na koji drugi način ponavljati u ijedan **takav
endpoint-autorski** član, i **nikakav namjenski echo identifikatora se ne uvodi**.

**Postojeći cross-cutting request/envelope metapodaci nisu obuhvaćeni tom zabranom:**

| Član | Vlasnik | Ponašanje |
|---|---|---|
| **`instance`** | dijeljeni globalni Problem Details filter | **request target**, uniformno za svaku rutu — **nepromijenjeno** |
| **`requestId`** | zajednička Problem Details / korelacijska infrastruktura (§3.5) | **korelacijski metapodatak**, smije varirati po zahtjevu |

Formulacija „**statično Problem Details tijelo**" iznad se stoga za `P5-I4A` čita kao **statičan
aplikacijski semantički sadržaj greške**, a **ne** kao zahtjev da cijeli RFC 9457 dokument bude
**bajt-identičan preko različitih request targeta i različitih `requestId`-eva**.

```text
STATICAN SEMANTICKI SADRZAJ GRESKE          = OBAVEZNO
BAJT-IDENTICAN CIJELI DOKUMENT PREKO
RAZLICITIH REQUEST TARGETA / REQUEST ID-eva = NIJE OBAVEZNO
```

**Sigurnosna granica ostaje nepromijenjena.** `MALFORMED_RESOURCE_UUID_DB_READS = 0` ostaje na
snazi; **nijedan `patient_references` lookup se za malformisanu sintaksu ne izvodi**; semantički
`400` **ne varira** po postojanju resursa, tenant vlasništvu ni stanju baze; **nikakav existence
oracle se ne stvara** (`09` §18.1, `T1`). Reprodukcija **request targeta koji je pozivalac sam
poslao** nije otkrivanje postojanja i **ne nosi nijednu server-izvedenu informaciju o resursu**.

**Zaštićeni `404` par se ne mijenja.** Kada se za **nepostojeću** i za **cross-tenant** patient
reference koristi **isti request target**, `instance` je **nužno identičan**, jer je request
target identičan; ekvivalencija para se ovim **ne popušta**.

**D-075 ne traži i ne autorizuje** uklanjanje `instance`-a, redakciju `instance`-a,
endpoint-specifično prepisivanje `instance`-a, supstituciju route templatea, izmjenu globalnog
Problem Details filtera, izmjenu postojećeg practice-route ponašanja, novi oblik greške ni novi
error kod. **Ovo je pojašnjenje ugovora, ne implementacija**; **nikakva izmjena koda nije
autorizovana odlukom D-075**, `P5-I4A` implementacijski kandidat ostaje **nekanonski**, a
`P5-I4B`, `P5-I4C`, `P5-I5` i `P5-I6` ostaju **`NOT AUTHORIZED`**. Vidi D-075 u `06`, `04` §7.5a i
`08` §12.10a.

**STATUSNA ANOTACIJA (D-076, 2026-08-30) — cijela sekcija iznad se NE prepisuje.** Ugovorna
pojašnjenja D-073, statusna anotacija D-074 i semantičko pomirenje D-075 ostaju **doslovno na
snazi i nepromijenjeni**. D-076 je **post-merge pomirenje i formalno zatvaranje pod-gatea
`P5-I4A`**; on **ne mijenja nijedan endpoint, permisiju, rolu, polje, error kod, statusni kod,
pravilo `X-Practice-ID`-a ni ugovor odgovora.**

**`GET /api/v1/patient-references/{id}` je implementiran, vlasnički pregledan, prihvaćen, merged i
kanonski na `origin/main`:**

```text
IMPLEMENTATION COMMIT   1d84e2210f81ac5efbc131cb7f3f27971e8a417f
PULL REQUEST            #52   (MERGED)
MERGE COMMIT            1247eea20a07d547a6912ed931c72c5b310a8702
CANONICAL TREE          4d6bd5f6c540c2e4ba01d91f803978b61c2f27dd
REVIEWED BLOBS          29 / 29 BYTE-IDENTICAL
IMPLEMENTATION DRIFT    ZERO
P5-I4A                  IMPLEMENTED / OWNER-ACCEPTED / CANONICAL /
                        PUBLICATION-VERIFIED / VERIFICATION PASS
```

**Formulacije iznad** — „`P5-I4A` je `NOT AUTHORIZED` / `NOT STARTED`",
„`P5-I4A IMPLEMENTATION STARTED = NO`", „implementacija smije početi tek nakon zasebnog gatea
izvršenja" i „`P5-I4A` implementacijski kandidat ostaje **nekanonski**" — opisuju **pred-D-076
stanje**, **historijski su tačne** i **ne prepisuju se**; **mjerodavan je ovaj statusni model.**

**Formalno zatvaranje nije odmah efektivno.** Ono postaje efektivno tek nakon što D-076 sam bude
autorstvom dovršen, nezavisno vlasnički pregledan, vlasnički prihvaćen, objavljen/merged, kanonski
na `origin/main` i post-publikaciono verifikovan.

```text
P5-I4A FORMAL CLOSURE OWNER DECISION = APPROVED
P5-I4A FORMAL CLOSURE EFFECTIVE      = NO      (do ispunjenja sest uslova)
P5-I4B PREFLIGHT ELIGIBLE            = YES     (tek u post-D-076-kanonskom stanju)
P5-I4B IMPLEMENTATION AUTHORIZED     = NO
P5-I4C IMPLEMENTATION AUTHORIZED     = NO
P5-I5  IMPLEMENTATION AUTHORIZED     = NO
P5-I6  IMPLEMENTATION AUTHORIZED     = NO
CURRENT_CHECKLIST                    = 49 / 14
PHASE5_CHECKBOX_TRANSITIONS          = 0
```

**`POST /patient-references` ostaje `P5-I4C` i nije implementiran.** Vidi D-076 u `06`, `04` §7.5a,
`05` §6 i `08` §12.10a.

---

# 12. Encounter API

## POST `/encounters`

Permission: `encounter.create`.

Headers:

```http
Idempotency-Key: encounter-...
```

Request:

```json
{
  "patientReferenceId": "uuid",
  "occurredAt": "2026-07-17T08:30:00+02:00",
  "treatmentDate": "2026-07-17",
  "responsiblePhysicianId": "uuid",
  "guarantorType": "KVG",
  "insuranceContext": "AMBULATORY",
  "specialtyCode": "AIM",
  "patientAgeAtEncounter": 58,
  "patientSexAtEncounter": "F",
  "sourceSystem": "MANUAL",
  "diagnoses": [
    {
      "codingSystem": "ICD-10",
      "code": "I10",
      "isPrimary": true
    }
  ]
}
```

Response `201`:

```json
{
  "id": "encounter-uuid",
  "status": "DRAFT",
  "version": 1,
  "patient": {
    "id": "patient-uuid",
    "pseudonym": "P-K7M2QX4TB9"
  },
  "occurredAt": "2026-07-17T06:30:00Z",
  "treatmentDate": "2026-07-17",
  "createdAt": "2026-07-18T10:02:00Z"
}
```

Headers:

```http
ETag: "1"
```

### `patientReferenceId` — mapiranje greške (D-069, `RULING 2`)

**Cross-tenant ili nepostojeći `patientReferenceId`** obara **`encounters_patient_reference_fk`**
(`23503`). **Ta greška se NE SMIJE mapirati kroz translator odgovornog ljekara.** Ona ostaje
**izvan** uskog izuzetka `23503 → 422` i **propada u kanonsku internal-error putanju** (§9).

**Isključivo `encounters_responsible_physician_membership_fk`** dobija specijalno mapiranje
**`422 VALIDATION_ERROR`**, sa generičkom porukom koja ne citira vrijednost (D-062, Dio D).

**Globalno `23503 → 422` mapiranje ostaje ZABRANJENO.** Razlog nije stilski: iz statusnog koda
klijent ne smije zaključivati o postojanju tuđih `patient_references` redova (`09` §18.1, `T1`).
### Izvedene vrijednosti i vokabulari Faze 5 (D-062, Dio H.3, `OD-P5-D2-11`)

`status` u odgovoru je **izvedeno i uvijek `"DRAFT"`** (§29.1a). `patient.pseudonym` je **obično
čitanje** `patient_references.pseudonym` u istom tenantu, ne dekripcija.

Dvije kolone `encounter_diagnoses` su `NOT NULL`, a **nijedno polje zahtjeva ih ne nosi**. Njihove
ratifikovane vrijednosti pri kreiranju su:

| Kolona | Vrijednost | Obrazloženje |
|---|---|---|
| `review_state` | **`UNREVIEWED`** | jedini smislen član `02` §4.8 za tek zavedenu dijagnozu |
| `source` | **`MANUAL`** | usklađeno sa `integration_provider` literalom koji zahtjev nosi |

**Free-form u v1** — validira se **isključivo dužina i charset na API sloju**, **bez DB `CHECK`-a,
bez enuma i bez ijedne schema izmjene**; vokabular je eksplicitno **neodlučen u v1**:

```text
guarantorType, insuranceContext, sexCode, patientSexAtEncounter,
specialtyCode, diagnosisType
```

`codingSystem` se već vodi kao otvorena eksterna zavisnost (`13` §13) i **ostaje free-form u v1** uz
istu validaciju.

Ovo preslikava precedent `02` §2.11.4 — aplikacijsko sprovođenje dok je vokabular neodlučen, uz
netaknutu schemu. **Kontrast sa statusnim rječnicima dokumenta**, gdje `CHECK` **jest** uveden
(`02` §2.11.4), je **ratifikacija vokabulara**, ne sklonost prema `CHECK`-ovima.

**Kolone bez pisca u Fazi 5 ostaju `NULL` po dizajnu** i **nijedno API polje se ne kreira samo da
bi kolona bila popunjena**: `encounters.external_encounter_ref_*` (nijedno polje zahtjeva ne nosi
eksternu encounter referencu, pa **`encounters` u Fazi 5 ne nosi nikakav ciphertext**),
`encounter_documents.external_document_ref_hash`, `encounter_documents.source_storage_object_id`, i
**cijela tabela `storage_objects`**, koja u Fazi 5 nema pisca i drži nula redova (§13.2 je
`DEFERRED`).

## GET `/encounters`

Permission: `encounter.read`.

Query:

```text
status
treatmentDateFrom
treatmentDateTo
responsiblePhysicianId
patientPseudonym
hasBlockingFindings
sourceSystem
sort
cursor
limit
```

**`patientPseudonym` — semantika poređenja (D-060, klauzula 16; `02` §2.9.4).** Ulazna vrijednost se
**kanonizuje u velika slova prije obične jednakosne pretrage**. Pseudonim se perzistira velikim
slovima, pa je pretraga obična jednakost nad kolonom. **Baza ne dobija posebnu case-insensitive
semantiku** — `citext`, `LOWER(kolona)` indeks i posebne kolacije se **ne uvode**, i **schema se ne
mijenja** radi ove pretrage. Vrijednost koja ni nakon kanonizacije ne odgovara v1 sintaksi tretira
se kao obična validaciona greška i **ne potvrđuje postojanje nijednog reda**.

Response item — **aktivni oblik Faze 5** (D-061, klauzule 6–10):

```json
{
  "id": "uuid",
  "patientPseudonym": "P-K7M2QX4TB9",
  "treatmentDate": "2026-07-17",
  "status": "REVIEW_REQUIRED",
  "responsiblePhysician": {
    "id": "uuid"
  },
  "latestAnalysis": {
    "id": "uuid",
    "revisionNumber": 1,
    "status": "REVIEW_REQUIRED",
    "billingPath": "TARDOC",
    "openBlockingFindings": 1
  },
  "version": 4
}
```

### `responsiblePhysician` — semantika Faze 5 (D-061)

Ovo je **namjerno sužavanje** ranijeg v1 oblika, izvršeno **prije implementacije** i bez
kompatibilnog shima, po presedanu D-038 (`GET /me`: `role` → `roles[]`). U trenutku sužavanja Faza 5
je `NOT_STARTED`, nijedan produkcijski kod ne implementira ovaj endpoint i nijedan klijent ga ne
konzumira.

- kada `responsible_physician_id` **nije** `NULL`, objekat sadrži **isključivo `id`**;
- **ključ `displayName` je ODSUTAN** — ne emituje se kao `null`, ne kao prazan string i ne kao
  placeholder. Odsutan ključ znači da površina ne postoji; `null` bi tvrdio da ime postoji ali je
  nepoznato;
- kada `responsible_physician_id` **jeste** `NULL`, cijeli objekat je `null`:

```json
"responsiblePhysician": null
```

- query filter **`responsiblePhysicianId` ostaje nepromijenjen** i funkcionalan — filtriranje po
  identifikatoru ne zahtijeva čitanje `users`;
- **nijedan zamjenski identifikator** (inicijali, skraćeno ime, hash imena) se **ne uvodi**;
- serviranje ove liste **ne smije čitati `users`** radi obogaćivanja odgovora.

**Razlog i granica.** `display_name` drugog korisnika je co-member pristup. PostgreSQL RLS bira
**redove, ne kolone**, pa bi svaka politika koja propusti tuđi `users` red učinila čitljivim i
`email` (`02` §17.5, §20.2a; D-047, klauzula 12). Faza 5 zato **ne kupuje** taj pristup. Vlastiti
`email`/`displayName` u `GET /me` (§10) su **caller-self** i ostaju nepromijenjeni.

**Buduće proširenje.** Kompletan v1 oblik smije dodati `displayName` **tek nakon** što imenovani
gate `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (`13` §19) bude zatvoren prihvaćenom odlukom.
Do tada je dodavanje tog ključa **phase-gate defekt**, ne dopuna odgovora.

### Površine bez modela u Fazi 5 (D-062, Dio H.4, `OD-P5-D2-12`)

Blok `latestAnalysis` u primjeru iznad je **kompletan v1 oblik**. **U Fazi 5 se taj ključ
izostavlja u cijelosti** — `analysis_runs` je paket `005`, Faza 7.

- **`latestAnalysis` — ključ ODSUTAN**, ne `null`.
- **approval / export summary — ključ ODSUTAN**, ne `null` (Faza 10 / 11).
- **`hasBlockingFindings` se u Fazi 5 NE REGISTRUJE** kao query parametar — `rule_findings` je
  paket `008`, Faza 9. Nepoznat query parametar se **odbija** (`08` §12, `05` §6). Prihvatiti pa
  ignorisati filter je zabranjeno: vratio bi **širi** skup nego što je pozivalac tražio, tiho.

Obrazloženje je isto ono iz D-061, klauzule 8, uspostavljeno **za ovu istu rutu**: prisutan ključ
sa praznom vrijednošću tvrdio bi da polje postoji a vrijednost je nepoznata; **odsutan ključ tačno
kaže da površina ne postoji.**

### `sort` i `cursor` — vokabular Faze 5 (D-062, Dio H.4)

- **`sort`**: `treatmentDate desc, id desc` — **default i jedina vrijednost** u Fazi 5. Svaka druga
  vrijednost → `400`.
- **`cursor`**: neproziran, kodira **tačno `(treatment_date, id)`** — par koji odgovara sortu i
  garantuje stabilan rep (§7). **Nikada ne kodira pseudonim** — pseudonim je Class C, nije log-safe,
  a cursor je vidljiv klijentu. Nevalidan cursor → `400 INVALID_CURSOR`.

## GET `/encounters/{encounterId}`

Permission: `encounter.read`.

Vraća:

- osnovni encounter;
- pseudonim;
- dijagnoze;
- dokument metadata;
- latest analysis summary;
- approval/export summary;
- ETag.

**Faza 5 (D-062, Dio H.4).** `latest analysis summary` i `approval/export summary` su **kompletan
v1 oblik**; u Fazi 5 se **oba ključa izostavljaju u cijelosti** (odsutni, ne `null`), jer im backing
model ne postoji prije Faza 7–11. **Dokument metadata u Fazi 5 isključuje arhivirane dokumente** —
ista semantika kao lista iz §13.3.

Odgovorni ljekar se i ovdje vraća **isključivo kao identifikator** — ista semantika kao u listi
iznad (D-061, klauzule 6–10). Nijedan endpoint Faze 5 ne vraća `display_name` **drugog** korisnika.

## PATCH `/encounters/{encounterId}`

Permission: `encounter.update`.

Headers — **obavezno** (§5.2):

```http
If-Match: "4"
```

Request je partial DTO. Nije dozvoljeno proizvoljno mijenjati status.

**Tačan skup polja Faze 5 — objavljeno (D-062, Dio H.2, `OD-P5-D2-8`).**

Patchable — **tačno osam**:

```text
occurredAt, treatmentDate, responsiblePhysicianId, guarantorType,
insuranceContext, specialtyCode, patientAgeAtEncounter, patientSexAtEncounter
```

**Nije patchable — normativno:**

```text
status, patientReferenceId, sourceSystem, version, diagnoses[],
svaki id, svaki timestamp, svaka actor kolona (created_by, updated_by)
```

- Dozvoljen **isključivo u nefinalnim stanjima**; u Fazi 5 to su `DRAFT` i `READY_FOR_ANALYSIS`.
  Iz `CANCELLED` → `409 INVALID_STATE_TRANSITION`.
- **`patientReferenceId` nije patchable** — inače bi se encounter mogao tiho prepokazati na drugog
  pacijenta nakon što su dokumenti već zavedeni.
- **`diagnoses[]` nisu patchable u Fazi 5** — `02` §18.1 ne dodjeljuje `DELETE` nad
  `encounter_diagnoses` ni u v1, a Faza 5 nema ni `UPDATE` grant nad tom tabelom.
- **Promjena `responsiblePhysicianId` se revalidira istim composite FK-om** kao pri kreiranju
  (D-062, Dio D); cross-practice vrijednost → `422 VALIDATION_ERROR` sa generičkom porukom koja ne
  citira vrijednost.
- Sprovodi se **dvostruko**: aplikacijskom allowlistom **i** column-level `UPDATE` grantom
  (`02` §29.5), koji `patient_reference_id` i `source_system` uskraćuje na nivou privilegije.

Response `200` vraća novi `ETag`. Bez `If-Match` → `428 PRECONDITION_REQUIRED`; stale
`If-Match` → `409 VERSION_CONFLICT`.

**Mehanika write putanje — objavljeno (D-069, `RULING 2`).** `PATCH` se izvršava kao **jedan
atomičan optimistički `UPDATE`**, po presedanu D-055 (klauzule 16, 19–21; §10, *Mehanika
optimističkog update-a*):

- predikat nosi **`practice_id = <uspostavljeni tenant>`** i **`version = <očekivana verzija iz
  `If-Match`-a>`**;
- **diskriminirajući aplikacijski pre-read nije dozvoljen** — nijedno čitanje prije upisa ne smije
  odlučivati postoji li red, je li vidljiv ni je li verzija tekuća;
- **nula pogođenih redova ima tačno jedan ishod:**

| Uzrok nule pogođenih redova | Status | Code |
|---|---:|---|
| zastarjela verzija | **`409`** | **`VERSION_CONFLICT`** |
| red **ne postoji** | **`409`** | **`VERSION_CONFLICT`** |
| red je **tenant-nevidljiv** | **`409`** | **`VERSION_CONFLICT`** |

**Write putanja ta tri uzroka NE razlikuje**, i **`404 RESOURCE_NOT_FOUND` se na `PATCH`-u ne
vraća.** Asimetrija prema `cancel` ruti je **namjerna**: `PATCH` čuva jednoiskaznu atomičnu
optimističku konkurentnost i **ne uvodi race-prone read-before-write diskriminator**.

## POST `/encounters/{encounterId}/cancel`

Permission: `encounter.cancel`.

Idempotency key.

Request:

```json
{
  "reason": "Doppelt importierter Kontakt."
}
```

Dozvoljena stanja (normativno §29.1):

- `DRAFT`;
- `READY_FOR_ANALYSIS`;
- `ANALYSIS_IN_PROGRESS`;
- `REVIEW_REQUIRED`.

Iz bilo kojeg drugog stanja → `409 INVALID_STATE_TRANSITION`.

**Razlikovanje `404` i `409` — objavljeno (D-069, `RULING 2`).** Ova ruta **razlikuje** dva
slučaja, i to razlikovanje je dio ugovora:

| Slučaj | Status | Code |
|---|---:|---|
| encounter je **vidljiv** u tekućem tenantu, ali tranzicija/stanje nije dozvoljeno | **`409`** | **`INVALID_STATE_TRANSITION`** |
| encounter **ne postoji** ili je **tenant-nevidljiv** | **`404`** | **`RESOURCE_NOT_FOUND`** |

**Implementacija tu razliku mora dobiti race-free.** **Opšti read-before-write existence oracle
NIJE ovlašten.** Preferirana pozicija je **jedan ograničen atomičan SQL iskaz / CTE** — ili
ekvivalentan database-side oblik iskaza — **unutar iste admitovane tenant transakcije**. Usko
ograničen naknadni iskaz dozvoljen je **isključivo** ako implementacija dokaže da je nužan **i**
ako očuva istu semantiku: ista transakcija, tenant-filtrirano, bez enumeracije. **Nijedan
generički cross-tenant existence oracle nije ovlašten** — on bi bio cross-tenant enumeracijski
kanal (`09` §18.1, `T1`).

**`409 VERSION_CONFLICT` se na ovoj ruti ne koristi**: `cancel` nema `If-Match` ugovor (§5.3).

**U Fazi 5 dosežna su isključivo prva dva** — `ANALYSIS_IN_PROGRESS` i `REVIEW_REQUIRED` traže
analizu, koja postoji tek od Faze 7 (§29.1a; D-062, Dio F).

**Perzistencija `reason` polja — objavljeno (D-062, Dio F.3).** **`encounters` nema kolonu za
razlog i ona se ne uvodi.** `reason` se zapisuje **isključivo u audit trag** i **mora biti
sanitizovan prije zapisa**, jer je slobodan tekst i može sadržavati PHI (`02` §15.4, `09` §11;
D-060, klauzula 39). **Ne vraća se ni u jednom odgovoru** i **ne logira se u sirovom obliku.**

### Kaskada iz `ANALYSIS_IN_PROGRESS` (D-035)

Komanda **atomarno** otkazuje tekuću aktivnu analizu, pa encounter.

**Tekuća aktivna analiza** je:

- **dijete-bez-djeteta vrh linearnog lanca revizija** (D-034, §15.3);
- čiji je status jedan od aktivnih async statusa iz §15.4 — `QUEUED`, `PREPARING_INPUT`,
  `EXTRACTING`, `EVALUATING_TARIFF`, `APPLYING_SAFETY_RULES`.

Pravila:

- **otkazuje se isključivo ta tekuća aktivna analiza**;
- **historijske i terminalne revizije ostaju nepromijenjene** — `REJECTED`, `FAILED`,
  `SUPERSEDED`, `EXTRACTION_FAILED`, `TARIFF_EVALUATION_FAILED` i ranije `CANCELLED`
  revizije zadržavaju svoj status;
- otkazivanje analize i otkazivanje encountera kreiraju **dva odvojena audit eventa**;
- **ako otkazivanje aktivne analize ne uspije, kompletno otkazivanje encountera se
  rollback-uje**;
- **djelimičan uspjeh nije dozvoljen** — ili obje tranzicije prođu, ili nijedna.

Autorizacija:

- **`encounter.cancel` autorizuje kompletnu komandu i njenu internu kaskadu**;
- **`analysis.cancel` se ne traži dodatno** za internu kaskadu.

Podobne role (D-042; matrica u `15`): `encounter.cancel` — `PHYSICIAN` **ALLOW**, sve ostale
**DENY**; `analysis.cancel` — `PHYSICIAN` i `MPA` **ALLOW**, sve ostale **DENY**. Kaskada ne
uvodi dodatnu provjeru permisije (§28.4, §3.7.4).

`CANCELLED` je terminalno. `CANCELLED → CLOSED` ne postoji.

## POST `/encounters/{encounterId}/close`

Permission: `encounter.close`.

Podobne role (D-044; matrica u `15`): `PRACTICE_ADMIN` **ALLOW**, `PHYSICIAN` **ALLOW**,
`BILLING_SPECIALIST` **ALLOW**; `MPA`, `AUDITOR`, `READ_ONLY` i `SYSTEM_ADMIN` **DENY**.

Dozvoljeno **isključivo iz `EXPORTED`** (normativno §29.1):

```text
EXPORTED → CLOSED
```

Iz bilo kojeg drugog stanja → `409 INVALID_STATE_TRANSITION`. Nijedan close poziv ne
zaobilazi export, a export ne zaobilazi approval (§21).

`CLOSED` je terminalno.

---

# 13. Document API

## 13.1 Aktivna putanja — manuelni tekst

U aktivnom v1 scopeu dokument se kreira isključivo kao tekst.

## POST `/encounters/{encounterId}/documents/text`

Permission: `encounter.document.create`.

Headers: Idempotency-Key.

Request:

```json
{
  "documentType": "CONSULTATION_NOTE",
  "languageCode": "de-CH",
  "text": "Anamnese: ...",
  "redactBeforeAiProcessing": true
}
```

Response `201`:

```json
{
  "id": "document-uuid",
  "documentType": "CONSULTATION_NOTE",
  "source": "MANUAL_TEXT",
  "processingStatus": "READY",
  "redactionStatus": "COMPLETED",
  "sourceTextHash": "sha256",
  "redactedTextHash": "sha256",
  "createdAt": "..."
}
```

**Normativna pojašnjenja (D-060; `02` §2.10, §2.11). Oblik zahtjeva i odgovora se ne mijenja.**

### Maksimalna veličina teksta

Maksimum je **256 KiB UTF-8** za polje `text`.

- primjenjuje se na **dekodirani tekst zahtjeva, prije normalizacije**;
- prekoračenje → **`422 VALIDATION_ERROR`**, nikada `413` (§9, §13.2);
- **tekst se nikada ne skraćuje** — ni pri ulazu, ni pri normalizaciji, ni pri pohrani;
- **tekst se nikada ne vraća** u validacionom odgovoru ni u logu (`09` §11);
- **i izlaz normalizacije** mora ostati unutar istog maksimuma;
- ako bi normalizacija proizvela nevalidan rezultat (prazan tekst, zabranjeni kontrolni znak,
  prekoračena veličina), zahtjev se **odbija**, a tekst se **ne mijenja dodatno**.

### Redoslijed obrade

```text
dekodirani request text
  -> normalizacija (02 §2.10.2)
  -> source_text_hash = lowercase hex SHA-256 normalizovanog UTF-8
  -> enkripcija i pohrana normalizovanog teksta (02 §2.7)
  -> deterministička redakcija (phase5-basic-v1)
  -> redacted_text_hash
  -> enkripcija i pohrana redigovanog teksta
```

Normalizacija je **minimalna i semantički lossless**: `CRLF`/`CR` → `LF`, **NFC**, vanjski trim
cijelog dokumenta, odbijanje `NUL` i C0/C1 kontrolnih znakova osim `LF` i `TAB`. Očuvani su
veličina slova, interpunkcija, unutrašnji whitespace, tabovi, prazni redovi, jedinice, doziranja,
datumi i klinički simboli. **`NFKC` se ne koristi.** Redoslijed operacija je dio ugovora o
hashovanju.

### `redactBeforeAiProcessing`

```text
true   -> prihvaćeno
false  -> 422 VALIDATION_ERROR
```

Kanonski tokovi rediguju **bezuslovno**; nijedna kolona ne perzistira ovu politiku kao trajno
svojstvo dokumenta, pa bi prihvatanje `false` proizvelo nedefinisanu semantiku `view=redacted` i
moglo potkopati D-043. Polje **ostaje u zahtjevu**; ograničen je **skup prihvaćenih vrijednosti**.
**`SKIPPED` status se ne uvodi.**

### Statusi u odgovoru

```text
processingStatus   READY | FAILED
redactionStatus    COMPLETED | FAILED
```

`COMPLETED` znači **isključivo** da je konfigurisani deterministički ruleset Faze 5 izvršen
uspješno. **Ne tvrdi** anonimizaciju, de-identifikaciju ni odsustvo svih identifikatora; sadržaj
ostaje Class A (`09` §2). Pri `redactionStatus = FAILED` `redactedTextHash` izostaje, a
`view=redacted` **ne vraća** normalizovani tekst (§13.3).

Deterministička redakcija Faze 5 pokriva e-mail, `http`/`https`/`www.` URL-ove, validiran AHV/AVS,
validiran IBAN, eksternu referencu pacijenta iz tekućeg zahtjeva i **strogo prepoznat** švicarski
telefonski broj. **Ne pokriva** imena, adrese, dijagnoze, simptome, lijekove, doziranja, mjerenja,
medicinski nužne datume ni kliničke nalaze (D-060, klauzula 26).

**Obuhvat v1 — precizacija (D-070, 2026-08-28).** `phase5-basic-v1` **ne tvrdi** zasebnu klasu
identifikatora osiguranja/kartice — ni generički identifikator osiguranja, ni identifikator kartice
osiguranja, ni **`VeKa`**, ni broj članstva/kartice. `AHV`/`AVS` je **jedina** validirana
identifikatorska klasa te vrste u v1; uslovna formulacija iz D-060, klauzule 24 („isključivo tamo
gdje je kanonski definisan uzorak") **nikada nije dobila kanonski uzorak**, pa je uslov neispunjen.
Buduće dodavanje traži **novu verziju ruleseta** (npr. `phase5-basic-v2`) uz vlasničko odobrenje.
**„Strogo prepoznat" znači tačnu, potpuno nabrojanu v1 sintaksu** (D-070, `RULING 5`): međunarodno
`+41`/`0041` uz **tačno 9** cifara, kompaktno ili grupisano jednim konzistentnim separatorom
(`XX XXX XX XX` ili `XX-XXX-XX-XX`); nacionalno **isključivo** uz neposrednu oznaku `Tel`, `Tel.`,
`Telefon`, `Mobile`, `Natel` ili `Fax` (case-insensitive, uz whitespace i opciono jednu `:`), pa
`0` + **tačno 9** cifara ili `0XX XXX XX XX` / `0XX-XXX-XX-XX`; prva cifra područja je `1`–`9`, a
kandidat **ne smije** biti podniz dužeg decimalnog niza. **Goli nacionalni brojevi bez oznake,
oblici sa tačkama, `(0)` varijante i miješani separatori se NE rediguju**, i **fallback generički
telefonski regex se ne primjenjuje**. Implementaciju ruleseta posjeduje **`P5-I6`**, ne `P5-I3`
(D-070, `RULING 1`).

## 13.2 Upload putanja — DEFERRED

Sljedeća dva endpointa su **DEFERRED** i nisu dostupna u aktivnom v1. `413` i `415` iz §9
pripadaju isključivo ovoj putanji.

Presigned upload se **ne** vraća u aktivni scope bez nove odluke.

## POST `/encounters/{id}/documents/upload-url` — **DEFERRED**

Permission: `encounter.document.create`.

Request:

```json
{
  "filename": "konsultation.pdf",
  "contentType": "application/pdf",
  "byteSize": 248392,
  "documentType": "CONSULTATION_NOTE"
}
```

Response:

```json
{
  "uploadId": "uuid",
  "storageObjectId": "uuid",
  "uploadUrl": "signed-url",
  "expiresAt": "...",
  "requiredHeaders": {
    "Content-Type": "application/pdf"
  }
}
```

## POST `/encounters/{id}/documents/{documentId}/complete` — **DEFERRED**

Permission: `encounter.document.create`.

Request:

```json
{
  "sha256": "..."
}
```

Server provjerava size/hash/MIME/antivirus prema konfiguraciji.

## 13.3 Aktivni read i archive endpointi

## GET `/encounters/{id}/documents`

Permission: `encounter.document.list`.

**Filtriranje arhive — objavljeno (D-062, Dio G.5, `OD-P5-D2-10`).** Lista **isključuje**
dokumente sa `archived_at IS NOT NULL`. Arhiviranje je u `03` §13.3 opisano kao "**Umjesto DELETE
nakon analize**" — zamjena za brisanje mora ukloniti red iz aktivnog radnog skupa, inače ništa ne
zamjenjuje.

**`includeArchived` parametar se NE uvodi** — to bi bila dopuna API ugovora koja traži vlastitu
odluku. Nepoznat query parametar se odbija.

**Neuspjeli dokumenti JESU listabilni.** Dokument sa `redactionStatus = FAILED` je običan red pod
tenant politikom: metapodaci su vidljivi, i **isključivo** `view=redacted` odbija (niže).

## GET `/encounters/{id}/documents/{documentId}`

Permission: `encounter.document.read`.

Query:

```text
view=redacted|original
```

`view=original` dodatno zahtijeva **`encounter.document.read_original`** i kreira
`DOCUMENT_VIEWED` audit event. Bez te permisije zahtjev pada na `403 ACCESS_DENIED`.

**Kanonska definicija pogleda (D-060, klauzule 34 i 32).**

- **`view=original`** = **dekriptovan, neredigovan, kanonski normalizovan** tekst dokumenta. To
  **nije** obećanje tačnih sirovih HTTP/request bajtova: kanonska schema **ne perzistira**
  pre-normalizacioni sirovi manuelni tekst (`02` §2.10.1). Parametar se **ne preimenuje** i kolona
  za sirovi tekst se **ne uvodi**.
- **`view=redacted`** = dekriptovan **redigovani** tekst. Kad je `redactionStatus = FAILED`,
  redigovani artefakt **ne postoji** i pogled **NE SMIJE pasti nazad** na normalizovani ni
  originalni tekst — fallback bi bio tiho zaobilaženje `encounter.document.read_original`.
- Ponašanje permisija iz **D-043 ostaje nepromijenjeno**: `view=redacted` traži običnu permisiju
  čitanja dokumenta, `view=original` **dodatno** `encounter.document.read_original` uz
  `DOCUMENT_VIEWED` audit.
- Nijedan pogled ne izlaže eksterni ID, HMAC token ni materijal ključa.

**Detaljna ruta i arhiva (D-062, Dio G.5).** Za razliku od liste, detaljna ruta **i dalje vraća
arhivirani dokument**, sa prisutnim `archivedAt`. Time red ostaje dosežan za audit — što stvarno
brisanje ne bi bilo.

**Statusi u Fazi 5 (D-062, Dio G).** `processingStatus` je u Fazi 5 **uvijek `READY`**: jedina
aktivna putanja kreiranja je manuelni tekst, a neuspjela normalizacija se odbija sa `422` i **ne
kreira red** (D-060, klauzula 35). `FAILED` procesiranje postaje dosežno tek kad se odmrzne upload
putanja (§13.2). Kolona, vokabular i testovi ostaju.

Dosežne kombinacije u Fazi 5 su **tačno dvije**: `READY`/`COMPLETED` (normalna putanja) i
`READY`/`FAILED` (redakcija neuspjela, redigovani artefakti `null`). Kombinacija
`FAILED`/`COMPLETED` je **logički nemoguća** i odbija se.

**Retry redakcije nema rutu u Fazi 5** (D-062, `OD-P5-D2-9`). Ugovor iz D-060, klauzule 32 —
ponavljanje pod istom verzijom ruleseta uz svjež IV — **ostaje nepromijenjen i neopozvan**; odgađa
se isključivo **površina**. Posljedično `encounter_documents` dobija `UPDATE` **isključivo nad
`archived_at`** (`02` §29.5), pa su sve ostale kolone nakon `INSERT`-a nezapisive na nivou
privilegije.

## POST `/encounters/{id}/documents/{documentId}/archive`

Permission: `encounter.document.archive`.

Umjesto DELETE nakon analize.

**Semantika — objavljeno (D-062, Dio G.5, `OD-P5-D2-10`).**

- Postavlja `archived_at`. **Nijedna statusna vrijednost se ne mijenja** — `ARCHIVED` ne postoji ni
  u jednom rječniku (`02` §2.11).
- **Ponovno arhiviranje već arhiviranog dokumenta je idempotentan uspjeh**, ne `409`.
- **Restore ruta ne postoji i ne uvodi se.**
- **Arhiva nikada ne smije postati RLS predikat** (`02` §29.4) — u politici bi sakrila redove od
  audita i učinila stanje nepovratnim.
- **Fizičko brisanje ne postoji nigdje u Fazi 5**, i **nijedna delete ruta se ne izmišlja**.
  Retenciona i pravna pitanja (`09` §20, `D-OPEN-007`) **ostaju otvorena** i ovom odlukom se **ne
  zatvaraju**.

---

# 14. Analysis creation

## POST `/encounters/{encounterId}/analyses`

Permission: `analysis.run`.

Headers: Idempotency-Key.

Request:

```json
{
  "tariffReleaseId": "uuid",
  "reason": "INITIAL_REVIEW",
  "options": {
    "runAiExtraction": true,
    "runTariffMatcher": true,
    "runSafetyRules": true
  }
}
```

Preconditions:

- encounter nije CANCELLED/CLOSED;
- ima potreban dokument;
- nema aktivne analysis job revizije;
- tariff release je dozvoljen;
- practice AI setting dopušta AI kada je option true.

Response `202`:

```json
{
  "analysisId": "uuid",
  "jobId": "uuid",
  "status": "QUEUED",
  "revisionNumber": 1,
  "links": {
    "analysis": "/api/v1/analyses/uuid",
    "job": "/api/v1/jobs/uuid"
  }
}
```

---

# 15. Analysis read API

## GET `/analyses/{analysisId}`

Permission: `analysis.read`.

Summary response:

```json
{
  "id": "uuid",
  "encounterId": "uuid",
  "revisionNumber": 1,
  "status": "REVIEW_REQUIRED",
  "tariffRelease": {
    "id": "uuid",
    "releaseCode": "MOCK-2026-1"
  },
  "progress": {
    "step": "COMPLETED",
    "percent": 100,
    "messageCode": "ANALYSIS_COMPLETED"
  },
  "summary": {
    "billingPath": "TARDOC",
    "candidateCount": 4,
    "tariffItemCount": 3,
    "openCriticalFindings": 0,
    "openBlockingErrors": 1,
    "openWarnings": 2
  },
  "createdAt": "...",
  "completedAt": "..."
}
```

## GET `/analyses/{analysisId}/workspace`

Permission: `analysis.read`.

Agregirani UI endpoint:

```json
{
  "analysis": {
    "id": "uuid",
    "revisionNumber": 1,
    "status": "REVIEW_REQUIRED",
    "applicationVersion": "1.0.0",
    "rulesetVersion": "2026.1"
  },
  "encounter": {
    "id": "uuid",
    "patientPseudonym": "P-K7M2QX4TB9",
    "treatmentDate": "2026-07-17",
    "responsiblePhysician": {
      "id": "uuid",
      "displayName": "Dr. Muster"
    }
  },
  "documents": [],
  "facts": [],
  "serviceCandidates": [],
  "tariffEvaluation": {
    "billingPath": "TARDOC",
    "selectedFlatRateCode": null,
    "items": [],
    "messages": []
  },
  "findings": [],
  "review": {
    "canApprove": false,
    "blockingReasons": [
      "OPEN_BLOCKING_ERROR"
    ],
    "requiredAcknowledgements": []
  },
  "auditSummary": {
    "lastActionAt": "...",
    "eventCount": 14
  }
}
```

Original/raw matcher JSON nije dio običnog workspace responsea.

### `encounter.responsiblePhysician.displayName` — polje pod obaveznim gateom (D-061, klauzule 14–16)

Gornji oblik je **zamrznut kompletan v1 oblik**, ne oblik koji je već implementabilan. Polje
`encounter.responsiblePhysician.displayName` vraća `display_name` **drugog** korisnika i time je
**co-member pristup**, koji je u v1 `DENY / NOT IMPLEMENTED` (D-047, klauzula 12).

Ovaj endpoint je **tekući prvi poznati konzument** tog pristupa. Vlasnička faza je **Faza 8 — Mock
AI/Tariff** (`04` §10.3; `05` §9). Prije njegove implementacije **mora** biti ponovo otvoren i
prihvaćenom odlukom zatvoren imenovani gate:

```text
BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS
```

Do tada vrijedi, bez izuzetka: nema treće `users` politike; nema proširenja `users` column granta;
nema proširenja `practice_memberships` RLS-a ni granta; nema denormalizacije `display_name`; nema
`SECURITY DEFINER` lookupa; nema drugog Prisma klijenta (`13` §19.4; D-061, klauzula 11).

Ako **bilo koji raniji** endpoint stekne prihvaćen zahtjev da vrati ime drugog korisnika, gate se
otvara **tada** — vrijedi pravilo **šta prije nastupi**.

### Uslovni `tariffEvaluation` blok (D-026, klauzula 6)

Endpoint zahtijeva `analysis.read`. Blok `tariffEvaluation` se uključuje **samo** ako
pozivalac ima i `tariff_evaluation.read`.

Bez te permisije blok se **izostavlja**, a response sadrži marker:

```json
{
  "analysis": {},
  "findings": [],
  "redacted": ["tariffEvaluation"]
}
```

Razlika je normativna:

| Oblik | Značenje |
|---|---|
| `"redacted": ["tariffEvaluation"]`, bez `tariffEvaluation` ključa | evaluacija postoji, ali pozivalac je ne smije vidjeti |
| `"tariffEvaluation": null` | evaluacija još ne postoji |

Klijent ne smije tretirati ta dva slučaja jednako.

## POST `/analyses/{analysisId}/revisions`

Permission: `analysis.run`.

Headers: Idempotency-Key.

Request:

```json
{
  "reason": "Konsultationsdauer ergänzt.",
  "reuseConfirmedFacts": true,
  "reuseManualCorrections": true
}
```

Server mora eksplicitno definisati šta se prenosi. AI/tariff rezultat se ne kopira kao validan rezultat.

### Dozvoljeni status roditelja

Normativno §29.2.

| Status roditelja | Dozvoljeno | Roditelj nakon komande |
|---|:-:|---|
| `REVIEW_REQUIRED` | da | **`SUPERSEDED`** |
| `COMPLETED` | da | **`SUPERSEDED`** |
| `REJECTED` | da | `REJECTED` — zadržan |
| `FAILED` | da | `FAILED` — zadržan |
| `EXTRACTION_FAILED` | da | `EXTRACTION_FAILED` — zadržan |
| `TARIFF_EVALUATION_FAILED` | da | `TARIFF_EVALUATION_FAILED` — zadržan |
| `CANCELLED` | da | `CANCELLED` — zadržan |
| `QUEUED` | ne | `409 INVALID_STATE_TRANSITION` |
| `PREPARING_INPUT` | ne | `409 INVALID_STATE_TRANSITION` |
| `EXTRACTING` | ne | `409 INVALID_STATE_TRANSITION` |
| `EVALUATING_TARIFF` | ne | `409 INVALID_STATE_TRANSITION` |
| `APPLYING_SAFETY_RULES` | ne | `409 INVALID_STATE_TRANSITION` |
| `SUPERSEDED` | ne | `409 INVALID_STATE_TRANSITION` |
| `APPROVED` | ne | `409 INVALID_STATE_TRANSITION` — approval se prvo revoke-a u `REVIEW_REQUIRED` (§20) |

Kreiranje child revizije **ne prepisuje** terminalni status roditelja (D-015, D-031).

### Child revizija

Dijete dobija:

- `parentAnalysisRunId` — referenca na roditelja;
- `revisionNumber` — inkrementiran za 1;
- novi `analysisId`.

Veza dijete → roditelj je vidljiva bez obzira na status roditelja.

### Linearni lanac revizija (D-034)

Historija revizija je **linearni lanac, ne stablo**. Invarijante:

- svaka revizija ima **najviše jedno direktno dijete**;
- inicijalna revizija ima `revisionNumber = 1` i **nema roditelja**;
- svaka kasnija revizija ima **non-null roditelja**;
- dijete i roditelj pripadaju **istom practiceu i istom encounteru**;
- `revisionNumber` djeteta je uvijek **`roditelj.revisionNumber + 1`**;
- **retry nikada ne preračunava `MAX(revisionNumber)`**;
- `parentAnalysisRunId` i `revisionNumber` su **immutable nakon INSERT-a**.

### Redoslijed serverskih koraka

Server izvršava sljedeće **atomarno i tim redom**:

1. zaključava roditelja;
2. provjerava da li dijete već postoji;
3. validira status roditelja;
4. ažurira roditelja kada je supersession potrebna;
5. alocira `roditelj.revisionNumber + 1`;
6. inserta dijete.

Provjera postojanja djeteta (korak 2) **prethodi** validaciji statusa (korak 3). Zbog toga je
kod greške deterministički i ne zavisi od statusa roditelja.

### Ishodi

| Uslov | Status | Kod |
|---|---:|---|
| dijete već postoji | **409** | **`REVISION_CONFLICT`** — bez obzira na status roditelja |
| dijete ne postoji, status roditelja nije dozvoljen | **409** | `INVALID_STATE_TRANSITION` |
| dijete ne postoji, status roditelja je dozvoljen | **202** | novokreirana child revizija |

Uniqueness konflikt koji prijavi baza **prevodi se u `REVISION_CONFLICT`**, nikada u
generičku `500` grešku.

**Retry nikada ne kreira reviziju N+2 od istog roditelja.**

Isti `Idempotency-Key` na oba zahtjeva daje isti poslovni rezultat (§4) i ne ulazi u trku.

## POST `/analyses/{analysisId}/cancel`

Permission: `analysis.cancel`.

Dozvoljeno isključivo iz aktivnih async stanja (normativno §29.2):

- `QUEUED`;
- `PREPARING_INPUT`;
- `EXTRACTING`;
- `EVALUATING_TARIFF`;
- `APPLYING_SAFETY_RULES`.

Rezultat: `CANCELLED`.

| Slučaj | Status | Ponašanje |
|---|---:|---|
| iz dozvoljenog aktivnog stanja | `202` | analiza prelazi u `CANCELLED` |
| analiza je već `CANCELLED` | `200` | vraća postojeću cancelled reprezentaciju, **bez promjene stanja** |
| terminalno stanje koje nije `CANCELLED` | `409` | `INVALID_STATE_TRANSITION`, bez promjene stanja |

Ponovljena cancel komanda je idempotentna i nikada tiho ne mijenja stanje iz terminalnog
ili neaktivnog statusa. `Idempotency-Key` nije obavezan (§4).

**Audit (D-035, klauzula 6):**

- audit event se upisuje **isključivo pri stvarnom prelasku** u `CANCELLED`;
- ponovljeno otkazivanje **ne izvršava nikakvu mutaciju stanja**;
- ponovljeno otkazivanje **ne kreira dodatni audit event**.

Klijent koji dva puta pošalje istu cancel komandu dobija `202` pa `200`, a u audit tragu
postoji **tačno jedan** zapis otkazivanja.

Cancel se izvršava i kaskadno, kada `POST /encounters/{id}/cancel` cancel-uje encounter u
`ANALYSIS_IN_PROGRESS` (§12). Kaskada koristi istu definiciju tekuće aktivne analize.

---

# 16. Facts API

## GET `/analyses/{analysisId}/facts`

Permission: `analysis.read`.

## PATCH `/analyses/{analysisId}/facts/{factId}`

Permission: `analysis.correct_fact`.

Headers — **obavezno** (§5.2):

```http
If-Match: "2"
```

`extracted_facts` ima `version` kolonu prema D-029. Bez `If-Match` →
`428 PRECONDITION_REQUIRED`; stale `If-Match` → `409 VERSION_CONFLICT`. Uspješan odgovor
vraća novi `ETag`.

Request:

```json
{
  "reviewState": "CORRECTED",
  "correctedValue": 18,
  "reason": "Im Praxisjournal verifiziert."
}
```

Pravilo v1:

- korekcija koja utiče na tarifni rezultat označava trenutnu analizu kao needing revision;
- preporučeni endpoint vraća `requiresNewRevision: true`;
- approval nije dozvoljen dok nova evaluacija nije završena.

Response:

```json
{
  "factId": "uuid",
  "reviewState": "CORRECTED",
  "effectiveValue": 18,
  "requiresNewRevision": true
}
```

---

# 17. Service candidate API

## GET `/analyses/{analysisId}/service-candidates`

Permission: `analysis.read`.

## POST `/analyses/{analysisId}/service-candidates`

Permission: `analysis.correct_service`.

Request:

```json
{
  "codeSystem": "LKAAT",
  "serviceCode": "EXAMPLE.CODE",
  "quantity": "1.0000",
  "sessionReference": "SESSION-1",
  "reason": "Dokumentierte Leistung wurde nicht erkannt."
}
```

Server origin = USER.

## PATCH `/analyses/{analysisId}/service-candidates/{candidateId}`

Permission: `analysis.correct_service`.

Headers — **obavezno** (§5.2):

```http
If-Match: "2"
```

```json
{
  "reviewState": "CORRECTED",
  "effectiveServiceCode": "EXAMPLE.CODE.2",
  "effectiveQuantity": "2.0000",
  "reason": "Korrigiert nach dokumentierter Dauer."
}
```

`service_candidates` ima `version` kolonu prema D-029. Bez `If-Match` →
`428 PRECONDITION_REQUIRED`; stale `If-Match` → `409 VERSION_CONFLICT`. Uspješan odgovor
vraća novi `ETag`.

## POST `/analyses/{analysisId}/service-candidates/{candidateId}/reject`

Permission: `analysis.correct_service`.

Umjesto DELETE. Command-style POST — ne koristi `If-Match` (§5.3).

```json
{
  "reason": "Nicht dokumentiert."
}
```

---

# 18. Tarifna evaluacija

Normativna odluka: **D-026**.

## 18.1 Jedna evaluacija po analysis runu

Vrijedi `unique (analysis_run_id)` na `tariff_evaluations` (`02` §11.1). Jedan analysis run
ima **najviše jednu** tarifnu evaluaciju.

Posljedice:

- **`POST /analyses/{analysisId}/tariff-evaluation` ne postoji u API v1.** Endpoint je
  uklonjen, ne odgođen.
- Ponovna evaluacija ide **isključivo** kroz `POST /analyses/{analysisId}/revisions`
  (§15.3).
- Tehnički retry nakon greške **ponovo koristi postojeći `tariff_evaluations` red** i ne
  kreira drugu evaluaciju za isti analysis run. Retry putanje su
  `TARIFF_EVALUATION_FAILED → EVALUATING_TARIFF` (§29.2).
- Permission `analysis.run_tariff` nije aktivna u v1; navedena je samo među rezervisanim
  permisijama (§28.2).

## 18.2 GET `/analyses/{analysisId}/tariff-evaluation`

Permission: **`tariff_evaluation.read`**.

Vraća normalizovani rezultat.

Ista permission kontroliše i `tariffEvaluation` blok u workspace responseu (§15.2).
Pozivalac čije **efektivne permisije** (§28.5) sadrže `analysis.read`, ali ne i
`tariff_evaluation.read`, ne dobija tarifni rezultat ni na jednoj ruti.

## 18.3 GET `/analyses/{analysisId}/tariff-evaluation/raw`

Permission: **`tariff.raw_result.read`**.

Podobne role (D-043; matrica u `15`): `PRACTICE_ADMIN` **ALLOW**; `PHYSICIAN`, `MPA`,
`BILLING_SPECIALIST`, `AUDITOR`, `READ_ONLY` i `SYSTEM_ADMIN` **DENY**.

- `AUDITOR` dobija **isključivo** `audit.read` i `audit.export` — **ne** i ovu permisiju;
- permisija je **tenant-scoped** i traži aktivan membership sa `PRACTICE_ADMIN` rolom;
- `SYSTEM_ADMIN` je **ne dobija** kroz `tariff.manage`;
- korisnik kojem trebaju i administrativne i kliničke ovlasti mora nositi **obje** tenant role
  kroz D-038 multi-role membership.

Vraća sirovi matcher/provider odgovor. Response mora biti auditovan i sanitizovan gdje je
potrebno.

---

# 19. Findings API

## GET `/analyses/{analysisId}/findings`

Permission: `analysis.read`.

Filter:

```text
status
severity
blocking
source
relatedServiceCode
```

## PATCH `/analyses/{analysisId}/findings/{findingId}`

Permission: `finding.resolve`.

Headers — **obavezno** (§5.2):

```http
If-Match: "2"
```

`rule_findings` ima `version` kolonu i `check (version >= 1)` prema D-029. Bez `If-Match` →
`428 PRECONDITION_REQUIRED`; stale `If-Match` → `409 VERSION_CONFLICT`. Uspješan odgovor
vraća novi `ETag`.

### Resolve

```json
{
  "status": "RESOLVED",
  "reason": "Konsultationsdauer ergänzt."
}
```

### Accepted risk

```json
{
  "status": "ACCEPTED_RISK",
  "reason": "Manuell durch Ärztin geprüft."
}
```

Dozvoljeno samo ako rule version `allowAcceptedRisk = true`.

### Dismiss

```json
{
  "status": "DISMISSED",
  "reason": "Regel ist in diesem Fall nicht anwendbar."
}
```

Kritično pravilo može zabraniti dismiss.

---

# 20. Decision i approval API

## POST `/analyses/{analysisId}/decisions`

Headers: Idempotency-Key.

### Izvođenje permisije (D-036)

Permisija se izvodi iz polja `decision`:

| `decision` | Permisija |
|---|---|
| `APPROVE` | **`analysis.approve`** |
| `REJECT` | **`analysis.review_decision`** |
| `REQUEST_CHANGES` | **`analysis.review_decision`** |
| `SAVE_DRAFT` | **`analysis.review_decision`** |

Sve četiri odluke su **write radnje** — svaka upisuje `review_decisions` red.
**Nijedna write radnja nije autorizovana kroz `analysis.read`.** Pozivalac koji ima samo
`analysis.read` dobija `403 ACCESS_DENIED` na svaku od četiri odluke.

`APPROVE` je odvojen jer nosi pravnu težinu odobrenja i pokreće immutable approval payload
(D-016); rola koja smije tražiti izmjene ne mora smjeti odobriti obračun.

Podobne role za `analysis.review_decision` (D-041; matrica u `15`): `PHYSICIAN` **ALLOW**,
`BILLING_SPECIALIST` **ALLOW**; `PRACTICE_ADMIN`, `MPA`, `AUDITOR`, `READ_ONLY` i `SYSTEM_ADMIN`
**DENY**.

Permisija **ostaje grupna** i u v1 se **ne dijeli**; katalog ostaje na **32** aktivne permisije.

**Poznati nedostatak v1:** `MPA` **nema nijedan put za review bilješku**, jer grupna permisija
nosi i **terminalni** `REJECT` (D-031, klauzula 1). Buduća podjela zahtijeva novu permisiju i
zaseban ADR (D-045).

### Save draft

Permission: `analysis.review_decision`.

```json
{
  "decision": "SAVE_DRAFT",
  "reason": "Prüfung wird später fortgesetzt.",
  "expectedAnalysisRevision": 2
}
```

### Request changes

Permission: `analysis.review_decision`.

```json
{
  "decision": "REQUEST_CHANGES",
  "reason": "Dauerangabe fehlt.",
  "expectedAnalysisRevision": 2
}
```

### Reject

Permission: `analysis.review_decision`.

`reason` je **obavezan**.

```json
{
  "decision": "REJECT",
  "reason": "Dokumentation unterstützt die vorgeschlagenen Leistungen nicht.",
  "expectedAnalysisRevision": 2
}
```

Semantika (D-031, klauzule 1 i 9):

- analiza prelazi `REVIEW_REQUIRED → REJECTED`;
- **`REJECTED` je terminalno za tu analysis reviziju**;
- **encounter ostaje `REVIEW_REQUIRED`** — §29.1 se ne mijenja;
- upisuje se `review_decisions` red sa akterom, odlukom i `analysisRevisionNumber`;
- emituje se audit event **`ANALYSIS_REJECTED`**;
- nova obrada zahtijeva novu reviziju kroz `POST /analyses/{id}/revisions` (§15.3);
  roditelj zadržava `REJECTED`.

Iz bilo kojeg statusa osim `REVIEW_REQUIRED` → `409 INVALID_STATE_TRANSITION`.

### Approve

Permission: `analysis.approve`.

Podobne role (D-041; matrica u `15`): `PHYSICIAN` **ALLOW**; `MPA` **CONDITIONAL** uz
`allowMpaApproval = true`; `BILLING_SPECIALIST` **CONDITIONAL** uz
`allowBillingSpecialistApproval = true`; `PRACTICE_ADMIN`, `AUDITOR`, `READ_ONLY` i
`SYSTEM_ADMIN` **DENY**. Puna pravila uslovnosti su u §10.

```json
{
  "decision": "APPROVE",
  "reason": "Dokumentation und Tarifresultat geprüft.",
  "expectedAnalysisRevision": 2,
  "acknowledgements": [
    {
      "code": "HUMAN_REVIEW_COMPLETED",
      "accepted": true
    },
    {
      "code": "OPEN_WARNINGS_REVIEWED",
      "accepted": true
    }
  ]
}
```

Approval checks:

1. analysis postoji u practice contextu;
2. revision odgovara;
3. status je reviewable;
4. nije superseded;
5. tariff evaluation succeeded;
6. nema open critical;
7. nema open blocking error;
8. warnings su acknowledged prema policy;
9. ručne korekcije imaju reason;
10. nema stale input;
11. nema već aktivan approval;
12. user ima permission.

Response `201`:

```json
{
  "approvalId": "uuid",
  "analysisId": "uuid",
  "status": "APPROVED",
  "approvedBy": {
    "id": "uuid",
    "displayName": "Dr. Anna Muster"
  },
  "approvedAt": "...",
  "approvedPayloadSha256": "..."
}
```

**`approvedBy.displayName` — zašto ovo nije co-member trigger (D-061, klauzula 17).** U ovom
odgovoru je odobravatelj **sam pozivalac**, pa je `displayName` **caller-self** podatak koji već
pokriva politika `users_self_select` (`02` §17.5). Ovo polje samo po sebi **ne aktivira** gate
`BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS`.

Ograničenje je **uslovno** i mora biti provjereno prije implementacije: čim bilo koja **read-back**
površina — lista odobrenja, detalj analize, audit paket ili export — vrati `approvedBy.displayName`
za odobrenje koje **nije** napravio pozivalac, to jeste co-member pristup i gate se **mora** otvoriti
prije te implementacije.

## POST `/analyses/{analysisId}/approval/revoke`

Permission: `analysis.approval.revoke`.

Podobne role (D-041; matrica u `15`) — **identične podobnosti za `analysis.approve`**:
`PHYSICIAN` **ALLOW**; `MPA` **CONDITIONAL** uz `allowMpaApproval = true`;
`BILLING_SPECIALIST` **CONDITIONAL** uz `allowBillingSpecialistApproval = true`;
`PRACTICE_ADMIN`, `AUDITOR`, `READ_ONLY` i `SYSTEM_ADMIN` **DENY**.

Pravila opoziva (D-041):

- **opozivalac ne mora biti originalni odobravatelj**;
- podobnost role i flaga se evaluira **u trenutku opoziva**, ne u trenutku odobrenja;
- `reason` je **obavezan**;
- dokaz odobrenja se **nikada ne briše**;
- immutable approval historija ostaje;
- **revocation audit event je obavezan**;
- opozivačka ovlast **nikada ne prelazi** ovlast odobravanja.

**Nijedna zasebna permisija ni uslov vezan za originalnog odobravatelja se ne uvodi.**

```json
{
  "reason": "Nachträglicher Dokumentationsfehler."
}
```

Semantika (D-031, klauzula 6):

- analiza prelazi **`APPROVED → REVIEW_REQUIRED`**;
- encounter prelazi `APPROVED → REVIEW_REQUIRED` (§29.1);
- revocation zahtijeva `analysis.approval.revoke`; nijedna druga permission je ne
  omogućava;
- **revocation ne briše approval** — `analysis_approvals` red ostaje, sa `revokedAt`,
  `revokedBy` i `revocationReason`; approval historija je immutable;
- **nova revizija se može kreirati tek nakon revocationa.** Dok je analiza `APPROVED`,
  `POST /analyses/{id}/revisions` vraća `409 INVALID_STATE_TRANSITION` (§15.3).

Concurrency revocationa se rješava kroz `SELECT … FOR UPDATE`, ne kroz `If-Match` — revoke
je command-style POST (§5.3).

---

# 21. Export API

## POST `/analyses/{analysisId}/exports`

Permission: `analysis.export`.

Headers: Idempotency-Key.

Request — `integrationConnectionId` je **opcionalan** (D-032, klauzula 1):

```json
{
  "integrationConnectionId": "uuid",
  "target": "MANUAL_BILLING_DRAFT",
  "mode": "CREATE_DRAFT"
}
```

### Rezolucija integration konekcije

**Ako je `integrationConnectionId` izostavljen**, server determinističkim upitom traži
konekcije unutar tekućeg practice contexta gdje je `provider = 'MANUAL'` i
`status = 'ACTIVE'`:

| Broj pronađenih | Status | Code |
|---:|---:|---|
| tačno 1 | `202` | koristi se ta konekcija |
| 0 | **`409`** | **`INTEGRATION_CONNECTION_NOT_CONFIGURED`** |
| više od 1 | **`422`** | **`INTEGRATION_CONNECTION_REQUIRED`** |

**Ako je `integrationConnectionId` poslan**, automatska rezolucija se **ne izvršava**.
Primjenjuje se normalna validacija — konekcija mora:

- postojati;
- biti `ACTIVE`;
- pripadati tekućem practiceu.

Opseg rezolucije je ograničen na `provider = 'MANUAL'`. Kada Axenita adapter postane
dostupan, automatska rezolucija se mora ponovo razmotriti novim ADR-om.

### Perzistencija rezolviranog ID-a

Bez obzira na to da li je poslan ili rezolviran, konačni ID se upisuje u:

- `export_jobs.integration_connection_id`;
- audit metadata;
- export/artifact metadata prema postojećem ugovoru (§21.4).

### Permission napomena

`integration.read` je u prihvaćenoj matrici (`15`) ograničen na `PRACTICE_ADMIN` (D-032, klauzula 8).
**Ne proširuje se** samo zato da bi role sa `analysis.export` mogle izlistati konekcije —
deterministička rezolucija upravo uklanja tu potrebu.

Preconditions:

- active non-revoked approval;
- payload hash;
- integration active;
- no incompatible active export.

Response `202`:

```json
{
  "exportJobId": "uuid",
  "status": "QUEUED",
  "approvedPayloadSha256": "..."
}
```

## GET `/exports/{exportJobId}`

Permission: `analysis.export.read`.

## POST `/exports/{exportJobId}/retry`

Permission: `analysis.export`.

Headers: Idempotency-Key.

Retry je dozvoljen samo za `FAILED` export job i samo uz nepromijenjen
`approvedPayloadSha256`. Retry ne kreira novi approval i ne zaobilazi approval provjeru.

## GET `/exports/{exportJobId}/artifact`

Permission: `analysis.export.read`.

Za ManualAdapter može vratiti presigned download URL za JSON/PDF.

## 21.5 Approval greške (D-037)

**Aktivan, neopozvan approval je tvrdi precondition za svaki export endpoint.** Nijedan
export endpoint ga ne zaobilazi — ni `POST /analyses/{id}/exports`, ni
`POST /exports/{id}/retry`, ni `GET /exports/{id}/artifact`.

| Uslov | Status | Kod |
|---|---:|---|
| ne postoji aktivan, neopozvan approval | **409** | **`APPROVAL_REQUIRED`** |
| referencirani approval postoji, ali je opozvan | **409** | **`APPROVAL_REVOKED`** |

Oba slučaja su konflikt stanja resursa, ne greška validacije bodyja, pa oba koriste `409`.
Klijent ih razlikuje po `code` polju: u prvom slučaju approval treba kreirati, u drugom je
postojao i namjerno je povučen (§20).

---

# 22. Audit API

## GET `/analyses/{analysisId}/audit-events`

Permission: `audit.read`.

Cursor pagination.

## GET `/analyses/{analysisId}/audit-package`

Permission: **`audit.export`**.

JSON audit package je obavezan u v1. `audit.read` pokriva čitanje audit timelinea
(`/audit-events`), ali **ne** i izvoz paketa — izvoz je posebna radnja i traži
`audit.export`.

JSON package:

```json
{
  "analysis": {},
  "inputSnapshot": {},
  "aiExtraction": {
    "provider": "...",
    "model": "...",
    "promptVersion": "...",
    "requestSha256": "...",
    "responseSha256": "..."
  },
  "tariffRelease": {},
  "tariffEvaluation": {},
  "findings": [],
  "manualChanges": [],
  "approval": {},
  "exports": [],
  "auditEvents": [],
  "integrity": {
    "inputSha256": "...",
    "matcherResponseSha256": "...",
    "approvedPayloadSha256": "..."
  }
}
```

## POST `/analyses/{analysisId}/audit-package/pdf` — **DEFERRED**

Permission: `audit.export`.

Async; response job ID.

PDF audit package je **DEFERRED** (D-OPEN-006). JSON package iz prethodne sekcije je
obavezan i pokriva v1 zahtjev.

---

# 23. Job API

## GET `/jobs/{jobId}`

Permission se izvodi iz pripadajućeg resursa.

Response:

```json
{
  "id": "uuid",
  "jobType": "ANALYSIS_PIPELINE",
  "status": "RUNNING",
  "progressPercent": 65,
  "progressMessageCode": "TARIFF_EVALUATION_RUNNING",
  "attempts": 1,
  "queuedAt": "...",
  "startedAt": "..."
}
```

## GET `/jobs/{jobId}/events` — **DEFERRED**

SSE je **DEFERRED**. **Polling nad `GET /jobs/{jobId}` je normativan transport za v1.**

Kada endpoint postane aktivan, SSE ne smije slati medicinski sadržaj.

---

# 24. Tariff release admin API — platform rute

Normativna odluka: **D-023**.

Sve rute u ovoj sekciji su **platform rute**, ne tenant rute:

- **`X-Practice-ID` se ne šalje**; ako je poslan, ignoriše se;
- koriste platform context (§3.3), ne practice context;
- zahtijevaju permission **`tariff.manage`**;
- `tariff.manage` pripada **isključivo `SYSTEM_ADMIN`**, nikada `PRACTICE_ADMIN`;
- **ne daju pristup medicinskim podacima** — nijedna od njih ne čita encountere, analize,
  pacijente ni dokumente;
- `SYSTEM_ADMIN` bez aktivnog membershipa dobija `403` na svakoj tenant ruti.

Base permission: `tariff.manage`.

```text
GET  /admin/tariff-releases
POST /admin/tariff-releases
GET  /admin/tariff-releases/{id}
POST /admin/tariff-releases/{id}/validate
POST /admin/tariff-releases/{id}/activate
POST /admin/tariff-releases/{id}/deactivate
```

Sve navedene rute su aktivne u v1. Upis izvršava `copilot_system` rola preko
`SYSTEM_DATABASE_URL` (`02` §20.1); runtime rola ne piše globalnu tarifnu konfiguraciju.

Aktivacija request:

```json
{
  "confirmation": "ACTIVATE_TARIFF_RELEASE",
  "reason": "Validated for pilot.",
  "baselineTestRunReference": "..."
}
```

Aktivacija je transakcijska i auditovana.

---

# 25. Prompt/rule admin API — **DEFERRED**

**Cijela sekcija je DEFERRED.** Nijedan endpoint nije dostupan u aktivnom v1.

Permission `configuration.manage` je **rezervisana** i ne gate-uje nijedan aktivni
endpoint (§28.2).

```text
GET  /admin/ai-prompts                          — DEFERRED
POST /admin/ai-prompts/{promptCode}/versions    — DEFERRED
POST /admin/ai-prompt-versions/{id}/activate    — DEFERRED

GET  /admin/safety-rules                        — DEFERRED
GET  /admin/safety-rules/{id}                   — DEFERRED
POST /admin/safety-rules/{id}/versions          — DEFERRED
POST /admin/safety-rule-versions/{id}/activate  — DEFERRED
```

U v1 se sadržaj `ai_prompt_versions`, `safety_rules` i `safety_rule_versions` upisuje
isključivo seedom i migracijom (`02` §20.1, §23).

Kada sekcija postane aktivna vrijedi: aktivni prompt/rule version se ne uređuje; kreira se
nova verzija.

---

# 26. Integration admin API

Ova sekcija ima **dva različita režima**. Permission se ne izvodi iz naslova sekcije nego
iz pojedinačne podsekcije.

## 26.1 Aktivni read endpointi

Permission: **`integration.read`**.

```text
GET /admin/integrations
GET /admin/integrations/{id}
```

Ovo su **tenant/practice-scoped** administrativni read endpointi:

- **`X-Practice-ID` je obavezan**;
- vraćaju samo konekcije tekuće ordinacije;
- `integration.read` je u prihvaćenoj matrici (`15`) ograničen na `PRACTICE_ADMIN` (D-032);
- `credentialsSecretRef` se nikada ne vraća kao secret, samo kao referenca.

`GET /admin/integrations/{id}` vraća `ETag`, jer `integration_connections` ima `version`
kolonu (D-029, §5.1).

## 26.2 DEFERRED write endpointi

Permission: **`integration.manage`** — rezervisana, ne gate-uje nijedan aktivni endpoint
(§28.2).

```text
POST  /admin/integrations                       — DEFERRED
PATCH /admin/integrations/{id}                  — DEFERRED
POST  /admin/integrations/{id}/credentials      — DEFERRED
POST  /admin/integrations/{id}/test             — DEFERRED
POST  /admin/integrations/{id}/activate         — DEFERRED
POST  /admin/integrations/{id}/deactivate       — DEFERRED
```

`PATCH /admin/integrations/{id}` zadržava dokumentovan **obavezan `If-Match`** (§5.1) iako
je DEFERRED, kako bi ugovor bio potpun kada endpoint postane aktivan.

Credentials endpoint, kada postane aktivan:

- prima secret;
- šalje ga direktno u secrets manager;
- u DB čuva referencu;
- nikada ne vraća secret.

## 26.3 ManualAdapter konekcija

**ManualAdapter konekcija se kreira seedom** (`02` §23), ne kroz aktivni create endpoint.
U MVP-u je to jedina aktivna konekcija, pa deterministička rezolucija pri exportu (§21)
radi bez ijednog aktivnog write endpointa.

---

# 27. Health API

## GET `/health/live`

Bez auth ili private load balancer path.

```json
{
  "status": "up"
}
```

## GET `/health/ready`

```json
{
  "status": "degraded",
  "checks": {
    "database": "up",
    "redis": "up",
    "objectStorage": "up",
    "tariffEngine": "down"
  }
}
```

Ne vraća internal URL ili credential detalj.

---

# 28. Permission katalog

## 28.1 Aktivni katalog — tačno 32 permisije

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

## 28.2 Rezervisane / odgođene permisije

Nijedna od njih se **ne dodjeljuje nijednoj roli** u aktivnom v1 i **ne smije gate-ovati
nijedan aktivni endpoint**.

| Permisija | Rezervisana za | Razlog |
|---|---|---|
| `analysis.run_tariff` | ništa | Povučena odlukom D-026, klauzula 3. Zadržana u katalogu isključivo da se identifikator nikada ne iskoristi za drugu radnju. |
| `configuration.manage` | odgođeni AI-prompt i safety-rule admin CRUD (§25) | Cijela §25 je DEFERRED. |
| `integration.manage` | odgođeni integration write endpointi (§26.2) | Write putanja je DEFERRED. |

## 28.3 Pravila kataloga

1. **Svaka aktivna permisija gate-uje bar jedan aktivni endpoint ili response blok.**
   `tariff_evaluation.read` gate-uje i endpoint (§18.2) i blok (§15.2).
2. **Svaki aktivni endpoint deklariše permisiju ili eksplicitno pravilo izvođenja.**
   Nakon D-036 nema nijednog izuzetka.
3. **Rezervisane permisije ne gate-uju aktivne endpointe.**
4. **`tariff.manage` je platform-scoped** i pripada isključivo `SYSTEM_ADMIN` (§24).
5. **Nijedna write radnja nije autorizovana kroz `analysis.read`** (D-036, klauzula 7).

Izvedene permisije:

- `POST /analyses/{id}/decisions` — permisija se izvodi iz polja `decision` prema tabeli u
  §20;
- `GET /jobs/{jobId}` — permisija se izvodi iz resursa kojem job pripada;
- `GET /me` — samo autentifikacija;
- `/health/*` — bez permisije.

## 28.4 Role matrica

**Kompletna role-to-permission matrica je prihvaćena i živi u
`15_ROLE_PERMISSION_MATRIX_V1.md`.** Izvorne odluke su D-023, D-032 i D-039 do D-045 u `06`.

Dvije dodjele koje su prihvaćene ranije i ostaju nepromijenjene:

- `tariff.manage` → isključivo `SYSTEM_ADMIN` (D-023, klauzula 9);
- `integration.read` → ograničen na `PRACTICE_ADMIN` (D-032, klauzula 8).

Ovaj dokument i dalje imenuje **traženu permisiju po endpointu**; kompletna dodjela rolama se
**ne duplira ovdje**, da ne bi postojale dvije nezavisno uređive matrice (§3.7.4). Permission
string ostaje centralizovan.

D-038 definiše **kako se permisije komponuju** (§28.5); D-039 do D-045 definišu **ko ih ima**.
Katalog od **32 aktivne** i **3 rezervisane** permisije ostaje nepromijenjen.

## 28.5 Kompozicija efektivnih tenant permisija

**Normativna odluka: D-038, klauzule 7–11 i 16–18.**

- uspješan D-033 bootstrap uspostavlja **membership i tenant kontekst**, a ne autorizaciju
  za svaku tenant operaciju;
- autorizacija izvodi efektivne tenant permisije iz **svih rola dodijeljenih aktivnom
  membershipu** za odabranu ordinaciju;
- efektivne permisije su **unija** grantova koje doprinose te tenant role;
- unija važi **isključivo** unutar jednog membershipa i jedne ordinacije;
- `DENY` znači da ta rola **ne doprinosi grant** za tu permisiju;
- `DENY` **ne poništava** `ALLOW` koji doprinosi druga dodijeljena tenant rola;
- **nema implicitnog nasljeđivanja rola**;
- **nema per-user permission overrida** u v1;
- **neaktivan membership** ne doprinosi nijednu tenant permisiju;
- **aktivan membership sa nula rola** ne doprinosi nijednu tenant permisiju;
- autorizacija je **deny-by-default**;
- uslovne permisije zahtijevaju **oboje**: podobnu dodijeljenu tenant rolu **i**
  odgovarajuću practice postavku ili prihvaćeni runtime uslov — `allowMpaApproval` odnosno
  `allowBillingSpecialistApproval` (§10).

### Razdvajanje klasa rola

- tenant role dolaze **isključivo** iz `practice_membership_roles` (`02` §6.3a);
- `platformRoles` su **zasebna klasa aplikacijskih rola** i ostaju odvojen top-level blok
  u `/me`;
- `platformRoles` se **nikada ne spajaju unijom** sa tenant rolama;
- `SYSTEM_ADMIN` **ne dobija automatski** nijednu tenant permisiju;
- `copilot_app`, `copilot_migrator` i `copilot_system` su **database role** (`02` §3), a ne
  API aplikacijske role;
- **database grant nikada ne zamjenjuje permisiju endpointa.**

Platform model za `tariff.manage` ostaje nepromijenjen (§24, §28.3 pravilo 4).

Konkretne dodjele rolama su prihvaćene u **D-039 do D-045** i konsolidovane u `15`; ovaj
dokument ih **ne uvodi i ne mijenja**, nego na njih upućuje (§3.7.4, §28.4).

---

# 29. State machine

**Ovaj dokument je normativni izvor za oba state machinea** (D-027, D-031). `08` i `14` ga
preslikavaju i eksplicitno na njega upućuju; u slučaju neslaganja vrijedi §29.

State transition provjerava backend; DTO ne prima proizvoljan status.

## 29.1 Encounter

Normativna odluka: **D-027**. Kompletan skup dozvoljenih tranzicija:

```text
DRAFT
  → READY_FOR_ANALYSIS
  → CANCELLED

READY_FOR_ANALYSIS
  → ANALYSIS_IN_PROGRESS
  → CANCELLED

ANALYSIS_IN_PROGRESS
  → REVIEW_REQUIRED
  → READY_FOR_ANALYSIS
  → CANCELLED

REVIEW_REQUIRED
  → APPROVED
  → ANALYSIS_IN_PROGRESS
  → CANCELLED

APPROVED
  → EXPORT_PENDING
  → REVIEW_REQUIRED

EXPORT_PENDING
  → EXPORTED
  → APPROVED

EXPORTED
  → CLOSED

CANCELLED
  → terminal

CLOSED
  → terminal
```

Značenje netrivijalnih tranzicija:

| Tranzicija | Okidač |
|---|---|
| `ANALYSIS_IN_PROGRESS → READY_FOR_ANALYSIS` | oporaviva greška analize / retry |
| `REVIEW_REQUIRED → ANALYSIS_IN_PROGRESS` | nova analysis revizija (§15.3) |
| `APPROVED → REVIEW_REQUIRED` | approval je revoked (§20) |
| `EXPORT_PENDING → APPROVED` | export nije uspio |
| `EXPORTED → CLOSED` | eksplicitna close komanda (§12) |
| `ANALYSIS_IN_PROGRESS → CANCELLED` | `encounter.cancel`; kaskadno cancel-uje aktivnu analizu (§12) |

Eksplicitno:

- **`CANCELLED → CLOSED` nije dozvoljen.** `CANCELLED` i `CLOSED` su oba terminalna.
- Ne postoji `ANALYSIS_IN_PROGRESS → APPROVED`. I analiza bez findinga prolazi kroz
  `REVIEW_REQUIRED`; ljudski review se ne preskače.
- `REJECT` odluke nad analizom **ne mijenjaju** encounter status — ostaje
  `REVIEW_REQUIRED` (§20).

## 29.1a Dosežni podskup Faze 5 — tačno 4 od 15 (D-062, Dio F)

**Kanonski graf iznad se NE mijenja i ne otvara.** Ovaj pododjeljak isključivo bilježi koje su
tranzicije **dosežne** u Fazi 5, jer Faza 5 nema ni analizu, ni approval, ni export rute.

**Stanje kreiranja Faze 5:** `DRAFT`, jedino i uvijek.

| # | Tranzicija | Okidač | Akter | `version` |
|---|---|---|---|---|
| 1 | *(kreiranje)* → `DRAFT` | `POST /encounters` | `encounter.create` — PHYSICIAN, MPA | `1`, `ETag: "1"` |
| 2 | `DRAFT` → `READY_FOR_ANALYSIS` | uspješan unos dokumenta (§13.1) | `encounter.document.create` — PHYSICIAN, MPA | **bez inkrementa** |
| 3 | `DRAFT` → `CANCELLED` | `POST …/cancel` | `encounter.cancel` — **isključivo PHYSICIAN** | inkrement |
| 4 | `READY_FOR_ANALYSIS` → `CANCELLED` | `POST …/cancel` | `encounter.cancel` — isključivo PHYSICIAN | inkrement |

**Nedosežna stanja u Fazi 5:** `ANALYSIS_IN_PROGRESS`, `REVIEW_REQUIRED`, `APPROVED`,
`EXPORT_PENDING`, `EXPORTED`, `CLOSED`.

**Preostalih 11 tranzicija mora biti implementirano kao eksplicitno zabranjeno** →
`409 INVALID_STATE_TRANSITION`, a **ne prećutno odsutno**: `08` §11.1 traži table-driven test nad
**cijelom** mašinom. **Ponašanje Faze 7+ se ne uvlači u Fazu 5.**

**`DRAFT → READY_FOR_ANALYSIS` — ratifikovani trigger (`OD-P5-D2-7`):**

- postavlja ga **komanda unosa dokumenta**, ne klijent;
- **isključivo iz `DRAFT`**;
- pri **svakom** uspješnom unosu, **idempotentno** — ako je encounter već `READY_FOR_ANALYSIS`, to
  je **no-op, ne greška**;
- **ne troši `version` inkrement**, pa istovremeni `PATCH` sa važećim `ETag`-om ne pada;
- emituje **vlastiti** audit događaj `ENCOUNTER_READY_FOR_ANALYSIS`;
- **nema klijentske rute za promjenu statusa** — §12 zabranjuje proizvoljnu promjenu statusa.

**Efekt na dokumente:** unos dokumenta se **odbija kad je encounter `CANCELLED`** →
`409 INVALID_STATE_TRANSITION`.

**Arhiviranje encountera ne postoji** — `encounters` nema `archived_at` kolonu (`02` §7.2).
Arhiviranje je **isključivo koncept dokumenta** (§13.3).

**Reopen ne postoji u Fazi 5.** `CANCELLED` je terminalno; `CANCELLED → CLOSED` je zabranjeno.
Kanonske re-entry putanje (`APPROVED → REVIEW_REQUIRED`, `EXPORT_PENDING → APPROVED`) su izvan
Faze 5.

**`POST …/close` je izvan obuhvata Faze 5** jer je `EXPORTED` nedosežan. To što ga `04` §7.3 ne
navodi **nije kontradikcija** sa §12, nego tačna posljedica nedosežnosti.

**Sloj sprovođenja: aplikacijski.** Vokabular statusa već sprovodi enum tip `encounter_status`;
**graf tranzicija je aplikacijski** i **nijedan trigger, `CHECK` ni constraint nad statusnom
kolonom se ne uvodi** (`02` §22.14 ne poznaje encounter-status trigger).

## 29.2 Analysis

Normativna odluka: **D-031**. Kompletan skup dozvoljenih tranzicija:

```text
QUEUED
  → PREPARING_INPUT
  → CANCELLED

PREPARING_INPUT
  → EXTRACTING
  → FAILED
  → CANCELLED

EXTRACTING
  → EVALUATING_TARIFF
  → EXTRACTION_FAILED
  → CANCELLED

EXTRACTION_FAILED
  → EXTRACTING

EVALUATING_TARIFF
  → APPLYING_SAFETY_RULES
  → TARIFF_EVALUATION_FAILED
  → CANCELLED

TARIFF_EVALUATION_FAILED
  → EVALUATING_TARIFF

APPLYING_SAFETY_RULES
  → REVIEW_REQUIRED
  → COMPLETED
  → FAILED
  → CANCELLED

REVIEW_REQUIRED
  → APPROVED
  → REJECTED
  → SUPERSEDED

COMPLETED
  → APPROVED
  → SUPERSEDED

APPROVED
  → REVIEW_REQUIRED

CANCELLED
  → terminal

FAILED
  → terminal

REJECTED
  → terminal

SUPERSEDED
  → terminal
```

Eksplicitna pravila:

1. **`REJECTED` je terminalno za tu analysis reviziju.** Nova obrada traži novu reviziju.
2. **REJECT ostavlja encounter u `REVIEW_REQUIRED`** — §29.1 se ne mijenja.
3. **`FAILED` nema automatsku retry tranziciju.** Stage oporavka nije poznat, pa bi
   automatski retry mogao preskočiti ili ponoviti korak. Oporavak traži novu reviziju.
4. **`EXTRACTION_FAILED` se retry-uje isključivo u `EXTRACTING`.**
5. **`TARIFF_EVALUATION_FAILED` se retry-uje isključivo u `EVALUATING_TARIFF`.**
   Retry se uvijek vraća na svoj korak, nikada naprijed.
6. **`APPROVED` mora prvo biti revoked** u `REVIEW_REQUIRED` prije nego što ga druga
   revizija može zamijeniti (§20).
7. **`SUPERSEDED` se dostiže isključivo iz `REVIEW_REQUIRED` ili `COMPLETED`.**
8. **Kreiranje child revizije ne prepisuje terminalni status roditelja** definisan u D-015
   i D-031. `REJECTED`, `FAILED`, `EXTRACTION_FAILED`, `TARIFF_EVALUATION_FAILED` i
   `CANCELLED` roditelji zadržavaju svoj status; veza ostaje vidljiva kroz
   `parentAnalysisRunId` (§15.3).

Cancel je dozvoljen iz svih aktivnih async stanja — `QUEUED`, `PREPARING_INPUT`,
`EXTRACTING`, `EVALUATING_TARIFF`, `APPLYING_SAFETY_RULES` (§15.4).

---

# 30. Internal Tarif Engine contract

Base:

```text
/internal/v1
```

Private network/service auth.

## POST `/evaluations`

Request:

```json
{
  "requestId": "uuid",
  "tariffRelease": {
    "releaseCode": "MOCK-2026-1",
    "tardocVersion": "...",
    "ambulatoryFlatRateVersion": "...",
    "lkaatVersion": "...",
    "matcherVersion": "..."
  },
  "case": {
    "caseId": "analysis-uuid",
    "treatmentDate": "2026-07-17",
    "guarantorType": "KVG",
    "specialtyCode": "AIM",
    "patient": {
      "age": 58,
      "sex": "F"
    },
    "diagnoses": [
      {
        "system": "ICD-10",
        "code": "I10"
      }
    ],
    "sessions": [
      {
        "sessionId": "SESSION-1",
        "date": "2026-07-17",
        "services": [
          {
            "sourceCandidateId": "uuid",
            "codeSystem": "LKAAT",
            "code": "EXAMPLE.CODE",
            "quantity": "1.0000"
          }
        ]
      }
    ]
  }
}
```

Response:

```json
{
  "requestId": "uuid",
  "status": "SUCCEEDED",
  "versions": {
    "tarifMatcher": "...",
    "caseMaster": "...",
    "grouper": "...",
    "mapper": "..."
  },
  "billingPath": "TARDOC",
  "caseMaster": {
    "status": "VALID",
    "messages": []
  },
  "grouper": {
    "result": "NO_AMBULATORY_FLAT_RATE",
    "selectedFlatRateCode": null,
    "messages": []
  },
  "mapper": {
    "items": [
      {
        "sourceCandidateId": "uuid",
        "outputCodeSystem": "TARDOC",
        "outputCode": "EXAMPLE.OUTPUT",
        "quantity": "1.0000",
        "action": "MAPPED",
        "billable": true
      }
    ],
    "messages": []
  },
  "rawResult": {}
}
```

Action enum:

```text
MAPPED
UNCHANGED
QUANTITY_ADJUSTED
CODE_REPLACED
REMOVED
INCLUDED_IN_FLAT_RATE
REQUIRES_REVIEW
```

## GET `/health`

## GET `/releases`

Backend poredi učitanu verziju sa `tariff_releases`.

---

# 31. Practice System adapter contract

```ts
export interface PracticeSystemAdapter {
  readonly provider: 'AXENITA' | 'MANUAL' | 'CSV' | 'FHIR';

  testConnection(
    context: IntegrationContext,
  ): Promise<ConnectionTestResult>;

  importEncounter(
    externalEncounterId: string,
    context: IntegrationContext,
  ): Promise<ImportedEncounter>;

  importEncounterDocuments(
    externalEncounterId: string,
    context: IntegrationContext,
  ): Promise<ImportedDocument[]>;

  importBillingDraft(
    externalEncounterId: string,
    context: IntegrationContext,
  ): Promise<ImportedBillingItem[]>;

  exportApprovedBillingDraft(
    payload: ApprovedBillingPayload,
    context: IntegrationContext,
  ): Promise<ExportResult>;

  attachAuditSummary(
    externalEncounterId: string,
    document: AuditDocumentReference,
    context: IntegrationContext,
  ): Promise<ExportResult>;
}
```

Axenita DTO nikada ne postaje core domain DTO.

---

# 32. OpenAPI zahtjevi

Svaki endpoint mora imati:

- operationId;
- tags;
- summary;
- permission opis;
- header schema;
- request DTO;
- response DTO;
- primjere;
- error response;
- status kod;
- deprecation marker kada je potreban.

Generisani fajl:

```text
docs/api/openapi-v1.json
```

CI provjere:

- validan OpenAPI;
- generisani client;
- breaking contract diff;
- DTO i runtime validacija usklađeni.

---

# 33. API security testovi

- missing JWT;
- invalid issuer/audience;
- inactive user;
- missing practice header;
- invalid UUID;
- inactive membership;
- missing permission;
- cross-tenant ID;
- mass assignment unknown field;
- stale ETag;
- duplicate idempotency;
- approval with blockers;
- export without approval;
- raw document access without permission;
- rate limit;
- problem details ne sadrži stack/secrets.

Dodatni testovi iz reconciliation odluka:

- **nedostajući obavezni `If-Match` → `428 PRECONDITION_REQUIRED`** na svih šest resursa iz
  §5.1;
- **`425` se ne vraća ni na jednom endpointu**;
- request u toku sa istim idempotency keyem → `409 REQUEST_ALREADY_IN_PROGRESS`;
- platform ruta pozvana sa `X-Practice-ID` ne dobija tenant context;
- **`SYSTEM_ADMIN` bez aktivnog membershipa dobija `403` na svakoj tenant ruti**;
- korisnik sa `tariff.manage` ne čita encountere, analize ni dokumente;
- `PRACTICE_ADMIN` bez `SYSTEM_ADMIN` ne može pozvati nijednu `/admin/tariff-releases` rutu;
- korisnik bez `tariff_evaluation.read` ne dobija `tariffEvaluation` blok ni na jednoj ruti
  i dobija `"redacted": ["tariffEvaluation"]`;
- export bez `integrationConnectionId`: nula aktivnih MANUAL konekcija → `409`, dvije →
  `422`, jedna → `202` uz rezolviran ID u `export_jobs` i audit eventu;
- dvije istovremene revision komande nad istim roditeljem kreiraju tačno jedno dijete;
- `POST /analyses/{id}/revisions` nad `APPROVED` roditeljem → `409`;
- ponovljeni `POST /analyses/{id}/cancel` ne mijenja stanje;
- `audit-package` bez `audit.export` → `403`, i kada pozivalac ima `audit.read`;
- `user_id` poslan u bodyju, queryju ili headeru ne utiče na kontekst.

## 33.1 Linearni lanac revizija — D-034

- dva istovremena revision zahtjeva kreiraju **tačno jedno** dijete;
- gubitnik trke dobija **`409 REVISION_CONFLICT`**;
- drugi **sekvencijalni** zahtjev nad istim roditeljem dobija `409 REVISION_CONFLICT`;
- retry **ne kreira reviziju N+2** od istog roditelja;
- **provjera postojanja djeteta izvršava se prije mapiranja greške po statusu roditelja** —
  roditelj koji već ima dijete daje `REVISION_CONFLICT` i kada mu je status nedozvoljen;
- roditelj **bez djeteta** sa nedozvoljenim statusom daje `409 INVALID_STATE_TRANSITION`.

## 33.2 Otkazivanje — D-035

- prvo otkazivanje analize daje **`202`**;
- ponovljeno otkazivanje daje **`200`**;
- ponovljeno otkazivanje **ne kreira dodatni audit event**;
- otkazivanje iz neaktivnog stanja daje **`409 INVALID_STATE_TRANSITION`**;
- kaskada encounter cancela upisuje **dva audit eventa**;
- neuspjeh kaskade **rollback-uje obje promjene stanja**;
- historijske i terminalne revizije **ostaju nepromijenjene** nakon kaskade.

## 33.3 Permisije odluka — D-036

- `analysis.review_decision` bez `analysis.approve` dozvoljava `REJECT`, `REQUEST_CHANGES`
  i `SAVE_DRAFT`;
- isti pozivalac dobija **`403`** na `APPROVE`;
- pozivalac sa samo `analysis.read` dobija **`403`** na sve četiri write odluke.

## 33.4 Approval greške pri exportu — D-037

- export bez aktivnog approvala → **`409 APPROVAL_REQUIRED`**;
- export sa opozvanim approvalom → **`409 APPROVAL_REVOKED`**.

## 33.5 Multi-role membership — D-038

Testovi provjeravaju **pravilo kompozicije**; nijedan ne tvrdi konkretan grant iz D-039
nadalje.

Ugovor `/me`:

- `GET /me` vraća `memberships[].roles` i **nikada** `memberships[].role`;
- vrijednosti u `roles[]` su **jedinstvene** i **deterministički poredane**;
- `roles[]` sadrži isključivo role pripadajućeg membershipa;
- `platformRoles` ostaje **zaseban blok** i ne pojavljuje se unutar `memberships[]`;
- `GET /me` **nikada** ne izlaže dodjele rola drugog korisnika.

Vidljivost naspram autorizacije:

- neaktivan membership smije biti nabrojan, ali **ne autorizuje** nijednu tenant operaciju;
- aktivan membership sa **nula** rola ne dobija nijednu efektivnu permisiju.

Kompozicija:

- membership sa `PHYSICIAN` **i** `PRACTICE_ADMIN` dobija **uniju** grantova obje role prema
  prihvaćenoj matrici u `15`;
- `DENY` u jednoj roli **ne poništava** `ALLOW` iz druge dodijeljene tenant role;
- `platformRoles` **nikada ne doprinose** tenant permission uniji;
- `SYSTEM_ADMIN` bez aktivnog membershipa dobija **`403`** na tenant rutama;
- dodjele rola u jednoj ordinaciji **ne utiču** na autorizaciju u drugoj;
- uslovno odobravanje zahtijeva **i** podobnu rolu **i** odgovarajući practice flag.

Injekcija:

- pozivalac **ne može ubaciti rolu** kroz request body, query parametar, header ni argument
  database funkcije.

---

# 34. API Definition of Done

- `/api/v1` versioning;
- OpenAPI 3.1 generisan;
- global validation;
- Problem Details;
- JWT;
- practice guard;
- permission guard;
- `/me` izlaže `memberships[].roles`, bez polja `role`;
- efektivne tenant permisije se komponuju kao unija po aktivnom membershipu (§28.5);
- request ID;
- idempotency;
- optimistic locking;
- state machine;
- audit na commandima;
- async 202 workflow;
- decimal string serialization;
- e2e testovi;
- cross-tenant zaštita;
- no PHI u logovima ili errorima.
