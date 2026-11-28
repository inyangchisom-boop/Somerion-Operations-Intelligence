const PROJECT_ID = "somerion-oi-testing";
const ALLOWED_ORIGIN = "https://somerion-operations-intelligence.netlify.app";
const PROVIDERS = [
  {id:"shopify",name:"Shopify",auth:"oauth2"},
  {id:"woocommerce",name:"WooCommerce",auth:"api_key"},
  {id:"paypal",name:"PayPal",auth:"oauth2"},
  {id:"bigcommerce",name:"BigCommerce",auth:"oauth2"},
  {id:"adobe-commerce",name:"Adobe Commerce",auth:"api_key"},
  {id:"wix",name:"Wix Stores",auth:"oauth2"},
  {id:"squarespace",name:"Squarespace Commerce",auth:"oauth2"},
  {id:"quickbooks",name:"QuickBooks Online",auth:"oauth2"},
  {id:"xero",name:"Xero",auth:"oauth2"},
  {id:"zoho-books",name:"Zoho Books",auth:"oauth2"},
  {id:"stripe",name:"Stripe",auth:"api_key"},
  {id:"instagram",name:"Instagram",auth:"oauth2"},
  {id:"facebook-pages",name:"Facebook Pages",auth:"oauth2"},
  {id:"tiktok",name:"TikTok",auth:"oauth2"}
];
const EVENTS = new Set(["login","logout","account_created","page_view","record_created","record_updated","record_deleted","integration_connect_attempt","integration_disconnected","integration_sync","task_created","task_updated","task_deleted","password_reset_requested","settings_updated"]);
const DETAIL_KEYS = new Set(["operation","entity","provider","page","result","recordType","status","count"]);
function json(data,status=200,origin=ALLOWED_ORIGIN){
  return new Response(JSON.stringify(data),{status,headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Access-Control-Allow-Origin":origin,
    "Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":"Authorization,Content-Type",
    "Vary":"Origin",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Strict-Transport-Security":"max-age=31536000"
  }});
}
function b64url(input){return Uint8Array.from(atob(input.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(input.length/4)*4,"=")),c=>c.charCodeAt(0));}
async function verifyFirebaseToken(token){
  const parts=token.split(".");
  if(parts.length!==3)throw new Error("Invalid bearer token.");
  const header=JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  const claims=JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  if(header.alg!=="RS256"||!header.kid)throw new Error("Unsupported token.");
  const now=Math.floor(Date.now()/1000);
  if(claims.aud!==PROJECT_ID||claims.iss!=="https://securetoken.google.com/"+PROJECT_ID)throw new Error("Token belongs to a different Firebase project.");
  if(typeof claims.sub!=="string"||!claims.sub||claims.sub.length>128)throw new Error("Invalid user identity.");
  if(!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60)throw new Error("Expired or invalid token.");
  if(claims.email_verified!==true)throw new Error("Verify your email before using the testing API.");
  const keyResponse=await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",{cf:{cacheTtl:300,cacheEverything:true}});
  if(!keyResponse.ok)throw new Error("Firebase signing keys are temporarily unavailable.");
  const jwks=await keyResponse.json();
  const jwk=jwks.keys?.find(k=>k.kid===header.kid);
  if(!jwk)throw new Error("Token signing key was not recognized.");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64url(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
  if(!valid)throw new Error("Token signature is invalid.");
  return {uid:claims.sub,email:typeof claims.email==="string"?claims.email:null};
}
async function bodyWithinLimit(request,maxBytes){const reader=request.clone().body?.getReader();if(!reader)return true;let total=0;while(true){const part=await reader.read();if(part.done)return true;total+=part.value.byteLength;if(total>maxBytes){reader.cancel().catch(()=>{});return false}}}
async function enforceRateLimit(env,uid,scope,limit){const now=Date.now(),minute=Math.floor(now/60000),bucket=scope+":"+minute,reset=(minute+1)*60000;const row=await env.DB.prepare("INSERT INTO request_limits(uid,bucket,count,reset_at) VALUES(?,?,1,?) ON CONFLICT(uid,bucket) DO UPDATE SET count=count+1,reset_at=excluded.reset_at RETURNING count").bind(uid,bucket,reset).first();if(minute%10===0&&now%60000<5000)await env.DB.prepare("DELETE FROM request_limits WHERE reset_at<?").bind(now).run();return !!row&&row.count<=limit}
function safeDetails(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  const out={};
  for(const [key,val] of Object.entries(value)){
    if(!DETAIL_KEYS.has(key))continue;
    if(typeof val==="string")out[key]=val.slice(0,120);
    else if(typeof val==="number"&&Number.isFinite(val))out[key]=val;
    else if(typeof val==="boolean")out[key]=val;
  }
  return out;
}
export default {
 async fetch(request,env){
  const origin=request.headers.get("Origin");
  if(origin&&origin!==ALLOWED_ORIGIN)return new Response("Origin not allowed",{status:403,headers:{"Vary":"Origin"}});
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{
    "Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":"Authorization,Content-Type","Access-Control-Max-Age":"86400","Vary":"Origin","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Strict-Transport-Security":"max-age=31536000"
  }});
  const url=new URL(request.url),path=url.pathname;
  if(path==="/health"&&request.method==="GET")return json({ok:true,service:"somerion-netlify-test-integration-api",environment:"isolated-test",firebaseProject:PROJECT_ID,testOnly:true,providerActionsEnabled:false});
  if(!path.startsWith("/api/"))return json({error:"Not found"},404);
  const ip=request.headers.get("CF-Connecting-IP")||"unknown";
  if(!await enforceRateLimit(env,"ip:"+ip,"integration-preauth",60))return json({error:"Rate limit reached. Please wait before trying again."},429);
  let identity;
  try{
    const authorization=request.headers.get("Authorization")||"";
    if(!authorization.startsWith("Bearer "))return json({error:"Authentication required."},401);
    identity=await verifyFirebaseToken(authorization.slice(7));
  }catch{return json({error:"Authentication required. Sign in with a verified testing account."},401);}
  try{
   if(["POST","PUT","PATCH","DELETE"].includes(request.method)){
     if(request.method!=="DELETE"){
       const type=request.headers.get("Content-Type")||"",declared=Number(request.headers.get("Content-Length")||0);
       if(!type.toLowerCase().startsWith("application/json"))return json({error:"Content-Type must be application/json."},415);
       if(declared>16384||!await bodyWithinLimit(request,16384))return json({error:"Request body is too large."},413);
     }
   }
   if(!await enforceRateLimit(env,identity.uid,"integration-api",60))return json({error:"Rate limit reached. Please wait before trying again."},429);
  if(path==="/api/integrations"&&request.method==="GET"){
    return json({testOnly:true,environment:"isolated-test",providers:PROVIDERS.map(p=>({...p,configured:false,connected:false}))});
  }
  if(path==="/api/connections/woocommerce"&&request.method==="GET")return json({connected:false,provider:"woocommerce",testOnly:true});
  if(path==="/api/activity"&&request.method==="POST"){
    let body;try{body=await request.json()}catch{return json({error:"Invalid JSON body."},400);}
    if(!body||!EVENTS.has(body.eventType))return json({error:"Unsupported activity event."},400);
    const now=Date.now(),bucket=String(Math.floor(now/60000)),reset=now+60000;
    const rate=await env.DB.prepare("INSERT INTO request_limits(uid,bucket,count,reset_at) VALUES(?,?,1,?) ON CONFLICT(uid,bucket) DO UPDATE SET count=count+1,reset_at=excluded.reset_at RETURNING count").bind(identity.uid,bucket,reset).first();
    if((rate?.count||0)>60)return json({error:"Activity rate limit reached. Try again shortly."},429);
    const details=safeDetails(body.details);
    await env.DB.prepare("INSERT INTO activity_events(id,uid,event_type,details_json,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),identity.uid,body.eventType,JSON.stringify(details),new Date().toISOString()).run();
    return json({ok:true,recorded:true});
  }
  if(path==="/api/connections/woocommerce"&&request.method==="POST")return json({error:"WooCommerce sandbox connection is not enabled yet. No credentials were stored."},409);
  if(path==="/api/integrations/paypal/connect"&&request.method==="POST")return json({error:"PayPal Sandbox adapter is not enabled yet. No credentials were stored."},409);
  if(path==="/api/sync/paypal"||path==="/api/sync/woocommerce")return json({error:"Provider sandbox adapter is not ready. No external requests were made."},409);
  if(path.startsWith("/api/integrations/")&&request.method==="POST")return json({error:"Provider authorization is disabled in the isolated test environment until its OAuth adapter is verified."},409);
  if(path.startsWith("/api/integrations/")&&request.method==="DELETE")return json({ok:true,disconnected:false});
  return json({error:"Endpoint not available in isolated testing API."},404);
  }catch(error){console.error("integration_api_request_failed",{path,errorName:error?.name||"Error"});return json({error:"The testing service encountered an internal error."},500);}
 }
};