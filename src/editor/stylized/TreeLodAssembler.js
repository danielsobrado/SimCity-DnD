import * as THREE from 'three/webgpu';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { hash32 } from './scatterMath.js';
import { aggregateCanopyCluster } from './lod/canopyCluster.js';
import { writeInstances } from './lod/StylizedLodRuntime.js';

function createInstances(count) {
  return Array.from({ length: count }, () => []);
}

function stableSeed(placement) {
  if (Number.isFinite(placement.priority)) return placement.priority;
  return hash32(placement.index ?? 0) / 0xffffffff;
}

function createMatrix({ x, y, z, rotationY = 0, scaleX = 1, scaleY = scaleX, scaleZ = scaleX }) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
    new THREE.Vector3(scaleX, scaleY, scaleZ),
  );
}

function recordBatchStats(statsByMode, stats) {
  const target = statsByMode[stats.mode];
  target.requested += stats.requested;
  target.accepted += stats.accepted;
  target.dropped += stats.dropped;
}

export function rebuildTreeLod({
  plan,
  rockSource,
  manifestStore,
  prototypeCount,
  prototypeWidth,
  prototypeHeight,
  impostorAtlases,
  impostorBatches,
  renderers,
  proxyRenderers,
  fallbackImpostorRenderers,
  clusterRenderers,
}) {
  PerfCounters.inc('treeRebuilds');
  const near = createInstances(prototypeCount);
  const proxy = createInstances(prototypeCount);
  const fallback = createInstances(prototypeCount);
  const clusters = [[]];
  const impostors = createInstances(prototypeCount);
  const active = new Set();
  const ordered = [...plan.entries].sort((left, right) => (
    left.chunkDistance - right.chunkDistance
    || left.chunkZ - right.chunkZ
    || left.chunkX - right.chunkX
  ));

  for (const entry of ordered) {
    const visible = entry.representations.some((value) => (
      value.band !== 'culled' && value.fade > 0
    ));
    if (!visible) continue;
    const key = `${entry.chunkX}:${entry.chunkZ}`;
    active.add(key);
    const placements = manifestStore.getOrSchedule(entry.chunkX, entry.chunkZ, rockSource);
    if (!placements) continue;

    for (const representation of entry.representations) {
      if (representation.band === 'culled' || representation.fade <= 0) continue;
      if (representation.band === 'cluster') {
        const cluster = aggregateCanopyCluster({
          chunkX: entry.chunkX,
          chunkZ: entry.chunkZ,
          placements,
          minimumWidth: prototypeWidth * 1.6,
          minimumHeight: prototypeHeight * 0.55,
        });
        if (cluster) {
          clusters[0].push({
            matrix: createMatrix({
              x: cluster.x,
              y: cluster.y,
              z: cluster.z,
              rotationY: cluster.seed * Math.PI * 2,
              scaleX: cluster.width,
              scaleY: cluster.height,
              scaleZ: cluster.depth,
            }),
            fade: representation.fade,
            seed: cluster.seed,
          });
        }
        continue;
      }

      for (const placement of placements) {
        const seed = stableSeed(placement);
        if (representation.band === 'impostor' && impostorBatches.length > 0) {
          const atlas = impostorAtlases[placement.prototypeIndex];
          const batch = impostorBatches[placement.prototypeIndex];
          if (atlas && batch) {
            impostors[placement.prototypeIndex].push({
              x: placement.x,
              y: placement.height + (atlas.centerY ?? atlas.height * 0.5) * placement.scale,
              z: placement.z,
              scale: placement.scale,
              radius: atlas.radius * placement.scale,
              yaw: placement.rotationY,
              fade: representation.fade,
              seed,
            });
            continue;
          }
        }

        const instance = {
          matrix: createMatrix({
            x: placement.x,
            y: placement.height,
            z: placement.z,
            rotationY: placement.rotationY,
            scaleX: placement.scale,
          }),
          fade: representation.fade,
          seed,
        };
        const target = representation.band === 'near'
          ? near
          : representation.band === 'proxy' ? proxy : fallback;
        target[placement.prototypeIndex].push(instance);
      }
    }
  }

  manifestStore.setActive(active);
  const nearCount = writeInstances(renderers, near);
  const proxyCount = writeInstances(proxyRenderers, proxy);
  const fallbackCount = writeInstances(fallbackImpostorRenderers, fallback);
  const clusterCount = writeInstances(clusterRenderers, clusters);
  let impostorCount = 0;
  const statsByMode = {
    cpu: { requested: 0, accepted: 0, dropped: 0 },
    gpu: { requested: 0, accepted: 0, dropped: 0 },
  };
  for (let index = 0; index < impostorBatches.length; index += 1) {
    const records = impostors[index] ?? [];
    const stats = impostorBatches[index].setRecords(records);
    recordBatchStats(statsByMode, stats);
    impostorCount += records.length;
  }
  for (const mode of ['cpu', 'gpu']) {
    PerfCounters.set(`treeImpostorRecordsRequested.${mode}`, statsByMode[mode].requested);
    PerfCounters.set(`treeImpostorRecordsAccepted.${mode}`, statsByMode[mode].accepted);
    PerfCounters.set(`treeImpostorRecordsDropped.${mode}`, statsByMode[mode].dropped);
  }
  PerfCounters.set('treeNearInstances', nearCount);
  PerfCounters.set('treeProxyInstances', proxyCount);
  PerfCounters.set('treeImpostorInstances', impostorCount);
  PerfCounters.set('treeFallbackImpostorInstances', fallbackCount);
  PerfCounters.set('treeCanopyClusters', clusterCount);
}
