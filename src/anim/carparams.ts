import { animate, createTimeline, stagger, type JSAnimation } from "animejs";
import type { SlideAnim } from "./types";

/** public/data/car.json, the parts this slide uses. */
interface CarData { defaults: Record<string, number | string>; ranges: Record<string, [number, number]> }
type Group = "geometry" | "mass" | "drive" | "tyres";
interface ParamSpec { key: string; group: Group; fmt: (v: number) => string }

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

/** "The car and its 13 parameters": the 3D car in the iframe morphs through every parameter while its range-bar row highlights. */
export function mountCarParams(root: HTMLElement): SlideAnim {
  const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement | SVGElement>(sel));
  const rowsEl = root.querySelector(".cp-rows") as HTMLElement;
  const frame = root.querySelector("iframe.scene") as HTMLIFrameElement | null;

  let data: CarData = FALLBACK;
  let live: Live = numericDefaults(data);
  let rows = renderRows(rowsEl, data);
  let seq: ReturnType<typeof createTimeline> | null = null;
  const loops: JSAnimation[] = [];
  let running = false;
  let lastPost = 0;

  /** Tell the 3D scene the current shape; softer springs and more mass sag the body, the steer sweep turns the wheels. */
  function post(activeKey: string | null, force: boolean) {
    const now = performance.now();
    if (!force && now - lastPost < 16) return;
    lastPost = now;
    const dStiff = norm(data, "suspension_stiffness", Number(data.defaults.suspension_stiffness)) - norm(data, "suspension_stiffness", live.suspension_stiffness);
    const dMass = norm(data, "chassis_mass", live.chassis_mass) - norm(data, "chassis_mass", Number(data.defaults.chassis_mass));
    const sag = Math.max(-0.12, Math.min(0.12, 0.10 * dStiff + 0.04 * dMass));
    frame?.contentWindow?.postMessage({
      type: "rlr",
      car: {
        params: { ...live }, sag,
        steer: activeKey === "max_steer_deg" ? (live.max_steer_deg * Math.PI) / 180 : 0,
        driveFront: live.drive_split, torque: norm(data, "max_motor_torque", live.max_motor_torque),
      },
    }, "*");
  }

  function render(force = false) {
    let activeKey: string | null = null;
    for (const p of PARAMS) {
      const r = rows.get(p.key)!, v = live[p.key];
      r.dot.style.left = `${(norm(data, p.key, v) * 100).toFixed(2)}%`;
      r.val.textContent = p.fmt(v);
      const [lo, hi] = data.ranges[p.key];
      const active = Math.abs(v - Number(data.defaults[p.key])) > 1e-3 * (hi - lo);
      r.row.classList.toggle("active", active);
      if (active) activeKey = p.key;
    }
    post(activeKey, force);
  }

  function buildSeq() {
    seq?.pause();
    seq = createTimeline({ autoplay: false, loop: true, defaults: { ease: "inOutSine" } });
    let t = 0;
    for (const p of PARAMS) {
      const [lo, hi] = data.ranges[p.key], def = Number(data.defaults[p.key]);
      seq.add(live, { [p.key]: [{ to: lo, duration: 900 }, { to: hi, duration: 1100 }, { to: def, duration: 800 }], onUpdate: () => render() }, t);
      t += 2800 + 300;
    }
  }

  function applyData(d: CarData) {
    data = d;
    live = numericDefaults(d);
    rows = renderRows(rowsEl, d);
    buildSeq();
    render(true);
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
    .add(q(".cp-scene, .cp-card"), { opacity: [0, 1], translateY: [40, 0], scale: [0.96, 1], delay: stagger(180) }, 300)
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
    render(true);
  }

  return {
    play() { entry.restart(); start(); },
    stop() { entry.pause(); stop(); },
  };
}
