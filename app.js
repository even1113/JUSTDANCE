import {
  AI_CONFIG,
  saveAiConfig,
  analyzeMotionComparison,
  analyzeWithAi,
} from "./ai.js";

const state = {
  practiceFile: null,
  referenceFile: null,
  practiceUrl: null,
  referenceUrl: null,
  latestReport: null,
  isPlaying: false,
  isLandscape: false,
  cropRect: null,
  cropStart: null,
  cropDragging: false,
  cropCanvasRect: null,
  cropImage: null,
};

const storageKey = "danceMirrorLatestReport";

const dom = {
  compareStage: document.querySelector("#compareStage"),
  practiceInput: document.querySelector("#practiceVideo"),
  referenceInput: document.querySelector("#referenceVideo"),
  practicePreview: document.querySelector("#practicePreview"),
  referencePreview: document.querySelector("#referencePreview"),
  practiceStatus: document.querySelector("#practiceStatus"),
  referenceStatus: document.querySelector("#referenceStatus"),
  analyzeButton: document.querySelector("#analyzeButton"),
  formMessage: document.querySelector("#formMessage"),
  analysisPanel: document.querySelector("#analysisPanel"),
  analysisStage: document.querySelector("#analysisStage"),
  report: document.querySelector("#report"),
  issueList: document.querySelector("#issueList"),
  drillTitle: document.querySelector("#drillTitle"),
  drillSteps: document.querySelector("#drillSteps"),
  shootingAdvice: document.querySelector("#shootingAdvice"),
  liveBadge: document.querySelector(".live-badge"),
  timelineRow: document.querySelector("#timelineRow"),
  frameSlider: document.querySelector("#frameSlider"),
  frameTime: document.querySelector("#frameTime"),
  playPause: document.querySelector("#playPause"),
  prevFrame: document.querySelector("#prevFrame"),
  nextFrame: document.querySelector("#nextFrame"),
  recompareButton: document.querySelector("#recompareButton"),
  cropOverlay: document.querySelector("#cropOverlay"),
  cropCanvas: document.querySelector("#cropCanvas"),
  cropCancel: document.querySelector("#cropCancel"),
  cropConfirm: document.querySelector("#cropConfirm"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function saveLatestReport(report) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(report));
  } catch {}
}

function getVideoElements() {
  return {
    reference: dom.referencePreview.querySelector("video"),
    practice: dom.practicePreview.querySelector("video"),
  };
}

function getMaxDuration() {
  const { reference, practice } = getVideoElements();
  if (!reference || !practice) return 0;
  return Math.max(reference.duration || 0, practice.duration || 0);
}

function updateLayout() {
  const { reference, practice } = getVideoElements();
  const refLandscape = reference && reference.videoWidth > reference.videoHeight;
  const pracLandscape = practice && practice.videoWidth > practice.videoHeight;
  const anyLandscape = refLandscape || pracLandscape;

  state.isLandscape = anyLandscape;
  dom.compareStage.classList.toggle("stacked", anyLandscape);
}

function syncVideosToSlider() {
  const { reference, practice } = getVideoElements();
  const maxDur = getMaxDuration();
  if (maxDur <= 0) return;

  const ratio = Number(dom.frameSlider.value) / 1000;
  const time = ratio * maxDur;

  if (reference && !reference.paused) return;
  if (practice && !practice.paused) return;

  if (reference) reference.currentTime = time;
  if (practice) practice.currentTime = time;
  dom.frameTime.textContent = `${time.toFixed(2)}s`;
}

function updateSliderFromVideos() {
  const { reference, practice } = getVideoElements();
  const maxDur = getMaxDuration();
  if (maxDur <= 0) return;

  const video = practice || reference;
  if (!video) return;

  const ratio = video.currentTime / maxDur;
  dom.frameSlider.value = Math.round(ratio * 1000);
  dom.frameTime.textContent = `${video.currentTime.toFixed(2)}s`;
}

function togglePlayPause() {
  const { reference, practice } = getVideoElements();
  if (!reference || !practice) return;

  if (state.isPlaying) {
    reference.pause();
    practice.pause();
    state.isPlaying = false;
    dom.playPause.textContent = "▶";
  } else {
    reference.play();
    practice.play();
    state.isPlaying = true;
    dom.playPause.textContent = "❚❚";
  }
}

function stepFrame(delta) {
  const { reference, practice } = getVideoElements();
  const fps = 30;
  const step = delta / fps;

  if (reference) {
    reference.pause();
    reference.currentTime = Math.max(0, reference.currentTime + step);
  }
  if (practice) {
    practice.pause();
    practice.currentTime = Math.max(0, practice.currentTime + step);
  }

  state.isPlaying = false;
  dom.playPause.textContent = "▶";
  updateSliderFromVideos();
}

function onVideoEnded() {
  state.isPlaying = false;
  dom.playPause.textContent = "▶";
}

function pointsToPolyline(points = []) {
  return points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}

function markerCircles(points = [], indices = [], className = "path-marker") {
  return indices
    .map((index) => points[index])
    .filter(Boolean)
    .map((point) => `<circle class="${className}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.4" />`)
    .join("");
}

function overlaySvg(kind, overlay) {
  const teacherPoints = overlay?.teacherPoints || fallbackTeacherPoints;
  const userPoints = overlay?.userPoints || fallbackUserPoints;
  const peakIndices = overlay?.peakIndices || [Math.floor(userPoints.length / 2)];
  const isTeacher = kind === "teacher";
  const teacherPolyline = pointsToPolyline(teacherPoints);
  const userPolyline = pointsToPolyline(userPoints);

  const paths = isTeacher
    ? `<polyline class="path-standard" points="${teacherPolyline}" />${markerCircles(teacherPoints, peakIndices, "path-standard")}`
    : `<polyline class="path-standard path-ghost" points="${teacherPolyline}" />
       <polyline class="path-user" points="${userPolyline}" />
       ${markerCircles(userPoints, peakIndices, "path-user")}`;

  return `
    <svg class="path-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      ${paths}
    </svg>
    <div class="path-label">${isTeacher ? "检测到的老师标准路径" : "检测到的用户偏差路径"}</div>
  `;
}

const fallbackTeacherPoints = [
  { x: 30, y: 52 },
  { x: 42, y: 47 },
  { x: 55, y: 50 },
  { x: 66, y: 63 },
  { x: 70, y: 78 },
  { x: 82, y: 82 },
];

const fallbackUserPoints = [
  { x: 31, y: 52 },
  { x: 43, y: 49 },
  { x: 54, y: 55 },
  { x: 59, y: 66 },
  { x: 61, y: 79 },
  { x: 74, y: 87 },
];

function renderEmpty(kind) {
  const isPractice = kind === "practice";
  const preview = isPractice ? dom.practicePreview : dom.referencePreview;
  const statusEl = isPractice ? dom.practiceStatus : dom.referenceStatus;

  preview.className = `preview empty compare-preview ${isPractice ? "student-preview" : "teacher-preview"}`;
  preview.innerHTML = `
    <div class="empty-video">
      <span class="play-symbol">+</span>
      <strong>${isPractice ? "添加我的视频" : "添加老师视频"}</strong>
      <small>点击选择视频文件</small>
    </div>
  `;
  statusEl.textContent = "未添加";
}

function clearPreview(kind) {
  const isPractice = kind === "practice";
  const key = isPractice ? "practiceFile" : "referenceFile";
  const urlKey = isPractice ? "practiceUrl" : "referenceUrl";
  const input = isPractice ? dom.practiceInput : dom.referenceInput;

  if (state[urlKey]) {
    URL.revokeObjectURL(state[urlKey]);
  }

  state[key] = null;
  state[urlKey] = null;
  if (isPractice) state.cropRect = null;
  input.value = "";
  renderEmpty(kind);

  state.latestReport = null;
  state.isPlaying = false;
  dom.playPause.textContent = "▶";
  dom.report.classList.add("hidden");
  dom.timelineRow.classList.add("hidden");
  dom.liveBadge.textContent = "等待比对";
  updateLayout();
}

function renderPreview(kind, file) {
  const isPractice = kind === "practice";
  const preview = isPractice ? dom.practicePreview : dom.referencePreview;
  const statusEl = isPractice ? dom.practiceStatus : dom.referenceStatus;
  const key = isPractice ? "practiceFile" : "referenceFile";
  const urlKey = isPractice ? "practiceUrl" : "referenceUrl";

  if (state[urlKey]) {
    URL.revokeObjectURL(state[urlKey]);
  }

  state[key] = file;
  state[urlKey] = URL.createObjectURL(file);
  preview.className = `preview compare-preview ${isPractice ? "student-preview" : "teacher-preview"}`;

  const cropBtn = isPractice
    ? `<button class="crop-badge" type="button" id="cropBadge">框选自己</button>`
    : "";

  preview.innerHTML = `
    <div class="video-preview">
      <video src="${state[urlKey]}" playsinline preload="metadata"></video>
      <div class="video-meta">
        <span>${escapeHtml(file.name)} · ${formatFileSize(file.size)}</span>
        ${cropBtn}
        <button class="remove-button" type="button">删除视频</button>
      </div>
    </div>
  `;

  const video = preview.querySelector("video");

  video.addEventListener("loadedmetadata", () => {
    updateLayout();
    dom.frameSlider.value = 0;
    dom.frameTime.textContent = "0.00s";
  });

  video.addEventListener("timeupdate", () => {
    if (state.isPlaying) {
      updateSliderFromVideos();
    }
  });

  video.addEventListener("ended", onVideoEnded);

  preview.querySelector(".remove-button").addEventListener("click", (e) => {
    e.stopPropagation();
    clearPreview(kind);
  });

  if (isPractice) {
    const cropBadge = preview.querySelector("#cropBadge");
    if (cropBadge) {
      cropBadge.addEventListener("click", (e) => {
        e.stopPropagation();
        openCropOverlay();
      });
    }
  }

  statusEl.textContent = "已添加";
  dom.liveBadge.textContent = "等待比对";
}

function handleVideoChange(kind, event) {
  const [file] = event.target.files;

  if (!file) {
    return;
  }

  if (!file.type.startsWith("video/")) {
    dom.formMessage.textContent = "请选择视频文件。";
    return;
  }

  dom.formMessage.textContent = "";
  renderPreview(kind, file);
}

function attachOverlayToUploadedVideo(target, kind, overlay) {
  const videoPreview = target.querySelector(".video-preview");

  if (!videoPreview) {
    return;
  }

  videoPreview.querySelector(".path-overlay")?.remove();
  videoPreview.querySelector(".path-label")?.remove();
  videoPreview.insertAdjacentHTML("beforeend", overlaySvg(kind, overlay));
}

function renderDetectedPaths(report) {
  attachOverlayToUploadedVideo(dom.referencePreview, "teacher", report?.overlay);
  attachOverlayToUploadedVideo(dom.practicePreview, "student", report?.overlay);
}

async function runAnalysis() {
  const { reference, practice } = getVideoElements();

  dom.analysisPanel.classList.remove("hidden");
  dom.report.classList.add("hidden");
  dom.analyzeButton.disabled = true;
  dom.liveBadge.textContent = "逐帧比对中";

  try {
    const localReport = await analyzeMotionComparison(
      reference,
      practice,
      state.cropRect,
      (message) => {
        dom.analysisStage.textContent = message;
      },
    );
    localReport.source = `${state.referenceFile?.name || "老师视频"} / ${state.practiceFile?.name || "我的视频"}`;

    let data = localReport;

    if (AI_CONFIG.apiKey) {
      dom.analysisStage.textContent = "正在把关键帧交给多模态 AI 总结...";
      try {
        const aiReport = await analyzeWithAi(reference, practice, state.cropRect);
        data = {
          ...localReport,
          ...aiReport,
          overlay: localReport.overlay,
          scores: localReport.scores,
          source: localReport.source,
          localMotionSummary: localReport.aiSummary,
        };
      } catch (aiError) {
        data.aiSummary = `${localReport.aiSummary} 另外，多模态 AI 调用失败，已先使用本地路径检测结果。失败原因：${aiError.message}`;
      }
    }

    state.latestReport = data;
    renderDetectedPaths(data);
    renderReport(data);
    saveLatestReport(data);
    dom.analysisPanel.classList.add("hidden");
    dom.report.classList.remove("hidden");
    dom.liveBadge.textContent = AI_CONFIG.apiKey ? "AI 已分析" : "已标注路径";
  } catch (err) {
    dom.analysisPanel.classList.add("hidden");
    dom.formMessage.textContent = `分析失败：${err.message}`;
    dom.liveBadge.textContent = "分析失败";
  }

  dom.analyzeButton.disabled = false;
  dom.report.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderIssues(mismatches) {
  dom.issueList.innerHTML = mismatches
    .map(
      (issue, index) => `
        <article class="issue-card" data-issue-index="${index}">
          <div class="issue-topline">
            <h3>${escapeHtml(issue.title)}</h3>
            <span class="timestamp">${escapeHtml(issue.timestamp)}</span>
          </div>
          <div class="diff-grid">
            <div><b>绿色标准路径</b>${escapeHtml(issue.teacherPath)}</div>
            <div><b>红色偏差路径</b>${escapeHtml(issue.userPath)}</div>
          </div>
          <div class="practice-box"><b>AI 建议</b>${escapeHtml(issue.advice)}</div>
        </article>
      `,
    )
    .join("");
}

function renderList(target, items) {
  target.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderTimeline(report) {
  dom.timelineRow.innerHTML = report.mismatches
    .map((issue, index) => `<button type="button" data-jump="${index}">${issue.timestamp} ${escapeHtml(issue.title)}</button>`)
    .join("");
  dom.timelineRow.classList.remove("hidden");
}

function renderReport(data) {
  document.querySelector("#report-title").textContent = data.title;
  document.querySelector("#coachNote").textContent = data.aiSummary;
  renderIssues(data.mismatches);
  renderTimeline(data);
  dom.drillTitle.textContent = `下一次练 ${data.drillPlan.durationMin} 分钟`;
  renderList(dom.drillSteps, data.drillPlan.steps);
  renderList(dom.shootingAdvice, data.reviewAdvice);
}

function validateBeforeAnalyze() {
  if (!state.practiceFile || !state.referenceFile) {
    dom.formMessage.textContent = "请同时添加老师视频和我的视频才能开始比对。";
    return false;
  }

  dom.formMessage.textContent = "";
  return true;
}

function highlightIssue(index) {
  const card = dom.issueList.querySelector(`[data-issue-index="${index}"]`);

  if (!card) {
    return;
  }

  dom.issueList.querySelectorAll(".issue-card").forEach((item) => item.classList.remove("highlight"));
  card.classList.add("highlight");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetForRecompare() {
  state.latestReport = null;
  state.isPlaying = false;
  dom.playPause.textContent = "▶";
  dom.report.classList.add("hidden");
  dom.timelineRow.classList.add("hidden");
  dom.liveBadge.textContent = "等待比对";
  dom.formMessage.textContent = "";
  dom.frameSlider.value = 0;
  dom.frameTime.textContent = "0.00s";
  dom.compareStage.querySelectorAll(".path-overlay, .path-label").forEach((item) => item.remove());

  const { reference, practice } = getVideoElements();
  if (reference) {
    reference.pause();
    reference.currentTime = 0;
  }
  if (practice) {
    practice.pause();
    practice.currentTime = 0;
  }

  dom.compareStage.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openCropOverlay() {
  const video = dom.practicePreview.querySelector("video");
  if (!video) return;

  const canvas = dom.cropCanvas;
  const ctx = canvas.getContext("2d");

  video.pause();
  video.currentTime = 0;

  video.addEventListener("seeked", function onSeeked() {
    video.removeEventListener("seeked", onSeeked);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    state.cropRect = null;
    state.cropDragging = false;
    state.cropStart = null;
    state.cropImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    dom.cropConfirm.disabled = true;
    dom.cropOverlay.classList.remove("hidden");
  });
}

function closeCropOverlay() {
  dom.cropOverlay.classList.add("hidden");
  state.cropDragging = false;
  state.cropStart = null;
}

function drawCropRect(x1, y1, x2, y2) {
  const canvas = dom.cropCanvas;
  const ctx = canvas.getContext("2d");

  if (state.cropImage) {
    ctx.putImageData(state.cropImage, 0, 0);
  }

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);

  if (w < 5 || h < 5) return;

  ctx.fillStyle = "rgb(0 0 0 / 40%)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.clearRect(left, top, w, h);
  if (state.cropImage) {
    ctx.putImageData(
      state.cropImage,
      0, 0,
      left, top, w, h,
    );
  }

  ctx.strokeStyle = var_lime;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.strokeRect(left, top, w, h);
  ctx.setLineDash([]);
}

const var_lime = "#b7f34a";

function canvasCoords(e) {
  const rect = dom.cropCanvas.getBoundingClientRect();
  const scaleX = dom.cropCanvas.width / rect.width;
  const scaleY = dom.cropCanvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

dom.cropCanvas.addEventListener("mousedown", (e) => {
  state.cropDragging = true;
  state.cropStart = canvasCoords(e);
});

dom.cropCanvas.addEventListener("mousemove", (e) => {
  if (!state.cropDragging || !state.cropStart) return;
  const cur = canvasCoords(e);
  drawCropRect(state.cropStart.x, state.cropStart.y, cur.x, cur.y);
});

dom.cropCanvas.addEventListener("mouseup", (e) => {
  if (!state.cropDragging || !state.cropStart) return;
  state.cropDragging = false;
  const cur = canvasCoords(e);
  const left = Math.min(state.cropStart.x, cur.x);
  const top = Math.min(state.cropStart.y, cur.y);
  const w = Math.abs(cur.x - state.cropStart.x);
  const h = Math.abs(cur.y - state.cropStart.y);

  if (w > 10 && h > 10) {
    state.cropRect = {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(w),
      height: Math.round(h),
    };
    dom.cropConfirm.disabled = false;
  }
});

dom.cropCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  state.cropDragging = true;
  state.cropStart = canvasCoords(e);
}, { passive: false });

dom.cropCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (!state.cropDragging || !state.cropStart) return;
  const cur = canvasCoords(e);
  drawCropRect(state.cropStart.x, state.cropStart.y, cur.x, cur.y);
}, { passive: false });

dom.cropCanvas.addEventListener("touchend", (e) => {
  if (!state.cropDragging || !state.cropStart) return;
  state.cropDragging = false;

  const touch = e.changedTouches[0];
  const rect = dom.cropCanvas.getBoundingClientRect();
  const scaleX = dom.cropCanvas.width / rect.width;
  const scaleY = dom.cropCanvas.height / rect.height;
  const cur = {
    x: (touch.clientX - rect.left) * scaleX,
    y: (touch.clientY - rect.top) * scaleY,
  };

  const left = Math.min(state.cropStart.x, cur.x);
  const top = Math.min(state.cropStart.y, cur.y);
  const w = Math.abs(cur.x - state.cropStart.x);
  const h = Math.abs(cur.y - state.cropStart.y);

  if (w > 10 && h > 10) {
    state.cropRect = {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(w),
      height: Math.round(h),
    };
    dom.cropConfirm.disabled = false;
  }
});

dom.cropCancel.addEventListener("click", closeCropOverlay);

dom.cropConfirm.addEventListener("click", () => {
  if (!state.cropRect) return;

  const badge = dom.practicePreview.querySelector(".crop-badge");
  if (badge) badge.textContent = "已框选";

  closeCropOverlay();
});

dom.practicePreview.addEventListener("click", () => {
  if (dom.practicePreview.classList.contains("empty")) {
    dom.practiceInput.click();
  }
});

dom.referencePreview.addEventListener("click", () => {
  if (dom.referencePreview.classList.contains("empty")) {
    dom.referenceInput.click();
  }
});

dom.practiceInput.addEventListener("change", (event) => handleVideoChange("practice", event));
dom.referenceInput.addEventListener("change", (event) => handleVideoChange("reference", event));

dom.frameSlider.addEventListener("input", () => {
  syncVideosToSlider();
});

dom.playPause.addEventListener("click", togglePlayPause);
dom.prevFrame.addEventListener("click", () => stepFrame(-1));
dom.nextFrame.addEventListener("click", () => stepFrame(1));

dom.analyzeButton.addEventListener("click", () => {
  if (validateBeforeAnalyze()) {
    runAnalysis();
  }
});

dom.recompareButton.addEventListener("click", resetForRecompare);

dom.timelineRow.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-jump]");
  if (button) {
    highlightIssue(Number(button.dataset.jump));
  }
});

renderEmpty("reference");
renderEmpty("practice");
dom.frameTime.textContent = "0.00s";

const settingsPanel = document.querySelector("#settingsPanel");
const settingsToggle = document.querySelector("#settingsToggle");
const settingsClose = document.querySelector("#settingsClose");
const settingsSave = document.querySelector("#settingsSave");
const apiEndpointInput = document.querySelector("#apiEndpoint");
const apiModelInput = document.querySelector("#apiModel");
const apiKeyInput = document.querySelector("#apiKey");

apiEndpointInput.value = AI_CONFIG.endpoint;
apiModelInput.value = AI_CONFIG.model;
apiKeyInput.value = AI_CONFIG.apiKey;

settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.remove("hidden");
});

settingsClose.addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
});

settingsPanel.addEventListener("click", (e) => {
  if (e.target === settingsPanel) {
    settingsPanel.classList.add("hidden");
  }
});

settingsSave.addEventListener("click", () => {
  saveAiConfig({
    endpoint: apiEndpointInput.value.trim(),
    model: apiModelInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
  });
  settingsPanel.classList.add("hidden");
  dom.formMessage.textContent = AI_CONFIG.apiKey ? "AI 设置已保存，下次比对将使用真实 AI 分析" : "未填写 API Key，将使用 Mock 数据";
});
