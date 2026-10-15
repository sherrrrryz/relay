// Card drop (three.js)
//   the card floats above the wallet; tap the wallet → it tumbles once in open air, arrives flat
//   above the pocket opening and slides straight down between the wallet's back and its front pocket.
//   Tap again → it lifts out and drifts back up.
//
// Usage (the page needs an import map for "three"):
//   import { mountCardDrop } from "./demos/card-drop.js";
//   const demo = await mountCardDrop(stageElement, { assetBase: "../assets", hint, status });
//   demo.setActive(false) pauses rendering while the panel is hidden; demo.toggle() drops/lifts the card.
import * as THREE from "three";

export async function mountCardDrop(container, opts = {}) {
  const assetBase = (opts.assetBase ?? "assets").replace(/\/$/, "");
  const hint = opts.hint ?? null;
  const status = opts.status ?? null;
  const COPY = {
    out: { status: "Card is out", hint: "Tap the wallet to drop the card in" },
    in: { status: "Card is in", hint: "Tap again to take the card out" },
    dropping: { status: "Dropping…" },
    rising: { status: "Taking it out…" },
  };
  const say = (mode) => {
    if (status && COPY[mode].status) status.textContent = COPY[mode].status;
    if (hint && COPY[mode].hint) hint.textContent = COPY[mode].hint;
  };

  // ---------- scene setup ----------
  const canvas = document.createElement("canvas");
  canvas.className = "card-drop__canvas";
  canvas.setAttribute("aria-label", "A Relay business debit card and a black leather wallet. Tap the wallet to drop the card in.");
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  // tight near/far keeps depth precision high (no z-fighting between the card's layers)
  const camera = new THREE.PerspectiveCamera(28, 1, 5, 120);
  const LOOK_AT = new THREE.Vector3(0, 3.4, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 0.75);
  key.position.set(-6, 10, 14);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff4d6, 0.35);
  rim.position.set(8, -4, -10);
  scene.add(rim);

  // ---------- units ----------
  // 1 world unit = 40 SVG user units of the wallet drawing (420 x 299 viewBox).
  const U = 40;
  const WALLET = { w: 420, h: 299, cx: 210, cy: 145 }; // cx/cy: centre of the wallet body
  const svgToWorld = (x, y) => ({ x: (x - WALLET.cx) / U, y: (WALLET.cy - y) / U });
  const RASTER = 4; // raster the SVG at 4x for crisp textures

  // Card: 340 x 214 in SVG units (a real card's 1.586 ratio), narrower than the 367-wide pocket.
  const CARD_SVG = { w: 340, h: 214 };
  const CARD = { w: CARD_SVG.w / U, h: CARD_SVG.h / U };

  const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  function makeTexture(cnv) {
    const t = new THREE.CanvasTexture(cnv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  // Crop a card render down to its body (both renders share a 1079x680 body, different margins).
  function cropCard(img, x, y, w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, x, y, w, h, 0, 0, w, h);
    return c;
  }

  // Split the wallet SVG into two rasters: everything behind the card, and the front pocket
  // (the last top-level group, the one with the curved opening) that sits in front of it.
  async function walletLayers(svgText) {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const root = doc.documentElement;
    const groups = Array.from(root.children).filter((el) => el.tagName === "g");
    if (groups.length < 2) throw new Error("wallet.svg: expected several top-level groups");

    const serialize = (keep) => {
      const clone = root.cloneNode(true);
      const cg = Array.from(clone.children).filter((el) => el.tagName === "g");
      cg.forEach((g, i) => { if (!keep(i, cg.length)) g.remove(); });
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    };
    const backSrc = serialize((i, n) => i !== n - 1);
    const frontSrc = serialize((i, n) => i === n - 1);

    const raster = async (src) => {
      const img = await loadImage(src);
      const c = document.createElement("canvas");
      c.width = WALLET.w * RASTER; c.height = WALLET.h * RASTER;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c;
    };
    const [back, front] = await Promise.all([raster(backSrc), raster(frontSrc)]);
    return { back, front };
  }

  function shadowCanvas() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.55, "rgba(0,0,0,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return c;
  }

  // ---------- build ----------
  const [svgText, frontImg, backImg] = await Promise.all([
    fetch(`${assetBase}/wallet.svg`).then((r) => r.text()),
    loadImage(`${assetBase}/card-front.png`),
    loadImage(`${assetBase}/card-back.png`),
  ]);
  const layers = await walletLayers(svgText);

  const walletGroup = new THREE.Group();
  const wGeo = new THREE.PlaneGeometry(WALLET.w / U, WALLET.h / U);
  const walletBack = new THREE.Mesh(wGeo, new THREE.MeshBasicMaterial({ map: makeTexture(layers.back), transparent: true }));
  const walletFront = new THREE.Mesh(wGeo, new THREE.MeshBasicMaterial({ map: makeTexture(layers.front), transparent: true, depthWrite: false }));
  // the planes are centred on the viewBox; shift so the wallet body centre sits at the origin
  const planeOffset = svgToWorld(WALLET.w / 2, WALLET.h / 2);
  walletBack.position.set(planeOffset.x, planeOffset.y, 0);
  walletFront.position.set(planeOffset.x, planeOffset.y, 0.3);
  walletBack.renderOrder = 0;
  walletFront.renderOrder = 3;
  walletGroup.add(walletBack, walletFront);
  scene.add(walletGroup);

  const cardGroup = new THREE.Group();
  const cGeo = new THREE.PlaneGeometry(CARD.w, CARD.h);
  const cardMat = (cnv) => new THREE.MeshStandardMaterial({ map: makeTexture(cnv), transparent: true, roughness: 0.85, metalness: 0.0, side: THREE.FrontSide });
  const cardFront = new THREE.Mesh(cGeo, cardMat(cropCard(frontImg, 9, 6, 1080, 681)));
  const cardBack = new THREE.Mesh(cGeo, cardMat(cropCard(backImg, 60, 18, 1080, 681)));
  cardBack.rotation.y = Math.PI;
  cardFront.position.z = 0.03;
  cardBack.position.z = -0.03;
  // a thin dark edge so the flip reads as a solid object
  const edge = new THREE.Mesh(new THREE.BoxGeometry(CARD.w - 0.06, CARD.h - 0.06, 0.03), new THREE.MeshStandardMaterial({ color: 0x9fae72, roughness: 0.9 }));
  // renderOrder lives on the meshes, not the group: a Group's renderOrder becomes its children's
  // groupOrder, which three.js compares before mesh renderOrder and would put the card over the pocket.
  edge.renderOrder = cardFront.renderOrder = cardBack.renderOrder = 2;
  cardGroup.add(edge, cardFront, cardBack);
  scene.add(cardGroup);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(CARD.w * 1.25, CARD.h * 1.25), new THREE.MeshBasicMaterial({ map: makeTexture(shadowCanvas()), transparent: true, depthWrite: false }));
  shadow.position.z = 0.02;
  shadow.renderOrder = 1;
  scene.add(shadow);

  // ---------- poses ----------
  // Resting pose: card bottom edge at SVG y=250, inside the pocket (pocket floor is at 259.6).
  const restY = svgToWorld(0, 250 - CARD_SVG.h / 2).y;
  // Entry pose: card bottom edge just above the highest point of the pocket opening (seam starts at y≈94.8).
  const enterY = svgToWorld(0, 92 - CARD_SVG.h / 2).y;
  const IN = { x: 0, y: restY, z: 0.15, rx: 0, ry: 0, rz: 0 };
  const ENTER = { x: 0, y: enterY, z: 0.15, rx: 0, ry: 0, rz: 0 };
  // Floating pose: well above the wallet so the whole tumble happens in open air.
  const OUT = { x: 0, y: 10.2, z: 1.4, rx: -0.3, ry: 0, rz: 0.02 };

  const state = { mode: "out", t: 0, dur: 1, clock: new THREE.Clock(false), walletBump: 0, pointer: new THREE.Vector2(0, 0), target: new THREE.Vector2(0, 0) };

  const easeInQuad = (t) => t * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOutBack = (t) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function setCard(p) {
    cardGroup.position.set(p.x, p.y, p.z);
    cardGroup.rotation.set(p.rx, p.ry, p.rz);
  }

  // Phase 1 (0 → SPLIT): fall through open air with one full tumble, arriving flat and aligned
  // with the pocket just above the opening. Phase 2 (SPLIT → 1): slide straight down into the pocket.
  const SPLIT = 0.56;
  function dropPose(t) {
    const p = { ...OUT };
    if (t < SPLIT) {
      const u = t / SPLIT;
      const k = easeInQuad(u);
      const align = easeInOutCubic(clamp01((u - 0.25) / 0.75)); // tilt/depth settle by the end of the fall
      p.y = lerp(OUT.y, ENTER.y, k);
      p.z = lerp(OUT.z, ENTER.z, align);
      p.rx = lerp(OUT.rx, 0, align);
      p.rz = lerp(OUT.rz, 0, align);
      p.ry = easeInOutCubic(u) * Math.PI * 2; // the flip completes exactly as the card reaches the opening
    } else {
      const u = (t - SPLIT) / (1 - SPLIT);
      const k = easeOutCubic(u);
      p.y = lerp(ENTER.y, IN.y, k) - Math.sin(u * Math.PI) * 0.06; // tiny overshoot as it hits the floor
      p.z = IN.z; p.rx = 0; p.rz = 0; p.ry = 0;
    }
    return p;
  }

  // Reverse: lift straight out of the pocket, then drift up and tilt back into the floating pose.
  const LIFT = 0.4;
  function risePose(t) {
    const p = { ...IN };
    if (t < LIFT) {
      const u = t / LIFT;
      p.y = lerp(IN.y, ENTER.y, easeInOutCubic(u));
      p.z = IN.z;
    } else {
      const u = (t - LIFT) / (1 - LIFT);
      const k = easeOutBack(u);
      p.y = lerp(ENTER.y, OUT.y, k);
      p.z = lerp(ENTER.z, OUT.z, easeOutCubic(u));
      p.rx = lerp(0, OUT.rx, easeOutCubic(u));
      p.ry = Math.sin(u * Math.PI) * 0.3;
      p.rz = lerp(0, OUT.rz, k);
    }
    return p;
  }

  function floatPose(time) {
    return {
      x: OUT.x,
      y: OUT.y + Math.sin(time * 1.3) * 0.18,
      z: OUT.z,
      rx: OUT.rx + Math.sin(time * 1.1) * 0.04,
      ry: Math.sin(time * 0.8) * 0.14,
      rz: OUT.rz + Math.sin(time * 0.9) * 0.02,
    };
  }

  const armedAt = performance.now() + 700; // ignore stray input while the page is still settling
  function toggle() {
    if (performance.now() < armedAt) return;
    if (state.mode === "dropping" || state.mode === "rising") return;
    state.t = 0;
    if (state.mode === "out") { state.mode = "dropping"; state.dur = 1.6; }
    else { state.mode = "rising"; state.dur = 1.1; }
    say(state.mode);
    hint?.classList.add("is-quiet");
  }

  // ---------- input ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitTest(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects([walletBack, walletFront, cardFront, cardBack], false).length > 0;
  }
  const onPointerDown = (ev) => { if (ev.button === 0 && hitTest(ev)) toggle(); };
  const onPointerMove = (ev) => {
    canvas.style.cursor = hitTest(ev) ? "pointer" : "default";
    const r = canvas.getBoundingClientRect();
    state.target.set(((ev.clientX - r.left) / r.width) * 2 - 1, ((ev.clientY - r.top) / r.height) * 2 - 1);
  };
  const onKeyDown = (ev) => { if (ev.code === "Space" && (ev.target === container || container.contains(ev.target))) { ev.preventDefault(); toggle(); } };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  container.addEventListener("keydown", onKeyDown);

  // ---------- layout ----------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return; // hidden panel: nothing to lay out yet
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the full composition (wallet + floating card) in view on narrow stages
    const vFit = 44;
    const hFit = 6.4 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    camera.userData.dist = Math.max(vFit, hFit);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- loop ----------
  setCard(floatPose(0));
  say("out");

  function frame() {
    const dt = Math.min(state.clock.getDelta(), 0.05);
    const time = state.clock.elapsedTime;

    // card
    if (state.mode === "dropping" || state.mode === "rising") {
      state.t = Math.min(1, state.t + dt / state.dur);
      const t = state.t;
      if (state.mode === "dropping") {
        setCard(dropPose(t));
        if (t >= 0.92 && state.walletBump === 0) state.walletBump = 0.001;
        if (t >= 1) { state.mode = "in"; say("in"); }
      } else {
        setCard(risePose(t));
        if (t >= 1) { state.mode = "out"; say("out"); }
      }
    } else if (state.mode === "out") {
      setCard(floatPose(time));
    } else {
      setCard(IN);
    }

    // wallet reacts when the card lands on the pocket floor
    if (state.walletBump > 0) {
      state.walletBump += dt;
      const b = state.walletBump / 0.42;
      if (b >= 1) { state.walletBump = 0; walletGroup.scale.set(1, 1, 1); walletGroup.position.y = 0; }
      else {
        const s = Math.sin(b * Math.PI) * Math.exp(-b * 2.2);
        walletGroup.scale.set(1 + s * 0.01, 1 - s * 0.018, 1);
        walletGroup.position.y = -s * 0.05;
      }
    }

    // soft shadow cast onto the wallet plane
    const h = cardGroup.position.z;
    shadow.position.x = cardGroup.position.x - 0.1 - h * 0.25;
    shadow.position.y = cardGroup.position.y - 0.3 - h * 0.45;
    const sScale = 1 + h * 0.18;
    shadow.scale.set(sScale, sScale, 1);
    const inside = state.mode === "in" || (state.mode === "dropping" && state.t > SPLIT) || (state.mode === "rising" && state.t < LIFT);
    shadow.material.opacity = inside ? 0 : Math.max(0.1, 0.55 - h * 0.14);

    // parallax camera
    state.pointer.lerp(state.target, 0.06);
    const d = camera.userData.dist ?? 44;
    camera.position.set(state.pointer.x * 2.2, LOOK_AT.y - state.pointer.y * 1.4, d);
    camera.lookAt(LOOK_AT);

    renderer.render(scene, camera);
  }

  let active = false;
  function setActive(on) {
    if (on === active) return;
    active = on;
    if (on) { resize(); state.clock.start(); renderer.setAnimationLoop(frame); }
    else { state.clock.stop(); renderer.setAnimationLoop(null); }
  }
  setActive(opts.active ?? true);

  function destroy() {
    setActive(false);
    ro.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    container.removeEventListener("keydown", onKeyDown);
    renderer.dispose();
    canvas.remove();
  }

  return { toggle, setActive, destroy, state, canvas };
}
