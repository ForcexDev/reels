/**
 * FAKEBOOK — script.js
 * Vanilla JS · IntersectionObserver · Infinite Loop · Error Handling
 * ─────────────────────────────────────────────────────────────────────
 */

'use strict';

/* ─── State ─── */
const state = {
  videos: [],        // Array<{ url, name, duration }>
  currentIndex: 0,
  globalMuted: true,
  observer: null,
  progressTimers: new Map(),
};

/* ─── DOM refs ─── */
const feed       = document.getElementById('feed');
const emptyState = document.getElementById('emptyState');
const sideNav    = document.getElementById('sideNav');
const btnUp      = document.getElementById('btnUp');
const btnDown    = document.getElementById('btnDown');
const currentIdxEl = document.getElementById('currentIdx');
const totalCountEl = document.getElementById('totalCount');
const uploadFab  = document.getElementById('uploadFab');
const fileInput  = document.getElementById('fileInput');
const emptyCta   = document.getElementById('emptyCta');
const muteAllBtn = document.getElementById('muteAllBtn');
const muteIcon   = document.getElementById('muteIcon');
const toastEl    = document.getElementById('toast');

/* ─── SVG helpers ─── */
const SVG = {
  muted: `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`,
  sound: `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`,
  play: `<polygon points="5 3 19 12 5 21 5 3"/>`,
  pause: `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`,
};

/* ════════════════════════════════════════════════
   TOAST
════════════════════════════════════════════════ */
let _toastTimer = null;
function showToast(msg, type = '', duration = 2800) {
  toastEl.textContent = msg;
  toastEl.className = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toastEl.className = 'toast';
  }, duration);
}

/* ════════════════════════════════════════════════
   FORMAT TIME  (seconds → m:ss)
════════════════════════════════════════════════ */
function fmtTime(secs) {
  if (!isFinite(secs)) return '--:--';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ════════════════════════════════════════════════
   MUTE STATE MANAGEMENT
════════════════════════════════════════════════ */
function setGlobalMute(muted) {
  state.globalMuted = muted;

  // Sync all videos
  document.querySelectorAll('.video-slide video').forEach(v => {
    v.muted = muted;
  });

  // Update header icon
  muteIcon.innerHTML = muted ? SVG.muted : SVG.sound;

  // Update all mute badges
  document.querySelectorAll('.mute-badge svg').forEach(svg => {
    svg.innerHTML = muted ? SVG.muted : SVG.sound;
  });
}

muteAllBtn.addEventListener('click', () => {
  setGlobalMute(!state.globalMuted);
  showToast(state.globalMuted ? 'Silenciado' : 'Audio activado', 'success');
});

/* ════════════════════════════════════════════════
   CREATE VIDEO SLIDE
════════════════════════════════════════════════ */
function createSlide(entry, index) {
  const slide = document.createElement('div');
  slide.className = 'video-slide';
  slide.dataset.index = index;

  // Video element
  const video = document.createElement('video');
  video.src = entry.url;
  video.muted = state.globalMuted;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('aria-label', `Video: ${entry.name}`);

  // Detect portrait after metadata
  video.addEventListener('loadedmetadata', () => {
    const isPortrait = video.videoHeight > video.videoWidth;
    if (isPortrait) slide.classList.add('is-portrait');
    entry.duration = video.duration;
    slide.querySelector('.video-duration').textContent = fmtTime(video.duration);
  }, { once: true });

  // Progress bar
  const progress = document.createElement('div');
  progress.className = 'video-progress';

  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    progress.style.width = `${(video.currentTime / video.duration) * 100}%`;
  });

  // Info overlay
  const info = document.createElement('div');
  info.className = 'video-info';
  const fname = document.createElement('div');
  fname.className = 'video-filename';
  fname.textContent = entry.name;
  const fdur = document.createElement('div');
  fdur.className = 'video-duration';
  fdur.textContent = '--:--';
  info.append(fname, fdur);

  // Mute badge
  const muteBadge = document.createElement('div');
  muteBadge.className = 'mute-badge';
  muteBadge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${state.globalMuted ? SVG.muted : SVG.sound}</svg>`;

  // Play/pause flash
  const flash = document.createElement('div');
  flash.className = 'play-flash';
  flash.innerHTML = `<svg viewBox="0 0 24 24" fill="white" stroke="none">${SVG.pause}</svg>`;

  // Click: toggle mute (primary UX), show flash icon
  let tapTimer = null;
  slide.addEventListener('click', () => {
    // Toggle mute on tap
    setGlobalMute(!state.globalMuted);

    // Flash icon
    flash.innerHTML = `<svg viewBox="0 0 24 24" fill="white" stroke="none">${state.globalMuted ? SVG.muted : SVG.sound}</svg>`;
    flash.classList.add('show');
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => flash.classList.remove('show'), 700);
  });

  slide.append(video, progress, info, muteBadge, flash);
  return slide;
}

/* ════════════════════════════════════════════════
   INTERSECTION OBSERVER
   Autoplay video that is ≥50% visible
════════════════════════════════════════════════ */
function initObserver() {
  if (state.observer) state.observer.disconnect();

  state.observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const slide = entry.target;
      const video = slide.querySelector('video');
      const idx   = parseInt(slide.dataset.index, 10);

      if (entry.intersectionRatio >= 0.5) {
        // This slide is dominant — play it
        state.currentIndex = idx;
        updateCounter();

        video.play().catch(() => {
          // Autoplay blocked; silently ignore
        });
      } else {
        // Pause and reset if not visible
        video.pause();
      }
    });
  }, {
    root: feed,
    threshold: [0.5],
  });

  // Observe all slides
  document.querySelectorAll('.video-slide').forEach(slide => {
    state.observer.observe(slide);
  });
}

/* ════════════════════════════════════════════════
   COUNTER UPDATE
════════════════════════════════════════════════ */
function updateCounter() {
  currentIdxEl.textContent = state.currentIndex + 1;
  totalCountEl.textContent = state.videos.length;
}

/* ════════════════════════════════════════════════
   NAVIGATE TO INDEX — with infinite loop
════════════════════════════════════════════════ */
function navigateTo(rawIndex) {
  const total = state.videos.length;
  if (total === 0) return;

  // Wrap-around logic (infinite loop)
  const index = ((rawIndex % total) + total) % total;

  const slide = feed.querySelector(`.video-slide[data-index="${index}"]`);
  if (!slide) return;

  slide.scrollIntoView({ behavior: 'smooth', block: 'start' });
  state.currentIndex = index;
  updateCounter();
}

/* ─── Nav buttons ─── */
btnDown.addEventListener('click', () => navigateTo(state.currentIndex + 1));
btnUp.addEventListener('click',   () => navigateTo(state.currentIndex - 1));

/* ─── Keyboard arrows ─── */
document.addEventListener('keydown', (e) => {
  if (state.videos.length === 0) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    e.preventDefault();
    navigateTo(state.currentIndex + 1);
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    e.preventDefault();
    navigateTo(state.currentIndex - 1);
  }
});

/* ════════════════════════════════════════════════
   FILE UPLOAD & VALIDATION
════════════════════════════════════════════════ */
const ACCEPTED_TYPES = ['video/mp4','video/webm','video/ogg','video/quicktime',
                        'video/x-msvideo','video/x-matroska','video/3gpp','video/3gpp2'];
const MAX_SIZE_MB = 500;

function isValidVideo(file) {
  if (!file.type.startsWith('video/') && !ACCEPTED_TYPES.includes(file.type)) {
    return { ok: false, reason: `"${file.name}" no es un archivo de video` };
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return { ok: false, reason: `"${file.name}" supera los ${MAX_SIZE_MB}MB` };
  }
  return { ok: true };
}

function processFiles(files) {
  const fileArr = Array.from(files);
  if (fileArr.length === 0) return;

  let added = 0;
  let errors = [];

  fileArr.forEach(file => {
    const check = isValidVideo(file);
    if (!check.ok) {
      errors.push(check.reason);
      return;
    }

    const url = URL.createObjectURL(file);
    const entry = { url, name: file.name, duration: null };
    state.videos.push(entry);

    const index = state.videos.length - 1;
    const slide = createSlide(entry, index);
    feed.appendChild(slide);
    added++;
  });

  if (added > 0) {
    // Hide empty state
    if (emptyState) {
      emptyState.style.opacity = '0';
      emptyState.style.transform = 'scale(0.95)';
      emptyState.style.transition = 'opacity 0.3s, transform 0.3s';
      setTimeout(() => emptyState.remove(), 320);
    }

    // Show nav
    sideNav.style.display = 'flex';

    // Reinit observer for new slides
    initObserver();

    // Update counter
    updateCounter();

    // Scroll to first new video if this is the first batch
    if (state.videos.length === added) {
      navigateTo(0);
    }

    const msg = added === 1
      ? `Video "${fileArr[0].name.slice(0, 30)}" añadido`
      : `${added} videos añadidos`;
    showToast(msg, 'success');
  }

  if (errors.length > 0) {
    setTimeout(() => {
      showToast(errors[0], 'error', 4000);
    }, added > 0 ? 1000 : 0);
  }

  // Reset input so same file can be re-selected
  fileInput.value = '';
}

/* ─── Trigger file input ─── */
uploadFab.addEventListener('click', () => fileInput.click());
emptyCta.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  processFiles(e.target.files);
});

/* ─── Drag & Drop on the feed area ─── */
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  document.body.style.outline = '2px dashed var(--accent)';
});

document.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    document.body.style.outline = '';
  }
});

document.addEventListener('dragover', (e) => e.preventDefault());

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  document.body.style.outline = '';
  processFiles(e.dataTransfer.files);
});

/* ════════════════════════════════════════════════
   PREVENT OVERSCROLL / BOUNCE on iOS
════════════════════════════════════════════════ */
document.body.addEventListener('touchmove', (e) => {
  if (!feed.contains(e.target)) e.preventDefault();
}, { passive: false });

/* ════════════════════════════════════════════════
   SCROLL LISTENER — keep counter in sync
   (fallback for manual finger scroll)
════════════════════════════════════════════════ */
let scrollTimer = null;
feed.addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    // Find which slide is most centered
    const slides = [...feed.querySelectorAll('.video-slide')];
    if (slides.length === 0) return;

    const feedMid = feed.scrollTop + feed.clientHeight / 2;
    let closest = 0;
    let minDist = Infinity;

    slides.forEach((slide, i) => {
      const slideMid = slide.offsetTop + slide.offsetHeight / 2;
      const dist = Math.abs(feedMid - slideMid);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });

    state.currentIndex = parseInt(slides[closest].dataset.index, 10);
    updateCounter();
  }, 80);
}, { passive: true });

/* ════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════ */
(function init() {
  // Initial counter state
  updateCounter();

  // Keyboard hint toast (once, after 1.5s)
  setTimeout(() => {
    showToast('↑ ↓ para navegar · Clic para silenciar', '', 3500);
  }, 1500);
})();
