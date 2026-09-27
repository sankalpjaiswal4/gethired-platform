// GETHIRED synthetic-only Edge Function. No DB reads, resumes, AI, or candidate intake.
const jobs = {
  'ai-ml-engineer': {
    title: 'AI / ML Engineer', level: 'Experienced',
    questions: [
      'A production model loses quality after a pipeline change. How would you distinguish data issues from model drift?',
      'How would you evaluate the effect across customer segments?',
      'How would you explain a rollback decision to a nontechnical team?'
    ],
    task: 'Write a brief investigation and rollback plan for the simulated pipeline change.'
  },
  'salesperson': {
    title: 'Salesperson', level: 'Fresher',
    questions: [
      'A buyer says their budget is tight. What would you ask before recommending anything?',
      'How would you follow up respectfully after a demo without inventing an offer?'
    ],
    task: 'Draft a discovery message and a respectful follow-up to the simulated buyer.'
  }
} as const;
const ORIGIN = 'https://sankalpjaiswal4.github.io';
function response(body: unknown, status = 200, origin = '') {
  return new Response(JSON.stringify(body), { status, headers: {'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin': origin, 'Vary':'Origin'}});
}
Deno.serve(async req => {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin===ORIGIN?ORIGIN:'','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}});
  if (req.method !== 'POST') return response({error:'Method not allowed'},405);
  if (origin !== ORIGIN) return response({error:'Origin not allowed'},403);
  if (Number(req.headers.get('content-length')||0) > 4096) return response({error:'Request too large'},413,ORIGIN);
  let input: unknown; try { const raw=await req.text(); if(raw.length>4096) return response({error:'Request too large'},413,ORIGIN); input=JSON.parse(raw); } catch { return response({error:'Invalid JSON'},400,ORIGIN); }
  if (!input || typeof input !== 'object') return response({error:'Invalid request'},400,ORIGIN);
  const p = input as Record<string,unknown>;
  if (p.synthetic !== true || typeof p.role !== 'string' || !(p.role in jobs) || !Number.isInteger(p.step)) return response({error:'Synthetic examples only'},400,ORIGIN);
  const job = jobs[p.role as keyof typeof jobs];
  const step = Number(p.step);
  if (step < 0 || step > job.questions.length) return response({error:'Invalid step'},400,ORIGIN);
  // Stateless sample: no answer or profile is accepted or stored. Real assessment needs auth, consent, approved jobs and isolation.
  if ('answer' in p || 'resume' in p || 'candidate' in p) return response({error:'No applicant data accepted'},400,ORIGIN);
  return response(step === job.questions.length ? {synthetic:true,role:job.title,level:job.level,task:job.task,note:'Sample only. No application or score.'} : {synthetic:true,role:job.title,level:job.level,step:step+1,total:job.questions.length,question:job.questions[step],note:'Sample only. No answer accepted or stored.'},200,ORIGIN);
});
