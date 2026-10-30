import * as THREE from 'three';
import type { EnginePart } from './loadEngine';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class Exploder {
  private target = 0;
  private current = 0;
  private readonly maxOrder: number;

  constructor(
    private readonly parts: EnginePart[],
    maxOrder: number,
    private readonly reducedMotion = false,
  ) {
    this.maxOrder = Math.max(1, maxOrder);
  }

  setProgress(value: number): void {
    this.target = clamp01(value);
  }

  get progress(): number {
    return this.current;
  }

  get targetProgress(): number {
    return this.target;
  }

  update(dt: number): number {
    if (this.reducedMotion) {
      this.current = this.target;
    } else {
      this.current = THREE.MathUtils.damp(this.current, this.target, 6, dt);
      if (Math.abs(this.current - this.target) < 0.0002) this.current = this.target;
    }

    for (const part of this.parts) {
      const delay = (part.spec.explode_order / this.maxOrder) * 0.45;
      const local = clamp01((this.current - delay) / (1 - delay));
      const eased = easeInOutCubic(local);
      part.object.position.copy(part.basePosition).addScaledVector(part.offset, eased);
    }

    return this.current;
  }

  boundsAt(progress: number): THREE.Box3 {
    const bounds = new THREE.Box3();
    const value = clamp01(progress);

    for (const part of this.parts) {
      const delay = (part.spec.explode_order / this.maxOrder) * 0.45;
      const local = clamp01((value - delay) / (1 - delay));
      const eased = easeInOutCubic(local);
      const offset = part.offset.clone().multiplyScalar(eased);
      bounds.union(part.localBox.clone().translate(offset));
    }

    return bounds;
  }

  resetInstant(): void {
    this.target = 0;
    this.current = 0;
    for (const part of this.parts) part.object.position.copy(part.basePosition);
  }
}
