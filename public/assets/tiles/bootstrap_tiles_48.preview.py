import json, os
from PIL import Image, ImageDraw, ImageFont
ROOT="/Users/milan.fox/Projects (Private)/gamedev-1/public/assets/tiles"
OUT="/Users/milan.fox/Projects (Private)/gamedev-1/docs/assets-preview.png"
meta=json.load(open(os.path.join(ROOT,'bootstrap_tiles_48.json')))
atlas=Image.open(os.path.join(ROOT,meta['image'])).convert('RGBA')
names=list(meta['frames'])
GROUPS=[("FLOORS","floor."),("WALLS & BLOCKERS","wall."),("",'blocker.'),("FEATURES","feature."),
        ("ORE & ROCK","ore."),("",'rock.'),("PLANTS","plant."),("ITEMS","item."),("OVERLAYS","overlay.")]
CW,CH,PAD=196,96,10
COLS=6
f_lbl=ImageFont.truetype("/System/Library/Fonts/Menlo.ttc",12)
f_hdr=ImageFont.truetype("/System/Library/Fonts/Menlo.ttc",16)
f_ttl=ImageFont.truetype("/System/Library/Fonts/Menlo.ttc",22)
# layout pass
rows=[]  # ('hdr', text) or ('row', [names])
i=0
seen=set()
for title,prefix in GROUPS:
    grp=[n for n in names if n.startswith(prefix) and n not in seen]
    seen.update(grp)
    if not grp: continue
    if title: rows.append(('hdr',title))
    for k in range(0,len(grp),COLS): rows.append(('row',grp[k:k+COLS]))
H=70+sum(34 if r[0]=='hdr' else CH+6 for r in rows)+24
W=COLS*CW+2*PAD
img=Image.new('RGBA',(W,H),(10,14,20,255)); d=ImageDraw.Draw(img)
d.text((PAD,16),"BOOTSTRAP — curated tile atlas",fill=(53,224,200),font=f_ttl)
d.text((PAD,46),f"public/assets/tiles/bootstrap_tiles_48.png  •  {len(names)} tiles @ 48x48  •  shown 1:1  •  all sources CC0 (Kenney.nl)",fill=(106,122,140),font=f_lbl)
y=70
for kind,payload in rows:
    if kind=='hdr':
        d.line([(PAD,y+16),(W-PAD,y+16)],fill=(40,52,66))
        d.rectangle([PAD,y+4,PAD+len(payload)*10+12,y+28],fill=(10,14,20))
        d.text((PAD+6,y+8),payload,fill=(255,176,32),font=f_hdr)
        y+=34; continue
    for j,n in enumerate(payload):
        fr=meta['frames'][n]
        x=PAD+j*CW
        d.rectangle([x,y,x+CW-8,y+CH-8],fill=(27,36,48),outline=(45,58,74))
        tile=atlas.crop((fr['x'],fr['y'],fr['x']+fr['w'],fr['y']+fr['h']))
        img.alpha_composite(tile,(x+8,y+(CH-8-48)//2))
        if len(n)<=20:
            d.text((x+64,y+22),n,fill=(201,213,227),font=f_lbl)
            ny=y+22
        else:
            cut=n.rfind('.',0,20)
            d.text((x+64,y+14),n[:cut+1],fill=(201,213,227),font=f_lbl)
            d.text((x+64,y+30),n[cut+1:],fill=(201,213,227),font=f_lbl)
        s=fr['src']
        d.text((x+64,y+48),s['sheet']+"  "+(s.get('key','').replace('.png','') or f"{s['x']},{s['y']}"),fill=(106,122,140),font=f_lbl)
    y+=CH+6
img.convert('RGB').save(OUT)
print(OUT, img.size)
