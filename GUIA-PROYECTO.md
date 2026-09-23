# Guía de Referencia del Proyecto Formato de Datos PH

> Documento vivo. Cada vez que Hermes trabaje en este proyecto (en esta o
> futuras conversaciones), debe leer este archivo primero para tener
> contexto completo sin que tengas que repetir lo que ya hablamos.

---

## Índice

  1. [Contexto del proyecto](#1-contexto-del-proyecto)
  2. [Stack y arquitectura](#2-stack-y-arquitectura)
  3. [Repositorios](#3-repositorios)
  4. [Google Sheet destino](#4-google-sheet-destino)
  5. [Google Apps Script](#5-google-apps-script)
  6. [Página web (frontend)](#6-página-web-frontend)
  7. [QR](#7-qr)
  8. [Archivos en Drive](#8-archivos-en-drive)
  9. [Decisiones de diseño](#9-decisiones-de-diseño)
  10. [Problemas encontrados y soluciones](#10-problemas-encontrados-y-soluciones)
  11. [Pendientes y siguientes pasos](#11-pendientes-y-siguientes-pasos)
  12. [Comandos útiles](#12-comandos-útiles)
  13. [Checklist de mantenimiento](#13-checklist-de-mantenimiento)
  14. [Respaldos](#14-respaldos)
  15. [Manuales de uso para residentes](#15-manuales-de-uso-para-residentes)

---

## 1. Contexto del proyecto

### Cliente y necesidad

  · **Cliente**: Fabio Lesmes, administrador de la **Urbanización Cerro Azul**
  · **NIT**: 900770444
  · **Ubicación**: Bello / Niquía (Antioquia, Colombia)
  · **Necesidad**: Reemplazar el formato PDF impreso de "Actualización y
    manejo de datos de residentes" por un formulario web público accesible
    vía QR, conectado a Google Sheets como base de datos.

### Marco legal colombiano

  · **Ley 1581 de 2012**: Protección de Datos Personales. Obliga a las PH
    a tener consentimiento explícito del titular, informar finalidades,
    y respetar derechos ARCO (Acceso, Rectificación, Cancelación, Oposición).
  · **Decreto 768 de 2025**: Censo obligatorio de animales de compañía
    en propiedad horizontal. Para caninos de manejo especial (Ley 1801/2016
    arts. 128 y 134) requiere registro + póliza de responsabilidad civil.
  · Sanciones por incumplimiento: hasta 2.000 SMLMV.

### Cuentas de Google involucradas

  · **computadores.y.portatiles@gmail.com** (cuenta personal de Fabio)
    · Token OAuth guardado en `/root/.hermes/google_token.json`
    · Tiene scopes: gmail, drive, documents, spreadsheets, calendar
    · Rol en el Sheet de Cerro Azul: **WRITER** (puede editar, no es owner)
  · **urb.cerroazul@gmail.com** (cuenta del conjunto)
    · Es la **OWNER** del Sheet de Cerro Azul
    · Aquí está desplegado el Apps Script
  · **fabig76@gmail.com** (cuenta personal secundaria, según documentado
    en MEMORY como correo de contacto del repo formato-datos-ph)

### Lo que NO se debe hacer

  · **NO revocar el token OAuth de computadores.y.portatiles@gmail.com**:
    afectaría los proyectos de correos-pagos-cerro-azul y citofono-cerro-azul.
    El usuario bloqueó re-autenticación en esta conversación (4-Sep-2026).
  · **NO subir secrets ni API keys al repo público**.
  · **NO usar la contraseña de aplicación Google para Sheets/Drive/Apps Script**:
    solo sirve para SMTP de Gmail. Para esos servicios hay que usar OAuth.

---

## 2. Stack y arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Residente escanea QR ──► Abre página pública (GitHub Pages)    │
│                                  │                               │
│                                  ▼                               │
│                          Formulario HTML/CSS/JS                  │
│                                  │                               │
│                                  ▼                               │
│                    Google Apps Script Web App                    │
│                                  │                               │
│                                  ▼                               │
│                            Google Sheets                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Componentes

  · **Frontend**: HTML5 + CSS3 + JavaScript vanilla. Cero dependencias externas.
  · **Hosting**: GitHub Pages (HTTPS gratis, CDN global).
  · **Backend**: Google Apps Script como Web App.
  · **Base de datos**: Google Sheets.
  · **QR**: Generado con Python (`qrcode` + `Pillow`) una sola vez.

### ¿Por qué este stack?

  · Cero costos, cero mantenimiento de servidor.
  · El Sheet permite edición colaborativa, exportación, gráficos.
  · El Apps Script escala solo, sin DevOps.
  · La página web es estática: imposible de hackear por el lado del cliente.

---

## 3. Repositorios

### `Fabig76/cerro-azul-residentes` (público)

  · **Propósito**: Implementación específica del Cerro Azul. Contiene el
    código EXACTO en producción.
  · **URL pública**: https://fabig76.github.io/cerro-azul-residentes/
  · **Estructura**:
    ```
    cerro-azul-residentes/
    ├── README-project.md          (no es index.html)
    ├── index.html                 (formulario)
    ├── .nojekyll                  (desactiva Jekyll)
    ├── assets/
    │   ├── logo.jpg
    │   └── styles.css
    ├── js/
    │   └── app.js
    ├── apps-script/
    │   ├── Código.gs              (backend, codificación UTF-8)
    │   └── README.md              (instrucciones de deploy)
    └── qr-formulario-cerro-azul.png
    ```

### `Fabig76/formato-datos-ph` (público)

  · **Propósito**: Plantilla reusable + documentación para replicar en
    otras propiedades horizontales.
  · **URL pública**: https://fabig76.github.io/formato-datos-ph/
  · **Estructura**:
    ```
    formato-datos-ph/
    ├── README.md                  (overview + arquitectura)
    ├── LICENSE                    (MIT)
    ├── index.html                 (landing page del repo)
    ├── .nojekyll
    ├── docs/
    │   ├── guia-implementacion.md
    │   ├── arquitectura.md
    │   ├── seguridad-y-privacidad.md
    │   ├── personalizacion.md
    │   └── troubleshooting.md
    ├── plantillas/
    │   ├── configuracion-ph.md
    │   ├── correo-autorizacion.md
    │   └── recordatorio-residentes.md
    ├── scripts/
    │   └── generar-qr.py
    └── implementaciones/
        └── cerro-azul/            (código verbatim del Cerro Azul)
            ├── README.md
            ├── apps-script/
            │   ├── Codigo.gs
            │   └── README.md
            ├── web/
            │   ├── index.html
            │   ├── assets/{logo.jpg, styles.css}
            │   └── js/app.js
            ├── qr/
            │   └── qr-formulario-cerro-azul.png
            └── docs/capturas-pantalla/   (vacío, agregar)
    ```

### Código local en este sandbox

  · Cerro Azul: `/root/cerro-azul-residentes/`
  · Plantilla: `/root/formato-datos-ph/`
  · Recursos descargados: `/tmp/cerro-azul-formato/`
  · Logo + formato PDF referencia: `/root/.hermes/reference/cerro-azul/`

---

## 4. Google Sheet destino

  · **ID**: `16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`
  · **URL**: https://docs.google.com/spreadsheets/d/16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc/edit
  · **Nombre**: "Base datos Cerro azul fomato"
  · **Owner**: urb.cerroazul@gmail.com (cuenta del conjunto)
  · **Writer**: computadores.y.portatiles@gmail.com (cuenta de Fabio)

### Hojas

  · **"Registros"** (renombrada de "Hoja 1"): 138 columnas
    · Fila 1 congelada con formato azul Cerro Azul (#0066CC), texto blanco, negrita
    · Validación de "Diligencia como" (Propietario/Arrendatario/Tenedor / Otro)
  · **"Maestros"** (auxiliar, vacía): Apto | Estado | Notas
    · Pensada para validaciones futuras contra listado de aptos del conjunto

### Estructura de columnas (143 en total, A:EM)

Los nombres exactos están en `apps-script/Código.gs` y `app.js`. Resumen
actualizado al 7-Sep-2026 (v2):

```
A: N° Formulario (CA-0001, CA-0002...)
B: Fecha Registro
C: Fecha Última Edición
D: N° Apto (LLAVE DE DEDUPE)
E: Diligencia como
F-J: Propietario (nombre, CC, correo, celular, tel fijo)
K: N° Parqueadero 1
L: Matrícula Parqueadero 1
M: N° Parqueadero 2
N: Matrícula Parqueadero 2
O: Matrícula del Apto
P: Requiere Revisión Matrículas (Sí/No)
Q: Observaciones Matrículas (texto libre)
R-U: Arrendatario (4 campos)
V-X: Parqueadero tercero (3)
Y-AC: Inmobiliaria (5)
AD-AO: Residentes (4 personas × 5 campos = 20)
AP-AS: Menores (4 × 3 = 12)
AT-BE: Vehículos (2 × 6 = 12)
BF-BQ: Motos (2 × 6 = 12)
BR-BY: Bicicletas (2 × 4 = 8)
BZ-CA: Llaveros/Tags autorizados (2)
CB-CN: Dispositivos (3 × 5 = 15)
CO-DX: Mascotas (2 × 10 = 20)
DY-ED: Emergencias (2 × 3 = 6)
EE-EG: Autorizaciones (3)
EH-EJ: Firma (3)
EK (143): Hash Dedupe (sha256[:16] de apto+cc+firma)
```

**Cambio v2 (7-Sep-2026)**: se agregaron 5 columnas nuevas (K..Q renombradas
+ M..Q nuevas) para separar N° de parqueadero de N° de apto, y para habilitar
el lookup automático de matrículas. Total: 138 → 143 columnas.

---

## 5. Google Apps Script

  · **Script ID**: `17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy`
  · **URL editor**: https://script.google.com/d/17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy/edit
  · **Cuenta dueña**: urb.cerroazul@gmail.com (NO está en Drive de Fabio)
  · **Nombre del proyecto**: "Cerro Azul - Formulario Residentes Backend"
  · **Web App URL**: `https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec`
  · **Esta URL está hardcodeada** en `js/app.js` línea 5.

### Configuración del deployment

  · Tipo: **Aplicación web**
  · Ejecutar como: **Yo** (urb.cerroazul@gmail.com)
  · Quién tiene acceso: **Cualquier persona**

### Funciones principales

  · `doGet(e)` con `?action=nextId` → devuelve `{ok:true, nextId:"CA-XXXX"}`
  · `doGet(e)` con `?action=lookup&numForm=X&apto=Y` → devuelve fila
  · `doGet(e)` con `?action=lookupMatApto&apto=X` → consulta Sheet de matrículas,
    devuelve `{ok, encontrado, matricula, fuente}` donde fuente ∈ {'torre3','torre1'}
  · `doGet(e)` con `?action=lookupMatParq&celda=X` → consulta Sheet de matrículas,
    devuelve `{ok, encontrado, matricula, tipo}` donde tipo ∈ {'Privado','Común'}
  · `doPost(e)` con payload JSON → crea o actualiza fila
  · `getNextFormId()` → correlativo CA-0001, CA-0002...
  · `findRowByApto(apto)` → busca fila existente por N° Apto
  · `findRowByNumFormAndApto(numForm, apto)` → busca para edición
  · `lookupMatriculaApto(apto)` → lee cache o reconstruye desde
    "Torre 3 - Etapa 1" y "Torre 1 - Etapa 2" del Sheet matriculas-cerro-azul
  · `lookupMatriculaParq(celda)` → lee cache o reconstruye desde
    "Parqueaderos - Etapa 3" del Sheet matriculas-cerro-azul
  · `submitRecord(data)` → orquesta creación/edición con validaciones
  · `buildRowFromPayload(d, numForm, fechaReg)` → array de 143 valores
  · `rowToObject(rowArr)` → convierte fila del Sheet a objeto JS para edición

### Sheet de matrículas (referencia)

  · ID: `1ceGtZDUJHX4yxs5_ydDwLwtrkOcZwYh09WUG0st_b0Y`
  · Nombre: "matriculas-cerro-azul"
  · Pestañas consultadas (solo lectura):
   · "Torre 3 - Etapa 1" — 198 aptos (121..318), matrículas 5377499-5377696
    · "Torre 1 - Etapa 2" — 234 aptos (9804..10037), matrículas 5428477-5428710
    · "Parqueaderos - Etapa 3" — 337 celdas privadas + 25 comunes (mat 5397790-5398117)
  · Torre 2 (185 unidades) NO tiene pestaña porque RPH no ha asignado matrículas
  · Apps Script lee con `SpreadsheetApp.openById(MATRICULAS_SHEET_ID)`
  · Cache en memoria se reconstruye por request (las tablas son chicas)
  · Para Torre 1, los aptos se escriben sin comas/puntos (ej: "9804", no "9.804").
    Función `normApto()` quita separadores antes de buscar.

### Validaciones del backend

Obligatorios (devuelve error si falta):
  · N° Apto
  · Diligencia como (debe ser Propietario/Arrendatario/Tenedor / Otro)
  · Nombre y cédula del titular
  · Correo del titular (formato válido)
  · Celular del titular
  · Checkbox de autorización de datos
  · Nombre y cédula en la firma
  · v2: Si el apto NO está en la base de matrículas y el residente no escribió
    la matrícula manualmente → error con instrucción de escribirla

### Lógica de edición

  · En modo edición, el cliente envía `editMode: true` + `numForm` + `apto`
  · El backend busca la fila coincidente
  · Si no coincide, rechaza con error de seguridad
  · Si coincide, actualiza la misma fila (mismo rowNumber)
  · El N° de Formulario se CONSERVA
  · `Fecha Registro` se preserva; `Fecha Última Edición` se actualiza

---

## 6. Página web (frontend)

  · **URL**: https://fabig76.github.io/cerro-azul-residentes/
  · **Colores del tema** (`assets/styles.css` `:root`):
    · `--azul: #0066CC` (botones, bordes)
    · `--azul-osc: #004C99` (hover)
    · `--azul-claro: #E6F0FA` (fondos suaves)
    · `--verde-azul: #00A89C`
    · `--naranja: #F39200` (aviso legal)
    · `--gris-tx: #333333`

### Estructura HTML

  · **Header** con logo + nombre + NIT + dirección + aviso legal naranja
  · **Tabs**: "Enviar / Crear" y "Editar mi registro"
  · **Modo Crear**: formulario con 11 secciones plegables (click en el header)
  · **Modo Editar**: pide N° Form + N° Apto, luego carga el formulario
  · **Tarjeta de éxito**: muestra el N° Form con botón "Imprimir comprobante"

### 11 secciones (idénticas al PDF original)

  0. Encabezado (Copropiedad, NIT, Dirección, Fecha, Diligencia como)
  1. Datos del propietario (titular)
  2. Datos del encargado o administrador del inmueble (opcional)
  3. Parqueadero autorizado a tercero (opcional)
  4. Inmobiliaria y/o representante (opcional)
  5. Residentes mayores (hasta 4)
  5.1. Menores (hasta 4)
  6. Vehículos y motos (2 + 2)
  7. Bicicletas (2)
  8. Llaveros y tags (3 dispositivos)
  9. Mascotas (2, con campos para manejo especial)
  10. Contactos de emergencia (2)
  11. Autorización + firma

### Validación del cliente (`js/app.js`)

  · `validar()` revisa obligatorios antes de enviar
  · Marca campos en rojo (clase `has-error`)
  · Scroll automático al primer error
  · Expande secciones con errores

### Texto legal (sección 11)

  · Menciona Urbanización Cerro Azul, NIT 900770444
  · 5 finalidades del tratamiento
  · Correo para derechos ARCO: urb.cerroazul@gmail.com
  · 3 checkboxes de autorización
  · Firma = nombre + cédula + fecha

### `js/app.js` lógica

  · Recolecta todos los campos en un payload
  · `fetch()` POST con `Content-Type: text/plain;charset=UTF-8` (workaround
    CORS Apps Script)
  · `body: JSON.stringify(payload)`
  · Muestra `data.numForm` en la tarjeta de éxito

---

## 7. QR

  · **Archivo local**: `/root/cerro-azul-residentes/qr-formulario-cerro-azul.png`
  · **Tamaño**: 800×1000 px, formato PNG
  · **Colores**: azul Cerro Azul (#0066CC) sobre blanco
  · **Error correction**: H (alta — permite 30% de daño)
  · **Contenido**:
    · Título: "Urbanización Cerro Azul"
    · Subtítulo: "NIT 900770444 · Bello / Niquía"
    · Etiqueta: "FORMULARIO DE RESIDENTES"
    · El QR en sí (centrado, 600×600)
    · Instrucciones: "Escanea este código..."
    · URL escrita debajo (por si el QR no escanea)
    · Footer legal: Ley 1581/2012 + Decreto 768/2025
  · **URL a la que apunta**: `https://fabig76.github.io/cerro-azul-residentes/`

### Script generador (en formato-datos-ph)

  · Path: `formato-datos-ph/scripts/generar-qr.py`
  · Uso: `python3 scripts/generar-qr.py "URL" --ph-name "..." --nit "..." --address "..."`
  · Genera dos archivos: con texto decorado + solo el QR
  · Dependencias: `qrcode[pil]` y `Pillow`

---

## 8. Archivos en Drive

Carpeta: `https://drive.google.com/drive/folders/1BooaM5uxGOb1lcfX65Adcqof6PMAF-fq`

  · **QR_Formulario_Residentes_Cerro_Azul.png**
    ID: `12OuEtvwb72m9YZkxpqWteeRIExbIf3cv`
    https://drive.google.com/file/d/12OuEtvwb72m9YZkxpqWteeRIExbIf3cv/view
  · **Formato_manejo_datos_copropiedad.pdf** (PDF original para referencia)
    ID: `1O9nw4ibB_SzzDBEXoWlxykuJrUMnDM3v`
    https://drive.google.com/file/d/1O9nw4ibB_SzzDBEXoWlxykuJrUMnDM3v/view
  · **cerro_azul_logo.jpg**
    ID: `1j0yK0RVUDBWLEn_m5I2vlQ8Z_zLkrGMY`
    https://drive.google.com/file/d/1j0yK0RVUDBWLEn_m5I2vlQ8Z_zLkrGMY/view


  - **Carpeta capturas + prompt video** (14-Sep-2026)
    Folder ID: `18g9pVdktfAu3j7B5NnXOQcUpDUdkUYbR`
    https://drive.google.com/drive/folders/18g9pVdktfAu3j7B5NnXOQcUpDUdkUYbR
  - **Carpeta manuales para residentes** (14-Sep-2026)
    Folder ID: `1NS6M0p5k7u89SiRy52CGxu7VpqmJ66fT`
    https://drive.google.com/drive/folders/1NS6M0p5k7u89SiRy52CGxu7VpqmJ66fT
Drive de Fabio (computadores.y.portatiles@gmail.com):
  · **QR_Formulario_Residentes_Cerro_Azul.png** (subido antes)
    ID: `1UpeVh8jADOSij6iZNX-SPWMQqNmtdaKr`

Spreadsheet basura (creada por error el 5-Sep-2026, ya borrada):
  · ID: `1zbd0LELDzt52MKk45ar8QGW_eaxpMc0WtZi9RGddbsU`
  · Status: en papelera (trashed)

---

## 9. Decisiones de diseño

### Deduplicación por N° Apto

  · El Sheet tiene N° Apto como llave única
  · Al crear: si ya existe, devuelve error con N° Form para que el residente
    use el modo edición
  · En edición: requiere N° Form + N° Apto coincidentes (doble llave)

### N° de Formulario correlativo

  · Formato: `CA-0001`, `CA-0002`, ... (prefijo CA por Cerro Azul)
  · Asignado por `getNextFormId()` que busca el máximo existente + 1
  · Se conserva al editar

### Hash Dedupe (columna 137)

  · sha256[:16] de `apto + cc_titular + cc_firma`
  · Redundante con N° Apto pero útil para:
    · Detectar envíos automatizados (mismo hash repetido)
    · Auditoría de la administración
  · Se calcula en `buildRowFromPayload()` con `Utilities.computeDigest`

### Workaround CORS Apps Script

  · Apps Script Web App NO soporta preflight CORS para `application/json`
  · Workaround: frontend envía `Content-Type: text/plain;charset=UTF-8`
  · Backend parsea el string como JSON manualmente en `doPost()`
  · Esto evita el preflight y el POST funciona desde el navegador

### Modo edición con doble verificación

  · Para editar, residente necesita: N° Form + N° Apto (que conoce) +
    cédula del titular (que aparece en la firma)
  · Sin el N° Form no puede editar; debe solicitarlo a la administración
  · Esto previene que un tercero edite datos ajenos

### Residentes NO pueden borrar

  · El backend solo hace `setValues([row])` (insert/update)
  · No hay función para borrar
  · La administración puede borrar manualmente desde el Sheet si necesita

### Secciones plegables

  · Formulario largo (11 secciones, ~50+ campos)
  · Solo sección 0 (encabezado) abierta por defecto
  · Las demás se expanden con click
  · Si hay error en una sección, se expande automáticamente

---

## 10. Problemas encontrados y soluciones

### P1: Google OAuth no incluye scope Apps Script

**Síntoma**: Intenté usar la Apps Script REST API para crear/subir código
al script programáticamente. Devolvía 404.

**Causa**: El scope `script.projects` no está en el token OAuth de Fabio.

**Workaround aplicado**: Crear Apps Script manualmente desde
script.google.com UI. Fabio pegó el código que yo generé.

**Para evitar**: Si en futuro hay que crear más Apps Scripts, hay 3 opciones:
  1. Re-autenticar agregando el scope (BLOQUEADO por Fabio — rompe
     correos-pagos y citofono)
  2. Crear manualmente desde UI (~5 min, ~5 clics)
  3. Usar Service Account (es un patrón distinto, requiere reconfigurar)

### P2: Apps Script Web App doPost falla con curl

**Síntoma**: Probando con `curl -X POST` devolvía HTTP 405 / HTML de error.

**Causa**: Apps Script Web App acepta POST solo desde navegador real
(tema de CORS/preflight que curl no maneja bien).

**Workaround aplicado**: Probar SIEMPRE desde navegador, ya sea el browser
de testing (`browser_console.expression` con fetch) o la página misma.

**Lección**: NUNCA usar curl para testear Apps Script Web App doPost.

### P3: Apps Script creado vía Drive API no aparece en Drive

**Síntoma**: `drive.files().create(mimeType='application/vnd.google-apps.script')`
devuelve ID válido pero inmediatamente `files().get(fileId=...)` devuelve
404 "File not found".

**Causa**: Inconsistencia de Drive API con archivos standalone de tipo
script. Probablemente restricción del API.

**Workaround aplicado**: Crear el script manualmente desde UI.

### P4: GitHub Pages sirve README.md en vez de index.html

**Síntoma**: Abres `https://[user].github.io/[repo]/` y ves el README
renderizado por Jekyll, no el index.html.

**Causa**: GitHub Pages con Jekyll activado busca primero `README.md` como
fallback.

**Solución aplicada**:
  · Agregar archivo vacío `.nojekyll` en la raíz
  · Renombrar README.md a algo distinto (ej: README-project.md)
  · Si ya estaba configurado y no toma efecto: desactivar Pages y volver
    a activar (fuerza rebuild)

### P5: Apps Script pegado desde GitHub "Raw" tenía encoding raro

**No fue un problema**, pero ojo: si copias el código desde
`raw.githubusercontent.com` y lo pegas, caracteres como `→` (flecha) en
comentarios se preservan bien. Apps Script maneja UTF-8 correctamente.

### P6: Páginas muy anchas en desktop, se ven bien en móvil

**No fue problema** porque el CSS ya era responsive. Confirmado en
inspección visual con `browser_vision`.

### P7: Procedimiento de deploy manual (v2, 7-Sep-2026)

**Contexto**: cada vez que cambia el código del backend Apps Script
(`Código.gs`) o el frontend (`index.html`, `js/app.js`, `assets/styles.css`),
hay que desplegar manualmente. La razón es que el token OAuth de
`computadores.y.portatiles@gmail.com` no incluye el scope `script.projects`,
así que no podemos automatizar el deploy del Apps Script vía API. NO
revocar el token (rompe correos-pagos-cerro-azul y citofono-cerro-azul).

#### Procedimiento paso-a-paso (5 pasos, esperar OK entre cada uno)

**PASO 1 — Pegar Código.gs en el editor de Apps Script**
  · Abrir https://script.google.com/d/17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy/edit
    (sesión urb.cerroazul@gmail.com)
  · Panel izquierdo → "Código.gs" (ícono azul) → Ctrl+A / Cmd+A → BORRAR
  · Abrir /root/cerro-azul-residentes/apps-script/Código.gs
    (alternativa GitHub: https://github.com/Fabig76/cerro-azul-residentes/blob/main/apps-script/Código.gs
     — ojo con el botón "Raw" en algunos navegadores, mejor desde el sandbox)
  · Ctrl+A / Cmd+A → Ctrl+C / Cmd+C
  · Volver al editor de Apps Script → Ctrl+V / Cmd+V → Ctrl+S
  · Verificar que el editor muestre al inicio:
    const NUM_COLS = 143;
    const MATRICULAS_SHEET_ID = '1ceGtZDUJHX4yxs5_ydDwLwtrkOcZwYh09WUG0st_b0Y';
  · **Decir: "PASO 1 HECHO"** y esperar OK

**PASO 2 — Crear NUEVA implementación (deploy manual)**
  · Arriba a la derecha: **Implementar** (botón celeste) → **Nueva implementación**
  · Clic en el engranaje ⚙️ → **Aplicación web**
  · Descripción: `Backend formulario residentes v2 (lookup matriculas)`
  · Ejecutar como: **Yo** (urb.cerroazul@gmail.com)
  · Quién tiene acceso: **Cualquier persona**
  · **Implementar** → autorizar si pide
  · La URL del Web App que aparece debería ser IDÉNTICA a la actual:
    https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec
  · Si es DISTINTA → avisar con la URL nueva (habría que actualizar js/app.js línea 11)
  · **Decir: "PASO 2 HECHO, URL IGUAL"** y esperar OK

**PASO 3 — Probar endpoints lookup desde el navegador** (mismo URL base del Paso 2)
  · `?action=lookupMatApto&apto=121` → `{"ok":true,"encontrado":true,"matricula":"5377499","fuente":"torre3"}`
  · `?action=lookupMatApto&apto=9804` → `{"ok":true,"encontrado":true,"matricula":"5428477","fuente":"torre1"}`
  · `?action=lookupMatApto&apto=9.804` (con punto, prueba normApto) → mismo resultado que 9804
  · `?action=lookupMatApto&apto=99999` → `{"ok":true,"encontrado":false,"matricula":"","fuente":""}`
  · `?action=lookupMatParq&celda=1` → `{"ok":true,"encontrado":true,"matricula":"5397790","tipo":"Privado"}`
  · **Pegar los 5 resultados** y esperar OK

**PASO 4 — Probar formulario end-to-end (requiere push previo del frontend)**
  · Antes de este paso, GitHub Pages sigue mostrando el formulario viejo
    (mismo URL del Web App, así que los endpoints SÍ responden, pero los
    7 campos nuevos NO aparecen en el HTML hasta que Hermes haga push)
  · Si el Paso 4 falla por "el HTML no tiene los campos nuevos" → hacer
    el push primero (cd /root/cerro-azul-residentes && git push origin main)
    y refrescar con Ctrl+Shift+R / Cmd+Shift+R
  · Tests a hacer (todos con Ctrl+Shift+R para forzar cache-bypass):
    · N° Apto `121` → autocompleta Matrícula 5377499 + cartel verde
    · N° Apto `9804` → autocompleta 5428477 + cartel verde
    · N° Apto `99999` → cartel amarillo + Matrícula vacía y obligatoria
    · N° Parqueadero 1 `1` → autocompleta Matrícula 5397790
    · Marcar checkbox revisión → aparece textarea observaciones
  · Enviar formulario con datos de prueba → crear CA-XXXX
  · En el Sheet, verificar que la fila tiene:
    · Columna O (Matrícula del Apto) con el valor autocompletado
    · Columna P (Requiere Revisión) = "No"
    · Hasta columna EJ (Firma) + EK (Hash) = 143 celdas con datos
  · **BORRAR la fila de prueba del Sheet** (clic derecho → Eliminar fila)
  · NO tocar CA-0001
  · **Decir: "PASO 4 HECHO, CA-XXXX creado y borrado"** y esperar OK

**PASO 5 — Verificar CA-0001 en modo edición**
  · Pestaña "Editar mi registro" en el formulario público
  · N° de formulario: `CA-0001`
  · N° de apartamento: `2000`
  · "Cargar registro" → debe cargar los datos de CA-0001
  · Verificar:
    · N° Apto: 2000
    · N° Parqueadero 1: 3000
    · Matrícula Parqueadero 1: (vacío)
    · N° Parqueadero 2 / Matrícula Parqueadero 2: (vacíos)
    · Matrícula del Apto: (vacío — CA-0001 no lo tenía)
    · Requiere Revisión: checkbox destildado
  · NO modificar nada. Cerrar la página (NO enviar)
  · **Decir: "PASO 5 HECHO, todo OK"** y esperar OK para push

#### Después del Paso 5 (con OK) — Push a GitHub
  · `cd /root/cerro-azul-residentes && git push origin main`
  · `cd /root/formato-datos-ph && git push origin main`
  · GitHub Pages se actualiza en 1-2 min
  · Los residentes que entren después ven el formulario v2

#### Plan de rollback
  · **Antes del push** (cambios solo locales): `git reset --hard HEAD~1` en cada repo
  · **Después del push**: `git revert HEAD && git push origin main` en cada repo
  · **Apps Script**: Implementar → Administrar implementaciones → "v1" como activa
  · El Sheet NO se borra solo, solo recibe filas nuevas

#### Verificaciones automáticas que Hermes corre antes de pedirte OK
  · `node --check js/app.js` (sintaxis)
  · Encoding UTF-8 de `Código.gs`
  · Triple consistencia: backend `rowToObject` ↔ frontend `poblarFormulario` ↔ HTML IDs
  · `NUM_COLS = 143` declarado y consistente con offsets
  · `APPS_SCRIPT_URL` apuntando al deploy activo

---

## 11. Pendientes y siguientes pasos

### Inmediatos (próximos días)

  · [ ] Distribuir el QR a los residentes del Cerro Azul (carteleras, WhatsApp)
  · [ ] Enviar correo masivo con plantilla en `plantillas/correo-autorizacion.md`
  · [ ] Revisar el Sheet cada 2-3 días al principio para detectar problemas

### Corto plazo (próximas semanas)

  · [ ] Agregar feature: enviar correo de confirmación al residente con su
        N° de Formulario (requiere MailApp en Apps Script)
  · [ ] Agregar feature: lookup por cédula (residente ingresa cédula,
        recibe N° Form por correo)
  · [ ] Considerar CAPTCHA si hay spam
  · [ ] Hacer backup mensual del Sheet (export a Excel/PDF)

### Mediano plazo (próximos meses)

  · [ ] Validar contra hoja "Maestros" para asegurar que N° Apto existe
  · [ ] Dashboard de administración (% de apartamentos que han enviado)
  · [ ] Notificaciones automáticas a la administración cada vez que alguien envía
  · [ ] Exportación a PDF por residente para impresión

### Features NO recomendadas (por ahora)

  · ❌ Subida de archivos (fotos de mascotas, etc.) — agregaría complejidad
        significativa y costo de almacenamiento
  · ❌ Autenticación con token único por residente — más seguro pero
        menos conveniente para los residentes
  · ❌ Multi-idioma — innecesario para PH colombianas
  · ❌ Pagos en línea — fuera del alcance de este proyecto

---

## 12. Comandos útiles

### Tests del backend

```bash
# Next ID
curl -sL "https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec?action=nextId"

# Lookup (debe devolver ok:false si no existe)
curl -sL "https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec?action=lookup&numForm=CA-0001&apto=101"

# POST con curl (NO funciona — solo navegador — ver P2)
# Usar browser_console.expression en su lugar
```

### Verificar Sheet

```bash
GAPI="python /root/.hermes/skills/productivity/google-workspace/scripts/google_api.py"
$GAPI sheets get 16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc "'Registros'!A1:K5"
```

### Push al repo

```bash
cd /root/cerro-azul-residentes
git add . && git commit -m "mensaje" && git push

cd /root/formato-datos-ph
git add . && git commit -m "mensaje" && git push
```

### Regenerar QR

```bash
cd /root/formato-datos-ph
python3 scripts/generar-qr.py "https://fabig76.github.io/cerro-azul-residentes/" \
  --ph-name "Urbanización Cerro Azul" \
  --nit "900770444" \
  --address "Bello / Niquía"
```

### Test desde navegador (browser_console.expression)

```js
(async () => {
  const resp = await fetch('https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec', {
    method: 'POST',
    headers: {'Content-Type': 'text/plain;charset=UTF-8'},
    body: JSON.stringify({
      editMode: false,
      apto: "101-TEST",
      diligencia: "Propietario",
      nombreProp: "Test",
      ccProp: "123",
      correoProp: "t@t.co",
      celProp: "300",
      autDatos: true,
      firmaNom: "Test",
      firmaCC: "123",
      firmaFecha: "2026-09-05"
    })
  });
  return await resp.json();
})()
```

---

## 13. Checklist de mantenimiento

### Diario (primera semana)

  - [ ] Revisar Sheet: ¿hay envíos nuevos?
  - [ ] Responder correos de residentes que perdieron N° Form

### Semanal (primer mes)

  - [ ] Revisar Sheet: ¿hay registros sospechosos?
  - [ ] Verificar que la página pública sigue accesible
  - [ ] Verificar que el Apps Script responde (curl nextId)

### Mensual

  - [ ] Backup del Sheet (export a Excel)
  - [ ] Backup del código Apps Script (copiar a archivo .gs en Drive)
  - [ ] Backup del repo (clone local)
  - [ ] Revisar logs del Apps Script (en editor: Executions)

### Anual

  - [ ] Renovar dominio si aplica (no aplica, usamos github.io)
  - [ ] Revisar si hay actualizaciones legales (Ley 1581, Decreto 768)
  - [ ] Considerar agregar features nuevas según feedback de residentes

---

## Historial de cambios

  · **7-Sep-2026 — v2: lookup automático de matrículas (capa 1-4 completadas)**
    · **Capa 1 (Sheet)**: Registros pasó de 138 → 143 columnas
      · K, L renombradas: `Parqueaderos`, `Matrículas` →
        `N° Parqueadero 1`, `Matrícula Parqueadero 1`
      · 5 columnas nuevas M-Q: `N° Parqueadero 2`, `Matrícula Parqueadero 2`,
        `Matrícula del Apto`, `Requiere Revisión Matrículas`,
        `Observaciones Matrículas`
      · CA-0001 preservado intacto (N° Apto 2000, Parq 1 = 3000)
    · **Capa 2 (Backend)**: `apps-script/Código.gs` v2
      · `NUM_COLS = 143`
      · 2 nuevos endpoints GET: `?action=lookupMatApto&apto=X` y
        `?action=lookupMatParq&celda=X`
      · Cache en memoria de tablas de matrículas del Sheet
        `1ceGtZDUJHX4yxs5_ydDwLwtrkOcZwYh09WUG0st_b0Y` (Torre 3 Etapa 1,
        Torre 1 Etapa 2, Parqueaderos Etapa 3)
      · Función `normApto()` para limpiar "9.804" → "9804"
      · Validación v2: si apto no está en base, exige matrícula escrita a mano
    · **Capa 3 (Frontend)**: `index.html`, `js/app.js`, `assets/styles.css`
      · Sección 1 (datos propietario) con 7 campos nuevos + checkbox revisión
        + textarea observaciones
      · `lookupMatApto()` y `lookupMatParq()` con listeners `blur`
      · Validación cliente: si apto no encontrado, `matriculaApto` es obligatorio
      · `recolectar()` y `poblarFormulario()` actualizados con los 7 nuevos
      · Estilos `.lookup-msg` con variantes `ok` / `warn` / `err`
    · **Capa 4 (Docs)**: este `GUIA-PROYECTO.md` actualizado
    · **PENDIENTE (te toca a vos)**: pegar Código.gs en Apps Script +
      nueva implementación + verificar 5 flujos de prueba

  · **5-Sep-2026**: Implementación inicial completa para Cerro Azul
    · Sheet configurado (138 columnas, formato, validación)
    · Repo cerro-azul-residentes creado y desplegado
    · Apps Script creado y desplegado en urb.cerroazul@gmail.com
    · Pruebas end-to-end exitosas (CA-0001, CA-0002, edición)
    · QR generado y subido a Drive
    · Repo formato-datos-ph creado con documentación completa
    · 3 archivos subidos a carpeta Drive de Cerro Azul

## 14. Respaldos

### Respaldo del 7-Sep-2026 (post-deploy v2)

Después del deploy v2 del lookup de matrículas y antes de cerrar la sesión,
se hizo un respaldo completo del estado actual en una carpeta de Drive
específica para esto.

  · **Carpeta destino**: `formato del recidentes`
    · Drive ID: `1NS6M0p5k7u89SiRy52CGxu7VpqmJ66fT`
    · URL: https://drive.google.com/drive/folders/1NS6M0p5k7u89SiRy52CGxu7VpqmJ66fT
    · Owner: computadores.y.portatiles@gmail.com (tu correo)
  · **14 archivos respaldados** (11 código + 3 exports)
  · **Verificación**: md5 local == md5 en Drive (todos los 14 OK)
  · **3 exports viejos** (1 fila) se movieron a la papelera de Drive

#### 11 archivos de código (cerro-azul-residentes/, sin .git)

| Archivo | Drive ID | Tamaño | md5 |
|---|---|---|---|
| `GUIA-PROYECTO.md` | `16Wtb41S5LOKPWtSZCprp6hfgyIzFDIJl` | 34.859 B | `ad453b71bcdc4c9ef035e04b7efaf334` |
| `README-project.md` | `1_fSsGkY7AEPg9SBL5MUP-zWSzMllXSFq` | 51 B | `c5bf05bc099f6401f4461ffcc15f027a` |
| `index.html` | `1GsfUKzqkhGC_F1SsbYU-BhNcI-uEhDbh` | 31.201 B | `df6f6ba6cbba34270a381406fc6776a2` |
| `js/app.js` | `1q5vxnUX9CZnuL5WjLEDZD8oSX55aACfA` | 26.111 B | `ee2836fb7d411dbc40cb391f227d2389` |
| `assets/styles.css` | `1xJ_ixwDQ7yDWI0C8DM4BbzJnL1c7z-rR` | 10.540 B | `f6419505011be1c492e015200dac82d4` |
| `assets/logo.jpg` | `1bYquqM-gFmKYvoX7rlv5iKz4FnhmlT8d` | 356.516 B | `f470181c5710569a0f1edc612744de5c` |
| `apps-script/Código.gs` | `11WEGpYLoUZ8zO4M6cz4qxFFt4mrbGBF-` | 24.324 B | `12bb1ba325a834563e4e13e14b5af0ab` |
| `apps-script/README.md` | `1_xNMrNpFFhZxCL6zQFv1ZDhEbDvgLeLh` | 5.781 B | `8dc082ee64545f9a7b2ffb55d30da1e1` |
| `qr-formulario-cerro-azul.png` | `1OlDiHQp5r26bmEgvnWmW0r1C860EiiHn` | 37.489 B | `7c64e09e1ff88da29b971a94d16cbe2f` |
| `.gitignore` | `1ImILo3YAv1EfEahVhbCtkwIthM7xyoY0` | 6 B | `73dd5c8e87159492db611de051904562` |
| `.nojekyll` | `17GAVu27l2mdig-aTEYVdOuj3zVDtXWup` | 0 B | `d41d8cd98f00b204e9800998ecf8427e` |

#### 3 exports de Google Sheets

| Archivo | Drive ID | Tamaño | Contenido | md5 |
|---|---|---|---|---|
| `cerro_azul_registros_2026-09-07.csv` | `1TYary9IHKvHpgOE_gRfJajaFjWlJKCGT` | 3.200 B | Sheet Registros en CSV, 4 filas (header + CA-0001 + 2) | `944ea17beede47f49391fd43b1c180c4` |
| `cerro_azul_registros_2026-09-07.xlsx` | `1X4cD6rOXHnPS1W3db19BczjDFQsOe5yJ` | 7.789 B | Sheet Registros en XLSX, 4 filas × 143 cols | `d6a612d5cbc41d31c1c002e4c13d68ae` |
| `matriculas_cerro_azul_2026-09-07.xlsx` | `1YByliz9H5g7Tx87K7pkTQvUxC8pPpYZF` | 32.085 B | Sheet matriculas-cerro-azul completo, 4 hojas (Resumen + Torre 3 + Torre 1 + Parqueaderos) | `769b43e4eb40f4c681c0f0ba83967107` |

#### Estado del proyecto al momento del respaldo

  - **Sheet Registros**: 143 columnas, 3 filas con datos (CA-0001 + 2 pruebas)
  - **Sheet matrículas**: 4 hojas, ~800 filas en total
  - **Apps Script**: deploy v2 activo (14:09 COL, 7-Sep-2026)
  - **URL Web App**: https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec
  - **GitHub Pages**: rebuild en curso al momento del respaldo
  - **Commits push**:
    · cerro-azul-residentes: `187e512`
    · formato-datos-ph:     `b481328`

### Respaldo incremental post-F2 (22-Sep-2026 22:10 COL)

Respaldo incremental después de crear la pestaña `Mudanzas` con 19 columnas
+ headers formateados + 4 validaciones (ESTADO, TIPO MUDANZA, TORRE, ASCENSOR).

  · **Carpeta destino**: misma que el respaldo principal
    · Drive ID: `1RPHtWnVEFwzBKR1DCzBP1to9wLHY2F22`
  · **2 archivos incrementales** (solo el cambio de F2):
    · Sheet completo XLSX (incluye la nueva pestaña Mudanzas)
    · CSV solo de la pestaña Mudanzas (headers sin datos)
  · **Verificación md5 round-trip**: 2/2 ✓ MATCH

| Archivo | Drive ID | Tamano | md5 |
|---|---|---|---|
| `BaseDatosCerroAzul_F2-POST_20260922-221023_COL.xlsx` | `1NWQhDRQJjPJdGSjvG5tocpBHsPTGO6O0` | 58.596 B | `634cf14bb72653e14ecb0fb5c47392fa` |
| `Mudanzas_F2-POST_20260922-221023_COL.csv` | `1yEkQY7BewSEuWDafOcn0u5eJTMklgXT2` | 242 B | `d4e33d6ee63915049abe99e66da7da5a` |

Notas:
  · El XLSX pasó de 44.435 B (pre-F2) a 58.596 B (post-F2). Los +14.161 B son
    la nueva pestaña con headers + formato + validaciones.
  · El CSV de Mudanzas solo tiene 1 fila (los headers) — aún no hay reservas
    porque no se ha implementado el flujo de reserva (eso es F3-F8).

### Respaldo del 22-Sep-2026 (pre-mudanzas)

Respaldo completo previo al inicio del desarrollo del módulo de agendamiento
de mudanzas. **22 archivos verificados bit-a-bit** (md5 local == md5 en Drive).

  · **Carpeta destino**: `proyecto formulario residentes`
    · Drive ID: `1RPHtWnVEFwzBKR1DCzBP1to9wLHY2F22`
    · URL: https://drive.google.com/drive/folders/1RPHtWnVEFwzBKR1DCzBP1to9wLHY2F22
    · Owner: urb.cerroazul@gmail.com
    · Permiso: anyone with link = writer (para que el operador pueda ver/descargar)
  · **22 archivos respaldados** (13 código + bundle ZIP + 3 exports Registros + 5 exports Matriculas)
  · **Verificación**: 22/22 archivos con md5 round-trip OK (descargados y comparados)
  · **Procedimiento**: Sheets API + Drive API multipart upload (no `/export` que 404ea)

#### Bundle ZIP del repositorio completo (sin .git)

| Archivo | Drive ID | Tamano | md5 |
|---|---|---|---|
| `cerro-azul-residentes_bundle_20260922-215129_COL.zip` | `1BoXiNGsfmwodZe_bG5nAfQX_hTILctSb` | 448.673 B | `ba80927be659c4a014fdd27d380bd9e6` |

#### Sheet Registros (Base datos Cerro azul fomato)

| Archivo | Drive ID | Tamano | md5 |
|---|---|---|---|
| `BaseDatosCerroAzul_20260922-215103_COL.xlsx` | `1gAHyusyOCIM3y5nObgANh45WI9ivkysc` | 44.435 B | `d0008c7456b8862d2a7e1d174eb058f9` |
| `Registros_20260922-215103_COL.csv` | `1GJERNp7IaSsrzBWhget5TiC7ESS3ZSum` | 51.587 B | `7b504e60ef4110964369a8104f38933a` |
| `Maestros_20260922-215103_COL.csv` | `1StfhCda9GaQBe4KiC9gJszk_2Hoz-M-L` | 23 B | `37d69fe5f0f075d003bdda1f6cd133c9` |

#### Sheet Matriculas

| Archivo | Drive ID | Tamano | md5 |
|---|---|---|---|
| `MatriculasCerroAzul_20260922-215103_COL.xlsx` | `1jpY5mXPQr36BZyDrpGzDzEuO7w__p9dz` | 60.236 B | `5f371944e14e745ad290e085b840b63e` |
| `Torre_3___Etapa_1_20260922-215103_COL.csv` | `1klHNH81orOv3hFA8b2U_T8d7UeHNk5vN` | 12.785 B | `4c78a41ba24b1cdc167932de23af83db` |
| `Torre_1___Etapa_2_20260922-215103_COL.csv` | `1Ds12_t6pNA1r0iEWPacsNUTRuxgoJSkh` | 12.746 B | `215fb5989aff75ade27f303e46c3e04a` |
| `Parqueaderos___Etapa_3_20260922-215103_COL.csv` | `1LhLuJSovt9qrB9TmAj7reZz46VCFT16o` | 12.681 B | `114af7021c33260ed9d6aad230945ab2` |
| `Resumen_de_Copropiedad_20260922-215103_COL.csv` | `1obBJghBTIojapw0uqPj9Zlpa26uYK23I` | 956 B | `c77eddee468ff3ccd20319b83aecff97` |

#### Codigo del repo (cerro-azul-residentes/, sin .git)

| Archivo | Drive ID | Tamano | md5 |
|---|---|---|---|
| `index.html` | `1DyAR7NI5vUMHTNh3K3EjmsyjzleGxAsw` | 31.282 B | `56da40e334fa486df073a38212b59035` |
| `GUIA-PROYECTO.md` | `10kc3PVWiylK2FlQQ0Sh1mBwkoqgzgavz` | 41.396 B | `318141195d6518be59fdf282ce0ef91c` |
| `README-project.md` | `1So6sFWlfiqT8Ai1mBJ2oxSRIkJq-_v4R` | 51 B | `c5bf05bc099f6401f4461ffcc15f027a` |
| `js/app.js` | `1F9iqoMH-mvB2_O3UpOYnedT_67hXmqYo` | 26.111 B | `ee2836fb7d411dbc40cb391f227d2389` |
| `apps-script/Codigo.gs` | `1_W_34RC-bWQj6h1HMX6tUbuGSSRr2DiL` | 24.324 B | `12bb1ba325a834563e4e13e14b5af0ab` |
| `apps-script/README.md` | `1obac9WLV9vZG66pFbpUzymLuZZNOTmv0` | 5.781 B | `8dc082ee64545f9a7b2ffb55d30da1e1` |
| `assets/styles.css` | `1VOoo-Wo1yQYMQgBbCvZejHyzQE65RPCy` | 10.540 B | `f6419505011be1c492e015200dac82d4` |
| `assets/logo.jpg` | `1Rai_X6pI6dVhCX163jKxjrBzQbCOI_Iq` | 356.516 B | `f470181c5710569a0f1edc612744de5c` |
| `docs/manual-llenado-cerro-azul.html` | `1Exu0j892pI2Bz3-3Oh0TdHyXyRoPlGyJ` | 61.958 B | `6ba327cefba417562a9feb9f2b7b23b2` |
| `docs/prompt-notebooklm-video.md` | `1yYHZodV9tq0890KAV4NB157TUfqVNXWm` | 13.903 B | `490ba954d9bb375dfa74cc962101e81a` |
| `qr-formulario-cerro-azul.png` | `1WpFllyDKxOYDsTcwbn8d79JlbsDMiCr8` | 37.489 B | `7c64e09e1ff88da29b971a94d16cbe2f` |
| `.gitignore` | `1PIappJSg77DkWQgVYR3akDMq1MivJt1c` | 6 B | `73dd5c8e87159492db611de051904562` |
| `.nojekyll` | `1kLriQxEg2q4BbXwZOoekMQJh_gXBTaum` | 0 B | `d41d8cd98f00b204e9800998ecf8427e` |

#### Estado del proyecto al momento del respaldo

  - **Sheet Registros**: 143 columnas, 84 filas con datos (CA-0001 + 83 residentes)
  - **Sheet matriculas**: 4 hojas, ~622 filas en total
  - **Apps Script**: deploy v2 activo (sin cambios desde 7-Sep-2026 14:09 COL)
  - **URL Web App**: https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec
  - **GitHub Pages**: cerro-azul-residentes desplegado y funcional
  - **Commits push**: cerro-azul-residentes (HEAD al cierre del 14-Sep-2026)

#### Política de respaldos recomendada

  · **Cada vez que se hace un deploy nuevo** (manual o automático), hacer un
    respaldo con este mismo procedimiento (cambiar fecha en los nombres de los
    exports)
  · **Mensual**: descargar el Sheet completo en xlsx y guardarlo en Drive
    (para tener histórico sin acumular archivos de código)
  · **Anual**: si cambia la estructura del Sheet (nuevas columnas), respaldar
    también el Sheet de matrículas y este archivo GUIA-PROYECTO.md
  · **NO respaldar** el directorio `.git/` (es regenerable, ocupa mucho y
    no contiene código fuente, solo metadata de git)

#### Procedimiento para hacer un nuevo respaldo (receta)

```bash
# 1. Subir los 11 archivos de código
for f in GUIA-PROYECTO.md README-project.md index.html js/app.js \
         assets/styles.css assets/logo.jpg apps-script/Código.gs \
         apps-script/README.md qr-formulario-cerro-azul.png .gitignore .nojekyll; do
  python /root/.hermes/skills/productivity/google-workspace/scripts/google_api.py \
    drive upload "/root/cerro-azul-residentes/$f" \
    --name "$f" --parent 1NS6M0p5k7u89SiRy52CGxu7VpqmJ66fT
done

# 2. Exportar el Sheet Registros a CSV+XLSX y el Sheet matrículas a XLSX
#    (usar /tmp/build_exports_v2.py como plantilla, ajustar fechas)

# 3. Verificar md5 de cada archivo descargándolo de vuelta

# 4. Actualizar esta sección §14 con los nuevos Drive IDs y md5
```

---

## 15. Manuales de uso para residentes

### Carpeta de Drive
`https://drive.google.com/drive/folders/1NS6M0p5k7u89SiRy52CGxu7VpqmJ66fT`

### Manual de llenado (HTML paso a paso)
Manual web disenado para personas sin experiencia tecnologica. Con capturas de cada seccion.

  - **manual-llenado-cerro-azul.html**
    File ID: 1bWMitW7i80LUdjV2mCbhr6NVCIzRruLA
    Drive: https://drive.google.com/file/d/1bWMitW7i80LUdjV2mCbhr6NVCIzRruLA/view?usp=drivesdk
    GitHub Pages: https://Fabig76.github.io/cerro-azul-residentes/docs/manual-llenado-cerro-azul.html
    Commit: `997e5f04` (subido por API, 14-Sep-2026)

### Video instructivo (NotebookLM)
Prompt para generar video explicativo con las 14 capturas del formulario.

  - **prompt-notebooklm-video.md**
    File ID: 1qm7PNmyZ-o4fTYto44YPxT68BaOSS1Bl
    Drive: https://drive.google.com/file/d/1qm7PNmyZ-o4fTYto44YPxT68BaOSS1Bl/view?usp=drivesdk
    14 capturas en: Folder ID `18g9pVdktfAu3j7B5NnXOQcUpDUdkUYbR`

**Como generar el video:**
1. Crear notebook en https://notebooklm.google.com
2. Subir las 14 capturas en orden (7.26.34 a 7.29.28)
3. Studio > Video Overview > Add instructions
4. Pegar contenido de prompt-notebooklm-video.md

**Mensajes clave del video:**
  - Codigo CA-XXXX debe guardarse (ENFASIS MAXIMO)
  - Tags/llaveros son implementacion FUTURA
  - Ley 1581: mencion breve y tranquilizadora
  - Dos pestanas: crear registro / editar registro

---

  · **Fabio Lesmes** (cliente/administrador): fabig76@gmail.com
    · MacBook Pro con zsh, plataforma macOS
    · Habla solo español, respuestas siempre en español
    · Workflow: Cerro Azul = verificar antes de actuar, OK explícito
      antes de irreversibles
  · **Hermes Agent**: asistente AI con acceso a su sandbox
  · **Cerro Azul admin email**: urb.cerroazul@gmail.com (mencionado en
    el formulario como canal para derechos ARCO)

---

## Skills relevantes para cargar

Cuando trabajes en este proyecto, carga estas skills primero:
  · `google-workspace` (operaciones con Sheets, Drive)
  · `github` (operaciones de git/GitHub)
  · `cerro-azul-audit-checklist` (auditoría de proyectos Cerro Azul)

NO cargar:
  · `hermes-cron-job-config` (no aplica)
  · `kanban-worker` (no aplica)

---

## Memoria Engram relacionada

Búsquedas sugeridas en futuras sesiones:
  · `project:root Cerro Azul Residentes formulario público`
  · `query: Apps Script Web App Cerro Azul`
  · `query: cerro-azul-residentes formato-datos-ph`
