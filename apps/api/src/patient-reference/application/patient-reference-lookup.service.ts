/**
 * The two SERVICE-LEVEL patient-reference lookups — `CO-P5-I3-I4-1` and `CO-P5-I3-I4-2`.
 *
 * Normative sources: `03` §11; `04` §7.5a.3, *Vlasništvo lookup sposobnosti*; `09` §11 and §18.1
 * threat `T1`; D-060; D-070; D-072 `OD-P5-I4-14`; D-079 `RULING B` items 9-12; `08` §12.12
 * obligations 12, 13 and 18.
 *
 * THERE IS NO HTTP ROUTE, AND NONE IS REGISTERED ANYWHERE
 *
 * `P5-I4C` implements both capabilities at the SERVICE level only. No controller method, no
 * `@Get`, no `@Post`, no query parameter and no path variant exists for either — the
 * patient-reference controller owns exactly two routes and neither is a lookup. `P5-I5` consumes
 * the pseudonym capability unchanged later; exposing it now would be a public surface nobody has
 * ratified.
 *
 * NEITHER IS A PLAINTEXT ORACLE
 *
 * The external-reference lookup never sends a plaintext identifier to the database: the value is
 * normalised under MANUAL-v1, turned into a domain-separated, practice-scoped, `MANUAL`-scoped
 * keyed token, and only the token is bound. A caller who does not hold `K_hmac` cannot construct
 * a token, and the token is never returned — the six-field document these methods return is the
 * public representation, which by design contains neither the identifier nor its hash (D-060
 * clause 38).
 *
 * BOTH ARE TENANT-SCOPED, AND THAT IS TWO BARRIERS AGAIN. Every statement runs on the ADMITTED
 * session under `patient_references_select`, and each carries the explicit
 * `practice_id = <admitted>` term as well. The same pseudonym or the same external reference in
 * ANOTHER practice is not found: not found and filtered, not found at all.
 *
 * AN UNPARSEABLE INPUT COSTS ZERO STATEMENTS. A value that cannot be a stored pseudonym, or that
 * the MANUAL-v1 profile refuses, is answered `undefined` WITHOUT any database round trip — such
 * a value could never have been stored in the first place, because storing one requires passing
 * exactly these rules, so "not found" is the truthful answer rather than a swallowed error.
 */

import { Inject, Injectable } from '@nestjs/common';

import { type PatientReferenceResponseDto } from '@axenita/contracts';

import { CryptoOperationError } from '../../crypto/crypto.errors.js';
import {
  EXTERNAL_REFERENCE_HMAC,
  type ExternalReferenceHmac,
} from '../../crypto/external-reference.port.js';
import { normaliseManualV1ExternalIdentifier } from '../../crypto/manual-v1-identifier-normalizer.js';
import { canonicalisePseudonymUppercase } from '../../crypto/pseudonym.js';
import { type AdmittedTenantSession } from '../../database/tenant-statement.js';
import { isCanonicalPseudonym } from '../domain/pseudonym-syntax.js';
import { PatientReferenceDatabase } from '../infrastructure/patient-reference.database.js';
import { projectPatientReference } from './patient-reference-projection.js';

/** The HMAC domain of a patient external reference (D-060; `04` §7.5a.3). */
const PATIENT_EXTERNAL_REFERENCE_DOMAIN = 'patient_external_ref';

/** The one accepted `source_system` of this slice (D-072 `OD-P5-I4-9`). */
const MANUAL_SOURCE_SYSTEM = 'MANUAL';

@Injectable()
export class PatientReferenceLookupService {
  public constructor(
    private readonly patientReferences: PatientReferenceDatabase,
    @Inject(EXTERNAL_REFERENCE_HMAC)
    private readonly externalReferenceHmac: ExternalReferenceHmac,
  ) {}

  /**
   * `CO-P5-I3-I4-1` — the tenant-scoped lookup by pseudonym.
   *
   * THE INPUT IS CANONICALISED, THEN VALIDATED, THEN COMPARED FOR PLAIN EQUALITY:
   *
   * 1. `canonicalisePseudonymUppercase` — the accepted `P5-I3C` helper, REUSED WITHOUT MUTATION.
   *    It maps `a`-`z` to `A`-`Z` and touches nothing else; it is deliberately not
   *    `toUpperCase()`, which is a Unicode operation that turns `ı` into `I` and `ﬁ` into `FI`
   *    and could therefore map a non-pseudonym onto a real one;
   * 2. the ADDITIVE v1 syntax validator — `P-` plus exactly ten Crockford Base32 characters;
   * 3. plain `=` against the stored value. NO `LOWER()`, NO `citext`, NO special collation
   *    (`04` §7.5a.3): case insensitivity lives in step 1, where it can be read and tested,
   *    rather than inside a database expression that would also defeat the unique index.
   *
   * @param tenant the statement surface of an ADMITTED request.
   * @param rawPseudonym a caller-supplied pseudonym in any ASCII casing.
   * @returns the canonical six-field document, or `undefined` — for a syntactically impossible
   *   value, for an unknown one, and for one belonging to another practice, indistinguishably.
   */
  public async findByPseudonym(
    tenant: AdmittedTenantSession,
    rawPseudonym: string,
  ): Promise<PatientReferenceResponseDto | undefined> {
    const canonical = canonicalisePseudonymUppercase(rawPseudonym);

    if (!isCanonicalPseudonym(canonical)) {
      // ZERO STATEMENTS for a value that cannot be a pseudonym. It is refused before the database
      // is reached, so a malformed probe learns nothing at all.
      return undefined;
    }

    const row = await this.patientReferences.findByPseudonymInAdmittedPractice(tenant, canonical);

    return row === undefined ? undefined : projectPatientReference(row);
  }

  /**
   * `CO-P5-I3-I4-2` — the tenant-scoped lookup by external reference.
   *
   * THE CHAIN IS THE CANONICAL ONE, IN THIS ORDER (`04` §7.5a.3):
   *
   *     MANUAL-v1 normalisation
   *       -> domain `patient_external_ref`
   *       -> the ADMITTED practice_id
   *       -> source_system = MANUAL
   *       -> HMAC-SHA256  ->  h1.<64 lowercase hex>
   *       -> tenant-scoped equality on external_patient_ref_hash
   *
   * It is the SAME chain the write path uses, with the SAME primitives, so a value stored by a
   * create is found by a lookup — and a value that differs only in NFC form, in a leading BOM or
   * in outer whitespace is found too, because normalisation happens before the key is applied.
   *
   * THE PRACTICE COMES FROM THE ADMITTED SESSION, never from a parameter: two practices that hold
   * the same external identifier produce different tokens, so the token itself carries the tenant
   * boundary in addition to the statement's predicate and the row policy.
   *
   * @returns the canonical six-field document, or `undefined` — for a value the profile refuses,
   *   for an unknown one, and for one belonging to another practice, indistinguishably. The
   *   plaintext identifier and the keyed token are absent from the result by construction.
   */
  public async findByExternalReference(
    tenant: AdmittedTenantSession,
    rawExternalReference: string,
  ): Promise<PatientReferenceResponseDto | undefined> {
    let normalised: string;

    try {
      normalised = normaliseManualV1ExternalIdentifier(rawExternalReference);
    } catch (error) {
      if (error instanceof CryptoOperationError) {
        // ZERO STATEMENTS. A value the profile refuses could never have been stored, because
        // storing one requires passing this very profile — so `undefined` is the truthful answer
        // and not a swallowed failure. A configuration error is NOT translated and propagates.
        return undefined;
      }

      throw error;
    }

    const externalPatientRefHash = this.externalReferenceHmac.compute({
      domain: PATIENT_EXTERNAL_REFERENCE_DOMAIN,
      practiceId: tenant.practiceId,
      sourceSystem: MANUAL_SOURCE_SYSTEM,
      value: normalised,
    });

    const row = await this.patientReferences.findByExternalReferenceInAdmittedPractice(
      tenant,
      MANUAL_SOURCE_SYSTEM,
      externalPatientRefHash,
    );

    return row === undefined ? undefined : projectPatientReference(row);
  }
}
