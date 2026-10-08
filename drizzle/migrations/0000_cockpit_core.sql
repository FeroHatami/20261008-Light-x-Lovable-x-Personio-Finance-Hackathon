CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL,            -- draft_invoice | reminder_email | draft_po | recommendation | portal_request
  title text NOT NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | failed
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  invoice_id text NOT NULL,
  customer text,
  note text,
  promised_date date,
  next_touch date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  params jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.settings (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  starting_cash numeric NOT NULL DEFAULT 0,
  monthly_fixed_costs numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  product_id text NOT NULL,
  product_name text,
  quantity numeric NOT NULL DEFAULT 0,
  safety_level numeric NOT NULL DEFAULT 0,
  vendor_id text,
  unit_cost numeric NOT NULL DEFAULT 0,
  UNIQUE (user_id, product_id)
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  customer_id text NOT NULL,
  customer_name text,
  product_id text NOT NULL,
  product_name text,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'open', -- open | fulfilled
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz
);
CREATE TABLE public.expense_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  source_text text,
  vendor text,
  expense_date date,
  amount numeric,
  currency text,
  category text,
  deductible boolean,
  deductible_reason text,
  matched_expense_id text,
  match_status text, -- matched | missing_in_light | duplicate
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.portal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'hex'),
  invoice_id text NOT NULL,
  customer text,
  amount numeric,
  currency text,
  due_date date,
  discount_pct numeric NOT NULL DEFAULT 0,
  discount_hours int NOT NULL DEFAULT 48,
  installments int NOT NULL DEFAULT 0,
  response text,         -- discount | plan | dispute
  response_note text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['approvals','audit_log','follow_ups','scenarios','settings','stock','orders','expense_checks','portal_links'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "own rows" ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
  END LOOP;
END $$;