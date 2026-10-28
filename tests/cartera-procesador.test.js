// Pruebas de js/cartera-procesador.js (agruparFacturas).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const proc = require('../js/cartera-procesador.js');

describe('agruparFacturas', () => {
  it('agrupa dos facturas por REF.PAGO', () => {
    const grupos = proc.agruparFacturas([
      { ref: '9998', page: 1, datos: {} },
      { ref: '9999', page: 2, datos: {} },
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos.map(g => g.apto)).toEqual(['9998', '9999']);
    expect(grupos[0].paginas).toEqual([1]);
    expect(grupos[1].paginas).toEqual([2]);
  });

  it('lanza si la primera página no tiene REF.PAGO', () => {
    expect(() => proc.agruparFacturas([{ ref: null, page: 1 }])).toThrow(/REF\.PAGO/);
  });
});
