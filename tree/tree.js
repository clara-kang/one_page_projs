import * as THREE from 'https://unpkg.com/three@0.119.0/build/three.module.js';
import {interactionVertexShader, interactionFragmentShader} from './shaders.js'
import {encodeInteractionIndex, decodeInteractionIndex, getGroupLevel, getLeafGroups, applyFunctionToGroup} from './helpers.js';

export class Tree {
    childrenBranchNumber = 2;

    _gl;
    _renderer;
    _raycaster;
    _camera;
    _interactionIndex;
    _interactionRenderTarget;
    _sharedGeometry;
    _potentialBranchGroup;
    _interactionRootGroup;
    _visualizationRootGroup;
    _lastHoveredVisualizationGroup = null;
    _interactionScene = new THREE.Scene();
    _visualizationScene = new THREE.Scene();
    _rendererSize = new THREE.Vector2();
    _interactionToVisualizationGroupMap = new Map();
    _visualizationToInteractionGroupMap = new Map();
    _visualizationMaterial = new THREE.MeshLambertMaterial({ color: Tree.displayColor });
    _hoverMaterial = new THREE.MeshLambertMaterial({ color: Tree.hoveredColor, transparent: true, opacity: Tree.transparentOpacity });
    _potentialBranchMaterial = new THREE.MeshLambertMaterial({ color: Tree.hoveredColor, transparent: true, opacity: Tree.transparentOpacity });

    static levelHeightShrinkFactor = 0.6;
    static levelRadiusShrinkFactor = 0.5;
    static branchDeviationFactor = 0.2;
    static branchGrowingPortion = 0.8;
    static displayColor = 0xffff00;
    static hoveredColor = 0x00ccff;
    static transparentOpacity = 0.5;

    constructor(renderer, raycaster, camera) {
        renderer.getSize(this._rendererSize);
        this._renderer = renderer;
        this._raycaster = raycaster;
        this._camera = camera;
        this._interactionRenderTarget = new THREE.WebGLRenderTarget(this._rendererSize.x, this._rendererSize.y, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });
        this._gl = renderer.getContext({ antialias: false });
        this._sharedGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 10);
        this._sharedGeometry.translate(0, 0.5, 0);

        this._potentialBranchGroup = new THREE.Group();
        this._potentialBranchGroup.add(new THREE.Mesh(this._sharedGeometry, this._potentialBranchMaterial));
        this._potentialBranchGroup.rotateZ(-Math.PI / 3);
        this._potentialBranchGroup.visible = false;

        this._interactionRootGroup = new THREE.Group();
        this._interactionRootGroup.add(this._createBranchMesh(0, true));
        this._interactionScene.add(this._interactionRootGroup);
        this._interactionScene.translateY(-0.5);

        this._visualizationRootGroup = new THREE.Group();
        this._visualizationRootGroup.add(this._createBranchMesh(0, false));
        this._visualizationScene.add(this._visualizationRootGroup);
        this._visualizationScene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 1));
        this._visualizationScene.translateY(-0.5);

        this._setInteractionToVisualizationGroupMapping(this._interactionRootGroup, this._visualizationRootGroup);
    }

    growAnotherLevel() {
        const lowestLevelGroups = getLeafGroups(this._interactionRootGroup);
        for (const interactionGroup of lowestLevelGroups) {
            const visualizationGroup = this._interactionToVisualizationGroupMap.get(interactionGroup);
            this._growBranchesOnGroup(interactionGroup, visualizationGroup, getGroupLevel(interactionGroup) + 1);
        }
    }

    performHoveredInteraction(mouseX, mouseY) {
        if (mouseX && mouseY) {
            if (this._lastHoveredVisualizationGroup) {
                this._changeGroupMaterialToVisualization(this._lastHoveredVisualizationGroup);
                this._lastHoveredVisualizationGroup = null;
            }
            if (this._interactionIndex) {
                const meshHovered = this._interactionRootGroup.getObjectById(this._interactionIndex);
                const visualizationGroupHovered = this._interactionToVisualizationGroupMap.get(meshHovered.parent);
                this._changeGroupMaterialToHover(visualizationGroupHovered);
                this._lastHoveredVisualizationGroup = visualizationGroupHovered;
            }
        }
    }

    performGrowBranchInteraction() {
        if (this._interactionIndex) {
            const meshHovered = this._interactionRootGroup.getObjectById(this._interactionIndex);
            const intersects = this._raycaster.intersectObject(meshHovered);
            if (intersects.length > 0) {
                const parentInteractionGroup = meshHovered.parent;
                const parentVisualizationGroup = this._interactionToVisualizationGroupMap.get(meshHovered.parent);
                parentVisualizationGroup.add(this._potentialBranchGroup);

                const level = getGroupLevel(this._potentialBranchGroup);
                Tree.applyLevelScaling(this._potentialBranchGroup.children[0], level);
                const intersectionPointLocal = parentInteractionGroup.worldToLocal(intersects[0].point.clone());
                this._potentialBranchGroup.position.set(0, intersectionPointLocal.y, 0);
                this._potentialBranchGroup.visible = true;
            }
        } else if (this._potentialBranchGroup.parent) {
            this._potentialBranchGroup.parent.remove(this._potentialBranchGroup);
            this._potentialBranchGroup.visible = false;
        }
    }

    hasHoveredVisualizationGroup() {
        return this._lastHoveredVisualizationGroup !== null;
    }

    potentialBranchVisible() {
        return this._potentialBranchGroup.visible;
    }

    rotatePotentialBranch(angle) {
        if (this._potentialBranchGroup.parent) {
            this._potentialBranchGroup.rotation.y += angle;
        }
    }

    rotateHoveredBranch(angle) {
        if (this._lastHoveredVisualizationGroup) {
            this._lastHoveredVisualizationGroup.rotation.y += angle;
            const lastHoverediInteractionGroup = this._visualizationToInteractionGroupMap.get(this._lastHoveredVisualizationGroup);
            lastHoverediInteractionGroup.rotation.y += angle;
        }
    }

    render(showVisualization = true, mouseX, mouseY) {
        if (showVisualization) {
            this._renderer.setRenderTarget(this._interactionRenderTarget);
            this._renderer.render(this._interactionScene, this._camera);
            this._interactionIndex = Tree.readInteractionIndex(this._gl, this._rendererSize.y, mouseX, mouseY);
            this._renderer.setRenderTarget(null);
            this._renderer.render(this._visualizationScene, this._camera);
        } else {
            this._renderer.render(this._interactionScene, this._camera);
        }
    }

    updateRenderTargetSize() {
        this._renderer.getSize(this._rendererSize);
        this._interactionRenderTarget.setSize(this._rendererSize.x, this._rendererSize.y);
    }

    attachPotentialBranch() {
        if (this._potentialBranchGroup.parent && this._potentialBranchGroup.visible) {
            const parentVisualizationGroup = this._potentialBranchGroup.parent;
            const parentInteractionGroup = this._visualizationToInteractionGroupMap.get(parentVisualizationGroup);
            const interactionGroup = this._potentialBranchGroup.clone();
            const visualizationGroup = this._potentialBranchGroup.clone();
            const interactionMesh = interactionGroup.children[0];
            const visualizationMesh = visualizationGroup.children[0];
            interactionMesh.material = Tree.createInteractionMaterial();
            interactionMesh.material.uniforms.interactionIndex.value = encodeInteractionIndex(interactionMesh.id);
            visualizationMesh.material = this._visualizationMaterial;
            this._setInteractionToVisualizationGroupMapping(interactionGroup, visualizationGroup);
            parentInteractionGroup.add(interactionGroup);
            parentVisualizationGroup.add(visualizationGroup);
        }
    }

    _changeGroupMaterialToHover(visualizationGroup) {
        applyFunctionToGroup(visualizationGroup, (group) => {
            group.children[0].material = this._hoverMaterial;
        });
    }

    _changeGroupMaterialToVisualization(visualizationGroup) {
        applyFunctionToGroup(visualizationGroup, (group) => {
            group.children[0].material = this._visualizationMaterial;
        });
    }

    _growBranchesOnGroup(parentInteractionGroup, parentVisualizationGroup, level) {
        const parentBranchLength = parentInteractionGroup.children[0].scale.y;
        const notGrowingLength = parentBranchLength * (1 - Tree.branchGrowingPortion);
        const segmentLength = parentBranchLength * Tree.branchGrowingPortion / this.childrenBranchNumber;
        const yRotationOffset = Math.PI * 2 * Tree.branchDeviationFactor * Math.random() / this.childrenBranchNumber;

        for (let branchId = 0; branchId < this.childrenBranchNumber; ++branchId) {
            const interactionBranchGroup = new THREE.Group();

            interactionBranchGroup.translateY(notGrowingLength + segmentLength * (branchId + 0.5 + Math.random() * Tree.branchDeviationFactor));
            interactionBranchGroup.rotateY(yRotationOffset + Math.PI * 2 * (1 + Math.random() * Tree.branchDeviationFactor) * branchId / this.childrenBranchNumber);
            interactionBranchGroup.rotateZ(Math.PI / 3);

            const visualizationBranchGroup = interactionBranchGroup.clone();

            interactionBranchGroup.add(this._createBranchMesh(level, true));
            visualizationBranchGroup.add(this._createBranchMesh(level, false));
            this._setInteractionToVisualizationGroupMapping(interactionBranchGroup, visualizationBranchGroup);
            parentInteractionGroup.add(interactionBranchGroup);
            parentVisualizationGroup.add(visualizationBranchGroup);
        }
    }

    _createBranchMesh(level, isInteractionMesh) {
        let branchMesh;
        if (isInteractionMesh) {
            branchMesh = new THREE.Mesh(this._sharedGeometry, Tree.createInteractionMaterial());
            branchMesh.material.uniforms.interactionIndex.value = encodeInteractionIndex(branchMesh.id);
        } else {
            branchMesh = new THREE.Mesh(this._sharedGeometry, this._visualizationMaterial);
        }
        Tree.applyLevelScaling(branchMesh, level);
        return branchMesh;
    }

    _setInteractionToVisualizationGroupMapping(interactionBranchGroup, visualizationBranchGroup) {
        this._interactionToVisualizationGroupMap.set(interactionBranchGroup, visualizationBranchGroup);
        this._visualizationToInteractionGroupMap.set(visualizationBranchGroup, interactionBranchGroup);
    }

    static applyLevelScaling(object, level) {
        object.scale.set(Math.pow(Tree.levelRadiusShrinkFactor, level), Math.pow(Tree.levelHeightShrinkFactor, level), Math.pow(Tree.levelRadiusShrinkFactor, level));
    }

    static createInteractionMaterial() {
        return new THREE.RawShaderMaterial({
            uniforms: {
                interactionIndex: { value: 0 }
            },
            vertexShader: interactionVertexShader,
            fragmentShader: interactionFragmentShader
        });
    }

    static readInteractionIndex(gl, rendererHeight, x, y) {
        const pixelData = new Float32Array(4);
        gl.readPixels(x, rendererHeight - y - 1, 1, 1, gl.RGBA, gl.FLOAT, pixelData);

        return decodeInteractionIndex(pixelData);
    }
}
