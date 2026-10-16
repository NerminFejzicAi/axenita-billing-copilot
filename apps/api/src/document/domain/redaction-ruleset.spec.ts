import { afterEach, describe, expect, it, vi } from 'vitest';

import { findPhoneCandidates, type RedactionCandidate } from './redaction-matchers.js';
import { RedactionPreconditionBreachError } from './redaction-precondition-breach.error.js';
import {
  REDACTION_RULESET_VERSION,
  REDACTION_TOKENS,
  applyRedactionRuleset,
  selectRedactionCandidates,
  type RedactionResult,
} from './redaction-ruleset.js';
import { findUrlCandidates } from './redaction-url.js';

/**
 * `P5-I6A` — the `phase5-basic-v1` engine end to end (D-093 `RULING C`, `D`, `E`, `H`, `J`;
 * `08` §12.15.2).
 *
 * Every vector states its exact expected output (NB-1). `(group)×N` vectors are built
 * programmatically by repeating the group N times, and their UTF-8 size is asserted (NB-2).
 * Non-ASCII characters are built from code points. All data is synthetic.
 */

const cp = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);
const utf8 = (value: string): number => Buffer.byteLength(value, 'utf8');
/** `(group)×count` (NB-2). */
const repeat = (group: string, count: number): string => group.repeat(count);

const EMAIL = '[REDACTED:EMAIL]';
const URL = '[REDACTED:URL]';
const AHV = '[REDACTED:AHV]';
const IBAN = '[REDACTED:IBAN]';
const PHONE = '[REDACTED:PHONE]';

const U_UMLAUT = cp(0x00fc);
const A_UMLAUT = cp(0x00e4);

/** Runs the engine twice and returns the redacted text of the (identical) COMPLETED results. */
function redact(input: string): string {
  const first = applyRedactionRuleset(input);
  const second = applyRedactionRuleset(input);
  expect(second).toEqual(first);
  expect(first.status).toBe('COMPLETED');
  if (first.status !== 'COMPLETED') {
    throw new Error('expected COMPLETED');
  }
  return first.redactedText;
}

describe('ruleset identity, token catalogue and result shapes (D-093 RULING B, C.4, E)', () => {
  it('the version literal is phase5-basic-v1', () => {
    expect(REDACTION_RULESET_VERSION).toBe('phase5-basic-v1');
  });

  it('the token catalogue has exactly the five active classes and their fixed tokens', () => {
    expect(REDACTION_TOKENS).toEqual({
      EMAIL: '[REDACTED:EMAIL]',
      URL: '[REDACTED:URL]',
      AHV: '[REDACTED:AHV]',
      IBAN: '[REDACTED:IBAN]',
      PHONE: '[REDACTED:PHONE]',
    });
    expect(Object.keys(REDACTION_TOKENS)).toHaveLength(5);
    expect(Object.isFrozen(REDACTION_TOKENS)).toBe(true);
  });

  it('the token byte lengths are the frozen ones (EMAIL 16, URL 14, AHV 14, IBAN 15, PHONE 16)', () => {
    expect(Object.values(REDACTION_TOKENS).map(utf8)).toEqual([16, 14, 14, 15, 16]);
  });

  it('no insurance / card / VeKa, name, address or external-reference class exists', () => {
    for (const forbidden of [
      'INSURANCE',
      'VEKA',
      'CARD',
      'NAME',
      'ADDRESS',
      'EXTERNAL_REFERENCE',
    ]) {
      expect(Object.keys(REDACTION_TOKENS)).not.toContain(forbidden);
    }
  });

  it('the engine takes exactly one argument: there is no external-reference parameter', () => {
    expect(applyRedactionRuleset.length).toBe(1);
  });

  it('COMPLETED has exactly status, rulesetVersion and redactedText', () => {
    const result = applyRedactionRuleset('Mail an a@b.cd');
    expect(Object.keys(result).sort()).toEqual(['redactedText', 'rulesetVersion', 'status']);
    expect(result).toEqual({
      status: 'COMPLETED',
      rulesetVersion: 'phase5-basic-v1',
      redactedText: `Mail an ${EMAIL}`,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('FAILED has exactly status, rulesetVersion and failureCode', () => {
    const result = applyRedactionRuleset(`a@b.cd ${'x'.repeat(262137)}`);
    expect(Object.keys(result).sort()).toEqual(['failureCode', 'rulesetVersion', 'status']);
    expect(result).toEqual({
      status: 'FAILED',
      rulesetVersion: 'phase5-basic-v1',
      failureCode: 'REDACTED_OUTPUT_TOO_LARGE',
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('no result carries source text, hashes, spans, counters, classes or coverage', () => {
    const results: RedactionResult[] = [
      applyRedactionRuleset('a@b.cd https://example.ch 756.1234.5678.97 Tel 0791234567'),
      applyRedactionRuleset(`a@b.cd ${'x'.repeat(262137)}`),
    ];
    for (const result of results) {
      const keys = Object.keys(result);
      for (const forbidden of [
        'sourceText',
        'originalText',
        'sourceTextHash',
        'redactedTextHash',
        'hash',
        'matches',
        'spans',
        'classes',
        'matchedClasses',
        'coverage',
        'count',
        'audit',
      ]) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });
});

describe('mandatory recognitionSpan != replacementSpan vector (D-093 RULING H.0-H.3)', () => {
  it('www.praxis.ch/Tel 079 123 45 67 -> [REDACTED:URL] [REDACTED:PHONE]', () => {
    expect(redact('www.praxis.ch/Tel 079 123 45 67')).toBe(`${URL} ${PHONE}`);
  });

  it('the PHONE recognition span overlaps the URL replacement span, the replacement spans do not', () => {
    const input = 'www.praxis.ch/Tel 079 123 45 67';
    const [url] = findUrlCandidates(input);
    const [phone] = findPhoneCandidates(input);

    expect(url).toEqual({
      redactionClass: 'URL',
      recognitionStart: 0,
      recognitionEnd: 17,
      replaceStart: 0,
      replaceEnd: 17,
    });
    expect(phone).toEqual({
      redactionClass: 'PHONE',
      recognitionStart: 14,
      recognitionEnd: 31,
      replaceStart: 18,
      replaceEnd: 31,
    });
    if (url === undefined || phone === undefined) {
      throw new Error('expected both candidates');
    }
    // Recognition spans intersect (the label `Tel` lies inside the URL)…
    expect(phone.recognitionStart < url.replaceEnd).toBe(true);
    // …replacement spans do not, so both are accepted.
    expect(phone.replaceStart >= url.replaceEnd).toBe(true);
    expect(selectRedactionCandidates([phone, url])).toEqual([url, phone]);
  });

  it.each([
    ['https://example.ch/?q=Natel 0791234567', `${URL} ${PHONE}`],
    ['www.praxis.ch/Tel:0791234567', URL],
  ])('%s -> %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it('contrast: in www.praxis.ch/Tel:0791234567 the PHONE replacement lies inside the URL one', () => {
    const input = 'www.praxis.ch/Tel:0791234567';
    const [url] = findUrlCandidates(input);
    const [phone] = findPhoneCandidates(input);
    expect(url?.replaceEnd).toBe(input.length);
    expect(phone?.replaceStart).toBe(18);
    if (url === undefined || phone === undefined) {
      throw new Error('expected both candidates');
    }
    expect(selectRedactionCandidates([url, phone])).toEqual([url]);
  });
});

describe('N-2 — independent discovery after a rejected URL (OBLIGATORY)', () => {
  it.each([
    ['https://user:pw@example.ch:999999/x', `https://user:${EMAIL}:999999/x`],
    ['https://example.ch./?tel=+41791234567', `https://example.ch./?tel=${PHONE}`],
    ['https://bad_host.ch/?u=www.example.ch', `https://bad_host.ch/?u=${URL}`],
  ])('%s -> %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });
});

describe('repeated / adjacent (08 §12.15.2; D-093 RULING H.4)', () => {
  it.each([
    ['e1@x.ch,e2@y.ch', `${EMAIL},${EMAIL}`],
    ['a@b.cd a@b.cd', `${EMAIL} ${EMAIL}`],
    ['756.1234.5678.97/+41791234567', `${AHV}/${PHONE}`],
    ['+41 79 123 45 67/+41 79 765 43 21', `${PHONE}/${PHONE}`],
    ['+41791234567,+41797654321', `${PHONE},${PHONE}`],
    ['CH0900700123456789012+41791234567', `${IBAN}+41791234567`],
    ['a@b.cd a@b.cd a@b.cd', `${EMAIL} ${EMAIL} ${EMAIL}`],
  ])('%s -> %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });
});

describe('overlap / precedence (08 §12.15.2; D-093 RULING H.2, H.3)', () => {
  it.each([
    ['+41791234567@example.ch', EMAIL],
    ['7561234567897@example.ch', EMAIL],
    ['https://example.ch/?tel=+41791234567', URL],
    ['https://example.ch/p/756.1234.5678.97', URL],
    ['https://example.ch/CH0900700123456789012', URL],
    ['https://user@example.ch', URL],
    ['john@www.example.ch', EMAIL],
    ['www.example.ch/john@x.ch', URL],
    ['a@b.cd,756.1234.5678.97;CH0900700123456789012.', `${EMAIL},${AHV};${IBAN}.`],
    ['Tel 079 123 45 67 756.1234.5678.97', `Tel 079 123 45 67 ${AHV}`],
  ])('%s -> %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });
});

describe('candidate selection on replacement spans only (D-093 RULING H.2, H.3)', () => {
  const candidate = (
    redactionClass: RedactionCandidate['redactionClass'],
    replaceStart: number,
    replaceEnd: number,
    recognitionStart = replaceStart,
    recognitionEnd = replaceEnd,
  ): RedactionCandidate => ({
    redactionClass,
    recognitionStart,
    recognitionEnd,
    replaceStart,
    replaceEnd,
  });

  it('intersecting recognition spans alone are no conflict', () => {
    const url = candidate('URL', 0, 10, 0, 10);
    const phone = candidate('PHONE', 11, 20, 5, 20);
    expect(selectRedactionCandidates([phone, url])).toEqual([url, phone]);
  });

  it('lowest replaceStart first, then the longest replacement span', () => {
    const short = candidate('URL', 0, 5);
    const long = candidate('PHONE', 0, 9);
    expect(selectRedactionCandidates([short, long])).toEqual([long]);
  });

  it('equal replacement spans: URL > EMAIL > IBAN > AHV > PHONE', () => {
    const classes = ['PHONE', 'AHV', 'IBAN', 'EMAIL', 'URL'] as const;
    for (let winner = classes.length - 1; winner >= 0; winner -= 1) {
      const pool = classes.slice(0, winner + 1).map((name) => candidate(name, 3, 9));
      expect(selectRedactionCandidates(pool)).toEqual([candidate(classes[winner] ?? 'URL', 3, 9)]);
    }
  });

  it('a later partially overlapping candidate is discarded WHOLE (no truncation, no union)', () => {
    const first = candidate('EMAIL', 0, 10);
    const partial = candidate('AHV', 8, 20);
    expect(selectRedactionCandidates([partial, first])).toEqual([first]);
  });

  it('a nested candidate loses to its container', () => {
    const container = candidate('URL', 0, 30);
    const nested = candidate('EMAIL', 5, 15);
    expect(selectRedactionCandidates([nested, container])).toEqual([container]);
  });

  it('touching candidates (end == start) are both accepted', () => {
    const left = candidate('EMAIL', 0, 6);
    const right = candidate('EMAIL', 6, 12);
    expect(selectRedactionCandidates([right, left])).toEqual([left, right]);
  });

  it('the outcome does not depend on the input order', () => {
    const pool = [
      candidate('URL', 0, 10),
      candidate('EMAIL', 0, 10),
      candidate('PHONE', 4, 12),
      candidate('AHV', 12, 20),
      candidate('IBAN', 12, 20),
    ];
    const expected = [candidate('URL', 0, 10), candidate('IBAN', 12, 20)];
    expect(selectRedactionCandidates(pool)).toEqual(expected);
    expect(selectRedactionCandidates([...pool].reverse())).toEqual(expected);
    expect(
      selectRedactionCandidates(
        [pool[2], pool[4], pool[0], pool[3], pool[1]].filter(
          (entry): entry is RedactionCandidate => entry !== undefined,
        ),
      ),
    ).toEqual(expected);
  });
});

describe('pre-existing token text is scanned like any other text (D-093 RULING E)', () => {
  it.each([
    [`${EMAIL}${URL}${AHV}${IBAN}${PHONE}`, `${EMAIL}${URL}${AHV}${IBAN}${PHONE}`],
    [EMAIL, EMAIL],
    [URL, URL],
    [AHV, AHV],
    [IBAN, IBAN],
    [PHONE, PHONE],
    [`Tel ${PHONE}`, `Tel ${PHONE}`],
    ['[REDACTED:EMAIL', '[REDACTED:EMAIL'],
    ['[REDACTED:john@x.ch]', `[REDACTED:${EMAIL}]`],
    [`${EMAIL}john@x.ch`, `${EMAIL}${EMAIL}`],
  ])('%s -> %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });
});

describe('token properties: fixed, unindexed, non-derivative (D-093 RULING E)', () => {
  it('different originals get the identical token; nothing of the original survives', () => {
    expect(redact('a@b.cd')).toBe(EMAIL);
    expect(redact('very.long.address.of.someone@department.example.co.uk')).toBe(EMAIL);
    expect(redact('a@b.cd x@y.ch')).toBe(`${EMAIL} ${EMAIL}`);
    expect(redact('Kontakt john@x.ch')).not.toContain('john');
  });

  it('text outside the replaced spans is byte-identical, whitespace and punctuation included', () => {
    const input = `  x${cp(0x09)}(a@b.cd)${cp(0x0a)}${cp(0x0a)}..;`.trim();
    expect(redact(input)).toBe(`x${cp(0x09)}(${EMAIL})${cp(0x0a)}${cp(0x0a)}..;`);
  });
});

describe('external reference: INERT WITHOUT INPUT SOURCE (D-092 / D-093 RULING E)', () => {
  it.each(['Pat.-Nr. 1234567', 'Ref: AX-2026-000123', 'Fall-ID 98765/2026', 'P-K7M2QX4TB9'])(
    'reference-like text without an active-class match stays unchanged: %s',
    (input) => {
      expect(redact(input)).toBe(input);
    },
  );

  it('reference-like text is redacted only through an active grammar (here EMAIL)', () => {
    expect(redact('Ref: pat123@clinic.ch')).toBe(`Ref: ${EMAIL}`);
  });
});

describe('insurance / card / VeKa is not a v1 class (D-070 RULING 4)', () => {
  it.each([
    'Versichertenkarte 80756012345678901234',
    'VeKa-Nr. 80756012345678901234',
    'Kartennummer 8075601234567890123',
    'Versicherten-Nr. 123.456.789',
  ])('%s stays unchanged', (input) => {
    expect(redact(input)).toBe(input);
  });
});

describe('clinical non-redaction (08 §12.15.2, all =)', () => {
  it.each([
    '12.03.2026',
    '2026-03-12',
    'Metformin 500 mg 1-0-1',
    '0.5 mg/kg',
    `i.v. 2x t${A_UMLAUT}glich`,
    'Hb 135 g/l',
    'CRP 12.4 mg/l',
    'eGFR 78 ml/min/1.73m2',
    'INR 2.3 am 12.03.2026 um 07:45',
    'E11.9',
    'J45.909',
    'AA.00.0010',
    '00.0010',
    'BD 120/80 mmHg',
    "1'250 ml",
    'GTIN 7680123456789',
    'Ch.-B. 7561234',
    `Tel. R${U_UMLAUT}cksprache erfolgt`,
    `Fax-Ger${A_UMLAUT}t`,
  ])('%s', (input) => {
    expect(redact(input)).toBe(input);
  });

  it('a whole clinical note keeps every clinical value and loses only the five classes', () => {
    const input = [
      'Befund 12.03.2026: Hb 135 g/l, CRP 12.4 mg/l, BD 120/80 mmHg.',
      `Metformin 500 mg 1-0-1, i.v. 2x t${A_UMLAUT}glich.`,
      'Kontakt: a@b.cd, Tel 079 123 45 67, AHV 756.1234.5678.97.',
    ].join(cp(0x0a));
    const expected = [
      'Befund 12.03.2026: Hb 135 g/l, CRP 12.4 mg/l, BD 120/80 mmHg.',
      `Metformin 500 mg 1-0-1, i.v. 2x t${A_UMLAUT}glich.`,
      `Kontakt: ${EMAIL}, Tel ${PHONE}, AHV ${AHV}.`,
    ].join(cp(0x0a));
    expect(redact(input)).toBe(expected);
  });
});

describe('zero matches (D-093 RULING C.5)', () => {
  it('COMPLETED with redactedText identical to the input', () => {
    const input = `Keine Treffer.${cp(0x0a)}${cp(0x09)}Zweite Zeile ${U_UMLAUT}`;
    expect(applyRedactionRuleset(input)).toEqual({
      status: 'COMPLETED',
      rulesetVersion: 'phase5-basic-v1',
      redactedText: input,
    });
  });
});

describe('output bound: REDACTED_OUTPUT_TOO_LARGE (08 §12.15.2; D-093 RULING D)', () => {
  it('a@b.cd⟨U+0020⟩x×262127 (262134 B) -> COMPLETED, output exactly 262144 B', () => {
    const input = `a@b.cd ${'x'.repeat(262127)}`;
    expect(utf8(input)).toBe(262134);
    const output = redact(input);
    expect(output).toBe(`${EMAIL} ${'x'.repeat(262127)}`);
    expect(utf8(output)).toBe(262144);
  });

  it('a@b.cd⟨U+0020⟩x×262137 (262144 B) -> FAILED, no redactedText', () => {
    const input = `a@b.cd ${'x'.repeat(262137)}`;
    expect(utf8(input)).toBe(262144);
    const result = applyRedactionRuleset(input);
    expect(result).toEqual({
      status: 'FAILED',
      rulesetVersion: 'phase5-basic-v1',
      failureCode: 'REDACTED_OUTPUT_TOO_LARGE',
    });
    expect(applyRedactionRuleset(input)).toEqual(result);
    expect(JSON.stringify(result)).not.toContain('xxx');
    expect(JSON.stringify(result)).not.toContain('REDACTED:');
  });

  it('37449 × a@b.cd separated by U+0020 -> FAILED', () => {
    const input = Array.from({ length: 37449 }, () => 'a@b.cd').join(' ');
    expect(utf8(input)).toBe(262142);
    expect(applyRedactionRuleset(input)).toEqual({
      status: 'FAILED',
      rulesetVersion: 'phase5-basic-v1',
      failureCode: 'REDACTED_OUTPUT_TOO_LARGE',
    });
  });

  it('IBAN never expands: an input full of IBANs shrinks and completes', () => {
    const input = Array.from({ length: 11915 }, () => 'CH0900700123456789012').join(' ');
    expect(utf8(input)).toBe(262129);
    const output = redact(input);
    expect(output).toBe(Array.from({ length: 11915 }, () => IBAN).join(' '));
    expect(utf8(output)).toBe(11915 * 15 + 11914);
  });

  it('the expected FAILED is a result, not an exception; a precondition breach is an exception', () => {
    expect(() => applyRedactionRuleset(`a@b.cd ${'x'.repeat(262137)}`)).not.toThrow();
    expect(() => applyRedactionRuleset('')).toThrow(RedactionPreconditionBreachError);
  });
});

describe('adversarial / long input (08 §12.15.2; each completes linearly with an explicit output)', () => {
  /** [name, input, expected output ('=' means identical), expected input UTF-8 bytes]. */
  const vectors: readonly (readonly [string, () => string, (input: string) => string, number])[] = [
    ['a×262144', () => 'a'.repeat(262144), (input) => input, 262144],
    ['(a.)×131072', () => repeat('a.', 131072), (input) => input, 262144],
    ['1×262144', () => '1'.repeat(262144), (input) => input, 262144],
    ['www.(a.)×131070', () => `www.${repeat('a.', 131070)}`, (input) => input, 262144],
    ['https://a×262136', () => `https://${'a'.repeat(262136)}`, (input) => input, 262144],
    ['a@(b.)×131071', () => `a@${repeat('b.', 131071)}`, (input) => input, 262144],
    ['(Tel⟨U+0020⟩)×65535⧺Tel', () => `${repeat('Tel ', 65535)}Tel`, (input) => input, 262143],
    ['(a-)×131072', () => repeat('a-', 131072), (input) => input, 262144],
    [
      'https://x.ch/)×262000',
      () => `https://x.ch/${')'.repeat(262000)}`,
      () => `${URL}${')'.repeat(262000)}`,
      262013,
    ],
    [
      '!×262126⧺⟨U+0020⟩⧺a@b.ch',
      () => `${'!'.repeat(262126)} a@b.ch`,
      () => `${'!'.repeat(262126)} ${EMAIL}`,
      262133,
    ],
    ['(https://x.ch:)×20000', () => repeat('https://x.ch:', 20000), (input) => input, 260000],
    ['(https://x.ch./)×18724', () => repeat('https://x.ch./', 18724), (input) => input, 262136],
    ['(https://x.ch~)×18724', () => repeat('https://x.ch~', 18724), (input) => input, 243412],
    [
      "(www.a.ch')×14563⧺!×131000",
      () => `${repeat("www.a.ch'", 14563)}${'!'.repeat(131000)}`,
      () => `${repeat("www.a.ch'", 14562)}${URL}'${'!'.repeat(131000)}`,
      262067,
    ],
  ];

  it.each(vectors)('%s', (_name, build, expected, bytes) => {
    const input = build();
    expect(utf8(input)).toBe(bytes);
    const output = redact(input);
    expect(output).toBe(expected(input));
    expect(utf8(output)).toBeLessThanOrEqual(262144);
  });

  it('the PHONE and EMAIL linearity vectors have the exact sizes 08 states', () => {
    expect(utf8(`${repeat('Tel ', 65535)}Tel`)).toBe(262143);
    expect(utf8(`${'!'.repeat(262126)} ${EMAIL}`)).toBe(262143);
  });
});

describe('determinism and purity (D-093 RULING C.8)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the same input yields an identical result on every run', () => {
    const input =
      'a@b.cd https://example.ch/x 756.1234.5678.97 CH0900700123456789012 +41791234567 Tel 0791234567';
    const expected = `${EMAIL} ${URL} ${AHV} ${IBAN} ${PHONE} Tel ${PHONE}`;
    const results = Array.from({ length: 5 }, () => applyRedactionRuleset(input));
    for (const result of results) {
      expect(result).toEqual({
        status: 'COMPLETED',
        rulesetVersion: 'phase5-basic-v1',
        redactedText: expected,
      });
    }
  });

  it('interleaved calls do not influence each other (no shared regex state)', () => {
    expect(redact('a@b.cd')).toBe(EMAIL);
    expect(redact('Tel 0791234567')).toBe(`Tel ${PHONE}`);
    expect(redact('x a@b.cd')).toBe(`x ${EMAIL}`);
    expect(redact('a@b.cd')).toBe(EMAIL);
  });

  it('nothing is logged or written while redacting', () => {
    const spies = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'debug'),
      vi.spyOn(console, 'trace'),
      vi.spyOn(process.stdout, 'write'),
      vi.spyOn(process.stderr, 'write'),
    ];
    applyRedactionRuleset('a@b.cd https://example.ch 756.1234.5678.97 Tel 0791234567');
    applyRedactionRuleset(`a@b.cd ${'x'.repeat(262137)}`);
    expect(() => applyRedactionRuleset('')).toThrow(RedactionPreconditionBreachError);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
