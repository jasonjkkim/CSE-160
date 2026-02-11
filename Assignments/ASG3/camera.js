// camera.js
class Camera {
  constructor(aspectRatio, near, far) {
    this.fov = 60;

    this.eye = new Vector3([2.5, 1.6, 2.5]);
    this.up  = new Vector3([0, 1, 0]);

    // yaw: left/right, pitch: up/down (degrees)
    this.yawDeg = 0;
    this.pitchDeg = 0;

    this.at = new Vector3([0, 0, 0]);
    this._recomputeAt();

    this.viewMatrix = new Matrix4();
    this.updateView();

    this.projectionMatrix = new Matrix4();
    this.projectionMatrix.setPerspective(this.fov, aspectRatio, near, far);
  }

  _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  _recomputeAt() {
    const yaw = (this.yawDeg * Math.PI) / 180.0;
    const pitch = (this.pitchDeg * Math.PI) / 180.0;

    // Forward from yaw + pitch
    const fx = Math.cos(pitch) * Math.cos(yaw);
    const fy = Math.sin(pitch);
    const fz = Math.cos(pitch) * Math.sin(yaw);

    this.at.elements[0] = this.eye.elements[0] + fx;
    this.at.elements[1] = this.eye.elements[1] + fy;
    this.at.elements[2] = this.eye.elements[2] + fz;
  }

  updateView() {
    this.viewMatrix.setLookAt(
      this.eye.elements[0], this.eye.elements[1], this.eye.elements[2],
      this.at.elements[0],  this.at.elements[1],  this.at.elements[2],
      this.up.elements[0],  this.up.elements[1],  this.up.elements[2]
    );
  }

  sync() {
    this._recomputeAt();
    this.updateView();
  }

  panLeft(deg = 3) {
    this.yawDeg += deg;
    this.sync();
  }

  panRight(deg = 3) {
    this.yawDeg -= deg;
    this.sync();
  }

  panUp(deg = 2) {
    this.pitchDeg = this._clamp(this.pitchDeg + deg, -80, 80);
    this.sync();
  }

  panDown(deg = 2) {
    this.pitchDeg = this._clamp(this.pitchDeg - deg, -80, 80);
    this.sync();
  }
}
