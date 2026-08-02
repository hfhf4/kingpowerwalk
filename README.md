# kingpowerwalk

A reconstruction of the **King Power Mahanakhon** rooftop observation deck in Bangkok —
314 m up, 78 floors — as a 3D scene you explore as a controllable avatar, with a toggle
between first-person and third-person views.

Static HTML5 site. No build step. Runs in a desktop browser now; immersive VR on a Meta
Quest comes later (see *Roadmap*).

**Status: Phase 3 — the real tower.** The blocky placeholder is gone. A rigged avatar
walks the actual MahaNakhon roof, 314 m up, with the whole tower modelled beneath and
street level visible over the parapet.

---

## Run it

**Locally** — any static file server works. From the repo root:

```sh
python3 -m http.server 8000
```

then open <http://localhost:8000>.

Opening `index.html` as a `file://` URL will *mostly* work now, but breaks as soon as
models load (CORS), so prefer the server.

**Deployed** — GitHub Pages serves `main` from the repo root. WebXR requires HTTPS,
which Pages provides; that's why the eventual Quest testing happens on the deployed URL
rather than a local server.

## Controls (Phase 0)

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Walk, relative to where the camera is looking |
| `Shift` (hold) | Move faster |
| Mouse drag | Look around |
| `V` | Preview the first-person / third-person toggle |

The avatar turns to face the way it's travelling, and blends between its idle and walk
clips based on how fast it is actually moving. You can't walk off the deck or through
the lift core — movement is constrained to a navmesh, and running into the parapet at
an angle slides you along it.

There is no separate run clip. Holding `Shift` moves faster and plays the walk cycle
proportionally faster to match, so the feet stay planted rather than skating.

`V` (or the on-screen button) switches between first and third person. In third person
the camera orbits the avatar's head — drag to swing it around her — and pulls in when
something solid gets between the two, so it never ends up inside the lift core. Your
choice is remembered between visits.

## Layout

```
index.html          entry point — markup only, no inline JS
CLAUDE.md           working agreement: the non-negotiables
SPEC.md             the full build spec
/css
  └── overlay.css               controls hint + view-toggle button
/js
  ├── character-controller.js   movement, animation blending, navmesh constraint
  ├── third-person-camera.js    orbit-follow camera + collision
  └── view-switch.js            FPS/TPS toggle: input, mode, persistence
/assets
  ├── /models
  │     ├── avatar.glb   rigged avatar, Idle + Walk clips
  │     ├── tower.glb    the whole tower, roof at y=0, base at y=-314
  │     └── deck.glb     deck surface + parapet, fitted to the real roof
  ├── /animations        (clips are embedded in avatar.glb for now)
  ├── /textures
  └── /nav
        └── navmesh.glb  walkable surface of the deck
```

## Tech

- **[A-Frame](https://aframe.io) 1.8.0** — pinned. Loaded from
  `https://aframe.io/releases/1.8.0/aframe.min.js`.
- Everything 3D is **glTF/GLB**, deliberately engine-neutral so a Babylon.js pivot stays
  cheap if the custom controller work drags (SPEC §2).
- No bundler, no `npm install`, no `node_modules`. What's committed is what ships.

Animation is driven by `THREE.AnimationMixer` directly rather than `aframe-extras`'
`animation-mixer`. Blending idle↔walk by *speed* needs continuous control over clip
weights, which the mixer gives us and a clip-switching component does not — and it
avoids a second pinned CDN dependency. `aframe-extras` still comes in at Phase 6 for
`movement-controls`, alongside `aframe-blink-controls` for VR teleport, each pinned.

### Camera rig

`look-controls` sits on a **pivot** entity at head height, not on the camera. The camera
is a child of that pivot, offset back and up along it. Because the pivot rotates and the
camera does not, the camera swings *around* the avatar rather than turning on the spot —
which is what makes third person an orbit rather than a shove backwards.

First person is the same rig with the offset collapsed to zero, so switching views is an
animated change of one offset. Both views share a single heading, which is why switching
can't desync movement: `character-controller` reads the camera's world direction either
way, and never has to know which view is active.

Camera collision casts a ray from the pivot out to where the camera wants to be, against
anything tagged `.collider`, and pulls the camera in short of the first hit. The parapet
is only 1.1 m tall and the camera orbits at roughly 2.25 m, so it clears the wall and
hangs out over the edge — correct for a rooftop. The lift core is what actually blocks.

### The tower

`tower.glb` is converted from a SketchUp STL of King Power MahaNakhon. Four decisions
worth knowing:

- **Scale is pinned to the roof, not the top of the model.** The highest geometry at
  z=12600 is the antenna masts — 16 sliver triangles, not a surface. The roof is the
  585 m² slab at z=12204. Scaling to the masts would have hung the deck 10 m in the air.
  Scaled to the roof, it lands at 314 m with the masts standing ~10 m proud, as they do
  on the real building.
- **Z-up to Y-up**, and the base ends up at y=-314, which is where the street plane sits.
- **The tower is rotated to square it up.** In the source it sits diagonally, so its roof
  reads as a parallelogram in world XZ and no axis-aligned deck fits without overhanging.
  The roof slab's principal axis is found by PCA and cancelled. Nothing geographic
  depends on the original bearing yet — Phase 4's OSM skyline is what would care.
- **Winding is fixed against each facet's stored normal.** SketchUp exported nine facets
  wound against their own normal; with a single-sided material those render as holes.

The tower is scenery. Nothing collides with it except the third-person camera.

### The deck

`deck.glb` and `navmesh.glb` are generated by sampling the converted tower with a grid of
downward rays at 0.5 m, rather than hand-authored. The roof is not a clean rectangle — it
carries two rooftop plant rooms and a recessed pocket on the west side — so a slab drawn
to the bounding box would clip straight through them.

A cell is walkable if a ray hits the tower within ±0.5 m of y=0. Higher hits are
structures, lower hits and misses are voids; both are excluded. The deck is those cells
as a thin surface just above the roof, with a parapet wherever a cell borders something
that is not walkable. The navmesh is the same mask eroded by 1 m so the avatar's
shoulders cannot overhang the edge — 628 m² of deck, 436 m² of it walkable.

### Asset pipeline

Source FBX files are deliberately **not** committed (see `.gitignore`); only the glTF
result ships. `assets/models/avatar.glb` was built from two Mixamo exports with
[FBX2glTF](https://github.com/facebookincubator/FBX2glTF) and
[glTF-Transform](https://gltf-transform.dev):

1. Convert each FBX to GLB.
2. Take the character + its clip as the base, rename that clip `Idle`.
3. Copy the walk animation's channels onto the base skeleton, matching by bone name,
   and name it `Walk`.
4. **Strip the walk clip's root motion** — pin the hips' X/Z to frame 0 and keep the Y
   bob. Mixamo's "In Place" export option does the same thing; without it the animation
   fights the controller for control of position.
5. `dedup()`, `prune()`, write.

Step 4 also yields the number `character-controller` needs: the hips travelled 1.607 m
over the 1.25 s clip, so the animation was authored to walk at **1.29 m/s**. That is the
component's `clipStrideSpeed`, and playing the clip at `speed / clipStrideSpeed` is what
keeps the feet from skating at any speed.

`assets/nav/navmesh.glb` is generated geometry — a 28.8 m square ring inset from the
parapet by a body radius, with a 6.8 m cutout around the lift core. 16 verts, 8
triangles, ~783 m². Phase 3 regenerates it from the real deck.

## Roadmap

Built desktop-first and tested in a browser after every phase; VR is a second pass on
the finished experience, tested on the headset.

**Track A — desktop**

- [x] **Phase 0** — Scaffold & deploy. Blocky deck, walkable with WASD + mouse.
- [x] **Phase 1** — Rigged avatar + character controller, idle↔walk blend, navmesh-constrained.
- [x] **Phase 2** — FPS/TPS toggle with orbit-follow camera and camera collision.
- [x] **Phase 3** — Real tower from STL, deck fitted to the roof, street level 314 m below.
      *(Glass SkyWalk tray still outstanding from this phase.)*
- [ ] **Phase 4** — Skyline & atmosphere: OSM-extruded Bangkok, haze, 314 m altitude read.
- [ ] **Phase 5** — Polish: ambient audio, signage, viewpoint hotspots, UI overlay.

**Track B — VR / Quest**

- [ ] **Phase 6** — WebXR: Enter VR, 6DoF, controller locomotion + teleport.
- [ ] **Phase 7** — Performance & comfort: 72–90 fps, vignette, snap-turn.

Full acceptance criteria for each phase are in [SPEC.md](SPEC.md) §10.

## Reference

Roof at 314 m · 78 floors · 13.7236°N, 100.5283°E · Silom/Sathon, Bangkok.
Square-prism tower with the pixelated cuboid "helix" facade by architect Ole Scheeren,
a glass SkyWalk tray, and a rooftop bar.

## Attribution & licensing

The avatar in `assets/models/avatar.glb` is derived from
**["Free 018 Kana Tablet"](https://sketchfab.com/3d-models/free-018-kana-tablet-9da9099962e946a185cbc71d7754f034)
by [ddd](https://sketchfab.com/endonoriko), licensed
[CC BY 4.0](http://creativecommons.org/licenses/by/4.0/).** The mesh and skeleton are
unchanged; the walk animation was added and root motion removed.

Its animation clips come from [Mixamo](https://www.mixamo.com) and are used under
Adobe's licence.

**The tower model needs its provenance recorded.** `tower.glb` is derived from a
SketchUp STL of King Power MahaNakhon supplied by the repo owner. SPEC §12 requires any
third-party Mahanakhon model to have its licence read before it enters a public repo,
and this repo is public. If the STL came from 3D Warehouse, a print site, or anywhere
other than the owner's own modelling, its licence and attribution belong here.

Still to come (SPEC §12): OpenStreetMap data is **ODbL and requires attribution** once
the skyline goes in at Phase 4.
