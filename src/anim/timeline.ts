import { createTimeline, stagger } from "animejs";
import type { SlideAnim } from "./types";

/** "How the league runs": the timeline draws across, markers pop, cards slide up, bullets follow. */
export function mountTimeline(root: HTMLElement): SlideAnim {
  const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  const tl = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  tl.add(q(".a-title, .a-sub"), { opacity: [0, 1], translateY: [24, 0], delay: stagger(120) }, 0)
    .add(q(".tl-line"), { scaleX: [0, 1], duration: 1600, ease: "inOutQuad" }, 200);
  q(".tl-card").forEach((card, i) => {
    const t = 500 + i * 550;
    tl.add(q(`.tl-dot[data-i="${i}"]`), { scale: [0, 1], opacity: [0, 1], duration: 450, ease: "outBack" }, t)
      .add(card, { opacity: [0, 1], translateY: [40, 0], scale: [0.95, 1] }, t + 80)
      .add(Array.from(card.querySelectorAll<HTMLElement>("li")), { opacity: [0, 1], translateY: [16, 0], duration: 500, delay: stagger(140) }, t + 350);
  });
  tl.add(q(".a-footer"), { opacity: [0, 1] }, 2600);
  return { play() { tl.restart(); }, stop() { tl.pause(); } };
}
