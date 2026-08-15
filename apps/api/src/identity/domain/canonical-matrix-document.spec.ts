/**
 * Proves that the canonical test fixture still matches the accepted document.
 *
 * This is the first of the two conformance hops required by `04` §6.4.1:
 *
 * 1. `docs/15_ROLE_PERMISSION_MATRIX_V1.md` -> `test/fixtures/canonical-role-permission-matrix.ts`
 *    (this file);
 * 2. that fixture -> the implemented matrix (`permission-matrix.conformance.spec.ts`).
 *
 * Splitting the hops keeps the Markdown parse in exactly one place. Every other matrix
 * assertion runs against stable structured data, so an editorial reflow of `15` cannot cascade
 * through the whole suite, while a real change to a grant still fails the build here.
 *
 * The parse deliberately reads the repository document rather than a copy: a copy would drift.
 * Reading a versioned text file keeps the test a unit test — it touches no database, queue or
 * object storage (08 §4).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ACTIVE_PERMISSIONS,
  CANONICAL_CONDITIONAL_REQUIREMENTS,
  CANONICAL_MATRIX_COLUMNS,
  CANONICAL_MATRIX_ROWS,
  CANONICAL_PLATFORM_ROLES,
  CANONICAL_PRACTICE_READ_ALLOWED_ROLES,
  CANONICAL_RESERVED_PERMISSIONS,
  CANONICAL_ROLE_TALLIES,
  CANONICAL_TENANT_ROLES,
} from '../../../test/fixtures/canonical-role-permission-matrix.js';

const DOCUMENT_PATH = fileURLToPath(
  new URL('../../../../../docs/15_ROLE_PERMISSION_MATRIX_V1.md', import.meta.url),
);

const documentLines = readFileSync(DOCUMENT_PATH, 'utf8').split(/\r?\n/);

/** Index of the first line whose text matches, or `-1`. */
function findLine(pattern: RegExp, from = 0): number {
  for (let index = from; index < documentLines.length; index += 1) {
    const line = documentLines[index];

    if (line !== undefined && pattern.test(line)) {
      return index;
    }
  }

  return -1;
}

/**
 * Returns the non-empty entries of the first fenced code block after a heading.
 *
 * Structural problems throw instead of asserting: this parser runs while the module is being
 * evaluated, and a malformed document must fail loudly rather than as a confusing assertion.
 */
function codeBlockAfter(heading: RegExp): readonly string[] {
  const headingIndex = findLine(heading);

  if (headingIndex < 0) {
    throw new Error(`Heading ${String(heading)} not found in 15.`);
  }

  const openIndex = findLine(/^```/, headingIndex + 1);

  if (openIndex < 0) {
    throw new Error(`No code block after ${String(heading)} in 15.`);
  }

  const entries: string[] = [];

  for (let index = openIndex + 1; index < documentLines.length; index += 1) {
    const line = documentLines[index];

    if (line === undefined || /^```/.test(line)) {
      return entries;
    }

    const trimmed = line.trim();

    if (trimmed.length > 0) {
      entries.push(trimmed);
    }
  }

  throw new Error(`Unterminated code block after ${String(heading)}.`);
}

interface ParsedRow {
  readonly permission: string;
  readonly cells: Record<string, string>;
  readonly source: string;
}

/** Parses the complete §5 table into rows keyed by the column headings of that table. */
function parseMatrixTable(): readonly ParsedRow[] {
  const sectionIndex = findLine(/^# 5\. Kompletna matrica/);

  if (sectionIndex < 0) {
    throw new Error('Section 5 not found in 15.');
  }

  const headerIndex = findLine(/^\|\s*Permission\s*\|/, sectionIndex);

  if (headerIndex < 0) {
    throw new Error('Matrix table header not found in 15 §5.');
  }

  const headerCells = splitTableRow(documentLines[headerIndex] ?? '');
  // Drop the leading `Permission` and the trailing `Source` column: what remains are the role
  // columns the document defines.
  const roleColumns = headerCells.slice(1, -1);

  const rows: ParsedRow[] = [];

  for (let index = headerIndex + 2; index < documentLines.length; index += 1) {
    const line = documentLines[index];

    if (line === undefined || !line.startsWith('|')) {
      break;
    }

    const cells = splitTableRow(line);
    const permission = cells[0]?.replace(/`/g, '') ?? '';
    const source = cells[cells.length - 1] ?? '';
    const stateCells = cells.slice(1, -1);

    if (stateCells.length !== roleColumns.length) {
      throw new Error(
        `Row '${permission}' of 15 §5 has ${stateCells.length} state cells but the table declares ${roleColumns.length} role columns.`,
      );
    }

    const byRole: Record<string, string> = {};

    roleColumns.forEach((role, position) => {
      byRole[role] = stateCells[position] ?? '';
    });

    rows.push({ permission, cells: byRole, source });
  }

  return rows;
}

function splitTableRow(line: string): readonly string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** `15` §6 names the flags in database spelling; `03` §10 exposes them in camelCase. */
function toCamelCase(flag: string): string {
  return flag.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

const parsedRows = parseMatrixTable();
const parsedRoleColumns = splitTableRow(
  documentLines[findLine(/^\|\s*Permission\s*\|/)] ?? '',
).slice(1, -1);

describe('docs/15 -> canonical fixture', () => {
  it('reproduces the active permission catalogue of §4.1', () => {
    expect(codeBlockAfter(/^## 4\.1 Aktivne permisije/)).toEqual(CANONICAL_ACTIVE_PERMISSIONS);
  });

  it('reproduces the reserved permission catalogue of §4.2', () => {
    expect(codeBlockAfter(/^## 4\.2 Rezervisane permisije/)).toEqual(
      CANONICAL_RESERVED_PERMISSIONS,
    );
  });

  it('reproduces the tenant role inventory of §2.1', () => {
    expect(codeBlockAfter(/^## 2\.1 Tenant aplikacijske role/)).toEqual([
      ...CANONICAL_TENANT_ROLES,
    ]);
  });

  it('reproduces the platform role inventory of §2.2', () => {
    expect(codeBlockAfter(/^## 2\.2 Platform aplikacijska rola/)).toEqual([
      ...CANONICAL_PLATFORM_ROLES,
    ]);
  });

  it('reproduces the column headings of the §5 table', () => {
    expect(parsedRoleColumns).toEqual(CANONICAL_MATRIX_COLUMNS);
  });

  it('reproduces every row of the §5 table, cell for cell and source for source', () => {
    expect(parsedRows).toEqual(
      CANONICAL_MATRIX_ROWS.map((row) => ({
        permission: row.permission,
        cells: { ...row.cells },
        source: row.source,
      })),
    );
  });

  it('carries exactly one row per active permission', () => {
    expect(parsedRows).toHaveLength(CANONICAL_ACTIVE_PERMISSIONS.length);
    expect(parsedRows.map((row) => row.permission).sort()).toEqual(
      [...CANONICAL_ACTIVE_PERMISSIONS].sort(),
    );
  });

  it('never makes a reserved permission a row of the matrix', () => {
    const permissions = new Set(parsedRows.map((row) => row.permission));

    for (const reserved of CANONICAL_RESERVED_PERMISSIONS) {
      expect(permissions.has(reserved), `${reserved} must not be an active matrix row`).toBe(false);
    }
  });

  it('uses only the three accepted cell states and never the withdrawn BLOCKED value', () => {
    for (const row of parsedRows) {
      for (const [role, cell] of Object.entries(row.cells)) {
        expect(['ALLOW', 'DENY', 'CONDITIONAL'], `${row.permission} x ${role}`).toContain(cell);
      }
    }
  });

  it('traces every row to a single accepted ADR', () => {
    for (const row of parsedRows) {
      expect(row.source, `${row.permission} source`).toMatch(/^D-\d{3}$/);
    }
  });

  it('derives the per-role tallies of §7 from the parsed table', () => {
    for (const role of parsedRoleColumns) {
      const cells = parsedRows.map((row) => row.cells[role]);

      expect(
        {
          allow: cells.filter((cell) => cell === 'ALLOW').length,
          conditional: cells.filter((cell) => cell === 'CONDITIONAL').length,
          deny: cells.filter((cell) => cell === 'DENY').length,
        },
        `tallies for ${role}`,
      ).toEqual(CANONICAL_ROLE_TALLIES[role]);
    }
  });

  it('grants practice.read to PRACTICE_ADMIN alone', () => {
    const practiceRead = parsedRows.find((row) => row.permission === 'practice.read');

    expect(practiceRead).toBeDefined();

    const allowed = Object.entries(practiceRead?.cells ?? {})
      .filter(([, cell]) => cell !== 'DENY')
      .map(([role]) => role);

    expect(allowed).toEqual(CANONICAL_PRACTICE_READ_ALLOWED_ROLES);
  });

  it('maps every CONDITIONAL cell of the table to the flag named in §6', () => {
    const conditionalCells = parsedRows.flatMap((row) =>
      Object.entries(row.cells)
        .filter(([, cell]) => cell === 'CONDITIONAL')
        .map(([role]) => ({ permission: row.permission, role })),
    );

    // The flag names come from §6.1 and §6.2. §6.3 and §6.4 state that revocation carries the
    // same eligibility condition as approval, so they inherit the flag of the section they
    // reference rather than restating it.
    const mpaFlag = flagNamedIn(/^## 6\.1 /);
    const billingFlag = flagNamedIn(/^## 6\.2 /);

    expect(sectionBody(/^## 6\.3 /).join(' ')).toContain('§6.1');
    expect(sectionBody(/^## 6\.4 /).join(' ')).toContain('§6.2');

    const derived = conditionalCells.map(({ permission, role }) => ({
      permission,
      role,
      flag: role === 'MPA' ? mpaFlag : billingFlag,
    }));

    expect(sortRequirements(derived)).toEqual(
      sortRequirements(CANONICAL_CONDITIONAL_REQUIREMENTS.map((entry) => ({ ...entry }))),
    );
  });

  it('names no conditional flag beyond the two accepted practice settings', () => {
    const mentioned = new Set(
      documentLines
        .join('\n')
        .match(/allow_[a-z_]+/g)
        ?.map((flag) => toCamelCase(flag)) ?? [],
    );

    expect([...mentioned].sort()).toEqual(['allowBillingSpecialistApproval', 'allowMpaApproval']);
  });
});

function sectionBody(heading: RegExp): readonly string[] {
  const start = findLine(heading);

  if (start < 0) {
    throw new Error(`Section ${String(heading)} not found in 15.`);
  }

  const body: string[] = [];

  for (let index = start + 1; index < documentLines.length; index += 1) {
    const line = documentLines[index];

    if (line === undefined || /^#{1,3} /.test(line)) {
      break;
    }

    body.push(line);
  }

  return body;
}

function flagNamedIn(heading: RegExp): string {
  const unique = [
    ...new Set(
      sectionBody(heading)
        .join('\n')
        .match(/allow_[a-z_]+/g) ?? [],
    ),
  ];

  if (unique.length !== 1) {
    throw new Error(
      `Section ${String(heading)} of 15 names ${unique.length} practice flags; exactly one is expected.`,
    );
  }

  return toCamelCase(unique[0] ?? '');
}

function sortRequirements(
  entries: readonly { permission: string; role: string; flag: string }[],
): readonly { permission: string; role: string; flag: string }[] {
  return [...entries].sort((left, right) =>
    `${left.permission} ${left.role}`.localeCompare(`${right.permission} ${right.role}`),
  );
}
