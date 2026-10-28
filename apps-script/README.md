# Backend — Portal Cerro Azul

Archivo único del backend de Apps Script (`Codigo.gs`) que atiende los 7 portales
del Conjunto Cerro Azul PH (NIT 900.770.444, Bello/Niquía): formulario público,
portal del residente, vigilancia, administración, salón social, estado de cuenta
y cartera.

## Despliegue

El backend se publica como **nueva versión del despliegue existente** (nunca un
despliegue nuevo, para no cambiar la URL pública que usan los 7 portales):

1. Abrir el editor de Apps Script de producción.
2. Pegar el contenido de `Codigo.gs`.
3. Implementar → Administrar implementaciones → editar → **Nueva versión**.

El manifest (`appsscript.json`) define `executeAs: USER_DEPLOYING` y
`access: ANYONE_ANONYMOUS`.

## Acciones expuestas (48)

- actualizarResidente
- adminBorrarReservaMudanza
- adminBuscar
- adminCancelarReservaSalon
- adminGuardar
- adminListarReservasMudanzas
- adminListarReservasSalon
- adminLogin
- adminObtener
- adminVerComprobanteSalon
- cancelarMudanza
- cancelarReservaSalon
- chatAsistente
- clearResidente
- configurarTriggerExpiracion
- dispMudanzas
- dispSalon
- ecConsultar
- ecDescargarFactura
- ecFinalizarCarga
- ecIniciarCarga
- ecPazYSalvo
- ecSubirFacturas
- editarReservaSalon
- getEstadoResidente
- listarReservasMudanzasPorNumForm
- listarReservasPorApto
- logout
- lookup
- lookupMatApto
- lookupMatParq
- nextId
- ping
- registrarResidente
- reservarMudanza
- reservarSalon
- subirComprobanteSalon
- submit
- verificarAccesoSalon
- verificarPropietario
- verificarResidente
- vigilanteBuscarPorPlaca
- vigilanteCheckMudanza
- vigilanteLogin
- vigilanteVerMudanzas
- vigilanteVerReservasSalon
- vigilanteVerResidentes

## Diagnóstico

`GET ?action=ping` devuelve `{ ok: true, version, tz, hora }`. La versión se
cambia con cada despliegue (`VERSION_BACKEND`).

## Historial

Ver `git log -- apps-script/Codigo.gs`.
