import * as THREE from 'https://unpkg.com/three@0.119.0/build/three.module.js';

export function encodeInteractionIndex(interactionIndex) {
    return new THREE.Vector2(Math.floor(interactionIndex / 256) / 255, (interactionIndex % 256) / 255);
}

export function decodeInteractionIndex(pixelData) {
    return Math.floor(pixelData[0] * 255 * 256 + pixelData[1] * 255);
}

export function getGroupLevel(group) {
    let level = 0;
    let currentGroup = group;
    while (currentGroup.parent.type === 'Group') {
        level++;
        currentGroup = currentGroup.parent;
    }
    return level;
}

export function getLeafGroups(rootGroup) {
    const lowestLevelGroups = [];
    const stack = [];
    stack.push(rootGroup);

    while (stack.length > 0) {
        const group = stack.pop();
        if (group.children.length === 1) {
            lowestLevelGroups.push(group);
        } else {
            for (let childIndex = 1; childIndex < group.children.length; ++childIndex) {
                stack.push(group.children[childIndex]);
            }
        }
    }

    return lowestLevelGroups;
}

export function applyFunctionToGroup(group, callback) {
    const stack = [];
    stack.push(group);

    while (stack.length > 0) {
        const group = stack.pop();
        if (group.children.length > 1) {
            for (let childIndex = 1; childIndex < group.children.length; ++childIndex) {
                stack.push(group.children[childIndex]);
            }
        }
        callback(group);
    }
}
