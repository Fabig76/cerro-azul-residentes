// @vitest-environment jsdom
// Pruebas de js/config.js + js/common.js (helpers CA).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
  const config = fs.readFileSync(path.resolve(__dirname, '../js/config.js'), 'utf-8');
  const common = fs.readFileSync(path.resolve(__dirname, '../js/common.js'), 'utf-8');
  // Ejecutar en el contexto global (jsdom); asignan window.CA_CONFIG y window.CA.
  (0, eval)(config);
  (0, eval)(common);
});

describe('CA.escapeHtml', () => {
  it('neutraliza < > & y comillas', () => {
    expect(window.CA.escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
  it('devuelve cadena vacía para null/undefined', () => {
    expect(window.CA.escapeHtml(null)).toBe('');
    expect(window.CA.escapeHtml(undefined)).toBe('');
  });
});

describe('CA.hoyLocal', () => {
  it('tiene formato YYYY-MM-DD', () => {
    expect(window.CA.hoyLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('coincide con la fecha local de new Date()', () => {
    const d = new Date();
    const esperado = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    expect(window.CA.hoyLocal()).toBe(esperado);
  });
});
