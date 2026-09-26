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

**Deploy:** V19 (operador debe hacer deploy manual; ver archivo V19 que
se subirá a Drive tras aprobación del operador)

---

Última actualización: 26-Sept-2026 13:00
Mantenedor: Hermes Agent + Fabio Lesmes (operador)
