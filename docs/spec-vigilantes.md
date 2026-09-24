# SPEC — Portal de Vigilancia (vigilantes.html)

> **Propósito:** Permitir al personal de vigilancia de Cerro Azul consultar
> los datos de los residentes para corroborar quién vive en cada apartamento,
> verificar vehículos/parqueaderos/mascotas/bicis, y marcar check sobre las
> mudanzas (ingresos/salidas) que se realizan o no se realizan en el día.
>
> **Audiencia:** Personal de vigilancia del conjunto (turnos diurnos/nocturnos).
> **Estado:** DRAFT — pendiente OK del operador antes de implementar.

---

## 1. CASOS DE USO

### 1.1 Caso principal: verificar quién vive en un apartamento

El vigilante necesita:
- Saber el nombre del propietario
- Ver la lista de residentes del apartamento (mayores de edad)
- Ver el nombre del encargado/administrador del inmueble (si existe)
- Ver el nombre de la inmobiliaria (si existe)
- Ver el número del apartamento

**NO debe ver:** celular, teléfono fijo, correo electrónico (datos de contacto privado).

### 1.2 Caso: incidente vehicular

- Placa, marca, tipo, color, modelo
- Tag (si lo tiene)
- **Caso especial:** búsqueda especializada por placa para identificar
  vehículo de un residente (endpoint `vigilanteBuscarPorPlaca`)

### 1.3 Caso: verificar parqueadero

- Celda del parqueadero (ej: "3000")
- Matrícula del parqueadero
- Quién está autorizado a usarlo (parqueadero a tercero, si existe)

### 1.4 Caso: verificar mascotas

- Tipo, nombre, raza, color, sexo
- Si tiene manejo especial (perro bravo, etc.)

### 1.5 Caso: verificar bicicletas

- Marca, color, clase (montaña/ruta/etc.), serial

### 1.6 Caso: ver mudanzas del día (o de los próximos días)

- Ver lista de reservas Confirmadas
- Para cada reserva: apartamento, fecha, hora, tipo (Salida/Ingreso), torre, ascensor, nombre del propietario
- Botón para MARCAR CHECK (Sí/No se realizó)

### 1.7 Caso: consultar histórico de check

- Ver las últimas N reservas (no solo las futuras)
- Ver quién marcó el check y cuándo

---

## 2. DATOS QUE SÍ PUEDE VER vs NO PUEDE VER

### 2.1 ✅ SÍ puede ver (datos de identificación)

| Dato | Columna en Sheet | Por qué |
|---|---|---|
| N° de apartamento | col D (3) | Para identificar el apto |
| NumForm | col A (0) | Para buscar/citar |
| Diligencia como | col E (4) | Para saber si es propietario/inmobiliaria |
| Nombre del propietario | col F (5) | Para verificar identidad |
| CC del propietario | col G (6) | Para corroborar con documento físico |
| Nombre del encargado | col R (17) | Si hay encargado/administrador |
| CC del encargado | col S (18) | Para verificar |
| Nombre de la inmobiliaria | col Y (24) | Si aplica |
| NIT de la inmobiliaria | col Z (25) | Para verificar |
| Nombre contacto inmobiliaria | col AA (26) | Para verificar |
| Residentes (4) | cols 29-48 | Quién vive en el apto |
| Vehículos (2) | cols 61-72 | Placas/marca/color |
| Motos (2) | cols 73-84 | Placas/marca/color |
| Parqueaderos (1-2) | cols K-Q (10-16) | Celda + matrícula |
| Parqueadero tercero | cols 21-23 | Quién está autorizado |
| Mascotas (2) | cols 110-129 | Tipo, nombre, raza, manejo especial |
| Bicicletas (2) | cols 85-92 | Marca, color, serial |
| Firma | col 139-141 | Nombre firma, CC firma |

### 2.2 ❌ NO puede ver (datos de contacto privado)

| Dato | Columna en Sheet | Por qué se oculta |
|---|---|---|
| Correo del propietario | col H (7) | Privacidad, Ley 1581 |
| Celular del propietario | col I (8) | Privacidad, Ley 1581 |
| Teléfono fijo del propietario | col J (9) | Privacidad |
| Correo del encargado | col T (19) | Privacidad |
| Celular del encargado | col U (20) | Privacidad |
| Correo de residentes | col AD/AF/AH/AJ (31,33,35,37) | Privacidad |
| Celular de residentes | col AE/AG/AI/AK (32,34,36,38) | Privacidad |
| Correo de la inmobiliaria | col AB (28) | Privacidad |
| Teléfono de la inmobiliaria | col AC (27) | Privacidad |

---

## 3. ARQUITECTURA

```
┌─────────────────────────────────────────────────────────────┐
│  vigilantes.html (GitHub Pages)                             │
│  · Solo lectura (excepto check de mudanzas)                 │
│  · Login con contraseña separada (Config!B2)               │
│  · Sin botones de edición                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Apps Script Web App (V9+)                                  │
│  · vigilanteLogin(password)                                 │
│  · vigilanteVerResidentes(q)        → datos filtrados       │
│  · vigilanteVerMudanzas(fecha?)     → solo Confirmadas      │
│  · vigilanteCheckMudanza(id, status) → registra check       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Sheet (modificaciones menores)                             │
│  · Pestaña "Mudanzas": agregar columnas                     │
│    - Realizada: Sí/No (vacío por defecto)                   │
│    - FechaCheck: timestamp del check                        │
│    - Vigilante: nombre/identificador del vigilante (opcional)│
│  · Pestaña "Config": agregar contraseña vigilantes (B2)      │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. ENDPOINTS BACKEND (Apps Script)

### 4.1 `GET ?action=vigilanteLogin&password=X`

```
Valida contra Config!B2.
Retorna {ok: true} si coincide, {ok: false, error} si no.
```

### 4.2 `GET ?action=vigilanteVerResidentes&q=X`

```
Busca residentes por apto, numForm, nombre, CC.
IMPORTANTE: filtra para NO devolver correos ni celulares ni teléfonos.
Devuelve:
  - numForm
  - apto
  - diligencia
  - nombreProp
  - ccProp
  - nombreArr (si existe)
  - ccArr
  - nombreInmob (si existe)
  - nitInmob
  - contactoInmob
  - residentes[] (4) → nombre + cc (sin correo ni celular)
  - vehiculos[] → marca, tipo, color, placa, modelo, tag
  - motos[] → marca, tipo, color, placa, modelo, tag
  - parq1Celda, parq1Mat, parq2Celda, parq2Mat
  - parqTerNom, parqTerApto (si existe)
  - mascotas[] → tipo, nombre, raza, color, sexo, manejoEspecial
  - bicis[] → marca, color, clase, serial
```

### 4.3 `GET ?action=vigilanteVerMudanzas&fecha=YYYY-MM-DD`

```
Devuelve reservas Confirmadas en la fecha (o sin parámetro
para las próximas 24 horas).
Incluye:
  - idReserva
  - numForm
  - apto
  - tipoMudanza (Salida/Ingreso)
  - torre, ascensor
  - fecha, horaInicio, horaFin
  - nombrePropietario (solo nombre, no contacto)
  - realizada (Sí/No/vacío)
  - fechaCheck
  - vigilante
```

### 4.4 `GET ?action=vigilanteBuscarPorPlaca&placa=X` (V10)

```
Input:    ?action=vigilanteBuscarPorPlaca&placa=X
          (X puede ser parcial o completa, mayúsculas irrelevantes)
Devuelve: {ok:true, resultados:[{
  numForm, apto, diligencia, nombreProp, ccProp,
  vehiculos:[{
    tipoVehiculo: 'vehiculo' | 'moto',
    numero, marca, tipo, color, placa, modelo, tag
  }]
}], total}

Algoritmo:
  1. Lee todos los registros del Sheet Registros
  2. Para cada registro, busca la placa en:
     - vehiculos[0..1].placa (cols 64, 70)
     - motos[0..1].placa (cols 76, 82)
  3. Si encuentra match parcial (indexOf), agrega el registro a resultados
     con TODOS los vehículos que coincidan
  4. Normaliza la placa a mayúsculas para comparar

Caso de uso: incidente vehicular dentro del conjunto.
```

### 4.5 `POST action=vigilanteCheckMudanza`

```
Input: {idReserva, status (realizada|no_realizada), vigilante?}
Actualiza en Sheet Mudanzas:
  - Realizada = "Sí" o "No"
  - FechaCheck = timestamp actual
  - Vigilante = nombre del vigilante (opcional)
```

---

## 5. CAMBIOS EN EL SHEET

### 5.1 Pestaña "Config"

| Celda | Clave | Valor ejemplo | Descripción |
|---|---|---|---|
| A1 | admin_password | cerroazul2026 | (ya existe) |
| B1 | (config_value) | cerroazul2026 | (ya existe) |
| A2 | vigilante_password | vigilancia2026 | NUEVO |
| B2 | (config_value) | vigilancia2026 | NUEVO |

### 5.2 Pestaña "Mudanzas" — agregar 3 columnas

Actualmente la pestaña Mudanzas tiene 19 columnas (A-S). Voy a agregar:

| Col | Header | Tipo | Default | Descripción |
|---|---|---|---|---|
| T | REALIZADA | string | "" | "Sí" si se realizó, "No" si no, vacío si pendiente |
| U | FECHA_CHECK | datetime | "" | Cuándo se marcó |
| V | VIGILANTE | string | "" | Nombre/ID del vigilante que marcó |

---

## 6. FRONTEND (vigilantes.html)

### 6.1 Estructura

```
┌──────────────────────────────────────────────┐
│ 🔍 Portal de Vigilancia — Cerro Azul        │
├──────────────────────────────────────────────┤
│ [VISTA 1: Login]                             │
│  Ingrese la contraseña de vigilancia         │
│  [password input]                            │
│  [Ingresar]                                  │
├──────────────────────────────────────────────┤
│ [VISTA 2: Panel] (después de login)          │
│                                              │
│ [BUSCAR RESIDENTE]                           │
│  [Buscar por apto, nombre o placa]           │
│  [Resultados en tabla: apto | nombre | CC]  │
│  [Click en fila → ver detalle]              │
│                                              │
│ [DETALLE] (al click en fila)                 │
│  Datos del propietario (sin contacto)        │
│  Residentes (4)                              │
│  Vehículos, motos, bicicletas                │
│  Parqueaderos                                │
│  Mascotas                                     │
│                                              │
│ [MUDANZAS DEL DÍA]                          │
│  Selector de fecha [hoy ▼]                    │
│  Lista de reservas Confirmadas               │
│  Para cada: [CHECK] Sí/No se realizó         │
└──────────────────────────────────────────────┘
```

### 6.2 Vistas internas

1. **Login:** input password + botón
2. **Panel principal:** tabs o secciones para
   - Buscar residente (input + tabla de resultados)
   - Ver mudanzas del día (selector de fecha + lista de checks)
3. **Detalle de residente:** muestra los datos SÍ permitidos

### 6.3 Flujo del vigilante

```
1. Abre https://fabig76.github.io/cerro-azul-residentes/vigilantes.html
2. Ingresa la contraseña de vigilancia
3. (Opcional) Busca un residente por apto o nombre
   → ve datos básicos, vehículos, mascotas, parqueaderos
4. Ve las mudanzas programadas para hoy (o la fecha que elija)
5. Cuando un residente hace mudanza, el vigilante marca:
   · CHECK ✅ "Sí, se realizó" (caso normal)
   · CHECK ❌ "No se realizó" (caso exceptional, ej: no vino)
6. El check queda registrado con timestamp + nombre del vigilante
```

---

## 7. PLAN DE IMPLEMENTACIÓN

### Fase 1: Backend
- [ ] Agregar vigilante_password a Sheet → Config (A2/B2)
- [ ] Agregar 3 columnas a Sheet Mudanzas (T/U/V)
- [ ] Modificar Código.gs:
  - [ ] Función `vigilanteLeerContrasena()`
  - [ ] Función `vigilanteLogin(password)`
  - [ ] Función `vigilanteVerResidentes(query)` con filtrado de columnas privadas
  - [ ] Función `vigilanteVerMudanzas(fecha)`
  - [ ] Función `vigilanteCheckMudanza(data)`
  - [ ] Enrutar en doGet y doPost

### Fase 2: Frontend
- [ ] Crear `vigilantes.html`
- [ ] Crear `js/vigilantes.js`
- [ ] Estilo consistente con admin.html y formulario principal
- [ ] Login + vista de búsqueda + detalle
- [ ] Vista de mudanzas con check buttons

### Fase 3: Documentación
- [ ] Actualizar GUIA-PROYECTO.md (nueva §19 Portal de Vigilancia)
- [ ] Actualizar README-project.md
- [ ] Actualizar apps-script/README.md
- [ ] Actualizar docs/TESTING-PROTOCOL.md (Test 2.6)
- [ ] Actualizar docs/manual-llenado-cerro-azul.html (si aplica)

### Fase 4: Testing
- [ ] Probar endpoints con curl
- [ ] Probar flujo UI completo
- [ ] Verificar que NO se filtran correos/celulares

### Fase 5: Deploy
- [ ] Backup en Drive
- [ ] Commit + push
- [ ] Deploy V9 del Apps Script
- [ ] Verificación E2E

---

## 8. ANÁLISIS DE IMPACTO Y RIESGOS

### 8.1 Lo que SÍ cambia

- Pestaña Mudanzas: 3 columnas nuevas (T/U/V)
- Pestaña Config: 1 fila nueva (A2/B2)
- Código.gs: 5 funciones nuevas + enrutamiento
- 2 archivos nuevos: vigilantes.html, js/vigilantes.js

### 8.2 Lo que NO cambia

- 143 columnas del Sheet Registros (intactas)
- Endpoints existentes (lookup, submit, etc.)
- Módulo de mudanzas para residentes (sigue funcionando)
- Portal admin (sigue funcionando)
- Manual HTML del formulario público

### 8.3 Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| El vigilante podría ver datos privados | Filtrado server-side en vigilanteVerResidentes: NO incluir correos/celulares/teléfonos en la respuesta |
| Contraseña del vigilante débil | Recomendar cambio desde Config!B2 al primer deploy |
| Check incorrecto (marca Sí cuando no se hizo) | Auditoría: FechaCheck + Vigilante permite rastrear quién marcó |
| Conflicto entre vigilantes marcando al mismo tiempo | LockService como en reservas de mudanza |
| Datos personales visibles en logs del navegador | Usar sessionStorage (se borra al cerrar pestaña) |

### 8.4 Lo que NO se hace

- No se elimina ningún archivo existente
- No se cambian endpoints del formulario público
- No se cambian endpoints del portal admin
- No se quitan funcionalidades existentes

---

## 9. RECOMENDACIONES AL OPERADOR

### 9.1 Contraseña inicial

Sugerencia: `vigilancia2026` (cambiar después desde Sheet → Config!B2)

Si quiere algo más seguro, puede usar `VigCerroAzul2026!` o similar.

### 9.2 Dispositivo recomendado

- Tablet o computador en la caseta de vigilancia
- Login persistente durante el turno (no auto-logout por tiempo)
- Logout manual al final del turno

### 9.3 Capacitación

- 1 sesión de 30 minutos para mostrar el flujo
- Que el vigilante practique marcar check en una mudanza de prueba
- Que entienda qué puede ver y qué NO

---

## 10. CHECKLIST PRE-IMPLEMENTACIÓN

Antes de implementar, el operador debe confirmar:

- [ ] ¿La contraseña `vigilancia2026` está bien o quiere otra?
- [ ] ¿Quiere 1 sola contraseña compartida o varias por vigilante?
- [ ] ¿Quiere que el Sheet Mudanzas muestre también reservas Canceladas para el vigilante o solo Confirmadas?
- [ ] ¿Quiere algún campo ADICIONAL que el vigilante pueda ver (ej: foto del propietario)?
- [ ] ¿Quiere algún campo ADICIONAL que el vigilante NO pueda ver?

Una vez confirmado, procedo con F1 (Backend).

---

**Autor:** Hermes Agent
**Fecha:** 23-Sept-2026
**Estado:** DRAFT — pendiente aprobación
