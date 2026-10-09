"""Export real platform data for the 3D scene and the slides.

Run with the hackathon repo's virtualenv (see `npm run export:assets`). Writes:
  public/data/tracks.json        the three benchmark tracks (400-point centerlines + half-widths)
  public/data/car.json           default CarConfig, derived geometry, PARAM_RANGES, colors
  public/data/obs_contract.json  OBS_VERSION, blocks, SCALE, lookahead distances
Nothing in the repo is modified.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("JAX_PLATFORMS", "cpu")
os.environ.setdefault("RLR_NO_JAX_CACHE", "1")

import numpy as np  # noqa: E402

from rlracing.cars import config as car_cfg  # noqa: E402
from rlracing.cars import template as car_tpl  # noqa: E402
from rlracing.env import obs as obs_mod  # noqa: E402
from rlracing.tracks import walls  # noqa: E402
from rlracing.tracks import generator as gen  # noqa: E402
from rlracing.tracks.sets import benchmark_tracks  # noqa: E402
from rlracing import world  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)


def rnd(a, nd=4):
    return np.round(np.asarray(a, dtype=float), nd).tolist()


def export_tracks():
    out = []
    for t in benchmark_tracks():
        c = np.asarray(t.centerline)
        hw = np.asarray(t.half_width)
        seg = np.linalg.norm(np.roll(c, -1, axis=0) - c, axis=1)
        s = np.concatenate([[0.0], np.cumsum(seg)[:-1]])
        tan = np.roll(c, -1, axis=0) - np.roll(c, 1, axis=0)
        heading = np.arctan2(tan[:, 1], tan[:, 0])
        out.append({
            "name": t.name,
            "seed": int(t.seed) if t.seed is not None else None,
            "length": float(t.length),
            "centerline": rnd(c, 3),
            "half_width": rnd(hw, 3),
            "s": rnd(s, 3),
            "heading": rnd(heading, 4),
            "min_half_width": float(hw.min()),
            "max_half_width": float(hw.max()),
        })
    (OUT / "tracks.json").write_text(json.dumps({
        "n_points": gen.N_POINTS,
        "track_scale": gen.TRACK_SCALE,
        "min_half_width_m": gen.MIN_HALF_WIDTH_M,
        "max_half_width_m": gen.MAX_HALF_WIDTH_M,
        "min_length_m": gen.MIN_LENGTH_M,
        "max_length_m": gen.MAX_LENGTH_M,
        "walls": {
            "n_walls": walls.N_WALLS,
            "segment_spacing": walls.SEGMENT_SPACING,
            "half_size": list(walls.WALL_HALF_SIZE),
            "rgba": [0.9, 0.9, 0.92, 1.0],
        },
        "ground_rgba": [0.35, 0.36, 0.34, 1.0],
        "tracks": out,
    }))
    return out


def export_car():
    cfg = car_cfg.CarConfig()
    d = cfg.to_dict() if hasattr(cfg, "to_dict") else cfg.__dict__.copy()
    length, width = cfg.footprint
    body_h = 0.30
    ranges = {k: [float(v[0]), float(v[1])] for k, v in car_cfg.PARAM_RANGES.items()}
    colors = [list(map(float, c)) for c in world.CAR_COLORS]
    car = {
        "defaults": d,
        "ranges": ranges,
        "wheel_mass": car_cfg.WHEEL_MASS,
        "hub_mass": car_cfg.HUB_MASS,
        "total_mass": float(cfg.chassis_mass + 4 * (car_cfg.WHEEL_MASS + car_cfg.HUB_MASS)),
        "geometry": {
            "length": float(length),
            "width": float(width),
            "body_h": body_h,
            "body_origin_z": float(cfg.wheel_radius),
            "chassis_half": [length / 2, width / 2, body_h / 2],
            "chassis_center_z": float(cfg.com_height),
            "cabin_half": [length * 0.22, width * 0.38, 0.16],
            "cabin_pos_rel_body": [-length * 0.08, 0.0, cfg.com_height - cfg.wheel_radius + body_h / 2 + 0.16],
            "hub_xy": {
                "fl": [cfg.wheelbase / 2, cfg.track_width / 2],
                "fr": [cfg.wheelbase / 2, -cfg.track_width / 2],
                "rl": [-cfg.wheelbase / 2, cfg.track_width / 2],
                "rr": [-cfg.wheelbase / 2, -cfg.track_width / 2],
            },
            "size_scalar": float(car_tpl.car_size_scalar(cfg)),
            "chassis_rgba": list(colors[0]),
            "cabin_rgba": [0.15, 0.15, 0.18, 1.0],
            "tire_rgba": [0.1, 0.1, 0.1, 1.0],
        },
        "car_colors": colors,
        "grid": {"spacing_x": world.GRID_SPACING_X, "offset_y": world.GRID_OFFSET_Y},
        "timing": {"physics_dt": world.PHYSICS_DT, "n_frames": world.N_FRAMES, "control_dt": world.CONTROL_DT},
    }
    (OUT / "car.json").write_text(json.dumps(car, indent=1))
    return car


def export_obs():
    blocks, i = [], 0
    for name, n in obs_mod.BLOCKS:
        blocks.append({"name": name, "start": i, "end": i + n, "size": n,
                       "divisor": rnd(1.0 / obs_mod.SCALE[i:i + n], 4)})
        i += n
    (OUT / "obs_contract.json").write_text(json.dumps({
        "version": obs_mod.OBS_VERSION,
        "size": int(obs_mod.OBS_SIZE),
        "lookahead_m": rnd(obs_mod.LOOKAHEAD_M, 2),
        "n_opponents": obs_mod.N_OPPONENTS,
        "opponent_dim": obs_mod.OPPONENT_DIM,
        "half_width_scale_m": obs_mod.HALF_WIDTH_SCALE_M,
        "scale": rnd(obs_mod.SCALE, 6),
        "blocks": blocks,
        "describe": obs_mod.describe(),
    }, indent=1))
    return blocks


if __name__ == "__main__":
    tracks = export_tracks()
    car = export_car()
    blocks = export_obs()
    print("tracks:", [(t["name"], round(t["length"], 1)) for t in tracks])
    print("car footprint:", car["geometry"]["length"], car["geometry"]["width"], "ranges:", len(car["ranges"]))
    print("obs blocks:", [(b["name"], b["size"]) for b in blocks], "sum", sum(b["size"] for b in blocks))
    print("wrote", sorted(p.name for p in OUT.iterdir()))
