# Cerro Azul — Formulario Público de Residentes

Aplicación web estática (HTML/CSS/JS) servida desde GitHub Pages, con
backend en Google Apps Script y base de datos en Google Sheets.

**URL producción:** https://fabig76.github.io/cerro-azul-residentes/

## ¿Qué hace?

Formulario público obligatorio (Ley 1581/2012 y Decreto 768/2025) para
que los residentes de la Urbanización Cerro Azul (NIT 900770444,
Bello / Niquía, Colombia) actualicen sus datos y los de su familia,
vehículos, mascotas y contactos de emergencia. Reemplaza el formato
impreso en PDF.

## Tres módulos del formulario (pestañas)

  · **📝 Enviar / Crear registro** — alta de un nuevo apartamento
    (genera CA-XXXX, ~150 campos, deduplicado por apartamento)
  · **✏️ Editar mi registro** — modificación de un registro existente
    usando CA-XXXX + N° de apto
  · **🚚 Agendar mudanza** (sept 2026) — reserva de ascensor para
    mudanzas con validación de cédula del propietario

## Portal administrativo (sept 2026, V20 desplegado 26-Sept-2026)

  · **URL:** https://fabig76.github.io/cerro-azul-residentes/admin.html
  · Permite al admin buscar, ver y editar TODOS los registros sin
    necesidad del código CA-XXXX generado
  · Solo requiere contraseña (configurada en Sheet → Config!B1,
    valor definido por el administrador; no aparece en esta guía).
  · Busca por apto, nombre, cédula, correo, celular o CA-XXXX
  · Edita los 143 campos del registro (básicos, residentes, vehículos,
    mascotas, emergencias, etc.)
  · **3 pestañas de gestión:**
    · 👥 Residentes: buscar y editar registros
    · 📦 Mudanzas: ver reservas con filtro "Próximos N días" (BUGFIX-011)
    · 🏛️ Salón Social: ver y cancelar reservas
  · **IMPORTANTE:** NO elimina filas del Sheet. Solo edita.

## Portal de vigilancia (sept 2026, V19 desplegado 26-Sept-2026)

  · **URL:** https://fabig76.github.io/cerro-azul-residentes/vigilantes.html
  · Para el personal de vigilancia del conjunto
  · Solo consulta datos + marca checks de mudanzas (no edita registros)
  · Contraseña separada del admin (Sheet → Config!B2, valor
    definido por el administrador; no aparece en esta guía).
  · Ve datos SÍ: nombre, CC, vehículos, mascotas, parqueaderos,
    residentes, encargado, inmobiliaria
  · Ve datos NO: correo, celular, teléfono (privacidad)
  · Marca check de mudanzas con su nombre para auditoría
  · Pestaña especial "🚗 Buscar por placa" para incidentes vehiculares
    (búsqueda parcial, case-insensitive, devuelve apto+propietario)
  · **BUGFIX-010 / SEG-001 resuelto (V19):** el backend ya NO envía
    `numForm`, `ccProp`, `firmaNom`, `firmaCC` ni `residentes[].cc` en
    el JSON de `vigilanteVerResidentes` (Ley 1581/2012). Ver
    `docs/CHANGELOG-BUGFIXES.md` BUGFIX-010.

## Portal de estado de cuenta (sept 2026, V18 desplegado 26-Sept-2026)

  · **URL propietario:** https://fabig76.github.io/cerro-azul-residentes/estado-cuenta.html
  · **URL cargador admin:** https://fabig76.github.io/cerro-azul-residentes/cartera-admin.html
  · Los propietarios consultan su estado de cuenta, sus últimos pagos y
    descargan su factura y paz y salvo (Ley 1581/2012)
  · Login con CA-XXXX + N° apto + cédula (reutiliza `verificarPropietario`)
  · Paz y salvo solo si `total cartera < tolerancia` (saldo ≤ $1.000),
    y SOLO para diligencia "Propietario"
  · El cargador admin sube el Excel de cartera + PDF unificado (625
    facturas) que entrega el contador; el sistema los divide por REF.PAGO
  · **V18 Apps Script desplegado 26-Sept-2026 12:15** (95 funciones:
    70 Codigo.gs + 25 ec* del módulo). URL /exec preservada.
  · **BUGFIX-009 resuelto:** 6 endpoints `ec*` ahora enrutados en
    `doPost`. Antes de V18, el portal mostraba
    "Diligencia como debe ser Propietario, Tenedor / Otro (Encargado/Admin)."
    porque `ecConsultar` caía al default `submitRecord()`. Ver
    `docs/CHANGELOG-BUGFIXES.md` y `docs/sesion-bugfix-009.md`.
  · Ver `docs/spec-estado-cuenta.md` y `docs/proyecto-estado-cuenta.md`

## Stack

  · Frontend: HTML/CSS/JS vanilla en GitHub Pages
  · Backend: Apps Script Web App (`doPost` + `doGet`) — **V20 desplegado**
  · BD: Google Sheets (`Base datos Cerro azul fomato`)
  · Pestañas del Sheet principal (`Base datos Cerro azul fomato`):
    · `Registros` (143 cols, datos de residentes)
    · `Maestros` (26 cols, configuración)
    · `Mudanzas` (19 cols, reservas — sept 2026)
    · `Config` (admin password — sept 2026)
  · Sheet separado `Cartera` (estado de cuenta — sept 2026):
    · pestaña por mes (`Agosto 2026`, `Septiembre 2026`, …)
    · `_Control`, `Pagos`, `PazYSalvos`
  · Sin servidor propio, sin base de datos externa

## Backend Apps Script — última versión desplegada

> ⚠️ **Fuente de verdad de versiones:** este archivo puede quedar desactualizado.
> Para la versión vigente, consultar `apps-script/README.md` (cabecera + tabla) y
> `docs/CHANGELOG-BUGFIXES.md`. Resumen a 05-Oct-2026:

- **Apps Script ID:** `17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy`
- **URL preservada:** `https://script.google.com/macros/s/AKfycbxp...Zp/exec`
- **Última versión: V36 (08-Oct-2026)** — Apps Script "Versión 34"
  · 222.410 bytes, 4870 líneas
  · MD5: `e207271873ff91365dd1559fb66ad150`
  · Drive V36: `Codigo_V36_TORRE2-20261008.gs` (ID `1AjvHS090YqBDWK8axznlUnc9MfFYd9lY`)
  · Cambio vs V35: +2 líneas (BUGFIX-023: MATRICULAS_TORRE_2)
  · Cubre Torre 1, Torre 2, Torre 3 y Parqueaderos

### Historial de deploys recientes

| Versión | Hora | BUGFIX | Descripción |
|---------|------|--------|-------------|
| V36 | 08-Oct-2026 | BUGFIX-023 | Torre 2 en lookup de matrículas (185 aptos nuevos) |
| V35 | 05-Oct-2026 | BUGFIX-022 | Restaurar módulo de Estado de Cuenta (478 líneas) |
| V34 | 05-Oct-2026 | BUGFIX-021 | adminVerComprobanteSalon devuelve tieneComprobante: true |
| V33 | 05-Oct-2026 | BUGFIX-020 | Cédula del propietario en "Editar mi registro" |
| V32 | 05-Oct-2026 | BUGFIX-019 v2 | Token con PropertiesService |
| V31 | 05-Oct-2026 | BUGFIX-019 | Token de sesión admin/vigilante |
| V30 | 05-Oct-2026 | BUGFIX-018 | getEstadoResidente sin numForm/nombres/propietario |
| V29 | 05-Oct-2026 | BUGFIX-017 | Quitar CA-XXXX del error de duplicado |
| V20 | 26-Sept-2026 13:10 | BUGFIX-011 | Admin mudanzas: filtro "Próximos N días" (paridad vigilante) |
| V19 | 12:37 | BUGFIX-010 | SEG-001: backend vigilante NO envía credenciales de edición |
| V18 | 12:15 | BUGFIX-009 | Routing 6 endpoints `ec*` en `doPost` (portal estado cuenta) |

Ver `docs/CHANGELOG-BUGFIXES.md` para el detalle completo de cada fix.

## Documentación

  · `GUIA-PROYECTO.md` — guía técnica completa del proyecto
    (18 secciones + historial)
  · `apps-script/README.md` — instrucciones de despliegue del backend
  · `docs/spec-mudanzas.md` — especificación del módulo de mudanzas
  · `docs/CHANGELOG-BUGFIXES.md` — bugs críticos documentados
  · `docs/TESTING-PROTOCOL.md` — protocolo E2E antes de deploy
  · `docs/manual-llenado-cerro-azul.html` — manual visual para residentes
  · `docs/manual-vigilantes.html` — manual del portal de vigilancia
  · `docs/manual-estado-cuenta.html` — manual del portal contable (propietarios)
  · `docs/manual-residente.html` — manual del portal del residente (auto-registro)
  · `docs/manual-salon-social.html` — manual del portal de reservas del salón
  · `docs/manual-admin.html` — manual del portal administrativo
  · `docs/prompt-notebooklm-video.md` — prompt para generar video instructivo
  · `docs/spec-estado-cuenta.md` — especificación del módulo de estado de cuenta
  · `docs/proyecto-estado-cuenta.md` — resumen operativo del módulo contable

## Contacto

Administración: urb.cerroazul@gmail.com
