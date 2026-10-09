// Entry for car3d.html: the ego car drives around a real benchmark track while the 10 lookahead points, half-width
// ticks, lateral/heading, velocity, yaw-rate and opponent vectors are drawn and the 60-float observation is read out.
import * as THREE from "three";
import { createScene, CAMERA_MODES } from "./scene.js";
import { TrackData, buildTrack } from "./track.js";
import { buildCar, poseCar, steerCar, spinWheels } from "./car.js";
import { computeObs } from "./obs.js";
import { createPanel, createOverlay, makeLabel, BLOCK_COLORS, BLOCK_TEXT } from "./hud.js";

const params = new URLSearchParams(location.search);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

async function loadJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function main() {
  const [tracksJson, carJson, contract] = await Promise.all([
    loadJson("data/tracks.json"), loadJson("data/car.json"), loadJson("data/obs_contract.json"),
  ]);
  const container = document.getElementById("app");
  const view = createScene(container);
  const overlay = createOverlay(container);
  const panel = createPanel(container, contract);
  const showHud = params.get("hud") !== "0";
  const showPanel = showHud && params.get("panel") !== "0";
  panel.el.style.display = showPanel ? "" : "none";
  if (!showHud) document.body.classList.add("no-hud");

  const tracks = tracksJson.tracks.map((t) => new TrackData(t));
  let trackIdx = Math.max(0, tracks.findIndex((t) => t.name === (params.get("track") || "serpent")));
  let track = tracks[trackIdx];
  let trackGroup = buildTrack(track, { wallRgba: tracksJson.walls.rgba });
  view.scene.add(trackGroup);

  const cfg = carJson.defaults, geo = carJson.geometry;
  const maxSteer = (cfg.max_steer_deg * Math.PI) / 180;
  const ego = buildCar(carJson, carJson.car_colors[0]);
  const oppA = buildCar(carJson, carJson.car_colors[1]);
  const oppB = buildCar(carJson, carJson.car_colors[2]);
  view.scene.add(ego, oppA, oppB);

  // ---------------------------------------------------------------- observation visuals, one group per block
  const groups = contract.blocks.map(() => ({ objects: [], labels: [] }));
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, transparent: true, ...extra });
  const lineMat = (color) => new THREE.LineBasicMaterial({ color, transparent: true });

  // block 0: lookahead points + fan + path
  const nLa = contract.lookahead_m.length;
  const laSpheres = [], laLabels = [];
  const sphereGeo = new THREE.SphereGeometry(0.33, 16, 12);
  for (let k = 0; k < nLa; k++) {
    const m = new THREE.Mesh(sphereGeo, mat(BLOCK_COLORS.lookahead_xy));
    const lbl = makeLabel(`${contract.lookahead_m[k]} m`, BLOCK_COLORS.lookahead_xy);
    m.add(lbl);
    view.scene.add(m);
    laSpheres.push(m); laLabels.push(lbl);
    groups[0].objects.push(m); groups[0].labels.push(lbl.element);
  }
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nLa * 2 * 3), 3));
  const fan = new THREE.LineSegments(fanGeo, lineMat(BLOCK_COLORS.lookahead_xy));
  const pathGeo = new THREE.BufferGeometry();
  pathGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((nLa + 1) * 3), 3));
  const path = new THREE.Line(pathGeo, lineMat(0xffffff));
  view.scene.add(fan, path);
  groups[0].objects.push(fan, path);

  // block 1: half-width cross lines + end ticks
  const hwGeo = new THREE.BufferGeometry();
  hwGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nLa * 2 * 3), 3));
  const hwLines = new THREE.LineSegments(hwGeo, lineMat(BLOCK_COLORS.lookahead_half_width));
  view.scene.add(hwLines);
  groups[1].objects.push(hwLines);
  const tickGeo = new THREE.BoxGeometry(0.16, 0.16, 0.9);
  const ticks = [];
  for (let k = 0; k < nLa * 2; k++) {
    const t = new THREE.Mesh(tickGeo, mat(BLOCK_COLORS.lookahead_half_width));
    view.scene.add(t); ticks.push(t); groups[1].objects.push(t);
  }

  // block 2: lateral offset bar + projection marker + heading arrows
  const latBar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.14, 0.14), mat(BLOCK_COLORS.lateral_heading));
  const projMarker = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), mat(0xffffff));
  const arrowTrack = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 4.5, 0xdddddd, 0.8, 0.4);
  const arrowCar = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 4.5, BLOCK_COLORS.lateral_heading, 0.8, 0.4);
  const latLabel = makeLabel("", BLOCK_COLORS.lateral_heading, "la-label small");
  latLabel.center.set(0.5, -0.8); // below the marker so it does not collide with the velocity / yaw labels
  projMarker.add(latLabel);
  view.scene.add(latBar, projMarker, arrowTrack, arrowCar);
  groups[2].objects.push(latBar, projMarker, arrowTrack, arrowCar);
  groups[2].labels.push(latLabel.element);

  // block 3: velocity arrow
  const arrowVel = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 4, BLOCK_COLORS.lin_vel, 1.0, 0.5);
  const velLabel = makeLabel("", BLOCK_COLORS.lin_vel, "la-label small");
  const velAnchor = new THREE.Object3D();
  velAnchor.add(velLabel);
  view.scene.add(arrowVel, velAnchor);
  groups[3].objects.push(arrowVel); groups[3].labels.push(velLabel.element);

  // block 4: yaw-rate arc above the car
  const arcN = 32;
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((arcN + 1) * 3), 3));
  const arc = new THREE.Line(arcGeo, lineMat(BLOCK_COLORS.ang_vel));
  const arcTip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(BLOCK_COLORS.ang_vel));
  const yawLabel = makeLabel("", BLOCK_COLORS.ang_vel, "la-label small");
  yawLabel.center.set(0.5, 3.0);
  arcTip.add(yawLabel);
  view.scene.add(arc, arcTip);
  groups[4].objects.push(arc, arcTip); groups[4].labels.push(yawLabel.element);

  // block 5: wheels glow when highlighted (handled in highlight()), plus a steer label at the front axle
  const steerLabel = makeLabel("", BLOCK_COLORS.wheels_steer, "la-label small");
  const steerAnchor = new THREE.Object3D();
  steerAnchor.position.set(cfg.wheelbase / 2, 0, 0.6);
  steerAnchor.add(steerLabel);
  ego.add(steerAnchor);
  groups[5].labels.push(steerLabel.element);

  // block 6: previous action readout floating over the car
  const actLabel = makeLabel("", BLOCK_COLORS.prev_action, "la-label small action");
  const actAnchor = new THREE.Object3D();
  actAnchor.position.set(-0.6, 0, 1.9);
  actAnchor.add(actLabel);
  ego.add(actAnchor);
  groups[6].labels.push(actLabel.element);

  // block 7: opponent arrows + rings + labels
  const oppCars = [oppA, oppB];
  const oppArrows = [], oppRings = [], oppLabels = [];
  for (let k = 0; k < oppCars.length; k++) {
    const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 5, BLOCK_COLORS.opponents, 0.9, 0.45);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(geo.size_scalar, 0.06, 8, 48), mat(BLOCK_COLORS.opponents));
    const lbl = makeLabel("", BLOCK_COLORS.opponents, "la-label small");
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0, 1.6);
    anchor.add(lbl);
    oppCars[k].add(anchor);
    view.scene.add(a, ring);
    oppArrows.push(a); oppRings.push(ring); oppLabels.push(lbl);
    groups[7].objects.push(a, ring); groups[7].labels.push(lbl.element);
  }

  // ---------------------------------------------------------------- highlight handling
  let highlighted = null;
  function setOpacity(obj, o) {
    obj.traverse((n) => {
      const mats = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
      for (const m of mats) { m.transparent = true; m.opacity = o; m.depthWrite = o > 0.5; }
    });
  }
  function highlight(bi) {
    highlighted = bi;
    groups.forEach((g, i) => {
      const on = bi === null || bi === i;
      for (const o of g.objects) setOpacity(o, on ? 1 : 0.1);
      for (const el of g.labels) el.classList.toggle("dim", !on);
    });
    // labels that only make sense when their block is selected
    steerLabel.element.classList.toggle("hidden", bi !== 5);
    actLabel.element.classList.toggle("hidden", bi !== 6);
    const glow = bi === 5;
    for (const w of ego.userData.wheels) w.children[0].material.emissive.set(glow ? BLOCK_COLORS.wheels_steer : 0x000000);
    for (const w of ego.userData.wheels) w.children[0].material.emissiveIntensity = glow ? 0.6 : 0;
    panel.highlight(bi);
    if (bi === null) overlay.setBlock("");
    else {
      const b = contract.blocks[bi];
      overlay.setBlock(`<b>[${b.start}:${b.end}] ${b.name}</b><br>${BLOCK_TEXT[b.name]}`, BLOCK_COLORS[b.name]);
    }
  }
  panel.el.addEventListener("block", (e) => highlight(highlighted === e.detail ? null : e.detail));

  // ---------------------------------------------------------------- motion model
  const speedScale = Number(params.get("speed") || 1);
  const st = {
    t: 0, s: 2.0, prev: null, prevYaw: 0, yawRate: 0, velWorld: [0, 0], paused: false,
    opp: [{ ds: 14, lat: -2.0, prev: null, v: [0, 0] }, { ds: -9, lat: 2.4, prev: null, v: [0, 0] }],
  };
  const egoState = { x: 0, y: 0, yaw: 0, s: 0, lateral: 0, headingErr: 0, velBody: [0, 0, 0], velWorld: [0, 0], angVelBody: [0, 0, 0], wheelSpin: [0, 0, 0, 0], steer: 0, prevAction: [0, 0] };

  function resetMotion() {
    st.prev = null; st.yawRate = 0; st.velWorld = [0, 0];
    view.snap();
    for (const o of st.opp) o.prev = null;
  }

  function step(dt) {
    st.t += dt;
    const t = st.t;
    const v = 16 + 4 * Math.sin(0.21 * t);
    const vDot = 4 * 0.21 * Math.cos(0.21 * t);
    const p0 = track.sample(st.s);
    const lat = clamp(2.2 * Math.sin(0.45 * t), -0.6 * p0.hw, 0.6 * p0.hw);
    const latDot = 2.2 * 0.45 * Math.cos(0.45 * t);
    const headingErr = Math.atan2(latDot, v) + 0.05 * Math.sin(1.3 * t);
    const kappa = track.curvature(st.s);
    const sRate = (v * Math.cos(headingErr)) / clamp(1 - kappa * lat, 0.4, 2.5);
    st.s = (st.s + sRate * dt) % track.L;

    const p = track.sample(st.s);
    const x = p.x + p.nx * lat, y = p.y + p.ny * lat;
    const yaw = p.heading + headingErr;
    if (st.prev) {
      const vx = (x - st.prev[0]) / dt, vy = (y - st.prev[1]) / dt;
      const k = 1 - Math.exp(-dt * 8);
      st.velWorld[0] += (vx - st.velWorld[0]) * k;
      st.velWorld[1] += (vy - st.velWorld[1]) * k;
      st.yawRate += (wrapAngle(yaw - st.prevYaw) / dt - st.yawRate) * k;
    }
    st.prev = [x, y]; st.prevYaw = yaw;

    const c = Math.cos(yaw), s = Math.sin(yaw);
    const vFwd = c * st.velWorld[0] + s * st.velWorld[1];
    const vLeft = -s * st.velWorld[0] + c * st.velWorld[1];
    const steer = clamp(Math.atan((cfg.wheelbase * st.yawRate) / Math.max(vFwd, 1)), -maxSteer, maxSteer);
    const throttle = clamp(0.35 + 0.55 * (vDot / (4 * 0.21)), -1, 1);
    const spin = vFwd / cfg.wheel_radius;

    Object.assign(egoState, {
      x, y, yaw, s: st.s, lateral: lat, headingErr, velWorld: [st.velWorld[0], st.velWorld[1]],
      velBody: [vFwd, vLeft, 0], angVelBody: [0, 0, st.yawRate],
      wheelSpin: [spin, spin, spin * (1 + 0.02 * Math.max(throttle, 0)), spin * (1 + 0.02 * Math.max(throttle, 0))],
      steer, prevAction: [steer / maxSteer, throttle],
    });
    poseCar(ego, x, y, yaw, geo.body_origin_z);
    steerCar(ego, steer);
    spinWheels(ego, spin * dt);

    // opponents ride along at offsets with their own wobble
    const opps = [];
    st.opp.forEach((o, i) => {
      const so = st.s + o.ds + (i === 0 ? 3 * Math.sin(0.17 * t) : 2 * Math.sin(0.13 * t + 1));
      const q = track.sample(so);
      const latO = clamp(o.lat + 0.5 * Math.sin(0.3 * t + i), -0.6 * q.hw, 0.6 * q.hw);
      const ox = q.x + q.nx * latO, oy = q.y + q.ny * latO;
      if (o.prev) {
        const k = 1 - Math.exp(-dt * 8);
        o.v[0] += ((ox - o.prev[0]) / dt - o.v[0]) * k;
        o.v[1] += ((oy - o.prev[1]) / dt - o.v[1]) * k;
      }
      o.prev = [ox, oy];
      const car = oppCars[i];
      poseCar(car, ox, oy, q.heading, geo.body_origin_z);
      spinWheels(car, (Math.hypot(o.v[0], o.v[1]) / cfg.wheel_radius) * dt);
      opps.push({ x: ox, y: oy, vx: o.v[0], vy: o.v[1], size: geo.size_scalar, car, index: i });
    });
    return opps;
  }

  // ---------------------------------------------------------------- per-frame visual update
  const tmpV = new THREE.Vector3(), tmpD = new THREE.Vector3();
  function updateVisuals(res, opps) {
    const e = egoState;
    const fanPos = fan.geometry.attributes.position, pathPos = path.geometry.attributes.position, hwPos = hwLines.geometry.attributes.position;
    pathPos.setXYZ(0, e.x, e.y, 0.25);
    res.lookahead.forEach((p, k) => {
      laSpheres[k].position.set(p.x, p.y, 0.35);
      fanPos.setXYZ(2 * k, e.x, e.y, 0.5);
      fanPos.setXYZ(2 * k + 1, p.x, p.y, 0.35);
      pathPos.setXYZ(k + 1, p.x, p.y, 0.25);
      const lx = p.x + p.nx * p.hw, ly = p.y + p.ny * p.hw, rx = p.x - p.nx * p.hw, ry = p.y - p.ny * p.hw;
      hwPos.setXYZ(2 * k, lx, ly, 0.12);
      hwPos.setXYZ(2 * k + 1, rx, ry, 0.12);
      ticks[2 * k].position.set(lx, ly, 0.45);
      ticks[2 * k + 1].position.set(rx, ry, 0.45);
    });
    fanPos.needsUpdate = pathPos.needsUpdate = hwPos.needsUpdate = true;

    // lateral + heading
    const proj = track.sample(e.s);
    projMarker.position.set(proj.x, proj.y, 0.25);
    const len = Math.max(Math.abs(e.lateral), 0.05);
    latBar.scale.set(len, 1, 1);
    latBar.position.set((proj.x + e.x) / 2, (proj.y + e.y) / 2, 0.25);
    latBar.rotation.z = Math.atan2(e.y - proj.y, e.x - proj.x);
    latLabel.element.textContent = `lateral ${e.lateral >= 0 ? "+" : ""}${e.lateral.toFixed(2)} m   heading err ${(e.headingErr * 180 / Math.PI).toFixed(1)} deg`;
    arrowTrack.position.set(e.x, e.y, 1.25);
    arrowTrack.setDirection(tmpD.set(proj.tx, proj.ty, 0));
    arrowCar.position.set(e.x, e.y, 1.25);
    arrowCar.setDirection(tmpD.set(Math.cos(e.yaw), Math.sin(e.yaw), 0));

    // velocity
    const speed = Math.hypot(e.velWorld[0], e.velWorld[1]);
    arrowVel.position.set(e.x, e.y, 1.0);
    if (speed > 0.1) arrowVel.setDirection(tmpD.set(e.velWorld[0] / speed, e.velWorld[1] / speed, 0));
    arrowVel.setLength(Math.max(0.5, speed * 0.3), 1.0, 0.5);
    velAnchor.position.set(e.x + (e.velWorld[0] / Math.max(speed, 0.1)) * speed * 0.3, e.y + (e.velWorld[1] / Math.max(speed, 0.1)) * speed * 0.3, 1.0);
    velLabel.element.textContent = `v_fwd ${e.velBody[0].toFixed(1)} m/s   v_left ${e.velBody[1].toFixed(2)}`;

    // yaw-rate arc
    const arcPos = arc.geometry.attributes.position;
    const sweep = clamp(e.angVelBody[2] * 2.5, -2.8, 2.8);
    for (let k = 0; k <= arcN; k++) {
      const a = e.yaw + (sweep * k) / arcN;
      arcPos.setXYZ(k, e.x + 1.6 * Math.cos(a), e.y + 1.6 * Math.sin(a), 1.75);
    }
    arcPos.needsUpdate = true;
    arcTip.position.set(e.x + 1.6 * Math.cos(e.yaw + sweep), e.y + 1.6 * Math.sin(e.yaw + sweep), 1.75);
    yawLabel.element.textContent = `yaw rate ${e.angVelBody[2].toFixed(2)} rad/s`;

    steerLabel.element.textContent = `steer ${(e.steer * 180 / Math.PI).toFixed(1)} deg   spin ${e.wheelSpin[0].toFixed(0)} rad/s`;
    actLabel.element.textContent = `prev action  steer ${e.prevAction[0].toFixed(2)}  throttle ${e.prevAction[1].toFixed(2)}`;

    // opponents
    opps.forEach((o) => {
      const k = o.index;
      const slot = res.slots.indexOf(o);
      oppRings[k].position.set(o.x, o.y, 0.08);
      const dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy);
      oppArrows[k].position.set(e.x, e.y, 0.9);
      oppArrows[k].setDirection(tmpD.set(dx / d, dy / d, 0));
      oppArrows[k].setLength(Math.max(d - geo.size_scalar, 0.5), 0.9, 0.45);
      const base = 45 + slot * 5;
      oppLabels[k].element.textContent = slot < 0 ? "" : `slot ${slot + 1}  [${base}:${base + 5}]  ${d.toFixed(1)} m`;
    });
    panel.update(res);
  }

  // ---------------------------------------------------------------- controls
  function switchTrack(i) {
    trackIdx = (i + tracks.length) % tracks.length;
    track = tracks[trackIdx];
    view.scene.remove(trackGroup);
    trackGroup.traverse((n) => { n.geometry?.dispose?.(); });
    trackGroup = buildTrack(track, { wallRgba: tracksJson.walls.rgba });
    view.scene.add(trackGroup);
    st.s = 2.0;
    resetMotion();
    overlay.setSub(`track: ${track.name}  (${track.L.toFixed(0)} m, half-width ${track.hw.reduce((a, b) => Math.min(a, b)).toFixed(1)}-${track.hw.reduce((a, b) => Math.max(a, b)).toFixed(1)} m, ${trackGroup.userData.wallCount} walls)`);
  }
  let camIdx = Math.max(0, CAMERA_MODES.indexOf(params.get("camera") || "chase"));
  view.setMode(CAMERA_MODES[camIdx]);
  function cycleCamera() { camIdx = (camIdx + 1) % CAMERA_MODES.length; view.setMode(CAMERA_MODES[camIdx]); view.snap(); }

  window.addEventListener("keydown", (ev) => {
    if (ev.key >= "1" && ev.key <= "8") highlight(Number(ev.key) - 1);
    else if (ev.key === "0") highlight(null);
    else if (ev.key === "c") cycleCamera();
    else if (ev.key === "t") switchTrack(trackIdx + 1);
    else if (ev.key === "p") panel.el.style.display = panel.el.style.display === "none" ? "" : "none";
    else if (ev.key === " ") { st.paused = !st.paused; ev.preventDefault(); }
  });
  let visible = true;
  window.addEventListener("message", (ev) => {
    const m = ev.data;
    if (!m || m.type !== "rlr") return;
    if ("block" in m) highlight(m.block === null || m.block === undefined ? null : Number(m.block));
    if ("camera" in m) { camIdx = Math.max(0, CAMERA_MODES.indexOf(m.camera)); view.setMode(CAMERA_MODES[camIdx]); }
    if ("track" in m) switchTrack(tracks.findIndex((t) => t.name === m.track));
    if ("panel" in m) panel.el.style.display = m.panel ? "" : "none";
    if ("visible" in m) visible = !!m.visible;
    if ("paused" in m) st.paused = !!m.paused;
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) resetMotion(); });

  switchTrack(trackIdx);
  if (!showHud) groups.forEach((g) => g.objects.forEach((o) => (o.visible = false)));
  const initialBlock = params.get("block");
  highlight(initialBlock === null || initialBlock === "" ? null : Number(initialBlock));

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dtRaw = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!visible) return;
    const dt = st.paused ? 0 : dtRaw * speedScale;
    const opps = dt > 0 ? step(dt) : step(1e-4);
    const res = computeObs(track, contract, egoState, opps);
    updateVisuals(res, opps);
    view.follow(egoState.x, egoState.y, egoState.yaw, dtRaw);
    view.render();
  }
  requestAnimationFrame(frame);
  window.__rlr = { egoState, track: () => track, highlight, switchTrack, computeObs: () => computeObs(track, contract, egoState, []) };
}

main().catch((e) => {
  console.error(e);
  const el = document.createElement("pre");
  el.style.color = "#ff6b6b"; el.style.padding = "2em";
  el.textContent = "Failed to start the 3D scene: " + e.message;
  document.body.appendChild(el);
});
