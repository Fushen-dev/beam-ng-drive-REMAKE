"use strict";
/* Crumple 3D renderer (Three.js). All physics lives in physics.js. */
const S = Phys, canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc9ec);
scene.fog = new THREE.Fog(0x9cc9ec, 80, 320);
const camera = new THREE.PerspectiveCamera(60, 1, .1, 600);
scene.add(new THREE.HemisphereLight(0xdcefff, 0x4d5b3a, .95));
const sun = new THREE.DirectionalLight(0xffffff, .8); sun.position.set(60, 100, 40); scene.add(sun);

// ---------- Static world (built once) ----------
{
  const L = S.LIM * 2, seg = 240, g = new THREE.PlaneGeometry(L, L, seg, seg); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = S.height(x, z); pos.setY(i, h);
    if (Math.abs(z) < 4.5 && x > -60 && x < 200) c.setHex(Math.abs(z) < .15 && ((x / 6) | 0) % 2 ? 0xd8d8a0 : 0x3a3d42);
    else c.setHSL(.27 - h * .006, .45, .33 + Math.sin(x * .3) * Math.cos(z * .4) * .02);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
  const bm = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
  for (const b of S.BOXES) { const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h + 1, b.d), bm); m.position.set(b.x + b.w / 2, (b.h - 1) / 2, b.z + b.d / 2); scene.add(m); }
  // Guardrails frame the jump ramp; white posts mark the suspension articulation course.
  const railMat = new THREE.MeshLambertMaterial({ color: 0xf0a52b });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x303943 });
  for (const side of [-1, 1]) {
    for (let x = 28; x <= 66; x += 2) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.12, .8, .12), postMat);
      post.position.set(x, S.height(x, side * 5.2) + .4, side * 5.2); scene.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(38, .12, .12), railMat);
    rail.position.set(47, 1.0, side * 5.2); scene.add(rail);
  }
  const markerMat = new THREE.MeshLambertMaterial({ color: 0xe8edf2 });
  for (let x = 86; x <= 128; x += 4) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(.25, .8, .25), markerMat);
    marker.position.set(x, S.height(x, 5) + .4, 5); scene.add(marker);
  }
}

// ---------- Deformable body: triangles follow the physics nodes ----------
const { low, up, roof } = S, P = S.P;
const paintQ = [], glassQ = [];
// Full body skin across all nine length stations. Each panel follows its own physics nodes.
for (let j = 0; j < 2; j++) {
  for (let i = 0; i < 8; i++) {
    paintQ.push([low(i, j), low(i + 1, j), up(i + 1, j), up(i, j)]);
    paintQ.push([low(i, 0), low(i + 1, 0), low(i + 1, 1), low(i, 1)]);
    paintQ.push([up(i, 0), up(i + 1, 0), up(i + 1, 1), up(i, 1)]);
  }
}
paintQ.push([low(0, 0), low(0, 1), up(0, 1), up(0, 0)]);
paintQ.push([low(8, 0), low(8, 1), up(8, 1), up(8, 0)]);
for (let i = 0; i < 2; i++) paintQ.push([roof(i, 0), roof(i + 1, 0), roof(i + 1, 1), roof(i, 1)]);
for (let j = 0; j < 2; j++) {
  glassQ.push([up(3, j), up(4, j), roof(1, j), roof(0, j)]);
  glassQ.push([up(4, j), up(5, j), roof(2, j), roof(1, j)]);
}
function deformable(quads, mat) {
  const idx = []; for (const [a, b, c, d] of quads) idx.push(a, b, c, a, c, d);
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(idx.length * 3), 3));
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh);
  return () => { const a = geo.attributes.position.array; for (let v = 0; v < idx.length; v++) { a[v * 3] = P[idx[v] * 3]; a[v * 3 + 1] = P[idx[v] * 3 + 1]; a[v * 3 + 2] = P[idx[v] * 3 + 2]; } geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); };
}
const paint = new THREE.MeshLambertMaterial({ color: 0xe0452c, side: THREE.DoubleSide });
const updPaint = deformable(paintQ, paint), updGlass = deformable(glassQ, new THREE.MeshLambertMaterial({ color: 0x9fd4f0, side: THREE.DoubleSide }));

// ---------- Wheels ----------
const tireGeo = new THREE.CylinderGeometry(S.WR, S.WR, .24, 20).rotateX(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(.24, .24, .26, 12).rotateX(Math.PI / 2);
const barGeo = new THREE.BoxGeometry(.46, .05, .28);
const tireMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1f }), rimMat = new THREE.MeshLambertMaterial({ color: 0xc4c9d0 });
const wheelMeshes = S.wheels.map(() => {
  const g = new THREE.Group(); g.matrixAutoUpdate = false;
  g.add(new THREE.Mesh(tireGeo, tireMat), new THREE.Mesh(rimGeo, rimMat));
  for (const a of [0, Math.PI / 2]) { const b = new THREE.Mesh(barGeo, tireMat); b.rotation.z = a; g.add(b); }
  scene.add(g); return g;
});
const m4 = new THREE.Matrix4(), vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3();
function updWheels() {
  S.wheels.forEach((w, k) => {
    vz.set(...w.ax);
    const j = w.rim[0] * 3; vx.set(P[j] - w.cx, P[j + 1] - w.cy, P[j + 2] - w.cz); vx.addScaledVector(vz, -vx.dot(vz)).normalize();
    vy.crossVectors(vz, vx); m4.makeBasis(vx, vy, vz); m4.setPosition(w.cx, w.cy, w.cz); wheelMeshes[k].matrix.copy(m4);
  });
}

// ---------- Beam debug view ----------
const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(S.NB * 6), 3));
lineGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(S.NB * 6), 3));
const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true })); lines.frustumCulled = false; lines.visible = false; scene.add(lines);
function updLines() {
  const p = lineGeo.attributes.position.array, c = lineGeo.attributes.color.array;
  for (let b = 0; b < S.NB; b++) {
    const a = S.BA[b] * 3, d = S.BB[b] * 3, L = Math.hypot(P[d] - P[a], P[d + 1] - P[a + 1], P[d + 2] - P[a + 2]);
    const s = S.BK[b] ? Math.max(-1, Math.min(1, (L - S.BL0[b]) / S.BL0[b] * 25)) : 0, o = b * 6;
    p.set([P[a], P[a + 1], P[a + 2], P[d], P[d + 1], P[d + 2]], o);
    const r = s > 0 ? 1 : .3, g = 1 - Math.abs(s) * .8, bl = s < 0 ? 1 : .3; c.set([r, g, bl, r, g, bl], o);
  }
  lineGeo.attributes.position.needsUpdate = lineGeo.attributes.color.needsUpdate = true;
}

// ---------- Input, UI ----------
const keys = {}; let slow = false, camMode = 0; const inp = S.input;
addEventListener("keydown", e => {
  const k = e.key.toLowerCase(); if (k.startsWith("arrow") || k === " ") e.preventDefault(); keys[k] = true;
  if (k === "r") S.reset(); if (k === "b") toggleBeams(); if (k === "t") toggleSlow(); if (k === "c") camMode = (camMode + 1) % 3;
});
addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
const beamBtn = document.getElementById("beamBtn"), slowBtn = document.getElementById("slowBtn");
function toggleBeams() { lines.visible = !lines.visible; beamBtn.classList.toggle("on", lines.visible); }
function toggleSlow() { slow = !slow; slowBtn.classList.toggle("on", slow); }
beamBtn.onclick = toggleBeams; slowBtn.onclick = toggleSlow; document.getElementById("resetBtn").onclick = () => S.reset();
document.getElementById("strength").oninput = e => { S.strength = +e.target.value; document.getElementById("strengthOut").textContent = S.strength.toFixed(1) + "x"; };
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

// ---------- Camera ----------
const heading = new THREE.Vector3(1, 0, 0), look = new THREE.Vector3(), c = {};
function updCamera() {
  S.center(c); const f = [0, 1].map(j => low(3, j) * 3), r = [0, 1].map(j => low(0, j) * 3);
  const hx = P[f[0]] + P[f[1]] - P[r[0]] - P[r[1]], hz = P[f[0] + 2] + P[f[1] + 2] - P[r[0] + 2] - P[r[1] + 2];
  heading.lerp(new THREE.Vector3(hx, 0, hz).normalize(), .06).normalize();
  const dist = [9, 18, 4.5][camMode], hgt = [3.2, 9, 1.8][camMode];
  const target = new THREE.Vector3(c.x - heading.x * dist, Math.max(c.y + hgt, S.height(c.x - heading.x * dist, c.z - heading.z * dist) + 1), c.z - heading.z * dist);
  camera.position.lerp(target, .12); look.set(c.x + heading.x * 3, c.y + .6, c.z + heading.z * 3); camera.lookAt(look);
}

// ---------- Main loop ----------
let last = performance.now(), acc = 0, frame = 0;
function loop(now) {
  acc += Math.min(now - last, 100) / 1000; last = now;
  inp.gas = (keys.w || keys.arrowup) ? 1 : 0; inp.brake = (keys.s || keys.arrowdown) ? 1 : 0; inp.hand = keys[" "] ? 1 : 0;
  const want = ((keys.a || keys.arrowleft) ? 1 : 0) - ((keys.d || keys.arrowright) ? 1 : 0);
  while (acc >= 1 / 60) { inp.steer += (want - inp.steer) * .12; S.step(slow); acc -= 1 / 60; }
  updPaint(); updGlass(); updWheels(); if (lines.visible) updLines(); updCamera();
  paint.color.setHSL(.02, .75 - S.damage() * .004, .5 - S.damage() * .002);
  if (++frame % 6 === 0) { document.getElementById("speed").textContent = Math.round(S.speed() * 3.6); document.getElementById("dmg").textContent = S.damage(); }
  renderer.render(scene, camera); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
