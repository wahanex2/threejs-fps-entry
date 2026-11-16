# Meridian Breach

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/wahanex2/threejs-fps-entry/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/wahanex2/threejs-fps-entry/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in the browser, built on three.js. Five attackers versus five defenders in a dusk container yard: plant the charge at Site A or Site B, or stop them. Money earned each round buys weapons, armour and grenades between rounds. Single-player against bots, with a fixed-step simulation, waypoint bot AI, and fully synthesised sound. No build step, no network requests.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Click to play: WASD to move, mouse to aim, click to fire, R to reload, Ctrl to crouch, E to plant/defuse, B for the buy menu, G for a frag grenade, T for smoke.

## Layout

- `game/` — the game: `index.html` plus ES modules under `src/`, with three.js 0.187.0 vendored under `game/vendor/three/`.
- `screenshots/` — captures of the game: start, live firefight, buy menu, match end.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.
