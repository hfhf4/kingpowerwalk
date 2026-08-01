/* global AFRAME, THREE */

/**
 * view-switch — toggle between first-person and third-person.
 *
 * PHASE 0 PLACEHOLDER. This is deliberately the cheapest thing that satisfies
 * "a key / on-screen button switches FPS <-> TPS" (SPEC 1) without pulling
 * Phase 2 work forward.
 *
 * How it cheats: the camera never moves. In FPS the avatar is simply hidden;
 * in TPS it is shown standing a few metres ahead of the camera, facing away,
 * so you read it as your own back. That gives a genuine, testable toggle with
 * no view jolt on switch and no camera-collision problem to solve yet.
 *
 * What Phase 2 replaces it with (SPEC 6 / 10): a real orbit-follow camera
 * behind and above an avatar that owns the player position, with camera
 * collision so it doesn't clip through walls. At that point the avatar stops
 * being a projection of the camera and becomes the thing the camera follows.
 * Expect to rewrite this file rather than extend it.
 *
 * Attach to the camera entity:
 *   view-switch="avatar: #avatar; button: #view-toggle; distance: 3.6"
 */
AFRAME.registerComponent('view-switch', {
  schema: {
    avatar:     { type: 'selector' },
    button:     { type: 'selector' },
    distance:   { type: 'number', default: 3.6 },
    key:        { type: 'string', default: 'v' },
    storageKey: { type: 'string', default: 'kpw:view' },
    enabled:    { type: 'boolean', default: true }
  },

  init: function () {
    this.mode = this.readStoredMode() || 'fps';

    // Scratch vectors, reused every tick so the loop stays allocation-free.
    this.camPos = new THREE.Vector3();
    this.forward = new THREE.Vector3();

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onButtonClick = this.onButtonClick.bind(this);

    window.addEventListener('keydown', this.onKeyDown);
    if (this.data.button) {
      this.data.button.addEventListener('click', this.onButtonClick);
    }

    this.apply();
  },

  remove: function () {
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.data.button) {
      this.data.button.removeEventListener('click', this.onButtonClick);
    }
  },

  onKeyDown: function (evt) {
    if (!this.data.enabled) { return; }
    if (evt.metaKey || evt.ctrlKey || evt.altKey || evt.repeat) { return; }

    // Don't hijack the key while the user is typing somewhere.
    var target = evt.target;
    if (target && (target.isContentEditable ||
                   target.tagName === 'INPUT' ||
                   target.tagName === 'TEXTAREA')) {
      return;
    }

    if (evt.key && evt.key.toLowerCase() === this.data.key) {
      this.toggle();
    }
  },

  onButtonClick: function (evt) {
    this.toggle();
    // Return focus to the page so WASD keeps reaching the camera.
    if (evt.currentTarget && evt.currentTarget.blur) { evt.currentTarget.blur(); }
  },

  toggle: function () {
    this.setMode(this.mode === 'fps' ? 'tps' : 'fps');
  },

  setMode: function (mode) {
    if (mode !== 'fps' && mode !== 'tps') { return; }
    if (mode === this.mode) { return; }
    this.mode = mode;
    this.writeStoredMode(mode);
    this.apply();
    this.el.emit('view-changed', { mode: mode }, false);
  },

  /** Push current mode out to the avatar and the button label. */
  apply: function () {
    var isTps = this.mode === 'tps';

    if (this.data.avatar) {
      this.data.avatar.setAttribute('visible', isTps);
      if (isTps) { this.placeAvatar(); }
    }

    if (this.data.button) {
      this.data.button.textContent = isTps ? 'View: Third-person'
                                           : 'View: First-person';
      this.data.button.setAttribute('aria-pressed', String(isTps));
    }
  },

  /**
   * Stand the avatar `distance` metres along the camera's horizontal heading,
   * on the deck, facing the same way the camera looks.
   */
  placeAvatar: function () {
    var avatar = this.data.avatar;
    if (!avatar) { return; }

    var camObj = this.el.object3D;
    camObj.getWorldPosition(this.camPos);
    camObj.getWorldDirection(this.forward);

    // getWorldDirection points down -Z (the way the camera looks).
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) { return; }
    this.forward.normalize();

    avatar.object3D.position.set(
      this.camPos.x + this.forward.x * this.data.distance,
      0,
      this.camPos.z + this.forward.z * this.data.distance
    );

    // Face the same direction of travel, i.e. away from the camera.
    avatar.object3D.rotation.set(
      0,
      Math.atan2(this.forward.x, this.forward.z),
      0
    );
  },

  tick: function () {
    if (this.mode === 'tps') { this.placeAvatar(); }
  },

  // --- persistence ---------------------------------------------------------
  // localStorage throws in some privacy modes; a lost preference is not worth
  // taking the scene down for.

  readStoredMode: function () {
    try {
      var stored = window.localStorage.getItem(this.data.storageKey);
      return (stored === 'fps' || stored === 'tps') ? stored : null;
    } catch (e) {
      return null;
    }
  },

  writeStoredMode: function (mode) {
    try {
      window.localStorage.setItem(this.data.storageKey, mode);
    } catch (e) {
      /* no-op */
    }
  }
});
