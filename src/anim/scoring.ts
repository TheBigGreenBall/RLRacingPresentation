import { createTimeline, stagger } from "animejs";
import type { SlideAnim } from "./types";

/** "How a submission is scored": chips, three track cards with counting lap times, a DNF flip, and the total. */
export function mountScoring(root: HTMLElement): SlideAnim {
  const q = <T extends Element = HTMLElement>(sel: string) => Array.from(root.querySelectorAll(sel)) as unknown as T[];
  const cards = q(".a-card");
  const timed = cards.filter((c) => c.dataset.lap);
  const dnf = root.querySelector(".a-card.dnf") as HTMLElement;
  const dnfTime = dnf.querySelector(".a-time") as HTMLElement;
  const dnfNote = dnf.querySelector(".a-note") as HTMLElement;
  const sum = root.querySelector(".a-sum") as HTMLElement;
  const counters = timed.map((c) => ({ el: c.querySelector(".a-time") as HTMLElement, target: Number(c.dataset.lap), v: 120 }));
  const total = { v: 0 };
  const totalTarget = counters.reduce((a, c) => a + c.target, 0) + 999;

  const reset = () => {
    for (const c of counters) { c.v = 120; c.el.textContent = "120.0 s"; }
    dnfTime.textContent = "— —";
    dnfTime.classList.remove("bad");
    dnfTime.classList.add("muted");
    dnfNote.textContent = "crashed on lap 1 ...";
    total.v = 0;
    sum.textContent = "0.0 s";
  };

  const tl = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  tl.add(q(".a-title, .a-sub"), { opacity: [0, 1], y: [24, 0], delay: stagger(120) }, 0)
    .add(q(".a-chips .chip"), { opacity: [0, 1], scale: [0.7, 1], delay: stagger(90) }, 300)
    .add(cards, { opacity: [0, 1], y: [50, 0], scale: [0.92, 1], delay: stagger(140) }, 500);
  counters.forEach((c, i) => {
    tl.add(c, {
      v: c.target, duration: 1900, ease: "outCubic",
      onUpdate: () => { c.el.textContent = `${c.v.toFixed(1)} s`; },
    }, 1100 + i * 150);
  });
  tl.add(dnfTime, {
    scale: [1, 1.12, 1], duration: 500, ease: "outBack",
    onBegin: () => {
      dnfTime.textContent = "999 s";
      dnfTime.classList.remove("muted");
      dnfTime.classList.add("bad");
      dnfNote.textContent = "no completed lap in 180 s (DNF)";
    },
  }, 3300)
    .add(root.querySelector(".a-total") as HTMLElement, { opacity: [0, 1], y: [30, 0] }, 4000)
    .add(total, {
      v: totalTarget, duration: 1200, ease: "outCubic",
      onUpdate: () => { sum.textContent = `${total.v.toFixed(1)} s`; },
    }, 4200)
    .add(root.querySelector(".a-footer") as HTMLElement, { opacity: [0, 1] }, 4900);

  return {
    play() { reset(); tl.restart(); },
    stop() { tl.pause(); },
  };
}
