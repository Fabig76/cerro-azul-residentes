// ============================================================
// Recuperar N° de formulario (portada, index.html).
// 1) Pide solo el N° de apartamento (sin torre).
// 2) Muestra el correo registrado PARCIALMENTE OCULTO y pregunta si es el suyo.
// 3) "Sí" → el backend envía el N° de formulario a ese correo.
//    "No" → indica comunicarse con la administración.
// El código y el correo completo nunca llegan al navegador.
// Otras páginas abren esta ventana con el enlace index.html#recuperar.
// ============================================================
(function () {
  'use strict';
  let aptoActual = '';
  const $ = (s) => document.getElementById(s);

  function alerta(id, msg) {
    const el = $(id);
    if (!msg) { el.className = 'alert hidden'; el.textContent = ''; return; }
    el.className = 'alert alert-error';
    el.textContent = msg;
  }

  function paso(id) {
    ['rcPaso1', 'rcPaso2', 'rcListo', 'rcAdmin'].forEach(function (p) { $(p).classList.toggle('hidden', p !== id); });
  }

  function abrir() {
    aptoActual = '';
    $('rcApto').value = '';
    alerta('rcAlerta1', ''); alerta('rcAlerta2', '');
    paso('rcPaso1');
    $('rcModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('rcApto').focus(); }, 50);
  }

  function cerrar() {
    $('rcModal').classList.add('hidden');
    document.body.style.overflow = '';
    if (location.hash === '#recuperar') history.replaceState(null, '', location.pathname + location.search);
  }

  function admin(titulo, texto) {
    $('rcAdminTitulo').textContent = titulo;
    $('rcAdminTexto').textContent = texto;
    paso('rcAdmin');
  }

  async function buscar() {
    const apto = $('rcApto').value.replace(/[.,\s-]/g, '').trim();
    if (!/^\d{2,5}[A-Za-z]?$/.test(apto)) {
      alerta('rcAlerta1', 'Escriba solo el número del apartamento, sin la torre. Ejemplo: 402.');
      return;
    }
    const btn = $('rcBuscar');
    btn.disabled = true; btn.textContent = 'Buscando...';
    alerta('rcAlerta1', '');
    try {
      const r = await CA.api({ action: 'rcConsultar', apto: apto });
      if (!r || !r.ok) { alerta('rcAlerta1', (r && r.error) || 'No se pudo consultar. Intente de nuevo.'); return; }
      if (!r.encontrado) {
        admin('No encontramos un registro para el apartamento ' + apto,
          'Revise el número (sin la torre). Si es correcto, puede que el apartamento aún no tenga registro: comuníquese con la administración.');
        return;
      }
      if (r.sinCorreo) {
        admin('Este apartamento no tiene un correo válido registrado',
          'Para proteger sus datos, el código solo se envía al correo registrado. La administración le ayuda a recuperarlo y a corregir el correo.');
        return;
      }
      aptoActual = apto;
      $('rcCorreo').textContent = r.correoOculto;
      alerta('rcAlerta2', '');
      paso('rcPaso2');
    } catch {
      alerta('rcAlerta1', 'No se pudo conectar. Revise su internet e intente de nuevo.');
    } finally {
      btn.disabled = false; btn.textContent = 'Buscar';
    }
  }

  async function enviar() {
    if (!aptoActual) return;
    const btn = $('rcSi');
    btn.disabled = true; btn.textContent = 'Enviando...';
    alerta('rcAlerta2', '');
    try {
      const r = await CA.api({ action: 'rcEnviar', apto: aptoActual });
      if (!r || !r.ok) { alerta('rcAlerta2', (r && r.error) || 'No se pudo enviar. Intente de nuevo.'); return; }
      $('rcCorreoListo').textContent = r.correoOculto || $('rcCorreo').textContent;
      paso('rcListo');
    } catch {
      alerta('rcAlerta2', 'No se pudo conectar. Revise su internet e intente de nuevo.');
    } finally {
      btn.disabled = false; btn.textContent = 'Sí, enviarlo';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('rcModal')) return;
    $('rcAbrir').addEventListener('click', abrir);
    $('rcCerrar').addEventListener('click', cerrar);
    $('rcCerrarListo').addEventListener('click', cerrar);
    $('rcBuscar').addEventListener('click', buscar);
    $('rcApto').addEventListener('keydown', function (e) { if (e.key === 'Enter') buscar(); });
    $('rcSi').addEventListener('click', enviar);
    $('rcNo').addEventListener('click', function () {
      admin('Comuníquese con la administración',
        'Si el correo que aparece no es el suyo, la administración le ayuda a recuperar el código y a actualizar el correo del registro.');
    });
    $('rcVolver').addEventListener('click', function () { paso('rcPaso1'); });
    $('rcModal').addEventListener('click', function (e) { if (e.target === $('rcModal')) cerrar(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('rcModal').classList.contains('hidden')) cerrar(); });
    if (location.hash === '#recuperar') abrir();
  });
})();
