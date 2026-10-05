import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BoxGeometry, PlaneGeometry,
  CylinderGeometry, SphereGeometry, MeshStandardMaterial, ShadowMaterial, HemisphereLight,
  DirectionalLight, Vector3, Plane, CurvePath, LineCurve3, TubeGeometry, InstancedMesh,
  Object3D, Color, CanvasTexture, RepeatWrapping, SRGBColorSpace, PCFShadowMap,
  NeutralToneMapping, DoubleSide, PMREMGenerator, Box3, MeshBasicMaterial
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const H = 2.7;
const CUT = 1.35;
const LOW = 0.32;
const X0 = -4.5, X1 = 4.5, Z0 = -3.2, Z1 = 3.2;
const TE = 0.24, TP = 0.1, PL = 0.022;
const BASE_ROT = -0.62;

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeBack = t => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const stagger = (t, d, s) => clamp01((t - d * s) / (1 - s));

function worldUV(g, w, h, d) {
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
  }
  return g;
}

function canvasTex(w, h, draw, rx, ry) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function blockTex() {
  return canvasTex(256, 214, (g, w, h) => {
    g.fillStyle = '#dad8d1'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(90,88,80,.12)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(110,108,100,.6)'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 1.5); g.lineTo(w, 1.5);
    g.moveTo(0, h / 2); g.lineTo(w, h / 2);
    g.moveTo(1.5, 0); g.lineTo(1.5, h / 2);
    g.moveTo(w / 2, h / 2); g.lineTo(w / 2, h);
    g.stroke();
  }, 1 / 0.6, 1 / 0.5);
}

function metroTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9cac4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2f2ee';
    const tw = w / 2, th = h / 4;
    for (let r = 0; r < 4; r++) for (let c = -1; c < 3; c++) {
      const x = c * tw + (r % 2 ? tw / 2 : 0);
      g.fillRect(x + 2, r * th + 2, tw - 4, th - 4);
    }
  }, 1 / 0.4, 1 / 0.4);
}

export function createScene({ canvas, hotspotLayer, hotspots = [], accent = '#2b44e6', accentDeep = '#1a2bb0', reduceMotion = false, onFirstFrame }) {
  const coarse = matchMedia('(pointer: coarse)').matches || innerWidth < 768;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.localClippingEnabled = true;

  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 0.5, 80);
  const model = new Group();
  model.rotation.y = BASE_ROT;
  scene.add(model);

  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
  scene.add(new HemisphereLight('#ffffff', '#aeaca5', 0.62));
  const sun = new DirectionalLight('#fffaf2', 2.3);
  sun.position.set(5, 11, 7);
  sun.castShadow = true;
  const sm = coarse ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -7.5, right: 7.5, top: 7.5, bottom: -7.5, near: 1, far: 30 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  scene.add(sun);
  const fill = new DirectionalLight('#e8ecff', 0.5);
  fill.position.set(-6, 5, -4);
  scene.add(fill);

  const ground = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.31;
  ground.receiveShadow = true;
  scene.add(ground);

  const std = (color, roughness = 0.9, extra = {}) => new MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  const clipUp = () => new Plane(new Vector3(0, -1, 0), 0);
  const partClip = clipUp(), plasterClip = clipUp(), oldClip = clipUp();
  const clipped = (mat, plane) => Object.assign(mat, { clippingPlanes: [plane], clipShadows: true, side: DoubleSide });

  const M = {
    concrete: std('#bdbcb6', 0.95),
    slab: std('#a8a7a1', 0.95),
    block: clipped(std('#ffffff', 0.95, { map: blockTex() }), partClip),
    plaster: clipped(std('#f2f2ee', 0.88), plasterClip),
    screed: std('#c4c3bd', 0.95),
    oldWall: clipped(std('#cfb59b', 0.9), oldClip),
    oldFloor: std('#7b6352', 0.7, { transparent: true }),
    oldWood: std('#6a4b35', 0.7),
    oldFabric: std('#8c6f5e', 0.95),
    oak: std('#c8a47c', 0.72),
    tile: std('#e6e6e1', 0.4),
    hallTile: std('#b9b8b2', 0.5),
    metro: std('#ffffff', 0.35, { map: metroTex() }),
    fabric: std('#a3a5a8', 0.95),
    fabricLight: std('#c9cacb', 0.95),
    fabricDark: std('#6f7277', 0.95),
    lac: std('#f5f5f2', 0.45),
    darkWood: std('#77604c', 0.75),
    metal: std('#3a3b3f', 0.4, { metalness: 0.5 }),
    steel: std('#9b9ea3', 0.35, { metalness: 0.6 }),
    stone: std('#dcdad4', 0.35),
    plant: std('#5d7a55', 0.9),
    plantDark: std('#4a6545', 0.9),
    pot: std('#d3cfc7', 0.8),
    linen: std('#efeee9', 0.95),
    rug: std('#d8d2c6', 1),
    porcelain: std('#fbfbf9', 0.22),
    glass: std('#dfe8f0', 0.05, { transparent: true, opacity: 0.28 }),
    frame: std('#f7f7f5', 0.5),
    shade: std('#fff3dd', 0.9, { emissive: '#ffe7bd', emissiveIntensity: 0.55 }),
    accent: std(accent, 0.45, { emissive: accent, emissiveIntensity: 0.2 }),
    accentDeep: std(accentDeep, 0.45, { emissive: accentDeep, emissiveIntensity: 0.15 }),
  };

  const box = (w, h, d, mat, x, y, z, cast = true) => {
    const m = new Mesh(worldUV(new BoxGeometry(w, h, d), w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    return m;
  };
  const rbox = (w, h, d, r, mat, x, y, z) => {
    const m = new Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  const cyl = (r, h, mat, x, y, z, seg = 20) => {
    const m = new Mesh(new CylinderGeometry(r, r, h, seg), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    return m;
  };

  function wall(axis, at, a, b, h, t, mat, openings = [], target) {
    const segs = [];
    const put = (s, e, y0, y1) => {
      if (e - s < 0.01 || y1 - y0 < 0.01) return;
      const len = e - s, mid = (s + e) / 2;
      segs.push(axis === 'x' ? box(len, y1 - y0, t, mat, mid, y0, at) : box(t, y1 - y0, len, mat, at, y0, mid));
    };
    let cur = a;
    [...openings].sort((p, q) => p[0] - q[0]).forEach(([s, e, sill, top]) => {
      put(cur, s, 0, h);
      if (sill !== undefined) { put(s, e, 0, sill); put(s, e, top, h); }
      cur = e;
    });
    put(cur, b, 0, h);
    segs.forEach(m => target.add(m));
    return segs;
  }

  const shell = new Group();
  model.add(shell);
  shell.add(box(X1 - X0 + TE * 2, 0.3, Z1 - Z0 + TE * 2, M.slab, 0, -0.3, 0));
  const winBack = [[-3.1, -1.5, 0.8, 2.3]];
  const winLeft = [[0.45, 2.55, 0.75, 2.35]];
  const door = [[1.65, 2.55]];
  wall('x', Z0 - TE / 2, X0 - TE, X1 + TE, H, TE, M.concrete, winBack, shell);
  wall('z', X0 - TE / 2, Z0, Z1 + TE, H, TE, M.concrete, winLeft, shell);
  wall('x', Z1 + TE / 2, X0, X1 + TE, LOW, TE, M.concrete, [], shell);
  wall('z', X1 + TE / 2, Z0, Z1, LOW, TE, M.concrete, door, shell);
  shell.add(cyl(0.07, H, M.steel, 2.84, 0, -3.06, 14));

  const glazing = (axis, at, s, e, y0, y1) => {
    const len = e - s, mid = (s + e) / 2, gh = y1 - y0;
    const g = axis === 'x' ? box(len, gh, 0.02, M.glass, mid, y0, at, false) : box(0.02, gh, len, M.glass, at, y0, mid, false);
    shell.add(g);
    const f = 0.05;
    if (axis === 'x') {
      shell.add(box(len, f, 0.08, M.frame, mid, y0 - f, at), box(len, f, 0.08, M.frame, mid, y1, at),
        box(f, gh, 0.08, M.frame, s + f / 2, y0, at), box(f, gh, 0.08, M.frame, e - f / 2, y0, at), box(f, gh, 0.06, M.frame, mid, y0, at));
    } else {
      shell.add(box(0.08, f, len, M.frame, at, y0 - f, mid), box(0.08, f, len, M.frame, at, y1, mid),
        box(0.08, gh, f, M.frame, at, y0, s + f / 2), box(0.08, gh, f, M.frame, at, y0, e - f / 2), box(0.06, gh, f, M.frame, at, y0, mid - len / 6), box(0.06, gh, f, M.frame, at, y0, mid + len / 6));
    }
  };
  glazing('x', Z0 - TE / 2, -3.1, -1.5, 0.8, 2.3);
  glazing('z', X0 - TE / 2, 0.45, 2.55, 0.75, 2.35);

  const PARTS = [
    ['x', -0.2, X0, 0.6, [[-1.5, -0.7]]],
    ['z', 0.6, Z0, -0.2, []],
    ['x', -0.9, 0.6, X1, [[1.5, 2.3], [3.35, 4.05]]],
    ['z', 3.0, Z0, -0.9, []],
    ['z', 2.4, -0.2, Z1, [[0.5, 1.7]]],
  ];
  const partitions = new Group();
  model.add(partitions);
  PARTS.forEach(([ax, at, a, b, op]) => wall(ax, at, a, b, CUT, TP, M.block, op, partitions));

  const plaster = new Group();
  model.add(plaster);
  PARTS.forEach(([ax, at, a, b, op]) => wall(ax, at, a, b, CUT + 0.006, TP + PL * 2, M.plaster, op, plaster));
  wall('x', Z0 + PL / 2, X0, X1, H, PL, M.plaster, winBack, plaster);
  wall('z', X0 + PL / 2, Z0, Z1, H, PL, M.plaster, winLeft, plaster);
  wall('x', Z1 - PL / 2, X0, X1, LOW + 0.004, PL, M.plaster, [], plaster);
  wall('z', X1 - PL / 2, Z0, Z1, LOW + 0.004, PL, M.plaster, door, plaster);

  const screed = box(X1 - X0, 0.05, Z1 - Z0, M.screed, 0, 0, 0, false);
  model.add(screed);

  const old = new Group();
  model.add(old);
  const oldFloor = box(X1 - X0, 0.012, Z1 - Z0, M.oldFloor, 0, 0, 0, false);
  old.add(oldFloor);
  const oldWalls = new Group();
  old.add(oldWalls);
  wall('x', 1.0, X0, 1.2, CUT, 0.12, M.oldWall, [[-2.4, -1.6]], oldWalls);
  wall('z', 1.2, Z0, Z1, CUT, 0.12, M.oldWall, [[-1.6, -0.8], [1.8, 2.6]], oldWalls);
  wall('x', -1.6, 1.2, X1, CUT, 0.12, M.oldWall, [[2.4, 3.2]], oldWalls);
  const oldItems = [
    rbox(2.4, 1.9, 0.5, 0.02, M.oldWood, -2.2, 0, 0.7),
    rbox(1.9, 0.7, 0.85, 0.12, M.oldFabric, -2.6, 0, -2.6),
    rbox(1.6, 0.86, 0.6, 0.02, M.oldWood, -3.6, 0, 2.85),
    rbox(0.9, 1.6, 0.6, 0.02, M.oldWood, 0.5, 0, -2.85),
    rbox(1.5, 0.55, 0.7, 0.1, M.porcelain, 2.3, 0, -2.75),
  ];
  oldItems.forEach(m => { m.userData.base = m.position.clone(); old.add(m); });

  const eng = new Group();
  model.add(eng);
  const tubes = [];
  const run = (pts, r, mat) => {
    const path = new CurvePath();
    for (let i = 0; i < pts.length - 1; i++) path.add(new LineCurve3(new Vector3(...pts[i]), new Vector3(...pts[i + 1])));
    const g = new TubeGeometry(path, Math.max(8, pts.length * 24), r, 6, false);
    const m = new Mesh(g, mat);
    m.castShadow = true;
    m.userData.count = g.index.count;
    g.setDrawRange(0, 0);
    eng.add(m);
    tubes.push(m);
  };
  const y = 0.022, E = M.accent, W = M.accentDeep;
  const zA = -0.2 + TP / 2, zBack = Z0, xE = 2.4 - TP / 2;
  const rise = (x, z, top, mat) => run([[x, y, z], [x, top, z]], 0.013, mat);
  const zAs = zA + 0.005, zBs = Z0 + 0.005, xEs = xE - 0.005;
  run([[2.8, 0.95, -0.855], [2.8, y, -0.855], [2.8, y, -0.6], [0.9, y, -0.6], [0.9, y, zA + 0.03], [-4.25, y, zA + 0.03]], 0.017, E);
  run([[-1.9, y, zA + 0.03], [-1.9, y, zAs]], 0.017, E); rise(-1.9, zAs, 1.05, E);
  run([[-3.55, y, zA + 0.03], [-3.55, y, zAs]], 0.017, E); rise(-3.55, zAs, 1.05, E);
  run([[2.6, y, -0.6], [2.6, y, -0.1], [xE - 0.03, y, -0.1], [xE - 0.03, y, 2.95], [xEs, y, 2.95]], 0.017, E); rise(xEs, 2.95, 0.3, E);
  run([[-1.1, y, zA + 0.03], [-1.1, y, -2.95], [-3.45, y, -2.95], [-3.45, y, zBs]], 0.017, E); rise(-3.45, zBs, 0.62, E);
  run([[-1.1, y, -2.95], [-0.95, y, -3.1], [-0.95, y, zBs]], 0.017, E); rise(-0.95, zBs, 0.62, E);
  run([[2.8, y, -0.855], [2.0, y, -1.15], [0.75, y, -1.15], [0.75, y, -0.955]], 0.017, E); rise(0.75, -0.955, 1.0, E);
  const wy = 0.024;
  run([[2.84, 0.4, -3.0], [2.84, wy, -3.0], [2.84, wy, -1.95], [2.945, wy, -1.95]], 0.02, W); rise(2.945, -1.95, 0.22, W);
  run([[2.84, wy, -3.0], [0.72, wy, -3.0], [0.72, wy, zBs]], 0.02, W); rise(0.72, zBs, 0.62, W);
  run([[2.84, wy, -2.4], [0.8, wy, -2.4], [0.8, wy, -1.7], [0.655, wy, -1.7]], 0.02, W); rise(0.655, -1.7, 0.55, W);
  run([[2.6, wy, -2.4], [2.0, wy, -1.0], [1.9, wy, -0.5], [0.85, wy, -0.5], [0.85, wy, zA + 0.06], [-2.6, wy, zA + 0.06], [-2.6, wy, zAs]], 0.02, W); rise(-2.6, zAs, 0.55, W);
  const panel = rbox(0.34, 0.44, 0.07, 0.015, M.lac, 2.8, 0.9, -0.82);
  eng.add(panel);

  const finish = new Group();
  model.add(finish);
  const dummy = new Object3D();
  function instanced(geo, mat, items, wave) {
    const im = new InstancedMesh(geo, mat, items.length);
    im.castShadow = false;
    im.frustumCulled = false;
    im.receiveShadow = true;
    const col = new Color();
    items.forEach((it, i) => {
      it.d = clamp01(wave(it) + Math.random() * 0.06);
      if (it.tint) im.setColorAt(i, col.setHSL(0.095, 0.3, it.tint));
    });
    im.userData.items = items;
    finish.add(im);
    return im;
  }
  const planks = [];
  const plankRoom = (x0, x1, z0, z1) => {
    let row = 0;
    for (let z = z0; z < z1 - 0.01; z += 0.2, row++) {
      const w = Math.min(0.2, z1 - z);
      let x = x0 - (row % 3) * 0.4;
      while (x < x1) {
        const s = Math.max(x, x0), e = Math.min(x + 1.2, x1);
        if (e - s > 0.04) planks.push({ x: (s + e) / 2, z: z + w / 2, sx: e - s - 0.006, sz: w - 0.006, tint: 0.56 + Math.random() * 0.07 });
        x += 1.2;
      }
    }
  };
  plankRoom(X0, 2.4, -0.2, Z1);
  plankRoom(0.6, 2.4, -0.9, -0.2);
  plankRoom(X0, 0.6, Z0, -0.2);
  const plankMesh = instanced(new BoxGeometry(1, 0.014, 1), std('#ffffff', 0.7), planks, it => (it.x - X0) / (X1 - X0) * 0.8 + (it.z - Z0) / (Z1 - Z0) * 0.2);
  plankMesh.userData.y = 0.05;

  const tiles = [];
  const tileRoom = (x0, x1, z0, z1, s, list) => {
    for (let x = x0; x < x1 - 0.01; x += s) for (let z = z0; z < z1 - 0.01; z += s) {
      const w = Math.min(s, x1 - x), d = Math.min(s, z1 - z);
      list.push({ x: x + w / 2, z: z + d / 2, sx: w - 0.008, sz: d - 0.008 });
    }
  };
  tileRoom(0.6, 3.0, Z0, -0.9, 0.3, tiles);
  tileRoom(3.0, X1, Z0, -0.9, 0.3, tiles);
  const tileMesh = instanced(new BoxGeometry(1, 0.012, 1), M.tile, tiles, it => (it.x - 0.6) / 4 * 0.7 + (it.z - Z0) / 2.3 * 0.3);
  tileMesh.userData.y = 0.05;
  const hall = [];
  tileRoom(2.4, X1, -0.9, Z1, 0.6, hall);
  const hallMesh = instanced(new BoxGeometry(1, 0.012, 1), M.hallTile, hall, it => (it.z + 0.9) / 4.1);
  hallMesh.userData.y = 0.05;
  const floorSets = [plankMesh, tileMesh, hallMesh];

  const extras = new Group();
  model.add(extras);
  extras.add(box(2.86, 0.42, 0.012, M.metro, -2.7, 0.92, zA + PL + 0.006, false));
  [[-1.9, 0.3, zA + PL], [-3.55, 1.05, zA + PL], [-1.9, 1.05, zA + PL]].forEach(([x, yy, z]) => extras.add(rbox(0.08, 0.08, 0.016, 0.006, M.lac, x, yy, z + 0.008)));
  [[-3.45, 0.62, Z0 + PL], [-0.95, 0.62, Z0 + PL]].forEach(([x, yy, z]) => extras.add(rbox(0.08, 0.08, 0.016, 0.006, M.lac, x, yy, z + 0.008)));
  extras.add(rbox(0.016, 0.08, 0.08, 0.006, M.lac, xE - PL - 0.008, 0.3, 2.95));
  extras.children.forEach(m => { m.userData.base = m.position.clone(); });

  const furniture = [];
  const piece = (x, z, parts, rotY = 0) => {
    const g = new Group();
    parts.forEach(p => g.add(p));
    g.position.set(x, 0.065, z);
    g.rotation.y = rotY;
    g.userData.base = g.position.clone();
    g.userData.d = 0;
    model.add(g);
    furniture.push(g);
    return g;
  };
  const chair = (x, z, r) => piece(x, z, [rbox(0.44, 0.46, 0.44, 0.07, M.fabricDark, 0, 0, 0), rbox(0.44, 0.42, 0.07, 0.03, M.fabricDark, 0, 0.42, -0.19)], r);
  const leafGeo = new SphereGeometry(1, 12, 8);
  const plantP = (x, z, s = 1) => {
    const parts = [cyl(0.15 * s, 0.34 * s, M.pot, 0, 0, 0, 20), cyl(0.012 * s, 0.62 * s, M.plantDark, 0, 0.3 * s, 0, 6)];
    for (let i = 0; i < 11; i++) {
      const k = i / 11, a = i * 2.39996, tilt = 0.35 + (1 - k) * 0.6, len = (0.17 + 0.07 * Math.sin(i * 1.7)) * s;
      const leaf = new Mesh(leafGeo, i % 3 ? M.plant : M.plantDark);
      leaf.scale.set(0.07 * s, 0.01 * s, len);
      leaf.rotation.set(-tilt, a, 0, 'YXZ');
      const r = len * 0.85 * Math.cos(tilt);
      leaf.position.set(Math.sin(a) * r, (0.4 + k * 0.5) * s + Math.sin(tilt) * len * 0.85, Math.cos(a) * r);
      leaf.castShadow = true;
      parts.push(leaf);
    }
    return piece(x, z, parts);
  };

  piece(-2.72, zA + PL + 0.3, [
    rbox(2.2, 0.84, 0.6, 0.015, M.lac, 0, 0, 0),
    rbox(2.22, 0.04, 0.62, 0.01, M.stone, 0, 0.84, 0.01),
    box(0.44, 0.012, 0.34, M.steel, 0.15, 0.881, 0.02),
    box(0.5, 0.008, 0.42, M.metal, -0.75, 0.881, 0.02),
  ]);
  piece(-4.15, zA + PL + 0.3, [rbox(0.62, CUT, 0.6, 0.015, M.lac, 0, 0, 0)]);
  piece(-3.3, 1.55, [
    rbox(0.9, 0.04, 1.6, 0.012, M.darkWood, 0, 0.72, 0),
    box(0.04, 0.72, 0.04, M.metal, -0.38, 0, -0.72), box(0.04, 0.72, 0.04, M.metal, 0.38, 0, -0.72),
    box(0.04, 0.72, 0.04, M.metal, -0.38, 0, 0.72), box(0.04, 0.72, 0.04, M.metal, 0.38, 0, 0.72),
  ]);
  chair(-3.95, 1.15, Math.PI / 2); chair(-3.95, 1.95, Math.PI / 2);
  chair(-2.65, 1.15, -Math.PI / 2); chair(-2.65, 1.95, -Math.PI / 2);
  piece(0.6, 2.15, [rbox(2.6, 0.012, 1.7, 0.004, M.rug, 0, 0, 0)]);
  piece(0.6, Z1 - PL - 0.47, [
    rbox(0.9, 0.4, 2.2, 0.07, M.fabric, 0, 0, 0),
    rbox(0.24, 0.42, 2.2, 0.09, M.fabric, 0.33, 0.38, 0),
    rbox(0.9, 0.22, 0.2, 0.08, M.fabric, 0, 0.38, -1.0),
    rbox(0.9, 0.22, 0.2, 0.08, M.fabric, 0, 0.38, 1.0),
    rbox(0.62, 0.12, 0.88, 0.05, M.fabricLight, -0.1, 0.4, -0.45),
    rbox(0.62, 0.12, 0.88, 0.05, M.fabricLight, -0.1, 0.4, 0.45),
  ], -Math.PI / 2);
  piece(0.6, 1.72, [cyl(0.42, 0.04, M.stone, 0, 0.36, 0, 32), cyl(0.06, 0.36, M.metal, 0, 0, 0, 12)]);
  piece(1.98, 2.92, [cyl(0.12, 0.03, M.metal, 0, 0, 0, 16), cyl(0.012, 1.45, M.metal, 0, 0.03, 0, 8), new Mesh(new CylinderGeometry(0.13, 0.19, 0.24, 20, 1, true), M.shade)]);
  furniture[furniture.length - 1].children[2].position.y = 1.55;
  plantP(-4.0, 2.6, 1.05);

  piece(-2.2, Z0 + PL + 1.09, [
    rbox(1.7, 0.3, 2.1, 0.04, M.darkWood, 0, 0, 0),
    rbox(1.62, 0.2, 2.0, 0.06, M.linen, 0, 0.3, 0),
    rbox(1.66, 0.08, 1.35, 0.04, M.fabricLight, 0, 0.47, 0.34),
    rbox(0.62, 0.14, 0.36, 0.07, M.linen, -0.38, 0.48, -0.74),
    rbox(0.62, 0.14, 0.36, 0.07, M.linen, 0.38, 0.48, -0.74),
    rbox(1.82, 0.95, 0.08, 0.03, M.fabricDark, 0, 0, -1.03),
  ]);
  piece(-3.4, Z0 + PL + 0.22, [rbox(0.46, 0.46, 0.42, 0.02, M.oak, 0, 0, 0), cyl(0.06, 0.2, M.pot, 0, 0.46, 0, 14), new Mesh(new SphereGeometry(0.1, 14, 10), M.shade)]);
  furniture[furniture.length - 1].children[2].position.y = 0.74;
  piece(-1.0, Z0 + PL + 0.22, [rbox(0.46, 0.46, 0.42, 0.02, M.oak, 0, 0, 0)]);
  piece(0.6 - TP / 2 - PL - 0.31, -2.15, [rbox(0.6, CUT, 1.9, 0.015, M.lac, 0, 0, 0)]);
  piece(-2.2, -1.35, [rbox(2.2, 0.012, 1.3, 0.004, M.rug, 0, 0, 0)]);
  plantP(-0.25, -0.6, 0.9);

  piece(1.52, Z0 + PL + 0.38, [rbox(1.7, 0.56, 0.75, 0.09, M.porcelain, 0, 0, 0), rbox(1.46, 0.03, 0.52, 0.02, std('#e4ecef', 0.2), 0, 0.53, 0)]);
  piece(2.66, -1.95, [rbox(0.4, 0.4, 0.56, 0.14, M.porcelain, -0.04, 0, 0), rbox(0.16, 0.36, 0.4, 0.04, M.porcelain, 0.16, 0.38, 0)]);
  piece(0.6 + TP / 2 + PL + 0.25, -1.75, [rbox(0.5, 0.48, 0.8, 0.02, M.oak, 0, 0.32, 0), rbox(0.44, 0.12, 0.62, 0.05, M.porcelain, 0, 0.8, 0)]);
  piece(3.38, Z0 + PL + 0.32, [rbox(0.6, 0.85, 0.6, 0.04, M.porcelain, 0, 0, 0), cyl(0.2, 0.02, M.metal, 0, 0.42, 0.3, 24)]);
  furniture[furniture.length - 1].children[1].rotation.x = Math.PI / 2;
  piece(X1 - PL - 0.22, -2.3, [rbox(0.42, CUT, 1.3, 0.015, M.lac, 0, 0, 0)]);

  piece(X1 - PL - 0.18, 0.2, [rbox(0.36, 0.44, 1.2, 0.02, M.oak, 0, 0, 0)]);
  piece(2.4 + TP / 2 + PL + 0.31, 2.6, [rbox(0.6, CUT, 1.1, 0.015, M.lac, 0, 0, 0)]);
  piece(3.95, 2.05, [rbox(0.9, 0.012, 0.6, 0.004, M.fabricDark, 0, 0, 0)]);
  plantP(4.15, -0.55, 0.85);

  // Мягкая контактная тень под каждым предметом: без неё мебель «висит» над полом.
  const aoTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    r.addColorStop(0, 'rgba(0,0,0,1)');
    r.addColorStop(0.55, 'rgba(0,0,0,.55)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return new CanvasTexture(c);
  })();
  const aoMat = new MeshBasicMaterial({ color: '#000000', map: aoTex, transparent: true, opacity: 0.42, depthWrite: false });
  furniture.forEach(g => {
    const b = new Box3();
    g.children.forEach(c => { c.geometry.computeBoundingBox(); c.updateMatrix(); b.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrix)); });
    if (b.max.y - b.min.y < 0.05) return;
    const ao = new Mesh(new PlaneGeometry(1, 1), aoMat);
    ao.rotation.x = -Math.PI / 2;
    ao.scale.set((b.max.x - b.min.x) * 1.3 + 0.25, (b.max.z - b.min.z) * 1.3 + 0.25, 1);
    ao.position.set((b.min.x + b.max.x) / 2, 0.016, (b.min.z + b.max.z) / 2);
    ao.renderOrder = 1;
    ao.userData.contact = true;
    g.add(ao);
  });

  // Замер: размерные линии по периметру и лазерный дальномер, чтобы этап не путался с перегородками.
  const measure = new Group();
  model.add(measure);
  const bar = (w, d, x, y, z) => { const m = box(w, 0.012, d, M.accent, x, y, z, false); measure.add(m); return m; };
  const dz = Z1 + 0.55, dx = X1 + 0.55;
  bar(X1 - X0, 0.012, 0, 0.02, dz);
  [X0, X1].forEach(x => { bar(0.012, 0.3, x, 0.02, dz); bar(0.008, 0.6, x, 0.02, Z1 + 0.3); });
  bar(0.012, Z1 - Z0, dx, 0.02, 0);
  [Z0, Z1].forEach(z => { bar(0.3, 0.012, dx, 0.02, z); bar(0.6, 0.008, X1 + 0.3, 0.02, z); });
  const lx = -1.6, lz = -1.0, ly = 1.12;
  [0, 2.09, 4.19].forEach(a => {
    const leg = cyl(0.01, 1.12, M.metal, lx + Math.sin(a) * 0.16, 0.065, lz + Math.cos(a) * 0.16, 6);
    leg.rotation.set(Math.cos(a) * -0.14, 0, Math.sin(a) * 0.14);
    measure.add(leg);
  });
  measure.add(rbox(0.14, 0.09, 0.09, 0.015, M.accentDeep, lx, ly, lz));
  bar(lx - X0 - 0.07, 0.006, (X0 + 0.06 + lx) / 2, ly + 0.035, lz);
  bar(0.006, lz - Z0 - 0.07, lx, ly + 0.035, (Z0 + 0.06 + lz) / 2);
  [[X0 + 0.065, lz], [lx, Z0 + 0.065]].forEach(([x, z]) => { const m = new Mesh(new SphereGeometry(0.035, 12, 8), M.accent); m.position.set(x, ly + 0.04, z); measure.add(m); });
  measure.children.forEach((m, i) => { m.userData.d = i / measure.children.length; m.userData.s = m.scale.clone(); });


  const tracks = {
    old: { t: 1, target: 1, dur: 0.9, order: 0 },
    parts: { t: 1, target: 1, dur: 1.0, order: 2 },
    eng: { t: 1, target: 1, dur: 1.3, order: 3 },
    rough: { t: 1, target: 1, dur: 1.1, order: 4 },
    floors: { t: 1, target: 1, dur: 1.3, order: 5 },
    furn: { t: 1, target: 1, dur: 1.5, order: 6 },
  };
  Object.values(tracks).forEach(k => { k.wait = 0; });
  const targetsFor = s => ({ old: s === 0 ? 1 : 0, parts: s >= 2 ? 1 : 0, eng: s >= 3 ? 1 : 0, rough: s >= 4 ? 1 : 0, floors: s >= 5 ? 1 : 0, furn: s >= 6 ? 1 : 0 });

  furniture.forEach(g => {
    const p = g.userData.base;
    g.userData.d = clamp01((p.x - X0) / (X1 - X0) * 0.55 + (p.z - Z0) / (Z1 - Z0) * 0.45);
  });
  tubes.forEach((m, i) => { m.userData.d = i / tubes.length; });

  function apply() {
    const o = tracks.old.t, p = tracks.parts.t, e = tracks.eng.t, r = tracks.rough.t, f = tracks.floors.t, u = tracks.furn.t;
    old.visible = o > 0.001;
    oldClip.constant = easeInOut(clamp01(o * 1.25)) * CUT;
    M.oldFloor.opacity = clamp01(o * 2);
    oldItems.forEach((m, i) => {
      const l = stagger(o, i / oldItems.length, 0.5);
      m.scale.setScalar(Math.max(0.0001, easeOut(l)));
      m.position.y = m.userData.base.y + (1 - l) * 0.3;
    });

    measure.visible = o > 0.001;
    measure.children.forEach(m => m.scale.copy(m.userData.s).multiplyScalar(Math.max(0.0001, easeOut(stagger(o, m.userData.d, 0.5)))));

    partitions.visible = p > 0.001;
    partClip.constant = easeInOut(p) * (CUT + 0.01);

    eng.visible = e > 0.001;
    tubes.forEach(m => {
      const l = easeInOut(stagger(e, m.userData.d, 0.55));
      m.geometry.setDrawRange(0, Math.floor(l * m.userData.count / 3) * 3);
    });
    panel.scale.setScalar(Math.max(0.0001, easeOut(clamp01(e * 3))));

    screed.visible = r > 0.001;
    screed.scale.y = Math.max(0.0001, easeOut(clamp01(r * 2)));
    screed.position.y = 0.025 * screed.scale.y;
    plaster.visible = r > 0.001;
    plasterClip.constant = easeInOut(clamp01((r - 0.25) / 0.75)) * (H + 0.01);

    floorSets.forEach(im => {
      im.visible = f > 0.001;
      if (!im.visible) return;
      im.userData.items.forEach((it, i) => {
        const l = easeOut(stagger(f, it.d, 0.6));
        dummy.position.set(it.x, im.userData.y + 0.007 + (1 - l) * 0.35, it.z);
        dummy.scale.set(it.sx * Math.max(l, 0.0001), Math.max(l, 0.0001), it.sz * Math.max(l, 0.0001));
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
    });
    extras.visible = f > 0.001;
    extras.children.forEach(m => m.scale.setScalar(Math.max(0.0001, easeOut(clamp01((f - 0.5) * 2)))));

    furniture.forEach(g => {
      const l = stagger(u, g.userData.d, 0.6);
      g.visible = l > 0.001;
      if (!g.visible) return;
      g.position.y = g.userData.base.y + (1 - easeBack(l)) * 1.1;
      g.scale.setScalar(easeOut(clamp01(l * 2.2)));
    });
  }

  let stage = 6, heroMode = true;
  const GAP = 0.32;
  function setStage(s, opts = {}) {
    heroMode = !!opts.hero;
    const tg = targetsFor(s);
    const changing = Object.entries(tracks).filter(([k, v]) => v.target !== tg[k]);
    const up = s > stage;
    const orders = changing.map(([, v]) => v.order);
    const lo = Math.min(...orders), hi = Math.max(...orders);
    changing.forEach(([k, v]) => {
      v.target = tg[k];
      v.wait = opts.instant ? 0 : k === 'old' ? (up ? 0 : (hi - lo) * GAP * 0.75) : (up ? v.order - lo : hi - v.order) * GAP;
    });
    stage = s;
    if (reduceMotion || opts.instant) Object.values(tracks).forEach(v => { v.t = v.target; v.wait = 0; });
    kick();
  }

  function stepTracks(dt) {
    let active = false;
    Object.values(tracks).forEach(v => {
      if (v.t === v.target) return;
      active = true;
      if (v.wait > 0) { v.wait -= dt; return; }
      const step = dt / v.dur;
      v.t = v.target > v.t ? Math.min(v.target, v.t + step) : Math.max(v.target, v.t - step * 1.6);
    });
    return active;
  }

  const hsEls = hotspots.map(h => {
    const el = document.createElement('div');
    el.className = 'hs';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<span class="hs-dot"></span><span class="hs-label">${h.label}</span>`;
    hotspotLayer.appendChild(el);
    return { ...h, el, v: new Vector3(h.x, h.y, h.z) };
  });
  const tmp = new Vector3();
  const stageTrackKey = ['old', 'old', 'parts', 'eng', 'rough', 'floors', 'furn'];
  function updateHotspots(w, h) {
    const placed = [];
    hsEls.forEach(hs => {
      const k = tracks[stageTrackKey[hs.stage]];
      const settled = hs.stage === 1 ? tracks.old.t < 0.02 && tracks.parts.t < 0.02 : k.t > 0.9;
      let on = !heroMode && hs.stage === stage && settled, flip = false, below = false, dx = 0, px = 0, py = 0;
      if (on) {
        tmp.copy(hs.v).applyMatrix4(model.matrixWorld).project(camera);
        px = (tmp.x + 1) / 2 * w;
        py = (1 - tmp.y) / 2 * h;
        // Подпись не должна вылезать за край сцены и наезжать на соседнюю: тогда переворачиваем, сдвигаем или прячем.
        const label = hs.el.lastChild, lw = hs.lw || (hs.lw = label.offsetWidth), lh = hs.lh || (hs.lh = label.offsetHeight);
        flip = px + 14 + lw > w - 8 || (px > w * 0.58 && px - 14 - lw >= 8);
        const x0 = flip ? px - 14 - lw : px + 14, cx = Math.min(Math.max(x0, 8), w - 8 - lw);
        dx = cx - x0;
        below = py - 10 - lh < 96;
        const ty = below ? py + 10 : py - 10 - lh, r = [cx - 6, ty - 6, cx + lw + 6, ty + lh + 6];
        if (placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) on = false;
        else placed.push(r);
      }
      hs.el.classList.toggle('on', on);
      if (!on) return;
      hs.el.classList.toggle('flip', flip);
      hs.el.classList.toggle('below', below);
      hs.el.lastChild.style.translate = dx ? `${dx.toFixed(1)}px 0` : '';
      hs.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    });
  }

  let rotTarget = 0, rotCur = 0, vel = 0, tiltX = 0, tiltTarget = 0, parX = 0, parTarget = 0;
  let dragging = false, lastX = 0, interacted = false;
  const onDown = e => {
    if (e.button !== 0) return;
    dragging = true; lastX = e.clientX; vel = 0;
    canvas.setPointerCapture(e.pointerId);
    if (!interacted) { interacted = true; canvas.dispatchEvent(new CustomEvent('model-interact', { bubbles: true })); }
  };
  const onMove = e => {
    if (dragging && e.pointerType === 'mouse' && e.buttons === 0) dragging = false;
    if (dragging) {
      const dx = e.clientX - lastX; lastX = e.clientX;
      rotTarget = Math.max(-0.75, Math.min(0.75, rotTarget + dx * 0.006));
      vel = dx * 0.006;
      kick();
    } else if (e.pointerType === 'mouse') {
      const r = canvas.getBoundingClientRect();
      parTarget = ((e.clientX - r.left) / r.width - 0.5) * 0.12;
      tiltTarget = ((e.clientY - r.top) / r.height - 0.5) * 0.05;
      kick();
    }
  };
  const onUp = () => { dragging = false; };
  const onLeave = () => { parTarget = 0; tiltTarget = 0; kick(); };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  function stepPointer(dt) {
    if (!dragging && Math.abs(vel) > 0.0002) {
      rotTarget = Math.max(-0.75, Math.min(0.75, rotTarget + vel));
      vel *= Math.pow(0.04, dt);
    }
    const k = 1 - Math.pow(0.0005, dt);
    rotCur += (rotTarget - rotCur) * k;
    parX += (parTarget - parX) * k;
    tiltX += (tiltTarget - tiltX) * k;
    model.rotation.y = BASE_ROT + rotCur + parX;
    model.rotation.x = tiltX;
    return Math.abs(rotTarget - rotCur) > 0.0005 || Math.abs(parTarget - parX) > 0.0005 || Math.abs(tiltTarget - tiltX) > 0.0005 || Math.abs(vel) > 0.0002;
  }

  let w = 1, h = 1;
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const narrow = w / h < 1;
    camera.fov = narrow ? 30 : 24;
    const vf = camera.fov * Math.PI / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const R = 5.6;
    const dist = Math.max(R / Math.sin(vf / 2), R / Math.sin(hf / 2)) * (narrow ? 1.18 : 1.12);
    const el = 0.68;
    camera.position.set(0, Math.sin(el) * dist + 0.4, Math.cos(el) * dist);
    camera.lookAt(0, narrow ? 0.15 : 0.35, 0);
    camera.updateProjectionMatrix();
    kick();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);

  let raf = 0, last = 0, visible = true, dirty = true, first = true, slowSum = 0, slowN = 0, degraded = false;
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    if (!degraded && last && dt > 0) {
      slowSum += dt; slowN++;
      if (slowN === 45) {
        if (slowSum / slowN > 0.026) { degraded = true; renderer.setPixelRatio(Math.max(0.75, renderer.getPixelRatio() * 0.7)); resize(); }
        slowSum = 0; slowN = 0;
      }
    }
    const a = stepTracks(dt);
    if (a || first) apply();
    const b = stepPointer(dt);
    if (a || b || dirty) {
      renderer.render(scene, camera);
      updateHotspots(w, h);
      dirty = false;
      if (first) { first = false; onFirstFrame && onFirstFrame(); }
    }
    if ((a || b) && visible) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function kick() {
    dirty = true;
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); });
  io.observe(canvas);

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); canvas.dispatchEvent(new CustomEvent('model-lost', { bubbles: true })); });

  resize();
  return {
    setStage,
    audit() {
      const keep = model.rotation.clone();
      model.rotation.set(0, 0, 0);
      model.updateMatrixWorld(true);
      const out = [];
      furniture.forEach((g, i) => {
        if (!g.visible) return;
        const b = new Box3();
        g.children.forEach(c => { if (!c.userData.contact) b.expandByObject(c); });
        if (b.min.x < X0 + PL - 0.005 || b.max.x > X1 - PL + 0.005 || b.min.z < Z0 + PL - 0.005 || b.max.z > Z1 - PL + 0.005) {
          out.push({ i, x: [b.min.x, b.max.x].map(v => +v.toFixed(2)), z: [b.min.z, b.max.z].map(v => +v.toFixed(2)) });
        }
      });
      model.rotation.copy(keep);
      model.updateMatrixWorld(true);
      return out;
    },
    bench(n = 30) {
      const gl = renderer.getContext(), px = new Uint8Array(4);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      return { msPerFrame: (performance.now() - t0) / n, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, dpr: renderer.getPixelRatio() };
    },
  };
}
