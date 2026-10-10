import type { SlideAnim } from "./types";
import { mountScoring } from "./scoring";
import { mountDQ } from "./dq";
import { mountObsBar } from "./obsbar";
import { mountRLLoop } from "./rlloop";
import { mountTimeline } from "./timeline";

const MOUNTS: Record<string, (root: HTMLElement) => SlideAnim> = {
  scoring: mountScoring,
  dq: mountDQ,
  obsbar: mountObsBar,
  rlloop: mountRLLoop,
  timeline: mountTimeline,
};

/** Mount every <section data-anim="..."> once and return a lookup by section. */
export function mountSlideAnims(deckRoot: ParentNode): Map<Element, SlideAnim> {
  const map = new Map<Element, SlideAnim>();
  deckRoot.querySelectorAll<HTMLElement>("section[data-anim]").forEach((section) => {
    const mount = MOUNTS[section.dataset.anim ?? ""];
    if (mount) map.set(section, mount(section));
  });
  return map;
}
