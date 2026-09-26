# Notas de Sesión — BUGFIX-009 Portal de Estado de Cuenta Roto

> Archivo de referencia para futuras sesiones. Documenta el trabajo
> realizado el 26-Sept-2026 para diagnosticar y arreglar el bug del portal
> de estado de cuenta (`estado-cuenta.html`), donde un propietario del apto
> 504 reportó un mensaje de error de validación incorrecto.

---

## Metadata

- **Fecha:** 26-Sept-2026 (sábado, sesión matutina)
- **Operador:** Fabio (UdeCataluña, docente)
- **Modelo:** MiniMax-M3 vía MiniMax (minimax.io)
- **Canal:** CLI (terminal + browser)
- **Idioma:** español
- **Severidad:** ALTA — portal principal del módulo contable no funcionaba
- **Estado al cierre:** ✅ RESUELTO (V18 desplegado, 13/13 tests OK)

---

## 1. Punto de partida

Al iniciar esta sesión, el operador reportó:

> "ahora que lo estan usando verfica que pasa con el portal
> https://fabig76.github.io/cerro-azul-residentes/estado-cuenta.html
> porque un propietario del apto 504 intento ingresar y salio este mensaje
> Diligencia como debe ser Propietario, Arrendatario o Tenedor / Otro."

El operador también agregó (en respuesta intermedia):

> "pero yo probe el portal cuando lo hicimos y funcionaba"

y luego:

> "el modulo de agendar mudanza se hizo primero luego el de consultar
> estado de cuenta que tiene su propio portal luego el portal de residente
> y por ultmo el de reservar el salon"

y finalmente pidió verificar las versiones V14-V16-V17:

> "quiero que verifiques la version V14 y la V15 y la V16 y ver si esto
> estubo antes funcionando revisa estas versiones y me informas"

---

## 2. Trabajo realizado

### 2.1 Investigación inicial (3 frentes)

Antes de tocar código, se hizo una investigación en 3 frentes paralelos:

**A) Documentación del proyecto:**
- `docs/spec-estado-cuenta.md` — spec técnica del analista
- `docs/proyecto-estado-cuenta.md` — resumen operativo
- `docs/CHANGELOG-BUGFIXES.md` — bugs documentados
- `docs/TESTING-PROTOCOL.md` — protocolo de testing
- `GUIA-PROYECTO.md` — guía principal
- `README-project.md` — resumen
- 6 sesiones anteriores en memoria

**B) Git log del repositorio:**
```
eecbf63  Initial commit
187e512  v2 lookup automatico de matriculas
ec894f7  feat(mudanzas): modulo de agendamiento
d25617a  feat(admin): endpoints admin
34a7e0b  feat(vigilantes): V9 backend
ac15ed8  feat(vigilantes): buscar por placa
57b5360  feat(residente): V13 backend
3d8b08a  feat(salon-social): V14 backend
c7991f7  feat(admin): pestana Mudanzas
7599366  feat(auditoria): W1 + B3 V17
b40cd13  fix(doPost): routing 6 endpoints ec* V18  ← MI FIX
```

**C) Drive backups:** no se encontraron backups V12-V16 (solo V17 subido
en sesión anterior y V18 nuevo).

### 2.2 Diagnóstico del bug

**Síntoma exacto:** `"Diligencia como debe ser Propietario, Arrendatario
o Tenedor / Otro."`

**Búsqueda del mensaje en código:**
- `apps-script/Código.gs` línea 196 — única ocurrencia, dentro de
  `submitRecord()` (función de creación/edición de registros del
  formulario público)

**Análisis:**
- El portal `estado-cuenta.html` es de SOLO LECTURA (no crea registros)
- Sin embargo, el endpoint `ecConsultar` no estaba enrutado en `doPost`
- Cuando el frontend hacía POST con `action: 'ecConsultar'`, caía al
  default `submitRecord(payload)` que exige `diligencia`
- El payload de `ecConsultar` solo trae `{numForm, apto, ccProp}` → no
  tiene `diligencia` → submitRecord retorna el mensaje literal

**Causa raíz:**
`apps-script/Código.gs` `doPost(e)` tenía routing para residentes,
mudanzas, admin, vigilancia, salón social, pero NO para los 6 endpoints
del módulo de estado de cuenta (`ec*`).

### 2.3 Verificación en producción (Apps Script V17 actual)

Pruebas con `browser_console.expression` + fetch desde navegador real
(NO curl, porque Apps Script bloquea requests sin User-Agent de navegador
con HTTP 403 + HTML "Datei kann derzeit nicht geöffnet werden" en alemán —
este es un falso negativo conocido).

```
Test 1: POST {action: 'ecIniciarCarga'} (vacío)
  → {"ok":false,"error":"Falta N° de apartamento."}
  → Si módulo+routing existiera, ecIniciarCarga validaría password primero
  → Caer a submitRecord confirma módulo NO pegado

Test 2: POST {action: 'ecConsultar', numForm, apto, ccProp}
  → {"ok":false,"error":"Diligencia como debe ser..."}
  → submitRecord validó diligencia → confirma routing no existe

Test 3: POST {action: 'ecConsultar', ..., diligencia, todos los campos}
  → {"ok":false,"error":"Ya existe un registro para el apartamento 105..."}
  → submitRecord ejecutó completo. ecConsultar NUNCA se llamó
```

**Conclusión:** El deploy V17 NO tiene las 6 líneas de routing Y NO tiene
el módulo pegado. El bug NUNCA funcionó desde V12.

### 2.4 Investigación forense V14-V17 (pedida por el operador)

**Análisis estático:**
- Funciones salón (12), residente (5), admin (4), vigilantes (5), mudanzas
  (4) están TODAS en Codigo.gs principal (no en el módulo)
- Funciones `ec*` (25) están SOLO en modulo-estado-cuenta.gs
- Intersección: 0 funciones compartidas (no hay colisión de nombres)
- El módulo depende de SHEET_ID, normApto, jsonOut, verificarPropietario,
  adminLogin, normalizarCC, MATRICULAS_SHEET_ID (todos ya en Codigo.gs)

**Cronología del bug por versiones:**
- V12 (25-Sept-2026 17:07): sesión "mejoras" declaró V12 OK (ASUNCIÓN
  INCORRECTA — no probó ningún ec*)
- V13 (25-Sept-2026): residente, no tocó estado de cuenta
- V14 (25-Sept-2026): salón social, no tocó estado de cuenta
- V15-V16 (25-Sept-2026): admin mudanzas, no tocó estado de cuenta
- V17 (25-Sept-2026 19:35): auditoría salón (W1 + B3), pruebas solo salón
  + regresiones V13. NINGÚN test ec*.

**Por qué el operador pensó que funcionaba:**
- A) Probó solo el frontend (estado-cuenta.html carga correctamente) pero
  no completó el flujo con datos reales
- B) Probó con credenciales incorrectas → mensaje "No se encontró
  registro" → pensó que era validación correcta
- C) Confundió éxito de "Editar mi registro" (lookup SÍ funciona) con el
  portal de estado de cuenta
- D) Probó cartera-admin.html (Fase 3) que SÍ publicó datos (no depende
  de los endpoints ec*, usa credenciales Writer)

**Conclusión forense:** El bug SIEMPRE estuvo ahí desde V12 (25-Sept).
Las memorias que eran "V12 OK 22 endpoints 18 ec*" eran incorrectas:
los endpoints ec* existían en el módulo descargado pero NUNCA fueron
enrutados al doPost del Codigo.gs desplegado.

### 2.5 Aplicación del fix

**Patch en `apps-script/Código.gs`** (líneas 153-160 del archivo):

```javascript
const action = String(payload.action || '').trim();
// --- ESTADO DE CUENTA (spec-estado-cuenta.md §6.2) ---
if (action === 'ecConsultar')        return jsonOut(ecConsultar(payload));
if (action === 'ecDescargarFactura') return jsonOut(ecDescargarFactura(payload));
if (action === 'ecPazYSalvo')        return jsonOut(ecPazYSalvo(payload));
if (action === 'ecIniciarCarga')     return jsonOut(ecIniciarCarga(payload));
if (action === 'ecSubirFacturas')    return jsonOut(ecSubirFacturas(payload));
if (action === 'ecFinalizarCarga')   return jsonOut(ecFinalizarCarga(payload));
if (action === 'reservarMudanza') {
  return jsonOut(reservarMudanza(payload));
}
```

**Generación de V18:**
```
Codigo.gs del repo (con 6 líneas) + modulo-estado-cuenta.gs pegado al final
= 148.747 bytes, 95 funciones, MD5 691a6f3adc3224fc38170fcc72200e71
```

**Subido a Drive:**
```
Archivo: Codigo_V18_EC_ROUTING_DO_POST_FIX-20260926.gs
ID:      1Qu4IQbUHY8lM6WDdRQSoIuQ_6eZAmDaw
URL:     https://drive.google.com/file/d/1Qu4IQbUHY8lM6WDdRQSoIuQ_6eZAmDaw/view
```

### 2.6 Commit y push

**Commit b40cd13:**
```
fix(doPost): routing 6 endpoints ec* (BUGFIX-009 portal estado cuenta roto)
- apps-script/Código.gs       (+7 líneas)
- docs/CHANGELOG-BUGFIXES.md  (BUGFIX-009 documentado)
- docs/TESTING-PROTOCOL.md    (Test 5 con T-EC-1..6 + advertencia sandbox)
```

**Commit 3161d69:**
```
docs(BUGFIX-009): validar V18 desplegado 13/13 OK + estado del fix
- docs/CHANGELOG-BUGFIXES.md  (sección "Estado del fix al 26-Sept-2026 12:15")
```

### 2.7 Deploy V18 por el operador

El operador desplegó V18 manualmente:
```
Versión 18 del 26 sept 2026, 12:15
ID de implementación: AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp
URL: https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec
```

URL preservada correctamente (mismo deployment ID).

### 2.8 Validación E2E post-deploy (13/13 tests OK)

**Test 5: Estado de cuenta (6 endpoints nuevos):**
| Test | Endpoint | Resultado |
|------|----------|-----------|
| T-EC-1 | ecConsultar (CA-0055 apto105) | ✓ Estado completo: Luis Oswaldo Becerra, totalCartera=$0, pagos=1, pazYSalvo=true |
| T-EC-2 | ecDescargarFactura | ✓ Factura_105_2026-08.pdf (157KB base64) |
| T-EC-3 | ecPazYSalvo | ✓ PYS-00012 PazYSalvo_105_2026-08.pdf (145KB) |
| T-EC-4 | ecConsultar (CA-0070 apto503) | ✓ Alejandro Quiroz, totalCartera=$426.300, pazYSalvo=false |
| T-EC-5 | ecPazYSalvo (CA-0062 apto1527 Arrendatario) | ✓ Rechazado por P2 |
| T-EC-6 | ecConsultar (mismo) | ✓ Rechazado por P2 |

**Regresión (9 endpoints existentes):**
| Módulo | Endpoint | Resultado |
|--------|----------|-----------|
| Salón V14 | dispSalon | ✓ |
| Salón V14 | verificarAccesoSalon | ✓ |
| Residente V13 | getEstadoResidente | ✓ |
| Admin V8 | adminLogin | ✓ |
| Vigilantes V9 | vigilanteLogin | ✓ |
| Mudanzas V8 | verificarPropietario | ✓ |
| Formulario V8 | lookup | ✓ |
| Formulario V8 | nextId | ✓ |

**Resultado:** 13/13 OK. Ningún servicio existente se rompió.

### 2.9 Actualización de documentación

Después del deploy, se actualizaron los siguientes archivos:

1. `docs/CHANGELOG-BUGFIXES.md`:
   - Sección BUGFIX-009 con causa raíz, fix, lección #9
   - Sección "Estado del fix al 26-Sept-2026 12:15" con validación 13/13

2. `docs/TESTING-PROTOCOL.md`:
   - Advertencia crítica sobre apps Script bloqueando curl del sandbox
   - Sección §5 con los 6 tests del estado de cuenta (T-EC-1 al T-EC-6)

3. `docs/proyecto-estado-cuenta.md`:
   - Cabecera: V12 → V18 desplegado y validado
   - Sección Apps Script: V12 (93KB, 67 fns) → V18 (148KB, 95 fns)
   - Estructura: incluye sesion-bugfix-009.md
   - Estado al cierre: V18 con 13/13 tests OK
   - Sección 13 nueva: BUGFIX-009 cronología completa

4. `docs/sesion-bugfix-009.md` (NUEVO): este archivo

5. `GUIA-PROYECTO.md`: pendiente actualizar

6. `README-project.md`: pendiente actualizar

7. `apps-script/README.md`: pendiente actualizar

---

## 3. Decisiones de diseño durante esta sesión

  · **Política Codigo.gs:** se commitean las 6 líneas de routing al repo
    (Codigo.gs SÍ commitea), pero el modulo-estado-cuenta.gs NO se commitea
    (vive solo en Drive). Esta es la política existente del proyecto.

  · **Generación de V18:** se concatenó Codigo.gs del repo (con las 6
    líneas) + modulo-estado-cuenta.gs al final = 95 funciones. Esto permite
    que el operador haga UN solo paste en Apps Script editor.

  · **Protocolo de testing:** se agregó Test 5 (estado de cuenta) a
    TESTING-PROTOCOL.md con 6 tests obligatorios pre/post deploy. También
    se documentó el falso negativo de curl/sandbox vs browser_console.

  · **Investigación forense:** cuando el operador pidió verificar V14-V17,
    se hizo análisis estático + cronología de git log + pruebas en vivo.
    Conclusión: el bug estuvo SIEMPRE ahí, no se "rompió" en algún momento.

---

## 4. Archivos modificados / creados en esta sesión

```
M apps-script/Código.gs                       (+7 líneas: comentario + 6 if)
M docs/CHANGELOG-BUGFIXES.md                  (BUGFIX-009 + sección "Estado del fix")
M docs/TESTING-PROTOCOL.md                    (Test 5 + advertencia sandbox)
M docs/proyecto-estado-cuenta.md               (cabecera, sección 13 BUGFIX-009)
+ docs/sesion-bugfix-009.md                    (NUEVO: este archivo)
```

Pendientes (sesión podría continuar):
```
M GUIA-PROYECTO.md                           (actualizar Apps Script V18)
M README-project.md                           (mencionar V18 + BUGFIX-009)
M apps-script/README.md                       (documentar 6 endpoints ec*)
```

---

## 5. URLs

**Lectura online (GitHub Pages):**
- https://fabig76.github.io/cerro-azul-residentes/estado-cuenta.html

**Backend Apps Script V18:**
- https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec

**V18 archivo en Drive:**
- https://drive.google.com/file/d/1Qu4IQbUHY8lM6WDdRQSoIuQ_6eZAmDaw/view
- Descarga: https://drive.usercontent.google.com/download?id=1Qu4IQbUHY8lM6WDdRQSoIuQ_6eZAmDaw&export=download&confirm=t

---

## 6. Commits

```
b40cd13  fix(doPost): routing 6 endpoints ec* (BUGFIX-009 portal estado cuenta roto)
3161d69  docs(BUGFIX-009): validar V18 desplegado 13/13 OK + estado del fix
b2d0528  docs(vigilantes+estado-cuenta): actualizar specs y crear sesion del manual (anterior)
```

---

## 7. Pendientes para futuras sesiones

  · Probar el caso del propietario 504 con sus credenciales reales (cuando
    el operador las proporcione)

  · Comunicar al propietario 504 que ya puede consultar su estado de
    cuenta en https://fabig76.github.io/cerro-azul-residentes/estado-cuenta.html

  · Sprint / Fase 6: cargar cartera septiembre cuando el contador entregue
    los archivos (XLS + PDF unificado)

  · Actualizar GUIA-PROYECTO.md y README-project.md con V18 + BUGFIX-009

  · Considerar agregar al repo un test E2E automático (post-deploy script
    que ejecute T-EC-1..6 y alerte si fallan)

---

## 8. Lecciones aprendidas (esta sesión)

  · **Doble verificación antes de declarar "funciona":** probar TODOS los
    endpoints públicos con credenciales reales desde navegador real, no
    solo el feature nuevo + regresiones superficiales

  · **Apps Script Web App + curl del sandbox = falso negativo:** Apps
    Script bloquea requests sin User-Agent de navegador con HTTP 403 +
    HTML "Datei kann derzeit nicht geöffnet werden" en alemán. Esto hace
    parecer que el backend está caído cuando NO lo está.

  · **Diferenciar "frontend carga" vs "flujo funciona":** un HTML puede
    cargar perfectamente (URL correcta, sin errores JS) pero el flujo
    end-to-end puede estar roto en el backend sin que aparezca error en
    la UI. Solo se detecta con pruebas E2E reales.

  · **Las memorias pueden ser incorrectas:** un resumen "V12 OK 22
    endpoints 18 ec*" escrito en el pasado puede ser falso si no se
    validó en su momento. SIEMPRE validar antes de confiar.

  · **El orden cronológico de los deploys:** mudanzas → estado de cuenta
    → residente → salón. Cada uno agregó su routing al doPost en orden.
    El bug de V12-V17 fue que el routing del estado de cuenta NUNCA se
    agregó (el módulo sí, el routing no).

  · **Para los próximos deploys del módulo contable:** ejecutar Test 5
    (T-EC-1 al T-EC-6) antes de declarar el deploy como exitoso.

---

*Archivo generado al cierre de la sesión BUGFIX-009 del 26-Sept-2026.*
*Próxima sesión: cargar septiembre (Fase 6) o mejoras adicionales.*