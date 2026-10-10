import Reveal from "reveal.js";
import Notes from "reveal.js/plugin/notes";
import Highlight from "reveal.js/plugin/highlight";
import "reveal.js/reveal.css";
import "reveal.js/theme/black.css";
import "reveal.js/plugin/highlight/monokai.css";
import "../theme/theme.css";
import "./slides.css";
import { mountSlideAnims } from "./anim";

const deck = new Reveal({
  hash: true,
  slideNumber: "c/t",
  width: 1920,
  height: 1080,
  margin: 0.04,
  transition: "fade",
  backgroundTransition: "fade",
  controls: true,
  progress: true,
  center: false,
  viewDistance: 3,
  preloadIframes: true,
  autoPlayMedia: true,
  plugins: [Notes, Highlight],
});

/** Send a message to every 3D iframe (background iframes and inline ones) on the given slide. */
function postToScene(slide: Element | null, msg: Record<string, unknown>) {
  if (!slide) return;
  const frames: HTMLIFrameElement[] = [];
  slide.querySelectorAll("iframe").forEach((f) => frames.push(f as HTMLIFrameElement));
  const bg = (slide as HTMLElement & { slideBackgroundElement?: HTMLElement }).slideBackgroundElement;
  bg?.querySelectorAll("iframe").forEach((f) => frames.push(f as HTMLIFrameElement));
  for (const f of frames) f.contentWindow?.postMessage({ type: "rlr", ...msg }, "*");
}

deck.initialize().then(() => {
  // anime.js slide animations: replay from the start every time their slide is shown
  const anims = mountSlideAnims(document.querySelector(".reveal .slides") as ParentNode);
  anims.get(deck.getCurrentSlide())?.play();
  // pause the 3D scene when its slide is not shown, resume (and reset the camera) when it is
  deck.on("slidechanged", (ev: unknown) => {
    const { previousSlide, currentSlide } = ev as { previousSlide: Element | null; currentSlide: Element };
    if (previousSlide) anims.get(previousSlide)?.stop();
    anims.get(currentSlide)?.play();
    postToScene(previousSlide, { visible: false });
    postToScene(currentSlide, { visible: true, block: currentSlide.getAttribute("data-obs-block") ?? null });
  });
  // fragments carrying data-obs-block="N" highlight observation block N in the 3D scene
  const onFragment = (ev: unknown, shown: boolean) => {
    const { fragment } = ev as { fragment: HTMLElement };
    const slide = fragment.closest("section");
    if (!slide) return;
    if (shown) {
      const b = fragment.getAttribute("data-obs-block");
      if (b !== null) postToScene(slide, { block: b === "" ? null : Number(b) });
      const cam = fragment.getAttribute("data-camera");
      if (cam) postToScene(slide, { camera: cam });
    } else {
      // revert to the previous visible fragment's block (or none)
      const visible = Array.from(slide.querySelectorAll(".fragment.visible[data-obs-block]")) as HTMLElement[];
      const last = visible[visible.length - 1];
      postToScene(slide, { block: last ? Number(last.getAttribute("data-obs-block")) : null });
    }
  };
  deck.on("fragmentshown", (ev: unknown) => onFragment(ev, true));
  deck.on("fragmenthidden", (ev: unknown) => onFragment(ev, false));
});
