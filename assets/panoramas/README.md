# /assets/panoramas

Empty, and that is the current intended state.

The photographic backdrop was **considered and dropped**. The scene uses the
procedural gradient sky in `js/gradient-sky.js` instead, which needs no assets,
costs nothing to download, and has no licence to check.

`js/photo-skybox.js` remains in the repo, working but inactive, so the option
stays open. Nothing depends on it.

## If you do want a photo backdrop later

Drop a panorama here as `skyline.jpg` and point the `#panorama` entity at it in
`index.html`:

```html
<a-entity id="panorama"
          photo-skybox="src: assets/panoramas/skyline.jpg; yaw: 0; radius: 9000"></a-entity>
```

Then turn `yaw` (degrees) until the photographed skyline lines up with the OSM
city. It will not be zero: the tower was rotated ~70.3° in Phase 3 to square its
roof to the world grid, so world axes do not point north.

**What the image has to be:**

- **2:1 equirectangular JPG.** A raw Insta360 `.insp`, a dual-fisheye frame, or
  anything cropped off 2:1 will not map correctly onto the sphere.
- **High resolution.** The photo wraps a full 360°, so horizontal pixels divide
  by 360 to give the effective detail. A 1024-wide image is 2.8 px per degree —
  on a 1920-wide viewport at ~80° fov that is roughly an 8× upscale, and it
  looks like a blur. A straight camera export (5760×2880, 6080×3040) is the
  right order of magnitude.
- **Shot from this deck.** The backdrop sits behind the OSM city, so a panorama
  taken from anywhere else will not line up no matter how the yaw is set.
- **The owner's own.** SPEC §12 restricts photos and panoramas to the repo
  owner's; a stock or third-party image cannot ship here.

The photo's lower band will be the deck the photographer stood on. That is fine
— the 3D deck is opaque and covers it.
