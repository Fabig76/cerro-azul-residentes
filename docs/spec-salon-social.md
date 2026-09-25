# Spec — Portal de Reservas del Salón Social (Cerro Azul)

> Spec técnico del sexto portal del proyecto Cerro Azul Residentes.
> Versión 1.0.0, 25-Sept-2026. Pendiente aprobación del operador antes de
> implementación.

---

## §1. Contexto

Quinto portal del proyecto (sexto contando el portal del residente).
Permite a los residentes y propietarios de la Urbanización Cerro Azul
reservar el salón social para eventos.

**Trigger del operador:** Las reservas **comenzarán en octubre 2026**
(lanzamiento oficial). El sistema debe estar listo antes del 30-Sept-2026.

**Por qué este portal:** Reemplaza el flujo manual de reservar por
WhatsApp/llamada al administrador. Ahora el residente ve disponibilidad
en tiempo real, reserva, paga, sube comprobante, y queda registrado.

---

## §2. Necesidad del usuario (palabras del operador)

> "necesitamos crear otro portal similar al de el calendario de las
> mudanzas porque es para agendar las reservas de el salon social"

> "las reservas comienzan en el mes de octubre el portal muestra los
> dias disponibles y los dias bloqueados con colores diferentes no
> muestra ninguna informacion de quienes las tienen reservado"

> "una ve la persona crea la serva escoge el horario de 8am a 1pm y
> de 2 pm a 10 pm solo dos horarios en el dia no hay restricion se
> puede reervar festivos o domingos"

> "la reserva es editable con los mismos datos de ingreso si se reserva
> se bloquea el dia o junto el horario si se cancela la reserva quedara
> libre el dia y el horario"

> "es necesario que se suba el archivo de pago el valor es 125 mil por
> seccion se daran 48 horas para que se pague si no se lebera
> automaticamente el horario y quedara disponible"

> "se debe enviar correo de notificacion de reserva o de cancela cion
> al correo de cerro azul"

> "para poder ingresar a hacer reservas es necesario que el residente
> este creado en la base datos de el formato de residentes de cerro azul"

---

## §3. Decisiones de diseño (confirmadas con el operador)

| ID | Decisión | Origen |
|---|---|---|
| **D1** | Portal nuevo `salon-social.html` (mismo patrón que `residente.html`) | Iteración 5 |
| **D2** | Pestaña nueva "ReservasSalon" en el **Sheet de Cartera** (mismo ID `1IQn1...`) | P1 |
| **D3** | Autenticación: apto + cédula del **propietario O cualquier residente del apto (slots 1-4)** | P2 |
| **D4** | Comprobante PDF/JPG/PNG, máximo 10MB, en carpeta Drive del proyecto, NO validar contenido | P3 |
| **D5** | Correos SOLO al admin (urb.cerroazul@gmail.com) | P5 |
| **D6** | Vigilantes ven: **fecha + slot + estado + N° apto + nombre del solicitante** | Confirmado por operador |
| **D7** | Calendario muestra los **siguientes 30 días** (no se puede reservar con más de 30/31 días de anticipación) | P7 |
| **D8** | Se pueden reservar AMBOS slots del mismo día (mañana Y tarde) | P8 |
| **D9** | Sin límite mensual de reservas | P9 |
| **D10** | Reserva editable: se puede cambiar **cualquier campo** (fecha, slot, datos del solicitante) | P10 |
| **D11** | **NO pueden reservar** quienes adeuden 2 o más meses de administración | Confirmado por operador |
| **D12** | **Link de pago** en el portal: `https://web-conjuntos.jelpit.com/pagar-mi-administracion#/` | P4 |
| **D13** | Cancelación automática a 48h si NO se sube comprobante (trigger Apps Script) | P4 |
| **D14** | Valor: **$125,000 COP** por slot (mañana O tarde) | Confirmado por operador |
| **D15** | 2 slots fijos por día: **Mañana (8-13)** y **Tarde (14-22)** | Confirmado por operador |
| **D16** | Sin restricción de día: se puede reservar festivos, domingos, cualquier día | Confirmado por operador |
| **D17** | Se debe poder **cambiar el slot** después (mañana ↔ tarde), NO la fecha | Restricción práctica |
| **D18** | Link de pago desde **`Config` del Sheet Registros** (`link_pago` ya existe) | P12 |
| **D19** | Calendario: **rolling window de 30 días** desde hoy | P13 |
| **D20** | Comprobantes expirados **se mantienen en Drive** para auditoría | P14 |
| **D21** | Admin tiene pestaña "Salón Social" en `admin.html` con lista de reservas, ver comprobante y cancelar | P15 |
| **D22** | Admin NO puede extender manualmente el plazo de 48h | P11 |
| **D23** | Admin cancela manualmente solo si el comprobante es falso o no se hizo el pago | P15 |

---

## §4. Stack (mismo que el proyecto)

- **Frontend:** HTML/CSS/JS vanilla en GitHub Pages
- **Backend:** Google Apps Script Web App (V14 al desplegar)
- **BD:** Google Sheets (pestaña nueva "ReservasSalon" en Sheet Cartera)
- **Drive:** nueva carpeta operativa para comprobantes
- **Mail:** `MailApp.sendEmail` para notificaciones al admin
- **Trigger:** time-based en Apps Script para cancelación 48h

---

## §5. Sheet — pestaña nueva "ReservasSalon"

En el Sheet ID `1IQn1y3AoArQSI4dtwhUsH3PVGm0zsZCom0TEdSAfVb4`
(mismo Sheet de Cartera, controlado por `urb.cerroazul@gmail.com`).

### §5.1 Estructura (16 cols)

```
A: ID Reserva         (RS-0001 correlativo)
B: NumForm            (CA-XXXX del propietario del apto)
C: N° Apto            (denormalizado)
D: CC Solicitante     (puede ser prop o residente del apto)
E: Tipo Solicitante   (Propietario | Residente)
F: Nombre Solicitante (denormalizado al reservar)
G: Correo Solicitante (del Sheet Registros, para futuros avisos)
H: Celular Solicitante (del Sheet Registros)
I: Fecha Reserva       (YYYY-MM-DD)
J: Slot                (Mañana | Tarde)
K: Estado              (PendientePago | Pagado | Cancelado | Expirado)
L: Fecha Creacion      (timestamp server-side)
M: Fecha Limite Pago   (timestamp + 48h)
N: Fecha Pago          (cuando se subió comprobante)
O: Comprobante Drive ID (file ID del PDF/imagen)
P: Hash Dedupe          (sha256[:16] de apto+slot+fecha)
Q: Modificado Por       (timestamp de última edición)
```

### §5.2 Pestañas existentes que NO se tocan

- `_Control` (sigue igual, sin cambios)
- `Agosto 2026` (cartera activa del periodo actual)
- `Pagos` (registro de pagos)
- `PazYSalvos` (paz y salvos generados)
- `Hoja 1` (vacía, sin uso)

### §5.3 Cómo se valida la mora (D11) — MÉTODO CONFIRMADO POR OPERADOR

**Fuente:** Pestaña `Agosto 2026` del Sheet Cartera (referenciado por
`cartera_sheet_id` en `Config` del Sheet Registros).

**Estructura de la pestaña de cartera (ej: "Agosto 2026"):**
- Fila 1: título "CERRO AZUL CONJUNTO RESIDENCIAL P.H."
- Fila 2: subtítulo "Informe cartera Por Conceptos"
- Fila 3: headers
- Fila 4+: datos por apto

**Headers de la fila 3 (12 cols):**
- A: numero (= N° apto)
- B: tercero (= N° apto)
- C: tipoloc (= "Apartamento")
- D: nombre
- E: CUOTAS DE ADMINISTRACION
- F: COBRO PREJURIDICO
- G: CUOTA EXTRA 2024
- H: SANCIONES
- I: anticip
- J: valor admon
- K: total cartera
- **L: meses prom ← COLUMNA CLAVE PARA VALIDAR MORA**

**`meses prom` es ACUMULATIVO** (confirmado por operador el 25-Sept-2026).
Ejemplo real: apto 111 (Diana Parra) tiene `meses prom = 44` = 44 meses
de mora acumulados históricamente.

**Flujo de actualización mensual:**
1. El contador carga la cartera del nuevo mes (ej: "Septiembre 2026")
2. Se crea nueva pestaña con el nombre del mes
3. Se agrega fila en `_Control` con `Estado=ACTIVO`
4. La fila del mes anterior cambia a `Estado=REEMPLAZADO`
5. El sistema lee automáticamente la nueva pestaña (vía _Control)

**Endpoint `verificarMoraSalon(apto)`:**

```
PASO 1: SpreadsheetApp.openById(CARTERA_SHEET_ID)
PASO 2: getSheetByName('_Control') → buscar fila con col E = 'ACTIVO'
PASO 3: Leer col C de esa fila → nombre de la pestaña vigente
        (ej: 'Septiembre 2026')
PASO 4: getSheetByName(pestanaVigente) → buscar fila donde col A = apto
PASO 5: Leer col L (índice 11) → parseInt() o 0 si inválido
PASO 6: Retornar { mesesProm, enMora: mesesProm >= 2 }
```

**Datos reales verificados el 25-Sept-2026:**
- Apto 105 (Luis Becerra): `meses prom = 0` ✅ permitido
- Apto 107 (Deisy Villaneda): `meses prom = 1` ✅ permitido (1 < 2)
- Apto 111 (Diana Parra): `meses prom = 44` ❌ BLOQUEADO (44 >= 2)

**Edge cases manejados:**
- E1: Pestaña del mes actual no existe → usar la última pestaña activa
- E2: `_Control` vacío → error `Sin cartera activa`
- E3: Apto no aparece en cartera → tratar como `enMora: false` (asumir al día)
- E4: `meses prom` con formato raro → `parseInt()` con fallback a 0

**Sin caché en v1** (~500ms por verificación). Suficiente para 5-10 reservas
simultáneas. Si el sistema crece, considerar caché en memoria (5 min TTL).

---

## §6. Backend — 11 endpoints Apps Script nuevos + 1 trigger

Todos al final de `apps-script/Código.gs`, después de los 5 endpoints
del módulo residente.

### §6.1 `GET ?action=verificarAccesoSalon&apto=X&cc=Y`

**Propósito:** Validar CC contra slots 1-4 de residentes o propietario.

**Input:** `apto` (string), `cc` (string)

**Output OK:**
```json
{
  "ok": true,
  "apto": "105",
  "numForm": "CA-0055",
  "cc": "26274476",
  "tipo": "Residente",
  "nombre": "Yasmila Cordoba Chaverra",
  "celular": "3147305409",
  "correo": "yacorba@gmail.com",
  "enMora": false,
  "mesesMora": 0,
  "valorReserva": 125000
}
```

**Output en MORA (D11):**
```json
{
  "ok": true,
  "apto": "105",
  "enMora": true,
  "mesesMora": 3,
  "mensaje": "El apartamento 105 está en mora de administración (3 meses).
              Tiene suspendidos los servicios de áreas comunes."
}
```

**LockService:** NO (es solo lectura)

### §6.2 `GET ?action=dispSalon&apto=X&fechaInicio=Y&fechaFin=Z`

**Propósito:** Devuelve los próximos 30 días con slots disponibles/bloqueados.

**Input:** `apto` (string), `fechaInicio` (YYYY-MM-DD), `fechaFin` (YYYY-MM-DD)

**Output:**
```json
{
  "ok": true,
  "dias": [
    {
      "fecha": "2026-10-01",
      "manana": "libre",
      "tarde": "libre"
    },
    {
      "fecha": "2026-10-04",
      "manana": "reservado",
      "tarde": "reservado"
    },
    {
      "fecha": "2026-10-05",
      "manana": "reservado",
      "tarde": "libre",
      "reservaMananaId": "RS-0003"
    }
  ],
  "linkPago": "https://web-conjuntos.jelpit.com/pagar-mi-administracion#/"
}
```

**Estados posibles:**
- `libre` (verde) — nadie ha reservado
- `reservado` (rojo) — pagado o pendiente de pago
- `cancelado`/`expirado` — ya no bloquea (se muestra como `libre`)

**LockService:** NO

### §6.3 `POST action=reservarSalon`

**Propósito:** Crear una nueva reserva.

**Input:**
```json
{
  "apto": "105",
  "cc": "26274476",
  "fechaReserva": "2026-10-04",
  "slot": "Mañana",
  "numForm": "CA-0055"
}
```

**Validaciones:**
- Verificar acceso (D3): apto + CC matchea propietario o residente
- Verificar NO en mora (D11)
- Verificar que el slot esté `libre` (no reservado ni pendiente de pago)
- Verificar que la fecha esté en los próximos 30 días
- Verificar que no sea la misma CC con 2 reservas idénticas
- (opcional D17): validar que no haya otra reserva del mismo solicitante
  en el mismo día/slot (no — se permite)

**Escritura:**
- Generar `RS-XXXX` correlativo
- Estado = `PendientePago`
- Fecha Limite Pago = now + 48h
- LockService

**Output OK:**
```json
{
  "ok": true,
  "reservaId": "RS-0003",
  "fechaLimitePago": "2026-10-02T15:30:00",
  "monto": 125000,
  "linkPago": "https://web-conjuntos.jelpit.com/pagar-mi-administracion#/",
  "mensaje": "Reserva creada. Tiene 48 horas para subir el comprobante."
}
```

### §6.4 `POST action=subirComprobanteSalon`

**Propósito:** Subir comprobante de pago a Drive + cambiar estado a `Pagado`.

**Input:**
```json
{
  "reservaId": "RS-0003",
  "cc": "26274476",
  "apto": "105",
  "comprobanteBase64": "...",
  "comprobanteNombre": "comprobante_pago.pdf",
  "comprobanteMime": "application/pdf"
}
```

**Validaciones:**
- La reserva existe y pertenece al CC + apto
- El estado actual NO es `Cancelado` ni `Expirado`
- Tamaño máximo 10MB (10 * 1024 * 1024 bytes)
- Tipo MIME: `application/pdf`, `image/jpeg`, `image/png`

**Escritura:**
- Subir archivo a Drive (carpeta del proyecto)
- Actualizar estado a `Pagado`
- Actualizar `Fecha Pago` y `Comprobante Drive ID`
- LockService

**Output OK:**
```json
{
  "ok": true,
  "comprobanteId": "1abc...xyz",
  "estado": "Pagado",
  "mensaje": "Comprobante subido. El administrador verificará la legitimidad."
}
```

### §6.5 `POST action=cancelarReservaSalon`

**Propósito:** Cancelar reserva manualmente.

**Input:**
```json
{
  "reservaId": "RS-0003",
  "cc": "26274476",
  "apto": "105"
}
```

**Validaciones:**
- La reserva existe y pertenece al CC + apto
- Estado actual es `PendientePago` o `Pagado`

**Escritura:**
- Estado = `Cancelado`
- (Si era Pagado: marca `CanceladoConPago` para auditoría de reembolso)
- LockService
- Envía correo al admin

### §6.6 `POST action=editarReservaSalon`

**Propósito:** Editar fecha + slot de una reserva (D17).

**Input:**
```json
{
  "reservaId": "RS-0003",
  "cc": "26274476",
  "apto": "105",
  "nuevaFecha": "2026-10-05",
  "nuevoSlot": "Tarde"
}
```

**Validaciones:**
- La reserva existe y pertenece al CC + apto
- El nuevo slot está libre

**Escritura:**
- Cambiar fecha + slot
- Si había comprobante: mantenerlo (no se reembolsa)
- LockService

### §6.7 `GET ?action=vigilanteVerReservasSalon&fecha=YYYY-MM-DD`

**Propósito:** Vista de vigilantes para un día específico.

**Output (D6):**
```json
{
  "ok": true,
  "fecha": "2026-10-04",
  "manana": {
    "estado": "reservado",
    "apto": "105",
    "nombre": "Yasmila Cordoba Chaverra"
  },
  "tarde": {
    "estado": "libre"
  }
}
```

### §6.9 Trigger time-based: `expirarReservasSalon()`

**Propósito:** Cancelar reservas sin pago después de 48h.

**Configuración:**
- Trigger Apps Script: time-based, cada 1 hora
- Configurar en Apps Script editor: Triggers → Add Trigger →
  → `expirarReservasSalon` → Time-driven → Hour timer
- O usar endpoint `configurarTriggerExpiracion()` (D22) que crea
  el trigger automáticamente desde código

**Lógica:**
```javascript
function expirarReservasSalon() {
  const now = new Date();
  const sheet = SpreadsheetApp.openById(SHEET_REGISTROS_ID)
    .getSheetByName('salon social');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[10] === 'PendientePago' && new Date(row[12]) < now) {
      sheet.getRange(i + 1, 11).setValue('Expirado');
      // Envía correo de aviso
      MailApp.sendEmail('urb.cerroazul@gmail.com',
        'Reserva expirada — RS-' + String(row[0]).padStart(4, '0'),
        'La reserva RS-' + String(row[0]).padStart(4, '0') +
        ' del apto ' + row[2] + ' fue cancelada automáticamente ' +
        'por falta de pago. Slot liberado.');
    }
  }
}
```

### §6.10 Endpoints Admin (3 nuevos — D21, D23)

#### `GET ?action=adminListarReservasSalon&estado=X&fechaDesde=Y`

**Propósito:** Lista de reservas para el admin.

**Input:** `estado` (opcional: `PendientePago`, `Pagado`, `Cancelado`, `Expirado`, `Todos` por defecto), `fechaDesde` (opcional: YYYY-MM-DD)

**Output:**
```json
{
  "ok": true,
  "reservas": [
    {
      "id": "RS-0003",
      "numForm": "CA-0055",
      "apto": "105",
      "ccSolicitante": "26274476",
      "tipo": "Residente",
      "nombre": "Yasmila Cordoba Chaverra",
      "correo": "yacorba@gmail.com",
      "celular": "3147305409",
      "fechaReserva": "2026-10-04",
      "slot": "Mañana",
      "estado": "PendientePago",
      "fechaCreacion": "2026-09-25T15:30:00",
      "fechaLimitePago": "2026-09-27T15:30:00",
      "fechaPago": null,
      "comprobanteId": null,
      "tieneComprobante": false
    },
    {
      "id": "RS-0005",
      "apto": "105",
      "nombre": "Yasmila Cordoba Chaverra",
      "fechaReserva": "2026-10-18",
      "slot": "Tarde",
      "estado": "Pagado",
      "comprobanteId": "1abc...xyz",
      "tieneComprobante": true
    }
  ]
}
```

**LockService:** NO

#### `GET ?action=adminVerComprobanteSalon&reservaId=RS-0005`

**Propósito:** Devuelve URL del comprobante en Drive para que el admin lo abra.

**Output:**
```json
{
  "ok": true,
  "reservaId": "RS-0005",
  "comprobanteId": "1abc...xyz",
  "comprobanteUrl": "https://drive.google.com/file/d/1abc...xyz/view",
  "nombreArchivo": "comprobante_pago.pdf",
  "estado": "Pagado"
}
```

**LockService:** NO

#### `POST action=adminCancelarReservaSalon`

**Propósito:** Admin cancela una reserva manualmente (D23).

**Input:**
```json
{
  "reservaId": "RS-0005",
  "motivo": "Comprobante no corresponde al pago (foto random)",
  "adminPassword": "cerroazul2026"
}
```

**Validaciones:**
- `adminPassword` debe coincidir con `Config.admin_password` (D22)
- Reserva existe
- Estado actual es `PendientePago` o `Pagado`

**Escritura:**
- Estado = `Cancelado` (o `CanceladoPorAdmin` si era Pagado — flag interno)
- LockService
- Envía correo al admin (confirmación)
- (Opcional) Envía correo al solicitante (notificación)

**Output:**
```json
{
  "ok": true,
  "estado": "Cancelado",
  "mensaje": "Reserva cancelada por administrador. Slot liberado."
}
```

### §6.11 Setup trigger: `configurarTriggerExpiracion()`

**Propósito:** Crear el trigger time-based de 1h desde código (one-time setup).

**Output:**
```json
{
  "ok": true,
  "triggerId": "abc123def",
  "mensaje": "Trigger creado: cada 1 hora. Llamar UNA SOLA VEZ."
}
```

### §6.12 Entradas en doGet / doPost

```javascript
// En doGet (después de verificarResidente):
if (action === 'verificarAccesoSalon') {
  return jsonOut(verificarAccesoSalon(e.parameter.apto, e.parameter.cc));
}
if (action === 'dispSalon') {
  return jsonOut(dispSalon(e.parameter.apto, e.parameter.fechaInicio, e.parameter.fechaFin));
}
if (action === 'vigilanteVerReservasSalon') {
  return jsonOut(vigilanteVerReservasSalon(e.parameter.fecha));
}
if (action === 'adminListarReservasSalon') {
  return jsonOut(adminListarReservasSalon(e.parameter.estado, e.parameter.fechaDesde));
}
if (action === 'adminVerComprobanteSalon') {
  return jsonOut(adminVerComprobanteSalon(e.parameter.reservaId));
}

// En doPost (después de clearResidente):
if (action === 'reservarSalon')              return jsonOut(reservarSalon(payload));
if (action === 'subirComprobanteSalon')     return jsonOut(subirComprobanteSalon(payload));
if (action === 'cancelarReservaSalon')      return jsonOut(cancelarReservaSalon(payload));
if (action === 'editarReservaSalon')         return jsonOut(editarReservaSalon(payload));
if (action === 'adminCancelarReservaSalon') return jsonOut(adminCancelarReservaSalon(payload));
if (action === 'configurarTriggerExpiracion') return jsonOut(configurarTriggerExpiracion());
```

### §6.10 Configuración de Sheet

Helper `ensureReservasSalonSheet()`:
- Verifica si la pestaña "ReservasSalon" existe en Cartera
- Si no, la crea con los 16 headers (A:Q)
- Idempotente (corre en cada doGet)

### §6.11 Configuración del Trigger

Endpoint dedicado `configurarTriggerExpiracion()` que el operador puede
llamar UNA VEZ desde Apps Script editor para crear el trigger.

---

## §7. Frontend — `salon-social.html` (NUEVO)

Mismo patrón que `residente.html` y `estado-cuenta.html`.

### §7.1 Estructura HTML

```
<header site-header>
<main>
  <section view-login>     → pide apto + CC
  <section view-mora>      → si está en mora, mensaje bloqueo (D11)
  <section view-calendario> → muestra 30 días con slots
  <section view-reservar>  → formulario de reserva + link de pago
  <section view-pago>      → subir comprobante
  <section view-mis-reservas> → ver mis reservas
  <section view-exito>
<footer site-footer>
```

### §7.2 Vista de calendario (30 días)

```
┌─────────────────────────────────────────────────┐
│  🏛️ Portal del Salón Social                    │
│  Urbanización Cerro Azul                        │
├─────────────────────────────────────────────────┤
│  Apartamento 105 · Yasmila Cordoba (Cónyuge)  │
│  ✅ Sin mora · Puede reservar                  │
├─────────────────────────────────────────────────┤
│  Calendario: 1-Oct al 30-Oct-2026              │
│ ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐ │
│ │  L  │  M  │  M  │  J  │  V  │  S  │  D  │         │
│ ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤         │
│ │  ·  │  ·  │  1  │  2  │  3  │  4  │  5  │         │
│ │     │     │🟢🟢│🟢🟢│🔴🔴│🟢🟢│🟢🟢│         │
│ │     │     │LIBRE│LIBRE│BLOQ│LIBRE│LIBRE│        │
│ └─────┴─────┴─────┴─────┴─────┴─────┴─────┘         │
│                                                  │
│  🟢 Disponible  🔴 Reservado                    │
└─────────────────────────────────────────────────┘
```

### §7.3 Click en día → ver slots

```
┌──────────────────────────────────────────┐
│  📅 Sábado 4 de octubre, 2026            │
├──────────────────────────────────────────┤
│  Mañana (8:00 - 13:00) $125.000 COP     │
│  [ 🟢 Reservar mañana ]                  │
│                                          │
│  Tarde (14:00 - 22:00) $125.000 COP    │
│  [ 🔴 Ya reservado ]                     │
└──────────────────────────────────────────┘
```

### §7.4 Vista de reserva + link de pago

```
┌──────────────────────────────────────────────────┐
│  📝 Confirmar reserva                            │
│  Sábado 4 octubre · Mañana (8-13)                 │
│  💰 $125.000 COP                                 │
│                                                  │
│  Solicitante: Yasmila Cordoba Chaverra            │
│  Cédula: 26274476 · Apto: 105                    │
│                                                  │
│  Pasos para pagar:                                │
│  1. Click en el link de abajo para pagar          │
│  2. Vuelva aquí y suba el comprobante             │
│  3. Tiene 48 horas (hasta 27-Sep 15:30)           │
│                                                  │
│  [ 🔗 Ir a pagar ahora ]                        │
│  Link: https://web-conjuntos.jelpit.com/...      │
│                                                  │
│  [ 💾 Confirmar reserva ]                        │
└──────────────────────────────────────────────────┘
```

### §7.5 Vista "Mis reservas"

```
┌──────────────────────────────────────────────────┐
│  📋 Mis reservas                                  │
├──────────────────────────────────────────────────┤
│  RS-0003 · Sábado 4-Oct · Mañana · 🟡 Pendiente │
│  ⏰ Límite pago: 27-Sep 15:30                    │
│  [ 📤 Subir comprobante ] [ ❌ Cancelar ]         │
├──────────────────────────────────────────────────┤
│  RS-0005 · Sábado 18-Oct · Tarde · ✅ Pagado    │
│  [ ✏️ Editar ] [ ❌ Cancelar ]                   │
└──────────────────────────────────────────────────┘
```

---

## §8. Cambios a `vigilantes.html`

### §8.1 Nueva pestaña en mode-switcher (si lo tiene)

Si `vigilantes.html` no tiene mode-switcher, agregar un enlace directo
"Salón Social" en el header.

### §8.2 Vista de consulta (D6)

```
┌──────────────────────────────────────────────────┐
│  🏛️ Reservas Salón Social (vigilancia)          │
├──────────────────────────────────────────────────┤
│  Fecha: [4-Oct-2026 ▼]                          │
│                                                  │
│  Mañana (8-13):                                  │
│    ✅ RESERVADO por Yasmila Cordoba (Apto 105)  │
│                                                  │
│  Tarde (14-22):                                  │
│    ⚪ LIBRE                                      │
│                                                  │
│  [ 📋 Descargar lista del día (PDF) ]            │
└──────────────────────────────────────────────────┘
```

**Los vigilantes ven:** fecha, slot, estado, N° apto, nombre del solicitante.
**NO ven:** CC, correo, celular, comprobante de pago, contacto.

### §8.3 API endpoint usado

`GET ?action=vigilanteVerReservasSalon&fecha=YYYY-MM-DD`

---

## §8B. Cambios a `admin.html` (D21, D23) — NUEVO

### §8B.1 Pestaña "Salón Social"

Agregar al mode-switcher (o lista de pestañas) de `admin.html`:

```html
<button type="button" class="mode-tab" data-mode="salon" role="tab">
  🏛️ Salón Social
</button>
```

### §8B.2 Vista de lista de reservas

```
┌──────────────────────────────────────────────────────────────┐
│  🏛️ Gestión de Salón Social (admin)                         │
├──────────────────────────────────────────────────────────────┤
│  Filtros: [Todos ▼] [Desde: 1-Sep-2026 ▼]                    │
├──────────────────────────────────────────────────────────────┤
│  RS-0003 · Sábado 4-Oct ·  Mañana                          │
│  Apto 105 · Yasmila Cordoba Chaverra (CC 26274476)         │
│  Estado: 🟡 PendientePago (límite 27-Sep 15:30)            │
│  Solicitante: yacorba@gmail.com · 3147305409              │
│  [ 📎 Ver comprobante ] [ ❌ Cancelar reserva ]              │
├──────────────────────────────────────────────────────────────┤
│  RS-0005 · Sábado 18-Oct · Tarde                           │
│  Apto 105 · Yasmila Cordoba Chaverra (CC 26274476)         │
│  Estado: 🟢 Pagado (subió comprobante el 26-Sep 14:20)    │
│  [ 📎 Ver comprobante ] [ ❌ Cancelar reserva ]              │
├──────────────────────────────────────────────────────────────┤
│  RS-0007 · Sábado 25-Oct · Mañana                          │
│  Apto 107 · Deisy Villaneda (CC ????????)                  │
│  Estado: 🔴 Cancelado (motivo: "Comprobante falso")        │
├──────────────────────────────────────────────────────────────┤
│  [ 🔄 Actualizar lista ]                                    │
└──────────────────────────────────────────────────────────────┘
```

### §8B.3 Acciones del admin

**Ver comprobante:**
- Click en "📎 Ver comprobante" → abre nueva pestaña con
  `https://drive.google.com/file/d/{comprobanteId}/view`
- Si `tieneComprobante = false`: botón deshabilitado con tooltip "Sin comprobante"

**Cancelar reserva:**
- Click en "❌ Cancelar reserva" → modal de confirmación con campo de motivo:
```
┌──────────────────────────────────────────┐
│  ⚠️ Cancelar reserva RS-0005             │
│                                          │
│  Solicitante: Yasmila Cordoba (Apto 105) │
│  Fecha: Sábado 18-Oct · Tarde            │
│                                          │
│  Motivo de cancelación (requerido):       │
│  [ Comprobante no corresponde al pago ]   │
│                                          │
│  [ ❌ Cancelar ] [ 🔙 Volver ]            │
└──────────────────────────────────────────┘
```

- Llama a `adminCancelarReservaSalon` con motivo
- Admin password requerido
- LockService
- Envía correo de confirmación al admin

### §8B.4 Decisión clave del admin

> "si el ve que todo ok no hace nada pero si el archivo no corresponde
> a un pago si no a otra cosa el podra cancelar la reserva"

El admin:
1. Ve la lista de reservas (por defecto "PendientePago" + "Pagado")
2. Click en "Ver comprobante" para abrir el archivo subido
3. Si el comprobante es legítimo → NO hace nada (la reserva sigue)
4. Si el comprobante es falso / no es de pago → click "Cancelar" + motivo
6. La reserva pasa a estado `CanceladoPorAdmin` (flag interno para auditoría)

### §8B.5 API endpoints usados

- `GET ?action=adminListarReservasSalon&estado=X&fechaDesde=Y`
- `GET ?action=adminVerComprobanteSalon&reservaId=X`
- `POST action=adminCancelarReservaSalon`

### §8B.6 Archivos a modificar

- `admin.html` (MOD, +50 líneas: nueva pestaña)
- `js/admin.js` (MOD, +200 líneas: lista + vista detalle + modal cancelar)

---

## §9. Cambios a `index.html`

Nueva pestaña en mode-switcher:

```html
<a href="salon-social.html" class="mode-tab" role="tab">
  🏛️ Reservar salón social
</a>
```

Y enlace en footer (junto a los otros portales).

---

## §10. Plan de implementación por fases

| Fase | Descripción | Tiempo | OK previo |
|---|---|---|---|
| **F0** | Backup pre-flight (Sheet Cartera + Codigo.gs + manual) | 5 min | — |
| **F1** | Spec + wireframes (este doc) | 5 min | OK del operador |
| **F2** | Backend Codigo.gs V14 (8 endpoints) | 45 min | OK del operador |
| **F3** | Pestaña "ReservasSalon" en Sheet Cartera | 5 min | F2 listo |
| **F4** | Frontend salon-social.html + js + CSS | 50 min | F2 listo |
| **F5** | Cambios vigilantes.html + index.html | 25 min | F4 listo |
| **F6** | Trigger time-based (configurar después del deploy) | 10 min | F5 listo |
| **F7** | Manual HTML (sección salón + subsección vigilantes) | 20 min | F5 listo |
| **F8** | Deploy Apps Script V14 + tests E2E | 30 min | OK del operador |
| **F9** | Docs: GUIA §23, TESTING nuevos tests, CHANGELOG | 15 min | F8 verificado |

**Total: ~3-4 horas en 3-4 sesiones.**

---

## §11. Riesgos y mitigaciones

| ID | Riesgo | Mitigación |
|---|---|---|
| R1 | Concurrencia al reservar mismo slot | LockService en `reservarSalon` |
| R2 | Mora: usuario regulariza pago entre reserva y cancelación | Re-verificar mora al momento de reservar (no cache) |
| R3 | Subida de archivo muy pesado (10MB+) | Validar tamaño antes de subir |
| R4 | Trigger time-based requiere config manual del operador | Endpoint `configurarTriggerExpiracion()` que crea el trigger |
| R5 | Drive para comprobantes se llena rápido | Estructura: `ComprobantesSalon/2026-10/RS-0003_nombre.pdf` |
| R6 | Cancelación con pago subido = reembolso manual | Marca `CanceladoConPago` + correo al admin |
| R7 | Link de pago Jelpit cambia | Hardcoded en `linkPago` (puede actualizar a Config después) |
| R8 | Editar reserva a slot ocupado | Verificar disponibilidad al editar |
| R9 | Comprobante falso (subir archivo pero no pagó) | NO validamos contenido; admin verifica manualmente |

---

## §12. Tests E2E

| # | Test | Resultado esperado |
|---|---|---|
| T-SAL-1 | verificarAccesoSalon con CC de propietario | ok, sin mora |
| T-SAL-2 | verificarAccesoSalon con CC de residente | ok, sin mora |
| T-SAL-3 | verificarAccesoSalon con CC que NO matchea | ok:false |
| T-SAL-4 | verificarAccesoSalon con apto en MORA | ok, enMora:true |
| T-SAL-5 | dispSalon para 30 días | 30 entradas con estados |
| T-SAL-6 | reservarSalon slot libre | ok, RS-XXXX, estado PendientePago |
| T-SAL-7 | reservarSalon slot ocupado | ok:false "Ya reservado" |
| T-SAL-8 | reservarSalon con apto en mora | ok:false mensaje mora |
| T-SAL-9 | subirComprobanteSalon con PDF válido | ok, estado:Pagado |
| T-SAL-10 | subirComprobanteSalon archivo >10MB | ok:false "muy pesado" |
| T-SAL-11 | cancelarReservaSalon | ok, estado:Cancelado |
| T-SAL-12 | editarReservaSalon a slot libre | ok, slot actualizado |
| T-SAL-13 | vigilanteVerReservasSalon día actual | ok con datos vigilantes |
| T-SAL-14 | adminListarReservasSalon todas | ok con lista completa |
| T-SAL-15 | adminVerComprobanteSalon con reserva sin comprobante | ok con tieneComprobante:false |
| T-SAL-16 | adminCancelarReservaSalon adminPassword incorrecta | ok:false |
| T-SAL-17 | adminCancelarReservaSalon adminPassword correcta | ok, estado:CanceladoPorAdmin |
| T-SAL-18 | expirarReservasSalon (manual trigger) | ok, marca Expirado |
| T-SAL-19 | Trigger automático (verificar después de 48h) | ok |
| T-SAL-20 | Regresión V13 (lookup, nextId, adminLogin, etc.) | ok sin regresión |

---

## §13. Recursos (verificados)

- **Sheet Cartera:** `1IQn1y3AoArQSI4dtwhUsH3PVGm0zsZCom0TEdSAfVb4` (mismo, agregar pestaña)
- **Apps Script:** mismo proyecto (`17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy`)
- **Web App URL:** misma (`AKfycbxp...Zp/exec`)
- **Drive para comprobantes:** carpeta nueva `ComprobantesSalon/2026-MM/` (padre: `1RPHtWnVEFwzBKR1DCzBP1to9wLHY2F22`)
- **Mail admin:** `urb.cerroazul@gmail.com`
- **Link pago:** `https://web-conjuntos.jelpit.com/pagar-mi-administracion#/`

---

## §14. Pendiente de aprobación

- [ ] Operador aprueba el spec completo
- [ ] Operador aprueba las decisiones D1-D23
- [ ] Operador aprueba el plan F0-F9
- [ ] Operador crea el trigger time-based después del deploy V14
  (o usa `configurarTriggerExpiracion()`)
- [ ] Operador crea la pestaña "salon social" en Sheet Registros
  (o autoriza a Hermes a hacerlo)