// Hitscan combat, shared by the player and the bots. Line of sight is a slab test
// of the segment against the world's colliders plus the smoke clouds, which is
// cheaper than raycasting meshes and allocates nothing. Player shots raycast the
// real meshes so head and torso hits are exact; bot shots test the player's body
// segment against the same segment test, so cover works the same way both ways.
import * as THREE from 'three';

// Slab test: distance from origin along dir to the nearest box face, or Infinity.
// dir must be normalised; maxDist caps the search.
export function rayBoxDistance(origin, dir, box, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const axes = ['x', 'y', 'z'];
  for (const axis of axes) {
    const o = origin[axis];
    const d = dir[axis];
    const lo = box.min[axis];
    const hi = box.max[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

export function segmentBlocked(from, to, colliders, clouds) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 1e-6) return false;
  dir.divideScalar(dist);
  for (const box of colliders) {
    const t = rayBoxDistance(from, dir, box, dist);
    if (t < dist - 0.05) return true;
  }
  if (clouds) {
    for (const cloud of clouds) {
      // Segment-sphere: closest approach of the segment to the cloud centre.
      const cx = cloud.center.x - from.x;
      const cy = cloud.center.y - from.y;
      const cz = cloud.center.z - from.z;
      const along = Math.max(0, Math.min(dist, cx * dir.x + cy * dir.y + cz * dir.z));
      const px = from.x + dir.x * along - cloud.center.x;
      const py = from.y + dir.y * along - cloud.center.y;
      const pz = from.z + dir.z * along - cloud.center.z;
      if (px * px + py * py + pz * pz < cloud.radius * cloud.radius) return true;
    }
  }
  return false;
}

export function createCombat(world, effects, rng) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const tmpDir = new THREE.Vector3();
  const tmpPoint = new THREE.Vector3();
  const ray = new THREE.Ray();
  const segA = new THREE.Vector3();
  const segB = new THREE.Vector3();

  return {
    // True when nothing solid and no smoke sits between two points.
    hasLineOfSight(from, to, clouds) {
      return !segmentBlocked(from, to, world.colliders, clouds);
    },

    // The player's shot: raycast world meshes and bot hitboxes, nearest hit wins.
    // Returns { hit, bot, part, point, distance } or { hit: false, point }.
    shootPlayer(origin, direction, botHitMeshes) {
      raycaster.set(origin, direction);
      const targets = world.shootables.concat(botHitMeshes);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length === 0) {
        tmpPoint.copy(origin).addScaledVector(direction, 90);
        return { hit: false, point: tmpPoint.clone(), distance: 90 };
      }
      const first = hits[0];
      const userData = first.object.userData;
      if (userData.bot) {
        return { hit: true, bot: userData.bot, part: userData.part, point: first.point.clone(), distance: first.distance };
      }
      return { hit: false, point: first.point.clone(), distance: first.distance, blocked: true };
    },

    // A bot's shot at the player: the player's body is a segment from feet to
    // head. A hit needs the ray to pass within body radius of the segment and to
    // reach the player before any wall. Head height decides head vs torso.
    shootAtPlayer(origin, direction, player, clouds) {
      ray.set(origin, direction);
      segA.set(player.position.x, player.position.y + 0.1, player.position.z);
      segB.set(player.position.x, player.position.y + player.height, player.position.z);
      const distSq = ray.distanceSqToSegment(segA, segB);
      if (distSq > 0.38 * 0.38) return { hit: false };
      const playerDist = tmpDir.subVectors(player.position, origin);
      playerDist.y += player.eye * 0.8;
      const along = playerDist.dot(direction);
      if (along <= 0) return { hit: false };
      for (const box of world.colliders) {
        const t = rayBoxDistance(origin, direction, box, along);
        if (t < along - 0.05) return { hit: false };
      }
      if (clouds && segmentBlocked(origin, tmpPoint.copy(player.position).setY(player.position.y + 1.2), [], clouds)) {
        return { hit: false };
      }
      // Closest point on the body segment decides the hit height.
      const closest = new THREE.Vector3();
      ray.distanceSqToSegment(segA, segB, null, closest);
      const head = closest.y > player.position.y + player.height - 0.38;
      return { hit: true, part: head ? 'head' : 'torso', distance: along };
    },

    // A bot's shot at another bot: raycast that bot's hit meshes only, and check
    // the ray reaches it before a wall.
    shootAtBot(origin, direction, targetBot, maxDist) {
      raycaster.set(origin, direction);
      raycaster.far = maxDist;
      const hits = raycaster.intersectObjects(targetBot.hitMeshes, false);
      if (hits.length === 0) return { hit: false };
      const first = hits[0];
      for (const box of world.colliders) {
        const t = rayBoxDistance(origin, direction, box, first.distance);
        if (t < first.distance - 0.05) return { hit: false };
      }
      return { hit: true, part: first.object.userData.part, distance: first.distance, point: first.point.clone() };
    },

    impact(point, colorHex, count = 6) {
      effects.burst(point, colorHex, count, 2.4, 0.45, rng);
    },
    blood(point) {
      effects.burst(point, '#b3232a', 9, 2.0, 0.5, rng);
    },
    tracer(from, to) {
      effects.tracer(from, to);
    },
    muzzle(point) {
      effects.muzzle(point);
    },
  };
}
