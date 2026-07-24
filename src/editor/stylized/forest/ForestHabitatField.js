import {
  createForestBiomeProfiles,
  forestProfileSignature,
} from './ForestBiomeProfiles.js';
import {
  FOREST_PATCH_DEFAULT_SUPERCELL_SIZE,
  ForestPatchField,
} from './ForestPatchField.js';

const DEFAULT_SLOPE_SAMPLE_DISTANCE = 4;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(minimum, maximum, value) {
  if (maximum <= minimum) return value >= maximum ? 1 : 0;
  const normalized = clamp01((value - minimum) / (maximum - minimum));
  return normalized * normalized * (3 - 2 * normalized);
}

function rangeWeight(value, minimum, maximum, fade) {
  const lower = smoothstep(minimum - fade, minimum, value);
  const upper = 1 - smoothstep(maximum, maximum + fade, value);
  return clamp01(lower * upper);
}

function slopeWeight(slope, preferred, maximum) {
  if (slope <= preferred) return 1;
  return 1 - smoothstep(preferred, maximum, slope);
}

function waterWeight(distance, profile) {
  if (!Number.isFinite(distance)) return 1;
  return rangeWeight(
    distance,
    profile.waterMinimum,
    profile.waterMaximum,
    profile.waterFade,
  );
}

function worldToCell(x, z, tileSize) {
  return {
    cellX: Math.floor(x / tileSize),
    cellZ: Math.floor(-z / tileSize),
  };
}

export class ForestHabitatField {
  constructor({
    seed = 0,
    tileSize,
    tileAt,
    heightAt,
    waterDistanceAt = null,
    config = {},
  }) {
    if (!Number.isFinite(tileSize) || tileSize <= 0) {
      throw new Error('ForestHabitatField requires a positive tileSize.');
    }
    if (typeof tileAt !== 'function' || typeof heightAt !== 'function') {
      throw new Error('ForestHabitatField requires tileAt and heightAt functions.');
    }

    this.enabled = config.enabled !== false;
    this.seed = Number.isInteger(seed) ? seed : Math.trunc(seed) || 0;
    this.tileSize = tileSize;
    this.tileAt = tileAt;
    this.heightAt = heightAt;
    this.waterDistanceAt = typeof waterDistanceAt === 'function' ? waterDistanceAt : null;
    this.slopeSampleDistance = Math.max(
      tileSize,
      Number(config.slopeSampleDistance) || DEFAULT_SLOPE_SAMPLE_DISTANCE,
    );
    this.profiles = createForestBiomeProfiles(config.profiles);
    this.patchField = new ForestPatchField({
      seed: this.seed,
      supercellSize: config.patchSupercellSize ?? FOREST_PATCH_DEFAULT_SUPERCELL_SIZE,
    });
    this.signature = [
      this.enabled ? 1 : 0,
      this.seed,
      this.tileSize,
      this.slopeSampleDistance,
      this.patchField.signature,
      forestProfileSignature(this.profiles),
    ].join('|');
  }

  slopeAt(x, z) {
    const distance = this.slopeSampleDistance;
    const heightX = this.heightAt(x + distance, z) - this.heightAt(x - distance, z);
    const heightZ = this.heightAt(x, z + distance) - this.heightAt(x, z - distance);
    return Math.hypot(heightX, heightZ) / (distance * 2);
  }

  sample(x, z) {
    const { cellX, cellZ } = worldToCell(x, z, this.tileSize);
    const tileId = this.tileAt(cellX, cellZ);
    const profile = this.enabled ? this.profiles.get(tileId) : null;
    if (!profile) {
      return Object.freeze({
        tileId,
        profileKey: null,
        structure: null,
        patchId: null,
        patchCoverage: 0,
        patchEdge: 0,
        patchDistance: Number.POSITIVE_INFINITY,
        elevation: this.heightAt(x, z),
        slope: 0,
        elevationWeight: 0,
        slopeWeight: 0,
        waterWeight: 0,
        suitability: 0,
      });
    }

    const elevation = this.heightAt(x, z);
    const slope = this.slopeAt(x, z);
    const patch = this.patchField.sample(x, z, profile);
    const elevationFactor = rangeWeight(
      elevation,
      profile.elevationMin,
      profile.elevationMax,
      profile.elevationFade,
    );
    const slopeFactor = slopeWeight(slope, profile.preferredSlope, profile.maximumSlope);
    const distanceToWater = this.waterDistanceAt?.(x, z) ?? Number.POSITIVE_INFINITY;
    const waterFactor = waterWeight(distanceToWater, profile);
    const suitability = clamp01(
      profile.density
      * patch.patchCoverage
      * elevationFactor
      * slopeFactor
      * waterFactor,
    );

    return Object.freeze({
      tileId,
      profileKey: profile.key,
      structure: profile.structure,
      patchId: patch.patchId,
      patchCoverage: patch.patchCoverage,
      patchEdge: patch.patchEdge,
      patchDistance: patch.patchDistance,
      elevation,
      slope,
      elevationWeight: elevationFactor,
      slopeWeight: slopeFactor,
      waterWeight: waterFactor,
      suitability,
    });
  }
}

export function createForestPlacementEvaluator(field, counters = null) {
  if (!field) return null;
  return (candidate) => {
    counters && (counters.evaluated += 1);
    const habitat = field.sample(candidate.x, candidate.z);
    if (candidate.priority >= habitat.suitability) {
      counters && (counters.rejectedHabitat += 1);
      return null;
    }
    return {
      patchId: habitat.patchId,
      forestProfileKey: habitat.profileKey,
      forestStructure: habitat.structure,
      forestSuitability: habitat.suitability,
      forestPatchCoverage: habitat.patchCoverage,
      forestPatchEdge: habitat.patchEdge,
      forestSlope: habitat.slope,
      forestElevation: habitat.elevation,
    };
  };
}

export const FOREST_HABITAT_DEFAULT_SLOPE_SAMPLE_DISTANCE = DEFAULT_SLOPE_SAMPLE_DISTANCE;
