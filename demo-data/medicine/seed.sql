-- Демо сети клиник «Береке» (medicine.voicer-ai.pro): организация, клиники, врачи и их специальности.
-- Правила контроля качества организация получает из пресета analytics.quality_rule_presets
-- (миграция analytics 0014) при первом обращении — medicine_demo.py делает это сам.
-- Данные вымышленные: название, адреса и имена условные.
BEGIN;
INSERT INTO auth.organizations (id, name, slug, org_type, industry, currency, timezone, is_active, created_at, updated_at)
VALUES ('8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Клиника «Береке» (демо)', 'medicine-demo', 'retail', 'clinic', 'KZT', 'Asia/Almaty', true, now(), now())
ON CONFLICT (id) DO UPDATE SET industry = 'clinic', currency = 'KZT', timezone = 'Asia/Almaty';

INSERT INTO admin_schema.stores (id, organization_id, name, address, is_active, created_at, updated_at) VALUES
  ('ce999f37-a05e-5b1a-bce1-48fb429eba7c', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Береке · Абая', 'Алматы, пр. Абая, 150', true, now(), now()),
  ('4e1324cc-4e2f-526d-b1e0-93e20059fbb5', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Береке · Самал', 'Алматы, мкр Самал-2, 33', true, now(), now()),
  ('28f11bcc-69b8-59b7-b521-16a30c26fdce', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Береке · Есиль', 'Астана, пр. Мангилик Ел, 20', true, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO admin_schema.sellers (id, organization_id, store_id, first_name, last_name, is_active, created_at, updated_at) VALUES
  ('29db7ab5-2692-58bb-bc19-ed88fd41b5ac', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'ce999f37-a05e-5b1a-bce1-48fb429eba7c', 'Айгуль', 'Сейткали', true, now() - interval '400 days', now()),
  ('1fc9794f-1a19-5d1c-8ca8-a43a396a6ede', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'ce999f37-a05e-5b1a-bce1-48fb429eba7c', 'Ерлан', 'Жаксылыков', true, now() - interval '400 days', now()),
  ('f9770734-03ef-5665-894b-4ff07a6cbb58', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'ce999f37-a05e-5b1a-bce1-48fb429eba7c', 'Наталья', 'Ким', true, now() - interval '400 days', now()),
  ('349dc643-a37e-562d-bd00-6e7386f5bacc', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', '4e1324cc-4e2f-526d-b1e0-93e20059fbb5', 'Марат', 'Искаков', true, now() - interval '400 days', now()),
  ('22e0c1b4-962e-5b2f-a6eb-96ce6e9dddf0', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', '4e1324cc-4e2f-526d-b1e0-93e20059fbb5', 'Динара', 'Абдрахманова', true, now() - interval '400 days', now()),
  ('41964e19-4732-5aa8-b3b2-3e52a877bba9', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', '4e1324cc-4e2f-526d-b1e0-93e20059fbb5', 'Сергей', 'Волков', true, now() - interval '400 days', now()),
  ('d59a1307-fc1b-5a8c-bffd-e0f509cf7ee1', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', '28f11bcc-69b8-59b7-b521-16a30c26fdce', 'Асем', 'Нуркенова', true, now() - interval '60 days', now()),
  ('b6266e22-b5f4-52c4-8ce8-f8db0eefe67d', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', '28f11bcc-69b8-59b7-b521-16a30c26fdce', 'Бауыржан', 'Оспанов', true, now() - interval '400 days', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO analytics.clinic_doctors (seller_id, organization_id, specialty, updated_at) VALUES
  ('29db7ab5-2692-58bb-bc19-ed88fd41b5ac', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Терапевт', now()),
  ('1fc9794f-1a19-5d1c-8ca8-a43a396a6ede', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Терапевт', now()),
  ('f9770734-03ef-5665-894b-4ff07a6cbb58', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Педиатр', now()),
  ('349dc643-a37e-562d-bd00-6e7386f5bacc', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Оториноларинголог', now()),
  ('22e0c1b4-962e-5b2f-a6eb-96ce6e9dddf0', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Акушер-гинеколог', now()),
  ('41964e19-4732-5aa8-b3b2-3e52a877bba9', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Кардиолог', now()),
  ('d59a1307-fc1b-5a8c-bffd-e0f509cf7ee1', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Невролог', now()),
  ('b6266e22-b5f4-52c4-8ce8-f8db0eefe67d', '8b35eb04-f5ee-5100-b38a-450d6fd7ac9e', 'Терапевт', now())
ON CONFLICT (seller_id) DO UPDATE SET specialty = EXCLUDED.specialty, updated_at = now();
COMMIT;
