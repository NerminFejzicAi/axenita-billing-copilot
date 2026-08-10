import { type LogLevel as NestLogLevel } from '@nestjs/common';

import { LogLevel } from '../config/environment.constants.js';

/**
 * Ordered from least to most verbose. Selecting a level enables it and everything above it.
 */
const LEVEL_ORDER: readonly NestLogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

const CONFIGURED_TO_NEST: Readonly<Record<LogLevel, NestLogLevel>> = {
  [LogLevel.Error]: 'error',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Log]: 'log',
  [LogLevel.Debug]: 'debug',
  [LogLevel.Verbose]: 'verbose',
};

/** Translates the configured verbosity into the level list expected by the Nest logger. */
export function resolveLogLevels(configured: LogLevel): NestLogLevel[] {
  const target = CONFIGURED_TO_NEST[configured];
  const cutoff = LEVEL_ORDER.indexOf(target);
  return [...LEVEL_ORDER.slice(0, cutoff + 1), 'fatal'];
}
