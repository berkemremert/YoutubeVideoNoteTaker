/* ────────────────────────────────────────────────────────────
   NoteFlow — Main App Logic
   ──────────────────────────────────────────────────────────── */

// ── DOM refs ─────────────────────────────────────────────────
const urlInput       = document.getElementById('youtube-url');
const inputWrapper   = document.getElementById('input-wrapper');
const clearBtn       = document.getElementById('clear-btn');
const generateBtn    = document.getElementById('generate-btn');
const btnContent     = document.getElementById('btn-content');
const errorToast     = document.getElementById('error-toast');
const errorMessage   = document.getElementById('error-message');
const loadingCard    = document.getElementById('loading-card');
const loadingTitle   = document.getElementById('loading-title');
const resultsCard    = document.getElementById('results-card');
const resultsMeta    = document.getElementById('results-meta');
const notesContent   = document.getElementById('notes-content');
const copyBtn        = document.getElementById('copy-btn');
const newBtn         = document.getElementById('new-btn');
const videoPreview   = document.getElementById('video-preview');
const videoThumbnail = document.getElementById('video-thumbnail');
const videoLink      = document.getElementById('video-link');

// Tabs
const tabSingle  = document.getElementById('tab-single');
const tabBatch   = document.getElementById('tab-batch');
const panelSingle= document.getElementById('panel-single');
const panelBatch = document.getElementById('panel-batch');

// Batch
const dropZone         = document.getElementById('drop-zone');
const fileInput        = document.getElementById('file-input');
const batchPreview     = document.getElementById('batch-preview');
const batchPreviewList = document.getElementById('batch-preview-list');
const batchStyleGroup  = document.getElementById('batch-style-group');
const batchStartBtn    = document.getElementById('batch-start-btn');
const batchBtnContent  = document.getElementById('batch-btn-content');
const batchErrorToast  = document.getElementById('batch-error-toast');
const batchErrorMsg    = document.getElementById('batch-error-message');
const batchProgressCard= document.getElementById('batch-progress-card');
const batchProgressBar = document.getElementById('batch-progress-bar');
const batchCounter     = document.getElementById('batch-counter');
const batchStatusLabel = document.getElementById('batch-status-label');
const batchItemsList   = document.getElementById('batch-items-list');
const batchExportCard  = document.getElementById('batch-export-card');
const batchExportSub   = document.getElementById('batch-export-sub');

// Single download dropdown
const singleDownloadBtn = document.getElementById('single-download-btn');
const singleDropdown    = document.getElementById('single-dropdown');

// State
let currentNotes   = '';
let currentVideoId = '';
let batchItems     = [];   // [{name, url, index, status, notes, error}]
let batchResults   = [];   // completed notes accumulator
let batchRunning   = false;

/* ════════════════════════════════════════════════════════════
   TABS
═══════════════════════════════════════════════════════════════ */
function switchTab(tab) {
  if (tab === 'single') {
    tabSingle.classList.add('tab--active');
    tabBatch.classList.remove('tab--active');
    tabSingle.setAttribute('aria-selected', 'true');
    tabBatch.setAttribute('aria-selected', 'false');
    panelSingle.style.display = '';
    panelBatch.style.display = 'none';
  } else {
    tabBatch.classList.add('tab--active');
    tabSingle.classList.remove('tab--active');
    tabBatch.setAttribute('aria-selected', 'true');
    tabSingle.setAttribute('aria-selected', 'false');
    panelBatch.style.display = '';
    panelSingle.style.display = 'none';
  }
}
tabSingle.addEventListener('click', () => switchTab('single'));
tabBatch.addEventListener('click',  () => switchTab('batch'));

/* ════════════════════════════════════════════════════════════
   SINGLE VIDEO
═══════════════════════════════════════════════════════════════ */
urlInput.addEventListener('input', () => {
  clearBtn.style.display = urlInput.value.trim() ? 'flex' : 'none';
  hideError();
});
urlInput.addEventListener('focus', () => inputWrapper.classList.add('focused'));
urlInput.addEventListener('blur',  () => inputWrapper.classList.remove('focused'));
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleGenerate(); });
clearBtn.addEventListener('click', () => { urlInput.value = ''; clearBtn.style.display = 'none'; urlInput.focus(); hideError(); });

generateBtn.addEventListener('click', handleGenerate);

async function handleGenerate() {
  const url = urlInput.value.trim();
  if (!url) { showError('Please paste a YouTube URL first.'); urlInput.focus(); return; }
  const style = document.querySelector('input[name="style"]:checked')?.value || 'detailed';
  hideError();
  setLoading(true);
  resultsCard.style.display = 'none';
  try {
    animateLoadingSteps();
    const data = await callGenerateAPI(url, style);
    currentNotes   = data.notes;
    currentVideoId = data.videoId;
    showSingleResults(data);
  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
}

async function callGenerateAPI(url, style) {
  const res = await fetch('/api/generate-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, style }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Loading animation
let stepInterval = null;
function animateLoadingSteps() {
  const steps = [
    { id: 'step-1', title: 'Fetching transcript…' },
    { id: 'step-2', title: 'Analyzing content…' },
    { id: 'step-3', title: 'Generating your notes…' },
  ];
  let idx = 0;
  function advance() {
    steps.forEach((s, i) => {
      const el = document.getElementById(s.id);
      if (!el) return;
      el.removeAttribute('data-active'); el.removeAttribute('data-done');
      if (i < idx) el.setAttribute('data-done', 'true');
      if (i === idx) el.setAttribute('data-active', 'true');
    });
    if (idx < steps.length) loadingTitle.textContent = steps[idx].title;
  }
  advance();
  stepInterval = setInterval(() => { idx = (idx + 1) % steps.length; advance(); }, 2800);
}
function clearStepAnimation() {
  if (stepInterval) { clearInterval(stepInterval); stepInterval = null; }
  ['step-1','step-2','step-3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.removeAttribute('data-active'); el.setAttribute('data-done','true'); }
  });
}
function setLoading(on) {
  if (on) {
    loadingCard.style.display = 'block';
    generateBtn.disabled = true;
    btnContent.innerHTML = `<svg class="btn-icon spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>Generating…`;
  } else {
    loadingCard.style.display = 'none';
    generateBtn.disabled = false;
    btnContent.innerHTML = `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Generate Notes`;
    clearStepAnimation();
  }
}
function showError(msg) { errorMessage.textContent = msg; errorToast.style.display = 'flex'; }
function hideError() { errorToast.style.display = 'none'; }

function showSingleResults(data) {
  videoThumbnail.src = `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`;
  videoLink.href = data.videoUrl;
  videoPreview.style.display = 'block';
  resultsMeta.innerHTML = `<span class="meta-chip">📄 ${(data.wordCount||0).toLocaleString()} words</span><span class="meta-chip">✨ AI-generated</span>`;
  notesContent.innerHTML = marked.parse(data.notes || '');
  resultsCard.style.display = 'block';
  resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Copy
copyBtn.addEventListener('click', async () => {
  if (!currentNotes) return;
  try {
    await navigator.clipboard.writeText(currentNotes);
    copyBtn.classList.add('copied');
    const orig = copyBtn.innerHTML;
    copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polyline points="20 6 9 17 4 12"/></svg>Copied!`;
    setTimeout(() => { copyBtn.classList.remove('copied'); copyBtn.innerHTML = orig; }, 2000);
  } catch { showError('Could not copy to clipboard.'); }
});

// New
newBtn.addEventListener('click', () => {
  resultsCard.style.display = 'none'; hideError();
  urlInput.value = ''; clearBtn.style.display = 'none';
  currentNotes = ''; currentVideoId = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => urlInput.focus(), 400);
});

// Single download dropdown
singleDownloadBtn.addEventListener('click', e => {
  e.stopPropagation();
  singleDropdown.classList.toggle('open');
  const chevron = singleDownloadBtn.querySelector('.chevron');
  if (chevron) chevron.style.transform = singleDropdown.classList.contains('open') ? 'rotate(180deg)' : '';
});

document.getElementById('dl-single-md').addEventListener('click', e => {
  e.stopPropagation();
  if (!currentNotes) return;
  downloadFile(currentNotes, `notes-${currentVideoId||'video'}.md`, 'text/markdown');
  singleDropdown.classList.remove('open');
});
document.getElementById('dl-single-txt').addEventListener('click', e => {
  e.stopPropagation();
  if (!currentNotes) return;
  downloadFile(markdownToText(currentNotes), `notes-${currentVideoId||'video'}.txt`, 'text/plain');
  singleDropdown.classList.remove('open');
});
document.getElementById('dl-single-pdf').addEventListener('click', e => {
  e.stopPropagation();
  if (!currentNotes) return;
  exportPDF([{ name: currentVideoId || 'Notes', notes: currentNotes }]);
  singleDropdown.classList.remove('open');
});

/* ════════════════════════════════════════════════════════════
   BATCH MODE — FILE PARSING
═══════════════════════════════════════════════════════════════ */
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.txt')) loadFile(file);
  else showBatchError('Please drop a .txt file.');
});

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    batchItems = parseTxtFile(text);
    if (batchItems.length === 0) { showBatchError('No valid YouTube URLs found in the file.'); return; }
    hideBatchError();
    renderBatchPreview();
    // Update drop zone UI
    dropZone.classList.add('has-file');
    dropZone.querySelector('.drop-main').textContent = '✅ File loaded';
    dropZone.querySelector('.drop-sub').innerHTML = `<span class="drop-filename">${file.name}</span>`;
    dropZone.querySelector('.drop-zone-hint').textContent = `${batchItems.length} videos across ${countGroups(batchItems)} topic(s)`;
  };
  reader.readAsText(file);
}

function isUrl(str) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(str.trim());
}

function parseTxtFile(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const items = [];
  let currentTitle = 'untitled';
  const groupCount = {};

  for (const line of lines) {
    if (isUrl(line)) {
      const count = (groupCount[currentTitle] || 0) + 1;
      groupCount[currentTitle] = count;
      items.push({
        name: `${currentTitle}_${count}`,
        url: line,
        status: 'pending',
        notes: null,
        error: null,
      });
    } else {
      // It's a title line — sanitize it
      currentTitle = line.replace(/\s+/g, '_').toLowerCase();
    }
  }
  return items;
}

function countGroups(items) {
  const seen = new Set();
  items.forEach(i => { const group = i.name.replace(/_\d+$/, ''); seen.add(group); });
  return seen.size;
}

function renderBatchPreview() {
  // Group by prefix
  const groups = {};
  batchItems.forEach(item => {
    const group = item.name.replace(/_\d+$/, '');
    groups[group] = (groups[group] || 0) + 1;
  });
  batchPreviewList.innerHTML = Object.entries(groups).map(([name, count]) => `
    <div class="preview-group">
      <span class="preview-group-name">${name}</span>
      <span class="preview-group-count">${count} video${count > 1 ? 's' : ''}</span>
    </div>
  `).join('');
  batchPreview.style.display = 'block';
  batchStyleGroup.style.display = 'block';
  batchStartBtn.style.display = 'block';
}

/* ════════════════════════════════════════════════════════════
   BATCH MODE — PROCESSING
═══════════════════════════════════════════════════════════════ */
batchStartBtn.addEventListener('click', startBatch);

async function startBatch() {
  if (batchItems.length === 0 || batchRunning) return;
  const style = document.querySelector('input[name="batch-style"]:checked')?.value || 'detailed';
  batchRunning = true;
  batchResults = [];
  hideBatchError();
  batchExportCard.style.display = 'none';

  // Reset statuses
  batchItems.forEach(i => { i.status = 'pending'; i.notes = null; i.error = null; });

  // Show progress
  batchProgressCard.style.display = 'block';
  batchProgressCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderBatchItems();
  setBatchBtn(true);

  let done = 0;
  const total = batchItems.length;

  for (let i = 0; i < batchItems.length; i++) {
    const item = batchItems[i];
    item.status = 'processing';
    updateBatchItem(i);
    batchStatusLabel.textContent = `Processing ${item.name}…`;
    batchCounter.textContent = `${done} / ${total}`;

    try {
      const data = await callGenerateAPI(item.url, style);
      item.notes = data.notes;
      item.status = 'done';
      batchResults.push({ name: item.name, notes: data.notes, videoId: data.videoId });
    } catch (err) {
      item.error = err.message || 'Failed';
      item.status = 'error';
    }
    done++;
    updateBatchItem(i);
    batchProgressBar.style.width = `${Math.round((done / total) * 100)}%`;
    batchCounter.textContent = `${done} / ${total}`;
  }

  // Done
  batchStatusLabel.textContent = '✅ Processing complete';
  setBatchBtn(false);
  batchRunning = false;
  const successCount = batchItems.filter(i => i.status === 'done').length;
  batchExportSub.textContent = `${successCount} of ${total} notes generated successfully`;
  batchExportCard.style.display = 'block';
  batchExportCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderBatchItems() {
  batchItemsList.innerHTML = batchItems.map((item, i) => buildBatchItemHTML(item, i)).join('');
}

function updateBatchItem(idx) {
  const existing = document.getElementById(`batch-item-${idx}`);
  if (existing) {
    existing.outerHTML = buildBatchItemHTML(batchItems[idx], idx);
  }
}

function buildBatchItemHTML(item, idx) {
  const statusClass = `status-${item.status}`;
  const statusIcon = {
    pending:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>`,
    processing: ``,
    done:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  }[item.status] || '';

  const subText = item.status === 'error'
    ? `<span style="color:var(--rose);font-size:12px;">${item.error}</span>`
    : `<span class="batch-item-url">${item.url}</span>`;

  const actions = item.status === 'done' ? `
    <div class="batch-item-actions">
      <button class="mini-btn mini-md" data-idx="${idx}" data-fmt="md">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        .md
      </button>
      <button class="mini-btn mini-txt" data-idx="${idx}" data-fmt="txt">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        .txt
      </button>
      <button class="mini-btn mini-pdf" data-idx="${idx}" data-fmt="pdf">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        PDF
      </button>
    </div>
  ` : '';

  return `
    <div class="batch-item ${statusClass}" id="batch-item-${idx}">
      <div class="batch-item-status">${statusIcon}</div>
      <div class="batch-item-info">
        <div class="batch-item-name">${item.name}</div>
        ${subText}
      </div>
      ${actions}
    </div>
  `;
}

// Single delegated listener for all batch item buttons — set up once, never duplicated
batchItemsList.addEventListener('click', e => {
  const btn = e.target.closest('.mini-btn[data-idx]');
  if (!btn) return;
  const idx = parseInt(btn.dataset.idx);
  const fmt = btn.dataset.fmt;
  const item = batchItems[idx];
  if (!item?.notes) return;
  if (fmt === 'md')  downloadFile(item.notes, `${item.name}.md`, 'text/markdown');
  if (fmt === 'txt') downloadFile(markdownToText(item.notes), `${item.name}.txt`, 'text/plain');
  if (fmt === 'pdf') exportPDF([{ name: item.name, notes: item.notes }]);
});

function setBatchBtn(running) {
  batchStartBtn.disabled = running;
  batchBtnContent.innerHTML = running
    ? `<svg class="btn-icon spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>Processing…`
    : `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Start Batch Processing`;
}

// Batch errors
function showBatchError(msg) { batchErrorMsg.textContent = msg; batchErrorToast.style.display = 'flex'; }
function hideBatchError() { batchErrorToast.style.display = 'none'; }

/* ════════════════════════════════════════════════════════════
   BATCH EXPORT — ALL NOTES
═══════════════════════════════════════════════════════════════ */
document.getElementById('batch-dl-md').addEventListener('click', () => {
  if (!batchResults.length) return;
  const combined = buildCombinedMD(batchResults);
  downloadFile(combined, 'notes-combined.md', 'text/markdown');
});

document.getElementById('batch-dl-txt').addEventListener('click', () => {
  if (!batchResults.length) return;
  const combined = buildCombinedMD(batchResults);
  downloadFile(markdownToText(combined), 'notes-combined.txt', 'text/plain');
});

document.getElementById('batch-dl-pdf').addEventListener('click', () => {
  if (!batchResults.length) return;
  exportPDF(batchResults);
});

function buildCombinedMD(results) {
  return results.map(r => `# ${r.name}\n\n${r.notes}`).join('\n\n---\n\n');
}

/* ════════════════════════════════════════════════════════════
   EXPORT UTILITIES
═══════════════════════════════════════════════════════════════ */

/** Download any text content as a file */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/** Convert Markdown to plain text (strip syntax) */
function markdownToText(md) {
  return md
    .replace(/^#{1,6}\s+/gm, '')           // headers
    .replace(/\*\*(.*?)\*\*/g, '$1')        // bold
    .replace(/\*(.*?)\*/g, '$1')            // italic
    .replace(/`{1,3}([\s\S]*?)`{1,3}/g, '$1') // code
    .replace(/^[-*+]\s+/gm, '• ')          // bullets
    .replace(/^\d+\.\s+/gm, '')            // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^>{1,}\s?/gm, '')            // blockquotes
    .replace(/^---+$/gm, '─'.repeat(40))   // hr
    .replace(/\n{3,}/g, '\n\n')            // excess newlines
    .trim();
}

/** Export as PDF using a print-friendly popup window */
function exportPDF(results) {
  const htmlContent = results.map(r => `
    <section class="note-section">
      <h1>${escapeHtml(r.name)}</h1>
      <div class="note-body">${marked.parse(r.notes || '')}</div>
    </section>
  `).join('<div class="page-break"></div>');

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Please allow popups to export PDF.'); return; }

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>NoteFlow Export</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 13px; line-height: 1.7; color: #1a1a2e; background: #fff; padding: 0; }
    .note-section { padding: 40px 50px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 22px; font-weight: 700; color: #2d2d5e; border-bottom: 2px solid #6c63ff; padding-bottom: 8px; margin-bottom: 20px; font-family: 'Arial', sans-serif; letter-spacing: -0.3px; }
    h2 { font-size: 16px; font-weight: 700; color: #3d3d7a; margin: 20px 0 8px; font-family: 'Arial', sans-serif; }
    h3 { font-size: 14px; font-weight: 600; color: #6c63ff; margin: 14px 0 6px; font-family: 'Arial', sans-serif; }
    p { margin-bottom: 10px; }
    ul, ol { padding-left: 22px; margin-bottom: 12px; }
    li { margin-bottom: 5px; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    code { font-family: 'Courier New', monospace; font-size: 12px; background: #f4f3ff; padding: 1px 5px; border-radius: 3px; }
    pre { background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 4px; padding: 14px; overflow-x: auto; margin: 12px 0; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #6c63ff; padding: 6px 14px; margin: 12px 0; color: #555; background: #fafafa; }
    hr { border: none; border-top: 1px solid #e0e0e0; margin: 18px 0; }
    .page-break { page-break-after: always; border-top: 2px dashed #e0e0e0; margin: 30px 50px; }
    .note-body { margin-top: 8px; }
    @media print {
      .page-break { page-break-after: always; border: none; }
      body { font-size: 12px; }
    }
  </style>
</head>
<body>
  ${htmlContent}
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  <\/script>
</body>
</html>`);
  win.document.close();
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ════════════════════════════════════════════════════════════
   CLOSE DROPDOWN ON OUTSIDE CLICK
═══════════════════════════════════════════════════════════════ */
document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown-wrap')) {
    singleDropdown.classList.remove('open');
  }
});
