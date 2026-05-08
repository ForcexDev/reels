/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              FAKEBOOK SHORTS — script.js                     ║
 * ║  YouTube IFrame API · IntersectionObserver · Bucle infinito  ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * FLUJO PRINCIPAL:
 *   1. VIDEO_IDS define los Shorts a mostrar.
 *   2. buildSlides() genera el HTML de cada slide.
 *   3. onYouTubeIframeAPIReady() (callback global de la API de YT)
 *      crea los objetos YT.Player para cada iframe.
 *   4. IntersectionObserver detecta qué slide está visible y llama
 *      player.playVideo() / player.pauseVideo() automáticamente.
 *   5. Los botones ↑ ↓ y el teclado implementan el bucle infinito.
 */

'use strict';

/* ════════════════════════════════════════════════════════════════
   ▼▼▼  EDITA AQUÍ TUS IDs DE YOUTUBE SHORTS  ▼▼▼

   Instrucciones:
   - Abre cualquier YouTube Short en el navegador.
   - La URL tendrá el formato: https://www.youtube.com/shorts/XXXXXXXXXXX
   - Copia solo la parte "XXXXXXXXXXX" (el ID de 11 caracteres).
   - Pégala como nuevo elemento del array de abajo.
   - Puedes añadir tantos IDs como quieras.
   - El orden del array es el orden de reproducción.

   Ejemplo de URL → ID:
   https://www.youtube.com/shorts/dQw4w9WgXcQ  →  "dQw4w9WgXcQ"
════════════════════════════════════════════════════════════════ */
const VIDEO_IDS = [
  'xVCCSfJJaMM',   // Short #1 ← TU VIDEO (siempre de primero)
  'YM24OS2zaDE',   // Short #2 — reemplaza con tu ID
  'nlMEpZHX1kE',   // Short #3 — reemplaza con tu ID
  'M7lc1UVf-VE',   // Short #4 — reemplaza con tu ID
];
/* ════════════════════════════════════════════════════════════════
   ▲▲▲  FIN DE LA SECCIÓN DE IDs  ▲▲▲
════════════════════════════════════════════════════════════════ */


/* ─── Parámetros del reproductor de YouTube ─── */
const YT_PLAYER_VARS = {
  autoplay:        1,   // Reproducción automática
  mute:            1,   // Silenciado al inicio (requerido por navegadores)
  controls:        0,   // Ocultar controles de YouTube
  modestbranding:  1,   // Reducir branding de YouTube
  rel:             0,   // No mostrar videos relacionados al terminar
  playsinline:     1,   // Reproducción inline en iOS (sin fullscreen forzado)
  loop:            1,   // Loop individual del video
  fs:              0,   // Deshabilitar botón fullscreen nativo de YT
  iv_load_policy:  3,   // Ocultar anotaciones
  cc_load_policy:  0,   // Sin subtítulos automáticos
  disablekb:       1,   // Desactivar atajos de teclado del player de YT
  // 'playlist' se añade dinámicamente por cada player para que loop=1 funcione
};


/* ─── Estado global ─── */
const state = {
  players:      [],    // Array de instancias YT.Player (una por slide)
  currentIndex: 0,     // Índice del slide visible actualmente
  isPaused:     false, // Si el usuario ha pausado manualmente el video actual
  ytReady:      false, // True cuando la API de YouTube ha cargado
  observer:     null,  // IntersectionObserver activo
  globalMuted:  true,  // Arranca silenciado (obligatorio para autoplay); el usuario lo desactiva
};

/* SVGs de mute/unmute reutilizables */
const ICON_MUTED = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
  <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
</svg>`;
const ICON_SOUND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
</svg>`;

/* ─── Referencias al DOM ─── */
const feed         = document.getElementById('feed');
const loadingState = document.getElementById('loadingState');
const sideNav      = document.getElementById('sideNav');
const btnUp        = document.getElementById('btnUp');
const btnDown      = document.getElementById('btnDown');
const currentIdxEl = document.getElementById('currentIdx');
const totalCountEl = document.getElementById('totalCount');
const toastEl      = document.getElementById('toast');
const muteBtn      = document.getElementById('muteBtn');


/* ════════════════════════════════════════════════════════════════
   TOAST — Notificaciones flotantes
════════════════════════════════════════════════════════════════ */
let _toastTimer = null;

function showToast(msg, type = '', duration = 2600) {
  toastEl.textContent  = msg;
  toastEl.className    = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, duration);
}


/* ════════════════════════════════════════════════════════════════
   MUTE GLOBAL — Silenciar / Activar audio en todos los players
════════════════════════════════════════════════════════════════ */
function applyMuteState() {
  state.players.forEach(p => {
    if (!p || typeof p.mute !== 'function') return;
    state.globalMuted ? p.mute() : p.unMute();
  });
  /* Actualizar ícono del botón */
  if (muteBtn) muteBtn.innerHTML = state.globalMuted ? ICON_MUTED : ICON_SOUND;
}

function toggleMute() {
  state.globalMuted = !state.globalMuted;
  applyMuteState();
  showToast(
    state.globalMuted ? '🔇 Silenciado' : '🔊 Audio activado',
    'success',
    1800
  );
}

if (muteBtn) muteBtn.addEventListener('click', toggleMute);


function updateCounter() {
  currentIdxEl.textContent = state.currentIndex + 1;
  totalCountEl.textContent = VIDEO_IDS.length;
}


/* ════════════════════════════════════════════════════════════════
   BUILD SLIDES — Genera el HTML de cada slide antes de
   que la API de YouTube esté lista. Los iframes se crean
   con un ID único que YT.Player usará para montarse.
════════════════════════════════════════════════════════════════ */
function buildSlides() {
  // Quitar pantalla de carga
  if (loadingState) loadingState.remove();

  VIDEO_IDS.forEach((videoId, index) => {
    const slide = document.createElement('div');
    slide.className      = 'video-slide';
    slide.dataset.index  = index;
    slide.dataset.videoId = videoId;

    /* Wrapper del iframe — el iframe en sí lo monta YT.Player */
    const iframeWrapper = document.createElement('div');
    iframeWrapper.className = 'yt-iframe-wrapper';

    /* Div vacío: la API de YouTube reemplaza este div por un iframe */
    const playerDiv = document.createElement('div');
    playerDiv.id = `yt-player-${index}`;
    iframeWrapper.appendChild(playerDiv);

    /* Capa de interacción (captura clics sobre el iframe) */
    const overlay = document.createElement('div');
    overlay.className = 'slide-overlay';
    overlay.addEventListener('click', () => handleSlideClick(index));

    /* Info: número y ID del short */
    const info = document.createElement('div');
    info.className = 'slide-info';
    info.innerHTML = `
      <div class="slide-number">Short ${index + 1}</div>
      <div class="slide-id">youtu.be/${videoId}</div>
    `;

    /* Enlace para abrir en YouTube */
    const ytLink = document.createElement('a');
    ytLink.className = 'yt-link';
    ytLink.href      = `https://www.youtube.com/shorts/${videoId}`;
    ytLink.target    = '_blank';
    ytLink.rel       = 'noopener noreferrer';
    ytLink.title     = 'Abrir en YouTube';
    ytLink.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4
                 M14 4h6m0 0v6m0-6L10 14"/>
      </svg>
    `;
    /* Evitar que el clic al enlace active la capa de interacción */
    ytLink.addEventListener('click', e => e.stopPropagation());

    /* Flash de pausa/play */
    const flash = document.createElement('div');
    flash.className = 'play-flash';
    flash.id        = `flash-${index}`;
    flash.innerHTML = `
      <svg viewBox="0 0 24 24" fill="white">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>`;

    slide.append(iframeWrapper, overlay, info, ytLink, flash);
    feed.appendChild(slide);
  });

  // Mostrar el contador ahora que los slides existen
  updateCounter();
}


/* ════════════════════════════════════════════════════════════════
   CLICK EN SLIDE — Alterna pausa/play del video actual
════════════════════════════════════════════════════════════════ */
function handleSlideClick(index) {
  const player = state.players[index];
  if (!player || typeof player.getPlayerState !== 'function') return;

  const flash      = document.getElementById(`flash-${index}`);
  const playerState = player.getPlayerState();

  /* YT.PlayerState.PLAYING = 1 */
  if (playerState === 1) {
    player.pauseVideo();
    state.isPaused = true;
    if (flash) showFlash(flash, 'pause');
  } else {
    player.playVideo();
    state.isPaused = false;
    if (flash) showFlash(flash, 'play');
  }
}

function showFlash(flashEl, type) {
  flashEl.innerHTML = type === 'pause'
    ? `<svg viewBox="0 0 24 24" fill="white">
         <rect x="6" y="4" width="4" height="16"/>
         <rect x="14" y="4" width="4" height="16"/>
       </svg>`
    : `<svg viewBox="0 0 24 24" fill="white">
         <polygon points="5 3 19 12 5 21 5 3"/>
       </svg>`;

  flashEl.classList.add('show');
  clearTimeout(flashEl._timer);
  flashEl._timer = setTimeout(() => flashEl.classList.remove('show'), 650);
}


/* ════════════════════════════════════════════════════════════════
   INTERSECTION OBSERVER — Detección de slide visible
   Umbral 50%: el video que ocupe más de la mitad de la pantalla
   se reproduce; el resto se pausa.
════════════════════════════════════════════════════════════════ */
function initObserver() {
  if (state.observer) state.observer.disconnect();

  state.observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const idx    = parseInt(entry.target.dataset.index, 10);
      const player = state.players[idx];

      /* Player aún no inicializado → saltar */
      if (!player || typeof player.playVideo !== 'function') return;

      if (entry.intersectionRatio >= 0.5) {
        /* Este slide es el dominante */
        state.currentIndex = idx;
        state.isPaused     = false;
        updateCounter();

        player.playVideo();
      } else {
        /* Fuera de vista → pausar */
        player.pauseVideo();
      }
    });
  }, {
    root:      feed,
    threshold: [0.5],
  });

  /* Observar todos los slides */
  document.querySelectorAll('.video-slide').forEach(slide => {
    state.observer.observe(slide);
  });
}


/* ════════════════════════════════════════════════════════════════
   YOUTUBE IFRAME API — Callback global requerida por la API.
   Se llama automáticamente cuando youtube.com/iframe_api termina
   de cargarse.
════════════════════════════════════════════════════════════════ */
window.onYouTubeIframeAPIReady = function () {
  state.ytReady = true;

  VIDEO_IDS.forEach((videoId, index) => {
    const player = new YT.Player(`yt-player-${index}`, {
      videoId,
      playerVars: {
        ...YT_PLAYER_VARS,
        /* Para que loop=1 funcione, YouTube requiere playlist con el mismo ID */
        playlist: videoId,
      },
      events: {
        onReady: (event) => {
          /* Silenciar al inicio (obligatorio para autoplay en navegadores) */
          event.target.mute();

          /* Solo reproducir el primer video automáticamente */
          if (index === 0) {
            event.target.playVideo();
          }

          /* Registrar el player en el array de estado */
          state.players[index] = event.target;

          /* Comprobar si todos los players están listos */
          const readyCount = state.players.filter(Boolean).length;
          if (readyCount === VIDEO_IDS.length) {
            /* Aplicar estado de mute actual a todos los players */
            applyMuteState();
            /* Inicializar ícono del botón de mute */
            if (muteBtn) muteBtn.innerHTML = state.globalMuted ? ICON_MUTED : ICON_SOUND;
            /* Pulsar el botón de mute para que el usuario lo note */
            if (muteBtn) {
              setTimeout(() => {
                muteBtn.classList.add('pulse');
                muteBtn.addEventListener('animationend', () => muteBtn.classList.remove('pulse'), { once: true });
              }, 800);
            }
            /* Arrancar el IntersectionObserver */
            initObserver();
          }
        },
        onError: (event) => {
          /* Errores comunes de YouTube:
             2  = ID inválido
             5  = HTML5 no soportado
             100 = Video no encontrado o privado
             101/150 = Reproducción embebida no permitida por el autor */
          const errorMessages = {
            2:   'ID de video inválido',
            5:   'Error del reproductor HTML5',
            100: 'Video no encontrado o es privado',
            101: 'Este video no permite reproducción embebida',
            150: 'Este video no permite reproducción embebida',
          };
          const msg = errorMessages[event.data] || `Error del reproductor (${event.data})`;
          showToast(`Short ${index + 1}: ${msg}`, 'error', 5000);
          console.warn(`[Fakebook] Error en player ${index} (videoId: ${videoId}):`, msg);
        },
      },
    });
  });
};


/* ════════════════════════════════════════════════════════════════
   NAVEGACIÓN CON BUCLE INFINITO
   Fórmula: ((índice % total) + total) % total
   → Funciona tanto con negativos como con desbordamiento positivo.
════════════════════════════════════════════════════════════════ */
function navigateTo(rawIndex) {
  const total = VIDEO_IDS.length;
  if (total === 0) return;

  /* Bucle infinito: tras el último va el primero, y viceversa */
  const index = ((rawIndex % total) + total) % total;

  const targetSlide = feed.querySelector(`.video-slide[data-index="${index}"]`);
  if (!targetSlide) return;

  /* Scroll suave al slide destino */
  targetSlide.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* Actualizar estado e inmediatamente reproducir el destino */
  state.currentIndex = index;
  state.isPaused     = false;
  updateCounter();

  /* Dar tiempo al scroll antes de llamar playVideo */
  setTimeout(() => {
    const player = state.players[index];
    if (player && typeof player.playVideo === 'function') {
      player.playVideo();
      /* Respetar el estado de mute actual */
      state.globalMuted ? player.mute() : player.unMute();
    }
  }, 350);
}


/* ─── Botones ↑ ↓ ─── */
btnDown.addEventListener('click', () => navigateTo(state.currentIndex + 1));
btnUp.addEventListener('click',   () => navigateTo(state.currentIndex - 1));


/* ─── Teclado: flechas y WASD ─── */
document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowRight':
    case 's':
    case 'S':
      e.preventDefault();
      navigateTo(state.currentIndex + 1);
      break;
    case 'ArrowUp':
    case 'ArrowLeft':
    case 'w':
    case 'W':
      e.preventDefault();
      navigateTo(state.currentIndex - 1);
      break;
    case ' ':
      e.preventDefault();
      handleSlideClick(state.currentIndex);
      break;
  }
});


/* ─── Scroll manual → mantener contador sincronizado ─── */
let _scrollDebounce = null;
feed.addEventListener('scroll', () => {
  clearTimeout(_scrollDebounce);
  _scrollDebounce = setTimeout(() => {
    const slides = [...feed.querySelectorAll('.video-slide')];
    if (!slides.length) return;

    const feedMid = feed.scrollTop + feed.clientHeight / 2;
    let closest = 0, minDist = Infinity;

    slides.forEach((slide, i) => {
      const dist = Math.abs((slide.offsetTop + slide.offsetHeight / 2) - feedMid);
      if (dist < minDist) { minDist = dist; closest = i; }
    });

    state.currentIndex = parseInt(slides[closest].dataset.index, 10);
    updateCounter();
  }, 80);
}, { passive: true });


/* ─── Swipe táctil para navegación (móvil) ─── */
let _touchStartY = 0;
feed.addEventListener('touchstart', (e) => {
  _touchStartY = e.touches[0].clientY;
}, { passive: true });

feed.addEventListener('touchend', (e) => {
  const delta = _touchStartY - e.changedTouches[0].clientY;
  /* Solo registrar como swipe intencional si el delta supera 30px */
  /* El snap scroll maneja el resto; esto es solo para el contador */
}, { passive: true });


/* ════════════════════════════════════════════════════════════════
   INIT — Punto de entrada
════════════════════════════════════════════════════════════════ */
(function init() {
  if (VIDEO_IDS.length === 0) {
    showToast('Añade IDs en VIDEO_IDS dentro de script.js', 'error', 6000);
    return;
  }

  /* Construir los slides en el DOM */
  buildSlides();

  /* Toast de bienvenida con atajos de teclado */
  setTimeout(() => {
    showToast('↑ ↓ para navegar · Espacio para pausar', '', 3200);
  }, 1800);
})();
