class Sphere extends Model {
  constructor(color) {
    super(color);
    let n = 16;

    let verts = this.createVertices(n);
    this.vertices = new Float32Array(verts);

    let inds = this.createIndices(n);
    this.indices = new Uint16Array(inds);

    // For unit sphere centered at origin, normal = position (already unit-ish)
    // Normalize in shader anyway.
    this.normals = new Float32Array(verts);
  }

  createVertices(SPHERE_DIV) {
    let positions = [];

    for (let j = 0; j <= SPHERE_DIV; j++) {
      let aj = j * Math.PI / SPHERE_DIV;
      let sj = Math.sin(aj);
      let cj = Math.cos(aj);
      for (let i = 0; i <= SPHERE_DIV; i++) {
        let ai = i * 2 * Math.PI / SPHERE_DIV;
        let si = Math.sin(ai);
        let ci = Math.cos(ai);

        positions.push(si * sj); // X
        positions.push(cj);      // Y
        positions.push(ci * sj); // Z
      }
    }
    return positions;
  }

  createIndices(SPHERE_DIV) {
    let indices = [];

    for (let j = 0; j < SPHERE_DIV; j++) {
      for (let i = 0; i < SPHERE_DIV; i++) {
        let p1 = j * (SPHERE_DIV + 1) + i;
        let p2 = p1 + (SPHERE_DIV + 1);

        indices.push(p1, p2, p1 + 1);
        indices.push(p1 + 1, p2, p2 + 1);
      }
    }
    return indices;
  }
}