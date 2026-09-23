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

Última actualización: 23-Sept-2026
Mantenedor: Hermes Agent + Fabio Lesmes (operador)
