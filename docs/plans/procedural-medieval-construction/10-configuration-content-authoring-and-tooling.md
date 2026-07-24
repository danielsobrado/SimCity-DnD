# Configuration, Content Authoring, and Tooling Plan

## 1. Objective

Make procedural medieval construction data-driven, validated, previewable, and safe to extend without hard-coding styles across runtime files.

## 2. Configuration files

Add:

```text
config/construction.yaml
config/construction-styles.yaml
```

Optional later:

```text
config/construction-features.yaml
config/construction-material-palettes.yaml
```

Keep runtime constants and style/content data separate.

## 3. Global construction configuration

Example:

```yaml
construction:
  generatorVersion: 1
  editor:
    endpointSnapMeters: 1.0
    segmentSnapMeters: 0.6
    gridSnapMeters: 0.25
    angleSnapDegrees: 15
  compilation:
    workerCount: 2
    mainThreadBudgetMs: 2
    uploadsPerFrame: 1
    maxQueuedJobs: 64
  geometry:
    maxVerticesPerChunk: 120000
    maxStonesPerModule: 4000
  streaming:
    nearRadiusChunks: 2
    mediumRadiusChunks: 5
    farRadiusChunks: 10
    unloadRadiusChunks: 12
```

Numbers are initial tunables, not guaranteed final budgets.

## 4. Style definition

A style includes:

- identity/version;
- allowed dimensions;
- structural grammar parameters;
- foundation policy;
- masonry family;
- stone shape ranges;
- mortar;
- top types;
- openings;
- buttresses;
- material palette;
- weathering;
- LOD policy;
- gameplay values;
- optional authored asset sockets.

Example skeleton:

```yaml
styles:
  castle_coursed_rubble:
    version: 1
    label: Castle Coursed Rubble
    dimensions:
      height: [2.5, 10]
      thickness: [0.8, 2.5]
    structure:
      corner: interlocked_quoins
      foundation: battered_stepped
      top: crenellated
    masonry:
      family: coursed_rubble
      courseHeight: [0.25, 0.42]
      stoneWidth: [0.35, 1.1]
      jointWidth: [0.025, 0.07]
    material:
      palette: grey_granite
      roughness: [0.78, 0.96]
```

## 5. Schema loader

Implement a construction config loader analogous to existing YAML loaders.

Responsibilities:

- YAML parsing;
- required fields;
- numeric normalization;
- range checks;
- cross-reference validation;
- immutable normalized output;
- useful path-specific errors;
- style version uniqueness.

Do not pass raw YAML objects deep into generation code.

## 6. Style inheritance

Avoid complex arbitrary inheritance in v1.

Allow one controlled `baseStyle` merge only if needed.

Rules:

- no cycles;
- explicit replacement vs merge behavior;
- resolved style is validated;
- style hash is generated for diagnostics;
- version still required on derived style.

KISS default: duplicate small style blocks until real repetition justifies inheritance.

## 7. Material palettes

Palette definition:

- base colors;
- category shifts;
- mortar color;
- wet shift;
- moss color;
- limewash color;
- exposed core color.

Keep color values configurable and material logic shared.

## 8. Authored assets

GLB remains suitable for complex reusable feature parts:

- gate leaves;
- hinges;
- portcullis;
- banners;
- statues;
- gargoyles;
- tower roof;
- stair props;
- scaffold;
- siege damage props.

Extend asset validation for construction feature sockets:

- Y-up;
- logical metric scale;
- pivot contract;
- socket names;
- bounds;
- static meshes;
- embedded PBR materials or material remapping policy.

## 9. Archetype library

Optional stone archetypes may be generated offline or authored.

Requirements:

- small bounded set;
- style/category tags;
- valid convex-ish geometry;
- normalized dimensions;
- controlled deformation compatibility;
- deterministic selection.

Do not require hundreds of unique stone models.

## 10. Developer gallery

Add a construction look-development scene or query mode that renders a matrix of:

- styles;
- seeds;
- wall lengths;
- corners;
- gates;
- slopes;
- damage levels;
- weathering levels;
- LODs;
- lighting poses.

Support deterministic screenshots.

## 11. Inspector

Developer inspector fields:

- construction ID/revision;
- style/version;
- seed;
- module count;
- stone count;
- render chunks;
- LOD;
- collision primitives;
- generation hashes;
- compile timings;
- cache state;
- validation warnings.

## 12. Determinism dump

Export a compact debug JSON:

```text
construction input hash
style hash
terrain sample hash
structural plan hash
masonry hashes by module
geometry hashes by chunk/LOD
collision hash
```

This is essential for regression isolation.

## 13. Offline generation tools

Potential scripts:

```text
scripts/validate-construction-config.mjs
scripts/generate-construction-gallery.mjs
scripts/compare-construction-hashes.mjs
scripts/export-construction-fixture.mjs
```

Integrate config validation into `npm run verify`.

## 14. Legacy conversion tool

Optional editor command:

- detect adjacent legacy wall objects;
- group connected cells;
- infer polyline;
- create new construction;
- retain originals until user confirms;
- report ambiguous branches/corners.

Do not silently migrate saves.

## 15. Documentation contract

Each style documents:

- visual intent;
- valid uses;
- dimension range;
- terrain modes;
- feature compatibility;
- LOD exceptions;
- gameplay values;
- version history.

## 16. Logging and errors

Use structured, throttled logging.

Log keys:

- construction ID;
- revision;
- stage;
- module/chunk ID;
- error code;
- timing;
- fallback.

Avoid repeated frame-by-frame console spam.

## 17. Tests

- YAML parse;
- unknown field policy;
- range validation;
- bad reference;
- inheritance cycle;
- immutable normalized style;
- version collision;
- asset socket validation;
- deterministic style hash;
- verify-script integration.

## 18. Acceptance

A new stone-wall style can be added by configuration and optional shared assets without editing the structural planner, masonry solver, or material source for ordinary parameter variation.
