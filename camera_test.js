// =============================================================================
// camera_test.js – MediaPipe Hands: webcam + landmark drawing + gesture detection
//
// Writes detected gesture to window.cameraGesture (null or 0/1/2).
// Works on ANY page – all DOM references are null-checked so it never crashes
// if a particular element doesn't exist on the current page.
//
// Gestures:
//   0 → thumb tip near index  finger tip
//   1 → thumb tip near middle finger tip
//   2 → thumb tip near ring   finger tip
// =============================================================================

// ── Shared state – read by app.js and Hand_Gesture_Only.html ─────────────────
window.cameraGesture = null;

// ── Landmark indices ──────────────────────────────────────────────────────────
const THUMB_TIP  = 4;
const INDEX_TIP  = 8;
const MIDDLE_TIP = 12;
const RING_TIP   = 16;
const WRIST      = 0;
const MID_MCP    = 9;

// ── Sensitivity ───────────────────────────────────────────────────────────────
const TOUCH_RATIO = 0.30;

// ── Helpers ───────────────────────────────────────────────────────────────────
function landmarkDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getHandSize(landmarks) {
  return landmarkDistance(landmarks[WRIST], landmarks[MID_MCP]);
}

function detectGesture(landmarks) {
  const handSize  = getHandSize(landmarks);
  const threshold = TOUCH_RATIO * handSize;
  const thumb     = landmarks[THUMB_TIP];

  if (landmarkDistance(thumb, landmarks[INDEX_TIP])  < threshold) return 0;
  if (landmarkDistance(thumb, landmarks[MIDDLE_TIP]) < threshold) return 1;
  if (landmarkDistance(thumb, landmarks[RING_TIP])   < threshold) return 2;
  return null;
}

// ── Safe DOM writer – never crashes if element doesn't exist on this page ─────
function setStatus(msg) {
  const el = document.getElementById("status-label");
  if (el) el.textContent = msg;
}

// ── MediaPipe results callback ────────────────────────────────────────────────
function onResults(results, canvasElement, canvasCtx) {
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

    window.cameraGesture = detectGesture(landmarks);

    const handSize  = getHandSize(landmarks);
    const threshold = (TOUCH_RATIO * handSize).toFixed(4);
    setStatus(`Camera active ✓  |  hand size: ${handSize.toFixed(3)}  threshold: ${threshold}`);

  } else {
    window.cameraGesture = null;
    setStatus("Camera active ✓  |  (no hand in frame)");
  }

  canvasCtx.restore();
}

// ── Main ──────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  const videoElement  = document.getElementById("input-video");
  const canvasElement = document.getElementById("output-canvas");

  // If the required canvas/video elements don't exist on this page, stop early
  if (!videoElement || !canvasElement) {
    console.error("camera_test.js: missing #input-video or #output-canvas on this page.");
    return;
  }

  const canvasCtx = canvasElement.getContext("2d");

  // Guard: verify MediaPipe loaded
  if (typeof Hands === "undefined") {
    setStatus("ERROR: MediaPipe Hands not loaded. Check CDN scripts.");
    console.error("Hands is not defined.");
    return;
  }
  if (typeof drawConnectors === "undefined" || typeof drawLandmarks === "undefined") {
    setStatus("ERROR: MediaPipe drawing_utils not loaded. Check CDN scripts.");
    console.error("drawConnectors / drawLandmarks not defined.");
    return;
  }

  setStatus("Status: Initialising MediaPipe…");

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
    onResults(results, canvasElement, canvasCtx)
  );

  // ── Webcam ────────────────────────────────────────────────────────────────
  async function startCamera() {
    setStatus("Status: Requesting camera permission…");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("ERROR: Camera API unavailable. Use HTTPS or localhost.");
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
    } catch (err) {
      setStatus(`ERROR: ${err.name} – ${err.message}`);
      console.error("getUserMedia failed:", err);
      return;
    }

    videoElement.srcObject = stream;
    videoElement.onloadedmetadata = () => {
      videoElement.play();
      setStatus("Status: Camera active ✓");
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
