import { type LoggerService } from '@nestjs/common';

/**
 * Minimal test-only logger that records everything the application would emit.
 *
 * Every argument of every level is serialised into one buffer, so a spec can assert that a
 * forbidden string never reaches any log line — regardless of whether it would have been
 * passed as the message, as a structured attribute or as the framework trace argument
 * (09 §11).
 *
 * Test-only: it lives under `test/` and is never part of the build.
 */
export class CapturingLogger implements LoggerService {
  private readonly entries: string[] = [];

  public log(message: unknown, ...optional: unknown[]): void {
    this.record('log', message, optional);
  }

  public error(message: unknown, ...optional: unknown[]): void {
    this.record('error', message, optional);
  }

  public warn(message: unknown, ...optional: unknown[]): void {
    this.record('warn', message, optional);
  }

  public debug(message: unknown, ...optional: unknown[]): void {
    this.record('debug', message, optional);
  }

  public verbose(message: unknown, ...optional: unknown[]): void {
    this.record('verbose', message, optional);
  }

  public fatal(message: unknown, ...optional: unknown[]): void {
    this.record('fatal', message, optional);
  }

  /** Everything captured so far, as one searchable string. */
  public get output(): string {
    return this.entries.join('\n');
  }

  /** Structured payloads that were passed as the first argument, for field assertions. */
  public get payloads(): Record<string, unknown>[] {
    return this.structured;
  }

  public clear(): void {
    this.entries.length = 0;
    this.structured.length = 0;
  }

  private readonly structured: Record<string, unknown>[] = [];

  private record(level: string, message: unknown, optional: readonly unknown[]): void {
    if (typeof message === 'object' && message !== null && !Array.isArray(message)) {
      this.structured.push(message as Record<string, unknown>);
    }

    const parts = [message, ...optional].map((part) => serialise(part));
    this.entries.push(`[${level}] ${parts.join(' ')}`);
  }
}

function serialise(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack ?? ''}`;
  }
  try {
    return JSON.stringify(value) ?? `[${typeof value}]`;
  } catch {
    // Circular or otherwise unserialisable payload: record its shape, never its content.
    return `[unserialisable ${typeof value}]`;
  }
}
