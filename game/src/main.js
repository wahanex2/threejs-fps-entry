// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. This module wires every system together: input to the player, the player's
// shots through combat, kills through the economy, channels through the rounds,
// and everything visible through the HUD. ?shot=start|play|buy|end with &seed=N
// sets up a deterministic frame for a capture, renders it twice, then freezes it
// and sets window.__shotReady. ?test=1 runs a scripted self-check and reports it
// on window.__testResult.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeRng } from './rng.js';
import { createState, PHASE, RULES, TEAMS, teamName } from './state.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createPlayerWeapons, createGrenades, WEAPONS, WEAPON_ORDER, damageAt } from './weapons.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const testMode = params.get('test') === '1';
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = makeRng(seed);

// In test mode, capture every console error, uncaught error and unhandled
// rejection, so the self-check's noErrorsSoFar verdict is evidence collected
// during the run — not a hardcoded true.
const capturedErrors = [];
if (testMode) {
  const origError = console.error.bind(console);
  console.error = (...args) => {
    capturedErrors.push(args.map(String).join(' '));
    origError(...args);
  };
  window.addEventListener('error', (event) => {
    capturedErrors.push(String(event.message || event.error || 'window error'));
  });
  window.addEventListener('unhandledrejection', (event) => {
    capturedErrors.push(`unhandled rejection: ${String(event.reason)}`);
  });
}

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 300);
scene.add(camera);

const state = createState();
const world = createWorld(scene, rng);
const effects = createEffects(scene);
const combat = createCombat(world, effects, rng);
const audio = createAudio();
const hud = createHud(world.minimap);
const player = createPlayer(world.colliders);
const body = player.state;
body.team = state.playerTeam;
const weapons = createPlayerWeapons(camera, rng);
const grenades = createGrenades(scene, world.colliders, rng);
const bots = createBots(scene, world, rng);
const rounds = createRounds({ state, world, bots, audio, rng, scene });

let started = false;
let paused = false;
let buyOpen = false;
let prevFiring = false;
let survivedLastRound = true;
let testGodMode = false;
let renderTime = 0;
let lastObjective = '';
let fov = 74;

const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
hud.setMoney(state.money);
hud.setHealth(body.health);
hud.setArmor(body.armor);
hud.setScore(0, 0, 1);
hud.setAlive(5, 5);
hud.setObjective('Plant the charge at Site A or B');

function syncCamera() {
  const shake = state.shake;
  const sx = shake > 0 ? (rng.random() - 0.5) * shake * 0.05 : 0;
  const sy = shake > 0 ? (rng.random() - 0.5) * shake * 0.05 : 0;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + sx, body.yaw + sy, 0, 'YXZ');
}

function handleKill(killer, victim, weaponName, headshot) {
  const killerName = killer === 'player' ? 'You' : killer.name;
  hud.killfeedAdd(killerName, victim.name, headshot, killer === 'player' ? state.playerTeam : killer.team);
  rounds.awardKill(killer);
  if (killer === 'player') {
    state.stats.kills += 1;
    audio.hit(true);
    hud.hitMarker(true, 140);
  }
  if (victim.hasCharge) {
    victim.hasCharge = false;
    state.bomb.state = 'dropped';
    state.bomb.position = victim.body.group.position.clone();
    state.bomb.position.y = 0;
    rounds.showBombAt(state.bomb.position);
  }
  if (killer === 'player') state.roundKills.player += 1;
}

function damagePlayer(amount, head, fromPos) {
  if (!body.alive || testGodMode) return;
  const dealt = player.damage(amount);
  state.stats.damage += dealt;
  audio.hurt();
  if (fromPos) {
    const angle = Math.atan2(fromPos.x - body.position.x, fromPos.z - body.position.z) + body.yaw;
    hud.damageFrom(angle);
  }
  if (!body.alive) {
    state.stats.deaths += 1;
    hud.setSpectate(true);
    if (state.bomb.state === 'carried' && state.bomb.carrier === 'player') {
      state.bomb.state = 'dropped';
      state.bomb.position = body.position.clone();
      state.bomb.position.y = 0;
      rounds.showBombAt(state.bomb.position);
    }
  }
}

function respawnAll() {
  const spawn = world.spawns[state.playerTeam][0];
  player.spawn(spawn[0], spawn[1], state.playerTeam === TEAMS.VANGUARD ? 0 : Math.PI);
  body.team = state.playerTeam;
  if (!survivedLastRound) {
    weapons.resetRound();
    body.armor = 0;
  }
  bots.resetRound(world.spawns, state.playerTeam, state.round, rounds.attackSite(), state);
  grenades.reset();
  hud.setSpectate(false);
  hud.setChannel(null, 0);
  hud.setBombBar(null);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  hud.setHealth(body.health);
  hud.setArmor(body.armor);
  hud.setMoney(state.money);
  hud.setScore(state.scores.vanguard, state.scores.sentinel, state.round);
  hud.showBuy(false);
  buyOpen = false;
  state.shake = 0;
  updateObjective();
}

function updateObjective() {
  let text;
  if (state.bomb.state === 'planted') {
    text = state.playerTeam === TEAMS.VANGUARD ? 'Defend the planted charge' : 'DEFUSE THE CHARGE!';
  } else if (state.playerTeam === TEAMS.VANGUARD) {
    text = state.bomb.carrier === 'player' ? 'You carry the charge — plant at Site A or B' : 'Escort the carrier — plant at Site A or B';
  } else {
    text = 'Defend the sites. Do not let them plant.';
  }
  if (text !== lastObjective) {
    lastObjective = text;
    hud.setObjective(text);
  }
}

function drainEvents() {
  while (rounds.events.length > 0) {
    const event = rounds.events.shift();
    if (event.type === 'respawn') respawnAll();
    else if (event.type === 'banner') hud.banner(event.title, event.sub);
    else if (event.type === 'live') {
      hud.showBuy(false);
      buyOpen = false;
      if (started && !shot && !testMode && !input.state.locked) input.requestLock();
    } else if (event.type === 'matchEnd') {
      hud.showOverlay('end', { winner: event.winner, playerTeam: state.playerTeam, stats: state.stats, scores: state.scores });
      input.releaseLock();
    } else if (event.type === 'planted') {
      updateObjective();
    } else if (event.type === 'explode') {
      effects.explosion(event.position);
      audio.explosion(event.position.x, event.position.z);
      const dist = Math.hypot(event.position.x - body.position.x, event.position.z - body.position.z);
      state.shake = Math.max(0, 1.6 - dist / 14);
    } else if (event.type === 'halftime') {
      survivedLastRound = true;
    }
  }
}

function shoot() {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dryFire();
    return;
  }
  weapons.pullTrigger();
  camera.getWorldDirection(direction);
  const spread = weapons.spread(player.groundSpeed(), input.state.aiming);
  const pellets = def.pellets;
  let hitAny = false;
  let killedAny = false;
  for (let p = 0; p < pellets; p += 1) {
    const dir = direction.clone();
    const jitter = pellets > 1 ? 0.045 : spread;
    dir.x += (rng.random() * 2 - 1) * jitter;
    dir.y += (rng.random() * 2 - 1) * jitter;
    dir.z += (rng.random() * 2 - 1) * jitter;
    dir.normalize();
    const result = combat.shootPlayer(camera.position, dir, bots.hitMeshes);
    weapons.muzzleWorld(muzzle);
    combat.tracer(muzzle, result.point);
    if (result.hit) {
      const damage = damageAt(def, result.distance, result.part === 'head');
      const died = bots.damage(result.bot, damage);
      state.stats.damage += damage;
      combat.blood(result.point);
      hitAny = true;
      if (died) {
        killedAny = true;
        handleKill('player', result.bot, def.name, result.part === 'head');
      }
    } else if (result.blocked) {
      combat.impact(result.point, '#c8a86a', 5);
    }
  }
  if (hitAny && !killedAny) {
    audio.hit(false);
    hud.hitMarker(false);
  }
  const kick = weapons.recoil();
  player.recoil(kick.pitch, kick.yaw);
  audio.shot(def.kind);
  bots.onNoise(body.position.x, body.position.z, state.playerTeam, state.time);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, def.name);
}

function throwGrenade(kind) {
  if (state.phase !== PHASE.LIVE || !body.alive) return;
  if (kind === 'frag' && weapons.state.frags <= 0) return;
  if (kind === 'smoke' && weapons.state.smokes <= 0) return;
  if (kind === 'frag') weapons.state.frags -= 1;
  else weapons.state.smokes -= 1;
  camera.getWorldDirection(direction);
  tmpVec.copy(camera.position).addScaledVector(direction, 0.5);
  grenades.throw(kind, tmpVec, direction, kind === 'frag' ? 13 : 11, 'player');
  hud.setGrenades(weapons.state.frags, weapons.state.smokes);
}

function explodeGrenade(position, owner) {
  effects.explosion(position);
  audio.explosion(position.x, position.z);
  const radius = 7.5;
  const distPlayer = Math.hypot(position.x - body.position.x, position.z - body.position.z);
  if (distPlayer < radius) {
    const blocked = combat.hasLineOfSight(position, tmpVec.set(body.position.x, body.position.y + 1.2, body.position.z), grenades.clouds);
    const damage = Math.round((110 * (1 - distPlayer / radius) + 10) * (blocked ? 1 : 0.45));
    if (body.alive) {
      damagePlayer(damage, false, position);
      state.shake = Math.max(state.shake, 1.2 - distPlayer / 10);
    }
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const bp = bot.body.group.position;
    const dist = Math.hypot(position.x - bp.x, position.z - bp.z);
    if (dist >= radius) continue;
    const blocked = combat.hasLineOfSight(position, tmpVec.set(bp.x, bp.y + 1.2, bp.z), grenades.clouds);
    const damage = Math.round((110 * (1 - dist / radius) + 10) * (blocked ? 1 : 0.45));
    const died = bots.damage(bot, damage);
    if (owner === 'player') state.stats.damage += damage;
    if (died) handleKill(owner === 'player' ? 'player' : owner, bot, 'Frag Grenade', false);
  }
}

function applyBuy(kind, id) {
  const result = rounds.buy(kind, id);
  if (!result.ok) {
    audio.denied();
    hud.setHint(result.reason);
    return;
  }
  if (kind === 'weapon') weapons.give(id);
  else if (kind === 'armor') body.armor = 50;
  else if (kind === 'frag') weapons.state.frags = Math.min(2, weapons.state.frags + 1);
  else if (kind === 'smoke') weapons.state.smokes = Math.min(2, weapons.state.smokes + 1);
  audio.buy();
  hud.setMoney(state.money);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  hud.setArmor(body.armor);
  hud.setGrenades(weapons.state.frags, weapons.state.smokes);
}

const buyEntries = hud.buildBuyMenu((kind, id) => applyBuy(kind, id));
document.getElementById('buy-close').addEventListener('click', () => {
  hud.showBuy(false);
  buyOpen = false;
  if (started) input.requestLock();
});

const input = createInput(renderer.domElement, (locked) => {
  if (shot || testMode) return;
  if (locked) {
    started = true;
    paused = false;
    hud.hideOverlay();
    hud.showBuy(false);
    buyOpen = false;
  } else if (started && !buyOpen && state.phase !== PHASE.MATCH_END && state.phase !== PHASE.MENU) {
    paused = true;
    hud.showOverlay('paused');
  }
});

hud.onPlay(() => {
  audio.unlock();
  if (shot || testMode) return;
  if (state.phase === PHASE.MENU || state.phase === PHASE.MATCH_END) {
    survivedLastRound = true;
    rounds.startMatch();
    drainEvents();
  }
  if (input.state.lockFailed) {
    started = true;
    paused = false;
    hud.hideOverlay();
  } else {
    input.requestLock();
  }
});

function botContext() {
  return {
    state,
    time: state.time,
    player: body,
    combat,
    effects,
    audio,
    clouds: grenades.clouds,
    active: state.phase === PHASE.LIVE,
    onNoise: (x, z, team) => bots.onNoise(x, z, team, state.time),
    damagePlayer: (amount, head, bot) => damagePlayer(amount, head, bot.body.group.position),
    onKill: (killer, victim, weaponName, head) => handleKill(killer, victim, weaponName, head),
  };
}

function playerChannelRequest(keys) {
  if (!keys.has('KeyE') || state.phase !== PHASE.LIVE || !body.alive) return null;
  if (state.bomb.state === 'carried' && state.bomb.carrier === 'player' && world.siteAt(body.position)) return 'plant';
  if (state.bomb.state === 'planted' && state.playerTeam === TEAMS.SENTINEL && state.bomb.position) {
    const d = Math.hypot(body.position.x - state.bomb.position.x, body.position.z - state.bomb.position.z);
    if (d < 2.4) return 'defuse';
  }
  return null;
}

function step(dt, keys) {
  state.time += dt;
  state.shake = Math.max(0, state.shake - dt * 2.2);
  const aiming = input.state.aiming && body.alive;
  player.step(dt, keys, aiming);
  weapons.step(dt, aiming);
  if (body.stepped) audio.step(body.position.x, body.position.z);

  const channel = playerChannelRequest(keys);
  rounds.step(dt, channel, body.position, body.alive);
  drainEvents();

  const ctx = botContext();
  bots.step(dt, ctx);

  grenades.step(
    dt,
    (position, owner) => explodeGrenade(position, owner),
    () => audio.smoke(),
    (x, y, z) => audio.bounce(x, z),
  );
  rounds.stepVisuals(dt);
  effects.step(dt);

  // Pick up a dropped charge by walking over it.
  if (state.bomb.state === 'dropped' && state.bomb.position && body.alive && state.playerTeam === TEAMS.VANGUARD) {
    const d = Math.hypot(body.position.x - state.bomb.position.x, body.position.z - state.bomb.position.z);
    if (d < 1.3) {
      state.bomb.state = 'carried';
      state.bomb.carrier = 'player';
      rounds.hideBomb();
      updateObjective();
    }
  }
  if (state.phase === PHASE.ROUND_END || state.phase === PHASE.MATCH_END) {
    survivedLastRound = body.alive;
  }
}

// Edge-triggered keys run once per rendered frame, never once per fixed step,
// so one press is one reload, one grenade, one purchase.
function handlePressed(pressed) {
  if (pressed.has('KeyR') && weapons.reload()) audio.reload();
  if (pressed.has('KeyG')) throwGrenade('frag');
  if (pressed.has('KeyT')) throwGrenade('smoke');
  if (pressed.has('KeyB') && state.phase === PHASE.FREEZE) {
    if (buyOpen) {
      hud.showBuy(false);
      buyOpen = false;
      input.requestLock();
    } else {
      hud.showBuy(true);
      buyOpen = true;
      input.releaseLock();
    }
  }
  if (buyOpen) {
    for (const entry of buyEntries) {
      if (pressed.has(`Digit${entry.key}`)) applyBuy(entry.kind, entry.id);
    }
  } else {
    WEAPON_ORDER.forEach((id, index) => {
      if (pressed.has(`Digit${index + 1}`) && weapons.switchTo(id)) {
        hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
      }
    });
  }
}

function syncHud() {
  hud.setHealth(body.health);
  hud.setArmor(body.armor);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  hud.setMoney(state.money);
  hud.setGrenades(weapons.state.frags, weapons.state.smokes);
  const planted = state.bomb.state === 'planted';
  hud.setTimer(planted ? state.bomb.timer : state.roundClock, planted);
  hud.setBombBar(planted ? state.bomb.timer / RULES.bombTime : null);
  hud.setScore(state.scores.vanguard, state.scores.sentinel, state.round);
  const vAlive = bots.aliveCount(TEAMS.VANGUARD) + (state.playerTeam === TEAMS.VANGUARD && body.alive ? 1 : 0);
  const sAlive = bots.aliveCount(TEAMS.SENTINEL) + (state.playerTeam === TEAMS.SENTINEL && body.alive ? 1 : 0);
  hud.setAlive(vAlive, sAlive);
  const spreadPx = 4 + weapons.spread(player.groundSpeed(), input.state.aiming) * 900;
  hud.setCrosshair(spreadPx);
  if (state.channel && state.channel.who === 'player') {
    hud.setChannel(state.channel.kind === 'plant' ? 'Planting charge…' : 'Defusing…', state.channel.progress);
  } else {
    hud.setChannel(null, 0);
  }
  let hint = '';
  if (state.phase === PHASE.FREEZE) hint = `Buy phase — press B for the buy menu · round starts in ${Math.ceil(state.phaseLeft)}s`;
  else if (state.phase === PHASE.LIVE && body.alive) {
    if (state.bomb.state === 'carried' && state.bomb.carrier === 'player' && world.siteAt(body.position)) hint = 'Hold E to plant the charge';
    else if (state.bomb.state === 'planted' && state.playerTeam === TEAMS.SENTINEL && state.bomb.position && Math.hypot(body.position.x - state.bomb.position.x, body.position.z - state.bomb.position.z) < 2.4) hint = 'Hold E to defuse the charge';
    else if (state.bomb.state === 'dropped' && state.bomb.position && state.playerTeam === TEAMS.VANGUARD) hint = 'Pick up the dropped charge';
  }
  hud.setHint(hint);
  hud.drawMinimap(body, bots.bots, state.bomb, state.playerTeam, renderTime);
  audio.setListener(body.position.x, body.position.z);
  updateObjective();
}

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  renderTime += Math.min((now - lastTime) / 1000, 0.1);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!paused) {
    const look = input.takeLook();
    const sensitivity = input.state.aiming ? 0.0013 : 0.0022;
    player.look(look.x, look.y, sensitivity);
    const firing = input.state.firing && body.alive && state.phase === PHASE.LIVE && !buyOpen;
    const def = weapons.def();
    if (firing && weapons.ready() && (def.auto || !prevFiring)) shoot();
    prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP, input.state.keys);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    handlePressed(input.state.pressed);
    input.endFrame();
  } else {
    // Keys pressed while the pause overlay is up must not queue into the
    // resumed game: drain the edge-triggered set every paused frame too.
    input.endFrame();
  }
  if (state.phase === PHASE.MENU) {
    camera.position.set(8, 6.5, 20);
    camera.lookAt(-14, 1, -12);
  } else {
    syncCamera();
  }
  const targetFov = input.state.aiming && body.alive ? (weapons.def().id === 'marksman' ? 38 : 55) : 74;
  if (Math.abs(targetFov - fov) > 0.05) {
    fov += (targetFov - fov) * Math.min(1, dt * 14);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  syncHud();
  renderer.render(scene, camera);
}

function settle(steps, keys = new Set()) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP, keys);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    syncHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function startScriptedMatch() {
  survivedLastRound = true;
  rounds.startMatch();
  drainEvents();
  state.phase = PHASE.LIVE;
  state.roundClock = 82;
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    body.position.set(0, 0, 14);
    body.yaw = 0.12;
    body.pitch = 0;
    settle(10);
    hud.showOverlay('start');
    syncCamera();
    paintTwiceThenReady();
    return;
  }
  if (name === 'buy') {
    rounds.startMatch();
    drainEvents();
    body.position.set(0, 0, 19);
    body.yaw = 0;
    settle(6);
    hud.showBuy(true);
    hud.setMoney(state.money);
    paintTwiceThenReady();
    return;
  }
  if (name === 'end') {
    startScriptedMatch();
    state.scores.vanguard = 5;
    state.scores.sentinel = 3;
    state.stats = { kills: 14, deaths: 6, plants: 2, defuses: 0, damage: 1830, roundsWon: 5 };
    state.phase = PHASE.MATCH_END;
    body.position.set(-4, 0, 12);
    body.yaw = -0.3;
    settle(4);
    hud.showOverlay('end', { winner: TEAMS.VANGUARD, playerTeam: state.playerTeam, stats: state.stats, scores: state.scores });
    paintTwiceThenReady();
    return;
  }
  // play: a live firefight, mid-round, with the player engaging a visible bot.
  startScriptedMatch();
  weapons.give('rifle');
  settle(60 * 7);
  body.position.set(0, 0, 9);
  const enemies = bots.bots.filter((b) => b.alive && b.team !== state.playerTeam);
  const eye = new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z);
  const pick = (visibleOnly) => {
    let target = null;
    let bestDist = Infinity;
    for (const bot of enemies) {
      const bp = bot.body.group.position;
      const d = Math.hypot(bp.x - body.position.x, bp.z - body.position.z);
      if (d >= bestDist) continue;
      if (visibleOnly && !combat.hasLineOfSight(eye, new THREE.Vector3(bp.x, bp.y + 1.2, bp.z), grenades.clouds)) continue;
      bestDist = d;
      target = bot;
    }
    return target;
  };
  const target = pick(true) ?? pick(false);
  if (target) {
    const tp = target.body.group.position;
    aimAt(new THREE.Vector3(tp.x, tp.y + 1.3, tp.z));
    shoot();
    settle(2);
  }
  paintTwiceThenReady();
}

// Scripted self-check: drives the real simulation headlessly and reports what
// happened. Used by the maker's own verification, never by the game itself.
function runTest() {
  const result = { checks: {}, log: [] };
  const log = (line) => result.log.push(line);
  testGodMode = true;
  try {
    // Graph sanity: every waypoint clear of colliders, every graph edge walkable.
    {
      const boxes = world.colliders;
      const clear = (x, z, r) => !boxes.some((b) => b.min.x < x + r && b.max.x > x - r && b.min.z < z + r && b.max.z > z - r && b.max.y > 0.9);
      const segClear = (ax, az, bx, bz) => {
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / 0.5));
        for (let i = 0; i <= n; i += 1) if (!clear(ax + (dx * i) / n, az + (dz * i) / n, 0.36)) return false;
        return true;
      };
      const badNodes = [];
      for (const [name, [x, z]] of Object.entries(world.nodes)) if (!clear(x, z, 0.36)) badNodes.push(name);
      const seen = new Set();
      const badEdges = [];
      for (const [a, neighbors] of world.graph) {
        for (const b of neighbors) {
          const key = [a, b].sort().join('-');
          if (seen.has(key)) continue;
          seen.add(key);
          const [ax, az] = world.nodes[a];
          const [bx, bz] = world.nodes[b];
          if (!segClear(ax, az, bx, bz)) badEdges.push(key);
        }
      }
      result.checks.graphClear = badNodes.length === 0 && badEdges.length === 0;
      log(`graph: bad nodes [${badNodes.join(',')}] bad edges [${badEdges.join(',')}]`);
    }
    startScriptedMatch();
    const spawnSpots = bots.bots.map((b) => b.body.group.position.clone());
    const keys = new Set(['KeyW']);
    for (let i = 0; i < 60 * 6; i += 1) {
      if (i % 45 === 0) shoot();
      step(FIXED_STEP, keys);
    }
    const moved = bots.bots.filter((b, i) => b.body.group.position.distanceTo(spawnSpots[i]) > 2).length;
    result.checks.botsMove = moved >= 4;
    log(`bots moved >2m: ${moved}/8`);
    result.checks.playerMoved = body.position.z < 19;
    log(`player z: ${body.position.z.toFixed(1)}`);
    result.checks.noErrorsSoFar = capturedErrors.length === 0;
    log(`captured errors: ${capturedErrors.length}${capturedErrors.length > 0 ? ` — ${capturedErrors[0]}` : ''}`);

    // Force an elimination win: drop every Sentinel bot.
    for (const bot of bots.bots) {
      if (bot.team === TEAMS.SENTINEL && bot.alive) {
        bots.damage(bot, 1000);
        handleKill('player', bot, 'P9 Sidearm', false);
      }
    }
    settle(30);
    result.checks.eliminationEndsRound = state.phase === PHASE.ROUND_END && state.scores.vanguard === 1;
    log(`phase after elimination: ${state.phase}, score V${state.scores.vanguard}-S${state.scores.sentinel}`);
    settle(60 * 5);
    result.checks.nextRoundStarts = state.phase === PHASE.FREEZE && state.round === 2;
    log(`round 2 phase: ${state.phase}`);
    state.phase = PHASE.LIVE;

    // Plant the charge as the player, then let it detonate. Defenders are pinned
    // at their spawn for the detonation check so the timer path is exercised.
    body.position.set(-23.5, 0, -13.5);
    const plantKeys = new Set(['KeyE']);
    let planted = false;
    for (let i = 0; i < 60 * 6 && !planted; i += 1) {
      step(FIXED_STEP, plantKeys);
      planted = state.bomb.state === 'planted';
    }
    result.checks.plantWorks = planted;
    log(`bomb state after channel: ${state.bomb.state}`);
    let exploded = false;
    for (let i = 0; i < 60 * 40 && !exploded; i += 1) {
      for (const bot of bots.bots) {
        if (bot.team === TEAMS.SENTINEL && bot.alive) {
          bot.body.group.position.set(0, 0, -20);
          bot.target = null;
          bot.route = [];
        }
      }
      step(FIXED_STEP, new Set());
      exploded = state.bomb.state === 'exploded';
    }
    result.checks.explosionEndsRound = exploded && state.scores.vanguard === 2;
    log(`bomb state: ${state.bomb.state}, score V${state.scores.vanguard}-S${state.scores.sentinel}`);
    result.checks.moneyChanged = state.money !== RULES.startMoney;
    log(`player money: $${state.money}`);
    result.checks.buyWorks = (() => {
      state.phase = PHASE.FREEZE;
      const before = state.money;
      state.money = 5000;
      const res = rounds.buy('weapon', 'rifle');
      const ok = res.ok && state.money === 5000 - WEAPONS.rifle.price;
      state.money = before;
      return ok;
    })();
    result.allPassed = Object.values(result.checks).every(Boolean);
  } catch (error) {
    result.error = String(error && error.stack ? error.stack : error);
    result.allPassed = false;
  }
  window.__testResult = result;
  window.__testDone = true;
  // eslint-disable-next-line no-console
  console.log(`TEST ${result.allPassed ? 'PASS' : 'FAIL'} ${JSON.stringify(result.checks)}`);
  syncCamera();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug hooks for headless verification: inspect and drive the live game.
window.__game = {
  state,
  body,
  bots,
  rounds,
  weapons,
  world,
  teleport(x, z) {
    body.position.set(x, 0, z);
  },
  forceLive() {
    state.phase = PHASE.LIVE;
  },
};

// Boot placement: bots and the player stand at their spawns behind the menu,
// so the menu backdrop shows the squads in place instead of stacked at origin.
bots.resetRound(world.spawns, state.playerTeam, 1, 'A', state);
{
  const spawn = world.spawns[state.playerTeam][0];
  player.spawn(spawn[0], spawn[1], 0);
}

syncCamera();
if (shot) runShot(shot);
else if (testMode) runTest();
else requestAnimationFrame(frame);
