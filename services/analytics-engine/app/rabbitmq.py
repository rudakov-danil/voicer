import json
import aio_pika
from app.config import settings

_connection: aio_pika.RobustConnection | None = None
_channel: aio_pika.Channel | None = None


async def get_channel() -> aio_pika.Channel:
    global _connection, _channel
    if _connection is None or _connection.is_closed:
        _connection = await aio_pika.connect_robust(settings.RABBITMQ_URL)
    if _channel is None or _channel.is_closed:
        _channel = await _connection.channel()
    return _channel


async def publish(queue_name: str, payload: dict) -> None:
    channel = await get_channel()
    await channel.declare_queue(queue_name, durable=True)
    await channel.default_exchange.publish(
        aio_pika.Message(
            body=json.dumps(payload).encode(),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        ),
        routing_key=queue_name,
    )


async def close() -> None:
    global _connection, _channel
    if _channel and not _channel.is_closed:
        await _channel.close()
    if _connection and not _connection.is_closed:
        await _connection.close()
    _connection = None
    _channel = None
