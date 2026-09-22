from django.conf import settings
from django.db import models


class Song(models.Model):
    video_id = models.CharField(max_length=64, unique=True)
    title = models.CharField(max_length=500)
    artists = models.CharField(max_length=500, blank=True, default='')
    album = models.CharField(max_length=500, blank=True, default='')
    duration = models.IntegerField(default=0, blank=True)
    thumbnails = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return f'{self.title} - {self.artists}'

    @property
    def thumbnail(self):
        if not self.thumbnails:
            return ''
        thumb = self.thumbnails[-1]
        return thumb if isinstance(thumb, str) else (thumb.get('url', '') if isinstance(thumb, dict) else '')


class Favorite(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='favorites')
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='favorited_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'song')
        ordering = ['-created_at']


class Playlist(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='playlists')
    name = models.CharField(max_length=200)
    description = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class PlaylistSong(models.Model):
    playlist = models.ForeignKey(Playlist, on_delete=models.CASCADE, related_name='songs')
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='in_playlists')
    position = models.IntegerField(default=0)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['position']


class HistoryEntry(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='history')
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='in_history')
    played_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-played_at']