export function markBootOk() {
  const el = document.getElementById('boot-status');
  if (el) {
    el.remove();
  }
}

export function showBootError(message: string) {
  const el = document.getElementById('boot-status');
  if (!el) {
    return;
  }
  el.className = 'boot-error';
  el.innerHTML = `<h1>Karaokej failed to start</h1><pre>${escapeHtml(message)}</pre>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
