import * as THREE from 'three/webgpu';
import { mixSeed } from './ProceduralRandom.js';

function random01(seed, index) {
  return (mixSeed(seed, index) & 0xffff) / 0xffff;
}

function createSkyTexture() {
  const data = new Uint8Array(4 * 256 * 4);
  const zenith = new THREE.Color('#76b8ef');
  const horizon = new THREE.Color('#d9edcf');
  const ground = new THREE.Color('#8eb276');
  const color = new THREE.Color();
  for (let y = 0; y < 256; y += 1) {
    const vertical = 1 - y / 255;
    const skyMix = THREE.MathUtils.smoothstep(vertical, 0.08, 0.76);
    color.copy(zenith).lerp(horizon, skyMix);
    if (vertical > 0.78) {
      color.lerp(ground, THREE.MathUtils.smoothstep(vertical, 0.78, 1));
    }
    for (let x = 0; x < 4; x += 1) {
      const index = (y * 4 + x) * 4;
      data[index] = Math.round(color.r * 255);
      data[index + 1] = Math.round(color.g * 255);
      data[index + 2] = Math.round(color.b * 255);
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, 4, 256, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createMeadow() {
  const geometry = new THREE.CircleGeometry(29, 96, 0, Math.PI * 2);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const radius = Math.hypot(x, z);
    const waves = Math.sin(x * 0.33) * 0.16 + Math.cos(z * 0.27) * 0.13;
    positions.setY(index, waves + Math.max(0, radius - 13) * 0.045);
    const noise = random01(9147, index);
    color.set('#74a84f').lerp(new THREE.Color('#9bc765'), noise * 0.34);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });
  const meadow = new THREE.Mesh(geometry, material);
  meadow.position.y = -0.06;
  meadow.receiveShadow = true;
  return meadow;
}

function addTree(group, seed, angle, radius) {
  const random = (index) => random01(seed, index);
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  const trunkHeight = 1.8 + random(1) * 1.9;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.2, trunkHeight, 7),
    new THREE.MeshStandardMaterial({ color: '#705036', roughness: 1 }),
  );
  trunk.position.set(x, trunkHeight / 2, z);
  trunk.castShadow = true;
  group.add(trunk);

  const crownMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4e873e').lerp(new THREE.Color('#80b85b'), random(2) * 0.55),
    roughness: 0.94,
  });
  const clusters = 3 + Math.round(random(3) * 2);
  for (let index = 0; index < clusters; index += 1) {
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.95 + random(10 + index) * 0.55, 1),
      crownMaterial,
    );
    crown.scale.set(1, 0.92 + random(20 + index) * 0.48, 1);
    crown.position.set(
      x + (random(30 + index) - 0.5) * 1.2,
      trunkHeight + 0.55 + random(40 + index) * 1.25,
      z + (random(50 + index) - 0.5) * 1.2,
    );
    crown.rotation.y = random(60 + index) * Math.PI;
    crown.castShadow = true;
    crown.receiveShadow = true;
    group.add(crown);
  }
}

function addRock(group, seed, angle, radius) {
  const size = 0.45 + random01(seed, 1) * 0.95;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(size, 0),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#827f6d').lerp(new THREE.Color('#afa786'), random01(seed, 2) * 0.45),
      roughness: 0.98,
    }),
  );
  rock.scale.set(1.35, 0.66 + random01(seed, 3) * 0.36, 0.95);
  rock.position.set(Math.sin(angle) * radius, size * 0.43, Math.cos(angle) * radius);
  rock.rotation.set(random01(seed, 4) * 0.25, random01(seed, 5) * Math.PI, 0);
  rock.castShadow = true;
  rock.receiveShadow = true;
  group.add(rock);
}

function createBoundary() {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-8, 0.015, -8),
    new THREE.Vector3(8, 0.015, -8),
    new THREE.Vector3(8, 0.015, 8),
    new THREE.Vector3(-8, 0.015, 8),
    new THREE.Vector3(-8, 0.015, -8),
  ]);
  return new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: '#f7e7a7',
      transparent: true,
      opacity: 0.34,
    }),
  );
}

export function createWorkshopStage(scene) {
  const group = new THREE.Group();
  group.name = 'workshop-stage';
  scene.add(group);
  scene.background = createSkyTexture();
  scene.fog = new THREE.Fog('#b8d6b1', 40, 82);

  group.add(createMeadow(), createBoundary());
  for (let index = 0; index < 14; index += 1) {
    const angle = index / 14 * Math.PI * 2 + random01(1229, index) * 0.22;
    addTree(group, 2400 + index, angle, 13.5 + random01(1811, index) * 8);
  }
  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2 + 0.3;
    addRock(group, 3900 + index, angle, 8.8 + random01(2917, index) * 3.2);
  }

  const hemisphere = new THREE.HemisphereLight('#d8ecff', '#5f7047', 2.15);
  group.add(hemisphere);

  const sun = new THREE.DirectionalLight('#fff1bf', 4.2);
  sun.position.set(-10, 18, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -17;
  sun.shadow.camera.right = 17;
  sun.shadow.camera.top = 17;
  sun.shadow.camera.bottom = -17;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 55;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2.25;
  sun.target.position.set(0, 3, 0);
  group.add(sun, sun.target);

  const fill = new THREE.DirectionalLight('#9bc7ff', 0.85);
  fill.position.set(10, 7, -10);
  group.add(fill);

  return {
    group,
    dispose() {
      scene.background?.dispose?.();
      scene.background = null;
      scene.fog = null;
      group.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material?.dispose?.();
        }
      });
      group.removeFromParent();
    },
  };
}
