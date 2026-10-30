import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { EngineManifest, PartSpec } from './types';

export interface Rotor {
  axis: THREE.Vector3;
  revPerSecond: number;
  angle: number;
}

export interface EnginePart {
  index: number;
  spec: PartSpec;
  object: THREE.Object3D;
  meshes: THREE.Mesh[];
  allMaterials: THREE.Material[];
  standardMaterials: THREE.MeshStandardMaterial[];
  basePosition: THREE.Vector3;
  baseQuaternion: THREE.Quaternion;
  offset: THREE.Vector3;
  localBox: THREE.Box3;
  rotor?: Rotor;
}

export interface LoadedEngine {
  root: THREE.Group;
  manifest: EngineManifest;
  parts: EnginePart[];
  pickMeshes: THREE.Mesh[];
  flowMeshes: THREE.Object3D[];
  flowMaterials: THREE.Material[];
  partMaterials: THREE.Material[];
  bounds: THREE.Box3;
  maxOrder: number;
}

function toGltfOffset([x, y, z]: [number, number, number]): THREE.Vector3 {
  // The manifest stores Blender coordinates (Z up). glTF is Y up:
  // (x, y, z) in Blender becomes (x, z, -y) in glTF.
  return new THREE.Vector3(x, z, -y);
}

function toGltfAxis(axis: [number, number, number]): THREE.Vector3 {
  return toGltfOffset(axis).normalize();
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function applyMaterials(mesh: THREE.Mesh, materials: THREE.Material[]): void {
  mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
}

export async function loadEngine(
  glbUrl: string,
  manifestUrl: string,
  onProgress?: (fraction: number) => void,
): Promise<LoadedEngine> {
  const [root, manifest] = await Promise.all([
    new Promise<THREE.Group>((resolve, reject) => {
      new GLTFLoader().load(
        glbUrl,
        (gltf) => resolve(gltf.scene as THREE.Group),
        (event) => {
          if (event.total > 0) onProgress?.(Math.min(1, event.loaded / event.total));
        },
        reject,
      );
    }),
    fetch(manifestUrl).then((response) => {
      if (!response.ok) throw new Error(`Manifest ${response.status}: ${manifestUrl}`);
      return response.json() as Promise<EngineManifest>;
    }),
  ]);

  root.updateMatrixWorld(true);

  const byName = new Map<string, THREE.Object3D>();
  root.traverse((object) => {
    if (object.name) byName.set(object.name, object);
  });

  const parts: EnginePart[] = [];
  const pickMeshes: THREE.Mesh[] = [];
  const partMaterials: THREE.Material[] = [];

  manifest.parts.forEach((spec, index) => {
    const object = byName.get(spec.node);
    if (!object) {
      console.warn(`[full-flow] Missing node: ${spec.node}`);
      return;
    }

    const meshes: THREE.Mesh[] = [];
    const allMaterials: THREE.Material[] = [];
    const standardMaterials: THREE.MeshStandardMaterial[] = [];

    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      meshes.push(child);
      pickMeshes.push(child);

      const clones = materialsOf(child).map((material) => material.clone());
      applyMaterials(child, clones);

      for (const clone of clones) {
        clone.clippingPlanes = null;
        if (clone instanceof THREE.MeshStandardMaterial) {
          clone.emissive = new THREE.Color(0xd08a5a);
          clone.emissiveIntensity = 0;
          clone.envMapIntensity = 0.9;
          standardMaterials.push(clone);
        }
        allMaterials.push(clone);
        partMaterials.push(clone);
      }
    });

    const part: EnginePart = {
      index,
      spec,
      object,
      meshes,
      allMaterials,
      standardMaterials,
      basePosition: object.position.clone(),
      baseQuaternion: object.quaternion.clone(),
      offset: toGltfOffset(spec.explode_offset),
      localBox: new THREE.Box3().setFromObject(object),
      rotor: spec.spin
        ? {
            axis: toGltfAxis(spec.spin.axis),
            revPerSecond: spec.spin.rev_per_s,
            angle: 0,
          }
        : undefined,
    };

    object.userData.part = part;
    for (const mesh of meshes) mesh.userData.part = part;
    parts.push(part);
  });

  const flowMeshes: THREE.Object3D[] = [];
  const flowMaterials = new Set<THREE.Material>();

  for (const spec of manifest.flows) {
    const object = byName.get(spec.node);
    if (!object) {
      console.warn(`[full-flow] Missing flow node: ${spec.node}`);
      continue;
    }

    object.visible = false;
    object.renderOrder = 2;

    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      for (const material of materialsOf(child)) {
        material.transparent = true;
        material.opacity = 0.9;
        material.depthWrite = false;
        material.toneMapped = false;
        if (material instanceof THREE.MeshStandardMaterial) {
          material.metalness = 0;
          material.roughness = 0.55;
          material.emissiveIntensity = 0.45;
        }
        material.needsUpdate = true;
        flowMaterials.add(material);
      }
    });

    flowMeshes.push(object);
  }

  const bounds = new THREE.Box3();
  for (const part of parts) bounds.expandByObject(part.object);

  const maxOrder = Math.max(0, ...parts.map((part) => part.spec.explode_order));

  return {
    root,
    manifest,
    parts,
    pickMeshes,
    flowMeshes,
    flowMaterials: [...flowMaterials],
    partMaterials,
    bounds,
    maxOrder,
  };
}
