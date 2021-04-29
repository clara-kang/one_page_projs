const meshIntermediateVertexShader =
`#version 300 es
precision highp float;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;
in vec3 normal;

out vec3 vNormal;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vNormal = (transpose(inverse(modelMatrix)) * vec4(normal,0.0)).xyz;
}
`

const meshIntermediateFragmentShader =
`#version 300 es
precision highp float;

in vec3 vNormal;
out vec4 fragmentColor;

void main() {
  fragmentColor = vec4(normalize(vNormal), gl_FragCoord.z);
}
`

const meshDisplayVertexShader =
`#version 300 es
precision highp float;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;
in vec3 normal;

out vec3 vNormal;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vNormal = (transpose(inverse(modelMatrix)) * vec4(normal,0.0)).xyz;
}
`

const meshDisplayFragmentShader =
`#version 300 es
precision highp float;

uniform float ambient;
uniform vec3 lightDirection;

in vec3 vNormal;
out vec4 fragmentColor;

void main() {
  float diffuse = max(dot(normalize(vNormal), normalize(lightDirection)), 0.0);
  fragmentColor = vec4(vec3(1.0) * min(1.0, diffuse+ambient), 1.0);
}
`

const planeVertexShader =
`#version 300 es
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;
out vec2 vUv;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vUv = position.xy + 0.5;
}
`
const planeFragmentShader =
`#version 300 es
precision highp float;

uniform sampler2D colorTexture;

in vec2 vUv;
out vec4 fragmentColor;

void main() {
  vec4 color = texture(colorTexture, vUv);
  fragmentColor = vec4(color.xyz, 0.5);
}
`

const decalVertexShader =
`#version 300 es
precision highp float;

uniform mat4 viewMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec2 position;
in vec3 decalPosition;
in vec3 decalNormal;
in vec3 uDirection;
in float decalRadius;

out vec3 vPosition;
out vec3 vDecalPosition;
out vec3 vDecalNormal;
out float vDecalRadius;
out vec3 vUdirection;

void main() {
  vec4 sphereViewPosition = modelViewMatrix * vec4(decalPosition, 1.0);
  vec4 viewSpacePosition = vec4(sphereViewPosition.xy + position.xy * decalRadius, sphereViewPosition.z, 1.0);
  gl_Position = projectionMatrix * viewSpacePosition;

  vPosition = (inverse(viewMatrix) * viewSpacePosition).xyz;
  vDecalPosition = decalPosition;
  vDecalNormal = decalNormal;
  vDecalRadius = decalRadius;
  vUdirection = uDirection;
}
`
const decalFragmentShader =
`#version 300 es
precision highp float;

uniform sampler2D normalDepthTexture;
uniform sampler2D decalAlphaTexture;
uniform sampler2D decalNormalTexture;
uniform sampler2D decalColorTexture;

uniform float ambient;
uniform vec3 lightDirection;

uniform mat4 viewMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 vPosition;
in vec3 vDecalNormal;
in vec3 vUdirection;
in vec3 vDecalPosition;
in float vDecalRadius;
out vec4 fragmentColor;

vec3 worldPositionFromDepth(float depth) {
    vec2 texCoord = gl_FragCoord.xy / vec2(textureSize(normalDepthTexture, 0));
    float z = depth * 2.0 - 1.0;
    vec4 clipSpacePosition = vec4(texCoord * 2.0 - 1.0, z, 1.0);
    vec4 viewSpacePosition = inverse(projectionMatrix) * clipSpacePosition;
    viewSpacePosition /= viewSpacePosition.w;
    vec4 worldSpacePosition = inverse(viewMatrix) * viewSpacePosition;

    return worldSpacePosition.xyz;
}

void main() {
  float distanceToSphereCenter = length(vPosition - vDecalPosition);
  if (distanceToSphereCenter > vDecalRadius) {
    discard;
  }
  vec2 texCoord = gl_FragCoord.xy/vec2(textureSize(normalDepthTexture, 0));
  float currentDepth = texture(normalDepthTexture, texCoord).w;
  if (currentDepth == 0.0) {
    discard;
  }
  vec3 currentNormal = normalize(texture(normalDepthTexture, texCoord).xyz);
  float lenOnDecalPlaneNormal = sqrt(vDecalRadius*vDecalRadius - distanceToSphereCenter*distanceToSphereCenter);
  vec3 decalPlaneNormal = normalize((inverse(viewMatrix) * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  vec3 backPosition = vPosition + decalPlaneNormal*lenOnDecalPlaneNormal;
  vec3 frontPosition = vPosition - decalPlaneNormal*lenOnDecalPlaneNormal;

  vec4 backPosInProjspace = projectionMatrix * viewMatrix * vec4(backPosition,1.0);
  vec4 frontPosInProjspace = projectionMatrix * viewMatrix * vec4(frontPosition,1.0);

  float backDepth = (backPosInProjspace.z/backPosInProjspace.w + 1.0) / 2.0;
  float frontDepth = (frontPosInProjspace.z/frontPosInProjspace.w + 1.0) / 2.0;

  fragmentColor = vec4(0.0);

  if (frontDepth <= currentDepth && backDepth >= currentDepth) {
    vec3 currentWorldPos = worldPositionFromDepth(currentDepth);
    vec3 centerToCurrentPos = currentWorldPos - vDecalPosition;
    float centerToCurrentPosLen = length(centerToCurrentPos);
    vec3 directionOnTangentPlane = centerToCurrentPos - vDecalNormal * dot(vDecalNormal, centerToCurrentPos);

    vec3 uDirection = vUdirection;
    vec3 vDirection = normalize(cross(vDecalNormal, uDirection));
    float cosAngleWithUDir = dot(normalize(directionOnTangentPlane), uDirection);
    float cosAngleWithVDir = dot(normalize(directionOnTangentPlane), vDirection);

    float geodesisDistanceToCenter = (1.0 + pow(1.0 - dot(vDecalNormal, currentNormal), 4.0)) * centerToCurrentPosLen;

    vec2 uv = (vec2(cosAngleWithUDir, cosAngleWithVDir) * geodesisDistanceToCenter * sqrt(2.0) / vDecalRadius + 1.0) / 2.0;

    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
      vec3 normalTangentSpace = texture(decalNormalTexture, uv).xyz;
      vec4 texColor = texture(decalColorTexture, uv);

      normalTangentSpace = normalTangentSpace.xyz * 2.0 - 1.0;
      vec3 normalWorldSpace = normalTangentSpace.x * uDirection - normalTangentSpace.y * vDirection + normalTangentSpace.z * vDecalNormal;

      float diffuse = max(dot(normalWorldSpace, normalize(lightDirection)), 0.0);
      float lightAmount = min(diffuse + ambient, 1.0);

      float alpha = 1.0 - texture(decalAlphaTexture, uv).x;
      fragmentColor = vec4(texColor.xyz * lightAmount, alpha);
      // fragmentColor = vec4(vec3(lightAmount), alpha);
    }
  }
}
`
