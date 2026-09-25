// =====================================================================
// Cerro Azul — Portal de Estado de Cuenta (Fase 4)
// Spec: docs/spec-estado-cuenta.md §8
// Reqs: APPS_SCRIPT_URL (misma que js/admin.js línea 6).
// Sin librerías externas. Solo el script propio.
// Estado sensible (_credenciales) vive SOLO en memoria.
// =====================================================================

(function () {
  'use strict';

  // Estado en memoria (NO sessionStorage, NO localStorage)
  let _credenciales = null;  // { numForm, apto, ccProp }

  // APPS_SCRIPT_URL: copiar el valor EXACTO de js/admin.js línea 6
  const URL = 'https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec';

  // ==================== CONSULTAR ==================================
  async function consultar() {
    clearAlerts();
    const numForm = $('#ecNumForm').value.trim();
    const apto = $('#ecApto').value.trim();
    const ccProp = $('#ecCc').value.replace(/[^0-9]/g, '');  // limpiar cédula

    // Validación cliente (igual al módulo de mudanzas)
    if (!numForm) { alertLoginErr('Ingresá el N° de formulario.'); return; }
    if (!apto) { alertLoginErr('Ingresá el N° de apartamento.'); return; }
    if (!ccProp) { alertLoginErr('Ingresá la cédula del propietario.'); return; }

    try {
      const j = await post({ action: 'ecConsultar', numForm: numForm, apto: apto, ccProp: ccProp });
      if (!j.ok) { alertLoginErr(j.error || 'No se pudo consultar.'); return; }

      _credenciales = { numForm: numForm, apto: apto, ccProp: ccProp };
      renderEstado(j);
      showView('view-estado');
    } catch (e) {
      alertLoginErr('No se pudo conectar con el servidor: ' + (e.message || e));
    }
  }

  // ==================== RENDER =====================================
  function renderEstado(j) {
    const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    // --- #ecResumen ---
    var resumen = '<strong>Apto ' + escapeHtml(j.apto) + ' · ' + escapeHtml(j.nombrePropietario) + '</strong><br>';
    if (j.cartera.totalCartera > 0) {
      resumen += 'Saldo pendiente al ' + fechaLarga(j.fechaCorte) + ': ' + cop.format(j.cartera.totalCartera);
    } else if (j.cartera.totalCartera < 0) {
      resumen += 'Saldo a favor al ' + fechaLarga(j.fechaCorte) + ': ' + cop.format(Math.abs(j.cartera.totalCartera));
    } else {
      resumen += 'Sin saldo pendiente al ' + fechaLarga(j.fechaCorte) + '.';
    }
    resumen += '<br>Cuota de administración mensual: ' + cop.format(j.cartera.valorAdmon);
    $('#ecResumen').innerHTML = resumen;

    // --- #ecConceptos ---
    var conceptos = j.cartera.conceptos.filter(function (c) { return c.valor !== 0; });
    if (j.cartera.anticipos !== 0) {
      conceptos.push({ nombre: 'Anticipos (a favor)', valor: Math.abs(j.cartera.anticipos) });
    }
    var htmlConc = '<h3>Detalle por concepto</h3>';
    if (conceptos.length) {
      htmlConc += '<table><thead><tr><th>Concepto</th><th>Valor</th></tr></thead><tbody>';
      conceptos.forEach(function (c) {
        htmlConc += '<tr><td>' + escapeHtml(c.nombre) + '</td><td>' + cop.format(c.valor) + '</td></tr>';
      });
      htmlConc += '</tbody></table>';
    } else {
      htmlConc += '<p>No registra conceptos pendientes.</p>';
    }
    if (j.cartera.mesesProm > 0) {
      htmlConc += '<p>Meses prom. (según contabilidad): ' + j.cartera.mesesProm + '</p>';
    }
    $('#ecConceptos').innerHTML = htmlConc;

    // --- #ecFactura ---
    if (j.factura) {
      $('#ecFactura').innerHTML =
        'Cuenta de cobro N° ' + escapeHtml(j.factura.numCuentaCobro) +
        ' · Emitida ' + fechaDMA(j.factura.fechaEmision) +
        ' · Páguese hasta ' + fechaDMA(j.factura.pagueseHasta) +
        ' · Total a pagar ' + cop.format(j.factura.totalAPagar);
    } else {
      $('#ecFactura').innerHTML = '';
    }

    // --- Botones ---
    toggle('#btnEcFactura', j.facturaDisponible);
    toggle('#btnEcPagar', !!j.linkPago);
    if (j.linkPago) {
      $('#btnEcPagar').onclick = function () { window.open(j.linkPago, '_blank', 'noopener'); };
    }

    // --- #ecPagos ---
    var htmlPagos = '<h3>Últimos pagos</h3>';
    if (j.pagos.length) {
      htmlPagos += '<ul>';
      j.pagos.forEach(function (p) {
        htmlPagos += '<li>' + periodoLargo(p.periodo) + ': ' +
          (p.abono === 0 ? 'sin abonos registrados' : cop.format(p.abono)) + '</li>';
      });
      htmlPagos += '</ul><p class="nota">Corresponde al valor "Abono último mes" reportado en la cuenta de cobro de cada periodo.</p>';
    } else {
      htmlPagos += '<p>Aún no hay historial de pagos.</p>';
    }
    $('#ecPagos').innerHTML = htmlPagos;

    // --- #btnEcPys + #ecPysNota ---
    toggle('#btnEcPys', j.pazYSalvoHabilitado);
    $('#ecPysNota').textContent = j.pazYSalvoHabilitado ? '' : 'El paz y salvo estará disponible cuando el saldo esté al día.';
  }

  // ==================== DESCARGAS =================================
  async function descargarFactura() {
    if (!_credenciales) return;
    deshabilitar('#btnEcFactura', 'Generando...');
    try {
      const j = await post({ action: 'ecDescargarFactura', numForm: _credenciales.numForm, apto: _credenciales.apto, ccProp: _credenciales.ccProp });
      if (!j.ok) { alertErr(j.error); return; }
      descargarBase64(j.base64, j.nombreArchivo);
    } catch (e) {
      alertErr('No se pudo descargar: ' + (e.message || e));
    } finally {
      habilitar('#btnEcFactura', 'Descargar mi factura');
    }
  }

  async function descargarPazYSalvo() {
    if (!_credenciales) return;
    deshabilitar('#btnEcPys', 'Generando...');
    try {
      const j = await post({ action: 'ecPazYSalvo', numForm: _credenciales.numForm, apto: _credenciales.apto, ccProp: _credenciales.ccProp });
      if (!j.ok) { alertErr(j.error); return; }
      descargarBase64(j.base64, j.nombreArchivo);
    } catch (e) {
      alertErr('No se pudo descargar: ' + (e.message || e));
    } finally {
      habilitar('#btnEcPys', 'Descargar paz y salvo');
    }
  }

  // ==================== SALIR =====================================
  function salir() {
    _credenciales = null;
    $('#ecNumForm').value = '';
    $('#ecApto').value = '';
    $('#ecCc').value = '';
    $('#ecResumen').innerHTML = '';
    $('#ecConceptos').innerHTML = '';
    $('#ecFactura').innerHTML = '';
    $('#ecPagos').innerHTML = '';
    $('#ecPysNota').textContent = '';
    clearAlerts();
    showView('view-login');
  }

  // ==================== HELPERS ==================================
  function post(payload) {
    return fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
    }).then(function (r) { return r.json(); });
  }

  function $(s) { return document.querySelector(s); }
  function toggle(sel, on) { document.querySelector(sel).classList.toggle('hidden', !on); }

  function showView(id) {
    $('#view-login').classList.toggle('hidden', id !== 'view-login');
    $('#view-estado').classList.toggle('hidden', id !== 'view-estado');
  }

  function alertLoginErr(m) { var a = $('#alert-ec-login'); a.className = 'alert alert-err'; a.textContent = m; }
  function alertErr(m) { var a = $('#alert-ec'); a.className = 'alert alert-err'; a.textContent = m; }
  function clearAlerts() {
    $('#alert-ec-login').className = ''; $('#alert-ec-login').textContent = '';
    $('#alert-ec').className = ''; $('#alert-ec').textContent = '';
  }

  function deshabilitar(sel, texto) {
    var b = document.querySelector(sel);
    b.dataset.originalText = b.textContent;
    b.textContent = texto;
    b.disabled = true;
  }
  function habilitar(sel, texto) {
    var b = document.querySelector(sel);
    b.textContent = texto || b.dataset.originalText || b.textContent;
    b.disabled = false;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fechaLarga(iso) {  // "2026-08-31" → "31 de agosto de 2026"
    if (!iso) return '';
    const p = String(iso).split('-');
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return parseInt(p[2], 10) + ' de ' + MESES[parseInt(p[1], 10) - 1] + ' de ' + p[0];
  }
  function fechaDMA(f) {  // "2026.09.01" → "01/09/2026"
    if (!f) return '';
    const p = String(f).split('.');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function periodoLargo(p) {  // "2026-08" → "Agosto 2026"
    if (!p) return '';
    const q = String(p).split('-');
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const mes = MESES[parseInt(q[1], 10) - 1];
    return mes.charAt(0).toUpperCase() + mes.slice(1) + ' ' + q[0];
  }

  // ==================== INIT =====================================
  document.addEventListener('DOMContentLoaded', function () {
    $('#btnEcConsultar').onclick = consultar;
    $('#btnEcFactura').onclick = descargarFactura;
    $('#btnEcPys').onclick = descargarPazYSalvo;
    $('#btnEcSalir').onclick = salir;
    $('#ecCc').addEventListener('keypress', function (e) {
      if (e.key === 'Enter') consultar();
    });
  });
})();
