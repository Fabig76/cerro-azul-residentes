# Spec — Portal del Residente (Cerro Azul Residentes)

> Spec técnico del módulo de auto-actualización de residentes del
> proyecto `Fabig76/cerro-azul-residentes`. Versión 1.0.0,
> 25-Sept-2026. Pendiente aprobación del operador (Fabio) antes de
> implementación.

---

## §1. Contexto

El proyecto Cerro Azul Residentes tiene hoy 4 portales live:

1. **Formulario público** (`index.html`) — 11 secciones, 143 columnas
2. **Portal admin** (`admin.html`) — edición de residentes
3. **Portal vigilantes** (`vigilantes.html`) — consulta de residentes
4. **Portal contable** (`estado-cuenta.html`) — factura y paz y salvo

**El propietario** del apartamento es quien debe llenar hoy TODA la
información de los residentes (incluyendo sus vehículos, mascotas,
bicis, contactos de emergencia). En la práctica, el propietario no
siempre tiene esos datos — y muchos propietarios ni siquiera quieren
saber detalles de cada residente.

**El residente** adulto del apartamento puede tener información que
el propietario NO tiene: su placa de vehículo personal, su mascota,
su contacto de emergencia personal. Pero hoy no tiene forma de
actualizar SU info sin pasar por el propietario.

---

## §2. Necesidad del usuario (palabras del operador)

> "los dueños ni las inmobiliarias quiere hacer esto entonces envia
> el qr para que los nuevos lo llenen"

Y en mensajes anteriores:

> "se debe crear una pestaña adicional para residentes con su propio
> qr y esto porque? porque se envia este qr al residente para que el
> llene su informacion residentes adultos menores vehiculos, mascotas
> biciletas datos de contacto esto va aglizar mas todo para actualizar
> la informacion el residente podra colocar una de las cedulas
> registradas el numero del apto entoces podra registrarce"

**Requerimiento refinado (4 rondas de iteración):**

1. QR genérico por apartamento (mismo QR para todos los residentes)
2. Portal nuevo: `residente.html` (mismo patrón que `estado-cuenta.html`)
3. El residente escanea el QR → coloca N° apto → el sistema decide:
   - Si el apto está VACÍO de residentes → formulario de auto-registro completo (secciones 5, 5.1, 6, 7, 9, 10)
   - Si el apto TIENE residentes → mensaje "comuníquese con el propietario" + opción de colocar CC para editar
4. Para EDITAR el residente coloca N° apto + CC
5. El residente SOLO edita sus datos personales + vehículos + mascotas + bicis + contactos. NO edita datos del propietario.
6. El propietario tiene un botón "Borrado de datos residente" en el formulario principal (modo edición) que limpia secciones 5, 5.1, 6, 7, 9, 10 de un solo golpe
7. El residente NO tiene botón borrar

---

## §3. Alcance

### §3.1 IN scope

- 1 nuevo portal frontend (`residente.html` + `js/residente.js`)
- 5 nuevos endpoints Apps Script
- 1 nuevo botón en `index.html` modo edición (borrado de residente)
- 1 nuevo modal de confirmación (CSS + JS)
- Actualización de `manual-llenado-cerro-azul.html` con 2 secciones nuevas
- Actualización de `GUIA-PROYECTO.md` con §22
- Actualización de `TESTING-PROTOCOL.md` con 8 nuevos tests E2E
- 1 nuevo spec (`docs/spec-residente.md` — este documento)
- 1 nuevo resumen operativo (`docs/proyecto-residente.md`)
- 1 nuevo commit + push a `main`
- 1 nuevo deploy Apps Script V13 (versión nueva, mismo /exec URL)

### §3.2 OUT of scope

- NO se cambia el Sheet Registros (sigue 143 cols, sin schema change)
- NO se migran datos existentes automáticamente
- NO se modifica el Sheet de matrículas
- NO se modifica ningún otro portal (admin, vigilantes, estado-cuenta, cartera-admin)
- NO se cambia la URL del Web App /exec (sigue `AKfycbxp...Zp`)
- NO se crea un nuevo Apps Script (se usa el mismo `17nuyzVYK2yN...`)
- NO se cambia la lógica de dedupe del Sheet Registros
- NO se agrega captcha ni autenticación de dos factores
- NO se generan QRs automáticamente (queda como herramienta operativa para Fabio, ver §18)

---

## §4. Stack (sin cambios)

- **Frontend:** HTML/CSS/JS vanilla en GitHub Pages
- **Backend:** Google Apps Script Web App (mismo proyecto del formulario
  de residentes — V12 ya desplegado, se actualiza a V13)
- **BD:** Google Sheets (Sheet "Registros" sin cambios estructurales)
- **Drive:** carpeta de backups del proyecto
  (`1RPHtWnVEFwzBKR1DCzBP1to9wLHY2F22`)

Cero costos adicionales, cero servidores propios, cero dependencias nuevas
de runtime.

---

## §5. Decisiones de diseño (confirmadas con el operador)

| ID | Decisión | Confirmado |
|---|---|---|
| D1 | Portal nuevo `residente.html` (separado, como `estado-cuenta.html`) | 25-Sept-2026 |
| D2 | QR genérico por apartamento (NO por residente) | 25-Sept-2026 |
| D3 | El residente se AUTOREGISTRA si el apto está vacío (incluye sección 5 con sus datos personales) | 25-Sept-2026 |
| D4 | Edición del residente: N° apto + CC | 25-Sept-2026 |
| D5 | El QR es la herramienta principal (no el formulario del propietario) | 25-Sept-2026 |
| D6 | Texto del botón: literal "borrado de datos residente" (en minúsculas) | 25-Sept-2026 |
| D7 | Modal: "Esto borrará los residentes y vehículos del apartamento. ¿Confirmas?" (texto exacto) | 25-Sept-2026 |
| D8 | Botón BORRA TODO lo que llena el residente: secciones 5, 5.1, 6, 7, 9, 10 (limpieza total) | 25-Sept-2026 |
| D9 | Solo propietario/inmobiliaria puede borrar (valida CC del propietario v[6]) | 25-Sept-2026 |
| D10 | Residente NO tiene botón borrar, solo editar | 25-Sept-2026 |

---

## §6. Sheet Registros: SIN CAMBIOS

El Sheet sigue con 143 columnas A1:EM1. NO hay schema change en este
spec. Los slots siguen siendo COMPARTIDOS por apto:

```
AD-AW: 4 residentes × 5 cols (nombre, cc, correo, cel, parentesco)
AX-BI: 4 menores × 3 cols (nombre, edad, parentesco)
BJ-BU: 2 vehículos × 6 cols (marca, tipo, color, placa, modelo, tag)
BV-CG: 2 motos × 6 cols
CH-CO: 2 bicis × 4 cols (marca, tipo, color, rodado)
DG-DZ: 2 mascotas × 10 cols
EA-EF: 2 emergencias × 3 cols
```

(Referencia: `apps-script/Código.gs` líneas 280-340 para los loops
de `buildRowFromPayload`.)

**Implicación:** Si un residente A quiere registrar su vehículo y el
residente B ya usó el slot 1, A recibe error "slot ocupado". El
propietario debe reorganizar los slots manualmente desde el portal
admin (NO desde este módulo).

---

## §7. Backend — 5 endpoints nuevos

Todos los endpoints nuevos van al final de `apps-script/Código.gs`
(después de la última función del módulo estado-cuenta V12). Se
agregan entradas en `doGet` y `doPost` para enrutar las nuevas
acciones.

### §7.1 `GET ?action=getEstadoResidente&apto=X`

**Propósito:** Pantalla inicial del portal residente. Devuelve el
estado del apto (existe/no existe, tiene residentes o no).

**Input:** `apto` (string, requerido)

**Output OK (apto existe, vacío):**
```json
{
  "ok": true,
  "apto": "105",
  "aptoExiste": true,
  "numForm": "CA-0001",
  "hayResidentes": false,
  "numResidentes": 0,
  "nombresResidentes": [],
  "propietario": "Juan Pérez"
}
```

**Output OK (apto existe, con residentes):**
```json
{
  "ok": true,
  "apto": "105",
  "aptoExiste": true,
  "numForm": "CA-0001",
  "hayResidentes": true,
  "numResidentes": 2,
  "nombresResidentes": ["Juan Pérez", "María López"],
  "propietario": "Juan Pérez"
}
```

**Output (apto NO existe):**
```json
{
  "ok": true,
  "apto": "999",
  "aptoExiste": false
}
```

**Output error:**
```json
{ "ok": false, "error": "Falta N° de apartamento" }
```

**Lógica:**
```javascript
function getEstadoResidente(apto) {
  apto = String(apto || '').trim();
  if (!apto) return { ok: false, error: 'Falta N° de apartamento' };

  const row = findRowByApto(apto);
  if (!row) return { ok: true, apto, aptoExiste: false };

  const obj = rowToObject(row.values);
  const nombresResidentes = [];
  let hayResidentes = false;

  for (let i = 0; i < 4; i++) {
    const base = 29 + i * 5;
    const nombre = String(row.values[base] || '').trim();
    if (nombre) {
      hayResidentes = true;
      nombresResidentes.push(nombre);
    }
  }

  return {
    ok: true,
    apto,
    aptoExiste: true,
    numForm: String(obj.numForm || ''),
    hayResidentes,
    numResidentes: nombresResidentes.length,
    nombresResidentes,
    propietario: String(obj.nombreProp || '')
  };
}
```

**Funciones reusadas:** `findRowByApto`, `rowToObject`
**LockService:** NO (es solo lectura)
**Privacidad:** NO devuelve CCs ni teléfonos. Solo nombres y nombre del propietario.

---

### §7.2 `GET ?action=verificarResidente&apto=X&cc=Y`

**Propósito:** Validar CC para que un residente pueda editar sus datos.

**Input:** `apto` (string, requerido), `cc` (string, requerido)

**Output OK:**
```json
{
  "ok": true,
  "slot": 2,
  "datos": {
    "nombre": "María López",
    "cc": "7654321",
    "parentesco": "Esposa",
    "cel": "3002223333",
    "correo": "maria@mail.com"
  }
}
```

**Output NO matchea:**
```json
{
  "ok": false,
  "error": "No se encontró un residente con esa cédula en este apartamento."
}
```

**Output error:**
```json
{ "ok": false, "error": "Falta apto o cc" }
```

**Lógica:**
```javascript
function verificarResidente(apto, cc) {
  apto = String(apto || '').trim();
  cc = normCc(cc);  // helper existente (limpia puntos, guiones, espacios)

  if (!apto || !cc) return { ok: false, error: 'Falta apto o cc' };

  const row = findRowByApto(apto);
  if (!row) return { ok: false, error: 'Apartamento no encontrado.' };

  // Buscar CC en slots 1-4 de residentes (v[29+0..4], v[29+5..9], etc.)
  for (let i = 0; i < 4; i++) {
    const base = 29 + i * 5;
    const ccEnSheet = normCc(row.values[base + 1] || '');
    if (ccEnSheet && ccEnSheet === cc) {
      return {
        ok: true,
        slot: i + 1,
        datos: {
          nombre: String(row.values[base] || '').trim(),
          cc: String(row.values[base + 1] || '').trim(),
          parentesco: String(row.values[base + 4] || '').trim(),
          cel: String(row.values[base + 3] || '').trim(),
          correo: String(row.values[base + 2] || '').trim()
        }
      };
    }
  }

  return { ok: false, error: 'No se encontró un residente con esa cédula en este apartamento.' };
}
```

**Funciones reusadas:** `findRowByApto`, `normCc` (helper existente)
**LockService:** NO

---

### §7.3 `POST action=registrarResidente`

**Propósito:** Auto-registro de residente cuando el apto está VACÍO
de residentes (slots AD-AW todos vacíos).

**Input:**
```json
{
  "apto": "105",
  "residentes": [
    { "nombre": "Juan Pérez", "cc": "1234567", "parentesco": "Propietario", "cel": "3001112222", "correo": "juan@mail.com" }
  ],
  "menores": [],
  "vehiculos": [{ "placa": "ABC123", "marca": "Toyota", "tipo": "Corolla", "color": "Blanco", "modelo": "2020", "tag": "" }],
  "motos": [],
  "bicis": [],
  "mascotas": [{ "nombre": "Max", "especie": "Perro", "raza": "Labrador", "edad": "3", "vacuna": "Al día" }],
  "contactos": [{ "nombre": "Ana Pérez", "parentesco": "Hermana", "celular": "3003334444" }]
}
```

**Validaciones:**
- `apto` requerido
- El apto DEBE existir en el Sheet
- TODOS los slots 1-4 de residentes (v[29-48]) deben estar VACÍOS
- Si no → error "El apartamento ya tiene residentes registrados"
- `residentes` debe tener al menos 1 elemento (no se permite registrar un apto sin ningún residente)

**Escritura (reusa `submitRecord` con payload filtrado):**
```javascript
function registrarResidente(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);  // esperar hasta 30 segundos
  try {
    const apto = String(data.apto || '').trim();
    if (!apto) return { ok: false, error: 'Falta N° de apartamento' };

    const row = findRowByApto(apto);
    if (!row) return { ok: false, error: 'Apartamento no encontrado. Pida al propietario que lo registre primero.' };

    // Verificar que TODOS los slots estén vacíos
    for (let i = 0; i < 4; i++) {
      const base = 29 + i * 5;
      if (String(row.values[base] || '').trim()) {
        return { ok: false, error: 'El apartamento ya tiene residentes registrados.' };
      }
    }

    // Construir payload para submitRecord
    const payload = {
      apto,
      // numForm viene del Sheet existente (no se crea nuevo)
      residentes: data.residentes || [],
      menores: data.menores || [],
      vehiculos: data.vehiculos || [],
      motos: data.motos || [],
      bicis: data.bicis || [],
      mascotas: data.mascotas || [],
      contactos: data.contactos || []
    };

    // submitRecord detecta modo edición por la presencia de numForm en la fila
    return submitRecord(payload);
  } finally {
    lock.releaseLock();
  }
}
```

**Output OK:**
```json
{ "ok": true, "numForm": "CA-0001", "slotAsignado": 1 }
```

**Output error:**
```json
{ "ok": false, "error": "..." }
```

**Funciones reusadas:** `findRowByApto`, `submitRecord`, `LockService.getScriptLock`
**LockService:** SÍ (importante para evitar race conditions entre 2 residentes que escanean el QR al tiempo)

---

### §7.4 `POST action=actualizarResidente`

**Propósito:** Editar datos de un residente ya registrado.

**Input:**
```json
{
  "apto": "105",
  "cc": "7654321",
  "slot": 2,
  "datosActualizados": {
    "residentes": [{ "nombre": "María López", "cc": "7654321", "parentesco": "Esposa", "cel": "3002223333", "correo": "maria@mail.com" }],
    "vehiculos": [{ "placa": "DEF456", "marca": "Mazda", "tipo": "3", "color": "Rojo", "modelo": "2022", "tag": "" }],
    "motos": [],
    "bicis": [],
    "mascotas": [],
    "contactos": []
  }
}
```

**Validaciones:**
- `apto`, `cc`, `slot` requeridos
- La CC del residente en v[29+(slot-1)*5+1] debe matchear con la CC del input (re-verificación server-side)
- Para slots COMPARTIDOS (vehículos, motos, bicis, mascotas, contactos):
  - Si el slot destino ya está ocupado por OTRO residente del apto → rechazar
  - Si está vacío → asignar
  - Si está ocupado por el MISMO residente → permitir actualizar

**Lógica (simplificada):**
```javascript
function actualizarResidente(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const apto = String(data.apto || '').trim();
    const cc = normCc(data.cc || '');
    const slot = parseInt(data.slot || '', 10);

    if (!apto || !cc || !slot || slot < 1 || slot > 4) {
      return { ok: false, error: 'Datos inválidos' };
    }

    const row = findRowByApto(apto);
    if (!row) return { ok: false, error: 'Apartamento no encontrado' };

    // Re-verificar identidad
    const baseResidente = 29 + (slot - 1) * 5;
    const ccEnSheet = normCc(row.values[baseResidente + 1] || '');
    if (ccEnSheet !== cc) {
      return { ok: false, error: 'La cédula no corresponde al residente del slot ' + slot };
    }

    // Validar slots compartidos
    const datos = data.datosActualizados || {};
    // ... validaciones de vehículos, mascotas, etc. ...

    // Reusa submitRecord para actualizar la fila
    const payload = {
      apto,
      numForm: String(row.values[0] || ''),
      residentes: [datos.residentes?.[0] || null],
      // ... etc ...
    };

    return submitRecord(payload);
  } finally {
    lock.releaseLock();
  }
}
```

**Output OK:**
```json
{ "ok": true, "slotActualizado": 2 }
```

**Funciones reusadas:** `findRowByApto`, `normCc`, `submitRecord`
**LockService:** SÍ

---

### §7.5 `POST action=clearResidente`

**Propósito:** Borrar TODOS los datos del residente anterior de un
solo golpe. Solo propietario/inmobiliaria puede ejecutarlo.

**Input:**
```json
{
  "numForm": "CA-0001",
  "apto": "105",
  "ccPropConfirm": "1234567"
}
```

**Validaciones:**
- `numForm`, `apto`, `ccPropConfirm` requeridos
- `findRowByNumFormAndApto(numForm, apto)` debe retornar la fila
- `ccPropConfirm` (normalizada) debe coincidir con `v[6]` (CC del propietario)
- Si no coincide → "La cédula no corresponde al propietario del apartamento"

**Escritura:**
- Limpia v[29-92] (residentes + menores + vehículos + motos + bicis)
- Limpia v[110-135] (mascotas + contactos)
- NO toca v[0-28] (numForm, fechas, datos del propietario, parqueaderos)
- NO toca v[93-109] (llaveros/tags, dispositivos)
- NO toca v[136-142] (autorizaciones, firma, hash)

**Lógica:**
```javascript
function clearResidente(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const numForm = String(data.numForm || '').trim();
    const apto = String(data.apto || '').trim();
    const ccPropConfirm = normCc(data.ccPropConfirm || '');

    if (!numForm || !apto || !ccPropConfirm) {
      return { ok: false, error: 'Faltan datos requeridos' };
    }

    const row = findRowByNumFormAndApto(numForm, apto);
    if (!row) return { ok: false, error: 'No se encontró el registro' };

    // Verificar que ccPropConfirm coincide con el CC del propietario (v[6])
    const ccPropSheet = normCc(row.values[6] || '');
    if (ccPropSheet !== ccPropConfirm) {
      return { ok: false, error: 'La cédula no corresponde al propietario del apartamento.' };
    }

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const rowNumber = row.rowNumber;

    // Limpiar v[29-92] (residentes + menores + vehículos + motos + bicis)
    //  Índice 28 a 92 en notación 0-indexed = rango Sheets AD93 a CO93
    sheet.getRange(rowNumber, 30, 1, 64).setValues([['']]);  // 30 = AD col index

    // Limpiar v[110-135] (mascotas + contactos)
    //  Índice 109 a 135 en notación 0-indexed = rango Sheets DG93 a EF93
    sheet.getRange(rowNumber, 110, 1, 26).setValues([['']]);  // 110 = DG col index

    Logger.log(`[clearResidente] numForm=${numForm} apto=${apto} timestamp=${new Date().toISOString()}`);

    return {
      ok: true,
      celdasLimpiadas: 56  // 20 residentes + 12 menores + 12 vehículos + 12 motos + 8 bicis + 20 mascotas + 6 contactos
    };
  } finally {
    lock.releaseLock();
  }
}
```

**Output OK:**
```json
{ "ok": true, "celdasLimpiadas": 56 }
```

**Output error:**
```json
{ "ok": false, "error": "..." }
```

**Funciones reusadas:** `findRowByNumFormAndApto`, `normCc`, `LockService.getScriptLock`, `Logger.log`
**LockService:** SÍ
**Auditoría:** `Logger.log` con numForm + apto + timestamp

---

### §7.6 Entradas en doGet y doPost

**En `doGet` (después de las entradas de vigilancia):**
```javascript
// --- RESIDENTE (portal nuevo residente.html) ---
if (action === 'getEstadoResidente') {
  return jsonOut(getEstadoResidente(e.parameter.apto));
}
if (action === 'verificarResidente') {
  return jsonOut(verificarResidente(e.parameter.apto, e.parameter.cc));
}
```

**En `doPost` (después de las entradas de estado-cuenta):**
```javascript
// --- RESIDENTE ---
if (action === 'registrarResidente')    return jsonOut(registrarResidente(payload));
if (action === 'actualizarResidente')  return jsonOut(actualizarResidente(payload));
if (action === 'clearResidente')        return jsonOut(clearResidente(payload));
```

---

## §8. Frontend — `residente.html` (NUEVO)

Misma estructura base que `estado-cuenta.html`. Logo + título +
`<div class="lookup-box">` central con las vistas según el flujo.

### §8.1 Estructura HTML

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portal del Residente — Cerro Azul</title>
  <link rel="stylesheet" href="assets/styles.css">
  <link rel="stylesheet" href="assets/residente.css"> <!-- estilos propios -->
</head>
<body>
  <header class="site-header">
    <img src="assets/logo.jpg" alt="Logo" class="logo">
    <div>
      <h1>Urbanización Cerro Azul</h1>
      <p class="sub">Portal del Residente</p>
    </div>
  </header>

  <main class="container">
    <!-- Vista inicial: ingreso de apto -->
    <section id="view-inicial" class="lookup-box">
      <h3>👤 Portal del Residente</h3>
      <p>Ingrese el N° de apartamento para continuar.</p>
      <label>N° Apartamento</label>
      <input type="text" id="aptoInput" placeholder="Ej: 105">
      <button id="btnContinuar">🔍 Continuar</button>
      <div id="alert" class="alert"></div>
    </section>

    <!-- Vista 2a: apto vacío → auto-registro -->
    <section id="view-registro" class="lookup-box hidden">
      <h3>📝 Registro de residente — Apto <span id="aptoDisplay"></span></h3>
      <p>Complete las siguientes secciones con sus datos.</p>

      <!-- Aquí va el formulario completo de secciones 5, 5.1, 6, 7, 9, 10 -->
      <!-- (mismo markup que index.html, sin secciones 1-4, 8, 11) -->

      <button id="btnRegistrar">💾 Registrarme como residente</button>
      <div id="alertRegistro" class="alert"></div>
    </section>

    <!-- Vista 2b: apto con datos + CC matchea → editar -->
    <section id="view-editar" class="lookup-box hidden">
      <h3>📋 Mis datos — <span id="nombreDisplay"></span> (Residente <span id="slotDisplay"></span>)</h3>
      <p>Actualice su información. Los cambios se guardan al apartamento <strong id="aptoDisplay2"></strong>.</p>

      <!-- Formulario de edición: solo SU slot de residentes + slots compartidos -->

      <button id="btnGuardar">💾 Guardar mis datos</button>
      <div id="alertEditar" class="alert"></div>
    </section>

    <!-- Vista 2c: CC no matchea -->
    <section id="view-rechazado" class="lookup-box hidden">
      <h3>❌ No se encontró un residente con esa cédula</h3>
      <p>Si es la primera vez que se registra, pida al propietario del apartamento que lo agregue primero.</p>
      <p>Si se mudó recientemente, el propietario debe <strong>borrar al residente anterior</strong> para liberar el slot.</p>
      <button id="btnReintentar">🔄 Intentar de nuevo</button>
    </section>

    <!-- Vista 2d: apto no existe -->
    <section id="view-no-existe" class="lookup-box hidden">
      <h3>❌ El apartamento <span id="aptoDisplay3"></span> no está registrado</h3>
      <p>Para usar este portal, primero el propietario del apartamento debe llenar el formulario de residentes:</p>
      <a href="index.html" class="btn-link">📝 Ir al formulario principal</a>
    </section>

    <!-- Vista 3: éxito -->
    <section id="view-exito" class="lookup-box hidden">
      <h3>✅ Datos guardados correctamente</h3>
      <p>Su información ha sido registrada en el sistema.</p>
      <button id="btnVolver">↩️ Volver al inicio</button>
    </section>
  </main>

  <footer class="site-footer">
    <p>Urbanización Cerro Azul · NIT 900770444 · Bello / Niquía</p>
    <p>Formulario oficial conforme a la Ley 1581 de 2012 y Decreto 768 de 2025</p>
    <p>¿Dudas? <a href="mailto:urb.cerroazul@gmail.com">urb.cerroazul@gmail.com</a></p>
  </footer>

  <script src="js/residente.js"></script>
</body>
</html>
```

### §8.2 Estilos propios (`assets/residente.css`)

```css
/* Portal del residente — estilos específicos */
.lookup-box {
  max-width: 480px;
  margin: 50px auto;
  padding: 30px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}
.lookup-box h3 {
  color: var(--azul);
  margin-bottom: 16px;
  font-size: 1.3em;
}
.lookup-box label {
  display: block;
  margin: 12px 0 4px;
  font-weight: 600;
  color: var(--texto);
}
.lookup-box input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--gris-borde);
  border-radius: 6px;
  font-size: 1em;
}
.lookup-box button {
  margin-top: 16px;
  padding: 12px 24px;
  background: var(--azul);
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
}
.lookup-box button:hover { background: var(--azul-osc); }

.alert {
  margin-top: 12px;
  padding: 10px;
  border-radius: 6px;
  font-size: 0.9em;
  display: none;
}
.alert.show { display: block; }
.alert.error { background: var(--rojo-bg); color: var(--rojo); border-left: 4px solid var(--rojo); }
.alert.success { background: var(--verde-bg); color: var(--verde); border-left: 4px solid var(--verde); }

.hidden { display: none !important; }
```

---

## §9. Frontend — cambios a `index.html`

### §9.1 Zona de borrado en modo edición

**Ubicación:** Después del botón "💾 Guardar cambios", antes del nav-links.

**HTML a agregar:**
```html
<!-- ============================================================ -->
<!-- ZONA DE BORRADO DE DATOS DEL RESIDENTE                        -->
<!-- (solo visible en modo edición)                                -->
<!-- ============================================================ -->
<div id="zona-borrado" class="zona-borrado hidden">
  <h3 style="color:var(--naranja); margin-top:0;">⚠️ Zona de borrado</h3>
  <p>Si hubo cambio de propietario o los residentes anteriores ya no
     viven en este apartamento, use este botón para limpiar las
     secciones de residentes, menores, vehículos, motos, bicicletas,
     mascotas y contactos.</p>
  <p><strong>Las secciones 1-4 (datos del propietario) y 11 (firma)
     NO se borran.</strong></p>
  <button type="button" id="btnClearResidente" class="btn-danger">
    🗑️ Borrado de datos residente
  </button>
</div>

<!-- Modal de confirmación -->
<div id="modalClearResidente" class="modal-overlay hidden">
  <div class="modal-content">
    <h3 style="color:var(--rojo); margin-top:0;">⚠️ Confirmar borrado</h3>
    <p>Esto borrará los residentes y vehículos del apartamento
       <strong id="modalApto"></strong>. ¿Confirmas?</p>
    <p>Se limpiarán las secciones:</p>
    <ul style="margin-left:20px;">
      <li>Sección 5 — Residentes</li>
      <li>Sección 5.1 — Menores</li>
      <li>Sección 6 — Vehículos y motos</li>
      <li>Sección 7 — Bicicletas</li>
      <li>Sección 9 — Mascotas</li>
      <li>Sección 10 — Contactos de emergencia</li>
    </ul>
    <p>Los datos del propietario (secciones 1-4), firma (11) y
       llaveros (8) NO se borran.</p>
    <div style="display:flex; gap:12px; margin-top:20px;">
      <button type="button" id="btnCancelarClear"
              class="btn-secondary">❌ Cancelar</button>
      <button type="button" id="btnConfirmarClear"
              class="btn-danger">🗑️ Sí, borrar</button>
    </div>
  </div>
</div>
```

### §9.2 Visibilidad condicional

El div `#zona-borrado` se muestra SOLO en modo edición (cuando el
usuario hizo lookup con CA-XXXX + apto). Se oculta en modo creación.

---

## §10. JS — `js/residente.js` (NUEVO)

Misma estructura que `js/estado-cuenta.js`:

```javascript
// ============================================================
// ESTADO GLOBAL
// ============================================================
const APP_URL = 'https://script.google.com/macros/s/AKfycbxp...Zp/exec';
const state = {
  apto: null,
  numForm: null,
  cc: null,
  slot: null,
  modo: 'inicial',  // inicial | registro | editar | rechazado | no-existe | exito
};

// ============================================================
// FETCH HELPER
// ============================================================
async function apiGet(params) {
  const url = new URL(APP_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { method: 'GET' });
  return r.json();
}

async function apiPost(payload) {
  const r = await fetch(APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload)
  });
  return r.json();
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================
function showView(name) {
  ['inicial', 'registro', 'editar', 'rechazado', 'no-existe', 'exito']
    .forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('hidden', v !== name);
    });
  state.modo = name;
}

function showAlert(msg, type = 'error') {
  const el = document.getElementById('alert');
  el.textContent = msg;
  el.className = 'alert show ' + type;
  setTimeout(() => el.classList.remove('show'), 5000);
}

// ============================================================
// FLOW: INGRESO CON APTO
// ============================================================
document.getElementById('btnContinuar').addEventListener('click', async () => {
  const apto = document.getElementById('aptoInput').value.trim();
  if (!apto) return showAlert('Por favor ingrese el N° de apartamento', 'error');

  const r = await apiGet({ action: 'getEstadoResidente', apto });

  if (!r.ok) return showAlert(r.error, 'error');
  if (!r.aptoExiste) {
    document.getElementById('aptoDisplay3').textContent = apto;
    return showView('no-existe');
  }

  state.apto = apto;
  state.numForm = r.numForm;

  if (!r.hayResidentes) {
    // APTO VACÍO → flujo de registro
    document.getElementById('aptoDisplay').textContent = apto;
    return showView('registro');
  }

  // APTO CON RESIDENTES → pedir CC
  // Mostrar nombres y formulario para CC
  // (vista intermedia con input CC)
  // ...
});

// ============================================================
// FLOW: REGISTRO (apto vacío)
// ============================================================
document.getElementById('btnRegistrar').addEventListener('click', async () => {
  const payload = {
    action: 'registrarResidente',
    apto: state.apto,
    residentes: recolectarResidentes(),
    menores: recolectarMenores(),
    vehiculos: recolectarVehiculos(),
    motos: recolectarMotos(),
    bicis: recolectarBicis(),
    mascotas: recolectarMascotas(),
    contactos: recolectarContactos()
  };

  const r = await apiPost(payload);
  if (!r.ok) return showAlert(r.error, 'error');

  showView('exito');
});

// ============================================================
// FLOW: EDICIÓN (con CC)
// ============================================================
document.getElementById('btnGuardar').addEventListener('click', async () => {
  const payload = {
    action: 'actualizarResidente',
    apto: state.apto,
    cc: state.cc,
    slot: state.slot,
    datosActualizados: { /* ... */ }
  };
  const r = await apiPost(payload);
  if (!r.ok) return showAlert(r.error, 'error');
  showView('exito');
});

// Funciones recolectar<Seccion>() — extraen datos de los inputs del DOM
// Similar a las del js/app.js pero adaptadas al subconjunto de campos
```

**Notas:**
- Total estimado: ~500 líneas de JS
- Reusa el patrón `fetch` con `text/plain;charset=UTF-8` (workaround CORS)
- Validaciones cliente (campos requeridos, formatos)

---

## §11. JS — cambios a `js/app.js`

### §11.1 Función clearResidenteForm

```javascript
// ============================================================
// LIMPIAR DATOS DEL RESIDENTE (modo edición)
// ============================================================
async function clearResidenteForm() {
  const numForm = state.numForm;
  const apto = val('#apto').trim();

  // El CC del propietario se obtiene del formulario (ya validado en modo edición)
  const ccPropConfirm = val('#ccProp').trim();

  if (!numForm || !apto || !ccPropConfirm) {
    return alert('Faltan datos para borrar.');
  }

  const payload = {
    action: 'clearResidente',
    numForm,
    apto,
    ccPropConfirm
  };

  const btn = $('#btnConfirmarClear');
  btn.disabled = true;
  btn.textContent = 'Borrando...';

  try {
    const r = await fetch(APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });
    const j = await r.json();

    if (!j.ok) {
      alert('Error: ' + j.error);
      btn.disabled = false;
      btn.textContent = '🗑️ Sí, borrar';
      return;
    }

    // Éxito: cerrar modal + recargar formulario
    $('#modalClearResidente').classList.add('hidden');
    alert(`✅ Se borraron ${j.celdasLimpiadas} celdas. El registro del propietario se mantiene intacto.`);
    // Recargar la fila para reflejar el cambio
    poblarFormulario(state.editLookup);
    btn.disabled = false;
    btn.textContent = '🗑️ Sí, borrar';
  } catch (e) {
    alert('Error de red: ' + e.message);
    btn.disabled = false;
    btn.textContent = '🗑️ Sí, borrar';
  }
}

// ============================================================
// HANDLERS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  $('#btnClearResidente')?.addEventListener('click', () => {
    // Mostrar modal con N° de apto
    $('#modalApto').textContent = val('#apto').trim();
    $('#modalClearResidente').classList.remove('hidden');
  });

  $('#btnCancelarClear')?.addEventListener('click', () => {
    $('#modalClearResidente').classList.add('hidden');
  });

  $('#btnConfirmarClear')?.addEventListener('click', clearResidenteForm);
});
```

### §11.2 Mostrar zona de borrado solo en modo edición

Modificar `buscarRegistro()` (exitoso) para mostrar `#zona-borrado`:

```javascript
// Dentro de buscarRegistro(), después del fetch exitoso:
$('#zona-borrado')?.classList.remove('hidden');
```

Y en `resetForm()` o `setMode('create')`:

```javascript
$('#zona-borrado')?.classList.add('hidden');
```

---

## §12. CSS — `assets/styles.css`

Agregar al final del archivo:

```css
/* ============================================================ */
/* BOTÓN DE BORRADO DE DATOS DEL RESIDENTE                      */
/* ============================================================ */
.zona-borrado {
  margin-top: 24px;
  padding: 20px;
  background: #FFF3CD;
  border-left: 4px solid #856404;
  border-radius: 6px;
}

.zona-borrado h3 {
  color: #856404;
  margin: 0 0 12px;
  font-size: 1.1em;
}

.zona-borrado p {
  margin: 8px 0;
  color: #856404;
}

.btn-danger {
  background: #DC3545;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  font-size: 1em;
  transition: background 0.2s;
}

.btn-danger:hover {
  background: #C82333;
}

.btn-danger:disabled {
  background: #999;
  cursor: not-allowed;
}

.btn-secondary {
  background: #6C757D;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  flex: 1;
}

/* ============================================================ */
/* MODAL DE CONFIRMACIÓN                                        */
/* ============================================================ */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-overlay.hidden {
  display: none !important;
}

.modal-content {
  background: white;
  padding: 28px;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}

.modal-content h3 {
  margin: 0 0 16px;
  font-size: 1.2em;
}

.modal-content p {
  margin: 12px 0;
  line-height: 1.5;
}

.modal-content ul {
  margin: 8px 0;
}

.modal-content > div {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.modal-content > div > button {
  flex: 1;
}
```

---

## §13. Manual HTML — 2 secciones nuevas

### §13.1 Nueva sección "Portal del Residente"

Ubicación: Después de la sección estado-cuenta, antes del footer.

Estructura similar a las secciones existentes (section-manual +
section-header con emoji 👤 + section-body). Contenido:

- Introducción: qué es y para qué sirve
- 3 pasos: escanear QR, colocar apto, llenar/editar datos
- Aviso: si el apto ya tiene residentes, contacte al propietario
- 4 FAQs específicas

### §13.2 Nueva subsección en Editar: "Borrar residente anterior"

Ubicación: en la sección Editar, después del bloque "¿Perdiste tu código CA-XXXX?", antes del nav-links.

Contenido breve:
- Cuándo usar el botón "Borrado de datos residente"
- Qué secciones se borran
- Qué secciones NO se borran
- Aviso: no se puede deshacer

---

## §14. Plan de implementación por fases

| Fase | Descripción | Tiempo | OK previo |
|---|---|---|---|
| **F0** | Backup pre-flight | 5 min | — |
| **F1** | Spec + wireframes | 10 min | OK del operador |
| **F2** | Backend Codigo.gs (5 endpoints) | 30 min | OK del operador |
| **F3** | Frontend index.html + app.js (botón borrar) | 20 min | F2 verificado |
| **F4** | Frontend residente.html + residente.js | 40 min | F2 verificado |
| **F5** | Deploy Apps Script V13 | 15 min | OK del operador |
| **F6** | Manual HTML | 15 min | F3 + F4 verificados |
| **F7** | Docs finales + push + verificación | 10 min | F5 + F6 verificados |
| **F8** | QR generation script (opcional) | 10 min | F7 OK |

**Total estimado: ~2.5 horas, en 2-3 sesiones.**

---

## §15. Riesgos y mitigaciones

| ID | Riesgo | Probabilidad | Mitigación |
|---|---|---|---|
| R1 | Concurrencia al auto-registrarse (2 residentes escanean QR al tiempo) | Media | LockService en `registrarResidente` + verificación server-side de slots vacíos + mensaje claro al perdedor |
| R2 | CC mal escrita por propietario | Baja | Normalización con `normCc()` + admin puede corregir desde `admin.html` |
| R3 | Botón borrar accidental | Media | Modal con texto EXACTO + lista de secciones + botones rojo/verde diferenciados |
| R4 | Slot compartido llenado por otro residente | Baja | Backend rechaza + frontend muestra "Slot ocupado por otro miembro" |
| R5 | Residente NO del apto intenta editar | Baja | Verificación server-side de CC matchea con slot del apto |
| R6 | Datos borrados accidentalmente, sin undo | Media | `Logger.log` con timestamp + numForm + slot. En el futuro: pestaña "Borrados" para soft-delete |
| R7 | Residente anterior "fantasma" si propietario NO borra | Baja | UI muestra claramente al residente si ya está registrado el apartamento |
| R8 | Compatibilidad con datos existentes | Nula | 8 registros actuales NO se tocan automáticamente |
| R9 | LockService: `getDocumentLock` vs `getScriptLock` | Ya conocida | Usar `getScriptLock()` (pitfall verificado en módulo mudanzas) |

---

## §16. Tests E2E

Agregar a `docs/TESTING-PROTOCOL.md`:

| Test | Descripción | Resultado esperado |
|---|---|---|
| T1 | `getEstadoResidente` con apto existente y vacío | `{ok:true, hayResidentes:false, numResidentes:0}` |
| T2 | `getEstadoResidente` con apto existente CON residentes | `{ok:true, hayResidentes:true, numResidentes:2, nombresResidentes:[...]}` |
| T3 | `getEstadoResidente` con apto NO existente | `{ok:true, aptoExiste:false}` |
| T4 | `verificarResidente` con CC que matchea | `{ok:true, slot:2, datos:{nombre,cc,parentesco,cel,correo}}` |
| T5 | `verificarResidente` con CC que NO matchea | `{ok:false, error:'No se encontró un residente...'}` |
| T6 | `registrarResidente` con apto vacío (caso feliz) | `{ok:true, numForm:'CA-XXXX', slotAsignado:1}` |
| T7 | `registrarResidente` cuando los slots ya están ocupados | `{ok:false, error:'El apartamento ya tiene residentes...'}` |
| T8 | `actualizarResidente` con CC válida + slot correcto | `{ok:true, slotActualizado:2}` |
| T9 | `actualizarResidente` con CC inválida (rechazo) | `{ok:false, error:'La cédula no corresponde...'}` |
| T10 | `clearResidente` con CC del propietario correcta | `{ok:true, celdasLimpiadas:56}` |
| T11 | `clearResidente` con CC del propietario incorrecta | `{ok:false, error:'La cédula no corresponde al propietario...'}` |
| T12 | LockService: 2 residentes intentan registrar al mismo tiempo | UNO gana, otro recibe `{ok:false, error:'El apartamento ya tiene residentes...'}` |

---

## §17. Procedimiento de rollback

### §17.1 Si Apps Script V13 causa problemas

1. Apps Script editor → Deployments → pencil → "Revert to V12"
   → URL /exec sigue siendo la misma, solo vuelve al código V12

### §17.2 Si los archivos HTML/JS en GitHub Pages causan problemas

```bash
git revert <commit_hash>
git push origin main
# GitHub Pages rebuild → vuelve al estado anterior
```

### §17.3 Si clearResidente se ejecutó y dañó datos

- Restaurar desde el backup pre-flight (F0)
- O restaurar manualmente las celdas desde Apps Script Executions
  (Logger.log tiene el timestamp + numForm + slot)

---

## §18. Compatibilidad con datos existentes

Los 8 registros actuales del Sheet (CA-0001, CA-0055, CA-0062, CA-0070,
CA-0083 + 3 más) NO se tocan automáticamente. Solo se limpian cuando el
propietario presiona explícitamente el botón "Borrado de datos residente".

Para que un residente pueda usar el portal desde el QR, el propietario
del apto DEBE:
1. Haber registrado el apto en el formulario principal
2. Haber agregado al residente en la sección 5 (mínimo nombre y CC)

Si el propietario NO quiere agregar al residente en sección 5, el
residente NO puede usar el portal (la CC no matchea con ningún slot
y la fila NO está "vacía" para auto-registro).

**Implicación:** El operador Fabio debe coordinar con los
propietarios para que llenen la sección 5 antes de distribuir los
QRs.

---

## §19. Cronograma

| Sesión | Fases | Tiempo | Acumulado |
|---|---|---|---|
| Sesión 1 | F0 + F1 (esta sesión) | 15 min | 15 min |
| Sesión 2 | F2 (backend) + F5 (deploy V13) | 45 min | 1 h |
| Sesión 3 | F3 (botón borrar) + F4 (portal residente) | 60 min | 2 h |
| Sesión 4 | F6 (manual) + F7 (docs) + F8 (QR script) | 35 min | 2.5 h |

---

## §20. Recursos (verificados)

- **Repo:** `https://github.com/Fabig76/cerro-azul-residentes`
- **Frontend live:** `https://fabig76.github.io/cerro-azul-residentes/`
- **Backend /exec URL:** `https://script.google.com/macros/s/AKfycbxp...Zp/exec` (preservada en V13)
- **Apps Script ID:** `17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy`
- **Sheet Registros:** `16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc` (143 cols)
- **Sheet Matrículas:** `1ceGtZDUJHX4yxs5_ydDwLwtrkOcZwYh09WUG0st_b0Y`
- **Carpeta backup proyecto:** `1RPHtWnVEFwzBKR1DCzBP1to9wLHY2F22`
- **Carpeta backup F0 (pre-residente-V0):** `1k0PlMw7CGVHb3dg5H9bNQ-HOajY7vy40` (creada 25-Sept-2026 19:01:02, 27 archivos OK)

---

## §21. Pendiente de aprobación

- [ ] Operador (Fabio) aprueba el spec completo
- [ ] Operador aprueba el wireframe de `residente.html` (F1)
- [ ] Operador aprueba el wireframe del botón "Borrado de datos residente" (F1)

Una vez aprobado, se arranca F2 (backend) en la próxima sesión.