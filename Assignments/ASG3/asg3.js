// asg3.js

// ===================== Shaders =====================
var VERTEX_SHADER = `
precision mediump float;

attribute vec3 a_Position;
attribute vec3 a_Color;
attribute vec2 a_UV;

varying vec3 v_Color;
varying vec2 v_UV;

uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

void main() {
  v_Color = a_Color;
  v_UV = a_UV;
  gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * vec4(a_Position, 1.0);
}
`;

var FRAGMENT_SHADER = `
precision mediump float;

varying vec3 v_Color;
varying vec2 v_UV;

uniform sampler2D u_Sampler0;
uniform sampler2D u_Sampler1;
uniform sampler2D u_Sampler2;

uniform int u_WhichTexture;      // 0,1,2
uniform vec4 u_BaseColor;        // base color for sky/goal/etc
uniform float u_TexColorWeight;  // 0 = base only, 1 = texture only

vec4 sampleTex() {
  if (u_WhichTexture == 0) return texture2D(u_Sampler0, v_UV);
  if (u_WhichTexture == 1) return texture2D(u_Sampler1, v_UV);
  return texture2D(u_Sampler2, v_UV);
}

void main() {
  vec4 texColor = sampleTex();
  vec4 base = u_BaseColor * vec4(v_Color, 1.0);
  gl_FragColor = mix(base, texColor, u_TexColorWeight);
}
`;

// ===================== Globals =====================
let gl = null;

const WORLD_SIZE = 32;
const MAX_HEIGHT = 4;

const GOAL_X = 28;
const GOAL_Z = 28;

let camera = null;
let cubeMesh = null;

let a_Position = -1, a_Color = -1, a_UV = -1;
let u_ModelMatrix = null, u_ViewMatrix = null, u_ProjectionMatrix = null;
let u_Sampler0 = null, u_Sampler1 = null, u_Sampler2 = null;
let u_WhichTexture = null, u_BaseColor = null, u_TexColorWeight = null;

let vertexBuffer = null;

let keys = Object.create(null);
let dragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

let worldMap = null;

let gameWon = false;
const goalCell = { x: GOAL_X, z: GOAL_Z };

// Render-distance culling to keep FPS up
const RENDER_RADIUS = 13;

// ===================== Utilities =====================
function $(id) { return document.getElementById(id); }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function isPowerOf2(x) { return (x & (x - 1)) === 0; }

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg;
}

function distXZ(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx*dx + dz*dz);
}

// ===================== Shrine Accessibility / Courtyard =====================
// - Clears inside area so shrine is visible.
// - Builds a small brick ring wall around it.
// - Cuts an obvious doorway ("hole") and a short path outward.
function buildShrineCourtyard(m) {
  const gx = GOAL_X;
  const gz = GOAL_Z;

  // 1) Clear a 5x5 interior around shrine
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = gx + dx;
      const z = gz + dz;
      if (x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE) {
        m[z][x] = 0;
      }
    }
  }

  // 2) Build a 7x7 perimeter ring wall (height 2) around that interior
  const ring = 3;
  const wallH = 2;
  for (let dz = -ring; dz <= ring; dz++) {
    for (let dx = -ring; dx <= ring; dx++) {
      const x = gx + dx;
      const z = gz + dz;
      if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE) continue;

      const onPerimeter = (Math.abs(dx) === ring || Math.abs(dz) === ring);
      if (onPerimeter) m[z][x] = wallH;
    }
  }

  // 3) Cut a doorway (a "hole") on the north side of the ring (toward smaller z)
  // Door width 2 so it's very obvious.
  const doorZ = gz - ring;
  const doorX0 = gx;
  const doorX1 = gx + 1;

  if (doorZ >= 0) {
    if (doorX0 >= 0 && doorX0 < WORLD_SIZE) m[doorZ][doorX0] = 0;
    if (doorX1 >= 0 && doorX1 < WORLD_SIZE) m[doorZ][doorX1] = 0;
  }

  // 4) Carve a short path leading out from the doorway
  for (let k = 1; k <= 6; k++) {
    const z = doorZ - k;
    if (z < 0) break;
    if (doorX0 >= 0 && doorX0 < WORLD_SIZE) m[z][doorX0] = 0;
    if (doorX1 >= 0 && doorX1 < WORLD_SIZE) m[z][doorX1] = 0;
  }

  // Ensure the shrine cell itself is empty (shrine is drawn separately)
  m[gz][gx] = 0;
}

// ===================== Map (hardcoded 32x32 heights 0..4) =====================
function buildWorldMap() {
  const m = [
    [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],

    [3,0,0,0,2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0,2,2,2,2,2,2,2,2,0,0,0,3],
    [3,0,0,0,2,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,2,0,0,0,3],
    [3,0,0,0,2,0,4,0,0,0,0,2,0,0,0,0,0,0,0,0,2,0,0,0,0,4,0,2,0,0,0,3],
    [3,0,0,0,2,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,2,0,0,0,3],

    [3,0,0,0,2,2,2,2,0,2,2,2,2,2,2,0,0,2,2,2,2,2,2,0,2,2,2,2,0,0,0,3],
    [3,0,0,0,0,0,0,2,0,2,0,0,0,0,2,0,0,2,0,0,0,0,2,0,2,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,2,0,2,0,0,0,0,2,0,0,2,0,0,0,0,2,0,2,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,2,0,2,2,2,2,2,2,0,0,2,2,2,2,2,2,0,2,0,0,0,0,0,0,3],

    [3,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,2,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,2,0,0,0,0,0,0,3],
    [3,0,0,0,2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0,2,2,2,2,2,2,2,2,0,0,0,3],

    [3,0,0,0,2,0,0,0,0,0,0,2,0,0,1,1,1,1,0,0,2,0,0,0,0,0,0,2,0,0,0,3],
    [3,0,0,0,2,0,0,0,0,0,0,2,0,0,1,0,0,1,0,0,2,0,0,0,0,0,0,2,0,0,0,3],
    [3,0,0,0,2,0,0,0,0,0,0,2,0,0,1,0,0,1,0,0,2,0,0,0,0,0,0,2,0,0,0,3],
    [3,0,0,0,2,2,2,2,2,2,2,2,0,0,1,1,1,1,0,0,2,2,2,2,2,2,2,2,0,0,0,3],

    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],

    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],

    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,3,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,3,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,3,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,3,0,3],

    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,3,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,3,0,3],
    [3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3],
    [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
  ];

  buildShrineCourtyard(m);
  return m;
}

// ===================== Texture Loading (multi-texture from 1 image) =====================
function createTintedCanvas(img, rMul, gMul, bMul) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i + 0] = Math.min(255, d[i + 0] * rMul);
    d[i + 1] = Math.min(255, d[i + 1] * gMul);
    d[i + 2] = Math.min(255, d[i + 2] * bMul);
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

function uploadTextureToUnit(unitIndex, samplerUniform, source) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unitIndex);
  gl.bindTexture(gl.TEXTURE_2D, tex);

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

  const w = source.width, h = source.height;
  const pow2 = isPowerOf2(w) && isPowerOf2(h);

  if (pow2) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  gl.uniform1i(samplerUniform, unitIndex);
}

function loadTexturesThenStart() {
  const img = new Image();
  img.src = "textures/block.jpg";
  img.onload = function () {
    const green = createTintedCanvas(img, 0.7, 1.2, 0.7);
    const gray  = createTintedCanvas(img, 0.9, 0.9, 0.9);

    uploadTextureToUnit(0, u_Sampler0, img);
    uploadTextureToUnit(1, u_Sampler1, green);
    uploadTextureToUnit(2, u_Sampler2, gray);

    setStatus("Shrine courtyard has a doorway + tall beacon.");
    requestAnimationFrame(tick);
  };

  img.onerror = function () {
    setStatus("Failed to load textures/block.jpg (check web server + path).");
  };
}

// ===================== Drawing =====================
function bindCubeBufferOnce() {
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cubeMesh.vertices, gl.STATIC_DRAW);

  const FLOAT_SIZE = Float32Array.BYTES_PER_ELEMENT;

  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 8 * FLOAT_SIZE, 0 * FLOAT_SIZE);
  gl.enableVertexAttribArray(a_Position);

  gl.vertexAttribPointer(a_Color, 3, gl.FLOAT, false, 8 * FLOAT_SIZE, 3 * FLOAT_SIZE);
  gl.enableVertexAttribArray(a_Color);

  gl.vertexAttribPointer(a_UV, 2, gl.FLOAT, false, 8 * FLOAT_SIZE, 6 * FLOAT_SIZE);
  gl.enableVertexAttribArray(a_UV);
}

const reusableModel = new Matrix4();

function drawCubeWorld(cx, cy, cz, sx, sy, sz, whichTex, baseColorRGBA, texWeight) {
  reusableModel.setIdentity();
  reusableModel.translate(cx, cy, cz);
  reusableModel.scale(sx, sy, sz);

  gl.uniformMatrix4fv(u_ModelMatrix, false, reusableModel.elements);
  gl.uniform1i(u_WhichTexture, whichTex);
  gl.uniform4f(u_BaseColor, baseColorRGBA[0], baseColorRGBA[1], baseColorRGBA[2], baseColorRGBA[3]);
  gl.uniform1f(u_TexColorWeight, texWeight);

  gl.drawArrays(gl.TRIANGLES, 0, cubeMesh.vertices.length / 8);
}

function drawSkyAndGround() {
  const center = WORLD_SIZE / 2;
  drawCubeWorld(center, 2.0, center, 60, 60, 60, 0, [0.22, 0.45, 0.90, 1.0], 0.0);

  const thickness = 0.05;
  drawCubeWorld(center, -thickness, center, WORLD_SIZE / 2, thickness, WORLD_SIZE / 2, 1, [1, 1, 1, 1], 1.0);
}

function wallTextureForHeight(h) {
  if (h >= 3) return 2;
  return 0;
}

function drawWorldWalls() {
  const ex = camera.eye.elements[0];
  const ez = camera.eye.elements[2];

  for (let z = 0; z < WORLD_SIZE; z++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const h = worldMap[z][x];
      if (h <= 0) continue;

      const cellCenterX = x + 0.5;
      const cellCenterZ = z + 0.5;

      if (distXZ(ex, ez, cellCenterX, cellCenterZ) > RENDER_RADIUS) continue;

      const whichTex = wallTextureForHeight(h);

      for (let y = 0; y < h; y++) {
        drawCubeWorld(cellCenterX, y + 0.5, cellCenterZ, 0.5, 0.5, 0.5, whichTex, [1, 1, 1, 1], 1.0);
      }
    }
  }
}

function drawGoalShrine() {
  const gx = goalCell.x + 0.5;
  const gz = goalCell.z + 0.5;

  drawCubeWorld(gx, 0.5, gz, 0.5, 0.5, 0.5, 2, [1, 1, 1, 1], 1.0);
  drawCubeWorld(gx, 1.5, gz, 0.35, 0.35, 0.35, 0, [1.0, 0.85, 0.15, 1.0], 0.0);

  // Beacon (very visible)
  drawCubeWorld(gx, 3.0, gz, 0.12, 2.0, 0.12, 0, [1.0, 0.95, 0.25, 1.0], 0.0);
  drawCubeWorld(gx, 5.2, gz, 0.25, 0.25, 0.25, 0, [1.0, 0.95, 0.25, 1.0], 0.0);
}

// ===================== Add/Delete Blocks =====================
function getCellInFront() {
  const ex = camera.eye.elements[0];
  const ez = camera.eye.elements[2];

  const cx = Math.floor(ex);
  const cz = Math.floor(ez);

  const fx = camera.at.elements[0] - ex;
  const fz = camera.at.elements[2] - ez;

  const stepX = fx >= 0 ? 1 : -1;
  const stepZ = fz >= 0 ? 1 : -1;

  let tx = cx;
  let tz = cz;

  if (Math.abs(fx) >= Math.abs(fz)) tx += stepX;
  else tz += stepZ;

  if (tx < 0 || tx >= WORLD_SIZE || tz < 0 || tz >= WORLD_SIZE) return null;
  return { x: tx, z: tz };
}

function addBlockInFront() {
  const c = getCellInFront();
  if (!c) return;

  const current = worldMap[c.z][c.x];
  if (current < MAX_HEIGHT) worldMap[c.z][c.x] = current + 1;
}

function deleteBlockInFront() {
  const c = getCellInFront();
  if (!c) return;

  const current = worldMap[c.z][c.x];
  if (current > 0) worldMap[c.z][c.x] = current - 1;
}

// ===================== Collision =====================
function cellHeightAt(x, z) {
  if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE) return MAX_HEIGHT;
  return worldMap[z][x];
}

function isSolidCell(x, z) {
  return cellHeightAt(x, z) > 0;
}

function collidesAt(px, pz) {
  const r = 0.22;

  const x0 = Math.floor(px - r);
  const x1 = Math.floor(px + r);
  const z0 = Math.floor(pz - r);
  const z1 = Math.floor(pz + r);

  return (
    isSolidCell(x0, z0) ||
    isSolidCell(x1, z0) ||
    isSolidCell(x0, z1) ||
    isSolidCell(x1, z1)
  );
}

function tryMoveTo(nx, nz) {
  if (collidesAt(nx, nz)) return;

  camera.eye.elements[0] = nx;
  camera.eye.elements[2] = nz;
  camera.eye.elements[1] = 1.6;

  camera.sync();
}

// ===================== Input & Game Loop =====================
function onKeyDown(ev) {
  const k = ev.key.toLowerCase();
  keys[k] = true;

  if (k === "r") addBlockInFront();
  if (k === "f") deleteBlockInFront();
}

function onKeyUp(ev) {
  keys[ev.key.toLowerCase()] = false;
}

function setupMouse(canvas) {
  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;

    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    const sens = 0.15;

    // Horizontal: drag right => look right
    let yawDeg = clamp(dx * sens, -20, 20);
    if (yawDeg > 0) camera.panRight(yawDeg);
    else camera.panLeft(-yawDeg);

    // Vertical: drag up => look up (dy is negative when moving up)
    let pitchDeg = clamp((-dy) * sens, -20, 20);
    if (pitchDeg > 0) camera.panUp(pitchDeg);
    else camera.panDown(-pitchDeg);
  });
}

function clampCameraToWorld() {
  const margin = 0.3;
  camera.eye.elements[0] = clamp(camera.eye.elements[0], margin, WORLD_SIZE - margin);
  camera.eye.elements[2] = clamp(camera.eye.elements[2], margin, WORLD_SIZE - margin);
  camera.eye.elements[1] = 1.6;
  camera.sync();
}

function stepMovement() {
  const moveSpeed = 0.16;
  const rotSpeed = 2.5;

  // Standard: Q = turn left, E = turn right
  if (keys["q"]) camera.panLeft(rotSpeed);
  if (keys["e"]) camera.panRight(rotSpeed);

  const ex = camera.eye.elements[0];
  const ez = camera.eye.elements[2];

  let fx = camera.at.elements[0] - ex;
  let fz = camera.at.elements[2] - ez;
  const fl = Math.sqrt(fx * fx + fz * fz) || 1.0;
  fx /= fl; fz /= fl;

  const rx = -fz;
  const rz = fx;

  let dx = 0;
  let dz = 0;

  if (keys["w"]) { dx += fx; dz += fz; }
  if (keys["s"]) { dx -= fx; dz -= fz; }
  if (keys["d"]) { dx += rx; dz += rz; }
  if (keys["a"]) { dx -= rx; dz -= rz; }

  const dl = Math.sqrt(dx * dx + dz * dz);
  if (dl > 0) {
    dx = (dx / dl) * moveSpeed;
    dz = (dz / dl) * moveSpeed;

    const nx = ex + dx;
    const nz = ez + dz;

    if (!collidesAt(nx, nz)) {
      tryMoveTo(nx, nz);
    } else {
      if (!collidesAt(ex + dx, ez)) tryMoveTo(ex + dx, ez);
      else if (!collidesAt(ex, ez + dz)) tryMoveTo(ex, ez + dz);
    }
  }

  clampCameraToWorld();
}

function checkGoal() {
  if (gameWon) return;

  const ex = camera.eye.elements[0];
  const ez = camera.eye.elements[2];
  const gx = goalCell.x + 0.5;
  const gz = goalCell.z + 0.5;

  if (distXZ(ex, ez, gx, gz) < 1.25) {
    gameWon = true;
    setStatus("✅ You found the shrine!");
  }
}

function render() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.uniformMatrix4fv(u_ViewMatrix, false, camera.viewMatrix.elements);
  gl.uniformMatrix4fv(u_ProjectionMatrix, false, camera.projectionMatrix.elements);

  drawSkyAndGround();
  drawWorldWalls();
  drawGoalShrine();
}

function tick() {
  try {
    stepMovement();
    checkGoal();
    render();
  } catch (e) {
    console.error(e);
    setStatus("JS error: " + (e && e.message ? e.message : e));
  }
  requestAnimationFrame(tick);
}

// ===================== Main =====================
function main() {
  const canvas = document.getElementById("webgl");

  gl = getWebGLContext(canvas);
  if (!gl) {
    setStatus("Failed to get WebGL context.");
    return;
  }

  gl.viewport(0, 0, canvas.width, canvas.height);

  canvas.tabIndex = 0;
  canvas.focus();
  canvas.addEventListener("click", () => canvas.focus());

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  if (!initShaders(gl, VERTEX_SHADER, FRAGMENT_SHADER)) {
    setStatus("Failed to compile/load shaders.");
    return;
  }

  a_Position = gl.getAttribLocation(gl.program, "a_Position");
  a_Color    = gl.getAttribLocation(gl.program, "a_Color");
  a_UV       = gl.getAttribLocation(gl.program, "a_UV");

  u_ModelMatrix      = gl.getUniformLocation(gl.program, "u_ModelMatrix");
  u_ViewMatrix       = gl.getUniformLocation(gl.program, "u_ViewMatrix");
  u_ProjectionMatrix = gl.getUniformLocation(gl.program, "u_ProjectionMatrix");

  u_Sampler0 = gl.getUniformLocation(gl.program, "u_Sampler0");
  u_Sampler1 = gl.getUniformLocation(gl.program, "u_Sampler1");
  u_Sampler2 = gl.getUniformLocation(gl.program, "u_Sampler2");

  u_WhichTexture   = gl.getUniformLocation(gl.program, "u_WhichTexture");
  u_BaseColor      = gl.getUniformLocation(gl.program, "u_BaseColor");
  u_TexColorWeight = gl.getUniformLocation(gl.program, "u_TexColorWeight");

  vertexBuffer = gl.createBuffer();
  if (!vertexBuffer) {
    setStatus("Failed to create vertex buffer.");
    return;
  }

  cubeMesh = new cube();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  bindCubeBufferOnce();

  camera = new Camera(canvas.width / canvas.height, 0.1, 1000);

  worldMap = buildWorldMap();

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  setupMouse(canvas);

  loadTexturesThenStart();
}
