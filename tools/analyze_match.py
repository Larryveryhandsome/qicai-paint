"""
比對品質與樣本數分析(用真正的 CIEDE2000,不是 CIE76):
1. 先用 Sharma 標準測試對驗證 CIEDE2000 實作正確性,並對照 script.js 版本。
2. 跨品牌油漆配對:你要 A 牌的色,但只買得到其他牌 — 能配多近?(最關鍵)
3. 真實設計調色板覆蓋:用 PANTONE 當「設計師會指定的顏色」測能否在油漆找到近似。
4. 常見牆面色覆蓋。
"""
import sys, json, math
from pathlib import Path
import random

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    import numpy as np
except Exception:
    print("需要 numpy")
    sys.exit(1)

ROOT = Path(__file__).parent.parent
colors = json.loads((ROOT / "colors.json").read_text(encoding="utf-8"))["colors"]
PAINT = {"rainbow", "nippon", "dulux", "dulux_matte"}

# ---------- 正確 CIEDE2000 (scalar, 用於驗證) ----------
def cd2000_correct(lab1, lab2):
    L1,a1,b1 = lab1; L2,a2,b2 = lab2
    C1=math.hypot(a1,b1); C2=math.hypot(a2,b2); Cb=(C1+C2)/2
    G=0.5*(1-math.sqrt(Cb**7/(Cb**7+25**7)))
    a1p=a1*(1+G); a2p=a2*(1+G)
    C1p=math.hypot(a1p,b1); C2p=math.hypot(a2p,b2); Cbp=(C1p+C2p)/2
    h1p=math.degrees(math.atan2(b1,a1p))%360
    h2p=math.degrees(math.atan2(b2,a2p))%360
    dLp=L2-L1; dCp=C2p-C1p
    prod=C1p*C2p
    if prod==0: dhp=0.0
    else:
        dh=h2p-h1p
        if dh>180: dh-=360
        elif dh<-180: dh+=360
        dhp=dh
    dHp=2*math.sqrt(prod)*math.sin(math.radians(dhp)/2)
    if prod==0: Hp=h1p+h2p
    elif abs(h1p-h2p)<=180: Hp=(h1p+h2p)/2
    else: Hp=((h1p+h2p+360)/2) if (h1p+h2p)<360 else ((h1p+h2p-360)/2)
    T=1-0.17*math.cos(math.radians(Hp-30))+0.24*math.cos(math.radians(2*Hp))+0.32*math.cos(math.radians(3*Hp+6))-0.20*math.cos(math.radians(4*Hp-63))
    Lbar=(L1+L2)/2
    SL=1+(0.015*(Lbar-50)**2)/math.sqrt(20+(Lbar-50)**2)
    SC=1+0.045*Cbp; SH=1+0.015*Cbp*T
    dth=30*math.exp(-(((Hp-275)/25)**2))
    RC=2*math.sqrt(Cbp**7/(Cbp**7+25**7))
    RT=-RC*math.sin(math.radians(2*dth))
    return math.sqrt((dLp/SL)**2+(dCp/SC)**2+(dHp/SH)**2+RT*(dCp/SC)*(dHp/SH))

# ---------- script.js 目前的版本 (照抄,含可疑處) ----------
def cd2000_js(lab1, lab2):
    L1,a1,b1=lab1; L2,a2,b2=lab2
    C1=math.sqrt(a1*a1+b1*b1); C2=math.sqrt(a2*a2+b2*b2); Cb=(C1+C2)/2
    G=0.5*(1-math.sqrt(Cb**7/(Cb**7+25**7)))
    a1p=a1*(1+G); a2p=a2*(1+G)
    C1p=math.sqrt(a1p*a1p+b1*b1); C2p=math.sqrt(a2p*a2p+b2*b2); Cbp=(C1p+C2p)/2
    h1p=math.atan2(b1,a1p)
    if h1p<0: h1p+=2*math.pi
    h2p=math.atan2(b2,a2p)
    if h2p<0: h2p+=2*math.pi
    dLp=L2-L1; dCp=C2p-C1p
    dhp=h2p-h1p
    if dhp>math.pi: dhp-=2*math.pi
    if dhp<-math.pi: dhp+=2*math.pi
    dHp=2*math.sqrt(C1p*C2p)*math.sin(dhp/2)
    Hp=(h1p+h2p)/2
    if abs(h1p-h2p)>math.pi: Hp+=math.pi
    T=1-0.17*math.cos(Hp-math.pi/6)+0.24*math.cos(2*Hp)+0.32*math.cos(3*Hp+math.pi/30)-0.2*math.cos(4*Hp-math.pi/20)
    SL=1+(0.015*(L1+L2-50)**2)/math.sqrt(20+(L1+L2-50)**2)
    SC=1+0.045*Cbp; SH=1+0.015*Cbp*T
    RT=-2*math.sqrt(Cbp**7/(Cbp**7+25**7))*math.sin(math.pi/3*math.exp(-(((Hp*180/math.pi-275)/25)**2)))
    return math.sqrt((dLp/SL)**2+(dCp/SC)**2+(dHp/SH)**2+RT*(dCp/SC)*(dHp/SH))

print("="*64)
print("〇、驗證 CIEDE2000 實作(Sharma 2005 標準測試對)")
print("="*64)
sharma=[
 ((50,2.6772,-79.7751),(50,0,-82.7485),2.0425),
 ((50,3.1571,-77.2803),(50,0,-82.7485),2.8615),
 ((50,2.8361,-74.0200),(50,0,-82.7485),3.4412),
 ((50,-1.3802,-84.2814),(50,0,-82.7485),1.0000),
 ((50,2.5,0),(50,0,-2.5),7.2195),
 ((60.2574,-34.0099,36.2677),(60.4626,-34.1751,39.4387),1.2644),
 ((63.0109,-31.0961,-5.8663),(62.8187,-29.7946,-4.0864),1.2630),
 ((35.0831,-44.1164,3.7933),(35.0232,-40.0716,1.5901),1.8731),
 ((22.7233,20.0904,-46.6940),(23.0331,14.9730,-42.5619),2.0373),
]
print(f"  {'期望':>8} {'正解':>8} {'JS版':>8}   差異(JS-期望)")
maxerr_c=maxerr_j=0
for l1,l2,exp in sharma:
    c=cd2000_correct(l1,l2); j=cd2000_js(l1,l2)
    maxerr_c=max(maxerr_c,abs(c-exp)); maxerr_j=max(maxerr_j,abs(j-exp))
    print(f"  {exp:8.4f} {c:8.4f} {j:8.4f}   {j-exp:+.3f}")
print(f"\n  正解最大誤差={maxerr_c:.4f}(應≈0)   JS版最大誤差={maxerr_j:.4f}")
print("  → JS 版若誤差大,代表 script.js 的 ciede2000 有 bug")

# ---------- numpy 向量化正確 CIEDE2000 ----------
def cd2000_vec(lab1, P):
    L1,a1,b1=lab1
    L2=P[:,0]; a2=P[:,1]; b2=P[:,2]
    C1=math.hypot(a1,b1); C2=np.hypot(a2,b2); Cb=(C1+C2)/2
    G=0.5*(1-np.sqrt(Cb**7/(Cb**7+25.0**7)))
    a1p=a1*(1+G); a2p=a2*(1+G)
    C1p=np.hypot(a1p,b1); C2p=np.hypot(a2p,b2); Cbp=(C1p+C2p)/2
    h1p=np.degrees(np.arctan2(b1,a1p))%360
    h2p=np.degrees(np.arctan2(b2,a2p))%360
    dLp=L2-L1; dCp=C2p-C1p
    prod=C1p*C2p
    dh=h2p-h1p
    dh=np.where(dh>180,dh-360,dh); dh=np.where(dh<-180,dh+360,dh)
    dh=np.where(prod==0,0.0,dh)
    dHp=2*np.sqrt(np.maximum(prod,0))*np.sin(np.radians(dh)/2)
    hsum=h1p+h2p
    Hp=np.where(np.abs(h1p-h2p)<=180,hsum/2,np.where(hsum<360,(hsum+360)/2,(hsum-360)/2))
    Hp=np.where(prod==0,hsum,Hp)
    T=1-0.17*np.cos(np.radians(Hp-30))+0.24*np.cos(np.radians(2*Hp))+0.32*np.cos(np.radians(3*Hp+6))-0.20*np.cos(np.radians(4*Hp-63))
    Lbar=(L1+L2)/2
    SL=1+(0.015*(Lbar-50)**2)/np.sqrt(20+(Lbar-50)**2)
    SC=1+0.045*Cbp; SH=1+0.015*Cbp*T
    dth=30*np.exp(-(((Hp-275)/25)**2))
    RC=2*np.sqrt(Cbp**7/(Cbp**7+25.0**7))
    RT=-RC*np.sin(np.radians(2*dth))
    return np.sqrt((dLp/SL)**2+(dCp/SC)**2+(dHp/SH)**2+RT*(dCp/SC)*(dHp/SH))

def labs_of(ids):
    return np.array([c["lab"] for c in colors if c["brand_id"] in ids], dtype=float)

def stats(dists):
    d=np.sort(dists); n=len(d)
    return dict(median=float(np.median(d)), p90=float(d[int(n*0.9)]),
               worst=float(d[-1]),
               lt2=int((d<2).sum()*100/n), lt3=int((d<3).sum()*100/n),
               lt5=int((d<5).sum()*100/n), lt10=int((d<10).sum()*100/n))

random.seed(42)
def sample(lst, k):
    return lst if len(lst)<=k else random.sample(lst, k)

print("\n"+"="*64)
print("一、跨品牌油漆配對(最關鍵):要 A 牌色,只買得到其他油漆牌")
print("="*64)
print("方法:取 A 牌每個色,在『其他油漆牌』找最近鄰 CIEDE2000\n")
paint_by_brand={b:[c for c in colors if c["brand_id"]==b] for b in PAINT}
all_cross=[]
for A in ["rainbow","nippon","dulux","dulux_matte"]:
    others_ids=PAINT-{A}
    P=labs_of(others_ids)
    qs=sample(paint_by_brand[A], 800)
    ds=np.array([cd2000_vec(q["lab"],P).min() for q in qs])
    all_cross.append(ds)
    s=stats(ds)
    print(f"  要【{A}】→ 其他油漆牌(池{len(P)})  取樣{len(qs)}")
    print(f"     ΔE 中位={s['median']:.1f} 90分位={s['p90']:.1f} 最差={s['worst']:.1f} | <2:{s['lt2']}% <3:{s['lt3']}% <5:{s['lt5']}% <10:{s['lt10']}%")
comb=np.concatenate(all_cross); s=stats(comb)
print(f"\n  【整體跨油漆牌】ΔE 中位={s['median']:.1f} | <2:{s['lt2']}% <3:{s['lt3']}% <5:{s['lt5']}% <10:{s['lt10']}%")

print("\n"+"="*64)
print("二、設計調色板覆蓋:用 PANTONE 當『設計師會指定的色』找最近油漆")
print("="*64)
pantone=[c for c in colors if c["brand_id"].startswith("pantone")]
P=labs_of(PAINT)
qs=sample(pantone, 1500)
ds=np.array([cd2000_vec(q["lab"],P).min() for q in qs])
s=stats(ds)
print(f"  PANTONE 取樣 {len(qs)} → 最近油漆色(池{len(P)})")
print(f"     ΔE 中位={s['median']:.1f} 90分位={s['p90']:.1f} | <2:{s['lt2']}% <3:{s['lt3']}% <5:{s['lt5']}% <10:{s['lt10']}%")

print("\n"+"="*64)
print("三、常見牆面色 → 最近油漆色(真正 CIEDE2000)")
print("="*64)
def rgb_to_lab(rgb):
    r,g,b=[v/255.0 for v in rgb]
    gc=lambda c:((c+0.055)/1.055)**2.4 if c>0.04045 else c/12.92
    r,g,b=gc(r),gc(g),gc(b)
    x=r*0.4124564+g*0.3575761+b*0.1804375
    y=r*0.2126729+g*0.7151522+b*0.0721750
    z=r*0.0193339+g*0.1191920+b*0.9503041
    xn,yn,zn=0.95047,1.0,1.08883
    f=lambda t:t**(1/3) if t>0.008856 else 7.787*t+16/116
    fx,fy,fz=f(x/xn),f(y/yn),f(z/zn)
    return [116*fy-16,500*(fx-fy),200*(fy-fz)]
walls={"純白":[245,245,242],"米白":[238,232,220],"暖灰":[200,195,188],"淺灰":[210,210,210],
 "奶茶色":[214,196,174],"莫蘭迪綠":[168,178,160],"霧藍":[176,196,208],"粉膚":[232,210,200],
 "深灰":[110,110,112],"燕麥":[222,212,196]}
for name,rgb in walls.items():
    d=cd2000_vec(rgb_to_lab(rgb),P).min()
    print(f"  {name:8s} → 最近油漆色 ΔE={d:.2f}")
