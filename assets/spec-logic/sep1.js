/* SEP-1 spec logic -- extracted from sep1-tool.html (T-08).
   Global-shim pattern matching assets/site.js: plain top-level declarations,
   loaded via a synchronous <script src> before the page's own inline script,
   plus a guarded CommonJS tail so the same file loads under node:test.
   See docs/adr/0009-*.md for why this pattern (not ES modules) was chosen.

   Extraction is behavior-neutral: resolveTimeZero() is a 1:1 transcription of
   build()'s former inline Time-Zero logic (sep1-tool.html lines 742, 745-771
   as of T-08), including pre-existing quirks that are intentionally NOT fixed
   here -- tzChecks[].text embeds raw, unescaped event labels (no esc() call),
   the SIRS/OD pairing loop takes the first array match within the 6-hour
   window rather than the nearest match, and the OD-before-SIRS fallback
   branch's label is applied unconditionally, not derived from actual
   chronological order. See CHANGELOG/ARCHITECTURE for T-08. */

const DETECT_RULES = [
  { type:'sirs', re:/(?:^|[\s,;:=\-–])(?:t|temp|temperature|tmax|fever|febrile|hypotherm)[\s:=]?\d|fever|\btemp\b|tmax\b|febrile|hypotherm|chills|\b(?:hr|heart.?rate|pulse|tachycard)[\s:=]?\d|\btachycard|\b(?:rr|resp.?rate|respirat|breathe|tachypnea)[\s:=]?\d|\btachypnea|\b(?:wbc|white.?blood|leukocyt|leukopenia|bandemia|band[s]?\s*[=%]?)[\s:=]?\d|\bleukocyt|\bleukopenia|\bbandemia/i },
  { type:'od',   re:/\b(?:lac(?:tate?)?|lactic.?acid|serum.?lac|initial.?lac|lac\s*=|lac\s*\d|lact\s*\d|lactic\s*\d|elevated.?lac|high.?lac)|\bcreatinine\b|\bcr\s*[=:]\s*\d|\baki\b|acute.?kidney|renal.?fail|\bplatelet|\bplt\s*[=:]\s*\d|\bthrombocytop|\bbilirubin\b|\bbili\s*[=:]\s*\d|\bhyperbiliru|\bams\b|altered.?mental|mental.?status|acute.?encephalopathy|\bencephalopathy\b|\bconfusion\b|\bdelirium\b|new.?onset.?confus|\bgcs\s*[=:]\s*\d|\bglasgow|\bmap\s*[=:]\s*\d|\bmap\s*(?:of\s*)?\d{2}|\bpersistent.?hypotens|\bhypotens(?:ion)?\b|organ.?dysfunct|dysfunct/i },
  { type:'bundle', re:/blood.?cult|blood\s*cx|bcx?\s*(?:x|×|drawn|\d)|bc\s*(?:x|×)\s*\d|cultures?\s*drawn|cultures?\s*sent|peripheral.?cult|central.?cult|micro(?:biology)?\s*cult|vancomycin|vanc\b|cefepime\b|ceftriaxone|rocephin|ceftazidime|meropenem|merrem|imipenem|ertapenem|ciprofloxacin|\bcipro\b|azithromycin|\bazithro\b|levofloxacin|\blevo\b|\bflagyl\b|metronidazole|ampicillin|amp.?sulbact|unasyn|pip.?tazo|piperacillin|zosyn\b|linezolid|daptomycin|tigecycline|broad.?spectrum|abx\s*(?:start|admin|given|ordered)|antibiotic\s*(?:start|admin|given|ordered)|antibiotics?\s*(?:start|admin|given|ivpb)|iv\s*antibiotic|\d+\s*(?:ml|cc|mg).?kg|bolus\b|normal.?saline|ns\s*bolus|\bns\s*\d|\blr\s*bolus|\blactated.?ringer|crystalloid|ivf\s*bolus|\bfluid\s*resus|repeat.?lac|recheck.?lac|re-?check.?lac|follow.?up.?lac|second.?lac|lactate\s*repeat|lactate\s*rechecked/i },
  { type:'shock', re:/vasopressor|norepinephrine|levophed\b|\bnorepi\b|vasopressin|pitressin|dopamine\b|dobutamine\b|phenylephrine|neosynephrine|\bneo\s*(?:drip|started|infusion)|epinephrine\s*(?:drip|infusion|started)|epi\s*(?:drip|infusion)|pressor\s*(?:started|initiated|required|needed)|pressors?\s*(?:on|started)|septic.?shock/i },
];
const ORDERED_FLAG   = /ordered\b|order\s*placed|placed\s*order/i;
const COMPLETED_FLAG = /drawn|sent|collected|started|administered|given|infusing|hanging|ivpb|iv\s*started|completed/i;

function detectType(label) {
  for (const r of DETECT_RULES) { if (r.re.test(label)) return r.type; }
  return 'other';
}
function detectOrderVsCompleted(label, type) {
  if (type !== 'bundle') return null;
  if (ORDERED_FLAG.test(label) && !COMPLETED_FLAG.test(label)) return 'ordered — verify completion time for bundle calculation';
  return null;
}

function t2m(t){const [h,m]=t.split(':').map(Number);return h*60+m;}
function m2t(m){const d=Math.floor(m/1440),r=((m%1440)+1440)%1440,h=Math.floor(r/60),mn=r%60;return `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}${d>0?` (+${d}d)`:''}`;}

function resolveTimeZero(validEvents, manualTz, manualSrc) {
  let tzMins,tzTime,tzSource,tzChecks=[],allSirsForDisplay=[];
  const sirsEvs=validEvents.filter(e=>e.type==='sirs'), odEvs=validEvents.filter(e=>e.type==='od');

  if (manualTz) {
    tzMins=t2m(manualTz); tzTime=manualTz; tzSource=manualSrc||'Manual entry';
    tzChecks=[{ok:true,text:`Time Zero manually set to ${manualTz}`},{ok:!!manualSrc,text:manualSrc?`Source: ${manualSrc}`:'No source selected — document your rationale'}];
    allSirsForDisplay=sirsEvs;
  } else {
    allSirsForDisplay=sirsEvs;
    let paired=null,pairedOd=null;
    for (const s of sirsEvs) { const od=odEvs.find(o=>Math.abs(o.mins-s.mins)<=360); if (od){paired=s;pairedOd=od;break;} }
    if (paired) {
      tzMins=paired.mins; tzTime=paired.time; tzSource='Auto-suggested';
      const gap=Math.abs(pairedOd.mins-paired.mins), gapStr=gap<60?`${gap} min`:`${Math.floor(gap/60)}h ${gap%60}m`;
      tzChecks=[{ok:true,text:`SIRS criteria — "${paired.label}" at ${paired.time}`},{ok:true,text:`Organ dysfunction — "${pairedOd.label}" at ${pairedOd.time}`},{ok:true,text:`Events ${gapStr} apart — within 6-hour pairing window`},{ok:false,text:`Confirm alignment with provider documentation before submitting`}];
    } else if (odEvs.length&&sirsEvs.length) {
      const eo=odEvs[0],fs=sirsEvs[0],gap=Math.abs(fs.mins-eo.mins),gapStr=gap<60?`${gap} min`:`${Math.floor(gap/60)}h ${gap%60}m`;
      tzMins=eo.mins; tzTime=eo.time; tzSource='Auto-suggested (OD before SIRS)';
      tzChecks=[{ok:true,text:`Organ dysfunction — "${eo.label}" at ${eo.time}`},{ok:true,text:`SIRS criteria — "${fs.label}" at ${fs.time}`},{ok:true,text:`Events ${gapStr} apart — within pairing window`},{ok:false,text:`OD preceded SIRS — verify provider documentation`},{ok:false,text:`Confirm alignment with provider documentation before submitting`}];
    } else if (odEvs.length) {
      tzMins=odEvs[0].mins; tzTime=odEvs[0].time; tzSource='Fallback — organ dysfunction only (no SIRS entered)';
      tzChecks=[{ok:false,text:`No SIRS criteria found — add SIRS events or enter Time Zero manually`},{ok:false,text:`Using earliest organ dysfunction: "${odEvs[0].label}" at ${odEvs[0].time}`}];
    } else {
      tzMins=validEvents[0].mins; tzTime=validEvents[0].time; tzSource='Fallback — insufficient data';
      tzChecks=[{ok:false,text:`Could not identify SIRS or organ dysfunction events`},{ok:false,text:`Add SIRS and organ dysfunction events, or enter Time Zero manually`}];
    }
  }
  const d3=tzMins+180, d6=tzMins+360;
  return { tzMins, tzTime, tzSource, tzChecks, allSirsForDisplay, d3, d6 };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DETECT_RULES, ORDERED_FLAG, COMPLETED_FLAG,
    detectType, detectOrderVsCompleted, t2m, m2t, resolveTimeZero,
  };
}
