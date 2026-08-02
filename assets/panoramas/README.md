# /assets/panoramas

The real 360 backdrop goes here as `skyline.jpg`.

**Requirements:** a 2:1 equirectangular JPG. A raw Insta360 `.insp` or a
dual-fisheye frame will not work — re-export as equirectangular first.

To switch it on, set the `src` on the `#panorama` entity in `index.html`:

```html
<a-entity id="panorama"
          photo-skybox="src: assets/panoramas/skyline.jpg; yaw: 0; radius: 9000"></a-entity>
```

Then turn `yaw` (degrees) until the photographed skyline lines up with the deck.
It will not be zero: the tower was rotated ~70.3° in Phase 3 to square its roof
to the world grid, so world axes do not point north.

Only the repo owner's own photos belong here (SPEC §12).
