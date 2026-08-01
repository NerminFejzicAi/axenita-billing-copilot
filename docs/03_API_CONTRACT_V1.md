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

Upload koristi presigned URL ili multipart endpoint prema dokumentovanom flowu.

---

# 3. Autentifikacija i context

## 3.1 Bearer token

```http
Authorization: Bearer <JWT>
```

Validacija:

- signature;
- issuer;
- audience;
- expiration;
- subject.

## 3.2 Practice context

```http
X-Practice-ID: <uuid>
```

Obavezan za tenant rute.

## 3.3 Request ID

Klijent može poslati:

```http
X-Request-ID: <uuid>
```

Ako ne pošalje, server generiše.

Server uvijek vraća:

```http
X-Request-ID: <uuid>
```

## 3.4 Jezik

```http
Accept-Language: de-CH
```

MVP podržava `de-CH`; error code je stabilan bez obzira na lokalizovanu poruku.

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
- request in progress → `409 REQUEST_ALREADY_IN_PROGRESS` ili definisani `425`;
- key scope: practice + user + endpoint;
- minimalni response cache;
- retention 24–72 sata prema endpointu.

---

# 5. Optimistic locking

Mutable resurs vraća:

```http
ETag: "4"
```

PATCH šalje:

```http
If-Match: "4"
```

Ako trenutna verzija nije 4:

```http
409 Conflict
```

Error code:

```text
VERSION_CONFLICT
```

Primjenjuje se na:

- encounter;
- finding resolution;
- integration connection;
- practice settings;
- drugi mutable admin resurs.

Analysis revision sama po sebi nije "edit in place"; kreira se nova revizija.

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
IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_CONFLICT
REQUEST_ALREADY_IN_PROGRESS
INVALID_STATE_TRANSITION
ENCOUNTER_NOT_ANALYSABLE
ANALYSIS_ALREADY_RUNNING
ANALYSIS_NOT_APPROVABLE
OPEN_BLOCKING_FINDINGS
APPROVAL_REQUIRED
APPROVAL_REVOKED
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
| 403 | nema permission/membership |
| 404 | resurs nije vidljiv ili ne postoji |
| 409 | state/version/idempotency konflikt |
| 413 | upload prevelik |
| 415 | content type nije podržan |
| 422 | semantička validacija |
| 429 | rate limit |
| 500 | neočekivana interna greška |
| 502/503 | dependency problem |

Cross-tenant resource se u pravilu vraća kao `404` da se ne potvrđuje postojanje.

---

# 10. `/me` i practice

## GET `/me`

Permission: authenticated.

Response:

```json
{
  "id": "user-uuid",
  "email": "arzt@example.ch",
  "displayName": "Dr. Anna Muster",
  "preferredLanguage": "de-CH",
  "memberships": [
    {
      "practiceId": "practice-uuid",
      "practiceName": "Praxis Muster",
      "role": "PHYSICIAN",
      "permissions": [
        "encounter.read",
        "analysis.run",
        "analysis.approve"
      ]
    }
  ]
}
```

## GET `/practices/{practiceId}`

Permission: `practice.read`.

## GET `/practices/{practiceId}/settings`

Permission: `practice.settings.read`.

## PATCH `/practices/{practiceId}/settings`

Permission: `practice.settings.manage`.

Headers:

```http
If-Match: "3"
```

Request primjer:

```json
{
  "billingReviewRequired": true,
  "allowMpaApproval": false,
  "requireReasonForManualChange": true
}
```

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

Response `201`:

```json
{
  "id": "uuid",
  "pseudonym": "P-7F2A91",
  "birthYear": 1968,
  "sexCode": "F",
  "sourceSystem": "MANUAL",
  "createdAt": "2026-07-18T10:00:00Z"
}
```

## GET `/patient-references/{id}`

Permission: `patient_reference.read`.

Ne vraća external plaintext.

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
    "pseudonym": "P-7F2A91"
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

Response item:

```json
{
  "id": "uuid",
  "patientPseudonym": "P-7F2A91",
  "treatmentDate": "2026-07-17",
  "status": "REVIEW_REQUIRED",
  "responsiblePhysician": {
    "id": "uuid",
    "displayName": "Dr. Muster"
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

## PATCH `/encounters/{encounterId}`

Permission: `encounter.update`.

Headers:

```http
If-Match: "4"
```

Request je partial DTO. Nije dozvoljeno proizvoljno mijenjati status.

Response vraća novi `ETag`.

## POST `/encounters/{encounterId}/cancel`

Permission: `encounter.cancel`.

Idempotency key.

Request:

```json
{
  "reason": "Doppelt importierter Kontakt."
}
```

Dozvoljena stanja:

- DRAFT;
- READY_FOR_ANALYSIS;
- REVIEW_REQUIRED.

## POST `/encounters/{encounterId}/close`

Permission: `encounter.close`.

Dozvoljeno kada nema aktivnih poslova i export stanje je konzistentno.

---

# 13. Document API

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

## POST `/encounters/{id}/documents/upload-url`

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

## POST `/encounters/{id}/documents/{documentId}/complete`

Request:

```json
{
  "sha256": "..."
}
```

Server provjerava size/hash/MIME/antivirus prema konfiguraciji.

## GET `/encounters/{id}/documents`

Permission: `encounter.document.list`.

## GET `/encounters/{id}/documents/{documentId}`

Permission: `encounter.document.read`.

Query:

```text
view=redacted|original
```

`original` zahtijeva jaču permission i kreira `DOCUMENT_VIEWED`.

## POST `/encounters/{id}/documents/{documentId}/archive`

Umjesto DELETE nakon analize.

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
    "patientPseudonym": "P-7F2A91",
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

## POST `/analyses/{analysisId}/revisions`

Permission: `analysis.run`.

Request:

```json
{
  "reason": "Konsultationsdauer ergänzt.",
  "reuseConfirmedFacts": true,
  "reuseManualCorrections": true
}
```

Server mora eksplicitno definisati šta se prenosi. AI/tariff rezultat se ne kopira kao validan rezultat.

Response `202`.

## POST `/analyses/{analysisId}/cancel`

Dozvoljeno samo u aktivnom async stanju.

---

# 16. Facts API

## GET `/analyses/{analysisId}/facts`

Permission: `analysis.read`.

## PATCH `/analyses/{analysisId}/facts/{factId}`

Permission: `analysis.correct_fact`.

Headers:

```http
If-Match: "finding/resource version ako je implementiran"
```

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

```json
{
  "reviewState": "CORRECTED",
  "effectiveServiceCode": "EXAMPLE.CODE.2",
  "effectiveQuantity": "2.0000",
  "reason": "Korrigiert nach dokumentierter Dauer."
}
```

## POST `/analyses/{analysisId}/service-candidates/{candidateId}/reject`

Umjesto DELETE.

```json
{
  "reason": "Nicht dokumentiert."
}
```

---

# 18. Tarifna evaluacija

## POST `/analyses/{analysisId}/tariff-evaluation`

Permission: `analysis.run_tariff`.

Za v1 preferirati novu revision nakon značajne korekcije. Ovaj endpoint se može koristiti unutar iste neodobrene revizije samo ako je state model jasno implementiran.

Request:

```json
{
  "reason": "SERVICE_CANDIDATES_CHANGED"
}
```

Response `202` sa job ID.

## GET `/analyses/{analysisId}/tariff-evaluation`

Permission: `analysis.read`.

Vraća normalizovani rezultat.

## GET `/analyses/{analysisId}/tariff-evaluation/raw`

Permission: `tariff.raw_result.read`, tipično admin/auditor.

Response mora biti auditovan i sanitizovan gdje je potrebno.

---

# 19. Findings API

## GET `/analyses/{analysisId}/findings`

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

Headers: `If-Match`.

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

### Save draft

```json
{
  "decision": "SAVE_DRAFT",
  "reason": "Prüfung wird später fortgesetzt.",
  "expectedAnalysisRevision": 2
}
```

### Request changes

```json
{
  "decision": "REQUEST_CHANGES",
  "reason": "Dauerangabe fehlt.",
  "expectedAnalysisRevision": 2
}
```

### Reject

```json
{
  "decision": "REJECT",
  "reason": "Dokumentation unterstützt die vorgeschlagenen Leistungen nicht.",
  "expectedAnalysisRevision": 2
}
```

### Approve

Permission: `analysis.approve`.

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

## POST `/analyses/{analysisId}/approval/revoke`

Permission: `analysis.approval.revoke`.

```json
{
  "reason": "Nachträglicher Dokumentationsfehler."
}
```

Revocation ne briše approval.

---

# 21. Export API

## POST `/analyses/{analysisId}/exports`

Permission: `analysis.export`.

Headers: Idempotency-Key.

Request:

```json
{
  "integrationConnectionId": "uuid",
  "target": "MANUAL_BILLING_DRAFT",
  "mode": "CREATE_DRAFT"
}
```

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

Retry samo FAILED i isti approval hash.

## GET `/exports/{exportJobId}/artifact`

Za ManualAdapter može vratiti presigned download URL za JSON/PDF.

---

# 22. Audit API

## GET `/analyses/{analysisId}/audit-events`

Permission: `audit.read`.

Cursor pagination.

## GET `/analyses/{analysisId}/audit-package`

Permission: `audit.read`.

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

## POST `/analyses/{analysisId}/audit-package/pdf`

Permission: `audit.export`.

Async; response job ID.

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

## GET `/jobs/{jobId}/events`

SSE je opcionalni v1 dodatak. Polling je dovoljan za prvi rez.

SSE ne smije slati medicinski sadržaj.

---

# 24. Tariff release admin API

Base permission: `tariff.manage`.

```text
GET  /admin/tariff-releases
POST /admin/tariff-releases
GET  /admin/tariff-releases/{id}
POST /admin/tariff-releases/{id}/validate
POST /admin/tariff-releases/{id}/activate
POST /admin/tariff-releases/{id}/deactivate
```

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

# 25. Prompt/rule admin API

Permission: `configuration.manage`.

```text
GET  /admin/ai-prompts
POST /admin/ai-prompts/{promptCode}/versions
POST /admin/ai-prompt-versions/{id}/activate

GET  /admin/safety-rules
GET  /admin/safety-rules/{id}
POST /admin/safety-rules/{id}/versions
POST /admin/safety-rule-versions/{id}/activate
```

Aktivni prompt/rule version se ne uređuje; kreira se nova verzija.

---

# 26. Integration admin API

Permission: `integration.manage`.

```text
GET   /admin/integrations
POST  /admin/integrations
GET   /admin/integrations/{id}
PATCH /admin/integrations/{id}
POST  /admin/integrations/{id}/credentials
POST  /admin/integrations/{id}/test
POST  /admin/integrations/{id}/activate
POST  /admin/integrations/{id}/deactivate
```

Credentials endpoint:

- prima secret;
- šalje ga direktno u secrets manager;
- u DB čuva reference;
- nikada ne vraća secret.

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

Minimalno:

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
analysis.run_tariff
analysis.correct_fact
analysis.correct_service
analysis.approve
analysis.approval.revoke
analysis.export
analysis.export.read

finding.resolve
audit.read
audit.export

tariff.manage
configuration.manage
integration.manage
```

Role mapping se nalazi u kodu ili konfiguraciji, ali permission string je centralizovan.

---

# 29. State machine

## 29.1 Encounter

```text
DRAFT
  → READY_FOR_ANALYSIS
  → ANALYSIS_IN_PROGRESS
  → REVIEW_REQUIRED
  → APPROVED
  → EXPORT_PENDING
  → EXPORTED
  → CLOSED
```

Alternative:

```text
DRAFT/READY/REVIEW → CANCELLED
APPROVED → REVIEW_REQUIRED ako approval revoked
EXPORT_PENDING → APPROVED ako export failed
```

## 29.2 Analysis

```text
QUEUED
→ PREPARING_INPUT
→ EXTRACTING
→ EVALUATING_TARIFF
→ APPLYING_SAFETY_RULES
→ REVIEW_REQUIRED ili COMPLETED
→ APPROVED
```

Failure:

```text
EXTRACTION_FAILED
TARIFF_EVALUATION_FAILED
FAILED
```

Nova revizija:

```text
old → SUPERSEDED
new → QUEUED
```

State transition provjerava backend; DTO ne prima proizvoljan status.

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

---

# 34. API Definition of Done

- `/api/v1` versioning;
- OpenAPI 3.1 generisan;
- global validation;
- Problem Details;
- JWT;
- practice guard;
- permission guard;
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
