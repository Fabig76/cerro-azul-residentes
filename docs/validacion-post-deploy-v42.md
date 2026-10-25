# Validación post-deploy — BUGFIX-027 / V42 en producción

> **Fecha:** 25-Oct-2026
> **Deploy:** V42 por el operador (URL `/exec` preservada:
> `...AKfycbxp...Zp/exec`)
> **md5 V42:** `0b269bbc4cbf7fe44d3e2eeb2fbf5262`
> **Alcance:** verificación completa del **portal del residente**
> (5 endpoints + UI end-to-end) + regresión del resto del backend.
> **Sandbox usado:** CA-0083 / apto 9999 (el sandbox oficial del proyecto).

---

## 1. Veredicto

**✅ TODAS las funcionalidades del portal de residentes verificadas y
funcionando. 0 pérdidas de datos. Sandbox restaurado al 100%.**

| # | Test | Resultado |
|---|---|---|
| T1 | `actualizarResidente` sin resident en el slot | ✅ rechaza correctamente |
| T2 | `getEstadoResidente` apto existente | ✅ `numResidentes:0` |
| T3 | `verificarResidente` CC sin resident | ✅ rechaza |
| T4 | `verificarResidente` CC incorrecta | ✅ rechaza |
| T5 | `getEstadoResidente` apto inexistente | ✅ `aptoExiste:false` |
| **T6** | **`registrarResidente`** | ✅ **`ok:true`, `slotAsignado:1`** |
| T7 | `getEstadoResidente` tras registro | ✅ `numResidentes:1` |
| T8 | `verificarResidente` del nuevo resident | ✅ devuelve sus datos |
| **T9** | **`actualizarResidente` (el flujo roto, H-13)** | ✅ **`ok:true`, `slotActualizado:1`** |
| T10 | Datos tras editar | ✅ reflejados |
| T11 | `actualizarResidente` CC incorrecta | ✅ rechaza |
| T12b | `actualizarResidente` slot inválido | ✅ "Datos inválidos" |
| T13 | `registrarResidente` con slots ocupados | ✅ rechaza con mensaje claro |
| T14 | `registrarResidente` apto inexistente | ✅ rechaza |
| T15 | `registrarResidente` sin residentes | ✅ rechaza |
| T16 | `actualizarResidente` con slots compartidos | ✅ guarda en columnas correctas |
| T17 | `clearResidente` CC de propietario incorrecta | ✅ rechaza |
| T18 | `clearResidente` datos faltantes | ✅ rechaza |
| T19 | `clearResidente` numForm/apto inexistente | ✅ rechaza |
| T20 | `clearResidente` CC correcta | ✅ `celdasLimpiadas:90` |
| T21 | Estado tras `clearResidente` | ✅ `numResidentes:0` |
| T22 | UI: verificar con CC incorrecta | ✅ "No se encontró un residente…" |
| T23 | UI: verificar con CC correcta | ✅ carga datos en vista editar |
| **T24** | **UI: editar y guardar** | ✅ **"Sus datos personales han sido actualizados"** |
| T25 | UI: registro end-to-end | ✅ **"Registro exitoso"** |

---

## 2. La prueba decisiva: V42 está desplegada

Antes del fix, `actualizarResidente` **siempre** devolvía:

```json
{"ok":false,"error":"Ya existe un registro para el apartamento 218. ..."}
```

Con V42 desplegada, el mismo endpoint devuelve:

```json
{"ok":true,"slotActualizado":1,"message":"Datos actualizados correctamente."}
```

**H-13 está RESUELTO en producción.**

---

## 3. Verificación de no-destrucción (lo más importante)

Se comparó la fila del Sheet **antes** y **después** de cada escritura.

### 3.1 T6 — `registrarResidente` (el flujo que borraba datos en vivo)

```
Celdas PERDIDAS:  0
Celdas AGREGADAS: 5  (R1 Nombre/CC/Correo/Celular/Parentesco del resident)
Celdas ALTERADAS: 1  (col 2 = Fecha Última Edición — esperado)
```

### 3.2 T16 — `actualizarResidente` con vehículo y contacto de emergencia

```
Celdas PERDIDAS:  0
AGREGADAS: 13 (R1 × 5, V1 × 6, Emerg1 × 3 — el resident + sus datos)
ALTERADAS:  1 (Fecha Última Edición)
```

### 3.3 Verificación de columnas — el vehículo y contacto foram a la columna CORRECTA

| Columna | Valor | Verificado |
|---|---|---|
| V1 Marca (61) | `TOYOTA` | ✅ |
| V1 Placa (64) | `QA123` | ✅ |
| Emerg1 Nombre (130) | `EMERG QA` | ✅ |
| Emerg1 Tel (132) | `3111111111` | ✅ |
| R1 Nombre (29) | `RESIDENTE EDITADO QA` | ✅ |
| R1 Parentesco (33) | `Pareja` | ✅ |
| Aut136/137/138 | `Sí` / `No` / `No` | ✅ preservadas |
| Llaveros Aut (93) | `` | ✅ preservado |
| Disp1 (95) | `` | ✅ preservado |
| Firma (139/140) | `Fabio Lesmes` / `94501666` | ✅ preservada |

### 3.4 T20 — `clearResidente` borró SOLO lo que debe

```
Celdas que cambiaron: 1  (col 2 = Fecha Última Edición)
```

Todos los slots de residentes/menores/vehículos/mascotas/emergencias
quedaron vacíos (como antes) y **el propietario quedó intacto**:
nombre, CC, correo, celular, llaveros, autorizaciones y firma.

---

## 4. Verificación end-to-end desde la UI real

Se usó el navegador real (`residente.html` en producción):

1. Escribir `9999` → "Continuar" → llega al formulario de registro ✅
2. Click "+ Agregar vehículo" → renderiza el slot ✅
3. Click "+ Agregar contacto de emergencia" → renderiza el slot ✅
4. Llenar nombre / CC / parentesco / celular / correo / vehículo / contacto ✅
5. "💾 Registrarme como residente" → **"✅ Registro exitoso. Su información ha sido guardada."** ✅
6. Verificado en el Sheet: las 12 celdas del resident + vehículo + contacto
   quedaron en sus columnas exactas, y el propietario intacto ✅

Luego, el flujo que estaba roto:

7. Escribir `9999` → "Continuar" → "Este apartamento ya tiene residentes registrados" ✅
8. CC incorrecta → "No se encontró un residente con esa cédula" ✅
9. CC correcta → carga la vista de edición con todos los datos ✅
10. Editar nombre y celular → "💾 Guardar mis datos" → **"✅ Sus datos personales han sido actualizados correctamente."** ✅
11. Verificado en el Sheet: nombre y celular actualizados, vehículo y contacto **intactos**, propietario **intacto** ✅

---

## 5. Hallazgo sobre "Acción no reconocida"

Durante las pruebas, dos respuestas de prueba dieron
`{"ok":false,"error":"Acción no reconocida."}` en vez del error
esperado.

**Diagnóstico: NO es un bug del código.** Al repetir la misma petición
con un campo `_nonce` único (que cambia el body), la respuesta correcta
aparece en los 3 intentos. Es la **caché de respuestas POST de Google
Apps Script** para cuerpos idénticos.

El mensaje "Acción no reconocida" solo existe en `doGet` (línea 217), y
las peticiones de prueba eran POST con `Content-Type: text/plain`.

**Regla para futuros tests:** siempre incluir un nonce o timestamp
único en el body de las peticiones POST de prueba.

---

## 6. Regresión del resto del backend

| Endpoint | Resultado |
|---|---|
| `nextId` | ✅ `CA-0277` |
| `lookupMatApto` (Torre 3) | ✅ `5377499` |
| `lookupMatParq` | ✅ `5397790` Privado |
| `getEstadoResidente` (apto 413) | ✅ 2 residentes |
| `dispMudanzas` (Torre 2) | ✅ responde correctamente |
| `adminLogin` | ✅ "Login correcto" |
| `vigilanteLogin` | ✅ "Login correcto" |
| 7 portales en GitHub Pages | ✅ 200 / 200 / 200 / 200 / 200 / 200 / 200 |

---

## 7. Estado final del sandbox

```
CA-0083 (apto 9999) vs estado original:
  Celdas que difieren: 1
    col 2 Fecha Última Edición: "2026-10-02 11:55:49" -> "2026-10-25 15:07:11"
```

Única diferencia: la fecha de última edición (esperada, porque hubo
escrituras). **Todos los datos de prueba fueron limpiados** y el sandbox
quedó como estaba antes de las pruebas.

---

## 8. Conclusión

El portal del residente está **completamente funcional**:

- ✅ Registro de residents (antes: destruía datos del propietario)
- ✅ Verificación por cédula
- ✅ Edición de datos (antes: **siempre fallaba** — H-13)
- ✅ Borrado de datos con protección por cédula del propietario
- ✅ Slots compartidos en las columnas correctas
- ✅ Cero pérdida de datos del propietario

**Y el resto del proyecto no se rompió.**

Pendiente para la siguiente iteración: el feature de **envío del código
CA-XXXX por correo** (`docs/spec-email-codigo-registro.md`), que ya tiene
su spec auditado y se beneficia de que el portal del residente ahora
funcione.

---

**Mantenedor:** Hermes Agent + Fabio Lesmes (operador)
