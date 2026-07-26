/**
 * modal.js — one field, two buttons. Resolves with the value, or null.
 */

export function promptName({
  title = 'New Session',
  placeholder = 'Late Night',
  value = '',
  confirmLabel = 'Create',
  cancelLabel = 'Cancel'
} = {}) {
  return new Promise(resolve => {
    const layer = document.getElementById('modal-layer');
    const previouslyFocused = document.activeElement;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
        <h2 class="modal-title"></h2>
        <input class="modal-input" type="text" autocomplete="off" spellcheck="false"
               maxlength="60" aria-label="Session name">
        <div class="modal-actions">
          <button class="btn btn-quiet" data-act="cancel"></button>
          <button class="btn btn-accent" data-act="confirm" disabled></button>
        </div>
      </div>`;

    backdrop.querySelector('.modal-title').textContent = title;
    const input = backdrop.querySelector('.modal-input');
    const confirmBtn = backdrop.querySelector('[data-act="confirm"]');
    const cancelBtn = backdrop.querySelector('[data-act="cancel"]');

    input.placeholder = placeholder;
    input.value = value;
    confirmBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;
    confirmBtn.disabled = input.value.trim().length === 0;

    let settled = false;
    const close = result => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      backdrop.classList.add('closing');
      setTimeout(() => {
        backdrop.remove();
        if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
        resolve(result);
      }, 160);
    };

    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      if (e.key === 'Tab') {
        // Tiny focus trap — three focusable nodes, keep it in the loop.
        const nodes = [input, cancelBtn, confirmBtn].filter(n => !n.disabled);
        const i = nodes.indexOf(document.activeElement);
        if (i === -1) return;
        e.preventDefault();
        const next = e.shiftKey ? (i - 1 + nodes.length) % nodes.length : (i + 1) % nodes.length;
        nodes[next].focus();
      }
    };

    input.addEventListener('input', () => {
      confirmBtn.disabled = input.value.trim().length === 0;
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); close(input.value.trim()); }
    });
    confirmBtn.addEventListener('click', () => close(input.value.trim() || null));
    cancelBtn.addEventListener('click', () => close(null));
    backdrop.addEventListener('pointerdown', e => { if (e.target === backdrop) close(null); });
    document.addEventListener('keydown', onKey, true);

    layer.append(backdrop);
    requestAnimationFrame(() => input.focus());
  });
}
