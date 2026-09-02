import { Module } from '@nestjs/common';

import { IdempotencyService } from './application/idempotency.service.js';
import { IdempotencyDatabase } from './infrastructure/idempotency.database.js';

/**
 * The cross-cutting idempotency mechanism — the `P5-I4C` slice (`04` §7.5a.3; `05` §6
 * `Services → idempotency service`; D-072; D-079 `RULING B` item 1).
 *
 * A DEDICATED MODULE, NOT A CORNER OF THE PATIENT-REFERENCE MODULE. `03` §4 makes
 * `Idempotency-Key` mandatory on NINE command surfaces spread across several future business
 * modules; placing the mechanism inside the first of them would make every later one depend on a
 * business module for a cross-cutting concern. It is equally not `CommonModule` material: that
 * module owns HTTP-shaped cross-cutting technical concerns and `01` §6.1 forbids it becoming a
 * miscellaneous folder, while this module owns a table, three policies and four statements.
 *
 * D-079 `RULING B` leaves file placement to ordinary implementor discretion within the canonical
 * architecture, and this is that discretion exercised the same way `CryptoModule` already was.
 *
 * WHAT IT DELIBERATELY DOES NOT CONTAIN
 *
 * - no `PrismaService`, no `PrismaClient`, no repository over a raw client and no transaction
 *   helper. `IdempotencyDatabase` reaches the pinned connection through the global
 *   `TenantDatabaseService` facade, on the transaction the identity bootstrap opened
 *   (D-054 clauses 6-8, D-056 clause 5);
 * - no controller and no route. Idempotency is applied BY a command route, never exposed as one;
 * - no cleanup job, no TTL sweeper and no `expires_at` maintenance. The retention path has no
 *   phase 5 consumer and is not invented here (`03` §4.2);
 * - no Nest wiring for the pure `P5-I4B` hash primitives or for the pure advisory-lock
 *   derivation. Both are stateless functions consumed by direct import, which D-078
 *   `OD-P5-I4B-C5` adjudicated `CONFORMANT` / `NO GAP` and D-079 `RULING B` reaffirms.
 */
@Module({
  providers: [IdempotencyService, IdempotencyDatabase],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
