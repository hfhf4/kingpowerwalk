# Mahanakhon Rooftop VR — Build Spec (reconstructed 3D + walkable avatar)

Reconstruct the King Power Mahanakhon rooftop observation deck as a 3D scene you
explore as a controllable avatar, with a **toggle between first-person (FPS) and
third-person (TPS)** views. Runs in a desktop/mobile browser and in immersive VR
on a Meta Quest. Static HTML5 site on GitHub Pages.

*(Supersedes the earlier photosphere spec.)*

---

## 1. Definition of done
- Loads over HTTPS on desktop (mouse + WASD), mobile, and Quest Browser (6DoF + Enter VR).
- A rigged avatar walks around an accurately-proportioned deck; animation is driven
  by movement (idle / walk / run) and the avatar faces the direction of travel.
- A key / on-screen button / controller button switches **FPS ⇄ TPS**.
- Player is constrained to the deck (navmesh / collision); holds 72–90 fps on Quest.

---

## 2. Engine decision (read first)
**A-Frame is the default** — it keeps WebXR and static hosting trivial, and you're
driving the build with Claude Code, which can write the custom controller. The
trade-off: A-Frame has **no built-in third-person controller**. You assemble it from
`c-frame/aframe-extras` (`animation-mixer`, `movement-controls`, navmesh) plus small
custom components (`character-controller`, `third-person-camera`, `view-switch`).

**Pivot option: Babylon.js** ships a physics-based character controller with FPS and
TPS modes out of the box, with strong WebXR support (still pure HTML5/JS, still
GitHub-Pages-friendly). Three.js is the most flexible but the most boilerplate.

> Recommendation: start in A-Frame. Keep every 3D asset engine-neutral (glTF/GLB)
> so a Babylon pivot is cheap if the controller work drags.

---

## 3. Tech stack
- **A-Frame 1.6.0** — confirm the current release at aframe.io and bump.
- **c-frame/aframe-extras** — `animation-mixer` (avatar clips), `movement-controls`
  (rig locomotion + navmesh constraint). Pin a version.
- **aframe-blink-controls** — teleport in VR.
- **Custom components:** `character-controller` (input → movement + animation state),
  `third-person-camera` (orbit-follow), `view-switch` (FPS/TPS).
- **glTF/GLB** for all 3D assets. No build step. HTTPS mandatory for WebXR.

---

## 4. Avatar & animation pipeline
**Primary (durable, free): Mixamo (Adobe).** Provides both rigged characters and
animations (idle, walk, run, turn). Grab a character + clips, convert FBX → glTF
(Blender or an FBX2glTF converter), and drive with `animation-mixer` /
`THREE.AnimationMixer`. Blend idle↔walk↔run by movement speed; yaw the avatar to
face travel direction.

Custom avatar options:
- **VRoid Studio** → export `.vrm` → load via a VRM loader (three-vrm). Good for a
  stylised "you."
- **Ready Player Me** was the go-to selfie-avatar service but was acquired by Netflix
  in 2025 and wound down as a standalone product — **do not build a dependency on it**
  without confirming what still ships.

Keep the avatar Quest-friendly: one skinned mesh, modest bone count, 2–4 clips.

---

## 5. Reconstruction approach & accuracy references
You can't photogrammetry a rooftop + skyline. **Hand-build the deck** (it's geometric)
and place an accurate-enough city around it.

**Deck** (model in Blender from your own photos + reference; export glTF. Or block it
in-code, then refine):
- Real reference: roof at **314 m**, **78 floors**, square-prism tower with the
  pixelated / cuboid "helix" facade (architect **Ole Scheeren**), the glass **SkyWalk
  tray**, and a rooftop bar. Coordinates 13.7236°N, 100.5283°E, Silom/Sathon.
- Model the top few floors + the deck surface + the top run of the pixel facade +
  the central spire/core + railings + the glass tray + the rooftop bar footprint.

**Skyline** (for "as accurate as possible," ranked):
1. **OSM-extruded low-poly Bangkok** — pull real building footprints (Blender-OSM /
   OSMBuildings) around the tower and extrude to real heights. Most data-accurate,
   scales, stays low-poly. Requires ODbL attribution.
2. **Distant skybox / cubemap** from real skyline photos — cheap far backdrop
   (a *backdrop*, not a navigable photosphere).
3. **Hand-placed low-poly landmarks** + correct Chao Phraya river direction.
   Combine 1 (near) + 2 (far haze) for depth.

**Existing Mahanakhon models** (optional, for tower silhouette/facade reference only —
you still build the deck):
- Paid, digital/AR-VR licence: CGTrader, 3DModels.org (~US$93).
- Free but print-oriented STLs (Printables/Cults/MyMiniFactory) and a SketchUp 3D
  Warehouse model.
- *Lawyer's note to self:* read each licence before bundling anything into a public
  repo. Print STLs are usually personal-use and untextured; SketchUp/print geometry
  usually needs retopo for real-time. Safest is to model your own from photos.

---

## 6. FPS / TPS camera design
- Player **rig** holds the avatar and a camera pivot.
- **FPS:** camera at head height; optional first-person body (hide the head mesh).
  Locomotion: smooth (thumbstick) + teleport (VR), WASD (desktop).
- **TPS:** orbit-follow camera behind/above; avatar fully visible; walk-cycle plays
  with movement; avatar yaws to face travel; camera collision so it doesn't clip walls.
- **Toggle:** `V` key / on-screen button / controller button; persist the choice.
- **VR comfort:** third-person in a headset is unusual and can be nausea-inducing.
  Make **FPS the default in VR**; treat TPS in VR as an optional "diorama/spectator"
  mode (or restrict TPS to desktop). On desktop, both feel natural.

---

## 7. Locomotion & collision
- **VR:** `movement-controls` (smooth) + `blink-controls` (teleport); constrain to a
  **navmesh** so you can't walk off the deck.
- **Desktop:** WASD / gamepad, camera-relative; same navmesh.
- Invisible collision at the parapet and around the glass tray.

---

## 8. Quest performance budget
- Target **72–90 fps**; test on the actual headset during the VR track (not the desktop track).
- Merge static geometry; keep draw calls low; bake lighting into textures where possible.
- Textures: compress (KTX2/Basis), power-of-two, avoid huge maps.
- Skyline: instancing / low-poly / baked; fog to hide the far cutoff.
- Avatar: single skinned mesh, modest bones, 2–4 animation clips.

---

## 9. Repo structure
```
mahanakhon-vr/
├── index.html
├── README.md
├── SPEC.md
├── /js
│   ├── character-controller.js
│   ├── third-person-camera.js
│   └── view-switch.js
└── /assets
    ├── /models      (deck.glb, avatar.glb, skyline.glb)
    ├── /animations  (walk/idle/run clips if separate)
    ├── /textures
    └── /nav         (navmesh.glb)
```

---

## 10. Phased plan — desktop-first, then a VR pass

Build and finish the whole experience on a flat screen (mouse + keyboard) first,
testing in a **desktop browser** after each phase. Only once the desktop version is
complete do we add immersive VR for the Quest — that's the VR track, tested on the
**headset**. Because this is A-Frame, the desktop work carries straight over; the VR
track adds controller locomotion, comfort and performance tuning rather than rebuilding.

### Track A — Desktop browser (test in a browser)

**Phase 0 — Scaffold & deploy.** Ship the blocky-deck starter (`index.html`) to
GitHub Pages; split the inline JS into `/js`. *AC:* HTTPS URL loads in a desktop
browser; you can walk the placeholder deck with WASD + mouse.

**Phase 1 — Avatar + controller (desktop).** Load a rigged Mixamo avatar with
idle/walk(/run); build `character-controller.js` with camera-relative WASD + mouse,
avatar faces travel direction, idle↔walk↔run blend by speed, constrained to a navmesh.
Replace the box placeholder. *AC:* avatar walks and animates correctly on desktop;
can't leave the deck.

**Phase 2 — FPS/TPS toggle (desktop).** Build the orbit-follow TPS camera and the FPS
camera; wire the toggle to the `V` key + an on-screen button; camera collision in TPS.
*AC:* switching views works on desktop without breaking movement.

**Phase 3 — Accurate deck.** Replace the blocky deck with the Blender-modeled glTF
(real proportions, glass tray, pixel parapet, spire, rooftop bar, textures); bake or
fake lighting. *AC:* deck reads as Mahanakhon; smooth on desktop.

**Phase 4 — Skyline & atmosphere.** Add OSM-extruded low-poly Bangkok and/or a
real-photo skybox; fog/haze; optional day/night. *AC:* convincing 314 m altitude.

**Phase 5 — Desktop polish.** Ambient audio (wind + faint city) on a user gesture;
signage ("Mahanakhon SkyWalk · 314 m"); clickable teleport hotspots to the best
viewpoints; small UI overlay (controls hint + view toggle); optional mobile-browser
touch controls. *AC:* a complete, polished desktop experience — feels like a place.

> **Milestone:** desktop version done. Everything below is the VR track.

### Track B — VR / Quest (now put the headset on)

**Phase 6 — VR interaction.** Add the WebXR immersive path: Enter VR on Quest, 6DoF
head tracking, controller locomotion (left-thumbstick smooth via `movement-controls`
+ teleport via `blink-controls`), constrained to the same navmesh; bind the FPS/TPS
toggle to a controller button; **FPS is the default in VR**, TPS a clearly-labelled
optional "diorama" mode. *AC:* you can enter VR, move, and switch views comfortably on
the headset; desktop still works unchanged.

**Phase 7 — VR performance & comfort.** Tune to the Quest budget: 72–90 fps, merged
geometry, low draw calls, compressed/power-of-two textures, baked lighting, instanced/
low-poly skyline; add comfort options (vignette on motion, snap-turn). *AC:* holds
frame rate on-device with no dropped frames while looking around.

---

## 11. Deployment
GitHub Pages: **Settings → Pages → deploy from `main` (root)** → open the HTTPS URL in
Quest Browser → Enter VR. Alternative: your own VPS behind **Caddy** (auto-HTTPS).

---

## 12. Licensing checklist
- **Mixamo** assets — per Adobe's licence.
- **Any third-party Mahanakhon model** — read the specific licence before committing to a public repo.
- **OSM data** — ODbL; include attribution.
- **Photos / panoramas** — your own only.

---

## 13. First messages to Claude Code
> Read SPEC.md. We're building the reconstructed-3D Mahanakhon rooftop app in A-Frame,
> **desktop-first — no VR work until Track B.** Do **Phase 0 only**: confirm
> `index.html` runs, set up the repo structure + README + .gitignore, split the inline
> JS into `/js` components, and deploy to GitHub Pages over HTTPS. Stop so I can test
> in a desktop browser.

Then:
> Phase 1 (desktop only): add a rigged Mixamo avatar at `/assets/models/avatar.glb`
> with idle + walk clips. Build `js/character-controller.js`: camera-relative WASD +
> mouse, blend idle↔walk by speed, yaw the avatar to face movement, constrain to a
> navmesh. No VR input yet. Stop after.
