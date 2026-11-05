# Bitácora — BUGFIX-CEDULA-SALON (2026-11-05)

## 1. Validación del diagnóstico de Hermes

| Punto | Veredicto | Evidencia |
|---|---|---|
| `findRowByApto` busca solo por N° apto | Confirmado | `apps-script/Codigo.gs` `findRowByApto` compara `data[i][COL_APTO]` (col D) únicamente; `COL_NUM_FORM` no interviene. |
| `apto='CA-0083'` → `null` → mensaje de cédula | Confirmado | `verificarAccesoResidenteOPropietario`: `if (!row) return null;` y `verificarAccesoSalon` traducía todo `null` a "Cédula no corresponde…". Reproducido en `tests/salon-acceso.test.js` contra el código sin fix. |
| `reservarSalon` revalida con el mismo helper | Confirmado | `reservarSalon` llama a `verificarAccesoSalon(apto, cc)` (no al helper directo), así que hereda mensaje y rate limit. |
| Ruta de reserva sin bug de cédula (1.6) | Confirmado | Orden: requeridos → slot válido → `verificarAccesoSalon` → mora → fecha → slot libre → append. Cédula se normaliza con `normCc` igual que en el login. |
| Rate limit compartido y deslizante (1.7) | Confirmado | `rateLimit_` hace `cache.put(k, n, ttl)` en cada llamada (TTL renovado); clave `ver_<apto>` en lookup, `verificarPropietario`, `verificarResidente`, `verificarAccesoSalon`. |

### Matices que el diagnóstico no mencionaba
- `reservarSalon` **también consume** el cupo del rate limit (llama a
  `verificarAccesoSalon`), así que un flujo login + reserva gasta 2 intentos.
- `listarReservasPorApto` usa el mismo helper y tiene un mensaje equivalente que
  también culpa a la cédula. No se tocó: solo se llega a ella tras un login ya
  validado (apto existente), así que en la práctica no aparece la confusión.
- `verificarResidente` ya distinguía "Apartamento no encontrado.", así que el fix A
  sigue un precedente del propio backend; revelar si un apto existe no es una fuga nueva.
- `findRowByApto` compara exacto (sensible a mayúsculas): `202b` ≠ `202B`. Fuera de alcance.

## 2. Fix A — mensaje honesto
En `verificarAccesoSalon`, **solo en la rama de error** (`acceso == null`), se llama a
`findRowByApto(apto)`; si no existe → "No encontramos el apartamento X. Verifique el
número (ej: 105, 202B). El N° de formulario (CA-…) no sirve aquí." Si existe → mensaje
de cédula de siempre. La ruta feliz no hace una lectura extra del Sheet (a diferencia
de la propuesta original, que leía el Sheet dos veces en cada login).

Cliente (`js/salon-social.js`, `flujoLogin`): si el apto coincide con `/^CA-?\d+$/i`
se avisa sin llamar al backend (tampoco gasta cupo de rate limit).

## 3. Fix B — rate limit
Solo `verificarAccesoSalon` pasa a `ver_salon_<apto>`, y el mensaje dice "en el Salón
Social". Los otros 3 se dejan en `ver_<apto>` compartido:
- Son el freno anti fuerza bruta de la cédula (AUD-T5): separarlos multiplicaría ×4
  el cupo de un atacante por apto. Con solo el salón aparte queda ×2 (20/10 min),
  aceptable.
- El caso real reportado (formulario + salón) queda resuelto.
- Ventana deslizante: no se cambió (requeriría guardar timestamp; el operador pidió
  mínimo). Si el usuario deja de intentar 10 min, se libera.

## 4. Verificación
- `tests/salon-acceso.test.js` carga `Codigo.gs` en `node:vm` con stubs de
  `SpreadsheetApp`/`CacheService` y sobrescribe `verificarMoraApto`/`getConfigValue`.
- Sin fix: 3 de 6 fallan (mensaje de cédula para CA-0083 y 9998; cupo compartido).
  Con fix: 6/6. Suite completa 22/22. Lint 0 errores, 19 warnings (preexistentes).

## 5. Sin comprobar
Comportamiento en producción tras desplegar (no se desplegó, no se tocó el Sheet).
