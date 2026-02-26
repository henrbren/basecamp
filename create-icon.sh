#!/bin/bash
# Create a simple app icon using sips and an SVG
ICON_DIR="/Users/henrikbrendhagen/Local dev/project-dashboard/DevDashboard.app/Contents/Resources"

# Create a 512x512 PNG using Python
python3 -c "
import struct, zlib

W, H = 512, 512

def create_pixel(r, g, b, a=255):
    return bytes([r, g, b, a])

pixels = bytearray()
for y in range(H):
    pixels.append(0)  # filter byte
    for x in range(W):
        cx, cy = x - W//2, y - H//2
        dist = (cx*cx + cy*cy) ** 0.5
        radius = W * 0.42
        
        if dist > radius + 2:
            pixels.extend([0, 0, 0, 0])
        elif dist > radius:
            alpha = int(255 * max(0, 1 - (dist - radius) / 2))
            t = (x + y) / (W + H)
            r = int(99 + (236 - 99) * t)
            g = int(102 + (72 - 102) * t)
            b = int(241 + (153 - 241) * t)
            pixels.extend([r, g, b, alpha])
        else:
            t = (x + y * 0.5) / (W + H * 0.5)
            r = int(99 + (236 - 99) * t)
            g = int(102 + (72 - 102) * t)
            b = int(241 + (153 - 241) * t)
            
            # Draw D letter
            lx = (x - W * 0.32) / W
            ly = (y - H * 0.28) / H
            in_d = False
            
            # D stem
            if 0 <= lx <= 0.08 and 0 <= ly <= 0.44:
                in_d = True
            # D curve top
            if 0.04 <= lx <= 0.28 and -0.02 <= ly <= 0.06:
                in_d = True
            # D curve bottom
            if 0.04 <= lx <= 0.28 and 0.38 <= ly <= 0.46:
                in_d = True
            # D curve right
            dx = lx - 0.14
            dy = ly - 0.22
            if 0.15 < (dx*dx/(0.18*0.18) + dy*dy/(0.26*0.26)) < 0.35 and lx > 0.12:
                in_d = True
                
            if in_d:
                pixels.extend([255, 255, 255, 240])
            else:
                pixels.extend([r, g, b, 255])

# Create PNG
def create_png(width, height, raw_data):
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc
    
    header = b'\\x89PNG\\r\\n\\x1a\\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    compressed = zlib.compress(bytes(raw_data), 9)
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

png_data = create_png(W, H, pixels)
with open('$ICON_DIR/icon.png', 'wb') as f:
    f.write(png_data)
print('Icon created')
"

# Convert to icns using sips and iconutil
ICONSET="$ICON_DIR/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 64 128 256 512; do
    sips -z $size $size "$ICON_DIR/icon.png" --out "$ICONSET/icon_${size}x${size}.png" 2>/dev/null
    double=$((size * 2))
    if [ $double -le 1024 ]; then
        sips -z $double $double "$ICON_DIR/icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" 2>/dev/null
    fi
done

iconutil -c icns "$ICONSET" -o "$ICON_DIR/AppIcon.icns" 2>/dev/null
rm -rf "$ICONSET" "$ICON_DIR/icon.png"
echo "Done!"
