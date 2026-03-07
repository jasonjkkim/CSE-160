# Assignment 5 - Three.js World

## Scene Description
A peaceful village scene with a house, windmill, pond, garden, and forest.

## Features Checklist
- **20+ primary shapes**: House (boxes, cone roof, chimney), trees (cylinders + cones/spheres), fence posts, bench, well (cylinder + torus), pond, rocks (dodecahedrons), barrel, mushrooms, stepping stones, flowers, windmill, bouncing ball, lanterns
- **3+ shape types**: Box, Sphere, Cylinder, Cone, Torus, Dodecahedron, Plane
- **Textured shapes**: House walls (brick texture), door & bench (wood texture), ground (grass texture), path (stone texture), barrel (wood texture) — all procedurally generated canvas textures
- **Animated shapes**: Windmill blades spin, bouncing ball, duck bobs on pond
- **Custom 3D model**: Duck (glTF/GLB) from Khronos glTF-Sample-Assets, loaded via GLTFLoader
- **3 light types**: AmbientLight, DirectionalLight (with shadows), HemisphereLight (+ extra PointLights for lanterns)
- **Skybox**: Procedural cube texture with gradient sky and clouds
- **Camera controls**: OrbitControls with damping, zoom limits, and polar angle constraint
- **Perspective projection**: PerspectiveCamera (60° FOV)

## Wow Feature (1.5 pts)
**Day/Night Cycle**: The scene features a real-time day/night cycle that dynamically adjusts:
- Sun position and direction
- Light color and intensity
- Fog density and color
- Renderer exposure (tone mapping)
- Lanterns glow brighter at night with flickering effect

This creates an atmospheric, living world that transitions smoothly between day and night.

## Controls
- **Mouse drag**: Rotate camera
- **Scroll wheel**: Zoom in/out
- **Click**: Enable mouse controls