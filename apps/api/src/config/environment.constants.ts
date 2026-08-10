/**
 * Stable technical identifiers for the runtime environment (12 §10 — upper snake case
 * technical values, never localised text).
 */
export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Log levels accepted by the application logger.
 *
 * The level only controls verbosity. It never enables logging of content that 09 §11
 * forbids: medical text, patient identifiers, tokens, credentials or connection strings.
 */
export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Log = 'log',
  Debug = 'debug',
  Verbose = 'verbose',
}
