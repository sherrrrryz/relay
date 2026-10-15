import * as THREE from 'three'

const rand = (a, b) => a + Math.random() * (b - a)
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

function radialTexture(stops) {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [offset, color] of stops) g.addColorStop(offset, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// ---------------------------------------------------------------------------
// Starfield — fades in as the camera climbs
// ---------------------------------------------------------------------------
export class Stars {
  constructor(count = 4000) {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const tint = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(rand(250, 380))
      v.toArray(positions, i * 3)
      tint.setHSL(rand(0.55, 0.65), rand(0, 0.5), rand(0.6, 1)).toArray(colors, i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.material = new THREE.PointsMaterial({
      size: 1.1,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    this.points = new THREE.Points(geometry, this.material)
    this.points.frustumCulled = false
  }

  setOpacity(v) {
    this.material.opacity = v
    this.points.visible = v > 0.001
  }
}

// ---------------------------------------------------------------------------
// Supernova — white-hot core, expanding shock rings, a burst of particles
// (sphere + equatorial ring) that freeze into ice crystals.
// ---------------------------------------------------------------------------
const PARTICLES = 3500

const particleVertex = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uScale;
  uniform float uIntensity;
  uniform float uFreeze;
  uniform vec3 uIce;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * mix(1.0, 0.35, uFreeze) * uScale / -mv.z;
    vColor = mix(aColor * uIntensity, uIce, uFreeze);
  }
`

const particleFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d) * uOpacity;
    gl_FragColor = vec4(vColor * a, a);
  }
`

export class Supernova {
  constructor() {
    this.group = new THREE.Group()
    this.group.visible = false

    // Particles
    const geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(PARTICLES * 3)
    this.velocities = new Float32Array(PARTICLES * 3)
    const colors = new Float32Array(PARTICLES * 3)
    const sizes = new Float32Array(PARTICLES)
    const palette = ['#fff4e0', '#ffffff', '#9fd8ff', '#5aa9ff', '#ff8a3d', '#ff5fa2'].map((c) => new THREE.Color(c))
    const weights = [0.25, 0.15, 0.25, 0.15, 0.12, 0.08]
    for (let i = 0; i < PARTICLES; i++) {
      let r = Math.random()
      let k = 0
      while (r > weights[k] && k < weights.length - 1) r -= weights[k++]
      palette[k].toArray(colors, i * 3)
      sizes[i] = rand(0.06, 0.3)
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

    this.particleUniforms = {
      uScale: { value: 1 },
      uIntensity: { value: 1 },
      uFreeze: { value: 0 },
      uIce: { value: new THREE.Color('#cdeeff').multiplyScalar(0.8) },
      uOpacity: { value: 1 },
    }
    this.particles = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        uniforms: this.particleUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
    this.particles.frustumCulled = false
    this.group.add(this.particles)

    // Core glow
    this.core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: radialTexture([
          [0, 'rgba(255,255,255,1)'],
          [0.15, 'rgba(255,240,220,0.9)'],
          [0.4, 'rgba(140,190,255,0.35)'],
          [1, 'rgba(60,80,255,0)'],
        ]),
        color: new THREE.Color(1, 0.95, 0.9).multiplyScalar(6),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      })
    )
    this.group.add(this.core)

    // Shock rings
    const ringTexture = radialTexture([
      [0, 'rgba(255,255,255,0)'],
      [0.78, 'rgba(255,255,255,0)'],
      [0.9, 'rgba(255,255,255,1)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    this.rings = [
      { color: new THREE.Color(1, 0.85, 0.7).multiplyScalar(4), delay: 0, speed: 48 },
      { color: new THREE.Color(0.5, 0.75, 1).multiplyScalar(3), delay: 0.12, speed: 30 },
    ].map((r) => {
      r.sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: ringTexture,
          color: r.color,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        })
      )
      this.group.add(r.sprite)
      return r
    })

    this.light = new THREE.PointLight(0xfff0e0, 0, 80, 1.2)
    this.group.add(this.light)
  }

  resize(heightPx, fovDeg) {
    this.particleUniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2))
  }

  // `facing` = direction from the explosion to the camera; the debris ring
  // is laid out perpendicular to it so it reads as a ring on screen
  trigger(position, facing) {
    this.group.position.copy(position)
    this.group.visible = true

    const n = facing.clone().normalize()
    const u = new THREE.Vector3().crossVectors(n, Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize()
    const w = new THREE.Vector3().crossVectors(n, u)
    const d = new THREE.Vector3()

    for (let i = 0; i < PARTICLES; i++) {
      let speed
      if (i < PARTICLES * 0.3) {
        // Equatorial ring
        const a = rand(0, Math.PI * 2)
        d.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).addScaledVector(n, rand(-0.06, 0.06))
        speed = rand(14, 20)
      } else {
        d.randomDirection()
        speed = 3 + Math.pow(Math.random(), 1.6) * 22
      }
      d.toArray(this.positions, i * 3)
      this.positions[i * 3] *= 0.2
      this.positions[i * 3 + 1] *= 0.2
      this.positions[i * 3 + 2] *= 0.2
      this.velocities[i * 3] = d.x * speed
      this.velocities[i * 3 + 1] = d.y * speed
      this.velocities[i * 3 + 2] = d.z * speed
    }
    this.particles.geometry.attributes.position.needsUpdate = true
  }

  hide() {
    this.group.visible = false
  }

  // t = seconds since trigger, freeze/opacity in 0–1
  update(t, delta, freeze, opacity) {
    if (!this.group.visible) return

    const coreGrow = easeOutExpo(Math.min(t / 0.4, 1))
    this.core.scale.setScalar(0.5 + coreGrow * 3.5)
    this.core.material.opacity = Math.exp(-t * 3) * opacity

    for (const r of this.rings) {
      const rt = Math.max(t - r.delay, 0)
      r.sprite.scale.setScalar(0.1 + rt * r.speed)
      r.sprite.material.opacity = (rt > 0 ? Math.exp(-rt * 2) : 0) * opacity
    }

    this.light.intensity = 600 * Math.exp(-t * 3) * opacity

    const drag = 1.1 + freeze * 10
    const damping = Math.exp(-drag * delta)
    for (let i = 0; i < PARTICLES * 3; i++) {
      this.velocities[i] *= damping
      this.positions[i] += this.velocities[i] * delta
    }
    this.particles.geometry.attributes.position.needsUpdate = true
    this.particleUniforms.uIntensity.value = 1 + 3 * Math.exp(-t * 2.5)
    this.particleUniforms.uFreeze.value = freeze
    this.particleUniforms.uOpacity.value = opacity
  }
}
