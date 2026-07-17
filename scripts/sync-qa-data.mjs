// Nightly sync: pull Q&A entries + tags from the Apps Script/Sheets backend
// and write data/qa.json. Run by .github/workflows/sync-qa-data.yml.
//
// Refuses to write the file (exits non-zero) on fetch failure, empty entries,
// or a PHI scrubber hit, so the last committed data/qa.json is never
// clobbered with bad data. See docs/adr/0004-static-json-pipeline-and-scoped-bot-commit.md.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzTuYLUTw9dCPPjCzts68c_xGO1NCkaG3Sy2XpNRr8wQtcLLkeZeHWh5zE21M0Q1hurIg/exec';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'qa.json');

const PROXIMITY_WINDOW = 30;

// Patterns 3/4 (dates) only count as a hit when a label from this set is
// within PROXIMITY_WINDOW characters — a bare date (spec citation, in-scenario
// timestamp) is not PHI-suggestive on its own.
const PHI_LABELS = [
  'DOB',
  'D\\.O\\.B\\.?',
  'Date of Birth',
  'Birthdate',
  'Birth Date',
  'Born',
  'Admitted',
  'Admission Date',
  'Discharged',
  'Discharge Date',
  'Discharged as of',
];
const LABEL_RE = new RegExp('\\b(' + PHI_LABELS.join('|') + ')\\b', 'gi');
const SLASH_DATE_RE = /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](19|20)\d{2}\b/g;
const ISO_DATE_RE = /\b(19|20)\d{2}-\d{2}-\d{2}\b/g;

const LABELED_ID_RE = /\b(MRN|SSN|DOB|Date\s+of\s+Birth|Patient\s+Name|Acct\.?\s*#|Account\s*#)\s*[:#-]?\s*\S/i;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;
const LONG_DIGIT_RE = /\b\d{7,10}\b/;

function findMatches(re, text) {
  const matches = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text))) matches.push(m.index);
  return matches;
}

function hasLabelProximateDate(text) {
  const labelHits = findMatches(LABEL_RE, text);
  if (!labelHits.length) return false;
  const dateHits = [...findMatches(SLASH_DATE_RE, text), ...findMatches(ISO_DATE_RE, text)];
  return dateHits.some((d) => labelHits.some((l) => Math.abs(d - l) <= PROXIMITY_WINDOW));
}

function scanEntry(entry) {
  const fields = [entry.question, entry.answer, entry.source, (entry.tags || []).join(' ')];
  for (const field of fields) {
    if (!field) continue;
    if (LABELED_ID_RE.test(field)) return 'labeled-identifier';
    if (SSN_RE.test(field)) return 'ssn-shaped';
    if (LONG_DIGIT_RE.test(field)) return 'long-digit-run';
    if (hasLabelProximateDate(field)) return 'label-proximate-date';
  }
  return null;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function main() {
  let qaData;
  let tagData;
  try {
    [qaData, tagData] = await Promise.all([
      fetchJSON(SCRIPT_URL),
      fetchJSON(SCRIPT_URL + '?type=tags'),
    ]);
  } catch (err) {
    console.error('Fetch failed, refusing to write data/qa.json:', err.message);
    process.exitCode = 1;
    return;
  }

  const entries = qaData.entries || [];
  const tags = tagData.tags || [];

  if (entries.length === 0) {
    console.error('Fetched 0 entries, refusing to write data/qa.json.');
    process.exitCode = 1;
    return;
  }

  for (const entry of entries) {
    const hit = scanEntry(entry);
    if (hit) {
      console.error(`PHI scrubber tripped on entry "${entry.id}" (${hit}). Refusing to write data/qa.json.`);
      process.exitCode = 1;
      return;
    }
  }

  const payload = { entries, tags, generatedAt: new Date().toISOString() };
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${entries.length} entries and ${tags.length} tags to data/qa.json`);
}

await main();
