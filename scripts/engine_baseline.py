"""Capture/compare synthetic V2 responses. Never supply personal text here."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import statistics
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "src"))
from correctly_server.health import check

CORPUS = [
    ("fr", "je sui content"), ("fr", "je suis aller au magasin hier"),
    ("fr", "ils est parti hier"), ("fr", "C'est une très belle journée."),
    ("en-US", "I has a car"), ("en-US", "She go to school yesterday"),
    ("en-US", "I have an apple."), ("auto", "i has 300€"),
    ("fr", "Bonjour 👋 je sui ici"), ("en-GB", "He have a colour pencil."),
    ("fr", "L’été, j’aime les cafés. 👩🏽‍💻 Ils est parti."),
]


def capture(port):
    samples = []
    for language, text in CORPUS:
        params = {} if language != "auto" else dict(preferredVariants="en-US",
            preferredLanguages="en,fr", forcePreferredLanguages="true")
        started = time.perf_counter()
        response = check(port, text, language, timeout=60, **params)
        samples.append(dict(language=language, text=text, parameters=params,
                            elapsed_ms=round((time.perf_counter() - started) * 1000, 3),
                            response=response))
    return dict(captured_at=datetime.now(timezone.utc).isoformat(), samples=samples)


def normalized(sample):
    # Compare all match fields (including categories/messages/replacements) and
    # detected language; only top-level software/warnings/processing metadata vary.
    response = sample["response"]
    return {key: response[key] for key in ("matches", "language")}


def compare(before, after):
    if len(before["samples"]) != len(after["samples"]):
        raise AssertionError("Corpus size changed")
    for i, (a, b) in enumerate(zip(before["samples"], after["samples"])):
        for key in ("text", "language", "parameters"):
            if a[key] != b[key]:
                raise AssertionError(f"Corpus differs at sample {i}")
        if normalized(a) != normalized(b):
            raise AssertionError(f"Corrections differ at synthetic sample {i}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8081)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--compare", type=Path)
    args = parser.parse_args()
    result = capture(args.port)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.compare:
        compare(json.loads(args.compare.read_text(encoding="utf-8")), result)
    times = [s["elapsed_ms"] for s in result["samples"]]
    print(f"Captured {len(times)} synthetic samples; median {statistics.median(times):.1f} ms")


if __name__ == "__main__":
    main()
