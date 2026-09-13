"""Offline plane-fit evidence only; never writes collision or project files."""
import argparse
import json
import re
from pathlib import Path

import numpy as np
import open3d as o3d
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

parser = argparse.ArgumentParser()
parser.add_argument('input', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
if args.input.stat().st_size > 16 * 1024**2:
    raise ValueError('Diagnostic input limit')
data = json.loads(args.input.read_text(encoding='utf-8'))
if not re.fullmatch('[a-f0-9]{64}', data['source']):
    raise ValueError('Source binding missing')
points = np.asarray(data['points'], dtype=np.float64)
if points.ndim != 2 or points.shape[1] != 3 or not 3 <= len(points) <= 100000:
    raise ValueError('Invalid point count')
if not np.isfinite(points).all() or np.abs(points).max() > 10000:
    raise ValueError('Invalid coordinates')
o3d.utility.random.seed(7)
cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points))
plane, indices = cloud.segment_plane(distance_threshold=.03, ransac_n=3, num_iterations=1000)
normal = plane[:3] / np.linalg.norm(plane[:3])
if normal[1] < 0:
    plane = -plane
    normal = -normal
inliers = points[indices]
target = np.array([0., -2.])
offsets = inliers[:, [0, 2]] - target
distances = np.linalg.norm(offsets, axis=1)
local = inliers[distances <= .5]
residuals = np.abs(inliers @ plane[:3] + plane[3]) / np.linalg.norm(plane[:3])
sector_angles = np.arctan2(offsets[distances <= .5, 1], offsets[distances <= .5, 0])
sectors = np.unique(np.floor((sector_angles + np.pi) / (np.pi / 4)).astype(int) % 8)
report = {
    'source': data['source'], 'open3d': o3d.__version__, 'seed': 7,
    'threshold': .03, 'iterations': 1000, 'points': len(points),
    'inliers': len(indices), 'plane': plane.tolist(), 'upNormal': float(normal[1]),
    'inlierResidualP95': float(np.quantile(residuals, .95)),
    'targetXZ': target.tolist(), 'nearestInlierXZ': float(distances.min()),
    'localInliersRadiusHalfMeter': len(local), 'occupiedOctants': len(sectors),
    'predictedY': float(-(plane[0]*target[0] + plane[2]*target[1] + plane[3])/plane[1]) if abs(plane[1]) > 1e-6 else None,
    'collisionApproved': False,
    'reason': 'Fit and neighborhood counts are not observed surface, hole, or headroom certification.'
}
args.output.mkdir(parents=False, exist_ok=False)
(args.output/'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
fig, ax = plt.subplots(figsize=(8, 7))
ax.scatter(points[:, 0], points[:, 2], s=2, c='#a7a7a7', label='Raw leaf centers')
ax.scatter(inliers[:, 0], inliers[:, 2], s=3, c='#197b96', label='Plane inliers (not a collider)')
ax.scatter([target[0]], [target[1]], s=85, marker='+', c='#c52727', label='Initial camera X/Z')
ax.set(xlabel='World X (m)', ylabel='World Z (m)', title='Observed support only: no gap filling')
ax.set_aspect('equal')
ax.legend(loc='best')
fig.tight_layout()
fig.savefig(args.output/'support.png', dpi=150)
plt.close(fig)
print(json.dumps(report))
