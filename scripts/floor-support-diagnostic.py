"""Bounded interpolation diagnostic. Geometry support is not collision approval."""
import numpy as np
from scipy.spatial import Delaunay


def inspect_support(points, target, max_edge=.3):
    p = np.asarray(points, dtype=float)
    target = np.asarray(target, dtype=float)
    if p.ndim != 2 or p.shape[1] != 3 or not 3 <= len(p) <= 100000:
        raise ValueError('Point limit')
    if target.shape != (2,) or not np.isfinite(target).all() or not np.isfinite(p).all():
        raise ValueError('Nonfinite geometry')
    if np.abs(p).max() > 10000 or not .05 <= max_edge <= .5:
        raise ValueError('Coordinate or edge limit')
    xz, inverse = np.unique(p[:, [0, 2]], axis=0, return_inverse=True)
    lower = np.full(len(xz), np.inf)
    upper = np.full(len(xz), -np.inf)
    np.minimum.at(lower, inverse, p[:, 1])
    np.maximum.at(upper, inverse, p[:, 1])
    if np.any(upper-lower > .03):
        raise ValueError('Ambiguous vertically stacked samples')
    vertices = np.column_stack([xz[:, 0], (lower+upper)/2, xz[:, 1]])
    mesh = Delaunay(xz)
    t = vertices[mesh.simplices]
    edges = np.stack([t[:, 1]-t[:, 0], t[:, 2]-t[:, 1], t[:, 0]-t[:, 2]], axis=1)
    lengths = np.linalg.norm(edges, axis=2).max(axis=1)
    cross = np.cross(t[:, 1]-t[:, 0], t[:, 2]-t[:, 0])
    size = np.linalg.norm(cross, axis=1)
    up = np.divide(np.abs(cross[:, 1]), size, out=np.zeros_like(size), where=size>1e-12)
    keep = (lengths <= max_edge) & (up >= .98) & (np.ptp(t[:, :, 1], axis=1) <= .08)
    index = int(mesh.find_simplex(target))
    return {'maxEdge': max_edge, 'triangles': len(t), 'retained': int(keep.sum()),
            'targetInterpolable': bool(index >= 0 and keep[index]),
            'targetTriangleMaxEdge': float(lengths[index]) if index >= 0 else None,
            'targetTriangleUpNormal': float(up[index]) if index >= 0 else None,
            'targetTriangleHeightSpan': float(np.ptp(t[index, :, 1])) if index >= 0 else None,
            'collisionApproved': False}
