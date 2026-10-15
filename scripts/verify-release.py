"""Verify release checksums and that the extension archive matches the built dist."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--release-dir', type=Path, default=ROOT / 'artifacts/release')
    parser.add_argument('--dist-dir', type=Path, default=ROOT / 'dist')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    release = args.release_dir.resolve(strict=True)
    dist = args.dist_dir.resolve(strict=True)
    sums = {}
    for line in (release / 'SHA256SUMS.txt').read_text(encoding='ascii').splitlines():
        match = re.fullmatch(r'([a-f0-9]{64})  ([A-Za-z0-9.-]+)', line)
        if not match or match[2] in sums:
            raise ValueError('Invalid checksum list')
        if digest(release / match[2]) != match[1]:
            raise ValueError('Checksum mismatch: ' + match[2])
        sums[match[2]] = match[1]
    setups = [name for name in sums if name.endswith('.exe')]
    if len(sums) != 2 or len(setups) != 1 or 'Correctly-Extension.zip' not in sums:
        raise ValueError('Expected exactly one setup and extension archive')
    manifest = json.loads((release / 'release-manifest.json').read_text(encoding='utf-8-sig'))
    if manifest['setup_sha256'] != sums[setups[0]] or manifest['extension_sha256'] != sums['Correctly-Extension.zip']:
        raise ValueError('Manifest/checksum mismatch')
    expected = {'dist/' + path.relative_to(dist).as_posix(): path for path in dist.rglob('*') if path.is_file()}
    with zipfile.ZipFile(release / 'Correctly-Extension.zip') as archive:
        if len(archive.namelist()) != len(set(archive.namelist())) or set(archive.namelist()) != set(expected):
            raise ValueError('Extension archive inventory mismatch')
        for name, path in expected.items():
            if archive.read(name) != path.read_bytes():
                raise ValueError('Extension archive differs from dist: ' + name)
    result = {'ok': True, 'setup': setups[0], 'setup_bytes': (release / setups[0]).stat().st_size,
              'checksums': sums, 'extension_files': len(expected), 'extension_version': json.loads((dist / 'manifest.json').read_text(encoding='utf-8'))['version']}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
