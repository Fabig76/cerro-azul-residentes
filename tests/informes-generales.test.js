// Informes generales: actas de asamblea solo para propietarios.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODIGO = fs.readFileSync(path.resolve(__dirname, '../apps-script/Codigo.gs'), 'utf-8');

function archivo(id, nombre, mime = 'application/pdf', size = 300 * 1024) {
  return { getId: () => id, getName: () => nombre, getMimeType: () => mime, getSize: () => size,
    getDateCreated: () => new Date('2026-04-02T12:00:00Z'), getBlob: () => ({ getBytes: () => [1, 2, 3] }) };
}
function iter(arr) { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; }
function carpeta(nombre, archivos = [], sub = []) {
  return { getName: () => nombre, getFiles: () => iter(archivos), getFolders: () => iter(sub) };
}

let ctx, verif, props;
beforeEach(() => {
  verif = { ok: true, apto: '402', nombreProp: 'Ana Pérez' };
  props = {};
  const raiz = carpeta('Actas', [archivo('SUELTO000001', 'suelto.pdf')], [
    carpeta('2026', [archivo('ACTA2026B00', '2026-09-12 Asamblea extraordinaria.pdf'), archivo('ACTA2026A00', '2026-03-21 Asamblea ordinaria.pdf'), archivo('IMAGEN000001', 'foto.jpg', 'image/jpeg')]),
    carpeta('2027'),
    carpeta('Borradores', [archivo('BORRADOR0001', 'borrador.pdf')])
  ]);
  ctx = vm.createContext({
    console, Logger: { log: () => {} },
    DriveApp: { getFolderById: () => raiz },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10), base64Encode: () => 'QUJD' }
  });
  vm.runInContext(CODIGO, ctx);
  ctx.__verif = () => verif;
  vm.runInContext('ecVerificarAcceso = function () { return __verif(); }; ecConfig = function (k) { return k === "actas_folder_id" ? "X" : ""; };', ctx);
});

describe('igListarActas', () => {
  it('lista los años (más reciente primero) y solo los PDF de cada año', () => {
    const r = ctx.igListarActas({});
    expect(r.ok).toBe(true);
    expect(r.anios.map(a => a.anio)).toEqual(['2027', '2026']);
    const a26 = r.anios.find(a => a.anio === '2026');
    expect(a26.actas.map(a => a.titulo)).toEqual(['2026-03-21 Asamblea ordinaria', '2026-09-12 Asamblea extraordinaria']);
    expect(r.anios.find(a => a.anio === '2027').actas).toEqual([]);
  });

  it('no responde nada si la verificación falla (arrendatario o cédula errada)', () => {
    verif = { ok: false, error: 'Esta autorización debe ser solicitada por el propietario' };
    const r = ctx.igListarActas({});
    expect(r.ok).toBe(false);
    expect(r.anios).toBeUndefined();
  });

  it('sin la clave de Config → mensaje claro', () => {
    vm.runInContext('ecConfig = function () { return ""; };', ctx);
    expect(ctx.igListarActas({}).ok).toBe(false);
  });
});

describe('igDescargarActa', () => {
  it('entrega un acta de una carpeta de año', () => {
    const r = ctx.igDescargarActa({ fileId: 'ACTA2026A00' });
    expect(r.ok).toBe(true);
    expect(r.base64).toBe('QUJD');
  });

  it('rechaza archivos fuera de las carpetas de año (otro Drive, sueltos o borradores)', () => {
    expect(ctx.igDescargarActa({ fileId: 'SUELTO000001' }).ok).toBe(false);
    expect(ctx.igDescargarActa({ fileId: 'BORRADOR0001' }).ok).toBe(false);
    expect(ctx.igDescargarActa({ fileId: 'OTRO_ARCHIVO_DE_DRIVE' }).ok).toBe(false);
    expect(ctx.igDescargarActa({ fileId: '../x' }).ok).toBe(false);
  });

  it('rechaza lo que no es PDF', () => {
    expect(ctx.igDescargarActa({ fileId: 'IMAGEN000001' }).ok).toBe(false);
  });

  it('sin verificación no descarga', () => {
    verif = { ok: false, error: 'La cédula no coincide' };
    expect(ctx.igDescargarActa({ fileId: 'ACTA2026A00' }).ok).toBe(false);
  });
});

describe('igPrepararCarpeta_', () => {
  function carpetaNueva(nombre) {
    const hijas = [];
    return { nombre, hijas, getName: () => nombre, getId: () => 'F_' + nombre, getUrl: () => 'https://drive/F_' + nombre,
      setDescription: () => {}, getFiles: () => iter([]), getFolders: () => iter(hijas.slice()),
      createFolder: n => { const c = carpetaNueva(n); hijas.push(c); return c; } };
  }
  it('sin configuración: crea la carpeta privada con 2026 y 2027, una sola vez', () => {
    const creadas = [];
    let raizNueva = null;
    vm.runInContext('ecConfig = function () { return ""; };', ctx);
    ctx.DriveApp = {
      createFolder: n => { raizNueva = carpetaNueva(n); creadas.push(n); return raizNueva; },
      getFolderById: id => { if (raizNueva && id === raizNueva.getId()) return raizNueva; throw new Error('no'); }
    };
    const r1 = ctx.igPrepararCarpeta_();
    expect(r1.ok).toBe(true);
    expect(creadas).toEqual(['Actas de asamblea']);
    expect(raizNueva.hijas.map(h => h.nombre)).toEqual(['2026', '2027']);
    const r2 = ctx.igPrepararCarpeta_();
    expect(r2.ok).toBe(true);
    expect(creadas.length).toBe(1);
    expect(raizNueva.hijas.length).toBe(2);
  });
});
