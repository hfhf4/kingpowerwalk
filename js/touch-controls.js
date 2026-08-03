/* global AFRAME */

/**
 * touch-controls — d-pad and jump for touch devices (Phase 5).
 *
 * Feeds `character-controller.touch`, which the controller folds into the same
 * input it takes from WASD. Nothing about the desktop path changes, and if this
 * component never initialises the controller simply sees no touch input.
 *
 * A d-pad rather than an analogue stick: on a rooftop you are walking a
 * bounded deck, not steering, and four discrete directions are easier to hit
 * without looking than a stick you have to keep centred. Diagonals work by
 * pressing two pads, and multi-touch means you can hold a direction and jump
 * at once.
 *
 * Look is left to A-Frame's own `look-controls`, which already handles
 * touch-drag anywhere on the canvas — a second look stick would fight it.
 *
 * Visibility is gated twice:
 *   - **No touch support** → hidden. A desktop browser never sees them.
 *   - **VR mode** → hidden. In a headset the controls are the controllers, and
 *     a DOM overlay is not visible in an immersive session anyway; leaving them
 *     shown means they reappear on exit in the wrong state.
 */
AFRAME.registerComponent('touch-controls', {
  schema: {
    player: { type: 'selector' },
    pad:    { type: 'selector' },
    jump:   { type: 'selector' }
  },

  init: function () {
    this.vec = { f: 0, r: 0 };
    this.held = {};
    this.buttons = [];

    var touchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!touchCapable) { this.setVisible(false); return; }

    var cc = this.data.player && this.data.player.components['character-controller'];
    if (cc) { cc.touch = this.vec; }
    this.cc = cc || null;

    this.onDown = this.onDown.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onJump = this.onJump.bind(this);
    this.onEnterVR = this.onEnterVR.bind(this);
    this.onExitVR = this.onExitVR.bind(this);

    if (this.data.pad) {
      var dirs = this.data.pad.querySelectorAll('[data-dir]');
      for (var i = 0; i < dirs.length; i++) {
        var el = dirs[i];
        this.buttons.push(el);
        el.addEventListener('touchstart', this.onDown, { passive: false });
        el.addEventListener('touchend', this.onUp);
        el.addEventListener('touchcancel', this.onUp);
        // Pointer events too, so it is testable and works on hybrid laptops.
        el.addEventListener('pointerdown', this.onDown);
        el.addEventListener('pointerup', this.onUp);
        el.addEventListener('pointerleave', this.onUp);
      }
    }
    if (this.data.jump) {
      this.data.jump.addEventListener('touchstart', this.onJump, { passive: false });
      this.data.jump.addEventListener('pointerdown', this.onJump);
    }

    var scene = this.el.sceneEl || this.el;
    scene.addEventListener('enter-vr', this.onEnterVR);
    scene.addEventListener('exit-vr', this.onExitVR);

    this.setVisible(true);
  },

  remove: function () {
    if (this.cc) { this.cc.touch = null; }
    for (var i = 0; i < this.buttons.length; i++) {
      var el = this.buttons[i];
      el.removeEventListener('touchstart', this.onDown);
      el.removeEventListener('touchend', this.onUp);
      el.removeEventListener('touchcancel', this.onUp);
      el.removeEventListener('pointerdown', this.onDown);
      el.removeEventListener('pointerup', this.onUp);
      el.removeEventListener('pointerleave', this.onUp);
    }
    if (this.data.jump) {
      this.data.jump.removeEventListener('touchstart', this.onJump);
      this.data.jump.removeEventListener('pointerdown', this.onJump);
    }
    var scene = this.el.sceneEl || this.el;
    scene.removeEventListener('enter-vr', this.onEnterVR);
    scene.removeEventListener('exit-vr', this.onExitVR);
  },

  setVisible: function (on) {
    var d = on ? 'grid' : 'none';
    if (this.data.pad) { this.data.pad.style.display = d; }
    if (this.data.jump) { this.data.jump.style.display = on ? 'block' : 'none'; }
  },

  onEnterVR: function () { this.clear(); this.setVisible(false); },
  onExitVR: function () {
    var touchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.setVisible(touchCapable);
  },

  clear: function () {
    this.held = {};
    this.vec.f = 0; this.vec.r = 0;
    for (var i = 0; i < this.buttons.length; i++) {
      this.buttons[i].classList.remove('pressed');
    }
  },

  onDown: function (evt) {
    evt.preventDefault();
    var dir = evt.currentTarget.getAttribute('data-dir');
    this.held[dir] = true;
    evt.currentTarget.classList.add('pressed');
    this.recompute();
  },

  onUp: function (evt) {
    var dir = evt.currentTarget.getAttribute('data-dir');
    this.held[dir] = false;
    evt.currentTarget.classList.remove('pressed');
    this.recompute();
  },

  onJump: function (evt) {
    evt.preventDefault();
    if (this.cc) { this.cc.jump(); }
  },

  recompute: function () {
    this.vec.f = (this.held.up ? 1 : 0) - (this.held.down ? 1 : 0);
    this.vec.r = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
  }
});
