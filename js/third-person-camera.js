/* global AFRAME, THREE */

/**
 * third-person-camera — orbit-follow camera with collision (SPEC §6, Phase 2).
 *
 * Attach to the camera entity. The camera must be a child of a pivot entity
 * that carries look-controls and sits at head height on the player rig:
 *
 *   #player  (rig, moved by character-controller)
 *     #pivot   (look-controls — yaw + pitch)
 *       #cam     (this component — offset back and up from the pivot)
 *     #you     (avatar)
 *
 * Because the pivot rotates and the camera is offset along the pivot's +Z, the
 * camera orbits the avatar's head instead of turning on the spot. The camera
 * keeps an identity rotation of its own, so it always looks back through the
 * pivot — which is also why character-controller can keep reading its world
 * direction for camera-relative movement, in either view.
 *
 * `enabled: false` collapses the offset to zero, which puts the camera exactly
 * on the pivot: that is first-person. Switching views is therefore just a
 * change of offset, animated by the same lerp, so FPS <-> TPS dollies rather
 * than cuts and never desyncs from movement.
 *
 * Collision: a ray is cast from the pivot out to where the camera wants to be.
 * If it hits any `.collider` geometry first, the camera is pulled in to just
 * short of the hit, so it never ends up on the far side of the parapet or
 * inside the lift core.
 *
 * The avatar is shown only once the camera has actually pulled far enough back
 * to be outside her head, rather than at the moment the mode flips — otherwise
 * you get a frame or two looking at the inside of her skull mid-transition.
 */
AFRAME.registerComponent('third-person-camera', {
  schema: {
    pivot:       { type: 'selector' },
    avatar:      { type: 'selector' },
    colliders:   { type: 'string', default: '.collider' },
    enabled:     { type: 'boolean', default: false },
    distance:    { type: 'number', default: 3.2 },
    height:      { type: 'number', default: 0.65 },
    minDistance: { type: 'number', default: 0.55 },
    padding:     { type: 'number', default: 0.22 },
    lerpRate:    { type: 'number', default: 11 },
    revealAt:    { type: 'number', default: 0.4 }
  },

  init: function () {
    this.desired = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.pivotWorld = new THREE.Vector3();
    this.targetWorld = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.colliderObjects = null;
    this.avatarShown = null;
  },

  /**
   * Collect the meshes to test against. Resolved lazily and re-tried while
   * empty, because primitives and glTFs do not all have their Object3D by the
   * time this component initialises.
   */
  getColliders: function () {
    if (this.colliderObjects && this.colliderObjects.length) { return this.colliderObjects; }
    var els = this.el.sceneEl.querySelectorAll(this.data.colliders);
    var out = [];
    for (var i = 0; i < els.length; i++) {
      var obj = els[i].getObject3D('mesh');
      if (obj) { out.push(obj); }
    }
    this.colliderObjects = out;
    return out;
  },

  /** Current distance of the camera from the pivot, in metres. */
  getDistance: function () { return this.offset.length(); },

  tick: function (time, timeDelta) {
    var dt = Math.min((timeDelta || 0) / 1000, 0.1);
    if (dt <= 0) { return; }

    var pivotEl = this.data.pivot;
    if (!pivotEl) { return; }

    if (this.data.enabled) {
      this.desired.set(0, this.data.height, this.data.distance);
      var full = this.desired.length();

      var pivotObj = pivotEl.object3D;
      pivotObj.getWorldPosition(this.pivotWorld);
      this.targetWorld.copy(this.desired);
      pivotObj.localToWorld(this.targetWorld);

      this.dir.subVectors(this.targetWorld, this.pivotWorld);
      var reach = this.dir.length();

      if (reach > 1e-4) {
        this.dir.divideScalar(reach);
        var colliders = this.getColliders();
        if (colliders.length) {
          this.raycaster.set(this.pivotWorld, this.dir);
          this.raycaster.far = reach;
          var hits = this.raycaster.intersectObjects(colliders, true);
          if (hits.length) {
            var allowed = Math.max(this.data.minDistance, hits[0].distance - this.data.padding);
            this.desired.multiplyScalar(allowed / full);
          }
        }
      }
    } else {
      this.desired.set(0, 0, 0);
    }

    this.offset.lerp(this.desired, Math.min(1, this.data.lerpRate * dt));
    if (this.offset.lengthSq() < 1e-6) { this.offset.set(0, 0, 0); }
    this.el.object3D.position.copy(this.offset);

    this.updateAvatarVisibility();
  },

  updateAvatarVisibility: function () {
    var avatar = this.data.avatar;
    if (!avatar) { return; }
    var show = this.offset.length() > this.data.revealAt;
    if (show !== this.avatarShown) {
      this.avatarShown = show;
      avatar.setAttribute('visible', show);
    }
  }
});
