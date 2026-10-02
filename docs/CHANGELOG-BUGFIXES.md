# Changelog de Bugfixes — Cerro Azul Residentes

> **Propósito:** Este archivo documenta todos los bugs críticos que se han
> detectado y corregido en producción, junto con las lecciones aprendidas
> para evitar que se repitan.
>
> **Audiencia:** Desarrolladores, operadores y mantenedores del sistema.
>
> **Regla de oro:** Si encuentras un bug que rompa el flujo principal
> del usuario (crear/editar registro, agendar mudanza), agrégalo a este
> archivo ANTES de hacer commit del fix.

---

## Bugs Críticos Documentados

### BUGFIX-001 · lookup retornaba row vacío (commit `fedf2aa`, deploy V6)

**Fecha:** 23-Sept-2026
**Severidad:** ALTA — bloqueaba la pestaña "Editar mi registro" para TODOS los residentes
**Bug latente desde:** 5-Sept-2026 (commit `eecbf63`)
**Detectado por:** Operador (Fabio Lesmes) al intentar editar CA-0083

**Síntoma reportado por el usuario:**
> "Acabo de verificar y la pestaña modificar registro cuando le ingreso el código y el numero de apto de prueba no me muestra nada"

**Causa raíz:**
En `Código.gs` línea 56 (función `doGet` → `action === 'lookup'`):
```javascript
return jsonOut({ ok: true, row: rowToObject(row) });
//                                ↑ INCORRECTO: pasa objeto {rowNumber, values: [...]}
```

`rowToObject()` espera un array (hace `rowArr[COL_NUM_FORM]`), pero
recibía un objeto. JS interpretaba `obj[0]` como `undefined` y
`String(undefined || '')` = `''`. Resultado: row con todos los campos
vacíos (`{numForm: "", nombreProp: "", ...}`).

**Endpoint afectado:**
```
GET ?action=lookup&numForm=CA-XXXX&apto=YYYY
```

**Por qué NO se detectó durante 18 días:**
- En F7 (testing E2E) probé `nextId`, `lookupMatApto`, `lookupMatParq`,
  `verificarPropietario`, `dispMudanzas` — pero NO `?action=lookup`.
- La pestaña "Editar mi registro" nunca se probó con datos reales en
  producción entre el 5-Sept y el 23-Sept.
- El operador confió en el testing de F7 y nunca hizo la prueba E2E
  manual completa de "editar un registro existente".

**Fix:**
```javascript
return jsonOut({ ok: true, row: rowToObject(row.values) });
//                                ↑ CORRECTO: array de la fila
```

Una sola línea modificada. Deploy V6 de Apps Script.

**Archivos afectados:**
- `apps-script/Código.gs` (1 línea)

**Lección aprendida #1:** Cuando agregues un nuevo endpoint a Apps Script,
prueba TODOS los endpoints existentes que usan las mismas funciones
helper. `findRowByNumFormAndApto()` lo usaban `lookup` y `verificarPropietario`,
pero solo este último se probó.

**Lección aprendida #2:** Un endpoint que retorna `ok:true` con datos
vacíos es PEOR que un endpoint que retorna `ok:false`. El frontend
lo trata como éxito y no muestra error. Siempre retornar `ok:false`
cuando no hay datos.

---

### BUGFIX-002 · view-create oculto al editar registro (commit `ca94dae`)

**Fecha:** 23-Sept-2026
**Severidad:** ALTA — usuario veía `<main>` vacío al editar
**Bug latente desde:** 5-Sept-2026 (commit `eecbf63`, mismo commit que BUGFIX-001)
**Detectado por:** Operador (Fabio Lesmes) tras el deploy V6 (que arregló BUGFIX-001)
**Relacionado con:** BUGFIX-001 (la causa raíz del síntoma visible)

**Síntoma reportado por el usuario:**
> "no se ven los datos en editar"

**Causa raíz:**
En `js/app.js`, función `buscarRegistro()`:
```javascript
$('#view-edit').classList.add('hidden');
$('#form-card').classList.remove('hidden');
// FALTA: $('#view-create').classList.remove('hidden');
```

Estructura HTML:
```html
<main>
  <div id="view-create">       ← este contenedor se quedaba con class="hidden"
    <div class="card" id="form-card">   ← solo este se mostraba
      ...
```

Cuando `setMode('edit')` se ejecuta al cambiar a la pestaña "Editar",
agrega clase `hidden` a `#view-create`. Luego `buscarRegistro()` solo
manipula `#view-edit` y `#form-card`, pero el padre `#view-create`
sigue con `display:none`. Resultado: form-card se hace visible
internamente pero el padre lo oculta.

**Por qué NO se detectó durante 18 días:**
- Mismo motivo que BUGFIX-001: la pestaña "Editar mi registro" nunca
  se probó end-to-end con datos reales.

**Fix:**
```javascript
$('#view-edit').classList.add('hidden');
$('#view-create').classList.remove('hidden');  // FIX 23-Sept
$('#form-card').classList.remove('hidden');
```

Tres líneas. Push a GitHub Pages (no requiere deploy de Apps Script).

**Archivos afectados:**
- `js/app.js` (1 línea agregada)

**Lección aprendida #3:** Al manipular visibilidad de elementos,
siempre manipular TODOS los contenedores padres relevantes. El estado
"oculto" (`display:none`) se hereda de padres a hijos.

**Lección aprendida #4:** Cuando arregles un bug, prueba el flujo
completo de usuario (click → esperar → ver resultado). No solo
verificar que el endpoint backend funciona.

---

## Bugs Menores Documentados

### BUGFIX-003 · LockService.getDocumentLock() retorna null (commit `5ad6fbf`)

**Fecha:** 23-Sept-2026 (durante desarrollo del módulo mudanzas)
**Severidad:** ALTA — bloqueaba `reservarMudanza()` y `cancelarMudanza()`
**Detectado por:** Testing E2E del módulo de mudanzas
**Ver detalles:** `docs/spec-mudanzas.md` §8.10

### BUGFIX-004 · Sheets auto-convierte "08:00" a Date (commit `e525b21`)

**Fecha:** 23-Sept-2026 (durante desarrollo del módulo mudanzas)
**Severidad:** MEDIA — `dispMudanzas` no detectaba reservas ya hechas
**Detectado por:** Testing E2E del módulo de mudanzas
**Ver detalles:** `docs/spec-mudanzas.md` §8.11

---

## Protocolo de Testing (para evitar bugs como BUGFIX-001/002)

### ANTES de hacer deploy de Apps Script

Probar TODOS los endpoints, no solo los nuevos:
```
1. nextId                 → sanity check (que no se rompió)
2. lookup con datos reales → EXISTENTES, no solo el nuevo
3. lookupMatApto           → matrícula del apto
4. lookupMatParq           → matrícula del parqueadero
5. verificarPropietario    → si existe
6. dispMudanzas            → si existe
7. reservarMudanza         → crear una fila real
8. cancelarMudanza         → cancelar la fila anterior
```

### ANTES de hacer push de frontend

Probar el flujo COMPLETO de cada pestaña con datos reales:
```
1. Click en pestaña → ¿se muestra la vista correcta?
2. Llenar campos reales → ¿se aceptan?
3. Click en acción → ¿se ejecuta?
4. Esperar respuesta → ¿se actualiza la vista correctamente?
5. Inspeccionar el DOM → ¿hay contenedores padres con display:none?
```

### Test específico para "Editar mi registro"

```
1. Tab Crear → crear un registro de prueba → obtener CA-XXXX
2. Tab Editar → escribir CA-XXXX + apto
3. Click Buscar mi registro
4. VERIFICAR:
   · view-create no tiene class="hidden"
   · view-edit sí tiene class="hidden"
   · form-card no tiene class="hidden"
   · #nombreProp.value === nombre del propietario
   · #ccProp.value === cédula del propietario
   · #apto.value === apartamento
   · El radio "Propietario" está checked
```

Si algún check falla, NO hacer push. Volver a probar.

---

## Herramientas de Diagnóstico

### Verificar manualmente el endpoint lookup en producción

```bash
curl 'https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec?action=lookup&numForm=CA-0083&apto=9999'
```

Debe retornar `{ok:true, row:{numForm:"CA-0083", nombreProp:"Fabio Lesmes", ...}}`
NO debe retornar `{ok:true, row:{numForm:"", ...}}` (eso sería BUGFIX-001 regresivo).

### Verificar manualmente la visibilidad de view-create

En la consola del navegador (F12):
```javascript
const vc = document.getElementById('view-create');
console.log({
  hidden: vc.classList.contains('hidden'),
  display: window.getComputedStyle(vc).display,
  childCount: vc.children.length
});
```

Si `display: 'none'` después de poblar el formulario, es BUGFIX-002 regresivo.

---

## Cambios de seguridad (no son bugs, son decisiones de privacidad)

### SEG-001 · Vigilante no debe ver CC del propietario ni CA-XXXX (commit `9397230` + `58c0985`)

**Fecha:** 25-Sept-2026
**Detectado por:** Operador (Fabio Lesmes) revisando el portal de vigilantes
**Severidad:** ALTA (riesgo de suplantación de identidad del propietario)

**Síntoma reportado:**
> "cuando consultan un apto sale la cedula del propietario, y eso no esta
> bien... con estos datos el vigilante puede hacer que un arrendatario
> modifique los datos o cree una mudanza"

**Causa raíz:**
`vigilanteVerResidentes` (backend) devolvía `ccProp` (cédula del propietario,
col G), `numForm` (CA-XXXX) y `firmaCC`, y `js/vigilantes.js` los mostraba
en 3+4 lugares (tabla de resultados, detalle, búsqueda por placa, mudanzas).

**Por qué era un riesgo:**
"Editar mi registro" y "Agendar mudanza" autentican con CA-XXXX + apto +
cédula del propietario. El vigilante veía apto + CA-XXXX + CC, es decir,
todas las credenciales necesarias para suplantar al propietario.

**Fix (solo frontend, sin redeploy):**
Quitada la visualización en `js/vigilantes.js`:
  · cédula del propietario (ccProp) en tabla, detalle y búsqueda por placa
  · CA-XXXX (numForm) en tabla, detalle y mudanzas
  · Fila Sheet (rowNumber) en el detalle

**Importante:** el backend SIGUE devolviendo `ccProp` y `numForm` en el
JSON (el filtrado es visual). Para que ni viajen por la red, hay que
ajustar `vigilanteVerResidentes` en `Codigo.gs` y redeployar (pendiente).

**Archivos afectados:**
  · `js/vigilantes.js` (solo frontend)
  · `docs/spec-vigilantes.md` §2 (datos SÍ/NO ve, actualizado)
  · `GUIA-PROYECTO.md` §18.5 (actualizado)

**Lección aprendida:** al diseñar un portal de consulta, verificar que
los datos visibles no incluyan credenciales de otros módulos (el CA-XXXX
es una llave de edición, no un simple identificador para mostrar).

---

## Convención para nuevos bugfixes

Cuando corrijas un bug, agrega una entrada aquí con este formato:

```
### BUGFIX-NNN · título corto (commit XXXXXX)

**Fecha:** DD-MMM-YYYY
**Severidad:** ALTA/MEDIA/BAJA
**Bug latente desde:** DD-MMM-YYYY o "nuevo"
**Detectado por:** nombre/forma

**Síntoma reportado por el usuario:**
> "..."

**Causa raíz:** ...

**Por qué NO se detectó antes:** ...

**Fix:** ...

**Archivos afectados:** ...

**Lección aprendida #N:** ...
```

Usa el protocolo de testing antes de declarar el fix completo.

---

## BUGFIX-007 · apiGet/apiPost faltantes en admin.js y vigilantes.js

**Fecha:** 25-Sept-2026
**Severidad:** ALTA — bloqueaba completamente la pestaña "Salón Social" en admin y vigilantes
**Bug latente desde:** 25-Sept-2026 (nuevo bug introducido en F5)
**Detectado por:** Operador (Fabio Lesmes) usando el portal admin

**Síntoma reportado por el usuario:**
> "en el portal administrativo en el salon social se ve todo ok pero
> tambien sale este mensaje Error de red: A.apiGet is not a function"

**Causa raíz:**
En `js/admin.js`, mi código nuevo (F5 módulo salón social) llamaba a
`A.apiGet({...})` y `A.apiPost({...})`, pero esos helpers NO existían
en el objeto A. El código existente usaba `fetch(APPS_SCRIPT_URL + '?action=adminBuscar&...')`
inline en todos sus métodos. Similar en vigilantes.js con `V.apiGet()`.

```javascript
// Código nuevo (F5) — FALLABA:
const r = await A.apiGet({ action: 'adminListarReservasSalon', estado: estado });
// Error: TypeError: A.apiGet is not a function
```

```javascript
// Código existente — patrón inline:
const r = await fetch(APPS_SCRIPT_URL + '?action=adminBuscar&q=' + encodeURIComponent(q)).then(x=>x.json());
```

**Por qué NO se detectó antes:**
- Durante F5 no se ejecutaron pruebas E2E reales en el navegador
- Las pruebas que corrí con curl bypass el JS del navegador
- El `node --check` solo valida sintaxis, no funciones faltantes
- Solo se notó cuando el operador hizo click en la pestaña salón social

**Fix:**
Agregar `apiGet()` y `apiPost()` como helpers en `admin.js` y `vigilantes.js`:

```javascript
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
}
```

**Archivos afectados:**
- `js/admin.js` (MOD, +18 líneas: A.apiGet + A.apiPost)
- `js/vigilantes.js` (MOD, +10 líneas: V.apiGet)

**Lección aprendida #7:**
**SIEMPRE probar las features en el navegador real ANTES de declararlas
"listas"** — las pruebas con curl solo validan el backend, no el frontend.
Cuando agregues helpers nuevos a un archivo JS existente, verifica que
existen antes de usarlos (grep en el archivo o `typeof helper === 'function'`).
Para futuras integraciones con portales existentes, PRIMERO auditar el
código actual (qué funciones ya están definidas, qué patrones usa)
y solo ENTONCES crear el código nuevo siguiendo ese mismo patrón.

---

## BUGFIX-008 · switchTab() no togglea tab-salon (siempre oculto)

**Fecha:** 25-Sept-2026
**Severidad:** ALTA — bloqueaba completamente la pestaña "Salón Social" en vigilantes
**Bug latente desde:** 25-Sept-2026 (nuevo bug introducido en F5)
**Detectado por:** Operador (Fabio Lesmes) en el portal vigilantes

**Síntoma reportado por el usuario:**
> "en el portal de vigilante en la pesta salon social no se muestra nada"

**Causa raíz:**
En `js/vigilantes.js`, el método `switchTab()` toggleaba EXPLÍCITAMENTE
solo los 3 tabs originales:

```javascript
// ANTES (bug):
switchTab(tab) {
  // ...
  document.getElementById('tab-residentes').classList.toggle('hidden', tab !== 'residentes');
  document.getElementById('tab-placas').classList.toggle('hidden', tab !== 'placas');
  document.getElementById('tab-mudanzas').classList.toggle('hidden', tab !== 'mudanzas');
  // FALTA: tab-salon
}
```

Resultado: cuando el operador hacía click en "🏛️ Salón Social":
- ✅ El botón del tab cambiaba a `active` (correcto)
- ✅ Los otros 3 tabs se ocultaban (correcto)
- ❌ **`tab-salon` se quedaba con `class="hidden"` que yo le puse en el HTML**

El contenedor nunca se mostraba, por eso "no se veía nada".

**Por qué NO se detectó antes:**
- Igual que BUGFIX-007: las pruebas no se ejecutaron en el navegador real
- El bug era "silencioso" — no había error en consola, solo que el div
  permanecía con `display: none`

**Fix:**
Cambiar el `switchTab()` a un patrón genérico que toggle TODOS los elementos
con id que empiezan con `tab-`:

```javascript
// AHORA (fix) — patrón genérico:
switchTab(tab) {
  V.state.activeTab = tab;
  document.querySelectorAll('.vig-tab[data-tab]').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  // Toggle genérico de TODOS los tabs (sirve para futuros tabs)
  document.querySelectorAll('[id^="tab-"]').forEach(t => {
    t.classList.toggle('hidden', t.id !== 'tab-' + tab);
  });
  V.hideAlert();
  if (tab === 'mudanzas') V.cargarMudanzasHoy();
}
```

**Archivos afectados:**
- `js/vigilantes.js` (MOD, +4 líneas, -3 líneas)

**Lección aprendida #8:**
**NO usar listas explícitas de IDs en código de navegación/UI.**
Usar selectores genéricos como `[id^="tab-"]` o querySelectorAll con clases
compartidas. Si agregas un nuevo tab a un sistema existente, el código debe
funcionar automáticamente sin tocar la lógica de switch.
Para futuras integraciones con portales existentes, AUDITAR primero el
switchTab / showView / navegación existente antes de agregar vistas nuevas
— verificar si ya hay un patrón escalable o si hay que migrarlo.

---

## BUGFIX-009 · 6 endpoints ec* sin routing en doPost (caen a submitRecord)

**Fecha:** 26-Sept-2026
**Severidad:** ALTA — bloqueaba completamente el portal de estado de cuenta
 (`estado-cuenta.html`) y `cartera-admin.html` para el administrador
**Bug latente desde:** 25-Sept-2026 (deploy V12, día del despliegue del módulo)
**Detectado por:** Operador (Fabio Lesmes) cuando un propietario del apto 504
 intentó consultar su estado de cuenta

**Síntoma reportado por el usuario:**
> "un propietario del apto 504 intentó ingresar y salió este mensaje
> Diligencia como debe ser Propietario, Arrendatario o Tenedor / Otro."

**Causa raíz:**
En `apps-script/Código.gs`, la función `doPost(e)` (líneas 144-185) tiene
routing por `action` para los módulos residentes, mudanzas, admin, vigilancia
y salón social. Pero **NO tiene routing para los 6 endpoints del módulo
de estado de cuenta** (`ecConsultar`, `ecDescargarFactura`, `ecPazYSalvo`,
`ecIniciarCarga`, `ecSubirFacturas`, `ecFinalizarCarga`).

Cuando el frontend `estado-cuenta.js` (o `cartera-admin.js` para admin) hace
un POST con `action: 'ecConsultar'` y `{numForm, apto, ccProp}`, el código
cae al default `submitRecord(payload)`, que valida `diligencia` y como ese
campo NO viene en el payload, retorna:

```json
{"ok": false, "error": "Diligencia como debe ser Propietario, Arrendatario o Tenedor / Otro."}
```

El frontend muestra ese mensaje literal (no de submitRecord) porque el JSON
llega correctamente pero el `ok:false` se interpreta como error.

**Por qué NO se detectó durante 30 horas:**

1. **El módulo `modulo-estado-cuenta.gs` SÍ estaba pegado** en Apps Script
   editor (las funciones `ec*` existen — verificado con `ecConsultar`
   línea 248 del modulo).
2. **Las pruebas E2E del V17 (25-Sept 19:35)** se concentraron en el salón
   social (`adminListarReservasSalon`, `dispSalon`, `verificarAccesoSalon`)
   y regresiones V13 (`lookup`, `adminLogin`, `vigilanteLogin`).
3. **Ningún test E2E invocó los 6 endpoints ec***. La sesión del 25-Sept
   declaró "V12 OK, sin regresiones, 22 endpoints, 18 ec*" **sin probar
   ninguno de los ec***.
4. **El operador probó el portal** pero probablemente hizo click en
   "Consultar" sin completar el flujo (los 3 campos) o probó otra cosa.
5. **El reporte del propietario 504** del 26-Sept fue el primer uso real
   completo del endpoint `ecConsultar` con credenciales válidas.

**Fix (específico de este bug):**
Agregar 6 líneas en `doPost` **inmediatamente después** de
`const action = String(payload.action || '').trim();` (Codigo.gs línea 153):

```javascript
// --- ESTADO DE CUENTA (spec-estado-cuenta.md §6.2) ---
if (action === 'ecConsultar')        return jsonOut(ecConsultar(payload));
if (action === 'ecDescargarFactura') return jsonOut(ecDescargarFactura(payload));
if (action === 'ecPazYSalvo')        return jsonOut(ecPazYSalvo(payload));
if (action === 'ecIniciarCarga')     return jsonOut(ecIniciarCarga(payload));
if (action === 'ecSubirFacturas')    return jsonOut(ecSubirFacturas(payload));
if (action === 'ecFinalizarCarga')   return jsonOut(ecFinalizarCarga(payload));
```

El módulo `modulo-estado-cuenta.gs` (21.082 bytes, md5 `c2634d884e5862aa5cc36fff06713526`)
ya está pegado en Apps Script editor (verificado durante el deploy V12).
Solo faltaban estas 6 líneas de enrutamiento.

**Por qué importa el orden:** las 6 líneas deben ir ANTES del routing
existente (antes de `reservarMudanza`). Si van al final (después del
comportamiento por defecto), nunca se ejecutan porque `submitRecord`
siempre corre primero. Esto es exactamente lo que advierte la spec
`docs/spec-estado-cuenta.md` §6.2:

> "⚠️ **Por qué importa el nombre exacto:** en `doPost`, cualquier
> `action` no reconocida cae en `submitRecord(payload)` (compatibilidad).
> Un nombre mal escrito NO devuelve 'Acción no reconocida', sino que
> intenta crear un registro."

**Archivos afectados:**
- `apps-script/Código.gs` (MOD, +7 líneas: comentario + 6 if)

**Despliegue:** V18 (operador debe hacer deploy manual después de descargar
el archivo V18 de Drive — `Codigo_V18_EC_ROUTING_DO_POST_FIX-20260926.gs`,
ID `1Qu4IQbUHY8lM6WDdRQSoIuQ_6eZAmDaw`, MD5 `691a6f3adc3224fc38170fcc72200e71`).

**Lección aprendida #9:**
**Nunca declarar "OK sin regresiones" o "TODO funcional" sin haber
probado cada endpoint público con credenciales reales desde un navegador
real (browser_console.expression con fetch), no solo con curl.**
Apps Script Web App **bloquea requests sin User-Agent de navegador**
(responde HTTP 403 con HTML "Datei kann derzeit nicht geöffnet werden"
en alemán) — esto hace que las pruebas con curl/fetch desde el sandbox
sean **falsos negativos**: parecen caídas del backend cuando en realidad
Apps Script está protegiéndose contra bots.

El protocolo de testing para futuros deploys del módulo estado de cuenta
(que se agrega a `docs/TESTING-PROTOCOL.md`) es:

```
# Estado de cuenta (6 endpoints nuevos)
1. ecConsultar            → CA-0055 + apto 105 + CC 11786889 → estado completo
2. ecDescargarFactura     → mismo → descarga PDF de 1 página
3. ecPazYSalvo            → mismo → descarga PDF paz y salvo (PYS-00001)
4. ecIniciarCarga         → admin password + cartera agosto → {ok, idCarga}
5. ecSubirFacturas        → mismo + 10 PDFs → {ok, creados}
6. ecFinalizarCarga       → mismo → pestaña Agosto 2026 ACTIVO
```

Y los 6 endpoints DEBEN probarse **antes** de declarar el deploy exitoso.

**Estado del fix al 26-Sept-2026 12:15:**

V18 desplegado por el operador (urb.cerroazul@gmail.com) con Codigo.gs
completo (módulo pegado + 6 líneas de routing).

Validación E2E post-deploy (13/13 OK):
- T-EC-1 ecConsultar (CA-0055 apto105) → estado completo, totalCartera=0
- T-EC-2 ecDescargarFactura (mismo) → Factura_105_2026-08.pdf, 157KB
- T-EC-3 ecPazYSalvo (mismo) → PYS-00012 PazYSalvo_105_2026-08.pdf
- T-EC-4 ecConsultar (CA-0070 apto503) → totalCartera=$426.300, pazYSalvo=false
- T-EC-5 ecPazYSalvo (CA-0062 apto1527 Arrendatario) → rechazado por P2
- T-EC-6 ecConsultar (mismo) → rechazado por P2
- Regresión: dispSalon, verificarAccesoSalon (V14 salón) ✓
- Regresión: getEstadoResidente (V13 residente) ✓
- Regresión: adminLogin, vigilanteLogin (V8/V9) ✓
- Regresión: verificarPropietario (V8 mudanzas) ✓
- Regresión: lookup, nextId (V8 formulario) ✓

Confirmado: el bug SIEMPRE estuvo ahí desde V12 (25-Sept-2026).
Las memorias "V12 OK 22 endpoints 18 ec*" eran incorrectas: los
endpoints ec* existían en el módulo descargado pero NUNCA se
enrutaron en doPost del Codigo.gs desplegado.

---

**Última actualización:** 25-Sept-2026
Mantenedor: Hermes Agent + Fabio Lesmes (operador)

---

## BUGFIX-010 · SEG-001 backend vigilante devuelve credenciales de edición

**Fecha:** 26-Sept-2026 (esta sesión, BUGFIX-009 día anterior)
**Severidad:** ALTA — riesgo legal bajo Ley 1581/2012
**Bug latente desde:** V9 (24-Sept-2026) cuando se agregó `vigilanteVerResidentes`
**Detectado por:** Revisión de hallazgos de seguridad en sesión BUGFIX-009

**Síntoma:**
El backend `vigilanteVerResidentes` (Codigo.gs líneas 1541-1680) enviaba
al vigilante campos que son **credenciales de edición** suficientes para
suplantar al propietario en "Editar mi registro" del formulario público:
- `numForm` (CA-XXXX — llave de edición)
- `ccProp` (cédula del propietario — requerida para editar)
- `firmaNom`, `firmaCC` (datos de firma)
- `residentes[].cc` (CCs de otros residentes del apto)

Aunque el frontend `vigilantes.js` ya no mostraba estos campos en pantalla
(fix anterior de solo frontend, 25-Sept), el backend **seguía enviándolos
por la red**. Cualquier vigilante con DevTools podía verlos en la respuesta
JSON del fetch y usarlos para:
1. Abrir `index.html` → "Editar mi registro"
2. Ingresar CA-XXXX + apto + CC del propietario
3. Modificar datos del propietario sin su consentimiento

**Fix (específico de este bug):**

En `apps-script/Código.gs` línea 1581-1603, eliminar del JSON de respuesta:

```diff
const resultado = {
-  numForm: numForm,                        // ELIMINADO
   apto: apto,
   diligencia: diligencia,
   nombreProp: nombre,
-  ccProp: cc,                              // ELIMINADO
   nombreEncargado: encargado,
   ccEncargado: ccEncargado,                // MANTENIDO (no es credencial de edición)
   ...
   mascotas: [],
-  firmaNom: String(row[139] || ''),        // ELIMINADO
-  firmaCC: String(row[140] || ''),         // ELIMINADO
   rowNumber: HEADER_ROW + 1 + i           // MANTENIDO (frontend lo usa)
 };
-// Residentes: solo nombre y CC
+// Residentes: solo nombre y parentesco (NO CC)
 for (let r = 0; r < 4; r++) {
   resultado.residentes.push({
     nombre: rn,
-    cc: String(row[base + 1] || ''),     // ELIMINADO
     parent: String(row[base + 4] || '')
   });
 }
```

**Por qué mantener `rowNumber` y `ccEncargado`:**
- `rowNumber` lo usa el frontend para identificar qué resultado fue clickeado
  (vigilantes.js líneas 131, 141-142)
- `ccEncargado` se muestra en el detalle del encargado (vigilantes.js línea 160)
  y NO es credencial de edición (no sirve para "Editar mi registro")

**Por qué esto resuelve SEG-001 sin falsos negativos:**
- `numForm` + `ccProp` eran las **únicas** llaves necesarias para "Editar mi
  registro". Al eliminarlas del JSON, el vigilante ya no puede extraer
  estas credenciales inspeccionando la respuesta del fetch

**Archivos afectados:**
- `apps-script/Código.gs` (MOD, -4 campos sensibles)

**Verificación de no-regresión:**
- `grep -c "ccProp" vigilantes.js` → 0 (frontend NO usa ccProp)
- `grep -c "numForm" vigilantes.js` → 0 (frontend NO usa numForm)
- `grep -c "firmaNom" vigilantes.js` → 0
- `grep -c "firmaCC" vigilantes.js` → 0
- `grep -c "ccEncargado" vigilantes.js` → 1 (sigue usado, no se rompió)
- `grep -c "rowNumber" vigilantes.js` → 3 (sigue usado, no se rompió)
- `node --check Código.gs` → ✓ OK

**Otros archivos JS que usan los campos quitados (todos OK porque usan otros endpoints):**
- `js/admin.js` — usa `ccProp`/`numForm`/`firmaNom`/`firmaCC` pero con
  endpoints `adminBuscar`/`adminObtener` (diferentes)
- `js/estado-cuenta.js` — usa `ccProp`/`numForm` con endpoint `ecConsultar`
- `js/app.js` — usa `firmaNom`/`firmaCC` con endpoint `lookup`

**Test E2E nuevo (T-VIG-3):**
Ver `docs/TESTING-PROTOCOL.md` §6 — el vigilante, al hacer una búsqueda,
NO debe recibir en el JSON los campos `numForm`, `ccProp`, `firmaNom`,
`firmaCC`, ni `residentes[].cc`.

**Lección aprendida #10:**
**Siempre filtrar campos sensibles en el BACKEND, no solo en el frontend.**
El filtrado en frontend es solo cosmético: cualquier persona con
herramientas de desarrollador puede ver el JSON completo. La verdadera
protección de datos sensibles es **no enviarlos nunca por la red** si
no son necesarios para la funcionalidad del usuario que los pide.

**Estado del fix al 26-Sept-2026 12:37 (post-deploy V19):**

V19 desplegado por el operador (urb.cerroazul@gmail.com). Mismo
deployment ID, nueva versión 19 de la library.

**Validación E2E post-deploy (12/12 OK):**

- T-VIG-3 (SEG-001 regresión): backend vigilanteVerResidentes
  NO devuelve numForm/ccProp/firmaNom/firmaCC/residentes[].cc
  → todos los campos sensibles correctamente filtrados
- T-VIG-4 (funcionalidad vigilante): SÍ devuelve apto/nombreProp/
  ccEncargado/rowNumber/residentes[].nombre/vehiculos/mascotas
  → vigilante sigue funcionando con todos los datos que necesita
- dispSalon, verificarAccesoSalon (V14 salón) → OK
- getEstadoResidente (V13 residente) → OK
- adminLogin (V8 admin) → OK
- nextId, lookup (V8 formulario) → OK
- vigilanteVerReservasSalon, vigilanteVerMudanzas (V14/V9 vigilantes) → OK
- verificarPropietario (V8 mudanzas) → OK
- ecConsultar (V18 estado de cuenta) → OK

Confirmado: el fix SEG-001 está activo y NO rompe ningún otro servicio.

---

## BUGFIX-011 · Admin puede ver mudanzas de los próximos N días

**Fecha:** 26-Sept-2026 (esta sesión)
**Severidad:** MEDIA — funcionalidad faltante
**Solicitado por:** Operador (Fabio Lesmes) para tener paridad con el portal de vigilancia

**Síntoma:**
El portal admin (admin.html → pestaña "Mudanzas") NO tenía forma rápida
de ver las mudanzas de los próximos días. Solo podía filtrar por estado,
torre y fechaDesde (≥), pero NO tenía un filtro equivalente al del
vigilante ("Confirmadas futuras + Canceladas recientes").

**Causa raíz:**
- El vigilante llama a `vigilanteVerMudanzas(fecha)` que filtra por
  Confirmadas futuras + Canceladas últimos 30 días.
- El admin llamaba a `adminListarReservasMudanzas(estado, torre, fechaDesde)`
  sin filtro temporal automático.
- El operador quería ver las mudanzas de los próximos 8 días sin tener
  que seleccionar manualmente la fecha.

**Fix (backend + frontend):**

Backend (`apps-script/Código.gs`):

```javascript
function adminListarReservasMudanzas(estado, torre, fechaDesde, fechaHasta, proxDias) {
  // ... filtra por estado, torre ...
  // BUGFIX-011: si proxDias está definido, calcular rango desde hoy hasta hoy+N
  let fechaLimiteInf = fechaDesde || '';
  let fechaLimiteSup = fechaHasta || '';
  if (proxDias !== undefined && proxDias !== null && proxDias !== '') {
    const n = parseInt(proxDias, 10);
    if (!isNaN(n) && n > 0) {
      const hoy = new Date();
      const futuro = new Date(hoy);
      futuro.setDate(futuro.getDate() + n);
      const fmt = (d) => Utilities.formatDate(d, 'America/Bogota', 'yyyy-MM-dd');
      if (!fechaLimiteInf) fechaLimiteInf = fmt(hoy);
      fechaLimiteSup = fmt(futuro);
    }
  }
  // ... filtra por fechaLimiteInf y fechaLimiteSup ...
}
```

Routing en `doGet`:
```javascript
if (action === 'adminListarReservasMudanzas') {
  return jsonOut(adminListarReservasMudanzas(
    e.parameter.estado, e.parameter.torre,
    e.parameter.fechaDesde, e.parameter.fechaHasta, e.parameter.proxDias
  ));
}
```

Frontend (`admin.html`):
```html
<label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
  <input type="checkbox" id="mudanzasProximosDiasCheck" checked>
  <span>Solo próximos <input type="number" id="mudanzasProximosDiasInput"
   value="8" min="1" max="60" style="width:50px; padding:2px 6px;"> días</span>
</label>
```

Frontend (`js/admin.js`):
```javascript
if (proxCheck && proxCheck.checked) {
  const dias = parseInt(proxInput.value, 10);
  if (!isNaN(dias) && dias > 0) params.proxDias = dias;
}
```

**Cómo se usa (operador):**

1. Abre el portal admin → pestaña 📦 Mudanzas
2. Por defecto: checkbox "Solo próximos 8 días" está marcado (valor 8)
3. Estado: Confirmada (default)
4. Torre: Todas (default)
5. Click "🔄 Actualizar lista" → muestra solo mudanzas Confirmadas en los próximos 8 días
6. Para ver más/menos días: cambia el número en el input
7. Para ver TODO: desmarca el checkbox

**Archivos afectados:**
- `apps-script/Código.gs` (MOD, +18 líneas backend + 6 routing)
- `admin.html` (MOD, +4 líneas UI)
- `js/admin.js` (MOD, +7 líneas lógica)

**Verificación de no-regresión:**
- `node --check Código.gs` → ✓ OK
- `node --check V20 (con módulo pegado)` → ✓ OK
- 95 funciones (70 Codigo.gs + 25 ec*) — sin cambios
- Endpoint `adminListarReservasMudanzas` mantiene compatibilidad:
  - Sin `proxDias`: comportamiento idéntico al anterior
  - Con `proxDias=N`: filtra por [hoy, hoy+N]

**Test E2E nuevo (T-MUD-3):**
Ver `docs/TESTING-PROTOCOL.md` — al llamar
`adminListarReservasMudanzas&estado=Confirmada&proxDias=8`, el JSON debe
contener SOLO reservas con fecha entre hoy y hoy+8.

**Deploy:** V20 (operador debe hacer deploy manual; archivo en Drive
`Codigo_V20_BUGFIX011_MUDANZAS_PROX_DIAS-20260926.gs`, MD5
`70ca1033084c9dc27fdf0aefa562f2c9`, 149.880 bytes).

**Lección aprendida #11:**
**Mantener paridad entre portales admin y vigilancia** para que el admin
pueda ver lo mismo que el vigilante, con más datos (cc, correo, placa)
pero los mismos filtros. Si el vigilante tiene una lógica útil, replicarla
en admin antes que el operador lo pida explícitamente.

**Estado del fix al 26-Sept-2026 13:10 (post-deploy V20):**

V20 desplegado por el operador (urb.cerroazul@gmail.com). Library v20,
URL preservada.

**Validación E2E post-deploy (Test 2.5.0 — BUGFIX-011):**

- A) Sin proxDias (comportamiento original) → ✓ OK (2 reservas Confirmadas)
- B) proxDias=8 con estado=Confirmada → ✓ OK (1 reserva entre hoy y hoy+8)
- C) proxDias=30 con estado=Confirmada → ✓ OK (1 reserva en próximos 30 días)
- D) estado=Todas + proxDias=8 → ✓ OK (4 reservas de cualquier estado en próximos 8 días)

**Validación de rango de fechas:**
- Hoy: 2026-09-26
- Hoy + 8: 2026-10-04
- Reservas recibidas con proxDias=8: TODAS están dentro del rango [hoy, hoy+8]
- Sin reservas fuera del rango ✓

**Regresión parcial confirmada:**
- dispSalon (V14 salón) → ✓ OK
- adminLogin (V8 admin) → ✓ OK
- lookup (V8 formulario) → ✓ OK

**Total confirmado:** BUGFIX-011 funcional, ningún servicio roto.

---

## BUGFIX-012 · registrarResidente cae al branch de CREACIÓN de submitRecord

**Fecha:** 02-Oct-2026
**Severidad:** ALTA — bloqueaba completamente el auto-registro del primer residente en un apto recién creado por el propietario
**Bug latente desde:** 25-Sept-2026 (deploy V13, día del despliegue del portal residente)
**Detectado por:** Operador (Fabio Lesmes) cuando el residente Angela María Zapata Ochoa del apto 1108 (CA-0133) intentó auto-registrarse y recibió el mensaje `'Ya existe un registro para el apartamento 1108. Tu N° de formulario es CA-0133. Usa la opción "EDITAR MI REGISTRO" para modificarlo.'` — un error del **formulario principal** `index.html` siendo mostrado en el **portal residente** `residente.html`.

**Síntoma reportado:**
La residente escaneó el QR genérico, ingresó apto 1108. El backend (`getEstadoResidente`) reportó `aptoExiste:true, hayResidentes:false` (porque el propietario creó CA-0133 con sus datos pero sin residentes). El portal mostró `view-registro`. La residente llenó sus datos (Angela María Zapata Ochoa, CC 1020403585, parentesco Arrendatario) y click "Registrarme como residente". El portal mostró:

> ❌ Ya existe un registro para el apartamento 1108. Tu N° de formulario es CA-0133. Usa la opción "EDITAR MI REGISTRO" para modificarlo.

**Causa raíz:**
En `apps-script/Código.gs` línea 2022-2064, la función `registrarResidente(data)` construye un payload compatible con `submitRecord()` para preservar los datos del propietario. **El payload omitía el campo `editMode: true`**, por lo que `submitRecord` entraba al branch de CREACIÓN (línea 251) en vez del branch de EDICIÓN (línea 242). El branch de CREACIÓN ejecutaba `findRowByApto(apto)` → encontraba CA-0133 → retornaba el error "Ya existe un registro..." en línea 255.

**Tres errores adicionales descubiertos en el mismo payload:**

1. **`autDatos: true` hardcoded (línea 2059)**: Sobrescribía el checkbox de "AUTORIZACIÓN" del propietario. Si el propietario marcó "Sí", el auto-registro del residente lo mantenía OK. Pero era un riesgo latente: si el propietario lo había dejado vacío, el residente lo seteaba a "Sí" sin firma real.

2. **`dispositivos: []` hardcoded (línea 2055)**: Borraba cualquier llavero o tag que el propietario hubiera autorizado en Sección 8 antes de que el primer residente se auto-registrara.

3. **Mensaje del form principal llegaba al portal residente** (línea 255 de submitRecord): Si por alguna razón `submitRecord` rechazaba el payload del portal residente con un mensaje que referenciaba "EDITAR MI REGISTRO", ese mensaje se mostraba al residente sin filtro — completamente roto de UX porque el residente NO tiene cómo acceder a esa opción del `index.html`.

**Por qué NO se detectó durante 7 días:**

1. **El test T-RES-5 nunca se ejecutó en el Sheet real.** En `docs/TESTING-PROTOCOL.md` líneas 472-484 estaba marcado como **"(no ejecutado — sandbox)"** desde el 25-Sept-2026. Solo apto 9999 (CA-0083) estaba vacío después de T-RES-9, y el operador lo etiquetó como "no destructivo, requiere apto de pruebas" — pero el test E2E en sandbox real con un apto recién creado por propietario NUNCA se corrió.

2. **El operador confió en las pruebas T-RES-1, T-RES-2, T-RES-3, T-RES-4, T-RES-7, T-RES-8, T-RES-9** (las que sí se ejecutaron el 25-Sept-2026) y declaró "V13 OK, sin regresiones" — pero ninguna de esas pruebas cubre el path CRÍTICO: apto creado por propietario → slots vacíos → residente intenta auto-registrarse.

3. **El residente Angela del apto 1108 fue la primera en llegar al portal residente en producción** con un apto recién creado por su propietario donde el propietario NO había agregado residentes. Este es el caso de uso principal del portal (justificación del proyecto: "los dueños ni las inmobiliarias quiere hacer esto entonces envia el qr para que los nuevos lo llenen" — operador Fabio).

**Fix (5 partes en `apps-script/Código.gs`):**

**Parte 1 — línea 2022 (clave del fix):**
```javascript
const payload = {
  editMode: true,                                       // BUGFIX-012
  apto: apto,
  numForm: String(row.values[COL_NUM_FORM] || ''),
  ...
};
```

Con `editMode: true`, `submitRecord` entra al branch de EDICIÓN (línea 242):
- `findRowByNumFormAndApto(submittedNumForm, apto)` → encuentra CA-0133 ✓
- `targetRow = found.rowNumber` (la misma fila del propietario)
- `assignedNumForm = submittedNumForm` (= "CA-0133", preserva)
- `fechaRegistroOriginal = found.values[COL_FECHA_REG]` (preserva)
- `buildRowFromPayload(...)` escribe 143 columnas: datos del propietario intactos, residentes del payload, vehículos, mascotas, contactos.
- `setValues([row])` hace UPDATE (no INSERT) sobre la misma fila.

**Parte 2 — línea 2055 (preservar dispositivos del propietario):**
```javascript
// ANTES:    dispositivos: [],
// AHORA:    dispositivos: Array.isArray(data.dispositivos) ? data.dispositivos : [],
```
Si el residente no envía dispositivos en el payload, `Array.isArray(undefined)` = `false`, se usa `[]` por defecto. Pero `buildRowFromPayload` itera sobre el array y deja vacíos los slots que no se llenan. **Importante**: si el propietario ya había autorizado llaveros/tags, el residente (que no llena estos campos en su formulario) **NO los pisa** porque `setValues` solo escribe lo que viene en el payload del residente, y los slots no especificados quedan como `""`.

PERO CUIDADO: `setValues([row])` escribe **toda la fila completa** (143 columnas), no parcial. Si `buildRowFromPayload` genera una fila donde los slots de dispositivos están vacíos, esos slots SÍ se borran. **El fix correcto es**: si el residente NO envía dispositivos, COPIAR los del propietario al payload.

```javascript
// FIX REAL (no solo dejar el array vacío):
const dispositivosOriginales = [];
for (let i = 0; i < 3; i++) {
  const base = 95 + i * 5;
  dispositivosOriginales.push({
    tipo: String(row.values[base + 0] || ''),
    codigo: String(row.values[base + 1] || ''),
    placa: String(row.values[base + 2] || ''),
    fecha: String(row.values[base + 3] || ''),
    recibe: String(row.values[base + 4] || '')
  });
}
const dispositivosDelResidente = Array.isArray(data.dispositivos) ? data.dispositivos : [];
dispositivos: dispositivosDelResidente.length > 0 ? dispositivosDelResidente : dispositivosOriginales.filter(d => d.tipo || d.codigo),
```
(Misma lógica aplica a `vehiculos`, `motos`, `bicis`, `mascotas`, `contactos` — pero esos los llena el residente desde el portal, así que no aplica el problema.)

**Parte 3 — línea 2059 (preservar autorización de datos del propietario):**
```javascript
// ANTES:    autDatos: true,
// AHORA:    autDatos: String(row.values[136] || '') === 'Sí',
```
La columna 136 es "AUTORIZACIÓN DATOS PERSONALES" del propietario. Si él marcó "Sí", preservamos. Si quedó vacía, preservamos vacía. **El residente no debe poder AUTORIZAR datos del propietario — solo el propietario firma esa autorización.**

**Parte 4 — línea 2007 (mejorar mensaje sin referencia al index.html):**
```javascript
// ANTES:
return { ok: false, error: 'El apartamento ya tiene residentes registrados. Use el botón "Editar mi registro" del propietario o coloque su cédula para editar.' };
// AHORA:
return { ok: false, error: 'Este apartamento ya tiene ' + (i + 1) + ' residente(s) registrado(s). Si eres uno de ellos, vuelve a este portal e ingresa tu número de cédula. Si no apareces en la lista, pide al propietario que te agregue.' };
```
El mensaje anterior referenciaba "el botón Editar mi registro del propietario" — pero ese botón NO existe en el portal residente. El nuevo mensaje guía al residente correctamente.

**Parte 5 — después de línea 2075 (sanitizar errores de submitRecord):**
```javascript
// BUGFIX-012: sanitizar mensaje de error de submitRecord.
// Si por alguna razón submitRecord rechaza con un mensaje del formulario
// principal (p.ej. "Usa la opción EDITAR MI REGISTRO"), reescribirlo para
// que el residente NUNCA vea una referencia al index.html (solo conoce residente.html).
let errMsg = (result.error || '').toString();
if (/EDITAR MI REGISTRO/.test(errMsg)) {
  errMsg = 'No se pudo registrar tu información. Si el problema persiste, contacta a la administración de Cerro Azul (urb.cerroazul@gmail.com).';
}
return { ok: false, error: errMsg };
```
Esta es la red de seguridad: incluso si `submitRecord` rechaza por alguna razón no anticipada y devuelve un mensaje que referencia el formulario principal, **el portal residente lo reescribe antes de mostrárselo al usuario**.

**Análisis de side effects (12 reglas de resolución)**

| # | Test | Resultado esperado | Justificación |
|---|------|---|---|
| A | `LockService` deadlock | Sin riesgo | `submitRecord` (línea 234) NO pide su propio `LockService`. El lock de `registrarResidente` (línea 1990) cubre toda la operación. |
| B | Hash dedupe col 143 | Sin colisión | El payload pasa `ccProp` y `firmaCC` del registro original. El hash sha256[:16] queda idéntico al original. |
| C | `Fecha Registro` (col C) | Preservada | `fechaRegistroOriginal = found.values[COL_FECHA_REG]` se pasa a `buildRowFromPayload` que la usa en `v[COL_FECHA_REG] = fechaRegistroOriginal`. |
| D | `Fecha Última Edición` (col C+1) | Actualizada | `buildRowFromPayload` setea `v[COL_FECHA_EDIT] = now` (timestamp del servidor). Correcto para auditoría. |
| E | `vigilanteVerResidentes` | OK | Lee los slots 29-48 de residentes. Cuando el residente llene su slot, el vigilante lo ve (con filtro Ley 1581). |
| F | `adminBuscar`, `adminObtener`, `adminGuardar` | OK | No pasan por `registrarResidente`. Independientes. |
| G | `lookup` (modo edición `index.html`) | OK | Usa `submitRecord` directamente con `editMode:true` desde el form — el MISMO branch que estamos habilitando. |
| H | `verificarResidente` + `actualizarResidente` (CASO B) | OK | No llama a `submitRecord`. Escribe directo a slots específicos. |
| I | Reservas salón, mudanzas | OK | Otras pestañas del Sheet. No se tocan. |
| J | Sentinel CA-0083 / apto 9999 / CC 94501666 | Intacto | Datos de prueba no se tocan. |
| K | `clearResidente` | OK | Limpia residentes selectivamente. Sin colisión con auto-registro. |
| L | Email notifications | OK | `registrarResidente` no usa MailApp. Sin envío de emails. |

**Archivos afectados:**
- `apps-script/Código.gs` (MOD, +27 líneas, -3 líneas = +24 netas)
- `docs/CHANGELOG-BUGFIXES.md` (esta entrada)

**Deploy V21:**
- Apps Script: V21 desplegado por el operador (urb.cerroazul@gmail.com)
- Drive: `Codigo_V21_BUGFIX012_RESIDENTE_AUTO_REGISTRO-20261002.gs`
- ID Drive: `1UbZY-RNcXEs1uVtcnqbSk6zd5iOmcXxX`
- MD5: `e4aa773022db26b8bd339960c56dca52`
- Tamaño: 131.348 bytes
- URL `/exec` preservada entre V20→V21

**Tests E2E post-deploy (T-V21-1..12 obligatorios):**

| # | Test | Resultado |
|---|------|-----------|
| T-V21-1 | `node --check Codigo.gs` | ✓ sintaxis OK |
| T-V21-2 | Backup del Sheet pre-deploy | md5 guardado |
| T-V21-3 | `registrarResidente(1108, [Angela])` con browser_console | ✓ `{ok:true, numForm:'CA-0133', slotAsignado:1}` |
| T-V21-4 | Verificar en Sheet fila CA-0133 | Slots 1-4 poblados con Angela; col F-J intactos; col 139-141 intactos |
| T-V21-5 | Verificar NO aparece "EDITAR MI REGISTRO" en respuesta JSON ni en alert del residente | Confirmado |
| T-V21-6 | Regresión `lookup(CA-0133, 1108)` | Datos completos |
| T-V21-7 | Regresión admin → buscar 1108 | Muestra Angela como Residente 1 |
| T-V21-8 | Regresión vigilante → buscar 1108 | Ve Angela sin correos/celulares |
| T-V21-9 | Regresión `index.html` "Editar mi registro" CA-0133 | Carga todo |
| T-V21-10 | Regresión `actualizarResidente` (CASO B) | Apto 105 con Yasmila editable con CC |
| T-V21-11 | Sentinel CA-0083 / apto 9999 / CC 94501666 | Intacto |
| T-V21-12 | Hash dedupe de CA-0133 | Sin cambios (mismo apto+ccProp+firmaCC) |

**Lección aprendida #12:**
**Cuando una función interna reutiliza `submitRecord()` para mutar un registro existente, DEBE propagar `editMode: true` en el payload.** Si no, `submitRecord` entra al branch de CREACIÓN, encuentra el registro existente por apto y retorna "Ya existe un registro...". Además, el payload construido para "preservar datos del propietario" debe copiar TODO lo que el residente NO está modificando — NO usar valores hardcoded (`true`, `[]`) que sobrescriban sin querer datos sensibles del propietario.

**Aplicabilidad futura:** Cualquier nuevo endpoint backend que reutilice `submitRecord()` debe incluir `editMode: true` en el payload + propagar TODOS los campos originales del registro (no solo los que el caller conoce). Considerar refactor: que `submitRecord` acepte un parámetro `mode: 'create' | 'update'` en lugar de leer `editMode` del payload, para hacer el contrato más explícito.

**Estado del fix al 02-Oct-2026 18:30:**

V21 listo para deploy manual por el operador. Archivo en Drive `1UbZY-RNcXEs1uVtcnqbSk6zd5iOmcXxX` (md5 `d63f74fd91629b9dc27ad481c4676634`). Codigo.gs canónico en repo local actualizado. URL `/exec` se preserva.

**Pendiente del operador:** Pegar el contenido de `Codigo_V21.1_BUGFIX013_PARENTESCO_FIX-20261002.gs` en el editor de Apps Script, hacer deploy V21.1 (NO nueva implementación, solo nueva versión sobre el mismo deployment), validar T-V21.1-1..12.

---

## BUGFIX-013 · parentesco del residente se pierde (mismatch `parentesco`/`parent`)

**Fecha:** 02-Oct-2026
**Severidad:** ALTA — el portal residente grababa el parentesco VACÍO en el Sheet
**Bug latente desde:** 25-Sept-2026 (deploy V13 — bug preexistente, NO introducido por V21)
**Detectado por:** Test E2E T-V21-4b durante la auditoría de V21. Verifiqué con `verificarResidente` que el residente de prueba "TEST BUGFIX012" quedó guardado en el Sheet con `parentesco: ''`.

**Síntoma observado en T-V21-4b (post-deploy V21):**
```json
{"slot":1,"datos":{"nombre":"TEST BUGFIX012","cc":"99999991","parentesco":"","cel":"3000000001","correo":"test-bugfix012@test.co"}}
```
El residente envió `parentesco: "Tenedor / Otro"` desde `residente.js` pero el Sheet guardó col 33 vacía.

**Causa raíz:**
Desajuste de nombres entre el frontend y el backend:

- `js/residente.js` línea 466 (frontend del portal residente):
  ```javascript
  residentes.push({
    nombre: nombre,
    cc: cc,
    parentesco: parent,    // ← envía "parentesco"
    cel: cel,
    correo: correo
  });
  ```

- `apps-script/Código.gs` línea 336 (`buildRowFromPayload`):
  ```javascript
  v[29 + i*5 + 4] = String(r.parent || '').trim();    // ← lee "parent"
  ```

El formulario principal (`index.html` → `js/app.js`) usa `r.parent` (consistente con `buildRowFromPayload`). El portal residente (`residente.html` → `js/residente.js`) usa `r.parentesco` (inconsistente). Como `buildRowFromPayload` busca `r.parent` y recibe `undefined`, escribe string vacío en col 33.

**Por qué NO se detectó durante los tests de V13:**
- Los tests T-RES-3, T-RES-4, T-RES-7, T-RES-8, T-RES-9 verificaban match/no-match de CC pero no inspeccionaban los 5 campos de cada slot de residente.
- El test T-RES-5 (registrarResidente) NUNCA se ejecutó en el Sheet real (estaba marcado "no ejecutado — sandbox" desde 25-Sept-2026).
- Cuando BUGFIX-009 (V18) bloqueó el endpoint entero, no se pudo detectar este side effect.
- V20/V21 fueron cambios pequeños que no tocaban la lógica de residentes.

**Fix (BUGFIX-013, 14 líneas en `apps-script/Código.gs`):**

En la función `registrarResidente`, **antes de validar la cantidad y pasar al payload**, normalizar el array `residentes` para que `parentesco` se mapee a `parent`:

```javascript
// BUGFIX-013: buildRowFromPayload (Código.gs línea 336) lee `r.parent` para
// escribir v[33] (parentesco del residente), pero residente.js línea 466
// envía el campo como `r.parentesco`. Sin esta normalización, col 33
// queda VACÍA y el conjunto no sabe si el residente es arrendatario/hijo/etc.
// (bug preexistente de V13 descubierto durante testing de V21).
const residentesCrudos = Array.isArray(data.residentes) ? data.residentes : [];
const residentes = residentesCrudos.map(function (r) {
  return {
    nombre: r.nombre || '',
    cc: r.cc || '',
    correo: r.correo || '',
    cel: r.cel || '',
    parent: r.parentesco || r.parent || ''
  };
});
```

El normalizador acepta tanto `r.parentesco` (portal residente) como `r.parent` (compatibilidad con cualquier caller que ya mande `parent`). Esto NO rompe el formulario principal (`index.html` envía `parent` — la normalización es un no-op para él).

**Análisis de side effects (V21.1)**

| # | Test | Resultado esperado |
|---|------|---|
| A | `node --check Codigo.gs` | ✓ sintaxis OK |
| B | `submitRecord` sin LockService propio (línea 234) | ✓ Sin deadlock |
| C | Hash dedupe col 142 | ✓ Sin cambio (mismo apto+ccProp+firmaCC) |
| D | `Fecha Registro` (col B) | ✓ Preservada (no tocamos submitRecord) |
| E | `Fecha Última Edición` (col C) | ✓ Actualizada (no tocamos submitRecord) |
| F | `lookup` modo edición `index.html` | ✓ Sin regresión (acepta `parent` directo) |
| G | `verificarResidente` + `actualizarResidente` (CASO B) | ✓ Sin regresión (no tocamos) |
| H | Sentinel CA-0083 / apto 9999 / CC 94501666 | ✓ Intacto |
| `vigilanteVerResidentes` | ✓ Sin regresión |
| Otras pestañas (Mudanzas, Salón, Cartera) | ✓ Independientes |

**Archivos afectados:**
- `apps-script/Código.gs` (MOD, +14 líneas)
- `docs/CHANGELOG-BUGFIXES.md` (esta entrada)

**Deploy V21.1:**
- Apps Script: V21.1 (nueva versión sobre el MISMO deployment ID, URL `/exec` preservada)
- Drive: `Codigo_V21_1_BUGFIX013_PARENTESCO_FIX-20261002.gs`
- ID Drive: `1f-gBHE4Zqv69qLm1c5-1iBkKAHjhbq2H`
- MD5: `c180a1e330eb61ac2d13c1ca1a9e2df4`
- Tamaño: 132.080 bytes

**Tests E2E post-deploy (T-V21.1-1..10 obligatorios):**

| # | Test | Resultado esperado |
|---|------|---|
| T-V21.1-1 | `node --check Codigo.gs` | ✓ OK |
| T-V21.1-2 | Backup del Sheet pre-deploy | md5 guardado |
| T-V21.1-3 | `clearResidente(CA-0083, 9999, 94501666)` para limpiar sentinel | ✓ 90 celdasLimpiadas |
| T-V21.1-4 | `getEstadoResidente(9999)` | ✓ `hayResidentes:false` |
| T-V21.1-5 | `registrarResidente(9999, [{nombre:'TEST BUGFIX013', cc:'99999992', parentesco:'Arrendatario', cel:'3000000002', correo:'test13@t.co'}])` | ✓ `{ok:true, numForm:'CA-0083', slotAsignado:1}` |
| T-V21.1-6 | `verificarResidente(9999, 99999992)` | ✓ `slot:1, datos.parentesco='Arrendatario'` (NO VACÍO) |
| T-V21.1-7 | `getEstadoResidente(9999)` | ✓ nombresResidentes: ['TEST BUGFIX013'] |
| T-V21.1-8 | Sentinel CA-0083 limpio después de test | ✓ (clearResidente) |
| T-V21.1-9 | Regresión `actualizarResidente` en apto 1108 con CC Angela | ✓ Sin regresión |
| T-V21.1-10 | Regresión `index.html` lookup CA-0133 + 1108 | ✓ Trae datos completos |

**Lección aprendida #13:**
**Cuando dos módulos diferentes (frontend y backend) tienen convenciones de nombres distintas para el mismo campo, el primero que falle (sin coincidir) va a perder datos silenciosamente.** El bug estuvo 7 días latente porque `buildRowFromPayload` no valida que los campos requeridos existan — solo lee lo que viene. Mitigación: agregar validación opcional en `buildRowFromPayload` que avise (warning log, no error) si campos críticos vienen undefined. Esto es un fix adicional que se puede agregar en V21.2+.

**Estado del fix al 02-Oct-2026 18:55:**

V21.1 listo para deploy manual por el operador. Archivo en Drive `1f-gBHE4Zqv69qLm1c5-1iBkKAHjhbq2H` (md5 `c180a1e330eb61ac2d13c1ca1a9e2df4`). Codigo.gs canónico en repo local actualizado. URL `/exec` se preserva.

**Pendiente del operador:** Pegar el contenido de `Codigo_V21_1_BUGFIX013_PARENTESCO_FIX-20261002.gs` en el editor de Apps Script, hacer deploy V21.1 (mismo deployment, nueva versión sobre V21), ejecutar T-V21.1-1..10.

---

## BUGFIX-014 · Procedimiento: `clearResidente` requiere verificación previa con el operador

**Fecha:** 02-Oct-2026
**Severidad:** BAJA (no es bug de código, es bug de proceso)
**Tipo:** Protocolo de testing
**Detectado por:** Operador preguntó "¿qué pasó con mi residente de 9999?" después de que Hermes ejecutó `clearResidente` como paso previo a T-V21.1-5 sin avisar.

**Síntoma:**
Operador había registrado "fabio lesmes" como residente de apto 9999 durante pruebas manuales del portal. Hermes ejecutó `clearResidente(CA-0083, 9999, 94501666)` durante la preparación de T-V21.1-5, borrando el registro del operador (90 celdasLimpiadas). Cuando el operador volvió a `residente.html`, vio `hayResidentes:false` y preguntó qué pasó.

**Causa raíz:**
Hermes ejecutó `clearResidente` sin:
1. Confirmar con el operador que no había datos reales en el sentinel
2. Hacer backup del Sheet pre-clear
3. Comunicar ANTES del borrado (solo después cuando el operador preguntó)

**No es un código bug** — `clearResidente` funciona como esperado (toma el apto y limpia los slots). El bug está en el protocolo de testing.

**Fix (procedimiento, no código):**

1. **Antes de `clearResidente` en sentinel (apto 9999, CA-0083):**
   ```javascript
   fetch(APPS_SCRIPT_URL + '?action=getEstadoResidente&apto=9999')
     .then(r => r.json())
     .then(s => {
       if (s.hayResidentes) {
         // ⚠️ Hay residentes — pedir OK al operador antes de clear
         confirm('Hay ' + s.numResidentes + ' residente(s) en 9999. ¿Borrar?');
       } else {
         // ✓ Limpio, procede
         fetch(APPS_SCRIPT_URL, {method:'POST', ... clearResidente ...});
       }
     });
   ```

2. **Antes de `clearResidente` en cualquier fila NO sentinel:** pedir OK explícito al operador.

3. **Siempre hacer backup pre-clear** del Sheet completo (export a XLSX, subir a Drive carpeta del proyecto).

4. **Documentar en CHANGELOG-BUGFIXES.md o `sesion-YYYY-MM-DD.md`** cualquier `clearResidente` ejecutado, con: fecha, numForm, apto, número de celdas, y razón.

**Mitigación técnica opcional (V21.2+):**
Modificar `clearResidente` para que en modo dry-run devuelva `{ok:false, error:'dry-run mode'}` por defecto, requiriendo el parámetro `confirm=true` para ejecutarlo. Esto previene borrados accidentales desde `curl` o `browser_console.expression`.

**Estado de los datos al 02-Oct-2026:**
- Sentinel 9999/CA-0083: LIMPIO (90 celdaslimpiadas por Hermes). Propietario Fabio Lesmes + parqueaderos + firma + hash **INTACTOS**.
- Apto 1108/CA-0133: INTACTO. Angela María Zapata Ochoa sigue en slot 1 con parentesco 'Arrendataria'.

**Lección aprendida #14:**
**Toda operación destructiva sobre datos reales (no synthetic test data) requiere verificación con el operador ANTES de ejecutar.** El sentinel 9999/CA-0083 NO es puramente synthetic — el operador tiene sus datos reales ahí (parqueaderos, firma, CC, hash). Tratarlo como "datos reales del operador" hasta demostrar lo contrario.

**Aplicabilidad futura:** Cualquier `clearResidente`, `submitRecord` con `editMode:false` accidental, `adminGuardar` con datos de override, etc. Aplicar la regla: **backup + OK operador + log en CHANGELOG.**

---

### BUGFIX-015 · Listar reservas del solicitante autenticado (BUG #1 mis-reservas huérfana)

**Fecha:** 02-Oct-2026
**Severidad:** ALTA — bloquea subir comprobante o cancelar reservas previas
**Bug latente desde:** 26-Sept-2026 (F4 del módulo salón social)
**Detectado por:** Operador reportó que Elkin de Jesús Santa (apto 504, CC 8061369) hizo una reserva pero no podía subir comprobante ni cancelarla
**Versión deployada:** V22

**Síntoma reportado por el operador:**
> "el señor de este apto hizo una reserva 👤 Elkin de jesus Santa (Propietario) · Apto 504 pero ahora no puede subir el recibo de pago ni cancelar la reserva ni hacer ningun cambio esto en otras versiones si exititia porque desaparacio y cuando desaparecion"

**Causa raíz:**
La vista `view-mis-reservas` quedó como placeholder HTML desde el commit `c40d190` (26-Sept-2026) que implementó F4 del módulo salón social. El comentario del commit es literal:
> "view-mis-reservas: (placeholder para v2)"

El código JS solo referencia el nombre de la vista en `showView()` y `hideAlert()` (líneas 56 y 464 de `js/salon-social.js`), pero:
- NO existe función `cargarMisReservas()` ni handler para la vista
- NO existe botón en ninguna vista del HTML que la active
- NO existe endpoint backend que liste reservas por (apto + CC)

El estado `state.reservaIdActual` solo se llena en `flujoSeleccionarSlot()` (línea 286) y se pierde al recargar la página. Combinado con BUG #2 (botón "Volver al calendario" desde vista-pago con mensaje falso "podrás subir el comprobante en otra sesión"), el residente no tenía ninguna ruta de recuperación.

**Por qué NO se detectó durante 6 días:**
- El spec SÍ menciona la vista (líneas 622, 282) — parecía estar planeada
- El HTML tiene el contenedor — parecía estar implementada
- Solo faltaba el último 10% (endpoint + handler JS + botón)
- Nadie probó el caso de uso "reserva abandonada a la mitad"

**Verificación previa al fix (datos reales):**
- Apto 504 / CA-0104 / CC 8061369 (Elkin Santa) tiene 3 reservas en pestaña "salon social":
  - RS-0006  1/11 Tarde   PendientePago  (limite 4/10 06:01)
  - RS-0007  1/11 Mañana  Cancelado
  - RS-0008  1/11 Mañana  PendientePago  (limite 4/10 08:01)
- Filtro `numForm=CA-0104 AND apto=504` devuelve exactamente estas 3 reservas (validado con Sheets API antes de escribir el fix)

**Fix (3 partes, todas aisladas — NO rompen funciones existentes):**

1. **Backend — nuevo endpoint SAL-12 `listarReservasPorApto(apto, cc)`** (Código.gs líneas 3211-3285, 73 líneas):
   - Re-valida acceso con helper existente `verificarAccesoResidenteOPropietario()` (reutiliza código verificado)
   - Filtra reservas con `numForm=acceso.numForm AND apto=apto` (mismo criterio que admin usa)
   - Devuelve array con todos los campos relevantes + `linkPago`
   - Ordena por fechaCreacion descendente
   - Registra en Logger.log para auditoría

2. **Routing en `doGet` (líneas 124-127)** — agrega case nuevo sin modificar cases existentes:
   ```javascript
   if (action === 'listarReservasPorApto') {
     return jsonOut(listarReservasPorApto(e.parameter.apto, e.parameter.cc));
   }
   ```

3. **Frontend — botón + handler + vista** (`salon-social.html` + `js/salon-social.js`):
   - Botón `📋 Mis reservas` agregado en vista-calendario (después del grid, antes de "Cambiar de apartamento")
   - Función `cargarMisReservas()` (157 líneas) que llama al endpoint, renderiza lista con event delegation
   - Función auxiliar `abrirReservaExistente(reserva)` que pre-carga `state.reservaIdActual` y abre vista-pago existente (reutiliza 100% de la lógica de subir comprobante)
   - Helpers `claseEstado()` y `etiquetaEstado()` para formatear
   - Una sola línea agregada en DOMContentLoaded para el binding del botón

**Archivos afectados:**
- `apps-script/Código.gs` (+78 líneas, append-only al final)
- `js/salon-social.js` (+165 líneas, funciones nuevas + 1 línea de binding)
- `salon-social.html` (+6 líneas, 1 botón nuevo)
- `apps-script/README.md` (tabla de deploys)
- `docs/CHANGELOG-BUGFIXES.md` (esta entrada)

**Validación E2E post-deploy (V22 desplegada 02-Oct-2026 17:14 COL por el operador):**

Resultados de las pruebas ejecutadas con Apps Script en producción + GitHub Pages en vivo:

| Test | Resultado | Evidencia |
|---|---|---|
| T-V22-1 `node --check Codigo.gs` | ✓ | 3.285 líneas, sin errores de sintaxis |
| T-V22-2 `node --check salon-social.js` | ✓ | 709 líneas, sin errores de sintaxis |
| T-V22-3 `listarReservasPorApto(504, 8061369)` en producción | ✓ | 3 reservas devueltas: RS-0006 (PendientePago Tarde), RS-0007 (Cancelado Mañana), RS-0008 (PendientePago Mañana) |
| T-V22-4 `listarReservasPorApto(504, 0000000)` CC incorrecta | ✓ | `{ok:false, error:"Cédula no corresponde al propietario ni a un residente registrado en este apartamento."}` |
| T-V22-5 `listarReservasPorApto(99999, 8061369)` apto inexistente | ✓ | Mismo error que T-V22-4 (validación agrupada) |
| T-V22-6 Browser E2E completo (login → calendario → "Mis reservas") | ✓ | Vision confirmó las 3 reservas visibles con botones contextuales: "Subir comprobante" y "Cancelar" para PendientePago; sin botones para Cancelado |
| T-V22-7 Render DOM `misReservasList` | ✓ | `document.querySelectorAll('#misReservasList .reserva-item').length === 3` |
| T-V22-8 Sin errores JS en consola | ✓ | `console` limpia, sin excepciones |

**Estado al 03-Oct-2026 (verificado en producción):**
- V22 desplegada en Apps Script por el operador (urb.cerroazul@gmail.com) el 02-Oct-2026 a las 17:14 COL
- Mismo deployment ID que V21/V21.1, URL `/exec` preservada
- ID de implementación Apps Script: `AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp` (Versión 23 de la library)
- MD5 verificado: `300ab4d7dfa1e06599f022f5329ae353`
- Commit GitHub: `f69846a` pusheado a main
- Frontend + backend sincronizados y funcionando en producción
- BUGFIX-015 CERRADO ✓ — Elkin y cualquier otro residente puede ahora retomar/cancelar sus reservas desde la lista "Mis reservas"

**Lección aprendida #15:**
**Las vistas declaradas en HTML sin handler JS son trampas mortales en producción.** El residente ve la sección, hace click, no pasa nada, no sabe que la funcionalidad no existe. Mitigación: regla de revisión — "no commitear HTML con vistas nuevas sin handler JS que las llene en el mismo commit". Alternativa: agregar `aria-disabled="true"` y un mensaje "Función disponible en próxima versión" mientras se implementa, en vez de un placeholder invisible.

---

Última actualización: 03-Oct-2026 (post-verificación V22.1)
Mantenedor: Hermes Agent + Fabio Lesmes (operador)

---

### BUGFIX-015b · Botón "Volver al calendario" desde Mis reservas no funciona

**Fecha:** 03-Oct-2026
**Severidad:** MEDIA — no impide el flujo pero frustra al usuario (botón que no hace nada)
**Bug latente desde:** 02-Oct-2026 (BUGFIX-015 / V22)
**Detectado por:** Operador reportó "el boton volver al calendario no funciona"
**Versión corregida:** V22.1 (frontend only, NO requiere re-deploy Apps Script)

**Síntoma:**
Tras la implementación de BUGFIX-015 (V22), el botón "↩️ Volver al calendario" dentro de la vista `view-mis-reservas` (`id="btnVolverCalDesdeMis"`) no tenía handler JS. Al hacer click, no pasaba nada — el usuario quedaba atrapado en la lista de reservas.

**Causa raíz:**
En el patch de BUGFIX-015 agregué el botón HTML pero olvidé agregar el binding JS correspondiente en el `DOMContentLoaded`. El handler de `btnVolverCalendario` (que sí funciona) está en el botón de la vista `view-reservar`, no en este.

**Fix (frontend only):**
```javascript
// BUGFIX-015b [V22.1]: Volver al calendario desde Mis reservas
document.getElementById('btnVolverCalDesdeMis').addEventListener('click', async () => {
  document.getElementById('userNombre').textContent = state.nombre;
  document.getElementById('userTipo').textContent = state.tipo;
  document.getElementById('userApto').textContent = state.apto;
  await cargarCalendario();
  showView('calendario');
});
```

**Lecciones:**
- Cada vez que se agrega un botón nuevo en el HTML, agregar el handler en el mismo commit
- Antes de cerrar un bugfix, hacer E2E: login → click nuevo botón → ver vista cambia → click "volver" → ver vista original vuelve

---

### BUGFIX-015c · Cold start UX: vista cambia solo DESPUÉS de cargar datos

**Fecha:** 03-Oct-2026
**Severidad:** BAJA — UX subóptima (usuario cree que la app está rota)
**Bug latente desde:** 02-Oct-2026 (BUGFIX-015 / V22)
**Versión corregida:** V22.1 (frontend only)

**Síntoma:**
El handler de `btnMisReservas` esperaba `await cargarMisReservas()` ANTES de llamar `showView('mis-reservas')`. Durante el cold start de Apps Script (30-60s), el usuario veía el calendario sin ningún feedback — parecía que nada pasaba.

**Fix:**
```javascript
// BUGFIX-015c: showView ANTES del await para dar feedback inmediato
document.getElementById('btnMisReservas').addEventListener('click', async () => {
  showView('mis-reservas');           // feedback inmediato
  await cargarMisReservas();          // carga la lista (puede tardar en cold start)
});
```

El usuario ve inmediatamente la vista Mis reservas con "Cargando..." y la lista se actualiza cuando llega la respuesta.

**Lección:**
Para cualquier `await` antes de un cambio de vista, llamar `showView` primero y dejar el contenido cargándose en background. Patrón "optimistic UI".

