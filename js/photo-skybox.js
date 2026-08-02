/* global AFRAME, THREE */

/**
 * photo-skybox — a real 360 photo behind everything else (SPEC §5, Phase 5).
 *
 * An equirectangular panorama mapped onto the inside of a large sphere, drawn
 * *behind* all 3D geometry so the tower, the OSM city and the drop over the
 * parapet all still render in front of it. The photo is a backdrop, not a
 * navigable photosphere (SPEC §5 is explicit about that distinction).
 *
 * How it stays behind everything, which is the whole trick:
 *
 *   - `depthWrite: false` and `depthTest: false` so it never occludes anything
 *     and nothing has to out-depth it. This is deliberately *not* the approach
 *     a-sky uses: a-sky writes depth, which is why its default 500 m radius
 *     silently swallowed the entire city in Phase 4. Radius stops mattering
 *     here, but a large one is still used so it reads as far away.
 *   - `renderOrder = -1000`, so it is drawn first and everything else paints
 *     over it.
 *   - `side: BackSide`, since we are inside the sphere.
 *   - `fog: false` — a backdrop that fogs would double-haze.
 *
 * `yaw` rotates the panorama about the vertical axis so the photographed
 * skyline can be lined up with the deck's real orientation. The tower model was
 * rotated ~70.3° in Phase 3 to square its roof to the world grid, so world axes
 * do not point north and this offset will not be zero. It is a plain degrees
 * value — turn it until the river is in the right place.
 *
 * The photo's lower band is the deck the photographer was standing on; the 3D
 * deck is opaque and sits over it, so it is never seen.
 */
AFRAME.registerComponent('photo-skybox', {
  schema: {
    src:     { type: 'string' },
    radius:  { type: 'number', default: 9000 },
    yaw:     { type: 'number', default: 0 },
    // Lifts the photo's horizon to meet the OSM city's. Small values only.
    pitch:   { type: 'number', default: 0 },
    opacity: { type: 'number', default: 1 },
    enabled: { type: 'boolean', default: true }
  },

  init: function () {
    this.mesh = null;
    this.build();
  },

  update: function (old) {
    if (!this.mesh) { return; }
    if (old && old.src !== this.data.src) { this.build(); return; }
    this.applyOrientation();
    this.mesh.visible = this.data.enabled;
    this.mesh.material.opacity = this.data.opacity;
    this.mesh.material.transparent = this.data.opacity < 1;
  },

  applyOrientation: function () {
    if (!this.mesh) { return; }
    this.mesh.rotation.set(
      THREE.MathUtils.degToRad(this.data.pitch),
      THREE.MathUtils.degToRad(this.data.yaw),
      0
    );
  },

  build: function () {
    var self = this;
    if (this.mesh) {
      this.el.removeObject3D('skybox');
      this.mesh = null;
    }
    if (!this.data.src) { return; }

    var loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(this.data.src, function (texture) {
      texture.colorSpace = THREE.SRGBColorSpace !== undefined
        ? THREE.SRGBColorSpace
        : texture.colorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;

      var geo = new THREE.SphereGeometry(self.data.radius, 64, 40);
      var mat = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false
      });

      var mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = -1000;
      mesh.frustumCulled = false;

      self.mesh = mesh;
      self.el.setObject3D('skybox', mesh);
      self.applyOrientation();
      self.el.emit('skybox-loaded', { src: self.data.src }, false);
    }, undefined, function () {
      console.warn('[photo-skybox] could not load ' + self.data.src +
                   ' — falling back to the gradient sky');
      self.el.emit('skybox-error', { src: self.data.src }, false);
    });
  },

  remove: function () {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (this.mesh.material.map) { this.mesh.material.map.dispose(); }
      this.mesh.material.dispose();
      this.el.removeObject3D('skybox');
      this.mesh = null;
    }
  }
});
