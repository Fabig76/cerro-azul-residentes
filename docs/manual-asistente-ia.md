# Manual del Asistente IA · Cerro Azul

**Para quién es:** Residentes, propietarios, vigilantes y administradores que necesitan ayuda para usar los portales digitales del conjunto.
**Cómo usar:** Abrir cualquier portal Cerro Azul. El banner azul arriba dice "🤖 Ayudante con IA". Click en "Abrir chat" o directamente escribir en la caja de texto abajo-derecha.

---

## 1. ¿Qué es el Asistente IA?

Es un chat de ayuda disponible en **los 7 portales Cerro Azul** que responde preguntas sobre:

- Cómo llenar el formulario público de residentes
- Cómo reservar el salón social
- Cómo editar tu registro si ya enviaste antes
- Cómo consultar tu estado de cuenta
- Cómo descargar tu paz y salvo
- Cómo auto-registrarte como residente (portal del residente)
- Cómo pedir tu QR de acceso
- Y más

**No es** un chat que pueda modificar tus datos. Solo te ayuda a entender los procedimientos.

---

## 2. Cómo abrir el chat

1. Abre cualquier portal Cerro Azul (la página principal `fabig76.github.io/cerro-azul-residentes` o cualquiera de los otros 6)
2. Verás un **banner azul arriba** que dice: "🤖 Ayudante con IA para llenar el formulario. Click para abrir el chat."
3. La ventana de chat ya está **abierta abajo a la derecha** (no necesitas hacer click para abrirla)

Si cierras la ventana:
- Click en el botón **"─"** (minimizar) en la esquina superior derecha de la ventana
- Para reabrir: click en **"Abrir chat"** del banner azul de arriba

---

## 3. Cómo hacer una pregunta

1. Click en la caja de texto que dice "Escribe tu pregunta..."
2. Escribe tu pregunta (máximo 500 caracteres)
3. Presiona **Enter** o click en el botón **▶**

**Ejemplos de preguntas válidas:**
- "¿Cómo edito mi registro?"
- "¿Cuánto cuesta reservar el salón social?"
- "¿Cómo pago la administración?"
- "¿Quién es el administrador?"
- "¿Cómo solicito un QR?"

**Ejemplos de preguntas que NO responderá:**
- "¿Cuánto debe el apartamento 504?" → remitirá a la administración
- "¿Cuál es la clave del admin?" → no comparte claves
- "¿Quién vive en el apartamento 202?" → no da datos personales

---

## 4. Tipos de respuestas

### Respuesta con info del manual (burbuja gris)
Si tu pregunta está en el manual, el bot responde con:
- **Pasos numerados** (1, 2, 3...)
- **Botones entre comillas** (ej: toque **"Continuar"**)
- **URLs y opciones** destacadas

### Respuesta "fuera de alcance" (burbuja naranja)
Si tu pregunta NO está en el manual, el bot dice:
> "No tengo esa información en el manual. Por favor contacte a la administración: WhatsApp 316 924 0748 o correo urb.cerroazul@gmail.com."

### Respuesta de error (burbuja roja)
Si hay problema técnico:
- "La respuesta tardó demasiado (más de 60 s). Intenta de nuevo."
- "Error de red: ..."
- "El servicio de IA respondió con error. Intenta de nuevo."

---

## 5. Límites de uso

| Límite | Valor | Qué pasa si lo excedes |
|--------|-------|------------------------|
| Máximo por mensaje | 500 caracteres | Bot dice "demasiado largo" |
| Máximo por sesión | 10 mensajes cada 10 minutos | Bot dice "límite alcanzado, espera unos minutos" |
| Timeout por pregunta | 60 segundos | Bot dice "tardó demasiado" |

**El contador de sesión se reinicia al:**
- Cerrar y abrir el navegador
- Cambiar de pestaña
- Después de 10 minutos de inactividad

---

## 6. Qué SÍ puede hacer el bot

- Explicar procedimientos paso a paso
- Guiarte para llenar cada sección del formulario
- Indicar dónde encontrar cada portal
- Dar contactos admin (WhatsApp 316 924 0748, urb.cerroazul@gmail.com)
- Decirte las reglas (ej: no puedes reservar si tienes 2+ meses en mora)
- Mencionar emergencias (línea 123 + portería)

---

## 7. Qué NO puede hacer el bot

- ❌ Modificar tu registro (para editar ve a "Editar mi registro" del formulario principal)
- ❌ Decir cuánto debe tu apartamento (consulta estado de cuenta)
- ❌ Dar contraseñas
- ❌ Dar datos personales de otros residentes
- ❌ Confirmar pagos o reservas (revisar el Sheet directamente o contactar admin)
- ❌ Procesar pagos (usa Jelpit directamente)
- ❌ Hablar de temas que no sean del conjunto

---

## 8. Emergencias

Si tu pregunta es una emergencia (robo, incendio, accidente, etc.):

**NO uses el bot.** Llama directamente a:
- **Línea 123** (emergencias nacionales)
- **Portería** del conjunto
- **WhatsApp admin 316 924 0748**
- **Correo urb.cerroazul@gmail.com**

El bot te recordará estos números si detecta palabras como "emergencia", "robo", "accidente", etc.

---

## 9. Si el bot no entiende tu pregunta

1. **Reformula la pregunta** con palabras más simples
2. **Sé más específico**: en lugar de "¿cómo hago?", pregunta "¿cómo lleno el campo N° de apartamento?"
3. **Revisa el manual** (los manuales HTML están en la carpeta Drive del proyecto, sección 15 para vigilantes)
4. **Contacta a la administración** directamente

---

## 10. Para administradores

Si sos administrador del conjunto y querés:

- **Actualizar el manual del agente**: editá el Google Doc `1RUMeIXEcZkzFVTBNKe-F1ZbCTl3PRHpCzCeMFQCJD74` y avisale a Hermes para regenerar el código
- **Ver logs de uso**: Apps Script → Ejecuciones (últimas 100 ejecuciones del bot)
- **Cambiar la API key de MiniMax**: Apps Script → ⚙️ Configuración → Script Properties
- **Cambiar el mensaje de bienvenida**: editá `js/asistente.js` línea ~123 (mensaje hardcoded)
- **Desactivar el bot**: Apps Script → ⚙️ Configuración → Script Properties → borrar `MINIMAX_API_KEY`

---

## 11. Glosario

| Término | Significado |
|---------|-------------|
| Portal | Una página web del conjunto (hay 7 portales) |
| Apps Script | La plataforma serverless de Google donde corre el código del bot |
| Frontend | Lo que se ejecuta en tu computador/navegador (js/asistente.js) |
| Backend | Lo que se ejecuta en Google (Codigo.gs + chatAsistente) |
| MiniMax | El servicio de IA que genera las respuestas |
| Manual | El documento Google con toda la info que el bot puede responder |
| Script Property | Configuración guardada en Apps Script (clave/valor) |
| CORS | Política de seguridad que permite a tu navegador llamar a Apps Script |
| Cold start | Primera llamada lenta después de deploy (30-60s) |

---

Última actualización: 04-Oct-2026
Contacto: urb.cerroazul@gmail.com