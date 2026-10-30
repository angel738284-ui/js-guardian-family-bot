/** Clasificador conservador: sin llamadas a IA ni gasto de créditos.
 *  No actúa ante una mala palabra aislada como si fuese acoso. */
export type BrainFinding="attack"|"profanity"|"threat"|null;

function normalize(text:string):string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9@\s]/g," ").replace(/\s+/g," ").trim();
}
const insults="(?:pelotud[oa]s?|bolud[oa]s?|pendej[oa]s?|put[oa]s?|idiotas?|tarad[oa]s?|imbeciles?|inutiles?|estupid[oa]s?|basuras?|gil(?:es)?|forr[oa]s?|mierdas?)";
const slur=new RegExp("\\b"+insults+"\\b","i");
const negated=new RegExp("\\b(?:no|nunca|jamas)\\s+(?:sos|eres|es)\\s+(?:(?:un|una|re|tan|alto|alta)\\s+){0,2}"+insults+"\\b","i");
const directPatterns=[
  new RegExp("\\b(?:sos|eres|sois)\\s+(?:(?:un|una|alto|alta|re|tremendo|tremenda)\\s+){0,3}"+insults+"\\b","i"),
  new RegExp("\\b(?:que|alto|alta|re|tremendo|tremenda|terrible)\\s+"+insults+"\\s+(?:sos|eres|es)\\b","i"),
  new RegExp("\\b(?:js|el lider|el lider de js family|jota ese)\\b.{0,48}\\b"+insults+"\\b","i"),
  new RegExp("\\b"+insults+"\\b.{0,25}\\b(?:sos|eres|js|el lider)\\b","i"),
  /\b(?:callate (?:\w+ ){0,2}pelotudo|cerra el orto|andate a la mierda|anda a cagar|chupame un huevo)\b/,
];
const threat=/\b(?:te voy a matar|te voy a pegar|te rompo la cara|te cago a pi[nñ]as|te voy a reventar)\b/;
const profanity=/\b(?:puta madre|la concha|la puta|a la mierda|mierda|pelotudo|pelotuda|boludo|boluda|pendejo|pendeja|puto|puta|tarado|tarada|forro|forra|carajo)\b/;

/** Excluye mensajes citados sin texto propio de acoso, comandos, URLs y negaciones obvias. */
export function classifyGroupMessage(raw:string):BrainFinding {
  if (!raw || raw.length>480 || /^\s*[#/.]/.test(raw) || /https?:\/\/|www\./i.test(raw))return null;
  const text=normalize(raw);
  if(!text)return null;
  if(/\b(?:no digas|no le digas|no insultes|dijo|me dijo|le dijo|lo que dijo|lo que dice|no me insultes|se dice|por que decis)\b/.test(text)&&!threat.test(text))return null;
  if(threat.test(text))return "threat";
  if(negated.test(text))return null;
  if(slur.test(text)&&directPatterns.some(p=>p.test(text)))return "attack";
  if(directPatterns[4]!.test(text))return "attack";
  if(/\b(?:el|la|un|una)\s+(?:admin|jugador|jugadora|lider|pibe|chico|chica)\s+(?:es|son)\s+(?:(?:un|una|alto|alta)\s+){0,2}(?:pelotudo|pelotuda|idiota|inutil|tarado|tarada)\b/.test(text))return "attack";
  if(profanity.test(text))return "profanity";
  return null;
}

/** Una palabra aislada puede ser un ataque si responde a otra persona.
 * Sin un destinatario verificable no presume acoso ni acumula sanciones. */
/** Palabra grosera aislada: intervenir con educación, SIN contar una infracción. */
export function isIsolatedRudeWord(raw:string):boolean {
  const clean=normalize(raw);
  return /^(?:pendej[oa]s?|put[oa]s?|tarad[oa]s?|idiotas?|imbeciles?|pelotud[oa]s?|forr[oa]s?)$/.test(clean);
}

export function classifyContextualReply(raw:string,hasRecipient:boolean):BrainFinding {
  if(!hasRecipient || !raw || raw.length>100 || /^\s*[#/.]/.test(raw))return null;
  const text=normalize(raw);
  const insult="(?:tarad[oa]s?|pelotud[oa]s?|bolud[oa]s?|pendej[oa]s?|put[oa]s?|idiotas?|imbeciles?|inutiles?|estupid[oa]s?|forr[oa]s?|manc[oa]s?|basuras?)";
  const expression=new RegExp("^(?:(?:que|re|alto|alta|tremendo|tremenda|sos|sos un|sos una)\\s+){0,2}"+insult+"(?:\\s+sos)?$","i");
  return expression.test(text)?"attack":null;
}
