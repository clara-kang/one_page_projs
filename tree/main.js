import * as THREE from 'https://unpkg.com/three@0.119.0/build/three.module.js';
import {OrbitControls} from 'https://unpkg.com/three@0.119.0/examples/jsm/controls/OrbitControls.js';
import {Tree} from './tree.js';

let camera;
let renderer;
let tree;
let mouseX;
let mouseY;
let branchRotationTimer;
let branchSelected = false;

const raycaster = new THREE.Raycaster();

const VisualizationMode = {
    ADD: "add",
    SELECT: "select"
};

const RenderMode = {
    VISUALIZATION: "visualization",
    INDEX: "index"
}

const operationController = {
    operation: VisualizationMode.ADD
};

const renderModeController = {
    renderMode: RenderMode.VISUALIZATION
}


function setupGui() {
    const gui = new dat.GUI({name: 'Tree Parameters', width: 300});
    const growButton = {
        growTree: () => {
            tree.growAnotherLevel()
        }
    };

    gui.add(growButton, 'growTree').name('grow tree (click me!)');
    gui.add(renderModeController, 'renderMode', {
        visualization: RenderMode.VISUALIZATION,
        index: RenderMode.INDEX
    });
    gui.add(operationController, 'operation', {add: VisualizationMode.ADD, select: VisualizationMode.SELECT});
}

function setupRenderer() {
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 1.5);
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
}

function showWordsForAddOperation() {
    if (tree.potentialBranchVisible()) {
        document.getElementById("overlay").innerHTML = "use key A/D to rotate the branch, and click to place branch here!";
    } else {
        document.getElementById("overlay").innerHTML = "hover on a branch!";
    }
}

function showWordsForSelectOperation() {
    if (tree.hasHoveredVisualizationGroup()) {
        document.getElementById("overlay").innerHTML = "click to rotate the brach!";
    } else {
        document.getElementById("overlay").innerHTML = "hover on a branch!";
    }
}

window.onload = () => {
    setupRenderer();
    tree = new Tree(renderer, raycaster, camera);

    const controls = new OrbitControls(camera, renderer.domElement);
    const render = function () {
        requestAnimationFrame(render);
        controls.update();
        tree.render(renderModeController.renderMode === RenderMode.VISUALIZATION, mouseX, mouseY);

        if (operationController.operation === VisualizationMode.ADD) {
            tree.performGrowBranchInteraction();
            showWordsForAddOperation();
        } else if (!branchSelected) {
            tree.performHoveredInteraction(mouseX, mouseY);
            showWordsForSelectOperation();
        }
    };

    document.addEventListener('mousemove', (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
        raycaster.setFromCamera(
            new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1),
            camera
        );
    });

    document.addEventListener('keydown', (event) => {
        if (operationController.operation === VisualizationMode.ADD) {
            if (event.code === 'KeyA') {
                event.preventDefault();
                tree.rotatePotentialBranch(0.1);
            }
            if (event.code === 'KeyD') {
                event.preventDefault();
                tree.rotatePotentialBranch(-0.1);
            }
        }
    });

    document.addEventListener('click', () => {
        if (operationController.operation === VisualizationMode.ADD) {
            tree.attachPotentialBranch();
        } else if (tree.hasHoveredVisualizationGroup() && !branchSelected) {
            branchSelected = true;
            branchRotationTimer = setInterval(() => {
                tree.rotateHoveredBranch(0.1)
            }, 100);
            document.getElementById("overlay").innerHTML = "click again to stop branch rotation!";
        } else if (branchSelected) {
            branchSelected = false;
            clearInterval(branchRotationTimer);
        }
    });

    window.onresize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        tree.updateRenderTargetSize();
        camera.updateProjectionMatrix();
    }
    setupGui();
    render();
}
