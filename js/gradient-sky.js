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
 * Usage:
 *   <a-sky material="shader: gradient-sky; topColor: #3f7cad; ..."></a-sky>
 */
AFRAME.registerShader('gradient-sky', {
  schema: {
    topColor:     { type: 'color', default: '#3f7cad', is: 'uniform' },
    horizonColor: { type: 'color', default: '#cdd9e5', is: 'uniform' },
    // How fast the gradient falls off towards the horizon. Higher keeps the
    // deep colour further down; lower spreads the pale band wider.
    exponent:     { type: 'number', default: 0.8, is: 'uniform' },
    // Shifts the horizon line up or down in metres of world Y. The deck sits
    // at y=0 but the ground is at y=-314, so the visual horizon belongs
    // roughly halfway down, not at the origin.
    horizonY:     { type: 'number', default: -150, is: 'uniform' }
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
    'uniform float horizonY;',
    'varying vec3 vWorldPosition;',
    'void main() {',
    // Normalise height over the dome, measured from the shifted horizon.
    '  float h = normalize(vWorldPosition - vec3(0.0, horizonY, 0.0)).y;',
    '  float t = pow(max(h, 0.0), exponent);',
    '  gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);',
    '}'
  ].join('\n')
});
