# Gabung base.apk + classes.dex jadi APK dengan entri STORED rata 4 byte (zipalign), .so tak ada.
import sys, zipfile
base, dex, out = sys.argv[1:4]
zin = zipfile.ZipFile(base)
items = [(i.filename, zin.read(i.filename), i.compress_type) for i in zin.infolist()]
items.append(('classes.dex', open(dex, 'rb').read(), zipfile.ZIP_DEFLATED))
with zipfile.ZipFile(out, 'w') as z:
    for name, data, ct in items:
        if name == 'resources.arsc' or name.endswith('.png'):
            ct = zipfile.ZIP_STORED
        zi = zipfile.ZipInfo(name, date_time=(2026, 10, 13, 0, 0, 0))
        zi.compress_type = ct
        if ct == zipfile.ZIP_STORED:
            # header = 30 + len(name) + extra; pad extra so data starts on 4-byte boundary
            off = z.fp.tell() + 30 + len(name.encode())
            pad = (4 - off % 4) % 4
            zi.extra = b'\0' * pad
        z.writestr(zi, data)
