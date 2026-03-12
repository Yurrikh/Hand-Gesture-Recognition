// =============================================================================
// camera_test.js – MediaPipe Hands: webcam + landmark drawing + gesture detection
//
// Entry point: waits for DOMContentLoaded, then calls startCamera().
// Camera uses native getUserMedia (no MediaPipe Camera utility dependency).
//
// Gestures:
//   0 → thumb tip near index  finger tip
//   1 → thumb tip near middle finger tip
//   2 → thumb tip near ring   finger tip
//
// KEY FIX: gesture threshold is now RELATIVE to hand size, not a fixed number.
// This means detection works correctly whether your hand is close or far away.
// =============================================================================

// ── Landmark indices (from MediaPipe hand model) ──────────────────────────────
const THUMB_TIP   = 4;
const INDEX_TIP   = 8;
const MIDDLE_TIP  = 12;
const RING_TIP    = 16;
const WRIST       = 0;   // used as reference point for hand size
const MID_MCP     = 9;   // middle finger knuckle – stable base landmark

// ── Relative touch sensitivity ────────────────────────────────────────────────
// The actual threshold = TOUCH_RATIO * handSize (measured each frame).
// This makes detection scale-invariant: works at any distance from the camera.
//
// How to tune:
//   Too many false gestures  → lower this value (e.g. 0.25)
//   Gesture too hard to trigger → raise this value (e.g. 0.35)
const TOUCH_RATIO = 0.30;

// ── Euclidean distance between two landmarks ──────────────────────────────────
function landmarkDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Hand size reference ───────────────────────────────────────────────────────
// Returns the distance from wrist to middle-finger knuckle.
// This value shrinks when the hand is far away and grows when it is close,
// so using it as a reference makes all other distances scale-invariant.
function getHandSize(landmarks) {
  return landmarkDistance(landmarks[WRIST], landmarks[MID_MCP]);
}

// ── Gesture detection – returns 0, 1, 2 or null ──────────────────────────────
function detectGesture(landmarks) {
  const handSize = getHandSize(landmarks);

  // Dynamic threshold: scales with how big the hand appears on screen
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
function onResults(results, canvasElement, canvasCtx, gestureLabel, statusLabel) {
  canvasCtx.save();

  // Clear canvas and apply horizontal mirror transform
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.translate(canvasElement.width, 0);
  canvasCtx.scale(-1, 1);

  // Draw the video frame onto the canvas
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0]; // first hand only

    // Draw skeleton connections
    drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
      color: "#00FF00", lineWidth: 3,
    });

    // Draw landmark dots
    drawLandmarks(canvasCtx, landmarks, {
      color: "#FF0000", lineWidth: 1, radius: 4,
    });

    // Show the current dynamic threshold in the status bar so you can
    // see it responding to hand distance in real time (useful for tuning)
    const handSize  = getHandSize(landmarks);
    const threshold = (TOUCH_RATIO * handSize).toFixed(4);
    statusLabel.textContent = `Status: Camera active ✓  |  hand size: ${handSize.toFixed(3)}  threshold: ${threshold}`;

    const gesture = detectGesture(landmarks);
    gestureLabel.textContent = gesture !== null ? `Gesture: ${gesture}` : "Gesture: –";
  } else {
    gestureLabel.textContent = "Gesture: (no hand)";
    statusLabel.textContent  = "Status: Camera active ✓";
  }

  canvasCtx.restore();
}

// ── Main – runs after DOM and all scripts are fully loaded ────────────────────
window.addEventListener("DOMContentLoaded", () => {
  const statusLabel   = document.getElementById("status-label");
  const gestureLabel  = document.getElementById("gesture-label");
  const videoElement  = document.getElementById("input-video");
  const canvasElement = document.getElementById("output-canvas");
  const canvasCtx     = canvasElement.getContext("2d");

  // Guard: verify MediaPipe globals loaded correctly before proceeding
  if (typeof Hands === "undefined") {
    statusLabel.textContent = "ERROR: MediaPipe Hands not loaded. Check CDN scripts in index.html.";
    console.error("Hands is not defined – MediaPipe CDN script failed.");
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
    onResults(results, canvasElement, canvasCtx, gestureLabel, statusLabel)
  );

  // ── Request webcam via native getUserMedia ──────────────────────────────────
  async function startCamera() {
    statusLabel.textContent = "Status: Requesting camera permission…";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusLabel.textContent =
        "ERROR: Camera API unavailable. Page must be served over HTTPS or localhost.";
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

  // ── Frame loop ──────────────────────────────────────────────────────────────
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

  // ── Go! ─────────────────────────────────────────────────────────────────────
  startCamera();
});

// =============================================================================
// Flow summary:
//   DOMContentLoaded fires
//   → guard checks confirm MediaPipe loaded
//   → startCamera() calls getUserMedia → browser shows permission popup
//   → on approval, video plays and processFrame() loop begins
//   → each frame sent to hands.send() → MediaPipe calls onResults()
//   → onResults() measures hand size, computes dynamic threshold,
//     draws skeleton, calls detectGesture(), updates label
// =============================================================================
