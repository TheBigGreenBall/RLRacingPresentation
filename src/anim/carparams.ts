import { animate, createTimeline, stagger, type JSAnimation } from "animejs";
import type { SlideAnim } from "./types";

/** public/data/car.json, the parts this slide uses. */
interface CarData { defaults: Record<string, number | string>; ranges: Record<string, [number, number]> }
type Group = "geometry" | "mass" | "drive" | "tyres";
interface ParamSpec { key: string; group: Group; fmt: (v: number) => string }

const S = 100; // px per metre in the diagram
const thousands = (v: number) => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Display order matches the rules table; value formats fit the 130 px value column. */
const PARAMS: ParamSpec[] = [
  { key: "wheelbase", group: "geometry", fmt: (v) => `${v.toFixed(2)} m` },
  { key: "track_width", group: "geometry", fmt: (v) => `${v.toFixed(2)} m` },
  { key: "wheel_radius", group: "geometry", fmt: (v) => `${v.toFixed(2)} m` },
  { key: "wheel_width", group: "geometry", fmt: (v) => `${v.toFixed(2)} m` },
  { key: "chassis_mass", group: "mass", fmt: (v) => `${Math.round(v)} kg` },
  { key: "com_height", group: "mass", fmt: (v) => `${v.toFixed(2)} m` },
  { key: "suspension_stiffness", group: "mass", fmt: (v) => `${thousands(v)} N/m` },
  { key: "suspension_damping", group: "mass", fmt: (v) => `${thousands(v)} N·s/m` },
  { key: "max_steer_deg", group: "drive", fmt: (v) => `${Math.round(v)}°` },
  { key: "steer_rate", group: "drive", fmt: (v) => `${v.toFixed(1)} rad/s` },
  { key: "max_motor_torque", group: "drive", fmt: (v) => `${Math.round(v)} N·m` },
  { key: "drive_split", group: "drive", fmt: (v) => (v < 0.5 ? `${v.toFixed(2)} RWD` : `${v.toFixed(2)} FWD`) },
  { key: "tire_friction", group: "tyres", fmt: (v) => `μ ${v.toFixed(2)}` },
];

/** Same numbers as public/data/car.json (rlracing/cars/config.py PARAM_RANGES), so the slide works offline. */
const FALLBACK: CarData = {
  defaults: { wheelbase: 2.4, track_width: 1.5, wheel_radius: 0.32, wheel_width: 0.22, chassis_mass: 450, com_height: 0.42, suspension_stiffness: 35000, suspension_damping: 3000, max_steer_deg: 30, steer_rate: 6, max_motor_torque: 900, drive_split: 0, tire_friction: 1.1 },
  ranges: { wheelbase: [1.6, 3.2], track_width: [1.1, 2.0], wheel_radius: [0.22, 0.42], wheel_width: [0.15, 0.35], chassis_mass: [250, 900], com_height: [0.3, 0.7], suspension_stiffness: [10000, 80000], suspension_damping: [500, 8000], max_steer_deg: [15, 40], steer_rate: [2, 12], max_motor_torque: [300, 1600], drive_split: [0, 1], tire_friction: [0.7, 1.4] },
};

type Live = Record<string, number>;
const numericDefaults = (d: CarData): Live => Object.fromEntries(PARAMS.map((p) => [p.key, Number(d.defaults[p.key])]));
const norm = (d: CarData, key: string, v: number) => { const [lo, hi] = d.ranges[key]; return (v - lo) / (hi - lo); };

// ------------------------------------------------------------------ diagram

const MONO = `font-family="var(--rlr-mono)" font-size="17"`;
const f = (v: number) => v.toFixed(1);

/** Horizontal dimension line with end ticks and a label underneath. */
function hdim(x1: number, x2: number, y: number, label: string): string {
  return `<g stroke="var(--rlr-text-muted)" stroke-width="2"><line x1="${f(x1)}" y1="${y}" x2="${f(x2)}" y2="${y}"/><line x1="${f(x1)}" y1="${y - 8}" x2="${f(x1)}" y2="${y + 8}"/><line x1="${f(x2)}" y1="${y - 8}" x2="${f(x2)}" y2="${y + 8}"/></g>` +
    `<text x="${f((x1 + x2) / 2)}" y="${y + 24}" ${MONO} fill="var(--rlr-text)" text-anchor="middle">${label}</text>`;
}
/** Vertical dimension line; the label is rotated and sits to the right (side = 1) or left (side = -1). */
function vdim(x: number, y1: number, y2: number, label: string, side = 1): string {
  const lx = x + side * 20, cy = (y1 + y2) / 2;
  return `<g stroke="var(--rlr-text-muted)" stroke-width="2"><line x1="${x}" y1="${f(y1)}" x2="${x}" y2="${f(y2)}"/><line x1="${x - 8}" y1="${f(y1)}" x2="${x + 8}" y2="${f(y1)}"/><line x1="${x - 8}" y1="${f(y2)}" x2="${x + 8}" y2="${f(y2)}"/></g>` +
    `<text transform="translate(${f(lx)} ${f(cy)}) rotate(-90)" ${MONO} fill="var(--rlr-text)" text-anchor="middle" dominant-baseline="${side > 0 ? "hanging" : "auto"}">${label}</text>`;
}
/** Zigzag spring between two points on a vertical line. */
function spring(x: number, y1: number, y2: number): string {
  const n = 6, pts: string[] = [`${x},${f(y1)}`];
  for (let i = 1; i < n; i++) pts.push(`${x + (i % 2 ? 9 : -9)},${f(y1 + ((y2 - y1) * i) / n)}`);
  pts.push(`${x},${f(y2)}`);
  return `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--rlr-warn)" stroke-width="3" stroke-linejoin="round"/>`;
}

function drawCar(g: SVGGElement, d: CarData, p: Live) {
  const wb = p.wheelbase, tw = p.track_width, wr = p.wheel_radius, ww = p.wheel_width;
  const halfL = 0.607 * wb * S, halfW = 0.607 * tw * S;      // chassis box, 2.912 x 1.82 m at defaults
  const cabL = 0.267 * wb * S, cabW = 0.461 * tw * S, cabX = -0.097 * wb * S;
  const torque = 24 + 70 * norm(d, "max_motor_torque", p.max_motor_torque);
  const out: string[] = [];

  // ---- top view, car pointing right, centre (270, 150)
  const cx = 250, cy = 200;
  const wheel = (hx: number, hy: number, steer: number) =>
    `<g transform="translate(${f(hx)} ${f(hy)}) rotate(${f(steer)})"><rect x="${f(-wr * S)}" y="${f(-ww * S / 2)}" width="${f(2 * wr * S)}" height="${f(ww * S)}" rx="4" fill="#111" stroke="#3a3f46" stroke-width="2"/></g>`;
  const arrow = (hx: number, hy: number, share: number) => share < 0.03 ? "" :
    `<g opacity="${f(0.25 + 0.75 * share)}" stroke="var(--rlr-accent)" fill="var(--rlr-accent)" stroke-width="4" stroke-linecap="round"><line x1="${f(hx)}" y1="${f(hy)}" x2="${f(hx + torque * share)}" y2="${f(hy)}"/><polygon points="${f(hx + torque * share + 12)},${f(hy)} ${f(hx + torque * share - 2)},${f(hy - 7)} ${f(hx + torque * share - 2)},${f(hy + 7)}"/></g>`;
  const fx = cx + (wb / 2) * S, rx = cx - (wb / 2) * S, ly = cy - (tw / 2) * S, ry = cy + (tw / 2) * S;
  out.push(`<rect x="${f(cx - halfL)}" y="${f(cy - halfW)}" width="${f(2 * halfL)}" height="${f(2 * halfW)}" rx="10" fill="#c22a1e" stroke="#ff6b5e" stroke-width="2" opacity="0.92"/>`);
  out.push(wheel(rx, ly, 0), wheel(rx, ry, 0), wheel(fx, ly, -p.max_steer_deg), wheel(fx, ry, -p.max_steer_deg));
  out.push(`<rect x="${f(cx + cabX - cabL)}" y="${f(cy - cabW)}" width="${f(2 * cabL)}" height="${f(2 * cabW)}" rx="8" fill="#262a30"/>`);
  out.push(`<text x="${f(cx + cabX)}" y="${f(cy + 6)}" ${MONO} fill="var(--rlr-text)" text-anchor="middle">${Math.round(p.chassis_mass)} kg</text>`);
  out.push(arrow(rx + wr * S + 6, ly - ww * S / 2 - 12, 1 - p.drive_split), arrow(rx + wr * S + 6, ry + ww * S / 2 + 12, 1 - p.drive_split));
  out.push(arrow(fx + wr * S + 6, ly - ww * S / 2 - 12, p.drive_split), arrow(fx + wr * S + 6, ry + ww * S / 2 + 12, p.drive_split));
  out.push(hdim(rx, fx, cy + Math.max(halfW, (tw / 2) * S + (ww / 2) * S) + 34, `wheelbase ${wb.toFixed(2)} m`));
  out.push(vdim(cx - Math.max(halfL, (wb / 2) * S + wr * S) - 30, ly, ry, `track_width ${tw.toFixed(2)} m`, -1));
  out.push(vdim(fx + wr * S + 18, ly - ww * S / 2, ly + ww * S / 2, `wheel_width ${ww.toFixed(2)} m`, 1));
  out.push(`<text x="${f(fx + 10)}" y="${f(cy - halfW - 16)}" ${MONO} fill="var(--rlr-text-muted)" text-anchor="middle">steer ±${Math.round(p.max_steer_deg)}°</text>`);
  out.push(`<text x="${f(rx - 10)}" y="${f(cy + halfW + 22)}" ${MONO} fill="var(--rlr-accent)" text-anchor="middle">${Math.round(p.max_motor_torque)} N·m</text>`);

  // ---- side view, ground at y = 330, centre x = 690
  const G = 330, sx = 690;
  const sag = Math.max(-0.12, Math.min(0.12, 0.10 * (norm(d, "suspension_stiffness", Number(d.defaults.suspension_stiffness)) - norm(d, "suspension_stiffness", p.suspension_stiffness)) + 0.04 * (norm(d, "chassis_mass", p.chassis_mass) - norm(d, "chassis_mass", Number(d.defaults.chassis_mass)))));
  const comZ = p.com_height - sag, axleY = G - wr * S;
  const bodyBottom = G - (comZ - 0.15) * S, bodyTop = G - (comZ + 0.15) * S;
  const sfx = sx + (wb / 2) * S, srx = sx - (wb / 2) * S;
  out.push(`<line x1="470" y1="${G}" x2="930" y2="${G}" stroke="#ddd" stroke-width="3"/>`);
  for (const hx of [srx, sfx]) out.push(spring(hx, axleY, bodyBottom));
  out.push(`<rect x="${f(sx - halfL)}" y="${f(bodyTop)}" width="${f(2 * halfL)}" height="${f(0.30 * S)}" rx="8" fill="#c22a1e" stroke="#ff6b5e" stroke-width="2" opacity="0.92"/>`);
  out.push(`<rect x="${f(sx + cabX - cabL)}" y="${f(G - (comZ + 0.31 + 0.16) * S)}" width="${f(2 * cabL)}" height="${f(0.32 * S)}" rx="8" fill="#262a30"/>`);
  for (const hx of [srx, sfx]) out.push(`<circle cx="${f(hx)}" cy="${f(axleY)}" r="${f(wr * S)}" fill="#111" stroke="#3a3f46" stroke-width="2"/><circle cx="${f(hx)}" cy="${f(axleY)}" r="${f(wr * S * 0.5)}" fill="#9aa3ad"/>`);
  const comY = G - comZ * S;
  out.push(`<circle cx="${sx}" cy="${f(comY)}" r="8" fill="#fff" stroke="var(--rlr-bg)" stroke-width="2"/><line x1="${sx - 14}" y1="${f(comY)}" x2="${sx + 14}" y2="${f(comY)}" stroke="var(--rlr-bg)" stroke-width="2"/><line x1="${sx}" y1="${f(comY - 14)}" x2="${sx}" y2="${f(comY + 14)}" stroke="var(--rlr-bg)" stroke-width="2"/>`);
  out.push(vdim(sx + Math.max(halfL, (wb / 2) * S + wr * S) + 26, G, comY, `com_height ${p.com_height.toFixed(2)} m`, 1));
  out.push(vdim(srx - wr * S - 18, G, axleY, `wheel_radius ${wr.toFixed(2)} m`, -1));
  out.push(`<text x="${f(sx + 40)}" y="${G + 28}" ${MONO} fill="var(--rlr-warn)" text-anchor="middle">springs ${thousands(p.suspension_stiffness)} N/m · ${thousands(p.suspension_damping)} N·s/m</text>`);
  out.push(`<text x="${f(sx + 40)}" y="${G + 52}" ${MONO} fill="var(--rlr-text-muted)" text-anchor="middle">travel ±0.12 m per wheel</text>`);
  g.innerHTML = out.join("");
}

// ------------------------------------------------------------------ rows

function renderRows(container: HTMLElement, d: CarData): Map<string, { dot: HTMLElement; val: HTMLElement; row: HTMLElement }> {
  container.innerHTML = PARAMS.map((p) =>
    `<div class="cp-row" data-key="${p.key}"><span class="cp-sw ${p.group}"></span><span class="cp-name mono">${p.key}</span>` +
    `<span class="cp-bar"><span class="cp-dot ${p.group}"></span></span><span class="cp-val mono"></span></div>`).join("");
  const rows = new Map<string, { dot: HTMLElement; val: HTMLElement; row: HTMLElement }>();
  container.querySelectorAll<HTMLElement>(".cp-row").forEach((row) => {
    rows.set(row.dataset.key!, { row, dot: row.querySelector(".cp-dot") as HTMLElement, val: row.querySelector(".cp-val") as HTMLElement });
  });
  void d;
  return rows;
}

// ------------------------------------------------------------------ mount

/** "The 13 car parameters": top/side car diagram that morphs through every parameter while its range-bar row highlights. */
export function mountCarParams(root: HTMLElement): SlideAnim {
  const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement | SVGElement>(sel));
  const svgEl = root.querySelector(".cp-car") as SVGSVGElement;
  const rowsEl = root.querySelector(".cp-rows") as HTMLElement;
  svgEl.innerHTML =
    `<text x="270" y="22" ${MONO} fill="var(--rlr-text-muted)" text-anchor="middle">top view · front is to the right</text>` +
    `<text x="730" y="22" ${MONO} fill="var(--rlr-text-muted)" text-anchor="middle">side view</text>` +
    `<g class="cp-live"></g>`;
  const liveG = svgEl.querySelector(".cp-live") as SVGGElement;

  let data: CarData = FALLBACK;
  let live: Live = numericDefaults(data);
  let rows = renderRows(rowsEl, data);
  let seq: ReturnType<typeof createTimeline> | null = null;
  const loops: JSAnimation[] = [];
  let running = false;

  function render() {
    drawCar(liveG, data, live);
    for (const p of PARAMS) {
      const r = rows.get(p.key)!, v = live[p.key];
      r.dot.style.left = `${(norm(data, p.key, v) * 100).toFixed(2)}%`;
      r.val.textContent = p.fmt(v);
      const [lo, hi] = data.ranges[p.key];
      r.row.classList.toggle("active", Math.abs(v - Number(data.defaults[p.key])) > 1e-3 * (hi - lo));
    }
  }

  function buildSeq() {
    seq?.pause();
    seq = createTimeline({ autoplay: false, loop: true, defaults: { ease: "inOutSine" } });
    let t = 0;
    for (const p of PARAMS) {
      const [lo, hi] = data.ranges[p.key], def = Number(data.defaults[p.key]);
      seq.add(live, { [p.key]: [{ to: lo, duration: 900 }, { to: hi, duration: 1100 }, { to: def, duration: 800 }], onUpdate: render }, t);
      t += 2800 + 300;
    }
  }

  function applyData(d: CarData) {
    data = d;
    live = numericDefaults(d);
    rows = renderRows(rowsEl, d);
    buildSeq();
    render();
    if (running) start();
  }
  applyData(FALLBACK);

  fetch("data/car.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((json: CarData) => {
      const fresh = { defaults: json.defaults, ranges: json.ranges };
      if (JSON.stringify(fresh) !== JSON.stringify(FALLBACK)) applyData(fresh);
    })
    .catch(() => { /* keep the built-in copy */ });

  const entry = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  entry.add(q(".a-title, .a-sub"), { opacity: [0, 1], translateY: [24, 0], delay: stagger(120) }, 0)
    .add(q(".cp-card"), { opacity: [0, 1], translateY: [40, 0], scale: [0.96, 1], delay: stagger(180) }, 300)
    .add(q(".cp-tile"), { opacity: [0, 1], translateY: [40, 0], delay: stagger(160) }, 900)
    .add(q(".a-footer"), { opacity: [0, 1] }, 1600);

  function start() {
    stop();
    running = true;
    seq?.restart();
    loops.push(animate(q(".cp-spin-car"), { rotate: [0, 360], duration: 3200, ease: "linear", loop: true }));
    loops.push(animate(q(".cp-roll-car"), { rotate: [-7, 7], duration: 1800, ease: "inOutSine", loop: true, alternate: true }));
  }
  function stop() {
    running = false;
    seq?.pause();
    for (const a of loops) a.pause();
    loops.length = 0;
    for (const p of PARAMS) live[p.key] = Number(data.defaults[p.key]);
    render();
  }

  return {
    play() { entry.restart(); start(); },
    stop() { entry.pause(); stop(); },
  };
}
