"""Read-only visual references from public encyclopedia pages and free thumbnails.

Responses contain data, never executable scene code. Images are converted to a
holographic relief in the browser; they are not claimed to be recovered 3D models.
"""
import base64
import copy
import html
import json
import re
import threading
import time
import urllib.parse
import urllib.request
from collections import OrderedDict

USER_AGENT = 'TravisVisual/1.0 (https://github.com/crassas/centro-negocios-ia)'
ALLOWED_HOSTS = {'en.wikipedia.org', 'pt.wikipedia.org', 'commons.wikimedia.org',
                 'upload.wikimedia.org', 'thumb.wikimedia.org'}
_CACHE = OrderedDict()
_LOCK = threading.Lock()


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


def resolve(query, language='en', include_image=True):
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 180:
        return {'ok': False, 'reason': 'invalid-query'}
    query = plain(query)
    if '://' in query or any(c in query for c in '{}'):
        return {'ok': False, 'reason': 'invalid-query'}
    language = 'pt' if language == 'pt' else 'en'
    key = (query.casefold(), language, bool(include_image))
    with _LOCK:
        old = _CACHE.get(key)
        if old and time.monotonic() - old[0] < 3600:
            _CACHE.move_to_end(key)
            return {**copy.deepcopy(old[1]), 'cached': True}
    host = language + '.wikipedia.org'
    try:
        data = api(host, {'generator': 'search', 'gsrsearch': query, 'gsrnamespace': 0,
            'gsrlimit': 3, 'prop': 'pageimages|extracts|info', 'piprop': 'thumbnail|name',
            'pilicense': 'free', 'pithumbsize': 640, 'exintro': 1, 'explaintext': 1,
            'exsentences': 3, 'inprop': 'url'})
        pages = sorted(data.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 100))
        page = next((p for p in pages if 'missing' not in p), None)
        if not page:
            return {'ok': False, 'reason': 'no-reference', 'query': query}
        article = public_url(page.get('fullurl') or 'https://' + host + '/wiki/' + urllib.parse.quote(page['title']))
        result = {'ok': True, 'query': query, 'title': plain(page['title'])[:150],
                  'summary': plain(page.get('extract'))[:850], 'url': article,
                  'source': 'Wikipedia', 'language': language, 'representation': 'reference-text',
                  'retrievedAt': int(time.time()), 'cached': False}
        thumbnail = page.get('thumbnail', {}).get('source')
        if include_image and thumbnail:
            try:
                image, mime = fetch(thumbnail)
                if mime not in {'image/jpeg', 'image/png', 'image/webp'}:
                    raise ValueError('Unsupported image type')
                result.update({'imageData': 'data:' + mime + ';base64,' + base64.b64encode(image).decode(),
                    'imageUrl': public_url(thumbnail), 'representation': 'image-relief',
                    'imageTitle': plain(page.get('pageimage'))[:200],
                    'creditUrl': 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(page.get('pageimage', ''))})
            except Exception:
                result['imageUnavailable'] = True
        with _LOCK:
            _CACHE[key] = (time.monotonic(), copy.deepcopy(result))
            while len(_CACHE) > 24:
                _CACHE.popitem(last=False)
        return result
    except Exception:
        return {'ok': False, 'reason': 'reference-unavailable', 'query': query}


def request(body):
    if not isinstance(body, dict):
        return {'ok': False, 'reason': 'invalid-request'}
    return resolve(body.get('query'), body.get('language'), body.get('includeImage', True) is not False)
