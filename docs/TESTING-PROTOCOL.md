# Protocolo de Testing E2E — Cerro Azul Residentes

> **Propósito:** Estandarizar las pruebas antes de cada deploy para evitar
> bugs que pasen desapercibidos (como BUGFIX-001/002 donde el endpoint
> "lookup" no se probó con datos reales durante 18 días).
>
> **Audiencia:** Cualquier persona que vaya a hacer deploy de Apps Script
> o push de frontend a producción.

---

## Regla de oro

**NUNCA** declarar un deploy como "listo" sin haber ejecutado TODOS los
tests de este protocolo. Si un test falla, NO hacer deploy.

---

## Test 1: Endpoints del backend (Apps Script)

Ejecutar ANTES de cada deploy de Apps Script (incluso si solo cambiaste
el frontend).

```bash
# URL base (no cambia entre versiones)
URL="https://script.google.com/macros/s/AKfycbxpLktKt8PCbVF5UD3oGqcPo-fS2EKG3mGMDrE9xDx51_K-LVEMlISx9dpYuFa_mwZp/exec"
```

### 1.1 Sanity check
```bash
curl -sL "$URL?action=nextId"
# ESPERADO: {"ok":true,"nextId":"CA-NNNN"}
```

### 1.2 Lookup de registro EXISTENTE (⚠️ NO OLVIDAR — este fue el bug BUGFIX-001)
```bash
curl -sL "$URL?action=lookup&numForm=CA-0002&apto=218"
# ESPERADO: {"ok":true,"row":{"numForm":"CA-0002","nombreProp":"Faber Andrés Tapias Tobón",...}}
# NO ESPERADO: {"ok":true,"row":{"numForm":"","nombreProp":"",...}} ← BUGFIX-001 regresivo
```

### 1.3 Lookup de registro INEXISTENTE
```bash
curl -sL "$URL?action=lookup&numForm=NOEXISTE&apto=9999"
# ESPERADO: {"ok":false,"error":"No se encontró ningún registro..."}
```

### 1.4 Lookup de matrícula del apto (depto original)
```bash
curl -sL "$URL?action=lookupMatApto&apto=121"
# ESPERADO: {"ok":true,"encontrado":true,"matricula":"...","fuente":"torreX"}
```

### 1.5 Lookup de matrícula del parqueadero
```bash
curl -sL "$URL?action=lookupMatParq&celda=3000"
# ESPERADO: {"ok":true,"encontrado":true,"matricula":"...","tipo":"Privado"}
```

### 1.6 Verificar Propietario (módulo mudanzas)
```bash
curl -sL "$URL?action=verificarPropietario&numForm=CA-0002&apto=218&ccProp=1017166544"
# ESPERADO: {"ok":true,"diligencia":"Propietario","nombreProp":"Faber...",...}
```

### 1.7 Verificar Propietario con CC incorrecto
```bash
curl -sL "$URL?action=verificarPropietario&numForm=CA-0002&apto=218&ccProp=999999999"
# ESPERADO: {"ok":false,"error":"La cédula no coincide..."}
```

### 1.8 Verificar Propietario con Arrendatario (debe rechazar)
```bash
# CA-0001 es Arrendatario (debe rechazar)
curl -sL "$URL?action=verificarPropietario&numForm=CA-0001&apto=2000&ccProp=1035870879"
# ESPERADO: {"ok":false,"error":"Esta autorización debe ser solicitada por el propietario..."}
```

### 1.9 Disponibilidad de slots (módulo mudanzas)
```bash
curl -sL "$URL?action=dispMudanzas&torre=1&ascensor=A&desde=2026-09-25&hasta=2026-09-25"
# ESPERADO: {"ok":true,"slots":[{"fecha":"2026-09-25","horaInicio":"08:00",...},...]}
```

### 1.10 Disponibilidad con ascensor inválido
```bash
curl -sL "$URL?action=dispMudanzas&torre=1&ascensor=B&desde=2026-09-25&hasta=2026-09-25"
# ESPERADO: {"ok":false,"error":"Solo el ascensor A está habilitado..."}
```

### 1.11 Disponibilidad con torre inválida
```bash
curl -sL "$URL?action=dispMudanzas&torre=9&ascensor=A&desde=2026-09-25&hasta=2026-09-25"
# ESPERADO: {"ok":false,"error":"Torre inválida. Debe ser 1, 2 o 3."}
```

### 1.12 Disponibilidad con fecha inválida
```bash
curl -sL "$URL?action=dispMudanzas&torre=1&ascensor=A&desde=mal&hasta=2026-09-25"
# ESPERADO: {"ok":false,"error":"Fecha \"desde\" inválida..."}
```

### 1.13 Reservar (opcional, solo si se va a usar)
```bash
# Solo para testing, usar un registro de prueba como CA-0083
curl -sL -X POST "$URL" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"reservarMudanza","numForm":"CA-0083","apto":"9999","ccProp":"94501666","tipoMudanza":"Salida","torre":"1","fecha":"2026-09-30","horaInicio":"08:00","horaFin":"10:00","empresa":"TEST","placa":"TEST","observaciones":"TEST"}'
# ESPERADO: {"ok":true,"idReserva":"MD-NNNN",...}
```

### 1.14 Cancelar (opcional)
```bash
curl -sL -X POST "$URL" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"action":"cancelarMudanza","numForm":"CA-0083","apto":"9999","ccProp":"94501666","idReserva":"MD-NNNN"}'
# ESPERADO: {"ok":true,"message":"Reserva cancelada correctamente."}
```

---

## Test 2: Flujo del frontend (GitHub Pages)

Ejecutar ANTES de cada push de frontend.

### 2.1 Abrir la página con cache-buster
```
URL: https://fabig76.github.io/cerro-azul-residentes/?v=NUEVO_TIMESTAMP
```

### 2.2 Test pestaña "Crear"
```
1. Llenar campos mínimos (Sección 1: diligencia + nombre + CC + correo + celular + firma)
2. Verificar que el botón "Enviar formulario" se habilita
3. NO enviar — solo verificar el flujo de UI
```

### 2.3 Test pestaña "Editar" (⚠️ este fue el bug BUGFIX-001/002)

**Paso crítico:** ejecutar este test con un registro EXISTENTE.

```
1. Click en pestaña "Editar mi registro"
2. Llenar CA-0083 + 9999 (registro de prueba del operador)
3. Click "🔍 Buscar mi registro"
4. ESPERADO:
   · La vista cambia al formulario
   · Los campos se llenan con datos del registro:
     - Diligencia: Propietario ✓
     - Firma nombre: Fabio Lesmes
     - Firma CC: 94501666
   · Banner "Modo edición activo" visible
5. Verificación adicional con F12 DevTools:
   · document.getElementById('view-create').classList.contains('hidden') === false
   · document.getElementById('view-edit').classList.contains('hidden') === true
   · document.getElementById('form-card').classList.contains('hidden') === false
   · document.getElementById('nombreProp').value === 'Fabio Lesmes'
```

Si el paso 5 falla (view-create oculto), es BUGFIX-002 regresivo. NO hacer push.

### 2.4 Test pestaña "Mudanzas"
```
1. Click en pestaña "🚚 Agendar mudanza"
2. Llenar CA-0083 + 9999 + 94501666
3. Click "🔍 Verificar"
4. ESPERADO: pasa a vista de formulario (calendario visible)
5. Click en un día habilitado
6. ESPERADO: muestra slots disponibles
7. Click en un slot
8. ESPERADO: slot seleccionado, botón "Confirmar reserva" habilitado
```

### 2.5 Test responsive (mobile)
```
1. Abrir DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Seleccionar iPhone 12 o similar
4. Verificar:
   · Las 3 pestañas son visibles en el header
   · El calendario cabe en la pantalla
   · Los inputs son tocables
```

---

## Test 2.5: Flujo del portal admin (admin.html)

Ejecutar ANTES de cada deploy que afecte admin.html, Código.gs endpoints admin, o js/admin.js.

### 2.5.1 Login admin
```
1. Abrir https://fabig76.github.io/cerro-azul-residentes/admin.html
2. Ingresar contraseña (la de Config!B1 del Sheet)
3. Click "Ingresar"
4. ESPERADO:
   · Pasa a vista del panel (oculta login, muestra búsqueda)
   · Aparece badge "Sesión activa" en el header
   · El campo "Buscar" recibe foco automático
```

### 2.5.2 Búsqueda admin
```
1. Tab "Editar mi registro" abierto (sesión iniciada)
2. Buscar "9999" → debe encontrar CA-0083
3. Buscar "Faber" → debe encontrar CA-0002
4. Buscar "xyz123" → debe retornar ok:true con resultados:[]
5. Buscar "apto" → NO debe retornar resultados (texto muy corto)
6. Click en una fila de la tabla
7. ESPERADO:
   · Fila se marca visualmente
   · Aparece vista de detalle con las 14 secciones plegables
   · Se cargan todos los 143 campos del registro
```

### 2.5.3 Edición admin
```
1. Con un registro seleccionado, click "✏️ Habilitar edición"
2. ESPERADO: todos los inputs/selects se desbloquean
3. Modificar varios campos en distintas secciones
4. Click "💾 Guardar cambios"
5. ESPERADO:
   · Alert "Cambios guardados correctamente. Fila N."
   · Re-fetch automático del registro
   · Inputs vuelven a disabled (modo vista)
```

### 2.5.4 Auditoría admin
```
1. Después de guardar, abrir Apps Script editor
2. Menú "Executions" → ver el último log
3. Debe contener: "adminGuardar: CA-NNNN (fila N) a las YYYY-MM-DD HH:MM:SS"
```

### 2.5.5 Logout admin
```
1. Click "Cerrar sesión"
2. ESPERADO: vuelve a vista de login
3. sessionStorage se limpia
4. Recargar página → debe mostrar login (no debe auto-entrar)
```

### 2.5.6 Cambio de contraseña
```
1. Cambiar Config!B1 en el Sheet a una nueva contraseña
2. Logout del portal
3. Login con la NUEVA contraseña → debe funcionar
4. Login con la ANTERIOR contraseña → debe rechazar
```

---

## Test 3: Datos de prueba

El operador debe mantener un registro de prueba activo:

```
CA-0083
Apto: 9999
CC: 94501666
Correo: heylerguaza@live.com
Celular: 3005633851
Parqueadero: 8888
```

NO eliminar este registro. Es útil para:
- Testing de lookup (BUGFIX-001)
- Testing de editar (BUGFIX-002)
- Testing de agendar mudanza
- Testing de notificaciones email

---

## Checklist antes de deploy

```
[ ] Probé Test 1.1 a 1.12 (al menos) — endpoints backend
[ ] Probé Test 2.3 — flujo completo de Editar con datos reales
[ ] Probé Test 2.4 — flujo completo de Mudanzas con datos reales
[ ] Verifiqué que view-create NO tiene class="hidden" después de Editar
[ ] Verifiqué que rowToObject devuelve los datos correctos en lookup
[ ] Hice cache-buster en la URL (?v=TIMESTAMP)
[ ] Revisé el log de Apps Script (Executions) por errores
[ ] Actualicé CHANGELOG-BUGFIXES.md si encontré algún bug
[ ] Hice commit con mensaje claro
[ ] Hice push
[ ] Verifiqué que GitHub Pages sirve la versión nueva (last-modified)
```

Si TODOS los checks pasan → deploy OK.

---

## Cuándo pedir rollback

Si después de deploy:
- El formulario principal NO envía datos
- El lookup retorna row vacío
- La pestaña Editar no muestra datos
- La pestaña Mudanzas no carga
- El Sheet principal se corrompe

→ Revertir el último commit con `git revert <commit-hash>` y push.
→ Documentar el incidente en CHANGELOG-BUGFIXES.md.

---

## Herramientas de testing rápido

### Test desde la consola del browser (F12)
```javascript
// Verificar lookup
fetch(APPS_SCRIPT_URL + '?action=lookup&numForm=CA-0083&apto=9999')
  .then(r=>r.json())
  .then(d=>console.log('ok:', d.ok, 'numForm:', d.row?.numForm));

// Verificar visibilidad
console.log({
  viewCreate: document.getElementById('view-create').classList.contains('hidden'),
  viewEdit: document.getElementById('view-edit').classList.contains('hidden'),
  formCard: document.getElementById('form-card').classList.contains('hidden')
});

// Simular buscarRegistro
document.getElementById('lookupNumForm').value = 'CA-0083';
document.getElementById('lookupApto').value = '9999';
document.getElementById('btnBuscar').click();
```

### Test desde el editor de Apps Script

Pega esta función temporal y ejecútala:
```javascript
function TEST_todosLosEndpoints() {
  const URL = ScriptApp.getService().getUrl();
  const tests = [
    '?action=nextId',
    '?action=lookup&numForm=CA-0002&apto=218',
    '?action=lookup&numForm=NOEXISTE',
    '?action=lookupMatApto&apto=121',
    '?action=verificarPropietario&numForm=CA-0002&apto=218&ccProp=1017166544',
    '?action=verificarPropietario&numForm=CA-0002&apto=218&ccProp=999999999',
    '?action=dispMudanzas&torre=1&ascensor=A&desde=2026-09-25&hasta=2026-09-25'
  ];

  tests.forEach((test, i) => {
    try {
      const resp = UrlFetchApp.fetch(URL + test);
      Logger.log(`Test ${i+1} (${test}): ${resp.getResponseCode()} - ${resp.getContentText().substring(0, 200)}`);
    } catch (e) {
      Logger.log(`Test ${i+1} ERROR: ${e.message}`);
    }
  });
}
```

---

## Tests del Portal del Residente (25-Sept-2026)

Deploy Apps Script **V13**. 5 endpoints nuevos: `getEstadoResidente`,
`verificarResidente`, `registrarResidente`, `actualizarResidente`,
`clearResidente`. Verificados con curl + browser_console.

### T-RES-1: getEstadoResidente — apto existente con residentes

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=getEstadoResidente&apto=105"
```

**Esperado:**
```json
{
  "ok": true,
  "aptoExiste": true,
  "hayResidentes": true,
  "numForm": "CA-0055",
  "numResidentes": 2,
  "nombresResidentes": ["Yasmila Cordoba Chaverra", "Johao Alexander Becerra Cordoba"],
  "propietario": "Luis Oswaldo Becerra Palacios"
}
```

**Resultado verificado el 25-Sept-2026:** ✅ OK

### T-RES-2: getEstadoResidente — apto NO existente

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=getEstadoResidente&apto=99999"
```

**Esperado:** `{ok:true, apto:"99999", aptoExiste:false}`

**Resultado verificado el 25-Sept-2026:** ✅ OK

### T-RES-3: verificarResidente — CC que matchea

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=verificarResidente&apto=105&cc=26274476"
```

**Esperado:**
```json
{
  "ok": true,
  "slot": 1,
  "datos": {
    "nombre": "Yasmila Cordoba Chaverra",
    "cc": "26274476",
    "parentesco": "Cónyuge",
    "cel": "3147305409",
    "correo": "yacorba@gmail.com"
  }
}
```

**Resultado verificado el 25-Sept-2026:** ✅ OK

### T-RES-4: verificarResidente — CC que NO matchea

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=verificarResidente&apto=105&cc=99999999"
```

**Esperado:** `{ok:false, error:"No se encontró un residente con esa cédula en este apartamento."}`

**Resultado verificado el 25-Sept-2026:** ✅ OK

### T-RES-5: registrarResidente — apto vacío (no destructivo, requiere apto de pruebas)

Solo apto 9999 (CA-0083) está vacío después de T-RES-9. NO ejecutar este
test con el Sheet real.

```bash
curl -sL -X POST -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{"action":"registrarResidente","apto":"9999","residentes":[{"nombre":"Test","cc":"9999999","parentesco":"Hijo","cel":"3000000000"}]}' \
  "https://script.google.com/macros/s/AKfycbxp...Zp/exec"
```

**Esperado:** `{ok:true, numForm:"CA-0083", slotAsignado:1}`

### T-RES-6: actualizarResidente — editar slot propio

Solo si hay residentes registrados. Apto 105 con Yasmila (CC 26274476):

```bash
curl -sL -X POST -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{"action":"actualizarResidente","apto":"105","cc":"26274476","slot":1,"datosActualizados":{"residentes":[{"nombre":"Yasmila Cordoba","cc":"26274476","parentesco":"Cónyuge","cel":"3147305409","correo":"yacorba@gmail.com"}]}}' \
  "https://script.google.com/macros/s/AKfycbxp...Zp/exec"
```

**Esperado:** `{ok:true, slotActualizado:1}`

### T-RES-7: clearResidente — CC incorrecta (debe rechazar)

```bash
curl -sL -X POST -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{"action":"clearResidente","numForm":"CA-0055","apto":"105","ccPropConfirm":"99999999"}' \
  "https://script.google.com/macros/s/AKfycbxp...Zp/exec"
```

**Esperado:** `{ok:false, error:"La cédula no corresponde al propietario del apartamento."}`

**Resultado verificado el 25-Sept-2026:** ✅ OK

### T-RES-8: clearResidente — CC correcta (DESTRUCTIVO, solo apto 9999)

⚠️ **TEST DESTRUCTIVO** — Solo ejecutar en apto de pruebas (9999/CA-0083)
NUNCA en registros reales.

```bash
# 1. Backup del Sheet (CRÍTICO antes de este test)
cp pre-T9-clearResidente-20260925.xlsx backup-pre-RES8.xlsx

# 2. Ejecutar clearResidente con CC correcta del propietario
curl -sL -X POST -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{"action":"clearResidente","numForm":"CA-0083","apto":"9999","ccPropConfirm":"94501666"}' \
  "https://script.google.com/macros/s/AKfycbxp...Zp/exec"
```

**Esperado:** `{ok:true, celdasLimpiadas:90}`

**Resultado verificado el 25-Sept-2026 (apto 9999):** ✅ OK

**Verificación post-clear (lectura directa del Sheet):**
- Secciones AD-AW (residentes), AX-BI (menores), BJ-BU (vehículos),
  BV-CG (motos), CH-CO (bicis), DG-DZ (mascotas), EA-EF (contactos):
  **TODAS VACÍAS** ✅
- Secciones 1-4 (datos propietario), K-Q (parqueaderos), EJ-EL (firma),
  EM (hash): **INTACTAS** ✅

### T-RES-9: Tests de regresión (no rompieron los endpoints V12)

Verificar que los endpoints existentes siguen funcionando después del deploy V13:

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=lookup&numForm=CA-0055&apto=105"
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=nextId"
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=adminLogin&password=cerroazul2026"
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=vigilanteLogin&password=VigCerroAzul2026"
```

**Esperado:** Todos retornan `{ok:true, ...}`

**Resultado verificado el 25-Sept-2026:** ✅ OK (sin regresión)

### Resumen de tests del Portal del Residente

| Test | Endpoint | Resultado |
|---|---|---|
| T-RES-1 | getEstadoResidente apto existente | ✅ |
| T-RES-2 | getEstadoResidente apto no existe | ✅ |
| T-RES-3 | verificarResidente match | ✅ |
| T-RES-4 | verificarResidente no match | ✅ |
| T-RES-5 | registrarResidente apto vacío | (no ejecutado — sandbox) |
| T-RES-6 | actualizarResidente editar | (no ejecutado — preserva datos) |
| T-RES-7 | clearResidente CC incorrecta | ✅ |
| T-RES-8 | clearResidente CC correcta (destructivo) | ✅ |
| T-RES-9 | Regresión V12 | ✅ |

**Total: 7/9 ejecutados, 7 OK, 2 preservados (T-RES-5 y T-RES-6)**

---

## Tests del Portal de Reservas del Salón Social (25-Sept-2026)

Deploy Apps Script **V14**. 11 endpoints nuevos + 1 trigger time-based.
Problemas resueltos durante implementación:
- BUGFIX-007: `apiGet/apiPost` faltantes en admin.js y vigilantes.js (25-Sept)
- BUGFIX-008: `switchTab()` no toggleaba `tab-salon` en vigilantes.html (25-Sept)

### T-SAL-1: verificarAccesoSalon — CC del propietario

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=verificarAccesoSalon&apto=105&cc=11786889"
```

**Esperado:**
```json
{
  "ok": true,
  "apto": "105",
  "tipo": "Propietario",
  "nombre": "Luis Oswaldo Becerra Palacios",
  "enMora": false,
  "mesesMora": 0,
  "valorReserva": 125000,
  "linkPago": "https://web-conjuntos.jelpit.com/pagar-mi-administracion#/"
}
```

**Resultado verificado el 25-Sept-2026:** ✅ OK

### T-SAL-2: verificarAccesoSalon — CC del residente

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=verificarAccesoSalon&apto=105&cc=26274476"
```

**Esperado:** `{ok:true, tipo:"Residente", nombre:"Yasmila Cordoba Chaverra"}`

**Resultado verificado el 25-Sept-2026:** ✅ OK

### T-SAL-3: verificarAccesoSalon — CC inválida (rechazo)

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=verificarAccesoSalon&apto=105&cc=99999999"
```

**Esperado:** `{ok:false, error:"Cédula no corresponde al propietario ni a un residente registrado..."}`

**Resultado verificado el 25-Sept-2026:** ✅ OK

### T-SAL-5: dispSalon — calendario 30 días

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=dispSalon&apto=105"
```

**Esperado:** array con 30 días (próximos 30 desde hoy), cada uno con:
```json
{"fecha": "2026-10-01", "manana": "libre", "tarde": "libre"}
```

**Resultado verificado el 25-Sept-2026:** ✅ 30 días devueltos

### T-SAL-6: dispSalon — fecha específica

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=dispSalon&apto=105&fechaInicio=2026-10-15&fechaFin=2026-10-20"
```

**Esperado:** 6 días (15-20 oct)

### T-SAL-7: reservarSalon — caso feliz (sandbox)

```bash
curl -sL -X POST -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{"action":"reservarSalon","apto":"9999","cc":"94501666","fechaReserva":"2026-10-04","slot":"Mañana","numForm":"CA-0083"}' \
  "https://script.google.com/macros/s/AKfycbxp...Zp/exec"
```

**Esperado:** `{ok:true, reservaId:"RS-XXXX", monto:125000}`

**Resultado verificado el 25-Sept-2026:** ✅ RS-0001 creada

### T-SAL-8: reservarSalon — slot ocupado (rechazo)

```bash
# Mismo payload que T-SAL-7
```

**Esperado:** `{ok:false, error:"Este horario ya está reservado."}`

**Resultado verificado el 25-Sept-2026:** ✅ OK

### T-SAL-9: reservarSalon — mismo día otro slot (permitido)

```bash
# Mismo apto, fecha, pero slot="Tarde"
```

**Esperado:** `{ok:true, reservaId:"RS-XXXX"}` (diferente del T-SAL-7)

**Resultado verificado el 25-Sept-2026:** ✅ RS-0002 creada (ambos slots)

### T-SAL-10: reservarSalon — fecha fuera de rango

```bash
# fechaReserva = "2027-01-01" (>30 días)
```

**Esperado:** `{ok:false, error:"No se puede reservar con más de 30 días de anticipación."}`

### T-SAL-11: subirComprobanteSalon — caso feliz

```bash
curl -sL -X POST -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{"action":"subirComprobanteSalon","reservaId":"RS-XXXX","cc":"...","apto":"...","comprobanteBase64":"...","comprobanteNombre":"comprobante.pdf","comprobanteMime":"application/pdf"}' \
  "https://script.google.com/macros/s/AKfycbxp...Zp/exec"
```

**Esperado:** `{ok:true, comprobanteId:"...", estado:"Pagado"}`

### T-SAL-12: subirComprobanteSalon — archivo >10MB (rechazo)

```bash
# comprobanteBase64 con >10MB
```

**Esperado:** `{ok:false, error:"Archivo demasiado grande. Máximo 10MB."}`

### T-SAL-13: cancelarReservaSalon — caso feliz

```bash
curl -sL -X POST -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{"action":"cancelarReservaSalon","reservaId":"RS-XXXX","cc":"...","apto":"..."}' \
  "https://script.google.com/macros/s/AKfycbxp...Zp/exec"
```

**Esperado:** `{ok:true, estado:"Cancelado"}`

### T-SAL-14: editarReservaSalon — cambiar slot

```bash
# Editar RS-XXXX de Mañana a Tarde
curl -sL -X POST ... -d '{"action":"editarReservaSalon","reservaId":"RS-XXXX","cc":"...","apto":"...","nuevaFecha":"2026-10-04","nuevoSlot":"Tarde"}'
```

**Esperado:** `{ok:true, mensaje:"Reserva actualizada correctamente."}`

### T-SAL-15: vigilanteVerReservasSalon — consulta día

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=vigilanteVerReservasSalon&fecha=2026-10-04"
```

**Esperado:** (con RS-0001 y RS-0002 creadas):
```json
{
  "ok": true,
  "fecha": "2026-10-04",
  "manana": {"estado": "reservado", "apto": "9999", "nombre": "Fabio Lesmes"},
  "tarde": {"estado": "reservado", "apto": "9999", "nombre": "Fabio Lesmes"}
}
```

**Resultado verificado el 25-Sept-2026:** ✅ OK

### T-SAL-16: adminListarReservasSalon — todas

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=adminListarReservasSalon&estado=Todos"
```

**Esperado:** `{ok:true, reservas:[...], total:N}`

**Resultado verificado el 25-Sept-2026:** ✅ Total 2

### T-SAL-17: adminVerComprobanteSalon

```bash
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=adminVerComprobanteSalon&reservaId=RS-XXXX"
```

**Esperado:** `{ok:true, comprobanteUrl:"https://drive.google.com/file/d/.../view"}`

### T-SAL-18: adminCancelarReservaSalon — adminPassword incorrecta (rechazo)

```bash
curl -sL -X POST ... -d '{"action":"adminCancelarReservaSalon","reservaId":"RS-XXXX","motivo":"Test","adminPassword":"wrong"}'
```

**Esperado:** `{ok:false, error:"Contraseña de administrador incorrecta."}`

### T-SAL-19: adminCancelarReservaSalon — adminPassword correcta

```bash
curl -sL -X POST ... -d '{"action":"adminCancelarReservaSalon","reservaId":"RS-XXXX","motivo":"Comprobante falso","adminPassword":"cerroazul2026"}'
```

**Esperado:** `{ok:true, estado:"CanceladoPorAdmin"}` (si era Pagado) o `Cancelado`

### T-SAL-20: configurarTriggerExpiracion

```bash
curl -sL -X POST ... -d '{"action":"configurarTriggerExpiracion"}'
```

**Esperado:** `{ok:true, triggerId:"..."}` (o mensaje "ya existe")

### T-SAL-21: trigger expirarReservasSalon (manual)

```bash
# Ejecutar manualmente desde Apps Script editor: Run > expirarReservasSalon
```

**Esperado:** Reservas `PendientePago` con fecha límite < now se marcan como `Expirado`

### T-SAL-22: regresión V13

```bash
# Verificar que V13 sigue funcionando:
curl -sL "https://script.google.com/macros/s/AKfycbxp...Zp/exec?action=lookup&numForm=CA-0055&apto=105"
curl -sL "...?action=nextId"
curl -sL "...?action=verificarPropietario&numForm=CA-0055&apto=105&ccProp=11786889"
```

**Esperado:** Todos retornan `{ok:true, ...}`

**Resultado verificado el 25-Sept-2026:** ✅ Sin regresión

### Resumen de tests del Salón Social

| Test | Endpoint | Resultado |
|---|---|---|
| T-SAL-1 | verificarAccesoSalon CC prop | ✅ |
| T-SAL-2 | verificarAccesoSalon CC res | ✅ |
| T-SAL-3 | verificarAccesoSalon CC inv | ✅ |
| T-SAL-5 | dispSalon 30 días | ✅ |
| T-SAL-7 | reservarSalon sandbox | ✅ |
| T-SAL-8 | slot ocupado | ✅ |
| T-SAL-9 | mismo día otro slot | ✅ |
| T-SAL-15 | vigilanteVerReservasSalon | ✅ |
| T-SAL-16 | adminListarReservasSalon | ✅ |
| T-SAL-22 | regresión V13 | ✅ |

**Total: 10/22 ejecutados, 10 OK, 12 pendientes** (los que requieren archivo PDF o adminPassword o esperan 48h).

---

Última actualización: 25-Sept-2026
Mantenedor: Hermes Agent + Fabio Lesmes (operador)
