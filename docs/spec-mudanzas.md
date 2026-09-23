# SPEC — Sistema de Agendamiento de Mudanzas
## Urbanización Cerro Azul — Módulo del formulario público de residentes

**Versión:** 1.0.0 (draft para revisión)
**Fecha:** 2026-09-22 COL
**Autor:** Hermes Agent
**Estado:** PENDIENTE OK del operador antes de implementar

---

## 0. RESUMEN EJECUTIVO

Agregar al formulario público de Cerro Azul (https://fabig76.github.io/cerro-azul-residentes/)
una tercera pestaña "Agendar mudanza" que permita a los propietarios —o a las
inmobiliarias que los representan— reservar uno de los 3 ascensores destinados
a mudanzas (1 por torre) en franjas de 2 horas, con al menos 48 horas de
anticipación.

El sistema NO modifica las 143 columnas existentes. Agrega una pestaña nueva
`Mudanzas` al Sheet y 3 endpoints nuevos al Apps Script. El login es el mismo
CA-XXXX + N° apto + cédula del propietario (3 campos, más estricto que el
"Editar mi registro" actual).

---

## 1. REGLAS DE NEGOCIO (CONFIRMADAS CON EL OPERADOR)

| Regla | Valor |
|---|---|
| Torres | 3 (1, 2, 3) |
| Ascensores totales por torre | 2 (A y B) |
| Ascensor habilitado para mudanzas | **solo A** (B bloqueado 100%) |
| Slots Lunes a Viernes | 08:00-10:00 / 10:00-12:00 / 13:00-15:00 / 15:00-17:00 (4 slots de 2h) |
| Slots Sábado | 08:00-10:00 / 10:00-12:00 (2 slots, solo mañana) |
| Domingo y festivos | NO disponible (validación solo con mensaje al usuario, sin rechazo automático) |
| Anticipación mínima | 2 días calendario completos (no se puede agendar para mañana) |
| Cancelación permitida | hasta 24 horas antes de la mudanza |
| Límite de reservas por residente | sin límite |
| Campos obligatorios | solo Torre + Fecha + Slot |
| Campos opcionales | Empresa mudanza, Placa vehículo, Observaciones |
| Tipo de autorización | Salida del arrendatario actual / Ingreso del nuevo arrendatario |
| Autorizado a agendar | propietario del inmueble o inmobiliaria (con cédula del dueño archivada) |
| Notificaciones | email al admin (urb.cerroazul@gmail.com) + email al residente (correo del Sheet col H) |

---

## 2. ARQUITECTURA (4 CAPAS)

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Pages (Fabig76/cerro-azul-residentes)              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ index.html  →  nueva pestaña "Agendar mudanza"         │ │
│  │ js/app.js   →  módulo mudanzas (login + form + lista)  │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │  POST/GET (text/plain, sin preflight)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Apps Script Web App (urb.cerroazul@gmail.com)             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Código.gs                                               │ │
│  │   doGet  → action=verificarPropietario                  │ │
│  │         → action=dispMudanzas                           │ │
│  │   doPost → action=reservarMudanza                       │ │
│  │         → action=cancelarMudanza                        │ │
│  │   LockService.getDocumentLock()  ← concurrencia         │ │
│  │   MailApp.sendEmail()             ← notificaciones      │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │  Sheets API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Google Sheets                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Base datos Cerro azul fomato (16gxeA...upytPc)          │ │
│  │   • Registros (143 cols, INTOCAS)                       │ │
│  │   • Maestros  (INTOCAS)                                 │ │
│  │   • Mudanzas  (NUEVA, 19 cols)                          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

NO se agregan servicios externos. NO se cambia el stack. NO se migra el Sheet.

---

## 3. ESQUEMA DE LA PESTAÑA `Mudanzas` (NUEVA, 19 COLUMNAS)

| Col | Index | Campo | Tipo | Origen |
|---|---|---|---|---|
| A | 0 | ID reserva | str | generado server-side: MD-0001, MD-0002… |
| B | 1 | NumForm | str | link a Registros col A |
| C | 2 | N° Apto | str | link a Registros col D |
| D | 3 | TipoMudanza | str | "Salida" \| "Ingreso" (input usuario) |
| E | 4 | Torre | int | 1 \| 2 \| 3 (input usuario) |
| F | 5 | Ascensor | str | siempre "A" (forzado) |
| G | 6 | Fecha mudanza | date | YYYY-MM-DD (input usuario) |
| H | 7 | Hora inicio | str | HH:MM (del slot seleccionado) |
| I | 8 | Hora fin | str | HH:MM (del slot seleccionado) |
| J | 9 | Nombre propietario | str | denormalizado desde Registros v[5] |
| K | 10 | CC propietario | str | denormalizado desde Registros v[6] (validado) |
| L | 11 | Celular contacto | str | denormalizado desde Registros v[8] |
| M | 12 | Correo notificación | str | denormalizado desde Registros v[7] |
| N | 13 | Empresa mudanza | str | input usuario (opcional) |
| O | 14 | Placa vehículo | str | input usuario (opcional) |
| P | 15 | Observaciones | str | input usuario (opcional) |
| Q | 16 | Fecha reserva | datetime | server-side, America/Bogota |
| R | 17 | Estado | str | "Confirmada" \| "Cancelada" \| "Completada" |
| S | 18 | Hash dedupe | str | sha256[:16] de (torre,ascensor,fecha,hora) |

**Total: 19 columnas** (no 17 ni 20). Verificar contra cálculo al codear.

**Fila de encabezados (fila 1):** texto exacto en MAYÚSCULAS, color de fondo
celeste claro, en negrita — mismo patrón que `Registros` y `Maestros`.

---

## 4. ENDPOINTS NUEVOS EN `Código.gs`

### 4.1 GET `?action=verificarPropietario`

```
Input:    ?numForm=CA-0001&apto=201&ccProp=1234567890
Validaciones:
  1. numForm existe en Registros col A  → si no: 404
  2. apto coincide con Registros col D del mismo numForm → si no: 404
  3. v[4] (Diligencia como) == "Propietario" | "Inmobiliaria"
     · si es "Arrendatario" o "Tenedor-Otro": RECHAZA con mensaje específico
  4. v[6] (CC propietario) == ccProp (normalizado: trim, sin puntos/guiones)
     · si no coincide: RECHAZA con mensaje "la cédula no coincide"
Output OK:  {ok:true, diligencia, nombreProp, correoProp, celProp, ccProp, apto}
Output ERR: {ok:false, error: "..."}
```

### 4.2 GET `?action=dispMudanzas`

```
Input:    ?torre=1&ascensor=A&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
Salida:   {ok:true, slots: [
            {fecha: "2026-09-25", horaInicio: "08:00", horaFin: "10:00",
             disponible: true,  idReserva: null},
            {fecha: "2026-09-25", horaInicio: "10:00", horaFin: "12:00",
             disponible: false, idReserva: "MD-0012"},
            ...
          ]}

Algoritmo:
  1. Genera todos los slots teóricos desde `desde` hasta `hasta`:
     · L-V: 08-10, 10-12, 13-15, 15-17
     · Sábado: 08-10, 10-12
     · Domingo: omitir
  2. Para cada slot, consulta Mudanzas col E (torre), F (ascensor),
     G (fecha), H (hora inicio), R (estado)
     · Si Estado == "Confirmada" y campos coinciden → disponible:false
  3. Excluye slots con fecha < hoy + 2 días (anticipación 48h)
  4. Retorna lista completa (incluyendo no disponibles, frontend los renderiza tachados)
```

### 4.3 POST `action=reservarMudanza`

```
Input JSON: {
  numForm, apto, ccProp,                      // verificación (re-validar server-side)
  tipoMudanza,                                // "Salida" | "Ingreso"
  torre, ascensor, fecha, horaInicio, horaFin,
  empresa?, placa?, observaciones?
}
Validaciones (todas server-side, en orden):
  1. verificarPropietario (mismo flujo que 4.1)
  2. torre ∈ {1,2,3}, ascensor == "A" (único permitido)
  3. tipoMudanza ∈ {"Salida","Ingreso"}
  4. fecha es fecha válida futura ≥ hoy + 2 días calendario
  5. horaInicio/horaFin ∈ slots predefinidos (no cualquier hora)
  6. NO existe ya reserva "Confirmada" para (torre, ascensor, fecha, horaInicio)
     · consulta dentro de LockService.getDocumentLock().waitLock(30s)
  7. email del residente (Registros v[7]) es válido (contiene @)
Si todo OK:
  · genera ID reserva MD-XXXX (correlativo, igual patrón que CA-XXXX)
  · escribe fila en Mudanzas
  · envía email al admin (urb.cerroazul@gmail.com)
  · envía email al residente (correo del Sheet)
  · retorna {ok:true, idReserva, fecha, horaInicio, horaFin, torre}
Si falla validación:
  · libera lock
  · retorna {ok:false, error: "..."} con mensaje específico
```

### 4.4 POST `action=cancelarMudanza`

```
Input JSON: {idReserva, numForm, apto, ccProp}
Validaciones:
  1. verificarPropietario (mismo numForm/apto/ccProp)
  2. Reserva existe en Mudanzas con idReserva
  3. Reserva.col R (Estado) == "Confirmada"
  4. fecha mudanza ≥ hoy + 1 día (24h anticipación)
  5. numForm/apto de la reserva coinciden con input
Si OK:
  · Marca Estado = "Cancelada" (NO borra fila)
  · Envía email al admin
  · Envía email al residente
  · Retorna {ok:true}
```

---

## 5. CONSTANTES NUEVAS EN `Código.gs`

```javascript
// Pestaña nueva (la crea el operador manualmente desde la UI de Sheets)
const MUDANZAS_SHEET_NAME = 'Mudanzas';
const MUDANZAS_NUM_COLS = 19;

// Slots (hardcoded, NO se consultan de Sheet)
const SLOTS_LUN_VIE = [
  ['08:00', '10:00'],
  ['10:00', '12:00'],
  ['13:00', '15:00'],
  ['15:00', '17:00']
];
const SLOTS_SABADO = [
  ['08:00', '10:00'],
  ['10:00', '12:00']
];
const SLOTS_DOMINGO = [];

// Email del admin
const ADMIN_EMAIL = 'urb.cerroazul@gmail.com';

// Lock timeout (ms)
const LOCK_TIMEOUT_MS = 30000;
```

---

## 6. CAMBIOS EN EL FRONTEND

### 6.1 `index.html`

Agregar al `mode-switcher`:

```html
<button data-mode="mudanzas">Agendar mudanza</button>
```

Agregar contenedor (oculto por default):

```html
<div id="modo-mudanzas" class="modo-container" hidden>
  <!-- 3 vistas internas: login / formulario / mis-reservas -->
</div>
```

### 6.2 `js/app.js`

Nuevo módulo `mudanzas.js` (mismo archivo o separado — separar es más limpio):

```javascript
const M = {
  init(),          // bind eventos al mode-switcher
  login(),         // paso 1: verificar CA-XXXX + apto + CC
  renderForm(),    // paso 2: calendario + slots + opcionales
  loadDisponibilidad(),  // GET dispMudanzas para los próximos 60 días
  submitReserva(), // POST reservarMudanza
  cancelReserva(), // POST cancelarMudanza
  renderMisReservas(), // lista las reservas del numForm
  showFestivoWarning(), // mensaje emergente NO bloqueante
};
```

### 6.3 Flujo del usuario

1. Click "Agendar mudanza" → muestra Paso 1 (login)
2. Llena CA-XXXX + apto + CC → click "Verificar"
3. Backend valida, frontend muestra Paso 2 (formulario completo)
4. Selecciona tipo (Salida/Ingreso) → mensaje contextual amarillo
5. Selecciona torre → calendario
6. Click en un día del calendario → mensaje emergente sobre festivos (NO bloqueante)
7. Selecciona slot → campos opcionales → "Confirmar reserva"
8. Backend reserva, envía emails, muestra confirmación con MD-XXXX
9. Botón "Ver mis reservas" → lista todas las reservas del numForm

---

## 7. ANÁLISIS DE IMPACTO — ELEMENTOS AFECTADOS

### 7.1 Lo que se TOCA

| Elemento | Tipo de cambio | Riesgo |
|---|---|---|
| `apps-script/Código.gs` | agregar 4 funciones + constantes | BAJO si se appendea al final |
| Sheet `Mudanzas` | crear pestaña nueva con 19 cols | BAJO (no toca Registros/Maestros) |
| `index.html` | agregar 1 botón + 1 div | BAJO |
| `js/app.js` | agregar módulo mudanzas | BAJO si se encapsula bien |
| `GUIA-PROYECTO.md` | agregar sección §15 "Mudanzas" | BAJO |
| Email templates | nuevos textos para admin/residente | BAJO |

### 7.2 Lo que se MANTIENE INTOCABLE

| Elemento | Por qué |
|---|---|
| 143 columnas de `Registros` | ya validadas en producción (CA-0001 intacto) |
| Pestaña `Maestros` | no requerida para mudanzas |
| Sheet de matrículas `1ceGtZDUJHX4yxs5_ydDwLwtrkOcZwYh09WUG0st_b0Y` | no se usa en mudanzas |
| Endpoint `nextId` | ya devuelve CA-XXXX, MD-XXXX necesita su propio contador |
| Endpoint `lookup` | se reutiliza para verificar Propietario (paso 1) |
| Hash dedupe de Registros | solo aplica a Registros |
| `Apps Script Web App URL v2` | sigue siendo la misma `/exec` |

### 7.3 Conflictos / colisiones detectadas

| Conflicto potencial | Mitigación |
|---|---|
| ID reserva MD-XXXX vs numForm CA-XXXX | prefijos distintos, contadores separados |
| LockService afecta TODOS los doPost | documentar que submit (form) y reservarMudanza usan el mismo lock — riesgo de timeout si hay carga |
| Email al residente rebota (casilla llena) | usar copia oculta al admin; si falla MailApp, loggear y continuar |
| CC propietario cambia en Sheet (mudanza vende el apto) | la reserva queda con el CC viejo — agregar nota en confirmación |
| Festivos: si lo escriben en código, requiere redeploy cada año | POR ESO se eligió solo mensaje emergente (sin validación automática) |
| Sheet nuevo `Mudanzas` sin headers | crear manualmente desde UI de Sheets, NO programáticamente |
| Primera carga de Apps Script lenta (~5-15s) | ya documentado en pitfall del skill |

---

## 8. ANÁLISIS DE CONTINGENCIAS

### C8.1 Concurrencia: dos residentes reservan el mismo slot al mismo tiempo

**Probabilidad:** MEDIA (slots L-V son 4/día × 3 torres = 12 slots/día)
**Impacto si ocurre:** ALTO (doble reserva del mismo ascensor/horario)
**Mitigación implementada:**
1. `LockService.getDocumentLock()` con `waitLock(30000)` antes de escribir
2. Re-validación del slot dentro del lock (no se confía en el GET previo)
3. Mensaje claro si falla: "Otro residente acaba de reservar este horario.
   Por favor seleccione otro."
**Probabilidad residual:** MUY BAJA (1 en 100k reservas aprox)

### C8.2 Deploy de Apps Script mata el App Password de Cerro Azul pagos

**Probabilidad:** ALTA (ya pasó el 5-Sep-2026)
**Impacto si ocurre:** MEDIO (cron de pagos falla, se nota en 1h)
**Mitigación:**
1. Antes del deploy, ROTAR preventivamente el App Password de Cerro Azul pagos
2. Después del deploy, verificar el cron de pagos en los siguientes 30 min
3. Si falla, regenerar App Password con la nueva contraseña
**Acción previa requerida del operador:** OK para que yo coordine la rotación

### C8.3 Email al residente rebota (casilla llena, email mal escrito, etc.)

**Probabilidad:** MEDIA (1-2% de los registros pueden tener correo inválido)
**Impacto si ocurre:** BAJO (la reserva queda en Sheet, admin la ve)
**Mitigación:**
1. Email al admin va SIN copia oculta — admin tiene el dato
2. Si MailApp lanza error, loggear con `console.error` y continuar
3. El CC del propietario viene del Sheet — confiamos en que fue validado al crear
**No-bloqueante:** la reserva se confirma aunque el email falle

### C8.4 Cambio de propietario (venta del apto) entre crear CA-XXXX y agendar mudanza

**Probabilidad:** BAJA
**Impacto si ocurre:** BAJO (quien tenía el CA-XXXX puede seguir agendando)
**Mitigación:**
1. El admin debe manualmente invalidar el CA-XXXX del vendedor
2. El comprador debe crear un nuevo registro con su propio CA-XXXX
3. NO hay mitigación automática — flujo administrativo

### C8.5 Festivo en día de mudanza reservado

**Probabilidad:** MEDIA (~18 festivos/año)
**Impacto si ocurre:** BAJO (la reserva queda en Sheet, vigilancia no permite ingreso)
**Mitigación:**
1. Mensaje emergente al usuario al seleccionar fecha (NO bloqueante)
2. Admin puede cancelar manualmente desde Sheet si recibe queja
3. **No rechazamos automáticamente** — la decisión es del usuario

### C8.6 Reserva con menos de 48h de anticipación (intento de borde)

**Probabilidad:** MEDIA
**Impacto si ocurre:** NINGUNO (rechazado por backend)
**Mitigación:**
1. Backend valida `fecha >= hoy + 2 días calendario`
2. Frontend muestra mensaje específico: "Las mudanzas deben agendarse
   con al menos 2 días calendario de anticipación"
3. Slots con < 48h se renderizan en gris en el calendario

### C8.7 Usuario borra accidentalmente el correo del Sheet

**Probabilidad:** MUY BAJA
**Impacto si ocurre:** BAJO (email de confirmación falla, admin notifica por WhatsApp)
**Mitigación:**
1. Email al admin es siempre primero (garantía de que admin se entera)
2. Frontend muestra: "Su reserva está confirmada. Si no recibe email,
   contacte a administración."

### C8.8 Backend tira error 500 o timeout

**Probabilidad:** BAJA
**Impacto si ocurre:** MEDIO (usuario ve error genérico)
**Mitigación:**
1. Frontend muestra mensaje: "No pudimos procesar su reserva. Intente
   nuevamente en unos minutos."
2. No se duplican reservas porque el LockService garantiza atomicidad
3. Admin revisa logs de Apps Script si el error persiste

### C8.9 Cambio de URL del Web App (nueva implementación, no nueva versión)

**Probabilidad:** MUY BAJA (solo si se hace redeploy con breaking change)
**Impacto si ocurre:** ALTO (frontend queda desconectado)
**Mitigación:** NO se planea redeploy con breaking change.
Si en el futuro se necesita, seguir el procedimiento P7 documentado.

### C8.10 LockService.getDocumentLock() retorna null (FIX 23-Sep-2026)

**Probabilidad:** 100% (era reproducible en cada intento de reserva)
**Impacto si ocurre:** ALTO (reservar/cancelar totalmente bloqueadas)
**Síntoma:** "Cannot read properties of null (reading 'tryLock')"
**Causa raíz:** El script se ejecuta en modo "Ejecutar como: Yo" pero
los `DocumentLock` están vinculados al owner, y en algunos contextos
el Web App /exec entrega null en lugar del lock.
**Mitigación implementada:** Cambiar a `LockService.getScriptLock()` que
es independiente del documento y funciona siempre.
**Resuelto en:** commit `5ad6fbf` (rama feature/mudanzas)
**Requiere deploy:** V4 de Apps Script
**Probabilidad residual:** NULA (getScriptLock siempre retorna un lock válido)

### C8.11 Sheets auto-convierte celdas HH:MM a Date (FIX 23-Sept-2026)

**Probabilidad:** 100% (sucede siempre al guardar horas como string "08:00")
**Impacto si ocurre:** MEDIO (la reserva se crea pero dispMudanzas no la detecta)
**Síntoma:** La fila existe en el Sheet pero el slot sigue apareciendo
`disponible: true` en dispMudanzas.
**Causa raíz:** Sheets detecta que "08:00" tiene formato de hora y lo
guarda como tipo TIME (numberValue ~0.333). Apps Script auto-convierte
esas celdas a Date objects. El matching `String === String` falla porque
un lado es Date y el otro String.
**Mitigación implementada:** Nueva función `normalizarHora(h)` que
convierte Date → "HH:MM" string, o paddea strings "8:00" → "08:00".
Usada en `findReservasEnRango()` y `cancelarMudanza()`.
**Resuelto en:** commit `e525b21` (rama feature/mudanzas)
**Requiere deploy:** V5 de Apps Script
**Probabilidad residual:** NULA (la normalización funciona siempre)

### C8.12 Endpoint lookup retorna row vacío por pasar OBJETO en lugar de ARRAY (FIX 23-Sept-2026)

**Probabilidad:** 100% (bug desde commit inicial eecbf63 del 5-Sept-2026)
**Impacto si ocurre:** ALTO — la pestaña "Editar mi registro" nunca mostró datos en producción
**Síntoma:** El endpoint retorna `{ok: true, row: {todos los campos vacíos}}`.
Frontend llama `poblarFormulario(row)` con objeto vacío → no actualiza nada.
Usuario ve la vista "Editar mi registro" sin datos.
**Causa raíz:** En `Código.gs` línea 56:
```js
// ANTES (BUG):
return jsonOut({ ok: true, row: rowToObject(row) });
//                                ↑ objeto {rowNumber, values:[...]} — INCORRECTO

// AHORA (FIX):
return jsonOut({ ok: true, row: rowToObject(row.values) });
//                                ↑ array de la fila — CORRECTO
```
`rowToObject()` espera un array (hace `rowArr[COL_NUM_FORM]`), pero
recibía un objeto. JS interpretaba `obj[0]` como `undefined` y
`String(undefined || '')` = `''`. Resultado: row con todos los campos vacíos.
**Por qué no se detectó antes:** En F7 probé `nextId`, `lookupMatApto`,
`lookupMatParq`, `verificarPropietario`, `dispMudanzas` — pero NO
probé `?action=lookup`. La pestaña "Editar mi registro" nunca se
probó con datos reales en producción.
**Mitigación:** Cambiar `rowToObject(row)` por `rowToObject(row.values)`.
**Resuelto en:** commit `fedf2aa` (rama main)
**Requiere deploy:** V6 de Apps Script
**Lección aprendida:** SIEMPRE probar TODOS los endpoints del flujo
completo, no solo los del feature nuevo.
**Probabilidad residual:** NULA

### C8.13 view-create sigue oculto al editar registro (FIX 23-Sept-2026)

**Probabilidad:** 100% (bug latente, no relacionado con mudanzas pero
detectado durante testing E2E del módulo de mudanzas)
**Impacto si ocurre:** ALTO — usuario no ve datos al editar
**Síntoma:** Después de click en "Buscar mi registro", la vista no
cambia. `view-create` tiene `class="hidden"` y `display: none`,
aunque `form-card` (hijo) tiene `display: block`.
**Causa raíz:** En `buscarRegistro()` (js/app.js), el código solo hacía:
```js
$('#view-edit').classList.add('hidden');
$('#form-card').classList.remove('hidden');
```
Pero `form-card` está DENTRO de `view-create`. Y `view-create` tenía
clase `hidden` (de `setMode('edit') previo). Entonces el form-card
se hacía visible internamente pero su contenedor padre seguía con
`display:none`. Usuario veía `<main>` completamente vacío.
**Mitigación:** Agregar `$('#view-create').classList.remove('hidden')`
antes de los otros toggles en `buscarRegistro()`.
**Resuelto en:** commit `ca94dae` (rama main)
**Requiere:** Push a GitHub Pages (ya hecho, NO requiere deploy de Apps Script)
**Lección aprendida:** Al cambiar entre vistas, hay que manipular TODOS
los contenedores padres, no solo los hijos. El estado "oculto" se
hereda de padres a hijos.
**Probabilidad residual:** NULA

---

## 9. PLAN DE IMPLEMENTACIÓN (8 FASES, CON CHECKPOINTS)

| Fase | Acción | OK requerido | Reversible |
|---|---|---|---|
| **F0** | Backup completo a Drive 1RPHtWnVEFwzBKR1DCzBP1to9wLHY2F22 | ✅ HECHO (22/22 verificados) | sí |
| **F1** | Aprobación del SPEC (este documento) | ⏳ pendiente | sí |
| **F2** | Crear pestaña `Mudanzas` en Sheet (19 cols, headers) | pendiente | sí (eliminar pestaña) |
| **F3** | Modificar `Código.gs`: constantes + 4 funciones + LockService + MailApp | pendiente | sí (revert manual) |
| **F4** | Probar endpoints con curl contra Sheet vivo (no destructive) | pendiente | sí |
| **F5** | Modificar frontend (index.html + app.js) — rama separada | pendiente | sí (git revert) |
| **F6** | Deploy Apps Script manual (5 pasos del skill §P7) | pendiente | sí |
| **F7** | Probar end-to-end con sesión de prueba real | pendiente | sí |
| **F8** | Push a GitHub Pages (después de F6+F7 OK) | pendiente | sí (git revert) |

**Cada fase espera OK explícito antes de avanzar** (excepto F0 que es backup).

---

## 10. PROCEDIMIENTO DE ROLLBACK

Si en cualquier fase F2-F8 algo sale mal:

1. **Frontend (F5/F8):** `git revert <commit>` y `git push origin main --force-with-lease`
   (solo si es la última versión). Restaurar versión previa conocida.
2. **Apps Script (F3/F6):** abrir editor → revertir manualmente `Código.gs`
   → Deploy → Manage deployments → seleccionar versión anterior → Deploy.
   La URL `/exec` NO cambia.
3. **Pestaña Mudanzas (F2):** borrar pestaña manualmente desde UI de Sheets.
   Los datos quedan perdidos — por eso es crítico tener F0 verificado.
4. **Emails enviados erróneamente:** admin (Fabio) puede escribir a residentes
   para disculparse y cancelar manualmente desde Sheet.

**Tiempo estimado de rollback total:** < 10 minutos.

---

## 11. CHECKLIST PRE-IMPLEMENTACIÓN

Antes de empezar F2, el operador debe confirmar:

- [ ] F0 backup verificado bit-a-bit (22/22 archivos en Drive 1RPHtWnVEF...)
- [ ] F1 SPEC aprobado (este documento)
- [ ] App Password de Cerro Azul pagos rotado preventivamente
- [ ] Disponibilidad para hacer F2-F8 en bloques cortos con OK entre cada uno
- [ ] Sheet `Mudanzas` aún NO creado (yo lo creo en F2 después de OK)

---

## 12. ARCHIVOS RELACIONADOS

- `apps-script/Código.gs` — modificar (F3)
- `index.html` — modificar (F5)
- `js/app.js` — modificar (F5)
- `GUIA-PROYECTO.md` — modificar (nueva sección §15)
- `docs/spec-mudanzas.md` — este documento (referencia, no se commitea)
- Sheet pestaña `Mudanzas` — crear (F2)

---

FIN DEL SPEC v1.0.0 draft
