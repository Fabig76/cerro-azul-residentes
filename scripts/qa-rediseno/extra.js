// Pruebas de flujo de lo NUEVO (pasos, aviso de consulta, modales, tema oscuro)
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(process.argv[2]); const OUT = path.join(__dirname, 'out', 'extra'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
const EC = {"ok":true,"periodo":"2026-10","pestana":"OCT 2026","fechaCorte":"2026-10-31","apto":"9999","nombrePropietario":"PROPIETARIO DE PRUEBA","cartera":{"apto":"9999","totalCartera":0,"valorAdmon":205000,"conceptos":[{"nombre":"Administración","valor":0}],"anticipos":0,"mesesProm":0},"factura":{"numCuentaCobro":"12345","fechaEmision":"01/11/2026","pagueseHasta":"15/11/2026","totalAPagar":205000},"facturaDisponible":true,"pagos":[{"periodo":"2026-10","abono":205000},{"periodo":"2026-09","abono":205000},{"periodo":"2026-08","abono":0}],"pazYSalvoHabilitado":true,"linkPago":"https://example.com/pago"};
let ok = 0, mal = 0;
const afirmar = (c, m) => { if (c) { ok++; console.log('  ✓', m); } else { mal++; console.log('  ✗', m); } };
async function abrir(browser, vp, pagina, opt = {}) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: opt.oscuro ? 'dark' : 'light' });
  const page = await ctx.newPage(); const errores = []; const pings = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'ca.test') { const f = path.join(ROOT, decodeURIComponent(u.pathname)); return fs.existsSync(f) ? route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }) : route.fulfill({ status: 404, body: '' }); }
    if (u.hostname.endsWith('script.google.com')) {
      let action = u.searchParams.get('action') || ''; try { action = JSON.parse(route.request().postData() || '{}').action || action; } catch (e) {}
      if (action === 'ping') { pings.push(route.request().method()); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
      if (opt.lento) await new Promise((r) => setTimeout(r, 1500));
      const body = action === 'ecConsultar' ? (opt.falla ? { ok: false, error: 'La cédula no coincide.' } : EC) : { ok: false, error: 'simulado' };
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    }
    return route.abort();
  });
  await page.goto('http://ca.test/' + pagina, { waitUntil: 'load' }); await page.waitForTimeout(500);
  return { ctx, page, errores, pings };
}
(async () => {
  const b = await chromium.launch(); const PC = { width: 1280, height: 900 }, CEL = { width: 390, height: 844 };

  console.log('Pasos del formulario (celular)');
  let s = await abrir(b, CEL, 'index.html');
  const n = await s.page.$$eval('#mainForm .section', (x) => x.length);
  afirmar(await s.page.textContent('#vd-pasos b') === 'Paso 1 de ' + n, 'indicador inicial: Paso 1 de ' + n);
  await s.page.click('#mainForm .section:nth-of-type(1) input[type=radio]', { force: true }).catch(() => {});
  const radio0 = await s.page.$eval('#mainForm .section input[type=radio]', (e) => e.checked);
  await s.page.click('.vd-pasos-sig'); await s.page.waitForTimeout(700);
  let abiertas = await s.page.$$eval('#mainForm .section', (x) => x.map((e, i) => e.classList.contains('collapsed') ? null : i).filter((i) => i !== null));
  afirmar(abiertas.length === 1 && abiertas[0] === 1, 'Siguiente abre solo la sección 2 → ' + JSON.stringify(abiertas));
  const campo = await s.page.$('#mainForm .section:not(.collapsed) input[type=text]:not(:disabled)');
  await campo.fill('PRUEBA VALOR'); const idCampo = await campo.getAttribute('id');
  await s.page.click('.vd-pasos-sig'); await s.page.click('.vd-pasos-sig'); await s.page.waitForTimeout(600);
  afirmar(await s.page.textContent('#vd-pasos b') === 'Paso 4 de ' + n, 'avanza hasta el paso 4');
  afirmar(await s.page.$eval('#' + idCampo, (e) => e.value) === 'PRUEBA VALOR', 'el valor escrito en una sección cerrada se conserva (#' + idCampo + ')');
  afirmar(await s.page.$eval('#mainForm .section input[type=radio]', (e) => e.checked) === radio0, 'la opción marcada en el paso 1 se conserva');
  await s.page.screenshot({ path: path.join(OUT, 'cel_pasos.png') });
  // abrir a mano la sección 7 con el mecanismo propio del formulario
  await s.page.click('#mainForm .section:nth-of-type(7) .section-head'); await s.page.waitForTimeout(300);
  afirmar(await s.page.textContent('#vd-pasos b') === 'Paso 7 de ' + n, 'abrir una sección a mano mueve el indicador');
  await s.page.click('.vd-pasos-ant'); await s.page.waitForTimeout(500);
  afirmar(await s.page.textContent('#vd-pasos b') === 'Paso 6 de ' + n, 'Anterior retrocede');
  // envío vacío: la validación propia debe seguir abriendo las secciones con error
  await s.page.click('#mainForm button[type=submit], #btnEnviar, .actions-bar .btn-primary'); await s.page.waitForTimeout(600);
  const conError = await s.page.$$eval('#mainForm .section', (x) => x.filter((e) => e.querySelector('.has-error')).map((e) => e.classList.contains('collapsed')));
  afirmar(conError.length > 0 && conError.every((c) => c === false), 'al enviar vacío, la validación original abre las ' + conError.length + ' secciones con error');
  // modal: forzar visible y medir que cubre la pantalla
  const rect = await s.page.evaluate(() => { const m = document.getElementById('modalClearResidente'); document.getElementById('zona-borrado').classList.remove('hidden'); m.classList.remove('hidden'); const r = m.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), window.innerWidth, window.innerHeight]; });
  afirmar(rect[0] === 0 && rect[1] === 0 && rect[2] === rect[4] && rect[3] === rect[5], 'la ventana modal de borrado cubre toda la pantalla ' + JSON.stringify(rect));
  await s.page.screenshot({ path: path.join(OUT, 'cel_modal.png') });
  afirmar(s.errores.length === 0, 'sin errores de JavaScript' + (s.errores.length ? ': ' + s.errores.join(' | ') : ''));
  afirmar(s.pings.length === 1 && s.pings[0] === 'GET', 'un solo ping de precalentado (GET)');
  await s.ctx.close();

  console.log('Modal del panel de administración');
  s = await abrir(b, PC, 'admin.html');
  const r2 = await s.page.evaluate(() => { const m = document.getElementById('modal-cancelar-salon'); m.classList.remove('hidden'); const r = m.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), window.innerWidth, window.innerHeight]; });
  afirmar(r2[0] === 0 && r2[1] === 0 && r2[2] === r2[4] && r2[3] === r2[5], 'la ventana modal de cancelar reserva cubre toda la pantalla');
  await s.page.screenshot({ path: path.join(OUT, 'pc_admin_modal.png') });
  await s.ctx.close();

  console.log('Aviso de consulta (estado de cuenta)');
  s = await abrir(b, CEL, 'estado-cuenta.html', { lento: true });
  await s.page.click('#btnEcConsultar'); await s.page.waitForTimeout(200);
  afirmar(await s.page.$eval('#vd-consultando', (e) => e.hidden) === true, 'con campos vacíos no aparece "consultando" (manda la validación original)');
  await s.page.fill('#ecNumForm', 'CA-0083'); await s.page.fill('#ecApto', '9999'); await s.page.fill('#ecCc', '123456');
  await s.page.click('#btnEcConsultar'); await s.page.waitForTimeout(400);
  afirmar(await s.page.$eval('#vd-consultando', (e) => e.hidden) === false, 'mientras el servidor responde se ve "Consultando…"');
  await s.page.screenshot({ path: path.join(OUT, 'cel_consultando.png') });
  await s.page.waitForSelector('#view-estado:not(.hidden)', { timeout: 6000 });
  afirmar(await s.page.$eval('#vd-consultando', (e) => e.hidden) === true, 'al llegar la respuesta el aviso se oculta');
  afirmar(await s.page.$eval('#vd-tarjeta', (e) => !e.hidden) && await s.page.textContent('.vd-tarjeta-apto b') === '9999', 'la tarjeta 3D muestra el apartamento 9999');
  await s.page.click('#btnEcSalir'); await s.page.waitForTimeout(300);
  afirmar(await s.page.$eval('#view-login', (e) => !e.classList.contains('hidden')), 'Salir vuelve al ingreso');
  await s.ctx.close();
  s = await abrir(b, CEL, 'estado-cuenta.html', { lento: true, falla: true });
  await s.page.fill('#ecNumForm', 'CA-0083'); await s.page.fill('#ecApto', '9999'); await s.page.fill('#ecCc', '1');
  await s.page.press('#ecCc', 'Enter'); await s.page.waitForTimeout(2300);
  const al = await s.page.textContent('#alert-ec-login');
  afirmar(await s.page.$eval('#vd-consultando', (e) => e.hidden) === true, 'si el servidor rechaza, el aviso se oculta y queda el error original: «' + al + '»');
  await s.ctx.close();

  console.log('Capturas de pantalla (vista real, no página completa)');
  for (const [nom, vp, pag, opt] of [['pc_inicio', PC, 'inicio.html', {}], ['pc_inicio_oscuro', PC, 'inicio.html', { oscuro: true }], ['cel_inicio', CEL, 'inicio.html', {}], ['cel_inicio_oscuro', CEL, 'inicio.html', { oscuro: true }], ['pc_index_oscuro', PC, 'index.html', { oscuro: true }], ['cel_index_oscuro', CEL, 'index.html', { oscuro: true }], ['pc_informes_oscuro', PC, 'informes.html', { oscuro: true }], ['cel_residente', CEL, 'residente.html', {}], ['cel_salon', CEL, 'salon-social.html', {}]]) {
    s = await abrir(b, vp, pag, opt); await s.page.waitForTimeout(600);
    await s.page.screenshot({ path: path.join(OUT, nom + '.png') });
    afirmar(s.errores.length === 0, nom + ' sin errores'); await s.ctx.close();
  }
  await b.close();
  console.log('\n' + ok + ' comprobaciones correctas, ' + mal + ' fallidas'); process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
