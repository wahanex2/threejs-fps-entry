// The arsenal: one table of numbers every shooter in the game shares, the player's
// view models, and grenade physics. Spread grows with movement and with every shot
// in a burst, and shrinks when still and aiming: stopping to aim pays. Damage falls
// off past 20 m. Bots read the same table through weaponStats().
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', kind: 'pistol', price: 0, damage: 26, headMult: 3,
    mag: 12, reserve: 48, gap: 0.16, reload: 1.4, auto: false, pellets: 1,
    spreadStill: 0.004, spreadMove: 0.02, bloom: 0.006, recoil: 0.011, range: 26,
  },
  smg: {
    id: 'smg', name: 'SMG-9', kind: 'smg', price: 1500, damage: 22, headMult: 2.2,
    mag: 30, reserve: 120, gap: 0.075, reload: 1.8, auto: true, pellets: 1,
    spreadStill: 0.008, spreadMove: 0.034, bloom: 0.007, recoil: 0.008, range: 22,
  },
  shotgun: {
    id: 'shotgun', name: 'M870 Breacher', kind: 'shotgun', price: 1900, damage: 14, headMult: 1.5,
    mag: 6, reserve: 24, gap: 0.85, reload: 2.6, auto: false, pellets: 7,
    spreadStill: 0.045, spreadMove: 0.05, bloom: 0.01, recoil: 0.035, range: 13,
  },
  carbine: {
    id: 'carbine', name: 'KR-7 Carbine', kind: 'rifle', price: 2700, damage: 30, headMult: 2.5,
    mag: 30, reserve: 90, gap: 0.1, reload: 2.0, auto: true, pellets: 1,
    spreadStill: 0.0035, spreadMove: 0.028, bloom: 0.005, recoil: 0.01, range: 34,
  },
  rifle: {
    id: 'rifle', name: 'VK-12 Rifle', kind: 'rifle', price: 3100, damage: 34, headMult: 2.5,
    mag: 30, reserve: 90, gap: 0.092, reload: 2.2, auto: true, pellets: 1,
    spreadStill: 0.0028, spreadMove: 0.026, bloom: 0.0045, recoil: 0.011, range: 38,
  },
  marksman: {
    id: 'marksman', name: 'LR-90 Marksman', kind: 'marksman', price: 4200, damage: 78, headMult: 3,
    mag: 5, reserve: 15, gap: 0.95, reload: 3.0, auto: false, pellets: 1,
    spreadStill: 0.0006, spreadMove: 0.05, bloom: 0.02, recoil: 0.03, range: 60,
  },
};

export const WEAPON_ORDER = ['p9', 'smg', 'shotgun', 'carbine', 'rifle', 'marksman'];
export const ARMOR_PRICE = 650;
export const FRAG_PRICE = 300;
export const SMOKE_PRICE = 300;

export function weaponStats(id) {
  return WEAPONS[id];
}

// Damage at range: full damage inside the weapon's range, then a linear falloff
// to 55% at twice the range. Headshots multiply after falloff.
export function damageAt(def, distance, head) {
  const falloff = distance <= def.range ? 1 : Math.max(0.55, 1 - (distance - def.range) / def.range * 0.45);
  const base = def.damage * falloff;
  return Math.round(head ? base * def.headMult : base);
}

function boxMesh(w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function createPlayerWeapons(camera, rng) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22262d'), roughness: 0.6, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });

  // One view model per weapon, all parented to the camera; only the held one shows.
  const models = {};
  function buildModel(id) {
    const model = new THREE.Group();
    if (id === 'p9') {
      model.add(boxMesh(0.05, 0.07, 0.22, 0, 0, -0.05, dark));
      model.add(boxMesh(0.045, 0.12, 0.06, 0, -0.08, 0.03, grip));
    } else if (id === 'smg') {
      model.add(boxMesh(0.07, 0.08, 0.3, 0, 0, -0.05, dark));
      model.add(boxMesh(0.04, 0.04, 0.22, 0, 0.02, -0.28, body));
      model.add(boxMesh(0.05, 0.14, 0.06, 0, -0.09, 0, grip));
      model.add(boxMesh(0.05, 0.05, 0.14, 0, -0.01, 0.18, grip));
    } else if (id === 'shotgun') {
      model.add(boxMesh(0.08, 0.09, 0.5, 0, 0, -0.1, grip));
      model.add(boxMesh(0.05, 0.05, 0.52, 0, 0.04, -0.12, dark));
      model.add(boxMesh(0.07, 0.07, 0.2, 0, -0.02, 0.28, grip));
    } else if (id === 'marksman') {
      model.add(boxMesh(0.08, 0.09, 0.55, 0, 0, -0.12, dark));
      model.add(boxMesh(0.035, 0.035, 0.5, 0, 0.03, -0.4, body));
      model.add(boxMesh(0.05, 0.06, 0.16, 0, 0.08, -0.1, accent));
      model.add(boxMesh(0.06, 0.1, 0.06, 0, -0.08, 0.05, grip));
      model.add(boxMesh(0.06, 0.07, 0.24, 0, -0.01, 0.3, grip));
    } else {
      // carbine / rifle: receiver, barrel, magazine, stock, sight.
      model.add(boxMesh(0.09, 0.1, 0.42, 0, 0, -0.05, id === 'rifle' ? dark : body));
      model.add(boxMesh(0.045, 0.045, 0.4, 0, 0.025, -0.42, grip));
      model.add(boxMesh(0.06, 0.14, 0.08, 0, -0.1, -0.02, grip));
      model.add(boxMesh(0.075, 0.08, 0.22, 0, -0.02, 0.28, grip));
      model.add(boxMesh(0.03, 0.05, 0.1, 0, 0.075, -0.08, accent));
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }
  for (const id of WEAPON_ORDER) models[id] = buildModel(id);

  // Muzzle flash: a canvas-drawn star with a hot core, additively blended so it
  // reads as a flash of light rather than a solid quad.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  {
    const ctx = flashCanvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255, 244, 200, 1)');
    g.addColorStop(0.35, 'rgba(255, 190, 90, 0.9)');
    g.addColorStop(1, 'rgba(255, 140, 40, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(32, 0);
    ctx.quadraticCurveTo(36, 26, 62, 32);
    ctx.quadraticCurveTo(36, 38, 32, 64);
    ctx.quadraticCurveTo(28, 38, 2, 32);
    ctx.quadraticCurveTo(28, 26, 32, 0);
    ctx.fill();
  }
  const flashTexture = new THREE.CanvasTexture(flashCanvas);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: flashTexture, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'p9',
    mag: WEAPONS.p9.mag,
    reserve: WEAPONS.p9.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    ads: 0,
    owned: { p9: true },
    ammo: { p9: { mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve } },
    frags: 0,
    smokes: 0,
  };
  models.p9.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt, aiming) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.045);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.ads += ((aiming ? 1 : 0) - state.ads) * Math.min(1, dt * 12);
    const model = models[state.current];
    const hipX = 0.24;
    const hipY = -0.2;
    model.position.x = hipX + (0 - hipX) * state.ads;
    model.position.y = hipY + (-0.148 - hipY) * state.ads;
    model.position.z = -0.42 + state.kick + state.ads * 0.08;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
        state.ammo[state.current] = { mag: state.mag, reserve: state.reserve };
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.gap;
      state.flash = 0.06;
      flash.rotation.z = rng.random() * Math.PI;
      state.kick = 0.055;
      state.bloom = Math.min(0.06, state.bloom + d.bloom);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      state.ammo[state.current].mag = state.mag;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return false;
      state.reloadLeft = d.reload;
      return true;
    },
    spread(speed, aiming) {
      const d = def();
      const moving = Math.min(1, speed / 5.2);
      let spread = d.spreadStill + moving * d.spreadMove + state.bloom;
      if (aiming) spread *= 0.45;
      return spread;
    },
    recoil() {
      const d = def();
      return { pitch: d.recoil * (0.8 + rng.random() * 0.4), yaw: (rng.random() * 2 - 1) * d.recoil * 0.5 };
    },
    switchTo(id) {
      if (!state.owned[id] || id === state.current) return false;
      state.ammo[state.current] = { mag: state.mag, reserve: state.reserve };
      models[state.current].visible = false;
      state.current = id;
      const saved = state.ammo[id];
      state.mag = saved.mag;
      state.reserve = saved.reserve;
      models[id].visible = true;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      return true;
    },
    give(id) {
      const d = WEAPONS[id];
      state.owned[id] = true;
      state.ammo[id] = { mag: d.mag, reserve: d.reserve };
      if (id !== 'p9') this.switchTo(id);
    },
    resetRound() {
      state.owned = { p9: true };
      state.ammo = { p9: { mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve } };
      state.frags = 0;
      state.smokes = 0;
      if (state.current !== 'p9') {
        models[state.current].visible = false;
        state.current = 'p9';
        models.p9.visible = true;
      }
      state.mag = state.ammo.p9.mag;
      state.reserve = state.ammo.p9.reserve;
      state.reloadLeft = 0;
      state.cooldown = 0;
      state.bloom = 0;
    },
    muzzleWorld(out) {
      out.set(0.24, -0.18, -0.95);
      return camera.localToWorld(out);
    },
  };
}

// Grenades: a small pool of projectiles with gravity and damped bounces off the
// world's colliders. A frag explodes on its fuse; a smoke pops into a cloud that
// blocks line of sight. The caller supplies onExplode/onSmoke for damage and FX.
export function createGrenades(scene, colliders, rng) {
  const fragMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c3a2a'), roughness: 0.6, metalness: 0.4 });
  const smokeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8b95a3'), roughness: 0.7, metalness: 0.2 });
  const sphere = new THREE.SphereGeometry(0.09, 10, 8);
  const probe = new THREE.Box3();

  const smokeTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(220,224,228,0.85)');
    gradient.addColorStop(0.6, 'rgba(200,205,212,0.5)');
    gradient.addColorStop(1, 'rgba(200,205,212,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();

  const grenades = [];
  const clouds = [];

  function pointBlocked(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  return {
    clouds,
    throw(kind, origin, direction, power, owner) {
      const mesh = new THREE.Mesh(sphere, kind === 'frag' ? fragMaterial : smokeMaterial);
      mesh.position.copy(origin);
      scene.add(mesh);
      grenades.push({
        kind,
        mesh,
        velocity: direction.clone().multiplyScalar(power).add(new THREE.Vector3(0, 2.2, 0)),
        fuse: kind === 'frag' ? 2.2 : 1.4,
        owner,
        bounced: false,
      });
    },
    step(dt, onExplode, onSmoke, onBounce) {
      for (let i = grenades.length - 1; i >= 0; i -= 1) {
        const g = grenades[i];
        g.fuse -= dt;
        g.velocity.y -= 16 * dt;
        const pos = g.mesh.position;
        const nx = pos.x + g.velocity.x * dt;
        const ny = pos.y + g.velocity.y * dt;
        const nz = pos.z + g.velocity.z * dt;
        if (pointBlocked(nx, pos.y, pos.z)) {
          g.velocity.x *= -0.45;
          if (onBounce) onBounce(pos.x, pos.y, pos.z);
        } else pos.x = nx;
        if (pointBlocked(pos.x, ny, pos.z)) {
          if (g.velocity.y < 0) {
            g.velocity.y *= -0.42;
            g.velocity.x *= 0.7;
            g.velocity.z *= 0.7;
            if (Math.abs(g.velocity.y) < 1.2) g.velocity.y = 0;
            if (onBounce) onBounce(pos.x, pos.y, pos.z);
          } else {
            g.velocity.y *= -0.45;
          }
        } else pos.y = ny;
        if (pointBlocked(pos.x, pos.y, nz)) {
          g.velocity.z *= -0.45;
          if (onBounce) onBounce(pos.x, pos.y, pos.z);
        } else pos.z = nz;
        if (pos.y < 0.09) {
          pos.y = 0.09;
          g.velocity.y = Math.abs(g.velocity.y) < 1.2 ? 0 : -g.velocity.y * 0.42;
          g.velocity.x *= 0.75;
          g.velocity.z *= 0.75;
        }
        if (g.fuse <= 0) {
          scene.remove(g.mesh);
          grenades.splice(i, 1);
          if (g.kind === 'frag') onExplode(pos, g.owner);
          else {
            const group = new THREE.Group();
            for (let p = 0; p < 9; p += 1) {
              const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture, transparent: true, opacity: 0.75, depthWrite: false }));
              sprite.position.set((rng.random() - 0.5) * 5, 0.8 + rng.random() * 2.2, (rng.random() - 0.5) * 5);
              sprite.scale.setScalar(3.5 + rng.random() * 2.5);
              sprite.userData.spin = (rng.random() - 0.5) * 0.4;
              group.add(sprite);
            }
            group.position.copy(pos);
            scene.add(group);
            clouds.push({ group, center: pos.clone(), radius: 4.2, left: 15 });
            onSmoke(pos);
          }
        }
      }
      for (let i = clouds.length - 1; i >= 0; i -= 1) {
        const cloud = clouds[i];
        cloud.left -= dt;
        for (const sprite of cloud.group.children) {
          sprite.material.rotation += sprite.userData.spin * dt;
          sprite.material.opacity = Math.min(0.75, cloud.left * 0.2);
        }
        if (cloud.left <= 0) {
          scene.remove(cloud.group);
          clouds.splice(i, 1);
        }
      }
    },
    reset() {
      for (const g of grenades) scene.remove(g.mesh);
      grenades.length = 0;
      for (const cloud of clouds) scene.remove(cloud.group);
      clouds.length = 0;
    },
  };
}
