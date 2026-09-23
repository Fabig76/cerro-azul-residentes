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

## Tres módulos del formulario

  · **📝 Enviar / Crear registro** — alta de un nuevo apartamento
    (genera CA-XXXX, ~150 campos, deduplicado por apartamento)
  · **✏️ Editar mi registro** — modificación de un registro existente
    usando CA-XXXX + N° de apto
  · **🚚 Agendar mudanza** — reserva de ascensor para mudanzas con
    validación de cédula del propietario (septiembre 2026)

## Stack

  · Frontend: HTML/CSS/JS vanilla en GitHub Pages
  · Backend: Apps Script Web App (`doPost` + `doGet`)
  · BD: Google Sheets (`Base datos Cerro azul fomato`)
  · Sin servidor propio, sin base de datos externa

## Documentación

  · `GUIA-PROYECTO.md` — guía técnica completa del proyecto
  · `apps-script/README.md` — instrucciones de despliegue del backend
  · `docs/spec-mudanzas.md` — especificación del módulo de mudanzas
  · `docs/manual-llenado-cerro-azul.html` — manual visual para residentes
  · `docs/prompt-notebooklm-video.md` — prompt para generar video instructivo

## Contacto

Administración: urb.cerroazul@gmail.com
