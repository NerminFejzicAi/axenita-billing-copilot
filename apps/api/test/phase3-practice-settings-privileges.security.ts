import { type Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PHASE_3_SEED } from '../prisma/seed.js';
import {
  INSUFFICIENT_PRIVILEGE,
  connect,
  securityDatabase,
  sqlStateOf,
} from './support/phase3-security-context.js';

/**
 * D-049 — the minimal readable surface of `practice_settings` in phase 3
 * (02 §20.2b, §25.1.3; 08 §21.7).
 *
 * In phase 3 this table carries NO row level security. The column grant is therefore not one
 * control among several — it is the ONLY control, which is why every forbidden column is
 * asserted individually rather than as a group.
 */
const database = securityDatabase();

let app: Client;
let system: Client;

const FORBIDDEN_COLUMNS = [
  'id',
  'version',
  'updated_at',
  'updated_by',
  'configuration',
  'retention_policy_code',
  'billing_review_required',
  'require_reason_for_manual_change',
  'ai_enabled',
  'axenita_export_enabled',
] as const;

beforeAll(async () => {
  [app, system] = await Promise.all([connect(database.app), connect(database.system)]);
});

afterAll(async () => {
  await Promise.all([app.end(), system.end()]);
});

describe('permitted surface (08 §21.7.1)', () => {
  it('given copilot_app when it reads the three permitted columns then it succeeds', async () => {
    const result = await app.query<{
      practice_id: string;
      allow_mpa_approval: boolean;
      allow_billing_specialist_approval: boolean;
    }>(
      `select practice_id, allow_mpa_approval, allow_billing_specialist_approval
         from practice_settings order by practice_id`,
    );

    expect(result.rows).toHaveLength(PHASE_3_SEED.practiceSettings.length);
  });

  it('given the seeded baseline when read then both approval flags are false', async () => {
    // D-041: approval outside PHYSICIAN/PRACTICE_ADMIN is an opt-in decision of the practice,
    // never a default state.
    const result = await app.query<{
      allow_mpa_approval: boolean;
      allow_billing_specialist_approval: boolean;
    }>('select allow_mpa_approval, allow_billing_specialist_approval from practice_settings');

    for (const row of result.rows) {
      expect(row.allow_mpa_approval).toBe(false);
      expect(row.allow_billing_specialist_approval).toBe(false);
    }
  });
});

describe('forbidden surface (08 §21.7.2)', () => {
  it('given copilot_app when it runs SELECT * then it is denied', async () => {
    await expect(sqlStateOf(app, 'select * from practice_settings')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it.each(FORBIDDEN_COLUMNS)(
    'given copilot_app when it selects %s then it is denied',
    async (column) => {
      await expect(sqlStateOf(app, `select ${column} from practice_settings`)).resolves.toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    },
  );

  it.each(FORBIDDEN_COLUMNS)(
    'given copilot_app when %s appears only in a WHERE predicate then it is denied',
    async (column) => {
      // A column privilege is checked wherever the column is REFERENCED, not only where it is
      // projected. That is the property 02 §20.2b relies on.
      await expect(
        sqlStateOf(app, `select practice_id from practice_settings where ${column} is not null`),
      ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
    },
  );

  it.each(FORBIDDEN_COLUMNS)(
    'given copilot_app when %s appears only in ORDER BY then it is denied',
    async (column) => {
      await expect(
        sqlStateOf(app, `select practice_id from practice_settings order by ${column}`),
      ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
    },
  );

  it('given copilot_app when it attempts INSERT then it is denied', async () => {
    await expect(
      sqlStateOf(
        app,
        `insert into practice_settings
           (id, practice_id, billing_review_required, require_reason_for_manual_change,
            ai_enabled, axenita_export_enabled, configuration, updated_at)
         values ('00000000-0000-4000-8000-0000000000f1',
                 '${PHASE_3_SEED.practices[0]?.id ?? ''}',
                 true, true, false, false, '{}'::jsonb, now())`,
      ),
    ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('given copilot_app when it attempts UPDATE then it is denied', async () => {
    // D-049 clause 5: the UPDATE grant and the tenant policy that bounds it are introduced
    // TOGETHER, in package `013`. Granting UPDATE now would give any authenticated request
    // write access to EVERY practice's settings with no tenant predicate.
    await expect(
      sqlStateOf(app, 'update practice_settings set allow_mpa_approval = true'),
    ).resolves.toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('given copilot_app when it attempts DELETE then it is denied', async () => {
    await expect(sqlStateOf(app, 'delete from practice_settings')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('given copilot_system when it reads practice_settings then it is denied', async () => {
    // A tenant table; `copilot_system` holds no grant on any tenant table (D-023).
    await expect(sqlStateOf(system, 'select practice_id from practice_settings')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
    await expect(sqlStateOf(system, 'select * from practice_settings')).resolves.toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });
});

describe('PHASE 3 INTERMEDIATE NON-PILOT CONDITIONAL-SETTINGS READ EXPOSURE (08 §21.7.4)', () => {
  it('given copilot_app when it enumerates practice_settings then it reads EVERY row, which is the accepted exposure', async () => {
    // This test asserts a KNOWN, ACCEPTED, DOCUMENTED LIMITATION and must never be read as a
    // pass for tenant isolation. Because `practice_settings` carries no RLS in phase 3, the
    // holder of the shared `copilot_app` credential can enumerate the three permitted columns
    // for every row, and can determine row existence and row count, with no tenant predicate.
    //
    // It is accepted EXCLUSIVELY for this non-pilot intermediate state: there are no real
    // pilot users and no real data at this gate, and phase 4 is mandatory before phase 5,
    // where it is closed with ENABLE + FORCE RLS and the tenant policy (02 §20.2b,
    // D-049 clause 3). No test may claim this exposure is closed in phase 3.
    const rows = await app.query<{ practice_id: string }>(
      'select practice_id from practice_settings order by practice_id',
    );
    const count = await app.query<{ total: string }>(
      'select count(*)::text as total from practice_settings',
    );

    expect(rows.rows).toHaveLength(PHASE_3_SEED.practiceSettings.length);
    expect(count.rows[0]?.total).toBe(String(PHASE_3_SEED.practiceSettings.length));

    // Settings of practices in which this identity holds NO membership are among them.
    const unrelated = PHASE_3_SEED.practices[2]?.id;
    expect(rows.rows.map((row) => row.practice_id)).toContain(unrelated);
  });

  it('given phase 3 when inspected then practice_settings carries no RLS policy at all', async () => {
    // 08 §21.7.3 — the absence itself is the assertion, so phase 4 introducing one cannot go
    // unnoticed.
    const result = await app.query<{ total: string }>(
      `select count(*)::text as total from pg_policy p
         join pg_class c on c.oid = p.polrelid
        where c.relname = 'practice_settings'`,
    );

    expect(result.rows[0]?.total).toBe('0');
  });
});
