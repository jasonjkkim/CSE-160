// asg2.js
// Everglades-inspired habitat + articulated crocodile
// Fixes:
// 1) Zoomed out too much -> adjust camera (closer eye + narrower FOV)
// 2) FPS -> reduce draw calls in habitat (fewer sawgrass blades), reduce cylinder segments

// ---------------- Shaders ----------------
const VERTEX_SHADER = `
precision mediump float;

attribute vec3 a_Position;

uniform mat4 u_ModelMatrix;
uniform mat4 u_GlobalRotation;
uniform mat4 u_ViewProj;

void main() {
  gl_Position = u_ViewProj * u_GlobalRotation * u_ModelMatrix * vec4(a_Position, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

uniform vec3 u_Color;

void main() {
  gl_FragColor = vec4(u_Color, 1.0);
}
`;

// ---------------- WebGL + Globals ----------------
let gl;
let g_canvas;

let a_PositionLoc;
let u_ModelMatrixLoc;
let u_GlobalRotationLoc;
let u_ViewProjLoc;
let u_ColorLoc;

let g_viewProj = new Matrix4();

// Animation/time
let g_animOn = true;
let g_timeSec = 0;

// View rotation
let g_globalRotY = 20; // slider degrees
let g_mouseRotX = 0;   // degrees
let g_mouseRotY = 0;   // degrees

// Joint slider bases
let g_hipBase = 15;
let g_kneeBase = -35;
let g_ankleBase = 10;
let g_jawBase = 10;

// Current joint angles used to render
let g_hip = g_hipBase;
let g_knee = g_kneeBase;
let g_ankle = g_ankleBase;
let g_jaw = g_jawBase;

// Poke state (shift-click)
let g_pokeActive = false;
let g_pokeStart = 0;
let g_pokeEnd = 0;

// FPS indicator
let g_lastFrameMs = 0;
let g_fpsSmoothed = 0;

// Geometry buffers (uploaded once)
let g_cube = null;      // { buffer, nVerts }
let g_cylinder = null;  // { buffer, nVerts }

// Matrix stack for hierarchy
const g_stack = [];
function pushMatrix(m) { g_stack.push(new Matrix4(m)); }
function popMatrix() { return g_stack.pop(); }

// ---------------- Geometry Builders ----------------
function makeCubePositions() {
  const p = [
    // +X
    0.5,-0.5,-0.5,  0.5,-0.5, 0.5,  0.5, 0.5, 0.5,
    0.5,-0.5,-0.5,  0.5, 0.5, 0.5,  0.5, 0.5,-0.5,
    // -X
   -0.5,-0.5, 0.5, -0.5,-0.5,-0.5, -0.5, 0.5,-0.5,
   -0.5,-0.5, 0.5, -0.5, 0.5,-0.5, -0.5, 0.5, 0.5,
    // +Y
   -0.5, 0.5,-0.5,  0.5, 0.5,-0.5,  0.5, 0.5, 0.5,
   -0.5, 0.5,-0.5,  0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // -Y
   -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,  0.5,-0.5,-0.5,
   -0.5,-0.5, 0.5,  0.5,-0.5,-0.5, -0.5,-0.5,-0.5,
    // +Z
   -0.5,-0.5, 0.5, -0.5, 0.5, 0.5,  0.5, 0.5, 0.5,
   -0.5,-0.5, 0.5,  0.5, 0.5, 0.5,  0.5,-0.5, 0.5,
    // -Z
    0.5,-0.5,-0.5,  0.5, 0.5,-0.5, -0.5, 0.5,-0.5,
    0.5,-0.5,-0.5, -0.5, 0.5,-0.5, -0.5,-0.5,-0.5,
  ];
  return new Float32Array(p);
}

function makeCylinderPositions(segments) {
  const seg = Math.max(3, segments | 0);
  const verts = [];
  const y0 = -0.5, y1 = 0.5, r = 0.5;

  function addTri(ax, ay, az, bx, by, bz, cx, cy, cz) {
    verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  }

  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * 2 * Math.PI;
    const t1 = ((i + 1) / seg) * 2 * Math.PI;

    const x0 = r * Math.cos(t0), z0 = r * Math.sin(t0);
    const x1 = r * Math.cos(t1), z1 = r * Math.sin(t1);

    // Side
    addTri(x0, y0, z0, x1, y0, z1, x1, y1, z1);
    addTri(x0, y0, z0, x1, y1, z1, x0, y1, z0);

    // Top cap
    addTri(0, y1, 0, x1, y1, z1, x0, y1, z0);

    // Bottom cap
    addTri(0, y0, 0, x0, y0, z0, x1, y0, z1);
  }

  return new Float32Array(verts);
}

function createStaticVBO(positions) {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Failed to create buffer");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  return { buffer, nVerts: positions.length / 3 };
}

// ---------------- Camera (View-Projection) ----------------
function updateViewProj() {
  const aspect = g_canvas.width / g_canvas.height;

  const proj = new Matrix4();
  // Zoom back in: narrower FOV than before
  proj.setPerspective(45, aspect, 0.10, 100.0);

  const view = new Matrix4();
  // Zoom back in: bring eye closer
  view.setLookAt(
    0.0, 1.05, 3.00,  // eye (closer than 9.0)
    0.0, -0.35, 0.0,  // at
    0.0, 1.0, 0.0     // up
  );

  proj.multiply(view);
  g_viewProj.set(proj);
}

// ---------------- Drawing Helpers ----------------
function setGlobalRotationUniform() {
  const g = new Matrix4();
  g.rotate(g_mouseRotX, 1, 0, 0);
  g.rotate(g_globalRotY + g_mouseRotY, 0, 1, 0);
  gl.uniformMatrix4fv(u_GlobalRotationLoc, false, g.elements);
}

function bindPrimitive(prim) {
  gl.bindBuffer(gl.ARRAY_BUFFER, prim.buffer);
  gl.vertexAttribPointer(a_PositionLoc, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(a_PositionLoc);
}

function drawPrimitive(prim, modelMatrix, rgb) {
  gl.uniformMatrix4fv(u_ModelMatrixLoc, false, modelMatrix.elements);
  gl.uniform3f(u_ColorLoc, rgb[0], rgb[1], rgb[2]);
  bindPrimitive(prim);
  gl.drawArrays(gl.TRIANGLES, 0, prim.nVerts);
}

let g_drawColor = [1, 1, 1];
function setDrawColor(rgb) { g_drawColor = rgb; }
function drawCube(modelMatrix, rgb) {
  const c = (rgb && rgb.length === 3) ? rgb : g_drawColor;
  drawPrimitive(g_cube, modelMatrix, c);
}
function drawCylinder(modelMatrix, rgb) {
  drawPrimitive(g_cylinder, modelMatrix, rgb);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------- Animation Angles ----------------
function updateAnimationAngles() {
  if (!g_animOn) {
    g_hip = g_hipBase;
    g_knee = g_kneeBase;
    g_ankle = g_ankleBase;
    g_jaw = g_jawBase;
    return;
  }

  const walk = Math.sin(g_timeSec * 3.2);

  g_hip = clamp(g_hipBase + walk * 10, -60, 60);
  g_knee = clamp(g_kneeBase + Math.max(0, -walk) * -12, -90, 0);
  g_ankle = clamp(g_ankleBase + walk * 8, -60, 60);

  g_jaw = clamp(g_jawBase + (Math.sin(g_timeSec * 4.2) * 3 + 3), 0, 45);

  if (g_pokeActive) {
    if (g_timeSec >= g_pokeEnd) {
      g_pokeActive = false;
    } else {
      const t = (g_timeSec - g_pokeStart) / (g_pokeEnd - g_pokeStart);
      const snap = (t < 0.35) ? (1.0 - t / 0.35) : 0.0;
      g_jaw = clamp(40 - snap * 25, 0, 45);
    }
  }
}

// ---------------- Habitat Helpers (Everglades-inspired) ----------------
function drawWaterAndMud() {
  const water = [0.10, 0.38, 0.45];
  const water2 = [0.08, 0.32, 0.40];
  const mud = [0.28, 0.22, 0.16];
  const grass = [0.12, 0.42, 0.18];

  const shimmer = 0.02 * Math.sin(g_timeSec * 1.2); // slightly smaller shimmer

  const W = new Matrix4();
  W.translate(0, -0.70, 0);
  W.scale(3.2, 0.04, 3.2);
  drawCube(W, [water[0], water[1] + shimmer, water[2] + shimmer]);

  // Fewer patches (draw-call reduction)
  const W2 = new Matrix4();
  W2.translate(0.7, -0.695, -0.4);
  W2.scale(1.2, 0.03, 1.0);
  drawCube(W2, water2);

  const banks = [
    { x: -1.0, z: -0.6, sx: 0.9, sz: 0.7, y: -0.66 },
    { x:  1.0, z:  0.7, sx: 0.8, sz: 0.6, y: -0.66 },
    { x:  0.1, z: -1.1, sx: 0.6, sz: 0.8, y: -0.665 },
  ];
  for (const b of banks) {
    const B = new Matrix4();
    B.translate(b.x, b.y, b.z);
    B.scale(b.sx, 0.08, b.sz);
    drawCube(B, mud);

    const G = new Matrix4();
    G.translate(b.x, b.y + 0.05, b.z);
    G.scale(b.sx * 0.95, 0.03, b.sz * 0.95);
    drawCube(G, grass);
  }
}

function drawSawgrassClump(cx, cz, nBlades) {
  const blade = [0.16, 0.62, 0.22];
  const baseY = -0.62;

  // Performance: sway the whole clump (not every blade uniquely)
  const clumpSway = 10 * Math.sin(g_timeSec * 2.0 + cx * 1.7 + cz * 2.1);

  for (let i = 0; i < nBlades; i++) {
    const ox = (i % 4) * 0.06 - 0.09;
    const oz = ((i / 4) | 0) * 0.06 - 0.09;

    const S = new Matrix4();
    S.translate(cx + ox, baseY + 0.12, cz + oz);
    S.rotate(clumpSway, 0, 0, 1);
    S.scale(0.03, 0.28, 0.03);
    drawCube(S, blade);
  }
}

function drawMangrove(x, z) {
  const bark = [0.22, 0.18, 0.14];
  const leaf = [0.10, 0.40, 0.16];
  const root = [0.18, 0.14, 0.10];

  // Trunk (cylinder)
  const T = new Matrix4();
  T.translate(x, -0.42, z);
  T.scale(0.10, 0.55, 0.10);
  drawCylinder(T, bark);

  // Roots (use cubes instead of cylinders for fewer triangles)
  for (let k = 0; k < 3; k++) {
    const ang = k * 120;
    const R = new Matrix4();
    R.translate(x, -0.55, z);
    R.rotate(ang, 0, 1, 0);
    R.translate(0.14, 0.0, 0.0);
    R.rotate(35, 0, 0, 1);
    R.scale(0.05, 0.30, 0.05);
    drawCube(R, root);
  }

  // Canopy
  const C = new Matrix4();
  C.translate(x, -0.10, z);
  C.scale(0.55, 0.22, 0.55);
  drawCube(C, leaf);

  const C2 = new Matrix4();
  C2.translate(x + 0.12, -0.03, z - 0.10);
  C2.scale(0.38, 0.18, 0.38);
  drawCube(C2, leaf);
}

// ---------------- Crocodile Scene ----------------
function renderScene() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.uniformMatrix4fv(u_ViewProjLoc, false, g_viewProj.elements);
  setGlobalRotationUniform();

  const green = [0.15, 0.55, 0.22];
  const greenDark = [0.08, 0.35, 0.14];
  const greenMid = [0.12, 0.45, 0.18];
  const belly = [0.72, 0.78, 0.56];
  const mouthPink = [0.85, 0.45, 0.55];
  const tongueRed = [0.70, 0.22, 0.28];
  const black = [0.05, 0.05, 0.05];
  const white = [0.92, 0.92, 0.92];

  const bob = g_animOn ? Math.sin(g_timeSec * 3.2) * 0.02 : 0;

  // Habitat
  drawWaterAndMud();

  // Performance: fewer blades than before (big FPS win)
  drawSawgrassClump(-1.05, -0.65, 10);
  drawSawgrassClump( 1.00,  0.72, 10);
  drawSawgrassClump( 0.15, -1.10, 8);
  drawSawgrassClump(-0.30,  1.10, 8);

  drawMangrove(-1.55,  1.20);
  drawMangrove( 1.55, -1.25);

  // Crocodile root
  let M = new Matrix4();
  M.translate(0.35, -0.5 + bob, 0);
  M.scale(0.38, 0.38, 0.38);

  // Body
  pushMatrix(M);
  M.scale(1.25, 0.35, 0.55);
  drawCube(M, green);
  M = popMatrix();

  // Belly plate
  pushMatrix(M);
  M.translate(0.05, -0.10, 0);
  M.scale(0.95, 0.12, 0.42);
  drawCube(M, belly);
  M = popMatrix();

  // Neck
  let neck = new Matrix4(M);
  neck.translate(0.70, 0.08, 0);
  pushMatrix(neck);
  neck.scale(0.40, 0.22, 0.40);
  drawCube(neck, greenMid);
  neck = popMatrix();

  // Head base
  let head = new Matrix4(M);
  head.translate(1.02, 0.12, 0);
  pushMatrix(head);
  head.scale(0.55, 0.24, 0.44);
  drawCube(head, green);
  head = popMatrix();

  // Snout top
  let snout = new Matrix4(M);
  snout.translate(1.32, 0.08, 0);
  pushMatrix(snout);
  snout.scale(0.55, 0.16, 0.34);
  drawCube(snout, greenDark);
  snout = popMatrix();

  // Upper jaw ridge
  let upperJaw = new Matrix4(M);
  upperJaw.translate(1.28, 0.01, 0);
  pushMatrix(upperJaw);
  upperJaw.scale(0.62, 0.08, 0.38);
  drawCube(upperJaw, greenDark);
  upperJaw = popMatrix();

  // Lower jaw (hinge)
  let jawBase = new Matrix4(M);
  jawBase.translate(1.08, 0.02, 0);
  jawBase.rotate(-g_jaw, 0, 0, 1);
  jawBase.translate(0.26, -0.12, 0);

  // Outer lower jaw shell (shortened)
  let jawOuter = new Matrix4(jawBase);
  jawOuter.translate(-0.06, 0.0, 0.0);
  jawOuter.scale(0.62, 0.13, 0.40);
  drawCube(jawOuter, greenDark);

  // Inner mouth
  let jawInner = new Matrix4(jawBase);
  jawInner.translate(-0.06 + 0.02, 0.01, 0.0);
  jawInner.scale(0.56, 0.08, 0.34);
  drawCube(jawInner, mouthPink);

  // Tongue
  {
    let T = new Matrix4(M);
    T.translate(1.22, -0.09, 0);
    T.scale(0.40, 0.05, 0.22);
    drawCube(T, tongueRed);
  }

  // Teeth
  for (let i = 0; i < 7; i++) {
    const x = 1.12 + i * 0.08;

    const tU1 = new Matrix4(M);
    tU1.translate(x, -0.05, 0.17);
    tU1.scale(0.03, 0.05, 0.03);
    drawCube(tU1, white);

    const tU2 = new Matrix4(M);
    tU2.translate(x, -0.05, -0.17);
    tU2.scale(0.03, 0.05, 0.03);
    drawCube(tU2, white);
  }

  // Eyes
  {
    const eyeX = 1.33, eyeY = 0.26, eyeZ = 0.24;

    let e1 = new Matrix4(M);
    e1.translate(eyeX, eyeY, eyeZ);
    e1.scale(0.10, 0.10, 0.10);
    drawCylinder(e1, white);

    let p1 = new Matrix4(M);
    p1.translate(eyeX + 0.03, eyeY, eyeZ + 0.03);
    p1.scale(0.05, 0.05, 0.05);
    drawCylinder(p1, black);

    let e2 = new Matrix4(M);
    e2.translate(eyeX, eyeY, -eyeZ);
    e2.scale(0.10, 0.10, 0.10);
    drawCylinder(e2, white);

    let p2 = new Matrix4(M);
    p2.translate(eyeX + 0.03, eyeY, -(eyeZ + 0.03));
    p2.scale(0.05, 0.05, 0.05);
    drawCylinder(p2, black);
  }

  // Nostrils
  {
    let n1 = new Matrix4(M);
    n1.translate(1.62, 0.10, 0.12);
    n1.scale(0.06, 0.04, 0.06);
    drawCylinder(n1, black);

    let n2 = new Matrix4(M);
    n2.translate(1.62, 0.10, -0.12);
    n2.scale(0.06, 0.04, 0.06);
    drawCylinder(n2, black);
  }

  // Tail
  const tailWave = g_animOn ? Math.sin(g_timeSec * 3.0) * 18 : 0;
  const tailWhip = (g_pokeActive ? Math.sin(g_timeSec * 22.0) * 30 : 0);
  const tailA0 = tailWave + tailWhip;

  let tail = new Matrix4(M);
  tail.translate(-0.60, 0.05, 0);

  const tailSeg = [
    { len: 0.62, sx: 0.60, sy: 0.18, sz: 0.34, k: 1.00 },
    { len: 0.55, sx: 0.52, sy: 0.15, sz: 0.28, k: 0.85 },
    { len: 0.48, sx: 0.45, sy: 0.13, sz: 0.22, k: 0.70 },
    { len: 0.40, sx: 0.38, sy: 0.11, sz: 0.18, k: 0.55 },
    { len: 0.34, sx: 0.30, sy: 0.09, sz: 0.14, k: 0.40 },
  ];

  for (let i = 0; i < tailSeg.length; i++) {
    const s = tailSeg[i];
    tail.rotate(tailA0 * s.k, 0, 0, 1);
    tail.translate(-s.len * 0.5, 0, 0);

    const segM = new Matrix4(tail);
    segM.scale(s.sx, s.sy, s.sz);
    drawCube(segM, greenDark);

    const spike = new Matrix4(tail);
    spike.translate(0.0, 0.20, 0.0);
    spike.scale(0.10, 0.12, 0.10);
    drawCube(spike, greenDark);

    tail.translate(-s.len * 0.5, 0, 0);
  }

  // Dorsal spikes
  for (let i = 0; i < 7; i++) {
    const s = new Matrix4(M);
    s.translate(-0.55 + i * 0.23, 0.22, 0);
    s.scale(0.10, 0.12, 0.10);
    drawCube(s, greenDark);
  }

  // Legs
  drawFrontLeftLeg(M, greenDark);

  const gait = g_animOn ? Math.sin(g_timeSec * 3.2) * 14 : 0;
  drawLegWithToes(M,  0.45, -0.10,  0.23, -gait, greenDark);   // front-right
  drawLegWithToes(M, -0.35, -0.10,  0.23,  gait, greenDark);   // back-right
  drawLegWithToes(M, -0.35, -0.10, -0.23, -gait, greenDark);   // back-left
}

function drawFrontLeftLeg(bodyMatrix, rgb) {
  let hipM = new Matrix4(bodyMatrix);
  hipM.translate(0.45, -0.08, -0.23);
  hipM.rotate(g_hip, 0, 0, 1);

  pushMatrix(hipM);
  hipM.translate(0.06, -0.20, 0);
  hipM.scale(0.14, 0.30, 0.14);
  drawCube(hipM, rgb);
  hipM = popMatrix();

  let kneeM = new Matrix4(hipM);
  kneeM.translate(0.00, -0.30, 0);
  kneeM.rotate(g_knee, 0, 0, 1);

  pushMatrix(kneeM);
  kneeM.translate(0.04, -0.18, 0);
  kneeM.scale(0.12, 0.26, 0.12);
  drawCube(kneeM, rgb);
  kneeM = popMatrix();

  let ankleM = new Matrix4(kneeM);
  ankleM.translate(0.00, -0.26, 0);
  ankleM.rotate(g_ankle, 0, 0, 1);

  const foot = new Matrix4(ankleM);
  foot.translate(0.11, -0.05, 0);
  foot.scale(0.24, 0.08, 0.16);
  drawCube(foot, rgb);

  for (let i = -1; i <= 1; i++) {
    const toe = new Matrix4(ankleM);
    toe.translate(0.23, -0.07, i * 0.06);
    toe.scale(0.06, 0.04, 0.04);
    drawCube(toe, rgb);
  }
}

function drawLegWithToes(bodyMatrix, x, y, z, swingDeg, rgb) {
  let M = new Matrix4(bodyMatrix);
  M.translate(x, y, z);
  M.rotate(swingDeg, 0, 0, 1);

  pushMatrix(M);
  M.translate(0.03, -0.18, 0);
  M.scale(0.12, 0.26, 0.12);
  drawCube(M, rgb);
  M = popMatrix();

  let L = new Matrix4(M);
  L.translate(0.0, -0.26, 0);
  L.rotate(-25, 0, 0, 1);

  pushMatrix(L);
  L.translate(0.03, -0.16, 0);
  L.scale(0.10, 0.22, 0.10);
  drawCube(L, rgb);
  L = popMatrix();

  const F = new Matrix4(L);
  F.translate(0.10, -0.02, 0);
  F.scale(0.22, 0.08, 0.14);
  drawCube(F, rgb);

  for (let i = -1; i <= 1; i++) {
    const toe = new Matrix4(L);
    toe.translate(0.20, -0.05, i * 0.05);
    toe.scale(0.06, 0.04, 0.04);
    drawCube(toe, rgb);
  }
}

// ---------------- Tick / Main Loop ----------------
function tick(nowMs) {
  if (!g_lastFrameMs) g_lastFrameMs = nowMs;
  const dt = (nowMs - g_lastFrameMs) / 1000.0;
  g_lastFrameMs = nowMs;

  const fps = dt > 0 ? (1.0 / dt) : 0;
  g_fpsSmoothed = g_fpsSmoothed ? (0.9 * g_fpsSmoothed + 0.1 * fps) : fps;

  const fpsEl = document.getElementById("fps");
  if (fpsEl) fpsEl.textContent = "FPS: " + g_fpsSmoothed.toFixed(1);

  if (g_animOn) g_timeSec += dt;

  updateAnimationAngles();
  renderScene();
  requestAnimationFrame(tick);
}

// ---------------- UI + Mouse ----------------
function hookSlider(id, setter) {
  const el = document.getElementById(id);
  const valEl = document.getElementById(id + "Val");
  if (!el) return;

  function update() {
    const v = Number(el.value);
    if (valEl) valEl.textContent = String(v);
    setter(v);
    if (!g_animOn) { updateAnimationAngles(); renderScene(); }
  }

  el.addEventListener("input", update);
  update();
}

function initUI() {
  hookSlider("globalRot", (v) => { g_globalRotY = v; });
  hookSlider("hip", (v) => { g_hipBase = v; });
  hookSlider("knee", (v) => { g_kneeBase = v; });
  hookSlider("ankle", (v) => { g_ankleBase = v; });
  hookSlider("jaw", (v) => { g_jawBase = v; });

  const onBtn = document.getElementById("animOn");
  const offBtn = document.getElementById("animOff");
  if (onBtn) onBtn.onclick = () => { g_animOn = true; };
  if (offBtn) offBtn.onclick = () => { g_animOn = false; updateAnimationAngles(); renderScene(); };

  const canvas = document.getElementById("webgl");
  if (!canvas) return;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("mousedown", (e) => {
    if (e.shiftKey) {
      g_pokeActive = true;
      g_pokeStart = g_timeSec;
      g_pokeEnd = g_timeSec + 0.35;
    }
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener("mouseup", () => { dragging = false; });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    g_mouseRotY += dx * 0.4;
    g_mouseRotX += dy * 0.4;
    g_mouseRotX = clamp(g_mouseRotX, -85, 85);

    if (!g_animOn) renderScene();
  });
}

// ---------------- Main ----------------
function main() {
  g_canvas = document.getElementById("webgl");
  gl = getWebGLContext(g_canvas);
  if (!gl) {
    console.log("Failed to get WebGL context.");
    return;
  }

  if (!initShaders(gl, VERTEX_SHADER, FRAGMENT_SHADER)) {
    console.log("Failed to compile/load shaders.");
    return;
  }

  gl.enable(gl.DEPTH_TEST);

  // Sky-ish background
  gl.clearColor(0.55, 0.80, 0.92, 1.0);

  a_PositionLoc = gl.getAttribLocation(gl.program, "a_Position");
  u_ModelMatrixLoc = gl.getUniformLocation(gl.program, "u_ModelMatrix");
  u_GlobalRotationLoc = gl.getUniformLocation(gl.program, "u_GlobalRotation");
  u_ViewProjLoc = gl.getUniformLocation(gl.program, "u_ViewProj");
  u_ColorLoc = gl.getUniformLocation(gl.program, "u_Color");

  g_cube = createStaticVBO(makeCubePositions());

  // Performance: fewer cylinder segments (18 -> 12)
  g_cylinder = createStaticVBO(makeCylinderPositions(12));

  updateViewProj();
  window.addEventListener("resize", () => {
    updateViewProj();
    renderScene();
  });

  initUI();
  updateAnimationAngles();
  renderScene();
  requestAnimationFrame(tick);
}
