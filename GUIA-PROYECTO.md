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

### Estructura de columnas (138 en total, A:EH)

Los nombres exactos están en `apps-script/Codigo.gs` y `app.js`. Resumen:

```
A: N° Formulario (CA-0001, CA-0002...)
B: Fecha Registro
C: Fecha Última Edición
D: N° Apto (LLAVE DE DEDUPE)
E: Diligencia como
F-J: Propietario (nombre, CC, correo, celular, tel fijo)
K-L: Parqueaderos, Matrículas
M-P: Arrendatario (4 campos)
Q-S: Parqueadero tercero (3)
T-X: Inmobiliaria (5)
Y-AN: Residentes (4 personas × 5 campos = 20)
AO-AT: Menores (4 × 3 = 12)
AU-BF: Vehículos (2 × 6 = 12)
BG-BR: Motos (2 × 6 = 12)
BS-CB: Bicicletas (2 × 4 = 8)
CC-CD: Llaveros/Tags autorizados (2)
CE-DO: Dispositivos (3 × 5 = 15)
DP-FI: Mascotas (2 × 10 = 20)
FJ-FO: Emergencias (2 × 3 = 6)
FP-FR: Autorizaciones (3)
FS-FU: Firma (3)
FV (137): Hash Dedupe (sha256[:16] de apto+cc+firma)
```

---

## 5. Google Apps Script

  · **Script ID**: `17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy`
  · **URL editor**: https://script.google.com/d/17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy/edit
  · **Cuenta dueña**: urb.cerroazul@gmail.com (NO está en Drive de Fabio)
  · **Nombre del proyecto**: "Cerro Azul - Formulario Residentes Backend"
  · **Web App URL**: `https://script.google.com/macros/s/AKfycbyLbcfAJXfNhDxsRCAodMZXkqD5l7mBbep5FgtVcn6NCng7xIz8Y7xDQD6p2gflqaqd/exec`
  · **Esta URL está hardcodeada** en `js/app.js` línea 5.

### Configuración del deployment

  · Tipo: **Aplicación web**
  · Ejecutar como: **Yo** (urb.cerroazul@gmail.com)
  · Quién tiene acceso: **Cualquier persona**

### Funciones principales

  · `doGet(e)` con `?action=nextId` → devuelve `{ok:true, nextId:"CA-XXXX"}`
  · `doGet(e)` con `?action=lookup&numForm=X&apto=Y` → devuelve fila
  · `doPost(e)` con payload JSON → crea o actualiza fila
  · `getNextFormId()` → correlativo CA-0001, CA-0002...
  · `findRowByApto(apto)` → busca fila existente por N° Apto
  · `findRowByNumFormAndApto(numForm, apto)` → busca para edición
  · `submitRecord(data)` → orquesta creación/edición con validaciones
  · `buildRowFromPayload(d, numForm, fechaReg)` → array de 138 valores
  · `rowToObject(rowArr)` → convierte fila del Sheet a objeto JS para edición

### Validaciones del backend

Obligatorios (devuelve error si falta):
  · N° Apto
  · Diligencia como (debe ser Propietario/Arrendatario/Tenedor / Otro)
  · Nombre y cédula del titular
  · Correo del titular (formato válido)
  · Celular del titular
  · Checkbox de autorización de datos
  · Nombre y cédula en la firma

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
  2. Datos del arrendatario / tenedor (opcional)
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
curl -sL "https://script.google.com/macros/s/AKfycbyLbcfAJXfNhDxsRCAodMZXkqD5l7mBbep5FgtVcn6NCng7xIz8Y7xDQD6p2gflqaqd/exec?action=nextId"

# Lookup (debe devolver ok:false si no existe)
curl -sL "https://script.google.com/macros/s/AKfycbyLbcfAJXfNhDxsRCAodMZXkqD5l7mBbep5FgtVcn6NCng7xIz8Y7xDQD6p2gflqaqd/exec?action=lookup&numForm=CA-0001&apto=101"

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
  const resp = await fetch('https://script.google.com/macros/s/AKfycbyLbcfAJXfNhDxsRCAodMZXkqD5l7mBbep5FgtVcn6NCng7xIz8Y7xDQD6p2gflqaqd/exec', {
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

  · **5-Sep-2026**: Implementación inicial completa para Cerro Azul
    · Sheet configurado (138 columnas, formato, validación)
    · Repo cerro-azul-residentes creado y desplegado
    · Apps Script creado y desplegado en urb.cerroazul@gmail.com
    · Pruebas end-to-end exitosas (CA-0001, CA-0002, edición)
    · QR generado y subido a Drive
    · Repo formato-datos-ph creado con documentación completa
    · 3 archivos subidos a carpeta Drive de Cerro Azul

---

## Contactos importantes

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
