const a=require('./out/antes/estado.json'), d=require('./out/'+(process.argv[2]||'despues')+'/estado.json');
let fallos=0;
for(const k of Object.keys(a)){
  if(/:portada$/.test(k)) continue; // la portada cambia de contenido a propósito
  const x=a[k], y=d[k]; if(!y){console.log('FALTA',k);fallos++;continue;}
  const difIds=Object.keys(x.ids).filter(i=>x.ids[i]!==y.ids[i]);
  const faltan=Object.keys(x.ids).filter(i=>!(i in y.ids));
  const nuevosTap=y.tapados.filter(t=>!x.tapados.includes(t));
  const yaNoTap=x.tapados.filter(t=>!y.tapados.includes(t));
  const nuevosErr=y.errores.filter(e=>!x.errores.includes(e));
  const prob=[];
  if(difIds.length)prob.push('visibilidad distinta: '+difIds.join(', '));
  if(faltan.length)prob.push('ids desaparecidos: '+faltan.join(', '));
  if(nuevosTap.length)prob.push('controles tapados nuevos: '+nuevosTap.join(' | '));
  if(y.atrapa.length)prob.push('modal atrapado: '+y.atrapa.join(' | '));
  if(y.desborde>x.desborde)prob.push('desborde horizontal '+x.desborde+' -> '+y.desborde);
  if(nuevosErr.length)prob.push('errores nuevos: '+nuevosErr.join(' | '));
  if(prob.length){fallos++;console.log('✗',k,'\n   '+prob.join('\n   '));}
  else console.log('✓',k,yaNoTap.length?'(destapados: '+yaNoTap.length+')':'');
}
for(const k of Object.keys(d)) if(!a[k]) { const y=d[k]; console.log('nuevo',k,'tap',y.tapados.length,'atr',y.atrapa.length,'desb',y.desborde,'err',y.errores.length, y.tapados.slice(0,4).join(' | '), y.errores.join(' | ')); }
console.log(fallos?('\n'+fallos+' estados con diferencias'):'\nPARIDAD COMPLETA');
