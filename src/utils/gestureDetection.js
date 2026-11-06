
function distance(point1, point2) {
  return Math.hypot(
    point1.x - point2.x,
    point1.y - point2.y
  );
}

function isFingerExtended(landmarks, tip, pip) {
  const wrist = landmarks[0];

  const tipDistance = distance(landmarks[tip], wrist);
  const pipDistance = distance(landmarks[pip], wrist);

  return tipDistance > pipDistance * 1.12;
}

export function detectGesture(landmarks) {
  const index = isFingerExtended(landmarks, 8, 6);
  const middle = isFingerExtended(landmarks, 12, 10);
  const ring = isFingerExtended(landmarks, 16, 14);
  const pinky = isFingerExtended(landmarks, 20, 18);

  const pinchDistance = distance(
    landmarks[4],
    landmarks[8]
  );

  // Thumb and index finger close together
  if (pinchDistance < 0.055) {
    return "PINCH";
  }

  // All four fingers folded
  if (!index && !middle && !ring && !pinky) {
    return "FIST";
  }

  // Only index finger extended
  if (index && !middle && !ring && !pinky) {
    return "POINTING";
  }

  // All four fingers extended
  if (index && middle && ring && pinky) {
    return "OPEN PALM";
  }

  return "HAND DETECTED";
}
