"""Generate the photo-derived Level 78 blockout GLBs.

Authoring-only standard-library script. The deployed site remains build-free.
Run from the repository root: python tools/build_level78.py
"""
import json, math, struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / "data/level78-layout.json").read_text(encoding="utf-8"))

def box(x0,y0,z0,x1,y1,z1):
    v=[(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
    f=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]
    return v,f

def quad(a,b,c,d): return [a,b,c,d],[0,2,1,0,3,2]

def cylinder(cx,cz,r,y0,y1,n=32):
    v=[]
    for y in (y0,y1):
        for i in range(n):
            a=2*math.pi*i/n; v.append((cx+r*math.cos(a),y,cz+r*math.sin(a)))
    f=[]
    for i in range(n):
        j=(i+1)%n; f += [i,j,n+j,i,n+j,n+i]
    for i in range(1,n-1): f += [0,i+1,i,n,n+i,n+i+1]
    return v,f

def merge(parts):
    vv=[]; ff=[]
    for v,f in parts:
        o=len(vv); vv += v; ff += [i+o for i in f]
    return vv,ff

def glb(path, primitives, materials):
    blob=bytearray(); views=[]; access=[]; prims=[]
    for verts,inds,mat in primitives:
        while len(blob)%4: blob.append(0)
        vo=len(blob)
        for p in verts: blob += struct.pack('<fff',*p)
        views.append({'buffer':0,'byteOffset':vo,'byteLength':len(verts)*12,'target':34962})
        xs=[p[0] for p in verts]; ys=[p[1] for p in verts]; zs=[p[2] for p in verts]
        access.append({'bufferView':len(views)-1,'componentType':5126,'count':len(verts),'type':'VEC3','min':[min(xs),min(ys),min(zs)],'max':[max(xs),max(ys),max(zs)]})
        while len(blob)%4: blob.append(0)
        io=len(blob)
        for i in inds: blob += struct.pack('<I',i)
        views.append({'buffer':0,'byteOffset':io,'byteLength':len(inds)*4,'target':34963})
        access.append({'bufferView':len(views)-1,'componentType':5125,'count':len(inds),'type':'SCALAR','min':[min(inds)],'max':[max(inds)]})
        prims.append({'attributes':{'POSITION':len(access)-2},'indices':len(access)-1,'material':mat})
    doc={'asset':{'version':'2.0','generator':'kingpowerwalk Level 78 blockout'},'scene':0,'scenes':[{'nodes':[0]}],
         'nodes':[{'name':path.stem,'mesh':0}],'meshes':[{'name':path.stem,'primitives':prims}],
         'materials':materials,'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':access}
    js=json.dumps(doc,separators=(',',':')).encode(); js += b' ' *((4-len(js)%4)%4); blob += b'\0' *((4-len(blob)%4)%4)
    out=bytearray(b'glTF')+struct.pack('<II',2,12+8+len(js)+8+len(blob))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(blob),0x004E4942)+blob
    path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(out)

def width_at_x(x):
    s=CFG['stairs']; t=(x-s['rearX'])/(s['frontX']-s['rearX'])
    return s['topWidth']+(s['bottomWidth']-s['topWidth'])*t

def build_deck():
    d=CFG['deck']; halfD=d['depth']/2; halfW=d['width']/2; gy=d['elevation']; glass=CFG['glassTray']; s=CFG['stairs']; up=CFG['upperViewingArea']
    opaque=[]; transparent=[]
    # Main terrace and full-width glass tray are separate visual surfaces.
    opaque.append(box(-halfD,-0.12,-halfW,halfD-glass['depth'],gy,halfW))
    transparent.append(box(halfD-glass['depth'],-0.04,-halfW,halfD,gy,halfW))
    # Yellow wedge below the stair/Peak mass.
    opaque.append(box(up['rearX'],gy,-up['width']/2,s['frontX'],0.30,up['width']/2))
    # Twenty stepped treads rising to +4 m.
    n=s['steps']; dx=(s['frontX']-s['rearX'])/n
    for i in range(n):
        x0=s['frontX']-(i+1)*dx; x1=s['frontX']-i*dx; y1=gy+(i+1)*up['elevation']/n; w=width_at_x((x0+x1)/2)
        opaque.append(box(x0,gy,-w/2,x1,y1,w/2))
    opaque.append(box(up['rearX'],gy,-up['width']/2,up['frontX'],up['elevation'],up['width']/2))
    e=CFG['elevator']; opaque.append(cylinder(e['centre'][0],e['centre'][1],e['diameter']/2,gy,e['height']))
    # Simplified glass rail: thin blocks around the rectangular public envelope.
    h=CFG['railings']['height']; t=.05
    transparent += [box(-halfD,gy,-halfW,-halfD+t,h,-halfW+t),box(-halfD,gy,halfW-t,halfD,h,halfW),
                    box(-halfD,gy,-halfW,halfD,h,-halfW+t),box(halfD-t,gy,-halfW,halfD,h,halfW)]
    mats=[{'name':'Deck','pbrMetallicRoughness':{'baseColorFactor':[0.65,0.67,0.68,1],'metallicFactor':0,'roughnessFactor':.85}},
          {'name':'Glass','alphaMode':'BLEND','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.2,.72,.86,.32],'metallicFactor':0,'roughnessFactor':.12}}]
    glb(ROOT/'assets/models/deck.glb',[(*merge(opaque),0),(*merge(transparent),1)],mats)

def build_navmesh():
    d=CFG['deck']; halfD=d['depth']/2; halfW=d['width']/2; gy=.05; s=CFG['stairs']; up=CFG['upperViewingArea']; e=CFG['elevator']
    cells=[]; step=.5
    x=-halfD+.5
    while x<halfD-.5:
        z=-halfW+.5
        while z<halfW-.5:
            blocked=(math.hypot(x-e['centre'][0],z-e['centre'][1])<e['diameter']/2+.45) or (up['rearX']-.3<x<s['frontX']+.3 and abs(z)<up['width']/2+.3)
            if not blocked: cells.append(quad((x-step/2,gy,z-step/2),(x+step/2,gy,z-step/2),(x+step/2,gy,z+step/2),(x-step/2,gy,z+step/2)))
            z+=step
        x+=step
    n=s['steps']; dx=(s['frontX']-s['rearX'])/n
    for i in range(n):
        x0=s['frontX']-(i+1)*dx; x1=s['frontX']-i*dx; y=gy+(i+1)*up['elevation']/n; w=width_at_x((x0+x1)/2)-.6
        cells.append(quad((x0,y,-w/2),(x1,y,-w/2),(x1,y,w/2),(x0,y,w/2)))
    cells.append(quad((up['rearX']+.35,up['elevation']+.05,-up['width']/2+.35),(up['frontX']-.05,up['elevation']+.05,-up['width']/2+.35),(up['frontX']-.05,up['elevation']+.05,up['width']/2-.35),(up['rearX']+.35,up['elevation']+.05,up['width']/2-.35)))
    mats=[{'name':'Navmesh','pbrMetallicRoughness':{'baseColorFactor':[0,1,0,1],'metallicFactor':0,'roughnessFactor':1}}]
    glb(ROOT/'assets/nav/navmesh.glb',[(*merge(cells),0)],mats)

if __name__=='__main__':
    build_deck(); build_navmesh()
    print('Generated assets/models/deck.glb and assets/nav/navmesh.glb')
