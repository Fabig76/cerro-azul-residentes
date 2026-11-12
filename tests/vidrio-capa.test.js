// @vitest-environment jsdom
// Capa "vidrio" (rediseño nov-2026): garantiza que siga siendo ADITIVA.
//  - assets/vidrio.css solo cambia pintura sobre lo que ya existía.
//  - js/vidrio.js no toca la lógica de los portales.
//  - Cada página la carga después de styles.css y nada más cambió de orden.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = (...p) => path.resolve(__dirname, '..', ...p);
const leer = (...p) => fs.readFileSync(raiz(...p), 'utf-8');

const CSS = leer('assets', 'vidrio.css');
const JS = leer('js', 'vidrio.js');
const PAGINAS = ['index.html', 'residente.html', 'salon-social.html', 'estado-cuenta.html', 'informes.html', 'admin.html', 'vigilantes.html', 'cartera-admin.html'];

// Reglas hoja de la hoja de estilos: [{ selector, props: [nombres] }]
function reglas(css) {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  (function andar(txt) {
    let i = 0;
    while (i < txt.length) {
      const abre = txt.indexOf('{', i);
      if (abre < 0) break;
      const cab = txt.slice(i, abre).trim();
      let nivel = 1, j = abre + 1;
      while (j < txt.length && nivel) { if (txt[j] === '{') nivel++; else if (txt[j] === '}') nivel--; j++; }
      const cuerpo = txt.slice(abre + 1, j - 1);
      if (/^@(media|supports)/.test(cab)) andar(cuerpo);
      else if (!/^@/.test(cab)) {
        const props = cuerpo.split(';').map((d) => d.split(':')[0].trim()).filter(Boolean);
        out.push({ selector: cab, props });
      }
      i = j;
    }
  })(limpio);
  return out;
}

describe('assets/vidrio.css es solo pintura sobre lo existente', () => {
  const PINTURA = /^(--[\w-]+|background(-color|-image)?|color|border(-bottom)?-color|box-shadow|(-webkit-)?backdrop-filter|scroll-margin-top)$/;
  const esNuevo = (sel) => /(^|[\s>+~,(.#])\.?vd-|\.vd-|#vd-/.test(sel) || /^body::before$/.test(sel.trim());

  it('no usa !important', () => {
    expect(CSS.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/!important/);
  });

  it('sobre clases e ids que ya existían solo declara propiedades de pintura', () => {
    const malas = [];
    for (const r of reglas(CSS)) {
      for (const sel of r.selector.split(',')) {
        if (esNuevo(sel)) continue;
        for (const p of r.props) if (!PINTURA.test(p)) malas.push(sel.trim() + ' { ' + p + ' }');
      }
    }
    expect(malas, 'la capa no debe cambiar disposición ni visibilidad de lo existente').toEqual([]);
  });

  it('nunca toca .hidden ni [hidden] de lo existente', () => {
    const tocan = reglas(CSS).filter((r) => /\.hidden\b|\[hidden\]/.test(r.selector) && !/vd-/.test(r.selector));
    expect(tocan.map((r) => r.selector)).toEqual([]);
  });

  it('el formulario principal (contiene una ventana modal) queda sin desenfoque', () => {
    const r = reglas(CSS).find((x) => x.selector === '#form-card');
    expect(r, 'falta la regla #form-card').toBeTruthy();
    expect(CSS).toMatch(/#form-card\s*\{[^}]*backdrop-filter:\s*none/);
  });
});

describe('js/vidrio.js no interfiere con la lógica de los portales', () => {
  const codigo = JS.replace(/\/\/.*$/gm, '');
  it('no cancela eventos ni reemplaza funciones globales', () => {
    expect(codigo).not.toMatch(/preventDefault|stopPropagation|stopImmediatePropagation/);
    expect(codigo).not.toMatch(/window\.fetch\s*=|CA\.api\s*=|\.onclick\s*=|\.onsubmit\s*=/);
  });
  it('no escribe HTML a partir de datos (solo textContent)', () => {
    expect(codigo).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });
  it('la única llamada al backend es el ping de solo lectura', () => {
    const llamadas = codigo.match(/fetch\([^)]*\)/g) || [];
    expect(llamadas.length).toBe(1);
    expect(llamadas[0]).toMatch(/\?action=ping/);
  });
});

describe('las páginas cargan la capa sin cambiar lo demás', () => {
  for (const p of PAGINAS) {
    it(p + ': vidrio.css después de las demás hojas y vidrio.js al final', () => {
      const html = leer(p);
      const hojas = [...html.matchAll(/<link rel="stylesheet" href="assets\/([\w-]+)\.css/g)].map((m) => m[1]);
      expect(hojas[0]).toBe('styles');
      expect(hojas[hojas.length - 1]).toBe('vidrio');
      const guiones = [...html.matchAll(/<script src="js\/([\w-]+)\.js/g)].map((m) => m[1]);
      expect(guiones[guiones.length - 1]).toBe('vidrio');
      expect(guiones.filter((g) => g === 'vidrio').length).toBe(1);
    });
  }
});

describe('js/vidrio.js en una página simulada', () => {
  function ejecutar() { new Function(JS)(); }
  beforeEach(() => { document.body.innerHTML = ''; });

  it('tarjeta del estado de cuenta: lee #ecResumen y se oculta si no lo entiende', async () => {
    document.body.innerHTML = '<div id="view-estado"><div id="ecResumen"></div></div>';
    ejecutar();
    const escena = document.getElementById('vd-tarjeta');
    expect(escena.hidden).toBe(true);
    document.getElementById('ecResumen').innerHTML = '<strong>Apto 202B · ANA PRUEBA</strong><br>Saldo pendiente al 31 de octubre de 2026: $ 10';
    await new Promise((r) => setTimeout(r, 0));
    expect(escena.hidden).toBe(false);
    expect(escena.querySelector('.vd-tarjeta-apto b').textContent).toBe('202B');
    expect(escena.querySelector('.vd-tarjeta-nombre').textContent).toBe('ANA PRUEBA');
    expect(escena.querySelector('.vd-tarjeta-estado').textContent).toBe('Con saldo');
    document.getElementById('ecResumen').innerHTML = 'otro formato';
    await new Promise((r) => setTimeout(r, 0));
    expect(escena.hidden).toBe(true);
  });

  it('pasos: usa la clase collapsed y no altera los campos', () => {
    const sec = (n, t) => '<div class="section collapsed"><div class="section-head"><span><span class="section-num">' + n + '</span>' + t + '</span></div><div class="section-body"><input id="c' + n + '"></div></div>';
    document.body.innerHTML = '<div id="form-card"><form id="mainForm">' + sec(0, 'Uno') + sec(1, 'Dos') + sec(2, 'Tres') + '</form></div>';
    document.getElementById('c0').value = 'hola';
    ejecutar();
    const caja = document.getElementById('vd-pasos');
    expect(caja.parentNode.id).toBe('form-card');          // fuera del <form>
    expect(caja.querySelector('b').textContent).toBe('Paso 1 de 3');
    caja.querySelector('.vd-pasos-sig').click();
    const abiertas = [...document.querySelectorAll('.section')].map((s) => !s.classList.contains('collapsed'));
    expect(abiertas).toEqual([false, true, false]);
    expect(caja.querySelector('span').textContent).toBe('Dos');
    expect(document.getElementById('c0').value).toBe('hola');
    expect(document.querySelectorAll('#mainForm [data-vd]').length).toBe(0);  // nada nuevo dentro del formulario
  });

  it('en una página sin esos elementos no hace nada ni lanza errores', () => {
    document.body.innerHTML = '<main><p>hola</p></main>';
    expect(() => ejecutar()).not.toThrow();
    expect(document.querySelectorAll('[data-vd]').length).toBe(0);
  });
});
