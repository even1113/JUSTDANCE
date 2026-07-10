const state = {
  practiceFile: null,
  referenceFile: null,
  practiceUrl: null,
  referenceUrl: null,
  isSampleMode: false,
  latestReport: null,
  activeTab: "review",
  completedDrills: new Set(),
  codeCountdown: 0,
  codeTimer: null,
};

const storageKeys = {
  reports: "danceMirrorComparisons",
  auth: "danceMirrorAuth",
};

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
  scores: {
    pathMatch: 62,
    timing: 74,
    bodyLine: 70,
  },
};

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

const sampleYearRecords = [
  {
    id: "demo_year_1",
    createdAt: daysAgo(24),
    title: "副歌 Wave 腰胯路径偏短",
    aiSummary: "连续两次比对都显示腰胯路径短于老师，建议先练肩胸腰胯的慢速传递。",
    advice: "每天 10 分钟慢速 Wave，先不跟音乐。",
    source: "K-pop 副歌练习",
  },
  {
    id: "demo_year_2",
    createdAt: daysAgo(86),
    title: "重心切换落后老师半拍",
    aiSummary: "老师在手臂打开前已经完成脚下准备，你的重心在下一帧才补上。",
    advice: "拆掉手臂，只练脚下右左切换 5 组。",
    source: "Jazz 基础组合",
  },
  {
    id: "demo_year_3",
    createdAt: daysAgo(173),
    title: "Ending 线条提前回弹",
    aiSummary: "最后一拍红色路径提前回收，导致定格不够干净。",
    advice: "最后 4 拍单独练，停住 2 秒再放松。",
    source: "Urban 片段",
  },
];

const dom = {
  appShell: document.querySelector(".app-shell"),
  appContent: document.querySelector("#appContent"),
  loginScreen: document.querySelector("#loginScreen"),
  phoneInput: document.querySelector("#phoneInput"),
  codeInput: document.querySelector("#codeInput"),
  sendCodeButton: document.querySelector("#sendCodeButton"),
  loginButton: document.querySelector("#loginButton"),
  loginMessage: document.querySelector("#loginMessage"),
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
  trainButton: document.querySelector("#trainButton"),
  saveButton: document.querySelector("#saveButton"),
  sessionCount: document.querySelector("#sessionCount"),
  currentGoal: document.querySelector("#currentGoal"),
  nextStep: document.querySelector("#nextStep"),
  liveBadge: document.querySelector(".live-badge"),
  sampleButton: document.querySelector("#sampleButton"),
  timelineRow: document.querySelector("#timelineRow"),
  frameSlider: document.querySelector("#frameSlider"),
  frameTime: document.querySelector("#frameTime"),
  headerMode: document.querySelector("#headerMode"),
  historyButton: document.querySelector("#historyButton"),
  screens: document.querySelectorAll(".screen"),
  navButtons: document.querySelectorAll(".bottom-nav button"),
  trainingTitle: document.querySelector("#trainingTitle"),
  trainingSummary: document.querySelector("#trainingSummary"),
  trainingProgressText: document.querySelector("#trainingProgressText"),
  trainingProgressBar: document.querySelector("#trainingProgressBar"),
  drillList: document.querySelector("#drillList"),
  profileBars: document.querySelector("#profileBars"),
  insightCard: document.querySelector("#insightCard"),
  historyList: document.querySelector("#historyList"),
  userPhone: document.querySelector("#userPhone"),
  userMeta: document.querySelector("#userMeta"),
  userAvatar: document.querySelector("#userAvatar"),
  logoutButton: document.querySelector("#logoutButton"),
};

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(storageKeys.auth) || "null");
  } catch {
    return null;
  }
}

function getReportsKey() {
  const user = getCurrentUser();
  return user ? `${storageKeys.reports}:${user.phone}` : storageKeys.reports;
}

function getReports() {
  try {
    return JSON.parse(localStorage.getItem(getReportsKey()) || "[]");
  } catch {
    return [];
  }
}

function setReports(reports) {
  localStorage.setItem(getReportsKey(), JSON.stringify(reports));
}

function getYearRecords() {
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const records = [...getReports(), ...sampleYearRecords];
  return records
    .filter((record) => new Date(record.createdAt).getTime() >= oneYearAgo)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function normalizePhone(value) {
  return String(value).replace(/\D/g, "").slice(0, 11);
}

function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function maskPhone(phone) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

function setLoginMessage(message, isError = false) {
  dom.loginMessage.textContent = message;
  dom.loginMessage.classList.toggle("error", isError);
}

function updateCodeButton() {
  if (state.codeCountdown > 0) {
    dom.sendCodeButton.textContent = `${state.codeCountdown}s`;
    dom.sendCodeButton.disabled = true;
  } else {
    dom.sendCodeButton.textContent = "获取验证码";
    dom.sendCodeButton.disabled = false;
  }
}

function startCodeCountdown() {
  state.codeCountdown = 30;
  updateCodeButton();

  if (state.codeTimer) {
    window.clearInterval(state.codeTimer);
  }

  state.codeTimer = window.setInterval(() => {
    state.codeCountdown -= 1;

    if (state.codeCountdown <= 0) {
      window.clearInterval(state.codeTimer);
      state.codeTimer = null;
      state.codeCountdown = 0;
    }

    updateCodeButton();
  }, 1000);
}

function sendMockCode() {
  const phone = normalizePhone(dom.phoneInput.value);
  dom.phoneInput.value = phone;

  if (!isValidPhone(phone)) {
    setLoginMessage("请输入有效的 11 位手机号。", true);
    return;
  }

  startCodeCountdown();
  setLoginMessage(`验证码已发送至 ${maskPhone(phone)}。Demo 可输入任意 4-6 位数字。`);
  dom.codeInput.focus();
}

function loginWithPhone() {
  const phone = normalizePhone(dom.phoneInput.value);
  const code = normalizePhone(dom.codeInput.value);
  dom.phoneInput.value = phone;
  dom.codeInput.value = code;

  if (!isValidPhone(phone)) {
    setLoginMessage("请输入有效的 11 位手机号。", true);
    return;
  }

  if (!/^\d{4,6}$/.test(code)) {
    setLoginMessage("请输入 4-6 位数字验证码。", true);
    return;
  }

  localStorage.setItem(
    storageKeys.auth,
    JSON.stringify({
      phone,
      loginAt: new Date().toISOString(),
    }),
  );
  setLoginMessage("登录成功，正在进入 DanceMirror。");
  applyAuthState();
}

function logout() {
  localStorage.removeItem(storageKeys.auth);
  state.latestReport = null;
  state.completedDrills = new Set();
  dom.phoneInput.value = "";
  dom.codeInput.value = "";
  setLoginMessage("Demo 模式：验证码输入任意 4-6 位数字即可。");
  switchTab("review");
  applyAuthState();
}

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

function updateHeader() {
  const labelsByTab = {
    review: "逐帧比对",
    train: "修正建议",
    profile: "比对历史",
  };

  dom.headerMode.textContent = labelsByTab[state.activeTab];
}

function updateSessionSummary() {
  const records = getYearRecords();
  dom.sessionCount.textContent = `${records.length} 次比对`;
  dom.currentGoal.textContent = `${(Number(dom.frameSlider.value) / 24).toFixed(2)}s`;
  dom.nextStep.textContent = state.latestReport ? "查看总结" : state.practiceFile || state.isSampleMode ? "开始比对" : "添加视频";
}

function renderUser() {
  const user = getCurrentUser();

  if (!user) {
    dom.userPhone.textContent = "未登录用户";
    dom.userMeta.textContent = "登录后保存过去一年比对历史";
    dom.userAvatar.textContent = "DM";
    return;
  }

  const loginDate = new Date(user.loginAt);
  dom.userPhone.textContent = maskPhone(user.phone);
  dom.userMeta.textContent = `${loginDate.getMonth() + 1}/${loginDate.getDate()} 登录 · 本地 Demo 账号`;
  dom.userAvatar.textContent = user.phone.slice(-2);
}

function applyAuthState() {
  const user = getCurrentUser();
  const isAuthed = Boolean(user);

  dom.appShell.classList.toggle("is-authenticated", isAuthed);
  dom.appContent.setAttribute("aria-hidden", String(!isAuthed));
  dom.loginScreen.setAttribute("aria-hidden", String(isAuthed));

  if (isAuthed) {
    renderUser();
    renderTraining();
    renderProfile();
    updateSessionSummary();
  }
}

function switchTab(tab) {
  state.activeTab = tab;

  dom.screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === tab);
  });

  dom.navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  updateHeader();

  if (tab === "train") {
    renderTraining();
  }

  if (tab === "profile") {
    renderProfile();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
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

function renderEmptyPractice() {
  dom.practicePreview.className = "preview empty compare-preview student-preview";
  dom.practicePreview.innerHTML = `
    <div class="empty-video">
      <span class="play-symbol">U</span>
      <strong>添加我的视频</strong>
      <small>AI 会标出与老师不一致的路径</small>
    </div>
  `;
  dom.practiceStatus.textContent = "未添加";
}

function renderEmptyReference() {
  dom.referencePreview.className = "preview empty compare-preview teacher-preview";
  dom.referencePreview.innerHTML = `
    <div class="empty-video">
      <span class="play-symbol">T</span>
      <strong>添加老师视频</strong>
      <small>用来做标准路径对齐</small>
    </div>
  `;
  dom.referenceStatus.textContent = "未添加";
}

function renderSamplePane(target, kind, withOverlay = false) {
  const isTeacher = kind === "teacher";
  target.className = `preview compare-preview ${isTeacher ? "teacher-preview" : "student-preview"}`;
  target.innerHTML = `
    <div class="demo-video">
      <div class="demo-video-content">
        <strong>${isTeacher ? "老师示范 · K-pop 副歌" : "我的练习 · K-pop 副歌"}</strong>
        <span>${isTeacher ? "绿色为标准身体路径" : "红色为 AI 检测到的偏差路径"}</span>
        <div class="demo-timeline"><i style="width: ${isTeacher ? "58%" : "38%"}"></i></div>
      </div>
      ${withOverlay ? overlaySvg(kind) : ""}
    </div>
  `;
}

function renderSampleVideo(withOverlay = Boolean(state.latestReport)) {
  renderSamplePane(dom.referencePreview, "teacher", withOverlay);
  renderSamplePane(dom.practicePreview, "student", withOverlay);
  dom.referenceStatus.textContent = "已添加";
  dom.practiceStatus.textContent = "已添加";
  dom.liveBadge.textContent = withOverlay ? "已标注路径" : "示例已就绪";
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

  if (isPractice) {
    state.isSampleMode = false;
    renderEmptyPractice();
  } else {
    renderEmptyReference();
  }

  state.latestReport = null;
  dom.report.classList.add("hidden");
  dom.liveBadge.textContent = "等待比对";
  updateSessionSummary();
}

function renderPreview(kind, file) {
  const isPractice = kind === "practice";
  const preview = isPractice ? dom.practicePreview : dom.referencePreview;
  const key = isPractice ? "practiceFile" : "referenceFile";
  const urlKey = isPractice ? "practiceUrl" : "referenceUrl";

  if (state[urlKey]) {
    URL.revokeObjectURL(state[urlKey]);
  }

  state.isSampleMode = false;
  state[key] = file;
  state[urlKey] = URL.createObjectURL(file);
  preview.className = `preview compare-preview ${isPractice ? "student-preview" : "teacher-preview"}`;
  preview.innerHTML = `
    <div class="video-preview">
      <video src="${state[urlKey]}" controls playsinline></video>
      <div class="video-meta">
        <span>${escapeHtml(file.name)} · ${formatFileSize(file.size)}</span>
        <button class="remove-button" type="button">删除</button>
      </div>
    </div>
  `;

  preview.querySelector(".remove-button").addEventListener("click", () => clearPreview(kind));

  if (isPractice) {
    dom.practiceStatus.textContent = "已添加";
  } else {
    dom.referenceStatus.textContent = "已添加";
  }

  dom.liveBadge.textContent = "等待比对";
  updateSessionSummary();
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

function useSampleVideo() {
  state.isSampleMode = true;
  state.practiceFile = null;
  state.referenceFile = null;
  state.latestReport = null;
  dom.practiceInput.value = "";
  dom.referenceInput.value = "";
  renderSampleVideo(false);
  dom.report.classList.add("hidden");
  dom.formMessage.textContent = "";
  updateSessionSummary();
}

function attachOverlayToUploadedVideo(target, kind) {
  const videoPreview = target.querySelector(".video-preview");

  if (!videoPreview || videoPreview.querySelector(".path-overlay")) {
    return;
  }

  videoPreview.insertAdjacentHTML("beforeend", overlaySvg(kind));
}

function renderDetectedPaths() {
  if (state.isSampleMode) {
    renderSampleVideo(true);
    return;
  }

  attachOverlayToUploadedVideo(dom.referencePreview, "teacher");
  attachOverlayToUploadedVideo(dom.practicePreview, "student");
}

function buildReport() {
  const base = cloneReport(comparisonTemplate);
  base.id = `comparison_${Date.now()}`;
  base.createdAt = new Date().toISOString();
  base.source = state.isSampleMode
    ? "示例 K-pop 双视频"
    : `${state.referenceFile?.name || "老师视频"} / ${state.practiceFile?.name || "我的视频"}`;
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

function saveReport(report) {
  const reports = getReports();
  const exists = reports.some((item) => item.id === report.id);
  const nextReports = exists ? reports : [report, ...reports].slice(0, 60);
  setReports(nextReports);
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
  state.completedDrills = new Set();
  renderDetectedPaths();
  renderReport(data);
  saveReport(data);
  renderTraining();
  renderProfile();
  dom.analysisPanel.classList.add("hidden");
  dom.report.classList.remove("hidden");
  dom.liveBadge.textContent = "已标注路径";
  dom.analyzeButton.disabled = false;
  dom.saveButton.textContent = "已自动保存";
  updateSessionSummary();
  dom.report.scrollIntoView({ behavior: "smooth", block: "start" });
}

function validateBeforeAnalyze() {
  if (!state.isSampleMode && (!state.practiceFile || !state.referenceFile)) {
    dom.formMessage.textContent = "请同时添加老师视频和我的视频，或使用示例视频跑一遍。";
    return false;
  }

  dom.formMessage.textContent = "";
  return true;
}

function saveLatestReport() {
  if (!state.latestReport) {
    dom.formMessage.textContent = "先完成一次逐帧比对，AI 会自动保存总结。";
    return;
  }

  saveReport(state.latestReport);
  renderProfile();
  dom.saveButton.textContent = "已在历史中";
}

function renderTraining() {
  const report = state.latestReport || getReports()[0] || comparisonTemplate;
  const steps = report.drillPlan.steps;
  const completed = steps.filter((_, index) => state.completedDrills.has(index)).length;

  dom.trainingTitle.textContent = report.mismatches?.[0]?.title || "下一次只练路径对齐";
  dom.trainingSummary.textContent = `根据最近一次比对，用 ${report.drillPlan.durationMin} 分钟修正红色路径偏离最大的片段。`;
  dom.trainingProgressText.textContent = `${completed}/${steps.length} 完成`;
  dom.trainingProgressBar.style.width = `${(completed / steps.length) * 100}%`;
  dom.drillList.innerHTML = steps
    .map(
      (step, index) => `
        <article class="drill-card ${state.completedDrills.has(index) ? "done" : ""}">
          <span class="drill-index">${index + 1}</span>
          <div>
            <h3>${escapeHtml(step.split("：")[0])}</h3>
            <p>${escapeHtml(step)}</p>
          </div>
          <button class="drill-check" type="button" data-drill="${index}" aria-label="标记完成">✓</button>
        </article>
      `,
    )
    .join("");
}

function renderYearOverview(records) {
  const latest = records[0];
  const avgPath = latest?.scores?.pathMatch || comparisonTemplate.scores.pathMatch;
  const avgTiming = latest?.scores?.timing || comparisonTemplate.scores.timing;

  dom.profileBars.innerHTML = `
    <div class="year-card">
      <strong>${records.length}</strong>
      <span>过去一年比对</span>
    </div>
    <div class="year-card">
      <strong>${avgPath}</strong>
      <span>最近路径贴合</span>
    </div>
    <div class="year-card">
      <strong>${avgTiming}</strong>
      <span>最近节奏同步</span>
    </div>
  `;
}

function renderHistory(records) {
  if (records.length === 0) {
    dom.historyList.innerHTML = `
      <div class="empty-state">
        还没有比对记录。可以先到「比对」页使用示例视频跑一遍。
      </div>
    `;
    return;
  }

  dom.historyList.innerHTML = records
    .map((record) => {
      const date = new Date(record.createdAt);
      const advice = record.advice || record.mismatches?.[0]?.advice || "下一次先修正红色路径偏离最大的片段。";
      return `
        <article class="history-card">
          <header>
            <h3>${escapeHtml(record.title)}</h3>
            <time>${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}</time>
          </header>
          <p>${escapeHtml(record.source || "双视频比对")} · AI 总结：${escapeHtml(record.aiSummary)}</p>
          <p class="advice">${escapeHtml(advice)}</p>
        </article>
      `;
    })
    .join("");
}

function renderInsight(records) {
  if (records.length === 0) {
    dom.insightCard.textContent = "先完成一次逐帧比对，系统会开始记录每次 AI 总结和修正建议。";
    return;
  }

  const latest = records[0];
  dom.insightCard.textContent = `最近一次比对显示：「${latest.title}」。建议下一次先暂停在红线偏离最大的帧，确认身体路径贴近绿色标准线后再跟音乐。`;
}

function renderProfile() {
  const records = getYearRecords();
  renderUser();
  renderYearOverview(records);
  renderInsight(records);
  renderHistory(records);
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
  dom.currentGoal.textContent = `${seconds}s`;
}

dom.phoneInput.addEventListener("input", () => {
  dom.phoneInput.value = normalizePhone(dom.phoneInput.value);
});

dom.codeInput.addEventListener("input", () => {
  dom.codeInput.value = normalizePhone(dom.codeInput.value).slice(0, 6);
});

dom.sendCodeButton.addEventListener("click", sendMockCode);
dom.loginButton.addEventListener("click", loginWithPhone);
dom.logoutButton.addEventListener("click", logout);

dom.codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loginWithPhone();
  }
});

dom.practiceInput.addEventListener("change", (event) => handleVideoChange("practice", event));
dom.referenceInput.addEventListener("change", (event) => handleVideoChange("reference", event));
dom.sampleButton.addEventListener("click", useSampleVideo);
dom.frameSlider.addEventListener("input", (event) => updateFrame(event.target.value));

dom.analyzeButton.addEventListener("click", () => {
  if (validateBeforeAnalyze()) {
    fakeAnalyze();
  }
});

dom.saveButton.addEventListener("click", saveLatestReport);
dom.trainButton.addEventListener("click", () => switchTab("train"));
dom.historyButton.addEventListener("click", () => switchTab("profile"));

dom.timelineRow.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-jump]");
  if (button) {
    highlightIssue(Number(button.dataset.jump));
  }
});

dom.navButtons.forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

dom.drillList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-drill]");

  if (!button) {
    return;
  }

  const index = Number(button.dataset.drill);

  if (state.completedDrills.has(index)) {
    state.completedDrills.delete(index);
  } else {
    state.completedDrills.add(index);
  }

  renderTraining();
});

renderEmptyReference();
renderEmptyPractice();
renderTraining();
renderProfile();
updateHeader();
updateFrame(dom.frameSlider.value);
updateSessionSummary();
applyAuthState();
