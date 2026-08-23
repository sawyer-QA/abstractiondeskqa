/* cmo.js \u2014 Comfort Measures Only (CMO) exclusion classifier spec logic.
 *
 * Extracted from cmo-tool.html's inline resolveClassifier() (T-26 tool 2 of 3),
 * following the global-shim + guarded-CommonJS pattern established for sep1.js
 * (ADR-0009) and lkw.js.
 *
 * resolveCmo(input) is a 1:1 transcription of resolveClassifier()'s 9 priority
 * branches (first-match-wins, early-return), refactored to RETURN a result
 * object {val, basis, rationale} instead of calling showCR() inline. The page
 * keeps a thin wrapper that reads the DOM, calls resolveCmo(), and passes the
 * result to showCR() unchanged. The resolveClassifier name is preserved on the
 * page so the existing onclick handler is untouched.
 *
 * Priority hierarchy (locked by test, transcribed as-is):
 *   withdrawn > post-brain-death > conflict-without-LIP > md_order > md_note >
 *   polst > hospice > palliative > comfort_only|dnr_only|family_note > none.
 * Note that the timing flags (withdrawn, postbrain) short-circuit BEFORE any
 * documentation is considered, and the conflict branch only fires when neither
 * md_order nor md_note is selected.
 *
 * NO escLabel() helper here, deliberately. Unlike sep1.js (T-25) and lkw.js,
 * cmo-tool.html has no free-text input anywhere: the only user inputs are
 * checkboxes and button clicks, and every string reaching the .innerHTML sink
 * (#r-rationale) is a developer-authored literal. There is no untrusted value
 * to escape, so adding an escape helper would be dead code. If a free-text
 * field is ever added to this tool, an escLabel() mirroring lkw.js's must be
 * added with it.
 *
 * KNOWN FINDING (behavior preserved, NOT fixed here):
 *   The "Pre-hospital CMO" checkbox (#flag-prehosp) is read into `prehosp` and
 *   then never used by any branch. It is a dead input: an abstractor can check
 *   it and the determination does not change. Carried into this module's input
 *   contract so the seam is visible, and locked by test at its current (no-op)
 *   behavior. Wiring it up is a BEHAVIOR CHANGE requiring a UI change too:
 *   per spec, a prior-dated CMO/POLST qualifies based on whether it was
 *   ACCESSIBLE to the treating LIP during this encounter, not on its date, and
 *   the current checkbox captures only timing. Logged as a separate ticket.
 *
 * gAns()/Guided Workflow is a separate, non-computational feature and is
 * intentionally OUT of scope for this module, matching the lkw.js precedent.
 */

// --- helpers ---
// Accepts the page's selectedDocs Set, or a plain Array (convenient for tests).
function toDocSet(docs){
  if (docs instanceof Set) return docs;
  if (Array.isArray(docs)) return new Set(docs);
  return new Set();
}

/**
 * resolveCmo(input) -> { val, basis, rationale }
 *
 * input is a plain object gathered by the page wrapper from the DOM:
 *   { docs, prehosp, postbrain, conflict, withdrawn }
 * docs is the selectedDocs Set (or an Array of the same keys):
 *   md_order | md_note | polst | hospice | palliative |
 *   comfort_only | dnr_only | family_note
 * The four flags are booleans read from the Step 2 timing checkboxes.
 *
 * val is one of 'YES' | 'NO' | 'REVIEW' and drives showCR()'s class mapping.
 */
function resolveCmo(input){
  input = input || {};
  var docs      = toDocSet(input.docs);
  var postbrain = !!input.postbrain;
  var conflict  = !!input.conflict;
  var withdrawn = !!input.withdrawn;
  // prehosp is read to preserve the original input contract but is
  // intentionally unreferenced below - see KNOWN FINDING in the header.
  var prehosp   = !!input.prehosp;   // eslint-disable-line no-unused-vars

  // RULE: CMO was withdrawn
  if(withdrawn){
    return {val:'NO',basis:'CMO Rescinded',rationale:'A CMO designation was documented but subsequently reversed or changed back to a full treatment plan during this admission. The exclusion does not apply when CMO was not the final care plan at time of discharge or death.<br><br><span class="rule-tag">VERIFY</span> Review the full order history and physician notes to confirm the rescission and its timing.'};
  }

  // RULE: Post-brain death only
  if(postbrain){
    return {val:'NO',basis:'Post-Brain Death Only',rationale:'CMO was documented only after a formal brain death declaration. The exclusion requires that CMO be established as the active care plan for a living patient during the admission \u2014 not as a procedural documentation step after death is pronounced.'};
  }

  // RULE: Conflicting documentation
  if(conflict && !docs.has('md_order') && !docs.has('md_note')){
    return {val:'NO',basis:'Conflicting Documentation \u2014 No Clear LIP CMO Plan',rationale:'Conflicting documentation is present and there is no explicit physician order or note establishing CMO as the plan. This case requires clinical review.'};
  }

  // RULE: Strongest \u2014 explicit MD order
  if(docs.has('md_order')){
    var ratOrder = 'A physician, APN, or PA issued an explicit comfort measures only order \u2014 the strongest possible basis for this exclusion.<br><br><span class="rule-tag">VERIFY</span> Confirm the order was not subsequently rescinded and that no conflicting full-treatment orders were placed after it.';
    if(conflict) ratOrder += '<br><br><span class="rule-tag">\u26A0 FLAG</span> Conflicting documentation was noted. Review whether the CMO order was the active plan at time of death/discharge.';
    return {val:'YES',basis:'Physician CMO Order',rationale:ratOrder};
  }

  // RULE: MD note with CMO decision
  if(docs.has('md_note')){
    var ratNote = 'A physician progress note documents a goals-of-care discussion with a CMO decision.<br><br><span class="rule-tag">VERIFY</span> The note must document the <em>decision</em> \u2014 not merely that a discussion occurred. Phrases like "discussed goals of care" without an outcome documented are insufficient. Look for language such as "patient/family agreed to comfort measures only," "transitioned to CMO," or equivalent.';
    if(conflict) ratNote += '<br><br><span class="rule-tag">\u26A0 FLAG</span> Conflicting documentation noted. Ensure the CMO decision in the note was the operative plan.';
    return {val:'YES',basis:'Physician Documentation of CMO Decision',rationale:ratNote};
  }

  // RULE: POLST \u2014 needs to check which section
  if(docs.has('polst')){
    return {val:'REVIEW',basis:'POLST Present \u2014 Verify Section',rationale:'A POLST/MOST/MOLST is in the chart. This is a physician order, but you must verify which section is completed.<br><br>\u2713 <strong style="display:inline;">Comfort-Focused Treatment</strong> (or state equivalent) checked \u2192 Exclusion applies.<br>\u2717 <strong style="display:inline;">Full Treatment</strong> checked \u2192 Does NOT qualify.<br>\u2717 <strong style="display:inline;">Limited Interventions</strong> checked \u2192 Does NOT qualify.<br><br><span class="rule-tag">ACTION REQUIRED</span> Open the POLST form, identify which medical intervention option is checked, and rerun this classifier with that information.'};
  }

  // RULE: Hospice without accompanying CMO order/note
  if(docs.has('hospice')){
    return {val:'REVIEW',basis:'Hospice Documentation \u2014 Verify CMO Order',rationale:'Hospice enrollment or referral is documented. This strongly suggests CMO intent but is not sufficient alone.<br><br><span class="rule-tag">ACTION REQUIRED</span> Look for an accompanying physician order or note explicitly establishing CMO. If a physician order or CMO discussion note is also present, rerun with that selection added.<br><br>If only hospice documentation exists and no explicit CMO order or physician CMO note is present \u2192 the exclusion does not apply.'};
  }

  // RULE: Palliative care consult only
  if(docs.has('palliative')){
    return {val:'NO',basis:'Palliative Consult Without Attending Adoption',rationale:'A palliative care consult documented a CMO recommendation or plan. However, a consulting team recommendation does not establish CMO \u2014 the attending of record must adopt the plan via a corresponding order or documentation.<br><br><span class="rule-tag">CHECK</span> Is there an attending or covering physician note that adopts the CMO plan? If yes, rerun selecting "Physician Note \u2014 Discussion."'};
  }

  // RULE: Comfort care orders / DNR / family note / no qualifying doc
  if(docs.has('comfort_only') || docs.has('dnr_only') || docs.has('family_note')){
    var specifics = [];
    if(docs.has('dnr_only')) specifics.push('A DNR/DNI order is present \u2014 code status limitation is not a CMO designation.');
    if(docs.has('comfort_only')) specifics.push('Comfort care or symptom management orders are present \u2014 these are not the same as a CMO plan.');
    if(docs.has('family_note')) specifics.push('A family/care conference note is present \u2014 without a physician order or LIP co-signature, this does not qualify.');
    return {val:'NO',basis:'No Qualifying Documentation',rationale:specifics.join('<br><br>')+'<br><br>None of the selected documentation meets the CMO exclusion criteria. A licensed independent practitioner (MD, DO, APN, or PA) must explicitly designate the patient as Comfort Measures Only via an order or progress note.'};
  }

  // Nothing selected
  return {val:'NO',basis:'No Documentation Selected',rationale:'No CMO-related documentation was selected. If no relevant documentation is present in the chart, the exclusion does not apply.'};
}

// --- guarded CommonJS tail (ADR-0009): require()-able under node:test, no-op in browser ---
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toDocSet, resolveCmo };
}
