# Cerro Azul — Apps Script (Backend del Formulario)

Este es el código del backend que conecta el formulario público
(`https://fabig76.github.io/cerro-azul-residentes/`) con el Google Sheet
(`https://docs.google.com/spreadsheets/d/16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`).

## Versión LISTA PARA DEPLOY: V32 backend (05-Oct-2026) — BUGFIX-019 v2. En producción: V31 (Apps Script "Versión 29", con bug de cache).

**Backend V32 (LISTO PARA DEPLOY):** BUGFIX-019 v2 — token de sesión con `PropertiesService` (V31 usó CacheService y el token no se propagaba entre instancias). md5 `10527ca94356f53f54d4e6d95765a251` (199926 bytes). Al desplegar, Apps Script le asignará "Versión 30". Ver `docs/CHANGELOG-BUGFIXES.md` BUGFIX-019.

**Frontend:** `js/admin.js` + `js/vigilantes.js` ya inyectan el token (sin cambios desde V31). Desplegar PRIMERO el frontend (ya está en GitHub Pages), LUEGO el backend V32.

**Frontend GitHub Pages:** V28 (333 líneas, +27 vs V26) = `js/asistente.js` con mini-parser markdown para renderizar respuestas del LLM con negrita real y saltos de línea visibles.

URL del Web App (preservada entre versiones):
`https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec`

Historial de deploys (sesión 04-Oct-2026 — Agente IA):

| Versión | Hora | MD5 | Descripción |
|---------|------|-----|-------------|
| **V32** | 05-Oct-2026 (LISTO, sin deploy) | `10527ca94356f53f54d4e6d95765a251` | **BUGFIX-019 v2: token con PropertiesService (V31 CacheService no propagaba)** |
| **V31** | 05-Oct-2026 (deploy "29", bug cache) | `6778474b1e244f91ce3084c1a7882da5` | **BUGFIX-019: token admin/vigilante — reemplazada por V32** |
| **V30** | 05-Oct-2026 (deploy "28" ✓) | `a14aa86c100ae82a5988206b4ce28c20` | **BUGFIX-018: getEstadoResidente sin numForm/nombres/propietario (fuga de datos)** |
| **V29** | 05-Oct-2026 (deploy "27" ✓) | `6186f0586e63b52e185f5f8135072be7` | **BUGFIX-017: quitar CA-XXXX del error de duplicado (fuga de credencial)** |
| **V28** | 04-Oct-2026 (frontend) | `1cce2cdcd5136e2254ec402a14ed971b` (js) | **Renderizar markdown del LLM a HTML (frontend only, NO requiere deploy Apps Script)** |
| **V27** | 04-Oct-2026 (Deploy "26") | `599ffb5cb71182915e576a6e903bf7e2` | **Manual actualizado por el operador (nueva REGLA FUNDAMENTAL: solo propietario/inmobiliaria/encargado crea registro; arrendatario NUNCA)** |
| **V26** | 04-Oct-2026 (Deploy "25") | `a33b5b2af01bb24b2fd48a55b6ac1672` | **Manual embebido como MANUAL_CERRO (sin cache, sin fetch, sin Google Docs runtime)** |
| **V25** | DESCARTADO | (no subido) | RAG simple con fetch Google Doc + cache 6h — operador prefirió traer el doc a Hermes |
| **V24** | 04-Oct-2026 11:30 | `3cda634` | System prompt enriquecido con info factual del Cerro Azul |
| **V23.1** | 04-Oct-2026 | `adf63c56c2659c9c000c567ca44f6d78` | BUGFIX-016: formato Anthropic Messages + fix banner tapaba header |
| **V23** | DESCARTADO | (no subido) | OpenAI-compat assumed (habría dado 404) |

Historial de deploys anteriores (sesión 26-Sept):

| Versión | Hora | MD5 | Descripción |
|---------|------|-----|-------------|
| **V22.1** | 03-Oct-2026 | `d7aea73812e06d2f6bef99fd17511e56` (js) | BUGFIX-015b/c V22.1: handler "Volver al calendario" + optimistic UI (frontend only) |
| **V22** | 02-Oct-2026 17:14 | `300ab4d7dfa1e06599f022f5329ae353` | BUGFIX-015: listarReservasPorApto + vista "Mis reservas" en salon-social.html |
| **V21.1** | 02-Oct-2026 18:55 | `c180a1e330eb61ac2d13c1ca1a9e2df4` | BUGFIX-013: parentesco del residente se pierde (mismatch `parentesco`/`parent`) |
| **V21** | 02-Oct-2026 18:30 | `e4aa773022db26b8bd339960c56dca52` | BUGFIX-012: registrarResidente cae al branch de CREACIÓN de submitRecord |
| **V20** | 13:10 | `70ca1033084c9dc27fdf0aefa562f2c9` | BUGFIX-011: admin mudanzas filtro "Próximos N días" |
| V19 | 12:37 | `40e224f2d0071388fc46aff72e6910f4` | BUGFIX-010 / SEG-001: backend vigilante sin credenciales |
| V18 | 12:15 | `691a6f3adc3224fc38170fcc72200e71` | BUGFIX-009: routing 6 endpoints `ec*` |
| V17 | 25-Sept | — | Salón social: auditoría W1 + B3 |
| V14 | 25-Sept | — | Salón social: deploy inicial |
| V13 | 25-Sept | — | Portal del residente (auto-registro) |
| V12 | 25-Sept | — | Módulo de estado de cuenta (deploy inicial) |

BUGFIX-013 (V21.1): bug de V13 — `residente.js` envía el campo `parentesco` pero `buildRowFromPayload` (Código.gs línea 336) lee `r.parent` → col 33 (parentesco del residente) quedaba VACÍA en el Sheet. Fix: 14 líneas en `registrarResidente` que normalizan `parentesco || parent` antes de pasar al payload. El normalizador acepta ambos nombres (compatibilidad con `index.html` que usa `parent`). Ver `docs/CHANGELOG-BUGFIXES.md` BUGFIX-013.

BUGFIX-015 (V22) — listarReservasPorApto: nuevo endpoint SAL-12 que devuelve todas las reservas del apto del solicitante autenticado. Materializa el fix del BUG #1 del análisis del portal salón-social: la vista `view-mis-reservas` quedó como placeholder HTML desde F4 (26-Sept-2026) sin handler JS ni endpoint backend. Cuando un residente recargaba la página o navegaba atrás desde view-pago, perdía acceso a sus reservas pendientes. Incidente detonante: Elkin Santa (apto 504, CC 8061369) hizo una reserva el 02-Oct-2026 06:01 y no pudo subir comprobante ni cancelarla al refrescar. Fix: 73 líneas en backend (listarReservasPorApto en Código.gs) + botón "📋 Mis reservas" en vista-calendario (HTML) + flujo cargarMisReservas() en JS (165 líneas) con event delegation que permite retomar/cancelar cada reserva. NO modifica funciones existentes. Ver `docs/CHANGELOG-BUGFIXES.md` BUGFIX-015 y `docs/sesion-2026-10-02.md`.

BUGFIX-015b (V22.1) — frontend only, NO requiere re-deploy Apps Script. El botón "↩️ Volver al calendario" en la vista `view-mis-reservas` (`id="btnVolverCalDesdeMis"`) no tenía handler JS — al hacer click no pasaba nada. Fix: 11 líneas en `js/salon-social.js` que agregan el binding, restauran el header del calendario (`userNombre/userTipo/userApto`), recargan la grilla (`cargarCalendario()`) y muestran la vista calendario. Operador reportó "el boton volver al calendario no funciona" el 03-Oct-2026. Ver `docs/CHANGELOG-BUGFIXES.md` BUGFIX-015b.

BUGFIX-015c (V22.1) — frontend only. UX subóptima: `showView('mis-reservas')` se llamaba DESPUÉS del `await cargarMisReservas()`. Durante el cold start de Apps Script (30-60s) el usuario miraba el calendario sin feedback — parecía que la app estaba rota. Fix: invertir el orden — `showView` ANTES del `await` para que el usuario vea inmediatamente la vista con "Cargando..." y la lista se actualice cuando llega la respuesta. Patrón "optimistic UI". Ver `docs/CHANGELOG-BUGFIXES.md` BUGFIX-015c.

**Nota sobre V22.1:** V22.1 es **frontend only** (solo cambia `js/salon-social.js`). El backend (Apps Script) NO requiere re-deploy — el `md5 Codigo.gs` sigue siendo `300ab4d7dfa1e06599f022f5329ae353` de V22. Los 2 cambios de UX ya están en producción en GitHub Pages (commit `3f08c2e`, md5 js `d7aea73812e06d2f6bef99fd17511e56`).

BUGFIX-012 (V21): `registrarResidente` construía un payload SIN `editMode: true` al reusar `submitRecord()`. `submitRecord` entraba al branch de CREACIÓN, encontraba CA-XXXX por apto y retornaba `'Ya existe un registro... Usa la opción "EDITAR MI REGISTRO" para modificarlo.'` — un error del formulario principal siendo mostrado en el portal residente. Fix: agregar `editMode: true` al payload + preservar `autDatos` original del propietario + copiar `dispositivos` originales del propietario (FIX REAL para evitar que `setValues` borre los slots 95-109) + sanitizar mensaje de error para que NUNCA llegue al residente la referencia al formulario principal. Ver `docs/CHANGELOG-BUGFIXES.md` BUGFIX-012.

BUGFIX-009 (V18): desde V12 hasta V17, los 6 endpoints `ec*` existían en el
módulo pero NO estaban enrutados en `doPost`. El fix V18 agrega 7 líneas en
`doPost` (justo después de `const action = String(payload.action || '').trim();`)
para enrutar `ecConsultar`, `ecDescargarFactura`, `ecPazYSalvo`, `ecIniciarCarga`,
`ecSubirFacturas`, `ecFinalizarCarga`. Ver `docs/CHANGELOG-BUGFIXES.md`
BUGFIX-009 y `docs/sesion-bugfix-009.md` para detalles.

BUGFIX-010 (V19) — SEG-001: el backend `vigilanteVerResidentes` ya NO envía
`numForm`, `ccProp`, `firmaNom`, `firmaCC` ni `residentes[].cc` (protección
de datos Ley 1581/2012). Ver `docs/CHANGELOG-BUGFIXES.md` BUGFIX-010.

BUGFIX-011 (V20): admin mudanzas con filtro "Próximos N días" (paridad
con vigilante). Ver `docs/CHANGELOG-BUGFIXES.md` BUGFIX-011.

## ¿Qué hace?

  · Recibe los datos enviados desde la página web (`POST`)
  · Genera un N° de formulario correlativo tipo `CA-0001`, `CA-0002`, ...
  · Dedupe por N° de apartamento (un apartamento = un solo registro)
  · Permite editar un registro existente pidiendo N° de Formulario + N° de Apto
  · Escribe en la hoja "Registros" del Sheet
  · Nunca borra filas (los residentes no pueden eliminar su información)
  · **Módulo de mudanzas** (sept 2026): agendar y cancelar reservas de ascensor
    para propietarios e inmobiliarias

## Estructura

  · `Código.gs` — El backend completo (un solo archivo, copia y pega)
  · Sheet ID: `16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`
  · Hoja de destino principal: `Registros` (**143 columnas desde v2 / 7-Sep-2026**)
  · Hoja de mudanzas: `Mudanzas` (**19 columnas, sept 2026**)
  · Sheet de matrículas (solo lectura): `1ceGtZDUJHX4yxs5_ydDwLwtrkOcZwYh09WUG0st_b0Y`

## Endpoints disponibles

### Formulario principal (submit)
  · `POST` con payload JSON — crea o actualiza fila en `Registros`

### Búsquedas (GET)
  · `?action=nextId` — siguiente N° de Formulario correlativo
  · `?action=lookup&numForm=X&apto=Y` — devuelve fila existente
    **⚠️ IMPORTANTE:** pasar `numForm` y `apto` como strings. El backend
    hace `rowToObject(row.values)` donde `row` es el objeto retornado
    por `findRowByNumFormAndApto({rowNumber, values: array})`. Ver
    bug C8.12 en `docs/spec-mudanzas.md` §8 — bug latente corregido
    en commit `fedf2aa` (deploy V6).
  · `?action=lookupMatApto&apto=X` — autocompleta matrícula del apto
  · `?action=lookupMatParq&celda=X` — autocompleta matrícula del parqueadero

### Módulo de mudanzas (sept 2026)
  · `GET ?action=verificarPropietario&numForm=X&apto=Y&ccProp=Z`
    Valida que el solicitante sea el propietario o la inmobiliaria
    (rechaza arrendatarios). Devuelve nombre, correo y celular del propietario.
  · `GET ?action=dispMudanzas&torre=1&ascensor=A&desde=YYYY-MM-DD&hasta=YYYY-MM-DD`
    Lista slots disponibles vs ocupados para los próximos N días.
  · `POST action=reservarMudanza`
    Crea fila en `Mudanzas`. Valida 48h anticipación + ascensor A + LockService.
    Envía email al admin y al residente.
  · `POST action=cancelarMudanza`
    Marca Estado="Cancelada" sin borrar fila. Valida 24h anticipación.
    Envía email al admin y al residente.

### Vigilancia (sept 2026)
  · `GET ?action=vigilanteLogin&password=X`
    Valida contra Config!B2 (contraseña separada del admin).
  · `GET ?action=vigilanteVerResidentes&q=X`
    Busca residentes con datos FILTRADOS (sin correos, celulares ni
    teléfonos). Devuelve nombre, CC, vehículos, mascotas, parqueaderos.
  · `GET ?action=vigilanteVerMudanzas&fecha=YYYY-MM-DD`
    Lista mudanzas Confirmadas futuras + Canceladas recientes (últimos
    30 días) con campos para marcar check.
  · `GET ?action=vigilanteBuscarPorPlaca&placa=X` (oct 2026)
    Búsqueda especializada por placa de vehículo/moto (parcial,
    case-insensitive). Devuelve apartamento, propietario, CC y datos
    del vehículo. Para casos de incidente vehicular.
  · `POST action=vigilanteCheckMudanza`
    Marca check (Sí/No realizado) con LockService y nombre del vigilante.
    Actualiza columnas T (REALIZADA), U (FECHA_CHECK), V (VIGILANTE) en Sheet Mudanzas.

### Estado de cuenta (sept 2026) — todos POST (la cédula no va en la URL)
  · `POST action=ecConsultar` — `{numForm, apto, ccProp}`
    Devuelve periodo, saldo por concepto, factura del mes, últimos 3 pagos,
    `pazYSalvoHabilitado` (si `total cartera < pys_tolerancia`) y `linkPago`.
  · `POST action=ecDescargarFactura` — `{numForm, apto, ccProp}`
    Devuelve `{nombreArchivo, base64}` del PDF de 1 página del apto.
  · `POST action=ecPazYSalvo` — `{numForm, apto, ccProp}`
    Genera el paz y salvo (Google Doc → PDF) y registra en `PazYSalvos`.
    Requiere diligencia `Propietario` (rechaza Arrendatario/Tenedor/Inmobiliaria)
    y `total cartera < pys_tolerancia`.
  · `POST action=ecIniciarCarga` — `{password, periodo, nombrePestana, fechaCorte, filas, pagos, reemplazar}`
    (admin) Crea la pestaña mensual en el Sheet Cartera + carpeta en Drive.
  · `POST action=ecSubirFacturas` — `{password, idCarga, archivos:[{apto, base64}]}`
    (admin) Sube facturas en lotes de 1..10. Idempotente (papelera si ya existe).
  · `POST action=ecFinalizarCarga` — `{password, idCarga}`
    (admin) Valida el conteo de PDFs y marca ACTIVO/HISTORICO/REEMPLAZADO.

  · Reutiliza: `verificarPropietario`, `adminLogin`, `normApto`, `jsonOut`, `SHEET_ID`.
  · Config del Sheet principal → 5 claves nuevas: `cartera_sheet_id`,
    `facturas_folder_id`, `plantilla_pys_id`, `pys_tolerancia`, `link_pago`.

## Despliegue paso a paso (~5 minutos)

### 1. Abre el proyecto Apps Script que ya creé para ti

URL del proyecto (ya está en tu Drive):
  https://script.google.com/d/17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy/edit

### 2. Renombra el proyecto

En la esquina superior izquierda dice "Proyecto sin título". Cámbialo a:
  `Cerro Azul - Formulario Residentes Backend`

### 3. Pega el código

  · En el panel izquierdo verás un archivo llamado `Código.gs` (con un ícono azul)
  · Bórralo si está vacío o tiene código de muestra
  · Abre el archivo `Código.gs` que está en este mismo directorio del repo
  · Selecciona TODO el contenido (Cmd+A o Ctrl+A) y cópialo (Cmd+C o Ctrl+C)
  · Vuelve al editor de Apps Script y pega (Cmd+V o Ctrl+V)
  · Guarda con Ctrl+S (o el ícono del diskette)

### 4. Vincula el proyecto al Sheet

Este paso es necesario para que el script tenga permisos automáticos sobre la hoja:

  · En el menú superior: **Archivo → Mover → Carpeta de Drive del spreadsheet**
  · O alternativamente: clic en el ícono de "Servicios" (+ al lado de "Bibliotecas")
     y añade "Google Sheets API"

  Lo más simple: ejecuta la función `getNextFormId` una vez para que autorices los permisos:
    · Selecciona la función `getNextFormId` en el dropdown de la barra superior
    · Clic en **Ejecutar** (▶️)
    · Te pedirá autorizar permisos → "Revisar permisos" → elegir tu cuenta
       → "Advanced" → "Go to Cerro Azul... (unsafe)" → "Allow"
    · Si te sale error (porque el sheet está vacío), no importa, solo era para autorizar.

### 5. Desplegar como Web App

  · Menú superior derecho: **Implementar → Nueva implementación**
  · Ícono del engranaje ⚙️ → selecciona **Aplicación web**
  · Configurar:
      · Descripción: `Backend formulario residentes v1`
      · Ejecutar como: **Yo (tu correo)**
      · Quién tiene acceso: **Cualquier persona** (porque la página pública debe poder escribir)
  · Clic en **Implementar**
  · Google te pedirá autorizar de nuevo (es normal, esta vez para la implementación)
  · **COPIA LA URL** que aparece (formato: `https://script.google.com/macros/s/AKfyc.../exec`)
  · Esa URL es la `APPS_SCRIPT_URL` que hay que pegar en `js/app.js` de la página web.

### 6. Conectar la página web al backend

  · Abre el archivo `js/app.js` del repositorio
  · Línea 6: `const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || '';`
  · Cámbiala a:
    ```js
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/TU_URL_AQUI/exec';
    ```
  · Commit y push al repo. La página se actualizará automáticamente en 1 minuto.

### 7. Prueba end-to-end

  · Abre https://fabig76.github.io/cerro-azul-residentes/
  · Llena el formulario (mínimo los obligatorios)
  · Envía
  · Verifica que en el Sheet aparezca una fila nueva con N° Formulario tipo `CA-0001`
  · Recarga la página, ve a "Editar mi registro", ingresa `CA-0001` y el N° de apto
  · Verifica que carguen los datos y puedas editarlos

## Solución de problemas

### El botón "Enviar" no hace nada

  · Abre la consola del navegador (F12 → Consola)
  · Verás el error real. Lo más común: la URL del Apps Script está mal pegada.

### "Acción no reconocida" o error 401/403

  · El Apps Script no está bien desplegado
  · Vuelve a Implementar → Administrar implementaciones → verifica que dice "Anyone"

### El Sheet no recibe los datos

  · Verifica que el SHEET_ID en `Código.gs` (línea 9) coincide con la URL de tu Sheet
  · Hoja debe llamarse `Registros` (renombrada de "Hoja 1")

### Los residentes pueden ver/enviar a la URL del script

  · Esto es esperado: cualquier persona con el QR puede intentar enviar
  · Las validaciones del lado servidor evitan datos vacíos o inválidos
  · Pero NO impide que alguien con conocimientos técnicos envíe datos falsos
  · La administración debe validar la información en el Sheet manualmente

## Seguridad

  · El Apps Script se ejecuta como TU usuario (el admin)
  · Tiene permisos totales sobre el Sheet
  · Cualquiera que descubra la URL del Web App puede enviar datos al Sheet
  · MITIGACIÓN: revisa el Sheet periódicamente y borra filas sospechosas manualmente
  · Para más seguridad, podrías poner un "token compartido" en el payload, pero eso
    requeriría que los residentes lo conocieran, lo cual es impráctico para QR público.

## Actualizar el backend

Si necesitas cambiar el código del backend:
  · Edita `Código.gs` en el editor de Apps Script
  · Implementar → Administrar implementaciones → ícono de lápiz → "Versión: Nueva versión"
  · Clic en Implementar
  · La URL NO cambia (los deployments activos se conservan)

---

## Agente IA — chatAsistente (FEAT-007 v2 / V26)

Endpoint para responder preguntas de residentes/propietarios sobre los
portales usando MiniMax-M3 como LLM y el manual oficial como única fuente.

### Endpoint

- **URL:** `/exec` (mismo Web App que el resto)
- **Método:** `POST`
- **Action:** `chatAsistente`
- **Payload:** `{ action: 'chatAsistente', mensaje: 'texto' }`
- **Response:** `{ ok: true, respuesta: '...' }` o `{ ok: false, error: '...' }`

### Configuración (Script Properties)

| Propiedad | Requerido | Default | Descripción |
|-----------|-----------|---------|-------------|
| `MINIMAX_API_KEY` | SÍ | — | Subscription key de MiniMax |
| `MINIMAX_BASE_URL` | NO | `https://api.minimax.io/anthropic` | Endpoint base del API |
| `MINIMAX_GROUP_ID` | NO | (vacío) | ID de grupo de facturación Subscription Plan |

### Manual embebido (`MANUAL_CERRO` constante)

- **Tamaño:** 44KB / 815 líneas
- **Fuente:** Google Doc `1RUMeIXEcZkzFVTBNKe-F1ZbCTl3PRHpCzCeMFQCJD74` (mantenido por el operador)
- **Ubicación:** línea 3330 de `Codigo.gs`
- **Actualización:** cuando el operador lo cambie, Hermes regenera V_N+1 con la constante actualizada

### Frontend

- **Archivo:** `js/asistente.js` (306 líneas, autocontenido)
- **Cargado en:** los 7 HTML antes de `</body>` (`<script src="js/asistente.js?v=1">`)
- **Cache-buster:** usar `?v=N` en URL de GitHub Pages para invalidar caché del navegador

### Validación

- `mensaje` vacío → `{ok:false, error:'Mensaje vacío.'}`
- `mensaje` >500 chars → `{ok:false, error:'Mensaje demasiado largo...'}`
- Sin `MINIMAX_API_KEY` → `{ok:false, error:'Asistente no configurado...'}`
- HTTP error de MiniMax → `{ok:false, error:'El servicio de IA respondió con error (N)...'}`
- JSON parse error → `{ok:false, error:'Respuesta inválida del servicio de IA.'}`
- Respuesta vacía → `{ok:false, error:'El servicio de IA devolvió una respuesta vacía.'}`

### Tests E2E

Ver `docs/spec-asistente-ia.md` §9 y `docs/CHANGELOG-BUGFIXES.md` (sección FEAT-007 v2).

### Documentación adicional

- `docs/spec-asistente-ia.md` — spec completo
- `docs/proyecto-asistente-ia.md` — resumen ejecutivo
- `docs/manual-asistente-ia.md` — manual para usuarios finales
- `docs/sesion-asistente-2026-10-04.md` — bitácora de la sesión
