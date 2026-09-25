// ============================================================
// PORTAL ADMINISTRATIVO — Cerro Azul (V8)
// Backend: V8 (adminGuardar acepta los 143 campos)
// ============================================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec';

const A = {
  // Helpers para fetch (agregados en F5 del módulo salón social)
  async apiGet(params) {
    const url = new URL(APPS_SCRIPT_URL);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null) url.searchParams.set(k, v);
    });
    const r = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
    return r.json();
  },
  async apiPost(payload) {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    return r.json();
  },

  state: {
    loggedIn: false,
    selectedNumForm: null,
    selectedRow: null,
    editMode: false,
    lastSearchResults: []
  },

  log(msg) { console.log('[A]', msg); },

  showAlert(msg, kind) {
    const el = document.getElementById('alert');
    el.className = 'alert alert-' + (kind || 'info');
    el.innerHTML = msg;
    el.classList.remove('hidden');
    if (kind === 'ok') setTimeout(() => el.classList.add('hidden'), 5000);
  },

  hideAlert() {
    document.getElementById('alert').classList.add('hidden');
  },

  showVista(vista) {
    document.getElementById('view-login').classList.toggle('hidden', vista !== 'login');
    document.getElementById('view-panel').classList.toggle('hidden', vista !== 'panel');
  },

  escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  },

  // ============================================================
  // LOGIN
  // ============================================================
  async login() {
    A.hideAlert();
    const password = document.getElementById('loginPassword').value;
    if (!password) { A.showAlert('Ingresa la contraseña.', 'err'); return; }
    const btn = document.getElementById('btnLogin');
    btn.disabled = true; btn.textContent = 'Verificando...';
    try {
      const r = await fetch(APPS_SCRIPT_URL + '?action=adminLogin&password=' + encodeURIComponent(password)).then(x=>x.json());
      if (!r.ok) { A.showAlert(r.error || 'Error de autenticación.', 'err'); return; }
      A.state.loggedIn = true;
      sessionStorage.setItem('adminLoggedIn', 'true');
      document.getElementById('sessionBadge').style.display = '';
      document.getElementById('loginPassword').value = '';
      A.showVista('panel');
      A.showAlert('Sesión iniciada correctamente.', 'ok');
      setTimeout(() => document.getElementById('searchInput').focus(), 100);
    } catch (e) { A.showAlert('Error de red: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = 'Ingresar'; }
  },

  logout() {
    A.state.loggedIn = false;
    sessionStorage.removeItem('adminLoggedIn');
    document.getElementById('sessionBadge').style.display = 'none';
    A.showVista('login');
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('detailContainer').innerHTML = '';
  },

  // ============================================================
  // BUSCAR
  // ============================================================
  async buscar() {
    A.hideAlert();
    const q = document.getElementById('searchInput').value.trim();
    if (!q) { A.showAlert('Ingresa un término de búsqueda.', 'err'); return; }
    const btn = document.getElementById('btnSearch');
    btn.disabled = true; btn.textContent = 'Buscando...';
    try {
      const r = await fetch(APPS_SCRIPT_URL + '?action=adminBuscar&q=' + encodeURIComponent(q)).then(x=>x.json());
      if (!r.ok) { A.showAlert(r.error || 'Error.', 'err'); return; }
      A.state.lastSearchResults = r.resultados;
      A.renderResults(r.resultados, q);
    } catch (e) { A.showAlert('Error de red: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = '🔍 Buscar'; }
  },

  renderResults(resultados, query) {
    const cont = document.getElementById('resultsContainer');
    if (!resultados.length) {
      cont.innerHTML = '<div class="no-results">No se encontraron resultados para "' + A.escapeHtml(query) + '"</div>';
      document.getElementById('detailContainer').innerHTML = '';
      return;
    }
    let html = '<p style="color:var(--gris-med); margin-bottom:8px;">' + resultados.length + ' resultado(s):</p>';
    html += '<table class="results-table">';
    html += '<thead><tr><th>CA-XXXX</th><th>Apto</th><th>Tipo</th><th>Nombre</th><th>CC</th><th>Correo</th><th>Celular</th></tr></thead>';
    html += '<tbody>';
    for (const r of resultados) {
      html += '<tr data-numform="' + A.escapeHtml(r.numForm) + '">';
      html += '<td><strong>' + A.escapeHtml(r.numForm) + '</strong></td>';
      html += '<td>' + A.escapeHtml(r.apto) + '</td>';
      html += '<td>' + A.escapeHtml(r.diligencia) + '</td>';
      html += '<td>' + A.escapeHtml(r.nombre) + '</td>';
      html += '<td>' + A.escapeHtml(r.cc) + '</td>';
      html += '<td>' + A.escapeHtml(r.correo) + '</td>';
      html += '<td>' + A.escapeHtml(r.celular) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    cont.innerHTML = html;
    cont.querySelectorAll('tr[data-numform]').forEach(tr => {
      tr.addEventListener('click', () => {
        cont.querySelectorAll('tr').forEach(t => t.classList.remove('selected'));
        tr.classList.add('selected');
        A.seleccionar(tr.dataset.numform);
      });
    });
  },

  // ============================================================
  // DETALLE COMPLETO
  // ============================================================
  async seleccionar(numForm) {
    A.hideAlert();
    A.state.selectedNumForm = numForm;
    A.state.editMode = false;
    try {
      const r = await fetch(APPS_SCRIPT_URL + '?action=adminObtener&numForm=' + encodeURIComponent(numForm)).then(x=>x.json());
      if (!r.ok) { A.showAlert(r.error || 'Error al obtener el registro.', 'err'); return; }
      A.state.selectedRow = r.row;
      A.renderDetail(r.row, r.rowNumber);
    } catch (e) { A.showAlert('Error de red: ' + e.message, 'err'); }
  },

  renderDetail(row, rowNumber) {
    const r = row; // alias
    const html = `
      <div class="detail-card">
        <h3>Editar registro ${A.escapeHtml(r.numForm)} — apto ${A.escapeHtml(r.apto)}</h3>
        <div class="meta-info">
          <strong>Fila:</strong> ${rowNumber} ·
          <strong>Registro:</strong> ${A.escapeHtml(r.fechaRegistro)} ·
          <strong>Última edición:</strong> ${A.escapeHtml(r.fechaEdicion)}
        </div>

        <details open><summary><strong>0. Encabezado</strong></summary>
          <div class="form-grid">
            <div><label>Fecha de diligenciamiento</label><input type="date" id="edit-firmaFecha" value="${A.escapeHtml(r.firmaFecha ? String(r.firmaFecha).slice(0,10) : '')}" disabled></div>
            <div><label>Diligencia como</label>
              <select id="edit-diligencia" disabled>
                <option value="">-- Seleccionar --</option>
                <option value="Propietario" ${r.diligencia==='Propietario'?'selected':''}>Propietario</option>
                <option value="Arrendatario" ${r.diligencia==='Arrendatario'?'selected':''}>Arrendatario</option>
                <option value="Tenedor / Otro" ${r.diligencia==='Tenedor / Otro'?'selected':''}>Tenedor / Otro</option>
              </select>
            </div>
          </div>
        </details>

        <details open><summary><strong>1. Datos del propietario + Parqueaderos</strong></summary>
          <div class="form-grid">
            <div><label>N° apartamento</label><input id="edit-apto" value="${A.escapeHtml(r.apto)}" disabled></div>
            <div><label>Matrícula del apto</label><input id="edit-matriculaApto" value="${A.escapeHtml(r.matriculaApto)}" disabled></div>
            <div class="full"><label>Nombre del propietario</label><input id="edit-nombreProp" value="${A.escapeHtml(r.nombreProp)}" disabled></div>
            <div><label>C.C. del propietario</label><input id="edit-ccProp" value="${A.escapeHtml(r.ccProp)}" disabled></div>
            <div><label>Correo del propietario</label><input type="email" id="edit-correoProp" value="${A.escapeHtml(r.correoProp)}" disabled></div>
            <div><label>Celular</label><input id="edit-celProp" value="${A.escapeHtml(r.celProp)}" disabled></div>
            <div><label>Teléfono fijo</label><input id="edit-telFijoProp" value="${A.escapeHtml(r.telFijoProp)}" disabled></div>
            <div><label>Parqueadero 1 (celda)</label><input id="edit-parq1Celda" value="${A.escapeHtml(r.parq1Celda)}" disabled></div>
            <div><label>Parqueadero 1 (matrícula)</label><input id="edit-parq1Mat" value="${A.escapeHtml(r.parq1Mat)}" disabled></div>
            <div><label>Parqueadero 2 (celda)</label><input id="edit-parq2Celda" value="${A.escapeHtml(r.parq2Celda)}" disabled></div>
            <div><label>Parqueadero 2 (matrícula)</label><input id="edit-parq2Mat" value="${A.escapeHtml(r.parq2Mat)}" disabled></div>
            <div><label>¿Requiere revisión de matrículas?</label>
              <select id="edit-requiereRevision" disabled>
                <option value="Sí" ${r.requiereRevision==='Sí'?'selected':''}>Sí</option>
                <option value="No" ${r.requiereRevision==='No'?'selected':''}>No</option>
              </select>
            </div>
            <div class="full"><label>Observaciones matrículas</label><input id="edit-observMatriculas" value="${A.escapeHtml(r.observMatriculas)}" disabled></div>
          </div>
        </details>

        <details><summary><strong>2. Encargado o administrador del inmueble</strong></summary>
          <div class="form-grid">
            <div class="full"><label>Nombre</label><input id="edit-nombreArr" value="${A.escapeHtml(r.nombreArr)}" disabled></div>
            <div><label>C.C.</label><input id="edit-ccArr" value="${A.escapeHtml(r.ccArr)}" disabled></div>
            <div><label>Correo</label><input id="edit-correoArr" value="${A.escapeHtml(r.correoArr)}" disabled></div>
            <div><label>Celular</label><input id="edit-celArr" value="${A.escapeHtml(r.celArr)}" disabled></div>
          </div>
        </details>

        <details><summary><strong>3. Parqueadero a tercero</strong></summary>
          <div class="form-grid">
            <div class="full"><label>Nombre del autorizado</label><input id="edit-parqTerNom" value="${A.escapeHtml(r.parqTerNom)}" disabled></div>
            <div><label>Apartamento del autorizado</label><input id="edit-parqTerApto" value="${A.escapeHtml(r.parqTerApto)}" disabled></div>
            <div><label>Celular del autorizado</label><input id="edit-parqTerCel" value="${A.escapeHtml(r.parqTerCel)}" disabled></div>
          </div>
        </details>

        <details><summary><strong>4. Inmobiliaria</strong></summary>
          <div class="form-grid">
            <div class="full"><label>Razón social</label><input id="edit-inmobRazon" value="${A.escapeHtml(r.inmobRazon)}" disabled></div>
            <div><label>NIT</label><input id="edit-inmobNit" value="${A.escapeHtml(r.inmobNit)}" disabled></div>
            <div><label>Persona de contacto</label><input id="edit-inmobContacto" value="${A.escapeHtml(r.inmobContacto)}" disabled></div>
            <div><label>Teléfono</label><input id="edit-inmobTel" value="${A.escapeHtml(r.inmobTel)}" disabled></div>
            <div><label>Correo</label><input id="edit-inmobCorreo" value="${A.escapeHtml(r.inmobCorreo)}" disabled></div>
          </div>
        </details>

        <details><summary><strong>5. Residentes (mayores de edad)</strong></summary>
          ${[0,1,2,3].map(i => `
            <div class="form-grid nested">
              <div class="full"><label><strong>Residente ${i+1}</strong></label></div>
              <div class="full"><label>Nombre</label><input data-array="residentes" data-idx="${i}" data-field="nombre" value="${A.escapeHtml(r.residentes[i]?.nombre)}" disabled></div>
              <div><label>C.C.</label><input data-array="residentes" data-idx="${i}" data-field="cc" value="${A.escapeHtml(r.residentes[i]?.cc)}" disabled></div>
              <div><label>Correo</label><input data-array="residentes" data-idx="${i}" data-field="correo" value="${A.escapeHtml(r.residentes[i]?.correo)}" disabled></div>
              <div><label>Celular</label><input data-array="residentes" data-idx="${i}" data-field="cel" value="${A.escapeHtml(r.residentes[i]?.cel)}" disabled></div>
              <div><label>Parentesco</label><input data-array="residentes" data-idx="${i}" data-field="parent" value="${A.escapeHtml(r.residentes[i]?.parent)}" disabled></div>
            </div>
          `).join('')}
        </details>

        <details><summary><strong>5.1 Menores de edad</strong></summary>
          ${[0,1,2,3].map(i => `
            <div class="form-grid nested">
              <div class="full"><label><strong>Menor ${i+1}</strong></label></div>
              <div class="full"><label>Nombre</label><input data-array="menores" data-idx="${i}" data-field="nombre" value="${A.escapeHtml(r.menores[i]?.nombre)}" disabled></div>
              <div><label>Edad</label><input data-array="menores" data-idx="${i}" data-field="edad" value="${A.escapeHtml(r.menores[i]?.edad)}" disabled></div>
              <div><label>Parentesco</label><input data-array="menores" data-idx="${i}" data-field="parent" value="${A.escapeHtml(r.menores[i]?.parent)}" disabled></div>
            </div>
          `).join('')}
        </details>

        <details><summary><strong>6. Vehículos y motos</strong></summary>
          ${[0,1].map(i => `
            <div class="form-grid nested">
              <div class="full"><label><strong>Vehículo ${i+1}</strong></label></div>
              <div><label>Marca</label><input data-array="vehiculos" data-idx="${i}" data-field="marca" value="${A.escapeHtml(r.vehiculos[i]?.marca)}" disabled></div>
              <div><label>Tipo</label><input data-array="vehiculos" data-idx="${i}" data-field="tipo" value="${A.escapeHtml(r.vehiculos[i]?.tipo)}" disabled></div>
              <div><label>Color</label><input data-array="vehiculos" data-idx="${i}" data-field="color" value="${A.escapeHtml(r.vehiculos[i]?.color)}" disabled></div>
              <div><label>Placa</label><input data-array="vehiculos" data-idx="${i}" data-field="placa" value="${A.escapeHtml(r.vehiculos[i]?.placa)}" disabled></div>
              <div><label>Modelo</label><input data-array="vehiculos" data-idx="${i}" data-field="modelo" value="${A.escapeHtml(r.vehiculos[i]?.modelo)}" disabled></div>
              <div><label>Tag</label><input data-array="vehiculos" data-idx="${i}" data-field="tag" value="${A.escapeHtml(r.vehiculos[i]?.tag)}" disabled></div>
            </div>
          `).join('')}
          ${[0,1].map(i => `
            <div class="form-grid nested">
              <div class="full"><label><strong>Moto ${i+1}</strong></label></div>
              <div><label>Marca</label><input data-array="motos" data-idx="${i}" data-field="marca" value="${A.escapeHtml(r.motos[i]?.marca)}" disabled></div>
              <div><label>Tipo</label><input data-array="motos" data-idx="${i}" data-field="tipo" value="${A.escapeHtml(r.motos[i]?.tipo)}" disabled></div>
              <div><label>Color</label><input data-array="motos" data-idx="${i}" data-field="color" value="${A.escapeHtml(r.motos[i]?.color)}" disabled></div>
              <div><label>Placa</label><input data-array="motos" data-idx="${i}" data-field="placa" value="${A.escapeHtml(r.motos[i]?.placa)}" disabled></div>
              <div><label>Modelo</label><input data-array="motos" data-idx="${i}" data-field="modelo" value="${A.escapeHtml(r.motos[i]?.modelo)}" disabled></div>
              <div><label>Tag</label><input data-array="motos" data-idx="${i}" data-field="tag" value="${A.escapeHtml(r.motos[i]?.tag)}" disabled></div>
            </div>
          `).join('')}
        </details>

        <details><summary><strong>7. Bicicletas</strong></summary>
          ${[0,1].map(i => `
            <div class="form-grid nested">
              <div class="full"><label><strong>Bicicleta ${i+1}</strong></label></div>
              <div><label>Marca</label><input data-array="bicis" data-idx="${i}" data-field="marca" value="${A.escapeHtml(r.bicis[i]?.marca)}" disabled></div>
              <div><label>Color</label><input data-array="bicis" data-idx="${i}" data-field="color" value="${A.escapeHtml(r.bicis[i]?.color)}" disabled></div>
              <div><label>Clase</label><input data-array="bicis" data-idx="${i}" data-field="clase" value="${A.escapeHtml(r.bicis[i]?.clase)}" disabled></div>
              <div><label>Serial</label><input data-array="bicis" data-idx="${i}" data-field="serial" value="${A.escapeHtml(r.bicis[i]?.serial)}" disabled></div>
            </div>
          `).join('')}
        </details>

        <details><summary><strong>8. Llaveros y tags electrónicos</strong></summary>
          <div class="form-grid">
            <div><label>Llaveros entregados</label><input id="edit-llaverosAut" value="${A.escapeHtml(r.llaverosAut)}" disabled></div>
            <div><label>Tags entregados</label><input id="edit-tagsAut" value="${A.escapeHtml(r.tagsAut)}" disabled></div>
          </div>
          <p style="font-size:0.82em; color:var(--gris-med); margin-top:6px;">Nota: llaveros/tags aún no están operativos. Esta sección es solo informativa.</p>
        </details>

        <details><summary><strong>9. Dispositivos (control de acceso)</strong></summary>
          ${[0,1,2].map(i => `
            <div class="form-grid nested">
              <div class="full"><label><strong>Dispositivo ${i+1}</strong></label></div>
              <div><label>Tipo</label><input data-array="dispositivos" data-idx="${i}" data-field="tipo" value="${A.escapeHtml(r.dispositivos[i]?.tipo)}" disabled></div>
              <div><label>Código</label><input data-array="dispositivos" data-idx="${i}" data-field="codigo" value="${A.escapeHtml(r.dispositivos[i]?.codigo)}" disabled></div>
              <div><label>Placa</label><input data-array="dispositivos" data-idx="${i}" data-field="placa" value="${A.escapeHtml(r.dispositivos[i]?.placa)}" disabled></div>
              <div><label>Fecha</label><input data-array="dispositivos" data-idx="${i}" data-field="fecha" value="${A.escapeHtml(r.dispositivos[i]?.fecha)}" disabled></div>
              <div><label>Recibe</label><input data-array="dispositivos" data-idx="${i}" data-field="recibe" value="${A.escapeHtml(r.dispositivos[i]?.recibe)}" disabled></div>
            </div>
          `).join('')}
        </details>

        <details><summary><strong>10. Mascotas (Decreto 768 de 2025)</strong></summary>
          ${[0,1].map(i => `
            <div class="form-grid nested">
              <div class="full"><label><strong>Mascota ${i+1}</strong></label></div>
              <div><label>Tipo</label><input data-array="mascotas" data-idx="${i}" data-field="tipo" value="${A.escapeHtml(r.mascotas[i]?.tipo)}" disabled></div>
              <div><label>Nombre</label><input data-array="mascotas" data-idx="${i}" data-field="nombre" value="${A.escapeHtml(r.mascotas[i]?.nombre)}" disabled></div>
              <div><label>Raza</label><input data-array="mascotas" data-idx="${i}" data-field="raza" value="${A.escapeHtml(r.mascotas[i]?.raza)}" disabled></div>
              <div><label>Color</label><input data-array="mascotas" data-idx="${i}" data-field="color" value="${A.escapeHtml(r.mascotas[i]?.color)}" disabled></div>
              <div><label>Sexo</label>
                <select data-array="mascotas" data-idx="${i}" data-field="sexo" disabled>
                  <option value=""></option>
                  <option value="Macho" ${r.mascotas[i]?.sexo==='Macho'?'selected':''}>Macho</option>
                  <option value="Hembra" ${r.mascotas[i]?.sexo==='Hembra'?'selected':''}>Hembra</option>
                </select>
              </div>
              <div><label>Vacunado</label>
                <select data-array="mascotas" data-idx="${i}" data-field="vacuna" disabled>
                  <option value=""></option>
                  <option value="Si" ${r.mascotas[i]?.vacuna==='Si'?'selected':''}>Sí</option>
                  <option value="No" ${r.mascotas[i]?.vacuna==='No'?'selected':''}>No</option>
                </select>
              </div>
              <div><label>Manejo especial</label>
                <select data-array="mascotas" data-idx="${i}" data-field="manejoEspecial" disabled>
                  <option value=""></option>
                  <option value="true" ${(r.mascotas[i]?.manejoEspecial==='Sí' || r.mascotas[i]?.manejoEspecial===true)?'selected':''}>Sí</option>
                  <option value="false" ${(r.mascotas[i]?.manejoEspecial==='No' || r.mascotas[i]?.manejoEspecial===false)?'selected':''}>No</option>
                </select>
              </div>
              <div><label>Registro</label><input data-array="mascotas" data-idx="${i}" data-field="registro" value="${A.escapeHtml(r.mascotas[i]?.registro)}" disabled></div>
              <div><label>Aseguradora</label><input data-array="mascotas" data-idx="${i}" data-field="aseguradora" value="${A.escapeHtml(r.mascotas[i]?.aseguradora)}" disabled></div>
              <div><label>Póliza</label><input data-array="mascotas" data-idx="${i}" data-field="poliza" value="${A.escapeHtml(r.mascotas[i]?.poliza)}" disabled></div>
            </div>
          `).join('')}
        </details>

        <details><summary><strong>11. Contactos de emergencia</strong></summary>
          ${[0,1].map(i => `
            <div class="form-grid nested">
              <div class="full"><label><strong>Contacto ${i+1}</strong></label></div>
              <div class="full"><label>Nombre</label><input data-array="emergencias" data-idx="${i}" data-field="nombre" value="${A.escapeHtml(r.emergencias[i]?.nombre)}" disabled></div>
              <div><label>Parentesco</label><input data-array="emergencias" data-idx="${i}" data-field="parent" value="${A.escapeHtml(r.emergencias[i]?.parent)}" disabled></div>
              <div><label>Teléfono</label><input data-array="emergencias" data-idx="${i}" data-field="tel" value="${A.escapeHtml(r.emergencias[i]?.tel)}" disabled></div>
            </div>
          `).join('')}
        </details>

        <details><summary><strong>12. Autorizaciones y firma</strong></summary>
          <div class="form-grid">
            <div><label><input type="checkbox" id="edit-autDatos" ${r.autDatos==='Sí'?'checked':''} disabled> Autoriza tratamiento de datos (Ley 1581)</label></div>
            <div><label><input type="checkbox" id="edit-autMenores" ${r.autMenores==='Sí'?'checked':''} disabled> Autoriza datos de menores</label></div>
            <div><label><input type="checkbox" id="edit-autCom" ${r.autCom==='Sí'?'checked':''} disabled> Autoriza comunicaciones</label></div>
            <div><label>Nombre firma</label><input id="edit-firmaNom" value="${A.escapeHtml(r.firmaNom)}" disabled></div>
            <div><label>C.C. firma</label><input id="edit-firmaCC" value="${A.escapeHtml(r.firmaCC)}" disabled></div>
          </div>
        </details>

        <div class="action-bar">
          <button type="button" class="btn btn-primary" id="btnEdit">✏️ Habilitar edición</button>
          <button type="button" class="btn btn-secondary hidden" id="btnExpandAll">📂 Expandir todo</button>
          <button type="button" class="btn btn-secondary hidden" id="btnCollapseAll">📁 Colapsar todo</button>
          <button type="button" class="btn btn-secondary hidden" id="btnCancelEdit">↶ Cancelar edición</button>
          <button type="button" class="btn btn-primary hidden" id="btnSave">💾 Guardar cambios</button>
          <span style="flex:1"></span>
          <small style="color:var(--gris-med); font-size: 0.82em;">Última edición: ${A.escapeHtml(r.fechaEdicion)}</small>
        </div>
      </div>
    `;
    document.getElementById('detailContainer').innerHTML = html;

    document.getElementById('btnEdit').addEventListener('click', () => A.editar());
    document.getElementById('btnSave').addEventListener('click', () => A.guardar());
    document.getElementById('btnCancelEdit').addEventListener('click', () => A.cancelarEdicion());
    document.getElementById('btnExpandAll').addEventListener('click', () => {
      document.querySelectorAll('.detail-card details').forEach(d => d.open = true);
    });
    document.getElementById('btnCollapseAll').addEventListener('click', () => {
      document.querySelectorAll('.detail-card details').forEach(d => d.open = false);
    });
  },

  // ============================================================
  // EDICION
  // ============================================================
  editar() {
    A.state.editMode = true;
    // Habilitar todos los inputs del detail
    document.querySelectorAll('.detail-card input, .detail-card select').forEach(el => {
      el.disabled = false;
    });
    document.getElementById('btnEdit').classList.add('hidden');
    document.getElementById('btnExpandAll').classList.remove('hidden');
    document.getElementById('btnCollapseAll').classList.remove('hidden');
    document.getElementById('btnCancelEdit').classList.remove('hidden');
    document.getElementById('btnSave').classList.remove('hidden');
    A.showAlert('Edición habilitada. Modifica lo que necesites y haz clic en "Guardar cambios".', 'info');
  },

  cancelarEdicion() {
    if (!A.state.selectedRow) return;
    A.renderDetail(A.state.selectedRow, 0); // re-renderiza y resetea valores
    A.hideAlert();
  },

  // Recolectar TODOS los campos del formulario al payload
  recolectarPayload() {
    const v = id => {
      const el = document.getElementById('edit-' + id);
      return el ? el.value : undefined;
    };

    // Arrays: leer inputs con data-array
    function leerArray(name, count) {
      const arr = [];
      for (let i = 0; i < count; i++) {
        const obj = {};
        document.querySelectorAll(`[data-array="${name}"][data-idx="${i}"]`).forEach(el => {
          obj[el.dataset.field] = el.value;
        });
        arr.push(obj);
      }
      return arr;
    }

    return {
      numForm: A.state.selectedNumForm,
      apto: v('apto'),
      firmaFecha: v('firmaFecha'),
      diligencia: v('diligencia'),
      matriculaApto: v('matriculaApto'),
      nombreProp: v('nombreProp'),
      ccProp: v('ccProp'),
      correoProp: v('correoProp'),
      celProp: v('celProp'),
      telFijoProp: v('telFijoProp'),
      parq1Celda: v('parq1Celda'),
      parq1Mat: v('parq1Mat'),
      parq2Celda: v('parq2Celda'),
      parq2Mat: v('parq2Mat'),
      requiereRevision: v('requiereRevision'),
      observMatriculas: v('observMatriculas'),
      nombreArr: v('nombreArr'),
      ccArr: v('ccArr'),
      correoArr: v('correoArr'),
      celArr: v('celArr'),
      parqTerNom: v('parqTerNom'),
      parqTerApto: v('parqTerApto'),
      parqTerCel: v('parqTerCel'),
      inmobRazon: v('inmobRazon'),
      inmobNit: v('inmobNit'),
      inmobContacto: v('inmobContacto'),
      inmobTel: v('inmobTel'),
      inmobCorreo: v('inmobCorreo'),
      residentes: leerArray('residentes', 4),
      menores: leerArray('menores', 4),
      vehiculos: leerArray('vehiculos', 2),
      motos: leerArray('motos', 2),
      bicis: leerArray('bicis', 2),
      llaverosAut: v('llaverosAut'),
      tagsAut: v('tagsAut'),
      dispositivos: leerArray('dispositivos', 3),
      mascotas: leerArray('mascotas', 2),
      emergencias: leerArray('emergencias', 2),
      autDatos: document.getElementById('edit-autDatos')?.checked || false,
      autMenores: document.getElementById('edit-autMenores')?.checked || false,
      autCom: document.getElementById('edit-autCom')?.checked || false,
      firmaNom: v('firmaNom'),
      firmaCC: v('firmaCC')
    };
  },

  async guardar() {
    A.hideAlert();
    const payload = A.recolectarPayload();
    payload.action = 'adminGuardar';

    // Validacion basica cliente
    if (!payload.apto || !payload.apto.trim()) {
      A.showAlert('Falta N° de apartamento.', 'err'); return;
    }
    if (!payload.nombreProp || !payload.nombreProp.trim()) {
      A.showAlert('Falta nombre del propietario.', 'err'); return;
    }
    if (!payload.ccProp || !payload.ccProp.trim()) {
      A.showAlert('Falta CC del propietario.', 'err'); return;
    }
    if (!payload.correoProp || payload.correoProp.indexOf('@') === -1) {
      A.showAlert('Correo del propietario inválido.', 'err'); return;
    }

    const btn = document.getElementById('btnSave');
    btn.disabled = true; btn.textContent = 'Guardando...';

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
      await A.seleccionar(A.state.selectedNumForm);
    } catch (e) { A.showAlert('Error de red: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = '💾 Guardar cambios'; }
  },

  // ============================================================
  // SALÓN SOCIAL (spec-salon-social.md F5)
  // Pestaña admin: lista de reservas + ver comprobante + cancelar
  // ============================================================

  // Estado del salón social
  salonState: {
    currentReservaId: null
  },

  async navSalon() {
    document.getElementById('tab-residentes-admin').classList.add('hidden');
    document.getElementById('tab-salon-admin').classList.remove('hidden');
    document.getElementById('btnNavResidentes').classList.remove('btn-primary');
    document.getElementById('btnNavResidentes').classList.add('btn-secondary');
    document.getElementById('btnNavSalon').classList.remove('btn-secondary');
    document.getElementById('btnNavSalon').classList.add('btn-primary');
    await this.cargarSalonList();
  },

  navResidentes() {
    document.getElementById('tab-salon-admin').classList.add('hidden');
    document.getElementById('tab-mudanzas-admin').classList.add('hidden');
    document.getElementById('tab-residentes-admin').classList.remove('hidden');
    document.getElementById('btnNavSalon').classList.remove('btn-primary');
    document.getElementById('btnNavSalon').classList.add('btn-secondary');
    document.getElementById('btnNavMudanzas').classList.remove('btn-primary');
    document.getElementById('btnNavMudanzas').classList.add('btn-secondary');
    document.getElementById('btnNavResidentes').classList.remove('btn-secondary');
    document.getElementById('btnNavResidentes').classList.add('btn-primary');
  },

  // Pestaña Mudanzas (programadas)
  async navMudanzas() {
    document.getElementById('tab-residentes-admin').classList.add('hidden');
    document.getElementById('tab-salon-admin').classList.add('hidden');
    document.getElementById('tab-mudanzas-admin').classList.remove('hidden');
    document.getElementById('btnNavResidentes').classList.remove('btn-primary');
    document.getElementById('btnNavResidentes').classList.add('btn-secondary');
    document.getElementById('btnNavSalon').classList.remove('btn-primary');
    document.getElementById('btnNavSalon').classList.add('btn-secondary');
    document.getElementById('btnNavMudanzas').classList.remove('btn-secondary');
    document.getElementById('btnNavMudanzas').classList.add('btn-primary');
    await this.cargarMudanzasList();
  },

  async cargarMudanzasList() {
    const estado = document.getElementById('mudanzasEstadoFilter').value;
    const torre = document.getElementById('mudanzasTorreFilter').value;
    const container = document.getElementById('mudanzasList');
    container.innerHTML = '<p style="text-align:center; color:var(--gris-med); padding:20px;">Cargando...</p>';

    try {
      const params = { action: 'adminListarReservasMudanzas', estado: estado };
      if (torre) params.torre = torre;
      const r = await A.apiGet(params);

      if (!r.ok) {
        container.innerHTML = '<p style="color:var(--err); padding:20px;">Error: ' + (r.error || 'desconocido') + '</p>';
        return;
      }

      const reservas = r.reservas || [];
      if (reservas.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--gris-med); padding:30px;">No hay reservas de mudanzas con esos filtros.</p>';
        return;
      }

      let html = '<p style="margin-bottom:12px; color:var(--gris-med); font-size:0.92em;">Total: <strong>' + reservas.length + '</strong> reserva(s)</p>';
      html += '<table class="results-table"><thead><tr>';
      html += '<th>ID</th><th>Fecha</th><th>Turno</th><th>Torre</th><th>Ascensor</th><th>Tipo</th><th>Apto</th><th>Solicitante</th><th>Celular</th><th>Placa</th><th>Estado</th>';
      html += '</tr></thead><tbody>';

      reservas.forEach(res => {
        const estadoColor = res.estado === 'Confirmada' ? 'var(--ok)' : 'var(--gris-med)';
        const fecha = res.fecha ? res.fecha : '(sin fecha)';
        const hora = (res.horaInicio && res.horaFin) ? res.horaInicio + ' - ' + res.horaFin : '';

        html += '<tr>';
        html += '<td><code>' + res.id + '</code></td>';
        html += '<td>' + fecha + '</td>';
        html += '<td>' + hora + '</td>';
        html += '<td>Torre ' + res.torre + '</td>';
        html += '<td>' + res.ascensor + '</td>';
        html += '<td>' + res.tipoMudanza + '</td>';
        html += '<td>' + res.apto + '</td>';
        html += '<td>' + res.nombreSolicitante + '<br><small style="color:var(--gris-med);">CC ' + res.ccSolicitante + '</small></td>';
        html += '<td>' + res.celular + '</td>';
        html += '<td>' + (res.placa || '-') + '</td>';
        html += '<td style="color:' + estadoColor + ';">' + res.estado + '</td>';
        html += '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = '<p style="color:var(--err);">Error de red: ' + e.message + '</p>';
    }
  },

  async cargarSalonList() {
    const estado = document.getElementById('salonEstadoFilter').value;
    const container = document.getElementById('salonList');
    container.innerHTML = '<p style="text-align:center; color:var(--gris-med); padding:20px;">Cargando...</p>';

    try {
      const r = await A.apiGet({ action: 'adminListarReservasSalon', estado: estado });

      if (!r.ok) {
        container.innerHTML = '<p style="color:var(--err); padding:20px;">Error: ' + (r.error || 'desconocido') + '</p>';
        return;
      }

      const reservas = r.reservas || [];
      if (reservas.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--gris-med); padding:30px;">No hay reservas con estado "' + estado + '".</p>';
        return;
      }

      let html = '<table class="results-table"><thead><tr>';
      html += '<th>ID</th><th>Apto</th><th>Solicitante</th><th>Fecha</th><th>Slot</th><th>Comprobante</th><th>Estado</th><th>Acciones</th>';
      html += '</tr></thead><tbody>';

      reservas.forEach(res => {
        const estadoColor = res.estado === 'Pagado' ? 'var(--ok)' :
                            res.estado === 'PendientePago' ? 'var(--adv)' :
                            res.estado === 'CanceladoPorAdmin' ? 'var(--err)' :
                            'var(--gris-med)';
        const comprobanteCell = res.tieneComprobante
          ? '<button class="btn btn-secondary" style="padding:4px 8px; font-size:0.85em;" onclick="A.verComprobante(\'' + res.id + '\')">📎 Ver</button>'
          : '<span style="color:var(--gris-med); font-size:0.85em;">Sin comprobante</span>';

        html += '<tr>';
        html += '<td><code>' + res.id + '</code></td>';
        html += '<td>' + res.apto + '</td>';
        html += '<td>' + res.nombre + '<br><small style="color:var(--gris-med);">' + res.ccSolicitante + '</small></td>';
        html += '<td>' + res.fechaReserva + '</td>';
        html += '<td>' + res.slot + '</td>';
        html += '<td>' + comprobanteCell + '</td>';
        html += '<td style="color:' + estadoColor + ';">' + res.estado + '</td>';
        html += '<td>';
        if (res.estado === 'Pagado' || res.estado === 'PendientePago') {
          html += '<button class="btn btn-danger" style="padding:4px 8px; font-size:0.85em;" onclick="A.abrirModalCancelar(\'' + res.id + '\', \'' + res.apto + '\', \'' + res.nombre.replace(/'/g, "\\'") + '\', \'' + res.fechaReserva + '\', \'' + res.slot + '\')">❌ Cancelar</button>';
        }
        html += '</td>';
        html += '</tr>';
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = '<p style="color:var(--err);">Error de red: ' + e.message + '</p>';
    }
  },

  async verComprobante(reservaId) {
    try {
      const r = await A.apiGet({ action: 'adminVerComprobanteSalon', reservaId: reservaId });
      if (!r.ok) {
        A.showAlert('Error al obtener comprobante: ' + (r.error || ''), 'err');
        return;
      }
      if (!r.tieneComprobante) {
        A.showAlert('Esta reserva no tiene comprobante subido.', 'err');
        return;
      }
      // Abrir en nueva pestaña
      window.open(r.comprobanteUrl, '_blank');
    } catch (e) {
      A.showAlert('Error de red: ' + e.message, 'err');
    }
  },

  abrirModalCancelar(reservaId, apto, nombre, fecha, slot) {
    A.salonState.currentReservaId = reservaId;
    document.getElementById('modalSalonDetalle').innerHTML =
      '<strong>Reserva:</strong> ' + reservaId + '<br>' +
      '<strong>Solicitante:</strong> ' + nombre + ' (Apto ' + apto + ')<br>' +
      '<strong>Fecha:</strong> ' + fecha + ' (' + slot + ')';
    document.getElementById('modalSalonMotivo').value = '';
    document.getElementById('modal-cancelar-salon').classList.remove('hidden');
  },

  cerrarModalCancelar() {
    document.getElementById('modal-cancelar-salon').classList.add('hidden');
    A.salonState.currentReservaId = null;
  },

  async confirmarCancelarReserva() {
    const motivo = document.getElementById('modalSalonMotivo').value.trim();
    if (!motivo) {
      alert('Por favor ingrese el motivo de cancelación.');
      return;
    }
    const password = prompt('Para confirmar, ingrese la contraseña de administrador:');
    if (!password) return;

    const btn = document.getElementById('btnConfirmarCancelarSalon');
    btn.disabled = true;
    btn.textContent = 'Cancelando...';

    try {
      const r = await A.apiPost({
        action: 'adminCancelarReservaSalon',
        reservaId: A.salonState.currentReservaId,
        motivo: motivo,
        adminPassword: password
      });

      if (!r.ok) {
        alert('Error: ' + (r.error || 'desconocido'));
        btn.disabled = false;
        btn.textContent = '🗑️ Confirmar cancelación';
        return;
      }

      A.cerrarModalCancelar();
      A.showAlert('✅ Reserva ' + A.salonState.currentReservaId + ' cancelada por administrador.', 'ok');
      await A.cargarSalonList();
    } catch (e) {
      alert('Error de red: ' + e.message);
      btn.disabled = false;
      btn.textContent = '🗑️ Confirmar cancelación';
    }
  },

  // ============================================================
  // INIT
  // ============================================================
  bindEvents() {
    document.getElementById('btnLogin').addEventListener('click', () => A.login());
    document.getElementById('loginPassword').addEventListener('keypress', (e) => { if (e.key === 'Enter') A.login(); });
    document.getElementById('btnSearch').addEventListener('click', () => A.buscar());
    document.getElementById('searchInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') A.buscar(); });
    document.getElementById('btnLogout').addEventListener('click', () => A.logout());

    // Salón social (F5)
    document.getElementById('btnNavResidentes').addEventListener('click', () => A.navResidentes());
    document.getElementById('btnNavSalon').addEventListener('click', () => A.navSalon());
    document.getElementById('btnCargarSalon').addEventListener('click', () => A.cargarSalonList());
    document.getElementById('salonEstadoFilter').addEventListener('change', () => A.cargarSalonList());
    document.getElementById('btnCancelarModalSalon').addEventListener('click', () => A.cerrarModalCancelar());
    document.getElementById('btnConfirmarCancelarSalon').addEventListener('click', () => A.confirmarCancelarReserva());

    // Mudanzas (pestaña admin)
    document.getElementById('btnNavMudanzas').addEventListener('click', () => A.navMudanzas());
    document.getElementById('btnCargarMudanzas').addEventListener('click', () => A.cargarMudanzasList());
    document.getElementById('mudanzasEstadoFilter').addEventListener('change', () => A.cargarMudanzasList());
    document.getElementById('mudanzasTorreFilter').addEventListener('change', () => A.cargarMudanzasList());
  }
};

document.addEventListener('DOMContentLoaded', () => {
  A.bindEvents();
  if (sessionStorage.getItem('adminLoggedIn') === 'true') {
    A.state.loggedIn = true;
    document.getElementById('sessionBadge').style.display = '';
    A.showVista('panel');
  } else {
    A.showVista('login');
  }
});
