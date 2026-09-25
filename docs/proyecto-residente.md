# Proyecto Portal del Residente — Cerro Azul

> Documento vivo del módulo de auto-actualización de residentes.
> Para el detalle técnico completo, ver `docs/spec-residente.md` (21KB).

---

## 1. Contexto

Quinto portal del proyecto Cerro Azul Residentes. Permite que los
**residentes adultos** de cada apartamento actualicen SUS datos
personales (vehículos, mascotas, bicicletas, contactos de emergencia)
escaneando un QR genérico del apto, SIN pasar por el propietario.

**Reemplaza el flujo:** propietario llena TODA la info de TODOS los
residentes en un solo envío masivo.

**Por el nuevo flujo:** propietario registra el apto (secciones 1-4),
agrega los nombres/CCs de los residentes (sección 5), y reparte
un QR genérico por apartamento. Cada residente adulto escanea el
QR y llena SUS datos complementarios (5.1, 6, 7, 9, 10) directamente.

**Aceleración esperada:** actualizaciones en paralelo (varios residentes
del mismo apto a la vez) + datos más actualizados (el residente
actualiza DIRECTAMENTE cuando compra un carro, no espera al propietario).

---

## 2. Stack (mismo que el proyecto de residentes)

- Frontend: HTML/CSS/JS vanilla en GitHub Pages
- Backend:  Apps Script Web App (mismo proyecto Apps Script del
  formulario de residentes — V13 al desplegar)
- BD:        Google Sheets (Sheet "Registros" sin cambios, sigue 143 cols)
- Drive:     nueva carpeta operativa para backups del módulo

Cero costos adicionales, cero servidores propios, cero dependencias nuevas.

---

## 3. Estructura de archivos (al implementar)

```
cerro-azul-residentes/
├── index.html                          ← MOD: zona de borrado abajo
├── residente.html                      ← NUEVO: portal del residente
├── js/
│   ├── app.js                          ← MOD: handler clearResidente
│   └── residente.js                    ← NUEVO: lógica del portal
├── assets/
│   ├── styles.css                      ← MOD: estilos btn-danger + modal
│   └── residente.css                   ← NUEVO: estilos del portal
└── docs/
    ├── spec-residente.md               ← NUEVO: spec detallado (21KB)
    └── proyecto-residente.md           ← NUEVO: este archivo
```

`Codigo.gs` en el repo sigue siendo V12 hasta el deploy V13. El Apps
Script desplegado tendrá V13 (V12 + 5 funciones nuevas pegadas al
final).

---

## 4. Recursos

- **Sheet Registros (143 cols):** `16gxeAkcTIWnuwkBFBaHW7Y-nUHaMdtovNzUBaupytPc`
- **Apps Script ID:** `17nuyzVYK2yN_nTABfD00mipVrvixBqA5YzETzuPw2ZSUgx0B3IrsjEVy`
- **Web App URL:** `https://script.google.com/macros/s/AKfycbxp...Zp/exec` (preservada en V13)
- **Carpeta backup F0 (pre-residente-V0):** `1k0PlMw7CGVHb3dg5H9bNQ-HOajY7vy40` (27 archivos OK, md5 verificado)

---

## 5. Backend (Apps Script V13)

### 5.1 Nuevos endpoints (5)

| Endpoint | Método | Propósito |
|---|---|---|
| `getEstadoResidente` | GET | Pantalla inicial del portal (existe el apto? tiene residentes?) |
| `verificarResidente` | GET | Validar CC para edición |
| `registrarResidente` | POST | Auto-registro cuando apto está vacío |
| `actualizarResidente` | POST | Editar datos del residente N |
| `clearResidente` | POST | Borrar secciones 5-10 (solo propietario/inmobiliaria) |

### 5.2 Funciones reusadas (NO se modifican)

- `findRowByApto`, `findRowByNumFormAndApto` — búsquedas
- `rowToObject` — conversión array → objeto
- `submitRecord` — escritura en Sheet
- `normApto`, `normCc` — normalización
- `LockService.getScriptLock()` — patrón de locks

---

## 6. Frontend

### 6.1 Portal nuevo (`residente.html`)

5 vistas según el flujo:
1. **Inicial:** pide N° apto
2. **Registro:** apto vacío → formulario completo (secciones 5-10)
3. **Editar:** apto con datos + CC matchea → edición del residente N
4. **Rechazado:** CC no matchea → mensaje "comuníquese con el propietario"
5. **No existe:** apto no registrado → link al formulario principal

### 6.2 Cambios a `index.html`

- Zona de borrado al FINAL del formulario en modo edición
- Botón "🗑️ Borrado de datos residente"
- Modal de confirmación con texto exacto:
  *"Esto borrará los residentes y vehículos del apartamento X. ¿Confirmas?"*
- Botón solo visible en modo edición (no en creación)

---

## 7. Reglas de negocio

### 7.1 Quién puede hacer qué

| Acción | Residente (con CC) | Propietario | Inmobiliaria |
|---|---|---|---|
| Auto-registrarse en apto vacío | ✅ (con QR + apto) | ✅ | ✅ |
| Editar SU slot (sección 5 N) | ✅ (con CC) | ✅ | ✅ |
| Agregar vehículo/mascota/bici/contacto a slot vacío | ✅ (si CC matchea) | ✅ | ✅ |
| Modificar vehículo de OTRO residente | ❌ | ✅ (admin) | ✅ (admin) |
| **Borrar TODOS los datos del residente anterior** | ❌ | ✅ (con CC) | ✅ (con CC) |

### 7.2 Qué se borra con "Borrado de datos residente"

- ✅ Sección 5 (Residentes)
- ✅ Sección 5.1 (Menores)
- ✅ Sección 6 (Vehículos y motos)
- ✅ Sección 7 (Bicicletas)
- ✅ Sección 9 (Mascotas)
- ✅ Sección 10 (Contactos de emergencia)
- ❌ NO se borra: secciones 1-4 (datos propietario), 8 (llaveros/futuro), 11 (firma)

### 7.3 Quién puede borrar

- **Propietario:** validando CC del propietario en v[6] contra el input
- **Inmobiliaria:** validando la CC del propietario (la tienen en el contrato de administración)
- **NO residente:** aunque conozca su CC, no puede borrar al anterior

### 7.4 Slots compartidos

- 2 vehículos, 2 motos, 2 bicis, 2 mascotas, 2 contactos de emergencia son COMPARTIDOS por apto (no personales)
- Si un slot ya está ocupado por OTRO residente, el nuevo residente recibe error
- El propietario puede reorganizar slots desde el portal admin (no desde este módulo)

---

## 8. Plan de implementación

| Fase | Descripción | Estado |
|---|---|---|
| F0 | Backup pre-flight (27 archivos a Drive) | ✅ 25-Sept-2026 |
| F1 | Spec + wireframes | ✅ 25-Sept-2026 |
| F2 | Backend Codigo.gs V13 (5 endpoints) | ⏳ Pendiente |
| F3 | Frontend index.html + app.js (botón borrar) | ⏳ Pendiente |
| F4 | Frontend residente.html + residente.js | ⏳ Pendiente |
| F5 | Deploy Apps Script V13 | ⏳ Pendiente |
| F6 | Manual HTML actualización | ⏳ Pendiente |
| F7 | Docs finales + push + verificación | ⏳ Pendiente |
| F8 | QR generation script (opcional) | ⏳ Pendiente |

---

## 9. Riesgos validados

| ID | Riesgo | Mitigación |
|---|---|---|
| R1 | Concurrencia al auto-registrarse | LockService + verificación server-side |
| R2 | CC mal escrita por propietario | Admin puede corregir desde `admin.html` |
| R3 | Botón borrar accidental | Modal con texto exacto + lista de secciones |
| R6 | Datos borrados sin undo | `Logger.log` con timestamp + numForm + slot |
| R7 | Residente anterior "fantasma" | UI avisa claramente si ya hay residentes |

---

## 10. Próximos pasos

1. Operador (Fabio) aprueba el spec
2. Implementar F2 (backend) — requiere OK antes
3. Implementar F3 + F4 (frontend)
4. Deploy F5 (Apps Script V13)
5. Manual F6 + docs F7
6. Opcional F8: script generar_qr_residente.py para imprimir QRs por apartamento

---

## 11. Decisiones del operador (confirmadas 25-Sept-2026)

- **D1** Portal nuevo `residente.html`
- **D2** QR genérico por apartamento
- **D3** El residente se AUTOREGISTRA si el apto está vacío
- **D4** Edición del residente: apto + CC
- **D5** "los dueños ni las inmobiliarias quieren hacer esto entonces envía el qr para que los nuevos lo llenen" — el QR es la herramienta principal
- **D6** Texto del botón: literal "borrado de datos residente" (en minúsculas)
- **D7** Modal: "Esto borrará los residentes y vehículos del apartamento. ¿Confirmas?" (texto exacto)
- **D8** Botón BORRA TODO: secciones 5, 5.1, 6, 7, 9, 10
- **D9** Solo propietario/inmobiliaria puede borrar (valida CC del propietario)
- **D10** Residente NO tiene botón borrar