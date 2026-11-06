
import { useState } from "react";
import FluidParticles from "./FluidParticles";
import CameraView from "./CameraView";
import "./ParticlePlayground.css";

export default function ParticlePlayground() {
  const [gestureData, setGestureData] = useState({
    gesture: "NONE",
    position: null,
  });

  const handleGestureUpdate = (gesture, position) => {
    setGestureData({ gesture, position });
  };

  return (
    <main className="particle-page">
      <FluidParticles
        gesture={gestureData.gesture}
        handPosition={gestureData.position}
      />

      <header className="particle-header">
        <div className="particle-logo">GESTUREFLOW</div>
        <div className="particle-label">PARTICLE PLAYGROUND</div>
      </header>

      <section className="particle-content">
        <p className="particle-eyebrow">INTERACT WITH THE UNSEEN</p>

        <h1>
          Move your hand.
          <br />
          <span>Shape the universe.</span>
        </h1>

        <p className="particle-description">
          Control the particles using your hand gestures.
        </p>

        <div className="particle-hint">
          {gestureData.gesture === "NONE"
            ? "START YOUR CAMERA TO BEGIN"
            : `CURRENT GESTURE: ${gestureData.gesture}`}
        </div>
      </section>

      <CameraView onGestureUpdate={handleGestureUpdate} />
    </main>
  );
}
