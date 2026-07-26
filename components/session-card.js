/**
 * session-card.js — one row in the history list.
 *
 * Whole card opens the session. Delete asks once, inline, without a dialog.
 */

import { elapsed, formatDuration, formatDay, statusLabel } from '../scripts/sessions.js';

const TRASH = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
        stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function createSessionCard(session, { onOpen, onDelete, index = 0 }) {
  const card = document.createElement('div');
  card.className = 'session-card';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.style.animationDelay = `${Math.min(index, 8) * 28}ms`;
  card.setAttribute('aria-label',
    `${session.name}, ${statusLabel(session.status)}, ${formatDay(session.createdAt)}, ${formatDuration(elapsed(session))}`);

  card.innerHTML = `
    <span class="sc-main">
      <span class="sc-name"></span>
      <span class="sc-sub">
        <span class="status status-${session.status}"><i class="dot"></i><span class="status-text"></span></span>
        <span class="sep">·</span>
        <span class="sc-date"></span>
      </span>
    </span>
    <span class="sc-duration"></span>
    <button class="sc-delete" type="button" aria-label="Delete session">${TRASH}</button>`;

  card.querySelector('.sc-name').textContent = session.name;
  card.querySelector('.status-text').textContent = statusLabel(session.status);
  card.querySelector('.sc-date').textContent = formatDay(session.createdAt);
  card.querySelector('.sc-duration').textContent = formatDuration(elapsed(session));

  const del = card.querySelector('.sc-delete');
  let armed = false;
  let armTimer = null;

  const disarm = () => {
    armed = false;
    clearTimeout(armTimer);
    del.classList.remove('confirm');
    del.innerHTML = TRASH;
  };

  const hitDelete = e => {
    e.stopPropagation();
    e.preventDefault();
    if (!armed) {
      armed = true;
      del.classList.add('confirm');
      del.textContent = 'Delete?';
      armTimer = setTimeout(disarm, 3200);
      return;
    }
    disarm();
    onDelete(session);
  };

  del.addEventListener('click', hitDelete);
  card.addEventListener('mouseleave', disarm);

  card.addEventListener('click', e => {
    if (e.target.closest('.sc-delete')) return;
    onOpen(session);
  });
  card.addEventListener('keydown', e => {
    if (e.target !== card) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(session); }
  });

  return card;
}
