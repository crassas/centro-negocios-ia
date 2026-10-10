"""Build local reference figures, never a runtime text-to-mesh approximation.

python scripts/prepare_travis_figures.py BODY_PARTS_DIR ACES.glb
Build dependencies: numpy, fast-simplification, DracoPy. Runtime: none.
Sources and adaptations are recorded in assets/travis/figures/ATTRIBUTION.txt.
"""
import base64, hashlib, json, pathlib, struct, sys, zipfile
import numpy as np
import fast_simplification
import DracoPy

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'assets/travis/figures'
out.mkdir(parents=True, exist_ok=True)
for old in out.glob('astronaut-*.json'): old.unlink()
def write(name, data):
    raw = json.dumps(data, separators=(',', ':')) + '\n'
    assert len(raw.encode()) < 450000, (name, len(raw))
    (out / name).write_text(raw)
def b64(a): return base64.b64encode(a.tobytes()).decode()
def normals(v, f):
    n = np.zeros_like(v)
    face = np.cross(v[f[:, 1]]-v[f[:, 0]], v[f[:, 2]]-v[f[:, 0]])
    for i in range(3): np.add.at(n, f[:, i], face)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
def chunks(name, v, f, n, uv=None):
    paths = []
    # Preserve original normals across chunk boundaries and UV seams.
    step = 4000 if uv is not None else 9000
    for start in range(0, len(f), step):
        vi, inv = np.unique(f[start:start+step].ravel(), return_inverse=True)
        data = dict(version=1, id=name, divisor=20000,
                    positions=b64(np.round(v[vi]*20000).astype('<i2')),
                    normals=b64(np.round(np.clip(n[vi], -1, 1)*32767).astype('<i2')),
                    indices=b64(inv.astype('<u2')))
        assert np.max(np.abs(v)) < 1.635
        if uv is not None: data['uv'] = b64(uv[vi].astype('<f4'))
        filename = f'{name}-{len(paths)}.json'
        write(filename, data); paths.append(filename)
    return paths

archive = pathlib.Path(sys.argv[1]) / 'partof_BP3D_4.0_obj_99.zip'
with zipfile.ZipFile(archive) as z:
    raw = z.read('partof_BP3D_4.0_obj_99/FJ2810.obj').decode()
assert '# Concept ID : FMA7163\n' in raw
v, f = [], []
for line in raw.splitlines():
    if line.startswith('v '): v.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('f '):
        face = [int(x.split('/')[0])-1 for x in line.split()[1:]]
        for k in range(1, len(face)-1): f.append([face[0], face[k], face[k+1]])
v, inv = np.unique(np.asarray(v), axis=0, return_inverse=True)
f = inv[np.asarray(f)].astype(np.int32)
v, f = fast_simplification.simplify(v, f, target_count=60000, agg=5)
v = v[:, [0, 2, 1]]; v[:, 2] *= -1
low, high = v.min(0), v.max(0)
v = (v-(low+high)/2)*(2.6/(high[1]-low[1]))
human = dict(files=chunks('human', v, f, normals(v, f)), triangles=len(f))

source = pathlib.Path(sys.argv[2]); blob = source.read_bytes()
size = struct.unpack_from('<I', blob, 12)[0]
doc = json.loads(blob[20:20+size]); binary = blob[28+size:]
def view(index):
    spec = doc['bufferViews'][index]; start = spec.get('byteOffset', 0)
    return binary[start:start+spec['byteLength']]
decoded = []
for primitive in doc['meshes'][0]['primitives']:
    data = DracoPy.decode(view(primitive['extensions']['KHR_draco_mesh_compression']['bufferView']))
    # The ACES source root rotates +90 degrees about X.
    v = data.points[:, [0, 2, 1]].astype(float); v[:, 1] *= -1
    n = data.normals[:, [0, 2, 1]].astype(float); n[:, 1] *= -1
    decoded.append((v, data.faces, n, data.tex_coord, primitive['material']))
allv = np.concatenate([d[0] for d in decoded]); low, high = allv.min(0), allv.max(0)
astronaut = []
for i, (v, f, n, uv, mat) in enumerate(decoded):
    v = (v-(low+high)/2)*(2.6/(high[1]-low[1]))
    material = doc['materials'][mat]['pbrMetallicRoughness']
    # This NASA model carries detailed geometry and material colours, no atlas.
    assert 'baseColorTexture' not in material
    astronaut.append(dict(files=chunks(f'astronaut-{i}', v, f, n),
                          colour=material.get('baseColorFactor', [1,1,1,1])[:3], triangles=len(f)))
manifest = dict(version=1, human=human, astronaut=astronaut,
                sourceSha256={'bodyparts': hashlib.sha256(archive.read_bytes()).hexdigest(),
                              'astronaut': hashlib.sha256(blob).hexdigest()})
write('manifest.json', manifest)
print(json.dumps(manifest, indent=2))
