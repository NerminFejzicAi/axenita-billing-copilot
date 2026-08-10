import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { ProblemDetailsFilter } from './problem-details/problem-details.filter.js';

/**
 * Cross-cutting technical infrastructure (01 §6.1).
 *
 * This module holds only framework level concerns: the Problem Details filter, request
 * correlation and, in later phases, the permission guard, pagination and redaction helpers.
 * It must never become a container for business logic.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
  ],
})
export class CommonModule {}
