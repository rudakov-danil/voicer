import pytest
import uuid
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy import text
from tests.conftest import ORG_ID, STORE_ID


@pytest.mark.asyncio
async def test_no_alert_when_score_above_threshold(db_session):
    """DASH-U-04: check_and_send_score_alert does NOT send email if score >= threshold"""
    from app.alerts import check_and_send_score_alert

    # Insert alert settings with threshold=60
    await db_session.execute(
        text("""
            INSERT INTO admin_schema.alert_settings
                (organization_id, store_id, score_threshold, email_recipients, is_active, no_activity_hours)
            VALUES (:org_id, :store_id, 60.0, '{test@test.com}', true, 24)
            ON CONFLICT DO NOTHING
        """),
        {"org_id": uuid.UUID(ORG_ID), "store_id": uuid.UUID(STORE_ID)},
    )
    await db_session.commit()

    with patch("app.alerts.send_alert_email", new_callable=AsyncMock) as mock_send:
        await check_and_send_score_alert(ORG_ID, STORE_ID, 75.0, db_session)
        mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_alert_sent_when_score_below_threshold(db_session):
    """DASH-U-05: check_and_send_score_alert calls send_alert_email if score < threshold"""
    from app.alerts import check_and_send_score_alert

    # Ensure alert settings exist
    await db_session.execute(
        text("""
            INSERT INTO admin_schema.alert_settings
                (organization_id, store_id, score_threshold, email_recipients, is_active, no_activity_hours)
            VALUES (:org_id, :store_id, 60.0, '{test@test.com}', true, 24)
            ON CONFLICT DO NOTHING
        """),
        {"org_id": uuid.UUID(ORG_ID), "store_id": uuid.UUID(STORE_ID)},
    )
    await db_session.commit()

    with patch("app.alerts.send_alert_email", new_callable=AsyncMock) as mock_send:
        await check_and_send_score_alert(ORG_ID, STORE_ID, 45.0, db_session)
        mock_send.assert_called_once()
        call_args = mock_send.call_args
        assert "45" in call_args.kwargs["subject"] or "45" in call_args.kwargs["body"]


@pytest.mark.asyncio
async def test_no_alert_when_inactive(db_session):
    """DASH-I-09: email NOT sent if is_active=false"""
    from app.alerts import check_and_send_score_alert

    store_id = str(uuid.uuid4())
    await db_session.execute(
        text("""
            INSERT INTO admin_schema.alert_settings
                (organization_id, store_id, score_threshold, email_recipients, is_active, no_activity_hours)
            VALUES (:org_id, :store_id, 60.0, '{test@test.com}', false, 24)
        """),
        {"org_id": uuid.UUID(ORG_ID), "store_id": uuid.UUID(store_id)},
    )
    await db_session.commit()

    with patch("app.alerts.send_alert_email", new_callable=AsyncMock) as mock_send:
        await check_and_send_score_alert(ORG_ID, store_id, 30.0, db_session)
        mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_cache_invalidation_worker(fake_redis):
    """DASH-I-03: cache invalidation worker clears cache"""
    from app import redis_client as rc
    import json
    import uuid as _uuid

    rc.redis = fake_redis
    org_id = str(_uuid.uuid4())
    store_id = str(_uuid.uuid4())

    # Pre-populate cache
    await rc.set_cached(f"dashboard:overview:{org_id}:{store_id}:2026-03-01_2026-03-18", {"x": 1})

    # Simulate worker processing
    msg_body = json.dumps({"store_id": store_id, "organization_id": org_id}).encode()

    mock_message = MagicMock()
    mock_message.body = msg_body
    mock_message.process = MagicMock()
    mock_message.process.return_value.__aenter__ = AsyncMock(return_value=None)
    mock_message.process.return_value.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("worker.cache_invalidation_worker.AsyncSessionLocal") as mock_session_maker,
        patch("worker.cache_invalidation_worker.check_and_send_score_alert", new_callable=AsyncMock),
    ):
        mock_db = AsyncMock()
        mock_db.execute.return_value.fetchone.return_value = None
        mock_session_maker.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_maker.return_value.__aexit__ = AsyncMock(return_value=False)

        from worker.cache_invalidation_worker import process_cache_invalidate_message
        await process_cache_invalidate_message(mock_message)

    # Cache should be cleared
    assert await rc.get_cached(f"dashboard:overview:{org_id}:{store_id}:2026-03-01_2026-03-18") is None
