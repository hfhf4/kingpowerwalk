/* global AFRAME, THREE */

/**
 * tuner — a live preview panel for deck layout and prop placement (dev only).
 *
 * Gated on `?tune` in the URL. Without it this file reads one query string and
 * returns, so the shipped page gains no panel, no extra requests and no cost
 * beyond a few hundred bytes.
 *
 * Why this exists rather than the A-Frame inspector: half of what you would
 * want to nudge is not in the scene graph at all. The sign, the viewpoint rings
 * and the spawn point are entity attributes and any inspector can move them —
 * but deck depth, tray extent, railing inset, stairs, the upper platform and
 * the elevator live in `data/level78-layout.json` and are baked into
 * `deck.glb` / `navmesh.glb` by `tools/build_level78.py`. An inspector can drag
 * the finished mesh; it cannot make the tray deeper and give you a navmesh that
 * agrees. This panel re-runs the generator in the browser (via
 * js/level78-geometry.js) so a layout change produces a deck *and* a navmesh you
 * can immediately walk on.
 *
 * It is preview only. Nothing is written back — `tools/build_level78.py` stays
 * the single source of truth for what ships. Settle on numbers here, then bake
 * them with the script. The readout pane exists for exactly that handoff.
 *
 * Two guards run while you drag, because both of these have already shipped
 * broken once:
 *   - the tray must stay clear of the tower roof (X = 22.98) or it looks down
 *     at solid building and no transparency can fix it;
 *   - the navmesh must stay continuous from the deck out to the tray, or you
 *     walk off the end and fall 314 m.
 */

// Ranges for every tunable in the layout JSON. Kept here rather than in the
// data file so the shipped config stays pure geometry.
var TUNER_FIELDS = [
  ['deck', 'Deck', [
    ['depth', 20, 60, 0.1],
    ['width', 8, 30, 0.1],
    ['elevation', -0.5, 1, 0.01]
  ]],
  ['glassTray', 'Glass tray', [
    ['innerX', 10, 35, 0.05],
    ['outerX', 10, 40, 0.05],
    ['width', 4, 24, 0.1]
  ]],
  ['railings', 'Railings', [
    ['height', 0.5, 2, 0.05],
    ['navmeshInset', 0, 3, 0.05]
  ]],
  ['stairs', 'Stairs', [
    ['rearX', -20, 10, 0.1],
    ['frontX', -20, 20, 0.1],
    ['topWidth', 2, 20, 0.1],
    ['bottomWidth', 2, 20, 0.1],
    ['steps', 4, 40, 1]
  ]],
  ['upperViewingArea', 'The Peak', [
    ['rearX', -25, 0, 0.1],
    ['frontX', -20, 10, 0.1],
    ['width', 2, 20, 0.1],
    ['elevation', 0, 10, 0.1]
  ]],
  ['elevator', 'Elevator', [
    ['diameter', 1, 12, 0.1],
    ['height', 1, 10, 0.1]
  ]]
];

// Measured from tower.glb and recorded in the layout's `assumptions`. The tray's
// inner edge must clear this or it sits over solid roof.
var ROOF_EXTENT_X = 22.98;

AFRAME.registerComponent('tuner', {
  schema: {
    deck:    { type: 'selector', default: '#deck' },
    navmesh: { type: 'selector', default: '#navmesh' },
    player:  { type: 'selector', default: '#player' },
    camera:  { type: 'selector', default: '#cam' },
    layout:  { type: 'string', default: 'data/level78-layout.json' }
  },

  init: function () {
    var self = this;
    this.cfg = null;
    this.baseMaterials = null;
    this.showNav = false;
    this.selected = null;
    this.scanTimer = 0;
    this.rayc = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    this.onCanvasClick = this.onCanvasClick.bind(this);

    this.loadDeps().then(function () {
      return fetch(self.data.layout).then(function (r) { return r.json(); });
    }).then(function (cfg) {
      self.cfg = cfg;
      self.original = JSON.parse(JSON.stringify(cfg));
      self.buildPanel();
      self.captureMaterials();
      self.refreshReadout();
      self.runGuards();
      self.el.sceneEl.canvas.addEventListener('click', self.onCanvasClick);
    }).catch(function (e) {
      console.error('[tuner] failed to start:', e);
    });
  },

  remove: function () {
    if (this.panel && this.panel.parentNode) { this.panel.parentNode.removeChild(this.panel); }
    var canvas = this.el.sceneEl.canvas;
    if (canvas) { canvas.removeEventListener('click', this.onCanvasClick); }
  },

  /** Pull in the generator port and the panel stylesheet, only when tuning. */
  loadDeps: function () {
    function css (href) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      document.head.appendChild(l);
    }
    function js (src) {
      return new Promise(function (resolve, reject) {
        if (window.KPWLevel78) { resolve(); return; }
        var s = document.createElement('script');
        s.src = src; s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    css('css/tuner.css');
    return js('js/level78-geometry.js');
  },

  /**
   * Reuse the materials off the loaded GLBs rather than recreating them.
   * The glTF baseColorFactor is linear and the renderer has colorManagement on,
   * so hand-mixing a colour here would preview a different shade than ships.
   */
  captureMaterials: function () {
    var mats = [];
    var model = this.data.deck.getObject3D('mesh');
    if (model) { model.traverse(function (o) { if (o.isMesh) { mats.push(o.material); } }); }
    this.baseMaterials = mats;
    var nav = this.data.navmesh.getObject3D('mesh');
    this.navMaterial = null;
    if (nav) { nav.traverse(function (o) { if (o.isMesh && !this.navMaterial) { this.navMaterial = o.material; } }.bind(this)); }
  },

  // ---------------------------------------------------------------- rebuild

  /**
   * Regenerate both meshes from the current config and swap them in.
   *
   * Two caches have to be dropped or the change half-applies in a way that is
   * hard to see: character-controller holds the navmesh Object3D it probes
   * against, and third-person-camera caches its collider list on first resolve.
   * Miss either and you are looking at new geometry while walking on and
   * colliding with the old.
   */
  rebuild: function () {
    if (!window.KPWLevel78 || !this.cfg) { return; }

    var built = window.KPWLevel78.buildDeck(this.cfg);
    var group = new THREE.Group();
    group.add(new THREE.Mesh(built.opaque, this.baseMaterials[0] || new THREE.MeshStandardMaterial()));
    group.add(new THREE.Mesh(built.transparent, this.baseMaterials[1] || new THREE.MeshStandardMaterial()));
    this.data.deck.setObject3D('mesh', group);

    var navGeo = window.KPWLevel78.buildNavmesh(this.cfg);
    var navGroup = new THREE.Group();
    navGroup.add(new THREE.Mesh(navGeo, this.navMaterial || new THREE.MeshBasicMaterial({ color: 0x00ff00 })));
    this.data.navmesh.setObject3D('mesh', navGroup);

    var cc = this.data.player && this.data.player.components['character-controller'];
    if (cc) { cc.setupNavmesh(navGroup); }

    var tpc = this.data.camera && this.data.camera.components['third-person-camera'];
    if (tpc) { tpc.colliderObjects = null; }

    // setupNavmesh hides the mesh; honour the toggle after it has run.
    this.applyNavVisibility();

    this.refreshReadout();
    this.scheduleGuards();
  },

  /**
   * Reveal the navmesh as a wireframe rather than a translucent fill. The
   * navmesh *is* the floor, so a filled overlay just floods the lower half of
   * the screen and hides the deck under it. The cell grid is the useful part:
   * it shows exactly where coverage stops, which is what you are checking when
   * you drag the tray out.
   */
  applyNavVisibility: function () {
    var show = this.showNav;
    var model = this.data.navmesh.getObject3D('mesh');
    if (!model) { return; }
    model.traverse(function (o) {
      if (o.isMesh && o.material) {
        o.material.visible = show;
        o.material.wireframe = true;
        o.material.transparent = true;
        o.material.opacity = 0.6;
        o.material.depthWrite = false;
      }
    });
  },

  // ----------------------------------------------------------------- guards

  scheduleGuards: function () {
    var self = this;
    clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(function () { self.runGuards(); }, 150);
  },

  /**
   * The two invariants that have broken before. Both are cheap enough to run on
   * every settle, and both report a number rather than just a colour so you can
   * see how much margin is left.
   */
  runGuards: function () {
    if (!this.cfg) { return; }

    var clears = this.cfg.glassTray.innerX > ROOF_EXTENT_X;
    var margin = (this.cfg.glassTray.innerX - ROOF_EXTENT_X).toFixed(2);
    this.setGuard(this.guardRoof, clears,
      clears ? 'Tray clears the roof by ' + margin + ' m'
             : 'Tray overlaps the roof by ' + Math.abs(margin) + ' m — you will see building, not street');

    var cc = this.data.player && this.data.player.components['character-controller'];
    if (!cc || !cc.groundHeightAt) { return; }
    var limit = this.cfg.glassTray.outerX - this.cfg.railings.navmeshInset;
    var firstGap = null;
    for (var x = 0; x <= limit; x += 0.1) {
      var xr = Math.round(x * 10) / 10;
      if (cc.groundHeightAt(xr, 0) === null) { firstGap = xr; break; }
    }
    this.setGuard(this.guardNav, firstGap === null,
      firstGap === null ? 'Navmesh continuous to x = ' + limit.toFixed(2)
                        : 'Navmesh gap at x = ' + firstGap + ' — you would fall through here');
  },

  setGuard: function (el, ok, text) {
    if (!el) { return; }
    el.textContent = (ok ? '✓ ' : '✗ ') + text;
    el.className = 'tuner-guard ' + (ok ? 'ok' : 'bad');
  },

  // ------------------------------------------------------------------ props

  /** Everything placeable, and how to read/write its position. */
  props: function () {
    var out = [{
      id: 'spawn',
      label: 'Spawn point',
      get: function (t) { return t.data.player.getAttribute('character-controller').respawn; },
      set: function (t, p) {
        t.data.player.setAttribute('character-controller', 'respawn', p.x + ' ' + p.y + ' ' + p.z);
      },
      snippet: function (t) {
        var p = t.data.player.getAttribute('character-controller').respawn;
        return 'respawn: ' + fmt3(p);
      }
    }];

    var sign = document.querySelector('#sign');
    if (sign) {
      out.push({
        id: 'sign', label: 'Sign', el: sign,
        get: function () { return sign.getAttribute('position'); },
        set: function (t, p) { sign.setAttribute('position', p); },
        snippet: function () { return '#sign position="' + fmt3(sign.getAttribute('position')) + '"'; }
      });
    }

    var vps = document.querySelectorAll('[viewpoint]');
    for (var i = 0; i < vps.length; i++) {
      (function (el, n) {
        var label = el.getAttribute('viewpoint').label || ('Viewpoint ' + n);
        out.push({
          id: 'vp' + n, label: 'Ring: ' + label, el: el,
          get: function () { return el.getAttribute('position'); },
          // The ring and where it sends you are separate values; moving one
          // without the other is a trap, so they move together.
          set: function (t, p) {
            el.setAttribute('position', p);
            el.setAttribute('viewpoint', 'target', p.x + ' ' + p.y + ' ' + p.z);
          },
          snippet: function () {
            var p = el.getAttribute('position');
            return '"' + label + '" position="' + fmt3(p) + '" target: ' + fmt3(p);
          }
        });
      }(vps[i], i + 1));
    }
    return out;
  },

  currentProp: function () {
    if (!this.selected) { return null; }
    var all = this.props();
    for (var i = 0; i < all.length; i++) { if (all[i].id === this.selected) { return all[i]; } }
    return null;
  },

  nudge: function (axis, amount) {
    var prop = this.currentProp();
    if (!prop) { return; }
    var p = prop.get(this);
    var next = { x: p.x, y: p.y, z: p.z };
    next[axis] = Math.round((next[axis] + amount) * 1000) / 1000;
    prop.set(this, next);
    this.refreshReadout();
  },

  /**
   * Click anywhere on the deck to drop the selected prop there. Raycasts the
   * deck rather than the navmesh so you can place a prop against a railing or
   * on the stairs, not only where the player may stand.
   */
  onCanvasClick: function (evt) {
    var prop = this.currentProp();
    if (!prop || !this.placeMode || !this.placeMode.checked) { return; }

    var cam = this.data.camera.getObject3D('camera');
    var deck = this.data.deck.getObject3D('mesh');
    if (!cam || !deck) { return; }

    var rect = this.el.sceneEl.canvas.getBoundingClientRect();
    this.ndc.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    this.rayc.setFromCamera(this.ndc, cam);

    var hits = this.rayc.intersectObject(deck, true);
    if (!hits.length) { return; }
    var pt = hits[0].point;
    var cur = prop.get(this);
    // Keep the prop's own height — a sign sits at eye level, a ring on the floor.
    prop.set(this, {
      x: Math.round(pt.x * 100) / 100,
      y: cur.y,
      z: Math.round(pt.z * 100) / 100
    });
    this.refreshReadout();
  },

  // ------------------------------------------------------------------- panel

  buildPanel: function () {
    var self = this;
    var panel = document.createElement('div');
    panel.id = 'tuner';
    panel.innerHTML = '<h2>Tuner <span class="tuner-note">preview only — nothing is saved</span></h2>';

    // --- layout sliders -----------------------------------------------------
    TUNER_FIELDS.forEach(function (section) {
      var key = section[0], title = section[1], fields = section[2];
      var box = document.createElement('details');
      box.open = (key === 'glassTray');
      box.innerHTML = '<summary>' + title + '</summary>';
      fields.forEach(function (f) {
        box.appendChild(self.slider(key, f[0], f[1], f[2], f[3]));
      });
      panel.appendChild(box);
    });

    // Elevator centre is an array, so it gets its own pair.
    var elevBox = document.createElement('details');
    elevBox.innerHTML = '<summary>Elevator position</summary>';
    elevBox.appendChild(this.slider('elevator', 'centre', -25, 25, 0.1, 0, 'centre X'));
    elevBox.appendChild(this.slider('elevator', 'centre', -12, 12, 0.1, 1, 'centre Z'));
    panel.appendChild(elevBox);

    // --- guards -------------------------------------------------------------
    var guards = document.createElement('div');
    guards.className = 'tuner-guards';
    this.guardRoof = document.createElement('div');
    this.guardNav = document.createElement('div');
    guards.appendChild(this.guardRoof);
    guards.appendChild(this.guardNav);
    panel.appendChild(guards);

    // --- navmesh visibility -------------------------------------------------
    var navRow = document.createElement('label');
    navRow.className = 'tuner-check';
    var navBox = document.createElement('input');
    navBox.type = 'checkbox';
    navBox.addEventListener('change', function () {
      self.showNav = navBox.checked;
      self.applyNavVisibility();
    });
    navRow.appendChild(navBox);
    navRow.appendChild(document.createTextNode(' Show navmesh'));
    panel.appendChild(navRow);

    // --- props --------------------------------------------------------------
    var propBox = document.createElement('details');
    propBox.open = true;
    propBox.innerHTML = '<summary>Props</summary>';

    var sel = document.createElement('select');
    sel.className = 'tuner-select';
    var opts = this.props();
    sel.innerHTML = '<option value="">— pick a prop —</option>';
    opts.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id; o.textContent = p.label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { self.selected = sel.value || null; self.refreshReadout(); });
    propBox.appendChild(sel);

    var placeRow = document.createElement('label');
    placeRow.className = 'tuner-check';
    this.placeMode = document.createElement('input');
    this.placeMode.type = 'checkbox';
    placeRow.appendChild(this.placeMode);
    placeRow.appendChild(document.createTextNode(' Click the deck to place it'));
    propBox.appendChild(placeRow);

    // Buttons rather than arrow keys: the controller already binds the arrows
    // to movement, so a key-based nudge would walk the player at the same time.
    var stepRow = document.createElement('div');
    stepRow.className = 'tuner-nudge';
    var step = document.createElement('input');
    step.type = 'number'; step.value = '0.25'; step.step = '0.05'; step.className = 'tuner-step';
    stepRow.appendChild(step);
    [['x', 'X'], ['y', 'Y'], ['z', 'Z']].forEach(function (a) {
      [-1, 1].forEach(function (sign) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = (sign < 0 ? '−' : '+') + a[1];
        btn.addEventListener('click', function () {
          self.nudge(a[0], sign * parseFloat(step.value || '0.25'));
          btn.blur();
        });
        stepRow.appendChild(btn);
      });
    });
    propBox.appendChild(stepRow);
    panel.appendChild(propBox);

    // --- readout ------------------------------------------------------------
    var readBox = document.createElement('details');
    readBox.open = true;
    readBox.innerHTML = '<summary>Numbers to send back</summary>';
    this.readout = document.createElement('textarea');
    this.readout.readOnly = true;
    this.readout.className = 'tuner-readout';
    readBox.appendChild(this.readout);

    var row = document.createElement('div');
    row.className = 'tuner-actions';
    var copy = document.createElement('button');
    copy.type = 'button'; copy.textContent = 'Copy';
    copy.addEventListener('click', function () {
      self.readout.select();
      try { document.execCommand('copy'); } catch (e) { /* clipboard blocked; select is enough */ }
      copy.textContent = 'Copied';
      setTimeout(function () { copy.textContent = 'Copy'; }, 1200);
      copy.blur();
    });
    var reset = document.createElement('button');
    reset.type = 'button'; reset.textContent = 'Reset';
    reset.addEventListener('click', function () {
      self.cfg = JSON.parse(JSON.stringify(self.original));
      self.syncSliders();
      self.rebuild();
      reset.blur();
    });
    row.appendChild(copy);
    row.appendChild(reset);
    readBox.appendChild(row);
    panel.appendChild(readBox);

    document.body.appendChild(panel);
    this.panel = panel;
  },

  /**
   * One labelled slider bound to `cfg[group][key]`, or to `cfg[group][key][idx]`
   * when the value is an array (the elevator centre).
   */
  slider: function (group, key, min, max, step, idx, labelText) {
    var self = this;
    var wrap = document.createElement('div');
    wrap.className = 'tuner-row';

    var read = function () {
      var v = self.cfg[group][key];
      return idx === undefined ? v : v[idx];
    };

    var label = document.createElement('label');
    label.textContent = labelText || key;
    var out = document.createElement('span');
    out.className = 'tuner-val';
    out.textContent = read();

    var input = document.createElement('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step;
    input.value = read();
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      if (idx === undefined) { self.cfg[group][key] = v; }
      else { self.cfg[group][key][idx] = v; }
      out.textContent = v;
      self.rebuild();
    });

    wrap.appendChild(label);
    wrap.appendChild(out);
    wrap.appendChild(input);
    wrap._sync = function () { input.value = read(); out.textContent = read(); };
    return wrap;
  },

  syncSliders: function () {
    var rows = this.panel.querySelectorAll('.tuner-row');
    for (var i = 0; i < rows.length; i++) { if (rows[i]._sync) { rows[i]._sync(); } }
  },

  /**
   * The readout is the deliverable: nothing persists, so these numbers are how
   * a change gets from the browser back into the repo.
   */
  refreshReadout: function () {
    if (!this.readout) { return; }
    var lines = ['// data/level78-layout.json'];
    var keys = ['deck', 'glassTray', 'railings', 'stairs', 'upperViewingArea', 'elevator'];
    for (var i = 0; i < keys.length; i++) {
      lines.push('"' + keys[i] + '": ' + JSON.stringify(this.cfg[keys[i]]) + ',');
    }
    lines.push('', '// index.html');
    var props = this.props();
    for (var j = 0; j < props.length; j++) { lines.push(props[j].snippet(this)); }
    this.readout.value = lines.join('\n');
  }
});

function fmt3 (p) {
  var r = function (v) { return Math.round(v * 1000) / 1000; };
  return r(p.x) + ' ' + r(p.y) + ' ' + r(p.z);
}

// Bootstrap. No inline JS in index.html (CLAUDE.md, Conventions), so the gate
// lives here: without ?tune nothing is registered on the scene and the panel
// never exists.
(function () {
  if (!new URLSearchParams(window.location.search).has('tune')) { return; }
  var attach = function () {
    var scene = document.querySelector('a-scene');
    if (!scene) { return; }
    if (scene.hasLoaded) { scene.setAttribute('tuner', ''); }
    else { scene.addEventListener('loaded', function () { scene.setAttribute('tuner', ''); }); }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else { attach(); }
}());
