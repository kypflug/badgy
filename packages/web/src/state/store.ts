import {
  blankYear,
  computeWeeks,
  type DayKey,
  SEED_2026,
  type Status,
  totals,
  type Week,
  type WeekComputed,
  type YearData,
} from '@rto/shared';
import { type AppData, LocalPersistence, type Persistence } from './persistence.js';

const DEFAULT_TARGET = 0.8;
const SEED_YEAR = 2026;

/**
 * Reactive app store. Emits a `change` event whenever data mutates; components
 * subscribe and re-render. Persistence is debounced. Backend is swappable
 * (local now, API in P3).
 */
export class Store extends EventTarget {
  private data: AppData = {
    years: {},
    settings: { activeYear: SEED_YEAR, targetBelt: DEFAULT_TARGET },
  };
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private persistence: Persistence = new LocalPersistence()) {
    super();
  }

  async init(): Promise<void> {
    const loaded = await this.persistence.load();
    this.data = loaded ?? {
      years: { [SEED_YEAR]: structuredClone(SEED_2026) },
      settings: { activeYear: SEED_YEAR, targetBelt: DEFAULT_TARGET },
    };
    this.emit();
  }

  get settings(): AppData['settings'] {
    return this.data.settings;
  }

  get activeYear(): number {
    return this.data.settings.activeYear;
  }

  get years(): number[] {
    return Object.keys(this.data.years)
      .map(Number)
      .sort((a, b) => a - b);
  }

  year(y = this.activeYear): YearData {
    let yd = this.data.years[y];
    if (!yd) {
      yd = blankYear(y);
      this.data.years[y] = yd;
    }
    return yd;
  }

  computed(y = this.activeYear): WeekComputed[] {
    return computeWeeks(this.year(y).weeks);
  }

  totals(y = this.activeYear): { officeDays: number; dtoDays: number } {
    return totals(this.year(y).weeks);
  }

  setActiveYear(y: number): void {
    this.year(y);
    this.data.settings.activeYear = y;
    this.changed();
  }

  addYear(y: number): void {
    this.year(y);
    this.changed();
  }

  /** Reset the active year to its default: the template for 2026, blank otherwise. */
  resetActiveYear(): void {
    this.data.years[this.activeYear] =
      this.activeYear === SEED_YEAR ? structuredClone(SEED_2026) : blankYear(this.activeYear);
    this.changed();
  }

  setStatus(weekStart: string, day: DayKey, status: Status): void {
    const w = this.findWeek(weekStart);
    if (w) {
      w.days[day] = status;
      this.changed();
    }
  }

  setWholeWeek(weekStart: string, status: Status): void {
    const w = this.findWeek(weekStart);
    if (w) {
      for (const d of ['mon', 'tue', 'wed', 'thu', 'fri'] as DayKey[]) w.days[d] = status;
      this.changed();
    }
  }

  toggleMeetup(weekStart: string): void {
    const w = this.findWeek(weekStart);
    if (w) {
      w.meetup = !w.meetup;
      this.changed();
    }
  }

  setTarget(target: number): void {
    this.data.settings.targetBelt = Math.min(1, Math.max(0, target));
    this.changed();
  }

  private findWeek(weekStart: string): Week | undefined {
    return this.year().weeks.find((w) => w.weekStart === weekStart);
  }

  private changed(): void {
    this.emit();
    this.scheduleSave();
  }

  private emit(): void {
    this.dispatchEvent(new Event('change'));
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.persistence.save(this.data), 300);
  }
}

export const store = new Store();
