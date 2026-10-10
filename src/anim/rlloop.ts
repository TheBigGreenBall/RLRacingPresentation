import { animate, createTimeline, stagger, svg, type JSAnimation } from "animejs";
import type { SlideAnim } from "./types";

const LAYERS = [6, 5, 5, 2];

/** SVG scene for the agent <-> environment loop, drawn at 1920x1080 and scaled by the container. */
function scene(): string {
  const font = "var(--rlr-font)", mono = "var(--rlr-mono)";
  const nodes: string[] = [], links: string[] = [];
  LAYERS.forEach((n, layer) => {
    const x = 290 + layer * 140;
    for (let i = 0; i < n; i++) {
      const y = 605 + (i - (n - 1) / 2) * 32;
      if (layer < LAYERS.length - 1) {
        const m = LAYERS[layer + 1];
        for (let j = 0; j < m; j++) links.push(`<line x1="${x}" y1="${y}" x2="${x + 140}" y2="${605 + (j - (m - 1) / 2) * 32}" stroke="var(--rlr-panel-border)" stroke-width="1.5"/>`);
      }
      nodes.push(`<circle class="rl-node" data-layer="${layer}" cx="${x}" cy="${y}" r="11" fill="${layer === LAYERS.length - 1 ? "var(--rlr-accent)" : "var(--rlr-accent2)"}"/>`);
    }
  });
  const card = (x: number, color: string) =>
    `<rect x="${x}" y="330" width="560" height="470" rx="18" fill="var(--rlr-panel)" stroke="var(--rlr-panel-border)" stroke-width="2"/>` +
    `<path d="M ${x + 18} 331 H ${x + 542} A 18 18 0 0 1 ${x + 560} 349 V 337 H ${x} V 349 A 18 18 0 0 1 ${x + 18} 331 Z" fill="${color}"/>`;
  const chip = (x: number, y: number, w: number, color: string, text: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="44" rx="22" fill="${color}" fill-opacity="0.13" stroke="${color}" stroke-width="2"/>` +
    `<text x="${x + w / 2}" y="${y + 30}" font-size="22" font-weight="700" font-family="${mono}" fill="${color}" text-anchor="middle">${text}</text>`;
  // the dashed centerline of the mini track, as a path so the car can follow it
  const track = "M 1280 620 A 150 80 0 1 1 1580 620 A 150 80 0 1 1 1280 620 Z";
  return `
<svg viewBox="170 290 1580 550" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The reinforcement learning loop">
  <defs><radialGradient id="rl-bg" cx="30%" cy="20%" r="80%"><stop offset="0" stop-color="var(--rlr-bg-soft)"/><stop offset="1" stop-color="var(--rlr-bg)"/></radialGradient></defs>
  <rect x="170" y="290" width="1580" height="550" rx="24" fill="url(#rl-bg)"/>

  <g class="rl-card">
    ${card(210, "var(--rlr-accent)")}
    <text x="240" y="400" font-size="40" font-weight="800" font-family="${font}" fill="var(--rlr-text)">Agent</text>
    <text x="240" y="438" font-size="26" font-family="${font}" fill="var(--rlr-text-muted)">policy π(action | observation), a small</text>
    <text x="240" y="470" font-size="26" font-family="${font}" fill="var(--rlr-text-muted)">neural network</text>
    ${links.join("")}${nodes.join("")}
    ${chip(240, 712, 360, "var(--rlr-accent)", "60 → [256, 256, 128] → 2")}
  </g>

  <g class="rl-card">
    ${card(1150, "var(--rlr-accent2)")}
    <text x="1180" y="400" font-size="40" font-weight="800" font-family="${font}" fill="var(--rlr-text)">Environment</text>
    <text x="1180" y="438" font-size="26" font-family="${font}" fill="var(--rlr-text-muted)">MuJoCo car on a procedurally generated</text>
    <text x="1180" y="470" font-size="26" font-family="${font}" fill="var(--rlr-text-muted)">track, simulated in MJX</text>
    <ellipse cx="1430" cy="620" rx="190" ry="115" fill="none" stroke="#dddddd" stroke-width="4"/>
    <ellipse cx="1430" cy="620" rx="110" ry="45" fill="none" stroke="#dddddd" stroke-width="4"/>
    <path class="rl-track" d="${track}" fill="none" stroke="#6b7786" stroke-width="2" stroke-dasharray="10 10"/>
    <rect class="rl-car" x="-14" y="-9" width="28" height="18" rx="4" fill="var(--rlr-accent)"/>
    ${chip(1180, 748, 390, "var(--rlr-accent2)", "200 Hz physics, 4 substeps")}
  </g>

  <g class="rl-arrow">
    <line x1="790" y1="500" x2="1104" y2="500" stroke="var(--rlr-warn)" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
    <polygon points="1130,500 1104,486 1104,514" fill="var(--rlr-warn)"/>
    <text x="960" y="470" font-size="24" font-weight="700" font-family="${font}" fill="var(--rlr-warn)" text-anchor="middle">action aₜ = [steer, throttle]</text>
    <circle class="rl-pulse-a" cx="790" cy="500" r="13" fill="#fff" opacity="0"/>
  </g>
  <g class="rl-arrow">
    <line x1="1130" y1="660" x2="816" y2="660" stroke="var(--rlr-good)" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
    <polygon points="790,660 816,646 816,674" fill="var(--rlr-good)"/>
    <text x="960" y="702" font-size="24" font-weight="700" font-family="${font}" fill="var(--rlr-good)" text-anchor="middle">observation oₜ₊₁, reward rₜ₊₁</text>
    <circle class="rl-pulse-b" cx="1130" cy="660" r="13" fill="#fff" opacity="0"/>
  </g>
  <text class="rl-step rl-in" x="960" y="595" font-size="30" font-family="${mono}" fill="var(--rlr-text-muted)" text-anchor="middle">step t = 0</text>
</svg>`;
}

/** Mounts the loop into the section's `.rl-loop` container. Entry timeline plus three loops while shown. */
export function mountRLLoop(root: HTMLElement): SlideAnim {
  const host = root.querySelector(".rl-loop") as HTMLElement;
  host.innerHTML = scene();
  const q = (sel: string) => Array.from(host.querySelectorAll<SVGElement>(sel));
  const stepEl = host.querySelector(".rl-step") as SVGTextElement;
  const loops: JSAnimation[] = [];
  let step = 0;

  const entry = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  entry.add(q(".rl-in"), { opacity: [0, 1], translateY: [20, 0], delay: stagger(120) }, 0)
    .add(q(".rl-card"), { opacity: [0, 1], translateY: [40, 0], delay: stagger(200) }, 250)
    .add(q(".rl-arrow"), { opacity: [0, 1], delay: stagger(200) }, 800);

  function start() {
    stop();
    step = 0;
    stepEl.textContent = "step t = 0";
    // pulses: action goes right during the first second, observation/reward comes back during the second
    const fade = (self: JSAnimation) => { (self.targets[0] as SVGElement).setAttribute("opacity", String(Math.sin(Math.PI * self.progress))); };
    const cycle = createTimeline({ loop: true, onLoop: () => { step++; stepEl.textContent = `step t = ${step}`; } });
    cycle.add(q(".rl-pulse-a"), { translateX: [0, 340], duration: 1000, ease: "inOutSine", onUpdate: fade }, 0)
      .add(q(".rl-pulse-b"), { translateX: [0, -340], duration: 1000, ease: "inOutSine", onUpdate: fade }, 1000);
    loops.push(cycle as unknown as JSAnimation);
    // network activity ripples layer by layer
    loops.push(animate(q(".rl-node"), { opacity: [0.25, 1], duration: 700, ease: "inOutSine", loop: true, alternate: true, delay: stagger(70, { from: "first" }) }));
    // the car laps the mini track
    const path = host.querySelector(".rl-track") as SVGPathElement;
    loops.push(animate(q(".rl-car"), { ease: "linear", duration: 5000, loop: true, ...svg.createMotionPath(path) }));
  }
  function stop() { for (const a of loops) a.pause(); loops.length = 0; }

  return {
    play() { entry.restart(); start(); },
    stop() { entry.pause(); stop(); },
  };
}
