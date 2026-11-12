// Harness de paridad: carga cada página del portal con la red bloqueada y el
// backend simulado, y registra qué elementos con id están visibles, qué
// controles quedan tapados y qué errores de consola aparecen.
// Uso: node snap.js <carpeta-del-portal> <etiqueta>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2]);
const LABEL = process.argv[3];
const OUT = path.join(__dirname, 'out', LABEL);
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' };

const STUBS = {
  ecConsultar: {
    ok: true, periodo: '2026-10', pestana: 'OCT 2026', fechaCorte: '2026-10-31', apto: '9999',
    nombrePropietario: 'PROPIETARIO DE PRUEBA',
    cartera: { apto: '9999', totalCartera: 0, valorAdmon: 205000, conceptos: [{ nombre: 'Administración', valor: 0 }], anticipos: 0, mesesProm: 0 },
    factura: { numCuentaCobro: '12345', fechaEmision: '2026-11-01', pagueseHasta: '2026-11-15', totalAPagar: 205000 },
    facturaDisponible: true,
    pagos: [{ periodo: '2026-10', abono: 205000 }, { periodo: '2026-09', abono: 205000 }, { periodo: '2026-08', abono: 0 }],
    pazYSalvoHabilitado: true, linkPago: 'https://example.com/pago'
  },
  adminLogin: { ok: true, token: 'tok-prueba' },
  vigilanteLogin: { ok: true, token: 'tok-prueba' },
  ping: { ok: true }
};
const ecMora = JSON.parse(JSON.stringify(STUBS.ecConsultar));
ecMora.cartera.totalCartera = 410000; ecMora.pazYSalvoHabilitado = false;

async function nuevaPagina(browser, vp, opts) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: 'light' });
  const page = await ctx.newPage();
  const errores = [];
  const llamadas = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text().slice(0, 160)); });
  await page.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.hostname === 'ca.test') {
      const f = path.join(ROOT, decodeURIComponent(u.pathname));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        return route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
      }
      return route.fulfill({ status: 404, body: 'no' });
    }
    if (u.hostname.endsWith('script.google.com')) {
      let action = u.searchParams.get('action') || '';
      try { const b = JSON.parse(req.postData() || '{}'); action = b.action || action; } catch (e) {}
      llamadas.push(req.method() + ' ' + action);
      let body = STUBS[action] || { ok: false, error: 'simulado' };
      if (action === 'ecConsultar' && opts && opts.mora) body = ecMora;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    }
    return route.abort();
  });
  return { ctx, page, errores, llamadas };
}

// Estado observable de la página
async function estado(page) {
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' }).catch(() => {});
  return page.evaluate(() => {
    const vis = (el) => !!(el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
    const ids = {};
    document.querySelectorAll('[id]').forEach((el) => {
      if (el.id.indexOf('vd-') === 0 || el.closest('[data-vd]')) return; // lo nuevo no cuenta
      ids[el.id] = vis(el);
    });
    // Controles tapados
    const tapados = [];
    document.querySelectorAll('button, a[href], input, select, textarea, summary, .section-head').forEach((el) => {
      if (el.closest('[data-vd]') || (el.id || '').indexOf('vd-') === 0) return;
      if (!vis(el) || el.disabled) return;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const ok = t && (t === el || el.contains(t) || t.contains(el) || (t.closest('label') && t.closest('label').contains(el)));
      if (!ok) {
        const n = (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]) + ' «' + (el.textContent || '').trim().slice(0, 24) + '»';
        const por = t ? (t.id ? '#' + t.id : t.tagName.toLowerCase() + '.' + String(t.className).split(' ')[0]) : 'nada';
        tapados.push(n + ' <- ' + por);
      }
    });
    window.scrollTo(0, 0);
    // Antepasados de modales que los atraparían
    const atrapa = [];
    document.querySelectorAll('.modal-overlay, #ca-banner, #ca-ventana').forEach((m) => {
      for (let a = m.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        const bf = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
        if (cs.transform !== 'none' || cs.filter !== 'none' || bf !== 'none' || cs.perspective !== 'none' || (cs.contain && cs.contain !== 'none') || /transform|filter|perspective/.test(cs.willChange || '')) {
          atrapa.push((m.id || m.className) + ' atrapado por ' + (a.id ? '#' + a.id : a.tagName.toLowerCase() + '.' + a.className));
        }
      }
    });
    const desborde = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return { ids, tapados, atrapa, desborde };
  });
}

// El formulario se llamó index.html hasta el 12-nov-2026; desde entonces es
// formulario.html y index.html es la portada. Las claves no cambian de nombre
// para poder comparar una versión con otra.
const FORM = fs.existsSync(path.join(ROOT, 'formulario.html')) ? 'formulario.html' : 'index.html';
const PORTADA = FORM === 'formulario.html' ? 'index.html' : 'inicio.html';
const clave = (p) => (p === FORM ? 'index.html' : p === PORTADA ? 'portada' : p);
const PAGINAS = [FORM, 'residente.html', 'salon-social.html', 'estado-cuenta.html', 'informes.html', 'admin.html', 'vigilantes.html', 'cartera-admin.html', 'fumigacion.html'];
if (fs.existsSync(path.join(ROOT, PORTADA))) PAGINAS.push(PORTADA);
const VPS = { pc: { width: 1280, height: 900 }, cel: { width: 390, height: 844 } };

(async () => {
  const browser = await chromium.launch();
  const res = {};
  const guardar = async (clave, page, errores, foto) => {
    await page.waitForTimeout(700);
    res[clave] = Object.assign(await estado(page), { errores: errores.slice() });
    if (foto) await page.screenshot({ path: path.join(OUT, clave.replace(/[^a-z0-9]+/gi, '_') + '.png'), fullPage: true });
  };

  for (const [vn, vp] of Object.entries(VPS)) {
    for (const p of PAGINAS) {
      const { ctx, page, errores } = await nuevaPagina(browser, vp);
      await page.goto('http://ca.test/' + p, { waitUntil: 'load' });
      await guardar(vn + ':' + clave(p), page, errores, true);

      if (p === FORM) {
        for (const modo of ['edit', 'mudanzas', 'create']) {
          await page.click('.mode-tab[data-mode="' + modo + '"]');
          await guardar(vn + ':index:modo-' + modo, page, errores, modo !== 'create');
        }
        // abrir todas las secciones con el mecanismo propio de la página
        const heads = await page.$$('.section.collapsed .section-head');
        for (const h of heads) await h.click();
        await guardar(vn + ':index:todo-abierto', page, errores, true);
        await page.click('#temaToggle');
        await guardar(vn + ':index:oscuro', page, errores, true);
      }
      if (p === 'estado-cuenta.html') {
        await page.fill('#ecNumForm', 'CA-0083'); await page.fill('#ecApto', '9999'); await page.fill('#ecCc', '123456');
        await page.click('#btnEcConsultar');
        await page.waitForSelector('#view-estado:not(.hidden)', { timeout: 5000 });
        await guardar(vn + ':estado:resultado', page, errores, true);
        await page.click('#btnEcSalir');
        await guardar(vn + ':estado:salir', page, errores, false);
        // validación vacía: debe mostrar el aviso y no quedarse cargando
        await page.fill('#ecNumForm', '');
        await page.click('#btnEcConsultar');
        await guardar(vn + ':estado:validacion', page, errores, true);
      }
      if (p === 'admin.html' || p === 'vigilantes.html') {
        await page.fill('#loginPassword', 'x');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(600);
        const btn = await page.$('#btnLogin, #loginBtn, .login-card .btn-primary');
        if (btn && await btn.isVisible()) await btn.click().catch(() => {});
        await guardar(vn + ':' + p + ':dentro', page, errores, true);
      }
      await ctx.close();
    }
    // estado de cuenta con saldo pendiente
    const m = await nuevaPagina(browser, vp, { mora: true });
    await m.page.goto('http://ca.test/estado-cuenta.html', { waitUntil: 'load' });
    await m.page.fill('#ecNumForm', 'CA-0083'); await m.page.fill('#ecApto', '9999'); await m.page.fill('#ecCc', '123456');
    await m.page.click('#btnEcConsultar');
    await m.page.waitForSelector('#view-estado:not(.hidden)', { timeout: 5000 });
    await guardar(vn + ':estado:mora', m.page, m.errores, true);
    await m.ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'estado.json'), JSON.stringify(res, null, 1));
  console.log('listo', LABEL, Object.keys(res).length, 'estados');
})().catch((e) => { console.error(e); process.exit(1); });
