import { animate, createTimeline, stagger, svg, type JSAnimation } from "animejs";
import type { SlideAnim } from "./types";

const GRID = 32;

/** "How PPO trains the driver": env grid ripples, pulses run rollout -> update -> checkpoint and loop back. */
export function mountPPO(root: HTMLElement): SlideAnim {
  const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement | SVGElement>(sel));
  const loops: JSAnimation[] = [];

  // the environment grid: GRID x GRID cells standing in for 4096 envs
  const gridSvg = root.querySelector(".ppo-grid") as SVGSVGElement;
  const cell = 340 / GRID;
  gridSvg.innerHTML = Array.from({ length: GRID * GRID }, (_, i) => {
    const r = Math.floor(i / GRID), c = i % GRID;
    return `<rect x="${c * cell}" y="${r * cell}" width="${cell - 1.2}" height="${cell - 1.2}" fill="var(--rlr-accent2)" opacity="0.3"/>`;
  }).join("");

  // reward curve: 13 checkpoints along a saturating curve
  const curve = root.querySelector(".ppo-curve") as SVGPathElement;
  const dotsG = root.querySelector(".ppo-dots") as SVGGElement;
  const pts = Array.from({ length: 13 }, (_, i) => [20 + (i / 12) * 360, 270 - (1 - Math.exp(-i / 3.5)) * 230]);
  curve.setAttribute("d", "M " + pts.map((p) => p.join(" ")).join(" L "));
  dotsG.innerHTML = pts.map((p) => `<circle class="ppo-dot" cx="${p[0]}" cy="${p[1]}" r="7" fill="var(--rlr-bg)" stroke="var(--rlr-good)" stroke-width="4" opacity="0"/>`).join("");

  const entry = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  entry.add(q(".a-title, .a-sub"), { opacity: [0, 1], translateY: [24, 0], delay: stagger(120) }, 0)
    .add(q(".ppo-card"), { opacity: [0, 1], translateY: [40, 0], scale: [0.95, 1], delay: stagger(180) }, 300)
    .add(q(".ppo-arrow"), { opacity: [0, 1], delay: stagger(150) }, 900)
    .add(svg.createDrawable(curve), { draw: ["0 0", "0 1"], duration: 1800, ease: "inOutSine" }, 1200)
    .add(q(".ppo-dot"), { opacity: [0, 1], scale: [0, 1], duration: 350, ease: "outBack", delay: stagger(130) }, 1300)
    .add(q(".ppo-return, .a-footer"), { opacity: [0, 1], delay: stagger(200) }, 2600);

  function start() {
    stop();
    // diagonal activity wave across the env grid
    loops.push(animate(q(".ppo-grid rect"), {
      opacity: [0.25, 1], duration: 650, ease: "inOutSine", loop: true, alternate: true,
      delay: stagger(18, { grid: [GRID, GRID], from: "first" }),
    }));
    // one rollout -> update -> checkpoint -> back-to-envs cycle every 3 s
    const fade = (self: JSAnimation) => { (self.targets[0] as SVGElement).setAttribute("opacity", String(Math.sin(Math.PI * self.progress))); };
    const cycle = createTimeline({ loop: true });
    cycle.add(q(".ppo-pulse-a"), { translateX: [0, 100], duration: 700, ease: "inOutSine", onUpdate: fade }, 0)
      .add(q(".ppo-pulse-b"), { translateY: [0, 40], duration: 450, ease: "inOutSine", onUpdate: fade }, 800)
      .add(q(".ppo-pulse-c"), { translateX: [0, 100], duration: 700, ease: "inOutSine", onUpdate: fade }, 1350)
      .add(q(".ppo-pulse-d"), { duration: 900, ease: "inOutSine", onUpdate: fade, ...svg.createMotionPath(root.querySelector(".ppo-return-path") as SVGPathElement) }, 2100);
    loops.push(cycle as unknown as JSAnimation);
  }
  function stop() { for (const a of loops) a.pause(); loops.length = 0; }

  return {
    play() { entry.restart(); start(); },
    stop() { entry.pause(); stop(); },
  };
}
