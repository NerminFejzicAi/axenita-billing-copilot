/**
 * Unit contract of the SHARED settings representation (D-053 clauses A.1 and A.2; D-055 clauses
 * 1, 2, 22 and 23).
 *
 * WHY THIS SUITE EXISTS
 *
 * These two functions used to live at the bottom of the settings READ service, where the read
 * suites covered them indirectly. The write slice made them shared, and a shared projection needs
 * its own direct proof for one specific reason: the failure mode is a QUIET one. A field added to
 * the projection, or a weak tag emitted instead of a strong one, changes no status code and
 * breaks no route — it just publishes something the frozen contract says must never be published,
 * on BOTH routes at once.
 *
 * The assertions below are therefore about the negative space: exactly eight keys and no ninth,
 * `version` present on the row and absent from the document, and a tag that is the version rather
 * than a hash of the rendering.
 */

import { describe, expect, it } from 'vitest';

import { type PracticeSettingsRow } from '../infrastructure/identity-database.port.js';
import { entityTagOf, projectPracticeSettings } from './practice-settings-representation.js';

const PRACTICE = '11111111-1111-4111-8111-111111111001';

/** The eight members of the frozen representation (D-053 clause A.1), sorted. */
const FROZEN_KEYS = [
  'aiEnabled',
  'allowBillingSpecialistApproval',
  'allowMpaApproval',
  'axenitaExportEnabled',
  'billingReviewRequired',
  'practiceId',
  'requireReasonForManualChange',
  'retentionPolicyCode',
];

function row(overrides: Partial<PracticeSettingsRow> = {}): PracticeSettingsRow {
  return {
    practiceId: PRACTICE,
    billingReviewRequired: true,
    allowMpaApproval: false,
    allowBillingSpecialistApproval: false,
    requireReasonForManualChange: true,
    aiEnabled: false,
    axenitaExportEnabled: false,
    retentionPolicyCode: 'DEV-RETENTION-STANDARD',
    version: 1,
    ...overrides,
  };
}

describe('projectPracticeSettings', () => {
  it('renders exactly the eight frozen members', () => {
    const document = projectPracticeSettings(row());

    expect(Object.keys(document).sort()).toEqual(FROZEN_KEYS);
  });

  it('never publishes `version`, which is the ninth column of the row it is given', () => {
    // The single most important negative property of this function. `version` IS on the input —
    // deliberately, it is what produces the `ETag` — and D-053 clause A.2 allows exactly one
    // channel for it. A spread would have leaked it silently.
    const document = projectPracticeSettings(row({ version: 4242 }));

    expect(document).not.toHaveProperty('version');
    expect(JSON.stringify(document)).not.toContain('4242');
    expect(JSON.stringify(document)).not.toContain('version');
  });

  it('copies every value faithfully, including `false` and `null`', () => {
    // `false` and `null` are the two values a careless projection loses: a truthiness-based copy
    // drops the first and a `??`-based default rewrites the second.
    const document = projectPracticeSettings(
      row({
        billingReviewRequired: false,
        allowMpaApproval: true,
        allowBillingSpecialistApproval: false,
        requireReasonForManualChange: false,
        aiEnabled: true,
        axenitaExportEnabled: false,
        retentionPolicyCode: null,
      }),
    );

    expect(document).toEqual({
      practiceId: PRACTICE,
      billingReviewRequired: false,
      allowMpaApproval: true,
      allowBillingSpecialistApproval: false,
      requireReasonForManualChange: false,
      aiEnabled: true,
      axenitaExportEnabled: false,
      retentionPolicyCode: null,
    });
  });

  it('keeps the same eight keys whether `retentionPolicyCode` holds a value or NULL', () => {
    // `null` is RENDERED as `null` and not omitted, so the key set of the document is the same
    // eight names for every practice. A client can therefore rely on the shape.
    const withValue = projectPracticeSettings(row({ retentionPolicyCode: 'X' }));
    const withNull = projectPracticeSettings(row({ retentionPolicyCode: null }));

    expect(Object.keys(withValue).sort()).toEqual(Object.keys(withNull).sort());
    expect(withNull.retentionPolicyCode).toBeNull();
  });

  it('keeps the empty string distinct from NULL', () => {
    expect(projectPracticeSettings(row({ retentionPolicyCode: '' })).retentionPolicyCode).toBe('');
  });

  it('ignores members the row may grow beyond the nine granted columns', () => {
    // The projection is member by member, so a future widening of the database projection, of a
    // column grant or of the Prisma model cannot reach the HTTP response through this function.
    const widened = {
      ...row(),
      updatedAt: '2026-08-20T00:00:00.000Z',
      updatedBy: '22222222-2222-4222-8222-222222222001',
      configuration: { secret: 'never-rendered' },
      id: '55555555-5555-4555-8555-555555555001',
    } as unknown as PracticeSettingsRow;

    const document = projectPracticeSettings(widened);

    expect(Object.keys(document).sort()).toEqual(FROZEN_KEYS);
    expect(JSON.stringify(document)).not.toContain('never-rendered');
  });
});

describe('entityTagOf', () => {
  it.each([
    [0, '"0"'],
    [1, '"1"'],
    [27, '"27"'],
    [2147483647, '"2147483647"'],
  ])('renders version %i as %s', (version, expected) => {
    expect(entityTagOf(version)).toBe(expected);
  });

  it('emits a STRONG tag — never the weak form (D-055 clause 13)', () => {
    const tag = entityTagOf(3);

    expect(tag).not.toMatch(/^W\//);
    expect(tag).toMatch(/^"\d+"$/);
  });

  it('emits exactly the token the If-Match grammar accepts (D-055 clause 11)', () => {
    // THE ROUND-TRIP PROPERTY, asserted at the unit level: what this function emits is what the
    // parser must take back. If either side drifts, a client that echoes the tag it was given
    // would start receiving `400`, which is the one failure this pairing must never produce.
    const accepted = /^"(0|[1-9][0-9]*)"$/;

    for (const version of [0, 1, 9, 10, 27, 100, 2147483647]) {
      expect(entityTagOf(version)).toMatch(accepted);
    }
  });

  it('is a function of the version alone, never of the document', () => {
    // The property that separates a VERSION tag from a CONTENT tag: two different documents with
    // the same version carry the same tag, and the same document with two versions does not.
    const a = row({ aiEnabled: true, retentionPolicyCode: 'A', version: 5 });
    const b = row({ aiEnabled: false, retentionPolicyCode: null, version: 5 });

    expect(projectPracticeSettings(a)).not.toEqual(projectPracticeSettings(b));
    expect(entityTagOf(a.version)).toBe(entityTagOf(b.version));
    expect(entityTagOf(a.version)).not.toBe(entityTagOf(a.version + 1));
  });
});
