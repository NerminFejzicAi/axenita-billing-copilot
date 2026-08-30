/**
 * The public patient-reference projection and its `createdAt` wire contract.
 *
 * Normative sources: `03` §11; D-060 clause 38; D-062 part H.1; D-072 `OD-P5-I4-4` (the audit
 * format this one is NOT); D-073 `OD-P5-I4A-3`; `08` §12.10a points 15-18.
 *
 * WHY THE VECTORS ARE PINNED LITERALLY
 *
 * `03` §11 and D-073 both publish the two canonical vectors byte for byte. Asserting them as
 * literals — rather than by re-deriving them with the very function under test — is the whole
 * point: a change to the serialiser must fail here, and it cannot fail against a expectation
 * computed the same way.
 */

import { describe, expect, it } from 'vitest';

import { type PatientReferenceRow } from '../infrastructure/patient-reference-database.port.js';
import { projectPatientReference } from './patient-reference-projection.js';

const RESOURCE = '44444444-4444-4444-8444-444444444001';

function row(overrides: Partial<PatientReferenceRow> = {}): PatientReferenceRow {
  return {
    id: RESOURCE,
    pseudonym: 'P-K7M2QX4TB9',
    birthYear: 1968,
    sexCode: 'F',
    sourceSystem: 'MANUAL',
    createdAt: new Date('2026-07-18T10:00:00Z'),
    ...overrides,
  };
}

describe('projectPatientReference (03 §11, D-073 OD-P5-I4A-3)', () => {
  describe('exactly six public fields, and no seventh', () => {
    it('renders the canonical document of 03 §11', () => {
      expect(projectPatientReference(row())).toEqual({
        id: RESOURCE,
        pseudonym: 'P-K7M2QX4TB9',
        birthYear: 1968,
        sexCode: 'F',
        sourceSystem: 'MANUAL',
        createdAt: '2026-07-18T10:00:00.000Z',
      });
    });

    it('has exactly six members', () => {
      const document = projectPatientReference(row());

      expect(Object.keys(document)).toHaveLength(6);
      expect(Object.keys(document).sort()).toEqual([
        'birthYear',
        'createdAt',
        'id',
        'pseudonym',
        'sexCode',
        'sourceSystem',
      ]);
    });

    it('preserves both nullable members as null rather than omitting them', () => {
      const document = projectPatientReference(row({ birthYear: null, sexCode: null }));

      expect(document.birthYear).toBeNull();
      expect(document.sexCode).toBeNull();
      expect(Object.keys(document)).toHaveLength(6);
    });

    it('does NOT spread the row — an over-projected column cannot reach the response (M-1)', () => {
      // `patient_references` carries a TABLE-level `SELECT` grant, so there is no column-level
      // `42501` backstop: a widened statement would simply succeed. This is the control that
      // replaces it. The row here carries every forbidden column the real table has, and none
      // of them may appear in the document.
      const contaminated = {
        ...row(),
        practiceId: '11111111-1111-4111-8111-111111111001',
        updatedAt: new Date('2026-07-19T10:00:00Z'),
        externalPatientRefHash: `p5i2v.${'0'.repeat(64)}`,
        externalPatientRefCiphertext: Buffer.from('ciphertext'),
        externalPatientRefIv: Buffer.from('iv'),
        externalPatientRefAuthTag: Buffer.from('authtag'),
        encryptionAlgorithm: 'AES-256-GCM',
        encryptionVersion: 1,
        encryptionKeyRef: 'local',
        encryptionKeyVersion: 1,
      } as unknown as PatientReferenceRow;

      const document = projectPatientReference(contaminated);

      expect(Object.keys(document)).toHaveLength(6);

      for (const forbidden of [
        'practiceId',
        'updatedAt',
        'externalPatientRefHash',
        'externalPatientRefCiphertext',
        'externalPatientRefIv',
        'externalPatientRefAuthTag',
        'encryptionAlgorithm',
        'encryptionVersion',
        'encryptionKeyRef',
        'encryptionKeyVersion',
      ]) {
        expect([forbidden, Object.keys(document).includes(forbidden)]).toEqual([forbidden, false]);
      }

      // And nothing of the sensitive values survives serialisation either.
      const rendered = JSON.stringify(document);

      expect(rendered).not.toContain('p5i2v.');
      expect(rendered).not.toContain('AES-256-GCM');
      expect(rendered).not.toContain('2026-07-19');
    });

    it('builds the document member by member, never by spreading', () => {
      const source = projectPatientReference.toString();

      expect(source).not.toContain('...row');
      expect(source).not.toContain('Object.assign');
    });
  });

  describe('createdAt wire format — UTC_ISO8601_MILLISECONDS_Z (D-073, 08 §12.10a points 15-17)', () => {
    it('emits .000 for a whole second — the canonical vector', () => {
      // 2026-07-18T10:00:00Z  ->  2026-07-18T10:00:00.000Z
      const document = projectPatientReference(
        row({ createdAt: new Date('2026-07-18T10:00:00Z') }),
      );

      expect(document.createdAt).toBe('2026-07-18T10:00:00.000Z');
    });

    it('preserves milliseconds — the canonical vector', () => {
      // 2026-07-18T10:00:00.123Z  ->  2026-07-18T10:00:00.123Z
      const document = projectPatientReference(
        row({ createdAt: new Date('2026-07-18T10:00:00.123Z') }),
      );

      expect(document.createdAt).toBe('2026-07-18T10:00:00.123Z');
    });

    it('normalises a non-UTC instant to UTC with a terminal Z', () => {
      // The same instant expressed with an offset. The wire form is UTC and carries `Z`.
      const document = projectPatientReference(
        row({ createdAt: new Date('2026-07-18T12:00:00.456+02:00') }),
      );

      expect(document.createdAt).toBe('2026-07-18T10:00:00.456Z');
    });

    it.each([
      ['2026-07-18T10:00:00Z', '2026-07-18T10:00:00.000Z'],
      ['2026-07-18T10:00:00.123Z', '2026-07-18T10:00:00.123Z'],
      ['2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
      ['2026-12-31T23:59:59.999Z', '2026-12-31T23:59:59.999Z'],
      ['2026-07-18T10:00:00.010Z', '2026-07-18T10:00:00.010Z'],
      ['2026-07-18T10:00:00.100Z', '2026-07-18T10:00:00.100Z'],
    ])('serialises %s as %s', (instant, wire) => {
      expect(projectPatientReference(row({ createdAt: new Date(instant) })).createdAt).toBe(wire);
    });

    it('matches YYYY-MM-DDTHH:mm:ss.sssZ exactly, with three fractional digits', () => {
      const canonical = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

      for (const instant of [
        '2026-07-18T10:00:00Z',
        '2026-07-18T10:00:00.123Z',
        '2026-01-01T00:00:00.000Z',
        '2026-12-31T23:59:59.999Z',
      ]) {
        const { createdAt } = projectPatientReference(row({ createdAt: new Date(instant) }));

        expect([instant, canonical.test(createdAt)]).toEqual([instant, true]);
        expect(createdAt).toHaveLength(24);
      }
    });

    it('never emits +00:00, a locale rendering or six fractional digits', () => {
      const { createdAt } = projectPatientReference(
        row({ createdAt: new Date('2026-07-18T10:00:00.123Z') }),
      );

      expect(createdAt).not.toContain('+00:00');
      expect(createdAt).not.toContain('+0000');
      expect(createdAt).not.toContain('GMT');
      expect(createdAt).not.toContain(',');
      // Six fractional digits — the audit canonicalisation shape — must not appear.
      expect(createdAt).not.toMatch(/\.\d{6}Z$/);
      // And it is not the JavaScript locale/`toString` rendering of the same instant.
      const instant = new Date('2026-07-18T10:00:00.123Z');
      expect(createdAt).not.toBe(instant.toString());
      expect(createdAt).not.toBe(instant.toLocaleString());
      expect(createdAt).not.toBe(instant.toUTCString());
    });

    it('is DATE_TO_ISO_STRING — not a hand-rolled formatter', () => {
      // The serialiser is `.toISOString()` semantics, so the wire form of any instant is exactly
      // what that method produces. A bespoke formatter could pass the vectors above and still
      // drift on an instant nobody pinned.
      for (const instant of [
        '1999-12-31T23:59:59.999Z',
        '2026-02-28T00:00:00.001Z',
        '2100-06-15T12:34:56.789Z',
      ]) {
        const date = new Date(instant);

        expect(projectPatientReference(row({ createdAt: date })).createdAt).toBe(
          date.toISOString(),
        );
      }
    });
  });

  describe('separation from the audit hash timestamp (D-073, 08 §12.10a point 18)', () => {
    it('does not apply the six-digit audit canonicalisation to the public field', () => {
      // `AUDIT_OCCURRED_AT_FORMAT = UTC_RFC3339_6_FRACTIONAL_DIGITS_LAST_3_ZERO` (D-072
      // `OD-P5-I4-4`) governs the persistent hash payload of `audit_events.occurred_at`. It is
      // a DIFFERENT surface, not a competing candidate for this one — and `P5-I4B` owns it, so
      // nothing in this slice may produce or consume it.
      const auditShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}000Z$/;
      const { createdAt } = projectPatientReference(
        row({ createdAt: new Date('2026-07-18T10:00:00.123Z') }),
      );

      expect(auditShape.test(createdAt)).toBe(false);
      expect(createdAt).toBe('2026-07-18T10:00:00.123Z');
    });

    it('carries no audit, hash or canonicalisation concept at all', () => {
      const source = projectPatientReference.toString();

      for (const forbidden of ['occurredAt', 'occurred_at', 'sha256', 'canonical', 'jcs']) {
        expect([forbidden, source.toLowerCase().includes(forbidden.toLowerCase())]).toEqual([
          forbidden,
          false,
        ]);
      }
    });
  });
});
