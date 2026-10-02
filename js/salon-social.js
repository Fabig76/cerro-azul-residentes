// ============================================================
// PORTAL DEL SALON SOCIAL — Cerro Azul Residentes
// spec-salon-social.md F4 — Version 1.0
// Endpoints: verificarAccesoSalon, dispSalon, reservarSalon,
//            subirComprobanteSalon, cancelarReservaSalon,
//            editarReservaSalon, vigilanteVerReservasSalon,
//            adminListarReservasSalon, adminVerComprobanteSalon,
//            adminCancelarReservaSalon
// ============================================================

const APP_URL = 'https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec';

// ============ ESTADO GLOBAL ============
const state = {
  apto: null,
  cc: null,
  numForm: null,
  nombre: null,
  tipo: null,
  celular: null,
  correo: null,
  enMora: false,
  mesesMora: 0,
  valorReserva: 125000,
  linkPago: null,
  fechaSeleccionada: null,
  slotSeleccionado: null,
  reservaIdActual: null,
  comprobanteBase64: null,
  comprobanteNombre: null,
  comprobanteMime: null
};

// ============ FETCH HELPERS ============
async function apiGet(params) {
  const url = new URL(APP_URL);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v);
  });
  const r = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  return r.json();
}

async function apiPost(payload) {
  const r = await fetch(APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });
  return r.json();
}

// ============ UI HELPERS ============
function showView(name) {
  ['login', 'mora', 'calendario', 'reservar', 'pago', 'mis-reservas', 'exito'].forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('hidden', v !== name);
  });
  window.scrollTo(0, 0);
}

function showAlert(viewName, msg, type) {
  type = type || 'error';
  const el = document.getElementById('alert-' + viewName);
  if (!el) return;
  el.textContent = msg;
  el.className = 'alert show ' + type;
  setTimeout(() => { el.classList.remove('show'); el.classList.add('hidden'); }, 10000);
}

function hideAlert(viewName) {
  const el = document.getElementById('alert-' + viewName);
  if (el) { el.classList.remove('show'); el.classList.add('hidden'); el.textContent = ''; }
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function formatDate(isoDate) {
  // isoDate = "2026-10-04" → "Domingo 4 de octubre de 2026"
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return dias[date.getDay()] + ' ' + d + ' de ' + meses[date.getMonth()] + ' de ' + y;
}

function formatSlot(slot) {
  return slot === 'Mañana' ? 'Mañana (8 AM - 1 PM)' : 'Tarde (2 PM - 10 PM)';
}

// ============ FLUJO 1: LOGIN ============
async function flujoLogin() {
  const apto = val('aptoInput');
  const cc = val('ccInput').replace(/[.\-\s]/g, '');

  if (!apto) return showAlert('login', 'Por favor ingrese el N° de apartamento', 'error');
  if (!cc) return showAlert('login', 'Por favor ingrese su cédula', 'error');

  const btn = document.getElementById('btnIngresar');
  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    const r = await apiGet({ action: 'verificarAccesoSalon', apto, cc });

    if (!r.ok) {
      showAlert('login', r.error || 'Error al verificar', 'error');
      return;
    }

    if (r.enMora) {
      // Mostrar vista de mora
      state.apto = apto;
      state.enMora = true;
      state.mesesMora = r.mesesMora;
      document.getElementById('moraApto').textContent = apto;
      document.getElementById('moraMensaje').textContent = r.mensaje;
      showView('mora');
      return;
    }

    // Login OK → ir a calendario
    state.apto = apto;
    state.cc = cc;
    state.numForm = r.numForm;
    state.nombre = r.nombre;
    state.tipo = r.tipo;
    state.celular = r.celular;
    state.correo = r.correo;
    state.enMora = false;
    state.valorReserva = r.valorReserva;
    state.linkPago = r.linkPago;

    // Mostrar vista de calendario
    document.getElementById('userNombre').textContent = r.nombre;
    document.getElementById('userTipo').textContent = r.tipo;
    document.getElementById('userApto').textContent = apto;

    await cargarCalendario();
    showView('calendario');
  } catch (e) {
    showAlert('login', 'Error de red: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Continuar';
  }
}

// ============ FLUJO 2: CARGAR CALENDARIO ============
async function cargarCalendario() {
  const grid = document.getElementById('calendarioGrid');
  grid.innerHTML = '<p style="text-align:center; grid-column: span 7;">Cargando...</p>';

  try {
    const r = await apiGet({ action: 'dispSalon', apto: state.apto });

    if (!r.ok) {
      showAlert('calendario', r.error || 'Error al cargar calendario', 'error');
      return;
    }

    grid.innerHTML = '';
    const dias = r.dias || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Headers de día de la semana
    const dowHeaders = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    dowHeaders.forEach(d => {
      const h = document.createElement('div');
      h.style.fontWeight = 'bold';
      h.style.textAlign = 'center';
      h.style.fontSize = '0.85em';
      h.style.color = 'var(--gris-med)';
      h.textContent = d;
      grid.appendChild(h);
    });

    // Calcular offset del primer día (lunes=0)
    if (dias.length > 0) {
      const firstDate = new Date(dias[0].fecha + 'T00:00:00');
      // JavaScript: 0=domingo, 1=lunes, ..., 6=sabado
      // Queremos: 0=lunes, 1=martes, ..., 6=domingo
      let dow = firstDate.getDay() - 1;
      if (dow < 0) dow = 6;
      for (let i = 0; i < dow; i++) {
        const empty = document.createElement('div');
        grid.appendChild(empty);
      }
    }

    dias.forEach(dia => {
      const date = new Date(dia.fecha + 'T00:00:00');
      const isPasado = date < today;
      const libre = (dia.manana === 'libre' || dia.tarde === 'libre') && !isPasado;
      const reservado = !libre && !isPasado;

      const div = document.createElement('div');
      div.className = 'calendario-day ' +
        (isPasado ? 'pasado' :
         (libre ? 'libre' : 'reservado'));

      const num = document.createElement('div');
      num.className = 'day-num';
      num.textContent = date.getDate();
      div.appendChild(num);

      const slots = document.createElement('div');
      slots.className = 'day-slots';
      const mIcon = dia.manana === 'libre' ? '☀️' : '🔴';
      const tIcon = dia.tarde === 'libre' ? '🌆' : '🔴';
      slots.innerHTML = mIcon + ' ' + tIcon;
      div.appendChild(slots);

      if (!isPasado) {
        div.addEventListener('click', () => {
          if (dia.manana === 'libre' || dia.tarde === 'libre') {
            flujoSeleccionarDia(dia);
          } else {
            showAlert('calendario', 'Este día ya tiene ambos turnos reservados.', 'error');
          }
        });
      }

      grid.appendChild(div);
    });
  } catch (e) {
    showAlert('calendario', 'Error de red: ' + e.message, 'error');
  }
}

// ============ FLUJO 3: SELECCIONAR DÍA → VER SLOTS ============
function flujoSeleccionarDia(dia) {
  state.fechaSeleccionada = dia.fecha;
  state.slotSeleccionado = null;
  state.reservaIdActual = null;

  document.getElementById('userNombre2').textContent = state.nombre;
  document.getElementById('userApto2').textContent = state.apto;
  document.getElementById('reservarFecha').textContent = formatDate(dia.fecha);

  const btnManana = document.getElementById('btnSlotManana');
  const btnTarde = document.getElementById('btnSlotTarde');

  btnManana.disabled = dia.manana !== 'libre';
  btnTarde.disabled = dia.tarde !== 'libre';

  hideAlert('reservar');
  showView('reservar');
}

// ============ FLUJO 4: SELECCIONAR SLOT → VISTA DE PAGO ============
async function flujoSeleccionarSlot(slot) {
  state.slotSeleccionado = slot;

  // Crear la reserva
  const payload = {
    action: 'reservarSalon',
    apto: state.apto,
    cc: state.cc,
    fechaReserva: state.fechaSeleccionada,
    slot: slot,
    numForm: state.numForm
  };

  const btn = slot === 'Mañana' ? document.getElementById('btnSlotManana') : document.getElementById('btnSlotTarde');
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = 'Reservando...';

  try {
    const r = await apiPost(payload);
    if (!r.ok) {
      showAlert('reservar', r.error || 'No se pudo reservar', 'error');
      btn.textContent = oldText;
      btn.disabled = false;
      return;
    }

    state.reservaIdActual = r.reservaId;
    state.linkPago = r.linkPago;

    // Mostrar vista de pago
    document.getElementById('userNombre3').textContent = state.nombre;
    document.getElementById('userApto3').textContent = state.apto;
    document.getElementById('pagoFecha').textContent = formatDate(state.fechaSeleccionada);
    document.getElementById('pagoSlot').textContent = formatSlot(slot);
    document.getElementById('linkPago').href = r.linkPago;
    document.getElementById('linkPagoUrl').textContent = r.linkPago;

    // Limpiar upload previo
    document.getElementById('comprobanteInput').value = '';
    document.getElementById('fileName').textContent = '';
    document.getElementById('btnSubirComprobante').disabled = true;
    state.comprobanteBase64 = null;
    state.comprobanteNombre = null;
    state.comprobanteMime = null;

    hideAlert('pago');
    showView('pago');
  } catch (e) {
    showAlert('reservar', 'Error de red: ' + e.message, 'error');
    btn.textContent = oldText;
    btn.disabled = false;
  }
}

// ============ FLUJO 5: SUBIR COMPROBANTE ============
async function handleFileSelect(file) {
  if (!file) return;

  // Validar tamaño (10MB)
  if (file.size > 10 * 1024 * 1024) {
    showAlert('pago', 'Archivo demasiado grande. Máximo 10MB.', 'error');
    return;
  }

  // Validar tipo
  const mime = file.type;
  if (mime !== 'application/pdf' && mime !== 'image/jpeg' && mime !== 'image/png') {
    showAlert('pago', 'Tipo de archivo inválido. Use PDF, JPG o PNG.', 'error');
    return;
  }

  // Convertir a base64
  const reader = new FileReader();
  reader.onload = function (e) {
    const dataUrl = e.target.result;
    const base64 = dataUrl.split(',')[1];
    state.comprobanteBase64 = base64;
    state.comprobanteNombre = file.name;
    state.comprobanteMime = mime;

    document.getElementById('fileName').textContent = '✅ ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    document.getElementById('btnSubirComprobante').disabled = false;
    hideAlert('pago');
  };
  reader.onerror = function () {
    showAlert('pago', 'Error al leer el archivo.', 'error');
  };
  reader.readAsDataURL(file);
}

async function flujoSubirComprobante() {
  if (!state.comprobanteBase64) {
    showAlert('pago', 'Por favor selecciona un archivo primero.', 'error');
    return;
  }

  const btn = document.getElementById('btnSubirComprobante');
  btn.disabled = true;
  btn.textContent = 'Subiendo...';

  try {
    const r = await apiPost({
      action: 'subirComprobanteSalon',
      reservaId: state.reservaIdActual,
      cc: state.cc,
      apto: state.apto,
      comprobanteBase64: state.comprobanteBase64,
      comprobanteNombre: state.comprobanteNombre,
      comprobanteMime: state.comprobanteMime
    });

    if (!r.ok) {
      showAlert('pago', r.error || 'No se pudo subir el comprobante', 'error');
      btn.disabled = false;
      btn.textContent = '📤 Subir comprobante';
      return;
    }

    // Mostrar éxito
    document.getElementById('alert-exito').textContent =
      '✅ Comprobante subido correctamente. ID de reserva: ' + r.reservaId +
      '. El administrador verificará la legitimidad.';
    document.getElementById('exitoMensaje').textContent =
      'Tu reserva ' + r.reservaId + ' está ahora en estado "Pagado". ' +
      'Recibirás un correo de confirmación.';
    showView('exito');
  } catch (e) {
    showAlert('pago', 'Error de red: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = '📤 Subir comprobante';
  }
}

// ============ FLUJO 6: CANCELAR RESERVA ============
async function flujoCancelarReserva() {
  if (!state.reservaIdActual) {
    showAlert('pago', 'No hay reserva activa para cancelar.', 'error');
    return;
  }

  if (!confirm('¿Confirma que desea cancelar la reserva ' + state.reservaIdActual + '? El horario se liberará.')) return;

  const btn = document.getElementById('btnCancelarReserva');
  btn.disabled = true;
  btn.textContent = 'Cancelando...';

  try {
    const r = await apiPost({
      action: 'cancelarReservaSalon',
      reservaId: state.reservaIdActual,
      cc: state.cc,
      apto: state.apto
    });

    if (!r.ok) {
      showAlert('pago', r.error || 'No se pudo cancelar', 'error');
      btn.disabled = false;
      btn.textContent = '❌ Cancelar reserva';
      return;
    }

    // Volver al calendario
    showAlert('calendario', '✅ Reserva ' + state.reservaIdActual + ' cancelada. El horario está libre.', 'success');
    document.getElementById('userNombre').textContent = state.nombre;
    document.getElementById('userTipo').textContent = state.tipo;
    document.getElementById('userApto').textContent = state.apto;
    await cargarCalendario();
    showView('calendario');

    // Limpiar estado
    state.reservaIdActual = null;
    state.fechaSeleccionada = null;
    state.slotSeleccionado = null;
  } catch (e) {
    showAlert('pago', 'Error de red: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = '❌ Cancelar reserva';
  }
}

// ============ FLUJO 7: MIS RESERVAS [V22 BUGFIX-015] ============
// Lista las reservas del solicitante y permite retomar/cancelar
// cada una sin necesidad de haber conservado el state.reservaIdActual.
async function cargarMisReservas() {
  const list = document.getElementById('misReservasList');
  list.innerHTML = '<p style="text-align:center; padding:20px;">Cargando...</p>';
  hideAlert('mis-reservas');

  try {
    const r = await apiGet({
      action: 'listarReservasPorApto',
      apto: state.apto,
      cc: state.cc
    });

    if (!r.ok) {
      list.innerHTML = '<p style="text-align:center; color:var(--err); padding:20px;">'
        + (r.error || 'Error al cargar las reservas') + '</p>';
      return;
    }

    // Actualizar info del header (puede haber cambiado)
    document.getElementById('userNombre4').textContent = r.nombre || state.nombre;
    document.getElementById('userApto4').textContent = state.apto;

    // Mostrar link de pago global si existe
    if (r.linkPago && state.linkPago !== r.linkPago) {
      state.linkPago = r.linkPago;
    }
    if (r.linkPago) {
      document.getElementById('linkPagoMisReservas').href = r.linkPago;
      document.getElementById('linkPagoBoxMisReservas').style.display = 'block';
    }

    const reservas = r.reservas || [];
    if (reservas.length === 0) {
      list.innerHTML = '<p style="text-align:center; color:var(--gris-med); padding:20px;">'
        + 'No tienes reservas todavía. Usa el calendario para crear la primera.'
        + '</p>';
      return;
    }

    list.innerHTML = '';
    reservas.forEach(function (res) {
      const li = document.createElement('li');
      li.className = 'reserva-item ' + claseEstado(res.estado);
      li.dataset.reservaId = res.id;

      const fecha = formatDate(res.fechaReserva);
      const slotTxt = res.slot === 'Mañana' ? '☀️ Mañana' : '🌆 Tarde';
      const estadoTxt = etiquetaEstado(res.estado);
      const tiempoLimite = (res.estado === 'PendientePago' && res.fechaLimitePago)
        ? '<br><small style="color:var(--err);">⏰ Límite de pago: ' + res.fechaLimitePago + '</small>'
        : '';

      // Botones según estado
      let acciones = '';
      if (res.estado === 'PendientePago') {
        acciones += '<button class="btn btn-primary btn-sm" data-accion="retomar" data-id="' + res.id + '">'
          + '📤 Subir comprobante</button> ';
        acciones += '<button class="btn btn-secondary btn-sm" data-accion="cancelar" data-id="' + res.id + '">'
          + '❌ Cancelar</button>';
      } else if (res.estado === 'Pagado') {
        acciones += '<span style="color:var(--ok); font-weight:600;">✅ ' + (res.tieneComprobante ? 'Comprobante verificado' : 'Pagado') + '</span>';
      } else {
        acciones += '<span style="color:var(--gris-med);">' + estadoTxt + '</span>';
      }

      li.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">'
        + '<div>'
        + '<strong style="font-family:monospace;">' + res.id + '</strong> · '
        + fecha + ' · ' + slotTxt
        + '<br><span style="font-size:0.85em;">' + estadoTxt + '</span>'
        + tiempoLimite
        + '</div>'
        + '<div style="display:flex; gap:6px; flex-wrap:wrap;">' + acciones + '</div>'
        + '</div>';

      list.appendChild(li);
    });

    // Event delegation: un solo listener para todos los botones
    list.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-accion]');
      if (!btn) return;
      const accion = btn.dataset.accion;
      const id = btn.dataset.id;
      const reserva = reservas.find(function (x) { return x.id === id; });
      if (!reserva) return;

      if (accion === 'retomar') {
        abrirReservaExistente(reserva);
      } else if (accion === 'cancelar') {
        state.reservaIdActual = id;
        state.fechaSeleccionada = reserva.fechaReserva;
        state.slotSeleccionado = reserva.slot;
        flujoCancelarReserva();
      }
    });

  } catch (e) {
    list.innerHTML = '<p style="text-align:center; color:var(--err); padding:20px;">'
      + 'Error de red: ' + e.message + '</p>';
  }
}

function claseEstado(estado) {
  switch (estado) {
    case 'PendientePago': return 'pendiente';
    case 'Pagado': return 'pagado';
    case 'Cancelado':
    case 'Expirado':
    case 'CanceladoPorAdmin': return 'cancelado';
    default: return '';
  }
}

function etiquetaEstado(estado) {
  switch (estado) {
    case 'PendientePago': return '⏳ Pendiente de pago';
    case 'Pagado': return '✅ Pagado';
    case 'Cancelado': return '❌ Cancelada';
    case 'Expirado': return '⌛ Expirada';
    case 'CanceladoPorAdmin': return '🚫 Cancelada por administrador';
    default: return estado;
  }
}

// Abre la vista de pago pre-cargando una reserva existente.
// Reutiliza view-pago existente sin modificar nada de su lógica.
function abrirReservaExistente(reserva) {
  state.reservaIdActual = reserva.id;
  state.fechaSeleccionada = reserva.fechaReserva;
  state.slotSeleccionado = reserva.slot;

  document.getElementById('userNombre3').textContent = state.nombre;
  document.getElementById('userApto3').textContent = state.apto;
  document.getElementById('pagoFecha').textContent = formatDate(reserva.fechaReserva);
  document.getElementById('pagoSlot').textContent = formatSlot(reserva.slot);

  const linkPago = state.linkPago || '#';
  document.getElementById('linkPago').href = linkPago;
  document.getElementById('linkPagoUrl').textContent = linkPago;

  // Limpiar upload previo
  document.getElementById('comprobanteInput').value = '';
  document.getElementById('fileName').textContent = '';
  document.getElementById('btnSubirComprobante').disabled = true;
  state.comprobanteBase64 = null;
  state.comprobanteNombre = null;
  state.comprobanteMime = null;

  hideAlert('pago');
  showView('pago');
}

// ============ FLUJO 8: VOLVER AL INICIO ============
function flujoVolverInicio() {
  // Limpiar estado
  state.apto = null;
  state.cc = null;
  state.numForm = null;
  state.nombre = null;
  state.tipo = null;
  state.celular = null;
  state.correo = null;
  state.enMora = false;
  state.mesesMora = 0;
  state.fechaSeleccionada = null;
  state.slotSeleccionado = null;
  state.reservaIdActual = null;
  state.comprobanteBase64 = null;
  state.comprobanteNombre = null;
  state.comprobanteMime = null;

  // Limpiar inputs
  document.getElementById('aptoInput').value = '';
  document.getElementById('ccInput').value = '';

  // Ocultar alertas
  ['login', 'mora', 'calendario', 'reservar', 'pago', 'mis-reservas', 'exito'].forEach(v => hideAlert(v));

  showView('login');
}

// ============ INIT / EVENT HANDLERS ============
document.addEventListener('DOMContentLoaded', () => {
  // Login
  document.getElementById('btnIngresar').addEventListener('click', flujoLogin);
  document.getElementById('aptoInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('ccInput').focus();
  });
  document.getElementById('ccInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') flujoLogin();
  });

  // Mora
  document.getElementById('btnVolverMora').addEventListener('click', flujoVolverInicio);

  // Calendario
  document.getElementById('btnVolverLogin').addEventListener('click', flujoVolverInicio);

  // Reservar (slot buttons)
  document.getElementById('btnSlotManana').addEventListener('click', () => flujoSeleccionarSlot('Mañana'));
  document.getElementById('btnSlotTarde').addEventListener('click', () => flujoSeleccionarSlot('Tarde'));
  document.getElementById('btnVolverCalendario').addEventListener('click', async () => {
    // Liberar la reserva pendiente antes de volver (si el usuario no ha pagado)
    if (state.reservaIdActual && state.fechaSeleccionada && state.slotSeleccionado) {
      const ok = confirm('Tienes una reserva pendiente (' + state.reservaIdActual + '). Si vuelves sin pagar, la reserva seguirá activa pero deberás subir el comprobante en otra sesión. ¿Volver al calendario de todas formas?');
      if (!ok) return;
      // Volver al calendario sin cancelar — la reserva sigue activa
      document.getElementById('userNombre').textContent = state.nombre;
      document.getElementById('userTipo').textContent = state.tipo;
      document.getElementById('userApto').textContent = state.apto;
      await cargarCalendario();
      showView('calendario');
      return;
    }
    document.getElementById('userNombre').textContent = state.nombre;
    document.getElementById('userTipo').textContent = state.tipo;
    document.getElementById('userApto').textContent = state.apto;
    await cargarCalendario();
    showView('calendario');
  });

  // Pago
  const comprobanteInput = document.getElementById('comprobanteInput');
  const uploadArea = document.getElementById('uploadArea');

  comprobanteInput.addEventListener('change', e => {
    handleFileSelect(e.target.files[0]);
  });

  // Drag & drop
  uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });
  uploadArea.addEventListener('click', e => {
    if (e.target === uploadArea || e.target.tagName === 'P') {
      comprobanteInput.click();
    }
  });

  document.getElementById('btnSubirComprobante').addEventListener('click', flujoSubirComprobante);
  document.getElementById('btnCancelarReserva').addEventListener('click', flujoCancelarReserva);

  // BUGFIX-015 [V22]: Mis reservas
  // BUGFIX-015c [V22.1]: showView se llama ANTES del await para dar feedback
  // inmediato al usuario (cold start de Apps Script puede tardar 30-60s).
  document.getElementById('btnMisReservas').addEventListener('click', async () => {
    showView('mis-reservas');
    await cargarMisReservas();
  });

  // BUGFIX-015b [V22.1]: Volver al calendario desde Mis reservas
  // El botón btnVolverCalDesdeMis en view-mis-reservas no tenía handler.
  // Al hacer click, se restaura el header del calendario y se recarga la grilla.
  document.getElementById('btnVolverCalDesdeMis').addEventListener('click', async () => {
    document.getElementById('userNombre').textContent = state.nombre;
    document.getElementById('userTipo').textContent = state.tipo;
    document.getElementById('userApto').textContent = state.apto;
    await cargarCalendario();
    showView('calendario');
  });

  // Éxito
  document.getElementById('btnVolverInicio').addEventListener('click', flujoVolverInicio);

  // Mostrar vista inicial
  showView('login');
});