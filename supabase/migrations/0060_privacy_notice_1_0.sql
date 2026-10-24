-- Mridanga Seva — 0060: privacy notice 1.0 (world-class audit 22-10-2026 §2.10, fixes 5 and 21; work package C).
-- Run once, after 0059, in the Supabase SQL editor (TEST first). Why: docs/DECISIONS.md #571-#579.
-- How: docs/OPERATIONS.md "Retention", docs/DATABASE.md "Privacy notice and retention (0060)".
--
-- 1. The app asks again when the notice changes (#577): notice_acceptances keeps, per login and notice
--    version, that an adult (a student of 18 or over, a staff member) read the notice and agreed, or that
--    a student under 18 was asked to show it to the parent. privacy_notice_ask(version) tells the app
--    which card to show (accept / adult_now / show / none); accept_privacy_notice(version) records it.
--    A student who was registered as a child and is 18 now is asked for their own consent (adult_now).
-- 2. Retention is enforced, not only written (#572, #573): the daily job mridanga-retention erases a
--    record 30 days after its consent was withdrawn, a record two years after the student left, a
--    sign-up the desk never registered 180 days after it was made (an Ishtagoshti reader and a child's
--    sign-up, which 0051 times, excepted), forgets phones unused for 90 days and deletes change-log rows
--    over two years old. Erasure uses erase_student / erase_login (0049), so tombstones and audit
--    redaction are as for an erasure by the Guru. Nothing is old enough on 24-10-2026 for any of it.
-- 3. The Ishtagoshti parent email gets its real text in English, Telugu and Hindi, by the child's app
--    language (#578, audit fix 21; 0054 sent "[TEST - ...]").
--
-- No existing table, policy or row changes; only ig_send_parent_code is replaced. Every UPDATE/DELETE has a
-- WHERE (Supabase safeupdate). Safe to run twice.

-- ---------------------------------------------------------------- 1. the notice, asked again (#577)
create table if not exists notice_acceptances (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references profiles (id) on delete cascade,
  -- privacyNotice.version of website/site.config.mjs, as the app sends it (PRIVACY_NOTICE_VERSION).
  version     text not null check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$'),
  -- accepted: an adult read the notice and agreed. shown: a student under 18 was asked to show it to
  -- the parent, whose consent stays the basis.
  kind        text not null check (kind in ('accepted', 'shown')),
  at          timestamptz not null default now(),
  unique (profile_id, version, kind)
);
alter table notice_acceptances enable row level security;
-- Read: the person's own rows, and the Guru. Written only by accept_privacy_notice.
drop policy if exists own_or_guru on notice_acceptances;
create policy own_or_guru on notice_acceptances for select to authenticated using (profile_id = (select auth.uid()) or (select is_guru()));
revoke all on notice_acceptances from public, anon;
revoke insert, update, delete, truncate, references, trigger on notice_acceptances from authenticated;

-- Which notice card the signed-in person gets for this version: 'accept' (an adult: read and agree),
-- 'adult_now' (a student registered as a child, 18 now, who has never agreed themselves: their own
-- consent), 'show' (a student under 18, or of unknown age: show it to your parent), or null (nothing to
-- ask: done, not a staff member or student, a withdrawn or left record, a bad version).
create or replace function privacy_notice_ask(p_version text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_me   uuid := auth.uid();
  v_role app_role := my_role();
  s      students;
begin
  if v_me is null or p_version is null or p_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$' then return null; end if;
  if v_role in ('guru', 'coordinator') then
    return case when exists (select 1 from notice_acceptances
                              where profile_id = v_me and version = p_version and kind = 'accepted') then null else 'accept' end;
  end if;
  if v_role is distinct from 'student' then return null; end if;
  select * into s from students where profile_id = v_me;
  if not found or s.withdrawn_at is not null or s.status = 'left' then return null; end if;
  if s.dob is null or s.dob > (today_ist() - interval '18 years')::date then
    return case when exists (select 1 from notice_acceptances
                              where profile_id = v_me and version = p_version and kind = 'shown') then null else 'show' end;
  end if;
  if exists (select 1 from notice_acceptances where profile_id = v_me and version = p_version and kind = 'accepted') then
    return null;
  end if;
  if exists (select 1 from consents c where c.student_id = s.id and c.scope = 'data' and c.revoked_at is null
                                         and c.guardian_id is not null)
     and not exists (select 1 from notice_acceptances where profile_id = v_me and kind = 'accepted') then
    return 'adult_now';
  end if;
  return 'accept';
end $$;

-- Records the card's answer for this version: 'accepted' for an adult, 'shown' for a child; returns it,
-- or null when there was nothing to ask (done already). At most 50 rows a login (a version is short and
-- changes rarely). Errors: not_allowed, notice_version_invalid, too_many.
create or replace function accept_privacy_notice(p_version text) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_me   uuid := auth.uid();
  v_ask  text;
  v_kind text;
begin
  if v_me is null or coalesce(my_role() in ('guru', 'coordinator', 'student'), false) = false then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_version is null or p_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$' then raise exception 'notice_version_invalid'; end if;
  v_ask := privacy_notice_ask(p_version);
  if v_ask is null then return null; end if;
  if (select count(*) from notice_acceptances where profile_id = v_me) >= 50 then raise exception 'too_many'; end if;
  v_kind := case when v_ask = 'show' then 'shown' else 'accepted' end;
  insert into notice_acceptances (profile_id, version, kind) values (v_me, p_version, v_kind)
  on conflict (profile_id, version, kind) do nothing;
  return v_kind;
end $$;

-- ---------------------------------------------------------------- 2. retention, enforced (#572, #573)
-- Daily. Each erasure runs on its own: one that is refused (an instrument still lent out: open_loan) is
-- counted as skipped and tried again the next night. Returns the counts.
create or replace function retention_daily() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r           record;
  v_withdrawn int := 0;
  v_left      int := 0;
  v_waiting   int := 0;
  v_skipped   int := 0;
  v_tokens    int;
  v_audit     int;
begin
  -- A record whose consent was withdrawn, 30 days after (#573). Consent given again clears withdrawn_at.
  for r in select s.id from students s where s.withdrawn_at < now() - interval '30 days' loop
    begin
      perform erase_student(r.id, 'Retention: consent withdrawn over 30 days ago (#573)', 'retention');
      v_withdrawn := v_withdrawn + 1;
    exception when raise_exception then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  -- A student who left, two years after the last change to "left" (#572).
  for r in select s.id from students s
            where s.status = 'left' and s.withdrawn_at is null
              and coalesce((select max(h.changed_at) from status_history h where h.student_id = s.id and h.to_status = 'left'),
                           s.created_at) < now() - interval '2 years' loop
    begin
      perform erase_student(r.id, 'Retention: left the class over two years ago (#572)', 'retention');
      v_left := v_left + 1;
    exception when raise_exception then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  -- A sign-up the desk never registered, 180 days after it was made (#572). Not an Ishtagoshti reader (its
  -- own area, kept while they read) and not a child's sign-up (0051's job: 30 days without consent, 180 after).
  for r in select p.id from profiles p
            where p.role = 'pending' and p.created_at < now() - interval '180 days'
              and not exists (select 1 from students s where s.profile_id = p.id)
              and not exists (select 1 from ig_subscribers i where i.profile_id = p.id)
              and not exists (select 1 from minor_signups m where m.profile_id = p.id) loop
    begin
      perform erase_login(r.id, 'Retention: sign-up never registered, over 180 days old (#572)', 'retention');
      v_waiting := v_waiting + 1;
    exception when raise_exception then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  -- Phones that have not opened the app for 90 days (the app registers its token again when it starts).
  delete from push_tokens where updated_at < now() - interval '90 days';
  get diagnostics v_tokens = row_count;

  -- The change log keeps two years (DPDP Rules 2025 Rule 8(3) asks for at least one).
  delete from audit_log where changed_at < now() - interval '2 years';
  get diagnostics v_audit = row_count;

  return jsonb_build_object('withdrawn', v_withdrawn, 'left', v_left, 'waiting', v_waiting, 'skipped', v_skipped,
                            'tokens', v_tokens, 'audit_rows', v_audit);
end $$;

-- 02:45 India time (21:15 UTC), after the night's minor sign-up (02:15) and data request (02:30) jobs.
select cron.schedule('mridanga-retention', '15 21 * * *', 'select retention_daily()');

-- ---------------------------------------------------------------- 3. the Ishtagoshti parent email (#578)
-- 0054's ig_send_parent_code with the real text: what the child shares, who sees it, the declaration the
-- code stands for, how to withdraw, and the notice's address, in the child's app language. Limits and
-- everything else unchanged. The address is the website's (app/src/lib/privacy-notice.ts WEBSITE_ORIGIN):
-- change both when mridangaseva.com is attached.
create or replace function ig_send_parent_code() returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_me      uuid := auth.uid();
  v_row     ig_subscribers;
  v_code    ig_parent_codes;
  v_child   text;
  v_lang    text;
  v_parent  text;
  v_key     text;
  v_from    text;
  v_new     text;
  v_notice  text;
  v_subject text;
  v_text    text;
begin
  select * into v_row from ig_subscribers where profile_id = v_me;
  if not found or coalesce(my_role() <> 'pending', true) or v_row.blocked_at is not null
     or not v_row.minor or v_row.parent_confirmed_at is not null then
    raise exception 'not_awaiting_parent' using errcode = '42501';
  end if;
  select * into v_code from ig_parent_codes where profile_id = v_me;
  if found and v_code.sent_at > now() - interval '1 minute' then raise exception 'code_too_soon'; end if;
  if found and v_code.sends_day = today_ist() and v_code.sends >= 3 then raise exception 'code_limit'; end if;
  if (select coalesce(sum(c.sends), 0) from ig_parent_codes c join ig_subscribers s on s.profile_id = c.profile_id
       where c.sends_day = today_ist() and lower(s.parent_email) = lower(v_row.parent_email)) >= 3 then
    raise exception 'code_parent_limit';
  end if;
  if (select coalesce(sum(sends), 0) from ig_parent_codes where sends_day = today_ist()) >= 100 then
    raise exception 'code_daily_cap';
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'net' and p.proname = 'http_post')
     or to_regclass('vault.decrypted_secrets') is null then
    return 'not_set_up';
  end if;
  -- Read through dynamic SQL, so this function can be created before the Vault is there.
  execute $q$select max(decrypted_secret) filter (where name = 'mridanga_brevo_key'),
                    max(decrypted_secret) filter (where name = 'mridanga_mail_from')
               from vault.decrypted_secrets$q$
     into v_key, v_from;
  if v_key is null or v_from is null then return 'not_set_up'; end if;

  select name_for_email(full_name, 80), language into v_child, v_lang from profiles where id = v_me;
  v_parent := name_for_email(v_row.parent_name, 100);
  v_new := ig_new_parent_code(v_me);
  v_notice := 'https://mridangaseva-site.pages.dev' || case when v_lang in ('te', 'hi') then '/' || v_lang else '' end || '/privacy/';
  if v_lang = 'te' then
    v_subject := 'మృదంగ సేవ: మీ పిల్లలు ఇష్టగోష్ఠిలో చేరాలని అడుగుతున్నారు';
    v_text := 'నమస్కారం ' || coalesce(v_parent || ' గారు', 'తల్లిదండ్రులు గారు') || E',\n\n'
      || coalesce(v_child, 'మీ పిల్లలు') || ' (' || v_row.birth_year || ' లో జన్మించారు) మృదంగ సేవ యాప్‌లోని ఉచిత శ్లోక అధ్యయనం '
      || E'ఇష్టగోష్ఠిలో చేరాలని అడిగారు, ఈ ఈమెయిల్ చిరునామాను తమ తల్లిదండ్రులు లేదా సంరక్షకుల చిరునామాగా ఇచ్చారు.\n\n'
      || 'మీరు అంగీకరిస్తే మేము ఉంచేవి: పిల్లల పేరు, ఈమెయిల్, పుట్టిన సంవత్సరం, వారు ఇస్తే ఫోన్ నంబర్; మీ పేరు, ఈమెయిల్, '
      || 'పిల్లలతో మీ సంబంధం; ఇష్టగోష్ఠిలో వారు రాసుకునే నోట్స్, కంఠస్థం చేసిన శ్లోకాలు. వీటిని శ్లోకాలు చదవడానికి మాత్రమే '
      || 'వాడతాము. మృదంగ సేవ ఫెసిలిటేటర్ (గురువు) మాత్రమే ఈ వివరాలను చూస్తారు; ఇతర సభ్యులకు ఏదీ కనిపించదు, ప్రకటనలు లేవు.'
      || E'\n\n'
      || 'కింది కోడ్‌ను మీ పిల్లలకు ఇవ్వడం ద్వారా, మీరు వారి తల్లిదండ్రులు లేదా చట్టపరమైన సంరక్షకులని, 18 ఏళ్ళు లేదా అంతకు '
      || 'మించినవారని ప్రకటించి, దీనికి సమ్మతి ఇస్తున్నారు. ఎప్పుడైనా ఉపసంహరించుకోవచ్చు: పిల్లలు యాప్‌లో "ఖాతా" కింద '
      || 'ఇష్టగోష్ఠిని వదిలితే వారి వివరాలు, నోట్స్, టిక్‌లు తొలగిపోతాయి; లేదా privacy@mridangaseva.com కు రాయండి. '
      || 'గోప్యతా ప్రకటన: ' || v_notice || E'\n\n'
      || 'మీరు అంగీకరిస్తే, యాప్‌లో టైప్ చేయడానికి ఈ కోడ్‌ను మీ పిల్లలకు ఇవ్వండి: ' || v_new
      || E'\nఇది 24 గంటలు పనిచేస్తుంది. మీరు అంగీకరించకపోతే ఏమీ చేయవద్దు: కోడ్ లేకుండా ఏదీ తెరుచుకోదు.\n\nమృదంగ సేవ';
  elsif v_lang = 'hi' then
    v_subject := 'मृदंग सेवा: आपका बच्चा इष्टगोष्ठी से जुड़ना चाहता है';
    v_text := 'नमस्ते ' || coalesce(v_parent || ' जी', 'अभिभावक जी') || E',\n\n'
      || coalesce(v_child, 'आपके बच्चे') || ' (जन्म वर्ष ' || v_row.birth_year || ') ने मृदंग सेवा ऐप के निःशुल्क श्लोक अध्ययन '
      || E'इष्टगोष्ठी से जुड़ने को कहा है, और यह ईमेल पता अपने माता-पिता या अभिभावक के पते के रूप में दिया है।\n\n'
      || 'अगर आप सहमत हैं तो हम यह रखेंगे: बच्चे का नाम, ईमेल, जन्म वर्ष और, अगर वे दें, फ़ोन नंबर; आपका नाम, ईमेल और '
      || 'बच्चे से आपका रिश्ता; इष्टगोष्ठी में उनके अपने नोट्स और कंठस्थ किए गए श्लोक। इनका उपयोग केवल श्लोक पढ़ने के लिए '
      || 'होता है। ये विवरण केवल मृदंग सेवा के फ़ैसिलिटेटर (गुरु) देखते हैं; दूसरे सदस्यों को कुछ नहीं दिखता, कोई विज्ञापन नहीं।'
      || E'\n\n'
      || 'नीचे दिया कोड अपने बच्चे को देकर आप घोषित करते हैं कि आप उनके माता-पिता या वैध अभिभावक हैं और 18 वर्ष या उससे '
      || 'अधिक आयु के हैं, और इसके लिए सहमति देते हैं। आप कभी भी सहमति वापस ले सकते हैं: बच्चा ऐप में "खाता" में जाकर '
      || 'इष्टगोष्ठी छोड़ दे तो उनका विवरण, नोट्स और टिक मिट जाते हैं; या privacy@mridangaseva.com पर लिखें। '
      || 'गोपनीयता सूचना: ' || v_notice || E'\n\n'
      || 'अगर आप सहमत हैं, तो ऐप में लिखने के लिए यह कोड अपने बच्चे को दें: ' || v_new
      || E'\nयह 24 घंटे चलता है। अगर आप सहमत नहीं हैं, तो कुछ न करें: कोड के बिना कुछ नहीं खुलता।\n\nमृदंग सेवा';
  else
    v_subject := 'Mridanga Seva: your child asks to join Ishtagoshti';
    v_text := 'Dear ' || coalesce(v_parent, 'parent') || E',\n\n'
      || coalesce(v_child, 'Your child') || ' (born ' || v_row.birth_year || ') has asked to join Ishtagoshti, '
      || E'the free sloka study in the Mridanga Seva app, and gave this email address as their parent''s or guardian''s.\n\n'
      || 'If you agree, we keep: your child''s name, email address, year of birth and, if they give it, a phone number; '
      || 'your name, email address and relation to them; and, in Ishtagoshti, their own notes and the slokas they have '
      || 'memorised. They are used only for reading the slokas. Only the facilitator (Guru) of Mridanga Seva sees these '
      || E'details; nothing is shown to other members, and there is no advertising.\n\n'
      || 'By giving your child the code below, you declare that you are their parent or legal guardian and 18 or over, '
      || 'and you consent to this. You can withdraw at any time: when your child leaves Ishtagoshti in the app (Account), '
      || 'their details, notes and ticks are deleted; or write to privacy@mridangaseva.com. '
      || 'The privacy notice: ' || v_notice || E'\n\n'
      || 'If you agree, give your child this code to type into the app: ' || v_new
      || E'\nIt works for 24 hours. If you do not agree, do nothing: nothing opens without the code.\n\nMridanga Seva';
  end if;
  -- pg_net sends after this transaction ends; the answer stays in net._http_response for a while.
  execute $q$select net.http_post(
                url := 'https://api.brevo.com/v3/smtp/email',
                headers := jsonb_build_object('Content-Type', 'application/json', 'api-key', $1),
                body := $2,
                timeout_milliseconds := 30000)$q$
    using v_key, jsonb_build_object(
      'sender', jsonb_build_object('name', 'Mridanga Seva', 'email', v_from),
      'to', jsonb_build_array(jsonb_build_object('email', v_row.parent_email, 'name', coalesce(v_parent, 'Parent'))),
      'subject', v_subject,
      'textContent', v_text);
  return 'sent';
end $$;

-- ---------------------------------------------------------------- who may run them
-- docs/DECISIONS.md #14: the notice functions for signed-in people (each checks the caller), the job internal.
revoke execute on function privacy_notice_ask(text), accept_privacy_notice(text), retention_daily()
  from public, anon, authenticated, service_role;
grant execute on function privacy_notice_ask(text), accept_privacy_notice(text) to authenticated;

-- ---------------------------------------------------------------- descriptions
comment on table notice_acceptances is 'Per login and privacy-notice version: an adult agreed (accepted) or a child was asked to show it to the parent (shown) (#577).';
comment on function privacy_notice_ask(text) is 'S1/C1/G1: which privacy-notice card the signed-in person gets for a version: accept, adult_now, show or null (#577).';
comment on function accept_privacy_notice(text) is 'S1/C1/G1: records the notice card''s answer for a version (accepted for an adult, shown for a child) (#577).';
comment on function retention_daily() is 'Daily (pg_cron mridanga-retention, 02:45 IST): erases withdrawn records after 30 days, left students after two years, never-registered sign-ups after 180 days; forgets phones unused 90 days; change log over two years (#572, #573).';
comment on function ig_send_parent_code is 'I14, minors: emails a new code to the parent with the consent text in the child''s language (1 a minute, 3 a day per child and per parent address, 100 a day in all) through pg_net + Brevo; returns sent or not_set_up (#329, #578).';
