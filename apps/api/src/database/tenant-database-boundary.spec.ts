/**
 * MANDATORY FACADE PROOF CLASS 1 OF 2 — the STATIC import/source-boundary proof
 * (D-072 `OD-P5-I4-12`, "Statički dokaz"; `08` §12.10 point 1).
 *
 * It proves that `P5-I4` business and application code CANNOT directly use `PrismaService`,
 * `PrismaClient` or raw database client primitives OUTSIDE the authorised facade/adapter layer.
 *
 * A LINT RULE ALONE IS NOT SUFFICIENT, and D-072 says so in so many words. This suite is the
 * required permanent test: it reads the shipped sources from disk, so it fails on a new file
 * nobody thought to configure a rule for, on a file added to a directory no rule covered, and on
 * a rule that is silently disabled. It touches no database, queue or object storage, so it stays
 * a unit test (`08` §4) — the same shape as `canonical-matrix-document.spec.ts`, which reads the
 * `15` document for the same reason.
 *
 * WHAT "AUTHORISED LAYER" MEANS HERE, MECHANICALLY
 *
 * Exactly two kinds of location: the database module itself (`src/database/`), and a feature's
 * own `infrastructure/` directory. The allowlist below is not merely a list of blessed paths —
 * every entry is independently asserted to satisfy that predicate, so a file cannot be admitted
 * by adding its name.
 *
 * THE COMPANION PROOF IS BEHAVIOURAL AND BOTH ARE REQUIRED. Ordering, session reuse and the
 * absence of a second transaction cannot be seen in an import graph; they are proven against the
 * recording session in `patient-reference-read.service.spec.ts` for the `P5-I4A` read and in
 * `patient-reference-create.service.spec.ts` for the `P5-I4C` write. Neither replaces the other.
 *
 * IT COVERS `P5-I4C` TOO, AND DOES SO WITHOUT WEAKENING ANYTHING. The `P5-I4A` assertions below
 * are unchanged; two adapters are added to the allowlist — both independently asserted to live in
 * an authorised layer — and one new rule states the same property for the whole `P5-I4C`
 * application surface: the idempotency service, the audit writer, the create service and the
 * lookup service.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** `apps/api/src`, resolved from this file rather than from the working directory. */
const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Module specifiers that ARE a raw database client primitive.
 *
 * `@prisma/client` and the generated client are the client itself; `prisma.service` is the one
 * `PrismaService` singleton of the process; `@prisma/adapter-pg` and `pg` are the driver beneath
 * it. Importing any of them is "reaching for the database directly", whatever the imported
 * symbol is called.
 */
const RAW_DATABASE_SPECIFIERS = [
  '@prisma/client',
  '@prisma/adapter-pg',
  'pg',
  'generated/prisma',
  'database/prisma.service',
  './prisma.service',
];

/**
 * The COMPLETE set of application sources allowed to import a raw database primitive.
 *
 * Every entry is asserted below to live in an authorised layer, so this list can grow only in a
 * direction the layering already permits.
 */
const AUTHORISED_DATABASE_LAYER = [
  // The one `copilot_app` client of the process.
  'database/prisma.service.ts',
  // The module that registers it as the single provider.
  'database/database.module.ts',
  // The SMALL_ADAPTER seam: the statement value object a feature adapter builds.
  'database/tenant-statement.ts',
  // The one implementation of the identity/tenant session.
  'identity/infrastructure/prisma-identity.database.ts',
  // The patient-reference FEATURE ADAPTER — the only file in the patient-reference slice holding
  // SQL, for the `P5-I4A` read and the `P5-I4C` write alike.
  'patient-reference/infrastructure/patient-reference.database.ts',
  // The `P5-I4C` idempotency adapter — the advisory lock, the claim and the completion.
  'idempotency/infrastructure/idempotency.database.ts',
  // The `P5-I4C` append-only audit adapter.
  'audit/infrastructure/audit.database.ts',
];

/**
 * ONE documented exception, pre-dating this slice and outside the tenant business surface.
 *
 * The readiness probe issues the process-level `select 1` liveness check of `04` §3.6. It is not
 * tenant business code: it reads no tenant table, admits no request and takes no authorisation
 * decision. It is listed rather than silently excluded so that its existence stays visible, and
 * it is asserted below to remain exactly one file.
 */
const DOCUMENTED_NON_TENANT_EXCEPTIONS = ['health/application/readiness.service.ts'];

/** Every `.ts` source under `src`, excluding the generated client and the specs themselves. */
function sourceFiles(): readonly string[] {
  const found: string[] = [];

  const walk = (relativeDirectory: string): void => {
    const absolute = relativeDirectory === '' ? SOURCE_ROOT : `${SOURCE_ROOT}${relativeDirectory}/`;

    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const relative = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;

      if (entry.isDirectory()) {
        // `src/generated/**` is the regenerated Prisma client itself (`02` §26), never
        // hand-edited and never application code.
        if (relative !== 'generated') {
          walk(relative);
        }

        continue;
      }

      // A spec is not shipped application code: `tsconfig.build.json` excludes `**/*.spec.ts`
      // from the emit outright, so nothing here reaches `dist`.
      if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        found.push(relative);
      }
    }
  };

  walk('');

  return found;
}

/**
 * Strips comments, so PROSE about `PrismaService` is not mistaken for a dependency on it.
 *
 * Every file in this repository documents its own boundaries at length — including the files
 * whose whole point is that they hold no client — so a naive text search would report the
 * opposite of the truth.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The module specifiers a file imports, from `import ... from '...'` and `import '...'`. */
function importedSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  const pattern = /\bimport\s+(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  const code = withoutComments(source);

  for (const match of code.matchAll(pattern)) {
    const specifier = match[1];

    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

/** Whether any imported specifier is a raw database client primitive. */
function importsRawDatabase(relativePath: string): boolean {
  const source = readFileSync(`${SOURCE_ROOT}${relativePath}`, 'utf8');

  return importedSpecifiers(source).some((specifier) =>
    RAW_DATABASE_SPECIFIERS.some((raw) => specifier.includes(raw)),
  );
}

/** An authorised layer is the database module, or a feature's own `infrastructure/`. */
function isAuthorisedLayer(relativePath: string): boolean {
  return relativePath.startsWith('database/') || relativePath.includes('/infrastructure/');
}

const FILES = sourceFiles();

describe('static import/source boundary (D-072 OD-P5-I4-12, 08 §12.10 point 1)', () => {
  it('reads a non-trivial source tree, so an empty scan cannot pass silently', () => {
    // A boundary test that found no files would report success for every rule below. The floor
    // is deliberately far under the real count and the sentinel files are ones this slice adds.
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES).toContain('patient-reference/application/patient-reference-read.service.ts');
    expect(FILES).toContain('patient-reference/controllers/patient-references.controller.ts');
    expect(FILES).toContain('database/tenant-database.service.ts');
    // The `P5-I4C` sentinels, for the same reason: the write slice must be provably in the scan.
    expect(FILES).toContain('patient-reference/application/patient-reference-create.service.ts');
    expect(FILES).toContain('idempotency/application/idempotency.service.ts');
    expect(FILES).toContain('audit/application/audit-writer.service.ts');
  });

  it('lets NO file outside the authorised layer import a raw database primitive', () => {
    const offenders = FILES.filter(
      (file) =>
        importsRawDatabase(file) &&
        !AUTHORISED_DATABASE_LAYER.includes(file) &&
        !DOCUMENTED_NON_TENANT_EXCEPTIONS.includes(file),
    );

    expect(offenders).toEqual([]);
  });

  it('admits a file only by its LAYER, never by being listed', () => {
    // The allowlist cannot become a back door: every entry must independently satisfy the
    // layering predicate, so adding a name to it does not authorise a wrongly placed file.
    for (const file of AUTHORISED_DATABASE_LAYER) {
      expect(isAuthorisedLayer(file)).toBe(true);
      expect(FILES).toContain(file);
    }
  });

  it('keeps the documented non-tenant exception at exactly one file', () => {
    expect(DOCUMENTED_NON_TENANT_EXCEPTIONS).toHaveLength(1);
    expect(FILES).toContain('health/application/readiness.service.ts');
  });

  it('keeps the whole P5-I4C application surface free of database primitives', () => {
    // THE STATIC HALF OF THE MANDATORY `P5-I4C` BOUNDARY PROOF (D-072 `OD-P5-I4-12`; D-079).
    //
    // `P5-I4C` is the first phase-5 tenant business WRITE, the first concurrent writer over
    // `idempotency_keys` and the first audit writer, so the facade boundary matters more here
    // than it did for a read: a service that held a client could open a second transaction and
    // silently break the atomicity of business + audit. Stated against a NON-EMPTY set, so it
    // cannot pass because nothing was scanned.
    const businessFiles = FILES.filter(
      (file) =>
        (file.startsWith('idempotency/') ||
          file.startsWith('audit/') ||
          file.startsWith('patient-reference/')) &&
        !file.includes('/infrastructure/'),
    );

    expect(businessFiles.length).toBeGreaterThan(0);
    expect(businessFiles).toContain('idempotency/application/idempotency.service.ts');
    expect(businessFiles).toContain('audit/application/audit-writer.service.ts');
    expect(businessFiles).toContain(
      'patient-reference/application/patient-reference-create.service.ts',
    );
    expect(businessFiles).toContain(
      'patient-reference/application/patient-reference-lookup.service.ts',
    );

    for (const file of businessFiles) {
      expect([file, importsRawDatabase(file)]).toEqual([file, false]);
    }
  });

  it('keeps the whole P5-I4A application surface free of database primitives', () => {
    // Stated separately from the global rule and asserted against a non-empty set: the slice's
    // application services and controller must be provably in the scan, not merely absent from
    // an offender list that could be empty because nothing was scanned.
    const businessFiles = FILES.filter(
      (file) => file.startsWith('patient-reference/') && !file.includes('/infrastructure/'),
    );

    expect(businessFiles.length).toBeGreaterThan(0);

    for (const file of businessFiles) {
      expect([file, importsRawDatabase(file)]).toEqual([file, false]);
    }
  });

  it('keeps the tenant admission chain free of database primitives too', () => {
    // The pipeline, the practice services and every controller decide authorisation. None of
    // them may hold a client: the session they are handed is their only route to the database.
    const admissionFiles = FILES.filter(
      (file) =>
        file.startsWith('identity/application/') ||
        file.startsWith('identity/controllers/') ||
        file.startsWith('identity/domain/'),
    );

    expect(admissionFiles.length).toBeGreaterThan(0);

    for (const file of admissionFiles) {
      expect([file, importsRawDatabase(file)]).toEqual([file, false]);
    }
  });

  it('contains no unsafe raw-SQL escape hatch anywhere in the source tree', () => {
    // `Prisma.sql` binds every value; `$queryRawUnsafe`, `$executeRawUnsafe` and `Prisma.raw`
    // do not, and none of them exists in this repository. The seam introduced by `P5-I4A` runs
    // a `Prisma.Sql` built by a feature adapter, so it adds no path for a client string to
    // reach an identifier position.
    const offenders = FILES.filter((file) => {
      const code = withoutComments(readFileSync(`${SOURCE_ROOT}${file}`, 'utf8'));

      return (
        code.includes('$queryRawUnsafe') ||
        code.includes('$executeRawUnsafe') ||
        code.includes('Prisma.raw')
      );
    });

    expect(offenders).toEqual([]);
  });
});
