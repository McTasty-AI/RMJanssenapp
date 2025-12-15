-- Adds per-employee overnight allowance so payroll can reimburse correctly
alter table if exists public.profiles
    add column if not exists overnight_allowance_rate numeric;

-- default existing employees to 32 EUR if no value was stored
update public.profiles
set overnight_allowance_rate = 32
where overnight_allowance_rate is null;

alter table if exists public.profiles
    alter column overnight_allowance_rate set default 32;
