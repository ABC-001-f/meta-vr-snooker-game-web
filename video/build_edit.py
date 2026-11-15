"""Assemble the CueVerse VR demo video in ReelForge Studio (the editor in ../../video editor).

Steps (each can be run on its own):
    encode   frames/ (from record.mjs)       -> out/gameplay.mp4
    remotion Remotion Intro and Outro         -> out/intro.mp4, out/outro.mp4
    music    synthesised music bed            -> out/music.wav
    project  ReelForge project with captions  -> out/CueVerse VR demo.vedit
    export   editor's own exporter            -> out/CueVerse VR demo.mp4

Run with the editor's Python:
    "C:/Users/CHIBYKE/Documents/video editor/.venv/Scripts/python.exe" video/build_edit.py all
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
FRAMES = os.path.join(HERE, "frames")
EDITOR = r"C:\Users\CHIBYKE\Documents\video editor"
MUSIC_SCRIPT = r"C:\Users\CHIBYKE\Documents\sample video jingle assets\build\make_music.py"
PROJECT = os.path.join(OUT, "CueVerse VR demo.vedit")
MP4 = os.path.join(OUT, "CueVerse VR demo.mp4")

W, H, FPS = 1920, 1080, 30.0
INTRO, OUTRO = 10.0, 12.0
GAME_AT = INTRO - 0.5            # gameplay fades in over the intro's tail
GOLD, CREAM, NIGHT = "#e2be64", "#f3ecd8", "#050d08"


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def events():
    with open(os.path.join(FRAMES, "events.json"), encoding="utf-8") as fh:
        return json.load(fh)


# ------------------------------------------------------------------ steps
def step_encode():
    ev = events()
    cmd = [ffmpeg(), "-y", "-hide_banner", "-loglevel", "error", "-framerate", str(ev["fps"]),
           "-i", os.path.join(FRAMES, "f%05d.jpg"), "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", os.path.join(OUT, "gameplay.mp4")]
    subprocess.run(cmd, check=True)
    print("gameplay.mp4:", ev["frames"], "frames")


def step_remotion():
    rdir = os.path.join(HERE, "remotion")
    for comp, name in (("Intro", "intro.mp4"), ("Outro", "outro.mp4")):
        cmd = f'npx remotion render src/index.ts {comp} "{os.path.join(OUT, name)}" --concurrency=2'
        print(">", cmd, flush=True)
        subprocess.run(cmd, cwd=rdir, shell=True, check=True)


def total_seconds():
    return GAME_AT + events()["seconds"] - 0.6 + OUTRO


def step_music():
    py = os.path.join(EDITOR, ".venv", "Scripts", "python.exe")
    subprocess.run([py, MUSIC_SCRIPT, f"{total_seconds():.1f}", os.path.join(OUT, "music.wav")], check=True)


# ------------------------------------------------------------------ project
LAYERS = []


def fx(enter=None, exit_=None, tin=None):
    def pres(spec, ease):
        if not spec:
            return {"type": "None", "duration": 0.6, "easing": ease}
        return {"type": spec[0], "duration": spec[1], "easing": ease}
    return {"entrance": pres(enter, "Ease Out"),
            "emphasis": {"type": "None", "speed": 1.0, "strength": 1.0, "color": GOLD},
            "exit": pres(exit_, "Ease In"),
            "transition_in": {"type": tin[0], "duration": tin[1]} if tin else {"type": "None", "duration": 0.5},
            "transition_out": {"type": "None", "duration": 0.5},
            "motion_path": {"type": "None", "duration": 2.0, "delay": 0.0, "easing": "Ease In Out", "size": 40.0,
                            "repeat": False, "pingpong": False, "points": []}}


def layer(media, name, start, end, y=0.0, x=0.0, op=100.0, text=None, enter=None, exit_=None, tin=None,
          audio=None, offset=0.0, color="#8b5cf6"):
    LAYERS.append({
        "media": media if text is None else f"generated:{name}", "name": name, "color": color,
        "start": round(start, 3), "duration": round(end - start, 3), "offset": offset,
        "x": float(x), "y": float(y), "scale": 100.0, "rotation": 0.0, "opacity": float(op), "visible": True,
        "keyframes": {},
        "defaults": {"position": [float(x), float(y)], "scale": 100.0, "rotation": 0.0, "opacity": float(op),
                     "start": round(start, 3), "duration": round(end - start, 3)},
        "fx": fx(enter, exit_, tin), "text": text, "shape": None,
        "object": {"blend": "Normal", "locked": False, "anchor_x": 0.0, "anchor_y": 0.0, "flip_h": False, "flip_v": False},
        # silent clips (no audio stream) must be muted or the editor's ffmpeg mix fails
        "audio": audio or {"volume": 100, "muted": media is not None and media.endswith(".mp4"), "fade_in": 0.0, "fade_out": 0.0},
    })


def caption_text(text, size=40, color=CREAM, bg="#cc050d08"):
    return {"text": text, "font": "Segoe UI", "size": size, "bold": True, "italic": False, "color": color,
            "stroke": color, "stroke_width": 0.6, "shadow": True, "shadow_color": "#a6000000", "align": "center",
            "spacing": 0.0, "line_height": 1.15, "max_width": 1500, "bg": bg, "bg_radius": 22, "padding": 22}


# event -> caption (first occurrence only), shown for CAP seconds
CAPTIONS = {
    "startFrame": "Name your club, step in, and the frame is set up against the House Pro",
    "break": "Break off.  In the headset: close your hand on the cue and push through the white",
    "shot:plan": "Real spin physics: balls slide, roll, swerve and take side off the cushions",
    "ai": "The House Pro plays its visit, at Rookie, Club or Professional level",
    "replay:cinematic": "Instant replay, in slow motion from the pocket",
    "replay:overhead": "Or from directly above the table",
    "overview": "Walk round the table.  In the headset: pinch the air and drag",
    "club:underground": "Four clubs.  The Underground Snooker Lounge",
    "club:hall": "The Professional Tournament Hall, with a crowd",
    "club:cyber": "The Futuristic Cyber Arena, a table floating above the city",
    "help": "Every rule and control, one key away",
}
CAP = 3.6


def step_project():
    LAYERS.clear()
    ev = events()
    game_len = ev["seconds"]
    game_end = GAME_AT + game_len
    outro_at = game_end - 0.6
    total = outro_at + OUTRO

    # captions, spaced so they never overlap
    shown, last_end = set(), -1.0
    for e in ev["events"]:
        if e["name"] not in CAPTIONS or e["name"] in shown:
            continue
        start = max(GAME_AT + e["t"] + 0.3, last_end + 0.3)
        end = min(start + CAP, outro_at - 0.3)
        if end - start < 1.5:
            continue
        shown.add(e["name"])
        last_end = end
        layer(None, "Caption " + e["name"], start, end, y=290, text=caption_text(CAPTIONS[e["name"]]),
              enter=("Fly In Bottom", 0.45), exit_=("Fade", 0.35), color="#f59e0b")

    # honest label across the gameplay
    layer(None, "Capture note", GAME_AT + 0.6, outro_at, y=-505, x=640,
          text=caption_text("Desktop preview capture  ·  no headset available", 22, "#b9c7b8", "#99050d08"),
          enter=("Fade", 0.6), exit_=("Fade", 0.4), color="#64748b")

    layer(os.path.join(OUT, "outro.mp4"), "Outro (Remotion)", outro_at, total, enter=("Fade", 0.6), color="#22d3ee")
    layer(os.path.join(OUT, "gameplay.mp4"), "Gameplay (Chromium recording)", GAME_AT, game_end,
          enter=("Fade", 0.5), color="#34d399")
    layer(os.path.join(OUT, "intro.mp4"), "Intro (Remotion)", 0.0, INTRO, color="#22d3ee")
    layer(os.path.join(OUT, "music.wav"), "Music", 0.0, total, color="#fb7185",
          audio={"volume": 60, "muted": False, "fade_in": 1.0, "fade_out": 3.0})

    media = [os.path.join(OUT, n) for n in ("music.wav", "intro.mp4", "gameplay.mp4", "outro.mp4")]
    data = {"version": 1,
            "comp": {"name": "CueVerse VR demo", "width": W, "height": H, "fps": FPS, "duration": round(total, 3),
                     "background": {"type": "solid", "color": NIGHT, "color2": NIGHT, "direction": "vertical"}},
            "time": 0.0, "media": media, "layers": LAYERS}
    with open(PROJECT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1)
    print(f"project: {PROJECT}  ({total:.1f} s, {len(LAYERS)} layers, captions: {sorted(shown)})")


# ------------------------------------------------------------------ export
def _editor_project():
    sys.path.insert(0, EDITOR)
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    os.environ.setdefault("QT_QPA_FONTDIR", r"C:\Windows\Fonts")
    from PySide6.QtWidgets import QApplication
    app = QApplication.instance() or QApplication(sys.argv)
    from app.core.serialize import load_project
    project, missing = load_project(PROJECT)
    if missing:
        raise SystemExit("MISSING MEDIA:\n  " + "\n  ".join(missing))
    return app, project


def step_preview(times=None):
    app, project = _editor_project()
    from app.core.export import save_frame
    folder = os.path.join(OUT, "preview")
    os.makedirs(folder, exist_ok=True)
    for t in times or [2, 8, 12, 20, 45, 70, 100, 112, 118]:
        p = os.path.join(folder, f"frame_{t:06.1f}s.png")
        save_frame(project, p, float(t))
        print("preview:", p)


def step_export(quality="good"):
    app, project = _editor_project()
    from app.core.export import FORMAT_BY_KEY, QUALITIES, ExportSettings, Exporter
    q = {"draft": "Draft  (small, fast)", "good": "Good  (balanced)", "best": "Best  (large, slow)"}[quality]
    assert q in QUALITIES
    exporter = Exporter(project, ExportSettings(path=MP4, format=FORMAT_BY_KEY["mp4"], quality=q))
    t0, state, result = time.time(), {"last": 0}, {}

    def on_progress(i, n):
        if i - state["last"] >= 150 or i == n:
            state["last"] = i
            el = time.time() - t0
            print(f"  {i}/{n} frames  {el:5.0f}s elapsed  eta {el / max(i, 1) * (n - i):4.0f}s", flush=True)

    exporter.progress.connect(on_progress)
    exporter.finished.connect(lambda ok, msg: result.update(ok=ok, msg=msg))
    exporter.run(app.processEvents)
    print(result.get("msg"))
    return 0 if result.get("ok") else 1


def main():
    os.makedirs(OUT, exist_ok=True)
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("encode", "all"):
        step_encode()
    if what in ("remotion", "all"):
        step_remotion()
    if what in ("music", "all"):
        step_music()
    if what in ("project", "all"):
        step_project()
    if what == "preview":
        step_preview([float(a) for a in sys.argv[2:]] or None)
    if what in ("export", "all"):
        return step_export(sys.argv[2] if what == "export" and len(sys.argv) > 2 else "good")
    return 0


if __name__ == "__main__":
    code = main()
    sys.stdout.flush()
    os._exit(code)
