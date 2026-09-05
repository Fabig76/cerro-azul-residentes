// =====================================================================
// Cerro Azul — Backend Apps Script para el formulario público
// Endpoints:
//   POST (no-CORS) -> action=submit -> crea o actualiza fila
//   GET            -> action=lookup  -> devuelve fila existente por N° Formulario + N° Apto
//   GET            -> action=nextId  -> devuelve el siguiente N° Formulario disponible
// =====================================================================

const SHEET_ID = '16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc';
const SHEET_NAME = 'Registros';
const HEADER_ROW = 1;
const NUM_COLS = 138; // 0..137

// Columna A (index 0) = N° Formulario
const COL_NUM_FORM = 0;
const COL_FECHA_REG = 1;
const COL_FECHA_EDIT = 2;
const COL_APTO = 3;
// Col 137 (última) = Hash Dedupe

// ---------------------------------------------------------------------
// doGet: lookup / nextId
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
      return jsonOut({ ok: true, row: rowToObject(row) });
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
// Convierte el payload del cliente en un array de 138 columnas
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
  v[10]             = String(d.parqueaderos || '').trim();
  v[11]             = String(d.matriculas || '').trim();

  // 2. Arrendatario
  v[12]             = String(d.nombreArr || '').trim();
  v[13]             = String(d.ccArr || '').trim();
  v[14]             = String(d.correoArr || '').trim().toLowerCase();
  v[15]             = String(d.celArr || '').trim();

  // 3. Parqueadero autorizado a tercero
  v[16]             = String(d.parqTerNom || '').trim();
  v[17]             = String(d.parqTerApto || '').trim();
  v[18]             = String(d.parqTerCel || '').trim();

  // 4. Inmobiliaria
  v[19]             = String(d.inmobRazon || '').trim();
  v[20]             = String(d.inmobNit || '').trim();
  v[21]             = String(d.inmobContacto || '').trim();
  v[22]             = String(d.inmobTel || '').trim();
  v[23]             = String(d.inmobCorreo || '').trim().toLowerCase();

  // 5. Residentes (4 filas: cols 24-43)
  const res = Array.isArray(d.residentes) ? d.residentes : [];
  for (let i = 0; i < 4; i++) {
    const r = res[i] || {};
    v[24 + i*5 + 0] = String(r.nombre || '').trim();
    v[24 + i*5 + 1] = String(r.cc || '').trim();
    v[24 + i*5 + 2] = String(r.correo || '').trim().toLowerCase();
    v[24 + i*5 + 3] = String(r.cel || '').trim();
    v[24 + i*5 + 4] = String(r.parent || '').trim();
  }

  // 5.1 Menores (4 filas: cols 44-55)
  const men = Array.isArray(d.menores) ? d.menores : [];
  for (let i = 0; i < 4; i++) {
    const m = men[i] || {};
    v[44 + i*3 + 0] = String(m.nombre || '').trim();
    v[44 + i*3 + 1] = m.edad != null && m.edad !== '' ? String(m.edad) : '';
    v[44 + i*3 + 2] = String(m.parent || '').trim();
  }

  // 6. Vehículos (2: 56-67)
  const veh = Array.isArray(d.vehiculos) ? d.vehiculos : [];
  for (let i = 0; i < 2; i++) {
    const x = veh[i] || {};
    v[56 + i*6 + 0] = String(x.marca || '').trim();
    v[56 + i*6 + 1] = String(x.tipo || '').trim();
    v[56 + i*6 + 2] = String(x.color || '').trim();
    v[56 + i*6 + 3] = String(x.placa || '').trim().toUpperCase();
    v[56 + i*6 + 4] = String(x.modelo || '').trim();
    v[56 + i*6 + 5] = String(x.tag || '').trim();
  }

  // 6. Motos (2: 68-79)
  const mot = Array.isArray(d.motos) ? d.motos : [];
  for (let i = 0; i < 2; i++) {
    const x = mot[i] || {};
    v[68 + i*6 + 0] = String(x.marca || '').trim();
    v[68 + i*6 + 1] = String(x.tipo || '').trim();
    v[68 + i*6 + 2] = String(x.color || '').trim();
    v[68 + i*6 + 3] = String(x.placa || '').trim().toUpperCase();
    v[68 + i*6 + 4] = String(x.modelo || '').trim();
    v[68 + i*6 + 5] = String(x.tag || '').trim();
  }

  // 7. Bicicletas (2: 80-87)
  const bic = Array.isArray(d.bicis) ? d.bicis : [];
  for (let i = 0; i < 2; i++) {
    const b = bic[i] || {};
    v[80 + i*4 + 0] = String(b.marca || '').trim();
    v[80 + i*4 + 1] = String(b.color || '').trim();
    v[80 + i*4 + 2] = String(b.clase || '').trim();
    v[80 + i*4 + 3] = String(b.serial || '').trim();
  }

  // 8. Dispositivos (88-89 = llaveros/tags aut, 90-104 = 3 dispositivos)
  v[88]             = d.llaverosAut != null && d.llaverosAut !== '' ? String(d.llaverosAut) : '';
  v[89]             = d.tagsAut != null && d.tagsAut !== '' ? String(d.tagsAut) : '';
  const disp = Array.isArray(d.dispositivos) ? d.dispositivos : [];
  for (let i = 0; i < 3; i++) {
    const x = disp[i] || {};
    v[90 + i*5 + 0] = String(x.tipo || '').trim();
    v[90 + i*5 + 1] = String(x.codigo || '').trim();
    v[90 + i*5 + 2] = String(x.placa || '').trim().toUpperCase();
    v[90 + i*5 + 3] = String(x.fecha || '').trim();
    v[90 + i*5 + 4] = String(x.recibe || '').trim();
  }

  // 9. Mascotas (2: 105-124)
  const mas = Array.isArray(d.mascotas) ? d.mascotas : [];
  for (let i = 0; i < 2; i++) {
    const m = mas[i] || {};
    v[105 + i*10 + 0] = String(m.tipo || '').trim();
    v[105 + i*10 + 1] = String(m.nombre || '').trim();
    v[105 + i*10 + 2] = String(m.raza || '').trim();
    v[105 + i*10 + 3] = String(m.color || '').trim();
    v[105 + i*10 + 4] = String(m.sexo || '').trim();
    v[105 + i*10 + 5] = String(m.vacuna || '').trim();
    v[105 + i*10 + 6] = m.manejoEspecial === true || String(m.manejoEspecial) === 'true' ? 'Sí' : (m.manejoEspecial === false || String(m.manejoEspecial) === 'false' ? 'No' : '');
    v[105 + i*10 + 7] = String(m.registro || '').trim();
    v[105 + i*10 + 8] = String(m.aseguradora || '').trim();
    v[105 + i*10 + 9] = String(m.poliza || '').trim();
  }

  // 10. Emergencias (2: 125-130)
  const eme = Array.isArray(d.emergencias) ? d.emergencias : [];
  for (let i = 0; i < 2; i++) {
    const e = eme[i] || {};
    v[125 + i*3 + 0] = String(e.nombre || '').trim();
    v[125 + i*3 + 1] = String(e.parent || '').trim();
    v[125 + i*3 + 2] = String(e.tel || '').trim();
  }

  // 11. Autorizaciones + firma
  v[131]            = d.autDatos   ? 'Sí' : 'No';
  v[132]            = d.autMenores ? 'Sí' : 'No';
  v[133]            = d.autCom     ? 'Sí' : 'No';
  v[134]            = String(d.firmaNom || '').trim();
  v[135]            = String(d.firmaCC || '').trim();
  v[136]            = String(d.firmaFecha || today);

  // 137 = Hash Dedupe (sha256 de apto + cc titular)
  const hashInput = (v[COL_APTO] || '') + '|' + (v[6] || '') + '|' + (v[135] || '');
  v[137]            = hashInput ? Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashInput)
                                  .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').slice(0, 16) : '';

  return v;
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

// Convierte una fila (array de 138) en objeto JS para enviar al cliente en modo edición
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
    parqueaderos: String(rowArr[10] || ''),
    matriculas: String(rowArr[11] || ''),
    nombreArr: String(rowArr[12] || ''),
    ccArr: String(rowArr[13] || ''),
    correoArr: String(rowArr[14] || ''),
    celArr: String(rowArr[15] || ''),
    parqTerNom: String(rowArr[16] || ''),
    parqTerApto: String(rowArr[17] || ''),
    parqTerCel: String(rowArr[18] || ''),
    inmobRazon: String(rowArr[19] || ''),
    inmobNit: String(rowArr[20] || ''),
    inmobContacto: String(rowArr[21] || ''),
    inmobTel: String(rowArr[22] || ''),
    inmobCorreo: String(rowArr[23] || ''),
    residentes: [0,1,2,3].map(i => ({
      nombre: String(rowArr[24 + i*5] || ''),
      cc:     String(rowArr[25 + i*5] || ''),
      correo: String(rowArr[26 + i*5] || ''),
      cel:    String(rowArr[27 + i*5] || ''),
      parent: String(rowArr[28 + i*5] || ''),
    })),
    menores: [0,1,2,3].map(i => ({
      nombre: String(rowArr[44 + i*3] || ''),
      edad:   String(rowArr[45 + i*3] || ''),
      parent: String(rowArr[46 + i*3] || ''),
    })),
    vehiculos: [0,1].map(i => ({
      marca: String(rowArr[56 + i*6] || ''),
      tipo:  String(rowArr[57 + i*6] || ''),
      color: String(rowArr[58 + i*6] || ''),
      placa: String(rowArr[59 + i*6] || ''),
      modelo:String(rowArr[60 + i*6] || ''),
      tag:   String(rowArr[61 + i*6] || ''),
    })),
    motos: [0,1].map(i => ({
      marca: String(rowArr[68 + i*6] || ''),
      tipo:  String(rowArr[69 + i*6] || ''),
      color: String(rowArr[70 + i*6] || ''),
      placa: String(rowArr[71 + i*6] || ''),
      modelo:String(rowArr[72 + i*6] || ''),
      tag:   String(rowArr[73 + i*6] || ''),
    })),
    bicis: [0,1].map(i => ({
      marca: String(rowArr[80 + i*4] || ''),
      color: String(rowArr[81 + i*4] || ''),
      clase: String(rowArr[82 + i*4] || ''),
      serial:String(rowArr[83 + i*4] || ''),
    })),
    llaverosAut: String(rowArr[88] || ''),
    tagsAut:     String(rowArr[89] || ''),
    dispositivos: [0,1,2].map(i => ({
      tipo:  String(rowArr[90 + i*5] || ''),
      codigo:String(rowArr[91 + i*5] || ''),
      placa: String(rowArr[92 + i*5] || ''),
      fecha: String(rowArr[93 + i*5] || ''),
      recibe:String(rowArr[94 + i*5] || ''),
    })),
    mascotas: [0,1].map(i => ({
      tipo: String(rowArr[105 + i*10] || ''),
      nombre: String(rowArr[106 + i*10] || ''),
      raza: String(rowArr[107 + i*10] || ''),
      color: String(rowArr[108 + i*10] || ''),
      sexo: String(rowArr[109 + i*10] || ''),
      vacuna: String(rowArr[110 + i*10] || ''),
      manejoEspecial: String(rowArr[111 + i*10] || ''),
      registro: String(rowArr[112 + i*10] || ''),
      aseguradora: String(rowArr[113 + i*10] || ''),
      poliza: String(rowArr[114 + i*10] || ''),
    })),
    emergencias: [0,1].map(i => ({
      nombre: String(rowArr[125 + i*3] || ''),
      parent: String(rowArr[126 + i*3] || ''),
      tel:    String(rowArr[127 + i*3] || ''),
    })),
    autDatos:   String(rowArr[131] || ''),
    autMenores: String(rowArr[132] || ''),
    autCom:     String(rowArr[133] || ''),
    firmaNom:   String(rowArr[134] || ''),
    firmaCC:    String(rowArr[135] || ''),
    firmaFecha: String(rowArr[136] || ''),
  };
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
