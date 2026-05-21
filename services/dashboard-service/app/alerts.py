import aiosmtplib
import logging
from email.message import EmailMessage
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import settings

logger = logging.getLogger(__name__)


async def send_alert_email(recipients: list[str], subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(body)

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        use_tls=True,
    )


async def check_and_send_score_alert(
    org_id: str,
    store_id: str,
    overall_score: float,
    db: AsyncSession,
) -> None:
    """Check score threshold and send alert if score is below threshold."""
    result = await db.execute(
        text("""
            SELECT score_threshold, email_recipients, is_active
            FROM admin_schema.alert_settings
            WHERE (store_id = :store_id OR store_id IS NULL)
              AND organization_id = :org_id
              AND is_active = true
            ORDER BY store_id NULLS LAST
            LIMIT 1
        """),
        {"store_id": store_id, "org_id": org_id},
    )
    row = result.fetchone()
    if not row:
        return

    if overall_score < float(row.score_threshold):
        try:
            await send_alert_email(
                recipients=row.email_recipients,
                subject=f"[Voicer] Низкий скор продавца: {overall_score:.0f}",
                body=(
                    f"Разговор в магазине получил оценку {overall_score:.0f} из 100, "
                    f"что ниже порога {float(row.score_threshold):.0f}.\n\n"
                    f"Перейти в дашборд: https://app.voicer.ru"
                ),
            )
        except Exception as e:
            logger.error("Failed to send alert email: %s", e)
