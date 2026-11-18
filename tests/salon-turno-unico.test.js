// SAL-UNICO: el salón se reserva por día completo. Las reservas antiguas
// ('Mañana' / 'Tarde') siguen válidas y ocupan todo el día.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODIGO = fs.readFileSync(path.resolve(__dirname, '../apps-script/Codigo.gs'), 'utf-8');

function iso(d) { return d.toISOString().slice(0, 10); }
const hoy = new Date();
const dEn = n => iso(new Date(hoy.getTime() + n * 86400000));
const F_TARDE = dEn(5);   // día con reserva antigua de la tarde
const F_LIBRE = dEn(8);

let ctx, filas, appended;
beforeEach(() => {
  appended = [];
  filas = [
    ['ID', 'NumForm', 'Apto', 'CC', 'Tipo', 'Nombre', 'Correo', 'Cel', 'Fecha', 'Slot', 'Estado'],
    ['SAL-0001', 'CA-0001', '101', '111', 'Propietario', 'Ana', '', '', F_TARDE, 'Tarde', 'Pagado'],
    ['SAL-0002', 'CA-0002', '202', '222', 'Propietario', 'Luis', '', '', dEn(10), 'Mañana', 'Cancelada'],
    ['SAL-0003', 'CA-0003', '303', '333', 'Propietario', 'Eva', '', '', dEn(12), 'Día completo', 'PendientePago']
  ];
  const sheet = {
    getDataRange: () => ({ getValues: () => filas.map(f => f.slice()) }),
    appendRow: r => { appended.push(r); filas.push(r); },
    getRange: (row, col) => ({ setValue: v => { filas[row - 1][col - 1] = v; } })
  };
  ctx = vm.createContext({
    console,
    Logger: { log: () => {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { formatDate: (d) => iso(new Date(d)) }
  });
  vm.runInContext(CODIGO, ctx);
  ctx.__sheet = sheet;
  vm.runInContext(
    'ensureSalonSocialSheet = function () { return __sheet; };' +
    'verificarAccesoSalon = function () { return { ok: true, enMora: false, tipo: "Propietario", nombre: "Prueba", numForm: "CA-0042" }; };' +
    'getNextReservaId = function () { return "SAL-0099"; };' +
    'enviarEmailSeguro_ = function () { return { enviado: true }; };' +
    'getConfigValue = function () { return null; };' +
    'safeCell_ = function (v) { return v; };' +
    'hashReservaDedupe = function (a, f, s) { return a + "|" + f + "|" + s; };' +
    'normCc = function (v) { return String(v).replace(/\\D/g, ""); };', ctx);
});

describe('salón por día completo', () => {
  it('dispSalon: un día con reserva antigua de la TARDE queda ocupado completo', () => {
    const r = ctx.dispSalon('402', dEn(0), dEn(15));
    const dia = r.dias.find(d => d.fecha === F_TARDE);
    expect(dia.estado).toBe('reservado');
    expect(dia.manana).toBe('reservado');   // compatibilidad con páginas en caché
    expect(r.dias.find(d => d.fecha === F_LIBRE).estado).toBe('libre');
    expect(r.dias.find(d => d.fecha === dEn(10)).estado).toBe('libre');      // cancelada no ocupa
    expect(r.dias.find(d => d.fecha === dEn(12)).estado).toBe('reservado');  // pendiente sí ocupa
  });

  it('reservarSalon: no permite reservar la mañana de un día que ya tiene la tarde', () => {
    const r = ctx.reservarSalon({ apto: '402', cc: '999', fechaReserva: F_TARDE, slot: 'Mañana' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ya está reservado/);
    expect(appended.length).toBe(0);
  });

  it('reservarSalon: día libre → se guarda como "Día completo" aunque llegue "Tarde"', () => {
    const r = ctx.reservarSalon({ apto: '402', cc: '999', fechaReserva: F_LIBRE, slot: 'Tarde' });
    expect(r.ok).toBe(true);
    expect(appended[0][9]).toBe('Día completo');
    const r2 = ctx.reservarSalon({ apto: '505', cc: '555', fechaReserva: F_LIBRE, slot: 'Día completo' });
    expect(r2.ok).toBe(false);
  });

  it('reservarSalon: rechaza un turno desconocido', () => {
    const r = ctx.reservarSalon({ apto: '402', cc: '999', fechaReserva: F_LIBRE, slot: 'Noche' });
    expect(r.ok).toBe(false);
  });

  it('las reservas antiguas no se modifican', () => {
    ctx.dispSalon('402', dEn(0), dEn(15));
    ctx.reservarSalon({ apto: '402', cc: '999', fechaReserva: F_LIBRE, slot: 'Día completo' });
    expect(filas[1][9]).toBe('Tarde');
    expect(filas[1][10]).toBe('Pagado');
  });

  it('editarReservaSalon: no permite mover una reserva a un día ocupado; sí a uno libre', () => {
    const r = ctx.editarReservaSalon({ reservaId: 'SAL-0003', cc: '333', apto: '303', nuevaFecha: F_TARDE });
    expect(r.ok).toBe(false);
    const r2 = ctx.editarReservaSalon({ reservaId: 'SAL-0003', cc: '333', apto: '303', nuevaFecha: F_LIBRE });
    expect(r2.ok).toBe(true);
    expect(filas[3][9]).toBe('Día completo');
  });

  it('vigilantes: el día muestra la reserva antigua con su turno', () => {
    const r = ctx.vigilanteVerReservasSalon(F_TARDE);
    expect(r.dia.estado).toBe('reservado');
    expect(r.dia.apto).toBe('101');
    expect(r.dia.slot).toBe('Tarde');
  });
});
