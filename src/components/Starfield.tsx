import { useEffect, useRef } from "react";
import * as THREE from "three";

const STAR_COUNT = 900;
const DEPTH = 600;

export type StarfieldMode = "drift" | "battle" | "warp";

const TARGET_SPEED: Record<StarfieldMode, number> = {
  drift: 14,
  battle: 42,
  warp: 420,
};

/**
 * Full-viewport three.js starfield that sits behind every screen. Stars fly
 * toward the camera; `mode` eases the speed between menu drift, battle cruise
 * and the between-screens warp jump.
 */
export function Starfield({ mode }: { mode: StarfieldMode }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      1,
      DEPTH,
    );

    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const palette = [
      new THREE.Color("#9dffb8"),
      new THREE.Color("#ffffff"),
      new THREE.Color("#66ffe0"),
      new THREE.Color("#ffd27f"),
    ];
    for (let i = 0; i < STAR_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 500;
      positions[i * 3 + 2] = -Math.random() * DEPTH;
      const color = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 1.9,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const stars = new THREE.Points(geometry, material);
    scene.add(stars);

    let speed = TARGET_SPEED[modeRef.current];
    let rafId = 0;
    let timerId = 0;
    let disposed = false;
    let last = performance.now();

    // rAF when visible; timer fallback when the tab is hidden (rAF stops).
    const schedule = () => {
      if (disposed) return;
      if (document.hidden) {
        timerId = window.setTimeout(() => animate(performance.now()), 33);
      } else {
        rafId = requestAnimationFrame(animate);
      }
    };

    const animate = (now: number) => {
      schedule();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const target = TARGET_SPEED[modeRef.current];
      speed += (target - speed) * Math.min(dt * 2.2, 1);

      const pos = geometry.attributes.position;
      for (let i = 0; i < STAR_COUNT; i++) {
        let z = pos.getZ(i) + speed * dt;
        if (z > 10) {
          z = -DEPTH;
          pos.setX(i, (Math.random() - 0.5) * 500);
          pos.setY(i, (Math.random() - 0.5) * 500);
        }
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;

      // Warp stretches the points and pushes a subtle FOV punch.
      const warpAmount = Math.min(speed / TARGET_SPEED.warp, 1);
      material.size = 1.9 + warpAmount * 4.5;
      camera.fov = 70 + warpAmount * 22;
      camera.updateProjectionMatrix();
      stars.rotation.z += dt * 0.01;

      renderer.render(scene, camera);
    };
    schedule();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      window.removeEventListener("resize", onResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="starfield" aria-hidden="true" />;
}
