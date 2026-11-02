export type ReasoningEffort="low"|"medium"|"high";
const complicated=/\b(?:din[aá]mica|evento|torneo|purga|reglas?|premio|anuncio|borrador|correg[ií]|corregime|cambi[aá]|modific[aá]|torreta|ganador|inscripci[oó]n|equipo|revis[aá]|publicar|organizar|preparar|cre[aá]|arm[aá])\b/i;
const explain=/\b(?:por qu[eé]|c[oó]mo|explic[aá]|diferencia|compar[aá]|conviene|qu[eé] significa|ayud[aá]me|entend[eé]r|cu[aá]l|analiz[aá])\b/i;
export function selectReasoning(question:string,leader=false):ReasoningEffort{
 if(complicated.test(question))return "high";
 if(explain.test(question)||leader&&question.length>150)return "medium";
 return "low";
}
export function eventChecklist(original:string,correction=""):string{
 return "VERIFICACIÓN DE REGLAS (NO MOSTRAR): antes de responder extraé mentalmente: (1) objeto o lugar exacto, (2) condición precisa para ganar, (3) fecha y hora, (4) premio, (5) prohibiciones, (6) inscripción y participantes. Preservá la literalidad de lo indicado por JS. 'Torreta' NO significa 'torre'; 'el último que le dé' NO significa 'el último que sobreviva'. Si un dato no aparece, no lo inventes. Si es imprescindible, preguntá. Corrección reciente del dueño: "+JSON.stringify(correction.slice(0,500))+". Pedido original: "+JSON.stringify(original.slice(0,1400));
}
