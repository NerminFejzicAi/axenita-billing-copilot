/**
 * The patient-reference feature adapter — the STRUCTURAL proof of the one statement it owns.
 *
 * Normative sources: `03` §11; `09` §4, §4.2 and §18.1 `T1`; `02` §11 and
 * `013_rls_policies_phase5`; D-073 ("jedan tenant-scoped `SELECT`", "eksplicitan
 * `practice_id = admittedPracticeId`", "`id = resourceId`", "bez `SELECT *`", "bez drugog
 * existence upita", "bez cross-tenant diskriminatora"); M-1.
 *
 * WHY THE STATEMENT ITSELF IS ASSERTED, AND NOT ONLY ITS BEHAVIOUR
 *
 * M-1 is the reason. `patient_references` carries a TABLE-level `SELECT` grant, so there is no
 * column-level SQLSTATE `42501` backstop against over-projection: a `select *` here would
 * SUCCEED and would return the external reference hash, the ciphertext, the IV, the
 * authentication tag, every encryption metadata column, the tenant of the row and `updated_at`.
 * A behavioural test against a double would not notice, because the double returns what it was
 * told to. The text of the statement is therefore load-bearing evidence, and it is asserted
 * directly.
 */

import { describe, expect, it } from 'vitest';

import {
  type AdmittedTenantSession,
  type TenantStatement,
} from '../../database/tenant-statement.js';
import {
  PATIENT_REFERENCE_READ_STATEMENT,
  type PatientReferenceRow,
} from './patient-reference-database.port.js';
import { PatientReferenceDatabase } from './patient-reference.database.js';

const PRACTICE = '11111111-1111-4111-8111-111111111001';
const RESOURCE = '44444444-4444-4444-8444-444444444001';

/** Captures every statement the adapter builds, and answers with the given rows. */
function capturing(rows: readonly PatientReferenceRow[] = []): {
  readonly tenant: AdmittedTenantSession;
  readonly statements: TenantStatement[];
} {
  const statements: TenantStatement[] = [];

  const tenant: AdmittedTenantSession = {
    practiceId: PRACTICE,
    run: async <TRow>(statement: TenantStatement): Promise<readonly TRow[]> => {
      statements.push(statement);
      return Promise.resolve(rows as readonly unknown[] as readonly TRow[]);
    },
  };

  return { tenant, statements };
}

function storedRow(): PatientReferenceRow {
  return {
    id: RESOURCE,
    pseudonym: 'P-K7M2QX4TB9',
    birthYear: 1968,
    sexCode: 'F',
    sourceSystem: 'MANUAL',
    createdAt: new Date('2026-07-18T10:00:00Z'),
  };
}

describe('PatientReferenceDatabase (03 §11, D-073, M-1)', () => {
  const adapter = new PatientReferenceDatabase();

  it('issues EXACTLY ONE statement per lookup', async () => {
    const { tenant, statements } = capturing([storedRow()]);

    await adapter.findInAdmittedPractice(tenant, RESOURCE);

    expect(statements).toHaveLength(1);
    expect(statements[0]?.label).toBe(PATIENT_REFERENCE_READ_STATEMENT);
  });

  it('issues exactly one statement for zero rows too — no second existence query', async () => {
    // The moment that would tempt a pre-read or a follow-up: nothing matched. There must still
    // be exactly one statement, or "does not exist" and "belongs to another practice" would
    // become separable (`09` §18.1 `T1`).
    const { tenant, statements } = capturing([]);

    const result = await adapter.findInAdmittedPractice(tenant, RESOURCE);

    expect(result).toBeUndefined();
    expect(statements).toHaveLength(1);
  });

  describe('the statement text', () => {
    async function statementOf(): Promise<TenantStatement> {
      const { tenant, statements } = capturing([]);

      await adapter.findInAdmittedPractice(tenant, RESOURCE);

      const statement = statements[0];

      expect(statement).toBeDefined();

      return statement as TenantStatement;
    }

    it('names exactly the six projected columns, one by one', async () => {
      const { sql } = await statementOf();

      for (const column of [
        '"id"',
        '"pseudonym"',
        '"birth_year"',
        '"sex_code"',
        '"source_system"',
        '"created_at"',
      ]) {
        expect([column, sql.sql.includes(column)]).toEqual([column, true]);
      }
    });

    it('contains NO select * (M-1)', async () => {
      const { sql } = await statementOf();
      const text = sql.sql.toLowerCase();

      expect(text).not.toContain('select *');
      expect(text).not.toMatch(/select\s+\*/);
      expect(text).not.toContain('.*');
    });

    it('projects none of the forbidden internal columns', async () => {
      const { sql } = await statementOf();
      const text = sql.sql.toLowerCase();

      for (const column of [
        'external_patient_ref_hash',
        'external_patient_ref_ciphertext',
        'external_patient_ref_iv',
        'external_patient_ref_auth_tag',
        'encryption_algorithm',
        'encryption_version',
        'encryption_key_ref',
        'encryption_key_version',
        'updated_at',
      ]) {
        expect([column, text.includes(column)]).toEqual([column, false]);
      }
    });

    it('mentions practice_id ONLY as a predicate, never as a projected column', async () => {
      const { sql } = await statementOf();
      const text = sql.sql.toLowerCase();
      const selectList = text.slice(text.indexOf('select'), text.indexOf('from'));

      expect(selectList).not.toContain('practice_id');
      expect(text).toContain('"practice_id" = ');
    });

    it('carries BOTH explicit predicates — the tenant and the resource', async () => {
      const { sql } = await statementOf();
      // `.text` is the PostgreSQL rendering, with numbered placeholders — the statement the
      // server actually receives.
      const text = sql.text.replace(/\s+/g, ' ').toLowerCase();

      expect(text).toContain('"practice_id" = $1::uuid');
      expect(text).toContain('"id" = $2::uuid');
      expect(text).toContain('from "patient_references"');
      // Both halves are mandatory: neither may be dropped in favour of the policy alone.
      expect(text).toContain('and');
    });

    it('binds the ADMITTED practice first and the resource second, as parameters', async () => {
      const { tenant, statements } = capturing([]);

      await adapter.findInAdmittedPractice(tenant, RESOURCE);

      // Both values travel out of band. Neither is interpolated into the statement text, so a
      // crafted identifier cannot reach an identifier position.
      expect(statements[0]?.sql.values).toEqual([PRACTICE, RESOURCE]);
      expect(statements[0]?.sql.sql).not.toContain(PRACTICE);
      expect(statements[0]?.sql.sql).not.toContain(RESOURCE);
    });

    it('reads exactly one table and issues exactly one SELECT', async () => {
      const { sql } = await statementOf();
      const text = sql.sql.toLowerCase();

      expect(text.split('select').length - 1).toBe(1);
      expect(text.split('from').length - 1).toBe(1);
      // No union, no join, no sub-select, no existence probe and no cross-tenant discriminator.
      for (const forbidden of [' union', ' join', 'exists', ' count(', 'information_schema']) {
        expect([forbidden, text.includes(forbidden)]).toEqual([forbidden, false]);
      }
    });

    it('carries no value in the recorded label', async () => {
      const { label } = await statementOf();

      expect(label).toBe(PATIENT_REFERENCE_READ_STATEMENT);
      expect(label).not.toContain(PRACTICE);
      expect(label).not.toContain(RESOURCE);
    });
  });

  it('returns the row unchanged for exactly one match', async () => {
    const { tenant } = capturing([storedRow()]);

    expect(await adapter.findInAdmittedPractice(tenant, RESOURCE)).toEqual(storedRow());
  });

  it('names the admitted practice from the tenant session and from nothing else', () => {
    const source = PatientReferenceDatabase.prototype.findInAdmittedPractice.toString();

    expect(source).toContain('tenant.practiceId');
    // No route input and no second identity is in scope here.
    expect(source).not.toContain('practiceContextHeader');
    expect(source).not.toContain('userId');
  });
});
