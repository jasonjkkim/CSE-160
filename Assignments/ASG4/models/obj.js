// Minimal OBJ loader (v/vn/f). If normals are missing, computes them.
// Produces: vertices(Float32Array), normals(Float32Array), indices(Uint16Array).

function parseOBJ(objText) {
  const positions = [];
  const normals = [];

  const outPositions = [];
  const outNormals = [];
  const outIndices = [];

  const vertMap = new Map(); // "vIndex/vnIndex" -> outIndex

  function getIndex(vIdx, vnIdx) {
    const key = vIdx + "/" + vnIdx;
    if (vertMap.has(key)) return vertMap.get(key);

    const px = positions[vIdx * 3 + 0];
    const py = positions[vIdx * 3 + 1];
    const pz = positions[vIdx * 3 + 2];
    outPositions.push(px, py, pz);

    if (vnIdx >= 0 && normals.length > 0) {
      const nx = normals[vnIdx * 3 + 0];
      const ny = normals[vnIdx * 3 + 1];
      const nz = normals[vnIdx * 3 + 2];
      outNormals.push(nx, ny, nz);
    } else {
      outNormals.push(0, 0, 0);
    }

    const newIndex = outPositions.length / 3 - 1;
    vertMap.set(key, newIndex);
    return newIndex;
  }

  const lines = objText.split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    const tag = parts[0];

    if (tag === "v" && parts.length >= 4) {
      positions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (tag === "vn" && parts.length >= 4) {
      normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (tag === "f" && parts.length >= 4) {
      const faceVerts = parts.slice(1).map(tok => {
        const fields = tok.split("/");
        const v = parseInt(fields[0], 10);
        const vn = (fields.length >= 3 && fields[2] !== "") ? parseInt(fields[2], 10) : 0;

        const vIdx = (v < 0) ? (positions.length / 3 + v) : (v - 1);
        const vnIdx = (vn < 0) ? (normals.length / 3 + vn) : (vn - 1);

        return { vIdx, vnIdx };
      });

      for (let i = 1; i < faceVerts.length - 1; i++) {
        const a = faceVerts[0];
        const b = faceVerts[i];
        const c = faceVerts[i + 1];

        const ia = getIndex(a.vIdx, a.vnIdx);
        const ib = getIndex(b.vIdx, b.vnIdx);
        const ic = getIndex(c.vIdx, c.vnIdx);

        outIndices.push(ia, ib, ic);
      }
    }
  }

  // Compute normals if missing
  let needCompute = true;
  for (let i = 0; i < outNormals.length; i++) {
    if (outNormals[i] !== 0) { needCompute = false; break; }
  }

  if (needCompute) {
    const acc = new Float32Array(outPositions.length);
    for (let i = 0; i < outIndices.length; i += 3) {
      const ia = outIndices[i] * 3;
      const ib = outIndices[i + 1] * 3;
      const ic = outIndices[i + 2] * 3;

      const ax = outPositions[ia], ay = outPositions[ia + 1], az = outPositions[ia + 2];
      const bx = outPositions[ib], by = outPositions[ib + 1], bz = outPositions[ib + 2];
      const cx = outPositions[ic], cy = outPositions[ic + 1], cz = outPositions[ic + 2];

      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;

      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;

      acc[ia] += nx; acc[ia + 1] += ny; acc[ia + 2] += nz;
      acc[ib] += nx; acc[ib + 1] += ny; acc[ib + 2] += nz;
      acc[ic] += nx; acc[ic + 1] += ny; acc[ic + 2] += nz;
    }

    for (let i = 0; i < acc.length; i += 3) {
      const nx = acc[i], ny = acc[i + 1], nz = acc[i + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
      outNormals[i] = nx / len;
      outNormals[i + 1] = ny / len;
      outNormals[i + 2] = nz / len;
    }
  }

  return {
    vertices: new Float32Array(outPositions),
    normals: new Float32Array(outNormals),
    indices: new Uint16Array(outIndices)
  };
}

function loadOBJFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(parseOBJ(reader.result)); }
      catch (e) { reject(e); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function loadOBJFromEmbeddedScriptTag(tagId) {
  const el = document.getElementById(tagId);
  if (!el) throw new Error("Missing embedded OBJ element: " + tagId);
  const text = (el.textContent || "").trim();
  if (!text || text.includes("PASTE_TEAPOT_OBJ_TEXT_HERE")) {
    throw new Error("Embedded OBJ text not pasted yet.");
  }
  return parseOBJ(text);
}