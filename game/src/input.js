// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only. The module reports held keys, accumulated look deltas, and
// edge-triggered actions (pressed this frame), so the simulation never reads a
// stale key event. Firing and aiming are held states; everything else is an edge.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = {
    keys,
    pressed,
    locked: false,
    firing: false,
    aiming: false,
    lookX: 0,
    lookY: 0,
    lockFailed: false,
  };

  function setKey(event, down) {
    if (['Space', 'Tab', 'KeyB', 'KeyE'].includes(event.code)) event.preventDefault();
    if (down && !keys.has(event.code)) pressed.add(event.code);
    if (down) keys.add(event.code);
    else keys.delete(event.code);
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
    state.firing = false;
    state.aiming = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => {
    if (state.locked) event.preventDefault();
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      pressed.clear();
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  });
  document.addEventListener('pointerlockerror', () => {
    state.lockFailed = true;
    onLockChange(false);
  });

  return {
    state,
    requestLock() {
      state.lockFailed = false;
      try {
        const result = canvas.requestPointerLock();
        if (result && typeof result.catch === 'function') {
          result.catch(() => {
            state.lockFailed = true;
            onLockChange(false);
          });
        }
      } catch {
        state.lockFailed = true;
        onLockChange(false);
      }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    endFrame() {
      pressed.clear();
    },
  };
}
