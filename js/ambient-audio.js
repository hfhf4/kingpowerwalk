/* global AFRAME */

/**
 * ambient-audio — wind and a faint city hum (SPEC §10, Phase 5).
 *
 * Synthesised with the Web Audio API rather than loaded from files. No audio
 * assets exist in the repo, and generating the bed costs nothing to download,
 * loops seamlessly by construction, and keeps `/assets` free of media whose
 * licence would need checking (SPEC §12).
 *
 *   wind — white noise through a bandpass that drifts slowly in frequency and
 *          gain, so it breathes instead of hissing flatly. Two detuned layers,
 *          one high and thin, one low and broad.
 *   city — brown-ish noise heavily lowpassed to a distant roar, plus a very
 *          quiet 100 Hz tone for the mains-electrical undertone a city has.
 *
 * Browsers refuse to start audio without a user gesture, so the context is only
 * created on the first pointer or key event, and `resume()` is called then too
 * — creating a context before that leaves it suspended and silent.
 */
AFRAME.registerComponent('ambient-audio', {
  schema: {
    volume:  { type: 'number', default: 0.5 },
    button:  { type: 'selector' },
    muted:   { type: 'boolean', default: false },
    storageKey: { type: 'string', default: 'kpw:muted' }
  },

  init: function () {
    this.ctx = null;
    this.master = null;
    this.started = false;

    var stored = this.readStored();
    this.muted = stored === null ? this.data.muted : stored;

    this.onGesture = this.onGesture.bind(this);
    this.onButton = this.onButton.bind(this);

    // `once` on each: the first of whichever arrives starts the bed.
    window.addEventListener('pointerdown', this.onGesture);
    window.addEventListener('keydown', this.onGesture);
    window.addEventListener('touchstart', this.onGesture);

    if (this.data.button) { this.data.button.addEventListener('click', this.onButton); }
    this.syncButton();
  },

  remove: function () {
    window.removeEventListener('pointerdown', this.onGesture);
    window.removeEventListener('keydown', this.onGesture);
    window.removeEventListener('touchstart', this.onGesture);
    if (this.data.button) { this.data.button.removeEventListener('click', this.onButton); }
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
  },

  onGesture: function () {
    if (this.started) { return; }
    this.started = true;
    window.removeEventListener('pointerdown', this.onGesture);
    window.removeEventListener('keydown', this.onGesture);
    window.removeEventListener('touchstart', this.onGesture);
    this.start();
  },

  onButton: function (evt) {
    this.setMuted(!this.muted);
    if (evt.currentTarget && evt.currentTarget.blur) { evt.currentTarget.blur(); }
  },

  setMuted: function (m) {
    this.muted = m;
    this.writeStored(m);
    this.applyVolume();
    this.syncButton();
  },

  applyVolume: function () {
    if (!this.master || !this.ctx) { return; }
    var target = this.muted ? 0 : this.data.volume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  },

  syncButton: function () {
    if (!this.data.button) { return; }
    this.data.button.textContent = this.muted ? 'Sound off' : 'Sound on';
    this.data.button.setAttribute('aria-pressed', String(!this.muted));
  },

  /** A few seconds of noise, looped. Cheap and seamless. */
  noiseBuffer: function (ctx, seconds, brown) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      } else {
        d[i] = w;
      }
    }
    return buf;
  },

  source: function (buffer) {
    var s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    return s;
  },

  /** Slow random drift on an AudioParam, so nothing sits perfectly still. */
  drift: function (param, base, spread, period) {
    var ctx = this.ctx;
    var self = this;
    var step = function () {
      if (!self.ctx) { return; }
      var v = base + (Math.random() * 2 - 1) * spread;
      param.setTargetAtTime(v, ctx.currentTime, period * 0.5);
      self._timers.push(setTimeout(step, period * 1000));
    };
    step();
  },

  start: function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { return; }

    this.ctx = new AC();
    if (this.ctx.state === 'suspended') { this.ctx.resume(); }
    this._timers = [];

    var ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    var white = this.noiseBuffer(ctx, 4, false);
    var brown = this.noiseBuffer(ctx, 6, true);

    // --- wind, thin upper layer ---
    var w1 = this.source(white);
    var bp1 = ctx.createBiquadFilter();
    bp1.type = 'bandpass'; bp1.frequency.value = 900; bp1.Q.value = 0.7;
    var g1 = ctx.createGain(); g1.gain.value = 0.10;
    w1.connect(bp1).connect(g1).connect(this.master);
    w1.start();
    this.drift(bp1.frequency, 900, 420, 7);
    this.drift(g1.gain, 0.10, 0.055, 5);

    // --- wind, broad lower layer ---
    var w2 = this.source(white);
    var bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass'; bp2.frequency.value = 260; bp2.Q.value = 0.5;
    var g2 = ctx.createGain(); g2.gain.value = 0.16;
    w2.connect(bp2).connect(g2).connect(this.master);
    w2.start();
    this.drift(bp2.frequency, 260, 120, 11);
    this.drift(g2.gain, 0.16, 0.07, 9);

    // --- city roar, far below ---
    var c1 = this.source(brown);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4;
    var g3 = ctx.createGain(); g3.gain.value = 0.13;
    c1.connect(lp).connect(g3).connect(this.master);
    c1.start();
    this.drift(g3.gain, 0.13, 0.04, 13);

    // --- mains undertone ---
    var osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 100;
    var g4 = ctx.createGain(); g4.gain.value = 0.012;
    osc.connect(g4).connect(this.master);
    osc.start();

    this.applyVolume();
    this.el.emit('audio-started', null, false);
  },

  readStored: function () {
    try {
      var v = window.localStorage.getItem(this.data.storageKey);
      return v === null ? null : v === '1';
    } catch (e) { return null; }
  },

  writeStored: function (m) {
    try { window.localStorage.setItem(this.data.storageKey, m ? '1' : '0'); } catch (e) { /* no-op */ }
  }
});
