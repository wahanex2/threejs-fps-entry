// Every texture is painted on a 2D canvas at load: concrete, corrugated container
// steel, wood crates, hazard striping, site letters and the dusk sky. No image files,
// no network. All textures are created once and shared by every mesh that uses them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function canvasTexture(size, paint, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  paint(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

function speckle(ctx, size, count, colors, rng, alpha = 0.5) {
  for (let i = 0; i < count; i += 1) {
    const shade = colors[Math.floor(rng() * colors.length)];
    ctx.fillStyle = shade;
    ctx.globalAlpha = alpha * rng();
    const s = 1 + rng() * 3;
    ctx.fillRect(rng() * size, rng() * size, s, s);
  }
  ctx.globalAlpha = 1;
}

export function createTextures(rng) {
  const random = rng.random;

  const concrete = canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 2600, ['#464c54', '#32373e', '#4c525a'], random, 0.55);
    ctx.strokeStyle = 'rgba(20,22,26,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo((i * size) / 4, 0);
      ctx.lineTo((i * size) / 4, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (i * size) / 4);
      ctx.lineTo(size, (i * size) / 4);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(18,20,24,0.25)';
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 14 + random() * 26, 10 + random() * 18, random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 10, 8);

  function containerTexture(base, rib, rust) {
    return canvasTexture(256, (ctx, size) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, size, size);
      for (let x = 0; x < size; x += 16) {
        ctx.fillStyle = rib;
        ctx.fillRect(x, 0, 7, size);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x + 7, 0, 3, size);
      }
      speckle(ctx, size, 900, [rust, 'rgba(20,16,12,0.5)'], random, 0.5);
      ctx.fillStyle = 'rgba(236,232,221,0.75)';
      ctx.font = 'bold 26px ui-monospace, monospace';
      ctx.fillText('MRDN', 14, 44);
      ctx.font = '16px ui-monospace, monospace';
      ctx.fillText(`${100 + Math.floor(random() * 899)}-${Math.floor(random() * 90 + 10)}`, 14, 68);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, size - 6, size - 6);
    });
  }

  const containerA = containerTexture(PALETTE.containerA, '#b45f36', '#7a3a1e');
  const containerB = containerTexture(PALETTE.containerB, '#357d8c', '#1e4a56');
  const containerC = containerTexture(PALETTE.containerC, '#7a8a46', '#4a5728');

  const wood = canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = PALETTE.crateWood;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 42) {
      ctx.fillStyle = y % 84 === 0 ? '#7d5f3c' : '#937552';
      ctx.fillRect(0, y, size, 40);
      ctx.strokeStyle = 'rgba(40,28,14,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-2, y, size + 4, 40);
      for (let i = 0; i < 5; i += 1) {
        ctx.strokeStyle = 'rgba(60,44,24,0.35)';
        ctx.beginPath();
        const gy = y + 6 + random() * 28;
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(size * 0.3, gy + random() * 4 - 2, size * 0.6, gy + random() * 4 - 2, size, gy);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(30,22,12,0.7)';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, size - 8, size - 8);
    ctx.fillStyle = 'rgba(236,232,221,0.6)';
    ctx.font = 'bold 20px ui-monospace, monospace';
    ctx.fillText('FRAGILE', 78, 140);
  });

  const metalWall = canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = PALETTE.wall;
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 1400, ['#565d66', '#3e444c'], random, 0.5);
    ctx.strokeStyle = 'rgba(18,20,24,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, size - 4, size - 4);
    ctx.beginPath();
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(18,20,24,0.7)';
    for (const [x, y] of [[14, 14], [size - 14, 14], [14, size - 14], [size - 14, size - 14], [14, size / 2], [size - 14, size / 2]]) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 4, 2);

  function hazardTexture(letter, accent) {
    return canvasTexture(256, (ctx, size) => {
      ctx.fillStyle = 'rgba(16,18,22,0)';
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, size, size);
      ctx.clip();
      for (let x = -size; x < size * 2; x += 32) {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(x, size);
        ctx.lineTo(x + 16, size);
        ctx.lineTo(x + 16 + size, 0);
        ctx.lineTo(x + size, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(16,18,22,0.88)';
      ctx.fillRect(24, 24, size - 48, size - 48);
      ctx.fillStyle = accent;
      ctx.font = 'bold 120px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, size / 2, size / 2 + 6);
    });
  }

  const siteA = hazardTexture('A', PALETTE.vanguard);
  const siteB = hazardTexture('B', PALETTE.sentinel);

  const sky = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, '#27354f');
    gradient.addColorStop(0.78, '#8a4a2e');
    gradient.addColorStop(0.92, PALETTE.skyHorizon);
    gradient.addColorStop(1, '#3a2a24');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 512);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();

  return { concrete, containerA, containerB, containerC, wood, metalWall, siteA, siteB, sky };
}
