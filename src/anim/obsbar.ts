import { createTimeline, stagger } from "animejs";
import { OBS_BLOCKS, OBS_SIZE, LOOKAHEAD_M } from "../data/obs_blocks";
import type { SlideAnim } from "./types";

const COLORS = ["--rlr-b0", "--rlr-b1", "--rlr-b2", "--rlr-b3", "--rlr-b4", "--rlr-b5", "--rlr-b6", "--rlr-b7"];

/** "Observation v2": 60 cells fill block by block while the legend rows appear in step. Builds its own DOM. */
export function mountObsBar(root: HTMLElement): SlideAnim {
  const bar = root.querySelector(".obs-bar") as HTMLElement;
  const legend = root.querySelector(".obs-legend") as HTMLElement;
  bar.innerHTML = "";
  legend.innerHTML = "";

  const cellsByBlock: HTMLElement[][] = [];
  const labels: HTMLElement[] = [];
  OBS_BLOCKS.forEach((b, bi) => {
    const cells: HTMLElement[] = [];
    for (let i = b.start; i < b.end; i++) {
      const cell = document.createElement("div");
      cell.className = "obs-cell";
      cell.style.background = `var(${COLORS[bi]})`;
      cell.style.left = `${(i / OBS_SIZE) * 100}%`;
      cell.style.width = `calc(${100 / OBS_SIZE}% - 3px)`;
      bar.appendChild(cell);
      cells.push(cell);
    }
    cellsByBlock.push(cells);
    const lbl = document.createElement("div");
    lbl.className = "obs-idx";
    lbl.style.left = `${(b.start / OBS_SIZE) * 100}%`;
    lbl.textContent = String(b.start);
    bar.appendChild(lbl);
    labels.push(lbl);

    const row = document.createElement("div");
    row.className = "obs-row";
    row.innerHTML = `<span class="sw" style="background: var(${COLORS[bi]})"></span>` +
      `<span class="obs-range" style="color: var(${COLORS[bi]})">[${b.start}:${b.end}]</span>` +
      `<span class="obs-name">${b.name}</span>` +
      `<span class="obs-what">${b.what}</span>` +
      `<span class="obs-div">${b.divisor}</span>`;
    legend.appendChild(row);
  });
  const end = document.createElement("div");
  end.className = "obs-idx end";
  end.textContent = String(OBS_SIZE);
  bar.appendChild(end);
  labels.push(end);
  (root.querySelector(".obs-lookahead") as HTMLElement).innerHTML =
    `Lookahead distances along the centerline: <span class="mono">${LOOKAHEAD_M.join(", ")} m</span>. Opponent slots are zero when you drive alone.`;

  const rows = Array.from(legend.children) as HTMLElement[];
  const tl = createTimeline({ autoplay: false, defaults: { ease: "outExpo", duration: 600 } });
  tl.add(Array.from(root.querySelectorAll<HTMLElement>(".a-title, .a-sub")), { opacity: [0, 1], y: [24, 0], delay: stagger(120) }, 0);
  cellsByBlock.forEach((cells, bi) => {
    const t = 500 + bi * 550;
    tl.add(cells, { scaleY: [0, 1], opacity: [0.4, 1], duration: 450, ease: "outBack", delay: stagger(Math.min(40, 400 / cells.length)) }, t)
      .add(labels[bi], { opacity: [0, 1], duration: 300 }, t)
      .add(rows[bi], { opacity: [0, 1], x: [-24, 0], duration: 500 }, t + 120);
  });
  tl.add(labels[labels.length - 1], { opacity: [0, 1], duration: 300 }, 500 + 7 * 550)
    .add(Array.from(root.querySelectorAll<HTMLElement>(".obs-lookahead, .a-footer")), { opacity: [0, 1], delay: stagger(200) }, 500 + 8 * 550);

  return {
    play() { tl.restart(); },
    stop() { tl.pause(); },
  };
}
