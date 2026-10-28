-- Mridanga Seva — 0067: no "Guru" in the Telugu and Hindi notification lines (docs/DECISIONS.md #706; the Facilitator
-- SOP 360° review of 27-10-2026: "never use Guru in user-facing screens, emails, notifications ... or role display").
-- Run once after 0064 (and 0066 where it is applied; the two touch different functions), in the Supabase SQL editor
-- (TEST first). Safe to run twice. Changes no stored row: notices already queued keep their text.
--
-- Two text helpers only, each replaced whole with the same lines except four: the facilitator is ఫెసిలిటేటర్ గారు /
-- फ़ैसिलिटेटर (the words the app's te/hi strings use since #706) instead of గురువుగారు / गुरुजी. English is unchanged
-- (it said "the facilitator" since 0017 / 0023). The role's value 'guru' stays everywhere (#40). The privileges of
-- 0017 / 0023 stay as they were (create or replace keeps them). Telugu and Hindi are drafts for the native review.

-- ---------------------------------------------------------------- level-up notices (was 0017 section 6)
create or replace function promotion_push_line(p_kind text, p_lang text) returns text
language sql immutable set search_path = public as $$
  select case p_kind
    when 'asked' then case p_lang
      when 'te' then 'తర్వాతి స్థాయికి సిఫారసు చేశారు. దయచేసి మీ అభిప్రాయం ఇవ్వండి.'
      when 'hi' then 'अगले स्तर के लिए नामांकन। कृपया अपनी राय दें।'
      else 'Nominated for the next level. Please give your feedback.' end
    when 'ready' then case p_lang
      when 'te' then 'కోఆర్డినేటర్ల అభిప్రాయాలు వచ్చాయి. మీ నిర్ణయం కోసం వేచి ఉంది.'
      when 'hi' then 'कोऑर्डिनेटरों की राय आ गई है। आपके निर्णय की प्रतीक्षा है।'
      else 'The coordinators'' feedback is in. Waiting for your decision.' end
    when 'more' then case p_lang
      when 'te' then 'ఫెసిలిటేటర్ గారు మరింత అభిప్రాయం అడుగుతున్నారు.'
      when 'hi' then 'फ़ैसिलिटेटर और राय माँग रहे हैं।'
      else 'The facilitator asks for more feedback.' end
    when 'promoted' then case p_lang
      when 'te' then 'అభినందనలు! మీరు తర్వాతి స్థాయికి వెళ్లారు.'
      when 'hi' then 'बधाई हो! आप अगले स्तर पर पहुँच गए हैं।'
      else 'Congratulations! You have moved up to the next level.' end
    when 'promoted_staff' then case p_lang
      when 'te' then 'ఫెసిలిటేటర్ గారు తర్వాతి స్థాయికి పెంచారు.'
      when 'hi' then 'फ़ैसिलिटेटर ने अगले स्तर पर बढ़ा दिया।'
      else 'The facilitator promoted them to the next level.' end
    when 'not_yet' then case p_lang
      when 'te' then 'ఇంకా కాదు. ఫెసిలిటేటర్ గారి సూచనలు చూడండి.'
      when 'hi' then 'अभी नहीं। फ़ैसिलिटेटर का मार्गदर्शन देखें।'
      else 'Not yet. See the facilitator''s guidance.' end
  end
$$;

-- ---------------------------------------------------------------- team notices (was 0023 section 0)
create or replace function team_push_line(p_kind text, p_lang text, p_extra text default null)
returns text language sql immutable set search_path = public as $$
  select case p_kind
    when 'suggested' then case p_lang
      when 'te' then p_extra || ' ఒక పాఠ్య సామగ్రిని సూచించారు.'
      when 'hi' then p_extra || ' ने एक पाठ सामग्री सुझाई।'
      else p_extra || ' suggested a lesson material.' end
    when 'approved' then case p_lang
      when 'te' then 'ఫెసిలిటేటర్ గారు మీ సూచనను పాఠాల్లో చేర్చారు.'
      when 'hi' then 'फ़ैसिलिटेटर ने आपका सुझाव पाठों में जोड़ दिया।'
      else 'The facilitator added your suggestion to the lessons.' end
    when 'declined' then case p_lang
      when 'te' then 'చేర్చలేదు: ' || p_extra
      when 'hi' then 'नहीं जोड़ा गया: ' || p_extra
      else 'Not added: ' || p_extra end
    when 'damaged' then case p_lang
      when 'te' then 'పాడైందని గుర్తించారు: ' || p_extra
      when 'hi' then 'खराब बताया गया: ' || p_extra
      else 'Marked damaged: ' || p_extra end
    when 'duty' then case p_lang
      when 'te' then 'రేపు మీకు డ్యూటీ ఉంది: ' || p_extra
      when 'hi' then 'कल आपकी ड्यूटी है: ' || p_extra
      else 'You are on duty tomorrow: ' || p_extra end
  end
$$;

-- Verification (TEST, then LIVE): 0 = no notice line says Guru any more.
-- select count(*) from (values ('asked'), ('ready'), ('more'), ('promoted'), ('promoted_staff'), ('not_yet')) k(kind),
--   (values ('te'), ('hi')) l(lang)
--  where promotion_push_line(kind, lang) ~ '(గురు|गुरु)' or team_push_line('approved', lang, 'x') ~ '(గురు|गुरु)';
