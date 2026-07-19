#!/usr/bin/env python3
"""批量为词库生成发音音频（edge-tts，微软神经语音）。

用法：
    pip install edge-tts
    python3 scripts/generate-audio.py

输出到 public/audio/{sha1(text)[:16]}.mp3，与 src/services/tts.ts 中的
audioUrlFor() 使用同一哈希约定。已存在的文件会跳过，可随时中断重跑。
"""

import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path

import edge_tts

VOICE = "en-GB-SoniaNeural"
RATE = "-10%"  # 略放慢，与旧 Web Speech 的 0.9 语速一致
CONCURRENCY = 8
MAX_RETRIES = 3

ROOT = Path(__file__).resolve().parent.parent
WORDS_JSON = ROOT / "src" / "data" / "ket-words.json"
OUT_DIR = ROOT / "public" / "audio"


def base_word(word: str) -> str:
    """与 src/lib/word-utils.ts 的 baseWord 保持一致。"""
    stripped = re.sub(r" \([^)]*\)", "", word).strip()
    return re.sub(r"\(([^)]*)\)", "", stripped)


def filename_for(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16] + ".mp3"


async def synth(sem: asyncio.Semaphore, text: str, path: Path) -> bool:
    async with sem:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                tmp = path.with_suffix(".tmp")
                await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(tmp))
                tmp.rename(path)
                return True
            except Exception as e:
                if attempt == MAX_RETRIES:
                    print(f"FAILED: {text!r}: {e}", file=sys.stderr)
                    return False
                await asyncio.sleep(2 * attempt)
    return False


async def main() -> None:
    words = json.loads(WORDS_JSON.read_text())
    texts = set()
    for w in words:
        texts.add(base_word(w["word"]))
        if w.get("example"):
            texts.add(w["example"])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = {t: OUT_DIR / filename_for(t) for t in sorted(texts)}
    pending = {t: p for t, p in todo.items() if not p.exists()}
    print(f"{len(todo)} unique texts, {len(pending)} to generate")

    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = [synth(sem, t, p) for t, p in pending.items()]
    done = 0
    failed = 0
    for coro in asyncio.as_completed(tasks):
        ok = await coro
        done += 1
        failed += 0 if ok else 1
        if done % 100 == 0:
            print(f"{done}/{len(tasks)} done ({failed} failed)")
    print(f"finished: {done} processed, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
