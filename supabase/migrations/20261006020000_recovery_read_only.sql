-- Recovery rows are written only by the server (service role). Signed-in users may read their own,
-- not insert or edit them (no forged summaries, no backdated AI attempts).
do $$
declare t text;
begin
  foreach t in array array['recovery_days', 'recovery_findings', 'recovery_ai_questions', 'recovery_summaries', 'recovery_day_answers'] loop
    execute format('drop policy if exists own_rows on %I', t);
    execute format('create policy own_rows_read on %I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;
