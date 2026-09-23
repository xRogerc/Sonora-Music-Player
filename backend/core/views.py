import django.utils.timezone
import requests
from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.views import exceptions

from .models import Favorite, HistoryEntry, Playlist, PlaylistSong, Song
from .serializers import (
    FavoriteSerializer,
    HistorySerializer,
    PlaylistDetailSerializer,
    PlaylistSerializer,
    PlaylistSongInputSerializer,
    RegisterSerializer,
    SongInputSerializer,
    SongSerializer,
)
from .youtube import (
    genre_playlist_sections,
    get_lyrics_for,
    get_stream_info,
    playlist_tracks,
    related_songs,
    search_songs,
    trending_songs,
)


def upsert_song(data):
    video_id = data.get('video_id')
    if not video_id:
        return None
    defaults = {
        'title': data.get('title') or '',
        'artists': data.get('artists') or '',
        'album': data.get('album') or '',
        'duration': data.get('duration') or 0,
        'thumbnails': data.get('thumbnails') or [],
    }
    song, _ = Song.objects.get_or_create(video_id=video_id, defaults=defaults)
    return song


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'username': user.username}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username', '')
        password = request.data.get('password', '')
        user = authenticate(username=username, password=password)
        if not user:
            return Response({'detail': 'Usuário ou senha inválidos'}, status=status.HTTP_400_BAD_REQUEST)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'username': user.username})


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response({'id': request.user.id, 'username': request.user.username})


class SearchView(APIView):
    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if not query:
            return Response({'results': []})
        try:
            limit = min(int(request.query_params.get('limit', 15)), 50)
        except (TypeError, ValueError):
            limit = 15
        results = search_songs(query, limit)
        songs = [upsert_song(data) for data in results]
        songs = [song for song in songs if song]
        return Response({'results': SongSerializer(songs, many=True).data})


class SongLyricsView(APIView):
    def get(self, request, video_id):
        return Response(get_lyrics_for(video_id))


class SongRelatedView(APIView):
    def get(self, request, video_id):
        try:
            results = related_songs(video_id)
        except Exception:
            return Response({'results': []})
        songs = [upsert_song(data) for data in results]
        songs = [song for song in songs if song]
        return Response({'results': SongSerializer(songs, many=True).data})


class QueryTokenAuthentication(TokenAuthentication):
    def authenticate(self, request):
        token = request.query_params.get('token')
        if not token:
            return super().authenticate(request)
        return self.authenticate_credentials(token)


class SongStreamView(APIView):
    authentication_classes = [QueryTokenAuthentication]

    def get(self, request, video_id):
        try:
            info = get_stream_info(video_id)
        except exceptions.APIException:
            raise
        except Exception:
            return Response({'detail': 'Não foi possível extrair o áudio desta música'}, status=500)

        headers = dict(info.get('headers') or {})
        range_header = request.META.get('HTTP_RANGE')
        status_code = 200
        if range_header:
            headers['Range'] = range_header
            status_code = 206

        upstream = requests.get(info['url'], headers=headers, stream=True, timeout=30)
        upstream.raise_for_status()

        def generate():
            for chunk in upstream.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        from django.http import StreamingHttpResponse

        response = StreamingHttpResponse(
            generate(),
            content_type=upstream.headers.get('Content-Type', 'audio/webm'),
            status=status_code,
        )
        if upstream.headers.get('Content-Length'):
            response['Content-Length'] = upstream.headers['Content-Length']
        if range_header:
            response['Accept-Ranges'] = 'bytes'
            if upstream.headers.get('Content-Range'):
                response['Content-Range'] = upstream.headers['Content-Range']
        response['X-Accel-Buffering'] = 'no'
        return response


class FavoriteListView(APIView):
    def get(self, request):
        favorites = Favorite.objects.filter(user=request.user).select_related('song')
        return Response(FavoriteSerializer(favorites, many=True).data)


class FavoriteCreateView(APIView):
    def post(self, request):
        serializer = SongInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        song = upsert_song(serializer.validated_data)
        if not song:
            return Response({'detail': 'video_id é obrigatório'}, status=400)
        favorite, created = Favorite.objects.get_or_create(user=request.user, song=song)
        return Response(FavoriteSerializer(favorite).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class FavoriteDeleteView(APIView):
    def delete(self, request, pk):
        favorite = Favorite.objects.filter(user=request.user, pk=pk).first()
        if not favorite:
            return Response({'detail': 'Favorito não encontrado'}, status=404)
        favorite.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HomeStatsView(APIView):
    def get(self, request):
        from collections import Counter
        from core.models import Song, Playlist, HistoryEntry

        user = request.user
        result = {'em_alta': [], 'mais_ouvidas': [], 'estilos': []}

        try:
            result['em_alta'] = trending_songs(10)
        except Exception:
            result['em_alta'] = []

        if not result['em_alta']:
            seen = set()
            for h in (
                HistoryEntry.objects.filter(user=user)
                .select_related('song')
                .order_by('-played_at')[:20]
            ):
                if h.song.video_id in seen:
                    continue
                seen.add(h.song.video_id)
                result['em_alta'].append(
                    SongSerializer(h.song).data
                )
                if len(result['em_alta']) >= 10:
                    break

        counts = Counter(
            HistoryEntry.objects.filter(user=user).values_list('song_id', flat=True)
        )
        top_ids = [sid for sid, _ in counts.most_common(12)]
        songs_map = {s.id: s for s in Song.objects.filter(id__in=top_ids)}
        for sid, _ in counts.most_common(12):
            s = songs_map.get(sid)
            if s:
                result['mais_ouvidas'].append(SongSerializer(s).data)
            if len(result['mais_ouvidas']) >= 10:
                break

        try:
            result['estilos'] = genre_playlist_sections(6, 4)
        except Exception:
            result['estilos'] = []

        return Response(result)


class YTPlaylistDetailView(APIView):
    def get(self, request, browse_id):
        try:
            data = playlist_tracks(browse_id, limit=60)
        except Exception:
            return Response({'detail': 'Playlist não encontrada'}, status=404)
        if not data.get('tracks'):
            return Response({'detail': 'Playlist não encontrada'}, status=404)
        return Response(data)


class PlaylistListView(APIView):
    def get(self, request):
        playlists = Playlist.objects.filter(user=request.user)
        return Response(PlaylistSerializer(playlists, many=True).data)

    def post(self, request):
        serializer = PlaylistSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        playlist = Playlist.objects.create(
            user=request.user,
            name=serializer.validated_data['name'],
            description=serializer.validated_data.get('description', ''),
        )
        return Response(PlaylistSerializer(playlist).data, status=status.HTTP_201_CREATED)


class PlaylistDetailView(APIView):
    def get_playlist(self, request, pk):
        playlist = Playlist.objects.filter(user=request.user, pk=pk).first()
        if not playlist:
            return None
        return playlist

    def get(self, request, pk):
        playlist = self.get_playlist(request, pk)
        if not playlist:
            return Response({'detail': 'Playlist não encontrada'}, status=404)
        return Response(PlaylistDetailSerializer(playlist).data)

    def patch(self, request, pk):
        playlist = self.get_playlist(request, pk)
        if not playlist:
            return Response({'detail': 'Playlist não encontrada'}, status=404)
        name = request.data.get('name')
        description = request.data.get('description', playlist.description)
        if name is not None:
            playlist.name = name
        playlist.description = description
        playlist.save()
        return Response(PlaylistSerializer(playlist).data)

    def delete(self, request, pk):
        playlist = self.get_playlist(request, pk)
        if not playlist:
            return Response({'detail': 'Playlist não encontrada'}, status=404)
        playlist.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlaylistSongCreateView(APIView):
    def post(self, request, pk):
        playlist = Playlist.objects.filter(user=request.user, pk=pk).first()
        if not playlist:
            return Response({'detail': 'Playlist não encontrada'}, status=404)
        serializer = PlaylistSongInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        song = upsert_song(serializer.validated_data)
        if not song:
            return Response({'detail': 'video_id é obrigatório'}, status=400)
        position = serializer.validated_data.get('position')
        if position is None:
            last = playlist.songs.order_by('-position').first()
            position = (last.position + 1) if last else 0
        row, created = PlaylistSong.objects.get_or_create(
            playlist=playlist,
            song=song,
            defaults={'position': position},
        )
        return Response(PlaylistDetailSerializer(playlist).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class PlaylistSongDeleteView(APIView):
    def delete(self, request, pk, song_id):
        playlist = Playlist.objects.filter(user=request.user, pk=pk).first()
        if not playlist:
            return Response({'detail': 'Playlist não encontrada'}, status=404)
        deleted, _ = playlist.songs.filter(pk=song_id).delete()
        if not deleted:
            return Response({'detail': 'Música não encontrada na playlist'}, status=404)
        return Response(status=status.HTTP_204_NO_CONTENT)


class HistoryListView(APIView):
    def get(self, request):
        entries = HistoryEntry.objects.filter(user=request.user).select_related('song')[:50]
        return Response(HistorySerializer(entries, many=True).data)


class HistoryCreateView(APIView):
    def post(self, request):
        serializer = SongInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        song = upsert_song(serializer.validated_data)
        if not song:
            return Response({'detail': 'video_id é obrigatório'}, status=400)
        existing = (
            HistoryEntry.objects.filter(user=request.user, song=song)
            .order_by('-played_at')
            .first()
        )
        if existing:
            existing.played_at = django.utils.timezone.now()
            existing.save(update_fields=['played_at'])
            entry = existing
            HistoryEntry.objects.filter(user=request.user, song=song).exclude(pk=entry.pk).delete()
            response_status = status.HTTP_200_OK
        else:
            entry = HistoryEntry.objects.create(user=request.user, song=song)
            response_status = status.HTTP_201_CREATED
        return Response(HistorySerializer(entry).data, status=response_status)