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
// doGet: lookup / nextId / lookupMatApto / lookupMatParq
// ---------------------------------------------------------------------
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'nextId') {
      return jsonOut({ ok: true, nextId: getNextFormId() });
    }
    if (action === 'lookup') {
      const numForm = String(e.parameter.numForm || '').trim();
      const apto = String(e.parameter.apto || '').trim();
      const row = findRowByNumFormAndApto(numForm, apto);
      if (!row) {
        return jsonOut({ ok: false, error: 'No se encontró ningún registro con ese N° de formulario y N° de apartamento. Verifica los datos e inténtalo de nuevo.' });
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
    if (action === 'reservarMudanza') {
      return jsonOut(reservarMudanza(payload));
    }
    if (action === 'cancelarMudanza') {
      return jsonOut(cancelarMudanza(payload));
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
function submitRecord(data) {
  // Validaciones mínimas del lado servidor
  const apto = String(data.apto || '').trim();
  if (!apto) return { ok: false, error: 'Falta N° de apartamento.' };
  const diligencia = String(data.diligencia || '').trim();
  if (!['Propietario','Arrendatario','Tenedor / Otro'].includes(diligencia)) {
    return { ok: false, error: 'Diligencia como debe ser Propietario, Arrendatario o Tenedor / Otro.' };
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

  if (editMode) {
    // Modo edición: verificar que numForm+apto coincidan con una fila existente
    const found = findRowByNumFormAndApto(submittedNumForm, apto);
    if (!found) {
      return { ok: false, error: 'N° de formulario o N° de apartamento no coinciden con un registro existente. No se puede editar.' };
    }
    targetRow = found.rowNumber;
    assignedNumForm = submittedNumForm;
    fechaRegistroOriginal = found.values[COL_FECHA_REG];
  } else {
    // Modo creación: validar que NO exista ya un registro con ese N° Apto
    const existing = findRowByApto(apto);
    if (existing) {
      return { ok: false, error: 'Ya existe un registro para el apartamento ' + apto + '. Tu N° de formulario es ' + existing.values[COL_NUM_FORM] + '. Usa la opción "EDITAR MI REGISTRO" para modificarlo.' };
    }
    // Buscar siguiente fila vacía
    const last = sheet.getLastRow();
    targetRow = Math.max(last + 1, HEADER_ROW + 1);
    assignedNumForm = getNextFormId();
  }

  // Construir el array de valores
  const row = buildRowFromPayload(data, assignedNumForm, fechaRegistroOriginal);
  sheet.getRange(targetRow, 1, 1, NUM_COLS).setValues([row]);

  return {
    ok: true,
    numForm: assignedNumForm,
    apto: apto,
    editMode: editMode,
    rowNumber: targetRow,
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

  return v;
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
  for (const sheetName of [MATRICULAS_TORRE_3, MATRICULAS_TORRE_1]) {
    const ss = SpreadsheetApp.openById(MATRICULAS_SHEET_ID);
    const sh = ss.getSheetByName(sheetName);
    if (!sh) continue;
    const last = sh.getLastRow();
    if (last < 4) continue;
    const data = sh.getRange(4, 1, last - 3, 2).getValues();
    const fuente = sheetName === MATRICULAS_TORRE_3 ? 'torre3' : 'torre1';
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
const MUDANZAS_NUM_COLS       = 19;
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
const COL_MUD_HASH     = 18; // S

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function normalizarCC(cc) {
  return String(cc || '').replace(/[^0-9]/g, '').trim();
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
  if (diligencia !== 'Propietario' && diligencia !== 'Tenedor / Otro' && diligencia !== 'Inmobiliaria') {
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
    const reservado = reservas.find(r => r.fecha === s.fecha && r.horaInicio === s.horaInicio);
    const muyPronto = s.fecha < minFechaStr;
    return {
      fecha: s.fecha,
      horaInicio: s.horaInicio,
      horaFin: s.horaFin,
      disponible: !reservado && !muyPronto,
      reservadoPor: reservado ? reservado.id : null
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
  if (!['Salida', 'Ingreso'].includes(tipoMudanza)) {
    return { ok: false, error: 'Tipo de mudanza inválido. Debe ser Salida o Ingreso.' };
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

    const last = sheet.getLastRow();
    const targetRow = Math.max(last + 1, MUDANZAS_HEADER_ROW + 1);
    sheet.getRange(targetRow, 1, 1, MUDANZAS_NUM_COLS).setValues([row]);

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
// Emails
// ---------------------------------------------------------------------
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
  MailApp.sendEmail(MUDANZAS_EMAIL_ADMIN, subject, body);
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
  MailApp.sendEmail(to, subject, body);
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
  MailApp.sendEmail(MUDANZAS_EMAIL_ADMIN, subject, body);
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
  MailApp.sendEmail(to, subject, body);
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
  password = String(password || '');
  const stored = adminLeerContrasena();
  if (!stored) {
    return { ok: false, error: 'No se encontro la contrasena de administrador en la pestana Config del Sheet. Contacte al administrador del sistema.' };
  }
  if (password === stored) {
    return { ok: true, message: 'Login correcto' };
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
  const currentRow = sheet.getRange(targetRow, 1, 1, NUM_COLS).getValues()[0];
  const newRow = currentRow.slice();

  // Helper para aplicar campo solo si viene en el payload
  function set(idx, val) {
    if (val !== undefined) newRow[idx] = val;
  }
  function setStr(idx, val) {
    if (val !== undefined) newRow[idx] = String(val || '');
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
  password = String(password || '');
  const stored = vigilanteLeerContrasena();
  if (!stored) {
    return { ok: false, error: 'No se encontro la contrasena de vigilancia en Config!B2.' };
  }
  if (password === stored) {
    return { ok: true, message: 'Login correcto' };
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
      const resultado = {
        numForm: numForm,
        apto: apto,
        diligencia: diligencia,
        nombreProp: nombre,
        ccProp: cc,
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
        firmaNom: String(row[139] || ''),
        firmaCC: String(row[140] || ''),
        rowNumber: HEADER_ROW + 1 + i
      };
      // Residentes (4): solo nombre y CC
      for (let r = 0; r < 4; r++) {
        const base = 29 + r * 5;
        const rn = String(row[base] || '');
        if (rn) {
          resultado.residentes.push({
            nombre: rn,
            cc: String(row[base + 1] || ''),
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
    const horaInicio = String(row[7] || '');
    const horaFin = String(row[8] || '');
    const nombre = String(row[9] || '');
    const estado = String(row[17] || '');
    const realizada = String(row[19] || ''); // T
    const fechaCheck = String(row[20] || ''); // U
    const vigilante = String(row[21] || ''); // V

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
  if (!placa || placa.length < 1) {
    return { ok: false, error: 'Ingrese la placa (o parte de ella)' };
  }
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) return { ok: false, error: 'Sheet no encontrado' };
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return { ok: true, resultados: [] };

  const data = sheet.getRange(HEADER_ROW + 1, 1, last - HEADER_ROW, NUM_COLS).getValues();
  const resultados = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const numForm = String(row[COL_NUM_FORM] || '');
    const apto = String(row[COL_APTO] || '');
    const diligencia = String(row[4] || '');
    const nombreProp = String(row[5] || '');
    const ccProp = String(row[6] || '');

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
        numForm: numForm,
        apto: apto,
        diligencia: diligencia,
        nombreProp: nombreProp,
        ccProp: ccProp,
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

  const obj = rowToObject(row.values);
  const nombresResidentes = [];

  // Slots de residentes: v[29..48] (4 residentes x 5 cols)
  for (let i = 0; i < 4; i++) {
    const base = 29 + i * 5;
    const nombre = String(row.values[base] || '').trim();
    if (nombre) nombresResidentes.push(nombre);
  }

  return {
    ok: true,
    apto: apto,
    aptoExiste: true,
    numForm: String(obj.numForm || ''),
    hayResidentes: nombresResidentes.length > 0,
    numResidentes: nombresResidentes.length,
    nombresResidentes: nombresResidentes,
    propietario: String(obj.nombreProp || '')
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
        return { ok: false, error: 'El apartamento ya tiene residentes registrados. Use el botón "Editar mi registro" del propietario o coloque su cédula para editar.' };
      }
      if (slotAsignado === -1) slotAsignado = i + 1;
    }

    const residentes = Array.isArray(data.residentes) ? data.residentes : [];
    if (residentes.length === 0) {
      return { ok: false, error: 'Debe registrar al menos un residente.' };
    }
    if (residentes.length > 4) {
      return { ok: false, error: 'Máximo 4 residentes por apartamento.' };
    }

    // Construir payload compatible con submitRecord (modo edición)
    // Mantiene los datos del propietario intactos
    const payload = {
      apto: apto,
      numForm: String(row.values[COL_NUM_FORM] || ''),
      diligencia: String(row.values[4] || ''),
      nombreProp: String(row.values[5] || ''),
      ccProp: String(row.values[6] || ''),
      correoProp: String(row.values[7] || ''),
      celProp: String(row.values[8] || ''),
      telFijoProp: String(row.values[9] || ''),
      parq1Celda: String(row.values[10] || ''),
      parq1Mat: String(row.values[11] || ''),
      parq2Celda: String(row.values[12] || ''),
      parq2Mat: String(row.values[13] || ''),
      matriculaApto: String(row.values[14] || ''),
      requiereRevision: String(row.values[15] || '') === 'Sí',
      observMatriculas: String(row.values[16] || ''),
      nombreArr: String(row.values[17] || ''),
      ccArr: String(row.values[18] || ''),
      correoArr: String(row.values[19] || ''),
      celArr: String(row.values[20] || ''),
      parqTerNom: String(row.values[21] || ''),
      parqTerApto: String(row.values[22] || ''),
      parqTerCel: String(row.values[23] || ''),
      inmobRazon: String(row.values[24] || ''),
      inmobNit: String(row.values[25] || ''),
      inmobContacto: String(row.values[26] || ''),
      inmobTel: String(row.values[27] || ''),
      inmobCorreo: String(row.values[28] || ''),
      residentes: residentes,
      menores: Array.isArray(data.menores) ? data.menores : [],
      vehiculos: Array.isArray(data.vehiculos) ? data.vehiculos : [],
      motos: Array.isArray(data.motos) ? data.motos : [],
      bicis: Array.isArray(data.bicis) ? data.bicis : [],
      dispositivos: [],
      mascotas: Array.isArray(data.mascotas) ? data.mascotas : [],
      contactos: Array.isArray(data.contactos) ? data.contactos : [],
      autorAcesso: String(row.values[136] || '') === 'Sí',
      autDatos: true,
      autImagenes: false,
      firmaNom: String(row.values[139] || ''),
      firmaCC: String(row.values[140] || ''),
      firmaFecha: String(row.values[141] || '')
    };

    const result = submitRecord(payload);
    if (result.ok) {
      return {
        ok: true,
        numForm: result.editMode ? String(row.values[COL_NUM_FORM] || '') : (result.numForm || ''),
        slotAsignado: slotAsignado,
        message: 'Registro exitoso.'
      };
    }
    return result;
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

    // Construir payload para submitRecord manteniendo intactos los demás residentes
    const payload = {
      apto: apto,
      numForm: String(row.values[COL_NUM_FORM] || ''),
      diligencia: String(row.values[4] || ''),
      nombreProp: String(row.values[5] || ''),
      ccProp: String(row.values[6] || ''),
      correoProp: String(row.values[7] || ''),
      celProp: String(row.values[8] || ''),
      telFijoProp: String(row.values[9] || ''),
      parq1Celda: String(row.values[10] || ''),
      parq1Mat: String(row.values[11] || ''),
      parq2Celda: String(row.values[12] || ''),
      parq2Mat: String(row.values[13] || ''),
      matriculaApto: String(row.values[14] || ''),
      requiereRevision: String(row.values[15] || '') === 'Sí',
      observMatriculas: String(row.values[16] || ''),
      nombreArr: String(row.values[17] || ''),
      ccArr: String(row.values[18] || ''),
      correoArr: String(row.values[19] || ''),
      celArr: String(row.values[20] || ''),
      parqTerNom: String(row.values[21] || ''),
      parqTerApto: String(row.values[22] || ''),
      parqTerCel: String(row.values[23] || ''),
      inmobRazon: String(row.values[24] || ''),
      inmobNit: String(row.values[25] || ''),
      inmobContacto: String(row.values[26] || ''),
      inmobTel: String(row.values[27] || ''),
      inmobCorreo: String(row.values[28] || ''),
      // Preservar los otros residentes, solo actualizar el slot N
      residentes: construirResidentesParaActualizar(row.values, slot, nuevosResidentes),
      menores: Array.isArray(datos.menores) ? datos.menores : construirMenoresActuales(row.values),
      vehiculos: validarYAplicarSlotsCompartidos(row.values, 'vehiculos', 61, 6, 2, datos.vehiculos),
      motos: validarYAplicarSlotsCompartidos(row.values, 'motos', 73, 6, 2, datos.motos),
      bicis: validarYAplicarSlotsCompartidos(row.values, 'bicis', 85, 4, 2, datos.bicis),
      dispositivos: [],
      mascotas: validarYAplicarSlotsCompartidos(row.values, 'mascotas', 110, 10, 2, datos.mascotas),
      contactos: validarYAplicarSlotsCompartidos(row.values, 'contactos', 130, 3, 2, datos.contactos),
      autorAcesso: String(row.values[136] || '') === 'Sí',
      autDatos: true,
      autImagenes: false,
      firmaNom: String(row.values[139] || ''),
      firmaCC: String(row.values[140] || ''),
      firmaFecha: String(row.values[141] || '')
    };

    const result = submitRecord(payload);
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

    // Limpiar v[110..135] (índices 0-based) = columnas DG..EF (1-based 110..135)
    // DG (110) a EF (135) = 26 columnas: mascotas(20) + contactos(6)
    sheet.getRange(rowNumber, 110, 1, 26).clearContent();

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