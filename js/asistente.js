/* =========================================================================
   Asistente Cerro Azul - MiniMax-M3 chat flotante para los 7 portales
   =========================================================================
   - Autocontenido: inyecta su CSS + HTML, sin dependencias externas
   - Una sola clase, sin estado global fuera de sí misma
   - Aparece como banner arriba + ventana abajo-derecha al inicio
   - POST al endpoint Apps Script: { action: 'chatAsistente', mensaje }
   - Validaciones: max 500 chars/mensaje, rate limit 10/10min (sessionStorage)
   - Sin memoria: cada mensaje es independiente
   - System prompt restrictivo en backend (rechazo de "fuera de alcance")
   ========================================================================= */
(function () {
  'use strict';

  // URL del Apps Script (Cerro Azul V23+) - endpoint chatAsistente
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec';

  // Frase literal que emite el backend cuando el tema está fuera del alcance
  var FRASE_RECHAZO = 'Solo puedo ayudarte con preguntas sobre el formulario de la Urbanización Cerro Azul.';
  var MAX_CHARS = 500;
  var MAX_POR_SESION = 10;
  var VENTANA_STG = 'ca_asistente_msg_ts';

  function AsistenteCerroAzul() {
    this.inyectarCSS();
    this.inyectarHTML();
    this.bindEventos();
    this.scrollAbajo();
  }

  // -----------------------------------------------------------------------
  // CSS inyectado (sin archivo .css separado para no requerir deploy extra)
  // -----------------------------------------------------------------------
  AsistenteCerroAzul.prototype.inyectarCSS = function () {
    var s = document.createElement('style');
    s.id = 'ca-asistente-css';
    s.textContent = [
      '#ca-banner {',
      '  position: fixed; top: 0; left: 0; right: 0; z-index: 9998;',
      '  background: linear-gradient(90deg,#0f6cbd,#1f6feb);',
      '  color: #fff; padding: 8px 14px; font: 600 14px/1.2 system-ui,sans-serif;',
      '  display: flex; align-items: center; gap: 10px;',
      '  box-shadow: 0 2px 6px rgba(0,0,0,.15);',
      '}',
      // Empujar todo el contenido debajo del banner para que el header
      // del portal no quede oculto detrás del banner fijo.
      'body { padding-top: 46px !important; }',
      'header.site-header { position: relative; z-index: 1; }',
      '#ca-banner .ca-icon { font-size: 18px; }',
      '#ca-banner .ca-text { flex: 1; }',
      '#ca-banner .ca-toggle {',
      '  background: rgba(255,255,255,.18); border: 0; color: #fff;',
      '  padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600;',
      '}',
      '#ca-banner .ca-toggle:hover { background: rgba(255,255,255,.28); }',
      '#ca-ventana {',
      '  position: fixed; bottom: 16px; right: 16px; z-index: 9999;',
      '  width: min(360px, calc(100vw - 32px)); height: 460px; max-height: calc(100vh - 80px);',
      '  background: #fff; border: 1px solid #d0d4dd; border-radius: 12px;',
      '  box-shadow: 0 8px 28px rgba(0,0,0,.18);',
      '  display: flex; flex-direction: column; font: 14px/1.4 system-ui,sans-serif;',
      '  color: #1d2530;',
      '}',
      '#ca-ventana.ca-oculta { display: none; }',
      '#ca-head {',
      '  background: #0f6cbd; color: #fff; padding: 10px 12px; border-radius: 12px 12px 0 0;',
      '  display: flex; align-items: center; gap: 8px;',
      '}',
      '#ca-head .ca-tit { flex: 1; font-weight: 700; }',
      '#ca-head button {',
      '  background: transparent; border: 0; color: #fff; cursor: pointer;',
      '  font-size: 18px; line-height: 1; padding: 0 4px;',
      '}',
      '#ca-head button:hover { opacity: .8; }',
      '#ca-msgs {',
      '  flex: 1; overflow-y: auto; padding: 12px; background: #f6f8fb;',
      '}',
      '.ca-msg { margin-bottom: 10px; max-width: 85%; padding: 9px 12px; border-radius: 10px; word-wrap: break-word; }',
      '.ca-msg-user { background: #0f6cbd; color: #fff; margin-left: auto; border-bottom-right-radius: 2px; }',
      '.ca-msg-bot  { background: #e9eef5; color: #1d2530; margin-right: auto; border-bottom-left-radius: 2px; }',
      '.ca-msg-bot.ca-fuera { background: #fff3e0; border: 1px solid #ffb74d; color: #b35900; font-weight: 600; }',
      '.ca-msg-bot.ca-error { background: #fde7e9; border: 1px solid #e57373; color: #b00020; }',
      '#ca-input-row {',
      '  display: flex; gap: 6px; padding: 8px; border-top: 1px solid #e0e4eb; background: #fff;',
      '  border-radius: 0 0 12px 12px;',
      '}',
      '#ca-input {',
      '  flex: 1; padding: 8px 10px; border: 1px solid #d0d4dd; border-radius: 8px;',
      '  font: 14px/1.3 system-ui,sans-serif; resize: none; min-height: 38px; max-height: 100px;',
      '}',
      '#ca-input:focus { outline: 0; border-color: #0f6cbd; }',
      '#ca-enviar {',
      '  background: #0f6cbd; color: #fff; border: 0; padding: 0 14px; border-radius: 8px;',
      '  cursor: pointer; font-weight: 600;',
      '}',
      '#ca-enviar:disabled { background: #9bb4d0; cursor: not-allowed; }',
      '#ca-enviar:hover:not(:disabled) { background: #1f6feb; }',
      '#ca-pie { font-size: 11px; color: #687084; padding: 4px 10px; background: #f6f8fb; border-top: 1px solid #e0e4eb; text-align: center; }',
      '@media (max-width: 480px) {',
      '  #ca-ventana { right: 8px; left: 8px; width: auto; }',
      '  #ca-banner { font-size: 13px; padding: 6px 10px; }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  };

  // -----------------------------------------------------------------------
  // HTML inyectado (banner + ventana)
  // -----------------------------------------------------------------------
  AsistenteCerroAzul.prototype.inyectarHTML = function () {
    var banner = document.createElement('div');
    banner.id = 'ca-banner';
    banner.innerHTML =
      '<span class="ca-icon">🤖</span>' +
      '<span class="ca-text">Ayudante con IA para llenar el formulario. Click para abrir el chat.</span>' +
      '<button class="ca-toggle" id="ca-btn-toggle" type="button">Abrir chat</button>';

    var ventana = document.createElement('div');
    ventana.id = 'ca-ventana';
    ventana.innerHTML =
      '<div id="ca-head">' +
        '<span>🤖 Asistente Cerro Azul</span>' +
        '<span class="ca-tit"></span>' +
        '<button id="ca-btn-min" type="button" aria-label="Minimizar">─</button>' +
      '</div>' +
      '<div id="ca-msgs"></div>' +
      '<div id="ca-input-row">' +
        '<textarea id="ca-input" placeholder="Escribe tu pregunta..." maxlength="' + MAX_CHARS + '" aria-label="Mensaje"></textarea>' +
        '<button id="ca-enviar" type="button">▶</button>' +
      '</div>' +
      '<div id="ca-pie">Solo preguntas sobre el formulario Cerro Azul. ' + MAX_POR_SESION + ' mensajes máx. por sesión.</div>';

    document.body.appendChild(banner);
    document.body.appendChild(ventana);

    // Mensaje de bienvenida
    this.agregarMensaje(
      'Hola, soy el asistente de la Urbanización Cerro Azul. ' +
      'Puedo ayudarte a llenar el formulario en cualquiera de los 7 portales ' +
      '(formulario público, salón social, portal del residente, estado de cuenta, admin, vigilantes y cargador de cartera). ' +
      '¿En qué te puedo ayudar?',
      'bot'
    );
  };

  // -----------------------------------------------------------------------
  // Eventos
  // -----------------------------------------------------------------------
  AsistenteCerroAzul.prototype.bindEventos = function () {
    var self = this;

    document.getElementById('ca-btn-toggle').addEventListener('click', function () { self.toggleVentana(); });
    document.getElementById('ca-btn-min').addEventListener('click', function () { self.toggleVentana(); });
    document.getElementById('ca-enviar').addEventListener('click', function () { self.enviar(); });

    var input = document.getElementById('ca-input');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        self.enviar();
      }
    });

    // Botón del banner refleja si está abierta
    var btn = document.getElementById('ca-btn-toggle');
    var obs = new MutationObserver(function () {
      var oculta = document.getElementById('ca-ventana').classList.contains('ca-oculta');
      btn.textContent = oculta ? 'Abrir chat' : 'Ocultar chat';
    });
    obs.observe(document.getElementById('ca-ventana'), { attributes: true, attributeFilter: ['class'] });
  };

  AsistenteCerroAzul.prototype.toggleVentana = function () {
    document.getElementById('ca-ventana').classList.toggle('ca-oculta');
  };

  // -----------------------------------------------------------------------
  // Mensajes (render)
  // -----------------------------------------------------------------------
  AsistenteCerroAzul.prototype.agregarMensaje = function (texto, tipo, opciones) {
    opciones = opciones || {};
    var div = document.createElement('div');
    div.className = 'ca-msg ca-msg-' + (tipo === 'user' ? 'user' : 'bot');
    if (opciones.fuera) div.classList.add('ca-fuera');
    if (opciones.error) div.classList.add('ca-error');
    div.textContent = texto;
    document.getElementById('ca-msgs').appendChild(div);
    this.scrollAbajo();
  };

  AsistenteCerroAzul.prototype.scrollAbajo = function () {
    var m = document.getElementById('ca-msgs');
    m.scrollTop = m.scrollHeight;
  };

  // -----------------------------------------------------------------------
  // Rate limit (sessionStorage: timestamps de los últimos 10 minutos)
  // -----------------------------------------------------------------------
  AsistenteCerroAzul.prototype.contarMensajesRecientes = function () {
    try {
      var raw = sessionStorage.getItem(VENTANA_STG);
      var arr = raw ? JSON.parse(raw) : [];
      var ahora = Date.now();
      // Filtrar últimos 10 min
      arr = arr.filter(function (t) { return ahora - t < 10 * 60 * 1000; });
      sessionStorage.setItem(VENTANA_STG, JSON.stringify(arr));
      return arr.length;
    } catch (e) {
      return 0;
    }
  };

  AsistenteCerroAzul.prototype.registrarMensaje = function () {
    try {
      var raw = sessionStorage.getItem(VENTANA_STG);
      var arr = raw ? JSON.parse(raw) : [];
      arr.push(Date.now());
      sessionStorage.setItem(VENTANA_STG, JSON.stringify(arr));
    } catch (e) { /* sessionStorage no disponible: ignorar */ }
  };

  // -----------------------------------------------------------------------
  // Enviar mensaje al backend
  // -----------------------------------------------------------------------
  AsistenteCerroAzul.prototype.enviar = function () {
    var input = document.getElementById('ca-input');
    var btn = document.getElementById('ca-enviar');
    var texto = (input.value || '').trim();

    if (!texto) return;

    // Validar longitud
    if (texto.length > MAX_CHARS) {
      this.agregarMensaje('Tu mensaje es demasiado largo (máximo ' + MAX_CHARS + ' caracteres).', 'bot', { error: true });
      return;
    }

    // Validar rate limit
    var cuenta = this.contarMensajesRecientes();
    if (cuenta >= MAX_POR_SESION) {
      this.agregarMensaje(
        'Has alcanzado el límite de ' + MAX_POR_SESION + ' mensajes en 10 minutos. ' +
        'Espera unos minutos para enviar más preguntas.',
        'bot', { error: true }
      );
      return;
    }

    // Bloquear UI mientras llega respuesta
    btn.disabled = true;
    input.disabled = true;

    this.agregarMensaje(texto, 'user');
    input.value = '';
    this.registrarMensaje();

    var self = this;
    var ctl = new AbortController();
    // Timeout de 60s por cold start de Apps Script
    var timeoutId = setTimeout(function () { ctl.abort(); }, 60000);

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ action: 'chatAsistente', mensaje: texto }),
      redirect: 'follow',
      signal: ctl.signal
    })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      clearTimeout(timeoutId);
      btn.disabled = false;
      input.disabled = false;
      input.focus();

      if (!j || !j.ok) {
        var msgErr = (j && j.error) ? j.error : 'No se pudo obtener respuesta. Intenta de nuevo.';
        self.agregarMensaje('Error: ' + msgErr, 'bot', { error: true });
        return;
      }
      var resp = (j.respuesta || '').toString();
      var fuera = resp.indexOf(FRASE_RECHAZO) >= 0;
      self.agregarMensaje(resp || '(sin respuesta)', 'bot', { fuera: fuera });
    })
    .catch(function (err) {
      clearTimeout(timeoutId);
      btn.disabled = false;
      input.disabled = false;
      var esAbort = err && err.name === 'AbortError';
      self.agregarMensaje(
        esAbort
          ? 'La respuesta tardó demasiado (más de 60 s). Intenta de nuevo.'
          : 'Error de red: ' + (err.message || err),
        'bot', { error: true }
      );
    });
  };

  // -----------------------------------------------------------------------
  // Init al cargar la página
  // -----------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { new AsistenteCerroAzul(); });
  } else {
    new AsistenteCerroAzul();
  }
})();