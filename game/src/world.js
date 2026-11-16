// Meridian Yard: an original container port at dusk. Three lanes run south to north:
// the west lane to Site A, mid with a double-door wall, and the east lane to Site B.
// Connector corridors link mid to both sites. Everything is axis-aligned boxes, so
// every wall is both a visible mesh and an exact Box3 collider, and the waypoint
// graph below is drawn on the open ground between them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createTextures } from './textures.js';

const WALL_H = 4;

export function createWorld(scene, rng) {
  const textures = createTextures(rng);
  const group = new THREE.Group();
  scene.add(group);

  const materials = {
    concrete: new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.95, metalness: 0.02 }),
    wall: new THREE.MeshStandardMaterial({ map: textures.metalWall, roughness: 0.8, metalness: 0.25 }),
    containerA: new THREE.MeshStandardMaterial({ map: textures.containerA, roughness: 0.75, metalness: 0.3 }),
    containerB: new THREE.MeshStandardMaterial({ map: textures.containerB, roughness: 0.75, metalness: 0.3 }),
    containerC: new THREE.MeshStandardMaterial({ map: textures.containerC, roughness: 0.75, metalness: 0.3 }),
    wood: new THREE.MeshStandardMaterial({ map: textures.wood, roughness: 0.85, metalness: 0.02 }),
    dark: new THREE.MeshStandardMaterial({ color: new THREE.Color('#232830'), roughness: 0.9, metalness: 0.1 }),
    lampA: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.vanguard), emissive: new THREE.Color(PALETTE.vanguard), emissiveIntensity: 2.2 }),
    lampB: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sentinel), emissive: new THREE.Color(PALETTE.sentinel), emissiveIntensity: 2.2 }),
  };

  const colliders = [];
  const shootables = [];
  const minimap = [];

  function box(w, h, d, x, y, z, material, collide = true, mapShade = null) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    if (mapShade) minimap.push({ x, z, w, d, shade: mapShade });
    return mesh;
  }

  // Ground: the yard slab, plus a dark apron stretching to the skyline.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64.8, 48.8), materials.concrete);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), materials.dark);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.06;
  group.add(apron);
  colliders.push(new THREE.Box3(new THREE.Vector3(-32.4, -0.4, -24.4), new THREE.Vector3(32.4, 0, 24.4)));

  // Perimeter walls.
  box(65.6, WALL_H + 0.6, 0.8, 0, 2.3, -24.4, 'wall', true, 'wall');
  box(65.6, WALL_H + 0.6, 0.8, 0, 2.3, 24.4, 'wall', true, 'wall');
  box(0.8, WALL_H + 0.6, 49.6, -32.4, 2.3, 0, 'wall', true, 'wall');
  box(0.8, WALL_H + 0.6, 49.6, 32.4, 2.3, 0, 'wall', true, 'wall');

  // Mid side walls (x = +/-6), with the connector gap at z in [-8, -4].
  box(0.8, WALL_H, 18, -6, 2, 5, 'wall', true, 'wall');
  box(0.8, WALL_H, 4, -6, 2, -10, 'wall', true, 'wall');
  box(0.8, WALL_H, 18, 6, 2, 5, 'wall', true, 'wall');
  box(0.8, WALL_H, 4, 6, 2, -10, 'wall', true, 'wall');

  // Double-door wall across mid at z = 2: two gaps, x in [-3,-1] and [1,3].
  box(3, WALL_H, 0.8, -4.5, 2, 2, 'wall', true, 'wall');
  box(2, WALL_H, 0.8, 0, 2, 2, 'wall', true, 'wall');
  box(3, WALL_H, 0.8, 4.5, 2, 2, 'wall', true, 'wall');

  // Lane dividers (x = +/-14) with the spawn-side gap at z in [12, 16].
  box(0.8, WALL_H, 6, -14, 2, 19, 'wall', true, 'wall');
  box(0.8, WALL_H, 14, -14, 2, 5, 'wall', true, 'wall');
  box(0.8, WALL_H, 6, 14, 2, 19, 'wall', true, 'wall');
  box(0.8, WALL_H, 14, 14, 2, 5, 'wall', true, 'wall');

  // North wall (z = -16) with a defender gap to each site, x in [-24,-16] and [16,24].
  box(8, WALL_H, 0.8, -28, 2, -16, 'wall', true, 'wall');
  box(8, WALL_H, 0.8, -12, 2, -16, 'wall', true, 'wall');
  box(8, WALL_H, 0.8, 12, 2, -16, 'wall', true, 'wall');
  box(8, WALL_H, 0.8, 28, 2, -16, 'wall', true, 'wall');

  // Site south walls (z = -8): each site is entered from the south through one gap.
  box(10, WALL_H, 0.8, -27, 2, -8, 'wall', true, 'wall');
  box(10, WALL_H, 0.8, 27, 2, -8, 'wall', true, 'wall');

  // Containers, crates and low walls: the cover the fights are fought around.
  function container(x, z, alongX, material) {
    const w = alongX ? 6 : 2.4;
    const d = alongX ? 2.4 : 6;
    box(w, 2.6, d, x, 1.3, z, material, true, 'box');
  }
  function crate(x, z, size = 1.2, y = null) {
    box(size, size, size, x, y === null ? size / 2 : y, z, 'wood', true, 'box');
  }
  function lowWall(w, d, x, z) {
    box(w, 1.1, d, x, 0.55, z, 'wall', true, 'box');
  }

  // Site A cover.
  container(-25, -13, true, 'containerA');
  container(-21, -16.5, false, 'containerB');
  crate(-27, -10.5);
  crate(-25.6, -10.5);
  crate(-26.3, -10.5, 1.2, 1.8);
  lowWall(4, 0.6, -24, -9);
  // Site B cover, mirrored.
  container(25, -13, true, 'containerB');
  container(21, -16.5, false, 'containerA');
  crate(27, -10.5);
  crate(25.6, -10.5);
  crate(26.3, -10.5, 1.2, 1.8);
  lowWall(4, 0.6, 24, -9);
  // Mid cover. The mid-top crates flank the M5 waypoint; nothing sits on a node.
  crate(-2, -1);
  crate(3, 4.5);
  crate(2.9, 5.6, 0.9);
  lowWall(3, 0.6, 2.5, 10.5);
  crate(-2.5, -10);
  crate(2.5, -10);
  // Lane cover.
  crate(-24.5, 6);
  crate(-17, 17);
  container(-29, -2, false, 'containerC');
  lowWall(0.6, 4, -27.5, -4);
  crate(24.5, 6);
  crate(17, 17);
  container(29, -2, false, 'containerA');
  lowWall(0.6, 4, 27.5, -4);
  // Connector cover.
  crate(-10, -6);
  crate(10, -6);
  // Spawn cover.
  crate(-4, 17);
  crate(4, 17);
  crate(-6, -20);
  crate(6, -20);
  // Stacked containers: tall blockers on the outer lanes.
  box(6, 2.6, 2.4, -29, 1.3, 10, 'containerB', true, 'box');
  box(6, 2.6, 2.4, -29, 3.9, 10, 'containerA', true, 'box');
  box(6, 2.6, 2.4, 29, 1.3, 10, 'containerA', true, 'box');
  box(6, 2.6, 2.4, 29, 3.9, 10, 'containerC', true, 'box');

  // Site decals: painted ground markers with the site letter, plus glowing corner posts.
  function siteDecal(site, texture, lampMaterial) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.center.x, 0.03, site.center.z);
    group.add(decal);
    for (const [dx, dz] of [[-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2], [4.2, 4.2]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 0.18), lampMaterial);
      post.position.set(site.center.x + dx, 0.75, site.center.z + dz);
      group.add(post);
    }
  }

  const sites = [
    { id: 'A', center: new THREE.Vector3(-23.5, 0, -13.5), zone: { minX: -28, maxX: -19, minZ: -18, maxZ: -9 } },
    { id: 'B', center: new THREE.Vector3(23.5, 0, -13.5), zone: { minX: 19, maxX: 28, minZ: -18, maxZ: -9 } },
  ];
  siteDecal(sites[0], textures.siteA, materials.lampA);
  siteDecal(sites[1], textures.siteB, materials.lampB);

  // Floodlight poles: dark masts with a glowing head. Two real point lights, at the sites.
  function floodlight(x, z, lampMaterial) {
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.25, 7, 0.25), materials.dark);
    mast.position.set(x, 3.5, z);
    mast.castShadow = true;
    group.add(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.5), lampMaterial);
    head.position.set(x, 7, z);
    group.add(head);
  }
  floodlight(-30, -20, materials.lampA);
  floodlight(30, -20, materials.lampB);
  floodlight(-30, 22, materials.lampA);
  floodlight(30, 22, materials.lampB);

  // Skyline silhouettes outside the walls: warehouses and a crane.
  const skyline = [[-44, -14, 12, 18], [-44, 8, 10, 12], [44, -10, 12, 22], [44, 12, 10, 14], [-16, -38, 20, 14], [18, -38, 16, 18], [0, 38, 24, 10]];
  for (const [x, z, w, h] of skyline) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, 8), materials.dark);
    block.position.set(x, h / 2 - 0.5, z);
    group.add(block);
  }
  const craneMast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 26, 1.2), materials.dark);
  craneMast.position.set(-40, 12, -30);
  const craneJib = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 1), materials.dark);
  craneJib.position.set(-32, 24, -30);
  group.add(craneMast, craneJib);

  // Sky dome: a vertical dusk gradient wrapped around the yard.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(140, 24, 16),
    new THREE.MeshBasicMaterial({ map: textures.sky, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Light: a low warm sun from the west, cool sky fill, and a lamp glow on each site.
  scene.fog = new THREE.Fog(new THREE.Color('#4a3428'), 45, 120);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#5a6b8a'), new THREE.Color('#2a241e'), 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb469'), 2.4);
  sun.position.set(-38, 26, 18);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d90b5'), 0.5);
  fill.position.set(24, 18, -20);
  scene.add(fill);
  const lampA = new THREE.PointLight(new THREE.Color(PALETTE.vanguard), 26, 20, 2);
  lampA.position.set(-23.5, 4.5, -13.5);
  scene.add(lampA);
  const lampB = new THREE.PointLight(new THREE.Color(PALETTE.sentinel), 26, 20, 2);
  lampB.position.set(23.5, 4.5, -13.5);
  scene.add(lampB);

  // Waypoint graph: nodes on open ground, edges that never cross a wall. Bots run
  // breadth-first search over it. Hold nodes are where defenders wait out a round.
  const nodes = {
    S0: [0, 20], M0: [0, 14], M1: [0, 8], M2: [-2, 2], M2b: [2, 2], M3: [0, -2], M4: [0, -6], M5: [0, -10], M6: [0, -14],
    W0: [-10, 16], W1: [-20, 14], W2: [-26, 8], W3: [-26, 0], W4: [-24, -5], W5: [-18, -6], W6: [-19.5, -12],
    E0: [10, 16], E1: [20, 14], E2: [26, 8], E3: [26, 0], E4: [24, -5], E5: [18, -6], E6: [19.5, -12],
    C0: [-10, -7.5], C1: [10, -7.5],
    D0: [0, -20], D1: [-4, -18], D2: [4, -18], D3: [-18, -17], D4: [18, -17],
  };
  const edges = [
    ['S0', 'M0'], ['M0', 'M1'], ['M1', 'M2'], ['M1', 'M2b'], ['M2', 'M3'], ['M2b', 'M3'],
    ['M3', 'M4'], ['M4', 'M5'], ['M4', 'C0'], ['M4', 'C1'], ['M5', 'M6'], ['M6', 'D0'],
    ['M6', 'D1'], ['M6', 'D2'], ['D0', 'D1'], ['D0', 'D2'], ['D1', 'D3'], ['D2', 'D4'],
    ['S0', 'W0'], ['W0', 'W1'], ['W1', 'W2'], ['W2', 'W3'], ['W3', 'W4'], ['W4', 'W5'],
    ['W5', 'W6'], ['W5', 'C0'], ['C0', 'W4'], ['W6', 'D3'],
    ['S0', 'E0'], ['E0', 'E1'], ['E1', 'E2'], ['E2', 'E3'], ['E3', 'E4'], ['E4', 'E5'],
    ['E5', 'E6'], ['E5', 'C1'], ['C1', 'E4'], ['E6', 'D4'],
  ];
  const graph = new Map();
  for (const name of Object.keys(nodes)) graph.set(name, []);
  for (const [a, b] of edges) {
    graph.get(a).push(b);
    graph.get(b).push(a);
  }

  const spawns = {
    vanguard: [[-4, 21], [-2, 19], [0, 21], [2, 19], [4, 21]],
    sentinel: [[-4, -21], [-2, -19], [0, -21], [2, -19], [4, -21]],
  };

  return {
    colliders,
    shootables,
    sites,
    graph,
    nodes,
    spawns,
    minimap,
    group,
    textures,
    inZone(point, site) {
      const z = site.zone;
      return point.x >= z.minX && point.x <= z.maxX && point.z >= z.minZ && point.z <= z.maxZ;
    },
    siteAt(point) {
      for (const site of sites) {
        const z = site.zone;
        if (point.x >= z.minX && point.x <= z.maxX && point.z >= z.minZ && point.z <= z.maxZ) return site;
      }
      return null;
    },
  };
}

// Breadth-first search over the waypoint graph. Returns node names from start to
// goal, or an empty list when no route exists. Pure function, no allocation churn
// beyond the small path arrays a bot keeps while it walks.
export function findPath(graph, start, goal) {
  if (start === goal) return [start];
  const cameFrom = new Map([[start, null]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const next of graph.get(current) ?? []) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, current);
      if (next === goal) {
        const path = [next];
        let node = current;
        while (node !== null) {
          path.push(node);
          node = cameFrom.get(node);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return [];
}

export function nearestNode(nodes, x, z) {
  let best = null;
  let bestDist = Infinity;
  for (const [name, [nx, nz]] of Object.entries(nodes)) {
    const d = (nx - x) * (nx - x) + (nz - z) * (nz - z);
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}
