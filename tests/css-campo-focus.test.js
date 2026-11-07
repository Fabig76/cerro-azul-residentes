// Tema oscuro: el texto que se escribe debe verse en el campo enfocado.
// Antes, input:focus forzaba background:#FFFFFF en los dos temas y en oscuro
// el texto (--gris-tx #E8ECF1) quedaba blanco sobre blanco (contraste 1.19).
// Sin DOM: se lee assets/styles.css y se parsean las variables.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS = fs.readFileSync(path.resolve(__dirname, '../assets/styles.css'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function bloque(selector) {
  const i = CSS.indexOf(selector + ' {');
  expect(i, 'no se encontró el bloque ' + selector).toBeGreaterThanOrEqual(0);
  const ini = CSS.indexOf('{', i) + 1;
  return CSS.slice(ini, CSS.indexOf('}', ini));
}
function vars(selector) {
  const out = {};
  for (const m of bloque(selector).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function lum(hex) {
  const h = hex.replace('#', '');
  const a = [0, 2, 4].map((i) => {
    const v = parseInt(h.substr(i, 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function ratio(f, b) {
  const l1 = lum(f), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const PLACEHOLDER = (CSS.match(/input::placeholder[^{]*\{\s*color:\s*(#[0-9A-Fa-f]{6})/) || [])[1];

const claro = vars(':root');
const oscuro = vars(':root[data-tema="oscuro"]');

describe('Fondo del campo enfocado según el tema', () => {
  it('existe --campo-focus y cambia entre claro y oscuro', () => {
    expect(claro['--campo-focus']).toBeDefined();
    expect(oscuro['--campo-focus']).toBeDefined();
    expect(oscuro['--campo-focus'].toUpperCase()).not.toBe(claro['--campo-focus'].toUpperCase());
  });

  it('en tema claro el campo enfocado sigue siendo blanco puro', () => {
    expect(claro['--campo-focus'].toUpperCase()).toBe('#FFFFFF');
  });

  it('las 2 reglas :focus usan la variable, no un #FFFFFF literal', () => {
    const general = bloque('input:focus, select:focus, textarea:focus');
    const asistente = bloque('html body #ca-input:focus');
    for (const r of [general, asistente]) {
      expect(r).toMatch(/background:\s*var\(--campo-focus\)/);
      expect(r).not.toMatch(/background(-color)?:\s*#FFF(FFF)?\b/i);
    }
  });

  it('en oscuro el texto contrasta >= 4.5 con el campo enfocado', () => {
    expect(ratio(oscuro['--gris-tx'], oscuro['--campo-focus'])).toBeGreaterThanOrEqual(4.5);
  });

  it('en claro el texto contrasta >= 4.5 con el campo enfocado', () => {
    expect(ratio(claro['--gris-tx'], claro['--campo-focus'])).toBeGreaterThanOrEqual(4.5);
  });

  it('en oscuro el campo enfocado es más claro que el campo en reposo', () => {
    expect(lum(oscuro['--campo-focus'])).toBeGreaterThan(lum(oscuro['--campo']));
  });

  it('en oscuro el placeholder sigue legible (>= 4.5) en el campo enfocado', () => {
    expect(PLACEHOLDER).toBeDefined();
    expect(ratio(PLACEHOLDER, oscuro['--campo-focus'])).toBeGreaterThanOrEqual(4.5);
  });
});
