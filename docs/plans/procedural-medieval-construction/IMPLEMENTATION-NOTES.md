# Implementation Notes

This file intentionally remains small. It records decisions that apply across every phase.

## Start order

1. Domain schema, IDs, commands, and save integration.
2. Path editor and lightweight structural preview.
3. Stable module planning and terrain foundations.
4. Masonry descriptions and deterministic invariants.
5. Near geometry and TSL material.
6. Gates, LOD, streaming, collision, damage, and style expansion.

## Hard rules

- Do not use `Math.random()` in generation.
- Do not save generated stones or geometry.
- Do not create one scene object, material, or collider per stone.
- Do not make Catmull-Rom splines authoritative in the first release.
- Do not use Wave Function Collapse as the structural authority.
- Do not make rendering authoritative for collision or navigation.
- Do not rebuild an entire long wall after a local edit.
- Do not modify legacy wall behavior until conversion is explicit and tested.

## First coding task

Implement Phase 0 and the smallest part of Phase 1:

- construction configuration loader;
- normalized style schema;
- stable construction/path-point IDs;
- deterministic forked random utility;
- construction record validation;
- domain tests and fixtures.

This establishes the contracts needed by every later visual and gameplay subsystem.
