# kingpowerwalk

A reconstruction of the **King Power Mahanakhon** rooftop observation deck in Bangkok —
314 m up, 78 floors — as a 3D scene you explore as a controllable avatar, with a toggle
between first-person and third-person views.

Static HTML5 site. No build step. Runs in a desktop browser now; immersive VR on a Meta
Quest comes later (see *Roadmap*).

**Status: Phase 0 — scaffold.** The deck is a blocky placeholder you can walk around.
Nothing here is the real geometry yet.

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
| `W` `A` `S` `D` | Walk (world-axis — Phase 1 makes it camera-relative) |
| Mouse drag | Look around |
| `V` | Preview the first-person / third-person toggle |

Movement is on the player rig so the camera and the placeholder avatar stay together.
The `V` toggle is a stub that just moves the camera to a fixed behind-and-above offset
and shows the placeholder body — Phase 2 builds the real orbit-follow camera.

## Layout

```
index.html          entry point — markup only, no inline JS
CLAUDE.md           working agreement: the non-negotiables
SPEC.md             the full build spec
/js
  └── view-switch.js   FPS/TPS toggle stub (rebuilt properly in Phase 2)
/assets
  ├── /models       deck.glb, avatar.glb, skyline.glb
  ├── /animations   idle/walk/run clips if shipped separately
  ├── /textures
  └── /nav          navmesh.glb
```

## Tech

- **[A-Frame](https://aframe.io) 1.8.0** — pinned. Loaded from
  `https://aframe.io/releases/1.8.0/aframe.min.js`.
- Everything 3D is **glTF/GLB**, deliberately engine-neutral so a Babylon.js pivot stays
  cheap if the custom controller work drags (SPEC §2).
- No bundler, no `npm install`, no `node_modules`. What's committed is what ships.

Later phases add `c-frame/aframe-extras` (`animation-mixer`, `movement-controls`,
navmesh) and `aframe-blink-controls` (VR teleport), each pinned.

## Roadmap

Built desktop-first and tested in a browser after every phase; VR is a second pass on
the finished experience, tested on the headset.

**Track A — desktop**

- [x] **Phase 0** — Scaffold & deploy. Blocky deck, walkable with WASD + mouse.
- [ ] **Phase 1** — Rigged avatar + character controller, idle↔walk↔run, navmesh-constrained.
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

Third-party assets are checked before they land here (SPEC §12). Notably: OpenStreetMap
data is **ODbL and requires attribution** once the skyline goes in at Phase 4; Mixamo
assets follow Adobe's licence; any third-party Mahanakhon model needs its licence read
before it enters a public repo.
