import * as THREE from 'https://unpkg.com/three@0.119.0/build/three.module.js';
import {OrbitControls} from 'https://unpkg.com/three@0.119.0/examples/jsm/controls/OrbitControls.js';
import {Tree} from './tree.js';

let camera;
let renderer;
let tree;
const raycaster = new THREE.Raycaster();
let mouseNDC = new THREE.Vector2();

let showVisualization = true;

const VisualizationMode = {
  ADD: "add",
  SELECT: "select"
};

let visualizationController = {
  showVisualization: true,
  visualizationMode: VisualizationMode.ADD
};

function setUpGui() {
  const gui = new dat.GUI({name: 'Tree Parameters'});
  const growButton = {
    grow: () => {
      tree.growAnotherLevel()
    }
  };
  const toggleInteractionButtion = {
    toggle: () => {
      showVisualization = !showVisualization;
    }
  };

  gui.add(growButton,'grow');
  gui.add(toggleInteractionButtion,'toggle');
  gui.add(visualizationController, 'visualizationMode', {add: VisualizationMode.ADD, select: VisualizationMode.SELECT});
}

function setupRenderingEnvironment() {
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.y = 1;
  camera.position.z = 1.5;
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
}

window.onload = () => {
  setupRenderingEnvironment();
  tree = new Tree(renderer, raycaster, camera);

  const controls = new OrbitControls(camera, renderer.domElement);
  const animate = function () {
  	requestAnimationFrame(animate);
    controls.update();
    raycaster.setFromCamera(mouseNDC, camera);
    tree.render(showVisualization);

    if (visualizationController.visualizationMode === VisualizationMode.ADD) {
      tree.performGrowBranchInteraction();
    } else {
      tree.performHoveredInteraction();
    }
  };

  document.addEventListener('mousemove', (event) => {
    tree.setMousePosition(event.clientX, event.clientY);
    mouseNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
  });

  document.addEventListener('keydown', (event) => {
    if (visualizationController.visualizationMode === VisualizationMode.ADD) {
      if (event.keyCode === 87) {
        event.preventDefault();
        tree.rotateFloatingBranch(0.1);
      }
      if (event.keyCode === 83) {
        event.preventDefault();
        tree.rotateFloatingBranch(-0.1);
      }
    }
  });

  document.addEventListener('click', (event) => {
    tree.attachFloatingBranch();
  });

  window.onresize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    tree.resize(window.innerWidth, window.innerHeight);
    camera.updateProjectionMatrix();
  }
  setUpGui();
  animate();
}
