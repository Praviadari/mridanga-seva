-- The standard mridanga pranam as the class's "Mantra before practice" (#405), chosen by Praveen 02-11-2026 (full text).
-- Same for TEST (run 02-11-2026, id 2) and LIVE (paste in the SQL editor on the lead's word). Added once; run twice adds nothing.
-- Or the facilitator types it in the app: Practice tools > Add the mantra.
insert into practice_mantras (title, devanagari, telugu, roman, meaning_en, meaning_te, meaning_hi, source, sort, active)
select 'Mṛdaṅga praṇām',
$d$नमो जगन्नाथसुताय नमो मृदङ्गाय नमः ।
लावण्यरसमाधुरीसहस्रगुणसंयुक्तम् ।
नमो मृदङ्गाय नमो नमः ।
नमो बलदेवाय नमो नमः ॥$d$,
$t$నమో జగన్నాథసుతాయ నమో మృదంగాయ నమః ।
లావణ్యరసమాధురీసహస్రగుణసంయుక్తమ్ ।
నమో మృదంగాయ నమో నమః ।
నమో బలదేవాయ నమో నమః ॥$t$,
$r$namo jagannātha-sutāya namo mṛdaṅgāya namaḥ
lāvaṇya-rasa-mādhurī-sahasra-guṇa-saṁyuktam
namo mṛdaṅgāya namo namaḥ
namo baladevāya namo namaḥ$r$,
$e$Obeisances to the son of Jagannātha (Śrī Caitanya), and to the mṛdaṅga, full of the sweetness of beauty and a thousand good qualities. Obeisances again and again to the mṛdaṅga; obeisances again and again to Lord Baladeva.$e$,
$te$జగన్నాథుని పుత్రునికి (శ్రీ చైతన్యునికి), లావణ్య రస మాధుర్యంతో, వేయి గుణాలతో కూడిన మృదంగానికి నమస్కారం. మృదంగానికి మళ్ళీ మళ్ళీ నమస్కారం; శ్రీ బలదేవునికి మళ్ళీ మళ్ళీ నమస్కారం.$te$,
$h$जगन्नाथ के पुत्र (श्री चैतन्य) को और मृदंग को नमस्कार, जो सौंदर्य-रस की मधुरता और सहस्र गुणों से युक्त है। मृदंग को बार-बार नमस्कार; भगवान बलदेव को बार-बार नमस्कार।$h$,
'Traditional praṇām, cited from the Nāradīya Candrodaya Candrikā. Say it before playing.',
1, true
where not exists (select 1 from practice_mantras where title = 'Mṛdaṅga praṇām');
select id, title, active, char_length(roman) as roman_len from practice_mantras order by sort, id;
