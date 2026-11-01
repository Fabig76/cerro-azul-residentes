// Pruebas de js/informes.js (cálculos puros) y de data/informes.json (coherencia de los datos publicados).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Calc = require('../js/informes.js');
const DATA = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/informes.json'), 'utf-8'));
const N = DATA.conjunto.apartamentos;

describe('data/informes.json', () => {
  it('no tiene errores de validación', () => {
    expect(Calc.validar(DATA)).toEqual([]);
  });
  it('trae los 31 rubros en el presupuesto y en cada mes', () => {
    expect(Calc.CLAVES.length).toBe(31);
    DATA.meses.forEach(m => expect(Object.keys(m.rubros).sort()).toEqual([...Calc.CLAVES].sort()));
  });
});

describe('validar', () => {
  it('detecta una suma que no cuadra con el total del contador', () => {
    const copia = JSON.parse(JSON.stringify(DATA));
    copia.meses[0].rubros.vig[0] += 1000;
    expect(Calc.validar(copia).join(' ')).toMatch(/suma acumulada/);
  });
  it('detecta un rubro faltante y un enlace que no es de Drive', () => {
    const copia = JSON.parse(JSON.stringify(DATA));
    delete copia.meses[0].rubros.energia;
    copia.meses[0].pdf = 'https://ejemplo.com/a.pdf';
    const e = Calc.validar(copia).join(' ');
    expect(e).toMatch(/rubro energia/);
    expect(e).toMatch(/Google Drive/);
  });
});

describe('cambio de año', () => {
  it('rechaza mezclar meses de dos años', () => {
    const copia = JSON.parse(JSON.stringify(DATA));
    const m = JSON.parse(JSON.stringify(copia.meses[0])); m.id = '2027-01'; m.mesesAcum = 1; copia.meses.push(m);
    expect(Calc.validar(copia).join(' ')).toMatch(/mismo año/);
  });
});

describe('cálculos con septiembre 2026', () => {
  const sep = DATA.meses.find(m => m.id === '2026-09');
  it('cuota promedio = $205.600', () => {
    expect(Calc.cuotaPromedio(sep, N)).toBe(205600);
  });
  it('las filas de la vista promedio suman exactamente la cuota', () => {
    const F = Calc.filas(sep, DATA.presupuesto, 'prom', N);
    const suma = F.rows.reduce((s, r) => s + r.val, 0);
    expect(Math.round(suma)).toBe(205600);
    expect(F.rows[F.rows.length - 1].nombre).toBe('Gasto proyectado');
    expect(Math.round(F.rows.find(r => r.id === 'vig').val)).toBe(63919);
  });
  it('el gasto proyectado se desglosa en partes que suman su valor', () => {
    const F = Calc.filas(sep, DATA.presupuesto, 'prom', N);
    const proy = F.rows.find(r => r.id === 'proy');
    expect(Math.round(proy.partes.reduce((s, p) => s + p.val, 0))).toBe(Math.round(proy.val));
  });
  it('la vista del mes marca seguros como ajuste a favor (negativo)', () => {
    const F = Calc.filas(sep, DATA.presupuesto, 'mes', N);
    expect(F.negativos.map(g => g.id)).toContain('seg');
  });
});

describe('agosto 2026 con facturas pendientes', () => {
  const ago = DATA.meses.find(m => m.id === '2026-08');
  it('incluye la línea de facturas que aún no llegan', () => {
    const F = Calc.filas(ago, DATA.presupuesto, 'prom', N);
    const proy = F.rows.find(r => r.id === 'proy');
    expect(proy.partes[0].texto).toMatch(/energía \(2 meses\)/);
  });
});
