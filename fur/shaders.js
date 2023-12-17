const FurVertexShader =
`#version 300 es
precision highp float;

const float radius = 1.0;
const float shallThickness = 0.02;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform int  layer;

in vec3 position;
in vec2 uv;
out vec2 vUv;

void main() {
  vUv = uv;
  vec4 positionInShell = vec4(vec3(radius + shallThickness * float(layer)), 1.0) * vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * positionInShell;
}
`;

const FurFragmentShader =
`#version 300 es
precision highp float;

uniform sampler2D furTex;

in vec2 vUv;
out vec4 fragmentColor;

void main() {
  vec4 color = texture(furTex, vUv * 4.0);
  fragmentColor = color;
}
`