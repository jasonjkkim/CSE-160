// ===================== Shaders =====================
const VERTEX_SHADER = `
  precision mediump float;
  attribute vec4 a_Position;
  uniform float u_Size;
  void main() {
    gl_Position = a_Position;
    gl_PointSize = u_Size;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec4 u_FragColor;
  void main() {
    gl_FragColor = u_FragColor;
  }
`;

// ===================== Globals =====================
let canvas;
let gl;

let a_Position;
let u_FragColor;
let u_Size;

let shapesList = [];

let currentType = "point";               // "point" | "triangle" | "circle"
let currentColor = [0.0, 0.5, 1.0, 1.0]; // rgba
let currentSize = 10.0;
let currentSegments = 12;

let mouseDown = false;

// ===================== Shape Classes =====================
class Point {
  constructor(position, color, size) {
    this.position = position; // [x,y]
    this.color = color;       // [r,g,b,a]
    this.size = size;
  }

  render() {
    gl.uniform4f(u_FragColor, this.color[0], this.color[1], this.color[2], this.color[3]);
    gl.uniform1f(u_Size, this.size);

    // IMPORTANT: points use a constant vertex attribute (no buffer)
    gl.disableVertexAttribArray(a_Position);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.vertexAttrib3f(a_Position, this.position[0], this.position[1], 0.0);
    gl.drawArrays(gl.POINTS, 0, 1);
  }
}

class Triangle {
  // vertices: [x1,y1,x2,y2,x3,y3]
  constructor(vertices, color) {
    this.vertices = vertices;
    this.color = color;
  }

  render() {
    gl.uniform4f(u_FragColor, this.color[0], this.color[1], this.color[2], this.color[3]);
    gl.uniform1f(u_Size, 1.0); // size not relevant for triangles

    const verts = new Float32Array([
      this.vertices[0], this.vertices[1],
      this.vertices[2], this.vertices[3],
      this.vertices[4], this.vertices[5],
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);

    gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_Position);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // IMPORTANT: reset state so points can draw without buffers
    gl.disableVertexAttribArray(a_Position);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.deleteBuffer(buffer);
  }
}

class Circle {
  constructor(center, color, size, segments) {
    this.center = center;     // [x,y]
    this.color = color;       // [r,g,b,a]
    this.size = size;         // interpreted as radius-ish
    this.segments = segments; // >= 3
  }

  render() {
    gl.uniform4f(u_FragColor, this.color[0], this.color[1], this.color[2], this.color[3]);
    gl.uniform1f(u_Size, 1.0);

    const [cx, cy] = this.center;
    const r = this.size / 200.0; // map slider-ish pixels to clip space radius
    const n = Math.max(3, this.segments);

    const verts = [];
    verts.push(cx, cy);

    for (let i = 0; i <= n; i++) {
      const angle = (i / n) * Math.PI * 2.0;
      verts.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);

    gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_Position);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, verts.length / 2);

    // IMPORTANT: reset state so points can draw without buffers
    gl.disableVertexAttribArray(a_Position);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.deleteBuffer(buffer);
  }
}

// ===================== Required Structure Functions =====================
function setupWebGL() {
  canvas = document.getElementById("webgl");
  gl = getWebGLContext(canvas, { preserveDrawingBuffer: true });
  if (!gl) {
    console.log("Failed to get the rendering context for WebGL");
    return false;
  }
  return true;
}

function connectVariablesToGLSL() {
  if (!initShaders(gl, VERTEX_SHADER, FRAGMENT_SHADER)) {
    console.log("Failed to initialize shaders.");
    return false;
  }

  a_Position = gl.getAttribLocation(gl.program, "a_Position");
  u_FragColor = gl.getUniformLocation(gl.program, "u_FragColor");
  u_Size = gl.getUniformLocation(gl.program, "u_Size");

  if (a_Position < 0 || !u_FragColor || !u_Size) {
    console.log("Failed to get the storage location of GLSL variables");
    return false;
  }

  // Start in "constant attribute" mode (good for points)
  gl.disableVertexAttribArray(a_Position);

  return true;
}

function addActionsForHtmlUI() {
  // Mode buttons (always stop drawing when switching)
  const pointBtn = document.getElementById("pointButton");
  const triBtn = document.getElementById("triButton");
  const circleBtn = document.getElementById("circleButton");

  if (pointBtn) pointBtn.onclick = () => { mouseDown = false; currentType = "point"; };
  if (triBtn) triBtn.onclick = () => { mouseDown = false; currentType = "triangle"; };
  if (circleBtn) circleBtn.onclick = () => { mouseDown = false; currentType = "circle"; };

  // Clear (force stop drawing; prevent click from interacting with drag state)
  const clearBtn = document.getElementById("clearButton");
  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      mouseDown = false;
      shapesList = [];
      renderAllShapes();
    });
  }

  // Sliders
  const updateColor = () => {
    const r = (document.getElementById("redS")?.value ?? 0) / 100;
    const g = (document.getElementById("greenS")?.value ?? 50) / 100;
    const b = (document.getElementById("blueS")?.value ?? 100) / 100;
    currentColor = [r, g, b, 1.0];
  };

  const rS = document.getElementById("redS");
  const gS = document.getElementById("greenS");
  const bS = document.getElementById("blueS");
  if (rS) rS.addEventListener("input", updateColor);
  if (gS) gS.addEventListener("input", updateColor);
  if (bS) bS.addEventListener("input", updateColor);
  updateColor();

  const sizeS = document.getElementById("sizeS");
  if (sizeS) {
    sizeS.addEventListener("input", (e) => {
      currentSize = Number(e.target.value);
    });
    currentSize = Number(sizeS.value);
  }

  const segS = document.getElementById("segS");
  if (segS) {
    segS.addEventListener("input", (e) => {
      currentSegments = Number(e.target.value);
    });
    currentSegments = Number(segS.value);
  }

  // Draw picture
  const drawPicBtn = document.getElementById("drawPicButton");
  if (drawPicBtn) {
    drawPicBtn.onclick = () => {
      mouseDown = false;
      drawPicture_JK();
      renderAllShapes();
    };
  }
}

function convertCoordinatesToGL(ev) {
  const rect = ev.target.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) - canvas.width / 2) / (canvas.width / 2);
  const y = (canvas.height / 2 - (ev.clientY - rect.top)) / (canvas.height / 2);
  return [x, y];
}

function handleClicks(ev) {
  const [x, y] = convertCoordinatesToGL(ev);

  switch (currentType) {
    case "point":
      shapesList.push(new Point([x, y], currentColor.slice(), currentSize));
      break;

    case "triangle": {
      const s = currentSize / 200.0;
      shapesList.push(new Triangle(
        [x, y + s, x - s, y - s, x + s, y - s],
        currentColor.slice()
      ));
      break;
    }

    case "circle":
      shapesList.push(new Circle([x, y], currentColor.slice(), currentSize, currentSegments));
      break;

    default:
      shapesList.push(new Point([x, y], currentColor.slice(), currentSize));
      break;
  }

  renderAllShapes();
}

function renderAllShapes() {
  // Transparent clear so your ocean background shows through
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  for (const shape of shapesList) {
    shape.render();
  }
}

// ===================== Picture (20+ triangles, includes "JK") =====================
function addTri(x1, y1, x2, y2, x3, y3, r, g, b) {
  shapesList.push(new Triangle([x1, y1, x2, y2, x3, y3], [r, g, b, 1.0]));
}

function addRect(x1, y1, x2, y2, rgb) {
  addTri(x1, y1, x2, y1, x2, y2, rgb[0], rgb[1], rgb[2]);
  addTri(x1, y1, x2, y2, x1, y2, rgb[0], rgb[1], rgb[2]);
}

function drawPicture_JK() {
    shapesList = [];

  const W = 20, H = 18;

  const mapX = (x) => -0.9 + (x / W) * 1.8;
  const mapY = (y) => -0.9 + (y / H) * 1.8;

 
  addTri(
    mapX(10), mapY(13.0),
    mapX(7.5), mapY(16.0),
    mapX(12.5), mapY(16.0),
    0.5, 0.25, 0.0
  );
  addTri(
    mapX(10), mapY(13.0),
    mapX(7.5), mapY(16.0),
    mapX(5.5), mapY(15.0),
    0.5, 0.25, 0.0
  );
  addTri(
    mapX(10), mapY(13.0),
    mapX(5.5), mapY(13.0),
    mapX(5.5), mapY(15.0),
    0.5, 0.25, 0.0
  );
  addTri(
    mapX(3.5), mapY(13.0),
    mapX(5.5), mapY(13.0),
    mapX(5.5), mapY(15.0),
    0.5, 0.25, 0.0
  );
  addTri(
    mapX(3.5), mapY(13.0),
    mapX(3.5), mapY(15.0),
    mapX(5.5), mapY(15.0),
    0.5, 0.25, 0.0
  );
  addTri(
    mapX(10), mapY(13.0),
    mapX(12.5), mapY(16.0),
    mapX(14.5), mapY(15.0),
    0.5, 0.25, 0.0
  );
  addTri(
    mapX(10), mapY(13.0),
    mapX(14.5), mapY(13.0),
    mapX(14.5), mapY(15.0),
    0.5, 0.25, 0.0
  );
  addTri(
    mapX(16.5), mapY(13.0),
    mapX(14.5), mapY(13.0),
    mapX(14.5), mapY(15.0),
    0.5, 0.25, 0.0
  );
  addTri(
    mapX(16.5), mapY(13.0),
    mapX(16.5), mapY(15.0),
    mapX(14.5), mapY(15.0),
    0.5, 0.25, 0.0
  );
  addTri(
    mapX(3.5), mapY(11.0),
    mapX(3.5), mapY(13.0),
    mapX(10.0), mapY(13.0),
    0.5, 0.25, 0.0
  );
  addTri(
    mapX(3.5), mapY(11.0),
    mapX(16.5), mapY(11.0),
    mapX(10.0), mapY(13.0),
    0.5, 0.25, 0.0
    );
  addTri(
    mapX(10.0), mapY(13.0),
    mapX(16.5), mapY(13.0),
    mapX(16.5), mapY(11.0),
    0.5, 0.25, 0.0
    );

  addTri(
    mapX(3.5), mapY(11.0),
    mapX(3.5), mapY(8.0),
    mapX(8.5), mapY(11.0),
    0.5, 0.25, 0.0
    );
  addTri(
    mapX(11.5), mapY(11.0),
    mapX(16.5), mapY(11.0),
    mapX(16.5), mapY(8.0),
    0.5, 0.25, 0.0
    );
  addTri(
    mapX(6.5), mapY(12.0),
    mapX(6.5), mapY(11.0),
    mapX(7.5), mapY(12.0),
    0.0, 0.0, 0.0
    );
  addTri(
    mapX(7.5), mapY(11.0),
    mapX(6.5), mapY(11.0),
    mapX(7.5), mapY(12.0),
    0.0, 0.0, 0.0
    );

  addTri(
    mapX(12.5), mapY(12.0),
    mapX(12.5), mapY(11.0),
    mapX(13.5), mapY(12.0),
    0.0, 0.0, 0.0
    );
  addTri(
    mapX(12.5), mapY(11.0),
    mapX(13.5), mapY(11.0),
    mapX(13.5), mapY(12.0),
    0.0, 0.0, 0.0
    );

  addTri(
    mapX(3.5), mapY(15.0),
    mapX(3.5), mapY(14.0),
    mapX(4.5), mapY(14.0),
    1.0, 0.8, 0.8
    );
  addTri(
    mapX(4.5), mapY(15.0),
    mapX(4.5), mapY(14.0),
    mapX(3.5), mapY(15.0),
    1.0, 0.8, 0.8
    );
  addTri(
    mapX(16.5), mapY(15.0),
    mapX(16.5), mapY(14.0),
    mapX(15.5), mapY(14.0),
    1.0, 0.8, 0.8
    );
  addTri(
    mapX(16.5), mapY(15.0),
    mapX(15.5), mapY(15.0),
    mapX(15.5), mapY(14.0),
    1.0, 0.8, 0.8
    );

  addTri(
    mapX(8.5), mapY(11.0),
    mapX(11.5), mapY(11.0),
    mapX(10.0), mapY(10.0),
    0.0, 0.0, 0.0
    );
  addTri(
    mapX(8.5), mapY(11.0),
    mapX(3.5), mapY(8.0),
    mapX(10.0), mapY(10.0),
    0.82, 0.71, 0.55
    );
  addTri(
    mapX(11.5), mapY(11.0),
    mapX(16.5), mapY(8.0),
    mapX(10.0), mapY(10.0),
    0.82, 0.71, 0.55
    );
  addTri(
    mapX(16.5), mapY(8.0),
    mapX(12.5), mapY(6.0),
    mapX(10.0), mapY(10.0),
    0.82, 0.71, 0.55
    );
  addTri(
    mapX(3.5), mapY(8.0),
    mapX(7.5), mapY(6.0),
    mapX(10.0), mapY(10.0),
    0.82, 0.71, 0.55
    );
  addTri(
    mapX(12.5), mapY(6.0),
    mapX(7.5), mapY(6.0),
    mapX(10.0), mapY(10.0),
    0.82, 0.71, 0.55
    );

  addTri(
    mapX(4.5), mapY(9.0),
    mapX(4.5), mapY(7.0),
    mapX(9.5), mapY(7.0),
    0.502, 0.702, 0.835
    );

  addTri(
    mapX(4.5), mapY(9.0),
    mapX(9.5), mapY(9.0),
    mapX(9.5), mapY(7.0),
    0.502, 0.702, 0.835
    );

  addTri(
    mapX(5.5), mapY(7.0),
    mapX(8.5), mapY(7.0),
    mapX(7.0), mapY(4.0),
    0.502, 0.702, 0.835
    );
  addTri(
    mapX(5.5), mapY(5.0),
    mapX(5.5), mapY(4.0),
    mapX(7.0), mapY(4.0),
    0.502, 0.702, 0.835
    );

  addTri(
    mapX(10.5), mapY(9.0),
    mapX(13.5), mapY(9.0),
    mapX(10.5), mapY(4.0),
    0.502, 0.702, 0.835
    );
  addTri(
    mapX(13.5), mapY(9.0),
    mapX(13.5), mapY(4.0),
    mapX(10.5), mapY(4.0),
    0.502, 0.702, 0.835
    );

  addTri(
    mapX(14.5), mapY(9.0),
    mapX(16.5), mapY(9.0),
    mapX(13.5), mapY(7.0),
    0.502, 0.702, 0.835
    );
   addTri(
    mapX(14.5), mapY(4.0),
    mapX(16.5), mapY(4.0),
    mapX(13.5), mapY(7.0),
    0.502, 0.702, 0.835
    );
}



// ===================== Main =====================
function main() {
  if (!setupWebGL()) return;
  if (!connectVariablesToGLSL()) return;

  addActionsForHtmlUI();

  // Robust click + drag (left mouse button only)
  canvas.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    mouseDown = true;
    handleClicks(ev);
  });

  canvas.addEventListener("mousemove", (ev) => {
    if (!mouseDown) return;
    handleClicks(ev);
  });

  // Always stop drawing even if mouse released outside canvas
  window.addEventListener("mouseup", () => { mouseDown = false; });

  // Stop drawing if leaving canvas or tab loses focus
  canvas.addEventListener("mouseleave", () => { mouseDown = false; });
  window.addEventListener("blur", () => { mouseDown = false; });

  renderAllShapes();
}
