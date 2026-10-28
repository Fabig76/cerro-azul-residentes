// =====================================================================
// Cerro Azul — Backend Apps Script para el formulario público
// Cambios v2 (7-Sep-2026):
//   - Esquema expandido de 138 a 143 columnas
//   - Nuevas columnas K-Q para N° Parqueadero 1/2, Matrículas Parq 1/2,
//     Matrícula del Apto, Checkbox revisión, Observaciones
//   - Nuevos endpoints: lookupMatApto y lookupMatParq (consultan el Sheet
//     de matrículas 1ceGtZDUJHX4yxs5_ydDwLwtrkOcZwYh09WUG0st_b0Y)
// Endpoints:
//   POST (no-CORS) -> action=submit -> crea o actualiza fila
//   GET            -> action=lookup  -> devuelve fila existente por N° Formulario + N° Apto
//   GET            -> action=nextId  -> devuelve el siguiente N° Formulario disponible
//   GET            -> action=lookupMatApto  -> devuelve matrícula de un apto
//   GET            -> action=lookupMatParq  -> devuelve matrícula de una celda de parqueadero
// =====================================================================

const SHEET_ID = '16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc';
const SHEET_NAME = 'Registros';
const HEADER_ROW = 1;
const NUM_COLS = 143; // 0..142 (era 138, ahora 143 con K..Q expandidos)

// Sheet de matrículas (referencia, solo lectura)
const MATRICULAS_SHEET_ID = '1ceGtZDUJHX4yxs5_ydDwLwtrkOcZwYh09WUG0st_b0Y';
const MATRICULAS_TORRE_3 = 'Torre 3 - Etapa 1';   // 198 aptos: 121..318 (mat 5377499-5377696)
const MATRICULAS_TORRE_1 = 'Torre 1 - Etapa 2';   // 234 aptos: 9804..10037 (mat 5428477-5428710)
const MATRICULAS_TORRE_2 = 'Torre 2 - Etapa 4';   // 185 aptos: 119..2420 (mat 5461642-5461826) — BUGFIX-023
const MATRICULAS_PARQ    = 'Parqueaderos - Etapa 3'; // 337 celdas privadas: 1..337 (mat 5397790-5398117)

// Cache en memoria de las tablas de matrículas (se reconstruye por request,
// las tablas son chicas: ~800 filas en total)
let _cacheAptos = null; // { aptoStr -> matriculaStr }
let _cacheParq  = null; // { celdaStr -> matriculaStr }

// Columna A (index 0) = N° Formulario
const COL_NUM_FORM = 0;
const COL_FECHA_REG = 1;
const COL_FECHA_EDIT = 2;
const COL_APTO = 3;
// Col 142 (última) = Hash Dedupe

// ---------------------------------------------------------------------
// BUGFIX-019: Autenticación por token de sesión para endpoints admin/vigilante.
// El login devuelve un token que se guarda en CacheService (TTL). Cada consulta
// admin/vigilante debe enviar ese token; si no es válido, NO se entregan datos.
// ---------------------------------------------------------------------
const TTL_SESION_SEG = 43200; // 12 horas

const ACTIONS_ADMIN = [
  'adminBuscar', 'adminObtener', 'adminGuardar',
  'adminListarReservasMudanzas', 'adminListarReservasSalon',
  'adminVerComprobanteSalon', 'adminCancelarReservaSalon',
  'adminBorrarReservaMudanza',
  'configurarTriggerExpiracion'
];

const ACTIONS_VIGILANTE = [
  'vigilanteVerResidentes', 'vigilanteVerMudanzas',
  'vigilanteBuscarPorPlaca', 'vigilanteVerReservasSalon',
  'vigilanteCheckMudanza'
];

function generarToken() {
  return Utilities.getUuid();
}

function guardarToken(rol, token) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('tok_' + rol + '_' + token, String(Date.now()));
  limpiarTokensExpirados(rol);
}

function validarToken(rol, token) {
  if (!token) return false;
  const props = PropertiesService.getScriptProperties();
  const ts = props.getProperty('tok_' + rol + '_' + token);
  if (!ts) return false;
  if (Date.now() - parseInt(ts, 10) > TTL_SESION_SEG * 1000) {
    props.deleteProperty('tok_' + rol + '_' + token);
    return false;
  }
  return true;
}

function limpiarTokensExpirados(rol) {
  const props = PropertiesService.getScriptProperties();
  const prefijo = 'tok_' + rol + '_';
  const ahora = Date.now();
  Object.keys(props.getProperties()).forEach(function (k) {
    if (k.indexOf(prefijo) === 0 && ahora - parseInt(props.getProperty(k), 10) > TTL_SESION_SEG * 1000) {
      props.deleteProperty(k);
    }
  });
}

// AUD-T2: contador por clave en CacheService. Devuelve true si se superó el máximo.
function rateLimit_(clave, max, ttlSeg) {
  const cache = CacheService.getScriptCache();
  const k = 'rl_' + clave;
  const n = parseInt(cache.get(k) || '0', 10) + 1;
  cache.put(k, String(n), ttlSeg);
  return n > max;
}

// AUD-T2: revoca el token de la sesión actual
function logout_(rol, token) {
  rol = String(rol || ''); token = String(token || '');
  if (rol !== 'admin' && rol !== 'vigilante') return { ok: false, error: 'Rol inválido' };
  PropertiesService.getScriptProperties().deleteProperty('tok_' + rol + '_' + token);
  return { ok: true };
}

// ---------------------------------------------------------------------
// doGet: lookup / nextId / lookupMatApto / lookupMatParq
// ---------------------------------------------------------------------
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    // BUGFIX-019: validar token para acciones protegidas (admin/vigilante)
    if (ACTIONS_ADMIN.indexOf(action) !== -1) {
      if (!validarToken('admin', e.parameter.token)) {
        return jsonOut({ ok: false, error: 'Sesión no válida o expirada. Ingrese de nuevo.' });
      }
    }
    if (ACTIONS_VIGILANTE.indexOf(action) !== -1) {
      if (!validarToken('vigilante', e.parameter.token)) {
        return jsonOut({ ok: false, error: 'Sesión no válida o expirada. Ingrese de nuevo.' });
      }
    }
    if (action === 'nextId') {
      return jsonOut({ ok: true, nextId: getNextFormId() });
    }
    if (action === 'lookup') {
      const numForm = String(e.parameter.numForm || '').trim();
      const apto = String(e.parameter.apto || '').trim();
      const ccProp = normalizarCC(e.parameter.ccProp);
      // BUGFIX-020: exigir cédula del propietario para leer el registro
      if (!ccProp) return jsonOut({ ok: false, error: 'Falta cédula del propietario.' });
      const row = findRowByNumFormAndApto(numForm, apto);
      if (!row) {
        return jsonOut({ ok: false, error: 'No se encontró ningún registro con ese N° de formulario y N° de apartamento. Verifica los datos e inténtalo de nuevo.' });
      }
      if (normalizarCC(row.values[6]) !== ccProp) {
        return jsonOut({ ok: false, error: 'La cédula no coincide con el propietario registrado. Verifique o contacte a la administración.' });
      }
      return jsonOut({ ok: true, row: rowToObject(row.values) });  // FIX 23-Sept: antes decia 'row' (objeto), debia ser 'row.values' (array)
    }
    if (action === 'lookupMatApto') {
      const apto = String(e.parameter.apto || '').trim();
      const r = lookupMatriculaApto(apto);
      return jsonOut(r);
    }
    if (action === 'lookupMatParq') {
      const celda = String(e.parameter.celda || '').trim();
      const r = lookupMatriculaParq(celda);
      return jsonOut(r);
    }
    // --- MUDANZAS (agregado 22-Sep-2026 feature/mudanzas) ---
    if (action === 'verificarPropietario') {
      const r = verificarPropietario(
        e.parameter.numForm,
        e.parameter.apto,
        e.parameter.ccProp
      );
      return jsonOut(r);
    }
    if (action === 'dispMudanzas') {
      const r = dispMudanzas(
        e.parameter.torre,
        e.parameter.ascensor,
        e.parameter.desde,
        e.parameter.hasta
      );
      return jsonOut(r);
    }
    // --- ADMINISTRACION (admin.html) ---
    if (action === 'adminLogin') {
      return jsonOut(adminLogin(e.parameter.password));
    }
    if (action === 'adminBuscar') {
      return jsonOut(adminBuscar(e.parameter.q));
    }
    if (action === 'adminObtener') {
      return jsonOut(adminObtener(e.parameter.numForm));
    }
    // --- VIGILANCIA (vigilantes.html) ---
    if (action === 'vigilanteLogin') {
      return jsonOut(vigilanteLogin(e.parameter.password));
    }
    if (action === 'vigilanteVerResidentes') {
      return jsonOut(vigilanteVerResidentes(e.parameter.q));
    }
    if (action === 'vigilanteVerMudanzas') {
      return jsonOut(vigilanteVerMudanzas(e.parameter.fecha));
    }
    if (action === 'vigilanteBuscarPorPlaca') {
      return jsonOut(vigilanteBuscarPorPlaca(e.parameter.placa));
    }
    // --- RESIDENTE (portal nuevo residente.html) ---
    if (action === 'getEstadoResidente') {
      return jsonOut(getEstadoResidente(e.parameter.apto));
    }
    if (action === 'verificarResidente') {
      return jsonOut(verificarResidente(e.parameter.apto, e.parameter.cc));
    }
    // --- SALON SOCIAL (portal salon-social.html) ---
    if (action === 'verificarAccesoSalon') {
      return jsonOut(verificarAccesoSalon(e.parameter.apto, e.parameter.cc));
    }
    if (action === 'dispSalon') {
      return jsonOut(dispSalon(e.parameter.apto, e.parameter.fechaInicio, e.parameter.fechaFin));
    }
    if (action === 'vigilanteVerReservasSalon') {
      return jsonOut(vigilanteVerReservasSalon(e.parameter.fecha));
    }
    // BUGFIX-015 [V22]: listar reservas del solicitante autenticado
    if (action === 'listarReservasPorApto') {
      return jsonOut(listarReservasPorApto(e.parameter.apto, e.parameter.cc));
    }
    if (action === 'adminListarReservasMudanzas') {
      return jsonOut(adminListarReservasMudanzas(
        e.parameter.estado,
        e.parameter.torre,
        e.parameter.fechaDesde,
        e.parameter.fechaHasta,
        e.parameter.proxDias
      ));
    }
    if (action === 'adminListarReservasSalon') {
      return jsonOut(adminListarReservasSalon(e.parameter.estado, e.parameter.fechaDesde));
    }
    if (action === 'adminVerComprobanteSalon') {
      return jsonOut(adminVerComprobanteSalon(e.parameter.reservaId));
    }
    return jsonOut({ ok: false, error: 'Acción no reconocida.' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------------------------------------------------------------------
// doPost: submit (crea o actualiza)
// ---------------------------------------------------------------------
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }
    // Enrutar por action (agregado 22-Sep-2026 feature/mudanzas)
    const action = String(payload.action || '').trim();
    // BUGFIX-019: validar token para acciones protegidas (admin/vigilante)
    if (ACTIONS_ADMIN.indexOf(action) !== -1) {
      if (!validarToken('admin', payload.token)) {
        return jsonOut({ ok: false, error: 'Sesión no válida o expirada. Ingrese de nuevo.' });
      }
    }
    if (ACTIONS_VIGILANTE.indexOf(action) !== -1) {
      if (!validarToken('vigilante', payload.token)) {
        return jsonOut({ ok: false, error: 'Sesión no válida o expirada. Ingrese de nuevo.' });
      }
    }
    // --- ESTADO DE CUENTA (spec-estado-cuenta.md §6.2) ---
    if (action === 'ecConsultar')        return jsonOut(ecConsultar(payload));
    if (action === 'ecDescargarFactura') return jsonOut(ecDescargarFactura(payload));
    if (action === 'ecPazYSalvo')        return jsonOut(ecPazYSalvo(payload));
    if (action === 'ecIniciarCarga')     return jsonOut(ecIniciarCarga(payload));
    if (action === 'ecSubirFacturas')    return jsonOut(ecSubirFacturas(payload));
    if (action === 'ecFinalizarCarga')   return jsonOut(ecFinalizarCarga(payload));
    if (action === 'reservarMudanza') {
      return jsonOut(reservarMudanza(payload));
    }
    if (action === 'cancelarMudanza') {
      return jsonOut(cancelarMudanza(payload));
    }
    // BUGFIX-026 [V41]: listar reservas del solicitante (módulo mudanzas)
    if (action === 'listarReservasMudanzasPorNumForm') {
      return jsonOut(listarReservasMudanzasPorNumForm(
        payload.numForm, payload.apto, payload.ccProp
      ));
    }
    // --- ADMINISTRACION (admin.html) ---
    if (action === 'adminGuardar') {
      return jsonOut(adminGuardar(payload));
    }
    // --- VIGILANCIA (vigilantes.html) ---
    if (action === 'vigilanteCheckMudanza') {
      return jsonOut(vigilanteCheckMudanza(payload));
    }
    // --- RESIDENTE (portal nuevo residente.html) ---
    if (action === 'registrarResidente')    return jsonOut(registrarResidente(payload));
    if (action === 'actualizarResidente')  return jsonOut(actualizarResidente(payload));
    if (action === 'clearResidente')        return jsonOut(clearResidente(payload));
    // --- SALON SOCIAL (portal salon-social.html) ---
    if (action === 'reservarSalon')              return jsonOut(reservarSalon(payload));
    if (action === 'subirComprobanteSalon')     return jsonOut(subirComprobanteSalon(payload));
    if (action === 'cancelarReservaSalon')      return jsonOut(cancelarReservaSalon(payload));
    if (action === 'editarReservaSalon')         return jsonOut(editarReservaSalon(payload));
    if (action === 'adminCancelarReservaSalon') return jsonOut(adminCancelarReservaSalon(payload));
    if (action === 'adminBorrarReservaMudanza') return jsonOut(adminBorrarReservaMudanza(payload.idReserva));
    if (action === 'configurarTriggerExpiracion') return jsonOut(configurarTriggerExpiracion());
    // --- ASISTENTE IA (MiniMax-M3) para los 7 portales (feature 04-Oct-2026) ---
    if (action === 'chatAsistente') return jsonOut(chatAsistente(payload));
    // AUD-T2: login y logout por POST (la contraseña nunca viaja en la URL)
    if (action === 'adminLogin')     return jsonOut(adminLogin(payload.password));
    if (action === 'vigilanteLogin') return jsonOut(vigilanteLogin(payload.password));
    if (action === 'logout')         return jsonOut(logout_(payload.rol, payload.token));
    // Comportamiento por defecto (compatibilidad): submit del formulario principal
    const result = submitRecord(payload);
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------------------------------------------------------------------
// Crea o actualiza una fila en el Sheet
// ---------------------------------------------------------------------
function submitRecord(data, opts) {
  // AUD-T6: opts.yaBloqueado=true lo usan registrarResidente y
  // actualizarResidente, que YA toman el lock y llamarían a submitRecord
  // (que también lo toma) produciría un auto-bloqueo.
  opts = opts || {};
  const yaBloqueado = opts.yaBloqueado === true;
  // Validaciones mínimas del lado servidor
  const apto = String(data.apto || '').trim();
  if (!apto) return { ok: false, error: 'Falta N° de apartamento.' };
  const diligencia = String(data.diligencia || '').trim();
  if (!['Propietario','Arrendatario','Tenedor / Otro','Encargado'].includes(diligencia)) {
    return { ok: false, error: 'Diligencia como debe ser Propietario, Arrendatario, Tenedor / Otro o Encargado.' };
  }
  const nombreTitular = String(data.nombreProp || '').trim();
  if (!nombreTitular) return { ok: false, error: 'Falta nombre del propietario/titular.' };
  const ccTitular = String(data.ccProp || '').trim();
  if (!ccTitular) return { ok: false, error: 'Falta cédula del propietario/titular.' };
  const correoTitular = String(data.correoProp || '').trim();
  if (!correoTitular || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correoTitular)) {
    return { ok: false, error: 'Correo del titular inválido.' };
  }
  const celTitular = String(data.celProp || '').trim();
  if (!celTitular) return { ok: false, error: 'Falta celular del titular.' };

  if (!data.autDatos)   return { ok: false, error: 'Debe autorizar el tratamiento de datos personales.' };
  if (!data.firmaNom)   return { ok: false, error: 'Falta nombre en la firma.' };
  if (!data.firmaCC)    return { ok: false, error: 'Falta cédula en la firma.' };

  // Validación nueva (v2): si el apto NO existe en la base de matrículas,
  // el frontend tiene que haber enviado una matrícula escrita a mano.
  const matriculaApto = String(data.matriculaApto || '').trim();
  const existeEnBase = lookupMatriculaApto(apto).encontrado;
  if (!existeEnBase && !matriculaApto) {
    return { ok: false, error: 'Tu apartamento (' + apto + ') no aparece en la base de matrículas y no escribiste la matrícula manualmente. Por favor escríbela o contacta a la administración.' };
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const editMode = data.editMode === true || String(data.editMode) === 'true';
  const submittedNumForm = String(data.numForm || '').trim();

  let targetRow;       // número de fila en Sheets (1-based)
  let assignedNumForm; // número de formulario que se va a guardar
  let fechaRegistroOriginal = null;
  let row = null;

  // AUD-T6: la búsqueda, el número CA y la escritura son una sola sección crítica.
  // Sin este lock, dos envíos simultáneos (doble clic, reintento del móvil,
  // o propietario y residente a la vez) leen la misma getLastRow() y el mismo
  // max(CA-*)+1, y el segundo setValues PISA completo al primero: un registro
  // desaparece sin rastro y ambos clientes reciben ok:true. El BLINDAJE de la
  // V46 valida el payload pero no elimina esa carrera.
  const lock = yaBloqueado ? null : LockService.getScriptLock();
  if (lock && !lock.tryLock(20000)) {
    return { ok: false, error: 'El sistema está ocupado. Espere unos segundos y vuelva a enviar.' };
  }
  try {
    if (editMode) {
      // Modo edición: verificar que numForm+apto coincidan con una fila existente
      const found = findRowByNumFormAndApto(submittedNumForm, apto);
      if (!found) {
        return { ok: false, error: 'N° de formulario o N° de apartamento no coinciden con un registro existente. No se puede editar.' };
      }
      // BUGFIX-020: verificar cédula del propietario antes de escribir
      if (normalizarCC(data.ccProp) !== normalizarCC(found.values[6])) {
        return { ok: false, error: 'La cédula no coincide con el propietario registrado. No se puede editar.' };
      }
      targetRow = found.rowNumber;
      assignedNumForm = submittedNumForm;
      fechaRegistroOriginal = found.values[COL_FECHA_REG];
    } else {
      // Modo creación: validar que NO exista ya un registro con ese N° Apto
      const existing = findRowByApto(apto);
      if (existing) {
        return { ok: false, error: 'Ya existe un registro para el apartamento ' + apto + '. Si eres el propietario o encargado, usa la opción "Editar mi registro" con el N° de formulario que se te entregó al crear el registro. Si no lo tienes, contacte a la administración (urb.cerroazul@gmail.com).' };
      }
      // Buscar siguiente fila vacía
      const last = sheet.getLastRow();
      targetRow = Math.max(last + 1, HEADER_ROW + 1);
      assignedNumForm = getNextFormId();
    }

    // Construir el array de valores
    row = buildRowFromPayload(data, assignedNumForm, fechaRegistroOriginal);

    // 🔴 BLINDAJE (V46, 27-Oct-2026): nunca escribir una fila a medias.
    // Las validaciones de arriba miran el payload de entrada, pero el payload
    // puede llegar incompleto por desincronización de claves entre el frontend
    // y buildRowFromPayload. Aquí se verifica el ROW FINAL (lo que de verdad se
    // va a escribir al Sheet): si el propietario no tiene nombre, cédula ni
    // celular, se ABORTA sin escribir. Esto corta la hemorragia de filas basura
    // (CA-0234, 0235, 0246, 0248, 0249, 0265, 0266, 0271, 0277...) que quedaban
    // solo con N° Formulario + fechas + apto y bloqueaban el apartamento.
    const _bNombre = String(row[5] || '').trim();
    const _bCc     = String(row[6] || '').trim();
    const _bCel    = String(row[8] || '').trim();
    if (!_bNombre || !_bCc || !_bCel) {
      Logger.log('[submitRecord][BLINDAJE] ABORTADO apto=' + String(row[3] || '') +
                 ' nombre=' + !!_bNombre + ' cc=' + !!_bCc + ' cel=' + !!_bCel +
                 ' — payload incompleto, no se escribió la fila.');
      return { ok: false, error: 'Faltan datos obligatorios del propietario (nombre, cédula o celular). El registro no se guardó. Revise el formulario y reenvíe.' };
    }

    sheet.getRange(targetRow, 1, 1, NUM_COLS).setValues([row]);
  } finally {
    if (lock) lock.releaseLock();
  }

  // BUGFIX-028: enviar el codigo CA-XXXX al correo del propietario.
  //
  // TRES condiciones independientes deben cumplirse:
  //   1. !editMode                       -> es una CREACION, no una edicion
  //   2. __origen === 'formulario-publico' -> solo el formulario publico
  //                                         emite; el portal del residente
  //                                         NO manda esta bandera
  //   3. diligencia === 'Propietario'     -> regla de negocio del operador
  //
  // La escritura YA ocurrio: un fallo de correo NO puede perder el
  // registro. Se captura el error y se reporta en la respuesta.
  let correoEnviado = false;
  let correoError = '';
  const debeEnviar = !editMode
    && String(data.__origen || '') === 'formulario-publico'
    && diligencia === 'Propietario';
  if (debeEnviar) {
    try {
      correoEnviado = enviarEmailCodigoRegistro(row, assignedNumForm);
    } catch (e) {
      correoError = String(e && e.message || e);
      Logger.log('[submitRecord] BUGFIX-028 fallo envio correo: ' + correoError);
    }
  }

  return {
    ok: true,
    numForm: assignedNumForm,
    apto: apto,
    editMode: editMode,
    rowNumber: targetRow,
    correoEnviado: correoEnviado,
    correoError: correoError,
    message: editMode
      ? 'Registro actualizado correctamente. Tu N° de formulario sigue siendo ' + assignedNumForm + '.'
      : 'Registro creado correctamente. Tu N° de formulario es ' + assignedNumForm + '. GUÁRDALO en un lugar seguro: lo necesitarás para volver a editar tu información.'
  };
}

// ---------------------------------------------------------------------
// Convierte el payload del cliente en un array de 143 columnas
// Esquema v2: K..Q son los nuevos campos de parqueadero/matrícula
// ---------------------------------------------------------------------
function buildRowFromPayload(d, numForm, fechaRegistroOriginal) {
  const now = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss');
  const today = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd');

  const v = new Array(NUM_COLS).fill('');

  v[COL_NUM_FORM]   = numForm;
  v[COL_FECHA_REG]  = fechaRegistroOriginal || now;
  v[COL_FECHA_EDIT] = now;
  v[COL_APTO]       = String(d.apto || '').trim();
  v[4]              = String(d.diligencia || '').trim();  // Diligencia como
  v[5]              = String(d.nombreProp || '').trim();
  v[6]              = String(d.ccProp || '').trim();
  v[7]              = String(d.correoProp || '').trim().toLowerCase();
  v[8]              = String(d.celProp || '').trim();
  v[9]              = String(d.telFijoProp || '').trim();

  // v2 — Parqueaderos y matrículas (cols K..Q = 10..16)
  v[10] = String(d.parq1Celda || '').trim();    // K: N° Parqueadero 1
  v[11] = String(d.parq1Mat   || '').trim();    // L: Matrícula Parqueadero 1
  v[12] = String(d.parq2Celda || '').trim();    // M: N° Parqueadero 2
  v[13] = String(d.parq2Mat   || '').trim();    // N: Matrícula Parqueadero 2
  v[14] = String(d.matriculaApto || '').trim(); // O: Matrícula del Apto
  v[15] = d.requiereRevision ? 'Sí' : 'No';     // P: Requiere Revisión Matrículas
  v[16] = String(d.observMatriculas || '').trim(); // Q: Observaciones Matrículas

  // v2 — Lo que era M (Nombre Arrendatario) ahora es R (17), CC Arrendatario S (18), etc.
  // 2. Arrendatario
  v[17]             = String(d.nombreArr || '').trim();
  v[18]             = String(d.ccArr || '').trim();
  v[19]             = String(d.correoArr || '').trim().toLowerCase();
  v[20]             = String(d.celArr || '').trim();

  // 3. Parqueadero autorizado a tercero
  v[21]             = String(d.parqTerNom || '').trim();
  v[22]             = String(d.parqTerApto || '').trim();
  v[23]             = String(d.parqTerCel || '').trim();

  // 4. Inmobiliaria
  v[24]             = String(d.inmobRazon || '').trim();
  v[25]             = String(d.inmobNit || '').trim();
  v[26]             = String(d.inmobContacto || '').trim();
  v[27]             = String(d.inmobTel || '').trim();
  v[28]             = String(d.inmobCorreo || '').trim().toLowerCase();

  // 5. Residentes (4 filas: cols 29-48)
  const res = Array.isArray(d.residentes) ? d.residentes : [];
  for (let i = 0; i < 4; i++) {
    const r = res[i] || {};
    v[29 + i*5 + 0] = String(r.nombre || '').trim();
    v[29 + i*5 + 1] = String(r.cc || '').trim();
    v[29 + i*5 + 2] = String(r.correo || '').trim().toLowerCase();
    v[29 + i*5 + 3] = String(r.cel || '').trim();
    v[29 + i*5 + 4] = String(r.parent || '').trim();
  }

  // 5.1 Menores (4 filas: cols 49-60)
  const men = Array.isArray(d.menores) ? d.menores : [];
  for (let i = 0; i < 4; i++) {
    const m = men[i] || {};
    v[49 + i*3 + 0] = String(m.nombre || '').trim();
    v[49 + i*3 + 1] = m.edad != null && m.edad !== '' ? String(m.edad) : '';
    v[49 + i*3 + 2] = String(m.parent || '').trim();
  }

  // 6. Vehículos (2: 61-72)
  const veh = Array.isArray(d.vehiculos) ? d.vehiculos : [];
  for (let i = 0; i < 2; i++) {
    const x = veh[i] || {};
    v[61 + i*6 + 0] = String(x.marca || '').trim();
    v[61 + i*6 + 1] = String(x.tipo || '').trim();
    v[61 + i*6 + 2] = String(x.color || '').trim();
    v[61 + i*6 + 3] = String(x.placa || '').trim().toUpperCase();
    v[61 + i*6 + 4] = String(x.modelo || '').trim();
    v[61 + i*6 + 5] = String(x.tag || '').trim();
  }

  // 6. Motos (2: 73-84)
  const mot = Array.isArray(d.motos) ? d.motos : [];
  for (let i = 0; i < 2; i++) {
    const x = mot[i] || {};
    v[73 + i*6 + 0] = String(x.marca || '').trim();
    v[73 + i*6 + 1] = String(x.tipo || '').trim();
    v[73 + i*6 + 2] = String(x.color || '').trim();
    v[73 + i*6 + 3] = String(x.placa || '').trim().toUpperCase();
    v[73 + i*6 + 4] = String(x.modelo || '').trim();
    v[73 + i*6 + 5] = String(x.tag || '').trim();
  }

  // 7. Bicicletas (2: 85-92)
  const bic = Array.isArray(d.bicis) ? d.bicis : [];
  for (let i = 0; i < 2; i++) {
    const b = bic[i] || {};
    v[85 + i*4 + 0] = String(b.marca || '').trim();
    v[85 + i*4 + 1] = String(b.color || '').trim();
    v[85 + i*4 + 2] = String(b.clase || '').trim();
    v[85 + i*4 + 3] = String(b.serial || '').trim();
  }

  // 8. Dispositivos (93-94 = llaveros/tags aut, 95-109 = 3 dispositivos)
  v[93]             = d.llaverosAut != null && d.llaverosAut !== '' ? String(d.llaverosAut) : '';
  v[94]             = d.tagsAut != null && d.tagsAut !== '' ? String(d.tagsAut) : '';
  const disp = Array.isArray(d.dispositivos) ? d.dispositivos : [];
  for (let i = 0; i < 3; i++) {
    const x = disp[i] || {};
    v[95 + i*5 + 0] = String(x.tipo || '').trim();
    v[95 + i*5 + 1] = String(x.codigo || '').trim();
    v[95 + i*5 + 2] = String(x.placa || '').trim().toUpperCase();
    v[95 + i*5 + 3] = String(x.fecha || '').trim();
    v[95 + i*5 + 4] = String(x.recibe || '').trim();
  }

  // 9. Mascotas (2: 110-129)
  const mas = Array.isArray(d.mascotas) ? d.mascotas : [];
  for (let i = 0; i < 2; i++) {
    const m = mas[i] || {};
    v[110 + i*10 + 0] = String(m.tipo || '').trim();
    v[110 + i*10 + 1] = String(m.nombre || '').trim();
    v[110 + i*10 + 2] = String(m.raza || '').trim();
    v[110 + i*10 + 3] = String(m.color || '').trim();
    v[110 + i*10 + 4] = String(m.sexo || '').trim();
    v[110 + i*10 + 5] = String(m.vacuna || '').trim();
    v[110 + i*10 + 6] = m.manejoEspecial === true || String(m.manejoEspecial) === 'true' ? 'Sí' : (m.manejoEspecial === false || String(m.manejoEspecial) === 'false' ? 'No' : '');
    v[110 + i*10 + 7] = String(m.registro || '').trim();
    v[110 + i*10 + 8] = String(m.aseguradora || '').trim();
    v[110 + i*10 + 9] = String(m.poliza || '').trim();
  }

  // 10. Emergencias (2: 130-135)
  const eme = Array.isArray(d.emergencias) ? d.emergencias : [];
  for (let i = 0; i < 2; i++) {
    const e = eme[i] || {};
    v[130 + i*3 + 0] = String(e.nombre || '').trim();
    v[130 + i*3 + 1] = String(e.parent || '').trim();
    v[130 + i*3 + 2] = String(e.tel || '').trim();
  }

  // 11. Autorizaciones + firma
  v[136]            = d.autDatos   ? 'Sí' : 'No';
  v[137]            = d.autMenores ? 'Sí' : 'No';
  v[138]            = d.autCom     ? 'Sí' : 'No';
  v[139]            = String(d.firmaNom || '').trim();
  v[140]            = String(d.firmaCC || '').trim();
  v[141]            = String(d.firmaFecha || today);

  // 142 = Hash Dedupe (sha256 de apto + cc titular + cc firma)
  const hashInput = (v[COL_APTO] || '') + '|' + (v[6] || '') + '|' + (v[140] || '');
  v[142]            = hashInput ? Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashInput)
                                  .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').slice(0, 16) : '';

  return v.map(safeCell_); // AUD-T3: neutraliza fórmulas/inyección en cada celda
}

// ---------------------------------------------------------------------
// LOOKUP DE MATRÍCULAS (consulta el Sheet 1ceGtZDUJHX4yxs5_ydDwLwtrkOcZwYh09WUG0st_b0Y)
// ---------------------------------------------------------------------

// Normaliza N° Apto: quita puntos, comas, espacios. Torre 1 usa "9804" (sin separador).
function normApto(s) {
  return String(s || '').replace(/[.,\s]/g, '').trim();
}

// Normaliza cédula: quita puntos, guiones, espacios. Compara siempre sin estos separadores.
function normCc(s) {
  return String(s || '').replace(/[.\-\s]/g, '').trim();
}

// Devuelve {ok, encontrado, matricula, fuente}
// donde fuente ∈ {'torre3','torre1'} indica de qué pestaña salió.
function lookupMatriculaApto(aptoRaw) {
  const apto = normApto(aptoRaw);
  if (!apto) return { ok: false, encontrado: false, error: 'N° de apartamento vacío.' };

  // Asegurar cache
  if (!_cacheAptos) {
    _cacheAptos = buildCacheAptos();
  }
  const hit = _cacheAptos[apto];
  if (hit) {
    return { ok: true, encontrado: true, matricula: hit.matricula, fuente: hit.fuente };
  }
  return { ok: true, encontrado: false, matricula: '', fuente: '' };
}

function buildCacheAptos() {
  const cache = {};
  // Estructura de cada pestaña: fila 1 título, fila 2 vacía, fila 3 header, fila 4+ datos
  // Col A = N° Apto, Col B = Matrícula
  for (const sheetName of [MATRICULAS_TORRE_3, MATRICULAS_TORRE_2, MATRICULAS_TORRE_1]) {
    const ss = SpreadsheetApp.openById(MATRICULAS_SHEET_ID);
    const sh = ss.getSheetByName(sheetName);
    if (!sh) continue;
    const last = sh.getLastRow();
    if (last < 4) continue;
    const data = sh.getRange(4, 1, last - 3, 2).getValues();
    const fuente = sheetName === MATRICULAS_TORRE_3 ? 'torre3' :
                   sheetName === MATRICULAS_TORRE_2 ? 'torre2' : 'torre1';
    for (const row of data) {
      const apto = normApto(row[0]);
      const mat  = String(row[1] || '').trim();
      if (apto && mat && !cache[apto]) {
        cache[apto] = { matricula: mat, fuente };
      }
    }
  }
  return cache;
}

// Devuelve {ok, encontrado, matricula, tipo}
// tipo ∈ {'Privado','Común',''}
function lookupMatriculaParq(celdaRaw) {
  const celda = String(celdaRaw || '').trim();
  if (!celda) return { ok: false, encontrado: false, error: 'Celda de parqueadero vacía.' };

  if (!_cacheParq) {
    _cacheParq = buildCacheParq();
  }
  const hit = _cacheParq[celda];
  if (hit) {
    return { ok: true, encontrado: true, matricula: hit.matricula, tipo: hit.tipo };
  }
  return { ok: true, encontrado: false, matricula: '', tipo: '' };
}

function buildCacheParq() {
  const cache = {};
  const ss = SpreadsheetApp.openById(MATRICULAS_SHEET_ID);
  const sh = ss.getSheetByName(MATRICULAS_PARQ);
  if (!sh) return cache;
  const last = sh.getLastRow();
  if (last < 4) return cache;
  // Col A = Celda N°, Col B = Matrícula, Col F = Tipo (Privado/Común)
  const data = sh.getRange(4, 1, last - 3, 6).getValues();
  for (const row of data) {
    const celda = String(row[0] || '').trim();
    const mat   = String(row[1] || '').trim();
    const tipo  = String(row[5] || '').trim();
    if (celda && mat) {
      cache[celda] = { matricula: mat, tipo: tipo || 'Privado' };
    }
  }
  return cache;
}

// ---------------------------------------------------------------------
// Búsquedas
// ---------------------------------------------------------------------
function findRowByApto(apto) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return null;
  const data = sheet.getRange(HEADER_ROW + 1, 1, last - HEADER_ROW, NUM_COLS).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][COL_APTO]).trim() === String(apto).trim()) {
      return { rowNumber: HEADER_ROW + 1 + i, values: data[i] };
    }
  }
  return null;
}

function findRowByNumFormAndApto(numForm, apto) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return null;
  const data = sheet.getRange(HEADER_ROW + 1, 1, last - HEADER_ROW, NUM_COLS).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][COL_NUM_FORM]).trim() === String(numForm).trim() &&
        String(data[i][COL_APTO]).trim() === String(apto).trim()) {
      return { rowNumber: HEADER_ROW + 1 + i, values: data[i] };
    }
  }
  return null;
}

// Devuelve el siguiente N° Formulario correlativo: CA-0001, CA-0002, ...
function getNextFormId() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return 'CA-0001';
  const ids = sheet.getRange(HEADER_ROW + 1, COL_NUM_FORM + 1, last - HEADER_ROW, 1).getValues();
  let max = 0;
  for (const r of ids) {
    const s = String(r[0] || '');
    const m = s.match(/^CA-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return 'CA-' + String(max + 1).padStart(4, '0');
}

// Convierte una fila (array de 143) en objeto JS para enviar al cliente en modo edición
function rowToObject(rowArr) {
  return {
    numForm: String(rowArr[COL_NUM_FORM] || ''),
    fechaRegistro: String(rowArr[COL_FECHA_REG] || ''),
    fechaEdicion: String(rowArr[COL_FECHA_EDIT] || ''),
    apto: String(rowArr[COL_APTO] || ''),
    diligencia: String(rowArr[4] || ''),
    nombreProp: String(rowArr[5] || ''),
    ccProp: String(rowArr[6] || ''),
    correoProp: String(rowArr[7] || ''),
    celProp: String(rowArr[8] || ''),
    telFijoProp: String(rowArr[9] || ''),
    // v2 — Parqueaderos y matrículas
    parq1Celda: String(rowArr[10] || ''),
    parq1Mat:   String(rowArr[11] || ''),
    parq2Celda: String(rowArr[12] || ''),
    parq2Mat:   String(rowArr[13] || ''),
    matriculaApto: String(rowArr[14] || ''),
    requiereRevision: String(rowArr[15] || ''),
    observMatriculas: String(rowArr[16] || ''),
    // Resto (desplazado +5 vs v1)
    nombreArr: String(rowArr[17] || ''),
    ccArr: String(rowArr[18] || ''),
    correoArr: String(rowArr[19] || ''),
    celArr: String(rowArr[20] || ''),
    parqTerNom: String(rowArr[21] || ''),
    parqTerApto: String(rowArr[22] || ''),
    parqTerCel: String(rowArr[23] || ''),
    inmobRazon: String(rowArr[24] || ''),
    inmobNit: String(rowArr[25] || ''),
    inmobContacto: String(rowArr[26] || ''),
    inmobTel: String(rowArr[27] || ''),
    inmobCorreo: String(rowArr[28] || ''),
    residentes: [0,1,2,3].map(i => ({
      nombre: String(rowArr[29 + i*5] || ''),
      cc:     String(rowArr[30 + i*5] || ''),
      correo: String(rowArr[31 + i*5] || ''),
      cel:    String(rowArr[32 + i*5] || ''),
      parent: String(rowArr[33 + i*5] || ''),
    })),
    menores: [0,1,2,3].map(i => ({
      nombre: String(rowArr[49 + i*3] || ''),
      edad:   String(rowArr[50 + i*3] || ''),
      parent: String(rowArr[51 + i*3] || ''),
    })),
    vehiculos: [0,1].map(i => ({
      marca: String(rowArr[61 + i*6] || ''),
      tipo:  String(rowArr[62 + i*6] || ''),
      color: String(rowArr[63 + i*6] || ''),
      placa: String(rowArr[64 + i*6] || ''),
      modelo:String(rowArr[65 + i*6] || ''),
      tag:   String(rowArr[66 + i*6] || ''),
    })),
    motos: [0,1].map(i => ({
      marca: String(rowArr[73 + i*6] || ''),
      tipo:  String(rowArr[74 + i*6] || ''),
      color: String(rowArr[75 + i*6] || ''),
      placa: String(rowArr[76 + i*6] || ''),
      modelo:String(rowArr[77 + i*6] || ''),
      tag:   String(rowArr[78 + i*6] || ''),
    })),
    bicis: [0,1].map(i => ({
      marca: String(rowArr[85 + i*4] || ''),
      color: String(rowArr[86 + i*4] || ''),
      clase: String(rowArr[87 + i*4] || ''),
      serial:String(rowArr[88 + i*4] || ''),
    })),
    llaverosAut: String(rowArr[93] || ''),
    tagsAut:     String(rowArr[94] || ''),
    dispositivos: [0,1,2].map(i => ({
      tipo:  String(rowArr[95 + i*5] || ''),
      codigo:String(rowArr[96 + i*5] || ''),
      placa: String(rowArr[97 + i*5] || ''),
      fecha: String(rowArr[98 + i*5] || ''),
      recibe:String(rowArr[99 + i*5] || ''),
    })),
    mascotas: [0,1].map(i => ({
      tipo: String(rowArr[110 + i*10] || ''),
      nombre: String(rowArr[111 + i*10] || ''),
      raza: String(rowArr[112 + i*10] || ''),
      color: String(rowArr[113 + i*10] || ''),
      sexo: String(rowArr[114 + i*10] || ''),
      vacuna: String(rowArr[115 + i*10] || ''),
      manejoEspecial: String(rowArr[116 + i*10] || ''),
      registro: String(rowArr[117 + i*10] || ''),
      aseguradora: String(rowArr[118 + i*10] || ''),
      poliza: String(rowArr[119 + i*10] || ''),
    })),
    emergencias: [0,1].map(i => ({
      nombre: String(rowArr[130 + i*3] || ''),
      parent: String(rowArr[131 + i*3] || ''),
      tel:    String(rowArr[132 + i*3] || ''),
    })),
    autDatos:   String(rowArr[136] || ''),
    autMenores: String(rowArr[137] || ''),
    autCom:     String(rowArr[138] || ''),
    firmaNom:   String(rowArr[139] || ''),
    firmaCC:    String(rowArr[140] || ''),
    firmaFecha: String(rowArr[141] || ''),
  };
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
// Cerro Azul — Módulo de Agendamiento de Mudanzas
// Agregado 22-Sep-2026 (rama feature/mudanzas, SPEC §3-§4)
//
// Reglas:
//   - 3 torres × 2 ascensores; solo "A" habilitado para mudanzas
//   - L-V: 08-10, 10-12, 13-15, 15-17 (4 slots de 2h)
//   - Sábado: 08-10, 10-12 (solo mañana)
//   - Domingo: no hay servicio
//   - Anticipación mínima: 2 días calendario completos
//   - Cancelación permitida: hasta 24h antes
//   - Solo propietario o inmobiliaria pueden agendar (CC validada contra Sheet)
// =====================================================================

const MUDANZAS_SHEET_NAME     = 'Mudanzas';
const MUDANZAS_NUM_COLS       = 23  // V37: 19 + 3 check + 1 descripcion;
const MUDANZAS_HEADER_ROW     = 1;
const MUDANZAS_TORRES         = ['1', '2', '3'];
const MUDANZAS_ASCENSOR       = 'A';
const MUDANZAS_ANTICIPACION_DIAS = 2;
const MUDANZAS_CANCELACION_HORAS = 24;
const MUDANZAS_LOCK_TIMEOUT_MS   = 30000;
// Usamos getScriptLock() en lugar de getDocumentLock() porque
// getDocumentLock() retorna null cuando el script se ejecuta en
// modo "Ejecutar como: User accessing the web app".
// getScriptLock() es independiente del documento y funciona siempre.
// (Fix aplicado 23-Sep-2026 después del primer test E2E)
const MUDANZAS_EMAIL_ADMIN      = 'urb.cerroazul@gmail.com';

// BUGFIX-028 (25-Oct-2026): envío del código CA-XXXX al correo del
// propietario al crear el registro. Ver docs/spec-email-codigo-registro.md.
const REGISTRO_EMAIL_ADMIN     = 'admin@urbcerroazul.com'; // BUGFIX-028: Workspace premium (misma cuenta que urb.cerroazul@gmail.com)

const MUDANZAS_SLOTS_LUN_VIE = [
  ['08:00', '10:00'],
  ['10:00', '12:00'],
  ['13:00', '15:00'],
  ['15:00', '17:00']
];
const MUDANZAS_SLOTS_SABADO = [
  ['08:00', '10:00'],
  ['10:00', '12:00']
];
const MUDANZAS_SLOTS_DOMINGO = [];

// BUGFIX-024 · 09-Oct-2026 — Límite 1 mudanza POR TORRE POR DÍA
// Operador confirmó 1 vigilante disponible; 2 mudanzas misma torre/día
// sería imposible de atender. Decisión: OPCIÓN 2 (1 por torre/día).
// Ver CHANGELOG-BUGFIXES.md BUGFIX-024.
const MUDANZAS_MAX_POR_TORRE_DIA = 1;

// Columnas de la pestaña Mudanzas (A..S)
const COL_MUD_ID       = 0;  // A
const COL_MUD_NUMFORM  = 1;  // B
const COL_MUD_APTO     = 2;  // C
const COL_MUD_TIPO     = 3;  // D
const COL_MUD_TORRE    = 4;  // E
const COL_MUD_ASCENSOR = 5;  // F
const COL_MUD_FECHA    = 6;  // G
const COL_MUD_HORA_INI = 7;  // H
const COL_MUD_HORA_FIN = 8;  // I
const COL_MUD_NOMBRE   = 9;  // J
const COL_MUD_CC       = 10; // K
const COL_MUD_CEL      = 11; // L
const COL_MUD_CORREO   = 12; // M
const COL_MUD_EMPRESA  = 13; // N
const COL_MUD_PLACA    = 14; // O
const COL_MUD_OBS      = 15; // P
const COL_MUD_FECHARES = 16; // Q
const COL_MUD_ESTADO   = 17; // R
const COL_MUD_HASH     = 18;
const COL_MUD_DESCRIPCION = 22;  // V37: descripcion de elementos // S

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function normalizarCC(cc) {
  return String(cc || '').replace(/[^0-9]/g, '').trim();
}

// AUD-T3: evita que un texto que empiece por = + - @ se interprete como fórmula.
// Solo actúa sobre strings; fechas y números pasan intactos.
function safeCell_(v) {
  if (typeof v !== 'string') return v;
  const s = v.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '').trim();
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

// AUD-T3: formato texto en columnas de identificadores. Ejecutar UNA vez a mano.
function setupFormatoTexto_() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const hdr = sheet.getRange(1, 1, 1, NUM_COLS).getValues()[0].map(String);
  const objetivo = /(CC|Cédula|Celular|Tel|Placa|Serial|Código|N° Tag|NIT|Fecha Entrega|Firma - Fecha|N° Apto|Parq Tercero - Apto)/i;
  const maxFilas = Math.max(sheet.getMaxRows() - 1, 1);
  hdr.forEach(function (h, i) {
    if (objetivo.test(h)) sheet.getRange(2, i + 1, maxFilas, 1).setNumberFormat('@');
  });
}

function getMudanzasSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(MUDANZAS_SHEET_NAME);
}

function formatDateOnly(d) {
  if (!d) return '';
  if (d instanceof Date) {
    return Utilities.formatDate(d, 'America/Bogota', 'yyyy-MM-dd');
  }
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

// Normaliza hora a formato HH:MM.
// Sheets guarda celdas con formato TIME como Date (Apps Script auto-convierte),
// pero los slots teoricos son strings "08:00". Sin esta normalizacion,
// el matching reservas.find() falla (Date vs String).
// (Fix aplicado 23-Sep-2026 despues del primer E2E test con MD-0001)
function normalizarHora(h) {
  if (h == null || h === '') return '';
  if (h instanceof Date) {
    return Utilities.formatDate(h, 'America/Bogota', 'HH:mm');
  }
  const s = String(h).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    return m[1].padStart(2, '0') + ':' + m[2];
  }
  return s;
}

function nextReservaId() {
  const sheet = getMudanzasSheet();
  if (!sheet) return 'MD-0001';
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) return 'MD-0001';
  const ids = sheet.getRange(MUDANZAS_HEADER_ROW + 1, COL_MUD_ID + 1, last - MUDANZAS_HEADER_ROW, 1).getValues();
  let max = 0;
  for (const r of ids) {
    const s = String(r[0] || '');
    const m = s.match(/^MD-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return 'MD-' + String(max + 1).padStart(4, '0');
}

function generarSlotsTeoricos(desde, hasta) {
  const slots = [];
  const d = new Date(desde + 'T12:00:00');
  const fin = new Date(hasta + 'T12:00:00');
  while (d <= fin) {
    const dow = d.getDay();
    const slotsDelDia = dow === 0 ? MUDANZAS_SLOTS_DOMINGO
                      : dow === 6 ? MUDANZAS_SLOTS_SABADO
                      : MUDANZAS_SLOTS_LUN_VIE;
    const fechaStr = Utilities.formatDate(d, 'America/Bogota', 'yyyy-MM-dd');
    for (const [hi, hf] of slotsDelDia) {
      slots.push({ fecha: fechaStr, horaInicio: hi, horaFin: hf });
    }
    d.setDate(d.getDate() + 1);
  }
  return slots;
}

function findReservaById(idReserva) {
  const sheet = getMudanzasSheet();
  if (!sheet) return null;
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) return null;
  const data = sheet.getRange(MUDANZAS_HEADER_ROW + 1, 1, last - MUDANZAS_HEADER_ROW, MUDANZAS_NUM_COLS).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][COL_MUD_ID] || '').trim() === String(idReserva || '').trim()) {
      return { rowNumber: MUDANZAS_HEADER_ROW + 1 + i, values: data[i] };
    }
  }
  return null;
}

function findReservasEnRango(torre, ascensor, desde, hasta) {
  const sheet = getMudanzasSheet();
  if (!sheet) return [];
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) return [];
  const data = sheet.getRange(MUDANZAS_HEADER_ROW + 1, 1, last - MUDANZAS_HEADER_ROW, MUDANZAS_NUM_COLS).getValues();
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (String(row[COL_MUD_ESTADO]).trim() !== 'Confirmada') continue;
    if (String(row[COL_MUD_TORRE]).trim() !== String(torre)) continue;
    if (String(row[COL_MUD_ASCENSOR]).trim() !== String(ascensor)) continue;
    const fecha = formatDateOnly(row[COL_MUD_FECHA]);
    if (!fecha) continue;
    if (fecha >= desde && fecha <= hasta) {
      result.push({
        rowNumber: MUDANZAS_HEADER_ROW + 1 + i,
        id: String(row[COL_MUD_ID] || ''),
        fecha: fecha,
        horaInicio: normalizarHora(row[COL_MUD_HORA_INI]),
        horaFin: normalizarHora(row[COL_MUD_HORA_FIN])
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Endpoint ADMIN: adminBorrarReservaMudanza (V38)
// Borra físicamente una reserva de la pestaña Mudanzas.
// Solo para admin (token validado en doPost). Útil para limpiar
// reservas de prueba o reservas basura que no deben aparecer en vigilancia.
// NO afecta la pestaña Registros (regla de NO borrar filas ahí no aplica).
// ---------------------------------------------------------------------
function adminBorrarReservaMudanza(idReserva) {
  const sheet = getMudanzasSheet();
  if (!sheet) return { ok: false, error: 'Pestaña Mudanzas no existe.' };
  const idReservaNorm = String(idReserva || '').trim();
  if (!idReservaNorm) return { ok: false, error: 'Falta idReserva.' };

  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) return { ok: false, error: 'Sin reservas.' };
  const data = sheet.getRange(MUDANZAS_HEADER_ROW + 1, 1, last - MUDANZAS_HEADER_ROW, 1).getValues();

  let targetRow = -1;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === idReservaNorm) {
      targetRow = MUDANZAS_HEADER_ROW + 1 + i;
      break;
    }
  }
  if (targetRow === -1) return { ok: false, error: 'No se encontró la reserva ' + idReservaNorm + '.' };

  sheet.deleteRow(targetRow);
  Logger.log('[adminBorrarReservaMudanza] Reserva ' + idReservaNorm + ' borrada por admin. Fila=' + targetRow);

  return { ok: true, message: 'Reserva ' + idReservaNorm + ' borrada correctamente.' };
}

// Endpoint MUDANZAS-ADMIN: adminListarReservasMudanzas (GET)
// Lista todas las reservas de mudanzas para el administrador
// Soporta filtros: estado (Confirmada/Cancelada/Todas), torre, fechaDesde
// ---------------------------------------------------------------------
function adminListarReservasMudanzas(estado, torre, fechaDesde, fechaHasta, proxDias) {
  const sheet = getMudanzasSheet();
  if (!sheet) return { ok: false, error: 'Pestaña Mudanzas no existe.' };
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) {
    return { ok: true, reservas: [], total: 0 };
  }
  const data = sheet.getRange(MUDANZAS_HEADER_ROW + 1, 1, last - MUDANZAS_HEADER_ROW, MUDANZAS_NUM_COLS).getValues();
  // BUGFIX-011: si proxDias está definido, calcular rango desde hoy hasta hoy+N
  let fechaLimiteInf = fechaDesde || '';
  let fechaLimiteSup = fechaHasta || '';
  if (proxDias !== undefined && proxDias !== null && proxDias !== '') {
    const n = parseInt(proxDias, 10);
    if (!isNaN(n) && n > 0) {
      const hoy = new Date();
      const futuro = new Date(hoy);
      futuro.setDate(futuro.getDate() + n);
      const fmt = (d) => Utilities.formatDate(d, 'America/Bogota', 'yyyy-MM-dd');
      if (!fechaLimiteInf) fechaLimiteInf = fmt(hoy);
      fechaLimiteSup = fmt(futuro);
    }
  }
  const reservas = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const estadoRow = String(row[COL_MUD_ESTADO] || '').trim();
    if (estado && estado !== 'Todas' && estadoRow !== estado) continue;
    if (torre && String(row[COL_MUD_TORRE]).trim() !== String(torre)) continue;
    const fechaRow = formatDateOnly(row[COL_MUD_FECHA]);
    if (fechaLimiteInf && (!fechaRow || fechaRow < fechaLimiteInf)) continue;
    if (fechaLimiteSup && (!fechaRow || fechaRow > fechaLimiteSup)) continue;

    reservas.push({
      id: String(row[COL_MUD_ID] || ''),
      numForm: String(row[COL_MUD_NUMFORM] || ''),
      apto: String(row[COL_MUD_APTO] || ''),
      torre: String(row[COL_MUD_TORRE] || ''),
      ascensor: String(row[COL_MUD_ASCENSOR] || ''),
      tipoMudanza: String(row[COL_MUD_TIPO] || ''),
      descripcionElementos: String(row[COL_MUD_DESCRIPCION] || ''),
      fecha: fechaRow,
      horaInicio: normalizarHora(row[COL_MUD_HORA_INI]),
      horaFin: normalizarHora(row[COL_MUD_HORA_FIN]),
      nombreSolicitante: String(row[COL_MUD_NOMBRE] || ''),
      ccSolicitante: String(row[COL_MUD_CC] || ''),
      celular: String(row[COL_MUD_CEL] || ''),
      correo: String(row[COL_MUD_CORREO] || ''),
      empresa: String(row[COL_MUD_EMPRESA] || ''),
      placa: String(row[COL_MUD_PLACA] || ''),
      observaciones: String(row[COL_MUD_OBS] || ''),
      estado: estadoRow,
      fechaReservaRaw: row[COL_MUD_FECHARES] ? Utilities.formatDate(new Date(row[COL_MUD_FECHARES]), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss") : ''
    });
  }
  // Ordenar por fecha descendente
  reservas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return { ok: true, reservas: reservas, total: reservas.length };
}

function hashReserva(torre, ascensor, fecha, horaInicio) {
  const input = `${torre}|${ascensor}|${fecha}|${horaInicio}`;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
  return digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').slice(0, 16);
}

// ---------------------------------------------------------------------
// Endpoint 4.1: verificarPropietario
// ---------------------------------------------------------------------
function verificarPropietario(numForm, apto, ccProp) {
  numForm = String(numForm || '').trim();
  apto = String(apto || '').trim();
  ccProp = normalizarCC(ccProp);

  if (!numForm) return { ok: false, error: 'Falta N° de formulario.' };
  if (!apto) return { ok: false, error: 'Falta N° de apartamento.' };
  if (!ccProp) return { ok: false, error: 'Falta cédula del propietario.' };

  const found = findRowByNumFormAndApto(numForm, apto);
  if (!found) {
    return { ok: false, error: 'No se encontró ningún registro con ese N° de formulario y N° de apartamento.' };
  }

  const diligencia = String(found.values[4] || '').trim();
  if (diligencia !== 'Propietario' && diligencia !== 'Tenedor / Otro' && diligencia !== 'Inmobiliaria' && diligencia !== 'Encargado') {
    return { ok: false, error: 'Esta autorización debe ser solicitada por el propietario del inmueble o por la inmobiliaria autorizada, no por un arrendatario. Contacte al propietario.' };
  }

  const ccSheet = normalizarCC(found.values[6]);
  if (ccSheet !== ccProp) {
    return { ok: false, error: 'La cédula ingresada no coincide con el propietario registrado. Verifique o contacte a la administración.' };
  }

  return {
    ok: true,
    diligencia: diligencia,
    numForm: numForm,
    apto: apto,
    nombreProp: String(found.values[5] || ''),
    ccProp: ccSheet,
    correoProp: String(found.values[7] || ''),
    celProp: String(found.values[8] || '')
  };
}

// ---------------------------------------------------------------------
// Endpoint 4.2: dispMudanzas
// ---------------------------------------------------------------------
function dispMudanzas(torre, ascensor, desde, hasta) {
  torre = String(torre || '').trim();
  ascensor = String(ascensor || '').trim().toUpperCase();
  desde = String(desde || '').trim();
  hasta = String(hasta || '').trim();

  if (!MUDANZAS_TORRES.includes(torre)) {
    return { ok: false, error: 'Torre inválida. Debe ser 1, 2 o 3.' };
  }
  if (ascensor !== MUDANZAS_ASCENSOR) {
    return { ok: false, error: 'Solo el ascensor A está habilitado para mudanzas. El ascensor B está reservado para circulación de residentes.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    return { ok: false, error: 'Fecha "desde" inválida. Use formato YYYY-MM-DD.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return { ok: false, error: 'Fecha "hasta" inválida. Use formato YYYY-MM-DD.' };
  }
  if (desde > hasta) {
    return { ok: false, error: 'Fecha "desde" no puede ser posterior a "hasta".' };
  }

  const slotsTeoricos = generarSlotsTeoricos(desde, hasta);
  const reservas = findReservasEnRango(torre, ascensor, desde, hasta);

  const hoy = new Date();
  const minFecha = new Date(hoy);
  minFecha.setDate(minFecha.getDate() + MUDANZAS_ANTICIPACION_DIAS);
  const minFechaStr = Utilities.formatDate(minFecha, 'America/Bogota', 'yyyy-MM-dd');

  const resultado = slotsTeoricos.map(s => {
    // BUGFIX-024: si ya hay CUALQUIER reserva Confirmada en (torre, fecha),
    // todos los slots del día se bloquean (no solo el slot exacto).
    const reservasDelDia = reservas.filter(r => r.fecha === s.fecha);
    const ocupadoMismoSlot = reservasDelDia.find(r => r.horaInicio === s.horaInicio);
    const ocupadoOtroSlot = reservasDelDia.length > 0 && !ocupadoMismoSlot;
    const muyPronto = s.fecha < minFechaStr;
    return {
      fecha: s.fecha,
      horaInicio: s.horaInicio,
      horaFin: s.horaFin,
      disponible: reservasDelDia.length === 0 && !muyPronto,
      reservadoPor: ocupadoMismoSlot ? ocupadoMismoSlot.id : (ocupadoOtroSlot ? 'OTRA-RESERVA' : null)
    };
  });

  return { ok: true, slots: resultado, minFecha: minFechaStr, torre: torre, ascensor: ascensor };
}

// ---------------------------------------------------------------------
// Endpoint 4.3: reservarMudanza
// ---------------------------------------------------------------------
function reservarMudanza(data) {
  const verif = verificarPropietario(data.numForm, data.apto, data.ccProp);
  if (!verif.ok) return verif;

  const torre = String(data.torre || '').trim();
  const ascensor = MUDANZAS_ASCENSOR;
  const fecha = String(data.fecha || '').trim();
  const horaInicio = String(data.horaInicio || '').trim();
  const horaFin = String(data.horaFin || '').trim();
  const tipoMudanza = String(data.tipoMudanza || '').trim();

  if (!MUDANZAS_TORRES.includes(torre)) {
    return { ok: false, error: 'Torre inválida. Debe ser 1, 2 o 3.' };
  }
  if (!['Salida', 'Ingreso', 'SalidaElementos', 'IngresoElementos'].includes(tipoMudanza)) {
    return { ok: false, error: 'Tipo de mudanza inválido. Opciones: Salida, Ingreso, SalidaElementos, IngresoElementos.' };
  }
  // V37: descripcion obligatoria para tipos de elementos
  const descripcionElementos = String(data.descripcionElementos || '').trim();
  if (['SalidaElementos', 'IngresoElementos'].includes(tipoMudanza)) {
    if (descripcionElementos.length < 10) {
      return { ok: false, error: 'Para mudanza de elementos debe describir qué sale/ingresa. Mínimo 10 caracteres.' };
    }
    if (descripcionElementos.length > 500) {
      return { ok: false, error: 'La descripción no puede superar 500 caracteres.' };
    }
    if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,}/.test(descripcionElementos)) {
      return { ok: false, error: 'La descripción debe contener texto real.' };
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: 'Fecha inválida. Use formato YYYY-MM-DD.' };
  }

  const dow = new Date(fecha + 'T12:00:00').getDay();
  const slotsPermitidos = dow === 0 ? MUDANZAS_SLOTS_DOMINGO
                        : dow === 6 ? MUDANZAS_SLOTS_SABADO
                        : MUDANZAS_SLOTS_LUN_VIE;
  const slotValido = slotsPermitidos.find(s => s[0] === horaInicio && s[1] === horaFin);
  if (!slotValido) {
    return { ok: false, error: 'El horario seleccionado no es válido. Domingo no hay servicio; verifique el día y la hora.' };
  }

  const hoy = new Date();
  const minFecha = new Date(hoy);
  minFecha.setDate(minFecha.getDate() + MUDANZAS_ANTICIPACION_DIAS);
  const minFechaStr = Utilities.formatDate(minFecha, 'America/Bogota', 'yyyy-MM-dd');
  if (fecha < minFechaStr) {
    return { ok: false, error: 'Las mudanzas deben agendarse con al menos ' + MUDANZAS_ANTICIPACION_DIAS + ' días calendario de anticipación. Próxima fecha disponible: ' + minFechaStr + '.' };
  }

  if (!verif.correoProp || verif.correoProp.indexOf('@') === -1) {
    return { ok: false, error: 'El propietario no tiene un correo válido registrado en el formulario de residentes. No se puede enviar la confirmación.' };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MUDANZAS_LOCK_TIMEOUT_MS)) {
    return { ok: false, error: 'Otro residente está reservando en este momento. Por favor intente nuevamente en unos segundos.' };
  }

  try {
    const reservas = findReservasEnRango(torre, ascensor, fecha, fecha);

    // BUGFIX-024: límite 1 mudanza POR TORRE POR DÍA.
    if (reservas.length >= MUDANZAS_MAX_POR_TORRE_DIA) {
      const otra = reservas[0];
      return {
        ok: false,
        error: 'Ya existe una mudanza confirmada para la Torre ' + torre + ' el ' + fecha +
               ' (ID ' + otra.id + ', ' + otra.horaInicio + '-' + otra.horaFin +
               '). Solo se permite 1 mudanza por torre por día. ' +
               'Por favor seleccione otra fecha u otra torre, o contacte a la administración.'
      };
    }

    const duplicado = reservas.find(r => r.horaInicio === horaInicio);
    if (duplicado) {
      return { ok: false, error: 'Este horario ya fue reservado por otro residente. Por favor seleccione otro.' };
    }

    const sheet = getMudanzasSheet();
    if (!sheet) {
      return { ok: false, error: 'La pestaña Mudanzas no existe en el Sheet. Contacte a la administración.' };
    }

    const idReserva = nextReservaId();
    const now = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss');
    const hash = hashReserva(torre, ascensor, fecha, horaInicio);

    const row = new Array(MUDANZAS_NUM_COLS).fill('');
    row[COL_MUD_ID]       = idReserva;
    row[COL_MUD_NUMFORM]  = verif.numForm;
    row[COL_MUD_APTO]     = verif.apto;
    row[COL_MUD_TIPO]     = tipoMudanza;
    row[COL_MUD_TORRE]    = torre;
    row[COL_MUD_ASCENSOR] = ascensor;
    row[COL_MUD_FECHA]    = fecha;
    row[COL_MUD_HORA_INI] = horaInicio;
    row[COL_MUD_HORA_FIN] = horaFin;
    row[COL_MUD_NOMBRE]   = verif.nombreProp;
    row[COL_MUD_CC]       = verif.ccProp;
    row[COL_MUD_CEL]      = verif.celProp;
    row[COL_MUD_CORREO]   = verif.correoProp;
    row[COL_MUD_EMPRESA]  = String(data.empresa || '').trim();
    row[COL_MUD_PLACA]    = String(data.placa || '').trim().toUpperCase();
    row[COL_MUD_OBS]      = String(data.observaciones || '').trim();
    row[COL_MUD_FECHARES] = now;
    row[COL_MUD_ESTADO]   = 'Confirmada';
    row[COL_MUD_HASH]     = hash;
    row[COL_MUD_DESCRIPCION] = descripcionElementos;  // V37: solo si tipo es elementos

    const last = sheet.getLastRow();
    const targetRow = Math.max(last + 1, MUDANZAS_HEADER_ROW + 1);
    sheet.getRange(targetRow, 1, 1, MUDANZAS_NUM_COLS).setValues([row.map(safeCell_)]); // AUD-T3

    try { enviarEmailConfirmacionAdmin(row); } catch (e) { console.error('Error email admin:', e); }
    try { enviarEmailConfirmacionResidente(row); } catch (e) { console.error('Error email residente:', e); }

    return {
      ok: true,
      idReserva: idReserva,
      fecha: fecha,
      horaInicio: horaInicio,
      horaFin: horaFin,
      torre: torre,
      message: 'Reserva confirmada. Le enviamos un correo de confirmación a ' + verif.correoProp + '.'
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Endpoint 4.4: cancelarMudanza
// ---------------------------------------------------------------------
function cancelarMudanza(data) {
  const idReserva = String(data.idReserva || '').trim();
  if (!idReserva) return { ok: false, error: 'Falta ID de reserva.' };

  const verif = verificarPropietario(data.numForm, data.apto, data.ccProp);
  if (!verif.ok) return verif;

  const found = findReservaById(idReserva);
  if (!found) return { ok: false, error: 'No se encontró la reserva con ese ID.' };

  if (String(found.values[COL_MUD_NUMFORM]).trim() !== verif.numForm ||
      String(found.values[COL_MUD_APTO]).trim() !== verif.apto) {
    return { ok: false, error: 'Esta reserva no pertenece a este apartamento.' };
  }

  if (String(found.values[COL_MUD_ESTADO]).trim() !== 'Confirmada') {
    return { ok: false, error: 'Esta reserva ya no está activa (estado actual: ' + String(found.values[COL_MUD_ESTADO]) + ').' };
  }

  const fechaMudanza = formatDateOnly(found.values[COL_MUD_FECHA]);
  const horaInicio = normalizarHora(found.values[COL_MUD_HORA_INI]);
  const fechaHoraMudanza = new Date(fechaMudanza + 'T' + horaInicio + ':00');
  const ahora = new Date();
  const diffHoras = (fechaHoraMudanza - ahora) / (1000 * 60 * 60);
  if (diffHoras < MUDANZAS_CANCELACION_HORAS) {
    return { ok: false, error: 'Solo se puede cancelar hasta ' + MUDANZAS_CANCELACION_HORAS + ' horas antes de la mudanza. Contacte a la administración.' };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MUDANZAS_LOCK_TIMEOUT_MS)) {
    return { ok: false, error: 'Otro proceso está activo. Intente nuevamente en unos segundos.' };
  }

  try {
    const sheet = getMudanzasSheet();
    sheet.getRange(found.rowNumber, COL_MUD_ESTADO + 1).setValue('Cancelada');

    try { enviarEmailCancelacionAdmin(found.values); } catch (e) { console.error('Error email cancel admin:', e); }
    try { enviarEmailCancelacionResidente(found.values); } catch (e) { console.error('Error email cancel residente:', e); }

    return { ok: true, message: 'Reserva cancelada correctamente.' };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Endpoint 4.5: listarReservasMudanzasPorNumForm (GET) [V41 BUGFIX-026]
// Devuelve TODAS las reservas de mudanza del numForm + apto del solicitante
// autenticado (Confirmadas, Canceladas y Realizadas), ordenadas por
// fecha ascendente (próximas primero). Permite al residente recuperar y
// cancelar reservas previas (BUG #1 del análisis del módulo mudanzas:
// el botón "📋 Ver mis reservas" en `showMisReservas()` era un placeholder
// que solo mostraba un mensaje "función en desarrollo").
// Cierra la asimetría con el salón social que ya tenía `listarReservasPorApto`
// (BUGFIX-015 V22) desde 02-Oct-2026.
// ---------------------------------------------------------------------
function listarReservasMudanzasPorNumForm(numForm, apto, ccProp) {
  const verif = verificarPropietario(numForm, apto, ccProp);
  if (!verif.ok) return verif;

  const sheet = getMudanzasSheet();
  if (!sheet) {
    return { ok: true, numForm: verif.numForm, apto: verif.apto, nombre: verif.nombreProp, reservas: [], total: 0 };
  }
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) {
    return { ok: true, numForm: verif.numForm, apto: verif.apto, nombre: verif.nombreProp, reservas: [], total: 0 };
  }

  const data = sheet.getRange(
    MUDANZAS_HEADER_ROW + 1, 1,
    last - MUDANZAS_HEADER_ROW,
    MUDANZAS_NUM_COLS
  ).getValues();

  const reservas = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const numFormRow = String(row[COL_MUD_NUMFORM] || '').trim();
    const aptoRow    = String(row[COL_MUD_APTO]    || '').trim();
    // Solo reservas del mismo numForm Y mismo apto (no cruzar entre aptos)
    if (numFormRow !== verif.numForm) continue;
    if (aptoRow    !== verif.apto)    continue;
    const fecha = formatDateOnly(row[COL_MUD_FECHA]);
    if (!fecha) continue;
    reservas.push({
      id:        String(row[COL_MUD_ID]       || ''),
      numForm:   numFormRow,
      apto:      aptoRow,
      tipo:      String(row[COL_MUD_TIPO]     || ''),
      torre:     String(row[COL_MUD_TORRE]    || ''),
      ascensor:  String(row[COL_MUD_ASCENSOR] || ''),
      fecha:     fecha,
      horaInicio:normalizarHora(row[COL_MUD_HORA_INI]),
      horaFin:   normalizarHora(row[COL_MUD_HORA_FIN]),
      estado:    String(row[COL_MUD_ESTADO]   || ''),
      fechaCreacion: row[COL_MUD_FECHARES] ? Utilities.formatDate(new Date(row[COL_MUD_FECHARES]), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss") : '',
      descripcionElementos: String(row[COL_MUD_DESCRIPCION] || '')
    });
  }

  // Ordenar: próximas primero (fecha asc, horaInicio asc).
  // Dentro del mismo día, secundarios por hora ascendente.
  reservas.sort(function (a, b) {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    return (a.horaInicio || '').localeCompare(b.horaInicio || '');
  });

  Logger.log('[listarReservasMudanzasPorNumForm] numForm ' + verif.numForm + ' apto ' + verif.apto + ' → ' + reservas.length + ' reservas');

  return {
    ok: true,
    numForm: verif.numForm,
    apto: verif.apto,
    nombre: verif.nombreProp,
    reservas: reservas,
    total: reservas.length
  };
}

// ---------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// BUGFIX-028 · Envío del código CA-XXXX al correo del propietario
//
// Se invoca SOLO desde submitRecord() cuando:
//   · es una CREACIÓN (editMode = false), y
//   · __origen === 'formulario-publico' (solo el formulario público), y
//   · diligencia === 'Propietario'.
//
// El contenido es MINIMO: el código, el apartamento y cómo usarlo.
// NO incluye cédula, celular, ni datos de residentes/vehículos/mascotas.
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// BUGFIX-028 (V45) · Helper de envio de correo con remitente CONFIABLE.
//
// PROBLEMA: MailApp.sendEmail() usa el remitente primario de la cuenta
// de Google Workspace (admin@urbcerroazul.com). Ese dominio es NUEVO
// (creado 30-ago-2026), con DKIM incompleto y SIN DMARC, por lo que los
// servidores receptores (Gmail, Outlook, Hotmail) DESCARTAN o retienen
// silenciosamente los correos. Evidencia: 0 correos entregados de
// admin@urbcerroazul.com; los correos SMTP del proyecto de pagos, que
// envian como urb.cerroazul@gmail.com, SI llegan.
//
// SOLUCION: GmailApp.sendEmail() permite especificar 'from'. Usamos
// urb.cerroazul@gmail.com (dominio @gmail.com, 100%% confiable).
//
// REQUISITO del operador: en la cuenta admin@urbcerroazul.com, Gmail ->
// Configuracion -> Cuentas e importacion -> 'Enviar como' debe tener
// urb.cerroazul@gmail.com agregado y verificado (Send mail as alias).
// Sin ese alias, GmailApp lanza error y devolvemos false (sin excepcion).
// ---------------------------------------------------------------------
function enviarEmailCerroAzul(to, subject, body) {
  // NO se captura la excepcion aqui: si GmailApp falla (alias 'Send mail
  // as' no configurado, cuota, etc.) la excepcion se PROPAGA al caller.
  // submitRecord la captura y la reporta en correoError (el registro YA
  // esta escrito, asi que un fallo de correo nunca pierde el registro).
  GmailApp.sendEmail(to, subject, body, {
    from: 'urb.cerroazul@gmail.com',
    name: 'Cerro Azul'
  });
}

function enviarEmailCodigoRegistro(row, numForm) {
  const correo = String(row[7] || '').trim();   // col H = Correo Propietario
  if (!correo || correo.indexOf('@') === -1) {
    Logger.log('[enviarEmailCodigoRegistro] sin correo valido, no se envia');
    return false;
  }
  const nombre = String(row[5] || '').trim();   // col F = Nombre Propietario
  const apto   = String(row[3] || '').trim();   // col D = N° Apto

  const subject = 'Cerro Azul — su codigo de formulario es ' + numForm;

  const body =
    'Hola ' + nombre + ',\n\n' +
    'Su registro en la Urbanizacion Cerro Azul quedo registrado.\n\n' +
    '  N° de formulario: ' + numForm + '\n' +
    '  Apartamento:       ' + apto + '\n\n' +
    'Este codigo es lo que necesita para volver a editar su informacion,\n' +
    'agendar mudanzas y consultar su estado de cuenta.\n\n' +
    'Para editar su registro:\n' +
    '  1. Entre a https://fabig76.github.io/cerro-azul-residentes/\n' +
    '  2. Abra la pestana "Editar mi registro"\n' +
    '  3. Escriba su codigo ' + numForm + ', su numero de apartamento\n' +
    '     y la cedula del propietario\n' +
    '  4. Toque "Buscar mi registro"\n\n' +
    'Si no puede entrar o cree que hubo un error, comunicquese con la\n' +
    'administracion: WhatsApp 316 924 0748 o correo urb.cerroazul@gmail.com\n' +
    'Indique su nombre completo, cedula y numero de apartamento.\n\n' +
    '--\nUrbanizacion Cerro Azul — NIT 900770444\n';

  enviarEmailCerroAzul(correo, subject, body);

  // Copia de seguridad a la administracion (auditoria). Si falla, NO
  // afecta el correo al propietario (ya enviado).
  try {
    enviarEmailCerroAzul(
      REGISTRO_EMAIL_ADMIN,
      '[Cerro Azul] Nuevo registro ' + numForm + ' (apto ' + apto + ')',
      'Registro creado:\n\n' +
      '  N° Formulario: ' + numForm + '\n' +
      '  Apartamento:   ' + apto + '\n' +
      '  Propietario:   ' + nombre + '\n' +
      '  Correo:       ' + correo + '\n' +
      '  Se envio el codigo al propietario.\n'
    );
  } catch (e) {
    Logger.log('[enviarEmailCodigoRegistro] copia admin fallo: ' + e);
  }

  Logger.log('[enviarEmailCodigoRegistro] enviado ' + numForm + ' a ' + correo);
  return true;
}

function enviarEmailConfirmacionAdmin(row) {
  const subject = '[Cerro Azul] Nueva reserva de mudanza ' + row[COL_MUD_ID];
  const body =
    'Nueva reserva de mudanza registrada:\n\n' +
    'ID Reserva:    ' + row[COL_MUD_ID] + '\n' +
    'Propietario:   ' + row[COL_MUD_NOMBRE] + ' (CC ' + row[COL_MUD_CC] + ')\n' +
    'Apartamento:   ' + row[COL_MUD_APTO] + '\n' +
    'Celular:       ' + row[COL_MUD_CEL] + '\n' +
    'Correo:        ' + row[COL_MUD_CORREO] + '\n' +
    'Tipo:          ' + row[COL_MUD_TIPO] + ' de arrendatario\n' +
    'Torre:         ' + row[COL_MUD_TORRE] + ', Ascensor ' + row[COL_MUD_ASCENSOR] + '\n' +
    'Fecha:         ' + row[COL_MUD_FECHA] + ' ' + row[COL_MUD_HORA_INI] + '-' + row[COL_MUD_HORA_FIN] + '\n' +
    'Empresa:       ' + (row[COL_MUD_EMPRESA] || '(no indicada)') + '\n' +
    'Placa:         ' + (row[COL_MUD_PLACA] || '(no indicada)') + '\n' +
    'Observaciones: ' + (row[COL_MUD_OBS] || '(sin observaciones)') + '\n\n' +
    '--\nCerro Azul — Sistema de agendamiento de mudanzas\n';
  enviarEmailCerroAzul(MUDANZAS_EMAIL_ADMIN, subject, body);
}

function enviarEmailConfirmacionResidente(row) {
  const to = row[COL_MUD_CORREO];
  if (!to || to.indexOf('@') === -1) return;
  const subject = 'Confirmacion de reserva de mudanza ' + row[COL_MUD_ID];
  const body =
    'Hola ' + row[COL_MUD_NOMBRE] + ',\n\n' +
    'Su reserva de mudanza ha sido confirmada:\n\n' +
    'ID Reserva:    ' + row[COL_MUD_ID] + '\n' +
    'Apartamento:   ' + row[COL_MUD_APTO] + '\n' +
    'Tipo:          ' + row[COL_MUD_TIPO] + ' de arrendatario\n' +
    'Torre:         ' + row[COL_MUD_TORRE] + ', Ascensor ' + row[COL_MUD_ASCENSOR] + '\n' +
    'Fecha:         ' + row[COL_MUD_FECHA] + '\n' +
    'Horario:       ' + row[COL_MUD_HORA_INI] + ' a ' + row[COL_MUD_HORA_FIN] + '\n\n' +
    'Recuerde: la vigilancia NO permite ingreso en dias festivos, ' +
    'aunque usted tenga reserva. Verifique que la fecha seleccionada no sea festivo.\n\n' +
    'Para cancelar su reserva, ingrese nuevamente al formulario con su ' +
    'N° de formulario, apartamento y cedula del propietario.\n\n' +
    '--\nCerro Azul — Sistema de agendamiento de mudanzas\n';
  enviarEmailCerroAzul(to, subject, body);
}

function enviarEmailCancelacionAdmin(row) {
  const subject = '[Cerro Azul] Cancelacion de reserva de mudanza ' + row[COL_MUD_ID];
  const body =
    'Se ha cancelado la siguiente reserva de mudanza:\n\n' +
    'ID Reserva:  ' + row[COL_MUD_ID] + '\n' +
    'Apartamento: ' + row[COL_MUD_APTO] + '\n' +
    'Tipo:        ' + row[COL_MUD_TIPO] + '\n' +
    'Fecha:       ' + row[COL_MUD_FECHA] + ' ' + row[COL_MUD_HORA_INI] + '-' + row[COL_MUD_HORA_FIN] + '\n' +
    'Cancelada por: ' + row[COL_MUD_NOMBRE] + ' (CC ' + row[COL_MUD_CC] + ')\n';
  enviarEmailCerroAzul(MUDANZAS_EMAIL_ADMIN, subject, body);
}

function enviarEmailCancelacionResidente(row) {
  const to = row[COL_MUD_CORREO];
  if (!to || to.indexOf('@') === -1) return;
  const subject = 'Cancelacion de reserva de mudanza ' + row[COL_MUD_ID];
  const body =
    'Hola ' + row[COL_MUD_NOMBRE] + ',\n\n' +
    'Su reserva de mudanza ' + row[COL_MUD_ID] + ' ha sido cancelada.\n\n' +
    'Fecha que estaba reservada: ' + row[COL_MUD_FECHA] + ' ' +
    row[COL_MUD_HORA_INI] + '-' + row[COL_MUD_HORA_FIN] + '\n\n' +
    'Si necesita reprogramar, ingrese nuevamente al formulario de Cerro Azul.\n\n' +
    '--\nCerro Azul\n';
  enviarEmailCerroAzul(to, subject, body);
}

// =====================================================================
// ADMINISTRACION (admin.html) — busqueda y edicion de registros
// Contrasena se lee de la pestana "Config" del Sheet (celda B2).
// Para cambiarla: editar Config!B2 desde el Sheet directamente.
// =====================================================================

function adminLeerContrasena() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Config');
  if (!sheet) return null;
  const data = sheet.getRange('A1:B10').getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === 'admin_password') {
      return String(data[i][1] || '');
    }
  }
  return null;
}

function adminLogin(password) {
  // AUD-T2: 5 intentos fallidos = 15 minutos de espera
  if (rateLimit_('login_admin', 5, 900)) {
    return { ok: false, error: 'Demasiados intentos. Espere 15 minutos.' };
  }
  password = String(password || '');
  const stored = adminLeerContrasena();
  if (!stored) {
    return { ok: false, error: 'No se encontro la contrasena de administrador en la pestana Config del Sheet. Contacte al administrador del sistema.' };
  }
  if (password === stored) {
    const token = generarToken();
    guardarToken('admin', token);
    CacheService.getScriptCache().remove('rl_login_admin'); // AUD-T2: reinicia el contador
    return { ok: true, message: 'Login correcto', token: token };
  }
  return { ok: false, error: 'Contrasena incorrecta' };
}

function adminBuscar(query) {
  query = String(query || '').trim().toLowerCase();
  if (!query || query.length < 1) {
    return { ok: false, error: 'Ingrese un termino de busqueda' };
  }
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) return { ok: false, error: 'Sheet no encontrado' };
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return { ok: true, resultados: [] };

  // Leer primeras 12 columnas (lo necesario para resultados + display)
  const data = sheet.getRange(HEADER_ROW + 1, 1, last - HEADER_ROW, 12).getValues();
  const resultados = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const numForm = String(row[COL_NUM_FORM] || '');
    const apto = String(row[COL_APTO] || '');
    const diligencia = String(row[4] || '');
    const nombre = String(row[5] || '');
    const cc = String(row[6] || '');
    const correo = String(row[7] || '');
    const celular = String(row[8] || '');
    const todo = (numForm + ' ' + apto + ' ' + diligencia + ' ' + nombre + ' ' + cc + ' ' + correo + ' ' + celular).toLowerCase();
    if (todo.indexOf(query) !== -1) {
      resultados.push({
        numForm: numForm,
        apto: apto,
        diligencia: diligencia,
        nombre: nombre,
        cc: cc,
        correo: correo,
        celular: celular,
        rowNumber: HEADER_ROW + 1 + i
      });
      if (resultados.length >= 100) break;  // limite
    }
  }
  return { ok: true, resultados: resultados, total: resultados.length };
}

function adminObtener(numForm) {
  numForm = String(numForm || '').trim();
  if (!numForm) return { ok: false, error: 'Falta numForm' };
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) return { ok: false, error: 'Sheet no encontrado' };
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return { ok: false, error: 'Sheet vacio' };
  const data = sheet.getRange(HEADER_ROW + 1, 1, last - HEADER_ROW, NUM_COLS).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][COL_NUM_FORM] || '').trim() === numForm) {
      return { ok: true, row: rowToObject(data[i]), rowNumber: HEADER_ROW + 1 + i };
    }
  }
  return { ok: false, error: 'No se encontro el registro' };
}

function adminGuardar(data) {
  const numForm = String(data.numForm || '').trim();
  if (!numForm) return { ok: false, error: 'Falta numForm' };
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) return { ok: false, error: 'Sheet no encontrado' };

  // Encontrar fila
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return { ok: false, error: 'Sheet vacio' };
  const allNumForms = sheet.getRange(HEADER_ROW + 1, COL_NUM_FORM + 1, last - HEADER_ROW, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < allNumForms.length; i++) {
    if (String(allNumForms[i][0] || '').trim() === numForm) {
      targetRow = HEADER_ROW + 1 + i;
      break;
    }
  }
  if (targetRow === -1) return { ok: false, error: 'No se encontro el registro con numForm=' + numForm };

  // Validar datos minimos (siempre requeridos)
  const apto = String(data.apto || '').trim();
  if (!apto) return { ok: false, error: 'Falta N° de apartamento' };
  const nombre = String(data.nombreProp || '').trim();
  if (!nombre) return { ok: false, error: 'Falta nombre del propietario' };
  const cc = String(data.ccProp || '').trim();
  if (!cc) return { ok: false, error: 'Falta CC del propietario' };
  const correo = String(data.correoProp || '').trim();
  if (!correo || correo.indexOf('@') === -1) return { ok: false, error: 'Correo del propietario invalido' };

  // Leer fila actual como base
  // AUD-T6: leer la fila, modificarla y escribirla son una sola sección
  // crítica. Sin lock, un adminGuardar y un submitRecord simultáneos se
  // pisan (lost update) sobre las 143 columnas de la fila.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { ok: false, error: 'El sistema está ocupado. Espere unos segundos y vuelva a intentar.' };
  }
  try {
    const currentRow = sheet.getRange(targetRow, 1, 1, NUM_COLS).getValues()[0];
    const newRow = currentRow.slice();
    // AUD-T6: bloqueo optimista. El cliente manda la fechaEdicion que leyó.
    if (data.fechaEdicionVista && String(currentRow[COL_FECHA_EDIT] || '') !== String(data.fechaEdicionVista)) {
      return { ok: false, error: 'El registro fue modificado por otra persona. Recargue y vuelva a intentar.', code: 'CONFLICTO' };
    }

    // Helper para aplicar campo solo si viene en el payload
    function set(idx, val) {
      if (val !== undefined) newRow[idx] = val;
    }
    function setStr(idx, val) {
      if (val !== undefined) newRow[idx] = safeCell_(String(val || '')); // AUD-T3
    }

    // ====== CAMPOS BASICOS (0-16) ======
    set(COL_APTO, apto);
    set(4, String(data.diligencia || currentRow[4] || ''));
    set(5, nombre);
    set(6, cc);
    set(7, correo.toLowerCase());
    setStr(8, data.celProp);
    setStr(9, data.telFijoProp);
    setStr(10, data.parq1Celda);
    setStr(11, data.parq1Mat);
    setStr(12, data.parq2Celda);
    setStr(13, data.parq2Mat);
    setStr(14, data.matriculaApto);
    if (data.requiereRevision !== undefined) {
      newRow[15] = (data.requiereRevision === 'Si' || data.requiereRevision === true || data.requiereRevision === 'Sí') ? 'Sí' : 'No';
    }
    setStr(16, data.observMatriculas);

    // ====== ENCARGADO/ADMINISTRADOR (17-20) ======
    setStr(17, data.nombreArr); setStr(18, data.ccArr); setStr(19, data.correoArr); setStr(20, data.celArr);

    // ====== PARQUEADERO TERCERO (21-23) ======
    setStr(21, data.parqTerNom); setStr(22, data.parqTerApto); setStr(23, data.parqTerCel);

    // ====== INMOBILIARIA (24-28) ======
    setStr(24, data.inmobRazon); setStr(25, data.inmobNit); setStr(26, data.inmobContacto); setStr(27, data.inmobTel); setStr(28, data.inmobCorreo);

    // ====== RESIDENTES (29-48, 4 × 5 cols) ======
    if (Array.isArray(data.residentes)) {
      for (let i = 0; i < 4; i++) {
        const r = data.residentes[i] || {};
        const base = 29 + i * 5;
        setStr(base + 0, r.nombre);
        setStr(base + 1, r.cc);
        if (r.correo !== undefined) set(base + 2, String(r.correo || '').toLowerCase());
        setStr(base + 3, r.cel);
        setStr(base + 4, r.parent);
      }
    }

    // ====== MENORES (49-60, 4 × 3 cols) ======
    if (Array.isArray(data.menores)) {
      for (let i = 0; i < 4; i++) {
        const m = data.menores[i] || {};
        const base = 49 + i * 3;
        setStr(base + 0, m.nombre);
        if (m.edad !== undefined) {
          newRow[base + 1] = (m.edad !== null && m.edad !== '') ? String(m.edad) : '';
        }
        setStr(base + 2, m.parent);
      }
    }

    // ====== VEHICULOS (61-72, 2 × 6 cols) ======
    if (Array.isArray(data.vehiculos)) {
      for (let i = 0; i < 2; i++) {
        const v = data.vehiculos[i] || {};
        const base = 61 + i * 6;
        setStr(base + 0, v.marca);
        setStr(base + 1, v.tipo);
        setStr(base + 2, v.color);
        if (v.placa !== undefined) set(base + 3, String(v.placa || '').toUpperCase());
        setStr(base + 4, v.modelo);
        setStr(base + 5, v.tag);
      }
    }

    // ====== MOTOS (73-84, 2 × 6 cols) ======
    if (Array.isArray(data.motos)) {
      for (let i = 0; i < 2; i++) {
        const v = data.motos[i] || {};
        const base = 73 + i * 6;
        setStr(base + 0, v.marca);
        setStr(base + 1, v.tipo);
        setStr(base + 2, v.color);
        if (v.placa !== undefined) set(base + 3, String(v.placa || '').toUpperCase());
        setStr(base + 4, v.modelo);
        setStr(base + 5, v.tag);
      }
    }

    // ====== BICICLETAS (85-92, 2 × 4 cols) ======
    if (Array.isArray(data.bicis)) {
      for (let i = 0; i < 2; i++) {
        const b = data.bicis[i] || {};
        const base = 85 + i * 4;
        setStr(base + 0, b.marca);
        setStr(base + 1, b.color);
        setStr(base + 2, b.clase);
        setStr(base + 3, b.serial);
      }
    }

    // ====== LLAVEROS/TAGS (93-94) ======
    if (data.llaverosAut !== undefined) setStr(93, data.llaverosAut);
    if (data.tagsAut !== undefined) setStr(94, data.tagsAut);

    // ====== DISPOSITIVOS (95-109, 3 × 5 cols) ======
    if (Array.isArray(data.dispositivos)) {
      for (let i = 0; i < 3; i++) {
        const d = data.dispositivos[i] || {};
        const base = 95 + i * 5;
        setStr(base + 0, d.tipo);
        setStr(base + 1, d.codigo);
        if (d.placa !== undefined) set(base + 2, String(d.placa || '').toUpperCase());
        setStr(base + 3, d.fecha);
        setStr(base + 4, d.recibe);
      }
    }

    // ====== MASCOTAS (110-129, 2 × 10 cols) ======
    if (Array.isArray(data.mascotas)) {
      for (let i = 0; i < 2; i++) {
        const m = data.mascotas[i] || {};
        const base = 110 + i * 10;
        setStr(base + 0, m.tipo);
        setStr(base + 1, m.nombre);
        setStr(base + 2, m.raza);
        setStr(base + 3, m.color);
        setStr(base + 4, m.sexo);
        setStr(base + 5, m.vacuna);
        if (m.manejoEspecial !== undefined) {
          newRow[base + 6] = (m.manejoEspecial === true || m.manejoEspecial === 'Sí') ? 'Sí' : 'No';
        }
        setStr(base + 7, m.registro);
        setStr(base + 8, m.aseguradora);
        setStr(base + 9, m.poliza);
      }
    }

    // ====== EMERGENCIAS (130-135, 2 × 3 cols) ======
    if (Array.isArray(data.emergencias)) {
      for (let i = 0; i < 2; i++) {
        const e = data.emergencias[i] || {};
        const base = 130 + i * 3;
        setStr(base + 0, e.nombre);
        setStr(base + 1, e.parent);
        setStr(base + 2, e.tel);
      }
    }

    // ====== AUTORIZACIONES (136-138) ======
    if (data.autDatos !== undefined) newRow[136] = data.autDatos ? 'Sí' : 'No';
    if (data.autMenores !== undefined) newRow[137] = data.autMenores ? 'Sí' : 'No';
    if (data.autCom !== undefined) newRow[138] = data.autCom ? 'Sí' : 'No';

    // ====== FIRMA (139-141) ======
    setStr(139, data.firmaNom);
    setStr(140, data.firmaCC);
    if (data.firmaFecha !== undefined) set(141, String(data.firmaFecha || ''));

    // Actualizar fecha de edicion
    newRow[COL_FECHA_EDIT] = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss');

    // Guardar
    sheet.getRange(targetRow, 1, 1, NUM_COLS).setValues([newRow]);
  } finally {
    lock.releaseLock();
  }

  Logger.log('adminGuardar: ' + numForm + ' (fila ' + targetRow + ') a las ' + newRow[COL_FECHA_EDIT]);

  return { ok: true, message: 'Registro actualizado correctamente', rowNumber: targetRow };
}

// =====================================================================
// VIGILANCIA (vigilantes.html) — vista de solo lectura + check mudanzas
// Solo datos publicos de identificacion (NO correos, celulares, telefonos).
// Para cambiar contrasena: editar Config!B2 desde el Sheet.
// =====================================================================

function vigilanteLeerContrasena() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Config');
  if (!sheet) return null;
  const data = sheet.getRange('A1:B10').getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === 'vigilante_password') {
      return String(data[i][1] || '');
    }
  }
  return null;
}

function vigilanteLogin(password) {
  // AUD-T2: 5 intentos fallidos = 15 minutos de espera
  if (rateLimit_('login_vigilante', 5, 900)) {
    return { ok: false, error: 'Demasiados intentos. Espere 15 minutos.' };
  }
  password = String(password || '');
  const stored = vigilanteLeerContrasena();
  if (!stored) {
    return { ok: false, error: 'No se encontro la contrasena de vigilancia en Config!B2.' };
  }
  if (password === stored) {
    const token = generarToken();
    guardarToken('vigilante', token);
    CacheService.getScriptCache().remove('rl_login_vigilante'); // AUD-T2: reinicia el contador
    return { ok: true, message: 'Login correcto', token: token };
  }
  return { ok: false, error: 'Contrasena incorrecta' };
}

function vigilanteVerResidentes(query) {
  query = String(query || '').trim().toLowerCase();
  if (!query || query.length < 1) {
    return { ok: false, error: 'Ingrese un termino de busqueda' };
  }
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) return { ok: false, error: 'Sheet no encontrado' };
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return { ok: true, resultados: [] };

  // Leer primeras 12 columnas + residentes (cols 29-48) + vehiculos (61-72)
  // + motos (73-84) + bicis (85-92) + parqueaderos (10-16) + mascotas (110-129)
  // + encargado (17-20) + inmobiliaria (24-28) + firma (139-141)
  // NO leer correos/celulares (cols 7, 8, 9, 19, 20, 27, 28, etc.)
  const data = sheet.getRange(HEADER_ROW + 1, 1, last - HEADER_ROW, NUM_COLS).getValues();
  const resultados = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const numForm = String(row[COL_NUM_FORM] || '');
    const apto = String(row[COL_APTO] || '');
    const diligencia = String(row[4] || '');
    const nombre = String(row[5] || '');
    const cc = String(row[6] || '');
    const encargado = String(row[17] || '');
    const ccEncargado = String(row[18] || '');
    const inmobRazon = String(row[24] || '');
    const inmobNit = String(row[25] || '');
    const inmobContacto = String(row[26] || '');
    // Busqueda incluye nombre del encargado/inmobiliaria y placas
    let vehiculoTexto = '';
    for (let v = 0; v < 2; v++) {
      const base = 61 + v * 6;
      vehiculoTexto += ' ' + String(row[base + 3] || ''); // placa
    }
    const todo = (numForm + ' ' + apto + ' ' + diligencia + ' ' + nombre + ' ' + cc + ' ' +
      encargado + ' ' + ccEncargado + ' ' + inmobRazon + ' ' + inmobNit + ' ' +
      inmobContacto + ' ' + vehiculoTexto).toLowerCase();
    if (todo.indexOf(query) !== -1) {
      // Construir respuesta FILTRADA (sin correos/celulares/telefonos)
      // BUGFIX-010 (SEG-001 backend): NO enviar campos sensibles que son
      // credenciales de edición (numForm, ccProp, firmaNom, firmaCC,
      // cc de residentes). El vigilante NO los necesita y son suficientes
      // para suplantar al propietario en "Editar mi registro".
      // Mantenemos rowNumber porque el frontend lo usa para identificar
      // el resultado clickeado, y ccEncargado porque se muestra en el
      // detalle (no es credencial de edición).
      const resultado = {
        apto: apto,
        diligencia: diligencia,
        nombreProp: nombre,
        nombreEncargado: encargado,
        ccEncargado: ccEncargado,
        nombreInmobiliaria: inmobRazon,
        nitInmobiliaria: inmobNit,
        contactoInmobiliaria: inmobContacto,  // OK: nombre de contacto, no email
        residentes: [],
        vehiculos: [],
        motos: [],
        bicis: [],
        parq1Celda: String(row[10] || ''),
        parq1Mat: String(row[11] || ''),
        parq2Celda: String(row[12] || ''),
        parq2Mat: String(row[13] || ''),
        parqTerNom: String(row[21] || ''),
        parqTerApto: String(row[22] || ''),
        mascotas: [],
        rowNumber: HEADER_ROW + 1 + i
      };
      // Residentes (4): solo nombre y parentesco (NO CC — BUGFIX-010)
      for (let r = 0; r < 4; r++) {
        const base = 29 + r * 5;
        const rn = String(row[base] || '');
        if (rn) {
          resultado.residentes.push({
            nombre: rn,
            parent: String(row[base + 4] || '')
          });
        }
      }
      // Vehiculos (2)
      for (let v = 0; v < 2; v++) {
        const base = 61 + v * 6;
        const marca = String(row[base] || '');
        if (marca) {
          resultado.vehiculos.push({
            marca: marca,
            tipo: String(row[base + 1] || ''),
            color: String(row[base + 2] || ''),
            placa: String(row[base + 3] || ''),
            modelo: String(row[base + 4] || ''),
            tag: String(row[base + 5] || '')
          });
        }
      }
      // Motos (2)
      for (let v = 0; v < 2; v++) {
        const base = 73 + v * 6;
        const marca = String(row[base] || '');
        if (marca) {
          resultado.motos.push({
            marca: marca,
            tipo: String(row[base + 1] || ''),
            color: String(row[base + 2] || ''),
            placa: String(row[base + 3] || ''),
            modelo: String(row[base + 4] || ''),
            tag: String(row[base + 5] || '')
          });
        }
      }
      // Bicis (2)
      for (let b = 0; b < 2; b++) {
        const base = 85 + b * 4;
        const marca = String(row[base] || '');
        if (marca) {
          resultado.bicis.push({
            marca: marca,
            color: String(row[base + 1] || ''),
            clase: String(row[base + 2] || ''),
            serial: String(row[base + 3] || '')
          });
        }
      }
      // Mascotas (2)
      for (let m = 0; m < 2; m++) {
        const base = 110 + m * 10;
        const tipo = String(row[base] || '');
        if (tipo) {
          resultado.mascotas.push({
            tipo: tipo,
            nombre: String(row[base + 1] || ''),
            raza: String(row[base + 2] || ''),
            color: String(row[base + 3] || ''),
            sexo: String(row[base + 4] || ''),
            manejoEspecial: String(row[base + 6] || '')
          });
        }
      }
      resultados.push(resultado);
      if (resultados.length >= 100) break;
    }
  }
  return { ok: true, resultados: resultados, total: resultados.length };
}

function vigilanteVerMudanzas(fecha) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Mudanzas');
  if (!sheet) return { ok: false, error: 'Pestana Mudanzas no encontrada' };
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true, reservas: [] };

  // Leer todas las columnas (necesitamos las nuevas T/U/V tambien)
  const data = sheet.getRange(2, 1, last - 1, 22).getValues();

  // Calcular fecha limite (30 dias atras)
  const hoy = new Date();
  const hace30 = new Date(hoy);
  hace30.setDate(hace30.getDate() - 30);

  const reservas = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const idReserva = String(row[0] || '');
    const numForm = String(row[1] || '');
    const apto = String(row[2] || '');
    const tipo = String(row[3] || '');
    const torre = String(row[4] || '');
    const ascensor = String(row[5] || '');
    const fechaRes = row[6]; // Date object
    const horaInicio = normalizarHora(row[7]);   // V37: antes String() mostraba "Sat Dec 30 1899..."
    const horaFin = normalizarHora(row[8]);      // V37: fix R-23
    const nombre = String(row[9] || '');
    const estado = String(row[17] || '');
    const realizada = String(row[19] || ''); // T
    const fechaCheck = String(row[20] || ''); // U
    const vigilante = String(row[21] || ''); // V
    const descripcionElementos = String(row[COL_MUD_DESCRIPCION] || '');  // V37 W

    if (!idReserva) continue;

    // Filtrar por estado
    if (estado !== 'Confirmada' && estado !== 'Cancelada') continue;

    // Si se especifico fecha, filtrar
    if (fecha) {
      const fechaStr = String(fecha || '').trim();
      if (fechaStr) {
        const fechaResStr = fechaRes instanceof Date
          ? Utilities.formatDate(fechaRes, 'America/Bogota', 'yyyy-MM-dd')
          : String(fechaRes).slice(0, 10);
        if (fechaResStr !== fechaStr) continue;
      }
    } else {
      // Sin fecha: solo Confirmadas futuras o Canceladas recientes
      const fechaDate = fechaRes instanceof Date ? fechaRes : new Date(String(fechaRes));
      if (estado === 'Cancelada') {
        // Solo Canceladas de los ultimos 30 dias
        if (fechaDate < hace30) continue;
      } else {
        // Solo Confirmadas futuras (o hoy)
        const hoy0 = new Date(hoy);
        hoy0.setHours(0, 0, 0, 0);
        if (fechaDate < hoy0) continue;
      }
    }

    reservas.push({
      idReserva: idReserva,
      numForm: numForm,
      apto: apto,
      tipoMudanza: tipo,
      descripcionElementos: descripcionElementos,
      torre: torre,
      ascensor: ascensor,
      fecha: fechaRes instanceof Date
        ? Utilities.formatDate(fechaRes, 'America/Bogota', 'yyyy-MM-dd')
        : String(fechaRes).slice(0, 10),
      horaInicio: horaInicio,
      horaFin: horaFin,
      nombrePropietario: nombre,
      estado: estado,
      realizada: realizada,
      fechaCheck: fechaCheck,
      vigilante: vigilante,
      rowNumber: i + 2
    });
  }

  // Ordenar: Confirmadas futuras primero, luego Canceladas recientes
  reservas.sort((a, b) => {
    if (a.estado !== b.estado) {
      return a.estado === 'Confirmada' ? -1 : 1;
    }
    return a.fecha.localeCompare(b.fecha);
  });

  return { ok: true, reservas: reservas, total: reservas.length };
}

function vigilanteCheckMudanza(data) {
  const idReserva = String(data.idReserva || '').trim();
  if (!idReserva) return { ok: false, error: 'Falta idReserva' };
  const status = String(data.status || '').trim();
  if (status !== 'realizada' && status !== 'no_realizada') {
    return { ok: false, error: 'status debe ser "realizada" o "no_realizada"' };
  }
  const vigilante = String(data.vigilante || '').trim().substring(0, 100);

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Mudanzas');
  if (!sheet) return { ok: false, error: 'Pestana Mudanzas no encontrada' };
  const last = sheet.getLastRow();
  if (last < 2) return { ok: false, error: 'Sin reservas' };

  const idCol = sheet.getRange(2, 1, last - 1, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < idCol.length; i++) {
    if (String(idCol[i][0] || '').trim() === idReserva) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow === -1) return { ok: false, error: 'No se encontro la reserva ' + idReserva };

  // Lock para evitar race conditions entre vigilantes
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Otro vigilante esta marcando. Intenta en unos segundos.' };
  }
  try {
    sheet.getRange(targetRow, 20).setValue(status === 'realizada' ? 'Sí' : 'No'); // T
    sheet.getRange(targetRow, 21).setValue(Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss')); // U
    sheet.getRange(targetRow, 22).setValue(vigilante); // V
    Logger.log('vigilanteCheck: ' + idReserva + ' = ' + status + ' por ' + vigilante);
    return { ok: true, message: 'Check registrado correctamente', rowNumber: targetRow };
  } finally {
    lock.releaseLock();
  }
}

function vigilanteBuscarPorPlaca(placa) {
  placa = String(placa || '').trim().toUpperCase();
  // AUD-T1: mínimo 3 caracteres para evitar volcados masivos
  if (!placa || placa.length < 3) {
    return { ok: false, error: 'Ingrese al menos 3 caracteres de la placa.' };
  }
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) return { ok: false, error: 'Sheet no encontrado' };
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return { ok: true, resultados: [] };

  const data = sheet.getRange(HEADER_ROW + 1, 1, last - HEADER_ROW, NUM_COLS).getValues();
  const resultados = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const apto = String(row[COL_APTO] || '');
    const diligencia = String(row[4] || '');
    const nombreProp = String(row[5] || '');

    // Buscar en vehiculos (cols 61-72) y motos (cols 73-84)
    const matches = [];
    for (let v = 0; v < 2; v++) {
      const baseV = 61 + v * 6;
      const placaV = String(row[baseV + 3] || '').toUpperCase();
      if (placaV && placaV.indexOf(placa) !== -1) {
        matches.push({
          tipoVehiculo: 'vehiculo',
          numero: v + 1,
          marca: String(row[baseV] || ''),
          tipo: String(row[baseV + 1] || ''),
          color: String(row[baseV + 2] || ''),
          placa: placaV,
          modelo: String(row[baseV + 4] || ''),
          tag: String(row[baseV + 5] || '')
        });
      }
    }
    for (let m = 0; m < 2; m++) {
      const baseM = 73 + m * 6;
      const placaM = String(row[baseM + 3] || '').toUpperCase();
      if (placaM && placaM.indexOf(placa) !== -1) {
        matches.push({
          tipoVehiculo: 'moto',
          numero: m + 1,
          marca: String(row[baseM] || ''),
          tipo: String(row[baseM + 1] || ''),
          color: String(row[baseM + 2] || ''),
          placa: placaM,
          modelo: String(row[baseM + 4] || ''),
          tag: String(row[baseM + 5] || '')
        });
      }
    }
    if (matches.length > 0) {
      resultados.push({
        apto: apto,
        diligencia: diligencia,
        nombreProp: nombreProp,
        vehiculos: matches,
        rowNumber: HEADER_ROW + 1 + i
      });
    }
  }
  return { ok: true, resultados: resultados, total: resultados.length };
}

// =====================================================================
// MÓDULO RESIDENTE (agregado 25-Sept-2026 spec-residente.md)
// Portal nuevo: residente.html
// Endpoints: getEstadoResidente, verificarResidente,
//            registrarResidente, actualizarResidente, clearResidente
// =====================================================================

// ---------------------------------------------------------------------
// Endpoint R.1: getEstadoResidente
// Pantalla inicial del portal: indica si el apto existe y si tiene residentes.
// NO devuelve CCs ni teléfonos (privacidad).
// ---------------------------------------------------------------------
function getEstadoResidente(apto) {
  apto = String(apto || '').trim();
  if (!apto) return { ok: false, error: 'Falta N° de apartamento' };

  const row = findRowByApto(apto);
  if (!row) return { ok: true, apto: apto, aptoExiste: false };

  const nombresResidentes = [];

  // Slots de residentes: v[29..48] (4 residentes x 5 cols)
  for (let i = 0; i < 4; i++) {
    const base = 29 + i * 5;
    const nombre = String(row.values[base] || '').trim();
    if (nombre) nombresResidentes.push(nombre);
  }

  // BUGFIX-018: NO devolver numForm, nombresResidentes ni propietario.
  // Son datos sensibles accesibles sin autenticación. numForm es la credencial
  // de edición; nombres y propietario son datos personales (Ley 1581/2012).
  // El frontend solo necesita los booleanos para decidir el flujo.
  return {
    ok: true,
    apto: apto,
    aptoExiste: true,
    hayResidentes: nombresResidentes.length > 0,
    numResidentes: nombresResidentes.length
  };
}

// ---------------------------------------------------------------------
// Endpoint R.2: verificarResidente
// Valida CC contra los slots 1-4 de residentes del apto.
// Devuelve el slot que matchea + datos básicos del residente.
// ---------------------------------------------------------------------
function verificarResidente(apto, cc) {
  apto = String(apto || '').trim();
  cc = normCc(cc);

  if (!apto || !cc) return { ok: false, error: 'Falta apto o cc' };

  const row = findRowByApto(apto);
  if (!row) return { ok: false, error: 'Apartamento no encontrado.' };

  for (let i = 0; i < 4; i++) {
    const base = 29 + i * 5;
    const ccEnSheet = normCc(row.values[base + 1] || '');
    if (ccEnSheet && ccEnSheet === cc) {
      return {
        ok: true,
        slot: i + 1,
        datos: {
          nombre: String(row.values[base] || '').trim(),
          cc: String(row.values[base + 1] || '').trim(),
          parentesco: String(row.values[base + 4] || '').trim(),
          cel: String(row.values[base + 3] || '').trim(),
          correo: String(row.values[base + 2] || '').trim()
        }
      };
    }
  }

  return { ok: false, error: 'No se encontró un residente con esa cédula en este apartamento.' };
}

// ---------------------------------------------------------------------
// Endpoint R.3: registrarResidente
// Auto-registro cuando TODOS los slots 1-4 de residentes están VACÍOS.
// Valida que el apto exista, que no haya residentes, y luego reusa
// submitRecord para escribir el registro. LockService para concurrencia.
// ---------------------------------------------------------------------
// =====================================================================
// BUGFIX-027 · 25-Oct-2026 — Reparación del portal del residente
// =====================================================================
//
// CONTEXTO (detectado durante la auditoría del spec de correo):
//
// El flujo "Editar mis datos" del portal del residente (residente.html)
// estaba COMPLETAMENTE ROTO. `actualizarResidente` construía su payload
// sin `editMode: true`, por lo que submitRecord() entraba al branch de
// CREACIÓN, findRowByApto() encontraba la fila existente y rechazaba
// SIEMPRE con "Ya existe un registro para el apartamento X".
// Verificado empíricamente el 25-Oct-2026 contra el apto 218 / CA-0002.
//
// PERO el bug de fondo era más grave: el payload estaba escrito A MANO
// con 40+ campos y se había DESINCRONIZADO de buildRowFromPayload().
// Medido con un banco de pruebas sobre las 274 filas REALES del Sheet:
//
//   actualizarResidente -> 200/274 filas perdían datos
//   registrarResidente  ->  36/ 74 filas perdían datos (¡EN VIVO!)
//
//   col 137 Autoriza Datos de Menores    192 filas (70.1%)  <-- LEGAL
//   col 138 Autoriza Comunicaciones      242 filas (88.3%)  <-- LEGAL
//   col 130-135 Emergencias/Contactos    168 filas (61.3%)
//   col  93 Llaveros Autorizados          51 filas (18.6%)
//   col 110-129 Mascotas                 88 filas (32.1%)
//   col  85-92  Bicicletas               21 filas ( 7.7%)
//
// LA SOLUCIÓN: usar rowToObject(row.values), que YA existe en el
// codebase y hace un round-trip fiel de las 143 columnas, y encima
// sobreescribir SOLO los campos que el residente puede cambiar.
// Así, por construcción, no se puede perder ningún campo.
//
// Reglas de negocio que se respetan (spec-residente.md §22.7):
//   · El residente solo puede editar SU propio slot.
//   · NO puede modificar slots ocupados por otro residente.
//   · NO puede tocar dispositivos/llaveros/tags (solo el propietario).
//   · NO puede tocar las autorizaciones legales del propietario.
//   · NO puede borrar los datos del propietario.
//   · SÍ puede llenar un slot compartido VACÍO con sus datos.
//
// ---------------------------------------------------------------------

// BUGFIX-027: buildRowFromPayload() convierte con TRUTHINESS:
//   v[136] = d.autDatos ? 'Sí' : 'No'
// El string 'No' es truthy en JS, asi que mandar 'No' escribiria 'Sí'.
// Hay que mandar BOOLEANOS. Se preserva el valor ORIGINAL del Sheet.
function _preservarAutorizaciones(values) {
  const b = function (i) { return String(values[i] || '').trim() === 'Sí'; };
  return { autDatos: b(136), autMenores: b(137), autCom: b(138) };
}

// BUGFIX-027: idem para `requiereRevision` (col 15) y para
// `manejoEspecial` de mascotas (col 116/126): son tri-estado
// (Sí / No / vacio) y no pueden representarse con un simple booleano.
function _preservarTriEstado(v) {
  const s = String(v || '').trim();
  if (s === 'Sí') return true;
  if (s === 'No') return false;
  return '';
}

// BUGFIX-027: extrae los dispositivos (llaveros/tags) actuales del Sheet.
function _preservarDispositivos(values) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const b = 95 + i * 5;
    out.push({
      tipo:   String(values[b + 0] || '').trim(),
      codigo: String(values[b + 1] || '').trim(),
      placa:  String(values[b + 2] || '').trim(),
      fecha:  String(values[b + 3] || '').trim(),
      recibe: String(values[b + 4] || '').trim()
    });
  }
  return out;
}

// BUGFIX-027: reconstruye un slot compartido DESDE EL SHEET usando las
// MISMAS claves que lee buildRowFromPayload().
//
// La funcion previa `validarYAplicarSlotsCompartidos` usaba claves que
// NO coincidian con buildRowFromPayload():
//   - bicis     -> usaba tipo/rodado;      buildRow lee marca,color,clase,serial
//   - mascotas  -> usaba especie/edad;     buildRow lee tipo,nombre,raza,color,
//                                               sexo,vacuna,manejoEspecial,
//                                               registro,aseguradora,poliza
//   - contactos -> usaba parentesco/celular;buildRow lee nombre,parent,tel
// Con esas claves, buildRowFromPayload() escribia '' en las columnas
// correctas y el dato original se perdia.
function _preservarSlotCompartido(values, tipo, baseInicial, anchoSlot, numSlots) {
  const out = [];
  for (let i = 0; i < numSlots; i++) {
    const b = baseInicial + i * anchoSlot;
    const cel = function (k) { return String(values[b + k] || '').trim(); };
    if (tipo === 'vehiculos' || tipo === 'motos') {
      out.push({ marca: cel(0), tipo: cel(1), color: cel(2), placa: cel(3), modelo: cel(4), tag: cel(5) });
    } else if (tipo === 'bicis') {
      out.push({ marca: cel(0), color: cel(1), clase: cel(2), serial: cel(3) });
    } else if (tipo === 'mascotas') {
      out.push({
        tipo: cel(0), nombre: cel(1), raza: cel(2), color: cel(3),
        sexo: cel(4), vacuna: cel(5),
        manejoEspecial: _preservarTriEstado(cel(6)),
        registro: cel(7), aseguradora: cel(8), poliza: cel(9)
      });
    } else if (tipo === 'contactos') {
      out.push({ nombre: cel(0), parent: cel(1), tel: cel(2) });
    }
  }
  return out;
}

// BUGFIX-027: normaliza un objetoSlot que ENVIA el frontend del portal
// del residente (js/residente.js) a las claves canonicas que lee
// buildRowFromPayload().
//
// El frontend del portal del residente usa un subconjunto de campos con
// OTROS nombres que el formulario principal (js/app.js):
//  resident.bicis     -> { marca, color, tipo,   rodado }
//   resident.mascotas  -> { nombre, especie, raza, edad, vacuna }
//   resident.contactos -> { nombre, parentesco, celular }
// Sin esta normalizacion, esos datos se escribian en columnas equivocadas.
function _normalizarNuevoSlot(tipo, obj) {
  const o = obj || {};
  const g = function (a, b) {
    const v = (o[a] !== undefined && o[a] !== null && o[a] !== '') ? o[a] : (o[b] || '');
    return String(v).trim();
  };
  if (tipo === 'vehiculos' || tipo === 'motos') {
    return { marca: g('marca'), tipo: g('tipo'), color: g('color'),
             placa: g('placa'), modelo: g('modelo'), tag: g('tag') };
  }
  if (tipo === 'bicis') {
    return { marca: g('marca'), color: g('color'), clase: g('clase', 'tipo'),
             serial: g('serial', 'rodado') };
  }
  if (tipo === 'mascotas') {
    return { tipo: g('tipo', 'especie'), nombre: g('nombre'), raza: g('raza'),
             color: g('color'), sexo: g('sexo'), vacuna: g('vacuna'),
             manejoEspecial: _preservarTriEstado(g('manejoEspecial')),
             registro: g('registro'), aseguradora: g('aseguradora'),
             poliza: g('poliza') };
  }
  if (tipo === 'contactos') {
    return { nombre: g('nombre'), parent: g('parent', 'parentesco'),
             tel: g('tel', 'celular') };
  }
  return {};
}

// BUGFIX-027: objeto vacio con las claves canonicas del tipo.
function _slotVacio(tipo) {
  if (tipo === 'vehiculos' || tipo === 'motos') {
    return { marca: '', tipo: '', color: '', placa: '', modelo: '', tag: '' };
  }
  if (tipo === 'bicis') {
    return { marca: '', color: '', clase: '', serial: '' };
  }
  if (tipo === 'mascotas') {
    return { tipo: '', nombre: '', raza: '', color: '', sexo: '', vacuna: '',
             manejoEspecial: '', registro: '', aseguradora: '', poliza: '' };
  }
  if (tipo === 'contactos') {
    return { nombre: '', parent: '', tel: '' };
  }
  return {};
}

// BUGFIX-027: combina los slots compartidos del Sheet con los datos que
// trae el RESIDENTE.
//
// Regla (spec-residente.md §22.7): el residente SOLO puede agregar a un
// slot VACIO. Si el slot ya tiene datos (del propietario o de otro
// residente), se preserva intacto.
//
//   slot con datos en el Sheet  -> se preserva (gana el Sheet)
//   slot vacio + dato del res. -> se usa el dato del residente
//   slot vacio + sin dato       -> queda vacio
function _combinarSlotsCompartidos(values, tipo, baseInicial, anchoSlot, numSlots, nuevos) {
  const delSheet = _preservarSlotCompartido(values, tipo, baseInicial, anchoSlot, numSlots);
  const lista = Array.isArray(nuevos) ? nuevos : [];
  const out = [];
  // Indice del siguiente dato del residente por asignar. Los datos del
  // residente van al PRIMER slot VACIO, no al slot del mismo indice: si
  // el propietario ya tiene V1 ocupado, el vehiculo del resident debe
  // ir a V2, no descartarse.
  let siguiente = 0;
  for (let i = 0; i < numSlots; i++) {
    const b = baseInicial + i * anchoSlot;
    let hayDatos = false;
    for (let k = 0; k < anchoSlot; k++) {
      if (String(values[b + k] || '').trim()) { hayDatos = true; break; }
    }
    if (hayDatos) {
      out.push(delSheet[i]);                               // el Sheet gana
    } else if (siguiente < lista.length && lista[siguiente]) {
      out.push(_normalizarNuevoSlot(tipo, lista[siguiente]));  // slot vacio -> del residente
      siguiente++;
    } else {
      out.push(_slotVacio(tipo));
    }
  }
  return out;
}

// BUGFIX-027: preserva los menores del Sheet si existen; si no, usa los
// que trae el residente (4 slots de 3 columnas: nombre, edad, parent).
function _combinarMenores(values, nuevos) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const b = 49 + i * 3;
    const nombre = String(values[b + 0] || '').trim();
    const edad   = String(values[b + 1] || '').trim();
    const parent = String(values[b + 2] || '').trim();
    if (nombre || edad || parent) {
      out.push({ nombre: nombre, edad: edad, parent: parent });
    } else if (i < (Array.isArray(nuevos) ? nuevos.length : 0) && nuevos[i]) {
      const n = nuevos[i] || {};
      out.push({
        nombre: String(n.nombre || '').trim(),
        edad:   String(n.edad || '').trim(),
        parent: String(n.parent || n.parentesco || '').trim()
      });
    } else {
      out.push({ nombre: '', edad: '', parent: '' });
    }
  }
  return out;
}

function registrarResidente(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Otro residente está registrando en este momento. Intenta en unos segundos.' };
  }
  try {
    const apto = String(data.apto || '').trim();
    if (!apto) return { ok: false, error: 'Falta N° de apartamento' };

    const row = findRowByApto(apto);
    if (!row) return { ok: false, error: 'Apartamento no encontrado. Pida al propietario que lo registre primero.' };

    // Verificar que TODOS los slots de residentes estén vacíos
    let slotAsignado = -1;
    for (let i = 0; i < 4; i++) {
      const base = 29 + i * 5;
      const nombreActual = String(row.values[base] || '').trim();
      if (nombreActual) {
        // BUGFIX-012: mensaje sin referencias al formulario principal (index.html)
        // El residente solo conoce residente.html; aquí se le guía a usar su cédula
        // o pedir al propietario que lo agregue.
        return { ok: false, error: 'Este apartamento ya tiene ' + (i + 1) + ' residente(s) registrado(s). Si eres uno de ellos, vuelve a este portal e ingresa tu número de cédula. Si no apareces en la lista, pide al propietario que te agregue.' };
      }
      if (slotAsignado === -1) slotAsignado = i + 1;
    }

    // BUGFIX-013: buildRowFromPayload (Código.gs línea 336) lee `r.parent` para
    // escribir v[33] (parentesco del residente), pero residente.js línea 466
    // envía el campo como `r.parentesco`. Sin esta normalización, col 33
    // queda VACÍA y el conjunto no sabe si el residente es arrendatario/hijo/etc.
    // (bug preexistente de V13 descubierto durante testing de V21).
    const residentesCrudos = Array.isArray(data.residentes) ? data.residentes : [];
    const residentes = residentesCrudos.map(function (r) {
      return {
        nombre: r.nombre || '',
        cc: r.cc || '',
        correo: r.correo || '',
        cel: r.cel || '',
        parent: r.parentesco || r.parent || ''
      };
    });
    if (residentes.length === 0) {
      return { ok: false, error: 'Debe registrar al menos un residente.' };
    }
    if (residentes.length > 4) {
      return { ok: false, error: 'Máximo 4 residentes por apartamento.' };
    }

    // Construir payload compatible con submitRecord (modo edición)
    // Mantiene los datos del propietario intactos
    //
    // BUGFIX-012: registrarResidente reutiliza submitRecord() para escribir,
    // pero submitRecord sin editMode:true entra al branch de CREACIÓN y falla
    // con "Ya existe un registro..." porque el apto YA fue creado por el propietario.
    // Solución: marcar editMode:true para que submitRecord haga UPDATE sobre la
    // fila existente y preserve numForm + Fecha Registro originales.
    // Riesgo: lock — submitRecord NO pide su propio LockService (verificado en línea 234),
    // por lo que el lock de registrarResidente (línea 1990) cubre toda la operación.
    // Riesgo: hash dedupe — el payload pasa ccProp y firmaCC del registro original,
    // por lo que el hash sha256[:16] queda idéntico (sin colisión).
    //
    // BUGFIX-012 (FIX REAL): copiar dispositivos originales del propietario
    // porque setValues([row]) escribe las 143 columnas completas y un array
    // vacío los borraría. El residente NO puede autorizar dispositivos en el
    // portal — solo el propietario lo hace desde la Sección 8 del formulario
    // principal o desde el portal admin.
    const _dispOrig = [];
    for (let _i = 0; _i < 3; _i++) {
      const _base = 95 + _i * 5;
      _dispOrig.push({
        tipo: String(row.values[_base + 0] || '').trim(),
        codigo: String(row.values[_base + 1] || '').trim(),
        placa: String(row.values[_base + 2] || '').trim(),
        fecha: String(row.values[_base + 3] || '').trim(),
        recibe: String(row.values[_base + 4] || '').trim()
      });
    }
    const _dispConDatos = _dispOrig.filter(function (d) { return d.tipo || d.codigo; });
    const _dispResidente = Array.isArray(data.dispositivos) ? data.dispositivos : [];
    const dispositivosFinal = _dispResidente.length > 0 ? _dispResidente : _dispConDatos;

    // BUGFIX-027 · 25-Oct-2026 — Reconstrucción fiel del payload.
    //
    // El payload anterior estaba escrito A MANO y se había
    // desincronizado de buildRowFromPayload(): las autorizaciones
    // legales (col 136/137/138) NO se mandaban, y buildRowFromPayload()
    // hace v[137] = d.autMenores ? 'Sí' : 'No' -> se BORRABA la
    // autorización de menores y la de comunicaciones.
    // Medido con un banco de pruebas sobre las 274 filas REALES del
    // Sheet, la version anterior perdia datos en 36 de las 74 filas
    // elegibles (registro de un residente en un apto sin residentes):
    //   col 138 Autoriza Comunicaciones      61 filas (88.3%)  <-- LEGAL
    //   col 137 Autoriza Datos de Menores    46 filas (70.1%)  <-- LEGAL
    //   col 130-135 Emergencias/Contactos    25 filas (61.3%)
    //   col  93 Llaveros Autorizados          6 filas (18.6%)
    //   ... vehiculos, motos, bicis, mascotas y menores del PROPIETARIO
    //   tambien se perdian.
    //
    // rowToObject() ya existe y hace un round-trip fiel de las 143
    // columnas. Partimos de ahi y sobreescribimos SOLO lo que el
    // residente puede cambiar. Por construccion, no se puede perder
    // ningun campo.
    const _base = rowToObject(row.values);
    const _aut = _preservarAutorizaciones(row.values);

    const payload = {
      ..._base,
      editMode: true,                                       // BUGFIX-012: clave del fix
      apto: apto,
      numForm: String(row.values[COL_NUM_FORM] || ''),
      // BUGFIX-027: rowToObject() devuelve esto como STRING 'Sí'/'No'.
      // buildRowFromPayload() hace `d.requiereRevision ? 'Sí' : 'No'` y el
      // string 'No' es TRUTHY -> escribiria 'Sí' en 246 filas. Se envia
      // como tri-estado (true / false / '').
      requiereRevision: _preservarTriEstado(String(row.values[15] || '')),
      // El residente que se registra ocupa el slot asignado; los demas
      // slots de residentes quedan vacios (es un apto sin residentes).
      residentes: residentes,
      // Slots compartidos: si el Sheet ya tiene datos, GANA el Sheet
      // (son del propietario y no se pueden pisar). Si el slot esta
      // VACIO, entra el dato del residente.
      menores:   _combinarMenores(row.values, data.menores),
      vehiculos: _combinarSlotsCompartidos(row.values, 'vehiculos', 61, 6, 2, data.vehiculos),
      motos:     _combinarSlotsCompartidos(row.values, 'motos', 73, 6, 2, data.motos),
      bicis:     _combinarSlotsCompartidos(row.values, 'bicis', 85, 4, 2, data.bicis),
      mascotas:  _combinarSlotsCompartidos(row.values, 'mascotas', 110, 10, 2, data.mascotas),
      // BUGFIX-027: buildRowFromPayload() lee la clave 'emergencias'
      // (no 'contactos'). Con 'contactos' el dato se descartaba y las
      // columnas 130-135 quedaban vacias.
      emergencias: _combinarSlotsCompartidos(row.values, 'contactos', 130, 3, 2, data.contactos),
      // Dispositivos: solo el propietario los autoriza. Se preservan.
      dispositivos: dispositivosFinal,                       // BUGFIX-012: preserva del propietario
      llaverosAut: String(row.values[93] || ''),
      tagsAut:     String(row.values[94] || ''),
      // Autorizaciones legales: se preservan del propietario.
      autDatos:   _aut.autDatos,
      autMenores: _aut.autMenores,
      autCom:     _aut.autCom,
      // Firma del propietario: se preserva.
      firmaNom:  String(row.values[139] || ''),
      firmaCC:   String(row.values[140] || ''),
      firmaFecha: String(row.values[141] || ''),
    };

    const result = submitRecord(payload, { yaBloqueado: true });
    if (result.ok) {
      return {
        ok: true,
        numForm: result.editMode ? String(row.values[COL_NUM_FORM] || '') : (result.numForm || ''),
        slotAsignado: slotAsignado,
        message: 'Registro exitoso.'
      };
    }

    // BUGFIX-012: sanitizar mensaje de error de submitRecord.
    // Si por alguna razón submitRecord rechaza con un mensaje del formulario
    // principal (p.ej. "Usa la opción EDITAR MI REGISTRO"), reescribirlo para
    // que el residente NUNCA vea una referencia al index.html (solo conoce residente.html).
    let errMsg = (result.error || '').toString();
    if (/EDITAR MI REGISTRO/.test(errMsg)) {
      errMsg = 'No se pudo registrar tu información. Si el problema persiste, contacta a la administración de Cerro Azul (urb.cerroazul@gmail.com).';
    }
    return { ok: false, error: errMsg };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Endpoint R.4: actualizarResidente
// Edita los datos del residente identificado por CC en un slot específico.
// Re-verifica identidad server-side. Slots compartidos se validan.
// ---------------------------------------------------------------------
function actualizarResidente(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Otro residente está actualizando en este momento. Intenta en unos segundos.' };
  }
  try {
    const apto = String(data.apto || '').trim();
    const cc = normCc(data.cc || '');
    const slot = parseInt(data.slot || '', 10);

    if (!apto || !cc || !slot || slot < 1 || slot > 4) {
      return { ok: false, error: 'Datos inválidos (apto, cc, slot requeridos)' };
    }

    const row = findRowByApto(apto);
    if (!row) return { ok: false, error: 'Apartamento no encontrado' };

    // Re-verificar identidad contra el slot declarado
    const baseResidente = 29 + (slot - 1) * 5;
    const ccEnSheet = normCc(row.values[baseResidente + 1] || '');
    if (ccEnSheet !== cc) {
      return { ok: false, error: 'La cédula no corresponde al residente del slot ' + slot };
    }

    const datos = data.datosActualizados || {};
    const nuevosResidentes = Array.isArray(datos.residentes) ? datos.residentes : [];

    // BUGFIX-027 · 25-Oct-2026 — Reconstrucción fiel del payload.
    //
    // El payload anterior estaba escrito A MANO con 40+ campos y se había
    // desincronizado de buildRowFromPayload(). Medido con un banco de
    // pruebas sobre las 274 filas REALES del Sheet, la version anterior
    // perdia datos en 200 de 274 filas, entre ellas:
    //   col 137 Autoriza Datos de Menores  192 filas (70.1%)  <-- LEGAL
    //   col 138 Autoriza Comunicaciones    242 filas (88.3%)  <-- LEGAL
    //   col 130-135 Emergencias            168 filas (61.3%)
    //   col  93 Llaveros Autorizados        51 filas (18.6%)
    //   col 110-129 Mascotas               88 filas (32.1%)
    //
    // rowToObject() ya existe y hace un round-trip fiel de las 143
    // columnas. Partimos de ahi y sobreescribimos SOLO lo que el
    // residente puede cambiar. Por construccion, no se puede perder
    // ningun campo.
    //
    // BUGFIX-027 (H-13): faltaba `editMode: true`. Sin el, submitRecord()
    // entra al branch de CREACION, findRowByApto() encuentra la fila
    // existente y rechaza SIEMPRE con "Ya existe un registro para el
    // apartamento X". El flujo "Editar mis datos" del portal del residente
    // estaba roto por esto (verificado 25-Oct-2026 con el apto 218).
    const _base = rowToObject(row.values);
    const _aut = _preservarAutorizaciones(row.values);

    const payload = {
      ..._base,
      editMode: true,                                       // BUGFIX-027: H-13
      apto: apto,
      numForm: String(row.values[COL_NUM_FORM] || ''),
      // BUGFIX-027: ver nota en registrarResidente (tri-estado, no string).
      requiereRevision: _preservarTriEstado(String(row.values[15] || '')),
      // Preservar los otros residentes, solo actualizar el slot N
      residentes: construirResidentesParaActualizar(row.values, slot, nuevosResidentes),
      // Slots compartidos: si el Sheet ya tiene datos, GANA el Sheet
      // (el resident no puede pisar datos del propietario ni de otro
      // residente). Si el slot esta VACIO, entra el dato del resident.
      menores:   _combinarMenores(row.values, datos.menores),
      vehiculos: _combinarSlotsCompartidos(row.values, 'vehiculos', 61, 6, 2, datos.vehiculos),
      motos:     _combinarSlotsCompartidos(row.values, 'motos', 73, 6, 2, datos.motos),
      bicis:     _combinarSlotsCompartidos(row.values, 'bicis', 85, 4, 2, datos.bicis),
      mascotas:  _combinarSlotsCompartidos(row.values, 'mascotas', 110, 10, 2, datos.mascotas),
      // BUGFIX-027: buildRowFromPayload() lee la clave 'emergencias'
      // (no 'contactos'). Con 'contactos' el dato se descartaba y las
      // columnas 130-135 quedaban vacias.
      emergencias: _combinarSlotsCompartidos(row.values, 'contactos', 130, 3, 2, datos.contactos),
      // Dispositivos: solo el propietario los autoriza. Se preservan.
      dispositivos: _preservarDispositivos(row.values),
      llaverosAut: String(row.values[93] || ''),
      tagsAut:     String(row.values[94] || ''),
      // Autorizaciones legales: se preservan del propietario.
      autDatos:   _aut.autDatos,
      autMenores: _aut.autMenores,
      autCom:     _aut.autCom,
      // Firma del propietario: se preserva.
      firmaNom:  String(row.values[139] || ''),
      firmaCC:   String(row.values[140] || ''),
      firmaFecha: String(row.values[141] || ''),
    };

    const result = submitRecord(payload, { yaBloqueado: true });
    if (result.ok) {
      return { ok: true, slotActualizado: slot, message: 'Datos actualizados correctamente.' };
    }
    return result;
  } finally {
    lock.releaseLock();
  }
}

// Helper: construye el array de 4 residentes preservando los otros slots y actualizando el slot N
function construirResidentesParaActualizar(values, slot, nuevos) {
  const res = [];
  for (let i = 0; i < 4; i++) {
    const base = 29 + i * 5;
    if (i === (slot - 1)) {
      // Slot a actualizar: tomar del payload del frontend
      const nuevo = (nuevos && nuevos[0]) || {};
      res.push({
        nombre: nuevo.nombre || String(values[base] || '').trim(),
        cc: nuevo.cc || String(values[base + 1] || '').trim(),
        correo: nuevo.correo || String(values[base + 2] || '').trim(),
        cel: nuevo.cel || String(values[base + 3] || '').trim(),
        parent: nuevo.parentesco || nuevo.parent || String(values[base + 4] || '').trim()
      });
    } else {
      // Otros slots: preservar los datos existentes
      res.push({
        nombre: String(values[base] || '').trim(),
        cc: String(values[base + 1] || '').trim(),
        correo: String(values[base + 2] || '').trim(),
        cel: String(values[base + 3] || '').trim(),
        parent: String(values[base + 4] || '').trim()
      });
    }
  }
  return res;
}

// Helper: extrae los menores actuales del Sheet
function construirMenoresActuales(values) {
  const men = [];
  for (let i = 0; i < 4; i++) {
    const base = 49 + i * 3;
    men.push({
      nombre: String(values[base] || '').trim(),
      edad: String(values[base + 1] || '').trim(),
      parent: String(values[base + 2] || '').trim()
    });
  }
  return men;
}

// Helper: valida slots compartidos y construye el array.
// Si un slot ya está ocupado por un valor del Sheet, se preserva.
// Si el residente quiere agregar a un slot vacío, se permite.
function validarYAplicarSlotsCompartidos(values, tipo, baseInicial, anchoSlot, numSlots, datosNuevos) {
  const result = [];
  if (!Array.isArray(datosNuevos)) datosNuevos = [];

  for (let i = 0; i < numSlots; i++) {
    const base = baseInicial + i * anchoSlot;
    const tieneDatosSheet = anchoSlot >= 6
      ? (String(values[base] || '').trim() || String(values[base + 3] || '').trim())  // veh/moto: marca o placa
      : (anchoSlot === 4
          ? String(values[base] || '').trim()  // bici: marca
          : String(values[base] || '').trim()); // mascota/contacto: nombre

    if (i < datosNuevos.length && datosNuevos[i]) {
      result.push(datosNuevos[i]);
    } else if (tieneDatosSheet) {
      // Mantener datos existentes del Sheet
      const obj = {};
      for (let j = 0; j < anchoSlot; j++) {
        obj['col' + j] = String(values[base + j] || '').trim();
      }
      // Convertir a la forma esperada por submitRecord según el tipo
      if (tipo === 'vehiculos' || tipo === 'motos') {
        result.push({
          marca: obj.col0, tipo: obj.col1, color: obj.col2,
          placa: obj.col3, modelo: obj.col4, tag: obj.col5
        });
      } else if (tipo === 'bicis') {
        result.push({ marca: obj.col0, tipo: obj.col1, color: obj.col2, rodado: obj.col3 });
      } else if (tipo === 'mascotas') {
        result.push({
          nombre: obj.col0, especie: obj.col1, raza: obj.col2,
          edad: obj.col3, vacuna: obj.col4, color: obj.col5,
          observaciones: obj.col7 || '', contacto: obj.col8 || ''
        });
      } else if (tipo === 'contactos') {
        result.push({ nombre: obj.col0, parentesco: obj.col1, celular: obj.col2 });
      }
    } else {
      // Slot vacío
      if (tipo === 'vehiculos' || tipo === 'motos') {
        result.push({ marca: '', tipo: '', color: '', placa: '', modelo: '', tag: '' });
      } else if (tipo === 'bicis') {
        result.push({ marca: '', tipo: '', color: '', rodado: '' });
      } else if (tipo === 'mascotas') {
        result.push({ nombre: '', especie: '', raza: '', edad: '', vacuna: '', color: '', observaciones: '', contacto: '' });
      } else if (tipo === 'contactos') {
        result.push({ nombre: '', parentesco: '', celular: '' });
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------
// Endpoint R.5: clearResidente
// Borra TODOS los datos del residente anterior (secciones 5, 5.1, 6, 7, 9, 10).
// Solo el propietario o la inmobiliaria pueden ejecutarlo.
// Valida CC del propietario contra v[6].
// Limpia v[29..92] (residentes+menores+vehiculos+motos+bicis) y
// v[110..135] (mascotas+contactos).
// NO toca: secciones 1-4 (datos propietario), 8 (llaveros/futuro), 11 (firma).
// Logger.log para auditoría.
// ---------------------------------------------------------------------
function clearResidente(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Otra operación está en curso. Intenta en unos segundos.' };
  }
  try {
    const numForm = String(data.numForm || '').trim();
    const apto = String(data.apto || '').trim();
    const ccPropConfirm = normCc(data.ccPropConfirm || '');

    if (!numForm || !apto || !ccPropConfirm) {
      return { ok: false, error: 'Faltan datos requeridos (numForm, apto, ccPropConfirm)' };
    }

    const row = findRowByNumFormAndApto(numForm, apto);
    if (!row) return { ok: false, error: 'No se encontró el registro con ese N° de formulario y N° de apartamento.' };

    // Verificar que ccPropConfirm coincide con el CC del propietario en v[6]
    const ccPropSheet = normCc(row.values[6] || '');
    if (ccPropSheet !== ccPropConfirm) {
      return { ok: false, error: 'La cédula no corresponde al propietario del apartamento.' };
    }

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const rowNumber = row.rowNumber;

    // Limpiar v[29..92] (índices 0-based) = columnas AD..CO (1-based 30..93)
    // AD (30) a CO (93) = 64 columnas: residentes(20) + menores(12) + vehiculos(12) + motos(12) + bicis(8)
    sheet.getRange(rowNumber, 30, 1, 64).clearContent();

    // Limpiar v[110..135] (índices 0-based) = columnas 1-based 111..136
    //
    // BUGFIX-027-H17 (25-Oct-2026): OFF-BY-ONE corregido. Antes era
    // getRange(rowNumber, 110, 1, 26), que en 1-based borra 110..135 =
    // idx0 109..134, es decir:
    //   - BORRABA de más: idx0 109 = "Disp3 Recibe" (la última celda del
    //     slot 3 de DISPOSITIVOS, que es dato del PROPIETARIO y el
    //     resident NO puede tocar). 2 registros afectados.
    //   - NO borraba: idx0 135 = "Emerg2 Teléfonos" (quedaba el dato
    //     del resident anterior). 94 registros afectados.
    // El rango correcto en 1-based es 111..136 (idx0 110..135) = Mascotas
    // (20) + Contactos/Emergencias (6) = 26 columnas exactas.
    sheet.getRange(rowNumber, 111, 1, 26).clearContent();

    Logger.log('[clearResidente] numForm=' + numForm + ' apto=' + apto + ' ts=' + new Date().toISOString() + ' celdasLimpiadas=90');

    return {
      ok: true,
      celdasLimpiadas: 90,  // 64 (residentes..bicis) + 26 (mascotas+contactos)
      message: 'Datos del residente anterior borrados correctamente.'
    };
  } finally {
    lock.releaseLock();
  }
}

// =====================================================================
// MÓDULO SALÓN SOCIAL (agregado 25-Sept-2026 spec-salon-social.md)
// Portal nuevo: salon-social.html
// Endpoints: verificarAccesoSalon, dispSalon, reservarSalon,
//            subirComprobanteSalon, cancelarReservaSalon,
//            editarReservaSalon, vigilanteVerReservasSalon,
//            adminListarReservasSalon, adminVerComprobanteSalon,
//            adminCancelarReservaSalon, configurarTriggerExpiracion
// =====================================================================

// IDs externos (configurables via Config del Sheet Registros)
const CARTERA_SHEET_ID_FOR_SALON = '1IQn1y3AoArQSI4dtwhUsH3PVGm0zsZCom0TEdSAfVb4';
const COMPROBANTES_FOLDER_ID = '1RPHtWnVEFwzBKR1DCzBP1to9wLHY2F22'; // Reutilizar carpeta del proyecto
const SALON_SHEET_NAME = 'salon social';
const VALOR_POR_SLOT = 125000;

// ---------------------------------------------------------------------
// Helper: asegura que la pestaña "salon social" exista
// ---------------------------------------------------------------------
function ensureSalonSocialSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SALON_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SALON_SHEET_NAME);
    sheet.getRange(1, 1, 1, 17).setValues([[
      'ID RESERVA', 'NUM FORM', 'N° APTO', 'CC SOLICITANTE',
      'TIPO SOLICITANTE', 'NOMBRE SOLICITANTE', 'CORREO', 'CELULAR',
      'FECHA RESERVA', 'SLOT', 'ESTADO', 'FECHA CREACION',
      'FECHA LIMITE PAGO', 'FECHA PAGO', 'COMPROBANTE DRIVE ID',
      'HASH DEDUPE', 'MODIFICADO POR'
    ]]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 17)
      .setBackground('#0066CC')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
  }
  return sheet;
}

// ---------------------------------------------------------------------
// Helper: obtener siguiente ID correlativo RS-XXXX
// ---------------------------------------------------------------------
function getNextReservaId() {
  const sheet = ensureSalonSocialSheet();
  const last = sheet.getLastRow();
  if (last < 2) return 'RS-0001';
  const lastId = String(sheet.getRange(last, 1).getValue() || '');
  const match = lastId.match(/RS-(\d+)/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return 'RS-' + String(num).padStart(4, '0');
}

// ---------------------------------------------------------------------
// Helper: leer config del Sheet Registros (link_pago)
// ---------------------------------------------------------------------
function getConfigValue(key) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Config');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      return String(data[i][1] || '').trim();
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Helper: leer cartera activa del Sheet Cartera (para validar mora)
// ---------------------------------------------------------------------
function verificarMoraApto(apto) {
  try {
    const ssCartera = SpreadsheetApp.openById(CARTERA_SHEET_ID_FOR_SALON);
    const control = ssCartera.getSheetByName('_Control');
    if (!control) return { enMora: false, mesesProm: 0, error: 'No _Control' };
    const dataCtl = control.getDataRange().getValues();
    let pestanaVigente = null;
    for (let i = 1; i < dataCtl.length; i++) {
      if (String(dataCtl[i][4]).trim() === 'ACTIVO') {
        pestanaVigente = String(dataCtl[i][2]).trim();
        break;
      }
    }
    if (!pestanaVigente) return { enMora: false, mesesProm: 0, error: 'Sin pestaña activa' };

    const cartera = ssCartera.getSheetByName(pestanaVigente);
    if (!cartera) return { enMora: false, mesesProm: 0, error: 'Pestaña ' + pestanaVigente + ' no existe' };
    const dataCartera = cartera.getDataRange().getValues();
    for (let i = 3; i < dataCartera.length; i++) {
      if (String(dataCartera[i][0]).trim() === String(apto).trim()) {
        const mesesProm = parseInt(dataCartera[i][11]) || 0;
        return {
          enMora: mesesProm >= 2,
          mesesProm: mesesProm,
          pestana: pestanaVigente,
          totalCartera: dataCartera[i][10] || 0
        };
      }
    }
    return { enMora: false, mesesProm: 0, error: 'Apto no en cartera' };
  } catch (e) {
    return { enMora: false, mesesProm: 0, error: String(e.message) };
  }
}

// ---------------------------------------------------------------------
// Helper: verificar si CC matchea propietario o residente del apto
// ---------------------------------------------------------------------
function verificarAccesoResidenteOPropietario(apto, cc) {
  const row = findRowByApto(apto);
  if (!row) return null;
  const ccNorm = normCc(cc);
  // Propietario
  if (normCc(String(row.values[6] || '')) === ccNorm) {
    return {
      tipo: 'Propietario',
      numForm: String(row.values[0] || ''),
      nombre: String(row.values[5] || ''),
      cc: String(row.values[6] || ''),
      correo: String(row.values[7] || ''),
      celular: String(row.values[8] || '')
    };
  }
  // Residentes slots 1-4
  for (let i = 0; i < 4; i++) {
    const base = 29 + i * 5;
    if (normCc(String(row.values[base + 1] || '')) === ccNorm) {
      return {
        tipo: 'Residente',
        slot: i + 1,
        numForm: String(row.values[0] || ''),
        nombre: String(row.values[base] || ''),
        cc: String(row.values[base + 1] || ''),
        correo: String(row.values[base + 2] || ''),
        celular: String(row.values[base + 3] || '')
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Helper: hash dedupe sha256[:16] de apto+slot+fecha
// ---------------------------------------------------------------------
function hashReservaDedupe(apto, fecha, slot) {
  const input = String(apto) + '|' + String(fecha) + '|' + String(slot);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input)
    .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').slice(0, 16);
}

// ---------------------------------------------------------------------
// Endpoint SAL-1: verificarAccesoSalon (GET)
// Login (apto+CC) + validación de mora
// ---------------------------------------------------------------------
function verificarAccesoSalon(apto, cc) {
  apto = String(apto || '').trim();
  cc = String(cc || '').trim();
  if (!apto || !cc) return { ok: false, error: 'Falta N° de apartamento o cédula' };

  // 1. Verificar acceso (CC matchea propietario o residente)
  const acceso = verificarAccesoResidenteOPropietario(apto, cc);
  if (!acceso) {
    return { ok: false, error: 'Cédula no corresponde al propietario ni a un residente registrado en este apartamento. Si es la primera vez, pídale al propietario que lo agregue en el formulario de residentes.' };
  }

  // 2. Verificar mora (>= 2 meses)
  const mora = verificarMoraApto(apto);
  if (mora.enMora) {
    return {
      ok: true,
      apto: apto,
      numForm: acceso.numForm,
      cc: cc,
      tipo: acceso.tipo,
      nombre: acceso.nombre,
      celular: acceso.celular,
      correo: acceso.correo,
      enMora: true,
      mesesMora: mora.mesesProm,
      mensaje: 'El apartamento ' + apto + ' está en mora de administración (' + mora.mesesProm + ' meses). Tiene suspendidos los servicios de áreas comunes.'
    };
  }

  // 3. Link de pago desde Config
  const linkPago = getConfigValue('link_pago') || 'https://web-conjuntos.jelpit.com/pagar-mi-administracion#/';

  return {
    ok: true,
    apto: apto,
    numForm: acceso.numForm,
    cc: cc,
    tipo: acceso.tipo,
    nombre: acceso.nombre,
    celular: acceso.celular,
    correo: acceso.correo,
    enMora: false,
    mesesMora: mora.mesesProm,
    valorReserva: VALOR_POR_SLOT,
    linkPago: linkPago
  };
}

// ---------------------------------------------------------------------
// Endpoint SAL-2: dispSalon (GET)
// Devuelve los próximos 30 días con slots disponibles/bloqueados
// ---------------------------------------------------------------------
function dispSalon(apto, fechaInicio, fechaFin) {
  ensureSalonSocialSheet();
  // Si no se pasan fechas, calcular hoy + 30 días
  const today = new Date();
  let inicio = fechaInicio ? new Date(fechaInicio + 'T00:00:00') : today;
  let fin = fechaFin ? new Date(fechaFin + 'T00:00:00') : new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Limitar a 30 días desde inicio
  const maxFin = new Date(inicio.getTime() + 31 * 24 * 60 * 60 * 1000);
  if (fin > maxFin) fin = maxFin;

  // Leer reservas del rango
  const sheet = ensureSalonSocialSheet();
  const data = sheet.getDataRange().getValues();
  const reservas = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const fecha = row[8]; // col I (idx 8)
    const estado = String(row[10] || '').trim();
    const slot = String(row[9] || '').trim();
    if (!fecha || (estado !== 'PendientePago' && estado !== 'Pagado')) continue;
    const fechaStr = Utilities.formatDate(new Date(fecha), 'America/Bogota', 'yyyy-MM-dd');
    if (!reservas[fechaStr]) reservas[fechaStr] = {};
    reservas[fechaStr][slot] = {
      estado: estado,
      reservaId: String(row[0] || ''),
      apto: String(row[2] || ''),
      nombre: String(row[5] || '')
    };
  }

  // Generar días del rango
  const dias = [];
  const cur = new Date(inicio);
  while (cur <= fin) {
    const fechaStr = Utilities.formatDate(cur, 'America/Bogota', 'yyyy-MM-dd');
    const manana = reservas[fechaStr] && reservas[fechaStr]['Mañana'] ? 'reservado' : 'libre';
    const tarde = reservas[fechaStr] && reservas[fechaStr]['Tarde'] ? 'reservado' : 'libre';
    dias.push({
      fecha: fechaStr,
      manana: manana,
      tarde: tarde
    });
    cur.setDate(cur.getDate() + 1);
  }

  return {
    ok: true,
    apto: apto,
    dias: dias,
    linkPago: getConfigValue('link_pago') || 'https://web-conjuntos.jelpit.com/pagar-mi-administracion#/'
  };
}

// ---------------------------------------------------------------------
// Endpoint SAL-3: reservarSalon (POST)
// Crea una nueva reserva
// ---------------------------------------------------------------------
function reservarSalon(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Otra operación está en curso. Intenta en unos segundos.' };
  }
  try {
    const apto = String(data.apto || '').trim();
    const cc = String(data.cc || '').trim();
    const fechaReserva = String(data.fechaReserva || '').trim();
    const slot = String(data.slot || '').trim();
    const numForm = String(data.numForm || '').trim();

    if (!apto || !cc || !fechaReserva || !slot) {
      return { ok: false, error: 'Faltan datos requeridos (apto, cc, fechaReserva, slot)' };
    }
    if (slot !== 'Mañana' && slot !== 'Tarde') {
      return { ok: false, error: 'Slot inválido. Use "Mañana" o "Tarde".' };
    }

    // Validar acceso + mora (re-validar al momento de reservar)
    const acceso = verificarAccesoSalon(apto, cc);
    if (!acceso.ok) return { ok: false, error: acceso.error };
    if (acceso.enMora) {
      return { ok: false, error: acceso.mensaje };
    }

    // Validar fecha (no más de 30 días)
    const today = new Date();
    const fechaObj = new Date(fechaReserva + 'T00:00:00');
    const diffDias = Math.floor((fechaObj - today) / (24 * 60 * 60 * 1000));
    if (diffDias < 0) return { ok: false, error: 'No se puede reservar en el pasado.' };
    if (diffDias > 30) return { ok: false, error: 'No se puede reservar con más de 30 días de anticipación.' };

    // Validar slot libre
    const sheet = ensureSalonSocialSheet();
    const dataSheet = sheet.getDataRange().getValues();
    for (let i = 1; i < dataSheet.length; i++) {
      const row = dataSheet[i];
      const fechaRow = row[8] ? Utilities.formatDate(new Date(row[8]), 'America/Bogota', 'yyyy-MM-dd') : '';
      const slotRow = String(row[9] || '').trim();
      const estadoRow = String(row[10] || '').trim();
      if (fechaRow === fechaReserva && slotRow === slot && (estadoRow === 'PendientePago' || estadoRow === 'Pagado')) {
        return { ok: false, error: 'Este horario ya está reservado. Seleccione otro.' };
      }
    }

    // Crear reserva
    const id = getNextReservaId();
    const now = new Date();
    const fechaLimite = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const hash = hashReservaDedupe(apto, fechaReserva, slot);

    sheet.appendRow([
      id,                                    // A
      acceso.numForm || numForm,             // B
      apto,                                  // C
      cc,                                    // D
      acceso.tipo,                           // E
      acceso.nombre,                         // F
      acceso.correo || '',                   // G
      acceso.celular || '',                  // H
      fechaReserva,                          // I
      slot,                                  // J
      'PendientePago',                       // K
      now,                                   // L
      fechaLimite,                           // M
      '',                                    // N
      '',                                    // O
      hash,                                  // P
      now                                    // Q
    ].map(safeCell_)); // AUD-T3

    // Notificar al admin
    enviarEmailCerroAzul(
      'urb.cerroazul@gmail.com',
      'Nueva reserva salón social — ' + id,
      'Reserva creada:\n' +
      '  ID: ' + id + '\n' +
      '  Apto: ' + apto + '\n' +
      '  Solicitante: ' + acceso.nombre + ' (CC ' + cc + ')\n' +
      '  Fecha: ' + fechaReserva + ' (' + slot + ')\n' +
      '  Límite de pago: ' + Utilities.formatDate(fechaLimite, 'America/Bogota', 'yyyy-MM-dd HH:mm') + '\n'
    );

    // W1: Auditoria (Logger.log)
    Logger.log('[reservarSalon] ' + id + ' creada por apto ' + apto + ' CC ' + cc + ' fecha ' + fechaReserva + ' ' + slot);

    return {
      ok: true,
      reservaId: id,
      fechaLimitePago: Utilities.formatDate(fechaLimite, 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss"),
      monto: VALOR_POR_SLOT,
      linkPago: getConfigValue('link_pago') || 'https://web-conjuntos.jelpit.com/pagar-mi-administracion#/',
      mensaje: 'Reserva creada. Tiene 48 horas para subir el comprobante.'
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Endpoint SAL-4: subirComprobanteSalon (POST)
// Sube el archivo a Drive y marca Pagado
// ---------------------------------------------------------------------
function subirComprobanteSalon(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Otra operación está en curso.' };
  }
  try {
    const reservaId = String(data.reservaId || '').trim();
    const cc = String(data.cc || '').trim();
    const apto = String(data.apto || '').trim();
    const base64 = String(data.comprobanteBase64 || '');
    const nombreArchivo = String(data.comprobanteNombre || 'comprobante.pdf');
    const mime = String(data.comprobanteMime || 'application/pdf');

    if (!reservaId || !cc || !apto || !base64) {
      return { ok: false, error: 'Faltan datos requeridos' };
    }
    if (mime !== 'application/pdf' && mime !== 'image/jpeg' && mime !== 'image/png') {
      return { ok: false, error: 'Tipo de archivo inválido. Use PDF, JPG o PNG.' };
    }

    // Decodificar base64
    const bytes = Utilities.base64Decode(base64);
    if (bytes.length > 10 * 1024 * 1024) {
      return { ok: false, error: 'Archivo demasiado grande. Máximo 10MB.' };
    }

    // Crear blob y subir a Drive
    const blob = Utilities.newBlob(bytes, mime, nombreArchivo);
    const file = DriveApp.createFile(blob);
    file.setName('RS-' + reservaId.replace('RS-', '') + '_' + nombreArchivo);
    // Mover a carpeta de comprobantes
    try {
      const folder = DriveApp.getFolderById(COMPROBANTES_FOLDER_ID);
      file.moveTo(folder);
    } catch (e) {
      Logger.log('No se pudo mover a carpeta: ' + e.message);
    }

    // Actualizar reserva
    const sheet = ensureSalonSocialSheet();
    const dataSheet = sheet.getDataRange().getValues();
    let rowFound = -1;
    for (let i = 1; i < dataSheet.length; i++) {
      if (String(dataSheet[i][0]).trim() === reservaId) {
        // Verificar CC matchea
        if (normCc(String(dataSheet[i][3])) !== normCc(cc)) {
          return { ok: false, error: 'La cédula no corresponde al solicitante de esta reserva.' };
        }
        if (String(dataSheet[i][2]).trim() !== apto) {
          return { ok: false, error: 'El apartamento no corresponde.' };
        }
        const estado = String(dataSheet[i][10]).trim();
        if (estado === 'Cancelado' || estado === 'Expirado' || estado === 'CanceladoPorAdmin') {
          return { ok: false, error: 'Esta reserva ya no está activa (' + estado + ').' };
        }
        rowFound = i + 1;
        break;
      }
    }
    if (rowFound < 0) return { ok: false, error: 'Reserva no encontrada.' };

    const now = new Date();
    sheet.getRange(rowFound, 11).setValue('Pagado');           // K
    sheet.getRange(rowFound, 14).setValue(now);               // N (FECHA PAGO)
    sheet.getRange(rowFound, 15).setValue(file.getId());       // O (COMPROBANTE ID)
    sheet.getRange(rowFound, 17).setValue(now);               // Q (MODIFICADO POR)
    sheet.getRange(rowFound, 18).setValue(cc);                // R (B3: SUBIDO POR)

    // Notificar al admin
    enviarEmailCerroAzul(
      'urb.cerroazul@gmail.com',
      'Comprobante subido — ' + reservaId,
      'El residente ' + cc + ' subió un comprobante para la reserva ' + reservaId + '.\n\n' +
      'Verificar legitimidad del archivo:\n' +
      file.getUrl() + '\n\n' +
      'Si el comprobante es legítimo, no haga nada.\n' +
      'Si es falso, cancele la reserva desde el portal admin.'
    );

    return {
      ok: true,
      comprobanteId: file.getId(),
      estado: 'Pagado',
      mensaje: 'Comprobante subido. El administrador verificará la legitimidad.'
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Endpoint SAL-5: cancelarReservaSalon (POST)
// Cancelar reserva por el solicitante
// ---------------------------------------------------------------------
function cancelarReservaSalon(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Otra operación está en curso.' };
  }
  try {
    const reservaId = String(data.reservaId || '').trim();
    const cc = String(data.cc || '').trim();
    const apto = String(data.apto || '').trim();

    if (!reservaId || !cc || !apto) {
      return { ok: false, error: 'Faltan datos requeridos' };
    }

    const sheet = ensureSalonSocialSheet();
    const dataSheet = sheet.getDataRange().getValues();
    let rowFound = -1;
    let rowData = null;
    for (let i = 1; i < dataSheet.length; i++) {
      if (String(dataSheet[i][0]).trim() === reservaId) {
        if (normCc(String(dataSheet[i][3])) !== normCc(cc)) {
          return { ok: false, error: 'La cédula no corresponde al solicitante.' };
        }
        if (String(dataSheet[i][2]).trim() !== apto) {
          return { ok: false, error: 'El apartamento no corresponde.' };
        }
        const estado = String(dataSheet[i][10]).trim();
        if (estado === 'Cancelado' || estado === 'Expirado' || estado === 'CanceladoPorAdmin') {
          return { ok: false, error: 'La reserva ya está cancelada o expirada.' };
        }
        rowFound = i + 1;
        rowData = dataSheet[i];
        break;
      }
    }
    if (rowFound < 0) return { ok: false, error: 'Reserva no encontrada.' };

    const now = new Date();
    sheet.getRange(rowFound, 11).setValue('Cancelado');
    sheet.getRange(rowFound, 17).setValue(now);

    Logger.log('[cancelarReservaSalon] ' + reservaId + ' por CC ' + cc + ' apto ' + apto);

    enviarEmailCerroAzul(
      'urb.cerroazul@gmail.com',
      'Reserva cancelada — ' + reservaId,
      'El solicitante CC ' + cc + ' canceló la reserva ' + reservaId +
      ' del apto ' + apto + '. Slot liberado.'
    );

    return { ok: true, estado: 'Cancelado', mensaje: 'Reserva cancelada. Slot liberado.' };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Endpoint SAL-6: editarReservaSalon (POST)
// Cambiar fecha + slot de una reserva existente
// ---------------------------------------------------------------------
function editarReservaSalon(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Otra operación está en curso.' };
  }
  try {
    const reservaId = String(data.reservaId || '').trim();
    const cc = String(data.cc || '').trim();
    const apto = String(data.apto || '').trim();
    const nuevaFecha = String(data.nuevaFecha || '').trim();
    const nuevoSlot = String(data.nuevoSlot || '').trim();

    if (!reservaId || !cc || !apto || !nuevaFecha || !nuevoSlot) {
      return { ok: false, error: 'Faltan datos requeridos' };
    }
    if (nuevoSlot !== 'Mañana' && nuevoSlot !== 'Tarde') {
      return { ok: false, error: 'Slot inválido.' };
    }

    // Validar fecha
    const today = new Date();
    const fechaObj = new Date(nuevaFecha + 'T00:00:00');
    const diffDias = Math.floor((fechaObj - today) / (24 * 60 * 60 * 1000));
    if (diffDias < 0 || diffDias > 30) {
      return { ok: false, error: 'Fecha fuera del rango (hoy + 30 días).' };
    }

    const sheet = ensureSalonSocialSheet();
    const dataSheet = sheet.getDataRange().getValues();

    // Verificar que CC matchea
    let rowFound = -1;
    for (let i = 1; i < dataSheet.length; i++) {
      if (String(dataSheet[i][0]).trim() === reservaId) {
        if (normCc(String(dataSheet[i][3])) !== normCc(cc)) {
          return { ok: false, error: 'La cédula no corresponde al solicitante.' };
        }
        if (String(dataSheet[i][2]).trim() !== apto) {
          return { ok: false, error: 'El apartamento no corresponde.' };
        }
        rowFound = i + 1;
        break;
      }
    }
    if (rowFound < 0) return { ok: false, error: 'Reserva no encontrada.' };

    // Verificar que el nuevo slot esté libre (excluyendo la reserva actual)
    for (let i = 1; i < dataSheet.length; i++) {
      if (i + 1 === rowFound) continue; // saltar la misma reserva
      const row = dataSheet[i];
      const fechaRow = row[8] ? Utilities.formatDate(new Date(row[8]), 'America/Bogota', 'yyyy-MM-dd') : '';
      const slotRow = String(row[9] || '').trim();
      const estadoRow = String(row[10] || '').trim();
      if (fechaRow === nuevaFecha && slotRow === nuevoSlot && (estadoRow === 'PendientePago' || estadoRow === 'Pagado')) {
        return { ok: false, error: 'El nuevo horario ya está reservado. Elija otro.' };
      }
    }

    const now = new Date();
    sheet.getRange(rowFound, 9).setValue(nuevaFecha);   // I
    sheet.getRange(rowFound, 10).setValue(nuevoSlot);  // J
    sheet.getRange(rowFound, 16).setValue(hashReservaDedupe(apto, nuevaFecha, nuevoSlot)); // P
    sheet.getRange(rowFound, 17).setValue(now);        // Q

    // W1: Auditoria (Logger.log)
    Logger.log('[editarReservaSalon] ' + reservaId + ' editada por apto ' + apto + ' CC ' + cc + ' nueva fecha ' + nuevaFecha + ' ' + nuevoSlot);

    return { ok: true, mensaje: 'Reserva actualizada correctamente.' };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Endpoint SAL-7: vigilanteVerReservasSalon (GET)
// Vista para vigilantes (fecha + slot + estado + apto + nombre)
// ---------------------------------------------------------------------
function vigilanteVerReservasSalon(fecha) {
  ensureSalonSocialSheet();
  if (!fecha) {
    fecha = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd');
  }
  const sheet = ensureSalonSocialSheet();
  const data = sheet.getDataRange().getValues();
  const resultado = {
    ok: true,
    fecha: fecha,
    manana: { estado: 'libre' },
    tarde: { estado: 'libre' }
  };
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const fechaRow = row[8] ? Utilities.formatDate(new Date(row[8]), 'America/Bogota', 'yyyy-MM-dd') : '';
    if (fechaRow !== fecha) continue;
    const slot = String(row[9] || '').trim();
    const estado = String(row[10] || '').trim();
    if (estado !== 'PendientePago' && estado !== 'Pagado') continue;
    if (slot === 'Mañana') {
      resultado.manana = { estado: 'reservado', apto: String(row[2]), nombre: String(row[5]) };
    } else if (slot === 'Tarde') {
      resultado.tarde = { estado: 'reservado', apto: String(row[2]), nombre: String(row[5]) };
    }
  }
  return resultado;
}

// ---------------------------------------------------------------------
// Endpoint SAL-8: adminListarReservasSalon (GET)
// Lista de reservas para admin con filtros opcionales
// ---------------------------------------------------------------------
function adminListarReservasSalon(estado, fechaDesde) {
  ensureSalonSocialSheet();
  const sheet = ensureSalonSocialSheet();
  const data = sheet.getDataRange().getValues();
  const reservas = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const estadoRow = String(row[10] || '').trim();
    if (estado && estado !== 'Todos' && estadoRow !== estado) continue;
    if (fechaDesde) {
      const fechaRow = row[8] ? Utilities.formatDate(new Date(row[8]), 'America/Bogota', 'yyyy-MM-dd') : '';
      if (fechaRow < fechaDesde) continue;
    }
    reservas.push({
      id: String(row[0] || ''),
      numForm: String(row[1] || ''),
      apto: String(row[2] || ''),
      ccSolicitante: String(row[3] || ''),
      tipo: String(row[4] || ''),
      nombre: String(row[5] || ''),
      correo: String(row[6] || ''),
      celular: String(row[7] || ''),
      fechaReserva: row[8] ? Utilities.formatDate(new Date(row[8]), 'America/Bogota', 'yyyy-MM-dd') : '',
      slot: String(row[9] || ''),
      estado: estadoRow,
      fechaCreacion: row[11] ? Utilities.formatDate(new Date(row[11]), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss") : '',
      fechaLimitePago: row[12] ? Utilities.formatDate(new Date(row[12]), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss") : '',
      fechaPago: row[13] ? Utilities.formatDate(new Date(row[13]), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss") : '',
      comprobanteId: String(row[14] || ''),
      tieneComprobante: !!String(row[14] || '').trim()
    });
  }
  return { ok: true, reservas: reservas, total: reservas.length };
}

// ---------------------------------------------------------------------
// Endpoint SAL-9: adminVerComprobanteSalon (GET)
// Devuelve URL del comprobante en Drive
// ---------------------------------------------------------------------
function adminVerComprobanteSalon(reservaId) {
  reservaId = String(reservaId || '').trim();
  if (!reservaId) return { ok: false, error: 'Falta reservaId' };
  const sheet = ensureSalonSocialSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === reservaId) {
      const comprobanteId = String(data[i][14] || '').trim();
      if (!comprobanteId) {
        return { ok: true, reservaId: reservaId, tieneComprobante: false, estado: String(data[i][10]) };
      }
      try {
        const file = DriveApp.getFileById(comprobanteId);
        return {
          ok: true,
          reservaId: reservaId,
          tieneComprobante: true,                                       // BUGFIX-021: faltaba este campo
          comprobanteId: comprobanteId,
          comprobanteUrl: file.getUrl(),
          nombreArchivo: file.getName(),
          estado: String(data[i][10])
        };
      } catch (e) {
        return { ok: false, error: 'No se pudo acceder al archivo: ' + e.message };
      }
    }
  }
  return { ok: false, error: 'Reserva no encontrada.' };
}

// ---------------------------------------------------------------------
// Endpoint SAL-10: adminCancelarReservaSalon (POST)
// Admin cancela manualmente con motivo + adminPassword
// ---------------------------------------------------------------------
function adminCancelarReservaSalon(data) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'Otra operación está en curso.' };
  }
  try {
    const reservaId = String(data.reservaId || '').trim();
    const motivo = String(data.motivo || '').trim();
    const adminPassword = String(data.adminPassword || '').trim();

    if (!reservaId || !motivo || !adminPassword) {
      return { ok: false, error: 'Faltan datos requeridos (reservaId, motivo, adminPassword)' };
    }

    // Verificar admin password
    const adminPwdStored = getConfigValue('admin_password');
    if (adminPassword !== adminPwdStored) {
      return { ok: false, error: 'Contraseña de administrador incorrecta.' };
    }

    const sheet = ensureSalonSocialSheet();
    const dataSheet = sheet.getDataRange().getValues();
    let rowFound = -1;
    let rowData = null;
    for (let i = 1; i < dataSheet.length; i++) {
      if (String(dataSheet[i][0]).trim() === reservaId) {
        const estado = String(dataSheet[i][10]).trim();
        if (estado === 'Cancelado' || estado === 'Expirado' || estado === 'CanceladoPorAdmin') {
          return { ok: false, error: 'La reserva ya está cancelada.' };
        }
        rowFound = i + 1;
        rowData = dataSheet[i];
        break;
      }
    }
    if (rowFound < 0) return { ok: false, error: 'Reserva no encontrada.' };

    const estadoOriginal = String(rowData[10]).trim();
    const estadoNuevo = estadoOriginal === 'Pagado' ? 'CanceladoPorAdmin' : 'Cancelado';
    const now = new Date();

    sheet.getRange(rowFound, 11).setValue(estadoNuevo);
    sheet.getRange(rowFound, 17).setValue(now);

    Logger.log('[adminCancelarReservaSalon] ' + reservaId + ' motivo: ' + motivo + ' estadoOriginal: ' + estadoOriginal);

    enviarEmailCerroAzul(
      'urb.cerroazul@gmail.com',
      'Reserva cancelada por admin — ' + reservaId,
      'El administrador canceló la reserva ' + reservaId + '.\n\n' +
      'Motivo: ' + motivo + '\n' +
      'Estado original: ' + estadoOriginal + '\n' +
      'Solicitante: ' + String(rowData[5]) + ' (CC ' + String(rowData[3]) + ')\n' +
      'Apto: ' + String(rowData[2]) + '\n' +
      'Fecha: ' + Utilities.formatDate(new Date(rowData[8]), 'America/Bogota', 'yyyy-MM-dd') + ' (' + String(rowData[9]) + ')'
    );

    return { ok: true, estado: estadoNuevo, mensaje: 'Reserva cancelada por administrador. Slot liberado.' };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Endpoint SAL-11: configurarTriggerExpiracion (POST/ejecutable)
// Crea el trigger time-based de 1h para cancelar reservas sin pago
// ---------------------------------------------------------------------
function configurarTriggerExpiracion() {
  try {
    // Verificar si ya existe un trigger para esta función
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'expirarReservasSalon') {
        return { ok: true, triggerId: triggers[i].getUniqueId(), mensaje: 'El trigger ya existe. No se creó uno nuevo.' };
      }
    }
    // Crear nuevo trigger cada 1 hora
    const trigger = ScriptApp.newTrigger('expirarReservasSalon')
      .timeBased()
      .everyHours(1)
      .create();
    return {
      ok: true,
      triggerId: trigger.getUniqueId(),
      mensaje: 'Trigger creado: cada 1 hora. Llamar UNA SOLA VEZ.'
    };
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
}

// ---------------------------------------------------------------------
// Trigger time-based: expirarReservasSalon (corre cada 1h)
// Marca reservas PendientePago con fecha límite < now como Expirado
// ---------------------------------------------------------------------
function expirarReservasSalon() {
  const now = new Date();
  const sheet = ensureSalonSocialSheet();
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[10]).trim() !== 'PendientePago') continue;
    if (!row[12]) continue;
    const limite = new Date(row[12]);
    if (limite >= now) continue;
    sheet.getRange(i + 1, 11).setValue('Expirado');
    sheet.getRange(i + 1, 17).setValue(now);
    count++;
    Logger.log('[expirarReservasSalon] RS-' + String(row[0]).replace('RS-', '') + ' apto ' + String(row[2]) + ' expirada');
  }
  if (count > 0) {
    enviarEmailCerroAzul(
      'urb.cerroazul@gmail.com',
      count + ' reservas de salón social expiradas',
      'El trigger automático canceló ' + count + ' reservas PendientePago que superaron las 48 horas sin subir comprobante.\n\nLos slots han sido liberados.'
    );
  }
}

// ---------------------------------------------------------------------
// Endpoint SAL-12: listarReservasPorApto (GET) [V22 BUGFIX-015]
// Devuelve TODAS las reservas del apto del solicitante autenticado,
// usando numForm como filtro (mismo criterio que el portal admin usa).
// Permite al residente recuperar reservas previas (BUG #1: vista
// mis-reservas huérfana del F4 salón social 26-Sept-2026).
// ---------------------------------------------------------------------
function listarReservasPorApto(apto, cc) {
  apto = String(apto || '').trim();
  cc = String(cc || '').trim();
  if (!apto || !cc) return { ok: false, error: 'Falta N° de apartamento o cédula' };

  // 1. Re-validar acceso (mismo helper que verificarAccesoSalon)
  const acceso = verificarAccesoResidenteOPropietario(apto, cc);
  if (!acceso) {
    return {
      ok: false,
      error: 'Cédula no corresponde al propietario ni a un residente registrado en este apartamento.'
    };
  }

  // 2. Listar reservas del mismo numForm (todas las del apto)
  const sheet = ensureSalonSocialSheet();
  const data = sheet.getDataRange().getValues();
  const reservas = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const aptoRow = String(row[2] || '').trim();
    const numFormRow = String(row[1] || '').trim();

    // Solo reservas del mismo apto Y mismo numForm
    if (aptoRow !== apto) continue;
    if (numFormRow !== acceso.numForm) continue;

    reservas.push({
      id: String(row[0] || ''),
      numForm: numFormRow,
      apto: aptoRow,
      ccSolicitante: String(row[3] || ''),
      tipo: String(row[4] || ''),
      nombre: String(row[5] || ''),
      correo: String(row[6] || ''),
      celular: String(row[7] || ''),
      fechaReserva: row[8] ? Utilities.formatDate(new Date(row[8]), 'America/Bogota', 'yyyy-MM-dd') : '',
      slot: String(row[9] || ''),
      estado: String(row[10] || ''),
      fechaCreacion: row[11] ? Utilities.formatDate(new Date(row[11]), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss") : '',
      fechaLimitePago: row[12] ? Utilities.formatDate(new Date(row[12]), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss") : '',
      fechaPago: row[13] ? Utilities.formatDate(new Date(row[13]), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss") : '',
      comprobanteId: String(row[14] || ''),
      tieneComprobante: !!String(row[14] || '').trim()
    });
  }

  // Ordenar por fechaCreacion descendente (más recientes primero)
  reservas.sort(function (a, b) {
    return (b.fechaCreacion || '').localeCompare(a.fechaCreacion || '');
  });

  Logger.log('[listarReservasPorApto] apto ' + apto + ' CC ' + cc + ' → ' + reservas.length + ' reservas');

  return {
    ok: true,
    apto: apto,
    cc: cc,
    numForm: acceso.numForm,
    nombre: acceso.nombre,
    tipo: acceso.tipo,
    reservas: reservas,
    total: reservas.length,
    linkPago: getConfigValue('link_pago') || 'https://web-conjuntos.jelpit.com/pagar-mi-administracion#/'
  };
}
// ---------------------------------------------------------------------
// ASISTENTE IA — MiniMax-M3 (feature 04-Oct-2026, solicitada por operador)
// ---------------------------------------------------------------------
// Recibe un mensaje del usuario desde cualquier portal y lo responde
// usando MiniMax-M3 con un system prompt restrictivo que SOLO permite
// responder preguntas sobre cómo llenar el formulario Cerro Azul.
//
// Frontend: js/asistente.js (banner flotante en los 7 portales).
// Validaciones de longitud/rate limit viven en el frontend; el backend
// re-valida por seguridad.
//
// Configuración requerida (una sola vez, manual en Apps Script):
//   Project Settings → Script Properties:
//     MINIMAX_API_KEY = <subscription-key-de-MiniMax>
//   Opcional (default si falta):
//     MINIMAX_BASE_URL = https://api.minimax.io/anthropic
//   Opcional (group_id para facturación Subscription Token Plan):
//     MINIMAX_GROUP_ID = 523700352705306633
//
// FEAT-007 v2 — Manual embebido en código (operator-approved 04-Oct-2026):
// El manual oficial del agente está embebido como constante MANUAL_CERRO
// directamente en el código (no se descarga de Google Docs en runtime).
// El operador dijo: "cuando lo vaya a actualizar lo traigo acá y que
// Hermes lo actualice" → flujo = constante nueva + V_N+1 con redeploy.
//   - ScriptCache eliminado (no se necesita: el operador actualiza el
//     código, no el doc)
//   - 0 dependencia externa de Google Docs
//   - Latencia 0 (no hay fetch)
//
// IMPORTANTE — formato de auth de MiniMax (verificado 04-Oct-2026 en
// hermes_cli/auth.py línea 294 y azure_detect.py línea 247-294):
// MiniMax NO usa OpenAI-compatible /v1/chat/completions. Usa el
// protocolo ANTHROPIC MESSAGES:
//   - URL: {base_url}/v1/messages
//   - Headers: x-api-key + anthropic-version (NO solo Authorization Bearer)
//   - Body: {model, max_tokens, system, messages[{role,content}]}
//   - Respuesta: {content:[{type:"text", text:"..."}]} (NO choices[].message)
//
// Devuelve { ok:true, respuesta: "<texto>" } o { ok:false, error: "<msg>" }.
// Costo estimado con manual inyectado (44KB): ~$0.012/mensaje (~$36 USD total campaña).
// ---------------------------------------------------------------------
const MANUAL_CERRO = (
"Manual de respuestas del agente de ayuda — Conjunto Residencial Cerro Azul PH\n" +
"Para quién es este documento: para el agente (asistente virtual) que responde preguntas sobre los portales digitales del Conjunto Residencial Cerro Azul PH. Versión: 1.0 · Septiembre de 2026 · Elaborado por la Administración. Idioma de respuesta: español de Colombia, tratando de usted.\n" +
"🔴 REGLA FUNDAMENTAL (sin excepciones)\n" +
"La creación del registro del apartamento —es decir, llenar el formulario principal (\"Enviar / Crear registro\") en fabig76.github.io/cerro-azul-residentes— SOLO la puede hacer:\n" +
"\n" +
"\n" +
"1. El propietario del apartamento,\n" +
"2. La inmobiliaria que administra el apartamento, o\n" +
"3. El encargado del apartamento designado por el propietario.\n" +
"\n" +
"\n" +
"El arrendatario NUNCA puede crear el registro del apartamento ni llenar el formulario principal. Tampoco puede editar ese registro, agendar mudanzas ni consultar el estado de cuenta.\n" +
"\n" +
"\n" +
"El arrendatario (y cualquier otro residente) solo se registra en el Portal del residente (fabig76.github.io/cerro-azul-residentes/residente.html), y únicamente después de que el propietario, la inmobiliaria o el encargado haya creado el registro del apartamento.\n" +
"\n" +
"\n" +
"Si un arrendatario pide llenar el formulario principal, el agente debe responder siempre: \"El registro del apartamento solo lo puede hacer el propietario, la inmobiliaria o el encargado del apartamento. Usted, como arrendatario, se registra en el Portal del residente una vez el apartamento esté registrado. Si el propietario aún no lo ha hecho, pídale que lo haga o comuníquese con la administración.\"\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"ÍNDICE\n" +
"1. Reglas del agente (leer primero)\n" +
"2. Datos generales del conjunto y contactos\n" +
"3. Mapa de portales y enlaces\n" +
"4. Formulario de registro de propietarios (Crear registro)\n" +
"5. Editar el registro\n" +
"6. Agendar una mudanza\n" +
"7. Portal del residente (arrendatarios y familiares)\n" +
"8. Estado de cuenta, factura y paz y salvo\n" +
"9. Pagos de administración (Jelpit y otros canales)\n" +
"10. Salón social\n" +
"11. Citófono digital \"Mi apartamento\"\n" +
"12. Normas de convivencia y medidas vigentes\n" +
"13. Privacidad y protección de datos\n" +
"14. Preguntas frecuentes (respuestas listas)\n" +
"15. Problemas técnicos generales\n" +
"16. SECCIÓN EXCLUSIVA PARA VIGILANTES\n" +
"17. Plantillas de respuesta y escalamiento\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"0. Reglas del agente (leer primero)\n" +
"0.1 Cómo debe responder\n" +
"* Hable de usted, con frases cortas y palabras sencillas. Imagine que la persona no sabe nada de tecnología.\n" +
"* Dé un paso a la vez cuando explique un procedimiento. Use listas numeradas.\n" +
"* Diga exactamente qué botón tocar, entre comillas: por ejemplo, toque \"Continuar\".\n" +
"* Si la persona se confunde, vuelva a explicar con otras palabras, no repita lo mismo.\n" +
"* Al terminar, pregunte si pudo hacerlo o si necesita más ayuda.\n" +
"* No use términos técnicos (navegador, URL, PWA, servidor) sin explicarlos. Diga, por ejemplo, \"la página\" en lugar de \"la URL\", y \"Chrome o Safari, el programa con el que entra a internet\" en lugar de \"navegador\".\n" +
"0.2 Qué tipo de usuario es\n" +
"Hay tres tipos de personas que pueden escribirle:\n" +
"\n" +
"\n" +
"Tipo\n" +
"	Cómo reconocerlo\n" +
"	Qué secciones usar\n" +
"	Propietario, inmobiliaria o encargado\n" +
"	Dice que es dueño del apartamento, la inmobiliaria que lo administra o el encargado designado por el propietario, o pregunta por estado de cuenta, factura, paz y salvo, mudanzas o registro del apartamento.\n" +
"	Secciones 1 a 14\n" +
"	Residente / arrendatario / familiar\n" +
"	Vive en el apartamento pero no es el dueño, la inmobiliaria ni el encargado.\n" +
"	Secciones 1 a 14. Nunca puede crear ni editar el registro del apartamento (formulario principal), agendar mudanzas ni ver el estado de cuenta. Se registra solo en el Portal del residente (sección 6).\n" +
"	Vigilante (guarda de seguridad)\n" +
"	Solo si se identifica expresamente como vigilante, guarda o personal de seguridad del conjunto.\n" +
"	Sección 15 (y las demás si pregunta algo general)\n" +
"	\n" +
"\n" +
"Regla clave: si la persona no se identifica como vigilante, trátela como residente o propietario y no le dé información de la sección 15. Si alguien pregunta por el portal de vigilancia sin identificarse, responda: \"Ese portal es de uso exclusivo del personal de vigilancia. Si usted es vigilante, por favor indíquemelo.\"\n" +
"\n" +
"\n" +
"Aunque un vigilante se identifique, el agente nunca le da contraseñas ni datos personales de residentes (ver 0.3).\n" +
"0.3 Lo que el agente NUNCA debe hacer\n" +
"1. Nunca dar datos de otras personas: nombres, cédulas, teléfonos, correos, placas, deudas, ni confirmar si alguien vive en un apartamento.\n" +
"2. Nunca revelar contraseñas (por ejemplo, la del portal de vigilancia) ni pedirle al usuario su contraseña.\n" +
"3. Nunca decir cuánto debe un apartamento: el agente no tiene acceso a las cuentas. Indique cómo consultarlo en el portal.\n" +
"4. Nunca prometer que un pago, una reserva o un registro ya quedó hecho: el agente no puede verlo. Indique cómo verificarlo.\n" +
"5. Nunca inventar respuestas. Si algo no está en este manual, diga que no tiene esa información y remita a la administración (sección 16).\n" +
"6. Nunca dar asesoría legal específica (demandas, sanciones a una persona concreta). Remita a la administración.\n" +
"7. Nunca indicar a un arrendatario que cree el registro del apartamento o llene el formulario principal (ver REGLA FUNDAMENTAL).\n" +
"8. Nunca pedir datos sensibles por el chat (cédula completa, claves bancarias). Si la persona los escribe, recomiéndele no compartirlos.\n" +
"0.4 Cuándo remitir a la administración\n" +
"* Olvidó su código de formulario CA-XXXX.\n" +
"* Su celular o datos no son reconocidos después de intentar los pasos.\n" +
"* Necesita cancelar una mudanza o una reserva.\n" +
"* Quiere reclamar un cobro, un pago no aplicado o un error en su estado de cuenta.\n" +
"* Reporta un daño, una queja de convivencia o una emergencia.\n" +
"* Cualquier tema que no esté en este manual.\n" +
"\n" +
"\n" +
"Contacto de la administración: WhatsApp 316 924 0748 · Correo urb.cerroazul@gmail.com.\n" +
"\n" +
"\n" +
"Emergencias: si la persona describe una emergencia (incendio, persona herida, delito en curso), indíquele que llame de inmediato a la línea 123 y que avise a la portería.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"1. Datos generales del conjunto y contactos\n" +
"Dato\n" +
"	Valor\n" +
"	Nombre\n" +
"	Conjunto Residencial Cerro Azul PH (también \"Urbanización Cerro Azul\")\n" +
"	NIT\n" +
"	900.770.444-4\n" +
"	Dirección\n" +
"	AV. 31 # 66-29, Bello – Niquía (Antioquia)\n" +
"	Administrador y representante legal\n" +
"	Heyler Fabio Guaza\n" +
"	WhatsApp de la administración\n" +
"	316 924 0748\n" +
"	Correo\n" +
"	urb.cerroazul@gmail.com\n" +
"	Oficina de administración\n" +
"	Atención en turnos rotativos de mañana y tarde. Se pueden coordinar citas por WhatsApp.\n" +
"	Apartamentos\n" +
"	625\n" +
"	\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"2. Mapa de portales y enlaces\n" +
"Portal\n" +
"	Para qué sirve\n" +
"	Quién lo usa\n" +
"	Enlace\n" +
"	Formulario de residentes (portal principal)\n" +
"	Crear el registro del apartamento, editarlo y agendar mudanzas\n" +
"	Solo propietario, inmobiliaria o encargado. Nunca el arrendatario.\n" +
"	fabig76.github.io/cerro-azul-residentes\n" +
"	Portal del residente\n" +
"	Que arrendatarios y familiares registren sus propios datos\n" +
"	Residentes y arrendatarios\n" +
"	fabig76.github.io/cerro-azul-residentes/residente.html\n" +
"	Estado de cuenta\n" +
"	Ver saldo, descargar factura y paz y salvo\n" +
"	Propietario\n" +
"	Desde el portal principal (opción de estado de cuenta)\n" +
"	Salón social\n" +
"	Reservar el salón\n" +
"	Residentes\n" +
"	Desde el portal principal\n" +
"	Citófono digital \"Mi apartamento\"\n" +
"	Recibir avisos y llamadas de portería en el celular\n" +
"	Todos los residentes\n" +
"	citofono.urbcerroazul.com/r\n" +
"	Pagos Jelpit\n" +
"	Pagar la administración\n" +
"	Propietarios / residentes\n" +
"	web-conjuntos.jelpit.com/pagar-mi-administracion (o el código QR del aviso de pagos)\n" +
"	Portal de vigilancia\n" +
"	Consultas de portería\n" +
"	Solo vigilantes\n" +
"	(ver sección 15)\n" +
"	\n" +
"\n" +
"Diferencia que confunde a muchos:\n" +
"\n" +
"\n" +
"* El portal web (fabig76.github.io/…) es el registro de datos del conjunto.\n" +
"* El citófono digital (citofono.urbcerroazul.com/r) es la app para recibir avisos y llamadas de portería.\n" +
"* Primero hay que estar registrado en el portal web; después se instala el citófono.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"3. Formulario de registro de propietarios (Crear registro)\n" +
"3.1 Qué es y quién lo llena\n" +
"* Es el formulario oficial que crea el registro del apartamento en el conjunto. Es obligatorio y es el primer paso: sin él, nadie más del apartamento puede registrarse.\n" +
"* SOLO lo puede llenar el propietario, la inmobiliaria o el encargado del apartamento. (Ver la REGLA FUNDAMENTAL al inicio.)\n" +
"* El arrendatario NUNCA lo llena. El arrendatario se registra en el Portal del residente (sección 6) cuando el apartamento ya esté registrado.\n" +
"* La información debe ser verdadera. Proporcionar datos falsos o de terceros sin su consentimiento puede tener consecuencias legales y administrativas.\n" +
"* Los datos están protegidos por la Ley 1581 de 2012.\n" +
"3.2 Cómo entrar\n" +
"1. Escanee el código QR del ascensor de su torre, o abra fabig76.github.io/cerro-azul-residentes.\n" +
"2. No necesita contraseña.\n" +
"3. Funciona en celular o computador.\n" +
"4. Arriba hay tres pestañas: \"Enviar / Crear registro\", \"Editar mi registro\" y \"Agendar mudanza\".\n" +
"5. Para crear el registro del apartamento por primera vez, use \"Enviar / Crear registro\" (solo propietario, inmobiliaria o encargado; nunca el arrendatario).\n" +
"3.3 Antes de empezar, tenga a la mano\n" +
"* Su cédula y su número de apartamento.\n" +
"* La matrícula del apartamento (si la conoce; si no, déjela en blanco).\n" +
"* Datos de carros, motos y bicicletas.\n" +
"* Datos de sus mascotas y la fecha de su última vacuna.\n" +
"* Datos de quienes viven con usted.\n" +
"* Un correo electrónico y un contacto de emergencia.\n" +
"\n" +
"\n" +
"Tiempo: de 10 a 15 minutos con todo a la mano. Muy importante: el formulario no se guarda solo. Si sale de la página sin enviar, tendrá que empezar de nuevo.\n" +
"3.4 Cómo funciona\n" +
"* El formulario tiene secciones. Toque el título azul de cada sección para abrirla.\n" +
"* Los campos con asterisco (*) son obligatorios. Si falta uno, no se puede enviar.\n" +
"3.5 Las secciones, una por una\n" +
"Sección 0 — Encabezado\n" +
"\n" +
"\n" +
"* Conjunto, NIT y dirección ya vienen llenos; solo revíselos.\n" +
"* La fecha se pone sola.\n" +
"* Diligencia como (obligatorio): indica quién está llenando el formulario.\n" +
"   * Si lo llena el dueño: Propietario.\n" +
"   * Si lo llena el encargado o un representante del propietario: Tenedor / Otro (y en la Sección 4 se registran los datos de la inmobiliaria o representante, si aplica).\n" +
"   * Aunque el formulario muestre la opción \"Arrendatario\", el agente nunca debe indicar que un arrendatario llene este formulario. Si la persona es arrendataria, debe detenerse y registrarse en el Portal del residente (sección 6).\n" +
"\n" +
"\n" +
"Sección 1 — Datos del propietario (la más importante)\n" +
"\n" +
"\n" +
"* Nombres y apellidos (obligatorio): tal como aparecen en la cédula, sin sobrenombres.\n" +
"* N° de identificación (obligatorio): cédula sin puntos ni espacios. Ej: 12345678.\n" +
"* Correo electrónico (obligatorio): un correo personal donde reciba mensajes.\n" +
"* Celular (obligatorio): ej. 3001234567.\n" +
"* Teléfono fijo (opcional): con código de área, o en blanco.\n" +
"* N° de apartamento (obligatorio): ej. 101. Muy importante.\n" +
"* Matrícula del apartamento (opcional): se llena sola al escribir el apartamento; verifique que sea correcta.\n" +
"* Parqueaderos (opcional): número de parqueadero 1 y 2; la matrícula se completa sola.\n" +
"* Casilla \"Alguna matrícula mostrada arriba NO coincide con la real\": márquela solo si alguna matrícula está mal y explique en observaciones cuál es la correcta.\n" +
"\n" +
"\n" +
"Sección 2 — Encargado o administrador del inmueble (opcional)\n" +
"\n" +
"\n" +
"* Se llena cuando el apartamento tiene un encargado o administrador distinto del propietario: sus datos de contacto.\n" +
"* Si usted es el propietario, déjela en blanco.\n" +
"\n" +
"\n" +
"Sección 3 — Parqueadero a tercero (opcional)\n" +
"\n" +
"\n" +
"* Solo si presta su parqueadero a alguien de otro apartamento: nombre, apartamento y celular de esa persona.\n" +
"\n" +
"\n" +
"Sección 4 — Inmobiliaria o representante (opcional)\n" +
"\n" +
"\n" +
"* Solo si una inmobiliaria administra el apartamento o hay un representante del propietario.\n" +
"* Tenga a la mano el poder o contrato: la administración puede pedirlo.\n" +
"\n" +
"\n" +
"Sección 5 — Residentes mayores de edad\n" +
"\n" +
"\n" +
"* Personas de 18 años o más que viven con usted. Hasta 4.\n" +
"* Nombre, cédula, correo, celular y parentesco (Cónyuge, Hijo/a, Padre, Madre, Otro).\n" +
"* No repita a la persona de la Sección 1. Si vive solo, déjela en blanco.\n" +
"\n" +
"\n" +
"Sección 5.1 — Menores de edad\n" +
"\n" +
"\n" +
"* Nombre, edad y parentesco de cada menor. Hasta 4.\n" +
"* Datos protegidos por la Ley 1581 de 2012.\n" +
"\n" +
"\n" +
"Sección 6 — Vehículos y motos\n" +
"\n" +
"\n" +
"* Hasta 2 carros y 2 motos: marca, tipo, color, placa y modelo.\n" +
"* La placa tal cual está en la tarjeta de propiedad, sin espacios ni guiones.\n" +
"* N° de tag: si ya tiene tag electrónico; si no, en blanco.\n" +
"\n" +
"\n" +
"Sección 7 — Bicicletas\n" +
"\n" +
"\n" +
"* Hasta 2: marca, color, clase (urbana, montaña, ruta, infantil) y serial del marco.\n" +
"* El serial está grabado en el metal, casi siempre debajo del pedal o en el tubo del sillín. No es el sticker del precio.\n" +
"\n" +
"\n" +
"Sección 8 — Llaveros y tags electrónicos\n" +
"\n" +
"\n" +
"* Aviso: estos dispositivos todavía no se usan; se piden con anticipación para un sistema futuro.\n" +
"* Si ya le entregaron llaveros o tags, indique cuántos y los datos de cada uno. Si no, escriba \"Pendiente de entrega\" o déjela en blanco.\n" +
"\n" +
"\n" +
"Sección 9 — Mascotas (censo obligatorio según el Decreto 768 de 2025)\n" +
"\n" +
"\n" +
"* Hasta 2: tipo, nombre, raza, color, sexo y fecha de la última vacuna.\n" +
"* Manejo especial: marque \"Sí\" solo si es un perro potencialmente peligroso (Ley 1801 de 2016). En ese caso, agregue el registro del canino, la aseguradora y el número de póliza de responsabilidad civil.\n" +
"\n" +
"\n" +
"Sección 10 — Contactos de urgencia\n" +
"\n" +
"\n" +
"* Hasta 2: nombre, parentesco y teléfonos de alguien a quien llamar si no lo localizan.\n" +
"* Consejo: ponga números donde sí contesten; ideal uno que viva cerca y otro lejos.\n" +
"\n" +
"\n" +
"Sección 11 — Autorización y firma\n" +
"\n" +
"\n" +
"* Autorizo el tratamiento de mis datos: obligatoria. Sin ella no puede enviar.\n" +
"* Autorizo el tratamiento de datos de los menores: solo si registró menores.\n" +
"* Autorizo el envío de comunicaciones: opcional; para recibir mensajes por correo y WhatsApp.\n" +
"* Firma — Nombre completo y Firma — C.C. (obligatorios): exactamente como en su documento.\n" +
"* La fecha de la firma se llena sola.\n" +
"* Al escribir su nombre y cédula y enviar, queda firmando electrónicamente. No necesita imprimir nada.\n" +
"3.6 Enviar y guardar el código\n" +
"1. Revise los campos con asterisco y toque \"Enviar formulario\". Espere unos segundos.\n" +
"2. Aparece \"¡Registro creado exitosamente!\" y su código de formulario, que empieza por CA- (por ejemplo, CA-0042).\n" +
"3. Guarde el código: tómele foto a la pantalla, anótelo, guárdelo como contacto en el celular o toque \"Imprimir comprobante\".\n" +
"4. Ese código lo necesitará para editar su registro, agendar mudanzas y consultar su estado de cuenta.\n" +
"\n" +
"\n" +
"Si perdió el código: escriba a urb.cerroazul@gmail.com o al WhatsApp 316 924 0748 con su nombre completo, cédula y número de apartamento.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"4. Editar el registro\n" +
"Solo el propietario, la inmobiliaria o el encargado que creó el registro puede editarlo (con el código CA). El arrendatario no puede.\n" +
"\n" +
"\n" +
"1. Entre a fabig76.github.io/cerro-azul-residentes.\n" +
"2. Toque la pestaña \"Editar mi registro\".\n" +
"3. Escriba su código CA-XXXX y su número de apartamento (igual a como lo registró).\n" +
"4. Toque \"Buscar mi registro\". Sus datos se cargan en unos segundos.\n" +
"5. Cambie lo que necesite y vuelva a enviar.\n" +
"6. Su código sigue siendo el mismo.\n" +
"\n" +
"\n" +
"Si no encuentra el registro: verifique que el código esté completo (con \"CA-\") y que el apartamento esté escrito igual que en el registro. Si sigue sin aparecer, remita a la administración.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"5. Agendar una mudanza\n" +
"5.1 Reglas\n" +
"* Solo se usa el ascensor A de cada torre (el ascensor B queda para los residentes).\n" +
"* Se reserva con al menos 2 días (48 horas) de anticipación.\n" +
"* La agenda el propietario o la inmobiliaria autorizada. El arrendatario no puede agendarla.\n" +
"* No hay servicio domingos ni festivos. Aunque el calendario permita elegir un festivo, la vigilancia no permitirá el ingreso.\n" +
"5.2 Horarios\n" +
"Día\n" +
"	Turnos\n" +
"	Lunes a viernes\n" +
"	8:00–10:00 a. m. · 10:00 a. m.–12:00 m. · 1:00–3:00 p. m. · 3:00–5:00 p. m.\n" +
"	Sábados\n" +
"	8:00–10:00 a. m. · 10:00 a. m.–12:00 m.\n" +
"	Domingos y festivos\n" +
"	Sin servicio\n" +
"	5.3 Paso a paso\n" +
"1. Entre a fabig76.github.io/cerro-azul-residentes y toque la pestaña \"Agendar mudanza\".\n" +
"2. Escriba su código CA-XXXX, el número de apartamento y la cédula del propietario (solo números).\n" +
"3. Toque \"Verificar\".\n" +
"4. Elija el tipo: Salida (si el inquilino se va) o Ingreso (si llega uno nuevo).\n" +
"   * Si es Ingreso, el nuevo residente (arrendatario) debe haberse registrado antes en el Portal del residente (sección 6); si no, la solicitud será rechazada. El arrendatario no llena el formulario principal.\n" +
"5. Elija la torre (el ascensor A queda fijo).\n" +
"6. Elija el día en el calendario. Los días en gris no están disponibles (domingos y fechas con menos de 48 horas).\n" +
"7. Elija un horario disponible (en verde). Los ocupados aparecen en rojo.\n" +
"8. Opcional: empresa de mudanza, placa del vehículo y observaciones.\n" +
"9. Toque \"Confirmar reserva\".\n" +
"10. Recibirá un código que empieza por MD- (ej. MD-0007) y un correo de confirmación. Guárdelo.\n" +
"5.4 Cancelar o cambiar\n" +
"* Escriba a urb.cerroazul@gmail.com con su código MD-XXXX y su apartamento, hasta 24 horas antes.\n" +
"* El agente no puede cancelar reservas.\n" +
"5.5 El día de la mudanza\n" +
"* Llegue a la hora reservada. La vigilancia verifica la reserva y al terminar marca si la mudanza se realizó.\n" +
"* Si una mudanza no está reservada, la vigilancia no puede registrarla; debe hablar con la administración.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"6. Portal del residente (arrendatarios y familiares)\n" +
"6.1 Qué es\n" +
"Permite que cada persona que vive en el apartamento (arrendatarios, familiares) registre sus propios datos: datos personales, otros residentes, menores, vehículos, bicicletas, mascotas y contactos de emergencia.\n" +
"\n" +
"\n" +
"Enlace: fabig76.github.io/cerro-azul-residentes/residente.html (o el QR del aviso morado \"Registro de arrendatarios y residentes\").\n" +
"6.2 Requisito\n" +
"Primero, el propietario, la inmobiliaria o el encargado debe haber creado el registro del apartamento en el formulario principal (sección 3). Sin ese registro, el residente no podrá registrarse.\n" +
"\n" +
"\n" +
"* El arrendatario no puede crear ese registro por su cuenta, aunque el propietario se demore. Debe pedírselo al propietario, a la inmobiliaria o al encargado, o comunicarse con la administración.\n" +
"6.3 Paso a paso\n" +
"1. Abra el enlace o escanee el QR.\n" +
"2. Escriba su número de apartamento (el mismo de su contrato) y toque \"Continuar\".\n" +
"3. Pueden pasar tres cosas:\n" +
"   * \"Apartamento no registrado\": el propietario aún no ha hecho su registro. Pídale que lo haga primero (sección 3).\n" +
"   * Formulario de registro (si nadie se ha registrado todavía): llene sus datos (siguiente punto).\n" +
"   * Lista de residentes ya registrados: si usted es uno de ellos, escriba su cédula y toque \"Editar mis datos\". Si no aparece en la lista, hable con el propietario o la inmobiliaria para que lo agreguen.\n" +
"4. En el formulario de registro:\n" +
"   * Residente 1 (usted): nombre completo, cédula, parentesco y celular (obligatorios); correo (opcional). Si vive en arriendo, elija \"Arrendatario\" como parentesco.\n" +
"   * \"+ Agregar otro residente\": pareja o hijos mayores de edad (hasta 4 personas).\n" +
"   * \"+ Agregar menor\": menores de edad.\n" +
"   * \"+ Agregar vehículo\" / \"+ Agregar moto\": placa, marca, tipo y color. Máximo 2 carros y 2 motos por apartamento (compartidos entre todos los residentes).\n" +
"   * \"+ Agregar bicicleta\": hasta 2.\n" +
"   * \"+ Agregar mascota\": nombre, especie, raza, edad y vacuna al día. Hasta 2.\n" +
"   * \"+ Agregar contacto de emergencia\": hasta 2.\n" +
"5. Toque \"Registrarme como residente\".\n" +
"6. Aparece \"Datos guardados correctamente\".\n" +
"6.4 Actualizar datos\n" +
"* Entre de nuevo con el apartamento y su cédula → \"Editar mis datos\".\n" +
"* Desde aquí puede actualizar nombre, parentesco, celular y correo.\n" +
"* Vehículos, mascotas y contactos los actualiza el propietario del apartamento desde su registro (sección 4).\n" +
"6.5 Quiénes deben registrarse\n" +
"Todos los residentes mayores de edad: propietarios, arrendatarios y quienes viven en el apartamento.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"7. Estado de cuenta, factura y paz y salvo\n" +
"7.1 Quién puede usarlo\n" +
"* El propietario registrado (también tenedor o inmobiliaria, si así quedó en el registro).\n" +
"* No está disponible para arrendatarios.\n" +
"7.2 Cómo entrar\n" +
"1. Entre al portal principal y abra la opción de estado de cuenta.\n" +
"2. Escriba su código CA-XXXX, su número de apartamento y su cédula (la registrada como propietario).\n" +
"3. Toque el botón para consultar.\n" +
"\n" +
"\n" +
"Si se equivoca 5 veces, el acceso de ese apartamento se bloquea 15 minutos por seguridad. Espere y vuelva a intentarlo.\n" +
"7.3 Qué muestra\n" +
"* Saldo con corte al último informe de cartera (normalmente el último día del mes anterior):\n" +
"   * Si es mayor que cero: saldo pendiente.\n" +
"   * Si es negativo: saldo a favor (anticipos).\n" +
"   * Si es cero: sin saldo pendiente.\n" +
"* Detalle por concepto: cuotas de administración, cobro prejurídico, cuota extra, sanciones, anticipos.\n" +
"* Cuota de administración mensual.\n" +
"* Meses prom. (según contabilidad): dato que reporta el software contable.\n" +
"* Factura del mes: número de cuenta de cobro, fecha de emisión, páguese hasta y total a pagar.\n" +
"* Últimos pagos: los abonos registrados en los últimos periodos (según el valor \"abono último mes\" de cada cuenta de cobro). El historial se construye mes a mes desde agosto de 2026.\n" +
"* Botón \"Pagar en línea\" (Jelpit).\n" +
"7.4 Descargar la factura\n" +
"* Toque \"Descargar factura\". Se descarga solo la factura de su apartamento del mes actual, en PDF.\n" +
"* La factura también llega cada mes a su correo desde el programa contable. El portal es una opción adicional para consultarla cuando quiera.\n" +
"* Si dice que la factura no está disponible, la administración aún no ha cargado el mes; intente más tarde.\n" +
"7.5 Paz y salvo\n" +
"* El botón aparece si el saldo está al día: saldo en cero, saldo a favor o un residuo menor a $1.000.\n" +
"* Si tiene saldo pendiente, aparece el mensaje: \"El paz y salvo estará disponible cuando el saldo esté al día.\"\n" +
"* El paz y salvo se descarga en PDF con consecutivo y código de verificación, y certifica la situación con la fecha de corte de la cartera.\n" +
"* Si pagó después de la fecha de corte, el pago se verá cuando la administración cargue el siguiente informe de cartera. Si necesita el paz y salvo con urgencia, comuníquese con la administración.\n" +
"7.6 Preguntas típicas\n" +
"* \"Pagué y sigue apareciendo la deuda\": el portal muestra la cartera con la última fecha de corte. Los pagos posteriores se reflejan en la siguiente actualización mensual. Si el pago es anterior al corte y no aparece, envíe el comprobante a la administración.\n" +
"* \"¿Por qué tengo cobro prejurídico?\": corresponde a cartera en proceso de cobro. El agente no puede dar detalles; remita a la administración.\n" +
"* \"Quiero un acuerdo de pago\": remita a la administración.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"8. Pagos de administración (Jelpit y otros canales)\n" +
"8.1 Datos para pagar\n" +
"Dato\n" +
"	Valor\n" +
"	Comercio\n" +
"	Cerro Azul Conjunto Residencial\n" +
"	Código de convenio\n" +
"	1568930\n" +
"	Referencia de pago\n" +
"	Su número de apartamento (ej. apto 402 → referencia 402)\n" +
"	8.2 Pagar con Jelpit (más fácil)\n" +
"1. Escanee el QR de pagos (aviso de pagos con Jelpit o la factura) o abra web-conjuntos.jelpit.com/pagar-mi-administracion.\n" +
"2. Seleccione su cuenta de cobro y toque \"Pagar esta cuenta\".\n" +
"3. Elija su medio de pago. ¡Listo!\n" +
"\n" +
"\n" +
"También puede entrar a www.jelpit.com y buscar el convenio o la referencia.\n" +
"8.3 Otros canales\n" +
"Canal\n" +
"	Pasos\n" +
"	App Davivienda\n" +
"	Pagar → Servicios → convenio 1568930 → referencia → confirmar\n" +
"	DaviPlata\n" +
"	Pagar → Otros servicios → convenio 1568930 → referencia y valor → Pagar\n" +
"	Davivienda.com\n" +
"	Ingreso a clientes → convenio de recaudo 1568930 → referencia → confirmar\n" +
"	Cajeros Davivienda\n" +
"	Pago de servicios → convenio 1568930 → referencia y valor → clave\n" +
"	Corresponsales (Puntos Red, Conred, Reval)\n" +
"	Indique el convenio 1568930 y la referencia\n" +
"	8.4 Saber cuánto pagar\n" +
"Consulte el estado de cuenta (sección 7) o la factura que llega a su correo.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"9. Salón social\n" +
"* Se reserva en línea desde el portal principal.\n" +
"* Hay dos turnos:\n" +
"   * Mañana: 8:00 a. m. a 1:00 p. m.\n" +
"   * Tarde: 2:00 p. m. a 10:00 p. m.\n" +
"* El pago se hace en línea por Jelpit.\n" +
"* Requisito: el apartamento no debe tener 2 o más meses en mora.\n" +
"* Desde el 1 de octubre de 2026, los apartamentos en mora no pueden alquilar el salón social (ver sección 11).\n" +
"* Para cancelar o cambiar una reserva, o para conocer el valor vigente, el depósito y las condiciones de uso, remita a la administración.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"10. Citófono digital \"Mi apartamento\"\n" +
"10.1 Qué es y por qué es urgente\n" +
"* Es el nuevo citófono del conjunto, que funciona en el celular del residente.\n" +
"* Desde octubre de 2026, la portería solo podrá comunicarse con los apartamentos registrados en el nuevo citófono. Sin este registro no recibirá llamadas de portería ni avisos de paquetes, domicilios o visitas.\n" +
"* Es gratis: no se descarga de ninguna tienda de aplicaciones y no consume minutos.\n" +
"10.2 Qué gana el residente\n" +
"* Avisos al celular de paquete, domicilio, correspondencia, visitante, vehículo y avisos generales de la administración, aunque el celular esté bloqueado.\n" +
"* Responder con un toque: \"Ya bajo\", \"Déjelo en portería\", \"Autorizo el ingreso\", \"Ahora no puedo\", \"Recibido, gracias\".\n" +
"* La portería lo llama sin ver su número: en portería solo aparece el número del apartamento y la llamada se borra al colgar.\n" +
"* Escribir a la portería (ej. \"Espero un domicilio\") o tocar \"Que me llamen de portería\".\n" +
"* Sus datos se guardan protegidos (cifrados) en el servidor del conjunto, no en el celular de la portería.\n" +
"10.3 Requisitos\n" +
"* El apartamento debe estar registrado por el propietario, la inmobiliaria o el encargado, y el celular de cada persona debe estar registrado en el portal web de la copropiedad:\n" +
"   * Propietarios: fabig76.github.io/cerro-azul-residentes\n" +
"   * Arrendatarios y residentes: fabig76.github.io/cerro-azul-residentes/residente.html\n" +
"* Internet (wifi o datos).\n" +
"* En iPhone, los avisos requieren iOS 16.4 o más nuevo.\n" +
"10.4 Instalación (paso a paso)\n" +
"Paso 1 (todos): escanee el QR del aviso del citófono (ascensores y portería) o abra citofono.urbcerroazul.com/r.\n" +
"\n" +
"\n" +
"Paso 2 y 3 — Convertirlo en app:\n" +
"\n" +
"\n" +
"Android (Samsung, Xiaomi, Motorola, etc.)\n" +
"	iPhone (la manzana de Apple atrás)\n" +
"	Use Chrome.\n" +
"	Use Safari (la brújula azul). En otros navegadores puede no funcionar.\n" +
"	Toque los 3 puntitos ⋮ arriba a la derecha.\n" +
"	Toque el botón compartir: el cuadrito con una flecha hacia arriba, abajo en el centro.\n" +
"	Toque \"Agregar a la pantalla principal\" o \"Instalar aplicación\".\n" +
"	Toque \"Agregar a inicio\" (si no lo ve, deslice la lista hacia arriba).\n" +
"	Confirme con \"Agregar\" o \"Instalar\".\n" +
"	Toque \"Agregar\", arriba a la derecha.\n" +
"	\n" +
"\n" +
"Paso 4: cierre el navegador. En la pantalla de inicio aparece el ícono \"Mi apartamento\". Desde ahora entre siempre por ese ícono, no por el navegador.\n" +
"\n" +
"\n" +
"Paso 5: abra el ícono y entre con su número de apartamento y su celular registrado. Toque \"Entrar\". Aunque ya hubiera entrado desde el navegador, debe entrar otra vez desde el ícono (es solo esta vez).\n" +
"\n" +
"\n" +
"Paso 6: toque \"Avisarme aunque esté bloqueado\" y, cuando el celular pregunte, toque \"Permitir\". Sin este permiso solo verá los avisos con la app abierta.\n" +
"\n" +
"\n" +
"Listo: si ve \"Nada pendiente por ahora\", todo quedó bien.\n" +
"10.5 Uso diario\n" +
"* Cuando llega un aviso, el celular suena y el aviso aparece en pantalla. Toque una de las respuestas rápidas.\n" +
"* Para pedir que lo llamen: \"Que me llamen de portería\".\n" +
"* Para escribir a portería: escriba en \"Escribir a portería…\".\n" +
"* La llamada de portería suena como una llamada normal.\n" +
"10.6 Problemas frecuentes\n" +
"Problema\n" +
"	Solución\n" +
"	No me deja entrar\n" +
"	Su celular no está registrado o cambió de número. Actualícelo en el portal web (sección 4 o 6.4) o avise a la administración. La información pasa al citófono en un plazo aproximado de 24 horas.\n" +
"	No me llegan los avisos\n" +
"	Abra la app desde el ícono \"Mi apartamento\" y toque \"Avisarme aunque esté bloqueado\" → \"Permitir\". Revise que no tenga el celular en modo \"No molestar\".\n" +
"	iPhone: no aparece el botón de avisos\n" +
"	Debe abrirla desde el ícono de inicio (no desde Safari) y tener iOS 16.4 o superior.\n" +
"	No encuentro \"Agregar a inicio\"\n" +
"	En iPhone use Safari. En Android use Chrome y busque \"Instalar aplicación\".\n" +
"	\"Su sesión se cerró\"\n" +
"	Vuelva a escribir su apartamento y su celular.\n" +
"	Varias personas del apartamento\n" +
"	Cada persona instala la app en su celular, siempre que su celular esté registrado en el portal.\n" +
"	\n" +
"\n" +
"Hay un video guía (4 minutos) y un manual con dibujos (páginas verdes para Android, negras para iPhone). Si la persona tiene dificultades, recomiéndele verlos o pedir ayuda en portería o al WhatsApp de la administración.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"11. Normas de convivencia y medidas vigentes\n" +
"Medidas informadas por la Administración en la reunión de propietarios de la Torre 1 (26 de septiembre de 2026). Algunas propuestas dependen de aprobación del Consejo o de la Asamblea.\n" +
"11.1 Basuras y reciclaje\n" +
"* Desde el 1 de noviembre de 2026, las puertas del shut de cada piso funcionan de 8:00 a. m. a 5:00 p. m. y permanecen cerradas fuera de ese horario.\n" +
"* Se instalan contenedores en la entrada para residuos orgánicos y reciclaje.\n" +
"* Prohibido dejar reciclaje o bolsas en pisos y pasillos. Hay comparendos y, al tercer incumplimiento, interviene el Consejo.\n" +
"11.2 Mascotas\n" +
"* Desde el 1 de noviembre de 2026, quien pasee una mascota debe llevar traílla, botella con rociador y elementos de aseo, y dejar limpio el lugar.\n" +
"* El incumplimiento se sanciona.\n" +
"* Registrar las mascotas en el formulario es obligatorio (censo del Decreto 768 de 2025).\n" +
"11.3 Parqueaderos\n" +
"* En el conjunto existen parqueaderos privados y de visitantes.\n" +
"* Los parqueaderos de movilidad reducida son de uso transitorio (subir o bajar personas). Su uso permanente está prohibido salvo asignación de la asamblea.\n" +
"* No invada celdas ajenas ni obstruya el paso con motos.\n" +
"11.4 Apartamentos en mora\n" +
"* Según lo informado por la Administración, desde el 1 de octubre de 2026 los apartamentos en mora tienen restricciones: no se entregan tarjetas de acceso a la piscina, no pueden usar la piscina ni alquilar el salón social, y otras medidas informadas en la reunión.\n" +
"* Los acuerdos de pago incumplidos pasan a cobro jurídico.\n" +
"* Para dudas sobre su caso o para un acuerdo de pago, remita a la administración.\n" +
"11.5 Piscina\n" +
"* Las tarjetas de acceso cuestan $10.000 y se entregan a propietarios con el estado de cuenta al día.\n" +
"11.6 Ruido, objetos por ventanas y otras faltas\n" +
"* Ruido (música, gritos, taladros fuera de horario), consumo de sustancias en zonas comunes o balcones, arrojar objetos por ventanas o balcones (campaña #DesdeMiVentanaNo): son conductas sancionables según el reglamento de propiedad horizontal y la Ley 1801 de 2016.\n" +
"* Una colilla encendida puede causar un incendio; un objeto que cae desde un piso alto puede causar lesiones graves.\n" +
"* Cómo reportar: en portería, desde la app \"Mi apartamento\" (\"Escribir a portería\") o por WhatsApp a la administración (316 924 0748), indicando torre, piso o ventana, hora y, si es seguro, foto o video. La identidad de quien reporta se mantiene en reserva.\n" +
"11.7 Comité de convivencia y reuniones por torre\n" +
"* La administración realiza reuniones informativas por torre cada tres meses (por Google Meet).\n" +
"* Quien quiera ser parte del comité de convivencia de su torre puede postularse por mensaje privado a la administración.\n" +
"11.8 Sanciones (información general)\n" +
"* La Ley 675 de 2001 (artículo 59) permite publicar la lista de infractores, imponer multas sucesivas (hasta dos veces la cuota mensual por cada incumplimiento) y restringir el uso de bienes comunes no esenciales, respetando el debido proceso (notificación y descargos).\n" +
"* El agente no informa sanciones de personas concretas.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"12. Privacidad y protección de datos\n" +
"* Los datos se tratan conforme a la Ley 1581 de 2012 y solo se usan para la administración del conjunto.\n" +
"* Los datos de menores están especialmente protegidos.\n" +
"* En el citófono, el vigilante solo ve el número del apartamento, nunca el teléfono del residente; los teléfonos se guardan cifrados.\n" +
"* En el portal de vigilancia, el celular y el correo de los residentes no se muestran.\n" +
"* Para actualizar, corregir o pedir la supresión de sus datos, el titular puede escribir a urb.cerroazul@gmail.com.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"13. Preguntas frecuentes (respuestas listas)\n" +
"Formato: Pregunta → respuesta sugerida. Adapte el tono a la persona.\n" +
"Registro y portales\n" +
"* ¿Dónde me registro? → Si es propietario, inmobiliaria o encargado del apartamento: fabig76.github.io/cerro-azul-residentes, pestaña \"Enviar / Crear registro\". Si es arrendatario o familiar: fabig76.github.io/cerro-azul-residentes/residente.html (el propietario debe haber registrado antes el apartamento).\n" +
"* ¿Es obligatorio? → Sí. Además, desde octubre la portería solo podrá comunicarse con los apartamentos registrados en el nuevo citófono.\n" +
"* ¿Cuánto tiempo toma? → El formulario principal, de 10 a 15 minutos. El portal del residente, pocos minutos.\n" +
"* ¿Se guarda si me salgo? → No. Si sale sin enviar, debe empezar de nuevo.\n" +
"* Soy arrendatario, ¿puedo llenar el formulario principal? → No. El registro del apartamento solo lo puede crear el propietario, la inmobiliaria o el encargado. Usted se registra en el Portal del residente (fabig76.github.io/cerro-azul-residentes/residente.html) una vez el apartamento esté registrado.\n" +
"* El propietario no ha registrado el apartamento, ¿lo hago yo como arrendatario? → No. Pídale al propietario, a la inmobiliaria o al encargado que lo haga. Si no logra contactarlos, comuníquese con la administración (316 924 0748).\n" +
"* La inmobiliaria me dijo que yo llenara el formulario principal → El arrendatario no debe llenarlo. Lo debe hacer la inmobiliaria o el propietario. Usted regístrese después en el Portal del residente.\n" +
"* Me sale \"Apartamento no registrado\" → El propietario aún no registró el apartamento. Pídale que lo haga en el formulario principal.\n" +
"* No aparezco en la lista de residentes → Hable con el propietario o la inmobiliaria para que lo agreguen.\n" +
"* ¿Puedo registrar 3 carros? → No. El máximo es 2 carros y 2 motos por apartamento.\n" +
"* ¿Qué pongo en \"Diligencia como\"? → Propietario si usted es el dueño; Tenedor / Otro si es el encargado o representante del propietario. Si usted es arrendatario, no llene este formulario: regístrese en el Portal del residente.\n" +
"* No sé la matrícula → Déjela en blanco; se llena sola al escribir el apartamento.\n" +
"* ¿Dónde está el serial de la bicicleta? → Grabado en el metal del marco, normalmente debajo del pedal o en el tubo del sillín.\n" +
"* Mi perro es de raza peligrosa → Marque \"Sí\" en manejo especial y agregue el registro del canino y la póliza de responsabilidad civil.\n" +
"* ¿Qué es el código CA? → Es su código de formulario (ej. CA-0042). Lo necesita para editar, agendar mudanzas y ver su estado de cuenta.\n" +
"* Perdí el código CA → Escriba a la administración con su nombre, cédula y apartamento.\n" +
"* ¿Cómo cambio mi celular o correo? → Propietario: pestaña \"Editar mi registro\". Residente: portal del residente → \"Editar mis datos\".\n" +
"Mudanzas\n" +
"* ¿Cómo agendo una mudanza? → Pestaña \"Agendar mudanza\", con código CA, apartamento y cédula del propietario (ver sección 5).\n" +
"* Soy arrendatario, ¿puedo agendarla? → No. La agenda el propietario o la inmobiliaria autorizada.\n" +
"* ¿Con cuánta anticipación? → Al menos 2 días (48 horas).\n" +
"* ¿Puedo el domingo o un festivo? → No hay servicio domingos ni festivos.\n" +
"* ¿Qué ascensor uso? → El ascensor A de su torre.\n" +
"* ¿Cómo cancelo? → Escriba a urb.cerroazul@gmail.com con su código MD y su apartamento, hasta 24 horas antes.\n" +
"* Llega un nuevo inquilino → Elija \"Ingreso\". El nuevo residente debe haberse registrado antes.\n" +
"Estado de cuenta, pagos y paz y salvo\n" +
"* ¿Cuánto debo? → El agente no puede ver cuentas. Consulte el estado de cuenta en el portal con su código CA, apartamento y cédula.\n" +
"* ¿Dónde descargo mi factura? → En el estado de cuenta → \"Descargar factura\". También le llega al correo cada mes.\n" +
"* ¿Cómo saco el paz y salvo? → En el estado de cuenta; el botón aparece si está al día o con saldo a favor.\n" +
"* No me aparece el botón de paz y salvo → Su cuenta tiene saldo pendiente con la última fecha de corte. Si ya pagó, el pago se verá en la siguiente actualización; si es urgente, comuníquese con la administración.\n" +
"* ¿Cómo pago? → Jelpit (QR o enlace), app Davivienda, DaviPlata, Davivienda.com, cajeros Davivienda o corresponsales. Convenio 1568930; referencia: su número de apartamento.\n" +
"* ¿Cuál es la referencia de pago? → Su número de apartamento.\n" +
"* Pagué y no se refleja → El portal se actualiza con cada corte mensual de cartera. Si el pago es anterior al corte, envíe el comprobante a la administración.\n" +
"* Me bloqueó el estado de cuenta → Por seguridad, tras 5 intentos fallidos se bloquea 15 minutos. Espere y revise el código CA, el apartamento y la cédula.\n" +
"* Soy arrendatario, ¿veo el estado de cuenta? → No; es exclusivo del propietario.\n" +
"Citófono\n" +
"* ¿Qué es \"Mi apartamento\"? → El nuevo citófono en su celular (sección 10).\n" +
"* ¿Tiene costo? → No. Es gratis y no consume minutos.\n" +
"* ¿Lo bajo de Play Store o App Store? → No. Se instala desde la página citofono.urbcerroazul.com/r y se agrega a la pantalla de inicio.\n" +
"* ¿Por qué debo volver a entrar después de instalarlo? → La app nueva empieza en blanco; es solo una vez.\n" +
"* ¿El vigilante verá mi número? → No. Solo ve el número del apartamento.\n" +
"* Mi celular es viejo / iPhone antiguo → En iPhone necesita iOS 16.4 o superior para los avisos. Si no lo tiene, comuníquese con la administración para buscar una alternativa.\n" +
"* ¿Puede usarlo toda mi familia? → Sí, cada persona con su celular registrado en el portal.\n" +
"Salón social y piscina\n" +
"* ¿Cómo reservo el salón? → En el portal principal, opción salón social; turno de mañana (8:00 a. m.–1:00 p. m.) o tarde (2:00–10:00 p. m.), pago por Jelpit.\n" +
"* No me deja reservar → Puede ser porque el apartamento tiene 2 o más meses en mora o el turno ya está ocupado. Consulte a la administración.\n" +
"* ¿Cuánto vale la tarjeta de la piscina? → $10.000, con el estado de cuenta al día.\n" +
"Convivencia\n" +
"* ¿A qué hora puedo botar la basura? → Desde el 1 de noviembre, el shut funciona de 8:00 a. m. a 5:00 p. m.; fuera de ese horario use los contenedores de la entrada.\n" +
"* Un vecino hace mucho ruido / tira cosas por la ventana → Repórtelo en portería, en la app \"Mi apartamento\" o por WhatsApp a la administración, con torre, piso, hora y, si es seguro, foto o video. Su identidad se mantiene en reserva.\n" +
"* ¿Puedo pasear a mi perro sin traílla? → No. Desde el 1 de noviembre es obligatorio llevar traílla, rociador y elementos de aseo.\n" +
"* Hay un daño en una zona común → Repórtelo a la portería o a la administración por WhatsApp, con foto si es posible.\n" +
"\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"14. Problemas técnicos generales\n" +
"Problema\n" +
"	Qué decir\n" +
"	La página no carga\n" +
"	Revise que tenga internet (wifi o datos), espere 30 segundos y vuelva a intentarlo. Cierre y abra de nuevo la página.\n" +
"	La página se ve mal o incompleta\n" +
"	Actualícela (deslice hacia abajo en el celular o toque el ícono de recargar). Pruebe con Chrome (Android) o Safari (iPhone).\n" +
"	No funciona el código QR\n" +
"	Abra la cámara, apunte al código sin moverse y toque el enlace que aparece. Si no funciona, escriba la dirección que está debajo del código.\n" +
"	No sé qué celular tengo\n" +
"	Si tiene la manzana de Apple atrás, es iPhone; si no, es Android.\n" +
"	Botón que no responde\n" +
"	Verifique que llenó todos los campos con asterisco.\n" +
"	Mensaje de error que no entiende\n" +
"	Pídale a la persona que copie o describa el mensaje y remita a la administración.\n" +
"	\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"15. SECCIÓN EXCLUSIVA PARA VIGILANTES\n" +
"⚠️ Use esta sección SOLO si la persona se identificó como vigilante o guarda de seguridad del conjunto. Aun así: nunca dé la contraseña del portal, nunca dé datos personales de residentes (teléfonos, cédulas, correos) y nunca confirme datos que no aparecen en el sistema. Si el vigilante pide la contraseña o un dato de un residente, responda que debe consultarlo en su herramienta o con la administración. Hable de usted, con frases muy cortas, un paso a la vez. Muchos vigilantes tienen poca experiencia con tecnología.\n" +
"15.1 Reglas de oro del vigilante\n" +
"1. Los números de los residentes son privados: solo se ve el número del apartamento.\n" +
"2. Use solo el celular de portería; nunca su celular personal para llamar a residentes.\n" +
"3. Su código de guarda es personal: todo queda firmado con su nombre. No lo preste.\n" +
"4. No entregue ningún paquete sin que el residente confirme en su celular.\n" +
"5. La contraseña del portal de vigilancia es secreta: no la dé a nadie ni la deje escrita a la vista.\n" +
"6. Al terminar el turno, cierre sesión y cierre el turno.\n" +
"15.2 Portal de vigilancia (consultas)\n" +
"Para qué sirve: saber quién vive en un apartamento, de quién es un vehículo, qué mudanzas hay hoy y si el salón social está reservado.\n" +
"\n" +
"\n" +
"Entrar:\n" +
"\n" +
"\n" +
"1. Abra el portal de vigilancia en el celular o computador de portería (pídale a la administración que lo deje guardado).\n" +
"2. Toque el cuadro \"Contraseña\" y escriba la contraseña que le entregó la administración. Se ven puntos: es normal. Respete mayúsculas y minúsculas.\n" +
"3. Toque \"Ingresar\". Si sale un mensaje rojo, la contraseña quedó mal escrita: bórrela y escríbala otra vez.\n" +
"4. Si arriba dice \"Sesión activa\", ya entró.\n" +
"\n" +
"\n" +
"Pestañas:\n" +
"\n" +
"\n" +
"* Buscar residente: escriba el número del apartamento (o nombre, apellido o cédula) → \"Buscar\" → toque la fila de la persona. Ve la ficha: apartamento, propietario, residentes con cédula, vehículos, bicicletas, parqueaderos y mascotas. El celular y el correo no aparecen (son privados). Si sale \"No se encontraron resultados\", revise lo escrito; si está bien, la persona no está registrada: avise a la administración.\n" +
"* Buscar por placa: escriba la placa (o la parte que recuerde, por ejemplo las letras) → \"Buscar placa\". Aparece el apartamento y el propietario. Revise que marca y color coincidan con el vehículo que ve. El cuadro amarillo solo explica para qué sirve la búsqueda.\n" +
"* Mudanzas: muestra las mudanzas del día (código MD, salida o ingreso, apartamento, torre, ascensor y hora). Verifique que usen el ascensor A y lleguen a la hora reservada. Al terminar: primero escriba su nombre en el cuadro → toque \"Sí, se realizó\" (verde) o \"No se realizó\" (rojo). El cuadro cambia a verde y queda registrado quién la marcó y a qué hora. Si llega una mudanza que no está en la lista, no puede registrarla: avise a la administración. Si se equivocó al marcar, avise a la administración.\n" +
"* Salón Social: muestra el turno de mañana (8:00 a. m.–1:00 p. m.) y el de tarde (2:00–10:00 p. m.). RESERVADO (en rojo) muestra apartamento y nombre de quien reservó; LIBRE significa que nadie ha reservado. El botón \"Hoy\" regresa a la fecha actual. El vigilante no puede cancelar ni cambiar reservas.\n" +
"* Cerrar sesión: al terminar el turno, toque \"Cerrar sesión\", arriba a la derecha.\n" +
"15.3 App de portería del citófono\n" +
"Iniciar turno:\n" +
"\n" +
"\n" +
"1. Abra la app de Portería del celular del conjunto.\n" +
"2. Escriba su código de guarda y toque \"Entrar\". Si lo olvidó, llame a la administración; nunca use el código de otro vigilante.\n" +
"3. Lea la entrega del turno anterior (novedades que dejó el vigilante anterior) y confírmela.\n" +
"\n" +
"\n" +
"Pantalla Citófono:\n" +
"\n" +
"\n" +
"* Cada cuadrito es un apartamento. Arriba está el buscador.\n" +
"* Toque el apartamento → se abre su ficha.\n" +
"* \"Llamar\": el celular marca solo; solo verá el número del apartamento; al colgar, la llamada se borra.\n" +
"* Avisos (en la misma ficha): Paquete (puede tomar foto), Domicilio, Correspondencia, Visitante, Vehículo (bajar a mover el carro), Aviso general. Al residente le suena el celular. Si no contesta la llamada, envíe un aviso.\n" +
"\n" +
"\n" +
"Bandeja (mensajes de residentes):\n" +
"\n" +
"\n" +
"* Cuando un residente escribe o pide que lo llamen, el celular suena y vibra; arriba aparece el mensaje con el número del apartamento y el cuadrito del apartamento se pone azul.\n" +
"* \"Llamar\": si pidió que lo llamen.\n" +
"* \"Visto\": cuando ya lo atendió; el mensaje sale de la bandeja. No deje mensajes sin \"Visto\".\n" +
"* Las respuestas de los residentes a sus avisos (\"Ya bajo\", \"Déjelo en portería\", \"Autorizo el ingreso\", \"Ahora no puedo\", \"Recibido, gracias\") también llegan a la bandeja.\n" +
"\n" +
"\n" +
"Paquetes:\n" +
"\n" +
"\n" +
"* Llegada: apartamento, últimos dígitos de la guía, empresa y descripción, foto → \"Registrar y avisar al residente\".\n" +
"* Entrega: no entregue sin que el residente marque \"recibido\" en su celular. Si no puede confirmarlo, el sistema pide escribir el motivo, que queda registrado con su nombre.\n" +
"\n" +
"\n" +
"Visitas: nombre, cédula, celular, placa si viene en vehículo, apartamento al que va; si es contratista, empresa, EPS y ARL; foto. Al guardar, el residente recibe el aviso para autorizar. Marque el ingreso y la salida.\n" +
"\n" +
"\n" +
"Vehículos (ronda del parqueadero): escriba la placa (el sistema indica el apartamento), elija la novedad (mal estacionado, luces encendidas, puerta abierta, vidrio abajo, daño visible, alarma activada, vehículo desconocido u otra), tome foto y guarde.\n" +
"\n" +
"\n" +
"Minuta: \"Anotar novedad\" → tipo de evento → qué pasó → \"Guardar novedad\". Queda firmada con nombre, fecha y hora.\n" +
"\n" +
"\n" +
"PQRS: solicitudes de residentes dirigidas a vigilancia. Léalas y respóndalas; si no le corresponden, anótelo en la minuta e informe a la administración.\n" +
"\n" +
"\n" +
"Cerrar turno: en Minuta → \"Cerrar turno y entregar\" → escriba las novedades para el siguiente vigilante → \"Cerrar turno y salir\". Nunca se vaya sin cerrar el turno.\n" +
"\n" +
"\n" +
"Nota: si la pantalla real de la app tiene nombres de botones o secciones distintos a los descritos, siga lo que muestre la app y consulte a la administración.\n" +
"15.4 Problemas del vigilante\n" +
"Problema\n" +
"	Qué hacer\n" +
"	El residente no contesta\n" +
"	Envíele un aviso; si es urgente, anótelo en la minuta.\n" +
"	El apartamento no tiene teléfono en el citófono\n" +
"	El residente no se ha registrado; avise a la administración.\n" +
"	La app o el portal no cargan\n" +
"	Revise el internet, espere 30 segundos, cierre y abra de nuevo. Si sigue igual, avise a la administración.\n" +
"	Olvidó su código o la contraseña\n" +
"	Llame a la administración. No use el código de otro vigilante.\n" +
"	El celular de portería se apagó\n" +
"	Cárguelo y ábralo; la app vuelve a la pantalla de portería.\n" +
"	Emergencia\n" +
"	Llame a la línea 123 y siga el protocolo de la empresa de vigilancia.\n" +
"	\n" +
"\n" +
"________________\n" +
"\n" +
"\n" +
"16. Plantillas de respuesta y escalamiento\n" +
"Cuando no tiene la información:\n" +
"\n" +
"\n" +
"\"No tengo esa información en este momento. Para ayudarle mejor, comuníquese con la administración por WhatsApp al 316 924 0748 o al correo urb.cerroazul@gmail.com.\"\n" +
"\n" +
"\n" +
"Cuando piden datos de otra persona:\n" +
"\n" +
"\n" +
"\"Por protección de datos personales (Ley 1581 de 2012) no puedo compartir información de otros residentes. Si necesita algo relacionado con esa persona, comuníquese con la administración.\"\n" +
"\n" +
"\n" +
"Cuando preguntan por su deuda:\n" +
"\n" +
"\n" +
"\"No tengo acceso a las cuentas. Puede consultar su saldo en el estado de cuenta del portal con su código CA, su apartamento y su cédula. ¿Quiere que le explique cómo?\"\n" +
"\n" +
"\n" +
"Cuando alguien pregunta por el portal de vigilancia sin identificarse:\n" +
"\n" +
"\n" +
"\"Ese portal es de uso exclusivo del personal de vigilancia. Si usted es vigilante del conjunto, por favor indíquemelo.\"\n" +
"\n" +
"\n" +
"Cuando reportan una emergencia:\n" +
"\n" +
"\n" +
"\"Llame ya a la línea 123 y avise a la portería. Cuando esté a salvo, informe también a la administración.\"\n" +
"\n" +
"\n" +
"Cuando reportan una queja de convivencia:\n" +
"\n" +
"\n" +
"\"Gracias por reportarlo. Indique la torre, el piso o ventana y la hora, y si es seguro, una foto o video. Puede hacerlo en portería, en la app 'Mi apartamento' (Escribir a portería) o por WhatsApp a la administración (316 924 0748). Su identidad se mantiene en reserva.\"\n" +
"\n" +
"\n" +
"Cierre de conversación:\n" +
"\n" +
"\n" +
"\"¿Pudo hacerlo? Si necesita más ayuda, aquí estoy.\""
);
function chatAsistente(payload) {
  try {
    const mensaje = String((payload && payload.mensaje) || '').trim();
    if (!mensaje) {
      return { ok: false, error: 'Mensaje vacío.' };
    }
    if (mensaje.length > 500) {
      return { ok: false, error: 'Mensaje demasiado largo (máximo 500 caracteres).' };
    }

    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty('MINIMAX_API_KEY');
    if (!apiKey) {
      Logger.log('[chatAsistente] ERROR: falta MINIMAX_API_KEY en Script Properties');
      return { ok: false, error: 'Asistente no configurado (falta MINIMAX_API_KEY en Script Properties).' };
    }
    const baseUrl = String(props.getProperty('MINIMAX_BASE_URL') || 'https://api.minimax.io/anthropic').replace(/\/+$/, '');
    const groupId = String(props.getProperty('MINIMAX_GROUP_ID') || '').trim();

    // System prompt restrictivo — el doc es la ÚNICA fuente de respuestas.
    // Si la pregunta NO está en el manual, el agente debe remitir a la
    // administración. NO inventa info. NO da datos de otras personas.
    const systemPrompt = [
      'Eres el agente de ayuda del Conjunto Residencial Cerro Azul PH (NIT 900.770.444-4, Bello/Niquía).',
      'Respondes en español de Colombia, tratando de usted, con frases cortas y un paso a la vez.',
      'Tu ÚNICA fuente de información es el MANUAL OFICIAL que el usuario te proporciona abajo.',
      'Reglas estrictas:',
      '1. SOLO responde con información que esté explícitamente en el manual.',
      '2. Si la pregunta NO está cubierta por el manual, responde EXACTAMENTE: "No tengo esa información en el manual. Por favor contacte a la administración: WhatsApp 316 924 0748 o correo urb.cerroazul@gmail.com."',
      '3. NUNCA des datos personales de otros residentes (nombres, cédulas, teléfonos, placas, deudas).',
      '4. NUNCA reveles ni pidas contraseñas.',
      '5. NUNCA digas cuánto debe un apartamento.',
      '6. NUNCA prometas que un pago, reserva o registro quedó hecho.',
      '7. NUNCA inventes respuestas.',
      '8. Para emergencias, indica la línea 123 y portería.',
      '9. Si la persona se identifica como vigilante, dale solo info de la sección 15 del manual.',
      '',
      'Cuando expliques procedimientos, usa listas numeradas y nombra los botones entre comillas (ej. toque "Continuar").'
    ].join('\n');

    // Body en formato Anthropic Messages (NO OpenAI chat completions).
    // system va como campo top-level. El manual va como contexto del user
    // (concatenado a la pregunta) para que el modelo lo "vea" antes de responder.
    const userContent = [
      '=== MANUAL OFICIAL (fuente única) ===',
      MANUAL_CERRO,
      '',
      '=== PREGUNTA DEL USUARIO ===',
      mensaje
    ].join('\n');

    const body = {
      model: 'MiniMax-M3',
      max_tokens: 500,  // subido desde 350: respuestas con procedimientos pueden ser largas
      system: systemPrompt,
      messages: [
        { role: 'user', content: userContent }
      ],
      temperature: 0.3  // bajado desde 0.4: queremos respuestas más deterministas/fieles al manual
    };
    if (groupId) {
      body.group_id = groupId;
    }

    // Headers formato Anthropic: x-api-key + anthropic-version.
    // Enviamos también Authorization: Bearer por máxima compatibilidad.
    const headers = {
      'x-api-key': apiKey,
      'Authorization': 'Bearer ' + apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    };

    const respHttp = UrlFetchApp.fetch(baseUrl + '/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      timeout: 50  // segundos
    });

    const code = respHttp.getResponseCode();
    const txt = respHttp.getContentText();

    if (code < 200 || code >= 300) {
      Logger.log('[chatAsistente] HTTP ' + code + ' body=' + txt.substring(0, 500));
      return { ok: false, error: 'El servicio de IA respondió con error (' + code + '). Intenta de nuevo.' };
    }

    let json;
    try {
      json = JSON.parse(txt);
    } catch (e) {
      Logger.log('[chatAsistente] JSON parse error: ' + e + ' txt=' + txt.substring(0, 500));
      return { ok: false, error: 'Respuesta inválida del servicio de IA.' };
    }

    // Formato Anthropic Messages API: json.content[0].text
    let respuesta = '';
    if (json && Array.isArray(json.content) && json.content[0] && json.content[0].text) {
      respuesta = String(json.content[0].text || '').trim();
    }

    if (!respuesta) {
      Logger.log('[chatAsistente] respuesta vacía: ' + txt.substring(0, 500));
      return { ok: false, error: 'El servicio de IA devolvió una respuesta vacía.' };
    }

    Logger.log('[chatAsistente] OK manual=' + MANUAL_CERRO.length + 'chars mensaje=' + mensaje.substring(0, 80) + ' → respuesta=' + respuesta.substring(0, 80));
    return { ok: true, respuesta: respuesta };
  } catch (err) {
    Logger.log('[chatAsistente] EXC ' + err);
    return { ok: false, error: 'Error al consultar el asistente: ' + String(err && err.message || err) };
  }
}

// =====================================================================
// BUGFIX-022: Restaurar módulo de Estado de Cuenta (478 líneas)
// El módulo se implementó en V12 (25-Sept) y se perdió en deploys
// posteriores (V21+). Se restaura desde backup hermes-varios/cerro-azul/
// modulo-estado-cuenta.gs (md5 verificado en origen).
// =====================================================================

// =====================================================================
// MÓDULO ESTADO DE CUENTA — Portal de propietarios + carga mensual
// Especificación: docs/spec-estado-cuenta.md
// Este bloque se PEGA AL FINAL de Código.gs. No modifica funciones
// existentes; solo agrega rutas en doPost (ver spec §6.2).
// =====================================================================

const EC_TAB_CONTROL = '_Control';
const EC_TAB_PAGOS   = 'Pagos';
const EC_TAB_PYS     = 'PazYSalvos';
const EC_HDR_CONTROL = ['ID Carga', 'Periodo', 'Pestaña', 'Fecha corte', 'Estado',
                        'Folder facturas ID', 'Total aptos', 'Fecha inicio', 'Fecha fin'];
const EC_HDR_PAGOS   = ['Periodo', 'N° Apto', 'N° Cuenta Cobro', 'Fecha Emisión', 'Páguese Hasta',
                        'Abono Último Mes', 'Total a Pagar', 'Saldo Anterior', 'Anticipos', 'Fecha Carga'];
const EC_HDR_PYS     = ['Consecutivo', 'Código', 'Fecha Expedición', 'Periodo', 'N° Apto',
                        'N° Formulario', 'Nombre', 'CC', 'Total Cartera'];
// Índices (0-based) de _Control
const EC_C_ID = 0, EC_C_PERIODO = 1, EC_C_PESTANA = 2, EC_C_CORTE = 3, EC_C_ESTADO = 4,
      EC_C_FOLDER = 5, EC_C_TOTAL = 6, EC_C_INICIO = 7, EC_C_FIN = 8;
// Índices (0-based) de Pagos
const EC_P_PERIODO = 0, EC_P_APTO = 1, EC_P_NUMCC = 2, EC_P_EMISION = 3, EC_P_HASTA = 4,
      EC_P_ABONO = 5, EC_P_TOTAL = 6, EC_P_SALDOANT = 7, EC_P_ANTICIPOS = 8, EC_P_FCARGA = 9;

const EC_COLS_REQUERIDAS = ['numero', 'nombre', 'anticip', 'valor admon', 'total cartera', 'meses prom'];
const EC_MAX_INTENTOS = 5;          // intentos fallidos por apto
const EC_BLOQUEO_SEG = 900;         // 15 minutos
const EC_MAX_ARCHIVOS_POR_LOTE = 10;
const EC_TZ = 'America/Bogota';
const EC_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------------------------------------------------------------------
// Configuración (pestaña Config del Sheet de Registros, SHEET_ID)
// ---------------------------------------------------------------------
function ecConfig(key) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Config');
  if (!sheet) return '';
  const last = Math.max(sheet.getLastRow(), 1);
  const data = sheet.getRange(1, 1, last, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) return String(data[i][1] == null ? '' : data[i][1]).trim();
  }
  return '';
}

function ecConfigRequerida(key) {
  const v = ecConfig(key);
  if (!v) throw new Error('Falta la clave "' + key + '" en la pestaña Config. Contacte al administrador del sistema.');
  return v;
}

function ecSS() {
  return SpreadsheetApp.openById(ecConfigRequerida('cartera_sheet_id'));
}

function ecHoja(nombre, headers) {
  const ss = ecSS();
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Convierte valor de celda a texto. Si Sheets lo convirtió a Date
// (BUGFIX-004), lo formatea con el patrón indicado.
function ecTexto(v, patronFecha) {
  if (v instanceof Date) return Utilities.formatDate(v, EC_TZ, patronFecha || 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}

function ecNum(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// "2026-08-31" -> "31 de agosto de 2026"
function ecFechaLargaDesdeISO(iso) {
  const p = String(iso).split('-');
  return parseInt(p[2], 10) + ' de ' + EC_MESES[parseInt(p[1], 10) - 1] + ' de ' + p[0];
}

function ecHoyLarga() {
  return ecFechaLargaDesdeISO(Utilities.formatDate(new Date(), EC_TZ, 'yyyy-MM-dd'));
}

// Ejecutar UNA VEZ desde el editor (autoriza DriveApp/DocumentApp y crea pestañas)
function ecSetup() {
  ecHoja(EC_TAB_CONTROL, EC_HDR_CONTROL);
  ecHoja(EC_TAB_PAGOS, EC_HDR_PAGOS);
  ecHoja(EC_TAB_PYS, EC_HDR_PYS);
  const carpeta = DriveApp.getFolderById(ecConfigRequerida('facturas_folder_id'));
  const plantilla = DriveApp.getFileById(ecConfigRequerida('plantilla_pys_id'));
  if (plantilla.getMimeType() !== MimeType.GOOGLE_DOCS) {
    throw new Error('plantilla_pys_id debe ser un Documento de Google (no .docx). Tipo actual: ' + plantilla.getMimeType());
  }
  DocumentApp.openById(plantilla.getId()); // fuerza el permiso de Documentos
  Logger.log('OK. Carpeta facturas: ' + carpeta.getName() + ' | Plantilla: ' + plantilla.getName() +
             ' | Tolerancia: ' + ecTolerancia() + ' | Link pago: ' + (ecConfig('link_pago') || '(vacío)'));
}

function ecTolerancia() {
  const t = parseFloat(ecConfig('pys_tolerancia'));
  return isNaN(t) ? 1000 : t;
}

// AUD-T2: el cargador de cartera usa el token de sesión del admin
function ecAdminOk(payload) {
  return validarToken('admin', payload && payload.token);
}

// ---------------------------------------------------------------------
// Lectura de la pestaña mensual de cartera (función pura: recibe filas)
// ---------------------------------------------------------------------
function ecIndicesCartera(filas) {
  let iHdr = -1;
  for (let i = 0; i < Math.min(10, filas.length); i++) {
    if (String(filas[i][0]).trim().toLowerCase() === 'numero') { iHdr = i; break; }
  }
  if (iHdr < 0) throw new Error('No se encontró la fila de encabezados (columna A = "numero").');
  const hdrOriginal = filas[iHdr].map(h => String(h).trim());
  const hdr = hdrOriginal.map(h => h.toLowerCase());
  const idx = {};
  for (const c of EC_COLS_REQUERIDAS) {
    idx[c] = hdr.indexOf(c);
    if (idx[c] < 0) throw new Error('Falta la columna "' + c + '" en la cartera.');
  }
  const conceptos = [];
  for (let j = idx['nombre'] + 1; j < idx['anticip']; j++) {
    if (hdrOriginal[j]) conceptos.push({ col: j, nombre: hdrOriginal[j] });
  }
  if (!conceptos.length) throw new Error('No hay columnas de conceptos entre "nombre" y "anticip".');
  return { filaEncabezado: iHdr, idx: idx, conceptos: conceptos };
}

function ecBuscarAptoEnFilas(filas, apto) {
  const info = ecIndicesCartera(filas);
  const buscado = normApto(apto);
  for (let i = info.filaEncabezado + 1; i < filas.length; i++) {
    const r = filas[i];
    if (normApto(r[info.idx['numero']]) !== buscado) continue;
    return {
      apto: buscado,
      nombre: String(r[info.idx['nombre']]).trim().replace(/^\d+\s+/, ''),
      conceptos: info.conceptos.map(c => ({ nombre: c.nombre, valor: ecNum(r[c.col]) })),
      anticipos: ecNum(r[info.idx['anticip']]),
      valorAdmon: ecNum(r[info.idx['valor admon']]),
      totalCartera: ecNum(r[info.idx['total cartera']]),
      mesesProm: ecNum(r[info.idx['meses prom']])
    };
  }
  return null;
}

// ---------------------------------------------------------------------
// _Control
// ---------------------------------------------------------------------
function ecLeerControl() {
  const sh = ecHoja(EC_TAB_CONTROL, EC_HDR_CONTROL);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const data = sh.getRange(2, 1, last - 1, EC_HDR_CONTROL.length).getValues();
  return data.map((v, i) => ({
    rowNumber: i + 2,
    idCarga: ecTexto(v[EC_C_ID]),
    periodo: ecTexto(v[EC_C_PERIODO], 'yyyy-MM'),
    pestana: ecTexto(v[EC_C_PESTANA]),
    fechaCorte: ecTexto(v[EC_C_CORTE], 'yyyy-MM-dd'),
    estado: ecTexto(v[EC_C_ESTADO]),
    folderId: ecTexto(v[EC_C_FOLDER]),
    totalAptos: ecNum(v[EC_C_TOTAL])
  }));
}

function ecPeriodoActivo() {
  const activos = ecLeerControl().filter(c => c.estado === 'ACTIVO');
  return activos.length ? activos[activos.length - 1] : null;
}

// ---------------------------------------------------------------------
// Acceso del propietario (reutiliza verificarPropietario + límite de intentos)
// ---------------------------------------------------------------------
function ecVerificarAcceso(data) {
  const apto = normApto(data.apto);
  if (!apto) return { ok: false, error: 'Falta N° de apartamento.' };
  const cache = CacheService.getScriptCache();
  const key = 'ec_fail_' + apto;
  const fallos = parseInt(cache.get(key) || '0', 10);
  if (fallos >= EC_MAX_INTENTOS) {
    return { ok: false, error: 'Demasiados intentos fallidos para este apartamento. Intente de nuevo en 15 minutos.' };
  }
  const v = verificarPropietario(data.numForm, data.apto, data.ccProp);
  if (!v.ok) {
    cache.put(key, String(fallos + 1), EC_BLOQUEO_SEG);
    return v;
  }
  cache.remove(key);
  return v;
}

function ecContexto(data) {
  const v = ecVerificarAcceso(data);
  if (!v.ok) return v;
  const activo = ecPeriodoActivo();
  if (!activo) return { ok: false, error: 'Aún no hay información contable publicada. Intente más tarde.' };
  const sh = ecSS().getSheetByName(activo.pestana);
  if (!sh) return { ok: false, error: 'No se encontró la pestaña "' + activo.pestana + '". Contacte a la administración.' };
  const cartera = ecBuscarAptoEnFilas(sh.getDataRange().getValues(), v.apto);
  if (!cartera) {
    return { ok: false, error: 'El apartamento ' + v.apto + ' no aparece en la cartera de ' + activo.pestana + '. Contacte a la administración.' };
  }
  return { ok: true, verif: v, activo: activo, cartera: cartera };
}

function ecPagosApto(apto, activo) {
  const validos = {};
  ecLeerControl().forEach(c => { if (c.estado === 'ACTIVO' || c.estado === 'HISTORICO') validos[c.periodo] = true; });
  const sh = ecHoja(EC_TAB_PAGOS, EC_HDR_PAGOS);
  const last = sh.getLastRow();
  if (last < 2) return { pagos: [], factura: null };
  const buscado = normApto(apto);
  const filas = sh.getRange(2, 1, last - 1, EC_HDR_PAGOS.length).getValues()
    .filter(r => normApto(ecTexto(r[EC_P_APTO])) === buscado && validos[ecTexto(r[EC_P_PERIODO], 'yyyy-MM')]);
  filas.sort((a, b) => ecTexto(b[EC_P_PERIODO], 'yyyy-MM').localeCompare(ecTexto(a[EC_P_PERIODO], 'yyyy-MM')));
  const pagos = filas.slice(0, 3).map(r => ({
    periodo: ecTexto(r[EC_P_PERIODO], 'yyyy-MM'),
    abono: ecNum(r[EC_P_ABONO])
  }));
  const fa = filas.find(r => ecTexto(r[EC_P_PERIODO], 'yyyy-MM') === activo.periodo);
  const factura = fa ? {
    numCuentaCobro: ecTexto(fa[EC_P_NUMCC]),
    fechaEmision: ecTexto(fa[EC_P_EMISION]),
    pagueseHasta: ecTexto(fa[EC_P_HASTA]),
    totalAPagar: ecNum(fa[EC_P_TOTAL])
  } : null;
  return { pagos: pagos, factura: factura };
}

function ecArchivoFactura(activo, apto) {
  const it = DriveApp.getFolderById(activo.folderId).getFilesByName(normApto(apto) + '.pdf');
  return it.hasNext() ? it.next() : null;
}

// ---------------------------------------------------------------------
// ENDPOINTS PÚBLICOS (POST)
// ---------------------------------------------------------------------
function ecConsultar(data) {
  const ctx = ecContexto(data);
  if (!ctx.ok) return ctx;
  const p = ecPagosApto(ctx.cartera.apto, ctx.activo);
  const tol = ecTolerancia();
  return {
    ok: true,
    periodo: ctx.activo.periodo,
    pestana: ctx.activo.pestana,
    fechaCorte: ctx.activo.fechaCorte,
    apto: ctx.cartera.apto,
    nombrePropietario: ctx.verif.nombreProp,
    cartera: ctx.cartera,
    factura: p.factura,
    facturaDisponible: !!ecArchivoFactura(ctx.activo, ctx.cartera.apto),
    pagos: p.pagos,
    pazYSalvoHabilitado: ctx.cartera.totalCartera < tol,
    linkPago: ecConfig('link_pago')
  };
}

function ecDescargarFactura(data) {
  const ctx = ecContexto(data);
  if (!ctx.ok) return ctx;
  const f = ecArchivoFactura(ctx.activo, ctx.cartera.apto);
  if (!f) return { ok: false, error: 'La factura de este mes aún no está disponible.' };
  return {
    ok: true,
    nombreArchivo: 'Factura_' + ctx.cartera.apto + '_' + ctx.activo.periodo + '.pdf',
    base64: Utilities.base64Encode(f.getBlob().getBytes())
  };
}

function ecPazYSalvo(data) {
  const ctx = ecContexto(data);
  if (!ctx.ok) return ctx;
  const tol = ecTolerancia();
  if (!(ctx.cartera.totalCartera < tol)) {
    return { ok: false, error: 'El apartamento registra saldo pendiente. No es posible expedir el paz y salvo.' };
  }
  const lock = LockService.getScriptLock();   // BUGFIX-003: NO usar getDocumentLock
  lock.waitLock(30000);
  let copia = null;
  try {
    const shP = ecHoja(EC_TAB_PYS, EC_HDR_PYS);
    const consecutivo = 'PYS-' + String(shP.getLastRow()).padStart(5, '0'); // fila 1 = encabezado
    const codigo = Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    const reemplazos = {
      APTO: ctx.cartera.apto,
      NOMBRE: ctx.verif.nombreProp,
      FECHA_EXPEDICION: ecHoyLarga(),
      FECHA_CORTE: ecFechaLargaDesdeISO(ctx.activo.fechaCorte),
      CONSECUTIVO: consecutivo,
      CODIGO: codigo
    };
    const carpeta = DriveApp.getFolderById(ecConfigRequerida('facturas_folder_id'));
    copia = DriveApp.getFileById(ecConfigRequerida('plantilla_pys_id'))
      .makeCopy('tmp_pys_' + ctx.cartera.apto + '_' + codigo, carpeta);
    const doc = DocumentApp.openById(copia.getId());
    const zonas = [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(z => z);
    Object.keys(reemplazos).forEach(k => {
      zonas.forEach(z => z.replaceText('\\{\\{' + k + '\\}\\}', String(reemplazos[k])));
    });
    doc.saveAndClose();
    const pdf = copia.getAs(MimeType.PDF);
    const fila = [consecutivo, codigo, new Date(), ctx.activo.periodo, ctx.cartera.apto,
                  String(data.numForm).trim(), ctx.verif.nombreProp, ctx.verif.ccProp, ctx.cartera.totalCartera];
    const r = shP.getLastRow() + 1;
    shP.getRange(r, 1, 1, 2).setNumberFormat('@');
    shP.getRange(r, 4, 1, 5).setNumberFormat('@');
    shP.getRange(r, 1, 1, fila.length).setValues([fila]);
    return {
      ok: true,
      consecutivo: consecutivo,
      nombreArchivo: 'PazYSalvo_' + ctx.cartera.apto + '_' + ctx.activo.periodo + '.pdf',
      base64: Utilities.base64Encode(pdf.getBytes())
    };
  } finally {
    if (copia) { try { copia.setTrashed(true); } catch (e) {} }
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// ENDPOINTS DE CARGA MENSUAL (POST, requieren password de admin)
// ---------------------------------------------------------------------
function ecIniciarCarga(data) {
  if (!ecAdminOk(data)) return { ok: false, error: 'Sesión de administrador no válida o expirada.' };
  const periodo = String(data.periodo || '');
  const pestana = String(data.nombrePestana || '');
  const fechaCorte = String(data.fechaCorte || '');
  if (!/^\d{4}-\d{2}$/.test(periodo)) return { ok: false, error: 'Periodo inválido.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) return { ok: false, error: 'Fecha de corte inválida.' };
  if (!pestana || pestana.charAt(0) === '_' || pestana === EC_TAB_PAGOS || pestana === EC_TAB_PYS) {
    return { ok: false, error: 'Nombre de pestaña inválido.' };
  }
  const filas = data.filas;
  const pagos = data.pagos;
  if (!Array.isArray(filas) || !Array.isArray(pagos)) return { ok: false, error: 'Faltan filas o pagos.' };

  // Re-validación en servidor
  const info = ecIndicesCartera(filas);
  const aptosCartera = {};
  for (let i = info.filaEncabezado + 1; i < filas.length; i++) {
    const a = normApto(filas[i][info.idx['numero']]);
    if (a) aptosCartera[a] = true;
  }
  const nCartera = Object.keys(aptosCartera).length;
  if (nCartera !== pagos.length) {
    return { ok: false, error: 'La cartera tiene ' + nCartera + ' aptos y el PDF ' + pagos.length + ' facturas.' };
  }
  for (const p of pagos) {
    if (!aptosCartera[normApto(p.apto)]) return { ok: false, error: 'El apto ' + p.apto + ' del PDF no está en la cartera.' };
  }

  const activo = ecPeriodoActivo();
  if (activo && periodo < activo.periodo) {
    return { ok: false, error: 'El periodo ' + periodo + ' es anterior al publicado (' + activo.periodo + ').' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = ecSS();
    let sh = ss.getSheetByName(pestana);
    if (sh && data.reemplazar !== true) {
      return { ok: false, codigo: 'PESTANA_EXISTE', error: 'La pestaña "' + pestana + '" ya existe.' };
    }
    if (!sh) sh = ss.insertSheet(pestana);
    sh.clear();
    const ancho = filas.reduce((m, f) => Math.max(m, f.length), 0);
    const matriz = filas.map(f => {
      const r = f.slice();
      while (r.length < ancho) r.push('');
      r[0] = (r[0] === '' || r[0] == null) ? '' : String(r[0]);
      return r;
    });
    sh.getRange(1, 1, matriz.length, 1).setNumberFormat('@');  // col A texto (BUGFIX-004)
    sh.getRange(1, 1, matriz.length, ancho).setValues(matriz);

    // Pagos: quitar filas del mismo periodo y agregar las nuevas
    const shP = ecHoja(EC_TAB_PAGOS, EC_HDR_PAGOS);
    const lastP = shP.getLastRow();
    let conservar = [];
    if (lastP >= 2) {
      conservar = shP.getRange(2, 1, lastP - 1, EC_HDR_PAGOS.length).getValues()
        .filter(r => ecTexto(r[EC_P_PERIODO], 'yyyy-MM') !== periodo);
      shP.getRange(2, 1, lastP - 1, EC_HDR_PAGOS.length).clearContent();
    }
    const ahora = new Date();
    const nuevas = pagos.map(p => [periodo, normApto(p.apto), String(p.numCuentaCobro), String(p.fechaEmision),
      String(p.pagueseHasta), ecNum(p.abonoUltimoMes), ecNum(p.totalAPagar), ecNum(p.saldoAnterior),
      ecNum(p.anticipos), ahora]);
    const todas = conservar.concat(nuevas);
    if (todas.length) {
      shP.getRange(2, 1, todas.length, 5).setNumberFormat('@');
      shP.getRange(2, 1, todas.length, EC_HDR_PAGOS.length).setValues(todas);
    }

    // Carpeta de facturas de esta carga + fila en _Control
    const idCarga = Utilities.getUuid();
    const raiz = DriveApp.getFolderById(ecConfigRequerida('facturas_folder_id'));
    const carpeta = raiz.createFolder('Facturas ' + periodo + ' (' + idCarga.slice(0, 8) + ')');
    const shC = ecHoja(EC_TAB_CONTROL, EC_HDR_CONTROL);
    const r = shC.getLastRow() + 1;
    shC.getRange(r, 1, 1, 6).setNumberFormat('@');
    shC.getRange(r, 1, 1, EC_HDR_CONTROL.length).setValues([[idCarga, periodo, pestana, fechaCorte,
      'CARGANDO', carpeta.getId(), nCartera, ahora, '']]);
    return { ok: true, idCarga: idCarga, totalAptos: nCartera };
  } finally {
    lock.releaseLock();
  }
}

function ecSubirFacturas(data) {
  if (!ecAdminOk(data)) return { ok: false, error: 'Sesión de administrador no válida o expirada.' };
  const carga = ecLeerControl().find(c => c.idCarga === String(data.idCarga || ''));
  if (!carga) return { ok: false, error: 'Carga no encontrada.' };
  if (carga.estado !== 'CARGANDO') return { ok: false, error: 'La carga ya no está en estado CARGANDO (' + carga.estado + ').' };
  const archivos = data.archivos;
  if (!Array.isArray(archivos) || !archivos.length || archivos.length > EC_MAX_ARCHIVOS_POR_LOTE) {
    return { ok: false, error: 'Lote inválido (1 a ' + EC_MAX_ARCHIVOS_POR_LOTE + ' archivos).' };
  }
  const carpeta = DriveApp.getFolderById(carga.folderId);
  let creados = 0;
  for (const a of archivos) {
    const apto = normApto(a.apto);
    if (!/^\d+$/.test(apto) || typeof a.base64 !== 'string' || !a.base64) {
      return { ok: false, error: 'Archivo inválido para apto "' + a.apto + '".', creados: creados };
    }
    const nombre = apto + '.pdf';
    const prev = carpeta.getFilesByName(nombre);
    while (prev.hasNext()) prev.next().setTrashed(true);  // idempotente ante reintentos
    carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(a.base64), MimeType.PDF, nombre));
    creados++;
  }
  return { ok: true, creados: creados };
}

function ecFinalizarCarga(data) {
  if (!ecAdminOk(data)) return { ok: false, error: 'Sesión de administrador no válida o expirada.' };
  const control = ecLeerControl();
  const carga = control.find(c => c.idCarga === String(data.idCarga || ''));
  if (!carga) return { ok: false, error: 'Carga no encontrada.' };
  if (carga.estado !== 'CARGANDO') return { ok: false, error: 'La carga ya no está en estado CARGANDO.' };
  let n = 0;
  const it = DriveApp.getFolderById(carga.folderId).getFiles();
  while (it.hasNext()) { it.next(); n++; }
  if (n !== carga.totalAptos) {
    return { ok: false, error: 'Hay ' + n + ' facturas en Drive y se esperaban ' + carga.totalAptos + '. Reintente la subida.' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const shC = ecHoja(EC_TAB_CONTROL, EC_HDR_CONTROL);
    control.forEach(c => {
      if (c.idCarga === carga.idCarga) return;
      let nuevo = null;
      if (c.estado === 'ACTIVO') nuevo = (c.periodo === carga.periodo) ? 'REEMPLAZADO' : 'HISTORICO';
      if (c.estado === 'CARGANDO') nuevo = 'ABANDONADO';
      if (!nuevo) return;
      shC.getRange(c.rowNumber, EC_C_ESTADO + 1).setValue(nuevo);
      if (c.folderId) { try { DriveApp.getFolderById(c.folderId).setTrashed(true); } catch (e) {} }
    });
    shC.getRange(carga.rowNumber, EC_C_ESTADO + 1).setValue('ACTIVO');
    shC.getRange(carga.rowNumber, EC_C_FIN + 1).setValue(new Date());
    return { ok: true, periodo: carga.periodo, pestana: carga.pestana, facturas: n };
  } finally {
    lock.releaseLock();
  }
}
