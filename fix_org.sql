-- Переводит данные из дампа (организация 17d9bc99…) на организацию,
-- под которой заведён пользователь admin@demo.ru (b65302a1…).
-- Строка auth.users намеренно не трогается: логин и текущая сессия остаются валидными.
BEGIN;

UPDATE admin_schema.alert_settings        SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE admin_schema.devices               SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE admin_schema.privacy_settings      SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE admin_schema.sellers               SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE admin_schema.store_licenses        SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE admin_schema.stores                SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE analytics.conversations            SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE auth.rop_store_assignments         SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE recorder.audio_chunks              SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE recorder.recordings                SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE recorder.telephony_settings        SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE scripts.compliance_rules           SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE scripts.cross_sell_rules           SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE scripts.objection_types            SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE scripts.script_templates           SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE scripts.seller_script_assignments  SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE scripts.store_script_assignments   SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE scripts.upsell_rules               SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';
UPDATE transcription.transcripts          SET organization_id='b65302a1-b379-4bfc-9746-460f795e0f4e' WHERE organization_id='17d9bc99-3a03-4ef0-a36b-3edff97aacdc';

COMMIT;
