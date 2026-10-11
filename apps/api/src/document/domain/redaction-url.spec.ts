import { describe, expect, it } from 'vitest';

import { NA_CLASS_BODY } from './redaction-boundary.js';
import { REDACTION_RULESET_VERSION, applyRedactionRuleset } from './redaction-ruleset.js';
import { DNS_HOST_MAX_LENGTH, findUrlCandidates, measureUrlScanSteps } from './redaction-url.js';

/**
 * `P5-I6A` — the `URL` class (D-093 `RULING F.2`, `G-1`, `G-2`, `RULING H.1` N-2; `08` §12.15.2).
 *
 * Every vector states its exact expected output. Non-ASCII characters are built from code points.
 * The linearity evidence is a deterministic LOGICAL step count, never elapsed time (`08` §12.15,
 * D-093 `RULING I`).
 */

const cp = (...codePoints: number[]): string => String.fromCodePoint(...codePoints);
const utf8 = (value: string): number => Buffer.byteLength(value, 'utf8');

const URL = '[REDACTED:URL]';
const EMAIL = '[REDACTED:EMAIL]';
const PHONE = '[REDACTED:PHONE]';

const U_UMLAUT = cp(0x00fc);
const E_ACUTE = cp(0x00e9);
const RIGHT_GUILLEMET = cp(0x00bb);
const LONG_S = cp(0x017f);

/** A 253-character DNS name and its 254-character twin (`08` §12.15.2 `G-2`). */
const H253 = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.ch`;
const H254 = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(59)}.ch`;
/** `www.`-form hosts of exactly 253 and 254 characters, the leading `www` label included. */
const WWW253 = `www.${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(54)}.ch`;
const WWW254 = `www.${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(55)}.ch`;

/** Runs the engine twice and returns the redacted text of the (identical) COMPLETED results. */
function redact(input: string): string {
  const first = applyRedactionRuleset(input);
  const second = applyRedactionRuleset(input);
  expect(second).toEqual(first);
  expect(first.status).toBe('COMPLETED');
  if (first.status !== 'COMPLETED') {
    throw new Error('expected COMPLETED');
  }
  expect(first.rulesetVersion).toBe(REDACTION_RULESET_VERSION);
  return first.redactedText;
}

describe('URL — positive and punctuation (08 §12.15.2)', () => {
  it.each([
    ['https://example.ch', URL],
    ['http://example.ch/path?a=1&b=2#frag', URL],
    ['HTTPS://WWW.EXAMPLE.CH/A', URL],
    ['www.example.ch', URL],
    ['https://user:pw@example.ch/a', URL],
    ['http://localhost:3000/x', URL],
    ['http://192.168.1.1/x', URL],
    [`https://example.ch/Bericht_M${U_UMLAUT}ller.pdf`, URL],
    ['www.example.ch/bericht.pdf.', `${URL}.`],
    ['Siehe https://example.ch/a_(b)).', `Siehe ${URL}).`],
    ['(https://example.ch/x)', `(${URL})`],
    ['[https://example.ch/a]', `[${URL}]`],
    ['https://example.ch:8443/a,', `${URL},`],
    ["'www.example.ch'", `'${URL}'`],
    ['https://example.ch/?q=x!?', `${URL}!?`],
    [`https://example.ch/a${RIGHT_GUILLEMET}`, `${URL}${RIGHT_GUILLEMET}`],
    ['https://example.ch/a/', URL],
    ['hTtP://Example.CH', URL],
    ['WwW.example.ch', URL],
    ['http://LOCALHOST', URL],
    ['https://255.255.255.255', URL],
    ['https://001.002.003.004/x', URL],
    ['https://1.2.3.ch', URL],
    ['https://example.ch:1', URL],
    ['https://example.ch:65535/x', URL],
    ['www.example.ch:8080', URL],
  ])('%s -> %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });
});

describe('URL — negative (08 §12.15.2, all =)', () => {
  it.each([
    'http://999.1.1.1/x',
    'http:/example.ch',
    'http//example.ch',
    'htps://example.ch',
    'hxxp://example.ch',
    'https://intranet/x',
    'wwww.example.ch',
    'www.example',
    'www-Seite',
    'foo.www.example.ch',
    `https://m${U_UMLAUT}ller.ch`,
    'xhttps://example.ch',
    'https://example.c',
    'https:// example.ch',
    `http${LONG_S}://example.ch`,
    'http://[::1]/x',
    'https://localhostx',
    'www.localhost',
    'http://1.2.3.4.5/x',
    'ftp://example.ch',
    'www.192.168.1.1',
    'https://256.1.1.1',
    'https://1.2.3/x',
    'https://example.ch:123456',
    'https://@example.ch',
    'https://a@b@example.ch',
    '_www.example.ch',
    '-www.example.ch',
    ':www.example.ch',
    '/www.example.ch',
    '@www.example.ch',
    '.www.example.ch',
  ])('%s', (input) => {
    expect(redact(input)).toBe(input);
  });
});

describe('G-1 — obligatory (08 §12.15.2, all =)', () => {
  it.each([
    'https://example.ch:99999999/x',
    'https://example.ch:80abc',
    'https://example.ch:',
    'https://user.ch:pw@-x/',
  ])('%s', (input) => {
    expect(redact(input)).toBe(input);
  });
});

describe('G-1 — maximal envelope + full consumption, no valid-prefix fallback (OBLIGATORY)', () => {
  /** [input, the shorter prefix that WOULD be a valid URL on its own]. */
  it.each([
    ['https://example.ch./x', 'https://example.ch'],
    ['https://example.ch.:8443/admin', 'https://example.ch'],
    ['https://example.ch:8443./x', 'https://example.ch:8443'],
    ['www.example.ch.:8443/x', 'www.example.ch'],
    ['https://example.ch%2F/secret', 'https://example.ch'],
    ['https://example.ch~admin/x', 'https://example.ch'],
    ['https://example.ch*admin/x', 'https://example.ch'],
    ['https://example.ch=1/x', 'https://example.ch'],
    ['https://example.ch$x/y', 'https://example.ch'],
    ['https://example.ch&a=1', 'https://example.ch'],
    ['www.example.ch*x', 'www.example.ch'],
    ['https://example.ch,x', 'https://example.ch'],
    ['https://example.ch(x)', 'https://example.ch'],
    ['Siehe www.example.ch: Termin', 'www.example.ch'],
  ])('%s is rejected WHOLE although %s alone is valid', (input, validPrefix) => {
    expect(redact(validPrefix)).toBe(URL);
    expect(findUrlCandidates(input)).toEqual([]);
    expect(redact(input)).toBe(input);
  });
});

describe('G-1 — rejection is not a finite one-character patch (OBLIGATORY, generative)', () => {
  const inserted = [..."-._~:@!$&'()*+,;=%[]", E_ACUTE];

  it('covers exactly the URL_ENV_CHAR punctuation outside [A-Za-z0-9] and / ? #, plus U+00E9', () => {
    // `- . _ ~ : @ ! $ & ' ( ) * + , ; = % [ ]` (20) and U+00E9.
    expect(inserted).toHaveLength(21);
    expect(new Set(inserted).size).toBe(21);
  });

  it.each(inserted)('c = %j: all three shapes stay unchanged', (character) => {
    for (const input of [
      `https://example.ch${character}x/y`,
      `https://example.ch${character}x`,
      `www.example.ch${character}x/y`,
    ]) {
      expect(findUrlCandidates(input)).toEqual([]);
      expect(redact(input)).toBe(input);
    }
  });
});

describe('URL — trailing punctuation stays outside the URL (OBLIGATORY)', () => {
  it.each([
    ['https://example.ch.', `${URL}.`],
    ['https://example.ch, siehe oben', `${URL}, siehe oben`],
    ['(https://example.ch)', `(${URL})`],
    ['[www.example.ch]', `[${URL}]`],
    ['www.example.ch!', `${URL}!`],
    ["'https://example.ch';", `'${URL}';`],
    ['https://example.ch:8443.', `${URL}.`],
    ['https://example.ch?', `${URL}?`],
    ['https://example.ch/a.', `${URL}.`],
    ['https://example.ch/a/;', `${URL};`],
    ['https://example.ch/a_(b).', `${URL}.`],
    ['https://example.ch/x:', `${URL}:`],
    ['https://example.ch/a[b]].', `${URL}].`],
    ['https://example.ch/((a)))', `${URL})`],
  ])('%s -> %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it('contrast: a trailing dot is outside the URL, but a dot followed by more is a malformed continuation', () => {
    expect(redact('https://example.ch.')).toBe(`${URL}.`);
    expect(redact('https://example.ch./x')).toBe('https://example.ch./x');
  });

  it('without a tail, ":" is a started port component and is never trimmed', () => {
    expect(redact('https://example.ch:')).toBe('https://example.ch:');
    expect(redact('https://example.ch/x:')).toBe(`${URL}:`);
  });

  it('the recognition span is the maximal envelope; the replacement span is the trimmed URL', () => {
    const input = 'Siehe https://example.ch/a_(b)).';
    expect(findUrlCandidates(input)).toEqual([
      {
        redactionClass: 'URL',
        recognitionStart: 6,
        recognitionEnd: input.length,
        replaceStart: 6,
        replaceEnd: input.length - 2,
      },
    ]);
  });
});

describe('G-2 — DNS_HOST_MAX_LENGTH = 253 (OBLIGATORY)', () => {
  it('the frozen limit is 253 and the fixtures are 253 / 254 characters', () => {
    expect(DNS_HOST_MAX_LENGTH).toBe(253);
    expect(H253).toHaveLength(253);
    expect(H254).toHaveLength(254);
    expect(WWW253).toHaveLength(253);
    expect(WWW254).toHaveLength(254);
  });

  it.each([
    [`https://${H253}/x`, URL],
    [`https://${H254}/x`, `https://${H254}/x`],
    [WWW253, URL],
    [WWW254, WWW254],
    [`a@${H253}`, EMAIL],
    [`a@${H254}`, `a@${H254}`],
  ])('vector %#', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });
});

describe('N-2 — a rejected URL creates no opaque zone (OBLIGATORY)', () => {
  it.each([
    ['https://user:pw@example.ch:999999/x', `https://user:${EMAIL}:999999/x`],
    ['https://example.ch./?tel=+41791234567', `https://example.ch./?tel=${PHONE}`],
    ['https://bad_host.ch/?u=www.example.ch', `https://bad_host.ch/?u=${URL}`],
  ])('%s -> %s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it('the outer URL candidate itself is NO MATCH in each N-2 vector', () => {
    expect(findUrlCandidates('https://user:pw@example.ch:999999/x')).toEqual([]);
    expect(findUrlCandidates('https://example.ch./?tel=+41791234567')).toEqual([]);
    expect(findUrlCandidates('https://bad_host.ch/?u=www.example.ch')).toEqual([
      {
        redactionClass: 'URL',
        recognitionStart: 23,
        recognitionEnd: 37,
        replaceStart: 23,
        replaceEnd: 37,
      },
    ]);
  });
});

describe('URL — resumption (D-093 RULING F.2)', () => {
  it('after an ACCEPTED candidate the scan resumes at the end of the untrimmed envelope', () => {
    const input = 'https://a.ch/x,www.b.ch';
    expect(findUrlCandidates(input)).toEqual([
      {
        redactionClass: 'URL',
        recognitionStart: 0,
        recognitionEnd: input.length,
        replaceStart: 0,
        replaceEnd: input.length,
      },
    ]);
    expect(redact(input)).toBe(URL);
  });

  it('after a REJECTED candidate a separately valid nested starter is still discovered', () => {
    expect(redact('https://x_y.ch/(https://example.ch)')).toBe(`https://x_y.ch/(${URL})`);
  });

  it('a nested starter blocked by its own left boundary is not discovered', () => {
    expect(redact('https://x_y.ch/xhttps://example.ch')).toBe('https://x_y.ch/xhttps://example.ch');
  });

  it('two separate URLs are both redacted', () => {
    expect(redact('https://a.ch und www.b.ch')).toBe(`${URL} und ${URL}`);
  });
});

/**
 * An independent reference for the frozen semantics, used only to cross-check the scanner: the
 * LITERAL `URL_FULL` regex of D-093 `RULING F.2` plus its post-validation, and the frozen trim
 * as the plain right-to-left walk.
 */
const LBL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const DNS = String.raw`(?:${LBL}\.)+[A-Za-z]{2,63}`;
const URL_FULL = new RegExp(
  String.raw`^(?:[Hh][Tt][Tt][Pp][Ss]?:\/\/(?:[A-Za-z0-9\-._~%!$&'()*+,;=:]+@)?(?:(${DNS})|([0-9]{1,3}(?:\.[0-9]{1,3}){3})|[Ll][Oo][Cc][Aa][Ll][Hh][Oo][Ss][Tt])|([Ww]{3}\.${DNS}))(?::[0-9]{1,5})?(?:[\/?#][A-Za-z0-9\-._~:\/?#\[\]@!$&'()*+,;=%${NA_CLASS_BODY}]*)?$`,
  'gu',
);

function referenceAccepts(candidate: string): boolean {
  URL_FULL.lastIndex = 0;
  const match = URL_FULL.exec(candidate);
  if (match === null) {
    return false;
  }
  const [, schemeDns, ipv4, wwwHost] = match;
  if (schemeDns !== undefined && schemeDns.length > 253) {
    return false;
  }
  if (wwwHost !== undefined && wwwHost.length > 253) {
    return false;
  }
  if (ipv4 !== undefined && ipv4.split('.').some((octet) => Number(octet) > 255)) {
    return false;
  }
  return true;
}

function referenceTrim(text: string, floor: number, end: number, hasTail: boolean): number {
  const punctuation = new Set(hasTail ? [...".,;:!?'"] : [...".,;!'"]);
  let openParens = 0;
  let closeParens = 0;
  let openBrackets = 0;
  let closeBrackets = 0;
  for (const character of text.slice(floor, end)) {
    if (character === '(') openParens += 1;
    if (character === ')') closeParens += 1;
    if (character === '[') openBrackets += 1;
    if (character === ']') closeBrackets += 1;
  }
  let e = end;
  while (e > floor) {
    const character = text.charAt(e - 1);
    if (punctuation.has(character)) {
      e -= 1;
    } else if (character === ')' && closeParens > openParens) {
      closeParens -= 1;
      e -= 1;
    } else if (character === ']' && closeBrackets > openBrackets) {
      closeBrackets -= 1;
      e -= 1;
    } else {
      break;
    }
  }
  return e;
}

/** The reference replacement end for a starter at 0 of an all-envelope `text`, or null. */
function referenceCandidateEnd(text: string, authorityStart: number): number | null {
  let tailStart = -1;
  for (let index = authorityStart; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (character === '/' || character === '?' || character === '#') {
      tailStart = index;
      break;
    }
  }
  const hasTail = tailStart >= 0;
  const e = referenceTrim(text, hasTail ? tailStart : authorityStart, text.length, hasTail);
  return referenceAccepts(text.slice(0, e)) ? e : null;
}

describe('URL — differential cross-check against the literal URL_FULL reference', () => {
  const alphabet = [..."ab.-:@19/?#()[]_~!',;%=", E_ACUTE];
  const bases = ['', 'ex.ch', 'u:p@ex.ch', '1.2.3.4', '999.1.1.1', 'localhost', 'ex.ch:80', 'ex'];
  const starters: readonly (readonly [string, number])[] = [
    ['https://', 8],
    ['http://', 7],
    ['www.', 0],
  ];

  function* suffixes(maxLength: number): Generator<string> {
    yield '';
    let current = [''];
    for (let length = 1; length <= maxLength; length += 1) {
      const next: string[] = [];
      for (const prefix of current) {
        for (const character of alphabet) {
          next.push(prefix + character);
        }
      }
      yield* next;
      current = next;
    }
  }

  it('agrees on acceptance and on the replacement end for every generated candidate', () => {
    let compared = 0;
    let accepted = 0;
    const disagreements: string[] = [];

    for (const [starter, authorityLength] of starters) {
      for (const base of bases) {
        for (const suffix of suffixes(base === 'ex.ch' ? 3 : 2)) {
          const text = starter + base + suffix;
          const expectedEnd = referenceCandidateEnd(text, authorityLength);
          const atStart = findUrlCandidates(text).find((candidate) => candidate.replaceStart === 0);
          const actualEnd = atStart === undefined ? null : atStart.replaceEnd;
          compared += 1;
          if (expectedEnd !== null) {
            accepted += 1;
          }
          if (actualEnd !== expectedEnd) {
            disagreements.push(text);
          }
        }
      }
    }

    expect(disagreements).toEqual([]);
    expect(compared).toBeGreaterThan(40000);
    expect(accepted).toBeGreaterThan(1000);
  });
});

/** `(group)×count` — NB-2: the grouped content repeated `count` times, built programmatically. */
const repeat = (group: string, count: number): string => group.repeat(count);

describe('URL — linearity of the WHOLE pass (deterministic logical step count, no wall clock)', () => {
  /**
   * Upper bound on logical steps per input code unit: one starter-scan visit and eleven table
   * cells per position, plus one per evaluated starter and at most `DNS_HOST_MAX_LENGTH + 6`
   * host/port characters per starter — which the vectors below show is never approached per
   * position, because starters are at least four code units apart.
   */
  const STEPS_PER_UNIT_BOUND = 16;

  const adversarial: readonly (readonly [string, string, string, number])[] = [
    ['www.(a.)×131070', `www.${repeat('a.', 131070)}`, '=', 262144],
    ['https://a×262136', `https://${'a'.repeat(262136)}`, '=', 262144],
    [
      'https://x.ch/)×262000',
      `https://x.ch/${')'.repeat(262000)}`,
      `${URL}${')'.repeat(262000)}`,
      262013,
    ],
    ['(https://x.ch:)×20000', repeat('https://x.ch:', 20000), '=', 260000],
    ['(https://x.ch./)×18724', repeat('https://x.ch./', 18724), '=', 262136],
    ['(https://x.ch~)×18724', repeat('https://x.ch~', 18724), '=', 243412],
    [
      "(www.a.ch')×14563⧺!×131000",
      `${repeat("www.a.ch'", 14563)}${'!'.repeat(131000)}`,
      `${repeat("www.a.ch'", 14562)}${URL}'${'!'.repeat(131000)}`,
      262067,
    ],
  ];

  it.each(adversarial)(
    '%s: exact output, input size and bounded steps',
    (_name, input, expected, bytes) => {
      expect(utf8(input)).toBe(bytes);
      expect(redact(input)).toBe(expected === '=' ? input : expected);

      const steps = measureUrlScanSteps(input);
      expect(steps).toBe(measureUrlScanSteps(input));
      expect(steps).toBeLessThanOrEqual(STEPS_PER_UNIT_BOUND * (input.length + 1));
    },
  );

  /** Steps for size `k` and `2k` of a family; linear work doubles, quadratic quadruples. */
  function doublingRatio(build: (k: number) => string, k: number): number {
    return measureUrlScanSteps(build(2 * k)) / measureUrlScanSteps(build(k));
  }

  it.each([
    [
      'many www starters sharing one envelope and one punctuation suffix',
      (k: number) => `${repeat("www.a.ch'", k)}${'!'.repeat(9 * k)}`,
    ],
    ['many scheme starters sharing one envelope', (k: number) => repeat('https://x.ch:', k)],
    [
      'many scheme starters sharing one long excess-closer suffix',
      (k: number) => `${repeat("https://a_.ch/'", k)}${')'.repeat(10 * k)}`,
    ],
    [
      'many www starters sharing one long excess-bracket suffix',
      (k: number) => `${repeat('www.a.ch,', k)}${']'.repeat(10 * k)}`,
    ],
    ['one starter, a very long tail', (k: number) => `https://a.ch/${'b'.repeat(10 * k)}`],
  ])('%s: doubling the input at most doubles the work', (_name, build) => {
    const ratio = doublingRatio(build, 8000);
    expect(ratio).toBeGreaterThan(1.9);
    expect(ratio).toBeLessThan(2.1);
  });

  it('shared-suffix work is nowhere near starters × suffix (no per-starter rescanning)', () => {
    const starters = 14563;
    const suffix = 131000;
    const input = `${repeat("www.a.ch'", starters)}${'!'.repeat(suffix)}`;
    const steps = measureUrlScanSteps(input);
    expect(steps).toBeLessThan((starters * suffix) / 100);
    expect(steps).toBeLessThanOrEqual(STEPS_PER_UNIT_BOUND * (input.length + 1));
  });

  it('input without any starter costs exactly one visit per code unit', () => {
    expect(measureUrlScanSteps('a'.repeat(1000))).toBe(1000);
  });
});
