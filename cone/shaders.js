const vertexShader =
`#version 300 es
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;
in vec2 uv;

out vec2 vUv;

void main() {
  gl_Position = vec4(position, 1.0);
  vUv = position.xy * 0.5 + 0.5;
}
`;

const fragmentShader =
`#version 300 es
precision highp float;

uniform sampler2D heightTex;
uniform sampler2D currentMap;
// uniform float iterationId;
uniform vec2 dstUv;

in vec2 vUv;
out vec4 fragmentColor;

const float imgSize = 332.0;
const float uvStepSize = 1.0 / imgSize;
const float stepNum = 332.0 * sqrt(2.0);

float getStepSize(vec3 rayDrctn) {
  return uvStepSize / length(rayDrctn.xy);
}

float readDepth(sampler2D depthMap, vec2 uv) {
  float depth = texture(depthMap, uv).x;
  return depth;
}

float getConeRatio(sampler2D depthMap, vec2 srcUv, vec2 dstUv) {
  vec3 src = vec3(srcUv, 0.0);
  vec3 dst = vec3(dstUv, readDepth(depthMap, dstUv));

  if (dst.z == 0.0) {
    return 1.0;
  }

  vec3 rayDrctn = normalize(dst - src);
  float stepSize = getStepSize(rayDrctn);
  vec3 searchPos;
  vec3 lastSearchPos = dst;
  float currentDepth;

  for (float stepId = 1.0; stepId < stepNum; ++stepId) {
    searchPos = dst + rayDrctn * stepSize * stepId;
    if (searchPos.x < 0.0 || searchPos.y < 0.0 || searchPos.x > 1.0 || searchPos.y > 1.0 || searchPos.z > 1.0) {
      return 1.0;
    }
    currentDepth = readDepth(depthMap, searchPos.xy);
    if (currentDepth >= searchPos.z) {
      break;
    }
    lastSearchPos = searchPos;
  }

  float srcDepth = readDepth(depthMap, srcUv);
  if (lastSearchPos.z >= srcDepth) {
    return 1.0;
  } else {
    return length(srcUv - lastSearchPos.xy) / (srcDepth - lastSearchPos.z);
  }
}

void main() {
  float currentConeRatio = texture(currentMap, vUv).x;

  // float dstRow = floor(iterationId / imgSize);
  // float dstCol = iterationId - dstRow * imgSize;
  // vec2 dstUv = vec2(dstCol / imgSize, dstRow / imgSize);

  if (length(dstUv - vUv) < 0.001) {
    fragmentColor = vec4(vec3(currentConeRatio), 1.0);
    return;
  }
  float coneRatio = getConeRatio(heightTex, vUv, dstUv);
  if (coneRatio < currentConeRatio) {
    currentConeRatio = coneRatio;
  }

  fragmentColor = vec4(vec3(currentConeRatio), 1.0);
  // fragmentColor = vec4(vec3(texture(heightTex, dstUv).x), 1.0);
}
`;
