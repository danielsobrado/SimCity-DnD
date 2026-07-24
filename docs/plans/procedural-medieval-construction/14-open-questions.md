# Open Questions

These questions do not block Phase 0. They should be answered before the phase named in each section.

## Before Phase 2 — Editor

- Should wall paths allow sub-cell placement by default or snap to quarter-cell increments?
- Should a completed wall protect its supporting terrain from sculpt edits?
- Should wall drawing be available only in orbit/edit mode?
- What is the intended default wall height relative to the 2 m logical tile size?

## Before Phase 3 — Structure

- Are wall interiors required, or is the first wall always a solid core?
- Must closed wall loops support automatic inward/outward side correction?
- Which junction wins when two styles meet?
- Are crenellations gameplay-relevant cover or visual-only in the first release?

## Before Phase 6 — Material

- Is the final visual target closer to realistic PBR, painterly stylized PBR, or strongly low-poly?
- Should stone palettes derive from biome/geology automatically or only from selected style?
- Is a shared texture set acceptable, or should the first material be fully procedural TSL?
- Does the project intend to add a scene-wide outline effect?

## Before Phase 7 — Gates

- Does the gate need animation and interaction immediately?
- Is one round-arch gate sufficient for the first release?
- Should gate doors use generated wood or authored GLB assets?
- Does the gate need a wall-walk bridge above it?

## Before Phase 8 — Performance

- What target hardware and resolution define acceptance?
- What fortress size represents the expected worst normal gameplay case?
- Should editor-selected walls keep near LOD beyond normal gameplay distance?
- Can worker count share the existing world-generation worker budget?

## Before Phase 9 — Simulation

- Will navigation use a grid, tiled navmesh, or only local collision initially?
- Are walls intended to block settlement influence or territory simulation?
- Are projectiles simulated with ray tests, swept shapes, or abstract combat rules?
- Is wall-top traversal required before NPC siege behavior?

## Before Phase 10 — Damage

- Is damage continuous health, discrete breach events, or both?
- Must debris block movement?
- Is repair instant, resource-based, or worker-driven?
- Are magical damage types expected to change material appearance or topology?
