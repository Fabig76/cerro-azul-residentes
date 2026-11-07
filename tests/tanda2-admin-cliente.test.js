// Tanda 2 — R4 en el cliente admin (js/admin.js, sin red):
//   la Firma-Fecha es de solo lectura, se muestra completa (con hora) y NO
//   viaja en el payload; las autorizaciones solo viajan si el admin las cambió.
// ADMIN_JS permite apuntar a otra versión (pruebas de reversión en /tmp).
import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = p => path.resolve(__dirname, '..', p);
const ADMIN_JS = process.env.ADMIN_JS || raiz('js/admin.js');

let w;
function fila(extra = {}) {
  const vacio = n => Array.from({ length: n }, () => ({}));
  return Object.assign({
    numForm: 'CA-0001', fechaRegistro: '2026-10-01 10:00:00', fechaEdicion: '2026-10-01 10:00:00',
    apto: '101', diligencia: 'Propietario', nombreProp: 'Persona Ficticia', ccProp: '123',
    correoProp: 'ficticia@ejemplo.test', celProp: '300', requiereRevision: '',
    residentes: vacio(4), menores: vacio(4), vehiculos: vacio(2), motos: vacio(2), bicis: vacio(2),
    dispositivos: vacio(3), mascotas: vacio(2), emergencias: vacio(2),
    autDatos: 'Sí', autMenores: '', autCom: 'No',
    firmaNom: 'Persona Ficticia', firmaCC: '123', firmaFecha: '2026-09-15 08:30:00'
  }, extra);
}

beforeEach(() => {
  const html = fs.readFileSync(raiz('admin.html'), 'utf-8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'outside-only', url: 'https://x.test/' });
  w = dom.window;
  w.eval(fs.readFileSync(raiz('js/config.js'), 'utf-8'));
  w.eval(fs.readFileSync(raiz('js/common.js'), 'utf-8'));
  w.eval(fs.readFileSync(ADMIN_JS, 'utf-8').replace(/^const A = /m, 'var A = '));
});

function abrirYEditar(r) {
  w.A.state.selectedNumForm = r.numForm;
  w.A.state.selectedRow = r;
  w.A.renderDetail(r, 2);
  w.A.editar();
  return w.document.getElementById('edit-firmaFecha');
}

describe('R4 · Firma-Fecha en el portal admin', () => {
  it('se muestra completa (con la hora) y sigue bloqueada tras "Habilitar edición"', () => {
    const el = abrirYEditar(fila());
    expect(el.value).toBe('2026-09-15 08:30:00');
    expect(el.disabled).toBe(true);
    // el resto del formulario sí queda editable
    expect(w.document.getElementById('edit-celProp').disabled).toBe(false);
  });

  it('NO viaja en el payload (ni con fecha, ni vacía)', () => {
    abrirYEditar(fila());
    expect('firmaFecha' in JSON.parse(JSON.stringify(w.A.recolectarPayload()))).toBe(false);
    abrirYEditar(fila({ firmaFecha: '' }));
    expect('firmaFecha' in JSON.parse(JSON.stringify(w.A.recolectarPayload()))).toBe(false);
  });
});

describe('R4 · autorizaciones: solo viajan si el admin las cambió', () => {
  it("sin tocar: no viajan (el backend conserva 'Sí', '' y 'No' tal cual)", () => {
    abrirYEditar(fila());
    const p = JSON.parse(JSON.stringify(w.A.recolectarPayload()));
    expect('autDatos' in p).toBe(false);
    expect('autMenores' in p).toBe(false);
    expect('autCom' in p).toBe(false);
  });

  it('si el admin cambia una casilla, viaja ese valor', () => {
    abrirYEditar(fila());
    w.document.getElementById('edit-autMenores').checked = true;
    w.document.getElementById('edit-autDatos').checked = false;
    const p = w.A.recolectarPayload();
    expect(p.autMenores).toBe(true);
    expect(p.autDatos).toBe(false);
    expect(p.autCom).toBeUndefined();
  });

  it("requiereRevision vacía viaja '' (no 'Sí'/'No')", () => {
    abrirYEditar(fila());
    expect(w.A.recolectarPayload().requiereRevision).toBe('');
  });
});

describe('Aviso de celular faltante al guardar desde el portal admin', () => {
  function simularGuardado(respuesta) {
    const r = fila();
    abrirYEditar(r);
    w.A.apiPost = async () => respuesta;
    w.A.apiGet = async () => ({ ok: true, row: r, rowNumber: 2 });
    return w.A.guardar().then(() => w.document.getElementById('alert'));
  }
  const AVISO = 'El registro sigue sin celular del propietario: el residente no podrá usar su portal hasta que se complete.';

  it('si la respuesta trae aviso: lo muestra como advertencia, junto al éxito', async () => {
    const el = await simularGuardado({ ok: true, rowNumber: 2, aviso: AVISO });
    expect(el.classList.contains('hidden')).toBe(false);
    expect(el.classList.contains('alert-warn')).toBe(true);
    expect(el.classList.contains('alert-err')).toBe(false);
    expect(el.textContent).toContain('Cambios guardados correctamente');
    expect(el.textContent).toContain(AVISO);
  });

  it('sin aviso: éxito normal (alert-ok), sin advertencia', async () => {
    const el = await simularGuardado({ ok: true, rowNumber: 2 });
    expect(el.classList.contains('hidden')).toBe(false);
    expect(el.classList.contains('alert-ok')).toBe(true);
    expect(el.textContent).toBe('Cambios guardados correctamente. Fila 2.');
  });

  it('si falla: sigue mostrando el error', async () => {
    const el = await simularGuardado({ ok: false, error: 'Conflicto de edición.' });
    expect(el.classList.contains('alert-err')).toBe(true);
    expect(el.textContent).toBe('Conflicto de edición.');
  });
});
