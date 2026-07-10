const state = {
  practiceFile: null,
  referenceFile: null,
  practiceUrl: null,
  referenceUrl: null,
  latestReport: null,
};

const storageKey = "danceMirrorLatestReport";

const comparisonTemplate = {
  title: "Wave 和重心路径没有完全贴合老师",
  aiSummary:
    "这次比对里，你的上半身节奏基本跟上了老师，但身体路径没有完整传递到腰胯。第 8 秒的 Wave 只走到胸口，第 13 秒重心切换比老师慢约半拍，所以红色路径在腰胯和右脚位置明显偏离绿色标准路径。下一次先不用练整段，建议只抓 8-14 秒，把肩、胸、腰、胯和脚下重心连成一条路径。",
  mismatches: [
    {
      timestamp: "00:08",
      title: "Wave 路径在腰胯处中断",
      teacherPath: "绿色路径从肩膀传到胸、腰、胯，形成连续曲线。",
      userPath: "红色路径在胸口后变短，腰胯没有继续向下传递。",
      advice: "暂停在 00:08，慢速练 4 组肩-胸-腰-胯，每组 8 拍。",
    },
    {
      timestamp: "00:13",
      title: "重心比老师慢半拍",
      teacherPath: "老师手臂打开时，重心已经压到右脚。",
      userPath: "你的手先到位，脚下重心停在中间，下一帧才补过去。",
      advice: "只练 00:12-00:15，先走脚下重心，再叠加手臂。",
    },
    {
      timestamp: "00:21",
      title: "Ending 定格提前松掉",
      teacherPath: "老师最后一拍身体和眼神都停住，路径收得很干净。",
      userPath: "你的上半身路径提前回弹，Ending 的红线比绿线短。",
      advice: "最后 4 拍单独练 5 次，动作停住后再放松表情。",
    },
  ],
  drillPlan: {
    durationMin: 15,
    steps: [
      "3 分钟：只看肩胸分离，确认红线能贴近绿色上半身路径。",
      "6 分钟：慢速 Wave，把路径从肩膀传到腰胯。",
      "6 分钟：跟 0.75 倍速音乐练 00:08-00:14，重点看脚下重心。",
    ],
  },
  reviewAdvice: [
    "先拖动时间轴到红线偏离最大的帧，不要一上来练整段。",
    "每次只修一个路径问题：先腰胯，再重心，最后 Ending。",
    "下一次录制尽量固定机位，让膝盖和脚踝都进入画面，AI 更容易判断路径。",
  ],
};

const dom = {
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
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cloneReport(report) {
  return JSON.parse(JSON.stringify(report));
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
  input.value = "";
  renderEmpty(kind);

  state.latestReport = null;
  dom.report.classList.add("hidden");
  dom.liveBadge.textContent = "等待比对";
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
  preview.innerHTML = `
    <div class="video-preview">
      <video src="${state[urlKey]}" controls playsinline></video>
      <div class="video-meta">
        <span>${escapeHtml(file.name)} · ${formatFileSize(file.size)}</span>
        <button class="remove-button" type="button">删除视频</button>
      </div>
    </div>
  `;

  preview.querySelector(".remove-button").addEventListener("click", (e) => {
    e.stopPropagation();
    clearPreview(kind);
  });

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
  const base = cloneReport(comparisonTemplate);
  base.id = `comparison_${Date.now()}`;
  base.createdAt = new Date().toISOString();
  base.source = `${state.referenceFile?.name || "老师视频"} / ${state.practiceFile?.name || "我的视频"}`;
  base.advice = base.mismatches[0].advice;
  return base;
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
    dom.formMessage.textContent = "请同时添加老师视频和我的视频。";
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

function updateFrame(value) {
  const seconds = (Number(value) / 24).toFixed(2);
  dom.frameTime.textContent = `${seconds}s`;
}

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
dom.frameSlider.addEventListener("input", (event) => updateFrame(event.target.value));

dom.analyzeButton.addEventListener("click", () => {
  if (validateBeforeAnalyze()) {
    fakeAnalyze();
  }
});

dom.timelineRow.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-jump]");
  if (button) {
    highlightIssue(Number(button.dataset.jump));
  }
});

renderEmpty("reference");
renderEmpty("practice");
updateFrame(dom.frameSlider.value);
