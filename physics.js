"use strict";
/* Crumple 3D physics: node-beam soft body (no rendering code, so it also runs in Node for testing).
   Nodes = point masses, beams = spring+damper. Body beams dent (plastic), soften as they crush, and snap.
   Beams (not just nodes) collide with blocks, so nothing can slip through the lattice. */
const Phys = (() => {
  const G = 9.81, SUB = 28, DT = 1 / 60, LIM = 190, RN = 12, WR = .38;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- World ----------
  function height(x, z) {
    const road = 1 - smooth(6, 14, Math.abs(z));
    const rolling = (1 - road) * (4 * Math.sin(x * .03) * Math.cos(z * .035) + 2 * Math.sin(z * .07 + x * .02));
    const ramp = road * (4.6 * smooth(34, 46, x) - 4.6 * smooth(50, 59, x));
    const bumps = road * .62 * Math.sin((x - 90) * .62) * smooth(84, 91, x) * (1 - smooth(128, 135, x));
    const d2 = ((x - 230) ** 2 + z * z) / 3600, dome = d2 < 1 ? 7 * (1 - d2) * (1 - d2) : 0;
    return rolling + ramp + bumps + dome;
  }
  const BOXES = [ // x, z = corner; w, d = size; h = height
    { x: 140, z: -3, w: 2, d: 2, h: 1.2 }, { x: 146, z: 2, w: 2, d: 2, h: 1.6 }, { x: 152, z: -2, w: 2, d: 2, h: 2 },
    { x: 160, z: -9, w: 3, d: 18, h: 4 }, { x: -30, z: -6, w: 3, d: 12, h: 3 }, { x: 100, z: -1.5, w: 1.2, d: 3, h: 2.4 }
  ];
  let NX = 0, NY = 0, NZ = 0, DEP = 0;
  function boxTest(x, y, z, b) {              // inside? sets push-out normal + depth
    if (x <= b.x || x >= b.x + b.w || z <= b.z || z >= b.z + b.d || y >= b.h || y <= -1) return false;
    let m = x - b.x, t; NX = -1; NY = 0; NZ = 0;
    t = b.x + b.w - x; if (t < m) { m = t; NX = 1; NY = 0; NZ = 0; }
    t = z - b.z; if (t < m) { m = t; NX = 0; NY = 0; NZ = -1; }
    t = b.z + b.d - z; if (t < m) { m = t; NX = 0; NY = 0; NZ = 1; }
    t = b.h - y; if (t < m) { m = t; NX = 0; NY = 1; NZ = 0; }
    DEP = m; return true;
  }

  // ---------- Build the car ----------
  const S = { input: { gas: 0, brake: 0, steer: 0, hand: 0 }, strength: 1, broken: 0 };
  const XS = [-2.15, -1.7, -1.2, -.6, 0, .6, 1.2, 1.75, 2.2];      // 9 stations along the car
  const WS = [.7, .82, .9, .9, .9, .9, .9, .82, .7];                // half-width
  const MY = [.85, .92, .95, .95, .95, .95, .9, .82, .7];           // belt-line height (hood slopes down)
  const low = (i, j) => i * 2 + j, mid = (i, j) => 18 + i * 2 + j, roof = (i, j) => 36 + (i - 3) * 2 + j;
  S.low = low; S.mid = mid; S.roof = roof;
  const soft = i => i <= 1 || i >= 7 ? 2 : i === 2 || i === 6 ? 1 : 0;   // 2 = crumple zone, 1 = transition, 0 = cabin
  const YC = [.075, .045, .018], YT = [.13, .075, .035];

  (function init() {
    const pos = [], mass = [], mu = [], kind = [], zone = [];
    const addN = (x, y, z, m, f, k, zn) => { pos.push(x, y + .06, z); mass.push(m); mu.push(f); kind.push(k); zone.push(zn || 0); return mass.length - 1; };
    for (let i = 0; i < 9; i++) for (let j = 0; j < 2; j++) addN(XS[i], .42, (j ? 1 : -1) * WS[i], 27, .5, 0, soft(i));
    for (let i = 0; i < 9; i++) for (let j = 0; j < 2; j++) addN(XS[i], MY[i], (j ? 1 : -1) * WS[i], 27, .5, 0, soft(i));
    for (let i = 3; i <= 5; i++) for (let j = 0; j < 2; j++) addN(XS[i], 1.42 - (i === 5 ? .06 : 0), (j ? 1 : -1) * WS[i] * .78, 27, .5, 0, 0);
    const nBody = mass.length;

    const BA = [], BB = [], BL = [], BK = [], BC = [], BT = [], YCa = [], YTa = [], springBeam = [];
    const addB = (a, b, k, c, t, yc, yt, isSpring = false) => {
      BA.push(a); BB.push(b); BK.push(k); BC.push(c); BT.push(t); YCa.push(yc || 0); YTa.push(yt || 0); springBeam.push(isSpring ? 1 : 0);
      BL.push(Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2])); return BA.length - 1;
    };
    for (let i = 0; i < nBody; i++) for (let j = i + 1; j < nBody; j++) {
      const d = Math.hypot(pos[i * 3] - pos[j * 3], pos[i * 3 + 1] - pos[j * 3 + 1], pos[i * 3 + 2] - pos[j * 3 + 2]);
      if (d < 1.7) {
        const z = Math.max(zone[i], zone[j]);
        // Keep the passenger cell firm while the front/rear rails remain engineered to crush.
        const k = z === 0 ? 1.25e6 : z === 1 ? 8.5e5 : 4.8e5;
        const c = z === 0 ? 2600 : z === 1 ? 1900 : 1300;
        addB(i, j, k, c, 0, YC[z], YT[z]);
      }
    }
    S.bodyBeams = BA.length;

    const wheels = [];
    for (const side of [-1, 1]) for (const front of [0, 1]) {
      const cx = XS[front ? 6 : 2], cz = side * 1.0, cy = .38;
      const hl = addN(cx, cy, cz - .12, 8, 0, 2), hr = addN(cx, cy, cz + .12, 8, 0, 2), rim = [];
      for (let i = 0; i < RN; i++) { const a = i / RN * Math.PI * 2; rim.push(addN(cx + Math.cos(a) * WR, cy + Math.sin(a) * WR, cz, 3, 1.3, 1)); }
      addB(hl, hr, 4.5e5, 800, 1);
      for (let i = 0; i < RN; i++) {
        addB(hl, rim[i], 4.5e5, 650, 1); addB(hr, rim[i], 4.5e5, 650, 1);
        addB(rim[i], rim[(i + 1) % RN], 6e5, 750, 1); addB(rim[i], rim[(i + 2) % RN], 4.8e5, 600, 1);
      }
      const j = side < 0 ? 0 : 1, ip = front ? 5 : 3, A = low(ip, j), P2 = low(ip, 1 - j), U = mid(front ? 6 : 2, j);
      const stiff = [], p = (n, k) => pos[n * 3 + k];     // trailing arm: 4 stiff links = wheel can only pitch up/down
      for (const h of [hl, hr]) {
        addB(h, A, 6e5, 2500, 2);
        const lb = addB(h, P2, 6e5, 2500, 2);
        stiff.push({ b: lb, rx: p(h, 0) - p(A, 0), ry: p(h, 1) - p(A, 1), rz: p(h, 2) - p(A, 2), dx: p(P2, 0) - p(A, 0), dy: p(P2, 1) - p(A, 1), dz: p(P2, 2) - p(A, 2) });
        BL[addB(h, U, 5.5e4, 3200, 2, 0, 0, true)] += .09; // stiffer, damped coil-over with useful static preload
      }
      wheels.push({ hl, hr, rim, front, side, stiff, ax: [0, 0, 1], cx: 0, cy: 0, cz: 0, om: 0 });
    }

    S.N = mass.length; S.NB = BA.length; S.nBody = nBody; S.wheels = wheels;
    S.P = new Float64Array(pos); S.P0 = new Float64Array(pos);
    S.V = new Float64Array(S.N * 3); S.F = new Float64Array(S.N * 3);
    S.M = new Float64Array(mass); S.MU = new Float64Array(mu); S.KIND = Uint8Array.from(kind); S.TOUCH = new Uint8Array(S.N);
    S.BA = Int32Array.from(BA); S.BB = Int32Array.from(BB); S.BL0 = new Float64Array(BL); S.BL1 = new Float64Array(BL);
    S.SPRING = Uint8Array.from(springBeam); S.ZONE = Uint8Array.from(zone);
    S.BK = new Float64Array(BK); S.BK0 = new Float64Array(BK); S.BC = new Float64Array(BC); S.BT = Uint8Array.from(BT);
    S.YC = new Float64Array(YCa); S.YT = new Float64Array(YTa); S.nodeDmg = new Float32Array(nBody);
  })();

  S.reset = () => { S.P.set(S.P0); S.V.fill(0); S.BL0.set(S.BL1); S.BK.set(S.BK0); S.input.steer = 0; S.broken = 0; };

  // ---------- Forces ----------
  const { P, V, F, M, MU, KIND, TOUCH, BA, BB, BL0, BL1, BK, BK0, BC, BT, YC: YCb, YT: YTb, N, NB, wheels, nBody } = S;
  let tqx = 0, tqy = 0, tqz = 0;

  function contact(i, nx, ny, nz, d, kg) {
    const j = i * 3, vn = V[j] * nx + V[j + 1] * ny + V[j + 2] * nz;
    const Fn = kg * d - Math.sqrt(kg * M[i]) * vn; if (Fn <= 0) return;
    const tx = V[j] - vn * nx, ty = V[j + 1] - vn * ny, tz = V[j + 2] - vn * nz, tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    F[j] += Fn * nx; F[j + 1] += Fn * ny; F[j + 2] += Fn * nz;
    if (tl > 1e-6) { const ft = MU[i] * Fn * Math.min(tl / .3, 1) / tl; F[j] -= ft * tx; F[j + 1] -= ft * ty; F[j + 2] -= ft * tz; }
    TOUCH[i] = 1;
  }
  function sample(a, c, t, nx, ny, nz, d, kg) {   // a point part-way along a beam hits something: push both ends
    const wa = 1 - t, vx = wa * V[a] + t * V[c], vy = wa * V[a + 1] + t * V[c + 1], vz = wa * V[a + 2] + t * V[c + 2];
    const me = wa * M[a / 3 | 0] + t * M[c / 3 | 0], vn = vx * nx + vy * ny + vz * nz, Fn = kg * d - Math.sqrt(kg * me) * vn; if (Fn <= 0) return;
    const tx = vx - vn * nx, ty = vy - vn * ny, tz = vz - vn * nz, tl = Math.sqrt(tx * tx + ty * ty + tz * tz), ft = tl > 1e-6 ? .3 * Fn * Math.min(tl / .3, 1) / tl : 0;
    const fx = Fn * nx - ft * tx, fy = Fn * ny - ft * ty, fz = Fn * nz - ft * tz;
    F[a] += wa * fx; F[a + 1] += wa * fy; F[a + 2] += wa * fz; F[c] += t * fx; F[c + 1] += t * fy; F[c + 2] += t * fz;
  }

  function wheelOmega(w) {
    const a = w.hl * 3, b = w.hr * 3;
    let ax = P[b] - P[a], ay = P[b + 1] - P[a + 1], az = P[b + 2] - P[a + 2];
    const l = Math.sqrt(ax * ax + ay * ay + az * az); ax /= l; ay /= l; az /= l;
    w.ax[0] = ax; w.ax[1] = ay; w.ax[2] = az;
    w.cx = (P[a] + P[b]) / 2; w.cy = (P[a + 1] + P[b + 1]) / 2; w.cz = (P[a + 2] + P[b + 2]) / 2;
    const vx = (V[a] + V[b]) / 2, vy = (V[a + 1] + V[b + 1]) / 2, vz = (V[a + 2] + V[b + 2]) / 2;
    let s = 0;
    for (const i of w.rim) {
      const j = i * 3, rx = P[j] - w.cx, ry = P[j + 1] - w.cy, rz = P[j + 2] - w.cz, ux = V[j] - vx, uy = V[j + 1] - vy, uz = V[j + 2] - vz;
      const cx = ry * uz - rz * uy, cy = rz * ux - rx * uz, cz = rx * uy - ry * ux, ra = rx * ax + ry * ay + rz * az;
      s += (cx * ax + cy * ay + cz * az) / (rx * rx + ry * ry + rz * rz - ra * ra);
    }
    return w.om = s / w.rim.length;
  }
  function wheelTorque(w, tau) {            // tau about the axle; forward driving = negative
    const [ax, ay, az] = w.ax;
    for (const i of w.rim) {
      const j = i * 3, rx = P[j] - w.cx, ry = P[j + 1] - w.cy, rz = P[j + 2] - w.cz;
      const ra = rx * ax + ry * ay + rz * az, px = rx - ra * ax, py = ry - ra * ay, pz = rz - ra * az, r = Math.sqrt(px * px + py * py + pz * pz);
      const f = tau / (w.rim.length * r * r);
      F[j] += f * (ay * pz - az * py); F[j + 1] += f * (az * px - ax * pz); F[j + 2] += f * (ax * py - ay * px);
    }
    tqx -= tau * ax; tqy -= tau * ay; tqz -= tau * az;     // equal and opposite torque on the body
  }
  function bodyTorque(Tx, Ty, Tz) {
    const T = Math.sqrt(Tx * Tx + Ty * Ty + Tz * Tz); if (T < 1e-6) return;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < nBody; i++) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; }
    cx /= nBody; cy /= nBody; cz /= nBody;
    const tx = Tx / T, ty = Ty / T, tz = Tz / T; let s = 0;
    for (let i = 0; i < nBody; i++) { const rx = P[i * 3] - cx, ry = P[i * 3 + 1] - cy, rz = P[i * 3 + 2] - cz, d = rx * tx + ry * ty + rz * tz; s += rx * rx + ry * ry + rz * rz - d * d; }
    for (let i = 0; i < nBody; i++) {
      const rx = P[i * 3] - cx, ry = P[i * 3 + 1] - cy, rz = P[i * 3 + 2] - cz;
      F[i * 3] += (Ty * rz - Tz * ry) / s; F[i * 3 + 1] += (Tz * rx - Tx * rz) / s; F[i * 3 + 2] += (Tx * ry - Ty * rx) / s;
    }
  }

  function drive() {
    const { gas, brake, hand } = S.input; tqx = tqy = tqz = 0;
    let wf = 0; for (const w of wheels) wf -= wheelOmega(w) / 4;       // forward wheel speed (rad/s)
    for (const w of wheels) {
      let tau = 0;
      if (gas > 0) tau = -450 * gas * (1 - Math.pow(clamp(wf / 120, 0, 1), 1.5));                   // engine, all-wheel drive
      if (brake > 0) tau += wf > 3 ? -1800 * brake * Math.tanh(w.om / 2)                            // S while rolling forward = brake
                                   : 650 * brake * (1 - clamp(-wf / 40, 0, 1));                      // S at rest/rolling back = REVERSE
      if (hand && !w.front) tau -= 2500 * Math.tanh(w.om / 2);
      if (tau) wheelTorque(w, tau);
    }
    bodyTorque(tqx, tqy, tqz);
  }

  function substep(dt) {
    for (let i = 0; i < N; i++) { F[i * 3] = 0; F[i * 3 + 1] = -G * M[i]; F[i * 3 + 2] = 0; TOUCH[i] = 0; }
    const str = S.strength;
    for (let b = 0; b < NB; b++) {
      const k = BK[b]; if (k === 0) continue;
      const a = BA[b] * 3, c = BB[b] * 3, dx = P[c] - P[a], dy = P[c + 1] - P[a + 1], dz = P[c + 2] - P[a + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz); if (L < 1e-6) continue;
      const ux = dx / L, uy = dy / L, uz = dz / L, L0 = BL0[b], body = BT[b] === 0;
      let f = k * (L - L0) + BC[b] * ((V[c] - V[a]) * ux + (V[c + 1] - V[a + 1]) * uy + (V[c + 2] - V[a + 2]) * uz);
      if (L < .5 * L0 && (body || k < 1e5)) f += (body ? 3 : 8) * k * (L - .5 * L0);   // crushed beams / bump stops go solid
      if (S.SPRING[b]) {
        // Progressive suspension bump stop: prevent the chassis from collapsing onto the tires.
        const stopLength = L0 - .22;
        if (L < stopLength) f += 3e5 * (L - stopLength);
      }
      F[a] += f * ux; F[a + 1] += f * uy; F[a + 2] += f * uz; F[c] -= f * ux; F[c + 1] -= f * uy; F[c + 2] -= f * uz;
      if (body) {                                                            // dent, soften as it crushes, snap
        const s = (L - L0) / L0, yc = S.YC[b] * str, yt = S.YT[b] * str;
        if (s < -yc) {
          BL0[b] = L / (1 - yc * .999);
          const za = S.ZONE[a / 3], zc = S.ZONE[c / 3], zoneLevel = Math.max(za, zc);
          // Soften per simulated second, not per substep. This prevents the whole frame
          // from losing nearly all of its stiffness during one sustained impact.
          const softenRate = zoneLevel === 2 ? .60 : zoneLevel === 1 ? .18 : .025;
          if (BK[b] > .24 * BK0[b]) BK[b] *= Math.exp(-softenRate * dt);
        }
        else if (s > yt) BL0[b] = L / (1 + yt * .999);
        const zoneLevel = Math.max(S.ZONE[a / 3], S.ZONE[c / 3]);
        // Only the outer crumple zones can tear loose; the cabin and transition stay connected.
        if (zoneLevel === 2 && s > 1.2 * str) { BK[b] = 0; S.broken++; }
      }
    }
    // beams collide too (not just nodes), so blocks can't poke through the gaps in the lattice
    for (let b = 0; b < S.bodyBeams; b++) {
      if (BK[b] === 0) continue;
      const a = BA[b] * 3, c = BB[b] * 3, xa = P[a], ya = P[a + 1], za = P[a + 2], xc = P[c], yc = P[c + 1], zc = P[c + 2];
      for (const bx of BOXES) {
        if (xa < bx.x && xc < bx.x || xa > bx.x + bx.w && xc > bx.x + bx.w || ya > bx.h && yc > bx.h || za < bx.z && zc < bx.z || za > bx.z + bx.d && zc > bx.z + bx.d) continue;
        for (let t = .25; t < .8; t += .25) {
          const x = xa + (xc - xa) * t, y = ya + (yc - ya) * t, z = za + (zc - za) * t;
          if (boxTest(x, y, z, bx)) sample(a, c, t, NX, NY, NZ, DEP, 6e5);
        }
      }
      const x = (xa + xc) / 2, y = (ya + yc) / 2, z = (za + zc) / 2, h = height(x, z);
      if (y < h) { const e = .1, gx = (height(x + e, z) - height(x - e, z)) / (2 * e), gz = (height(x, z + e) - height(x, z - e)) / (2 * e), m = Math.sqrt(gx * gx + gz * gz + 1); sample(a, c, .5, -gx / m, 1 / m, -gz / m, (h - y) / m, 3e5); }
    }
    for (let i = 0; i < N; i++) {
      const j = i * 3, kind = KIND[i];
      if (kind === 0) { const v = Math.sqrt(V[j] ** 2 + V[j + 1] ** 2 + V[j + 2] ** 2) * .06; F[j] -= v * V[j]; F[j + 1] -= v * V[j + 1]; F[j + 2] -= v * V[j + 2]; }
      if (kind === 2) continue;
      const x = P[j], y = P[j + 1], z = P[j + 2], h = height(x, z);
      if (y < h) {
        const e = .1, gx = (height(x + e, z) - height(x - e, z)) / (2 * e), gz = (height(x, z + e) - height(x, z - e)) / (2 * e), m = Math.sqrt(gx * gx + gz * gz + 1);
        contact(i, -gx / m, 1 / m, -gz / m, (h - y) / m, 2e5);
      }
      for (const bx of BOXES) if (boxTest(x, y, z, bx)) contact(i, NX, NY, NZ, DEP, 6e5);
      if (x > LIM) contact(i, -1, 0, 0, x - LIM, 2e5); else if (x < -LIM) contact(i, 1, 0, 0, -LIM - x, 2e5);
      if (z > LIM) contact(i, 0, 0, -1, z - LIM, 2e5); else if (z < -LIM) contact(i, 0, 0, 1, -LIM - z, 2e5);
    }
    drive();
    for (let i = 0; i < N * 3; i++) { const im = 1 / M[(i / 3) | 0]; V[i] += F[i] * im * dt; P[i] += V[i] * dt; }
  }

  S.step = (slow) => {
    const inp = S.input, lim = 1 / (1 + S.speed() * .05);                       // less steering lock at speed
    const th = inp.steer * lim * .45, c = Math.cos(th), sn = Math.sin(th);      // steering: swing the front axle about its arm pivot
    for (const w of wheels) if (w.front) for (const q of w.stiff) {
      const x = q.rx * c + q.rz * sn, z = -q.rx * sn + q.rz * c;
      BL0[q.b] = Math.sqrt((x - q.dx) ** 2 + (q.ry - q.dy) ** 2 + (z - q.dz) ** 2);
    }
    const dt = DT * (slow ? .2 : 1) / SUB;
    for (let i = 0; i < SUB; i++) substep(dt);
    for (let i = 0; i < N * 3; i++) if (!isFinite(P[i])) { S.reset(); break; }
  };

  S.center = (out = {}) => {
    let x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0;
    for (let i = 0; i < nBody; i++) { x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; vx += V[i * 3]; vy += V[i * 3 + 1]; vz += V[i * 3 + 2]; }
    out.x = x / nBody; out.y = y / nBody; out.z = z / nBody; out.vx = vx / nBody; out.vy = vy / nBody; out.vz = vz / nBody; return out;
  };
  S.speed = () => { let vx = 0, vy = 0, vz = 0; for (let i = 0; i < nBody; i++) { vx += V[i * 3]; vy += V[i * 3 + 1]; vz += V[i * 3 + 2]; } return Math.sqrt(vx * vx + vy * vy + vz * vz) / nBody; };
  S.damage = () => { let d = 0; for (let b = 0; b < S.bodyBeams; b++) if (BK[b] === 0 || Math.abs(BL0[b] / BL1[b] - 1) > .01) d++; return Math.round(d / S.bodyBeams * 100); };
  S.updateNodeDamage = () => {                 // per-node dent amount 0..1, used to scuff the paint
    S.nodeDmg.fill(0);
    for (let b = 0; b < S.bodyBeams; b++) {
      const d = BK[b] === 0 ? 1 : Math.min(1, Math.abs(BL0[b] / BL1[b] - 1) * 10), a = BA[b], c = BB[b];
      if (d > S.nodeDmg[a]) S.nodeDmg[a] = d; if (d > S.nodeDmg[c]) S.nodeDmg[c] = d;
    }
  };
  S.height = height; S.BOXES = BOXES; S.LIM = LIM; S.RN = RN; S.WR = WR;
  return S;
})();
if (typeof module !== "undefined") module.exports = Phys;
