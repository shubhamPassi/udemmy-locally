"""Create a small Drive preview sidecar from a local video. Requires ffmpeg."""
import argparse
import base64
import json
import math
import re
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path, help='Local video file (never a remote URL)')
    args = parser.parse_args()
    video = args.video.resolve(strict=True)
    if not video.is_file():
        parser.error('Provide a local video file')
    if not shutil.which('ffmpeg'):
        parser.error('Install ffmpeg and add it to PATH')
    output = video.with_name(video.name + '.tutin-previews.json')
    if output.exists():
        parser.error('Sidecar already exists; rename or remove it before regenerating')
    if shutil.which('ffprobe'):
        duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(video)], text=True).strip())
    else:
        probe = subprocess.run(['ffmpeg', '-nostdin', '-i', str(video)], capture_output=True, text=True)
        match = re.search(r'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)', probe.stderr)
        if not match:
            parser.error('Could not read video duration')
        hours, minutes, seconds = map(float, match.groups())
        duration = hours * 3600 + minutes * 60 + seconds
    if not math.isfinite(duration) or duration <= 0 or duration > 120000:
        parser.error('Unsupported video duration')
    with tempfile.TemporaryDirectory(prefix='tutin-previews-') as temp:
        # One sequential decode avoids hundreds of independent video seeks.
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(video), '-an', '-sn', '-vf', "fps=1/10:start_time=0:round=up,scale=240:136:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=240:136:(ow-iw)/2:(oh-ih)/2", '-q:v', '7', '-threads', '1', str(Path(temp) / '%06d.jpg')], check=True)
        frames = []
        for index, image in enumerate(sorted(Path(temp).glob('*.jpg'))):
            if index * 10 >= duration:
                break
            data = 'data:image/jpeg;base64,' + base64.b64encode(image.read_bytes()).decode('ascii')
            if len(data) > 50000:
                raise ValueError('Generated frame exceeds preview size limit')
            frames.append([index * 10, data])
        if len(frames) != math.ceil(duration / 10):
            raise ValueError('Incomplete preview output')
        bundle = json.dumps({'version': 1, 'interval': 10, 'duration': duration, 'frames': frames}, separators=(',', ':'))
        if len(bundle.encode('utf-8')) > 16 * 1024 * 1024:
            raise ValueError('Preview bundle exceeds 16 MB; split this long video first')
        with output.open('x', encoding='utf-8') as file:
            file.write(bundle)
    print(f'Created {output.name}: {len(frames)} previews. Upload beside {video.name} in Drive.')


if __name__ == '__main__':
    main()

