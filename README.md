# kingpowerwalk

A reconstruction of the **King Power Mahanakhon** rooftop observation deck in Bangkok —
314 m up, 78 floors — as a 3D scene you explore as a controllable avatar, with a toggle
between first-person and third-person views.

Static HTML5 site. No build step. Runs in a desktop browser now; immersive VR on a Meta
Quest comes later (see *Roadmap*).

**Status: Phase 5 — desktop complete.** A rigged avatar walks the actual MahaNakhon
roof, 314 m up, over 7,550 real Bangkok buildings from OpenStreetMap. Jump, fall the full
314 m and respawn; travel between viewpoints; wind and city ambience. This finishes
Track A — everything after this is the VR track.

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

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Walk, relative to where the camera is looking |
| `Shift` (hold) | Move faster |
| `Space` | Jump |
| Mouse drag | Look around |
| `V` | Switch first-person / third-person |
| Click a ring | Travel to that viewpoint |

On touch devices a thumbstick and a jump button appear; look stays on drag. They are
hidden entirely on anything that doesn't report touch support.

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
  └── overlay.css               controls hint, ODbL credit, view-toggle button
/js
  ├── ambient-audio.js          synthesised wind + city hum, mute toggle
  ├── character-controller.js   movement, jump/gravity, animation, navmesh
  ├── deck-features.js          sign, viewpoint hotspots, fall fade
  ├── gradient-sky.js           procedural sky gradient shader
  ├── photo-skybox.js           360 photo backdrop (present but unused)
  ├── third-person-camera.js    orbit-follow camera + collision
  ├── touch-controls.js         mobile thumbstick + jump
  └── view-switch.js            FPS/TPS toggle: input, mode, persistence
/assets
  ├── /models
  │     ├── avatar.glb   rigged avatar, Idle + Walk clips
  │     ├── tower.glb    the whole tower, roof at y=0, base at y=-314
  │     ├── deck.glb     deck surface + parapet, fitted to the real roof
  │     └── skyline.glb  7,550 OSM buildings + the Chao Phraya
  ├── /animations        (clips are embedded in avatar.glb for now)
  ├── /panoramas         empty by design — photo backdrop dropped, see its README
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

### Tuning the layout — `?tune`

Add `?tune` to the URL for a dev panel that previews layout and prop changes live.
Without it nothing loads: no panel, no stylesheet, no generator.

The panel exists because the two things worth nudging sit on opposite sides of the
build. The sign, the viewpoint rings and the spawn point are entity attributes, so any
inspector could move them — but deck depth, tray extent, railing inset, stairs, The Peak
and the elevator live in `data/level78-layout.json` and are baked into `deck.glb` /
`navmesh.glb` by `tools/build_level78.py`. An inspector can drag the finished mesh; it
cannot make the tray deeper and give you a navmesh that agrees.

So `js/level78-geometry.js` is that generator ported to the browser: move a slider and
both meshes regenerate, including the navmesh, so you can **walk out onto a proposed
layout immediately**. Two guards run while you drag, because both of these have shipped
broken once — the tray must stay clear of the tower roof at X = 22.98, and the navmesh
must stay continuous from the deck out to the tray.

It is preview only. Nothing is written back; `tools/build_level78.py` stays the single
source of truth for what ships. Settle on numbers, copy them out of the readout pane,
put them in `data/level78-layout.json` and re-run the script.

Two implementations of one generator can drift, so the test harness compares the port
against the committed GLBs on vertex count, triangle count and bounding box. They match
exactly today (272v/436t opaque, 56v/84t glass, 10228v/5114t navmesh).

### The skyline

`skyline.glb` is 7,550 Bangkok building footprints from OpenStreetMap, extruded to their
tagged heights — `height` where present, otherwise `building:levels` × 3.2 m. Everything
within 1.2 km survives; past that only buildings with a tagged height, since untagged
shophouses 3 km out are invisible clutter. Nothing beyond 4 km. The Chao Phraya and the
city's ponds come from the same export as flat water polygons.

**Aligning it to the tower was the interesting part.** Phase 3 rotated the tower ~70.3°
to square its roof to the world grid, so world axes no longer point north and OSM data
cannot be dropped in at true bearing. Two things resolve it:

- The SketchUp model's axes were already true north/east. OSM's minimum-area rectangle
  for the Mahanakhon footprint sits at **−70.06°**; PCA on the STL roof slab gave
  **−70.33°**. Two unrelated datasets agreeing within 0.3° is what confirms it.
- So the same rotation aligns both, and the build script recomputes it from the STL
  rather than hard-coding it, so tower and city cannot drift apart.

The residual offset is solved by putting OSM's Mahanakhon footprint centroid on the
STL's own mid-shaft centroid — the one building both datasets contain. Mid-shaft rather
than base, because the STL's base includes a retail podium (107 × 113 m) that OSM's
building outline (76 × 92 m) does not.

Positions are quantized to 14 bits via `KHR_mesh_quantization`, roughly 0.75 m of vertex
precision over a 12 km span. Invisible on a city seen from 300 m up, and it halves the
file to 4.1 MB. three.js reads the extension natively.

### Jumping and the drop

`Space` jumps. Gravity and ground contact are probed against the **navmesh**, not the
deck mesh — the navmesh is already inset from the edge, so "no navmesh underfoot" is
exactly the condition for falling, and the two never disagree.

Grounded movement stays navmesh-constrained, which is Phase 1's "can't leave the deck".
Getting off means **jumping the parapet**: while airborne the constraint is deliberately
lifted, so you keep your momentum and go over. That is also realistic — the parapet is
1.1 m and a jump apexes at ~0.66 m, so you clear it horizontally rather than stepping off.

Fall past y = −300 and `player-fell` fires: the screen fades to black, the player is put
back on the deck while it's dark, and it fades back in. Resetting at full black is what
hides the teleport.

There is no Jump clip in `avatar.glb` — only Idle and Walk — so the hop is faked by
holding the walk cycle at a mid-stride frame with playback frozen. It reads as a leap
without inventing a clip.

### Sound

Wind and a faint city hum, **synthesised with the Web Audio API** rather than loaded from
files: no audio assets exist in the repo, it costs nothing to download, it loops
seamlessly by construction, and it keeps `/assets` free of media whose licence would need
checking (SPEC §12). Two detuned bandpassed noise layers for wind, heavily lowpassed
brown noise for the city, and a very quiet 100 Hz tone for the mains undertone. Filter
frequencies and gains drift slowly so nothing sits still.

Browsers refuse audio without a user gesture, so the context is only created on the first
pointer or key event — building it earlier leaves it suspended and silent. Mute persists.

### A trap worth knowing about

**`a-sky` defaults to a radius of 500 m, and the dome writes depth.** Anything further
away fails the depth test and is silently never drawn — no error, no warning. It hid the
entire city and most of the ground plane, while raycasts against them kept working
perfectly, which makes it present as a fog or material bug rather than a clipping one.
The sky is now given `radius="12000"`, inside the camera's 20000 far plane.

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
- [x] **Phase 4** — OSM-extruded Bangkok, the Chao Phraya, gradient sky and haze.
      *(Day/night cycle not attempted.)*
- [x] **Phase 5** — Jump and the 314 m drop, ambient audio, signage, viewpoint hotspots,
      UI overlay, touch controls. *(Photo backdrop considered and dropped — the
      procedural sky is what ships. See `/assets/panoramas`.)*

> **Track A complete.** Everything below is the VR track.

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

`assets/models/tower.glb` is derived from
**["King Power MahaNakhon"](https://3dwarehouse.sketchup.com/model/4461a0f4-de95-496e-aeef-5f099f449211/King-Power-MahaNakhon)**,
published on Trimble 3D Warehouse and used under the
[3D Warehouse Terms of Use](https://3dwarehouse.sketchup.com/tos.html). The geometry is
unchanged apart from scaling to 314 m, a plan rotation, an axis conversion and winding
repairs; see *The tower* above.

**No authorship of the building model is claimed here.** It is someone else's work,
reused under that licence to build a walkthrough. This project's own contribution is the
conversion, the deck, the controller and the scene around it — not the tower.

`tower.glb` ships as scene geometry for a browser walkthrough, not as an asset for
download: it is not offered, catalogued or packaged as a model, and it is not sold. It
lives in the repo because GitHub Pages serves the site *from* the repo — on Pages there
is no way to publish a web walkthrough without the geometry being a fetchable file.

The source STL is deliberately not committed (CLAUDE.md §3 keeps `/assets` glTF-only).
Worth being clear that this is an assets convention rather than a licensing device: the
GLB carries the same geometry, so the Terms of Use apply to it exactly as they do to the
STL. Anyone reusing this repo should read them rather than assume the conversion changed
something.

"King Power MahaNakhon" is a real building and a trademarked name. Nothing here is
affiliated with, sponsored by, or endorsed by its owners or operators.

`assets/models/skyline.glb` is built from **© [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors**, licensed under the
**[Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/)**. The
attribution is shown on screen in the running site as well as here, since ODbL requires
it to travel with the data. The extruded geometry is a Produced Work derived from that
database.
