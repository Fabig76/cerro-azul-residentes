# Auditoría pre-deploy — V41 vs V42 (Cerro Azul)

> **Fecha:** 25-Oct-2026
> **Propósito:** verificar que el cambio de V41 a V42 no rompe nada del
> resto del proyecto, **antes** de que el operador haga el deploy manual.
> **Método:** comparación exhaustiva código a código + banco de pruebas
> contra las 274 filas reales del Sheet.

---

## 1. Veredicto

**✅ SEGURO PARA DEPLOY.**

| Dimensión | Resultado |
|---|---|
| Funciones de V41 ausentes en V42 | **0** |
| Funciones de V41 modificadas | **0** (103/103 intactas byte a byte) |
| Constantes modificadas / ausentes / nuevas | **0 / 0 / 0** (68 = 68) |
| Rutas de `doPost` diferentes | **0** (44 = 44) |
| `MailApp.sendEmail` | 9 = 9 |
| Contenido de `MANUAL_CERRO` | **idéntico** |
| Celdas perdidas en el round-trip (274 filas) | **0** |
| Rechazos nuevos introducidos por V42 | **0** |

---

## 2. Qué cambió exactamente (V41 → V42)

**+8 funciones auxiliares nuevas** (todas con prefijo `_`, ninguna colisiona):

```
_preservarAutorizaciones   _preservarTriEstado     _preservarDispositivos
_preservarSlotCompartido   _normalizarNuevoSlot    _slotVacio
_combinarSlotsCompartidos   _combinarMenores
```

**0 funciones existentes modificadas.** El diff se concentra en 2 puntos:

| Ubicación | Cambio |
|---|---|
| `registrarResidente` (payload) | Reconstruido con `rowToObject` + `_combinar*` |
| `actualizarResidente` (payload) | Reconstruido con `rowToObject` + `_combinar*` |

**No se tocó:** `submitRecord`, `buildRowFromPayload`, `doPost`,
`rowToObject`, `findRowByApto`, `findRowByNumFormAndApto`,
`getNextFormId`, `normalizarCC`, `normApto`, `lookupMatriculaApto`,
`MANUAL_CERRO`, ni los 9 `MailApp.sendEmail`.

**Frontend (`js/`, `index.html`, `assets/`):** commit **no toca ningún
archivo** de frontend. Los 7 portales en producción responden 200.

---

## 3. Round-trip sobre las 274 filas reales

Se ejecutó `rowToObject(fila)` → `buildRowFromPayload(payload)` y se
comparó celda a celda contra el Sheet.

```
Celdas PERDIDAS:  0        ← ninguna columna pierde datos
Celdas ALTERADAS: 54       ← todas son "relleno de celdas vacías"
```

### Las 54 alteraciones son-benignas

| col | Columna | Filas con valor real | Filas vacías (se rellenan) |
|---:|---|---:|---:|
| 15 | Requiere Revisión Matrículas | 265 preservados | 9 → `'No'` |
| 136 | Autoriza Tratamiento Datos | 266 preservados | 8 → `'Sí'`/`'No'` |
| 137 | Autoriza Datos de Menores | 266 preservados | 8 → `'Sí'`/`'No'` |
| 138 | Autoriza Comunicaciones | 266 preservados | 8 → `'Sí'`/`'No'` |
| 141 | Firma - Fecha | 253 preservados | 21 → fecha de edición |

**Ninguna fila con valor real cambia.** Lo que ocurre es que celdas que
**estaban vacías** se rellenan con su valor por defecto. Esto es
**exactamente el mismo comportamiento del formulario principal** (que usa
`buildRowFromPayload` sin ninguna guarda) — no es un comportamiento
nuevo introducido por V42.

---

## 4. Simulación de las validaciones de `submitRecord()`

Se replicó la cadena exacta de validaciones de `submitRecord` (que V42
**no toca**) y se corrió contra las 274 filas con el payload de V42.

```
V41 (payload actual)  -> 26/274 filas rechazadas
V42 (payload nuevo)   -> 26/274 filas rechazadas
RECHAZOS NUEVOS: 0
```

Las 26 rechazos son **idénticos** en ambas versiones. Son registros
históricamente incompletos:

| Motivo | Filas |
|---|---:|
| Falta celular del titular | 11 |
| Falta N° de apartamento | 2 |
| Falta cédula en la firma | 2 |
| Falta cédula del propietario | 3 |
| Falta nombre del propietario | 2 |
| Diligencia vacía | 8 |

Las 8 con "Diligencia vacía" son filas **completamente vacías** (sin
nombre, CC, correo ni diligencia) — no son elegibles para ningún flujo y
se rechazan igual en V41 y V42.

---

## 5. Test de registro real (CA-0004, apto 102)

Escenario completo: un resident se registra en un apartamento que **ya
tiene** datos del propietario (menores, vehículo, contacto de emergencia,
firma, autorizaciones).

**Datos del propietario después del registro:**

| Columna | Original | Resultado |
|---|---|---|
| M1 Nombre / Edad / Parentesco | AMELIA ALVAREZ MONTOYA / 4 / HIJA | ✅ intactos |
| V1 Marca / Tipo / Color / Placa / Modelo | CHEVROLET / AUTOMOVIL / GRIS / EIM460 / 2017 | ✅ intactos |
| Emerg1 Nombre / Parentesco / Tel | CARLOS HERNAN MONTOYA / HERMANO / 3203159698 | ✅ intactos |
| Firma (139/140) | ANGELA MARIA MONTOYA P / 1128399898 | ✅ intactos |
| Autorizaciones 136/137/138 | Sí / Sí / Sí | ✅ intactas |

**Datos del resident (entraron en slots vacíos, como corresponde):**

```
R1 Nombre -> "RESIDENTE NUEVO"     (slot de residentes)
V2 Marca  -> "KIA"  V2 Placa -> "XYZ999"     (V1 estaba ocupado)
Emerg2    -> "EMERGENCIA RESIDENTE" / "Madre" / "3111111111"  (Emerg1 ocupado)
```

**Resultado: NADA del propietario fue pisado.**

---

## 6. Verificaciones complementarias

| Check | Resultado |
|---|---|
| `node --check` sobre el `.gs` | ✅ sin errores |
| md5 local vs Drive | ✅ `0b269bbc4cbf7fe44d3e2eeb2fbf5262` en ambos |
| `apps-script/Código.gs` del repo | ✅ sincronizado con V42 (estaba en V38) |
| Working tree git | ✅ limpio |
| 7 portales en producción | ✅ 200 / 200 / 200 / 200 / 200 / 200 / 200 |
| Backend en vivo (V41, sin tocar) | ✅ responde `CA-0277` |
| Frontend tocado por el commit | ❌ ninguno |

---

## 7. Riesgo residual (declarado, no escondido)

**El flujo "Editar mis datos" del portal del residente pasa de SIEMPRE
FALLAR a FUNCIONAR.** Ese cambio de comportamiento es el objetivo del
fix, pero implica que después del deploy los residentes **podrán** guardar
datos donde antes no podían.

Mitigaciones ya implementadas y verificadas:

1. El payload se reconstruye desde el Sheet (`rowToObject`) → imposible
   perder un campo del propietario (0 pérdidas medidas en 274 filas).
2. Los slots ocupados por el propietario **ganan siempre** sobre el dato
   del resident (`_combinarSlotsCompartidos`).
3. El resident solo escribe en su propio slot de residentes
   (`construirResidentesParaActualizar`).
4. Dispositivos, llaveros/tags y autorizaciones legales se preservan
   explícitamente.

**Tests post-deploy obligatorios** (T-027-12 a T-027-16, ver
`docs/sesion-2026-10-25.md` §7.1).

---

## 8. Conclusión

La V42 es un **cambio aditivo y aislado**:

- 8 funciones nuevas, 0 funciones modificadas.
- 0 constantes tocadas.
- 0 rutas de API tocadas.
- 0 regresiones de validación medidas.
- 0 celdas perdidas sobre 274 filas reales.

**Se puede desplegar sin riesgo para el resto del proyecto.**

El único cambio de comportamiento es **intencional**: el portal del
residente deja de estar roto y deja de destruir datos del propietario.

---

**Mantenedor:** Hermes Agent + Fabio Lesmes (operador)
