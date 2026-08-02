/* global AFRAME */

/**
 * touch-controls — thumbstick, jump and view toggle for mobile (Phase 5).
 *
 * Optional in SPEC §10, and deliberately additive: it feeds
 * `character-controller.touch`, which the controller folds into the same input
 * it takes from WASD. Nothing about the desktop path changes, and if this
 * component never initialises the controller simply sees no touch input.
 *
 * Look is left to A-Frame's own `look-controls`, which already handles
 * touch-drag — a second look stick would fight it.
 *
 * The stick only appears on devices that actually report touch, so a desktop
 * browser is not cluttered with controls it cannot use.
 */
AFRAME.registerComponent('touch-controls', {
  schema: {
    player:   { type: 'selector' },
    stick:    { type: 'selector' },
    knob:     { type: 'selector' },
    jump:     { type: 'selector' },
    deadzone: { type: 'number', default: 0.12 },
    range:    { type: 'number', default: 46 }
  },

  init: function () {
    this.active = null;
    this.vec = { f: 0, r: 0 };

    var touchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!touchCapable) { this.hide(); return; }

    var cc = this.data.player && this.data.player.components['character-controller'];
    if (cc) { cc.touch = this.vec; }
    this.cc = cc || null;

    this.onStart = this.onStart.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onEnd = this.onEnd.bind(this);
    this.onJump = this.onJump.bind(this);

    if (this.data.stick) {
      this.data.stick.style.display = 'block';
      this.data.stick.addEventListener('touchstart', this.onStart, { passive: false });
      this.data.stick.addEventListener('touchmove', this.onMove, { passive: false });
      this.data.stick.addEventListener('touchend', this.onEnd);
      this.data.stick.addEventListener('touchcancel', this.onEnd);
    }
    if (this.data.jump) {
      this.data.jump.style.display = 'block';
      this.data.jump.addEventListener('touchstart', this.onJump, { passive: false });
    }
  },

  hide: function () {
    if (this.data.stick) { this.data.stick.style.display = 'none'; }
    if (this.data.jump) { this.data.jump.style.display = 'none'; }
  },

  remove: function () {
    if (this.cc) { this.cc.touch = null; }
    if (this.data.stick) {
      this.data.stick.removeEventListener('touchstart', this.onStart);
      this.data.stick.removeEventListener('touchmove', this.onMove);
      this.data.stick.removeEventListener('touchend', this.onEnd);
      this.data.stick.removeEventListener('touchcancel', this.onEnd);
    }
    if (this.data.jump) { this.data.jump.removeEventListener('touchstart', this.onJump); }
  },

  centre: function () {
    var r = this.data.stick.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },

  onStart: function (evt) {
    evt.preventDefault();
    this.active = evt.changedTouches[0].identifier;
    this.apply(evt.changedTouches[0]);
  },

  onMove: function (evt) {
    if (this.active === null) { return; }
    evt.preventDefault();
    for (var i = 0; i < evt.touches.length; i++) {
      if (evt.touches[i].identifier === this.active) { this.apply(evt.touches[i]); return; }
    }
  },

  onEnd: function () {
    this.active = null;
    this.vec.f = 0; this.vec.r = 0;
    if (this.data.knob) { this.data.knob.style.transform = 'translate(-50%, -50%)'; }
  },

  onJump: function (evt) {
    evt.preventDefault();
    if (this.cc) { this.cc.jump(); }
  },

  apply: function (touch) {
    var c = this.centre();
    var dx = touch.clientX - c.x;
    var dy = touch.clientY - c.y;
    var len = Math.hypot(dx, dy);
    var max = this.data.range;

    if (len > max) { dx *= max / len; dy *= max / len; len = max; }

    var nx = dx / max, ny = dy / max;
    if (Math.hypot(nx, ny) < this.data.deadzone) { nx = 0; ny = 0; }

    // Screen down is +Y, which is backwards, so forward is -ny.
    this.vec.r = nx;
    this.vec.f = -ny;

    if (this.data.knob) {
      this.data.knob.style.transform =
        'translate(calc(-50% + ' + dx.toFixed(1) + 'px), calc(-50% + ' + dy.toFixed(1) + 'px))';
    }
  }
});
