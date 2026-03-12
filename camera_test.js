// =============================================================================
// camera_test.js – MediaPipe Hands: webcam + landmark drawing + gesture detection
//
// This file is responsible ONLY for camera logic.
// It writes the current detected gesture to window.cameraGesture so that
// app.js can read it and combine it with the EMG signal.
//
// Gestures:
//   0 → thumb tip near index  finger tip
//   1 → thumb tip near middle finger tip
//   2 → thumb tip near ring   finger tip
// =============================================================================

// ── Shared state – read by app.js ─────────────────────────────────────────────
// null  = no gesture detected
// 0/1/2 = gesture number
window.cameraGesture = null;

// ── Landmark indices ──────────────────────────────────────────────────────────
const THUMB_TIP  = 4;
const INDEX_TIP  = 8;
const MIDDLE_TIP = 12;
const RING_TIP   = 16;
const WRIST      = 0;
const MID_MCP    = 9;

// ── Relative touch sensitivity ────────────────────────────────────────────────
// Threshold = TOUCH_RATIO × handSize (measured each frame).
// This makes detection work at any distance from the camera.
// Tune: lower = stricter, higher = easier to trigger.
const TOUCH_RATIO = 0.30;

// ── Euclidean distance between two landmarks ──────────────────────────────────
function landmarkDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Hand size: wrist → middle knuckle (stable reference) ─────────────────────
function getHandSize(landmarks) {
  return landmarkDistance(landmarks[WRIST], landmarks[MID_MCP]);
}

// ── Gesture detection ─────────────────────────────────────────────────────────
function detectGesture(landmarks) {
  const handSize  = getHandSize(landmarks);
  const threshold = TOUCH_RATIO * handSize;

  const thumb  = landmarks[THUMB_TIP];
  const index  = landmarks[INDEX_TIP];
  const middle = landmarks[MIDDLE_TIP];
  const ring   = landmarks[RING_TIP];

  if (landmarkDistance(thumb, index)  < threshold) return 0;
  if (landmarkDistance(thumb, middle) < threshold) return 1;
  if (landmarkDistance(thumb, ring)   < threshold) return 2;
  return null;
}

// ── MediaPipe results callback ────────────────────────────────────────────────
function onResults(results, canvasElement, canvasCtx, statusLabel) {
  canvasCtx.save();

  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.translate(canvasElement.width, 0);
  canvasCtx.scale(-1, 1);

  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];

    drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
      color: "#00FF00", lineWidth: 3,
    });
    drawLandmarks(canvasCtx, landmarks, {
      color: "#FF0000", lineWidth: 1, radius: 4,
    });

    // Write gesture to shared state for app.js to consume
    window.cameraGesture = detectGesture(landmarks);

    // Show live hand size in status bar (useful for tuning TOUCH_RATIO)
    const handSize  = getHandSize(landmarks);
    const threshold = (TOUCH_RATIO * handSize).toFixed(4);
    statusLabel.textContent = `Camera active ✓  |  hand size: ${handSize.toFixed(3)}  threshold: ${threshold}`;

  } else {
    // No hand visible – clear the shared state
    window.cameraGesture = null;
    statusLabel.textContent = "Camera active ✓  |  (no hand in frame)";
  }

  canvasCtx.restore();
}

// ── Main ──────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  const statusLabel   = document.getElementById("status-label");
  const videoElement  = document.getElementById("input-video");
  const canvasElement = document.getElementById("output-canvas");
  const canvasCtx     = canvasElement.getContext("2d");

  // Guard: make sure MediaPipe loaded from CDN
  if (typeof Hands === "undefined") {
    statusLabel.textContent = "ERROR: MediaPipe Hands not loaded. Check CDN scripts in index.html.";
    console.error("Hands is not defined.");
    return;
  }
  if (typeof drawConnectors === "undefined" || typeof drawLandmarks === "undefined") {
    statusLabel.textContent = "ERROR: MediaPipe drawing_utils not loaded. Check CDN scripts in index.html.";
    console.error("drawConnectors / drawLandmarks not defined.");
    return;
  }

  statusLabel.textContent = "Status: Initialising MediaPipe…";

  // ── Initialise MediaPipe Hands ──────────────────────────────────────────────
  const hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });

  hands.onResults((results) =>
    onResults(results, canvasElement, canvasCtx, statusLabel)
  );

  // ── Webcam via getUserMedia ───────────────────────────────────────────────
  async function startCamera() {
    statusLabel.textContent = "Status: Requesting camera permission…";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusLabel.textContent =
        "ERROR: Camera API unavailable. Use HTTPS or localhost.";
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
    } catch (err) {
      statusLabel.textContent = `ERROR: ${err.name} – ${err.message}`;
      console.error("getUserMedia failed:", err);
      return;
    }

    videoElement.srcObject = stream;
    videoElement.onloadedmetadata = () => {
      videoElement.play();
      statusLabel.textContent = "Status: Camera active ✓";
      processFrame();
    };
  }

  // ── Frame loop ────────────────────────────────────────────────────────────
  async function processFrame() {
    if (videoElement.readyState >= 2) {
      try {
        await hands.send({ image: videoElement });
      } catch (err) {
        console.warn("hands.send() skipped a frame:", err);
      }
    }
    requestAnimationFrame(processFrame);
  }

  startCamera();
});
