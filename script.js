(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const speedEl = document.getElementById('speed');
  const dmgEl = document.getElementById('dmg');
  const strengthEl = document.getElementById('strength');
  const strengthOut = document.getElementById('strengthOut');
  const resetBtn = document.getElementById('resetBtn');
  const beamBtn = document.getElementById('beamBtn');
  const slowBtn = document.getElementById('slowBtn');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8eb6d1);
  scene.fog = new THREE.Fog(0x8eb6d1, 90, 500);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 5, 11);

  const clock = new THREE.Clock();
  const keys = Object.create(null);
  let slowMotion = false;
  let showBeams = false;
  let cameraMode = 0;
  let speed = 0;
  let steer = 0;
  let damage = 0;
  let distance = 0;
  let heading = 0;
  let lastImpact = 0;

  scene.add(new THREE.HemisphereLight(0xdceeff, 0x40502f, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1cf, 2.2);
  sun.position.set(-70, 100, 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshStandardMaterial({ color: 0x526b45, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 700),
    new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.95 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.012;
  road.receiveShadow = true;
  scene.add(road);

  const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x70736e, roughness: 1 });
  for (const x of [-9.2, 9.2]) {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 700), shoulderMat);
    shoulder.position.set(x, 0.04, 0);
    shoulder.receiveShadow = true;
    scene.add(shoulder);
  }

  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf3df88, emissive: 0x4b3e18, emissiveIntensity: 0.15 });
  for (let z = -330; z < 350; z += 10) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 5.2), lineMat);
    dash.position.set(0, 0.065, z);
    scene.add(dash);
  }

  const curbMat = new THREE.MeshStandardMaterial({ color: 0xd7d4c9, roughness: 0.8 });
  for (const x of [-7.95, 7.95]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 700), curbMat);
    curb.position.set(x, 0.08, 0);
    curb.receiveShadow = true;
    scene.add(curb);
  }

  function makeTree(x, z, scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28 * scale, 0.38 * scale, 3.1 * scale, 8),
      new THREE.MeshStandardMaterial({ color: 0x65452f, roughness: 1 })
    );
    trunk.position.y = 1.55 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.0 * scale, 1),
      new THREE.MeshStandardMaterial({ color: 0x28552f, roughness: 1 })
    );
    crown.position.y = 4.0 * scale;
    crown.castShadow = true;
    g.add(crown);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let z = -320; z <= 320; z += 22) {
    makeTree(-15 - Math.random() * 8, z + Math.random() * 6, 0.8 + Math.random() * 0.6);
    makeTree(15 + Math.random() * 8, z + Math.random() * 6, 0.8 + Math.random() * 0.6);
  }

  const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x7d858c, roughness: 0.85, metalness: 0.1 });
  const obstacles = [];
  for (let i = 0; i < 9; i++) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.6, 2.5), obstacleMat.clone());
    block.position.set((i % 3 - 1) * 4.6, 0.8, -55 - Math.floor(i / 3) * 48);
    block.rotation.y = Math.random() * 0.8;
    block.castShadow = true;
    block.receiveShadow = true;
    scene.add(block);
    obstacles.push(block);
  }

  function mat(color, metalness = 0.15, roughness = 0.4) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness });
  }

  const car = new THREE.Group();
  scene.add(car);
  car.position.set(0, 0, 8);

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.55, 4.25), mat(0x1478a8, 0.55, 0.25));
  chassis.position.y = 1.05;
  chassis.castShadow = true;
  car.add(chassis);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 1.45), mat(0x1688bd, 0.55, 0.23));
  hood.position.set(0, 1.39, -1.22);
  hood.castShadow = true;
  car.add(hood);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.8, 1.85), mat(0x14232d, 0.15, 0.2));
  cabin.position.set(0, 1.62, 0.35);
  cabin.castShadow = true;
  car.add(cabin);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.54, 0.06), mat(0x72a4b7, 0.15, 0.12));
  windshield.position.set(0, 1.67, -0.59);
  windshield.rotation.x = -0.12;
  car.add(windshield);

  const rearGlass = windshield.clone();
  rearGlass.position.z = 1.28;
  rearGlass.rotation.x = 0.12;
  car.add(rearGlass);

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.32, 20);
  const tireMat = mat(0x111317, 0.05, 0.9);
  const rimMat = mat(0xb5bcc1, 0.8, 0.25);
  for (const x of [-1.02, 1.02]) {
    for (const z of [-1.38, 1.38]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.62, z);
      car.add(pivot);
      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      pivot.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.34, 16), rimMat);
      rim.rotation.z = Math.PI / 2;
      pivot.add(rim);
      wheels.push({ pivot, tire, front: z < 0, baseY: 0.62 });
    }
  }

  const headlights = [];
  for (const x of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.16, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd75c, emissiveIntensity: 0.8 })
    );
    lamp.position.set(x, 1.22, -2.15);
    car.add(lamp);
    headlights.push(lamp);
  }

  const beamGroup = new THREE.Group();
  car.add(beamGroup);
  const beamMaterial = new THREE.LineBasicMaterial({ color: 0xffb703, transparent: true, opacity: 0.85 });
  const beamPoints = [
    [-1.02, 0.62, -1.38], [1.02, 0.62, -1.38],
    [1.02, 0.62, 1.38], [-1.02, 0.62, 1.38],
    [-1.02, 1.05, -1.38], [1.02, 1.05, -1.38],
    [1.02, 1.05, 1.38], [-1.02, 1.05, 1.38]
  ];
  const beamGeometry = new THREE.BufferGeometry().setFromPoints(beamPoints.map(p => new THREE.Vector3(...p)));
  beamGroup.add(new THREE.LineSegments(beamGeometry, beamMaterial));
  beamGroup.visible = false;

  function resetCar() {
    car.position.set(0, 0, 8);
    car.rotation.set(0, 0, 0);
    speed = 0;
    steer = 0;
    heading = 0;
    damage = 0;
    distance = 0;
    lastImpact = 0;
    chassis.scale.set(1, 1, 1);
    hood.scale.set(1, 1, 1);
    cabin.scale.set(1, 1, 1);
    obstacles.forEach((o, i) => {
      o.position.set((i % 3 - 1) * 4.6, 0.8, -55 - Math.floor(i / 3) * 48);
      o.rotation.set(0, (i * 0.31) % 1.2, 0);
      o.scale.set(1, 1, 1);
    });
  }

  function impact(amount, obstacle) {
    const strength = Number(strengthEl.value);
    const now = performance.now();
    if (now - lastImpact < 180) return;
    lastImpact = now;
    const hit = Math.max(0, amount) / Math.max(0.3, strength);
    damage = Math.min(100, damage + hit * 7.5);
    const deform = Math.min(0.35, hit * 0.025);
    chassis.scale.z = Math.max(0.7, 1 - deform);
    hood.scale.y = Math.max(0.65, 1 - deform * 0.7);
    if (obstacle) {
      obstacle.scale.x = Math.max(0.65, obstacle.scale.x - deform * 0.15);
      obstacle.rotation.y += (Math.random() - 0.5) * 0.18;
    }
    speed *= Math.max(0, 1 - hit * 0.035);
  }

  function updateCar(dt) {
    const gas = keys.KeyW || keys.ArrowUp ? 1 : 0;
    const brake = keys.KeyS || keys.ArrowDown ? 1 : 0;
    const handbrake = keys.Space ? 1 : 0;
    const targetSteer = (keys.KeyA || keys.ArrowLeft ? -1 : 0) + (keys.KeyD || keys.ArrowRight ? 1 : 0);
    steer += (targetSteer - steer) * Math.min(1, dt * 9);

    const traction = handbrake ? 0.55 : 1;
    if (gas) speed += 25 * dt * traction;
    if (brake) speed -= speed > 0.5 ? 38 * dt : 14 * dt;
    if (!gas && !brake) speed *= Math.pow(0.986, dt * 60);
    if (handbrake) speed *= Math.pow(0.972, dt * 60);
    speed = THREE.MathUtils.clamp(speed, -18, 55);

    const steeringEffect = THREE.MathUtils.clamp(Math.abs(speed) / 16, 0, 1.5);
    heading += steer * steeringEffect * dt * 0.72 * (speed >= 0 ? 1 : -1);
    car.rotation.y = heading;

    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    car.position.addScaledVector(forward, speed * dt);
    distance += Math.abs(speed) * dt;

    const roadEdge = 7.2;
    if (Math.abs(car.position.x) > roadEdge) {
      speed *= 0.965;
      car.position.x = THREE.MathUtils.clamp(car.position.x, -roadEdge - 2, roadEdge + 2);
    }

    wheels.forEach(w => {
      if (w.front) w.pivot.rotation.y = steer * 0.48;
      w.tire.rotation.x -= speed * dt * 1.7;
      const bounce = Math.sin((distance * 1.6) + (w.front ? 0.7 : 0)) * Math.min(0.06, Math.abs(speed) * 0.0015);
      w.pivot.position.y = w.baseY + bounce;
    });

    const roll = -steer * Math.min(0.055, Math.abs(speed) * 0.0012);
    car.rotation.z += (roll - car.rotation.z) * Math.min(1, dt * 7);

    obstacles.forEach(o => {
      const dx = car.position.x - o.position.x;
      const dz = car.position.z - o.position.z;
      if (Math.abs(dx) < 1.8 && Math.abs(dz) < 2.6 && Math.abs(speed) > 5) {
        impact(Math.abs(speed) * 0.7, o);
        o.position.z -= Math.sign(dz || 1) * 0.8;
      }
    });

    if (car.position.z < -280) car.position.z += 560;
    if (car.position.z > 280) car.position.z -= 560;

    headlights.forEach(h => h.material.emissiveIntensity = keys.KeyL || keys.KeyN ? 2.2 : 0.8);
  }

  function updateCamera(dt) {
    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const up = new THREE.Vector3(0, 1, 0);
    let desired;
    if (cameraMode === 0) {
      desired = car.position.clone().addScaledVector(forward, 9).add(new THREE.Vector3(0, 5.2, 0));
    } else if (cameraMode === 1) {
      desired = car.position.clone().addScaledVector(forward, 2.1).add(new THREE.Vector3(0, 2.1, 0));
    } else {
      desired = car.position.clone().add(new THREE.Vector3(0, 10, 0));
    }
    camera.position.lerp(desired, Math.min(1, dt * 5));
    const look = car.position.clone().addScaledVector(forward, cameraMode === 2 ? 8 : 2).add(new THREE.Vector3(0, 1.1, 0));
    camera.lookAt(look);
  }

  function updateUI() {
    speedEl.textContent = Math.round(Math.abs(speed) * 3.6);
    dmgEl.textContent = Math.round(damage);
    strengthOut.value = `${Number(strengthEl.value).toFixed(1)}x`;
    beamGroup.visible = showBeams;
  }

  function animate() {
    requestAnimationFrame(animate);
    const rawDt = Math.min(clock.getDelta(), 0.05);
    const dt = rawDt * (slowMotion ? 0.22 : 1);
    updateCar(dt);
    updateCamera(dt);
    updateUI();
    renderer.render(scene, camera);
  }

  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR') resetCar();
    if (e.code === 'KeyC') cameraMode = (cameraMode + 1) % 3;
    if (e.code === 'KeyB') showBeams = !showBeams;
    if (e.code === 'KeyT') slowMotion = !slowMotion;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  }, { passive: false });

  addEventListener('keyup', e => { keys[e.code] = false; });

  strengthEl.addEventListener('input', () => {
    strengthOut.value = `${Number(strengthEl.value).toFixed(1)}x`;
  });
  resetBtn.addEventListener('click', resetCar);
  beamBtn.addEventListener('click', () => { showBeams = !showBeams; });
  slowBtn.addEventListener('click', () => { slowMotion = !slowMotion; });

  addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  resetCar();
  animate();
})();
