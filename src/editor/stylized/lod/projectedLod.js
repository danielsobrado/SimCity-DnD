const LOD_ORDER = Object.freeze(['near', 'proxy', 'billboard', 'culled']);

function distance3(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

export function projectedPixelHeight({ camera, worldPosition, worldHeight, viewportHeight }) {
  if (!camera || !Number.isFinite(worldHeight) || worldHeight <= 0
      || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 0;
  }

  if (camera.isOrthographicCamera) {
    const verticalSpan = Math.abs(camera.top - camera.bottom) / Math.max(0.0001, camera.zoom ?? 1);
    return verticalSpan > 0 ? worldHeight * viewportHeight / verticalSpan : 0;
  }

  const distance = Math.max(0.001, distance3(camera.position, worldPosition));
  const fovRadians = (camera.fov ?? 60) * Math.PI / 180;
  const pixelsPerWorldUnit = viewportHeight / (2 * Math.tan(fovRadians / 2) * distance);
  return worldHeight * pixelsPerWorldUnit;
}

function thresholdForBand(band, thresholds) {
  if (band === 'near') return thresholds.nearPixels;
  if (band === 'proxy') return thresholds.proxyPixels;
  if (band === 'billboard') return thresholds.billboardPixels;
  return 0;
}

function baseBand(pixels, thresholds) {
  if (pixels >= thresholds.nearPixels) return 'near';
  if (pixels >= thresholds.proxyPixels) return 'proxy';
  if (pixels >= thresholds.billboardPixels) return 'billboard';
  return 'culled';
}

export function selectProjectedLod({ pixels, previous = null, hysteresisRatio = 0.15, ...thresholds }) {
  const next = baseBand(pixels, thresholds);
  if (!previous || previous === next || !LOD_ORDER.includes(previous)) return next;

  const previousIndex = LOD_ORDER.indexOf(previous);
  const nextIndex = LOD_ORDER.indexOf(next);
  if (nextIndex > previousIndex) {
    const threshold = thresholdForBand(previous, thresholds);
    return pixels >= threshold * (1 - hysteresisRatio) ? previous : next;
  }

  const threshold = thresholdForBand(next, thresholds);
  return pixels <= threshold * (1 + hysteresisRatio) ? previous : next;
}

export function clampLodToRadii({ band, chunkDistance, meshRadius, proxyRadius, billboardRadius }) {
  if (chunkDistance > billboardRadius) return 'culled';
  if (band === 'near' && chunkDistance > meshRadius) return chunkDistance <= proxyRadius ? 'proxy' : 'billboard';
  if (band === 'proxy' && chunkDistance > proxyRadius) return 'billboard';
  return band;
}
