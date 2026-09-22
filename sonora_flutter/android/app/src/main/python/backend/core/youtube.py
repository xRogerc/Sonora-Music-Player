import re

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