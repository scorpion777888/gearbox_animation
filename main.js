boot().catch(showStartupError);

async function boot() {
const THREE = await import("three");
const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");

const container = document.getElementById("scene-wrap");
const gearReadout = document.getElementById("active-gear");
const ratioReadout = document.getElementById("ratio-readout");
const engineReadout = document.getElementById("engine-readout");
const outputReadout = document.getElementById("output-readout");
const rpmInput = document.getElementById("rpm");
const rpmValue = document.getElementById("rpm-value");
const viewInput = document.getElementById("view");
const viewValue = document.getElementById("view-value");
const casingToggle = document.getElementById("casing-toggle");
const gearButtons = [...document.querySelectorAll(".gear-btn")];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1014);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(6.8, 4.4, 7.8);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5.4;
controls.maxDistance = 14;
controls.target.set(0, -0.05, 0);

const clock = new THREE.Clock();
const root = new THREE.Group();
scene.add(root);

const inputY = 0.95;
const outputY = -0.95;
const shaftGap = inputY - outputY;
const shaftLength = 8.7;
const shaftRadius = 0.115;

const gears = [
  { id: "R", label: "Reverse", ratio: -3.35, teethIn: 14, x: -3.55 },
  { id: "1", label: "1st Gear", ratio: 3.2, teethIn: 15, x: -2.2 },
  { id: "2", label: "2nd Gear", ratio: 2.1, teethIn: 20, x: -0.85 },
  { id: "3", label: "3rd Gear", ratio: 1.45, teethIn: 25, x: 0.5 },
  { id: "4", label: "4th Gear", ratio: 1, teethIn: 30, x: 1.85 },
  { id: "5", label: "5th Gear", ratio: 0.78, teethIn: 34, x: 3.2 }
];

const neutralSlot = { id: "N", label: "Neutral", ratio: 0, x: -0.16 };
const gearMap = new Map(gears.map((gear) => [gear.id, gear]));

let selectedGear = "N";
let engineRpm = Number(rpmInput.value);
let inputAngle = 0;
let outputAngle = 0;
let displayedOutputRpm = 0;
let collarX = neutralSlot.x;
let viewDepth = Number(viewInput.value);

const scratchColor = new THREE.Color();

function canvasTexture(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#9fa3a4");
  gradient.addColorStop(0.45, "#d3d0c6");
  gradient.addColorStop(1, "#62676a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    const shade = 140 + Math.random() * 70;
    ctx.strokeStyle = `rgba(${shade}, ${shade}, ${shade}, 0.16)`;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.random());
    ctx.lineTo(size, y + Math.random());
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 1);
  return texture;
}

const brushed = canvasTexture();

function makeMaterial({ color, roughness = 0.32, metalness = 0.88, emissive = 0x000000, opacity = 1 }) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    emissive,
    emissiveIntensity: 0,
    map: opacity === 1 ? brushed : null,
    transparent: opacity < 1,
    opacity
  });
}

const materials = {
  shaft: makeMaterial({ color: 0x798085, roughness: 0.22 }),
  inputGear: makeMaterial({ color: 0xb7b0a3, roughness: 0.29 }),
  outputGear: makeMaterial({ color: 0x8f9699, roughness: 0.34 }),
  hub: makeMaterial({ color: 0x555c62, roughness: 0.26 }),
  active: makeMaterial({ color: 0xd99b48, roughness: 0.24, emissive: 0xd99b48 }),
  collar: makeMaterial({ color: 0x57c0a1, roughness: 0.2, emissive: 0x57c0a1 }),
  reverse: makeMaterial({ color: 0xa56c67, roughness: 0.3, emissive: 0xd75f5f }),
  casing: new THREE.MeshPhysicalMaterial({
    color: 0x7f8c8d,
    transparent: true,
    opacity: 0.18,
    roughness: 0.12,
    metalness: 0.15,
    transmission: 0.12,
    thickness: 0.55
  }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1f252a, roughness: 0.58, metalness: 0.35 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.72, metalness: 0.08 }),
  glow: new THREE.MeshStandardMaterial({
    color: 0xd99b48,
    emissive: 0xd99b48,
    emissiveIntensity: 1.6,
    transparent: true,
    opacity: 0.78
  })
};

function makeToothedGearGeometry(teeth, pitchRadius, width) {
  const rootRadius = pitchRadius * 0.9;
  const outerRadius = pitchRadius * 1.075;
  const pitch = (Math.PI * 2) / teeth;
  const points = [];

  for (let i = 0; i < teeth; i += 1) {
    const base = i * pitch;
    [
      [base + pitch * 0.03, rootRadius],
      [base + pitch * 0.22, outerRadius],
      [base + pitch * 0.5, outerRadius],
      [base + pitch * 0.78, outerRadius],
      [base + pitch * 0.97, rootRadius]
    ].forEach(([angle, radius]) => {
      points.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
    });
  }

  const shape = new THREE.Shape(points);
  const centerHole = new THREE.Path();
  centerHole.absarc(0, 0, Math.max(0.09, pitchRadius * 0.18), 0, Math.PI * 2, true);
  shape.holes.push(centerHole);

  if (pitchRadius > 0.58) {
    const spokeCount = pitchRadius > 0.95 ? 6 : 5;
    const spokeRadius = pitchRadius * 0.46;
    const cutoutRadius = Math.min(0.12, pitchRadius * 0.12);
    for (let i = 0; i < spokeCount; i += 1) {
      const angle = (Math.PI * 2 * i) / spokeCount;
      const hole = new THREE.Path();
      hole.absarc(
        Math.cos(angle) * spokeRadius,
        Math.sin(angle) * spokeRadius,
        cutoutRadius,
        0,
        Math.PI * 2,
        true
      );
      shape.holes.push(hole);
    }
  }

  const bevel = Math.min(width * 0.12, pitchRadius * 0.045);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel,
    steps: 1,
    curveSegments: 12
  });

  geometry.center();
  geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function makeCylinder({ radius, depth, material, radialSegments = 48 }) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, radialSegments), material);
  mesh.rotation.z = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeShaft(y, z = 0, name = "") {
  const group = new THREE.Group();
  group.position.set(0, y, z);
  group.name = name;
  const shaft = makeCylinder({ radius: shaftRadius, depth: shaftLength, material: materials.shaft, radialSegments: 64 });
  group.add(shaft);
  root.add(group);
  return group;
}

function makeGear(gear, radius, teeth, material, side) {
  const group = new THREE.Group();
  group.position.set(gear.x, side === "input" ? inputY : outputY, 0);
  group.userData.pitchRadius = radius;
  group.userData.baseY = group.position.y;

  const body = new THREE.Mesh(makeToothedGearGeometry(teeth, radius, 0.42), material.clone());
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.baseColor = body.material.color.clone();
  group.add(body);

  const hub = makeCylinder({ radius: Math.max(0.18, radius * 0.28), depth: 0.56, material: materials.hub.clone(), radialSegments: 48 });
  hub.userData.baseColor = hub.material.color.clone();
  group.add(hub);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(0.13, radius * 0.24), 0.018, 12, 48),
    materials.dark.clone()
  );
  ring.rotation.y = Math.PI / 2;
  ring.castShadow = true;
  group.add(ring);

  group.userData.highlightables = [body, hub];
  return group;
}

const inputShaft = makeShaft(inputY, 0, "Input shaft");
const outputShaft = makeShaft(outputY, 0, "Output shaft");

const pairGroups = gears.map((gear) => {
  const ratio = Math.abs(gear.ratio);
  const inputRadius = shaftGap / (1 + ratio);
  const outputRadius = shaftGap - inputRadius;
  const teethOut = Math.max(16, Math.round(gear.teethIn * ratio));
  const inputGear = makeGear(gear, inputRadius, gear.teethIn, materials.inputGear, "input");
  const outputGear = makeGear(gear, outputRadius, teethOut, gear.id === "R" ? materials.reverse : materials.outputGear, "output");

  root.add(inputGear, outputGear);

  return {
    ...gear,
    inputRadius,
    outputRadius,
    teethOut,
    inputGear,
    outputGear,
    outputSpin: 0,
    isReverse: gear.id === "R"
  };
});

const flywheel = new THREE.Group();
flywheel.position.set(-4.55, inputY, 0);
const flywheelDisk = makeCylinder({ radius: 0.66, depth: 0.34, material: materials.dark.clone(), radialSegments: 72 });
const clutchFace = makeCylinder({ radius: 0.45, depth: 0.38, material: materials.active.clone(), radialSegments: 72 });
clutchFace.material.emissiveIntensity = 0.18;
flywheel.add(flywheelDisk, clutchFace);
root.add(flywheel);

const outputFlange = new THREE.Group();
outputFlange.position.set(4.55, outputY, 0);
const flange = makeCylinder({ radius: 0.46, depth: 0.34, material: materials.shaft.clone(), radialSegments: 64 });
const flangeFace = makeCylinder({ radius: 0.3, depth: 0.4, material: materials.hub.clone(), radialSegments: 48 });
outputFlange.add(flange, flangeFace);
root.add(outputFlange);

const collar = new THREE.Group();
collar.position.set(neutralSlot.x, outputY, 0);
const collarBody = makeCylinder({ radius: 0.3, depth: 0.46, material: materials.collar.clone(), radialSegments: 64 });
collarBody.material.emissiveIntensity = 0.32;
collar.add(collarBody);

for (let i = 0; i < 18; i += 1) {
  const angle = (Math.PI * 2 * i) / 18;
  const dog = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.035), materials.collar.clone());
  dog.position.set(0, Math.cos(angle) * 0.36, Math.sin(angle) * 0.36);
  dog.rotation.x = angle;
  dog.castShadow = true;
  collar.add(dog);
}
root.add(collar);

const fork = new THREE.Group();
const forkMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3035, roughness: 0.5, metalness: 0.55 });
const forkBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.08), forkMaterial);
forkBar.position.set(0, outputY + 0.72, 0);
const forkLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.08), forkMaterial);
forkLeft.position.set(0, outputY + 0.28, -0.28);
const forkRight = forkLeft.clone();
forkRight.position.z = 0.28;
fork.add(forkBar, forkLeft, forkRight);
root.add(fork);

const powerLink = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.035, shaftGap, 16),
  materials.glow
);
powerLink.position.set(neutralSlot.x, 0, 0.04);
powerLink.castShadow = true;
powerLink.visible = false;
root.add(powerLink);

const housing = new THREE.Group();
const housingBody = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3.35, 2.45), materials.casing);
housingBody.position.set(-0.06, 0, 0);
housingBody.receiveShadow = true;
housing.add(housingBody);

const edges = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(8.42, 3.37, 2.47)),
  new THREE.LineBasicMaterial({ color: 0x9aa5a8, transparent: true, opacity: 0.32 })
);
edges.position.copy(housingBody.position);
housing.add(edges);
root.add(housing);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 8),
  new THREE.MeshStandardMaterial({ color: 0x14191d, roughness: 0.72, metalness: 0.12 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.18;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(10, 20, 0x424b50, 0x252d32);
grid.position.y = -2.17;
scene.add(grid);

const keyLight = new THREE.DirectionalLight(0xfff0d5, 2.2);
keyLight.position.set(-3.4, 5.4, 4.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 16;
keyLight.shadow.camera.left = -6;
keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 5;
keyLight.shadow.camera.bottom = -5;
scene.add(keyLight);

const fillLight = new THREE.HemisphereLight(0x93c7d8, 0x211914, 1.15);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x57c0a1, 1.5, 7);
rimLight.position.set(3.6, 2.1, -3.4);
scene.add(rimLight);

function setGear(id) {
  selectedGear = id;

  gearButtons.forEach((button) => {
    const isActive = button.dataset.gear === id;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  const selected = gearMap.get(id) || neutralSlot;
  gearReadout.textContent = selected.label;
  ratioReadout.textContent = id === "N" ? "0.00:1" : `${Math.abs(selected.ratio).toFixed(2)}:1`;
  powerLink.visible = id !== "N";

  if (id === "N") {
    powerLink.position.x = neutralSlot.x;
    return;
  }

  powerLink.position.x = selected.x;
  powerLink.material = id === "R" ? materials.reverse : materials.glow;
}

function updateHighlight(activeId, dt) {
  pairGroups.forEach((pair) => {
    const active = pair.id === activeId;
    const targetScale = active ? 1.035 : 1;
    pair.inputGear.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 1 - Math.pow(0.001, dt));
    pair.outputGear.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 1 - Math.pow(0.001, dt));

    [...pair.inputGear.userData.highlightables, ...pair.outputGear.userData.highlightables].forEach((mesh) => {
      const material = mesh.material;
      material.emissiveIntensity = THREE.MathUtils.lerp(material.emissiveIntensity || 0, active ? 0.34 : 0, 1 - Math.pow(0.0001, dt));
      const base = mesh.userData.baseColor;
      const target = active ? scratchColor.set(activeId === "R" ? 0xc86d61 : 0xd9a75b) : base;
      material.color.lerp(target, 1 - Math.pow(0.002, dt));
    });
  });
}

function updateViewDepth() {
  const t = viewDepth / 100;
  const zSpread = THREE.MathUtils.lerp(0, 0.95, t);
  const ySpread = THREE.MathUtils.lerp(0, 0.16, t);

  pairGroups.forEach((pair, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    pair.inputGear.position.z = side * zSpread;
    pair.outputGear.position.z = -side * zSpread;
    pair.inputGear.position.y = inputY + ySpread;
    pair.outputGear.position.y = outputY - ySpread;
  });

  viewValue.textContent = t < 0.24 ? "Inline" : t > 0.72 ? "Open" : "Normal";
}

function targetOutputRpm() {
  const selected = gearMap.get(selectedGear);
  if (!selected) return 0;
  const direction = selected.ratio < 0 ? -1 : 1;
  return direction * (engineRpm / Math.abs(selected.ratio));
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.035);
  const inputRadPerSecond = (engineRpm * Math.PI * 2) / 60;
  inputAngle += inputRadPerSecond * dt * 0.18;

  inputShaft.rotation.x = inputAngle;
  flywheel.rotation.x = inputAngle;

  pairGroups.forEach((pair) => {
    pair.inputGear.rotation.x = inputAngle;
    const meshRatio = pair.inputRadius / pair.outputRadius;
    const idlerFlip = pair.isReverse ? -1 : 1;
    pair.outputSpin = -inputAngle * meshRatio * idlerFlip;
    pair.outputGear.rotation.x = pair.outputSpin;
  });

  const selected = gearMap.get(selectedGear);
  const desiredOutputRpm = targetOutputRpm();
  displayedOutputRpm = THREE.MathUtils.lerp(displayedOutputRpm, desiredOutputRpm, 1 - Math.pow(0.015, dt));

  const outputRadPerSecond = (displayedOutputRpm * Math.PI * 2) / 60;
  outputAngle += outputRadPerSecond * dt * 0.18;
  outputShaft.rotation.x = outputAngle;
  outputFlange.rotation.x = outputAngle;
  collar.rotation.x = outputAngle;

  const targetX = selected ? selected.x : neutralSlot.x;
  collarX = THREE.MathUtils.lerp(collarX, targetX, 1 - Math.pow(0.0006, dt));
  collar.position.x = collarX;
  fork.position.x = collarX;

  powerLink.visible = selectedGear !== "N";
  if (powerLink.visible) {
    powerLink.rotation.y += dt * 2.2;
    powerLink.scale.setScalar(1 + Math.sin(clock.elapsedTime * 8) * 0.04);
  }

  updateHighlight(selectedGear, dt);

  engineReadout.textContent = `${Math.round(engineRpm)} rpm`;
  outputReadout.textContent = `${Math.round(displayedOutputRpm)} rpm`;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function resize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

gearButtons.forEach((button) => {
  button.addEventListener("click", () => setGear(button.dataset.gear));
});

rpmInput.addEventListener("input", () => {
  engineRpm = Number(rpmInput.value);
  rpmValue.textContent = String(engineRpm);
});

viewInput.addEventListener("input", () => {
  viewDepth = Number(viewInput.value);
  updateViewDepth();
});

casingToggle.addEventListener("change", () => {
  housing.visible = casingToggle.checked;
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toUpperCase();
  if (["R", "N", "1", "2", "3", "4", "5"].includes(key)) {
    setGear(key);
  }
});

window.addEventListener("resize", resize);

setGear("N");
updateViewDepth();
resize();
animate();
}

function showStartupError(error) {
  console.error(error);
  const container = document.getElementById("scene-wrap");
  if (!container) return;

  const message = document.createElement("div");
  message.className = "startup-error";
  message.innerHTML = `
    <strong>3D engine load aagala.</strong>
    <span>Internet connection/CDN block irundha Three.js load aagadhu. Local server-la open pannunga.</span>
  `;
  container.appendChild(message);
}
