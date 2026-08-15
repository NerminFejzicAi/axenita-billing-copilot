import { Module } from '@nestjs/common';

import { IdentityBootstrapService } from './application/identity-bootstrap.service.js';
import { PracticeReadService } from './application/practice-read.service.js';
import { DevelopmentAuthGuard } from './authentication/development-auth.guard.js';
import { MeController } from './controllers/me.controller.js';
import { PracticesController } from './controllers/practices.controller.js';
import { IDENTITY_DATABASE } from './infrastructure/identity-database.port.js';
import { PrismaIdentityDatabase } from './infrastructure/prisma-identity.database.js';

/**
 * Identity domain — phase 3 (`04` §5.2).
 *
 * Registers exactly the two routes `04` §5.2 assigns to this phase: `GET /api/v1/me` and
 * `GET /api/v1/practices/{practiceId}`. The settings routes belong to phase 4 and are
 * deliberately not registered here, not even as a stub (D-049), so both remain `404`.
 *
 * `DevelopmentAuthGuard` is a provider of this module rather than a global guard: the two
 * authenticated routes declare it themselves, and `/health/*` must stay unauthenticated
 * (`03` §3.4). Because it is instantiated when this module is created, its refusal to build
 * under `NODE_ENV=production` fails process startup (`09` §5).
 *
 * `PracticeReadService` depends on `IdentityBootstrapService` rather than on the database port,
 * which is what makes the authenticated bootstrap chain of `03` §3.7.1 steps 1–2 impossible to
 * duplicate: there is exactly one implementation of it and both routes go through it.
 *
 * The database port is bound here, so the application services depend on the interface and
 * never on Prisma.
 */
@Module({
  controllers: [MeController, PracticesController],
  providers: [
    DevelopmentAuthGuard,
    IdentityBootstrapService,
    PracticeReadService,
    { provide: IDENTITY_DATABASE, useClass: PrismaIdentityDatabase },
  ],
})
export class IdentityModule {}
