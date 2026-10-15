import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import GUI from 'lil-gui'
import { Ground } from './ground.js'
import { Stars, Supernova } from './space.js'
import { createWallet } from './wallet.js'

// Debug panel — press "h" to toggle
const gui = new GUI()
gui.hide()
window.addEventListener('keydown', (e) => {
  if (e.key === 'h') gui.show(gui._hidden)
})

const params = {
  background: '#24221f',
  space: '#03040a',
  crackCore: '#0a0908',
  crackLip: '#6e675c',
  edgeColor: '#f4f1e7',
  // timeline (seconds)
  ejectDuration: 1.2,
  shineDuration: 0.8,
  launchDuration: 2.6,
  novaDuration: 2.4,
  freezeDuration: 1.8,
  fallDuration: 1.3,
  landedHold: 0.5,
  walletDuration: 1.1,
  healDuration: 3.5,
  // motion
  spinTurns: 10,
  launchHeight: 60,
  shake: 0.12,
  parallax: 0.5,
  timeScale: 1, // slow motion for tuning
}

// Canvas & scene
const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()
scene.background = new THREE.Color(params.background)

// Sizes
const sizes = { width: window.innerWidth, height: window.innerHeight }

// Camera
const REST_CAMERA_Z = 7.5
const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 1000)
camera.position.set(0, 0, REST_CAMERA_Z)
scene.add(camera)

// Renderer + bloom
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.toneMapping = THREE.NeutralToneMapping

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
// Drop NaN/Inf pixels and cap extreme HDR values — otherwise a single bad
// pixel (grazing-angle lighting, stacked additive particles) gets smeared
// across the whole screen by the bloom blur
composer.addPass(
  new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
        gl_FragColor = vec4(min(c.rgb, vec3(64.0)), c.a);
      }
    `,
  })
)
const bloomPass = new UnrealBloomPass(new THREE.Vector2(sizes.width, sizes.height), 0.7, 0.5, 1)
composer.addPass(bloomPass)
composer.addPass(new OutputPass())

// Soft studio reflections
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.35

const dirLight = new THREE.DirectionalLight(0xffffff, 1.6)
dirLight.position.set(2, 3, 5)
scene.add(dirLight)

// ---------------------------------------------------------------------------
// Card
// Real card ratio (ISO/IEC 7810 ID-1): 85.60 × 53.98 mm
// ---------------------------------------------------------------------------
const CARD = {
  width: 3.4,
  height: 3.4 / (85.6 / 53.98),
  thickness: 0.03,
  radius: 0.1,
}

function roundedRectShape(w, h, r) {
  const x = -w / 2
  const y = -h / 2
  const shape = new THREE.Shape()
  shape.moveTo(x + r, y)
  shape.lineTo(x + w - r, y)
  shape.quadraticCurveTo(x + w, y, x + w, y + r)
  shape.lineTo(x + w, y + h - r)
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  shape.lineTo(x + r, y + h)
  shape.quadraticCurveTo(x, y + h, x, y + h - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  return shape
}

const shape = roundedRectShape(CARD.width, CARD.height, CARD.radius)

// Face geometry with UVs mapped 0–1 across the card
const faceGeometry = new THREE.ShapeGeometry(shape, 12)
const pos = faceGeometry.attributes.position
const uv = faceGeometry.attributes.uv
for (let i = 0; i < pos.count; i++) {
  uv.setXY(i, pos.getX(i) / CARD.width + 0.5, pos.getY(i) / CARD.height + 0.5)
}

// Edge (sides only — caps are hidden, the textured faces sit on top)
const edgeGeometry = new THREE.ExtrudeGeometry(shape, {
  depth: CARD.thickness,
  bevelEnabled: false,
  curveSegments: 12,
})
edgeGeometry.translate(0, 0, -CARD.thickness / 2)

const textureLoader = new THREE.TextureLoader()
function loadTexture(path) {
  const texture = textureLoader.load(path)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  return texture
}

const faceMaterialOptions = {
  roughness: 0.6,
  metalness: 0,
  clearcoat: 0.15,
  clearcoatRoughness: 0.5,
  emissive: 0xffffff,
  emissiveIntensity: 0,
}
const frontMaterial = new THREE.MeshPhysicalMaterial({
  ...faceMaterialOptions,
  map: loadTexture('/textures/card-front.png'),
})
const backMaterial = new THREE.MeshPhysicalMaterial({
  ...faceMaterialOptions,
  map: loadTexture('/textures/card-back.png'),
})
const edgeMaterial = new THREE.MeshStandardMaterial({ color: params.edgeColor, roughness: 0.5 })

const card = new THREE.Group()

const front = new THREE.Mesh(faceGeometry, frontMaterial)
front.position.z = CARD.thickness / 2 + 0.0005
card.add(front)

const back = new THREE.Mesh(faceGeometry, backMaterial)
back.rotation.y = Math.PI
back.position.z = -CARD.thickness / 2 - 0.0005
card.add(back)

const edge = new THREE.Mesh(edgeGeometry, [new THREE.MeshBasicMaterial({ visible: false }), edgeMaterial])
card.add(edge)

const faceVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Frost — the frozen artwork grows in from the edges with a bright freezing front
const frostMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uMap: { value: loadTexture('/textures/card-frozen.webp') },
    uFrost: { value: 0 },
  },
  vertexShader: faceVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D uMap;
    uniform float uFrost;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) { v += noise(p) * a; p *= 2.1; a *= 0.5; }
      return v;
    }

    void main() {
      vec4 tex = texture2D(uMap, vUv);
      float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y) * 1.4);
      float field = edge * 1.8 + fbm(vUv * vec2(9.0, 6.0)) * 0.55;
      float thr = uFrost * 1.5;
      float mask = smoothstep(thr, thr - 0.06, field);
      float front = smoothstep(0.05, 0.0, abs(field - thr)) * step(0.001, uFrost) * step(uFrost, 0.999);
      gl_FragColor = vec4(tex.rgb + front * vec3(0.8, 1.2, 1.6), max(mask, front) * tex.a);
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthWrite: false,
})
const frost = new THREE.Mesh(faceGeometry, frostMaterial)
frost.position.z = CARD.thickness / 2 + 0.0015
card.add(frost)

// Shine — a diagonal light band that sweeps across the front
const shineMaterial = new THREE.ShaderMaterial({
  uniforms: { uProgress: { value: 0 } },
  vertexShader: faceVertex,
  fragmentShader: /* glsl */ `
    uniform float uProgress;
    varying vec2 vUv;
    void main() {
      float d = vUv.x + vUv.y * 0.5;
      float center = mix(-0.4, 1.9, uProgress);
      float band = smoothstep(0.2, 0.0, abs(d - center));
      float core = smoothstep(0.035, 0.0, abs(d - center));
      gl_FragColor = vec4(vec3(1.0), band * 0.4 + core * 0.55);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
})
const shine = new THREE.Mesh(faceGeometry, shineMaterial)
shine.position.z = CARD.thickness / 2 + 0.002
shine.visible = false
card.add(shine)

// Pivot carries position; the card itself carries spin + tremble
const cardPivot = new THREE.Group()
cardPivot.add(card)
scene.add(cardPivot)

// ---------------------------------------------------------------------------
// Ground, wallet, space
// ---------------------------------------------------------------------------
const GROUND_Z = -1.2
const LAND_Z = GROUND_Z + CARD.thickness / 2 + 0.01
const HOVER_Z = 0

const ground = new Ground({
  z: GROUND_Z,
  color: params.background,
  crackCore: params.crackCore,
  crackLip: params.crackLip,
  cardSize: CARD,
})
ground.addTo(scene)

const wallet = createWallet(loadTexture('/textures/wallet.webp'), CARD.width * 1.12)
wallet.group.position.z = GROUND_Z + 0.004
scene.add(wallet.group)
const WALLET_OUT_Y = -9

const stars = new Stars()
scene.add(stars.points)

const supernova = new Supernova()
scene.add(supernova.group)

function resizeEffects() {
  const h = renderer.domElement.height
  ground.resize(h, camera.fov)
  supernova.resize(h, camera.fov)
}
resizeEffects()

// ---------------------------------------------------------------------------
// Sequence
//  idle (card in wallet) → eject → shine → launch into space (fast spin,
//  camera pulls back) → supernova (camera catches up) → freeze → fall →
//  impact (shockwave + cracks) → wallet slides in → idle while cracks heal
//  and the card thaws
// ---------------------------------------------------------------------------
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
const easeInCubic = (t) => t * t * t
const clamp01 = (t) => Math.min(Math.max(t, 0), 1)
const lerp = THREE.MathUtils.lerp

const WINDUP = -0.3 // small anticipation twist during the shine
const NOVA_DRIFT = 4 // card keeps coasting up a little during the supernova

const anim = { phase: 'idle', start: 0, impactTime: -Infinity, healStart: -Infinity, novaStart: 0 }
let now = 0

function play() {
  if (anim.phase !== 'idle') return
  anim.phase = 'eject'
  anim.start = now
}

function next(phase) {
  anim.phase = phase
  anim.start = now
}

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const clickable = [front, back, ...wallet.meshes]
window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / sizes.width) * 2 - 1
  pointer.y = -(e.clientY / sizes.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  canvas.style.cursor = anim.phase === 'idle' && raycaster.intersectObjects(clickable).length ? 'pointer' : ''
})
canvas.addEventListener('click', () => {
  raycaster.setFromCamera(pointer, camera)
  if (raycaster.intersectObjects(clickable).length) play()
})

// Debug controls
gui.add({ play }, 'play')
const timing = gui.addFolder('Timing')
for (const key of ['ejectDuration', 'shineDuration', 'launchDuration', 'novaDuration', 'freezeDuration', 'fallDuration', 'walletDuration', 'healDuration']) {
  timing.add(params, key, 0.1, 8, 0.1)
}
gui.add(params, 'spinTurns', 1, 20, 1)
gui.add(params, 'launchHeight', 10, 150, 1)
gui.add(params, 'shake', 0, 0.5, 0.01)
gui.add(params, 'parallax', 0, 2, 0.01)
gui.add(params, 'timeScale', 0.05, 2, 0.01)
gui.add(bloomPass, 'strength', 0, 3, 0.01).name('bloom')
gui.add(ground.uniforms.uShockSpeed, 'value', 1, 20, 0.1).name('shockSpeed')

if (import.meta.env.DEV) window.debug = { params, play, anim, camera, cardPivot, ground, supernova, stars, bloomPass }

window.addEventListener('resize', () => {
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight
  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()
  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  composer.setSize(sizes.width, sizes.height)
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  resizeEffects()
})

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
const timer = new THREE.Timer()

const UP_Y = new THREE.Vector3(0, 1, 0)
const UP_Z = new THREE.Vector3(0, 0, 1)
const camTarget = new THREE.Vector3(0, 0, LAND_Z)
const desiredPos = new THREE.Vector3()
const desiredTarget = new THREE.Vector3()
const desiredUp = new THREE.Vector3()
const camBase = camera.position.clone()
const spaceColor = new THREE.Color(params.space)
const groundColor = new THREE.Color(params.background)
const fogColor = new THREE.Color()
const tmp = new THREE.Vector3()

function damp3(v, target, lambda, delta) {
  v.x = THREE.MathUtils.damp(v.x, target.x, lambda, delta)
  v.y = THREE.MathUtils.damp(v.y, target.y, lambda, delta)
  v.z = THREE.MathUtils.damp(v.z, target.z, lambda, delta)
}

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp)
  const delta = Math.min(timer.getDelta(), 1 / 20) * params.timeScale
  now += delta
  const t = now - anim.start

  let z = LAND_Z
  let spin = 0
  let glow = 0
  let tremble = 0
  let walletY = 0
  let frostAmount = frostMaterial.uniforms.uFrost.value
  let novaFreeze = 0
  let novaOpacity = 1
  let camLambda = 3

  // Rest framing: top-down over the wallet, with a little pointer parallax
  desiredPos.set(pointer.x * params.parallax, pointer.y * params.parallax, REST_CAMERA_Z)
  desiredUp.copy(UP_Y)

  const spinTotal = params.launchDuration + params.novaDuration
  const spinAt = (elapsed) => lerp(WINDUP, params.spinTurns * Math.PI * 2, easeInOutCubic(clamp01(elapsed / spinTotal)))
  const novaTop = params.launchHeight + NOVA_DRIFT

  switch (anim.phase) {
    case 'eject': {
      // Wallet slides away, then the card lifts off the ground
      const p = clamp01(t / params.ejectDuration)
      walletY = lerp(0, WALLET_OUT_Y, easeInCubic(clamp01(p / 0.55)))
      z = lerp(LAND_Z, HOVER_Z, easeInOutCubic(clamp01((p - 0.5) / 0.5)))
      if (p >= 1) next('shine')
      break
    }
    case 'shine': {
      const p = clamp01(t / params.shineDuration)
      walletY = WALLET_OUT_Y
      z = HOVER_Z
      shine.visible = true
      shineMaterial.uniforms.uProgress.value = p
      spin = WINDUP * easeOutCubic(p)
      glow = Math.sin(p * Math.PI) * 0.25
      if (p >= 1) {
        shine.visible = false
        next('launch')
      }
      break
    }
    case 'launch': {
      // Rockets up spinning; the camera pulls back and tilts to watch it go
      const p = clamp01(t / params.launchDuration)
      walletY = WALLET_OUT_Y
      z = lerp(HOVER_Z, params.launchHeight, easeInCubic(p))
      spin = spinAt(t)
      glow = p * p * 0.6
      const k = easeInOutCubic(p)
      desiredPos.set(-16 * k, 0, lerp(REST_CAMERA_Z, z * 0.45 + 2, k))
      desiredUp.lerpVectors(UP_Y, UP_Z, k).normalize()
      camLambda = 2.5
      if (p >= 1) {
        next('nova')
        const novaPos = new THREE.Vector3(0, 0, z)
        supernova.trigger(novaPos, camera.position.clone().sub(novaPos))
        anim.novaStart = now
        anim.healStart = Infinity
      }
      break
    }
    case 'nova': {
      // Supernova; the camera catches up and rises above the card
      const p = clamp01(t / params.novaDuration)
      walletY = WALLET_OUT_Y
      z = params.launchHeight + NOVA_DRIFT * easeOutCubic(p)
      spin = spinAt(params.launchDuration + t)
      glow = 2.5 * Math.exp(-t * 2.5) + 0.3 * (1 - p)
      desiredPos.set(lerp(-14, -5, easeInOutCubic(p)), 0, z + lerp(2, 8, easeInOutCubic(p)))
      desiredUp.lerpVectors(UP_Z, UP_Y, easeInOutCubic(p)).normalize()
      camLambda = 2.2
      if (p >= 1) next('freeze')
      break
    }
    case 'freeze': {
      // Frost spreads across the card, the debris freezes in place; tension builds
      const p = clamp01(t / params.freezeDuration)
      walletY = WALLET_OUT_Y
      z = novaTop
      frostAmount = easeInOutCubic(clamp01(p / 0.8))
      novaFreeze = easeOutCubic(clamp01(p / 0.6))
      tremble = clamp01((p - 0.55) / 0.45) ** 2
      desiredPos.set(-5, 0, z + 8)
      if (p >= 1) next('fall')
      break
    }
    case 'fall': {
      // Drops back to the ground; the camera follows it down
      const p = clamp01(t / params.fallDuration)
      walletY = WALLET_OUT_Y
      frostAmount = 1
      novaFreeze = 1
      novaOpacity = 1 - p
      z = lerp(novaTop, LAND_Z, easeInCubic(p))
      desiredPos.set(-5 * (1 - easeInOutCubic(p)), 0, z + REST_CAMERA_Z - LAND_Z + 2 * (1 - p))
      camLambda = 5
      if (p >= 1) {
        next('landed')
        supernova.hide()
        anim.impactTime = now
        ground.impact(now)
      }
      break
    }
    case 'landed': {
      walletY = WALLET_OUT_Y
      frostAmount = 1
      z = LAND_Z + 0.1 * Math.abs(Math.sin(t * 10)) * Math.exp(-t * 6) // small bounce
      if (t > params.landedHold) {
        next('wallet')
        anim.healStart = now
      }
      break
    }
    case 'wallet': {
      // Wallet slides up from below and the card slips into the pocket
      const p = clamp01(t / params.walletDuration)
      walletY = lerp(WALLET_OUT_Y, 0, easeOutCubic(p))
      if (p >= 1) next('idle')
      break
    }
  }

  // Cracks heal and the card thaws once it is back in the wallet
  const heal = easeInOutCubic(clamp01((now - anim.healStart) / params.healDuration))
  ground.setHeal(heal)
  if (anim.phase === 'wallet' || anim.phase === 'idle') frostAmount = Math.min(frostAmount, 1 - heal)

  // Card
  cardPivot.position.set((Math.random() - 0.5) * 0.04 * tremble, 0, z)
  card.rotation.y = spin
  card.rotation.z = (Math.random() - 0.5) * 0.04 * tremble
  frontMaterial.emissiveIntensity = backMaterial.emissiveIntensity = glow
  frostMaterial.uniforms.uFrost.value = frostAmount
  backMaterial.color.setRGB(1, 1, 1).lerp(tmp.set(0.78, 0.9, 1), frostAmount)

  // Wallet
  wallet.group.position.y = walletY
  wallet.group.visible = walletY > WALLET_OUT_Y + 0.01
  ground.setWallet(0, walletY, wallet.group.visible, wallet.width, wallet.height)

  // Supernova
  supernova.update(now - anim.novaStart, delta, novaFreeze, novaOpacity)

  // Camera follows the card
  desiredTarget.set(0, 0, z)
  damp3(camBase, desiredPos, camLambda, delta)
  damp3(camTarget, desiredTarget, 25, delta) // keep the card locked in frame
  damp3(camera.up, desiredUp, camLambda, delta)
  camera.up.normalize()
  camera.position.copy(camBase)

  // Camera shake on impact
  const shake = params.shake * Math.exp(-(now - anim.impactTime) * 5)
  camera.position.x += (Math.random() - 0.5) * shake
  camera.position.y += (Math.random() - 0.5) * shake
  camera.lookAt(camTarget)

  // Space: fade the ground out and the stars in as the camera climbs
  const space = THREE.MathUtils.smoothstep(camera.position.z, 10, 35)
  fogColor.copy(groundColor).lerp(spaceColor, space)
  scene.background.copy(fogColor)
  ground.setSpace(space, fogColor)
  stars.setOpacity(space)
  stars.points.position.copy(camera.position)

  // Shadow follows the card; its footprint narrows as the card spins edge-on
  ground.setCard(cardPivot.position.x, cardPivot.position.y, z - LAND_Z, Math.abs(Math.cos(spin)))
  ground.update(now, delta)

  composer.render()
})
