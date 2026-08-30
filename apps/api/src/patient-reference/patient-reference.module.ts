import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module.js';
import { PatientReferenceReadService } from './application/patient-reference-read.service.js';
import { PatientReferencesController } from './controllers/patient-references.controller.js';
import { PatientReferenceDatabase } from './infrastructure/patient-reference.database.js';

/**
 * Patient-reference domain — the `P5-I4A` slice (`04` §7.5a; D-072 `OD-P5-I4-13`; D-073).
 *
 * Registers EXACTLY ONE route: `GET /api/v1/patient-references/{id}`. `POST
 * /patient-references`, the idempotency service, the audit writer, the pseudonym and
 * external-reference service lookups and every deterministic hash format belong to `P5-I4B` and
 * `P5-I4C` and are not registered, stubbed or anticipated here (`04` §3.4).
 *
 * IT IMPORTS THE IDENTITY MODULE RATHER THAN RE-PROVIDING ANYTHING. `IdentityBootstrapService`
 * and `TenantRequestPipeline` are the SAME provider instances the practice and settings routes
 * receive, which is the whole point: there is exactly one implementation of the authenticated
 * bootstrap chain and exactly one tenant admission pipeline
 * (`TENANT_ADMISSION_PIPELINE_COUNT = 1`), so no route can drift from the frozen order of
 * `03` §3.7.1. Providing either of them again here would create a second, independently
 * evolvable admission path — which D-073 forbids by name.
 *
 * `TenantDatabaseService` arrives from the global `DatabaseModule` and needs no import. It owns
 * no client and opens no transaction; it narrows the ADMITTED request to a statement surface.
 *
 * `PatientReferenceDatabase` is the FEATURE ADAPTER and is the only class in this slice that
 * holds SQL. Keeping it here — rather than adding a method to the identity port — is what D-073
 * requires: "feature-specifično patient-reference DB ponašanje ostaje u feature adapteru".
 *
 * NO SECOND DATABASE STACK IS INTRODUCED. This module provides no `PrismaService`, no
 * `PrismaClient`, no repository over a raw client and no request transaction. Every statement it
 * issues runs on the one pinned session of the one interactive transaction the identity
 * bootstrap opened (D-054 clauses 6-8, D-056 clause 5).
 */
@Module({
  imports: [IdentityModule],
  controllers: [PatientReferencesController],
  providers: [PatientReferenceReadService, PatientReferenceDatabase],
})
export class PatientReferenceModule {}
