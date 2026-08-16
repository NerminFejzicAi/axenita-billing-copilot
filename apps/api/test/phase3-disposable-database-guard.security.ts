import { describe, expect, it } from 'vitest';

import { assertDisposableTarget } from './support/disposable-database.js';
import { securityDatabase } from './support/phase3-security-context.js';

/**
 * The harness safety boundary itself.
 *
 * This suite mutates its database and drops it at the end. A guard that decides which database
 * that may be is therefore part of the security surface, not test scaffolding, and it has to
 * be tested like one: a guard nobody has ever seen refuse anything is not a guard.
 */
describe('disposable database guard', () => {
  it('given the database this suite actually uses then it is local and disposable', () => {
    const database = securityDatabase();

    expect(() => {
      assertDisposableTarget(database.app);
      assertDisposableTarget(database.migration);
      assertDisposableTarget(database.system);
    }).not.toThrow();

    expect(new URL(database.migration).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    expect(database.name).toMatch(/^copilot_gate3b_[0-9a-z]+$/);
  });

  it.each([
    ['a remote host', 'postgresql://role:pw@db.example.com:5432/copilot_gate3b_abc'],
    ['a LAN address', 'postgresql://role:pw@192.168.1.10:5432/copilot_gate3b_abc'],
    [
      'an IPv6 loopback spelling that is not on the allowlist',
      'postgresql://role:pw@[::1]:5432/copilot_gate3b_abc',
    ],
  ])('given %s then the guard refuses', (_label, url) => {
    expect(() => assertDisposableTarget(url)).toThrow(/Refusing to use host/);
  });

  it.each([
    ['the development database', 'postgresql://role:pw@127.0.0.1:5432/copilot'],
    ['the shared integration database', 'postgresql://role:pw@127.0.0.1:5433/copilot_test'],
    ['the maintenance database', 'postgresql://role:pw@127.0.0.1:5433/postgres'],
  ])('given %s then the guard refuses', (_label, url) => {
    expect(() => assertDisposableTarget(url)).toThrow(/Refusing to use database/);
  });

  it.each([
    [
      'a name that does not announce itself as disposable',
      'postgresql://role:pw@127.0.0.1:5433/copilot_scratch',
    ],
    ['a near miss on the prefix', 'postgresql://role:pw@127.0.0.1:5433/copilot_gate3'],
    ['an empty database name', 'postgresql://role:pw@127.0.0.1:5433/'],
  ])('given %s then the guard refuses', (_label, url) => {
    expect(() => assertDisposableTarget(url)).toThrow(/Refusing to use database/);
  });

  it('given an unparsable connection string then the guard refuses', () => {
    expect(() => assertDisposableTarget('not-a-url')).toThrow(/not a parsable/);
  });

  it('given a refusal message then it never contains the credential', () => {
    const secret = 'super-secret-password';

    try {
      assertDisposableTarget(`postgresql://role:${secret}@db.example.com:5432/copilot_gate3b_abc`);
      expect.unreachable('the guard should have refused');
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
