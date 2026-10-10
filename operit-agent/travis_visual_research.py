"""Bounded, attributed public image collections for the Travis hologram.

Only an indexed result of a server-side search can be fetched. No client-supplied
image URL, executable scene description or unrestricted proxy is accepted.
"""
import base64
import copy
import contextvars
import html
import json
import re
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor

USER_AGENT = 'TravisVisual/1.2 (https://github.com/crassas/centro-negocios-ia)'
ALLOWED_HOSTS = {'en.wikipedia.org', 'pt.wikipedia.org', 'commons.wikimedia.org',
                 'upload.wikimedia.org', 'thumb.wikimedia.org', 'images-api.nasa.gov',
                 'images-assets.nasa.gov', 'images.nasa.gov', 'api.inaturalist.org',
                 'www.inaturalist.org', 'static.inaturalist.org',
                 'inaturalist-open-data.s3.amazonaws.com', 'api.polyhaven.com',
                 'polyhaven.com', 'dl.polyhaven.org'}
_CACHE = OrderedDict()
_IMAGES = OrderedDict()
_MODELS = OrderedDict()
_CATALOG = OrderedDict()
_DEADLINE = contextvars.ContextVar('visual_deadline', default=None)
_LOCK = threading.Lock()
MIMES = {'image/jpeg', 'image/png', 'image/webp'}
ALIASES = {'football': 'association football', 'futebol': 'association football',
           'soccer': 'association football', 'borboleta': 'butterfly', 'borboletas': 'butterfly',
           'gato': 'cat', 'cao': 'dog', 'cavalo': 'horse', 'flor': 'flower',
           'casa': 'house', 'edificio': 'building', 'terra': 'Earth', 'marte': 'Mars',
           'sol': 'Sun', 'lua': 'Moon', 'via lactea': 'Milky Way'}


def public_url(url):
    parsed = urllib.parse.urlsplit(str(url))
    if (parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS
            or parsed.port not in (None, 443) or parsed.username or parsed.password):
        raise ValueError('Visual reference origin refused')
    return url


class ReferenceRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, public_url(newurl))


def fetch(url, limit=1_500_000):
    request = urllib.request.Request(public_url(url), headers={'User-Agent': USER_AGENT})
    remaining = (_DEADLINE.get() or (time.monotonic() + 6)) - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('Visual request budget exhausted')
    with urllib.request.build_opener(ReferenceRedirect()).open(request, timeout=min(6, remaining)) as response:
        public_url(response.geturl())
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError('Visual reference too large')
        return data, response.headers.get_content_type()


def api(host, args):
    raw, _ = fetch('https://' + host + '/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'format': 'json', **args}))
    return json.loads(raw)


def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', '', str(value or '')))).strip()


def folded(value):
    return ''.join(c for c in unicodedata.normalize('NFD', plain(value)) if not unicodedata.combining(c)).casefold()


def cached(cache, key):
    with _LOCK:
        old = cache.get(key)
        if old and time.monotonic() - old[0] < 3600:
            cache.move_to_end(key)
            return copy.deepcopy(old[1])
    return None


def remember(cache, key, value, limit):
    with _LOCK:
        cache[key] = (time.monotonic(), copy.deepcopy(value))
        while len(cache) > limit:
            cache.popitem(last=False)


def json_api(url, args=None):
    if args:
        url += '?' + urllib.parse.urlencode(args)
    raw, _ = fetch(url)
    return json.loads(raw)


# Match the object, not merely a semantically related result. For example the
# provider's semantic search for "motor elétrico" also returns electricity boxes.
MODEL_WORDS = {'cadeira': 'chair', 'cadeiras': 'chair', 'poltrona': 'armchair',
    'mesa': 'table', 'mesas': 'table', 'sofa': 'sofa', 'banco': 'bench', 'cama': 'bed',
    'madeira': 'wooden', 'metal': 'metal', 'moderna': 'modern', 'moderno': 'modern',
    'antiga': 'vintage', 'antigo': 'vintage', 'candeeiro': 'lamp', 'lanterna': 'lantern',
    'camera': 'camera', 'camara': 'camera', 'fotografica': '', 'fotografico': '',
    'barril': 'barrel', 'maca': 'apple', 'pera': 'pear', 'banana': 'banana',
    'vaso': 'vase', 'garrafa': 'bottle', 'copo': 'glass', 'chaleira': 'kettle',
    'telefone': 'telephone', 'televisao': 'television', 'televisor': 'television',
    'radio': 'radio', 'microscopio': 'microscope', 'gerador': 'generator',
    'extintor': 'extinguisher', 'martelo': 'hammer', 'berbequim': 'drill',
    'escada': 'ladder', 'carrinho': 'cart', 'mochila': 'backpack',
    'sapato': 'shoe', 'bota': 'boot', 'relogio': 'clock', 'cadeado': 'padlock',
    'rocha': 'rock', 'pedra': 'rock', 'arvore': 'tree', 'tronco': 'log',
    'futebol': 'football', 'bola': 'ball', 'balde': 'bucket', 'mala': 'suitcase',
    'tesoura': 'scissors', 'ventoinha': 'fan', 'capacete': 'helmet', 'estatua': 'statue'}
MODEL_STOP = {'a', 'an', 'the', 'of', 'de', 'do', 'da', 'um', 'uma', 'em', 'in',
              '3d', 'modelo', 'model', 'object', 'objeto', 'holograma', 'hologram'}


def model_terms(query):
    terms = [MODEL_WORDS.get(t, t) for t in re.findall(r'[a-z0-9]+', folded(query)) if t not in MODEL_STOP]
    return {t for t in terms if t}


def model_candidates(query, assets):
    terms = model_terms(query)
    if not terms:
        return []
    ranked = []
    for slug, item in assets.items():
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,90}', slug) or item.get('type') != 2:
            continue
        if not 0 < item.get('polycount', 0) <= 100000:
            continue
        name = set(re.findall(r'[a-z]+', folded(item.get('name', ''))))
        tags = set(re.findall(r'[a-z]+', folded(' '.join(item.get('tags', [])))))
        # Furniture sets and statues must not stand in for an individual object.
        if (name & {'set', 'statue', 'covered', 'modular'}) - terms:
            continue
        if not terms <= name | tags:
            continue
        score = len(terms & name) * 10 - len(name - terms)
        ranked.append((score, slug, item))
    return sorted(ranked, key=lambda x: (-x[0], x[1]))[:2]


def geometry_document(document, includes):
    """Self-contained, static glTF; no textures, code, plugins or remote URIs."""
    if document.get('asset', {}).get('version') != '2.0' or document.get('extensionsRequired'):
        raise ValueError('Unsupported model format')
    if document.get('skins') or document.get('animations') or not 0 < len(document.get('nodes', [])) <= 256:
        raise ValueError('Only bounded static models are supported')
    if any(m.get('alphaMode', 'OPAQUE') != 'OPAQUE' for m in document.get('materials', [])):
        raise ValueError('Alpha-cutout models require their original textures')
    accessors = document.get('accessors', [])
    if not 0 < len(accessors) <= 256 or any(a.get('sparse') or not 0 <= a.get('count', -1) <= 300000 for a in accessors):
        raise ValueError('Model accessor budget exceeded')
    triangles = 0
    for mesh in document.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            if primitive.get('mode', 4) != 4 or primitive.get('extensions') or primitive.get('targets'):
                raise ValueError('Unsupported model geometry')
            index = primitive.get('indices', primitive.get('attributes', {}).get('POSITION', -1))
            if not isinstance(index, int) or not 0 <= index < len(accessors):
                raise ValueError('Invalid model accessor')
            triangles += accessors[index]['count'] // 3
            primitive.pop('material', None)
    if not 0 < triangles <= 100000:
        raise ValueError('Model triangle budget exceeded')
    buffers = document.get('buffers', [])
    total = sum(b.get('byteLength', 0) for b in buffers)
    if not 0 < len(buffers) <= 4 or not 0 < total <= 4_000_000:
        raise ValueError('Model byte budget exceeded')
    for buffer in buffers:
        source = includes.get(buffer.get('uri'), {})
        url = source.get('url', '')
        if urllib.parse.urlsplit(public_url(url)).hostname != 'dl.polyhaven.org':
            raise ValueError('Model buffer origin refused')
        if source.get('size') != buffer.get('byteLength'):
            raise ValueError('Model buffer size mismatch')
        raw, _ = fetch(url, limit=min(buffer['byteLength'], 4_000_000))
        if len(raw) != buffer['byteLength']:
            raise ValueError('Truncated model buffer')
        buffer['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(raw).decode()
    # Construct only the static geometry schema. The browser enforces it again.
    keys = ('asset', 'scene', 'scenes', 'nodes', 'meshes', 'accessors', 'bufferViews', 'buffers')
    clean = {key: document[key] for key in keys if key in document}
    for node in clean['nodes']:
        for key in list(node):
            if key not in {'name', 'mesh', 'children', 'matrix', 'translation', 'rotation', 'scale'}:
                del node[key]
    return clean, triangles


def resolve_model(query, language):
    previous = cached(_MODELS, folded(query))
    if previous is not None:
        return previous
    assets = cached(_CATALOG, 'polyhaven')
    if assets is None:
        assets = json_api('https://api.polyhaven.com/assets', {'type': 'models'})
        remember(_CATALOG, 'polyhaven', assets, 1)
    for _, slug, item in model_candidates(query, assets):
        try:
            files = json_api('https://api.polyhaven.com/files/' + slug)
            variants = files.get('gltf', {})
            variant = next((variants[k]['gltf'] for k in sorted(variants, key=lambda k: int(re.sub(r'\D', '', k) or 999)) if 'gltf' in variants[k]), None)
            if not variant:
                continue
            url = variant['url']
            if urllib.parse.urlsplit(public_url(url)).hostname != 'dl.polyhaven.org':
                continue
            raw, _ = fetch(url, limit=350000)
            original = json.loads(raw)
            # These two source files include alternate objects laid out beside
            # the requested one. Keep the complete main object in the portrait.
            primary = {'Camera_01': 'Camera_01', 'football': 'football_inflated'}.get(slug)
            if primary:
                selected = next((i for i, node in enumerate(original.get('nodes', [])) if node.get('name') == primary), None)
                if selected is not None:
                    original['scenes'] = [{'nodes': [selected]}]
                    original['scene'] = 0
            document, triangles = geometry_document(copy.deepcopy(original), variant.get('include', {}))
            detail = model_detail_image(original, variant.get('include', {}))
            result = {'ok': True, 'query': query, 'title': query, 'language': language,
                'representation': 'model-3d', 'source': 'Poly Haven',
                'url': 'https://polyhaven.com/a/' + slug, 'license': 'CC0',
                'author': ', '.join(item.get('authors', {}))[:180],
                'model': {'gltf': document, 'asset': slug, 'name': plain(item.get('name', slug)), 'triangles': triangles, 'detailImage': detail},
                'imageCount': 0, 'images': [], 'retrievedAt': int(time.time())}
            remember(_MODELS, folded(query), result, 4)
            return result
        except Exception:
            continue
    return None


def model_detail_image(document, includes):
    """One optional small atlas preserves engravings/seams on the 3D surface.

    It is a UV texture on real geometry, never a substitute for geometry. Only
    a shared base-colour atlas is supported so batching cannot mix materials.
    """
    try:
        roots = document['scenes'][document.get('scene', 0)]['nodes']
        pending, visited, material_ids = list(roots), set(), set()
        while pending:
            node_id = pending.pop()
            if node_id in visited:
                continue
            visited.add(node_id)
            node = document['nodes'][node_id]
            pending.extend(node.get('children', []))
            if 'mesh' in node:
                material_ids.update(p['material'] for p in document['meshes'][node['mesh']]['primitives'] if 'material' in p)
        materials = [document['materials'][i] for i in material_ids]
        indices = {m['pbrMetallicRoughness']['baseColorTexture']['index']
                   for m in materials if m.get('pbrMetallicRoughness', {}).get('baseColorTexture')}
        if len(indices) != 1:
            return None
        texture = document['textures'][indices.pop()]
        if texture.get('extensions'):
            return None
        filename = document['images'][texture['source']]['uri']
        item = includes.get(filename, {})
        if not 0 < item.get('size', 0) <= 750000:
            return None
        url = public_url(item['url'])
        if urllib.parse.urlsplit(url).hostname != 'dl.polyhaven.org':
            return None
        raw, mime = fetch(url, limit=750000)
        if mime not in MIMES:
            return None
        return 'data:' + mime + ';base64,' + base64.b64encode(raw).decode()
    except Exception:
        return None


def nasa_images(query):
    if not re.search(r'\b(?:mars|jupiter|saturn|earth|moon|sun|solar|space|galaxy|nebula|astronaut|nasa|milky way|planet|mercury|venus|uranus|neptune|pluto|hubble|webb)\b', folded(query)):
        return []
    data = json_api('https://images-api.nasa.gov/search', {'q': query, 'media_type': 'image', 'page_size': 12})
    result = []
    for row in data.get('collection', {}).get('items', []):
        info = (row.get('data') or [{}])[0]
        link = next((x for x in row.get('links', []) if x.get('rel') == 'preview'), None)
        if not link or not info.get('nasa_id'):
            continue
        result.append({'imageTitle': plain(info.get('title'))[:200],
            'description': plain(info.get('description'))[:500], 'rank': len(result),
            'imageUrl': public_url(link['href']), 'source': 'NASA',
            'creditUrl': 'https://images.nasa.gov/details/' + urllib.parse.quote(info['nasa_id'], safe=''),
            'author': plain(info.get('secondary_creator') or info.get('center') or 'NASA')[:180],
            'license': 'NASA · consultar crédito de origem',
            'width': link.get('width', 640), 'height': link.get('height', 480)})
    return result


def naturalist_images(query):
    data = json_api('https://api.inaturalist.org/v1/taxa', {'q': query, 'per_page': 5, 'is_active': 'true'})
    def stem(s):
        return re.sub(r'ies\b', 'y', folded(s)).rstrip('s')
    exact = next((x for x in data.get('results', []) if stem(query) in {stem(x.get('name', '')), stem(x.get('preferred_common_name', ''))}), None)
    if not exact:
        return []
    observations = json_api('https://api.inaturalist.org/v1/observations', {'taxon_id': exact['id'],
        'photos': 'true', 'photo_license': 'cc0,cc-by,cc-by-sa', 'per_page': 6, 'quality_grade': 'research'})
    result = []
    for row in observations.get('results', []):
        for photo in row.get('photos', [])[:1]:
            if photo.get('license_code') not in {'cc0', 'cc-by', 'cc-by-sa'}:
                continue
            url = photo.get('url', '').replace('/square.', '/medium.')
            size = photo.get('original_dimensions', {})
            result.append({'imageTitle': query + ' · ' + str(row['id']), 'rank': len(result),
                'imageUrl': public_url(url), 'source': 'iNaturalist',
                'creditUrl': 'https://www.inaturalist.org/observations/' + str(int(row['id'])),
                'author': plain(photo.get('attribution'))[:180], 'license': photo['license_code'].upper(),
                'width': size.get('width', 640), 'height': size.get('height', 480)})
    return result


def external_images(query):
    candidates = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(contextvars.copy_context().run, provider, query)
                   for provider in (nasa_images, naturalist_images)]
        for future in futures:
            try:
                candidates.extend(future.result())
            except Exception:
                pass
    return candidates


def score_image(item, query):
    name = folded(item.get('imageTitle', ''))
    detail = name + ' ' + folded(item.get('description', ''))
    terms = set(re.findall(r'[a-z]{3,}', folded(query))) - {'the', 'and', 'photo', 'photos', 'image', 'images'}
    score = 12 * sum(t in name for t in terms) + 4 * sum(t in detail for t in terms)
    score += max(0, 10 - item.get('rank', 10))
    # An editor-selected lead photograph is usually more representative than
    # filename matches alone; the icon/history penalties still apply below.
    if item.get('source') == 'Wikipedia':
        score += 20
    if item.get('source') in {'NASA', 'iNaturalist'}:
        score += 26
    if min(item.get('width', 640), item.get('height', 480)) >= 600:
        score += 3
    # Do not substitute antiquarian illustrations, logos or covers for a plain
    # request for a living subject. Explicit historical/drawing requests retain them.
    if not re.search(r'histor|ancient|antig|engraving|gravura|relief|relevo|logo|map|mapa|drawing|desenho', folded(query)):
        if re.search(r'relief|engraving|woodcut|manuscript|coat of arms|logo|icon|flag|symbol|cover|signature|\b1[678]\d{2}\b|\b19[0-4]\d\b', detail):
            score -= 45
    if re.search(r'butterfly|borboleta', folded(query)) and re.search(r'swim|schwimm|meeting|masters|100m', name):
        score -= 60
    if re.search(r'football|futebol|soccer', folded(query)) and re.search(r'american football|rugby', detail):
        score -= 60
    return score


def collection(query, language, include_image):
    host = language + '.wikipedia.org'
    search = ALIASES.get(folded(query), query)
    wiki_query = search if language == 'en' else query
    page = None
    try:
        data = api(host, {'generator': 'search', 'gsrsearch': wiki_query, 'gsrnamespace': 0,
            'gsrlimit': 3, 'prop': 'pageimages|extracts|info|langlinks', 'piprop': 'thumbnail|name',
            'pilicense': 'free', 'pithumbsize': 960, 'exintro': 1, 'explaintext': 1,
            'exsentences': 3, 'inprop': 'url', 'lllang': 'en'})
        pages = sorted(data.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 100))
        page = next((p for p in pages if 'missing' not in p), None)
    except Exception:
        pass
    article = public_url(page.get('fullurl') or 'https://' + host + '/wiki/' + urllib.parse.quote(page['title'])) if page else None
    result = {'ok': bool(page), 'query': query, 'title': plain(page['title'])[:150] if page else query,
              'summary': plain(page.get('extract'))[:850] if page else '', 'url': article,
              'source': 'Wikipedia' if page else 'Wikimedia Commons', 'language': language,
              'representation': 'reference-text', 'retrievedAt': int(time.time()), 'images': []}
    candidates = []
    if include_image:
        if page and language == 'pt' and search == query:
            search = next((x.get('*') for x in page.get('langlinks', []) if x.get('lang') == 'en'), search)
        try:
            data = api('commons.wikimedia.org', {'generator': 'search', 'gsrsearch': search + ' filetype:bitmap',
                'gsrnamespace': 6, 'gsrlimit': 12, 'prop': 'imageinfo', 'iiprop': 'url|size|mime|extmetadata',
                'iiurlwidth': 960, 'iiextmetadatafilter': 'ImageDescription|Artist|LicenseShortName'})
            for p in data.get('query', {}).get('pages', {}).values():
                info = (p.get('imageinfo') or [{}])[0]
                if info.get('mime') not in MIMES or min(info.get('width', 0), info.get('height', 0)) < 320:
                    continue
                if not .25 <= info['width'] / info['height'] <= 4:
                    continue
                try:
                    thumbnail = public_url(info.get('thumburl') or info['url'])
                    credit = public_url(info.get('descriptionurl') or 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(p['title']))
                except (ValueError, KeyError):
                    continue
                metadata = info.get('extmetadata', {})
                candidates.append({'imageTitle': plain(p['title'].removeprefix('File:'))[:200],
                    'imageUrl': thumbnail, 'creditUrl': credit, 'source': 'Wikimedia Commons',
                    'description': plain(metadata.get('ImageDescription', {}).get('value'))[:500],
                    'author': plain(metadata.get('Artist', {}).get('value'))[:180],
                    'license': plain(metadata.get('LicenseShortName', {}).get('value'))[:80],
                    'width': info['width'], 'height': info['height'], 'rank': p.get('index', 12)})
        except Exception:
            pass
        thumbnail = page.get('thumbnail', {}) if page else {}
        if thumbnail.get('source'):
            try:
                candidates.append({'imageTitle': plain(page.get('pageimage'))[:200],
                    'imageUrl': public_url(thumbnail['source']), 'rank': 3,
                    'creditUrl': 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(page.get('pageimage', '')),
                    'source': 'Wikipedia', 'width': thumbnail.get('width', 640), 'height': thumbnail.get('height', 480)})
            except ValueError:
                pass
        candidates.extend(external_images(search))
        candidates.sort(key=lambda item: score_image(item, search), reverse=True)
        # Reserve a place for each relevant independent source; six Wikimedia
        # variants must not crowd NASA or natural-history photographs out.
        first, rest, providers = [], [], set()
        for item in candidates:
            provider = 'Wikimedia' if item['source'] in {'Wikipedia', 'Wikimedia Commons'} else item['source']
            (rest if provider in providers else first).append(item)
            providers.add(provider)
        candidates = first + rest
        seen = set()
        for item in candidates:
            # Near-identical numbered shots should not occupy an entire collection.
            identity = (item['imageUrl'] if item['source'] in {'NASA', 'iNaturalist'} else
                        re.sub(r'[\W\d_]+', ' ', folded(item['imageTitle'])).strip())
            if identity in seen:
                continue
            seen.add(identity)
            result['images'].append({k: v for k, v in item.items() if k not in {'rank', 'description'}})
            if len(result['images']) >= 6:
                break
        if result['images']:
            result['ok'] = True
            if not result['url']:
                result['url'] = result['images'][0]['creditUrl']
    if not result['ok']:
        result['reason'] = 'reference-unavailable'
    return result


def _resolve(query, language='en', include_image=True, image_index=0, prefer_model=False):
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 180:
        return {'ok': False, 'reason': 'invalid-query'}
    query = plain(query)
    if '://' in query or any(c in query for c in '{}') or not query:
        return {'ok': False, 'reason': 'invalid-query'}
    if isinstance(image_index, bool) or not isinstance(image_index, int) or not 0 <= image_index < 6:
        return {'ok': False, 'reason': 'invalid-image-index'}
    language = 'pt' if language == 'pt' else 'en'
    if prefer_model and include_image:
        try:
            model = resolve_model(query, language)
            if model:
                return model
        except Exception:
            pass
    key = (query.casefold(), language, bool(include_image))
    result = cached(_CACHE, key)
    hit = result is not None
    if result is None:
        result = collection(query, language, include_image)
        if result['ok']:
            remember(_CACHE, key, result, 24)
    result['cached'] = hit
    result['imageCount'] = len(result['images'])
    if include_image and result['images']:
        index = image_index % len(result['images'])
        # A failed image may fall back to one other candidate, within the same
        # request budget; the selected index is reported accurately to the UI.
        for attempt in range(min(2, len(result['images']))):
            selected = (index + attempt) % len(result['images'])
            item = result['images'][selected]
            try:
                image_data = cached(_IMAGES, item['imageUrl'])
                if image_data is None:
                    image, mime = fetch(item['imageUrl'])
                    if mime not in MIMES:
                        raise ValueError('Unsupported image type')
                    image_data = 'data:' + mime + ';base64,' + base64.b64encode(image).decode()
                    remember(_IMAGES, item['imageUrl'], image_data, 12)
                result.update({k: v for k, v in item.items() if k != 'source'})
                result['imageSource'] = item.get('source', 'Wikimedia Commons')
                result.update({'imageData': image_data, 'imageIndex': selected, 'representation': 'image-relief'})
                break
            except Exception:
                continue
        if 'imageData' not in result:
            result['imageUnavailable'] = True
    return result


def resolve(query, language='en', include_image=True, image_index=0, prefer_model=False):
    token = _DEADLINE.set(time.monotonic() + 30)
    try:
        result = _resolve(query, language, include_image, image_index, prefer_model)
        if prefer_model and include_image and result.get('representation') != 'model-3d':
            result['modelUnavailable'] = True
        return result
    finally:
        _DEADLINE.reset(token)


def request(body):
    if not isinstance(body, dict):
        return {'ok': False, 'reason': 'invalid-request'}
    return resolve(body.get('query'), body.get('language'), body.get('includeImage', True) is not False,
                   body.get('imageIndex', 0), body.get('preferModel') is True)
