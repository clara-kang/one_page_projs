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

uniform sampler2D arrowTexture;

in vec2 vUv;
out vec4 fragmentColor;

void main() {
  vec4 color = texture(arrowTexture, vUv);
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
in vec3 spherePosition;
in vec3 sphereNormal;
in vec3 uDirection;
in float sphereRadius;

out vec3 vPosition;
out vec3 vSpherePosition;
out vec3 vSphereNormal;
out float vSphereRadius;
out vec3 vUdirection;

void main() {
  vec4 sphereViewPosition = modelViewMatrix * vec4(spherePosition, 1.0);
  vec4 viewSpacePosition = vec4(sphereViewPosition.xy + position.xy * sphereRadius, sphereViewPosition.z, 1.0);
  gl_Position = projectionMatrix * viewSpacePosition;

  vPosition = (inverse(viewMatrix) * viewSpacePosition).xyz;
  vSpherePosition = spherePosition;
  vSphereNormal = sphereNormal;
  vSphereRadius = sphereRadius;
  vUdirection = uDirection;
}
`
const decalFragmentShader =
`#version 300 es
precision highp float;

uniform sampler2D normalDepthTexture;
uniform sampler2D arrowTexture;

uniform float ambient;
uniform vec3 lightDirection;

uniform mat4 viewMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 vPosition;
in vec3 vSphereNormal;
in vec3 vUdirection;
in vec3 vSpherePosition;
in float vSphereRadius;
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
  float distanceToSphereCenter = length(vPosition - vSpherePosition);
  if (distanceToSphereCenter > vSphereRadius) {
    discard;
  }
  vec2 texCoord = gl_FragCoord.xy/vec2(textureSize(normalDepthTexture, 0));
  float currentDepth = texture(normalDepthTexture, texCoord).w;
  if (currentDepth == 0.0) {
    discard;
  }
  vec3 currentNormal = normalize(texture(normalDepthTexture, texCoord).xyz);
  float lenOnPlaneNormal = sqrt(vSphereRadius*vSphereRadius - distanceToSphereCenter*distanceToSphereCenter);
  vec3 planeNormal = normalize((inverse(viewMatrix) * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  vec3 backPosition = vPosition + planeNormal*lenOnPlaneNormal;
  vec3 frontPosition = vPosition - planeNormal*lenOnPlaneNormal;

  vec4 backPosInProjspace = projectionMatrix * viewMatrix * vec4(backPosition,1.0);
  vec4 frontPosInProjspace = projectionMatrix * viewMatrix * vec4(frontPosition,1.0);

  float backDepth = (backPosInProjspace.z/backPosInProjspace.w + 1.0) / 2.0;
  float frontDepth = (frontPosInProjspace.z/frontPosInProjspace.w + 1.0) / 2.0;

  fragmentColor = vec4(0.0);

  if (frontDepth <= currentDepth && backDepth >= currentDepth) {
    vec3 currentWorldPos = worldPositionFromDepth(currentDepth);
    vec3 centerToCurrentPos = currentWorldPos - vSpherePosition;
    float centerToCurrentPosLen = length(centerToCurrentPos);
    vec3 directionOnTangentPlane = centerToCurrentPos - vSphereNormal * dot(vSphereNormal, centerToCurrentPos);
    float cosAngleWithUDir = dot(normalize(directionOnTangentPlane), vUdirection);

    float geodesisDistanceToCenter = (1.0 + pow(1.0 - dot(vSphereNormal, currentNormal), 4.0)) * centerToCurrentPosLen;

    float u = (geodesisDistanceToCenter * sqrt(2.0) / vSphereRadius * cosAngleWithUDir + 1.0) / 2.0;
    float v = (geodesisDistanceToCenter * sqrt(2.0) / vSphereRadius * sin(acos(cosAngleWithUDir)) + 1.0) / 2.0;

    float diffuse = max(dot(normalize(currentNormal), normalize(lightDirection)), 0.0);
    float lightAmount = min(diffuse + ambient, 1.0);

    if (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0) {
      vec4 texColor = texture(arrowTexture, vec2(u, v));
      fragmentColor = vec4(texColor.xyz * lightAmount, texColor.w);
    }
  }
}
`
