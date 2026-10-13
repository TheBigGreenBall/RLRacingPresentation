import { animate, createTimeline, stagger, type JSAnimation } from "animejs";
import type { SlideAnim } from "./types";

const T_TOTAL = 12.5;        // animation seconds per loop
const PLAY = 8;              // control steps shown per animation second: the 50 Hz loop slowed about six times
const N_STEPS = T_TOTAL * PLAY;
const DT = 0.02;             // control period, s
const MAX_STEER_DEG = 30, STEER_RATE = 6, MAX_TORQUE = 900;   // car.json defaults (steer_rate in rad/s)
const MAX_STEER = (MAX_STEER_DEG * Math.PI) / 180;
const CELLS = 12;            // control steps visible on the tick strip

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sgn = (v: number, d = 2) => `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(d)}`;
const f1 = (v: number) => v.toFixed(1);
/** Deterministic per-step jitter in [0, 1): the jerky phase looks the same on every loop. */
const jitter = (k: number) => { let x = (k * 1103515245 + 12345) >>> 0; x = (x ^ (x >>> 13)) * 2654435761 >>> 0; return (x >>> 8) / 16777216; };

// ------------------------------------------------------------------ the action script (pure function of the step index)

/** Raw policy output as [fromStep, steer, throttle] segments: a network's output jumps between steps, so the servo lag shows. */
const SEGMENTS: [number, number, number][] = [
  [0, 0, 0.2], [10, 0.8, 0.6], [24, -1.25, 1.3], [44, 0, -0.7], [62, 0, 0.4], [76, 1.0, 0.3], [90, 0, 0.2],
];

function rawAction(k: number): [number, number] {
  let i = 0;
  while (i < SEGMENTS.length - 1 && k >= SEGMENTS[i + 1][0]) i++;
  let [, steer, thr] = SEGMENTS[i];
  if (k >= 62 && k < 76) { steer += 0.3 * (jitter(k) - 0.5); thr += 0.1 * (jitter(k + 1000) - 0.5); }   // a jittery policy around straight ahead
  return [steer, thr];
}

interface Frame {
  k: number; tSim: number; sub: number;
  raw: [number, number]; act: [number, number]; clipped: [boolean, boolean];
  cmdRad: number; wheelRad: number; lag: number;
}

/** Everything the slide shows at animation time t. The servo is integrated from step 0 so restarts are exact. */
function frameAt(t: number): Frame {
  const k = clamp(Math.floor(PLAY * t), 0, N_STEPS - 1);
  const sub = clamp(Math.floor((PLAY * t - k) * 4), 0, 3);
  const maxStep = STEER_RATE * DT;
  let wheel = 0;
  for (let i = 0; i <= k; i++) {
    const cmd = clamp(rawAction(i)[0], -1, 1) * MAX_STEER;
    wheel += clamp(cmd - wheel, -maxStep, maxStep);
  }
  const raw = rawAction(k);
  const act: [number, number] = [clamp(raw[0], -1, 1), clamp(raw[1], -1, 1)];
  const cmdRad = act[0] * MAX_STEER;
  return {
    k, tSim: k * DT, sub, raw, act,
    clipped: [Math.abs(raw[0]) > 1, Math.abs(raw[1]) > 1],
    cmdRad, wheelRad: wheel, lag: Math.ceil(Math.abs(cmdRad - wheel) / maxStep - 1e-6),
  };
}

// ------------------------------------------------------------------ mount

/** "Timing and actions": a scripted 50 Hz action sequence drives the parked 3D car (steer servo, tyre glow, wheel spin) while bars, a steer dial and a tick strip show the scalars. */
export function mountActions(root: HTMLElement): SlideAnim {
  const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement | SVGElement>(sel));
  const frame = root.querySelector("iframe.scene") as HTMLIFrameElement | null;
  const rows = [0, 1].map((i) => ({
    bar: root.querySelector(`.ta-row[data-i="${i}"] .ta-bar`) as HTMLElement,
    fill: root.querySelector(`.ta-row[data-i="${i}"] .ta-fill`) as HTMLElement,
    ghost: root.querySelector(`.ta-row[data-i="${i}"] .ta-ghost`) as HTMLElement,
    val: root.querySelector(`.ta-row[data-i="${i}"] .ta-val`) as HTMLElement,
    sub: root.querySelector(`.ta-sub[data-i="${i}"]`) as HTMLElement,
  }));
  const dial = root.querySelector(".ta-dial") as SVGSVGElement;
  const dialRead = root.querySelector(".ta-dial-read") as HTMLElement;
  const strip = root.querySelector(".ta-strip") as SVGSVGElement;
  const stripRead = root.querySelector(".ta-strip-read") as HTMLElement;
  const loops: JSAnimation[] = [];
  const state = { t: 0 };
  let lastPost = 0;

  // ---- static parts of the dial: ±30° half dial, + is left (positive yaw about z)
  const CX = 280, CY = 172, R = 136, SWEEP = 70 / MAX_STEER_DEG;   // screen degrees per steering degree
  const pt = (deg: number, r: number): [number, number] => { const a = (deg * SWEEP * Math.PI) / 180; return [CX - r * Math.sin(a), CY - r * Math.cos(a)]; };
  const P = (p: [number, number]) => `${f1(p[0])} ${f1(p[1])}`;
  const arc = (d0: number, d1: number, r: number) => `M ${P(pt(d0, r))} A ${r} ${r} 0 0 ${d1 > d0 ? 0 : 1} ${P(pt(d1, r))}`;
  {
    const ticks = [-30, -20, -10, 0, 10, 20, 30].map((d) => `<line x1="${P(pt(d, R)).replace(" ", '" y1="')}" x2="${P(pt(d, R - (d % 10 === 0 ? 14 : 8))).replace(" ", '" y2="')}" stroke="#9aa7b6" stroke-width="2"/>`).join("");
    dial.innerHTML =
      `<path d="${arc(-30, 30, R)}" fill="none" stroke="#5a6472" stroke-width="3"/>` + ticks +
      `<text x="${f1(pt(30, R + 8)[0])}" y="${f1(pt(30, R + 8)[1] + 22)}" text-anchor="end" font-family="var(--rlr-mono)" font-size="17" fill="var(--rlr-text-muted)">+30° left</text>` +
      `<text x="${f1(pt(-30, R + 8)[0])}" y="${f1(pt(-30, R + 8)[1] + 22)}" text-anchor="start" font-family="var(--rlr-mono)" font-size="17" fill="var(--rlr-text-muted)">−30° right</text>` +
      `<text x="${CX}" y="${f1(CY - R - 14)}" text-anchor="middle" font-family="var(--rlr-mono)" font-size="17" fill="var(--rlr-text-muted)">0°</text>` +
      `<g class="ta-dial-live"></g>` +
      `<g font-family="var(--rlr-mono)" font-size="17"><line x1="60" y1="${CY + 22}" x2="100" y2="${CY + 22}" stroke="var(--rlr-text-muted)" stroke-width="3" stroke-dasharray="6 5"/><text x="108" y="${CY + 28}" fill="var(--rlr-text-muted)">command</text>` +
      `<line x1="330" y1="${CY + 22}" x2="370" y2="${CY + 22}" stroke="var(--rlr-accent)" stroke-width="5"/><text x="378" y="${CY + 28}" fill="var(--rlr-text-muted)">front wheels</text></g>`;
  }
  const dialLive = dial.querySelector(".ta-dial-live") as SVGGElement;

  // ---- static parts of the strip: CELLS control steps, 4 substeps each
  const SW = 940, CELL_W = SW / CELLS, SUB_W = (CELL_W - 6) / 4, Y0 = 34, H = 36;
  {
    let cells = "";
    for (let c = 0; c < CELLS; c++) {
      const x = c * CELL_W + 3;
      for (let s = 0; s < 4; s++) cells += `<rect class="ta-sub-cell" data-c="${c}" data-s="${s}" x="${f1(x + s * SUB_W + 1)}" y="${Y0}" width="${f1(SUB_W - 2)}" height="${H}" rx="3" fill="#1b2330" stroke="#2a3441" stroke-width="1"/>`;
    }
    strip.innerHTML = cells +
      `<path d="M 3 ${Y0 - 10} v -8 h ${f1(CELL_W - 6)} v 8" fill="none" stroke="var(--rlr-accent2)" stroke-width="2"/>` +
      `<text x="3" y="${Y0 - 22}" text-anchor="start" font-family="var(--rlr-mono)" font-size="16" fill="var(--rlr-accent2)">one control step: 0.02 s</text>` +
      `<path d="M ${f1(CELL_W + 4)} ${Y0 + H + 10} v 8 h ${f1(SUB_W - 2)} v -8" fill="none" stroke="var(--rlr-warn)" stroke-width="2"/>` +
      `<text x="${f1(CELL_W + 4 + SUB_W + 6)}" y="${Y0 + H + 26}" text-anchor="start" font-family="var(--rlr-mono)" font-size="16" fill="var(--rlr-warn)">one physics substep: 0.005 s</text>` +
      `<text x="${SW - 4}" y="${Y0 + H + 26}" text-anchor="end" font-family="var(--rlr-mono)" font-size="16" fill="var(--rlr-text-muted)">50 Hz decisions · 200 Hz physics</text>` +
      `<line class="ta-head" x1="0" y1="${Y0 - 6}" x2="0" y2="${Y0 + H + 6}" stroke="#fff" stroke-width="3"/>`;
  }
  const subCells = Array.from(strip.querySelectorAll<SVGRectElement>(".ta-sub-cell"));
  const head = strip.querySelector(".ta-head") as SVGLineElement;

  function post(fr: Frame | null, force: boolean) {
    const now = performance.now();
    if (!force && now - lastPost < 16) return;
    lastPost = now;
    const thr = fr ? fr.act[1] : 0;
    frame?.contentWindow?.postMessage({
      type: "rlr",
      car: { steer: fr ? fr.wheelRad : 0, torque: Math.abs(thr), driveFront: 0, spin: 10 * thr, glowColor: thr >= 0 ? 0xff4d3d : 0x36c3ff },
    }, "*");
  }

  function render(force = false) {
    const fr = frameAt(state.t);
    // bars
    for (const i of [0, 1] as const) {
      const r = rows[i], v = fr.act[i], w = Math.abs(v) * 50;
      r.fill.style.width = `${w.toFixed(2)}%`;
      r.fill.style.left = v < 0 ? `${(50 - w).toFixed(2)}%` : "50%";
      r.fill.classList.toggle("neg", v < 0);
      r.bar.classList.toggle("clipped", fr.clipped[i]);
      r.ghost.style.left = fr.raw[i] < 0 ? "0" : "auto";
      r.ghost.style.right = fr.raw[i] < 0 ? "auto" : "0";
      r.val.textContent = sgn(v);
      r.val.classList.toggle("bad", fr.clipped[i]);
    }
    rows[0].sub.textContent = fr.clipped[0]
      ? `raw ${sgn(fr.raw[0])} clipped to ${sgn(fr.act[0])} → ${sgn(fr.act[0] * MAX_STEER_DEG, 1)}° full lock`
      : `× ${MAX_STEER_DEG}° lock → commanded ${sgn(fr.act[0] * MAX_STEER_DEG, 1)}°  (+ is left)`;
    rows[1].sub.textContent = fr.clipped[1]
      ? `raw ${sgn(fr.raw[1])} clipped to ${sgn(fr.act[1])} → ${sgn(fr.act[1] * MAX_TORQUE, 0)} N·m, all of it`
      : fr.act[1] < 0
        ? `× ${MAX_TORQUE} N·m on the rear tyres → ${sgn(fr.act[1] * MAX_TORQUE, 0)} N·m: brake / reverse`
        : `× ${MAX_TORQUE} N·m on the rear tyres → ${sgn(fr.act[1] * MAX_TORQUE, 0)} N·m`;
    // dial
    const cmdDeg = (fr.cmdRad * 180) / Math.PI, whDeg = (fr.wheelRad * 180) / Math.PI;
    const gap = Math.abs(cmdDeg - whDeg) > 0.2 ? `<path d="${arc(whDeg, cmdDeg, R - 24)}" fill="none" stroke="var(--rlr-warn)" stroke-width="6" stroke-linecap="round" opacity=".9"/>` : "";
    dialLive.innerHTML = gap +
      `<line x1="${CX}" y1="${CY}" x2="${f1(pt(cmdDeg, R - 6)[0])}" y2="${f1(pt(cmdDeg, R - 6)[1])}" stroke="var(--rlr-text-muted)" stroke-width="3" stroke-dasharray="6 5"/>` +
      `<line x1="${CX}" y1="${CY}" x2="${f1(pt(whDeg, R - 30)[0])}" y2="${f1(pt(whDeg, R - 30)[1])}" stroke="var(--rlr-accent)" stroke-width="6" stroke-linecap="round"/>` +
      `<circle cx="${CX}" cy="${CY}" r="9" fill="var(--rlr-accent)" stroke="#fff" stroke-width="2"/>`;
    dialRead.innerHTML = `cmd <b>${sgn(cmdDeg, 1)}°</b> · wheels <b>${sgn(whDeg, 1)}°</b> · ${fr.lag > 0 ? `<span class="warn">${fr.lag} step${fr.lag === 1 ? "" : "s"} behind</span>` : `<span class="good">in position</span>`}`;
    // strip
    const c = fr.k % CELLS;
    for (const el of subCells) {
      const cc = Number(el.dataset.c), ss = Number(el.dataset.s);
      const lit = cc === c, done = cc < c || (lit && ss <= fr.sub);
      el.setAttribute("fill", lit ? (ss <= fr.sub ? "var(--rlr-warn)" : "#2a3441") : done ? "var(--rlr-accent2)" : "#1b2330");
      el.setAttribute("opacity", lit ? "1" : done ? "0.45" : "1");
    }
    const hx = c * CELL_W + 3 + (fr.sub + 1) * SUB_W;
    head.setAttribute("x1", f1(hx)); head.setAttribute("x2", f1(hx));
    stripRead.innerHTML = `step <b>${fr.k}</b> · t = <b>${fr.tSim.toFixed(2)} s</b> · action [${sgn(fr.act[0])}, ${sgn(fr.act[1])}] · substep <b>${fr.sub + 1}</b> / 4`;
    post(fr, force);
  }
  render(true);

  const entry = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  entry.add(q(".a-title, .a-sub"), { opacity: [0, 1], translateY: [24, 0], delay: stagger(120) }, 0)
    .add(q(".ta-scene, .ta-card"), { opacity: [0, 1], translateY: [40, 0], scale: [0.96, 1], delay: stagger(160) }, 300)
    .add(q(".chip, .a-footer"), { opacity: [0, 1], delay: stagger(100) }, 1400);

  function start() {
    stop();
    loops.push(animate(state, { t: [0, T_TOTAL], duration: T_TOTAL * 1000, ease: "linear", loop: true, onUpdate: () => render() }));
  }
  function stop() {
    for (const a of loops) a.pause();
    loops.length = 0;
    state.t = 0;
    render(true);
    post(null, true);
  }

  return {
    play() { entry.restart(); start(); },
    stop() { entry.pause(); stop(); },
  };
}
