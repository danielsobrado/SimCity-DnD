const TWO_PI = Math.PI * 2;

function normalizeAngle(value) {
  const result = value % TWO_PI;
  return result < 0 ? result + TWO_PI : result;
}

export function createCaptureDirections({ columns, rows, lowElevationDegrees, highElevationDegrees }) {
  const elevations = rows <= 1
    ? [lowElevationDegrees]
    : Array.from({ length: rows }, (_, index) => (
      lowElevationDegrees
      + (highElevationDegrees - lowElevationDegrees) * (index / (rows - 1))
    ));
  const directions = [];
  for (let row = 0; row < rows; row += 1) {
    const elevation = elevations[row] * Math.PI / 180;
    for (let column = 0; column < columns; column += 1) {
      const azimuth = column / columns * TWO_PI;
      directions.push(Object.freeze({
        row,
        column,
        frame: row * columns + column,
        azimuth,
        elevation,
        x: Math.sin(azimuth) * Math.cos(elevation),
        y: Math.sin(elevation),
        z: Math.cos(azimuth) * Math.cos(elevation),
      }));
    }
  }
  return Object.freeze(directions);
}

export function selectImpostorFrame({
  camera,
  placement,
  columns,
  rows,
  lowElevationDegrees,
  highElevationDegrees,
}) {
  const deltaX = camera.x - placement.x;
  const deltaY = camera.y - placement.height;
  const deltaZ = camera.z - placement.z;
  const horizontal = Math.max(0.0001, Math.hypot(deltaX, deltaZ));
  const localAzimuth = normalizeAngle(Math.atan2(deltaX, deltaZ) - placement.rotationY);
  const column = Math.round(localAzimuth / TWO_PI * columns) % columns;
  const elevationDegrees = Math.atan2(deltaY, horizontal) * 180 / Math.PI;
  let row = 0;
  if (rows > 1) {
    const normalized = (elevationDegrees - lowElevationDegrees)
      / Math.max(0.0001, highElevationDegrees - lowElevationDegrees);
    row = Math.max(0, Math.min(rows - 1, Math.round(normalized * (rows - 1))));
  }
  return row * columns + column;
}
