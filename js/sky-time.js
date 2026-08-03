/* global AFRAME, THREE */

/**
 * sky-time — time-of-day presets, and the button that steps through them.
 *
 * Attach to the scene. It drives four things together, which is the point: a
 * sky that changes while the fog and the lighting stay put looks worse than no
 * change at all, because the mismatch is what reads as fake.
 *
 *   sky      gradient colours + sun direction (js/gradient-sky.js)
 *   fog      colour matched to the horizon so distant geometry dissolves
 *            into it rather than ending at a visible edge
 *   sun      the directional light's position and colour, from the same
 *            vector the shader uses, so shading agrees with where the sun is
 *   ambient  hemisphere intensity, low at night, high at noon
 *
 * Transitions are interpolated rather than cut, since a hard switch on a
 * 4 km skyline is jarring.
 *
 * `tools/build_level78.py` and the OSM skyline both assume the tower's plan
 * rotation, so "north" here is scene-relative. Sun directions are chosen to
 * look right against the city, not to be astronomically correct for Bangkok.
 */
AFRAME.registerComponent('sky-time', {
  schema: {
    sky:       { type: 'selector' },
    sun:       { type: 'selector' },
    ambient:   { type: 'selector' },
    button:    { type: 'selector' },
    preset:    { type: 'string', default: 'day' },
    fadeMs:    { type: 'number', default: 1400 },
    storageKey: { type: 'string', default: 'kpw:sky' }
  },

  presets: {
    dawn: {
      label: 'Dawn',
      top: '#2b5f96', horizon: '#e8c39a', tint: '#ffbe78', sunCol: '#ffe6c0',
      dir: { x: 0.72, y: 0.10, z: -0.68 },
      fog: '#e2c6a8', fogNear: 250, fogFar: 3600,
      sunInt: 0.55, ambInt: 0.55, sunSize: 0.030, sunGlow: 0.42, stars: 0.10
    },
    day: {
      label: 'Day',
      top: '#2f6ea6', horizon: '#cdd9e5', tint: '#ffd9a0', sunCol: '#fff6e0',
      dir: { x: 0.35, y: 0.72, z: -0.60 },
      fog: '#cdd9e5', fogNear: 350, fogFar: 4600,
      sunInt: 0.75, ambInt: 0.90, sunSize: 0.022, sunGlow: 0.26, stars: 0.0
    },
    dusk: {
      label: 'Dusk',
      top: '#1d3f74', horizon: '#f0a877', tint: '#ff9d5c', sunCol: '#ffd0a0',
      dir: { x: -0.76, y: 0.06, z: 0.64 },
      fog: '#d9a684', fogNear: 200, fogFar: 3200,
      sunInt: 0.45, ambInt: 0.45, sunSize: 0.034, sunGlow: 0.48, stars: 0.22
    },
    night: {
      label: 'Night',
      top: '#070d1c', horizon: '#243a55', tint: '#31527a', sunCol: '#9fb6d6',
      dir: { x: -0.5, y: -0.35, z: 0.5 },
      fog: '#1d2c42', fogNear: 150, fogFar: 2800,
      sunInt: 0.10, ambInt: 0.22, sunSize: 0.016, sunGlow: 0.16, stars: 1.0
    }
  },

  order: ['dawn', 'day', 'dusk', 'night'],

  init: function () {
    var stored = this.readStored();
    this.current = this.presets[stored] ? stored : this.data.preset;
    if (!this.presets[this.current]) { this.current = 'day'; }

    this.from = null;
    this.to = null;
    this.t = 1;
    this.clock = 0;
    this.starPreset = null;

    this.onButton = this.onButton.bind(this);
    if (this.data.button) { this.data.button.addEventListener('click', this.onButton); }

    this.apply(this.presets[this.current], 1);
    this.syncButton();
  },

  remove: function () {
    if (this.data.button) { this.data.button.removeEventListener('click', this.onButton); }
  },

  onButton: function (evt) {
    var i = this.order.indexOf(this.current);
    this.setPreset(this.order[(i + 1) % this.order.length]);
    if (evt.currentTarget && evt.currentTarget.blur) { evt.currentTarget.blur(); }
  },

  setPreset: function (name) {
    if (!this.presets[name] || name === this.current) { return; }
    this.from = this.snapshot();
    this.current = name;
    this.to = this.presets[name];
    this.t = 0;
    this.writeStored(name);
    this.syncButton();
    this.el.emit('sky-changed', { preset: name }, false);
  },

  syncButton: function () {
    if (!this.data.button) { return; }
    this.data.button.textContent = this.presets[this.current].label;
  },

  /** Current values, so a transition can start from wherever it is now. */
  snapshot: function () {
    var p = this.presets[this.current];
    return {
      top: p.top, horizon: p.horizon, tint: p.tint, sunCol: p.sunCol,
      dir: p.dir, fog: p.fog, fogNear: p.fogNear, fogFar: p.fogFar,
      sunInt: p.sunInt, ambInt: p.ambInt, sunSize: p.sunSize, sunGlow: p.sunGlow,
      stars: p.stars
    };
  },

  tick: function (time, dt) {
    this.clock += (dt || 16) / 1000;

    // Advance the twinkle while settled, without redoing the whole apply().
    if (this.t >= 1 && this.data.sky && this.presets[this.current].stars > 0.001) {
      var m = this.data.sky.getObject3D('mesh');
      if (m && m.material && m.material.uniforms && m.material.uniforms.starTime) {
        m.material.uniforms.starTime.value = this.clock;
      }
    }

    if (this.t >= 1 || !this.to) { return; }
    this.t = Math.min(1, this.t + (dt || 16) / this.data.fadeMs);
    // Ease so the change starts and ends gently.
    var e = this.t * this.t * (3 - 2 * this.t);
    this.apply(this.lerp(this.from, this.to, e), e);
  },

  lerp: function (a, b, k) {
    var cA = new THREE.Color(), cB = new THREE.Color();
    var mixCol = function (x, y) {
      cA.set(x); cB.set(y);
      return '#' + cA.lerp(cB, k).getHexString();
    };
    var n = function (x, y) { return x + (y - x) * k; };
    return {
      top: mixCol(a.top, b.top),
      horizon: mixCol(a.horizon, b.horizon),
      tint: mixCol(a.tint, b.tint),
      sunCol: mixCol(a.sunCol, b.sunCol),
      dir: { x: n(a.dir.x, b.dir.x), y: n(a.dir.y, b.dir.y), z: n(a.dir.z, b.dir.z) },
      fog: mixCol(a.fog, b.fog),
      fogNear: n(a.fogNear, b.fogNear),
      fogFar: n(a.fogFar, b.fogFar),
      sunInt: n(a.sunInt, b.sunInt),
      ambInt: n(a.ambInt, b.ambInt),
      sunSize: n(a.sunSize, b.sunSize),
      sunGlow: n(a.sunGlow, b.sunGlow),
      stars: n(a.stars, b.stars)
    };
  },

  apply: function (p) {
    if (this.data.sky) {
      this.data.sky.setAttribute('material', {
        shader: 'gradient-sky',
        topColor: p.top,
        horizonColor: p.horizon,
        sunTint: p.tint,
        sunColor: p.sunCol,
        sunDirection: p.dir,
        sunSize: p.sunSize,
        sunGlow: p.sunGlow,
        starOpacity: p.stars,
        starTime: this.clock
      });
    }

    // Fog colour tracks the horizon so the skyline fades into the sky.
    this.el.setAttribute('fog', {
      type: 'linear', color: p.fog, near: p.fogNear, far: p.fogFar
    });

    if (this.data.sun) {
      // Same vector the shader uses, pushed out to a sensible distance.
      this.data.sun.setAttribute('position', {
        x: p.dir.x * 400, y: Math.max(p.dir.y, -0.2) * 400, z: p.dir.z * 400
      });
      this.data.sun.setAttribute('light', {
        type: 'directional', color: p.sunCol, intensity: Math.max(p.sunInt, 0)
      });
    }

    if (this.data.ambient) {
      this.data.ambient.setAttribute('light', {
        type: 'hemisphere', color: p.horizon, groundColor: '#444',
        intensity: Math.max(p.ambInt, 0)
      });
    }
  },

  readStored: function () {
    try { return window.localStorage.getItem(this.data.storageKey); } catch (e) { return null; }
  },

  writeStored: function (v) {
    try { window.localStorage.setItem(this.data.storageKey, v); } catch (e) { /* no-op */ }
  }
});
