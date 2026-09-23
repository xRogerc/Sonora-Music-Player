from django.urls import path

from . import views

urlpatterns = [
    path('auth/register/', views.RegisterView.as_view()),
    path('auth/login/', views.LoginView.as_view()),
    path('auth/logout/', views.LogoutView.as_view()),
    path('auth/me/', views.MeView.as_view()),
    path('search/', views.SearchView.as_view()),
    path('songs/<str:video_id>/stream/', views.SongStreamView.as_view()),
    path('songs/<str:video_id>/related/', views.SongRelatedView.as_view()),
    path('songs/<str:video_id>/lyrics/', views.SongLyricsView.as_view()),
    path('yt/playlists/<str:browse_id>/', views.YTPlaylistDetailView.as_view()),
    path('favorites/', views.FavoriteListView.as_view()),
    path('favorites/create/', views.FavoriteCreateView.as_view()),
    path('favorites/<int:pk>/', views.FavoriteDeleteView.as_view()),
    path('playlists/', views.PlaylistListView.as_view()),
    path('playlists/<int:pk>/', views.PlaylistDetailView.as_view()),
    path('playlists/<int:pk>/songs/', views.PlaylistSongCreateView.as_view()),
    path('playlists/<int:pk>/songs/<int:song_id>/', views.PlaylistSongDeleteView.as_view()),
    path('history/', views.HistoryListView.as_view()),
    path('history/create/', views.HistoryCreateView.as_view()),
    path('home/', views.HomeStatsView.as_view()),
]