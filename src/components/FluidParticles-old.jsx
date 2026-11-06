
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";

const COUNT = 9000;
const WORLD_HEIGHT = 10;

export default function FluidParticles({
  gesture = "NONE",
  handPosition = null,
}) {
  const containerRef = useRef(null);
  const gestureRef = useRef(gesture);
  const handRef = useRef(handPosition);

  useEffect(() => {
    gestureRef.current = gesture;
    handRef.current = handPosition;
  }, [gesture, handPosition]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer = null;
    let animationId = null;
    let disposed = false;
    let resizeObserver = null;

    const scene = new THREE.Scene();

    const camera = new THREE.OrthographicCamera(
      -5, 5, 5, -5, 0.1, 100
    );
    camera.position.z = 20;

    const world = {
      width: 10,
      height: WORLD_HEIGHT,
    };

    const positions = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const sphereDirections = new Float32Array(COUNT * 3);

    const palette = [
      new THREE.Color("#9bdcff"),
      new THREE.Color("#c7a7ff"),
      new THREE.Color("#f5b7e9"),
      new THREE.Color("#ffffff"),
      new THREE.Color("#a8baff"),
    ];

    for (let i = 0; i < COUNT; i++) {
      const index = i * 3;

      positions[index] = (Math.random() - 0.5) * world.width;
      positions[index + 1] = (Math.random() - 0.5) * world.height;
      positions[index + 2] = (Math.random() - 0.5) * 3;

      velocities[index] = (Math.random() - 0.5) * 0.15;
      velocities[index + 1] = (Math.random() - 0.5) * 0.15;
      velocities[index + 2] = 0;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      sphereDirections[index] = Math.sin(phi) * Math.cos(theta);
      sphereDirections[index + 1] = Math.cos(phi);
      sphereDirections[index + 2] = Math.sin(phi) * Math.sin(theta);

      const color = palette[
        Math.floor(Math.random() * palette.length)
      ];

      colors[index] = color.r;
      colors[index + 1] = color.g;
      colors[index + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();

    const uvs = new Float32Array(COUNT * 2);

    for (let i = 0; i < COUNT; i++) {
      uvs[i * 2] = Math.random();
      uvs[i * 2 + 1] = Math.random();
    }

    geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(uvs, 2)
    );

    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors, 3)
    );

    // Soft particle texture
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 64;
    textureCanvas.height = 64;

    const ctx = textureCanvas.getContext("2d");

    const gradient = ctx.createRadialGradient(
      32, 32, 0, 32, 32, 32
    );

    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.2, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const particleTexture = new THREE.CanvasTexture(textureCanvas);

    const material = new THREE.PointsMaterial({
      size: 0.11,
      map: particleTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Mouse interaction
    const mouse = {
      x: 0,
      y: 0,
      active: false,
    };

    const onPointerMove = (event) => {
      const rect = container.getBoundingClientRect();

      if (!rect.width || !rect.height) return;

      mouse.x =
        ((event.clientX - rect.left) / rect.width - 0.5) *
        world.width;

      mouse.y =
        (0.5 - (event.clientY - rect.top) / rect.height) *
        WORLD_HEIGHT;

      mouse.active = true;
    };

    const onPointerLeave = () => {
      mouse.active = false;
    };

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);

    // Resize
    const resize = () => {
      if (disposed) return;

      const rect = container.getBoundingClientRect();

      const width = Math.max(1, Math.floor(rect.width || window.innerWidth));
      const height = Math.max(1, Math.floor(rect.height || window.innerHeight));

      world.width = WORLD_HEIGHT * (width / height);

      camera.left = -world.width / 2;
      camera.right = world.width / 2;
      camera.top = WORLD_HEIGHT / 2;
      camera.bottom = -WORLD_HEIGHT / 2;

      camera.updateProjectionMatrix();

      if (renderer) {
        renderer.setSize(width, height);
      }
    };

    // Hand position
    const getHandPosition = () => {
      const position = handRef.current;

      if (!position) return null;

      return {
        x: (0.5 - position.x) * world.width,
        y: (0.5 - position.y) * WORLD_HEIGHT,
      };
    };

    let previousTime = 0;

    // Particle simulation
    const animate = (time) => {
      if (disposed || !renderer) return;

      animationId = requestAnimationFrame(animate);

      const delta = previousTime
        ? Math.min((time - previousTime) / 1000, 0.033)
        : 0.016;

      previousTime = time;

      const currentGesture = gestureRef.current;
      const hand = getHandPosition();

      const damping = Math.pow(0.975, delta * 60);

      const halfWidth = world.width / 2;
      const halfHeight = WORLD_HEIGHT / 2;

      for (let i = 0; i < COUNT; i++) {
        const index = i * 3;

        let x = positions[index];
        let y = positions[index + 1];
        let z = positions[index + 2];

        let vx = velocities[index];
        let vy = velocities[index + 1];
        let vz = velocities[index + 2];

        // Natural flowing movement
        const flowX =
          Math.sin(y * 0.55 + time * 0.00035) * 0.22 +
          Math.cos(x * 0.35 - time * 0.0002) * 0.12;

        const flowY =
          Math.cos(x * 0.45 + time * 0.00025) * 0.22 +
          Math.sin(y * 0.35 + time * 0.0003) * 0.12;

        vx += flowX * delta;
        vy += flowY * delta;

        // Mouse interaction
        if (mouse.active) {
          const dx = mouse.x - x;
          const dy = mouse.y - y;
          const distance = Math.hypot(dx, dy) + 0.001;

          if (distance < 3.5) {
            const force = (1 - distance / 3.5) * 1.5;

            vx += (dx / distance) * force * delta;
            vy += (dy / distance) * force * delta;

            vx += (-dy / distance) * force * 0.45 * delta;
            vy += (dx / distance) * force * 0.45 * delta;
          }
        }

        // POINTING: Strong attraction towards index fingertip
        if (hand && currentGesture === "POINTING") {
          const dx = hand.x - x;
          const dy = hand.y - y;

          const distance = Math.hypot(dx, dy) + 0.001;

          const radius = 8;
          const influence = Math.max(0, 1 - distance / radius);
          const force = influence * 18;

          vx += (dx / distance) * force * delta;
          vy += (dy / distance) * force * delta;

          // Swirling movement around fingertip
          vx += (-dy / distance) * force * 0.35 * delta;
          vy += (dx / distance) * force * 0.35 * delta;
        }

        // OPEN PALM: Faster and wider particle explosion
        if (hand && currentGesture === "OPEN PALM") {
          const dx = x - hand.x;
          const dy = y - hand.y;

          const distance = Math.hypot(dx, dy) + 0.001;

          const radius = 7;
          const influence = Math.max(0, 1 - distance / radius);
          const force = influence * 22;

          vx += (dx / distance) * force * delta;
          vy += (dy / distance) * force * delta;

          // Add outward swirl
          vx += (-dy / distance) * force * 0.12 * delta;
          vy += (dx / distance) * force * 0.12 * delta;
        }

        // PINCH: Gather particles around fingertips
        if (hand && currentGesture === "PINCH") {
          const dx = hand.x - x;
          const dy = hand.y - y;

          const distance = Math.hypot(dx, dy) + 0.001;
          const influence = Math.max(0, 1 - distance / 5);
          const force = influence * 12;

          vx += (dx / distance) * force * delta;
          vy += (dy / distance) * force * delta;

          vx += (-dy / distance) * force * 0.25 * delta;
          vy += (dx / distance) * force * 0.25 * delta;
        }

        // FIST: Form a spherical particle cloud
        if (hand && currentGesture === "FIST") {
          const radius = 2.1;

          const targetX =
            hand.x + sphereDirections[index] * radius;

          const targetY =
            hand.y + sphereDirections[index + 1] * radius;

          const targetZ =
            sphereDirections[index + 2] * radius;

          const spring = 8;

          vx += (targetX - x) * spring * delta;
          vy += (targetY - y) * spring * delta;
          vz += (targetZ - z) * spring * delta;

          const fistDamping = Math.pow(0.94, delta * 60);

          vx *= fistDamping;
          vy *= fistDamping;
          vz *= fistDamping;
        }

        // Update velocity
        vx *= damping;
        vy *= damping;
        vz *= damping;

        const maxSpeed = currentGesture === "OPEN PALM" ? 15 : 10;
        const speed = Math.hypot(vx, vy, vz);

        if (speed > maxSpeed) {
          const scale = maxSpeed / speed;
          vx *= scale;
          vy *= scale;
          vz *= scale;
        }

        // Update position
        x += vx * delta;
        y += vy * delta;
        z += vz * delta;

        // Wrap particles around screen
        if (currentGesture !== "FIST") {
          if (x > halfWidth) x = -halfWidth;
          if (x < -halfWidth) x = halfWidth;
          if (y > halfHeight) y = -halfHeight;
          if (y < -halfHeight) y = halfHeight;
        }

        positions[index] = x;
        positions[index + 1] = y;
        positions[index + 2] = z;

        velocities[index] = vx;
        velocities[index + 1] = vy;
        velocities[index + 2] = vz;
      }

      geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };

    // Initialize WebGPU renderer
    const startRenderer = async () => {
      try {
        renderer = new WebGPURenderer({
          antialias: false,
          alpha: true,
        });

        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, 1.25)
        );

        await renderer.init();

        if (disposed) {
          renderer.dispose();
          renderer = null;
          return;
        }

        resize();

        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";

        container.appendChild(renderer.domElement);

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);

        window.addEventListener("resize", resize);

        animationId = requestAnimationFrame(animate);
      } catch (err) {
        console.error("WebGPU renderer error:", err);

        if (!disposed) {
          container.innerHTML =
            "WebGPU could not initialize. Check browser compatibility.";
        }
      }
    };

    startRenderer();

    return () => {
      disposed = true;

      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }

      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      window.removeEventListener("resize", resize);

      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);

      geometry.dispose();
      material.dispose();
      particleTexture.dispose();

      if (renderer) {
        renderer.dispose();

        if (renderer.domElement.parentElement === container) {
          container.removeChild(renderer.domElement);
        }
      }
    };
  }, []);

  return <div className="fluid-particles" ref={containerRef} />;
}
