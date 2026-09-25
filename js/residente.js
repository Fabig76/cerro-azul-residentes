// ============================================================
// PORTAL DEL RESIDENTE — Cerro Azul Residentes
// spec-residente.md F4 — Versión 1.0
// Endpoints usados: getEstadoResidente, verificarResidente,
//                   registrarResidente, actualizarResidente
// ============================================================

// ============ CONFIGURACIÓN ============
const APP_URL = 'https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec';

// ============ ESTADO GLOBAL ============
const state = {
  apto: null,
  numForm: null,
  cc: null,
  slot: null,
  nombre: null,
  numResidentesActuales: 0,
  nombresResidentesActuales: [],
  // Para formularios dinámicos
  numResidentesForm: 1,
  numMenoresForm: 0,
  numVehiculosForm: 0,
  numMotosForm: 0,
  numBicisForm: 0,
  numMascotasForm: 0,
  numContactosForm: 0,
  // Para edición: si un slot compartido está ocupado por otro residente
  slotsOcupadosPorOtro: { vehiculos: [], motos: [], bicis: [], mascotas: [], contactos: [] }
};

// ============ HELPERS FETCH ============
async function apiGet(params) {
  const url = new URL(APP_URL);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v);
  });
  const r = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  return r.json();
}

async function apiPost(payload) {
  const r = await fetch(APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });
  return r.json();
}

// ============ HELPERS UI ============
function showView(name) {
  ['inicial', 'con-datos', 'no-existe', 'registro', 'editar', 'exito']
    .forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('hidden', v !== name);
    });
  window.scrollTo(0, 0);
}

function showAlert(viewName, msg, type = 'error') {
  const el = document.getElementById('alert-' + viewName);
  if (!el) return;
  el.textContent = msg;
  el.className = 'alert show ' + type;
  setTimeout(() => { el.classList.remove('show'); el.classList.add('hidden'); }, 8000);
}

function showAlertInAlert(viewName, msg, type) {
  showAlert(viewName, msg, type);
}

// ============ FLUJO 1: INGRESO CON APTO ============
async function flujoInicial() {
  const apto = document.getElementById('aptoInput').value.trim();
  if (!apto) {
    showAlert('inicial', 'Por favor ingrese el N° de apartamento', 'error');
    return;
  }

  const btn = document.getElementById('btnContinuar');
  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    const r = await apiGet({ action: 'getEstadoResidente', apto });

    if (!r.ok) {
      showAlert('inicial', r.error || 'Error al consultar', 'error');
      return;
    }

    state.apto = apto;

    if (!r.aptoExiste) {
      document.getElementById('neApto').textContent = apto;
      showView('no-existe');
      return;
    }

    state.numForm = r.numForm;

    if (!r.hayResidentes) {
      // APTO VACÍO → flujo de registro
      document.getElementById('regApto').textContent = apto;
      initFormularioRegistro();
      showView('registro');
      return;
    }

    // APTO CON RESIDENTES → pedir CC
    state.numResidentesActuales = r.numResidentes;
    state.nombresResidentesActuales = r.nombresResidentes || [];
    document.getElementById('cdApto').textContent = apto;
    const ul = document.getElementById('cdListaResidentes');
    ul.innerHTML = '';
    state.nombresResidentesActuales.forEach(n => {
      const li = document.createElement('li');
      li.textContent = '• ' + n;
      ul.appendChild(li);
    });
    document.getElementById('ccInput').value = '';
    showView('con-datos');
  } catch (e) {
    showAlert('inicial', 'Error de red: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Continuar';
  }
}

// ============ FLUJO 2: VERIFICAR CC ============
async function flujoVerificarCc() {
  const cc = document.getElementById('ccInput').value.replace(/[.\-\s]/g, '').trim();
  if (!cc) {
    showAlert('con-datos', 'Por favor ingrese su cédula', 'error');
    return;
  }

  const btn = document.getElementById('btnVerificar');
  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    const r = await apiGet({ action: 'verificarResidente', apto: state.apto, cc });

    if (!r.ok) {
      showAlert('con-datos', r.error || 'No se encontró el residente', 'error');
      return;
    }

    state.cc = cc;
    state.slot = r.slot;
    state.nombre = r.datos.nombre;

    // Inicializar formulario de edición
    initFormularioEdicion(r.datos);
    showView('editar');
  } catch (e) {
    showAlert('con-datos', 'Error de red: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Editar mis datos';
  }
}

// ============ FLUJO 3: AUTO-REGISTRO ============
function initFormularioRegistro() {
  state.numResidentesForm = 1;
  state.numMenoresForm = 0;
  state.numVehiculosForm = 0;
  state.numMotosForm = 0;
  state.numBicisForm = 0;
  state.numMascotasForm = 0;
  state.numContactosForm = 0;
  renderResidentesForm(1);
  renderMenoresForm(0);
  renderVehiculosForm(0);
  renderMotosForm(0);
  renderBicisForm(0);
  renderMascotasForm(0);
  renderContactosForm(0);
}

function renderResidentesForm(n) {
  state.numResidentesForm = Math.min(Math.max(n, 1), 4);
  const cont = document.getElementById('regResidentes');
  cont.innerHTML = '';
  for (let i = 1; i <= state.numResidentesForm; i++) {
    const div = document.createElement('div');
    div.className = 'residente-block';
    div.innerHTML = `
      <h4>Residente ${i}${i === 1 ? ' (tú)' : ''}</h4>
      <div class="field">
        <label>Nombre completo <span class="req">*</span></label>
        <input type="text" id="regRes${i}Nombre" autocomplete="off">
      </div>
      <div class="field-row">
        <div class="field">
          <label>Cédula <span class="req">*</span></label>
          <input type="text" id="regRes${i}Cc" inputmode="numeric" autocomplete="off">
        </div>
        <div class="field">
          <label>Parentesco <span class="req">*</span></label>
          <select id="regRes${i}Parent">
            <option value="">Seleccione…</option>
            <option value="Propietario">Propietario</option>
            <option value="Esposa">Esposa / Esposo</option>
            <option value="Hijo">Hijo / Hija</option>
            <option value="Padre">Padre / Madre</option>
            <option value="Hermano">Hermano / Hermana</option>
            <option value="Arrendatario">Arrendatario</option>
            <option value="Tenedor / Otro">Tenedor / Otro</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Celular <span class="req">*</span></label>
          <input type="text" id="regRes${i}Cel" inputmode="tel" autocomplete="off">
        </div>
        <div class="field">
          <label>Correo</label>
          <input type="email" id="regRes${i}Correo" autocomplete="off">
        </div>
      </div>
    `;
    cont.appendChild(div);
  }
}

function renderMenoresForm(n) {
  state.numMenoresForm = Math.min(Math.max(n, 0), 4);
  const cont = document.getElementById('regMenores');
  cont.innerHTML = '';
  for (let i = 1; i <= state.numMenoresForm; i++) {
    const div = document.createElement('div');
    div.className = 'residente-block';
    div.innerHTML = `
      <h4>Menor ${i}</h4>
      <div class="field-row">
        <div class="field">
          <label>Nombre</label>
          <input type="text" id="regMen${i}Nombre" autocomplete="off">
        </div>
        <div class="field">
          <label>Edad</label>
          <input type="number" id="regMen${i}Edad" min="0" max="17" autocomplete="off">
        </div>
      </div>
      <div class="field">
        <label>Parentesco</label>
        <input type="text" id="regMen${i}Parent" placeholder="Ej: Hijo, Sobrino" autocomplete="off">
      </div>
    `;
    cont.appendChild(div);
  }
}

function renderVehiculosForm(n) {
  state.numVehiculosForm = Math.min(Math.max(n, 0), 2);
  const cont = document.getElementById('regVehiculos');
  cont.innerHTML = '';
  for (let i = 1; i <= state.numVehiculosForm; i++) {
    const div = document.createElement('div');
    div.className = 'slot-compartido';
    div.innerHTML = `
      <h5>Vehículo ${i}</h5>
      <div class="field-row">
        <div class="field">
          <label>Placa</label>
          <input type="text" id="regVeh${i}Placa" placeholder="ABC123" autocomplete="off" style="text-transform:uppercase;">
        </div>
        <div class="field">
          <label>Marca</label>
          <input type="text" id="regVeh${i}Marca" autocomplete="off">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Tipo / Modelo</label>
          <input type="text" id="regVeh${i}Tipo" autocomplete="off">
        </div>
        <div class="field">
          <label>Color</label>
          <input type="text" id="regVeh${i}Color" autocomplete="off">
        </div>
      </div>
    `;
    cont.appendChild(div);
  }
}

function renderMotosForm(n) {
  state.numMotosForm = Math.min(Math.max(n, 0), 2);
  const cont = document.getElementById('regMotos');
  cont.innerHTML = '';
  for (let i = 1; i <= state.numMotosForm; i++) {
    const div = document.createElement('div');
    div.className = 'slot-compartido';
    div.innerHTML = `
      <h5>Moto ${i}</h5>
      <div class="field-row">
        <div class="field">
          <label>Placa</label>
          <input type="text" id="regMot${i}Placa" placeholder="ABC12A" autocomplete="off" style="text-transform:uppercase;">
        </div>
        <div class="field">
          <label>Marca</label>
          <input type="text" id="regMot${i}Marca" autocomplete="off">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Tipo / Modelo</label>
          <input type="text" id="regMot${i}Tipo" autocomplete="off">
        </div>
        <div class="field">
          <label>Color</label>
          <input type="text" id="regMot${i}Color" autocomplete="off">
        </div>
      </div>
    `;
    cont.appendChild(div);
  }
}

function renderBicisForm(n) {
  state.numBicisForm = Math.min(Math.max(n, 0), 2);
  const cont = document.getElementById('regBicis');
  cont.innerHTML = '';
  for (let i = 1; i <= state.numBicisForm; i++) {
    const div = document.createElement('div');
    div.className = 'slot-compartido';
    div.innerHTML = `
      <h5>Bicicleta ${i}</h5>
      <div class="field-row">
        <div class="field">
          <label>Marca</label>
          <input type="text" id="regBic${i}Marca" autocomplete="off">
        </div>
        <div class="field">
          <label>Color</label>
          <input type="text" id="regBic${i}Color" autocomplete="off">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Tipo</label>
          <input type="text" id="regBic${i}Tipo" placeholder="Montaña, Ruta, Urbana" autocomplete="off">
        </div>
        <div class="field">
          <label>Rodado</label>
          <input type="text" id="regBic${i}Rodado" placeholder="26, 27.5, 29" autocomplete="off">
        </div>
      </div>
    `;
    cont.appendChild(div);
  }
}

function renderMascotasForm(n) {
  state.numMascotasForm = Math.min(Math.max(n, 0), 2);
  const cont = document.getElementById('regMascotas');
  cont.innerHTML = '';
  for (let i = 1; i <= state.numMascotasForm; i++) {
    const div = document.createElement('div');
    div.className = 'slot-compartido';
    div.innerHTML = `
      <h5>Mascota ${i}</h5>
      <div class="field-row">
        <div class="field">
          <label>Nombre</label>
          <input type="text" id="regMas${i}Nombre" autocomplete="off">
        </div>
        <div class="field">
          <label>Especie</label>
          <select id="regMas${i}Especie">
            <option value="">Seleccione…</option>
            <option value="Perro">Perro</option>
            <option value="Gato">Gato</option>
            <option value="Ave">Ave</option>
            <option value="Pez">Pez</option>
            <option value="Conejo">Conejo</option>
            <option value="Hamster">Hámster</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Raza</label>
          <input type="text" id="regMas${i}Raza" autocomplete="off">
        </div>
        <div class="field">
          <label>Edad</label>
          <input type="text" id="regMas${i}Edad" placeholder="3 años" autocomplete="off">
        </div>
      </div>
      <div class="field">
        <label>Vacuna al día</label>
        <select id="regMas${i}Vacuna">
          <option value="">Seleccione…</option>
          <option value="Sí">Sí</option>
          <option value="No">No</option>
          <option value="N/A">No aplica</option>
        </select>
      </div>
    `;
    cont.appendChild(div);
  }
}

function renderContactosForm(n) {
  state.numContactosForm = Math.min(Math.max(n, 0), 2);
  const cont = document.getElementById('regContactos');
  cont.innerHTML = '';
  for (let i = 1; i <= state.numContactosForm; i++) {
    const div = document.createElement('div');
    div.className = 'slot-compartido';
    div.innerHTML = `
      <h5>Contacto de emergencia ${i}</h5>
      <div class="field-row">
        <div class="field">
          <label>Nombre</label>
          <input type="text" id="regCon${i}Nombre" autocomplete="off">
        </div>
        <div class="field">
          <label>Parentesco</label>
          <input type="text" id="regCon${i}Parent" placeholder="Madre, Hermano, etc." autocomplete="off">
        </div>
      </div>
      <div class="field">
        <label>Celular</label>
        <input type="text" id="regCon${i}Cel" inputmode="tel" autocomplete="off">
      </div>
    `;
    cont.appendChild(div);
  }
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

async function flujoRegistrar() {
  // Validar que al menos el residente 1 tenga nombre, CC, parentesco, cel
  const residentes = [];
  for (let i = 1; i <= state.numResidentesForm; i++) {
    const nombre = val(`regRes${i}Nombre`);
    const cc = val(`regRes${i}Cc`);
    const parent = val(`regRes${i}Parent`);
    const cel = val(`regRes${i}Cel`);
    if (!nombre || !cc || !parent || !cel) {
      showAlert('registro', `Complete todos los campos del Residente ${i} (nombre, cédula, parentesco, celular)`, 'error');
      return;
    }
    residentes.push({
      nombre, cc,
      parentesco: parent,
      cel,
      correo: val(`regRes${i}Correo`)
    });
  }

  // Menores (opcionales)
  const menores = [];
  for (let i = 1; i <= state.numMenoresForm; i++) {
    const nombre = val(`regMen${i}Nombre`);
    if (nombre) {
      menores.push({
        nombre,
        edad: val(`regMen${i}Edad`),
        parent: val(`regMen${i}Parent`)
      });
    }
  }

  // Vehículos (opcionales)
  const vehiculos = [];
  for (let i = 1; i <= state.numVehiculosForm; i++) {
    const placa = val(`regVeh${i}Placa`);
    if (placa) {
      vehiculos.push({
        marca: val(`regVeh${i}Marca`),
        tipo: val(`regVeh${i}Tipo`),
        color: val(`regVeh${i}Color`),
        placa: placa.toUpperCase(),
        modelo: '',
        tag: ''
      });
    }
  }

  const motos = [];
  for (let i = 1; i <= state.numMotosForm; i++) {
    const placa = val(`regMot${i}Placa`);
    if (placa) {
      motos.push({
        marca: val(`regMot${i}Marca`),
        tipo: val(`regMot${i}Tipo`),
        color: val(`regMot${i}Color`),
        placa: placa.toUpperCase(),
        modelo: '',
        tag: ''
      });
    }
  }

  const bicis = [];
  for (let i = 1; i <= state.numBicisForm; i++) {
    const marca = val(`regBic${i}Marca`);
    if (marca) {
      bicis.push({
        marca, color: val(`regBic${i}Color`),
        tipo: val(`regBic${i}Tipo`),
        rodado: val(`regBic${i}Rodado`)
      });
    }
  }

  const mascotas = [];
  for (let i = 1; i <= state.numMascotasForm; i++) {
    const nombre = val(`regMas${i}Nombre`);
    if (nombre) {
      mascotas.push({
        nombre,
        especie: val(`regMas${i}Especie`),
        raza: val(`regMas${i}Raza`),
        edad: val(`regMas${i}Edad`),
        vacuna: val(`regMas${i}Vacuna`)
      });
    }
  }

  const contactos = [];
  for (let i = 1; i <= state.numContactosForm; i++) {
    const nombre = val(`regCon${i}Nombre`);
    if (nombre) {
      contactos.push({
        nombre,
        parentesco: val(`regCon${i}Parent`),
        celular: val(`regCon${i}Cel`)
      });
    }
  }

  const payload = {
    action: 'registrarResidente',
    apto: state.apto,
    residentes,
    menores,
    vehiculos,
    motos,
    bicis,
    mascotas,
    contactos
  };

  const btn = document.getElementById('btnRegistrar');
  btn.disabled = true;
  btn.textContent = 'Registrando...';

  try {
    const r = await apiPost(payload);
    if (!r.ok) {
      showAlert('registro', r.error || 'No se pudo registrar', 'error');
      return;
    }
    // Éxito
    document.getElementById('alert-exito').textContent =
      `✅ Registro exitoso. Su información ha sido guardada.`;
    showView('exito');
  } catch (e) {
    showAlert('registro', 'Error de red: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Registrarme como residente';
  }
}

// ============ FLUJO 4: EDICIÓN ============
function initFormularioEdicion(datos) {
  document.getElementById('editNombre').textContent = datos.nombre;
  document.getElementById('editSlot').textContent = state.slot;
  document.getElementById('editApto').textContent = state.apto;

  document.getElementById('editNombreInput').value = datos.nombre || '';
  document.getElementById('editCcInput').value = datos.cc || '';
  document.getElementById('editParentesco').value = datos.parentesco || '';
  document.getElementById('editCel').value = datos.cel || '';
  document.getElementById('editCorreo').value = datos.correo || '';

  // Por simplicidad en esta primera versión, no mostramos edición de slots
  // compartidos en el portal del residente — eso lo gestiona el propietario
  // desde el portal admin. Solo permitir editar datos personales.
  document.getElementById('editVehiculos').innerHTML =
    '<p style="font-size:0.9em; color:var(--gris-med); padding:8px 0;">' +
    'Para actualizar vehículos, mascotas o contactos, contacte al propietario del apartamento ' +
    'o use el botón "Editar mi registro" del propietario. Esta sección se ampliará en próximas versiones.' +
    '</p>';
  document.getElementById('editMascotas').innerHTML = '';
  document.getElementById('editContactos').innerHTML = '';
}

async function flujoGuardarEdicion() {
  const nombre = val('editNombreInput');
  const parentesco = val('editParentesco');
  const cel = val('editCel');
  const correo = val('editCorreo');

  if (!nombre || !parentesco || !cel) {
    showAlert('editar', 'Complete nombre, parentesco y celular', 'error');
    return;
  }

  const payload = {
    action: 'actualizarResidente',
    apto: state.apto,
    cc: state.cc,
    slot: state.slot,
    datosActualizados: {
      residentes: [{ nombre, cc: state.cc, parentesco, cel, correo }],
      vehiculos: [],
      motos: [],
      bicis: [],
      mascotas: [],
      contactos: []
    }
  };

  const btn = document.getElementById('btnGuardarEdit');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const r = await apiPost(payload);
    if (!r.ok) {
      showAlert('editar', r.error || 'No se pudo guardar', 'error');
      return;
    }
    document.getElementById('alert-exito').textContent =
      `✅ Sus datos personales han sido actualizados correctamente.`;
    showView('exito');
  } catch (e) {
    showAlert('editar', 'Error de red: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar mis datos';
  }
}

// ============ INIT / EVENT HANDLERS ============
document.addEventListener('DOMContentLoaded', () => {
  // Vista inicial
  document.getElementById('btnContinuar').addEventListener('click', flujoInicial);
  document.getElementById('aptoInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') flujoInicial();
  });

  // Vista con-datos
  document.getElementById('btnVerificar').addEventListener('click', flujoVerificarCc);
  document.getElementById('ccInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') flujoVerificarCc();
  });
  document.getElementById('btnVolverConDatos').addEventListener('click', () => showView('inicial'));

  // Vista no-existe
  document.getElementById('btnVolverNe').addEventListener('click', () => showView('inicial'));

  // Vista registro
  document.getElementById('btnAddResidente').addEventListener('click', () =>
    renderResidentesForm(state.numResidentesForm + 1));
  document.getElementById('btnAddMenor').addEventListener('click', () =>
    renderMenoresForm(state.numMenoresForm + 1));
  document.getElementById('btnRegistrar').addEventListener('click', flujoRegistrar);
  document.getElementById('btnCancelarReg').addEventListener('click', () => showView('inicial'));

  // Atajos para agregar vehículos, motos, bicis, mascotas, contactos
  // (los botones "+ Agregar" se crean dinámicamente arriba del contenedor)
  // Para esta versión v1 usamos botones visibles adicionales
  const vehAdd = document.createElement('button');
  vehAdd.type = 'button';
  vehAdd.className = 'btn btn-secondary';
  vehAdd.style.marginBottom = '12px';
  vehAdd.textContent = '+ Agregar vehículo';
  vehAdd.addEventListener('click', () => renderVehiculosForm(state.numVehiculosForm + 1));
  document.getElementById('regVehiculos').parentNode.insertBefore(vehAdd, document.getElementById('regVehiculos').nextSibling);

  const motAdd = document.createElement('button');
  motAdd.type = 'button';
  motAdd.className = 'btn btn-secondary';
  motAdd.style.marginBottom = '12px';
  motAdd.textContent = '+ Agregar moto';
  motAdd.addEventListener('click', () => renderMotosForm(state.numMotosForm + 1));
  document.getElementById('regMotos').parentNode.insertBefore(motAdd, document.getElementById('regMotos').nextSibling);

  const bicAdd = document.createElement('button');
  bicAdd.type = 'button';
  bicAdd.className = 'btn btn-secondary';
  bicAdd.style.marginBottom = '12px';
  bicAdd.textContent = '+ Agregar bicicleta';
  bicAdd.addEventListener('click', () => renderBicisForm(state.numBicisForm + 1));
  document.getElementById('regBicis').parentNode.insertBefore(bicAdd, document.getElementById('regBicis').nextSibling);

  const masAdd = document.createElement('button');
  masAdd.type = 'button';
  masAdd.className = 'btn btn-secondary';
  masAdd.style.marginBottom = '12px';
  masAdd.textContent = '+ Agregar mascota';
  masAdd.addEventListener('click', () => renderMascotasForm(state.numMascotasForm + 1));
  document.getElementById('regMascotas').parentNode.insertBefore(masAdd, document.getElementById('regMascotas').nextSibling);

  const conAdd = document.createElement('button');
  conAdd.type = 'button';
  conAdd.className = 'btn btn-secondary';
  conAdd.style.marginBottom = '12px';
  conAdd.textContent = '+ Agregar contacto de emergencia';
  conAdd.addEventListener('click', () => renderContactosForm(state.numContactosForm + 1));
  document.getElementById('regContactos').parentNode.insertBefore(conAdd, document.getElementById('regContactos').nextSibling);

  // Vista editar
  document.getElementById('btnGuardarEdit').addEventListener('click', flujoGuardarEdicion);
  document.getElementById('btnCancelarEdit').addEventListener('click', () => showView('con-datos'));

  // Vista éxito
  document.getElementById('btnVolverInicio').addEventListener('click', () => showView('inicial'));

  // Mostrar vista inicial
  showView('inicial');
});