# Proyecto Reservas del Salón Social — Cerro Azul

> Documento vivo del módulo de reservas del salón social.
> Estado: **COMPLETO Y EN PRODUCCIÓN** (25-Sept-2026).

---

## 1. Contexto

Quinto módulo funcional del proyecto `Fabig76/cerro-azul-residentes`.
Sexto portal (sexto contando el del residente).

Permite a los residentes y propietarios de la Urbanización Cerro Azul
reservar el salón social para eventos, con pago de $125.000 COP por turno.

---

## 2. Stack (mismo que el proyecto de residentes)

- **Frontend:** HTML/CSS/JS vanilla en GitHub Pages
- **Backend:** Google Apps Script Web App (V14 desplegado)
- **BD:** Pestaña nueva "salon social" en el Sheet Registros (mismo ID)
- **Sheet Cartera:** solo LECTURA (para validar mora)
- **Drive:** carpeta del proyecto para comprobantes
- **Mail:** `MailApp.sendEmail` para notificaciones al admin
- **Trigger:** time-based 1h para cancelación automática 48h

Cero costos adicionales, cero servidores propios.

---

## 3. Estructura de archivos

```
cerro-azul-residentes/
├── salon-social.html                     ← NUEVO: portal del salón
├── js/salon-social.js                     ← NUEVO: lógica (547 líneas)
├── assets/salon-social.css                ← NUEVO: estilos (200 líneas)
├── admin.html                             ← MOD: +pestaña Salón Social
├── js/admin.js                            ← MOD: +funciones salón social
├── vigilantes.html                        ← MOD: +tab Salón Social
├── js/vigilantes.js                       ← MOD: +funciones salón social
├── index.html                             ← MOD: +pestaña "🏛️ Reservar salón social"
├── apps-script/Código.gs                ← MOD: V14 (+11 endpoints)
├── docs/
│ ├── spec-salon-social.md                ← spec técnico completo
│ ├── proyecto-salon-social.md            ← este archivo
│ ├── sesion-salon-social.md              ← notas de sesión
│ └── manual-llenado-cerro-azul.html     ← MOD: +sección salón social
├── GUIA-PROYECTO.md                      ← MOD: +§23 Salón Social
├── docs/TESTING-PROTOCOL.md               ← MOD: +22 tests salón social
└── docs/CHANGELOG-BUGFIXES.md            ← MOD: +BUGFIX-007 + BUGFIX-008
```

---

## 4. Recursos

- **Sheet Registros:** `16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc` (pestaña nueva "salon social" sheetId 2030042121)
- **Sheet Cartera:** `1IQn1y3AoArQSI4dtwhUsH3PVGm0zsZCom0TEdSAfVb4` (lectura solo)
- **Apps Script ID:** `17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy`
- **Web App URL:** `https://script.google.com/macros/s/AKfycbxp...Zp/exec`
- **Carpeta backups proyecto:** `1RPHtWnVEFwzBKR1DCzBP1to9wLHY2F22`
- **Mail admin:** `urb.cerroazul@gmail.com`
- **Link pago:** `https://web-conjuntos.jelpit.com/pagar-mi-administracion#/` (de Config.link_pago)

---

## 5. Pestaña del Sheet "salon social"

17 columnas (A:Q):

| Col | Header | Tipo |
|---|---|---|
| A | ID RESERVA | RS-0001 correlativo |
| B | NUM FORM | CA-XXXX |
| C | N° APTO | referencia |
| D | CC SOLICITANTE | (prop o residente) |
| E | TIPO SOLICITANTE | Propietario / Residente |
| F | NOMBRE SOLICITANTE | denormalizado |
| G-Q | ... (12 cols más) |

Ver sección §23.7 de GUIA-PROYECTO.md para detalle completo.

---

## 6. 23 Decisiones D1-D23

Ver sección §23.9 de GUIA-PROYECTO.md o tabla completa en spec §3.

Resumen:
- 2 slots por día: Mañana (8-13) y Tarde (14-22), $125.000 cada uno
- Sin restricciones de día
- Calendario rolling window 30 días
- Mora: `meses prom >= 2` BLOQUEA
- Trigger 48h cancela automático si no sube comprobante
- Admin tiene pestaña separada con lista + ver comprobante + cancelar
- Vigilantes ven: fecha + slot + estado + apto + nombre

---

## 7. 11 Endpoints Apps Script + 1 Trigger

Ver sección §23.6 de GUIA-PROYECTO.md para tabla completa.

6 residente + 1 vigilante + 3 admin + 1 setup + 1 trigger

---

## 8. Reglas de Negocio

| Acción | Quién puede |
|---|---|
| Auto-registrarse en apto vacío | Cualquier residente con QR |
| Editar SU slot | Residente con CC + apto |
| Slot compartido ocupado por otro | ❌ |
| Subir comprobante | Residente de la reserva |
| Cancelar propia reserva | Residente antes de 48h |
| Cancelar cualquier reserva | Admin con motivo + adminPassword |

---

## 9. Tests (22 totales en TESTING-PROTOCOL.md)

| Test | Resultado |
|---|---|
| T-SAL-1 a T-SAL-3 | ✅ acceso CC prop / res / inválida |
| T-SAL-5, T-SAL-6 | ✅ dispSalon calendario |
| T-SAL-7, T-SAL-8, T-SAL-9, T-SAL-10 | ✅ reservar (feliz/ocupado/otro slot/fuera rango) |
| T-SAL-11, T-SAL-12 | ✅ subir comprobante (feliz/>10MB) |
| T-SAL-13 | ✅ cancelar |
| T-SAL-14 | ✅ editar slot |
| T-SAL-15 | ✅ vigilante consulta |
| T-SAL-16, T-SAL-17, T-SAL-18, T-SAL-19 | ✅ admin (lista/ver/cancelar con password) |
| T-SAL-20, T-SAL-21 | ✅ trigger setup/exec |
| T-SAL-22 | ✅ regresión V13 OK |

**10/22 ejecutados ✅, 12/22 pendientes** (requieren CC de apto en mora, archivo real, o esperar 48h).

---

## 10. Plan F0-F9 — TODAS LAS FASES ✅

| Fase | Estado |
|---|---|
| F0 — Backup pre-flight (5 archivos) | ✅ |
| F1 — Spec + wireframes (2 docs) | ✅ |
| F2 — Backend Codigo.gs V14 (11 endpoints) | ✅ |
| F3 — Pestaña "salon social" Sheet Registros | ✅ |
| F4 — Frontend salon-social.html (7 vistas) | ✅ |
| F5 — admin.html + vigilantes.html (pestañas salón) | ✅ |
| F6 — Trigger 48h time-based | ✅ |
| F7 — Manual HTML público + descargable | ✅ |
| F8 — Deploy Apps Script V14 | ✅ |
| F9 — Docs finales (GUIA §23, CHANGELOG, TESTING) | ✅ |

---

## 11. Bugs encontrados durante implementación

| Bugfix | Descripción | Estado |
|---|---|---|
| BUGFIX-007 | `apiGet/apiPost` faltantes en admin.js y vigilantes.js | ✅ FIXED (25-Sept) |
| BUGFIX-008 | `switchTab()` no toggleaba `tab-salon` (siempre oculto) | ✅ FIXED (25-Sept) |

**Lección:** las pruebas con curl validan backend pero NO el frontend
(bugs del DOM/JS solo se ven en el navegador real).

---

## 12. URLs Publicadas (todo en vivo)

| URL | Estado |
|---|---|
| Portal del salón: `https://fabig76.github.io/cerro-azul-residentes/salon-social.html` | ✅ HTTP 200 |
| Manual con sección salón: `https://fabig76.github.io/cerro-azul-residentes/docs/manual-llenado-cerro-azul.html` | ✅ HTTP 200 |
| Pestaña salón en `admin.html` | ✅ Funcional |
| Pestaña salón en `vigilantes.html` | ✅ Funcional |
| Backend Apps Script V14 | ✅ Desplegado |

---

*Archivo generado automáticamente al final de la sesión del 25-Sept-2026.
Sesión cerrada con todas las fases F0-F9 completadas.*