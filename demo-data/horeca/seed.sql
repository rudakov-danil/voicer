BEGIN;
INSERT INTO auth.organizations (id, name, slug, org_type, industry, is_active, created_at, updated_at)
VALUES ('c9842e2d-9d12-51ad-8880-08cb67489cac', 'Coffee Shop (демо)', 'horeca-demo', 'retail', 'coffee', true, now(), now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.stores (id, organization_id, name, address, is_active, created_at, updated_at)
VALUES ('37dfb88a-cb8c-5ff7-ab69-111d180dc9fb', 'c9842e2d-9d12-51ad-8880-08cb67489cac', 'Coffee Shop 01', 'Демонстрационная точка Coffee Shop 01', true, now(), now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.stores (id, organization_id, name, address, is_active, created_at, updated_at)
VALUES ('5a7b802b-e1ca-5637-b8a8-1900dafbf451', 'c9842e2d-9d12-51ad-8880-08cb67489cac', 'Coffee Shop 02', 'Демонстрационная точка Coffee Shop 02', true, now(), now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.stores (id, organization_id, name, address, is_active, created_at, updated_at)
VALUES ('8a47187a-6784-5d37-b3d0-04c07711422a', 'c9842e2d-9d12-51ad-8880-08cb67489cac', 'Coffee Shop 03', 'Демонстрационная точка Coffee Shop 03', true, now(), now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('5686b4a2-22a2-5c39-95f6-788ef18c1249', 'c9842e2d-9d12-51ad-8880-08cb67489cac', '37dfb88a-cb8c-5ff7-ab69-111d180dc9fb', 'Айгерім', 'Сейтова', true, now() - interval '200 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('45f723b6-3a22-51de-90e4-9a964e0d26d7', 'c9842e2d-9d12-51ad-8880-08cb67489cac', '37dfb88a-cb8c-5ff7-ab69-111d180dc9fb', 'Әлихан', 'Төлегенов', true, now() - interval '200 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('c1745405-7cf4-5667-a3fc-c953c47e73e6', 'c9842e2d-9d12-51ad-8880-08cb67489cac', '5a7b802b-e1ca-5637-b8a8-1900dafbf451', 'Данияр', 'Омаров', true, now() - interval '200 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('bfea175b-1354-5a18-a0f4-98b40bf29db4', 'c9842e2d-9d12-51ad-8880-08cb67489cac', '5a7b802b-e1ca-5637-b8a8-1900dafbf451', 'Аружан', 'Нұрланова', true, now() - interval '200 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('be7eb79c-3977-5641-af37-8174902f7b23', 'c9842e2d-9d12-51ad-8880-08cb67489cac', '5a7b802b-e1ca-5637-b8a8-1900dafbf451', 'Нұрсұлтан', 'Қайратұлы', true, now() - interval '200 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('e70939ab-799b-56b0-bea0-a8b89583cd07', 'c9842e2d-9d12-51ad-8880-08cb67489cac', '8a47187a-6784-5d37-b3d0-04c07711422a', 'Мадина', 'Ермекова', true, now() - interval '200 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('479478ba-6c4d-5b98-8d85-9b58d9520af8', 'c9842e2d-9d12-51ad-8880-08cb67489cac', '8a47187a-6784-5d37-b3d0-04c07711422a', 'Аян', 'Әбілов', true, now() - interval '200 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at)
VALUES ('10652a1f-7be5-53a4-bd75-0fe640113a40', 'c9842e2d-9d12-51ad-8880-08cb67489cac', '8a47187a-6784-5d37-b3d0-04c07711422a', 'Әсел', 'Жұмабаева', true, now() - interval '200 days', now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO analytics.upsell_plans (id, organization_id, store_id, seller_id, attempt_rate_target, accepted_per_shift, focus_items, updated_at)
VALUES ('79d079b9-0716-5d6a-803f-818ed624d920', 'c9842e2d-9d12-51ad-8880-08cb67489cac', NULL, NULL, 0.7, 8, ARRAY['Тыквенный латте'], now()) ON CONFLICT DO NOTHING;
INSERT INTO analytics.upsell_plans (id, organization_id, store_id, seller_id, attempt_rate_target, accepted_per_shift, focus_items, updated_at)
VALUES ('8d3015a1-f24a-518f-bde4-6fc8f1412707', 'c9842e2d-9d12-51ad-8880-08cb67489cac', '5a7b802b-e1ca-5637-b8a8-1900dafbf451', NULL, 0.6, NULL, '{}', now()) ON CONFLICT DO NOTHING;
COMMIT;
