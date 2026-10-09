// On-screen chrome for the 3D scene: CSS2D labels on the lookahead points, the 60-float readout panel grouped by
// observation block, the key help and the block highlight state.
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

export const BLOCK_COLORS = {
  lookahead_xy: "#4f9cf5",
  lookahead_half_width: "#8cc4ff",
  lateral_heading: "#ff8a4c",
  lin_vel: "#3ddc97",
  ang_vel: "#7fe3b8",
  wheels_steer: "#f2b134",
  prev_action: "#f06292",
  opponents: "#a78bfa",
};

export const BLOCK_TEXT = {
  lookahead_xy: "x, y of the centerline point 1, 2, 3, 5, 8, 12, 16, 20, 25, 30 m ahead, in the car frame (x forward, y left). m / 30.",
  lookahead_half_width: "track half-width at each of those 10 points. m / 14.",
  lateral_heading: "signed offset from the centerline (+left, m / 14) and heading error = yaw - track heading (rad / pi).",
  lin_vel: "body-frame linear velocity: forward, left, up. m/s / 30.",
  ang_vel: "body-frame angular velocity: roll, pitch, yaw rates. rad/s / 5.",
  wheels_steer: "four wheel spin rates fl, fr, rl, rr (rad/s / 100) and the mean front steer angle (rad / 0.7).",
  prev_action: "the action applied last step: [steer, throttle], each in [-1, 1].",
  opponents: "3 nearest other cars, nearest first: rel x, rel y, rel vx, rel vy (/30) and size (/3), in the ego frame. Zeros when alone.",
};

export const BLOCK_LABELS = {
  lookahead_xy: ["x0", "y0", "x1", "y1", "x2", "y2", "x3", "y3", "x4", "y4", "x5", "y5", "x6", "y6", "x7", "y7", "x8", "y8", "x9", "y9"],
  lookahead_half_width: ["hw0", "hw1", "hw2", "hw3", "hw4", "hw5", "hw6", "hw7", "hw8", "hw9"],
  lateral_heading: ["lateral", "heading_err"],
  lin_vel: ["v_fwd", "v_left", "v_up"],
  ang_vel: ["roll", "pitch", "yaw rate"],
  wheels_steer: ["spin_fl", "spin_fr", "spin_rl", "spin_rr", "steer"],
  prev_action: ["steer", "throttle"],
  opponents: ["x", "y", "vx", "vy", "size", "x", "y", "vx", "vy", "size", "x", "y", "vx", "vy", "size"],
};

export function makeLabel(text, color, cls = "la-label") {
  const el = document.createElement("div");
  el.className = cls;
  el.textContent = text;
  el.style.color = color;
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1.4);
  return obj;
}

/** Build the readout panel DOM; returns {update(obsResult), highlight(blockIndex|null)}. */
export function createPanel(container, contract) {
  const panel = document.createElement("aside");
  panel.id = "panel";
  const title = document.createElement("div");
  title.className = "panel-title";
  title.innerHTML = `<b>Observation v${contract.version}</b> <span>${contract.size} floats, what the policy sees (scaled)</span>`;
  panel.appendChild(title);
  const cards = [], cells = [];
  contract.blocks.forEach((b, bi) => {
    const card = document.createElement("section");
    card.className = "card";
    card.style.setProperty("--c", BLOCK_COLORS[b.name]);
    const divs = [...new Set(b.divisor.map((d) => Number(d.toFixed(3))))];
    const divTxt = divs.map((d) => (Math.abs(d - Math.PI) < 1e-3 ? "pi" : d === 1 ? "1" : d)).join(", ");
    card.innerHTML = `<header><span class="idx">[${b.start}:${b.end}]</span><span class="name">${b.name}</span><span class="div">/ ${divTxt}</span></header>`;
    const grid = document.createElement("div");
    grid.className = "grid " + (b.size >= 10 ? "wide" : "narrow");
    const labels = BLOCK_LABELS[b.name] || [];
    for (let k = 0; k < b.size; k++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.innerHTML = `<span class="lbl">${labels[k] ?? k}</span><span class="val">0.00</span>`;
      grid.appendChild(cell);
      cells.push(cell.querySelector(".val"));
    }
    card.appendChild(grid);
    const desc = document.createElement("p");
    desc.className = "desc";
    desc.textContent = BLOCK_TEXT[b.name];
    card.appendChild(desc);
    card.addEventListener("click", () => panel.dispatchEvent(new CustomEvent("block", { detail: bi })));
    panel.appendChild(card);
    cards.push(card);
  });
  const help = document.createElement("div");
  help.className = "help";
  help.innerHTML = "keys: <kbd>1</kbd>-<kbd>8</kbd> highlight a block, <kbd>0</kbd> all, <kbd>c</kbd> camera, <kbd>t</kbd> track, <kbd>p</kbd> panel, <kbd>space</kbd> pause";
  panel.appendChild(help);
  container.appendChild(panel);

  let frame = 0;
  return {
    el: panel,
    update(res) {
      if ((frame++ & 1) === 0) return; // 30 Hz is plenty for text
      for (let k = 0; k < res.scaled.length; k++) {
        const v = res.scaled[k];
        cells[k].textContent = (v >= 0 ? "+" : "") + v.toFixed(2);
        cells[k].style.opacity = Math.abs(v) < 1e-6 ? 0.45 : 1;
      }
    },
    highlight(bi) {
      cards.forEach((c, i) => c.classList.toggle("dim", bi !== null && bi !== i));
      cards.forEach((c, i) => c.classList.toggle("hot", bi === i));
      if (bi !== null) cards[bi].scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
  };
}

export function createOverlay(container) {
  const top = document.createElement("div");
  top.id = "overlay";
  top.innerHTML = `<div class="ttl">RL Racing: the car and its observation</div><div class="sub" id="overlay-sub"></div><div class="blk" id="overlay-block"></div>`;
  container.appendChild(top);
  return {
    setSub(t) { top.querySelector("#overlay-sub").textContent = t; },
    setBlock(html, color) {
      const el = top.querySelector("#overlay-block");
      el.innerHTML = html;
      el.style.borderColor = color || "transparent";
      el.style.display = html ? "block" : "none";
    },
  };
}
