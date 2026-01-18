// src/speaking.js

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let seconds = 0;
let timerInterval = null;

const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const retryBtn = document.getElementById("retryBtn");
const submitBtn = document.getElementById("submitBtn");
const actionButtons = document.getElementById("actionButtons");
const timer = document.getElementById("timer");
const recordingIndicator = document.getElementById("recordingIndicator");
const analysisPanel = document.getElementById("analysisPanel");

const audioWrap = document.getElementById("audioWrap");

// Modal nodes
const sessionModal = document.getElementById("sessionModal");
const sessionNameInput = document.getElementById("sessionNameInput");
const sessionNameCancel = document.getElementById("sessionNameCancel");
const sessionNameStart = document.getElementById("sessionNameStart");

// Recent Sessions container
const recentSessionsList = document.getElementById("recentSessionsList");

let latestRecordingBlob = null;

// Session state
let currentSessionId = null;

// Persisted sessions
const STORAGE_KEY = "speechmentor_recent_sessions_v1";
let sessions = loadSessions();

// ---- Analysis DOM nodes ----
const mDuration = document.getElementById("mDuration");
const mWords = document.getElementById("mWords");
const mWpm = document.getElementById("mWpm");
const mPaceTip = document.getElementById("mPaceTip");
const mFillers = document.getElementById("mFillers");
const mFillerRatio = document.getElementById("mFillerRatio");
const mClarity = document.getElementById("mClarity");
const mConfidence = document.getElementById("mConfidence");

const tTranscript = document.getElementById("tTranscript");
const tSummary = document.getElementById("tSummary");
const tTipPace = document.getElementById("tTipPace");
const tTipFillers = document.getElementById("tTipFillers");

const fillerList = document.getElementById("fillerList");
const errorBox = document.getElementById("errorBox");
const errorText = document.getElementById("errorText");

initRecorder();
bindUIEvents();
renderRecentSessions();

async function initRecorder() {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.error("getUserMedia not supported");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorder.onstop = handleStop;
  } catch (err) {
    console.error("Microphone access denied:", err);
    showError("Microphone access denied. Please allow mic permissions.");
  }
}

/* -----------------------------
   Recording flow (with modal)
------------------------------ */

function openSessionModal() {
  hideError();

  if (!sessionModal) return;
  sessionModal.classList.remove("hidden");
  sessionModal.classList.add("flex");

  // clear & focus
  sessionNameInput.value = "";
  setTimeout(() => sessionNameInput.focus(), 0);
}

function closeSessionModal() {
  if (!sessionModal) return;
  sessionModal.classList.add("hidden");
  sessionModal.classList.remove("flex");
}

function confirmSessionNameAndStart() {
  const name = (sessionNameInput.value || "").trim();
  if (!name) {
    showError("Please enter a session name before recording.");
    return;
  }

  closeSessionModal();

  // create a session record immediately (so it appears in recent sessions)
  const session = createNewSession(name);
  currentSessionId = session.id;
  renderRecentSessions();

  startRecording();
}

function startRecording() {
  if (!mediaRecorder || isRecording) return;

  hideError();

  isRecording = true;
  audioChunks = [];
  latestRecordingBlob = null;

  // hide preview while recording
  if (audioWrap) audioWrap.classList.add("hidden");

  mediaRecorder.start();

  updateUIOnStart();
  startTimer();
}

function stopRecording() {
  if (!mediaRecorder || !isRecording) return;

  isRecording = false;
  mediaRecorder.stop();

  stopTimer();
  updateUIOnStop();
}

function handleDataAvailable(event) {
  if (event.data.size > 0) audioChunks.push(event.data);
}

function handleStop() {
  const blob = new Blob(audioChunks, { type: "audio/webm" });
  latestRecordingBlob = blob;

  const audioURL = URL.createObjectURL(blob);
  renderAudioPlayer(audioURL);

  // show preview after stop
  if (audioWrap) audioWrap.classList.remove("hidden");
}

function startTimer() {
  seconds = 0;
  timer.textContent = "00:00";

  timerInterval = setInterval(() => {
    seconds++;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timer.textContent = `${String(mins).padStart(2, "0")}:${String(
      secs,
    ).padStart(2, "0")}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

function updateUIOnStart() {
  recordBtn.classList.add("hidden");
  stopBtn.classList.remove("hidden");
  actionButtons.classList.add("hidden");
  recordingIndicator.classList.remove("hidden");
  analysisPanel.classList.add("hidden");
}

function updateUIOnStop() {
  stopBtn.classList.add("hidden");
  actionButtons.classList.remove("hidden");
  recordingIndicator.classList.add("hidden");
}

function renderAudioPlayer(src) {
  const audio = document.getElementById("recordedAudio");
  if (!audio) return;
  audio.src = src;
}

function bindUIEvents() {
  // IMPORTANT: record now opens modal first
  recordBtn.addEventListener("click", openSessionModal);

  stopBtn.addEventListener("click", stopRecording);
  retryBtn.addEventListener("click", handleRetry);
  submitBtn.addEventListener("click", handleSubmit);

  // modal buttons
  sessionNameCancel.addEventListener("click", () => {
    closeSessionModal();
    hideError();
  });

  sessionNameStart.addEventListener("click", confirmSessionNameAndStart);

  // allow Enter to start
  sessionNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmSessionNameAndStart();
    if (e.key === "Escape") closeSessionModal();
  });

  // click outside modal content to close
  sessionModal.addEventListener("click", (e) => {
    if (e.target === sessionModal) closeSessionModal();
  });
}

function handleRetry() {
  hideError();
  actionButtons.classList.add("hidden");
  recordBtn.classList.remove("hidden");
  analysisPanel.classList.add("hidden");
  timer.textContent = "00:00";
  latestRecordingBlob = null;

  if (audioWrap) audioWrap.classList.add("hidden");

  // Keep the session entry, but mark it as "retry" friendly
  // If you want a new session each time, tell me and I’ll change it.
}

/* -----------------------------
   Submit + analysis
------------------------------ */

async function handleSubmit() {
  hideError();

  actionButtons.classList.add("hidden");
  recordBtn.classList.remove("hidden");
  analysisPanel.classList.remove("hidden");

  if (!latestRecordingBlob) {
    showError("No recording found. Please record first.");
    return;
  }

  // show loading state in UI
  setLoadingUI();

  try {
    const formData = new FormData();
    formData.append("audio", latestRecordingBlob, "recording.webm");
    formData.append("durationSeconds", String(seconds));

    const res = await fetch("/api/analyze-audio", {
      method: "POST",
      body: formData,
    });

    // safer parsing so it doesn't crash if backend returns non-json
    const contentType = res.headers.get("content-type") || "";
    let data;

    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      showError(
        `Backend did not return JSON.\nStatus: ${res.status}\n\n${text.slice(0, 600)}`,
      );
      return;
    }

    if (!res.ok || !data.ok) {
      showError(
        `Error: ${data?.error || "Request failed"}\n\n${data?.details || ""}`,
      );
      return;
    }

    renderAnalysis(data.result);

    // ✅ update the session card with real analysis data
    if (currentSessionId) {
      updateSessionWithAnalysis(currentSessionId, data.result);
      renderRecentSessions();
    }
  } catch (err) {
    console.error(err);
    showError("Failed to analyze audio. Check server console.");
  }
}

function setLoadingUI() {
  mDuration.textContent = "—";
  mWords.textContent = "— words";
  mWpm.textContent = "— WPM";
  mPaceTip.textContent = "Analyzing...";
  mFillers.textContent = "—";
  mFillerRatio.textContent = "—% of words";
  mClarity.textContent = "—%";
  mConfidence.textContent = "—%";
  tTranscript.textContent = "Analyzing your speech...";
  tSummary.textContent = "—";
  tTipPace.textContent = "—";
  tTipFillers.textContent = "—";
  fillerList.textContent = "—";
}

function renderAnalysis(r) {
  const dur = Number(r.durationSeconds || 0);
  const mins = Math.floor(dur / 60);
  const secs = dur % 60;
  const prettyDur = `${mins}:${String(secs).padStart(2, "0")}`;

  mDuration.textContent = prettyDur;
  mWords.textContent = `${r.wordCount ?? 0} words`;

  mWpm.textContent = `${r.wpm ?? 0} WPM`;
  mPaceTip.textContent = r.tips?.pace || "—";

  mFillers.textContent = String(r.filler?.total ?? 0);
  mFillerRatio.textContent = `${r.filler?.ratio ?? 0}% of words`;

  mClarity.textContent = `${r.scores?.clarity ?? 0}%`;
  mConfidence.textContent = `${r.scores?.confidence ?? 0}%`;

  tTranscript.textContent = r.transcript || "No transcript detected.";
  tSummary.textContent = r.summary || "—";
  tTipPace.textContent = r.tips?.pace || "—";
  tTipFillers.textContent = r.tips?.fillers || "—";

  const details = r.filler?.details || [];
  if (!details.length) {
    fillerList.innerHTML = `<span class="text-emerald-200">Nice - no filler words detected.</span>`;
  } else {
    fillerList.innerHTML = `
      <div class="flex flex-wrap gap-2">
        ${details
          .map(
            (x) => `
          <span class="px-3 py-1 rounded-full bg-white/10 border border-white/10">
            <b class="text-white/80">${escapeHtml(x.word)}</b>: ${x.count}
          </span>
        `,
          )
          .join("")}
      </div>
    `;
  }
}

/* -----------------------------
   Recent Sessions (render + storage)
------------------------------ */

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 20)));
  } catch {
    // ignore
  }
}

function createNewSession(name) {
  const id = `session_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const now = new Date();

  const session = {
    id,
    name,
    createdAt: now.toISOString(),
    // analysis placeholders
    score: null,
    clarity: null,
    wpm: null,
    fillers: null,
    transcript: null,
    summary: null,
  };

  sessions = [session, ...sessions].slice(0, 20);
  saveSessions();
  return session;
}

function updateSessionWithAnalysis(id, r) {
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return;

  const score = clampInt(r?.scores?.confidence ?? 0, 0, 100); // using your "confidence" as the top score

  sessions[idx] = {
    ...sessions[idx],
    score,
    clarity: clampInt(r?.scores?.clarity ?? 0, 0, 100),
    wpm: clampInt(r?.wpm ?? 0, 0, 500),
    fillers: clampInt(r?.filler?.total ?? 0, 0, 999),
    transcript: r?.transcript ?? "",
    summary: r?.summary ?? "",
  };

  saveSessions();
}

function renderRecentSessions() {
  if (!recentSessionsList) return;

  // If no sessions yet
  if (!sessions.length) {
    recentSessionsList.innerHTML = `
      <div class="text-sm text-white/50">
        No sessions yet. Start recording to add one here.
      </div>
    `;
    return;
  }

  recentSessionsList.innerHTML = sessions
    .map((s) => {
      const dt = formatSessionTime(s.createdAt);
      const scoreText = s.score == null ? "—" : `${s.score}%`;

      const borderClass = getScoreBorderClass(s.score);
      const scoreClass = getScoreTextClass(s.score);

      const detailClarity = s.clarity == null ? "—" : `${s.clarity}%`;
      const detailPace = s.wpm == null ? "—" : `${s.wpm} WPM`;
      const detailFillers = s.fillers == null ? "—" : `${s.fillers}`;

      const strengths =
        s.score == null
          ? "Complete analysis to see strengths"
          : getStrengthsLine(s);

      const improve =
        s.score == null ? "Submit your recording for tips" : getImproveLine(s);

      return `
      <div class="session-card max-w-full border-l-4 ${borderClass} bg-white/5 rounded cursor-pointer hover:bg-white/10 transition">

        <div class="session-header pl-3 py-2" onclick="toggleSession('${s.id}')">
          <div class="flex justify-between items-center">
            <div>
              <div class="font-semibold text-sm text-white">${escapeHtml(s.name)}</div>
              <div class="text-xs text-white/50">${dt}</div>
            </div>
            <div class="text-right">
              <div class="text-lg font-bold ${scoreClass}">${scoreText}</div>
              <i class="fas fa-chevron-down text-white/50 text-xs" id="${s.id}-icon"></i>
            </div>
          </div>
        </div>

        <div id="${s.id}" class="session-details hidden pl-3 pr-3 pb-3 pt-2 border-t border-white/10 mt-2">
          <div class="grid grid-cols-2 gap-2 mb-3 text-xs">
            <div>
              <span class="text-white/50">Clarity:</span>
              <span class="text-green-400 font-semibold">${detailClarity}</span>
            </div>
            <div>
              <span class="text-white/50">Pace:</span>
              <span class="text-blue-400 font-semibold">${detailPace}</span>
            </div>
            <div>
              <span class="text-white/50">Volume:</span>
              <span class="text-purple-400 font-semibold">—</span>
            </div>
            <div>
              <span class="text-white/50">Fillers:</span>
              <span class="text-yellow-400 font-semibold">${detailFillers}</span>
            </div>
          </div>

          <div class="text-xs">
            <div class="mb-2">
              <span class="text-green-400 font-semibold">Strengths:</span>
              <p class="text-white/60 mt-1">${escapeHtml(strengths)}</p>
            </div>
            <div>
              <span class="text-orange-400 font-semibold">Improve:</span>
              <p class="text-white/60 mt-1">${escapeHtml(improve)}</p>
            </div>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

function formatSessionTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function getScoreBorderClass(score) {
  if (score == null) return "border-white/20";
  if (score >= 80) return "border-green-400";
  if (score >= 60) return "border-amber-300";
  return "border-red-400";
}

function getScoreTextClass(score) {
  if (score == null) return "text-white/60";
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-amber-300";
  return "text-red-400";
}

function getStrengthsLine(s) {
  const parts = [];
  if (s.clarity != null && s.clarity >= 80) parts.push("Clear structure");
  if (s.wpm != null && s.wpm >= 120 && s.wpm <= 170) parts.push("Good pace");
  if (s.fillers != null && s.fillers <= 3) parts.push("Low fillers");
  return parts.length ? parts.join(", ") : "Solid delivery";
}

function getImproveLine(s) {
  if (s.fillers != null && s.fillers > 3)
    return 'Reduce filler words like "um" and "like"';
  if (s.wpm != null && s.wpm > 180) return "Slow down slightly and add pauses";
  if (s.wpm != null && s.wpm < 100)
    return "Try a bit faster pace to sound confident";
  return "Add stronger opening + closing";
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.round(x)));
}

/* -----------------------------
   Errors + helpers
------------------------------ */

function showError(msg) {
  if (!errorBox || !errorText) {
    alert(msg);
    return;
  }
  errorBox.classList.remove("hidden");
  errorText.textContent = msg;
}

function hideError() {
  if (!errorBox || !errorText) return;
  errorBox.classList.add("hidden");
  errorText.textContent = "";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* -----------------------------
   Keep your session toggle
------------------------------ */
window.toggleSession = function (sessionId) {
  const details = document.getElementById(sessionId);
  const icon = document.getElementById(`${sessionId}-icon`);
  if (!details || !icon) return;

  const isHidden = details.classList.contains("hidden");
  details.classList.toggle("hidden");

  icon.classList.toggle("fa-chevron-down", !isHidden);
  icon.classList.toggle("fa-chevron-up", isHidden);
};
