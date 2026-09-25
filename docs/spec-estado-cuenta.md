# SPEC — Portal de Estado de Cuenta y Paz y Salvo
## Urbanización Cerro Azul — Módulo para propietarios + carga mensual de cartera

**Versión:** 1.0.0
**Fecha:** 2026-09-24 COL
**Estado:** APROBADO por el operador (reglas de §1). Pendientes en §14.
**Archivos que acompañan esta spec (ya escritos y probados, NO reescribir):**
  · `apps-script/modulo-estado-cuenta.gs` — backend del módulo (se pega al final de `Código.gs`)
  · `js/cartera-procesador.js` — lectura del Excel, lectura y división del PDF, subida por lotes

---

## 0. REGLAS PARA EL AGENTE QUE IMPLEMENTA (LEER PRIMERO)

1. **No inventes nada.** Todo nombre de función, constante, columna, índice, clave de Config, ID de elemento HTML y texto de etiqueta del PDF usado aquí fue verificado contra el código del repo o contra los archivos reales del contador. Si necesitas algo que no está en esta spec, **detente y pregunta al operador**.
2. **Los IDs de Google (Sheet de Cartera, carpeta de facturas, plantilla) NO se conocen todavía.** No los escribas en el código. El backend los lee en tiempo de ejecución de la pestaña `Config` (§5.1). El operador los crea en la Fase 0.
3. **No reescribas** `modulo-estado-cuenta.gs` ni `cartera-procesador.js`. Se copian tal cual. Si una prueba falla, reporta el error exacto al operador antes de cambiar la lógica.
4. **No modifiques funciones existentes** de `Código.gs`. El único cambio permitido fuera del bloque nuevo son las 6 líneas de enrutamiento en `doPost` (§6.2).
5. **Nunca subas al repo** (es PÚBLICO) archivos de cartera, facturas, PDFs, cédulas, nombres ni montos. Tampoco pongas datos reales en esta spec ni en los tests.
6. Sigue el protocolo existente `docs/TESTING-PROTOCOL.md` y documenta los bugs en `docs/CHANGELOG-BUGFIXES.md` con la convención `BUGFIX-NNN`.

---

## 1. REGLAS DE NEGOCIO (CONFIRMADAS CON EL OPERADOR)

| Regla | Valor |
|---|---|
| Quién accede | Quien pasa `verificarPropietario()` (función existente): N° Formulario + N° Apto + Cédula. Acepta diligencia `Propietario`, `Tenedor / Otro`, `Inmobiliaria`. **Rechaza `Arrendatario`.** |
| Qué ve | Estado de cuenta del periodo activo, los abonos de los últimos 3 periodos cargados, el detalle por concepto de lo pendiente, los datos de la factura del mes y el link de pago |
| Factura | Descarga **solo la de su apartamento** (PDF de 1 página, extraída del PDF unificado) |
| Paz y salvo | Se habilita si **`total cartera` < `pys_tolerancia`** (por defecto 1000). Esto incluye: saldo 0, saldo negativo (a favor) y residuos menores a $1.000 |
| Fuente de saldos | Pestaña mensual del Google Sheet "Cartera" (una pestaña por mes; se conservan todas) |
| Facturas | Solo las del periodo activo. Al publicar un mes nuevo, la carpeta del mes anterior va a la papelera |
| PDF del contador | Se trabaja con el **PDF unificado**. Nadie separa facturas a mano: el cargador lo divide automáticamente |
| Carga mensual | La hace el administrador desde `cartera-admin.html` con la contraseña de admin existente (`Config` → `admin_password`) |

---

## 2. HECHOS VERIFICADOS DE LOS ARCHIVOS REALES (sept-2026)

### 2.1 Excel de cartera (`cartera_ago.xls`, formato BIFF .xls, 1 hoja "Hoja1")
  · Fila 1: `CERRO AZUL CONJUNTO RESIDENCIAL P.H.` (con espacios al final)
  · Fila 2: `Informe cartera Por Conceptos  Agosto 31 de 2026` → de aquí sale la **fecha de corte**
  · Fila 3: encabezados exactos: `numero | tercero | tipoloc | nombre | CUOTAS DE ADMINISTRACION | COBRO PREJURIDICO | CUOTA EXTRA 2024 | SANCIONES | anticip | valor admon | total cartera | meses prom`
  · Filas 4 en adelante: 625 apartamentos, todos con `tipoloc = "Apartamento"` (con espacios al final). No hay fila de totales.
  · `numero` es numérico (101 … 9912, además de 20319). Es igual a `tercero`.
  · `nombre` trae el apto como prefijo: `"101 NOMBRE APELLIDO   "`. El código quita el prefijo y los espacios.
  · **Conceptos = columnas entre `nombre` y `anticip`.** Pueden cambiar de un mes a otro (por ejemplo, una cuota extra nueva). El código los lee dinámicamente.
  · `anticip` y `total cartera` pueden ser **negativos** (saldo a favor). Hay valores con decimales (por ejemplo 800.3).
  · Distribución de `total cartera` en agosto: 178 en cero, 129 negativos, 22 entre 0 y 1000, 296 ≥ 1000.

### 2.2 PDF de facturas (`ESTADOS_DE_CUENTA_SEP_FINALES.PDF`)
  · 625 páginas, tamaño carta, generado por "Software Administrativo COLON" (Haru PDF). **Tiene capa de texto real** (no es escaneado).
  · **1 página = 1 apartamento.** Cada página contiene `REF.PAGO: <apto>`. No hay referencias duplicadas.
  · El conjunto de referencias del PDF es **idéntico** al de `numero` en el Excel (625 = 625), **pero en distinto orden**. Por eso la división se hace leyendo la referencia de cada página, nunca por posición.
  · ⚠️ **pdf.js NO devuelve el texto en orden visual.** Ejemplo real: tras la etiqueta "Total a Pagar" aparece `1251`, que es el N° de cuenta de cobro. Por eso `extraerDatosPagina()` lee **por coordenadas**: toma el valor numérico que está en la misma línea (|Δy| ≤ 3) y a la derecha de la etiqueta. Esto fue verificado en las 625 páginas, sin ningún campo vacío.
  · Campos que se extraen: `ref`, `numCuentaCobro`, `fechaEmision` (`2026.09.01`), `pagueseHasta` (`2026.09.30`), `totalAPagar`, `abonoUltimoMes`, `anticipos`, `subTotal`, `saldoAnterior`.
  · El link de Jelpit del PDF viene **cortado en dos líneas y truncado** (`...name=CERRO%20AZUL%20CONJUNTO%20RESIDEN`). **NO se extrae del PDF.** Es el mismo para todo el conjunto y se configura una sola vez en `Config` → `link_pago`.
  · Periodos: la cartera tiene corte al 31 de agosto y las facturas son de septiembre (emitidas el 1 de septiembre). **Periodo = mes de la fecha de corte** (`2026-08`).
  · En 611 de 625 facturas, el saldo anterior y los anticipos cuadran exactamente con `total cartera`. Las 14 restantes difieren por reglas del software contable (anticipos aplicados solo hasta el valor del mes, decimales). **No es un error de lectura; no bloquear por esto.**
  · Una página dividida pesa ~115 KB (en total ~72 MB por mes en Drive).

### 2.3 Base de datos de residentes (`Registros`, Sheet `SHEET_ID`)
  · 95 registros (90 `Propietario`, 5 `Arrendatario`). Solo ellos pueden usar el portal.
  · Col D (`COL_APTO = 3`) tiene valores que no cruzan con la cartera: `Solo parqueadero`, `106 torre1`, `228 Torre 3`, `7-20`, y aptos de prueba `2000`, `8888`, `9999`. Para esos casos el portal responde "no aparece en la cartera". **No corregir los datos desde el código.**
  · Índices usados por `verificarPropietario`: `[4]` diligencia, `[5]` nombre, `[6]` CC, `[7]` correo, `[8]` celular.

### 2.4 Plantilla de paz y salvo (`Paz_y_salvo_apto_410.docx`)
  · Encabezado con logo + datos del conjunto. Texto con apto `410`, fecha `01 de septiembre del 2026` y "hasta el día 30 de septiembre del 2026". Firma de Heyler Fabio Guaza (representante legal), Resolución Alcaldía Bello 202600011353. **No tiene imagen de firma.**
  · Se convierte a Google Docs y se le ponen marcadores (§9).

---

## 3. ARQUITECTURA

```
 ADMINISTRADOR (1 vez al mes)                         PROPIETARIO
 cartera-admin.html                                   estado-cuenta.html
  · lee .xls (SheetJS)                                 · N° Form + Apto + Cédula
  · lee y divide PDF (pdf.js + pdf-lib)                · ve estado, pagos, factura
  · sube por lotes                                     · descarga SU factura / paz y salvo
          │ POST text/plain (sin preflight)                   │ POST text/plain
          ▼                                                   ▼
 ┌──────────────────── Apps Script Web App (MISMA URL) ────────────────────┐
 │ ecIniciarCarga / ecSubirFacturas / ecFinalizarCarga   ecConsultar /     │
 │ (exigen admin_password en cada llamada)               ecDescargarFactura│
 │                                                       / ecPazYSalvo     │
 │                               reutiliza: verificarPropietario, adminLogin,│
 │                               normApto, jsonOut, SHEET_ID               │
 └─────────────┬──────────────────────────┬────────────────────┬──────────┘
               ▼                          ▼                    ▼
   Sheet Registros (existente)   Sheet "Cartera" (nuevo)   Drive (privado)
   · Registros                   · _Control                · Facturas/
   · Config (+5 claves nuevas)   · Pagos                     └ Facturas 2026-08 (…)/101.pdf …
                                 · PazYSalvos              · Plantilla Paz y Salvo (Google Doc)
                                 · "Agosto 2026", "Septiembre 2026", …
```

  · Las facturas y la cartera **nunca** se publican en GitHub ni se comparten con enlace. Solo el Apps Script (que se ejecuta como la cuenta dueña) las lee y entrega el archivo del apto validado, en base64.
  · El Apps Script ya está desplegado con "Ejecutar como: Yo" y "Acceso: Cualquier persona" (`apps-script/README.md` §5). **Se actualiza como NUEVA VERSIÓN de la implementación existente → la URL no cambia.**

---

## 4. RECURSOS QUE CREA EL OPERADOR (Fase 0, manual, con la cuenta urb.cerroazul@gmail.com)

> Se hace con la cuenta **dueña del Apps Script** (según `GUIA-PROYECTO.md`, urb.cerroazul@gmail.com). Si los recursos se crean con otra cuenta, esa cuenta debe compartirlos como **Editor** con urb.cerroazul@gmail.com.

1. En el Drive del conjunto, crear la carpeta `Portal Estado de Cuenta`.
2. Dentro, crear un Google Sheet vacío llamado `Cartera`. Copiar su ID desde la URL (`/spreadsheets/d/<ID>/edit`).
   · No hace falta convertir el .xls a mano: el cargador crea cada pestaña mensual.
3. Dentro, crear la carpeta `Facturas`. Copiar su ID desde la URL (`/folders/<ID>`). **No compartirla con nadie.**
4. Subir `Paz_y_salvo_apto_410.docx` a `Portal Estado de Cuenta`, abrirlo y hacer **Archivo → Guardar como Documentos de Google**. Editar el documento nuevo como indica §9. Copiar su ID (`/document/d/<ID>/edit`).
5. Abrir el Sheet de Registros (`SHEET_ID = 16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`) → pestaña `Config` → agregar debajo de las filas existentes (col A = clave, col B = valor):

| config_key | config_value |
|---|---|
| `cartera_sheet_id` | ID del paso 2 |
| `facturas_folder_id` | ID del paso 3 |
| `plantilla_pys_id` | ID del paso 4 (el Google Doc, **no** el .docx) |
| `pys_tolerancia` | `1000` |
| `link_pago` | URL completa de pago de Jelpit del conjunto (obtenerla escaneando el QR de una factura o desde Jelpit). Puede dejarse vacía: en ese caso el botón no aparece |

   · Estado actual verificado de `Config`: fila 1 `config_key | config_value`, fila 2 `admin_password`, fila 3 `vigilante_password`. Las claves nuevas van en las filas 4 a 8.
   · `ecConfig()` busca la clave en todas las filas de la pestaña; el orden no importa.

---

## 5. ESQUEMA DE DATOS

### 5.1 `Config` (Sheet de Registros) — 5 claves nuevas (ver §4.5)

### 5.2 Sheet "Cartera" — pestañas creadas por `ecSetup()` / el cargador

**`_Control`** (una fila por carga; 9 columnas)
| Col | Encabezado | Contenido |
|---|---|---|
| A | ID Carga | UUID (texto) |
| B | Periodo | `YYYY-MM` = mes de la fecha de corte (texto) |
| C | Pestaña | ej. `Agosto 2026` |
| D | Fecha corte | `YYYY-MM-DD` (texto) |
| E | Estado | `CARGANDO` · `ACTIVO` · `HISTORICO` · `REEMPLAZADO` · `ABANDONADO` |
| F | Folder facturas ID | ID de la subcarpeta de esa carga |
| G | Total aptos | número |
| H | Fecha inicio | fecha |
| I | Fecha fin | fecha (al finalizar) |

Reglas de estado (implementadas en `ecFinalizarCarga`):
  · Solo una fila `ACTIVO`. Es la que usa el portal.
  · Al finalizar una carga nueva: el `ACTIVO` anterior pasa a `HISTORICO` (si es otro periodo) o a `REEMPLAZADO` (si es el mismo periodo recargado). Cualquier `CARGANDO` huérfano pasa a `ABANDONADO`. **La carpeta de facturas de todos ellos va a la papelera.**
  · Mientras una carga está en `CARGANDO`, el portal sigue mostrando el periodo anterior (el cambio es atómico).

**`Pagos`** (una fila por apto y periodo; 10 columnas)
`Periodo | N° Apto | N° Cuenta Cobro | Fecha Emisión | Páguese Hasta | Abono Último Mes | Total a Pagar | Saldo Anterior | Anticipos | Fecha Carga`
  · Columnas A–E con formato texto (`@`), para que Sheets no convierta `2026-08` ni `2026.09.01` en fecha (lección BUGFIX-004).
  · Al recargar un periodo se reemplazan sus filas.
  · Los "últimos 3 pagos" = las 3 filas más recientes del apto cuyos periodos estén en `ACTIVO` o `HISTORICO`.

**`PazYSalvos`** (registro de certificados emitidos; 9 columnas)
`Consecutivo | Código | Fecha Expedición | Periodo | N° Apto | N° Formulario | Nombre | CC | Total Cartera`
  · Consecutivo `PYS-00001`, …; código de 10 caracteres hexadecimales en mayúscula.

**Pestaña mensual** (ej. `Agosto 2026`): copia exacta del .xls (valores con espacios recortados). La col A queda en formato texto. El nombre sale de la fecha de corte (`Agosto 31 de 2026` → `Agosto 2026`).

---

## 6. BACKEND (`apps-script/Código.gs`)

### 6.1 Agregar el módulo
  · Pegar **todo** el contenido de `apps-script/modulo-estado-cuenta.gs` **al final** de `Código.gs`, después de `vigilanteBuscarPorPlaca`.
  · Dependencias existentes que usa (verificadas, no duplicar): `SHEET_ID`, `normApto(s)`, `verificarPropietario(numForm, apto, ccProp)`, `adminLogin(password)`, `jsonOut(obj)`.
  · Prefijos reservados del módulo: constantes `EC_*`, funciones `ec*`. No existen colisiones en el código actual.

### 6.2 Enrutamiento en `doPost` (ÚNICO cambio en código existente)
En `doPost`, **inmediatamente después** de la línea `const action = String(payload.action || '').trim();` insertar:

```js
    // --- ESTADO DE CUENTA (spec-estado-cuenta.md) ---
    if (action === 'ecConsultar')        return jsonOut(ecConsultar(payload));
    if (action === 'ecDescargarFactura') return jsonOut(ecDescargarFactura(payload));
    if (action === 'ecPazYSalvo')        return jsonOut(ecPazYSalvo(payload));
    if (action === 'ecIniciarCarga')     return jsonOut(ecIniciarCarga(payload));
    if (action === 'ecSubirFacturas')    return jsonOut(ecSubirFacturas(payload));
    if (action === 'ecFinalizarCarga')   return jsonOut(ecFinalizarCarga(payload));
```
⚠️ **Por qué importa el nombre exacto:** en `doPost`, cualquier `action` no reconocida cae en `submitRecord(payload)` (compatibilidad con el formulario). Un nombre mal escrito **no** devuelve "Acción no reconocida", sino que intenta crear un registro. `doGet` **no** se modifica: todos los endpoints nuevos son POST, para que la cédula no quede en la URL.

### 6.3 Contratos de los endpoints
Todas las llamadas: `fetch(APPS_SCRIPT_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(payload) })`, igual que `js/admin.js` línea 490. Respuesta: JSON con `ok: true|false` y `error` (texto para el usuario) cuando `ok:false`.

**`ecConsultar`** — `{action, numForm, apto, ccProp}` →
```json
{ "ok": true, "periodo": "2026-08", "pestana": "Agosto 2026", "fechaCorte": "2026-08-31",
  "apto": "107", "nombrePropietario": "(col F del registro)",
  "cartera": { "apto":"107", "nombre":"(de la cartera)",
               "conceptos":[{"nombre":"CUOTAS DE ADMINISTRACION","valor":205800}, …],
               "anticipos":0, "valorAdmon":205800, "totalCartera":205800, "mesesProm":1 },
  "factura": { "numCuentaCobro":"1257", "fechaEmision":"2026.09.01", "pagueseHasta":"2026.09.30", "totalAPagar":411600 } | null,
  "facturaDisponible": true,
  "pagos": [ {"periodo":"2026-08","abono":0}, … ],   // hasta 3, del más reciente al más antiguo
  "pazYSalvoHabilitado": false,
  "linkPago": "https://…" | "" }
```
(Los valores del ejemplo son ilustrativos del formato.)

**`ecDescargarFactura`** — `{action, numForm, apto, ccProp}` → `{ok, nombreArchivo:"Factura_107_2026-08.pdf", base64}`
**`ecPazYSalvo`** — `{action, numForm, apto, ccProp}` → `{ok, consecutivo:"PYS-00001", nombreArchivo:"PazYSalvo_107_2026-08.pdf", base64}`. Vuelve a verificar la regla en el servidor; nunca confiar en el botón.
**`ecIniciarCarga`** — `{action, password, periodo, nombrePestana, fechaCorte, filas, pagos, reemplazar}` → `{ok, idCarga, totalAptos}` o `{ok:false, codigo:"PESTANA_EXISTE", error}`
**`ecSubirFacturas`** — `{action, password, idCarga, archivos:[{apto, base64}] (1..10)}` → `{ok, creados}`. Es idempotente: si el archivo ya existe, lo manda a la papelera y lo crea de nuevo.
**`ecFinalizarCarga`** — `{action, password, idCarga}` → `{ok, periodo, pestana, facturas}`. Falla si el número de PDFs en la carpeta ≠ `totalAptos`.

Errores de acceso: los de `verificarPropietario` sin cambios, más:
  · `"Demasiados intentos fallidos para este apartamento. Intente de nuevo en 15 minutos."` (5 fallos por apto, `CacheService`, 900 s)
  · `"Aún no hay información contable publicada. Intente más tarde."`
  · `"El apartamento X no aparece en la cartera de <Pestaña>. Contacte a la administración."`

### 6.4 Autorización de permisos nuevos y despliegue
El módulo usa **DriveApp** y **DocumentApp**, que hoy no se usan (verificado: el código solo usa SpreadsheetApp, MailApp y LockService). Por eso Google pedirá permisos nuevos:
1. En el editor de Apps Script (cuenta urb.cerroazul), pegar el código y guardar.
2. Seleccionar la función **`ecSetup`** → Ejecutar → autorizar los permisos nuevos. Debe terminar sin error y registrar en el log `OK. Carpeta facturas: …`. También crea las pestañas `_Control`, `Pagos` y `PazYSalvos` en el Sheet Cartera.
3. **Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión → Implementar.** No crear una implementación nueva (cambiaría la URL; ver C8.9 de `spec-mudanzas.md`).
4. Revisar la contingencia **C8.2 de `spec-mudanzas.md`** (una reautorización previa afectó la contraseña de aplicación del sistema de pagos) y seguir su mitigación.

---

## 7. FRONTEND DEL CARGADOR (`cartera-admin.html` + `js/cartera-admin.js`)

### 7.1 Archivos nuevos
  · `cartera-admin.html` — página nueva. **No** modificar `admin.html` ni `js/admin.js`.
  · `js/cartera-procesador.js` — **se entrega listo**, copiar tal cual.
  · `js/cartera-admin.js` — lo escribe el agente (solo DOM + flujo, §7.4).

### 7.2 Librerías (versiones fijas, verificadas; exponen los globals indicados)
Incluirlas en `cartera-admin.html` **en este orden**, antes de los scripts propios:
```html
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>        <!-- global XLSX -->
<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script>     <!-- global pdfjsLib -->
<script src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>        <!-- global PDFLib -->
<script>pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';</script>
<script src="js/cartera-procesador.js"></script>
<script src="js/cartera-admin.js"></script>
```
  · **No** usar pdf.js 4.x (solo ESM). **No** cambiar versiones.
  · Estas librerías solo se cargan en `cartera-admin.html`. El formulario público y el portal de propietarios siguen sin dependencias externas.
  · pdf.js puede mostrar en la consola advertencias `fetchStandardFontData`. Son inofensivas para la extracción de texto (se comprobó con los archivos reales).

### 7.3 API de `js/cartera-procesador.js` (verificada)
| Función | Entrada | Salida |
|---|---|---|
| `parsearCartera(filas)` | `XLSX.utils.sheet_to_json(ws,{header:1,defval:''})` | `{periodo, nombrePestana, fechaCorte, filaEncabezado, aptos[], filasLimpias}`. Lanza `Error` con mensaje en español si falla |
| `leerPdf(arrayBuffer, onProgreso(p,total))` | ArrayBuffer del PDF | `[{page, ref, numCuentaCobro, fechaEmision, pagueseHasta, totalAPagar, abonoUltimoMes, anticipos, subTotal, saldoAnterior}]` |
| `agruparFacturas(paginas)` | salida de `leerPdf` | `[{apto, paginas:[n…], datos}]`. Las páginas sin `REF.PAGO` se unen a la factura anterior (soporta facturas de varias páginas). Lanza error si una referencia se repite |
| `cruzar(aptosCartera, grupos)` | | `{soloCartera[], soloPdf[]}` |
| `subirFacturas(arrayBuffer, grupos, idCarga, password, postFn, onProgreso(hechos,total))` | `postFn(payload)→Promise<json>` | Divide y sube en lotes de 10, con 3 reintentos por lote. Lanza error si un lote falla 3 veces |
| `normAptoJs(s)` | | igual a `normApto` del backend |

### 7.4 Flujo y elementos de `cartera-admin.html`
Reutilizar `assets/styles.css` y el encabezado de `index.html` (`<header class="site-header">…`). Clases existentes verificadas: `card`, `field`, `row`, `btn btn-primary`, `btn btn-secondary`, `btn-block`, `alert alert-ok|alert-err|alert-info|alert-warn`, `hidden`.

IDs obligatorios:
  · Vista login `#view-login`: `#loginPassword`, `#btnLogin`
  · Vista carga `#view-carga`: `#fileCartera` (`accept=".xls,.xlsx"`), `#filePdf` (`accept=".pdf,.PDF"`), `#btnAnalizar`, `#resumenAnalisis`, `#btnPublicar` (deshabilitado hasta que el análisis sea válido), `#progresoTexto`, `#progresoBarra` (`<progress>`), `#btnSalir`
  · Alertas: `#alert`

Pasos:
1. **Login.** `GET APPS_SCRIPT_URL?action=adminLogin&password=…` (endpoint existente). Si `ok`, guardar la contraseña **solo en una variable JS en memoria** (no en `sessionStorage` ni `localStorage`) para enviarla en cada POST. `APPS_SCRIPT_URL` = copiar el valor exacto de `js/admin.js` línea 6.
2. **Analizar** (todo en el navegador, sin enviar nada):
   · `XLSX.read(await fileCartera.arrayBuffer(), {type:'array'})` → primera hoja → `sheet_to_json(ws,{header:1,defval:''})` → `parsearCartera`.
   · `leerPdf(await filePdf.arrayBuffer(), progreso)` → `agruparFacturas` → `cruzar`.
   · **Bloquean la publicación** (mostrar en `alert-err`): cualquier `Error` lanzado; `soloCartera` o `soloPdf` no vacíos (mostrar las listas); alguna página con `ref` presente y cualquier otro campo `null` (mostrar el número de página).
   · **Advertencias que no bloquean** (`alert-warn`): si el mes de `fechaEmision` (`AAAA.MM.DD`) no es el mes siguiente al de la fecha de corte (diciembre → enero del año siguiente); si hay facturas de más de una página (informar cuántas).
   · Mostrar en `#resumenAnalisis`: pestaña que se creará, fecha de corte, N° de aptos en la cartera, N° de facturas, fechas de emisión encontradas, y cuántos apartamentos quedarían habilitados para paz y salvo (`total cartera < 1000`, solo informativo).
3. **Publicar**:
   · `ecIniciarCarga` con `filas = resultado.filasLimpias`, `pagos = grupos.map(g => ({apto:g.apto, numCuentaCobro:g.datos.numCuentaCobro, fechaEmision:g.datos.fechaEmision, pagueseHasta:g.datos.pagueseHasta, abonoUltimoMes:g.datos.abonoUltimoMes, totalAPagar:g.datos.totalAPagar, saldoAnterior:g.datos.saldoAnterior, anticipos:g.datos.anticipos}))`, `reemplazar:false`.
   · Si responde `codigo === 'PESTANA_EXISTE'` → `confirm('La pestaña "X" ya existe. ¿Reemplazarla con este archivo?')` → reenviar con `reemplazar:true`.
   · `subirFacturas(bufferPdf, grupos, idCarga, password, postFn, progreso)`. Durante la subida, activar `window.onbeforeunload` para advertir si se cierra la pestaña y deshabilitar los botones.
   · `ecFinalizarCarga`. Si `ok`: mensaje `alert-ok` "Publicado: <pestaña>, <n> facturas". Si falla: mostrar el error. El portal sigue mostrando el mes anterior; el administrador puede volver a publicar (se crea una carga nueva).
   · **Importante:** usar una copia del ArrayBuffer del PDF para `leerPdf` y otra para `subirFacturas` (`leerPdf` ya hace su propia copia internamente; basta con conservar el buffer original).

---

## 8. FRONTEND DEL PORTAL (`estado-cuenta.html` + `js/estado-cuenta.js`)

### 8.1 Estructura
Página nueva, sin librerías externas. Mismo `<head>`, `<header class="site-header">` y `<footer class="site-footer">` que `index.html`. Debajo del encabezado, un aviso breve con la clase `legal-banner`: "Información contable confidencial del inmueble. Solo el propietario registrado puede consultarla (Ley 1581 de 2012)."

IDs obligatorios:
  · `#view-login`: `#ecNumForm` (placeholder `CA-0000`), `#ecApto`, `#ecCc` (`inputmode="numeric"`), `#btnEcConsultar`, `#alert-ec-login`
  · `#view-estado`: `#ecResumen`, `#ecConceptos`, `#ecFactura`, `#btnEcFactura`, `#btnEcPagar`, `#ecPagos`, `#btnEcPys`, `#ecPysNota`, `#alert-ec`, `#btnEcSalir`

### 8.2 Comportamiento
1. Validación en el cliente, igual que el módulo de mudanzas (`js/app.js` líneas 841–848): los 3 campos son obligatorios y la cédula se limpia con `.replace(/[^0-9]/g,'')`.
2. `ecConsultar`. Si responde `ok:false`, mostrar `error` en `#alert-ec-login`. Si responde `ok:true`, guardar `{numForm, apto, ccProp}` **en memoria** (variable JS) y mostrar `#view-estado`.
3. Renderizar (dinero con `new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0})`; fechas `AAAA-MM-DD` → "31 de agosto de 2026"; `AAAA.MM.DD` → `DD/MM/AAAA`; periodo `AAAA-MM` → "Agosto 2026"):
   · **`#ecResumen`**: "Apto {apto} · {nombrePropietario}". Si `totalCartera > 0`: "Saldo pendiente al {fechaCorte}: {valor}". Si `< 0`: "Saldo a favor al {fechaCorte}: {valor absoluto}". Si `= 0`: "Sin saldo pendiente al {fechaCorte}". Además: "Cuota de administración mensual: {valorAdmon}".
   · **`#ecConceptos`**: tabla solo con los conceptos cuyo `valor !== 0`. Si `anticipos !== 0`, agregar la fila "Anticipos (a favor)" con el valor absoluto. Si `mesesProm > 0`: "Meses prom. (según contabilidad): {n}". **No** interpretar ni renombrar "meses prom" más allá de ese texto. Si no hay conceptos distintos de 0: "No registra conceptos pendientes".
   · **`#ecFactura`**: si `factura`: "Cuenta de cobro N° {numCuentaCobro} · Emitida {fechaEmision} · Páguese hasta {pagueseHasta} · Total a pagar {totalAPagar}". `#btnEcFactura` visible solo si `facturaDisponible`. `#btnEcPagar` visible solo si `linkPago`; abre en una pestaña nueva con `rel="noopener"`.
   · **`#ecPagos`**: lista de `pagos` en el orden recibido: "{Mes Año}: {abono}" o, si `abono === 0`, "{Mes Año}: sin abonos registrados". Nota fija debajo: "Corresponde al valor 'Abono último mes' reportado en la cuenta de cobro de cada periodo." Si la lista está vacía: "Aún no hay historial de pagos."
   · **`#btnEcPys`** visible solo si `pazYSalvoHabilitado`. Si no lo está, `#ecPysNota`: "El paz y salvo estará disponible cuando el saldo esté al día."
4. Descargas: `ecDescargarFactura` / `ecPazYSalvo` con los datos guardados en memoria. Deshabilitar el botón mientras se procesa ("Generando…"). Luego:
```js
function descargarBase64(base64, nombre) {
  const bin = atob(base64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a'); a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
```
5. `#btnEcSalir`: borra las variables en memoria y los campos, y vuelve a `#view-login`.
6. Escapar todo texto que venga del servidor antes de insertarlo como HTML (usar la misma función `escapeHtml` de `js/admin.js`).

### 8.3 Enlace desde el formulario público (único cambio en `index.html`)
Dentro de `<footer class="site-footer"><p>…`, antes del `<a href="mailto:…">`, agregar:
`<a href="estado-cuenta.html">Consultar estado de cuenta y paz y salvo</a><br>`

---

## 9. PLANTILLA DE PAZ Y SALVO (Google Doc)

Marcadores que reemplaza `ecPazYSalvo` (en el cuerpo, el encabezado y el pie):
| Marcador | Valor |
|---|---|
| `{{APTO}}` | N° de apto (ej. `410`) |
| `{{NOMBRE}}` | Nombre del propietario según el registro (col F) |
| `{{FECHA_EXPEDICION}}` | Fecha de hoy en Bogotá, ej. `24 de septiembre de 2026` |
| `{{FECHA_CORTE}}` | Fecha de corte de la cartera activa, ej. `31 de agosto de 2026` |
| `{{CONSECUTIVO}}` | `PYS-00001` |
| `{{CODIGO}}` | Código de verificación (10 caracteres) |

Ediciones sobre el texto actual (las hace el operador en el Google Doc):
  · `#410` → `#{{APTO}}`
  · `Bello, 01 de septiembre del 2026.` → `Bello, {{FECHA_EXPEDICION}}.`
  · `hasta el día 30 de septiembre del 2026.` → **ver decisión pendiente P1 (§14)**. Texto recomendado: `con corte al {{FECHA_CORTE}}.`
  · `En constancia se firma el día 1 de septiembre del 2026.` → `En constancia se firma el {{FECHA_EXPEDICION}}.`
  · Agregar al final, en letra pequeña: `Certificado {{CONSECUTIVO}} · Código de verificación {{CODIGO}}`
  · Escribir cada marcador de una sola vez, con las llaves dobles y en mayúsculas. Revisar que la conversión desde .docx conservó el logo y la alineación.

---

## 10. PROCEDIMIENTO MENSUAL DEL ADMINISTRADOR

1. Recibir del contador el **Excel de cartera** (con la misma estructura del §2.1) y el **PDF unificado de cuentas de cobro**.
2. Abrir `https://fabig76.github.io/cerro-azul-residentes/cartera-admin.html` en un **computador** (no en el celular), iniciar sesión y seleccionar ambos archivos.
3. Presionar **Analizar**. Revisar el resumen. Si hay errores, pedir al contador los archivos correctos.
4. Presionar **Publicar** y no cerrar la pestaña hasta ver "Publicado". Por la cantidad de lotes, el proceso puede tardar varios minutos (tiempo no medido todavía en producción; registrarlo en la Fase 3).
5. Verificar con un apto de prueba en `estado-cuenta.html`.
6. Nunca editar a mano `_Control` ni `Pagos`. Las pestañas mensuales sí se pueden consultar libremente.

---

## 11. PLAN DE IMPLEMENTACIÓN (FASES CON CHECKPOINT)

Variables para las pruebas: `URL` = valor de `APPS_SCRIPT_URL` en `js/admin.js` línea 6. Los datos de prueba (N° Form, apto, cédula) los elige el operador desde el Sheet y **no se escriben en el repo**. Llamada POST de prueba:
```bash
curl -sL -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"ecConsultar","numForm":"CA-XXXX","apto":"NNN","ccProp":"CEDULA"}' "$URL"
```

**Fase 0 — Recursos (operador).** Completar §4. ✅ Checkpoint: las 5 claves están en `Config` y los tres IDs abren el recurso correcto.

**Fase 1 — Backend.** §6.1–6.4. ✅ Checkpoint: `ecSetup` corre sin error; las pruebas 1.1–1.8 existentes de `TESTING-PROTOCOL.md` siguen pasando (sin regresión); `ecConsultar` con datos válidos devuelve `"Aún no hay información contable publicada"`.

**Fase 2 — Procesador (verificación local).** Copiar `js/cartera-procesador.js`. Crear `cartera-admin.html` con las librerías y probar en la consola del navegador con los archivos reales: `parsearCartera` debe devolver `periodo "2026-08"`, `nombrePestana "Agosto 2026"`, `fechaCorte "2026-08-31"` y 625 aptos; `leerPdf` debe devolver 625 páginas sin campos `null`; `agruparFacturas` debe dar 625 grupos; `cruzar` debe dar listas vacías. ✅ Checkpoint: resultados idénticos.

**Fase 3 — Cargador completo.** §7.4. Publicar los archivos de agosto/septiembre. ✅ Checkpoint: pestaña `Agosto 2026` creada con 625 filas de datos; `Pagos` con 625 filas `2026-08`; subcarpeta con 625 PDF; `_Control` con 1 fila `ACTIVO`. Abrir 3 PDFs al azar y comprobar que `REF.PAGO` coincide con el nombre del archivo. Anotar la duración.

**Fase 4 — Portal.** §8. ✅ Checkpoint (el operador elige un registro real para cada caso):
| Caso | Esperado |
|---|---|
| Propietario con `total cartera` ≥ 1000 | Ve los conceptos; sin botón de paz y salvo; descarga su factura |
| Propietario con total = 0 | Botón de paz y salvo visible |
| Propietario con total negativo | "Saldo a favor"; paz y salvo visible |
| Propietario con total entre 1 y 999 | Paz y salvo visible |
| Registro `Arrendatario` | Error de `verificarPropietario` |
| Apto que no está en la cartera (ej. `Solo parqueadero`) | "no aparece en la cartera" |
| Cédula errada 5 veces | En el 6.º intento: "Demasiados intentos…" |
| POST `ecPazYSalvo` directo con un apto que tiene deuda | `ok:false` (el servidor bloquea aunque no haya botón) |
| Descarga de factura | El PDF descargado es de 1 página y su `REF.PAGO` es el del apto |

**Fase 5 — Paz y salvo.** Generar uno y revisar los marcadores reemplazados, el logo, la fila nueva en `PazYSalvos` y que la copia temporal esté en la papelera. ✅ Checkpoint: el operador aprueba el formato.

**Fase 6 — Recarga y cambio de mes.** Volver a publicar el mismo mes → la carga anterior queda `REEMPLAZADO` y su carpeta en la papelera; `Pagos` no duplica filas. ✅ Checkpoint.

**Fase 7 — Documentación.** Agregar `docs/spec-estado-cuenta.md` al repo; secciones nuevas breves en `README-project.md` y `apps-script/README.md` (endpoints nuevos); agregar a `.gitignore`: `*.xls`, `*.xlsx`, `*.pdf`, `*.PDF`. Link del §8.3.

---

## 12. CONTINGENCIAS

| # | Situación | Qué pasa / mitigación |
|---|---|---|
| C1 | El contador cambia el formato del PDF (etiquetas, software) | `leerPdf` devuelve campos `null` → el análisis bloquea y muestra las páginas afectadas. Ajustar las etiquetas en `extraerDatosPagina` (hoy: `REF.PAGO:`, `N°`, `Total a Pagar`, `Abono último Mes`, `- Anticipos`, `Sub-Total`, `Saldo Anterior :`) y repetir la Fase 2 |
| C2 | Cambian las columnas del Excel | Si faltan columnas obligatorias, `parsearCartera` lanza un error. Los conceptos nuevos entre `nombre` y `anticip` se toman solos |
| C3 | Se corta la subida | La carga queda `CARGANDO` y el portal sigue con el mes anterior. Publicar de nuevo; al finalizar, la carga huérfana pasa a `ABANDONADO` |
| C4 | Factura de varias páginas | `agruparFacturas` las une si las páginas siguientes no tienen `REF.PAGO` |
| C5 | Apto mal escrito en Registros | Mensaje "no aparece en la cartera"; corregir el registro desde `admin.html` |
| C6 | Fuerza bruta de cédulas | Límite de 5 fallos por apto cada 15 min (`CacheService` es de mejor esfuerzo, no una garantía) |
| C7 | Error por permisos después de desplegar | No se ejecutó `ecSetup` tras pegar el código. Ejecutarlo y crear una nueva versión |
| C8 | La CDN no responde | Solo afecta al cargador; el portal y el formulario siguen funcionando |
| C9 | Cambia el representante legal | Editar la plantilla; no se toca código |
| C10 | Espacio en Drive | ~72 MB por mes; las carpetas viejas quedan en la papelera (Google las borra a los 30 días) |
| C11 | `action` mal escrita en un POST | Cae en `submitRecord` (§6.2). Usar los nombres exactos |

---

## 13. LO QUE NO SE TOCA

  · Las 143 columnas de `Registros`, `Maestros`, `Mudanzas` y las funciones existentes.
  · `index.html` (salvo el link del §8.3), `js/app.js`, `admin.html`, `js/admin.js`, `vigilantes.*`.
  · El token OAuth de computadores.y.portatiles@gmail.com (`GUIA-PROYECTO.md` §1).

### Hallazgos fuera de alcance (reportar al operador; NO corregir en esta tarea)
  · **H1 (seguridad, alta):** `adminBuscar`, `adminObtener`, `adminGuardar`, `vigilanteVerResidentes`, `vigilanteVerMudanzas`, `vigilanteBuscarPorPlaca` y `vigilanteCheckMudanza` **no validan la contraseña en el servidor**. El login solo se valida al entrar (`adminLogin`) y luego el navegador guarda `sessionStorage.adminLoggedIn`. Cualquiera con la URL del Web App puede leer y editar todos los registros. Los endpoints nuevos de este módulo **sí** exigen la contraseña en cada llamada. Recomendación: una tarea separada que agregue la validación de la contraseña a esos endpoints.
  · **H2 (documentación):** `README-project.md` dice que la contraseña está en `Config!B1`, pero el código la busca por clave (`admin_password`, hoy en la fila 2).

---

## 14. DECISIONES PENDIENTES DEL OPERADOR

  · **P1 — Texto de vigencia del paz y salvo.** La cartera tiene corte al 31 de agosto, pero el borrador certifica "hasta el 30 de septiembre". Con esos datos no se puede certificar que septiembre esté pagado. Recomendado: "con corte al {{FECHA_CORTE}}". La decisión es del operador y del representante legal; el código no cambia, solo la plantilla.
  · **P2 — Inmobiliaria / Tenedor.** `verificarPropietario` también los acepta, así que podrán ver el estado de cuenta y pedir el paz y salvo. ¿Se mantiene?
  · **P3 — Historial de pagos inicial.** El primer mes solo habrá 1 abono. Si el contador entrega los PDF de junio y julio, se podría cargar el historial, pero requiere un modo "solo historial" que esta versión **no** incluye.
  · **P4 — `link_pago`.** Obtener la URL completa de Jelpit.

---

## 15. QUÉ ESTÁ VERIFICADO Y QUÉ NO

| Componente | Estado |
|---|---|
| `extraerDatosPagina`, `parsearCartera`, `agruparFacturas`, `cruzar`, `leerPdf`, `subirFacturas` | ✅ Ejecutados con los archivos reales en Node (pdfjs-dist 3.11.174 legacy, pdf-lib 1.17.1, xlsx 0.18.5): 625/625 páginas, 625 PDFs divididos, reintento de lote probado |
| Nombres de globals y rutas de CDN | ✅ Verificados contra el contenido de los paquetes npm (jsDelivr sirve la misma ruta del paquete) |
| `modulo-estado-cuenta.gs`: sintaxis | ✅ `node --check` |
| `ecIndicesCartera`, `ecBuscarAptoEnFilas`, `ecFechaLargaDesdeISO` | ✅ Probados con la cartera real |
| Partes del backend que llaman a servicios de Google (DriveApp, DocumentApp, SpreadsheetApp, CacheService, LockService) | ⚠️ Escritas según la API documentada, **no ejecutadas** (no hay Apps Script en el entorno de prueba). Se validan en las Fases 1, 3, 4, 5 y 6 |
| Navegador real (pdf.js no-legacy, descargas en iOS/Android) | ⚠️ Validar en las Fases 2 y 4 |
| Tiempo total de subida | ⚠️ No medido; medir en la Fase 3 |

---

## 16. RESPUESTAS A LAS PREGUNTAS DEL AGENTE (2026-09-24)

**16.1 ¿Dónde están los 3 archivos?** No estaban en GitHub ni en Drive: se generaron en el chat del analista. Ahora están en la carpeta compartida `1YxXTIvezRpu-0R0fOCNOoVF_iTARTOCn`:
| Archivo en Drive | Destino en el repo | Tamaño exacto |
|---|---|---|
| `spec-estado-cuenta.md` | `docs/spec-estado-cuenta.md` | 41462 bytes |
| `modulo-estado-cuenta.gs` | `apps-script/modulo-estado-cuenta.gs` | 21082 bytes |
| `cartera-procesador.js` | `js/cartera-procesador.js` | 7306 bytes |
Verificar el tamaño al descargarlos. Si no coincide, el archivo se alteró (por ejemplo, por una conversión a Google Docs) y no debe usarse.

**16.2 ¿Existe `cartera-admin.html`?** No. Tampoco existen `estado-cuenta.html`, `js/cartera-admin.js` ni `js/estado-cuenta.js`. Los cuatro los crea el agente siguiendo §7 y §8. Los únicos archivos que se entregan escritos son los 3 de la tabla anterior.

**16.3 Sheet de Registros y Config.**
  · ID `16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`: es la constante `SHEET_ID` de la línea 17 de `Código.gs` (versión del repo con 42 funciones) y coincide con `GUIA-PROYECTO.md` y `apps-script/README.md`.
  · La pestaña `Config` existe. Contenido verificado en una exportación del Sheet: `config_key | config_value` / `admin_password | …` / `vigilante_password | …`. Las 5 claves nuevas (§4.5) aún no existen; las agrega el operador.
  · **No existe** ninguna carpeta de facturas. La crea el operador (§4.3) y se registra en `Config` → `facturas_folder_id`.
  · ⚠️ **Corrección a la suposición del agente:** la estructura NO es `/Facturas/{ref}.pdf`. Es `Facturas/Facturas 2026-08 (xxxxxxxx)/101.pdf`: una subcarpeta por carga, que crea automáticamente `ecIniciarCarga`. El sufijo son los primeros 8 caracteres del `idCarga`. El portal ubica la subcarpeta activa leyendo `_Control`; nunca se arma la ruta a mano.

**16.4 Texto del paz y salvo.** La plantilla usa el marcador `{{FECHA_CORTE}}`, que se llena **automáticamente con la fecha de corte de la cartera activa** (de la fila 2 del Excel, por ejemplo "Agosto 31 de 2026" → "31 de agosto de 2026"). No se escribe ninguna fecha fija. El texto que rodea al marcador lo decide el operador (P1); la recomendación sigue siendo "con corte al {{FECHA_CORTE}}". El código es el mismo cualquiera sea la redacción.

**16.5 "Cartera": ¿archivo o pestaña?** **"Cartera" es el nombre del archivo** (Google Sheet), cuyo ID va en `Config` → `cartera_sheet_id`. Dentro tiene:
  · una pestaña por mes, con nombre `<Mes> <Año>` (`Agosto 2026`, `Septiembre 2026`, …), creada por el cargador;
  · tres pestañas de sistema: `_Control`, `Pagos`, `PazYSalvos`, creadas por `ecSetup()`.
El operador **no** convierte el .xls a mano ni crea pestañas.

**16.6 Versión de `Código.gs`.** El agente reporta "V10, 42 funciones". La versión revisada por el analista (zip del repo) también tiene 42 funciones. Antes de pegar el módulo, confirmar con `grep` que en la versión desplegada siguen existiendo, con la misma firma: `SHEET_ID`, `normApto(s)`, `verificarPropietario(numForm, apto, ccProp)`, `adminLogin(password)`, `jsonOut(obj)`, y la línea `const action = String(payload.action || '').trim();` dentro de `doPost`. Si alguna cambió, detenerse y reportar.
