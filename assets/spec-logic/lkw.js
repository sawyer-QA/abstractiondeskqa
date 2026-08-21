/* lkw.js — Last Known Well (STK) grid-resolution spec logic.
 *
 * Extracted from lkw-tool.html's inline resolveGrid() (T-26), following the
 * global-shim + guarded-CommonJS pattern established for sep1.js (ADR-0009).
 *
 * resolveLkw(input) is a 1:1 transcription of resolveGrid()'s 9 priority
 * rules (RULE 0-8, first-match-wins, early-return), refactored to RETURN a
 * result object {yn, date, time, rule, rationale} instead of calling showR()
 * inline. The page keeps a thin wrapper that reads the DOM, calls resolveLkw(),
 * and passes the result to showR() unchanged.
 *
 * Priority hierarchy (locked, spec-correct per TJC STK LKW):
 *   RULE 1 (MD-documented-unknown) short-circuits BEFORE RULE 3 (CSF) and all
 *   positive sources. MD-unknown genuinely overrides a Code Stroke Form time
 *   per spec, so this ordering is faithful, not a bug. Locked by test.
 *
 * Deliberate deviation from pure transcription (documented, test-locked):
 *   RULE 4 concatenates rnLkwT (raw user input from the RN LKW Time field)
 *   into the rationale, which the page renders via .innerHTML. The original
 *   embedded it UNESCAPED (XSS-class, same bug class as the sep1 T-25 finding).
 *   Here it is escaped via escLabel() before embedding. Only rnLkwT is escaped;
 *   the surrounding rationale HTML (<strong>, <span>, <br>, icons) is developer
 *   prose meant to render, and is left intact.
 *
 * Advisory-only paths NOT implemented as computed logic (instructional text
 * telling the human abstractor to verify manually — preserved verbatim, not
 * under test as branches): the RULE 1 MD-unknown EXCEPTION CHECK, the RULE 3
 * CSF exception check, wake-up/found-down date rollback, and multi-episode
 * selection. These are prose in the rationale, not code that reads dates.
 *
 * gAns()/Guided Workflow (the decision-tree walker) is a separate, non-
 * computational feature and is intentionally OUT of scope for this module.
 */

// --- helpers (carried in from lkw-tool.html, verbatim) ---
function ht(t){return !!(t&&t.length>=3);}
function hd(d){return !!(d&&d.length>=6);}

// escLabel: 5-entity HTML escape (& < > " '), self-contained so this module
// is require()-able under node:test without loading site.js. Mirrors site.js's
// esc() exactly (including the single-quote escape, its F-01/F-18 hardening).
// Named escLabel (not esc) to avoid redeclaring site.js's global in the shared
// browser scope on lkw-tool.html. Same rationale as sep1.js's escLabel (T-25).
function escLabel(s){
  s = (s === null || s === undefined) ? '' : String(s);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * resolveLkw(input) -> { yn, date, time, rule, rationale }
 *
 * input is a plain object gathered by the page wrapper from the DOM:
 *   { inhouse, justprior, episodes, mdUnk,
 *     mdSxD, mdSxT, mdLkwD, mdLkwT, rnSxD, rnSxT, rnLkwD, rnLkwT, csfD, csfT }
 * mdUnk is the MD-unknown tri-state value ('yes' | 'no' | '' ), read from the
 * page's mdUnk control. All date/time fields are already trimmed strings
 * (the page wrapper applies gv()'s trim before calling).
 */
function resolveLkw(input){
  const inhouse   = !!input.inhouse;
  const justprior = !!input.justprior;
  const episodes  = !!input.episodes;
  const mdUnkVal  = input.mdUnk;
  const mdSxD=input.mdSxD, mdSxT=input.mdSxT;
  const mdLkwD=input.mdLkwD, mdLkwT=input.mdLkwT;
  const rnSxD=input.rnSxD, rnSxT=input.rnSxT;
  const rnLkwD=input.rnLkwD, rnLkwT=input.rnLkwT;
  const csfD=input.csfD, csfT=input.csfT;

  // RULE 0: In-house
  if(inhouse){
    return {yn:'NO',date:'UTD',time:'UTD',rule:'In-House Stroke',rationale:'LKW first occurred after Arrival Time. Per spec: select No. Date and Time LKW = UTD.'};
  }
  // RULE 1: MD Unknown (Priority 1 — cancels ALL)
  if(mdUnkVal==='yes'){
    return {yn:'NO',date:'UTD',time:'UTD',rule:'MD/APN/PA — Unknown (Priority 1)',rationale:'A physician, APN, or PA explicitly documented LKW as unknown/uncertain/unclear. <strong>This cancels all LKW/S/Sx documentation</strong> from nursing and EMS \u2014 column Priority 1.<br><br><span class="rule-tag">EXCEPTION CHECK</span> Verify: (a) Did the same MD later cross it out and document a specific time? (b) Is this stated as reason for no tPA on a CSF while another CSF entry has a specific time? If either applies, result may change to YES.'};
  }
  // RULE 2: Just prior to arrival
  if(justprior){
    return {yn:'YES',date:'[Arrival Date]',time:'[Arrival Time]',rule:'"Just Prior to Arrival" Exception',rationale:'The only Time LKW documented is a vague reference immediately before arrival with no specific time range. Use Arrival Time as Time LKW and Arrival Date as Date LKW. Last Known Well = Yes.'};
  }
  // RULE 3: CSF (Priority 2 column — beats all positive sources)
  if(ht(csfT)){
    const d=hd(csfD)?csfD:'[from CSF or associated documentation]';
    const epiNote=episodes?'<br><br>\uD83D\uDD04 Multiple episodes flag set \u2014 CSF time still takes precedence unless an MD explicitly documented unknown.':'';
    return {yn:'YES',date:d,time:csfT,rule:'Code Stroke Form (CSF) — Priority 2',rationale:'Code Stroke Form has a specific time. Per the abstraction rules, a CSF (Priority 2 column) time takes precedence over other documented LKW times when present.'+epiNote+'<br><br><span class="rule-tag">CSF EXCEPTION CHECK</span> Confirm no physician has explicitly documented LKW as unknown.'};
  }
  // RULE 4: MD LKW/Normal (Priority 3 col, Row 1)
  if(ht(mdLkwT)){
    const d=hd(mdLkwD)?mdLkwD:(hd(rnLkwD)?rnLkwD:'[confirm date]');
    let multi='';
    if(ht(rnLkwT)&&rnLkwT!==mdLkwT) multi='<br><br><span class="rule-tag">MULTIPLE TIMES</span> RN also documented LKW time ('+escLabel(rnLkwT)+'). MD time (Row Priority 1) takes precedence.';
    return {yn:'YES',date:d,time:mdLkwT,rule:'MD — LKW/Normal (Priority 3, Row 1)',rationale:'MD/APN/PA explicitly documented patient at baseline/LKW with a specific time. Row Priority 1. Last Known Well = Yes.'+multi};
  }
  // RULE 5: RN LKW/Normal (Priority 3 col, Row 2) — no MD LKW
  if(ht(rnLkwT)){
    const d=hd(rnLkwD)?rnLkwD:'[confirm date]';
    return {yn:'YES',date:d,time:rnLkwT,rule:'RN — LKW/Normal (Priority 3, Row 2)',rationale:'No MD LKW time and no MD "unknown." Nursing documented LKW/Normal with a specific time. Use nursing LKW time. Last Known Well = Yes.<br><br><i class="ph-duotone ph-warning" style="color:#fbbf24;vertical-align:middle;"></i> Confirm no physician note conflicts with this \u2014 a conflicting physician time or "unknown" would change this result.'};
  }
  // RULE 6: MD S/Sx (Priority 4 col, Row 1)
  if(ht(mdSxT)){
    const d=hd(mdSxD)?mdSxD:'[confirm date]';
    const epiNote=episodes?'<br><br>\uD83D\uDD04 <strong>Multiple episodes with resolution:</strong> Use the most recent episode before arrival.':'';
    return {yn:'YES',date:d,time:mdSxT,rule:'MD — S/Sx Only (Priority 4, fallback)',rationale:'No explicit LKW/Normal documentation. Using symptom onset time from MD (Priority 4 column). Per spec, when only symptom onset is documented without an explicit LKW reference, use symptom onset time.'+epiNote};
  }
  // RULE 7: RN S/Sx (Priority 4 col, Row 2) — lowest priority
  if(ht(rnSxT)){
    const d=hd(rnSxD)?rnSxD:'[confirm date]';
    return {yn:'YES',date:d,time:rnSxT,rule:'RN — S/Sx Only (Priority 4, Row 2 — lowest)',rationale:'No MD documentation of any kind. No CSF. Using nursing S/Sx onset time as last resort.<br><br><i class="ph-duotone ph-warning" style="color:#fbbf24;vertical-align:middle;"></i> <strong>Strongly verify</strong> there is truly no physician documentation or Code Stroke Form before relying on nursing S/Sx only.'};
  }
  // RULE 8: Nothing
  return {yn:'NO',date:'UTD',time:'UTD',rule:'No Documentation Found',rationale:'No date or time of LKW, symptom onset, or baseline found in any source. Last Known Well = No, Date = UTD, Time = UTD.'};
}

// --- guarded CommonJS tail (ADR-0009): require()-able under node:test, no-op in browser ---
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ht, hd, escLabel, resolveLkw };
}
