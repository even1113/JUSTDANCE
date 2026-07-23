function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function icon(name, size = 20) {
  const paths = {
    upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5"/>',
    play: '<path d="m9 7 8 5-8 5V7Z"/>',
    pause: '<path d="M9 7v10M15 7v10"/>',
    back: '<path d="m14 7-5 5 5 5"/>',
    forward: '<path d="m10 7 5 5-5 5"/>',
    close: '<path d="m7 7 10 10M17 7 7 17"/>',
    delete: '<path d="M5 7h14M9 7V5h6v2m-8 0 1 12h8l1-12M10 10v6m4-6v6"/>',
    replace: '<path d="M7 7h9l-2-2m2 2-2 2M17 17H8l2 2m-2-2 2-2"/>',
    check: '<path d="m6 12 4 4 8-9"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    privacy: '<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/>',
    person: '<circle cx="12" cy="8" r="3"/><path d="M6 20c.5-4 2.5-6 6-6s5.5 2 6 6"/>',
    chevron: '<path d="m9 7 5 5-5 5"/>',
  }

  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`
}

function poseFigure(roleOrVariant = 0, variantIndex = 0) {
  const role = typeof roleOrVariant === 'string' ? roleOrVariant : ''
  const variant = typeof roleOrVariant === 'number' ? roleOrVariant : variantIndex
  const armLeft = variant % 2 === 0 ? '6,27 18,20 28,30' : '6,17 18,20 30,13'
  const armRight = variant % 3 === 0 ? '42,30 52,20 65,25' : '42,20 52,20 64,12'
  return `
    <svg class="pose-figure ${role}" viewBox="0 0 72 100" aria-hidden="true">
      <circle cx="36" cy="13" r="6"/>
      <path d="M36 19 35 52M35 31 18 20M35 31 52 20M35 52 22 77M35 52 49 77M22 77 18 94M49 77 55 94"/>
      <polyline points="${armLeft}"/><polyline points="${armRight}"/>
      <circle cx="35" cy="31" r="2"/><circle cx="35" cy="52" r="2"/>
    </svg>`
}

function renderCandidateCard({ id, role, index, selected, label }) {
  const candidateLabel = label || (role === 'teacher' ? `示范者 ${index + 1}` : `人物 ${index + 1}`)
  return `
    <button class="candidate-card${selected ? ' selected' : ''}" type="button" data-candidate-id="${escapeHtml(id || `person-${index + 1}`)}" aria-pressed="${selected}">
      <span class="candidate-visual">${poseFigure(role, index)}</span>
      <span class="candidate-copy"><strong>${escapeHtml(candidateLabel)}</strong>${index === 1 ? '<small>系统建议</small>' : '<small>点击选择</small>'}</span>
      <span class="candidate-check">${selected ? icon('check', 16) : ''}</span>
    </button>`
}

function renderIssueCard(issue, index, options = {}) {
  const active = options.active === true
  const expanded = options.expanded === true
  const quality = issue.quality === 'reference-only' ? '<span class="status-badge reference">仅供参考</span>' : ''
  const severityText = { high: '最优先', medium: '其次', low: '可以稍后修' }[issue.severity] || '建议关注'
  const bodyId = `issue-body-${index}`

  return `
    <article class="issue-card severity-${escapeHtml(issue.severity)}${active ? ' timeline-active' : ''}${expanded ? ' expanded' : ''}" data-issue-index="${index}">
      <button class="issue-card-head" type="button" data-toggle-issue="${index}" aria-expanded="${expanded}" aria-controls="${bodyId}">
        <span class="issue-order">${String(index + 1).padStart(2, '0')}</span>
        <span class="issue-title-wrap">
          <span class="issue-meta"><span>${escapeHtml(issue.timestamp)} · ${severityText}</span>${quality}</span>
          <strong>${escapeHtml(issue.title)}</strong>
        </span>
        ${icon('chevron', 18)}
      </button>
      <div class="issue-body" id="${bodyId}">
        <p class="positive-copy">${escapeHtml(issue.positive)}</p>
        <dl class="coach-details">
          <div><dt>你这一遍</dt><dd>${escapeHtml(issue.performance)}</dd></div>
          <div><dt>为什么会看起来不一样</dt><dd>${escapeHtml(issue.impact)}</dd></div>
          <div class="practice-detail"><dt>下一遍这样练</dt><dd>${escapeHtml(issue.practice)}</dd></div>
        </dl>
        <p class="encouragement">${escapeHtml(issue.encouragement)}</p>
        <details class="evidence-disclosure"><summary>查看判断依据</summary><p>${escapeHtml(issue.evidenceSummary)}</p></details>
      </div>
    </article>`
}

export {
  escapeHtml,
  icon,
  poseFigure,
  renderCandidateCard,
  renderIssueCard,
}
