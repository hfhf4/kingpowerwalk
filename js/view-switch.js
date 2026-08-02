/* global AFRAME */

/**
 * view-switch — first-person / third-person toggle (SPEC §6, Phase 2).
 *
 * Attach to the player rig. This component owns *intent* only: which view is
 * selected, how it gets changed, and remembering it between visits. Where the
 * camera actually goes, and when the avatar becomes visible, belongs to
 * third-person-camera on the camera entity.
 *
 * That split is the reason switching views cannot break movement: nothing here
 * touches the rig, the camera's rotation, or character-controller. Toggling
 * flips one boolean on third-person-camera, and the camera dollies between the
 * two offsets on its own.
 *
 * Bound to the V key and an on-screen button. The choice persists in
 * localStorage. A controller button follows in Phase 6, where FPS also becomes
 * the forced default in VR (SPEC §6 — third-person in a headset is a comfort
 * problem, not a feature).
 *
 * Replaces the Phase 0 stub, which snapped the camera to a fixed offset with no
 * orbit and no collision.
 */
AFRAME.registerComponent('view-switch', {
  schema: {
    camera:     { type: 'selector' },
    button:     { type: 'selector' },
    key:        { type: 'string', default: 'v' },
    storageKey: { type: 'string', default: 'kpw:view' },
    enabled:    { type: 'boolean', default: true }
  },

  init: function () {
    this.mode = this.readStoredMode() || 'fps';

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

    var t = evt.target;
    if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) { return; }

    if (evt.key && evt.key.toLowerCase() === this.data.key) { this.toggle(); }
  },

  onButtonClick: function (evt) {
    this.toggle();
    // Hand focus back to the page, or WASD keeps going to the button.
    if (evt.currentTarget && evt.currentTarget.blur) { evt.currentTarget.blur(); }
  },

  toggle: function () {
    this.setMode(this.mode === 'fps' ? 'tps' : 'fps');
  },

  setMode: function (mode) {
    if ((mode !== 'fps' && mode !== 'tps') || mode === this.mode) { return; }
    this.mode = mode;
    this.writeStoredMode(mode);
    this.apply();
  },

  apply: function () {
    var isTps = this.mode === 'tps';

    if (this.data.camera) {
      this.data.camera.setAttribute('third-person-camera', 'enabled', isTps);
    }

    if (this.data.button) {
      this.data.button.textContent = isTps ? 'Third-person' : 'First-person';
      this.data.button.setAttribute('aria-pressed', String(isTps));
    }

    this.el.emit('view-changed', { mode: this.mode }, false);
  },

  // localStorage throws in some privacy modes; a forgotten preference is not
  // worth taking the scene down for.

  readStoredMode: function () {
    try {
      var v = window.localStorage.getItem(this.data.storageKey);
      return (v === 'fps' || v === 'tps') ? v : null;
    } catch (e) { return null; }
  },

  writeStoredMode: function (mode) {
    try { window.localStorage.setItem(this.data.storageKey, mode); } catch (e) { /* no-op */ }
  }
});
