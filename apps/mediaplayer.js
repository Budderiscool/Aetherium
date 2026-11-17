// apps/mediaplayer.js — HTML5 Audio & Video Media Player
// Aetherium OS — Multimedia Subsystem

import { vfs, basename, guessMime } from '../kernel/vfs.js';
import { notifications } from '../kernel/ipc.js';
import { wm } from '../kernel/wm.js';

export const appInfo = {
  id: 'mediaplayer',
  title: 'Media Player',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  defaultWidth: 540,
  defaultHeight: 460,
  minWidth: 380,
  minHeight: 320,
  singleton: true,
  category: 'utility'
};

export function launch(container, windowId, args = {}) {
  _injectStyles();

  let playlist = [];
  let currentIndex = -1;
  let isPlaying = false;
  let isLooping = false;
  let animFrameId = null;

  container.innerHTML = `
    <div class="mp-container">
      <!-- Media Viewport (Video or Visualizer Canvas) -->
      <div class="mp-stage">
        <video class="mp-video" style="display:none;" playsinline></video>
        <div class="mp-audio-visual">
          <canvas class="mp-visualizer-canvas" width="400" height="160"></canvas>
          <div class="mp-track-info">
            <div class="mp-track-title">No Media Loaded</div>
            <div class="mp-track-artist">Aetherium Audio Engine</div>
          </div>
        </div>
      </div>

      <!-- Progress / Seek Bar -->
      <div class="mp-scrub-wrap">
        <span class="mp-time-current">0:00</span>
        <input type="range" class="mp-seek-slider" min="0" max="100" value="0" step="0.1">
        <span class="mp-time-duration">0:00</span>
      </div>

      <!-- Controls Row -->
      <div class="mp-controls">
        <button class="mp-btn mp-loop-btn" title="Toggle Loop">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </button>
        <button class="mp-btn mp-prev-btn" title="Previous Track">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
        </button>
        <button class="mp-btn mp-play-btn" title="Play / Pause">
          <svg class="mp-play-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button class="mp-btn mp-next-btn" title="Next Track">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
        </button>
        <div class="mp-volume-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          <input type="range" class="mp-vol-slider" min="0" max="1" step="0.05" value="0.8">
        </div>
      </div>

      <!-- Playlist Drawer -->
      <div class="mp-playlist-wrap">
        <div class="mp-playlist-header">
          <span>Playlist</span>
          <button class="mp-add-files-btn">+ Add from Music</button>
        </div>
        <div class="mp-playlist-items"></div>
      </div>
    </div>
  `;

  const videoEl = container.querySelector('.mp-video');
  const canvas = container.querySelector('.mp-visualizer-canvas');
  const trackTitle = container.querySelector('.mp-track-title');
  const trackArtist = container.querySelector('.mp-track-artist');
  const playBtn = container.querySelector('.mp-play-btn');
  const playIcon = container.querySelector('.mp-play-icon');
  const prevBtn = container.querySelector('.mp-prev-btn');
  const nextBtn = container.querySelector('.mp-next-btn');
  const loopBtn = container.querySelector('.mp-loop-btn');
  const seekSlider = container.querySelector('.mp-seek-slider');
  const volSlider = container.querySelector('.mp-vol-slider');
  const timeCurrent = container.querySelector('.mp-time-current');
  const timeDuration = container.querySelector('.mp-time-duration');
  const playlistItemsEl = container.querySelector('.mp-playlist-items');
  const addFilesBtn = container.querySelector('.mp-add-files-btn');
  const audioVisualEl = container.querySelector('.mp-audio-visual');

  // Shared HTML5 Audio instance
  const audio = new Audio();
  audio.volume = 0.8;

  async function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    const track = playlist[index];

    trackTitle.textContent = track.name;
    trackArtist.textContent = track.type.toUpperCase();
    wm.setTitle(windowId, `Media Player — ${track.name}`);

    try {
      let srcUrl = track.src;
      if (!srcUrl && track.path) {
        const content = await vfs.read(track.path);
        if (typeof content === 'string' && content.startsWith('data:')) {
          srcUrl = content;
        } else {
          const blob = new Blob([content], { type: track.mime || 'audio/mpeg' });
          srcUrl = URL.createObjectURL(blob);
        }
        track.src = srcUrl;
      }

      if (track.mime?.startsWith('video/') || track.name.endsWith('.mp4') || track.name.endsWith('.webm')) {
        audioVisualEl.style.display = 'none';
        videoEl.style.display = 'block';
        videoEl.src = srcUrl;
        videoEl.play();
      } else {
        videoEl.style.display = 'none';
        audioVisualEl.style.display = 'flex';
        audio.src = srcUrl;
        audio.play();
      }

      isPlaying = true;
      updatePlayButton();
      renderPlaylist();
    } catch (err) {
      notifications.show('Playback Error', err.message, { type: 'error' });
    }
  }

  function togglePlay() {
    const activeMedia = videoEl.style.display === 'block' ? videoEl : audio;
    if (!activeMedia.src) {
      if (playlist.length > 0) loadTrack(0);
      return;
    }

    if (activeMedia.paused) {
      activeMedia.play();
      isPlaying = true;
    } else {
      activeMedia.pause();
      isPlaying = false;
    }
    updatePlayButton();
  }

  function updatePlayButton() {
    if (isPlaying) {
      playIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
    } else {
      playIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
    }
  }

  function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function updateScrubber() {
    const activeMedia = videoEl.style.display === 'block' ? videoEl : audio;
    if (activeMedia.duration) {
      seekSlider.value = (activeMedia.currentTime / activeMedia.duration) * 100;
      timeCurrent.textContent = formatTime(activeMedia.currentTime);
      timeDuration.textContent = formatTime(activeMedia.duration);
    }
  }

  function renderPlaylist() {
    playlistItemsEl.innerHTML = '';
    playlist.forEach((track, i) => {
      const el = document.createElement('div');
      el.className = `mp-playlist-item ${i === currentIndex ? 'active' : ''}`;
      el.innerHTML = `
        <span class="mp-pl-index">${i + 1}</span>
        <span class="mp-pl-title">${track.name}</span>
      `;
      el.addEventListener('click', () => loadTrack(i));
      playlistItemsEl.appendChild(el);
    });
  }

  // Visualizer Animation Loop
  function drawVisualizer() {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bars = 32;
    const barW = (w / bars) - 2;

    for (let i = 0; i < bars; i++) {
      const height = isPlaying ? Math.random() * (h - 20) + 10 : 6;
      const x = i * (barW + 2);
      const y = h - height;

      ctx.fillStyle = `hsl(${190 + (i / bars) * 60}, 100%, 50%)`;
      ctx.fillRect(x, y, barW, height);
    }

    animFrameId = requestAnimationFrame(drawVisualizer);
  }

  // Audio Events
  audio.addEventListener('timeupdate', updateScrubber);
  videoEl.addEventListener('timeupdate', updateScrubber);

  audio.addEventListener('ended', () => {
    if (isLooping) {
      audio.currentTime = 0;
      audio.play();
    } else if (currentIndex < playlist.length - 1) {
      loadTrack(currentIndex + 1);
    } else {
      isPlaying = false;
      updatePlayButton();
    }
  });

  playBtn.addEventListener('click', togglePlay);
  prevBtn.addEventListener('click', () => {
    if (currentIndex > 0) loadTrack(currentIndex - 1);
  });
  nextBtn.addEventListener('click', () => {
    if (currentIndex < playlist.length - 1) loadTrack(currentIndex + 1);
  });
  loopBtn.addEventListener('click', () => {
    isLooping = !isLooping;
    loopBtn.style.color = isLooping ? 'var(--ae-accent)' : 'inherit';
  });

  seekSlider.addEventListener('input', () => {
    const activeMedia = videoEl.style.display === 'block' ? videoEl : audio;
    if (activeMedia.duration) {
      activeMedia.currentTime = (seekSlider.value / 100) * activeMedia.duration;
    }
  });

  volSlider.addEventListener('input', () => {
    audio.volume = volSlider.value;
    videoEl.volume = volSlider.value;
  });

  addFilesBtn.addEventListener('click', async () => {
    try {
      const files = await vfs.readdir('/home/user/Music');
      files.forEach((f) => {
        if (!playlist.some((p) => p.path === f.path)) {
          playlist.push({ name: f.name, path: f.path, mime: f.mime || guessMime(f.name) });
        }
      });
      renderPlaylist();
      if (currentIndex === -1 && playlist.length > 0) loadTrack(0);
    } catch {
      notifications.show('Music Folder', 'Add media files to /home/user/Music in Files app', { type: 'info' });
    }
  });

  // Launch argument file
  if (args.filePath) {
    const name = basename(args.filePath);
    playlist.push({ name, path: args.filePath, mime: guessMime(name) });
    renderPlaylist();
    loadTrack(0);
  }

  drawVisualizer();

  return () => {
    audio.pause();
    audio.src = '';
    videoEl.pause();
    videoEl.src = '';
    if (animFrameId) cancelAnimationFrame(animFrameId);
  };
}

function _injectStyles() {
  if (document.getElementById('mp-player-styles')) return;
  const style = document.createElement('style');
  style.id = 'mp-player-styles';
  style.textContent = `
    .mp-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ae-bg-solid);
      color: var(--ae-text-primary);
      overflow: hidden;
    }
    .mp-stage {
      flex: 1;
      position: relative;
      background: #05050a;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .mp-video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .mp-audio-visual {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .mp-track-info {
      text-align: center;
    }
    .mp-track-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--ae-text-primary);
    }
    .mp-track-artist {
      font-size: 12px;
      color: var(--ae-text-secondary);
      margin-top: 4px;
    }
    .mp-scrub-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: var(--ae-bg-primary);
      font-size: 11px;
      font-family: var(--ae-font-mono);
      color: var(--ae-text-muted);
    }
    .mp-seek-slider {
      flex: 1;
      accent-color: var(--ae-accent);
      cursor: pointer;
    }
    .mp-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 10px 16px;
      background: var(--ae-bg-secondary);
      border-top: 1px solid var(--ae-border);
    }
    .mp-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: transparent;
      border: none;
      color: var(--ae-text-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background var(--ae-transition);
    }
    .mp-btn:hover { background: var(--ae-bg-tertiary); }
    .mp-btn.mp-play-btn {
      width: 44px;
      height: 44px;
      background: var(--ae-accent);
      color: #000;
    }
    .mp-btn svg { width: 18px; height: 18px; }
    .mp-volume-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 12px;
    }
    .mp-volume-wrap svg { width: 14px; height: 14px; color: var(--ae-text-muted); }
    .mp-vol-slider { width: 70px; accent-color: var(--ae-accent); cursor: pointer; }
    .mp-playlist-wrap {
      height: 120px;
      background: rgba(10, 10, 20, 0.85);
      border-top: 1px solid var(--ae-border);
      display: flex;
      flex-direction: column;
    }
    .mp-playlist-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 600;
      color: var(--ae-text-secondary);
      border-bottom: 1px solid var(--ae-border);
    }
    .mp-add-files-btn {
      background: none;
      border: none;
      color: var(--ae-accent);
      font-size: 11px;
      cursor: pointer;
    }
    .mp-playlist-items {
      flex: 1;
      overflow-y: auto;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .mp-playlist-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      font-size: 12px;
      border-radius: 4px;
      cursor: pointer;
    }
    .mp-playlist-item:hover { background: var(--ae-bg-tertiary); }
    .mp-playlist-item.active { background: var(--ae-accent-glow); color: var(--ae-accent); }
    .mp-pl-index { font-family: var(--ae-font-mono); font-size: 10px; color: var(--ae-text-muted); }
  `;
  document.head.appendChild(style);
}
