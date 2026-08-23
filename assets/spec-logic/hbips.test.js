/* hbips.test.js \u2014 node:test coverage for the HBIPS calculator spec logic.
 *
 * Companion to assets/spec-logic/hbips.js (T-26 tool 3 of 3). Unlike lkw and
 * cmo, this module has four independent units, so the suite is organised by
 * unit rather than by rule number.
 *
 * These tests lock CURRENT behavior. Where current behavior is a preserved
 * quirk rather than an obviously desirable rule (start === end yielding a full
 * 1440 minutes; zero/negative episode values not counting), the test says so
 * explicitly, so a future change trips it deliberately rather than silently.
 */

const test = require('node:test');
const assert = require('node:assert');
const {
  parseMilitary, fmtMilitary, isLeapYear,
  resolveDenom, resolveStrata, resolveDuration, resolveEpisodes
} = require('./hbips.js');

test.describe('parseMilitary', () => {
  test('parses valid military times to minutes since midnight', () => {
    assert.strictEqual(parseMilitary('0000'), 0);
    assert.strictEqual(parseMilitary('0800'), 480);
    assert.strictEqual(parseMilitary('1415'), 855);
    assert.strictEqual(parseMilitary('2359'), 1439);
  });
  test('strips non-digits before length checking', () => {
    assert.strictEqual(parseMilitary('14:15'), 855);
    assert.strictEqual(parseMilitary(' 0800 '), 480);
  });
  test('rejects wrong digit counts', () => {
    assert.strictEqual(parseMilitary('123'), null);
    assert.strictEqual(parseMilitary('12345'), null);
    assert.strictEqual(parseMilitary(''), null);
  });
  test('rejects out-of-range hours and minutes', () => {
    assert.strictEqual(parseMilitary('2400'), null);
    assert.strictEqual(parseMilitary('0060'), null);
    assert.strictEqual(parseMilitary('9999'), null);
  });
  test('tolerates null/undefined without throwing', () => {
    assert.strictEqual(parseMilitary(null), null);
    assert.strictEqual(parseMilitary(undefined), null);
  });
});

test.describe('fmtMilitary', () => {
  test('formats midnight and noon correctly', () => {
    assert.strictEqual(fmtMilitary(0), '0000 (12:00 AM)');
    assert.strictEqual(fmtMilitary(720), '1200 (12:00 PM)');
  });
  test('zero-pads and converts to 12-hour', () => {
    assert.strictEqual(fmtMilitary(65), '0105 (1:05 AM)');
    assert.strictEqual(fmtMilitary(1439), '2359 (11:59 PM)');
  });
});

test.describe('isLeapYear', () => {
  test('applies the full Gregorian rule', () => {
    assert.strictEqual(isLeapYear(2024), true);
    assert.strictEqual(isLeapYear(2026), false);
    assert.strictEqual(isLeapYear(1900), false);   // century, not divisible by 400
    assert.strictEqual(isLeapYear(2000), true);    // divisible by 400
  });
});

test.describe('resolveDenom', () => {
  test('computes raw days, net days, and hours', () => {
    const r = resolveDenom({admit:'2026-01-01', disch:'2026-01-11', leave:0});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.rawDays, 10);
    assert.strictEqual(r.netDays, 10);
    assert.strictEqual(r.hours, 240);
  });
  test('subtracts leave days from the net total', () => {
    const r = resolveDenom({admit:'2026-01-01', disch:'2026-01-11', leave:3});
    assert.strictEqual(r.leaveDays, 3);
    assert.strictEqual(r.netDays, 7);
    assert.strictEqual(r.hours, 168);
  });
  test('clamps leave days to the stay length \u2014 never negative net days', () => {
    const r = resolveDenom({admit:'2026-01-01', disch:'2026-01-11', leave:999});
    assert.strictEqual(r.leaveDays, 10);
    assert.strictEqual(r.netDays, 0);
    assert.strictEqual(r.hours, 0);
  });
  test('clamps negative leave input up to zero', () => {
    const r = resolveDenom({admit:'2026-01-01', disch:'2026-01-11', leave:-5});
    assert.strictEqual(r.leaveDays, 0);
    assert.strictEqual(r.netDays, 10);
  });
  test('non-numeric leave input is treated as zero', () => {
    const r = resolveDenom({admit:'2026-01-01', disch:'2026-01-11', leave:'abc'});
    assert.strictEqual(r.leaveDays, 0);
  });
  test('spans a month boundary correctly', () => {
    const r = resolveDenom({admit:'2026-02-25', disch:'2026-03-02', leave:0});
    assert.strictEqual(r.rawDays, 5);
  });
  test('blank dates return the incomplete state, not an error message', () => {
    assert.strictEqual(resolveDenom({admit:'', disch:'2026-01-11'}).error, 'incomplete');
    assert.strictEqual(resolveDenom({admit:'2026-01-01', disch:''}).error, 'incomplete');
    assert.strictEqual(resolveDenom({}).error, 'incomplete');
  });
  test('discharge on or before admit is an ordering error', () => {
    assert.strictEqual(resolveDenom({admit:'2026-01-11', disch:'2026-01-01'}).error, 'order');
    assert.strictEqual(resolveDenom({admit:'2026-01-01', disch:'2026-01-01'}).error, 'order');
  });
  test('a failure result carries no zeroed numeric fields', () => {
    const r = resolveDenom({admit:'', disch:''});
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.rawDays, undefined);
    assert.strictEqual(r.netDays, undefined);
  });
});

test.describe('resolveStrata \u2014 age computation', () => {
  test('age decrements when the event precedes the birthday in-year', () => {
    assert.strictEqual(resolveStrata({dob:'2000-06-15', event:'2026-06-14'}).age, 25);
    assert.strictEqual(resolveStrata({dob:'2000-06-15', event:'2026-06-15'}).age, 26);
    assert.strictEqual(resolveStrata({dob:'2000-06-15', event:'2026-06-16'}).age, 26);
  });
  test('Feb-29 DOB in a non-leap year rolls the birthday to Feb 28', () => {
    assert.strictEqual(resolveStrata({dob:'2000-02-29', event:'2026-02-28'}).age, 26);
    assert.strictEqual(resolveStrata({dob:'2000-02-29', event:'2026-02-27'}).age, 25);
  });
  test('Feb-29 DOB in a leap year uses the real date', () => {
    assert.strictEqual(resolveStrata({dob:'2000-02-29', event:'2028-02-29'}).age, 28);
    assert.strictEqual(resolveStrata({dob:'2000-02-29', event:'2028-02-28'}).age, 27);
  });
});

test.describe('resolveStrata \u2014 strata assignment', () => {
  test('age 0 is excluded from the measure population', () => {
    const r = resolveStrata({dob:'2026-01-15', event:'2026-06-30'});
    assert.strictEqual(r.age, 0);
    assert.strictEqual(r.excluded, true);
    assert.strictEqual(r.strata, null);
    assert.match(r.measures, /Reject Case Flag = Yes/);
  });
  test('boundary ages map to the right strata', () => {
    const at = (age) => {
      const ev = '2026-06-15';
      const dob = (2026 - age) + '-06-15';
      return resolveStrata({dob, event:ev});
    };
    assert.strictEqual(at(1).strata, 'B');
    assert.strictEqual(at(12).strata, 'B');
    assert.strictEqual(at(13).strata, 'C');
    assert.strictEqual(at(17).strata, 'C');
    assert.strictEqual(at(18).strata, 'D');
    assert.strictEqual(at(64).strata, 'D');
    assert.strictEqual(at(65).strata, 'E');
    assert.strictEqual(at(90).strata, 'E');
  });
  test('each stratum names its own HBIPS-2/3 measure pair', () => {
    const pairs = {B:'2b', C:'2c', D:'2d', E:'2e'};
    for (const [s, code] of Object.entries(pairs)) {
      const age = {B:5, C:15, D:40, E:70}[s];
      const r = resolveStrata({dob:(2026-age)+'-06-15', event:'2026-06-15'});
      assert.strictEqual(r.strata, s);
      assert.ok(r.measures.includes('HBIPS-' + code), s + ' names HBIPS-' + code);
    }
  });
  test('excluded cases are never given a stratum letter', () => {
    const r = resolveStrata({dob:'2026-01-01', event:'2026-12-31'});
    assert.strictEqual(r.excluded, true);
    assert.strictEqual(r.strata, null);
  });
});

test.describe('resolveStrata \u2014 error states', () => {
  test('blank inputs return the incomplete state', () => {
    assert.strictEqual(resolveStrata({dob:'', event:'2026-06-15'}).error, 'incomplete');
    assert.strictEqual(resolveStrata({}).error, 'incomplete');
  });
  test('unparseable dates return the invalid state', () => {
    assert.strictEqual(resolveStrata({dob:'not-a-date', event:'2026-06-15'}).error, 'invalid');
  });
  test('an event before the date of birth is rejected', () => {
    const r = resolveStrata({dob:'2026-06-15', event:'2020-01-01'});
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'before-birth');
  });
});

test.describe('resolveStrata \u2014 isBirthday (DELIBERATE FIX, see module header)', () => {
  // The original encoded a Feb-29 birthday as 229; getMonth() is zero-indexed,
  // so February is 1 and Feb 29 is actually 129. The literal 229 is MARCH 29.
  // Both directions of that mistake are locked here.
  test('fires on an exact birthday match', () => {
    assert.strictEqual(resolveStrata({dob:'2000-06-15', event:'2026-06-15'}).isBirthday, true);
    assert.strictEqual(resolveStrata({dob:'2000-06-15', event:'2026-06-16'}).isBirthday, false);
  });
  test('FIXED false negative: Feb-29 DOB now fires on Feb 28 in a non-leap year', () => {
    const r = resolveStrata({dob:'2000-02-29', event:'2026-02-28'});
    assert.strictEqual(r.isBirthday, true);
    assert.strictEqual(r.age, 26);          // age math was always correct
  });
  test('FIXED false positive: Mar-29 DOB no longer fires on Mar 28', () => {
    const r = resolveStrata({dob:'2008-03-29', event:'2026-03-28'});
    assert.strictEqual(r.isBirthday, false);
    assert.strictEqual(r.age, 17);          // unchanged by the fix
  });
  test('Mar-29 DOB still fires on the real Mar 29', () => {
    assert.strictEqual(resolveStrata({dob:'2008-03-29', event:'2026-03-29'}).isBirthday, true);
  });
});

test.describe('resolveDuration', () => {
  test('computes a same-day duration', () => {
    const r = resolveDuration({start:'1415', end:'1620'});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.diff, 125);
    assert.strictEqual(r.crossedMidnight, false);
  });
  test('adds 24h and flags when the end time is earlier than the start', () => {
    const r = resolveDuration({start:'2300', end:'0100'});
    assert.strictEqual(r.diff, 120);
    assert.strictEqual(r.crossedMidnight, true);
  });
  test('PRESERVED QUIRK: start === end yields a full 1440 minutes, not 0', () => {
    const r = resolveDuration({start:'0800', end:'0800'});
    assert.strictEqual(r.diff, 1440);
    assert.strictEqual(r.crossedMidnight, true);
  });
  test('exposes formatted labels for both endpoints', () => {
    const r = resolveDuration({start:'0000', end:'1200'});
    assert.strictEqual(r.startLabel, '0000 (12:00 AM)');
    assert.strictEqual(r.endLabel, '1200 (12:00 PM)');
  });
  test('short or blank input returns the incomplete state', () => {
    assert.strictEqual(resolveDuration({start:'141', end:'1620'}).error, 'incomplete');
    assert.strictEqual(resolveDuration({start:'', end:''}).error, 'incomplete');
    assert.strictEqual(resolveDuration({}).error, 'incomplete');
  });
  test('four characters that are not a valid time return the invalid state', () => {
    assert.strictEqual(resolveDuration({start:'abcd', end:'1620'}).error, 'invalid');
    assert.strictEqual(resolveDuration({start:'2500', end:'1620'}).error, 'invalid');
  });
});

test.describe('resolveEpisodes', () => {
  test('sums minutes and counts episodes', () => {
    const r = resolveEpisodes([30, 45, 15]);
    assert.strictEqual(r.total, 90);
    assert.strictEqual(r.count, 3);
  });
  test('rounds hours UP \u2014 the HBIPS ceiling rule', () => {
    assert.strictEqual(resolveEpisodes([59]).hours, 1);
    assert.strictEqual(resolveEpisodes([60]).hours, 1);
    assert.strictEqual(resolveEpisodes([61]).hours, 2);
    assert.strictEqual(resolveEpisodes([1]).hours, 1);
  });
  test('reports exact hours to four decimals alongside the ceiling', () => {
    const r = resolveEpisodes([90]);
    assert.strictEqual(r.exact, '1.5000');
    assert.strictEqual(r.hours, 2);
  });
  test('PRESERVED QUIRK: zero and negative values are ignored, not counted', () => {
    const r = resolveEpisodes([0, -5, 30]);
    assert.strictEqual(r.total, 30);
    assert.strictEqual(r.count, 1);
  });
  test('non-numeric values are skipped', () => {
    const r = resolveEpisodes(['abc', '30', '', 15]);
    assert.strictEqual(r.total, 45);
    assert.strictEqual(r.count, 2);
  });
  test('an all-empty list reports empty and omits exact/hours', () => {
    const r = resolveEpisodes([]);
    assert.strictEqual(r.empty, true);
    assert.strictEqual(r.total, 0);
    assert.strictEqual(r.hours, undefined);
    assert.strictEqual(r.exact, undefined);
  });
  test('a list of only zeros is also empty', () => {
    assert.strictEqual(resolveEpisodes([0, 0, '0']).empty, true);
  });
  test('tolerates a non-array argument', () => {
    assert.strictEqual(resolveEpisodes(undefined).empty, true);
    assert.strictEqual(resolveEpisodes(null).empty, true);
  });
});

test.describe('module export surface', () => {
  test('exports the seven expected names as functions', () => {
    const m = require('./hbips.js');
    const names = ['parseMilitary','fmtMilitary','isLeapYear','resolveDenom',
                   'resolveStrata','resolveDuration','resolveEpisodes'];
    assert.deepStrictEqual(Object.keys(m).sort(), names.slice().sort());
    for (const n of names) assert.strictEqual(typeof m[n], 'function', n);
  });
  test('no resolver touches the DOM (callable with no document defined)', () => {
    assert.strictEqual(typeof document, 'undefined');
    assert.doesNotThrow(() => {
      resolveDenom({admit:'2026-01-01', disch:'2026-01-02', leave:0});
      resolveStrata({dob:'2000-01-01', event:'2026-01-01'});
      resolveDuration({start:'0800', end:'0900'});
      resolveEpisodes([30]);
    });
  });
});
