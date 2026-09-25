/* ============================================================
   Cerro Azul — Lógica del formulario público
   Cambios v2 (7-Sep-2026):
   - Nuevos campos: matriculaApto, parq1Celda, parq1Mat, parq2Celda, parq2Mat
   - Lookup automático de matrículas desde el Sheet matriculas-cerro-azul
   - Avisos visuales (ok/warn/err) según resultado del lookup
   - Checkbox requiereRevision + textarea observaciones
   ============================================================ */

// URL del Web App de Google Apps Script (desplegado por Fabio en urb.cerroazul@gmail.com)
const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec';

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

// ---------- Switch de modo (CREAR / EDITAR / MUDANZAS) ----------
function setMode(mode) {
  state.mode = mode;
  $$('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  $('#view-create').classList.toggle('hidden', mode !== 'create');
  $('#view-edit').classList.toggle('hidden', mode !== 'edit');
  $('#view-mudanzas').classList.toggle('hidden', mode !== 'mudanzas');
  // Limpiar avisos al cambiar modo
  hideAlert('alert-edit');
  if (mode === 'create') {
    resetForm();
    // Sección 1 (encabezado) abierta por defecto
    $$('.section').forEach((s, i) => s.classList.toggle('collapsed', i !== 0 && i !== 1));
  }
  if (mode === 'mudanzas') {
    M.reset();
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
    // Mostrar el formulario (view-create contiene form-card). ANTES del fix,
    // solo se hacia toggle a #form-card pero su padre #view-create seguia con
    // clase hidden (de setMode('edit') previo), entonces el usuario no veia nada.
    $('#view-edit').classList.add('hidden');
    $('#view-create').classList.remove('hidden');  // FIX 23-Sept: mostrar tambien el contenedor
    $('#form-card').classList.remove('hidden');
    // Mostrar la zona de borrado solo en modo edición
    const zb = $('#zona-borrado');
    if (zb) zb.classList.remove('hidden');
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
  // v2 — Parqueaderos y matrículas
  setVal('#parq1Celda', r.parq1Celda);
  setVal('#parq1Mat', r.parq1Mat);
  setVal('#parq2Celda', r.parq2Celda);
  setVal('#parq2Mat', r.parq2Mat);
  setVal('#matriculaApto', r.matriculaApto);
  setChecked('requiereRevision', r.requiereRevision === 'Sí');
  setVal('#observMatriculas', r.observMatriculas);
  // Mostrar/ocultar textarea según checkbox
  const wrapObs = $('#observMatriculas-wrap');
  if (wrapObs) wrapObs.style.display = r.requiereRevision === 'Sí' ? '' : 'none';
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
    // v2 — Parqueaderos y matrículas
    parq1Celda: val('#parq1Celda'),
    parq1Mat:   val('#parq1Mat'),
    parq2Celda: val('#parq2Celda'),
    parq2Mat:   val('#parq2Mat'),
    matriculaApto: val('#matriculaApto'),
    requiereRevision: checked('requiereRevision'),
    observMatriculas: val('#observMatriculas'),
    // Resto
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

  // v2 — Si el apto NO fue encontrado en la base, la matrícula del apto es OBLIGATORIA
  const matAptoEl = $('#matriculaApto');
  if (matAptoEl && matAptoEl.getAttribute('data-required-porque-no-encontrado') === '1' && !val('#matriculaApto')) {
    showError('#matriculaApto', 'Tu apartamento no aparece en la base de matrículas. Escribe la matrícula manualmente (o contacta a la administración).');
    ok = false;
  }

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
  // Ocultar zona de borrado (solo visible en modo edición)
  const zb = $('#zona-borrado');
  if (zb) zb.classList.add('hidden');
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
// v2 — LOOKUP DE MATRÍCULAS (autocompleta al perder foco)
// ============================================================

// Muestra/oculta un mensaje de aviso (ok/warn/err) en un div .lookup-msg
function setLookupMsg(targetId, msg, kind) {
  const el = $('#' + targetId);
  if (!el) return;
  if (!msg) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.className = 'lookup-msg ' + (kind || 'info');
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

// Lookup de matrícula del apartamento
async function lookupMatApto() {
  const apto = val('#apto');
  const msgTarget = 'apto-lookup-msg';
  const matField  = '#matriculaApto';

  // Si el residente ya escribió manualmente una matrícula, NO la pisamos
  // salvo que esté vacía.
  const manualMat = val(matField).trim();

  if (!apto) {
    setLookupMsg(msgTarget, '', null);
    return;
  }
  if (!APPS_SCRIPT_URL) {
    setLookupMsg(msgTarget, 'No se puede consultar la base de matrículas: el formulario no está conectado al servidor.', 'err');
    return;
  }

  setLookupMsg(msgTarget, '<strong>Buscando matrícula del apartamento ' + apto + '...</strong>', 'warn');

  try {
    const url = APPS_SCRIPT_URL + '?action=lookupMatApto&apto=' + encodeURIComponent(apto);
    const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
    const data = await resp.json();
    if (!data.ok) {
      setLookupMsg(msgTarget, 'Error al consultar la base: ' + (data.error || 'desconocido'), 'err');
      return;
    }
    if (data.encontrado) {
      // Autocompletar SOLO si el campo está vacío (respetar edición manual)
      if (!manualMat) setVal(matField, data.matricula);
      setLookupMsg(msgTarget,
        '<strong>✓ Matrícula encontrada:</strong> ' + data.matricula +
        ' (fuente: ' + (data.fuente === 'torre3' ? 'Torre 3 - Etapa 1' : 'Torre 1 - Etapa 2') + '). ' +
        'Verifica que sea correcta. Si no lo es, edítala y marca la casilla de revisión.',
        'ok');
    } else {
      // No encontrada: el residente TIENE que escribir la matrícula manualmente
      setVal(matField, manualMat || '');
      setLookupMsg(msgTarget,
        '<strong>⚠ Tu apartamento (' + apto + ') NO aparece en la base de matrículas.</strong> ' +
        'Esto aplica a unidades de Torre 2 (sin asignación) o si tu unidad no está registrada. ' +
        '<strong>Por favor escribe la matrícula manualmente</strong> en el campo de arriba. ' +
        'Si no la conoces, deja el campo vacío y contacta a la administración.',
        'warn');
      // Marcar el campo de matrícula como requerido para forzar la escritura
      const f = $(matField);
      if (f) f.setAttribute('data-required-porque-no-en-contrado', '1');
    }
  } catch (err) {
    setLookupMsg(msgTarget, 'Error de red al consultar la base de matrículas: ' + err.message, 'err');
  }
}

// Lookup de matrícula de un parqueadero
async function lookupMatParq(n) {
  const celda = val('#parq' + n + 'Celda');
  const matField = '#parq' + n + 'Mat';
  const msgTarget = 'parq' + n + '-lookup-msg';

  const manualMat = val(matField).trim();

  if (!celda) {
    setLookupMsg(msgTarget, '', null);
    return;
  }
  if (!APPS_SCRIPT_URL) {
    setLookupMsg(msgTarget, 'No se puede consultar: el formulario no está conectado.', 'err');
    return;
  }

  setLookupMsg(msgTarget, '<strong>Buscando matrícula de la celda ' + celda + '...</strong>', 'warn');

  try {
    const url = APPS_SCRIPT_URL + '?action=lookupMatParq&celda=' + encodeURIComponent(celda);
    const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
    const data = await resp.json();
    if (!data.ok) {
      setLookupMsg(msgTarget, 'Error: ' + (data.error || 'desconocido'), 'err');
      return;
    }
    if (data.encontrado) {
      if (!manualMat) setVal(matField, data.matricula);
      const tipoTxt = data.tipo ? ' (' + data.tipo + ')' : '';
      setLookupMsg(msgTarget,
        '<strong>✓ Celda ' + celda + tipoTxt + ':</strong> matrícula ' + data.matricula +
        '. Verifica que sea correcta.',
        'ok');
    } else {
      setVal(matField, manualMat || '');
      setLookupMsg(msgTarget,
        '<strong>⚠ La celda ' + celda + ' NO aparece en el registro de parqueaderos.</strong> ' +
        'Escríbe la matrícula manualmente. Si no la conoces, déjala en blanco.',
        'warn');
    }
  } catch (err) {
    setLookupMsg(msgTarget, 'Error de red: ' + err.message, 'err');
  }
}

// Listeners: lookup al perder foco
['#apto', '#parq1Celda', '#parq2Celda'].forEach(sel => {
  const el = $(sel);
  if (el) el.addEventListener('blur', () => {
    if (sel === '#apto') lookupMatApto();
    else if (sel === '#parq1Celda') lookupMatParq(1);
    else if (sel === '#parq2Celda') lookupMatParq(2);
  });
});

// Mostrar/ocultar textarea de observaciones según checkbox de revisión
function toggleObservMatriculas() {
  const cb = $('[name="requiereRevision"]');
  const wrap = $('#observMatriculas-wrap');
  if (!cb || !wrap) return;
  wrap.style.display = cb.checked ? '' : 'none';
}
document.addEventListener('change', (e) => {
  if (e.target && e.target.name === 'requiereRevision') toggleObservMatriculas();
});

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

  // Bindear eventos del modulo de mudanzas
  M.bindEvents();

  // Bindear eventos del boton "Borrado de datos residente" (modo edición)
  bindClearResidente();
});

// ============================================================
// BORRADO DE DATOS DEL RESIDENTE (spec-residente.md F3)
// Solo visible en modo edición. Valida CC del propietario.
// ============================================================
function bindClearResidente() {
  const btnShow = $('#btnClearResidente');
  const btnCancel = $('#btnCancelarClear');
  const btnConfirm = $('#btnConfirmarClear');
  const modal = $('#modalClearResidente');

  if (btnShow) btnShow.addEventListener('click', () => {
    const apto = val('#apto').trim();
    $('#modalApto').textContent = apto || '(sin número)';
    modal.classList.remove('hidden');
  });

  if (btnCancel) btnCancel.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  if (btnConfirm) btnConfirm.addEventListener('click', clearResidenteForm);
}

async function clearResidenteForm() {
  const numForm = state.numForm;
  const apto = val('#apto').trim();
  const ccPropConfirm = val('#ccProp').trim();

  if (!numForm || !apto || !ccPropConfirm) {
    alert('Faltan datos requeridos (N° Formulario, apartamento o céd del).');
    return;
  }

  const payload = {
    action: 'clearResidente',
    numForm,
    apto,
    ccPropConfirm
  };

  const btn = $('#btnConfirmarClear');
  btn.disabled = true;
  btn.textContent = 'Borrando...';

  try {
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const data = await resp.json();

    if (!data.ok) {
      alert('Error: ' + (data.error || 'No se pudo borrar.'));
      btn.disabled = false;
      btn.textContent = '🗑️ Sí, borrar';
      return;
    }

    // Éxito
    $('#modalClearResidente').classList.add('hidden');
    alert(`✅ Se borraron ${data.celdasLimpiadas} celdas. El registro del propietario se mantiene intacto.`);
    // Recargar el formulario para reflejar el cambio
    if (state.editLookup) poblarFormulario(state.editLookup);
    btn.disabled = false;
    btn.textContent = '🗑️ Sí, borrar';
  } catch (e) {
    alert('Error de red: ' + e.message);
    btn.disabled = false;
    btn.textContent = '🗑️ Sí, borrar';
  }
}

// ============================================================
// MODULO MUDANZAS (M)
// Backend: 4 endpoints Apps Script
//   GET  ?action=verificarPropietario
//   GET  ?action=dispMudanzas
//   POST action=reservarMudanza
//   POST action=cancelarMudanza
// ============================================================
const M = {
  state: {
    numForm: '',
    apto: '',
    ccProp: '',
    propietario: null,  // datos del propietario verificado
    torre: '1',
    fecha: null,         // YYYY-MM-DD
    horaInicio: null,    // HH:MM
    horaFin: null,
    dispCache: {},       // {fecha: slotsDelDia}
    lastReserva: null,   // {idReserva, ...} para cancelar despues
  },

  reset() {
    this.state.propietario = null;
    this.state.torre = '1';
    this.state.fecha = null;
    this.state.horaInicio = null;
    this.state.horaFin = null;
    this.state.dispCache = {};
    this.state.lastReserva = null;
    this.showVista('login');
    $('#mudNumForm').value = '';
    $('#mudApto').value = '';
    $('#mudCcProp').value = '';
    hideAlert('alert-mud-login');
    hideAlert('alert-mud-form');
    $('#mudTipoMensaje').classList.add('hidden');
    $$('input[name="mudTipo"]').forEach(r => r.checked = false);
    $('#mudTorre').value = '1';
    $('#mudEmpresa').value = '';
    $('#mudPlaca').value = '';
    $('#mudObservaciones').value = '';
    $('#btnMudReservar').disabled = true;
    this.renderCalendario();
    $('#mudSlots').innerHTML = '';
  },

  bindEvents() {
    $('#btnMudVerificar').addEventListener('click', () => this.verificar());
    $('#btnMudCancelar').addEventListener('click', () => this.reset());
    $('#btnMudReservar').addEventListener('click', () => this.submitReserva());
    $('#btnMudOtra').addEventListener('click', () => this.reset());
    $('#btnMudMisReservas').addEventListener('click', () => this.showMisReservas());
    $('#btnMudVolver').addEventListener('click', () => this.reset());

    // Tipo de autorizacion → mensaje contextual
    $$('input[name="mudTipo"]').forEach(r => {
      r.addEventListener('change', () => {
        const tipo = this.getTipo();
        const msg = $('#mudTipoMensaje');
        if (tipo === 'Salida') {
          msg.className = 'alert alert-warn';
          msg.innerHTML = '⚠️ <strong>Salida del arrendatario.</strong> Recuerde: si el inquilino actual se va del apartamento, debe <strong>eliminar sus datos</strong> del formulario de residentes.';
        } else if (tipo === 'Ingreso') {
          msg.className = 'alert alert-warn';
          msg.innerHTML = '⚠️ <strong>Ingreso del nuevo arrendatario.</strong> Recuerde: el nuevo residente <strong>DEBE haber llenado primero</strong> sus datos en el formulario de residentes. Si aún no se ha registrado, esta solicitud será rechazada por la administración.';
        } else {
          msg.classList.add('hidden');
        }
      });
    });

    // Cambio de torre → recarga calendario
    $('#mudTorre').addEventListener('change', () => {
      this.state.torre = $('#mudTorre').value;
      this.renderCalendario();
      $('#mudSlots').innerHTML = '';
      this.state.fecha = null;
      this.state.horaInicio = null;
      this.state.horaFin = null;
      $('#btnMudReservar').disabled = true;
    });
  },

  getTipo() {
    const checked = $$('input[name="mudTipo"]').find(r => r.checked);
    return checked ? checked.value : '';
  },

  showVista(vista) {
    $('#mud-vista-login').classList.toggle('hidden', vista !== 'login');
    $('#mud-vista-form').classList.toggle('hidden', vista !== 'form');
    $('#mud-vista-ok').classList.toggle('hidden', vista !== 'ok');
    $('#mud-vista-mis').classList.toggle('hidden', vista !== 'mis');
  },

  // ============================================================
  // VISTA 1: VERIFICAR PROPIETARIO
  // ============================================================
  async verificar() {
    hideAlert('alert-mud-login');
    const numForm = $('#mudNumForm').value.trim();
    const apto    = $('#mudApto').value.trim();
    const ccProp  = $('#mudCcProp').value.replace(/[^0-9]/g, '').trim();

    if (!numForm) { showAlert('alert-mud-login', 'Ingresa tu N° de formulario.', 'err'); return; }
    if (!apto)    { showAlert('alert-mud-login', 'Ingresa el N° de apartamento.', 'err'); return; }
    if (!ccProp)  { showAlert('alert-mud-login', 'Ingresa la cédula del propietario (solo números).', 'err'); return; }

    if (!APPS_SCRIPT_URL) {
      showAlert('alert-mud-login', 'El formulario no está conectado al servidor.', 'err');
      return;
    }

    $('#btnMudVerificar').disabled = true;
    $('#btnMudVerificar').textContent = 'Verificando...';

    try {
      const url = APPS_SCRIPT_URL + '?action=verificarPropietario'
        + '&numForm=' + encodeURIComponent(numForm)
        + '&apto=' + encodeURIComponent(apto)
        + '&ccProp=' + encodeURIComponent(ccProp);
      const resp = await fetch(url, { method: 'GET' });
      const data = await resp.json();

      if (!data.ok) {
        showAlert('alert-mud-login', data.error || 'No se pudo verificar.', 'err');
        return;
      }

      this.state.numForm = numForm;
      this.state.apto = apto;
      this.state.ccProp = ccProp;
      this.state.propietario = data;

      // Pasar al formulario
      this.showVista('form');
      this.renderCalendario();
    } catch (e) {
      showAlert('alert-mud-login', 'Error de red: ' + e.message, 'err');
    } finally {
      $('#btnMudVerificar').disabled = false;
      $('#btnMudVerificar').textContent = '🔍 Verificar';
    }
  },

  // ============================================================
  // VISTA 2: CALENDARIO + SLOTS
  // ============================================================
  renderCalendario() {
    const cont = $('#mudCalendario');
    const hoy = new Date();
    // Permitir agendar desde hoy+2 dias calendario
    const minFecha = new Date(hoy);
    minFecha.setDate(minFecha.getDate() + 2);
    minFecha.setHours(0, 0, 0, 0);

    // Mostrar mes actual + siguiente (2 meses)
    let html = '';
    for (let m = 0; m < 2; m++) {
      const ref = new Date(hoy.getFullYear(), hoy.getMonth() + m, 1);
      html += this.renderMes(ref, minFecha);
    }
    cont.innerHTML = html;

    // Bindear clicks en dias
    $$('#mudCalendario .mud-dia').forEach(el => {
      el.addEventListener('click', () => {
        if (el.classList.contains('mud-dia-deshabilitado')) return;
        const f = el.dataset.fecha;
        // Mostrar aviso de festivos la primera vez
        this.showFestivoWarning(() => {
          $$('#mudCalendario .mud-dia').forEach(d => d.classList.remove('mud-dia-seleccionado'));
          el.classList.add('mud-dia-seleccionado');
          this.selectFecha(f);
        });
      });
    });
  },

  renderMes(refDate, minFecha) {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const dowNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const primerDia = new Date(year, month, 1);
    const ultimoDia = new Date(year, month + 1, 0);
    let html = `<div class="mud-mes"><h4>${monthNames[month]} ${year}</h4><div class="mud-cal-grid"><div class="mud-cal-hdr">${dowNames.map(d=>'<span>'+d+'</span>').join('')}</div><div class="mud-cal-dias">`;
    // Celdas vacias antes del primer dia
    const startDow = primerDia.getDay();
    for (let i = 0; i < startDow; i++) html += '<span></span>';
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      const fecha = new Date(year, month, d);
      const fechaStr = this.formatFecha(fecha);
      const dow = fecha.getDay(); // 0=Dom
      const esDomingo = dow === 0;
      const muyPronto = fecha < minFecha;
      const deshabilitado = esDomingo || muyPronto;
      const selClass = (this.state.fecha === fechaStr) ? ' mud-dia-seleccionado' : '';
      const disClass = deshabilitado ? ' mud-dia-deshabilitado' : '';
      const title = esDomingo ? 'Domingo: no hay servicio'
                  : muyPronto ? 'Menos de 48h de anticipación'
                  : 'Click para ver horarios';
      html += `<button type="button" class="mud-dia${disClass}${selClass}" data-fecha="${fechaStr}" title="${title}" ${deshabilitado?'disabled':''}>${d}</button>`;
    }
    html += '</div></div></div>';
    return html;
  },

  showFestivoWarning(callback) {
    // Solo mostrar la primera vez por sesion
    if (this._festivoShown) { callback(); return; }
    this._festivoShown = true;
    const proceed = confirm(
      '⚠️ AVISO IMPORTANTE — FESTIVOS\n\n' +
      'Verifique que NO está seleccionando un día festivo.\n' +
      'Las mudanzas NO se permiten en días festivos.\n\n' +
      'Si selecciona un festivo, la vigilancia NO permitirá el ingreso ' +
      'sin importar que usted haya hecho la reserva o que no se haya dado cuenta.\n\n' +
      '¿Entendido? Click OK para continuar.'
    );
    if (proceed) callback();
    else {
      // El usuario cancelo → deseleccionar lo que habia seleccionado antes
      $$('#mudCalendario .mud-dia-seleccionado').forEach(d => d.classList.remove('mud-dia-seleccionado'));
      this.state.fecha = null;
      $('#mudSlots').innerHTML = '';
      $('#btnMudReservar').disabled = true;
    }
  },

  async selectFecha(fecha) {
    this.state.fecha = fecha;
    this.state.horaInicio = null;
    this.state.horaFin = null;
    $('#btnMudReservar').disabled = true;
    $('#mudSlots').innerHTML = '<p style="color:var(--gris-med);">Cargando horarios...</p>';

    try {
      const url = APPS_SCRIPT_URL + '?action=dispMudanzas'
        + '&torre=' + encodeURIComponent(this.state.torre)
        + '&ascensor=A'
        + '&desde=' + encodeURIComponent(fecha)
        + '&hasta=' + encodeURIComponent(fecha);
      const resp = await fetch(url);
      const data = await resp.json();

      if (!data.ok) {
        $('#mudSlots').innerHTML = `<p style="color:var(--err);">${data.error || 'Error al cargar horarios'}</p>`;
        return;
      }

      this.renderSlots(data.slots);
    } catch (e) {
      $('#mudSlots').innerHTML = `<p style="color:var(--err);">Error de red: ${e.message}</p>`;
    }
  },

  renderSlots(slotsDelDia) {
    if (!slotsDelDia.length) {
      $('#mudSlots').innerHTML = '<p style="color:var(--gris-med);">No hay horarios disponibles este día (ej: domingo).</p>';
      return;
    }
    let html = '<div class="mud-slots-grid">';
    for (const s of slotsDelDia) {
      const cls = s.disponible ? 'mud-slot-disponible' : 'mud-slot-ocupado';
      const sel = (s.horaInicio === this.state.horaInicio) ? ' mud-slot-seleccionado' : '';
      const label = s.reservadoPor ? `${s.horaInicio}-${s.horaFin}<br><small>(${s.reservadoPor})</small>` : `${s.horaInicio} - ${s.horaFin}`;
      html += `<button type="button" class="mud-slot ${cls}${sel}" data-hora="${s.horaInicio}" data-fin="${s.horaFin}" ${!s.disponible?'disabled':''}>${label}</button>`;
    }
    html += '</div>';
    if (this.state.fecha) {
      html += `<p style="font-size:12px; color:var(--gris-med); margin-top:8px;">${this.formatFechaLarga(this.state.fecha)}</p>`;
    }
    $('#mudSlots').innerHTML = html;

    $$('#mudSlots .mud-slot-disponible').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.horaInicio = btn.dataset.hora;
        this.state.horaFin = btn.dataset.fin;
        $$('#mudSlots .mud-slot').forEach(b => b.classList.remove('mud-slot-seleccionado'));
        btn.classList.add('mud-slot-seleccionado');
        this.checkFormCompleto();
      });
    });
  },

  checkFormCompleto() {
    const tipo = this.getTipo();
    const ok = tipo && this.state.torre && this.state.fecha && this.state.horaInicio && this.state.horaFin;
    $('#btnMudReservar').disabled = !ok;
  },

  async submitReserva() {
    hideAlert('alert-mud-form');
    const tipo = this.getTipo();
    if (!tipo) { showAlert('alert-mud-form', 'Selecciona el tipo de autorización (Salida o Ingreso).', 'err'); return; }
    if (!this.state.fecha || !this.state.horaInicio) { showAlert('alert-mud-form', 'Selecciona un día y un horario.', 'err'); return; }

    $('#btnMudReservar').disabled = true;
    $('#btnMudReservar').textContent = 'Reservando...';

    try {
      const payload = {
        action: 'reservarMudanza',
        numForm: this.state.numForm,
        apto: this.state.apto,
        ccProp: this.state.ccProp,
        tipoMudanza: tipo,
        torre: this.state.torre,
        fecha: this.state.fecha,
        horaInicio: this.state.horaInicio,
        horaFin: this.state.horaFin,
        empresa: $('#mudEmpresa').value.trim(),
        placa: $('#mudPlaca').value.trim().toUpperCase(),
        observaciones: $('#mudObservaciones').value.trim(),
      };
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!data.ok) {
        showAlert('alert-mud-form', data.error || 'No se pudo reservar.', 'err');
        this.checkFormCompleto();
        return;
      }
      this.state.lastReserva = data;
      this.showConfirmacion(data);
    } catch (e) {
      showAlert('alert-mud-form', 'Error de red: ' + e.message, 'err');
      this.checkFormCompleto();
    } finally {
      $('#btnMudReservar').textContent = '📅 Confirmar reserva';
    }
  },

  showConfirmacion(data) {
    $('#mudOkId').textContent = data.idReserva;
    const fecha = this.formatFechaLarga(data.fecha);
    $('#mudOkDetalle').innerHTML = `
      <strong>Fecha:</strong> ${fecha}<br>
      <strong>Horario:</strong> ${data.horaInicio} a ${data.horaFin}<br>
      <strong>Torre:</strong> ${data.torre}, Ascensor A
    `;
    this.showVista('ok');
  },

  async showMisReservas() {
    // Lista todas las reservas del numForm actual
    // (Hoy no hay endpoint dedicado — usamos dispMudanzas en un rango
    // y filtramos las que aparecen como ocupadoPor). Como dispMudanzas
    // no devuelve numForm, mostramos solo las cancelables dentro de las
    // visibles. Esta vista es informativa.
    showAlert('alert-mud-form', 'Para ver todas tus reservas, contacta a la administración. Esta función está en desarrollo.', 'info');
  },

  // ============================================================
  // Helpers de fecha
  // ============================================================
  formatFecha(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  formatFechaLarga(fechaStr) {
    const dowNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const [y, m, d] = fechaStr.split('-').map(Number);
    const dow = new Date(y, m-1, d).getDay();
    const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${dowNames[dow]} ${d} de ${monthNames[m-1]} de ${y}`;
  },
};
