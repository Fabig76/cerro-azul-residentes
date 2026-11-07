// Pruebas del backend (apps-script/Codigo.gs): R7 Bitácora + R8 auditoría.
// Sin red y sin Sheets: Codigo.gs real dentro de un vm con un Sheet simulado.
// El caso "CSV real" lee /tmp/sheet_reg.csv si existe (no se copia al repo:
// contiene datos personales) y se salta si no está.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODIGO = fs.readFileSync(path.resolve(__dirname, '../apps-script/Codigo.gs'), 'utf-8');
const CSV_REAL = process.env.REGISTROS_CSV || '/tmp/sheet_reg.csv';
const NUM_COLS = 143;

function parseCSV(t) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  return rows;
}

// Hoja simulada: grid 1-based por filas, con las operaciones que usa Codigo.gs.
function hoja(grid) {
  return {
    grid,
    getLastRow: () => grid.length,
    getMaxRows: () => grid.length + 100,
    appendRow: (vals) => { grid.push(vals.slice()); },
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < nr; i++) { const row = grid[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] ?? ''); out.push(o); }
        return out;
      },
      setValues: (vals) => { vals.forEach((vr, i) => { const k = r - 1 + i; grid[k] = grid[k] || new Array(NUM_COLS).fill(''); vr.forEach((v, j) => { grid[k][c - 1 + j] = v; }); }); },
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) grid[r - 1 + i][c - 1 + j] = ''; },
      setNumberFormat: () => {}
    })
  };
}

let ctx, hojas, correos, logs, opcionesSS;
function crearCtx({ bitacoraRota = false } = {}) {
  correos = []; logs = [];
  const hdr = new Array(NUM_COLS).fill('');
  hojas = { Registros: hoja([hdr]), Torre: hoja([['apto', 'mat']]) };
  opcionesSS = { insertSheetLlamadas: 0 };
  const ss = {
    getSheetByName: (n) => hojas[n] || (/Torre|Parq/.test(n) ? hojas.Torre : null),
    insertSheet: (n) => {
      opcionesSS.insertSheetLlamadas++;
      if (bitacoraRota) throw new Error('insertSheet simulado roto');
      hojas[n] = hoja([]); return hojas[n];
    }
  };
  const cache = {};
  ctx = vm.createContext({
    console,
    SpreadsheetApp: { openById: () => ss },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {}, getProperties: () => ({}) }) },
    Utilities: {
      formatDate: (d, tz, f) => (f === 'yyyy-MM-dd' ? '2026-11-07' : '2026-11-07 10:00:00'),
      computeDigest: () => new Array(32).fill(1), DigestAlgorithm: { SHA_256: 1 }, getUuid: () => 'u'
    },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: (...a) => correos.push(a) },
    GmailApp: { sendEmail: (...a) => correos.push(a) },
    Session: { getScriptTimeZone: () => 'America/Bogota' },
    Logger: { log: m => logs.push(String(m)) }
  });
  vm.runInContext(CODIGO, ctx);
  // Cabecera con los centinelas reales para que verificarEsquema_ pase.
  const cent = vm.runInContext('CABECERAS_CENTINELA', ctx);
  for (const k in cent) hdr[k] = cent[k];
}
const g = (expr) => vm.runInContext(expr, ctx);

// Fila "limpia" sintética (datos inventados) que no viola ningún invariante.
function filaLimpia(n) {
  const v = new Array(NUM_COLS).fill('');
  v[0] = 'CA-' + String(n).padStart(4, '0'); v[1] = '2026-10-01 10:00:00'; v[2] = '2026-10-01 10:00:00';
  v[3] = String(100 + n); v[4] = 'Propietario'; v[5] = 'Persona Ficticia ' + n; v[6] = String(9000000 + n);
  v[7] = 'ficticio' + n + '@ejemplo.test'; v[8] = '300000000' + (n % 10);
  v[136] = 'Sí'; v[137] = 'Sí'; v[138] = 'Sí';
  return v;
}

// Payload válido del formulario público (datos inventados).
function payloadPublico(extra = {}) {
  return Object.assign({
    __origen: 'formulario-publico', apto: '9999', diligencia: 'Propietario',
    nombreProp: 'Nombre Ficticio', ccProp: '11111111', correoProp: 'prueba@ejemplo.test', celProp: '3001234567',
    matriculaApto: 'MAT-PRUEBA', autDatos: true, autMenores: true, autCom: true,
    firmaNom: 'Nombre Ficticio', firmaCC: '11111111', firmaFecha: '2026-11-07'
  }, extra);
}

beforeEach(() => crearCtx());

// ---------------------------------------------------------------------
describe('R8 auditoriaEnFilas_ sobre el CSV real (mismas cifras que invariantes.js)', () => {
  it.skipIf(!fs.existsSync(CSV_REAL))('detecta las 53 violaciones actuales', () => {
    const rows = parseCSV(fs.readFileSync(CSV_REAL, 'utf8'));
    const inf = ctx.auditoriaEnFilas_(rows.slice(1), []);
    const porPrefijo = {};
    for (const k in inf.conteo) porPrefijo[k.split(' ')[0]] = inf.conteo[k];
    expect(porPrefijo).toEqual({ I1: 2, I3: 14, I5: 12, I6: 8, I7: 14, I8: 2, I9: 1 });
    expect(inf.total).toBe(53);
    // Sin Bitácora todavía: ninguna fila se puede comparar (informativo, no viola).
    expect(inf.conteo[g('AUD_I10')]).toBeUndefined();
    expect(inf.filasSinBitacora).toBeGreaterThan(300);
  });
});

// ---------------------------------------------------------------------
describe('R8 auditoria_ (lectura del Sheet + aviso)', () => {
  it('hoja limpia: total 0 y NO manda correo', () => {
    for (let n = 1; n <= 5; n++) hojas.Registros.grid.push(filaLimpia(n));
    const antes = JSON.stringify(hojas.Registros.grid);
    const inf = ctx.auditoria_();
    expect(inf.total).toBe(0);
    expect(inf.ok).toBe(true);
    expect(correos).toHaveLength(0);
    expect(JSON.stringify(hojas.Registros.grid)).toBe(antes); // no modifica datos
    expect(hojas.Bitacora).toBeUndefined();                    // la auditoría no crea la Bitácora
  });

  it('con violaciones: un correo al admin, sin datos personales en el cuerpo', () => {
    const a = filaLimpia(1); const b = filaLimpia(2);
    b[3] = a[3];                 // I9 apto duplicado
    b[7] = 'correo-sin-arroba';  // I8
    hojas.Registros.grid.push(a, b);
    const inf = ctx.auditoria_();
    expect(inf.total).toBe(2);
    expect(correos).toHaveLength(1);
    const [to, asunto, cuerpo] = correos[0];
    expect(to).toBe(g('REGISTRO_EMAIL_ADMIN'));
    expect(asunto).toContain('2 violaciones');
    for (const dato of [a[5], a[6], a[7], a[8], b[5], b[6], b[7], b[8]]) expect(cuerpo).not.toContain(dato);
  });

  it('dryRun: informa pero no envía correo', () => {
    const a = filaLimpia(1); a[7] = 'malo'; hojas.Registros.grid.push(a);
    const inf = ctx.auditoria_({ dryRun: true });
    expect(inf.total).toBe(1);
    expect(correos).toHaveLength(0);
  });

  it('Date real en vacuna (como lo devuelve getValues) no es violación I5/I6', () => {
    const a = filaLimpia(1); a[110] = 'Perro'; a[115] = new Date(2026, 2, 1); a[1] = new Date(2026, 9, 1);
    hojas.Registros.grid.push(a);
    expect(ctx.auditoria_({ dryRun: true }).total).toBe(0);
  });
});

// ---------------------------------------------------------------------
describe('R7 Bitácora', () => {
  it('creación de 37 celdas anota 37; vaciar la fila a 4 dispara I10', () => {
    // Payload armado para que la fila escrita tenga exactamente 37 celdas con dato
    // (se comprueba además contra lo que quedó en la hoja simulada).
    const r = ctx.submitRecord(payloadPublico({
      residentes: [1, 2, 3, 4].map(i => ({ nombre: 'Res ' + i, cc: '7' + i, parentesco: 'Hijo', cel: '31' + i, correo: '' })),
      emergencias: [{ nombre: 'Emer', parent: 'Tío', tel: '320' }, { nombre: 'Emer2', parent: 'Tía', tel: '321' }],
      telFijoProp: '6011234'
    }));
    expect(r.ok).toBe(true);
    const fila = hojas.Registros.grid[r.rowNumber - 1];
    const enHoja = fila.filter(x => String(x).trim() !== '').length;
    const bit = hojas.Bitacora.grid;
    expect(bit[0]).toEqual(g('BITACORA_HDR'));          // cabecera creada al vuelo
    expect(bit).toHaveLength(2);
    const [fecha, accion, ca, apto, origen, celdas, version] = bit[1];
    expect([accion, ca, apto, origen, version]).toEqual(['crear', r.numForm, '9999', 'formulario-publico', g('VERSION_BACKEND')]);
    expect(fecha).toBe('2026-11-07 10:00:00');
    expect(celdas).toBe(enHoja);
    expect(celdas).toBe(37);

    // Sin tocar nada: la auditoría cuadra con la Bitácora.
    expect(ctx.auditoria_({ dryRun: true }).conteo[g('AUD_I10')]).toBeUndefined();

    // Alguien vacía la fila "a mano" dejando solo CA, fechas y apto (el caso de las 13).
    for (let j = 4; j < NUM_COLS; j++) fila[j] = '';
    const inf = ctx.auditoria_({ dryRun: true });
    expect(inf.violaciones[g('AUD_I10')]).toEqual([r.numForm + ' bitácora=37 (crear) hoy=4']);
  });

  it('la Bitácora no contiene datos personales', () => {
    const p = payloadPublico();
    ctx.submitRecord(p);
    const texto = JSON.stringify(hojas.Bitacora.grid);
    for (const dato of [p.nombreProp, p.ccProp, p.correoProp, p.celProp]) expect(texto).not.toContain(dato);
  });

  it('__origen fuera de la lista cerrada se anota como "desconocido"', () => {
    ctx.submitRecord(payloadPublico({ __origen: 'Nombre Ficticio 11111111' }));
    expect(hojas.Bitacora.grid[1][4]).toBe('desconocido');
  });

  it('si la Bitácora falla, el registro se guarda igual', () => {
    crearCtx({ bitacoraRota: true });
    const r = ctx.submitRecord(payloadPublico());
    expect(r.ok).toBe(true);
    expect(hojas.Registros.grid[r.rowNumber - 1][5]).toBe('Nombre Ficticio');
    expect(opcionesSS.insertSheetLlamadas).toBe(1);
    expect(logs.some(l => l.startsWith('[bitacora] no se pudo anotar'))).toBe(true);
  });

  it('editar, admin y clearResidente anotan acción/origen y celdas reales', () => {
    const r = ctx.submitRecord(payloadPublico({ residentes: [{ nombre: 'Res', cc: '71', parentesco: 'Hijo', cel: '31' }] }));
    const fila = () => hojas.Registros.grid[r.rowNumber - 1];
    const cuenta = () => fila().filter(x => String(x).trim() !== '').length;

    ctx.submitRecord(payloadPublico({ editMode: true, numForm: r.numForm }));
    let ult = hojas.Bitacora.grid.at(-1);
    expect([ult[1], ult[4], ult[5]]).toEqual(['editar', 'formulario-publico', cuenta()]);

    g('verificarEsquema_ = function () {};'); // adminGuardar se prueba aparte; aquí solo la anotación
    expect(ctx.adminGuardar({ numForm: r.numForm, apto: '9999', nombreProp: 'Otro Nombre Ficticio', ccProp: '11111111', correoProp: 'prueba@ejemplo.test' }).ok).toBe(true);
    ult = hojas.Bitacora.grid.at(-1);
    expect([ult[1], ult[2], ult[3], ult[4], ult[5]]).toEqual(['admin', r.numForm, '9999', 'portal-admin', cuenta()]);

    ctx.submitRecord(payloadPublico({ editMode: true, numForm: r.numForm, residentes: [{ nombre: 'Res', cc: '71', parentesco: 'Hijo', cel: '31' }] }));
    const antes = cuenta();
    expect(ctx.clearResidente({ numForm: r.numForm, apto: '9999', ccPropConfirm: '11111111' }).ok).toBe(true);
    ult = hojas.Bitacora.grid.at(-1);
    expect([ult[1], ult[4], ult[5]]).toEqual(['clearResidente', 'formulario-publico', cuenta()]);
    expect(cuenta()).toBeLessThan(antes);
    expect(ctx.auditoria_({ dryRun: true }).conteo[g('AUD_I10')]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// Puertas de entrada públicas (sin "_") para el desplegable del editor.
describe('Wrappers públicos del editor', () => {
  const PARES = [
    ['crearBitacora', 'crearBitacora_'],
    ['selfTest', 'selfTest_'],
    ['auditoria', 'auditoria_'],
    ['configurarRespaldoDiario', 'configurarRespaldoDiario_'],
    ['configurarAuditoriaDiaria', 'configurarAuditoriaDiaria_']
  ];

  it('existen, no terminan en "_" y delegan en la interna correcta (args y retorno tal cual)', () => {
    for (const [pub, interna] of PARES) {
      expect(pub.endsWith('_')).toBe(false);
      expect(typeof ctx[pub]).toBe('function');
      const llamadas = [];
      const marca = { soy: interna };
      ctx[interna] = (...a) => { llamadas.push(a); return marca; };
      const arg = pub === 'auditoria' ? { dryRun: true } : undefined;
      expect(ctx[pub](arg)).toBe(marca);
      expect(llamadas.length).toBe(1);
      if (pub === 'auditoria') expect(llamadas[0][0]).toBe(arg);
    }
  });

  it('auditoriaSinCorreo delega en auditoria_ con dryRun:true y no envía correo', () => {
    const llamadas = [];
    ctx.auditoria_ = (o) => { llamadas.push(o); return 'r'; };
    expect(ctx.auditoriaSinCorreo()).toBe('r');
    expect(llamadas).toEqual([{ dryRun: true }]);
  });

  it('auditoria() real devuelve el mismo objeto de informe que auditoria_()', () => {
    hojas.Registros.grid.push(filaLimpia(1));
    const a = ctx.auditoria({ dryRun: true });
    const b = ctx.auditoria_({ dryRun: true });
    expect(a).toEqual(b);
    expect(typeof a.total).toBe('number');
  });

  it('crearBitacora() crea la pestaña Bitacora y devuelve undefined', () => {
    expect(hojas.Bitacora).toBeUndefined();
    expect(ctx.crearBitacora()).toBeUndefined();
    expect(hojas.Bitacora.grid[0]).toEqual(g('BITACORA_HDR'));
    expect(logs).toContain('Bitacora lista');
  });

  // selfTest_ real (sin stubs de la función): Sheet completo salvo respaldos_folder_id.
  function prepararSelfTest(conRespaldos) {
    const claves = ['admin_password', 'vigilante_password', 'cartera_sheet_id', 'facturas_folder_id', 'plantilla_pys_id', 'link_pago'];
    if (conRespaldos) claves.push('respaldos_folder_id');
    const cfg = hoja([['clave', 'valor'], ...claves.map(k => [k, 'x'])]);
    cfg.getDataRange = () => ({ getValues: () => cfg.grid });
    hojas.Config = cfg; hojas.Mudanzas = hoja([]); hojas['salon social'] = hoja([]); hojas.Bitacora = hoja([]);
    ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'k' }) };
    ctx.DriveApp = { getFolderById: () => ({}) };
  }

  it('selfTest() PROPAGA la excepción de selfTest_ (falta respaldos_folder_id)', () => {
    prepararSelfTest(false);
    expect(() => ctx.selfTest_()).toThrow('selfTest: Config sin respaldos_folder_id');
    expect(() => ctx.selfTest()).toThrow('selfTest: Config sin respaldos_folder_id');
  });

  it('selfTest() pasa cuando selfTest_ pasa', () => {
    prepararSelfTest(true);
    expect(ctx.selfTest()).toBeUndefined();
    expect(logs.some(l => l.startsWith('selfTest OK'))).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Los triggers diarios deben apuntar a funciones PÚBLICAS (sin "_"). Si un
// trigger no puede invocar una privada, el fallo sería silencioso: el
// configurador dice OK y el respaldo/aviso nunca corre.
describe('Triggers diarios apuntan a funciones públicas', () => {
  // ScriptApp simulado: triggers previos con el nombre VIEJO y el NUEVO,
  // más uno ajeno que no se debe tocar.
  function scriptAppSimulado(handlersPrevios) {
    const vivos = handlersPrevios.map(h => ({ h, getHandlerFunction: () => h }));
    const creados = [];
    const builder = (h) => {
      const t = { h, getHandlerFunction: () => h };
      const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, nearMinute: () => b, everyHours: () => b,
        create: () => { creados.push(h); vivos.push(t); return t; } };
      return b;
    };
    return {
      vivos, creados,
      api: {
        getProjectTriggers: () => vivos.slice(),
        deleteTrigger: (t) => { const i = vivos.indexOf(t); if (i >= 0) vivos.splice(i, 1); },
        newTrigger: builder
      }
    };
  }

  const CASOS = [
    ['configurarRespaldoDiario_', 'respaldoDiario', 'respaldoDiario_'],
    ['configurarAuditoriaDiaria_', 'auditoria', 'auditoria_']
  ];

  for (const [config, publico, viejo] of CASOS) {
    it(`${config} crea el trigger '${publico}' (público) y borra '${viejo}' y '${publico}' previos`, () => {
      const sa = scriptAppSimulado([viejo, publico, viejo, 'expirarReservasSalon']);
      ctx.ScriptApp = sa.api;
      ctx[config]();
      expect(sa.creados).toEqual([publico]);
      expect(publico.endsWith('_')).toBe(false);
      expect(typeof ctx[publico]).toBe('function');
      const handlers = sa.vivos.map(t => t.h).sort();
      expect(handlers).toEqual(['expirarReservasSalon', publico].sort());
      // Idempotente: reconfigurar no deja dos vivos.
      ctx[config]();
      expect(sa.vivos.filter(t => t.h === publico).length).toBe(1);
    });
  }

  it("solo hay UNA definición de 'auditoria' y de 'respaldoDiario' en Codigo.gs", () => {
    expect(CODIGO.match(/^function auditoria\s*\(/gm).length).toBe(1);
    expect(CODIGO.match(/^function respaldoDiario\s*\(/gm).length).toBe(1);
    expect(CODIGO).not.toMatch(/newTrigger\(\s*'[^']*_'\s*\)/);
  });

  it('respaldoDiario() delega en respaldoDiario_ y devuelve lo mismo', () => {
    const marca = {}; const llamadas = [];
    ctx.respaldoDiario_ = (...a) => { llamadas.push(a); return marca; };
    expect(ctx.respaldoDiario()).toBe(marca);
    expect(llamadas.length).toBe(1);
  });

  it('auditoria(eventoDeTrigger) SÍ envía correo (no es dryRun)', () => {
    const r = [];
    ctx.auditoria_ = (o) => { r.push(o); return 'x'; };
    const evento = { authMode: 'FULL', triggerUid: '123' };
    ctx.auditoria(evento);
    expect(r[0]).toBe(evento);
    expect(!!(r[0] && r[0].dryRun === true)).toBe(false);
  });
});
