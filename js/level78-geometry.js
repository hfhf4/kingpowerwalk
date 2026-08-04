/* global THREE */

/**
 * level78-geometry — the Level 78 blockout generator, ported to the browser.
 *
 * This is a direct port of the geometry half of `tools/build_level78.py`. The
 * Python script remains the single source of truth for what ships: it bakes
 * `assets/models/deck.glb` and `assets/nav/navmesh.glb`, and those committed
 * files are what the site loads. This port exists so `js/tuner.js` can preview a
 * *proposed* layout live — including a navmesh you can actually walk on —
 * without a build step (CLAUDE.md §1).
 *
 * Because there are now two implementations of the same geometry, they can
 * drift. The parity test in the harness compares this port against the
 * committed GLBs on vertex count, triangle count and bounding box for the
 * committed config, so drift fails loudly rather than showing you a preview of
 * something that will never be built.
 *
 * Two things are deliberately not "tidied" from the Python:
 *
 *   - `quad`'s winding is (0,2,1),(0,3,2). Reversing it points the navmesh
 *     normals at -Y, and THREE.Raycaster backface-culls FrontSide meshes, so
 *     every downward ground probe would miss and the player could not move at
 *     all. This has already happened once.
 *   - The `while (x < limit) { ...; x += step; }` loops accumulate float error
 *     rather than counting integer steps. Python and JS both use IEEE-754
 *     doubles, so accumulating identically is what keeps cell counts equal.
 *     Rewriting either side as `for (i = 0; i < n; i++)` would silently change
 *     the cell count near the limit and break parity.
 *
 * No A-Frame and no DOM here — just functions from config to BufferGeometry, so
 * the port can be tested on its own.
 */
(function (global) {
  'use strict';

  /** Axis-aligned box. Returns [vertices, indices]; matches Python `box`. */
  function box (x0, y0, z0, x1, y1, z1) {
    var v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
             [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    var f = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
             3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
    return [v, f];
  }

  /** One quad from four corners. Winding is load-bearing — see the note above. */
  function quad (a, b, c, d) {
    return [[a, b, c, d], [0, 2, 1, 0, 3, 2]];
  }

  /** Closed cylinder with flat caps; matches Python `cylinder`. */
  function cylinder (cx, cz, r, y0, y1, n) {
    n = n || 32;
    var v = [], f = [], ys = [y0, y1], k, i, j, a;
    for (k = 0; k < ys.length; k++) {
      for (i = 0; i < n; i++) {
        a = 2 * Math.PI * i / n;
        v.push([cx + r * Math.cos(a), ys[k], cz + r * Math.sin(a)]);
      }
    }
    for (i = 0; i < n; i++) {
      j = (i + 1) % n;
      f.push(i, j, n + j, i, n + j, n + i);
    }
    for (i = 1; i < n - 1; i++) { f.push(0, i + 1, i, n, n + i, n + i + 1); }
    return [v, f];
  }

  /** Concatenate parts, offsetting each part's indices; matches Python `merge`. */
  function merge (parts) {
    var vv = [], ff = [], i, p, o, j;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      o = vv.length;
      for (j = 0; j < p[0].length; j++) { vv.push(p[0][j]); }
      for (j = 0; j < p[1].length; j++) { ff.push(p[1][j] + o); }
    }
    return [vv, ff];
  }

  /**
   * Positions go through Float32Array, matching the Python's struct.pack('<f').
   * Keeping the same precision is what lets the parity test compare bounding
   * boxes exactly instead of with a tolerance.
   */
  function toGeometry (merged) {
    var verts = merged[0], inds = merged[1];
    var pos = new Float32Array(verts.length * 3);
    for (var i = 0; i < verts.length; i++) {
      pos[i * 3] = verts[i][0];
      pos[i * 3 + 1] = verts[i][1];
      pos[i * 3 + 2] = verts[i][2];
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(verts.length > 65535 ? new THREE.BufferAttribute(new Uint32Array(inds), 1)
                                    : new THREE.BufferAttribute(new Uint16Array(inds), 1));
    g.computeVertexNormals();
    return g;
  }

  /** Stair width tapers from topWidth to bottomWidth; matches Python `width_at_x`. */
  function widthAtX (cfg, x) {
    var s = cfg.stairs;
    var t = (x - s.rearX) / (s.frontX - s.rearX);
    return s.topWidth + (s.bottomWidth - s.topWidth) * t;
  }

  /**
   * The deck: terrace, cantilevered glass tray, bridging slab, lip, stairs,
   * The Peak, the elevator and the rails. Returns the two primitives the GLB
   * carries — opaque (material 0) and transparent (material 1).
   */
  function buildDeck (cfg) {
    var d = cfg.deck, halfD = d.depth / 2, halfW = d.width / 2, gy = d.elevation;
    var glass = cfg.glassTray, s = cfg.stairs, up = cfg.upperViewingArea;
    var opaque = [], transparent = [];

    // The terrace runs the full depth of the deck envelope.
    opaque.push(box(-halfD, -0.12, -halfW, halfD, gy, halfW));

    // The glass tray is CANTILEVERED past the tower, not inset into the deck.
    // Inset it sat over solid roof, so looking down through it showed roof and
    // no amount of transparency could fix that.
    var gx0 = glass.innerX, gx1 = glass.outerX, gw = glass.width / 2;
    transparent.push(box(gx0, -0.04, -gw, gx1, gy, gw));

    // A bridging slab from the deck edge out to the tray, so there is no gap to
    // fall through where the terrace ends.
    if (gx0 > halfD) { opaque.push(box(halfD - 0.05, -0.10, -gw, gx0 + 0.02, gy - 0.005, gw)); }

    // Lip around the three exposed sides, so the tray reads as a structure
    // rather than a pane floating in space.
    var lip = 0.10;
    opaque.push(box(gx1 - lip, -0.06, -gw, gx1, gy + 0.05, gw),
                box(gx0, -0.06, -gw, gx1, gy + 0.05, -gw + lip),
                box(gx0, -0.06, gw - lip, gx1, gy + 0.05, gw));

    // Stepped treads rising to the upper platform.
    var n = s.steps, dx = (s.frontX - s.rearX) / n, i, x0, x1, y1, w;
    for (i = 0; i < n; i++) {
      x0 = s.frontX - (i + 1) * dx;
      x1 = s.frontX - i * dx;
      y1 = gy + (i + 1) * up.elevation / n;
      w = widthAtX(cfg, (x0 + x1) / 2);
      opaque.push(box(x0, gy, -w / 2, x1, y1, w / 2));
    }

    // The Peak is a thin slab, not a full-height block beside the stairs.
    opaque.push(box(up.rearX, up.elevation - 0.22, -up.width / 2,
                    up.frontX, up.elevation, up.width / 2));

    var e = cfg.elevator;
    opaque.push(cylinder(e.centre[0], e.centre[1], e.diameter / 2, gy, e.height));

    // Simplified glass rail: thin blocks around the rectangular public envelope.
    var h = cfg.railings.height, t = 0.05;
    transparent.push(box(-halfD, gy, -halfW, -halfD + t, h, halfW),   // rear
                     box(-halfD, gy, halfW - t, halfD, h, halfW),     // left
                     box(-halfD, gy, -halfW, halfD, h, -halfW + t),   // right
                     // Rails follow the tray out and close its far end.
                     box(halfD, gy, gw - t, gx1, h, gw),
                     box(halfD, gy, -gw, gx1, h, -gw + t),
                     box(gx1 - t, gy, -gw, gx1, h, gw));

    return { opaque: toGeometry(merge(opaque)), transparent: toGeometry(merge(transparent)) };
  }

  /**
   * The navmesh: half-metre cells over the terrace (minus the elevator and the
   * platform footprint), the stair treads, The Peak, and out onto the tray.
   */
  function buildNavmesh (cfg) {
    var d = cfg.deck, halfD = d.depth / 2, halfW = d.width / 2, gy = 0.05;
    var s = cfg.stairs, up = cfg.upperViewingArea, e = cfg.elevator;
    var inset = cfg.railings.navmeshInset;
    var cells = [], step = 0.5, x, z, blocked;

    x = -halfD + inset + 0.25;
    while (x < halfD - inset) {
      z = -halfW + inset + 0.25;
      while (z < halfW - inset) {
        blocked = (Math.hypot(x - e.centre[0], z - e.centre[1]) < e.diameter / 2 + 0.45) ||
                  (x > up.rearX - 0.3 && x < s.rearX + 0.3 && Math.abs(z) < up.width / 2 + 0.3);
        if (!blocked) {
          cells.push(quad([x - step / 2, gy, z - step / 2], [x + step / 2, gy, z - step / 2],
                          [x + step / 2, gy, z + step / 2], [x - step / 2, gy, z + step / 2]));
        }
        z += step;
      }
      x += step;
    }

    var n = s.steps, dx = (s.frontX - s.rearX) / n, i, x0, x1, y, w;
    for (i = 0; i < n; i++) {
      x0 = s.frontX - (i + 1) * dx;
      x1 = s.frontX - i * dx;
      y = gy + (i + 1) * up.elevation / n;
      w = widthAtX(cfg, (x0 + x1) / 2) - 0.6;
      cells.push(quad([x0, y, -w / 2], [x1, y, -w / 2], [x1, y, w / 2], [x0, y, w / 2]));
    }

    cells.push(quad([up.rearX + 0.35, up.elevation + 0.05, -up.width / 2 + 0.35],
                    [up.frontX - 0.05, up.elevation + 0.05, -up.width / 2 + 0.35],
                    [up.frontX - 0.05, up.elevation + 0.05, up.width / 2 - 0.35],
                    [up.rearX + 0.35, up.elevation + 0.05, up.width / 2 - 0.35]));

    // Walk out onto the cantilevered tray. Without this the navmesh stops at the
    // deck edge and the tray is scenery you can look at but never stand on.
    var g = cfg.glassTray, tw = g.width / 2 - inset;
    x = halfD - inset;
    while (x < g.outerX - inset) {
      z = -tw;
      while (z < tw) {
        cells.push(quad([x - step / 2, gy, z - step / 2], [x + step / 2, gy, z - step / 2],
                        [x + step / 2, gy, z + step / 2], [x - step / 2, gy, z + step / 2]));
        z += step;
      }
      x += step;
    }

    return toGeometry(merge(cells));
  }

  global.KPWLevel78 = {
    box: box,
    quad: quad,
    cylinder: cylinder,
    merge: merge,
    widthAtX: widthAtX,
    buildDeck: buildDeck,
    buildNavmesh: buildNavmesh
  };
}(window));
