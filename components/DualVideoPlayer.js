const PANE_COPY = {
  teacher: {
    emptyTitle: '添加老师视频',
    previewClass: 'teacher-preview',
  },
  user: {
    emptyTitle: '添加我的视频',
    previewClass: 'student-preview',
  },
}

function renderEmptyVideoPane(kind) {
  const copy = PANE_COPY[kind]

  return `
    <div class="empty-video">
      <span class="play-symbol">+</span>
      <strong>${copy.emptyTitle}</strong>
      <small>点击选择视频文件</small>
    </div>
  `
}

function renderUploadedVideoPane({ kind, file, url, fileSizeText, allowCrop = false }) {
  const cropButton = allowCrop
    ? '<button class="crop-badge" type="button" id="cropBadge">框选自己</button>'
    : ''

  return `
    <div class="video-preview" data-video-kind="${kind}">
      <div class="video-frame">
        <video src="${escapeHtml(url)}" controls playsinline preload="metadata"></video>
        <canvas class="pose-canvas" aria-hidden="true"></canvas>
      </div>
      <div class="video-frame-tools" aria-label="${kind === 'teacher' ? '老师视频' : '我的视频'}逐帧控制">
        <button type="button" data-frame-step="-1" title="后退一帧" aria-label="后退一帧">‹</button>
        <output data-video-time>0.00s</output>
        <button type="button" data-frame-step="1" title="前进一帧" aria-label="前进一帧">›</button>
      </div>
      <div class="video-meta">
        <span>${escapeHtml(file.name)} · ${escapeHtml(fileSizeText)}</span>
        ${cropButton}
        <button class="remove-button" type="button">删除视频</button>
      </div>
    </div>
  `
}

function previewClassForKind(kind) {
  return PANE_COPY[kind].previewClass
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export {
  renderEmptyVideoPane,
  renderUploadedVideoPane,
  previewClassForKind,
}
