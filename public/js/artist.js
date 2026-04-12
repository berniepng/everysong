'use strict';

// ─── URL builder helper (must match server-side buildUrl) ─────────────────
window.buildUrl = function(path, params) {
  const u = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) u.searchParams.set(k, v);
    else u.searchParams.delete(k);
  });
  return u.toString();
};

// ─── Dropdown menus ───────────────────────────────────────────────────────
let openDropdown = null;

window.toggleDropdown = function(id) {
  const menu = document.getElementById(id);
  if (!menu) return;

  if (openDropdown && openDropdown !== menu) {
    openDropdown.classList.remove('open');
  }

  const isOpen = menu.classList.toggle('open');
  openDropdown = isOpen ? menu : null;
};

document.addEventListener('click', function(e) {
  if (openDropdown && !e.target.closest('.filter-dropdown-wrap')) {
    openDropdown.classList.remove('open');
    openDropdown = null;
  }
});

// ─── View toggle (grid / list) ────────────────────────────────────────────
const VIEW_KEY = 'everysong-view';

window.setView = function(mode) {
  const grid = document.getElementById('songsGrid');
  const gridBtn = document.getElementById('gridBtn');
  const listBtn = document.getElementById('listBtn');
  if (!grid) return;

  if (mode === 'list') {
    grid.classList.add('list-view');
    gridBtn.classList.remove('active');
    listBtn.classList.add('active');
  } else {
    grid.classList.remove('list-view');
    gridBtn.classList.add('active');
    listBtn.classList.remove('active');
  }
  localStorage.setItem(VIEW_KEY, mode);
};

// Restore saved view on load
(function() {
  const saved = localStorage.getItem(VIEW_KEY) || 'grid';
  if (saved === 'list') setView('list');
})();

// ─── Search: debounce auto-submit ─────────────────────────────────────────
(function() {
  const searchInput = document.querySelector('.search-input');
  const form = document.getElementById('filterForm');
  if (!searchInput || !form) return;

  let debounceTimer;
  searchInput.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      // Reset to page 1 on new search
      const pageInput = form.querySelector('[name="page"]');
      if (pageInput) pageInput.value = 1;
      form.submit();
    }, 600);
  });
})();

window.clearSearch = function() {
  const searchInput = document.querySelector('.search-input');
  if (searchInput) {
    searchInput.value = '';
    const form = document.getElementById('filterForm');
    if (form) form.submit();
  }
};

// ─── Album art: lazy fetch via API if missing ─────────────────────────────
window.handleArtError = function(img) {
  // Image failed to load — show placeholder, try API fetch
  img.style.display = 'none';
  const wrap = img.closest('.song-art-wrap');
  if (!wrap) return;

  const placeholder = wrap.querySelector('.song-art-placeholder');
  if (placeholder) placeholder.classList.remove('hidden');

  // Try fetching art from our server API
  const album = decodeURIComponent(img.dataset.album || '');
  const artist = decodeURIComponent(img.dataset.artist || '');
  if (!album || !artist) return;

  const base = getBase();
  fetch(`${base}/api/art?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`)
    .then(r => r.json())
    .then(data => {
      if (data.art) {
        img.src = data.art;
        img.style.display = '';
        if (placeholder) placeholder.classList.add('hidden');
      }
    })
    .catch(() => {}); // Silently fail
};

// ─── Lazy load images that have a src ────────────────────────────────────
(function() {
  if (!('IntersectionObserver' in window)) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.lazySrc) {
          img.src = img.dataset.lazySrc;
          delete img.dataset.lazySrc;
        }
        obs.unobserve(img);
      }
    });
  }, { rootMargin: '200px' });

  document.querySelectorAll('img[loading="lazy"]').forEach(img => obs.observe(img));
})();

// ─── Sticky controls bar shadow on scroll ────────────────────────────────
(function() {
  const bar = document.getElementById('controlsBar');
  if (!bar) return;
  window.addEventListener('scroll', function() {
    bar.style.boxShadow = window.scrollY > 10 ? '0 4px 20px rgba(0,0,0,0.2)' : '';
  }, { passive: true });
})();

// ─── Get base path from current URL ──────────────────────────────────────
function getBase() {
  const parts = window.location.pathname.split('/');
  // Find 'everysong' segment
  const idx = parts.indexOf('everysong');
  if (idx === -1) return '';
  return parts.slice(0, idx + 1).join('/');
}
