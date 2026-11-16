// The DOM HUD: crosshair, hit marker, health and armour, ammo, money, the round
// timer and score, alive counts, kill feed, a canvas minimap, the buy menu, round
// banners, the plant/defuse channel bar and the start/pause/end overlays. It never
// touches the simulation; main.js pushes numbers in and reads callbacks out. DOM
// writes are cached so unchanged values never touch the document.
import { WEAPONS, WEAPON_ORDER, ARMOR_PRICE, FRAG_PRICE, SMOKE_PRICE } from './weapons.js';
import { TEAMS, teamName } from './state.js';

const MAP_BOUNDS = { minX: -32.4, maxX: 32.4, minZ: -24.4, maxZ: 24.4 };

export function createHud(minimapRects) {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    overlayStats: $('overlay-stats'),
    play: $('play'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    healthValue: $('health-value'),
    healthBar: $('health-bar'),
    armorValue: $('armor-value'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammoBox: $('ammobox'),
    weaponName: $('weapon-name'),
    money: $('money-value'),
    timer: $('timer-value'),
    bombBar: $('bomb-bar'),
    bombFill: $('bomb-fill'),
    scoreV: $('score-vanguard'),
    scoreS: $('score-sentinel'),
    roundLabel: $('round-label'),
    aliveV: $('alive-vanguard'),
    aliveS: $('alive-sentinel'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    channel: $('channel'),
    channelLabel: $('channel-label'),
    channelFill: $('channel-fill'),
    hint: $('hint'),
    damage: $('damage-dir'),
    buyMenu: $('buy-menu'),
    buyMoney: $('buy-money'),
    objective: $('objective'),
    minimap: $('minimap'),
    spectate: $('spectate'),
    grenades: $('grenade-count'),
  };
  const mapCtx = els.minimap.getContext('2d');
  const mapW = els.minimap.width;
  const mapH = els.minimap.height;

  let lastHealth = -1;
  let lastArmor = -1;
  let lastMag = -1;
  let lastReserve = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';
  let lastWeapon = '';
  let lastGrenades = '';
  let hitTimer = 0;
  let bannerTimer = 0;
  let damageTimer = 0;

  function toMap(x, z) {
    return [
      ((x - MAP_BOUNDS.minX) / (MAP_BOUNDS.maxX - MAP_BOUNDS.minX)) * mapW,
      ((z - MAP_BOUNDS.minZ) / (MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ)) * mapH,
    ];
  }

  function drawMinimapBase() {
    mapCtx.fillStyle = '#161b23';
    mapCtx.fillRect(0, 0, mapW, mapH);
    for (const rect of minimapRects) {
      const [x, z] = toMap(rect.x - rect.w / 2, rect.z - rect.d / 2);
      const [x2, z2] = toMap(rect.x + rect.w / 2, rect.z + rect.d / 2);
      mapCtx.fillStyle = rect.shade === 'wall' ? '#3d4450' : '#565d68';
      mapCtx.fillRect(x, z, x2 - x, z2 - z);
    }
    mapCtx.font = 'bold 13px system-ui, sans-serif';
    mapCtx.textAlign = 'center';
    mapCtx.fillStyle = '#f2a93b';
    const [ax, az] = toMap(-23.5, -13.5);
    mapCtx.fillText('A', ax, az + 4);
    mapCtx.fillStyle = '#3fb8a6';
    const [bx, bz] = toMap(23.5, -13.5);
    mapCtx.fillText('B', bx, bz + 4);
  }

  return {
    setHealth(value) {
      if (value === lastHealth) return;
      lastHealth = value;
      els.healthValue.textContent = String(Math.max(0, Math.ceil(value)));
      els.healthBar.style.width = `${Math.max(0, value)}%`;
      els.healthBar.style.background = value <= 30 ? '#e5484d' : value <= 60 ? '#f2a93b' : '#3fb8a6';
    },
    setArmor(value) {
      if (value === lastArmor) return;
      lastArmor = value;
      els.armorValue.textContent = String(Math.max(0, Math.ceil(value)));
    },
    setAmmo(mag, reserve, weaponName) {
      if (mag !== lastMag || reserve !== lastReserve || weaponName !== lastWeapon) {
        lastMag = mag;
        lastReserve = reserve;
        lastWeapon = weaponName;
        els.ammoMag.textContent = String(mag);
        els.ammoReserve.textContent = `/ ${reserve}`;
        els.weaponName.textContent = weaponName;
      }
      els.ammoBox.classList.toggle('empty', mag === 0);
    },
    setGrenades(frags, smokes) {
      const text = `Frag ${frags} · Smoke ${smokes}`;
      if (text === lastGrenades) return;
      lastGrenades = text;
      els.grenades.textContent = text;
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      els.money.textContent = `$${value}`;
      els.buyMoney.textContent = `$${value}`;
      for (const item of els.buyMenu.querySelectorAll('[data-price]')) {
        item.classList.toggle('cant', Number(item.dataset.price) > value);
      }
    },
    setTimer(seconds, planted) {
      const text = planted ? `💣 ${Math.max(0, seconds).toFixed(1)}` : `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
      if (text === lastTimer) return;
      lastTimer = text;
      els.timer.textContent = text;
      els.timer.style.color = planted ? '#e5484d' : '';
    },
    setBombBar(fraction) {
      els.bombBar.style.display = fraction === null ? 'none' : 'block';
      if (fraction !== null) els.bombFill.style.width = `${Math.max(0, fraction * 100)}%`;
    },
    setScore(vanguard, sentinel, round) {
      const text = `${vanguard}-${sentinel} r${round}`;
      if (text === lastScore) return;
      lastScore = text;
      els.scoreV.textContent = String(vanguard);
      els.scoreS.textContent = String(sentinel);
      els.roundLabel.textContent = `ROUND ${round}`;
    },
    setAlive(vanguard, sentinel) {
      const text = `${vanguard}/${sentinel}`;
      if (text === lastAlive) return;
      lastAlive = text;
      els.aliveV.textContent = String(vanguard);
      els.aliveS.textContent = String(sentinel);
    },
    setObjective(text) {
      els.objective.textContent = text;
    },
    setCrosshair(spreadPx) {
      els.crosshair.style.setProperty('--gap', `${Math.round(spreadPx)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFrom(angleRad) {
      els.damage.style.transform = `translate(-50%, -50%) rotate(${angleRad}rad)`;
      els.damage.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => els.damage.classList.remove('on'), 500);
    },
    killfeedAdd(killer, victim, headshot, killerTeam) {
      const entry = document.createElement('div');
      entry.className = 'feed-entry';
      const killerSpan = document.createElement('b');
      killerSpan.textContent = killer;
      killerSpan.style.color = killerTeam === TEAMS.VANGUARD ? '#f2a93b' : '#3fb8a6';
      const victimSpan = document.createElement('span');
      victimSpan.textContent = victim;
      entry.append(killerSpan, document.createTextNode(headshot ? ' ☠ ' : ' ▸ '), victimSpan);
      els.killfeed.prepend(entry);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
      setTimeout(() => entry.classList.add('fade'), 4200);
      setTimeout(() => entry.remove(), 5000);
    },
    banner(title, sub, holdMs = 2600) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      els.banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('on'), holdMs);
    },
    setChannel(label, fraction) {
      if (label === null) {
        els.channel.style.display = 'none';
        return;
      }
      els.channel.style.display = 'block';
      els.channelLabel.textContent = label;
      els.channelFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    setHint(text) {
      if (els.hint.textContent !== text) els.hint.textContent = text;
    },
    setSpectate(show) {
      els.spectate.style.display = show ? 'block' : 'none';
    },
    showOverlay(mode, data = {}) {
      const copy = {
        start: {
          title: 'MERIDIAN BREACH',
          text: 'A tactical round-based shooter in a dusk container yard. Five attackers, five defenders, one charge. Plant it or stop them — every round pays, every round you buy.',
        },
        paused: { title: 'PAUSED', text: 'Click to jump back in.' },
        end: {
          title: data.winner ? `${teamName(data.winner).toUpperCase()} TAKES THE MATCH` : 'MATCH OVER',
          text: data.winner === data.playerTeam ? 'Your team wins the yard.' : 'The yard belongs to the other side this time.',
        },
      }[mode];
      els.overlayTitle.textContent = copy.title;
      els.overlayCopy.textContent = copy.text;
      els.play.textContent = mode === 'start' ? 'Click to play' : mode === 'paused' ? 'Click to resume' : 'Play again';
      if (mode === 'end' && data.stats) {
        const s = data.stats;
        els.overlayStats.style.display = 'block';
        els.overlayStats.textContent = `Score ${data.scores.vanguard}–${data.scores.sentinel} · ${s.kills} kills · ${s.deaths} deaths · ${s.plants} plants · ${s.defuses} defuses · ${Math.round(s.damage)} damage`;
      } else {
        els.overlayStats.style.display = 'none';
      }
      els.overlay.hidden = false;
      els.play.focus();
    },
    hideOverlay() {
      els.overlay.hidden = true;
    },
    buildBuyMenu(onBuy) {
      const list = els.buyMenu.querySelector('.buy-list');
      const entries = [
        ...WEAPON_ORDER.filter((id) => id !== 'p9').map((id, i) => ({ key: String(i + 1), kind: 'weapon', id, label: WEAPONS[id].name, detail: `${WEAPONS[id].damage} dmg · ${WEAPONS[id].mag} rounds`, price: WEAPONS[id].price })),
        { key: '6', kind: 'armor', id: 'armor', label: 'Kevlar Armour', detail: 'Absorbs half of every hit', price: ARMOR_PRICE },
        { key: '7', kind: 'frag', id: 'frag', label: 'Frag Grenade', detail: 'Throw with G', price: FRAG_PRICE },
        { key: '8', kind: 'smoke', id: 'smoke', label: 'Smoke Grenade', detail: 'Throw with T, blocks sight', price: SMOKE_PRICE },
      ];
      for (const entry of entries) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.dataset.price = String(entry.price);
        button.innerHTML = `<span class="buy-key"></span><span class="buy-label"></span><span class="buy-detail"></span><span class="buy-price"></span>`;
        button.querySelector('.buy-key').textContent = entry.key;
        button.querySelector('.buy-label').textContent = entry.label;
        button.querySelector('.buy-detail').textContent = entry.detail;
        button.querySelector('.buy-price').textContent = `$${entry.price}`;
        button.addEventListener('click', () => onBuy(entry.kind, entry.id));
        list.appendChild(button);
      }
      return entries;
    },
    showBuy(show) {
      els.buyMenu.hidden = !show;
    },
    isBuyOpen() {
      return !els.buyMenu.hidden;
    },
    drawMinimap(player, bots, bomb, playerTeam, now) {
      drawMinimapBase();
      // The charge: a pulsing diamond where it lies, or on its carrier.
      if (bomb.state === 'planted' || bomb.state === 'dropped') {
        if (bomb.position) {
          const [x, z] = toMap(bomb.position.x, bomb.position.z);
          const pulse = 3 + Math.sin(now * 5) * 1.5;
          mapCtx.fillStyle = '#e5484d';
          mapCtx.save();
          mapCtx.translate(x, z);
          mapCtx.rotate(Math.PI / 4);
          mapCtx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
          mapCtx.restore();
        }
      }
      for (const bot of bots) {
        if (!bot.alive) continue;
        const pos = bot.body.group.position;
        const [x, z] = toMap(pos.x, pos.z);
        if (bot.team === playerTeam) {
          mapCtx.fillStyle = bot.team === TEAMS.VANGUARD ? '#f2a93b' : '#3fb8a6';
          mapCtx.beginPath();
          mapCtx.arc(x, z, 3.5, 0, Math.PI * 2);
          mapCtx.fill();
          if (bot.hasCharge) {
            mapCtx.fillStyle = '#e5484d';
            mapCtx.fillRect(x - 2, z - 2, 4, 4);
          }
        }
      }
      // The player: a wedge pointing where they look.
      const [px, pz] = toMap(player.position.x, player.position.z);
      mapCtx.save();
      mapCtx.translate(px, pz);
      mapCtx.rotate(-player.yaw);
      mapCtx.fillStyle = '#ece8dd';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4.5, 4.5);
      mapCtx.lineTo(-4.5, 4.5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
    onPlay(handler) {
      els.play.addEventListener('click', handler);
    },
  };
}
