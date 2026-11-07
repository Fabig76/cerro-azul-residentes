// Tanda 1 — cliente público (js/app.js, sin red):
//   R5: fechaEdicionVista SOLO en modo edición (la del lookup); nunca en creación.
//   R3: el radio de manejo especial manda el texto 'Sí'/'No'.
//   R2: la vacuna no-fecha ('Sí' del portal del residente) no se pierde al reenviar.
import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = p => path.resolve(__dirname, '..', p);
const APP_JS = process.env.APP_JS || raiz('js/app.js');

let w;
beforeAll(() => {
  const html = fs.readFileSync(raiz('index.html'), 'utf-8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'outside-only', url: 'https://x.test/' });
  w = dom.window;
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  w.eval(fs.readFileSync(raiz('js/config.js'), 'utf-8'));
  w.eval(fs.readFileSync(raiz('js/common.js'), 'utf-8'));
  w.eval(inline[0]);
  // `const state` dentro de un eval no es visible desde fuera: se expone como var.
  w.eval(fs.readFileSync(APP_JS, 'utf-8').replace(/^const state = /m, 'var state = '));
  for (let k = 1; k < inline.length; k++) { try { w.eval(inline[k]); } catch (e) { /* asistente, etc. */ } }
});

function editar(lookup) {
  w.state.mode = 'edit';
  w.state.editLookup = lookup;
}

describe('R5 · fechaEdicionVista en el payload', () => {
  it('modo edición: manda la fechaEdicion que vio en el lookup', () => {
    editar({ fechaEdicion: '2026-11-03 08:48:49', mascotas: [] });
    const p = w.recolectar();
    expect(p.editMode).toBe(true);
    expect(p.fechaEdicionVista).toBe('2026-11-03 08:48:49');
  });
  it('modo creación: NO la manda (aunque haya quedado un lookup previo)', () => {
    w.state.mode = 'create';
    w.state.editLookup = { fechaEdicion: '2026-11-03 08:48:49' };
    const p = w.recolectar();
    expect(p.editMode).toBe(false);
    expect('fechaEdicionVista' in p).toBe(false);
  });
});

describe('R3 · radio de manejo especial', () => {
  it('manda el texto del radio', () => {
    editar({ fechaEdicion: 'x', mascotas: [] });
    w.document.querySelector('input[name="masc1Esp"][value="Sí"]').checked = true;
    expect(w.recolectar().mascotas[0].manejoEspecial).toBe('Sí');
  });
});

describe('R2 · vacuna que no es fecha', () => {
  it("conserva 'Sí' del registro cargado si el campo fecha quedó vacío", () => {
    editar({ fechaEdicion: 'x', mascotas: [{ vacuna: 'Sí' }, { vacuna: '2026-01-02' }] });
    w.document.querySelector('#masc1Vacuna').value = '';
    w.document.querySelector('#masc2Vacuna').value = '';
    const m = w.recolectar().mascotas;
    expect(m[0].vacuna).toBe('Sí');
    expect(m[1].vacuna).toBe(''); // era fecha y el usuario la borró: se respeta
  });
  it('si el usuario escribe una fecha, gana la fecha', () => {
    editar({ fechaEdicion: 'x', mascotas: [{ vacuna: 'Sí' }] });
    w.document.querySelector('#masc1Vacuna').value = '2026-05-06';
    expect(w.recolectar().mascotas[0].vacuna).toBe('2026-05-06');
  });
});
