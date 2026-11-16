import { useFrame } from '@react-three/fiber';
import { useMemo, type RefObject } from 'react';
import { Vector3 } from 'three';
import type { Vec3 } from '@/lib/geometry';

/** Position a normal React math label from the live camera, avoiding separate Html roots. */
export function PlaneNamePosition({ label, position = [-2.1, 0.08, 1.45] }: { label: RefObject<HTMLDivElement | null>; position?: Vec3 }) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const element = label.current;
    if (!element) return;
    point.set(...position).project(camera);
    element.style.transform = `translate(${(point.x + 1) * size.width / 2}px, ${(1 - point.y) * size.height / 2}px) translate(-50%, -50%)`;
    element.style.visibility = point.z < 1 ? 'visible' : 'hidden';
  });
  return null;
}