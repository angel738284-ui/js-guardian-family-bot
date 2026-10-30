/** Solo datos públicos de inscripciones. No necesita llaves de Epinby ni service_role. */
const LIST_URL="https://chfshxlykvmovwryjnxi.supabase.co/functions/v1/js-torneos-public-list";
const INSCRIPTION_URL="https://angel738284-ui.github.io/js-torneos/inscripcion.html?codigo=";
export interface PublicTournament {
  code:string;name:string;mode:string;team_size:number;max_teams:number;
  registered:number|null;starts_at:string|null;br_format:string|null;
  prize_kind:string|null;prize_quantity:number|null;
}
function safe(value:unknown,max=80):string {
  return String(value??"").replace(/[\r\n*_~`]/g," ").replace(/https?:\/\/\S+/ig,"").trim().slice(0,max);
}
function validTournament(item:unknown):item is PublicTournament {
  if(!item||typeof item!=="object")return false;
  const t=item as Partial<PublicTournament>;
  return typeof t.code==="string" && /^JS-[A-F0-9]{8}$/.test(t.code)
    && typeof t.name==="string" && t.name.length>0
    && typeof t.mode==="string" && Number.isInteger(t.max_teams)
    && (t.registered===null || (typeof t.registered==="number" && Number.isInteger(t.registered) && t.registered>=0))
    && typeof t.team_size==="number";
}
export async function loadPublicTournaments():Promise<PublicTournament[]> {
  const response=await fetch(LIST_URL,{headers:{"accept":"application/json"},signal:AbortSignal.timeout(12_000)});
  if(!response.ok) throw new Error("No se pudo consultar la lista de torneos.");
  const data=await response.json() as {tournaments?:unknown};
  if(!Array.isArray(data?.tournaments)) throw new Error("La respuesta de torneos no es válida.");
  return data.tournaments.filter(validTournament).slice(0,12);
}
function dateArgentina(input:string|null):string {
  if(!input)return "Fecha a confirmar";
  const d=new Date(input);
  if(!Number.isFinite(d.getTime()))return "Fecha a confirmar";
  return new Intl.DateTimeFormat("es-AR",{
    timeZone:"America/Argentina/Buenos_Aires",
    day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false,
  }).format(d)+" hs (Argentina)";
}
export function formatPublicTournaments(items:PublicTournament[]):string {
  if(!items.length)return "🏆 *JS TORNEOS*\n\nPor ahora no hay torneos con inscripciones abiertas. Consultá más tarde.";
  const text=["🏆 *JS TORNEOS · INSCRIPCIONES ABIERTAS*",""];
  for(const t of items) {
    const full=t.registered!==null&&t.max_teams>0&&t.registered>=t.max_teams;
    const count=t.registered===null?"Cupos por consultar":`${t.registered}/${t.max_teams} cupos`;
    const kind=t.mode==="BR" && t.br_format?"BR "+safe(t.br_format,20):safe(t.mode,20);
    text.push(
      "🎮 *"+safe(t.name)+"*",
      "⚔️ Modo: "+kind+(t.mode!=="BR"?" · "+t.team_size+" vs "+t.team_size:""),
      "📅 "+dateArgentina(t.starts_at),
      "👥 "+count+(full?" · 🔴 COMPLETO":" · 🟢 Inscripciones abiertas"),
      t.prize_kind && t.prize_quantity
        ?"🎁 Premio: "+t.prize_quantity+" "+safe(t.prize_kind,25):"",
      "📝 Inscripción: "+INSCRIPTION_URL+encodeURIComponent(t.code),
      "",
    );
  }
  text.push("ℹ️ Los cupos se actualizan al consultar. Si están completos, el enlace indicará si hay lista de espera.");
  return text.join("\n").replace(/\n{3,}/g,"\n\n").trim();
}
