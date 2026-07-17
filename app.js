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
import {
  clearPoseCanvas,
  getContainedContentRect,
} from "./components/PoseCanvas.js";
import { createIndependentVideoPlayback } from "./hooks/useIndependentVideoPlayback.js";
import {
  alignAudioTracks,
  createManualAudioAlignment,
  shiftAudioAlignment,
} from "./services/audioAlignment.js";
import { normalizeCoachingReport } from "./services/feedbackGenerator.js";
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
  cropRects: {
    teacher: null,
    user: null,
  },
  pendingCropRect: null,
  activeCropKind: null,
  cropStart: null,
  cropDragging: false,
  cropInteraction: null,
  cropPointerId: null,
  cropImage: null,
  alignmentRequestId: 0,
  activeIssueIndex: -1,
  commonTime: 0,
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
  autoAlignAudio: document.querySelector("#autoAlignAudio"),
  applyManualOffset: document.querySelector("#applyManualOffset"),
  audioOffsetRange: document.querySelector("#audioOffsetRange"),
  audioOffsetInput: document.querySelector("#audioOffsetInput"),
  audioAlignStatus: document.querySelector("#audioAlignStatus"),
  recompareButton: document.querySelector("#recompareButton"),
  cropOverlay: document.querySelector("#cropOverlay"),
  cropCanvas: document.querySelector("#cropCanvas"),
  cropCancel: document.querySelector("#cropCancel"),
  cropClear: document.querySelector("#cropClear"),
  cropConfirm: document.querySelector("#cropConfirm"),
  cropHint: document.querySelector("#cropHint"),
  syncControls: document.querySelector("#syncControls"),
  syncPlay: document.querySelector("#syncPlay"),
  frameBack: document.querySelector("#frameBack"),
  frameForward: document.querySelector("#frameForward"),
  playbackRate: document.querySelector("#playbackRate"),
  loopSegment: document.querySelector("#loopSegment"),
  commonProgress: document.querySelector("#commonProgress"),
  commonTime: document.querySelector("#commonTime"),
  syncAccuracy: document.querySelector("#syncAccuracy"),
  timelineMarkers: document.querySelector("#timelineMarkers"),
  nudgeEarlier: document.querySelector("#nudgeEarlier"),
  nudgeLater: document.querySelector("#nudgeLater"),
  coachEmpty: document.querySelector("#coachEmpty"),
  currentAdviceTime: document.querySelector("#currentAdviceTime"),
  analysisSteps: document.querySelector("#analysisSteps"),
};

const teacherVideoRef = { current: null };
const userVideoRef = { current: null };
const teacherCanvasRef = { current: null };
const userCanvasRef = { current: null };

const videoPlayback = createIndependentVideoPlayback({
  teacherVideoRef,
  userVideoRef,
  onTimeUpdate: handleCommonTimeUpdate,
  onPlaybackChange: handlePlaybackChange,
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
  state.isLandscape = Boolean(refLandscape || pracLandscape);
  renderSubjectLockOverlay("teacher");
  renderSubjectLockOverlay("user");
}

function handleCommonTimeUpdate({
  commonTime,
  duration,
  syncErrorSec,
}) {
  state.commonTime = commonTime;
  dom.commonProgress.max = String(Math.max(0, duration));
  if (!dom.commonProgress.matches(":active")) {
    dom.commonProgress.value = String(Math.min(commonTime, duration));
  }
  dom.commonTime.value = `${formatClock(commonTime)} / ${formatClock(duration)}`;
  dom.commonTime.textContent = dom.commonTime.value;

  const errorMs = Math.round(Math.abs(syncErrorSec || 0) * 1000);
  dom.syncAccuracy.value = errorMs <= 100
    ? `同步误差 ${errorMs}ms`
    : "正在重新校正同步";
  dom.syncAccuracy.textContent = dom.syncAccuracy.value;
  updateAdviceForTime(commonTime);
}

function handlePlaybackChange({ isPlaying, loopEnabled }) {
  dom.syncPlay.textContent = isPlaying ? "暂停" : "播放";
  dom.syncPlay.setAttribute("aria-label", isPlaying ? "暂停双视频" : "播放双视频");
  dom.loopSegment.setAttribute("aria-pressed", String(loopEnabled));
  dom.loopSegment.classList.toggle("active", loopEnabled);
}

function formatClock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
}

function previewForKind(kind) {
  return kind === "user" ? dom.practicePreview : dom.referencePreview;
}

function statusForKind(kind) {
  return kind === "user" ? dom.practiceStatus : dom.referenceStatus;
}

function videoForKind(kind) {
  return kind === "user" ? userVideoRef.current : teacherVideoRef.current;
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

function clearSubjectLockOverlay(kind) {
  previewForKind(kind).querySelector(".subject-lock-layer")?.remove();
}

function renderSubjectLockOverlay(kind) {
  clearSubjectLockOverlay(kind);

  const preview = previewForKind(kind);
  const videoFrame = preview.querySelector(".video-frame");
  const video = videoForKind(kind);
  const cropRect = state.cropRects[kind];

  if (!videoFrame || !video || !cropRect || !video.videoWidth || !video.videoHeight) {
    return;
  }

  const frameRect = videoFrame.getBoundingClientRect();
  const contentRect = getContainedContentRect(
    frameRect.width,
    frameRect.height,
    video.videoWidth,
    video.videoHeight,
  );
  const sourceWidth = cropRect.sourceWidth || video.videoWidth;
  const sourceHeight = cropRect.sourceHeight || video.videoHeight;
  const left = contentRect.x + (cropRect.x / sourceWidth) * contentRect.width;
  const top = contentRect.y + (cropRect.y / sourceHeight) * contentRect.height;
  const width = (cropRect.width / sourceWidth) * contentRect.width;
  const height = (cropRect.height / sourceHeight) * contentRect.height;
  const label = kind === "teacher" ? "已锁定老师人物" : "已锁定我的人物";

  videoFrame.insertAdjacentHTML(
    "beforeend",
    `
      <div class="subject-lock-layer" aria-hidden="true">
        <div
          class="subject-lock"
          style="left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${width.toFixed(2)}px;height:${height.toFixed(2)}px;"
        >
          <span>${label}</span>
        </div>
      </div>
    `,
  );
}

function resetSubjectSelection(kind) {
  state.cropRects[kind] = null;
  state.pendingCropRect = null;
  clearSubjectLockOverlay(kind);
}

function disposePoseRenderers() {
  state.teacherPoseRenderer?.();
  state.userPoseRenderer?.();
  state.teacherPoseRenderer = null;
  state.userPoseRenderer = null;
}

function resetAudioAlignment() {
  state.audioAlignment = null;
  state.alignmentRequestId += 1;
  dom.audioOffsetRange.value = "0";
  dom.audioOffsetInput.value = "0";
  dom.audioAlignStatus.textContent = "音轨尚未对齐";
  dom.audioAlignStatus.dataset.state = "idle";
  dom.syncControls.classList.add("hidden");
  dom.commonProgress.value = "0";
  dom.commonProgress.max = "0";
  dom.commonTime.textContent = "00:00.00 / 00:00.00";
  dom.syncAccuracy.textContent = "同步待校准";
  dom.timelineMarkers.innerHTML = "";
  dom.analyzeButton.disabled = true;
  dom.analyzeButton.textContent = "请先完成音轨校准";
  dom.autoAlignAudio.disabled = false;
  videoPlayback.setAlignment(null);
}

function setAudioAlignment(alignment) {
  const offsetSec = clamp(Number(alignment.offsetSec) || 0, -30, 30);
  const teacher = teacherVideoRef.current;
  const user = userVideoRef.current;
  const resolved = alignment.timeline
    ? { ...alignment, offsetSec }
    : createManualAudioAlignment(
      offsetSec,
      teacher?.duration || 0,
      user?.duration || 0,
    );
  if (!resolved.timeline || resolved.timeline.duration < 0.5) {
    state.audioAlignment = null;
    dom.audioAlignStatus.textContent = "当前偏移下没有可播放的公共片段，请重新调整";
    dom.audioAlignStatus.dataset.state = "error";
    dom.syncControls.classList.add("hidden");
    dom.analyzeButton.disabled = true;
    dom.analyzeButton.textContent = "请先完成音轨校准";
    videoPlayback.setAlignment(null);
    return false;
  }
  state.audioAlignment = resolved;
  dom.audioOffsetRange.value = String(offsetSec);
  dom.audioOffsetInput.value = offsetSec.toFixed(2);

  if (resolved.method?.startsWith("audio_correlation")) {
    const drift = Math.abs(resolved.timeline?.driftSec || 0);
    const driftText = drift >= 0.04 ? ` · 漂移校正 ${drift.toFixed(2)}s` : "";
    dom.audioAlignStatus.textContent = `音轨已自动对齐 · 用户偏移 ${formatSignedSeconds(offsetSec)} · 可信度 ${resolved.confidence}%${driftText}`;
  } else {
    dom.audioAlignStatus.textContent = `已应用手动偏移 · 用户偏移 ${formatSignedSeconds(offsetSec)}`;
  }
  dom.audioAlignStatus.dataset.state = "ready";
  dom.syncControls.classList.remove("hidden");
  dom.commonProgress.max = String(resolved.timeline?.duration || 0);
  dom.analyzeButton.disabled = false;
  dom.analyzeButton.textContent = "开始分析";
  videoPlayback.setAlignment(resolved);
  renderTimelineMarkers(state.latestReport);
  return true;
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
    resetSubjectSelection("user");
  } else {
    teacherVideoRef.current = null;
    teacherCanvasRef.current = null;
    resetSubjectSelection("teacher");
  }
  input.value = "";
  renderEmpty(kind);

  state.latestReport = null;
  videoPlayback.pauseAll();
  videoPlayback.refresh();
  dom.report.classList.add("hidden");
  resetCoachPanel();
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

  resetSubjectSelection(paneKind);
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
    allowCrop: true,
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
    renderSubjectLockOverlay(paneKind);
    videoPlayback.refresh();
  });

  preview.querySelector(".remove-button").addEventListener("click", (e) => {
    e.stopPropagation();
    clearPreview(kind);
  });

  const cropBadge = preview.querySelector("[data-subject-crop]");
  if (cropBadge) {
    cropBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      openCropOverlay(paneKind);
    });
  }

  statusEl.textContent = "已添加";
  dom.liveBadge.textContent = "等待比对";
  videoPlayback.refresh();
  dom.formMessage.textContent = `已添加${isUser ? "我的" : "老师"}视频。多人场景建议先点「框选人物」。`;
  if (state.teacherFile && state.userFile) {
    window.setTimeout(() => dom.autoAlignAudio.click(), 0);
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
  const lockedCount = Object.values(state.cropRects).filter(Boolean).length;
  const subjectPrefix = lockedCount > 0
    ? `已锁定 ${lockedCount} 个框选人物。`
    : "未手动框选，将在首帧锁定最清晰的主体。";

  videoPlayback.pauseAll();
  disposePoseRenderers();
  state.latestReport = null;
  state.activeIssueIndex = -1;
  dom.analysisPanel.classList.remove("hidden");
  dom.report.classList.add("hidden");
  resetCoachPanel("正在分析，建议会在完成后显示。");
  resetAnalysisSteps();
  setAnalysisStep("audio", "complete");
  setAnalysisStep("calibration", "complete");
  setAnalysisStep("pose", "active");
  dom.analyzeButton.disabled = true;
  dom.liveBadge.textContent = lockedCount > 0 ? "分析框选主体" : "锁定运动主体";
  dom.analysisStage.textContent = `${subjectPrefix}正在准备逐帧比对...`;

  try {
    const localReport = await analyzeMotionComparison(
      teacher,
      user,
      state.cropRects,
      (message) => {
        dom.analysisStage.textContent = `${subjectPrefix}${message}`;
        syncAnalysisStepFromMessage(message);
      },
      {
        teacherCanvas: teacherCanvasRef.current,
        userCanvas: userCanvasRef.current,
        audioAlignment: state.audioAlignment,
        onTrackingStatus: ({ kind, status, message }) => {
          setTrackingStatus(kind, status, message);
        },
        onPoseFramesReady: ({ teacherFrames, userFrames }) => {
          state.teacherPoseRenderer = createPosePlaybackRenderer(
            teacherVideoRef.current,
            teacherCanvasRef.current,
            teacherFrames,
            {
              onTrackingStatus: (status) => {
                setTrackingStatus("teacher", status);
              },
            },
          );
          state.userPoseRenderer = createPosePlaybackRenderer(
            userVideoRef.current,
            userCanvasRef.current,
            userFrames,
            {
              onTrackingStatus: (status) => {
                setTrackingStatus("user", status);
              },
            },
          );
        },
      },
    );
    localReport.source = `${state.teacherFile?.name || "老师视频"} / ${state.userFile?.name || "我的视频"}`;

    let data = localReport;

    if (AI_CONFIG.apiKey) {
      setAnalysisStep("coach", "active");
      dom.analysisStage.textContent = "正在生成舞蹈建议...";
      try {
        const aiReport = await analyzeWithAi(localReport.structuredAnalysis);
        data = normalizeCoachingReport({
          ...localReport,
          ...aiReport,
          scores: localReport.scores,
          structuredAnalysis: localReport.structuredAnalysis,
          pipeline: localReport.pipeline,
          source: localReport.source,
          localMotionSummary: localReport.aiSummary,
        }, localReport);
      } catch {
        data.aiSummary = `${localReport.aiSummary} 云端教练总结暂时不可用，已保留本地分析建议。`;
      }
    }

    data = normalizeCoachingReport(data, localReport);
    state.latestReport = data;
    renderReport(data);
    saveLatestReport(data);
    setAnalysisStep("coach", "complete");
    setAnalysisStep("complete", "complete", "分析完成");
    dom.analysisPanel.classList.add("hidden");
    dom.report.classList.remove("hidden");
    if (lockedCount > 0) {
      dom.liveBadge.textContent = "已分析锁定人物";
    } else {
      dom.liveBadge.textContent = AI_CONFIG.apiKey ? "AI 已分析" : "分析完成";
    }
    videoPlayback.seekCommon(0);
    updateAdviceForTime(0);
    dom.report.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    markAnalysisFailed();
    dom.analysisPanel.classList.add("hidden");
    dom.formMessage.textContent = `分析失败：${err.message}`;
    dom.liveBadge.textContent = "分析失败";
  }

  dom.analyzeButton.disabled = false;
  dom.analyzeButton.textContent = "重新分析";
}

function renderIssues(mismatches) {
  dom.issueList.innerHTML = mismatches
    .map(
      (issue, index) => `
        <article class="issue-card" data-issue-index="${index}" tabindex="0" role="button">
          <div class="issue-topline">
            <h3>${escapeHtml(issue.title)}</h3>
            <span class="timestamp">${escapeHtml(formatTimeRange(issue))}</span>
          </div>
          <div class="coach-detail-grid">
            <div><b>做得好的地方</b>${escapeHtml(issue.positive)}</div>
            <div><b>动作表现</b>${escapeHtml(issue.performance)}</div>
            <div><b>对舞蹈效果的影响</b>${escapeHtml(issue.impact)}</div>
            <div><b>练习方法</b>${escapeHtml(issue.practice)}</div>
            <div class="encouragement"><b>教练鼓励</b>${escapeHtml(issue.encouragement)}</div>
          </div>
        </article>
      `,
    )
    .join("");
  dom.coachEmpty.classList.add("hidden");
  dom.issueList.classList.remove("hidden");
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

function renderTimelineMarkers(report) {
  const duration = videoPlayback.getDuration();
  if (!report?.mismatches || duration <= 0) {
    dom.timelineMarkers.innerHTML = "";
    return;
  }

  dom.timelineMarkers.innerHTML = report.mismatches
    .map((issue, index) => {
      const start = clamp(Number(issue.startTime) || 0, 0, duration);
      const end = clamp(Number(issue.endTime) || start + 0.4, start, duration);
      const left = (start / duration) * 100;
      const width = Math.max(0.5, ((end - start) / duration) * 100);
      return `<span class="timeline-marker" data-marker-index="${index}" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%;"></span>`;
    })
    .join("");
}

function renderReport(data) {
  document.querySelector("#report-title").textContent = data.title;
  document.querySelector("#coachNote").textContent = data.aiSummary;
  renderScores(data.scores);
  renderIssues(data.mismatches);
  renderTimelineMarkers(data);
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

  const lockedCount = Object.values(state.cropRects).filter(Boolean).length;
  dom.formMessage.textContent = lockedCount > 0
    ? `已确认 ${lockedCount} 个目标人物，分析会持续绑定同一人物。`
    : "未框选人物：系统会在首帧锁定最清晰主体，丢失后不会自动改跟其他人。";
  return true;
}

function highlightIssue(index, options = {}) {
  const card = dom.issueList.querySelector(`[data-issue-index="${index}"]`);

  dom.issueList.querySelectorAll(".issue-card").forEach((item) => item.classList.remove("highlight"));
  dom.timelineMarkers.querySelectorAll(".timeline-marker").forEach((item) => item.classList.remove("active"));
  state.activeIssueIndex = card ? index : -1;

  if (!card) return;

  card.classList.add("highlight");
  dom.timelineMarkers.querySelector(`[data-marker-index="${index}"]`)?.classList.add("active");
  if (options.scroll !== false) {
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function jumpToIssue(index) {
  const issue = state.latestReport?.mismatches?.[index];
  if (issue) {
    videoPlayback.seekCommon(Number(issue.startTime) || parseTimestamp(issue.timestamp));
  }

  highlightIssue(index);
}

function updateAdviceForTime(commonTime) {
  const mismatches = state.latestReport?.mismatches || [];
  const activeIndex = mismatches.findIndex((issue) => {
    return commonTime >= Number(issue.startTime) && commonTime <= Number(issue.endTime);
  });

  if (activeIndex >= 0) {
    const issue = mismatches[activeIndex];
    dom.currentAdviceTime.textContent = `${formatTimeRange(issue)} · ${issue.title}`;
    if (state.activeIssueIndex !== activeIndex) highlightIssue(activeIndex);
    return;
  }

  if (mismatches.length > 0) {
    dom.currentAdviceTime.textContent = "当前片段未发现明显问题";
    if (state.activeIssueIndex !== -1) highlightIssue(-1);
  }
}

function formatTimeRange(issue) {
  return `${formatShortTime(issue.startTime)}–${formatShortTime(issue.endTime)}`;
}

function formatShortTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
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
  resetCoachPanel();
  dom.timelineMarkers.innerHTML = "";
  dom.liveBadge.textContent = "等待比对";
  dom.formMessage.textContent = "";
  clearPoseCanvas(teacherCanvasRef.current);
  clearPoseCanvas(userCanvasRef.current);

  videoPlayback.seekCommon(0);

  dom.compareStage.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetCoachPanel(message = "完成音轨校准与动作分析后，建议会按公共时间轴显示在这里。") {
  dom.coachEmpty.textContent = message;
  dom.coachEmpty.classList.remove("hidden");
  dom.issueList.classList.add("hidden");
  dom.issueList.innerHTML = "";
  dom.currentAdviceTime.textContent = "等待分析";
  state.activeIssueIndex = -1;
}

function resetAnalysisSteps() {
  dom.analysisSteps.querySelectorAll("[data-analysis-step]").forEach((item) => {
    item.dataset.state = "pending";
  });
}

function setAnalysisStep(key, status, label = null) {
  const item = dom.analysisSteps.querySelector(`[data-analysis-step="${key}"]`);
  if (!item) return;
  item.dataset.state = status;
  if (label) item.textContent = label;
}

function syncAnalysisStepFromMessage(message) {
  if (message.includes("识别") || message.includes("MediaPipe")) {
    setAnalysisStep("pose", "active");
    return;
  }
  if (message.includes("共同动作") || message.includes("归一化") || message.includes("DTW") || message.includes("对齐老师")) {
    setAnalysisStep("pose", "complete");
    setAnalysisStep("compare", "active");
    return;
  }
  if (message.includes("生成舞蹈建议")) {
    setAnalysisStep("compare", "complete");
    setAnalysisStep("coach", "active");
  }
}

function markAnalysisFailed() {
  const active = dom.analysisSteps.querySelector('[data-state="active"]');
  if (active) active.dataset.state = "error";
  setAnalysisStep("complete", "error", "分析失败");
}

function setTrackingStatus(kind, status, message = null) {
  const preview = previewForKind(kind);
  const output = preview.querySelector("[data-tracking-status]");
  if (!output) return;

  output.textContent = message || (status === "lost" ? "目标人物暂时丢失" : "已锁定目标人物");
  output.dataset.state = status;
  output.classList.remove("hidden");
}

function openCropOverlay(kind) {
  const video = videoForKind(kind);
  if (!video) return;

  videoPlayback.pauseAll();
  dom.formMessage.textContent = "";
  state.activeCropKind = kind;
  state.pendingCropRect = state.cropRects[kind] ? { ...state.cropRects[kind] } : null;
  state.cropDragging = false;
  state.cropStart = null;
  state.cropInteraction = null;
  state.cropPointerId = null;
  dom.cropConfirm.disabled = !state.pendingCropRect;
  dom.cropConfirm.textContent = state.pendingCropRect ? "确认使用此区域" : "确认框选";
  dom.cropHint.textContent = kind === "teacher"
    ? "框选需要持续跟踪的老师人物，可拖动或拉动四角调整"
    : "框选需要持续跟踪的自己，可拖动或拉动四角调整";
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
  state.cropInteraction = null;
  state.cropPointerId = null;
}

function cancelCropOverlay() {
  const kind = state.activeCropKind;
  const existing = kind ? state.cropRects[kind] : null;
  state.pendingCropRect = existing ? { ...existing } : null;
  closeCropOverlay();
  dom.formMessage.textContent = existing
    ? "已取消调整，继续使用之前锁定的人物区域。"
    : "已取消框选。系统会在首帧锁定一个主体，丢失后不会自动改跟其他人。";
  state.activeCropKind = null;
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

  const handleSize = Math.max(10, Math.min(canvas.width, canvas.height) * 0.018);
  ctx.fillStyle = var_lime;
  [
    [left, top],
    [left + w, top],
    [left, top + h],
    [left + w, top + h],
  ].forEach(([x, y]) => {
    ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
  });
}

const var_lime = "#b7f34a";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function canvasCoords(e) {
  const rect = dom.cropCanvas.getBoundingClientRect();
  const contentRect = getContainedContentRect(
    rect.width,
    rect.height,
    dom.cropCanvas.width,
    dom.cropCanvas.height,
  );
  const scaleX = dom.cropCanvas.width / contentRect.width;
  const scaleY = dom.cropCanvas.height / contentRect.height;
  return {
    x: clamp((e.clientX - rect.left - contentRect.x) * scaleX, 0, dom.cropCanvas.width),
    y: clamp((e.clientY - rect.top - contentRect.y) * scaleY, 0, dom.cropCanvas.height),
  };
}

function cropRectFromPoints(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function findCropInteraction(point) {
  const rect = state.pendingCropRect;
  if (!rect) return { mode: "create" };

  const hitRadius = Math.max(16, Math.min(dom.cropCanvas.width, dom.cropCanvas.height) * 0.035);
  const corners = {
    nw: { x: rect.x, y: rect.y },
    ne: { x: rect.x + rect.width, y: rect.y },
    sw: { x: rect.x, y: rect.y + rect.height },
    se: { x: rect.x + rect.width, y: rect.y + rect.height },
  };

  const handle = Object.entries(corners).find(([, corner]) => {
    return Math.hypot(point.x - corner.x, point.y - corner.y) <= hitRadius;
  });
  if (handle) return { mode: "resize", handle: handle[0], original: { ...rect } };

  const inside = point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
  return inside
    ? { mode: "move", original: { ...rect } }
    : { mode: "create" };
}

function updateCropInteraction(point) {
  const interaction = state.cropInteraction;
  if (!interaction || !state.cropStart) return;

  if (interaction.mode === "create") {
    state.pendingCropRect = cropRectFromPoints(state.cropStart, point);
  } else if (interaction.mode === "move") {
    const deltaX = point.x - state.cropStart.x;
    const deltaY = point.y - state.cropStart.y;
    state.pendingCropRect = {
      ...interaction.original,
      x: clamp(interaction.original.x + deltaX, 0, dom.cropCanvas.width - interaction.original.width),
      y: clamp(interaction.original.y + deltaY, 0, dom.cropCanvas.height - interaction.original.height),
    };
  } else {
    const original = interaction.original;
    const anchors = {
      nw: { x: original.x + original.width, y: original.y + original.height },
      ne: { x: original.x, y: original.y + original.height },
      sw: { x: original.x + original.width, y: original.y },
      se: { x: original.x, y: original.y },
    };
    state.pendingCropRect = cropRectFromPoints(anchors[interaction.handle], point);
  }

  const rect = state.pendingCropRect;
  drawCropRect(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  dom.cropConfirm.disabled = rect.width <= 10 || rect.height <= 10;
  dom.cropConfirm.textContent = "确认锁定人物";
}

function finishCropInteraction() {
  state.cropDragging = false;
  state.cropStart = null;
  state.cropInteraction = null;
  state.cropPointerId = null;
  const rect = state.pendingCropRect;
  if (!rect || rect.width <= 10 || rect.height <= 10) {
    dom.cropConfirm.disabled = true;
  }
}

dom.cropCanvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (state.cropPointerId !== null) return;

  const point = canvasCoords(event);
  state.cropDragging = true;
  state.cropPointerId = event.pointerId;
  state.cropStart = point;
  state.cropInteraction = findCropInteraction(point);
  dom.cropCanvas.setPointerCapture?.(event.pointerId);
});

dom.cropCanvas.addEventListener("pointermove", (event) => {
  if (!state.cropDragging || event.pointerId !== state.cropPointerId) return;
  event.preventDefault();
  updateCropInteraction(canvasCoords(event));
});

["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
  dom.cropCanvas.addEventListener(eventName, (event) => {
    if (state.cropPointerId !== null && event.pointerId !== state.cropPointerId) return;
    if (eventName === "pointerup" && state.cropDragging) {
      updateCropInteraction(canvasCoords(event));
    }
    finishCropInteraction();
  });
});

dom.cropCancel.addEventListener("click", cancelCropOverlay);

dom.cropClear.addEventListener("click", () => {
  const kind = state.activeCropKind;
  if (!kind) return;

  resetSubjectSelection(kind);
  const badge = previewForKind(kind).querySelector(".crop-badge");
  if (badge) {
    badge.textContent = "框选人物";
    badge.classList.remove("locked");
  }
  statusForKind(kind).textContent = "已添加";
  dom.formMessage.textContent = `${kind === "teacher" ? "老师" : "我的"}人物框选已清除，将在首帧自动锁定主体。`;
  closeCropOverlay();
  state.activeCropKind = null;
});

dom.cropConfirm.addEventListener("click", () => {
  const kind = state.activeCropKind;
  if (!state.pendingCropRect || !kind) return;

  state.cropRects[kind] = {
    x: Math.round(state.pendingCropRect.x),
    y: Math.round(state.pendingCropRect.y),
    width: Math.round(state.pendingCropRect.width),
    height: Math.round(state.pendingCropRect.height),
    sourceWidth: dom.cropCanvas.width,
    sourceHeight: dom.cropCanvas.height,
  };
  state.pendingCropRect = null;
  renderSubjectLockOverlay(kind);
  const badge = previewForKind(kind).querySelector(".crop-badge");
  if (badge) {
    badge.textContent = "已锁定人物";
    badge.classList.add("locked");
  }
  statusForKind(kind).textContent = "已锁定人物";
  dom.formMessage.textContent = `已确认${kind === "teacher" ? "老师" : "我的"}目标人物；遮挡时会在原位置附近寻找，不会自动切换到其他人。`;
  dom.liveBadge.textContent = "已锁定主体";

  closeCropOverlay();
  state.activeCropKind = null;
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

dom.applyManualOffset.addEventListener("click", async () => {
  if (!state.teacherFile || !state.userFile) {
    dom.formMessage.textContent = "请先添加老师视频和我的视频。";
    return;
  }

  try {
    await Promise.all([
      waitForVideoFrame(teacherVideoRef.current),
      waitForVideoFrame(userVideoRef.current),
    ]);
    if (applyOffsetValue(Number(dom.audioOffsetInput.value) || 0)) {
      dom.formMessage.textContent = "手动偏移已应用。可开启「循环 4 秒」并继续前后微调。";
    }
  } catch (error) {
    dom.formMessage.textContent = `无法应用偏移：${error.message}`;
  }
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
  state.audioAlignment = null;
  dom.syncControls.classList.add("hidden");
  dom.analyzeButton.disabled = true;
  dom.analyzeButton.textContent = "正在校准音轨";
  videoPlayback.setAlignment(null);
  const requestId = ++state.alignmentRequestId;

  try {
    const alignment = await alignAudioTracks(state.teacherFile, state.userFile);
    if (requestId !== state.alignmentRequestId) return;
    if (setAudioAlignment(alignment)) {
      dom.formMessage.textContent = "音轨校准完成。公共时间轴会持续修正轻微漂移，现在可以开始分析。";
    }
  } catch (error) {
    if (requestId !== state.alignmentRequestId) return;
    state.audioAlignment = null;
    dom.syncControls.classList.add("hidden");
    dom.analyzeButton.disabled = true;
    dom.analyzeButton.textContent = "请手动调整音轨";
    videoPlayback.setAlignment(null);
    dom.audioAlignStatus.textContent = error.message;
    dom.audioAlignStatus.dataset.state = "error";
    dom.formMessage.textContent = "自动对齐失败，可输入偏移秒数并应用手动标定。";
  } finally {
    if (requestId === state.alignmentRequestId) dom.autoAlignAudio.disabled = false;
  }
});

function applyOffsetValue(nextOffset) {
  state.alignmentRequestId += 1;
  dom.autoAlignAudio.disabled = false;
  const teacher = teacherVideoRef.current;
  const user = userVideoRef.current;
  const alignment = state.audioAlignment
    ? shiftAudioAlignment(
      state.audioAlignment,
      clamp(nextOffset, -30, 30),
      teacher?.duration || 0,
      user?.duration || 0,
    )
    : createManualAudioAlignment(
      clamp(nextOffset, -30, 30),
      teacher?.duration || 0,
      user?.duration || 0,
    );
  const applied = setAudioAlignment(alignment);
  if (!applied) return false;
  videoPlayback.seekCommon(state.commonTime);
  return true;
}

dom.analyzeButton.addEventListener("click", () => {
  if (validateBeforeAnalyze()) {
    runAnalysis();
  }
});

dom.recompareButton.addEventListener("click", resetForRecompare);

dom.syncPlay.addEventListener("click", () => {
  videoPlayback.playPause().catch((error) => {
    dom.formMessage.textContent = error.message;
  });
});

dom.frameBack.addEventListener("click", () => {
  videoPlayback.stepFrame(-1);
});

dom.frameForward.addEventListener("click", () => {
  videoPlayback.stepFrame(1);
});

dom.playbackRate.addEventListener("change", () => {
  videoPlayback.setPlaybackRate(Number(dom.playbackRate.value));
});

dom.loopSegment.addEventListener("click", () => {
  const enabled = dom.loopSegment.getAttribute("aria-pressed") !== "true";
  videoPlayback.setLoop(enabled, state.commonTime, 4);
});

dom.commonProgress.addEventListener("input", () => {
  videoPlayback.seekCommon(Number(dom.commonProgress.value));
});

dom.nudgeEarlier.addEventListener("click", () => {
  applyOffsetValue((state.audioAlignment?.offsetSec || 0) - 0.05);
});

dom.nudgeLater.addEventListener("click", () => {
  applyOffsetValue((state.audioAlignment?.offsetSec || 0) + 0.05);
});

dom.issueList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-issue-index]");
  if (card) jumpToIssue(Number(card.dataset.issueIndex));
});

dom.issueList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest("[data-issue-index]");
  if (card) {
    event.preventDefault();
    jumpToIssue(Number(card.dataset.issueIndex));
  }
});

renderEmpty("teacher");
renderEmpty("user");
resetAudioAlignment();
resetCoachPanel();

const layoutObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(() => updateLayout())
  : null;
layoutObserver?.observe(dom.compareStage);
window.addEventListener("orientationchange", updateLayout);
window.addEventListener("resize", updateLayout);
window.addEventListener("beforeunload", () => {
  layoutObserver?.disconnect();
  videoPlayback.destroy();
});

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
  dom.formMessage.textContent = AI_CONFIG.apiKey
    ? "AI 设置已保存，下次分析会在本地结构化结果上生成教练总结。"
    : "未填写 API Key，将继续使用浏览器本地姿态分析和教练建议。";
});
