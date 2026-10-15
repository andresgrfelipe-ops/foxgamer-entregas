-- Additive migration. Existing guides remain valid without an email address.
alter table public.shipments add column if not exists customer_email text;
alter table public.shipments add constraint shipments_customer_email_valid check (
  customer_email is null or (length(customer_email) <= 254 and
  customer_email ~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$')
);

create table public.shipment_email_outbox (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  event_id bigint not null unique references public.shipment_events(id) on delete cascade,
  recipient text not null,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  locked_until timestamptz,
  lock_token uuid,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.shipment_email_outbox enable row level security;
revoke all on public.shipment_email_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.shipment_email_outbox to service_role;
create index shipment_email_pending_idx on public.shipment_email_outbox(next_attempt_at)
  where state in ('pending','sending');
create index shipment_email_shipment_idx on public.shipment_email_outbox(shipment_id,created_at);

create function public.queue_shipment_email() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare s public.shipments;
begin
  select * into s from public.shipments where id = new.shipment_id;
  if s.customer_email is not null then
    insert into public.shipment_email_outbox(shipment_id,event_id,recipient,payload)
    values (s.id,new.id,s.customer_email,jsonb_build_object(
      'guide',s.guide,'customer_name',s.customer_name,'status',new.status,
      'note',new.note,'delivery_window',s.delivery_window,'occurred_at',new.created_at))
    on conflict (event_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.queue_shipment_email() from public,anon,authenticated;
grant execute on function public.queue_shipment_email() to service_role;
create trigger shipment_event_email after insert on public.shipment_events
  for each row execute function public.queue_shipment_email();

-- Keep the established admin authentication and all existing fields intact.
do $migration$
declare source text;
begin
  select pg_get_functiondef('public.admin_shipments(text,text,jsonb)'::regprocedure) into source;
  if strpos(source,'customer_document, customer_phone') = 0 or
     strpos(source,'  if p_action = ''list'' then') = 0 then
    raise exception 'Unexpected admin_shipments definition; review before migrating';
  end if;
  source := replace(source,'customer_document, customer_phone','customer_document, customer_email, customer_phone');
  source := replace(source,
    '      nullif(trim(p_payload->>''customer_document''),''''),',
    '      nullif(trim(p_payload->>''customer_document''),''''),
      nullif(lower(trim(p_payload->>''customer_email'')),''''),');
  source := replace(source,'           customer_document = case',
    '           customer_email = case when p_payload ? ''customer_email'' then nullif(lower(trim(p_payload->>''customer_email'')),'''') else customer_email end,
           customer_document = case');
  source := replace(source,'  if p_action = ''list'' then',
    '  if p_payload ? ''customer_email'' and nullif(trim(p_payload->>''customer_email''),'''') is not null then
    if length(trim(p_payload->>''customer_email'')) > 254 or
       trim(p_payload->>''customer_email'') !~ ''^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'' then
      raise exception ''invalid_customer_email'';
    end if;
  end if;

  if p_action = ''list'' then');
  source := replace(source,'driver, status, delivery_window, created_at, updated_at
        from public.shipments',
    'driver, status, delivery_window, created_at, updated_at,
               (select o.state from public.shipment_email_outbox o where o.shipment_id=shipments.id order by o.created_at desc,o.event_id desc limit 1) as email_delivery_status
        from public.shipments');
  execute source;
end;
$migration$;

-- Atomic claims avoid two scheduled invocations sending the same event.
create function public.claim_shipment_email() returns setof public.shipment_email_outbox
language plpgsql security invoker set search_path = '' as $$
begin
  update public.shipment_email_outbox o set state='cancelled',last_error='recipient_changed'
  from public.shipments s where s.id=o.shipment_id and o.recipient is distinct from s.customer_email
    and (o.state='pending' or (o.state='sending' and o.locked_until < now()));
  update public.shipment_email_outbox set state='failed',last_error='retry_window_expired'
  where state in ('pending','sending') and (locked_until is null or locked_until < now())
    and (attempts >= 8 or first_attempt_at < now()-interval '23 hours');
  return query
  with candidate as (
    select o.id from public.shipment_email_outbox o
    where ((o.state='pending' and o.next_attempt_at <= now()) or
           (o.state='sending' and o.locked_until < now()))
      and not exists (select 1 from public.shipment_email_outbox earlier
        where earlier.shipment_id=o.shipment_id and earlier.event_id < o.event_id
          and earlier.state in ('pending','sending'))
    order by o.created_at,o.event_id for update skip locked limit 1
  )
  update public.shipment_email_outbox o set state='sending',attempts=o.attempts+1,
    first_attempt_at=coalesce(o.first_attempt_at,now()),locked_until=now()+interval '3 minutes',lock_token=gen_random_uuid()
  from candidate c where o.id=c.id returning o.*;
end;
$$;
revoke all on function public.claim_shipment_email() from public,anon,authenticated;
grant execute on function public.claim_shipment_email() to service_role;
notify pgrst,'reload schema';
