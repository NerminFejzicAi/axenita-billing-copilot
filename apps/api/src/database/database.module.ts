import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';
import { TenantDatabaseService } from './tenant-database.service.js';

/**
 * Database access layer (01 §6.2).
 *
 * Global because every later feature module needs the same single client instance
 * (04 §4.4 step 7). It exposes `PrismaService` and the tenant facade, and nothing else.
 *
 * It now also exposes the concrete `TenantDatabaseService` facade. D-056 clause 4 deferred that
 * class CONDITIONALLY — the obligation activates when a real tenant business module requests the
 * abstraction — and `P5-I4A` is that module (D-072 `OD-P5-I4-13`, D-073). The facade holds no
 * client of its own: it is registered here because this is the database layer, not because it
 * owns anything the layer owns.
 *
 * What this module deliberately still does not contain:
 * - a second `PrismaService`, a second `PrismaClient` or a request-scoped transaction helper.
 *   There is exactly one client and exactly one interactive transaction per request, opened by
 *   the identity bootstrap and reused by every tenant feature (D-054 clauses 6-8);
 * - repositories, which belong to the feature modules that own their tables. The
 *   patient-reference statement lives in the patient-reference feature adapter and is passed
 *   through the facade, never built inside it (D-073);
 * - any RLS policy, which is created by the migration packages.
 */
@Global()
@Module({
  providers: [PrismaService, TenantDatabaseService],
  exports: [PrismaService, TenantDatabaseService],
})
export class DatabaseModule {}
