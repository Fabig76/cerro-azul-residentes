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

## Portal administrativo (sept 2026)

  · **URL:** https://fabig76.github.io/cerro-azul-residentes/admin.html
  · Permite al admin buscar, ver y editar TODOS los registros sin
    necesidad del código CA-XXXX generado
  · Solo requiere contraseña (configurada en Sheet → Config!B1,
    por defecto `cerroazul2026`)
  · Busca por apto, nombre, cédula, correo, celular o CA-XXXX
  · Edita los 143 campos del registro (básicos, residentes, vehículos,
    mascotas, emergencias, etc.)
  · **IMPORTANTE:** NO elimina filas del Sheet. Solo edita.

## Portal de vigilancia (sept 2026)

  · **URL:** https://fabig76.github.io/cerro-azul-residentes/vigilantes.html
  · Para el personal de vigilancia del conjunto
  · Solo consulta datos + marca checks de mudanzas (no edita registros)
  · Contraseña separada del admin (Sheet → Config!B2, por defecto
    `VigCerroAzul2026`)
  · Ve datos SÍ: nombre, CC, vehículos, mascotas, parqueaderos,
    residentes, encargado, inmobiliaria
  · Ve datos NO: correo, celular, teléfono (privacidad)
  · Marca check de mudanzas con su nombre para auditoría
  · Pestaña especial "🚗 Buscar por placa" para incidentes vehiculares
    (búsqueda parcial, case-insensitive, devuelve apto+propietario)

## Portal de estado de cuenta (sept 2026)

  · **URL propietario:** https://fabig76.github.io/cerro-azul-residentes/estado-cuenta.html
  · **URL cargador admin:** https://fabig76.github.io/cerro-azul-residentes/cartera-admin.html
  · Los propietarios consultan su estado de cuenta, sus últimos pagos y
    descargan su factura y paz y salvo (Ley 1581/2012)
  · Login con CA-XXXX + N° apto + cédula (reutiliza `verificarPropietario`)
  · Paz y salvo solo si `total cartera < tolerancia` (saldo ≤ $1.000),
    y SOLO para diligencia "Propietario"
  · El cargador admin sube el Excel de cartera + PDF unificado (625
    facturas) que entrega el contador; el sistema los divide por REF.PAGO
  · Ver `docs/spec-estado-cuenta.md` y `docs/proyecto-estado-cuenta.md`

## Stack

  · Frontend: HTML/CSS/JS vanilla en GitHub Pages
  · Backend: Apps Script Web App (`doPost` + `doGet`) — V8 desplegado
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

## Documentación

  · `GUIA-PROYECTO.md` — guía técnica completa del proyecto
    (18 secciones + historial)
  · `apps-script/README.md` — instrucciones de despliegue del backend
  · `docs/spec-mudanzas.md` — especificación del módulo de mudanzas
  · `docs/CHANGELOG-BUGFIXES.md` — bugs críticos documentados
  · `docs/TESTING-PROTOCOL.md` — protocolo E2E antes de deploy
  · `docs/manual-llenado-cerro-azul.html` — manual visual para residentes
  · `docs/prompt-notebooklm-video.md` — prompt para generar video instructivo
  · `docs/spec-estado-cuenta.md` — especificación del módulo de estado de cuenta
  · `docs/proyecto-estado-cuenta.md` — resumen operativo del módulo contable

## Contacto

Administración: urb.cerroazul@gmail.com
