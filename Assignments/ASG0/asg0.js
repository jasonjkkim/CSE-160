// asg0.js
// Student Name: Jason Kim
// Student ID: 2011732
// Student Email: jkim662@ucsc.edu
// Date: January 6, 2026

// Notes to Grader: I worked on this assignment by myself, and the resources
// that I used were from the resources listed on the canvas assignment and
// also some debugging help from ChatGPT when I couldn't find some spacing bugs
// and silly typoses in my code.

let canvas;
let ctx;

function main() {
  canvas = document.getElementById("cnv1");
  if (!canvas) {
    console.log("Failed to retrieve the <canvas> element");
    return;
  }

  ctx = canvas.getContext("2d");
  clearCanvas();

  // Task 2: instantiate v1 (z = 0) and draw it in red from canvas center
  const v1 = new Vector3([2.25, 2.25, 0]);
  drawVector(v1, "red");
}

function clearCanvas() {
  // black background
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawVector(v, color) {
  // Task 2: origin is canvas center, scale by 20
  const scale = 20;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  const x = v.elements[0] * scale;
  const y = v.elements[1] * scale;

  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy);

  // Canvas y axis is downward, so subtract y
  ctx.lineTo(cx + x, cy - y);
  ctx.stroke();
}

function readV1() {
  const x = parseFloat(document.getElementById("v1x").value);
  const y = parseFloat(document.getElementById("v1y").value);
  return new Vector3([x, y, 0]);
}

function readV2() {
  const x = parseFloat(document.getElementById("v2x").value);
  const y = parseFloat(document.getElementById("v2y").value);
  return new Vector3([x, y, 0]);
}

// Task 3 (+ Task 4 partial): clear, read v1, draw v1
function handleDrawEvent() {
  clearCanvas();

  const v1 = readV1();
  drawVector(v1, "red");

  const v2 = readV2();
  drawVector(v2, "blue");
}

// Task 5–8: operations UI button
function handleDrawOperationEvent() {
  clearCanvas();

  const v1 = readV1();
  const v2 = readV2();

  // Always draw v1 red and v2 blue
  drawVector(v1, "red");
  drawVector(v2, "blue");

  const op = document.getElementById("op").value;
  const s = parseFloat(document.getElementById("scalar").value);

  if (op === "add") {
    const v3 = new Vector3(v1.elements);
    v3.add(v2);
    drawVector(v3, "green");
  } else if (op === "sub") {
    const v3 = new Vector3(v1.elements);
    v3.sub(v2);
    drawVector(v3, "green");
  } else if (op === "mul") {
    const v3 = new Vector3(v1.elements);
    const v4 = new Vector3(v2.elements);
    v3.mul(s);
    v4.mul(s);
    drawVector(v3, "green");
    drawVector(v4, "green");
  } else if (op === "div") {
    const v3 = new Vector3(v1.elements);
    const v4 = new Vector3(v2.elements);
    v3.div(s);
    v4.div(s);
    drawVector(v3, "green");
    drawVector(v4, "green");
  } else if (op === "magnitude") {
    console.log("Magnitude v1:", v1.magnitude());
    console.log("Magnitude v2:", v2.magnitude());
  } else if (op === "normalize") {
    const n1 = new Vector3(v1.elements);
    const n2 = new Vector3(v2.elements);
    n1.normalize();
    n2.normalize();
    console.log("Magnitude v1:", v1.magnitude());
    console.log("Magnitude v2:", v2.magnitude());
    drawVector(n1, "green");
    drawVector(n2, "green");
  } else if (op === "angleBetween") {
    console.log("Angle:", angleBetween(v1, v2));
  } else if (op === "area") {
    console.log("Area of the triangle:", areaTriangle(v1, v2));
  }
}

// Task 7
function angleBetween(v1, v2) {
  const dot = Vector3.dot(v1, v2);
  const m1 = v1.magnitude();
  const m2 = v2.magnitude();
  if (m1 === 0 || m2 === 0) return 0;

  let cosA = dot / (m1 * m2);

  // Numerical safety for acos
  cosA = Math.max(-1, Math.min(1, cosA));

  const radians = Math.acos(cosA);
  return (radians * 180) / Math.PI;
}

// Task 8
function areaTriangle(v1, v2) {
  const cross = Vector3.cross(v1, v2);
  return cross.magnitude() / 2;
}
