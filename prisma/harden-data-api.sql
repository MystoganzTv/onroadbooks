-- OnRoad Books keeps all ledger access behind server-side Prisma queries.
-- These tables must never be reachable directly through Supabase's Data API.
-- Safe to run repeatedly.

do $$
declare
  table_name text;
  application_tables constant text[] := array[
    'User',
    'Business',
    'FinancialGoal',
    'Subscription',
    'ReserveAccount',
    'ReserveTransaction',
    'Settlement',
    'Driver',
    'DriverSettlement',
    'DriverSettlementLine',
    'FinancialSettings',
    'Truck',
    'Load',
    'Expense',
    'FuelEntry',
    'MaintenanceRecord',
    'Document'
  ];
begin
  foreach table_name in array application_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'revoke all privileges on table public.%I from anon, authenticated',
        table_name
      );
      execute format(
        'alter table public.%I enable row level security',
        table_name
      );
    end if;
  end loop;
end
$$;

-- Prisma may create more application tables later. Keep future public objects
-- private until a deliberate Data API policy and matching grant are added.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
