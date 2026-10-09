// JavaScript port of rlracing/env/obs.py + track_math.lookahead: builds the 60-float observation for the
// animated ego car so the readout panel shows exactly what a policy would see (raw and scaled).

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * @param track TrackData
 * @param contract parsed obs_contract.json
 * @param ego {x, y, yaw, s, lateral, headingErr, velBody:[vx,vy,vz], angVelBody:[wx,wy,wz], wheelSpin:[4], steer, prevAction:[2]}
 * @param opponents [{x, y, vx, vy, size}] (world frame)
 */
export function computeObs(track, contract, ego, opponents) {
  const la = contract.lookahead_m;
  const nOpp = contract.n_opponents, dOpp = contract.opponent_dim;
  const raw = new Float32Array(contract.size);
  const c = Math.cos(ego.yaw), s = Math.sin(ego.yaw);
  const toCar = (dx, dy) => [c * dx + s * dy, -s * dx + c * dy]; // rotate world delta by -yaw: x forward, y left

  const lookahead = [];
  let i = 0;
  for (let k = 0; k < la.length; k++) {
    const p = track.sample(ego.s + la[k]);
    const [lx, ly] = toCar(p.x - ego.x, p.y - ego.y);
    raw[i++] = lx; raw[i++] = ly;
    lookahead.push({ ...p, d: la[k], lx, ly });
  }
  for (let k = 0; k < la.length; k++) raw[i++] = lookahead[k].hw;
  raw[i++] = ego.lateral;
  raw[i++] = wrapAngle(ego.headingErr);
  for (const v of ego.velBody) raw[i++] = v;
  for (const w of ego.angVelBody) raw[i++] = w;
  for (const w of ego.wheelSpin) raw[i++] = w;
  raw[i++] = ego.steer;
  raw[i++] = ego.prevAction[0];
  raw[i++] = ego.prevAction[1];

  // opponents: nearest first, ego frame, zero-padded
  const feats = opponents.map((o) => {
    const [rx, ry] = toCar(o.x - ego.x, o.y - ego.y);
    const [rvx, rvy] = toCar(o.vx - ego.velWorld[0], o.vy - ego.velWorld[1]);
    return { dist: Math.hypot(o.x - ego.x, o.y - ego.y), f: [rx, ry, rvx, rvy, o.size], ref: o };
  }).sort((a, b) => a.dist - b.dist);
  const slots = [];
  for (let k = 0; k < nOpp; k++) {
    const f = feats[k] ? feats[k].f : new Array(dOpp).fill(0);
    slots.push(feats[k] ? feats[k].ref : null);
    for (const v of f) raw[i++] = v;
  }

  const scaled = new Float32Array(contract.size);
  for (let k = 0; k < contract.size; k++) scaled[k] = raw[k] * contract.scale[k];
  return { raw, scaled, lookahead, slots };
}
