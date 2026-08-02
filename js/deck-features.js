/* global AFRAME, THREE */

/**
 * Deck furniture for Phase 5: the signage, the viewpoint hotspots, and the
 * fade-out that catches you when you go over the edge.
 */

/**
 * canvas-sign — "Mahanakhon SkyWalk · 314 m" on a plane.
 *
 * The label is drawn to a 2D canvas and used as a texture rather than going
 * through A-Frame's `text` component, which fetches an MSDF font atlas from a
 * CDN at runtime. That would be an unpinned third-party dependency for one
 * line of text (CLAUDE.md §2), and it fails closed if the CDN is unreachable.
 * A canvas uses fonts the browser already has.
 */
AFRAME.registerComponent('canvas-sign', {
  schema: {
    title:    { type: 'string', default: 'Mahanakhon SkyWalk' },
    subtitle: { type: 'string', default: '314 m' },
    width:    { type: 'number', default: 3.4 },
    height:   { type: 'number', default: 0.95 },
    bg:       { type: 'color', default: '#12161b' },
    fg:       { type: 'color', default: '#f2f6fa' },
    accent:   { type: 'color', default: '#d8a24a' }
  },

  init: function () {
    var d = this.data;
    var PX = 512;
    var c = document.createElement('canvas');
    c.width = PX; c.height = Math.round(PX * d.height / d.width);
    var g = c.getContext('2d');

    g.fillStyle = d.bg;
    g.fillRect(0, 0, c.width, c.height);

    g.strokeStyle = d.accent;
    g.lineWidth = 3;
    g.strokeRect(6, 6, c.width - 12, c.height - 12);

    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // Shrink to fit rather than trusting a fixed size: the title is
    // configurable, and at the default it overflowed the panel.
    var fit = function (text, weight, startPx, maxWidth) {
      var px = startPx;
      do {
        g.font = weight + ' ' + px + 'px ui-sans-serif, system-ui, Arial, sans-serif';
        if (g.measureText(text).width <= maxWidth) { break; }
        px -= 1;
      } while (px > 6);
      return px;
    };

    var inner = c.width - 48;
    g.fillStyle = d.fg;
    fit(d.title, '600', Math.round(c.height * 0.30), inner);
    g.fillText(d.title, c.width / 2, c.height * 0.38);

    g.fillStyle = d.accent;
    fit('· ' + d.subtitle + ' ·', '500', Math.round(c.height * 0.22), inner);
    g.fillText('· ' + d.subtitle + ' ·', c.width / 2, c.height * 0.72);

    var tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace !== undefined) { tex.colorSpace = THREE.SRGBColorSpace; }
    tex.anisotropy = 4;

    var mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(d.width, d.height),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false })
    );
    this.el.setObject3D('mesh', mesh);
  },

  remove: function () { this.el.removeObject3D('mesh'); }
});

/**
 * viewpoint — a clickable marker that walks the player to a spot on the deck.
 *
 * Positions are checked against the navmesh on arrival by character-controller's
 * own ground probe, so a badly-placed hotspot drops you rather than stranding
 * you in mid-air — worth knowing if you move these.
 */
AFRAME.registerComponent('viewpoint', {
  schema: {
    player: { type: 'selector' },
    target: { type: 'vec3' },
    label:  { type: 'string', default: 'Viewpoint' },
    color:  { type: 'color', default: '#d8a24a' }
  },

  init: function () {
    var d = this.data;

    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.58, 28),
      new THREE.MeshBasicMaterial({
        color: d.color, side: THREE.DoubleSide, transparent: true, opacity: 0.75, toneMapped: false
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;

    var pip = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 10),
      new THREE.MeshBasicMaterial({ color: d.color, toneMapped: false })
    );
    pip.position.y = 0.85;

    var group = new THREE.Group();
    group.add(ring); group.add(pip);
    this.el.setObject3D('mesh', group);
    this.ring = ring; this.pip = pip;

    // A generous invisible target, so clicking is not a pixel hunt.
    this.el.setAttribute('geometry', 'primitive: cylinder; radius: 0.7; height: 1.8');
    this.el.setAttribute('material', 'opacity: 0; transparent: true; depthWrite: false');
    this.el.setAttribute('position', this.el.getAttribute('position'));
    this.el.classList.add('clickable');

    this.onClick = this.onClick.bind(this);
    this.el.addEventListener('click', this.onClick);
    this.t = Math.random() * 6;
  },

  remove: function () { this.el.removeEventListener('click', this.onClick); },

  onClick: function () {
    var p = this.data.player;
    if (!p) { return; }
    var t = this.data.target;
    p.object3D.position.set(t.x, t.y, t.z);
    var cc = p.components['character-controller'];
    if (cc) { cc.vy = 0; cc.grounded = true; }
    p.emit('teleported', { label: this.data.label }, false);
  },

  tick: function (time, dt) {
    this.t += (dt || 16) / 1000;
    if (this.pip) { this.pip.position.y = 0.85 + Math.sin(this.t * 2) * 0.08; }
    if (this.ring) { this.ring.rotation.z += 0.004; }
  }
});

/**
 * fall-fade — black-out and respawn after the drop.
 *
 * Listens for `player-fell` from character-controller, fades a DOM overlay in,
 * puts the player back on the deck while the screen is black, then fades out.
 * Doing the reset at full black is what hides the teleport.
 */
AFRAME.registerComponent('fall-fade', {
  schema: {
    overlay:  { type: 'selector' },
    fadeIn:   { type: 'number', default: 450 },
    hold:     { type: 'number', default: 320 },
    fadeOut:  { type: 'number', default: 650 }
  },

  init: function () {
    this.busy = false;
    this.onFell = this.onFell.bind(this);
    this.el.addEventListener('player-fell', this.onFell);
  },

  remove: function () { this.el.removeEventListener('player-fell', this.onFell); },

  onFell: function () {
    if (this.busy) { return; }
    this.busy = true;

    var o = this.data.overlay;
    var cc = this.el.components['character-controller'];
    var self = this;

    if (o) {
      o.style.transition = 'opacity ' + this.data.fadeIn + 'ms ease';
      o.style.opacity = '1';
      o.style.pointerEvents = 'auto';
    }

    setTimeout(function () {
      if (cc) { cc.respawnPlayer(); }
      setTimeout(function () {
        if (o) {
          o.style.transition = 'opacity ' + self.data.fadeOut + 'ms ease';
          o.style.opacity = '0';
          o.style.pointerEvents = 'none';
        }
        setTimeout(function () { self.busy = false; }, self.data.fadeOut);
      }, self.data.hold);
    }, this.data.fadeIn);
  }
});
