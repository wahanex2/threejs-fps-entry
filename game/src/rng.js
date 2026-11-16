// One seeded RNG for everything the game randomises, so ?shot= captures and replays
// are deterministic. The seed comes from the URL (?seed=N) and defaults to 1.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const random = mulberry32(seed);
  return {
    random,
    range(min, max) {
      return min + random() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + random() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(random() * list.length)];
    },
    chance(p) {
      return random() < p;
    },
  };
}
