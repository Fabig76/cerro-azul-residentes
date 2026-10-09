# Spec — Tipos de autorización para mudanza de elementos

**Versión:** 1.0.0
**Fecha:** 09-Oct-2026 COL
**Autor:** Hermes Agent
**Estado:** DRAFT — pendiente OK del operador
**Reemplaza:** spec-mudanzas.md (parcialmente, solo sección 3 y 4.3)

---

## 0. RESUMEN EJECUTIVO

Hoy el portal de mudanzas solo permite 2 tipos de autorización: "Salida del arrendatario actual" e "Ingreso del nuevo arrendatario". En la práctica, los residentes también necesitan mudanza de elementos (muebles, enseres, cajas) que no están asociados a un cambio de arrendatario.

**Cambio:** agregar 2 tipos nuevos:
- "Salida de elementos" (muebles que salen del apto)
- "Ingreso de elementos" (muebles que ingresan al apto)

Estos 2 tipos nuevos requieren un campo de descripción obligatoria con el detalle de los elementos. Los 2 tipos actuales (Salida/Ingreso de arrendatario) NO requieren descripción.

**No cambia:** el Sheet solo agrega 1 columna. La arquitectura de 3 torres, los slots de horario, la anticipación de 2 días, la cancelación con 24h, y el resto del flujo de mudanzas.

---

## 1. REGLAS DE NEGOCIO

### 1.1 Tipos válidos (4 totales)

| Tipo | Label visible | Descripción requerida | Uso |
|---|---|---|---|
| `Salida` | "Salida del arrendatario actual" | NO | Cambio de arrendatario (actual se va) |
| `Ingreso` | "Ingreso del nuevo arrendatario" | NO | Cambio de arrendatario (nuevo llega) |
| `SalidaElementos` | "Salida de elementos (muebles, enseres)" | **SÍ** | Muebles salen del apto, no cambia arrendatario |
| `IngresoElementos` | "Ingreso de elementos (muebles, enseres)" | **SÍ** | Muebles ingresan al apto, no cambia arrendatario |

### 1.2 Validación del campo descripción

- **Requerido** para los 2 tipos de elementos
- **Opcional/vacío** permitido para los 2 tipos de arrendatario
- **Mínimo:** 10 caracteres (para evitar "x", "1", etc.)
- **Máximo:** 500 caracteres (para evitar descripciones absurdas)
- **Trim:** se eliminan espacios al inicio y al final antes de validar
- **Limpieza:** NO se permite solo caracteres repetidos (ej: "aaaaaaa") — se valida con regex `/[a-zA-Záéíóúñ]{3,}/` para asegurar texto real

### 1.3 Otros aspectos NO cambian

- Anticipación: 2 días calendario
- Cancelación: hasta 24h antes
- Slots: L-V 4 franjas, Sáb 2 franjas
- Torres: 1, 2, 3 con ascensor A
- Mora: se sigue validando
- Cédula: se sigue validando con verificarPropietario
- Emails: se siguen enviando a admin y residente

---

## 2. CAMBIOS AL GOOGLE SHEET (pestaña Mudanzas)

### 2.1 Estructura nueva (20 columnas)

**IMPORTANTE:** la nueva columna se agrega AL FINAL, no entre las existentes. Esto evita reordenar 17 constantes COL_MUD_* y reduce el riesgo de regresión.

```
| Col | Idx | Campo              | Tipo    | Notas |
|-----|-----|--------------------|---------|-------|
| A   | 0   | ID reserva         | str     | MD-XXXX |
| B   | 1   | NumForm            | str     | link a Registros col A |
| C   | 2   | N° Apto            | str     | link a Registros col D |
| D   | 3   | TipoMudanza        | str     | "Salida" | "Ingreso" | "SalidaElementos" | "IngresoElementos" |
| E   | 4   | Torre              | int     | 1 | 2 | 3 (sin cambios) |
| F   | 5   | Ascensor           | str     | siempre "A" (sin cambios) |
| G   | 6   | Fecha mudanza      | date    | YYYY-MM-DD (sin cambios) |
| H   | 7   | Hora inicio        | str     | HH:MM (sin cambios) |
| I   | 8   | Hora fin           | str     | HH:MM (sin cambios) |
| J   | 9   | Nombre propietario | str     | denormalizado (sin cambios) |
| K   | 10  | CC propietario     | str     | denormalizado (sin cambios) |
| L   | 11  | Celular contacto   | str     | denormalizado (sin cambios) |
| M   | 12  | Correo notificación | str   | denormalizado (sin cambios) |
| N   | 13  | Empresa mudanza    | str     | input usuario (sin cambios) |
| O   | 14  | Placa vehículo     | str     | input usuario (sin cambios) |
| P   | 15  | Observaciones      | str     | input usuario (sin cambios) |
| Q   | 16  | Fecha reserva      | datetime | server-side (sin cambios) |
| R   | 17  | Estado             | str     | Confirmada | Cancelada | Completada (sin cambios) |
| S   | 18  | Hash dedupe        | str     | sha256[:16] (sin cambios) |
| T   | 19  | DescripcionElementos | str  | NUEVA. Vacía para tipos de arrendatario, requerida para tipos de elementos |
```

**Cambio de constantes backend:**
```javascript
// ANTES (V36)
const MUDANZAS_NUM_COLS = 19;

// DESPUÉS (V37)
const MUDANZAS_NUM_COLS = 20;  // +1 columna
const COL_MUD_DESCRIPCION = 19;  // NUEVA, al final
// (No se mueven las constantes COL_MUD_* existentes)
```

### 2.2 Migración de registros existentes

- Registros existentes con 19 columnas: la nueva col E queda vacía.
- Esto es válido: el Sheet acepta filas con diferente número de celdas.
- No requiere script de migración.
- El backend debe seguir aceptando leer la col E aunque esté vacía.

### 2.3 Hash dedupe (col T)

- El hash se calcula con: sha256(torre + ascensor + fecha + horaInicio)
- NO cambia con el nuevo campo de descripción
- Esto evita duplicados accidentales

---

## 3. CAMBIOS AL BACKEND (Codigo.gs)

### 3.1 Constantes

```javascript
const TIPOS_MUDANZA_VALIDOS = ['Salida', 'Ingreso', 'SalidaElementos', 'IngresoElementos'];
const TIPOS_MUDANZA_ARRENDATARIO = ['Salida', 'Ingreso'];
const TIPOS_MUDANZA_ELEMENTOS = ['SalidaElementos', 'IngresoElementos'];
const DESCRIPCION_MIN_LENGTH = 10;
const DESCRIPCION_MAX_LENGTH = 500;
```

### 3.2 Nueva constante de columna

```javascript
// En la sección de constantes de columnas de Mudanzas
const COL_MUD_DESCRIPCION = 4;  // antes: COL_MUD_TORRE = 4, ahora 5
// (Esto requiere reorganizar las constantes existentes)
```

**CUIDADO:** Las constantes `COL_MUD_TORRE` y todas las posteriores deben incrementarse en 1. Esto requiere:

- Buscar todas las referencias a constantes COL_MUD_*
- Moverlas 1 posición
- Verificar que el buildRowFromPayload y los reads coincidan

### 3.3 Cambios en `reservarMudanza()` (línea 1113)

```javascript
// ANTES (V36)
const tipoMudanza = String(data.tipoMudanza || '').trim();
if (!['Salida', 'Ingreso'].includes(tipoMudanza)) {
  return { ok: false, error: 'Tipo de mudanza inválido...' };
}

// DESPUÉS (V37)
const tipoMudanza = String(data.tipoMudanza || '').trim();
const descripcionElementos = String(data.descripcionElementos || '').trim();

if (!TIPOS_MUDANZA_VALIDOS.includes(tipoMudanza)) {
  return { ok: false, error: 'Tipo de mudanza inválido. Opciones: Salida, Ingreso, SalidaElementos, IngresoElementos.' };
}

// Validar descripción: requerida para tipos de elementos
if (TIPOS_MUDANZA_ELEMENTOS.includes(tipoMudanza)) {
  if (descripcionElementos.length < DESCRIPCION_MIN_LENGTH) {
    return { ok: false, error: 'Para mudanza de elementos debe describir los elementos. Mínimo ' + DESCRIPCION_MIN_LENGTH + ' caracteres.' };
  }
  if (descripcionElementos.length > DESCRIPCION_MAX_LENGTH) {
    return { ok: false, error: 'La descripción no puede superar ' + DESCRIPCION_MAX_LENGTH + ' caracteres.' };
  }
  if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,}/.test(descripcionElementos)) {
    return { ok: false, error: 'La descripción debe contener texto real, no solo números o caracteres repetidos.' };
  }
}
```

### 3.4 Cambios en `getMudanzasSheet()` (línea 845)

La función que crea la pestaña "Mudanzas" debe agregar la nueva columna. Si la pestaña ya existe con 19 columnas, debe expandirla a 20:

```javascript
function getMudanzasSheet() {
  // ... código existente ...
  if (sheet.getLastColumn() < 20) {
    // Expandir a 20 columnas
    sheet.insertColumnAfter(sheet.getLastColumn());
    // O bien, usar updateSheetProperties con gridProperties.columnCount
  }
  // Headers actualizados
  const headers = ['ID reserva', 'NumForm', 'N° Apto', 'TipoMudanza',
                   'DescripcionElementos',  // NUEVO
                   'Torre', 'Ascensor', ...];
}
```

### 3.5 Cambios en `adminListarReservasMudanzas()` (línea 959)

Debe devolver `descripcionElementos` en el objeto de cada reserva para que el admin la pueda ver.

```javascript
resultados.push({
  id: ...,
  numForm: ...,
  tipoMudanza: ...,
  descripcionElementos: String(row[COL_MUD_DESCRIPCION] || ''),  // NUEVO
  // ... resto ...
});
```

### 3.6 Cambios en `vigilanteVerMudanzas()` (línea 1803)

Debe devolver `descripcionElementos` para que el vigilante la vea en la card.

```javascript
resultados.push({
  idReserva: ...,
  tipoMudanza: ...,
  descripcionElementos: String(row[COL_MUD_DESCRIPCION] || ''),  // NUEVO
  // ... resto ...
});
```

### 3.7 Cambios en `findReservasEnRango()` (helper)

Si existe, debe seguir funcionando (no necesita cambios porque consulta por torre/ascensor/fecha, no por descripción).

### 3.8 Cambios en `cancelarMudanza()`

NO requiere cambios. La cancelación es por idReserva, no por tipo.

---

## 4. CAMBIOS AL FRONTEND (index.html)

### 4.1 Paso 1: Tipo de autorización (líneas 617-624)

**ANTES:**
```html
<label class="radio-row">
  <input type="radio" name="mudTipo" value="Salida" required>
  <strong>Salida</strong> del arrendatario actual
</label>
<label class="radio-row">
  <input type="radio" name="mudTipo" value="Ingreso" required>
  <strong>Ingreso</strong> del nuevo arrendatario
</label>
```

**DESPUÉS:**
```html
<label class="radio-row">
  <input type="radio" name="mudTipo" value="Salida" required>
  <strong>Salida</strong> del arrendatario actual
</label>
<label class="radio-row">
  <input type="radio" name="mudTipo" value="Ingreso" required>
  <strong>Ingreso</strong> del nuevo arrendatario
</label>
<label class="radio-row">
  <input type="radio" name="mudTipo" value="SalidaElementos" required>
  <strong>Salida de elementos</strong> (muebles, enseres)
</label>
<label class="radio-row">
  <input type="radio" name="mudTipo" value="IngresoElementos" required>
  <strong>Ingreso de elementos</strong> (muebles, enseres)
</label>
```

### 4.2 Nuevo paso 1.5: Descripción de elementos (condicional)

Insertar DESPUÉS del paso de tipo y ANTES del paso de torre:

```html
<div class="paso" id="pasoDescripcion" style="display:none;">
  <div class="paso-head">
    <span><span class="section-num">1.5</span>Descripción de elementos</span>
  </div>
  <div class="paso-body">
    <div class="field">
      <label>Describa los elementos que van a salir/ingresar <span class="req">*</span></label>
      <textarea id="mudDescripcion" rows="4" maxlength="500" 
        placeholder="Ej: 1 sofá, 2 cajas con ropa, 1 cama matrimonial, 1 nevera..."></textarea>
      <small class="help">Mínimo 10 caracteres. La portería revisará que lo que salga/ingrese coincida con esta descripción.</small>
    </div>
  </div>
</div>
```

### 4.3 NO cambia

- Paso 2 (Torre y ascensor)
- Paso 3 (Fecha y hora)
- Paso 4 (Datos opcionales: empresa, placa, observaciones)
- Botón de envío

---

## 5. CAMBIOS AL FRONTEND (js/app.js)

### 5.1 Cambio en `getTipo()` y mensajes contextuales

**ANTES (líneas 884-892):**
```javascript
if (tipo === 'Salida') { ... mensaje ... }
else if (tipo === 'Ingreso') { ... mensaje ... }
else { ... ocultar ... }
```

**DESPUÉS:**
```javascript
if (tipo === 'Salida') {
  msg.innerHTML = '⚠️ <strong>Salida del arrendatario actual.</strong> ...';
} else if (tipo === 'Ingreso') {
  msg.innerHTML = '⚠️ <strong>Ingreso del nuevo arrendatario.</strong> ...';
} else if (tipo === 'SalidaElementos') {
  msg.innerHTML = '📦 <strong>Salida de elementos.</strong> Describa los muebles o enseres que van a salir del apartamento. La portería revisará que coincida con su declaración.';
} else if (tipo === 'IngresoElementos') {
  msg.innerHTML = '📦 <strong>Ingreso de elementos.</strong> Describa los muebles o enseres que van a ingresar al apartamento. La portería revisará que coincida con su declaración.';
} else {
  msg.classList.add('hidden');
}
```

### 5.2 Mostrar/ocultar campo descripción

```javascript
// En el listener del cambio de tipo
const tipo = this.getTipo();
const pasoDesc = $('#pasoDescripcion');
if (tipo === 'SalidaElementos' || tipo === 'IngresoElementos') {
  pasoDesc.style.display = 'block';
  $('#mudDescripcion').setAttribute('required', 'required');
} else {
  pasoDesc.style.display = 'none';
  $('#mudDescripcion').removeAttribute('required');
  $('#mudDescripcion').value = '';
}
```

### 5.3 Validación antes de enviar

```javascript
// En la función de envío, antes del fetch
const descripcion = $('#mudDescripcion').value.trim();
const tipo = this.getTipo();
if ((tipo === 'SalidaElementos' || tipo === 'IngresoElementos') &&
    descripcion.length < 10) {
  showAlert('alert-mud-form', 'Describa los elementos (mínimo 10 caracteres).', 'err');
  return;
}

// En el payload
const payload = {
  // ... otros campos ...
  tipoMudanza: tipo,
  descripcionElementos: descripcion,
};
```

---

## 6. CAMBIOS AL FRONTEND (js/vigilantes.js)

### 6.1 Color según tipo (línea 353-354)

**ANTES:**
```javascript
html += '<span style="color:' + (m.tipoMudanza === 'Ingreso' ? '#2E7D32' : '#C62828') + ';">';
```

**DESPUÉS:**
```javascript
const colorPorTipo = {
  'Ingreso': '#2E7D32',
  'IngresoElementos': '#1565C0',
  'Salida': '#C62828',
  'SalidaElementos': '#E65100'
};
const color = colorPorTipo[m.tipoMudanza] || '#666';
html += '<span style="color:' + color + ';">';
```

### 6.2 Mostrar descripción de elementos (NUEVO)

Después del bloque que muestra tipo/propietario/apto/torre:

```javascript
// Si hay descripción (tipo de elementos), mostrarla
if (m.descripcionElementos) {
  html += '<div style="margin-top:8px; padding:8px; background:#FFF8E1; border-left:3px solid #F9A825; font-size:0.88em;">';
  html += '<strong>📦 Elementos declarados:</strong><br>';
  html += V.escapeHtml(m.descripcionElementos);
  html += '</div>';
}
```

---

## 7. CAMBIOS AL FRONTEND (js/admin.js)

### 7.1 Mostrar descripción en la tabla de admin (línea ~643)

Agregar una nueva columna o expandir la celda existente:

```javascript
// En el bucle que construye cada fila
html += '<td>' + res.tipoMudanza;
if (res.descripcionElementos) {
  html += '<br><small style="color:var(--gris-med); font-style:italic;">📦 ' +
          V.escapeHtml(res.descripcionElementos.substring(0, 50)) +
          (res.descripcionElementos.length > 50 ? '...' : '') + '</small>';
}
html += '</td>';
```

---

## 8. PLAN DE DEPLOY

### 8.1 Orden de ejecución

1. **Backend** (Codigo.gs):
   - Aplicar cambios al Codigo_V35 del repo
   - Subir a Drive como Codigo_V37_MUDANZAS_ELEMENTOS_20261009.gs
   - Operador copia-pega a Apps Script y crea nueva versión

2. **Frontend** (index.html, app.js, admin.js, vigilantes.js):
   - Aplicar cambios al repo
   - Commit + push
   - GitHub Pages publica automáticamente

3. **Sheet** (pestaña Mudanzas):
   - Se actualiza automáticamente cuando el operador ejecute `getMudanzasSheet()` por primera vez tras el deploy
   - O bien, el operador puede insertar la columna E manualmente

### 8.2 Versiones resultantes

- Backend: `Codigo_V37_MUDANZAS_ELEMENTOS_20261009.gs` (basado en V36_ENCARGADO)
- Frontend: commit en el repo

### 8.3 Reversa

- Backend: `git revert` del commit + restaurar Apps Script a V36_ENCARGADO
- Frontend: `git revert` del commit

---

## 9. PRUEBAS DE ACEPTACIÓN

### 9.1 Backend

- [ ] Reservar mudanza tipo "Salida" sin descripción → OK
- [ ] Reservar mudanza tipo "Ingreso" sin descripción → OK
- [ ] Reservar mudanza tipo "SalidaElementos" sin descripción → RECHAZA
- [ ] Reservar mudanza tipo "SalidaElementos" con descripción de 5 chars → RECHAZA
- [ ] Reservar mudanza tipo "SalidaElementos" con descripción "aaaaaaaaaa" → RECHAZA (no tiene texto real)
- [ ] Reservar mudanza tipo "SalidaElementos" con descripción "1 sofá, 2 cajas" → OK
- [ ] Reservar mudanza tipo "SalidaElementos" con descripción de 600 chars → RECHAZA

### 9.2 Frontend

- [ ] Seleccionar "Salida de elementos" → aparece campo descripción
- [ ] Seleccionar "Ingreso del arrendatario" → desaparece campo descripción
- [ ] Enviar sin descripción cuando es tipo elementos → muestra error
- [ ] El textarea tiene maxlength=500 y contador visible

### 9.3 Vigilante

- [ ] Ver una reserva tipo elementos → muestra la descripción
- [ ] Ver una reserva tipo arrendatario → NO muestra la descripción
- [ ] El color es diferente para cada uno de los 4 tipos

### 9.4 Sheet

- [ ] El Sheet tiene 20 columnas (no 19)
- [ ] Las reservas existentes siguen mostrando solo 19 cols (sin descripción)
- [ ] Las reservas nuevas con elementos tienen la descripción en col E
- [ ] La col E está vacía para reservas con tipo "Salida" o "Ingreso" antiguas

---

## 10. RIESGOS Y MITIGACIÓN

| Riesgo | Mitigación |
|---|---|
| Constantes COL_MUD_* desalineadas al insertar columna | Verificar TODAS las referencias con grep antes de commit |
| Descripción vacía aceptada en tipos elementos | Validación en frontend Y backend (defense in depth) |
| Reservas existentes se rompen al cambiar esquema | La nueva col E queda vacía, no rompe nada |
| Caracteres especiales en la descripción rompen el Sheet | Aplicar sanitizarCelda_ (de BUGFIX-001) si existe |
| Email al admin/residente no menciona el tipo elementos | El email sigue funcionando, solo se agrega el campo |

---

## 11. PREGUNTAS PARA EL OPERADOR

1. ¿Mínimo 10 caracteres para la descripción? ¿O prefieres otro número (5, 20)?
2. ¿Máximo 500 caracteres? ¿O prefieres otro (200, 1000)?
3. ¿El email al admin/residente debe incluir la descripción en el cuerpo? ¿O lo dejamos sin cambios?
4. ¿Algún otro requisito que no esté en este spec?