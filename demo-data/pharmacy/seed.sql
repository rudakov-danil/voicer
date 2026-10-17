-- Демо аптечной сети «Садыхан»: организация, аптеки, фармацевты, план смены.
-- Скрипт, правила допродаж, возражения и правила общения ставит install_pack.py (пакет «Аптечная сеть»).
BEGIN;
INSERT INTO auth.organizations (id, name, slug, org_type, industry, currency, timezone, is_active, created_at, updated_at)
VALUES ('ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', 'Аптеки «Садыхан»', 'pharmacy-demo', 'retail', 'pharmacy', 'KZT', 'Asia/Almaty', true, now(), now())
ON CONFLICT (id) DO UPDATE SET industry = 'pharmacy', currency = 'KZT', timezone = 'Asia/Almaty';
INSERT INTO admin_schema.stores (id, organization_id, name, address, is_active, created_at, updated_at)
VALUES ('12b04452-d47e-506a-868f-8f5f2a92f561', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', 'Садыхан · Абая', 'Алматы, пр. Абая, 52', true, now(), now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.stores (id, organization_id, name, address, is_active, created_at, updated_at)
VALUES ('a3ef6c71-2e10-5c88-b832-bdae2a135b9d', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', 'Садыхан · Самал', 'Алматы, мкр Самал-2, 58', true, now(), now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.stores (id, organization_id, name, address, is_active, created_at, updated_at)
VALUES ('548d3702-7926-576b-a32c-0bafbdfa4f05', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', 'Садыхан · Есиль', 'Астана, Левый берег, ул. Сыганак, 14', true, now(), now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('8aa2b5c1-3391-51e2-8806-97f1ed4ce6ae', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', '12b04452-d47e-506a-868f-8f5f2a92f561', 'Айгерим', 'Нурланова', true, now() - interval '300 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('56a17999-9e4f-5a9c-b7af-a00589869239', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', '12b04452-d47e-506a-868f-8f5f2a92f561', 'Ержан', 'Сеитов', true, now() - interval '300 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('9380be80-97c0-50f3-abc0-a4cebf60974a', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', '12b04452-d47e-506a-868f-8f5f2a92f561', 'Мария', 'Ким', true, now() - interval '300 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('7f09d411-9b54-5ff6-b9c7-1a1939dd7291', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', 'a3ef6c71-2e10-5c88-b832-bdae2a135b9d', 'Асель', 'Жумабаева', true, now() - interval '300 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('5a9f80d5-fb7d-5cda-9843-b19b7d646099', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', 'a3ef6c71-2e10-5c88-b832-bdae2a135b9d', 'Даурен', 'Беков', true, now() - interval '300 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('3b1620c3-ef15-5780-ac8e-426101daceaa', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', '548d3702-7926-576b-a32c-0bafbdfa4f05', 'Светлана', 'Петренко', true, now() - interval '300 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('94383b37-c3ee-572b-be84-216dbcbe5003', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', '548d3702-7926-576b-a32c-0bafbdfa4f05', 'Тимур', 'Омаров', true, now() - interval '300 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('dbeab7ea-446a-5a8d-a75a-a8240b4e7876', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', '548d3702-7926-576b-a32c-0bafbdfa4f05', 'Дана', 'Ахметова', true, now() - interval '300 days', now()) ON CONFLICT (id) DO NOTHING;
-- План: предложение в 6 покупках из 10, 8 принятых допродаж за смену, товар дня — витамин D3 (осень).
INSERT INTO analytics.upsell_plans (id, organization_id, store_id, seller_id, attempt_rate_target, accepted_per_shift, focus_items, updated_at)
VALUES ('2aa55cdf-d0d1-5850-810b-05bd71a904f2', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', NULL, NULL, 0.6, 8, ARRAY['Витамин D3'], now()) ON CONFLICT DO NOTHING;
-- Есиль открылась недавно: план ниже, 50 %
INSERT INTO analytics.upsell_plans (id, organization_id, store_id, seller_id, attempt_rate_target, accepted_per_shift, focus_items, updated_at)
VALUES ('73141961-a251-51bf-aa59-2058686c4662', 'ff4a405d-c9f1-5c55-80bc-5e5b5f350be0', '548d3702-7926-576b-a32c-0bafbdfa4f05', NULL, 0.5, NULL, '{}', now()) ON CONFLICT DO NOTHING;
COMMIT;
