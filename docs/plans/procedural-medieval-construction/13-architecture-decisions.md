# Architecture Decisions

## Accepted

### AD-1 — Construction intent is authoritative

Paths, styles, dimensions, features, and gameplay state are saved. Generated modules, stones, geometry, collision products, and navigation products are derived.

### AD-2 — Polyline paths first

The first release uses explicit piecewise-linear paths. Curves can be added later through explicit sampled points or a separately versioned path type.

### AD-3 — Structural grammar before masonry

Corners, junctions, openings, foundations, top rhythm, and tower sockets are solved before courses and stones.

### AD-4 — Constrained course packing

Masonry uses exact interval packing, joint-stagger constraints, boundary handshakes, and bounded deterministic fallback.

### AD-5 — Merged near geometry

Near stones compile into bounded render-chunk geometry. Per-stone instancing remains an optimization option only after profiling.

### AD-6 — TSL material path

The WebGPU-first implementation uses NodeMaterial/TSL rather than adding a legacy `ShaderMaterial` wall pipeline.

### AD-7 — Coarse simulation products

Collision, navigation, cover, and damage use semantic structural data rather than individual stone triangles.

### AD-8 — Dirty-range compilation

Local edits rebuild affected modules and neighboring handshakes only.

### AD-9 — WFC is local and optional

Wave Function Collapse or model-synthesis methods may choose bounded decorative arrangements, but they do not own wall topology or structural validity.

### AD-10 — Legacy walls remain compatible

The existing one-cell wall object remains valid. Conversion to path-based construction is explicit and reversible until confirmed.

## Deferred

- curved authoritative paths;
- GPU compute masonry generation;
- rigid-body brick destruction;
- automatic complete-castle generation;
- wall-top navigation;
- bridge spans;
- multiplayer replication;
- automatic style inference from example meshes.
