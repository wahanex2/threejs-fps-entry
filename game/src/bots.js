// Bot teammates and enemies: box-built soldiers with a waypoint brain. Each bot
// follows a route through the map's graph, holds positions, sees enemies through
// line-of-sight checks with a reaction delay, hears gunfire, bursts its weapon
// with skill-based aim error, retreats when hurt and outnumbered, and plays the
// objective: the carrier plants, defenders rotate and defuse.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { TEAMS } from './state.js';
import { findPath, nearestNode } from './world.js';
import { WEAPONS, damageAt } from './weapons.js';

const NAMES = {
  vanguard: ['Rook', 'Havoc', 'Juno', 'Pike'],
  sentinel: ['Bastion', 'Warden', 'Kestrel', 'Onyx'],
};
const EYE_HEIGHT = 1.5;
const BODY_RADIUS = 0.36;

export function createBots(scene, world, rng) {
  const suitV = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b5a33'), roughness: 0.85 });
  const suitS = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e4a52'), roughness: 0.85 });
  const vestV = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.vanguard), roughness: 0.6, metalness: 0.15 });
  const vestS = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sentinel), roughness: 0.6, metalness: 0.15 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22262d'), roughness: 0.7, metalness: 0.2 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.8 });

  const bots = [];
  const hitMeshes = [];

  function buildBody(bot) {
    const group = new THREE.Group();
    const suit = bot.team === TEAMS.VANGUARD ? suitV : suitS;
    const vest = bot.team === TEAMS.VANGUARD ? vestV : vestS;
    const legGeo = new THREE.BoxGeometry(0.17, 0.75, 0.17);
    const legL = new THREE.Group();
    legL.position.set(-0.11, 0.75, 0);
    const legLMesh = new THREE.Mesh(legGeo, suit);
    legLMesh.position.y = -0.375;
    legL.add(legLMesh);
    const legR = new THREE.Group();
    legR.position.set(0.11, 0.75, 0);
    const legRMesh = new THREE.Mesh(legGeo, suit);
    legRMesh.position.y = -0.375;
    legR.add(legRMesh);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.3), suit);
    torso.position.y = 1.1;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.08), vest);
    plate.position.set(0, 1.12, -0.17);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), skinMat);
    head.position.y = 1.6;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.32), vest);
    helmet.position.y = 1.74;
    const armGeo = new THREE.BoxGeometry(0.13, 0.6, 0.13);
    const armL = new THREE.Mesh(armGeo, suit);
    armL.position.set(-0.34, 1.12, -0.1);
    armL.rotation.x = -0.9;
    const armR = new THREE.Mesh(armGeo, suit);
    armR.position.set(0.34, 1.12, -0.1);
    armR.rotation.x = -0.9;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.55), darkMat);
    gun.position.set(0.18, 1.32, -0.42);
    group.add(legL, legR, torso, plate, head, helmet, armL, armR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    helmet.userData.bot = bot;
    helmet.userData.part = 'head';
    hitMeshes.push(torso, head, helmet);
    scene.add(group);
    return { group, legL, legR, torso, head, gun };
  }

  let nextId = 0;
  for (const team of [TEAMS.VANGUARD, TEAMS.SENTINEL]) {
    for (let i = 0; i < 4; i += 1) {
      const bot = {
        id: nextId,
        name: NAMES[team][i],
        team,
        health: 100,
        armor: 0,
        alive: true,
        weapon: 'p9',
        money: 800,
        skill: 0.45 + rng.random() * 0.4,
        yaw: 0,
        speed: 4.3,
        route: [],
        routeIndex: 0,
        holdNode: null,
        watchYaw: 0,
        role: 'entry',
        site: 'A',
        hasCharge: false,
        target: null,
        targetIsPlayer: false,
        targetAcquiredAt: 0,
        lastKnown: new THREE.Vector3(),
        lastKnownAt: -99,
        investigate: null,
        investigateAt: -99,
        burstLeft: 0,
        burstPause: 0,
        fireCooldown: 0,
        aimSteady: 0,
        crouching: false,
        walkPhase: rng.random() * 6,
        fall: 0,
        wantChannel: null,
        perceiveAt: rng.random() * 0.1,
        heardAt: -99,
        retreating: false,
        damageDealt: 0,
      };
      nextId += 1;
      bot.body = buildBody(bot);
      bot.hitMeshes = [bot.body.torso, bot.body.head];
      bots.push(bot);
    }
  }

  const tmpEye = new THREE.Vector3();
  const tmpChest = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const probe = new THREE.Box3();

  function eyeOf(bot, out) {
    return out.set(bot.body.group.position.x, bot.body.group.position.y + EYE_HEIGHT, bot.body.group.position.z);
  }

  function chestOf(bot, out) {
    return out.set(bot.body.group.position.x, bot.body.group.position.y + 1.15, bot.body.group.position.z);
  }

  function blocked(x, y, z) {
    probe.min.set(x - BODY_RADIUS, y + 0.05, z - BODY_RADIUS);
    probe.max.set(x + BODY_RADIUS, y + 1.7, z + BODY_RADIUS);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function setRoute(bot, goalNode) {
    const pos = bot.body.group.position;
    const start = nearestNode(world.nodes, pos.x, pos.z);
    bot.route = findPath(world.graph, start, goalNode);
    bot.routeIndex = 0;
    if (bot.route.length > 0 && bot.route[0] === start) bot.routeIndex = 1;
  }

  function assignRound(playerTeam, roundNumber, attackSite) {
    // Vanguard always attacks, Sentinel always defends; the player's team decides
    // which side the player fights on, not the bots'.
    const vanguard = bots.filter((b) => b.team === TEAMS.VANGUARD);
    const sentinel = bots.filter((b) => b.team === TEAMS.SENTINEL);
    void playerTeam;
    void roundNumber;
    const siteNodes = attackSite === 'A' ? { main: 'W6', alt: 'C0', lurk: 'E6' } : { main: 'E6', alt: 'C1', lurk: 'W6' };
    const roles = ['carrier', 'entry', 'support', 'lurk'];
    vanguard.forEach((bot, i) => {
      bot.role = roles[i];
      bot.site = attackSite;
      bot.hasCharge = i === 0;
      if (bot.role === 'carrier') setRoute(bot, siteNodes.main);
      else if (bot.role === 'entry') setRoute(bot, siteNodes.main);
      else if (bot.role === 'support') setRoute(bot, siteNodes.alt);
      else setRoute(bot, siteNodes.lurk);
      bot.holdNode = null;
    });
    const holds = attackSite === 'A'
      ? ['W6', 'D3', 'M5', 'E6']
      : ['E6', 'D4', 'M5', 'W6'];
    sentinel.forEach((bot, i) => {
      bot.role = 'anchor';
      bot.site = attackSite;
      bot.hasCharge = false;
      bot.holdNode = holds[i];
      setRoute(bot, holds[i]);
    });
  }

  function buyBot(bot) {
    const money = bot.money;
    let pick = 'p9';
    if (money >= 4200 && bot.skill > 0.6) pick = 'marksman';
    else if (money >= 3100) pick = 'rifle';
    else if (money >= 2700) pick = 'carbine';
    else if (money >= 1900) pick = 'shotgun';
    else if (money >= 1500) pick = 'smg';
    bot.money -= WEAPONS[pick].price;
    bot.weapon = pick;
    if (bot.money >= 650) {
      bot.money -= 650;
      bot.armor = 50;
    } else bot.armor = 0;
    bot.money = Math.max(0, bot.money);
  }

  function damageBot(bot, amount) {
    let remaining = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, Math.ceil(amount / 2));
      bot.armor -= absorbed;
      remaining = amount - absorbed;
    }
    bot.health -= remaining;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.fall = 0;
      return true;
    }
    return false;
  }

  function perceive(bot, ctx, now) {
    // Nearest visible enemy: the player, then enemy bots. Vision is a 150-degree
    // cone out to 45 m, plus anything within 4 m. Smell of smoke blocks sight.
    const eye = eyeOf(bot, tmpEye);
    let best = null;
    let bestDist = Infinity;
    let bestIsPlayer = false;
    const player = ctx.player;
    if (player.alive && player.team !== bot.team) {
      const dx = player.position.x - eye.x;
      const dz = player.position.z - eye.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 45) {
        tmpChest.set(player.position.x, player.position.y + 1.2, player.position.z);
        if (ctx.combat.hasLineOfSight(eye, tmpChest, ctx.clouds)) {
          best = player;
          bestDist = dist;
          bestIsPlayer = true;
        }
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team || other === bot) continue;
      const op = other.body.group.position;
      const dist = Math.hypot(op.x - eye.x, op.z - eye.z);
      if (dist >= bestDist || dist > 45) continue;
      chestOf(other, tmpChest);
      if (ctx.combat.hasLineOfSight(eye, tmpChest, ctx.clouds)) {
        best = other;
        bestDist = dist;
        bestIsPlayer = false;
      }
    }
    if (best) {
      const pos = bestIsPlayer ? best.position : best.body.group.position;
      const facing = Math.atan2(-(pos.x - eye.x), -(pos.z - eye.z));
      let angle = Math.abs(facing - bot.yaw);
      if (angle > Math.PI) angle = Math.PI * 2 - angle;
      if (angle < 1.35 || bestDist < 4) {
        if (bot.target !== best) {
          bot.target = best;
          bot.targetIsPlayer = bestIsPlayer;
          bot.targetAcquiredAt = now + (0.55 - bot.skill * 0.3) + rng.random() * 0.15;
        }
        bot.lastKnown.set(pos.x, pos.y, pos.z);
        bot.lastKnownAt = now;
        return;
      }
    }
    // Lost sight: keep hunting the last known spot for a few seconds.
    if (bot.target && now - bot.lastKnownAt > 3.5) {
      bot.target = null;
    }
  }

  function faceToward(bot, x, z, dt, rate = 7) {
    const target = Math.atan2(-(x - bot.body.group.position.x), -(z - bot.body.group.position.z));
    let diff = target - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
    bot.yaw += step;
  }

  function walkToward(bot, x, z, dt, speed) {
    const pos = bot.body.group.position;
    const dx = x - pos.x;
    const dz = z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const stepLen = Math.min(dist, speed * dt);
    const nx = pos.x + (dx / dist) * stepLen;
    const nz = pos.z + (dz / dist) * stepLen;
    if (!blocked(nx, pos.y, pos.z)) pos.x = nx;
    if (!blocked(pos.x, pos.y, nz)) pos.z = nz;
    // Separation from other bots, so they do not stack.
    for (const other of bots) {
      if (other === bot || !other.alive) continue;
      const op = other.body.group.position;
      const ox = pos.x - op.x;
      const oz = pos.z - op.z;
      const od = Math.hypot(ox, oz);
      if (od > 0.01 && od < 0.7) {
        pos.x += (ox / od) * (0.7 - od) * 0.5;
        pos.z += (oz / od) * (0.7 - od) * 0.5;
      }
    }
    faceToward(bot, x, z, dt, 9);
    bot.walkPhase += speed * dt * 1.9;
    return dist - stepLen < 0.05;
  }

  function fireAt(bot, ctx, now) {
    const def = WEAPONS[bot.weapon];
    if (bot.fireCooldown > 0 || bot.burstPause > 0) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = bot.weapon === 'shotgun' || bot.weapon === 'marksman' ? 1 : 2 + Math.floor(rng.random() * 3);
    }
    const target = bot.target;
    const targetPos = bot.targetIsPlayer ? target.position : target.body.group.position;
    const moving = bot.route.length > 0 && bot.routeIndex < bot.route.length;
    const baseError = (1.15 - bot.skill) * 0.055 * (moving ? 1.7 : 1) * (1 - bot.aimSteady * 0.55);
    const aimHead = rng.random() < 0.3 + bot.skill * 0.25;
    const aimY = targetPos.y + (aimHead ? 1.55 : 1.15);
    eyeOf(bot, tmpEye);
    tmpDir.set(targetPos.x - tmpEye.x, aimY - tmpEye.y, targetPos.z - tmpEye.z).normalize();
    tmpDir.x += (rng.random() * 2 - 1) * baseError;
    tmpDir.y += (rng.random() * 2 - 1) * baseError;
    tmpDir.z += (rng.random() * 2 - 1) * baseError;
    tmpDir.normalize();
    const muzzle = tmpEye.clone();
    muzzle.addScaledVector(tmpDir, 0.6);
    muzzle.y -= 0.12;
    ctx.effects.muzzle(muzzle);
    ctx.audio.shot(def.kind, tmpEye.x, tmpEye.z);
    ctx.onNoise(tmpEye.x, tmpEye.z, bot.team);
    const pellets = def.pellets;
    let anyHit = false;
    for (let p = 0; p < pellets; p += 1) {
      const dir = tmpDir.clone();
      if (pellets > 1) {
        dir.x += (rng.random() * 2 - 1) * 0.045;
        dir.y += (rng.random() * 2 - 1) * 0.045;
        dir.z += (rng.random() * 2 - 1) * 0.045;
        dir.normalize();
      }
      const dist = Math.hypot(targetPos.x - tmpEye.x, targetPos.z - tmpEye.z);
      if (bot.targetIsPlayer) {
        const res = ctx.combat.shootAtPlayer(tmpEye, dir, ctx.player, ctx.clouds);
        if (res.hit) {
          const damage = damageAt(def, res.distance, res.part === 'head');
          ctx.damagePlayer(damage, res.part === 'head', bot);
          anyHit = true;
        }
        const end = tmpEye.clone().addScaledVector(dir, res.hit ? res.distance : Math.min(dist + 8, 40));
        ctx.effects.tracer(muzzle, end);
      } else {
        const res = ctx.combat.shootAtBot(tmpEye, dir, target, 60);
        if (res.hit) {
          const damage = damageAt(def, res.distance, res.part === 'head');
          const died = damageBot(target, damage);
          bot.damageDealt += damage;
          ctx.combat.blood(res.point);
          if (died) ctx.onKill(bot, target, def.name, res.part === 'head');
          anyHit = true;
          ctx.effects.tracer(muzzle, res.point);
        } else {
          const end = tmpEye.clone().addScaledVector(dir, Math.min(dist + 8, 40));
          ctx.effects.tracer(muzzle, end);
        }
      }
    }
    void anyHit;
    bot.burstLeft -= 1;
    bot.fireCooldown = def.gap * (bot.weapon === 'shotgun' ? 1 : 1.15);
    if (bot.burstLeft <= 0) bot.burstPause = 0.35 + rng.random() * 0.45;
  }

  return {
    bots,
    hitMeshes,
    damage: damageBot,
    resetMatch() {
      for (const bot of bots) {
        bot.money = 800;
        bot.damageDealt = 0;
      }
    },
    resetRound(spawns, playerTeam, roundNumber, attackSite, state) {
      for (const bot of bots) {
        const list = spawns[bot.team];
        const index = bots.filter((b) => b.team === bot.team).indexOf(bot);
        const [x, z] = list[Math.min(index + 1, list.length - 1)];
        bot.body.group.position.set(x, 0, z);
        bot.body.group.rotation.set(0, 0, 0);
        bot.body.group.visible = true;
        bot.yaw = bot.team === TEAMS.VANGUARD ? 0 : Math.PI;
        bot.body.group.rotation.y = bot.yaw;
        bot.health = 100;
        bot.alive = true;
        bot.fall = 0;
        bot.target = null;
        bot.route = [];
        bot.routeIndex = 0;
        bot.investigate = null;
        bot.wantChannel = null;
        bot.retreating = false;
        bot.aimSteady = 0;
        buyBot(bot);
      }
      assignRound(playerTeam, roundNumber, attackSite);
      void state;
    },
    awardMoney(team, amount) {
      for (const bot of bots) if (bot.team === team) bot.money = Math.min(16000, bot.money + amount);
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    carrierBot() {
      return bots.find((b) => b.hasCharge && b.alive) ?? null;
    },
    onNoise(x, z, sourceTeam, now) {
      for (const bot of bots) {
        if (!bot.alive || bot.team === sourceTeam || bot.target) continue;
        const pos = bot.body.group.position;
        const dist = Math.hypot(pos.x - x, pos.z - z);
        if (dist < 26) {
          bot.investigate = new THREE.Vector3(x, 0, z);
          bot.investigateAt = now;
          bot.heardAt = now;
        }
      }
    },
    step(dt, ctx) {
      const now = ctx.time;
      for (const bot of bots) {
        if (!bot.alive) {
          if (bot.fall < 1) {
            bot.fall = Math.min(1, bot.fall + dt / 0.4);
            bot.body.group.rotation.x = -bot.fall * 1.45;
            bot.body.group.position.y = -bot.fall * 0.05;
          }
          continue;
        }
        // Outside a live round the bots hold still at their spawns.
        if (!ctx.active) continue;
        bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
        bot.burstPause = Math.max(0, bot.burstPause - dt);
        const pos = bot.body.group.position;
        bot.body.group.rotation.y = bot.yaw;

        // Perception, staggered so not every bot raycasts on the same tick.
        if (now >= bot.perceiveAt) {
          bot.perceiveAt = now + 0.1;
          perceive(bot, ctx, now);
        }

        const engaging = bot.target && now >= bot.targetAcquiredAt && now - bot.lastKnownAt < 3.5;
        bot.wantChannel = null;

        // Objective behaviour overrides routes.
        const bomb = ctx.state.bomb;
        if (bot.team === TEAMS.SENTINEL && bomb.state === 'planted') {
          const site = world.sites.find((s) => s.id === bomb.plantedAt);
          const distToBomb = bomb.position ? Math.hypot(pos.x - bomb.position.x, pos.z - bomb.position.z) : 99;
          if (distToBomb < 2.2 && (!engaging || bomb.timer < 8)) {
            bot.wantChannel = 'defuse';
          } else if (bot.route.length === 0 || bot.routeIndex >= bot.route.length) {
            setRoute(bot, site.id === 'A' ? 'W6' : 'E6');
          }
        } else if (bot.team === TEAMS.VANGUARD && bot.hasCharge && bomb.state === 'carried') {
          const site = world.siteAt(pos);
          if (site && !engaging) {
            bot.wantChannel = 'plant';
          } else if (bot.route.length === 0 || bot.routeIndex >= bot.route.length) {
            setRoute(bot, bot.site === 'A' ? 'W6' : 'E6');
          }
        } else if (bot.team === TEAMS.VANGUARD && bomb.state === 'dropped' && bomb.position) {
          const dist = Math.hypot(pos.x - bomb.position.x, pos.z - bomb.position.z);
          if (dist < 1.2) {
            bomb.state = 'carried';
            bomb.carrier = bot;
            bot.hasCharge = true;
            setRoute(bot, bot.site === 'A' ? 'W6' : 'E6');
          } else if (!engaging && (bot.role === 'carrier' || bot.role === 'support')) {
            const node = nearestNode(world.nodes, bomb.position.x, bomb.position.z);
            if (bot.route.length === 0 || bot.routeIndex >= bot.route.length) setRoute(bot, node);
          }
        } else if (bot.team === TEAMS.VANGUARD && bomb.state === 'planted') {
          // Post-plant: hold the site, spread to the far corners.
          if (bot.route.length === 0 || bot.routeIndex >= bot.route.length) {
            const site = bomb.plantedAt;
            const corner = bot.id % 2 === 0 ? (site === 'A' ? 'D3' : 'D4') : (site === 'A' ? 'W6' : 'E6');
            setRoute(bot, corner);
          }
        }

        // Retreat: badly hurt, enemy close, and no teammate within 10 m.
        if (!bot.retreating && bot.health < 32 && engaging) {
          let allyNear = false;
          for (const other of bots) {
            if (other !== bot && other.alive && other.team === bot.team) {
              const op = other.body.group.position;
              if (Math.hypot(op.x - pos.x, op.z - pos.z) < 10) allyNear = true;
            }
          }
          if (!allyNear && bot.routeIndex > 0) {
            bot.retreating = true;
            bot.route = bot.route.slice(0, bot.routeIndex).reverse();
            bot.routeIndex = 0;
          }
        }
        if (bot.health > 60) bot.retreating = false;

        // Movement: walk the route, or hold and watch.
        let moving = false;
        if (!bot.wantChannel) {
          if (bot.route.length > 0 && bot.routeIndex < bot.route.length) {
            const node = world.nodes[bot.route[bot.routeIndex]];
            const arrived = walkToward(bot, node[0], node[1], dt, engaging ? bot.speed * 0.55 : bot.speed);
            moving = true;
            if (arrived) bot.routeIndex += 1;
          } else if (bot.investigate && now - bot.investigateAt < 6 && !engaging) {
            const arrived = walkToward(bot, bot.investigate.x, bot.investigate.z, dt, bot.speed * 0.8);
            moving = true;
            if (arrived) bot.investigate = null;
          } else {
            // Hold: face the watch direction, crouch on defence.
            if (bot.team === TEAMS.SENTINEL && bot.holdNode) {
              const watch = bot.holdNode === 'M5' ? Math.PI : bot.yaw;
              const targetYaw = bot.holdNode === 'W6' || bot.holdNode === 'D3' ? Math.PI * 0.75 : bot.holdNode === 'E6' || bot.holdNode === 'D4' ? -Math.PI * 0.75 : watch;
              let diff = targetYaw - bot.yaw;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              bot.yaw += Math.max(-2 * dt, Math.min(2 * dt, diff));
            }
            bot.crouching = bot.team === TEAMS.SENTINEL && rng.chance(0.002);
          }
        }

        // Aim steadiness grows while still, so a holding bot shoots straighter.
        bot.aimSteady = moving ? Math.max(0, bot.aimSteady - dt * 2) : Math.min(1, bot.aimSteady + dt * 0.8);

        // Face and fire at the target.
        if (engaging && bot.target) {
          const targetPos = bot.targetIsPlayer ? bot.target.position : bot.target.body.group.position;
          faceToward(bot, targetPos.x, targetPos.z, dt, 6);
          const alive = bot.targetIsPlayer ? bot.target.alive : bot.target.alive;
          if (alive) fireAt(bot, ctx, now);
          else bot.target = null;
        } else if (bot.target && now - bot.lastKnownAt < 3.5) {
          // Track the last known position while closing in.
          faceToward(bot, bot.lastKnown.x, bot.lastKnown.z, dt, 5);
        }

        // Walk animation: swinging legs, a slight torso bob, crouch lowers the
        // whole body (and its hitboxes) toward the ground.
        const speedNow = moving ? 1 : 0;
        bot.body.legL.rotation.x = Math.sin(bot.walkPhase) * 0.55 * speedNow;
        bot.body.legR.rotation.x = Math.sin(bot.walkPhase + Math.PI) * 0.55 * speedNow;
        const crouchDrop = bot.crouching ? 0.28 : 0;
        bot.body.group.position.y = -crouchDrop + (moving ? Math.abs(Math.sin(bot.walkPhase)) * 0.03 : 0);
      }
    },
  };
}
