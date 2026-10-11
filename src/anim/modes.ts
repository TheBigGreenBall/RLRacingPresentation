import { animate, createTimeline, stagger, type JSAnimation } from "animejs";
import type { SlideAnim } from "./types";

/** Two scripted mini races on the same oval: ghost mode (solo runs overlaid) and collision mode (one shared world). */

const CARS = [
  { name: "red", color: "#ff4d3d" },
  { name: "blue", color: "#36c3ff" },
  { name: "yellow", color: "#ffc857" },
];
const CYCLE = 12000; // ms per scripted loop
const CX = 400, CY = 250, RX = 300, RY = 160;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

function lanePath(offset: number): string {
  const rx = RX + offset, ry = RY + offset;
  // start on the bottom of the oval, clockwise (screen coords), start/finish line there
  return `M ${CX} ${CY + ry} A ${rx} ${ry} 0 1 1 ${CX} ${CY - ry} A ${rx} ${ry} 0 1 1 ${CX} ${CY + ry} Z`;
}

function trackSvg(kind: "ghost" | "collision"): string {
  const lights = kind === "collision"
    ? `<g class="lights">${[0, 1, 2].map((i) => `<circle class="light" cx="${370 + i * 30}" cy="40" r="10" fill="#3a4350"/>`).join("")}</g>`
    : "";
  const cars = CARS.map((c, i) =>
    `<g class="car" data-i="${i}"><rect x="-15" y="-9" width="30" height="18" rx="4" fill="${c.color}"/><rect x="-6" y="-5" width="12" height="10" rx="2" fill="#262a30"/></g>`).join("");
  return `
<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="${CX}" cy="${CY}" rx="${RX + 40}" ry="${RY + 40}" fill="#2b2f35" stroke="#dddddd" stroke-width="4"/>
  <ellipse cx="${CX}" cy="${CY}" rx="${RX - 40}" ry="${RY - 40}" fill="var(--rlr-bg)" stroke="#dddddd" stroke-width="4"/>
  <path d="${lanePath(0)}" fill="none" stroke="#6b7786" stroke-width="2" stroke-dasharray="10 10"/>
  <rect x="${CX - 4}" y="${CY + RY - 40}" width="8" height="80" fill="url(#checker)"/>
  <defs><pattern id="checker" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#fff"/><rect x="4" y="4" width="4" height="4" fill="#fff"/><rect x="4" width="4" height="4" fill="#111"/><rect y="4" width="4" height="4" fill="#111"/></pattern></defs>
  <path class="lane" data-i="0" d="${lanePath(0)}" fill="none" stroke="none"/>
  <path class="lane" data-i="1" d="${lanePath(16)}" fill="none" stroke="none"/>
  <path class="lane" data-i="2" d="${lanePath(-16)}" fill="none" stroke="none"/>
  ${lights}
  <text class="flag" x="${CX}" y="${CY + RY - 56}" font-size="26" font-weight="800" fill="#fff" text-anchor="middle" font-family="var(--rlr-font)" opacity="0"></text>
  <text class="bang" x="0" y="0" font-size="30" font-weight="900" fill="var(--rlr-warn)" text-anchor="middle" font-family="var(--rlr-font)" opacity="0">BUMP</text>
  ${cars}
</svg>`;
}

interface Panel { svg: SVGSVGElement; lanes: SVGPathElement[]; lens: number[]; cars: SVGGElement[]; rows: HTMLElement[]; flag: SVGTextElement; bang: SVGTextElement; lights: SVGCircleElement[]; }

function setup(host: HTMLElement, kind: "ghost" | "collision"): Panel {
  const svgHost = host.querySelector(".race-svg") as HTMLElement;
  svgHost.innerHTML = trackSvg(kind);
  const svg = svgHost.querySelector("svg") as SVGSVGElement;
  const lanes = Array.from(svg.querySelectorAll<SVGPathElement>(".lane"));
  return {
    svg, lanes, lens: lanes.map((p) => p.getTotalLength()),
    cars: Array.from(svg.querySelectorAll<SVGGElement>(".car")),
    rows: Array.from(host.querySelectorAll<HTMLElement>(".race-board li")),
    flag: svg.querySelector(".flag") as SVGTextElement,
    bang: svg.querySelector(".bang") as SVGTextElement,
    lights: Array.from(svg.querySelectorAll<SVGCircleElement>(".light")),
  };
}

/** Place a car at lap-fraction `s` on lane `i` with optional extra spin and visibility. */
function place(p: Panel, i: number, s: number, extraRot = 0, opacity = 1) {
  const len = p.lens[i], d = (((s % 1) + 1) % 1) * len;
  const a = p.lanes[i].getPointAtLength(d), b = p.lanes[i].getPointAtLength((d + 2) % len);
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + extraRot;
  p.cars[i].setAttribute("transform", `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
  p.cars[i].setAttribute("opacity", String(opacity));
  return a;
}

export function mountModes(root: HTMLElement): SlideAnim {
  const ghost = setup(root.querySelector(".mode-ghost") as HTMLElement, "ghost");
  const coll = setup(root.querySelector(".mode-collision") as HTMLElement, "collision");
  const loops: JSAnimation[] = [];
  const clock = { t: 0 };

  // ---- ghost mode: three independent solo runs, same track, overlaid; ranked by lap time
  const ghostSpeed = [1 / 3.6, 1 / 4.1, 1 / 4.6]; // laps per second
  const ghostLap = ["41.8 s", "47.6 s", "53.4 s"];
  ghost.rows.forEach((row, i) => {
    row.querySelector(".sw")!.setAttribute("style", `background: ${CARS[i].color}`);
    row.querySelector(".name")!.textContent = CARS[i].name;
  });
  function ghostFrame(t: number) {
    const order = [0, 1, 2];
    ghost.cars.forEach((_, i) => place(ghost, i, t * ghostSpeed[i], 0, 0.62));
    order.forEach((i, rank) => {
      const row = ghost.rows[rank];
      const done = t * ghostSpeed[i] >= 1;
      row.querySelector(".val")!.textContent = done ? `best lap ${ghostLap[i]}` : `lap 1 … ${(t * ghostSpeed[i] * 100).toFixed(0)} %`;
      row.classList.toggle("done", done);
    });
  }

  // ---- collision mode: grid start, contact at turn 1, a wall DQ, first to 3 laps
  const T0 = 0.8; // lights go green
  function sRed(t: number) { return -0.02 + Math.max(0, t - T0) * 0.36; }
  function sBlue(t: number) { return -0.02 + Math.max(0, t - T0) * 0.27 - 0.07 * smooth((t - 1.3) / 0.7); }
  function sYellow(t: number) {
    const run = Math.min(t, 5.6);
    return -0.06 + Math.max(0, run - T0) * 0.3 - 0.11 * smooth((t - 1.3) / 0.8) - (t > 5.6 ? 0 : 0);
  }
  let bumpShown = false;
  function collisionFrame(t: number) {
    const s = [sRed(t), sBlue(t), sYellow(t)];
    const spin = t > 1.3 && t < 2.3 ? 360 * smooth((t - 1.3) / 1.0) : 0;
    const wobble = t > 1.3 && t < 2.0 ? 14 * Math.sin((t - 1.3) * 18) : 0;
    const yellowDQ = t >= 5.6;
    const redDone = s[0] >= 3;
    place(coll, 0, Math.min(s[0], 3), 0, 1);
    place(coll, 1, s[1], wobble, 1);
    const yp = place(coll, 2, s[2], spin, yellowDQ ? 0.35 : 1);
    coll.lights.forEach((l, i) => l.setAttribute("fill", t < 0.25 + i * 0.18 ? "#3a4350" : t < T0 ? "#ff4d3d" : "#3ddc97"));
    if (t > 1.25 && t < 2.1) {
      coll.bang.setAttribute("opacity", String(1 - smooth((t - 1.25) / 0.85)));
      coll.bang.setAttribute("transform", `translate(${yp.x.toFixed(0)} ${(yp.y - 28 - 30 * smooth((t - 1.25) / 0.85)).toFixed(0)})`);
      bumpShown = true;
    } else if (bumpShown) { coll.bang.setAttribute("opacity", "0"); bumpShown = false; }
    coll.flag.setAttribute("opacity", redDone ? "1" : "0");
    coll.flag.textContent = redDone ? "FINISH: red, 3 laps" : "";
    const clockS = Math.max(0, t - T0) * 10;
    const entries = [
      { i: 0, finished: redDone, dq: false, laps: Math.floor(Math.max(0, Math.min(s[0], 3))), prog: s[0], time: redDone ? (3.02 / 0.36) * 10 : 0 },
      { i: 1, finished: false, dq: false, laps: Math.floor(Math.max(0, s[1])), prog: s[1], time: 0 },
      { i: 2, finished: false, dq: yellowDQ, laps: Math.floor(Math.max(0, s[2])), prog: s[2], time: 0 },
    ].sort((a, b) => {
      const ka = a.finished ? 0 : a.dq ? 2 : 1, kb = b.finished ? 0 : b.dq ? 2 : 1;
      return ka - kb || (ka === 0 ? a.time - b.time : b.laps - a.laps || b.prog - a.prog);
    });
    entries.forEach((e, rank) => {
      const row = coll.rows[rank];
      row.querySelector(".sw")!.setAttribute("style", `background: ${CARS[e.i].color}`);
      row.querySelector(".name")!.textContent = CARS[e.i].name;
      row.querySelector(".val")!.textContent = e.finished ? `finished ${e.time.toFixed(1)} s` : e.dq ? `DQ, hit the wall (${e.laps} lap${e.laps === 1 ? "" : "s"})` : t < T0 ? "on the grid" : `running, lap ${Math.min(e.laps + 1, 3)} of 3`;
      row.classList.toggle("done", e.finished);
      row.classList.toggle("dq", e.dq);
    });
    (root.querySelector(".race-clock") as HTMLElement).textContent = `race clock ${clockS.toFixed(1)} s`;
  }

  const entry = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  entry.add(Array.from(root.querySelectorAll<HTMLElement>(".mode-card")), { opacity: [0, 1], translateY: [40, 0], delay: stagger(200) }, 0)
    .add(Array.from(root.querySelectorAll<HTMLElement>(".mode-note")), { opacity: [0, 1] }, 900);

  function start() {
    stop();
    clock.t = 0;
    loops.push(animate(clock, {
      t: [0, CYCLE / 1000], duration: CYCLE, ease: "linear", loop: true,
      onUpdate: () => { ghostFrame(clock.t); collisionFrame(clock.t); },
    }));
  }
  function stop() { for (const a of loops) a.pause(); loops.length = 0; }
  ghostFrame(0); collisionFrame(0);

  return {
    play() { entry.restart(); start(); },
    stop() { entry.pause(); stop(); },
  };
}
