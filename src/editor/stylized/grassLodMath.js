export function clumpsPerCell(bladesPerCell, bladesPerClump) {
  if (!Number.isInteger(bladesPerCell) || bladesPerCell < 1) {
    throw new Error('bladesPerCell must be a positive integer.');
  }
  if (!Number.isInteger(bladesPerClump) || bladesPerClump < 1) {
    throw new Error('bladesPerClump must be a positive integer.');
  }
  return Math.ceil(bladesPerCell / bladesPerClump);
}

export function densityForDistance(distance, radius, farDensity) {
  if (radius <= 0 || distance <= 0) return 1;
  const amount = Math.min(1, distance / radius);
  return 1 + (farDensity - 1) * amount;
}

export function grassInstanceAttributeBytes({
  chunkSize,
  bladesPerCell,
  bladesPerClump,
  floatsPerInstance = 7,
}) {
  return chunkSize * chunkSize
    * clumpsPerCell(bladesPerCell, bladesPerClump)
    * floatsPerInstance
    * Float32Array.BYTES_PER_ELEMENT;
}
