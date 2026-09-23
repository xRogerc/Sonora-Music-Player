import re
import time

import yt_dlp
from ytmusicapi import YTMusic

_client = None
_YDL_OPTS = {
    'format': 'bestaudio[ext=m4a]/bestaudio/best',
    'quiet': True,
    'no_warnings': True,
    'noplaylist': True,
}


def get_client():
    global _client
    if _client is None:
        _client = YTMusic()
    return _client


def _big_thumbnail(url, size=320):
    if not url:
        return url
    return re.sub(r'=w\d+-h\d+', f'=w{size}-h{size}-l90-rj', url)


def search_songs(query, limit=15):
    results = get_client().search(query, filter='songs', limit=limit)
    songs = []
    for result in results:
        video_id = result.get('videoId') or result.get('id')
        if not video_id:
            continue
        artists = ', '.join(
            artist.get('name', '')
            for artist in (result.get('artists') or [])
            if artist.get('name')
        )
        album = (result.get('album') or {}).get('name', '')
        songs.append({
            'video_id': video_id,
            'title': result.get('title', ''),
            'artists': artists,
            'album': album,
            'duration': result.get('duration_seconds') or 0,
            'thumbnails': [_big_thumbnail(thumb.get('url', '')) for thumb in (result.get('thumbnails') or [])],
        })
    return songs


def _parse_duration(length):
    if not length:
        return 0
    parts = str(length).split(':')
    total = 0
    for part in parts:
        total = total * 60 + int(part or 0)
    return total


def related_songs(video_id, limit=15):
    data = get_client().get_watch_playlist(video_id, limit=limit + 1)
    tracks = data.get('tracks') or []
    songs = []
    for track in tracks:
        tid = track.get('videoId')
        if not tid or tid == video_id:
            continue
        artists = ', '.join(
            artist.get('name', '')
            for artist in (track.get('artists') or [])
            if artist.get('name')
        )
        album = (track.get('album') or {}).get('name', '')
        thumbs = track.get('thumbnail') or []
        songs.append({
            'video_id': tid,
            'title': track.get('title', ''),
            'artists': artists,
            'album': album,
            'duration': _parse_duration(track.get('length')),
            'thumbnails': [_big_thumbnail(thumb.get('url', '')) for thumb in thumbs],
        })
        if len(songs) >= limit:
            break
    return songs


_lyrics_cache = {}


def get_lyrics_for(video_id):
    if video_id in _lyrics_cache:
        return _lyrics_cache[video_id]
    result = {'lyrics': '', 'source': ''}
    try:
        data = get_client().get_watch_playlist(video_id)
        browse_id = data.get('lyrics')
        if browse_id:
            info = get_client().get_lyrics(browse_id)
            if info:
                result = {
                    'lyrics': info.get('lyrics', ''),
                    'source': info.get('source', ''),
                }
    except Exception:
        pass
    if result['lyrics']:
        _lyrics_cache[video_id] = result
    return result


def get_stream_info(video_id):
    url = f'https://www.youtube.com/watch?v={video_id}'
    with yt_dlp.YoutubeDL(_YDL_OPTS) as ydl:
        info = ydl.extract_info(url, download=False)
    if info.get('url'):
        stream_url = info['url']
    else:
        stream_url = info['formats'][-1]['url']
    headers = dict(info.get('http_headers') or {})
    headers.pop('Accept-Encoding', None)
    return {
        'url': stream_url,
        'headers': headers,
        'title': info.get('title', ''),
        'duration': info.get('duration', 0),
    }


_home_cache = {}


def _cached(ttl=600):
    def decorator(fn):
        def wrapper(*args, **kwargs):
            key = (fn.__name__, args, tuple(sorted(kwargs.items())))
            hit = _home_cache.get(key)
            now = time.time()
            if hit and now - hit[1] < ttl:
                return hit[0]
            value = fn(*args, **kwargs)
            _home_cache[key] = (value, now)
            return value
        return wrapper
    return decorator


def _normalize_yt_song(item):
    video_id = item.get('videoId') or item.get('id')
    if not video_id:
        return None
    artists = ', '.join(
        artist.get('name', '')
        for artist in (item.get('artists') or [])
        if artist.get('name')
    )
    album_obj = item.get('album')
    if isinstance(album_obj, dict):
        album = album_obj.get('name', '')
    elif isinstance(album_obj, str):
        album = album_obj
    else:
        album = ''
    thumbs = item.get('thumbnails') or (item.get('thumbnail') or []) or []
    thumb_url = thumbs[-1].get('url', '') if thumbs else ''
    return {
        'video_id': video_id,
        'title': item.get('title', ''),
        'artists': artists,
        'album': album,
        'duration': item.get('duration_seconds') or _parse_duration(item.get('length')),
        'thumbnails': [_big_thumbnail(thumb.get('url', '')) for thumb in thumbs],
        'thumbnail_url': _big_thumbnail(thumb_url),
    }


@_cached(ttl=600)
def trending_songs(limit=10):
    charts = get_client().get_charts(country='BR')
    videos = charts.get('videos') or []
    playlist_id = None
    for item in videos:
        title = (item.get('title') or '').lower()
        pid = item.get('playlistId') or item.get('browseId') or item.get('id')
        if pid and 'trending' in title:
            playlist_id = pid
            break
    if not playlist_id and videos:
        item = videos[0]
        playlist_id = item.get('playlistId') or item.get('browseId') or item.get('id')
    if not playlist_id:
        return []
    data = playlist_tracks(playlist_id, limit=limit)
    return data.get('tracks', [])


@_cached(ttl=600)
def genre_playlist_sections(max_styles=6, per_style=4):
    categories = get_client().get_mood_categories() or {}
    sections = []
    for group in categories.values():
        if len(sections) >= max_styles:
            break
        for category in group or []:
            if len(sections) >= max_styles:
                break
            style = category.get('title', '')
            params = category.get('params') or category.get('id')
            if not style or not params:
                continue
            try:
                data = get_client().get_mood_playlists(params)
            except Exception:
                continue
            playlists = []
            for item in data or []:
                pid = item.get('playlistId') or item.get('browseId') or item.get('id')
                if not pid:
                    continue
                thumbs = item.get('thumbnails') or []
                thumb_url = thumbs[-1].get('url', '') if thumbs else ''
                playlists.append({
                    'playlist_id': pid,
                    'title': item.get('title', ''),
                    'count': item.get('trackCount') or item.get('videoCount') or 0,
                    'thumbnail_url': _big_thumbnail(thumb_url),
                })
                if len(playlists) >= per_style:
                    break
            if playlists:
                sections.append({'estilo': style, 'playlists': playlists})
    return sections


@_cached(ttl=900)
def playlist_tracks(browse_id, limit=60):
    data = get_client().get_playlist(browse_id)
    tracks = []
    for item in data.get('tracks') or []:
        song = _normalize_yt_song(item)
        if song:
            tracks.append(song)
        if len(tracks) >= limit:
            break
    thumbs = data.get('thumbnails') or []
    thumb_url = thumbs[-1].get('url', '') if thumbs else ''
    return {
        'name': data.get('title', 'Playlist'),
        'description': data.get('description', ''),
        'thumbnail_url': _big_thumbnail(thumb_url),
        'tracks': tracks,
    }