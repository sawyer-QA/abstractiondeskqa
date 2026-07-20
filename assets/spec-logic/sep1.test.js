/* SEP-1 spec-logic tests (T-08 commit 2).
   Colocated with sep1.js; node:test auto-discovers files named *.test.js.
   Run: node --test assets/spec-logic/
   No package.json, no config, CommonJS require of the global-shim module.

   Every expected string below is a verbatim literal from sep1.js as of T-08.
   Tests that lock a documented quirk are marked LOCKS QUIRK N and cite the
   sep1.js header comment: a future refactor that "improves" the behavior must
   fail here first and route through its own ticket. */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  DETECT_RULES, ORDERED_FLAG, COMPLETED_FLAG,
  detectType, detectOrderVsCompleted, t2m, m2t, resolveTimeZero,
} = require('./sep1.js');

// Fixture helper: an event as the tool builds it — mins derived from time via t2m.
function ev(type, time, label) {
  return { type, time, label, mins: t2m(time) };
}

describe('module export surface', () => {
  test('exports the eight expected names with correct types', () => {
    assert.equal(typeof detectType, 'function');
    assert.equal(typeof detectOrderVsCompleted, 'function');
    assert.equal(typeof t2m, 'function');
    assert.equal(typeof m2t, 'function');
    assert.equal(typeof resolveTimeZero, 'function');
    assert.ok(Array.isArray(DETECT_RULES));
    assert.ok(ORDERED_FLAG instanceof RegExp);
    assert.ok(COMPLETED_FLAG instanceof RegExp);
  });
});

describe('detectType', () => {
  test('SIRS temperature criterion -> sirs', () => {
    assert.equal(detectType('Temp 38.9'), 'sirs');
  });
  test('organ-dysfunction lactate -> od', () => {
    assert.equal(detectType('Lactate 3.4'), 'od');
  });
  test('blood cultures -> bundle', () => {
    assert.equal(detectType('Blood cultures drawn'), 'bundle');
  });
  test('antibiotic (vancomycin) -> bundle', () => {
    assert.equal(detectType('Vancomycin'), 'bundle');
  });
  test('vasopressor -> shock', () => {
    assert.equal(detectType('Norepinephrine started'), 'shock');
  });
  test('unmatched label -> other', () => {
    assert.equal(detectType('Patient sleeping'), 'other');
  });
  test('case-insensitive: uppercase classifies the same as lowercase', () => {
    assert.equal(detectType('LACTATE 3.4'), 'od');
  });
  test('rule-order precedence: sirs is evaluated before od, first match wins', () => {
    // "Temp" (sirs) and "lactate" (od) both present; DETECT_RULES tests sirs first.
    assert.equal(detectType('Temp 38.9 and lactate 3.4'), 'sirs');
  });
});

describe('detectOrderVsCompleted', () => {
  test('bundle + ordered-only -> warning string', () => {
    assert.equal(
      detectOrderVsCompleted('Blood cultures ordered', 'bundle'),
      'ordered — verify completion time for bundle calculation',
    );
  });
  test('bundle + completion present suppresses the warning -> null', () => {
    // ORDERED_FLAG matches "ordered" but COMPLETED_FLAG matches "drawn":
    // the && !COMPLETED_FLAG clause makes this null.
    assert.equal(
      detectOrderVsCompleted('Blood cultures ordered, drawn at 14:20', 'bundle'),
      null,
    );
  });
  test('non-bundle type is short-circuited by the guard -> null', () => {
    // ORDERED_FLAG would match, but type !== 'bundle' returns null first.
    assert.equal(detectOrderVsCompleted('Temp 38.9 ordered', 'sirs'), null);
  });
});

describe('t2m / m2t', () => {
  test('t2m boundary times', () => {
    assert.equal(t2m('00:00'), 0);
    assert.equal(t2m('23:59'), 1439);
  });
  test('m2t boundary times and day-rollover', () => {
    assert.equal(m2t(0), '00:00');
    assert.equal(m2t(1439), '23:59');
    assert.equal(m2t(1440), '00:00 (+1d)');
    assert.equal(m2t(1530), '01:30 (+1d)');
  });
  test('m2t negative wraparound: -30 -> 23:30 with no (+Nd) suffix', () => {
    // d = floor(-30/1440) = -1, so d>0 is false: suffix omitted despite the wrap.
    assert.equal(m2t(-30), '23:30');
  });
});

describe('resolveTimeZero — manual branch', () => {
  test('with manualSrc: source is used and both checks pass', () => {
    const r = resolveTimeZero([], '08:00', 'ED provider note');
    assert.equal(r.tzMins, 480);
    assert.equal(r.tzTime, '08:00');
    assert.equal(r.tzSource, 'ED provider note');
    assert.equal(r.tzChecks[0].text, 'Time Zero manually set to 08:00');
    assert.equal(r.tzChecks[1].ok, true);
    assert.equal(r.tzChecks[1].text, 'Source: ED provider note');
    assert.equal(r.d3, 660);
    assert.equal(r.d6, 840);
  });
  test('without manualSrc: falls back to "Manual entry" and flags the missing source', () => {
    const r = resolveTimeZero([], '08:00', '');
    assert.equal(r.tzSource, 'Manual entry');
    assert.equal(r.tzChecks[1].ok, false);
    assert.equal(r.tzChecks[1].text, 'No source selected — document your rationale');
  });
});

describe('resolveTimeZero — auto branches', () => {
  test('paired within window, gap < 60 renders "N min"', () => {
    const events = [ev('sirs', '10:00', 'Temp 38.9'), ev('od', '10:30', 'Lactate 3.4')];
    const r = resolveTimeZero(events, '', '');
    assert.equal(r.tzMins, 600);
    assert.equal(r.tzTime, '10:00');
    assert.equal(r.tzSource, 'Auto-suggested');
    assert.equal(r.tzChecks[0].text, 'SIRS criteria — "Temp 38.9" at 10:00');
    assert.equal(r.tzChecks[1].text, 'Organ dysfunction — "Lactate 3.4" at 10:30');
    assert.equal(r.tzChecks[2].text, 'Events 30 min apart — within 6-hour pairing window');
    assert.equal(r.allSirsForDisplay.length, 1);
    assert.equal(r.d3, 780);
    assert.equal(r.d6, 960);
  });

  test('paired within window, gap >= 60 renders "Nh Nm"', () => {
    const events = [ev('sirs', '10:00', 'Temp 38.9'), ev('od', '12:30', 'Lactate 3.4')];
    const r = resolveTimeZero(events, '', '');
    assert.equal(r.tzSource, 'Auto-suggested');
    assert.equal(r.tzChecks[2].text, 'Events 2h 30m apart — within 6-hour pairing window');
  });

  test('pairing takes the FIRST array match within the window, not the nearest', () => {
    // LOCKS QUIRK 2 (sep1.js header): "the SIRS/OD pairing loop takes the first
    // array match within the 6-hour window rather than the nearest match."
    // SIRS at 12:00. OD at 09:00 (gap 180) precedes OD at 12:15 (gap 15) in the
    // array; odEvs.find() returns the farther 09:00 event. Do not "fix" to nearest.
    const events = [
      ev('sirs', '12:00', 'HR 120'),
      ev('od', '09:00', 'Creatinine 2.1'),
      ev('od', '12:15', 'Lactate 3.0'),
    ];
    const r = resolveTimeZero(events, '', '');
    assert.equal(r.tzMins, 720); // SIRS time governs
    assert.equal(r.tzChecks[1].text, 'Organ dysfunction — "Creatinine 2.1" at 09:00');
    assert.equal(r.tzChecks[2].text, 'Events 3h 0m apart — within 6-hour pairing window');
  });

  test('no pair within window, both present: OD-before-SIRS fallback (label independent of order)', () => {
    // LOCKS QUIRK 3 (sep1.js header): the "OD before SIRS" label is applied
    // unconditionally, not derived from actual chronological order. Here OD (20:00)
    // is chronologically AFTER SIRS (08:00) — 12h apart, no pair within 360 min —
    // yet the source is still labeled "(OD before SIRS)". Do not derive from order.
    const events = [ev('sirs', '08:00', 'Temp 39.1'), ev('od', '20:00', 'Lactate 5.0')];
    const r = resolveTimeZero(events, '', '');
    assert.equal(r.tzMins, 1200); // eo = first OD
    assert.equal(r.tzTime, '20:00');
    assert.equal(r.tzSource, 'Auto-suggested (OD before SIRS)');
    assert.equal(r.tzChecks.length, 5);
    assert.equal(r.tzChecks[2].text, 'Events 12h 0m apart — within pairing window');
    assert.equal(r.tzChecks[3].text, 'OD preceded SIRS — verify provider documentation');
  });

  test('OD only, no SIRS: organ-dysfunction fallback', () => {
    const events = [ev('od', '10:00', 'Lactate 4.2')];
    const r = resolveTimeZero(events, '', '');
    assert.equal(r.tzMins, 600);
    assert.equal(r.tzSource, 'Fallback — organ dysfunction only (no SIRS entered)');
    assert.equal(r.tzChecks[0].text, 'No SIRS criteria found — add SIRS events or enter Time Zero manually');
    assert.equal(r.tzChecks[1].text, 'Using earliest organ dysfunction: "Lactate 4.2" at 10:00');
  });

  test('neither SIRS nor OD present: insufficient-data fallback uses the first event', () => {
    const events = [ev('bundle', '09:00', 'Vancomycin started')];
    const r = resolveTimeZero(events, '', '');
    assert.equal(r.tzMins, 540);
    assert.equal(r.tzSource, 'Fallback — insufficient data');
    assert.equal(r.tzChecks[0].text, 'Could not identify SIRS or organ dysfunction events');
    assert.equal(r.tzChecks[1].text, 'Add SIRS and organ dysfunction events, or enter Time Zero manually');
  });
});

describe('resolveTimeZero — preserved quirk (raw label embedding)', () => {
  test('tzChecks text embeds the raw, unescaped event label', () => {
    // LOCKS QUIRK 1 (sep1.js header): "tzChecks[].text embeds raw, unescaped event
    // labels (no esc() call)." This is an XSS-class behavior preserved deliberately
    // in T-08; it has its own future ticket and must NOT be silently escaped here.
    const events = [ev('sirs', '10:00', 'HR <b>120</b>'), ev('od', '10:30', 'Lactate 3.4')];
    const r = resolveTimeZero(events, '', '');
    assert.equal(r.tzChecks[0].text, 'SIRS criteria — "HR <b>120</b>" at 10:00');
  });
});

describe('resolveTimeZero — documented precondition', () => {
  test('empty validEvents throws (caller must guarantee non-empty)', () => {
    // Documented precondition, NOT a desired feature: with no manualTz and an empty
    // event list every branch is skipped and the final fallback reads validEvents[0].
    // No guard clause is added in T-08 — that would be scope creep. The caller
    // (build() in sep1-tool.html) guarantees a non-empty list before calling.
    assert.throws(() => resolveTimeZero([], '', ''));
  });
});

describe('resolveTimeZero — bundle-window arithmetic (d3 / d6 are raw offsets)', () => {
  test('standard: d3 = tzMins + 180, d6 = tzMins + 360', () => {
    const r = resolveTimeZero([], '08:00', 'x');
    assert.equal(r.d3, 660);
    assert.equal(r.d6, 840);
  });
  test('midnight rollover: d3 / d6 are raw minutes and are NOT wrapped past 1440', () => {
    // Day-wrapping for display is the caller's job (via m2t); the raw offsets stay raw.
    const r = resolveTimeZero([], '23:00', 'x');
    assert.equal(r.tzMins, 1380);
    assert.equal(r.d3, 1560);
    assert.equal(r.d6, 1740);
  });
});

/* v5.19 PENDING — unimplemented spec changes, effective 1/1/2027 (TD-3).
   test.todo (NOT test.skip): the behavior is not-yet-built, not broken. These
   are the regression hooks waiting for the cmo-tool / sep1-timeline / KB updates.
   Excluded from the >=15 acceptance count. */
test.todo('v5.19: CCUS added to Repeat Assessment sourcing (eff 1/1/2027)');
test.todo('v5.19: SSPT sourcing tightened to require specified date/time in provider notes (eff 1/1/2027)');
