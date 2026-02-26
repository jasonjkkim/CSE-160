class Camera {
  constructor() {
    this.near = 0.1;
    this.far = 1000;
    this.fov = 60;

    // Orbit target (what you look at)
    this.center = new Vector3([0, 0, 0]);
    this.up = new Vector3([0, 1, 0]);

    // Orbit state
    this.yaw = 0.0;     // radians
    this.pitch = 0.0;   // radians
    this.radius = 5.0;

    // Derived camera position
    this.eye = new Vector3([0, 0, this.radius]);
    this._recomputeEye();

    this.projMatrix = new Matrix4();
    this.projMatrix.setPerspective(this.fov, canvas.width / canvas.height, this.near, this.far);

    this.viewMatrix = new Matrix4();
    this.updateView();
  }

  _recomputeEye() {
    // Spherical coordinates around center
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);

    const x = this.center.elements[0] + this.radius * sy * cp;
    const y = this.center.elements[1] + this.radius * sp;
    const z = this.center.elements[2] + this.radius * cy * cp;

    this.eye = new Vector3([x, y, z]);
  }

  updateView() {
    this.viewMatrix.setLookAt(
      this.eye.elements[0], this.eye.elements[1], this.eye.elements[2],
      this.center.elements[0], this.center.elements[1], this.center.elements[2],
      this.up.elements[0], this.up.elements[1], this.up.elements[2]
    );
  }

  // WASD forward/back (moves both eye and center)
  moveForward(scale) {
    let forward = new Vector3(this.center.elements);
    forward.sub(this.eye);
    forward.normalize();
    forward.mul(scale);

    this.eye.add(forward);
    this.center.add(forward);

    // Keep orbit radius consistent with the new eye/center
    let diff = new Vector3(this.eye.elements);
    diff.sub(this.center);
    this.radius = Math.sqrt(
      diff.elements[0] * diff.elements[0] +
      diff.elements[1] * diff.elements[1] +
      diff.elements[2] * diff.elements[2]
    );

    this.updateView();
  }

  // Keep your original zoom slider behavior (changes FOV)
  zoom(scale) {
    this.projMatrix.setPerspective(this.fov * scale, canvas.width / canvas.height, this.near, this.far);
  }

  // A/D pan: rotate orbit target around up axis (keeps distance)
  pan(deg) {
    const rad = deg * Math.PI / 180.0;
    this.yaw += rad;
    this._recomputeEye();
    this.updateView();
  }

  // Mouse drag orbit: dx,dy in pixels
  orbit(dx, dy) {
    const sensitivity = 0.005; // radians per pixel
    this.yaw += dx * sensitivity;
    this.pitch += -dy * sensitivity;

    // Clamp pitch to avoid flipping
    const maxPitch = Math.PI / 2 - 0.05;
    if (this.pitch > maxPitch) this.pitch = maxPitch;
    if (this.pitch < -maxPitch) this.pitch = -maxPitch;

    this._recomputeEye();
    this.updateView();
  }

  // Mouse wheel zoom: change radius (distance)
  dolly(deltaY) {
    // deltaY > 0 means scroll down => zoom out
    const zoomSpeed = 0.0025;
    this.radius *= (1.0 + deltaY * zoomSpeed);

    // Clamp
    if (this.radius < 1.0) this.radius = 1.0;
    if (this.radius > 50.0) this.radius = 50.0;

    this._recomputeEye();
    this.updateView();
  }
}