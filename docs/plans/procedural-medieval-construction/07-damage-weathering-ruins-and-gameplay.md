# Damage, Weathering, Ruins, and Gameplay Plan

## 1. Objective

Represent age, climate, construction state, damage, breach, repair, and ruin without turning individual render stones into authoritative simulation objects.

## 2. Separation of concerns

### Structural state

Authoritative:

- health;
- breach intervals;
- remaining height profile;
- build progress;
- repair progress;
- gate state;
- owner/faction;
- defensive statistics.

### Visual derivation

Generated:

- missing stones;
- chipped edges;
- cracks;
- exposed core;
- fallen rubble;
- moss and lichen;
- mortar erosion;
- soot;
- dampness;
- limewash loss.

## 3. Weathering model

Weathering inputs:

- construction age;
- style/material;
- biome;
- moisture;
- orientation;
- height above ground;
- roof/top protection;
- damage exposure;
- world seed and construction seed.

Effects:

- lower-wall dampness;
- moss on shaded/moist faces;
- lighter dust on upward faces;
- darker runoff below protrusions;
- mortar recession;
- edge rounding;
- color bleaching;
- vegetation colonization in ruins.

Weathering must be stable and deterministic. Time progression can change a small set of authoritative age/condition values and rebuild affected chunks deliberately.

## 4. Stylized restraint

Use macro masks rather than high-frequency random dirt everywhere.

Recommended visual ordering:

1. base stone identity;
2. lower damp band;
3. broad moss patches;
4. localized runoff;
5. subtle per-stone wear;
6. sparse vegetation.

A wall should remain readable as masonry.

## 5. Damage events

Authoritative damage command:

```yaml
type: construction_apply_damage
constructionId: ...
impact:
  pathDistance: 12.4
  height: 2.0
  radius: 1.8
  energy: 0.65
  damageType: siege
```

Damage model converts impact into:

- health delta;
- breach interval change;
- remaining height profile;
- gate/tower special handling;
- dirty module range;
- debris budget.

Do not persist impact decals as the only damage state.

## 6. Breach representation

A breach is a coarse profile:

- path interval;
- base height;
- remaining height;
- severity;
- collapse bias;
- optional passable flag.

Derived generator:

1. selects affected courses;
2. removes stones inside collapse envelope;
3. preserves unstable edge stones;
4. exposes core;
5. generates fracture/chip attributes;
6. emits bounded debris;
7. updates collision/navigation.

## 7. Crack generation

Cracks should follow mortar joints where possible.

Algorithm:

- choose origin near impact or stress concentration;
- traverse joint graph with directional bias;
- stop at bounded length;
- widen near source;
- optionally remove a small number of neighboring stones.

Cracks are visual derived data unless they change gameplay.

## 8. Debris

Debris is derived and budgeted.

Representations:

- near: small instanced stone archetypes;
- medium: clustered rubble mesh;
- far: ground color/normal patch or omitted.

Debris does not become permanent rigid-body simulation by default.

Persist only deliberate gameplay debris obstacles if required.

## 9. Ruin generation

A ruin style is not just random missing stones.

Ruin grammar controls:

- surviving wall height profile;
- collapsed corners;
- exposed core;
- broken top;
- blocked/partial openings;
- debris side bias;
- vegetation colonization;
- age and weathering;
- structural remnants such as arches.

Ruin generation can start from:

- intact construction plus damage state;
- authored ruin profile;
- procedural settlement ruin rules.

## 10. Construction progress

Future build stages:

1. layout markers;
2. excavated/placed footing;
3. foundation;
4. partial wall courses;
5. complete wall body;
6. top/parapet;
7. gate fittings;
8. finishing/weathering.

Visual generator clips or selects courses based on deterministic progress.

Gameplay state controls:

- collision threshold;
- cover value;
- worker access;
- resource consumption.

First slice can implement completed and ruined states only while preserving schema hooks.

## 11. Repair

Repair command modifies coarse damage state.

Repair may:

- close breach;
- raise remaining height;
- restore gate;
- reduce crack severity;
- keep visual patch distinction if style supports it.

Patched masonry can use:

- cleaner/newer stones;
- different mortar;
- visible construction seam;
- faction material variation.

## 12. Defensive gameplay metadata

Per module:

- cover height;
- line-of-sight blocker;
- projectile resistance;
- melee resistance;
- climb difficulty;
- walkable top;
- gate portal;
- breach passability;
- ownership.

These values come from style and state, not triangle analysis.

## 13. Interaction with settlements

Future simulation hooks:

- construction cost;
- required materials;
- workers;
- maintenance;
- decay;
- siege targeting;
- repair priority;
- faction ownership;
- crime/pathing implications.

Do not implement these inside the geometry compiler.

## 14. Runtime updates

Damage update pipeline:

```text
damage command
  -> structural state update
  -> dirty affected modules
  -> immediate coarse collision/nav update
  -> lightweight damage shell
  -> scheduled detailed visual rebuild
  -> atomic swap
```

Gameplay authority updates before detailed visual completion.

## 15. Tests

- damage determinism;
- breach merge/split;
- passability threshold;
- local dirty range;
- collision/nav parity;
- debris budget;
- crack bounded termination;
- ruin top profile;
- repair round trip;
- weathering stable across rebase and reload.

## 16. Acceptance

A siege breach must visibly expose wall structure, become traversable when the state says it is traversable, survive save/load, and rebuild without changing unrelated masonry.
