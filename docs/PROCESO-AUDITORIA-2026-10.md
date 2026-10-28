# Proceso de Auditoría — Portal Cerro Azul (2026-10-28)

Documento de referencia del proceso completo de auditoría técnica y remediación
del Portal Cerro Azul. Sirve para retomar el trabajo en cualquier punto, conocer
el estado exacto, y no repetir pasos ya ejecutados.

Última actualización: 28-oct-2026.

---

## 1. Resumen ejecutivo

Auditoría técnica del portal (backend Apps Script + frontend GitHub Pages) de la
Urbanización Cerro Azul PH (NIT 900.770.444, Bello/Niquía), hecha por un analista
externo el 28-oct-2026. La auditoría produjo **19 tareas** agrupadas en 4 bloques.
Un agente (Hermes) las está implementando una a una sobre una rama Git, probando
**siempre** contra un entorno de pruebas (copia de la hoja + proyecto Apps Script
de pruebas), **nunca** contra producción.

**Estado al 28-oct-2026:** 15 de 19 tareas completadas y commiteadas (T1–T15).
La T16 (migración a `CA.api`) está en curso. Faltan T17, T18 y T19.

---

## 2. Piezas del sistema

| Pieza | Dónde | Notas |
|---|---|---|
| Frontend | Repo GitHub `Fabig76/cerro-azul-residentes`, rama `main`, GitHub Pages | 8 páginas HTML + 9 archivos JS (`app.js`, `residente.js`, `vigilantes.js`, `admin.js`, `salon-social.js`, `estado-cuenta.js`, `cartera-admin.js`, `cartera-procesador.js`, `asistente.js`) + `config.js` + `common.js` |
| Backend | Apps Script, un único archivo `Código.gs` (~5.600 líneas) | Web app `doGet`/`doPost`, acceso anónimo, corre como la cuenta del administrador |
| Datos | Hoja de cálculo `SHEET_ID` con pestañas `Registros` (143 col), `Maestros`, `Mudanzas` (23 col), `Config`, `salon social` (18 col) | Hoja aparte de matrículas y hoja de cartera |
| Correo | `enviarEmailCerroAzul` vía `GmailApp` alias `urb.cerroazul@gmail.com` | Lanza excepción si el alias no existe o se agota la cuota |

### IDs de producción

- `SHEET_ID` (hoja principal): `16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`
- URL backend (web app producción): `https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec`
- Frontend (GitHub Pages): `https://fabig76.github.io/cerro-azul-residentes/`
- Carpeta de la auditoría en Drive: `1fhf8zT4NJ7xaXZCHxQaitAZSOtlY65V3` ("uditoria")
- Documentos de la auditoría (3): `Anexo_A_Auditoria_Backend_AppsScript.md`, `Anexo_B_Auditoria_Frontend_Portales.md`, `INSTRUCCIONES_AGENTE_Portal_Cerro_Azul.md`

---

## 3. Entorno de pruebas (creado por el agente)

Cuenta: `computadores.y.portatiles@gmail.com` (owner).

| Elemento | ID / valor |
|---|---|
| Copia de la hoja | `1orej_KfX_a0637WCyDlgfCcYh2X_WXJoDDaGnrjiZ2c` — "PRUEBAS - Cerro Azul - 2026-10-28" |
| Proyecto Apps Script | `1x6zrmmPQ0sSamPv6LF3xaklHZcyfx95Rh5byRXKwlMHuAas9GxRaP1_D` — "PRUEBAS Cerro Azul" |
| Carpeta del proyecto en Drive | `1rODevwf6DAZA3Zg23jugWqj0f8E9DIya` |
| URL del editor | `https://script.google.com/d/1x6zrmmPQ0sSamPv6LF3xaklHZcyfx95Rh5byRXKwlMHuAas9GxRaP1_D/edit` |
| Directorio local de pruebas | `/tmp/gs_test_proj` (`.clasp.json` + `Codigo.js` + `appsscript.json`) |

**Importante:** el `SHEET_ID` del proyecto de pruebas apunta a la **copia**, no a
producción. Verificarlo siempre antes de probar (grep `const SHEET_ID` en el código).

**Publicar el web app de pruebas (paso manual del admin, una sola vez):**
1. Abrir el editor (URL de arriba).
2. Implementar → Nueva implementación → Aplicación web.
3. Ejecutar como: Yo · Quién tiene acceso: Cualquier persona.
4. Copiar la URL `/exec` resultante.

La API de Apps Script deja el despliegue "a medio inicializar" (acceso anónimo
no activo) — solo se activa publicando desde el editor.

---

## 4. Reglas inamovibles (del documento de órdenes)

1. **Alcance cerrado** — solo las 19 tareas, en orden, una a la vez.
2. **Nunca contra producción** — probar siempre contra la copia.
3. **La hoja no se toca desde el código** — prohibido insertar/mover/renombrar columnas.
4. **La URL de despliegue no cambia** — publicar como nueva versión del despliegue existente.
5. **Contrato cliente/servidor intacto** — no renombrar `action` ni claves de payload existentes.
6. **Secretos** — nunca escribir/imprimir contraseñas, tokens o claves; usar `<valor>`.
7. **Datos personales** — pruebas con datos inventados (apto 9999, cc 1000000000, correo prueba@example.com).
8. **Un archivo de backend** — trabajar sobre `apps-script/Codigo_V46_BLINDAJE-SUBMIT_20261027.gs`; no crear copias V47/V48.
9. **Sin dependencias nuevas** — solo ESLint/Vitest como herramientas de desarrollo (T18).
10. **Cada tarea se cierra sola** — no se da por terminada hasta que su prueba pasa.
11. **Prohibido inventar** — si el código real no coincide con la descripción, parar y preguntar.
12. **Un commit por tarea** — mensaje `T<n>: <título>`. Nunca `push --force`.
13. **El agente no despliega** — deja la versión lista; el admin pulsa "Nueva versión".

---

## 5. Las 19 tareas y su estado

| # | Título | Bloque | Estado |
|---|---|---|---|
| T1 | vigilanteBuscarPorPlaca deja de entregar credenciales | A | ✅ `fa10e36` |
| T2 | login por POST, cierre de sesión y límite de intentos | A | ✅ `8d2ad0d` |
| T3 | neutralizar fórmulas y fijar formato de texto | A | ✅ `4799b02` |
| T4 | subirComprobanteSalon valida antes de tocar Drive | A | ✅ `03e6526` |
| T5 | límites en verificaciones y en el asistente | A | ✅ `4dd9b4b` |
| T6 | bloqueo en submitRecord y adminGuardar | B | ✅ `b2393ad` |
| T7 | enrutado seguro y verificación de esquema | B | ✅ `2ea9f8d` |
| T8 | correo que nunca rompe la operación | B | ✅ `1b689f0` |
| T9 | registrarResidente preserva dispositivos del propietario | B | ✅ `bef8559` |
| T10 | idempotencia de creaciones y borrado lógico | B | ✅ `631e302` |
| T11 | js/config.js y js/common.js | C | ✅ `ac37fce` |
| T12 | escape HTML en vigilantes y admin (XSS) | C | ✅ `1406051` |
| T13 | login por POST y sesión expirada (frontend) | C | ✅ `3655c1d` |
| T14 | fecha local con CA.hoyLocal() | C | ✅ `006f1b4` |
| T15 | cuatro bugs de lógica | C | ✅ `879bc64` |
| T16 | migrar llamadas a CA.api y retirar parche de fetch | C | 🔶 EN CURSO |
| T17 | un solo backend versionado | D | ⬜ pendiente |
| T18 | pruebas mínimas y autodiagnóstico | D | ⬜ pendiente |
| T19 | limpieza de datos y copia de seguridad | D | ⬜ pendiente |

### Detalle de T16 (en curso)

Commits ya hechos:
- `T16a` (`2ab4bb6`) — vigilantes.js a CA.api
- `T16b` (`f818ab8`) — admin.js a CA.api
- `T16c` (`cad945c`) — eliminar parche window.fetch + token explícito en admin/vigilantes

Archivos ya migrados en el working tree (sin commit):
- `residente.js` (apiGet/apiPost → CA.api)
- `salon-social.js` (apiGet/apiPost → CA.api)
- `estado-cuenta.js` (post → CA.api)
- `cartera-admin.js` (post → CA.api)
- `asistente.js` (fetch chat → CA.api con timeoutMs 60000)
- `app.js` — migrado parcialmente: `buscarRegistro`, `enviarFormulario`, `lookupMatApto`, `lookupMatParq`, `clearResidenteForm`

**Falta por migrar en `app.js` (4-5 llamadas del módulo mudanzas):**
- `verificarPropietario` (~línea 1027)
- `dispMudanzas` (~línea 1149, usa torre/ascensor/desde/hasta)
- `reservarMudanza` POST (~línea 1226)
- `listarReservasMudanzasPorNumForm` POST (~línea 1272)
- `cancelarMudanza` POST (~línea 1352)

**Pasos para cerrar T16:**
1. Migrar los 4-5 `fetch` restantes de `app.js`.
2. `node --check` de los 6 archivos modificados.
3. Commits `T16d` (residente), `T16e` (salon-social), `T16f` (estado-cuenta), `T16g` (cartera-admin), `T16h` (asistente), `T16i` (app.js).
4. Verificar `grep -rn "window.fetch" js/` = 0 y `grep -rn "fetch(" js/` solo en cartera-procesador.js (que usa `postFn`).

---

## 6. Flujo de trabajo por tarea

1. Leer la tarea completa (incluida la lista "No hacer").
2. Localizar la función **por nombre**, no por número de línea (los números se desfasan con cada inserción).
3. Aplicar el cambio exactamente como está escrito; adaptar mínimamente si el fragmento no encaja y anotarlo.
4. Probar contra el entorno de pruebas; registrar el resultado literal.
5. `git add` solo de los archivos nombrados; `git commit -m "T<n>: …"`.
6. Actualizar `docs/AUDITORIA-2026-10-BITACORA.md`.

### Comandos recurrentes

```bash
# Verificar sintaxis del backend
cp apps-script/Código.gs /tmp/_chk.js && node --check /tmp/_chk.js

# Verificar sintaxis de un JS frontend
cp js/archivo.js /tmp/_chk.js && node --check /tmp/_chk.js

# Sincronizar el archivo canónico del backend (regla 8)
cd apps-script && cp Código.gs Codigo_V46_BLINDAJE-SUBMIT_20261027.gs

# Subir el backend al proyecto de pruebas
cp apps-script/Codigo_V46_BLINDAJE-SUBMIT_20261027.gs /tmp/gs_test_proj/Codigo.js
#  → reemplazar SHEET_ID producción por la copia en Codigo.js
cd /tmp/gs_test_proj && clasp push --force && clasp deploy

# Obtener la URL del último deployment de pruebas
#  (ver scripts de Python en /tmp/url_*.txt; usan la API script.googleapis.com)
```

---

## 7. Despliegue a producción (al final de la fase)

**Backend:**
1. Abrir el editor de Apps Script de producción.
2. Pegar el contenido de `apps-script/Codigo_V46_BLINDAJE-SUBMIT_20261027.gs`.
3. Implementar → Administrar implementaciones → editar → **Nueva versión** (no crear despliegue nuevo).

**Frontend:**
1. `git push origin auditoria-fase-1`
2. Merge de `auditoria-fase-1` a `main` (GitHub Pages sirve `main`).

**Antes de desplegar, el admin debe (Tarea 19):**
- Ejecutar `setupFormatoTexto_()` una vez desde el editor (formato `@` en columnas de identificadores).
- Cambiar las dos contraseñas de `Config` (el historial de versiones conserva las anteriores).
- Crear la carpeta de respaldos y configurar `respaldoDiario_()`.

---

## 8. Referencias locales

- Repo: `/root/work/cerro-azul/cerro-azul-residentes` (rama `auditoria-fase-1`)
- Bitácora: `docs/AUDITORIA-2026-10-BITACORA.md`
- Documento de órdenes descargado: `/tmp/auditoria_ud/INSTRUCCIONES_AGENTE_Portal_Cerro_Azul.md`
- Anexos de auditoría: `/tmp/auditoria_ud/Anexo_A_*.md`, `/tmp/auditoria_ud/Anexo_B_*.md`
- Skill de deploy Apps Script: `~/.hermes/skills/devops/apps-script-web-app-deploy/`
- Skill del proyecto citófono (carriil separado): `~/.hermes/skills/devops/cerro-azul-citofono/`

---

## 9. Notas y lecciones aprendidas

- **`clasp push` a veces da "Skipping push"** sin motivo aparente; usar `clasp push --force`.
- **La URL del editor** es `script.google.com/d/{id}/edit`, **no** `script.google.com/home/projects/{id}/editor` (esta última da 404).
- **`curl` directo al web app da anti-bot** (`ppConfig`); usar el navegador (browser_console) para probar los endpoints.
- **El token OAuth no ejecuta `script.run`** — falta el scope `script.scriptapp` (requiere re-consentimiento).
- **Al copiar `Codigo_V46...gs` al proyecto de pruebas, reemplazar `SHEET_ID`** — ya ocurrió una vez que apuntó a producción por error.
- **`safeCell_` con escapes `\u200B`**: al insertar vía patch, los backslashes pueden duplicarse; verificar con `python3 -c "print(line.count(chr(92)))"`.
- **Pagos es un carril aparte** (cron pausado deliberadamente); no mezclar con citófono/residentes en análisis.
