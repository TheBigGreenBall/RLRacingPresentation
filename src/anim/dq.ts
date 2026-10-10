import { animate, createTimeline, stagger, type JSAnimation } from "animejs";
import type { SlideAnim } from "./types";

/** "What ends an episode": four tiles slide in, each icon loops, then the lap-validity callout. */
export function mountDQ(root: HTMLElement): SlideAnim {
  const q = (sel: string) => Array.from(root.querySelectorAll<HTMLElement | SVGElement>(sel));
  const loops: JSAnimation[] = [];

  const tl = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 700 } });
  tl.add(q(".a-title, .a-sub"), { opacity: [0, 1], y: [24, 0], delay: stagger(120) }, 0)
    .add(q(".dq-tile"), { opacity: [0, 1], y: [60, 0], scale: [0.92, 1], delay: stagger(220) }, 350)
    .add(q(".a-callout"), { opacity: [0, 1], y: [30, 0] }, 1700)
    .add(q(".a-footer"), { opacity: [0, 1] }, 2300);

  function startLoops() {
    stopLoops();
    // car drifts out past the boundary line and back
    loops.push(animate(q(".dq-off-car"), { y: [0, 48], duration: 1600, ease: "inOutSine", loop: true, alternate: true }));
    // car rolls onto its roof and back
    loops.push(animate(q(".dq-flip-car"), { rotate: [0, 180], duration: 2200, ease: "inOutSine", loop: true, alternate: true }));
    // speedometer needle sweeps into the red
    loops.push(animate(q(".dq-needle"), { rotate: [-120, 110], duration: 1800, ease: "inOutQuad", loop: true, alternate: true }));
    // NaN blinks
    loops.push(animate(q(".dq-nan"), { opacity: [1, 0.25], duration: 450, ease: "steps(1)", loop: true, alternate: true }));
  }
  function stopLoops() { for (const a of loops) a.pause(); loops.length = 0; }

  return {
    play() { tl.restart(); startLoops(); },
    stop() { tl.pause(); stopLoops(); },
  };
}
