// Tanda 1 — backend (apps-script/Codigo.gs, sin red):
//   R2: cellStr_ (Date -> ISO, 0 -> '0') y su uso en rowToObject / _preservar* / _combinar*.
//   R3: tri-estados Sí/No/'' (manejo especial, requiere revisión, autorizaciones).
//   R5: bloqueo optimista en submitRecord (modo edición) y adminGuardar,
//       con la celda "Fecha Edición" como Date real (como la devuelve getValues).
//   Hash de deduplicación (col 142): no cambia para filas existentes.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GS = process.env.CODIGO_GS || path.resolve(__dirname, '../apps-script/Codigo.gs');
const CODIGO = fs.readFileSync(GS, 'utf-8');
const NUM_COLS = 143;

// Utilities.formatDate real en America/Bogota (independiente del TZ de la máquina).
function formatDate(d, tz, f) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(d).map(x => [x.type, x.value]));
  return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
    .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
}
const sha = s => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b));
const hashViejo = (apto, cc, firmaCC) => sha(apto + '|' + cc + '|' + firmaCC)
  .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').slice(0, 16);

const bog = s => new Date(s + '-05:00'); // fecha/hora de Bogotá -> Date (fuera del vm: otro "realm")

let ctx, filas, escrituras;
function filaBase() {
  const v = new Array(NUM_COLS).fill('');
  v[0] = 'CA-0001'; v[1] = bog('2026-09-01T10:00:00'); v[2] = bog('2026-11-03T08:48:49');
  v[3] = 101; v[4] = 'Propietario'; v[5] = 'Ana'; v[6] = 123456; v[7] = 'ana@x.co'; v[8] = 3001112233;
  v[111] = 'Firulais'; v[116] = 'Sí'; v[121] = 'Michi';
  v[136] = 'Sí'; v[137] = 'No'; v[138] = 'Sí'; v[139] = 'Ana'; v[140] = 123456; v[141] = bog('2026-10-01T00:00:00');
  return v;
}
beforeEach(() => {
  filas = [filaBase()];
  escrituras = [];
  const sheet = {
    getLastRow: () => 1 + filas.length,
    getRange: (row, col, nRows, nCols) => ({
      getValues: () => {
        if (nCols === 1) return filas.map(f => [f[col - 1]]);
        return filas.slice(row - 2, row - 2 + nRows).map(f => f.slice());
      },
      setValues: vals => { escrituras.push(row); filas[row - 2] = vals[0].slice(); }
    })
  };
  ctx = vm.createContext({
    console,
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { formatDate, computeDigest: (_a, s) => sha(s), DigestAlgorithm: { SHA_256: 1 } },
    Logger: { log: () => {} }
  });
  vm.runInContext(CODIGO, ctx);
  vm.runInContext(`
    verificarEsquema_ = function () {};
    registrarBitacora_ = function () {};
    lookupMatriculaApto = function () { return { encontrado: true }; };
  `, ctx);
});

// Payload del formulario público en modo edición, a partir de lo que devolvió el lookup.
function payloadEdicion(o, extra) {
  return Object.assign({}, o, { editMode: true, autDatos: true, __origen: 'formulario-publico' }, extra || {});
}

describe('R2 · cellStr_', () => {
  it('Date sin hora -> yyyy-MM-dd (aunque venga de otro realm)', () => {
    expect(ctx.cellStr_(bog('2026-10-01T00:00:00'))).toBe('2026-10-01');
  });
  it('Date con hora -> yyyy-MM-dd HH:mm:ss (en Bogotá)', () => {
    expect(ctx.cellStr_(bog('2026-11-03T08:48:49'))).toBe('2026-11-03 08:48:49');
  });
  it("0 -> '0'; números -> su texto", () => {
    expect(ctx.cellStr_(0)).toBe('0');
    expect(ctx.cellStr_(12.5)).toBe('12.5');
    expect(ctx.cellStr_(3001112233)).toBe('3001112233');
  });
  it("'' / null / undefined -> ''", () => {
    expect(ctx.cellStr_('')).toBe('');
    expect(ctx.cellStr_(null)).toBe('');
    expect(ctx.cellStr_(undefined)).toBe('');
  });
  it("booleanos -> 'Sí'/'No'; texto -> recortado", () => {
    expect(ctx.cellStr_(true)).toBe('Sí');
    expect(ctx.cellStr_(false)).toBe('No');
    expect(ctx.cellStr_('  hola ')).toBe('hola');
  });
  it('repara el texto largo "GMT-0500" que dejó el bug', () => {
    expect(ctx.cellStr_('Thu Oct 01 2026 00:00:00 GMT-0500 (hora estándar de Colombia)')).toBe('2026-10-01');
  });
  it('rowToObject: fechas en ISO y ceros conservados', () => {
    const v = filaBase(); v[93] = 0; v[94] = 0; v[50] = 0; v[49] = 'Bebé'; v[115] = bog('2026-03-01T00:00:00');
    const o = ctx.rowToObject(v);
    expect(o.firmaFecha).toBe('2026-10-01');
    expect(o.fechaEdicion).toBe('2026-11-03 08:48:49');
    expect(o.llaverosAut).toBe('0');
    expect(o.tagsAut).toBe('0');
    expect(o.menores[0].edad).toBe('0');
    expect(o.mascotas[0].vacuna).toBe('2026-03-01');
    expect(o.apto).toBe('101');
  });
  it('_preservarDispositivos / _combinarMenores / construirResidentesParaActualizar usan cellStr_', () => {
    const v = filaBase(); v[98] = bog('2026-02-03T00:00:00'); v[49] = 'Bebé'; v[50] = 0; v[30] = 999;
    expect(ctx._preservarDispositivos(v)[0].fecha).toBe('2026-02-03');
    expect(ctx._combinarMenores(v, [])[0].edad).toBe('0');
    expect(ctx.construirResidentesParaActualizar(v, 2, [{}])[0].cc).toBe('999');
  });
});

describe('R3 · tri-estados', () => {
  const fila = me => ctx.buildRowFromPayload({ apto: '1', mascotas: [{ nombre: 'A', manejoEspecial: me }] }, 'CA-X', null);
  it("manejoEspecial: 'Sí'->'Sí', 'No'->'No' (radio de index.html)", () => {
    expect(fila('Sí')[116]).toBe('Sí');
    expect(fila('No')[116]).toBe('No');
  });
  it("manejoEspecial: true/false -> 'Sí'/'No'; 'true'/'false' -> 'Sí'/'No'", () => {
    expect(fila(true)[116]).toBe('Sí');
    expect(fila(false)[116]).toBe('No');
    expect(fila('true')[116]).toBe('Sí');
    expect(fila('false')[116]).toBe('No');
  });
  it("manejoEspecial ausente o '' -> '' (NO 'No')", () => {
    expect(ctx.buildRowFromPayload({ apto: '1', mascotas: [{ nombre: 'A' }] }, 'CA-X', null)[116]).toBe('');
    expect(fila('')[116]).toBe('');
  });
  it("requiereRevision: el texto 'No' ya no se guarda como 'Sí'; '' se queda ''", () => {
    expect(ctx.buildRowFromPayload({ apto: '1', requiereRevision: 'No' }, 'CA-X', null)[15]).toBe('No');
    expect(ctx.buildRowFromPayload({ apto: '1', requiereRevision: true }, 'CA-X', null)[15]).toBe('Sí');
    expect(ctx.buildRowFromPayload({ apto: '1', requiereRevision: '' }, 'CA-X', null)[15]).toBe('');
    expect(ctx.buildRowFromPayload({ apto: '1' }, 'CA-X', null)[15]).toBe('No'); // ausente: como antes
  });
  it("autorizaciones: el texto 'No' se guarda 'No' (antes 'Sí' por truthy)", () => {
    const v = ctx.buildRowFromPayload({ apto: '1', autDatos: 'No', autMenores: 'Sí', autCom: false }, 'CA-X', null);
    expect([v[136], v[137], v[138]]).toEqual(['No', 'Sí', 'No']);
  });
  it("adminGuardar: el <select> manda 'true'/'false'/'' y se guarda Sí/No/''", () => {
    const base = { numForm: 'CA-0001', apto: '101', nombreProp: 'Ana', ccProp: '123456', correoProp: 'ana@x.co' };
    expect(ctx.adminGuardar({ ...base, mascotas: [{ manejoEspecial: 'true' }, { manejoEspecial: '' }] }).ok).toBe(true);
    expect(filas[0][116]).toBe('Sí');
    expect(filas[0][126]).toBe('');
    ctx.adminGuardar({ ...base, mascotas: [{ manejoEspecial: 'false' }, {}], requiereRevision: '' });
    expect(filas[0][116]).toBe('No');
    expect(filas[0][15]).toBe('');
  });
});

describe('R5 · bloqueo optimista en submitRecord (modo edición)', () => {
  it('nadie más tocó la fila (celda Date) -> guarda', () => {
    const o = ctx.rowToObject(filas[0]);
    const r = ctx.submitRecord(payloadEdicion(o, { fechaEdicionVista: o.fechaEdicion }));
    expect(r.ok).toBe(true);
    expect(escrituras.length).toBe(1);
  });
  it('otro guardó después del lookup -> CONFLICTO y NO escribe', () => {
    const o = ctx.rowToObject(filas[0]);
    filas[0][2] = bog('2026-11-03T09:00:00'); // un residente/admin guardó
    filas[0][29] = 'Residente nuevo';
    const r = ctx.submitRecord(payloadEdicion(o, { fechaEdicionVista: o.fechaEdicion }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe('CONFLICTO');
    expect(r.error).toBe('El registro fue modificado por otra persona. Recargue y vuelva a intentar.');
    expect(escrituras.length).toBe(0);
    expect(filas[0][29]).toBe('Residente nuevo');
  });
  it('sin fechaEdicionVista (navegador viejo) -> no bloquea', () => {
    const o = ctx.rowToObject(filas[0]);
    filas[0][2] = bog('2026-11-03T09:00:00');
    expect(ctx.submitRecord(payloadEdicion(o)).ok).toBe(true);
  });
  it('celda como texto y vista con la hora sin cero a la izquierda -> iguales', () => {
    filas[0][2] = '2026-11-03 08:48:49';
    const o = ctx.rowToObject(filas[0]);
    expect(ctx.submitRecord(payloadEdicion(o, { fechaEdicionVista: '2026-11-03 8:48:49' })).ok).toBe(true);
  });
  it('vista con el texto largo GMT de un cliente anterior al despliegue -> iguales', () => {
    const o = ctx.rowToObject(filas[0]);
    const r = ctx.submitRecord(payloadEdicion(o, { fechaEdicionVista: 'Tue Nov 03 2026 08:48:49 GMT-0500 (hora estándar de Colombia)' }));
    expect(r.ok).toBe(true);
  });
  it('adminGuardar sigue funcionando con la nueva fechaEdicion de rowToObject (celda Date)', () => {
    const o = ctx.rowToObject(filas[0]);
    const base = { numForm: 'CA-0001', apto: '101', nombreProp: 'Ana', ccProp: '123456', correoProp: 'ana@x.co' };
    expect(ctx.adminGuardar({ ...base, fechaEdicionVista: o.fechaEdicion }).ok).toBe(true);
    const r = ctx.adminGuardar({ ...base, fechaEdicionVista: o.fechaEdicion }); // la fila ya cambió
    expect(r.code).toBe('CONFLICTO');
  });
});

describe('Hash de deduplicación (col 142)', () => {
  it('rowToObject -> buildRowFromPayload produce el mismo hash que la fórmula anterior', () => {
    const casos = [
      [101, 123456, 123456],          // números (como los devuelve getValues)
      ['2304', ' 52.123.456 ', '52123456'], // texto con espacios
      ['T1-504', '1020', '']           // firma vacía
    ];
    for (const [apto, cc, fcc] of casos) {
      const v = filaBase(); v[3] = apto; v[6] = cc; v[140] = fcc;
      const h = ctx.buildRowFromPayload(ctx.rowToObject(v), 'CA-0001', null)[142];
      expect(h).toBe(hashViejo(String(apto).trim(), String(cc).trim(), String(fcc).trim()));
    }
  });
});
