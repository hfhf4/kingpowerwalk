/* global AFRAME */

/**
 * gradient-sky — a vertical sky gradient (SPEC §10, Phase 4).
 *
 * A flat-coloured dome reads as a wall. Real sky is deep overhead and pales
 * towards the horizon, where atmospheric scattering piles up along the long
 * sightline — and that horizon band is exactly what sells altitude, because at
 * 314 m you can see it. Fog is set to the same horizon colour so distant
 * geometry dissolves into the sky rather than ending at a visible edge.
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
 *   <a-sky radius="12000" material="shader: gradient-sky; topColor: #3f7cad; ..."></a-sky>
 */
AFRAME.registerShader('gradient-sky', {
  schema: {
    topColor:     { type: 'color', default: '#3f7cad', is: 'uniform' },
    horizonColor: { type: 'color', default: '#cdd9e5', is: 'uniform' },
    // How fast the gradient falls off towards the horizon. Higher keeps the
    // deep colour further down; lower spreads the pale band wider.
    exponent:     { type: 'number', default: 0.8, is: 'uniform' },
    // Shifts the pale band below eye level, unitless in -1..1. Expressed as a
    // fraction of the dome rather than world metres so it stays correct
    // whatever radius the sky is given — and the sky has to be given a large
    // one, see the note below.
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
    'uniform float exponent;',
    'uniform float horizonBias;',
    'varying vec3 vWorldPosition;',
    'void main() {',
    // Direction only, so the gradient is independent of the dome's radius.
    '  float h = normalize(vWorldPosition).y;',
    '  h = (h - horizonBias) / (1.0 - horizonBias);',
    '  float t = pow(clamp(h, 0.0, 1.0), exponent);',
    '  gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);',
    '}'
  ].join('\n')
});
