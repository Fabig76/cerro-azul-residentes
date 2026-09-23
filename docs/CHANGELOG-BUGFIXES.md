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

Última actualización: 23-Sept-2026
Mantenedor: Hermes Agent + Fabio Lesmes (operador)
