-- Демо-данные для VoiceIQ.
-- Идемпотентно: повторный запуск ничего не дублирует.
-- Запуск: docker compose exec -T postgres psql -U voiceiq -d voiceiq < seed_demo.sql

DO $$
DECLARE
    v_org_id   UUID;
    v_admin_id UUID;
    v_store_msk UUID;
    v_store_spb UUID;
    v_store_ekb UUID;
    v_seller_1 UUID;
    v_seller_2 UUID;
    v_seller_3 UUID;
    v_seller_4 UUID;
    v_seller_5 UUID;
    v_seller_6 UUID;
    v_seller_7 UUID;
    v_template_id UUID;
BEGIN
    SELECT id INTO v_org_id FROM auth.organizations WHERE slug = 'demo';
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Организация demo не найдена. Сначала запусти bootstrap.';
    END IF;

    SELECT id INTO v_admin_id
    FROM auth.users
    WHERE organization_id = v_org_id AND role = 'director'
    LIMIT 1;
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Director-пользователь не найден.';
    END IF;

    -- ─── Магазины ──────────────────────────────────────────────────────────
    INSERT INTO admin_schema.stores (organization_id, name, address)
    SELECT v_org_id, 'Москва, ТЦ «Авиапарк»', 'Ходынский бульвар, 4'
    WHERE NOT EXISTS (SELECT 1 FROM admin_schema.stores
                      WHERE organization_id = v_org_id AND name = 'Москва, ТЦ «Авиапарк»');

    INSERT INTO admin_schema.stores (organization_id, name, address)
    SELECT v_org_id, 'Санкт-Петербург, Невский 28', 'Невский проспект, 28'
    WHERE NOT EXISTS (SELECT 1 FROM admin_schema.stores
                      WHERE organization_id = v_org_id AND name = 'Санкт-Петербург, Невский 28');

    INSERT INTO admin_schema.stores (organization_id, name, address)
    SELECT v_org_id, 'Екатеринбург, ТЦ «Гринвич»', 'улица 8 Марта, 46'
    WHERE NOT EXISTS (SELECT 1 FROM admin_schema.stores
                      WHERE organization_id = v_org_id AND name = 'Екатеринбург, ТЦ «Гринвич»');

    SELECT id INTO v_store_msk FROM admin_schema.stores
    WHERE organization_id = v_org_id AND name = 'Москва, ТЦ «Авиапарк»';
    SELECT id INTO v_store_spb FROM admin_schema.stores
    WHERE organization_id = v_org_id AND name = 'Санкт-Петербург, Невский 28';
    SELECT id INTO v_store_ekb FROM admin_schema.stores
    WHERE organization_id = v_org_id AND name = 'Екатеринбург, ТЦ «Гринвич»';

    -- ─── Продавцы ──────────────────────────────────────────────────────────
    INSERT INTO admin_schema.sellers (organization_id, store_id, first_name, last_name)
    SELECT v_org_id, v_store_msk, 'Алексей', 'Иванов'
    WHERE NOT EXISTS (SELECT 1 FROM admin_schema.sellers
                      WHERE store_id = v_store_msk AND first_name='Алексей' AND last_name='Иванов');
    INSERT INTO admin_schema.sellers (organization_id, store_id, first_name, last_name)
    SELECT v_org_id, v_store_msk, 'Мария', 'Петрова'
    WHERE NOT EXISTS (SELECT 1 FROM admin_schema.sellers
                      WHERE store_id = v_store_msk AND first_name='Мария' AND last_name='Петрова');
    INSERT INTO admin_schema.sellers (organization_id, store_id, first_name, last_name)
    SELECT v_org_id, v_store_msk, 'Дмитрий', 'Соколов'
    WHERE NOT EXISTS (SELECT 1 FROM admin_schema.sellers
                      WHERE store_id = v_store_msk AND first_name='Дмитрий' AND last_name='Соколов');

    INSERT INTO admin_schema.sellers (organization_id, store_id, first_name, last_name)
    SELECT v_org_id, v_store_spb, 'Анна', 'Кузнецова'
    WHERE NOT EXISTS (SELECT 1 FROM admin_schema.sellers
                      WHERE store_id = v_store_spb AND first_name='Анна' AND last_name='Кузнецова');
    INSERT INTO admin_schema.sellers (organization_id, store_id, first_name, last_name)
    SELECT v_org_id, v_store_spb, 'Сергей', 'Волков'
    WHERE NOT EXISTS (SELECT 1 FROM admin_schema.sellers
                      WHERE store_id = v_store_spb AND first_name='Сергей' AND last_name='Волков');

    INSERT INTO admin_schema.sellers (organization_id, store_id, first_name, last_name)
    SELECT v_org_id, v_store_ekb, 'Ольга', 'Морозова'
    WHERE NOT EXISTS (SELECT 1 FROM admin_schema.sellers
                      WHERE store_id = v_store_ekb AND first_name='Ольга' AND last_name='Морозова');
    INSERT INTO admin_schema.sellers (organization_id, store_id, first_name, last_name)
    SELECT v_org_id, v_store_ekb, 'Иван', 'Лебедев'
    WHERE NOT EXISTS (SELECT 1 FROM admin_schema.sellers
                      WHERE store_id = v_store_ekb AND first_name='Иван' AND last_name='Лебедев');

    SELECT id INTO v_seller_1 FROM admin_schema.sellers WHERE store_id=v_store_msk AND last_name='Иванов';
    SELECT id INTO v_seller_2 FROM admin_schema.sellers WHERE store_id=v_store_msk AND last_name='Петрова';
    SELECT id INTO v_seller_3 FROM admin_schema.sellers WHERE store_id=v_store_msk AND last_name='Соколов';
    SELECT id INTO v_seller_4 FROM admin_schema.sellers WHERE store_id=v_store_spb AND last_name='Кузнецова';
    SELECT id INTO v_seller_5 FROM admin_schema.sellers WHERE store_id=v_store_spb AND last_name='Волков';
    SELECT id INTO v_seller_6 FROM admin_schema.sellers WHERE store_id=v_store_ekb AND last_name='Морозова';
    SELECT id INTO v_seller_7 FROM admin_schema.sellers WHERE store_id=v_store_ekb AND last_name='Лебедев';

    -- ─── Устройства (бейджи) ───────────────────────────────────────────────
    -- serial_number уникален, поэтому ON CONFLICT DO NOTHING сработает корректно
    INSERT INTO admin_schema.devices (organization_id, store_id, seller_id, serial_number, model, last_seen_at)
    VALUES
      (v_org_id, v_store_msk, v_seller_1, 'VIQ-DEV-001', 'Fonemica F2', NOW() - INTERVAL '2 minutes'),
      (v_org_id, v_store_msk, v_seller_2, 'VIQ-DEV-002', 'Fonemica F2', NOW() - INTERVAL '5 minutes'),
      (v_org_id, v_store_msk, v_seller_3, 'VIQ-DEV-003', 'Fonemica F2', NOW() - INTERVAL '1 hour'),
      (v_org_id, v_store_spb, v_seller_4, 'VIQ-DEV-004', 'Fonemica F2', NOW() - INTERVAL '8 minutes'),
      (v_org_id, v_store_spb, v_seller_5, 'VIQ-DEV-005', 'Fonemica F2', NOW() - INTERVAL '3 hours'),
      (v_org_id, v_store_ekb, v_seller_6, 'VIQ-DEV-006', 'Fonemica F2', NOW() - INTERVAL '15 minutes'),
      (v_org_id, v_store_ekb, v_seller_7, 'VIQ-DEV-007', 'Fonemica F2', NULL)
    ON CONFLICT (serial_number) DO NOTHING;

    -- ─── Privacy settings (на уровне организации) ──────────────────────────
    INSERT INTO admin_schema.privacy_settings (organization_id, store_id, retention_days, anonymize_transcripts, consent_required)
    SELECT v_org_id, NULL, 90, false, true
    WHERE NOT EXISTS (SELECT 1 FROM admin_schema.privacy_settings
                      WHERE organization_id = v_org_id AND store_id IS NULL);

    -- ─── Скрипт продаж: 6 этапов, веса в сумме = 1.0 ───────────────────────
    INSERT INTO scripts.script_templates (organization_id, name, description, scope, is_active, created_by)
    VALUES (v_org_id, 'Стандартный скрипт продаж бытовой техники',
            'Базовый скрипт для консультативных продаж в розничных магазинах.',
            'org_level', true, v_admin_id)
    ON CONFLICT (organization_id, name) DO NOTHING;

    SELECT id INTO v_template_id
    FROM scripts.script_templates
    WHERE organization_id = v_org_id AND name = 'Стандартный скрипт продаж бытовой техники';

    INSERT INTO scripts.script_steps (template_id, name, description, weight, is_required, step_order, recommendation_text)
    VALUES
      (v_template_id, 'Приветствие и установление контакта',
       'Поздороваться, представиться, спросить как обращаться', 0.100, true, 1,
       'Улыбайтесь, держите зрительный контакт, обращайтесь по имени'),
      (v_template_id, 'Выявление потребностей',
       'Открытые вопросы о задачах клиента, бюджете, опыте использования', 0.250, true, 2,
       'Минимум 3 открытых вопроса перед презентацией'),
      (v_template_id, 'Презентация продукта',
       'Подбор 1-2 моделей под выявленные потребности с акцентом на выгоды', 0.200, true, 3,
       'Используйте формулу свойство → преимущество → выгода'),
      (v_template_id, 'Работа с возражениями',
       'Закрытие возражений по цене, конкурентам, срокам, доверию', 0.200, true, 4,
       'Не спорьте — задавайте уточняющие вопросы'),
      (v_template_id, 'Закрытие сделки',
       'Подведение к решению, оформление, способ оплаты', 0.150, true, 5,
       'Используйте альтернативные вопросы вместо да/нет'),
      (v_template_id, 'Допродажа',
       'Предложение сопутствующих товаров и расширенной гарантии', 0.100, false, 6,
       'Минимум 2 релевантные допозиции к каждой продаже')
    ON CONFLICT (template_id, step_order) DO NOTHING;

    -- ─── Назначение скрипта всем продавцам ─────────────────────────────────
    INSERT INTO scripts.seller_script_assignments (organization_id, seller_id, template_id, is_mandatory, assigned_by)
    SELECT v_org_id, s.id, v_template_id, true, v_admin_id
    FROM admin_schema.sellers s
    WHERE s.organization_id = v_org_id
    ON CONFLICT (seller_id, template_id) DO NOTHING;

    RAISE NOTICE 'Seed выполнен. Магазины: 3, Продавцы: 7, Устройства: 7, Скриптов: 1.';
END $$;
