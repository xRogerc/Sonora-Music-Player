from django.contrib import admin

from .models import Favorite, HistoryEntry, Playlist, PlaylistSong, Song

admin.site.register(Song)
admin.site.register(Favorite)
admin.site.register(Playlist)
admin.site.register(PlaylistSong)
admin.site.register(HistoryEntry)