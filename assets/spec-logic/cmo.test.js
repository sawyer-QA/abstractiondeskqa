/* cmo.test.js \u2014 node:test coverage for the CMO exclusion classifier spec logic.
 *
 * Companion to assets/spec-logic/cmo.js (T-26 tool 2 of 3). Mirrors the
 * structure of lkw.test.js: one describe block per priority branch, plus
 * ordering tests that lock the short-circuit hierarchy, plus a contract block.
 *
 * These tests lock CURRENT behavior. The T-26 KNOWN FINDING block that locked
 * #flag-prehosp at its dead-input behavior was removed by T-28, which wired the
 * flag up as a real LIP-accessibility gate; its replacement is the gate block
 * near the bottom of this file.
 */

const test = require('node:test');
const assert = require('node:assert');
const { toDocSet, toAccess, resolveCmo } = require('./cmo.js');

// Convenience: build an input with sane defaults.
function inp(docs, flags){
  return Object.assign({ docs: docs || [], prehosp:false, prehospAccess:'',
                         postbrain:false, conflict:false, withdrawn:false },
                       flags || {});
}

test.describe('toDocSet', () => {
  test('accepts an Array', () => {
    const s = toDocSet(['md_order']);
    assert.ok(s instanceof Set);
    assert.ok(s.has('md_order'));
  });
  test('passes a Set through unchanged', () => {
    const orig = new Set(['polst']);
    assert.strictEqual(toDocSet(orig), orig);
  });
  test('returns an empty Set for null/undefined', () => {
    assert.strictEqual(toDocSet(null).size, 0);
    assert.strictEqual(toDocSet(undefined).size, 0);
  });
});

test.describe('toAccess', () => {
  test('passes explicit yes/no through', () => {
    assert.strictEqual(toAccess('yes'), 'yes');
    assert.strictEqual(toAccess('no'), 'no');
  });
  test('trims and lowercases before matching', () => {
    assert.strictEqual(toAccess('  YES '), 'yes');
    assert.strictEqual(toAccess('No'), 'no');
  });
  test('treats non-strings and unexpected values as unanswered', () => {
    for (const v of [undefined, null, true, false, 0, 1, {}, [], 'maybe', '']) {
      assert.strictEqual(toAccess(v), '', 'expected unanswered for: ' + String(v));
    }
  });
});

test.describe('timing flags short-circuit before documentation', () => {
  test('withdrawn returns NO / CMO Rescinded even with an MD order present', () => {
    const r = resolveCmo(inp(['md_order'], {withdrawn:true}));
    assert.strictEqual(r.val, 'NO');
    assert.strictEqual(r.basis, 'CMO Rescinded');
  });
  test('post-brain-death returns NO even with an MD order present', () => {
    const r = resolveCmo(inp(['md_order'], {postbrain:true}));
    assert.strictEqual(r.val, 'NO');
    assert.strictEqual(r.basis, 'Post-Brain Death Only');
  });
  test('withdrawn outranks post-brain-death when both are set', () => {
    const r = resolveCmo(inp([], {withdrawn:true, postbrain:true}));
    assert.strictEqual(r.basis, 'CMO Rescinded');
  });
});

test.describe('conflicting documentation branch', () => {
  test('conflict with no LIP doc returns NO and asks for clinical review', () => {
    const r = resolveCmo(inp(['hospice'], {conflict:true}));
    assert.strictEqual(r.val, 'NO');
    assert.match(r.basis, /No Clear LIP CMO Plan/);
    assert.match(r.rationale, /requires clinical review/);
  });
  test('conflict does NOT fire when md_order is present', () => {
    const r = resolveCmo(inp(['md_order'], {conflict:true}));
    assert.strictEqual(r.val, 'YES');
  });
  test('conflict does NOT fire when md_note is present', () => {
    const r = resolveCmo(inp(['md_note'], {conflict:true}));
    assert.strictEqual(r.val, 'YES');
  });
});

test.describe('MD order (strongest basis)', () => {
  test('returns YES with the physician-order basis', () => {
    const r = resolveCmo(inp(['md_order']));
    assert.strictEqual(r.val, 'YES');
    assert.strictEqual(r.basis, 'Physician CMO Order');
    assert.match(r.rationale, /strongest possible basis/);
  });
  test('appends the FLAG paragraph when conflict is set', () => {
    const clean = resolveCmo(inp(['md_order']));
    const flagged = resolveCmo(inp(['md_order'], {conflict:true}));
    assert.ok(flagged.rationale.startsWith(clean.rationale));
    assert.match(flagged.rationale, /FLAG/);
    assert.match(flagged.rationale, /active plan at time of death\/discharge/);
  });
  test('outranks md_note when both are selected', () => {
    const r = resolveCmo(inp(['md_note','md_order']));
    assert.strictEqual(r.basis, 'Physician CMO Order');
  });
});

test.describe('MD note (goals-of-care decision)', () => {
  test('returns YES with the physician-documentation basis', () => {
    const r = resolveCmo(inp(['md_note']));
    assert.strictEqual(r.val, 'YES');
    assert.strictEqual(r.basis, 'Physician Documentation of CMO Decision');
  });
  test('rationale insists on a documented DECISION, not just a discussion', () => {
    const r = resolveCmo(inp(['md_note']));
    assert.match(r.rationale, /<em>decision<\/em>/);
    assert.match(r.rationale, /not merely that a discussion occurred/);
  });
  test('appends the FLAG paragraph when conflict is set', () => {
    const r = resolveCmo(inp(['md_note'], {conflict:true}));
    assert.match(r.rationale, /operative plan/);
  });
});

test.describe('REVIEW outcomes', () => {
  test('POLST returns REVIEW and demands section verification', () => {
    const r = resolveCmo(inp(['polst']));
    assert.strictEqual(r.val, 'REVIEW');
    assert.match(r.basis, /Verify Section/);
    assert.match(r.rationale, /ACTION REQUIRED/);
  });
  test('hospice returns REVIEW and is explicitly not sufficient alone', () => {
    const r = resolveCmo(inp(['hospice']));
    assert.strictEqual(r.val, 'REVIEW');
    assert.match(r.rationale, /not sufficient alone/);
  });
  test('md_note outranks polst', () => {
    const r = resolveCmo(inp(['polst','md_note']));
    assert.strictEqual(r.val, 'YES');
  });
  test('polst outranks hospice', () => {
    const r = resolveCmo(inp(['hospice','polst']));
    assert.match(r.basis, /POLST/);
  });
});

test.describe('palliative consult without attending adoption', () => {
  test('returns NO \u2014 a consult recommendation does not establish CMO', () => {
    const r = resolveCmo(inp(['palliative']));
    assert.strictEqual(r.val, 'NO');
    assert.match(r.rationale, /attending of record must adopt/);
  });
  test('hospice outranks palliative', () => {
    const r = resolveCmo(inp(['palliative','hospice']));
    assert.strictEqual(r.val, 'REVIEW');
  });
});

test.describe('non-qualifying documentation', () => {
  test('DNR alone returns NO with the code-status specific', () => {
    const r = resolveCmo(inp(['dnr_only']));
    assert.strictEqual(r.val, 'NO');
    assert.strictEqual(r.basis, 'No Qualifying Documentation');
    assert.match(r.rationale, /code status limitation/);
  });
  test('specifics accumulate in fixed order: DNR, comfort, family', () => {
    const r = resolveCmo(inp(['family_note','comfort_only','dnr_only']));
    const iDnr = r.rationale.indexOf('DNR/DNI');
    const iCmf = r.rationale.indexOf('symptom management');
    const iFam = r.rationale.indexOf('family/care conference');
    assert.ok(iDnr > -1 && iCmf > -1 && iFam > -1);
    assert.ok(iDnr < iCmf, 'DNR specific precedes comfort specific');
    assert.ok(iCmf < iFam, 'comfort specific precedes family specific');
  });
  test('closing paragraph names the LIP requirement', () => {
    const r = resolveCmo(inp(['comfort_only']));
    assert.match(r.rationale, /licensed independent practitioner/);
  });
});

test.describe('empty state', () => {
  test('no documentation and no flags returns the no-selection result', () => {
    const r = resolveCmo(inp([]));
    assert.strictEqual(r.val, 'NO');
    assert.strictEqual(r.basis, 'No Documentation Selected');
  });
  test('tolerates a completely absent input object', () => {
    const r = resolveCmo();
    assert.strictEqual(r.basis, 'No Documentation Selected');
  });
});

test.describe('pre-hospital CMO \u2014 LIP-accessibility gate (T-28)', () => {
  // Replaces the T-26 "KNOWN FINDING: prehosp is a dead input" block. Domain
  // rule: a prior-dated CMO/POLST qualifies on whether it was ACCESSIBLE to the
  // treating LIP for this encounter, not on the document's date.
  const SAMPLES = [
    ['md_order'], ['md_note'], ['polst'], ['hospice'], ['palliative'],
    ['dnr_only'], ['comfort_only','family_note'], []
  ];
  const VERIFY_LINE = 'confirmed accessible to the treating LIP';

  test('unchecked: prehospAccess is ignored entirely', () => {
    for (const docs of SAMPLES) {
      const base = resolveCmo(inp(docs));
      for (const a of ['', 'yes', 'no', undefined, null]) {
        assert.deepStrictEqual(resolveCmo(inp(docs, {prehospAccess:a})), base,
          'unchecked result moved for docs=' + docs.join('+') + ' access=' + String(a));
      }
    }
  });

  test("checked + 'yes' preserves the underlying determination", () => {
    for (const docs of SAMPLES) {
      const base = resolveCmo(inp(docs));
      const gated = resolveCmo(inp(docs, {prehosp:true, prehospAccess:'yes'}));
      assert.strictEqual(gated.val, base.val, 'val moved for docs=' + docs.join('+'));
      assert.strictEqual(gated.basis, base.basis, 'basis moved for docs=' + docs.join('+'));
    }
  });

  test("checked + 'yes' appends the accessibility VERIFY line exactly once", () => {
    for (const docs of SAMPLES) {
      const base = resolveCmo(inp(docs));
      const gated = resolveCmo(inp(docs, {prehosp:true, prehospAccess:'yes'}));
      assert.ok(gated.rationale.startsWith(base.rationale),
        'suffix is not a pure append for docs=' + docs.join('+'));
      assert.strictEqual(gated.rationale.split(VERIFY_LINE).length - 1, 1,
        'VERIFY line count wrong for docs=' + docs.join('+'));
    }
  });

  test("checked + 'no' returns REVIEW regardless of documentation", () => {
    for (const docs of SAMPLES) {
      const r = resolveCmo(inp(docs, {prehosp:true, prehospAccess:'no'}));
      assert.strictEqual(r.val, 'REVIEW', 'docs=' + docs.join('+'));
      assert.strictEqual(r.basis, 'Pre-hospital CMO \u2014 Not Accessible to Treating LIP');
    }
  });

  test("checked + 'no' states the limit and the next step", () => {
    const r = resolveCmo(inp(['polst'], {prehosp:true, prehospAccess:'no'}));
    assert.match(r.rationale, /cannot qualify/);
    assert.match(r.rationale, /ACTION REQUIRED/);
    assert.match(r.rationale, /only documentation from this encounter/);
    assert.ok(!r.rationale.includes(VERIFY_LINE), 'no result must not carry the VERIFY line');
  });

  test("checked + '' returns REVIEW, explains the rule, and asks for the answer", () => {
    const r = resolveCmo(inp(['polst'], {prehosp:true, prehospAccess:''}));
    assert.strictEqual(r.val, 'REVIEW');
    assert.strictEqual(r.basis, 'Pre-hospital CMO \u2014 Accessibility Unanswered');
    assert.match(r.rationale, /has not been answered/);
    assert.match(r.rationale, /not on the document's date/);
    assert.match(r.rationale, /Answer the accessibility question and re-run/);
  });

  test('absent/odd access values are unanswered, never treated as no', () => {
    const unanswered = resolveCmo(inp(['polst'], {prehosp:true, prehospAccess:''}));
    for (const a of [undefined, null, 'maybe', true, 0]) {
      const r = resolveCmo(inp(['polst'], {prehosp:true, prehospAccess:a}));
      assert.deepStrictEqual(r, unanswered, 'access=' + String(a) + ' did not fall to unanswered');
    }
  });

  test('withdrawn still outranks the gate', () => {
    for (const a of ['', 'no', 'yes']) {
      const r = resolveCmo(inp(['md_order'], {withdrawn:true, prehosp:true, prehospAccess:a}));
      assert.strictEqual(r.val, 'NO');
      assert.strictEqual(r.basis, 'CMO Rescinded');
    }
  });

  test('post-brain-death still outranks the gate', () => {
    for (const a of ['', 'no', 'yes']) {
      const r = resolveCmo(inp(['md_order'], {postbrain:true, prehosp:true, prehospAccess:a}));
      assert.strictEqual(r.val, 'NO');
      assert.strictEqual(r.basis, 'Post-Brain Death Only');
    }
  });

  test('withdrawn/postbrain return before the gate, so they never carry the VERIFY line', () => {
    // Consequence of the locked ordering: those branches short-circuit first, so
    // accessibility is never established and there is nothing to confirm.
    for (const f of [{withdrawn:true}, {postbrain:true}]) {
      const r = resolveCmo(inp(['md_order'], Object.assign({prehosp:true, prehospAccess:'yes'}, f)));
      assert.ok(!r.rationale.includes(VERIFY_LINE));
    }
  });

  test('the gate outranks the conflict branch', () => {
    const gated = resolveCmo(inp(['hospice'], {conflict:true, prehosp:true, prehospAccess:'no'}));
    assert.strictEqual(gated.val, 'REVIEW');
    assert.match(gated.basis, /Not Accessible to Treating LIP/);
    // and once accessibility is established, the conflict branch runs normally
    const cleared = resolveCmo(inp(['hospice'], {conflict:true, prehosp:true, prehospAccess:'yes'}));
    assert.strictEqual(cleared.val, 'NO');
    assert.match(cleared.basis, /No Clear LIP CMO Plan/);
    assert.ok(cleared.rationale.includes(VERIFY_LINE));
  });

  test('gate results honor the {val, basis, rationale} contract', () => {
    for (const a of ['', 'no']) {
      const r = resolveCmo(inp(['polst'], {prehosp:true, prehospAccess:a}));
      assert.deepStrictEqual(Object.keys(r).sort(), ['basis','rationale','val']);
      assert.strictEqual(typeof r.rationale, 'string');
    }
  });
});

test.describe('result contract', () => {
  test('every branch returns exactly {val, basis, rationale} as strings', () => {
    const cases = [
      inp([]), inp(['md_order']), inp(['md_note']), inp(['polst']),
      inp(['hospice']), inp(['palliative']), inp(['dnr_only']),
      inp([], {withdrawn:true}), inp([], {postbrain:true}),
      inp(['hospice'], {conflict:true})
    ];
    for (const c of cases) {
      const r = resolveCmo(c);
      assert.deepStrictEqual(Object.keys(r).sort(), ['basis','rationale','val']);
      assert.strictEqual(typeof r.val, 'string');
      assert.strictEqual(typeof r.basis, 'string');
      assert.strictEqual(typeof r.rationale, 'string');
    }
  });
  test('val is always one of YES, NO, REVIEW', () => {
    const docs = ['md_order','md_note','polst','hospice','palliative',
                  'comfort_only','dnr_only','family_note'];
    for (let m = 0; m < (1 << docs.length); m++) {
      const sel = docs.filter((_, i) => m & (1 << i));
      const r = resolveCmo(inp(sel));
      assert.ok(['YES','NO','REVIEW'].includes(r.val), 'unexpected val: ' + r.val);
    }
  });
});
