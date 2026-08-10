import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

/**
 * Database access layer (01 §6.2).
 *
 * Global because every later feature module needs the same single client instance
 * (04 §4.4 step 7). It exposes `PrismaService` and nothing else.
 *
 * What this module deliberately does not contain yet:
 * - `TenantDatabaseService` and the request-context transaction helper, which belong to
 *   phase 4 (04 §6) and must not be simulated early;
 * - repositories, which belong to the feature modules that own their tables;
 * - any RLS policy, which is created by the phase 4 migration package.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
