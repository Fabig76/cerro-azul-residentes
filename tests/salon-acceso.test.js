// Pruebas del backend (apps-script/Codigo.gs): login del Salón Social.
// Se carga Codigo.gs en un contexto vm con stubs mínimos de SpreadsheetApp y CacheService.
// Caso cubierto: apto inexistente (p. ej. el N° de formulario CA-0083 escrito en el campo
// de apartamento) NO debe culpar a la cédula; y el rate limit del salón no se comparte
// con los otros portales (clave 'ver_').
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODIGO = fs.readFileSync(path.resolve(__dirname, '../apps-script/Codigo.gs'), 'utf-8');

const NUM_COLS = 143;
function fila(numForm, apto, nombre, cc) {
  const v = new Array(NUM_COLS).fill('');
  v[0] = numForm; v[3] = apto; v[5] = nombre; v[6] = cc;
  return v;
}

let ctx, cache;
beforeEach(() => {
  cache = {};
  const filas = [fila('CA-0083', 9999, 'Administracion Fabio', 94501666)];
  const sheet = {
    getLastRow: () => 1 + filas.length,
    getRange: () => ({ getValues: () => filas.map(f => f.slice()) })
  };
  ctx = vm.createContext({
    console,
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
    CacheService: {
      getScriptCache: () => ({
        get: k => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = v; }
      })
    }
  });
  vm.runInContext(CODIGO, ctx);
  // Mora y Config leen otras hojas; aquí no interesan.
  vm.runInContext('verificarMoraApto = function () { return { enMora: false }; };' +
    'getConfigValue = function () { return null; };', ctx);
});

describe('verificarAccesoSalon', () => {
  it('apto y cédula correctos → ok', () => {
    const r = ctx.verificarAccesoSalon('9999', '94501666');
    expect(r.ok).toBe(true);
    expect(r.tipo).toBe('Propietario');
  });

  it('N° de formulario en el campo apto → error de APARTAMENTO, no de cédula', () => {
    const r = ctx.verificarAccesoSalon('CA-0083', '94501666');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/apartamento CA-0083/);
    expect(r.error).not.toMatch(/Cédula no corresponde/);
  });

  it('apto inexistente → error de apartamento', () => {
    const r = ctx.verificarAccesoSalon('9998', '94501666');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No encontramos el apartamento 9998/);
  });

  it('apto existente y cédula incorrecta → error de cédula', () => {
    const r = ctx.verificarAccesoSalon('9999', '11111111');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Cédula no corresponde/);
  });

  it('el rate limit del salón no consume el cupo compartido de los otros portales', () => {
    // Otro portal (p. ej. formulario principal) agota el cupo 'ver_9999'.
    cache['rl_ver_9999'] = '10';
    expect(ctx.verificarAccesoSalon('9999', '94501666').ok).toBe(true);
    expect(cache['rl_ver_9999']).toBe('10');
  });

  it('el salón sigue limitado a 10 intentos por apto', () => {
    for (let i = 0; i < 10; i++) ctx.verificarAccesoSalon('9999', '11111111');
    expect(ctx.verificarAccesoSalon('9999', '94501666').error).toMatch(/Demasiados intentos/);
  });
});
