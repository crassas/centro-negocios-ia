"""Bounded, attributed public image collections for the Travis hologram.

Only an indexed result of a server-side search can be fetched. No client-supplied
image URL, executable scene description or unrestricted proxy is accepted.
"""
import base64
import copy
import html
import json
import re
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import OrderedDict

USER_AGENT = 'TravisVisual/1.1 (https://github.com/crassas/centro-negocios-ia)'
ALLOWED_HOSTS = {'en.wikipedia.org', 'pt.wikipedia.org', 'commons.wikimedia.org',
                 'upload.wikimedia.org', 'thumb.wikimedia.org'}
_CACHE = OrderedDict()
_IMAGES = OrderedDict()
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
    with urllib.request.build_opener(ReferenceRedirect()).open(request, timeout=6) as response:
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
        candidates.sort(key=lambda item: score_image(item, search), reverse=True)
        seen = set()
        for item in candidates:
            # Near-identical numbered shots should not occupy an entire collection.
            identity = re.sub(r'[\W\d_]+', ' ', folded(item['imageTitle'])).strip()
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


def resolve(query, language='en', include_image=True, image_index=0):
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 180:
        return {'ok': False, 'reason': 'invalid-query'}
    query = plain(query)
    if '://' in query or any(c in query for c in '{}') or not query:
        return {'ok': False, 'reason': 'invalid-query'}
    if isinstance(image_index, bool) or not isinstance(image_index, int) or not 0 <= image_index < 6:
        return {'ok': False, 'reason': 'invalid-image-index'}
    language = 'pt' if language == 'pt' else 'en'
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


def request(body):
    if not isinstance(body, dict):
        return {'ok': False, 'reason': 'invalid-request'}
    return resolve(body.get('query'), body.get('language'), body.get('includeImage', True) is not False,
                   body.get('imageIndex', 0))
