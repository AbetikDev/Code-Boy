#!/usr/bin/env python3
"""Rebuild original Code Boy pixel assets. Python standard library only.

This is source artwork: every pixel is drawn at its native game resolution.
The generated concept in assets/reference is retained unchanged, never processed.
"""
from pathlib import Path
import json
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
P = {
    'ink': '#101429', 'black': '#090e1e', 'shadow': '#20203d', 'wall': '#29283f',
    'wall2': '#35334d', 'navy': '#242b4b', 'blue': '#3b527d', 'blue2': '#64769c',
    'purpleD': '#493369', 'purple': '#8055c9', 'violet': '#ad8ce8', 'lavender': '#d3b9ed',
    'mint': '#80f1d4', 'teal': '#399d9c', 'green': '#5aac8d', 'greenD': '#32695f',
    'orange': '#ffac69', 'orangeD': '#b96c52', 'yellow': '#f8d78a', 'cream': '#f1e8cf',
    'red': '#ef7888', 'wood': '#88605b', 'woodD': '#533e4d', 'woodL': '#be8370',
    'white': '#ffffff', 'transparent': '#00000000'
}

def rgba(c):
    c = P.get(c, c).lstrip('#')
    return tuple(int(c[i:i+2], 16) for i in range(0, len(c), 2)) + (() if len(c)==8 else (255,))

class Canvas:
    def __init__(self, w, h, bg='transparent'):
        self.w, self.h = w, h
        self.data = [rgba(bg)] * (w*h)
    def pixel(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.data[y*self.w+x] = rgba(c) if isinstance(c,str) else c
    def rect(self, x,y,w,h,c):
        c = rgba(c) if isinstance(c,str) else c
        for yy in range(max(0,int(y)), min(self.h,int(y+h))):
            for xx in range(max(0,int(x)), min(self.w,int(x+w))): self.data[yy*self.w+xx]=c
    def line(self,x1,y1,x2,y2,c,t=1):
        n=max(abs(int(x2-x1)),abs(int(y2-y1)),1)
        for i in range(n+1): self.rect(round(x1+(x2-x1)*i/n),round(y1+(y2-y1)*i/n),t,t,c)
    def poly(self, pts, c):
        for y in range(max(0, min(p[1] for p in pts)), min(self.h,max(p[1] for p in pts)+1)):
            crossings=[]
            for i,p in enumerate(pts):
                q=pts[(i+1)%len(pts)]
                if (p[1]<=y<q[1]) or (q[1]<=y<p[1]): crossings.append(p[0]+(y-p[1])*(q[0]-p[0])/(q[1]-p[1]))
            crossings.sort()
            for i in range(0,len(crossings)-1,2): self.rect(math.ceil(crossings[i]),y,math.floor(crossings[i+1])-math.ceil(crossings[i])+1,1,c)
    def box(self,x,y,w,h,fill,border='ink',step=2):
        self.rect(x+step,y,w-2*step,h,border); self.rect(x,y+step,w,h-2*step,border)
        self.rect(x+2,y+2,w-4,h-4,fill)
    def blit(self, other, x=0,y=0,scale=1):
        for yy in range(other.h):
            for xx in range(other.w):
                col=other.data[yy*other.w+xx]
                if col[3]: self.rect(x+xx*scale,y+yy*scale,scale,scale,col)
    def save(self,path):
        path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
        raw=b''.join(b'\x00'+bytes(v for pixel in self.data[y*self.w:(y+1)*self.w] for v in pixel) for y in range(self.h))
        def chunk(tag,data): return struct.pack('!I',len(data))+tag+data+struct.pack('!I',zlib.crc32(tag+data)&0xffffffff)
        path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',self.w,self.h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))

FONT={
 'A':['010','101','111','101','101'],'B':['110','101','110','101','110'],'C':['011','100','100','100','011'],
 'D':['110','101','101','101','110'],'E':['111','100','110','100','111'],'F':['111','100','110','100','100'],
 'G':['011','100','101','101','011'],'H':['101','101','111','101','101'],'I':['111','010','010','010','111'],
 'J':['001','001','001','101','010'],'K':['101','101','110','101','101'],'L':['100','100','100','100','111'],
 'M':['101','111','111','101','101'],'N':['101','111','111','111','101'],'O':['010','101','101','101','010'],
 'P':['110','101','110','100','100'],'Q':['010','101','101','111','011'],'R':['110','101','110','101','101'],
 'S':['011','100','010','001','110'],'T':['111','010','010','010','010'],'U':['101','101','101','101','111'],
 'V':['101','101','101','101','010'],'W':['101','101','111','111','101'],'X':['101','101','010','101','101'],
 'Y':['101','101','010','010','010'],'Z':['111','001','010','100','111'],
 '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['110','001','010','100','111'],
 '3':['110','001','010','001','110'],'4':['101','101','111','001','001'],'5':['111','100','110','001','110'],
 '6':['011','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],
 '9':['111','101','111','001','110'],'+':['000','010','111','010','000'],'#':['101','111','101','111','101'],
 '!':['010','010','010','000','010'],'?':['110','001','010','000','010'],'<':['001','010','100','010','001'],
 '>':['100','010','001','010','100'],'/':['001','001','010','100','100'],'-':['000','000','111','000','000'],
 '.':['000','000','000','000','010'],'{':['011','010','100','010','011'],'}':['110','010','001','010','110']}
def text(c,s,x,y,col='cream',scale=1):
    for letter in s.upper():
        for yy,row in enumerate(FONT.get(letter,['000']*5)):
            for xx,v in enumerate(row):
                if v=='1': c.rect(x+xx*scale,y+yy*scale,scale,scale,col)
        x+=4*scale
def heart(c,x,y,col='red',s=1):
    for yy,row in enumerate(['0110110','1111111','1111111','0111110','0011100','0001000']):
        for xx,v in enumerate(row):
            if v=='1': c.rect(x+xx*s,y+yy*s,s,s,col)
def note(c,x,y,col='yellow'):
    c.rect(x+3,y,2,8,col); c.rect(x+4,y,4,2,col); c.rect(x,y+7,5,3,col)
def star(c,x,y,col='yellow'):
    c.rect(x+2,y,1,5,col);c.rect(x,y+2,5,1,col)
def bug(c,x,y,f=0):
    c.rect(x+2,y,4,6,'ink');c.rect(x+1,y+2,6,3,'orangeD');c.rect(x+2,y+2,4,3,'orange');c.line(x+3,y+2,x+3,y+4,'ink')
    for yy in (1,4):
        c.pixel(x,y+yy+(f%2),'cream');c.pixel(x+7,y+yy-(f%2),'cream')
def mug(c,x,y):
    c.box(x,y,9,10,'cream',step=1);c.rect(x+8,y+2,3,5,'orangeD');c.rect(x+9,y+3,1,3,'ink');c.rect(x+2,y+1,5,2,'woodD');c.rect(x+2,y+5,4,2,'orange')
def laptop(c,x=34,y=42,f=0,closed=False):
    if closed:
        c.poly([(x-3,y+9),(x+17,y+9),(x+22,y+14),(x-5,y+14)],'ink');c.rect(x-2,y+10,20,2,'blue2');return
    c.poly([(x+2,y),(x+22,y),(x+18,y+15),(x-2,y+15)],'ink')
    c.poly([(x+4,y+2),(x+20,y+2),(x+17,y+12),(x+1,y+12)],'blue2')
    c.poly([(x+6,y+4),(x+18,y+4),(x+16,y+10),(x+4,y+10)],'navy')
    c.line(x+8,y+6,x+6,y+7,'mint');c.line(x+6,y+7,x+8,y+8,'mint');c.line(x+12,y+6,x+14,y+7,'mint');c.line(x+14,y+7,x+12,y+8,'mint')
    c.poly([(x-3,y+12),(x+18,y+12),(x+20,y+16),(x-6,y+16)],'ink');c.rect(x-3,y+13,20,2,'lavender');c.rect(x+2,y+14,5,1,'purple');c.pixel(x+17,y+14,'mint' if f%2 else 'teal')
def hand(c,x,y):
    c.box(x,y,7,7,'violet',step=1);c.rect(x+2,y+1,3,2,'lavender')
def arm(c,ax,ay,bx,by):
    c.line(ax,ay,bx,by,'ink',6);c.line(ax+1,ay+1,bx+1,by+1,'purple',4);hand(c,bx,by)

def character(action,f):
    c=Canvas(64,64)
    wave=[0,0,1,1,2,1,1,0][f]
    dx=0;dy=0;head_y=0;eye='normal';look=0;arms='rest';prop=None;headphones=False
    coding='coding' in action or action in ['idle_keyboard_clean','random_sleep']
    vibe='vibe' in action
    if coding: head_y=1;arms='type';prop='laptop';eye='focused'
    if vibe or action=='music_loop': headphones=True;head_y=[0,1,2,1,0,-1,0,1][f];eye='happy';arms='type' if vibe else 'music'
    if action=='idle_blink' or action=='idle': eye='blink' if f==5 else 'normal'
    if action=='idle_look_left':look=-2 if 1<f<7 else -1;head_y=0
    if action=='idle_look_right':look=2 if 1<f<7 else 1
    if action=='idle_stretch':arms='up';dy=-wave;eye='happy'
    if action=='idle_yawn':eye='yawn';arms='mouth';head_y=wave
    if action=='idle_check_phone':prop='phone';arms='hold';look=2
    if action in ['idle_drink_coffee','random_coffee']:prop='coffee';arms='hold';eye='happy' if f>3 else 'normal'
    if action=='idle_fix_headphones':headphones=True;arms='headphones';eye='blink' if f==4 else 'normal'
    if action=='idle_keyboard_clean':arms='clean';eye='focused'
    if action=='idle_spin_chair':dx=[0,1,2,1,0,-1,-2,-1][f];eye='rear' if f in [3,4] else 'side' if f in [2,5] else 'happy';arms='spin'
    if action in ['idle_sleepy','tired']:head_y=wave+1;eye='tired';arms='mouth'
    if action in ['idle_watch_window','random_window']:eye='rear' if f in [2,3,4,5] else 'side';look=-2
    if action in ['idle_play_game','random_game']:prop='game';arms='hold';eye='focused'
    if action=='idle_read':prop='book';arms='hold';eye='focused'
    if action in ['idle_small_dance','dance_01']:dy=-wave;arms='music';head_y=-wave;headphones=True;eye='happy'
    if action in ['thinking','idle_thinking']:arms='chin';look=1;eye='focused'
    if action in ['idle_bug_hunt','random_bug']:prop='net';arms='net';look=2;dx=[0,0,1,2,2,1,0,0][f]
    if action=='idle_snack':prop='cookie';arms='mouth';eye='happy'
    if action=='dance_02':dx=[-3,-3,-1,1,3,3,1,-1][f];arms='step';eye='happy';headphones=True
    if action=='dance_03':arms='up';dy=-wave*2;eye='happy';headphones=True
    if action=='dance_04':arms='windmill';dx=[0,2,3,2,0,-2,-3,-2][f];eye='happy';headphones=True
    if action=='dance_05':arms='victory';dy=-wave*2;eye='happy';headphones=True
    if action in ['sad','very_sad','bored','afk']:head_y=2+wave//2;eye='sad';arms='lap'
    if action in ['happy','very_happy','success','celebrate','random_sunglasses']:eye='happy';arms='victory';dy=-wave*(2 if action in ['very_happy','celebrate'] else 1)
    if action in ['sleep','random_sleep']:eye='sleep';head_y=3;arms='lap';dy=3
    if action.startswith('error_'):
        eye='confused';arms='panic' if action=='error_panic' else 'chin';head_y=wave;dx=(-1 if f%2 else 1) if action=='error_panic' else 0
    if action.startswith('pet_'):eye='happy';head_y=wave if action!='pet_start' else -wave;arms='up' if action=='pet_happy' else 'rest'
    if action=='loading':arms='hold';prop='component';eye='focused'
    if action=='error_loading':arms='cable';eye='confused'
    if action=='no_workspace':arms='lap';prop='closed';eye='normal'
    if action in ['coding_start','vibe_coding_start'] and f<3:prop='closed';arms='hold'
    if action in ['coding_stop','vibe_coding_end'] and f>4:prop='closed';arms='lap';eye='normal'
    if action=='idle':head_y=wave//2
    # Two small motion phases prevent a pose from becoming a frozen sticker.
    # The body breathes while the head settles one frame later; feet stay in bounds.
    dy += 1 if f in [3,4] else 0
    head_y -= 1 if f==6 else 0
    if eye in ['normal','focused','side'] and f==5:eye='blink'

    c.rect(16+dx,58,35,2,'shadow');c.rect(20+dx,60,25,1,'shadow')
    # Swivel chair anchors the rotations and long sedentary poses.
    if action=='idle_spin_chair':
        c.box(18+dx,40,29,16,'purpleD');c.rect(30,53,3,6,'blue2');c.line(31,58,19,61,'ink',2);c.line(31,58,44,61,'ink',2)
    ox,oy=dx,dy
    c.rect(23+ox,51+oy,9,8,'ink');c.rect(35+ox,51+oy,9,8,'ink')
    c.rect(24+ox,53+oy,7,3,'lavender');c.rect(35+ox,53+oy,7,3,'violet');c.rect(23+ox,57+oy,9,2,'purpleD');c.rect(35+ox,57+oy,9,2,'purpleD')
    c.box(21+ox,36+oy,25,19,'purple');c.rect(24+ox,40+oy,18,2,'violet');c.rect(37+ox,43+oy,6,9,'purpleD')
    c.rect(26+ox,48+oy,10,3,'purpleD');c.rect(27+ox,48+oy,8,1,'violet');c.rect(29+ox,42+oy,1,5,'yellow');c.rect(33+ox,42+oy,1,5,'cream')
    left=(17+ox,44+oy);right=(43+ox,44+oy)
    if arms=='up':left=(11+ox,27+oy+wave);right=(48+ox,27+oy-wave)
    if arms=='victory':left=(14+ox,33+oy-wave);right=(47+ox,25+oy+wave)
    if arms=='music':left=(14+ox,40+oy-wave);right=(47+ox,38+oy+wave)
    if arms=='windmill':
        poses=[((12,32),(47,45)),((11,27),(48,40)),((17,22),(49,30)),((18,30),(46,24)),((17,42),(43,25)),((11,45),(48,33)),((11,39),(49,42)),((14,34),(48,44))]
        left,right=poses[f];left=(left[0]+ox,left[1]+oy);right=(right[0]+ox,right[1]+oy)
    if arms=='step':left=(13+ox,43+oy-wave);right=(46+ox,38+oy+wave)
    if arms=='mouth':right=(37+ox,35+oy+wave//2)
    if arms=='chin':right=(37+ox,36+oy);left=(21+ox,45+oy)
    if arms=='hold':left=(24+ox,43+oy);right=(42+ox,40+oy-wave)
    if arms=='type':left=(28+ox,46+oy-f%2);right=(43+ox,46+oy-(f+1)%2)
    if arms=='clean':left=(28+ox,47+oy);right=(37+f%4*2,44+oy)
    if arms=='lap':left=(25+ox,47+oy);right=(35+ox,47+oy)
    if arms=='net':right=(45+ox,36+oy-wave);left=(18+ox,44+oy)
    if arms=='panic':left=(11+ox,28+oy+wave);right=(48+ox,29+oy-wave)
    if arms=='headphones':left=(14+ox,27+oy+wave);right=(47+ox,27+oy-wave)
    if arms=='cable':left=(12+ox,43+oy);right=(48+ox,43+oy)
    if arms=='spin':left=(13+ox,43+oy);right=(48+ox,43+oy)
    arm(c,23+ox,40+oy,*left);arm(c,39+ox,40+oy,*right)

    # Chunky asymmetric hood, flat navy face, mint display eyes, orange antenna.
    hx,hy=17+ox,max(12,14+oy+head_y)
    c.rect(hx+15,hy-7,2,8,'lavender');c.box(hx+12,hy-12,8,7,'orange',step=1);c.rect(hx+14,hy-11,2,2,'yellow')
    c.box(hx,hy,33,27,'purple',step=3)
    c.rect(hx+5,hy+1,20,2,'violet');c.rect(hx+3,hy+4,3,16,'violet');c.rect(hx+27,hy+7,3,15,'purpleD')
    c.box(hx+5,hy+5,26,20,'lavender',step=2);c.box(hx+7,hy+7,23,16,'ink',step=2);c.rect(hx+10,hy+8,16,1,'navy')
    if eye=='rear':
        c.box(hx+4,hy+5,26,19,'purple');c.rect(hx+10,hy+7,12,1,'violet');c.rect(hx+15,hy+12,4,4,'purpleD');c.rect(hx+16,hy+13,2,2,'orange')
    else:
        ex=hx+11+look;ey=hy+13
        if eye in ['happy','sleep','blink','tired','sad','yawn']:
            for xx in [ex,ex+11]:
                if eye=='happy':c.line(xx,ey+2,xx+2,ey,'mint',2);c.line(xx+2,ey,xx+4,ey+2,'mint',2)
                elif eye=='sad':c.line(xx,ey+2,xx+4,ey+3,'teal',2);c.pixel(xx+(0 if xx==ex else 4),ey+1,'mint')
                elif eye=='tired':c.rect(xx,ey+3,5,2,'mint');c.rect(xx+1,ey+5,3,1,'teal')
                else:c.rect(xx,ey+3,5,2,'mint')
            if eye=='yawn':c.rect(hx+18,hy+19,3,3,'teal')
        elif eye=='confused':
            c.rect(ex,ey+2,5,3,'mint');c.rect(ex+11,ey,4,6,'mint');c.rect(ex+12,ey+1,2,3,'ink')
        elif eye=='focused':
            c.rect(ex,ey+1,4,5,'mint');c.rect(ex+11,ey+1,4,5,'mint');c.rect(ex,ey+1,1,1,'ink');c.rect(ex+14,ey+1,1,1,'ink')
        elif eye=='side':c.rect(ex+11,ey,4,6,'mint')
        else:
            c.rect(ex,ey,4,6,'mint');c.rect(ex+11,ey-1,4,6,'mint');c.pixel(ex,ey,'cream');c.pixel(ex+11,ey-1,'cream')
    c.box(hx-3,hy+10,7,12,'purpleD',step=1);c.rect(hx-1,hy+13,3,6,'orange');c.rect(hx+32,hy+12,2,8,'orangeD')
    if headphones:
        c.line(hx+2,hy+2,hx+8,hy-2,'ink',3);c.rect(hx+8,hy-3,16,3,'ink');c.line(hx+23,hy-2,hx+31,hy+3,'ink',3)
        c.rect(hx+8,hy-2,16,1,'violet');c.box(hx-5,hy+9,9,16,'lavender',step=2);c.rect(hx-3,hy+12,5,10,'purpleD');c.rect(hx-2,hy+15,3,4,'orange');c.box(hx+30,hy+11,6,12,'lavender',step=1)
    if action=='random_sunglasses':
        c.rect(hx+9,hy+12,18,6,'black');c.rect(hx+10,hy+13,6,3,'blue');c.rect(hx+20,hy+13,6,3,'blue');c.line(hx+11,hy+15,hx+14,hy+13,'cream');c.line(hx+21,hy+15,hx+24,hy+13,'cream')
    # Foreground props are custom pixel drawings and create distinct actions.
    if prop=='laptop':
        laptop(c,34,42,f)
        hand(c,28,47-(f%2)*(2 if 'fast' in action else 1));hand(c,39,47-((f+1)%2)*(2 if 'fast' in action else 1))
        if f in [2,3,6]:text(c,['{}','<>','++'][f%3],49,31-wave,'mint')
    if prop=='closed':laptop(c,33,43,f,True)
    if prop=='phone':c.box(44,35-wave,10,16,'ink',step=1);c.rect(46,37-wave,6,10,'teal');c.rect(47,39-wave,4,1,'mint');c.pixel(48,48-wave,'cream');hand(c,40,43)
    if prop=='coffee':
        yy=35-wave if f in [2,3,4,5] else 41;mug(c,43,yy);hand(c,39,yy+4);c.line(47,yy-3,48,yy-6-wave,'cream')
        if action=='random_coffee' and f>4:
            c.rect(51,53,3,2,'woodL');c.rect(47,56,11,2,'woodL');c.rect(53,54,2,3,'orangeD')
    if prop=='book':
        c.poly([(24,42),(34,43),(34,55),(24,52)],'ink');c.poly([(34,43),(47,41),(47,53),(34,55)],'ink');c.poly([(25,43),(33,45),(33,53),(25,51)],'cream');c.poly([(35,45),(46,42),(46,51),(35,53)],'yellow')
        for yy in [46,49]:c.line(27,yy,31,yy+1,'woodL');c.line(37,yy,44,yy-1,'orangeD')
        if f in [3,4]:c.line(34,43,40-f,41,'cream',2)
    if prop=='game':
        c.box(23,43,27,12,'lavender',step=2);c.rect(30,45,12,7,'ink');c.rect(33+f%3,48,3,2,'mint');c.rect(25,47,4,1,'purpleD');c.rect(26,46,1,3,'purpleD');c.pixel(45,46,'orange');c.pixel(46,49,'purple')
    if prop=='cookie':
        yy=35 if f in [2,3,4] else 40;c.box(40,yy,10,10,'orange',step=2);c.pixel(43,yy+3,'woodD');c.pixel(47,yy+6,'woodD');c.pixel(43,yy+7,'woodD')
        if f>3:c.rect(40,yy,4,4,'transparent')
    if prop=='net':
        nx=49+(1 if f<4 else -2);ny=24-wave;c.line(46,42,nx+5,ny+10,'woodL',2);c.box(nx-2,ny,12,12,'transparent','lavender',2)
        for i in [2,5,8]:c.line(nx-1+i,ny+2,nx-1+i,ny+9,'blue2')
        bug(c,49-f//2,51-(f%3),f)
    if prop=='component':
        c.box(27,42,24,13,'blue',step=1);c.rect(30,44,18,8,'greenD');c.box(35,45,7,6,'ink',step=1)
        for xx in range(31,48,3):c.pixel(xx,52,'yellow')
        c.line(46,40-wave,48,35-wave,'orange',2);star(c,51,34,'mint')
    if action=='error_loading':
        c.line(14,49,20,55,'orange',2);c.line(20,55,28,52,'orange',2);c.line(47,49,42,54,'blue2',2);c.line(42,54,35,51,'blue2',2);c.rect(27,50,4,4,'cream');c.rect(33,49,4,4,'cream');star(c,29,43,'yellow')
    if arms=='clean':c.line(37+f%4*2,44,46+f%4*2,43,'woodL',2);c.rect(45+f%4*2,42,5,4,'yellow')
    if vibe or action=='music_loop' or action.startswith('dance_'):
        note(c,3+(f%2)*2,18-wave*2,'orange');note(c,53,9+wave,'mint')
    if action in ['sleep','random_sleep','idle_sleepy','tired']:
        text(c,'Z',47,12-f%4,'lavender');text(c,'Z',54,5-f%3,'violet')
    if action in ['thinking','idle_thinking','error_confused']:text(c,'?',52,9-wave,'yellow')
    if action in ['error_notice','error_panic']:text(c,'!',6,12-wave,'red',2)
    if action in ['sad','very_sad','bored','afk']:
        c.rect(6,19-wave,9,3,'blue2');c.rect(8,17-wave,5,2,'blue2');c.pixel(9,24+wave,'teal')
        if action=='very_sad':c.rect(48,40+wave,2,3,'teal')
    if action in ['celebrate','very_happy','success']:
        for i in range(7):
            x=(i*17+f*2)%60;y=(i*11+f*3)%31;c.rect(x,y,2,2,['orange','mint','violet'][i%3])
    if action.startswith('pet_'):
        if action in ['pet_start','pet_loop']:
            c.rect(34-f%3,0,10,3,'cream');c.rect(30-f%3,3,12,3,'cream');c.rect(28-f%3,6,9,3,'cream');c.pixel(27-f%3,7,'orange')
        if f>1:heart(c,5,22-f,'red');heart(c,53,28-f,'orange')
    return c

def room_item(name):
    dimensions={'desk':(128,64),'chair':(32,48),'laptop':(32,32),'monitor':(48,48),'keyboard':(32,16),'lamp':(32,48),'plant':(32,48),'window_day':(80,48),'window_night':(80,48),'coffee':(16,16),'headphones':(32,32),'server':(32,48),'posters':(32,48),'rug':(96,32),'shelf':(48,64)}
    w,h=dimensions[name];c=Canvas(w,h)
    if name=='desk':
        c.poly([(7,10),(116,10),(125,22),(0,22)],'woodL');c.rect(0,22,126,7,'woodD');c.rect(3,22,120,3,'wood');c.rect(8,28,6,32,'ink');c.rect(10,28,3,29,'wood');c.rect(110,28,6,32,'ink');c.rect(111,28,3,29,'wood')
        for x,y,l in [(13,15,22),(70,13,25),(43,20,20)]:c.line(x,y,x+l,y,'wood')
        c.box(18,31,25,27,'woodD',step=1);c.rect(21,34,19,9,'wood');c.rect(21,46,19,9,'wood');c.rect(27,38,6,2,'orangeD');c.rect(27,49,6,2,'orangeD')
    if name=='chair':
        c.box(5,1,22,26,'purpleD',step=3);c.box(8,4,16,20,'purple',step=2);c.rect(10,6,10,2,'violet');c.box(1,25,30,10,'purple',step=2);c.rect(3,27,25,2,'violet');c.rect(14,35,4,9,'blue2');c.line(15,43,3,46,'ink',2);c.line(16,43,28,46,'ink',2);c.rect(1,45,5,3,'ink');c.rect(25,45,5,3,'ink')
    if name=='laptop':laptop(c,7,9)
    if name=='monitor':
        c.rect(20,32,7,9,'ink');c.rect(22,34,3,7,'blue2');c.box(12,40,24,4,'blue',step=1);c.box(1,1,46,34,'purpleD',step=2);c.rect(4,4,40,26,'ink');c.rect(5,5,38,2,'blue');c.rect(5,8,4,21,'navy')
        for i in range(6):
            y=10+i*3;c.rect(11+(i%3)*2,y,5+i%4,1,['violet','mint','orange'][i%3]);c.rect(20+(i%2)*3,y,8+i%5,1,'blue2')
        c.pixel(41,32,'mint')
    if name=='keyboard':
        c.poly([(4,3),(27,3),(31,12),(0,12)],'ink');c.rect(4,4,24,7,'blue2')
        for y in [5,8]:
            for x in range(5,28,4):c.rect(x,y,2,1,['mint','violet','orange'][x%3])
        c.rect(11,10,11,1,'lavender')
    if name=='lamp':
        c.box(7,41,22,5,'purpleD',step=1);c.line(21,41,20,17,'ink',3);c.line(20,18,12,11,'ink',3);c.line(22,40,21,18,'orangeD');c.poly([(6,3),(13,3),(21,15),(1,15)],'orangeD');c.poly([(7,3),(12,3),(17,12),(3,12)],'orange');c.rect(3,13,15,3,'yellow');c.rect(7,16,7,2,'cream')
    if name=='plant':
        c.box(9,33,16,14,'woodD',step=2);c.rect(11,35,12,9,'orangeD');c.rect(11,35,10,2,'orange');c.line(17,35,16,8,'greenD',2)
        leaves=[(16,12,5,4),(17,19,29,6),(16,25,2,15),(17,30,29,22),(17,18,11,3)]
        for x1,y1,x2,y2 in leaves:
            c.poly([(x1,y1),(x2-2,y2),(x2+2,y2),(x2+3,y2+6)],'greenD');c.line(x1,y1,x2,y2,'green',2);c.pixel(x2,y2,'mint')
    if name.startswith('window_'):
        day=name.endswith('day');c.box(1,1,78,46,'woodD',step=1);c.rect(4,4,72,37,'blue2' if day else 'navy')
        if day:
            c.rect(56,8,8,8,'yellow');c.rect(54,10,12,4,'yellow')
            for x,y in [(10,10),(42,21)]:c.rect(x,y,14,3,'lavender');c.rect(x+4,y-2,6,2,'lavender')
        else:
            c.rect(57,8,8,9,'yellow');c.rect(60,6,7,8,'navy')
            for x,y in [(9,8),(29,12),(46,8),(67,22),(39,25),(18,20)]:star(c,x,y,'cream')
        for x,y,hh in [(6,29,12),(18,26,15),(29,31,10),(40,24,17),(55,30,11),(66,26,15)]:
            c.rect(x,y,9,hh,'blue' if day else 'ink')
            for yy in range(y+3,39,5):c.rect(x+2,yy,2,2,'orangeD' if day else 'yellow');c.rect(x+6,yy,1,2,'blue2')
        c.rect(27,4,3,38,'wood');c.rect(52,4,3,38,'wood');c.rect(4,21,72,2,'woodD');c.rect(0,42,80,4,'woodL');c.rect(2,44,76,3,'woodD')
    if name=='coffee':mug(c,2,5);c.line(6,3,7,0,'cream')
    if name=='headphones':
        c.box(3,2,25,26,'transparent','purple',4);c.rect(7,7,17,21,'transparent');c.box(1,13,9,16,'lavender',step=2);c.box(22,13,9,16,'lavender',step=2);c.rect(3,17,5,8,'orange');c.rect(24,17,5,8,'orange')
    if name=='server':
        c.poly([(4,3),(25,0),(30,5),(30,45),(25,48),(4,46)],'ink');c.rect(5,5,20,38,'navy');c.rect(26,6,3,36,'purpleD');c.rect(7,7,16,5,'blue');c.rect(8,8,10,2,'purpleD');
        for y in [16,25,34]:
            c.box(7,y,16,7,'purpleD',step=1);c.rect(9,y+2,8,1,'mint');c.rect(9,y+4,5,1,'teal');c.rect(20,y+2,2,2,'orange')
        c.pixel(20,44,'mint')
    if name=='posters':
        c.box(1,1,28,33,'lavender',step=1);c.rect(4,4,22,26,'purpleD');c.poly([(7,24),(7,12),(11,16),(16,10),(20,16),(24,13),(24,26)],'ink');c.rect(11,19,2,3,'mint');c.rect(19,19,2,3,'mint');c.rect(4,35,23,10,'orangeD');text(c,'</>',10,38,'yellow')
    if name=='rug':
        c.poly([(11,1),(84,1),(95,29),(0,29)],'purpleD');c.poly([(13,3),(82,3),(91,27),(4,27)],'violet');c.poly([(15,5),(80,5),(87,24),(8,24)],'purpleD')
        for x in range(14,82,8):
            for y in range(8,23,6):c.rect(x,y,2,2,'purple');c.pixel(x+3,y+2,'lavender')
        c.line(15,6,80,6,'lavender');c.line(9,24,88,24,'lavender')
        for x in range(4,93,4):c.rect(x,29,2,2,'woodL')
    if name=='shelf':
        c.rect(3,1,4,61,'woodD');c.rect(40,1,4,61,'woodD')
        for y in [3,25,47,60]:c.rect(3,y,41,3,'wood');c.rect(5,y,39,1,'woodL')
        for x,h,col in [(9,15,'orangeD'),(15,17,'purple'),(21,13,'blue'),(27,16,'violet')]:c.rect(x,25-h,4,h,col);c.rect(x,26-h,4,1,'cream')
        c.box(12,35,19,11,'lavender',step=1);c.rect(19,37,6,2,'purpleD');c.rect(10,52,24,7,'navy');c.rect(10,52,24,2,'orangeD')
        c.poly([(34,18),(32,10),(38,12),(42,7),(42,16)],'green');c.rect(34,19,6,6,'orange')
    return c

def scene(theme, items):
    c=Canvas(192,160,'wall')
    wall={'default':'wall','night':'shadow','cyber':'navy','forest':'greenD','space':'black','retro_pc':'woodD'}[theme]
    c.rect(0,0,192,118,wall);c.rect(0,0,192,4,'ink');c.rect(0,4,5,114,'ink');c.rect(187,4,5,114,'ink')
    for x in range(8,188,18):c.rect(x,5,1,111,'wall2' if theme not in ['forest','space'] else wall)
    c.rect(0,117,192,43,'woodD');c.rect(0,116,192,3,'ink');c.rect(1,119,190,2,'woodL')
    for y in range(123,160,9):
        c.rect(1,y,190,1,'wood');c.rect(1,y+1,190,1,'shadow')
        for x in range((y*7)%39,191,39):c.rect(x,y+1,1,8,'ink');c.rect(x+4,y+4,17,1,'wood')
    c.blit(items['rug'],48,128)
    c.blit(items['window_night' if theme in ['night','cyber','space'] else 'window_day'],53,18)
    if theme=='forest':
        c.rect(57,22,70,36,'teal')
        for x,y in [(61,33),(73,29),(86,31),(103,26),(119,34)]:
            c.rect(x,y,3,28,'woodD');c.poly([(x+1,y-8),(x-9,y+12),(x+12,y+12)],'greenD');c.poly([(x+1,y-7),(x-5,y+5),(x+8,y+5)],'green')
        c.rect(80,22,3,37,'wood');c.rect(105,22,3,37,'wood');c.rect(57,40,70,2,'woodD')
    if theme=='space':
        c.rect(57,22,70,36,'ink')
        for i in range(16):star(c,59+(i*29)%64,24+(i*13)%29,'blue2' if i%3 else 'cream')
        c.box(88,30,20,16,'purple',step=4);c.line(82,46,114,32,'orange',2);c.rect(91,32,7,2,'violet');c.rect(80,22,3,37,'blue');c.rect(105,22,3,37,'blue')
    if theme=='cyber':
        c.rect(8,7,175,2,'purple');c.rect(7,7,2,110,'teal');c.rect(183,7,2,110,'purple')
        for i in range(16):c.rect(60+(i*17)%67,25+(i*7)%31,1,4,'teal')
    c.blit(items['shelf'],6,30);c.blit(items['posters'],151,17)
    c.rect(138,18,10,11,'ink');c.rect(140,20,6,7,'cream');c.rect(142,20,1,4,'orangeD');c.rect(142,23,3,1,'orangeD')
    # Desk is rear layer. The mascot covers the center; hardware remains visible either side.
    c.blit(items['desk'],28,89)
    c.blit(items['monitor'],34,65)
    c.blit(items['keyboard'],39,102)
    c.blit(items['lamp'],125,63)
    c.blit(items['plant'],153,75)
    c.blit(items['server'],155,112)
    c.blit(items['coffee'],127,95)
    c.blit(items['chair'],78,100)
    c.rect(71,97,7,3,'purpleD');c.rect(72,89,5,8,'woodL');c.line(73,89,71,83,'yellow');c.line(75,89,76,82,'mint')
    # Cozy wall cables, loose books and a tiny desk robot.
    c.line(48,112,52,121,'ink');c.line(52,121,72,121,'ink');c.line(72,121,79,115,'ink')
    c.rect(15,124,20,5,'purple');c.rect(17,122,20,3,'orangeD');c.rect(17,121,20,1,'yellow')
    c.box(142,135,10,9,'yellow',step=2);c.rect(144,138,1,2,'ink');c.rect(149,138,1,2,'ink');c.rect(143,132,2,4,'orange');c.rect(149,132,2,4,'orange')
    if theme=='retro_pc':
        c.box(36,65,42,35,'cream',step=2);c.rect(41,70,30,21,'greenD');text(c,'C:/',45,76,'mint');c.rect(45,86,12,1,'green');c.rect(65,94,5,2,'orangeD');c.rect(41,99,32,5,'cream');c.rect(46,101,18,1,'woodL')
    if theme=='night':
        for x,y in [(8,15),(175,65),(15,108),(144,6)]:c.pixel(x,y,'blue2')
    if theme=='forest':
        for x,y in [(10,8),(16,12),(29,6),(156,7),(174,11),(181,6)]:c.line(x,y,x+5,y+9,'greenD',2);c.rect(x+1,y+2,4,3,'green')
    # Sparse deliberate pixel texture, no gradients or transparency tricks.
    for x,y in [(11,112),(182,91),(140,52),(48,10),(162,65),(58,11)]:c.pixel(x,y,'blue2')
    return c

def icon(name):
    c=Canvas(16,16)
    if name in ['heart','pet']:heart(c,1,2,'red',2)
    elif name=='music':note(c,3,2,'violet');c.rect(7,2,6,2,'orange')
    elif name=='energy':c.poly([(8,0),(3,8),(7,8),(5,16),(13,6),(9,6),(12,0)],'yellow')
    elif name=='sleep':text(c,'Z',1,1,'lavender',2);text(c,'Z',10,9,'violet')
    elif name=='dance':
        c.rect(7,1,4,4,'orange');c.line(8,6,8,10,'violet',2);c.line(8,7,2,4,'mint',2);c.line(8,7,14,3,'mint',2);c.line(8,10,3,15,'purple',2);c.line(9,10,13,15,'purple',2)
    elif name=='coffee':mug(c,1,5);c.line(5,3,6,0,'cream')
    elif name=='settings':
        c.box(3,3,10,10,'blue2',step=1);c.rect(6,0,4,16,'blue2');c.rect(0,6,16,4,'blue2');c.box(5,5,6,6,'ink',step=1);c.rect(7,7,2,2,'violet')
    elif name=='stats':
        for x,h,col in [(1,5,'violet'),(6,9,'mint'),(11,14,'orange')]:c.rect(x,15-h,4,h,col)
    elif name=='level':
        c.poly([(8,0),(10,5),(16,5),(11,9),(13,15),(8,12),(3,15),(5,9),(0,5),(6,5)],'yellow');c.rect(7,5,2,4,'orange')
    elif name in ['error','warning']:
        c.poly([(7,0),(15,14),(0,14)],'red' if name=='error' else 'yellow');c.rect(7,5,2,5,'ink');c.rect(7,11,2,2,'ink')
    elif name=='success':c.line(1,8,6,13,'mint',3);c.line(6,13,14,2,'mint',3)
    elif name=='terminal':c.box(0,1,16,14,'navy',step=1);text(c,'>',2,5,'mint');c.rect(8,11,5,1,'violet')
    elif name=='play':c.poly([(3,1),(14,8),(3,15)],'mint');c.line(4,3,10,8,'cream')
    elif name=='room':c.poly([(0,7),(8,0),(16,7)],'orange');c.rect(3,7,10,9,'purple');c.rect(6,10,4,6,'ink')
    elif name=='code':text(c,'<>',1,5,'mint',2)
    else:
        labels={'c':'C','cpp':'C+','csharp':'C#','javascript':'JS','typescript':'TS','python':'PY','java':'JV','kotlin':'KT','rust':'RS','html':'<>','css':'CS','scss':'SC','go':'GO','php':'PH','ruby':'RB','swift':'SW','dart':'DT','lua':'LU','vue':'VU','javascriptreact':'JX','typescriptreact':'TX','sql':'DB','shellscript':'SH','powershell':'PS','json':'{}','yaml':'YM','markdown':'MD','plaintext':'TX'}
        label=labels.get(name,name[:2].upper());col={'javascript':'yellow','typescript':'blue2','python':'yellow','java':'orange','rust':'orangeD','vue':'green','ruby':'red','html':'orange','css':'violet','csharp':'green','kotlin':'purple','go':'mint','swift':'orange'}.get(name,'lavender')
        c.box(0,0,16,16,'navy',step=2);c.rect(2,2,12,2,col);text(c,label,4 if len(label)==1 else 1,7,col)
    return c

def effect(name,f):
    c=Canvas(32,32)
    if name=='hearts':
        heart(c,3,22-f*2,'red');heart(c,19,28-f*3,'orange')
    elif name=='notes':note(c,3,21-f*2,'orange');note(c,21,25-f*3,'mint')
    elif name=='confetti':
        for i in range(12):c.rect((i*13+f)%32,(i*7+f*3)%32,2,2,['orange','mint','violet','yellow'][i%4])
    elif name=='sparkles':
        for i in range(4):star(c,(i*11+4)%28,(i*7+f*2)%28,['mint','orange'][i%2])
    elif name=='bug':bug(c,4+f*3,12+(f%3),f)
    elif name=='rain':
        for i in range(6):c.line(i*5,((i*7)+f*4)%32,i*5-2,((i*7)+f*4)%32+5,'blue2')
    return c

def cosmetic(name):
    """Sparse upgrade overlays; draw after the room, before the character."""
    dims={'coffee_mug':(16,16),'poster':(32,48),'headphones':(16,16),'new_desk':(128,16),'rgb_pc':(32,48),'hoodie':(16,32),'rare_room':(192,160)}
    c=Canvas(*dims[name])
    if name=='coffee_mug':
        c.rect(1,5,13,11,'woodL');c.box(2,4,10,12,'orange',step=1);c.rect(2,4,10,2,'cream');c.rect(3,7,8,4,'orangeD');c.rect(6,8,2,2,'yellow');c.rect(11,7,4,6,'yellow');c.rect(12,8,2,3,'woodL');c.line(6,2,7,0,'cream')
    if name=='poster':
        c=room_item('posters');c.rect(4,4,22,26,'navy');c.poly([(14,6),(17,12),(24,12),(19,17),(21,24),(14,20),(8,24),(10,17),(4,12),(12,12)],'yellow');c.rect(12,11,4,5,'orange');c.rect(8,27,14,1,'mint')
    if name=='headphones':
        c.box(2,1,12,13,'transparent','violet',2);c.rect(4,4,8,11,'transparent');c.box(0,7,6,8,'orange',step=1);c.box(10,7,6,8,'orange',step=1);c.rect(2,9,2,4,'purpleD');c.rect(12,9,2,4,'purpleD')
    if name=='new_desk':
        c.rect(0,4,126,4,'woodL');c.rect(1,4,124,1,'yellow');c.rect(3,6,119,1,'orange');
        for x in [7,115]:c.rect(x,7,5,9,'woodD');c.rect(x+1,7,2,9,'orangeD')
        c.rect(12,4,2,4,'yellow');c.rect(110,4,2,4,'yellow')
    if name=='rgb_pc':
        c=room_item('server');c.rect(5,5,1,37,'mint');c.rect(6,5,19,1,'violet');c.rect(24,6,1,38,'purple');
        for y in [16,25,34]:c.rect(9,y+2,8,1,'mint');c.rect(9,y+4,8,1,'violet');c.rect(20,y+2,2,2,'orange')
        c.rect(6,44,19,1,'orange')
    if name=='hoodie':
        c.line(8,0,8,5,'cream');c.line(8,4,2,8,'woodL');c.line(8,4,14,8,'woodL');c.rect(2,8,13,1,'woodL');c.box(4,8,9,8,'violet',step=2);c.rect(6,10,5,3,'purpleD');c.poly([(4,14),(1,18),(1,25),(4,25),(4,30),(13,30),(13,25),(16,25),(16,18),(12,14)],'purpleD');c.rect(5,15,7,13,'purple');c.rect(6,16,1,5,'yellow');c.rect(10,16,1,5,'cream');c.rect(6,24,5,2,'mint');c.rect(5,29,8,1,'violet')
    if name=='rare_room':
        c.line(10,10,180,10,'violet');
        for i,x in enumerate(range(16,183,18)):
            c.poly([(x,11),(x+8,11),(x+4,17)],['mint','orange','violet'][i%3])
        for x,y in [(45,39),(141,81),(18,19),(146,32),(178,76)]:star(c,x,y,'yellow')
    return c

def main():
    manifest={'character':{},'room':{},'icons':{},'effects':{}}
    specs=[]
    idle=['idle','idle_blink','idle_look_left','idle_look_right','idle_stretch','idle_yawn','idle_check_phone','idle_drink_coffee','idle_fix_headphones','idle_keyboard_clean','idle_spin_chair','idle_sleepy','idle_watch_window','idle_play_game','idle_read','idle_small_dance','idle_thinking','idle_bug_hunt','idle_snack']
    for name in idle:specs.append((name,'idle',6,name in ['idle','idle_blink'],None,0,'COMMON' if name in idle[:6] else 'UNCOMMON' if name not in ['idle_spin_chair','idle_bug_hunt'] else 'RARE'))
    specs += [(n,'coding',10 if 'fast' in n else 8,n in ['coding_loop','coding_fast'],'coding_loop' if n=='coding_start' else 'idle' if n=='coding_stop' else None,20,None) for n in ['coding_start','coding_loop','coding_fast','coding_stop']]
    specs += [(n,'vibe',10 if 'fast' in n else 8,n in ['vibe_coding_loop','vibe_coding_fast'],'vibe_coding_loop' if n=='vibe_coding_start' else 'idle' if n=='vibe_coding_end' else None,20,None) for n in ['vibe_coding_start','vibe_coding_loop','vibe_coding_fast','vibe_coding_end']]
    specs.append(('music_loop','music',8,True,None,10,None))
    specs += [(f'dance_0{i}','dance',8,True,None,40,'RARE' if i>3 else 'COMMON') for i in range(1,6)]
    for name,folder in [('sad','sad'),('very_sad','sad'),('happy','happy'),('very_happy','happy'),('sleep','sleep'),('thinking','idle'),('error_notice','error'),('error_confused','error'),('error_panic','error'),('success','success'),('celebrate','success'),('tired','sleep'),('bored','idle'),('afk','idle'),('loading','interactions'),('error_loading','interactions'),('no_workspace','interactions')]:
        loop=name in ['sad','very_sad','sleep','thinking','tired','bored','afk','loading','error_loading','no_workspace']
        specs.append((name,folder,6 if loop else 8,loop,None,50 if folder in ['error','success'] else 10,'LEGENDARY' if name=='celebrate' else None))
    specs += [(name,'interactions',8,False,nxt,40,None) for name,nxt in [('pet_start','pet_loop'),('pet_loop','pet_happy'),('pet_happy','pet_end'),('pet_end','idle')]]
    specs += [(f'random_{name}','interactions',8,False,None,30,'LEGENDARY' if name=='sunglasses' else 'RARE') for name in ['bug','coffee','game','sleep','window','sunglasses']]
    filenames={'idle':'codeboy_idle','coding_loop':'codeboy_coding','coding_fast':'codeboy_fast_coding','vibe_coding_loop':'codeboy_vibe','music_loop':'codeboy_music','dance_01':'codeboy_dance01','dance_02':'codeboy_dance02','dance_03':'codeboy_dance03','error_notice':'codeboy_error','pet_loop':'codeboy_pet'}
    for name,folder,fps,loop,nxt,priority,rarity in specs:
        filename=filenames.get(name,'codeboy_'+name)
        src=f'assets/character/{folder}/{filename}.png'
        sheet=Canvas(512,64)
        for f in range(8):sheet.blit(character(name,f),f*64,0)
        sheet.save(ROOT/src)
        meta={'name':name,'src':src,'frameWidth':64,'frameHeight':64,'frames':8,'fps':fps,'loop':loop,'priority':priority}
        if nxt:meta['next']=nxt
        if rarity:meta['rarity']=rarity
        manifest['character'][name]=meta
        (ROOT/src).with_suffix('.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf8')
    items={name:room_item(name) for name in ['desk','chair','laptop','monitor','keyboard','lamp','plant','window_day','window_night','coffee','headphones','server','posters','rug','shelf']}
    for name,c in items.items():
        src=f'assets/room/{name}.png';c.save(ROOT/src);manifest['room'][name]={'src':src,'width':c.w,'height':c.h}
    for theme in ['default','night','cyber','forest','space','retro_pc']:
        c=scene(theme,items);src=f'assets/room/theme_{theme}.png';c.save(ROOT/src);manifest['room']['theme_'+theme]={'src':src,'width':c.w,'height':c.h}
    for name in ['coffee_mug','poster','headphones','new_desk','rgb_pc','hoodie','rare_room']:
        c=cosmetic(name);src=f'assets/room/cosmetic_{name}.png';c.save(ROOT/src);manifest['room']['cosmetic_'+name]={'src':src,'width':c.w,'height':c.h}
    icons=['code','music','dance','sleep','heart','energy','settings','stats','level','error','warning','success','coffee','terminal','pet','play','room','c','cpp','csharp','javascript','typescript','python','java','kotlin','rust','html','css','scss','go','php','ruby','swift','dart','lua','vue','javascriptreact','typescriptreact','sql','shellscript','powershell','json','yaml','markdown','plaintext']
    for name in icons:
        c=icon(name);src=f'assets/icons/{name}.png';c.save(ROOT/src);manifest['icons'][name]={'src':src,'width':16,'height':16}
    for name in ['hearts','notes','confetti','bug','sparkles','rain']:
        src=f'assets/effects/{name}.png';c=Canvas(256,32)
        for f in range(8):c.blit(effect(name,f),f*32,0)
        c.save(ROOT/src);meta={'name':name,'src':src,'frameWidth':32,'frameHeight':32,'frames':8,'fps':8,'loop':True};manifest['effects'][name]=meta;(ROOT/src).with_suffix('.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf8')
    (ASSETS/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
    master_prompt='Original Code Boy technological creature: large navy display face, mint square eyes, orange antenna, oversized purple hoodie, violet highlights, compact body. Original 16-bit pixel art, front three-quarter view, top-left pixel highlights, dark 1-2 pixel outlines, limited flat palette, transparent background, no gradients, no antialiasing, no trademarks. Keep identical proportions and silhouette in every frame.'
    prompts={'provenance':{'concept':'assets/reference/codeboy-concept.png','conceptMethod':'OpenAI built-in image generation; original generated reference retained unchanged.','runtimeMethod':'Original native-resolution pixel drawing source in scripts/generate-assets.py; no generative output is cropped, resized or consumed by the game renderer.'},'masterCharacter':master_prompt,'character':{},'room':{},'icons':{}}
    for name,meta in manifest['character'].items():
        prompts['character'][name]=f'{master_prompt} Sprite sheet for {name.replace("_", " ")}. Eight horizontal aligned 64x64 cells, 512x64 total. Animate the action clearly with expressive eyes, hands and props. Keep all parts within each cell. {meta["fps"]} fps, '+('seamless loop.' if meta['loop'] else 'one-shot gesture returning to a neutral pose.')
    for name,meta in manifest['room'].items():
        prompts['room'][name]=f'Original Code Boy pixel-art {name.replace("_", " ")}, {meta["width"]}x{meta["height"]} native pixels. Cozy retro programmer workstation, limited navy-purple-mint-orange palette, crisp outlines, no gradients or antialiasing. '+('Complete room, floor at y118, window above desk, center character anchor x64 y64 in a 192x160 scene, no character baked into the background.' if name.startswith('theme_') else 'Separate transparent prop, front three-quarter view, top-left light. Match all Code Boy room assets.')
    for name in manifest['icons']:prompts['icons'][name]=f'Original {name} pixel icon, transparent 16x16, use the Code Boy palette, clear hard-edged silhouette, no smoothing. Language icons use custom letter tiles, not copied brand logos.'
    (ASSETS/'generation-prompts.json').write_text(json.dumps(prompts,indent=2)+'\n',encoding='utf8')
    # Marketplace icon and vector monochrome Activity Bar silhouette.
    emblem=Canvas(64,64,'ink');emblem.blit(character('happy',0));large=Canvas(128,128);large.blit(emblem,0,0,2);large.save(ASSETS/'icons/extension.png')
    (ASSETS/'icons/activity.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M11 0h3v3h-1v2h5v2h3v3h2v8h-2v2h-4v3H7v-3H3v-2H1v-8h2V7h3V5h5V3h-1V1h1Zm-4 8v1H5v8h2v1h12V8Zm2 3h3v4H9Zm6 0h3v4h-3ZM9 20v1h6v-1Z"/></svg>\n',encoding='utf8')
    # Useful native-resolution QA sheets, enlarged by an exact integer factor.
    overview=Canvas(192*3,160*2)
    for i,theme in enumerate(['default','night','cyber','forest','space','retro_pc']):
        room=scene(theme,items);room.blit(character('vibe_coding_loop' if i%2 else 'idle',3),64,64);overview.blit(room,(i%3)*192,(i//3)*160)
    view=Canvas(overview.w*2,overview.h*2);view.blit(overview,0,0,2);view.save(ASSETS/'reference/room-overview.png')
    catalog=Canvas(64*8,80*math.ceil(len(specs)/8),'ink')
    for i,(name,*_) in enumerate(specs):
        x=(i%8)*64;y=(i//8)*80;catalog.blit(character(name,3),x,y);text(catalog,name.replace('idle_','').replace('coding','code')[:15],x+1,y+68,'blue2')
    big=Canvas(catalog.w*2,catalog.h*2);big.blit(catalog,0,0,2);big.save(ASSETS/'reference/sprite-overview.png')
    print(f'Created {len(specs)} character sheets, {len(manifest["room"])} room assets, {len(icons)} icons, 6 effect sheets. All runtime PNGs use opaque or transparent pixels only.')

if __name__=='__main__':main()
