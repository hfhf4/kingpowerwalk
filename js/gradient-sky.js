/* global AFRAME */

/**
 * gradient-sky — sky gradient with a sun (SPEC §10, Phase 5).
 *
 * A flat-coloured dome reads as a wall. Real sky is deep overhead and pales
 * towards the horizon where scattering piles up along the long sightline, and
 * that horizon band is what sells altitude — at 314 m you can see it.
 *
 * Beyond the vertical ramp this adds the two things that stop a gradient
 * looking like a gradient:
 *
 *   - **A sun.** A disc plus a wide glow falling off around it, so the sky has
 *     a direction and a light source you can point at. `sunDirection` is shared
 *     with the scene's directional light by sky-time, so shading and sky agree.
 *   - **Horizon warmth.** Near sunrise and sunset the band around the sun goes
 *     warm while the rest of the horizon stays cool. A single horizon colour
 *     cannot do that, so `sunTint` is mixed in by angular proximity to the sun.
 *
 * Procedural rather than a photographic panorama: SPEC §12 limits photos and
 * panoramas to the owner's own, and this needs no assets at all.
 *
 * IMPORTANT — give a-sky an explicit large `radius`. A-Frame defaults it to 500,
 * and the dome writes depth, so with the default anything further than 500 m
 * fails the depth test and is silently never drawn. That hides the entire city
 * and most of the ground plane while leaving raycasts working perfectly, which
 * makes it look like a fog or material problem rather than a clipping one.
 *
 * Usage:
 *   <a-sky radius="12000" material="shader: gradient-sky; ..."></a-sky>
 */
AFRAME.registerShader('gradient-sky', {
  schema: {
    topColor:     { type: 'color', default: '#2f6ea6', is: 'uniform' },
    horizonColor: { type: 'color', default: '#cdd9e5', is: 'uniform' },
    // Warm wash applied near the sun, strongest at the horizon.
    sunTint:      { type: 'color', default: '#ffd9a0', is: 'uniform' },
    sunColor:     { type: 'color', default: '#fff6e0', is: 'uniform' },
    sunDirection: { type: 'vec3',  default: { x: 0.4, y: 0.5, z: -0.76 }, is: 'uniform' },
    // Angular radius of the disc, radians. The real sun is ~0.0047.
    sunSize:      { type: 'number', default: 0.022, is: 'uniform' },
    // How far the glow spreads past the disc. Larger = hazier.
    sunGlow:      { type: 'number', default: 0.30, is: 'uniform' },
    // How fast the vertical gradient falls off. Higher keeps deep colour lower.
    exponent:     { type: 'number', default: 0.8, is: 'uniform' },
    // Shifts the pale band below eye level, unitless in -1..1. A fraction of
    // the dome rather than world metres, so it stays correct whatever radius
    // the sky is given — and it has to be given a large one, see above.
    horizonBias:  { type: 'number', default: -0.3, is: 'uniform' }
  },

  vertexShader: [
    'varying vec3 vWorldPosition;',
    'void main() {',
    '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
    '  vWorldPosition = worldPosition.xyz;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n'),

  fragmentShader: [
    'uniform vec3 topColor;',
    'uniform vec3 horizonColor;',
    'uniform vec3 sunTint;',
    'uniform vec3 sunColor;',
    'uniform vec3 sunDirection;',
    'uniform float sunSize;',
    'uniform float sunGlow;',
    'uniform float exponent;',
    'uniform float horizonBias;',
    'varying vec3 vWorldPosition;',

    'void main() {',
    // Direction only, so the gradient is independent of the dome's radius.
    '  vec3 dir = normalize(vWorldPosition);',
    '  vec3 sun = normalize(sunDirection);',

    // Vertical ramp, horizon -> zenith.
    '  float h = (dir.y - horizonBias) / (1.0 - horizonBias);',
    '  float t = pow(clamp(h, 0.0, 1.0), exponent);',
    '  vec3 col = mix(horizonColor, topColor, t);',

    // Warm the sky towards the sun, and only low down — high sun should not
    // wash the whole dome orange.
    '  float toSun = max(dot(dir, sun), 0.0);',
    '  float lowSun = 1.0 - clamp(sun.y * 1.6, 0.0, 1.0);',
    '  float warm = pow(toSun, 3.0) * lowSun * (1.0 - t * 0.65);',
    '  col = mix(col, sunTint, clamp(warm, 0.0, 0.85));',

    // Glow, then the disc itself. smoothstep on the angle keeps the rim clean
    // at any FOV instead of aliasing into a polygon.
    '  float ang = acos(clamp(toSun, -1.0, 1.0));',
    '  float glow = exp(-ang * ang / (sunGlow * sunGlow)) * 0.55;',
    '  col += sunColor * glow * clamp(sun.y * 2.0 + 0.35, 0.0, 1.0);',

    '  float disc = 1.0 - smoothstep(sunSize * 0.85, sunSize * 1.35, ang);',
    '  col = mix(col, sunColor, disc);',

    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n')
});
