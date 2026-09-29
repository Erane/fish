import { randomSeed } from "../core/index.ts";

export function valueNoise(seed: number): (x: number, y: number) => number {
  const rand = randomSeed(seed);
  const lat = new Float32Array(256 * 256);
  for (let i = 0; i < lat.length; i++) lat[i] = rand();
  const at = (ix: number, iy: number) =>
    lat[(((ix % 256) + 256) % 256) * 256 + (((iy % 256) + 256) % 256)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const tx = smooth(x - ix);
    const ty = smooth(y - iy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

export function noiseData(size: number): Uint8Array {
  const d = new Uint8Array(size * size * 4);
  for (let ch = 0; ch < 4; ch++) {
    const grid = 8 << (ch & 1);
    const lat = new Float32Array(grid * grid);
    for (let i = 0; i < lat.length; i++) lat[i] = Math.random();
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let v = 0;
        let amp = 0.5;
        let tot = 0;
        for (let o = 0; o < 3; o++) {
          const g = grid << o;
          const fx = (x / size) * g;
          const fy = (y / size) * g;
          const ix = Math.floor(fx);
          const iy = Math.floor(fy);
          const tx = fx - ix;
          const ty = fy - iy;
          const at = (a: number, b: number) =>
            lat[(((a % g) * 7 + (b % g) * 13 + o * 31) % lat.length)!];
          const sx = tx * tx * (3 - 2 * tx);
          const sy = ty * ty * (3 - 2 * ty);
          const a = at(ix, iy);
          const b = at(ix + 1, iy);
          const c = at(ix, iy + 1);
          const e = at(ix + 1, iy + 1);
          v += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy);
          tot += amp;
          amp *= 0.5;
        }
        d[(y * size + x) * 4 + ch] = (v / tot) * 255;
      }
  }
  return d;
}

export function waveData(size: number): Uint8Array {
  const waves: [number, number, number, number][] = [];
  const gx = new Float32Array(size * size);
  const gy = new Float32Array(size * size);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const k = 2 + Math.random() * 10;
    const kx = Math.round(Math.cos(a) * k);
    const ky = Math.round(Math.sin(a) * k);
    if (!kx && !ky) continue;
    waves.push([kx, ky, 1 / Math.pow(Math.hypot(kx, ky), 1.25), Math.random() * Math.PI * 2]);
  }
  let max = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const [kx, ky, amp, ph] of waves) {
        const c = Math.cos(((kx * x + ky * y) / size) * Math.PI * 2 + ph) * amp;
        dx += c * kx;
        dy += c * ky;
      }
      const i = y * size + x;
      gx[i] = dx;
      gy[i] = dy;
      max = Math.max(max, Math.abs(dx), Math.abs(dy));
    }
  const d = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    d[i * 4] = 127.5 + (gx[i]! / max) * 127;
    d[i * 4 + 1] = 127.5 + (gy[i]! / max) * 127;
    d[i * 4 + 3] = 255;
  }
  return d;
}
