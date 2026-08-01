# 13 — Open Questions and External Dependencies

Ovaj dokument sprečava da Cursor izmisli odgovore za dijelove koji zavise od ugovora ili poslovne odluke.

---

# 1. Produkcijski identity provider

**Status:** OPEN  
**Potrebno:** prije pilota  
**Opcije:** Keycloak, Entra ID, Auth0, drugi OIDC  
**Kriteriji:**

- MFA;
- Swiss/prihvatljiv hosting;
- DPA;
- role/group support;
- audit;
- availability;
- cijena.

**Development:** isolated dev auth.

---

# 2. ESM/CommonJS

**Status:** MUST DECIDE PHASE 1  
**Preporuka:** ESM/NodeNext ako NestJS/Prisma testovi prolaze.  
**Zabrana:** ne mijenjati nakon faze 2 bez ADR-a.

---

# 3. Encryption/KMS

**Status:** OPEN BEFORE PHASE 5 FINALIZATION  
**Potrebno odlučiti:**

- AES-GCM format;
- DEK granularnost;
- KMS provider;
- key rotation;
- local adapter;
- decrypt permission;
- backup recovery.

Cursor smije implementirati interface i development adapter, ali ne smije nazvati local static key produkcijski spremnim.

---

# 4. Produkcijski hosting

**Status:** OPEN  
**Kriteriji:**

- lokacija;
- PostgreSQL;
- object storage;
- Redis;
- KMS;
- backup;
- private networking;
- observability;
- ugovor/podobrađivači.

---

# 5. AI provider

**Status:** EXTERNAL/OPEN  
**Potrebno:**

- DPA;
- retention;
- training opt-out;
- region;
- structured output;
- SLA;
- cost;
- model version behavior.

Core koristi mock dok nije odobreno.

---

# 6. OAAT TarifMatcher

**Status:** BLOCKED EXTERNAL  
**Potrebno:**

- licenca;
- partner/software integrator uslovi;
- package artefakti;
- Java API;
- verzije;
- test cases;
- redistribution/deployment rights.

Cursor ne smije implementirati službenu logiku iz sekundarne dokumentacije.

---

# 7. Axenita

**Status:** BLOCKED EXTERNAL  
**Potrebno:**

- partner agreement;
- API docs;
- sandbox;
- auth;
- patient/encounter/document read;
- billing draft read/write;
- webhooks/polling;
- attachment;
- rate limit;
- idempotency;
- errors;
- reconciliation.

Do tada ManualAdapter.

---

# 8. Retention

**Status:** BUSINESS/LEGAL OPEN  
**Entiteti:**

- source document;
- redacted text;
- analysis;
- audit;
- raw AI;
- raw tariff;
- export artefact;
- log;
- backup.

Ne uvoditi fizički delete API prije odluke.

---

# 9. Approval role

**Status:** PRACTICE CONFIG DECISION  
Default:

- physician/admin approve;
- MPA ne;
- billing specialist configurable.

Potrebna pilot potvrda.

---

# 10. PDF audit generator

**Status:** DEFERRED  
Obavezan je JSON audit package. PDF izbor mora razmotriti:

- template;
- fonts/licence;
- rendering security;
- signature/hash;
- storage.

---

# 11. Exact tariff content display

**Status:** DEPENDS ON LICENSE  
UI catalog descriptions mogu imati licencna ograničenja. Ne seedovati stvarne kataloge bez prava.

---

# 12. Monetary calculation

**Status:** TARIFF ENGINE DEPENDENCY  
Da li službeni engine vraća amount/points ili backend dodatno mapira? Ne pretpostavljati. Polja ostaju nullable.

---

# 13. Diagnosis coding systems

**Status:** PILOT DISCOVERY  
MVP schema podržava generic system/code. Potvrditi šta Axenita/praxis koristi.

---

# 14. Object storage provider

**Status:** HOSTING DECISION  
Local MinIO; production adapter ostaje S3-compatible.

---

# 15. Monitoring provider

**Status:** OPEN  
Mora podržati data scrubbing i Swiss/privacy zahtjeve.

---

# 16. External dependency readiness table

| Dependency | Mock | Contract | Credentials | Legal | Production |
|---|---:|---:|---:|---:|---:|
| OIDC | dev | no | no | no | no |
| AI | yes | internal | no | no | no |
| Tarif Engine | yes | internal v1 | no | no | no |
| Axenita | manual | interface | no | no | no |
| S3 | MinIO | yes | local | n/a | no |
| KMS | dev adapter | interface | no | no | no |

---

# 17. Kako se zatvara pitanje

Za svako pitanje:

1. pribaviti dokument/odluku;
2. kreirati accepted ADR u Decision Logu;
3. ažurirati architecture/schema/API ako treba;
4. definisati test;
5. tek onda implementirati.
