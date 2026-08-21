// lkw.test.js — unit tests for assets/spec-logic/lkw.js (T-26).
// Runner: node:test (ADR-0008). Run via: node --test assets/spec-logic/*.test.js
//
// Coverage: all 9 resolveLkw() rules (RULE 0-8), the spec-correct priority
// ordering (RULE 1 MD-unknown short-circuits before RULE 3 CSF), date-fallback
// logic, the episodes rationale notes, and the RULE 4 escLabel() escaping of the
// raw rnLkwT embed (the lkw analog of the sep1 T-25 fix). Cases mirror the
// parity battery used to verify the extraction was behavior-neutral.

const test = require('node:test');
const assert = require('node:assert');
const { resolveLkw, escLabel, ht, hd } = require('./lkw.js');

// Full input object with all fields blank; override per case.
function inp(o){
  return Object.assign({
    inhouse:false, justprior:false, episodes:false, mdUnk:null,
    mdSxD:'', mdSxT:'', mdLkwD:'', mdLkwT:'',
    rnSxD:'', rnSxT:'', rnLkwD:'', rnLkwT:'', csfD:'', csfT:''
  }, o);
}

test('module export surface', (t) => {
  assert.strictEqual(typeof resolveLkw, 'function', 'resolveLkw is a function');
  assert.strictEqual(typeof escLabel, 'function', 'escLabel is a function');
  assert.strictEqual(typeof ht, 'function', 'ht is a function');
  assert.strictEqual(typeof hd, 'function', 'hd is a function');
  const r = resolveLkw(inp({csfT:'10:00'}));
  for (const k of ['yn','date','time','rule','rationale']) {
    assert.ok(k in r, `result has ${k}`);
  }
});

test('RULE 0 — in-house stroke returns NO/UTD/UTD', () => {
  const r = resolveLkw(inp({inhouse:true}));
  assert.strictEqual(r.yn, 'NO');
  assert.strictEqual(r.date, 'UTD');
  assert.strictEqual(r.time, 'UTD');
  assert.strictEqual(r.rule, 'In-House Stroke');
});

test('RULE 0 — in-house wins over MD-unknown, CSF, and MD-LKW', () => {
  // In-house is checked first; nothing else should be consulted.
  const r = resolveLkw(inp({inhouse:true, mdUnk:'yes', csfT:'10:00', mdLkwT:'09:00'}));
  assert.strictEqual(r.rule, 'In-House Stroke');
  assert.strictEqual(r.yn, 'NO');
});

test('RULE 1 — MD-documented-unknown returns NO/UTD/UTD', () => {
  const r = resolveLkw(inp({mdUnk:'yes'}));
  assert.strictEqual(r.yn, 'NO');
  assert.strictEqual(r.date, 'UTD');
  assert.strictEqual(r.time, 'UTD');
  assert.match(r.rule, /Unknown \(Priority 1\)/);
});

test('RULE 1 — MD-unknown overrides a present CSF time (spec-correct precedence)', () => {
  // Locks the ordering: MD-documented-unknown beats a Code Stroke Form time.
  // This is spec-correct per TJC STK LKW, not a bug — see lkw.js header.
  const r = resolveLkw(inp({mdUnk:'yes', csfT:'10:00', csfD:'01-01-2026'}));
  assert.strictEqual(r.yn, 'NO');
  assert.match(r.rule, /Unknown \(Priority 1\)/);
});

test('RULE 2 — just-prior-to-arrival returns YES with arrival placeholders', () => {
  const r = resolveLkw(inp({justprior:true}));
  assert.strictEqual(r.yn, 'YES');
  assert.strictEqual(r.date, '[Arrival Date]');
  assert.strictEqual(r.time, '[Arrival Time]');
  assert.match(r.rule, /Just Prior to Arrival/);
});

test('RULE 2 — just-prior beats a present CSF time', () => {
  const r = resolveLkw(inp({justprior:true, csfT:'10:00'}));
  assert.match(r.rule, /Just Prior to Arrival/);
});

test('RULE 3 — CSF time only, no CSF date, uses date placeholder', () => {
  const r = resolveLkw(inp({csfT:'10:15'}));
  assert.strictEqual(r.yn, 'YES');
  assert.strictEqual(r.time, '10:15');
  assert.strictEqual(r.date, '[from CSF or associated documentation]');
  assert.match(r.rule, /Code Stroke Form/);
});

test('RULE 3 — CSF with a valid date uses that date', () => {
  const r = resolveLkw(inp({csfT:'10:15', csfD:'01-02-2026'}));
  assert.strictEqual(r.date, '01-02-2026');
  assert.strictEqual(r.time, '10:15');
});

test('RULE 3 — episodes flag appends the multiple-episodes note', () => {
  const r = resolveLkw(inp({csfT:'10:15', episodes:true}));
  assert.match(r.rationale, /Multiple episodes flag set/);
});

test('RULE 3 — CSF beats MD-LKW (Priority 2 over Priority 3)', () => {
  const r = resolveLkw(inp({csfT:'10:15', mdLkwT:'09:00'}));
  assert.match(r.rule, /Code Stroke Form/);
  assert.strictEqual(r.time, '10:15');
});

test('RULE 4 — MD-LKW time with its own date', () => {
  const r = resolveLkw(inp({mdLkwT:'08:30', mdLkwD:'01-03-2026'}));
  assert.strictEqual(r.yn, 'YES');
  assert.strictEqual(r.time, '08:30');
  assert.strictEqual(r.date, '01-03-2026');
  assert.match(r.rule, /MD .* LKW\/Normal/);
});

test('RULE 4 — MD-LKW with no MD date falls back to RN date', () => {
  const r = resolveLkw(inp({mdLkwT:'08:30', rnLkwD:'01-03-2026'}));
  assert.strictEqual(r.date, '01-03-2026');
});

test('RULE 4 — MD-LKW with no date at all uses confirm-date placeholder', () => {
  const r = resolveLkw(inp({mdLkwT:'08:30'}));
  assert.strictEqual(r.date, '[confirm date]');
});

test('RULE 4 — differing RN time appends the MULTIPLE TIMES note', () => {
  const r = resolveLkw(inp({mdLkwT:'08:30', rnLkwT:'07:45'}));
  assert.match(r.rationale, /MULTIPLE TIMES/);
  assert.match(r.rationale, /07:45/);
});

test('RULE 4 — identical RN time does NOT append the note', () => {
  const r = resolveLkw(inp({mdLkwT:'08:30', rnLkwT:'08:30'}));
  assert.doesNotMatch(r.rationale, /MULTIPLE TIMES/);
});

test('RULE 4 — rnLkwT is HTML-escaped in the rationale (escLabel fix)', () => {
  // The raw rnLkwT embed was unescaped in the pre-extraction inline logic
  // (XSS-class, same as the sep1 T-25 finding). It is now escaped via escLabel.
  const r = resolveLkw(inp({mdLkwT:'08:30', rnLkwT:'<img src=x onerror=alert(1)>'}));
  assert.match(r.rationale, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(r.rationale, /<img src=x/);
});

test('RULE 4 — single quote in rnLkwT is escaped to &#39;', () => {
  // Locks the 5th entity specifically (the one a naive 4-entity escape misses).
  const r = resolveLkw(inp({mdLkwT:'08:30', rnLkwT:"O'Brien"}));
  assert.match(r.rationale, /O&#39;Brien/);
});

test('RULE 5 — RN-LKW only (no MD LKW), with date', () => {
  const r = resolveLkw(inp({rnLkwT:'06:00', rnLkwD:'01-04-2026'}));
  assert.strictEqual(r.yn, 'YES');
  assert.strictEqual(r.time, '06:00');
  assert.strictEqual(r.date, '01-04-2026');
  assert.match(r.rule, /RN .* LKW\/Normal/);
});

test('RULE 5 — RN-LKW with no date uses confirm-date placeholder', () => {
  const r = resolveLkw(inp({rnLkwT:'06:00'}));
  assert.strictEqual(r.date, '[confirm date]');
});

test('RULE 6 — MD S/Sx fallback', () => {
  const r = resolveLkw(inp({mdSxT:'05:00', mdSxD:'01-05-2026'}));
  assert.strictEqual(r.yn, 'YES');
  assert.strictEqual(r.time, '05:00');
  assert.match(r.rule, /MD .* S\/Sx Only/);
});

test('RULE 6 — episodes flag appends the resolution note', () => {
  const r = resolveLkw(inp({mdSxT:'05:00', episodes:true}));
  assert.match(r.rationale, /Multiple episodes with resolution/);
});

test('RULE 7 — RN S/Sx, lowest priority', () => {
  const r = resolveLkw(inp({rnSxT:'04:00', rnSxD:'01-06-2026'}));
  assert.strictEqual(r.yn, 'YES');
  assert.strictEqual(r.time, '04:00');
  assert.match(r.rule, /RN .* S\/Sx Only/);
});

test('RULE 8 — no documentation returns NO/UTD/UTD', () => {
  const r = resolveLkw(inp({}));
  assert.strictEqual(r.yn, 'NO');
  assert.strictEqual(r.date, 'UTD');
  assert.strictEqual(r.time, 'UTD');
  assert.strictEqual(r.rule, 'No Documentation Found');
});

test('priority — MD-LKW beats RN-LKW', () => {
  const r = resolveLkw(inp({mdLkwT:'08:00', rnLkwT:'07:00'}));
  assert.match(r.rule, /MD .* LKW\/Normal/);
  assert.strictEqual(r.time, '08:00');
});

test('priority — RN-LKW beats MD-S/Sx', () => {
  const r = resolveLkw(inp({rnLkwT:'07:00', mdSxT:'05:00'}));
  assert.match(r.rule, /RN .* LKW\/Normal/);
  assert.strictEqual(r.time, '07:00');
});

test('priority — MD-S/Sx beats RN-S/Sx', () => {
  const r = resolveLkw(inp({mdSxT:'05:00', rnSxT:'04:00'}));
  assert.match(r.rule, /MD .* S\/Sx Only/);
  assert.strictEqual(r.time, '05:00');
});

test('escLabel — escapes all 5 entities', () => {
  assert.strictEqual(escLabel('& < > " \''), '&amp; &lt; &gt; &quot; &#39;');
  assert.strictEqual(escLabel(null), '');
  assert.strictEqual(escLabel(undefined), '');
});
