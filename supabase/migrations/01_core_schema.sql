-- ============================================================================
-- נסיעות שיתופיות — סכמת הליבה
-- טיפוסים, טבלאות ואינדקסים. ההרשאות (RLS) בקובץ 02, הלוגיקה העסקית בקובץ 03.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- טיפוסים ----------
do $$ begin
  create type member_role       as enum ('member','manager');
  create type member_status     as enum ('pending','active','blocked');
  create type ride_direction    as enum ('to_work','from_work');
  create type ride_status       as enum ('draft','open','full','locked','departed','finished','closed','cancelled');
  create type booking_status    as enum ('requested','approved','rejected','waitlisted','cancelled','no_show','rode');
  create type booking_source    as enum ('app','manual','subscription');
  create type payment_status    as enum ('marked','confirmed','disputed');
  create type payment_method    as enum ('bit','paybox','cash','transfer','other');
  create type settlement_status as enum ('open','sent','paid','closed');
exception when duplicate_object then null; end $$;

-- ---------- ארגון ----------
create table if not exists orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  join_code  text not null unique,
  settings   jsonb not null default jsonb_build_object(
                'currency','₪',
                'timezone','Asia/Jerusalem',
                'default_price', 15,
                'max_price_per_km', 2.5,
                'cost_per_km', 1.9,
                'co2_kg_per_km', 0.19,
                'cancel_deadline_hours', 3,
                'cancel_charge_pct', 100,
                'payment_due_days', 14,
                'auto_confirm_days', 7,
                'lock_ride_hours_before', 2,
                'publish_weeks_ahead', 4
             ),
  created_at timestamptz not null default now()
);

-- ---------- חברים ----------
-- login_key: מזהה הכניסה, נגזר מ-(קוד ארגון + שם) בצד הלקוח. קבוע ולא משתנה.
create table if not exists members (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  user_id       uuid unique,
  login_key     text not null,
  name          text not null,
  role          member_role   not null default 'member',
  status        member_status not null default 'active',
  is_driver     boolean not null default false,
  home_area     text,
  notify_email  boolean not null default true,
  notify_push   boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (org_id, login_key),
  unique (org_id, name)
);
create index if not exists members_org_idx  on members(org_id);
create index if not exists members_user_idx on members(user_id);

-- ---------- פרטי קשר (מופרד כדי שאפשר יהיה להגן עליו בנפרד) ----------
create table if not exists member_contacts (
  member_id uuid primary key references members(id) on delete cascade,
  org_id    uuid not null references orgs(id) on delete cascade,
  phone     text,
  email     text,
  pay_note  text
);

-- ---------- רכבים ----------
create table if not exists vehicles (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references orgs(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  model     text,
  color     text,
  plate     text,
  seats     int not null default 4 check (seats between 1 and 8)
);
create index if not exists vehicles_member_idx on vehicles(member_id);

-- ---------- נקודות איסוף ----------
create table if not exists stops (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references orgs(id) on delete cascade,
  name     text not null,
  address  text,
  sort     int not null default 0,
  active   boolean not null default true
);
create index if not exists stops_org_idx on stops(org_id);

-- ---------- תבניות נסיעה קבועה ----------
create table if not exists ride_templates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  driver_id      uuid not null references members(id) on delete cascade,
  days_of_week   int[] not null default '{0,1,2,3,4}',   -- 0=ראשון .. 6=שבת
  depart_time    time not null,
  direction      ride_direction not null,
  origin_stop_id uuid references stops(id) on delete set null,
  origin_text    text,
  dest_text      text,
  seats_total    int not null default 4 check (seats_total between 1 and 8),
  price          numeric(8,2) not null default 0 check (price >= 0),
  auto_approve   boolean not null default false,
  active         boolean not null default true,
  active_from    date not null default current_date,
  active_to      date,
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists ride_templates_driver_idx on ride_templates(driver_id) where active;

-- ---------- נסיעות ----------
create table if not exists rides (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  driver_id      uuid not null references members(id) on delete cascade,
  template_id    uuid references ride_templates(id) on delete set null,
  ride_date      date not null,
  depart_time    time not null,
  departs_at     timestamptz not null,
  direction      ride_direction not null,
  origin_stop_id uuid references stops(id) on delete set null,
  origin_text    text,
  dest_text      text,
  seats_total    int not null check (seats_total between 1 and 8),
  seats_taken    int not null default 0,
  price          numeric(8,2) not null default 0 check (price >= 0),
  auto_approve   boolean not null default false,
  status         ride_status not null default 'open',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (driver_id, ride_date, depart_time, direction)
);
create index if not exists rides_org_date_idx on rides(org_id, ride_date);
create index if not exists rides_departs_idx  on rides(departs_at) where status in ('open','full','locked','departed');

-- ---------- הצטרפויות ----------
create table if not exists bookings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  ride_id        uuid not null references rides(id) on delete cascade,
  passenger_id   uuid not null references members(id) on delete cascade,
  seats          int not null default 1 check (seats between 1 and 4),
  pickup_stop_id uuid references stops(id) on delete set null,
  status         booking_status not null default 'requested',
  source         booking_source not null default 'app',
  waitlist_pos   int,
  note           text,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  unique (ride_id, passenger_id)
);
create index if not exists bookings_ride_idx      on bookings(ride_id);
create index if not exists bookings_passenger_idx on bookings(passenger_id);

-- ---------- מנוי קבוע לנסיעה חוזרת ----------
create table if not exists subscriptions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  template_id    uuid not null references ride_templates(id) on delete cascade,
  passenger_id   uuid not null references members(id) on delete cascade,
  pickup_stop_id uuid references stops(id) on delete set null,
  seats          int not null default 1 check (seats between 1 and 4),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (template_id, passenger_id)
);

-- ---------- רשימת אישור אוטומטי של נהג ----------
create table if not exists trusted_passengers (
  driver_id    uuid not null references members(id) on delete cascade,
  passenger_id uuid not null references members(id) on delete cascade,
  org_id       uuid not null references orgs(id) on delete cascade,
  primary key (driver_id, passenger_id)
);

-- ---------- חיובים ----------
create table if not exists charges (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  ride_id    uuid references rides(id) on delete set null,
  booking_id uuid unique references bookings(id) on delete set null,
  payer_id   uuid not null references members(id) on delete cascade,
  payee_id   uuid not null references members(id) on delete cascade,
  amount     numeric(8,2) not null check (amount >= 0),
  kind       text not null default 'ride',   -- ride | cancellation | manual | adjustment
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists charges_payer_idx on charges(payer_id);
create index if not exists charges_payee_idx on charges(payee_id);

-- ---------- תשלומים ----------
create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  payer_id       uuid not null references members(id) on delete cascade,
  payee_id       uuid not null references members(id) on delete cascade,
  amount         numeric(8,2) not null check (amount > 0),
  method         payment_method not null default 'bit',
  reference      text,
  proof_url      text,
  status         payment_status not null default 'marked',
  note           text,
  dispute_reason text,
  marked_at      timestamptz not null default now(),
  confirmed_at   timestamptz,
  confirmed_by   uuid references members(id) on delete set null,
  auto_confirmed boolean not null default false
);
create index if not exists payments_payer_idx on payments(payer_id);
create index if not exists payments_payee_idx on payments(payee_id);
create index if not exists payments_open_idx  on payments(payee_id) where status = 'marked';

-- ---------- סגירת חודש ----------
create table if not exists settlements (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  payer_id     uuid not null references members(id) on delete cascade,
  payee_id     uuid not null references members(id) on delete cascade,
  amount       numeric(10,2) not null,
  rides_count  int not null default 0,
  status       settlement_status not null default 'open',
  created_at   timestamptz not null default now(),
  unique (org_id, period_start, payer_id, payee_id)
);

-- ---------- התראות ----------
create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text,
  link         text,
  data         jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  email_status text not null default 'pending',   -- pending|sent|skipped|failed
  push_status  text not null default 'pending',
  created_at   timestamptz not null default now()
);
create index if not exists notifications_member_idx on notifications(member_id, created_at desc);
create index if not exists notifications_queue_idx  on notifications(created_at)
  where email_status = 'pending' or push_status = 'pending';

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- ---------- תיעוד שינויים ----------
create table if not exists audit_log (
  id        bigserial primary key,
  org_id    uuid,
  actor_id  uuid,
  entity    text not null,
  entity_id uuid,
  action    text not null,
  detail    jsonb,
  at        timestamptz not null default now()
);
create index if not exists audit_org_idx on audit_log(org_id, at desc);
