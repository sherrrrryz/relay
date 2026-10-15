// ---------------------------------------------------------------------------
// Procedural impact cracks, built as an SVG and rasterised to a canvas.
//
// Structure of a real impact fracture:
//  - radial cracks: mostly straight, jagged at every scale (fractal), taper
//    from wide at the impact to hairline at the tip
//  - a few shallow-angle branches off each radial
//  - concentric "ring" cracks linking neighbouring radials, which split the
//    surface into plates; some plates sit slightly tilted (lighter/darker)
//  - fine hairline fractures along the main cracks
// Each crack is a filled tapered polygon, drawn three times: a blurred cast
// shadow, a lit lip offset toward the light, and the dark core on top.
// ---------------------------------------------------------------------------

export const CRACK_SVG_SIZE = 2048

const rand = (a, b) => a + Math.random() * (b - a)
const randInt = (a, b) => Math.floor(rand(a, b + 1))
const dir = (a) => [Math.cos(a), Math.sin(a)]
const f = (n) => n.toFixed(1)

// Midpoint displacement — jagged at all scales, straight overall
function fractalLine(a, b, roughness, depth) {
  let pts = [a, b]
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const [px, py] = pts[i]
      const [qx, qy] = pts[i + 1]
      const dx = qx - px
      const dy = qy - py
      const len = Math.hypot(dx, dy) || 1
      const off = (Math.random() - 0.5) * 2 * len * roughness
      next.push([(px + qx) / 2 - (dy / len) * off, (py + qy) / 2 + (dx / len) * off])
      next.push(pts[i + 1])
    }
    pts = next
  }
  return pts
}

// Closed polygon around a polyline, width given by widthAt(t), t ∈ [0, 1]
function taperedPath(pts, widthAt) {
  const left = []
  const right = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(i - 1, 0)]
    const b = pts[Math.min(i + 1, n - 1)]
    const tx = b[0] - a[0]
    const ty = b[1] - a[1]
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const w = widthAt(i / (n - 1)) / 2
    const wl = w * rand(0.6, 1.35)
    const wr = w * rand(0.6, 1.35)
    left.push(`${f(pts[i][0] + nx * wl)},${f(pts[i][1] + ny * wl)}`)
    right.push(`${f(pts[i][0] - nx * wr)},${f(pts[i][1] - ny * wr)}`)
  }
  return `M${left.join('L')}L${right.reverse().join('L')}Z`
}

const polyline = (pts) => `M${pts.map((p) => `${f(p[0])},${f(p[1])}`).join('L')}`

function pointNearRadius(pts, c, r) {
  let best = pts[0]
  let bestDiff = Infinity
  for (const p of pts) {
    const diff = Math.abs(Math.hypot(p[0] - c, p[1] - c) - r)
    if (diff < bestDiff) {
      bestDiff = diff
      best = p
    }
  }
  return best
}

export function buildCrackSVG({ core, lip }) {
  const S = CRACK_SVG_SIZE
  const c = S / 2
  const cracks = []
  const hairlines = []
  const plates = []
  const radials = []

  // Radial cracks
  const count = randInt(7, 10)
  const offset = rand(0, Math.PI * 2)
  for (let i = 0; i < count; i++) {
    const a = offset + ((i + rand(-0.3, 0.3)) / count) * Math.PI * 2
    const r0 = rand(40, 120)
    const L = rand(650, 1150)
    const endA = a + rand(-0.12, 0.12)
    const start = [c + dir(a)[0] * r0, c + dir(a)[1] * r0]
    const end = [c + dir(endA)[0] * (r0 + L), c + dir(endA)[1] * (r0 + L)]
    const pts = fractalLine(start, end, 0.14, 6)
    const w0 = rand(7, 12)
    const widthAt = (t) => w0 * Math.pow(1 - t, 0.9) + 0.5
    cracks.push(taperedPath(pts, widthAt))
    radials.push({ a, pts })

    // Branches at shallow angles
    for (let b = randInt(1, 3); b > 0; b--) {
      const t = rand(0.15, 0.65)
      const p = pts[Math.floor(t * (pts.length - 1))]
      const ba = a + (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.7)
      const bl = (1 - t) * L * rand(0.3, 0.6)
      const bpts = fractalLine(p, [p[0] + dir(ba)[0] * bl, p[1] + dir(ba)[1] * bl], 0.15, 5)
      const bw = widthAt(t) * 0.6
      cracks.push(taperedPath(bpts, (tt) => bw * (1 - tt) + 0.4))

      if (Math.random() < 0.4) {
        const st = rand(0.2, 0.6)
        const sp = bpts[Math.floor(st * (bpts.length - 1))]
        const sa = ba + (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.6)
        const sl = bl * (1 - st) * rand(0.4, 0.7)
        hairlines.push(polyline(fractalLine(sp, [sp[0] + dir(sa)[0] * sl, sp[1] + dir(sa)[1] * sl], 0.18, 4)))
      }
    }

    // Hairline fractures along the crack
    for (let k = randInt(4, 8); k > 0; k--) {
      const p = pts[randInt(2, pts.length - 3)]
      const ha = a + (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 1.3)
      const hl = rand(25, 110)
      hairlines.push(polyline(fractalLine(p, [p[0] + dir(ha)[0] * hl, p[1] + dir(ha)[1] * hl], 0.2, 4)))
    }
  }

  // Concentric ring cracks between neighbouring radials
  radials.sort((p, q) => p.a - q.a)
  const radii = [rand(310, 350), rand(440, 520), rand(620, 740)]
  const rings = radii.map(() => [])
  radii.forEach((R, k) => {
    const chance = [0.9, 0.65, 0.4][k]
    for (let i = 0; i < radials.length; i++) {
      if (Math.random() > chance) continue
      const A = radials[i]
      const B = radials[(i + 1) % radials.length]
      const pa = pointNearRadius(A.pts, c, R * rand(0.94, 1.06))
      const pb = pointNearRadius(B.pts, c, R * rand(0.94, 1.06))
      let midA = (A.a + B.a) / 2
      if (B.a < A.a) midA += Math.PI // wrap-around pair
      const Rm = R * rand(0.97, 1.05)
      const pm = [c + dir(midA)[0] * Rm, c + dir(midA)[1] * Rm]
      const pts = [...fractalLine(pa, pm, 0.13, 4), ...fractalLine(pm, pb, 0.13, 4).slice(1)]
      const w = rand(2.5, 5) * (k === 0 ? 1.2 : 0.8)
      cracks.push(taperedPath(pts, (t) => w * (0.3 + Math.sin(Math.PI * t) * 0.7)))
      rings[k][i] = pts
    }
  })

  // Tilted plates: cells bounded by two ring cracks
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < radials.length; i++) {
      const inner = rings[k][i]
      const outer = rings[k + 1][i]
      if (!inner || !outer) continue
      // Subtle: the ground is dark and blending happens in linear space
      const light = Math.random() < 0.4
      const opacity = light ? rand(0.008, 0.018) : rand(0.15, 0.35)
      const d = `${polyline(inner)}L${outer.slice().reverse().map((p) => `${f(p[0])},${f(p[1])}`).join('L')}Z`
      plates.push(`<path d="${d}" fill="${light ? '#fff' : '#000'}" opacity="${opacity.toFixed(3)}"/>`)
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="5"/></filter>
    <g id="cracks">${cracks.map((d) => `<path d="${d}"/>`).join('')}</g>
    <g id="hair">${hairlines.map((d) => `<path d="${d}"/>`).join('')}</g>
  </defs>
  <g>${plates.join('')}</g>
  <use xlink:href="#cracks" fill="#000" opacity="0.6" transform="translate(4 6)" filter="url(#shadow)"/>
  <use xlink:href="#cracks" fill="${lip}" opacity="0.55" transform="translate(-1.6 -1.6)"/>
  <use xlink:href="#cracks" fill="${core}"/>
  <use xlink:href="#hair" fill="none" stroke="${lip}" stroke-width="0.9" opacity="0.3" transform="translate(-1 -1)"/>
  <use xlink:href="#hair" fill="none" stroke="${core}" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
</svg>`
}

// Rasterise the SVG into a canvas (used as a texture)
export async function renderCrackCanvas(colors) {
  const svg = buildCrackSVG(colors)
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = CRACK_SVG_SIZE
  canvas.getContext('2d').drawImage(img, 0, 0)
  return canvas
}
