// First-person walkthrough at eye level: drag to look, tap the floor or use WASD / arrow keys to move.
// A short raycast against the walls stops movement, so visitors cannot pass through them; door
// leaves are excluded from that list by the caller, so open doorways stay walkable.
const EYE_HEIGHT = 1.6;
const PROBE_HEIGHT = 1.0;
const SPEED = 1.5;          // metres per second
const TURN_SPEED = 1.8;     // radians per second for the arrow keys
const BODY_RADIUS = 0.3;
const LOOK_SPEED = 0.0042;  // radians per dragged pixel
const PITCH_LIMIT = 1.25;
const ARRIVE_DISTANCE = 0.12;
const TAP_TOLERANCE = 5;

const KEY_ACTIONS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', KeyD: 'right',
  ArrowLeft: 'turnLeft', ArrowRight: 'turnRight',
};

export function createWalk(THREE, { camera, canvas, walls, floorTargets, onMove }) {
  const state = { active: false, yaw: 0, pitch: 0, target: null };
  const keys = new Set();
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag = null;

  function applyRotation() {
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  }

  function enter(position, yaw) {
    state.active = true;
    state.yaw = yaw;
    state.pitch = -0.08;
    state.target = null;
    camera.position.set(position.x, EYE_HEIGHT, position.z);
    applyRotation();
  }

  function exit() {
    state.active = false;
    state.target = null;
    keys.clear();
    drag = null;
  }

  function wallAhead(direction, distance) {
    ray.set(new THREE.Vector3(camera.position.x, PROBE_HEIGHT, camera.position.z), direction);
    ray.near = 0;
    ray.far = distance + BODY_RADIUS;
    return ray.intersectObjects(walls(), false).length > 0;
  }

  function step(direction, distance) {
    if (wallAhead(direction, distance)) return false;
    camera.position.addScaledVector(direction, distance);
    onMove(camera.position);
    return true;
  }

  function update(dt) {
    if (!state.active) return;
    if (keys.has('turnLeft')) state.yaw += TURN_SPEED * dt;
    if (keys.has('turnRight')) state.yaw -= TURN_SPEED * dt;

    const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const move = new THREE.Vector3();
    if (keys.has('forward')) move.add(forward);
    if (keys.has('back')) move.sub(forward);
    if (keys.has('right')) move.add(right);
    if (keys.has('left')) move.sub(right);

    if (move.lengthSq() > 0) {
      state.target = null;
      step(move.normalize(), SPEED * dt);
    } else if (state.target) {
      const toTarget = new THREE.Vector3(state.target.x - camera.position.x, 0, state.target.z - camera.position.z);
      const remaining = toTarget.length();
      if (remaining < ARRIVE_DISTANCE || !step(toTarget.normalize(), Math.min(remaining, SPEED * dt))) state.target = null;
    }
    applyRotation();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!state.active) return;
    drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!state.active || !drag) return;
    state.yaw += (event.clientX - drag.x) * LOOK_SPEED;
    state.pitch = THREE.MathUtils.clamp(state.pitch + (event.clientY - drag.y) * LOOK_SPEED, -PITCH_LIMIT, PITCH_LIMIT);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!state.active || !drag) return;
    const isTap = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= TAP_TOLERANCE;
    drag = null;
    if (!isTap) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(pointer, camera);
    ray.near = 0;
    ray.far = 60;
    const hit = ray.intersectObjects(floorTargets(), false)[0];
    if (hit) state.target = hit.point.clone();
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });

  window.addEventListener('keydown', (event) => {
    if (!state.active) return;
    const action = KEY_ACTIONS[event.code];
    if (!action || event.target.closest?.('input, select, textarea')) return;
    keys.add(action);
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const action = KEY_ACTIONS[event.code];
    if (action) keys.delete(action);
  });
  window.addEventListener('blur', () => keys.clear());

  return { state, enter, exit, update };
}
