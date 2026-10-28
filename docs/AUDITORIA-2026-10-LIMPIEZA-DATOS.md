# Limpieza de datos — Portal Cerro Azul (28-oct-2026)

Instrucciones para el administrador. **No se automatiza** desde el código: cada
paso se hace a mano sobre la hoja de cálculo de producción, con este criterio
exacto para localizar los casos. No se copian aquí nombres, cédulas ni correos
(solo el criterio para encontrarlos).

## 1. Borrar filas físicas vacías al final de cada pestaña

- **Registros**: hoy hay ~700 filas vacías después de la última fila con `N° Formulario`.
- **Mudanzas**: ~950 filas vacías al final.
- **salon social**: ~975 filas vacías al final.

Criterio: seleccionar desde la fila siguiente a la última con datos hasta el
final de la hoja y elegir **Eliminar filas**. Esto hace que `getLastRow()` refleje
solo los datos reales y reduce el tiempo de cada lectura completa del Sheet.

## 2. Mover a una pestaña nueva `Archivo` las filas de prueba del administrador

En `Registros`, localizar las filas que cumplan **ambas** condiciones:

- `N° Apto` igual a `0` o vacío.
- `Fecha Registro` del 27-oct-2026.

Añadir también las **2 filas sin `N° Formulario`**. Moverlas a una pestaña nueva
llamada `Archivo` y borrarlas de `Registros` (no borrar físicamente antes de
mover; el historial de versiones de la hoja conserva todo).

## 3. Completar `Diligencia como` y resolver `Arrendatario`

- Filtrar `Diligencia como` vacío (hoy ~12 filas) y completar a mano el valor
  correcto (`Propietario`, `Encargado`, `Tenedor / Otro`).
- Filtrar `Arrendatario` (hoy ~16 filas) y decidir **caso por caso** si
  corresponde a `Propietario` o `Encargado`. Nota: la opción `Arrendatario` ya
  no existe en el formulario actual.

## 4. Formato de texto en columnas de identificadores

Ejecutar **una vez** desde el editor de Apps Script de producción:

```
setupFormatoTexto_()
```

Fija el formato de texto en cédulas, celulares, placas, seriales y fechas de
firma, para que no se pierdan ceros a la izquierda ni el signo `+`.

## 5. Proteger la cabecera y validar `Diligencia como`

- Proteger la fila 1 de `Registros`: Datos → Proteger hojas y rangos → rango
  `1:1`, editable solo por el administrador.
- Añadir validación de datos por lista en la columna `Diligencia como` con los
  valores: `Propietario, Encargado, Tenedor / Otro`.

## 6. Cargar `Maestros`

Pegar la lista de los 625 apartamentos reales (uno por fila) con `Estado` =
`Activo`. Esta lista alimenta una validación futura (fase 3); hoy solo se carga.

## 7. Cambiar contraseñas y restringir el acceso a la hoja

Tras desplegar la Tarea 2 (login por POST), cambiar las dos contraseñas de la
pestaña `Config` (el historial de versiones de la hoja conserva las anteriores)
y restringir el acceso a la hoja a la cuenta del administrador.

---

## Respaldo diario automático

El administrador crea una carpeta en Drive para los respaldos, pone su ID en
`Config` con la clave `respaldos_folder_id` y ejecuta **una vez** desde el
editor:

```
configurarRespaldoDiario_()
```

Esto crea un trigger diario (03:00) que copia la hoja a esa carpeta y conserva
las últimas 30 copias.
