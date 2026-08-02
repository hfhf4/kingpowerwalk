/* global AFRAME, THREE */

/**
 * character-controller — desktop locomotion for the deck (SPEC §10, Phase 1).
 *
 * Attach to the player rig. It owns the rig's position and the avatar's yaw,
 * and drives the avatar's animation from how fast it is actually moving.
 *
 *   - Camera-relative WASD. Forward is wherever the camera is looking, so
 *     turning the mouse turns which way W walks.
 *   - Idle <-> Walk blended by speed rather than switched, so easing off the
 *     key eases out of the walk cycle.
 *   - Hold Shift to move faster. There is no separate run clip — the walk clip
 *     is played proportionally faster, which is why `clipStrideSpeed` matters
 *     (see below).
 *   - The avatar yaws to face travel direction, smoothed so it banks around
 *     rather than snapping.
 *   - Movement is constrained to the navmesh: a candidate position is tested by
 *     casting a ray straight down onto assets/nav/navmesh.glb. Blocked moves
 *     retry on each axis separately, which gives sliding along the parapet
 *     instead of sticking to it.
 *
 * On `clipStrideSpeed`: the source Walk.fbx was exported from Mixamo *with*
 * root motion — the hips travelled 1.607 m over the 1.25 s clip. That motion
 * was stripped when assets/models/avatar.glb was built (it would otherwise
 * fight this component for control of position), but the ratio it implies,
 * 1.29 m/s, is the speed the animation was authored to walk at. Playing the
 * clip at `speed / clipStrideSpeed` keeps the feet planted at any speed. Change
 * `walkSpeed` freely; only change `clipStrideSpeed` if the clip itself changes.
 *
 * The avatar model faces +Z. That is also derived from the source clip: its
 * root motion ran +1.607 m along Z, so +Z is the direction it walks.
 */
AFRAME.registerComponent('character-controller', {
  schema: {
    avatar:           { type: 'selector' },
    camera:           { type: 'selector' },
    navmesh:          { type: 'selector' },
    walkSpeed:        { type: 'number', default: 1.29 },
    sprintMultiplier: { type: 'number', default: 2.4 },
    clipStrideSpeed:  { type: 'number', default: 1.29 },
    turnRate:         { type: 'number', default: 10 },
    blendRate:        { type: 'number', default: 9 },
    idleClip:         { type: 'string', default: 'Idle' },
    walkClip:         { type: 'string', default: 'Walk' },
    enabled:          { type: 'boolean', default: true },

    // --- jumping and falling (Phase 5) ---
    gravity:          { type: 'number', default: -22 },
    jumpSpeed:        { type: 'number', default: 5.4 },
    // Below this the fall is unrecoverable; the screen fades and we respawn.
    // Street level is -314, so this fires just before impact.
    fallResetY:       { type: 'number', default: -300 },
    respawn:          { type: 'vec3', default: { x: 0, y: 0, z: -6.5 } }
  },

  init: function () {
    this.keys = {};
    this.mixer = null;
    this.idleAction = null;
    this.walkAction = null;
    this.navMeshObject = null;

    this.walkWeight = 0;
    // Start facing away from the default third-person camera, which sits at +Z.
    this.yaw = Math.PI;

    // Vertical state. `grounded` gates both jumping and the navmesh constraint:
    // while airborne the player is deliberately NOT held to the navmesh, which
    // is what lets you clear the parapet and fall off the building.
    this.vy = 0;
    this.grounded = true;
    this.falling = false;

    // Scratch objects — reused every frame so tick allocates nothing.
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.move = new THREE.Vector3();
    this.candidate = new THREE.Vector3();
    this.rayOrigin = new THREE.Vector3();
    this.UP = new THREE.Vector3(0, 1, 0);
    this.DOWN = new THREE.Vector3(0, -1, 0);
    this.raycaster = new THREE.Raycaster();

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = this.onBlur.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    this.whenModelReady(this.data.avatar, this.setupAnimation.bind(this));
    this.whenModelReady(this.data.navmesh, this.setupNavmesh.bind(this));
  },

  remove: function () {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  },

  /** Run `cb` once the entity's glTF is in the scene graph, now or later. */
  whenModelReady: function (el, cb) {
    if (!el) { return; }
    var existing = el.getObject3D('mesh');
    if (existing) { cb(existing); return; }
    el.addEventListener('model-loaded', function (evt) { cb(evt.detail.model); }, { once: true });
  },

  setupAnimation: function (model) {
    var clips = model.animations || [];
    this.mixer = new THREE.AnimationMixer(model);

    var idle = THREE.AnimationClip.findByName(clips, this.data.idleClip);
    var walk = THREE.AnimationClip.findByName(clips, this.data.walkClip);

    if (!idle || !walk) {
      console.warn('[character-controller] expected clips "' + this.data.idleClip +
                   '" and "' + this.data.walkClip + '", found: ' +
                   clips.map(function (c) { return c.name; }).join(', '));
    }

    if (idle) {
      this.idleAction = this.mixer.clipAction(idle);
      this.idleAction.setEffectiveWeight(1).play();
    }
    if (walk) {
      this.walkAction = this.mixer.clipAction(walk);
      this.walkAction.setEffectiveWeight(0).play();
    }
  },

  setupNavmesh: function (model) {
    var found = null;
    model.traverse(function (o) {
      if (!found && o.isMesh) { found = o; }
      // Keep the object itself visible so raycasts still hit it — only the
      // material is switched off. THREE skips invisible *objects* when casting.
      if (o.isMesh && o.material) { o.material.visible = false; }
    });
    this.navMeshObject = found;
    if (!found) { console.warn('[character-controller] navmesh entity has no mesh'); }
  },

  onKeyDown: function (evt) {
    var t = evt.target;
    if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) { return; }
    this.keys[evt.code] = true;
    // Edge-triggered: holding space must not pogo.
    if (evt.code === 'Space' && !evt.repeat) {
      evt.preventDefault();
      this.jump();
    }
  },

  onKeyUp: function (evt) { this.keys[evt.code] = false; },

  /** Height of the navmesh under (x, z), or null when there is nothing there. */
  groundHeightAt: function (x, z) {
    if (!this.navMeshObject) { return 0; }
    this.rayOrigin.set(x, 40, z);
    this.raycaster.set(this.rayOrigin, this.DOWN);
    var hits = this.raycaster.intersectObject(this.navMeshObject, false);
    return hits.length ? hits[0].point.y : null;
  },

  jump: function () {
    if (!this.grounded) { return; }
    this.vy = this.data.jumpSpeed;
    this.grounded = false;
    this.el.emit('player-jumped', null, false);
  },

  respawnPlayer: function () {
    var r = this.data.respawn;
    this.el.object3D.position.set(r.x, r.y, r.z);
    this.vy = 0;
    this.grounded = true;
    this.falling = false;
  },

  /** Drop every key when the window loses focus, or they latch down. */
  onBlur: function () { this.keys = {}; },

  tick: function (time, timeDelta) {
    if (!this.data.enabled) { return; }

    // Clamp: a backgrounded tab returns one enormous delta, which would
    // otherwise teleport the player straight through the parapet.
    var dt = Math.min((timeDelta || 0) / 1000, 0.1);
    if (dt <= 0) { return; }

    var k = this.keys;
    var f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    var r = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    var sprinting = !!(k.ShiftLeft || k.ShiftRight);

    // Touch controls (Phase 5) feed the same pipeline as the keys.
    if (this.touch) { f += this.touch.f; r += this.touch.r; }
    f = Math.max(-1, Math.min(1, f));
    r = Math.max(-1, Math.min(1, r));

    var speed = 0;

    if ((f || r) && this.data.camera) {
      // Camera-relative basis, flattened to the deck.
      //
      // Object3D.getWorldDirection() reports the +Z axis, but a camera looks
      // down -Z, so this has to be negated. THREE.Camera overrides the method
      // to account for that — this is the A-Frame entity's Object3D, not the
      // camera itself, so it uses the base implementation and does not.
      this.data.camera.object3D.getWorldDirection(this.forward);
      this.forward.negate();
      this.forward.y = 0;

      if (this.forward.lengthSq() > 1e-6) {
        this.forward.normalize();
        this.right.crossVectors(this.forward, this.UP).normalize();

        this.move.set(0, 0, 0)
          .addScaledVector(this.forward, f)
          .addScaledVector(this.right, r);

        if (this.move.lengthSq() > 1e-6) {
          this.move.normalize();
          speed = this.data.walkSpeed * (sprinting ? this.data.sprintMultiplier : 1);
          if (this.grounded) {
            this.applyMove(this.move, speed * dt);
          } else {
            // Airborne: keep your momentum and go over the edge if that is
            // where you aimed. The navmesh only holds you while your feet are
            // on it.
            var pos = this.el.object3D.position;
            pos.x += this.move.x * speed * dt;
            pos.z += this.move.z * speed * dt;
          }
          this.yaw = Math.atan2(this.move.x, this.move.z);
        }
      }
    }

    this.updateVertical(dt);
    this.updateFacing(dt);
    this.updateAnimation(speed, dt);
  },

  /**
   * Gravity, ground contact and the long drop.
   *
   * Ground is probed against the navmesh rather than the deck mesh: the navmesh
   * is already inset from the edge, so stepping past it means there is nothing
   * under you, which is exactly the condition for falling.
   */
  updateVertical: function (dt) {
    var pos = this.el.object3D.position;
    var groundY = this.groundHeightAt(pos.x, pos.z);

    if (this.grounded && groundY !== null) {
      pos.y = groundY;
      this.vy = 0;
    } else {
      this.vy += this.data.gravity * dt;
      pos.y += this.vy * dt;

      if (groundY !== null && this.vy <= 0 && pos.y <= groundY) {
        pos.y = groundY;
        this.vy = 0;
        if (!this.grounded) { this.el.emit('player-landed', null, false); }
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }

    // Walked off the edge rather than jumped: start falling from rest.
    if (this.grounded && groundY === null) { this.grounded = false; }

    if (!this.falling && pos.y < this.data.fallResetY) {
      this.falling = true;
      this.el.emit('player-fell', null, false);
    }
  },

  /**
   * Move the rig by `dist` along `dir`, staying on the navmesh. If the full
   * step is blocked, try each axis alone so the player slides along a wall
   * rather than stopping dead against it.
   */
  applyMove: function (dir, dist) {
    var pos = this.el.object3D.position;
    var dx = dir.x * dist;
    var dz = dir.z * dist;

    if (this.onNavmesh(pos.x + dx, pos.z + dz)) {
      pos.x += dx;
      pos.z += dz;
      return;
    }
    if (this.onNavmesh(pos.x + dx, pos.z)) { pos.x += dx; return; }
    if (this.onNavmesh(pos.x, pos.z + dz)) { pos.z += dz; }
  },

  onNavmesh: function (x, z) {
    // Fail open until the navmesh has loaded, so the player is never frozen
    // by a slow asset fetch.
    if (!this.navMeshObject) { return true; }
    this.rayOrigin.set(x, 5, z);
    this.raycaster.set(this.rayOrigin, this.DOWN);
    return this.raycaster.intersectObject(this.navMeshObject, false).length > 0;
  },

  updateFacing: function (dt) {
    if (!this.data.avatar) { return; }
    var obj = this.data.avatar.object3D;
    var diff = this.yaw - obj.rotation.y;
    // Shortest way round, so crossing the +/-PI seam doesn't spin the avatar.
    while (diff > Math.PI) { diff -= Math.PI * 2; }
    while (diff < -Math.PI) { diff += Math.PI * 2; }
    obj.rotation.y += diff * Math.min(1, this.data.turnRate * dt);
  },

  updateAnimation: function (speed, dt) {
    if (!this.mixer) { return; }

    // No Jump clip ships in avatar.glb — only Idle and Walk — so the hop is
    // faked by holding the walk cycle at a mid-stride frame, legs apart, and
    // freezing playback. It reads as a leap without inventing a clip.
    if (!this.grounded && this.walkAction) {
      this.walkWeight += (1 - this.walkWeight) * Math.min(1, 14 * dt);
      if (this.idleAction) { this.idleAction.setEffectiveWeight(1 - this.walkWeight); }
      this.walkAction.setEffectiveWeight(this.walkWeight);
      this.walkAction.timeScale = 0;
      this.walkAction.time = 0.34;
      this.mixer.update(dt);
      return;
    }

    var target = speed > 0 ? 1 : 0;
    this.walkWeight += (target - this.walkWeight) * Math.min(1, this.data.blendRate * dt);
    if (this.walkWeight < 0.001) { this.walkWeight = 0; }
    if (this.walkWeight > 0.999) { this.walkWeight = 1; }

    if (this.idleAction) { this.idleAction.setEffectiveWeight(1 - this.walkWeight); }
    if (this.walkAction) {
      this.walkAction.setEffectiveWeight(this.walkWeight);
      // Stride matches ground speed, so the feet don't skate when sprinting.
      if (speed > 0) {
        this.walkAction.timeScale = speed / this.data.clipStrideSpeed;
      }
    }

    this.mixer.update(dt);
  }
});
