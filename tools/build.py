#!/usr/bin/env python3
"""
build.py — Собирает игру CosmosWar.html из доменных модулей src/*.js.

Склеивает тела модулей (без заголовков-комментариев) в исходном порядке
загрузки (имена сортируются лексически по префиксам 00..23) в один IIFE,
оборачивает стандартным HTML/CSS-каркасом и записывает готовый CosmosWar.html.

Склейка тел модулей в исходном порядке = байт-идентичный телу оригинального
IIFE: порядок top-level деклараций не меняется → все TDZ/hoisting-порядки и
ссылки по замыканию сохраняются. Поведение игры не меняется.

Использование:
    python3 tools/build.py            # собрать в CosmosWar.html
    python3 tools/build.py --check    # собрать и сверить с оригиналом

Статическая часть (CSS + HTML-разметка) живёт в assets/:
    assets/head.html  — <head>..<style>..</head>
    assets/body.html  — <body> разметка (до <script>)
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "src")
ASSETS_DIR = os.path.join(ROOT, "assets")
OUT_HTML = os.path.join(ROOT, "CosmosWar.html")
BACKUP_HTML = os.path.join(ROOT, "tools", "CosmosWar.original.html")

HTML_HEAD = os.path.join(ASSETS_DIR, "head.html")
HTML_BODY = os.path.join(ASSETS_DIR, "body.html")

# Точное обрамление IIFE (байт-в-байт как в оригинале).
SCRIPT_PREFIX = "    <script>\n    (function() {\n        'use strict';\n\n"
SCRIPT_SUFFIX = "    })();\n</script>\n</body>\n</html>"  # без финал��ного \n

# Маркер границы заголовка модуля (см. split.py :: make_header).
HEADER_MARKER = "// ============================================================\n"


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def strip_header(text):
    """УбираетLeading заголовок-комментарий модуля, оставляя чистое тело.
    Заголовок: HEADER_MARKER ... HEADER_MARKER + пустая строка."""
    first = text.find(HEADER_MARKER)
    if first == -1:
        return text  # заголовка нет — отдаём как есть
    second = text.find(HEADER_MARKER, first + len(HEADER_MARKER))
    if second == -1:
        return text
    end = second + len(HEADER_MARKER)
    # пропускаем одну пустую строку-разделитель после заголовка
    if text[end:end + 1] == "\n":
        end += 1
    return text[end:]


def list_modules():
    files = [fn for fn in os.listdir(SRC_DIR) if fn.endswith(".js")]
    files.sort()  # лексики по префиксам 00..23 = порядок загрузки
    return files


def build():
    head = read(HTML_HEAD)
    body = read(HTML_BODY)
    modules = list_modules()
    if not modules:
        sys.exit(f"Нет модулей в {SRC_DIR}")

    bodies = [strip_header(read(os.path.join(SRC_DIR, fn))) for fn in modules]
    # Склеиваем тела БЕЗ доп. разделителей: каждое тело уже сохраняет
    # точные завершающие переводы строк оригинала → конкат = оригинал.
    iife_body = "".join(bodies)

    out = head + body + SCRIPT_PREFIX + iife_body + SCRIPT_SUFFIX
    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"Собрано: {OUT_HTML}  ({len(out)} байт, {out.count(chr(10))} строк, {len(modules)} модулей)")
    return out


def check(orig_path):
    if not os.path.exists(orig_path):
        print(f"Оригинал {orig_path} не найден — сверка пропущена.")
        return
    out = read(OUT_HTML)
    orig = read(orig_path)
    if out == orig:
        print("OK: собранный файл БАЙТ-ИДЕНТИЧЕН оригиналу.")
        return
    n = min(len(out), len(orig))
    i = 0
    while i < n and out[i] == orig[i]:
        i += 1
    line = out[:i].count("\n") + 1
    print(f"РАСХОЖДЕНИЕ на символе {i} (строка ~{line}):")
    print(f"  оригинал: {orig[i:i + 80]!r}")
    print(f"  сборка  : {out[i:i + 80]!r}")
    if len(out) != len(orig):
        print(f"  длина: оригинал {len(orig)}, сборка {len(out)}")
    sys.exit(1)


if __name__ == "__main__":
    build()
    if "--check" in sys.argv:
        check(BACKUP_HTML)