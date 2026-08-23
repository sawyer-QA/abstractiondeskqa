/* cmo.test.js \u2014 node:test coverage for the CMO exclusion classifier spec logic.
 *
 * Companion to assets/spec-logic/cmo.js (T-26 tool 2 of 3). Mirrors the
 * structure of lkw.test.js: one describe block per priority branch, plus
 * ordering tests that lock the short-circuit hierarchy, plus a contract block.
 *
 * These tests lock CURRENT behavior. Where current behavior is a known finding
 * rather than a desired end state (the dead prehosp flag), the test says so
 * explicitly so a future fix trips it deliberately rather than silently.
 */

const test = require('node:test');
const assert = require('node:assert');
const { toDocSet, resolveCmo } = require('./cmo.js');

// Convenience: build an input with sane defaults.
function inp(docs, flags){
  return Object.assign({ docs: docs || [], prehosp:false, postbrain:false,
                         conflict:false, withdrawn:false }, flags || {});
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

test.describe('KNOWN FINDING: prehosp is a dead input', () => {
  // These lock CURRENT behavior, which is that #flag-prehosp changes nothing.
  // Per spec, a prior-dated CMO/POLST qualifies on whether it was ACCESSIBLE to
  // the treating LIP during this encounter, not on its date \u2014 so wiring this up
  // needs a new UI sub-question, not just a new branch. When that ticket lands,
  // these two tests SHOULD fail, and that failure is the intended signal.
  test('prehosp does not change the empty-state result', () => {
    const off = resolveCmo(inp([], {prehosp:false}));
    const on  = resolveCmo(inp([], {prehosp:true}));
    assert.deepStrictEqual(on, off);
  });
  test('prehosp does not change a POLST result', () => {
    const off = resolveCmo(inp(['polst'], {prehosp:false}));
    const on  = resolveCmo(inp(['polst'], {prehosp:true}));
    assert.deepStrictEqual(on, off);
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
