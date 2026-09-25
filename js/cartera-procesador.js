// =====================================================================
// Cerro Azul — Procesador de cartera y facturas (lógica sin DOM)
// Spec: docs/spec-estado-cuenta.md §7
// VERIFICADO con los archivos reales de agosto/septiembre 2026:
//   cartera_ago.xls (625 aptos) + ESTADOS_DE_CUENTA_SEP_FINALES.PDF (625 págs)
// NO MODIFICAR sin volver a correr la prueba del §11 (Fase 2).
// Requiere globals: pdfjsLib (pdf.js 3.11.174) y PDFLib (pdf-lib 1.17.1).
// =====================================================================

function extraerDatosPagina(items) {
  const it = items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5] }));
  const esNum = s => /^-?[\d,]+$/.test(s);
  const num = s => parseInt(String(s).replace(/,/g, ''), 10);
  function valorDerecha(label) {
    const l = it.find(i => i.s === label);
    if (!l) return null;
    const cands = it.filter(i => Math.abs(i.y - l.y) <= 3 && i.x > l.x && esNum(i.s)).sort((a, b) => a.x - b.x);
    return cands.length ? num(cands[0].s) : null;
  }
  const refItem = it.find(i => /^REF\.PAGO:\s*\d+$/.test(i.s));
  const ref = refItem ? refItem.s.replace(/^REF\.PAGO:\s*/, '') : null;
  const fechas = it.filter(i => /^\d{4}\.\d{2}\.\d{2}$/.test(i.s)).sort((a, b) => b.y - a.y);
  const saldoAntItem = it.find(i => /^Saldo Anterior :-?\d+$/.test(i.s));
  return {
    ref,
    numCuentaCobro: valorDerecha('N°'),
    fechaEmision: fechas[0] ? fechas[0].s : null,
    pagueseHasta: fechas[1] ? fechas[1].s : null,
    totalAPagar: valorDerecha('Total a Pagar'),
    abonoUltimoMes: valorDerecha('Abono último Mes'),
    anticipos: valorDerecha('- Anticipos'),
    subTotal: valorDerecha('Sub-Total'),
    saldoAnterior: saldoAntItem ? num(saldoAntItem.s.replace('Saldo Anterior :', '')) : null
  };
}

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const COLS_REQUERIDAS = ['numero','nombre','anticip','valor admon','total cartera','meses prom'];

function normAptoJs(s) { return String(s == null ? '' : s).replace(/[.,\s]/g, '').trim(); }

// filas = XLSX.utils.sheet_to_json(ws, {header:1, defval:''})
function parsearCartera(filas) {
  let fechaCorte = null;
  for (let i = 0; i < Math.min(10, filas.length) && !fechaCorte; i++) {
    for (const celda of filas[i]) {
      const m = String(celda).match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{1,2})\s+de\s+(\d{4})/i);
      if (m) {
        const mes = MESES_ES.indexOf(m[1].toLowerCase()) + 1;
        fechaCorte = { anio: +m[3], mes: mes, dia: +m[2] };
        break;
      }
    }
  }
  if (!fechaCorte) throw new Error('No se encontró la fecha de corte (ej. "Agosto 31 de 2026") en las primeras 10 filas del Excel.');
  let iHdr = -1;
  for (let i = 0; i < Math.min(10, filas.length); i++) {
    if (String(filas[i][0]).trim().toLowerCase() === 'numero') { iHdr = i; break; }
  }
  if (iHdr < 0) throw new Error('No se encontró la fila de encabezados (columna A = "numero").');
  const hdr = filas[iHdr].map(h => String(h).trim().toLowerCase());
  const faltan = COLS_REQUERIDAS.filter(c => hdr.indexOf(c) < 0);
  if (faltan.length) throw new Error('Faltan columnas en el Excel: ' + faltan.join(', '));
  const idx = {}; COLS_REQUERIDAS.forEach(c => idx[c] = hdr.indexOf(c));
  if (idx['anticip'] - idx['nombre'] < 2) throw new Error('No hay columnas de conceptos entre "nombre" y "anticip".');
  const aptos = []; const vistos = {};
  for (let i = iHdr + 1; i < filas.length; i++) {
    const apto = normAptoJs(filas[i][idx['numero']]);
    if (!apto) continue;
    if (!/^\d+$/.test(apto)) throw new Error('Fila ' + (i + 1) + ': "numero" no es numérico: ' + apto);
    if (vistos[apto]) throw new Error('Apartamento duplicado en el Excel: ' + apto);
    vistos[apto] = true; aptos.push(apto);
  }
  const periodo = fechaCorte.anio + '-' + String(fechaCorte.mes).padStart(2, '0');
  const nombreMes = MESES_ES[fechaCorte.mes - 1];
  return {
    periodo: periodo,                                                     // "2026-08"
    nombrePestana: nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1) + ' ' + fechaCorte.anio, // "Agosto 2026"
    fechaCorte: periodo + '-' + String(fechaCorte.dia).padStart(2, '0'),  // "2026-08-31"
    filaEncabezado: iHdr,
    aptos: aptos,
    filasLimpias: filas.map(f => f.map(c => typeof c === 'string' ? c.trim() : c))
  };
}

// paginas = [{page, ...extraerDatosPagina(items)}] en orden del PDF
function agruparFacturas(paginas) {
  const grupos = []; const porApto = {};
  for (const p of paginas) {
    if (p.ref) {
      if (porApto[p.ref]) throw new Error('La referencia ' + p.ref + ' aparece en dos facturas distintas (páginas ' + porApto[p.ref].paginas[0] + ' y ' + p.page + ').');
      const g = { apto: p.ref, paginas: [p.page], datos: p };
      grupos.push(g); porApto[p.ref] = g;
    } else {
      if (!grupos.length) throw new Error('La página 1 del PDF no tiene REF.PAGO.');
      grupos[grupos.length - 1].paginas.push(p.page);
    }
  }
  return grupos;
}

function cruzar(aptosCartera, grupos) {
  const enPdf = new Set(grupos.map(g => g.apto)); const enCartera = new Set(aptosCartera);
  return {
    soloCartera: aptosCartera.filter(a => !enPdf.has(a)),
    soloPdf: grupos.map(g => g.apto).filter(a => !enCartera.has(a))
  };
}

const LOTE_FACTURAS = 10;

async function leerPdf(arrayBuffer, onProgreso) {
  // pdf.js puede "consumir" el buffer: se le pasa una copia
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
  const paginas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    paginas.push(Object.assign({ page: p }, extraerDatosPagina(tc.items)));
    if (onProgreso) onProgreso(p, doc.numPages);
  }
  return paginas;
}

async function generarPdfApto(pdfOrigen, paginas1Based) {
  const nuevo = await PDFLib.PDFDocument.create();
  const copiadas = await nuevo.copyPages(pdfOrigen, paginas1Based.map(n => n - 1));
  copiadas.forEach(pg => nuevo.addPage(pg));
  return await nuevo.saveAsBase64();   // string base64 sin prefijo data:
}

// postFn(payload) -> Promise<respuestaJSON>. Reintenta cada lote hasta 3 veces.
async function subirFacturas(arrayBuffer, grupos, idCarga, password, postFn, onProgreso) {
  const pdfOrigen = await PDFLib.PDFDocument.load(arrayBuffer);
  for (let i = 0; i < grupos.length; i += LOTE_FACTURAS) {
    const lote = grupos.slice(i, i + LOTE_FACTURAS);
    const archivos = [];
    for (const g of lote) archivos.push({ apto: g.apto, base64: await generarPdfApto(pdfOrigen, g.paginas) });
    let r = null, err = null;
    for (let intento = 1; intento <= 3; intento++) {
      try {
        r = await postFn({ action: 'ecSubirFacturas', password: password, idCarga: idCarga, archivos: archivos });
        if (r && r.ok) break;
        err = new Error((r && r.error) || 'Respuesta inválida');
      } catch (e) { err = e; }
      r = null;
    }
    if (!r) throw new Error('Falló el lote que empieza en el apto ' + lote[0].apto + ': ' + err.message);
    if (onProgreso) onProgreso(Math.min(i + LOTE_FACTURAS, grupos.length), grupos.length);
  }
}
