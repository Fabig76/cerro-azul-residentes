# Proyecto Asistente IA · Cerro Azul

**Fecha:** 04-Oct-2026
**Status:** DESPLEGADO EN PRODUCCIÓN (Versión 25 en Apps Script)
**Tiempo invertido:** ~1 sesión (3 horas)
**Costo por mensaje:** ~$0.012 USD (~$36 USD total campaña con 600 aptos)

---

## Resumen ejecutivo (1 párrafo)

Se implementó un agente de ayuda conversacional basado en MiniMax-M3 que aparece como banner fijo y ventana de chat flotante en los 7 portales Cerro Azul. Responde preguntas sobre cómo llenar los formularios y portales del conjunto, usando como ÚNICA fuente de conocimiento el Manual Oficial del Agente (Google Doc mantenido por la administración, embebido como constante en el código backend). Las respuestas son fieles al manual, no inventan información, y remiten a la administración (WhatsApp 316 924 0748 / urb.cerroazul@gmail.com) cuando la pregunta está fuera del manual o requiere atención humana.

---

## Stack

| Capa | Tecnología | Versión |
|------|------------|---------|
| Frontend | Vanilla JS (autocontenido) | js/asistente.js v1 (306 líneas) |
| Backend | Google Apps Script Web App | Versión 25 (deploy manual) |
| LLM | MiniMax M3 (formato Anthropic Messages) | API compatible Anthropic |
| Fuente de conocimiento | Google Doc embebido como constante en código | MANUAL_CERRO (44KB) |
| Hosting frontend | GitHub Pages | https://fabig76.github.io/cerro-azul-residentes/ |

---

## Funcionalidad

| Feature | Descripción |
|---------|-------------|
| Banner permanente | "🤖 Ayudante con IA para llenar el formulario. Click para abrir el chat." |
| Ventana de chat | Abajo-derecha, mensaje de bienvenida visible |
| 9 reglas estrictas | (1) Solo responde con info del manual, (2) NO datos personales, (3) NO contraseñas, etc. |
| Respuesta con formato | Listas numeradas + comillas en botones (estilo del manual) |
| Badge "fuera de alcance" | Naranja, cuando el modelo no encuentra info |
| Badge "error" | Rojo, cuando falla la llamada |
| Rate limit | 10 mensajes / 10 minutos por sesión (sessionStorage) |
| Validación longitud | Max 500 caracteres por mensaje |
| Timeout | 60s en frontend, 50s en backend |

---

## Portales donde aparece

| Portal | URL | Test E2E |
|--------|-----|----------|
| Formulario público | `index.html` | PASA |
| Admin | `admin.html` | PASA |
| Vigilantes | `vigilantes.html` | PASA |
| Estado de cuenta | `estado-cuenta.html` | PASA |
| Salón social | `salon-social.html` | PASA |
| Portal del residente | `residente.html` | PASA |
| Cargador de cartera | `cartera-admin.html` | PASA |

---

## Configuración (Script Properties Apps Script)

| Propiedad | Requerido | Default | Descripción |
|-----------|-----------|---------|-------------|
| `MINIMAX_API_KEY` | SÍ | (vacío) | Subscription key de MiniMax |
| `MINIMAX_BASE_URL` | NO | `https://api.minimax.io/anthropic` | Endpoint base |
| `MINIMAX_GROUP_ID` | NO | (vacío) | ID de grupo de facturación |

---

## Costo

| Concepto | Cálculo | Total |
|----------|---------|-------|
| Por mensaje | ~12K tokens × $0.001/1K | ~$0.012 USD |
| Campaña completa (600 aptos × 5 preguntas promedio) | $0.012 × 3000 | **~$36 USD** |
| Equivalente en COP | $36 USD × ~4200 COP/USD | **~$150K COP** |
| Equivalente en horas del admin | Admin gana ~$15k COP/hora | ~10 horas |

**Conclusión:** el costo es despreciable para una copropiedad.

---

## Limitaciones conocidas

- Bot NO tiene acceso al Sheet Registros (no puede leer datos específicos como deudas)
- Bot NO puede hacer cambios (solo responder preguntas)
- Si el manual NO tiene la respuesta, el bot remite a la administración
- Respuestas en español de Colombia (no funciona en otros idiomas)
- MiniMax-M3 no soporta imágenes (solo el portal admin usa visión via Hermes Agent)

---

## Mantenimiento

### Actualizar el manual

1. Operador edita Google Doc `1RUMeIXEcZkzFVTBNKe-F1ZbCTl3PRHpCzCeMFQCJD74`
2. Operador avisa a Hermes
3. Hermes genera nuevo Codigo.gs con constante actualizada
4. Hermes sube V_N+1 a Drive
5. Operador deploya

### Rollback

Apps Script → Implementar → seleccionar versión anterior → Implementar

---

## Lecciones aprendidas

1. **Lección #15:** Cada botón nuevo en HTML debe tener su handler en el MISMO commit
2. **Lección #16:** Para `await` antes de cambio de vista, usar optimistic UI
3. **Lección #17:** NUNCA asumir formato OpenAI-compatible para un provider
4. **Lección #18:** Cuando un elemento es `position: fixed; top: 0`, agregar SIEMPRE padding-top compensatorio
5. **Lección #19:** Google Doc como fuente es mantenible, pero requiere flujo claro
6. **Lección #20:** Preguntar SIEMPRE cómo el operador va a mantener la fuente antes de elegir cache

---

## Próximos pasos sugeridos (futuro)

- [ ] Agregar métricas de uso (# preguntas, # remisiones a admin, tiempo promedio de respuesta)
- [ ] Análisis de sentimiento (alertas si residente está frustrado)
- [ ] Historial de conversaciones (memoria entre mensajes)
- [ ] Soporte para imágenes (si residente quiere mostrar un error)
- [ ] Integración con WhatsApp (mismo bot por WhatsApp Business API)
- [ ] Multi-idioma (inglés para residentes extranjeros)

---

Última actualización: 04-Oct-2026
Mantenedor: Hermes Agent + Fabio Lesmes (operador)