// Every sound is synthesised with WebAudio: filtered noise bursts for gunfire,
// oscillators for beeps and stingers, a low sine drop for explosions. No audio
// files, no network. The context is created on the first user gesture; every call
// before that is a safe no-op. Volume falls with distance for world sounds.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  const listener = { x: 0, z: 0 };

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const length = ctx.sampleRate * 1;
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise({ duration, filterFreq, filterType = 'lowpass', gain, when = 0, q = 0.8 }) {
    if (!ctx) return;
    const start = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(start);
    source.stop(start + duration + 0.05);
  }

  function tone({ freq, endFreq = null, duration, gain, type = 'sine', when = 0 }) {
    if (!ctx) return;
    const start = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(amp).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  function distanceGain(x, z) {
    const dx = x - listener.x;
    const dz = z - listener.z;
    const dist = Math.hypot(dx, dz);
    return Math.max(0, 1 - dist / 55);
  }

  return {
    unlock() {
      ensure();
    },
    setListener(x, z) {
      listener.x = x;
      listener.z = z;
    },
    shot(kind, x = null, z = null) {
      if (!ensure()) return;
      const g = x === null ? 1 : 0.25 + distanceGain(x, z) * 0.75;
      if (g <= 0.02) return;
      const heavy = kind === 'shotgun' || kind === 'marksman';
      noise({ duration: heavy ? 0.22 : 0.13, filterFreq: heavy ? 900 : 1600, gain: 0.55 * g, q: 0.6 });
      noise({ duration: 0.05, filterFreq: 4200, filterType: 'highpass', gain: 0.22 * g });
      tone({ freq: heavy ? 120 : 170, endFreq: 55, duration: 0.12, gain: 0.3 * g, type: 'triangle' });
    },
    dryFire() {
      if (!ensure()) return;
      tone({ freq: 2200, duration: 0.03, gain: 0.12, type: 'square' });
    },
    reload() {
      if (!ensure()) return;
      tone({ freq: 900, duration: 0.04, gain: 0.14, type: 'square' });
      tone({ freq: 620, duration: 0.04, gain: 0.14, type: 'square', when: 0.28 });
      tone({ freq: 1250, duration: 0.05, gain: 0.18, type: 'square', when: 0.55 });
    },
    hit(kill) {
      if (!ensure()) return;
      tone({ freq: kill ? 1320 : 990, duration: 0.06, gain: 0.2, type: 'sine' });
      if (kill) tone({ freq: 1760, duration: 0.09, gain: 0.18, type: 'sine', when: 0.06 });
    },
    hurt() {
      if (!ensure()) return;
      tone({ freq: 140, endFreq: 70, duration: 0.16, gain: 0.3, type: 'sawtooth' });
    },
    explosion(x, z) {
      if (!ensure()) return;
      const g = 0.3 + distanceGain(x, z) * 0.7;
      noise({ duration: 1.1, filterFreq: 320, gain: 0.8 * g, q: 0.4 });
      tone({ freq: 90, endFreq: 28, duration: 0.9, gain: 0.7 * g });
      noise({ duration: 0.4, filterFreq: 2400, gain: 0.25 * g, when: 0.05 });
    },
    beep(rate = 1) {
      if (!ensure()) return;
      tone({ freq: 1560, duration: 0.07, gain: 0.16, type: 'square' });
      if (rate > 1.5) tone({ freq: 1560, duration: 0.07, gain: 0.12, type: 'square', when: 0.1 });
    },
    plant() {
      if (!ensure()) return;
      tone({ freq: 520, duration: 0.09, gain: 0.2, type: 'square' });
      tone({ freq: 780, duration: 0.12, gain: 0.2, type: 'square', when: 0.12 });
    },
    defuseTick() {
      if (!ensure()) return;
      tone({ freq: 880, duration: 0.04, gain: 0.1, type: 'sine' });
    },
    step(x, z) {
      if (!ensure()) return;
      const g = distanceGain(x, z);
      if (g <= 0.05) return;
      noise({ duration: 0.05, filterFreq: 500, gain: 0.1 * g });
    },
    buy() {
      if (!ensure()) return;
      tone({ freq: 1046, duration: 0.08, gain: 0.16 });
      tone({ freq: 1568, duration: 0.12, gain: 0.16, when: 0.07 });
    },
    denied() {
      if (!ensure()) return;
      tone({ freq: 220, duration: 0.12, gain: 0.18, type: 'square' });
    },
    roundWin() {
      if (!ensure()) return;
      tone({ freq: 523, duration: 0.14, gain: 0.2 });
      tone({ freq: 659, duration: 0.14, gain: 0.2, when: 0.12 });
      tone({ freq: 784, duration: 0.24, gain: 0.22, when: 0.24 });
    },
    roundLose() {
      if (!ensure()) return;
      tone({ freq: 392, duration: 0.16, gain: 0.2, type: 'triangle' });
      tone({ freq: 311, duration: 0.28, gain: 0.2, type: 'triangle', when: 0.14 });
    },
    smoke() {
      if (!ensure()) return;
      noise({ duration: 0.7, filterFreq: 700, gain: 0.25, q: 0.4 });
    },
    bounce(x, z) {
      if (!ensure()) return;
      const g = distanceGain(x, z);
      if (g <= 0.05) return;
      tone({ freq: 340, endFreq: 180, duration: 0.06, gain: 0.12 * g, type: 'triangle' });
    },
  };
}
