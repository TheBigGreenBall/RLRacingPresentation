// Track geometry for the 3D scene: arc-length sampling of a 400-point closed centerline plus the ribbon,
// boundary lines, wall boxes and the start/finish checker. Mirrors rlracing/tracks/{generator,walls}.py.
import * as THREE from "three";

export const WALL = { length: 4.0, thickness: 0.5, height: 1.0, spacing: 3.2 };

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export class TrackData {
  constructor(json) {
    this.name = json.name;
    this.n = json.centerline.length;
    this.L = json.length;
    this.c = json.centerline; // [[x, y], ...], counter-clockwise, index 0 = start/finish
    this.hw = json.half_width;
    // central-difference tangents (the generator's convention) -> unit tangent + left normal per point
    this.tan = [];
    this.left = [];
    for (let i = 0; i < this.n; i++) {
      const p = this.c[(i + 1) % this.n];
      const m = this.c[(i - 1 + this.n) % this.n];
      let tx = p[0] - m[0], ty = p[1] - m[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      this.tan.push([tx, ty]);
      this.left.push([-ty, tx]);
    }
  }

  /** Sample the centerline at arc length s (wrapped). Returns world x, y, heading, half-width, left normal. */
  sample(s) {
    const L = this.L, n = this.n;
    let f = ((s % L) + L) % L / L * n;
    const i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, t = f - Math.floor(f);
    const a = this.c[i0], b = this.c[i1];
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    const hw = this.hw[i0] + (this.hw[i1] - this.hw[i0]) * t;
    const ta = this.tan[i0], tb = this.tan[i1];
    let tx = ta[0] + (tb[0] - ta[0]) * t, ty = ta[1] + (tb[1] - ta[1]) * t;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    return { x, y, heading: Math.atan2(ty, tx), hw, tx, ty, nx: -ty, ny: tx };
  }

  /** Signed curvature at s (1/m), positive for a left turn. */
  curvature(s, ds = 2.0) {
    const a = this.sample(s - ds), b = this.sample(s + ds);
    return wrapAngle(b.heading - a.heading) / (2 * ds);
  }

  /** Project a world point onto the centerline: returns {s, lateral, heading, hw}. Coarse nearest-sample then refine. */
  project(x, y) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      const dx = this.c[i][0] - x, dy = this.c[i][1] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    const s0 = best * this.L / this.n;
    const p = this.sample(s0);
    const rx = x - p.x, ry = y - p.y;
    const along = rx * p.tx + ry * p.ty;
    const q = this.sample(s0 + along);
    const lateral = (x - q.x) * q.nx + (y - q.y) * q.ny;
    return { s: ((s0 + along) % this.L + this.L) % this.L, lateral, heading: q.heading, hw: q.hw };
  }

  bbox() {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [x, y] of this.c) {
      minx = Math.min(minx, x); maxx = Math.max(maxx, x);
      miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
    return { minx, miny, maxx, maxy, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w: maxx - minx, h: maxy - miny };
  }
}

function rgba(c) {
  return new THREE.Color(c[0], c[1], c[2]);
}

/** Build the asphalt ribbon, boundary lines, walls and start line. Returns a Group. */
export function buildTrack(track, opts = {}) {
  const g = new THREE.Group();
  g.name = `track:${track.name}`;
  const n = track.n;

  // --- ribbon between the two boundaries ---
  const pos = new Float32Array((n + 1) * 2 * 3);
  const uv = new Float32Array((n + 1) * 2 * 2);
  for (let i = 0; i <= n; i++) {
    const k = i % n;
    const [x, y] = track.c[k];
    const [nx, ny] = track.left[k];
    const hw = track.hw[k];
    pos.set([x + nx * hw, y + ny * hw, 0.0], i * 6);
    pos.set([x - nx * hw, y - ny * hw, 0.0], i * 6 + 3);
    uv.set([i / 8, 0, i / 8, 1], i * 4);
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c2 = a + 2, d = a + 3;
    idx.push(a, b, d, a, d, c2);
  }
  const ribbon = new THREE.BufferGeometry();
  ribbon.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  ribbon.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  ribbon.setIndex(idx);
  ribbon.computeVertexNormals();
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.95, metalness: 0.0 });
  const ribbonMesh = new THREE.Mesh(ribbon, asphalt);
  ribbonMesh.receiveShadow = true;
  g.add(ribbonMesh);

  // --- boundary lines + dashed centerline ---
  const mkLoop = (pts, color, z) => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new THREE.Vector3(x, y, z)));
    return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color }));
  };
  const leftPts = track.c.map((p, i) => [p[0] + track.left[i][0] * track.hw[i], p[1] + track.left[i][1] * track.hw[i]]);
  const rightPts = track.c.map((p, i) => [p[0] - track.left[i][0] * track.hw[i], p[1] - track.left[i][1] * track.hw[i]]);
  g.add(mkLoop(leftPts, 0xdddddd, 0.02));
  g.add(mkLoop(rightPts, 0xdddddd, 0.02));
  const centerGeo = new THREE.BufferGeometry().setFromPoints(track.c.map(([x, y]) => new THREE.Vector3(x, y, 0.02)));
  const center = new THREE.LineLoop(centerGeo, new THREE.LineDashedMaterial({ color: 0x8899aa, dashSize: 2.0, gapSize: 2.0 }));
  center.computeLineDistances();
  center.name = "centerline";
  g.add(center);

  // --- walls: boxes every 3.2 m along each boundary, inner face on the boundary line ---
  const wallGeo = new THREE.BoxGeometry(WALL.length, WALL.thickness, WALL.height);
  const wallMat = new THREE.MeshStandardMaterial({ color: rgba(opts.wallRgba || [0.9, 0.9, 0.92]), roughness: 0.7 });
  const placements = [];
  for (const [pts, outwardSign] of [[leftPts, +1], [rightPts, -1]]) {
    // arc-length resample the boundary polyline
    const seg = [], cum = [0];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      seg.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
      cum.push(cum[i] + seg[i]);
    }
    const len = cum[n];
    const count = Math.min(300, Math.floor(len / WALL.spacing));
    for (let k = 0; k < count; k++) {
      const s = k * WALL.spacing + WALL.length / 2;
      let i = 0;
      while (i < n - 1 && cum[i + 1] < s) i++;
      const t = seg[i] > 0 ? (s - cum[i]) / seg[i] : 0;
      const a = pts[i], b = pts[(i + 1) % n];
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const tx = (b[0] - a[0]) / (seg[i] || 1), ty = (b[1] - a[1]) / (seg[i] || 1);
      const ox = -ty * outwardSign, oy = tx * outwardSign; // left normal for the left side, right normal for the right
      placements.push({ x: x + ox * WALL.thickness / 2, y: y + oy * WALL.thickness / 2, yaw: Math.atan2(ty, tx) });
    }
  }
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, placements.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1);
  placements.forEach((p, i) => {
    q.setFromAxisAngle(zAxis, p.yaw);
    m.compose(new THREE.Vector3(p.x, p.y, WALL.height / 2), q, one);
    walls.setMatrixAt(i, m);
  });
  walls.castShadow = true;
  walls.name = "walls";
  g.add(walls);

  // --- start/finish checker across the track at index 0 ---
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const cell = 32;
  for (let j = 0; j < canvas.height / cell; j++)
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = (i + j) % 2 ? "#0d0d0d" : "#ffffff";
      ctx.fillRect(i * cell, j * cell, cell, cell);
    }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const hw0 = track.hw[0];
  const start = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2 * hw0), new THREE.MeshBasicMaterial({ map: tex }));
  start.position.set(track.c[0][0], track.c[0][1], 0.03);
  start.rotation.z = Math.atan2(track.tan[0][1], track.tan[0][0]);
  start.name = "startline";
  g.add(start);

  g.userData.wallCount = placements.length;
  return g;
}
