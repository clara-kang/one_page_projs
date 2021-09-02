const interactionVertexShader =
`#version 300 es
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const interactionFragmentShader =
`#version 300 es
precision highp float;

uniform vec2 interactionIndex;

out vec4 fragmentColor;

void main() {
  fragmentColor = vec4(interactionIndex, 1.0, 1.0);
}
`;

export {interactionVertexShader, interactionFragmentShader};
