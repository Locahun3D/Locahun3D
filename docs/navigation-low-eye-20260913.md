# Saved Low Camera Navigation

4FStudio read-only ZIP copied to the isolated QA package. Regional preparation
produced212654bytes, source8d21fba55294a9c34f55d5fa46d99cbc20c6be68e9992af988b478b0e91614e9,
while retaining the0.25m coarse proxy. Source ZIP and original projects unchanged.

The saved cameraY=-.0485 has coarse supportY=-1.25 and fine supportY=-1.4.
The previous diagnostic incorrectly raised its eye before clicking. With that
normalization removed, room-browser-1789289084664 reproduces a rejected route:
the actual query starts at cameraY-1.8=-1.8485, below the floor. A second gate
also treats the low eye as full-height feet, rejecting corridor coverage.

404 now selects a bounded observed downward support for route origin. On a
verified route starting in the same X/Z column, only the initial vertical lift
adapts the virtual capsule height and floor coordinate. The camera never snaps;
the normal sampled controller still checks coverage, capsule and sphere sweep.
No collision, rendering, route-distance or memory budget was expanded.

Two red-first adapter regressions pass. Actual Rapier controls confirm an open
floor succeeds and both a thin wall and a low ceiling stop the movement.127
navigation/input tests pass.4F actual saved-position browser click succeeds
in room-browser-1789289409715:1.0111m horizontal travel, endsY=.43 (floor+1.8),
no page errors; screenshot inspected. Original2F stair/mouse/hold/touch regression
passes in browser-1789289531205; held screenshot inspected.

MeetingRoom's sparse floor is a distinct unresolved issue, not fixed by this
change. Physical iPad Safari and arbitrary multi-region buildings remain outside
this verification. Publication status is in the current checkpoint document.
