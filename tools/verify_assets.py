#!/usr/bin/env python3
"""Check every committed .glb is structurally complete.

Written after a truncation incident: assets/models/tower.glb was committed at
30,012 bytes while its own header still declared 329,332, and navmesh.glb the
same. Both parsed far enough to look like files and then failed inside
three.js's GLTFLoader, so the tower and the navmesh simply never appeared. No
error surfaced in the build, and the symptoms — missing tower, broken
collisions — looked like modelling bugs. Two follow-up PRs chased them.

Anything over roughly 30 KB was affected and anything under it survived, which
is the signature of a write ceiling rather than bad geometry.

Run from the repo root:

    python3 tools/verify_assets.py

Exits non-zero if any file is short, so it can gate a commit or CI step.
"""

import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def check(path):
    """Return a list of problems with one .glb, empty if it is sound."""
    data = path.read_bytes()
    problems = []

    if len(data) < 20:
        return ['file is %d bytes — too short to be a GLB' % len(data)]

    magic = data[:4]
    if magic != b'glTF':
        return ['bad magic %r — not a GLB' % magic]

    _version, declared = struct.unpack('<II', data[4:12])
    if declared != len(data):
        problems.append(
            'header declares %d bytes but the file is %d — TRUNCATED, %d bytes missing'
            % (declared, len(data), declared - len(data)))

    # Walk the chunks and confirm each one's payload is actually present.
    off = 12
    while off + 8 <= len(data):
        chunk_len, = struct.unpack('<I', data[off:off + 4])
        tag = data[off + 4:off + 8]
        available = len(data) - off - 8
        if chunk_len > available:
            problems.append(
                '%s chunk needs %d bytes, only %d present — short by %d'
                % (tag.decode('ascii', 'replace').strip('\x00') or '?',
                   chunk_len, available, chunk_len - available))
            break
        off += 8 + chunk_len + ((4 - chunk_len % 4) % 4 if chunk_len % 4 else 0)

    return problems


def main():
    files = sorted(ROOT.glob('assets/**/*.glb'))
    if not files:
        print('no .glb files found under assets/')
        return 1

    bad = 0
    for f in files:
        rel = f.relative_to(ROOT)
        problems = check(f)
        if problems:
            bad += 1
            print('FAIL  %s  (%d bytes)' % (rel, f.stat().st_size))
            for p in problems:
                print('        %s' % p)
        else:
            print('ok    %-34s %9d bytes' % (rel, f.stat().st_size))

    print()
    if bad:
        print('%d of %d file(s) are damaged.' % (bad, len(files)))
        print('Recover from git history rather than regenerating blind:')
        print('  git log --all --oneline -- <path>')
        print('  git checkout <good-commit> -- <path>')
        return 1

    print('all %d .glb file(s) intact.' % len(files))
    return 0


if __name__ == '__main__':
    sys.exit(main())
