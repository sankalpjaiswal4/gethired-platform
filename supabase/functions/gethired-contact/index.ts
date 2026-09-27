// Contact-interest intake, including a private, consent-scoped seeker CV. Not a job application.
const ORIGIN='https://gethired-platform.pages.dev', OWNER='sankalpjaiswal2006@gmail.com', BUCKET='contact-cvs', MAX=5*1024*1024;
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST,GET,DELETE,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type','Vary':'Origin'};
function reply(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...cors}})}
function valid(s:unknown,min:number,max:number){return typeof s==='string' && s.trim().length>=min && s.trim().length<=max && !/[<>\x00-\x1f]/.test(s)}
function clean(s:string){return s.trim().replace(/\s+/g,' ')}
async function sha(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('')}
Deno.serve(async req=>{
 const allow=req.headers.get('Origin')===ORIGIN;
 const cleanupAttempt=req.method==='POST' && !!req.headers.get('x-cleanup-secret');
 if(!allow&&!cleanupAttempt)return new Response(JSON.stringify({error:'Unavailable'}),{status:403});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const base=Deno.env.get('SUPABASE_URL'), service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!base||!service||!anon)return reply({error:'Service unavailable'},503);
 const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 let cleanup=false;if(cleanupAttempt){const check=await fetch(`${base}/rest/v1/rpc/gh_check_cleanup_secret`,{method:'POST',headers,body:JSON.stringify({p_secret:req.headers.get('x-cleanup-secret')})});if(!check.ok||await check.json()!==true)return new Response(JSON.stringify({error:'Unavailable'}),{status:403});cleanup=true}

 const rowsUrl=`${base}/rest/v1/gh_contact_interest`;
 async function removeFile(path:string){const r=await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`,{method:'DELETE',headers:{apikey:service,Authorization:'Bearer '+service}});return r.ok||r.status===404}
 try{
  if(cleanup){
   const cutoff=new Date();cutoff.setUTCMonth(cutoff.getUTCMonth()-12);const q=`${rowsUrl}?select=id,resume_path,kind&created_at=lt.${encodeURIComponent(cutoff.toISOString())}&order=created_at.asc&limit=1000`;
   const r=await fetch(q,{headers});if(!r.ok)return reply({error:'Expiry query failed'},503);
   let removed=0,failed=0;
   for(const row of await r.json()){
    if(row.resume_path && !await removeFile(row.resume_path)){failed++;continue}
    const d=await fetch(`${rowsUrl}?id=eq.${encodeURIComponent(row.id)}`,{method:'DELETE',headers});if(d.ok)removed++;else failed++;
   }
   const rate=await fetch(`${base}/rest/v1/gh_contact_rate?bucket=lt.${encodeURIComponent(new Date(Date.now()-2*86400000).toISOString())}`,{method:'DELETE',headers});
   return reply({removed,failed,rate_ok:rate.ok},failed||!rate.ok?503:200);
  }
  if(req.method==='GET'||req.method==='DELETE'){
   const bearer=req.headers.get('Authorization')||'';
   if(!/^Bearer [A-Za-z0-9._~-]+$/.test(bearer))return reply({error:'Owner sign-in required'},401);
   const r=await fetch(`${base}/auth/v1/user`,{headers:{apikey:anon,Authorization:bearer}});
   if(!r.ok)return reply({error:'Owner sign-in required'},401);
   const u=await r.json();if(u.email?.toLowerCase()!==OWNER||!u.email_confirmed_at)return reply({error:'Not allowed'},403);
   const url=new URL(req.url);const fileId=url.searchParams.get('resume');
   if(req.method==='GET'&&fileId){
    if(!/^[a-f0-9-]{36}$/.test(fileId))return reply({error:'Invalid record'},400);
    const lookup=await fetch(`${rowsUrl}?select=resume_path,resume_name&id=eq.${fileId}&kind=eq.job_seeker&limit=1`,{headers});
    if(!lookup.ok)return reply({error:'Unavailable'},503);
    const [row]=await lookup.json();if(!row?.resume_path)return reply({error:'No CV for this record'},404);
    const file=await fetch(`${base}/storage/v1/object/authenticated/${BUCKET}/${row.resume_path}`,{headers:{apikey:service,Authorization:'Bearer '+service}});
    if(!file.ok)return reply({error:'File unavailable'},503);
    const safe=(row.resume_name||'resume').replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,100);
    return new Response(file.body,{status:200,headers:{...cors,'Content-Type':file.headers.get('Content-Type')||'application/octet-stream','Content-Disposition':`attachment; filename="${safe}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(req.method==='DELETE'){
    let input:Record<string,unknown>;try{input=await req.json()}catch{return reply({error:'Invalid request'},400)}
    if(!['job_seeker','employer'].includes(input.kind as string)||!valid(input.email,5,180))return reply({error:'Invalid request'},400);
    const email=clean(input.email as string).toLowerCase(), filter=`?select=id,resume_path&kind=eq.${encodeURIComponent(input.kind as string)}&email=eq.${encodeURIComponent(email)}`;
    const lookup=await fetch(rowsUrl+filter,{headers});if(!lookup.ok)return reply({error:'Could not remove'},503);
    const matches=await lookup.json();for(const row of matches){if(row.resume_path && !await removeFile(row.resume_path))return reply({error:'File removal failed. Record retained.'},503)}
    const removed=await fetch(`${rowsUrl}?kind=eq.${encodeURIComponent(input.kind as string)}&email=eq.${encodeURIComponent(email)}`,{method:'DELETE',headers:{...headers,Prefer:'return=representation'}});
    if(!removed.ok)return reply({error:'Could not remove'},503);return reply({removed:(await removed.json()).length});
   }
   const rows=await fetch(`${rowsUrl}?select=id,kind,full_name,company_name,contact_name,email,phone,role_family,experience_level,hiring_roles,resume_name,created_at&order=created_at.desc&limit=100`,{headers});
   if(!rows.ok)return reply({error:'List unavailable'},503);return reply({submissions:await rows.json()});
  }
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  const type=req.headers.get('content-type')||'', isMultipart=type.startsWith('multipart/form-data;');
  if(Number(req.headers.get('content-length')||0)>(isMultipart?MAX+8192:2048))return reply({error:'Too large'},413);
  let p:Record<string,unknown>, file:File|null=null;
  if(isMultipart){const f=await req.formData();p=Object.fromEntries(f.entries());file=f.get('resume') instanceof File ? f.get('resume') as File:null; p.consent=p.consent==='true'}
  else{const raw=await req.text();if(raw.length>2048)return reply({error:'Too large'},413);try{p=JSON.parse(raw)}catch{return reply({error:'Invalid form'},400)}}
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['kind','full_name','company_name','contact_name','email','phone','role_family','experience_level','hiring_roles','website','consent','resume'].includes(k)))return reply({error:'Invalid form'},400);
  if(p.website)return reply({received:true});
  if(p.consent!==true||!['job_seeker','employer'].includes(p.kind as string)||!valid(p.email,5,180)||!/^\S+@\S+\.\S+$/.test(p.email as string))return reply({error:'Check the required fields and consent'},400);
  const kind=p.kind as string,email=clean(p.email as string).toLowerCase(),fields=kind==='job_seeker'?['full_name','phone','role_family','experience_level']:['company_name','contact_name','hiring_roles'];
  if(fields.some(f=>!valid(p[f],2,f==='hiring_roles'?160:80)))return reply({error:'Check the required fields'},400);
  if(kind==='job_seeker'&&!/^[+\d ()-]{7,24}$/.test(p.phone as string))return reply({error:'Check phone number'},400);
  if(kind==='job_seeker'&&!['entry','mid','experienced'].includes(p.experience_level as string))return reply({error:'Check experience level'},400);
  if(kind==='job_seeker'&&(!isMultipart||!file||file.size<16||file.size>MAX))return reply({error:'Please attach a PDF or DOC up to 5 MB'},400);
  if(kind==='employer'&&(file||isMultipart))return reply({error:'Invalid form'},400);
  let ext='',mime='';if(file){
   ext=/\.pdf$/i.test(file.name)?'pdf':/\.doc$/i.test(file.name)?'doc':'';
   mime=ext==='pdf'?'application/pdf':'application/msword';
   const magic=new Uint8Array(await file.slice(0,8).arrayBuffer());
   const signature=ext==='pdf'&&String.fromCharCode(...magic.slice(0,5))==='%PDF-' ||ext==='doc'&&[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((b,i)=>magic[i]===b);
   if(!ext||!signature||!(file.type===''||file.type===mime||ext==='doc'&&file.type==='application/octet-stream'))return reply({error:'Use a valid PDF or DOC file'},400);
  }
  const ipHash=await sha(service+':global-contact-interest');const limit=await fetch(`${base}/rest/v1/rpc/gh_take_contact_rate`,{method:'POST',headers,body:JSON.stringify({p_hash:ipHash})});
  if(!limit.ok)return reply({error:'Please try again later'},503);if(await limit.json()!==true)return reply({error:'Too many attempts. Try again in an hour.'},429);
  const duplicate=await fetch(`${rowsUrl}?select=id&kind=eq.${kind}&email=eq.${encodeURIComponent(email)}&limit=1`,{headers});
  if(!duplicate.ok)return reply({error:'Could not check this request'},503);if((await duplicate.json()).length)return reply({received:true,already_registered:true});
  const record:Record<string,string>={kind,email,consent_version:kind==='job_seeker'?'contact-cv-v2':'contact-v1'};for(const f of fields)record[f]=clean(p[f] as string);
  let path='';if(file){path=`${crypto.randomUUID()}.${ext}`;record.resume_path=path;record.resume_name=file.name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,100);
   const uploaded=await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`,{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':mime,'Cache-Control':'no-store','x-upsert':'false'},body:file});
   if(!uploaded.ok)return reply({error:'Could not save your CV'},503);
  }
  const saved=await fetch(rowsUrl,{method:'POST',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify(record)});
  if(!saved.ok){if(path&&!await removeFile(path))return reply({error:'Could not save details; upload cleanup needs support. Contact us before retrying.'},503);if(saved.status===409)return reply({received:true,already_registered:true});return reply({error:'Could not save this request'},503)}
  return reply({received:true},201);
 }catch{return reply({error:'Please try again later'},503)}
});
