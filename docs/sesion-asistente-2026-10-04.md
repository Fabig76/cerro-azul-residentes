# Sesión 2026-10-04 · Agente IA Cerro Azul

**Inicio:** 04-Oct-2026 16:29 COL
**Fin:** 04-Oct-2026 19:30 COL
**Status final:** DESPLEGADO EN PRODUCCIÓN (Versión 25 en Apps Script)

---

## Resumen ejecutivo

Sesión de ~3 horas donde se implementó un agente de ayuda IA basado en MiniMax-M3 que aparece como banner + ventana de chat flotante en los 7 portales Cerro Azul. El agente usa como ÚNICA fuente de conocimiento el manual oficial (Google Doc del operador) embebido como constante en el código backend.

**Iteraciones:** 6 rondas (de spec inicial a deploy final)
**Decisiones clave:** 4 (formato auth, formato manual, ventana abierta, sin memoria)
**Bugs pre-deploy detectados y corregidos:** 2 (formato OpenAI vs Anthropic, banner tapaba header)
**Versiones generadas:** 5 (V23, V23.1, V24, V25, V26) — Apps Script asignó Versión 25 al deploy final

---

## Cronología

### 16:29 — Petición inicial del operador
Operador pidió integrar un agente pequeño en ventana flotante que pueda guiar a los que van a llenar el formato. Características:
- Responda si no saben hacer algo
- Puede ser que no esté dentro de la estructura del código pero sí integrado
- NO debe contestar nada más que cosas relacionadas con llenar el formato
- No quiere tan sumamente complicado
- Podría usar el API de minimax (interpretado como MiniMax)

### 16:35 — Spec conceptual y 4 preguntas críticas
Hermes propuso wireframe + stack mínimo (150 líneas total):
- 1 archivo `js/asistente.js` (~80 líneas)
- 1 endpoint `chatAsistente()` en Apps Script (~40 líneas)
- 1 system prompt restrictivo (~300 caracteres)

**4 preguntas críticas**:
1. ¿En cuáles portales? → "2" = los 7 portales
2. ¿Quién asume el costo? → Yo (operador)
3. ¿Memoria? → Sin memoria
4. ¿Visibilidad? → Ventana abierta (FAB cerrado era muy invasivo)

**Última instrucción:** "la ventana habierta o un boton que diga ayudante con IA puede ser mejor, como se haria todos esto?"

### 16:42 — Wireframe final + plan completo
Hermes mostró cómo quedaría y los 4 archivos a tocar:
- NUEVO: `js/asistente.js` (~120 líneas)
- NUEVO: endpoint `chatAsistente()` en Apps Script (~50 líneas)
- MODIFICADO: 7 HTML (1 línea cada uno antes de `</body>`)
- MODIFICADO: `Codigo.gs` (1 case en doPost)

**System prompt restrictivo** (~600 caracteres): SOLO responder sobre el formulario Cerro Azul, frase literal si tema fuera del formulario.

**Configuración:** 1 Script Property `MINIMAX_API_KEY`

**Costo:** ~$0.001/mensaje, $3 USD total campaña.

### 16:45 — Implementación FEAT-007 v1 (V23)
3 commits: 497f27d, e33b718, 21c19c5, 9bf633c
- Creado `js/asistente.js` (302 líneas)
- Modificados 7 HTML (1 línea `<script src="js/asistente.js?v=1">` cada uno)
- Agregada función `chatAsistente()` con system prompt restrictivo
- Routing en `doPost` línea 197
- Documentado en CHANGELOG + GUIA

**Entrega al operador con instrucciones de deploy (3 pasos).**

### 17:00 — Auditoría rigurosa del operador

Operador pidió y verificó:

**Q1: ¿Hará más lenta la página?**
R: NO. JS es 13KB, async, lazy (solo dispara fetch al click ▶).

**Q2: ¿Es un VPS?**
R: NO. GitHub Pages = CDN estático + Apps Script = serverless Google.

**Q3: ¿Afecta el funcionamiento de los formularios?**
R: NO rompía nada en frontend, PERO auditoría descubrió dos bugs graves pre-deploy:
- **Bug 1 (CRÍTICO):** Backend usaba formato OpenAI-compatible `/v1/chat/completions`. Habría dado 404 en cuanto se probara.
- **Bug 2 (UX):** Banner con z-index 9998 tapaba el logo del header.

**Q4: Suscripción Token Plan / Subscription Key**
R: CONFIRMADO. Encontrado en `/root/.hermes/config.yaml`:
- `base_url: https://api.minimax.io/anthropic` (NO `/v1`)
- `extra_body.group_id: '523700352705306633'`
- Y en `hermes_cli/auth.py:294`: `inference_base_url="https://api.minimax.io/anthropic"`
- Y en `hermes_cli/azure_detect.py:247-294`: probe formato Anthropic

**Conclusión:** Mi código inicial estaba mal. **MiniMax NO usa OpenAI-compat, usa Anthropic Messages API.**

### 17:15 — Fix BUGFIX-016 (V23.1)
Commits: 21c19c5 + 9bf633c

**Fix Bug 1 (Backend):**
- URL: `https://api.minimax.io/anthropic/v1/messages` (NO `/v1/chat/completions`)
- Headers: `x-api-key` + `anthropic-version: 2023-06-01` + `Authorization: Bearer` (compat)
- Body: `{model, max_tokens, system, messages}` con `system` top-level
- Respuesta: `{content:[{type:"text", text:"..."}]}` (NO `choices[0].message.content`)

**Fix Bug 2 (Frontend):**
```css
body { padding-top: 46px !important; }
header.site-header { position: relative; z-index: 1; }
```

**Auditoría visual post-fix en 3 portales** (browser_vision):
- ✓ index.html: banner + header + form OK
- ✓ admin.html: banner + header + form login OK
- ✓ salon-social.html: banner + header + form reserva OK

### 17:30 — V23.1 subido a Drive
- md5: `adf63c56c2659c9c000c567ca44f6d78`
- Drive: `12CRVfDtDuVgyQ1VEqGFbMCnkVWMDRqqu`

**Entrega al operador** con instrucciones de deploy.

### 18:00 — Operador confirma deploy "Versión 24"
Operador: "Versión 24 del 4 oct 2026, 11:30" + URL del Web App.

Hermes verificó E2E:
- Backend respondía con error "Falta MINIMAX_API_KEY en Script Properties"
- Conclusión: routing OK, faltaba configurar API key

Operador configuró `MINIMAX_API_KEY` y volvió a probar.

### 18:15 — Chat responde OK

Hermes hizo 3 pruebas E2E:

**P1: "¿Cómo edito mi registro si ya lo envié antes?"**
R1: "Para editar un registro ya enviado, contacte directamente a la administración... No es posible modificarlo directamente del formulario..."
⚠️ **Imprecisa** — Decía "no es posible" cuando SÍ existe la pestaña "✏️ Editar mi registro"

**P2: "¿Quién ganó el mundial?"**
R2: "Solo puedo ayudarte con preguntas sobre el formulario de la Urbanización Cerro Azul."
✓ Perfecto — frase literal + badge naranja

**P3: "¿Cómo reservo el salón social?"**
R3: "Para reservar el salón social, ingresa al portal de 'Salón Social' del formulario... El costo de la reserva te aparecerá automáticamente..."
⚠️ **Vaga** — No dijo el precio ($125.000), no mencionó regla de mora, no dijo Jelpit

**Conclusión:** Chat funciona, pero respuestas vagas. Necesita más contexto.

### 18:25 — Enriquecimiento system prompt (V24 → V25)
Commit: 3cda634

Enriqueció el system prompt con:
- Lista los 7 portales con URL interna y secciones
- Salón social: $125.000 COP/slot (NO inventado), 2 turnos, regla de mora 2+ meses
- Forma de pago: Jelpit + comprobante
- Portal del residente: QR genérico por apto
- Ley 1581/2012 + Decreto 768/2025
- Cómo editar (SÍ se puede con pestaña + numForm + CC)

**Pero el operador tenía una mejor idea.**

### 18:35 — Operador crea manual oficial (Google Doc)

Operador: "he creado este archivo para que el agente pueda responder correctamente, es posible conectarlo y que sea su única fuente de respuestas? https://docs.google.com/document/d/1RUMeIXEcZkzFVTBNKe-F1ZbCTl3PRHpCzCeMFQCJD74/edit"

Hermes descargó el doc:
- 815 líneas / 45KB / ID `1RUMeIXEcZkzFVTBNKe-F1ZbCTl3PRHpCzCeMFQCJD74`
- Contiene: 15+ secciones, reglas estrictas, info de cada portal, contacto admin

**Propuso 2 opciones:**
- A: Inyectar completo (12K tokens/mensaje, $36 USD campaña)
- B: RAG chunking (3K tokens, $10 USD campaña, más complejo)

**Operador aprobó OPCIÓN A con:**
- ESTRICTA (única fuente)
- BORRAR del system prompt info del doc
- NO requiere autenticación, NO necesita OAuth
- TTL 6h para cache (luego discutido y eliminado)

### 18:50 — V25 con RAG simple sobre Google Doc
Commits: d7708fd, d4f1272

- Nueva Script Property `MANUAL_DOC_URL`
- Función `obtenerManualCerro()` con ScriptCache TTL 6h
- `chatAsistente()` inyecta doc completo como contexto
- System prompt restrictivo: SOLO responde con info del manual
- 9 reglas estrictas

### 19:00 — Operador cuestiona el cache

Operador: "RECORDATORIO DEL CACHE (TTL 6h) esto es innecesario porque yo no hare cambios en el archivo para que se hace esto no hace mas lentos este sistema?"

Operador: "yo nunca voy actualizar el documento cuando lo vaya hacer entonces lo traigo aqui y que hermes los actualice"

**Interpretación:** El manual NO se actualiza en runtime. Cuando cambie, viene a Hermes.

### 19:10 — REFACTOR V26 — Manual embebido en código
Commit: 370030d

- Eliminada función `obtenerManualCerro()` completa
- Eliminada Script Property `MANUAL_DOC_URL`
- Agregada constante `MANUAL_CERRO` con 44KB del manual
- `chatAsistente()` usa constante directo
- Sin cache, sin fetch, sin dependencia de Google Docs

### 19:15 — Operador pide auditoría minuciosa

Operador: "hantes realiza una auditoria minuciosa de este codigo y verifica los efectos en los portales y las demas dependencias"

Hermes auditó 7 frentes:
1. ✓ Sintaxis global OK
2. ✓ MANUAL_CERRO embebido correctamente (43890 chars idénticos al doc)
3. ✓ chatAsistente() validaciones + Logger.log + catch
4. ✓ 42 endpoints intactos (41 viejos + chatAsistente)
5. ✓ 7 portales verificados visualmente (header no tapado)
6. ✓ Z-index correcto (asistente 9998 > modal 1000)
7. ✓ Concurrencia: modal sigue funcionando con chat abierto

**0 bugs críticos. 1 hallazgo cosmético:** mensaje de bienvenida del JS dice "Urbanización Cerro Azul" en lugar de "Conjunto Residencial Cerro Azul PH". NO afecta funcionalidad.

### 19:25 — Operador deploya "Versión 25"

Operador: "Versión 25 del 4 oct 2026, 12:09" + URL del Web App.

**CONFUSIÓN:** Hermes inicialmente creyó que era el archivo V25 (con cache) pero realmente era el archivo V26 (constante embebida) que Apps Script enumeró como "Versión 25".

### 19:28 — Validación E2E de Versión 25 (= V26 con constante)

Hermes hizo 4 preguntas desde navegador real:

**P1: "¿Quién es el administrador del conjunto?"**
R1: "El administrador y representante legal del Conjunto Residencial Cerro Azul PH es el señor **Heyler Fabio Guaza**."
✓ Fiel al manual (sección 1)

**P2: "¿Cómo consigo un préstamo bancario para la cuota del conjunto?"**
R2: "No tengo esa información en el manual. Por favor contacte a la administración: WhatsApp 316 924 0748 o correo urb.cerroazul@gmail.com."
✓ Correcto — NO inventa

**P3: "¿Cuánto cuesta reservar el salón social?"**
R3: "No tengo esa información en el manual. Por favor contacte a la administración..."
✓ Correcto — el manual NO tiene precio específico, solo procedimiento

**P4: "¿Cómo reservo el salón social?"**
R4: Pasos numerados (1-4) con URLs en bold, turnos Mañana/Tarde, pago por Jelpit, regla de mora 2+ meses, restricción desde 1-oct-2026, contacto admin para info adicional. Termina preguntando "¿Pudo entender los pasos o necesita más ayuda?"
✓ EXCELENTE — fiel al manual, formato correcto, NO inventa, remite cuando no sabe

### 19:30 — Operador corrige confusión

Operador: "pero yo te dije que no voy actulizar el doc que cuando necesite lo hago por medio de la clic porque no entedeiste eso?"

Operador: "yo te dije que no voy actulizar el doc... si esto es lo correcto el codigo desplegado fue este que me subiste https://drive.google.com/file/d/1w20DY2fZ1VivfAOiXiY_uE-nqV2L9Xyh/view pero el portal pone 25 no es mi culpa"

**CONFIRMADO:** V26 (constante) está desplegado. El "25" del portal es el número que Apps Script asigna automáticamente, no el nombre del archivo.

Hermes reconoció el error de nombrado (yo numeré V23, V24, V25, V26 en mi cabeza pero Apps Script usa su propia numeración).

### 19:35 — Documentación final

Operador: "ahora documenta en los archivos .md toda la implementacion de agente en los portales y todo lo que aplicamos y ademas actualiza el git hub con lo nuevo"

En esta sesión se generaron/actualizarán:
- `docs/spec-asistente-ia.md` — spec completo del agente (NUEVO)
- `docs/proyecto-asistente-ia.md` — resumen ejecutivo (NUEVO)
- `docs/manual-asistente-ia.md` — manual de uso para usuarios finales (NUEVO)
- `docs/sesion-asistente-2026-10-04.md` — esta bitácora (NUEVO)
- `GUIA-PROYECTO.md` — agregar info del agente
- `apps-script/README.md` — agregar chatAsistente + MANUAL_CERRO
- `docs/CHANGELOG-BUGFIXES.md` — historial completo (ya actualizado)

---

## Métricas de la sesión

| Métrica | Valor |
|---------|-------|
| Commits | 8 (497f27d, e33b718, 21c19c5, 9bf633c, 3cda634, d7708fd, d4f1272, 370030d, e94e959) |
| Versiones generadas | 6 (V23, V23.1, V24, V25, V26) — Apps Script usa "Versión 25" para V26 |
| Archivos nuevos | 2 (js/asistente.js + 4 docs/) |
| Archivos modificados | 8 (7 HTML + Codigo.gs) |
| Líneas agregadas | ~510 (incluyendo MANUAL_CERRO constante) |
| Líneas eliminadas | ~50 (cache + fetch) |
| Versiones subidas a Drive | 4 (V23, V23.1, V24 prompt, V25 RAG, V26 embebido) |
| Bugs pre-deploy detectados | 2 (formato OpenAI, banner tapaba header) |
| Lecciones aprendidas | 6 (#15, #16, #17, #18, #19, #20) |

---

## Decisiones de diseño cerradas

1. **Ventana abierta por defecto** (operador: "ventana abierta o boton 'ayudante con IA'")
2. **Sin memoria** (operador: "sencillo")
3. **Costo asumido por operador** (ya tiene API key)
4. **Manual embebido en código** (operador: "yo traigo el doc acá y Hermes actualiza")
5. **Manual como ÚNICA fuente** (operador: "estricta")
6. **NO requiere autenticación** (Google Doc público vía export?format=txt)
7. **MiniMax-M3 con formato Anthropic Messages** (verificado en hermes_cli)
8. **9 reglas estrictas** (no datos, no claves, no inventar, etc.)

---

## Decisiones pendientes (futuro)

1. ¿Actualizar el mensaje de bienvenida del JS para decir "Conjunto Residencial Cerro Azul PH"? (cosmético, no afecta funcionalidad)
2. ¿Agregar precio del salón social ($125.000 COP) al manual? (actualmente dice "no tengo esa info")
3. ¿Implementar métricas de uso (# preguntas, # remisiones)?
4. ¿Soporte para imágenes? (MiniMax no soporta, habría que cambiar de modelo)

---

Última actualización: 04-Oct-2026 19:35 COL
Mantenedor: Hermes Agent + Fabio Lesmes (operador)