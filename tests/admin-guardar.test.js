// Pruebas del backend (apps-script/Codigo.gs): guardado desde el portal admin.
// Regresión: adminGuardar declaraba `newRow` con const dentro del try y la usaba
// en el Logger.log de después del finally → "ReferenceError: newRow is not defined"
// (el Sheet ya se había escrito, pero el admin veía el error).
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODIGO = fs.readFileSync(path.resolve(__dirname, '../apps-script/Codigo.gs'), 'utf-8');

const NUM_COLS = 143;

let ctx, filas, escrituras, logs, lockLiberado;
beforeEach(() => {
  const v = new Array(NUM_COLS).fill('');
  v[0] = 'CA-0001'; v[3] = '101'; v[5] = 'Ana'; v[6] = '123'; v[7] = 'ana@x.co';
  filas = [v];
  escrituras = [];
  logs = [];
  lockLiberado = false;
  const sheet = {
    getLastRow: () => 1 + filas.length,
    getRange: (row, col, nRows, nCols) => ({
      getValues: () => {
        // getRange(fila, 1, 1, NUM_COLS) → la fila; getRange(2, COL+1, n, 1) → columna numForm
        if (nCols === 1) return filas.map(f => [f[col - 1]]);
        return [filas[row - 2].slice()];
      },
      setValues: vals => { escrituras.push({ row, vals }); filas[row - 2] = vals[0].slice(); }
    })
  };
  ctx = vm.createContext({
    console,
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { lockLiberado = true; } }) },
    Utilities: { formatDate: () => '2026-11-05 10:00:00' },
    Logger: { log: m => logs.push(m) }
  });
  vm.runInContext(CODIGO, ctx);
  vm.runInContext('verificarEsquema_ = function () {};', ctx);
});

describe('adminGuardar', () => {
  it('guarda y devuelve ok:true (sin ReferenceError newRow)', () => {
    const r = ctx.adminGuardar({
      numForm: 'CA-0001', apto: '101', nombreProp: 'Ana María', ccProp: '123', correoProp: 'ANA@x.co'
    });
    expect(r.ok).toBe(true);
    expect(r.message).toBe('Registro actualizado correctamente');
    expect(r.rowNumber).toBe(2);
    expect(escrituras.length).toBe(1);
    expect(filas[0][5]).toBe('Ana María');
    expect(filas[0][7]).toBe('ana@x.co');
    expect(filas[0][2]).toBe('2026-11-05 10:00:00');
    expect(lockLiberado).toBe(true);
    expect(logs).toContain('adminGuardar: CA-0001 (fila 2) a las 2026-11-05 10:00:00');
  });

  it('si la escritura falla, el error sube y el lock se libera igual', () => {
    vm.runInContext('verificarEsquema_ = function () { throw new Error("Esquema alterado"); };', ctx);
    expect(() => ctx.adminGuardar({
      numForm: 'CA-0001', apto: '101', nombreProp: 'Ana', ccProp: '123', correoProp: 'ana@x.co'
    })).toThrow('Esquema alterado');
    expect(lockLiberado).toBe(true);
    expect(escrituras.length).toBe(0);
  });
});
