from __future__ import annotations

from pathlib import Path
from typing import Callable

import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix, translation_matrix

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "public" / "assets" / "models"
RGBA = tuple[int, int, int, int]


def rgba(hex_color: str) -> RGBA:
    value = hex_color.lstrip("#")
    return (
        int(value[0:2], 16),
        int(value[2:4], 16),
        int(value[4:6], 16),
        255,
    )


def add_mesh(
    scene: trimesh.Scene,
    mesh: trimesh.Trimesh,
    name: str,
    color: str,
    x: float = 0.0,
    floor_y: float = 0.0,
    z: float = 0.0,
    rotation_y: float = 0.0,
) -> None:
    mesh = mesh.copy()
    if rotation_y:
        mesh.apply_transform(rotation_matrix(rotation_y, [0.0, 1.0, 0.0]))
    min_y = float(mesh.bounds[0][1])
    mesh.apply_transform(translation_matrix([x, floor_y - min_y, z]))
    mesh.visual.face_colors = np.tile(np.array(rgba(color), dtype=np.uint8), (len(mesh.faces), 1))
    scene.add_geometry(mesh, node_name=name, geom_name=name)


def box(scene: trimesh.Scene, name: str, size: tuple[float, float, float], color: str, **kwargs: float) -> None:
    add_mesh(scene, trimesh.creation.box(extents=size), name, color, **kwargs)


def cone(scene: trimesh.Scene, name: str, radius: float, height: float, sections: int, color: str, **kwargs: float) -> None:
    mesh = trimesh.creation.cone(radius=radius, height=height, sections=sections)
    mesh.apply_transform(rotation_matrix(-np.pi / 2.0, [1.0, 0.0, 0.0]))
    add_mesh(scene, mesh, name, color, **kwargs)


def cylinder(scene: trimesh.Scene, name: str, radius: float, height: float, sections: int, color: str, **kwargs: float) -> None:
    mesh = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    mesh.apply_transform(rotation_matrix(-np.pi / 2.0, [1.0, 0.0, 0.0]))
    add_mesh(scene, mesh, name, color, **kwargs)


def sphere(scene: trimesh.Scene, name: str, radius: float, color: str, **kwargs: float) -> None:
    add_mesh(scene, trimesh.creation.icosphere(subdivisions=1, radius=radius), name, color, **kwargs)


def cottage() -> trimesh.Scene:
    scene = trimesh.Scene()
    box(scene, "walls", (1.55, 0.82, 1.45), "#c79a6b")
    cone(scene, "roof", 1.18, 0.76, 4, "#7b3428", floor_y=0.82, rotation_y=np.pi / 4)
    box(scene, "door", (0.24, 0.48, 0.10), "#56311f", z=0.76)
    box(scene, "window_left", (0.22, 0.22, 0.08), "#79b8d8", x=-0.46, floor_y=0.35, z=0.77)
    box(scene, "window_right", (0.22, 0.22, 0.08), "#79b8d8", x=0.46, floor_y=0.35, z=0.77)
    box(scene, "chimney", (0.20, 0.60, 0.20), "#74645c", x=0.48, floor_y=0.85, z=-0.34)
    return scene


def farmstead() -> trimesh.Scene:
    scene = trimesh.Scene()
    box(scene, "field_base", (2.70, 0.08, 2.70), "#886922")
    box(scene, "barn", (1.18, 0.76, 1.10), "#a54a32", x=-0.55, floor_y=0.08, z=-0.50)
    cone(scene, "barn_roof", 0.88, 0.60, 4, "#5b4333", x=-0.55, floor_y=0.84, z=-0.50, rotation_y=np.pi / 4)
    box(scene, "barn_door", (0.32, 0.46, 0.08), "#5c3428", x=-0.55, floor_y=0.08, z=0.08)
    for row, z in enumerate((0.20, 0.62, 1.02)):
        for col, x in enumerate((0.18, 0.54, 0.90, 1.20)):
            box(scene, f"crop_{row}_{col}", (0.12, 0.22, 0.12), "#d8bd4f", x=x, floor_y=0.08, z=z)
    return scene


def inn() -> trimesh.Scene:
    scene = trimesh.Scene()
    box(scene, "ground_floor", (2.45, 0.82, 1.48), "#b98452")
    box(scene, "upper_floor", (2.18, 0.55, 1.30), "#d0a16b", floor_y=0.82)
    cone(scene, "roof", 1.62, 0.82, 4, "#61352d", floor_y=1.37, rotation_y=np.pi / 4)
    box(scene, "door", (0.30, 0.55, 0.10), "#4c2b20", z=0.79)
    for x in (-0.76, 0.76):
        box(scene, f"window_{x}", (0.28, 0.25, 0.08), "#e2b75a", x=x, floor_y=0.94, z=0.70)
    box(scene, "sign_post", (0.10, 0.66, 0.10), "#3a2d23", x=1.02, floor_y=0.10, z=0.62)
    box(scene, "sign", (0.42, 0.28, 0.08), "#8e5f32", x=1.02, floor_y=0.66, z=0.62)
    return scene


def wizard_tower() -> trimesh.Scene:
    scene = trimesh.Scene()
    cylinder(scene, "tower", 0.68, 2.18, 12, "#8a8d93")
    cone(scene, "roof", 0.92, 1.08, 8, "#5f3b91", floor_y=2.18)
    box(scene, "door", (0.24, 0.50, 0.10), "#4d3428", z=0.69)
    for level, y in enumerate((0.75, 1.38)):
        box(scene, f"window_{level}", (0.20, 0.25, 0.08), "#64c9e8", x=0.67, floor_y=y, z=0.0)
    sphere(scene, "crystal", 0.16, "#63d8ff", floor_y=3.26)
    return scene


def stone_keep() -> trimesh.Scene:
    scene = trimesh.Scene()
    box(scene, "keep", (2.70, 1.45, 2.70), "#85898d")
    box(scene, "gate", (0.54, 0.80, 0.12), "#4c4034", z=1.41)
    tower_offset = 1.34
    corners = ((-tower_offset, -tower_offset), (tower_offset, -tower_offset), (-tower_offset, tower_offset), (tower_offset, tower_offset))
    for index, (x, z) in enumerate(corners):
        cylinder(scene, f"tower_{index}", 0.52, 1.78, 10, "#777c80", x=x, z=z)
        cone(scene, f"tower_roof_{index}", 0.66, 0.58, 8, "#4e5964", x=x, floor_y=1.78, z=z)
    for index, x in enumerate((-0.95, -0.32, 0.32, 0.95)):
        box(scene, f"crenel_front_{index}", (0.28, 0.28, 0.32), "#989da0", x=x, floor_y=1.45, z=1.30)
        box(scene, f"crenel_back_{index}", (0.28, 0.28, 0.32), "#989da0", x=x, floor_y=1.45, z=-1.30)
    return scene


def wall_segment() -> trimesh.Scene:
    scene = trimesh.Scene()
    box(scene, "wall", (0.88, 0.72, 0.30), "#777c80")
    box(scene, "crenel_left", (0.18, 0.18, 0.38), "#8a8f92", x=-0.33, floor_y=0.72)
    box(scene, "crenel_right", (0.18, 0.18, 0.38), "#8a8f92", x=0.33, floor_y=0.72)
    return scene


def pine_tree() -> trimesh.Scene:
    scene = trimesh.Scene()
    cylinder(scene, "trunk", 0.12, 0.72, 8, "#65452d")
    cone(scene, "lower_canopy", 0.46, 1.00, 9, "#2f6b3d", floor_y=0.50)
    cone(scene, "upper_canopy", 0.36, 0.82, 9, "#3d7d48", floor_y=1.13)
    return scene


def boulder() -> trimesh.Scene:
    scene = trimesh.Scene()
    mesh = trimesh.creation.icosphere(subdivisions=1, radius=0.38)
    mesh.apply_scale([1.0, 0.72, 0.86])
    add_mesh(scene, mesh, "boulder", "#777d7d", rotation_y=0.35)
    return scene


ASSETS: dict[str, Callable[[], trimesh.Scene]] = {
    "cottage": cottage,
    "farmstead": farmstead,
    "inn": inn,
    "wizard_tower": wizard_tower,
    "keep": stone_keep,
    "wall": wall_segment,
    "pine_tree": pine_tree,
    "boulder": boulder,
}


def build_asset_pack() -> trimesh.Scene:
    pack = trimesh.Scene()
    for asset_key, factory in ASSETS.items():
        pack.graph.update(
            frame_to=asset_key,
            frame_from=pack.graph.base_frame,
            matrix=np.eye(4),
        )
        source = factory()
        for source_node in source.graph.nodes_geometry:
            transform, geometry_name = source.graph.get(source_node)
            pack.add_geometry(
                source.geometry[geometry_name].copy(),
                node_name=f"{asset_key}__{source_node}",
                geom_name=f"{asset_key}__{geometry_name}",
                parent_node_name=asset_key,
                transform=transform,
            )
    return pack


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for existing in OUTPUT_DIR.glob("*.glb"):
        existing.unlink()
    output = OUTPUT_DIR / "settlement-core.glb"
    data = build_asset_pack().export(file_type="glb")
    output.write_bytes(data)
    print(f"wrote {output.relative_to(ROOT)} ({len(data)} bytes)")


if __name__ == "__main__":
    main()
