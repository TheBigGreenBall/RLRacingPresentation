import { animate, createTimeline, stagger, type JSAnimation } from "animejs";
import type { SlideAnim } from "./types";
import { type Track, type Pt, fallbackTrack, fitTo, edges, polyline, mod, sampleAt, trackLength, bandMarkup } from "./trackdraw";

const T_TOTAL = 21;        // s of scripted time per loop of the main scenario
const CLOCK_SCALE = 6;     // the demo lap clock runs 6x faster than the animation so a lap reads ~30 s
const GRID_T = 7;          // s per loop of the grid diagram
const f = (v: number) => v.toFixed(1);

// ------------------------------------------------------------------ the scenario script (pure function of t)

interface Scene { s: number; timed: -1 | 0 | 1; clock: number | null; caption: string; flash: string | null; start: number }

/** Where the car is and what the lap logic thinks at scripted time t. Mirrors racing_env.py: forward wrap = lap if valid, backward wrap voids. */
function scene(t: number, L: number): Scene {
  if (t < 6.5) {
    // judged run: start on the line, lap_valid = 1, first forward crossing is lap 1
    const tc = 5.2, s = (L * t) / tc;
    const caption = "Judged run: the car starts on the line, so the first forward crossing is lap 1.";
    if (t < tc) return { s, timed: 1, clock: CLOCK_SCALE * t, caption, flash: null, start: 0 };
    return { s, timed: 1, clock: CLOCK_SCALE * (t - tc), caption, flash: `Lap 1 · ${f(CLOCK_SCALE * tc)} s`, start: 0 };
  }
  if (t < 14) {
    const u = t - 6.5, caption = "Reversing over the line voids the lap. The next forward crossing only re-arms the clock.";
    let s: number;
    if (u < 1.5) s = (0.15 * L * u) / 1.5;
    else if (u < 3.0) s = 0.15 * L - (0.19 * L * (u - 1.5)) / 1.5;
    else s = -0.04 * L + (0.29 * L * Math.min(u - 3, 4.5)) / 4.5;
    const uBack = 1.5 + 1.5 * (0.15 / 0.19), uFwd = 3 + 4.5 * (0.04 / 0.29);
    if (u < uBack) return { s, timed: 1, clock: CLOCK_SCALE * u, caption, flash: null, start: 6.5 };
    if (u < uFwd) return { s, timed: 0, clock: null, caption, flash: null, start: 6.5 };
    return { s, timed: 1, clock: CLOCK_SCALE * (u - uFwd), caption, flash: null, start: 6.5 };
  }
  const u = t - 14, caption = "Random training start: lap_valid is 0, timing waits for the first crossing of the line.";
  const s = 0.6 * L + (0.7 * L * Math.min(u, 6)) / 6, uc = 6 * (0.4 / 0.7);
  if (u < uc) return { s, timed: -1, clock: null, caption, flash: null, start: 14 };
  return { s, timed: 1, clock: CLOCK_SCALE * (u - uc), caption, flash: null, start: 14 };
}

// ------------------------------------------------------------------ mount

/** "Lap validity": a car crosses the line three ways on a real track, an inset replays a backward crossing followed by the re-arming forward crossing, a grid diagram shows per-car clocks. */
export function mountLapValid(root: HTMLElement): SlideAnim {
  const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement | SVGElement>(sel));
  const trackSvg = root.querySelector(".lv-track") as SVGSVGElement;
  const backSvg = root.querySelector(".lv-back") as SVGSVGElement;
  const gridSvg = root.querySelector(".lv-grid") as SVGSVGElement;
  const sText = root.querySelector(".lv-s") as HTMLElement;
  const marker = root.querySelector(".lv-marker") as HTMLElement;
  const clockEl = root.querySelector(".lv-clock") as HTMLElement;
  const badge = root.querySelector(".lv-badge") as HTMLElement;
  const caption = root.querySelector(".lv-caption") as HTMLElement;
  const loops: JSAnimation[] = [];
  const state = { t: 0 };

  // ---- main track
  let track = fallbackTrack(), L = trackLength(track);
  let fit = fitTo([], 1, 1, 0);
  let liveG: SVGGElement;
  function buildTrack(tr: Track) {
    track = tr; L = trackLength(tr);
    const { left, right } = edges(tr, tr.centerline.map((_, i) => i));
    fit = fitTo([...left, ...right], 1040, 470, 12);
    const l0 = fit.to(left[0][0], left[0][1]), r0 = fit.to(right[0][0], right[0][1]);
    trackSvg.innerHTML = bandMarkup(tr, fit) +
      `<line x1="${f(l0[0])}" y1="${f(l0[1])}" x2="${f(r0[0])}" y2="${f(r0[1])}" stroke="#fff" stroke-width="6" stroke-dasharray="6 6"/>` +
      `<g class="lv-live"></g>`;
    liveG = trackSvg.querySelector(".lv-live") as SVGGElement;
  }
  buildTrack(track);

  function renderTrack(t: number) {
    const sc = scene(t, L);
    const trail: Pt[] = [];
    for (let k = 30; k >= 1; k--) { const tk = t - k * 0.06; if (tk >= sc.start) { const p = sampleAt(track, scene(tk, L).s, L); trail.push(fit.to(p.x, p.y)); } }
    const p = sampleAt(track, sc.s, L), [X, Y] = fit.to(p.x, p.y);
    const deg = (-p.heading * 180) / Math.PI;
    const line = sampleAt(track, 0, L), [LX, LY] = fit.to(line.x, line.y);
    liveG.innerHTML =
      (trail.length > 1 ? `<path class="lv-trail" d="${polyline([...trail, [X, Y]])}" fill="none" stroke="var(--rlr-accent)" stroke-width="4" stroke-linecap="round"/>` : "") +
      `<g transform="translate(${f(X)} ${f(Y)}) rotate(${f(deg)})"><rect x="-15" y="-8" width="30" height="16" rx="5" fill="var(--rlr-accent)" stroke="#fff" stroke-width="1.5"/><rect x="2" y="-5" width="7" height="10" rx="2" fill="#262a30"/></g>` +
      (sc.flash ? `<text class="lv-flash" x="${f(LX)}" y="${f(LY - 46)}" text-anchor="middle" font-family="var(--rlr-mono)" font-size="30" font-weight="800" fill="var(--rlr-good)">${sc.flash}</text>` : "");
    const sWrapped = mod(sc.s, L);
    sText.textContent = `s = ${sWrapped.toFixed(0)} m / ${L.toFixed(0)} m`;
    marker.style.left = `${((sWrapped / L) * 100).toFixed(2)}%`;
    clockEl.textContent = sc.clock === null ? "— —" : `${f(sc.clock)} s`;
    badge.textContent = sc.timed === 1 ? "VALID" : sc.timed === 0 ? "VOID" : "NOT TIMED";
    badge.className = `lv-badge ${sc.timed === 1 ? "valid" : sc.timed === 0 ? "void" : "none"}`;
    caption.textContent = sc.caption;
  }

  // ---- backward then forward: the car reverses over the line (lap voided), then crosses forwards again (re-armed, no lap counted)
  const BACK_T = 9, LINE_BX = 280, BAND_Y0 = 46, BAND_Y1 = 166, CAR_Y = 106;
  backSvg.innerHTML =
    `<rect x="0" y="${BAND_Y0}" width="560" height="${BAND_Y1 - BAND_Y0}" fill="#2b2f35"/>` +
    `<line x1="0" y1="${BAND_Y0}" x2="560" y2="${BAND_Y0}" stroke="#ddd" stroke-width="2.5"/><line x1="0" y1="${BAND_Y1}" x2="560" y2="${BAND_Y1}" stroke="#ddd" stroke-width="2.5"/>` +
    `<line x1="${LINE_BX}" y1="${BAND_Y0}" x2="${LINE_BX}" y2="${BAND_Y1}" stroke="#fff" stroke-width="6" stroke-dasharray="6 6"/>` +
    `<text x="12" y="${BAND_Y0 - 10}" font-family="var(--rlr-mono)" font-size="15" fill="var(--rlr-text-muted)">start / finish · forward is →</text>` +
    `<g class="lv-backlive"></g>`;
  const backG = backSvg.querySelector(".lv-backlive") as SVGGElement;
  function renderBack(t: number) {
    const u = mod(t, BACK_T);
    const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));
    // phases: lap running past the line -> reverse back over it (VOID) -> pause -> forward over it again (VALID, clock from 0)
    const xBack0 = 370, xBack1 = 190, xFwd1 = 480;
    let x: number, timed: boolean, clock: number | null, note: [string, string], dir: 1 | -1 | 0;
    if (u < 0.8) { x = xBack0; timed = true; clock = 12.3 + CLOCK_SCALE * u; note = ["lap 3 running", "var(--rlr-good)"]; dir = 0; }
    else if (u < 3.3) {
      x = lerp(xBack0, xBack1, (u - 0.8) / 2.5); dir = -1;
      const crossed = x < LINE_BX;
      timed = !crossed; clock = crossed ? null : 12.3 + CLOCK_SCALE * u;
      note = crossed ? ["backward crossing: lap voided", "var(--rlr-bad)"] : ["reversing…", "var(--rlr-warn)"];
    }
    else if (u < 4.0) { x = xBack1; timed = false; clock = null; note = ["backward crossing: lap voided", "var(--rlr-bad)"]; dir = 0; }
    else {
      const uf = u - 4.0, tc = 3.6 * ((LINE_BX - xBack1) / (xFwd1 - xBack1));
      x = lerp(xBack1, xFwd1, uf / 3.6); dir = uf < 3.6 ? 1 : 0;
      const crossed = x >= LINE_BX;
      timed = crossed; clock = crossed ? CLOCK_SCALE * (uf - tc) : null;
      note = crossed ? ["forward crossing: re-armed, no lap counted", "var(--rlr-good)"] : ["driving forward again", "var(--rlr-text-muted)"];
    }
    const arrows = dir === 0 ? "" : Array.from({ length: 3 }, (_, k) => {
      const ax = x + dir * (28 + k * 14);
      return `<polygon points="${f(ax + dir * 7)},${CAR_Y} ${f(ax - dir * 3)},${CAR_Y - 7} ${f(ax - dir * 3)},${CAR_Y + 7}" fill="${dir < 0 ? "var(--rlr-bad)" : "var(--rlr-good)"}" opacity="${(0.9 - 0.3 * k).toFixed(1)}"/>`;
    }).join("");
    backG.innerHTML =
      `<g transform="translate(${f(x)} ${CAR_Y})"><rect x="-26" y="-14" width="52" height="28" rx="7" fill="var(--rlr-accent)" stroke="#fff" stroke-width="1.5"/><rect x="2" y="-9" width="12" height="18" rx="3" fill="#262a30"/></g>` + arrows +
      `<text x="12" y="192" font-family="var(--rlr-mono)" font-size="16" font-weight="700" fill="${note[1]}">${note[0]}</text>` +
      `<text x="548" y="${BAND_Y0 - 10}" text-anchor="end" font-family="var(--rlr-mono)" font-size="16" font-weight="700" fill="${timed ? "var(--rlr-good)" : "var(--rlr-bad)"}">${timed ? "VALID" : "VOID"} · ${clock === null ? "— —" : f(clock) + " s"} · laps 2</text>`;
  }

  // ---- grid diagram: slots behind the line, clocks start per car, one DQ coasts to a stop
  const GRID = [
    { x0: 330, y: 72, v: 28, dq: null as number | null },
    { x0: 262, y: 138, v: 40, dq: 4.0 },
    { x0: 196, y: 72, v: 42, dq: null },
    { x0: 130, y: 138, v: 50, dq: null },
  ];
  const LINE_X = 400;
  gridSvg.innerHTML =
    `<rect x="0" y="34" width="560" height="140" fill="#2b2f35"/><line x1="0" y1="34" x2="560" y2="34" stroke="#ddd" stroke-width="2.5"/><line x1="0" y1="174" x2="560" y2="174" stroke="#ddd" stroke-width="2.5"/>` +
    `<line x1="${LINE_X}" y1="34" x2="${LINE_X}" y2="174" stroke="#fff" stroke-width="6" stroke-dasharray="6 6"/>` +
    GRID.map((g) => `<rect x="${g.x0 - 16}" y="${g.y - 10}" width="32" height="20" rx="4" fill="none" stroke="#5a6472" stroke-width="1.5" stroke-dasharray="3 3"/>`).join("") +
    `<text x="${LINE_X + 8}" y="24" font-family="var(--rlr-mono)" font-size="15" fill="var(--rlr-text-muted)">start / finish</text><g class="lv-gridlive"></g>`;
  const gridG = gridSvg.querySelector(".lv-gridlive") as SVGGElement;
  function renderGrid(t: number) {
    const u = mod(t, GRID_T);
    gridG.innerHTML = GRID.map((g) => {
      const tCross = (LINE_X - g.x0) / g.v;
      let x = g.x0 + g.v * u, dead = false;
      if (g.dq !== null && u > g.dq) { const d = Math.min(u - g.dq, 1.6); x = g.x0 + g.v * g.dq + g.v * (d - (d * d) / 3.2); dead = true; }
      const clock = dead ? "DQ" : u < tCross ? "— —" : `${f(CLOCK_SCALE * (u - tCross))} s`;
      const fill = dead ? "#5a6472" : "var(--rlr-accent)";
      return `<g><rect x="${f(x - 15)}" y="${g.y - 8}" width="30" height="16" rx="5" fill="${fill}" stroke="#fff" stroke-width="1.2"/><rect x="${f(x + 2)}" y="${g.y - 5}" width="7" height="10" rx="2" fill="#262a30"/>` +
        `<text x="${f(x)}" y="${g.y - 16}" text-anchor="middle" font-family="var(--rlr-mono)" font-size="14" font-weight="700" fill="${dead ? "var(--rlr-bad)" : u < tCross ? "var(--rlr-text-muted)" : "var(--rlr-good)"}">${clock}</text></g>`;
    }).join("");
  }

  function render() { renderTrack(state.t); renderBack(state.t); renderGrid(state.t); }
  render();

  fetch("data/tracks.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((json: { tracks: Track[] }) => {
      const loop = json.tracks.find((t) => t.name === "loop");
      if (loop) buildTrack(loop);
      render();
    })
    .catch(() => { /* keep the fallback track */ });

  const entry = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  entry.add(q(".a-title, .a-sub"), { opacity: [0, 1], translateY: [24, 0], delay: stagger(120) }, 0)
    .add(q(".lv-card"), { opacity: [0, 1], translateY: [40, 0], scale: [0.96, 1], delay: stagger(180) }, 300)
    .add(q(".chip, .a-footer"), { opacity: [0, 1], delay: stagger(100) }, 1300);

  function start() {
    stop();
    loops.push(animate(state, { t: [0, T_TOTAL], duration: T_TOTAL * 1000, ease: "linear", loop: true, onUpdate: render }));
  }
  function stop() {
    for (const a of loops) a.pause();
    loops.length = 0;
    state.t = 0;
    render();
  }

  return {
    play() { entry.restart(); start(); },
    stop() { entry.pause(); stop(); },
  };
}
