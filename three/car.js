// The parameterized car, built from the same dimensions as rlracing/cars/template.py (see public/data/car.json).
import * as THREE from "three";

const rgba = (c) => new THREE.Color(c[0], c[1], c[2]);

/**
 * Build a car group whose origin is the MuJoCo body origin (axle height, z = wheel_radius above ground).
 * Returns the group; group.userData holds {fl, fr} hub groups (steer about z) and the four wheel meshes (spin about y).
 */
/** Geometry derived from a CarConfig; mirrors rlracing/cars/config.py footprint and scripts/export_assets.py. */
export function carGeometry(cfg) {
  const length = cfg.wheelbase + 2 * cfg.wheel_radius * 0.8, width = cfg.track_width + cfg.wheel_width + 0.10, body_h = 0.30;
  return {
    length, width, body_h, body_origin_z: cfg.wheel_radius,
    chassis_half: [length / 2, width / 2, body_h / 2], chassis_center_z: cfg.com_height,
    cabin_half: [length * 0.22, width * 0.38, 0.16],
    cabin_pos_rel_body: [-length * 0.08, 0, cfg.com_height - cfg.wheel_radius + body_h / 2 + 0.16],
    hub_xy: {
      fl: [cfg.wheelbase / 2, cfg.track_width / 2], fr: [cfg.wheelbase / 2, -cfg.track_width / 2],
      rl: [-cfg.wheelbase / 2, cfg.track_width / 2], rr: [-cfg.wheelbase / 2, -cfg.track_width / 2],
    },
  };
}

export function buildCar(carJson, color) {
  const d = carJson.defaults, geo = carJson.geometry;
  const g = new THREE.Group();
  g.name = "car";

  const chassisMat = new THREE.MeshStandardMaterial({ color: rgba(color || geo.chassis_rgba), roughness: 0.45, metalness: 0.25 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2 * geo.chassis_half[0], 2 * geo.chassis_half[1], 2 * geo.chassis_half[2]), chassisMat);
  chassis.position.set(0, 0, geo.chassis_center_z - geo.body_origin_z);
  chassis.castShadow = true;
  chassis.name = "chassis";
  g.add(chassis);

  const cabinMat = new THREE.MeshStandardMaterial({ color: rgba(geo.cabin_rgba), roughness: 0.3, metalness: 0.4 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2 * geo.cabin_half[0], 2 * geo.cabin_half[1], 2 * geo.cabin_half[2]), cabinMat);
  cabin.position.set(...geo.cabin_pos_rel_body);
  cabin.castShadow = true;
  cabin.name = "cabin";
  g.add(cabin);

  // two small headlights so the forward direction reads at a glance
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe08a, emissiveIntensity: 0.8 });
  const lamps = [];
  for (const sy of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.14), lampMat);
    lamp.position.set(geo.chassis_half[0] + 0.02, sy * (geo.chassis_half[1] - 0.3), geo.chassis_center_z - geo.body_origin_z + 0.05);
    g.add(lamp);
    lamps.push(lamp);
  }

  const tireMat = new THREE.MeshStandardMaterial({ color: rgba(geo.tire_rgba), roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.3, metalness: 0.7 });
  const tireGeo = new THREE.CylinderGeometry(d.wheel_radius, d.wheel_radius, d.wheel_width, 24); // axis = y = axle
  const rimGeo = new THREE.CylinderGeometry(d.wheel_radius * 0.55, d.wheel_radius * 0.55, d.wheel_width + 0.01, 6);
  const hubs = {}, wheels = [];
  for (const [tag, xy] of Object.entries(geo.hub_xy)) {
    const hub = new THREE.Group();
    hub.position.set(xy[0], xy[1], 0);
    hub.name = `hub_${tag}`;
    const wheel = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat.clone()); // own material so a single wheel can glow
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    wheel.add(tire, rim);
    wheel.name = `wheel_${tag}`;
    hub.add(wheel);
    g.add(hub);
    hubs[tag] = hub;
    wheels.push(wheel);
  }
  g.userData = {
    hubs, wheels, lamps, chassis, cabin, mats: [chassisMat, cabinMat, tireMat, rimMat, lampMat], color: chassisMat.color.clone(),
    base: { geo, wheel_radius: d.wheel_radius, wheel_width: d.wheel_width },
  };
  return g;
}

/**
 * Re-proportion an existing car to a new CarConfig without rebuilding meshes: boxes are scaled, hubs moved,
 * wheels scaled about the axle. `extra.sag` (m) lowers the body on its springs; `extra.steer` (rad) turns the
 * front wheels; `extra.torque` in [0, 1] and `extra.driveFront` in [0, 1] make the driven tyres glow (`extra.glowColor`, default red).
 * Returns the derived geometry (its body_origin_z is the new axle height to pose the car at).
 */
export function reshapeCar(car, cfg, extra = {}) {
  const u = car.userData, b = u.base, geo = carGeometry(cfg), sag = extra.sag || 0;
  u.chassis.scale.set(geo.chassis_half[0] / b.geo.chassis_half[0], geo.chassis_half[1] / b.geo.chassis_half[1], 1);
  u.chassis.position.z = geo.chassis_center_z - geo.body_origin_z - sag;
  u.cabin.scale.set(geo.cabin_half[0] / b.geo.cabin_half[0], geo.cabin_half[1] / b.geo.cabin_half[1], 1);
  u.cabin.position.set(geo.cabin_pos_rel_body[0], 0, geo.cabin_pos_rel_body[2] - sag);
  u.lamps.forEach((lamp, i) => lamp.position.set(geo.chassis_half[0] + 0.02, (i ? 1 : -1) * (geo.chassis_half[1] - 0.3), geo.chassis_center_z - geo.body_origin_z + 0.05 - sag));
  for (const [tag, hub] of Object.entries(u.hubs)) hub.position.set(geo.hub_xy[tag][0], geo.hub_xy[tag][1], 0);
  const rs = cfg.wheel_radius / b.wheel_radius, ws = cfg.wheel_width / b.wheel_width;
  for (const w of u.wheels) w.scale.set(rs, ws, rs);
  if (extra.steer !== undefined) steerCar(car, extra.steer);
  if (extra.torque !== undefined) {
    const df = extra.driveFront ?? 0;
    for (const w of u.wheels) {
      const front = w.name === "wheel_fl" || w.name === "wheel_fr";
      const glow = extra.torque * (front ? df : 1 - df);
      w.children[0].material.emissive.set(extra.glowColor ?? 0xff4d3d);
      w.children[0].material.emissiveIntensity = 0.9 * glow;
    }
  }
  return geo;
}

/** Pose helper: x, y in the world, yaw about z; the body origin sits at axle height. */
export function poseCar(car, x, y, yaw, zBody) {
  car.position.set(x, y, zBody);
  car.rotation.set(0, 0, yaw);
}

export function steerCar(car, steerRad) {
  car.userData.hubs.fl.rotation.z = steerRad;
  car.userData.hubs.fr.rotation.z = steerRad;
}

export function spinWheels(car, dAngle) {
  for (const w of car.userData.wheels) w.rotation.y -= dAngle;
}
