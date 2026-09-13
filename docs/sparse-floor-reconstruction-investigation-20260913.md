# Sparse Floor Reconstruction Investigation

Status: method selection only. No reconstruction installed in the viewer.

## Evidence

MeetingRoom full RAD leaf scan: the initial X/Z column has two occupied 0.1m
cells containing one center each. Both are rejected by the current two-point
rule. Several 0.25m cells have two or more points and survive. A synthetic
regression reproduces coarse occupancy with no fine occupancy. This explains
the local density gap, not the validity of every visible floor or room origin.

## Primary Sources

- Open3D point-cloud tutorial: RANSAC plane segmentation; robust local planar
  patches; normal estimation and neighborhood parameters.
  https://www.open3d.org/docs/release/tutorial/geometry/pointcloud.html
- Open3D outlier filtering: statistical and radius-based filtering.
  https://www.open3d.org/docs/release/tutorial/geometry/pointcloud_outlier_removal.html
- 2DGS authors' implementation: reconstruction from trained surfels and camera
  datasets, with depth/normal regularization and TSDF mesh extraction.
  https://github.com/hbb1/2d-gaussian-splatting

Open3D detection proposes planes; it does not establish human-walkable floors.
A rectangular patch or convex hull can cover an actual opening. That is a
project-specific safety limitation, not an Open3D collision guarantee.
2DGS is not an existing-RAD-only conversion in its documented workflow.

## Candidate Comparison

1. Lower the global minimum count: reject as a production shortcut. It also
   retains isolated noise and changes wall/obstacle occupancy everywhere.
2. Fill coarse occupied voxels with fine boxes: reject as a shortcut. It
   preserves coarse-height errors and can obstruct stair edges and doorways.
3. Authoring-only local planar analysis: evaluate first, using the existing
   Open3D implementation. Keep raw supported geometry and gaps explicit.
4. Full retraining/surface reconstruction: separate project; not a viewer fix.

## Bounded Evaluation

- Work only on source-hash-bound copies, never the active user project.
- Extract a bounded neighborhood of raw leaf centers, retaining world transform,
  identity and original samples before any density filter. Reject oversize input.
- Use fixed seed and record library versions and parameters. Open3D is already
  installed on this machine; no package installation is required.
- Compare an observed floor, stair transition, tabletop, disconnected floors,
  doorway and an explicit hole. A horizontal plane alone cannot distinguish a
  tabletop from floor; initial-position and connectivity evidence are required.
- Plane detection output is diagnostic only. Do not turn bounding rectangles
  into colliders, fill an unobserved convex-hull interior or bridge missing data.
- Before any export: verify bounded observed support, obstacles, floor heights,
  both movement directions, visual framing and negative examples. Keep the
  existing runtime corridor/payload budgets. No renderer changes or startup bake.
- A successful fit alone is not permission to apply or distribute the scene.

Next: export a bounded raw neighborhood and run detection only. Record rejected
and accepted candidates, then evaluate support coverage before writing geometry.

## Negative Control

Open3D 0.19.0, fixed seed 7: a 4m square planar cloud with an explicit central
opening contains 5985 samples. RANSAC (0.01m threshold, 3-point samples,
1000 iterations) labels all 5985 points as plane inliers. The nearest observed
sample to the opening center remains 0.6m away; its bounding box spans the
entire 4m square. Thus even a perfect fit and bounding box do not prove the
opening is walkable. This control passed; no collider was generated.
