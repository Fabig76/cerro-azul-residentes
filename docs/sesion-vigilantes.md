# Notas de Sesión — Manual del Vigilante

> Archivo de referencia para futuras sesiones. Documenta el trabajo
> realizado en la sesión del 25-Sept-2026 para crear el manual
> detallado del portal de vigilancia.

---

## Metadata

- **Fecha:** 25-Sept-2026 (jueves, sesión nocturna)
- **Operador:** Fabio (UdeCataluña, docente)
- **Modelo:** MiniMax-M3 vía minimax
- **Canal:** CLI
- **Idioma:** español

---

## 1. Punto de partida

Al iniciar esta sesión, el portal de vigilancia ya estaba implementado y
desplegado (V9 inicial + V10 con endpoint de placas), pero NO existía
un manual para los vigilantes.

El operador pidió:
> "ahora crea un manual detallado para el portal de vigilantes pero muy
> detallado y claro los vigilantes no tienen casi conocimientos tecnologicos
> asi que debe sre muy intuitico y claro y detallado en fomrato html"

---

## 2. Trabajo realizado

### 2.1 Archivo creado

`docs/manual-vigilantes.html` (68.391 bytes, ~900 líneas)

Manual completo paso a paso con 13 secciones:

1. **Portada** con logo y botón de inicio
2. **Índice** con 13 entradas
3. **Antes de empezar** — qué es, requisitos, vista general
4. **Sección 1 — Iniciar sesión** (login con contraseña)
5. **Sección 2 — Buscar un residente** (criterios de búsqueda, ejemplos)
6. **Sección 3 — Ver toda la información** (ficha con 11 secciones plegables)
7. **Sección 4 — Buscar por placa** (caso de incidente vehicular)
8. **Sección 5 — Ver mudanzas del día** (con leyenda de colores)
9. **Sección 6 — Registrar check de mudanza** (Sí/No se realizó)
10. **Sección 7 — Consultar reservas del Salón** (2 tarjetas Mañana/Tarde)
11. **Sección 8 — Cerrar sesión** (por seguridad)
12. **Preguntas frecuentes** (8 preguntas comunes)
13. **Errores comunes** (5 errores con soluciones paso a paso)
14. **Glosario** (18 términos: apartamento, cédula, mudanza, portal, pestaña, sesión, torre, URL, etc.)
15. **¿Necesitas ayuda?** (contacto al administrador)

### 2.2 Decisiones de diseño del manual

- **Lenguaje simple** sin jerga técnica
- **Capturas ASCII grandes** (mockups) que muestran cómo se ve la pantalla
- **Pasos numerados** con descripciones cortas
- **Botones de colores** (verde = OK, rojo = peligro, azul = primario)
- **Tablas comparativas** (lo que muestra vs lo que NO muestra)
- **Cajas de información** con 5 colores:
 - 🔵 Azul: información importante
 - 🟠 Naranja: avisos
 - 🔴 Rojo: errores
 - 🟢 Verde: consejos
 - 🟡 Amarillo: tips
- **Inputs visuales** con ejemplos de cómo escribir
- **Sección "Errores comunes"** con soluciones inmediatas
- **Glosario** que explica términos como "URL", "pestaña", "sesión", etc.
- **Responsive** (media queries para 600px)

---

## 3. Archivos modificados

```
docs/manual-vigilantes.html (NUEVO, 68KB)
```

Ninguna modificación al backend ni a otros archivos frontend. El manual
es documentación independiente.

---

## 4. URLs

**Lectura online (GitHub Pages):**
```
https://fabig76.github.io/cerro-azul-residentes/docs/manual-vigilantes.html
```

**Descarga directa (raw):**
```
https://raw.githubusercontent.com/Fabig76/cerro-azul-residentes/main/docs/manual-vigilantes.html
```

---

## 5. Commit

```
02fb398 docs: manual del vigilante — guia detallada paso a paso
```

---

## 6. Pendiente para futuras sesiones

- [ ] Considerar agregar versión PDF del manual (con weasyprint o similar)
- [ ] Agregar video tutorial paso a paso (capturas de pantalla reales)
- [ ] Capacitación presencial de 30 min con los vigilantes
- [ ] Traducir manual a otros idiomas si hay residentes extranjeros
- [ ] Actualizar manual cuando se agreguen nuevas pestañas al portal

---

## 7. Lecciones aprendidas

- **Manuales para personal con baja alfabetización digital** deben ser MUY
  paso a paso, con capturas grandes y sin asumir conocimiento previo
- **Glosario de términos técnicos** es crítico para audiencia no técnica
- **Sección de errores comunes** ahorra tiempo de soporte
- **Mockups ASCII grandes** son una alternativa válida cuando no se tienen
  capturas de pantalla reales (y son más rápidas de producir)
- **Sección "¿Necesitas ayuda?"** con contacto del administrador es esencial

---

*Archivo generado automáticamente al final de la sesión del 25-Sept-2026.
Próxima sesión: continuar con mejoras del módulo salón social o cualquier
otra tarea del proyecto.*