"use strict";
/* Crumple: a 2D node-beam soft-body driving sandbox.
   Every part of the car is point masses (nodes) joined by spring-damper beams.
   Beams that are squashed or stretched too far bend permanently (dents) or snap.
   Original code and fictional car: no assets from any other game. */

// ---------- Vehicle definition (edit this to make new cars!) ----------
const CAR = {
  // body nodes [x, y] in metres (x forward, y up)
  body: [[-1.9,.55],[-.8,.55],[.8,.55],[1.9,.55],[-1.9,1.05],[-.8,1.05],[.8,1.05],[1.9,1.0],[-.6,1.5],[.5,1.5]],
  outline: [0,1,2,3,7,6,9,8,5,4],      // order used to draw the body
  nodeMass: 100, linkDist: 1.9,        // body nodes closer than this get a beam
  wheelRadius: .38, rimNodes: 14,
  wheels: [
    { x: -1.2, y: .38, arm: 1, springs: [5, 4, 0] },  // rear
    { x:  1.3, y: .38, arm: 2, springs: [6, 7, 3] }   // front
  ]
};

// ---------- Setup ----------
const G = 9.81, SUB = 40, DT = 1 / 60;
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- World ----------
const WORLD = { xmin: -80, xmax: 300 };
function height(x) {
  return 3 * smooth(30, 38, x) - 3 * smooth(52, 55, x)               // jump ramp
    + .35 * Math.sin((x - 80) * 1.1) * smooth(80, 86, x) * (1 - smooth(114, 120, x)) // bumps
    + 8 * smooth(135, 175, x) * (1 - smooth(175, 215, x));            // hill
}
const slope = x => (height(x + .05) - height(x - .05)) / .1;
const BOXES = [ {x:225,w:1.5,h:1}, {x:232,w:1.5,h:1.5}, {x:239,w:1.5,h:2}, {x:270,w:5,h:5} ];

// ---------- State ----------
let nodes, beams, wheelList, bodyIdx, bodyBeamCount;
let keys = {}, showBeams = false, slow = false, strength = 1, zoom = 1;
const cam = { x: 0, y: 2 };

function build() {
  nodes = []; beams = []; wheelList = []; bodyIdx = [];
  const OX = 0, OY = .25;
  const addNode = (x, y, m, type, mu) => { nodes.push({ x: x + OX, y: y + OY, vx: 0, vy: 0, fx: 0, fy: 0, m, type, mu }); return nodes.length - 1; };
  const addBeam = (a, b, k, c, type, yld, brk) => {
    const L = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    beams.push({ a, b, L0: L, Linit: L, k, c, type, yld, brk });
  };

  for (const [x, y] of CAR.body) bodyIdx.push(addNode(x, y, CAR.nodeMass, "body", .5));
  for (let i = 0; i < bodyIdx.length; i++)
    for (let j = i + 1; j < bodyIdx.length; j++) {
      const a = nodes[bodyIdx[i]], b = nodes[bodyIdx[j]];
      if (Math.hypot(a.x - b.x, a.y - b.y) < CAR.linkDist) addBeam(bodyIdx[i], bodyIdx[j], 4e5, 1500, "body", .025, .5);
    }
  bodyBeamCount = beams.length;

  for (const w of CAR.wheels) {
    const hub = addNode(w.x, w.y, 15, "hub", 0), rim = [], N = CAR.rimNodes;
    for (let i = 0; i < N; i++) {
      const ang = i / N * Math.PI * 2;
      rim.push(addNode(w.x + Math.cos(ang) * CAR.wheelRadius, w.y + Math.sin(ang) * CAR.wheelRadius, 4, "rim", 1.3));
    }
    for (let i = 0; i < N; i++) {
      addBeam(hub, rim[i], 1e5, 300, "wheel");
      addBeam(rim[i], rim[(i + 1) % N], 2.5e5, 250, "wheel");
      addBeam(rim[i], rim[(i + 2) % N], 2.5e5, 250, "wheel");
    }
    addBeam(hub, bodyIdx[w.arm], 6e5, 2500, "susp");               // stiff trailing arm
    for (const s of w.springs) addBeam(hub, bodyIdx[s], 3.2e4, 3500, "susp"); // soft springs
    wheelList.push({ hub, rim });
  }
}

// ---------- Physics ----------
function contact(n, nx, ny, depth) {
  const vn = n.vx * nx + n.vy * ny, kg = 2e5, cg = Math.sqrt(kg * n.m);
  const Fn = Math.max(0, kg * depth - cg * vn);
  const tx = -ny, ty = nx, vt = n.vx * tx + n.vy * ty;
  const Ft = -n.mu * Fn * clamp(vt / .4, -1, 1);
  n.fx += Fn * nx + Ft * tx; n.fy += Fn * ny + Ft * ty;
  if (n.type === "rim") n.touch = true;
}

function wheelOmega(w) {                    // counter-clockwise rad/s
  const h = nodes[w.hub]; let s = 0;
  for (const i of w.rim) {
    const n = nodes[i], rx = n.x - h.x, ry = n.y - h.y;
    s += (rx * (n.vy - h.vy) - ry * (n.vx - h.vx)) / (rx * rx + ry * ry);
  }
  return s / w.rim.length;
}

function wheelTorque(w, tau) {              // tau > 0 = counter-clockwise
  const h = nodes[w.hub];
  for (const i of w.rim) {
    const n = nodes[i], rx = n.x - h.x, ry = n.y - h.y, r = Math.hypot(rx, ry);
    const F = tau / (w.rim.length * r);
    n.fx += F * -ry / r; n.fy += F * rx / r;
  }
  bodyTorque(-tau);                         // equal and opposite on the body
}

function bodyTorque(tau) {
  let cx = 0, cy = 0;
  for (const i of bodyIdx) { cx += nodes[i].x; cy += nodes[i].y; }
  cx /= bodyIdx.length; cy /= bodyIdx.length;
  let S = 0;
  for (const i of bodyIdx) S += (nodes[i].x - cx) ** 2 + (nodes[i].y - cy) ** 2;
  for (const i of bodyIdx) {
    const n = nodes[i];
    n.fx += tau * -(n.y - cy) / S; n.fy += tau * (n.x - cx) / S;
  }
}

function controls(dt) {
  const up = keys.w || keys.arrowup, down = keys.s || keys.arrowdown;
  const left = keys.a || keys.arrowleft, right = keys.d || keys.arrowright;
  const d = (up ? 1 : 0) - (down ? 1 : 0);
  const wfwd = -(wheelOmega(wheelList[0]) + wheelOmega(wheelList[1])) / 2;
  const WMAX = 110;
  for (let k = 0; k < wheelList.length; k++) {
    const w = wheelList[k], om = wheelOmega(w);
    let tau = 0;                             // counter-clockwise torque; forward = negative
    if (d > 0) tau = -900 * (1 - clamp(wfwd / WMAX, 0, 1));
    else if (d < 0 && wfwd > 2) tau = -2500 * Math.tanh(om / 2);        // braking
    else if (d < 0) tau = 550 * (1 - clamp(-wfwd / 35, 0, 1));          // reversing
    if (keys[" "] && k === 0) tau -= 3500 * Math.tanh(om / 2);          // handbrake (rear)
    wheelTorque(w, tau);
  }
  if (!nodes.some(n => n.touch) && (left || right)) bodyTorque(((left ? 1 : 0) - (right ? 1 : 0)) * 2500);
}

function substep(dt) {
  for (const n of nodes) { n.fx = 0; n.fy = -G * n.m; n.touch = false; }
  const y = strength;
  for (const b of beams) {
    const A = nodes[b.a], B = nodes[b.b];
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const ux = dx / L, uy = dy / L;
    const f = b.k * (L - b.L0) + b.c * ((B.vx - A.vx) * ux + (B.vy - A.vy) * uy);
    A.fx += f * ux; A.fy += f * uy; B.fx -= f * ux; B.fy -= f * uy;
    if (b.type === "body") {                 // permanent dents and snapping
      const s = (L - b.L0) / b.L0, lim = b.yld * y;
      if (s > lim) b.L0 = L / (1 + lim * .999);
      else if (s < -lim) b.L0 = L / (1 - lim * .999);
      if (s > b.brk * y) b.broken = true;
    }
  }
  for (const n of nodes) {
    if (n.type === "body") { const v = Math.hypot(n.vx, n.vy); n.fx -= .1 * v * n.vx; n.fy -= .1 * v * n.vy; }
    if (n.type === "hub") continue;
    const h = height(n.x);
    if (n.y < h) { const s = slope(n.x), m = Math.hypot(s, 1); contact(n, -s / m, 1 / m, (h - n.y) / m); }
    for (const b of BOXES)
      if (n.x > b.x && n.x < b.x + b.w && n.y < b.h && n.y > -.5) {
        const dl = n.x - b.x, dr = b.x + b.w - n.x, dt2 = b.h - n.y, m = Math.min(dl, dr, dt2);
        if (m === dt2) contact(n, 0, 1, m); else if (m === dl) contact(n, -1, 0, m); else contact(n, 1, 0, m);
      }
    if (n.x > WORLD.xmax) contact(n, -1, 0, n.x - WORLD.xmax);
    if (n.x < WORLD.xmin) contact(n, 1, 0, WORLD.xmin - n.x);
  }
  controls(dt);
  for (const n of nodes) { n.vx += n.fx / n.m * dt; n.vy += n.fy / n.m * dt; n.x += n.vx * dt; n.y += n.vy * dt; }
}

function stepFrame() {
  const dt = DT * (slow ? .2 : 1) / SUB;
  for (let i = 0; i < SUB; i++) substep(dt);
  beams = beams.filter(b => !b.broken);
  if (nodes.some(n => !isFinite(n.x) || !isFinite(n.y))) build();   // safety net
}

function bodyCenter() {
  let x = 0, y = 0, vx = 0, vy = 0;
  for (const i of bodyIdx) { const n = nodes[i]; x += n.x; y += n.y; vx += n.vx; vy += n.vy; }
  const c = bodyIdx.length; return { x: x / c, y: y / c, vx: vx / c, vy: vy / c };
}

function damage() {
  let d = 0;
  for (let i = 0, n = 0; i < beams.length; i++) {
    const b = beams[i]; if (b.type !== "body") continue; n++;
    if (Math.abs(b.L0 / b.Linit - 1) > .01) d++;
  }
  d += bodyBeamCount - beams.filter(b => b.type === "body").length;
  return Math.min(100, Math.round(d / bodyBeamCount * 100));
}

// ---------- Drawing ----------
let W = 0, H = 0;
function resize() {
  const r = window.devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  canvas.width = W * r; canvas.height = H * r;
  ctx.setTransform(r, 0, 0, r, 0, 0);
}
addEventListener("resize", resize); resize();

function draw() {
  const S = 45 * zoom, c = bodyCenter();
  cam.x += (c.x + c.vx * .25 - cam.x) * .1;
  cam.y += (c.y + 1 - cam.y) * .08;
  const X = x => W / 2 + (x - cam.x) * S, Y = y => H * .62 - (y - cam.y) * S;

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#6aa9d6"); sky.addColorStop(1, "#d9ecf5");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#9bbfd0";                 // far hills
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let px = 0; px <= W; px += 8) ctx.lineTo(px, H * .55 - 40 * Math.sin((px + cam.x * S * .15) / 190) - 25 * Math.sin((px + cam.x * S * .15) / 70));
  ctx.lineTo(W, H); ctx.fill();

  ctx.beginPath(); ctx.moveTo(0, H);          // ground
  for (let px = 0; px <= W + 4; px += 4) ctx.lineTo(px, Y(height(cam.x + (px - W / 2) / S)));
  ctx.lineTo(W, H); ctx.closePath();
  ctx.fillStyle = "#6b4f33"; ctx.fill();
  ctx.lineWidth = 7; ctx.strokeStyle = "#4f8a3c"; ctx.lineJoin = "round"; ctx.stroke();

  for (const b of BOXES) {                    // concrete blocks
    ctx.fillStyle = "#8d949b"; ctx.fillRect(X(b.x), Y(b.h), b.w * S, b.h * S);
    ctx.strokeStyle = "#5e656c"; ctx.lineWidth = 2; ctx.strokeRect(X(b.x), Y(b.h), b.w * S, b.h * S);
  }

  const dmg = damage() / 100;                 // body shell
  ctx.beginPath();
  CAR.outline.forEach((idx, i) => { const n = nodes[bodyIdx[idx]]; i ? ctx.lineTo(X(n.x), Y(n.y)) : ctx.moveTo(X(n.x), Y(n.y)); });
  ctx.closePath();
  ctx.fillStyle = `hsl(${12 - dmg * 8}, ${85 - dmg * 40}%, ${52 - dmg * 18}%)`;
  ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#2a1a14"; ctx.stroke();
  const win = [8, 9, 6, 5].map(i => nodes[bodyIdx[i]]);   // window
  ctx.beginPath(); win.forEach((n, i) => i ? ctx.lineTo(X(n.x), Y(n.y)) : ctx.moveTo(X(n.x), Y(n.y)));
  ctx.closePath(); ctx.fillStyle = "rgba(160,215,240,.85)"; ctx.fill();

  for (const w of wheelList) {                // wheels
    const h = nodes[w.hub];
    ctx.beginPath(); w.rim.forEach((i, k) => { const n = nodes[i]; k ? ctx.lineTo(X(n.x), Y(n.y)) : ctx.moveTo(X(n.x), Y(n.y)); });
    ctx.closePath(); ctx.fillStyle = "#1c1c1f"; ctx.fill();
    ctx.strokeStyle = "#b8bdc4"; ctx.lineWidth = 3; ctx.beginPath();
    for (let k = 0; k < w.rim.length; k += 3) { const n = nodes[w.rim[k]]; ctx.moveTo(X(h.x), Y(h.y)); ctx.lineTo(X(n.x + (h.x - n.x) * .35), Y(n.y + (h.y - n.y) * .35)); }
    ctx.stroke();
  }

  if (showBeams) {                            // debug view: red = stretched, blue = squashed
    ctx.lineWidth = 1.5;
    for (const b of beams) {
      const A = nodes[b.a], B = nodes[b.b], s = clamp(((Math.hypot(B.x - A.x, B.y - A.y) - b.L0) / b.L0) * 25, -1, 1);
      ctx.strokeStyle = s > 0 ? `rgba(255,${200 - s * 200 | 0},60,.9)` : `rgba(60,${200 + s * 100 | 0},255,.9)`;
      ctx.beginPath(); ctx.moveTo(X(A.x), Y(A.y)); ctx.lineTo(X(B.x), Y(B.y)); ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    for (const n of nodes) ctx.fillRect(X(n.x) - 1.5, Y(n.y) - 1.5, 3, 3);
  }

  document.getElementById("speed").textContent = Math.round(Math.hypot(c.vx, c.vy) * 3.6);
  document.getElementById("dmg").textContent = damage();
}

// ---------- Input and UI ----------
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k.startsWith("arrow") || k === " ") e.preventDefault();
  keys[k] = true;
  if (k === "r") build();
  if (k === "b") toggleBeams();
  if (k === "t") toggleSlow();
});
addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
addEventListener("blur", () => { keys = {}; });
addEventListener("wheel", e => { zoom = clamp(zoom * (e.deltaY > 0 ? .92 : 1.08), .4, 2.5); }, { passive: true });

const beamBtn = document.getElementById("beamBtn"), slowBtn = document.getElementById("slowBtn");
function toggleBeams() { showBeams = !showBeams; beamBtn.classList.toggle("on", showBeams); }
function toggleSlow() { slow = !slow; slowBtn.classList.toggle("on", slow); }
beamBtn.onclick = toggleBeams; slowBtn.onclick = toggleSlow;
document.getElementById("resetBtn").onclick = () => build();
document.getElementById("strength").oninput = e => {
  strength = +e.target.value;
  document.getElementById("strengthOut").textContent = strength.toFixed(1) + "x";
};

// ---------- Main loop (fixed physics step, variable rendering) ----------
build();
let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(now - last, 100) / 1000; last = now;
  while (acc >= DT) { stepFrame(); acc -= DT; }
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
