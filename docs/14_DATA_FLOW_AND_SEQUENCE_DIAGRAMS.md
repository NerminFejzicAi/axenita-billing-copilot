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

```mermaid
sequenceDiagram
    participant UI
    participant Guard
    participant Membership
    participant TenantDB
    participant PG

    UI->>Guard: JWT + X-Practice-ID
    Guard->>Membership: resolve user/membership
    Membership->>PG: membership query
    PG-->>Membership: active role
    Guard-->>UI: continue with PracticeContext
    UI->>TenantDB: business use case
    TenantDB->>PG: BEGIN
    TenantDB->>PG: set_request_context(practice,user)
    TenantDB->>PG: tenant queries
    TenantDB->>PG: audit/outbox
    TenantDB->>PG: COMMIT
```

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

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> READY_FOR_ANALYSIS
    DRAFT --> CANCELLED
    READY_FOR_ANALYSIS --> ANALYSIS_IN_PROGRESS
    READY_FOR_ANALYSIS --> CANCELLED
    ANALYSIS_IN_PROGRESS --> REVIEW_REQUIRED
    ANALYSIS_IN_PROGRESS --> READY_FOR_ANALYSIS: failure/retry policy
    REVIEW_REQUIRED --> ANALYSIS_IN_PROGRESS: new revision
    REVIEW_REQUIRED --> APPROVED
    REVIEW_REQUIRED --> CANCELLED
    APPROVED --> EXPORT_PENDING
    APPROVED --> REVIEW_REQUIRED: approval revoked
    EXPORT_PENDING --> EXPORTED
    EXPORT_PENDING --> APPROVED: export failed
    EXPORTED --> CLOSED
```

---

# 13. Analysis state

```mermaid
stateDiagram-v2
    [*] --> QUEUED
    QUEUED --> PREPARING_INPUT
    PREPARING_INPUT --> EXTRACTING
    EXTRACTING --> EVALUATING_TARIFF
    EXTRACTING --> EXTRACTION_FAILED
    EVALUATING_TARIFF --> APPLYING_SAFETY_RULES
    EVALUATING_TARIFF --> TARIFF_EVALUATION_FAILED
    APPLYING_SAFETY_RULES --> REVIEW_REQUIRED
    APPLYING_SAFETY_RULES --> COMPLETED
    REVIEW_REQUIRED --> APPROVED
    REVIEW_REQUIRED --> SUPERSEDED
    COMPLETED --> APPROVED
    QUEUED --> CANCELLED
```

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
