import { useFrame } from '@react-three/fiber';
import { useMemo, type RefObject } from 'react';
import { Vector3, type Camera } from 'three';
import type { Vec3 } from '@/lib/geometry';

/** Position a normal React math label from the live camera, avoiding separate Html roots. */
export function PlaneNamePosition({ label, position = [-2.1, 0.08, 1.45] }: { label: RefObject<HTMLDivElement | null>; position?: Vec3 }) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => { camera.updateMatrixWorld(); placeLabel(label.current, position, camera, size, point); });
  return null;
}
/** Screen position (px) of a world point in the live canvas; `visible` is false behind the camera. */
export function screenPoint(position: Vec3, camera: Camera, size: { width: number; height: number }, point = new Vector3()) {
  point.set(...position).project(camera);
  return { x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2, visible: point.z < 1 };
}
/** Centre an HTML label on a screen position. */
export function placeAt(element: HTMLElement | null, x: number, y: number, visible = true) {
  if (!element) return;
  element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  element.style.visibility = visible ? 'visible' : 'hidden';
}
/** Centre an HTML label on the screen projection of a world point (hidden behind the camera). */
export function placeLabel(element: HTMLElement | null, position: Vec3, camera: Camera, size: { width: number; height: number }, point = new Vector3()) {
  const s = screenPoint(position, camera, size, point);
  placeAt(element, s.x, s.y, s.visible);
}
