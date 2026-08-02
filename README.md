# kingpowerwalk

A reconstruction of the **King Power Mahanakhon** rooftop observation deck in Bangkok —
314 m up, 78 floors — as a 3D scene you explore as a controllable avatar, with a toggle
between first-person and third-person views.

Static HTML5 site. No build step. Runs in a desktop browser now; immersive VR on a Meta
Quest comes later (see *Roadmap*).

**Status: Phase 1 — avatar + controller.** A rigged avatar walks the blocky placeholder
deck, animated by movement and constrained to a navmesh. The deck itself is still a
stand-in; Phase 3 replaces it.

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

The `V` toggle is still the Phase 0 stub — a fixed behind-and-above camera offset.
Phase 2 builds the real orbit-follow camera.

## Layout

```
index.html          entry point — markup only, no inline JS
CLAUDE.md           working agreement: the non-negotiables
SPEC.md             the full build spec
/js
  ├── character-controller.js   movement, animation blending, navmesh constraint
  └── view-switch.js            FPS/TPS toggle stub (rebuilt properly in Phase 2)
/assets
  ├── /models
  │     └── avatar.glb   rigged avatar, Idle + Walk clips  (deck.glb, skyline.glb later)
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
- [ ] **Phase 2** — Proper FPS/TPS toggle with orbit-follow camera and camera collision.
- [ ] **Phase 3** — Accurate deck geometry: glass tray, pixel parapet, spire, rooftop bar.
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

Still to come (SPEC §12): OpenStreetMap data is **ODbL and requires attribution** once
the skyline goes in at Phase 4, and any third-party Mahanakhon model needs its licence
read before it enters a public repo.
