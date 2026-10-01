export function pointInPoly(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  const n = poly.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2]!;
    const yi = poly[i * 2 + 1]!;
    const xj = poly[j * 2]!;
    const yj = poly[j * 2 + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface Closest {
  x: number;
  y: number;
  d: number;
  nx: number;
  ny: number;
}

function closestOnPoly(x: number, y: number, poly: number[]): Closest {
  const n = poly.length >> 1;
  let best: Closest = { x, y, d: Infinity, nx: 1, ny: 0 };
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = poly[j * 2]!;
    const ay = poly[j * 2 + 1]!;
    const cx = poly[i * 2]!;
    const cy = poly[i * 2 + 1]!;
    const ex = cx - ax;
    const ey = cy - ay;
    const len2 = ex * ex + ey * ey || 1;
    let t = ((x - ax) * ex + (y - ay) * ey) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + ex * t;
    const py = ay + ey * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) {
      const el = Math.sqrt(len2);
      let nx = -ey / el;
      let ny = ex / el;
      if (!pointInPoly(px + nx * 1e-4, py + ny * 1e-4, poly)) {
        nx = -nx;
        ny = -ny;
      }
      best = { x: px, y: py, d, nx, ny };
    }
  }
  return best;
}

export function signedDistToPoly(x: number, y: number, poly: number[]): number {
  const c = closestOnPoly(x, y, poly);
  return pointInPoly(x, y, poly) ? c.d : -c.d;
}

export function pushInside(x: number, y: number, poly: number[], margin: number): [number, number] {
  const c = closestOnPoly(x, y, poly);
  const d = pointInPoly(x, y, poly) ? c.d : -c.d;
  if (d >= margin) return [x, y];
  if (d > 1e-3) {
    const k = margin / d;
    return [c.x + (x - c.x) * k, c.y + (y - c.y) * k];
  }
  return [c.x + c.nx * margin, c.y + c.ny * margin];
}
