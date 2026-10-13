// Day and evening moods for the residence viewer. Evening dims the sun to moonlight and adds one warm
// ceiling light per room; the lamps exist only at night, so daytime rendering pays nothing extra.
const MOODS = {
  day: { exposure: 1.18, env: 0.5, hemi: 1.65, sky: '#ffffff', ground: '#9a947b', sun: 3.3, sunColor: '#fff3de', fill: 1.2, shadow: 0.16 },
  night: { exposure: 1.05, env: 0.06, hemi: 0.28, sky: '#6d7f99', ground: '#1a2320', sun: 0.35, sunColor: '#9db3d8', fill: 0.1, shadow: 0.3 },
};
const LAMP_COLOR = '#ffcf94';
const LAMP_INTENSITY = 26;
const LAMP_HEIGHT = 2.35;
const MIN_ROOM_AREA = 3;

export function createLighting(THREE, { scene, renderer, hemi, sun, fill, ground }) {
  const lamps = new THREE.Group();
  scene.add(lamps);
  let mood = 'day';

  function clearLamps() {
    lamps.children.slice().forEach((light) => { lamps.remove(light); light.dispose(); });
  }

  function addLamps(rooms) {
    for (const room of rooms) {
      if (room.w * room.d < MIN_ROOM_AREA) continue;
      const light = new THREE.PointLight(LAMP_COLOR, LAMP_INTENSITY, Math.max(room.w, room.d) * 1.8, 2);
      light.position.set(room.x + room.w / 2, LAMP_HEIGHT, room.z + room.d / 2);
      lamps.add(light);
    }
  }

  function set(next, rooms) {
    mood = next;
    const m = MOODS[next];
    renderer.toneMappingExposure = m.exposure;
    scene.environmentIntensity = m.env;
    hemi.intensity = m.hemi;
    hemi.color.set(m.sky);
    hemi.groundColor.set(m.ground);
    sun.intensity = m.sun;
    sun.color.set(m.sunColor);
    fill.intensity = m.fill;
    ground.material.opacity = m.shadow;
    clearLamps();
    if (next === 'night') addLamps(rooms);
    renderer.shadowMap.needsUpdate = true;
  }

  return { set, rebuild: (rooms) => set(mood, rooms), get mood() { return mood; } };
}
