// The one state object. Every module reads and writes through this object; nothing
// keeps a second copy of match, round or player facts. Constants for the rules of
// the match live here too, so tuning never means hunting through modules.
export const TEAMS = {
  VANGUARD: 'vanguard',
  SENTINEL: 'sentinel',
};

export const PHASE = {
  MENU: 'menu',
  FREEZE: 'freeze',
  LIVE: 'live',
  ROUND_END: 'round_end',
  MATCH_END: 'match_end',
};

export const RULES = {
  teamSize: 5,
  roundsToWin: 5,
  halftimeAfter: 4,
  roundTime: 100,
  freezeTime: 5,
  roundEndTime: 4,
  bombTime: 35,
  plantTime: 3.2,
  defuseTime: 5,
  startMoney: 800,
  killReward: 300,
  winReward: 1400,
  plantBonus: 300,
  lossBase: 1400,
  lossStreakBonus: 500,
  lossStreakMax: 2000,
  maxMoney: 16000,
  playerStartHealth: 100,
};

export function createState() {
  return {
    phase: PHASE.MENU,
    time: 0,
    round: 1,
    scores: { vanguard: 0, sentinel: 0 },
    lossStreak: { vanguard: 0, sentinel: 0 },
    playerTeam: TEAMS.VANGUARD,
    swapped: false,
    phaseLeft: 0,
    roundClock: RULES.roundTime,
    bomb: {
      state: 'carried', // carried | dropped | planted | exploded | defused
      carrier: null, // 'player' or a bot id
      position: null, // Vector3 when dropped/planted
      plantedAt: null, // site id
      timer: 0,
      site: null,
    },
    channel: null, // { kind: 'plant'|'defuse', who, progress, site }
    kills: [],
    roundKills: { player: 0 },
    money: RULES.startMoney,
    stats: { kills: 0, deaths: 0, plants: 0, defuses: 0, damage: 0, roundsWon: 0 },
    winner: null,
    winReason: '',
    banner: '',
    bannerUntil: 0,
    shake: 0,
    hitDirection: 0,
    hitDirectionUntil: 0,
  };
}

// The match is over when a team reaches the win target, or after the last possible
// round (both teams at roundsToWin - 1 plays one deciding round).
export function matchOver(state) {
  return (
    state.scores.vanguard >= RULES.roundsToWin ||
    state.scores.sentinel >= RULES.roundsToWin
  );
}

export function otherTeam(team) {
  return team === TEAMS.VANGUARD ? TEAMS.SENTINEL : TEAMS.VANGUARD;
}

export function teamName(team) {
  return team === TEAMS.VANGUARD ? 'Vanguard' : 'Sentinel';
}
