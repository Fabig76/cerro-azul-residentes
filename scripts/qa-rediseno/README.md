# Pruebas de paridad del rediseño "vidrio"

Comprueban en un navegador real (Chromium) que la capa nueva no cambió el
comportamiento. **Nunca tocan el backend real**: toda la red está bloqueada y
las respuestas de Apps Script son simuladas.

Requiere Playwright (no está en `package.json` a propósito, para no cambiar la
instalación del proyecto): `npm i --no-save playwright && npx playwright install chromium`.

```bash
# 1. Copia intacta de la rama principal, para comparar
git worktree add ../base-sin-rediseno main

# 2. Estado "antes" y "después" (40 estados: 9 páginas × escritorio y celular + flujos)
node scripts/qa-rediseno/snap.js ../base-sin-rediseno antes
node scripts/qa-rediseno/snap.js . despues

# 3. Comparar. Debe terminar en "PARIDAD COMPLETA".
node scripts/qa-rediseno/compara.js

# 4. Flujos de lo nuevo. Debe terminar en "27 comprobaciones correctas, 0 fallidas".
node scripts/qa-rediseno/extra.js .
```

Qué compara `compara.js` en cada estado:

- que cada elemento con `id` esté visible u oculto igual que antes;
- que ningún botón, enlace o campo quede tapado por otro elemento;
- que ninguna ventana modal ni el asistente queden "atrapados" por un
  antepasado con desenfoque o transformación;
- que no aparezca desplazamiento horizontal ni errores nuevos de JavaScript.

Las capturas quedan en `scripts/qa-rediseno/out/` (ignorado por git).
