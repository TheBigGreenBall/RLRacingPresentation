// The parameterized car, built from the same dimensions as rlracing/cars/template.py (see public/data/car.json).
import * as THREE from "three";

const rgba = (c) => new THREE.Color(c[0], c[1], c[2]);

/**
 * Build a car group whose origin is the MuJoCo body origin (axle height, z = wheel_radius above ground).
 * Returns the group; group.userData holds {fl, fr} hub groups (steer about z) and the four wheel meshes (spin about y).
 */
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
  g.add(cabin);

  // two small headlights so the forward direction reads at a glance
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe08a, emissiveIntensity: 0.8 });
  for (const sy of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.14), lampMat);
    lamp.position.set(geo.chassis_half[0] + 0.02, sy * (geo.chassis_half[1] - 0.3), geo.chassis_center_z - geo.body_origin_z + 0.05);
    g.add(lamp);
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
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    wheel.add(tire, rim);
    wheel.name = `wheel_${tag}`;
    hub.add(wheel);
    g.add(hub);
    hubs[tag] = hub;
    wheels.push(wheel);
  }
  g.userData = { hubs, wheels, mats: [chassisMat, cabinMat, tireMat, rimMat, lampMat], color: chassisMat.color.clone() };
  return g;
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
