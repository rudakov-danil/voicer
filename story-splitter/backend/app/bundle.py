"""Сборка офлайн-бандла: самодостаточная HTML-страница + аудио, упакованные в zip.

Страница рассчитана на открытие по file:// двойным кликом, поэтому данные
зашиты в неё как JS-литерал: fetch/XHR браузеры на file:// блокируют, а
относительные ссылки на аудио — нет.
"""
import html
import json
import logging
import zipfile
from pathlib import Path

from app.segmenter import fmt_time

logger = logging.getLogger(__name__)

PAGE = """<!DOCTYPE html>
<html lang="kk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
  :root {
    --bg:#f6f7f9; --card:#fff; --border:#e3e6ea; --text:#1a1d21;
    --muted:#6b7280; --accent:#2f6df6; --accent-soft:#eaf1ff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#14161a; --card:#1c1f24; --border:#2c3138; --text:#e8eaed;
      --muted:#9aa1ab; --accent:#5b8dff; --accent-soft:#1e2a44;
    }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font:15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width:940px; margin:0 auto; padding:24px 16px 60px; }
  header { border-bottom:1px solid var(--border); padding-bottom:16px; margin-bottom:22px; }
  h1 { font-size:20px; margin:0 0 6px; }
  .sub { color:var(--muted); font-size:13px; }
  .controls { margin-top:14px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  button { font:inherit; font-size:13px; border:1px solid var(--border); background:var(--card);
    color:var(--text); border-radius:7px; padding:6px 12px; cursor:pointer; }
  button:hover { border-color:var(--accent); color:var(--accent); }
  button.on { background:var(--accent); border-color:var(--accent); color:#fff; }
  .toc { background:var(--card); border:1px solid var(--border); border-radius:10px;
    padding:14px 16px; margin-bottom:22px; }
  .toc a { color:var(--accent); text-decoration:none; display:block; padding:3px 0; font-size:14px; }
  .toc a:hover { text-decoration:underline; }
  .toc .t { color:var(--muted); font-variant-numeric:tabular-nums; margin-right:8px; }
  .story { background:var(--card); border:1px solid var(--border); border-radius:10px;
    margin-bottom:18px; overflow:hidden; scroll-margin-top:12px; }
  .head { padding:14px 16px; background:var(--accent-soft); }
  .title { font-size:17px; font-weight:600; margin:0 0 3px; }
  .title-ru { color:var(--muted); font-size:14px; }
  .range { font-size:12.5px; color:var(--muted); margin-top:6px; font-variant-numeric:tabular-nums; }
  .sum { margin-top:8px; font-size:14px; }
  .body { padding:12px 16px 16px; }
  audio { width:100%; margin:8px 0 12px; }
  table { width:100%; border-collapse:collapse; font-size:14.5px; }
  td { padding:6px 9px; vertical-align:top; border-top:1px solid var(--border); }
  tr:first-child td { border-top:none; }
  td.tc { width:66px; white-space:nowrap; color:var(--accent); cursor:pointer;
    font-variant-numeric:tabular-nums; font-size:13px; }
  td.tc:hover { text-decoration:underline; }
  td.ru { color:var(--muted); border-left:1px solid var(--border); width:42%; }
  .hide-ru td.ru { display:none; }
  footer { margin-top:30px; color:var(--muted); font-size:12.5px; text-align:center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>__TITLE__</h1>
    <div class="sub" id="meta"></div>
    <div class="controls">
      <button id="toggleRu" class="on">Орысша аударма / Русский перевод</button>
      <span class="sub">Уақытты басыңыз — аудио сол жерден ойнайды
        <br>Клик по таймкоду — аудио с этого места</span>
    </div>
  </header>
  <div class="toc" id="toc"></div>
  <div id="stories"></div>
  <footer>Story Splitter — офлайн-көшірме / офлайн-копия</footer>
</div>

<script>
const DATA = __DATA__;

const esc = (s) => (s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

document.getElementById('meta').textContent =
  `${DATA.language} · ${DATA.duration} · ${DATA.stories.length} әңгіме / историй`;

document.getElementById('toc').innerHTML = DATA.stories.map((s, i) =>
  `<a href="#s${i}"><span class="t">${esc(s.start)}</span>${esc(s.title)}${
    s.title_ru ? ` — <span style="color:var(--muted)">${esc(s.title_ru)}</span>` : ''}</a>`
).join('');

document.getElementById('stories').innerHTML = DATA.stories.map((s, i) => `
  <div class="story" id="s${i}">
    <div class="head">
      <div class="title">${i + 1}. ${esc(s.title)}</div>
      ${s.title_ru ? `<div class="title-ru">${esc(s.title_ru)}</div>` : ''}
      <div class="range">${esc(s.start)} – ${esc(s.end)}</div>
      ${s.summary_ru ? `<div class="sum">${esc(s.summary_ru)}</div>` : ''}
    </div>
    <div class="body">
      ${s.audio ? `<audio controls preload="none" id="a${i}" src="audio/${encodeURIComponent(s.audio)}"></audio>` : ''}
      <table>${s.transcript.map((t) => `
        <tr>
          <td class="tc" data-p="a${i}" data-at="${t.offset}">${esc(t.time)}</td>
          <td>${esc(t.text)}</td>
          <td class="ru">${esc(t.text_ru || '')}</td>
        </tr>`).join('')}
      </table>
    </div>
  </div>`).join('');

document.addEventListener('click', (e) => {
  const td = e.target.closest('td.tc');
  if (!td) return;
  const p = document.getElementById(td.dataset.p);
  if (!p) return;
  p.currentTime = Math.max(0, parseFloat(td.dataset.at));
  p.play();
});

const btn = document.getElementById('toggleRu');
btn.onclick = () => {
  const off = document.body.classList.toggle('hide-ru');
  btn.classList.toggle('on', !off);
};
</script>
</body>
</html>
"""


def audio_name(story: dict) -> str:
    """Имя файла внутри архива — намеренно ASCII.

    Кириллицу в zip встроенный распаковщик Windows portit, а получатель архива
    заранее неизвестен. Названия историй всё равно видны на странице.
    """
    return f"{story['idx']:02d}.mp3"


def _payload(job: dict) -> dict:
    stories = []
    for story in job["stories"]:
        audio_name_ = audio_name(story) if story["audio_path"] else None
        stories.append({
            "title": story["title"],
            "title_ru": story["title_ru"],
            "summary_ru": story["summary_ru"],
            "audio": audio_name_,
            "start": fmt_time(story["start_sec"]),
            "end": fmt_time(story["end_sec"]),
            "transcript": [
                {
                    "time": fmt_time(seg["start"]),
                    # Смещение внутри нарезанного фрагмента, а не от начала записи
                    "offset": round(seg["start"] - story["start_sec"], 2),
                    "text": seg["text"],
                    "text_ru": seg.get("text_ru"),
                }
                for seg in story["segments"]
            ],
        })
    return {
        "source": job["filename"],
        "language": job["language"] or "kk",
        "duration": fmt_time(job["duration_sec"] or 0),
        "stories": stories,
    }


def build(job: dict, dst: Path) -> Path:
    """Собирает zip: index.html + audio/*.mp3. Возвращает путь к архиву."""
    data = _payload(job)
    title = Path(job["filename"]).stem[:80] or "Story Splitter"
    page = (PAGE
            .replace("__TITLE__", html.escape(title))
            .replace("__DATA__", json.dumps(data, ensure_ascii=False)))

    with zipfile.ZipFile(dst, "w") as zf:
        zf.writestr("index.html", page, compress_type=zipfile.ZIP_DEFLATED)
        for story in job["stories"]:
            src = Path(story["audio_path"] or "")
            if src.exists():
                # mp3 уже сжат — повторное сжатие только жжёт процессор
                zf.write(src, f"audio/{audio_name(story)}", compress_type=zipfile.ZIP_STORED)

    logger.info("Бандл собран: %s (%.1f МБ)", dst.name, dst.stat().st_size / 1024 / 1024)
    return dst
