from __future__ import annotations

import json
import math
import struct
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "assets" / "models" / "settlement-core.glb"
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


@dataclass(frozen=True)
class Part:
    name: str
    shape: str
    size: tuple[float, float, float]
    color: str
    position: tuple[float, float, float] = (0.0, 0.0, 0.0)
    sides: int = 8
    rotation_y: float = 0.0


def rgb(hex_color: str) -> tuple[int, int, int, int]:
    value = hex_color.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4)) + (255,)


def rotate_y(vertex: tuple[float, float, float], angle: float) -> tuple[float, float, float]:
    x, y, z = vertex
    cosine, sine = math.cos(angle), math.sin(angle)
    return x * cosine + z * sine, y, -x * sine + z * cosine


def transform(vertices: list[tuple[float, float, float]], part: Part) -> list[tuple[float, float, float]]:
    px, py, pz = part.position
    return [(x + px, y + py, z + pz) for x, y, z in (rotate_y(vertex, part.rotation_y) for vertex in vertices)]


def box_geometry(size: tuple[float, float, float]) -> tuple[list[tuple[float, float, float]], list[int]]:
    width, height, depth = size
    x, y, z = width / 2, height, depth / 2
    vertices = [(-x, 0, -z), (x, 0, -z), (x, y, -z), (-x, y, -z), (-x, 0, z), (x, 0, z), (x, y, z), (-x, y, z)]
    indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 3, 7, 6, 3, 6, 2, 0, 1, 5, 0, 5, 4]
    return vertices, indices


def cone_geometry(radius: float, height: float, sides: int) -> tuple[list[tuple[float, float, float]], list[int]]:
    vertices = [(0.0, height, 0.0), (0.0, 0.0, 0.0)]
    vertices.extend((radius * math.cos(2 * math.pi * index / sides), 0.0, radius * math.sin(2 * math.pi * index / sides)) for index in range(sides))
    indices: list[int] = []
    for index in range(sides):
        current = 2 + index
        following = 2 + (index + 1) % sides
        indices.extend((0, current, following, 1, following, current))
    return vertices, indices


def cylinder_geometry(radius: float, height: float, sides: int) -> tuple[list[tuple[float, float, float]], list[int]]:
    vertices = [(0.0, 0.0, 0.0), (0.0, height, 0.0)]
    for y in (0.0, height):
        vertices.extend((radius * math.cos(2 * math.pi * index / sides), y, radius * math.sin(2 * math.pi * index / sides)) for index in range(sides))
    indices: list[int] = []
    for index in range(sides):
        bottom = 2 + index
        next_bottom = 2 + (index + 1) % sides
        top = 2 + sides + index
        next_top = 2 + sides + (index + 1) % sides
        indices.extend((0, next_bottom, bottom, 1, top, next_top, bottom, next_bottom, next_top, bottom, next_top, top))
    return vertices, indices


def rock_geometry(size: tuple[float, float, float]) -> tuple[list[tuple[float, float, float]], list[int]]:
    vertices, indices = box_geometry(size)
    skewed = [(x * (0.82 if y else 1.0) + 0.08 * z, y, z * (0.88 if y else 1.0)) for x, y, z in vertices]
    return skewed, indices


def geometry(part: Part) -> tuple[list[tuple[float, float, float]], list[int]]:
    if part.shape == "box":
        raw = box_geometry(part.size)
    elif part.shape == "cone":
        raw = cone_geometry(part.size[0], part.size[1], part.sides)
    elif part.shape == "cylinder":
        raw = cylinder_geometry(part.size[0], part.size[1], part.sides)
    elif part.shape == "rock":
        raw = rock_geometry(part.size)
    else:
        raise ValueError(f"Unknown shape: {part.shape}")
    return transform(raw[0], part), raw[1]


def asset_parts() -> dict[str, list[Part]]:
    box = lambda name, size, color, position=(0, 0, 0), rotation_y=0: Part(name, "box", size, color, position, rotation_y=rotation_y)
    cone = lambda name, radius, height, color, position=(0, 0, 0), sides=8, rotation_y=0: Part(name, "cone", (radius, height, radius), color, position, sides, rotation_y)
    cylinder = lambda name, radius, height, color, position=(0, 0, 0), sides=10: Part(name, "cylinder", (radius, height, radius), color, position, sides)
    assets = {
        "cottage": [box("walls", (1.55, .82, 1.45), "#c79a6b"), cone("roof", 1.18, .76, "#7b3428", (0, .82, 0), 4, math.pi / 4), box("door", (.24, .48, .10), "#56311f", (0, 0, .76)), box("window_left", (.22, .22, .08), "#79b8d8", (-.46, .35, .77)), box("window_right", (.22, .22, .08), "#79b8d8", (.46, .35, .77)), box("chimney", (.20, .60, .20), "#74645c", (.48, .85, -.34))],
        "farmstead": [box("field", (2.70, .08, 2.70), "#886922"), box("barn", (1.18, .76, 1.10), "#a54a32", (-.55, .08, -.50)), cone("roof", .88, .60, "#5b4333", (-.55, .84, -.50), 4, math.pi / 4), box("door", (.32, .46, .08), "#5c3428", (-.55, .08, .08))] + [box(f"crop_{row}_{column}", (.12, .22, .12), "#d8bd4f", (x, .08, z)) for row, z in enumerate((.20, .62, 1.02)) for column, x in enumerate((.18, .54, .90, 1.20))],
        "inn": [box("ground", (2.45, .82, 1.48), "#b98452"), box("upper", (2.18, .55, 1.30), "#d0a16b", (0, .82, 0)), cone("roof", 1.62, .82, "#61352d", (0, 1.37, 0), 4, math.pi / 4), box("door", (.30, .55, .10), "#4c2b20", (0, 0, .79)), box("window_left", (.28, .25, .08), "#e2b75a", (-.76, .94, .70)), box("window_right", (.28, .25, .08), "#e2b75a", (.76, .94, .70)), box("sign_post", (.10, .66, .10), "#3a2d23", (1.02, .10, .62)), box("sign", (.42, .28, .08), "#8e5f32", (1.02, .66, .62))],
        "wizard_tower": [cylinder("tower", .68, 2.18, "#8a8d93", sides=12), cone("roof", .92, 1.08, "#5f3b91", (0, 2.18, 0), 8), box("door", (.24, .50, .10), "#4d3428", (0, 0, .69)), box("window_low", (.20, .25, .08), "#64c9e8", (.67, .75, 0)), box("window_high", (.20, .25, .08), "#64c9e8", (.67, 1.38, 0)), Part("crystal", "rock", (.28, .32, .28), "#63d8ff", (0, 3.26, 0), rotation_y=.3)],
        "keep": [box("keep", (2.70, 1.45, 2.70), "#85898d"), box("gate", (.54, .80, .12), "#4c4034", (0, 0, 1.41))],
        "wall": [box("wall", (.88, .72, .30), "#777c80"), box("crenel_left", (.18, .18, .38), "#8a8f92", (-.33, .72, 0)), box("crenel_right", (.18, .18, .38), "#8a8f92", (.33, .72, 0))],
        "pine_tree": [cylinder("trunk", .12, .72, "#65452d", sides=8), cone("lower", .46, 1.0, "#2f6b3d", (0, .50, 0), 9), cone("upper", .36, .82, "#3d7d48", (0, 1.13, 0), 9)],
        "boulder": [Part("boulder", "rock", (.76, .55, .65), "#777d7d", rotation_y=.35)],
    }
    corners = ((-1.34, -1.34), (1.34, -1.34), (-1.34, 1.34), (1.34, 1.34))
    for index, (x, z) in enumerate(corners):
        assets["keep"].append(cylinder(f"tower_{index}", .52, 1.78, "#777c80", (x, 0, z), 10))
        assets["keep"].append(cone(f"roof_{index}", .66, .58, "#4e5964", (x, 1.78, z), 8))
    return assets


class GlbBuilder:
    def __init__(self) -> None:
        self.binary = bytearray()
        self.buffer_views: list[dict] = []
        self.accessors: list[dict] = []
        self.meshes: list[dict] = []
        self.nodes: list[dict] = []

    def append(self, data: bytes, target: int) -> int:
        while len(self.binary) % 4:
            self.binary.append(0)
        offset = len(self.binary)
        self.binary.extend(data)
        index = len(self.buffer_views)
        self.buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return index

    def accessor(self, view: int, component: int, count: int, kind: str, minimum=None, maximum=None, normalized=False) -> int:
        value = {"bufferView": view, "componentType": component, "count": count, "type": kind}
        if minimum is not None:
            value["min"] = minimum
            value["max"] = maximum
        if normalized:
            value["normalized"] = True
        self.accessors.append(value)
        return len(self.accessors) - 1

    def add_part(self, asset: str, part: Part) -> int:
        vertices, indices = geometry(part)
        position_data = b"".join(struct.pack("<3f", *vertex) for vertex in vertices)
        color_data = bytes(rgb(part.color) * len(vertices))
        index_data = b"".join(struct.pack("<H", value) for value in indices)
        position_view = self.append(position_data, 34962)
        color_view = self.append(color_data, 34962)
        index_view = self.append(index_data, 34963)
        minimum = [min(vertex[axis] for vertex in vertices) for axis in range(3)]
        maximum = [max(vertex[axis] for vertex in vertices) for axis in range(3)]
        position = self.accessor(position_view, 5126, len(vertices), "VEC3", minimum, maximum)
        color = self.accessor(color_view, 5121, len(vertices), "VEC4", normalized=True)
        index = self.accessor(index_view, 5123, len(indices), "SCALAR")
        mesh_index = len(self.meshes)
        self.meshes.append({"name": f"{asset}__{part.name}", "primitives": [{"attributes": {"POSITION": position, "COLOR_0": color}, "indices": index, "mode": 4}]})
        self.nodes.append({"name": f"{asset}__{part.name}", "mesh": mesh_index})
        return len(self.nodes) - 1

    def build(self, assets: dict[str, list[Part]]) -> bytes:
        root_children = []
        for asset, parts in assets.items():
            child_nodes = [self.add_part(asset, part) for part in parts]
            self.nodes.append({"name": asset, "children": child_nodes})
            root_children.append(len(self.nodes) - 1)
        self.nodes.append({"name": "world", "children": root_children})
        document = {"asset": {"version": "2.0", "generator": "SimCity DnD stdlib generator"}, "scene": 0, "scenes": [{"nodes": [len(self.nodes) - 1]}], "nodes": self.nodes, "meshes": self.meshes, "buffers": [{"byteLength": len(self.binary)}], "bufferViews": self.buffer_views, "accessors": self.accessors}
        json_bytes = json.dumps(document, separators=(",", ":")).encode()
        json_bytes += b" " * (-len(json_bytes) % 4)
        binary = bytes(self.binary) + b"\0" * (-len(self.binary) % 4)
        total = 12 + 8 + len(json_bytes) + 8 + len(binary)
        return struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<II", len(json_bytes), JSON_CHUNK) + json_bytes + struct.pack("<II", len(binary), BIN_CHUNK) + binary


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    for existing in OUTPUT.parent.glob("*.glb"):
        existing.unlink()
    data = GlbBuilder().build(asset_parts())
    OUTPUT.write_bytes(data)
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(data)} bytes)")


if __name__ == "__main__":
    main()
