# Cerro Azul — Apps Script (Backend del Formulario)

Este es el código del backend que conecta el formulario público
(`https://fabig76.github.io/cerro-azul-residentes/`) con el Google Sheet
(`https://docs.google.com/spreadsheets/d/16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`).

## ¿Qué hace?

  · Recibe los datos enviados desde la página web (`POST`)
  · Genera un N° de formulario correlativo tipo `CA-0001`, `CA-0002`, ...
  · Dedupe por N° de apartamento (un apartamento = un solo registro)
  · Permite editar un registro existente pidiendo N° de Formulario + N° de Apto
  · Escribe en la hoja "Registros" del Sheet
  · Nunca borra filas (los residentes no pueden eliminar su información)

## Estructura

  · `Código.gs` — El backend completo (un solo archivo, copia y pega)
  · Sheet ID: `16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`
  · Hoja de destino: `Registros` (138 columnas)

## Despliegue paso a paso (~5 minutos)

### 1. Abre el proyecto Apps Script que ya creé para ti

URL del proyecto (ya está en tu Drive):
  https://script.google.com/d/17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy/edit

### 2. Renombra el proyecto

En la esquina superior izquierda dice "Proyecto sin título". Cámbialo a:
  `Cerro Azul - Formulario Residentes Backend`

### 3. Pega el código

  · En el panel izquierdo verás un archivo llamado `Código.gs` (con un ícono azul)
  · Bórralo si está vacío o tiene código de muestra
  · Abre el archivo `Código.gs` que está en este mismo directorio del repo
  · Selecciona TODO el contenido (Cmd+A o Ctrl+A) y cópialo (Cmd+C o Ctrl+C)
  · Vuelve al editor de Apps Script y pega (Cmd+V o Ctrl+V)
  · Guarda con Ctrl+S (o el ícono del diskette)

### 4. Vincula el proyecto al Sheet

Este paso es necesario para que el script tenga permisos automáticos sobre la hoja:

  · En el menú superior: **Archivo → Mover → Carpeta de Drive del spreadsheet**
  · O alternativamente: clic en el ícono de "Servicios" (+ al lado de "Bibliotecas")
     y añade "Google Sheets API"

  Lo más simple: ejecuta la función `getNextFormId` una vez para que autorices los permisos:
    · Selecciona la función `getNextFormId` en el dropdown de la barra superior
    · Clic en **Ejecutar** (▶️)
    · Te pedirá autorizar permisos → "Revisar permisos" → elegir tu cuenta
       → "Advanced" → "Go to Cerro Azul... (unsafe)" → "Allow"
    · Si te sale error (porque el sheet está vacío), no importa, solo era para autorizar.

### 5. Desplegar como Web App

  · Menú superior derecho: **Implementar → Nueva implementación**
  · Ícono del engranaje ⚙️ → selecciona **Aplicación web**
  · Configurar:
      · Descripción: `Backend formulario residentes v1`
      · Ejecutar como: **Yo (tu correo)**
      · Quién tiene acceso: **Cualquier persona** (porque la página pública debe poder escribir)
  · Clic en **Implementar**
  · Google te pedirá autorizar de nuevo (es normal, esta vez para la implementación)
  · **COPIA LA URL** que aparece (formato: `https://script.google.com/macros/s/AKfyc.../exec`)
  · Esa URL es la `APPS_SCRIPT_URL` que hay que pegar en `js/app.js` de la página web.

### 6. Conectar la página web al backend

  · Abre el archivo `js/app.js` del repositorio
  · Línea 6: `const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || '';`
  · Cámbiala a:
    ```js
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/TU_URL_AQUI/exec';
    ```
  · Commit y push al repo. La página se actualizará automáticamente en 1 minuto.

### 7. Prueba end-to-end

  · Abre https://fabig76.github.io/cerro-azul-residentes/
  · Llena el formulario (mínimo los obligatorios)
  · Envía
  · Verifica que en el Sheet aparezca una fila nueva con N° Formulario tipo `CA-0001`
  · Recarga la página, ve a "Editar mi registro", ingresa `CA-0001` y el N° de apto
  · Verifica que carguen los datos y puedas editarlos

## Solución de problemas

### El botón "Enviar" no hace nada

  · Abre la consola del navegador (F12 → Consola)
  · Verás el error real. Lo más común: la URL del Apps Script está mal pegada.

### "Acción no reconocida" o error 401/403

  · El Apps Script no está bien desplegado
  · Vuelve a Implementar → Administrar implementaciones → verifica que dice "Anyone"

### El Sheet no recibe los datos

  · Verifica que el SHEET_ID en `Código.gs` (línea 9) coincide con la URL de tu Sheet
  · Hoja debe llamarse `Registros` (renombrada de "Hoja 1")

### Los residentes pueden ver/enviar a la URL del script

  · Esto es esperado: cualquier persona con el QR puede intentar enviar
  · Las validaciones del lado servidor evitan datos vacíos o inválidos
  · Pero NO impide que alguien con conocimientos técnicos envíe datos falsos
  · La administración debe validar la información en el Sheet manualmente

## Seguridad

  · El Apps Script se ejecuta como TU usuario (el admin)
  · Tiene permisos totales sobre el Sheet
  · Cualquiera que descubra la URL del Web App puede enviar datos al Sheet
  · MITIGACIÓN: revisa el Sheet periódicamente y borra filas sospechosas manualmente
  · Para más seguridad, podrías poner un "token compartido" en el payload, pero eso
    requeriría que los residentes lo conocieran, lo cual es impráctico para QR público.

## Actualizar el backend

Si necesitas cambiar el código del backend:
  · Edita `Código.gs` en el editor de Apps Script
  · Implementar → Administrar implementaciones → ícono de lápiz → "Versión: Nueva versión"
  · Clic en Implementar
  · La URL NO cambia (los deployments activos se conservan)
