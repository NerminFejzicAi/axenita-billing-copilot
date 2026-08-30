import { Module } from '@nestjs/common';

import { IdentityBootstrapService } from './application/identity-bootstrap.service.js';
import { PracticeReadService } from './application/practice-read.service.js';
import { PracticeSettingsReadService } from './application/practice-settings-read.service.js';
import { PracticeSettingsWriteService } from './application/practice-settings-write.service.js';
import { TenantRequestPipeline } from './application/tenant-request.pipeline.js';
import { DevelopmentAuthGuard } from './authentication/development-auth.guard.js';
import { MeController } from './controllers/me.controller.js';
import { PracticeSettingsController } from './controllers/practice-settings.controller.js';
import { PracticesController } from './controllers/practices.controller.js';
import { IDENTITY_DATABASE } from './infrastructure/identity-database.port.js';
import { PrismaIdentityDatabase } from './infrastructure/prisma-identity.database.js';

/**
 * Identity domain — phase 3 (`04` §5.2), extended by the phase 4 settings read and write.
 *
 * Registers exactly four routes: `GET /api/v1/me` and `GET /api/v1/practices/{practiceId}` from
 * phase 3, and both `GET` and `PATCH /api/v1/practices/{practiceId}/settings` from phase 4
 * (D-053 part A, D-055 parts D to G). Nothing else on the settings path exists: no `PUT`, no
 * `POST`, no `DELETE` and no sub-resource, so each of those stays `404`.
 *
 * `DevelopmentAuthGuard` is a provider of this module rather than a global guard: the four
 * authenticated routes declare it themselves, and `/health/*` must stay unauthenticated
 * (`03` §3.4). Because it is instantiated when this module is created, its refusal to build
 * under `NODE_ENV=production` fails process startup (`09` §5).
 *
 * All three route services depend on `IdentityBootstrapService` rather than on the database port,
 * which is what makes the authenticated bootstrap chain of `03` §3.7.1 steps 1–2 impossible to
 * duplicate: there is exactly one implementation of it and every route goes through it.
 *
 * THE WRITE IS A SEPARATE SERVICE, NOT A METHOD ON THE READ. `PracticeSettingsWriteService` owns
 * the whole of `PATCH` — the `If-Match` parse, the delayed body validation, the atomic
 * optimistic-concurrency `UPDATE` and the `409` — and `PracticeSettingsReadService` gained no
 * write semantics for it (D-055 part E). What the two share, they share by importing one
 * implementation: the same tenant pipeline, the same bootstrap and the same eight-field
 * representation.
 *
 * `TenantRequestPipeline` is the tenant half of the same chain — steps 3 to 10, including
 * `set_request_context`. It is a plain provider and deliberately NOT a `CanActivate`: a Nest
 * guard runs before the controller and therefore before the interactive transaction exists, so
 * it could neither respect the mandatory order of `03` §3.7.1 nor establish a transaction-local
 * `app.practice_id` at all. It holds no database client, and its only entry point requires a
 * session that exists exclusively inside an already-admitted authenticated transaction.
 *
 * IT IS REGISTERED ONCE AND SHARED. Every tenant route added since `GET /practices/{practiceId}`
 * — the settings read, and now the settings write — introduces NO second pipeline, no
 * route-specific tenant stage and no `PracticeContextGuard`: all three tenant services receive
 * this very provider, so the frozen order of `03` §3.7.1 cannot drift per route (D-054, D-055
 * clause 28). The write route differs from the read route in exactly two values — the permission
 * it requires and what it does at step 11 — and in nothing else.
 *
 * The database port is bound here, so the application services depend on the interface and
 * never on Prisma. There is exactly one binding: one `PrismaService`, one `copilot_app` client
 * and one transactional session abstraction serve every route. No second database stack, no
 * second `PrismaClient` and no second request transaction is introduced by either settings slice
 * (D-055 clause 29).
 */
@Module({
  controllers: [MeController, PracticesController, PracticeSettingsController],
  providers: [
    DevelopmentAuthGuard,
    IdentityBootstrapService,
    TenantRequestPipeline,
    PracticeReadService,
    PracticeSettingsReadService,
    PracticeSettingsWriteService,
    { provide: IDENTITY_DATABASE, useClass: PrismaIdentityDatabase },
  ],
  // EXPORTED SO THAT LATER TENANT MODULES REUSE THESE VERY INSTANCES, NEVER COPIES OF THEM.
  //
  // `P5-I4A` adds `GET /patient-references/{id}` in its own module (`04` §3.4 keeps a business
  // module in its own module). That route must enter the SAME authenticated bootstrap chain and
  // the SAME single tenant admission pipeline as every route above — `TENANT_ADMISSION_PIPELINE_
  // COUNT = 1` (D-073) — so the pipeline and the bootstrap are exported and imported rather than
  // re-provided. Re-providing either would create a second provider instance and therefore a
  // second, independently evolvable admission path, which is precisely what the decision
  // forbids. `DevelopmentAuthGuard` is exported for the same reason: one guard class, one
  // instance, one token verification.
  exports: [DevelopmentAuthGuard, IdentityBootstrapService, TenantRequestPipeline],
})
export class IdentityModule {}
