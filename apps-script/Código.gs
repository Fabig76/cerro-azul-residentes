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

  // Validar datos minimos
  const apto = String(data.apto || '').trim();
  if (!apto) return { ok: false, error: 'Falta N° de apartamento' };
  const nombre = String(data.nombreProp || '').trim();
  if (!nombre) return { ok: false, error: 'Falta nombre del propietario' };
  const cc = String(data.ccProp || '').trim();
  if (!cc) return { ok: false, error: 'Falta CC del propietario' };
  const correo = String(data.correoProp || '').trim();
  if (!correo || correo.indexOf('@') === -1) return { ok: false, error: 'Correo del propietario invalido' };

  // Reconstruir la fila con los datos actualizados
  // Primero leer la fila actual
  const currentRow = sheet.getRange(targetRow, 1, 1, NUM_COLS).getValues()[0];
  // Mezclar: usar los valores actuales, pero sobrescribir con los datos nuevos si vienen
  const newRow = currentRow.slice();
  newRow[COL_APTO] = apto;
  newRow[4] = String(data.diligencia || currentRow[4] || '');  // diligencia
  newRow[5] = nombre;
  newRow[6] = cc;
  newRow[7] = correo.toLowerCase();
  newRow[8] = String(data.celProp || '');
  newRow[9] = String(data.telFijoProp || '');
  newRow[10] = String(data.parq1Celda || '');
  newRow[11] = String(data.parq1Mat || '');
  newRow[12] = String(data.parq2Celda || '');
  newRow[13] = String(data.parq2Mat || '');
  newRow[14] = String(data.matriculaApto || '');
  newRow[15] = data.requiereRevision === 'Si' || data.requiereRevision === true ? 'Sí' : 'No';
  newRow[16] = String(data.observMatriculas || '');
  // Actualizar fecha de edicion
  newRow[COL_FECHA_EDIT] = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss');

  // Guardar
  sheet.getRange(targetRow, 1, 1, NUM_COLS).setValues([newRow]);

  // Log de auditoria (basico, en consola por ahora)
  Logger.log('adminGuardar: ' + numForm + ' (fila ' + targetRow + ') a las ' + newRow[COL_FECHA_EDIT]);

  return { ok: true, message: 'Registro actualizado correctamente', rowNumber: targetRow };
}