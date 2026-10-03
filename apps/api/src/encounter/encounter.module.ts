import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { IdempotencyModule } from '../idempotency/idempotency.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { EncounterCreateService } from './application/encounter-create.service.js';
import { EncountersController } from './controllers/encounters.controller.js';
import { EncounterDatabase } from './infrastructure/encounter.database.js';

/**
 * Encounter domain — `P5-I5B`, encounter create only (D-085 `OD-D085-13`).
 *
 * Registers EXACTLY ONE route, `POST /api/v1/encounters`. It imports the shared identity,
 * idempotency and audit modules rather than re-providing anything, so there is still exactly one
 * authenticated bootstrap chain, one tenant admission pipeline, one idempotency mechanism and one
 * audit writer. `TenantDatabaseService` arrives from the global `DatabaseModule`.
 *
 * NO SECOND DATABASE STACK. `EncounterDatabase` is the feature adapter and the only class here
 * holding SQL; it runs every statement on the one pinned session of the one admitted transaction.
 * The `P5-I5A` state machine is pure domain code and is consumed by direct import, unchanged.
 */
@Module({
  imports: [IdentityModule, IdempotencyModule, AuditModule],
  controllers: [EncountersController],
  providers: [EncounterCreateService, EncounterDatabase],
})
export class EncounterModule {}
