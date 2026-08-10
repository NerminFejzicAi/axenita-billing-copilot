import { Body, Controller, type DynamicModule, Get, Module, Post } from '@nestjs/common';

import { API_VERSION_1 } from '@axenita/contracts';

import { CommonModule } from '../../../src/common/common.module.js';
import { ApiException } from '../../../src/common/errors/api-exception.js';
import { AppConfigModule } from '../../../src/config/app-config.module.js';
import { ValidationProbeDto } from './validation-probe.dto.js';

/**
 * Test-only controller mounted at `/api/v1/validation-probe`.
 *
 * Exists solely to prove the phase 1 error infrastructure end to end: the global
 * validation pipe, the whitelist/`forbidNonWhitelisted` behaviour, deliberate
 * `ApiException` responses and the fallback for an unexpected exception.
 */
@Controller({ path: 'validation-probe', version: API_VERSION_1 })
export class ValidationProbeController {
  @Post()
  public accept(@Body() body: ValidationProbeDto): { readonly accepted: true } {
    void body;
    return { accepted: true };
  }

  @Get('deliberate-conflict')
  public deliberateConflict(): never {
    throw new ApiException({
      code: 'VERSION_CONFLICT',
      status: 409,
      detail: 'Resource was modified by another user.',
    });
  }

  @Get('unexpected-failure')
  public unexpectedFailure(): never {
    throw new Error('boom: internal detail that must never reach the client');
  }

  /**
   * Raises an exception whose message AND stack both carry a distinctive marker, standing
   * in for the SQL, connection strings, provider payloads or medical text a real
   * exception could carry. Used to prove neither reaches the application log.
   */
  @Get('leaky-failure')
  public leakyFailure(): never {
    const error = new Error(`query failed: ${LEAKY_MESSAGE_SECRET}`);
    error.stack = `Error: query failed: ${LEAKY_MESSAGE_SECRET}\n    at leak (${LEAKY_STACK_SECRET}:1:1)`;
    throw error;
  }
}

/** Marker that must never appear in a log line, placed in an exception message. */
export const LEAKY_MESSAGE_SECRET = 'MESSAGE-SECRET-1f0c4a7b';

/** Marker that must never appear in a log line, placed in an exception stack. */
export const LEAKY_STACK_SECRET = 'STACK-SECRET-9d2e6b13';

@Module({})
export class ValidationProbeModule {
  public static forRoot(): DynamicModule {
    return {
      module: ValidationProbeModule,
      imports: [AppConfigModule.forRoot(), CommonModule],
      controllers: [ValidationProbeController],
    };
  }
}
