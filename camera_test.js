// ─────────────────────────────────────────────────────────────────────────────
// script.js  –  MediaPipe Hands: landmark drawing + simple gesture detection
//
// Camera access uses the native getUserMedia API directly.
// This is more reliable than the MediaPipe Camera utility on GitHub Pages.
//
// Gestures detected (thumb tip vs. finger tip distance threshold):
//   Gesture 0 → thumb touching index  finger
//   Gesture 1 → thumb touching middle finger
//   Gesture 2 → thumb touching ring   finger
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Grab DOM elements ──────────────────────────────────────────────────────
const videoElement  = document.getElementById("input-video");
const canvasElement = document.getElementById("output-canvas");
const canvasCtx     = canvasElement.getContext("2d");
const gestureLabel  = document.getElementById("gesture-label");
const statusLabel   = document.getElementById("status-label");

// ── 2. MediaPipe landmark indices we care about ───────────────────────────────
// Full landmark map: https://developers.google.com/mediapipe/solutions/vision/hand_landmarker
const THUMB_TIP  = 4;
const INDEX_TIP  = 8;
const MIDDLE_TIP = 12;
const RING_TIP   = 16;

// ── 3. Distance threshold (in normalised 0-1 coordinates) ────────────────────
// If the distance between two landmarks is below this value we call it a "touch".
// Tweak this if gestures feel too easy or too strict.
const TOUCH_THRESHOLD = 0.07;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Euclidean distance between two MediaPipe landmarks
// Each landmark has .x and .y in the range [0, 1]
// ─────────────────────────────────────────────────────────────────────────────
function landmarkDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gesture detection – returns 0, 1, 2 or null (no recognised gesture)
// ─────────────────────────────────────────────────────────────────────────────
function detectGesture(landmarks) {
  const thumb  = landmarks[THUMB_TIP];
  const index  = landmarks[INDEX_TIP];
  const middle = landmarks[MIDDLE_TIP];
  const ring   = landmarks[RING_TIP];

  if (landmarkDistance(thumb, index)  < TOUCH_THRESHOLD) return 0;
  if (landmarkDistance(thumb, middle) < TOUCH_THRESHOLD) return 1;
  if (landmarkDistance(thumb, ring)   < TOUCH_THRESHOLD) return 2;

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Called by MediaPipe every time a frame is processed
// ─────────────────────────────────────────────────────────────────────────────
function onResults(results) {
  canvasCtx.save();

  // Mirror the canvas horizontally so it behaves like a mirror
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.translate(canvasElement.width, 0);
  canvasCtx.scale(-1, 1);

  // Draw the current video frame onto the canvas
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  // Draw landmarks if a hand was detected
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0]; // first hand only

    // Draw connections (the "bones" of the hand skeleton)
    drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
      color: "#00FF00",
      lineWidth: 3,
    });

    // Draw each landmark dot
    drawLandmarks(canvasCtx, landmarks, {
      color: "#FF0000",
      lineWidth: 1,
      radius: 4,
    });

    // Detect gesture and update the label
    const gesture = detectGesture(landmarks);
    gestureLabel.textContent = gesture !== null
      ? `Gesture: ${gesture}`
      : "Gesture: –";

  } else {
    gestureLabel.textContent = "Gesture: (no hand)";
  }

  canvasCtx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialise MediaPipe Hands
// ─────────────────────────────────────────────────────────────────────────────
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence:  0.5,
});

hands.onResults(onResults);

// ─────────────────────────────────────────────────────────────────────────────
// Start webcam using native getUserMedia (works reliably on GitHub Pages)
// ─────────────────────────────────────────────────────────────────────────────
async function startCamera() {
  statusLabel.textContent = "Status: Requesting camera…";

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
  } catch (err) {
    statusLabel.textContent = `Status: Camera error – ${err.message}`;
    console.error("getUserMedia error:", err);
    return;
  }

  // Attach the stream to the (hidden) video element
  videoElement.srcObject = stream;

  // Wait until the video is actually playing before we start sending frames
  videoElement.onloadedmetadata = () => {
    videoElement.play();
    statusLabel.textContent = "Status: Camera active ✓";
    processFrame();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main loop – sends one video frame to MediaPipe on every animation frame
// ─────────────────────────────────────────────────────────────────────────────
async function processFrame() {
  // Only send a frame when the video has real pixel data
  if (videoElement.readyState >= 2) {
    await hands.send({ image: videoElement });
  }
  // Schedule the next frame
  requestAnimationFrame(processFrame);
}

// ── Kick everything off ───────────────────────────────────────────────────────
startCamera();

// ─────────────────────────────────────────────────────────────────────────────
// Flow summary:
//   startCamera() asks the browser for webcam access via getUserMedia
//   → on success, video plays and processFrame() loop begins
//   → each frame is sent to hands.send()
//   → MediaPipe calls onResults() with landmark data
//   → onResults() draws skeleton and calls detectGesture()
// ─────────────────────────────────────────────────────────────────────────────
