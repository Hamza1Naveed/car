"use client";

import { useEffect, useRef, useState } from "react";

const SAVE_KEY = "real-drive-save-v1";
const LANES = [-3.2, 0, 3.2];
const RIGHT_TRAFFIC_LANES = [6.1, 9.1];
const MAX_UPGRADE = 5;
const TUNNEL_LENGTH = 420;
const TUNNEL_HALF_LENGTH = TUNNEL_LENGTH / 2;
const STOP_LINE_OFFSET = 14;
const TRAFFIC_STOP_BUFFER = 18;
const GEAR_SPEEDS = { 1: 30, 2: 46, 3: 64 };

const MAPS = {
  winter: {
    name: "Winter",
    sky: 0xb9c8d8,
    fog: 0xc7d0d8,
    ground: 0xd9e0e6,
    road: 0x303842,
    shoulder: 0xd7dde2,
    tree: 0x41505d,
    light: 0xffffff,
    snow: true,
  },
  summer: {
    name: "Summer",
    sky: 0x88c5df,
    fog: 0xb2d4df,
    ground: 0x6f8d54,
    road: 0x34383d,
    shoulder: 0xa89a75,
    tree: 0x2f5737,
    light: 0xfff0cd,
  },
  autumn: {
    name: "Autumn",
    sky: 0xe2a363,
    fog: 0xdfb078,
    ground: 0xa87445,
    road: 0x43352c,
    shoulder: 0x9b6b43,
    tree: 0x8b4f2f,
    light: 0xffd6a0,
  },
  rain: {
    name: "Rain",
    sky: 0x566575,
    fog: 0x6d7780,
    ground: 0x384238,
    road: 0x181c20,
    shoulder: 0x5e6468,
    tree: 0x263b2f,
    light: 0xbfd1df,
    rain: true,
  },
};

const CARS = [
  {
    id: "civic",
    name: "Civic RS",
    price: 0,
    body: 0x1f4d72,
    trim: 0xd9e2ea,
    glass: 0x9fb6c6,
    stats: { acceleration: 0, tire: 0.04, brake: 0.03, fuel: 0.05 },
  },
  {
    id: "coupe",
    name: "Coupe GT",
    price: 220,
    body: 0x8d241d,
    trim: 0xe9dfd1,
    glass: 0x9fb6c6,
    stats: { acceleration: 0.22, tire: 0.02, brake: 0.04, fuel: -0.03 },
  },
  {
    id: "wagon",
    name: "Touring Wagon",
    price: 280,
    body: 0x2f5c3e,
    trim: 0xd6ded4,
    glass: 0x9fb6c6,
    stats: { acceleration: 0.32, tire: 0.08, brake: 0.08, fuel: 0.06 },
  },
  {
    id: "blackline",
    name: "Blackline V6",
    price: 380,
    body: 0x151719,
    trim: 0xbec6cc,
    glass: 0x8fa6b6,
    stats: { acceleration: 0.5, tire: 0.05, brake: 0.05, fuel: -0.06 },
  },
];

const UPGRADES = [
  { id: "acceleration", label: "Acceleration" },
  { id: "tire", label: "Tires" },
  { id: "brake", label: "Brakes" },
  { id: "fuel", label: "Fuel tank" },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isInsideTunnel(playerZ, tunnelZ) {
  return playerZ > tunnelZ - TUNNEL_HALF_LENGTH && playerZ < tunnelZ + TUNNEL_HALF_LENGTH;
}

function defaultUpgrades() {
  return { acceleration: 0, tire: 0, brake: 0, fuel: 0 };
}

function defaultSave() {
  return {
    playerName: "",
    coins: 0,
    bestDistance: 0,
    selectedMap: "summer",
    selectedCar: "civic",
    transmission: "automatic",
    ownedCars: ["civic"],
    upgrades: { civic: defaultUpgrades() },
  };
}

function normalizeSave(raw) {
  const base = defaultSave();
  if (!raw || typeof raw !== "object") return base;
  const ownedCars = Array.isArray(raw.ownedCars)
    ? raw.ownedCars.filter((id) => CARS.some((car) => car.id === id))
    : base.ownedCars;
  const upgrades = {};
  for (const carId of ownedCars.length ? ownedCars : base.ownedCars) {
    upgrades[carId] = { ...defaultUpgrades(), ...(raw.upgrades?.[carId] || {}) };
  }
  return {
    playerName: typeof raw.playerName === "string" ? raw.playerName : "",
    coins: Number.isFinite(raw.coins) ? raw.coins : 0,
    bestDistance: Number.isFinite(raw.bestDistance) ? raw.bestDistance : 0,
    selectedMap: MAPS[raw.selectedMap] ? raw.selectedMap : "summer",
    selectedCar: ownedCars.includes(raw.selectedCar) ? raw.selectedCar : "civic",
    transmission: raw.transmission === "manual" ? "manual" : "automatic",
    ownedCars: ownedCars.length ? ownedCars : base.ownedCars,
    upgrades,
  };
}

function carById(id) {
  return CARS.find((car) => car.id === id) || CARS[0];
}

function upgradeCost(level) {
  return 70 + level * 55;
}

function combinedStats(carId, upgrades) {
  const car = carById(carId);
  const u = upgrades[carId] || defaultUpgrades();
  return {
    acceleration: car.stats.acceleration + u.acceleration * 0.08,
    tire: 1 + car.stats.tire + u.tire * 0.12,
    brake: 1 + car.stats.brake + u.brake * 0.15,
    fuel: 1 + car.stats.fuel + u.fuel * 0.12,
  };
}

function makeCar(THREE, car, scale = 1) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: car.body, roughness: 0.48, metalness: 0.25 });
  const trimMat = new THREE.MeshStandardMaterial({ color: car.trim, roughness: 0.35, metalness: 0.45 });
  const glassMat = new THREE.MeshStandardMaterial({ color: car.glass, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.72 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.65 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffeed2, emissive: 0xffdf9a, emissiveIntensity: 0.7 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa1f1f, emissive: 0x771515, emissiveIntensity: 0.45 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.52, 4.1), bodyMat);
  body.position.y = 0.48;
  group.add(body);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 1.35), trimMat);
  hood.position.set(0, 0.78, -1.18);
  group.add(hood);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.62, 1.45), glassMat);
  cabin.position.set(0, 1.0, 0.25);
  group.add(cabin);

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.1, 0.9), trimMat);
  trunk.position.set(0, 0.78, 1.45);
  group.add(trunk);

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 24);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-1.04, 1.04]) {
    for (const z of [-1.34, 1.34]) {
      const wheel = new THREE.Mesh(wheelGeo, tireMat);
      wheel.position.set(x, 0.28, z);
      group.add(wheel);
    }
  }

  for (const x of [-0.52, 0.52]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.08), lightMat);
    headlight.position.set(x, 0.62, -2.1);
    group.add(headlight);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.08), tailMat);
    tail.position.set(x, 0.62, 2.1);
    group.add(tail);
  }

  group.scale.setScalar(scale);
  group.castShadow = true;
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

function makeRoadSegment(THREE, theme, z) {
  const group = new THREE.Group();
  group.position.z = z;
  const roadMat = new THREE.MeshStandardMaterial({
    color: theme.road,
    roughness: theme.rain ? 0.12 : 0.92,
    metalness: theme.rain ? 0.28 : 0,
  });
  const shoulderMat = new THREE.MeshStandardMaterial({ color: theme.shoulder, roughness: 0.86 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2ead9, roughness: 0.55 });
  const dividerMat = new THREE.MeshStandardMaterial({ color: 0xf0c443, roughness: 0.42, emissive: 0x4a3300, emissiveIntensity: 0.08 });

  const road = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.08, 46), roadMat);
  road.position.x = 3.7;
  road.receiveShadow = true;
  group.add(road);

  if (theme.rain) {
    const puddleMat = new THREE.MeshStandardMaterial({
      color: 0x9fb6c7,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: 0.18,
    });
    for (let i = 0; i < 10; i += 1) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.42 + Math.random() * 0.7, 18), puddleMat);
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set((Math.random() - 0.5) * 7.2, 0.12, -20 + i * 4.4 + Math.random() * 1.4);
      puddle.scale.x = 1.7 + Math.random() * 1.4;
      group.add(puddle);
    }
  }

  for (const x of [-5.8, 13.2]) {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 46), shoulderMat);
    shoulder.position.x = x;
    shoulder.receiveShadow = true;
    group.add(shoulder);
  }

  for (let i = -4; i <= 4; i += 1) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.6), lineMat);
    dash.position.set(0, 0.08, i * 5.2);
    group.add(dash);
  }

  for (const x of [4.25, 4.6]) {
    for (let i = -4; i <= 4; i += 1) {
      const divider = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4.2), dividerMat);
      divider.position.set(x, 0.09, i * 5.2);
      group.add(divider);
    }
  }

  for (let i = -4; i <= 4; i += 1) {
    const laneLine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 2.7), lineMat);
    laneLine.position.set(8.25, 0.09, i * 5.2);
    group.add(laneLine);
  }

  for (const x of [-6.45, 13.9]) {
    for (let i = -4; i <= 4; i += 1) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), lineMat);
      post.position.set(x, 0.34, i * 5.4);
      group.add(post);
    }
  }

  return group;
}

function makeTunnel(THREE) {
  const group = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.74, metalness: 0.08 });
  const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x202326, roughness: 0.86 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xd5c26a, roughness: 0.45, emissive: 0x493b0d, emissiveIntensity: 0.08 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff1c7, roughness: 0.25, emissive: 0xffd27b, emissiveIntensity: 1.2 });

  const roof = new THREE.Mesh(new THREE.BoxGeometry(20.7, 0.74, TUNNEL_LENGTH), concrete);
  roof.position.set(3.7, 8.4, 0);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  for (const x of [-6.45, 13.9]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.35, TUNNEL_LENGTH), darkConcrete);
    wall.position.set(x, 4.18, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, TUNNEL_LENGTH), stripeMat);
    curb.position.set(x * 0.9, 0.28, 0);
    group.add(curb);
  }

  for (const z of [-TUNNEL_HALF_LENGTH + 0.4, TUNNEL_HALF_LENGTH - 0.4]) {
    const header = new THREE.Mesh(new THREE.BoxGeometry(21.1, 0.6, 0.7), concrete);
    header.position.set(3.7, 8.65, z);
    group.add(header);
    for (const x of [-6.9, 14.35]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.7, 0.7), concrete);
      pillar.position.set(x, 4.35, z);
      group.add(pillar);
    }
  }

  for (let i = -15; i <= 15; i += 1) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.22), lightMat);
    light.position.set(0, 7.78, i * 13.4);
    group.add(light);
  }

  return group;
}

function makeTrafficLight(THREE) {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x25282b, roughness: 0.55, metalness: 0.35 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x151719, roughness: 0.5, metalness: 0.22 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf5f7f7, roughness: 0.42 });
  const signMat = new THREE.MeshStandardMaterial({ color: 0xf4d13d, roughness: 0.36, metalness: 0.05 });
  const signMarkMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.52 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0x6d1717, emissive: 0xff2020, emissiveIntensity: 0.25 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0x7b4a0c, emissive: 0xff9f1c, emissiveIntensity: 0.18 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x154f27, emissive: 0x2dff72, emissiveIntensity: 0.18 });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 10), poleMat);
  pole.position.set(-6.2, 2.1, 0);
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.12, 0.12), poleMat);
  arm.position.set(-3.35, 4.05, 0);
  group.add(arm);

  const signalBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.85, 0.42), boxMat);
  signalBox.position.set(-0.6, 3.45, 0);
  group.add(signalBox);

  const stopLine = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.08, 0.42), lineMat);
  stopLine.position.set(3.2, 0.16, STOP_LINE_OFFSET);
  stopLine.receiveShadow = true;
  group.add(stopLine);

  for (const z of [STOP_LINE_OFFSET + 42, STOP_LINE_OFFSET + 82]) {
    const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8), poleMat);
    signPole.position.set(14.25, 0.9, z);
    group.add(signPole);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.72, 0.08), signMat);
    sign.position.set(14.25, 1.85, z);
    sign.rotation.z = Math.PI / 4;
    group.add(sign);

    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.09), signMarkMat);
    mark.position.set(14.25, 1.85, z + 0.02);
    mark.rotation.z = Math.PI / 4;
    group.add(mark);
  }

  const bulbs = {};
  for (const [name, y, material] of [
    ["red", 4.02, redMat],
    ["orange", 3.45, orangeMat],
    ["green", 2.88, greenMat],
  ]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), material);
    bulb.position.set(-0.6, y, 0.25);
    group.add(bulb);
    const backBulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), material);
    backBulb.position.set(-0.6, y, -0.25);
    group.add(backBulb);
    bulbs[name] = { bulb, material };
  }

  group.userData.bulbs = bulbs;
  return group;
}

function makePickup(THREE, kind) {
  const group = new THREE.Group();
  if (kind === "coin") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe4ac32, metalness: 0.72, roughness: 0.2, emissive: 0x6f4700, emissiveIntensity: 0.15 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 32), mat);
    coin.rotation.x = Math.PI / 2;
    coin.position.y = 0.55;
    group.add(coin);
  } else if (kind === "nitro") {
    const bottleMat = new THREE.MeshStandardMaterial({ color: 0x1594ff, roughness: 0.24, metalness: 0.28, emissive: 0x064d9e, emissiveIntensity: 0.45 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xd8f2ff, roughness: 0.18, metalness: 0.42, emissive: 0x1e9bff, emissiveIntensity: 0.2 });
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.88, 18), bottleMat);
    bottle.position.y = 0.66;
    group.add(bottle);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 16), trimMat);
    neck.position.y = 1.2;
    group.add(neck);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0x36c8ff, transparent: true, opacity: 0.22 })
    );
    glow.position.y = 0.75;
    group.add(glow);
  } else {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.78, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x2f7d47, roughness: 0.5, metalness: 0.2 })
    );
    body.position.y = 0.52;
    group.add(body);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.12, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 })
    );
    cap.position.y = 0.98;
    group.add(cap);
  }
  return group;
}

function makeNitroFlames(THREE) {
  const group = new THREE.Group();
  const blue = new THREE.MeshBasicMaterial({ color: 0x28b7ff, transparent: true, opacity: 0.78 });
  const core = new THREE.MeshBasicMaterial({ color: 0xd9fbff, transparent: true, opacity: 0.8 });
  for (const x of [-0.46, 0.46]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.35, 18), blue);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(x, 0.44, 2.8);
    group.add(flame);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.86, 14), core);
    inner.rotation.x = Math.PI / 2;
    inner.position.set(x, 0.44, 2.72);
    group.add(inner);
  }
  group.visible = false;
  return group;
}

function makeHeadlights(THREE) {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff1c2,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const x of [-0.54, 0.54]) {
    const light = new THREE.SpotLight(0xfff1c2, 2.5, 56, 0.62, 0.6, 1.05);
    light.position.set(x, 0.78, -2.35);
    light.target.position.set(0, 0.05, -34);
    group.add(light);
    group.add(light.target);
  }
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 24), beamMat);
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0.11, -15.6);
  group.add(beam);
  group.visible = false;
  return group;
}

function makeTree(THREE, theme) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 1.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x50351f, roughness: 0.8 })
  );
  trunk.position.y = 0.65;
  group.add(trunk);
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, 1.8, 8),
    new THREE.MeshStandardMaterial({ color: theme.tree, roughness: 0.85 })
  );
  crown.position.y = 1.95;
  group.add(crown);
  return group;
}

function createDriveAudio(map) {
  if (typeof window === "undefined") return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  try {
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = 0.62;
    master.connect(context.destination);

    const engineFilter = context.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 420;
    engineFilter.Q.value = 0.7;

    const engineGain = context.createGain();
    engineGain.gain.value = 0.12;

    const engineOsc = context.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 74;

    const engineSubOsc = context.createOscillator();
    engineSubOsc.type = "triangle";
    engineSubOsc.frequency.value = 37;

    engineOsc.connect(engineFilter);
    engineSubOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineSubOsc.start();

    let rainGain = null;
    let rainSource = null;
    if (map.rain) {
      const seconds = 2;
      const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i += 1) {
        last = last * 0.62 + (Math.random() * 2 - 1) * 0.38;
        data[i] = last * 0.45;
      }

      const rainFilter = context.createBiquadFilter();
      rainFilter.type = "bandpass";
      rainFilter.frequency.value = 1350;
      rainFilter.Q.value = 0.55;

      rainGain = context.createGain();
      rainGain.gain.value = 0.1;

      rainSource = context.createBufferSource();
      rainSource.buffer = buffer;
      rainSource.loop = true;
      rainSource.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(master);
      rainSource.start();
    }

    return {
      resume() {
        if (context.state === "suspended") context.resume();
      },
      setSpeed(speed, forward) {
        const now = context.currentTime;
        const rev = clamp(speed / 90, 0, 1.5);
        engineOsc.frequency.setTargetAtTime(58 + rev * 68 + (forward ? 10 : 0), now, 0.08);
        engineSubOsc.frequency.setTargetAtTime(29 + rev * 34 + (forward ? 5 : 0), now, 0.08);
        engineFilter.frequency.setTargetAtTime(360 + rev * 520, now, 0.12);
        engineGain.gain.setTargetAtTime(0.09 + rev * 0.075 + (forward ? 0.025 : 0), now, 0.1);
        if (rainGain) rainGain.gain.setTargetAtTime(0.08 + rev * 0.02, now, 0.2);
      },
      stop() {
        try {
          engineOsc.stop();
          engineSubOsc.stop();
          if (rainSource) rainSource.stop();
        } catch {
          // The browser may already have stopped nodes during cleanup.
        }
        context.close();
      },
    };
  } catch {
    return null;
  }
}

export default function Page() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const stateRef = useRef(null);
  const keysRef = useRef({ left: false, right: false, forward: false, brake: false, nitro: false, gear: 1 });
  const headlightOnRef = useRef(false);
  const swipeStartRef = useRef(null);
  const hydratedRef = useRef(false);
  const audioRef = useRef(null);

  const [screen, setScreen] = useState("name");
  const [nameDraft, setNameDraft] = useState("");
  const [profile, setProfile] = useState(defaultSave());
  const [runHud, setRunHud] = useState({ fuel: 100, coins: 0, distance: 0, speed: 0, nitro: 0, gear: 1, inTunnel: false });
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState("");
  const [penaltyNotice, setPenaltyNotice] = useState(null);

  useEffect(() => {
    try {
      const saved = normalizeSave(JSON.parse(localStorage.getItem(SAVE_KEY) || "null"));
      setProfile(saved);
      setNameDraft(saved.playerName);
      setScreen(saved.playerName ? "menu" : "name");
    } catch {
      setProfile(defaultSave());
    } finally {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (hydratedRef.current) {
      localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
    }
  }, [profile]);

  function moveLane(direction) {
    const run = stateRef.current;
    if (!run) return;
    run.targetLane = clamp(run.targetLane + direction, 0, 2);
  }

  function startMobileSwipe(event) {
    const touch = event.touches?.[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function finishMobileSwipe(event) {
    const start = swipeStartRef.current;
    const touch = event.changedTouches?.[0];
    swipeStartRef.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    event.preventDefault();
    moveLane(dx < 0 ? -1 : 1);
  }

  function setDriveControl(control, active) {
    keysRef.current[control] = active;
  }

  function setGear(gear) {
    if (profile.transmission !== "manual") return;
    keysRef.current.gear = gear;
  }

  function toggleHeadlights() {
    const run = stateRef.current;
    if (!run) return;
    headlightOnRef.current = !headlightOnRef.current;
    run.headlights.visible = headlightOnRef.current;
  }

  useEffect(() => {
    if (!penaltyNotice) return undefined;
    const timer = window.setTimeout(() => setPenaltyNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [penaltyNotice]);

  useEffect(() => {
    if (screen !== "game" || !mountRef.current) return undefined;

    let raf = 0;
    let alive = true;
    let cleanup = () => {};

    async function boot() {
      const THREE = await import("three");
      if (!alive || !mountRef.current) return;

      const map = MAPS[profile.selectedMap];
      const audio = createDriveAudio(map);
      audioRef.current = audio;
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mountRef.current.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(map.sky);
      scene.fog = new THREE.Fog(map.fog, 45, 190);

      const camera = new THREE.PerspectiveCamera(58, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 280);
      camera.position.set(0, 7.4, 14.5);
      camera.lookAt(0, 0.8, -13);

      const hemi = new THREE.HemisphereLight(map.light, 0x3a3a3a, 1.45);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(map.light, 2.25);
      sun.position.set(-9, 15, 10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      scene.add(sun);

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(260, 360),
        new THREE.MeshStandardMaterial({ color: map.ground, roughness: 0.95 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.z = -70;
      ground.receiveShadow = true;
      scene.add(ground);

      const roads = [];
      for (let i = 0; i < 8; i += 1) {
        const road = makeRoadSegment(THREE, map, -i * 46);
        scene.add(road);
        roads.push(road);
      }

      const tunnels = [];
      for (let i = 0; i < 1; i += 1) {
        const tunnel = makeTunnel(THREE);
        tunnel.position.z = -950;
        scene.add(tunnel);
        tunnels.push(tunnel);
      }

      const trafficLights = [];
      const trafficLight = makeTrafficLight(THREE);
      trafficLight.position.z = -650;
      trafficLight.userData.fined = false;
      scene.add(trafficLight);
      trafficLights.push(trafficLight);

      const trees = [];
      for (let i = 0; i < 34; i += 1) {
        const tree = makeTree(THREE, map);
        const side = i % 2 === 0 ? -1 : 1;
        const treeX = side < 0 ? -10.5 - Math.random() * 18 : 15.2 + Math.random() * 18;
        tree.position.set(treeX, 0, -Math.random() * 260);
        const s = 0.8 + Math.random() * 0.9;
        tree.scale.set(s, s, s);
        scene.add(tree);
        trees.push(tree);
      }

      let weatherSystem = null;
      let splashSystem = null;
      if (map.rain || map.snow) {
        const particleCount = map.rain ? 2400 : 1600;
        const weatherPositions = new Float32Array(particleCount * 6);
        for (let i = 0; i < particleCount; i += 1) {
          const x = (Math.random() - 0.5) * 110;
          const y = 2 + Math.random() * 40;
          const z = 14 - Math.random() * 145;
          const length = map.rain ? 1.9 + Math.random() * 1.8 : 0.32 + Math.random() * 0.28;
          weatherPositions[i * 6] = x;
          weatherPositions[i * 6 + 1] = y;
          weatherPositions[i * 6 + 2] = z;
          weatherPositions[i * 6 + 3] = x - (map.rain ? 0.45 : 0);
          weatherPositions[i * 6 + 4] = y - length;
          weatherPositions[i * 6 + 5] = z + (map.rain ? 0.22 : 0);
        }
        const weatherGeometry = new THREE.BufferGeometry();
        weatherGeometry.setAttribute("position", new THREE.BufferAttribute(weatherPositions, 3));
        const weatherMaterial = new THREE.LineBasicMaterial({
          color: map.rain ? 0xbdd3e6 : 0xffffff,
          transparent: true,
          opacity: map.rain ? 0.52 : 0.76,
        });
        weatherSystem = new THREE.LineSegments(weatherGeometry, weatherMaterial);
        scene.add(weatherSystem);

        if (map.rain) {
          const splashPositions = new Float32Array(360 * 3);
          for (let i = 0; i < 360; i += 1) {
            splashPositions[i * 3] = (Math.random() - 0.5) * 10;
            splashPositions[i * 3 + 1] = 0.15 + Math.random() * 0.22;
            splashPositions[i * 3 + 2] = 8 - Math.random() * 95;
          }
          const splashGeometry = new THREE.BufferGeometry();
          splashGeometry.setAttribute("position", new THREE.BufferAttribute(splashPositions, 3));
          const splashMaterial = new THREE.PointsMaterial({
            color: 0xc8dfef,
            size: 0.06,
            transparent: true,
            opacity: 0.55,
          });
          splashSystem = new THREE.Points(splashGeometry, splashMaterial);
          scene.add(splashSystem);
        }
      }

      const playerCar = makeCar(THREE, carById(profile.selectedCar), 1);
      playerCar.position.set(0, 0.12, 3.2);
      const nitroFlames = makeNitroFlames(THREE);
      playerCar.add(nitroFlames);
      const headlights = makeHeadlights(THREE);
      headlights.visible = headlightOnRef.current;
      playerCar.add(headlights);
      scene.add(playerCar);

      const rightTraffic = [];
      const rightChoices = CARS.filter((car) => car.id !== profile.selectedCar);
      for (let i = 0; i < 4; i += 1) {
        const mesh = makeCar(THREE, rightChoices[i % rightChoices.length] || CARS[1], 0.9);
        const lane = RIGHT_TRAFFIC_LANES[i % RIGHT_TRAFFIC_LANES.length];
        mesh.rotation.y = Math.PI;
        mesh.position.set(lane, 0.08, -170 - i * 95);
        scene.add(mesh);
        rightTraffic.push({
          mesh,
          lane,
          speed: 24 + (i % 2) * 5,
        });
      }

      const stats = combinedStats(profile.selectedCar, profile.upgrades);
      const run = {
        THREE,
        renderer,
        scene,
        camera,
        map,
        ground,
        roads,
        tunnels,
        trafficLights,
        trees,
        rightTraffic,
        weatherSystem,
        splashSystem,
        playerCar,
        stats,
        lane: 1,
        targetLane: 1,
        fuel: 100,
        distance: 0,
        coins: 0,
        nitro: 0,
        transmission: profile.transmission,
        gear: keysRef.current.gear,
        speed: 18 + stats.acceleration * 10,
        spawnTimer: 0.8,
        difficulty: 0,
        inTunnel: false,
        signalTime: 0,
        signalState: "green",
        objects: [],
        nitroFlames,
        headlights,
        audio,
        lastTime: performance.now(),
        over: false,
      };
      stateRef.current = run;
      sceneRef.current = { renderer, scene, camera };

      function spawnObject() {
        const roll = Math.random();
        const z = -120 - Math.random() * 70;
        let mesh;
        let kind;
        let lane;
        if (roll < 0.55) {
          kind = "traffic";
          const blockedLanes = new Set(
            run.objects
              .filter((item) => item.kind === "traffic" && Math.abs(item.mesh.position.z - z) < 34)
              .map((item) => item.lane)
          );
          const openLanes = [0, 1, 2].filter((laneId) => !blockedLanes.has(laneId));
          if (openLanes.length === 0 || (openLanes.length === 1 && Math.random() < 0.55)) {
            return;
          }
          lane = openLanes[Math.floor(Math.random() * openLanes.length)];
          const choices = CARS.filter((car) => car.id !== profile.selectedCar);
          mesh = makeCar(THREE, choices[Math.floor(Math.random() * choices.length)] || CARS[1], 0.92);
        } else if (roll < 0.90) {
          kind = "coin";
          const lane = Math.floor(Math.random() * LANES.length);
          mesh = makePickup(THREE, "coin");
          mesh.position.set(LANES[lane], 0.08, z);
          scene.add(mesh);
          run.objects.push({ mesh, kind, lane, z, trafficSpeed: 0 });
          return;
        } else if (roll < 0.985) {
          kind = "fuel";
          const lane = Math.floor(Math.random() * LANES.length);
          mesh = makePickup(THREE, "fuel");
          mesh.position.set(LANES[lane], 0.08, z);
          scene.add(mesh);
          run.objects.push({ mesh, kind, lane, z, trafficSpeed: 0 });
          return;
        } else {
          kind = "nitro";
          const lane = Math.floor(Math.random() * LANES.length);
          mesh = makePickup(THREE, "nitro");
          mesh.position.set(LANES[lane], 0.08, z);
          scene.add(mesh);
          run.objects.push({ mesh, kind, lane, z, trafficSpeed: 0 });
          return;
        }
        mesh.position.set(LANES[lane], 0.08, z);
        scene.add(mesh);
        const cruiseSpeed = kind === "traffic" ? 14 + Math.random() * 10 + run.difficulty * 2.2 : 0;
        run.objects.push({
          mesh,
          kind,
          lane,
          z,
          trafficSpeed: cruiseSpeed,
          cruiseSpeed,
        });
      }

      function finishRun(reason = "Fuel empty") {
        if (run.over) return;
        run.over = true;
        const distance = Math.floor(run.distance);
        setProfile((current) => ({
          ...current,
          bestDistance: Math.max(current.bestDistance, distance),
          coins: current.coins + run.coins,
        }));
        setResult({ distance, coins: run.coins, reason });
        setScreen("gameover");
      }

      function animate(now) {
        const dt = clamp((now - run.lastTime) / 1000, 0.01, 0.033);
        run.lastTime = now;
        run.difficulty = clamp(run.distance / 850, 0, 3.4);
        run.transmission = profile.transmission;
        run.gear = run.transmission === "manual" ? keysRef.current.gear : 3;
        const gearNumber = Number(run.gear) || 3;
        const nitroActive = keysRef.current.nitro && run.nitro > 0 && !keysRef.current.brake;
        const normalTargetSpeed =
          GEAR_SPEEDS[gearNumber] +
          run.stats.acceleration * (8 + gearNumber * 5) +
          (keysRef.current.forward ? 5 + gearNumber * 3.4 : 0) +
          run.difficulty * (1.6 + gearNumber * 1.45) +
          (nitroActive ? 22 + gearNumber * 4 : 0);
        const targetSpeed = keysRef.current.brake ? 0 : normalTargetSpeed;
        run.speed += (targetSpeed - run.speed) * dt * (keysRef.current.brake ? 5.8 : nitroActive ? 4.2 : 2.2 + gearNumber * 0.28);
        if (keysRef.current.brake && run.speed < 0.8) run.speed = 0;
        if (nitroActive) run.nitro = clamp(run.nitro - 10 * dt, 0, 100);
        run.nitroFlames.visible = nitroActive;
        if (nitroActive) {
          const flameScale = 0.86 + Math.sin(now * 0.025) * 0.12;
          run.nitroFlames.scale.set(1, 1, flameScale);
        }
        run.audio?.setSpeed(run.speed, keysRef.current.forward || nitroActive);
        run.distance += run.speed * dt;
        run.fuel -= (0.66 + run.speed / 78) * dt / clamp(run.stats.fuel, 0.75, 1.8);

        run.playerCar.position.x += (LANES[run.targetLane] - run.playerCar.position.x) * dt * (5.8 + run.stats.tire * 1.8);
        run.playerCar.position.y += (0.12 - run.playerCar.position.y) * dt * 4.8;
        run.playerCar.rotation.x += (0 - run.playerCar.rotation.x) * dt * 4.2;
        run.playerCar.rotation.z = (LANES[run.targetLane] - run.playerCar.position.x) * -0.05;
        run.lane = run.targetLane;

        for (const road of run.roads) {
          road.position.z += run.speed * dt;
          if (road.position.z > 46) road.position.z -= 46 * run.roads.length;
          road.position.y = 0;
          road.rotation.x = 0;
        }

        let inTunnel = false;
        for (const tunnel of run.tunnels) {
          tunnel.position.z += run.speed * dt;
          if (tunnel.position.z > TUNNEL_HALF_LENGTH + 45) {
            tunnel.position.z = -2500 - Math.random() * 1500;
          }
          if (isInsideTunnel(run.playerCar.position.z, tunnel.position.z)) inTunnel = true;
        }
        run.inTunnel = inTunnel;
        if (run.weatherSystem) run.weatherSystem.visible = !inTunnel;
        if (run.splashSystem) run.splashSystem.visible = !inTunnel;

        run.signalTime += dt;
        const signalCycle = run.signalTime % 15;
        run.signalState = signalCycle < 7.5 ? "green" : signalCycle < 9.5 ? "orange" : "red";
        for (const light of run.trafficLights) {
          light.position.z += run.speed * dt;
          if (light.position.z > 95) {
            light.position.z = -1400 - Math.random() * 950;
            light.userData.fined = false;
          }
          const bulbs = light.userData.bulbs;
          if (bulbs) {
            bulbs.red.material.emissiveIntensity = run.signalState === "red" ? 2.8 : 0.16;
            bulbs.orange.material.emissiveIntensity = run.signalState === "orange" ? 2.25 : 0.12;
            bulbs.green.material.emissiveIntensity = run.signalState === "green" ? 2.4 : 0.12;
          }
          const stopLineZ = light.position.z + STOP_LINE_OFFSET;
          if (
            run.signalState === "red" &&
            !light.userData.fined &&
            stopLineZ > run.playerCar.position.z - 0.6 &&
            stopLineZ < run.playerCar.position.z + 2.4 &&
            run.speed > 2
          ) {
            const lostCoins = run.coins;
            run.coins = 0;
            light.userData.fined = true;
            setPenaltyNotice({ id: now, lostCoins });
          }
        }

        for (const tree of run.trees) {
          tree.position.z += run.speed * dt;
          if (tree.position.z > 18) tree.position.z -= 280;
          tree.position.y = 0;
        }

        if (run.weatherSystem) {
          const positions = run.weatherSystem.geometry.attributes.position.array;
          for (let i = 0; i < positions.length; i += 6) {
            const drift = run.map.snow ? Math.sin((run.distance + i) * 0.027) * dt * 2.4 : -dt * 7.5;
            const fall = (run.map.rain ? 34 : 9.5 + (i % 7) * 0.35) * dt;
            const forward = run.speed * dt * (run.map.rain ? 0.18 : 0.14);
            positions[i] += drift;
            positions[i + 1] -= fall;
            positions[i + 2] += forward;
            positions[i + 3] += drift;
            positions[i + 4] -= fall;
            positions[i + 5] += forward;
            if (
              positions[i + 1] < 0 ||
              positions[i + 2] > run.playerCar.position.z + 18 ||
              positions[i + 2] < run.playerCar.position.z - 145
            ) {
              const x = run.playerCar.position.x + (Math.random() - 0.5) * 110;
              const y = 24 + Math.random() * 20;
              const z = run.playerCar.position.z + 12 - Math.random() * 145;
              const length = run.map.rain ? 2.4 + Math.random() * 2.2 : 0.32 + Math.random() * 0.28;
              positions[i] = x;
              positions[i + 1] = y;
              positions[i + 2] = z;
              positions[i + 3] = x - (run.map.rain ? 0.5 : 0);
              positions[i + 4] = y - length;
              positions[i + 5] = z + (run.map.rain ? 0.28 : 0);
            }
          }
          run.weatherSystem.geometry.attributes.position.needsUpdate = true;
        }

        if (run.splashSystem) {
          const splashes = run.splashSystem.geometry.attributes.position.array;
          for (let i = 0; i < splashes.length; i += 3) {
            splashes[i + 1] += dt * 0.9;
            splashes[i + 2] += run.speed * dt;
            if (splashes[i + 1] > 0.55 || splashes[i + 2] > run.playerCar.position.z + 8) {
              splashes[i] = run.playerCar.position.x + (Math.random() - 0.5) * 10;
              splashes[i + 1] = 0.12 + Math.random() * 0.12;
              splashes[i + 2] = run.playerCar.position.z + 4 - Math.random() * 95;
            }
          }
          run.splashSystem.geometry.attributes.position.needsUpdate = true;
        }

        run.spawnTimer -= dt;
        if (run.spawnTimer <= 0) {
          spawnObject();
          run.spawnTimer = clamp(1.02 - run.difficulty * 0.18, 0.28, 1.02) + Math.random() * clamp(0.26 - run.difficulty * 0.035, 0.08, 0.26);
        }

        for (const car of run.rightTraffic) {
          car.mesh.position.z += (run.speed + car.speed + run.difficulty * 2) * dt;
          car.mesh.position.y = 0.08;
          car.mesh.rotation.y += (Math.PI - car.mesh.rotation.y) * dt * 2.4;
          if (car.mesh.position.z > 34) {
            const farthestRightCarZ = Math.min(...run.rightTraffic.map((item) => item.mesh.position.z));
            car.lane = RIGHT_TRAFFIC_LANES[Math.floor(Math.random() * RIGHT_TRAFFIC_LANES.length)];
            car.mesh.position.set(car.lane, 0.08, farthestRightCarZ - 140 - Math.random() * 120);
            car.speed = 24 + Math.random() * 8 + run.difficulty * 1.8;
          }
        }

        for (let i = run.objects.length - 1; i >= 0; i -= 1) {
          const item = run.objects[i];
          let trafficStopLineZ = null;
          let shouldStop = false;
          if (item.kind === "traffic") {
            const activeLight = run.trafficLights.find(
              (light) => {
                const stopLineZ = light.position.z + STOP_LINE_OFFSET;
                return stopLineZ > item.mesh.position.z - 18 && stopLineZ - item.mesh.position.z < 145;
              }
            );
            shouldStop = activeLight && run.signalState === "red";
            const targetTrafficSpeed = shouldStop ? 0 : item.cruiseSpeed;
            item.trafficSpeed += (targetTrafficSpeed - item.trafficSpeed) * dt * (shouldStop ? 5.5 : 2.4);
            trafficStopLineZ = activeLight ? activeLight.position.z + STOP_LINE_OFFSET : null;
          }
          item.mesh.position.z += (run.speed - item.trafficSpeed) * dt;
          if (shouldStop && trafficStopLineZ !== null && item.mesh.position.z > trafficStopLineZ - TRAFFIC_STOP_BUFFER) {
            item.mesh.position.z = trafficStopLineZ - TRAFFIC_STOP_BUFFER;
            item.trafficSpeed = 0;
          }
          item.mesh.position.y = 0.08;
          item.mesh.rotation.y += item.kind === "coin" ? dt * 4 : 0;
          if (item.mesh.position.z > 11) {
            scene.remove(item.mesh);
            run.objects.splice(i, 1);
            continue;
          }

          const dz = Math.abs(item.mesh.position.z - run.playerCar.position.z);
          const dx = Math.abs(item.mesh.position.x - run.playerCar.position.x);
          if (dz < 2.6 && dx < 1.55) {
            if (item.kind === "traffic") {
              scene.remove(item.mesh);
              run.objects.splice(i, 1);
              finishRun("Crashed");
              break;
            } else if (item.kind === "fuel") {
              run.fuel = clamp(run.fuel + 28 * clamp(run.stats.fuel, 0.8, 1.6), 0, 100);
            } else if (item.kind === "nitro") {
              run.nitro = clamp(run.nitro + 25, 0, 100);
            } else {
              run.coins += 5;
            }
            scene.remove(item.mesh);
            run.objects.splice(i, 1);
          }
        }

        camera.position.x += (run.playerCar.position.x * 0.24 - camera.position.x) * dt * 2.2;
        camera.position.y += ((inTunnel ? 5.95 : 7.4) - camera.position.y) * dt * 2.1;
        camera.lookAt(run.playerCar.position.x * 0.2, inTunnel ? 1.35 : 0.8, inTunnel ? -24 : -13);

        renderer.render(scene, camera);
        setRunHud({
          fuel: Math.max(0, Math.round(run.fuel)),
          coins: run.coins,
          distance: Math.floor(run.distance),
          speed: Math.floor(run.speed * 2.4),
          nitro: Math.round(run.nitro),
          gear: run.gear,
          transmission: run.transmission,
          inTunnel,
        });

        if (run.fuel <= 0) finishRun("Fuel empty");
        if (!run.over) raf = requestAnimationFrame(animate);
      }

      function onResize() {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }

      window.addEventListener("resize", onResize);
      if (audio) {
        window.addEventListener("pointerdown", audio.resume, { passive: true });
        window.addEventListener("keydown", audio.resume);
      }
      raf = requestAnimationFrame(animate);
      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        if (audio) {
          window.removeEventListener("pointerdown", audio.resume);
          window.removeEventListener("keydown", audio.resume);
        }
        audio?.stop();
        if (audioRef.current === audio) audioRef.current = null;
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    boot();
    return () => {
      alive = false;
      cleanup();
    };
  }, [screen, profile.selectedMap, profile.selectedCar, profile.upgrades]);

  useEffect(() => {
    function down(event) {
      const key = event.key.toLowerCase();
      if (screen !== "game") return;
      if (key === "a" || key === "arrowleft") {
        moveLane(-1);
        event.preventDefault();
      }
      if (key === "d" || key === "arrowright") {
        moveLane(1);
        event.preventDefault();
      }
      if (key === "w" || key === "arrowup") {
        setDriveControl("forward", true);
        event.preventDefault();
      }
      if (key === "s" || key === "arrowdown") {
        setDriveControl("brake", true);
        event.preventDefault();
      }
      if (key === " ") {
        setDriveControl("nitro", true);
        event.preventDefault();
      }
      if (key === "f") {
        toggleHeadlights();
        event.preventDefault();
      }
      if (profile.transmission === "manual" && (key === "1" || key === "2" || key === "3")) {
        setGear(Number(key));
        event.preventDefault();
      }
    }
    function up(event) {
      const key = event.key.toLowerCase();
      if (key === "w" || key === "arrowup") setDriveControl("forward", false);
      if (key === "s" || key === "arrowdown") setDriveControl("brake", false);
      if (key === " ") setDriveControl("nitro", false);
    }
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [screen, profile.transmission]);

  function begin() {
    const playerName = nameDraft.trim() || "Driver";
    setProfile((current) => ({ ...current, playerName }));
    setScreen("menu");
  }

  function startRun(mapId = profile.selectedMap) {
    keysRef.current.forward = false;
    keysRef.current.brake = false;
    keysRef.current.nitro = false;
    keysRef.current.gear = 1;
    setProfile((current) => ({ ...current, selectedMap: mapId }));
    setResult(null);
    setRunHud({ fuel: 100, coins: 0, distance: 0, speed: 0, nitro: 0, gear: 1, inTunnel: false });
    setScreen("game");
  }

  function buyOrSelect(carId) {
    const car = carById(carId);
    if (profile.ownedCars.includes(carId)) {
      setProfile((current) => ({ ...current, selectedCar: carId }));
      setToast(`${car.name} selected`);
      return;
    }
    if (profile.coins < car.price) {
      setToast(`Need ${car.price - profile.coins} more coins`);
      return;
    }
    setProfile((current) => ({
      ...current,
      coins: current.coins - car.price,
      selectedCar: carId,
      ownedCars: [...current.ownedCars, carId],
      upgrades: { ...current.upgrades, [carId]: defaultUpgrades() },
    }));
    setToast(`${car.name} unlocked`);
  }

  function upgrade(statId) {
    const currentUpgrades = profile.upgrades[profile.selectedCar] || defaultUpgrades();
    const level = currentUpgrades[statId] || 0;
    const cost = upgradeCost(level);
    if (level >= MAX_UPGRADE) {
      setToast("Upgrade is maxed");
      return;
    }
    if (profile.coins < cost) {
      setToast(`Need ${cost - profile.coins} more coins`);
      return;
    }
    setProfile((current) => ({
      ...current,
      coins: current.coins - cost,
      upgrades: {
        ...current.upgrades,
        [current.selectedCar]: {
          ...(current.upgrades[current.selectedCar] || defaultUpgrades()),
          [statId]: level + 1,
        },
      },
    }));
  }

  const selectedCar = carById(profile.selectedCar);
  const selectedUpgrades = profile.upgrades[profile.selectedCar] || defaultUpgrades();

  return (
    <main className="app">
      {screen === "name" && (
        <section className="menu-screen name-screen">
          <div className="brand-block">
            <p>Real Drive</p>
            <h1>Endless Highway</h1>
          </div>
          <div className="start-panel">
            <label htmlFor="driver-name">Driver name</label>
            <input
              id="driver-name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Enter your name"
              maxLength={18}
            />
            <button onClick={begin}>START</button>
          </div>
        </section>
      )}

      {screen === "menu" && (
        <section className="menu-screen">
          <header className="menu-header">
            <div>
              <p>{profile.playerName}</p>
              <h1>{selectedCar.name}</h1>
            </div>
            <div className="wallet">
              <span>{profile.coins} coins</span>
              <span>Best {profile.bestDistance} m</span>
            </div>
          </header>
          <nav className="main-actions">
            <button onClick={() => setScreen("maps")}>START</button>
            <button onClick={() => setScreen("controls")}>CONTROLS</button>
            <button onClick={() => setScreen("garage")}>GARAGE</button>
          </nav>
          <div className="car-stage">
            <div className="garage-floor" />
            <div className="show-car" style={{ "--body": `#${selectedCar.body.toString(16).padStart(6, "0")}` }}>
              <span className="car-shadow" />
              <span className="car-body" />
              <span className="car-roof" />
              <span className="car-window front" />
              <span className="car-window rear" />
              <span className="car-light head-left" />
              <span className="car-light head-right" />
              <span className="car-light tail-left" />
              <span className="car-light tail-right" />
              <span className="car-wheel front" />
              <span className="car-wheel rear" />
            </div>
          </div>
        </section>
      )}

      {screen === "maps" && (
        <section className="menu-screen">
          <header className="menu-header">
            <div>
              <p>Choose route</p>
              <h1>Season maps</h1>
            </div>
            <button className="plain-button" onClick={() => setScreen("menu")}>Back</button>
          </header>
          <div className="map-list">
            {Object.entries(MAPS).map(([id, map]) => (
              <button
                key={id}
                className={`map-tile ${profile.selectedMap === id ? "active" : ""}`}
                onClick={() => setProfile((current) => ({ ...current, selectedMap: id }))}
              >
                <span>{map.name}</span>
                <div className={`route-preview ${id}`} />
              </button>
            ))}
          </div>
          <button className="wide-start" onClick={() => startRun(profile.selectedMap)}>START RUN</button>
        </section>
      )}

      {screen === "controls" && (
        <section className="menu-screen">
          <header className="menu-header">
            <div>
              <p>Controls</p>
              <h1>Keyboard</h1>
            </div>
            <button className="plain-button" onClick={() => setScreen("menu")}>Back</button>
          </header>
          <div className="transmission-picker">
            <button
              className={profile.transmission === "automatic" ? "active" : ""}
              onClick={() => setProfile((current) => ({ ...current, transmission: "automatic" }))}
            >
              <strong>Automatic</strong>
              <span>No gear buttons. The car shifts itself.</span>
            </button>
            <button
              className={profile.transmission === "manual" ? "active" : ""}
              onClick={() => setProfile((current) => ({ ...current, transmission: "manual" }))}
            >
              <strong>Manual</strong>
              <span>Use 1, 2, and 3 to change speed gears.</span>
            </button>
          </div>
          <div className="keyboard-panel">
            <div className="control-key">
              <strong>W</strong>
              <span>Forward / boost</span>
            </div>
            <div className="control-key">
              <strong>Up Arrow</strong>
              <span>Forward / boost</span>
            </div>
            <div className="control-key">
              <strong>A</strong>
              <span>Move left</span>
            </div>
            <div className="control-key">
              <strong>Left Arrow</strong>
              <span>Move left</span>
            </div>
            <div className="control-key">
              <strong>D</strong>
              <span>Move right</span>
            </div>
            <div className="control-key">
              <strong>Right Arrow</strong>
              <span>Move right</span>
            </div>
            <div className="control-key">
              <strong>S</strong>
              <span>Brake / slow down</span>
            </div>
            <div className="control-key">
              <strong>Down Arrow</strong>
              <span>Brake / slow down</span>
            </div>
            <div className="control-key">
              <strong>Space Bar</strong>
              <span>Use nitro boost</span>
            </div>
            <div className="control-key">
              <strong>F</strong>
              <span>Toggle headlights</span>
            </div>
            {profile.transmission === "manual" ? (
              <>
                <div className="control-key">
                  <strong>1</strong>
                  <span>Gear 1 / low speed</span>
                </div>
                <div className="control-key">
                  <strong>2</strong>
                  <span>Gear 2 / medium speed</span>
                </div>
                <div className="control-key">
                  <strong>3</strong>
                  <span>Gear 3 / high speed</span>
                </div>
              </>
            ) : null}
          </div>
        </section>
      )}

      {screen === "garage" && (
        <section className="menu-screen garage-screen">
          <header className="menu-header">
            <div>
              <p>Workshop</p>
              <h1>Garage</h1>
            </div>
            <button className="plain-button" onClick={() => setScreen("menu")}>Back</button>
          </header>
          <div className="garage-wall">
            <div className="tool-board" />
            <div className="tire-stack" />
            <div className="workbench" />
          </div>
          <div className="car-grid">
            {CARS.map((car) => {
              const owned = profile.ownedCars.includes(car.id);
              return (
                <article key={car.id} className={`garage-card ${profile.selectedCar === car.id ? "selected" : ""}`}>
                  <div className="mini-car" style={{ "--body": `#${car.body.toString(16).padStart(6, "0")}` }}>
                    <span className="car-shadow" />
                    <span className="car-body" />
                    <span className="car-roof" />
                    <span className="car-window front" />
                    <span className="car-window rear" />
                    <span className="car-light head-left" />
                    <span className="car-light head-right" />
                    <span className="car-light tail-left" />
                    <span className="car-light tail-right" />
                    <span className="car-wheel front" />
                    <span className="car-wheel rear" />
                  </div>
                  <h2>{car.name}</h2>
                  <p>{owned ? "Owned" : `${car.price} coins`}</p>
                  <button onClick={() => buyOrSelect(car.id)}>{owned ? "SELECT" : "BUY"}</button>
                </article>
              );
            })}
          </div>
          <div className="upgrade-table">
            {UPGRADES.map((item) => {
              const level = selectedUpgrades[item.id] || 0;
              return (
                <button key={item.id} onClick={() => upgrade(item.id)}>
                  <span>{item.label}</span>
                  <strong>{level}/{MAX_UPGRADE}</strong>
                  <em>{level >= MAX_UPGRADE ? "Max" : `${upgradeCost(level)} coins`}</em>
                </button>
              );
            })}
          </div>
          {toast ? <p className="toast">{toast}</p> : null}
        </section>
      )}

      {screen === "game" && (
        <section
          className="game-screen"
          onTouchStart={startMobileSwipe}
          onTouchEnd={finishMobileSwipe}
        >
          <div ref={mountRef} className="three-mount" />
          {profile.selectedMap === "rain" && !runHud.inTunnel ? <div className="weather-overlay rain-overlay" /> : null}
          {profile.selectedMap === "winter" && !runHud.inTunnel ? <div className="weather-overlay snow-overlay" /> : null}
          <div className="hud">
            <div>
              <span>Fuel</span>
              <strong>{runHud.fuel}%</strong>
            </div>
            <div className={`coin-hud ${penaltyNotice ? "penalty-hit" : ""}`}>
              <span>Coins</span>
              <strong>{runHud.coins}</strong>
              {penaltyNotice ? (
                <em key={penaltyNotice.id}>-{penaltyNotice.lostCoins} coins</em>
              ) : null}
            </div>
            <div>
              <span>Distance</span>
              <strong>{runHud.distance} m</strong>
            </div>
            <div className="nitro-hud" style={{ "--nitro-fill": `${runHud.nitro}%` }}>
              <span>Nitro</span>
              <strong>{runHud.nitro}%</strong>
              <i />
            </div>
            {runHud.transmission === "manual" ? (
              <div className="gear-hud">
                <span>Gear</span>
                <strong>{runHud.gear}</strong>
              </div>
            ) : null}
            <div className="speedometer" style={{ "--speed-angle": `${clamp(runHud.speed, 0, 180) * 1.35 - 122}deg` }}>
              <span>Speed</span>
              <strong>{runHud.speed}</strong>
              <em>km/h</em>
              <i />
            </div>
          </div>
          {penaltyNotice ? (
            <div className="rule-warning" key={penaltyNotice.id}>
              <strong>RED LIGHT VIOLATION</strong>
              <span>Your coins went back to 0 for breaking the rule</span>
            </div>
          ) : null}
          <div className="mobile-controls" aria-label="Mobile driving controls">
            <div className="mobile-swipe-tip">
              <strong>Swipe</strong>
              <span>left / right to change lanes</span>
            </div>
            <div className="mobile-actions">
              <button
                aria-label="Accelerate"
                onPointerDown={(event) => {
                  event.preventDefault();
                  setDriveControl("forward", true);
                }}
                onPointerUp={() => setDriveControl("forward", false)}
                onPointerCancel={() => setDriveControl("forward", false)}
                onPointerLeave={() => setDriveControl("forward", false)}
              >
                GAS
              </button>
              <button
                aria-label="Brake"
                onPointerDown={(event) => {
                  event.preventDefault();
                  setDriveControl("brake", true);
                }}
                onPointerUp={() => setDriveControl("brake", false)}
                onPointerCancel={() => setDriveControl("brake", false)}
                onPointerLeave={() => setDriveControl("brake", false)}
              >
                BRAKE
              </button>
              <button
                aria-label="Nitro"
                onPointerDown={(event) => {
                  event.preventDefault();
                  setDriveControl("nitro", true);
                }}
                onPointerUp={() => setDriveControl("nitro", false)}
                onPointerCancel={() => setDriveControl("nitro", false)}
                onPointerLeave={() => setDriveControl("nitro", false)}
              >
                NITRO
              </button>
              <button
                aria-label="Toggle headlights"
                onPointerDown={(event) => {
                  event.preventDefault();
                  toggleHeadlights();
                }}
              >
                LIGHT
              </button>
              {profile.transmission === "manual" ? (
                <div className="mobile-gears">
                  {[1, 2, 3].map((gear) => (
                    <button
                      key={gear}
                      className={runHud.gear === gear ? "active" : ""}
                      aria-label={`Gear ${gear}`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        setGear(gear);
                      }}
                    >
                      {gear}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <button className="pause-button" onClick={() => setScreen("menu")}>MENU</button>
        </section>
      )}

      {screen === "gameover" && (
        <section className="menu-screen name-screen">
          <div className="brand-block">
            <p>Run finished</p>
            <h1>{result?.reason || "Run over"}</h1>
          </div>
          <div className="start-panel">
            <p>Distance: {result?.distance || 0} m</p>
            <p>Coins earned: {result?.coins || 0}</p>
            <button onClick={() => startRun(profile.selectedMap)}>PLAY AGAIN</button>
            <button onClick={() => setScreen("garage")}>GARAGE</button>
            <button onClick={() => setScreen("menu")}>MENU</button>
          </div>
        </section>
      )}
    </main>
  );
}
