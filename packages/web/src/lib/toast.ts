/** Tiny transient toast (bottom-center pill). Reuses a single element; auto-dismisses. */
let el: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, ms = 1600): void {
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  // force reflow so re-triggering the transition restarts it
  void el.offsetWidth;
  el.classList.add('toast--show');
  clearTimeout(timer);
  timer = setTimeout(() => el?.classList.remove('toast--show'), ms);
}
