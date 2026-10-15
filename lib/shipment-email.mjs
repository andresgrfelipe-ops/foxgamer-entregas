export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

export function emailConfiguration(env) {
  const required = ['RESEND_API_KEY','SHIPMENT_EMAIL_FROM','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(key => !env(key));
  return {enabled: env('EMAIL_NOTIFICATIONS_ENABLED') === 'true' && !missing.length, missing};
}

export function buildMessage(job, from, replyTo) {
  const p = job.payload;
  const link = new URL('https://entregasfoxgamer.co/');
  link.searchParams.set('guia', p.guide);
  const date = new Intl.DateTimeFormat('es-CO', {
    timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'
  }).format(new Date(p.occurred_at));
  const title = p.status === 'Guía creada' ? 'Tu guía ha sido creada' : 'Tu envío tiene una actualización';
  const lines = [title, `Hola, ${p.customer_name}.`, `Guía: ${p.guide}`, `Estado: ${p.status}`,
    `Fecha: ${date} (hora Colombia)`, p.delivery_window ? `Entrega estimada: ${p.delivery_window}` : '',
    p.note ? `Novedad: ${p.note}` : '', `Consulta tu envío: ${link.href}`, 'FOX GAMER ENTREGAS'];
  return {
    from, to: [job.recipient],
    subject: `FOX GAMER Entregas | ${p.guide} | ${p.status}`.replace(/[\r\n]/g, ' ').slice(0,200),
    text: lines.filter(Boolean).join('\n\n'),
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><div style="background:#111827;color:white;padding:24px;border-top:5px solid #f97316"><strong style="font-size:23px">FOX GAMER</strong><br>ENTREGAS</div><div style="padding:24px"><h1 style="font-size:22px">${escapeHtml(title)}</h1><p>Hola, ${escapeHtml(p.customer_name)}.</p><p>Guía: <strong>${escapeHtml(p.guide)}</strong></p><p>Estado: <strong>${escapeHtml(p.status)}</strong></p><p>${escapeHtml(date)} · Hora Colombia</p>${p.delivery_window ? `<p>Entrega estimada: ${escapeHtml(p.delivery_window)}</p>` : ''}${p.note ? `<p>${escapeHtml(p.note)}</p>` : ''}<p style="margin:28px 0"><a href="${escapeHtml(link.href)}" style="background:#ea580c;color:white;padding:14px 20px;text-decoration:none;border-radius:8px">Consultar mi envío</a></p><p style="font-size:12px;color:#64748b">Aviso automático sobre tu envío de FOX GAMER Entregas.</p></div></div>`,
    ...(replyTo ? {reply_to:replyTo} : {})
  };
}

export async function processQueue({env, fetcher = fetch, now = Date.now}) {
  if (!emailConfiguration(env).enabled) return {enabled:false,accepted:0};
  const started = now();
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const base = env('SUPABASE_URL').replace(/\/$/,'');
  const db = async (path, method, body) => {
    const response = await fetcher(`${base}/rest/v1/${path}`, {
      method, headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${key}`,Prefer:'return=representation'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(4000)
    });
    if (!response.ok) throw new Error(`database_${response.status}`);
    return response.json();
  };
  let accepted = 0;
  for (let index=0;index<3 && now()-started<12000;index++) {
    const jobs = await db('rpc/claim_shipment_email','POST',{});
    const job = jobs[0];
    if (!job) break;
    let result;
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method:'POST',headers:{Authorization:`Bearer ${env('RESEND_API_KEY')}`,'Content-Type':'application/json','Idempotency-Key':`shipment-event/${job.id}`},
        body:JSON.stringify(buildMessage(job,env('SHIPMENT_EMAIL_FROM'),env('SHIPMENT_EMAIL_REPLY_TO'))),
        signal:AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        if (!data.id) throw new Error('missing_provider_id');
        result = {state:'sent',provider_id:data.id,sent_at:new Date(now()).toISOString(),last_error:null};
      } else {
        const retryable = response.status===429 || response.status>=500 || response.status===408;
        result = {state:retryable && job.attempts<8 ? 'pending':'failed',last_error:`provider_${response.status}`};
      }
    } catch {
      result = {state:job.attempts<8 ? 'pending':'failed',last_error:'provider_network_error'};
    }
    if (result.state==='pending') result.next_attempt_at = new Date(now()+60000*2**Math.min(job.attempts-1,6)).toISOString();
    // If acknowledgement fails, leave the lease intact and retry the same idempotency key.
    await db(`shipment_email_outbox?id=eq.${job.id}&lock_token=eq.${job.lock_token}`,'PATCH',{
      ...result,locked_until:null,lock_token:null
    });
    if (result.state==='sent') accepted++;
  }
  return {enabled:true,accepted};
}
