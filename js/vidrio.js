// =====================================================================
// Cerro Azul — Capa "vidrio": mejoras visuales ADITIVAS (nov-2026)
//
// Este archivo NO reemplaza ni modifica la lógica de ningún portal:
//   - No toca window.fetch, CA.api ni ningún manejador existente.
//   - Solo AGREGA elementos nuevos (prefijo "vd-", atributo data-vd)
//     y escucha eventos sin cancelarlos (nunca preventDefault).
//   - Cada mejora corre dentro de su propio try/catch: si una falla,
//     el portal sigue funcionando exactamente igual que antes.
// Para desactivarlo basta con quitar su <script> de la página.
// =====================================================================
(function () {
  'use strict';

  var PRECALENTAR = true;   // "despertar" el backend al abrir la página

  function seguro(nombre, fn) {
    try { fn(); } catch (e) {
      if (window.console && console.warn) console.warn('[vidrio] ' + nombre + ' desactivado:', e && e.message);
    }
  }
  function crear(tag, clase, texto) {
    var el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== null && texto !== undefined) el.textContent = texto;
    el.setAttribute('data-vd', '');
    return el;
  }
  function svg(d) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '22'); s.setAttribute('height', '22');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); s.appendChild(p);
    return s;
  }
  // La portada es index.html (la dirección principal del portal).
  function esPortada() { return !!document.querySelector('.vd-portada'); }

  // ------------------------------------------------------------------
  // 1. Botón "Inicio" en el encabezado de cada portal
  // ------------------------------------------------------------------
  function botonInicio() {
    if (esPortada()) return;
    var barra = document.querySelector('header.site-header .header-inner');
    if (!barra || barra.querySelector('.vd-inicio')) return;
    var a = crear('a', 'vd-inicio vd-no-imprimir');
    a.href = 'index.html';
    a.title = 'Inicio del portal';
    a.setAttribute('aria-label', 'Ir al inicio del portal');
    a.appendChild(svg('M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'));
    barra.insertBefore(a, barra.firstChild);
  }

  // ------------------------------------------------------------------
  // 2. Portada: las torres 3D siguen el cursor
  // ------------------------------------------------------------------
  function torres() {
    var escena = document.getElementById('vd-torres');
    if (!escena) return;
    var eje = escena.querySelector('.vd-torres-giro-libre');
    if (!eje) return;
    escena.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var r = escena.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      eje.style.setProperty('--vd-rx', (-17 - y * 16).toFixed(1) + 'deg');
      eje.style.setProperty('--vd-ry', (x * 46).toFixed(1) + 'deg');
    });
    escena.addEventListener('pointerleave', function () {
      eje.style.removeProperty('--vd-rx');
      eje.style.removeProperty('--vd-ry');
    });
  }

  // ------------------------------------------------------------------
  // 3. Estado de cuenta: tarjeta 3D del apartamento
  //    Lee lo que js/estado-cuenta.js YA escribió en #ecResumen
  //    ("Apto 105 · NOMBRE" + la frase del saldo). Si el formato cambia
  //    y no se puede leer, la tarjeta simplemente no aparece.
  // ------------------------------------------------------------------
  function tarjetaEstado() {
    var resumen = document.getElementById('ecResumen');
    if (!resumen || !resumen.parentNode) return;

    var escena = crear('div', 'vd-escena vd-no-imprimir');
    escena.id = 'vd-tarjeta';
    escena.hidden = true;
    escena.setAttribute('aria-hidden', 'true');   // repite datos que ya están en el texto
    var flota = crear('div', 'vd-flota');
    var tarjeta = crear('div', 'vd-tarjeta');
    var ns = 'http://www.w3.org/2000/svg';
    var dib = document.createElementNS(ns, 'svg');
    dib.setAttribute('viewBox', '0 0 400 212'); dib.setAttribute('preserveAspectRatio', 'none');
    var cerro = document.createElementNS(ns, 'path');
    cerro.setAttribute('d', 'M-10 170 C 90 80, 200 36, 280 72 C 340 100, 370 152, 420 162 L 420 230 L -10 230 Z');
    cerro.setAttribute('fill', '#FFFFFF'); cerro.setAttribute('opacity', '.14');
    dib.appendChild(cerro);
    var brillo = crear('div', 'vd-tarjeta-brillo');
    var marca = crear('div', 'vd-tarjeta-marca', 'Cerro Azul');
    var estado = crear('div', 'vd-tarjeta-estado');
    var apto = crear('div', 'vd-tarjeta-apto');
    var aptoRot = crear('small', '', 'Apartamento');
    var aptoNum = crear('b');
    apto.appendChild(aptoRot); apto.appendChild(aptoNum);
    var nombre = crear('div', 'vd-tarjeta-nombre');
    [dib, brillo, marca, estado, apto, nombre].forEach(function (n) { tarjeta.appendChild(n); });
    flota.appendChild(tarjeta); escena.appendChild(flota);
    resumen.parentNode.insertBefore(escena, resumen);

    function leer() {
      var fuerte = resumen.querySelector('strong');
      var cab = fuerte ? fuerte.textContent : '';
      var m = /^Apto\s+(.+?)\s+·\s+(.*)$/.exec(cab);
      if (!m) { escena.hidden = true; return; }
      var resto = resumen.textContent.replace(cab, '');
      var etiqueta = '', conSaldo = false;
      if (/Sin saldo pendiente/i.test(resto)) etiqueta = 'Al día';
      else if (/Saldo a favor/i.test(resto)) etiqueta = 'Saldo a favor';
      else if (/Saldo pendiente/i.test(resto)) { etiqueta = 'Con saldo'; conSaldo = true; }
      else { escena.hidden = true; return; }
      aptoNum.textContent = m[1];
      nombre.textContent = m[2];
      estado.textContent = etiqueta;
      tarjeta.classList.toggle('vd-saldo', conSaldo);
      escena.hidden = false;
    }
    new MutationObserver(leer).observe(resumen, { childList: true, subtree: true, characterData: true });
    leer();

    escena.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var r = tarjeta.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      tarjeta.style.transform = 'rotateX(' + ((0.5 - y) * 20).toFixed(1) + 'deg) rotateY(' + ((x - 0.5) * 26).toFixed(1) + 'deg)';
      tarjeta.style.setProperty('--vd-mx', (x * 100).toFixed(0) + '%');
      tarjeta.style.setProperty('--vd-my', (y * 100).toFixed(0) + '%');
    });
    escena.addEventListener('pointerleave', function () {
      tarjeta.style.transform = '';
      tarjeta.style.removeProperty('--vd-mx');
      tarjeta.style.removeProperty('--vd-my');
    });
  }

  // ------------------------------------------------------------------
  // 4. Estado de cuenta: aviso de "consultando" mientras responde el
  //    servidor. Solo observa; quien consulta sigue siendo
  //    js/estado-cuenta.js.
  // ------------------------------------------------------------------
  function avisoConsulta() {
    var btn = document.getElementById('btnEcConsultar');
    var login = document.getElementById('view-login');
    var vista = document.getElementById('view-estado');
    var alerta = document.getElementById('alert-ec-login');
    if (!btn || !login || !vista || !alerta || !btn.parentNode) return;

    var aviso = crear('div', 'vd-esqueleto');
    aviso.id = 'vd-consultando';
    aviso.hidden = true;
    aviso.setAttribute('role', 'status');
    aviso.appendChild(crear('i'));
    aviso.appendChild(crear('p', '', 'Consultando su estado de cuenta…'));
    btn.parentNode.insertBefore(aviso, btn.nextSibling);

    var reloj = null;
    function ocultar() { aviso.hidden = true; if (reloj) { clearTimeout(reloj); reloj = null; } }
    function mostrar() {
      // Se decide DESPUÉS de que el portal validó: si ya hay un aviso de error, no hay consulta.
      setTimeout(function () {
        if (alerta.textContent.trim() || login.classList.contains('hidden')) return;
        aviso.hidden = false;
        if (reloj) clearTimeout(reloj);
        reloj = setTimeout(ocultar, 30000);
      }, 0);
    }
    btn.addEventListener('click', mostrar);
    login.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') mostrar(); });
    var obs = new MutationObserver(function () {
      if (alerta.textContent.trim() || login.classList.contains('hidden') || !vista.classList.contains('hidden')) ocultar();
    });
    obs.observe(alerta, { childList: true, characterData: true, subtree: true, attributes: true });
    obs.observe(login, { attributes: true, attributeFilter: ['class'] });
    obs.observe(vista, { attributes: true, attributeFilter: ['class'] });
  }

  // ------------------------------------------------------------------
  // 5. Formulario de registro: navegación por pasos
  //    Usa el MISMO mecanismo del formulario (la clase "collapsed" de
  //    cada .section). No cambia validaciones, datos ni envío: todas
  //    las secciones siguen en la página y se pueden abrir a mano.
  // ------------------------------------------------------------------
  function pasos() {
    var form = document.getElementById('mainForm');
    if (!form || !form.parentNode) return;
    var secciones = Array.prototype.filter.call(form.querySelectorAll('.section'), function (s) {
      return !!s.querySelector('.section-head');
    });
    if (secciones.length < 3) return;

    var caja = crear('div', 'vd-pasos vd-no-imprimir');
    caja.id = 'vd-pasos';
    caja.setAttribute('role', 'navigation');
    caja.setAttribute('aria-label', 'Pasos del formulario');
    var fila = crear('div', 'vd-pasos-fila');
    var ant = crear('button', 'vd-pasos-ant', 'Anterior'); ant.type = 'button';
    var sig = crear('button', 'vd-pasos-sig', 'Siguiente'); sig.type = 'button';
    var texto = crear('div', 'vd-pasos-texto');
    var num = crear('b'); var tit = crear('span');
    texto.appendChild(num); texto.appendChild(tit);
    texto.setAttribute('aria-live', 'polite');
    fila.appendChild(ant); fila.appendChild(texto); fila.appendChild(sig);
    var barra = crear('div', 'vd-pasos-barra');
    barra.setAttribute('aria-hidden', 'true');
    var marcas = secciones.map(function () { var i = crear('i'); barra.appendChild(i); return i; });
    caja.appendChild(fila); caja.appendChild(barra);
    form.parentNode.insertBefore(caja, form);

    var actual = 0;
    function titulo(sec) {
      var cab = sec.querySelector('.section-head > span') || sec.querySelector('.section-head');
      var n = cab.querySelector('.section-num');
      var t = cab.textContent;
      if (n) t = t.replace(n.textContent, '');
      return t.replace(/\s+/g, ' ').trim();
    }
    function pintar() {
      num.textContent = 'Paso ' + (actual + 1) + ' de ' + secciones.length;
      tit.textContent = titulo(secciones[actual]);
      marcas.forEach(function (m, i) { m.classList.toggle('vd-hecho', i <= actual); });
      ant.disabled = actual === 0;
      sig.disabled = actual === secciones.length - 1;
    }
    function ir(n) {
      if (n < 0 || n >= secciones.length) return;
      actual = n;
      secciones.forEach(function (s, i) { s.classList.toggle('collapsed', i !== n); });
      pintar();
      var suave = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (secciones[n].scrollIntoView) secciones[n].scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
    }
    ant.addEventListener('click', function () { ir(actual - 1); });
    sig.addEventListener('click', function () { ir(actual + 1); });

    // Si la persona abre una sección a mano, el indicador la sigue.
    // (El formulario ya alternó la clase: su manejador se registró antes.)
    document.addEventListener('click', function (e) {
      var cab = e.target && e.target.closest ? e.target.closest('.section-head') : null;
      if (!cab) return;
      var i = secciones.indexOf(cab.closest('.section'));
      if (i >= 0 && !secciones[i].classList.contains('collapsed')) { actual = i; pintar(); }
    });
    pintar();
  }

  // ------------------------------------------------------------------
  // 6. Precalentado: una consulta "ping" de solo lectura para que el
  //    backend ya esté despierto cuando la persona haga su primera
  //    consulta real. Como mucho una vez cada 4 minutos por pestaña.
  // ------------------------------------------------------------------
  function precalentar() {
    if (!PRECALENTAR || !window.CA_CONFIG || !window.CA_CONFIG.url || !window.fetch) return;
    var ahora = Date.now();
    try {
      var ultimo = parseInt(sessionStorage.getItem('vd-ping') || '0', 10);
      if (ahora - ultimo < 240000) return;
      sessionStorage.setItem('vd-ping', String(ahora));
    } catch { /* sin sessionStorage: se hace igual */ }
    setTimeout(function () {
      fetch(window.CA_CONFIG.url + '?action=ping', { mode: 'no-cors', cache: 'no-store' }).catch(function () {});
    }, 1200);
  }

  // ------------------------------------------------------------------
  // 7. Formulario: abrir una pestaña desde el enlace
  //    formulario.html#editar y formulario.html#mudanzas pulsan la
  //    pestaña correspondiente con el manejador propio de la página
  //    (el mismo clic que haría la persona). Sin "#" no hace nada.
  // ------------------------------------------------------------------
  function pestanaPorEnlace() {
    var MODOS = { '#crear': 'create', '#editar': 'edit', '#mudanzas': 'mudanzas' };
    function aplicar() {
      var modo = MODOS[String(location.hash || '').toLowerCase()];
      if (!modo) return;
      var tab = document.querySelector('.mode-tab[data-mode="' + modo + '"]');
      if (tab && !tab.classList.contains('active')) tab.click();
    }
    if (!document.querySelector('.mode-tab[data-mode]')) return;
    aplicar();
    window.addEventListener('hashchange', aplicar);
  }

  function iniciar() {
    seguro('botonInicio', botonInicio);
    seguro('torres', torres);
    seguro('tarjetaEstado', tarjetaEstado);
    seguro('avisoConsulta', avisoConsulta);
    seguro('pasos', pasos);
    seguro('pestanaPorEnlace', pestanaPorEnlace);
    seguro('precalentar', precalentar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
