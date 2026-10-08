"""Extract the original JPEG thumbnails without importing passwords or changing the source."""
import base64, csv, sys, re
from pathlib import Path
source = Path(sys.argv[1] if len(sys.argv) > 1 else '../sources/SampleAADUserData.csv')
output = Path('public/photos'); output.mkdir(parents=True, exist_ok=True)
with source.open(newline='') as file:
    next(file)
    rows = list(csv.DictReader(file))
for row in rows:
    alias = row['mailNickName']
    assert re.fullmatch(r'[\w.-]+', alias)
    image = base64.b64decode(row['thumbnailPhoto'], validate=True)
    assert image.startswith(b'\xff\xd8\xff')
    (output / (alias + '.jpg')).write_bytes(image)
print(f'Extracted {len(rows)} original JPEG thumbnails')
