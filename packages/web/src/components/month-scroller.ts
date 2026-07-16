import { type MonthRef, shiftMonth } from '@rto/shared';
import { html, type PropertyValues } from 'lit';
import { RtoElement } from './base.js';
import type { MonthCalendar } from './month-calendar.js';
import './month-calendar.js';

const MOTION_MS = 280;
const WHEEL_THRESHOLD = 36;
const WHEEL_IDLE_MS = 180;
const TOUCH_DISTANCE = 48;
const TOUCH_TIME_MS = 220;
const TOUCH_VERTICAL_RATIO = 1.25;
const VIEWPORT_BOTTOM_BLEED = 3;

interface TouchGesture {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  eligible: boolean;
  claimed: boolean;
}

export interface MonthChangeDetail extends MonthRef {
  direction: -1 | 0 | 1;
}

export class MonthScroller extends RtoElement {
  static override properties = {
    year: { type: Number },
    month0: { type: Number },
  };

  year = 0;
  month0 = 0;

  private animating = false;
  private queuedDirection: -1 | 0 | 1 = 0;
  private queuedTarget: MonthRef | null = null;
  private animations: Animation[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private observedPanel: HTMLElement | null = null;
  private wheelAccum = 0;
  private wheelLatched = false;
  private wheelIdleTimer: ReturnType<typeof setTimeout> | undefined;
  private touch: TouchGesture | null = null;
  private restoreViewportFocus = false;

  private readonly touchCapture = {
    capture: true,
    handleEvent: (event: Event): void => this.onTouchEvent(event as PointerEvent),
  };

  override firstUpdated(): void {
    void this.positionAtCenter();
  }

  override updated(changed: PropertyValues<this>): void {
    const externallyChanged =
      (changed.has('year') && changed.get('year') !== undefined) ||
      (changed.has('month0') && changed.get('month0') !== undefined);
    if (!this.animating && externallyChanged) void this.positionAtCenter();
  }

  override disconnectedCallback(): void {
    clearTimeout(this.wheelIdleTimer);
    this.resizeObserver?.disconnect();
    this.observedPanel = null;
    this.cancelAnimations();
    for (const calendar of this.calendars()) calendar.cancelInteraction();
    super.disconnectedCallback();
  }

  async navigate(delta: number): Promise<void> {
    const direction = Math.sign(delta) as -1 | 0 | 1;
    if (direction === 0) return;
    if (this.animating) {
      this.queuedTarget = null;
      this.queuedDirection = direction;
      return;
    }

    this.animating = true;
    this.queuedDirection = 0;
    this.dismissInteractions();
    try {
      await this.animateTo(direction);
    } finally {
      this.animating = false;
      this.flushQueue();
    }
  }

  async jumpTo(year: number, month0: number): Promise<void> {
    const distance = (year - this.year) * 12 + month0 - this.month0;
    if (distance === 0) return;
    if (Math.abs(distance) === 1) {
      await this.navigate(distance);
      return;
    }
    if (this.animating) {
      this.queuedDirection = 0;
      this.queuedTarget = { year, month0 };
      return;
    }

    this.animating = true;
    this.dismissInteractions();
    try {
      this.year = year;
      this.month0 = month0;
      await this.updateComplete;
      await this.positionAtCenter();
      this.emitMonthChange(0);
    } finally {
      this.animating = false;
      this.flushQueue();
    }
  }

  private async animateTo(direction: -1 | 1): Promise<void> {
    await this.updateComplete;
    await this.waitForCalendars();
    const viewport = this.viewport();
    const track = this.track();
    const current = this.panel(0);
    const target = this.panel(direction);
    if (!viewport || !track || !current || !target) return;

    const fromY = -current.offsetTop;
    const toY = -target.offsetTop;
    const fromHeight = current.offsetHeight + VIEWPORT_BOTTOM_BLEED;
    const toHeight = target.offsetHeight + VIEWPORT_BOTTOM_BLEED;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.resizeObserver?.disconnect();
    this.observedPanel = null;
    this.cancelAnimations();
    track.style.transform = `translateY(${fromY}px)`;
    viewport.style.height = `${fromHeight}px`;

    if (!reduceMotion) {
      const options: KeyframeAnimationOptions = {
        duration: MOTION_MS,
        easing: 'cubic-bezier(.2, .8, .2, 1)',
        fill: 'forwards',
      };
      const trackAnimation = track.animate(
        [{ transform: `translateY(${fromY}px)` }, { transform: `translateY(${toY}px)` }],
        options,
      );
      const heightAnimation = viewport.animate(
        [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }],
        options,
      );
      this.animations = [trackAnimation, heightAnimation];
      await Promise.all(
        this.animations.map((animation) => animation.finished.catch(() => undefined)),
      );
    }

    track.style.transform = `translateY(${toY}px)`;
    viewport.style.height = `${toHeight}px`;
    this.cancelAnimations();
    if (!this.isConnected) return;

    const next = shiftMonth(this.year, this.month0, direction);
    this.year = next.year;
    this.month0 = next.month0;
    await this.updateComplete;
    await this.positionAtCenter();
    this.emitMonthChange(direction);
  }

  private flushQueue(): void {
    const target = this.queuedTarget;
    const direction = this.queuedDirection;
    this.queuedTarget = null;
    this.queuedDirection = 0;
    if (target) void this.jumpTo(target.year, target.month0);
    else if (direction !== 0) void this.navigate(direction);
  }

  private emitMonthChange(direction: -1 | 0 | 1): void {
    this.dispatchEvent(
      new CustomEvent<MonthChangeDetail>('month-change', {
        detail: { year: this.year, month0: this.month0, direction },
        bubbles: true,
      }),
    );
  }

  private async positionAtCenter(): Promise<void> {
    await this.waitForCalendars();
    const current = this.panel(0);
    if (!current) return;
    this.syncCurrentPosition();
    this.observeCurrent(current);
  }

  private syncCurrentPosition(): void {
    const viewport = this.viewport();
    const track = this.track();
    const current = this.panel(0);
    if (!viewport || !track || !current) return;
    track.style.transform = `translateY(${-current.offsetTop}px)`;
    viewport.style.height = `${current.offsetHeight + VIEWPORT_BOTTOM_BLEED}px`;
    viewport.classList.add('month-viewport--ready');
    if (this.restoreViewportFocus) {
      viewport.focus({ preventScroll: true });
      this.restoreViewportFocus = false;
    }
  }

  private observeCurrent(panel: HTMLElement): void {
    this.resizeObserver ??= new ResizeObserver(() => {
      if (!this.animating) this.syncCurrentPosition();
    });
    if (this.observedPanel === panel) return;
    this.resizeObserver.disconnect();
    this.observedPanel = panel;
    this.resizeObserver.observe(panel);
  }

  private async waitForCalendars(): Promise<void> {
    await this.updateComplete;
    await Promise.all(this.calendars().map((calendar) => calendar.updateComplete));
  }

  private dismissInteractions(): void {
    const current = this.panel(0);
    this.restoreViewportFocus =
      current != null &&
      document.activeElement instanceof Node &&
      current.contains(document.activeElement);
    for (const calendar of this.calendars()) calendar.cancelInteraction();
  }

  private hasActiveInteraction(): boolean {
    return this.calendars().some((calendar) => calendar.hasActiveInteraction);
  }

  private cancelAnimations(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (this.hasActiveInteraction()) return;
    event.preventDefault();
    this.scheduleWheelReset();
    if (this.wheelLatched || this.animating) return;

    const viewportHeight = this.viewport()?.clientHeight ?? window.innerHeight;
    const scale =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? viewportHeight
          : 1;
    this.wheelAccum += event.deltaY * scale;
    if (Math.abs(this.wheelAccum) < WHEEL_THRESHOLD) return;

    this.wheelLatched = true;
    const direction = this.wheelAccum > 0 ? 1 : -1;
    this.wheelAccum = 0;
    void this.navigate(direction);
  };

  private scheduleWheelReset(): void {
    clearTimeout(this.wheelIdleTimer);
    this.wheelIdleTimer = setTimeout(() => {
      this.wheelAccum = 0;
      this.wheelLatched = false;
    }, WHEEL_IDLE_MS);
  }

  private onTouchEvent(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    if (event.type === 'pointerdown') {
      if (!event.isPrimary || !this.panel(0)?.contains(event.target as Node)) return;
      this.touch = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTime: performance.now(),
        eligible: true,
        claimed: false,
      };
      if (event.isTrusted) this.viewport()?.setPointerCapture(event.pointerId);
      return;
    }

    const touch = this.touch;
    if (!touch || touch.pointerId !== event.pointerId) return;
    if (event.type === 'pointermove') {
      if (touch.claimed) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const elapsed = performance.now() - touch.startTime;
      if (elapsed > TOUCH_TIME_MS) {
        touch.eligible = false;
        return;
      }
      const dx = event.clientX - touch.startX;
      const dy = event.clientY - touch.startY;
      if (
        touch.eligible &&
        Math.abs(dy) >= TOUCH_DISTANCE &&
        Math.abs(dy) > Math.abs(dx) * TOUCH_VERTICAL_RATIO
      ) {
        touch.claimed = true;
        this.dismissInteractions();
        event.preventDefault();
        event.stopPropagation();
        void this.navigate(dy < 0 ? 1 : -1);
      }
      return;
    }

    if (event.type === 'pointercancel') this.currentCalendar()?.cancelInteraction();
    if (touch.claimed) {
      event.preventDefault();
      event.stopPropagation();
    }
    const viewport = this.viewport();
    if (event.isTrusted && viewport?.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
    this.touch = null;
  }

  private viewport(): HTMLElement | null {
    return this.querySelector<HTMLElement>('.month-viewport');
  }

  private track(): HTMLElement | null {
    return this.querySelector<HTMLElement>('.month-track');
  }

  private panel(offset: -1 | 0 | 1): HTMLElement | null {
    return this.querySelector<HTMLElement>(`.month-panel[data-offset="${offset}"]`);
  }

  private calendars(): MonthCalendar[] {
    return [...this.querySelectorAll<MonthCalendar>('month-calendar')];
  }

  private currentCalendar(): MonthCalendar | null {
    return this.panel(0)?.querySelector<MonthCalendar>('month-calendar') ?? null;
  }

  override render() {
    const months = [-1, 0, 1].map((offset) => ({
      offset: offset as -1 | 0 | 1,
      ...shiftMonth(this.year, this.month0, offset),
    }));
    return html`
      <div
        class="month-viewport"
        tabindex="-1"
        role="group"
        aria-label="Calendar months"
        @wheel=${this.onWheel}
        @pointerdown=${this.touchCapture}
        @pointermove=${this.touchCapture}
        @pointerup=${this.touchCapture}
        @pointercancel=${this.touchCapture}
      >
        <div class="month-track">
          ${months.map(
            (month) => html`<section
              class="month-panel ${month.offset === 0 ? 'month-panel--current' : ''}"
              data-offset=${month.offset}
              ?inert=${month.offset !== 0}
              aria-hidden=${month.offset === 0 ? 'false' : 'true'}
            >
              <month-calendar .year=${month.year} .month0=${month.month0}></month-calendar>
            </section>`,
          )}
        </div>
      </div>
    `;
  }
}

customElements.define('month-scroller', MonthScroller);
