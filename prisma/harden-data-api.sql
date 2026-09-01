-- OnRoad Books keeps all ledger access behind server-side Prisma queries.
-- These tables must never be reachable directly through Supabase's Data API.
-- The datasource schema is resolved from the connection, so CI and isolated
-- certification schemas exercise the same script without touching public.
-- Safe to run repeatedly.

do $$
declare
  target_schema text := current_schema();
  table_name text;
  api_role text;
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
    'DriverSettlementAdjustment',
    'FinancialSettings',
    'Truck',
    'Load',
    'Expense',
    'FinancialObligation',
    'PaymentEvent',
    'FuelEntry',
    'MaintenanceRecord',
    'Document'
  ];
  api_roles constant text[] := array['anon', 'authenticated', 'service_role'];
begin
  foreach table_name in array application_tables loop
    if to_regclass(format('%I.%I', target_schema, table_name)) is not null then
      execute format(
        'alter table %I.%I enable row level security',
        target_schema,
        table_name
      );
      foreach api_role in array api_roles loop
        if exists (select 1 from pg_roles where rolname = api_role) then
          execute format(
            'revoke all privileges on table %I.%I from %I',
            target_schema,
            table_name,
            api_role
          );
        end if;
      end loop;
    end if;
  end loop;
end
$$;

-- Prisma may create more application tables later. Keep future schema objects
-- private until a deliberate Data API policy and matching grant are added.
do $$
declare
  target_schema text := current_schema();
  api_role text;
  api_roles constant text[] := array['anon', 'authenticated', 'service_role'];
begin
  execute format(
    'alter default privileges for role %I in schema %I revoke execute on functions from public',
    current_user,
    target_schema
  );
  foreach api_role in array api_roles loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format(
        'alter default privileges for role %I in schema %I revoke all privileges on tables from %I',
        current_user,
        target_schema,
        api_role
      );
      execute format(
        'alter default privileges for role %I in schema %I revoke execute on functions from %I',
        current_user,
        target_schema,
        api_role
      );
      execute format(
        'alter default privileges for role %I in schema %I revoke all privileges on sequences from %I',
        current_user,
        target_schema,
        api_role
      );
    end if;
  end loop;
end
$$;
