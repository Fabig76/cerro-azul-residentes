# Bitácora — Auditoría técnica Portal Cerro Azul (28-Oct-2026)

Registro de las tareas ejecutadas sobre el plan de `INSTRUCCIONES_AGENTE_Portal_Cerro_Azul.md`
(19 tareas, fase 1-2 de la auditoría). Una línea por tarea: número, título, commit,
resultado de la prueba y observaciones fuera de alcance.

Entorno de pruebas:
- Copia de la hoja: `PRUEBAS - Cerro Azul - 2026-10-28`
- Proyecto Apps Script: `PRUEBAS Cerro Azul`
- Rama: `auditoria-fase-1`

## Tareas

| N | Título | Commit | Prueba | Observaciones |
|---|---|---|---|---|
| T6 | Bloqueo en submitRecord y adminGuardar | `b2393ad` | ✅ 5 POST simultáneos → 5 filas, 5 CA distintos (CA-0284..0288), 0 duplicados; editMode actualiza la fila correcta; yaBloqueado no auto-bloquea | El BLINDAJE V46 no eliminaba la carrera; el lock sí. |
| T1 | vigilanteBuscarPorPlaca deja de entregar credenciales | `fa10e36` | ✅ placa de 1 char → "Ingrese al menos 3 caracteres"; placa de 3+ → ok con claves [apto, diligencia, nombreProp, vehiculos, rowNumber] (sin numForm ni ccProp) | Se verificó end-to-end con token de vigilante real contra la copia. |
| T12 | escape HTML en vigilantes y admin (XSS) | `1406051` | ✅ sintaxis OK; escapeHtml neutraliza `<img onerror>`; sin onclick inline restantes | Adaptación: `CA` no existía aún, se corrigió el cuerpo de escapeHtml directo; migración a CA queda en T16. |
| T11 | js/config.js y js/common.js | `ac37fce` | ✅ grep AKfycb solo en config.js; CA.escapeHtml neutraliza; CA.hoyLocal correcto; sintaxis OK | Configura la URL en una sola fuente y crea el objeto CA (requisito de T12/T16). |

## Observaciones fuera de alcance (anotadas, no ejecutadas)

- El repositorio mantiene dos archivos idénticos de backend (`Código.gs` y `Codigo_V46_BLINDAJE-SUBMIT_20261027.gs`); la Tarea 17 los unificará.
- La copia de pruebas hereda ~700 filas vacías al final de `Registros` (la Tarea 19 las purga).
- El web app de pruebas requiere publicación manual desde el editor (la API deja el despliegue "a medio inicializar" sin acceso anónimo).
