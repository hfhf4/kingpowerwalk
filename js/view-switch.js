/* global AFRAME */

// ============================================================
// view-switch: a STUB that previews the FPS/TPS toggle (press V).
// Phase 2 replaces this with a real orbit-follow third-person camera.
// In this starter, movement is on the rig (world-axis) so the camera
// and the placeholder avatar always stay together.
//
// Extracted verbatim from the inline <script> in index.html (Phase 0);
// behaviour is unchanged. Attach to the player rig.
// ============================================================
AFRAME.registerComponent('view-switch', {
  init: function () {
    this.mode = 'fps';
    this.cam = document.querySelector('#cam');
    this.you = document.querySelector('#you');
    this.onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
    this.apply();
  },
  remove: function () {
    window.removeEventListener('keydown', this.onKeyDown);
  },
  onKeyDown: function (e) {
    if (e.key === 'v' || e.key === 'V') this.toggle();
  },
  toggle: function () { this.mode = (this.mode === 'fps') ? 'tps' : 'fps'; this.apply(); },
  apply: function () {
    if (this.mode === 'fps') {
      this.cam.setAttribute('position', '0 1.6 0');   // head height
      this.you.setAttribute('visible', 'false');       // hide own body
    } else {
      this.cam.setAttribute('position', '0 2.6 3.5');  // behind & above (stub)
      this.you.setAttribute('visible', 'true');
    }
  }
});
