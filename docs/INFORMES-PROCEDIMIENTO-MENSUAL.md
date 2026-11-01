# Informes contables: procedimiento mensual para el agente

Uso: cada mes, cuando la administración entregue el archivo `informes.json` actualizado y el enlace de Drive del informe del mes. La página `informes.html` y el código **no se tocan**.

## Entradas que debe recibir el agente

1. `informes.json` completo (reemplaza al actual; trae el mes nuevo primero).
2. El enlace de Google Drive del PDF **versión para propietarios** del mes (empieza por `https://drive.google.com/`).
3. El mes, en formato `AAAA-MM` (por ejemplo `2026-10`).

Si falta cualquiera de las tres, el agente se detiene y la pide.

## Reglas

1. Solo se modifica `data/informes.json`. Ningún otro archivo.
2. Dentro del JSON, el agente solo puede cambiar el campo `pdf` del mes nuevo (para poner el enlace de Drive). No cambia cifras, textos ni otros meses.
3. Nunca se sube un PDF al repositorio (el `.gitignore` lo impide; no se fuerza con `git add -f`).
4. Si `npm test` falla, no se publica. Se reporta el error literal a la administración.
5. Un solo commit por mes, sin `push --force`.

## Pasos

```bash
git checkout main && git pull
cp /ruta/recibida/informes.json data/informes.json
```

Abrir `data/informes.json`, buscar el bloque cuyo `"id"` es el mes recibido y reemplazar su valor de `"pdf"` por el enlace de Drive recibido. Verificar:

```bash
grep -n '"id": "AAAA-MM"' data/informes.json          # debe aparecer una vez
node -e "const d=require('./data/informes.json');const m=d.meses.find(x=>x.id==='AAAA-MM');console.log(m.nombre,m.pdf)"
npm test                                                # debe terminar en verde
git add data/informes.json
git commit -m "INF: informe contable AAAA-MM"
git push
```

Esperar 2 a 3 minutos y comprobar la publicación:

```bash
curl -s "https://fabig76.github.io/cerro-azul-residentes/data/informes.json?t=$(date +%s)" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);console.log(d.meses.map(m=>m.id).join(', '))})"
```

El primer id de la lista debe ser el mes nuevo.

## Cambio de año (enero)

Lo prepara la administración con Claude: el JSON de enero trae el presupuesto del año nuevo, los meses del año anterior pasan a la lista `archivo` (solo nombre, resumen y enlace) y `mesesAcum` vuelve a 1. El agente sigue los mismos pasos; `npm test` rechaza el archivo si se mezclan años.

## Reporte que entrega el agente

- Mes publicado y hash del commit.
- Salida de `npm test` (número de pruebas pasadas).
- Lista de ids que devolvió el `curl` final.
- Cualquier desviación de estos pasos.
