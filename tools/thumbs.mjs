/**
 * Generate stuntcamp thumbnails for Badgy.
 *
 * stuntcamp auto-captures every listed app, but badgy.tech shows the sign-in card to a
 * signed-out visitor, so the automatic shot never shows the product. This renders the real
 * app against a seeded sample document (dev mock transport, no sign-in required) and writes
 * 1280x800 JPEGs in both colour schemes.
 *
 *   npm run dev                       # in one shell — serves http://localhost:5173
 *   node tools/thumbs.mjs ./out       # in another
 *
 * See https://github.com/kypflug/stuntcamp/blob/main/docs/ADDING-AN-APP.md
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  CFG_TARGET,
  DEFAULT_HOLIDAY_REGION,
  dateKey,
  emptyDoc,
  holidayNameFor,
  meetupKey,
  noteKey,
  patternKey,
  setCell,
} from '../packages/shared/dist/index.js';

const outDir = process.argv[2] ?? '.';
const ORIGIN = process.env.BADGY_ORIGIN ?? 'http://localhost:5173';
const MS_PER_DAY = 86_400_000;

const toISO = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => toISO(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * MS_PER_DAY));
const weekdayOf = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();

const now = new Date();
const today = toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
const monthFirst = `${today.slice(0, 7)}-01`;

let seq = 0;
const stamp = () => [Date.now() + seq++, 0];

const doc = emptyDoc();
setCell(doc, CFG_TARGET, 0.8, stamp());

// Usual week: office Monday–Thursday, remote Friday — a recognisable hybrid pattern that
// keeps the rolling score comfortably inside the green band.
for (const [weekday, status] of [
  [1, 'office'],
  [2, 'office'],
  [3, 'office'],
  [4, 'office'],
  [5, 'remote'],
])
  setCell(doc, patternKey(weekday), status, stamp());

/**
 * A believable history across the trailing BELT window and a few weeks forward: mostly in
 * the office, with a travel trip, a vacation week and a sick day so the score reads like a
 * real person's rather than a flat 100%.
 */
const isHoliday = (date) => holidayNameFor(DEFAULT_HOLIDAY_REGION, date) !== null;
const set = (date, status) => setCell(doc, dateKey(date), status, stamp());

for (let offset = -84; offset <= 28; offset++) {
  const date = addDays(today, offset);
  const weekday = weekdayOf(date);
  if (weekday === 0 || weekday === 6) continue;
  if (isHoliday(date)) continue; // let the holiday region resolve these
  const week = Math.floor((offset + 84) / 7);
  // Friday is normally remote; go in every other week for a five-day week.
  const status = weekday === 5 && week % 2 === 1 ? 'office' : weekday === 5 ? 'remote' : 'office';
  set(date, status);
}

// A vacation week five weeks back, a trip two weeks back, and a recent sick day.
const vacationMonday = addDays(addDays(today, -35), 1 - weekdayOf(addDays(today, -35)));
for (let i = 0; i < 5; i++) set(addDays(vacationMonday, i), 'vacation');

const tripMonday = addDays(addDays(today, -14), 1 - weekdayOf(addDays(today, -14)));
for (let i = 0; i < 3; i++) set(addDays(tripMonday, i), 'travel');

const sickDay = addDays(today, -weekdayOf(today) - 2);
if (weekdayOf(sickDay) >= 1 && weekdayOf(sickDay) <= 5 && !isHoliday(sickDay)) set(sickDay, 'sick');

// A meetup week and two labelled ranges in the captured month.
const meetupWeek = addDays(monthFirst, -weekdayOf(monthFirst) + 14);
setCell(doc, meetupKey(meetupWeek), true, stamp());

const noteStart = addDays(tripMonday, 0);
for (const note of [
  {
    id: 'thumb-trip',
    start: noteStart,
    end: addDays(noteStart, 2),
    label: 'Seattle onsite',
    color: '#2563eb',
  },
  {
    id: 'thumb-launch',
    start: addDays(today, 7),
    end: addDays(today, 11),
    label: 'Launch week',
    color: '#db2777',
  },
])
  setCell(doc, noteKey(note.id), note, stamp());

const serialized = JSON.stringify(doc);

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const errors = [];

/** stuntcamp's own capture job uses 1280x800; DPR 1 keeps file size in line with sibling cards. */
const SCALE = Number(process.env.BADGY_THUMB_SCALE ?? 1);

async function capture(theme, path) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: SCALE,
    colorScheme: theme,
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(
    ({ serialized, theme }) => {
      localStorage.setItem('badgy:doc:dev', serialized);
      localStorage.setItem('badgy:mock-remote', serialized);
      localStorage.setItem('badgy:theme', theme);
      localStorage.setItem('badgy.zoom', '2'); // largest rows — fills the 1280x800 frame
    },
    { serialized, theme },
  );

  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.waitForSelector('.month-day', { timeout: 20_000 });
  await page.waitForTimeout(900);

  // The dev bootstrap labels the session "Dev (local)"; use a neutral name for the shot.
  await page.evaluate(() => {
    const chip = document.querySelector('.rail-account-name');
    if (chip) chip.textContent = 'Ada Lovelace';
  });
  await page.waitForTimeout(300);

  await page.screenshot({ path, type: 'jpeg', quality: 80 });
  await page.close();
  console.log(`wrote ${path}`);
}

await capture('light', `${outDir}/badgy.jpg`);
await capture('dark', `${outDir}/badgy-dark.jpg`);
await browser.close();
console.log('page errors:', errors.length ? errors : 'none');
