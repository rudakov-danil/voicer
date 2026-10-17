"""clinic: visit protocols, quality rules and their results for medical clinics

Для клиник (auth.organizations.industry = 'clinic') разговор — это приём пациента. По записи ИИ
составляет черновик протокола приёма и проверяет приём по общим правилам контроля качества:
сервис и компетентность (что должно быть на приёме) и запреты, в том числе фрод (чего быть
не должно). Скриптов и допродаж у клиник нет.

  quality_rule_presets — правила по умолчанию для отрасли; организация получает их копию при
                         первом обращении (кабинет или анализ первого приёма)
  quality_rules        — правила организации, которые правит руководитель
  clinic_visits        — итог проверки приёма: баллы сервиса и компетентности, число сигналов
  visit_checks         — результат по каждому правилу со снимком названия и цитатой
  visit_protocols      — протокол приёма; ключ — запись, а не разговор: повторный анализ
                         обновляет черновик ИИ и не трогает правки и подтверждение врача
  clinic_doctors       — специальность врача (в admin_schema.sellers её нет)

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

# category: service | competence | fraud; kind: required — должно быть на приёме,
# forbidden — не должно быть (нарушение или сигнал фрода); severity — только для forbidden
CLINIC_PRESETS = [
    # ── Сервис: что должно быть ──
    ("greeting", "service", "required", "Поздоровался и представился",
     "В начале приёма врач поздоровался и назвал себя или свою специальность. Если пациент знаком и врач "
     "тепло поздоровался по имени — тоже выполнено.", "medium"),
    ("listened", "service", "required", "Дал пациенту рассказать о жалобах",
     "Врач дал пациенту описать проблему своими словами, задавал уточняющие вопросы и не обрывал на полуслове. "
     "Не выполнено, если врач перебивал и не давал договорить о жалобах.", "medium"),
    ("explained_diagnosis", "service", "required", "Объяснил, что с пациентом",
     "Врач простыми словами объяснил предварительный диагноз или итог осмотра: что происходит и насколько это "
     "серьёзно. Термины без пояснения — частично.", "medium"),
    ("explained_plan", "service", "required", "Объяснил лечение и как его выполнять",
     "Врач объяснил назначения: что принимать или делать, в какой дозировке, сколько дней и зачем. Если "
     "назначений нет — что делать дальше. Список препаратов без схемы приёма — частично.", "medium"),
    ("checked_understanding", "service", "required", "Ответил на вопросы и проверил понимание",
     "Врач спросил, остались ли вопросы, или уточнил, понятна ли схема, и ответил на вопросы пациента по существу.",
     "medium"),
    ("next_step", "service", "required", "Договорился о следующем шаге",
     "Врач сказал, когда прийти повторно или сдать анализы, или явно сказал, что повторный визит не нужен.",
     "medium"),
    ("paid_services", "service", "required", "Предупредил о платных услугах",
     "Если врач назначил платные обследования, процедуры или повторный платный приём, он сказал, что это платно, "
     "или направил уточнить стоимость у администратора. Не применимо, если платные услуги не назначались.",
     "medium"),
    # ── Сервис: чего быть не должно ──
    ("rudeness", "service", "forbidden", "Грубость или обесценивание жалоб",
     "Резкий или пренебрежительный тон, сарказм, обесценивание жалоб («ничего у вас нет, не выдумывайте»), "
     "стыжение за вес, возраст или образ жизни, повышение голоса на пациента.", "high"),
    ("confidentiality", "service", "forbidden", "Нарушение врачебной тайны",
     "Врач при пациенте называет других пациентов по имени, обсуждает их диагнозы или лечение, либо обсуждает "
     "пациента с посторонними.", "high"),
    # ── Компетентность: что должно быть ──
    ("complaints_history", "competence", "required", "Собрал жалобы и анамнез",
     "Врач выяснил основные жалобы, когда и как они начались, что уже предпринимал пациент, и спросил о "
     "хронических заболеваниях, важных для этой жалобы.", "medium"),
    ("allergies_meds", "competence", "required", "Уточнил аллергии и текущие препараты",
     "Перед назначением лекарств врач спросил об аллергии и о препаратах, которые пациент уже принимает. "
     "Не применимо, если лекарства не назначались.", "medium"),
    ("examination", "competence", "required", "Провёл осмотр и озвучил результаты",
     "Врач провёл осмотр или измерения, нужные по жалобе (давление, температура, горло, лёгкие, живот, "
     "неврологический осмотр и т. п.), и проговорил результаты. Осмотр без результатов вслух — частично.",
     "medium"),
    ("justified_treatment", "competence", "required", "Назначения обоснованы",
     "Назначения и обследования связаны с жалобами и диагнозом и не противоречат клиническим протоколам МЗ РК. "
     "«Не выполнено» — только при явном расхождении: антибиотик при ОРВИ без признаков бактериальной инфекции, "
     "препарат или исследование без показаний. Если судить нельзя — не применимо.", "medium"),
    ("warnings", "competence", "required", "Предупредил о противопоказаниях и побочных эффектах",
     "При назначении лекарств врач предупредил о важных ограничениях: беременность и кормление, алкоголь, "
     "вождение, совместимость с другими препаратами, частые побочные эффекты. Не применимо, если лекарства "
     "не назначались.", "medium"),
    ("red_flags", "competence", "required", "Сказал, когда срочно обращаться",
     "Врач объяснил, при каких симптомах нужно срочно обратиться к врачу или вызвать скорую, либо направил к "
     "профильному специалисту или в стационар, если были тревожные признаки.", "medium"),
    # ── Фрод: чего быть не должно ──
    ("patient_diversion", "fraud", "forbidden", "Увод пациента",
     "Врач предлагает продолжить лечение или обследование вне клиники: в своём частном кабинете, другой клинике, "
     "на дому за отдельную плату; даёт личный номер, чтобы записываться в обход клиники; отговаривает от услуг "
     "клиники в пользу другого места.", "high"),
    ("off_the_books", "fraud", "forbidden", "Оплата мимо кассы",
     "Врач предлагает заплатить ему лично, наличными без чека, переводом на личную карту, или обещает скидку "
     "«без оформления», «без кассы», «чтобы не проводить».", "high"),
    ("unnecessary_services", "fraud", "forbidden", "Лишние услуги и препараты",
     "Врач навязывает обследования, процедуры, повторные визиты или препараты, не связанные с жалобами и "
     "диагнозом; настаивает на конкретном бренде, аптеке или лаборатории без медицинской причины; пугает "
     "последствиями, чтобы продать услугу.", "medium"),
    ("certificates", "fraud", "forbidden", "Справки и больничные без оснований",
     "Врач соглашается выдать лист временной нетрудоспособности, справку или направление без медицинских "
     "оснований, «по договорённости», задним числом или за отдельную плату.", "high"),
]


def upgrade() -> None:
    presets = op.create_table(
        "quality_rule_presets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("industry", sa.String(30), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("severity", sa.String(10), nullable=False, server_default="medium"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("industry", "code", name="uq_quality_rule_presets_code"),
        schema="analytics",
    )
    op.bulk_insert(presets, [
        {"industry": "clinic", "code": code, "category": category, "kind": kind, "title": title,
         "description": description, "severity": severity, "sort_order": i}
        for i, (code, category, kind, title, description, severity) in enumerate(CLINIC_PRESETS)
    ])

    op.create_table(
        "quality_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        # Код пресета, из которого создано правило; NULL — правило руководителя
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("severity", sa.String(10), nullable=False, server_default="medium"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="analytics",
    )
    op.create_index("idx_quality_rules_org", "quality_rules", ["organization_id"], schema="analytics")

    op.create_table(
        "clinic_visits",
        sa.Column(
            "conversation_id", UUID(as_uuid=True),
            sa.ForeignKey("analytics.conversations.id", ondelete="CASCADE"), primary_key=True,
        ),
        # false — в записи нет приёма пациента (разговор коллег, проверка микрофона)
        sa.Column("is_visit", sa.Boolean, nullable=False, server_default=sa.true()),
        # primary | follow_up; NULL — не понять по разговору
        sa.Column("visit_type", sa.String(20), nullable=True),
        # Доля выполненных правил (0..100): выполнено = 100, частично = 50, не выполнено = 0;
        # «не применимо» в балл не входит. NULL — ни одно правило не применимо или проверка не удалась
        sa.Column("service_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("competence_score", sa.Numeric(5, 2), nullable=True),
        # Сработавшие запреты: сервиса и компетентности — нарушения, фрода — сигналы фрода
        sa.Column("issue_signals", sa.Integer, nullable=False, server_default="0"),
        sa.Column("fraud_signals", sa.Integer, nullable=False, server_default="0"),
        # Одно предложение для главврача — главное о приёме
        sa.Column("note", sa.Text, nullable=True),
        # false — проверка по правилам не удалась (сбой модели); протокол при этом может быть
        sa.Column("checks_done", sa.Boolean, nullable=False, server_default=sa.true()),
        schema="analytics",
    )

    op.create_table(
        "visit_checks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column(
            "conversation_id", UUID(as_uuid=True),
            sa.ForeignKey("analytics.conversations.id", ondelete="CASCADE"), nullable=False,
        ),
        # Без FK: правило могут удалить, а история приёма должна остаться
        sa.Column("rule_id", UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False, server_default="medium"),
        # required: met | partial | missed | na; forbidden: violated (строки есть только у сработавших)
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("quote", sa.Text, nullable=False, server_default=""),
        sa.Column("comment", sa.Text, nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        schema="analytics",
    )
    op.create_index("idx_visit_checks_conversation", "visit_checks", ["conversation_id"], schema="analytics")
    op.create_index("idx_visit_checks_rule", "visit_checks", ["rule_id"], schema="analytics")

    op.create_table(
        "visit_protocols",
        sa.Column("recording_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("store_id", UUID(as_uuid=True), nullable=False),
        sa.Column("seller_id", UUID(as_uuid=True), nullable=False),
        # Черновик ИИ; NULL — составить не удалось
        sa.Column("draft", JSONB, nullable=True),
        # Версия врача: правки поверх черновика
        sa.Column("final", JSONB, nullable=True),
        # draft — ждёт проверки врача; confirmed — врач подтвердил; failed — черновика нет
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("confirmed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("confirmed_by", UUID(as_uuid=True), nullable=True),
        sa.Column("confirmed_by_name", sa.String(255), nullable=True),
        sa.Column("generated_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="analytics",
    )
    op.create_index("idx_visit_protocols_seller", "visit_protocols", ["organization_id", "seller_id"], schema="analytics")

    op.create_table(
        "clinic_doctors",
        sa.Column("seller_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("specialty", sa.String(100), nullable=True),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="analytics",
    )


def downgrade() -> None:
    op.drop_table("clinic_doctors", schema="analytics")
    op.drop_index("idx_visit_protocols_seller", table_name="visit_protocols", schema="analytics")
    op.drop_table("visit_protocols", schema="analytics")
    op.drop_index("idx_visit_checks_rule", table_name="visit_checks", schema="analytics")
    op.drop_index("idx_visit_checks_conversation", table_name="visit_checks", schema="analytics")
    op.drop_table("visit_checks", schema="analytics")
    op.drop_table("clinic_visits", schema="analytics")
    op.drop_index("idx_quality_rules_org", table_name="quality_rules", schema="analytics")
    op.drop_table("quality_rules", schema="analytics")
    op.drop_table("quality_rule_presets", schema="analytics")
