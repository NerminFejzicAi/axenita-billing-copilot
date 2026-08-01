# 12 — Naming and Code Standards

---

# 1. Jezik

- Kod, identifiers, API fields i error codes: engleski.
- User-facing MVP tekst: `de-CH`.
- Projektna objašnjenja mogu biti B/H/S.
- Ne miješati prevod u stabilne enum vrijednosti.

---

# 2. Folderi

Feature-first.

```text
encounters/
├── controllers/
├── dto/
├── application/
├── domain/
├── repositories/
├── mappers/
├── policies/
└── encounters.module.ts
```

Ne koristiti ogromni globalni `services/` folder.

---

# 3. Fajlovi

```text
create-encounter.dto.ts
encounter-response.dto.ts
encounters.controller.ts
create-encounter.service.ts
encounters.repository.ts
encounter-state-machine.ts
```

Klase PascalCase, fajl kebab-case.

---

# 4. TypeScript

- strict;
- explicit return za public methods;
- no `any`;
- prefer `unknown` + validation;
- readonly gdje moguće;
- no floating money;
- no default export za business klase;
- centralni injection token;
- no magic strings.

---

# 5. DTO

Request DTO:

```text
CreateEncounterDto
UpdateEncounterDto
ApproveAnalysisDto
```

Response:

```text
EncounterResponseDto
AnalysisWorkspaceResponseDto
ProblemDetailsDto
```

Ne vraćati Prisma entity direktno.

---

# 6. Commands/queries

Application service može koristiti:

```text
CreateEncounterService
GetEncounterService
ListEncountersService
ApproveAnalysisService
```

Ne koristiti jedan `EncounterService` od više hiljada linija.

---

# 7. Repository

Metode:

```text
findById
findForUpdate
create
list
updateWithVersion
```

Naziv mora pokazati lock/tenant kontekst kada je bitno.

---

# 8. Database

- snake_case;
- plural table;
- constraint name eksplicitan;
- index name `<table>_<purpose>_idx`;
- FK `<table>_<relation>_fk`;
- check `<table>_<rule>_check`;
- policy `<table>_<operation>_policy`.

---

# 9. API

- plural nouns;
- commands kao subresource/action kada PATCH nije adekvatan;
- no verbs poput `/getEncounter`;
- stable operationId.

Primjeri:

```text
POST /encounters
POST /encounters/{id}/analyses
POST /analyses/{id}/decisions
```

---

# 10. Enum/status

Upper snake technical values:

```text
REVIEW_REQUIRED
TARIFF_EVALUATION_FAILED
ACCEPTED_RISK
```

Ne čuvati lokalizovani tekst kao enum.

---

# 11. Error code

```text
DOMAIN_REASON
```

Primjer:

```text
ANALYSIS_ALREADY_RUNNING
OPEN_BLOCKING_FINDINGS
IDEMPOTENCY_CONFLICT
```

Jedan centralni katalog.

---

# 12. Audit action

Past-tense business action:

```text
ENCOUNTER_CREATED
DOCUMENT_VIEWED
ANALYSIS_APPROVED
EXPORT_SUCCEEDED
```

---

# 13. Logging

Message kratka, attributes strukturirani.

Dobro:

```text
message: "Tariff evaluation failed"
errorCode: "TARIFF_ENGINE_TIMEOUT"
analysisId: "..."
```

Loše:

```text
message: "Patient Max Muster note ... failed ..."
```

---

# 14. Test fixture

Generički/anonymized:

```text
P-TEST-A
TEST-ENCOUNTER-A
"Konsultation 18 Minuten."
```

Bez realnih podataka.

---

# 15. Comments

Komentar objašnjava zašto/invariant, ne ponavlja kod.

Migration SQL mora komentarisati:

- security-definer;
- RLS;
- trigger;
- unusual constraint;
- rollout.

---

# 16. Transaction

Naziv use casea i kod jasno pokazuju transaction boundary.

Ne pokretati external HTTP poziv unutar dugog DB transactiona osim ako je eksplicitno dizajnirano. Pipeline radi:

1. status transaction;
2. external call izvan lock transactiona;
3. persist transaction uz checkpoint.

---

# 17. Decimal mapping

Interno Prisma Decimal; API mapper:

```text
decimal.toFixed(scale)
```

Ne `Number(decimal)` za billing.

---

# 18. Date

- API ISO;
- `DateOnly` semantika dokumentovana;
- treatment date ne konvertovati slučajno timezoneom;
- `date` field mapirati pažljivo.

---

# 19. Dependency injection

External:

```text
AI_EXTRACTION_PROVIDER
TARIFF_ENGINE_CLIENT
PRACTICE_SYSTEM_ADAPTER
ENCRYPTION_SERVICE
CLOCK
```

Mock/test zamjenjiv.

---

# 20. Commit

```text
type(scope): imperative summary
```

Primjer:

```text
feat(security): enforce tenant RLS context
test(approval): cover concurrent approval
docs(backend): record encryption decision
```
