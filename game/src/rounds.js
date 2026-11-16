// The match: round phases, the economy, and the bomb. Rounds run FREEZE (buy) ->
// LIVE -> ROUND_END, with a halftime side swap and a first-to-5 match. A round is
// won by elimination, by the bomb exploding, by a defuse, or by the defenders
// running the clock out. Money is awarded per kill and per round, with a loss
// streak bonus, exactly like the economy the buy menu spends. Events go out on a
// queue the main loop drains into the HUD, so this module never touches the DOM.
import * as THREE from 'three';
import { PHASE, RULES, TEAMS, otherTeam, teamName, matchOver } from './state.js';
import { WEAPONS, ARMOR_PRICE, FRAG_PRICE, SMOKE_PRICE } from './weapons.js';

export function createRounds(deps) {
  const { state, world, bots, audio, rng, scene } = deps;
  const events = [];

  // The charge: a dark case with a blinking light, visible when dropped or planted.
  const bombGroup = new THREE.Group();
  const caseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.26, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#22262d'), roughness: 0.6, metalness: 0.4 }),
  );
  caseMesh.position.y = 0.13;
  const blinkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e5484d') });
  const blink = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), blinkMat);
  blink.position.set(0.12, 0.28, 0);
  bombGroup.add(caseMesh, blink);
  bombGroup.visible = false;
  scene.add(bombGroup);
  let blinkPhase = 0;
  let beepAt = 0;

  let attackSite = 'A';

  function emit(type, data = {}) {
    events.push({ type, ...data });
  }

  function startMatch() {
    state.scores.vanguard = 0;
    state.scores.sentinel = 0;
    state.lossStreak.vanguard = 0;
    state.lossStreak.sentinel = 0;
    state.round = 1;
    state.playerTeam = TEAMS.VANGUARD;
    state.swapped = false;
    state.money = RULES.startMoney;
    state.stats = { kills: 0, deaths: 0, plants: 0, defuses: 0, damage: 0, roundsWon: 0 };
    bots.resetMatch();
    startRound();
  }

  function startRound() {
    attackSite = rng.chance(0.5) ? 'A' : 'B';
    state.phase = PHASE.FREEZE;
    state.phaseLeft = RULES.freezeTime;
    state.roundClock = RULES.roundTime;
    state.channel = null;
    state.winner = null;
    state.winReason = '';
    state.bomb.state = 'carried';
    state.bomb.position = null;
    state.bomb.plantedAt = null;
    state.bomb.timer = 0;
    state.bomb.site = null;
    if (state.playerTeam === TEAMS.VANGUARD) {
      state.bomb.carrier = 'player';
      for (const bot of bots.bots) bot.hasCharge = false;
    } else {
      const carrier = bots.bots.find((b) => b.team === TEAMS.VANGUARD);
      state.bomb.carrier = carrier;
      for (const bot of bots.bots) bot.hasCharge = bot === carrier;
    }
    bombGroup.visible = false;
    emit('respawn', { attackSite });
    emit('banner', { title: `ROUND ${state.round}`, sub: state.playerTeam === TEAMS.VANGUARD ? 'Plant the charge at Site A or B' : 'Defend the sites. Do not let them plant.' });
  }

  function endRound(winner, reason) {
    if (state.phase === PHASE.ROUND_END || state.phase === PHASE.MATCH_END) return;
    state.phase = PHASE.ROUND_END;
    state.phaseLeft = RULES.roundEndTime;
    state.winner = winner;
    state.winReason = reason;
    state.scores[winner] += 1;
    const loser = otherTeam(winner);
    state.lossStreak[loser] += 1;
    state.lossStreak[winner] = 0;
    const lossBonus = Math.min(RULES.lossStreakMax, RULES.lossBase + (state.lossStreak[loser] - 1) * RULES.lossStreakBonus);
    if (state.playerTeam === winner) {
      state.money = Math.min(RULES.maxMoney, state.money + RULES.winReward);
      state.stats.roundsWon += 1;
      audio.roundWin();
    } else {
      state.money = Math.min(RULES.maxMoney, state.money + lossBonus);
      audio.roundLose();
    }
    bots.awardMoney(winner, RULES.winReward);
    bots.awardMoney(loser, lossBonus);
    const reasonText = {
      elimination: `${teamName(winner)} wins by elimination`,
      explosion: 'The charge detonated — Vanguard wins the round',
      defuse: 'Charge defused — Sentinel wins the round',
      time: 'Time expired — Sentinel holds the sites',
    }[reason];
    emit('banner', { title: `${teamName(winner).toUpperCase()} WINS THE ROUND`, sub: reasonText });
    emit('roundEnd', { winner, reason });
    if (matchOver(state)) {
      state.phase = PHASE.MATCH_END;
      emit('matchEnd', { winner: state.scores.vanguard > state.scores.sentinel ? TEAMS.VANGUARD : TEAMS.SENTINEL });
    }
  }

  function checkElimination(playerAlive) {
    if (state.phase !== PHASE.LIVE) return;
    const vanguardAlive = bots.aliveCount(TEAMS.VANGUARD) + (state.playerTeam === TEAMS.VANGUARD && playerAlive ? 1 : 0);
    const sentinelAlive = bots.aliveCount(TEAMS.SENTINEL) + (state.playerTeam === TEAMS.SENTINEL && playerAlive ? 1 : 0);
    const planted = state.bomb.state === 'planted';
    if (vanguardAlive === 0 && !planted) endRound(TEAMS.SENTINEL, 'elimination');
    else if (sentinelAlive === 0) endRound(TEAMS.VANGUARD, 'elimination');
    else if (vanguardAlive === 0 && planted) {
      // All attackers down after the plant: defenders still must defuse.
    }
  }

  function awardKill(killer) {
    if (killer === 'player') {
      state.money = Math.min(RULES.maxMoney, state.money + RULES.killReward);
    } else if (killer) {
      killer.money = Math.min(16000, killer.money + RULES.killReward);
    }
  }

  function buy(kind, id) {
    if (state.phase !== PHASE.FREEZE) return { ok: false, reason: 'Buy time is over' };
    let price = 0;
    if (kind === 'weapon') price = WEAPONS[id].price;
    else if (kind === 'armor') price = ARMOR_PRICE;
    else if (kind === 'frag') price = FRAG_PRICE;
    else if (kind === 'smoke') price = SMOKE_PRICE;
    if (state.money < price) return { ok: false, reason: 'Not enough money' };
    state.money -= price;
    return { ok: true, price };
  }

  function explode() {
    state.bomb.state = 'exploded';
    bombGroup.visible = false;
    emit('explode', { position: state.bomb.position.clone() });
    endRound(TEAMS.VANGUARD, 'explosion');
  }

  // Channels: one plant or defuse at a time, shared by the player (E key, passed
  // in as playerChannel) and the bots (bot.wantChannel). Moving or dying cancels.
  function stepChannels(dt, playerChannel, playerPos, playerAlive) {
    const bomb = state.bomb;
    let active = null;
    if (playerChannel && playerAlive) {
      if (playerChannel === 'plant' && bomb.state === 'carried' && bomb.carrier === 'player') {
        const site = world.siteAt(playerPos);
        if (site) active = { kind: 'plant', who: 'player', site };
      } else if (playerChannel === 'defuse' && bomb.state === 'planted' && bomb.position) {
        const d = Math.hypot(playerPos.x - bomb.position.x, playerPos.z - bomb.position.z);
        if (d < 2.4 && state.playerTeam === TEAMS.SENTINEL) active = { kind: 'defuse', who: 'player', site: bomb.plantedAt };
      }
    }
    if (!active) {
      for (const bot of bots.bots) {
        if (!bot.alive || !bot.wantChannel) continue;
        const pos = bot.body.group.position;
        if (bot.wantChannel === 'plant' && bomb.state === 'carried' && bomb.carrier === bot) {
          const site = world.siteAt(pos);
          if (site) {
            active = { kind: 'plant', who: bot, site };
            break;
          }
        } else if (bot.wantChannel === 'defuse' && bomb.state === 'planted' && bomb.position) {
          const d = Math.hypot(pos.x - bomb.position.x, pos.z - bomb.position.z);
          if (d < 2.4) {
            active = { kind: 'defuse', who: bot, site: bomb.plantedAt };
            break;
          }
        }
      }
    }
    if (!active) {
      state.channel = null;
      return;
    }
    if (!state.channel || state.channel.kind !== active.kind || state.channel.who !== active.who) {
      state.channel = { kind: active.kind, who: active.who, site: active.site, progress: 0 };
    }
    const duration = active.kind === 'plant' ? RULES.plantTime : RULES.defuseTime;
    state.channel.progress += dt / duration;
    if (active.kind === 'defuse' && Math.floor(state.channel.progress * 10) !== Math.floor((state.channel.progress - dt / duration) * 10)) {
      audio.defuseTick();
    }
    if (state.channel.progress >= 1) {
      if (active.kind === 'plant') {
        const site = world.sites.find((s) => s.id === (typeof active.site === 'string' ? active.site : active.site.id));
        bomb.state = 'planted';
        bomb.plantedAt = site.id;
        bomb.site = site;
        bomb.timer = RULES.bombTime;
        const carrierPos = active.who === 'player' ? playerPos : active.who.body.group.position;
        bomb.position = new THREE.Vector3(carrierPos.x, 0, carrierPos.z);
        bombGroup.position.copy(bomb.position);
        bombGroup.visible = true;
        if (active.who === 'player') state.stats.plants += 1;
        audio.plant();
        emit('banner', { title: 'CHARGE PLANTED', sub: `Site ${site.id} — ${RULES.bombTime} seconds to detonation` });
        emit('planted', { site: site.id });
        beepAt = 0;
      } else {
        bomb.state = 'defused';
        bombGroup.visible = false;
        if (active.who === 'player') state.stats.defuses += 1;
        endRound(TEAMS.SENTINEL, 'defuse');
      }
      state.channel = null;
    }
  }

  function step(dt, playerChannel, playerPos, playerAlive) {
    if (state.phase === PHASE.FREEZE) {
      state.phaseLeft -= dt;
      if (state.phaseLeft <= 0) {
        state.phase = PHASE.LIVE;
        emit('banner', { title: 'GO GO GO', sub: '' });
        emit('live');
      }
      return;
    }
    if (state.phase === PHASE.LIVE) {
      if (state.bomb.state === 'planted') {
        state.bomb.timer -= dt;
        beepAt -= dt;
        if (beepAt <= 0) {
          const rate = 1 + (1 - state.bomb.timer / RULES.bombTime) * 3;
          audio.beep(rate);
          beepAt = Math.max(0.18, 1 / rate);
        }
        if (state.bomb.timer <= 0) {
          explode();
          return;
        }
      } else {
        state.roundClock -= dt;
        if (state.roundClock <= 0) {
          state.roundClock = 0;
          endRound(TEAMS.SENTINEL, 'time');
          return;
        }
      }
      stepChannels(dt, playerChannel, playerPos, playerAlive);
      checkElimination(playerAlive);
      return;
    }
    if (state.phase === PHASE.ROUND_END) {
      state.phaseLeft -= dt;
      if (state.phaseLeft <= 0) {
        if (matchOver(state)) {
          state.phase = PHASE.MATCH_END;
          return;
        }
        state.round += 1;
        if (state.round === RULES.halftimeAfter + 1 && !state.swapped) {
          state.swapped = true;
          state.playerTeam = otherTeam(state.playerTeam);
          state.money = RULES.startMoney;
          bots.resetMatch();
          emit('banner', { title: 'HALFTIME — SIDES SWAPPED', sub: `You now fight for ${teamName(state.playerTeam)}` });
          emit('halftime');
        }
        startRound();
      }
    }
  }

  function stepVisuals(dt) {
    if (!bombGroup.visible) return;
    blinkPhase += dt * (state.bomb.state === 'planted' ? 2 + (1 - state.bomb.timer / RULES.bombTime) * 8 : 3);
    blinkMat.color.setHex(Math.sin(blinkPhase * 3) > 0 ? 0xe5484d : 0x551111);
  }

  return {
    events,
    startMatch,
    startRound,
    endRound,
    checkElimination,
    awardKill,
    buy,
    step,
    stepVisuals,
    attackSite() {
      return attackSite;
    },
    showBombAt(position) {
      bombGroup.position.copy(position);
      bombGroup.visible = true;
    },
    hideBomb() {
      bombGroup.visible = false;
    },
  };
}
