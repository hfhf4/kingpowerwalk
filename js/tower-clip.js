/* global AFRAME, THREE */

/**
 * tower-clip — hide the STL roof clutter that the Level 78 deck replaces.
 *
 * The tower model and the deck blockout describe the same physical floor twice.
 * `tower.glb` carries the roof as the SketchUp model has it — plant rooms about
 * 4 m tall and antenna masts to roughly 10 m — while `deck.glb` is a purpose
 * built Level 78 floor laid over the top. 600 tower vertices end up above the
 * deck surface inside its footprint, so the plant rooms punch through the floor
 * and the roof edge intersects the glass tray.
 *
 * The fix is a clipping plane rather than a rebuild. Trimming `tower.glb` would
 * mean editing the recovered asset, and the source STL is gitignored per
 * CLAUDE.md §3, so history is the only copy of it. A clip is reversible, costs
 * nothing, and leaves the file untouched.
 *
 * The plane keeps everything at or below `height` and discards the rest, so the
 * tower still provides the full 314 m drop, the facade and the silhouette — the
 * deck simply becomes the top surface. Clipping applies only to the tower's own
 * material, so the deck, the skyline and the avatar are unaffected.
 *
 * Trade-off worth knowing: this also removes the antenna masts, since they rise
 * from the same roof. Keeping them would need per-triangle trimming with the
 * masts identified as connected components, which is a rebuild rather than a
 * clip. Set `enabled: false` to see the original roof again.
 */
AFRAME.registerComponent('tower-clip', {
  schema: {
    height:  { type: 'number', default: 0.02 },
    enabled: { type: 'boolean', default: true }
  },

  init: function () {
    this.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), this.data.height);
    this.applied = false;

    var self = this;
    var model = this.el.getObject3D('mesh');
    if (model) { this.applyClip(model); }
    else {
      this.el.addEventListener('model-loaded', function (evt) {
        self.applyClip(evt.detail.model);
      }, { once: true });
    }
  },

  update: function () {
    if (!this.plane) { return; }
    this.plane.constant = this.data.height;
    var model = this.el.getObject3D('mesh');
    if (model) { this.applyClip(model); }
  },

  applyClip: function (model) {
    var self = this;
    var renderer = this.el.sceneEl && this.el.sceneEl.renderer;
    // localClippingEnabled is off by default; without it material.clippingPlanes
    // is silently ignored and nothing appears to happen.
    if (renderer) { renderer.localClippingEnabled = true; }

    model.traverse(function (o) {
      if (!o.isMesh || !o.material) { return; }
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      for (var i = 0; i < mats.length; i++) {
        mats[i].clippingPlanes = self.data.enabled ? [self.plane] : null;
        // The clip exposes the inside of a shell model, so both faces must draw
        // or the cut reads as a hole rather than a cross-section.
        mats[i].side = THREE.DoubleSide;
        mats[i].needsUpdate = true;
      }
    });
    this.applied = true;
    this.el.emit('tower-clipped', { height: this.data.height }, false);
  }
});
