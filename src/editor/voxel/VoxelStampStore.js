export const VOXEL_STAMP_OPERATIONS = Object.freeze(['add', 'subtract', 'smooth']);
export const VOXEL_STAMP_OPERATION_CODES = Object.freeze({
  add: 0,
  subtract: 1,
  smooth: 2,
});

function cloneStamp(stamp) {
  return Object.freeze({
    id: stamp.id,
    operation: stamp.operation,
    center: Object.freeze([...stamp.center]),
    radius: stamp.radius,
    strength: stamp.strength,
    smoothness: stamp.smoothness,
  });
}

function assertFinite(value, fieldName) {
  if (!Number.isFinite(value)) {
    throw new Error(`Voxel stamp ${fieldName} must be finite.`);
  }
}

function assertUnitInterval(value, fieldName) {
  assertFinite(value, fieldName);
  if (value < 0 || value > 1) {
    throw new Error(`Voxel stamp ${fieldName} must be within [0, 1].`);
  }
}

export class VoxelStampStore {
  constructor({ cells, maxStamps }) {
    if (!Array.isArray(cells)
        || cells.length !== 3
        || cells.some((value) => !Number.isInteger(value) || value < 1)) {
      throw new Error('Voxel stamp store requires three positive cell dimensions.');
    }
    if (!Number.isInteger(maxStamps) || maxStamps < 1) {
      throw new Error('Voxel stamp store maxStamps must be a positive integer.');
    }

    this.cells = Object.freeze([...cells]);
    this.maxStamps = maxStamps;
    this.stamps = [];
    this.nextId = 1;
    this.listeners = new Set();
  }

  get size() {
    return this.stamps.length;
  }

  list() {
    return this.stamps.map(cloneStamp);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  add(input) {
    if (this.stamps.length >= this.maxStamps) {
      throw new Error(`Voxel stamp capacity is ${this.maxStamps}.`);
    }

    const stamp = this.normalizeStamp({ ...input, id: this.nextId });
    this.nextId += 1;
    this.stamps.push(stamp);
    this.emit();
    return cloneStamp(stamp);
  }

  clear() {
    const before = this.list();
    if (before.length === 0) {
      return before;
    }
    this.stamps = [];
    this.emit();
    return before;
  }

  replaceAll(values) {
    if (!Array.isArray(values)) {
      throw new Error('Voxel stamp document must be an array.');
    }
    if (values.length > this.maxStamps) {
      throw new Error(`Voxel stamp document exceeds capacity ${this.maxStamps}.`);
    }

    const ids = new Set();
    const stamps = values.map((value) => {
      const stamp = this.normalizeStamp(value);
      if (ids.has(stamp.id)) {
        throw new Error(`Voxel stamp ID ${stamp.id} is duplicated.`);
      }
      ids.add(stamp.id);
      return stamp;
    });

    this.stamps = stamps;
    this.nextId = stamps.reduce((maximum, stamp) => Math.max(maximum, stamp.id), 0) + 1;
    this.emit();
  }

  applyChange(change, direction) {
    const target = direction === 'undo' ? change.before : change.after;
    const inverse = direction === 'undo' ? change.after : change.before;

    if (inverse) {
      const index = this.stamps.findIndex((stamp) => stamp.id === inverse.id);
      if (index >= 0) {
        this.stamps.splice(index, 1);
      }
    }

    if (target) {
      const restored = this.normalizeStamp(target);
      if (this.stamps.some((stamp) => stamp.id === restored.id)) {
        throw new Error(`Voxel stamp ID ${restored.id} already exists.`);
      }
      this.stamps.push(restored);
      this.stamps.sort((left, right) => left.id - right.id);
      this.nextId = Math.max(this.nextId, restored.id + 1);
    }

    this.emit();
  }

  toDocument() {
    return this.list().map((stamp) => ({
      id: stamp.id,
      operation: stamp.operation,
      center: [...stamp.center],
      radius: stamp.radius,
      strength: stamp.strength,
      smoothness: stamp.smoothness,
    }));
  }

  loadDocument(document) {
    this.replaceAll(document ?? []);
  }

  normalizeStamp(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Voxel stamp must be an object.');
    }
    if (!Number.isInteger(value.id) || value.id < 1) {
      throw new Error('Voxel stamp id must be a positive integer.');
    }
    if (!VOXEL_STAMP_OPERATIONS.includes(value.operation)) {
      throw new Error(`Unknown voxel stamp operation: ${value.operation}.`);
    }
    if (!Array.isArray(value.center) || value.center.length !== 3) {
      throw new Error('Voxel stamp center must contain three coordinates.');
    }

    const center = value.center.map((coordinate, axis) => {
      assertFinite(coordinate, `center[${axis}]`);
      if (coordinate < 0 || coordinate > this.cells[axis]) {
        throw new Error(`Voxel stamp center[${axis}] must be within the chunk.`);
      }
      return coordinate;
    });

    assertFinite(value.radius, 'radius');
    if (value.radius <= 0) {
      throw new Error('Voxel stamp radius must be positive.');
    }
    assertUnitInterval(value.strength, 'strength');
    assertFinite(value.smoothness, 'smoothness');
    if (value.smoothness <= 0) {
      throw new Error('Voxel stamp smoothness must be positive.');
    }

    return {
      id: value.id,
      operation: value.operation,
      center,
      radius: value.radius,
      strength: value.strength,
      smoothness: value.smoothness,
    };
  }

  emit() {
    const snapshot = this.list();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
