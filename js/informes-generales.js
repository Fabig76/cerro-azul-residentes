// ============================================================
// Informes generales (informes-generales.html) — solo propietarios.
// Ingreso con N° de formulario + apartamento + cédula del propietario
// (misma verificación y bloqueo por intentos del estado de cuenta).
// Flujo: íconos → Actas de asamblea → año → lista de PDF → Descargar.
// Los PDF están en una carpeta PRIVADA de Drive; el backend los entrega
// en base64 solo después de verificar (acciones igListarActas e
// igDescargarActa). Las credenciales viven solo en memoria: al recargar
// la página se vuelve a pedir el ingreso.
// ============================================================
(function () {
  'use strict';

  let cred = null;     // { numForm, apto, ccProp } — solo en memoria
  let datos = null;    // respuesta de igListarActas

  const $ = (s) => document.querySelector(s);

  function alerta(id, msg) {
    const el = $(id);
    if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.className = 'alert alert-error';
    el.textContent = msg;
  }

  function fechaLarga(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return parseInt(m[3], 10) + ' de ' + meses[parseInt(m[2], 10) - 1] + ' de ' + m[1];
  }

  function tamano(kb) {
    return kb >= 1024 ? (kb / 1024).toFixed(1).replace('.', ',') + ' MB' : kb + ' KB';
  }

  // ---------- Navegación ----------
  function migas(pasos) {
    const nav = $('#igMigas');
    nav.textContent = '';
    pasos.forEach(function (p, i) {
      if (i > 0) { const sep = document.createElement('i'); sep.textContent = '›'; nav.appendChild(sep); }
      if (p.ir) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = p.txt; b.addEventListener('click', p.ir);
        nav.appendChild(b);
      } else {
        const b = document.createElement('b'); b.textContent = p.txt; nav.appendChild(b);
      }
    });
  }

  function mostrar(id) {
    ['#ig-hub', '#ig-anios', '#ig-lista'].forEach(function (v) { $(v).classList.toggle('hidden', v !== id); });
    alerta('#ig-alert-app', '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function irHub() {
    migas([{ txt: 'Informes generales' }]);
    mostrar('#ig-hub');
  }

  function irAnios() {
    migas([{ txt: 'Informes generales', ir: irHub }, { txt: 'Actas de asamblea' }]);
    const cont = $('#igAnios');
    cont.textContent = '';
    if (!datos.anios.length) {
      const p = document.createElement('p');
      p.className = 'ig-vacio'; p.textContent = 'Aún no hay actas publicadas.';
      cont.appendChild(p);
    }
    datos.anios.forEach(function (a) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ig-anio' + (a.actas.length ? '' : ' vacio');
      const n = document.createElement('b'); n.textContent = a.anio;
      const s = document.createElement('span');
      s.textContent = a.actas.length === 1 ? '1 acta' : (a.actas.length ? a.actas.length + ' actas' : 'Sin actas todavía');
      b.appendChild(n); b.appendChild(s);
      b.addEventListener('click', function () { irLista(a.anio); });
      cont.appendChild(b);
    });
    mostrar('#ig-anios');
  }

  function irLista(anio) {
    const a = datos.anios.find(function (x) { return x.anio === anio; });
    migas([{ txt: 'Informes generales', ir: irHub }, { txt: 'Actas de asamblea', ir: irAnios }, { txt: anio }]);
    $('#igListaTitulo').textContent = 'Actas de asamblea ' + anio;
    const ul = $('#igActas');
    ul.textContent = '';
    if (!a || !a.actas.length) {
      const li = document.createElement('li');
      li.className = 'ig-vacio';
      li.textContent = 'Aún no hay actas publicadas de ' + anio + '. Se publican cuando están firmadas y aprobadas.';
      ul.appendChild(li);
    } else {
      a.actas.forEach(function (acta) {
        const li = document.createElement('li');
        li.className = 'ig-acta';
        const ico = document.createElement('span'); ico.className = 'ig-pdf'; ico.textContent = 'PDF'; ico.setAttribute('aria-hidden', 'true');
        const txt = document.createElement('span'); txt.className = 'ig-acta-txt';
        const t = document.createElement('strong'); t.textContent = acta.titulo;
        const d = document.createElement('span'); d.textContent = 'Publicada el ' + fechaLarga(acta.fecha) + ' · ' + tamano(acta.kb);
        txt.appendChild(t); txt.appendChild(d);
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn-primary btn-sm'; btn.textContent = 'Descargar';
        btn.addEventListener('click', function () { descargar(acta, btn); });
        li.appendChild(ico); li.appendChild(txt); li.appendChild(btn);
        ul.appendChild(li);
      });
    }
    mostrar('#ig-lista');
  }

  // ---------- Backend ----------
  async function ingresar() {
    const numForm = $('#igNumForm').value.trim().toUpperCase();
    const apto = $('#igApto').value.trim();
    const ccProp = $('#igCc').value.replace(/\D/g, '');
    if (!numForm || !apto || !ccProp) { alerta('#ig-alert', 'Complete los tres datos.'); return; }
    const btn = $('#btnIgIngresar');
    btn.disabled = true; btn.textContent = 'Verificando...';
    alerta('#ig-alert', '');
    try {
      const r = await CA.api({ action: 'igListarActas', numForm: numForm, apto: apto, ccProp: ccProp });
      if (!r || !r.ok) { alerta('#ig-alert', (r && r.error) || 'No se pudo verificar.'); return; }
      cred = { numForm: numForm, apto: apto, ccProp: ccProp };
      datos = r;
      $('#igUsuario').textContent = 'Apto ' + (r.apto || apto) + (r.nombreProp ? ' · ' + r.nombreProp : '');
      $('#ig-login').classList.add('hidden');
      $('#ig-app').classList.remove('hidden');
      irHub();
    } catch (e) {
      alerta('#ig-alert', e.message || String(e));
    } finally {
      btn.disabled = false; btn.textContent = 'Ingresar';
    }
  }

  async function descargar(acta, btn) {
    if (!cred) return;
    const txt = btn.textContent;
    btn.disabled = true; btn.textContent = 'Descargando...';
    try {
      const r = await CA.api({ action: 'igDescargarActa', numForm: cred.numForm, apto: cred.apto, ccProp: cred.ccProp, fileId: acta.id }, { timeoutMs: 90000 });
      if (!r || !r.ok) { alerta('#ig-alert-app', (r && r.error) || 'No se pudo descargar.'); return; }
      guardarPdf(r.base64, r.nombreArchivo || (acta.titulo + '.pdf'));
    } catch (e) {
      alerta('#ig-alert-app', 'No se pudo descargar: ' + (e.message || e));
    } finally {
      btn.disabled = false; btn.textContent = txt;
    }
  }

  function guardarPdf(base64, nombre) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function salir() {
    cred = null; datos = null;
    $('#igCc').value = '';
    $('#ig-app').classList.add('hidden');
    $('#ig-login').classList.remove('hidden');
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('#ig-login')) return;
    $('#btnIgIngresar').addEventListener('click', ingresar);
    ['#igNumForm', '#igApto', '#igCc'].forEach(function (s) {
      $(s).addEventListener('keydown', function (e) { if (e.key === 'Enter') ingresar(); });
    });
    $('#btnIgSalir').addEventListener('click', salir);
    document.querySelector('[data-ig-ir="actas"]').addEventListener('click', irAnios);
  });
})();
