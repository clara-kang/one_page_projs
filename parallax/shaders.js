const POMVertexShader =
`#version 300 es
precision highp float;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

uniform vec3 cameraPosition;
uniform vec3 lightDirection;

in vec3 position;
out vec3 vColor;
out vec2 vPos;
out vec3 vLightDir;
out vec3 vViewDir;
out float startingDepth;

void main() {
    vec3 positionWS = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    vPos = position.xy + 0.5;

    mat4 worldToTangentMatrix = inverse(modelMatrix);
    vLightDir = (worldToTangentMatrix * vec4(lightDirection, 0.0)).xyz;
    vViewDir = (worldToTangentMatrix * vec4(positionWS - cameraPosition, 0.0)).xyz;

    startingDepth = -position.z;
}`

const POMFragmentShader =
`#version 300 es
precision highp float;

in vec3 vColor;
in vec2 vPos;
in vec3 vLightDir;
in vec3 vViewDir;
in float startingDepth;
out vec4 fragmentColor;

uniform sampler2D colorTex;
uniform sampler2D heightTex;

uniform float ambient;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

const float dx = 0.002;
const float dy = 0.002;
const float normalFactor = 3.0 / 0.1;

float getDepth(vec2 coords) {
    return (1.0 - texture(heightTex, coords).x);
}

vec3 getNormal(vec2 coords) {
    vec2 rightCoords = vec2(coords.x + dx, coords.y);
    vec2 leftCoords = vec2(coords.x - dx, coords.y);
    vec2 upCoords = vec2(coords.x, coords.y + dy);
    vec2 downCoords = vec2(coords.x, coords.y - dy);

    float rightDepth = getDepth(rightCoords);
    float leftDepth = getDepth(leftCoords);
    float upDepth = getDepth(upCoords);
    float downDepth = getDepth(downCoords);
    return normalize(vec3((rightDepth - leftDepth) * normalFactor, (upDepth - downDepth) * normalFactor, 1.0));
}

float getMaxRayTravelDisplace(vec3 viewDir) {
    float maxTravelX;
    float maxTravelY;

    if (viewDir.x >= 0.0) {
        maxTravelX = 1.0 - vPos.x;
    } else {
        maxTravelX = vPos.x;
    }
    if (viewDir.y >= 0.0) {
        maxTravelY = 1.0 - vPos.y;
    } else {
        maxTravelY = vPos.y;
    }
    float yWhenMaxX = abs(viewDir.y / viewDir.x * maxTravelX);
    float xWhenMaxY = abs(viewDir.x / viewDir.y * maxTravelY);

    float realMaxX = min(maxTravelX, xWhenMaxY);
    float realMaxY = min(maxTravelY, yWhenMaxX);

    return sqrt(realMaxX*realMaxX + realMaxY*realMaxY);
}

vec2 getMaxParallaxDisplace(vec3 viewDir) {
    vec2 maxParallaxDisplace;
    if (viewDir.z <= 0.0) {
        maxParallaxDisplace = -(1.0 - startingDepth) * viewDir.xy / viewDir.z;
    } else {
        maxParallaxDisplace = startingDepth * viewDir.xy / viewDir.z;
    }
    float maxParallaxLen = length(maxParallaxDisplace);
    float maxRayDist = getMaxRayTravelDisplace(viewDir);

    if (maxParallaxLen > maxRayDist) {
        maxParallaxDisplace = maxRayDist * normalize(maxParallaxDisplace);
    }

    return maxParallaxDisplace;
}

float getParallaxDisplace(vec3 viewDir) {
    vec2 maxParallaxDisplace = -getMaxParallaxDisplace(viewDir);
    float maxParallaxLen = length(maxParallaxDisplace);
    vec2 parallaxDir = normalize(viewDir.xy);

    float stepNum = mix(500.0, 800.0, abs(viewDir.z));
    float stepSize = maxParallaxLen / stepNum;
    vec2 stepVec = maxParallaxDisplace / stepNum;
    float viewSlope = -viewDir.z / sqrt(viewDir.x*viewDir.x + viewDir.y*viewDir.y);

    vec2 stepPos;
    float lastDepthDiff = 0.0;
    float depthDiff = 0.0;
    float t = -10.0;

    if (getDepth(vPos) < startingDepth) {
        return -10.0;
    }
    for (float i = 1.0; i < stepNum + 2.0; i += 1.0) {
        stepPos = vPos - stepVec * i;

        float stepDepth = getDepth(stepPos);
        float stepViewDepth = viewSlope * stepSize * i + startingDepth;
        depthDiff = stepViewDepth - stepDepth;

        if (depthDiff >= 0.0) {
            t = (-lastDepthDiff / (depthDiff - lastDepthDiff) + i - 1.0) * stepSize;
            break;
        }
        lastDepthDiff = depthDiff;
    }
    return t;
}

void main() {
    vec3 toLightDir = normalize(-vLightDir);
    vec3 viewDir = normalize(vViewDir);
    float parallaxT = getParallaxDisplace(viewDir);
    if (parallaxT < -5.0) {
        discard;
    }
    vec2 parallaxDisplace = parallaxT * normalize(viewDir.xy);
    vec2 texCoord = vPos + parallaxDisplace;

    vec4 modelSpacePos = vec4(texCoord * 2.0 - 1.0, -(startingDepth + getDepth(texCoord)), 1.0);
    vec4 projectionSpacePos = projectionMatrix * modelViewMatrix * modelSpacePos;
    gl_FragDepth = (projectionSpacePos.z / projectionSpacePos.w + 1.0) / 2.0;

    vec3 albedoColor = texture(colorTex, texCoord).xyz;
    vec3 normal = getNormal(texCoord);
    float diffuse = dot(toLightDir, normalize(normal));

    fragmentColor = vec4(albedoColor, 1.0) * min(diffuse + ambient, 1.0);
}
`
