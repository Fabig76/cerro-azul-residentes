// ============================================================
// PORTAL DE VIGILANCIA — Cerro Azul (V9)
// Vista de solo lectura + check de mudanzas. Sin acceso a contacto
// privado (correos, celulares, telefonos).
// Backend: V9 (5 endpoints nuevos: vigilanteLogin, vigilanteVerResidentes,
//   vigilanteVerMudanzas, vigilanteCheckMudanza, vigilanteLeerContrasena)
// ============================================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec';

const V = {
  // Helper para fetch (agregado en F5 del módulo salón social)
  async apiGet(params) {
    const url = new URL(APPS_SCRIPT_URL);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null) url.searchParams.set(k, v);
    });
    const r = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    return r.json();
  },

  state: {
    loggedIn: false,
    activeTab: 'residentes',
    lastResults: []
  },

  log(msg) { console.log('[V]', msg); },

  showAlert(msg, kind) {
    const el = document.getElementById('alert');
    el.className = 'alert alert-' + (kind || 'info');
    el.innerHTML = msg;
    el.classList.remove('hidden');
    if (kind === 'ok') setTimeout(() => el.classList.add('hidden'), 4000);
  },

  hideAlert() { document.getElementById('alert').classList.add('hidden'); },

  escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, '&#039;');
  },

  showVista(vista) {
    document.getElementById('view-login').classList.toggle('hidden', vista !== 'login');
    document.getElementById('view-panel').classList.toggle('hidden', vista !== 'panel');
  },

  switchTab(tab) {
    V.state.activeTab = tab;
    document.querySelectorAll('.vig-tab[data-tab]').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.getElementById('tab-residentes').classList.toggle('hidden', tab !== 'residentes');
    document.getElementById('tab-placas').classList.toggle('hidden', tab !== 'placas');
    document.getElementById('tab-mudanzas').classList.toggle('hidden', tab !== 'mudanzas');
    V.hideAlert();
    if (tab === 'mudanzas') V.cargarMudanzasHoy();
  },

  // ============================================================
  // LOGIN
  // ============================================================
  async login() {
    V.hideAlert();
    const password = document.getElementById('loginPassword').value;
    if (!password) { V.showAlert('Ingresa la contraseña.', 'err'); return; }
    const btn = document.getElementById('btnLogin');
    btn.disabled = true; btn.textContent = 'Verificando...';
    try {
      const r = await fetch(APPS_SCRIPT_URL + '?action=vigilanteLogin&password=' + encodeURIComponent(password)).then(x=>x.json());
      if (!r.ok) { V.showAlert(r.error || 'Error de autenticación.', 'err'); return; }
      V.state.loggedIn = true;
      sessionStorage.setItem('vigilanteLoggedIn', 'true');
      document.getElementById('sessionBadge').style.display = '';
      document.getElementById('loginPassword').value = '';
      V.showVista('panel');
      V.showAlert('Sesión iniciada.', 'ok');
      setTimeout(() => document.getElementById('searchInput').focus(), 100);
    } catch (e) { V.showAlert('Error de red: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = 'Ingresar'; }
  },

  logout() {
    V.state.loggedIn = false;
    sessionStorage.removeItem('vigilanteLoggedIn');
    document.getElementById('sessionBadge').style.display = 'none';
    V.showVista('login');
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('detailContainer').innerHTML = '';
    document.getElementById('mudList').innerHTML = '';
  },

  // ============================================================
  // BUSCAR RESIDENTE
  // ============================================================
  async buscar() {
    V.hideAlert();
    const q = document.getElementById('searchInput').value.trim();
    if (!q) { V.showAlert('Ingresa un término de búsqueda.', 'err'); return; }
    const btn = document.getElementById('btnSearch');
    btn.disabled = true; btn.textContent = 'Buscando...';
    try {
      const r = await fetch(APPS_SCRIPT_URL + '?action=vigilanteVerResidentes&q=' + encodeURIComponent(q)).then(x=>x.json());
      if (!r.ok) { V.showAlert(r.error || 'Error.', 'err'); V.clearResults(); return; }
      V.state.lastResults = r.resultados;
      V.renderResults(r.resultados, q);
    } catch (e) { V.showAlert('Error de red: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = '🔍 Buscar'; }
  },

  clearResults() {
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('detailContainer').innerHTML = '';
  },

  renderResults(resultados, query) {
    const cont = document.getElementById('resultsContainer');
    if (!resultados.length) {
      cont.innerHTML = '<div class="no-results">No se encontraron resultados para "' + V.escapeHtml(query) + '"</div>';
      document.getElementById('detailContainer').innerHTML = '';
      return;
    }
    let html = '<p style="color:var(--gris-med); margin-bottom:8px;">' + resultados.length + ' resultado(s):</p>';
    html += '<table class="results-table">';
    html += '<thead><tr><th>Apto</th><th>Tipo</th><th>Nombre</th></tr></thead>';
    html += '<tbody>';
    for (const r of resultados) {
      html += '<tr data-row="' + r.rowNumber + '">';
      html += '<td>' + V.escapeHtml(r.apto) + '</td>';
      html += '<td>' + V.escapeHtml(r.diligencia) + '</td>';
      html += '<td>' + V.escapeHtml(r.nombreProp) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    cont.innerHTML = html;
    cont.querySelectorAll('tr[data-row]').forEach(tr => {
      tr.addEventListener('click', () => {
        const rowNumber = parseInt(tr.dataset.row);
        const r = resultados.find(x => x.rowNumber === rowNumber);
        if (r) V.renderDetail(r);
      });
    });
  },

  renderDetail(r) {
    const html = `
      <div class="detail-card">
        <h3>${V.escapeHtml(r.apto)} — ${V.escapeHtml(r.nombreProp)}</h3>
        <div class="meta-info">
          <strong>${V.escapeHtml(r.diligencia)}</strong>
        </div>

        ${r.nombreEncargado ? `
        <div class="detail-section">
          <h4>👤 Encargado / Administrador</h4>
          <div class="item"><strong>Nombre:</strong> ${V.escapeHtml(r.nombreEncargado)}</div>
          ${r.ccEncargado ? `<div class="item"><strong>CC:</strong> ${V.escapeHtml(r.ccEncargado)}</div>` : ''}
        </div>
        ` : ''}

        ${r.nombreInmobiliaria ? `
        <div class="detail-section">
          <h4>🏢 Inmobiliaria</h4>
          <div class="item"><strong>Razón social:</strong> ${V.escapeHtml(r.nombreInmobiliaria)}</div>
          ${r.nitInmobiliaria ? `<div class="item"><strong>NIT:</strong> ${V.escapeHtml(r.nitInmobiliaria)}</div>` : ''}
          ${r.contactoInmobiliaria ? `<div class="item"><strong>Contacto:</strong> ${V.escapeHtml(r.contactoInmobiliaria)}</div>` : ''}
        </div>
        ` : ''}

        ${r.residentes.length > 0 ? `
        <div class="detail-section">
          <h4>👨‍👩‍👧 Residentes del apto (${r.residentes.length})</h4>
          ${r.residentes.map(res => `
            <div class="item"><strong>${V.escapeHtml(res.nombre)}</strong> · CC ${V.escapeHtml(res.cc)}${res.parent ? ' · ' + V.escapeHtml(res.parent) : ''}</div>
          `).join('')}
        </div>
        ` : ''}

        ${(r.vehiculos.length + r.motos.length) > 0 ? `
        <div class="detail-section">
          <h4>🚗 Vehículos y motos (${r.vehiculos.length + r.motos.length})</h4>
          ${r.vehiculos.map(v => `
            <div class="item">
              <strong>${V.escapeHtml(v.placa)}</strong> ·
              ${V.escapeHtml(v.marca)} ${V.escapeHtml(v.tipo)} ·
              ${V.escapeHtml(v.color)}${v.modelo ? ' · ' + V.escapeHtml(v.modelo) : ''}${v.tag ? ' · Tag: ' + V.escapeHtml(v.tag) : ''}
            </div>
          `).join('')}
          ${r.motos.map(v => `
            <div class="item">
              <strong>${V.escapeHtml(v.placa)}</strong> (moto) ·
              ${V.escapeHtml(v.marca)} ${V.escapeHtml(v.tipo)} ·
              ${V.escapeHtml(v.color)}${v.modelo ? ' · ' + V.escapeHtml(v.modelo) : ''}
            </div>
          `).join('')}
        </div>
        ` : ''}

        ${r.bicis.length > 0 ? `
        <div class="detail-section">
          <h4>🚲 Bicicletas (${r.bicis.length})</h4>
          ${r.bicis.map(b => `
            <div class="item">
              <strong>${V.escapeHtml(b.marca)}</strong> ${V.escapeHtml(b.color)} ·
              ${V.escapeHtml(b.clase)}${b.serial ? ' · S/N: ' + V.escapeHtml(b.serial) : ''}
            </div>
          `).join('')}
        </div>
        ` : ''}

        ${(r.parq1Celda || r.parq2Celda) ? `
        <div class="detail-section">
          <h4>🅿️ Parqueaderos</h4>
          ${r.parq1Celda ? `<div class="item"><strong>Parqueadero 1:</strong> Celda ${V.escapeHtml(r.parq1Celda)}${r.parq1Mat ? ' · Matrícula ' + V.escapeHtml(r.parq1Mat) : ''}</div>` : ''}
          ${r.parq2Celda ? `<div class="item"><strong>Parqueadero 2:</strong> Celda ${V.escapeHtml(r.parq2Celda)}${r.parq2Mat ? ' · Matrícula ' + V.escapeHtml(r.parq2Mat) : ''}</div>` : ''}
          ${r.parqTerNom ? `<div class="item"><strong>Autorizado tercero:</strong> ${V.escapeHtml(r.parqTerNom)} (apto ${V.escapeHtml(r.parqTerApto)})</div>` : ''}
        </div>
        ` : ''}

        ${r.mascotas.length > 0 ? `
        <div class="detail-section">
          <h4>🐕 Mascotas (${r.mascotas.length})</h4>
          ${r.mascotas.map(m => `
            <div class="item">
              <strong>${V.escapeHtml(m.nombre)}</strong> (${V.escapeHtml(m.tipo)}) ·
              ${V.escapeHtml(m.raza)} · ${V.escapeHtml(m.color)} · ${V.escapeHtml(m.sexo)}${m.manejoEspecial === 'Sí' ? ' · ⚠️ <strong>MANEJO ESPECIAL</strong>' : ''}
            </div>
          `).join('')}
        </div>
        ` : ''}

        <div class="meta-info" style="margin-top:16px;">
          ℹ️ Los datos de contacto (correo, celular, teléfono) NO se muestran por seguridad y privacidad.
        </div>
      </div>
    `;
    document.getElementById('detailContainer').innerHTML = html;
  },

  // ============================================================
  // BUSCAR POR PLACA (casos de incidente vehicular)
  // ============================================================
  async buscarPlaca() {
    V.hideAlert();
    const placa = document.getElementById('placaInput').value.trim();
    if (!placa) { V.showAlert('Ingresa la placa (o parte de ella).', 'err'); return; }
    if (placa.length < 1) { V.showAlert('Placa muy corta.', 'err'); return; }
    const btn = document.getElementById('btnBuscarPlaca');
    btn.disabled = true; btn.textContent = 'Buscando...';
    try {
      const r = await fetch(APPS_SCRIPT_URL + '?action=vigilanteBuscarPorPlaca&placa=' + encodeURIComponent(placa)).then(x=>x.json());
      if (!r.ok) { V.showAlert(r.error || 'Error.', 'err'); V.clearPlacas(); return; }
      V.renderPlacas(r.resultados, placa);
    } catch (e) { V.showAlert('Error de red: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = '🚗 Buscar placa'; }
  },

  clearPlacas() {
    document.getElementById('placasContainer').innerHTML = '';
  },

  renderPlacas(resultados, query) {
    const cont = document.getElementById('placasContainer');
    if (!resultados.length) {
      cont.innerHTML = '<div class="no-results">No se encontraron vehiculos con placa que contenga "' + V.escapeHtml(query) + '".</div>';
      return;
    }
    let totalVehiculos = 0;
    resultados.forEach(r => totalVehiculos += r.vehiculos.length);

    let html = '<p style="color:var(--gris-med); margin-bottom:12px;">' +
      resultados.length + ' apartamento(s) con ' + totalVehiculos + ' vehiculo(s) que coinciden:</p>';
    for (const r of resultados) {
      html += '<div class="detail-card" style="border-left:4px solid #D32F2F;">';
      html += '<h3>🚗 Apto ' + V.escapeHtml(r.apto) + ' — ' + V.escapeHtml(r.nombreProp) + '</h3>';
      html += '<div class="meta-info">';
      html += '<strong>Diligencia:</strong> ' + V.escapeHtml(r.diligencia);
      html += '</div>';
      html += '<div class="detail-section">';
      html += '<h4>Vehiculos con esta placa</h4>';
      for (const v of r.vehiculos) {
        html += '<div class="item" style="border-color:#D32F2F;">';
        html += '<strong>' + V.escapeHtml(v.placa) + '</strong> · ';
        html += (v.tipoVehiculo === 'moto' ? '🏍️ Moto' : '🚗 Vehiculo') + ' ' + (v.numero) + ' · ';
        html += V.escapeHtml(v.marca) + ' ' + V.escapeHtml(v.tipo) + ' · ';
        html += 'Color: ' + V.escapeHtml(v.color);
        if (v.modelo) html += ' · Modelo: ' + V.escapeHtml(v.modelo);
        if (v.tag) html += ' · Tag: ' + V.escapeHtml(v.tag);
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
    }
    cont.innerHTML = html;
  },

  // ============================================================
  // MUDANZAS
  // ============================================================
  async cargarMudanzasHoy(fecha) {
    V.hideAlert();
    const cont = document.getElementById('mudList');
    cont.innerHTML = '<p style="color:var(--gris-med);">Cargando mudanzas...</p>';
    try {
      const params = fecha ? '&fecha=' + encodeURIComponent(fecha) : '';
      const r = await fetch(APPS_SCRIPT_URL + '?action=vigilanteVerMudanzas' + params).then(x=>x.json());
      if (!r.ok) { V.showAlert(r.error || 'Error.', 'err'); cont.innerHTML = ''; return; }
      V.renderMudanzas(r.reservas);
    } catch (e) { V.showAlert('Error de red: ' + e.message, 'err'); cont.innerHTML = ''; }
  },

  renderMudanzas(reservas) {
    const cont = document.getElementById('mudList');
    if (!reservas.length) {
      cont.innerHTML = '<div class="no-results">No hay mudanzas para mostrar.</div>';
      return;
    }
    let html = '<p style="color:var(--gris-med); margin-bottom:12px;">' + reservas.length + ' mudanza(s):</p>';
    for (const m of reservas) {
      const cls = m.estado === 'Confirmada' ? 'confirmada' : 'cancelada';
      const realizadaCls = m.realizada === 'Sí' ? 'realizada' : (m.realizada === 'No' ? 'no-realizada' : '');
      html += '<div class="mud-card ' + cls + ' ' + realizadaCls + '">';
      html += '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">';
      html += '<div>';
      html += '<strong style="font-size:1.05em;">' + V.escapeHtml(m.idReserva) + '</strong> · ';
      html += '<span style="color:' + (m.tipoMudanza === 'Ingreso' ? '#2E7D32' : '#C62828') + '; font-weight:600;">';
      html += V.escapeHtml(m.tipoMudanza) + '</span> · ';
      html += V.escapeHtml(m.nombrePropietario) + ' · ';
      html += '<strong>Apto ' + V.escapeHtml(m.apto) + '</strong> · Torre ' + V.escapeHtml(m.torre) + ' Asc ' + V.escapeHtml(m.ascensor);
      html += '</div>';
      html += '<div style="text-align:right; font-size:0.92em; color:var(--gris-med);">';
      html += '<strong>' + V.escapeHtml(m.fecha) + '</strong><br>';
      html += V.escapeHtml(m.horaInicio) + ' - ' + V.escapeHtml(m.horaFin);
      html += '</div></div>';
      html += '<div style="font-size:0.82em; color:var(--gris-med); margin-top:6px;">';
      html += 'Estado: ' + V.escapeHtml(m.estado);
      html += '</div>';

      // Si está confirmada y no está cancelada, mostrar check
      if (m.estado === 'Confirmada' && m.realizada !== 'Sí' && m.realizada !== 'No') {
        html += '<div class="check-buttons">';
        html += '<input type="text" placeholder="Tu nombre (ej: Juan Pérez)" id="vig-nombre-' + m.idReserva + '">';
        html += '<button class="check-btn ok" data-id="' + m.idReserva + '" data-status="realizada">✓ Sí, se realizó</button>';
        html += '<button class="check-btn fail" data-id="' + m.idReserva + '" data-status="no_realizada">✗ No se realizó</button>';
        html += '</div>';
      } else if (m.realizada === 'Sí' || m.realizada === 'No') {
        const clsStatus = m.realizada === 'Sí' ? 'ok' : 'fail';
        html += '<div class="status-checked ' + clsStatus + '">';
        html += m.realizada === 'Sí' ? '✅' : '❌';
        html += ' Marcada como ' + (m.realizada === 'Sí' ? 'REALIZADA' : 'NO REALIZADA');
        html += ' por <strong>' + V.escapeHtml(m.vigilante || 'vigilante') + '</strong>';
        html += ' el ' + V.escapeHtml(m.fechaCheck);
        html += '</div>';
      }

      html += '</div>';
    }
    cont.innerHTML = html;

    // Bindear botones de check
    cont.querySelectorAll('.check-btn').forEach(btn => {
      btn.addEventListener('click', () => V.checkMudanza(btn.dataset.id, btn.dataset.status, btn));
    });
  },

  async checkMudanza(idReserva, status, btn) {
    const nombreInput = document.getElementById('vig-nombre-' + idReserva);
    const vigilante = nombreInput ? nombreInput.value.trim() : '';
    if (!vigilante) { V.showAlert('Por favor ingresa tu nombre para registrar el check.', 'err'); return; }

    btn.disabled = true;
    btn.textContent = 'Registrando...';
    try {
      const r = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'vigilanteCheckMudanza',
          idReserva: idReserva,
          status: status,
          vigilante: vigilante
        })
      }).then(x => x.json());

      if (!r.ok) {
        V.showAlert(r.error || 'Error al registrar check.', 'err');
        btn.disabled = false;
        btn.textContent = status === 'realizada' ? '✓ Sí, se realizó' : '✗ No se realizó';
        return;
      }
      V.showAlert('Check registrado correctamente.', 'ok');
      // Re-cargar lista
      await V.cargarMudanzasHoy(document.getElementById('mudFecha').value);
    } catch (e) { V.showAlert('Error de red: ' + e.message, 'err'); btn.disabled = false; }
  },

  // ============================================================
  // ============================================================
  // SALÓN SOCIAL (spec-salon-social.md F5)
  // Vigilantes ven: fecha + slot + estado + apto + nombre
  // ============================================================

  async verReservasSalon(fecha) {
    if (!fecha) {
      fecha = new Date().toISOString().slice(0, 10);
    }
    const container = document.getElementById('salonCards');
    container.innerHTML = '<p style="grid-column: span 2; text-align:center; color:var(--texto-med); padding:20px;">Cargando...</p>';

    try {
      const r = await V.apiGet({ action: 'vigilanteVerReservasSalon', fecha: fecha });

      if (!r.ok) {
        container.innerHTML = '<p style="grid-column: span 2; color:var(--err); padding:20px;">Error: ' + (r.error || 'desconocido') + '</p>';
        return;
      }

      // Render de las 2 cards: mañana y tarde
      container.innerHTML = '';
      container.appendChild(this.renderSalonCard('☀️ Mañana (8 AM - 1 PM)', r.manana));
      container.appendChild(this.renderSalonCard('🌆 Tarde (2 PM - 10 PM)', r.tarde));
    } catch (e) {
      container.innerHTML = '<p style="grid-column: span 2; color:var(--err);">Error de red: ' + e.message + '</p>';
    }
  },

  renderSalonCard(titulo, slotData) {
    const card = document.createElement('div');
    card.style.cssText = 'background:white; padding:20px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.06);';

    const isReservado = slotData.estado === 'reservado';

    let bgColor = isReservado ? '#FFEBEE' : '#E8F5E9';
    let borderColor = isReservado ? '#F44336' : '#4CAF50';
    let estadoText = isReservado ? '🔴 RESERVADO' : '⚪ LIBRE';
    let estadoColor = isReservado ? '#C62828' : '#2E7D32';

    card.style.borderLeft = '4px solid ' + borderColor;
    card.style.background = bgColor;

    let html = '<h3 style="margin:0 0 12px; color:#6B4423; font-size:1.05em;">' + titulo + '</h3>';
    html += '<div style="font-size:1.5em; font-weight:bold; color:' + estadoColor + ';">' + estadoText + '</div>';

    if (isReservado) {
      html += '<div style="margin-top:12px; font-size:0.95em;">';
      html += '<div><strong>Apto:</strong> ' + slotData.apto + '</div>';
      html += '<div><strong>Reservado por:</strong> ' + slotData.nombre + '</div>';
      html += '</div>';
    }

    card.innerHTML = html;
    return card;
  },

  // ============================================================
  // INIT
  // ============================================================
  bindEvents() {
    document.getElementById('btnLogin').addEventListener('click', () => V.login());
    document.getElementById('loginPassword').addEventListener('keypress', (e) => { if (e.key === 'Enter') V.login(); });
    document.getElementById('btnSearch').addEventListener('click', () => V.buscar());
    document.getElementById('searchInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') V.buscar(); });
    document.getElementById('btnBuscarPlaca').addEventListener('click', () => V.buscarPlaca());
    document.getElementById('placaInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') V.buscarPlaca(); });
    document.getElementById('btnLogout').addEventListener('click', () => V.logout());
    document.querySelectorAll('.vig-tab[data-tab]').forEach(t => {
      t.addEventListener('click', () => {
        V.switchTab(t.dataset.tab);
        // Cargar datos cuando se cambia al tab salón
        if (t.dataset.tab === 'salon') {
          const fecha = document.getElementById('salonFecha').value || new Date().toISOString().slice(0, 10);
          V.verReservasSalon(fecha);
        }
      });
    });
    // Por defecto, fecha = hoy
    const hoy = new Date().toISOString().slice(0, 10);
    document.getElementById('mudFecha').value = hoy;
    document.getElementById('mudFecha').addEventListener('change', () => {
      const f = document.getElementById('mudFecha').value;
      V.cargarMudanzasHoy(f);
    });
    document.getElementById('btnVerTodas').addEventListener('click', () => V.cargarMudanzasHoy(null));

    // Salón social (F5)
    document.getElementById('salonFecha').value = hoy;
    document.getElementById('salonFecha').addEventListener('change', () => {
      V.verReservasSalon(document.getElementById('salonFecha').value);
    });
    document.getElementById('btnSalonHoy').addEventListener('click', () => {
      const h = new Date().toISOString().slice(0, 10);
      document.getElementById('salonFecha').value = h;
      V.verReservasSalon(h);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  V.bindEvents();
  if (sessionStorage.getItem('vigilanteLoggedIn') === 'true') {
    V.state.loggedIn = true;
    document.getElementById('sessionBadge').style.display = '';
    V.showVista('panel');
  } else {
    V.showVista('login');
  }
});
