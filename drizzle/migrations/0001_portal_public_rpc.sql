CREATE OR REPLACE FUNCTION public.get_portal(_token text)
RETURNS TABLE(customer text, amount numeric, currency text, due_date date, discount_pct numeric, discount_hours integer, installments integer, response text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT customer, amount, currency, due_date, discount_pct, discount_hours, installments, response, created_at
  FROM public.portal_links WHERE token = _token AND _token ~ '^[a-f0-9]{36}$' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.respond_portal(_token text, _response text, _note text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.portal_links%ROWTYPE;
BEGIN
  IF _response NOT IN ('discount','plan','dispute') THEN RAISE EXCEPTION 'Invalid response'; END IF;
  IF length(coalesce(_note,'')) > 1000 THEN RAISE EXCEPTION 'Note too long'; END IF;
  SELECT * INTO r FROM public.portal_links WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link not found'; END IF;
  IF r.response IS NOT NULL THEN RAISE EXCEPTION 'A response was already submitted.'; END IF;
  UPDATE public.portal_links SET response = _response, response_note = _note, responded_at = now() WHERE id = r.id;
  INSERT INTO public.audit_log(user_id, action, detail) VALUES (r.user_id, 'portal.' || _response, jsonb_build_object('invoice_id', r.invoice_id, 'customer', r.customer, 'note', _note));
  IF _response <> 'dispute' THEN
    INSERT INTO public.follow_ups(user_id, invoice_id, customer, note, promised_date)
    VALUES (r.user_id, r.invoice_id, r.customer,
      CASE WHEN _response = 'discount' THEN 'Customer accepted early-payment discount via portal' ELSE 'Customer accepted installment plan via portal' END,
      (current_date + CASE WHEN _response = 'discount' THEN 2 ELSE 30 END));
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.get_portal(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_portal(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_portal(text, text, text) TO anon, authenticated;