import io
from minio import Minio
from app.config import settings

_client: Minio | None = None


def get_minio() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _client


def download_bytes(bucket: str, object_name: str) -> bytes:
    client = get_minio()
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def upload_bytes(bucket: str, object_name: str, data: bytes, content_type: str = "audio/wav") -> None:
    client = get_minio()
    client.put_object(bucket, object_name, io.BytesIO(data), length=len(data), content_type=content_type)


def delete_object(bucket: str, object_name: str) -> None:
    client = get_minio()
    client.remove_object(bucket, object_name)
