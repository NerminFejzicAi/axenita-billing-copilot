/**
 * The canonical `EXTERNAL_REFERENCE_HMAC` boundary (`12` §19, `04` §7.5 slice P5-I3B).
 *
 * WHAT THIS PORT IS FOR
 *
 * An external reference — a practice's own patient number, an encounter number from a PVS, a
 * document identifier from an import — must be findable without being stored in the clear. The
 * mechanism is a keyed digest: the same identifier under the same tenant, the same source system
 * and the same domain always produces the same token, and nobody holding the token can recover
 * the identifier. That property is only worth anything if EVERY producer of a token agrees on
 * the exact bytes that go into it, which is why the canonicalisation, the domain catalogue and
 * the message layout live behind ONE port instead of next to each future consumer.
 *
 * WHAT THIS PORT DELIBERATELY DOES NOT DO
 *
 * - It does not touch a database. `practiceId` is a cryptographic input, not a lookup: nothing
 *   here checks that the practice exists, and a value that does not exist simply produces a
 *   token nothing will ever match.
 * - It carries no Prisma type and no HTTP type. The source-system catalogue below is spelled out
 *   as a closed literal set INSIDE this boundary rather than imported from the generated Prisma
 *   client or from a business module, for the same reason `encryption.port.ts` carries no Prisma
 *   type: a cryptographic primitive whose accepted inputs are defined by a generated artefact
 *   would change its message bytes whenever that artefact is regenerated.
 * - It does not normalise. The value it accepts is ALREADY normalised, by a profile the caller
 *   selected explicitly (see `manual-v1-identifier-normalizer.ts`). Guessing a profile from the
 *   source system is exactly the drift this port exists to prevent.
 * - It knows nothing about key provenance, and it has no key generation. Rotation, a persisted
 *   key version and multi-generation token parsing are NOT part of this slice.
 */

/** DI token of the canonical external-reference HMAC boundary (`12` §19). */
export const EXTERNAL_REFERENCE_HMAC = Symbol('ExternalReferenceHmac');

/**
 * DI token of the key provider the HMAC service reads `K_hmac` from.
 *
 * MODULE INTERNAL. `CryptoModule` binds it and does not export it: the only two consumers are
 * the HMAC service and the `K_hmac != K_enc` startup guard, and a business module that could
 * inject it would be able to read raw key material.
 */
export const HMAC_KEY_PROVIDER = Symbol('HmacKeyProvider');

/**
 * The active generation marker every token produced by this slice carries.
 *
 * It is a PREFIX, not a version negotiation. P5-I3B is the current-generation generator and
 * nothing else: there is deliberately no parser for other prefixes, because a parser for
 * generations that do not exist would be an untested guess about a future rotation design.
 */
export const EXTERNAL_REFERENCE_HMAC_GENERATION_PREFIX = 'h1.';

/** Length of `h1.` plus the 64 lowercase hex characters of a SHA-256 digest. */
export const EXTERNAL_REFERENCE_HMAC_TOKEN_LENGTH = 67;

/** Shape of a canonical token — the active generation prefix and a lowercase hex digest. */
export const EXTERNAL_REFERENCE_HMAC_TOKEN_PATTERN = /^h1\.[0-9a-f]{64}$/;

/**
 * The CLOSED catalogue of external-reference HMAC domains.
 *
 * The domain is a separator, not a label. Two tenants' identifier spaces are already separated
 * by `practice_id`; this line separates the spaces of DIFFERENT KINDS of reference inside one
 * tenant, so a patient number and an encounter number that happen to be the same string never
 * collide into one token. The catalogue is closed on purpose — an open string parameter would
 * let a caller invent a fourth domain, and a domain invented once is a domain that has to be
 * supported forever.
 */
export const EXTERNAL_REFERENCE_HMAC_DOMAINS = [
  'patient_external_ref',
  'encounter_external_ref',
  'document_external_ref',
] as const;

/** One of the three domains of {@link EXTERNAL_REFERENCE_HMAC_DOMAINS}. */
export type ExternalReferenceHmacDomain = (typeof EXTERNAL_REFERENCE_HMAC_DOMAINS)[number];

/**
 * The CLOSED catalogue of source systems the canonical message accepts.
 *
 * It names WHERE an identifier came from, and it is part of the authenticated message because
 * two systems may legitimately issue the same identifier for different patients.
 *
 * ACCEPTING A LITERAL IS NOT THE SAME AS NORMALISING FOR IT. This slice implements exactly ONE
 * normalisation profile — MANUAL-v1. `AXENITA`, `CSV`, `FHIR` and `OTHER` are accepted as
 * message inputs, and their normalisation profiles are NOT implemented here and must not be
 * assumed to exist.
 */
export const EXTERNAL_REFERENCE_SOURCE_SYSTEMS = [
  'AXENITA',
  'MANUAL',
  'CSV',
  'FHIR',
  'OTHER',
] as const;

/** One of the five literals of {@link EXTERNAL_REFERENCE_SOURCE_SYSTEMS}. */
export type ExternalReferenceSourceSystem = (typeof EXTERNAL_REFERENCE_SOURCE_SYSTEMS)[number];

/**
 * The four values that identify one external reference.
 *
 * `practiceId` is a canonical TENANT UUID. It is deliberately NOT the
 * `practiceId: 'canonical UUID or SYSTEM'` of `EncryptionAad`: an external reference belongs to
 * a practice's own identifier space, platform scope has no such space, and widening this type
 * to admit the `SYSTEM` literal would advertise a scope this contract does not support. It is
 * not validated against a database and it is not re-normalised.
 *
 * `value` is ALREADY normalised. Which profile normalised it is the caller's explicit choice —
 * the only profile this slice ships is MANUAL-v1.
 */
export interface ExternalReferenceIdentity {
  readonly domain: ExternalReferenceHmacDomain;
  readonly practiceId: string;
  readonly sourceSystem: ExternalReferenceSourceSystem;
  readonly value: string;
}

/** The canonical external-reference HMAC boundary. */
export interface ExternalReferenceHmac {
  /**
   * Computes the keyed lookup token of one external reference.
   *
   * Returns `h1.` followed by 64 lowercase hex characters. Deterministic for one identity and
   * one key; every one of the four inputs changes the result.
   */
  compute(identity: ExternalReferenceIdentity): string;
}

/**
 * Source of the symmetric key material the external-reference HMAC uses, `K_hmac`.
 *
 * Deliberately smaller than `EncryptionKeyProvider`: there is no `keyRef` because nothing is
 * persisted by this slice, and no `keyForVersion` because a token carries no key generation.
 * Adding either would model a rotation mechanism that does not exist yet.
 */
export interface HmacKeyProvider {
  /** Key material of the active HMAC key, exactly 32 bytes. Never logged, never rendered. */
  currentKey(): Buffer;
}
