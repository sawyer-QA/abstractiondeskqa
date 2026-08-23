/* hbips.js \u2014 HBIPS (inpatient psychiatric) calculator spec logic.
 *
 * Extracted from hbips-tool.html's inline calculators (T-26 tool 3 of 3),
 * following the global-shim + guarded-CommonJS pattern established for
 * sep1.js (ADR-0009), lkw.js, and cmo.js.
 *
 * Unlike lkw and cmo, which each had a single resolver, hbips has FOUR
 * separable computational units. All four are extracted here as pure
 * functions returning result objects; the page keeps thin DOM-read ->
 * resolve -> render wrappers, and the original function names
 * (calcDenom/calcStrata/calcDuration/calcRestraint/calcSeclusion) are
 * preserved so every inline oninput handler is untouched.
 *
 *   resolveDenom(input)    -> denominator: admit/discharge days, leave-day
 *                             clamping, net inpatient days and hours.
 *   resolveStrata(input)   -> age at event date + HBIPS strata assignment
 *                             (B/C/D/E), age-0 exclusion, leap-day handling.
 *   resolveDuration(input) -> episode duration in minutes from two military
 *                             times, with midnight-crossing detection.
 *   resolveEpisodes(mins)  -> multi-episode tally: total minutes, exact
 *                             hours, and hours rounded UP (spec ceiling).
 *
 * Rendering stays page-side. These functions return data only; none of them
 * touch the DOM, build HTML, or read element values. That is what makes them
 * require()-able under node:test.
 *
 * NO escLabel() helper here. Like cmo-tool.html and unlike sep1/lkw, every
 * input on this page is a date, a number, or a 4-digit military time \u2014 all
 * parsed into numbers before use, never echoed back as free text. The result
 * objects carry numbers and fixed enum-ish labels, so there is no untrusted
 * string reaching an .innerHTML sink. If a free-text field is ever added,
 * an escLabel() mirroring lkw.js's must be added with it.
 *
 * ONE DELIBERATE DEVIATION from pure transcription (documented, test-locked):
 *   The original isBirthday check read:
 *       (evMD === dobMD || (dobMD === 229 && evMD === 228))
 *   dobMD is getMonth()*100 + getDate(), and getMonth() is ZERO-INDEXED, so
 *   February is 1 and a Feb-29 birthday encodes as 129 \u2014 not 229. The literal
 *   229 is month index 2, i.e. MARCH 29. The special case therefore:
 *     (a) never fired for the Feb-29 birthday it was written for, and
 *     (b) DID fire for a March-29 DOB with a March-28 event date, telling the
 *         abstractor it was the patient's birthday a day early.
 *   Corrected here to 129/128. Display-only in both directions: the age and
 *   strata math uses effectiveDobMD, which was already computed correctly, so
 *   no determination changes \u2014 only the banner. Locked by tests covering both
 *   the false negative and the false positive. The parity harness reports
 *   these as intentional diffs, not failures.
 *
 * Out of scope (not spec logic, matching the lkw/cmo precedent): the quiz,
 * the case walkthroughs, toggleHelp(), and the DOM-manipulating episode-row
 * helpers addEpisode()/removeEpisode()/addDurationToTally().
 */

var MS_PER_DAY = 86400000;

// --- helpers (carried in from hbips-tool.html, verbatim) ---

// Parses a 4-digit military time string to minutes-since-midnight.
// Returns null for anything that is not exactly 4 digits after stripping
// non-digits, or whose hours/minutes are out of range.
function parseMilitary(str) {
  var s = String(str === null || str === undefined ? '' : str)
            .trim().replace(/\D/g, '');
  if (s.length !== 4) return null;
  var h = parseInt(s.slice(0, 2), 10);
  var m = parseInt(s.slice(2), 10);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

// Formats minutes-since-midnight as "HHMM (h:mm AM/PM)".
function fmtMilitary(totalMins) {
  var h = Math.floor(totalMins / 60) % 24;
  var m = totalMins % 60;
  var ampm = h < 12 ? 'AM' : 'PM';
  var h12 = h % 12 === 0 ? 12 : h % 12;
  return String(h).padStart(2, '0') + String(m).padStart(2, '0') +
         ' (' + h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm + ')';
}

function isLeapYear(y) {
  return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
}

/**
 * resolveDenom(input) -> { ok, error, rawDays, leaveDays, netDays, hours }
 *
 * input: { admit, disch, leave }
 *   admit / disch are 'YYYY-MM-DD' strings (the page's date inputs).
 *   leave is the leave-day count; non-numeric is treated as 0.
 *
 * A failure result carries only {ok:false, error} (plus a message where the
 * page shows one); it does NOT carry zeroed numeric fields, so callers must
 * check ok before reading them.
 *
 * ok:false with error:'incomplete' means one or both dates are blank \u2014 the
 * page hides the result box rather than showing a message. error:'order'
 * means discharge is not after admit.
 */
function resolveDenom(input) {
  input = input || {};
  var a = input.admit, d = input.disch;
  var leaveVal = parseInt(input.leave, 10);
  if (isNaN(leaveVal)) leaveVal = 0;

  if (!a || !d) {
    return {ok:false, error:'incomplete'};
  }

  var admit = new Date(a + 'T00:00:00');
  var disch = new Date(d + 'T00:00:00');

  if (disch <= admit) {
    return {ok:false, error:'order', message:'Discharge date must be after admit date.'};
  }

  var rawDays = Math.round((disch - admit) / MS_PER_DAY);
  var leaveDays = Math.max(0, Math.min(leaveVal, rawDays));
  var netDays = rawDays - leaveDays;

  return {ok:true, error:null, rawDays:rawDays, leaveDays:leaveDays,
          netDays:netDays, hours:netDays * 24};
}

/**
 * resolveStrata(input) -> { ok, error, age, strata, strataLabel, measures,
 *                           strataColor, excluded, isBirthday }
 *
 * input: { dob, event } as 'YYYY-MM-DD' strings.
 *
 * strata is 'B' | 'C' | 'D' | 'E', or null when the case is excluded (age 0).
 * Age is computed to the day, with a Feb-29 birthday treated as Feb 28 in
 * non-leap years.
 */
function resolveStrata(input) {
  input = input || {};
  var dobVal = input.dob, evVal = input.event;

  if (!dobVal || !evVal) {
    return {ok:false, error:'incomplete'};
  }

  var dob = new Date(dobVal + 'T00:00:00');
  var ev  = new Date(evVal  + 'T00:00:00');

  if (isNaN(dob.getTime()) || isNaN(ev.getTime())) {
    return {ok:false, error:'invalid', message:'Enter valid dates for both fields.'};
  }
  if (ev < dob) {
    return {ok:false, error:'before-birth', message:'Event date cannot be before date of birth.'};
  }

  // Precise age \u2014 handles leap-day birthdays.
  var age = ev.getFullYear() - dob.getFullYear();
  var evMD  = ev.getMonth()  * 100 + ev.getDate();
  var dobMD = dob.getMonth() * 100 + dob.getDate();

  // Feb 29 birthday in a non-leap year -> treat as Feb 28.
  // getMonth() is zero-indexed, so February is 1: Feb 29 is 129, Feb 28 is 128.
  var effectiveDobMD = dobMD;
  if (dob.getMonth() === 1 && dob.getDate() === 29) {
    if (!isLeapYear(ev.getFullYear())) effectiveDobMD = 128;
  }
  if (evMD < effectiveDobMD) age--;

  var strata = null, strataLabel, measures, strataColor, excluded = false;

  if (age === 0) {
    excluded = true;
    strataLabel = 'Age 0 \u2014 Excluded';
    measures = 'Not in measure population. Set Reject Case Flag = Yes.';
    strataColor = 'var(--red)';
  } else if (age <= 12) {
    strata = 'B';
    strataLabel = 'Strata B \u00b7 Age 1\u201312 \u00b7 Children';
    measures = 'HBIPS-2b &nbsp;/&nbsp; HBIPS-3b';
    strataColor = '#1a4090';
  } else if (age <= 17) {
    strata = 'C';
    strataLabel = 'Strata C \u00b7 Age 13\u201317 \u00b7 Adolescents';
    measures = 'HBIPS-2c &nbsp;/&nbsp; HBIPS-3c';
    strataColor = '#5b21b6';
  } else if (age <= 64) {
    strata = 'D';
    strataLabel = 'Strata D \u00b7 Age 18\u201364 \u00b7 Adults';
    measures = 'HBIPS-2d &nbsp;/&nbsp; HBIPS-3d';
    strataColor = 'var(--green)';
  } else {
    strata = 'E';
    strataLabel = 'Strata E \u00b7 Age \u226565 \u00b7 Older Adults';
    measures = 'HBIPS-2e &nbsp;/&nbsp; HBIPS-3e';
    strataColor = 'var(--amber)';
  }

  // DEVIATION (see header): the original tested dobMD === 229 / evMD === 228,
  // which is March, not February. Feb 29 is 129 and Feb 28 is 128.
  var isBirthday = (evMD === dobMD || (dobMD === 129 && evMD === 128));

  return {ok:true, error:null, age:age, strata:strata, strataLabel:strataLabel,
          measures:measures, strataColor:strataColor, excluded:excluded,
          isBirthday:isBirthday};
}

/**
 * resolveDuration(input) -> { ok, error, startMins, endMins, diff,
 *                             crossedMidnight, startLabel, endLabel }
 *
 * input: { start, end } as military-time strings.
 *
 * A non-positive difference is treated as the end time falling on the next
 * day (+24h), which also sets crossedMidnight. Note this means start === end
 * yields 1440 minutes, not 0 \u2014 preserved from the original and locked by test.
 */
function resolveDuration(input) {
  input = input || {};
  var startStr = input.start, endStr = input.end;

  if (!startStr || !endStr || String(startStr).length < 4 || String(endStr).length < 4) {
    return {ok:false, error:'incomplete'};
  }

  var startMins = parseMilitary(startStr);
  var endMins   = parseMilitary(endStr);

  if (startMins === null || endMins === null) {
    return {ok:false, error:'invalid',
            message:'Enter valid military time \u2014 4 digits, hours 00\u201323, minutes 00\u201359.'};
  }

  var diff = endMins - startMins;
  var crossedMidnight = false;
  if (diff <= 0) {
    diff += 24 * 60;
    crossedMidnight = true;
  }

  return {ok:true, error:null, startMins:startMins, endMins:endMins, diff:diff,
          crossedMidnight:crossedMidnight,
          startLabel:fmtMilitary(startMins), endLabel:fmtMilitary(endMins)};
}

/**
 * resolveEpisodes(minutesList) -> { total, count, exact, hours, empty }
 *
 * minutesList is an array of raw episode values (strings or numbers, as read
 * from the page's number inputs). Values that are non-numeric or <= 0 are
 * ignored entirely and do not contribute to the count \u2014 preserved from the
 * original getEpisodeTotal().
 *
 * hours is minutes/60 rounded UP (the HBIPS ceiling rule); exact is the
 * unrounded quotient as a 4-decimal string, matching the page's display.
 * When the total is 0 the result carries only {total, count, empty:true} \u2014
 * no exact/hours \u2014 mirroring the original, whose renderer early-returned
 * before computing them. Callers must check empty before reading them.
 */
function resolveEpisodes(minutesList) {
  var list = Array.isArray(minutesList) ? minutesList : [];
  var total = 0, count = 0;

  for (var i = 0; i < list.length; i++) {
    var v = parseFloat(list[i]);
    if (!isNaN(v) && v > 0) { total += v; count++; }
  }

  if (total === 0) {
    return {total:0, count:count, empty:true};
  }

  return {total:total, count:count, exact:(total / 60).toFixed(4),
          hours:Math.ceil(total / 60), empty:false};
}

// --- guarded CommonJS tail (ADR-0009): require()-able under node:test, no-op in browser ---
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseMilitary: parseMilitary,
    fmtMilitary: fmtMilitary,
    isLeapYear: isLeapYear,
    resolveDenom: resolveDenom,
    resolveStrata: resolveStrata,
    resolveDuration: resolveDuration,
    resolveEpisodes: resolveEpisodes
  };
}
