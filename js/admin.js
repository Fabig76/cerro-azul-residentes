// ============================================================
// PORTAL ADMINISTRATIVO — Cerro Azul
// Requiere V7 de Apps Script (deploy con endpoints admin)
// ============================================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec';

const A = {
  state: {
    loggedIn: false,
    selectedNumForm: null,
    selectedRow: null,
    editMode: false,
    lastSearchResults: []
  },

  // ============================================================
  // Helpers
  // ============================================================
  log(msg) {
    console.log('[A]', msg);
  },

  showAlert(msg, kind) {
    const el = document.getElementById('alert');
    el.className = 'alert alert-' + (kind || 'info');
    el.innerHTML = msg;
    el.classList.remove('hidden');
  },

  hideAlert() {
    document.getElementById('alert').classList.add('hidden');
  },

  showVista(vista) {
    document.getElementById('view-login').classList.toggle('hidden', vista !== 'login');
    document.getElementById('view-panel').classList.toggle('hidden', vista !== 'panel');
  },

  // ============================================================
  // Login
  // ============================================================
  async login() {
    A.hideAlert();
    const password = document.getElementById('loginPassword').value;
    if (!password) { A.showAlert('Ingresa la contraseña.', 'err'); return; }

    const btn = document.getElementById('btnLogin');
    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
      const r = await fetch(APPS_SCRIPT_URL + '?action=adminLogin&password=' + encodeURIComponent(password))
        .then(x => x.json());
      if (!r.ok) {
        A.showAlert(r.error || 'Error de autenticación.', 'err');
        return;
      }
      A.state.loggedIn = true;
      A.state.password = password;  // guardamos para reusar en cada llamada
      sessionStorage.setItem('adminLoggedIn', 'true');
      document.getElementById('sessionBadge').style.display = '';
      document.getElementById('loginPassword').value = '';
      A.showVista('panel');
      A.showAlert('Sesión iniciada correctamente.', 'ok');
      // Auto-focus en buscar
      setTimeout(() => document.getElementById('searchInput').focus(), 100);
    } catch (e) {
      A.showAlert('Error de red: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  },

  logout() {
    A.state.loggedIn = false;
    sessionStorage.removeItem('adminLoggedIn');
    document.getElementById('sessionBadge').style.display = 'none';
    A.showVista('login');
    A.clearResults();
  },

  // ============================================================
  // Buscar
  // ============================================================
  async buscar() {
    A.hideAlert();
    const q = document.getElementById('searchInput').value.trim();
    if (!q) { A.showAlert('Ingresa un término de búsqueda.', 'err'); return; }
    if (q.length < 1) { A.showAlert('El término es muy corto.', 'err'); return; }

    const btn = document.getElementById('btnSearch');
    btn.disabled = true;
    btn.textContent = 'Buscando...';

    try {
      const r = await fetch(APPS_SCRIPT_URL + '?action=adminBuscar&q=' + encodeURIComponent(q))
        .then(x => x.json());
      if (!r.ok) {
        A.showAlert(r.error || 'Error en la búsqueda.', 'err');
        A.clearResults();
        return;
      }
      A.state.lastSearchResults = r.resultados;
      A.renderResults(r.resultados, q);
    } catch (e) {
      A.showAlert('Error de red: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 Buscar';
    }
  },

  renderResults(resultados, query) {
    const cont = document.getElementById('resultsContainer');
    if (!resultados.length) {
      cont.innerHTML = '<div class="no-results">No se encontraron resultados para "' + escapeHtml(query) + '"</div>';
      document.getElementById('detailContainer').innerHTML = '';
      return;
    }
    let html = '<p style="color:var(--texto-med); margin-bottom:8px;">' + resultados.length + ' resultado(s):</p>';
    html += '<table class="results-table">';
    html += '<thead><tr><th>CA-XXXX</th><th>Apto</th><th>Tipo</th><th>Nombre</th><th>CC</th><th>Correo</th><th>Celular</th></tr></thead>';
    html += '<tbody>';
    for (const r of resultados) {
      html += '<tr data-numform="' + escapeHtml(r.numForm) + '">';
      html += '<td><strong>' + escapeHtml(r.numForm) + '</strong></td>';
      html += '<td>' + escapeHtml(r.apto) + '</td>';
      html += '<td>' + escapeHtml(r.diligencia) + '</td>';
      html += '<td>' + escapeHtml(r.nombre) + '</td>';
      html += '<td>' + escapeHtml(r.cc) + '</td>';
      html += '<td>' + escapeHtml(r.correo) + '</td>';
      html += '<td>' + escapeHtml(r.celular) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    cont.innerHTML = html;

    // Bindear clicks
    cont.querySelectorAll('tr[data-numform]').forEach(tr => {
      tr.addEventListener('click', () => {
        cont.querySelectorAll('tr').forEach(t => t.classList.remove('selected'));
        tr.classList.add('selected');
        A.seleccionar(tr.dataset.numform);
      });
    });
  },

  clearResults() {
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('detailContainer').innerHTML = '';
  },

  // ============================================================
  // Detalle y edición
  // ============================================================
  async seleccionar(numForm) {
    A.hideAlert();
    A.state.selectedNumForm = numForm;
    A.state.editMode = false;

    try {
      const r = await fetch(APPS_SCRIPT_URL + '?action=adminObtener&numForm=' + encodeURIComponent(numForm))
        .then(x => x.json());
      if (!r.ok) {
        A.showAlert(r.error || 'Error al obtener el registro.', 'err');
        document.getElementById('detailContainer').innerHTML = '';
        return;
      }
      A.state.selectedRow = r.row;
      A.renderDetail(r.row, r.rowNumber);
    } catch (e) {
      A.showAlert('Error de red: ' + e.message, 'err');
    }
  },

  renderDetail(row, rowNumber) {
    const html = `
      <div class="detail-card">
        <h3>Detalle del apartamento ${escapeHtml(row.apto)} — ${escapeHtml(row.numForm)}</h3>
        <div class="meta-info">
          <strong>Registro fila:</strong> ${rowNumber} ·
          <strong>Fecha registro:</strong> ${escapeHtml(row.fechaRegistro)} ·
          <strong>Última edición:</strong> ${escapeHtml(row.fechaEdicion)}
        </div>
        <div class="form-grid">
          <div>
            <label>N° de apartamento</label>
            <input id="editApto" value="${escapeHtml(row.apto)}" disabled>
          </div>
          <div>
            <label>Diligencia como</label>
            <input id="editDiligencia" value="${escapeHtml(row.diligencia)}" disabled>
          </div>
          <div class="full">
            <label>Nombre del propietario</label>
            <input id="editNombre" value="${escapeHtml(row.nombreProp)}" disabled>
          </div>
          <div>
            <label>C.C.</label>
            <input id="editCc" value="${escapeHtml(row.ccProp)}" disabled>
          </div>
          <div>
            <label>Celular</label>
            <input id="editCel" value="${escapeHtml(row.celProp)}" disabled>
          </div>
          <div class="full">
            <label>Correo electrónico</label>
            <input id="editCorreo" value="${escapeHtml(row.correoProp)}" disabled>
          </div>
          <div class="full">
            <label>Teléfono fijo</label>
            <input id="editTel" value="${escapeHtml(row.telFijoProp)}" disabled>
          </div>
          <div>
            <label>Parqueadero 1 (celda)</label>
            <input id="editParq1" value="${escapeHtml(row.parq1Celda)}" disabled>
          </div>
          <div>
            <label>Parqueadero 1 (matrícula)</label>
            <input id="editParq1Mat" value="${escapeHtml(row.parq1Mat)}" disabled>
          </div>
          <div>
            <label>Parqueadero 2 (celda)</label>
            <input id="editParq2" value="${escapeHtml(row.parq2Celda)}" disabled>
          </div>
          <div>
            <label>Parqueadero 2 (matrícula)</label>
            <input id="editParq2Mat" value="${escapeHtml(row.parq2Mat)}" disabled>
          </div>
          <div>
            <label>Matrícula del apto</label>
            <input id="editMatApto" value="${escapeHtml(row.matriculaApto)}" disabled>
          </div>
          <div>
            <label>¿Requiere revisión de matrículas?</label>
            <select id="editRequiereRevision" disabled>
              <option value="Sí" ${row.requiereRevision === 'Sí' ? 'selected' : ''}>Sí</option>
              <option value="No" ${row.requiereRevision === 'No' ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div class="full">
            <label>Observaciones matrículas</label>
            <input id="editObsMat" value="${escapeHtml(row.observMatriculas)}" disabled>
          </div>
        </div>
        <div class="action-bar">
          <button type="button" class="btn btn-primary" id="btnEdit">✏️ Editar</button>
          <button type="button" class="btn btn-secondary hidden" id="btnCancelEdit">Cancelar</button>
          <button type="button" class="btn btn-primary hidden" id="btnSave">💾 Guardar cambios</button>
          <span style="flex:1"></span>
          <small style="color:var(--texto-med); font-size: 0.85em;">
            Nota: para editar datos no básicos (residentes, vehículos, mascotas, etc.) usa el formulario "Editar mi registro" del residente.
          </small>
        </div>
      </div>
    `;
    document.getElementById('detailContainer').innerHTML = html;

    // Bindear botones
    document.getElementById('btnEdit').addEventListener('click', () => A.editar());
    document.getElementById('btnCancelEdit').addEventListener('click', () => A.cancelarEdicion());
    document.getElementById('btnSave').addEventListener('click', () => A.guardar());
  },

  editar() {
    A.state.editMode = true;
    const campos = ['editApto', 'editDiligencia', 'editNombre', 'editCc', 'editCel', 'editCorreo', 'editTel', 'editParq1', 'editParq1Mat', 'editParq2', 'editParq2Mat', 'editMatApto', 'editRequiereRevision', 'editObsMat'];
    campos.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });
    document.getElementById('btnEdit').classList.add('hidden');
    document.getElementById('btnCancelEdit').classList.remove('hidden');
    document.getElementById('btnSave').classList.remove('hidden');
    A.showAlert('Modo edición activo. Modifica los campos y haz clic en "Guardar cambios".', 'info');
  },

  cancelarEdicion() {
    A.state.editMode = false;
    // Re-renderizar para resetear valores
    if (A.state.selectedRow) {
      A.renderDetail(A.state.selectedRow, 0);
    }
    A.hideAlert();
  },

  async guardar() {
    A.hideAlert();
    const payload = {
      action: 'adminGuardar',
      numForm: A.state.selectedNumForm,
      apto: document.getElementById('editApto').value.trim(),
      diligencia: document.getElementById('editDiligencia').value.trim(),
      nombreProp: document.getElementById('editNombre').value.trim(),
      ccProp: document.getElementById('editCc').value.trim(),
      correoProp: document.getElementById('editCorreo').value.trim(),
      celProp: document.getElementById('editCel').value.trim(),
      telFijoProp: document.getElementById('editTel').value.trim(),
      parq1Celda: document.getElementById('editParq1').value.trim(),
      parq1Mat: document.getElementById('editParq1Mat').value.trim(),
      parq2Celda: document.getElementById('editParq2').value.trim(),
      parq2Mat: document.getElementById('editParq2Mat').value.trim(),
      matriculaApto: document.getElementById('editMatApto').value.trim(),
      requiereRevision: document.getElementById('editRequiereRevision').value,
      observMatriculas: document.getElementById('editObsMat').value.trim()
    };

    const btn = document.getElementById('btnSave');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      const r = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).then(x => x.json());

      if (!r.ok) {
        A.showAlert(r.error || 'Error al guardar.', 'err');
        return;
      }
      A.showAlert('Cambios guardados correctamente. Fila ' + r.rowNumber + '.', 'ok');
      // Re-obtener el registro actualizado
      await A.seleccionar(A.state.selectedNumForm);
    } catch (e) {
      A.showAlert('Error de red: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Guardar cambios';
    }
  },

  // ============================================================
  // Init
  // ============================================================
  bindEvents() {
    document.getElementById('btnLogin').addEventListener('click', () => A.login());
    document.getElementById('loginPassword').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') A.login();
    });
    document.getElementById('btnSearch').addEventListener('click', () => A.buscar());
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') A.buscar();
    });
    document.getElementById('btnLogout').addEventListener('click', () => A.logout());
  }
};

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
  A.bindEvents();
  // Si hay sesion previa en sessionStorage, ir directo al panel
  if (sessionStorage.getItem('adminLoggedIn') === 'true') {
    A.state.loggedIn = true;
    document.getElementById('sessionBadge').style.display = '';
    A.showVista('panel');
  } else {
    A.showVista('login');
  }
});
