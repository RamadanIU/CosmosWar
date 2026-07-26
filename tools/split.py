#!/usr/bin/env python3
"""
split.py — Разбивает встроенный JS-код игры CosmosWar.html на доменные модули
            в каталоге src/. Делит ТОЛЬКО по границам top-level конструкций
            внутри одного IIFE, поэтому порядок и замыкание сохраняются.

Конструкция:
  CosmosWar.html = HTML_PREFIX + IIFE_PREFIX + IIFE_BODY + IIFE_SUFFIX
  IIFE_BODY разбивается на 24 модуля по заранее вычисленным границам
  (1-based, absolute file line numbers). Модули тайлят тело без пропусков
  и перекрытий.

Сборка обратно — tools/build.py. Round-trip (split -> build) даёт
байт-идентичный исходный файл.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_HTML = os.path.join(ROOT, "CosmosWar.html")
SRC_DIR = os.path.join(ROOT, "src")

# Границы зон исходного файла (1-based absolute lines).
HTML_PREFIX_END = 1167        # строки 1..1167  : <head>..<style>..</style></head>
HTML_BODY_START = 1168        # строки 1168..1482: <body> разметка
IIFE_OPEN_LINE  = 1484        # '    (function() {'
IIFE_STRICT_END = 1486        # 'use strict' + пустая строка — конец префикса IIFE
IIFE_BODY_START = 1487        # первая строка тела IIFE
IIFE_BODY_END   = 12152       # последняя строка тела IIFE (до '    })();')
IIFE_CLOSE_LINE = 12153       # '    })();'

# 24 модуля: (имя_файла, описание, start_line, end_line) — absolute 1-based, inclusive.
# Модули идут в порядке загрузки и тайлят [IIFE_BODY_START .. IIFE_BODY_END] подряд.
MODULES = [
    ("00-core-utils.js",
     "SpatialGrid, ObjectPool, MathUtils, canvas/ctx, MAP_SIZES, COLORS",
     1487, 1618),
    ("01-core-constants.js",
     "makeRNG, PLANET_TYPES, ShipState/Role/Type, стоимости, settings, глобальное состояние G",
     1619, 1699),
    ("02-core-pools.js",
     "Экземпляры spatialGrid/projectilePool/particlePool, gradientCache, _glowSpriteCache",
     1700, 1761),
    ("03-render-cache.js",
     "Кэши рендера: спрайты свечения, звёздный фон, тела планет",
     1762, 1918),
    ("04-input.js",
     "renderCache, объект input, resize канваса и миникарты",
     1919, 1954),
    ("05-faction-data.js",
     "initFactionData, SHIP_UPGRADE_CLASSES, функции апгрейдов кораблей/планет фракций",
     1955, 2106),
    ("06-planets.js",
     "getPlanetByName, applyPlanetUpgradesToPlanet",
     2107, 2140),
    ("07-economy.js",
     "Звёзды/эфириум фракций, трансферы (звёзды/флот/планеты/эфириум), dispatchTroops, initStars",
     2141, 2470),
    ("08-fx.js",
     "spawnProjectile, spawnParticles, spawnExplosion",
     2471, 2510),
    ("09-ships.js",
     "Классы сущностей: Battleship, EscortShip, CargoShip, Colonizer, Ship, Planet",
     2511, 4583),
    ("10-level-ai.js",
     "generateLevel, оценка целей, апгрейды AI-фракций, enemyAI, checkGameEnd",
     4584, 5006),
    ("11-interaction.js",
     "screenToWorld, handleTap, модалка колонизации",
     5007, 5294),
    ("12-hud.js",
     "updateHUD (верхний HUD), drawMinimap",
     5295, 5632),
    ("13-render.js",
     "render() — основной рендер мира",
     5633, 6555),
    ("14-game-loop.js",
     "update() — симуляция, gameLoop, фиксированный шаг FIXED_DT",
     6556, 6778),
    ("15-menu.js",
     "Меню/спектатор, выбор AI-модели Mistral, экраны победы/поражения",
     6779, 6964),
    ("16-diplomacy-core.js",
     "Состояние дипломатии (DiploStatus/Relations), имена фракций, отношения, дань паразитов",
     6965, 7345),
    ("17-diplomacy-alliances.js",
     "Альянсы (NATO Article 5), голосования, совет LLM",
     7346, 7852),
    ("18-stats-screens.js",
     "Канвасы статистики на экранах конца игры (drawPlanetStats/drawPowerStats/...)",
     7853, 8374),
    ("19-diplomacy-ai.js",
     "AI-решения: aiShould{ProposeAlliance,DeclarePeace,DeclareWar,BreakAlliance}, aiRespondToOffer",
     8375, 8543),
    ("20-diplomacy-inbox.js",
     "Входящие предложения (inbox), модалка дип. оффера, handlePlayerOfferResponse",
     8544, 8991),
    ("21-diplomacy-panel.js",
     "Панель дипломатии: матрица, альянсы, история, чат с LLM (render/wire UI, diploSendMessage)",
     8992, 10560),
    ("22-llm.js",
     "Интеграция с LLM (Mistral): снапшоты, промпты, sanitize действий, выполнение",
     10561, 11895),
    ("23-ui-parasites.js",
     "showNotification, панель апгрейдов, паразиты-линкоры, diplomacyAI, финальный код IIFE",
     11896, 12152),
]


def make_header(name, desc, start, end, order, total):
    return (
        f"// ============================================================\n"
        f"// MODULE: {name}\n"
        f"// Назначение: {desc}\n"
        f"// Оригинальные строки IIFE: {start}-{end}\n"
        f"// Порядок загрузки: {order}/{total}\n"
        f"// ============================================================\n"
        f"\n"
    )


def main():
    with open(SRC_HTML, "r", encoding="utf-8") as f:
        # keepends=True → сохраняем точные байты строк (включая '\n')
        lines = f.readlines()

    # Проверки целостности границ
    assert len(lines) >= IIFE_CLOSE_LINE, f"Файл короче ожидаемого: {len(lines)} строк"
    assert IIFE_BODY_START - 1 >= 0
    # Проверяем, что тело тайлится модулями без пропусков и перекрытий
    cur = IIFE_BODY_START
    for (_n, _d, s, e) in MODULES:
        assert s == cur, f"Разрыв/перекрытие перед {_n}: ожидалось начало {cur}, стоит {s}"
        assert e >= s
        cur = e + 1
    assert cur - 1 == IIFE_BODY_END, f"Модули не доводят до конца тела: остановились на {cur-1}, надо {IIFE_BODY_END}"

    os.makedirs(SRC_DIR, exist_ok=True)

    total = len(MODULES)
    for i, (name, desc, s, e) in enumerate(MODULES, 1):
        # slice: 1-based inclusive [s..e] → 0-based [s-1 : e]
        body = lines[s - 1:e]
        header = make_header(name, desc, s, e, i, total)
        out_path = os.path.join(SRC_DIR, name)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(header)
            f.writelines(body)
        print(f"  src/{name:<28} {e - s + 1:>5} строк (тело)  | строки {s}-{e}")

    body_total = sum(e - s + 1 for (_n, _d, s, e) in MODULES)
    expected = IIFE_BODY_END - IIFE_BODY_START + 1
    print(f"\nГотово: {total} модулей в src/, суммарно {body_total} строк тела IIFE (ожидается {expected}).")
    assert body_total == expected
    print("OK: модули полностью покрывают тело IIFE.")


if __name__ == "__main__":
    main()