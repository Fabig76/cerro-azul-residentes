// Tanda 2 — backend (apps-script/Codigo.gs), sin red y sin Sheets:
//   R4  adminGuardar no altera la Firma-Fecha ni la col 15 vacía.
//   R12 submitRecord reutiliza la fila vacía (solo CA/fechas/apto) con su CA.
//   R9  escribirFila_ es el punto único: blindaje, forma, fila destino, Bitácora.
// Todos los datos son inventados. CODIGO_GS permite apuntar a otra versión
// del backend (pruebas de reversión en /tmp).
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODIGO = fs.readFileSync(process.env.CODIGO_GS || path.resolve(__dirname, '../apps-script/Codigo.gs'), 'utf-8');
const NUM_COLS = 143;

function hoja(grid, opts = {}) {
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
      setValues: (vals) => {
        if (opts.setValuesRoto) throw new Error('setValues simulado roto');
        escrituras++;
        vals.forEach((vr, i) => { const k = r - 1 + i; grid[k] = grid[k] || new Array(NUM_COLS).fill(''); vr.forEach((v, j) => { grid[k][c - 1 + j] = v; }); });
      },
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) grid[r - 1 + i][c - 1 + j] = ''; },
      setNumberFormat: () => {}
    })
  };
}

let ctx, hojas, correos, logs, escrituras;
function crearCtx(opts = {}) {
  correos = []; logs = []; escrituras = 0;
  const hdr = new Array(NUM_COLS).fill('');
  hojas = { Registros: hoja([hdr], opts), Torre: hoja([['apto', 'mat']]) };
  const ss = {
    getSheetByName: (n) => hojas[n] || (/Torre|Parq/.test(n) ? hojas.Torre : null),
    insertSheet: (n) => { hojas[n] = hoja([]); return hojas[n]; }
  };
  const cache = {};
  ctx = vm.createContext({
    console,
    SpreadsheetApp: { openById: () => ss },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {}, getProperties: () => ({}) }) },
    Utilities: {
      // Fecha REAL del Date (no un valor fijo: con uno fijo, toda celda Date
      // parecería "2026-11-07 10:00:00" y las pruebas de fechas no medirían nada).
      formatDate: (d, tz, f) => {
        const p = n => String(n).padStart(2, '0');
        const D = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
        const H = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
        return f === 'yyyy-MM-dd' ? D : f === 'HH:mm:ss' ? H : D + ' ' + H;
      },
      computeDigest: () => new Array(32).fill(1), DigestAlgorithm: { SHA_256: 1 }, getUuid: () => 'u'
    },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: (...a) => correos.push(a) },
    GmailApp: { sendEmail: (...a) => correos.push(a) },
    Session: { getScriptTimeZone: () => 'America/Bogota' },
    Logger: { log: m => logs.push(String(m)) }
  });
  vm.runInContext(CODIGO, ctx);
  const cent = vm.runInContext('CABECERAS_CENTINELA', ctx);
  for (const k in cent) hdr[k] = cent[k];
}
const g = (expr) => vm.runInContext(expr, ctx);
const grid = () => hojas.Registros.grid;
const bitacora = () => (hojas.Bitacora ? hojas.Bitacora.grid.slice(1) : []);
const copia = (f) => f.map(x => (x instanceof Date ? new Date(x.getTime()) : x));

function filaCompleta(n, apto, extra = {}) {
  const v = new Array(NUM_COLS).fill('');
  v[0] = 'CA-' + String(n).padStart(4, '0'); v[1] = '2026-10-01 10:00:00'; v[2] = '2026-10-01 10:00:00';
  v[3] = apto; v[4] = 'Propietario'; v[5] = 'Persona Ficticia ' + n; v[6] = String(9000000 + n);
  v[7] = 'ficticio' + n + '@ejemplo.test'; v[8] = '300000000' + (n % 10);
  v[15] = 'No'; v[136] = 'Sí'; v[137] = 'Sí'; v[138] = 'Sí';
  v[139] = 'Persona Ficticia ' + n; v[140] = String(9000000 + n); v[141] = '2026-10-01';
  for (const k in extra) v[k] = extra[k];
  return v;
}
// Fila "de 4 celdas": solo CA, fechas y apto (como CA-0280).
function filaVacia(n, apto) {
  const v = new Array(NUM_COLS).fill('');
  v[0] = 'CA-' + String(n).padStart(4, '0'); v[1] = '2026-10-20 09:00:00'; v[2] = '2026-10-20 09:00:00'; v[3] = apto;
  return v;
}
function payloadPublico(apto, extra = {}) {
  return Object.assign({
    __origen: 'formulario-publico', apto, diligencia: 'Propietario',
    nombreProp: 'Nombre Ficticio', ccProp: '11111111', correoProp: 'prueba@ejemplo.test', celProp: '3001234567',
    matriculaApto: 'MAT-PRUEBA', autDatos: true, autMenores: true, autCom: true,
    firmaNom: 'Nombre Ficticio', firmaCC: '11111111', firmaFecha: '2026-11-07'
  }, extra);
}

// Payload que arma admin.js a partir de adminObtener, sin que el admin toque nada.
//   nuevo: admin.js de la Tanda 2 (no manda firmaFecha; aut* solo si cambió)
//   viejo: admin.js en caché del navegador (manda firmaFecha del <input type=date>)
function payloadAdmin(numForm, variante) {
  const o = ctx.adminObtener(numForm).row;
  const P = JSON.parse(JSON.stringify(o));
  P.mascotas.forEach(m => { m.manejoEspecial = m.manejoEspecial === 'Sí' ? 'true' : (m.manejoEspecial === 'No' ? 'false' : ''); });
  if (variante === 'viejo') {
    const s = String(o.firmaFecha).slice(0, 10);
    P.firmaFecha = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
    P.autDatos = o.autDatos === 'Sí'; P.autMenores = o.autMenores === 'Sí'; P.autCom = o.autCom === 'Sí';
  } else {
    delete P.firmaFecha; delete P.autDatos; delete P.autMenores; delete P.autCom;
  }
  P.action = 'adminGuardar'; P.fechaEdicionVista = o.fechaEdicion;
  delete P.fechaRegistro; delete P.fechaEdicion;
  return P;
}

beforeEach(() => {
  crearCtx();
  g('verificarEsquema_ = function () {};');
});

// ---------------------------------------------------------------------
describe('R4 · el admin guarda sin tocar nada y la fila NO pierde datos', () => {
  for (const variante of ['nuevo', 'viejo']) {
    it(`Firma-Fecha "2026-09-15 08:30:00" (texto) se conserva EXACTA (admin.js ${variante})`, () => {
      grid().push(filaCompleta(1, '101', { 141: '2026-09-15 08:30:00' }));
      const r = ctx.adminGuardar(payloadAdmin('CA-0001', variante));
      expect(r.ok).toBe(true);
      expect(grid()[1][141]).toBe('2026-09-15 08:30:00');
    });

    it(`Firma-Fecha como Date con hora (getValues) se conserva con su hora (admin.js ${variante})`, () => {
      const d = new Date(2026, 8, 15, 8, 30, 0);
      grid().push(filaCompleta(1, '101', { 141: d }));
      expect(ctx.adminGuardar(payloadAdmin('CA-0001', variante)).ok).toBe(true);
      const cel = grid()[1][141];
      expect(cel instanceof Date || Object.prototype.toString.call(cel) === '[object Date]').toBe(true);
      expect(cel.getTime()).toBe(d.getTime());
    });

    it(`Firma-Fecha vacía sigue vacía; texto largo GMT no se borra (admin.js ${variante})`, () => {
      grid().push(filaCompleta(1, '101', { 141: '' }));
      const largo = 'Thu Oct 01 2026 00:00:00 GMT-0500 (hora estándar de Colombia)';
      grid().push(filaCompleta(2, '102', { 141: largo }));
      expect(ctx.adminGuardar(payloadAdmin('CA-0001', variante)).ok).toBe(true);
      expect(ctx.adminGuardar(payloadAdmin('CA-0002', variante)).ok).toBe(true);
      expect(grid()[1][141]).toBe('');
      expect(grid()[2][141]).toBe(largo);
    });

    it(`col 15 (Requiere Revisión) vacía no se vuelve 'Sí' ni 'No' (admin.js ${variante})`, () => {
      grid().push(filaCompleta(1, '101', { 15: '' }));
      const p = payloadAdmin('CA-0001', variante);
      expect(p.requiereRevision).toBe(''); // el <select> tiene la opción vacía
      expect(ctx.adminGuardar(p).ok).toBe(true);
      expect(grid()[1][15]).toBe('');
    });
  }

  it("autorizaciones vacías: el admin.js nuevo no las convierte en 'No'", () => {
    grid().push(filaCompleta(1, '101', { 136: 'Sí', 137: '', 138: '' }));
    expect(ctx.adminGuardar(payloadAdmin('CA-0001', 'nuevo')).ok).toBe(true);
    expect(grid()[1].slice(136, 139)).toEqual(['Sí', '', '']);
  });

  it('guardar sin tocar nada: solo cambia la Fecha Edición (col 2)', () => {
    const antes = filaCompleta(1, '101', { 141: new Date(2026, 8, 15, 8, 30, 0), 115: new Date(2026, 2, 1), 116: '' });
    grid().push(copia(antes));
    expect(ctx.adminGuardar(payloadAdmin('CA-0001', 'nuevo')).ok).toBe(true);
    const despues = grid()[1];
    const distintas = [];
    for (let j = 0; j < NUM_COLS; j++) {
      const a = antes[j] instanceof Date ? antes[j].getTime() : antes[j];
      const b = despues[j] instanceof Date ? despues[j].getTime() : despues[j];
      if (a !== b) distintas.push(j);
    }
    // 115 (vacuna Date) vuelve como texto ISO (Sheets lo re-parsea como fecha; R2/Tanda 1).
    expect(distintas.filter(j => j !== 115)).toEqual([2]);
    expect(despues[115]).toBe('2026-03-01');
  });
});

// ---------------------------------------------------------------------
describe('R12 · reutilizar la fila vacía', () => {
  beforeEach(() => {
    grid().push(filaCompleta(279, '1300'));
    grid().push(filaVacia(280, '1407'));           // fila de 4 celdas
    grid().push(filaCompleta(281, '1500'));
    const conFirma = filaVacia(290, '2000');       // sin nombre/cc/cel pero con firma (136-140)
    conFirma[136] = 'Sí'; conFirma[137] = 'Sí'; conFirma[138] = 'Sí'; conFirma[139] = 'Firma Ficticia'; conFirma[140] = '555';
    grid().push(conFirma);
  });

  it('1) apto con fila de 4 celdas: ok, se rellena ESA fila, conserva CA-0280 y el contador no avanza', () => {
    const sigAntes = ctx.getNextFormId();
    const filasAntes = grid().length;
    const r = ctx.submitRecord(payloadPublico('1407'));
    expect(r.ok).toBe(true);
    expect(r.numForm).toBe('CA-0280');
    expect(r.rowNumber).toBe(3);
    expect(grid().length).toBe(filasAntes);                 // no se añadió fila
    const fila = grid()[2];
    expect(fila[0]).toBe('CA-0280');
    expect([fila[3], fila[5], fila[6], fila[8]]).toEqual(['1407', 'Nombre Ficticio', '11111111', '3001234567']);
    expect(ctx.getNextFormId()).toBe(sigAntes);              // CA-0291: no avanzó
    expect(grid().filter(f => f[0] === 'CA-0280')).toHaveLength(1); // sin CA duplicado
    expect(logs.some(l => l.startsWith('[submitRecord] reutiliza fila vacía 3 (CA-0280)'))).toBe(true);
    // Correo con el CA reutilizado (el propietario lo necesita para editar).
    expect(r.correoEnviado).toBe(true);
    expect(JSON.stringify(correos)).toContain('CA-0280');
    // Una escritura = una anotación.
    expect(bitacora()).toHaveLength(1);
    expect(bitacora()[0].slice(1, 4)).toEqual(['crear', 'CA-0280', '1407']);
  });

  it('2) fila sin nombre/cc/cel pero con firma (136-140): "ya existe", no se pisa', () => {
    const antes = copia(grid()[4]);
    const r = ctx.submitRecord(payloadPublico('2000'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Ya existe un registro para el apartamento 2000/);
    expect(grid()[4]).toEqual(antes);
    expect(escrituras).toBe(0);
  });

  it('3) apto sin fila: creación normal con CA nuevo al final', () => {
    const r = ctx.submitRecord(payloadPublico('3000'));
    expect(r.ok).toBe(true);
    expect(r.numForm).toBe('CA-0291');
    expect(r.rowNumber).toBe(6);
    expect(grid()[5][3]).toBe('3000');
  });

  it('apto con fila completa: sigue siendo "ya existe"', () => {
    const r = ctx.submitRecord(payloadPublico('1300'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Ya existe/);
  });

  it('si el apto tiene MÁS de una fila (aunque la primera esté vacía) no se reutiliza', () => {
    grid().push(filaCompleta(295, '1407'));
    const r = ctx.submitRecord(payloadPublico('1407'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Ya existe/);
    expect(escrituras).toBe(0);
  });

  it('al reutilizar, el blindaje sigue aplicando (sin celular -> aborta, la fila no cambia)', () => {
    const antes = copia(grid()[2]);
    const r = ctx.submitRecord(payloadPublico('1407', { celProp: '   ' }));
    expect(r.ok).toBe(false);
    expect(grid()[2]).toEqual(antes);
  });

  it('criterio estricto: filaVaciaReutilizable_', () => {
    expect(ctx.filaVaciaReutilizable_(filaVacia(1, '1'))).toBe(true);
    const conDato = filaVacia(1, '1'); conDato[141] = '2026-10-01';
    expect(ctx.filaVaciaReutilizable_(conDato)).toBe(false);
    const sinCa = filaVacia(1, '1'); sinCa[0] = '';
    expect(ctx.filaVaciaReutilizable_(sinCa)).toBe(false);
  });
});

// ---------------------------------------------------------------------
describe('R9 · escribirFila_ (punto único de escritura)', () => {
  beforeEach(() => {
    grid().push(filaCompleta(1, '101'));
    grid().push(filaCompleta(2, '102'));
  });
  const nueva = (n, apto) => filaCompleta(n, apto);

  for (const [col, nombre] of [[5, 'nombre'], [6, 'cédula'], [8, 'celular']]) {
    it(`sin ${nombre} -> aborta y la fila en la hoja NO cambia`, () => {
      const antes = copia(grid()[1]);
      const f = filaCompleta(1, '101', { 4: 'Arrendatario' }); f[col] = '  ';
      const r = ctx.escribirFila_(hojas.Registros, 2, f, { modo: 'editar', numForm: 'CA-0001', accion: 'editar' });
      expect(r.ok).toBe(false);
      expect(r.code).toBe('BLINDAJE');
      expect(grid()[1]).toEqual(antes);
      expect(escrituras).toBe(0);
      expect(bitacora()).toHaveLength(0);
    });
  }

  it('correo inválido -> aborta (el portal del residente lo rechazaría después)', () => {
    const f = filaCompleta(1, '101'); f[7] = 'sin-arroba';
    const r = ctx.escribirFila_(hojas.Registros, 2, f, { modo: 'admin', numForm: 'CA-0001' });
    expect(r.ok).toBe(false);
    expect(escrituras).toBe(0);
  });

  for (const n of [142, 144, 0]) {
    it(`array de ${n} columnas -> error, no escribe`, () => {
      const f = filaCompleta(1, '101').slice(0, Math.min(n, NUM_COLS));
      while (f.length < n) f.push('x');
      const r = ctx.escribirFila_(hojas.Registros, 2, f, { modo: 'editar', numForm: 'CA-0001' });
      expect(r.ok).toBe(false);
      expect(r.code).toBe('FORMA');
      expect(escrituras).toBe(0);
    });
  }

  it('fila destino con OTRO numForm -> error, no escribe', () => {
    const antes = copia(grid()[2]);
    const r = ctx.escribirFila_(hojas.Registros, 3, nueva(1, '101'), { modo: 'editar', numForm: 'CA-0001' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('FILA_AJENA');
    expect(grid()[2]).toEqual(antes);
    expect(escrituras).toBe(0);
  });

  it('el numForm de la fila no coincide con el esperado -> error, no escribe', () => {
    const r = ctx.escribirFila_(hojas.Registros, 2, nueva(2, '101'), { modo: 'editar', numForm: 'CA-0001' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('CA_FILA');
    expect(escrituras).toBe(0);
  });

  it('creación sobre una fila ocupada -> error, no la pisa', () => {
    const antes = copia(grid()[2]);
    const r = ctx.escribirFila_(hojas.Registros, 3, nueva(9, '909'), { modo: 'crear', numForm: 'CA-0009' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('FILA_OCUPADA');
    expect(grid()[2]).toEqual(antes);
  });

  it('safeCell_ en todas las celdas', () => {
    const f = filaCompleta(1, '101'); f[9] = '=HYPERLINK("x")'; f[16] = '+57 300';
    expect(ctx.escribirFila_(hojas.Registros, 2, f, { modo: 'editar', numForm: 'CA-0001' }).ok).toBe(true);
    expect(grid()[1][9]).toBe('\'=HYPERLINK("x")');
    expect(grid()[1][16]).toBe("'+57 300");
  });

  it('si setValues falla devuelve ok:false (no lanza) y no anota en la Bitácora', () => {
    crearCtx({ setValuesRoto: true });
    grid().push(filaCompleta(1, '101'));
    const r = ctx.escribirFila_(hojas.Registros, 2, filaCompleta(1, '101'), { modo: 'editar', numForm: 'CA-0001' });
    expect(r).toMatchObject({ ok: false, code: 'ESCRITURA' });
    expect(bitacora()).toHaveLength(0);
  });

  it('una escritura = UNA anotación en la Bitácora (directa, submitRecord y adminGuardar)', () => {
    expect(ctx.escribirFila_(hojas.Registros, 2, nueva(1, '101'), { modo: 'editar', numForm: 'CA-0001', accion: 'editar', origen: 'portal-residente' }).ok).toBe(true);
    expect(bitacora()).toHaveLength(1);
    expect(bitacora()[0].slice(1, 5)).toEqual(['editar', 'CA-0001', '101', 'portal-residente']);

    const r = ctx.submitRecord(payloadPublico('9999'));
    expect(r.ok).toBe(true);
    expect(bitacora()).toHaveLength(2);

    expect(ctx.adminGuardar(payloadAdmin(r.numForm, 'nuevo')).ok).toBe(true);
    expect(bitacora()).toHaveLength(3);
    expect(bitacora()[2].slice(1, 5)).toEqual(['admin', r.numForm, '9999', 'portal-admin']);
    expect(escrituras).toBe(3);
  });

  it('submitRecord y adminGuardar escriben SOLO a través de escribirFila_', () => {
    const llamadas = [];
    const real = ctx.escribirFila_;
    ctx.escribirFila_ = function (sh, fila, valores, c) { llamadas.push(c.modo); return real(sh, fila, valores, c); };
    expect(ctx.submitRecord(payloadPublico('9999')).ok).toBe(true);
    expect(ctx.adminGuardar(payloadAdmin('CA-0001', 'nuevo')).ok).toBe(true);
    expect(llamadas).toEqual(['crear', 'admin']);
    expect(escrituras).toBe(2);
  });

  it('si escribirFila_ aborta, submitRecord devuelve ok:false y no escribe', () => {
    ctx.escribirFila_ = () => ({ ok: false, code: 'X', error: 'abortado' });
    const r = ctx.submitRecord(payloadPublico('9999'));
    expect(r).toMatchObject({ ok: false, error: 'abortado' });
    expect(escrituras).toBe(0);
    expect(correos).toHaveLength(0);
  });

  describe('blindaje del admin', () => {
    it('fila que YA no tenía celular: guarda (para corregir otros datos) y avisa', () => {
      grid().push(filaCompleta(3, '103', { 8: '' }));
      const p = payloadAdmin('CA-0003', 'nuevo'); p.telFijoProp = '6010000';
      const r = ctx.adminGuardar(p);
      expect(r.ok).toBe(true);
      expect(r.aviso).toMatch(/sin celular/);
      expect(grid()[3][9]).toBe('6010000');
    });

    it('el admin NO puede borrar un celular que existía', () => {
      const antes = copia(grid()[1]);
      const p = payloadAdmin('CA-0001', 'nuevo'); p.celProp = '';
      const r = ctx.adminGuardar(p);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/celular/);
      expect(grid()[1]).toEqual(antes);
    });

    it('el admin no puede dejar un correo con formato inválido', () => {
      const p = payloadAdmin('CA-0001', 'nuevo'); p.correoProp = 'ana@sin-punto';
      const r = ctx.adminGuardar(p);
      expect(r.ok).toBe(false);
      expect(escrituras).toBe(0);
    });

    it('el bloqueo optimista sigue ANTES de escribir', () => {
      const p = payloadAdmin('CA-0001', 'nuevo');
      grid()[1][2] = '2026-11-01 08:00:00'; // otro guardó después del lookup
      const r = ctx.adminGuardar(p);
      expect(r.code).toBe('CONFLICTO');
      expect(escrituras).toBe(0);
    });
  });
});
