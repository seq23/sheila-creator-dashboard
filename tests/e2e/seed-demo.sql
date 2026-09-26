-- Demo data for the help screenshots job and the deals/voice/help e2e spec (section 12c:
-- "demo data only, never her real content"). Every row id starts with demo_ or uses version 9001
-- so tests/e2e/demo.ts can remove it again; brands/pitches/deals/narrations are reset whole
-- because only these specs create them. Idempotent: it clears before it inserts.

DELETE FROM posts WHERE id LIKE 'demo_%';
DELETE FROM narrations;
DELETE FROM pitches;
DELETE FROM deals;
DELETE FROM brand_contacts;
DELETE FROM brands;
DELETE FROM account_stats WHERE id LIKE 'demo_%';
DELETE FROM clips WHERE id LIKE 'demo_%';
DELETE FROM assets WHERE id LIKE 'demo_%';
DELETE FROM dumps WHERE id LIKE 'demo_%';
DELETE FROM brand_profile WHERE version = 9001;
DELETE FROM research_briefs WHERE version = 9001;
UPDATE media_kit SET bio = '', photo_r2_key = NULL, featured_clip_ids = '[]', past_partners = '[]', rates = NULL, public_slug = 'sheila', contact_email = NULL, updated_at = NULL WHERE id = 1;
UPDATE voice SET sample_r2_key = NULL, consent_at = NULL, consent_text = NULL, model_r2_key = NULL, elevenlabs_voice_id = NULL, enabled = 0, updated_at = NULL WHERE id = 1;

INSERT INTO brand_profile (version, sections, locked, locked_at, source) VALUES (9001, '{"who": "Demo creator: a hostess and lifestyle creator who makes everyday gatherings feel special.", "audience": "Women 30-55 in the US who love hosting, table styling and easy entertaining.", "goals": "90 days: post 10 clips a week and land 2 paid partnerships. 1 year: a steady brand-deal income.", "voice": "Warm, gracious, a little playful; short sentences; never salesy.", "themes": "Table styling\nEasy entertaining\nHoliday hosting\nEveryday luxury", "do_dont": "Do: show real homes and real food. Don''t: fake reviews or hard selling.", "off_limits": "Alcohol, gambling, diet pills", "deal_fit": "Home, tableware, candles, florals, kitchen and gifting brands.", "ctas": "Follow for more hosting ideas; save this for your next gathering."}', 1, '2026-09-20T12:00:00.000Z', 'edited');
INSERT INTO research_briefs (version, body, sources, status, approved_at) VALUES (9001, '{"audience": [{"text": "Most engaged viewers are women 30-55.", "source_ids": ["s1"], "basis": "her_data", "confidence": "solid"}], "themes": [{"title": "Table styling", "claims": [{"text": "Tablescape videos get the most saves.", "source_ids": ["s1"], "basis": "web", "confidence": "solid"}]}], "hooks": [{"text": "Open on the finished table, then rewind.", "source_ids": ["s1"], "basis": "web", "confidence": "solid"}], "cut_styles": [{"text": "Hook-first cuts under 30 seconds hold best.", "source_ids": ["s1"], "basis": "web", "confidence": "solid"}], "best_times": {"tiktok": [], "instagram": [], "youtube": []}, "comparable_creators": [{"handle": "@demo.hostess", "platform": "tiktok", "why": {"text": "Same niche, similar size.", "source_ids": ["s1"], "basis": "web", "confidence": "solid"}}, {"handle": "@demo.tablescapes", "platform": "instagram", "why": {"text": "Runs paid partnerships with home brands.", "source_ids": ["s1"], "basis": "web", "confidence": "solid"}}], "shot_list": [{"text": "A 20-second table reset before guests arrive.", "source_ids": ["s1"], "basis": "web", "confidence": "solid"}]}', '[{"id": "s1", "url": "https://example.org/demo-source", "title": "Demo source", "kind": "web"}]', 'approved', '2026-09-21T12:00:00.000Z');
INSERT INTO dumps (id, door, notes, status, clips_made, created_at, ready_at) VALUES ('demo_dump', 'new', 'Demo footage: Sunday brunch table', 'reviewed', 8, '2026-09-22T15:00:00.000Z', '2026-09-22T16:00:00.000Z');
INSERT INTO assets (id, dump_id, file_name, mime_type, size_bytes, r2_key, upload_status) VALUES ('demo_ast', 'demo_dump', 'demo-brunch.mp4', 'video/mp4', 1000000, 'raw/demo_dump/demo_ast', 'uploaded');
INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, caption, hashtags, score, r2_key, media_token, status, reviewed_at) VALUES ('demo_clip_1', 'demo_ast', 'demo_dump', 0, 28, 'hook_first', 'Set a brunch table in 60 seconds', 'Demo caption for: Set a brunch table in 60 seconds', '#hosting #tablescape', 0.95, 'clips/demo_clip_1.mp4', 'demotoken0xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'approved', '2026-09-22T17:00:00.000Z');
INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, caption, hashtags, score, r2_key, media_token, status, reviewed_at) VALUES ('demo_clip_2', 'demo_ast', 'demo_dump', 30, 58, 'hook_first', 'The one napkin fold everyone asks about', 'Demo caption for: The one napkin fold everyone asks about', '#hosting #tablescape', 0.91, 'clips/demo_clip_2.mp4', 'demotoken1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'approved', '2026-09-22T17:00:00.000Z');
INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, caption, hashtags, score, r2_key, media_token, status, reviewed_at) VALUES ('demo_clip_3', 'demo_ast', 'demo_dump', 60, 88, 'hook_first', 'Candles, but make it Sunday', 'Demo caption for: Candles, but make it Sunday', '#hosting #tablescape', 0.87, 'clips/demo_clip_3.mp4', 'demotoken2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'approved', '2026-09-22T17:00:00.000Z');
INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, caption, hashtags, score, r2_key, media_token, status, reviewed_at) VALUES ('demo_clip_4', 'demo_ast', 'demo_dump', 90, 118, 'hook_first', 'Holiday table on a budget', 'Demo caption for: Holiday table on a budget', '#hosting #tablescape', 0.83, 'clips/demo_clip_4.mp4', 'demotoken3xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'approved', '2026-09-22T17:00:00.000Z');
INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, caption, hashtags, score, r2_key, media_token, status, reviewed_at) VALUES ('demo_clip_5', 'demo_ast', 'demo_dump', 120, 148, 'hook_first', 'Three-ingredient party board', 'Demo caption for: Three-ingredient party board', '#hosting #tablescape', 0.79, 'clips/demo_clip_5.mp4', 'demotoken4xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'approved', '2026-09-22T17:00:00.000Z');
INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, caption, hashtags, score, r2_key, media_token, status, reviewed_at) VALUES ('demo_clip_6', 'demo_ast', 'demo_dump', 150, 178, 'hook_first', 'How I reset after guests leave', 'Demo caption for: How I reset after guests leave', '#hosting #tablescape', 0.75, 'clips/demo_clip_6.mp4', 'demotoken5xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'approved', '2026-09-22T17:00:00.000Z');
INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, caption, hashtags, score, r2_key, media_token, status, reviewed_at) VALUES ('demo_clip_7', 'demo_ast', 'demo_dump', 180, 208, 'hook_first', 'The easiest centerpiece ever', 'Demo caption for: The easiest centerpiece ever', '#hosting #tablescape', 0.71, 'clips/demo_clip_7.mp4', 'demotoken6xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'approved', '2026-09-22T17:00:00.000Z');
INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, caption, hashtags, score, r2_key, media_token, status, reviewed_at) VALUES ('demo_clip_8', 'demo_ast', 'demo_dump', 210, 238, 'hook_first', 'My go-to hosting playlist trick', 'Demo caption for: My go-to hosting playlist trick', '#hosting #tablescape', 0.67, 'clips/demo_clip_8.mp4', 'demotoken7xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'approved', '2026-09-22T17:00:00.000Z');
-- Looks (jobs/looks.json): every demo clip was made in one, and two new ones wait in Review, so
-- the Looks guides picture the Look chip, Change look and a grid.
UPDATE clips SET look = CASE id WHEN 'demo_clip_1' THEN 'bold_hook' WHEN 'demo_clip_2' THEN 'clean' WHEN 'demo_clip_3' THEN 'cinematic' WHEN 'demo_clip_4' THEN 'brand_card' WHEN 'demo_clip_5' THEN 'split' WHEN 'demo_clip_6' THEN 'reaction' ELSE 'hero_strip' END, parts = '[[0,28]]' WHERE id LIKE 'demo_clip_%';
UPDATE clips SET layout = '{"cells":[{"kind":"self"},{"kind":"clip","clip_id":"demo_clip_1"}],"voice":0}' WHERE id = 'demo_clip_5';
INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, caption, hashtags, score, r2_key, media_token, status, look, parts) VALUES ('demo_look_1', 'demo_ast', 'demo_dump', 210, 240, 'talking_head', 'Brunch for six in three moves', 'Demo caption for: Brunch for six in three moves', '#hosting #brunch', 0.93, 'clips/demo_clip_8.mp4', 'demolooks8xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'draft', 'karaoke', '[[210,240]]');
INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, caption, hashtags, score, r2_key, media_token, status, look, parts, layout) VALUES ('demo_look_2', 'demo_ast', 'demo_dump', 240, 270, 'montage', 'Four tables, one weekend', 'Demo caption for: Four tables, one weekend', '#tablescape', 0.88, 'clips/demo_clip_9.mp4', 'demolooks9xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'draft', 'grid_four', '[[240,270]]', '{"cells":[{"kind":"self"},{"kind":"clip","clip_id":"demo_clip_2"},{"kind":"clip","clip_id":"demo_clip_3"},{"kind":"zoom","zoom":1.35}],"voice":0}');
INSERT INTO account_stats (id, platform, captured_at, followers, avg_views, source) VALUES ('demo_stats_tiktok', 'tiktok', '2026-09-24T12:00:00.000Z', 12400, 3100, 'api');
INSERT INTO account_stats (id, platform, captured_at, followers, avg_views, source) VALUES ('demo_stats_instagram', 'instagram', '2026-09-24T12:00:00.000Z', 8200, 1900, 'api');
INSERT INTO account_stats (id, platform, captured_at, followers, avg_views, source) VALUES ('demo_stats_youtube', 'youtube', '2026-09-24T12:00:00.000Z', 2100, 900, 'api');
UPDATE media_kit SET bio = 'Hosting, table styling and everyday luxury for women who love to gather.', featured_clip_ids = '["demo_clip_1","demo_clip_2","demo_clip_3"]', past_partners = '["Demo Candle Co.","Demo Linens"]', contact_email = 'partnerships@demo-creator.example', updated_at = '2026-09-24T12:00:00.000Z' WHERE id = 1;
INSERT INTO brands (id, name, website, program_url, socials, fit_score, fit_reasons, why_now, source_links, origin, status) VALUES ('demo_brand_1', 'Maison Lumière Candles', 'https://maisonlumiere.example/', NULL, '{"instagram": "https://www.instagram.com/maisonlumiere"}', 0.96, '["Matches your \"Table styling\" theme", "Sponsors creators your size"]', 'Sponsored 3 creators in your niche this month', '["https://maisonlumiere.example/pages/creators"]', 'finder', 'saved');
INSERT INTO brand_contacts (id, brand_id, kind, value, found_on_url) VALUES ('demo_ct_1', 'demo_brand_1', 'role_email', 'partnerships@maisonlumiere.example', 'https://maisonlumiere.example/pages/contact');
INSERT INTO brands (id, name, website, program_url, socials, fit_score, fit_reasons, why_now, source_links, origin, status) VALUES ('demo_brand_2', 'Golden Hour Tableware', 'https://goldenhourtable.example/', NULL, '{"instagram": "https://www.instagram.com/goldenhourtable"}', 0.9, '["Hosting and entertaining fit", "Audience overlap: women 30-55"]', 'Ran #ad posts with 2 creators from your research brief', '["https://goldenhourtable.example/pages/creators"]', 'finder', 'saved');
INSERT INTO brand_contacts (id, brand_id, kind, value, found_on_url) VALUES ('demo_ct_2', 'demo_brand_2', 'role_email', 'partnerships@goldenhourtable.example', 'https://goldenhourtable.example/pages/contact');
INSERT INTO brands (id, name, website, program_url, socials, fit_score, fit_reasons, why_now, source_links, origin, status) VALUES ('demo_brand_3', 'Petal Post Florals', 'https://petalpost.example/', NULL, '{"instagram": "https://www.instagram.com/petalpost"}', 0.85, '["Floral styling appears in your top clips"]', NULL, '["https://petalpost.example/pages/creators"]', 'finder', 'saved');
INSERT INTO brand_contacts (id, brand_id, kind, value, found_on_url) VALUES ('demo_ct_3', 'demo_brand_3', 'role_email', 'partnerships@petalpost.example', 'https://petalpost.example/pages/contact');
INSERT INTO deals (id, brand_id, stage) VALUES ('demo_deal_2', 'demo_brand_2', 'drafted');
INSERT INTO deals (id, brand_id, stage) VALUES ('demo_deal_3', 'demo_brand_3', 'sent');
INSERT INTO pitches (id, brand_id, contact_id, subject, body, dm_text, followup_1, followup_2, clip_links, status) VALUES ('demo_pitch_2', 'demo_brand_2', 'demo_ct_2', 'Creator partnership idea: Golden Hour Tableware × Sheila', 'Hi Golden Hour Tableware team,

I''m Sheila, and I set a table on camera most weeks. Your stoneware is already in my Sunday brunch videos.
My audience: women 30-55 who love hosting; 12.4K followers on TikTok (about 3.1K views a video).
Two clips that show my style:
https://demo.example/media/1
https://demo.example/media/2
Media kit: http://localhost:8787/kit/sheila

Would you be open to a paid partnership this season: one video on TikTok and Instagram featuring your stoneware?

Sheila', 'Hi Golden Hour! I set tables for 12K hosting lovers on TikTok and I would love to feature your stoneware. Media kit: http://localhost:8787/kit/sheila', 'Hi again, just floating this back up. Media kit: http://localhost:8787/kit/sheila Sheila', 'Last note from me on this one. If the timing is wrong, no problem at all. Sheila', '[]', 'drafted');
INSERT INTO pitches (id, brand_id, contact_id, subject, body, dm_text, followup_1, followup_2, clip_links, status, sent_at, next_followup_at) VALUES ('demo_pitch_3', 'demo_brand_3', 'demo_ct_3', 'Creator partnership idea: Petal Post Florals × Sheila', 'Hi Petal Post Florals team,

I''m Sheila, and I set a table on camera most weeks. Your bouquets is already in my Sunday brunch videos.
My audience: women 30-55 who love hosting; 12.4K followers on TikTok (about 3.1K views a video).
Two clips that show my style:
https://demo.example/media/1
https://demo.example/media/2
Media kit: http://localhost:8787/kit/sheila

Would you be open to a paid partnership this season: one video on TikTok and Instagram featuring your bouquets?

Sheila', 'Hi Petal Post! Media kit: http://localhost:8787/kit/sheila', 'Hi again, floating this back up. Sheila', 'Last note from me. Sheila', '[]', 'sent', '2026-09-20T12:00:00.000Z', '2026-09-25T12:00:00.000Z');
