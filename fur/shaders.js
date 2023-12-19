const FurVertexShader =
`#version 300 es
precision highp float;

const float radius = 1.0f;
const float furMaxLength = 0.4f;
const float shellCount = 30.0f;
const float shellThickness = furMaxLength / shellCount;
const vec4  gravityDir = vec4(0, -1.0f, 0, 0);

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform int  layer;

in vec3 position;
in vec3 normal;
in vec2 uv;
out vec2 vUv;
out vec3 vNormal;
out vec3 vPos;
out float layerFrac;

void main() {
  vUv = uv;
  vNormal = vec3(modelMatrix * vec4(normal, 0));
  vPos = vec3(modelMatrix * vec4(position, 1.0f));

  layerFrac = (float(layer) - 1.0f)/(shellCount - 1.0f);
  vec4 worldPos = modelMatrix * vec4(position, 1.0f);
  vec4 furDirctn = normalize(mix(modelMatrix * vec4(normal, 0.0f), gravityDir, 0.5f*0.5f*layerFrac*layerFrac));
  vec4 posInShell = worldPos + furDirctn * shellThickness * float(layer);
  gl_Position = projectionMatrix * viewMatrix * posInShell;
}
`;

const FurFragmentShader =
`#version 300 es
precision highp float;

const float ambient = 0.1f;

uniform sampler2D furTex;
uniform vec3 lightPos;

in vec2 vUv;
in vec3 vNormal;
in vec3 vPos;
in float layerFrac;
out vec4 fragmentColor;

void main() {
  vec3 lightDir = normalize(lightPos - vPos);
  float diffuse = max(dot(normalize(vNormal), vec3(1.0f)), 0.0);
  float lightFrac = min(diffuse + ambient, 1.0f);
  vec4 color = texture(furTex, vUv * 6.0f);
  vec4 clippedColor = step(vec4(0.2f), color);
  fragmentColor = vec4(clippedColor.xyz * lightFrac, clippedColor.w * (1.0f - layerFrac));
}
`