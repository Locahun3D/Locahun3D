# Walk entry and clearance, 2026-09-16

Local implementation; not published.

- Walking uses a 1 m feet-origin capsule, independent of the avatar's visual height. Replacement cores and AR reposition use the same dimensions. Normal camera collision remains unchanged. Upper-body geometry can overlap overhead scan geometry by design; floor and lower-body walls remain blocking.
- Successful file import now permits one collision bake if saved geometry is unavailable. Existing persistent proxies remain preferred; entry joins an in-progress job. Background camera polling still cannot repeatedly bake. Source changes/cancellation retain existing safeguards.
- Walk entry resolves the floor vertically beneath the current camera after asset preparation, rather than saved/automatically selected spawn. No floor is fabricated if the downward query or support check fails. Existing downward range is 20 m. Saved spawn metadata remains compatible, but does not determine ordinary entry. Fall recovery is relative to this entry's floor.
- 111 focused import/lifecycle/whole-proxy/input tests passed; 49 additional physics/bridge/cancellation tests passed (four tests overlap).
- Chrome canonical-template fixture with real Rapier passed. Upper-storey spawn (2, 3.05, 0), walk beneath a head-height slab, stop at lower-body wall z=4.67, retain upper floor y=3.01. Repeated taps, rotation, tools and jump regression scenarios passed. No browser errors.
- Evidence: F:/Codex/3dgs-renderer-research-20260911/click-browser-1789569753740. Screenshot inspected on the preceding identical-geometry run. Colliders in this fixture are not visual meshes; this is movement verification, not a visual-quality claim.
- Build and diff check passed. Physical iPhone/iPad and large raw-scan bake performance have not been verified; no rendering-quality or point-budget settings were changed.
