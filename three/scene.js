// Renderer, cameras, lights and the CSS2D label layer. MuJoCo is z-up, so the scene is z-up too.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export const CAMERA_MODES = ["chase", "overhead", "free"];

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const css2d = new CSS2DRenderer();
  css2d.domElement.style.position = "absolute";
  css2d.domElement.style.top = "0";
  css2d.domElement.style.left = "0";
  css2d.domElement.style.pointerEvents = "none";
  container.appendChild(css2d.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);
  scene.fog = new THREE.Fog(0x0b0f14, 120, 420);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.set(-12, 0, 6);
  camera.up.set(0, 0, 1);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enabled = false;

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x3a3630, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(40, -60, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 300;
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0.35, 0.36, 0.34).multiplyScalar(0.55), roughness: 1 })
  );
  ground.position.z = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(600, 60, 0x1f2a36, 0x16202a);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.006;
  scene.add(grid);

  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px";
    renderer.domElement.style.height = h + "px";
    css2d.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  const state = { mode: "chase", smoothPos: camera.position.clone(), smoothLook: new THREE.Vector3(), snap: true, freeOffset: { dx: -14, dy: 0, dz: 8 } };
  const tmp = new THREE.Vector3(), look = new THREE.Vector3();

  function setMode(mode) {
    state.mode = mode;
    controls.enabled = mode === "free";
    if (mode === "free") {
      controls.target.copy(state.smoothLook);
      controls.update();
    }
  }

  /** Call every frame with the ego pose; moves the camera according to the current mode. */
  function follow(x, y, yaw, dt) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    if (state.mode === "chase") {
      tmp.set(x - 11 * c, y - 11 * s, 5.5);
      look.set(x + 8 * c, y + 8 * s, 0.8);
      const k = state.snap ? 1 : 1 - Math.exp(-dt * 4);
      state.smoothPos.lerp(tmp, k);
      state.smoothLook.lerp(look, k);
      camera.position.copy(state.smoothPos);
      camera.up.set(0, 0, 1);
      camera.lookAt(state.smoothLook);
    } else if (state.mode === "overhead") {
      tmp.set(x + 12 * c, y + 12 * s, 48);
      look.set(x + 12 * c, y + 12 * s, 0);
      const k = state.snap ? 1 : 1 - Math.exp(-dt * 3);
      state.smoothPos.lerp(tmp, k);
      state.smoothLook.lerp(look, k);
      camera.position.copy(state.smoothPos);
      camera.up.set(c, s, 0); // track ahead points up on screen
      camera.lookAt(state.smoothLook);
    } else {
      // free orbit: keep the target on the car, keep the user's offset
      if (state.snap) { const o = state.freeOffset; controls.target.set(x, y, 0.5); camera.position.set(x + o.dx * c - o.dy * s, y + o.dx * s + o.dy * c, o.dz); }
      const delta = new THREE.Vector3(x, y, 0.5).sub(controls.target);
      controls.target.add(delta);
      camera.position.add(delta);
      controls.update();
      state.smoothPos.copy(camera.position);
      state.smoothLook.copy(controls.target);
    }
    state.snap = false;
    sun.position.set(x + 40, y - 60, 90);
    sun.target.position.set(x, y, 0);
  }

  function snap() { state.snap = true; }
  /** Where the free camera starts relative to the car (car frame: dx forward, dy left, dz up), applied on the next snap. */
  function setFreeOffset(dx, dy, dz) { state.freeOffset = { dx, dy, dz }; }

  function render() {
    renderer.render(scene, camera);
    css2d.render(scene, camera);
  }

  return { renderer, css2d, scene, camera, controls, resize, setMode, follow, render, snap, setFreeOffset, state };
}
