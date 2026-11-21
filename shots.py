#!/usr/bin/env python3
"""Play The Quiet Archive in Chromium and capture its screenshots.

Real play only: the driver clicks the game's own buttons and holds real
keys (WASD/arrows + Shift). It never writes into the game, never edits a
file, never touches game state except reading the read-only window.__game
handle to check where the player is. Screenshots are the canvas element
itself, 1280x480 JPEGs. If a warden catches Wren mid-route, the driver
reloads the level and retries with shorter moves.
"""
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = "/home/hatch/workspace/makefun/best-stealth-game-20261121-1759"
GAME_DIR = ROOT + "/game"
SHOT_DIR = ROOT + "/screenshots"
PORT = 8123
BASE = f"http://127.0.0.1:{PORT}"


def start_server():
    proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=GAME_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(30):
        time.sleep(0.2)
        try:
            import urllib.request

            urllib.request.urlopen(BASE + "/index.html", timeout=1)
            return proc
        except Exception:
            pass
    raise RuntimeError("game server did not come up")


def game_state(page):
    return page.evaluate("() => ({state: window.__game.state, level: window.__game.level, "
                          "alarm: window.__game.alarm, stampsLeft: window.__game.stampsLeft, "
                          "player: window.__game.player, time: window.__game.time})")


def enter_room(page, level):
    page.goto(f"{BASE}/index.html?level={level}&mute=1")
    page.wait_for_selector("#ov-start", timeout=10000)
    page.click("#ov-start")
    page.wait_for_selector("#ov-go", timeout=10000)
    page.click("#ov-go")
    page.wait_for_timeout(400)
    st = game_state(page)
    assert st["state"] == "play", f"not in play after entering: {st}"
    assert st["level"] == level, f"wrong level: {st}"
    return st


def hold(page, keys, seconds):
    for k in keys:
        page.keyboard.down(k)
    page.wait_for_timeout(int(seconds * 1000))
    for k in reversed(keys):
        page.keyboard.up(k)
    page.wait_for_timeout(150)


def run_moves(page, moves):
    for keys, seconds in moves:
        hold(page, keys, seconds)


def shoot(page, canvas, name):
    path = f"{SHOT_DIR}/{name}"
    canvas.screenshot(path=path, type="jpeg", quality=82)
    st = game_state(page)
    print(f"{name}: state={st['state']} level={st['level']} alarm={st['alarm']:.2f} "
          f"stampsLeft={st['stampsLeft']} player={st['player']} time={st['time']:.1f}")
    return st


def attempt(page, canvas, level, moves, fallback, name):
    enter_room(page, level)
    run_moves(page, moves)
    st = shoot(page, canvas, name)
    if st["state"] == "play" and st["alarm"] < 0.9:
        return st
    print(f"{name}: retrying with shorter moves (was {st})")
    enter_room(page, level)
    run_moves(page, fallback)
    st = shoot(page, canvas, name)
    assert st["state"] == "play", f"still not in play: {st}"
    return st


def main():
    server = start_server()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 480})
            page.on("pageerror", lambda e: print("PAGE ERROR:", e))
            page.on("console", lambda m: print("CONSOLE:", m.type, m.text) if m.type == "error" else None)
            canvas = page.locator("#game")

            # 1 — cover: level 1, just inside the reading room.
            attempt(page, canvas, 1,
                    [(["d"], 0.9), (["s"], 0.9)],
                    [(["d"], 0.5)],
                    "1-start.jpg")

            # 2 — level 1, bottom corridor: slip down the west wall and
            # sneak east past warden 2's patrol.
            attempt(page, canvas, 1,
                    [(["a"], 0.9), (["s"], 2.4), (["Shift", "d"], 1.4)],
                    [(["a"], 0.9), (["s"], 1.2)],
                    "2-play.jpg")

            # 3 — level 2, the map room: down the west wall, east along
            # the middle floor under the long sight-lines.
            attempt(page, canvas, 2,
                    [(["s"], 1.2), (["d"], 1.5)],
                    [(["s"], 0.8)],
                    "3-play.jpg")

            # 4 — level 3, the vault stair: down the west lane, sneak east
            # while warden 4 walks the same lane.
            attempt(page, canvas, 3,
                    [(["s"], 2.8), (["Shift", "d"], 1.0)],
                    [(["s"], 1.5), (["Shift", "d"], 0.6)],
                    "4-play.jpg")

            browser.close()
    finally:
        server.terminate()
    print("shots done")


if __name__ == "__main__":
    main()
