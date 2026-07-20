/* ════════════════════════════════════════════════════════
   YouNote — Application Logic
════════════════════════════════════════════════════════ */

// ── DOM refs ──────────────────────────────────────────────
const modelSelect   = document.getElementById('model-select');
const effortSelect  = document.getElementById('effort-select');

// Tabs
const tabSingle    = document.getElementById('tab-single');
const tabBatch     = document.getElementById('tab-batch');
const panelSingle  = document.getElementById('panel-single');
const panelBatch   = document.getElementById('panel-batch');

// Single
const urlInput     = document.getElementById('youtube-url');
const inputGroup   = document.getElementById('input-group');
const clearBtn     = document.getElementById('clear-btn');
const generateBtn  = document.getElementById('generate-btn');
const generateIcon = document.getElementById('generate-icon');
const btnLabel     = document.getElementById('btn-label');
const errorToast   = document.getElementById('error-toast');
const errorMsg     = document.getElementById('error-message');
const loadingCard  = document.getElementById('loading-card');
const loadingTitle = document.getElementById('loading-title');
const resultsCard  = document.getElementById('results-card');
const resultsMeta  = document.getElementById('results-meta');
const notesContent = document.getElementById('notes-content');
const copyBtn      = document.getElementById('copy-btn');
const copyLabel    = document.getElementById('copy-label');
const newBtn       = document.getElementById('new-btn');
const videoPreview = document.getElementById('video-preview');
const videoThumb   = document.getElementById('video-thumbnail');
const videoLink    = document.getElementById('video-link');

// Single download
const singleDlBtn  = document.getElementById('single-download-btn');
const singleDrop   = document.getElementById('single-dropdown');
const chevron      = singleDlBtn.querySelector('.chevron');

// Batch
const dropZone         = document.getElementById('drop-zone');
const fileInput        = document.getElementById('file-input');
const dropMain         = document.getElementById('drop-main');
const dropHint         = document.getElementById('drop-hint');
const batchPreview     = document.getElementById('batch-preview');
const batchPreviewList = document.getElementById('batch-preview-list');
const batchStyleGroup  = document.getElementById('batch-style-group');
const batchStartBtn    = document.getElementById('batch-start-btn');
const batchBtnLabel    = document.getElementById('batch-btn-label');
const batchErrorToast  = document.getElementById('batch-error-toast');
const batchErrorMsg    = document.getElementById('batch-error-message');
const batchProgressCard= document.getElementById('batch-progress-card');
const batchProgressBar = document.getElementById('batch-progress-bar');
const batchCounter     = document.getElementById('batch-counter');
const batchStatusLabel = document.getElementById('batch-status-label');
const batchItemsList   = document.getElementById('batch-items-list');
const batchExportCard  = document.getElementById('batch-export-card');
const batchExportSub   = document.getElementById('batch-export-sub');

// ── State ─────────────────────────────────────────────────
let currentNotes   = '';
let currentVideoId = '';
let batchItems     = [];
let batchResults   = [];
let batchRunning   = false;

// Inline SVGs for dynamic batch status indicators
const STATUS_ICON = {
  done:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

/* ════════════════════════════════════════════════════════
   MODEL LOADING
════════════════════════════════════════════════════════ */
async function loadModels() {
  try {
    const res  = await fetch('/api/models');
    const data = await res.json();
    if (data.models?.length) {
      modelSelect.innerHTML = data.models.map(m =>
        `<option value="${escHtml(m.id)}">${escHtml(m.name)}</option>`
      ).join('');
      // Default to deepseek if available
      const pref = [...modelSelect.options].find(o => o.value.includes('deepseek'));
      if (pref) pref.selected = true;
    } else {
      modelSelect.innerHTML = '<option value="accounts/fireworks/models/deepseek-v4-pro">DeepSeek V4 Pro</option>';
    }
  } catch {
    modelSelect.innerHTML = '<option value="accounts/fireworks/models/deepseek-v4-pro">DeepSeek V4 Pro</option>';
  }
  modelSelect.disabled = false;
}
loadModels();

/* ════════════════════════════════════════════════════════
   TABS
════════════════════════════════════════════════════════ */
tabSingle.addEventListener('click', () => switchTab('single'));
tabBatch.addEventListener('click',  () => switchTab('batch'));

function switchTab(tab) {
  const isSingle = tab === 'single';
  tabSingle.classList.toggle('active', isSingle);
  tabBatch.classList.toggle('active', !isSingle);
  tabSingle.setAttribute('aria-selected', String(isSingle));
  tabBatch.setAttribute('aria-selected',  String(!isSingle));
  panelSingle.style.display = isSingle ? '' : 'none';
  panelBatch.style.display  = isSingle ? 'none' : '';
}

/* ════════════════════════════════════════════════════════
   SINGLE VIDEO
════════════════════════════════════════════════════════ */
urlInput.addEventListener('input', () => {
  clearBtn.style.display = urlInput.value.trim() ? 'flex' : 'none';
  hideError();
});
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleGenerate(); });
clearBtn.addEventListener('click',   () => { urlInput.value = ''; clearBtn.style.display = 'none'; urlInput.focus(); hideError(); });

generateBtn.addEventListener('click', handleGenerate);

async function handleGenerate() {
  const url = urlInput.value.trim();
  if (!url) { showError('Please paste a YouTube URL.'); urlInput.focus(); return; }
  const style = document.querySelector('input[name="style"]:checked')?.value || 'detailed';

  hideError();
  setGenerateLoading(true);
  resultsCard.style.display = 'none';

  try {
    animateSteps();
    const data = await callAPI(url, style);
    currentNotes   = data.notes;
    currentVideoId = data.videoId;
    showResults(data);
  } catch (err) {
    showError(err.message || 'Something went wrong.');
  } finally {
    setGenerateLoading(false);
  }
}

async function callAPI(url, style) {
  const res = await fetch('/api/generate-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      style,
      model:  modelSelect.value,
      effort: effortSelect.value,
    }),
  });

  const text = await res.text();
  if (!text) {
    throw new Error('Server returned an empty response. The request may have timed out — please try again.');
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Server returned an invalid response. Please try again.');
  }

  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// Step animation
let stepTimer = null;
function animateSteps() {
  const steps = [
    { id: 'step-1', title: 'Fetching transcript…'  },
    { id: 'step-2', title: 'Analyzing content…'    },
    { id: 'step-3', title: 'Generating notes…'     },
  ];
  let i = 0;
  function tick() {
    steps.forEach((s, si) => {
      const el = document.getElementById(s.id);
      if (!el) return;
      el.removeAttribute('data-active');
      el.removeAttribute('data-done');
      if (si < i)  el.setAttribute('data-done',   'true');
      if (si === i) el.setAttribute('data-active', 'true');
    });
    if (i < steps.length) loadingTitle.textContent = steps[i].title;
  }
  tick();
  stepTimer = setInterval(() => {
    if (i < steps.length - 1) { i++; tick(); }
  }, 2800);
}
function clearSteps() {
  if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
  ['step-1','step-2','step-3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.removeAttribute('data-active'); el.setAttribute('data-done','true'); }
  });
}

function setGenerateLoading(on) {
  generateBtn.disabled = on;
  if (on) {
    loadingCard.style.display = 'block';
    generateIcon.outerHTML = `<div class="btn-spinner" id="generate-icon"></div>`;
    btnLabel.textContent = 'Generating…';
  } else {
    loadingCard.style.display = 'none';
    // restore icon
    const placeholder = document.getElementById('generate-icon');
    if (placeholder) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('id', 'generate-icon');
      svg.setAttribute('class', 'icon-sm');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.innerHTML = '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>';
      placeholder.replaceWith(svg);
    }
    btnLabel.textContent = 'Generate Notes';
    clearSteps();
  }
}

function showError(msg)  { errorMsg.textContent = msg; errorToast.style.display = 'flex'; }
function hideError()     { errorToast.style.display = 'none'; }

function showResults(data) {
  videoThumb.src = `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`;
  videoLink.href = data.videoUrl;
  videoPreview.style.display = 'block';
  resultsMeta.innerHTML = `
    <span class="stat-chip">${(data.wordCount || 0).toLocaleString()} words</span>
    <span class="stat-chip">AI notes</span>
  `;
  notesContent.innerHTML = marked.parse(data.notes || '');
  resultsCard.style.display = 'block';
  resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Copy
copyBtn.addEventListener('click', async () => {
  if (!currentNotes) return;
  try {
    await navigator.clipboard.writeText(currentNotes);
    copyLabel.textContent = 'Copied!';
    setTimeout(() => { copyLabel.textContent = 'Copy'; }, 2000);
  } catch { showError('Could not copy to clipboard.'); }
});

// Reset
newBtn.addEventListener('click', () => {
  resultsCard.style.display = 'none';
  hideError();
  urlInput.value = '';
  clearBtn.style.display = 'none';
  currentNotes = ''; currentVideoId = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => urlInput.focus(), 350);
});

/* ── Single download dropdown ─────────────────────────── */
singleDlBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = singleDrop.classList.toggle('open');
  chevron.classList.toggle('open', open);
});

document.getElementById('dl-single-md').addEventListener('click', e => {
  e.stopPropagation();
  if (!currentNotes) return;
  downloadFile(currentNotes, `notes-${currentVideoId||'video'}.md`, 'text/markdown');
  closeDropdown();
});
document.getElementById('dl-single-txt').addEventListener('click', e => {
  e.stopPropagation();
  if (!currentNotes) return;
  downloadFile(markdownToText(currentNotes), `notes-${currentVideoId||'video'}.txt`, 'text/plain');
  closeDropdown();
});
document.getElementById('dl-single-pdf').addEventListener('click', e => {
  e.stopPropagation();
  if (!currentNotes) return;
  exportPDF([{ name: currentVideoId || 'Notes', notes: currentNotes }]);
  closeDropdown();
});
function closeDropdown() {
  singleDrop.classList.remove('open');
  chevron.classList.remove('open');
}
document.addEventListener('click', closeDropdown);

/* ════════════════════════════════════════════════════════
   BATCH — FILE PARSING
════════════════════════════════════════════════════════ */
dropZone.addEventListener('click',   () => fileInput.click());
dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file?.name.endsWith('.txt')) loadFile(file);
  else showBatchError('Please drop a .txt file.');
});

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    batchItems = parseTxt(text);
    if (!batchItems.length) { showBatchError('No valid YouTube URLs found in the file.'); return; }
    hideBatchError();
    renderPreview();
    dropZone.classList.add('loaded');
    dropMain.innerHTML = `<strong>${file.name}</strong> loaded`;
    dropHint.textContent = `${batchItems.length} videos · ${countGroups()} topic(s)`;
    batchStyleGroup.style.display = 'block';
    batchStartBtn.style.display   = 'flex';
  };
  reader.readAsText(file);
}

function isYTUrl(s) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(s.trim());
}

function parseTxt(text) {
  const items = [];
  let title = 'untitled';
  const counts = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (isYTUrl(line)) {
      const n = (counts[title] = (counts[title] || 0) + 1);
      items.push({ name: `${title}_${n}`, url: line, status: 'pending', notes: null, error: null });
    } else {
      title = line.replace(/\s+/g, '_').toLowerCase();
    }
  }
  return items;
}

function countGroups() {
  return new Set(batchItems.map(i => i.name.replace(/_\d+$/, ''))).size;
}

function renderPreview() {
  const groups = {};
  batchItems.forEach(i => {
    const g = i.name.replace(/_\d+$/, '');
    groups[g] = (groups[g] || 0) + 1;
  });
  batchPreviewList.innerHTML = Object.entries(groups).map(([name, count]) => `
    <div class="preview-item">
      <span class="preview-item-name">${escHtml(name)}</span>
      <span class="preview-item-count">${count} video${count > 1 ? 's' : ''}</span>
    </div>
  `).join('');
  batchPreview.style.display = 'block';
}

/* ════════════════════════════════════════════════════════
   BATCH — PROCESSING
════════════════════════════════════════════════════════ */
batchStartBtn.addEventListener('click', startBatch);

async function startBatch() {
  if (!batchItems.length || batchRunning) return;
  const style = document.querySelector('input[name="batch-style"]:checked')?.value || 'detailed';
  batchRunning = true;
  batchResults = [];
  hideBatchError();
  batchExportCard.style.display = 'none';
  batchItems.forEach(i => { i.status = 'pending'; i.notes = null; i.error = null; });

  batchProgressCard.style.display = 'block';
  batchProgressCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderBatchList();
  setBatchLoading(true);

  const total = batchItems.length;
  let done = 0;

  for (let i = 0; i < batchItems.length; i++) {
    const item = batchItems[i];
    item.status = 'processing';
    batchStatusLabel.textContent = `Processing ${item.name}…`;
    batchCounter.textContent = `${done} / ${total}`;
    updateBatchRow(i);

    try {
      const data = await callAPI(item.url, style);
      item.notes  = data.notes;
      item.status = 'done';
      batchResults.push({ name: item.name, notes: data.notes });
    } catch (err) {
      item.error  = err.message || 'Failed';
      item.status = 'error';
    }
    done++;
    updateBatchRow(i);
    batchProgressBar.style.width = `${Math.round((done / total) * 100)}%`;
    batchCounter.textContent = `${done} / ${total}`;
  }

  batchStatusLabel.textContent = 'Complete';
  setBatchLoading(false);
  batchRunning = false;

  const ok = batchItems.filter(i => i.status === 'done').length;
  batchExportSub.textContent = `${ok} of ${total} notes generated`;
  batchExportCard.style.display = 'block';
  batchExportCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderBatchList() {
  batchItemsList.innerHTML = batchItems.map((item, i) => buildRow(item, i)).join('');
}

function updateBatchRow(idx) {
  const el = document.getElementById(`bi-${idx}`);
  if (el) el.outerHTML = buildRow(batchItems[idx], idx);
}

function buildRow(item, idx) {
  const cls = `s-${item.status}`;
  const indicator = {
    pending:    '',
    processing: '',
    done:       STATUS_ICON.done,
    error:      STATUS_ICON.error,
  }[item.status] || '';

  const sub = item.status === 'error'
    ? `<div class="batch-url" style="color:#fca5a5">${escHtml(item.error)}</div>`
    : `<div class="batch-url">${escHtml(item.url)}</div>`;

  const btns = item.status === 'done' ? `
    <div class="batch-item-btns">
      <button class="mini-dl" data-idx="${idx}" data-fmt="md">MD</button>
      <button class="mini-dl" data-idx="${idx}" data-fmt="txt">TXT</button>
      <button class="mini-dl" data-idx="${idx}" data-fmt="pdf">PDF</button>
    </div>
  ` : '';

  return `
    <div class="batch-item ${cls}" id="bi-${idx}">
      <div class="batch-indicator">${indicator}</div>
      <div class="batch-info">
        <div class="batch-name">${escHtml(item.name)}</div>
        ${sub}
      </div>
      ${btns}
    </div>
  `;
}

// Delegated listener — set up once
batchItemsList.addEventListener('click', e => {
  const btn = e.target.closest('.mini-dl[data-idx]');
  if (!btn) return;
  const idx  = parseInt(btn.dataset.idx);
  const fmt  = btn.dataset.fmt;
  const item = batchItems[idx];
  if (!item?.notes) return;
  if (fmt === 'md')  downloadFile(item.notes, `${item.name}.md`, 'text/markdown');
  if (fmt === 'txt') downloadFile(markdownToText(item.notes), `${item.name}.txt`, 'text/plain');
  if (fmt === 'pdf') exportPDF([{ name: item.name, notes: item.notes }]);
});

function setBatchLoading(on) {
  batchStartBtn.disabled = on;
  batchBtnLabel.textContent = on ? 'Processing…' : 'Start Processing';
}

function showBatchError(msg) { batchErrorMsg.textContent = msg; batchErrorToast.style.display = 'flex'; }
function hideBatchError()    { batchErrorToast.style.display = 'none'; }

/* ── Batch export ─────────────────────────────────────── */
document.getElementById('batch-dl-md').addEventListener('click', () => {
  if (!batchResults.length) return;
  downloadFile(combinedMD(batchResults), 'younote-batch.md', 'text/markdown');
});
document.getElementById('batch-dl-txt').addEventListener('click', () => {
  if (!batchResults.length) return;
  downloadFile(markdownToText(combinedMD(batchResults)), 'younote-batch.txt', 'text/plain');
});
document.getElementById('batch-dl-pdf').addEventListener('click', () => {
  if (!batchResults.length) return;
  exportPDF(batchResults);
});

function combinedMD(results) {
  return results.map(r => `# ${r.name}\n\n${r.notes}`).join('\n\n---\n\n');
}

/* ════════════════════════════════════════════════════════
   EXPORT UTILITIES
════════════════════════════════════════════════════════ */
function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function markdownToText(md) {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}([\s\S]*?)`{1,3}/g, '$1')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>{1,}\s?/gm, '')
    .replace(/^---+$/gm, '─'.repeat(40))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function exportPDF(results) {
  const body = results.map(r => `
    <section class="section">
      <h1>${escHtml(r.name)}</h1>
      <div class="body">${marked.parse(r.notes || '')}</div>
    </section>
  `).join('<div class="break"></div>');

  const win = window.open('', '_blank', 'width=860,height=700');
  if (!win) { alert('Allow popups to export PDF.'); return; }
  win.document.write(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<title>YouNote Export</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1.75;color:#111;background:#fff}
  .section{max-width:720px;margin:0 auto;padding:48px 52px}
  h1{font-size:20px;font-weight:700;color:#111;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:20px;font-family:Arial,sans-serif;letter-spacing:-0.3px}
  h2{font-size:15px;font-weight:700;color:#222;margin:20px 0 8px;font-family:Arial,sans-serif}
  h3{font-size:13px;font-weight:600;color:#333;margin:14px 0 5px;font-family:Arial,sans-serif}
  p{margin-bottom:9px}
  ul,ol{padding-left:20px;margin-bottom:11px}
  li{margin-bottom:4px}
  strong{font-weight:700}
  code{font-family:'Courier New',monospace;font-size:11.5px;background:#f4f4f5;padding:1px 5px;border-radius:3px}
  pre{background:#f8f8f8;border:1px solid #e4e4e7;border-radius:4px;padding:14px;overflow-x:auto;margin:12px 0}
  pre code{background:none;padding:0}
  blockquote{border-left:2px solid #a1a1aa;padding:6px 12px;margin:12px 0;color:#52525b}
  hr{border:none;border-top:1px solid #e4e4e7;margin:18px 0}
  .break{page-break-after:always;border-top:1px dashed #d4d4d8;margin:0 52px}
  @media print{.break{border:none}}
</style>
</head><body>${body}
<script>window.onload=()=>setTimeout(()=>window.print(),350);<\/script>
</body></html>`);
  win.document.close();
}

/* ════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════ */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
