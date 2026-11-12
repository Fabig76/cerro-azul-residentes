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
const PAGINAS = ['formulario.html', 'residente.html', 'salon-social.html', 'estado-cuenta.html', 'informes.html', 'admin.html', 'vigilantes.html', 'cartera-admin.html'];

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

describe('la dirección principal muestra la portada', () => {
  it('index.html es la portada y no carga la lógica del formulario', () => {
    const html = leer('index.html');
    expect(html).toMatch(/class="vd-portada"/);
    expect(html).not.toMatch(/js\/app\.js/);
    expect(html).not.toMatch(/id="mainForm"/);
  });
  it('formulario.html conserva el formulario completo y su lógica', () => {
    const html = leer('formulario.html');
    expect(html).toMatch(/id="mainForm"/);
    expect(html).toMatch(/js\/app\.js/);
    for (const modo of ['create', 'edit', 'mudanzas']) expect(html).toContain('data-mode="' + modo + '"');
  });
  it('la portada enlaza las tres pestañas del formulario con sus nombres de siempre', () => {
    const html = leer('index.html');
    expect(html).toMatch(/href="formulario\.html"[\s\S]{0,900}Enviar \/ Crear registro/);
    expect(html).toMatch(/href="formulario\.html#editar"[\s\S]{0,900}Editar mi registro/);
    expect(html).toMatch(/href="formulario\.html#mudanzas"[\s\S]{0,900}Agendar mudanza/);
  });
  it('ninguna página enlaza ya a index.html esperando el formulario', () => {
    for (const p of ['residente.html', 'salon-social.html', 'index.html']) expect(leer(p)).not.toMatch(/href="index\.html"/);
  });
  it('inicio.html (enlace anterior) redirige a la dirección principal', () => {
    const html = leer('inicio.html');
    expect(html).toMatch(/http-equiv="refresh" content="0; url=\.\/"/);
    expect(html).toMatch(/location\.replace\('\.\/'\)/);
  });
});

describe('formulario: abrir una pestaña desde el enlace', () => {
  function montar(hash) {
    window.location.hash = hash;
    document.body.innerHTML = '<button class="mode-tab active" data-mode="create"></button><button class="mode-tab" data-mode="edit"></button><button class="mode-tab" data-mode="mudanzas"></button>';
    const pulsadas = [];
    document.querySelectorAll('.mode-tab').forEach((t) => t.addEventListener('click', () => pulsadas.push(t.dataset.mode)));
    new Function(JS)();
    return pulsadas;
  }
  it('#mudanzas pulsa la pestaña de mudanzas', () => { expect(montar('#mudanzas')).toEqual(['mudanzas']); });
  it('#editar pulsa la pestaña de editar', () => { expect(montar('#editar')).toEqual(['edit']); });
  it('sin # (o con uno desconocido) no pulsa nada', () => {
    expect(montar('')).toEqual([]);
    expect(montar('#otra-cosa')).toEqual([]);
  });
});

describe('portada: el asistente con IA está disponible', () => {
  it('index.html carga common.js y asistente.js antes de vidrio.js', () => {
    const guiones = [...leer('index.html').matchAll(/<script src="js\/([\w-]+)\.js/g)].map((m) => m[1]);
    expect(guiones).toEqual(['config', 'common', 'asistente', 'vidrio']);
  });
  it('los botones abren el chat con el propio "Abrir chat" del asistente y no lo cierran', () => {
    document.body.innerHTML = '<button id="ca-btn-toggle"></button><div id="ca-ventana" class="ca-oculta"><input id="ca-input"></div><button data-vd-asistente id="b1"></button>';
    const v = document.getElementById('ca-ventana');
    document.getElementById('ca-btn-toggle').addEventListener('click', () => v.classList.toggle('ca-oculta'));
    new Function(JS)();
    document.getElementById('b1').click();
    expect(v.classList.contains('ca-oculta')).toBe(false);
    document.getElementById('b1').click();              // segundo toque: sigue abierto
    expect(v.classList.contains('ca-oculta')).toBe(false);
  });
  it('si el asistente no cargó, los botones se ocultan', () => {
    document.body.innerHTML = '<section data-vd-asistente-zona id="z"><button data-vd-asistente></button></section>';
    new Function(JS)();
    expect(document.getElementById('z').hidden).toBe(true);
  });
});
