// =====================================================================
// Cerro Azul — Cargador de Cartera (Fase 3)
// Spec: docs/spec-estado-cuenta.md §7
// Reqs: APPS_SCRIPT_URL (misma que js/admin.js línea 6).
// Deps: pdfjsLib, PDFLib, XLSX (cargados en cartera-admin.html) +
//       parsearCartera, leerPdf, agruparFacturas, cruzar, subirFacturas
//       (cargados desde js/cartera-procesador.js).
// Estado sensible (_password, _pdfBuffer) vive SOLO en memoria.
// =====================================================================

(function () {
  'use strict';

  // ---- Estado en memoria (NO sessionStorage, NO localStorage) ----
  let _password = null;
  let _analisis = null;   // { pc, grupos, paginas } después de analizar()
  let _pdfBuffer = null;  // ArrayBuffer del PDF (copia para la subida)
  let _publicando = false;

  // APPS_SCRIPT_URL: copiar el valor EXACTO de js/admin.js línea 6
  const URL = 'https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec';

  // ==================== LOGIN =====================================
  async function login() {
    clearAlert();
    const pwd = $('#loginPassword').value;
    if (!pwd) { alertErr('Ingresá la contraseña.'); return; }
    try {
      const r = await fetch(URL + '?action=adminLogin&password=' + encodeURIComponent(pwd));
      const j = await r.json();
      if (!j.ok) { alertErr('Contraseña incorrecta.'); return; }
      _password = pwd;
      $('#loginPassword').value = '';
      showView('view-carga');
    } catch (e) {
      alertErr('No se pudo conectar con el servidor: ' + e.message);
    }
  }

  // ==================== ANALIZAR (en el navegador, sin enviar) =====
  async function analizar() {
    clearAlert();
    _analisis = null;
    $('#resumenAnalisis').classList.add('hidden');
    $('#btnPublicar').classList.add('hidden');
    $('#btnPublicar').disabled = true;

    const fileC = $('#fileCartera').files[0];
    const fileP = $('#filePdf').files[0];
    if (!fileC || !fileP) { alertErr('Seleccioná ambos archivos.'); return; }

    let pc, paginas, grupos, cr, pdfBuf;
    try {
      // 0) Mostrar feedback inmediato (el PDF de 625 páginas tarda ~1-3 min)
      $('#progreso').classList.remove('hidden');
      $('#progresoTexto').textContent = 'Analizando cartera (Excel)...';
      $('#progresoBarra').value = 0;
      console.log('[cartera-admin] Iniciando análisis...');

      // 1) Parsear Excel
      const wb = XLSX.read(await fileC.arrayBuffer(), { type: 'array' });
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      pc = parsearCartera(filas);
      console.log('[cartera-admin] Excel parseado: ' + pc.aptos.length + ' aptos, pestaña=' + pc.nombrePestana);

      // 2) Leer PDF (con progreso visible)
      $('#progresoTexto').textContent = 'Analizando facturas (PDF)...';
      pdfBuf = await fileP.arrayBuffer();
      paginas = await leerPdf(pdfBuf, function (pag, total) {
        if (pag % 25 === 0 || pag === total) {
          $('#progresoTexto').textContent = 'Analizando facturas: página ' + pag + ' de ' + total;
          $('#progresoBarra').value = Math.round(100 * pag / total);
        }
      });
      console.log('[cartera-admin] PDF leído: ' + paginas.length + ' páginas');

      // 3) Agrupar y cruzar (tira Error si ref repetida)
      grupos = agruparFacturas(paginas);
      cr = cruzar(pc.aptos, grupos);
      console.log('[cartera-admin] Grupos=' + grupos.length + ', soloCartera=' + cr.soloCartera.length + ', soloPdf=' + cr.soloPdf.length);

      // 4) BLOQUEANTES: campos null o discrepancias
      const CAMPOS = ['ref','numCuentaCobro','fechaEmision','pagueseHasta',
                      'totalAPagar','abonoUltimoMes','anticipos','subTotal','saldoAnterior'];
      const conNull = paginas.filter(function (p) {
        return CAMPOS.some(function (k) { return p[k] === null; });
      });
      if (conNull.length) {
        throw new Error(conNull.length + ' página(s) con campos incompletos: ' +
                        conNull.slice(0, 5).map(function (p) { return p.page; }).join(', '));
      }
      if (cr.soloCartera.length) {
        throw new Error('En cartera pero no en PDF: ' + cr.soloCartera.slice(0, 10).join(', '));
      }
      if (cr.soloPdf.length) {
        throw new Error('En PDF pero no en cartera: ' + cr.soloPdf.slice(0, 10).join(', '));
      }
    } catch (e) {
      console.error('[cartera-admin] ERROR en análisis:', e.message, e.stack);
      $('#progreso').classList.add('hidden');
      alertErr(e.message || String(e));
      return;
    }

    // 5) AVISOS (no bloquean)
    const warns = [];
    // Mes de emisión vs mes siguiente a fecha de corte
    var mesEmision = paginas[0].fechaEmision ? paginas[0].fechaEmision.split('.')[1] : '';
    var mesCorte = pc.fechaCorte ? pc.fechaCorte.split('-')[1] : '';
    if (mesEmision && mesCorte && mesEmision !== mesSiguiente(mesCorte)) {
      warns.push('El PDF es del mes ' + mesEmision + ' pero la cartera tiene corte en mes ' + mesCorte + '.');
    }
    const multiPag = grupos.filter(function (g) { return g.paginas.length > 1; }).length;
    if (multiPag > 0) warns.push(multiPag + ' factura(s) ocupan varias páginas.');

    // 6) Guardar análisis para "Publicar"
    _analisis = { pc: pc, grupos: grupos, paginas: paginas };
    _pdfBuffer = pdfBuf.slice(0);  // copia para la subida (leerPdf hace su propia copia)

    // 7) Renderizar resumen
    var fechasEmision = Array.from(new Set(paginas.map(function (p) { return p.fechaEmision; })));
    var html = '';
    html += '<h3>Resumen del análisis</h3>';
    html += '<ul>';
    html += '<li>Pestaña a crear: <b>' + escapeHtml(pc.nombrePestana) + '</b></li>';
    html += '<li>Fecha de corte: <b>' + escapeHtml(pc.fechaCorte) + '</b></li>';
    html += '<li>Aptos en cartera: <b>' + pc.aptos.length + '</b></li>';
    html += '<li>Facturas en PDF: <b>' + grupos.length + '</b></li>';
    html += '<li>Fechas de emisión: <b>' + fechasEmision.map(escapeHtml).join(', ') + '</b></li>';
    html += '</ul>';
    if (warns.length) {
      html += '<div class="alert alert-warn">' + warns.map(escapeHtml).join('<br>') + '</div>';
    }
    $('#resumenAnalisis').innerHTML = html;
    $('#resumenAnalisis').classList.remove('hidden');
    $('#btnPublicar').classList.remove('hidden');
    $('#btnPublicar').disabled = false;
    $('#progreso').classList.add('hidden');
    $('#progresoTexto').textContent = '';
    $('#progresoBarra').value = 0;
    console.log('[cartera-admin] Análisis completo. Resumen renderizado.');
  }

  // ==================== PUBLICAR ==================================
  async function publicar() {
    if (!_analisis || _publicando) return;
    _publicando = true;
    $('#btnPublicar').disabled = true;
    window.onbeforeunload = function () { return 'Hay una subida en curso. ¿Cerrar la pestaña?'; };

    var pc = _analisis.pc;
    var grupos = _analisis.grupos;
    try {
      // 1) ecIniciarCarga: crea pestaña en Sheet + carpeta en Drive
      var ini = await post({
        action: 'ecIniciarCarga',
        password: _password,
        periodo: pc.periodo,
        nombrePestana: pc.nombrePestana,
        fechaCorte: pc.fechaCorte,
        filas: pc.filasLimpias,
        pagos: grupos.map(function (g) {
          return {
            apto: g.apto,
            numCuentaCobro: g.datos.numCuentaCobro,
            fechaEmision: g.datos.fechaEmision,
            pagueseHasta: g.datos.pagueseHasta,
            abonoUltimoMes: g.datos.abonoUltimoMes,
            totalAPagar: g.datos.totalAPagar,
            saldoAnterior: g.datos.saldoAnterior,
            anticipos: g.datos.anticipos,
          };
        }),
        reemplazar: false,
      });
      if (!ini.ok) {
        if (ini.codigo === 'PESTANA_EXISTE') {
          if (!confirm('La pestaña "' + pc.nombrePestana + '" ya existe. ¿Reemplazarla?')) {
            throw new Error('Cancelado por el operador.');
          }
          ini = await post({
            action: 'ecIniciarCarga',
            password: _password,
            periodo: pc.periodo,
            nombrePestana: pc.nombrePestana,
            fechaCorte: pc.fechaCorte,
            filas: pc.filasLimpias,
            pagos: grupos.map(function (g) {
              return {
                apto: g.apto,
                numCuentaCobro: g.datos.numCuentaCobro,
                fechaEmision: g.datos.fechaEmision,
                pagueseHasta: g.datos.pagueseHasta,
                abonoUltimoMes: g.datos.abonoUltimoMes,
                totalAPagar: g.datos.totalAPagar,
                saldoAnterior: g.datos.saldoAnterior,
                anticipos: g.datos.anticipos,
              };
            }),
            reemplazar: true,
          });
          if (!ini.ok) throw new Error(ini.error);
        } else {
          throw new Error(ini.error);
        }
      }

      // 2) ecSubirFacturas en lotes de 10 (3 reintentos, manejados por subirFacturas)
      await subirFacturas(_pdfBuffer, grupos, ini.idCarga, _password, post, function (hechos, total) {
        $('#progreso').classList.remove('hidden');
        $('#progresoTexto').textContent = 'Subidas: ' + hechos + '/' + total + ' (' + Math.round(100 * hechos / total) + '%)';
        $('#progresoBarra').value = 100 * hechos / total;
      });

      // 3) ecFinalizarCarga: valida count + cambia estados
      var fin = await post({ action: 'ecFinalizarCarga', password: _password, idCarga: ini.idCarga });
      if (!fin.ok) throw new Error(fin.error);

      alertOk('Publicado: ' + fin.pestana + ', ' + fin.facturas + ' facturas.');
      _analisis = null;
      _pdfBuffer = null;
    } catch (e) {
      alertErr('Error al publicar: ' + (e.message || e));
    } finally {
      _publicando = false;
      $('#btnPublicar').disabled = false;
      window.onbeforeunload = null;
    }
  }

  // ==================== SALIR =====================================
  function salir() {
    _password = null;
    _analisis = null;
    _pdfBuffer = null;
    $('#loginPassword').value = '';
    $('#fileCartera').value = '';
    $('#filePdf').value = '';
    $('#resumenAnalisis').classList.add('hidden');
    $('#btnPublicar').classList.add('hidden');
    $('#progreso').classList.add('hidden');
    showView('view-login');
  }

  // ==================== HELPERS ==================================
  async function post(payload) {
    var r = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
    });
    return await r.json();
  }

  function $(s) { return document.querySelector(s); }

  function showView(id) {
    $('#view-login').classList.toggle('hidden', id !== 'view-login');
    $('#view-carga').classList.toggle('hidden', id !== 'view-carga');
  }

  // Devuelve el elemento #alert de la vista actualmente visible.
  // La vista login tiene #alert; la vista carga tiene #alertCarga.
  function $alert() {
    var v = $('#view-carga');
    if (v && !v.classList.contains('hidden')) return $('#alertCarga');
    return $('#alert');
  }

  function alertOk(m)  { var a = $alert(); a.className = 'alert alert-ok';  a.textContent = m; }
  function alertErr(m) { var a = $alert(); a.className = 'alert alert-err'; a.textContent = m; }
  function clearAlert() { $('#alert').className = ''; $('#alert').textContent = ''; $('#alertCarga').className = ''; $('#alertCarga').textContent = ''; }

  // escapeHtml: misma firma que js/admin.js (usada para inyectar HTML del resumen)
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function mesSiguiente(mes) {
    var m = parseInt(mes, 10);
    return String((m % 12) + 1).padStart(2, '0');
  }

  // ==================== INIT =====================================
  document.addEventListener('DOMContentLoaded', function () {
    $('#btnLogin').onclick = login;
    $('#btnAnalizar').onclick = analizar;
    $('#btnPublicar').onclick = publicar;
    $('#btnSalir').onclick = salir;
    $('#loginPassword').addEventListener('keypress', function (e) {
      if (e.key === 'Enter') login();
    });
  });
})();
