import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Exploder } from './engine/exploder';
import { loadEngine, type EnginePart, type LoadedEngine } from './engine/loadEngine';
import { SYSTEM_META, TEACHING, type SystemKey } from './data/teaching';
import './style.css';

const assetBase = import.meta.env.BASE_URL;

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const container = must<HTMLDivElement>('#scene-container');
const loading = must<HTMLDivElement>('#loading');
const loadingBar = must<HTMLDivElement>('#loading-bar');
const loadingPercent = must<HTMLSpanElement>('#loading-percent');
const errorPanel = must<HTMLDivElement>('#error');
const errorMessage = must<HTMLParagraphElement>('#error-message');

const explodeInput = must<HTMLInputElement>('#explode');
const explodeValue = must<HTMLOutputElement>('#explode-value');
const spinButton = must<HTMLButtonElement>('#btn-spin');
const cutButton = must<HTMLButtonElement>('#btn-cut');
const flowButton = must<HTMLButtonElement>('#btn-flow');
const resetButton = must<HTMLButtonElement>('#btn-reset');

const partCard = must<HTMLElement>('#part-card');
const partIndex = must<HTMLSpanElement>('#part-index');
const partSystem = must<HTMLParagraphElement>('#part-system');
const partTitle = must<HTMLHeadingElement>('#part-title');
const partWhat = must<HTMLParagraphElement>('#part-what');
const partWhyWrap = must<HTMLElement>('#part-why-wrap');
const partWhy = must<HTMLParagraphElement>('#part-why');
const partHintWrap = must<HTMLElement>('#part-hint-wrap');
const partHint = must<HTMLParagraphElement>('#part-hint');
const partOrder = must<HTMLParagraphElement>('#part-order');
const partClose = must<HTMLButtonElement>('#part-close');
const partSelect = must<HTMLSelectElement>('#part-select');

const hoverLabel = must<HTMLDivElement>('#hover-label');
const hoverName = must<HTMLSpanElement>('#hover-name');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b0f11, 0.016);

const camera = new THREE.PerspectiveCamera(
  34,
  container.clientWidth / container.clientHeight,
  0.05,
  100,
);
camera.position.set(5, 1.8, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.65;
controls.zoomSpeed = 0.8;
controls.autoRotateSpeed = 0.45;
controls.minPolarAngle = Math.PI * 0.08;
controls.maxPolarAngle = Math.PI * 0.86;
controls.target.set(0, -1.5, 0);
controls.autoRotate = !reduceMotion;
controls.update();

const pmrem = new THREE.PMREMGenerator(renderer);
const environment = new RoomEnvironment();
scene.environment = pmrem.fromScene(environment, 0.04).texture;
pmrem.dispose();

const keyLight = new THREE.DirectionalLight(0xffd4ac, 2.6);
keyLight.position.set(5, 7, 4);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x6fb7c9, 1.35);
fillLight.position.set(-6, 3, 3);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xff8a55, 2.1);
rimLight.position.set(-2, 4, -6);
scene.add(rimLight);

scene.add(new THREE.HemisphereLight(0xa9d3dd, 0x1a1210, 0.3));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let engine: LoadedEngine | null = null;
let exploder: Exploder | null = null;
let stand: THREE.Group | null = null;
const standMaterials: Array<{ material: THREE.LineBasicMaterial; opacity: number }> = [];

let selected: EnginePart | null = null;
let hovered: EnginePart | null = null;
let spinEnabled = false;
let cutEnabled = false;
let flowEnabled = false;
let flowPending = false;
let autoRotate = !reduceMotion;
let isDragging = false;
let pointerInside = false;
let pointerOverUI = false;
let pointerX = 0;
let pointerY = 0;

const pointer = new THREE.Vector2(0, 0);
const raycaster = new THREE.Raycaster();

const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
const initialPosition = new THREE.Vector3();
const initialTarget = new THREE.Vector3();

let preFocusPosition: THREE.Vector3 | null = null;
let preFocusTarget: THREE.Vector3 | null = null;

interface MaterialState {
  material: THREE.Material;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
}

let materialStates: MaterialState[] = [];

interface CameraMove {
  startPosition: THREE.Vector3;
  endPosition: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  startTime: number;
  duration: number;
}

let cameraMove: CameraMove | null = null;
let hasInteracted = false;
let autoFit = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isMeshStandard = (material: THREE.Material): material is THREE.MeshStandardMaterial =>
  material instanceof THREE.MeshStandardMaterial;

function updateExplodeUI(percent: number): void {
  const value = Math.max(0, Math.min(100, percent));
  explodeValue.textContent = `${Math.round(value)}%`;
  explodeInput.style.setProperty('--val', `${value}%`);
}

function inferSystem(part: EnginePart): SystemKey {
  const name = part.spec.node;
  if (name.includes('Oxidizer') || name.includes('Ox')) return 'oxidizer';
  if (name.includes('Fuel')) return 'fuel';
  if (/Chamber|Nozzle|Injector|Turbine|Coolant/.test(name)) return 'hot';
  return 'structure';
}

function setPartHighlight(part: EnginePart, mode: 'none' | 'hover' | 'selected'): void {
  const intensity = mode === 'selected' ? 0.46 : mode === 'hover' ? 0.2 : 0;
  for (const material of part.standardMaterials) material.emissiveIntensity = intensity;
}

function updateCard(part: EnginePart): void {
  if (!engine) return;

  const note = TEACHING[part.spec.node];
  const system = note?.system ?? inferSystem(part);
  const systemMeta = SYSTEM_META[system];

  partCard.dataset.system = system;
  partSystem.textContent = systemMeta.label;
  partTitle.textContent = note?.title ?? part.spec.title;
  partWhat.textContent = note?.what ?? part.spec.description;

  if (note?.why) {
    partWhyWrap.hidden = false;
    partWhy.textContent = note.why;
  } else {
    partWhyWrap.hidden = true;
    partWhy.textContent = '';
  }

  if (note?.hint) {
    partHintWrap.hidden = false;
    partHint.textContent = note.hint;
  } else {
    partHintWrap.hidden = true;
    partHint.textContent = '';
  }

  partIndex.textContent = `${String(part.index + 1).padStart(2, '0')} / ${String(
    engine.manifest.parts.length,
  ).padStart(2, '0')}`;

  const spin = part.spec.spin
    ? ` · 自转 ${part.spec.spin.rev_per_s > 0 ? '+' : ''}${part.spec.spin.rev_per_s.toFixed(
        1,
      )} rev/s`
    : '';
  partOrder.textContent = `分离顺序 ${String(part.spec.explode_order).padStart(2, '0')} / ${String(
    engine.maxOrder,
  ).padStart(2, '0')}${spin}`;
}

function openCard(): void {
  partCard.classList.add('is-open');
  partCard.setAttribute('aria-hidden', 'false');
  partCard.removeAttribute('inert');
  document.body.classList.add('has-selection');
}

function closeCard(): void {
  partCard.classList.remove('is-open');
  partCard.setAttribute('aria-hidden', 'true');
  partCard.setAttribute('inert', '');
  document.body.classList.remove('has-selection');
}

function setHover(part: EnginePart | null): void {
  if (hovered === part) return;

  if (hovered && hovered !== selected) setPartHighlight(hovered, 'none');
  hovered = part;

  if (!part) {
    hoverLabel.classList.remove('is-visible');
    renderer.domElement.style.cursor = '';
    return;
  }

  if (part !== selected) setPartHighlight(part, 'hover');
  const note = TEACHING[part.spec.node];
  const system = note?.system ?? inferSystem(part);
  hoverLabel.dataset.system = system;
  hoverName.textContent = note?.title ?? part.spec.title;
  hoverLabel.classList.add('is-visible');
  positionHoverLabel();
  renderer.domElement.style.cursor = 'pointer';
}

function positionHoverLabel(): void {
  const x = Math.min(pointerX + 16, window.innerWidth - 220);
  const y = Math.min(pointerY + 16, window.innerHeight - 90);
  hoverLabel.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function moveCamera(position: THREE.Vector3, target: THREE.Vector3, duration = 800): void {
  autoFit = false;

  if (reduceMotion) {
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
    return;
  }

  cameraMove = {
    startPosition: camera.position.clone(),
    endPosition: position.clone(),
    startTarget: controls.target.clone(),
    endTarget: target.clone(),
    startTime: performance.now(),
    duration,
  };
  controls.enabled = false;
  controls.autoRotate = false;
}

function cancelCameraMove(): void {
  if (!cameraMove) return;
  cameraMove = null;
  controls.enabled = true;
}

function focusPart(part: EnginePart): void {
  const box = new THREE.Box3().setFromObject(part.object);
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 1e-6) direction.set(0.72, 0.2, 1);
  direction.normalize();

  const mobile = window.innerWidth < 760;
  const framing = framingForBounds(box, direction, mobile ? 2.1 : 1.75, 0);
  const distance = Math.max(framing.distance, mobile ? 1.6 : 1.2);
  const target = framing.target.clone();
  const position = target.clone().add(direction.clone().multiplyScalar(distance));

  if (mobile) {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const visibleHeight = 2 * distance * Math.tan(fov / 2);
    const shift = visibleHeight * 0.18;
    target.y -= shift;
    position.y -= shift;
  }

  moveCamera(position, target, 760);
}

function selectPart(part: EnginePart | null, restoreCamera = true): void {
  if (selected === part) return;

  if (selected) setPartHighlight(selected, 'none');
  selected = part;

  if (!part) {
    closeCard();
    if (restoreCamera && preFocusPosition && preFocusTarget) {
      moveCamera(preFocusPosition, preFocusTarget, 720);
    }
    preFocusPosition = null;
    preFocusTarget = null;
    if (hovered) setPartHighlight(hovered, 'hover');
    return;
  }

  if (!preFocusPosition || !preFocusTarget) {
    preFocusPosition = camera.position.clone();
    preFocusTarget = controls.target.clone();
  }

  setPartHighlight(part, 'selected');
  updateCard(part);
  openCard();
  autoRotate = false;
  focusPart(part);
}

function setupMaterialStates(): void {
  if (!engine) return;
  materialStates = engine.partMaterials.map((material) => ({
    material,
    transparent: material.transparent,
    opacity: material.opacity,
    depthWrite: material.depthWrite,
  }));
}

function setEngineGhosted(ghosted: boolean): void {
  for (const state of materialStates) {
    const material = state.material;
    if (ghosted) {
      material.transparent = true;
      material.opacity = 0.16;
      material.depthWrite = false;
    } else {
      material.transparent = state.transparent;
      material.opacity = state.opacity;
      material.depthWrite = state.depthWrite;
    }
    material.needsUpdate = true;
  }
}

function setSpinEnabled(on: boolean): void {
  spinEnabled = on;
  spinButton.classList.toggle('is-active', on);
  spinButton.setAttribute('aria-pressed', String(on));
}

function setCutEnabled(on: boolean): void {
  if (!engine) return;
  cutEnabled = on;

  if (on) {
    const center = engine.bounds.getCenter(new THREE.Vector3());
    cutPlane.normal.set(0, 0, -1);
    cutPlane.constant = center.z;
  }

  for (const part of engine.parts) {
    const clipped = on && part.spec.cut !== false;
    for (const material of part.allMaterials) {
      material.clippingPlanes = clipped ? [cutPlane] : null;
      material.clipShadows = clipped;
      material.needsUpdate = true;
    }
  }

  cutButton.classList.toggle('is-active', on);
  cutButton.setAttribute('aria-pressed', String(on));
}

function setFlowEnabled(on: boolean): void {
  if (!engine) return;
  flowEnabled = on;
  flowButton.classList.toggle('is-active', on);
  flowButton.setAttribute('aria-pressed', String(on));

  if (!on) {
    flowPending = false;
    for (const mesh of engine.flowMeshes) mesh.visible = false;
    setEngineGhosted(false);
  } else {
    flowPending = true;
  }
}

type Lens = 'spin' | 'cut' | 'flow';

function enterLens(lens: Lens): void {
  if (!engine || !exploder) return;

  const wasActive =
    lens === 'spin' ? spinEnabled : lens === 'cut' ? cutEnabled : flowEnabled;

  setSpinEnabled(false);
  setCutEnabled(false);
  setFlowEnabled(false);
  selectPart(null, false);
  cancelCameraMove();
  exploder.setProgress(0);
  explodeInput.value = '0';
  updateExplodeUI(0);
  autoRotate = false;
  autoFit = true;
  document.body.classList.remove('is-exploding');

  if (wasActive) return;

  if (lens === 'spin') setSpinEnabled(true);
  if (lens === 'cut') setCutEnabled(true);
  if (lens === 'flow') setFlowEnabled(true);
}

function updateFlowPending(): void {
  if (!engine || !exploder || !flowEnabled || !flowPending) return;
  if (exploder.progress >= 0.03) return;

  flowPending = false;
  for (const mesh of engine.flowMeshes) mesh.visible = true;
  setEngineGhosted(true);
}

function updateSpin(dt: number): void {
  if (!engine || !exploder) return;
  const active = spinEnabled && exploder.progress < 0.4;

  for (const part of engine.parts) {
    if (!part.rotor) continue;
    if (active) {
      part.rotor.angle = THREE.MathUtils.euclideanModulo(
        part.rotor.angle + part.rotor.revPerSecond * Math.PI * 2 * dt,
        Math.PI * 2,
      );
    }
    const rotation = new THREE.Quaternion().setFromAxisAngle(part.rotor.axis, part.rotor.angle);
    part.object.quaternion.copy(part.baseQuaternion).multiply(rotation);
  }
}

function updateFlowAnimation(time: number): void {
  if (!engine || !flowEnabled) return;
  engine.flowMaterials.forEach((material, index) => {
    if (!isMeshStandard(material)) return;
    material.emissiveIntensity = 0.34 + 0.12 * Math.sin(time * 2.6 + index * 1.4);
  });
}

function pickPart(clientX: number, clientY: number): EnginePart | null {
  if (!engine) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  pointer.set(x, y);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(engine.pickMeshes, false)[0];
  return (hit?.object.userData.part as EnginePart | undefined) ?? null;
}

function updateHoverRaycast(): void {
  if (!engine) return;
  if (!pointerInside || pointerOverUI || isDragging || cameraMove) {
    if (cameraMove || !pointerInside || pointerOverUI) setHover(null);
    return;
  }

  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(engine.pickMeshes, false)[0];
  setHover((hit?.object.userData.part as EnginePart | undefined) ?? null);
}

function updateCameraMove(now: number): void {
  if (!cameraMove) return;

  const t = Math.min(1, (now - cameraMove.startTime) / cameraMove.duration);
  const eased = 1 - Math.pow(1 - t, 3);
  camera.position.lerpVectors(cameraMove.startPosition, cameraMove.endPosition, eased);
  controls.target.lerpVectors(cameraMove.startTarget, cameraMove.endTarget, eased);

  if (t >= 1) {
    cameraMove = null;
    controls.enabled = true;
  }
}

function resetAll(): void {
  if (!engine || !exploder) return;

  setSpinEnabled(false);
  setCutEnabled(false);
  setFlowEnabled(false);
  selectPart(null, false);
  exploder.setProgress(0);
  explodeInput.value = '0';
  updateExplodeUI(0);

  for (const part of engine.parts) {
    if (!part.rotor) continue;
    part.rotor.angle = 0;
    part.object.quaternion.copy(part.baseQuaternion);
  }

  preFocusPosition = null;
  preFocusTarget = null;
  autoRotate = !reduceMotion;
  document.body.classList.remove('is-exploding');

  const framing = framingForBounds(engine.bounds);
  initialPosition.copy(framing.position);
  initialTarget.copy(framing.target);
  moveCamera(initialPosition, initialTarget, 760);
}

// ---------------------------------------------------------------------------
// Test stand and framing
// ---------------------------------------------------------------------------

function createStand(bounds: THREE.Box3): THREE.Group {
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) * 0.82 + 0.45;
  const y = bounds.min.y - 0.26;
  const group = new THREE.Group();

  const copperMaterial = new THREE.LineBasicMaterial({
    color: 0xd08a5a,
    transparent: true,
    opacity: 0.35,
  });
  const faintMaterial = new THREE.LineBasicMaterial({
    color: 0x9aa7a4,
    transparent: true,
    opacity: 0.1,
  });

  const outerPoints: THREE.Vector3[] = [];
  const innerPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 160; i += 1) {
    const angle = (i / 160) * Math.PI * 2;
    outerPoints.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    innerPoints.push(
      new THREE.Vector3(Math.cos(angle) * radius * 0.58, y, Math.sin(angle) * radius * 0.58),
    );
  }

  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outerPoints), copperMaterial));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(innerPoints), faintMaterial));

  const tickPositions: number[] = [];
  for (let i = 0; i < 72; i += 1) {
    const angle = (i / 72) * Math.PI * 2;
    const r0 = radius * 1.005;
    const r1 = r0 + (i % 9 === 0 ? 0.16 : 0.06);
    tickPositions.push(
      Math.cos(angle) * r0,
      y,
      Math.sin(angle) * r0,
      Math.cos(angle) * r1,
      y,
      Math.sin(angle) * r1,
    );
  }

  const tickGeometry = new THREE.BufferGeometry();
  tickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tickPositions, 3));
  group.add(new THREE.LineSegments(tickGeometry, copperMaterial));
  group.renderOrder = -1;

  return group;
}

interface Framing {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
}

function framingForBounds(
  bounds: THREE.Box3,
  direction = new THREE.Vector3(0.78, 0.24, 1).normalize(),
  margin = 1.5,
  targetOffsetY = window.innerWidth < 760 ? -0.02 : 0.035,
): Framing {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const fitHeight = size.y / 2 / Math.tan(fov / 2);
  const fitWidth = size.x / 2 / Math.tan(fov / 2) / camera.aspect;
  const distance = Math.max(fitHeight, fitWidth) * margin;
  const target = center.clone().add(new THREE.Vector3(0, -size.y * targetOffsetY, 0));

  return {
    position: target.clone().add(direction.clone().normalize().multiplyScalar(distance)),
    target,
    distance,
  };
}

function updateAutoFit(dt: number): void {
  if (!engine || !exploder) return;

  const bounds = exploder.boundsAt(exploder.progress);
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 1e-6) direction.set(0.78, 0.24, 1);
  direction.normalize();

  const mobile = window.innerWidth < 760;
  const framing = framingForBounds(
    bounds,
    direction,
    mobile ? 1.55 : 1.42,
    mobile ? 0.07 : 0.045,
  );
  const alpha = 1 - Math.exp(-4.5 * dt);

  camera.position.lerp(framing.position, alpha);
  controls.target.lerp(framing.target, alpha);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function setLoading(fraction: number): void {
  const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  loadingBar.style.width = `${percent}%`;
  loadingPercent.textContent = `${percent}%`;
}

function hideLoading(): void {
  loading.classList.add('is-done');
  window.setTimeout(() => {
    loading.style.display = 'none';
  }, 620);
}

function showError(error: unknown): void {
  console.error(error);
  loading.classList.add('is-done');
  errorPanel.hidden = false;
  errorMessage.textContent = error instanceof Error ? error.message : String(error);
}

async function boot(): Promise<void> {
  try {
    const loaded = await loadEngine(
      `${assetBase}assets/full-flow_d.glb`,
      `${assetBase}assets/full-flow.json`,
      (fraction) => {
        setLoading(fraction);
      },
    );

    engine = loaded;
    exploder = new Exploder(loaded.parts, loaded.maxOrder, reduceMotion);
    scene.add(loaded.root);

    for (const part of loaded.parts) {
      const option = document.createElement('option');
      option.value = part.spec.node;
      const note = TEACHING[part.spec.node];
      option.textContent = `${String(part.index + 1).padStart(2, '0')} · ${
        note?.title ?? part.spec.title
      }`;
      partSelect.appendChild(option);
    }

    stand = createStand(loaded.bounds);
    scene.add(stand);
    stand.traverse((object) => {
      if (!(object instanceof THREE.Line || object instanceof THREE.LineSegments)) return;
      const material = object.material;
      if (material instanceof THREE.LineBasicMaterial) {
        standMaterials.push({ material, opacity: material.opacity });
      }
    });

    const framing = framingForBounds(loaded.bounds);
    initialPosition.copy(framing.position);
    initialTarget.copy(framing.target);
    controls.target.copy(framing.target);
    controls.minDistance = 0.6;
    controls.maxDistance = framing.distance * 3.2;

    const startPosition = framing.target
      .clone()
      .add(framing.position.clone().sub(framing.target).multiplyScalar(1.22));

    camera.position.copy(reduceMotion ? framing.position : startPosition);
    controls.update();

    setupMaterialStates();
    updateExplodeUI(0);

    setLoading(1);
    window.setTimeout(hideLoading, 260);

    if (!reduceMotion) moveCamera(framing.position, framing.target, 1500);
  } catch (error) {
    showError(error);
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

explodeInput.addEventListener('input', () => {
  if (!exploder) return;
  const percent = Number(explodeInput.value);
  updateExplodeUI(percent);
  exploder.setProgress(percent / 100);
  autoRotate = false;
  hasInteracted = true;
  cancelCameraMove();
  autoFit = true;
  document.body.classList.toggle('is-exploding', percent > 0.01);

  if (spinEnabled) setSpinEnabled(false);
  if (cutEnabled) setCutEnabled(false);
  if (flowEnabled) setFlowEnabled(false);
  if (selected) selectPart(null, false);
});

spinButton.addEventListener('click', () => enterLens('spin'));
cutButton.addEventListener('click', () => enterLens('cut'));
flowButton.addEventListener('click', () => enterLens('flow'));
resetButton.addEventListener('click', resetAll);
partClose.addEventListener('click', () => selectPart(null, true));

partSelect.addEventListener('change', () => {
  if (!engine) return;
  const part = engine.parts.find((item) => item.spec.node === partSelect.value) ?? null;
  if (part) selectPart(part);
  partSelect.value = '';
});

controls.addEventListener('start', () => {
  hasInteracted = true;
  autoRotate = false;
  autoFit = false;
  isDragging = true;
  setHover(null);
  cancelCameraMove();
});

controls.addEventListener('end', () => {
  isDragging = false;
});

let pointerDown = { x: 0, y: 0, time: 0 };

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
  cancelCameraMove();
});

renderer.domElement.addEventListener('pointerup', (event) => {
  const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  const elapsed = performance.now() - pointerDown.time;
  if (distance > 6 || elapsed > 650) return;

  const part = pickPart(event.clientX, event.clientY);
  if (part) {
    if (part === selected) selectPart(null);
    else selectPart(part);
  } else {
    selectPart(null);
  }
});

window.addEventListener('pointermove', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const overUI = Boolean(
    target?.closest('button, input, select, .console, .part-card, .intro, .topbar, .loading, .error'),
  );

  pointerOverUI = overUI;
  if (overUI) {
    setHover(null);
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  pointerX = event.clientX;
  pointerY = event.clientY;
  pointerInside = true;

  if (hovered) positionHoverLabel();
});

window.addEventListener('pointerleave', () => {
  pointerInside = false;
  setHover(null);
});

window.addEventListener('keydown', (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest('input, select, textarea')) {
    if (event.key === 'Escape') {
      target.blur();
      selectPart(null);
    }
    return;
  }

  if (event.key === 'Escape') selectPart(null);
  if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    resetAll();
  }
});

function onResize(): void {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  if (engine && !hasInteracted && !cameraMove) {
    const framing = framingForBounds(engine.bounds);
    initialPosition.copy(framing.position);
    initialTarget.copy(framing.target);
    camera.position.copy(framing.position);
    controls.target.copy(framing.target);
    controls.update();
  }
}

window.addEventListener('resize', onResize);

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate(now: number): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  if (engine && exploder) {
    exploder.update(dt);
    updateSpin(dt);
    updateFlowAnimation(elapsed);
    updateFlowPending();

    if (stand) {
      const fade = 1 - Math.min(1, Math.max(0, (exploder.progress - 0.15) / 0.5));
      for (const entry of standMaterials) entry.material.opacity = entry.opacity * fade;
      stand.visible = fade > 0.02;
    }
  }

  if (cameraMove) {
    updateCameraMove(now);
    camera.lookAt(controls.target);
  } else if (autoFit && engine && exploder && !selected) {
    updateAutoFit(dt);
    controls.autoRotate = false;
    controls.update();
  } else {
    controls.autoRotate = autoRotate && !selected && !reduceMotion;
    controls.update();
  }

  updateHoverRaycast();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
void boot();
