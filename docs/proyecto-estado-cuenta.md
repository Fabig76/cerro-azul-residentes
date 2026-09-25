# Proyecto Estado de Cuenta — Cerro Azul

> Documento vivo del módulo contable. Para el detalle técnico ver
> `docs/spec-estado-cuenta.md` y `apps-script/modulo-estado-cuenta.gs`.

---

## 1. Contexto

Nuevo módulo del proyecto `Fabig76/cerro-azul-residentes`. Permite a los
propietarios de la Urbanización Cerro Azul (NIT 900770444, Bello / Niquía,
Antioquia) consultar su estado de cuenta, descargar SU factura y generar
el paz y salvo, sin pasar por el administrador.

Reemplaza el flujo manual de "¿cuánto debo? → correo al admin → admin
busca el PDF en su computador → lo reenvía".

---

## 2. Stack (mismo que el proyecto de residentes)

  · Frontend: HTML/CSS/JS vanilla en GitHub Pages
  · Backend:  Apps Script Web App (mismo proyecto Apps Script del formulario
               de residentes — V12 ya desplegado el 25-Sept-2026)
  · BD:        Google Sheets (Sheet nuevo "Cartera", no reemplaza "Base
               datos Cerro azul formato")
  · Drive:     nueva carpeta operativa `Portal Estado de Cuenta` con
               subcarpetas por mes

Cero costos adicionales, cero servidores propios, cero dependencias nuevas
de runtime (libs CDN solo en cartera-admin, no en el portal del propietario).

---

## 3. Estructura de archivos (al 25-Sept-2026)

```
cerro-azul-residentes/
├── index.html                          ← formulario público (sin cambios)
├── admin.html                          ← portal admin residentes (sin cambios)
├── vigilantes.html                     ← portal vigilantes (sin cambios)
├── cartera-admin.html                  ← NUEVO: cargador del admin (Fase 3)
├── js/
│   ├── app.js                          ← formulario público (sin cambios)
│   ├── admin.js                        ← portal admin residentes (sin cambios)
│   ├── vigilantes.js                   ← portal vigilantes (sin cambios)
│   ├── cartera-procesador.js           ← NUEVO: extractor Excel+PDF (Fase 2)
│   └── cartera-admin.js                ← NUEVO: lógica del cargador (Fase 3)
├── apps-script/
│   ├── Codigo.gs                       ← 42 funciones (en repo público)
│   └── modulo-estado-cuenta.gs         ← NO en repo (privado, en Drive)
└── docs/
    ├── spec-estado-cuenta.md           ← NUEVO: spec del analista
    ├── proyecto-estado-cuenta.md       ← NUEVO: este archivo
    └── (otros docs existentes sin cambios)
```

`Codigo.gs` en el repo sigue siendo V10 (sin módulo ec*). El Apps Script
desplegado tiene V12 (V10 + modulo-estado-cuenta.gs pegado al final).
`Codigo.gs` NO se commitea al repo público por seguridad (miembros del
repo podrían ver el código). El módulo completo se guarda en Drive y
lo baja el operador manualmente para pegarlo en el editor de Apps Script.

---

## 4. Recursos en Drive del Cerro Azul

Carpeta operativa del módulo (Fase 0):
  · ID carpeta:       `1xMC-6p9zRBgg6TQk5dey8-DxSnhnFoEl`
  · Contiene:
    - `Facturas/`     → subcarpeta `1T3QRPZjBD0-3Vz8DQrNLAzzo7p3yLhwr`
                        (aquí se crean `Facturas 2026-08 (...)` por carga)
    - `Cartera`       → Google Sheet `1IQn1y3AoArQSI4dtwhUsH3PVGm0zsZCom0TEdSAfVb4`
                        (vacío al inicio; ecSetup crea _Control, Pagos, PazYSalvos)
    - `Paz y salvo`   → Google Doc `1BBgzAbWDlhkew7RDXrDaK7YO5zGATFem-5PMSSLMXoo`
                        (con marcadores {{APTO}}, {{FECHA_EXPEDICION}},
                         {{FECHA_CORTE}}, {{CONSECUTIVO}}, {{CODIGO}})
    - `cartera-admin.html`, `cartera-admin.js`, `cartera-procesador.js`,
      `modulo-estado-cuenta.gs`, `spec-estado-cuenta.md` (md5 verificados)

Carpeta de backups del proyecto (pre-cambios del módulo):
  · ID carpeta:       `1lHoBqyE2lig08WxsU1XqTVpT8nASfKht`
  · Contiene 14 archivos del proyecto pre-Fase 0 (md5 verificados)

Sheet principal (formulario de residentes, sin cambios estructurales):
  · ID:               `16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`
  · Pestaña `Config`: se agregaron 5 claves nuevas (filas 4-8):
                        cartera_sheet_id, facturas_folder_id, plantilla_pys_id,
                        pys_tolerancia, link_pago

Apps Script (mismo proyecto que formulario de residentes):
  · ID:               `17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy`
  · Versión actual:   V12 (25-Sept-2026, 93KB, 67 funciones)
  · URL Web App:      `https://script.google.com/macros/s/AKfycbxp...Zp/exec`

---

## 5. Backend (Apps Script)

### 5.1 Pegado al final de Codigo.gs

`apps-script/modulo-estado-cuenta.gs` se pega **al final** de Codigo.gs
después de `vigilanteBuscarPorPlaca`. NO modifica funciones existentes.
Agrega 22 funciones `ec*` (helpers + 6 endpoints públicos).

### 5.2 Único cambio en código existente (6 líneas en doPost)

```js
const action = String(payload.action || '').trim();
// --- ESTADO DE CUENTA (spec-estado-cuenta.md) ---
if (action === 'ecConsultar')        return jsonOut(ecConsultar(payload));
if (action === 'ecDescargarFactura') return jsonOut(ecDescargarFactura(payload));
if (action === 'ecPazYSalvo')        return jsonOut(ecPazYSalvo(payload));
if (action === 'ecIniciarCarga')     return jsonOut(ecIniciarCarga(payload));
if (action === 'ecSubirFacturas')    return jsonOut(ecSubirFacturas(payload));
if (action === 'ecFinalizarCarga')   return jsonOut(ecFinalizarCarga(payload));
```

⚠️ Cualquier `action` no reconocida cae en `submitRecord(payload)` (compatibilidad).
Un nombre mal escrito NO devuelve error — intenta crear un registro.

### 5.3 Los 6 endpoints públicos (POST)

| Endpoint              | Auth                  | Función                                          |
|-----------------------|-----------------------|--------------------------------------------------|
| ecConsultar           | CA-XXXX+apto+CC       | Estado de cuenta + 3 últimos pagos + factura    |
| ecDescargarFactura    | CA-XXXX+apto+CC       | PDF de 1 página (base64)                          |
| ecPazYSalvo            | CA-XXXX+apto+CC       | Genera PDF paz y salvo con consecutivos             |
| ecIniciarCarga         | admin password        | Crea pestaña en Sheet + carpeta en Drive         |
| ecSubirFacturas        | admin password        | Sube PDFs en lotes de 10 (idempotente)            |
| ecFinalizarCarga       | admin password        | Valida count + cambia estados ACTIVO/HISTORICO   |

### 5.4 P2 confirmado por el operador

`ecPazYSalvo` solo permite generar paz y salvo si `diligencia === 'Propietario'`.
Arrendatario, Tenedor, Inmobiliaria son rechazados (aún si tienen saldo ≤ 0).

Línea agregada después de `ecContexto()`:
```js
if (ctx.verif.diligencia !== 'Propietario') {
  return { ok: false, error: 'El paz y salvo solo puede ser solicitado por el propietario del inmueble.' };
}
```

---

## 6. Frontend (GitHub Pages)

### 6.1 cartera-admin.html (cargador del administrador) — FASE 3 ✓

  · Login con admin_password (mismo que `admin.html`)
  · Selecciona 2 archivos: Excel cartera + PDF unificado
  · "Analizar" → llama `parsearCartera`, `leerPdf`, `agruparFacturas`,
    `cruzar` (todo en navegador, sin enviar al servidor)
  · Valida que no haya campos null, que no haya aptos solo en cartera o
    solo en PDF
  · "Publicar" → `ecIniciarCarga` → `subirFacturas` (lotes de 10) →
    `ecFinalizarCarga`
  · Maneja `PESTANA_EXISTE` con confirm()
  · onbeforeunload durante la subida

### 6.2 estado-cuenta.html (portal del propietario) — FASE 4 ✓ COMPLETADA

  · Login con CA-XXXX+apto+CC (mismo flujo que pestaña "Editar mi registro")
  · Llama `ecConsultar` → muestra:
    - Apto + nombre propietario
    - Saldo pendiente (o "a favor", o "sin saldo")
    - Tabla de conceptos (solo los != 0)
    - "Últimos 3 pagos" (Abono último mes por periodo)
    - Botón "Descargar mi factura" si `facturaDisponible`
    - Botón "Pagar en línea" si `linkPago` configurado
    - Botón "Paz y salvo" si `pazYSalvoHabilitado` (total_cartera < tolerancia)
  · Sin librerías externas. Descargas con `descargarBase64()` (atob + Blob).

---

## 7. Decisiones del operador (25-Sept-2026)

  · **P1 (texto paz y salvo)**: usar "con corte al {{FECHA_CORTE}}" como
    recomienda el analista. Plantilla Google Doc editada por el operador.

  · **P2 (¿quién puede pedir paz y salvo?)**: SOLO Propietario. NO
    Arrendatario, NO Tenedor, NO Inmobiliaria. Confirmado por el operador.

  · **P3 (historial inicial)**: cargar agosto + septiembre (cuando se
    implemente Fase 3). El operador subió ambos PDFs a Drive.

  · **P4 (link Jelpit)**: confirmado pero guardado SIN parámetros
    (`https://web-conjuntos.jelpit.com/pagar-mi-administracion#/`) —
    el botón "Pagar en línea" abre esta URL base. El operador decidirá
    después si quiere parametrizar por apto.

  · **Regla paz y salvo**: `total_cartera < pys_tolerancia` (default 1000).
    Incluye saldo 0, saldo a favor (negativo), y residuos menores a $1.000.

---

## 8. Bugs encontrados durante implementación

  · **6c1a2de** — `cartera-procesador.js` no se había commiteado al
    primer push (404 en GitHub Pages). Detectado en validación E2E.
    Fix: commit + push del archivo.

  · **61a13fd** — `$alert()` en `js/cartera-admin.js` verificaba si
    `#view-login` estaba visible para elegir entre `#alert` y `#alertCarga`.
    Bug: cuando el operador estaba en vista carga, el alert de error
    ("Seleccioná ambos archivos") se renderizaba en `#alert` (oculto).
    Fix: ahora verifica si `#view-carga` está visible.

  · **5594e1c** — cache-busting. El navegador del operador cacheaba
    `cartera-admin.js` incluso después del push. Fix: agregar `?v=3`
    al `src` del script en `cartera-admin.html`.

  · **59762ca** — sin feedback en `analizar()`. El operador reportó
    "no pasa nada" al hacer click en Analizar. Causa: `leerPdf` procesa
    625 páginas con callback vacío (tarda 1-3 min sin señal). Fix:
    barra de progreso visible + console.log de diagnóstico.

  · **e6f9734** — `ReferenceError: pdfBuf is not defined`. El análisis
    hacía todo el trabajo (Excel + PDF + cruzar) y fallaba AL FINAL.
    Causa: `pdfBuf` se declaraba con `const` DENTRO del try pero se usaba
    FUERA (`_pdfBuffer = pdfBuf.slice(0)`). `const` tiene scope de bloque.
    Fix: declarar `let pdfBuf` fuera del try. **No lo detectó node --check**
    (solo valida sintaxis, no alcance de variables).

  · **9c652f7** — (a) `descargarBase64 is not defined`: la función se
    usaba en descargarFactura/descargarPazYSalvo pero nunca se definió
    (se omitió al escribir el archivo). (b) "Unexpected token '<'":
    `post()` usaba `r.json()` directo y fallaba con error confuso si el
    backend devolvía HTML. Fix: agregar la función + post() con
    `r.text()` + `JSON.parse` try/catch.

  · **039a24b** — `URL.createObjectURL is not a function`. Causa: la
    variable `const URL = 'https://...'` tapaba (shadowing) el objeto
    global `window.URL`, que expone `URL.createObjectURL`. Fix: renombrar
    a `APP_URL`. **Lección: NUNCA nombrar una variable "URL" en JS de
    navegador.**

  · **Carga de Drive requiere confirm=t**: archivos `.js` y `.html` no
    se pueden descargar de Drive con `drive.google.com/uc?export=download`
    (devuelve HTML de "Virus scan warning"). Hay que usar
    `drive.usercontent.google.com/download?id=X&export=download&confirm=t`.

---

## 9. Hallazgos validados contra archivos reales

  · Cartera agosto: 625 apartamentos, 12 columnas, sin duplicados
    · 178 en 0 exacto
    · 129 con saldo a favor (negativo)
    · 22 con deuda < $1.000 (residuos)
    · 307 con saldo ≤ 0 (paz y salvo potencial)
    · Tipos: 100% "Apartamento" (no hay locales)
    · Rango: 101-318 (Torre 3) + 800-820 + 1025-1118 + 1604-1701 +
      20319 (raro) + 9804-9912 (Torre 1)

  · PDF septiembre: 625 páginas, una por apartamento
    · Software: COLON (www.colonsoft.com)
    · IVA 19%, Interés 2.188%
    · Cuenta cobro: AHORROS DAVIVIENDA N° 398300133475
    · Link Jelpit cortado en 2 líneas (`...utm_campaign=QR` + `_CONJUNTO...`)
    · **Orden NO coincide con cartera** (275/625 coinciden)
      → extraer por REF.PAGO, NO por número de página
    · `pdf.js` lee por coordenadas (no visual), requiere leer el valor
      numérico a la derecha de cada etiqueta

  · Paz y salvo (template): 4 campos variables ({{APTO}},
    {{FECHA_EXPEDICION}}, {{FECHA_CORTE}}, {{CONSECUTIVO}}, {{CODIGO}})
    + texto legal fijo (Ley 675/2001 art. 29 y 51 numeral 13)
    + representante legal Heyler Fabio Guaza, Resolución Alcaldía
      Bello 202600011353

  · Procesador verificado localmente (Fase 2) — 13/13 checks:
    parsearCartera → periodo/nombre/fechaCorte/625 aptos
    leerPdf → 625 páginas sin null
    agruparFacturas → 625 grupos
    cruzar → 0 discrepancias
    normAptoJs → 6/6 casos OK

---

## 10. Estado al cierre de Fase 5 (25-Sept-2026)

| Componente                              | Estado                        |
|-----------------------------------------|-------------------------------|
| Apps Script V12 desplegado               | ✓                             |
| Config con 5 claves nuevas              | ✓ (operador las agregó)       |
| Sheet Cartera con _Control/Pagos/PazYSalvos | ✓ (ecSetup las creó)      |
| Procesador validado Fase 2              | ✓ (13/13 checks)              |
| cartera-admin.html pusheado             | ✓ (con cache-busting ?v=5)    |
| js/cartera-procesador.js pusheado       | ✓                             |
| Carga agosto 2026 publicada             | ✓ (625 facturas en Drive)     |
| estado-cuenta.html pusheado             | ✓ (portal del propietario)    |
| js/estado-cuenta.js pusheado            | ✓ (con fixes de descarga)     |
| index.html con link al pie              | ✓                             |
| Paz y salvo generado                    | ✓ (PYS-00001..00005)          |
| Plantilla paz y salvo a 1 página        | ✓ (eliminados 9 párrafos vacíos)|
| Descarga de factura y paz y salvo       | ✓ (validado por el operador)  |
| Validación 3 escenarios (saldo 0/deuda/arrendatario) | ✓            |

Datos de prueba (3 escenarios):
  · Paz y salvo (saldo 0):    CA-0055 | apto 105 | CC 11786889
  · Factura (deuda $426.300): CA-0070 | apto 503 | CC 71745644
  · Rechazo (arrendatario):   CA-0062 | apto 1527 | CC 1036649914

---

## 11. Próximas fases (spec §11)

  · **Fase 6** — Recarga y cambio de mes
    · Volver a publicar el mismo mes → REEMPLAZADO
    · Publicar septiembre → agosto HISTORICO, septiembre ACTIVO

  · **Fase 7** — Documentación completa
    · Actualizar GUIA-PROYECTO.md con nueva sección
    · Actualizar README-project.md
    · Actualizar apps-script/README.md (endpoints nuevos)
    · Agregar a `.gitignore`: `*.xls`, `*.xlsx`, `*.pdf`, `*.PDF`

---

## 12. Reglas operativas aprendidas

  · Apps Script Web App POST NO se puede testear con curl desde sandbox
    (devuelve "Datei kann derzeit nicht geöffnet werden" en alemán) —
    usar `browser_console.expression` con fetch desde una página real.

  · Cualquier `action` no reconocida cae en `submitRecord` en doPost —
    nombres exactos de endpoints críticos.

  · El Sheet principal `Base datos Cerro azul fomato` NUNCA debe
    tener filas eliminadas manualmente (BUGFIX-001/002 lo demostraron).

  · `pdf.js` requiere `GlobalWorkerOptions.workerSrc` configurado
    antes de usar `getDocument()`.

  · El operador NO tiene acceso al sandbox — todo cambio en `Codigo.gs`
    se sube a Drive (carpeta operativa) con nombre versionado y md5
    verificado, y él lo baja manualmente.

  · El cache del navegador del operador es muy agresivo — usar
    `?v=N` en los `src` de los scripts para forzar recarga después de
    un push que arregla bugs.
