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

## Real Neighborhood

Read-only export room-browser-1789287261565/neighborhood.json retains 5757 raw
leaf centers within X[-2,2], Y[-5,-3], Z[-4,0], bound to the MeetingRoom
navigation source identity. No density filtering is applied to this export.
diagnose-floor-plane.py (Open3D0.19.0, seed7, threshold.03m, 1000 iterations)
finds 1953 inliers; upward normal component.999853, inlier residual p95.02417m.
At initial camera X/Z[0,-2], estimated planeY=-4.03762, nearest inlier.07670m;
35 inliers lie within.5m and occupy7/8 angular sectors. Output and inspected
support.png are in meetingroom-plane-01 under the private QA directory.

This is evidence of a local approximately horizontal cluster, not a collision
approval or proof the camera can reach it. Sparse regions, hole boundaries,
obstacles and full-route clearance remain unresolved. No collision was written.

## Bounded Triangulation Rejected As A Direct Fix

Seven diagnostic tests cover a dense plane, large opening, step, tabletop,
stacked floors, small opening, and rejection metrics. All pass. Crucially,
a small opening IS interpolated: an edge-length cutoff is not a hole detector.
The experiment remains diagnostic-only and always reports collisionApproved=false.

Single-thread Open3D runs meetingroom-plane-03 and -04 yield identical reports:
1962 inliers, predicted initial floor Y=-4.03108. The target triangle has
maximum edge .18235m, vertical span .04403m and upward normal .93792. It fails
the .98 normal requirement for every tested edge cap .1 through .5m. Loosening
that threshold or projecting all centers onto a plane would conceal rather
than resolve the source uncertainty. No such runtime change was made.

Fixed seed alone was insufficient with parallel Open3D; the diagnostic now sets
OMP_NUM_THREADS=1 before importing it. Previous fit values remain historical.

## Actual Gaussian Footprints

Read-only room-browser-1789288231769 exports the same 5757 centers plus world
one-sigma axis vectors and opacity, using the bundled Spark unpackSplat API and
the chunk's encoding. Every unpacked world center is checked against the old
center decoder. Matrix linear transforms preserve nonuniform scale/shear.
The original initial camera still has no fine support; browser diagnostic
correctly exits nonzero with no route, not a successful scene verification.

meetingroom-plane-05 probes the fitted point [0,-4.03108,-2]. Among107 Gaussian
centers within .5m horizontally, none contain it within1sigma,2 contain it
within2sigma and5 within3sigma; closest normalized radius1.00153. Median
principal sigmas are [.13879,.08291,.00769]m. This is density evidence at an
estimated point, NOT proof of an observed floor, free space or a solid volume.
No footprint was converted to collision, and no renderer/runtime change or
distribution update was made. Next investigate bounded surface evidence and
initial-camera validity together; do not fill the plane or blanket-inflate
Gaussians to make this fixture pass.

## Direct Rendered Ray Cross-Check

room-browser-1789290488740 adds a direct Spark mesh.raycast from the saved
camera straight down, without pickWorldPos or its fixed-depth fallback. The
first resident-splat hit is [0,-3.962198,-2], distance5.462198m, close to the
coarse collision hit at5.5m. Fine collision still has no hit at that column.
An81-position grid within2m horizontally has26 fine hits, including zero-distance
inside-geometry hits; these are not all floors. Thus the evidence does not
support assuming a simple render/collision translation mismatch. The actual
physical unit scale and safe initial support remain unverified; an estimated
plane atY=-4 is not certified as the user's intended floor.
