// Recuperar N° de formulario: correo oculto + envío solo al correo registrado.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODIGO = fs.readFileSync(path.resolve(__dirname, '../apps-script/Codigo.gs'), 'utf-8');

let ctx, correos, bitacora, cache;
const FILAS = [
  ['N° Formulario', 'x', 'x', 'Apto', 'x', 'Nombre', 'x', 'Correo'],
  ['CA-0010', '', '', '106', '', 'Viejo Dueño', '', 'viejo@correo.com'],
  ['CA-0011', '', '', '402', '', 'Ana Pérez', '', 'juana.perez@gmail.com'],
  ['CA-0090', '', '', '106', '', 'Luis Gómez', '', 'luisgomez@hotmail.com'],
  ['CA-0091', '', '', '9804', '', 'Inmobiliaria XYZ', '', 'contacto@inmoxyz.com.co'],
  ['CA-0092', '', '', '707', '', 'Sin Correo', '', 'no-tiene'],
  ['', '', '', '808', '', 'Fila vacía', '', 'x@y.com']
];
beforeEach(() => {
  correos = []; bitacora = []; cache = {};
  const hoja = {
    getLastRow: () => FILAS.length,
    getRange: (r, c, nr, nc) => ({ getValues: () => FILAS.slice(r - 1, r - 1 + nr).map(f => f.slice(c - 1, c - 1 + nc)) })
  };
  ctx = vm.createContext({
    console, Logger: { log: () => {} },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => hoja }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    Utilities: { formatDate: () => '2026112711' }
  });
  vm.runInContext(CODIGO, ctx);
  ctx.__correos = correos; ctx.__bit = bitacora;
  vm.runInContext('enviarEmailSeguro_ = function (to, s, b) { __correos.push({ to: to, s: s, b: b }); return { enviado: true }; };' +
    'registrarBitacora_ = function (a, n, ap) { __bit.push([a, n, ap]); return true; };', ctx);
});

describe('rcOcultarCorreo_', () => {
  it('oculta casi todo el correo', () => {
    expect(ctx.rcOcultarCorreo_('juana.perez@gmail.com')).toBe('ju•••••@g•••.com');
    expect(ctx.rcOcultarCorreo_('a@x.co')).toBe('a•••••@x•••.co');
  });
});

describe('rcConsultar', () => {
  it('devuelve el correo oculto, nunca el código ni el correo completo', () => {
    const r = ctx.rcConsultar({ apto: '402' });
    expect(r.ok).toBe(true);
    expect(r.correoOculto).toBe('ju•••••@g•••.com');
    expect(JSON.stringify(r)).not.toMatch(/CA-0011|juana\.perez/);
  });
  it('con dos registros del mismo apartamento usa el más reciente', () => {
    expect(ctx.rcConsultar({ apto: '106' }).correoOculto).toBe('lu•••••@h•••.com');
  });
  it('correo de inmobiliaria, tal cual quedó registrado', () => {
    expect(ctx.rcConsultar({ apto: '9804' }).correoOculto).toBe('co•••••@i•••.co');
  });
  it('apartamento sin registro o sin correo válido', () => {
    expect(ctx.rcConsultar({ apto: '555' })).toEqual({ ok: true, encontrado: false });
    expect(ctx.rcConsultar({ apto: '707' }).sinCorreo).toBe(true);
    expect(ctx.rcConsultar({ apto: '808' }).encontrado).toBe(false);   // fila sin N° de formulario
  });
  it('rechaza texto que no es un número de apartamento', () => {
    expect(ctx.rcConsultar({ apto: 'Torre 2 apto 402' }).ok).toBe(false);
    expect(ctx.rcConsultar({ apto: '' }).ok).toBe(false);
  });
  it('limita las consultas por apartamento', () => {
    for (let i = 0; i < 10; i++) ctx.rcConsultar({ apto: '402' });
    expect(ctx.rcConsultar({ apto: '402' }).ok).toBe(false);
  });
});

describe('rcEnviar', () => {
  it('envía el código SOLO al correo registrado y deja bitácora', () => {
    const r = ctx.rcEnviar({ apto: '402', correo: 'atacante@mal.com' });
    expect(r.ok).toBe(true);
    expect(correos.length).toBe(1);
    expect(correos[0].to).toBe('juana.perez@gmail.com');
    expect(correos[0].b).toMatch(/CA-0011/);
    expect(JSON.stringify(r)).not.toMatch(/CA-0011/);
    expect(bitacora[0]).toEqual(['recuperar-codigo', 'CA-0011', '402']);
  });
  it('no reenvía antes de 10 minutos', () => {
    ctx.rcEnviar({ apto: '402' });
    const r2 = ctx.rcEnviar({ apto: '402' });
    expect(r2.ok).toBe(false);
    expect(correos.length).toBe(1);
  });
  it('máximo 3 envíos al día por apartamento', () => {
    for (let i = 0; i < 3; i++) { ctx.rcEnviar({ apto: '402' }); delete cache.rc_e_402; }
    expect(ctx.rcEnviar({ apto: '402' }).ok).toBe(false);
    expect(correos.length).toBe(3);
  });
  it('sin correo válido no envía', () => {
    expect(ctx.rcEnviar({ apto: '707' }).ok).toBe(false);
    expect(correos.length).toBe(0);
  });
});
