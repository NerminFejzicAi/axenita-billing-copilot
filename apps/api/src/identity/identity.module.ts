import { Module } from '@nestjs/common';

import { IdentityBootstrapService } from './application/identity-bootstrap.service.js';
import { DevelopmentAuthGuard } from './authentication/development-auth.guard.js';
import { MeController } from './controllers/me.controller.js';
import { IDENTITY_DATABASE } from './infrastructure/identity-database.port.js';
import { PrismaIdentityDatabase } from './infrastructure/prisma-identity.database.js';

/**
 * Identity domain — phase 3 (`04` §5.2).
 *
 * Registers exactly one route, `GET /api/v1/me`. `GET /practices/{practiceId}` is the other
 * phase 3 endpoint of `04` §5.2 and is not part of this gate; the settings routes belong to
 * phase 4 and are deliberately not registered here, not even as a stub (D-049).
 *
 * `DevelopmentAuthGuard` is a provider of this module rather than a global guard: `/me` is the
 * only authenticated route that exists so far, and `/health/*` must stay unauthenticated
 * (`03` §3.4). Because it is instantiated when this module is created, its refusal to build
 * under `NODE_ENV=production` fails process startup (`09` §5).
 *
 * The database port is bound here, so the application service depends on the interface and
 * never on Prisma.
 */
@Module({
  controllers: [MeController],
  providers: [
    DevelopmentAuthGuard,
    IdentityBootstrapService,
    { provide: IDENTITY_DATABASE, useClass: PrismaIdentityDatabase },
  ],
})
export class IdentityModule {}
