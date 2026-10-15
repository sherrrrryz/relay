import * as THREE from 'three'

// Leather card holder. The image is split into a back panel (full image) and
// a front pocket panel (everything below the slot line) so the card can sit
// between them, with its top peeking out above the slot.
const IMAGE_ASPECT = 1520 / 1032
const SLOT_FROM_TOP = 193 / 1032 // slot line in wallet.webp

export function createWallet(texture, width) {
  const height = width / IMAGE_ASPECT
  const group = new THREE.Group()

  const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness: 0.75 })

  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
  group.add(back)

  // Front pocket: lower part of the image only
  const pocketV = 1 - SLOT_FROM_TOP
  const frontGeometry = new THREE.PlaneGeometry(width, height * pocketV)
  frontGeometry.translate(0, -height / 2 + (height * pocketV) / 2, 0)
  const uv = frontGeometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * pocketV)
  const front = new THREE.Mesh(frontGeometry, material)
  front.position.z = 0.046
  group.add(front)

  return {
    group,
    meshes: [back, front],
    width,
    height,
    slotY: height / 2 - height * SLOT_FROM_TOP,
  }
}
