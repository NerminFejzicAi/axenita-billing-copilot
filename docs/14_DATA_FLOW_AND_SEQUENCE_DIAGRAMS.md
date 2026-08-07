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

Normativno: D-033; `02` §16.2 i §17.3; `03` §3; `04` §6.2; `07` Faza 4.

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
        Auth->>Auth: resolve authenticated users.id
        Guard->>TenantDB: use case + requested practice id
        TenantDB->>PG: BEGIN
        TenantDB->>PG: set_user_context(p_user_id uuid)
        Note right of PG: app.user_id — transaction-local
        TenantDB->>PG: set_request_context(p_practice_id uuid)
        Note right of PG: SECURITY INVOKER<br/>user-scoped practice_memberships RLS

        alt no active membership
            PG-->>TenantDB: 42501
            TenantDB->>PG: ROLLBACK
            TenantDB-->>UI: 403 ACCESS_DENIED
            Note right of TenantDB: app.practice_id never set;<br/>no tenant query executed
        else active membership
            PG-->>TenantDB: app.practice_id set
            TenantDB->>PG: tenant queries
            TenantDB->>PG: audit / outbox
            TenantDB->>PG: COMMIT
            TenantDB-->>UI: result
        end
    end

    Note over TenantDB,PG: transaction end clears app.user_id and app.practice_id;<br/>pooled connection inherits no context
```

## 2.1 Sigurnosna pravila (D-033)

- `set_request_context` **ne prima `user_id`**; nijedan caller-provided identifikator korisnika se ne smatra pouzdanim;
- **SECURITY DEFINER se ne koristi za tenant bootstrap**;
- SECURITY INVOKER **ne zaobilazi** `practice_memberships` RLS;
- membership bootstrap mora raditi **prije nego `app.practice_id` postoji**;
- normalna tenant RLS ne može bootstrap-ovati kontekst koji sama zahtijeva;
- `practice_memberships` koristi posebnu user-scoped bootstrap politiku;
- `X-Practice-ID` sam po sebi **ne autorizuje** tenant pristup;
- neuspjeh bootstrapa ne ostavlja upotrebljiv `app.practice_id`, a tenant upiti se ne izvršavaju;
- transakcijski lokalni kontekst ne curi u drugi request ni u pooled konekciju;
- `platformRoles` i tenant membershipi su **odvojeni**; `platformRoles` ne kreiraju tenant pristup;
- platform/system context se **ne** uspostavlja kroz `set_request_context`.

## 2.2 Napomena — D-OPEN-011

Opšti runtime pristup nad `users` i `practices` je **neriješen**. Membership-bootstrap tok iz §2
**ne rješava** taj pristup, a dijagrami ne impliciraju neograničen pristup tim tabelama.

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
