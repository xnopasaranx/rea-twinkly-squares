import { LayoutCoord } from '../types';

function divisors(n: number): number[] {
  const result: number[] = [];
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) {
      result.push(i);
      if (i !== n / i) result.push(n / i);
    }
  }
  return result.sort((a, b) => a - b);
}

/**
 * Estimate the raster grid dimensions of a layout by trying every divisor pair
 * of the total LED count and scoring how closely the coordinates map one LED
 * per cell.
 */
export function estimateGridDimensions(
  coords: LayoutCoord[],
  ledCount: number
): { width: number; height: number; score: number } | null {
  if (!coords.length || !ledCount || ledCount !== coords.length) return null;

  const xs = coords.map((c) => c.x);
  const ys = coords.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const widths = divisors(ledCount);
  let best: { width: number; height: number; score: number } | null = null;

  for (const w of widths) {
    const h = ledCount / w;
    const cells = new Map<number, number>();
    const scaleX = maxX === minX ? 0 : (w - 1) / (maxX - minX);
    const scaleY = maxY === minY ? 0 : (h - 1) / (maxY - minY);

    for (const c of coords) {
      const gx = scaleX ? Math.round((c.x - minX) * scaleX) : 0;
      const gy = scaleY ? Math.round((c.y - minY) * scaleY) : 0;
      const key = gy * w + gx;
      cells.set(key, (cells.get(key) || 0) + 1);
    }

    // Penalise cells with more or fewer than one LED heavily.
    let penalty = 0;
    for (const count of cells.values()) {
      penalty += (count - 1) * (count - 1);
    }
    // Also penalise empty cells.
    const empty = w * h - cells.size;
    penalty += empty;

    const score = penalty;
    if (!best || score < best.score) {
      best = { width: w, height: h, score };
    }
  }

  return best;
}
