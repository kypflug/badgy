import { addDays, EXCEL_STATUS_MAP, type Status } from '@rto/shared';
import { strFromU8, unzipSync } from 'fflate';

/** Excel serial date → ISO (epoch 1899-12-30; 25569 days to the Unix epoch). */
function serialToISO(serial: number): string {
  return new Date(Math.round((serial - 25569) * 86_400_000)).toISOString().slice(0, 10);
}

const DAY_COLUMNS = ['B', 'C', 'D', 'E', 'F']; // Mon–Fri

/**
 * Parse a Hybrid Attendance Modeler `.xlsx` (Tracker sheet: col A = week Monday,
 * cols B–F = Mon–Fri status) and return the *non-default* days mapped to the v2 taxonomy.
 * Office/Planned days are skipped (office is the default), keeping the import sparse.
 */
export function parseXlsx(buf: ArrayBuffer): { date: string; status: Status }[] {
  const files = unzipSync(new Uint8Array(buf));
  const parser = new DOMParser();

  const shared: string[] = [];
  const ss = files['xl/sharedStrings.xml'];
  if (ss) {
    const doc = parser.parseFromString(strFromU8(ss), 'application/xml');
    for (const si of Array.from(doc.getElementsByTagName('si'))) shared.push(si.textContent ?? '');
  }

  const sheet = files['xl/worksheets/sheet1.xml'];
  if (!sheet) return [];
  const doc = parser.parseFromString(strFromU8(sheet), 'application/xml');

  const cells = new Map<string, string | number>();
  for (const c of Array.from(doc.getElementsByTagName('c'))) {
    const ref = c.getAttribute('r');
    const value = c.getElementsByTagName('v')[0]?.textContent;
    if (!ref || value == null) continue;
    cells.set(ref, c.getAttribute('t') === 's' ? (shared[Number(value)] ?? '') : Number(value));
  }

  const out: { date: string; status: Status }[] = [];
  for (let row = 5; row <= 400; row++) {
    const a = cells.get(`A${row}`);
    if (typeof a !== 'number' || !Number.isFinite(a)) continue;
    const weekStart = serialToISO(a);
    DAY_COLUMNS.forEach((col, i) => {
      const raw = cells.get(`${col}${row}`);
      if (typeof raw === 'string') {
        const mapped = EXCEL_STATUS_MAP[raw];
        if (mapped && mapped !== 'office')
          out.push({ date: addDays(weekStart, i), status: mapped });
      }
    });
  }
  return out;
}
