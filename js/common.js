// AUD-T11: helpers compartidos por los 7 portales. No depende de ningún otro script.
(function () {
  const url = window.CA_CONFIG && window.CA_CONFIG.url;
  if (!url) console.error('[CA] Falta js/config.js antes de common.js');

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function hoyLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  async function api(payload, opts) {
    opts = opts || {};
    const method = opts.method || 'POST';
    const timeoutMs = opts.timeoutMs || 45000;
    if (navigator.onLine === false) throw new Error('Sin conexión a internet. Revise su red e intente de nuevo.');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const target = method === 'GET' ? url + '?' + new URLSearchParams(payload).toString() : url;
      const r = await fetch(target, {
        method: method,
        body: method === 'POST' ? JSON.stringify(payload) : undefined,
        headers: method === 'POST' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : undefined,
        redirect: 'follow',
        signal: ctl.signal
      });
      const text = await r.text();
      let j;
      try { j = JSON.parse(text); } catch (e) {
        throw new Error('El servidor no respondió correctamente (HTTP ' + r.status + '). Intente de nuevo en unos minutos.');
      }
      if (j && j.ok === false && /Sesión no válida/.test(String(j.error || '')) && typeof opts.onSesionExpirada === 'function') {
        opts.onSesionExpirada();
      }
      return j;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('El servidor tardó demasiado en responder. Intente de nuevo.');
      throw e;
    } finally { clearTimeout(t); }
  }

  async function withBusy(btn, textoOcupado, fn) {
    if (!btn) return fn();
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = textoOcupado || 'Procesando...';
    try { return await fn(); }
    finally { btn.disabled = false; btn.textContent = original; }
  }

  window.CA = Object.freeze({ url: url, escapeHtml: escapeHtml, hoyLocal: hoyLocal, api: api, withBusy: withBusy });
})();
