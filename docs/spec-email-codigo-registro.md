# SPEC — Envío del código CA-XXXX por correo al crear el registro

> **Versión:** 1.0 (borrador auditado)
> **Fecha:** 25-Oct-2026
> **Solicitado por:** Fabio Lesmes (operador)
> **Estado:** ✅ **IMPLEMENTADO Y DESPLEGADO en V47** (25-Oct-2026)
> **Base:** V47 desplegada (md5 `9855d2dc09967c26a3ee8ef79bfbea55`, 5.422 líneas)
>
> Nota: el spec documenta el diseño original. La implementación final (V47)
> usa `GmailApp` con remitente `urb.cerroazul@gmail.com` en lugar de
> `MailApp`, por el problema de entrega del dominio `admin@urbcerroazul.com`
> (ver `docs/CHANGELOG-BUGFIXES.md` BUGFIX-028). Verificado en producción.

---

## 0. RESUMEN EJECUTIVO

### Qué pide el operador

> "cuando se crea el apto se muestra el codigo en pantalla nuevo pero en
> ocasiones no se alcanza ver por lo tanto es necesario agregar la funcion
> del envio del correo electronico donde se envie el codigo del apto al
> correo del propietario registrado. Esto solo debe pasar cuando se haga
> el registro como propietario; en las demas opciones no debe enviarse el
> correo y se debe mostrar en la pantalla el aviso de que se envio un
> correo con el codigo para editar el formulario al correo del propietario
> registrado."

### Qué se implementará

1. Al **crear** un registro con `diligencia = "Propietario"`, el backend envía
   un correo a `correoProp` con el código `CA-XXXX` generado.
2. La tarjeta de éxito en pantalla muestra un **aviso explícito** de que se
   envió el correo con el código.
3. En los demás casos (**"Encargado"**, y cualquier otra diligencia), **no**
   se envía correo y **no** se muestra el aviso.

### Regla funcional (la más importante)

| Condición | ¿Envía correo? | ¿Muestra aviso en pantalla? |
|---|:---:|:---:|
| Creación + `diligencia = "Propietario"` | **SÍ** | **SÍ** |
| Creación + `diligencia = "Encargado"` | NO | NO |
| Edición (`editMode: true`) | NO | NO |
| Portal del residente (`registrarResidente`) | NO | NO |
| Portal del residente (`actualizarResidente`) | NO | NO |

### Por qué NO se envía en edición

El código `CA-XXXX` **no cambia** al editar: es la misma credencial desde el
momento del alta. Quien edita ya la conoce (la usó para buscar el registro).
Reenviarla en cada edición sería ruido y consumiría cuota de correo sin
beneficio. El correo es una **red de seguridad para el momento del alta**,
cuando el código es nuevo y todavía no está anotado en ningún lado.

### Riesgos principales identificados en la auditoría

**Riesgo 1 — `submitRecord()` es llamada por 3 flujos, no por 1.**

`submitRecord()` escribe la fila y es llamada por el formulario público
(crear y editar), por `registrarResidente` y por `actualizarResidente`.
Insertar el envío de correo dentro de ella sin condiciones explícitas
haría que el portal del residente **también** disparara correos.

**Defensa en 3 capas:** el envío exige `!editMode` **Y**
`__origen === 'formulario-publico'` (que solo manda `js/app.js`) **Y**
`diligencia === 'Propietario'`. El backend decide, no el cliente.

**Riesgo 2 — Dos bugs preexistentes encontrados durante la auditoría
(H-13 y H-14), en el flujo `actualizarResidente`:**

1. **H-13:** el flujo "Editar mis datos" del **portal del residente** está
   **completamente roto** — siempre falla con "Ya existe un registro"
   (verificado empíricamente el 25-Oct-2026). Ningún residente puede
   actualizar sus datos.
2. **H-14:** en el mismo payload, `dispositivos: []` **borraría** los
   llaveros/tags del propietario. **51 registros** tienen datos ahí.

Los dos bugs se cancelan mutuamente hoy (el primero impide que se
escriba). Por eso **se arreglan juntos en el mismo V42**: arreglar solo
H-13 provocaría pérdida de datos real en 51 registros la primera vez que
un residente actualice sus datos.

### Decisión de diseño sobre el disparador

El borrador v0.1 usaba una bandera del cliente (`enviarCorreoCodigo`).
Se **eliminó**: un POST crudo con esa bandera dispararía un correo
contra la regla de negocio. La versión final decide en el backend con las
3 condiciones de arriba. Ver §7.2 (H-02, H-03).

---

## 1. CONTEXTO Y NECESIDAD

### 1.1 El problema

Hoy, al crear un registro, el backend devuelve el `CA-XXXX` y el frontend lo
muestra en la tarjeta de éxito:

```html
<!-- index.html línea 564 -->
<div class="num-form" id="success-num-form">CA-0000</div>
```

```javascript
// js/app.js — mostrarExito() líneas 541-560
$('#success-num-form').textContent = data.numForm;
$('#success-advice').innerHTML = `
  <strong>⚠️ IMPORTANTE: Guarda tu N° de formulario.</strong><br>
  Tu N° de formulario es: <strong ...>${data.numForm}</strong><br>
  Lo necesitarás cada vez que quieras editar o actualizar tus datos.<br>
  Guárdalo en un lugar seguro (anota, captura de pantalla, etc.).<br>
  <em>La administración NO puede recuperar este número por ti.</em>
`;
```

El problema: el código **solo** existe en esa pantalla. Si el residente:

- cierra el navegador antes de copiarlo,
- no lee el mensaje completo (es largo y con urgencia),
- pierde el celular, o cambia de dispositivo antes de la segunda visita,
- tiene a un familiar o vecino ayudándolo a llenar el formulario,

**pierde el código para siempre**. Y el código es la credencial de edición:
sin `CA-XXXX` + `N° apto` + `cédula`, no puede editar su registro, ni agendar
mudanzas, ni consultar su estado de cuenta.

La consecuencia real es operativa: el propietario pierde la capacidad de
autogestión y termina **llamando a la administración** para que lo busquen
manualmente en el Sheet. Eso ya está contemplado en el manual oficial
(`MANUAL_CERRO`, sección 3.6):

```
"Si perdió el código: escriba a urb.cerroazul@gmail.com o al WhatsApp
 316 924 0748 con su nombre completo, cédula y número de apartamento."
```

Ese párrafo documenta el problema como **procedimiento de contingencia**. Con
este feature, deja de ser necesario en el caso del propietario.

### 1.2 La regla de negocio ya existente que hay que respetar

`MANUAL_CERRO` establece la **REGLA FUNDAMENTAL**:

```
"Solo el propietario, la inmobiliaria o el encargado que creó el registro
 puede editarlo (con el código CA). El arrendatario no puede."
```

Y el formulario público tiene solo **2 opciones** de diligencia (desde
`REDISENO-OPTIONS` / BUGFIX-023-ENCARGADO, 09-Oct-2026):

```html
<!-- index.html líneas 147-148 -->
<input type="radio" name="diligencia" value="Propietario" required> Propietario
<input type="radio" name="diligencia" value="Encargado"> Encargado / Admin
```

La opción "Arrendatario" fue eliminada de la UI; el backend aún acepta
`Arrendatario` y `Tenedor / Otro` por compatibilidad con registros antiguos
(10 registros con "Tenedor / Otro", 18 con "Arrendatario" según
`CHANGELOG-BUGFIXES.md`).

### 1.3 Por qué el owner's email y no otro

El campo `correoProp` (columna H del Sheet, índice 7) es **obligatorio** y
**validado por regex** en el backend (`submitRecord` línea 312):

```javascript
const correoTitular = String(data.correoProp || '').trim();
if (!correoTitular || !/^[^@\s]+@[[^@\s]+\.[^@\s]+$/.test(correoTitular)) {
  return { ok: false, error: 'Correo del titular inválido.' };
}
```

Es decir: **el correo al que se enviará ya está garantizado como válido por
el propio registro**. No hay que agregar una validación nueva.

---

## 2. REGLAS DE NEGOCIO

### R1 — Condición de envío

Un correo se envía **si y solo si** se cumplen **todas** estas condiciones:

1. `editMode` es falso (es una **creación**, no una edición).
2. `diligencia === 'Propietario'` (comparación **exacta**, sin normalizar).
3. `correoProp` no está vacío y contiene un `@`.

Si falta cualquiera de las tres, **no** se envía correo y **no** se muestra
el aviso.

### R2 — Contenido del correo

El correo contiene **mínimamente**:

- El código `CA-XXXX`.
- El número de apartamento.
- La URL del portal.
- Las instrucciones de cómo usarlo para editar.
- Un canal de contacto si hay problemas.

**NO** debe contener: cédula, celular, datos de residentes, vehículos, mascotas,
placas, ni ningún otro dato personal. El propósito es **transportar una
credencial**, no exportar el registro.

### R3 — Destinatario

`correoProp` (el correo del propietario/titular), tal como quedó guardado en
la fila (columna H). **Nunca** el correo del encargado (`correArr`, col T),
ni el de la inmobiliaria (`inmobCorreo`, col AC), ni el de un residente.

### R4 — Aviso en pantalla

Cuando se envió el correo, la tarjeta de éxito debe mostrar un aviso visible
que diga que se envió el código por correo **al correo del propietario
registrado**. Cuando no se envió, el aviso **no aparece** (el mensaje actual
de "guarda tu código" se mantiene).

### R5 — El registro NUNCA falla por un problema de correo

Si el envío del correo falla (cuota excedida, dirección inválida en el
servidor de Google, error transitorio), el **registro ya fue escrito** y debe
**quedarse escrito**. El error de correo se registra en `Logger.log()` y el
frontend recibe un aviso **diferente** ("no se pudo enviar el correo, tu
código es este: CA-XXXX") para que el usuario no se quede sin el código.

Esta es la regla más importante del spec. Un fallo de correo **jamás** puede
hacer perder un registro.

### R6 — Un solo correo por creación

Solo se envía un correo por creación de registro. No hay reintento automático
ni envío duplicado. Si el usuario reintenta el envío del formulario, el
backend rechaza con "Ya existe un registro..." y no se envía un segundo
correo (el registro no se crea de nuevo).

---

## 3. DISEÑO TÉCNICO

### 3.1 Backend — `apps-script/Codigo_V42_*.gs`

**IMPORTANTE:** el archivo base es la **V41 descargada de Drive**, NUNCA el
`apps-script/Código.gs` del repo (que está desactualizado en V38 — ver §7.1
y `references/deploy-drift-check-procedure.md`).

#### 3.1.1 Constante nueva

```javascript
// Dirección de la administración (destinatario de copias de seguridad).
const REGISTRO_EMAIL_ADMIN = 'urb.cerroazul@gmail.com';
```

Se ubica junto a las constantes existentes (línea ~811, donde ya está
`MUDANZAS_EMAIL_ADMIN = 'urb.cerroazul@gmail.com'`).

#### 3.1.2 Función nueva — `enviarEmailCodigoRegistro(row, numForm)`

Se ubica en la sección de emails del backend (junto a
`enviarEmailConfirmacionAdmin` / `enviarEmailConfirmacionResidente`, que ya
existen para el módulo de mudanzas, ~línea 1424).

```javascript
// ---------------------------------------------------------------------
// BUGFIX-027 — Envío del código CA-XXXX al correo del propietario
// Solo se invoca desde submitRecord() en modo CREACIÓN con
// diligencia === 'Propietario'. Nunca en edición ni en el portal
// del residente.
// ---------------------------------------------------------------------
function enviarEmailCodigoRegistro(row, numForm) {
  const correo = String(row[7] || '').trim();   // col H = Correo Propietario
  if (!correo || correo.indexOf('@') === -1) {
    Logger.log('[enviarEmailCodigoRegistro] sin correo valido, no se envia');
    return false;
  }
  const nombre = String(row[5] || '').trim();   // col F = Nombre Propietario
  const apto   = String(row[3] || '').trim();   // col D = N° Apto

  const subject = 'Cerro Azul — su código de formulario es ' + numForm;

  const body =
    'Hola ' + nombre + ',\n\n' +
    'Su registro en la Urbanización Cerro Azul quedó registrado.\n\n' +
    '  N° de formulario: ' + numForm + '\n' +
    '  Apartamento:       ' + apto + '\n\n' +
    'Este código es lo que necesita para volver a editar su información,\n' +
    'agendar mudanzas y consultar su estado de cuenta.\n\n' +
    'Para editar su registro:\n' +
    '  1. Entre a https://fabig76.github.io/cerro-azul-residentes/\n' +
    '  2. Abra la pestaña "Editar mi registro"\n' +
    '  3. Escriba su código ' + numForm + ', su número de apartamento\n' +
    '     y la cédula del propietario\n' +
    '  4. Toque "Buscar mi registro"\n\n' +
    'Si no puede entrar o Cree que hubo un error, comuníquese con la\n' +
    'administración: WhatsApp 316 924 0748 o correo urb.cerroazul@gmail.com\n' +
    'Indique su nombre completo, cédula y número de apartamento.\n\n' +
    '--\nUrbanización Cerro Azul — NIT 900770444\n';

  MailApp.sendEmail(correo, subject, body);

  // Copia de seguridad a la administración (auditoría). Si falla, no
  // afecta al envío al propietario (ya realizado).
  try {
    MailApp.sendEmail(
      REGISTRO_EMAIL_ADMIN,
      '[Cerro Azul] Nuevo registro ' + numForm + ' (apto ' + apto + ')',
      'Registro creado:\n\n' +
      '  N° Formulario: ' + numForm + '\n' +
      '  Apartamento:   ' + apto + '\n' +
      '  Propietario:   ' + nombre + '\n' +
      '  Correo:       ' + correo + '\n' +
      '  Se envió el código al propietario.\n'
    );
  } catch (e) {
    Logger.log('[enviarEmailCodigoRegistro] copia admin fallo: ' + e);
  }

  Logger.log('[enviarEmailCodigoRegistro] enviado ' + numForm + ' a ' + correo);
  return true;
}
```

**Decisión de diseño — la copia a la administración:** el backend ya envía
copias al admin en los módulos de mudanzas y salón social (`reservarSalon`,
`adminCancelarReservaSalon`). Mantener ese patrón da trazabilidad y permite
al admin saber a quién se le envió el código. Es **defensivo**: si esa copia
falla, el correo al propietario ya se envió y no se pierde nada.

#### 3.1.3 Modificación de `submitRecord()`

**Único** punto de cambio en el flujo de escritura. Se inserta **después**
de `sheet.getRange(...).setValues([row])` (línea 365) y **antes** del
`return`:

```javascript
  // Construir el array de valores
  const row = buildRowFromPayload(data, assignedNumForm, fechaRegistroOriginal);
  sheet.getRange(targetRow, 1, 1, NUM_COLS).setValues([row]);

  // BUGFIX-027: enviar el código CA-XXXX al correo del propietario.
  //
  // TRES condiciones independientes deben cumplirse (H-02):
  //   1. !editMode                      → es una CREACIÓN, no una edición
  //   2. __origen === 'formulario-publico' → solo el formulario público
  //                                        emite; el portal del residente
  //                                        NO manda esta bandera
  //   3. diligencia === 'Propietario'    → regla de negocio del operador
  //
  // La escritura YA ocurrió: un fallo de correo NO puede perder el
  // registro (R5 / H-04). Se captura el error y se reporta en la respuesta.
  let correoEnviado = false;
  let correoError = '';
  const debeEnviar = !editMode
    && String(data.__origen || '') === 'formulario-publico'
    && diligencia === 'Propietario';
  if (debeEnviar) {
    try {
      correoEnviado = enviarEmailCodigoRegistro(row, assignedNumForm);
    } catch (e) {
      correoError = String(e && e.message || e);
      Logger.log('[submitRecord] BUGFIX-027 fallo envio correo: ' + correoError);
    }
  }

  return {
    ok: true,
    numForm: assignedNumForm,
    apto: apto,
    editMode: editMode,
    rowNumber: targetRow,
    correoEnviado: correoEnviado,
    correoError: correoError,
    message: editMode
      ? 'Registro actualizado correctamente. Tu N° de formulario sigue siendo ' + assignedNumForm + '.'
      : 'Registro creado correctamente. Tu N° de formulario es ' + assignedNumForm + '. GUÁRDALO en un lugar seguro: lo necesitarás para volver a editar tu información.'
  };
}
```

**Por qué no se usa la bandera del cliente:** mirando el código real,
`submitRecord` NO necesita una bandera `enviarCorreoCodigo` del payload.
La condición `!editMode && diligencia === 'Propietario'` ya es **exactamente**
la regla de negocio R1, y es **más segura** que confiar en el cliente:

- El portal del residente llama a `submitRecord` con `editMode: true` →
  no envía.
- La edición del portal principal llama con `editMode: true` → no envía.
- Un cliente malicioso no puede forzar el envío (no es su objetivo).

Si se usara una bandera del cliente, un POST crudo con
`enviarCorreoCodigo: true` y `diligencia: "Encargado"` dispararía un correo.
Con el enfoque basado en `diligencia`, **no hay forma de dispararlo fuera de
regla**.

> **NOTA DE AUDITORÍA:** el borrador v0.1 de este spec usaba la bandera
> `enviarCorreoCodigo` en el payload. Se eliminó por el argumento anterior.
> Ver §7.2, hallazgo **H-03**.

#### 3.1.3b Correcciones obligatorias a `actualizarResidente` (H-13 + H-14)

Estos dos cambios van **en el mismo V42** que el feature de correo, porque
son interdependientes: arreglar solo H-13 **destruiría** datos en 51
registros (H-14). Ver §7.2.

**Cambio 1 — H-13: normalizar `editMode: true`.**

En el payload de `actualizarResidente` (línea ~2427), añadir **una** línea:

```javascript
  const payload = {
    apto: apto,
    numForm: String(row.values[COL_NUM_FORM] || ''),
    // BUGFIX-027: sin esta bandera, submitRecord entra al branch de
    // CREACIÓN, findRowByApto() encuentra la fila existente y SIEMPRE
    // rechaza con "Ya existe un registro". El flujo "Editar mis datos"
    // del portal del residente estaba roto por esto (verificado
    // 25-Oct-2026 en el apto 218). Mismo fix que BUGFIX-012 aplicó a
    // registrarResidente.
    editMode: true,
    diligencia: String(row.values[4] || ''),
    ...
```

**Cambio 2 — H-14: preservar los dispositivos del propietario.**

Reemplazar `dispositivos: []` por el mismo patrón que ya usa
`registrarResidente` (líneas 2320-2321 + 2357, el "FIX REAL" de
BUGFIX-012):

```javascript
  // BUGFIX-027: preservar los dispositivos (llaveros/tags) del
  // propietario. Con `dispositivos: []` el setValues BORRABA las 15
  // celdas de los slots 95-109 — 51 registros tienen datos ahí.
  // Un residente NO puede autorizar dispositivos: se preservan los
  // del propietario tal como están (mismo criterio que registrarResidente).
  const _dispOriginales = [0, 1, 2].map(function (i) {
    const b = 95 + i * 5;
    const vals = row.values;
    return {
      tipo:    String(vals[b] || ''),
      codigo:  String(vals[b + 1] || ''),
      placa:   String(vals[b + 2] || ''),
      fecha:   String(vals[b + 3] || ''),
      recibe:  String(vals[b + 4] || '')
    };
  }).filter(function (d) { return !!(d.tipo || d.codigo || d.placa); });

  const payload = {
    ...
    dispositivos: _dispOriginales,
    ...
  };
```

**Verificación obligatoria de estos 2 cambios (T-027-12):** actualizar los
datos de un residente del apto **CA-0001** (apto 2000, que tiene 6 celdas
de dispositivos pobladas) y confirmar que **las 6 celdas siguen iguales**
antes y después.

> ⚠️ **Orden de aplicación:** aplicar H-14 **antes** que H-13 en el
> archivo, o aplicarlos en el mismo commit. Si H-13 se despliega sin H-14,
> el primer residente que actualice sus datos borra los llaveros/tags de
> 51 registros.

#### 3.1.4 Restricción de cuota

`MailApp.sendEmail` tiene un límite de destinatarios por día. La cuenta
`urb.cerroazul@gmail.com` es una **cuenta Gmail de consumo** (no
Workspace), y las cuentas de consumo tienen un límite **muy** inferior al
de las cuentas de empresa (Google Workspace permite 2.000 mensajes/día;
una cuenta de consumo queda en un orden de magnitud inferior).

**Riesgo:** si se realizara una campaña masiva (el conjunto tiene ~954 de
979 unidades registradas), el envío por registro consumiría la cuota diaria
de forma rápida. **Cada registro genera 2 correos** (propietario + copia
al admin, ver H-15), así que una campaña completa serían ~1.908 envíos.

**Mitigaciones (R2 + implementación):**

1. **Un solo envío al propietario por creación** (R6). No hay correos por
   edición, ni por mudanzas ajenas, ni por residentes.
2. Solo se envía cuando `diligencia === 'Propietario'` (no por cada
   registro del conjunto).
3. La copia al admin va en `try/catch` propio: si la cuota se agota en esa
   llamada, el correo del propietario **ya se envió** y no se pierde nada.

> ⚠️ **DECISIÓN PENDIENTE DEL OPERADOR (D1):** si la administración prevé
> una campaña de llenado masivo en los próximos días, conviene **subir la
> cuenta a Google Workspace** (o enviar por lotes en días distintos) antes
> de desplegar. **No bloquea el despliegue**, pero debe decidirse antes de
> una campaña.

**Comportamiento ante cuota excedida:** `MailApp.sendEmail` lanza una
excepción. El `try/catch` de §3.1.3 la captura, `correoEnviado` queda
`false`, `correoError` se llena, el **registro se conserva**, y el frontend
muestra el código en pantalla con un aviso de que el correo no pudo enviarse.
El usuario nunca pierde su código.

### 3.2 Frontend — `js/app.js`

#### 3.2.1 Modificar `mostrarExito()` + enviar `__origen`

**Cambio A — `js/app.js`, función `recolectar()`:** añadir el campo
`__origen` al payload. Esto es lo que habilita (y lo que **únicamente**
habilita) el envío de correo (H-02, §3.1.3).

```javascript
function recolectar() {
  ...
  return {
    editMode: state.mode === 'edit',
    numForm: state.numForm,
    // BUGFIX-027: marca de origen. El backend SOLO envía el código por
    // correo si viene de aquí (el formulario público). El portal del
    // residente usa js/residente.js, que no manda esta bandera.
    __origen: 'formulario-publico',
    apto: val('#apto'),
    ...
  };
}
```

> Nota: `recolectar()` es un `return { ... }` literal (no una variable
> `payload`). El campo `__origen` va justo después de `numForm` (línea ~363
> del archivo real). El `recolectar()` se usa **tanto** para crear como
> para editar; en modo edición `editMode: true` impide el envío de todas
> formas, así que la bandera es inofensiva ahí.

**Cambio B — `js/app.js`, función `mostrarExito()`:**

```javascript
function mostrarExito(data) {
  $('#form-card').classList.add('hidden');
  $('#success-card').classList.remove('hidden');
  if (data.editMode) {
    $('#success-title').textContent = '¡Registro actualizado!';
    $('#success-num-form').textContent = data.numForm;
    $('#success-advice').innerHTML = '<strong>N° de formulario:</strong> ' + data.numForm + ' (sigue siendo el mismo).';
  } else {
    $('#success-title').textContent = '¡Registro creado exitosamente!';
    $('#success-num-form').textContent = data.numForm;
    $('#success-advice').innerHTML = `
      <strong>⚠️ IMPORTANTE: Guarda tu N° de formulario.</strong><br>
      Tu N° de formulario es: <strong style="font-size:18px; letter-spacing:2px;">${data.numForm}</strong><br>
      Lo necesitarás cada vez que quieras editar o actualizar tus datos.<br>
      Guárdalo en un lugar seguro (anota, captura de pantalla, etc.).<br>
      <em>La administración NO puede recuperar este número por ti.</em>
    `;
  }
  // BUGFIX-027: aviso de correo enviado (solo en creación con Propietario).
  mostrarAvisoCorreo(data);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// BUGFIX-027 — Aviso sobre el envío del código por correo.
function mostrarAvisoCorreo(data) {
  const el = $('#success-correo-aviso');
  if (!el) return;
  if (data.editMode) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  if (data.correoEnviado) {
    el.classList.remove('hidden');
    el.classList.remove('alert-err');
    el.classList.add('alert-ok');
    el.innerHTML = '📧 <strong>Te enviamos un correo con tu código ' +
      '<span class="num-form-inline">' + data.numForm + '</span>.</strong><br>' +
      'Lo enviamos al correo que registraste como propietario. ' +
      'Revisa tu bandeja de entrada (y la carpeta de spam) para tener el código a la mano.';
  } else if (data.correoError) {
    el.classList.remove('hidden');
    el.classList.remove('alert-ok');
    el.classList.add('alert-err');
    el.innerHTML = '⚠️ <strong>No pudimos enviar el correo con tu código.</strong><br>' +
      'Tu registro <strong>sí quedó guardado</strong> y tu código es ' +
      '<span class="num-form-inline">' + data.numForm + '</span>. ' +
      'Cópialo ahora y guárdalo. Si lo pierdes, escribe a ' +
      'urb.cerroazul@gmail.com o al WhatsApp 316 924 0748.';
  } else {
    // No era Propietario, o no aplica: sin aviso de correo.
    el.classList.add('hidden');
    el.innerHTML = '';
  }
}
```

**Nota sobre el mensaje "La administración NO puede recuperar este número por
ti":** es **inexacto** hoy (el admin sí puede buscar por apto en el portal
admin y ver el `CA-XXXX`), pero **no se cambia en este feature** para no
ampliar el alcance. Se deja una nota en §8 (fuera de alcance) para que el
operador decida si se corrige en el futuro. El texto actual eservative y
favorece que el usuario guarde el código, que es el objetivo.

#### 3.2.2 `index.html` — elemento del aviso

Se agrega dentro de `#success-card`, **después** de `#success-advice` y
**antes** del bloque de botones:

```html
<!-- BUGFIX-027: aviso de correo con el código (oculto por defecto) -->
<div id="success-correo-aviso" class="alert hidden" role="status"></div>
```

La clase `alert` ya existe en `assets/styles.css` con variantes
`alert-ok` / `alert-err` / `alert-warn` (usadas por `showAlert()` en
`js/app.js`). **Reutilizar** esas clases evita CSS nuevo.

#### 3.2.3 `assets/styles.css` — clase auxiliar mínima

```css
.num-form-inline {
  font-weight: 700;
  letter-spacing: 1px;
}
```

(El bloque de texto dentro de un `.alert` no puede contener un `<div>` del
tamaño de `.num-form`, así que se necesita un estilo inline equivalente.)

#### 3.2.4 Cache-busters

```html
<!-- index.html -->
<link rel="stylesheet" href="assets/styles.css?v=20261025">
<script src="js/app.js?v=20261025"></script>
```

Los valores actuales en producción son `styles.css?v=20261021` y
`app.js?v=20261023`. **Deben bumpearse** o los usuarios verán la versión
cacheada sin el aviso (Lección #21 del skill).

---

## 4. ANÁLISIS DE IMPACTO — LOS 3 FLUJOS QUE LLAMAN A `submitRecord`

Este es el punto de mayor riesgo del cambio. `submitRecord()` **no** es
exclusiva del formulario público.

| # | Flujo | Llamada | `editMode` | ¿Envía correo con esta regla? |
|---|---|---|---|:---:|
| 1 | **Formulario público** (crear) | `doPost` → default → `submitRecord(payload)` | `false` | **SÍ** (si `diligencia=Propietario`) |
| 2 | **Formulario público** (editar) | `doPost` → default → `submitRecord(payload)` | `true` | NO |
| 3 | **Portal del residente** (`registrarResidente`) | `registrarResidente` → `submitRecord(payload)` con `editMode: true` explícito (línea 2324) | `true` | NO |
| 4 | **Portal del residente** (`actualizarResidente`) | `actualizarResidente` → `submitRecord(payload)` — **sin `editMode` explícito** | ⚠️ **roto en producción** (H-13) | NO (3 capas: origen + editMode + diligencia) |

### 4.1 Verificación del flujo 4 (hallazgos H-02 y H-13)

`actualizarResidente` (línea ~2427) construye un payload **sin** `editMode`.
Como el backend lee `diligencia` del registro existente (línea 2430:
`diligencia: String(row.values[4] || '')`), y los registros del conjunto
tienen `diligencia = 'Propietario'` en su mayoría, **este flujo dispararía
el envío de correo si se aplicara la regla sin el flag `editMode`**.

**Verificación empírica realizada (25-Oct-2026, apto 218 / CA-0002):**

```json
// POST actualizarResidente con cc correcta (1128267275), slot 1, datos vacíos
{"ok":false,"error":"Ya existe un registro para el apartamento 218. Si eres el
 propietario o encargado, usa la opción \"Editar mi registro\" con el N° de
 formulario que se te entregó al crear el registro. Si no lo tienes, contacta
 a la administración (urb.cerroazul@gmail.com)."}
```

Esto confirma **H-13**: `actualizarResidente` está **roto en producción**.
Siempre cae en el branch de creación de `submitRecord` y siempre falla con
"Ya existe un registro". El flujo **nunca llega a escribir**, y por tanto
**nunca llegaría al bloque de envío de correo** tal como está hoy el
código.

**Implicación para este feature — doble:**

1. **Riesgo contenido:** si el flujo estuviera arreglado y se aplicara la
   regla `!editMode && diligencia === 'Propietario'`, el portal del
   residente **sí dispararía** correos al actualizar datos. El feature debe
   ser **robusto a que ese bug se arregle en el futuro**.
2. **Oportunidad:** como el flujo está roto y va a ser arreglado (o no),
   este es el momento natural para **normalizar `editMode: true`** en
   `actualizarResidente` — una línea — y de paso corregir el segundo bug
   detectado en ese mismo payload (H-14).

**Mitigación aplicada en el spec (H-02):** la función de envío recibe el
contexto explícito y decide con **tres** condiciones independientes, no
solo con `editMode`. Ver §3.1.3 y §7.2.

---

## 5. DEPENDENCIAS Y EFECTOS SECUNDARIOS

### 5.1 Módulo de estado de cuenta (`estado-cuenta.html`)

**Sin impacto.** El login es `CA-XXXX + apto + cédula` vía
`verificarPropietario`. El código no cambia. El nuevo correo no altera este
flujo.

### 5.2 Módulo de mudanzas (`index.html` tab mudanzas)

**Sin impacto.** El login es `CA-XXXX + apto + cédula` vía
`verificarPropietario`. El código no cambia.

### 5.3 Módulo de salón social (`salon-social.html`)

**Sin impacto.** Login `apto + CC`.

### 5.4 Portal del residente (`residente.html`)

**Sin impacto funcional.** Confirmado por los flujos 3 y 4 de §4.

### 5.5 Portal admin (`admin.html`)

**Sin impacto**, pero **oportunidad**: el admin podría ver si el correo se
envió. **Fuera de alcance** de este feature (§8). Requiere una columna nueva
en el Sheet (`CORREO ENVIADO`), que implicaría cambiar `NUM_COLS` (143) y
migrar el esquema — **riesgo alto, no se hace ahora**.

### 5.6 Portal de vigilancia (`vigilantes.html`)

**Sin impacto.** No ve datos de contacto.

### 5.7 Asistente IA (`js/asistente.js` + `MANUAL_CERRO`)

**Impacto de contenido (no de código).** El manual embebido, sección 3.6,
dice hoy:

```
"3. Guarde el código: tómele foto a la pantalla, anótelo, guárdelo como
    contacto en el celular o toque "Imprimir comprobante".\n"
"Si perdió el código: escriba a urb.cerroazul@gmail.com o al WhatsApp
 316 924 0748 con su nombre completo, cédula y número de apartamento."
```

Con este feature, esa sección queda **parcialmente desactualizada**: para el
propietario, el código **también** llega por correo.

**Decisión:** el manual se actualiza en un **deploy posterior** (V43), porque
`MANUAL_CERRO` es una constante embebida de 44 KB que el operador mantiene
en un Google Doc (`1NeN1y09tr4Sc2PVuf0ATBDxjSHWqchHkYbzs0HJhiBg`) y
regenera cuando lo trae. El workflow acordado (preferencia #3 del skill) es:
el operador edita el Doc → avisa → Hermes regenera la constante → V_N+1.

**Para este feature, el spec NO toca `MANUAL_CERRO`.** Pero el texto nuevo
debe ser coherente con lo que el bot dirá. Documentado en §8.

### 5.8 Registro `Registros` del Sheet (143 columnas)

**Sin cambios de esquema.** `NUM_COLS` sigue en 143. No se agregan columnas.

El correo enviado es derivable: está en la columna H (`Correo Propietario`).
No hace falta registrar "se envió" para el alcance actual.

### 5.9 Formulario público (`index.html`) — el aviso y la impresión

La tarjeta de éxito también tiene el botón **"🖨️ Imprimir comprobante"**
(`window.print()`). El nuevo aviso `alert` se imprimirá junto con el resto
de la tarjeta. **Es deseable**: el comprobante impreso tamaño it'll record
the code even without the email. Verificado que `.alert` tiene estilos de
impresión válidos (no hay `@media print` que lo oculten).

### 5.10 Cuota de `MailApp` — ver R4 y D1 en §3.1.4

### 5.11 Permisos y scopes

`MailApp` **no requiere scopes adicionales** en `appsscript.json` (usa la
identidad del script). El proyecto ya envía correos con `MailApp` en los
módulos de mudanzas y salón social, así que **el permiso ya está autorizado**
en el proyecto de `urb.cerroazul@gmail.com`.

**No se requiere re-autorización.** El operador NO tiene que ejecutar nada
extra antes del deploy (a diferencia de V35/BUGFIX-022, que sí requirió
`ecSetup()` por usar DriveApp y DocumentApp).

### 5.12 Despliegue

**Sigue siendo manual** (verificado: el script pertenece a
`urb.cerroazul@gmail.com` y la API de Apps Script devuelve 404 con el token
de Hermes — `GET /v1/projects/17nuyz...` → `404 NOT_FOUND`).

El operador: pegar el `.gs` en el editor de Apps Script → Implementar → Nueva
implementación → Aplicación web → Ejecutar como "Yo" → Acceso "Cualquier
persona".

**La URL `/exec` se preserva** entre versiones (invariante del proyecto
verificada en 20+ deploys).

---

## 6. PLAN DE IMPLEMENTACIÓN

### Fase F0 — Respaldo ✅ COMPLETADO

- Código (repo + V41 de Drive + git bundle) → `gdrive:Cerro Azul/backups/proyecto-completo-20261025-pre-email-codigo/`
- Sheet completo (XLSX + 5 CSV) → misma carpeta
- Verificado: **8/8 archivos con md5 idéntico** en round-trip Drive ↔ local
- Drive ID de la carpeta: `1j-1_lHujAp1IEh36Kt2Vx0jbww3IXfeH`

### Fase F1 — Generar V42 (backend)

1. `rclone copy` de V41 desde Drive a `/tmp/v42/` (**desde Drive, nunca desde el repo**).
2. Verificar md5 = `a708d11897ff137c2a5efdcf090a8cef`.
3. Aplicar **5** cambios:
   - `const REGISTRO_EMAIL_ADMIN` (nueva constante).
   - `function enviarEmailCodigoRegistro(row, numForm)` (nueva función).
   - `submitRecord()`: bloque de envío + 2 campos nuevos en el `return`.
   - **H-14:** `actualizarResidente` → preservar `dispositivos` (§3.1.3b).
   - **H-13:** `actualizarResidente` → `editMode: true` (§3.1.3b).
4. `node --check` sobre el `.gs` convertido a `.js`.
5. Verificar que **NO** se rompió nada:
   - `grep -c "function "` comparativo V41 vs V42 → debe crecer en 1.
   - `NUM_COLS` sigue en 143.
   - `MUDANZAS_NUM_COLS` sigue en 23.
   - Los 9 `MailApp.sendEmail` preexistentes siguen intactos.
   - `grep -n "dispositivos: \[\]"` → **0 resultados** (H-14 aplicado).
   - `grep -n "editMode: true"` → **2 resultados** en el portal del residente.
6. Subir a Drive → extraer ID real → link real.

### Fase F2 — Frontend

1. `js/app.js`: `mostrarExito()` + `mostrarAvisoCorreo()`.
2. `index.html`: `#success-correo-aviso` + cache-busters.
3. `assets/styles.css`: `.num-form-inline`.
4. `node --check js/app.js`.
5. Verificación de IDs preservados (el nuevo ID no colisiona con ninguno existente).

### Fase F3 — Deploy manual (operador)

1. Descargar V42 de Drive.
2. Pegar en el editor de Apps Script (borrar todo, pegar, guardar).
3. Implementar → Nueva implementación → Aplicación web → Yo / Cualquier persona.
4. Verificar que la URL `/exec` **no cambió**.

### Fase F4 — Validación E2E (ver `docs/TESTING-PROTOCOL.md`)

| Test | Escenario | Resultado esperado |
|---|---|---|
| T-027-1 | Crear registro con `diligencia=Propietario`, correo válido | Fila creada, correo recibido con `CA-XXXX`, pantalla muestra aviso ✅ |
| T-027-2 | Crear con `diligencia=Encargado` | Fila creada, **NO** hay correo, **NO** hay aviso |
| T-027-3 | Editar un registro existente (`editMode:true`) | Actualiza, **NO** hay correo, **NO** hay aviso |
| T-027-4 | `registrarResidente` (portal del residente) | **NO** hay correo |
| T-027-5 | `actualizarResidente` | **NO** hay correo |
| T-027-6 | Crear con correo inválido | **Rechazado** por el backend (validación existente), sin fila creada |
| T-027-7 | Simular fallo de `MailApp` (cuota) | Fila **conservada**, `correoEnviado=false`, pantalla muestra código + aviso de error |
| T-027-8 | Regresión: `nextId`, `lookup`, `lookupMatApto` | Sin cambios |
| T-027-9 | Regresión: `adminLogin`, `vigilanteLogin` | Sin cambios |
| T-027-10 | Regresión: `dispMudanzas`, `reservarSalon`, `ecConsultar` | Sin cambios |
| T-027-11 | El correo **no** contiene cédula, celular ni datos de residentes | Inspección del correo recibido |
| **T-027-12** | **H-14:** `actualizarResidente` en el apto **CA-0001** (apto 2000, 6 celdas de dispositivos pobladas) | Las 6 celdas de Dispositivos/Llaveros/Tags **siguen idénticas** antes y después |
| **T-027-13** | **H-13:** `actualizarResidente` en el apto 2000 con la CC correcta del R1 | **`ok: true`** (ya no "Ya existe un registro") — el flujo quedó reparado |
| **T-027-14** | **H-13:** `registrarResidente` (auto-registro) | `ok: true`, slot asignado, **sin** correo enviado |

**T-027-1 y T-027-2 requieren UN registro real nuevo** en el Sheet. Se usan
apartamentos de prueba y **NO se borran** (prohibido eliminar filas — §18 del
`GUIA-PROYECTO.md`); se documentan como datos de prueba en el CHANGELOG.

### Fase F5 — Documentación y commit

1. `docs/CHANGELOG-BUGFIXES.md` → entrada BUGFIX-027.
2. `docs/TESTING-PROTOCOL.md` → T-027-1..11.
3. `GUIA-PROYECTO.md` → sección nueva + actualizar historial de deploys.
4. `apps-script/README.md` → cabecera de versión.
5. `docs/sesion-2026-10-25.md` → bitácora.
6. **Sincronizar `apps-script/Código.gs`** del repo con V42 (el repo está en V38 — ver H-01 §7.2).
7. Commit + push.

---

## 7. AUDITORÍA DEL SPEC — HALLAZGOS Y CORRECCIONES

Auditoría realizada contra el código real de V41 (no contra el spec). Se
listan los hallazgos, el análisis y la corrección aplicada.

### Estado de los hallazgos (25-Oct-2026, tras V42 desplegado)

| # | Severidad | Tipo | Estado |
|---|---|---|---|
| H-01 | 🔴 Crítico | Deploy drift | ✅ **RESUELTO** — repo sincronizado con V42 |
| H-02 | 🔴 Crítico | 3 capas de protección | ✅ **RESUELTO** en V42 |
| H-03 | 🟠 Alto | Bandera del cliente | ✅ **Corregido en el spec** (eliminado) |
| H-04 | 🟠 Alto | Orden escritura→correo | ✅ **Corregido en el spec** |
| H-05 | 🟡 Medio | Cuota de MailApp | ⏳ **PENDIENTE — decisión D1** |
| H-06 | 🟡 Medio | Cache-buster | ✅ **Corregido en el spec** (§3.2.4) |
| H-07 | 🟡 Medio | Texto "NO puede recuperar" | ⏳ **PENDIENTE — decisión D2** |
| H-08 | 🟡 Medio | `MANUAL_CERRO` desactualizado | ⏳ **PENDIENTE — decisión D3** |
| H-09 | 🔵 Bajo | `numForm` en logs | ✅ **Corregido en el spec** |
| H-10 | 🔵 Bajo | `.num-form` en `.alert` | ✅ **Corregido en el spec** (`.num-form-inline`) |
| H-11 | 🔵 Bajo | Nombre de función ambiguo | ✅ **Corregido en el spec** |
| H-12 | 🔵 Bajo | Falta `Logger.log` | ✅ **Corregido en el spec** |
| H-13 | 🔴 Crítico | Portal del residente roto | ✅ **RESUELTO en V42** (desplegado y validado) |
| H-14 | 🔴 Crítico | Destrucción de datos del propietario | ✅ **RESUELTO en V42** (desplegado y validado) |
| H-15 | 🟡 Medio | Copia al admin consume cuota | ✅ **Documentado** en D1 |
| **H-16** | 🟡 Medio | `adminGuardar` ¿destruye datos? | ✅ **AUDITADO — SEGURO** (0 pérdidas, 0 alteraciones) |
| **H-17** | 🔴 **Crítico** | **Off-by-one en `clearResidente`** | ✅ **RESUELTO en V43** |

### H-17 — 🔴 CRÍTICO (preexistente) — `clearResidente` borra de más y de menos

**Detectado** en la auditoría de simetría (25-Oct-2026), al revisar los 5
flujos que escriben la hoja `Registros`.

**Causa raíz:** off-by-one en el rango de borrado.

```javascript
// ANTES (preexistente desde V34):
sheet.getRange(rowNumber, 110, 1, 26).clearContent();
// getRange es 1-based → borra columnas 110..135 = idx0 109..134
```

| | Columna (1-based) | idx0 | Efecto |
|---|---|---|---|
| **Borra de más** | 110 = `Disp3 Recibe` | 109 | **Dato del PROPIETARIO** borrado (el resident no puede tocar dispositivos) — **2 registros** afectados (CA-0030, CA-0128) |
| **Borra de menos** | 136 = `Emerg2 Teléfonos` | 135 | **No se borra** → queda el teléfono del resident anterior — **94 registros** afectados (34.3%) |

**Fix (V43):** `getRange(rowNumber, 111, 1, 26)` → borra idx0 110..135 =
`Masc1 Tipo` … `Emerg2 Teléfonos` = Mascotas (20) + Contactos (6) = **26
columnas exactas**.

**Verificación (274 filas reales):**

| | Dato del propietario borrado | Dato del resident que queda |
|---|---:|---:|
| Antes | **2** | **94** |
| Después | **0** | **0** |

**Preexistente en:** V34, V36, V38, V40, V41, V42 (el bug venía desde
V34, 05-Oct-2026). No lo introdujo BUGFIX-027.

**Nota:** era un bug *latente* — `clearResidente` es un flujo que el
operador usa pocas veces. Con V43 queda corregido.

---

### H-16 — 🟡 MEDIO — `adminGuardar` auditado y SEGURO

**Detectado** en la misma auditoría de simetría.

**Análisis:** `adminGuardar` usa un patrón **distinto y más seguro** que
los flujos del residente: lee la fila actual del Sheet y **solo
sobrescribe los campos enviados** (`setStr`/`set` con guarda
`if (v !== undefined)`), y el frontend (`js/admin.js` →
`recolectarPayload()` → `leerArray(name, count)`) **siempre envía los
arrays completos** (4/4/2/2/2/3/2/2) cargados del Sheet.

**Verificación (banco de pruebas sobre las 274 filas reales):**

```
Celdas PERDIDAS:   0
Celdas ALTERADAS:  0
```

**`adminGuardar` NO destruye datos. No requiere fix.**

> Nota: una primera versión de la simulación reportaba 269 alteraciones
> en col 116/126 (`Manejo Especial`). Era un **falso positivo del
> test**: el `<select>` del admin tiene `<option value="">` + `"true"`/
> `"false"`, y el valor por defecto cuando la mascota está vacía es `''`
> (no `'false'`). Al modelar el DOM real del select → 0/0.

---

### Auditoría de simetría — resumen

Los **5 flujos** que escriben la hoja `Registros` (143 columnas):

| # | Flujo | Patrón | Estado |
|---|---|---|---|
| 1 | `submitRecord` (formulario público) | `buildRowFromPayload` | ✅ verificado 0 pérdidas |
| 2 | `registrarResidente` | `submitRecord` + `rowToObject` | ✅ V42, 0 pérdidas |
| 3 | `actualizarResidente` | `submitRecord` + `rowToObject` | ✅ V42, 0 pérdidas |
| 4 | `adminGuardar` | `setStr`/`set` sobre fila actual | ✅ **H-16: SEGURO**, 0 pérdidas |
| 5 | `clearResidente` | `clearContent` por rangos | ⚠️ **H-17: off-by-one → corregido en V43** |

Los demás `clearContent` del backend pertenecen a **otras hojas**
(`Cartera`/`Pagos`) y no a `Registros`.

---

### H-01 — ✅ RESUELTO — `apps-script/Código.gs` del repo estaba en V38, no en V41

**Detectado:** al generar V42 desde el archivo canónico del repo, se
habrían perdido **120 líneas** de código desplegado (V40 BUGFIX-025 + V41
BUGFIX-026).

**Evidencia:**

```
apps-script/Código.gs                md5 3496a3a3a06d710c8cb85f7286847ddd  4921 líneas
Codigo_V38_BORRAR_MUDANZA (en repo)  diff = 2 líneas  ← el canónico ≈ V38
Codigo_V41 (desplegada, Drive)       md5 a708d11897ff137c2a5efdcf090a8cef  5026 líneas
diff canónico vs V41 = 120 líneas
```

Lo que se habría perdido:
- `MUDANZAS_MAX_POR_TORRE_DIA = 1` + toda la validación (BUGFIX-025).
- `listarReservasMudanzasPorNumForm` + su routing (BUGFIX-026).
- `adminBorrarReservaMudanza` (V38).

**Corrección aplicada:** F1 paso 1 usa `rclone copy` de V41 **desde Drive**.
El archivo canónico del repo **quedó sincronizado con V42** en el commit
`b95bccb` (25-Oct-2026):

```
apps-script/Código.gs   md5 0b269bbc4cbf7fe44d3e2eeb2fbf5262  5286 líneas  (= V42)
```

**Regla aplicada:** `references/deploy-drift-check-procedure.md` — "SIEMPRE
generar V_N+1 desde la última en Drive, NUNCA desde el repo".

### H-02 — CRÍTICO — `actualizarResidente` llama a `submitRecord` SIN `editMode`

**Detectado:** el flujo 4 de §4.1. `actualizarResidente` (línea ~2427) arma
el payload sin `editMode: true`, a diferencia de `registrarResidente` (que
sí lo pone explícitamente en la línea 2324, por BUGFIX-012).

**Riesgo:** un resident que actualice sus datos **dispararía un correo** con
el `CA-XXXX` si la regla se aplicara solo con `diligencia`.

**Verificación empírica realizada** (con cédula incorrecta → ruta de error,
sin escritura):

```json
{"ok":false,"error":"La cédula no corresponde al residente del slot 1"}
```

**Corrección aplicada en el spec:** §3.1.3 **no** decide solo con
`editMode`. La función de envío recibe el contexto explícito:

```javascript
// Firma final de la función de envío
function enviarEmailCodigoRegistro(row, numForm, contexto) {
  // contexto.origen === 'formulario-publico'  ← único emisor permitido
  ...
}
```

Y en `submitRecord`, el envío queda condicionado a **dos** condiciones
independientes:

```javascript
const debeEnviar = !editMode
  && String(data.__origen || '') === 'formulario-publico'
  && diligencia === 'Propietario';
```

`__origen` lo añade **solo** `js/app.js` (el formulario público). El portal
del residente usa `js/residente.js`, que no lo manda → no hay envío.
Además, como defensa adicional, `registrarResidente` y `actualizarResidente`
**normalizan explícitamente** `editMode: true` en su payload (arreglando el
bug latente de `actualizarResidente`).

**Resultado:** las 3 capas (origen + editMode + diligencia) deben coincidir.
Un cliente malicioso que no mande `__origen` no dispara el envío.

### H-03 — ALTO — El borrador inicial usaba una bandera del cliente

**Detectado:** el borrador v0.1 de §3.1.3 usaba
`data.enviarCorreoCodigo === true` como condición.

**Riesgo:** un POST crudo con `{enviarCorreoCodigo: true, diligencia:
"Encargado", ...}` dispararía un correo a un destinatario no validado por
la regla de negocio.

**Corrección aplicada:** eliminada. La condición es
`!editMode && origen === 'formulario-publico' && diligencia === 'Propietario'`.
El backend decide, no el cliente.

### H-04 — ALTO — Un fallo de correo podía perder el registro

**Detectado:** en el diseño inicial, el envío iba **antes** de
`setValues()`.

**Riesgo:** si `MailApp.sendEmail` lanzaba una excepción, el flujo abortaba
antes de escribir la fila. El usuario veía un error, pensaba que no se
guardó, y **reintentaba** → el backend rechazaba con "Ya existe un
registro..." → confusión y posible soporte manual.

**Corrección aplicada:** el envío va **después** de `setValues()`, dentro de
`try/catch`, con `correoEnviado` y `correoError` en la respuesta. El
registro se conserva siempre (R5). El frontend tiene un camino de error
**específico** que muestra el código en pantalla.

### H-05 — MEDIO — Cuota de `MailApp` insuficiente para campaña masiva

**Detectado:** la cuenta `urb.cerroazul@gmail.com` es Gmail de consumo.
Las cuentas de consumo tienen límites de envío **muy** inferiores a las de
Workspace. Con ~954 unidades registradas, una campaña masiva superaría el
límite en un solo día.

**Corrección aplicada:** documentado en §3.1.4 con mitigaciones (1 correo
por creación, solo Propietario) y **decisión pendiente D1** para el
operador. **No bloquea el despliegue.**

### H-06 — MEDIO — El aviso nuevo no se vería por cache del navegador

**Detectado:** `index.html` carga `assets/styles.css?v=20261021` y
`js/app.js?v=20261023`. Sin bumpear, los usuarios verían la versión vieja
sin el aviso (Lección #21 del skill).

**Corrección aplicada:** §3.2.4 — bumpear a `?v=20261025`.

### H-07 — MEDIO — El texto "La administración NO puede recuperar este número por ti" queda inconsistente

**Detectado:** el mensaje actual de `mostrarExito()` afirma que la
administración **no** puede recuperar el código. Eso es **inexacto**: el
admin puede buscar por apto en `admin.html` y ver el `CA-XXXX`. Con el
correo, además, el usuario ya tiene una vía de recuperación.

**Análisis:** el texto actual es *conservador* y cumple la función de
urgencia (que el usuario guarde el código). Cambiarlo amplía el alcance.

**Corrección aplicada:** **NO se cambia** en este feature. Se deja
documentado en §8 (fuera de alcance) para decisión del operador.

### H-08 — MEDIO — `MANUAL_CERRO` queda parcialmente desactualizado

**Detectado:** sección 3.6 del manual embebido dice que hay que guardar el
código en papel/celular y da el procedimiento de pérdida. Con el correo,
eso es incompleto.

**Corrección aplicada:** **NO se toca `MANUAL_CERRO` en V42.** Se documenta
que la actualización va en un deploy posterior (V43) siguiendo el workflow
del operador (preferencia #3). Documentado en §5.7 y §8.

### H-09 — BAJO — Riesgo de exponer `numForm` en logs

**Detectado:** `Logger.log()` es visible en el editor de Apps Script. El
`numForm` es una credencial de edición (Lección #26 del skill).

**Análisis:** el código ya se loggea hoy (`Logger.log('[reservarSalon] ' +
id + ...)`) y el `numForm` aparece en el `Logger.log` de `submitRecord`
de forma equivalente. El log de Apps Script solo lo ve el owner del
proyecto (`urb.cerroazul@gmail.com`).

**Corrección aplicada:** se evita loggear el **correo** completo y el
**nombre** en los logs de error (solo `numForm` + apto). El correo del
propietario sí se incluye en la copia al admin (que es el propósito
operativo de esa copia).

### H-10 — BAJO — `.num-form` no sirve dentro de un `.alert`

**Detectado:** `.num-form` es un `div` con tamaño de bloque y estilos
propios (`index.html` línea 564). Anidarlo dentro del `.alert` (un `div` de
aviso) rompe el layout.

**Corrección aplicada:** se crea `.num-form-inline` (span) para el código
dentro del aviso (§3.2.3).

### H-11 — BAJO — Regresión en el módulo de mudanzas por el nombre de la función

**Detectado:** `enviarEmailConfirmacionResidente` ya existe para mudanzas. Un
nombre similar podría inducir a error.

**Corrección aplicada:** la nueva función se llama
`enviarEmailCodigoRegistro` — nombre inequívoco, sin colisión con
`enviarEmailConfirmacion*` (mudanzas) ni con `enviarEmail*Salon*`.

### H-12 — BAJO — Falta `Logger.log` en la acción de escritura

**Detectado:** el skill exige `Logger.log()` en **todas** las acciones de
escritura (Lección/pitfall del skill).

**Corrección aplicada:** `enviarEmailCodigoRegistro` loguea el envío con
`numForm` + apto + resultado, y `submitRecord` loguea el fallo si lo hay.

### H-13 — CRÍTICO (preexistente, NO introducido por este feature) — `actualizarResidente` está roto en producción

**Detectado durante la auditoría**, al verificar el flujo 4 de §4.

**Evidencia empírica (25-Oct-2026):**

```
POST action=actualizarResidente, apto=218, cc=1128267275 (correcta), slot=1
→ {"ok":false,"error":"Ya existe un registro para el apartamento 218. ..."}
```

**Causa raíz:** `actualizarResidente` construye el payload **sin**
`editMode: true` (a diferencia de `registrarResidente`, que sí lo pone
explícitamente en la línea 2324 desde BUGFIX-012). Sin esa bandera,
`submitRecord` entra al branch de **creación**, llama `findRowByApto()`,
encuentra la fila existente (siempre, porque es una actualización) y
**rechaza con "Ya existe un registro"**.

**Consecuencia:** la función "Editar mis datos" del **portal del
residente** (`residente.html`) **está completamente rota**. Ningún
residente puede actualizar sus datos. El flujo nunca escribe, nunca
llega al final de `submitRecord`.

**Verificación de no-efecto colateral:** el test se hizo contra el apto
218 (CA-0002), que **no** tiene datos en dispositivos/llaveros, y con
`datosActualizados: {}`. Se comparó el estado de la fila antes y después
del test: **sin cambios** (Fecha Registro `2026-09-10 10:55:55`, Fecha
Última Edición `2026-10-13 10:06:19` — idénticos al backup de las 18:42).
Ninguna fila del Sheet fue modificada por esta auditoría.

> ### ✅ RESUELTO en V42 (25-Oct-2026) — ver §7.3
>
> El alcance real resultó ser **mayor** que el estimado en el borrador de
> este spec: no era solo `editMode`, sino que el payload entero estaba
> desincronizado de `buildRowFromPayload`. Se midió con un banco de
> pruebas contra las 274 filas reales del Sheet:
>
> | Métrica | V41 | V42 |
> |---|---:|---:|
> | `actualizarResidente` — filas con pérdida | 200/274 | **0/274** |
> | `registrarResidente` — filas con pérdida | 36/74 | **0/74** |
>
> La solución fue reconstruir el payload desde `rowToObject(row.values)`.
> Ver `docs/sesion-2026-10-25.md` para el detalle completo.

### H-14 — CRÍTICO (preexistente) — `actualizarResidente` borra los dispositivos del propietario

**Detectado durante la auditoría**, en el mismo payload de H-13.

**Evidencia (código, línea 2461):**

```javascript
const payload = {
  ...
  bicis: validarYAplicarSlotsCompartidos(row.values, 'bicis', 85, 4, 2, datos.bicis),
  dispositivos: [],          // ← SIEMPRE VACÍO
  mascotas: validarYAplicarSlotsCompartidos(row.values, 'mascotas', 110, 10, 2, datos.mascotas),
  ...
};
```

Todos los demás slots compartidos usan
`validarYAplicarSlotsCompartidos(row.values, ...)` — que **preserva** lo
que ya está en el Sheet. `dispositivos` es el **único** que se manda
vacío. Como `buildRowFromPayload` escribe `v[95..109] = ''` cuando el
array viene vacío, el `setValues` **borra las 15 celdas** de los 3 slots
de dispositivos.

**Impacto cuantificado (verificado sobre el backup de las 18:42):**

```
51 registros tienen datos en Dispositivos / Llaveros / Tags
  CA-0001 apto 2000 → 6 celdas con datos
  CA-0007 apto 1601 → 4
  CA-0030 apto 603  → 8
  ... (51 en total)
```

Es decir: **casi 1 de cada 5 registros** perdería parte de sus datos de
llaveros y tags.

> ### ⚠️ ALCANCE REAL MEDIDO (25-Oct-2026) — era MAYOR
>
> Al implementar el fix se construyó un banco de pruebas que ejecuta el
> código real contra las **274 filas reales** del Sheet. El alcance real
> de H-14 era **muy superior** a la estimación de este spec:
>
> | Métrica (V41, sin fix) | `actualizarResidente` | `registrarResidente` |
> |---|---:|---:|
> | Filas con pérdida | **200 / 274** | **36 / 74** |
> | Celdas perdidas | **1.585** | **334** |
>
> Columnas realmente afectadas: 138 Autoriza Comunicaciones (242),
> 137 Autoriza Datos de Menores (192), 130-135 Emergencias (168),
> 110-129 Mascotas (88), 93 Llaveros (51), 95-109 Disp1/2/3 (37),
> 94 Tags (34), 85-92 Bicicletas (21).
>
> Y un hallazgo más grave: **`registrarResidente` (que sí funcionaba)
> estaba destruyendo datos EN VIVO** — borraba las autorizaciones
> legales del propietario cada vez que un resident se auto-registraba.
>
> **Resuelto en V42** reconstruyendo el payload desde
> `rowToObject(row.values)`. Ver §7.3 y `docs/sesion-2026-10-25.md`.

**Por qué el bug está "dormido":** H-13. Como `actualizarResidente`
**nunca llega a escribir** (siempre falla antes), este borrado **nunca se
ha materializado**. Los dos bugs se cancelan mutuamente: uno impide que
se escriba, el otro destruiría lo que se escribiera.

**Corrección aplicada en el spec:** §3.1.5 (nuevo) — preservar los
dispositivos igual que hace `registrarResidente` (que ya lo resuelve
correctamente con `_dispConDatos` + `dispositivosFinal`, líneas 2320-2321
y 2357 — el "FIX REAL" de BUGFIX-012).

> **Consecuencia de no corregirlo:** hoy no hay daño, porque H-13 impide
> la escritura. Pero **arreglar H-13 sin H-14 sí causaría daño real**.
> Por eso los dos van juntos en V42, o ninguno.

### H-15 — MEDIO — La copia al admin también consume cuota de correo

**Detectado:** `enviarEmailCodigoRegistro` envía **2** correos (propietario
+ copia al admin). En una campaña de ~954 registros serían ~1.908 envíos,
no ~954.

**Análisis:** el módulo de mudanzas y el de salón social ya hacen exactamente
esto (correo al usuario + copia al admin). Es el patrón establecido del
proyecto y da trazabilidad.

**Corrección aplicada:** se mantiene la copia al admin (consistencia con
los demás módulos), pero se documenta el impacto en la cuota dentro de D1
(§3.1.4): el cálculo de cuota debe asumir **2 correos por registro**, no 1.
La copia al admin va en su propio `try/catch` (ya está en el diseño de
§3.1.2) para que su fallo **jamás** afecte al correo del propietario.

---

## 7.3 ✅ RESOLUCIÓN DE H-13 / H-14 (25-Oct-2026) — BUGFIX-027

**Estado:** implementado en **V42**, verificado, subido a Drive.
**Pendiente:** deploy manual del operador + tests post-deploy.

### Qué se hizo

El operador pidió resolver H-13 primero ("resolvamos este primero y
verifiquemos que no se rompe nada"). Se construyó un **banco de pruebas**
que ejecuta el código real de `buildRowFromPayload` contra las **274
filas reales** del Sheet, y se descubrió que el alcance era **mayor** que
lo estimado en este spec.

**Resultado del banco de pruebas:**

| Métrica | V41 | V42 |
|---|---:|---:|
| `actualizarResidente` — filas con pérdida | 200/274 | **0/274** |
| `registrarResidente` — filas con pérdida | 36/74 | **0/74** |
| Celdas perdidas totales | 1.919 | **0** |

**Causas raíz reales (5, no 1):**

1. Falta `editMode: true` (H-13).
2. El payload omite `autMenores` y `autCom` → `buildRowFromPayload` escribe
   `'No'` y **borra las autorizaciones legales**.
3. `validarYAplicarSlotsCompartidos` usa claves que `buildRowFromPayload`
   no lee (bicis/mascotas/contactos).
4. `buildRowFromPayload` lee `d.emergencias`, no `d.contactos`.
5. Los tri-estados `'Sí'`/`'No'` como string son *truthy* en JS →
   `requiereRevision` habría convertido 246 filas a `'Sí'`.

**Solución aplicada:** reconstruir el payload desde
`rowToObject(row.values)` (que ya existía y hace round-trip fiel de las
143 columnas) + 8 funciones auxiliares. Por construcción no se puede
perder ningún campo.

**Bug adicional encontrado por el propio banco de pruebas:** la primera
versión del fix asignaba el dato del resident al slot del **mismo
índice**; si el propietario tenía V1 ocupado, el vehículo del resident se
**descartaba**. Corregido: los datos van al **primer slot vacío**.

### Artefactos

| Archivo | Detalle |
|---|---|
| `apps-script/Codigo_V42_H13_H14_RESIDENTE_20261025.gs` | V42 (242.137 B / 5.286 líneas) |
| md5 | `0b269bbc4cbf7fe44d3e2eeb2fbf5262` (verificado en Drive) |
| Drive ID | `19t7jhMbpocvopP57fIfJCKoNXdqNSBHd` |
| Drive link | https://drive.google.com/file/d/19t7jhMbpocvopP57fIfJCKoNXdqNSBHd/view |
| Bitácora | `docs/sesion-2026-10-25.md` |
| Changelog | `docs/CHANGELOG-BUGFIXES.md` → BUGFIX-027 |

**El repo quedó sincronizado:** `apps-script/Código.gs` estaba en V38
(H-01) y ahora está en **V42**.

### Impacto en este spec

Al deployar V42, el portal del residente **empieza a funcionar**. Esto
**no** afecta la regla de envío de correo de §3.1.3, porque la condición
tiene 3 capas y la 3ª (`diligencia === 'Propietario'`) se evalúa sobre
el registro del **propietario**, no sobre el resident que edita.

Pero sí **simplifica** el feature: como `actualizarResidente` ahora
preserva las autorizaciones del propietario, el envío de correo nunca
podría dispararse desde ese flujo (además de las 3 capas).

### Tests post-deploy

| Test | Escenario | Esperado |
|---|---|---|
| T-027-12 | `actualizarResidente` apto 218 con CC correcta | `ok: true` (ya no "Ya existe") |
| T-027-13 | El mismo test | Cols 93/94/95-109/136/137/138/130-135 sin cambios |
| T-027-14 | `registrarResidente` en apto sin residentes | `ok: true`, datos del propietario intactos |
| T-027-15 | `registrarResidente` con vehículo y V1 ocupado | V1 intacto, vehículo en V2 |
| T-027-16 | `residente.html` → "Editar mis datos" | El resident puede guardar |

---

## 8. FUERA DE ALCANCE (decisiones pendientes del operador)
Ninguno de estos puntos bloquea el despliegue. Se listan para que el
operador decida con el tiempo.

| # | Tema | Pregunta |
|---|---|---|
| **D1** | **Cuota de correo** | ¿Habrá campaña masiva de llenado? Si sí, hay que subir a Google Workspace o enviar por lotes **antes** de desplegar. Con ~954 unidades y **2 correos por registro** (propietario + copia al admin) serían ~1.908 envíos — muy por encima del límite diario de una cuenta de consumo. |
| **D2** | **Texto "NO puede recuperar"** | ¿Se corrige el mensaje de `mostrarExito()`? hoy es inexacto. |
| **D3** | **Actualizar `MANUAL_CERRO`** | ¿Se actualiza la sección 3.6 del manual del bot en un V43 posterior? |
| **D4** | **Correo al Encargado** | El encargado tiene el mismo problema (necesita el código). Hoy **no** se le envía, por decisión del operador. ¿Se revisa? |
| **D5** | **Columna "correo enviado"** | ¿El admin debe ver si el correo se envió? Requiere migrar `NUM_COLS` (143) — riesgo alto. |
| **D6** | **Correo al editar** | ¿Se reenvía el código en cada edición como respaldo? Hoy no (R1). |
| **D7** | **H-13 / H-14** | Los 2 bugs preexistentes del portal del residente se arreglan **en el mismo V42** (son interdependientes). ¿Se aprueban juntos o se dejan para un V43 aparte? **Recomendación: juntos en V42** — separar el fix de H-13 del de H-14 crearía una ventana de pérdida de datos. |

### Nota sobre D4 (opcional, pero relevante)

El operador pidió explícitamente "solo cuando se haga el registro como
propietario". El caso del **Encargado** es simétrico: quien llena el
formulario es el encargado, y el código que se le muestra en pantalla es
**también** su credencial de edición (el manual dice que el encargado puede
editar con el código). Sin correo, el encargado tiene el mismo problema que
tenía el propietario.

Sin embargo: **el campo `correoProp` contiene el correo del PROPIETARIO**
(incluso cuando diligencia es "Encargado" — la sección 1 del formulario es
siempre "Datos del propietario"). Por eso **no se puede** enviar el código al
encargado sin una dirección del encargado: el campo `correArr` (col T) sí
existe, pero es **opcional** en el formulario.

Por eso la decisión del operador (solo Propietario) es coherente con los
datos disponibles: hoy no hay un canal garantizado para llegar al encargado.

---

## 9. VERIFICACIÓN DE NO-REGRESIÓN (checklist antes de declarar listo)

```
□ V42 generada desde Drive V41 (md5 base a708d118), NO desde el repo
□ node --check sobre el .gs → sin errores
□ NUM_COLS = 143 (sin cambio)
□ MUDANZAS_NUM_COLS = 23 (sin cambio)
□ COL_MUD_* sin cambio (23 constantes)
□ Los 4 MailApp.sendEmail preexistentes intactos (líneas 1440, 1461, 1473, 1487)
□ Los 5 MailApp.sendEmail del salón intactos (2976, 3076, 3144, 3390, 3456)
□ grep -c "function " → V42 = V41 + 1 (solo enviarEmailCodigoRegistro)
□ numCol = 143 en todas las escrituras
□ NO se tocó MANUAL_CERRO
□ NO se tocó doPost routing
□ NO se tocó el schema del Sheet
□ node --check js/app.js → sin errores
□ IDs de index.html preservados (solo se agrega #success-correo-aviso)
□ Cache-busters bumpeados a ?v=20261025
□ .num-form-inline agregada a styles.css
□ Link REAL de Drive extraído (rclone lsjson → .ID), sin placeholders
□ md5 local == md5 Drive (V42)
□ T-027-1..14 ejecutados y documentados en TESTING-PROTOCOL.md
□ Regresión: nextId, lookup, lookupMatApto, adminLogin, vigilanteLogin OK
□ apps-script/Código.gs del repo sincronizado con V42 (commit separado)
□ CHANGELOG-BUGFIXES.md con entrada BUGFIX-027
□ GUIA-PROYECTO.md + apps-script/README.md actualizados
□ docs/sesion-2026-10-25.md escrita
□ Commit + push a main

--- Checks específicos de H-13 / H-14 (NO OMITIR) ---

□ H-14 aplicado ANTES que H-13 en el archivo (o en el mismo commit)
□ actualizarResidente: payload tiene `editMode: true`
□ actualizarResidente: payload tiene `dispositivos: _dispOriginales` (NO `[]`)
□ H-13 y H-14 en el MISMO V42 (nunca separados)
□ T-027-12 ejecutado: 6 celdas de dispositivos del CA-0001 intactas
□ T-027-13 ejecutado: actualizarResidente devuelve ok:true
□ T-027-14 ejecutado: registrarResidente ok:true y SIN correo
□ Snapshot de la fila CA-0001 (cols 95-110) antes/después de T-027-12 guardado
```

> ⚠️ **Los 4 checks de H-13/H-14 son bloqueantes.** Un V42 que arregle
> H-13 sin H-14 **destruye datos reales** de 51 registros la primera vez
> que un residente actualice sus datos.

---

## 10. ARCHIVOS RELACIONADOS

- `docs/CHANGELOG-BUGFIXES.md` — historial de bugfixes (entrará BUGFIX-027)
- `docs/TESTING-PROTOCOL.md` — protocolo E2E (entrarán T-027-1..11)
- `docs/spec-mudanzas.md` — spec del módulo de mudanzas (patrón de referencia)
- `docs/spec-asistente-ia.md` — spec del asistente IA (patrón de referencia)
- `GUIA-PROYECTO.md` — guía técnica (sección 27: envío del código)
- `apps-script/README.md` — instrucciones de deploy (cabecera de versión)
- `apps-script/Codigo_V42_EMAIL_CODIGO_REGISTRO_20261025.gs` — **NUEVO**
- `js/app.js` — `mostrarExito()` + `mostrarAvisoCorreo()` **NUEVO**
- `index.html` — `#success-correo-aviso` **NUEVO**
- `assets/styles.css` — `.num-form-inline` **NUEVO**

---

**Mantenedor:** Hermes Agent + Fabio Lesmes (operador)
**Próximo paso:** aprobación del operador → F1 (generar V42) → F2 (frontend) → F3 (deploy manual) → F4 (validación E2E) → F5 (docs + commit)
