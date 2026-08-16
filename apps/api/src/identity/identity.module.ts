import { Module } from '@nestjs/common';

import { IdentityBootstrapService } from './application/identity-bootstrap.service.js';
import { PracticeReadService } from './application/practice-read.service.js';
import { PracticeSettingsReadService } from './application/practice-settings-read.service.js';
import { TenantRequestPipeline } from './application/tenant-request.pipeline.js';
import { DevelopmentAuthGuard } from './authentication/development-auth.guard.js';
import { MeController } from './controllers/me.controller.js';
import { PracticeSettingsController } from './controllers/practice-settings.controller.js';
import { PracticesController } from './controllers/practices.controller.js';
import { IDENTITY_DATABASE } from './infrastructure/identity-database.port.js';
import { PrismaIdentityDatabase } from './infrastructure/prisma-identity.database.js';

/**
 * Identity domain — phase 3 (`04` §5.2), extended by the phase 4 settings read.
 *
 * Registers exactly three routes: `GET /api/v1/me` and `GET /api/v1/practices/{practiceId}` from
 * phase 3, and `GET /api/v1/practices/{practiceId}/settings` from phase 4 (D-053 part A).
 * `PATCH /api/v1/practices/{practiceId}/settings` belongs to a later slice and is deliberately
 * not registered here, not even as a stub, so it remains `404`.
 *
 * `DevelopmentAuthGuard` is a provider of this module rather than a global guard: the three
 * authenticated routes declare it themselves, and `/health/*` must stay unauthenticated
 * (`03` §3.4). Because it is instantiated when this module is created, its refusal to build
 * under `NODE_ENV=production` fails process startup (`09` §5).
 *
 * `PracticeReadService` and `PracticeSettingsReadService` depend on `IdentityBootstrapService`
 * rather than on the database port, which is what makes the authenticated bootstrap chain of
 * `03` §3.7.1 steps 1–2 impossible to duplicate: there is exactly one implementation of it and
 * all three routes go through it.
 *
 * `TenantRequestPipeline` is the tenant half of the same chain — steps 3 to 10, including
 * `set_request_context`. It is a plain provider and deliberately NOT a `CanActivate`: a Nest
 * guard runs before the controller and therefore before the interactive transaction exists, so
 * it could neither respect the mandatory order of `03` §3.7.1 nor establish a transaction-local
 * `app.practice_id` at all. It holds no database client, and its only entry point requires a
 * session that exists exclusively inside an already-admitted authenticated transaction.
 *
 * IT IS REGISTERED ONCE AND SHARED. The settings route is the first tenant route added after
 * `GET /practices/{practiceId}`, and it introduces NO second pipeline, no route-specific tenant
 * stage and no `PracticeContextGuard`: both tenant services receive this very provider, so the
 * frozen order of `03` §3.7.1 cannot drift per route (D-054).
 *
 * The database port is bound here, so the application services depend on the interface and
 * never on Prisma. There is exactly one binding: one `PrismaService`, one `copilot_app` client
 * and one transactional session abstraction serve all three routes. No second database stack,
 * no second client and no second request transaction is introduced by the settings slice.
 */
@Module({
  controllers: [MeController, PracticesController, PracticeSettingsController],
  providers: [
    DevelopmentAuthGuard,
    IdentityBootstrapService,
    TenantRequestPipeline,
    PracticeReadService,
    PracticeSettingsReadService,
    { provide: IDENTITY_DATABASE, useClass: PrismaIdentityDatabase },
  ],
})
export class IdentityModule {}
