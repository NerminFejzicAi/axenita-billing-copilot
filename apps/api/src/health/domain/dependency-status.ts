/**
 * Readiness vocabulary.
 *
 * The values are the ones used by the contract example in 03 §27 and are stable technical
 * identifiers (12 §10). A health response is Class D data: status only, never a dependency
 * URL, credential or internal detail (09 §2, 03 §27).
 */

/** Status of a single dependency. */
export type DependencyStatus = 'up' | 'down';

/** Aggregated readiness of the process. */
export type ReadinessStatus = 'up' | 'degraded';

/**
 * Dependencies checked by the phase 1 readiness probe.
 *
 * These are exactly the local services that phase 1 provisions (04 §3.3). `tariffEngine`,
 * shown in the 03 §27 example, is added by the phase that introduces the tariff engine
 * client (04 §10); phase 1 must not report a check it cannot actually perform.
 */
export const READINESS_DEPENDENCIES = ['database', 'redis', 'objectStorage'] as const;

export type ReadinessDependency = (typeof READINESS_DEPENDENCIES)[number];

export type DependencyChecks = Readonly<Record<ReadinessDependency, DependencyStatus>>;

/**
 * Aggregates individual checks into the overall readiness status.
 *
 * A single failing dependency degrades the whole process: readiness must never report
 * success while a required dependency is unreachable (09 §1, 01 §17.1).
 */
export function aggregateReadiness(checks: DependencyChecks): ReadinessStatus {
  return Object.values(checks).every((status) => status === 'up') ? 'up' : 'degraded';
}
