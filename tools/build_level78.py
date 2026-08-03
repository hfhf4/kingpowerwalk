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
    # The terrace runs the full depth of the deck envelope.
    opaque.append(box(-halfD,-0.12,-halfW,halfD,gy,halfW))
    # The glass tray is CANTILEVERED past the tower, not inset into the deck.
    # Inset it sat over solid roof (the slab reaches X=22.98), so looking down
    # through it showed roof and no amount of transparency could fix that. Out
    # here there is nothing beneath it, which is what makes the drop real — and
    # is what the actual SkyWalk does.
    gx0=glass['innerX']; gx1=glass['outerX']; gw=glass['width']/2
    transparent.append(box(gx0,-0.04,-gw,gx1,gy,gw))
    # A bridging slab from the deck edge out to the tray, so there is no gap to
    # fall through where the terrace ends.
    if gx0>halfD: opaque.append(box(halfD-0.05,-0.10,-gw,gx0+0.02,gy-0.005,gw))
    # Lip around the three exposed sides, so the tray reads as a structure
    # rather than a pane floating in space.
    lip=0.10
    opaque += [box(gx1-lip,-0.06,-gw,gx1,gy+0.05,gw),
               box(gx0,-0.06,-gw,gx1,gy+0.05,-gw+lip),
               box(gx0,-0.06,gw-lip,gx1,gy+0.05,gw)]
    # Twenty stepped treads rising to +4 m.
    n=s['steps']; dx=(s['frontX']-s['rearX'])/n
    for i in range(n):
        x0=s['frontX']-(i+1)*dx; x1=s['frontX']-i*dx; y1=gy+(i+1)*up['elevation']/n; w=width_at_x((x0+x1)/2)
        opaque.append(box(x0,gy,-w/2,x1,y1,w/2))
    # The Peak is a thin slab at +4 m, not a full-height block protruding beside the stairs.
    opaque.append(box(up['rearX'],up['elevation']-.22,-up['width']/2,up['frontX'],up['elevation'],up['width']/2))
    # The round glazed elevator is real; only the unrelated centre cylinder was a bug.
    e=CFG['elevator']; opaque.append(cylinder(e['centre'][0],e['centre'][1],e['diameter']/2,gy,e['height']))
    # Simplified glass rail: thin blocks around the rectangular public envelope.
    h=CFG['railings']['height']; t=.05
    gw=glass['width']/2; gx1=glass['outerX']
    transparent += [box(-halfD,gy,-halfW,-halfD+t,h,halfW),            # rear
                    box(-halfD,gy,halfW-t,halfD,h,halfW),              # left
                    box(-halfD,gy,-halfW,halfD,h,-halfW+t),            # right
                    # Rails follow the tray out and close its far end, so the
                    # cantilever is walkable without being a way off the edge.
                    box(halfD,gy,gw-t,gx1,h,gw),
                    box(halfD,gy,-gw,gx1,h,-gw+t),
                    box(gx1-t,gy,-gw,gx1,h,gw)]
    mats=[{'name':'Deck','pbrMetallicRoughness':{'baseColorFactor':[0.65,0.67,0.68,1],'metallicFactor':0,'roughnessFactor':.85}},
          {'name':'Glass','alphaMode':'BLEND','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.12,.68,.82,.16],'metallicFactor':0,'roughnessFactor':.08}}]
    glb(ROOT/'assets/models/deck.glb',[(*merge(opaque),0),(*merge(transparent),1)],mats)

def build_navmesh():
    d=CFG['deck']; halfD=d['depth']/2; halfW=d['width']/2; gy=.05; s=CFG['stairs']; up=CFG['upperViewingArea']; e=CFG['elevator']; inset=CFG['railings']['navmeshInset']
    cells=[]; step=.5
    x=-halfD+inset+.25
    while x<halfD-inset:
        z=-halfW+inset+.25
        while z<halfW-inset:
            blocked=(math.hypot(x-e['centre'][0],z-e['centre'][1])<e['diameter']/2+.45) or (up['rearX']-.3<x<s['rearX']+.3 and abs(z)<up['width']/2+.3)
            if not blocked: cells.append(quad((x-step/2,gy,z-step/2),(x+step/2,gy,z-step/2),(x+step/2,gy,z+step/2),(x-step/2,gy,z+step/2)))
            z+=step
        x+=step
    n=s['steps']; dx=(s['frontX']-s['rearX'])/n
    for i in range(n):
        x0=s['frontX']-(i+1)*dx; x1=s['frontX']-i*dx; y=gy+(i+1)*up['elevation']/n; w=width_at_x((x0+x1)/2)-.6
        cells.append(quad((x0,y,-w/2),(x1,y,-w/2),(x1,y,w/2),(x0,y,w/2)))
    cells.append(quad((up['rearX']+.35,up['elevation']+.05,-up['width']/2+.35),(up['frontX']-.05,up['elevation']+.05,-up['width']/2+.35),(up['frontX']-.05,up['elevation']+.05,up['width']/2-.35),(up['rearX']+.35,up['elevation']+.05,up['width']/2-.35)))
    # Walk out onto the cantilevered tray. Without this the navmesh stops at the
    # old deck edge and the tray is scenery you can look at but never stand on,
    # which is the whole point of it.
    g=CFG['glassTray']; gw=g['width']/2-inset
    x=halfD-inset
    while x<g['outerX']-inset:
        z=-gw
        while z<gw:
            cells.append(quad((x-step/2,gy,z-step/2),(x+step/2,gy,z-step/2),(x+step/2,gy,z+step/2),(x-step/2,gy,z+step/2)))
            z+=step
        x+=step
    mats=[{'name':'Navmesh','pbrMetallicRoughness':{'baseColorFactor':[0,1,0,1],'metallicFactor':0,'roughnessFactor':1}}]
    glb(ROOT/'assets/nav/navmesh.glb',[(*merge(cells),0)],mats)

if __name__=='__main__':
    build_deck(); build_navmesh()
    print('Generated deck.glb and navmesh.glb; tower.glb is preserved unchanged')
    print(f"  glass tray cantilevered to X {CFG['glassTray']['innerX']}..{CFG['glassTray']['outerX']} (roof ends at 22.98)")
