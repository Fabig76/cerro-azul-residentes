#!/usr/bin/env node
// Simulación (dry-run) de la auditoría R8 con el código REAL de apps-script/Codigo.gs.
// Sin red, sin Sheets: ejecuta auditoriaEnFilas_() sobre exportaciones CSV.
// Uso: node scripts/auditoria-dry-run.js Registros.csv [Bitacora.csv]
// Salida: conteo por invariante + CA/fila/apto afectados (sin datos personales).
// exit 0 si no hay violaciones, 1 si las hay.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const [csvReg, csvBit] = process.argv.slice(2);
if (!csvReg) { console.error('Uso: node scripts/auditoria-dry-run.js Registros.csv [Bitacora.csv]'); process.exit(2); }

function parseCSV(t){const rows=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c=='"'){if(t[i+1]=='"'){f+='"';i++}else q=false}else f+=c}else{if(c=='"')q=true;else if(c==','){r.push(f);f=''}else if(c=='\n'){r.push(f);rows.push(r);r=[];f=''}else if(c!='\r')f+=c}}if(f||r.length){r.push(f);rows.push(r)}return rows}

const ctx = vm.createContext({ Logger: { log() {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8'), ctx);

const filas = parseCSV(fs.readFileSync(csvReg, 'utf8')).slice(1);
const bit = csvBit ? parseCSV(fs.readFileSync(csvBit, 'utf8')) : [];
const inf = ctx.auditoriaEnFilas_(filas, bit, 2);

for (const k of Object.keys(inf.conteo)) {
  const l = inf.violaciones[k];
  console.log(k + ': ' + l.length + '\n   ' + l.slice(0, 15).join(' | ') + (l.length > 15 ? ' | …' : ''));
}
console.log('\nfilas con dato: ' + inf.filasConDato + ' · sin anotación en Bitácora: ' + inf.filasSinBitacora + (csvBit ? '' : ' (no se pasó Bitacora.csv)'));
console.log(inf.total ? 'RESULTADO: ' + inf.total + ' violaciones' : 'RESULTADO: OK — 0 violaciones');
process.exit(inf.total ? 1 : 0);
