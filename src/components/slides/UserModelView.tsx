import { Component, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";

class LoadGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <p className="slide-model-missing">Không mở được tệp mô hình</p>
    ) : (
      this.props.children
    );
  }
}

function Model({ src }: { src: string }) {
  const { scene } = useGLTF(src);
  return <primitive object={scene} />;
}

/** A teacher's own .glb/.gltf model (link or small upload), framed to fit and turnable with the mouse. */
export default function UserModelView({ src }: { src: string }) {
  return (
    <LoadGuard>
      <Canvas camera={{ position: [4, 3, 5], fov: 40 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} />
        <directionalLight position={[-5, -3, -4]} intensity={0.4} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.2}>
            <Model src={src} />
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </LoadGuard>
  );
}
