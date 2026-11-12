# Instrucciones para el agente — Rediseño "vidrio" del Portal Cerro Azul

Fecha: 12-nov-2026 · Rama de trabajo sugerida: `rediseno-vidrio`

## 1. Qué es esto

Un cambio **solo de apariencia** para todo el portal: aspecto de vidrio
translúcido (estilo macOS reciente), una portada nueva y dos elementos 3D.
Ya está construido y probado. Tu trabajo es **aplicarlo, verificarlo y
publicarlo**, no rediseñarlo.

Principio que no se negocia: **la capa es aditiva**. No se modificó ni una
línea de la lógica existente.

| Se tocó | No se tocó |
|---|---|
| 8 páginas HTML: 2 líneas agregadas en cada una (un `<link>` y un `<script>`) | `js/*.js` existentes (app, residente, salon-social, estado-cuenta, informes, admin, vigilantes, cartera, asistente, common, config) |
| 5 archivos nuevos (ver abajo) | `apps-script/Codigo.gs` — **no hay que redesplegar el backend** |
| `.gitignore` (una línea) | `assets/styles.css`, `residente.css`, `salon-social.css`, `informes.css` |
| | `fumigacion.html` (tiene diseño propio; queda igual) |

## 2. Archivos

Nuevos:

- `assets/vidrio.css` — la capa de tema. Se carga después de `styles.css`.
- `assets/inicio.css` — estilos de la portada.
- `inicio.html` — portada con accesos a todos los portales y las torres 3D.
- `js/vidrio.js` — mejoras aditivas (ver sección 4).
- `tests/vidrio-capa.test.js` — 18 pruebas que impiden que la capa deje de ser aditiva.
- `scripts/qa-rediseno/` — pruebas de paridad en navegador (opcionales, ver su README).

Modificados (solo se agregaron estas dos líneas, nada se borró ni se movió):

```html
<link rel="stylesheet" href="assets/vidrio.css?v=20261112">   <!-- después de la última hoja de estilos -->
<script src="js/vidrio.js?v=20261112"></script>               <!-- justo antes de </body> -->
```

en `index.html`, `residente.html`, `salon-social.html`, `estado-cuenta.html`,
`informes.html`, `admin.html`, `vigilantes.html` y `cartera-admin.html`.

## 3. Reglas de la capa (las hace cumplir `tests/vidrio-capa.test.js`)

1. `assets/vidrio.css` **no usa `!important`**.
2. Sobre clases e ids que ya existían solo cambia **pintura**: colores, fondos,
   bordes, sombras, desenfoque. Nunca `display`, `visibility`, `position`,
   `z-index`, `pointer-events`, `transform` ni tamaños. Nunca toca `.hidden`.
3. El desenfoque (`backdrop-filter`) solo va en superficies que **no contienen
   ventanas modales**. Un antepasado con desenfoque atrapa a los
   `position: fixed` que tenga dentro (mismo problema que ya documenta la
   sección 18 de `styles.css`). Por eso `#form-card` lo tiene apagado: dentro
   está `#modalClearResidente`.
4. Todo lo nuevo lleva el prefijo `vd-` (clases e ids) y el atributo `data-vd`.
5. `js/vidrio.js` no cancela eventos (`preventDefault`), no reemplaza
   `window.fetch` ni `CA.api`, no usa `innerHTML`, y cada mejora corre en su
   propio `try/catch`.

Si necesitas ajustar el diseño, hazlo dentro de estas reglas. Si una regla te
estorba, detente y consulta con Fabio antes de saltártela.

## 4. Qué hace `js/vidrio.js`

| Mejora | Dónde | Cómo se engancha |
|---|---|---|
| Botón "Inicio" | Encabezado de los 8 portales | Agrega un enlace a `inicio.html` como primer hijo de `.header-inner` |
| Torres 3D que siguen el cursor | `inicio.html` | Cambia dos variables CSS en `#vd-torres` |
| Tarjeta 3D del apartamento | `estado-cuenta.html` | Lee el texto que `estado-cuenta.js` ya escribió en `#ecResumen` ("Apto X · NOMBRE" + frase del saldo). Si no lo entiende, la tarjeta no aparece |
| Aviso "Consultando…" | `estado-cuenta.html` | Observa `#btnEcConsultar`, `#alert-ec-login` y las vistas. No consulta nada por su cuenta |
| Pasos del formulario | `index.html` | Barra "Paso n de 13" con Anterior/Siguiente. Usa la misma clase `collapsed` que `app.js`; queda **fuera** del `<form>` |
| Precalentado | Todas | Un `GET ?action=ping` (solo lectura, ya existe en `doGet`) como mucho cada 4 min por pestaña. Se apaga con `PRECALENTAR = false` al inicio del archivo |

## 5. Tareas

Hazlas en orden. No pases a la siguiente si la verificación falla.

### T1 — Aplicar el cambio

```bash
git checkout main && git pull
git checkout -b rediseno-vidrio
git apply --index rediseno-vidrio.patch     # o copiar los archivos del zip encima del repo
git status                                  # 9 modificados (.gitignore + 8 HTML) y los nuevos
```

**Verificación:** `git diff --cached --stat -- '*.html'` muestra exactamente
`8 files changed, 16 insertions(+)` y **0 eliminaciones**.
`git diff --cached --stat -- js/ ':!js/vidrio.js' apps-script/ assets/styles.css` no muestra nada.

### T2 — Pruebas del proyecto

```bash
npm ci
npm run lint     # 0 errores (las 19 advertencias ya existían)
npm test         # 139 pruebas pasan, 1 omitida (antes: 121 + 1)
```

**Verificación:** ambos comandos terminan sin errores.

### T3 — Paridad en navegador (recomendada)

Sigue `scripts/qa-rediseno/README.md`.

**Verificación:** `compara.js` termina en `PARIDAD COMPLETA` y `extra.js` en
`27 comprobaciones correctas, 0 fallidas`.

### T4 — Revisión a mano (10 minutos, con un celular real)

Sirve el sitio en local (`npx http-server .` o similar) o usa la vista previa de la rama.

- [ ] `inicio.html`: las torres giran; cada ficha abre su portal; el botón de tema cambia claro/oscuro.
- [ ] `index.html`: llenar y enviar un registro de prueba con el **apto 9999** (centinela CA-0083, ver `docs/TESTING-PROTOCOL.md`). "Siguiente" avanza; los datos escritos se conservan; al enviar con errores se abren las secciones con error.
- [ ] `index.html` → "Editar mi registro" y "Agendar mudanza" funcionan igual.
- [ ] `estado-cuenta.html`: al consultar aparece "Consultando…", luego la tarjeta y el estado. Descargar factura y paz y salvo funcionan.
- [ ] `residente.html` y `salon-social.html`: completar un flujo de punta a punta.
- [ ] `admin.html` y `vigilantes.html`: ingresar, buscar, abrir un detalle, abrir la ventana de cancelar reserva (debe cubrir toda la pantalla).
- [ ] El asistente abre, responde y se cierra en al menos una página.
- [ ] Imprimir el comprobante del registro: sale sin fondo de colores.

### T5 — Publicar

Fusionar `rediseno-vidrio` en `main` (GitHub Pages publica solo). **No** hay
despliegue de Apps Script. Después de publicar, abrir cada portal con recarga
forzada y repetir los tres primeros puntos de T4 en producción.

### T6 — Códigos QR y entrada del portal (decisión de Fabio, no la tomes solo)

Los QR impresos apuntan a `index.html` y a `residente.html`; **siguen
funcionando igual**. La portada nueva es `inicio.html` y se llega a ella con
el botón de inicio de cada encabezado. Si Fabio quiere que la portada sea la
entrada principal, la forma segura es generar un QR nuevo hacia
`inicio.html`; **no** renombrar `index.html`.

### T7 — Bitácora

Agregar una entrada en `docs/CHANGELOG-BUGFIXES.md` con fecha, rama, resultado
de T2–T4 y lo que haya quedado fuera. No escribir datos reales de residentes
(nombres, cédulas, N° de formulario) en la bitácora: el repositorio es público.

## 6. Cómo deshacerlo

Opción rápida (apaga el rediseño sin borrar archivos): quitar de cada HTML las
dos líneas de la sección 2. El portal vuelve exactamente al aspecto anterior.

Opción completa: `git revert` del commit de la fusión.

## 7. Límites conocidos

- **Tema oscuro:** igual que antes, solo existe en `index.html`, `informes.html`
  y ahora `inicio.html`. Los demás portales no lo aplican; no se cambió.
- **Tarjeta del estado de cuenta:** depende del texto de `#ecResumen`. Si
  alguien cambia ese texto en `estado-cuenta.js`, la tarjeta deja de aparecer
  (no rompe nada). La prueba `tarjeta del estado de cuenta` fija el formato.
- **Pasos del formulario:** "Siguiente" cierra las demás secciones. No valida
  el paso actual; la validación sigue ocurriendo al enviar, como siempre.
- **Mudanzas:** la ficha de la portada lleva a `index.html`; la persona debe
  elegir la pestaña "Agendar mudanza" (no existe enlace directo a una pestaña).
- **Navegadores viejos:** sin `backdrop-filter` las superficies quedan casi
  opacas; sin `color-mix` los botones quedan con el color plano de antes.
- **Rendimiento:** el desenfoque se aplica a pocas superficies por pantalla y
  es más corto en celular. Las 13 secciones del formulario son translúcidas
  pero **sin** desenfoque, a propósito.
- **Velocidad real de las consultas:** depende de Apps Script. El ping de
  precalentado puede ayudar con el arranque en frío, pero no lo garantiza.

## 8. Fuera de alcance (pendiente aparte)

De la revisión de seguridad del 12-nov-2026, siguen abiertos y **no** se
resuelven con este cambio:

1. Datos reales de residentes en documentos públicos de `docs/`
   (anonimizar y limpiar el historial de git).
2. `listarReservasPorApto` y `actualizarResidente` sin límite de intentos.
3. Bloqueo global del ingreso de administración y vigilancia.

---

# Segunda entrega (12-nov-2026, tarde) — La portada pasa a la dirección principal

Rama sugerida: `portada-raiz`

## Por qué

Todos los códigos QR y mensajes ya enviados apuntan a
`https://fabig76.github.io/cerro-azul-residentes/`. Esa dirección abría el
formulario, así que nadie llegaba a la portada (`inicio.html`). Esto reemplaza
la tarea T6 de arriba: **no hay que reimprimir ni reenviar nada**.

## Qué cambia

| Dirección | Antes | Ahora |
|---|---|---|
| `/` y `/index.html` | Formulario | **Portada** |
| `/formulario.html` | no existía | **Formulario** (el mismo archivo, renombrado con `git mv`) |
| `/formulario.html#editar` | — | Formulario, pestaña "Editar mi registro" |
| `/formulario.html#mudanzas` | — | Formulario, pestaña "Agendar mudanza" |
| `/inicio.html` | Portada | Redirige a `/` |

- El formulario es **el mismo archivo**: `git mv index.html formulario.html`.
  Solo cambió la versión del `<script>` de `vidrio.js` (`?v=20261113`).
- Los correos, manuales y el asistente dicen "entre a …/cerro-azul-residentes
  y toque la pestaña *Agendar mudanza*" (o *Editar mi registro*, o *Enviar /
  Crear registro*). Por eso la portada tiene tres fichas con **esos mismos
  nombres**, que abren el formulario directamente en esa pestaña.
- `js/vidrio.js` gana una mejora aditiva: si la dirección trae `#editar` o
  `#mudanzas`, pulsa la pestaña con el manejador propio de la página (el
  mismo clic que haría la persona). Sin `#` no hace nada.
- `residente.html` (2 enlaces) y `salon-social.html` (1) apuntaban a
  `index.html` queriendo decir "el formulario": ahora apuntan a `formulario.html`.
- **No se tocó** `js/app.js` ni ningún otro script existente, ni `apps-script/`.
  No hay que redesplegar el backend.

## Tareas

### P1 — Aplicar

```bash
git checkout main && git pull
git checkout -b portada-raiz
git apply --index portada-raiz.patch
```

**Verificación:** aparece `formulario.html` (idéntico al `index.html` anterior
salvo la versión de `vidrio.js`: `git diff main:index.html formulario.html`
muestra una sola línea), `index.html` pasa a ser la portada, `inicio.html`
queda en unas 15 líneas, y
`git diff --cached --stat -- js/ ':!js/vidrio.js' apps-script/` sale vacío.

### P2 — Pruebas

`npm run lint` (0 errores) y `npm test` (**147 pasan**, 1 omitida).
Opcional pero recomendado: `scripts/qa-rediseno` → `PARIDAD COMPLETA` y
`35 comprobaciones correctas, 0 fallidas` (compara contra `main` actual).

### P3 — Publicar y comprobar en producción (con recarga forzada)

- [ ] `https://fabig76.github.io/cerro-azul-residentes/` abre la portada.
- [ ] "Enviar / Crear registro" abre el formulario; llenar y enviar con el apto de prueba 9999.
- [ ] "Editar mi registro" y "Agendar mudanza" abren su pestaña.
- [ ] El botón de inicio de cada portal vuelve a la portada.
- [ ] `…/inicio.html` lleva a la portada.
- [ ] Escanear un QR impreso real y confirmar que llega a la portada.

### P4 — Textos (sin prisa, no bloquea)

Los manuales de `docs/` y la base de conocimiento del asistente en
`Codigo.gs` hablan de "pestañas" de la página principal. Siguen siendo
entendibles porque las fichas se llaman igual. Si se quiere afinar el texto
del asistente, eso **sí** requiere redesplegar Apps Script: hacerlo aparte.

## Cómo deshacerlo

`git revert` del commit. Las direcciones vuelven a ser las de antes.
