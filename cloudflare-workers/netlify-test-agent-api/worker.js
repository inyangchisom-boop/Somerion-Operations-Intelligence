import { handleAutonomyRequest } from "./autonomy.js";
const PROJECT_ID="somerion-oi-testing";
const ALLOWED_ORIGIN="https://somerion-operations-intelligence.netlify.app";
function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type,Idempotency-Key","Access-Control-Max-Age":"86400","Vary":"Origin","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Strict-Transport-Security":"max-age=31536000"}})}
function decode(v){return Uint8Array.from(atob(v.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(v.length/4)*4,"=")),c=>c.charCodeAt(0))}
async function authenticate(request){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))throw new Error("Authentication required.");
 const p=h.slice(7).split(".");if(p.length!==3)throw new Error("Invalid token.");
 const head=JSON.parse(new TextDecoder().decode(decode(p[0]))),claims=JSON.parse(new TextDecoder().decode(decode(p[1]))),now=Math.floor(Date.now()/1000);
 if(head.alg!=="RS256"||!head.kid||claims.aud!==PROJECT_ID||claims.iss!=="https://securetoken.google.com/"+PROJECT_ID||typeof claims.sub!=="string"||!claims.sub||claims.sub.length>128||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||claims.email_verified!==true)throw new Error("Invalid, expired, or unverified testing account token.");
 const res=await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",{cf:{cacheTtl:300,cacheEverything:true}});if(!res.ok)throw new Error("Firebase keys unavailable.");
 const keys=await res.json(),jwk=keys.keys?.find(k=>k.kid===head.kid);if(!jwk)throw new Error("Unrecognized Firebase signing key.");
 const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
 if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,decode(p[2]),new TextEncoder().encode(p[0]+"."+p[1])))throw new Error("Invalid token signature.");
 return claims.sub;
}
async function enforceRateLimit(env,uid,scope,limit){const now=Date.now(),minute=Math.floor(now/60000),bucket=scope+":"+minute,resetAt=(minute+1)*60000;const row=await env.DB.prepare("INSERT INTO request_limits(uid,bucket,count,reset_at) VALUES(?,?,1,?) ON CONFLICT(uid,bucket) DO UPDATE SET count=count+1,reset_at=excluded.reset_at RETURNING count").bind(uid,bucket,resetAt).first();if(minute%10===0&&now%60000<5000)await env.DB.prepare("DELETE FROM request_limits WHERE reset_at<?").bind(now).run();return !!row&&row.count<=limit}
async function bodyWithinLimit(request,maxBytes){const reader=request.clone().body?.getReader();if(!reader)return true;let total=0;while(true){const part=await reader.read();if(part.done)return true;total+=part.value.byteLength;if(total>maxBytes){reader.cancel().catch(()=>{});return false}}}
function iso(){return new Date().toISOString()}
export default {async fetch(request,env){
 const origin=request.headers.get("Origin");if(origin&&origin!==ALLOWED_ORIGIN)return new Response("Origin not allowed",{status:403});
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type,Idempotency-Key","Access-Control-Max-Age":"86400","Vary":"Origin","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Strict-Transport-Security":"max-age=31536000"}});
 const url=new URL(request.url),path=url.pathname;
 if(path==="/health"&&request.method==="GET")return response({ok:true,service:"somerion-netlify-test-agent-api",environment:"isolated-test",firebaseProject:PROJECT_ID});
 if(!path.startsWith("/v1/"))return response({error:"Not found"},404);
 const ip=request.headers.get("CF-Connecting-IP")||"unknown";
 if(!await enforceRateLimit(env,"ip:"+ip,"agent-preauth",60))return response({error:"Rate limit reached. Please wait before trying again."},429);
 let uid;try{uid=await authenticate(request)}catch{return response({error:"Authentication required. Sign in with a verified testing account."},401)}
 try{
  if(["POST","PUT","PATCH"].includes(request.method)){
   const type=request.headers.get("Content-Type")||"",declared=Number(request.headers.get("Content-Length")||0);
   if(!type.toLowerCase().startsWith("application/json"))return response({error:"Content-Type must be application/json."},415);
   if(declared>16384)return response({error:"Request body is too large."},413);
   if(!await bodyWithinLimit(request,16384))return response({error:"Request body is too large."},413);
  }
  const scope=path==="/v1/assistant/chat"?"agent-ai":"agent-api",limit=scope==="agent-ai"?10:60;
  if(!await enforceRateLimit(env,uid,scope,limit))return response({error:"Rate limit reached. Please wait before trying again."},429);
  const autonomyResponse=await handleAutonomyRequest(request,env,uid,path);if(autonomyResponse)return autonomyResponse;
  if(path==="/v1/tasks"&&request.method==="GET"){
   const {results=[]}=await env.DB.prepare("SELECT id,title,details,status,due_at,created_at,updated_at FROM agent_tasks WHERE uid=? ORDER BY created_at DESC LIMIT 100").bind(uid).all();
   return response({tasks:results});
  }
  if(path==="/v1/tasks"&&request.method==="POST"){
   const b=await request.json();const title=String(b.title||"").trim(),details=String(b.details||"").trim(),due=b.due_at?new Date(b.due_at):null;
   if(!title||title.length>160||details.length>2000|| (due&&Number.isNaN(due.getTime())))return response({error:"Enter a task title (max 160 characters), valid details, and a valid due date."},400);
   const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM agent_tasks WHERE uid=?").bind(uid).first();
   if((count?.total||0)>=200)return response({error:"Your testing workspace has reached its 200-task limit."},429);
   const id=crypto.randomUUID(),now=iso();await env.DB.prepare("INSERT INTO agent_tasks(id,uid,title,details,status,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,uid,title,details,"open",due?due.toISOString():null,now,now).run();
   return response({task:{id,title,details,status:"open",due_at:due?due.toISOString():null,created_at:now,updated_at:now}},201);
  }
  if(path.startsWith("/v1/tasks/")&&request.method==="PATCH"){
   const id=decodeURIComponent(path.slice("/v1/tasks/".length)),b=await request.json(),status=b.status;
   if(!["open","in_progress","done"].includes(status))return response({error:"Invalid task status."},400);
   const result=await env.DB.prepare("UPDATE agent_tasks SET status=?,updated_at=? WHERE id=? AND uid=?").bind(status,iso(),id,uid).run();
   if(!result.meta?.changes)return response({error:"Task not found."},404);return response({ok:true});
  }
  if(path.startsWith("/v1/tasks/")&&request.method==="DELETE"){
   const id=decodeURIComponent(path.slice("/v1/tasks/".length)),result=await env.DB.prepare("DELETE FROM agent_tasks WHERE id=? AND uid=?").bind(id,uid).run();
   if(!result.meta?.changes)return response({error:"Task not found."},404);return response({ok:true});
  }
  if(path==="/v1/notifications"&&request.method==="GET"){
   const preference=await env.DB.prepare("SELECT reminders_enabled FROM agent_preferences WHERE uid=?").bind(uid).first();
   if(preference&&preference.reminders_enabled===0)return response({notifications:[]});
   const {results=[]}=await env.DB.prepare("SELECT id,message,created_at,read_at FROM agent_notifications WHERE uid=? ORDER BY created_at DESC LIMIT 50").bind(uid).all();
   return response({notifications:results});
  }
  if(path==="/v1/preferences"&&request.method==="GET"){
   const p=await env.DB.prepare("SELECT reminders_enabled FROM agent_preferences WHERE uid=?").bind(uid).first();
   return response({reminders_enabled:p?p.reminders_enabled===1:true});
  }
  if(path==="/v1/preferences"&&request.method==="PUT"){
   const b=await request.json();if(typeof b.reminders_enabled!=="boolean")return response({error:"reminders_enabled must be true or false."},400);
   await env.DB.prepare("INSERT INTO agent_preferences(uid,reminders_enabled,updated_at) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET reminders_enabled=excluded.reminders_enabled,updated_at=excluded.updated_at").bind(uid,b.reminders_enabled?1:0,iso()).run();
   return response({ok:true,reminders_enabled:b.reminders_enabled});
  }
  if(path==="/v1/assistant/chat"&&request.method==="POST"){
   const b=await request.json(),message=String(b.message||"").trim().toLowerCase();if(!message||message.length>4000)return response({error:"Enter a message up to 4,000 characters."},400);
   const {results:tasks=[]}=await env.DB.prepare("SELECT title,status,due_at FROM agent_tasks WHERE uid=? ORDER BY created_at DESC LIMIT 200").bind(uid).all();
   const now=Date.now(),open=tasks.filter(t=>t.status==="open"),progress=tasks.filter(t=>t.status==="in_progress"),done=tasks.filter(t=>t.status==="done"),overdue=tasks.filter(t=>t.status!=="done"&&t.due_at&&Date.parse(t.due_at)<now),dueSoon=tasks.filter(t=>t.status!=="done"&&t.due_at&&Date.parse(t.due_at)>=now&&Date.parse(t.due_at)<=now+86400000);
   let reply;
   if(/overdue|late|past due/.test(message))reply=overdue.length?"You have "+overdue.length+" overdue task(s): "+overdue.slice(0,5).map(t=>t.title).join("; ")+". Start with the task that has the greatest impact.":"You have no overdue tasks in your saved task list.";
   else if(/due soon|today|tomorrow|deadline/.test(message))reply=dueSoon.length?"You have "+dueSoon.length+" task(s) due within 24 hours: "+dueSoon.slice(0,5).map(t=>t.title).join("; ")+".":"No saved tasks are due within the next 24 hours.";
   else if(/done|complete|completed/.test(message))reply="You have completed "+done.length+" of "+tasks.length+" saved task(s).";
   else if(/next|priorit|start|focus/.test(message)){const candidates=[...overdue,...dueSoon,...open,...progress].filter((t,i,a)=>a.findIndex(x=>x.title===t.title)===i);reply=candidates.length?"Suggested next task: "+candidates[0].title+". It is "+(overdue.includes(candidates[0])?"overdue":dueSoon.includes(candidates[0])?"due within 24 hours":candidates[0].status==="in_progress"?"already in progress":"open")+".":"Your task list is clear. Add a task when new work comes in."}
   else reply="Your saved task summary: "+tasks.length+" total; "+open.length+" open; "+progress.length+" in progress; "+done.length+" completed; "+overdue.length+" overdue; "+dueSoon.length+" due within 24 hours. Ask me about overdue tasks, due dates, completed work, or what to focus on next.";
   return response({reply,source:"saved_tasks",aiModelEnabled:false});
  }
  return response({error:"Endpoint not found."},404);
 }catch(e){return response({error:"The testing service encountered an internal error."},500)}
 },async scheduled(controller,env){
  const now=iso(),soon=new Date(Date.now()+86400000).toISOString();
  const {results=[]}=await env.DB.prepare("SELECT t.id,t.uid,t.title,t.due_at,COALESCE(p.reminders_enabled,1) AS reminders_enabled FROM agent_tasks t LEFT JOIN agent_preferences p ON p.uid=t.uid WHERE t.status!='done' AND t.due_at IS NOT NULL AND t.due_at<=? ORDER BY t.due_at ASC LIMIT 500").bind(soon).all();
  for(const task of results){
   if(task.reminders_enabled===0)continue;
   const message=(Date.parse(task.due_at)<Date.now()?"Overdue: ":"Due soon: ")+task.title;
   const id=task.id+":due:"+task.due_at;
   await env.DB.prepare("INSERT OR IGNORE INTO agent_notifications(id,uid,task_id,message,created_at) VALUES(?,?,?,?,?)").bind(id,task.uid,task.id,message,now).run();
  }
 }};