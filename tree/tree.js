import * as THREE from 'https://unpkg.com/three@0.119.0/build/three.module.js';
import {interactionVertexShader, interactionFragmentShader} from './shaders.js'
import {encodeInteractionIndex, decodeInteractionIndex, getGroupLevel, getLowestLevelGroups, applyFunctionToGroup} from './helpers.js';

export class Tree {
  gl;
  renderer;
  raycaster;
  camera;
  mouseX;
  mouseY;
  interactionIndex
  interactionRenderTarget;
  sharedGeometry;
  floatingBranchGroup;
  interactionRootGroup;
  visualizationRootGroup;
  lastHoveredVisualizationGroup;
  interactionScene = new THREE.Scene();
  visualizationScene = new THREE.Scene();
  interactionToVisualizationGroupMap = new Map();
  visualizationToInteractionGroupMap = new Map();
  levelHeightShrinkFactor = 0.6;
  levelRadiusShrinkFactor = 0.5;
  branchDeviationFactor = 0.2;
  branchGrowingPortion = 0.8;
  displayColor = 0xffff00;
  hoveredColor = 0x00ccff;

  visualizationMaterial = new THREE.MeshLambertMaterial({color: this.displayColor});
  hoverMaterial = new THREE.MeshLambertMaterial({color: this.hoveredColor, transparent: true, opacity: 0.5});
  floatingBranchMaterial = new THREE.MeshLambertMaterial({color: this.hoveredColor, transparent: true, opacity: 0.5});

  constructor(renderer, raycaster, camera) {
    this.renderer = renderer;
    this.raycaster = raycaster;
    this.camera = camera;
    this.interactionRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType
    });
    this.gl = renderer.getContext({antialias:false});
    this.sharedGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 10);
    this.sharedGeometry.translate(0, 0.5, 0);

    this.floatingBranchGroup = new THREE.Group();
    this.floatingBranchGroup.add(new THREE.Mesh(this.sharedGeometry, this.floatingBranchMaterial));
    this.floatingBranchGroup.rotateZ(-Math.PI / 3);

    this.interactionRootGroup = new THREE.Group();
    this.interactionRootGroup.add(this.createBranchMesh(0, true));
    this.interactionScene.add(this.interactionRootGroup);

    this.visualizationRootGroup = new THREE.Group();
    this.visualizationRootGroup.add(this.createBranchMesh(0, false));
    this.visualizationScene.add(this.visualizationRootGroup);
    this.visualizationScene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 1));
    this.setInteractionToVisualizationGroupMapping(this.interactionRootGroup, this.visualizationRootGroup);
  }

  growAnotherLevel() {
    const lowestLevelGroups = getLowestLevelGroups(this.interactionRootGroup);
    for (const interactionGroup of lowestLevelGroups) {
      const visualizationGroup = this.interactionToVisualizationGroupMap.get(interactionGroup);
      this.growBranchesOnGroup(interactionGroup, visualizationGroup, 2 + Math.floor(Math.random() * 5), 0.2, getGroupLevel(interactionGroup) + 1);
    }
  }

  performHoveredInteraction() {
    if (typeof this.mouseX !== 'undefined' && typeof this.mouseX !== 'undefined') {
      if (this.lastHoveredVisualizationGroup) {
        this.changeGroupMaterialToVisualization(this.lastHoveredVisualizationGroup, this.displayColor, 1);
        this.lastHoveredVisualizationGroup = null;
      }
      if (this.interactionIndex) {
        const meshHovered = this.interactionRootGroup.getObjectById(this.interactionIndex);
        const visualizationGroupHovered = this.interactionToVisualizationGroupMap.get(meshHovered.parent);
        this.changeGroupMaterialToHover(visualizationGroupHovered, this.hoveredColor, 0.5);
        this.lastHoveredVisualizationGroup = visualizationGroupHovered;
      }
    }
  }

  performGrowBranchInteraction() {
    if (this.mouseX && this.mouseX) {
      if (this.interactionIndex) {
        const meshHovered = this.interactionRootGroup.getObjectById(this.interactionIndex);
        const intersects = this.raycaster.intersectObject(meshHovered);
        if (intersects.length > 0) {
          const parentInteractionGroup = meshHovered.parent;
          const parentVisualizationGroup = this.interactionToVisualizationGroupMap.get(meshHovered.parent);
          parentVisualizationGroup.add(this.floatingBranchGroup);

          const level = getGroupLevel(this.floatingBranchGroup);
          this.floatingBranchGroup.children[0].scale
            .set(Math.pow(this.levelRadiusShrinkFactor, level), Math.pow(this.levelHeightShrinkFactor, level), Math.pow(this.levelRadiusShrinkFactor, level));

          const intersectionPointLocal = parentInteractionGroup.worldToLocal(intersects[0].point.clone());
          this.floatingBranchGroup.position.set(0, intersectionPointLocal.y, 0);
          this.floatingBranchGroup.visible = true;
        }
      } else {
        if (this.floatingBranchGroup.parent) {
          this.floatingBranchGroup.parent.remove(this.floatingBranchGroup);
        }
        this.floatingBranchGroup.visible = false;
      }
    }
  }

  rotateFloatingBranch(angle) {
    if (this.floatingBranchGroup.parent) {
      this.floatingBranchGroup.rotation.y += angle;
    }
  }

  rotateHoveredBranch(angle) {
    if (this.lastHoveredVisualizationGroup) {
      this.lastHoveredVisualizationGroup.rotation.y += angle;
      const lastHoverediInteractionGroup = this.visualizationToInteractionGroupMap.get(this.lastHoveredVisualizationGroup);
      lastHoverediInteractionGroup.rotation.y += angle;
    }
  }

  render(showVisualization = true) {
    if (showVisualization) {
      this.renderer.setRenderTarget(this.interactionRenderTarget);
      this.renderer.render(this.interactionScene, this.camera);
      // this.performGrowBranchInteraction();
      this.interactionIndex = this.readInteractionIndex(this.gl, this.mouseX, this.mouseY);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.visualizationScene, this.camera);
    } else {
      this.renderer.render(this.interactionScene, this.camera);
    }
  }

  resize(windowWidth, windowHeight) {
    this.interactionRenderTarget.setSize(windowWidth, windowHeight);
  }

  setMousePosition(mouseX, mouseY) {
    this.mouseX = mouseX;
    this.mouseY = mouseY;
  }

  attachFloatingBranch() {
    if (this.floatingBranchGroup.parent && this.floatingBranchGroup.visible) {
      const parentVisualizationGroup = this.floatingBranchGroup.parent;
      const parentInteractionGroup = this.visualizationToInteractionGroupMap.get(parentVisualizationGroup);
      const interactionGroup = this.floatingBranchGroup.clone();
      const visualizationGroup = this.floatingBranchGroup.clone();
      const interactionMesh = interactionGroup.children[0];
      const visualizationMesh = visualizationGroup.children[0];
      interactionMesh.material = this.createInteractionMaterial();
      interactionMesh.material.uniforms.interactionIndex.value = encodeInteractionIndex(interactionMesh.id);
      visualizationMesh.material = this.visualizationMaterial;
      this.setInteractionToVisualizationGroupMapping(interactionGroup, visualizationGroup);
      parentInteractionGroup.add(interactionGroup);
      parentVisualizationGroup.add(visualizationGroup);
    }
  }

  changeGroupMaterialToHover(visualizationGroup, color, opacity) {
      applyFunctionToGroup(visualizationGroup, (group) => {
        // group.children[0].material.color.setHex(color);
        // group.children[0].material.opacity = opacity;
        group.children[0].material = this.hoverMaterial;
      });
  }

  changeGroupMaterialToVisualization(visualizationGroup) {
    applyFunctionToGroup(visualizationGroup, (group) => {
      group.children[0].material = this.visualizationMaterial;
    });
  }

  growBranchesOnGroup(parentInteractionGroup, parentVisualizationGroup, branchNumber, branchDeviationFactor, level) {
    const parentBranchLength = parentInteractionGroup.children[0].scale.y;
    const notGrowingLength = parentBranchLength * (1 - this.branchGrowingPortion);
    const segmentLength = parentBranchLength * this.branchGrowingPortion / branchNumber;
    const yRotationOffset = Math.PI * 2 * branchDeviationFactor * Math.random() / branchNumber;

    for (let branchId = 0; branchId < branchNumber; ++branchId) {
      const interactionBranchGroup = new THREE.Group();

      interactionBranchGroup.translateY(notGrowingLength + segmentLength * (branchId + 0.5 + Math.random() * branchDeviationFactor));
      interactionBranchGroup.rotateY(yRotationOffset + Math.PI * 2 * (1 + Math.random() * branchDeviationFactor) * branchId / branchNumber);
      interactionBranchGroup.rotateZ(Math.PI / 3);

      const visualizationBranchGroup = interactionBranchGroup.clone();

      interactionBranchGroup.add(this.createBranchMesh(level, true));
      visualizationBranchGroup.add(this.createBranchMesh(level, false));
      this.setInteractionToVisualizationGroupMapping(interactionBranchGroup, visualizationBranchGroup);
      parentInteractionGroup.add(interactionBranchGroup);
      parentVisualizationGroup.add(visualizationBranchGroup);
    }
  }

  createBranchMesh(level, isInteractionMesh) {
    let branchMesh;
    if (isInteractionMesh) {
      branchMesh = new THREE.Mesh(this.sharedGeometry, this.createInteractionMaterial());
      branchMesh.material.uniforms.interactionIndex.value = encodeInteractionIndex(branchMesh.id);
    } else {
      branchMesh = new THREE.Mesh(this.sharedGeometry, this.visualizationMaterial);
    }
    branchMesh.scale.set(Math.pow(this.levelRadiusShrinkFactor, level), Math.pow(this.levelHeightShrinkFactor, level), Math.pow(this.levelRadiusShrinkFactor, level));

    return branchMesh;
  }

  setInteractionToVisualizationGroupMapping(interactionBranchGroup, visualizationBranchGroup) {
    this.interactionToVisualizationGroupMap.set(interactionBranchGroup, visualizationBranchGroup);
    this.visualizationToInteractionGroupMap.set(visualizationBranchGroup, interactionBranchGroup);
  }

  createInteractionMaterial() {
    return new THREE.RawShaderMaterial({
    	uniforms: {
    		interactionIndex: {value: 0}
    	},
    	vertexShader: interactionVertexShader,
    	fragmentShader: interactionFragmentShader
    });
  }

  readInteractionIndex(gl, x, y) {
    const pixelData = new Float32Array(4);
    this.gl.readPixels(x, window.innerHeight-y-1, 1, 1, gl.RGBA, gl.FLOAT, pixelData);

    return decodeInteractionIndex(pixelData);
  }
}
