import { describe, expect, it } from 'vitest';

import {
  aggregateReadiness,
  type DependencyChecks,
  READINESS_DEPENDENCIES,
} from './dependency-status.js';

describe('aggregateReadiness', () => {
  it('given every dependency up when aggregated then the process is up', () => {
    const checks: DependencyChecks = { database: 'up', redis: 'up', objectStorage: 'up' };

    expect(aggregateReadiness(checks)).toBe('up');
  });

  it.each(READINESS_DEPENDENCIES)(
    'given %s down when aggregated then the process is degraded',
    (failing) => {
      const checks = { database: 'up', redis: 'up', objectStorage: 'up' } as Record<
        string,
        'up' | 'down'
      >;
      checks[failing] = 'down';

      expect(aggregateReadiness(checks as DependencyChecks)).toBe('degraded');
    },
  );

  it('given every dependency down when aggregated then the process is degraded', () => {
    const checks: DependencyChecks = {
      database: 'down',
      redis: 'down',
      objectStorage: 'down',
    };

    expect(aggregateReadiness(checks)).toBe('degraded');
  });

  it('given the phase 1 scope when inspected then exactly the provisioned dependencies are checked', () => {
    expect([...READINESS_DEPENDENCIES]).toStrictEqual(['database', 'redis', 'objectStorage']);
  });
});
