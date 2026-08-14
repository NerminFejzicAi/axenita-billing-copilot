# 14 — Data Flow and Sequence Diagrams

Mermaid dijagrami služe kao tehnički vodič. Kod/state machine i autoritativni dokumenti imaju prednost ako dođe do razlike.

---

# 1. Sistem

```mermaid
flowchart LR
    USER[Doctor / MPA / Billing]
    WEB[Next.js UI]
    API[NestJS API]
    DB[(PostgreSQL)]
    REDIS[(Redis / BullMQ)]
    OBJ[(S3 / MinIO)]
    AI[AI Adapter]
    TAR[Java Tariff Engine]
    AX[Practice System Adapter]

    USER --> WEB
    WEB --> API
    API --> DB
    API --> REDIS
    API --> OBJ
    API --> AI
    API --> TAR
    API --> AX
```

---

# 2. Tenant request

Normativno: D-033 i **D-047**; `02` §16.2.1, §16.2.4, §17.3, §17.5 i §17.6; `03` §3 i §3.7.1;
`04` §5.2 i §6.2; `07` Faze 3 i 4.

Cijeli lanac se izvršava u **jednoj interaktivnoj transakciji** (D-047, klauzula 8).

```mermaid
sequenceDiagram
    participant UI
    participant Guard
    participant Auth as AuthService
    participant TenantDB
    participant PG

    UI->>Guard: Bearer token + X-Practice-ID
    Guard->>Auth: validate bearer token
    Note right of Auth: signature, issuer,<br/>audience, expiry

    alt bearer invalid
        Auth-->>UI: 401 AUTHENTICATION_REQUIRED
    else bearer valid
        Auth->>PG: BEGIN
        Auth->>PG: set_auth_subject_context(p_auth_subject text)
        Note right of PG: PHASE 3 — app.auth_subject;<br/>clears app.user_id + app.practice_id
        Auth->>PG: select id, status from users
        Note right of PG: bootstrap policy 02 §17.5;<br/>no WHERE on auth_subject;<br/>at most one row

        alt unknown subject
            PG-->>Auth: 0 rows
            Auth->>PG: ROLLBACK
            Auth-->>UI: 403 ACCESS_DENIED
            Note right of Auth: valid token, unprovisioned subject;<br/>app.user_id never set;<br/>not INVALID_TOKEN
        else users.status <> ACTIVE
            Auth->>PG: ROLLBACK
            Auth-->>UI: 403 ACCESS_DENIED
            Note right of Auth: app.user_id never set;<br/>no membership enumeration
        else active user
            Auth->>PG: set_user_context(p_user_id uuid)
            Note right of PG: PHASE 3 — app.user_id;<br/>bootstrap policy self-deactivates
            Guard->>TenantDB: use case + requested practice id
            TenantDB->>PG: select status from practices where id = requested
            Note right of PG: PHASE 3 — membership policy 02 §17.6;<br/>pre-context read

            alt no membership for requested practice
                PG-->>TenantDB: 0 rows
                TenantDB->>PG: ROLLBACK
                TenantDB-->>UI: 403 ACCESS_DENIED
            else practice.status <> ACTIVE
                TenantDB->>PG: ROLLBACK
                TenantDB-->>UI: 403 ACCESS_DENIED
                Note right of TenantDB: app.practice_id never set
            else practice ACTIVE
                TenantDB->>PG: set_request_context(p_practice_id uuid)
                Note right of PG: PHASE 4 — SECURITY INVOKER<br/>user-scoped practice_memberships RLS

                alt no active membership
                    PG-->>TenantDB: 42501
                    TenantDB->>PG: ROLLBACK
                    TenantDB-->>UI: 403 ACCESS_DENIED
                    Note right of TenantDB: app.practice_id never set;<br/>no tenant query executed
                else active membership
                    PG-->>TenantDB: app.practice_id set
                    Note right of PG: practices visibility narrows<br/>to exactly this practice (RESTRICTIVE)
                    TenantDB->>PG: load roles + derive permissions
                    TenantDB->>PG: tenant queries
                    TenantDB->>PG: audit / outbox
                    TenantDB->>PG: COMMIT
                    TenantDB-->>UI: result
                end
            end
        end
    end

    Note over TenantDB,PG: transaction end clears app.auth_subject, app.user_id and app.practice_id;<br/>pooled connection inherits no context
```

**Granica faza (D-047, klauzula 16).** Koraci označeni `PHASE 3` pripadaju paketu
`002_identity_and_practices`; koraci označeni `PHASE 4` pripadaju paketu `013_rls_policies`. U
fazi 3 `set_request_context` još ne postoji, pa `app.practice_id` nikada nije postavljen — tenant
sužavanje se u toj fazi **dodatno** sprovodi aplikacijski, a RESTRICTIVE politika iz `02` §17.6
je već prisutna i aktivira se automatski čim faza 4 počne postavljati kontekst. Faza 3 je
**nepilotsko međustanje**; faza 4 ostaje obavezan sigurnosni gate prije faze 5.

## 2.1 Sigurnosna pravila (D-033, D-047)

- `set_request_context` **ne prima `user_id`**; nijedan caller-provided identifikator korisnika se ne smatra pouzdanim;
- **SECURITY DEFINER se ne koristi za tenant bootstrap**, niti za identity bootstrap — nijedna
  `SECURITY DEFINER` funkcija ne postoji u modelu (D-047, klauzula 2);
- `app.auth_subject` dolazi **isključivo** iz kriptografski verifikovanog JWT/OIDC subjekta, nikada
  iz bodyja, query parametra ni nepouzdanog headera;
- `set_auth_subject_context` briše `app.user_id` i `app.practice_id` prije postavljanja subjekta;
- bootstrap politika nad `users` sadrži uslov `app.user_id IS NULL`, pa se sama deaktivira nakon
  `set_user_context`; zastarjeli `app.auth_subject` nema efekta;
- `users` i `practices` nose `ENABLE` + `FORCE RLS` uz **column-level** grantove; `auth_subject`,
  `last_login_at`, `zsr_number`, `gln_number` i `legal_name` nemaju grant;
- ordinacija čiji `status` nije `ACTIVE` odbija se **prije** nego `app.practice_id` postoji;
- korisnik čiji `status` nije `ACTIVE` odbija se **prije** `set_user_context`;
- verifikovan auth subjekt bez `users` reda odbija se sa `403 ACCESS_DENIED` uz `ROLLBACK`,
  takođe **prije** `set_user_context`; `401 INVALID_TOKEN` ostaje rezervisan za neuspjelu
  verifikaciju tokena, a odgovor **ne razlikuje** nepoznat subjekt od ne-`ACTIVE` korisnika;
- **RLS ne autentifikuje korisnika** kada je dijeljeni `copilot_app` credential ukraden — držalac
  credentiala može sam postaviti `app.*` varijable; preživljavaju column grantovi, nepostojanje
  write grantova, nepostojanje vlasništva i `NOBYPASSRLS` (D-047, klauzula 20);
- SECURITY INVOKER **ne zaobilazi** `practice_memberships` RLS;
- membership bootstrap mora raditi **prije nego `app.practice_id` postoji**;
- normalna tenant RLS ne može bootstrap-ovati kontekst koji sama zahtijeva;
- `practice_memberships` koristi posebnu user-scoped bootstrap politiku;
- `X-Practice-ID` sam po sebi **ne autorizuje** tenant pristup;
- neuspjeh bootstrapa ne ostavlja upotrebljiv `app.practice_id`, a tenant upiti se ne izvršavaju;
- transakcijski lokalni kontekst ne curi u drugi request ni u pooled konekciju;
- `platformRoles` i tenant membershipi su **odvojeni**; `platformRoles` ne kreiraju tenant pristup;
- platform/system context se **ne** uspostavlja kroz `set_request_context`.

## 2.2 Napomena — access model za `users` i `practices` (D-047)

Opšti runtime pristup nad `users` i `practices` **riješen je odlukom D-047** (2026-08-12);
D-OPEN-011 nosi status `SUPERSEDED BY D-047`.

Dijagram iznad **ne implicira** neograničen pristup tim tabelama i nikada ga nije implicirao:

- čitanje `users` je ograničeno na **jedan red** — bootstrap po verifikovanom subjektu ili vlastiti
  red — kroz dvije međusobno isključive politike (`02` §17.5);
- čitanje `practices` je ograničeno na **ordinacije vlastitog membership skupa** prije tenant
  konteksta, i na **tačno jednu** ordinaciju nakon njega (`02` §17.6);
- membership-bootstrap tok iz §2 i dalje **nije** opšti pristup nad te dvije tabele — access model
  je riješen zasebnim politikama, ne proširenjem tog toka;
- pristup redu **drugog** korisnika ostaje `DENY / NOT IMPLEMENTED` u v1; obavezan gate je
  `BEFORE PHASE 5 CO-MEMBER DISPLAY NAME ACCESS` (`13` §19). Dijagrami u ovom dokumentu ga
  **ne prikazuju** i ne smiju ga anticipirati.

---

# 3. Create encounter

```mermaid
sequenceDiagram
    participant UI
    participant API
    participant ID as Idempotency
    participant DB
    participant AUD as Audit

    UI->>API: POST encounter + Idempotency-Key
    API->>DB: BEGIN + tenant context
    API->>ID: claim key/request hash
    alt existing same completed
        ID-->>API: cached minimal response
        API-->>UI: same result
    else new
        API->>DB: insert encounter + diagnoses
        API->>AUD: insert ENCOUNTER_CREATED
        API->>DB: complete idempotency
        API->>DB: COMMIT
        API-->>UI: 201 + ETag
    end
```

---

# 4. Document intake

```mermaid
flowchart TD
    A[Manual text/upload] --> B[Validate size/type]
    B --> C[Normalize]
    C --> D[Source SHA-256]
    D --> E[Encrypt original]
    E --> F[Redact identifiers]
    F --> G[Redacted SHA-256]
    G --> H[Encrypt redacted]
    H --> I[Persist document metadata]
    I --> J[Audit]
    J --> K[Encounter READY_FOR_ANALYSIS]
```

---

# 5. Analysis command/outbox

```mermaid
sequenceDiagram
    participant UI
    participant API
    participant PG
    participant PUB as Outbox Publisher
    participant Q as BullMQ

    UI->>API: POST /encounters/id/analyses
    API->>PG: BEGIN
    API->>PG: validate + analysis_run
    API->>PG: async_job
    API->>PG: outbox_event
    API->>PG: COMMIT
    API-->>UI: 202 analysisId/jobId

    PUB->>PG: SELECT unpublished FOR UPDATE SKIP LOCKED
    PUB->>Q: enqueue(eventId)
    Q-->>PUB: accepted
    PUB->>PG: published_at
```

---

# 6. Analysis pipeline

```mermaid
sequenceDiagram
    participant Q
    participant P as Analysis Processor
    participant PG
    participant AI
    participant T as Tariff Engine
    participant R as Rule Registry

    Q->>P: analysisId/practiceId/requestId
    P->>PG: load/checkpoint
    P->>PG: create immutable input snapshot
    P->>AI: redacted structured request
    AI-->>P: facts/candidates JSON
    P->>P: schema/business validation
    P->>PG: persist AI run/facts/candidates
    P->>T: tariff request
    T-->>P: raw + normalized result
    P->>PG: persist evaluation/items/messages
    P->>R: evaluate context
    R-->>P: findings
    P->>PG: persist findings + final status
```

---

# 7. Retry checkpoint

```mermaid
flowchart TD
    A[Job retry] --> B{Snapshot exists?}
    B -- no --> C[Create snapshot]
    B -- yes --> D{AI SUCCEEDED same hash?}
    C --> D
    D -- no --> E[Run AI]
    D -- yes --> F{Tariff eval exists?}
    E --> F
    F -- no --> G[Run tariff]
    F -- yes --> H{Findings complete?}
    G --> H
    H -- no --> I[Run rules]
    H -- yes --> J[Finalize]
    I --> J
```

---

# 8. Review/correction

```mermaid
sequenceDiagram
    participant U as User
    participant API
    participant PG

    U->>API: PATCH fact/candidate + reason
    API->>PG: lock/check not approved
    API->>PG: store correction + review change + audit
    API-->>U: requiresNewRevision=true
    U->>API: POST analysis revision
    API->>PG: create child revision + outbox
    API-->>U: 202
```

---

# 9. Approval

```mermaid
sequenceDiagram
    participant U as Approver
    participant API
    participant PG

    U->>API: POST decision APPROVE
    API->>PG: BEGIN
    API->>PG: SELECT analysis FOR UPDATE
    API->>PG: validate revision/status
    API->>PG: check tariff/findings/corrections
    API->>API: build canonical payload
    API->>API: SHA-256
    API->>PG: insert approval + decision + audit
    API->>PG: update statuses
    API->>PG: COMMIT
    API-->>U: 201 approval/hash
```

---

# 10. Export

```mermaid
sequenceDiagram
    participant U
    participant API
    participant PG
    participant Q
    participant A as Adapter
    participant OBJ

    U->>API: POST export
    API->>PG: verify active approval/hash
    API->>PG: export_job + outbox
    API-->>U: 202
    Q->>A: approved payload only
    A->>OBJ: create manual artifact
    OBJ-->>A: object ref/hash
    A->>PG: success result/audit
```

---

# 11. Approval revoke

```mermaid
flowchart LR
    A[Active approval] --> B[Revoke with reason]
    B --> C[Approval revoked fields]
    C --> D[Analysis/encounter REVIEW_REQUIRED]
    C --> E[New export blocked]
    C --> F[History retained]
```

---

# 12. Encounter state

Normativni izvor: `03` §29.1 (D-027). Ovaj dijagram ga preslikava; u slučaju neslaganja
vrijedi `03` §29.1.

```mermaid
stateDiagram-v2
    [*] --> DRAFT

    DRAFT --> READY_FOR_ANALYSIS
    DRAFT --> CANCELLED: encounter.cancel

    READY_FOR_ANALYSIS --> ANALYSIS_IN_PROGRESS
    READY_FOR_ANALYSIS --> CANCELLED: encounter.cancel

    ANALYSIS_IN_PROGRESS --> REVIEW_REQUIRED
    ANALYSIS_IN_PROGRESS --> READY_FOR_ANALYSIS: oporaviva greška / retry
    ANALYSIS_IN_PROGRESS --> CANCELLED: encounter.cancel + kaskada

    REVIEW_REQUIRED --> APPROVED
    REVIEW_REQUIRED --> ANALYSIS_IN_PROGRESS: nova revizija
    REVIEW_REQUIRED --> CANCELLED: encounter.cancel

    APPROVED --> EXPORT_PENDING
    APPROVED --> REVIEW_REQUIRED: approval revoked

    EXPORT_PENDING --> EXPORTED
    EXPORT_PENDING --> APPROVED: export nije uspio

    EXPORTED --> CLOSED

    CANCELLED --> [*]
    CLOSED --> [*]
```

## 12.1 Kaskadno otkazivanje iz `ANALYSIS_IN_PROGRESS` (D-035)

Tranzicija `ANALYSIS_IN_PROGRESS → CANCELLED` je **atomarna kaskada**:

- prvo se otkazuje **tekuća aktivna analiza**, zatim encounter;
- `encounter.cancel` autorizuje kompletnu komandu i njenu internu kaskadu;
- `analysis.cancel` se **ne traži dodatno**;
- ako otkazivanje analize ne uspije, **kompletno otkazivanje encountera se rollback-uje** —
  djelimičan ishod nije dozvoljen;
- upisuju se **dva odvojena audit eventa** — jedan za analizu, jedan za encounter;
- **historijske i terminalne analysis revizije ostaju nepromijenjene**.

## 12.2 Eksplicitna pravila (`03` §29.1)

- **`CANCELLED → CLOSED` nije dozvoljen.** `CANCELLED` i `CLOSED` su oba terminalna.
- Ne postoji `ANALYSIS_IN_PROGRESS → APPROVED`. I analiza bez findinga prolazi kroz
  `REVIEW_REQUIRED`; ljudski review se ne preskače.
- `REJECT` odluka nad analizom **ne mijenja** encounter status — ostaje `REVIEW_REQUIRED`.

---

# 13. Analysis state

Normativni izvor: `03` §29.2 (D-031). Ovaj dijagram ga preslikava; u slučaju neslaganja
vrijedi `03` §29.2.

```mermaid
stateDiagram-v2
    [*] --> QUEUED

    QUEUED --> PREPARING_INPUT
    QUEUED --> CANCELLED: cancel

    PREPARING_INPUT --> EXTRACTING
    PREPARING_INPUT --> FAILED
    PREPARING_INPUT --> CANCELLED: cancel

    EXTRACTING --> EVALUATING_TARIFF
    EXTRACTING --> EXTRACTION_FAILED
    EXTRACTING --> CANCELLED: cancel

    EXTRACTION_FAILED --> EXTRACTING: retry

    EVALUATING_TARIFF --> APPLYING_SAFETY_RULES
    EVALUATING_TARIFF --> TARIFF_EVALUATION_FAILED
    EVALUATING_TARIFF --> CANCELLED: cancel

    TARIFF_EVALUATION_FAILED --> EVALUATING_TARIFF: retry

    APPLYING_SAFETY_RULES --> REVIEW_REQUIRED
    APPLYING_SAFETY_RULES --> COMPLETED
    APPLYING_SAFETY_RULES --> FAILED
    APPLYING_SAFETY_RULES --> CANCELLED: cancel

    REVIEW_REQUIRED --> APPROVED: approve
    REVIEW_REQUIRED --> REJECTED: reject
    REVIEW_REQUIRED --> SUPERSEDED: child revizija kreirana

    COMPLETED --> APPROVED: approve
    COMPLETED --> SUPERSEDED: child revizija kreirana

    APPROVED --> REVIEW_REQUIRED: approval revoked

    CANCELLED --> [*]
    FAILED --> [*]
    REJECTED --> [*]
    SUPERSEDED --> [*]
```

Terminalna stanja: `CANCELLED`, `FAILED`, `REJECTED`, `SUPERSEDED`.

Retry se uvijek vraća na svoj korak, nikada naprijed. Generički `FAILED` **nema** automatsku
retry tranziciju — stage oporavka nije poznat, pa oporavak traži novu reviziju.

## 13.1 Kreiranje revizije i linearni lanac (D-031 klauzula 8, D-034)

Kreiranje child revizije nije uvijek tranzicija roditelja. Za dio dozvoljenih roditelja
roditelj **zadržava** svoj status, pa se to ne crta kao tranzicija u §13.

```mermaid
flowchart TD
    P[Parent revizija N] --> CHK{Roditelj već ima dijete?}
    CHK -- da --> CONF[409 REVISION_CONFLICT]
    CHK -- ne --> ST{Status roditelja dozvoljen?}
    ST -- ne --> INV[409 INVALID_STATE_TRANSITION]
    ST -- da --> MK[202 — child revizija N+1<br/>počinje u QUEUED]
    MK --> SUP[REVIEW_REQUIRED ili COMPLETED<br/>roditelj → SUPERSEDED]
    MK --> KEEP[REJECTED / FAILED / EXTRACTION_FAILED /<br/>TARIFF_EVALUATION_FAILED / CANCELLED<br/>roditelj zadržava status]
```

**Provjera postojanja djeteta prethodi validaciji statusa roditelja** (D-034). Zbog toga je
kod greške deterministički i ne zavisi od statusa roditelja.

Linearni lanac:

- historija revizija je **linearni lanac, ne stablo**;
- svaki roditelj ima **najviše jedno direktno dijete**;
- `revisionNumber` djeteta je `roditelj.revisionNumber + 1`;
- dijete počinje u `QUEUED`;
- **retry nikada ne kreira reviziju N+2** od istog roditelja;
- `parentAnalysisRunId` i `revisionNumber` su immutable nakon INSERT-a.

Nedozvoljeni roditelji: `QUEUED`, `PREPARING_INPUT`, `EXTRACTING`, `EVALUATING_TARIFF`,
`APPLYING_SAFETY_RULES`, `SUPERSEDED` i `APPROVED`. `APPROVED` mora prvo biti revoked u
`REVIEW_REQUIRED` (§11).

## 13.2 Otkazivanje analize (D-035)

Direktno otkazivanje kroz `POST /analyses/{id}/cancel`:

| Slučaj | Status | Ponašanje |
|---|---:|---|
| aktivno async stanje | `202` | analiza prelazi u `CANCELLED` |
| analiza je već `CANCELLED` | `200` | postojeća reprezentacija, **bez promjene stanja** |
| drugo neaktivno ili terminalno stanje | `409` | `INVALID_STATE_TRANSITION`, bez promjene stanja |

Aktivna async stanja: `QUEUED`, `PREPARING_INPUT`, `EXTRACTING`, `EVALUATING_TARIFF`,
`APPLYING_SAFETY_RULES`.

**Ponovljeno otkazivanje ne kreira dodatni audit event.** Audit event se upisuje isključivo
pri stvarnom prelasku u `CANCELLED`. Zato `CANCELLED → CANCELLED` **nije** tranzicija i ne
crta se u §13.

---

# 14. Data lineage

```mermaid
flowchart TD
    D[Encounter Documents] --> S[Input Snapshot + Hash]
    S --> A[AI Run + Prompt/Model]
    A --> F[Facts]
    A --> C[Candidates + Evidence]
    F --> TREQ[Tariff Request + Hash]
    C --> TREQ
    TREQ --> TRES[Tariff Raw Response + Hash]
    TRES --> ITEMS[Normalized Items]
    ITEMS --> RULES[Safety Rule Versions]
    RULES --> FIND[Findings]
    FIND --> REVIEW[Manual Changes/Decisions]
    REVIEW --> APP[Approved Payload + Hash]
    APP --> EXP[Export Job/Artifact]
    EXP --> AUD[Audit Package]
```
