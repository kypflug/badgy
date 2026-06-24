/**
 * Hybrid Logical Clock — wall-clock time with a tiebreak counter, so every locally
 * generated stamp is strictly monotonic and stays ahead of any observed (remote)
 * stamp, even under mild cross-device clock skew. Used to order CRDT writes.
 */

/** [physicalMs, counter] */
export type Stamp = [number, number];

export function compareStamp(a: Stamp, b: Stamp): number {
  return a[0] - b[0] || a[1] - b[1];
}

export function stampMax(a: Stamp, b: Stamp): Stamp {
  return compareStamp(a, b) >= 0 ? a : b;
}

export class Hlc {
  private last: Stamp = [0, 0];

  constructor(private readonly now: () => number = Date.now) {}

  /** A fresh stamp for a local write — strictly greater than every prior local/observed stamp. */
  tick(): Stamp {
    const phys = this.now();
    this.last = phys > this.last[0] ? [phys, 0] : [this.last[0], this.last[1] + 1];
    return this.last;
  }

  /** Fold in a stamp seen from another device so future local stamps causally follow it. */
  observe(s: Stamp): void {
    if (compareStamp(s, this.last) > 0) this.last = s;
  }

  /** Current high-water mark (for tests/diagnostics). */
  peek(): Stamp {
    return this.last;
  }
}
