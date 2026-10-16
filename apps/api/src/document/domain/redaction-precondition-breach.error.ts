/**
 * `UNEXPECTED INTERNAL FAILURE — PRECONDITION BREACH` of the `phase5-basic-v1` redaction ruleset
 * (D-093 `RULING C.3`, `RULING D.5`).
 *
 * The ruleset only ever receives the SUCCESSFUL output of `normaliseClinicalText` (D-071). A value
 * that violates one of the eight canonical `P5-I3C` postconditions therefore means a defect
 * upstream, not a property of the document — so this is NOT an expected `FAILED` result and is
 * NOT part of the result union.
 *
 * THE MESSAGE IS ONE CONSTANT. It carries no input text, no substring, no length, no violated
 * predicate, no rejected value, no hash and no `cause`, so nothing about the clinical document can
 * reach a log line or a response (`09` §8.6 item 6, §11).
 *
 * NO HTTP MAPPING. How the caller surfaces this failure is `OD-P5-I6-6`, which stays OPEN.
 */

const PRECONDITION_BREACH_MESSAGE =
  'The redaction ruleset received a value that is not canonical normalised clinical text.';

/** The redaction ruleset received input that breaks a canonical `P5-I3C` postcondition. */
export class RedactionPreconditionBreachError extends Error {
  public constructor() {
    super(PRECONDITION_BREACH_MESSAGE);
    this.name = 'RedactionPreconditionBreachError';
  }
}
