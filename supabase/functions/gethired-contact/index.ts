// Consent-limited contact interest. No resume or job applications.
const ORIGIN='https://gethired-platform.pages.dev', OWNER='sankalpjaiswal2006@gmail.com';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST,GET,DELETE,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type','Vary':'Origin'};
function reply(data:unknown,status=200,corsAllowed=true){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(corsAllowed?cors:{})}})}
function valid(s:unknown,min:number,max:number){return typeof s==='string' && s.trim().length>=min && s.trim().length<=max && !/[<>\x00-\x1f]/.test(s)}
function clean(s:string){return s.trim().replace(/\s+/g,' ')}
async function sha(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('')}
Deno.serve(async req=>{
 const allow=req.headers.get('Origin')===ORIGIN;
 if(!allow)return reply({error:'Unavailable'},403,false);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const base=Deno.env.get('SUPABASE_URL'), service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!base||!service||!anon)return reply({error:'Service unavailable'},503);
 const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 try{
  if(req.method==='GET'||req.method==='DELETE'){
   const bearer=req.headers.get('Authorization')||'';
   if(!/^Bearer [A-Za-z0-9._~-]+$/.test(bearer))return reply({error:'Owner sign-in required'},401);
   const r=await fetch(`${base}/auth/v1/user`,{headers:{apikey:anon,Authorization:bearer}});
   if(!r.ok)return reply({error:'Owner sign-in required'},401);
   const u=await r.json();
   if(u.email?.toLowerCase()!==OWNER||!u.email_confirmed_at)return reply({error:'Not allowed'},403);
   if(req.method==='DELETE'){
    let input:Record<string,unknown>;try{input=await req.json()}catch{return reply({error:'Invalid request'},400)}
    if(!['job_seeker','employer'].includes(input.kind as string)||!valid(input.email,5,180))return reply({error:'Invalid request'},400);
    const email=clean(input.email as string).toLowerCase();
    const removed=await fetch(`${base}/rest/v1/gh_contact_interest?kind=eq.${encodeURIComponent(input.kind as string)}&email=eq.${encodeURIComponent(email)}`,{method:'DELETE',headers:{...headers,Prefer:'return=representation'}});
    if(!removed.ok)return reply({error:'Could not remove'},503);
    return reply({removed:(await removed.json()).length});
   }
   const rows=await fetch(`${base}/rest/v1/gh_contact_interest?select=id,kind,full_name,company_name,contact_name,email,phone,role_family,experience_level,hiring_roles,created_at&order=created_at.desc&limit=100`,{headers});
   if(!rows.ok)return reply({error:'List unavailable'},503);
   return reply({submissions:await rows.json()});
  }
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  if(Number(req.headers.get('content-length')||0)>2048)return reply({error:'Too large'},413);
  const raw=await req.text();if(raw.length>2048)return reply({error:'Too large'},413);
  let p:Record<string,unknown>;try{p=JSON.parse(raw)}catch{return reply({error:'Invalid form'},400)}
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['kind','full_name','company_name','contact_name','email','phone','role_family','experience_level','hiring_roles','website','consent'].includes(k)))return reply({error:'Invalid form'},400);
  // Honeypot requests are acknowledged but never stored.
  if(p.website)return reply({received:true});
  if(p.consent!==true||!['job_seeker','employer'].includes(p.kind as string)||!valid(p.email,5,180)||!/^\S+@\S+\.\S+$/.test(p.email as string))return reply({error:'Check the required fields and consent'},400);
  const kind=p.kind as string, email=clean(p.email as string).toLowerCase();
  const fields=kind==='job_seeker' ? ['full_name','phone','role_family','experience_level']:['company_name','contact_name','hiring_roles'];
  if(fields.some(f=>!valid(p[f],2,f==='hiring_roles'?160:80)))return reply({error:'Check the required fields'},400);
  if(kind==='job_seeker'&&!/^[+\d ()-]{7,24}$/.test(p.phone as string))return reply({error:'Check phone number'},400);
  if(kind==='job_seeker'&&!['entry','mid','experienced'].includes(p.experience_level as string))return reply({error:'Check experience level'},400);
  // Global atomic cap is deliberately conservative. Client-supplied IP headers cannot be trusted here.
  const ipHash=await sha(service+':global-contact-interest');
  const limit=await fetch(`${base}/rest/v1/rpc/gh_take_contact_rate`,{method:'POST',headers,body:JSON.stringify({p_hash:ipHash})});
  if(!limit.ok)return reply({error:'Please try again later'},503);
  if(await limit.json()!==true)return reply({error:'Too many attempts. Try again in an hour.'},429);
  const record:Record<string,string>={kind,email,consent_version:'contact-v1'};
  for(const f of fields)record[f]=clean(p[f] as string);
  const saved=await fetch(`${base}/rest/v1/gh_contact_interest`,{method:'POST',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify(record)});
  if(saved.status===409)return reply({received:true,already_registered:true});
  if(!saved.ok)return reply({error:'Could not save this request'},503);
  return reply({received:true},201);
 }catch{return reply({error:'Please try again later'},503)}
});
