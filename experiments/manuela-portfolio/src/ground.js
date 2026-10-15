import * as THREE from 'three'
import { renderCrackCanvas } from './cracks.js'

const rand = (a, b) => a + Math.random() * (b - a)

// ---------------------------------------------------------------------------
// Ground shader — dark surface, card shadow, shockwave, SVG crack overlay
// ---------------------------------------------------------------------------
const groundVertex = /* glsl */ `
  varying vec2 vPos;
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPos = world.xy;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const groundFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uImpactTime;
  uniform float uShockSpeed;
  uniform float uCrackSize;
  uniform float uCrackOpacity;
  uniform float uHeal;     // 0 = fresh cracks, 1 = fully healed
  uniform sampler2D uCracks;
  uniform vec2 uCardSize;
  uniform vec3 uCardPos;   // xy offset, z = height above ground
  uniform float uCardScaleX;
  uniform vec3 uWallet;    // xy position, z = visible (0/1)
  uniform vec2 uWalletSize;
  uniform vec3 uFogColor;
  uniform float uSpace;    // 0 = on the ground, 1 = out in space

  varying vec2 vPos;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 p = vPos;
    float t = uTime - uImpactTime;
    float hasImpact = step(0.0, t);
    float r = length(p);

    // Shockwave ring pushes the surface outward
    float waveR = t * uShockSpeed;
    float ring = exp(-pow((r - waveR) / 0.35, 2.0)) * exp(-t * 0.9) * hasImpact;
    vec2 dir = r > 0.0001 ? p / r : vec2(0.0);
    vec2 pd = p - dir * ring * 0.25;

    // Base surface with a subtle grain + vignette
    vec3 col = uColor;
    float n = noise(pd * 3.0) * 0.5 + noise(pd * 11.0) * 0.25 + noise(pd * 40.0) * 0.12;
    col *= 0.94 + n * 0.1;
    col *= 1.0 - 0.45 * smoothstep(3.0, 11.0, length(p * vec2(0.8, 1.0)));

    // Card shadow — softer and lighter the higher the card is
    float h = max(uCardPos.z, 0.0);
    vec2 sp = p - uCardPos.xy - vec2(0.12, -0.18) * h;
    vec2 halfSize = uCardSize * 0.5 * vec2(max(uCardScaleX, 0.02), 1.0);
    float blur = 0.08 + h * 0.35;
    float sd = sdRoundBox(sp, halfSize, 0.1);
    float shadow = (1.0 - smoothstep(-blur, blur, sd)) * 0.6 / (1.0 + h * 0.8);
    col *= 1.0 - shadow;

    // Wallet shadow
    float wsd = sdRoundBox(p - uWallet.xy - vec2(0.05, -0.08), uWalletSize * 0.5, 0.12);
    col *= 1.0 - (1.0 - smoothstep(-0.12, 0.12, wsd)) * 0.55 * uWallet.z;

    // Cracks — revealed just behind the shockwave front
    vec2 uv = pd / uCrackSize + 0.5;
    vec4 cracks = texture2D(uCracks, uv);
    float reveal = smoothstep(waveR * 0.85, waveR * 0.85 - 0.8, r) * hasImpact * uCrackOpacity;
    // Healing closes the cracks from their tips back toward the impact
    float healR = (1.0 - uHeal) * 9.0;
    reveal *= smoothstep(healR, healR - 1.2, r) * (1.0 - uHeal * 0.6);
    col = mix(col, cracks.rgb, cracks.a * reveal);

    // Crater darkening under the landing spot
    col *= 1.0 - 0.2 * exp(-r * r * 0.3) * uCrackOpacity * (1.0 - uHeal);

    // Shockwave light + impact flash
    col += ring * 0.12;
    col += exp(-t * 5.0) * exp(-r * r * 0.12) * 0.22 * hasImpact;

    // Distance fog + fade out when the camera is up in space
    float dist = distance(vWorld, cameraPosition);
    col = mix(col, uFogColor, smoothstep(20.0, 90.0, dist));
    col = mix(col, uFogColor, uSpace);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

// ---------------------------------------------------------------------------
// Debris — small chunks thrown up by the impact
// ---------------------------------------------------------------------------
const DEBRIS_COUNT = 280

const debrisVertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vAlpha = aAlpha;
    vColor = aColor;
  }
`

const debrisFragment = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.35, d));
    #include <colorspace_fragment>
  }
`

export class Ground {
  constructor({ z, color, crackCore, crackLip, cardSize }) {
    this.z = z
    this.crackColors = { core: crackCore, lip: crackLip }

    const empty = new THREE.DataTexture(new Uint8Array(4), 1, 1)
    empty.needsUpdate = true

    this.uniforms = {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uImpactTime: { value: -1000 },
      uShockSpeed: { value: 9 },
      uCrackSize: { value: 14 },
      uCrackOpacity: { value: 0 },
      uHeal: { value: 0 },
      uCracks: { value: empty },
      uCardSize: { value: new THREE.Vector2(cardSize.width, cardSize.height) },
      uCardPos: { value: new THREE.Vector3() },
      uCardScaleX: { value: 1 },
      uWallet: { value: new THREE.Vector3() },
      uWalletSize: { value: new THREE.Vector2(1, 1) },
      uFogColor: { value: new THREE.Color(color) },
      uSpace: { value: 0 },
    }

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.ShaderMaterial({
        vertexShader: groundVertex,
        fragmentShader: groundFragment,
        uniforms: this.uniforms,
        toneMapped: false,
      })
    )
    this.mesh.position.z = z

    // Crack textures are prepared one impact ahead (SVG decoding is async)
    this.nextCracks = null
    this.prepareCracks()

    // Debris
    const geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(DEBRIS_COUNT * 3)
    this.alphas = new Float32Array(DEBRIS_COUNT)
    const sizes = new Float32Array(DEBRIS_COUNT)
    const colors = new Float32Array(DEBRIS_COUNT * 3)
    const light = new THREE.Color(crackLip)
    const dark = new THREE.Color(crackCore)
    const tmp = new THREE.Color()
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      sizes[i] = rand(0.02, 0.08)
      tmp.lerpColors(dark, light, Math.random()).toArray(colors, i * 3)
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))

    this.debrisUniforms = { uScale: { value: 1 } }
    this.debris = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: debrisVertex,
        fragmentShader: debrisFragment,
        uniforms: this.debrisUniforms,
        transparent: true,
        depthWrite: false,
      })
    )
    this.debris.frustumCulled = false
    this.velocities = new Float32Array(DEBRIS_COUNT * 3)
    this.ages = new Float32Array(DEBRIS_COUNT).fill(Infinity)
    this.lives = new Float32Array(DEBRIS_COUNT).fill(1)
  }

  async prepareCracks() {
    const canvas = await renderCrackCanvas(this.crackColors)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.nextCracks = texture
  }

  addTo(scene) {
    scene.add(this.mesh, this.debris)
  }

  // Point size scale so debris sizes are in world units
  resize(heightPx, fovDeg) {
    this.debrisUniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2))
  }

  setCard(x, y, height, scaleX) {
    this.uniforms.uCardPos.value.set(x, y, height)
    this.uniforms.uCardScaleX.value = scaleX
  }

  setWallet(x, y, visible, width, height) {
    this.uniforms.uWallet.value.set(x, y, visible ? 1 : 0)
    this.uniforms.uWalletSize.value.set(width, height)
  }

  setSpace(amount, fogColor) {
    this.uniforms.uSpace.value = amount
    this.uniforms.uFogColor.value.copy(fogColor)
  }

  // 0 = cracks gone, 1 = fully visible
  setCrackOpacity(v) {
    this.uniforms.uCrackOpacity.value = v
  }

  // 0 = fresh cracks, 1 = fully healed
  setHeal(v) {
    this.uniforms.uHeal.value = v
  }

  impact(time) {
    if (this.nextCracks) {
      this.uniforms.uCracks.value.dispose()
      this.uniforms.uCracks.value = this.nextCracks
      this.nextCracks = null
      this.prepareCracks()
    }
    this.uniforms.uImpactTime.value = time
    this.uniforms.uCrackOpacity.value = 1
    this.uniforms.uHeal.value = 0

    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const a = rand(0, Math.PI * 2)
      const r0 = rand(1.2, 2.0)
      const speed = rand(1, 4.5)
      this.positions[i * 3] = Math.cos(a) * r0
      this.positions[i * 3 + 1] = Math.sin(a) * r0 * 0.65
      this.positions[i * 3 + 2] = this.z + 0.02
      this.velocities[i * 3] = Math.cos(a) * speed
      this.velocities[i * 3 + 1] = Math.sin(a) * speed
      this.velocities[i * 3 + 2] = rand(1.5, 5)
      this.ages[i] = 0
      this.lives[i] = rand(0.8, 1.8)
    }
  }

  update(time, delta) {
    this.uniforms.uTime.value = time

    const gravity = 14
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      if (this.ages[i] > this.lives[i]) {
        this.alphas[i] = 0
        continue
      }
      this.ages[i] += delta
      const ix = i * 3
      this.velocities[ix + 2] -= gravity * delta
      this.positions[ix] += this.velocities[ix] * delta
      this.positions[ix + 1] += this.velocities[ix + 1] * delta
      this.positions[ix + 2] += this.velocities[ix + 2] * delta
      if (this.positions[ix + 2] < this.z + 0.01) {
        this.positions[ix + 2] = this.z + 0.01
        this.velocities[ix + 2] *= -0.3
        this.velocities[ix] *= 0.6
        this.velocities[ix + 1] *= 0.6
      }
      this.alphas[i] = 1 - this.ages[i] / this.lives[i]
    }
    this.debris.geometry.attributes.position.needsUpdate = true
    this.debris.geometry.attributes.aAlpha.needsUpdate = true
  }
}
