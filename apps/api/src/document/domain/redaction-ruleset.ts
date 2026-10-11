import { CLINICAL_TEXT_MAX_UTF8_BYTES } from '../../crypto/clinical-text-normalizer.js';

import {
  findAhvCandidates,
  findEmailCandidates,
  findIbanCandidates,
  findPhoneCandidates,
  type RedactionCandidate,
  type RedactionClass,
} from './redaction-matchers.js';
import { assertRedactionPreconditions } from './redaction-preconditions.js';
import { findUrlCandidates } from './redaction-url.js';

/**
 * The deterministic redaction ruleset `phase5-basic-v1` (`P5-I6A`, D-093; D-060, D-070, D-092).
 *
 * A PURE FUNCTION. No database, no I/O, no clock, no randomness, no logging, no shared mutable
 * state, no hashing, no audit and no request context (D-093 `RULING B`, `RULING C.8`). The same
 * input under the same version always yields the same result.
 *
 * THE PIPELINE (D-093 `RULING H.1`).
 *
 *   1  re-assert the eight canonical P5-I3C postconditions — assertion only (`RULING C.3`);
 *   2  run every class pass independently over the IMMUTABLE input `T`;
 *   3  resolve overlaps on replacement spans only (`RULING H.2`, `H.3`);
 *   4  assemble the output ONCE from `T`; tokens are never re-scanned;
 *   5  measure the FINAL output in UTF-8 bytes: <= 262144 -> COMPLETED, else FAILED.
 *
 * WHAT IT IS NOT. Rule-based redaction of five structural classes, not anonymisation, not an AI
 * classifier and not a complete PHI-removal boundary. Names, addresses and clinical content are
 * excluded; insurance / card / `VeKa` is not a v1 class. The external / current-intake patient
 * reference class is `INERT WITHOUT INPUT SOURCE`: there is no parameter, token or detection for
 * it, and a `COMPLETED` result never represents it as redacted (D-092 / D-093 `RULING E`).
 */

/** The fixed ruleset version literal (D-093 `RULING B`). Any behaviour change needs a new one. */
export const REDACTION_RULESET_VERSION = 'phase5-basic-v1';

export type RedactionRulesetVersion = typeof REDACTION_RULESET_VERSION;

/** The fixed, stable, unindexed, non-derivative class tokens (D-093 `RULING E`). */
export const REDACTION_TOKENS: Readonly<Record<RedactionClass, string>> = Object.freeze({
  EMAIL: '[REDACTED:EMAIL]',
  URL: '[REDACTED:URL]',
  AHV: '[REDACTED:AHV]',
  IBAN: '[REDACTED:IBAN]',
  PHONE: '[REDACTED:PHONE]',
});

/** The complete expected-failure set (D-093 `RULING D.1`). */
export type RedactionFailureCode = 'REDACTED_OUTPUT_TOO_LARGE';

/** The redacted output fits and is returned. */
export interface RedactionCompleted {
  readonly status: 'COMPLETED';
  readonly rulesetVersion: RedactionRulesetVersion;
  readonly redactedText: string;
}

/** An EXPECTED failure: carries a static code and no text at all. */
export interface RedactionFailed {
  readonly status: 'FAILED';
  readonly rulesetVersion: RedactionRulesetVersion;
  readonly failureCode: RedactionFailureCode;
}

/**
 * The result union (D-093 `RULING C.4`). It deliberately has no source text, no hash, no span,
 * no counter, no list of matched classes and no audit payload.
 */
export type RedactionResult = RedactionCompleted | RedactionFailed;

/** Class precedence for equal replacement spans: `URL > EMAIL > IBAN > AHV > PHONE`. */
const CLASS_PRIORITY: Readonly<Record<RedactionClass, number>> = Object.freeze({
  URL: 0,
  EMAIL: 1,
  IBAN: 2,
  AHV: 3,
  PHONE: 4,
});

/**
 * The total order of D-093 `RULING H.3`: lowest `replaceStart`, then the longest replacement
 * span, then class precedence. Recognition spans are never consulted.
 */
function compareCandidates(left: RedactionCandidate, right: RedactionCandidate): number {
  return (
    left.replaceStart - right.replaceStart ||
    right.replaceEnd - right.replaceStart - (left.replaceEnd - left.replaceStart) ||
    CLASS_PRIORITY[left.redactionClass] - CLASS_PRIORITY[right.redactionClass]
  );
}

/**
 * Overlap resolution (D-093 `RULING H.2`): in comparator order, a candidate is accepted when its
 * replacement span starts at or after the end of the last accepted one, and is otherwise
 * discarded WHOLE — no truncation, no union, no partial salvage. Two candidates conflict only
 * when their REPLACEMENT spans intersect; intersecting recognition spans alone are no conflict.
 */
export function selectRedactionCandidates(
  candidates: readonly RedactionCandidate[],
): RedactionCandidate[] {
  const ordered = [...candidates].sort(compareCandidates);
  const accepted: RedactionCandidate[] = [];
  let lastEnd = 0;

  for (const candidate of ordered) {
    if (candidate.replaceStart >= lastEnd) {
      accepted.push(candidate);
      lastEnd = candidate.replaceEnd;
    }
  }

  return accepted;
}

/** Every candidate of every class over the immutable input (D-093 `RULING H.1`). */
function findAllCandidates(text: string): RedactionCandidate[] {
  return [
    ...findEmailCandidates(text),
    ...findUrlCandidates(text),
    ...findAhvCandidates(text),
    ...findIbanCandidates(text),
    ...findPhoneCandidates(text),
  ];
}

/**
 * Applies `phase5-basic-v1` to one normalised clinical document.
 *
 * @param normalisedText the SUCCESSFUL output of `normaliseClinicalText` — nothing else. It is
 *   never re-normalised, repaired, trimmed or otherwise transformed.
 * @returns `COMPLETED` with the redacted text (identical to the input when nothing matched), or
 *   `FAILED` with `REDACTED_OUTPUT_TOO_LARGE` and no text.
 * @throws RedactionPreconditionBreachError when the input breaks a canonical `P5-I3C`
 *   postcondition — an UNEXPECTED internal failure, never a `FAILED` result.
 */
export function applyRedactionRuleset(normalisedText: string): RedactionResult {
  assertRedactionPreconditions(normalisedText);

  const accepted = selectRedactionCandidates(findAllCandidates(normalisedText));

  const parts: string[] = [];
  let cursor = 0;
  for (const candidate of accepted) {
    parts.push(
      normalisedText.slice(cursor, candidate.replaceStart),
      REDACTION_TOKENS[candidate.redactionClass],
    );
    cursor = candidate.replaceEnd;
  }
  parts.push(normalisedText.slice(cursor));
  const redactedText = parts.join('');

  // Measured on the FINAL assembled output; never truncated (D-093 `RULING D.2`, `D.3`).
  if (Buffer.byteLength(redactedText, 'utf8') > CLINICAL_TEXT_MAX_UTF8_BYTES) {
    return Object.freeze({
      status: 'FAILED',
      rulesetVersion: REDACTION_RULESET_VERSION,
      failureCode: 'REDACTED_OUTPUT_TOO_LARGE',
    });
  }

  return Object.freeze({
    status: 'COMPLETED',
    rulesetVersion: REDACTION_RULESET_VERSION,
    redactedText,
  });
}
