
import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import { bloom } from "three/addons/tsl/display/BloomNode.js";

import {
  Fn,
  If,
  color,
  float,
  hash,
  instanceIndex,
  length,
  mix,
  mx_fractal_noise_vec3,
  smoothstep,
  sin,
  storage,
  uniform,
  uv,
  vec2,
  vec3,
  exp,
  pass,
} from "three/tsl";

const COUNT = 8192;

export default function FluidParticles({ gesture, handPosition }) {
  const mountRef = useRef(null);
  const gestureRef = useRef(gesture);
  const handRef = useRef(handPosition);

  gestureRef.current = gesture;
  handRef.current = handPosition;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let animationId = null;
    let resizeObserver = null;

    let renderer;
    let material;
    let geometry;
    let particleMesh;
    let renderPipeline;

    let mouseActive = false;
    const mousePosition = new THREE.Vector2();
    const lastTarget = new THREE.Vector3();
    let hasPreviousTarget = false;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);

    // Simulation uniforms
    const uTime = uniform(0);
    const uDelta = uniform(0.016);
    const uTarget = uniform(new THREE.Vector3());
    const uTargetVelocity = uniform(new THREE.Vector3());
    const uMode = uniform(0);
    const uRadius = uniform(3);
    const uStrength = uniform(2);
    const uHomeStrength = uniform(0.8);
    const uBounds = uniform(new THREE.Vector2(8, 6));
    const uParticleSize = uniform(0.085);

    // Particle buffers
    const positionAttribute =
      new THREE.StorageInstancedBufferAttribute(COUNT, 4);

    const velocityAttribute =
      new THREE.StorageInstancedBufferAttribute(COUNT, 4);

    const homeAttribute =
      new THREE.StorageInstancedBufferAttribute(COUNT, 4);

    const initialPositions = positionAttribute.array;
    const initialVelocities = velocityAttribute.array;
    const homePositions = homeAttribute.array;

    // Distribute particles across the entire screen.
    for (let i = 0; i < COUNT; i++) {
      const index = i * 4;

      const x = (Math.random() - 0.5) * 15;
      const y = (Math.random() - 0.5) * 10;
      const z = (Math.random() - 0.5) * 2;

      initialPositions[index] = x;
      initialPositions[index + 1] = y;
      initialPositions[index + 2] = z;
      initialPositions[index + 3] = Math.random();

      homePositions[index] = x;
      homePositions[index + 1] = y;
      homePositions[index + 2] = z;
      homePositions[index + 3] = 1;

      initialVelocities[index] = 0;
      initialVelocities[index + 1] = 0;
      initialVelocities[index + 2] = 0;
      initialVelocities[index + 3] = 0;
    }

    const positions = storage(positionAttribute, "vec4", COUNT);
    const velocities = storage(velocityAttribute, "vec4", COUNT);
    const homes = storage(homeAttribute, "vec4", COUNT);

    // GPU particle simulation
    const updateParticles = Fn(() => {
      const position = positions.element(instanceIndex);
      const velocity = velocities.element(instanceIndex);

      const p = position.xyz;
      const v = velocity.xyz;
      const dt = uDelta;

      const home = homes.element(instanceIndex).xyz;

      // Preserve the overall particle distribution.
      const returnForce = home.sub(p);

      v.addAssign(
        returnForce.mul(uHomeStrength).mul(dt)
      );

      // Continuous fluid turbulence.
      const noise = mx_fractal_noise_vec3(
        p.mul(0.32).add(
          vec3(
            uTime.mul(0.035),
            uTime.mul(0.025),
            uTime.mul(0.02)
          )
        ),
        2,
        2.0,
        0.5,
        0.8
      );

      v.addAssign(
        noise.mul(dt).mul(4.0)
      );

      // Natural swirling motion.
      const swirl = vec3(
        p.y.negate(),
        p.x,
        0
      ).normalize().mul(0.35);

      v.addAssign(
        swirl.mul(dt)
      );

      const difference = uTarget.sub(p);
      const distance = length(difference);

      const influence = float(1)
        .sub(distance.div(uRadius))
        .clamp();

      // POINTING: strong localized particle swoosh.
      If(uMode.equal(1), () => {
        const localInfluence = influence.mul(influence);

        const tangent = vec3(
          difference.y.negate(),
          difference.x,
          0
        ).normalize();

        // Gentle inward movement.
        v.addAssign(
          difference.mul(0.7).mul(localInfluence).mul(dt)
        );

        // Swirling movement around the fingertip.
        v.addAssign(
          tangent.mul(9.0).mul(localInfluence).mul(dt)
        );

        // Particles inherit fingertip movement.
        v.addAssign(
          uTargetVelocity.mul(localInfluence).mul(1.8).mul(dt)
        );
      });

      // OPEN PALM: scatter nearby particles.
      If(uMode.equal(2), () => {
        const outward = p.sub(uTarget).normalize();

        v.addAssign(
          outward.mul(35.0).mul(influence).mul(dt)
        );
      });

      // PINCH: gather particles around fingertips.
      If(uMode.equal(3), () => {
        v.addAssign(
          difference.mul(12.0).mul(influence).mul(dt)
        );
      });

      // FIST: quickly gather nearby particles into a sphere.
      If(uMode.equal(4), () => {
        const radial = p.sub(uTarget).normalize();

        const sphereTarget = uTarget.add(
          radial.mul(1.5)
        );

        v.addAssign(
          sphereTarget.sub(p).mul(18.0).mul(influence).mul(dt)
        );
      });

      // Velocity damping.
      v.mulAssign(
        float(1).sub(dt.mul(1.8))
      );

      p.addAssign(v.mul(dt));

      // Screen boundaries.
      If(p.x.greaterThan(uBounds.x), () => {
        p.x.subAssign(uBounds.x.mul(2));
      });

      If(p.x.lessThan(uBounds.x.negate()), () => {
        p.x.addAssign(uBounds.x.mul(2));
      });

      If(p.y.greaterThan(uBounds.y), () => {
        p.y.subAssign(uBounds.y.mul(2));
      });

      If(p.y.lessThan(uBounds.y.negate()), () => {
        p.y.addAssign(uBounds.y.mul(2));
      });
    })().compute(COUNT);

    // Mouse interaction.
    const handlePointerMove = (event) => {
      const rect = mount.getBoundingClientRect();

      mousePosition.set(
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height
      );

      mouseActive = true;
    };

    const handlePointerLeave = () => {
      mouseActive = false;
    };

    mount.addEventListener("pointermove", handlePointerMove);
    mount.addEventListener("pointerleave", handlePointerLeave);

    async function start() {
      try {
        renderer = new THREE.WebGPURenderer({
          alpha: true,
          antialias: false,
        });

        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio, 1.5)
        );

        await renderer.init();

        if (disposed) {
          renderer.dispose();
          return;
        }

        renderer.setClearColor(0x000000, 0);
        mount.appendChild(renderer.domElement);

        renderer.domElement.style.position = "absolute";
        renderer.domElement.style.inset = "0";
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";

        geometry = new THREE.PlaneGeometry(1, 1);
        material = new THREE.SpriteNodeMaterial();

        material.transparent = true;
        material.blending = THREE.AdditiveBlending;
        material.depthWrite = false;
        material.depthTest = false;
        material.toneMapped = false;

        material.positionNode = positions.toAttribute();

        material.scaleNode = vec2(
          uParticleSize.mul(
            mix(0.65, 1.6, hash(instanceIndex))
          )
        );

        // Pink, rose, coral, lavender and white gradient.
        material.colorNode = Fn(() => {
          const t = hash(instanceIndex);

          const pink = color(0xF1B3C4);
          const rose = color(0xE45B8C);
          const coral = color(0xEF909B);
          const lavender = color(0xC29FDB);
          const purple = color(0x8A7BB7);
          const white = color(0xFFFFFF);

          const c1 = mix(pink, rose, smoothstep(0.0, 0.25, t));
          const c2 = mix(c1, coral, smoothstep(0.25, 0.4, t));
          const c3 = mix(c2, lavender, smoothstep(0.4, 0.65, t));
          const c4 = mix(c3, purple, smoothstep(0.65, 0.85, t));
          const c5 = mix(c4, white, smoothstep(0.85, 1.0, t));

          const pulse = sin(
            uTime.mul(1.5).add(t.mul(6.28318))
          ).mul(0.12).add(1.0);

          return c5.mul(pulse).mul(1.5);
        })();

        // Soft radial glow.
        material.opacityNode = Fn(() => {
          const centeredUV = uv().sub(0.5);
          const d = length(centeredUV);

          const innerGlow = float(1).sub(
            smoothstep(0.0, 0.16, d)
          );

          const middleGlow = exp(d.mul(-12.0));
          const outerGlow = exp(d.mul(-5.0));

          return innerGlow.mul(0.75)
            .add(middleGlow.mul(0.45))
            .add(outerGlow.mul(0.12))
            .mul(float(1).sub(smoothstep(0.35, 0.5, d)));
        })();

        particleMesh = new THREE.InstancedMesh(
          geometry,
          material,
          COUNT
        );

        particleMesh.instanceMatrix.setUsage(
          THREE.DynamicDrawUsage
        );

        particleMesh.frustumCulled = false;
        scene.add(particleMesh);

        // Bloom post-processing.
        renderPipeline = new THREE.RenderPipeline(renderer);

        const scenePass = pass(scene, camera);
        const sceneColor = scenePass.getTextureNode("output");

        const bloomPass = bloom(sceneColor);

        bloomPass.threshold.value = 0.15;
        bloomPass.strength.value = 1.2;
        bloomPass.radius.value = 0.6;

        renderPipeline.outputNode = sceneColor.add(bloomPass);

        // Resize.
        const resize = () => {
          const rect = mount.getBoundingClientRect();

          const width = Math.max(rect.width, 1);
          const height = Math.max(rect.height, 1);

          renderer.setSize(width, height);

          camera.aspect = width / height;
          camera.updateProjectionMatrix();

          const visibleHeight =
            2 *
            Math.tan(
              THREE.MathUtils.degToRad(camera.fov / 2)
            ) *
            camera.position.z;

          const visibleWidth = visibleHeight * camera.aspect;

          uBounds.value.set(
            visibleWidth / 2 + 1,
            visibleHeight / 2 + 1
          );
        };

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount);
        resize();

        const clock = new THREE.Clock();

        // Main animation loop.
        const animate = () => {
          if (disposed) return;

          animationId = requestAnimationFrame(animate);

          const dt = Math.min(clock.getDelta(), 0.033);

          uDelta.value = dt;
          uTime.value += dt;

          const currentGesture = gestureRef.current;
          const hand = handRef.current;

          let mode = 0;
          let targetX = 0;
          let targetY = 0;

          // Camera gesture priority.
          if (currentGesture === "POINTING") {
            mode = 1;
          } else if (currentGesture === "OPEN PALM") {
            mode = 2;
          } else if (currentGesture === "PINCH") {
            mode = 3;
          } else if (currentGesture === "FIST") {
            mode = 4;
          }

          if (mode !== 0 && hand) {
            const width = uBounds.value.x * 2;
            const height = uBounds.value.y * 2;

            targetX = (0.5 - hand.x) * width;
            targetY = (0.5 - hand.y) * height;
          } else if (mode === 0 && mouseActive) {
            mode = 1;

            const width = uBounds.value.x * 2;
            const height = uBounds.value.y * 2;

            targetX = (mousePosition.x - 0.5) * width;
            targetY = (0.5 - mousePosition.y) * height;
          }

          uMode.value = mode;

          // Individual gesture settings.
          if (mode === 0) {
            uHomeStrength.value = 0.8;
          } else if (mode === 1) {
            uRadius.value = 3.5;
            uStrength.value = 9;
            uHomeStrength.value = 0.12;
          } else if (mode === 2) {
            uRadius.value = 5;
            uStrength.value = 35;
            uHomeStrength.value = 0.08;
          } else if (mode === 3) {
            uRadius.value = 3.5;
            uStrength.value = 12;
            uHomeStrength.value = 0.08;
          } else if (mode === 4) {
            uRadius.value = 5;
            uStrength.value = 18;
            uHomeStrength.value = 0.05;
          }

          if (mode !== 0) {
            uTarget.value.set(targetX, targetY, 0);

            if (mode === 1 && hasPreviousTarget && dt > 0) {
              uTargetVelocity.value.set(
                (targetX - lastTarget.x) / dt,
                (targetY - lastTarget.y) / dt,
                0
              );

              const speed = uTargetVelocity.value.length();

              if (speed > 35) {
                uTargetVelocity.value.multiplyScalar(35 / speed);
              }
            } else {
              uTargetVelocity.value.set(0, 0, 0);
            }

            lastTarget.set(targetX, targetY, 0);
            hasPreviousTarget = true;
          } else {
            uTargetVelocity.value.set(0, 0, 0);
            hasPreviousTarget = false;
          }

          renderer.compute(updateParticles);
          renderPipeline.render();
        };

        animate();
      } catch (error) {
        console.error("GestureFlow GPU error:", error);
      }
    }

    start();

    return () => {
      disposed = true;

      if (animationId) cancelAnimationFrame(animationId);

      resizeObserver?.disconnect();

      mount.removeEventListener("pointermove", handlePointerMove);
      mount.removeEventListener("pointerleave", handlePointerLeave);

      if (particleMesh) scene.remove(particleMesh);

      geometry?.dispose();
      material?.dispose();
      renderPipeline?.dispose();
      renderer?.dispose();

      if (renderer?.domElement?.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="fluid-particles" />;
}
