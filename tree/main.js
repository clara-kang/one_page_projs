import * as THREE from 'https://unpkg.com/three@0.119.0/build/three.module.js';
import {OrbitControls} from 'https://unpkg.com/three@0.119.0/examples/jsm/controls/OrbitControls.js';
import {interactionVertexShader, interactionFragmentShader} from './shaders.js'
import {encodeInteractionIndex, decodeInteractionIndex, getGroupLevel, getLowestLevelGroups, applyFunctionToGroup} from './helpers.js';

let branchDeviationFactor = 0.2;

// rendering environment
let camera;
let renderer;
let gl;

// rendered objects
let interactionRenderTarget;
let interactionRootGroup;
let visualizationRootGroup;
let floatingBranchGroup;
let sharedGeometry;
let interactionToVisualizationGroupMap = new Map();

// interaction records
let mouseX;
let mouseY;
let mouseNDC = new THREE.Vector2();
let currentLevel = 0;
let lastHoveredGroup = null;
let showVisualization = true;

const raycaster = new THREE.Raycaster();
const levelHeightShrinkFactor = 0.6;
const levelRadiusShrinkFactor = 0.5;
const displayColor = 0xffff00;
const hoveredColor = 0x00ccff;

function createInteractionMaterial() {
  return new THREE.RawShaderMaterial({
  	uniforms: {
  		interactionIndex: {value: 0}
  	},
  	vertexShader: interactionVertexShader,
  	fragmentShader: interactionFragmentShader
  });
}

function createBranchMesh(level, isInteractionMesh) {
  let branchMesh;
  if (isInteractionMesh) {
    branchMesh = new THREE.Mesh(sharedGeometry, createInteractionMaterial());
    branchMesh.material.uniforms.interactionIndex.value = encodeInteractionIndex(branchMesh.id);
  } else {
    branchMesh = new THREE.Mesh(sharedGeometry, new THREE.MeshLambertMaterial({color: displayColor, transparent: true}));
  }
  branchMesh.scale.set(Math.pow(levelRadiusShrinkFactor, level), Math.pow(levelHeightShrinkFactor, level), Math.pow(levelRadiusShrinkFactor, level));

  return branchMesh;
}

function growBranchesOnGroup(parentInteractionGroup, parentVisualizationGroup, branchNumber, branchDeviationFactor, level) {
  const segmentLength = parentInteractionGroup.children[0].scale.y / branchNumber;
  const yRotationOffset = Math.PI * 2 * branchDeviationFactor * Math.random() / branchNumber;

  for (let branchId = 0; branchId < branchNumber; ++branchId) {
    const interactionBranchGroup = new THREE.Group();

    interactionBranchGroup.translateY(segmentLength * (branchId + 0.5 + Math.random() * branchDeviationFactor));
    interactionBranchGroup.rotateY(yRotationOffset + Math.PI * 2 * (1 + Math.random() * branchDeviationFactor) * branchId / branchNumber);
    interactionBranchGroup.rotateZ(Math.PI / 3);

    const visualizationBranchGroup = interactionBranchGroup.clone();

    interactionBranchGroup.add(createBranchMesh(level, true));
    visualizationBranchGroup.add(createBranchMesh(level, false));
    interactionToVisualizationGroupMap.set(interactionBranchGroup, visualizationBranchGroup);
    parentInteractionGroup.add(interactionBranchGroup);
    parentVisualizationGroup.add(visualizationBranchGroup);
  }
}

function growAnotherLevel() {
  const lowestLevelGroups = getLowestLevelGroups(interactionRootGroup);
  currentLevel += 1;
  for (const interactionGroup of lowestLevelGroups) {
    const visualizationGroup = interactionToVisualizationGroupMap.get(interactionGroup);
    growBranchesOnGroup(interactionGroup, visualizationGroup, 2 + Math.floor(Math.random() * 5), 0.2, currentLevel);
  }
}

function changeVisualizationGroupColorAndOpacity(visualizationGroup, color, opacity) {
  applyFunctionToGroup(visualizationGroup, (group) => {
    group.children[0].material.color.setHex(color);
    group.children[0].material.opacity = opacity;
  });
}

function setUpGui() {
  const gui = new dat.GUI({name: 'Tree Parameters'});
  const growButton = {
    grow: () => {
      growAnotherLevel()
    }
  };
  const toggleInteractionButtion = {
    toggle: () => {
      showVisualization = !showVisualization;
    }
  };

  gui.add(growButton,'grow');
  gui.add(toggleInteractionButtion,'toggle');
}

function setupRenderingEnvironment() {
  interactionRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      format: THREE.RGBAFormat,
      type: THREE.FloatType
  });
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  gl = renderer.getContext({antialias:false});
}

function main() {
  setupRenderingEnvironment();
  const interactionScene = new THREE.Scene();
  const visualizationScene = new THREE.Scene();
  const controls = new OrbitControls(camera, renderer.domElement);

  sharedGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 10);
  sharedGeometry.translate(0, 0.5, 0);

  floatingBranchGroup = new THREE.Group();
  floatingBranchGroup.add(new THREE.Mesh(sharedGeometry, new THREE.MeshLambertMaterial({color: 0xccff99, transparent: true, opacity: 0.5})));
  floatingBranchGroup.rotateZ(-Math.PI / 3);

  interactionRootGroup = new THREE.Group();
  interactionRootGroup.add(createBranchMesh(currentLevel, true));
  interactionScene.add(interactionRootGroup);

  visualizationRootGroup = new THREE.Group();
  visualizationRootGroup.add(createBranchMesh(currentLevel, false));
  visualizationScene.add(visualizationRootGroup);

  interactionToVisualizationGroupMap.set(interactionRootGroup, visualizationRootGroup);

  const light = new THREE.HemisphereLight(0xffffbb, 0x080820, 1);
  visualizationScene.add(light);

  camera.position.y = 1;
  camera.position.z = 1.5;

  const animate = function () {
  	requestAnimationFrame(animate);
    controls.update();

    if (showVisualization) {
      renderer.setRenderTarget(interactionRenderTarget);
      renderer.render(interactionScene, camera);
      raycaster.setFromCamera(mouseNDC, camera);

      const interactionIndex = readInteractionIndex(gl, mouseX, mouseY);
      // performHoveredInteraction(interactionIndex);
      performGrowBranchInteraction(interactionIndex);

      renderer.setRenderTarget(null);
      renderer.render(visualizationScene, camera);
    } else {
      renderer.render(interactionScene, camera);
    }
  };
  setUpGui();
  animate();
}

function readInteractionIndex(gl, x, y) {
  const pixelData = new Float32Array(4);
  gl.readPixels(x, window.innerHeight-y-1, 1, 1, gl.RGBA, gl.FLOAT, pixelData);

  return decodeInteractionIndex(pixelData);
}

function performHoveredInteraction(interactionIndex) {
  if (lastHoveredGroup) {
    changeVisualizationGroupColorAndOpacity(lastHoveredGroup, displayColor, 1);
    lastHoveredGroup = null;
  }
  if (interactionIndex) {
    const objectHovered = interactionRootGroup.getObjectById(interactionIndex);
    const visualizationGroupHovered = interactionToVisualizationGroupMap.get(objectHovered.parent);
    changeVisualizationGroupColorAndOpacity(visualizationGroupHovered, hoveredColor, 0.5);
    lastHoveredGroup = visualizationGroupHovered;
  }
}

function performGrowBranchInteraction(interactionIndex) {
  if (interactionIndex) {
    const meshHovered = interactionRootGroup.getObjectById(interactionIndex);
    const intersects = raycaster.intersectObject(meshHovered);
    if (intersects.length > 0) {
      const parentInteractionGroup = meshHovered.parent;
      const parentVisualizationGroup = interactionToVisualizationGroupMap.get(meshHovered.parent);
      parentVisualizationGroup.add(floatingBranchGroup);

      const level = getGroupLevel(floatingBranchGroup);
      floatingBranchGroup.children[0].scale
        .set(Math.pow(levelRadiusShrinkFactor, level), Math.pow(levelHeightShrinkFactor, level), Math.pow(levelRadiusShrinkFactor, level));

      const intersectionPointLocal = parentInteractionGroup.worldToLocal(intersects[0].point.clone());
      floatingBranchGroup.position.set(0, intersectionPointLocal.y, 0);
      floatingBranchGroup.visible = true;
    }
  } else {
    if (floatingBranchGroup.parent) {
      floatingBranchGroup.parent.remove(floatingBranchGroup);
    }
    floatingBranchGroup.visible = false;
  }
}

function onWindowResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  interactionRenderTarget.setSize(window.innerWidth, window.innerHeight);
  camera.updateProjectionMatrix();
}

document.addEventListener('mousemove', (event) => {
  mouseX = event.clientX;
  mouseY = event.clientY;
  mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

document.addEventListener('keydown', (event) => {
  if (event.keyCode === 87) {
    if (floatingBranchGroup.parent.type === 'Group') {
      floatingBranchGroup.rotation.y += 0.1;
    }
  }
  if (event.keyCode === 83) {
    if (floatingBranchGroup.parent.type === 'Group') {
      floatingBranchGroup.rotation.y -= 0.1;
    }
  }
});

window.onload = main;
window.onresize = onWindowResize;
