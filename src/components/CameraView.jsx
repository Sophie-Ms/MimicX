
import { useEffect, useRef, useState } from "react";

import {
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";

import { detectGesture } from "../utils/gestureDetection";

export default function CameraView({ onGestureUpdate }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animationRef = useRef(null);

  const lastDetectionRef = useRef(0);
  const smoothPositionRef = useRef(null);
  const previousGestureRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [status, setStatus] = useState("Camera is off");
  const [error, setError] = useState("");

  const stopCamera = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (landmarkerRef.current) {
      landmarkerRef.current.close();
      landmarkerRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (canvasRef.current) {
      const context = canvasRef.current.getContext("2d");
      context.clearRect(
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      );
    }

    smoothPositionRef.current = null;
    previousGestureRef.current = null;

    onGestureUpdate?.("NONE", null);

    setCameraOn(false);
    setStatus("Camera is off");
  };

  const startCamera = async () => {
    try {
      setError("");
      setStatus("Starting camera...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;

      await video.play();

      setStatus("Loading hand tracking...");

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const handLandmarker = await HandLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath: "/models/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }
      );

      landmarkerRef.current = handLandmarker;

      setCameraOn(true);
      setStatus("Show your hand to the camera");

      const detectHands = (timestamp) => {
        const currentVideo = videoRef.current;
        const canvas = canvasRef.current;
        const landmarker = landmarkerRef.current;

        if (!currentVideo || !canvas || !landmarker) return;

        if (
          currentVideo.readyState >= 2 &&
          timestamp - lastDetectionRef.current >= 33
        ) {
          lastDetectionRef.current = timestamp;

          const context = canvas.getContext("2d");

          if (
            canvas.width !== currentVideo.videoWidth ||
            canvas.height !== currentVideo.videoHeight
          ) {
            canvas.width = currentVideo.videoWidth;
            canvas.height = currentVideo.videoHeight;
          }

          context.clearRect(0, 0, canvas.width, canvas.height);

          const results = landmarker.detectForVideo(
            currentVideo,
            timestamp
          );

          if (results.landmarks.length > 0) {
            const landmarks = results.landmarks[0];

            const gesture = detectGesture(landmarks);

            let controlPoint;

            if (gesture === "POINTING") {
              // Follow the index fingertip directly
              controlPoint = landmarks[8];
            } else if (gesture === "PINCH") {
              // Follow the midpoint between thumb and index
              controlPoint = {
                x: (landmarks[4].x + landmarks[8].x) / 2,
                y: (landmarks[4].y + landmarks[8].y) / 2,
              };
            } else {
              // Palm centre for other gestures
              controlPoint = landmarks[9];
            }

            // Reset position when changing gestures
            if (previousGestureRef.current !== gesture) {
              smoothPositionRef.current = {
                x: controlPoint.x,
                y: controlPoint.y,
              };

              previousGestureRef.current = gesture;
            } else if (!smoothPositionRef.current) {
              smoothPositionRef.current = {
                x: controlPoint.x,
                y: controlPoint.y,
              };
            } else {
              // Faster response for pointing
              const smoothing =
                gesture === "POINTING" ? 0.75 : 0.35;

              smoothPositionRef.current.x +=
                (controlPoint.x - smoothPositionRef.current.x) *
                smoothing;

              smoothPositionRef.current.y +=
                (controlPoint.y - smoothPositionRef.current.y) *
                smoothing;
            }

            onGestureUpdate?.(
              gesture,
              smoothPositionRef.current
            );

            setStatus(`Gesture: ${gesture}`);

            // Draw hand connections
            for (const connection of HandLandmarker.HAND_CONNECTIONS) {
              const start = landmarks[connection.start];
              const end = landmarks[connection.end];

              context.beginPath();

              context.moveTo(
                start.x * canvas.width,
                start.y * canvas.height
              );

              context.lineTo(
                end.x * canvas.width,
                end.y * canvas.height
              );

              context.strokeStyle = "#a88aff";
              context.lineWidth = 3;
              context.stroke();
            }

            // Draw landmarks
            landmarks.forEach((point) => {
              context.beginPath();

              context.arc(
                point.x * canvas.width,
                point.y * canvas.height,
                5,
                0,
                Math.PI * 2
              );

              context.fillStyle = "#ffffff";
              context.fill();

              context.strokeStyle = "#a88aff";
              context.lineWidth = 2;
              context.stroke();
            });
          } else {
            smoothPositionRef.current = null;
            previousGestureRef.current = null;

            onGestureUpdate?.("NONE", null);

            setStatus("No hand detected — show your hand");
          }
        }

        animationRef.current = requestAnimationFrame(detectHands);
      };

      animationRef.current = requestAnimationFrame(detectHands);
    } catch (err) {
      console.error("Hand tracking error:", err);

      setError(err.message || "Could not start hand tracking.");

      stopCamera();
      setStatus("Unable to start tracking");
    }
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (landmarkerRef.current) {
        landmarkerRef.current.close();
      }
    };
  }, []);

  return (
    <div className="camera-container">
      <h2>GESTUREFLOW TRACKING</h2>

      <div className="camera-screen">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
        />

        <canvas ref={canvasRef} />

        {!cameraOn && <p>Camera is currently off</p>}
      </div>

      <button onClick={cameraOn ? stopCamera : startCamera}>
        {cameraOn ? "Stop Camera" : "Start Hand Tracking"}
      </button>

      <p className="camera-status">{status}</p>

      {error && <p className="camera-error">{error}</p>}
    </div>
  );
}
