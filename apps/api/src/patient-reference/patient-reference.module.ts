import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { CryptoModule } from '../crypto/crypto.module.js';
import { IdempotencyModule } from '../idempotency/idempotency.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { PatientReferenceCreateService } from './application/patient-reference-create.service.js';
import { PatientReferenceLookupService } from './application/patient-reference-lookup.service.js';
import { PatientReferenceReadService } from './application/patient-reference-read.service.js';
import { PatientReferencesController } from './controllers/patient-references.controller.js';
import { PseudonymGenerator } from './domain/pseudonym.generator.js';
import { PatientReferenceDatabase } from './infrastructure/patient-reference.database.js';

/**
 * Patient-reference domain — the `P5-I4A` read and the `P5-I4C` write (`04` §7.5a; D-072
 * `OD-P5-I4-13`; D-073; D-079 `RULING B`).
 *
 * Registers EXACTLY TWO routes: `GET /api/v1/patient-references/{id}` and
 * `POST /api/v1/patient-references`. The two service-level lookups of `P5-I4C` add NO route
 * (D-072 `OD-P5-I4-14`), and the encounter, document, analysis and redaction surfaces belong to
 * later slices and are not registered, stubbed or anticipated here (`04` §3.4).
 *
 * IT IMPORTS THE OTHER MODULES RATHER THAN RE-PROVIDING ANYTHING
 *
 * - `IdentityModule` — `IdentityBootstrapService` and `TenantRequestPipeline` are the SAME
 *   provider instances the practice, settings and read routes receive. There is exactly one
 *   authenticated bootstrap chain and exactly one tenant admission pipeline
 *   (`TENANT_ADMISSION_PIPELINE_COUNT = 1`), so no route can drift from the frozen order of
 *   `03` §3.7.1;
 * - `IdempotencyModule` — the cross-cutting mechanism of `03` §4, applied BY this command route
 *   and owned by neither of them alone;
 * - `AuditModule` — the append-only writer. The audit row is written on the caller's admitted
 *   session, which is what makes business and audit atomic (`04` §7.5a.3);
 * - `CryptoModule` — `EXTERNAL_REFERENCE_HMAC` only. `HMAC_KEY_PROVIDER` is module-internal
 *   there, so this module can compute a keyed token and can never read a key.
 *
 * `TenantDatabaseService` arrives from the global `DatabaseModule` and needs no import.
 *
 * THE PURE `P5-I4B` PRIMITIVES AND THE PURE ADVISORY-LOCK DERIVATION ARE NOT WIRED, and that is
 * the ratified position rather than an omission: D-078 `OD-P5-I4B-C5` adjudicated the absence
 * `CONFORMANT` / `NO GAP` and D-079 `RULING B` requires them to be consumed by DIRECT IMPORT with
 * no wiring introduced to "repair" it.
 *
 * `PatientReferenceDatabase` is the FEATURE ADAPTER and is the only class in this module that
 * holds SQL. `PseudonymGenerator` is the CSPRNG seam, a provider so that a spec can substitute it
 * whole rather than switch a mode inside it.
 *
 * NO SECOND DATABASE STACK IS INTRODUCED. This module provides no `PrismaService`, no
 * `PrismaClient`, no repository over a raw client and no request transaction. Every statement it
 * issues — the read, the advisory lock, the claim, the insert, the audit row and the completion —
 * runs on the ONE pinned session of the ONE interactive transaction the identity bootstrap opened
 * (D-054 clauses 6-8, D-056 clause 5).
 */
@Module({
  imports: [IdentityModule, IdempotencyModule, AuditModule, CryptoModule],
  controllers: [PatientReferencesController],
  providers: [
    PatientReferenceReadService,
    PatientReferenceCreateService,
    PatientReferenceLookupService,
    PatientReferenceDatabase,
    PseudonymGenerator,
  ],
})
export class PatientReferenceModule {}
