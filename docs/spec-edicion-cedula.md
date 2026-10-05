# Spec — Verificación de cédula del propietario en "Editar mi registro"

**Fecha:** 05-Oct-2026
**Estado:** Propuesta (pendiente de aprobación para implementar)
**Versión objetivo:** V33

---

## 1. Problema

El flujo "Editar mi registro" (`index.html`) solicita SOLO dos datos para cargar el
formulario completo: **N° de formulario (CA-XXXX)** + **N° de apartamento**.

- **Lectura:** `doGet action=lookup` (`numForm` + `apto`) devuelve `rowToObject(row.values)`
  = los 143 campos completos del propietario (nombre, cédula, correo, celular, vehículos,
  mascotas, familia, todo), sin verificar la identidad de quien consulta.
- **Escritura:** `submitRecord` en modo edición (`editMode:true`) valida únicamente
  `numForm + apto` (`findRowByNumFormAndApto`) antes de sobrescribir la fila.

Como consecuencia, quien conozca esos dos datos puede **leer y editar** el registro
completo. El `numForm` es una credencial débil: se filtró en versiones anteriores
(BUGFIX-017), y puede obtenerse por otras vías (papel, correo reenviado, captura).

Este spec es el cierre del "pendiente recomendado" anotado en BUGFIX-017.

---

## 2. Objetivo

Agregar la **cédula del propietario** como tercer factor de verificación en el flujo de
edición, tanto para LEER (lookup) como para ESCRIBIR (submitRecord editMode). De esta
forma, `numForm + apto` deja de ser suficiente por sí solo.

---

## 3. Solución

Reutilizar la lógica que ya existe en `verificarPropietario()` (línea ~1014 de
`Código.gs`): valida `numForm + apto + ccProp` contra el registro, con normalización de
cédula y restricción de diligencia. Aplicar esa misma validación en los dos puntos:

1. **Lectura** — `doGet action=lookup`: exigir `ccProp` y validar antes de devolver el row.
2. **Escritura** — `submitRecord` en modo edición: validar `ccProp` antes de escribir.

> `verificarPropietario()` NO se modifica (lo usa el módulo de mudanzas); solo se
> reutiliza su criterio de validación (mismo código, sin riesgo de regresión ahí).

---

## 4. Cambios Backend (`apps-script/Código.gs`)

### 4.1 `doGet` — `action=lookup`

Antes:
```javascript
if (action === 'lookup') {
  const numForm = String(e.parameter.numForm || '').trim();
  const apto = String(e.parameter.apto || '').trim();
  const row = findRowByNumFormAndApto(numForm, apto);
  if (!row) { return jsonOut({ ok:false, error:'No se encontró...' }); }
  return jsonOut({ ok:true, row: rowToObject(row.values) });
}
```

Después:
```javascript
if (action === 'lookup') {
  const numForm = String(e.parameter.numForm || '').trim();
  const apto = String(e.parameter.apto || '').trim();
  const ccProp = normalizarCC(e.parameter.ccProp);
  if (!ccProp) return jsonOut({ ok:false, error:'Falta cédula del propietario.' });
  const row = findRowByNumFormAndApto(numForm, apto);
  if (!row) return jsonOut({ ok:false, error:'No se encontró...' });
  if (normalizarCC(row.values[6]) !== ccProp) {
    return jsonOut({ ok:false, error:'La cédula no coincide con el propietario registrado. Verifique o contacte a la administración.' });
  }
  return jsonOut({ ok:true, row: rowToObject(row.values) });
}
```

### 4.2 `submitRecord` — branch de edición

En `submitRecord`, dentro de `if (editMode)`, después de resolver `found`:

```javascript
if (editMode) {
  const found = findRowByNumFormAndApto(submittedNumForm, apto);
  if (!found) { return { ok:false, error:'N° de formulario o N° de apartamento no coinciden...' }; }
  // NUEVO: validar cédula antes de escribir
  if (normalizarCC(data.ccProp) !== normalizarCC(found.values[6])) {
    return { ok:false, error:'La cédula no coincide con el propietario registrado. No se puede editar.' };
  }
  ...
}
```

> El payload de edición ya incluye `ccProp` (el formulario lo envía), por lo que no hay
> cambio de contrato, solo de validación.

---

## 5. Cambios Frontend

### 5.1 `index.html`

En la vista `view-edit` (sección "Editar mi registro", ~línea 541), agregar un tercer
campo después de `lookupApto`:

```html
<div class="field">
  <label>Cédula del propietario <span class="req">*</span></label>
  <input type="text" id="lookupCcProp" inputmode="numeric"
         placeholder="Solo números, sin puntos ni guiones" autocomplete="off">
</div>
```

### 5.2 `js/app.js` — `buscarRegistro()`

- Leer `val('#lookupCcProp')`.
- Validación client-side: no vacío + solo dígitos.
- Agregar `&ccProp=` a la URL del lookup:
  ```javascript
  const url = APPS_SCRIPT_URL + '?action=lookup&numForm=' + encodeURIComponent(numForm)
            + '&apto=' + encodeURIComponent(apto) + '&ccProp=' + encodeURIComponent(ccProp);
  ```
- El manejo de errores se mantiene igual (muestra `data.error`).

---

## 6. Flujo final

1. Usuario abre "Editar mi registro".
2. Ingresa N° de formulario + N° de apartamento + **cédula del propietario**.
3. Click "Buscar mi registro".
4. Backend valida cédula:
   - Coincide → devuelve los 143 campos y se precarga el formulario.
   - No coincide / vacía → error, no devuelve datos.
5. Usuario edita y "Guardar cambios".
6. Backend (`submitRecord` editMode) re-valida cédula y guarda.

---

## 7. Casos de prueba

| # | Caso | Resultado esperado |
|---|------|--------------------|
| T1 | lookup con cédula correcta | `{ok:true, row:{...143 campos}}` |
| T2 | lookup con cédula incorrecta | `{ok:false, error:"La cédula no coincide..."}` |
| T3 | lookup con cédula vacía | `{ok:false, error:"Falta cédula del propietario."}` |
| T4 | lookup con numForm/apto erróneo | `{ok:false}` (comportamiento actual) |
| T5 | submit editMode con cédula correcta | `{ok:true, numForm, rowNumber}` (actualiza) |
| T6 | submit editMode con cédula incorrecta | `{ok:false, error:"La cédula no coincide..."}` (no escribe) |
| T7 | POST editMode directo sin cédula (ataque) | `{ok:false, error}` (no escribe) |
| T8 | Regresión mudanzas (`verificarPropietario`) | Sin cambios, sigue funcionando |

---

## 8. Riesgos y consideraciones

- **Regresión mudanzas/salón social:** `verificarPropietario` no se toca; solo se
  replica su criterio. Los flujos de mudanzas y salón social quedan intactos.
- **¿Quién edita?** El registro guarda UNA sola cédula de titular (`ccProp`, col 6). Si
  quien edita es el propietario, tenedor o inmobiliaria, todos usan la cédula del
  propietario registrado — coincide con la lógica actual de `verificarPropietario`.
- **Propietario sin su cédula a mano:** mismo criterio que mudanzas — contactar a la
  administración (`urb.cerroazul@gmail.com`).
- **Defensa en profundidad:** validar en lectura Y en escritura evita que un atacante
  salte el lookup y haga el POST de edición directamente.
- **`normalizarCC` vs `normCc`:** son distintas — `normalizarCC()` quita TODO lo que no
  sea dígito (`[^0-9]`); `normCc()` solo quita puntos/guiones/espacios. Para la cédula del
  propietario (numérica) usar **`normalizarCC()`** (la misma que usa `verificarPropietario`
  en mudanzas), tanto en lookup como en submitRecord, para consistencia.

---

## 9. Plan de despliegue

- **Alcance:** backend (`Código.gs`) + frontend (`index.html`, `js/app.js`). Backend-only
  en cuanto a Apps Script (1 sola versión nueva: **V33**).
- **Orden seguro:** primero push del frontend (GitHub Pages; el backend viejo ignora el
  `ccProp` extra → no rompe), luego deploy manual del backend V33.
- **Pruebas E2E obligatorias** (F6) antes de declarar listo, incluyendo los 8 casos de la
  sección 7 y una regresión de los portales públicos (formulario crear, mudanzas, salón,
  residente, estado de cuenta).
- **Re-login:** no aplica (el flujo de edición no usa token; la cédula se pide cada vez).

---

## 10. Decisiones propuestas (para tu aprobación)

1. **Validar en ambos puntos** (lectura + escritura) — recomendado por defensa en
   profundidad: así un atacante no puede saltar el lookup y hacer el POST directo.
2. **Mensaje de error:** usar el mismo texto que `verificarPropietario`
   ("La cédula no coincide con el propietario registrado. Verifique o contacte a la
   administración.") para mantener coherencia con mudanzas.
3. **Función de normalización:** `normalizarCC()` (solo dígitos), confirmado.
