# Spec · Asistente IA Cerro Azul (FEAT-007 v2 / V26)

**Fecha de creación:** 04-Oct-2026
**Status:** DESPLEGADO EN PRODUCCIÓN (Apps Script "Versión 26" = V27 backend, V28 frontend live en GitHub Pages)
**Owner:** Fabio Lesmes (operador) + Hermes Agent
**Tipo:** Feature (no es bugfix)

---

## 1. Visión general

Agente de ayuda conversacional basado en MiniMax-M3 que aparece como **banner fijo + ventana de chat flotante** en los 7 portales Cerro Azul. Responde preguntas sobre cómo llenar los formularios y portales del conjunto, usando como ÚNICA fuente de conocimiento el **Manual Oficial del Agente** (Google Doc mantenido por la administración, embebido como constante en el código).

---

## 2. Objetivos

| # | Objetivo | Cómo se mide |
|---|---------|--------------|
| 1 | Reducir consultas básicas a la administración | Llamadas/mensajes al WhatsApp 316 924 0748 |
| 2 | Dar respuestas 24/7 a residentes/propietarios | Tasa de uptime del bot |
| 3 | Mantener tono y procedimientos coherentes con la administración | Fidelidad al manual (% respuestas con info literal del manual) |
| 4 | NO inventar información | Bot siempre responde con info del manual O remite a admin |
| 5 | NO exponer datos sensibles | 9 reglas estrictas en system prompt (Ley 1581/2012) |

---

## 3. Alcance

### 3.1 Dentro del alcance

- Responder preguntas sobre cómo usar los 7 portales (formulario público, salón social, portal del residente, estado de cuenta, admin, vigilantes, cargador de cartera)
- Guiar paso a paso con procedimientos del manual
- Indicar contactos admin (WhatsApp, correo) cuando la pregunta está fuera del manual
- Detectar emergencias y remitir a línea 123 + portería
- Aplicar restricciones de mora (apartamentos en mora no pueden reservar salón social)

### 3.2 Fuera del alcance

- Leer datos del Sheet Registros (el bot NO tiene acceso a datos de residentes)
- Modificar registros
- Calcular deudas
- Procesar pagos
- Cualquier acción de escritura sobre el Sheet
- **Guardar conversaciones** (NO se persiste nada entre recargas — el chat es
  100% en vivo, sin localStorage, sin cookies, sin Sheets). Solo `sessionStorage`
  para el rate limit (10 msg/10min). Operador confirmó este comportamiento.

---

## 4. Stack técnico

### 4.1 Frontend

- **Archivo:** `js/asistente.js` (V28, 333 líneas, autocontenido + mini-parser markdown)
- **CSS:** inyectado inline (no requiere archivo .css separado)
- **HTML:** inyectado inline (banner + ventana de chat al cargar)
- **Carga:** `<script src="js/asistente.js?v=1"></script>` antes de `</body>`
- **Activación:** automática en `DOMContentLoaded` (o inmediato si ya cargó)
- **Caché:** GitHub Pages sirve con `cache-control: max-age=600`. Cache-buster: `?v=N` para forzar reload

### 4.2 Backend

- **Endpoint Apps Script:** `chatAsistente(payload)` en `Codigo.gs` línea 4149
- **Routing:** `doPost` línea 197 → `if (action === 'chatAsistente') return jsonOut(chatAsistente(payload));`
- **Tamaño del archivo:** 193KB (incluye la constante MANUAL_CERRO de 44KB)
- **Límite Apps Script:** 10MB → 1.9% usado

### 4.3 LLM

- **Provider:** MiniMax (modelo `MiniMax-M3`)
- **Endpoint:** `https://api.minimax.io/anthropic/v1/messages` (formato Anthropic Messages API)
- **Auth:** Subscription Token Plan vía `MINIMAX_API_KEY` Script Property
  - Headers enviados: `x-api-key` + `anthropic-version: 2023-06-01` + `Authorization: Bearer` (compat)
  - Opcional: `MINIMAX_GROUP_ID` Script Property para facturación (default: vacío)
- **Costo:** ~$0.012/mensaje (~$36 USD total campaña con 600 aptos × 5 preguntas)

---

## 5. Configuración requerida

### 5.1 Script Properties (Apps Script → ⚙️ Configuración del proyecto)

| Propiedad | Requerido | Default | Descripción |
|-----------|-----------|---------|-------------|
| `MINIMAX_API_KEY` | SÍ | (vacío) | Subscription key de MiniMax |
| `MINIMAX_BASE_URL` | NO | `https://api.minimax.io/anthropic` | Endpoint base del API |
| `MINIMAX_GROUP_ID` | NO | (vacío) | ID de grupo de facturación Subscription Plan |

**NO se requiere `MANUAL_DOC_URL`** porque el manual está embebido en código.

### 5.2 Manual embebido (`MANUAL_CERRO` constante)

- **Fuente:** Google Doc `1RUMeIXEcZkzFVTBNKe-F1ZbCTl3PRHpCzCeMFQCJD74` (mantenido por la administración)
- **Tamaño:** 43890 caracteres / 815 líneas
- **Ubicación en código:** `Codigo.gs` línea 3330 (constante concatenada con `"..." +`)
- **Última actualización:** Versión 1.0 del manual, Septiembre 2026

---

## 6. Flujo end-to-end

```
1. USUARIO abre cualquier portal Cerro Azul
   ↓
2. asistente.js inyecta banner azul + ventana de chat al cargar
   ↓
3. USUARIO escribe pregunta en textarea + click ▶
   ↓
4. JS valida (≤500 chars, ≤10 msg/sesión/10min)
   ↓
5. JS POST a Apps Script Web App con {action: 'chatAsistente', mensaje: '...'}
   ↓
6. Apps Script doPost enruta a chatAsistente(payload)
   ↓
7. chatAsistente() construye body Anthropic:
     system = [9 reglas estrictas + estilo]
     user = MANUAL_CERRO (44KB) + pregunta del usuario
   ↓
8. UrlFetchApp.fetch POST a MiniMax-M3 con x-api-key + anthropic-version
   ↓
9. MiniMax procesa y devuelve JSON {content: [{text: "..."}]}
   ↓
10. chatAsistente() extrae respuesta, loguea, retorna {ok: true, respuesta}
   ↓
11. JSON.stringify en jsonOut() escapa caracteres especiales
   ↓
12. JS frontend renderiza respuesta en ventana de chat
   ↓
13. Si respuesta contiene "Solo puedo ayudarte con preguntas sobre el formulario..."
    → badge naranja "fuera de alcance" (CA-msg-bot ca-fuera)
   Si contiene "Error:" → badge rojo (ca-msg-bot ca-error)
   Sino → badge normal (ca-msg-bot)
```

---

## 7. System prompt restrictivo (9 reglas)

```
Eres el agente de ayuda del Conjunto Residencial Cerro Azul PH
(NIT 900.770.444-4, Bello/Niquía).

Respondes en español de Colombia, tratando de usted, con frases
cortas y un paso a la vez.

Tu ÚNICA fuente de información es el MANUAL OFICIAL que el
usuario te proporciona abajo.

Reglas estrictas:
1. SOLO responde con información que esté explícitamente en el manual.
2. Si la pregunta NO está cubierta por el manual, responde EXACTAMENTE:
   "No tengo esa información en el manual. Por favor contacte a la
   administración: WhatsApp 316 924 0748 o correo urb.cerroazul@gmail.com."
3. NUNCA des datos personales de otros residentes (nombres, cédulas,
   teléfonos, placas, deudas).
4. NUNCA reveles ni pidas contraseñas.
5. NUNCA digas cuánto debe un apartamento.
6. NUNCA prometas que un pago, reserva o registro quedó hecho.
7. NUNCA inventes respuestas.
8. Para emergencias, indica la línea 123 y portería.
9. Si la persona se identifica como vigilante, dale solo info de la
   sección 15 del manual.

Cuando expliques procedimientos, usa listas numeradas y nombra los
botones entre comillas (ej. toque "Continuar").
```

---

## 8. Decisiones de diseño

### 8.1 ¿Por qué Manual embebido en código y no Google Doc en runtime?

**Decisión final:** Manual embebido como constante `MANUAL_CERRO` en `Codigo.gs`.

**Razones:**
- El operador dijo: *"cuando lo vaya a actualizar lo traigo aquí y que Hermes lo actualice"*
- El manual NO cambia en runtime → no necesita cache ni fetch
- Latencia 0 (no hay descarga)
- Sin dependencia de Google Docs en runtime
- Sin lógica de TTL ni try/catch de URL

**Versión descartada (V25):** Fetch de Google Doc con cache 6h en ScriptCache
- Razón descartada: operador prefiere flujo "actualizo manualmente el código"
- Costo: +2-3s primera vez cada 6h
- Mantenibilidad: operador debe actualizar Script Property + esperar 6h

### 8.2 ¿Por qué MiniMax-M3 con formato Anthropic y no OpenAI?

**Decisión final:** Formato Anthropic Messages API.

**Razones:**
- MiniMax usa protocolo Anthropic Messages, NO OpenAI-compat
- Verificado en `hermes_cli/auth.py:294` y `azure_detect.py:247-294`
- Endpoint correcto: `{base_url}/v1/messages` (NO `/v1/chat/completions`)
- Headers correctos: `x-api-key` + `anthropic-version: 2023-06-01`
- Body shape: `{model, max_tokens, system, messages: [{role, content}]}` con `system` como campo top-level

**Versión descartada (V23):** OpenAI-compatible `/v1/chat/completions`
- Razón descartada: habría dado 404 en cuanto se probara
- Detectado en auditoría el 04-Oct-2026 por el operador

### 8.3 ¿Por qué ventana abierta por defecto y no FAB cerrado?

**Decisión final:** Banner fijo arriba + ventana de chat abierta abajo-derecha al cargar.

**Razones:**
- Operador pidió explícitamente "la ventana abierta o un boton que diga ayudante con IA puede ser mejor"
- Más descubrible para usuarios no técnicos
- El toggle abrir/cerrar sigue disponible (botón minimizar + banner)

**Versión descartada:** FAB cerrado que se abre al click
- Razón: menos descubrible para la base de usuarios con bajos conocimientos tecnológicos

### 8.4 ¿Por qué sin memoria (cada mensaje independiente)?

**Decisión final:** Sin memoria de chat. Cada mensaje es independiente.

**Razones:**
- Operador pidió "sencillo" y "sin cosas complicadas"
- Más simple: no requiere historial en frontend ni en backend
- Más barato: ~12K tokens por mensaje vs ~15K con historial
- Suficiente: el manual es lo bastante completo para responder preguntas individuales

**Versión descartada:** Memoria full conversacional
- Razón descartada: más complejo, más caro, overkill para el caso de uso

### 8.5 ¿Por qué temperature 0.3?

**Decisión final:** temperature=0.3

**Razones:**
- Queremos respuestas FIELES al manual, no creativas
- Manual tiene procedimientos paso a paso que deben seguirse literalmente
- 0.3 = baja aleatoriedad, alta consistencia

---

## 9. Validación y pruebas

### 9.1 T-ASIS-1 a T-ASIS-15 (TESTING-PROTOCOL.md §6)

| Test | Qué valida | Resultado V26 |
|------|-------------|---------------|
| T-ASIS-1 | Carga visual del banner + ventana | PASA |
| T-ASIS-2 | Header del portal no tapado | PASA (padding-top:46px) |
| T-ASIS-3 | Respuesta coherente en español | PASA |
| T-ASIS-4 | Pregunta fuera del manual → remisión | PASA |
| T-ASIS-5 | Tópico no relacionado → badge naranja | PASA |
| T-ASIS-6 | Pregunta sobre datos personales → rechazo | (no probado en V26) |
| T-ASIS-7 | Rate limit 10 msg/10min | (frontend, no backend) |
| T-ASIS-8 | Backend responde JSON no HTML | PASA |
| T-ASIS-9 | Formato Anthropic correcto (no 404) | PASA |
| T-ASIS-10 | Banner no tapa el header | PASA |
| T-ASIS-11 | "Heyler Fabio Guaza" correcto | PASA |
| T-ASIS-12 | "Préstamo bancario" → remisión | PASA |
| T-ASIS-13 | Pregunta del manual → respuesta del manual | PASA |
| T-ASIS-14 | Sin logs de obtenerManualCerro (eliminado en V26) | PASA |
| T-ASIS-15 | Latencia menor sin fetch | PASA |

### 9.2 Pruebas E2E realizadas (04-Oct-2026)

- P1: "¿Quién es el administrador?" → "Heyler Fabio Guaza"
- P2: "¿Cómo consigo un préstamo?" → "No tengo esa información..."
- P3: "¿Cuánto cuesta el salón?" → "No tengo esa información..."
- P4: "¿Cómo reservo el salón?" → Pasos numerados + Jelpit + mora

---

## 10. Mantenimiento

### 10.1 Cuando el operador quiera actualizar el manual

1. Operador edita el Google Doc `1RUMeIXEcZkzFVTBNKe-F1ZbCTl3PRHpCzCeMFQCJD74` en privado
2. Operador avisa a Hermes: "voy a actualizar el manual"
3. Hermes descarga el contenido actualizado (`curl -sL "URL/export?format=txt"`)
4. Hermes genera nueva constante `MANUAL_CERRO` con concatenación segura (escape de comillas, backslashes)
5. Hermes genera V_N+1 (`Codigo_V{N+1}_ASISTENTE_MANUAL_V{N}.gs`)
6. Hermes sube a Drive carpeta `Cerro Azul/proyecto formulario residentes/`
7. Hermes notifica al operador con:
   - MD5 del nuevo archivo
   - Link de descarga directa
   - Pasos de deploy (pegar + nueva implementación)
8. Operador hace deploy manual de V_N+1
9. Hermes valida con 2-3 preguntas E2E
10. Listo

### 10.2 Rollback

Si V_N+1 rompe algo:

1. Apps Script → Implementar → Administrar implementaciones → seleccionar V_N (anterior)
2. Implementar
3. Vuelve a V_N en producción

No requiere cambios en frontend (mismo js/asistente.js).

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Cold start de Apps Script (>30s) | Frontend tiene timeout 60s; muestra mensaje "tardó demasiado" |
| MiniMax sobrecargado | Frontend reintenta; rate limit 10 msg/10min previene abuso |
| Manual desactualizado | Operador avisa a Hermes; V_N+1 con manual nuevo |
| MiniMax caído | Frontend muestra error rojo "ca-error" |
| Alguien abusa con 1000 mensajes | Rate limit 10/10min + max 500 chars |
| Datos personales filtrados | 9 reglas estrictas en system prompt |
| Cambio de provider | `MINIMAX_BASE_URL` configurable; modificar `chatAsistente()` para nuevo formato |

---

## 12. Lecciones aprendidas

- **Lección #15:** Cada botón nuevo en HTML debe tener su handler en el MISMO commit
- **Lección #16:** Para `await` antes de cambio de vista, usar optimistic UI (showView antes del await)
- **Lección #17:** NUNCA asumir formato OpenAI-compatible para un provider — verificar el código fuente oficial
- **Lección #18:** Cuando un elemento es `position: fixed; top: 0`, agregar SIEMPRE padding-top compensatorio al body
- **Lección #19:** Google Doc como fuente es mantenible, pero requiere flujo claro de actualización
- **Lección #20:** Preguntar SIEMPRE cómo el operador va a mantener la fuente de conocimiento antes de elegir cache

---

## 13. Archivos relacionados
- `apps-script/Código.gs` — implementación backend V27 (chatAsistente + MANUAL_CERRO actualizado por el operador)
- `js/asistente.js` — V28 frontend (banner + ventana + fetch + parser markdown)
- `docs/spec-asistente-ia.md` — spec completo
- `docs/proyecto-asistente-ia.md` — resumen ejecutivo
- `docs/manual-asistente-ia.md` — manual de uso
- `docs/sesion-asistente-2026-10-04.md` — bitácora de la sesión
- `docs/CHANGELOG-BUGFIXES.md` — historial de FEAT-007, FEAT-007 v2, BUGFIX-016, REFACTOR-V26
- `GUIA-PROYECTO.md` — tabla de versiones desplegadas (incluye V23 → V26)
- `apps-script/README.md` — info del backend chatAsistente
- Drive `gdrive:/Cerro Azul/proyecto formulario residentes/` — archivos de deploy

---

Última actualización: 04-Oct-2026
Mantenedor: Hermes Agent + Fabio Lesmes (operador)