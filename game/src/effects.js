// Pooled visuals: tracers, impact sparks, blood puffs and explosion flashes. Every
// pool is allocated once; the hot loop only writes into preallocated buffers, so
// a firefight creates no garbage. Tracers are short-lived additive lines, particles
// are one THREE.Points cloud with per-particle velocity and life in typed arrays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_PARTICLES = 420;
const MAX_TRACERS = 24;
const MAX_FLASHES = 10;

export function createEffects(scene) {
  // Particles: one Points cloud, positions/velocities/life in flat arrays.
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const velocities = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const sizes = new Float32Array(MAX_PARTICLES);
  let cursor = 0;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  for (let i = 0; i < MAX_PARTICLES; i += 1) positions[i * 3 + 1] = -50;

  const tracerPool = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const tracerGeometry = new THREE.BufferGeometry();
    tracerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(tracerGeometry, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracerPool.push({ line, left: 0 });
  }
  let tracerCursor = 0;

  const flashTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    gradient.addColorStop(0, 'rgba(255,230,160,1)');
    gradient.addColorStop(0.5, 'rgba(242,169,59,0.7)');
    gradient.addColorStop(1, 'rgba(242,169,59,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();

  const flashPool = [];
  for (let i = 0; i < MAX_FLASHES; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture, transparent: true, opacity: 0, depthWrite: false }));
    sprite.visible = false;
    scene.add(sprite);
    flashPool.push({ sprite, left: 0 });
  }
  let flashCursor = 0;

  const blastLight = new THREE.PointLight(new THREE.Color('#ff9a3c'), 0, 26, 2);
  scene.add(blastLight);
  let blastLeft = 0;
  const blastSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb469'), transparent: true, opacity: 0, depthWrite: false }),
  );
  blastSphere.visible = false;
  scene.add(blastSphere);
  let blastRadius = 0;

  const tmpColor = new THREE.Color();

  function spawnParticle(x, y, z, vx, vy, vz, colorHex, seconds) {
    const i = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    velocities[i * 3] = vx;
    velocities[i * 3 + 1] = vy;
    velocities[i * 3 + 2] = vz;
    tmpColor.set(colorHex);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
    life[i] = seconds;
    maxLife[i] = seconds;
    sizes[i] = 1;
  }

  return {
    burst(point, colorHex, count, speed, seconds, rng) {
      for (let i = 0; i < count; i += 1) {
        const theta = rng.random() * Math.PI * 2;
        const up = rng.random() * 0.9 + 0.2;
        const s = speed * (0.4 + rng.random() * 0.8);
        spawnParticle(
          point.x, point.y, point.z,
          Math.cos(theta) * s, up * s, Math.sin(theta) * s,
          colorHex, seconds * (0.6 + rng.random() * 0.6),
        );
      }
    },
    tracer(from, to) {
      const slot = tracerPool[tracerCursor];
      tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
      const attr = slot.line.geometry.getAttribute('position');
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, to.x, to.y, to.z);
      attr.needsUpdate = true;
      slot.line.visible = true;
      slot.line.material.opacity = 0.85;
      slot.left = 0.07;
    },
    muzzle(point) {
      const slot = flashPool[flashCursor];
      flashCursor = (flashCursor + 1) % MAX_FLASHES;
      slot.sprite.position.copy(point);
      slot.sprite.scale.setScalar(0.55);
      slot.sprite.material.opacity = 0.95;
      slot.sprite.visible = true;
      slot.left = 0.05;
    },
    explosion(point) {
      blastLight.position.copy(point);
      blastLight.position.y += 0.5;
      blastLight.intensity = 220;
      blastLeft = 0.35;
      blastSphere.position.copy(point);
      blastSphere.visible = true;
      blastSphere.material.opacity = 0.55;
      blastRadius = 0.5;
    },
    step(dt) {
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          positions[i * 3 + 1] = -50;
          continue;
        }
        velocities[i * 3 + 1] -= 9 * dt;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        if (positions[i * 3 + 1] < 0.02) {
          positions[i * 3 + 1] = 0.02;
          velocities[i * 3 + 1] = 0;
        }
      }
      geometry.getAttribute('position').needsUpdate = true;
      geometry.getAttribute('color').needsUpdate = true;
      for (const slot of tracerPool) {
        if (slot.left <= 0) continue;
        slot.left -= dt;
        slot.line.material.opacity = Math.max(0, slot.left / 0.07) * 0.85;
        if (slot.left <= 0) slot.line.visible = false;
      }
      for (const slot of flashPool) {
        if (slot.left <= 0) continue;
        slot.left -= dt;
        slot.sprite.material.opacity = Math.max(0, slot.left / 0.05) * 0.95;
        if (slot.left <= 0) slot.sprite.visible = false;
      }
      if (blastLeft > 0) {
        blastLeft -= dt;
        blastLight.intensity = Math.max(0, blastLeft / 0.35) * 220;
        blastRadius += dt * 26;
        blastSphere.scale.setScalar(blastRadius);
        blastSphere.material.opacity = Math.max(0, blastLeft / 0.35) * 0.55;
        if (blastLeft <= 0) {
          blastLight.intensity = 0;
          blastSphere.visible = false;
        }
      }
    },
  };
}
