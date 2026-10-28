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
| T3 | neutralizar fórmulas y fijar formato de texto | `4799b02` | ✅ =HYPERLINK → '=HYPERLINK (texto literal); +57 → '+57; cc 0012345678 preserva cero inicial tras aplicar formato @ | safeCell_ en buildRowFromPayload/adminGuardar/mudanzas/salón; setupFormatoTexto_() manual. |
| T2 | login por POST, cierre de sesión y límite de intentos | `8d2ad0d` | ✅ 6 intentos admin: 5 'Contrasena incorrecta' → 6ª 'Demasiados intentos'; vigilanteLogin POST ok + token; logout ok; token revocado → 'Sesión no válida' | rateLimit_ con CacheService; ecAdminOk pasa a token; rutas GET de login se conservan hasta T13. |
| T4 | subirComprobanteSalon valida antes de tocar Drive | `03e6526` | ✅ reservaId inexistente → 'Reserva no encontrada' ANTES de crear archivo (orden verificado en código) | (b) magic-bytes y (c) PDF real quedan pendientes: requieren carpeta de comprobantes de la copia (no configurada). Adaptación: columnas de escritura no contiguas → 5 setValue dentro del lock. |
| T5 | límites en verificaciones y en el asistente | `4dd9b4b` | ✅ 11 llamadas lookup apto 9999: 10 'No se encontró' → 11ª 'Demasiados intentos' | chatAsistente: límite diario (500) + por origen (20/h); timeout 50→25. La prueba del chat (b/c) requiere MiniMax. |
| T7 | enrutado seguro y verificación de esquema | `2ea9f8d` | ✅ (a) action 'reservarSalón' → 'Acción no reconocida'; (b) POST sin action crea CA-0291; (c) D1 renombrada → 'Esquema de Registros alterado en la columna 4' (aborta, restaurada) | vigilanteVerMudanzas 22→23 col; constantes COL_MUD_REALIZADA/FECHA_CHECK/VIGILANTE. (d) descripción en mudanzas verificada por código. |
| T8 | correo que nunca rompe la operación | `1b689f0` | ✅ harness: GmailApp lanza → {enviado:false}; cuota baja → {enviado:false}; OK → {enviado:true} | enviarEmailSeguro_ en las 5 llamadas de Salón; 4 respuestas añaden correoEnviado. La prueba end-to-end (alias noexiste) requiere reserva válida de salón en la copia. |
| T9 | registrarResidente preserva dispositivos del propietario | `bef8559` | ✅ harness: _preservarDispositivos conserva Disp1.codigo='LLV-001' ignorando lo que envíe el residente | Cambio único: dispositivosFinal = _preservarDispositivos(row.values). Sin validaciones de identidad (decisión del admin). |
| T10 | idempotencia de creaciones y borrado lógico | `631e302` | ✅ 2 POST submitRecord con mismo clientRequestId → 1 fila (CA-0292), respuestas idénticas | idempotente_ en 4 rutas; adminBorrarReservaMudanza borrado lógico 'Borrada'; cancelarMudanza/vigilanteCheckMudanza búsqueda dentro del lock; clientRequestId en app/salon/residente.js. (b)/(c) end-to-end requieren reserva válida. |
| T13 | login por POST y sesión expirada (frontend) | `3655c1d` | ✅ grep 'password=' en URLs=0; prompt()=0; sintaxis OK | admin/vigilante/cartera login por POST; logout revoca token; loginAt 11h; _password→_token en cartera; backend adminCancelarReservaSalon sin contraseña adicional. |

## Observaciones fuera de alcance (anotadas, no ejecutadas)

- El repositorio mantiene dos archivos idénticos de backend (`Código.gs` y `Codigo_V46_BLINDAJE-SUBMIT_20261027.gs`); la Tarea 17 los unificará.
- La copia de pruebas hereda ~700 filas vacías al final de `Registros` (la Tarea 19 las purga).
- El web app de pruebas requiere publicación manual desde el editor (la API deja el despliegue "a medio inicializar" sin acceso anónimo).
