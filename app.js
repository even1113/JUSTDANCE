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

const mismatchPool = [
  {
    titles: ["Wave 路径在腰胯处中断", "手臂延伸不到位", "肩胸分离不够清晰"],
    teacher: "绿色路径从肩膀传到胸、腰、胯，形成连续曲线。",
    user: "红色路径在胸口后变短，腰胯没有继续向下传递。",
    advice: "暂停在这一帧，慢速练 4 组肩-胸-腰-胯，每组 8 拍。",
  },
  {
    titles: ["重心比老师慢半拍", "脚下重心切换滞后", "重心转移不够果断"],
    teacher: "老师手臂打开时，重心已经压到右脚。",
    user: "你的手先到位，脚下重心停在中间，下一帧才补过去。",
    advice: "拆掉手臂，只练脚下重心切换 5 组，再叠加手臂动作。",
  },
  {
    titles: ["Ending 定格提前松掉", "最后定格不够干净", "收尾动作提前回弹"],
    teacher: "老师最后一拍身体和眼神都停住，路径收得很干净。",
    user: "你的上半身路径提前回弹，定格的线条比老师短。",
    advice: "最后 4 拍单独练 5 次，动作停住 2 秒再放松。",
  },
  {
    titles: ["节奏卡点偏早", "动作比音乐快半拍", "抢拍导致路径变形"],
    teacher: "老师每个重拍都精准卡在鼓点上，路径节奏稳定。",
    user: "你的动作提前启动，红线在重拍前就已经到达终点。",
    advice: "先不跟音乐，用节拍器从 0.5 倍速开始练卡点。",
  },
  {
    titles: ["身体线条角度偏小", "手臂打开幅度不够", "动作路径比老师短"],
    teacher: "老师手臂完全展开，绿色路径从肩到手尖是一条长弧线。",
    user: "你的手臂弯曲，红色路径在手肘处就折回来了。",
    advice: "对镜练手臂全展开 10 次，确认肘关节完全伸直。",
  },
  {
    titles: ["躯干发力顺序反了", "核心带动不够", "发力从末端开始而不是躯干"],
    teacher: "老师从核心发力，路径从腰传到肩再到手。",
    user: "你从手臂开始发力，红色路径从手往回传，方向和老师相反。",
    advice: "躺地练核心发力 3 组，感受从腰腹带动四肢的顺序。",
  },
  {
    titles: ["头部和视线方向偏移", "眼神没有跟随动作", "头部路径和身体路径脱节"],
    teacher: "老师头部和身体路径同步转动，视线始终朝向动作方向。",
    user: "你的头部路径独立于身体，视线还停留在上一个方向。",
    advice: "单独练头部跟随 8 次，先慢速确认视线和手同步。",
  },
  {
    titles: ["膝盖弯曲角度不一致", "下半身路径偏低", "蹲的深度和老师不同"],
    teacher: "老师膝盖弯曲约 90 度，绿色路径在低位保持稳定。",
    user: "你的膝盖弯曲不够，红色路径比绿线高出一截。",
    advice: "靠墙蹲 30 秒 × 3 组，找到和老师一样的膝盖角度。",
  },
];

const summaryTemplates = [
  "这次比对里，你的上半身节奏基本跟上了老师，但身体路径没有完整传递到腰胯。下一次先不用练整段，建议只抓差异最大的几秒，把路径逐段对齐。",
  "整体来看，你的动作幅度和老师比较接近，但发力顺序和节奏有几处明显偏差。建议先修路径方向，再修卡点时机。",
  "你的动作框架和老师差不多，但细节路径有几处偏移——特别是重心和手臂延伸。建议每次只修一个问题，不要贪多。",
  "这次比对发现你的节奏感不错，但身体路径的完整度需要加强。几处红线比绿线短，说明动作没有做到位就收回来了。",
  "比对结果显示你的动作方向基本正确，但路径的精准度还不够。有几帧红线偏离绿线较远，建议慢速拆解这几个片段。",
];

const drillStepPool = [
  "3 分钟：只看肩胸分离，确认红线能贴近绿色上半身路径。",
  "3 分钟：对镜练手臂全展开，确认肘关节完全伸直。",
  "3 分钟：靠墙蹲，找到和老师一样的膝盖角度。",
  "3 分钟：躺地练核心发力，感受从腰腹带动四肢的顺序。",
  "3 分钟：单独练头部跟随，确认视线和手同步。",
  "6 分钟：慢速 Wave，把路径从肩膀传到腰胯。",
  "6 分钟：0.5 倍速练重心切换，先走脚下再叠加手臂。",
  "6 分钟：0.75 倍速音乐练差异最大的片段，重点看路径贴合。",
  "6 分钟：对镜练定格，每个停顿保持 2 秒。",
  "6 分钟：节拍器卡点练习，从慢速开始逐步加速。",
];

const reviewAdvicePool = [
  "先拖动时间轴到红线偏离最大的帧，不要一上来练整段。",
  "每次只修一个路径问题，修好再换下一个。",
  "下一次录制尽量固定机位，让膝盖和脚踝都进入画面，AI 更容易判断路径。",
  "如果视频里有多人，记得用「框选自己」功能标出你的位置。",
  "录视频时穿贴身衣服，宽松衣物会遮挡身体路径，影响 AI 判断。",
  "尽量在光线均匀的环境录制，逆光或侧光会让路径识别不准确。",
];

function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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

function overlaySvg(kind) {
  const isTeacher = kind === "teacher";
  const standardPath = isTeacher
    ? `<path class="path-standard" d="M 32 52 C 45 45, 57 49, 65 63 L 69 78 L 82 82" />
       <path class="path-angle" d="M 67 78 L 81 82 L 88 70" />`
    : `<path class="path-standard" d="M 31 51 C 45 44, 58 49, 66 62 L 69 78 L 82 82" />
       <path class="path-user" d="M 31 51 C 43 48, 54 54, 59 66 L 60 79 L 73 87" />
       <path class="path-angle" d="M 60 79 L 73 87 L 78 75" />`;

  return `
    <svg class="path-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      ${standardPath}
      <circle class="${isTeacher ? "path-standard" : "path-user"}" cx="${isTeacher ? 82 : 73}" cy="${isTeacher ? 82 : 87}" r="3" />
    </svg>
    <div class="path-label">${isTeacher ? "老师腰胯路径连续" : "腰胯和脚下路径偏离"}</div>
  `;
}

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

function attachOverlayToUploadedVideo(target, kind) {
  const videoPreview = target.querySelector(".video-preview");

  if (!videoPreview || videoPreview.querySelector(".path-overlay")) {
    return;
  }

  videoPreview.insertAdjacentHTML("beforeend", overlaySvg(kind));
}

function renderDetectedPaths() {
  attachOverlayToUploadedVideo(dom.referencePreview, "teacher");
  attachOverlayToUploadedVideo(dom.practicePreview, "student");
}

function buildReport() {
  const { reference, practice } = getVideoElements();
  const duration = Math.max(
    reference?.duration || 10,
    practice?.duration || 10,
  );

  const selectedMismatches = pickRandom(mismatchPool, 3);
  const mismatches = selectedMismatches.map((item, i) => {
    const ratio = (i + 1) / 4;
    const ts = Math.max(1, Math.floor(duration * ratio));
    const titleIndex = Math.floor(Math.random() * item.titles.length);
    return {
      timestamp: formatTimestamp(ts),
      title: item.titles[titleIndex],
      teacherPath: item.teacher,
      userPath: item.user,
      advice: item.advice,
    };
  });

  const mainTitle = mismatches[0].title;
  const steps = pickRandom(drillStepPool, 3);
  const durationMin = steps.reduce((sum, s) => sum + parseInt(s, 10), 0);
  const reviewAdvice = pickRandom(reviewAdvicePool, 3);
  const aiSummary = summaryTemplates[Math.floor(Math.random() * summaryTemplates.length)];

  const report = {
    id: `comparison_${Date.now()}`,
    createdAt: new Date().toISOString(),
    source: `${state.referenceFile?.name || "老师视频"} / ${state.practiceFile?.name || "我的视频"}`,
    title: mainTitle,
    aiSummary,
    mismatches,
    drillPlan: {
      durationMin,
      steps,
    },
    reviewAdvice,
    advice: mismatches[0].advice,
  };

  if (state.cropRect) {
    report.userCropRegion = state.cropRect;
  }

  return report;
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

async function fakeAnalyze() {
  const stages = [
    "正在提取老师动作路径...",
    "正在逐帧对齐你的动作...",
    "正在标出红绿路径差异...",
    "正在生成 AI 总结和建议...",
  ];

  dom.analysisPanel.classList.remove("hidden");
  dom.report.classList.add("hidden");
  dom.analyzeButton.disabled = true;
  dom.liveBadge.textContent = "逐帧比对中";

  for (const stage of stages) {
    dom.analysisStage.textContent = stage;
    await new Promise((resolve) => setTimeout(resolve, 520));
  }

  const data = buildReport();
  state.latestReport = data;
  renderDetectedPaths();
  renderReport(data);
  saveLatestReport(data);
  dom.analysisPanel.classList.add("hidden");
  dom.report.classList.remove("hidden");
  dom.liveBadge.textContent = "已标注路径";
  dom.analyzeButton.disabled = false;
  dom.report.scrollIntoView({ behavior: "smooth", block: "start" });
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
    fakeAnalyze();
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
