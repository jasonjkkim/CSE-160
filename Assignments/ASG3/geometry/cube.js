// geometry/cube.js
class cube extends geometry {
  constructor() {
    super();

    // Format per-vertex: position(3), color(3), uv(2) = 8 floats
    // Unit cube in model space spans [-1, +1] (we will scale by 0.5 to make 1x1x1 world cubes).
    const C = [1.0, 1.0, 1.0]; // keep vertex color neutral; use uniforms for coloring

    this.vertices = new Float32Array([
      // +X (right)
      1, -1, -1,  ...C,  0, 0,
      1, -1,  1,  ...C,  1, 0,
      1,  1,  1,  ...C,  1, 1,
      1, -1, -1,  ...C,  0, 0,
      1,  1,  1,  ...C,  1, 1,
      1,  1, -1,  ...C,  0, 1,

      // -X (left)
      -1, -1,  1, ...C,  0, 0,
      -1, -1, -1, ...C,  1, 0,
      -1,  1, -1, ...C,  1, 1,
      -1, -1,  1, ...C,  0, 0,
      -1,  1, -1, ...C,  1, 1,
      -1,  1,  1, ...C,  0, 1,

      // +Z (back)
      -1, -1, 1,  ...C,  0, 0,
       1, -1, 1,  ...C,  1, 0,
       1,  1, 1,  ...C,  1, 1,
      -1, -1, 1,  ...C,  0, 0,
       1,  1, 1,  ...C,  1, 1,
      -1,  1, 1,  ...C,  0, 1,

      // -Z (front)
       1, -1, -1, ...C,  0, 0,
      -1, -1, -1, ...C,  1, 0,
      -1,  1, -1, ...C,  1, 1,
       1, -1, -1, ...C,  0, 0,
      -1,  1, -1, ...C,  1, 1,
       1,  1, -1, ...C,  0, 1,

      // +Y (top)
      -1, 1, -1,  ...C,  0, 0,
       1, 1, -1,  ...C,  1, 0,
       1, 1,  1,  ...C,  1, 1,
      -1, 1, -1,  ...C,  0, 0,
       1, 1,  1,  ...C,  1, 1,
      -1, 1,  1,  ...C,  0, 1,

      // -Y (bottom)
      -1, -1,  1, ...C,  0, 0,
       1, -1,  1, ...C,  1, 0,
       1, -1, -1, ...C,  1, 1,
      -1, -1,  1, ...C,  0, 0,
       1, -1, -1, ...C,  1, 1,
      -1, -1, -1, ...C,  0, 1,
    ]);
  }
}
