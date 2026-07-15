import {
  AI_CONFIG,
  saveAiConfig,
  analyzeMotionComparison,
  analyzeWithAi,
} from "./ai.js";
import {
  previewClassForKind,
  renderEmptyVideoPane,
  renderUploadedVideoPane,
} from "./components/DualVideoPlayer.js";
import { clearPoseCanvas } from "./components/PoseCanvas.js";
import { createIndependentVideoPlayback } from "./hooks/useIndependentVideoPlayback.js";
import { alignAudioTracks } from "./services/audioAlignment.js";
import { createPosePlaybackRenderer } from "./services/poseExtractor.js";

const state = {
  userFile: null,
  teacherFile: null,
  userVideoUrl: null,
  teacherVideoUrl: null,
  latestReport: null,
  isLandscape: false,
  audioAlignment: null,
  teacherPoseRenderer: null,
  userPoseRenderer: null,
  cropRect: null,
  pendingCropRect: null,
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
  scoreGrid: document.querySelector("#scoreGrid"),
  issueList: document.querySelector("#issueList"),
  drillTitle: document.querySelector("#drillTitle"),
  drillSteps: document.querySelector("#drillSteps"),
  shootingAdvice: document.querySelector("#shootingAdvice"),
  liveBadge: document.querySelector(".live-badge"),
  timelineRow: document.querySelector("#timelineRow"),
  autoAlignAudio: document.querySelector("#autoAlignAudio"),
  applyManualOffset: document.querySelector("#applyManualOffset"),
  audioOffsetRange: document.querySelector("#audioOffsetRange"),
  audioOffsetInput: document.querySelector("#audioOffsetInput"),
  audioAlignStatus: document.querySelector("#audioAlignStatus"),
  recompareButton: document.querySelector("#recompareButton"),
  cropOverlay: document.querySelector("#cropOverlay"),
  cropCanvas: document.querySelector("#cropCanvas"),
  cropCancel: document.querySelector("#cropCancel"),
  cropConfirm: document.querySelector("#cropConfirm"),
};

const teacherVideoRef = { current: null };
const userVideoRef = { current: null };
const teacherCanvasRef = { current: null };
const userCanvasRef = { current: null };

const videoPlayback = createIndependentVideoPlayback({
  teacherVideoRef,
  userVideoRef,
});

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
    teacher: teacherVideoRef.current,
    user: userVideoRef.current,
    reference: teacherVideoRef.current,
    practice: userVideoRef.current,
  };
}

function updateLayout() {
  const { teacher, user } = getVideoElements();
  const refLandscape = teacher && teacher.videoWidth > teacher.videoHeight;
  const pracLandscape = user && user.videoWidth > user.videoHeight;
  const anyLandscape = refLandscape || pracLandscape;

  state.isLandscape = anyLandscape;
  dom.compareStage.classList.toggle("stacked", anyLandscape);
}


function renderEmpty(kind) {
  const isUser = kind === "user";
  const preview = isUser ? dom.practicePreview : dom.referencePreview;
  const statusEl = isUser ? dom.practiceStatus : dom.referenceStatus;
  const paneKind = isUser ? "user" : "teacher";

  preview.className = `preview empty compare-preview ${previewClassForKind(paneKind)}`;
  preview.innerHTML = renderEmptyVideoPane(paneKind);
  statusEl.textContent = "未添加";
}

function clearSubjectLockOverlay() {
  dom.practicePreview.querySelector(".subject-lock-layer")?.remove();
}

function renderSubjectLockOverlay() {
  clearSubjectLockOverlay();

  const videoFrame = dom.practicePreview.querySelector(".video-frame");
  const video = userVideoRef.current;

  if (!videoFrame || !video || !state.cropRect || !video.videoWidth || !video.videoHeight) {
    return;
  }

  const left = (state.cropRect.x / video.videoWidth) * 100;
  const top = (state.cropRect.y / video.videoHeight) * 100;
  const width = (state.cropRect.width / video.videoWidth) * 100;
  const height = (state.cropRect.height / video.videoHeight) * 100;

  videoFrame.insertAdjacentHTML(
    "beforeend",
    `
      <div class="subject-lock-layer" aria-hidden="true">
        <div
          class="subject-lock"
          style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;width:${width.toFixed(2)}%;height:${height.toFixed(2)}%;"
        >
          <span>AI 已锁定你</span>
        </div>
      </div>
    `,
  );
}

function resetSubjectSelection() {
  state.cropRect = null;
  state.pendingCropRect = null;
  clearSubjectLockOverlay();
}

function disposePoseRenderers() {
  state.teacherPoseRenderer?.();
  state.userPoseRenderer?.();
  state.teacherPoseRenderer = null;
  state.userPoseRenderer = null;
}

function resetAudioAlignment() {
  state.audioAlignment = null;
  dom.audioOffsetRange.value = "0";
  dom.audioOffsetInput.value = "0";
  dom.audioAlignStatus.textContent = "音轨尚未对齐";
  dom.audioAlignStatus.dataset.state = "idle";
}

function setAudioAlignment(alignment) {
  const offsetSec = clamp(Number(alignment.offsetSec) || 0, -30, 30);
  state.audioAlignment = { ...alignment, offsetSec };
  dom.audioOffsetRange.value = String(offsetSec);
  dom.audioOffsetInput.value = offsetSec.toFixed(2);

  if (alignment.method === "audio_correlation") {
    dom.audioAlignStatus.textContent = `音轨已自动对齐 · 用户偏移 ${formatSignedSeconds(offsetSec)} · 可信度 ${alignment.confidence}%`;
  } else {
    dom.audioAlignStatus.textContent = `已应用手动偏移 · 用户偏移 ${formatSignedSeconds(offsetSec)}`;
  }
  dom.audioAlignStatus.dataset.state = "ready";
}

function formatSignedSeconds(value) {
  const safeValue = Number(value) || 0;
  return `${safeValue >= 0 ? "+" : ""}${safeValue.toFixed(2)}s`;
}

function clearPreview(kind) {
  const isUser = kind === "user";
  const key = isUser ? "userFile" : "teacherFile";
  const urlKey = isUser ? "userVideoUrl" : "teacherVideoUrl";
  const input = isUser ? dom.practiceInput : dom.referenceInput;

  if (state[urlKey]) {
    URL.revokeObjectURL(state[urlKey]);
  }

  state[key] = null;
  state[urlKey] = null;
  disposePoseRenderers();
  resetAudioAlignment();
  if (isUser) {
    userVideoRef.current = null;
    userCanvasRef.current = null;
    resetSubjectSelection();
  } else {
    teacherVideoRef.current = null;
    teacherCanvasRef.current = null;
  }
  input.value = "";
  renderEmpty(kind);

  state.latestReport = null;
  videoPlayback.pauseAll();
  videoPlayback.refresh();
  dom.report.classList.add("hidden");
  dom.timelineRow.classList.add("hidden");
  dom.liveBadge.textContent = "等待比对";
  updateLayout();
}

function renderPreview(kind, file) {
  const isUser = kind === "user";
  const paneKind = isUser ? "user" : "teacher";
  const preview = isUser ? dom.practicePreview : dom.referencePreview;
  const statusEl = isUser ? dom.practiceStatus : dom.referenceStatus;
  const key = isUser ? "userFile" : "teacherFile";
  const urlKey = isUser ? "userVideoUrl" : "teacherVideoUrl";

  if (state[urlKey]) {
    URL.revokeObjectURL(state[urlKey]);
  }

  if (isUser) resetSubjectSelection();
  disposePoseRenderers();
  resetAudioAlignment();

  state[key] = file;
  state[urlKey] = URL.createObjectURL(file);
  preview.className = `preview compare-preview ${previewClassForKind(paneKind)}`;
  preview.innerHTML = renderUploadedVideoPane({
    kind: paneKind,
    file,
    url: state[urlKey],
    fileSizeText: formatFileSize(file.size),
    allowCrop: isUser,
  });

  const video = preview.querySelector("video");
  const canvas = preview.querySelector(".pose-canvas");
  if (isUser) {
    userVideoRef.current = video;
    userCanvasRef.current = canvas;
  } else {
    teacherVideoRef.current = video;
    teacherCanvasRef.current = canvas;
  }

  video.addEventListener("loadedmetadata", () => {
    updateLayout();
    renderSubjectLockOverlay();
    videoPlayback.refresh();
  });

  const videoTime = preview.querySelector("[data-video-time]");
  video.addEventListener("timeupdate", () => {
    videoTime.value = `${video.currentTime.toFixed(2)}s`;
    videoTime.textContent = videoTime.value;
  });
  preview.querySelectorAll("[data-frame-step]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      videoPlayback.stepFrame(paneKind, Number(button.dataset.frameStep));
    });
  });

  preview.querySelector(".remove-button").addEventListener("click", (e) => {
    e.stopPropagation();
    clearPreview(kind);
  });

  if (isUser) {
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
  videoPlayback.refresh();
  if (isUser) {
    dom.formMessage.textContent = "已添加我的视频。多人或背景复杂时，建议先点「框选自己」。";
  }
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

async function runAnalysis() {
  const { teacher, user } = getVideoElements();
  const subjectPrefix = state.cropRect ? "已锁定本人区域。" : "未框选自己，将追踪画面中最明显的运动主体。";

  videoPlayback.pauseAll();
  disposePoseRenderers();
  dom.analysisPanel.classList.remove("hidden");
  dom.report.classList.add("hidden");
  dom.analyzeButton.disabled = true;
  dom.liveBadge.textContent = state.cropRect ? "分析框选主体" : "自动追踪主体";
  dom.analysisStage.textContent = `${subjectPrefix}正在准备逐帧比对...`;

  try {
    const localReport = await analyzeMotionComparison(
      teacher,
      user,
      state.cropRect,
      (message) => {
        dom.analysisStage.textContent = `${subjectPrefix}${message}`;
      },
      {
        teacherCanvas: teacherCanvasRef.current,
        userCanvas: userCanvasRef.current,
        audioAlignment: state.audioAlignment,
        onPoseFramesReady: ({ teacherFrames, userFrames }) => {
          state.teacherPoseRenderer = createPosePlaybackRenderer(
            teacherVideoRef.current,
            teacherCanvasRef.current,
            teacherFrames,
          );
          state.userPoseRenderer = createPosePlaybackRenderer(
            userVideoRef.current,
            userCanvasRef.current,
            userFrames,
          );
        },
      },
    );
    localReport.source = `${state.teacherFile?.name || "老师视频"} / ${state.userFile?.name || "我的视频"}`;

    let data = localReport;

    if (AI_CONFIG.apiKey) {
      dom.analysisStage.textContent = "正在把结构化姿态分析交给 AI 总结...";
      try {
        const aiReport = await analyzeWithAi(localReport.structuredAnalysis);
        data = {
          ...localReport,
          ...aiReport,
          scores: localReport.scores,
          structuredAnalysis: localReport.structuredAnalysis,
          pipeline: localReport.pipeline,
          source: localReport.source,
          localMotionSummary: localReport.aiSummary,
        };
      } catch (aiError) {
        data.aiSummary = `${localReport.aiSummary} 另外，多模态 AI 调用失败，已先使用本地路径检测结果。失败原因：${aiError.message}`;
      }
    }

    state.latestReport = data;
    renderReport(data);
    saveLatestReport(data);
    dom.analysisPanel.classList.add("hidden");
    dom.report.classList.remove("hidden");
    if (state.cropRect) {
      dom.liveBadge.textContent = "已分析本人";
    } else {
      dom.liveBadge.textContent = AI_CONFIG.apiKey ? "AI 已分析" : "姿态已标注";
    }
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
            <div><b>老师动作</b>${escapeHtml(issue.teacherPath)}</div>
            <div><b>我的动作</b>${escapeHtml(issue.userPath)}</div>
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

function renderScores(scores = {}) {
  const scoreItems = [
    ["综合", scores.overallScore],
    ["姿态", scores.poseSimilarity],
    ["节奏", scores.timingScore],
    ["幅度", scores.amplitudeScore],
    ["控制", scores.controlScore],
  ].filter((item) => Number.isFinite(item[1]));

  dom.scoreGrid.innerHTML = scoreItems
    .map(
      ([label, value]) => `
        <div class="score-pill">
          <span>${escapeHtml(label)}</span>
          <strong>${Math.round(value)}</strong>
        </div>
      `,
    )
    .join("");
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
  renderScores(data.scores);
  renderIssues(data.mismatches);
  renderTimeline(data);
  dom.drillTitle.textContent = `下一次练 ${data.drillPlan.durationMin} 分钟`;
  renderList(dom.drillSteps, data.drillPlan.steps);
  renderList(dom.shootingAdvice, data.reviewAdvice);
}

function validateBeforeAnalyze() {
  if (!state.userFile || !state.teacherFile) {
    dom.formMessage.textContent = "请同时添加老师视频和我的视频才能开始比对。";
    return false;
  }

  if (!state.audioAlignment) {
    dom.formMessage.textContent = "请先自动对齐音轨，或应用手动偏移后再开始姿态分析。";
    return false;
  }

  dom.formMessage.textContent = state.cropRect
    ? "已确认本人区域，AI 会只分析你框选的人。"
    : "未框选自己：AI 会默认追踪画面中最明显的运动主体；多人视频建议先框选。";
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

function jumpToIssue(index) {
  const issue = state.latestReport?.mismatches?.[index];
  if (issue?.timestamp) {
    videoPlayback.seekAlignedPair(
      parseTimestamp(issue.timestamp),
      state.audioAlignment?.offsetSec || 0,
    );
  }

  highlightIssue(index);
}

function parseTimestamp(value) {
  const parts = String(value).split(":").map((part) => Number(part));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return 0;
  return parts[0] * 60 + parts[1];
}

function resetForRecompare() {
  state.latestReport = null;
  videoPlayback.pauseAll();
  disposePoseRenderers();
  dom.report.classList.add("hidden");
  dom.timelineRow.classList.add("hidden");
  dom.liveBadge.textContent = "等待比对";
  dom.formMessage.textContent = "";
  clearPoseCanvas(teacherCanvasRef.current);
  clearPoseCanvas(userCanvasRef.current);

  videoPlayback.seekAlignedPair(0, state.audioAlignment?.offsetSec || 0);

  dom.compareStage.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openCropOverlay() {
  const video = userVideoRef.current;
  if (!video) return;

  videoPlayback.pauseAll();
  dom.formMessage.textContent = "";
  state.pendingCropRect = state.cropRect ? { ...state.cropRect } : null;
  state.cropDragging = false;
  state.cropStart = null;
  dom.cropConfirm.disabled = !state.pendingCropRect;
  dom.cropConfirm.textContent = state.pendingCropRect ? "确认使用此区域" : "确认框选";
  dom.cropOverlay.classList.remove("hidden");
  drawCropFrame(video).catch((error) => {
    dom.cropOverlay.classList.add("hidden");
    dom.formMessage.textContent = `无法打开框选：${error.message}`;
  });
}

function waitForVideoFrame(video) {
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("视频首帧还没有加载完成，请稍后再试。"));
    }, 2500);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };

    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("视频读取失败，请重新选择视频。"));
    };

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
    video.load();
  });
}

async function drawCropFrame(video) {
  await waitForVideoFrame(video);

  const canvas = dom.cropCanvas;
  const ctx = canvas.getContext("2d");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  state.cropImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (state.pendingCropRect) {
    drawCropRect(
      state.pendingCropRect.x,
      state.pendingCropRect.y,
      state.pendingCropRect.x + state.pendingCropRect.width,
      state.pendingCropRect.y + state.pendingCropRect.height,
    );
  }
}

function closeCropOverlay() {
  dom.cropOverlay.classList.add("hidden");
  state.cropDragging = false;
  state.cropStart = null;
}

function cancelCropOverlay() {
  state.pendingCropRect = state.cropRect ? { ...state.cropRect } : null;
  closeCropOverlay();
  dom.formMessage.textContent = state.cropRect
    ? "已取消重新框选，继续使用之前锁定的本人区域。"
    : "已取消框选。未框选时，AI 会默认追踪画面中最明显的运动主体。";
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function canvasCoords(e) {
  const rect = dom.cropCanvas.getBoundingClientRect();
  const scaleX = dom.cropCanvas.width / rect.width;
  const scaleY = dom.cropCanvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clamp((clientX - rect.left) * scaleX, 0, dom.cropCanvas.width),
    y: clamp((clientY - rect.top) * scaleY, 0, dom.cropCanvas.height),
  };
}

function savePendingCropRect(endPoint) {
  if (!state.cropStart) return;

  const left = Math.min(state.cropStart.x, endPoint.x);
  const top = Math.min(state.cropStart.y, endPoint.y);
  const w = Math.abs(endPoint.x - state.cropStart.x);
  const h = Math.abs(endPoint.y - state.cropStart.y);

  if (w > 10 && h > 10) {
    state.pendingCropRect = {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(w),
      height: Math.round(h),
    };
    dom.cropConfirm.disabled = false;
    dom.cropConfirm.textContent = "确认锁定本人";
  }
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
  savePendingCropRect(cur);
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
    x: clamp((touch.clientX - rect.left) * scaleX, 0, dom.cropCanvas.width),
    y: clamp((touch.clientY - rect.top) * scaleY, 0, dom.cropCanvas.height),
  };

  savePendingCropRect(cur);
});

dom.cropCancel.addEventListener("click", cancelCropOverlay);

dom.cropConfirm.addEventListener("click", () => {
  if (!state.pendingCropRect) return;

  state.cropRect = { ...state.pendingCropRect };
  state.pendingCropRect = null;
  renderSubjectLockOverlay();
  const badge = dom.practicePreview.querySelector(".crop-badge");
  if (badge) {
    badge.textContent = "AI已锁定";
    badge.classList.add("locked");
  }
  dom.practiceStatus.textContent = "已锁定本人";
  dom.formMessage.textContent = "已确认：AI 会把框选区域当作真实用户本人，只分析这个区域内的动作。";
  dom.liveBadge.textContent = "已锁定主体";

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

dom.practiceInput.addEventListener("change", (event) => handleVideoChange("user", event));
dom.referenceInput.addEventListener("change", (event) => handleVideoChange("teacher", event));

dom.audioOffsetRange.addEventListener("input", () => {
  dom.audioOffsetInput.value = Number(dom.audioOffsetRange.value).toFixed(2);
});

dom.audioOffsetInput.addEventListener("input", () => {
  const value = clamp(Number(dom.audioOffsetInput.value) || 0, -30, 30);
  dom.audioOffsetRange.value = String(value);
});

dom.applyManualOffset.addEventListener("click", () => {
  if (!state.teacherFile || !state.userFile) {
    dom.formMessage.textContent = "请先添加老师视频和我的视频。";
    return;
  }

  setAudioAlignment({
    offsetSec: Number(dom.audioOffsetInput.value) || 0,
    confidence: null,
    method: "manual",
  });
  dom.formMessage.textContent = "手动偏移已应用，姿态分析会先裁剪两段视频的共同区间。";
});

dom.autoAlignAudio.addEventListener("click", async () => {
  if (!state.teacherFile || !state.userFile) {
    dom.formMessage.textContent = "请先添加老师视频和我的视频。";
    return;
  }

  dom.autoAlignAudio.disabled = true;
  dom.audioAlignStatus.textContent = "正在提取并匹配两段音轨...";
  dom.audioAlignStatus.dataset.state = "working";
  dom.formMessage.textContent = "";

  try {
    const alignment = await alignAudioTracks(state.teacherFile, state.userFile);
    setAudioAlignment(alignment);
    dom.formMessage.textContent = "音轨对齐完成，现在可以开始姿态分析。";
  } catch (error) {
    state.audioAlignment = null;
    dom.audioAlignStatus.textContent = error.message;
    dom.audioAlignStatus.dataset.state = "error";
    dom.formMessage.textContent = "自动对齐失败，可输入偏移秒数并应用手动标定。";
  } finally {
    dom.autoAlignAudio.disabled = false;
  }
});

dom.analyzeButton.addEventListener("click", () => {
  if (validateBeforeAnalyze()) {
    runAnalysis();
  }
});

dom.recompareButton.addEventListener("click", resetForRecompare);

dom.timelineRow.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-jump]");
  if (button) {
    jumpToIssue(Number(button.dataset.jump));
  }
});

renderEmpty("teacher");
renderEmpty("user");
resetAudioAlignment();

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
