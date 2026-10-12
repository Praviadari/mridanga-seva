-- 0047 Form rules in SQL (audit phase 1 of 12-10-2026, brief B1: P1-01, P1-08, P1-12, P1-05, P1-06;
-- audit phase 3 early findings S1-04/P1-18, S2-01, S2-03, S2-04, S4-02; docs/DECISIONS.md #271-#274,
-- #276, #280; docs/DATABASE.md "Form rules (0047)" and "Registering a student").
-- 1. P1-01, S2-04: a student under 18 needs a parent or guardian WITH A PHONE on record, and a current
--    data consent given through a guardian OF THE SAME STUDENT. Checked at commit when a student is
--    added, the date of birth changes (an adult made a minor through the API was not checked before)
--    or a withdrawn record comes back, and, as since 0025/0028, when a consent or guardian changes or
--    goes. A consent naming another student's guardian is refused (consent_guardian_mismatch); an app
--    user cannot insert an email-code consent (consent_method_not_allowed: no code flow exists).
-- 2. P1-08: one name rule, clean_person_name() (#271), the same as the app's checkPersonName
--    (app/src/lib/person-name.ts, DECISIONS #267): NFC, blanks made one space, no digits, letters and
--    vowel signs of any script with ZWJ/ZWNJ, single separators . ' ’ - between letters, at least two
--    letters. Used by the sign-up (handle_new_user, which only trimmed), a name change
--    (guard_profile_details), and by triggers on every other person-name column written by an app
--    user: students, guardians, the emergency contact, the initiated name, the Ishtagoshti parent.
--    The staff-name clash (name_taken) stays for logins' names only.
-- 3. P1-12: a student's own About you no longer changes a gender already on their record; staff do.
-- 4. P1-05: a student added at the desk (or by the import) gets the registering coordinator's centre,
--    not centre 1.
-- 5. P1-06: possible_duplicates(name, dob, phone), staff only, for a "Possible duplicate" warning.
-- 6. P1-18/S1-04, S2-01 (#276): a minor's record is never linked to a login by email (saving the email,
--    confirming a sign-up, Accept); the Guru links one explicitly. A guardian's email may not be any
--    child's record email (before: only their own child's). S2-03: a student inserted by an app user
--    gets no login, a fresh QR code and the inserting user as creator, whatever was sent.
-- 7. S4-02 (#280): the privacy-notice version ticked at sign-up is kept (person_details), and Accept
--    refuses a sign-up without one (notice_not_accepted; Fill the form lets the desk record it).
-- Rows already stored are not re-checked: the rules run when a value is written or changed.
-- Needs 0001-0046. Safe to run twice.

-- ---------------------------------------------------------------- 2. the name rule (#271)
-- 0047's first draft had a list of allowed characters (person_name_chars); the rule now follows the
-- app's "any letter" rule, so that list goes.
drop function if exists person_name_chars();

-- The characters that are neither a letter nor a mark (Unicode L and M - vowel signs, viramas,
-- accents) nor ZWNJ/ZWJ, a separator (space . ' ’ -) or white space: what checkPersonName calls
-- 'symbols' (digits are refused before, as 'digits'), as code-point ranges inside a regular-expression
-- bracket. PostgreSQL's regular expressions have no \p{L}, and [[:alpha:]] depends on the server's
-- locale, so the list is GENERATED from JavaScript's own Unicode tables (Unicode 17, Node 24) by
-- supabase/tests/name-symbols.mjs; the smoke test fails if the two differ. Do not edit by hand.
create or replace function person_name_symbols() returns text
language sql immutable set search_path = public, pg_temp as $$
  select '\u0001-\u0008\u000e-\u001f\u0021-\u0026\u0028-\u002c\u002f-\u0040\u005b-\u0060\u007b-\u009f'
      || '\u00a1-\u00a9\u00ab-\u00b4\u00b6-\u00b9\u00bb-\u00bf\u00d7\u00f7\u02c2-\u02c5\u02d2-\u02df'
      || '\u02e5-\u02eb\u02ed\u02ef-\u02ff\u0375\u0378-\u0379\u037e\u0380-\u0385\u0387\u038b\u038d\u03a2'
      || '\u03f6\u0482\u0530\u0557-\u0558\u055a-\u055f\u0589-\u0590\u05be\u05c0\u05c3\u05c6\u05c8-\u05cf'
      || '\u05eb-\u05ee\u05f3-\u060f\u061b-\u061f\u0660-\u066d\u06d4\u06dd-\u06de\u06e9\u06f0-\u06f9'
      || '\u06fd-\u06fe\u0700-\u070f\u074b-\u074c\u07b2-\u07c9\u07f6-\u07f9\u07fb-\u07fc\u07fe-\u07ff'
      || '\u082e-\u083f\u085c-\u085f\u086b-\u086f\u0888\u0890-\u0896\u08e2\u0964-\u0970\u0984\u098d-\u098e'
      || '\u0991-\u0992\u09a9\u09b1\u09b3-\u09b5\u09ba-\u09bb\u09c5-\u09c6\u09c9-\u09ca\u09cf-\u09d6'
      || '\u09d8-\u09db\u09de\u09e4-\u09ef\u09f2-\u09fb\u09fd\u09ff-\u0a00\u0a04\u0a0b-\u0a0e\u0a11-\u0a12'
      || '\u0a29\u0a31\u0a34\u0a37\u0a3a-\u0a3b\u0a3d\u0a43-\u0a46\u0a49-\u0a4a\u0a4e-\u0a50\u0a52-\u0a58'
      || '\u0a5d\u0a5f-\u0a6f\u0a76-\u0a80\u0a84\u0a8e\u0a92\u0aa9\u0ab1\u0ab4\u0aba-\u0abb\u0ac6\u0aca'
      || '\u0ace-\u0acf\u0ad1-\u0adf\u0ae4-\u0af8\u0b00\u0b04\u0b0d-\u0b0e\u0b11-\u0b12\u0b29\u0b31\u0b34'
      || '\u0b3a-\u0b3b\u0b45-\u0b46\u0b49-\u0b4a\u0b4e-\u0b54\u0b58-\u0b5b\u0b5e\u0b64-\u0b70'
      || '\u0b72-\u0b81\u0b84\u0b8b-\u0b8d\u0b91\u0b96-\u0b98\u0b9b\u0b9d\u0ba0-\u0ba2\u0ba5-\u0ba7'
      || '\u0bab-\u0bad\u0bba-\u0bbd\u0bc3-\u0bc5\u0bc9\u0bce-\u0bcf\u0bd1-\u0bd6\u0bd8-\u0bff\u0c0d\u0c11'
      || '\u0c29\u0c3a-\u0c3b\u0c45\u0c49\u0c4e-\u0c54\u0c57\u0c5b\u0c5e-\u0c5f\u0c64-\u0c7f\u0c84\u0c8d'
      || '\u0c91\u0ca9\u0cb4\u0cba-\u0cbb\u0cc5\u0cc9\u0cce-\u0cd4\u0cd7-\u0cdb\u0cdf\u0ce4-\u0cf0'
      || '\u0cf4-\u0cff\u0d0d\u0d11\u0d45\u0d49\u0d4f-\u0d53\u0d58-\u0d5e\u0d64-\u0d79\u0d80\u0d84'
      || '\u0d97-\u0d99\u0db2\u0dbc\u0dbe-\u0dbf\u0dc7-\u0dc9\u0dcb-\u0dce\u0dd5\u0dd7\u0de0-\u0df1'
      || '\u0df4-\u0e00\u0e3b-\u0e3f\u0e4f-\u0e80\u0e83\u0e85\u0e8b\u0ea4\u0ea6\u0ebe-\u0ebf\u0ec5\u0ec7'
      || '\u0ecf-\u0edb\u0ee0-\u0eff\u0f01-\u0f17\u0f1a-\u0f34\u0f36\u0f38\u0f3a-\u0f3d\u0f48\u0f6d-\u0f70'
      || '\u0f85\u0f98\u0fbd-\u0fc5\u0fc7-\u0fff\u1040-\u104f\u1090-\u1099\u109e-\u109f\u10c6\u10c8-\u10cc'
      || '\u10ce-\u10cf\u10fb\u1249\u124e-\u124f\u1257\u1259\u125e-\u125f\u1289\u128e-\u128f\u12b1'
      || '\u12b6-\u12b7\u12bf\u12c1\u12c6-\u12c7\u12d7\u1311\u1316-\u1317\u135b-\u135c\u1360-\u137f'
      || '\u1390-\u139f\u13f6-\u13f7\u13fe-\u1400\u166d-\u166e\u169b-\u169f\u16eb-\u16f0\u16f9-\u16ff'
      || '\u1716-\u171e\u1735-\u173f\u1754-\u175f\u176d\u1771\u1774-\u177f\u17d4-\u17d6\u17d8-\u17db'
      || '\u17de-\u180a\u180e\u1810-\u181f\u1879-\u187f\u18ab-\u18af\u18f6-\u18ff\u191f\u192c-\u192f'
      || '\u193c-\u194f\u196e-\u196f\u1975-\u197f\u19ac-\u19af\u19ca-\u19ff\u1a1c-\u1a1f\u1a5f'
      || '\u1a7d-\u1a7e\u1a80-\u1aa6\u1aa8-\u1aaf\u1ade-\u1adf\u1aec-\u1aff\u1b4d-\u1b6a\u1b74-\u1b7f'
      || '\u1bb0-\u1bb9\u1bf4-\u1bff\u1c38-\u1c4c\u1c50-\u1c59\u1c7e-\u1c7f\u1c8b-\u1c8f\u1cbb-\u1cbc'
      || '\u1cc0-\u1ccf\u1cd3\u1cfb-\u1cff\u1f16-\u1f17\u1f1e-\u1f1f\u1f46-\u1f47\u1f4e-\u1f4f\u1f58\u1f5a'
      || '\u1f5c\u1f5e\u1f7e-\u1f7f\u1fb5\u1fbd\u1fbf-\u1fc1\u1fc5\u1fcd-\u1fcf\u1fd4-\u1fd5\u1fdc-\u1fdf'
      || '\u1fed-\u1ff1\u1ff5\u1ffd-\u1fff\u200b\u200e-\u2018\u201a-\u2027\u202a-\u202e\u2030-\u205e'
      || '\u2060-\u2070\u2072-\u207e\u2080-\u208f\u209d-\u20cf\u20f1-\u2101\u2103-\u2106\u2108-\u2109'
      || '\u2114\u2116-\u2118\u211e-\u2123\u2125\u2127\u2129\u212e\u213a-\u213b\u2140-\u2144\u214a-\u214d'
      || '\u214f-\u2182\u2185-\u2bff\u2ce5-\u2cea\u2cf4-\u2cff\u2d26\u2d28-\u2d2c\u2d2e-\u2d2f'
      || '\u2d68-\u2d6e\u2d70-\u2d7e\u2d97-\u2d9f\u2da7\u2daf\u2db7\u2dbf\u2dc7\u2dcf\u2dd7\u2ddf'
      || '\u2e00-\u2e2e\u2e30-\u2fff\u3001-\u3004\u3007-\u3029\u3030\u3036-\u303a\u303d-\u3040'
      || '\u3097-\u3098\u309b-\u309c\u30a0\u30fb\u3100-\u3104\u3130\u318f-\u319f\u31c0-\u31ef\u3200-\u33ff'
      || '\u4dc0-\u4dff\ua48d-\ua4cf\ua4fe-\ua4ff\ua60d-\ua60f\ua620-\ua629\ua62c-\ua63f\ua673\ua67e'
      || '\ua6e6-\ua6ef\ua6f2-\ua716\ua720-\ua721\ua789-\ua78a\ua7dd-\ua7f0\ua828-\ua82b\ua82d-\ua83f'
      || '\ua874-\ua87f\ua8c6-\ua8df\ua8f8-\ua8fa\ua8fc\ua900-\ua909\ua92e-\ua92f\ua954-\ua95f'
      || '\ua97d-\ua97f\ua9c1-\ua9ce\ua9d0-\ua9df\ua9f0-\ua9f9\ua9ff\uaa37-\uaa3f\uaa4e-\uaa5f'
      || '\uaa77-\uaa79\uaac3-\uaada\uaade-\uaadf\uaaf0-\uaaf1\uaaf7-\uab00\uab07-\uab08\uab0f-\uab10'
      || '\uab17-\uab1f\uab27\uab2f\uab5b\uab6a-\uab6f\uabeb\uabee-\uabff\ud7a4-\ud7af\ud7c7-\ud7ca'
      || '\ud7fc-\ud7ff\ue000-\uf8ff\ufa6e-\ufa6f\ufada-\ufaff\ufb07-\ufb12\ufb18-\ufb1c\ufb29\ufb37\ufb3d'
      || '\ufb3f\ufb42\ufb45\ufbb2-\ufbd2\ufd3e-\ufd4f\ufd90-\ufd91\ufdc8-\ufdef\ufdfc-\ufdff\ufe10-\ufe1f'
      || '\ufe30-\ufe6f\ufe75\ufefd-\ufefe\uff00-\uff20\uff3b-\uff40\uff5b-\uff65\uffbf-\uffc1'
      || '\uffc8-\uffc9\uffd0-\uffd1\uffd8-\uffd9\uffdd-\uffff\U0001000c\U00010027\U0001003b\U0001003e'
      || '\U0001004e-\U0001004f\U0001005e-\U0001007f\U000100fb-\U000101fc\U000101fe-\U0001027f'
      || '\U0001029d-\U0001029f\U000102d1-\U000102df\U000102e1-\U000102ff\U00010320-\U0001032c\U00010341'
      || '\U0001034a-\U0001034f\U0001037b-\U0001037f\U0001039e-\U0001039f\U000103c4-\U000103c7'
      || '\U000103d0-\U000103ff\U0001049e-\U000104af\U000104d4-\U000104d7\U000104fc-\U000104ff'
      || '\U00010528-\U0001052f\U00010564-\U0001056f\U0001057b\U0001058b\U00010593\U00010596\U000105a2'
      || '\U000105b2\U000105ba\U000105bd-\U000105bf\U000105f4-\U000105ff\U00010737-\U0001073f'
      || '\U00010756-\U0001075f\U00010768-\U0001077f\U00010786\U000107b1\U000107bb-\U000107ff'
      || '\U00010806-\U00010807\U00010809\U00010836\U00010839-\U0001083b\U0001083d-\U0001083e'
      || '\U00010856-\U0001085f\U00010877-\U0001087f\U0001089f-\U000108df\U000108f3\U000108f6-\U000108ff'
      || '\U00010916-\U0001091f\U0001093a-\U0001093f\U0001095a-\U0001097f\U000109b8-\U000109bd'
      || '\U000109c0-\U000109ff\U00010a04\U00010a07-\U00010a0b\U00010a14\U00010a18\U00010a36-\U00010a37'
      || '\U00010a3b-\U00010a3e\U00010a40-\U00010a5f\U00010a7d-\U00010a7f\U00010a9d-\U00010abf\U00010ac8'
      || '\U00010ae7-\U00010aff\U00010b36-\U00010b3f\U00010b56-\U00010b5f\U00010b73-\U00010b7f'
      || '\U00010b92-\U00010bff\U00010c49-\U00010c7f\U00010cb3-\U00010cbf\U00010cf3-\U00010cff'
      || '\U00010d28-\U00010d49\U00010d66-\U00010d68\U00010d6e\U00010d86-\U00010e7f\U00010eaa'
      || '\U00010ead-\U00010eaf\U00010eb2-\U00010ec1\U00010ec8-\U00010ef9\U00010f1d-\U00010f26'
      || '\U00010f28-\U00010f2f\U00010f51-\U00010f6f\U00010f86-\U00010faf\U00010fc5-\U00010fdf'
      || '\U00010ff7-\U00010fff\U00011047-\U0001106f\U00011076-\U0001107e\U000110bb-\U000110c1'
      || '\U000110c3-\U000110cf\U000110e9-\U000110ff\U00011135-\U00011143\U00011148-\U0001114f'
      || '\U00011174-\U00011175\U00011177-\U0001117f\U000111c5-\U000111c8\U000111cd\U000111d0-\U000111d9'
      || '\U000111db\U000111dd-\U000111ff\U00011212\U00011238-\U0001123d\U00011242-\U0001127f\U00011287'
      || '\U00011289\U0001128e\U0001129e\U000112a9-\U000112af\U000112eb-\U000112ff\U00011304'
      || '\U0001130d-\U0001130e\U00011311-\U00011312\U00011329\U00011331\U00011334\U0001133a'
      || '\U00011345-\U00011346\U00011349-\U0001134a\U0001134e-\U0001134f\U00011351-\U00011356'
      || '\U00011358-\U0001135c\U00011364-\U00011365\U0001136d-\U0001136f\U00011375-\U0001137f\U0001138a'
      || '\U0001138c-\U0001138d\U0001138f\U000113b6\U000113c1\U000113c3-\U000113c4\U000113c6\U000113cb'
      || '\U000113d4-\U000113e0\U000113e3-\U000113ff\U0001144b-\U0001145d\U00011462-\U0001147f\U000114c6'
      || '\U000114c8-\U0001157f\U000115b6-\U000115b7\U000115c1-\U000115d7\U000115de-\U000115ff'
      || '\U00011641-\U00011643\U00011645-\U0001167f\U000116b9-\U000116ff\U0001171b-\U0001171c'
      || '\U0001172c-\U0001173f\U00011747-\U000117ff\U0001183b-\U0001189f\U000118e0-\U000118fe'
      || '\U00011907-\U00011908\U0001190a-\U0001190b\U00011914\U00011917\U00011936\U00011939-\U0001193a'
      || '\U00011944-\U0001199f\U000119a8-\U000119a9\U000119d8-\U000119d9\U000119e2\U000119e5-\U000119ff'
      || '\U00011a3f-\U00011a46\U00011a48-\U00011a4f\U00011a9a-\U00011a9c\U00011a9e-\U00011aaf'
      || '\U00011af9-\U00011b5f\U00011b68-\U00011bbf\U00011be1-\U00011bff\U00011c09\U00011c37'
      || '\U00011c41-\U00011c71\U00011c90-\U00011c91\U00011ca8\U00011cb7-\U00011cff\U00011d07\U00011d0a'
      || '\U00011d37-\U00011d39\U00011d3b\U00011d3e\U00011d48-\U00011d5f\U00011d66\U00011d69\U00011d8f'
      || '\U00011d92\U00011d99-\U00011daf\U00011ddc-\U00011edf\U00011ef7-\U00011eff\U00011f11'
      || '\U00011f3b-\U00011f3d\U00011f43-\U00011f59\U00011f5b-\U00011faf\U00011fb1-\U00011fff'
      || '\U0001239a-\U0001247f\U00012544-\U00012f8f\U00012ff1-\U00012fff\U00013430-\U0001343f'
      || '\U00013456-\U0001345f\U000143fb-\U000143ff\U00014647-\U000160ff\U00016130-\U000167ff'
      || '\U00016a39-\U00016a3f\U00016a5f-\U00016a6f\U00016abf-\U00016acf\U00016aee-\U00016aef'
      || '\U00016af5-\U00016aff\U00016b37-\U00016b3f\U00016b44-\U00016b62\U00016b78-\U00016b7c'
      || '\U00016b90-\U00016d3f\U00016d6d-\U00016e3f\U00016e80-\U00016e9f\U00016eb9-\U00016eba'
      || '\U00016ed4-\U00016eff\U00016f4b-\U00016f4e\U00016f88-\U00016f8e\U00016fa0-\U00016fdf\U00016fe2'
      || '\U00016fe5-\U00016fef\U00016ff4-\U00016fff\U00018cd6-\U00018cfe\U00018d1f-\U00018d7f'
      || '\U00018df3-\U0001afef\U0001aff4\U0001affc\U0001afff\U0001b123-\U0001b131\U0001b133-\U0001b14f'
      || '\U0001b153-\U0001b154\U0001b156-\U0001b163\U0001b168-\U0001b16f\U0001b2fc-\U0001bbff'
      || '\U0001bc6b-\U0001bc6f\U0001bc7d-\U0001bc7f\U0001bc89-\U0001bc8f\U0001bc9a-\U0001bc9c'
      || '\U0001bc9f-\U0001ceff\U0001cf2e-\U0001cf2f\U0001cf47-\U0001d164\U0001d16a-\U0001d16c'
      || '\U0001d173-\U0001d17a\U0001d183-\U0001d184\U0001d18c-\U0001d1a9\U0001d1ae-\U0001d241'
      || '\U0001d245-\U0001d3ff\U0001d455\U0001d49d\U0001d4a0-\U0001d4a1\U0001d4a3-\U0001d4a4'
      || '\U0001d4a7-\U0001d4a8\U0001d4ad\U0001d4ba\U0001d4bc\U0001d4c4\U0001d506\U0001d50b-\U0001d50c'
      || '\U0001d515\U0001d51d\U0001d53a\U0001d53f\U0001d545\U0001d547-\U0001d549\U0001d551'
      || '\U0001d6a6-\U0001d6a7\U0001d6c1\U0001d6db\U0001d6fb\U0001d715\U0001d735\U0001d74f\U0001d76f'
      || '\U0001d789\U0001d7a9\U0001d7c3\U0001d7cc-\U0001d9ff\U0001da37-\U0001da3a\U0001da6d-\U0001da74'
      || '\U0001da76-\U0001da83\U0001da85-\U0001da9a\U0001daa0\U0001dab0-\U0001deff\U0001df1f-\U0001df24'
      || '\U0001df2b-\U0001dfff\U0001e007\U0001e019-\U0001e01a\U0001e022\U0001e025\U0001e02b-\U0001e02f'
      || '\U0001e06e-\U0001e08e\U0001e090-\U0001e0ff\U0001e12d-\U0001e12f\U0001e13e-\U0001e14d'
      || '\U0001e14f-\U0001e28f\U0001e2af-\U0001e2bf\U0001e2f0-\U0001e4cf\U0001e4f0-\U0001e5cf'
      || '\U0001e5f1-\U0001e6bf\U0001e6df\U0001e6f6-\U0001e6fd\U0001e700-\U0001e7df\U0001e7e7\U0001e7ec'
      || '\U0001e7ef\U0001e7ff\U0001e8c5-\U0001e8cf\U0001e8d7-\U0001e8ff\U0001e94c-\U0001edff\U0001ee04'
      || '\U0001ee20\U0001ee23\U0001ee25-\U0001ee26\U0001ee28\U0001ee33\U0001ee38\U0001ee3a'
      || '\U0001ee3c-\U0001ee41\U0001ee43-\U0001ee46\U0001ee48\U0001ee4a\U0001ee4c\U0001ee50\U0001ee53'
      || '\U0001ee55-\U0001ee56\U0001ee58\U0001ee5a\U0001ee5c\U0001ee5e\U0001ee60\U0001ee63'
      || '\U0001ee65-\U0001ee66\U0001ee6b\U0001ee73\U0001ee78\U0001ee7d\U0001ee7f\U0001ee8a'
      || '\U0001ee9c-\U0001eea0\U0001eea4\U0001eeaa\U0001eebc-\U0001ffff\U0002a6e0-\U0002a6ff'
      || '\U0002b81e-\U0002b81f\U0002ceae-\U0002ceaf\U0002ebe1-\U0002ebef\U0002ee5e-\U0002f7ff'
      || '\U0002fa1e-\U0002ffff\U0003134b-\U0003134f\U0003347a-\U000e00ff\U000e01f0-\U0010ffff'
$$;

-- Cleans and checks one person's name; returns the name to store. The same steps, in the same order,
-- as checkPersonName (app/src/lib/person-name.ts); its problems map to the codes the app knows:
--   required            name_required   nothing left after cleaning
--   digits              name_invalid    0-9 or a digit of Devanagari, Bengali, Gurmukhi, Gujarati,
--                                       Oriya, Tamil, Telugu, Kannada, Malayalam, full-width
--   symbols             name_invalid    a character of person_name_symbols(); a separator (space . ' ’ -)
--                                       first, or after another separator unless it is a space after
--                                       . ' ’ or -; a name ending in - ' ’
--   tooShort            name_invalid    fewer than 2 letters (every character that is not a separator)
--   tooLong             name_too_long   more than p_max characters (80; 100 for a student record, a
--                                       guardian and the Excel import)
-- Cleaning: Unicode NFC; every run of white space (JavaScript's \s: space, tab, line breaks, no-break
-- and other Unicode spaces, U+FEFF) becomes one space; spaces at both ends go.
create or replace function clean_person_name(p_name text, p_max integer default 80) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v text := coalesce(p_name, '');
begin
  v := normalize(v);
  v := btrim(regexp_replace(v, '[\u0009-\u000d    -     　﻿]+', ' ', 'g'), ' ');
  if v = '' then raise exception 'name_required'; end if;
  if v ~ '[0-9०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯０-９]' then
    raise exception 'name_invalid' using detail = 'A name holds no digits.';
  end if;
  if v ~ ('[' || person_name_symbols() || ']')
     or v ~ '^[ .''’-]' or v ~ '[ .''’-][.''’-]' or v ~ '[''’-]$' then
    raise exception 'name_invalid'
      using detail = 'A name holds letters with single spaces, dots, apostrophes or hyphens between them.';
  end if;
  if char_length(regexp_replace(v, '[ .''’-]', '', 'g')) < 2 then
    raise exception 'name_invalid' using detail = 'A name has at least two letters.';
  end if;
  if char_length(v) > p_max then
    raise exception 'name_too_long' using detail = format('A name is at most %s characters.', p_max);
  end if;
  return v;
end $$;

-- Trigger: the name column tg_argv[0] of a row written by an app user (signed in: auth.uid() is
-- set, also inside the app's own functions) is cleaned and checked, at most tg_argv[1] characters;
-- tg_argv[2], when given, replaces the error code (the Ishtagoshti form's parent_name_invalid). Null
-- stays null (whether a name is required is decided where it is written); an unchanged name is not
-- checked again, so names stored before 0047 stay as they are until edited. The dashboard and
-- pg_cron (nobody signed in) are not checked.
create or replace function clean_name_column() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_col  text := tg_argv[0];
  v_new  text := to_jsonb(new) ->> tg_argv[0];
  v_name text;
begin
  if auth.uid() is null or v_new is null then return new; end if;
  if tg_op = 'UPDATE' and v_new is not distinct from (to_jsonb(old) ->> v_col) then return new; end if;
  begin
    v_name := clean_person_name(v_new, tg_argv[1]::int);
  exception when raise_exception then
    if tg_nargs > 2 then raise exception '%', tg_argv[2]; end if;
    raise;
  end;
  if v_name is distinct from v_new then
    new := jsonb_populate_record(new, jsonb_build_object(v_col, v_name));
  end if;
  return new;
end $$;

drop trigger if exists students_name_clean on students;
create trigger students_name_clean before insert or update of full_name on students
  for each row execute function clean_name_column('full_name', '100');
drop trigger if exists guardians_name_clean on guardians;
create trigger guardians_name_clean before insert or update of full_name on guardians
  for each row execute function clean_name_column('full_name', '100');
drop trigger if exists person_details_name_clean on person_details;
create trigger person_details_name_clean before insert or update of emergency_name on person_details
  for each row execute function clean_name_column('emergency_name', '80');
drop trigger if exists person_details_diksha_clean on person_details;
create trigger person_details_diksha_clean before insert or update of diksha_name on person_details
  for each row execute function clean_name_column('diksha_name', '80');
drop trigger if exists ig_subscribers_name_clean on ig_subscribers;
create trigger ig_subscribers_name_clean before insert or update of parent_name on ig_subscribers
  for each row execute function clean_name_column('parent_name', '100', 'parent_name_invalid');

-- A login's name: 0028's guard, with the name rule above (it refused only control and invisible
-- characters) and the staff-name clash as before. Otherwise unchanged.
create or replace function guard_profile_details() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.id is distinct from old.id then
      raise exception 'profile_field_locked' using detail = 'id';
    end if;
    if new.email is distinct from old.email then
      raise exception 'profile_field_locked' using detail = 'email: it follows the sign-in email.';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'profile_field_locked' using detail = 'created_at';
    end if;
    if new.centre_id is distinct from old.centre_id then
      raise exception 'profile_field_locked' using detail = 'centre_id: set in the dashboard.';
    end if;
  end if;

  if auth.uid() is null then return new; end if;
  if new.full_name is distinct from old.full_name then
    new.full_name := clean_person_name(new.full_name, 80);
    if staff_name_taken(new.id, new.full_name) then
      raise exception 'name_taken' using detail = 'This is the name of the Guru or a coordinator. Add a surname or an initial.';
    end if;
  end if;
  if new.phone is distinct from old.phone then
    new.phone := nullif(btrim(new.phone), '');
    if new.phone !~ '^\+?[0-9 ]+$'
       or char_length(regexp_replace(new.phone, '[^0-9]', '', 'g')) not between 7 and 15 then
      raise exception 'phone_invalid' using detail = 'A phone number has 7 to 15 digits, with spaces and an optional + first.';
    end if;
  end if;
  return new;
end $$;

-- Sign-up: 0036's handle_new_user, with the name rule and the staff-name clash for a name given at
-- sign-up (it only trimmed and cut at 80). A login made without a name (the dashboard) keeps an
-- empty one, as before. A refused name refuses the sign-up; the app checks the same rule first. An
-- initiated name the rule refuses is dropped (never fails a sign-up). S4-02 (#280): notice_version
-- (the privacy notice the person ticked, the same shape as consents.notice_version) is kept with
-- the time in person_details; a missing or malformed one is left out, never failing the sign-up.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_meta   jsonb := coalesce(new.raw_user_meta_data, '{}');
  v_lang   text := v_meta ->> 'language';
  v_gender text := v_meta ->> 'gender';
  v_name   text := coalesce(v_meta ->> 'full_name', '');
  v_centre int;
  v_dob    date;
  v_phone  text := regexp_replace(coalesce(v_meta ->> 'phone', ''), '[\s-]', '', 'g');
  v_diksha text := nullif(btrim(coalesce(v_meta ->> 'diksha_name', '')), '');
  v_notice text := nullif(btrim(coalesce(v_meta ->> 'notice_version', '')), '');
  v_learn  text[];
begin
  if btrim(v_name, E' \t\r\n') <> '' then
    v_name := clean_person_name(v_name, 80);
    if staff_name_taken(new.id, v_name) then
      raise exception 'name_taken' using detail = 'This is the name of the Guru or a coordinator. Add a surname or an initial.';
    end if;
  else
    v_name := '';
  end if;
  begin
    v_dob := (v_meta ->> 'dob')::date;
    if v_dob > current_date or v_dob < date '1900-01-01' or v_dob > current_date - interval '18 years' then
      v_dob := null;
    end if;
  exception when others then v_dob := null;
  end;
  begin
    v_centre := (v_meta ->> 'centre_id')::int;
  exception when others then v_centre := null;
  end;
  if v_centre is not null and not exists (select 1 from centres where id = v_centre and active) then
    v_centre := null;
  end if;
  if v_gender is not null and not option_ok('gender', v_gender) then v_gender := null; end if;
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then v_phone := null; end if;
  if v_diksha is not null then
    begin v_diksha := clean_person_name(v_diksha, 80); exception when raise_exception then v_diksha := null; end;
  end if;
  if v_notice !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$' then v_notice := null; end if;
  if jsonb_typeof(v_meta -> 'learn') = 'array' then
    select coalesce(array_agg(distinct x), '{}') into v_learn
      from jsonb_array_elements_text(v_meta -> 'learn') x where option_ok('instrument', x);
  end if;

  insert into profiles (id, email, full_name, role, language, gender, centre_id, phone)
  values (new.id, new.email, v_name, 'pending',
          case when v_lang in ('en', 'te', 'hi') then v_lang else 'en' end, v_gender,
          coalesce(v_centre, (select min(id) from centres where active), 1), v_phone);
  if v_dob is not null or v_diksha is not null or cardinality(v_learn) > 0 or v_notice is not null then
    insert into person_details (profile_id, dob, diksha_name, learn_interests, notice_version, notice_accepted_at)
    values (new.id, v_dob, v_diksha, coalesce(v_learn, '{}'), v_notice, case when v_notice is not null then now() end);
  end if;
  if new.email_confirmed_at is not null then
    perform link_login_to_student(new.id, new.email);
  end if;
  return new;
end $$;

-- The Excel/CSV import (G3): 0014's import_students with the name rule (100 characters, as before)
-- before the duplicate check, so "same name and date of birth" compares cleaned names. Otherwise
-- unchanged; a refused name is the row's error (name_required, name_too_long, name_invalid).
create or replace function import_students(p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  r        jsonb;
  v_out    jsonb := '[]'::jsonb;
  v_name   text;
  v_dob    date;
  v_joined date;
  v_phone  text;
  v_email  text;
  v_pin    text;
  v_level  smallint;
  v_id     uuid;
  v_roll   text;
begin
  if not is_guru() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'too_many_rows' using detail = 'At most 500 rows in one import.';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_name := clean_person_name(r ->> 'full_name', 100);

      if coalesce(r ->> 'dob', '') = '' then raise exception 'dob_required'; end if;
      begin
        v_dob := (r ->> 'dob')::date;
      exception when others then
        raise exception 'dob_invalid';
      end;
      if v_dob > today_ist() or v_dob < today_ist() - interval '100 years' then raise exception 'dob_invalid'; end if;
      if v_dob > today_ist() - interval '18 years' then raise exception 'minor_use_form'; end if;

      v_joined := today_ist();
      if coalesce(r ->> 'joined_on', '') <> '' then
        begin
          v_joined := (r ->> 'joined_on')::date;
        exception when others then
          raise exception 'joined_invalid';
        end;
        if v_joined > today_ist() or v_joined < v_dob or v_joined < date '2000-01-01' then
          raise exception 'joined_invalid';
        end if;
      end if;

      v_phone := nullif(regexp_replace(coalesce(r ->> 'phone', ''), '[\s-]', '', 'g'), '');
      if v_phone is not null then
        if v_phone !~ '^\+?[0-9]{10,13}$' then raise exception 'phone_invalid'; end if;
        if exists (select 1 from students s
                    where right(regexp_replace(coalesce(s.phone, ''), '[^0-9]', '', 'g'), 10)
                        = right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 10)) then
          raise exception 'duplicate_phone';
        end if;
      end if;

      v_email := nullif(btrim(coalesce(r ->> 'email', '')), '');
      if v_email is not null then
        if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 200 then raise exception 'email_invalid'; end if;
        if exists (select 1 from students s where lower(s.email) = lower(v_email)) then
          raise exception 'duplicate_email';
        end if;
      end if;

      v_pin := nullif(btrim(coalesce(r ->> 'pincode', '')), '');
      if v_pin is not null and v_pin !~ '^[0-9]{6}$' then raise exception 'pincode_invalid'; end if;

      v_level := coalesce(nullif(r ->> 'level_id', '')::smallint, 1);
      if v_level not in (select id from levels) then raise exception 'level_invalid'; end if;

      if exists (select 1 from students s where lower(s.full_name) = lower(v_name) and s.dob = v_dob) then
        raise exception 'duplicate_student';
      end if;

      insert into students (full_name, dob, phone, email, area, pincode, level_id, joined_on)
      values (v_name, v_dob, v_phone, v_email,
              nullif(left(btrim(coalesce(r ->> 'area', '')), 100), ''), v_pin, v_level, v_joined)
      returning id, roll_no into v_id, v_roll;
      v_out := v_out || jsonb_build_object('line', r -> 'line', 'id', v_id, 'roll_no', v_roll);
    exception when others then
      v_out := v_out || jsonb_build_object('line', r -> 'line', 'error',
        case when sqlerrm ~ '^[a-z_]+$' then sqlerrm else 'row_failed' end);
    end;
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------- 1. a minor's guardian (#272)
-- Why a student's record breaks the minor rule, or null when it does not (adults, withdrawn records,
-- records gone). A minor needs a guardian with a phone, and a current data consent whose guardian is
-- one of this student's guardians (0003's consent alone could name nobody, or another child's parent).
create or replace function minor_rule_gap(p_student uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when not exists (select 1 from consents c where c.student_id = s.id and c.scope = 'data' and c.revoked_at is null)
      then 'minor_needs_consent'
    when not exists (select 1 from guardians g where g.student_id = s.id and coalesce(btrim(g.phone), '') <> '')
      then 'minor_needs_guardian'
    when not exists (select 1 from consents c join guardians g on g.id = c.guardian_id and g.student_id = c.student_id
                      where c.student_id = s.id and c.scope = 'data' and c.revoked_at is null)
      then 'minor_needs_consent'
  end
    from students s
   where s.id = p_student and s.withdrawn_at is null and is_minor(s)
$$;

-- At commit, when a student is added, the date of birth changes or a withdrawal is undone (0003's
-- trigger, now also on withdrawn_at). Refusals name the roll number only (0039, D4-17).
create or replace function check_minor_consent() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_gap text := minor_rule_gap(new.id);
begin
  if v_gap = 'minor_needs_guardian' then
    raise exception 'minor_needs_guardian'
      using detail = format('Student %s is under 18 and has no parent or guardian with a phone on record.', coalesce(new.roll_no, 'without roll number')),
            hint = 'Record the parent and their written consent in the same step (register_student).';
  elsif v_gap = 'minor_needs_consent' then
    raise exception 'minor_needs_consent'
      using detail = format('Student %s is under 18 and has no parental consent on record.', coalesce(new.roll_no, 'without roll number')),
            hint = 'Record the parent and their written consent in the same step (register_student).';
  end if;
  return null;
end $$;
drop trigger if exists students_minor_consent on students;
create constraint trigger students_minor_consent
  after insert or update of dob, withdrawn_at on students
  deferrable initially deferred
  for each row execute function check_minor_consent();

-- At commit, when a consent or guardian changes or goes (0025, 0028), with the same rule.
create or replace function recheck_minor_consent() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids uuid[];
  v_id  uuid;
  v_gap text;
begin
  if tg_op = 'UPDATE' then
    v_ids := array[old.student_id, new.student_id];
  else
    v_ids := array[old.student_id];
  end if;
  foreach v_id in array v_ids loop
    v_gap := minor_rule_gap(v_id);
    if v_gap = 'minor_needs_consent' then
      raise exception 'minor_needs_consent'
        using detail = format('Student %s is under 18 and would have no parental consent on record.', (select roll_no from students where id = v_id)),
              hint = 'Record a new consent first, or use withdraw_consent (the Guru).';
    elsif v_gap = 'minor_needs_guardian' then
      raise exception 'minor_needs_guardian'
        using detail = format('Student %s is under 18 and would have no parent or guardian with a phone on record.', (select roll_no from students where id = v_id));
    end if;
  end loop;
  return null;
end $$;

-- A consent names a guardian of its own student, or none (an adult's own consent).
create or replace function guard_consent_guardian() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- auth.uid(), not current_user: this function runs as its owner. No app function writes one either.
  if tg_op = 'INSERT' and new.method = 'email_code' and auth.uid() is not null then
    raise exception 'consent_method_not_allowed' using detail = 'A consent by email code is recorded only by its own function (none exists yet).';
  end if;
  if new.guardian_id is not null
     and not exists (select 1 from guardians g where g.id = new.guardian_id and g.student_id = new.student_id) then
    raise exception 'consent_guardian_mismatch' using detail = 'The consent''s guardian is not a guardian of this student.';
  end if;
  return new;
end $$;
drop trigger if exists consents_guardian_check on consents;
create trigger consents_guardian_check before insert or update of guardian_id, student_id on consents
  for each row execute function guard_consent_guardian();

-- ---------------------------------------------------------------- 3. gender set once by the student (#273)
-- 0036's guard, plus: a student's own write (About you) cannot change a gender already on their
-- record; it is kept. Staff change it (save_student_details); an empty one is filled as before.
create or replace function guard_student_gender() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.gender is not null and new.gender is distinct from old.gender
     and auth.uid() is not null and auth.uid() = old.profile_id then
    new.gender := old.gender;
    return new;
  end if;
  if current_user not in ('anon', 'authenticated') or new.gender is null then return new; end if;
  if tg_op = 'UPDATE' and new.gender is not distinct from old.gender then return new; end if;
  if not option_ok('gender', new.gender) then raise exception 'gender_unknown'; end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 4. the desk's centre (#274)
-- A student record written without a home centre gets the signed-in Guru's or coordinator's own
-- (active) centre; else the lowest active centre; else 1 (the old default). The desk form, the
-- import and the API all go through this column default; accept_sign_up (0046) names the
-- sign-up's centre itself.
create or replace function default_home_centre() returns smallint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select p.centre_id from profiles p join centres c on c.id = p.centre_id and c.active
      where p.id = auth.uid() and p.active and p.role in ('guru', 'coordinator')),
    (select min(id) from centres where active),
    1)::smallint
$$;
alter table students alter column home_centre_id set default default_home_centre();

-- ---------------------------------------------------------------- 5. possible duplicates (#274)
-- Name key for matching: NFC, lower case, . ' - and blanks as one space. Internal.
create or replace function person_name_key(p_name text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select btrim(regexp_replace(lower(normalize(coalesce(p_name, ''))), E'[\\s.''\u2019\\-]+', ' ', 'g'))
$$;

-- Staff: student records and waiting sign-ups that may be the person being typed in at the desk:
-- the same name and date of birth, or the same phone (its last 10 digits, when 7 or more are
-- given). A coordinator sees the sign-ups of their own centre (as on the waiting list), the Guru
-- all; student records of every centre. At most 10, students first. Each entry: kind ('student' or
-- 'sign_up'), id, roll_no (students), full_name, centre (name), since (joined or signed up),
-- withdrawn (students), matched (['name_dob'] and/or ['phone']). Error: not_allowed.
create or replace function possible_duplicates(p_full_name text, p_dob date default null, p_phone text default null)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_key    text := nullif(person_name_key(p_full_name), '');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone  text;
  v_centre smallint;
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  v_phone := case when char_length(v_digits) >= 7 then right(v_digits, 10) end;
  if (v_key is null or p_dob is null) and v_phone is null then return '[]'::jsonb; end if;
  select centre_id into v_centre from profiles where id = auth.uid();
  return coalesce((
    select jsonb_agg(y.j order by y.k, y.since desc)
      from (select x.* from (
        select 1 as k, s.joined_on::timestamptz as since,
               jsonb_build_object('kind', 'student', 'id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name,
                 'centre', (select c.name from centres c where c.id = s.home_centre_id), 'since', s.joined_on,
                 'withdrawn', s.withdrawn_at is not null,
                 'matched', to_jsonb(array_remove(array[
                   case when v_key is not null and p_dob is not null and s.dob = p_dob
                         and person_name_key(s.full_name) = v_key then 'name_dob' end,
                   case when v_phone is not null
                         and right(regexp_replace(coalesce(s.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone then 'phone' end],
                   null))) as j
          from students s
         where (v_key is not null and p_dob is not null and s.dob = p_dob and person_name_key(s.full_name) = v_key)
            or (v_phone is not null and right(regexp_replace(coalesce(s.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone)
        union all
        select 2, p.created_at,
               jsonb_build_object('kind', 'sign_up', 'id', p.id, 'roll_no', null, 'full_name', p.full_name,
                 'centre', (select c.name from centres c where c.id = p.centre_id), 'since', (p.created_at at time zone 'Asia/Kolkata')::date,
                 'withdrawn', false,
                 'matched', to_jsonb(array_remove(array[
                   case when v_key is not null and p_dob is not null and d.dob = p_dob
                         and person_name_key(p.full_name) = v_key then 'name_dob' end,
                   case when v_phone is not null
                         and right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone then 'phone' end],
                   null)))
          from profiles p
          left join person_details d on d.profile_id = p.id and d.student_id is null
         where p.role in ('pending', 'student') and p.active
           and not exists (select 1 from students s where s.profile_id = p.id)
           and not exists (select 1 from ig_subscribers i where i.profile_id = p.id)
           and (is_guru() or p.centre_id = v_centre)
           and ((v_key is not null and p_dob is not null and d.dob = p_dob and person_name_key(p.full_name) = v_key)
                or (v_phone is not null and right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone))
      ) x order by x.k, x.since desc limit 10) y), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- 6. no automatic link onto a minor (#276)
-- P1-18/S1-04, S2-01: a confirmed login whose email was saved on a CHILD's record became that child
-- (role student, the child's date of birth, area, QR code, visits, the parent's emergency contact),
-- and a parent's own sign-up was linked to the child when the parent's email had been typed on the
-- child's record. The two automatic paths (0046's versions) now skip a record of someone under 18;
-- the Guru links a minor's record to a login explicitly (link_student_login). Adults: as before (#96).

-- Path 1: the login confirms its email (also a changed email, and Accept's "already on record" step).
create or replace function link_login_to_student(p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare s_id uuid;
begin
  if p_email is null or not login_awaits_record(p_user) then
    return;
  end if;
  select s.id into s_id from students s
   where lower(s.email) = lower(p_email) and s.profile_id is null and not is_minor(s)
   order by s.created_at limit 1;
  if s_id is null then return; end if;
  update students set profile_id = p_user where id = s_id;
  update profiles set role = 'student' where id = p_user and role <> 'student';
end $$;

-- Path 2: an email saved on a record without a login links a confirmed login with that email,
-- unless the record is a minor's.
create or replace function link_student_email() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare p_id uuid;
begin
  if new.profile_id is not null or new.email is null or is_minor(new) then return new; end if;
  select p.id into p_id
    from profiles p join auth.users u on u.id = p.id
   where lower(u.email) = lower(new.email)
     and u.email_confirmed_at is not null
     and login_awaits_record(p.id)
   order by p.created_at
   limit 1;
  if p_id is null then return new; end if;
  new.profile_id := p_id;
  update profiles set role = 'student' where id = p_id and role <> 'student';
  return new;
end $$;

-- S2-01: 0038's guard refused a parent's email on a MINOR's record (any guardian's) and a guardian's
-- email equal to their OWN child's record. Now a guardian's email may not be the email of ANY child's
-- record either (guardian_email_on_minor), checked when the guardian's email is set or changed. An
-- adult student may still share a guardian's email (a parent learning too, D1a-15): with no automatic
-- link onto a minor's record, that email can only ever link the adult's own record.
create or replace function guard_minor_email() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.email is null then return new; end if;
  if tg_table_name = 'students' then
    if not is_minor(new) then return new; end if;
    if exists (select 1 from guardians g where lower(g.email) = lower(new.email)) then
      raise exception 'guardian_email_on_minor' using detail = 'A child''s record cannot hold a parent''s email.';
    end if;
  else
    if tg_op = 'UPDATE' and lower(new.email) is not distinct from lower(old.email) then return new; end if;
    if exists (select 1 from students s where lower(s.email) = lower(new.email) and is_minor(s)) then
      raise exception 'guardian_email_on_minor' using detail = 'A child''s record cannot hold a parent''s email.';
    end if;
  end if;
  return new;
end $$;
-- S2-03: a student record inserted by an app user (the desk, the import, the API) gets no login, a
-- fresh QR code and the inserting user as creator, whatever was sent; a login is linked only by the
-- paths above or by the Guru. Otherwise 0025's guard (updates unchanged).
create or replace function guard_student_frozen() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    if new.dob is null then
      raise exception 'dob_required' using detail = 'A date of birth decides whether parental consent is needed.';
    end if;
    if new.withdrawn_at is not null or new.withdrawn_note is not null then
      raise exception 'student_field_locked' using detail = 'withdrawn_at';
    end if;
    new.profile_id := null;
    new.qr_token := gen_random_uuid();
    new.created_by := auth.uid();
    new.created_at := now();
    return new;
  end if;

  if old.withdrawn_at is not null then
    raise exception 'student_withdrawn' using detail = 'Consent was withdrawn: the record is frozen until the Guru erases it or the parent consents again.';
  end if;
  if new.profile_id is distinct from old.profile_id then
    raise exception 'student_field_locked' using detail = 'profile_id: link a login with link_student_login (the Guru) or by email.';
  end if;
  if new.qr_token is distinct from old.qr_token then
    raise exception 'student_field_locked' using detail = 'qr_token';
  end if;
  if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'student_field_locked' using detail = 'created_by';
  end if;
  if new.withdrawn_at is distinct from old.withdrawn_at or new.withdrawn_note is distinct from old.withdrawn_note then
    raise exception 'student_field_locked' using detail = 'withdrawn_at: use withdraw_consent (the Guru).';
  end if;
  if new.dob is null then
    raise exception 'dob_required' using detail = 'A date of birth decides whether parental consent is needed.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 7. the notice ticked at sign-up (#280)
-- S4-02: an adult who signs up ticks the privacy notice (the app sends notice_version, forms-fix);
-- handle_new_user (above) keeps it here. The row moves to the student record with the rest of the
-- sign-up's details when the login is linked (0036).
alter table person_details add column if not exists notice_version text
  check (notice_version is null or notice_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$');
alter table person_details add column if not exists notice_accepted_at timestamptz;

-- Register a student (C2): 0046's list, plus notice_version (null: the person did not tick the notice
-- at sign-up; Accept refuses, Fill the form records it at the desk).
create or replace function waiting_sign_ups() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when not is_staff() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'full_name', p.full_name, 'email', p.email, 'phone', p.phone, 'gender', p.gender,
             'centre_id', p.centre_id, 'centre_name', (select c.name from centres c where c.id = p.centre_id),
             'dob', d.dob, 'created_at', p.created_at,
             'emergency_relation', d.emergency_relation, 'emergency_name', d.emergency_name,
             'emergency_phone', d.emergency_phone, 'heard_via', d.heard_via, 'referred_by', d.referred_by,
             'heard_other', d.heard_other, 'occupation', d.occupation, 'occupation_other', d.occupation_other,
             'service_areas', to_jsonb(coalesce(d.service_areas, '{}')), 'service_other', d.service_other,
             'diksha_name', d.diksha_name, 'learn_interests', to_jsonb(coalesce(d.learn_interests, '{}')),
             'notice_version', d.notice_version)
           order by p.created_at desc)
      from profiles p
      join auth.users u on u.id = p.id
      left join person_details d on d.profile_id = p.id and d.student_id is null
     where p.role in ('pending', 'student') and p.active and u.email_confirmed_at is not null
       and not exists (select 1 from students s where s.profile_id = p.id)
       and not exists (select 1 from ig_subscribers i where i.profile_id = p.id)
       and (is_guru() or p.centre_id = (select me.centre_id from profiles me where me.id = auth.uid()))
       and p.created_at > now() - interval '180 days'), '[]') end
$$;

-- Accept (0046), refusing a sign-up without a ticked notice (notice_not_accepted) after the age check.
-- Its "already registered at the desk" step goes through link_login_to_student, which now skips a
-- minor's record (#276). Otherwise unchanged.
create or replace function accept_sign_up(p_profile uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p     profiles;
  v_email text;
  v_conf  timestamptz;
  d       person_details;
  s       students;
begin
  if not coalesce(is_staff(), false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v_p from profiles where id = p_profile for update;
  if not found then raise exception 'sign_up_not_found'; end if;
  if not coalesce(is_guru(), false) and v_p.centre_id is distinct from (select me.centre_id from profiles me where me.id = auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501', detail = 'A coordinator accepts the sign-ups of their own centre.';
  end if;

  select * into s from students where profile_id = p_profile;
  if found then
    if s.request_id = p_profile then
      return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name, 'linked', true,
                                'repeated', true, 'existing', false);
    end if;
    raise exception 'already_registered' using detail = 'This login is already on a student record.';
  end if;
  if not login_awaits_record(p_profile) or exists (select 1 from ig_subscribers i where i.profile_id = p_profile) then
    raise exception 'not_waiting' using detail = 'Only an active login waiting for the desk can be accepted.';
  end if;
  select lower(u.email), u.email_confirmed_at into v_email, v_conf from auth.users u where u.id = p_profile;
  if v_conf is null or v_email is null then
    raise exception 'email_not_confirmed' using detail = 'The person has not opened the link in the sign-up email yet.';
  end if;

  select * into d from person_details where profile_id = p_profile and student_id is null;
  if d.dob is null then
    raise exception 'dob_required' using detail = 'The sign-up has no date of birth: use Fill the form.';
  end if;
  if d.dob > today_ist() - interval '18 years' then
    raise exception 'minor_needs_desk' using detail = 'Under 18: the desk registers the student with a parent.';
  end if;
  if d.notice_version is null then
    raise exception 'notice_not_accepted' using detail = 'The sign-up did not tick the privacy notice: use Fill the form.';
  end if;
  if btrim(coalesce(v_p.full_name, '')) = '' then raise exception 'name_required'; end if;

  -- Registered at the desk already (the link did not happen then): link, do not make a second record.
  perform link_login_to_student(p_profile, v_email);
  select * into s from students where profile_id = p_profile;
  if found then
    return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name, 'linked', true,
                              'repeated', false, 'existing', true);
  end if;

  insert into students (full_name, dob, phone, email, level_id, home_centre_id, request_id, profile_id)
  values (btrim(v_p.full_name), d.dob, v_p.phone, v_email, 1,
          coalesce(v_p.centre_id, (select min(id) from centres where active), 1)::smallint, p_profile, p_profile)
  returning * into s;
  update profiles set role = 'student' where id = p_profile and role <> 'student';
  return jsonb_build_object('id', s.id, 'roll_no', s.roll_no, 'full_name', s.full_name, 'linked', true,
                            'repeated', false, 'existing', false);
end $$;

-- ---------------------------------------------------------------- who may run them
-- The name rule is pure and runs as the person saving (register_student and the import run as the
-- caller); the column default runs as the person inserting. Triggers and helpers are internal.
revoke execute on function person_name_symbols(), clean_person_name(text, integer), default_home_centre(),
  possible_duplicates(text, date, text) from public, anon;
grant execute on function person_name_symbols(), clean_person_name(text, integer), default_home_centre(),
  possible_duplicates(text, date, text) to authenticated;
revoke execute on function clean_name_column(), minor_rule_gap(uuid), guard_consent_guardian(),
  person_name_key(text) from public, anon, authenticated;
revoke execute on function check_minor_consent(), recheck_minor_consent(), guard_student_gender()
  from public, anon, authenticated;

-- ---------------------------------------------------------------- descriptions
comment on function person_name_symbols is 'The characters a person''s name may not hold (not a letter, vowel sign or separator), as a regex bracket body (#271).';
comment on function clean_person_name is 'Cleans (NFC, apostrophes, blanks) and checks a person''s name; returns it or raises name_required / name_too_long / name_invalid (#271).';
comment on function clean_name_column is 'Trigger: applies clean_person_name to a name column written by a signed-in app user (#271).';
comment on function minor_rule_gap is 'Why a student breaks the minor rule (minor_needs_guardian / minor_needs_consent), or null (#272). Internal.';
comment on function check_minor_consent is 'Trigger at commit: a minor added, made a minor or brought back needs a guardian with a phone and that guardian''s data consent (#272).';
comment on function recheck_minor_consent is 'Trigger at commit: a consent or guardian change keeps every minor''s guardian with a phone and data consent (#272).';
comment on function guard_consent_guardian is 'Trigger: a consent''s guardian belongs to the same student (#272).';
comment on function guard_student_gender is 'Trigger: a student''s gender set by an app user is an active option; the student''s own write keeps a gender already set (#273).';
comment on function default_home_centre is 'Default home centre of a new student: the signed-in staff member''s active centre, else the lowest active centre (#274).';
comment on function person_name_key is 'Name key for duplicate matching (NFC, lower case, punctuation as space). Internal.';
comment on function possible_duplicates is 'Staff: student records and waiting sign-ups with the same name and date of birth or the same phone, for a "Possible duplicate" warning (#274).';
comment on function import_students is 'G3, Guru: imports adult students from a list (Excel or CSV in the app); each row saved or refused on its own; returns the roll number or the error per row (docs/DECISIONS.md #46, names #271).';
comment on function guard_minor_email is 'Trigger: a child''s record holds no guardian''s email, and a guardian''s email is no child''s record email (guardian_email_on_minor; D1a-15, #276).';
comment on function guard_student_frozen is 'Trigger: app users cannot set or change profile_id, qr_token, created_by or withdrawal fields (an insert gets none, a fresh code, the inserter), nor leave out the date of birth; a withdrawn record is frozen (#276).';
comment on function link_login_to_student is 'Links a confirmed login waiting for a record (pending, or a student without one) to the ADULT student record with the same email and makes it a student; a minor''s record is linked only by the Guru (#276).';
comment on function link_student_email is 'Trigger: when an ADULT student record gets an email, links it to a confirmed login with that email that waits for a record; never a minor''s record (#276).';
comment on function accept_sign_up(uuid) is 'Staff (a coordinator: own centre): registers an adult confirmed sign-up that ticked the privacy notice from its own data and links the login; a second call returns the first record (repeated).';
comment on function waiting_sign_ups is 'C2 (staff): confirmed sign-ups waiting for the desk, with what they gave and the notice version they ticked (#280).';