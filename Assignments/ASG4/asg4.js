// asg4.js

// ---------------- Shaders ----------------
let VSHADER = `
precision mediump float;

attribute vec3 a_Position;
attribute vec3 a_Normal;

uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjMatrix;
uniform mat4 u_NormalMatrix;

varying vec3 v_NormalW;
varying vec3 v_WorldPos;

void main() {
  vec4 worldPos4 = u_ModelMatrix * vec4(a_Position, 1.0);
  v_WorldPos = worldPos4.xyz;

  vec4 worldNormal4 = u_NormalMatrix * vec4(a_Normal, 0.0);
  v_NormalW = normalize(worldNormal4.xyz);

  gl_Position = u_ProjMatrix * u_ViewMatrix * worldPos4;
}
`;

let FSHADER = `
precision mediump float;

uniform vec3 u_Color;

uniform vec3 u_ambientK;
uniform vec3 u_diffuseK;
uniform vec3 u_specularK;

uniform vec3 u_lightPos;     // point light position (world)
uniform vec3 u_eyePos;       // camera position (world)
uniform vec3 u_lightColor;   // user color

uniform bool u_LightingEnabled;
uniform bool u_ShowNormals;

uniform bool u_PointEnabled;

uniform bool u_SpotEnabled;
uniform vec3 u_SpotPos;
uniform vec3 u_SpotDir;
uniform float u_SpotCutoff;
uniform float u_SpotOuterCutoff;

varying vec3 v_NormalW;
varying vec3 v_WorldPos;

vec3 ambientTerm() {
  return u_ambientK * u_Color;
}

vec3 diffuseTerm(vec3 L, vec3 N) {
  float ndotl = max(dot(N, L), 0.0);
  return u_diffuseK * u_Color * ndotl;
}

vec3 specularTerm(vec3 L, vec3 N, vec3 V) {
  vec3 R = reflect(-L, N);
  float rdotv = max(dot(R, V), 0.0);
  float s = pow(rdotv, 32.0);
  return u_specularK * s;
}

float spotIntensity(vec3 fragPos) {
  vec3 L = normalize(u_SpotPos - fragPos);
  float theta = dot(normalize(-L), normalize(u_SpotDir));
  float eps = (u_SpotCutoff - u_SpotOuterCutoff);
  return clamp((theta - u_SpotOuterCutoff) / eps, 0.0, 1.0);
}

void main() {
  vec3 N = normalize(v_NormalW);

  if (u_ShowNormals) {
    gl_FragColor = vec4(N * 0.5 + 0.5, 1.0);
    return;
  }

  if (!u_LightingEnabled) {
    gl_FragColor = vec4(u_Color, 1.0);
    return;
  }

  vec3 V = normalize(u_eyePos - v_WorldPos);
  vec3 color = ambientTerm();

  if (u_PointEnabled) {
    vec3 Lp = normalize(u_lightPos - v_WorldPos);
    vec3 diff = diffuseTerm(Lp, N);
    vec3 spec = specularTerm(Lp, N, V);
    color += (diff + spec) * u_lightColor;
  }

  if (u_SpotEnabled) {
    float inten = spotIntensity(v_WorldPos);
    if (inten > 0.0) {
      vec3 Ls = normalize(u_SpotPos - v_WorldPos);
      vec3 diffS = diffuseTerm(Ls, N);
      vec3 specS = specularTerm(Ls, N, V);
      color += (diffS + specS) * u_lightColor * inten;
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

// ---------------- WebGL + Globals ----------------
let canvas, gl;
let camera;

let modelMatrix = new Matrix4();
let normalMatrix = new Matrix4();

// Scene mode: 0 demo, 1 crocodile
let g_sceneMode = 1;

// Light state
let lightAngle = 0.0;
let lightRadius = 1.4;
let lightHeight = 0.6;
let lightCenterX = 0.0;
let lightColor = [1.0, 1.0, 1.0];
let lightPos = [0.0, 0.6, 1.4];

// Toggles
let lightingEnabled = true;
let showNormals = false;
let pointEnabled = true;
let spotEnabled = true;

// Buffers
let vertexBuffer, normalBuffer, indexBuffer;

// Uniform locations
let u_ModelMatrix, u_ViewMatrix, u_ProjMatrix, u_NormalMatrix;
let u_Color, u_ambientK, u_diffuseK, u_specularK;
let u_lightPos, u_eyePos, u_lightColor;
let u_LightingEnabled, u_ShowNormals, u_PointEnabled;
let u_SpotEnabled, u_SpotPos, u_SpotDir, u_SpotCutoff, u_SpotOuterCutoff;

// Models
let models = [];
let lightMarker = null;

// Stable demo models (no flicker)
let demoModels = [];

// Crocodile models built each frame (dynamic animation)
let crocModels = [];

// OBJ model (requirement)
let objModel = null;
let objEnabled = true;
let objSource = "";

// ---------------- Cylinder Primitive (with normals) ----------------
class Cylinder extends Model {
  constructor(color, segments = 12) {
    super(color);
    const seg = Math.max(3, segments | 0);

    // We create separate vertices for side + caps for correct normals.
    const positions = [];
    const normals = [];
    const indices = [];

    const y0 = -0.5, y1 = 0.5, r = 0.5;

    function pushV(px, py, pz, nx, ny, nz) {
      positions.push(px, py, pz);
      normals.push(nx, ny, nz);
      return (positions.length / 3) - 1;
    }

    // Side vertices (two rings)
    const sideTop = [];
    const sideBot = [];
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * 2 * Math.PI;
      const x = r * Math.cos(t);
      const z = r * Math.sin(t);
      const nx = Math.cos(t);
      const nz = Math.sin(t);

      sideBot.push(pushV(x, y0, z, nx, 0.0, nz));
      sideTop.push(pushV(x, y1, z, nx, 0.0, nz));
    }

    // Side indices
    for (let i = 0; i < seg; i++) {
      const b0 = sideBot[i], b1 = sideBot[i + 1];
      const t0 = sideTop[i], t1 = sideTop[i + 1];
      indices.push(b0, b1, t1);
      indices.push(b0, t1, t0);
    }

    // Top cap (center + rim)
    const topCenter = pushV(0, y1, 0, 0, 1, 0);
    const topRim = [];
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * 2 * Math.PI;
      const x = r * Math.cos(t);
      const z = r * Math.sin(t);
      topRim.push(pushV(x, y1, z, 0, 1, 0));
    }
    for (let i = 0; i < seg; i++) {
      indices.push(topCenter, topRim[i + 1], topRim[i]);
    }

    // Bottom cap
    const botCenter = pushV(0, y0, 0, 0, -1, 0);
    const botRim = [];
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * 2 * Math.PI;
      const x = r * Math.cos(t);
      const z = r * Math.sin(t);
      botRim.push(pushV(x, y0, z, 0, -1, 0));
    }
    for (let i = 0; i < seg; i++) {
      indices.push(botCenter, botRim[i], botRim[i + 1]);
    }

    this.vertices = new Float32Array(positions);
    this.normals = new Float32Array(normals);
    this.indices = new Uint16Array(indices);
  }
}

// ---------------- Matrix Stack (for ASG2 one-to-one hierarchy) ----------------
const g_stack = [];
function pushMatrix(m) { g_stack.push(new Matrix4(m)); }
function popMatrix() { return g_stack.pop(); }

// ---------------- ASG2 State (ported 1:1) ----------------
let g_animOn = true;
let g_timeSec = 0;
let g_lastFrameMs = 0;
let g_fpsSmoothed = 0;

// View rotation (ASG2)
let g_globalRotY = 20; // slider degrees
let g_mouseRotX = 0;   // degrees
let g_mouseRotY = 0;   // degrees

// Joint slider bases
let g_hipBase = 15;
let g_kneeBase = -35;
let g_ankleBase = 10;
let g_jawBase = 10;

// Current joint angles
let g_hip = g_hipBase;
let g_knee = g_kneeBase;
let g_ankle = g_ankleBase;
let g_jaw = g_jawBase;

// Poke state
let g_pokeActive = false;
let g_pokeStart = 0;
let g_pokeEnd = 0;

// ---------------- UI Elements (created dynamically) ----------------
let uiContainer = null;
let uiAsg2Panel = null;
let uiSceneBtn = null;
let uiFps = null;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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

// ---------------- Core Rendering Helpers ----------------
function initBuffer(attributeName, n) {
  const buf = gl.createBuffer();
  if (!buf) return null;

  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const loc = gl.getAttribLocation(gl.program, attributeName);
  gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(loc);
  return buf;
}

function drawModel(model, override) {
  const color = (override && override.color) ? override.color : model.color;
  const lit = (override && typeof override.lightingEnabled === "boolean") ? override.lightingEnabled : lightingEnabled;

  if (model.modelMatrixOverride) {
    modelMatrix.set(model.modelMatrixOverride);
  } else {
    modelMatrix.setIdentity();
    modelMatrix.translate(model.translate[0], model.translate[1], model.translate[2]);
    modelMatrix.rotate(model.rotate[0], 1, 0, 0);
    modelMatrix.rotate(model.rotate[1], 0, 1, 0);
    modelMatrix.rotate(model.rotate[2], 0, 0, 1);
    modelMatrix.scale(model.scale[0], model.scale[1], model.scale[2]);
  }

  gl.uniformMatrix4fv(u_ModelMatrix, false, modelMatrix.elements);

  normalMatrix.setInverseOf(modelMatrix);
  normalMatrix.transpose();
  gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);

  gl.uniform3f(u_Color, color[0], color[1], color[2]);

  gl.uniform1i(u_LightingEnabled, lit ? 1 : 0);
  gl.uniform1i(u_ShowNormals, showNormals ? 1 : 0);
  gl.uniform1i(u_PointEnabled, pointEnabled ? 1 : 0);
  gl.uniform1i(u_SpotEnabled, spotEnabled ? 1 : 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, model.normals, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indices, gl.STATIC_DRAW);

  gl.drawElements(gl.TRIANGLES, model.indices.length, gl.UNSIGNED_SHORT, 0);
}

function addPartFromMatrix(primitive, worldMatrix, color) {
  primitive.color = color;
  primitive.modelMatrixOverride = new Matrix4(worldMatrix);
  return primitive;
}

function emitCube(worldMatrix, color, targetArray) {
  const c = new Cube(color);
  c.modelMatrixOverride = new Matrix4(worldMatrix);
  targetArray.push(c);
  return c;
}

function emitSphere(worldMatrix, color, targetArray) {
  const s = new Sphere(color);
  s.modelMatrixOverride = new Matrix4(worldMatrix);
  targetArray.push(s);
  return s;
}

function emitCylinder(worldMatrix, color, targetArray) {
  const cy = new Cylinder(color, 12); // matches ASG2 perf setting
  cy.modelMatrixOverride = new Matrix4(worldMatrix);
  targetArray.push(cy);
  return cy;
}

// ---------------- Lights ----------------
function updateLights() {
  lightAngle += 0.02;
  const x = lightCenterX + Math.cos(lightAngle) * lightRadius;
  const z = Math.sin(lightAngle) * lightRadius;
  const y = lightHeight;

  lightPos = [x, y, z];
  gl.uniform3f(u_lightPos, x, y, z);

  if (lightMarker) {
    lightMarker.setTranslate(x, y, z);
  }

  gl.uniform3f(u_lightColor, lightColor[0], lightColor[1], lightColor[2]);

  // Spotlight attached to camera
  const spotPos = camera.eye.elements;
  const forward = new Vector3(camera.center.elements);
  forward.sub(camera.eye);
  forward.normalize();

  gl.uniform3f(u_SpotPos, spotPos[0], spotPos[1], spotPos[2]);
  gl.uniform3f(u_SpotDir, forward.elements[0], forward.elements[1], forward.elements[2]);
}

// ---------------- UI Hooks (existing ASG4 HTML) ----------------
function onZoomInput(value) { camera.zoom(1.0 + value / 10); }
function toggleLighting() { lightingEnabled = !lightingEnabled; }
function toggleNormalViz() { showNormals = !showNormals; }
function togglePointLight() { pointEnabled = !pointEnabled; }
function toggleSpotLight() { spotEnabled = !spotEnabled; }

function onLightXInput(value) {
  lightCenterX = Number(value) / 100.0;
  const el = document.getElementById("lightXVal");
  if (el) el.textContent = lightCenterX.toFixed(2);
}

function onLightColorInput() {
  const r = Number(document.getElementById("lightR").value) / 100.0;
  const g = Number(document.getElementById("lightG").value) / 100.0;
  const b = Number(document.getElementById("lightB").value) / 100.0;
  lightColor = [r, g, b];

  const rEl = document.getElementById("lightRVal");
  const gEl = document.getElementById("lightGVal");
  const bEl = document.getElementById("lightBVal");
  if (rEl) rEl.textContent = r.toFixed(2);
  if (gEl) gEl.textContent = g.toFixed(2);
  if (bEl) bEl.textContent = b.toFixed(2);
}

function applyASG2CameraPose() {
  const aspect = canvas.width / canvas.height;
  camera.projMatrix.setPerspective(45, aspect, 0.10, 100.0);
  camera.viewMatrix.setLookAt(
    0.0, 1.05, 3.00,
    0.0, -0.35, 0.0,
    0.0, 1.0, 0.0
  );
  camera.eye = new Vector3([0.0, 1.05, 3.00]);
  camera.center = new Vector3([0.0, -0.35, 0.0]);
}

function setOBJStatus(text, isError = false) {
  const el = document.getElementById("objStatus");
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#a00" : "#444";
}

function applyOBJPlacement() {
  if (!objModel) return;

  // Place OBJ differently in demo and crocodile scenes so it remains visible.
  if (g_sceneMode === 0) {
    const spinDeg = (lightAngle * 180.0 / Math.PI) % 360.0;
    objModel.setTranslate(0.0, -0.30, -1.30);
    objModel.setRotate(0.0, spinDeg, 0.0);
    objModel.setScale(0.18, 0.18, 0.18);
  } else {
    objModel.setTranslate(-1.15, -0.52, 1.25);
    objModel.setRotate(0.0, 135.0, 0.0);
    objModel.setScale(0.12, 0.12, 0.12);
  }
}

function useOBJMesh(mesh, sourceLabel) {
  if (!mesh || !mesh.vertices || !mesh.normals || !mesh.indices || mesh.indices.length === 0) {
    throw new Error("OBJ mesh data is empty.");
  }

  const m = new Model([0.86, 0.78, 0.56]);
  m.vertices = mesh.vertices;
  m.normals = mesh.normals;
  m.indices = mesh.indices;

  objModel = m;
  objEnabled = true;
  objSource = sourceLabel;
  applyOBJPlacement();

  const vCount = (mesh.vertices.length / 3) | 0;
  setOBJStatus("OBJ: loaded " + sourceLabel + " (" + vCount + " vertices)");
}

async function loadDefaultOBJ() {
  setOBJStatus("OBJ: loading models/teapot.obj...");

  try {
    const res = await fetch("models/teapot.obj");
    if (!res.ok) throw new Error("HTTP " + res.status);

    const text = await res.text();
    const mesh = parseOBJ(text);
    useOBJMesh(mesh, "models/teapot.obj");
    return;
  } catch (e) {
    console.warn("Default OBJ fetch failed:", e);
  }

  // Local fallback if the model is pasted in index.html
  try {
    const mesh = loadOBJFromEmbeddedScriptTag("embeddedOBJ");
    useOBJMesh(mesh, "embeddedOBJ");
    return;
  } catch (e) {
    console.warn("Embedded OBJ fallback failed:", e);
  }

  setOBJStatus("OBJ: load failed (choose a .obj file)", true);
}

function toggleOBJ() {
  if (!objModel) {
    setOBJStatus("OBJ: not loaded yet");
    return;
  }
  objEnabled = !objEnabled;
  setOBJStatus("OBJ: " + (objEnabled ? "shown" : "hidden") + " (" + objSource + ")");
}

async function onOBJFileSelected(files) {
  const file = files && files.length ? files[0] : null;
  if (!file) return;

  setOBJStatus("OBJ: loading " + file.name + "...");
  try {
    const mesh = await loadOBJFromFile(file);
    useOBJMesh(mesh, file.name);
  } catch (e) {
    console.error("OBJ parse failed:", e);
    setOBJStatus("OBJ: failed to parse " + file.name, true);
  }
}

// ---------------- Scene Toggle ----------------
function toggleScene() {
  g_sceneMode = (g_sceneMode === 0) ? 1 : 0;
  syncModeUIVisibility();
  applyOBJPlacement();
  if (g_sceneMode === 1) applyASG2CameraPose();
}

// ---------------- Input Controls ----------------
window.addEventListener("keydown", function (event) {
  const speed = 0.2;
  switch (event.key) {
    case "w": if (g_sceneMode === 0) camera.moveForward(speed); break;
    case "s": if (g_sceneMode === 0) camera.moveForward(-speed); break;
    case "a": if (g_sceneMode === 0) camera.pan(5); break;
    case "d": if (g_sceneMode === 0) camera.pan(-5); break;
    case " ": toggleScene(); break;
  }
});

// ---------------- Mouse Controls ----------------
let demoDragging = false;
let demoLastX = 0;
let demoLastY = 0;

let crocDragging = false;
let crocLastX = 0;
let crocLastY = 0;

function hookMouse() {
  // Demo: orbit camera
  canvas.addEventListener("mousedown", (e) => {
    if (g_sceneMode === 0) {
      demoDragging = true;
      demoLastX = e.clientX;
      demoLastY = e.clientY;
    } else {
      // Croc mode: shift+click poke
      if (e.shiftKey) {
        g_pokeActive = true;
        g_pokeStart = g_timeSec;
        g_pokeEnd = g_timeSec + 0.35;
      }
      crocDragging = true;
      crocLastX = e.clientX;
      crocLastY = e.clientY;
    }
  });

  window.addEventListener("mouseup", () => {
    demoDragging = false;
    crocDragging = false;
  });

  window.addEventListener("mousemove", (e) => {
    if (g_sceneMode === 0) {
      if (!demoDragging) return;
      const dx = e.clientX - demoLastX;
      const dy = e.clientY - demoLastY;
      demoLastX = e.clientX;
      demoLastY = e.clientY;
      camera.orbit(dx, dy);
    } else {
      if (!crocDragging) return;
      const dx = e.clientX - crocLastX;
      const dy = e.clientY - crocLastY;
      crocLastX = e.clientX;
      crocLastY = e.clientY;

      g_mouseRotY += dx * 0.4;
      g_mouseRotX += dy * 0.4;
      g_mouseRotX = clamp(g_mouseRotX, -85, 85);
    }
  });

  // Wheel always dolly camera (both modes)
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (g_sceneMode === 0) camera.dolly(e.deltaY);
  }, { passive: false });
}

// ---------------- Demo Scene (stable, built once) ----------------
function buildDemoSceneOnce() {
  demoModels = [];
  const colors = [
    [0.90, 0.25, 0.25],
    [0.25, 0.90, 0.25],
    [0.25, 0.25, 0.90],
  ];

  const n = 3;
  let idx = 0;
  for (let i = -n / 2; i < n / 2; i++) {
    const col = colors[idx % colors.length];
    idx++;

    const cube = new Cube(col);
    cube.setScale(0.5, 0.5, 0.5);
    cube.setTranslate(2 * i + 1.0, -0.5, 0.0);
    demoModels.push(cube);

    const sphere = new Sphere(col);
    sphere.setScale(0.5, 0.5, 0.5);
    sphere.setTranslate(2 * i + 1.0, 0.5, 0.0);
    demoModels.push(sphere);
  }
}

// ---------------- Crocodile + Habitat (ASG2 one-to-one) ----------------
function getGlobalRotationMatrix_ASG2() {
  const g = new Matrix4();
  g.rotate(g_mouseRotX, 1, 0, 0);
  g.rotate(g_globalRotY + g_mouseRotY, 0, 1, 0);
  return g;
}

function emitASG2Cube(localM, color) {
  // Bake ASG2 global rotation into the model matrix:
  const G = getGlobalRotationMatrix_ASG2();
  const W = new Matrix4(G);
  W.multiply(localM);
  // ASG2 cubes are unit-sized [-0.5, 0.5], while this ASG4 Cube uses [-1, 1].
  // Apply 0.5 scale so crocodile/habitat dimensions match ASG2 exactly.
  W.scale(0.5, 0.5, 0.5);
  return emitCube(W, color, crocModels);
}

function emitASG2Cylinder(localM, color) {
  const G = getGlobalRotationMatrix_ASG2();
  const W = new Matrix4(G);
  W.multiply(localM);
  return emitCylinder(W, color, crocModels);
}

// Habitat: drawWaterAndMud(), drawSawgrassClump(), drawMangrove() (ported 1:1)
function drawWaterAndMud_ASG2() {
  const water = [0.10, 0.38, 0.45];
  const water2 = [0.08, 0.32, 0.40];
  const mud = [0.28, 0.22, 0.16];
  const grass = [0.12, 0.42, 0.18];

  const shimmer = 0.02 * Math.sin(g_timeSec * 1.2);

  const W = new Matrix4();
  W.translate(0, -0.70, 0);
  W.scale(3.2, 0.04, 3.2);
  emitASG2Cube(W, [water[0], water[1] + shimmer, water[2] + shimmer]);

  const W2 = new Matrix4();
  W2.translate(0.7, -0.695, -0.4);
  W2.scale(1.2, 0.03, 1.0);
  emitASG2Cube(W2, water2);

  const banks = [
    { x: -1.0, z: -0.6, sx: 0.9, sz: 0.7, y: -0.66 },
    { x:  1.0, z:  0.7, sx: 0.8, sz: 0.6, y: -0.66 },
    { x:  0.1, z: -1.1, sx: 0.6, sz: 0.8, y: -0.665 },
  ];

  for (const b of banks) {
    const B = new Matrix4();
    B.translate(b.x, b.y, b.z);
    B.scale(b.sx, 0.08, b.sz);
    emitASG2Cube(B, mud);

    const G = new Matrix4();
    G.translate(b.x, b.y + 0.05, b.z);
    G.scale(b.sx * 0.95, 0.03, b.sz * 0.95);
    emitASG2Cube(G, grass);
  }
}

function drawSawgrassClump_ASG2(cx, cz, nBlades) {
  const blade = [0.16, 0.62, 0.22];
  const baseY = -0.62;
  const clumpSway = 10 * Math.sin(g_timeSec * 2.0 + cx * 1.7 + cz * 2.1);

  for (let i = 0; i < nBlades; i++) {
    const ox = (i % 4) * 0.06 - 0.09;
    const oz = ((i / 4) | 0) * 0.06 - 0.09;

    const S = new Matrix4();
    S.translate(cx + ox, baseY + 0.12, cz + oz);
    S.rotate(clumpSway, 0, 0, 1);
    S.scale(0.03, 0.28, 0.03);
    emitASG2Cube(S, blade);
  }
}

function drawMangrove_ASG2(x, z) {
  const bark = [0.22, 0.18, 0.14];
  const leaf = [0.10, 0.40, 0.16];
  const root = [0.18, 0.14, 0.10];

  // Trunk (cylinder)
  const T = new Matrix4();
  T.translate(x, -0.42, z);
  T.scale(0.10, 0.55, 0.10);
  emitASG2Cylinder(T, bark);

  // Roots (cubes)
  for (let k = 0; k < 3; k++) {
    const ang = k * 120;
    const R = new Matrix4();
    R.translate(x, -0.55, z);
    R.rotate(ang, 0, 1, 0);
    R.translate(0.14, 0.0, 0.0);
    R.rotate(35, 0, 0, 1);
    R.scale(0.05, 0.30, 0.05);
    emitASG2Cube(R, root);
  }

  // Canopy cubes
  const C = new Matrix4();
  C.translate(x, -0.10, z);
  C.scale(0.55, 0.22, 0.55);
  emitASG2Cube(C, leaf);

  const C2 = new Matrix4();
  C2.translate(x + 0.12, -0.03, z - 0.10);
  C2.scale(0.38, 0.18, 0.38);
  emitASG2Cube(C2, leaf);
}

function buildCrocodileAndHabitat_ASG2() {
  crocModels = [];

  const green = [0.15, 0.55, 0.22];
  const greenDark = [0.08, 0.35, 0.14];
  const greenMid = [0.12, 0.45, 0.18];
  const belly = [0.72, 0.78, 0.56];
  const mouthPink = [0.85, 0.45, 0.55];
  const tongueRed = [0.70, 0.22, 0.28];
  const black = [0.05, 0.05, 0.05];
  const white = [0.92, 0.92, 0.92];

  const bob = g_animOn ? Math.sin(g_timeSec * 3.2) * 0.02 : 0;

  // Habitat (1:1 calls)
  drawWaterAndMud_ASG2();
  drawSawgrassClump_ASG2(-1.05, -0.65, 10);
  drawSawgrassClump_ASG2( 1.00,  0.72, 10);
  drawSawgrassClump_ASG2( 0.15, -1.10, 8);
  drawSawgrassClump_ASG2(-0.30,  1.10, 8);
  drawMangrove_ASG2(-1.55,  1.20);
  drawMangrove_ASG2( 1.55, -1.25);

  // Crocodile root (exact)
  let M = new Matrix4();
  M.translate(0.35, -0.5 + bob, 0);
  M.scale(0.38, 0.38, 0.38);

  // Body
  pushMatrix(M);
  M.scale(1.25, 0.35, 0.55);
  emitASG2Cube(M, green);
  M = popMatrix();

  // Belly plate
  pushMatrix(M);
  M.translate(0.05, -0.10, 0);
  M.scale(0.95, 0.12, 0.42);
  emitASG2Cube(M, belly);
  M = popMatrix();

  // Neck
  let neck = new Matrix4(M);
  neck.translate(0.70, 0.08, 0);
  pushMatrix(neck);
  neck.scale(0.40, 0.22, 0.40);
  emitASG2Cube(neck, greenMid);
  neck = popMatrix();

  // Head base
  let head = new Matrix4(M);
  head.translate(1.02, 0.12, 0);
  pushMatrix(head);
  head.scale(0.55, 0.24, 0.44);
  emitASG2Cube(head, green);
  head = popMatrix();

  // Snout top
  let snout = new Matrix4(M);
  snout.translate(1.32, 0.08, 0);
  pushMatrix(snout);
  snout.scale(0.55, 0.16, 0.34);
  emitASG2Cube(snout, greenDark);
  snout = popMatrix();

  // Upper jaw ridge
  let upperJaw = new Matrix4(M);
  upperJaw.translate(1.28, 0.01, 0);
  pushMatrix(upperJaw);
  upperJaw.scale(0.62, 0.08, 0.38);
  emitASG2Cube(upperJaw, greenDark);
  upperJaw = popMatrix();

  // Lower jaw hinge chain (exact)
  let jawBase = new Matrix4(M);
  jawBase.translate(1.08, 0.02, 0);
  jawBase.rotate(-g_jaw, 0, 0, 1);
  jawBase.translate(0.26, -0.12, 0);

  // Outer lower jaw shell (shortened)
  let jawOuter = new Matrix4(jawBase);
  jawOuter.translate(-0.06, 0.0, 0.0);
  jawOuter.scale(0.62, 0.13, 0.40);
  emitASG2Cube(jawOuter, greenDark);

  // Inner mouth
  let jawInner = new Matrix4(jawBase);
  jawInner.translate(-0.06 + 0.02, 0.01, 0.0);
  jawInner.scale(0.56, 0.08, 0.34);
  emitASG2Cube(jawInner, mouthPink);

  // Tongue
  {
    let T = new Matrix4(M);
    T.translate(1.22, -0.09, 0);
    T.scale(0.40, 0.05, 0.22);
    emitASG2Cube(T, tongueRed);
  }

  // Teeth (exact count/placement)
  for (let i = 0; i < 7; i++) {
    const x = 1.12 + i * 0.08;

    const tU1 = new Matrix4(M);
    tU1.translate(x, -0.05, 0.17);
    tU1.scale(0.03, 0.05, 0.03);
    emitASG2Cube(tU1, white);

    const tU2 = new Matrix4(M);
    tU2.translate(x, -0.05, -0.17);
    tU2.scale(0.03, 0.05, 0.03);
    emitASG2Cube(tU2, white);
  }

  // Eyes (cylinders)
  {
    const eyeX = 1.33, eyeY = 0.26, eyeZ = 0.24;

    let e1 = new Matrix4(M);
    e1.translate(eyeX, eyeY, eyeZ);
    e1.scale(0.10, 0.10, 0.10);
    emitASG2Cylinder(e1, white);

    let p1 = new Matrix4(M);
    p1.translate(eyeX + 0.03, eyeY, eyeZ + 0.03);
    p1.scale(0.05, 0.05, 0.05);
    emitASG2Cylinder(p1, black);

    let e2 = new Matrix4(M);
    e2.translate(eyeX, eyeY, -eyeZ);
    e2.scale(0.10, 0.10, 0.10);
    emitASG2Cylinder(e2, white);

    let p2 = new Matrix4(M);
    p2.translate(eyeX + 0.03, eyeY, -(eyeZ + 0.03));
    p2.scale(0.05, 0.05, 0.05);
    emitASG2Cylinder(p2, black);
  }

  // Nostrils (cylinders)
  {
    let n1 = new Matrix4(M);
    n1.translate(1.62, 0.10, 0.12);
    n1.scale(0.06, 0.04, 0.06);
    emitASG2Cylinder(n1, black);

    let n2 = new Matrix4(M);
    n2.translate(1.62, 0.10, -0.12);
    n2.scale(0.06, 0.04, 0.06);
    emitASG2Cylinder(n2, black);
  }

  // Tail (exact)
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
    emitASG2Cube(segM, greenDark);

    const spike = new Matrix4(tail);
    spike.translate(0.0, 0.20, 0.0);
    spike.scale(0.10, 0.12, 0.10);
    emitASG2Cube(spike, greenDark);

    tail.translate(-s.len * 0.5, 0, 0);
  }

  // Dorsal spikes (exact)
  for (let i = 0; i < 7; i++) {
    const s = new Matrix4(M);
    s.translate(-0.55 + i * 0.23, 0.22, 0);
    s.scale(0.10, 0.12, 0.10);
    emitASG2Cube(s, greenDark);
  }

  // Legs (exact functions ported)
  drawFrontLeftLeg_ASG2(M, greenDark);

  const gait = g_animOn ? Math.sin(g_timeSec * 3.2) * 14 : 0;
  drawLegWithToes_ASG2(M,  0.45, -0.10,  0.23, -gait, greenDark);   // front-right
  drawLegWithToes_ASG2(M, -0.35, -0.10,  0.23,  gait, greenDark);   // back-right
  drawLegWithToes_ASG2(M, -0.35, -0.10, -0.23, -gait, greenDark);   // back-left
}

function drawFrontLeftLeg_ASG2(bodyMatrix, rgb) {
  let hipM = new Matrix4(bodyMatrix);
  hipM.translate(0.45, -0.08, -0.23);
  hipM.rotate(g_hip, 0, 0, 1);

  pushMatrix(hipM);
  hipM.translate(0.06, -0.20, 0);
  hipM.scale(0.14, 0.30, 0.14);
  emitASG2Cube(hipM, rgb);
  hipM = popMatrix();

  let kneeM = new Matrix4(hipM);
  kneeM.translate(0.00, -0.30, 0);
  kneeM.rotate(g_knee, 0, 0, 1);

  pushMatrix(kneeM);
  kneeM.translate(0.04, -0.18, 0);
  kneeM.scale(0.12, 0.26, 0.12);
  emitASG2Cube(kneeM, rgb);
  kneeM = popMatrix();

  let ankleM = new Matrix4(kneeM);
  ankleM.translate(0.00, -0.26, 0);
  ankleM.rotate(g_ankle, 0, 0, 1);

  const foot = new Matrix4(ankleM);
  foot.translate(0.11, -0.05, 0);
  foot.scale(0.24, 0.08, 0.16);
  emitASG2Cube(foot, rgb);

  for (let i = -1; i <= 1; i++) {
    const toe = new Matrix4(ankleM);
    toe.translate(0.23, -0.07, i * 0.06);
    toe.scale(0.06, 0.04, 0.04);
    emitASG2Cube(toe, rgb);
  }
}

function drawLegWithToes_ASG2(bodyMatrix, x, y, z, swingDeg, rgb) {
  let M = new Matrix4(bodyMatrix);
  M.translate(x, y, z);
  M.rotate(swingDeg, 0, 0, 1);

  pushMatrix(M);
  M.translate(0.03, -0.18, 0);
  M.scale(0.12, 0.26, 0.12);
  emitASG2Cube(M, rgb);
  M = popMatrix();

  let L = new Matrix4(M);
  L.translate(0.0, -0.26, 0);
  L.rotate(-25, 0, 0, 1);

  pushMatrix(L);
  L.translate(0.03, -0.16, 0);
  L.scale(0.10, 0.22, 0.10);
  emitASG2Cube(L, rgb);
  L = popMatrix();

  const F = new Matrix4(L);
  F.translate(0.10, -0.02, 0);
  F.scale(0.22, 0.08, 0.14);
  emitASG2Cube(F, rgb);

  for (let i = -1; i <= 1; i++) {
    const toe = new Matrix4(L);
    toe.translate(0.20, -0.05, i * 0.05);
    toe.scale(0.06, 0.04, 0.04);
    emitASG2Cube(toe, rgb);
  }
}

// ---------------- UI Construction for ASG2 Panel ----------------
function ensureUI() {
  if (uiContainer) return;

  uiContainer = document.createElement("div");
  uiContainer.style.marginTop = "10px";
  document.body.appendChild(uiContainer);

  // Scene toggle
  uiSceneBtn = document.createElement("button");
  uiSceneBtn.textContent = "Toggle Scene (Demo ↔ Crocodile) [Space]";
  uiSceneBtn.onclick = toggleScene;
  uiSceneBtn.style.marginRight = "10px";
  uiContainer.appendChild(uiSceneBtn);

  // ASG2 panel
  uiAsg2Panel = document.createElement("div");
  uiAsg2Panel.style.marginTop = "10px";
  uiAsg2Panel.style.padding = "10px";
  uiAsg2Panel.style.border = "1px solid #333";
  uiAsg2Panel.style.maxWidth = "920px";
  uiAsg2Panel.style.display = "none"; // only in croc mode
  uiContainer.appendChild(uiAsg2Panel);

  const title = document.createElement("div");
  title.textContent = "ASG2 Controls (Crocodile Mode)";
  title.style.marginBottom = "8px";
  uiAsg2Panel.appendChild(title);

  function addSlider(labelText, min, max, value, onInput) {
    const row = document.createElement("div");
    row.style.margin = "6px 0";
    const label = document.createElement("label");
    label.style.display = "inline-flex";
    label.style.gap = "10px";
    label.style.alignItems = "center";

    const span = document.createElement("span");
    span.textContent = labelText;
    span.style.width = "140px";

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.style.width = "220px";

    const val = document.createElement("span");
    val.textContent = String(value);
    val.style.width = "48px";

    input.addEventListener("input", () => {
      const v = Number(input.value);
      val.textContent = String(v);
      onInput(v);
    });

    label.appendChild(span);
    label.appendChild(input);
    label.appendChild(val);

    row.appendChild(label);
    uiAsg2Panel.appendChild(row);
  }

  addSlider("Global Rotate (Y)", -180, 180, g_globalRotY, (v) => { g_globalRotY = v; });
  addSlider("Hip", -60, 60, g_hipBase, (v) => { g_hipBase = v; });
  addSlider("Knee", -90, 0, g_kneeBase, (v) => { g_kneeBase = v; });
  addSlider("Ankle", -60, 60, g_ankleBase, (v) => { g_ankleBase = v; });
  addSlider("Jaw", 0, 45, g_jawBase, (v) => { g_jawBase = v; });

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "10px";
  row.style.alignItems = "center";
  row.style.marginTop = "8px";

  const onBtn = document.createElement("button");
  onBtn.textContent = "Animation ON";
  onBtn.onclick = () => { g_animOn = true; };

  const offBtn = document.createElement("button");
  offBtn.textContent = "Animation OFF";
  offBtn.onclick = () => { g_animOn = false; updateAnimationAngles(); };

  uiFps = document.createElement("div");
  uiFps.textContent = "FPS: --";
  uiFps.style.opacity = "0.9";
  uiFps.style.fontVariantNumeric = "tabular-nums";

  row.appendChild(onBtn);
  row.appendChild(offBtn);
  row.appendChild(uiFps);
  uiAsg2Panel.appendChild(row);

  const hint = document.createElement("div");
  hint.style.opacity = "0.9";
  hint.style.fontSize = "13px";
  hint.style.marginTop = "8px";
  hint.innerHTML = "Mouse-drag on canvas to rotate (X/Y).<br/>Shift + click = “poke” animation.";
  uiAsg2Panel.appendChild(hint);
}

function syncModeUIVisibility() {
  ensureUI();
  if (!uiAsg2Panel) return;
  uiAsg2Panel.style.display = (g_sceneMode === 1) ? "block" : "none";
}

// ---------------- Main Draw Loop ----------------
function draw(nowMs) {
  // Timing / fps (for croc mode)
  if (!g_lastFrameMs) g_lastFrameMs = nowMs;
  const dt = (nowMs - g_lastFrameMs) / 1000.0;
  g_lastFrameMs = nowMs;

  const fps = dt > 0 ? (1.0 / dt) : 0;
  g_fpsSmoothed = g_fpsSmoothed ? (0.9 * g_fpsSmoothed + 0.1 * fps) : fps;

  if (g_sceneMode === 1 && uiFps) uiFps.textContent = "FPS: " + g_fpsSmoothed.toFixed(1);

  if (g_animOn && g_sceneMode === 1) g_timeSec += dt;

  if (g_sceneMode === 1) updateAnimationAngles();

  if (g_sceneMode === 1) {
    applyASG2CameraPose();
    gl.clearColor(0.55, 0.80, 0.92, 1.0);
  } else {
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
  }
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.uniform3fv(u_eyePos, camera.eye.elements);
  gl.uniformMatrix4fv(u_ViewMatrix, false, camera.viewMatrix.elements);
  gl.uniformMatrix4fv(u_ProjMatrix, false, camera.projMatrix.elements);

  updateLights();

  // Build current scene model list (marker + scene models)
  models = [];

  // Keep crocodile mode visually identical to ASG2 (no light marker cube).
  if (g_sceneMode === 0) models.push(lightMarker);

  if (g_sceneMode === 0) {
    // Demo: stable models, no rebuild flicker
    for (const m of demoModels) models.push(m);
  } else {
    // Crocodile: rebuild each frame to animate
    buildCrocodileAndHabitat_ASG2();
    for (const m of crocModels) models.push(m);
  }

  if (g_sceneMode === 0 && objModel && objEnabled) {
    applyOBJPlacement();
    models.push(objModel);
  }

  // Draw all
  for (const m of models) {
    if (m === lightMarker) {
      drawModel(m, { color: [1.0, 1.0, 1.0], lightingEnabled: false });
    } else {
      drawModel(m);
    }
  }

  requestAnimationFrame(draw);
}

// ---------------- Main ----------------
function main() {
  canvas = document.getElementById("canvas");
  gl = canvas.getContext("webgl");
  if (!gl) {
    console.log("Failed to get webgl context");
    return;
  }

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  if (!initShaders(gl, VSHADER, FSHADER)) {
    console.log("Failed to initialize shaders.");
    return;
  }

  // Uniforms
  u_ModelMatrix = gl.getUniformLocation(gl.program, "u_ModelMatrix");
  u_ViewMatrix = gl.getUniformLocation(gl.program, "u_ViewMatrix");
  u_ProjMatrix = gl.getUniformLocation(gl.program, "u_ProjMatrix");
  u_NormalMatrix = gl.getUniformLocation(gl.program, "u_NormalMatrix");

  u_Color = gl.getUniformLocation(gl.program, "u_Color");
  u_ambientK = gl.getUniformLocation(gl.program, "u_ambientK");
  u_diffuseK = gl.getUniformLocation(gl.program, "u_diffuseK");
  u_specularK = gl.getUniformLocation(gl.program, "u_specularK");

  u_lightPos = gl.getUniformLocation(gl.program, "u_lightPos");
  u_eyePos = gl.getUniformLocation(gl.program, "u_eyePos");
  u_lightColor = gl.getUniformLocation(gl.program, "u_lightColor");

  u_LightingEnabled = gl.getUniformLocation(gl.program, "u_LightingEnabled");
  u_ShowNormals = gl.getUniformLocation(gl.program, "u_ShowNormals");
  u_PointEnabled = gl.getUniformLocation(gl.program, "u_PointEnabled");

  u_SpotEnabled = gl.getUniformLocation(gl.program, "u_SpotEnabled");
  u_SpotPos = gl.getUniformLocation(gl.program, "u_SpotPos");
  u_SpotDir = gl.getUniformLocation(gl.program, "u_SpotDir");
  u_SpotCutoff = gl.getUniformLocation(gl.program, "u_SpotCutoff");
  u_SpotOuterCutoff = gl.getUniformLocation(gl.program, "u_SpotOuterCutoff");

  // Buffers
  vertexBuffer = initBuffer("a_Position", 3);
  normalBuffer = initBuffer("a_Normal", 3);

  indexBuffer = gl.createBuffer();
  if (!indexBuffer) {
    console.log("Can't create index buffer.");
    return;
  }

  // Phong coefficients
  gl.uniform3f(u_ambientK, 0.2, 0.2, 0.2);
  gl.uniform3f(u_diffuseK, 0.8, 0.8, 0.8);
  gl.uniform3f(u_specularK, 1.0, 1.0, 1.0);

  // Spotlight cone (requirement)
  const innerDeg = 15.0;
  const outerDeg = 25.0;
  gl.uniform1f(u_SpotCutoff, Math.cos(innerDeg * Math.PI / 180.0));
  gl.uniform1f(u_SpotOuterCutoff, Math.cos(outerDeg * Math.PI / 180.0));

  // Camera
  camera = new Camera();
  if (g_sceneMode === 1) applyASG2CameraPose();

  // UI initial values (if your ASG4 HTML has these controls)
  if (document.getElementById("lightXSlider")) onLightXInput(document.getElementById("lightXSlider").value);
  if (document.getElementById("lightR")) onLightColorInput();
  setOBJStatus("OBJ: not loaded");

  // Light marker cube
  lightMarker = new Cube([1.0, 1.0, 1.0]);
  lightMarker.setScale(0.08, 0.08, 0.08);
  lightMarker.setTranslate(lightPos[0], lightPos[1], lightPos[2]);

  // Demo scene built once (fixes flashing)
  buildDemoSceneOnce();

  // Dynamic ASG2 controls panel + scene toggle
  ensureUI();
  syncModeUIVisibility();

  // Mouse hooks (demo orbit / croc rotate)
  hookMouse();

  // Load default OBJ model for rubric requirement
  loadDefaultOBJ();

  requestAnimationFrame(draw);
}
