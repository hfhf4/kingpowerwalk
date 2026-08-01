# CLAUDE.md — kingpowerwalk

Working agreement for this repo. `SPEC.md` is the build spec; this file is the set of
rules that hold across every phase. **Read both before changing anything.**

---

## Non-negotiables

### 1. Static site. No build step.
Plain HTML, CSS and JS served straight from the repo root. GitHub Pages serves these
files verbatim — what is committed is what ships.

- **No** bundler, transpiler, or package manager step (no webpack/vite/rollup/esbuild).
- **No** `npm install` as a prerequisite to running the site. There is no `node_modules`.
- **No** framework requiring compilation (no JSX, no TypeScript needing `tsc`).
- Libraries come in via `<script src="...">` from a CDN, or are vendored as plain `.js`.
- ES modules loaded directly by the browser are acceptable; anything needing a
  compile pass is not.

If a task seems to need a build step, **stop and ask** rather than introducing one.

### 2. A-Frame is pinned. Verify the version before bumping.
Currently pinned to **A-Frame 1.8.0** (latest release, published 2026-06-23 — confirmed
against the npm registry and the aframevr/aframe releases page).

- Always load an explicit version. **Never** `aframe/releases/latest/` or an unpinned
  CDN path — an upstream release must never be able to change this site under us.
- Same rule for every third-party component (`aframe-extras`, `blink-controls`, …):
  pin an exact version, never a range or `latest`.
- Before changing a pin, **check the current release** and confirm the new version
  actually exists — don't bump from memory. Sources: `registry.npmjs.org/aframe`
  (dist-tags) and `github.com/aframevr/aframe/releases`.
- Record the version in one place in `index.html` and reference it from the README.

> Note for agents in this sandbox: `aframe.io`, `cdn.jsdelivr.net` and `unpkg.com` are
> blocked by the egress policy here, so the CDN URL itself cannot be fetched to verify.
> Use the npm registry (reachable) to confirm a version exists. A URL you cannot fetch
> is not a URL you may assume is broken — or assume is fine. Say which you did.

### 3. All 3D assets are glTF / GLB.
Every model, avatar, navmesh and animation clip ships as `.gltf` or `.glb`.

- **No** FBX, OBJ, DAE, STL, `.blend`, or engine-specific formats in `/assets`.
- Convert at authoring time (Blender / FBX2glTF); commit only the glTF result.
- This keeps a Babylon.js pivot cheap (SPEC §2) — engine-neutral assets are the whole
  point. Do not add a loader for a non-glTF format without asking.
- Keep `.blend` and other source files **out of the repo** (see `.gitignore`).

### 4. Desktop-first. No VR work until Track B.
Track A (Phases 0–5) is a flat-screen experience: mouse + keyboard, tested in a desktop
browser. **Do not** add WebXR entry, controller locomotion, teleport, or headset
performance work before Phase 6 — even if it looks like a small addition.

### 5. Stop after each phase so the human can test.
This is the one that matters most.

**At the end of every phase: commit, push, report what changed and how to test it, then
STOP.** Do not roll on into the next phase. Do not "just start" the next phase because
the current one went quickly. The human tests in a real browser between every phase and
that feedback shapes what comes next.

A phase is done when its Acceptance Criteria in `SPEC.md` §10 are met — not when the
code looks finished.

---

## Repo layout

```
kingpowerwalk/
├── index.html          entry point; markup only, no inline JS
├── CLAUDE.md           this file
├── README.md
├── SPEC.md             the build spec
├── /js                 one component per file
└── /assets
    ├── /models         deck.glb, avatar.glb, skyline.glb
    ├── /animations     idle/walk/run clips if shipped separately
    ├── /textures
    └── /nav            navmesh.glb
```

## Conventions

- **No inline JS in `index.html`.** Markup and `<a-entity>` declarations only; behaviour
  lives in `/js` as registered A-Frame components, one per file.
- Register components with `AFRAME.registerComponent` and use the schema for tunables —
  avoid module-scope mutable state.
- Keep `/js` files readable without a bundler: no imports of bare package names.
- Prefer A-Frame's declarative attributes over imperative `setAttribute` where either works.

## Licensing (SPEC §12)

Before committing any third-party asset, check its licence. Mixamo per Adobe's terms;
OSM data is ODbL and **requires attribution**; any third-party Mahanakhon model needs its
licence read before it goes into a public repo. Photos and panoramas: the human's own only.
