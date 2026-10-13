/** Shared helpers for drawing public/data/tracks.json centrelines as SVG (used by the exploration and lap-validity slides). */

/** One entry of public/data/tracks.json (metres; heading in radians, y up). */
export interface Track { name: string; centerline: number[][]; half_width: number[]; heading: number[] }
export type Pt = [number, number];
export interface Fit { to: (x: number, y: number) => Pt; scale: number }

export const mod = (i: number, n: number) => ((i % n) + n) % n;
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const fmt = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
export const polyline = (pts: Pt[], close = false) => "M " + pts.map(fmt).join(" L ") + (close ? " Z" : "");

/** Rounded triangle used until tracks.json arrives (or if it never does). */
export function fallbackTrack(): Track {
  const n = 240, centerline: number[][] = [], heading: number[] = [], half_width: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI, r = 1 + 0.18 * Math.cos(3 * t);
    centerline.push([70 * r * Math.cos(t), 40 * r * Math.sin(t)]);
    half_width.push(9);
  }
  for (let i = 0; i < n; i++) {
    const a = centerline[i], b = centerline[(i + 1) % n];
    heading.push(Math.atan2(b[1] - a[1], b[0] - a[0]));
  }
  return { name: "fallback", centerline, heading, half_width };
}

/** Map metres into a w x h viewBox, preserving aspect, y up on screen; `rot` (radians) is applied first. */
export function fitTo(pts: Pt[], w: number, h: number, pad: number, rot = 0): Fit {
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const r = (x: number, y: number): Pt => [x * cr - y * sr, x * sr + y * cr];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { const [x, y] = r(p[0], p[1]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const scale = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { to: (x, y) => { const [rx, ry] = r(x, y); return [w / 2 + (rx - cx) * scale, h / 2 - (ry - cy) * scale]; }, scale };
}

/** Rotation that lays the points' principal axis horizontal, so a hairpin fills a wide box. */
export function levelRotation(pts: Pt[]): number {
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  return -0.5 * Math.atan2(2 * sxy, sxx - syy);
}

/** Left and right track edges (metres) at the given centreline indices. */
export function edges(track: Track, idx: number[]) {
  const left: Pt[] = [], right: Pt[] = [];
  for (const i of idx) {
    const [x, y] = track.centerline[i], h = track.heading[i], hw = track.half_width[i];
    left.push([x - Math.sin(h) * hw, y + Math.cos(h) * hw]);
    right.push([x + Math.sin(h) * hw, y - Math.cos(h) * hw]);
  }
  return { left, right };
}

/** Closed-loop length from the centreline segments. */
export function trackLength(track: Track): number {
  const c = track.centerline, n = c.length;
  let L = 0;
  for (let i = 0; i < n; i++) { const a = c[i], b = c[(i + 1) % n]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return L;
}

/** Centreline point and heading at arc length s (metres, wrapping). The generator resamples points evenly, so index ∝ s. */
export function sampleAt(track: Track, s: number, L = trackLength(track)): { x: number; y: number; heading: number } {
  const n = track.centerline.length, f = mod(s / L, 1) * n, i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, u = f - Math.floor(f);
  const a = track.centerline[i0], b = track.centerline[i1];
  const h0 = track.heading[i0], h1 = track.heading[i1];
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, heading: h0 + wrapAngle(h1 - h0) * u };
}

/** Asphalt band plus both edges for a whole closed track, in viewBox coordinates. */
export function bandMarkup(track: Track, fit: Fit): string {
  const idx = track.centerline.map((_, i) => i);
  const { left, right } = edges(track, idx);
  const L = left.map((p) => fit.to(p[0], p[1])), R = right.map((p) => fit.to(p[0], p[1]));
  return `<path d="${polyline(L, true)} ${polyline([...R].reverse(), true)}" fill="#2b2f35" fill-rule="evenodd"/>` +
    `<path d="${polyline(L, true)}" fill="none" stroke="#ddd" stroke-width="2.5"/>` +
    `<path d="${polyline(R, true)}" fill="none" stroke="#ddd" stroke-width="2.5"/>`;
}
