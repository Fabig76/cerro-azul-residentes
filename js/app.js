/* ============================================================
   Cerro Azul — Lógica del formulario público
   ============================================================ */

// URL del Web App de Google Apps Script (la inyecta Fabio manualmente al desplegar)
// Para desarrollo local se puede dejar vacía y el modo "simular" está disponible
const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || '';

// Constantes de UI
const $  = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));

// ---------- Estado global ----------
const state = {
  mode: 'create',           // 'create' | 'edit'
  editLookup: null,         // datos previos cuando se carga una fila
  numForm: '',              // se asigna al crear, viene dado al editar
  submitting: false,
};

// ---------- Helpers ----------
function val(field) {
  const el = $(field);
  return el ? el.value.trim() : '';
}
function setVal(field, v) {
  const el = $(field);
  if (el) el.value = v == null ? '' : v;
}
function checked(name) {
  return $(`[name="${name}"]`) ? $(`[name="${name}"]`).checked : false;
}
function setChecked(name, v) {
  const el = $(`[name="${name}"]`);
  if (el) el.checked = !!v;
}
function showError(field, msg) {
  const wrap = $(field).closest('.field');
  if (!wrap) return;
  wrap.classList.add('has-error');
  const errEl = wrap.querySelector('.err-msg');
  if (errEl && msg) errEl.textContent = msg;
}
function clearError(field) {
  const wrap = $(field).closest('.field');
  if (wrap) wrap.classList.remove('has-error');
}
function clearAllErrors() { $$('.field.has-error').forEach(f => f.classList.remove('has-error')); }

function setRadio(name, value) {
  const els = $$(`[name="${name}"]`);
  els.forEach(el => { if (el.value === value) el.checked = true; });
}
function getRadio(name) {
  const el = $(`[name="${name}"]:checked`);
  return el ? el.value : '';
}

// ---------- Toggle secciones (plegables) ----------
function toggleSection(sec) {
  sec.classList.toggle('collapsed');
}
document.addEventListener('click', (e) => {
  if (e.target.closest('.section-head')) {
    const sec = e.target.closest('.section');
    if (sec) toggleSection(sec);
  }
});

// ---------- Switch de modo (CREAR / EDITAR) ----------
function setMode(mode) {
  state.mode = mode;
  $$('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  $('#view-create').classList.toggle('hidden', mode !== 'create');
  $('#view-edit').classList.toggle('hidden', mode !== 'edit');
  // Limpiar avisos al cambiar modo
  hideAlert('alert-edit');
  if (mode === 'create') {
    resetForm();
    // Sección 1 (encabezado) abierta por defecto
    $$('.section').forEach((s, i) => s.classList.toggle('collapsed', i !== 0 && i !== 1));
  }
}
$$('.mode-tab').forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));

// ============================================================
// MODO EDICIÓN: BUSCAR REGISTRO POR N° FORMULARIO + N° APTO
// ============================================================
async function buscarRegistro() {
  hideAlert('alert-edit');
  const numForm = val('#lookupNumForm');
  const apto    = val('#lookupApto');
  if (!numForm) { showAlert('alert-edit', 'Ingresa tu N° de formulario.', 'err'); return; }
  if (!apto)    { showAlert('alert-edit', 'Ingresa el N° de apartamento.', 'err'); return; }
  if (!APPS_SCRIPT_URL) {
    showAlert('alert-edit', 'El formulario aún no está conectado al servidor (falta URL del Apps Script). Avisa a la administración.', 'err');
    return;
  }

  $('#btnBuscar').disabled = true;
  $('#btnBuscar').textContent = 'Buscando...';

  try {
    const url = APPS_SCRIPT_URL + '?action=lookup&numForm=' + encodeURIComponent(numForm) + '&apto=' + encodeURIComponent(apto);
    const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
    const data = await resp.json();
    if (!data.ok) {
      showAlert('alert-edit', data.error || 'No se encontró el registro.', 'err');
      return;
    }
    state.editLookup = data.row;
    state.numForm = data.row.numForm;
    poblarFormulario(data.row);
    $('#view-edit').classList.add('hidden');
    $('#form-card').classList.remove('hidden');
    showAlert('alert-create', 'Registro cargado. Modifica los campos que necesites y haz clic en "Guardar cambios".', 'info');
    // Marca el formulario como "modo edición"
    state.mode = 'edit';
    // Resalta el indicador de modo
    $('#editIndicator').classList.remove('hidden');
  } catch (err) {
    showAlert('alert-edit', 'Error al buscar: ' + err.message, 'err');
  } finally {
    $('#btnBuscar').disabled = false;
    $('#btnBuscar').textContent = '🔍 Buscar mi registro';
  }
}
$('#btnBuscar').addEventListener('click', buscarRegistro);

// ============================================================
// POBLAR FORMULARIO (modo edición)
// ============================================================
function poblarFormulario(r) {
  setVal('#numFormDisplay', r.numForm);
  setVal('#apto', r.apto);
  setRadio('diligencia', r.diligencia);
  setVal('#nombreProp', r.nombreProp);
  setVal('#ccProp', r.ccProp);
  setVal('#correoProp', r.correoProp);
  setVal('#celProp', r.celProp);
  setVal('#telFijoProp', r.telFijoProp);
  setVal('#parqueaderos', r.parqueaderos);
  setVal('#matriculas', r.matriculas);
  setVal('#nombreArr', r.nombreArr);
  setVal('#ccArr', r.ccArr);
  setVal('#correArr', r.correoArr);
  setVal('#celArr', r.celArr);
  setVal('#parqTerNom', r.parqTerNom);
  setVal('#parqTerApto', r.parqTerApto);
  setVal('#parqTerCel', r.parqTerCel);
  setVal('#inmobRazon', r.inmobRazon);
  setVal('#inmobNit', r.inmobNit);
  setVal('#inmobContacto', r.inmobContacto);
  setVal('#inmobTel', r.inmobTel);
  setVal('#inmobCorreo', r.inmobCorreo);

  // Residentes (4)
  (r.residentes || []).forEach((res, i) => {
    const n = i + 1;
    setVal(`#r${n}Nombre`, res.nombre);
    setVal(`#r${n}CC`, res.cc);
    setVal(`#r${n}Correo`, res.correo);
    setVal(`#r${n}Cel`, res.cel);
    setVal(`#r${n}Parent`, res.parent);
  });
  // Menores (4)
  (r.menores || []).forEach((m, i) => {
    const n = i + 1;
    setVal(`#m${n}Nombre`, m.nombre);
    setVal(`#m${n}Edad`, m.edad);
    setVal(`#m${n}Parent`, m.parent);
  });
  // Vehículos (2)
  (r.vehiculos || []).forEach((v, i) => {
    const n = i + 1;
    setVal(`#v${n}Marca`, v.marca);
    setVal(`#v${n}Tipo`, v.tipo);
    setVal(`#v${n}Color`, v.color);
    setVal(`#v${n}Placa`, v.placa);
    setVal(`#v${n}Modelo`, v.modelo);
    setVal(`#v${n}Tag`, v.tag);
  });
  // Motos (2)
  (r.motos || []).forEach((v, i) => {
    const n = i + 1;
    setVal(`#mo${n}Marca`, v.marca);
    setVal(`#mo${n}Tipo`, v.tipo);
    setVal(`#mo${n}Color`, v.color);
    setVal(`#mo${n}Placa`, v.placa);
    setVal(`#mo${n}Modelo`, v.modelo);
    setVal(`#mo${n}Tag`, v.tag);
  });
  // Bicis (2)
  (r.bicis || []).forEach((b, i) => {
    const n = i + 1;
    setVal(`#bici${n}Marca`, b.marca);
    setVal(`#bici${n}Color`, b.color);
    setVal(`#bici${n}Clase`, b.clase);
    setVal(`#bici${n}Serial`, b.serial);
  });
  setVal('#llaverosAut', r.llaverosAut);
  setVal('#tagsAut', r.tagsAut);
  // Dispositivos (3)
  (r.dispositivos || []).forEach((d, i) => {
    const n = i + 1;
    setVal(`#disp${n}Tipo`, d.tipo);
    setVal(`#disp${n}Codigo`, d.codigo);
    setVal(`#disp${n}Placa`, d.placa);
    setVal(`#disp${n}Fecha`, d.fecha);
    setVal(`#disp${n}Recibe`, d.recibe);
  });
  // Mascotas (2)
  (r.mascotas || []).forEach((m, i) => {
    const n = i + 1;
    setVal(`#masc${n}Tipo`, m.tipo);
    setVal(`#masc${n}Nombre`, m.nombre);
    setVal(`#masc${n}Raza`, m.raza);
    setVal(`#masc${n}Color`, m.color);
    setVal(`#masc${n}Sexo`, m.sexo);
    setVal(`#masc${n}Vacuna`, m.vacuna);
    setRadio(`masc${n}Esp`, m.manejoEspecial === 'Sí' ? 'Sí' : (m.manejoEspecial === 'No' ? 'No' : ''));
    setVal(`#masc${n}Registro`, m.registro);
    setVal(`#masc${n}Aseguradora`, m.aseguradora);
    setVal(`#masc${n}Poliza`, m.poliza);
  });
  // Emergencias (2)
  (r.emergencias || []).forEach((e, i) => {
    const n = i + 1;
    setVal(`#em${n}Nombre`, e.nombre);
    setVal(`#em${n}Parent`, e.parent);
    setVal(`#em${n}Tel`, e.tel);
  });
  // Autorizaciones
  setChecked('autDatos', r.autDatos === 'Sí');
  setChecked('autMenores', r.autMenores === 'Sí');
  setChecked('autCom', r.autCom === 'Sí');
  setVal('#firmaNom', r.firmaNom);
  setVal('#firmaCC', r.firmaCC);
  setVal('#firmaFecha', r.firmaFecha || new Date().toISOString().slice(0, 10));
}

// ============================================================
// RECOLECTAR DATOS DEL FORMULARIO
// ============================================================
function recolectar() {
  const res = [];
  for (let i = 1; i <= 4; i++) {
    res.push({
      nombre: val(`#r${i}Nombre`),
      cc: val(`#r${i}CC`),
      correo: val(`#r${i}Correo`),
      cel: val(`#r${i}Cel`),
      parent: val(`#r${i}Parent`),
    });
  }
  const men = [];
  for (let i = 1; i <= 4; i++) {
    men.push({
      nombre: val(`#m${i}Nombre`),
      edad: val(`#m${i}Edad`),
      parent: val(`#m${i}Parent`),
    });
  }
  const veh = [];
  for (let i = 1; i <= 2; i++) {
    veh.push({
      marca: val(`#v${i}Marca`),
      tipo: val(`#v${i}Tipo`),
      color: val(`#v${i}Color`),
      placa: val(`#v${i}Placa`),
      modelo: val(`#v${i}Modelo`),
      tag: val(`#v${i}Tag`),
    });
  }
  const mot = [];
  for (let i = 1; i <= 2; i++) {
    mot.push({
      marca: val(`#mo${i}Marca`),
      tipo: val(`#mo${i}Tipo`),
      color: val(`#mo${i}Color`),
      placa: val(`#mo${i}Placa`),
      modelo: val(`#mo${i}Modelo`),
      tag: val(`#mo${i}Tag`),
    });
  }
  const bic = [];
  for (let i = 1; i <= 2; i++) {
    bic.push({
      marca: val(`#bici${i}Marca`),
      color: val(`#bici${i}Color`),
      clase: val(`#bici${i}Clase`),
      serial: val(`#bici${i}Serial`),
    });
  }
  const disp = [];
  for (let i = 1; i <= 3; i++) {
    disp.push({
      tipo: val(`#disp${i}Tipo`),
      codigo: val(`#disp${i}Codigo`),
      placa: val(`#disp${i}Placa`),
      fecha: val(`#disp${i}Fecha`),
      recibe: val(`#disp${i}Recibe`),
    });
  }
  const mas = [];
  for (let i = 1; i <= 2; i++) {
    mas.push({
      tipo: val(`#masc${i}Tipo`),
      nombre: val(`#masc${i}Nombre`),
      raza: val(`#masc${i}Raza`),
      color: val(`#masc${i}Color`),
      sexo: val(`#masc${i}Sexo`),
      vacuna: val(`#masc${i}Vacuna`),
      manejoEspecial: getRadio(`masc${i}Esp`),
      registro: val(`#masc${i}Registro`),
      aseguradora: val(`#masc${i}Aseguradora`),
      poliza: val(`#masc${i}Poliza`),
    });
  }
  const eme = [];
  for (let i = 1; i <= 2; i++) {
    eme.push({
      nombre: val(`#em${i}Nombre`),
      parent: val(`#em${i}Parent`),
      tel: val(`#em${i}Tel`),
    });
  }
  return {
    editMode: state.mode === 'edit',
    numForm: state.numForm,
    apto: val('#apto'),
    diligencia: getRadio('diligencia'),
    nombreProp: val('#nombreProp'),
    ccProp: val('#ccProp'),
    correoProp: val('#correoProp'),
    celProp: val('#celProp'),
    telFijoProp: val('#telFijoProp'),
    parqueaderos: val('#parqueaderos'),
    matriculas: val('#matriculas'),
    nombreArr: val('#nombreArr'),
    ccArr: val('#ccArr'),
    correoArr: val('#correArr'),
    celArr: val('#celArr'),
    parqTerNom: val('#parqTerNom'),
    parqTerApto: val('#parqTerApto'),
    parqTerCel: val('#parqTerCel'),
    inmobRazon: val('#inmobRazon'),
    inmobNit: val('#inmobNit'),
    inmobContacto: val('#inmobContacto'),
    inmobTel: val('#inmobTel'),
    inmobCorreo: val('#inmobCorreo'),
    residentes: res,
    menores: men,
    vehiculos: veh,
    motos: mot,
    bicis: bic,
    llaverosAut: val('#llaverosAut'),
    tagsAut: val('#tagsAut'),
    dispositivos: disp,
    mascotas: mas,
    emergencias: eme,
    autDatos: checked('autDatos'),
    autMenores: checked('autMenores'),
    autCom: checked('autCom'),
    firmaNom: val('#firmaNom'),
    firmaCC: val('#firmaCC'),
    firmaFecha: val('#firmaFecha'),
  };
}

// ============================================================
// VALIDACIÓN DE CAMPOS OBLIGATORIOS
// ============================================================
function validar() {
  clearAllErrors();
  let ok = true;

  function required(selector, msg) {
    if (!val(selector)) { showError(selector, msg); ok = false; }
  }
  function requiredRadio(name, msg) {
    if (!getRadio(name)) {
      const el = $(`[name="${name}"]`);
      if (el) {
        // Marca el contenedor más cercano con has-error
        const wrap = el.closest('.field') || el.parentElement;
        if (wrap) {
          wrap.classList.add('has-error');
          const errEl = wrap.querySelector('.err-msg');
          if (errEl && msg) errEl.textContent = msg;
        }
      }
      ok = false;
    }
  }
  function requiredCheckbox(name, msg) {
    if (!checked(name)) {
      const el = $(`[name="${name}"]`);
      if (el) {
        const wrap = el.closest('.checkbox-row') || el.parentElement;
        if (wrap) wrap.classList.add('has-error');
      }
      ok = false;
      if (msg) mostrar(msg);
    }
  }

  required('#apto', 'Indica tu N° de apartamento.');
  requiredRadio('diligencia', 'Selecciona si eres propietario, arrendatario o tenedor.');
  required('#nombreProp', 'Nombre del titular es obligatorio.');
  required('#ccProp', 'Cédula del titular es obligatoria.');
  const c = val('#correoProp');
  if (!c) { showError('#correoProp', 'Correo del titular es obligatorio.'); ok = false; }
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { showError('#correoProp', 'Correo inválido.'); ok = false; }
  required('#celProp', 'Celular del titular es obligatorio.');

  requiredCheckbox('autDatos', 'Debes autorizar el tratamiento de datos para continuar.');
  required('#firmaNom', 'Firma con tu nombre completo.');
  required('#firmaCC', 'Indica tu cédula en la firma.');

  // Edad menores debe ser número si está lleno
  for (let i = 1; i <= 4; i++) {
    const e = val(`#m${i}Edad`);
    if (e && (isNaN(parseInt(e, 10)) || parseInt(e, 10) < 0 || parseInt(e, 10) > 17)) {
      showError(`#m${i}Edad`, 'Edad debe ser un número entre 0 y 17.');
      ok = false;
    }
  }
  return ok;
}

// Mensajes inline flotantes para checkboxes requeridos
function mostrar(msg) {
  // Sólo usado para errores de checkbox
  const el = $('#alert-create');
  if (el && !el.classList.contains('hidden') && el.textContent.includes(msg)) return;
}

// ============================================================
// ENVIAR FORMULARIO
// ============================================================
async function enviarFormulario() {
  hideAlert('alert-create');
  if (!validar()) {
    showAlert('alert-create', 'Por favor completa los campos marcados en rojo antes de enviar.', 'err');
    // Expandir todas las secciones con error
    $$('.section').forEach(sec => {
      if (sec.querySelector('.has-error')) sec.classList.remove('collapsed');
    });
    // Scroll al primer error
    const firstErr = $('.field.has-error, .checkbox-row.has-error');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (!APPS_SCRIPT_URL) {
    showAlert('alert-create', 'El formulario aún no está conectado al servidor. Avisa a la administración.', 'err');
    return;
  }
  if (state.submitting) return;
  state.submitting = true;

  const payload = recolectar();

  const btn = $('#btnEnviar');
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = 'Enviando...';

  try {
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      // Sin headers custom: Apps Script Web App requiere preflight CORS simple
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!data.ok) {
      showAlert('alert-create', data.error || 'Error desconocido al guardar.', 'err');
      btn.disabled = false;
      btn.textContent = oldText;
      return;
    }
    // Éxito
    mostrarExito(data);
  } catch (err) {
    showAlert('alert-create', 'Error de red al enviar: ' + err.message, 'err');
    btn.disabled = false;
    btn.textContent = oldText;
  } finally {
    state.submitting = false;
  }
}
$('#btnEnviar').addEventListener('click', enviarFormulario);

function mostrarExito(data) {
  $('#form-card').classList.add('hidden');
  $('#success-card').classList.remove('hidden');
  if (data.editMode) {
    $('#success-title').textContent = '¡Registro actualizado!';
    $('#success-num-form').textContent = data.numForm;
    $('#success-advice').innerHTML = '<strong>N° de formulario:</strong> ' + data.numForm + ' (sigue siendo el mismo).';
  } else {
    $('#success-title').textContent = '¡Registro creado exitosamente!';
    $('#success-num-form').textContent = data.numForm;
    $('#success-advice').innerHTML = `
      <strong>⚠️ IMPORTANTE: Guarda tu N° de formulario.</strong><br>
      Tu N° de formulario es: <strong style="font-size:18px; letter-spacing:2px;">${data.numForm}</strong><br>
      Lo necesitarás cada vez que quieras editar o actualizar tus datos.<br>
      Guárdalo en un lugar seguro (anota, captura de pantalla, etc.).<br>
      <em>La administración NO puede recuperar este número por ti.</em>
    `;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// NUEVO REGISTRO / RESET
// ============================================================
function resetForm() {
  $('#mainForm').reset();
  state.numForm = '';
  state.editLookup = null;
  state.mode = 'create';
  $('#editIndicator').classList.add('hidden');
  $('#success-card').classList.add('hidden');
  $('#form-card').classList.remove('hidden');
  $('#firmaFecha').value = new Date().toISOString().slice(0, 10);
}
$('#btnNuevo').addEventListener('click', resetForm);

// ============================================================
// HELPERS DE ALERTAS
// ============================================================
function showAlert(id, msg, type) {
  const el = $('#' + id);
  if (!el) return;
  el.className = 'alert alert-' + (type || 'info');
  el.innerHTML = msg;
  el.classList.remove('hidden');
}
function hideAlert(id) {
  const el = $('#' + id);
  if (el) { el.classList.add('hidden'); el.textContent = ''; }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  $('#firmaFecha').value = new Date().toISOString().slice(0, 10);
  // Sincronizar campo firmaFecha2 (copia disabled) desde firmaFecha
  const fecha1 = $('#firmaFecha');
  const fecha2 = $('#firmaFecha2');
  function syncFecha2() {
    if (fecha1 && fecha2) fecha2.value = fecha1.value;
  }
  if (fecha1 && fecha2) {
    syncFecha2();
    fecha1.addEventListener('change', syncFecha2);
  }

  // Si la URL del Apps Script no está configurada, mostrar aviso
  if (!APPS_SCRIPT_URL) {
    showAlert('alert-create', '<strong>⚠️ Aviso:</strong> El formulario aún no está conectado al servidor. La administración debe desplegar el Apps Script y pegar la URL en <code>js/app.js</code> (constante <code>APPS_SCRIPT_URL</code>). Mientras tanto, los envíos no funcionarán.', 'err');
  }
});
