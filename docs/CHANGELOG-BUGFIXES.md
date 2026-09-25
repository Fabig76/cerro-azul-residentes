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

Última actualización: 25-Sept-2026
Mantenedor: Hermes Agent + Fabio Lesmes (operador)
