/**
 * toast.js — a small pill in the corner. Silent, non-blocking, self-dismissing.
 */

const DEFAULT_LIFE = 9000;
let layer = null;

function getLayer() {
  if (!layer) layer = document.getElementById('toast-layer');
  return layer;
}

export function showToast(message, { life = DEFAULT_LIFE } = {}) {
  const root = getLayer();
  if (!root) return;

  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<i class="dot" aria-hidden="true"></i><span></span>`;
  el.querySelector('span').textContent = message;

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    el.classList.add('closing');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };

  el.addEventListener('click', close);
  root.append(el);
  setTimeout(close, life);

  return close;
}
