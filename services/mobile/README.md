# Voicer mobile recorder

Static mobile web app for `https://mobile.voicer-ai.pro`. Uses the existing Voicer
login/refresh endpoints, store-scoped sellers, and the new authenticated
`POST /api/v1/recorder/mobile/upload` endpoint. No separate user database.

## Behavior

- Start/stop microphone recording using MediaRecorder: WebM/Opus or MP4/AAC.
- Store delivered chunks in IndexedDB every three seconds. Browser-delayed events
  can make this interval much longer. Nothing is uploaded until Stop.
- Upload with a stable UUID and automatic token refresh. Retry transport failures
  on reconnect or while the page is open. Permanent validation failures require
  explicit retry. Local audio remains until the user deletes it.
- Recover delivered chunks after a tab crash. Mark recordings as interrupted and
  ask the user before uploading partial audio. Browser/OS termination can lose
  undelivered chunks or leave an unplayable partial container, especially MP4.
- Partition local records by organization and user. Use Web Locks to prevent two
  tabs from recording or submitting concurrently.
- Request Screen Wake Lock by default, with an optional checkbox. Do not stop or
  restart recording on visibilitychange. Report microphone mute/end events.
- Maximum upload is 100 MiB; client stops near 95 MiB. Downloads remain available
  if a delayed final chunk exceeds the server limit.
- Cache only public app assets for offline use. No audio, API data or credentials
  are placed in the service worker cache. Login tokens stay in origin-scoped
  localStorage, following the existing application token-based login model.

## Background recording limitation

A PWA is still a browser application. iOS/Android may suspend microphone capture,
JavaScript, dataavailable events or uploads while locked/backgrounded. Screen
Wake Lock prevents automatic screen sleep only while the document is visible;
it does not override a manual lock. Continuous locked-screen recording is NOT
guaranteed. The elapsed counter measures wall time, not verified captured audio.
Actual iPhone Safari and Android Chrome lock-screen tests are still required.

## Server integration

`app/routers/mobile.py` validates role/store and active seller membership, limits
size and creates an organization/user-scoped deterministic recording UUID. A
PostgreSQL advisory transaction lock and content hash deduplicate retry requests.
Audio is stored in MinIO before returning 202. `mobile_queued` records are durable;
a lifecycle worker consumes them, using per-record session advisory locks, then
calls the existing transcription/analytics pipeline. Pending processing resumes
on API startup. A successful upload means accepted, not completed analysis.
The existing downstream pipeline retains its existing failure semantics.

No schema migration: the service uses existing Recording columns including
`source` and `call_metadata`. Existing manual uploads retain their behavior.

## Deployment on the existing server

- Static root: `/var/www/voicer-mobile` (contents of this directory).
- Host nginx config: `deploy/mobile/nginx.conf`; API proxy is `127.0.0.1:8080`.
- A record: `mobile.voicer-ai.pro -> 185.32.85.82`.
- Install HTTP vhost, validate `nginx -t`, reload, then run:
  `certbot --nginx -d mobile.voicer-ai.pro --non-interactive --redirect`.
- Rebuild and restart **only recorder-service** with updated main.py,
  deepgram_client.py, routers/mobile.py. Reload the Docker nginx gateway after
  container recreation so its upstream resolves the new container address.
- Increment the service-worker cache version when changing cached assets.
  New workers wait for open tabs to close, avoiding interruption of recordings.

## Validation

Browser tests (Chrome, fake microphone and mocked APIs):
`cd tests/mobile && npm ci && npm test`.

Backend isolated tests (inside recorder-service environment):
`python -m unittest test_mobile -v`.

Before relying on a phone: record spoken audio, lock for at least two minutes,
unlock and stop; listen to the downloaded file and verify the entire interval,
then verify that the recording and analytics appear in the main account.
