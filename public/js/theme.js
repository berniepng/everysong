(function() {
  'use strict';

  const STORAGE_KEY = 'everysong-theme';
  const root = document.documentElement;

  // Apply saved theme immediately (before paint)
  const saved = localStorage.getItem(STORAGE_KEY) || 'dark';
  root.setAttribute('data-theme', saved);

  document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;

    function updateIcon() {
      const theme = root.getAttribute('data-theme');
      btn.querySelector('.theme-icon').textContent = theme === 'dark' ? '◐' : '◑';
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }

    updateIcon();

    btn.addEventListener('click', function() {
      const current = root.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_KEY, next);
      updateIcon();
    });
  });
})();
