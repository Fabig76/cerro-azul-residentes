# Notas de Sesión — Portal de Reservas del Salón Social (Cerro Azul)

> Archivo de referencia para futuras sesiones. Documenta TODO el trabajo
> realizado sobre el módulo de reservas del salón social. Pendiente
> integración con `GUIA-PROYECTO.md` cuando se cierre la sesión definitiva.

---

## Metadata

- **Fecha:** 25-Sept-2026 (jueves, sesión nocturna)
- **Sesión:** continuación de la sesión principal
- **Operador:** Fabio (UdeCataluña, docente)
- **Modelo:** MiniMax-M3 vía minimax
- **Canal:** CLI (terminal + browser)
- **Idioma:** español

---

## 1. Punto de partida

Al inicio de esta sesión, ya teníamos:
- 4 portales live (formulario, admin, vigilantes, estado-cuenta)
- Portal del residente recién desplegado (commit `c6d14aa`)
- Apps Script V13 desplegado con5 endpoints del módulo residente
- QR del portal del residente generado y pusheado
- 5 commits de la sesión principal + 3 docs nuevos (spec, proyecto, sesión)

El operador introduce un NUEVO requerimiento:
> "necesitamos crear otro portal similar al de el calendario de las mudanzas
> porque es para agendar las reservas de el salon social"

---

## 2. Cronología de iteraciones (5 rondas de clarificación)

### 2.1 Iteración 1 — Análisis inicial

Presenté un primer análisis con:
- 5 endpoints propuestos
- Wireframes visuales del calendario
- 10 preguntas críticas
- 8 riesgos identificados
- Plan de 5 fases

El operador respondió las preguntas en sucesivas iteraciones.

### 2.2 Iteración 2 — Respuestas básicas (Q1, Q2, Q3, Q5, Q6, Q7, Q8, Q9, Q10)

El operador respondió:
- P1: Pestaña nueva en Sheet de Cartera (mismo ID, nueva pestaña)
- P2: SOLO propietario + residentes del apto
- P3: PDF/JPG/PNG, máx 10MB, NO validar contenido
- P5: Solo al admin (urb.cerroazul@gmail.com)
- P6: Vigilantes ven fecha + slot + estado + N° apto + nombre del solicitante
- P7: Calendario rolling window 30 días (NO mes completo)
- P8: Ambos slots del mismo día (mañana Y tarde)
- P9: Sin límite mensual
- P10: Edición puede cambiar cualquier campo

### 2.3 Iteración 3 — Restricción de mora + pago

> "quienes no pueden reservar? quien en su estado de cuenta deba mas de dos
> meses de administracion debemos tenemos el datos vvamos a ver la columna
> que muestra los meses que debe y si debe 2 o mas no puede hacer la reserva"

Agregada restricción crítica: NO pueden reservar quienes adeuden ≥2 meses.

> "en el portal debe estar el link para pagar el mismo link que tiene en
> el modulo de estados de ceunta la persona deben hacer el pago de los
> 125mil pesos si no sube el soporte de pago dentro de las 48 despues
> de hacer la reserva la reserva se cancela automaticamente"

Confirmado: link de pago Jelpit, $125.000 COP, cancelación automática 48h.

### 2.4 Iteración 4 — Pestaña nueva en Sheet Registros

> "el googles sheet que debemos usar es este https://docs.google.com/spreadsheets/d/16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc"
> "crear una pestaña que se llame salon social como tambien esta la de las mudanzas"

**Corrección importante:** Sheet destino cambió de Cartera → Registros
(porque ya existe la pestaña "Mudanzas" en Registros, no en Cartera).

Verifiqué la estructura del Sheet Registros:
- idx 0: Registros (143 cols)
- idx 1: Maestros
- idx 2: Mudanzas (sheetId 1654967558) — patrón a replicar
- idx 3: Config (8 filas con claves configurables)

### 2.5 Iteración 5 — Método de mora + decisiones finales

> "la mora debe determinarse de archivo de cartera de la pestaña que tenga
> el nombre del mes en curso de la conlmna meses prom cada linea pertence
> a un apto si en la linea del apto 201 en la columna meses prom tiene
> un numero de mas de 2 no podra hacer la reserva pero cada mes se
> actualiza este sheet porque se crea una pestaña nueva con el mes que
> comienza como se puede aplicar todo esto? si es la mejor manera de
> determinar quien esta al dia?"

**Método confirmado por el operador:**
- Leer col L `meses prom` de la pestaña vigente del Sheet Cartera
- La pestaña vigente se identifica por `_Control` con Estado=ACTIVO
- `meses prom` es ACUMULATIVO (44 = 44 meses acumulados)
- Si >= 2 → BLOQUEADO con mensaje de mora

**Datos reales verificados:**
- Apto 105 (Becerra): `meses prom = 0` → permitido
- Apto 107 (Villaneda): `meses prom = 1` → permitido (1 < 2)
- Apto 111 (Parra): `meses prom = 44` → BLOQUEADO

Verifiqué el Sheet Cartera:
- Pestañas: Hoja 1, Agosto 2026 (sheetId 1782123441), PazYSalvos, Pagos, _Control
- Headers de Agosto 2026: numero, tercero, tipoloc, nombre, CUOTAS, COBRO, CUOTA EXTRA, SANCIONES, anticip, valor admon, total cartera, **meses prom**
- _Control: Estado=ACTIVO, Pestaña=Agosto 2026

### 2.6 Iteración 6 — Pestaña admin + P12

> "si el administrador debe tener en el portal de admin una pestaña de salon
> social que le muestre las reservas y que el pueda verficar el pago y
> que el pueda cancelarla si el pago o el soporte es falso o no se hizo
> debe pder ver el archivo que subieron para la reserva por eso cuando
> si el ve que todo ok no hace nada pero si el archivo no corresponde
> a un pago si no a otra cosa elpodra cancelar la reserva"

**Nuevo requisito importante:** El admin debe poder:
1. Ver la lista de todas las reservas
2. Ver el comprobante (abrir el archivo subido a Drive)
3. Cancelar la reserva manualmente si el comprobante es falso
4. Si todo OK, no hace nada

> "P12 preguntaba dónde guardar el URL de pago: en Config"

**P12 confirmada:** Link de pago desde `Config` del Sheet Registros
(`link_pago` ya existe).

---

## 3. Decisiones de diseño finales (D1-D23)

| ID | Decisión | Origen |
|---|---|---|
| **D1** | Portal nuevo `salon-social.html` (mismo patrón que `residente.html`) | Iteración 5 |
| **D2** | Pestaña nueva "salon social" en **Sheet Registros** | Iteración 4 |
| **D3** | Autenticación: apto + cédula del **propietario O cualquier residente del apto (slots 1-4)** | Iteración 2 |
| **D4** | Comprobante PDF/JPG/PNG, máximo 10MB, en carpeta Drive del proyecto, NO validar contenido | Iteración 2 |
| **D5** | Correos SOLO al admin (urb.cerroazul@gmail.com) | Iteración 2 |
| **D6** | Vigilantes ven: **fecha + slot + estado + N° apto + nombre del solicitante** | Iteración 2 |
| **D7** | Calendario muestra los **siguientes 30 días** (rolling window) | Iteración 2 |
| **D8** | Se pueden reservar AMBOS slots del mismo día (mañana Y tarde) | Iteración 2 |
| **D9** | Sin límite mensual de reservas | Iteración 2 |
| **D10** | Reserva editable: se puede cambiar **cualquier campo** (fecha, slot, datos del solicitante) | Iteración 2 |
| **D11** | **NO pueden reservar** quienes adeuden ≥2 meses (lee col L `meses prom` del Sheet Cartera) | Iteración 3 |
| **D12** | **Link de pago**: `https://web-conjuntos.jelpit.com/pagar-mi-administracion#/` (hardcoded en v1, viene de `link_pago` en Config) | Iteración 3 |
| **D13** | Cancelación automática a 48h si NO se sube comprobante (trigger Apps Script) | Iteración 3 |
| **D14** | Valor: **$125,000 COP** por slot (mañana O tarde) | Iteración 3 |
| **D15** | 2 slots fijos por día: **Mañana (8-13)** y **Tarde (14-22)** | Iteración 2 |
| **D16** | Sin restricción de día: se puede reservar festivos, domingos, cualquier día | Iteración 2 |
| **D17** | Se debe poder **cambiar el slot** después (mañana ↔ tarde), NO la fecha | Restricción práctica |
| **D18** | Link de pago desde **`Config` del Sheet Registros** (`link_pago` ya existe) | Iteración 6 |
| **D19** | Calendario: **rolling window de 30 días** desde hoy | Iteración 6 |
| **D20** | Comprobantes expirados **se mantienen en Drive** para auditoría | Iteración 6 |
| **D21** | Admin tiene pestaña "Salón Social" en `admin.html` con lista de reservas, ver comprobante y cancelar | Iteración 6 |
| **D22** | Admin NO puede extender manualmente el plazo de 48h | Iteración 6 |
| **D23** | Admin cancela manualmente solo si el comprobante es falso o no se hizo el pago | Iteración 6 |

---

## 4. Alcance confirmado

### 4.1 IN scope

- 1 nuevo portal frontend (`salon-social.html` + `js/salon-social.js` + CSS)
- 11 endpoints Apps Script nuevos + 1 trigger
- Pestaña nueva "salon social" (16 cols A:Q) en Sheet Registros
- Cambio a `admin.html` + `js/admin.js` (nueva pestaña salón con acciones admin)
- Cambio a `vigilantes.html` (nueva pestaña salón)
- Cambio a `index.html` (pestaña mode-switcher)
- Subida de comprobantes a Drive (carpeta del proyecto)
- Trigger time-based 1h para cancelación automática
- Configuración desde `Config` del Sheet Registros (`link_pago`)

### 4.2 OUT of scope

- NO se cambia el Sheet Cartera (solo se LEE para mora)
- NO se modifican portales existentes (solo se agregan pestañas/vistas)
- NO se crea un nuevo Apps Script (mismo, V14 al desplegar)
- NO se cambia la URL /exec (preservada)
- NO se hace integración con el sistema de pagos Jelpit (solo se le da link)
- NO se valida el contenido del comprobante (el admin verifica manualmente)
- NO se envía correo al solicitante (solo al admin)
- NO se crea script para imprimir QRs masivamente (sería F10 opcional)

---

## 5. Arquitectura técnica

### 5.1 Sheet — nueva pestaña "salon social"

En Sheet Registros (`16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`).

**16 columnas (A:Q):**

| Col | Header | Tipo |
|---|---|---|
| A | ID RESERVA | texto (RS-0001 correlativo) |
| B | NUM FORM | texto (CA-XXXX) |
| C | N° APTO | texto |
| D | CC SOLICITANTE | texto |
| E | TIPO SOLICITANTE | Propietario / Residente |
| F | NOMBRE SOLICITANTE | texto |
| G | CORREO | texto |
| H | CELULAR | texto |
| I | FECHA RESERVA | fecha YYYY-MM-DD |
| J | SLOT | Mañana / Tarde |
| K | ESTADO | PendientePago / Pagado / Cancelado / Expirado / CanceladoPorAdmin |
| L | FECHA CREACION | fecha+hora |
| M | FECHA LIMITE PAGO | fecha+hora (now + 48h) |
| N | FECHA PAGO | fecha+hora |
| O | COMPROBANTE DRIVE ID | texto (file ID) |
| P | HASH DEDUPE | sha256[:16] de apto+slot+fecha |
| Q | MODIFICADO POR | fecha+hora última edición |

### 5.2 Validación de mora (D11)

```
PASO 1: SpreadsheetApp.openById('1IQn1y3...')   // Sheet Cartera
PASO 2: getSheetByName('_Control') → buscar fila con col E = 'ACTIVO'
PASO 3: Leer col C de esa fila → nombre de la pestaña vigente
PASO 4: getSheetByName(pestanaVigente) → buscar fila donde col A = apto
PASO 5: Leer col L (índice 11) → parseInt() o 0 si inválido
PASO 6: Si >= 2 → BLOQUEADO, si < 2 → PERMITIDO
```

**Datos verificados el 25-Sept-2026:**
- Apto 105: `meses prom = 0` → permitido
- Apto 107: `meses prom = 1` → permitido (1 < 2)
- Apto 111: `meses prom = 44` → BLOQUEADO (44 ≥ 2)

### 5.3 11 endpoints Apps Script + 1 trigger

**Residente (6):**
1. `verificarAccesoSalon` (GET) — login + mora
2. `dispSalon` (GET) — 30 días con estados
3. `reservarSalon` (POST) — crear reserva (LockService)
4. `subirComprobanteSalon` (POST) — subir PDF + marcar Pagado
5. `cancelarReservaSalon` (POST) — cancelar manual
6. `editarReservaSalon` (POST) — cambiar fecha + slot

**Vigilantes (1):**
7. `vigilanteVerReservasSalon` (GET) — vista vigilantes

**Admin (3):**
8. `adminListarReservasSalon` (GET) — lista con filtros
9. `adminVerComprobanteSalon` (GET) — URL Drive del comprobante
10. `adminCancelarReservaSalon` (POST) — cancelar con motivo + adminPassword

**Setup (1):**
11. `configurarTriggerExpiracion` (POST) — crea trigger 1h one-time

**Trigger time-based:**
- `expirarReservasSalon()` corre cada 1h, marca `PendientePago` → `Expirado` si pasó M

### 5.4 Frontend

- `salon-social.html` (NUEVO, ~450 líneas, 7 vistas)
- `js/salon-social.js` (NUEVO, ~650 líneas)
- `assets/salon-social.css` (NUEVO, ~150 líneas)
- `admin.html` (MOD, +50 líneas: pestaña salón)
- `js/admin.js` (MOD, +200 líneas: lista + acciones)
- `vigilantes.html` (MOD, +60 líneas: pestaña salón)
- `index.html` (MOD, +1 pestaña mode-switcher)

---

## 6. Plan de implementación (F0-F9)

| Fase | Descripción | Estado |
|---|---|---|
| **F0** | Backup pre-flight (Sheet + Codigo.gs + manual) | ⏳ Pendiente |
| **F1** | Spec + wireframes | ✅ Hecho (commits 82d0511, 7964758) |
| **F2** | Backend Codigo.gs V14 (11 endpoints + helpers) | ⏳ Pendiente |
| **F3** | Pestaña "salon social" en Sheet Registros | ⏳ Pendiente |
| **F4** | Frontend salon-social.html + js + css | ⏳ Pendiente |
| **F5** | admin.html + vigilantes.html + index.html | ⏳ Pendiente |
| **F6** | Trigger time-based (configurar post-deploy) | ⏳ Pendiente |
| **F7** | Manual HTML (sección salón + subsección vigilantes) | ⏳ Pendiente |
| **F8** | Deploy Apps Script V14 + tests E2E | ⏳ Pendiente |
| **F9** | Docs finales (GUIA §23, TESTING 20 tests, CHANGELOG) | ⏳ Pendiente |

**Tiempo estimado: ~3.5 horas en 3-4 sesiones.**

---

## 7. Recursos

- **Sheet Registros:** `16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`
- **Sheet Cartera:** `1IQn1y3AoArQSI4dtwhUsH3PVGm0zsZCom0TEdSAfVb4` (solo lectura)
- **Apps Script ID:** `17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy`
- **Web App URL:** `https://script.google.com/macros/s/AKfycbxp...Zp/exec` (preservada)
- **Carpeta backups proyecto:** `1RPHtWnVEFwzBKR1DCzBP1to9wLHY2F22`
- **Carpeta comprobantes salón:** nueva carpeta en Drive
- **Mail admin:** `urb.cerroazul@gmail.com`
- **Link pago:** `https://web-conjuntos.jelpit.com/pagar-mi-administracion#/`

---

## 8. Próximos pasos inmediatos

1. **Crear este archivo de notas** ✅ (este doc)
2. **F0** — Backup pre-flight
3. **F3** — Crear pestaña "salon social" en Sheet Registros
4. **F2** — Backend Codigo.gs V14 (11 endpoints)
5. **F4** — Frontend salon-social.html
6. **F5** — admin.html + vigilantes.html + index.html
7. **F6** — Trigger time-based (manual del operador o via endpoint)
8. **F7** — Manual HTML
9. **F8** — Deploy V14 + tests
10. **F9** — Docs finales

---

## 9. Lecciones aprendidas

### 9.1 Sobre la dinámica con el operador

- **El operador refina por iteraciones** — el alcance del salón social
  se construyó en 6 rondas, especialmente la restricción de mora
- **El operador da información técnica detallada** — sabe exactamente
  cómo funciona su Sheet Cartera (pestañas mensuales, `_Control`)
- **El operador prefiere decisiones explícitas** — "si", "no", "no entiendo"
- **Las "respuestas mixtas" requieren aclaración** — cuando dijo
  "sí el archivo no corresponde a un pago si no a otra cosa elpodra
  cancelar la reserva" tuve que pedir aclaración

### 9.2 Sobre la arquitectura del Sheet Cartera

- **Cada mes se crea una pestaña nueva** con el nombre del mes
- **Una pestaña `_Control` controla cuál es la activa** (Estado=ACTIVO)
- **`meses prom` es ACUMULATIVO** — 44 = 44 meses acumulados
- **El Sheet Cartera es solo LECTURA** desde nuestro sistema — no modificamos

### 9.3 Sobre el patrón de Sheets del Cerro Azul

- **Sheet principal** (Registros) tiene las pestañas funcionales:
  Registros, Maestros, Mudanzas, Config
- **Sheet de Cartera** es separado (referenciado por `cartera_sheet_id`)
- **Cada nueva feature crea una nueva pestaña** en Sheet Registros
- **El patrón de "Mudanzas" se replica** para "salon social"

### 9.4 Sobre el patrón Apps Script

- **LockService.getScriptLock()** para escrituras concurrentes
- **MailApp.sendEmail** para notificaciones
- **Trigger time-based** para jobs programados
- **Pattern de reutilización** — las funciones existentes
  (`findRowByApto`, `rowToObject`, `normCc`) se siguen usando

---

## 10. Pendiente para futuras sesiones

- [x] Operador aprueba el spec completo (hecho durante la sesión)
- [x] Operador aprueba las decisiones D1-D23 (hecho durante la sesión)
- [x] Operador aprueba el plan F0-F9 (hecho durante la sesión)
- [x] Operador crea el trigger time-based después del deploy V14 (hecho)
- [x] Operador crea la pestaña "salon social" en Sheet Registros (hecho por Hermes)
- [ ] F10: script `generar_qr_salon.py` (opcional, no prioritario)

## 11. Bugs encontrados durante la implementación

### BUGFIX-007 · apiGet/apiPost faltantes (commit `dfca571`)

**Síntoma:** En el portal admin, al entrar a la pestaña "Salón Social"
aparecía "Error de red: A.apiGet is not a function".

**Causa raíz:** Mi código nuevo (F5 módulo salón) llamaba a `A.apiGet()`
y `A.apiPost()`, pero esos helpers no existían en el objeto A. El código
existente usaba `fetch(...).then(x=>x.json())` inline en todos sus métodos.

**Fix:** Agregar los helpers apiGet/apiPost al inicio del objeto A en
`js/admin.js` (y apiGet en `js/vigilantes.js`).

**Lección:** Las pruebas con curl validan el backend pero NO el frontend.
Los bugs del DOM/JS solo se ven en el navegador real. Siempre probar
en el navegador antes de declarar "listo".

### BUGFIX-008 · switchTab() no togglea tab-salon (commit `cfce441`)

**Síntoma:** En el portal vigilantes, al hacer click en el tab "Salón Social"
no se mostraba nada (el contenedor quedaba oculto).

**Causa raíz:** El método `switchTab()` toggleaba EXPLÍCITAMENTE los 3 tabs
originales (residentes, placas, mudanzas) pero NO toggleaba el nuevo
`tab-salon`. Resultado: cuando el operador hacía click, el botón cambiaba
a `active`, los otros 3 tabs se ocultaban, pero `tab-salon` se quedaba
con `class="hidden"` que yo le había puesto en el HTML.

**Fix:** Cambiar el switchTab a un patrón genérico que toggle TODOS los
elementos con id que empiezan con `tab-`:

```javascript
document.querySelectorAll('[id^="tab-"]').forEach(t => {
  t.classList.toggle('hidden', t.id !== 'tab-' + tab);
});
```

**Lección:** NO usar listas explícitas de IDs en código de navegación/UI.
Usar selectores genéricos. Si agregas un nuevo tab a un sistema existente,
el código debe funcionar automáticamente sin tocar la lógica de switch.---

*Archivo generado automáticamente al final de la sesión del 25-Sept-2026.
Próxima sesión: continuar con F2 backend después de F0 + F3.*