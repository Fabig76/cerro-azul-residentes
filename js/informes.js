// ============================================================
// INFORMES CONTABLES — Cerro Azul
// Muestra en qué se gastó la cuota de administración según los
// informes del contador y permite descargar cada informe mensual.
//
// Los datos viven en data/informes.json (lo único que cambia cada mes).
// Este archivo NO se edita en la actualización mensual.
//
// Acceso: el propietario se identifica con N° de formulario, apartamento
// y cédula (acción existente verificarPropietario). Los datos que se
// muestran son agregados del conjunto; no contienen datos personales.
// ============================================================

// ---------- Cálculos puros (sin DOM; se prueban en tests/informes.test.js) ----------
const InformesCalc = (function () {
  // Agrupación fija de los 31 rubros del presupuesto en 8 categorías que entiende un residente.
  const GRUPOS = [
    { id: 'vig', nombre: 'Vigilancia', color: '#0066CC', desc: 'Guardas las 24 horas, los 7 días', r: { vig: 'Vigilancia privada' } },
    { id: 'aseo', nombre: 'Aseo y limpieza', color: '#1E8E5A', desc: 'Personal de aseo e insumos', r: { aseo: 'Servicio de aseo', insAseo: 'Insumos de aseo', dot: 'Dotación zonas comunes' } },
    { id: 'serv', nombre: 'Servicios públicos', color: '#E0A800', desc: 'Energía de zonas comunes, agua e internet', r: { energia: 'Energía', acueducto: 'Acueducto y alcantarillado', otrasEnt: 'Otras entidades', telecom: 'Telecomunicaciones' } },
    { id: 'mtto', nombre: 'Mantenimientos', color: '#F28C28', desc: 'Ascensores, bombas, piscina, locativos', r: { asc: 'Ascensores', mttoGen: 'Mantenimiento general', zh: 'Zonas húmedas (piscina)', motob: 'Motobombas', rci: 'Red contra incendios', tanques: 'Tanques', accesos: 'Accesos (puertas y talanqueras)', elec: 'Eléctrico y bombillería', zverde: 'Zona verde', fumig: 'Fumigación', extCam: 'Extintores y cámaras' } },
    { id: 'seg', nombre: 'Seguros', color: '#7B2CBF', desc: 'Póliza de áreas comunes y equipos', r: { seguros: 'Póliza áreas comunes' } },
    { id: 'hon', nombre: 'Honorarios', color: '#0E8A8A', desc: 'Administración, contabilidad, revisoría', r: { admin: 'Administración', contab: 'Contabilidad', revisor: 'Revisoría fiscal', factura: 'Facturación', sgsst: 'SG-SST' } },
    { id: 'div', nombre: 'Gastos diversos', color: '#8A6D3B', desc: 'Bancarios, asamblea, papelería, imprevistos', r: { banc: 'Gastos bancarios', asamblea: 'Asamblea y consejo', imprev: 'Imprevistos', papel: 'Papelería', eventos: 'Eventos especiales' } },
    { id: 'res', nombre: 'Fondo de imprevistos', color: '#C43D3D', desc: 'Reserva obligatoria del 1 % (Ley 675)', r: { reserva: 'Reserva Ley 675' } }
  ];
  const CLAVES = GRUPOS.reduce((a, g) => a.concat(Object.keys(g.r)), []);
  // Rubros que el presupuesto reparte en 12 meses pero se pagan en una época del año.
  const ESTACIONALES = { eventos: 'eventos de fin de año', fumig: 'fumigación', extCam: 'recarga de extintores y cámaras', dot: 'dotación de zonas comunes', zverde: 'zona verde' };
  const SERV_NOMBRE = { energia: 'energía', acueducto: 'acueducto', otrasEnt: 'otras entidades', telecom: 'internet' };
  const VISTAS = { prom: 0, pres: 1, mes: 2 };

  function cuotaPromedio(mes, n) { return Math.round(mes.cuotasMes / n / 100) * 100; }

  // Valor por apartamento de cada rubro según la vista: prom (acumulado ÷ meses), pres (presupuesto), mes (solo el mes).
  function valorRubro(clave, mes, presupuesto, vista, n) {
    if (vista === 'pres') return presupuesto.rubros[clave] / n;
    const par = mes.rubros[clave];
    return vista === 'mes' ? par[1] / n : par[0] / mes.mesesAcum / n;
  }

  function grupos(mes, presupuesto, vista, n) {
    return GRUPOS.map(g => {
      const items = Object.keys(g.r).map(k => ({ clave: k, nombre: g.r[k], val: valorRubro(k, mes, presupuesto, vista, n) }));
      return { id: g.id, nombre: g.nombre, color: g.color, desc: g.desc, items: items, val: items.reduce((s, i) => s + i.val, 0) };
    });
  }

  // Parte de la cuota que el informe todavía no asigna a un gasto del periodo (solo vista prom).
  function desgloseProyectado(resto, mes, presupuesto, n) {
    const out = []; let usado = 0;
    const fp = Object.keys(mes.facturasPendientes || {});
    if (fp.length) {
      const v = fp.reduce((s, k) => s + presupuesto.rubros[k] * mes.facturasPendientes[k], 0) / mes.mesesAcum / n;
      const val = Math.min(v, resto - usado); usado += val;
      out.push({ texto: 'Facturas de ' + fp.map(k => SERV_NOMBRE[k] + ' (' + mes.facturasPendientes[k] + (mes.facturasPendientes[k] === 1 ? ' mes)' : ' meses)')).join(' y ') + ' que aún no llegan (estimado con el presupuesto)', val: val });
    }
    const est = Object.keys(ESTACIONALES)
      .map(k => ({ nombre: ESTACIONALES[k], val: Math.max(0, presupuesto.rubros[k] * mes.mesesAcum - mes.rubros[k][0]) / mes.mesesAcum / n }))
      .filter(x => x.val > 0);
    const estTot = est.reduce((s, x) => s + x.val, 0);
    if (estTot > 0 && resto - usado > 0) {
      const val = Math.min(estTot, resto - usado); usado += val;
      out.push({ texto: 'Gastos del presupuesto que se hacen más adelante en el año: ' + est.map(x => x.nombre).join(', '), val: val });
    }
    if (resto - usado > 0.5) {
      out.push({ texto: 'Cuotas facturadas que aún no se pagan: respaldan $' + millones(mes.cartera.total) + ' millones por cobrar ($' + millones(mes.cartera.prejuridico) + ' millones en cobro prejurídico)', val: resto - usado });
    }
    return out;
  }

  // Filas del mapa: categorías con valor positivo + franja final (gasto proyectado o diferencia).
  function filas(mes, presupuesto, vista, n) {
    const cuota = cuotaPromedio(mes, n);
    const gs = grupos(mes, presupuesto, vista, n);
    const positivos = gs.filter(g => g.val > 0);
    const negativos = gs.filter(g => g.val <= 0);
    const gasto = positivos.reduce((s, g) => s + g.val, 0);
    const resto = cuota - gasto;
    const rows = positivos.slice();
    if (resto > 0) {
      if (vista === 'prom') {
        rows.push({ id: 'proy', nombre: 'Gasto proyectado', color: '#9AA8B5', desc: 'Gastos comprometidos y cuotas por recaudar', val: resto, partes: desgloseProyectado(resto, mes, presupuesto, n), items: [] });
      } else {
        rows.push({ id: 'proy', nombre: vista === 'pres' ? 'Diferencia de redondeo' : 'Diferencia del mes', color: '#9AA8B5', desc: vista === 'pres' ? 'Entre la cuota facturada y el presupuesto' : 'Propia de un solo mes; ver la nota de arriba', val: resto, partes: [], items: [] });
      }
    }
    return { cuota: cuota, gasto: gasto, rows: rows, negativos: negativos };
  }

  // Comparación presupuesto vs promedio real, por categoría.
  function comparacion(mes, presupuesto, n) {
    const p = grupos(mes, presupuesto, 'pres', n), r = grupos(mes, presupuesto, 'prom', n);
    return p.map((g, i) => ({ id: g.id, nombre: g.nombre, color: g.color, pres: g.val, real: r[i].val, dif: r[i].val - g.val }));
  }

  // Revisa que el archivo de datos sea coherente. Devuelve una lista de errores (vacía = correcto).
  function validar(data) {
    const err = [];
    if (!data || !data.conjunto || !(data.conjunto.apartamentos > 0)) err.push('Falta conjunto.apartamentos');
    const pr = data && data.presupuesto;
    if (!pr || !pr.rubros) { err.push('Falta presupuesto.rubros'); return err; }
    CLAVES.forEach(k => { if (typeof pr.rubros[k] !== 'number') err.push('Presupuesto sin rubro ' + k); });
    const sumaPres = CLAVES.reduce((s, k) => s + (pr.rubros[k] || 0), 0);
    if (Math.abs(sumaPres - pr.mensual) > 2) err.push('La suma del presupuesto (' + sumaPres + ') no coincide con presupuesto.mensual (' + pr.mensual + ')');
    if (!Array.isArray(data.meses) || !data.meses.length) { err.push('No hay meses'); return err; }
    const ids = {};
    data.meses.forEach(m => {
      const p = '[' + (m.id || '?') + '] ';
      if (!/^\d{4}-\d{2}$/.test(m.id || '')) err.push(p + 'id debe ser AAAA-MM');
      if (ids[m.id]) err.push(p + 'mes repetido'); ids[m.id] = true;
      ['nombre', 'corto', 'resumen', 'alertaMes', 'pdf', 'publicado'].forEach(c => { if (!m[c]) err.push(p + 'falta ' + c); });
      if (m.pdf && !/^https:\/\/drive\.google\.com\//.test(m.pdf)) err.push(p + 'pdf debe ser un enlace de Google Drive');
      if (!(m.mesesAcum >= 1 && m.mesesAcum <= 12)) err.push(p + 'mesesAcum debe estar entre 1 y 12');
      if (m.id && m.mesesAcum !== Number(m.id.slice(5, 7))) err.push(p + 'mesesAcum no corresponde al mes del id');
      if (!(m.cuotasMes > 0)) err.push(p + 'falta cuotasMes');
      if (!m.cartera || !(m.cartera.total >= 0) || !(m.cartera.prejuridico >= 0)) err.push(p + 'falta cartera.total o cartera.prejuridico');
      if (!m.rubros) { err.push(p + 'faltan rubros'); return; }
      CLAVES.forEach(k => { const v = m.rubros[k]; if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number') err.push(p + 'rubro ' + k + ' debe ser [acumulado, mes]'); });
      Object.keys(m.rubros).forEach(k => { if (CLAVES.indexOf(k) === -1) err.push(p + 'rubro desconocido ' + k); });
      const sAcum = CLAVES.reduce((s, k) => s + ((m.rubros[k] || [0, 0])[0]), 0);
      const sMes = CLAVES.reduce((s, k) => s + ((m.rubros[k] || [0, 0])[1]), 0);
      if (Math.abs(sAcum - m.egresosAcum) > 2) err.push(p + 'suma acumulada ' + sAcum + ' ≠ egresosAcum ' + m.egresosAcum);
      if (Math.abs(sMes - m.egresosMes) > 2) err.push(p + 'suma del mes ' + sMes + ' ≠ egresosMes ' + m.egresosMes);
      Object.keys(m.facturasPendientes || {}).forEach(k => { if (!SERV_NOMBRE[k]) err.push(p + 'facturasPendientes con rubro no permitido ' + k); });
    });
    (data.archivo || []).forEach((a, i) => {
      if (!a.nombre || !a.pdf) err.push('archivo[' + i + '] necesita nombre y pdf');
      else if (!/^https:\/\/drive\.google\.com\//.test(a.pdf)) err.push('archivo[' + i + '] pdf debe ser un enlace de Google Drive');
    });
    const anios = {}; data.meses.forEach(m => { anios[(m.id || '').slice(0, 4)] = true; });
    if (Object.keys(anios).length > 1) err.push('Todos los meses deben ser del mismo año que el presupuesto; mueva los del año anterior a archivo');
    if (data.meses[0] && pr.anio && String(pr.anio) !== String(data.meses[0].id).slice(0, 4)) err.push('presupuesto.anio no coincide con el año de los meses');
    return err;
  }

  function millones(v) { return (v / 1e6).toFixed(1).replace('.', ','); }

  return { GRUPOS: GRUPOS, CLAVES: CLAVES, VISTAS: VISTAS, cuotaPromedio: cuotaPromedio, grupos: grupos, filas: filas, desgloseProyectado: desgloseProyectado, comparacion: comparacion, validar: validar, millones: millones };
})();

if (typeof module !== 'undefined') module.exports = InformesCalc;

// ---------- Interfaz ----------
(function () {
  if (typeof document === 'undefined') return;
  const SESION = 'infAcceso';
  let DATA = null, N = 625, mesSel = null, vistaSel = 'prom';

  const $ = s => document.querySelector(s);
  const esc = s => CA.escapeHtml(s);
  const fmt = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-CO');
  const pct = (a, b) => (100 * a / b).toFixed(1).replace('.', ',') + ' %';

  function showView(id) {
    ['#view-inf-login', '#view-inf'].forEach(v => $(v).classList.toggle('hidden', v !== id));
    window.scrollTo(0, 0);
  }
  function alerta(sel, msg) { const a = $(sel); a.className = 'alert alert-err'; a.textContent = msg; }

  async function ingresar() {
    const numForm = $('#infNumForm').value.trim(), apto = $('#infApto').value.trim(), ccProp = $('#infCc').value.trim();
    if (!numForm || !apto || !ccProp) { alerta('#alert-inf-login', 'Complete los tres datos: N° de formulario, apartamento y cédula.'); return; }
    await CA.withBusy($('#btnInfIngresar'), 'Verificando...', async () => {
      try {
        const r = await CA.api({ action: 'verificarPropietario', numForm: numForm, apto: apto, ccProp: ccProp }, { method: 'GET' });
        if (!r.ok) { alerta('#alert-inf-login', r.error || 'No se pudo verificar sus datos.'); return; }
        try { sessionStorage.setItem(SESION, '1'); } catch { /* sin almacenamiento: la sesión dura solo esta vista */ }
        await abrir();
      } catch (e) { alerta('#alert-inf-login', e.message); }
    });
  }

  async function abrir() {
    try {
      DATA = await CA.getJson('data/informes.json');
    } catch (e) { alerta('#alert-inf-login', 'No se pudieron cargar los informes. ' + e.message); return; }
    const errores = InformesCalc.validar(DATA);
    if (errores.length) {
      console.error('[Informes] Datos con errores:', errores);
      alerta('#alert-inf-login', 'Los informes se están actualizando. Intente de nuevo más tarde.');
      return;
    }
    N = DATA.conjunto.apartamentos;
    DATA.meses.sort((a, b) => (a.id < b.id ? 1 : -1));
    mesSel = DATA.meses[0].id;
    $('#infMeses').innerHTML = DATA.meses.map(m => '<button type="button" data-m="' + esc(m.id) + '">' + esc(m.nombre) + '</button>').join('');
    showView('#view-inf');
    dibujar();
  }

  function salir() {
    try { sessionStorage.removeItem(SESION); } catch { /* nada */ }
    ['#infNumForm', '#infApto', '#infCc'].forEach(s => { $(s).value = ''; });
    showView('#view-inf-login');
  }

  function dibujar() {
    const mes = DATA.meses.find(m => m.id === mesSel);
    const pr = DATA.presupuesto;
    const F = InformesCalc.filas(mes, pr, vistaSel, N);
    document.querySelectorAll('#infMeses button').forEach(b => b.classList.toggle('on', b.dataset.m === mesSel));
    document.querySelectorAll('#infVistas button').forEach(b => b.classList.toggle('on', b.dataset.v === vistaSel));
    $('#infBig').textContent = fmt(F.cuota);
    $('#infBigSub').textContent = 'cuota promedio por apartamento facturada en ' + mes.corto;
    $('#infHeroP').textContent = 'De cada ' + fmt(F.cuota) + ' que pagaste, así se repartió el gasto del conjunto según el informe del contador de ' + mes.corto + '. Toca cada rubro para ver el detalle.';
    $('#infVistaProm').textContent = 'Promedio mensual ' + pr.anio + ' (enero a ' + mes.corto + ')';
    $('#infVistaMes').textContent = 'Solo ' + mes.corto + ', tal cual';
    const notas = {
      prom: 'Promedio de los ' + mes.mesesAcum + ' meses con informe. Es la vista más fiel: reparte entre todos los meses las facturas que llegan cada dos o tres meses, como energía y seguros.',
      pres: 'Lo que la asamblea aprobó para ' + pr.anio + ': $' + InformesCalc.millones(pr.mensual) + ' millones al mes, equivalentes a ' + fmt(pr.mensual / N) + ' por apartamento.',
      mes: mes.alertaMes
    };
    const titulos = {
      prom: 'Así se repartió tu cuota, en promedio, cada mes de ' + pr.anio + ' (enero a ' + mes.corto + ')',
      pres: 'Así se planeó repartir tu cuota en el presupuesto ' + pr.anio,
      mes: 'Así quedó ' + mes.corto + ', sin promediar'
    };
    const fuentes = {
      prom: 'Fuente: ejecución presupuestal acumulada a ' + mes.nombre.toLowerCase() + ', informe del contador; dividida entre ' + mes.mesesAcum + ' meses y ' + N + ' apartamentos. Cifras en pesos por apartamento.',
      pres: 'Fuente: presupuesto ' + pr.anio + ' aprobado, presupuesto mensual dividido entre ' + N + ' apartamentos.',
      mes: 'Fuente: ejecución presupuestal, columna ' + mes.corto + ', informe del contador; dividida entre ' + N + ' apartamentos.'
    };
    const nota = $('#infNota'); nota.textContent = notas[vistaSel]; nota.className = 'inf-note' + (vistaSel === 'mes' ? ' warn' : '');
    $('#infMapTitulo').textContent = titulos[vistaSel];
    $('#infFuente').textContent = fuentes[vistaSel];
    dibujarMapa(F);
    dibujarLeyenda(F);
    dibujarComparacion(mes, pr);
    dibujarInformes();
  }

  function dibujarMapa(F) {
    const svg = $('#infMapa');
    // En celular se dibuja una versión angosta: nombre y valor uno debajo del otro, sin desplazamiento lateral.
    const compacto = window.matchMedia('(max-width: 700px)').matches;
    const W = compacto ? 440 : 960, left = compacto ? 6 : 30, lw = compacto ? 92 : 120, right = compacto ? 196 : 600, rw = 12, top = 20, gap = compacto ? 8 : 10, MINH = compacto ? 42 : 38, base = 480;
    const total = Math.max(F.cuota, F.gasto);
    const hs = F.rows.map(r => Math.max(base * (r.val / total), MINH));
    const H = top * 2 + hs.reduce((a, b) => a + b, 0) + gap * (F.rows.length - 1) + (F.gasto > F.cuota ? 24 : 0);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const lh = base * (F.cuota / total), ly0 = top + Math.max(0, (H - top * 2 - lh) / 2);
    let h = '<rect x="' + left + '" y="' + ly0 + '" width="' + lw + '" height="' + lh + '" rx="12" fill="#0066CC"/>';
    h += '<text x="' + (left + lw / 2) + '" y="' + (ly0 + lh / 2 - 8) + '" text-anchor="middle" class="inf-amt inf-blanco">' + fmt(F.cuota) + '</text>';
    h += '<text x="' + (left + lw / 2) + '" y="' + (ly0 + lh / 2 + 12) + '" text-anchor="middle" class="inf-sub inf-blanco">tu cuota</text>';
    let sy = ly0, y = top;
    F.rows.forEach((r, i) => {
      const hh = hs[i], sh = base * (r.val / total), x0 = left + lw, x1 = right, cx = (x0 + x1) / 2, ty = y + Math.min(hh / 2, 14) + 4;
      h += '<path class="inf-ribbon" data-id="' + r.id + '" d="M' + x0 + ' ' + sy + ' C' + cx + ' ' + sy + ' ' + cx + ' ' + y + ' ' + x1 + ' ' + y + ' L' + x1 + ' ' + (y + hh) + ' C' + cx + ' ' + (y + hh) + ' ' + cx + ' ' + (sy + sh) + ' ' + x0 + ' ' + (sy + sh) + ' Z" fill="' + r.color + '"/>';
      h += '<g class="inf-node" data-id="' + r.id + '"><rect x="' + right + '" y="' + y + '" width="' + rw + '" height="' + hh + '" rx="4" fill="' + r.color + '"/>';
      h += '<text x="' + (right + rw + 12) + '" y="' + ty + '" class="inf-lbl">' + esc(r.nombre) + '</text>';
      if (compacto) {
        h += '<text x="' + (right + rw + 12) + '" y="' + (ty + 19) + '" class="inf-amt">' + fmt(r.val) + ' <tspan class="inf-sub">· ' + pct(r.val, F.cuota) + '</tspan></text></g>';
      } else {
        h += '<text x="' + (W - 20) + '" y="' + ty + '" text-anchor="end" class="inf-amt">' + fmt(r.val) + '</text>';
        h += '<text x="' + (right + rw + 12) + '" y="' + (ty + 18) + '" class="inf-sub">' + pct(r.val, F.cuota) + ' de tu cuota</text></g>';
      }
      sy += sh; y += hh + gap;
    });
    if (F.gasto > F.cuota) h += '<text x="' + left + '" y="' + (H - 8) + '" class="inf-sub inf-rojo">' + (compacto ? 'El gasto del mes superó la cuota en ' + fmt(F.gasto - F.cuota) + '.' : 'Este mes el gasto (' + fmt(F.gasto) + ') superó la cuota en ' + fmt(F.gasto - F.cuota) + ' por apartamento; se cubrió con otros ingresos y reservas.') + '</text>';
    svg.innerHTML = h;
    svg.querySelectorAll('.inf-node').forEach(g => g.addEventListener('click', () => {
      const it = document.querySelector('.inf-item[data-id="' + g.dataset.id + '"]');
      if (it) { it.click(); it.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }));
  }

  function dibujarLeyenda(F) {
    const leg = $('#infLeyenda');
    const det = r => {
      const partes = (r.partes || []).map(p => '<div><span>' + esc(p.texto) + '</span><span>' + fmt(p.val) + '</span></div>');
      const items = r.items.filter(i => Math.round(i.val) !== 0).map(i => '<div><span>' + esc(i.nombre) + '</span><span>' + fmt(i.val) + '</span></div>');
      return partes.concat(items).join('') || '<div><span>Sin detalle adicional</span></div>';
    };
    leg.innerHTML = F.rows.map(r => '<button type="button" class="inf-item' + (r.id === 'proy' ? ' inf-ancho open' : '') + '" data-id="' + r.id + '"><i style="background:' + r.color + '"></i><span class="inf-it-txt"><b>' + esc(r.nombre) + '</b><span>' + esc(r.desc) + '</span></span><em>' + fmt(r.val) + '</em><span class="inf-det">' + det(r) + '</span></button>').join('')
      + F.negativos.map(r => '<div class="inf-item"><i style="background:' + r.color + '"></i><span class="inf-it-txt"><b>' + esc(r.nombre) + '</b><span>Este mes registró un ajuste a favor: ' + fmt(r.val) + '</span></span><em>—</em></div>').join('');
    leg.querySelectorAll('button.inf-item').forEach(el => el.addEventListener('click', () => {
      el.classList.toggle('open');
      document.querySelectorAll('.inf-ribbon').forEach(p => p.classList.toggle('on', p.dataset.id === el.dataset.id && el.classList.contains('open')));
    }));
  }

  function dibujarComparacion(mes, pr) {
    const C = InformesCalc.comparacion(mes, pr, N);
    const max = Math.max.apply(null, C.map(c => Math.max(c.pres, c.real)));
    const tp = C.reduce((s, c) => s + c.pres, 0), tr = C.reduce((s, c) => s + c.real, 0);
    $('#infBarsP').textContent = 'Barra gris: presupuesto ' + pr.anio + '. Barra de color: promedio real de enero a ' + mes.corto + '. En rojo lo que va por encima del presupuesto; en verde lo que va por debajo.';
    $('#infBars').innerHTML = C.map(c => '<div class="inf-brow"><span>' + esc(c.nombre) + '</span><div class="inf-trk"><i class="p" style="width:' + (100 * c.pres / max) + '%"></i><i class="g" style="width:' + (100 * c.real / max) + '%;background:' + c.color + '"></i></div><em class="' + (c.dif > 0 ? 'up' : 'dn') + '">' + (c.dif > 0 ? '+' : '') + fmt(c.dif) + '</em></div>').join('')
      + '<div class="inf-brow inf-total"><span>Total</span><span class="inf-tot-txt">Presupuesto ' + fmt(tp) + ' · Real ' + fmt(tr) + '</span><em class="' + (tr - tp > 0 ? 'up' : 'dn') + '">' + (tr - tp > 0 ? '+' : '') + fmt(tr - tp) + '</em></div>';
  }

  function dibujarInformes() {
    const pr = DATA.presupuesto;
    $('#infReportes').innerHTML = DATA.meses.map((m, i) => '<div class="inf-rep">' + (i === 0 ? '<span class="inf-pill">Más reciente</span>' : '') + '<b>' + esc(m.nombre) + '</b><p>' + esc(m.resumen) + '</p><a class="btn btn-primary" href="' + esc(m.pdf) + '" target="_blank" rel="noopener">⬇ Descargar informe</a></div>').join('')
      + (DATA.archivo || []).map(a => '<div class="inf-rep"><b>' + esc(a.nombre) + '</b><p>' + esc(a.resumen || 'Informe de un año anterior.') + '</p><a class="btn btn-secondary" href="' + esc(a.pdf) + '" target="_blank" rel="noopener">⬇ Descargar informe</a></div>').join('')
      + (pr.pdf ? '<div class="inf-rep"><b>Presupuesto ' + esc(pr.anio) + '</b><p>Presupuesto aprobado: $' + InformesCalc.millones(pr.anual) + ' millones al año, $' + InformesCalc.millones(pr.mensual) + ' millones al mes.</p><a class="btn btn-secondary" href="' + esc(pr.pdf) + '" target="_blank" rel="noopener">⬇ Ver presupuesto</a></div>' : '');
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('view-inf-login')) return; // el script solo actúa en informes.html
    $('#btnInfIngresar').addEventListener('click', ingresar);
    $('#infCc').addEventListener('keydown', e => { if (e.key === 'Enter') ingresar(); });
    $('#btnInfSalir').addEventListener('click', salir);
    $('#infMeses').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { mesSel = b.dataset.m; dibujar(); } });
    $('#infVistas').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { vistaSel = b.dataset.v; dibujar(); } });
    let ancho = window.innerWidth;
    window.addEventListener('resize', () => { if (DATA && Math.abs(window.innerWidth - ancho) > 80) { ancho = window.innerWidth; dibujar(); } });
    let activo = false;
    try { activo = sessionStorage.getItem(SESION) === '1'; } catch { activo = false; }
    if (activo) abrir();
  });
})();
