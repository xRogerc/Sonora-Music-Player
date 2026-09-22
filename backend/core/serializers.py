from django.contrib.auth.models import User
from rest_framework import serializers

from .models import Favorite, HistoryEntry, Playlist, PlaylistSong, Song


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=4)

    class Meta:
        model = User
        fields = ('username', 'password')

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class SongSerializer(serializers.ModelSerializer):
    thumbnail_url = serializers.CharField(source='thumbnail', read_only=True)

    class Meta:
        model = Song
        fields = ('video_id', 'title', 'artists', 'album', 'duration', 'thumbnails', 'thumbnail_url')


class SongInputSerializer(serializers.Serializer):
    video_id = serializers.CharField()
    title = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    artists = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    album = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    duration = serializers.IntegerField(required=False, allow_null=True, default=0)
    thumbnails = serializers.ListField(required=False, allow_null=True, default=list)


class FavoriteSerializer(serializers.ModelSerializer):
    song = SongSerializer(read_only=True)

    class Meta:
        model = Favorite
        fields = ('id', 'song', 'created_at')


class PlaylistSerializer(serializers.ModelSerializer):
    song_count = serializers.IntegerField(source='songs.count', read_only=True)

    class Meta:
        model = Playlist
        fields = ('id', 'name', 'description', 'song_count', 'created_at')


class PlaylistDetailSerializer(serializers.ModelSerializer):
    songs = serializers.SerializerMethodField()

    class Meta:
        model = Playlist
        fields = ('id', 'name', 'description', 'songs', 'created_at')

    def get_songs(self, obj):
        rows = obj.songs.select_related('song').all()
        return [
            {
                'id': row.id,
                'position': row.position,
                'song': SongSerializer(row.song).data,
            }
            for row in rows
        ]


class PlaylistSongInputSerializer(SongInputSerializer):
    position = serializers.IntegerField(required=False, default=None)


class HistorySerializer(serializers.ModelSerializer):
    song = SongSerializer(read_only=True)
    played_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = HistoryEntry
        fields = ('id', 'song', 'played_at')