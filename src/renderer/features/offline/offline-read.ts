import orderBy from 'lodash/orderBy';
import shuffle from 'lodash/shuffle';

import { queryClient } from '/@/renderer/lib/react-query';
import { useOfflineStoreBase } from '/@/renderer/store/offline.store';
import { sortSongList } from '/@/shared/api/utils';
import {
    Album,
    AlbumDetailQuery,
    AlbumArtist,
    AlbumArtistDetailQuery,
    AlbumArtistInfoResponse,
    AlbumArtistListQuery,
    AlbumArtistListResponse,
    AlbumArtistListSort,
    AlbumListQuery,
    AlbumListResponse,
    AlbumListSort,
    ArtistListQuery,
    ArtistListResponse,
    ArtistListSort,
    ExplicitStatus,
    Genre,
    GenreListQuery,
    GenreListResponse,
    LibraryItem,
    Playlist,
    PlaylistDetailQuery,
    PlaylistListQuery,
    PlaylistListResponse,
    PlaylistListSort,
    PlaylistSongListResponse,
    Song,
    SongListQuery,
    SongListResponse,
    SongListSort,
    SortOrder,
    TopSongListQuery,
    TopSongListResponse,
} from '/@/shared/types/domain-types';

import { offlineDb } from './offline-db';

const UNKNOWN_ALBUM = 'Unknown album';

const isOfflineReadEnabled = () => {
    const storeOfflineMode = useOfflineStoreBase.getState().offlineMode;

    if (storeOfflineMode) {
        return true;
    }

    if (typeof navigator === 'undefined') {
        return false;
    }

    return !navigator.onLine;
};

const paginateItems = <T>(items: T[], limit?: number, startIndex?: number) => {
    const normalizedStartIndex = startIndex ?? 0;

    if (limit === undefined || limit === -1) {
        return items.slice(normalizedStartIndex);
    }

    return items.slice(normalizedStartIndex, normalizedStartIndex + limit);
};

const normalizeSearchTerm = (value?: string) => value?.trim().toLowerCase() || '';

const uniqueById = <T extends { id: string }>(items: T[]) => {
    const seen = new Set<string>();

    return items.filter((item) => {
        if (seen.has(item.id)) {
            return false;
        }

        seen.add(item.id);
        return true;
    });
};

const getDownloadedSongs = async (serverId: string) => {
    const tracks = await offlineDb.tracks
        .where('[serverId+status]')
        .equals([serverId, 'downloaded'])
        .toArray()
        .catch(() => offlineDb.tracks.where('serverId').equals(serverId).toArray());

    return tracks.filter((track) => track.status === 'downloaded').map((track) => track.song);
};

const filterSongs = (songs: Song[], query: Partial<SongListQuery> = {}) => {
    const searchTerm = normalizeSearchTerm(query.searchTerm);

    return songs.filter((song) => {
        if (query.albumIds?.length && !query.albumIds.includes(song.albumId)) {
            return false;
        }

        if (query.albumArtistIds?.length) {
            const albumArtistIds = song.albumArtists.map((artist) => artist.id);
            if (!query.albumArtistIds.some((id) => albumArtistIds.includes(id))) {
                return false;
            }
        }

        if (query.artistIds?.length) {
            const artistIds = [...song.albumArtists, ...song.artists].map((artist) => artist.id);
            if (!query.artistIds.some((id) => artistIds.includes(id))) {
                return false;
            }
        }

        if (query.genreIds?.length) {
            const genreIds = song.genres.map((genre) => genre.id);
            if (!query.genreIds.some((id) => genreIds.includes(id))) {
                return false;
            }
        }

        if (query.favorite !== undefined && song.userFavorite !== query.favorite) {
            return false;
        }

        if (!searchTerm) {
            return true;
        }

        return [song.name, song.album, song.albumArtistName, song.artistName]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(searchTerm));
    });
};

const coerceSongSort = (sortBy?: SongListSort) => sortBy || SongListSort.ALBUM;

const buildSongListResponse = (songs: Song[], query: Partial<SongListQuery> = {}) => {
    const filteredSongs = filterSongs(songs, query);
    const sortedSongs = sortSongList(
        filteredSongs,
        coerceSongSort(query.sortBy),
        query.sortOrder || SortOrder.ASC,
    );

    return {
        items: paginateItems(sortedSongs, query.limit, query.startIndex),
        startIndex: query.startIndex ?? 0,
        totalRecordCount: sortedSongs.length,
    } satisfies SongListResponse;
};

const dedupeGenres = (songs: Song[]): Genre[] => {
    const genres = songs.flatMap((song) => song.genres);
    return uniqueById(genres);
};

const buildAlbumFromSongs = (songs: Song[]): Album => {
    const [firstSong] = songs;
    const totalDuration = songs.reduce((sum, song) => sum + (song.duration || 0), 0);
    const totalSize = songs.reduce((sum, song) => sum + (song.size || 0), 0);
    const totalPlayCount = songs.reduce((sum, song) => sum + (song.playCount || 0), 0);
    const ratings = songs
        .map((song) => song.userRating)
        .filter((rating): rating is number => rating !== null && rating !== undefined);

    return {
        _itemType: LibraryItem.ALBUM,
        _serverId: firstSong._serverId,
        _serverType: firstSong._serverType,
        albumArtistName: firstSong.albumArtistName,
        albumArtists: uniqueById(songs.flatMap((song) => song.albumArtists)),
        artists: uniqueById(songs.flatMap((song) => song.artists)),
        comment: null,
        createdAt: firstSong.createdAt,
        duration: totalDuration,
        explicitStatus: songs.some((song) => song.explicitStatus === ExplicitStatus.EXPLICIT)
            ? ExplicitStatus.EXPLICIT
            : firstSong.explicitStatus,
        genres: dedupeGenres(songs),
        id: firstSong.albumId,
        imageId: firstSong.imageId,
        imageUrl: firstSong.imageUrl,
        isCompilation: songs.some((song) => song.compilation),
        lastPlayedAt: null,
        mbzId: null,
        mbzReleaseGroupId: null,
        name: firstSong.album || UNKNOWN_ALBUM,
        originalDate: null,
        originalYear: null,
        participants: null,
        playCount: totalPlayCount,
        recordLabels: [],
        releaseDate: firstSong.releaseDate,
        releaseType: null,
        releaseTypes: [],
        releaseYear: firstSong.releaseYear,
        size: totalSize,
        songCount: songs.length,
        songs,
        sortName: firstSong.album || UNKNOWN_ALBUM,
        tags: null,
        updatedAt: firstSong.updatedAt,
        userFavorite: songs.some((song) => song.userFavorite),
        userRating: ratings.length > 0 ? Math.max(...ratings) : null,
        version: null,
    };
};

const buildAlbumList = (songs: Song[]) => {
    const groupedSongs = new Map<string, Song[]>();

    songs.forEach((song) => {
        const key = song.albumId;
        groupedSongs.set(key, [...(groupedSongs.get(key) || []), song]);
    });

    return Array.from(groupedSongs.values()).map(buildAlbumFromSongs);
};

const filterAlbums = (albums: Album[], query: Partial<AlbumListQuery> = {}) => {
    const searchTerm = normalizeSearchTerm(query.searchTerm);

    return albums.filter((album) => {
        if (query.artistIds?.length) {
            const artistIds = [...album.albumArtists, ...album.artists].map((artist) => artist.id);
            if (!query.artistIds.some((id) => artistIds.includes(id))) {
                return false;
            }
        }

        if (query.genreIds?.length) {
            const genreIds = album.genres.map((genre) => genre.id);
            if (!query.genreIds.some((id) => genreIds.includes(id))) {
                return false;
            }
        }

        if (query.favorite !== undefined && album.userFavorite !== query.favorite) {
            return false;
        }

        if (!searchTerm) {
            return true;
        }

        return [album.name, album.albumArtistName]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(searchTerm));
    });
};

const sortAlbums = (albums: Album[], sortBy = AlbumListSort.NAME, sortOrder = SortOrder.ASC) => {
    const order = sortOrder === SortOrder.ASC ? 'asc' : 'desc';

    switch (sortBy) {
        case AlbumListSort.ALBUM_ARTIST:
            return orderBy(albums, [(album) => album.albumArtistName.toLowerCase(), 'name'], [
                order,
                order,
            ]);
        case AlbumListSort.RANDOM:
            return shuffle(albums);
        case AlbumListSort.DURATION:
            return orderBy(albums, ['duration', 'name'], [order, order]);
        case AlbumListSort.FAVORITED:
            return orderBy(albums, ['userFavorite', 'name'], [order, order]);
        case AlbumListSort.PLAY_COUNT:
            return orderBy(albums, ['playCount', 'name'], [order, order]);
        case AlbumListSort.RECENTLY_ADDED:
            return orderBy(albums, ['createdAt', 'name'], [order, order]);
        case AlbumListSort.RELEASE_DATE:
        case AlbumListSort.YEAR:
            return orderBy(albums, ['releaseDate', 'releaseYear', 'name'], [
                order,
                order,
                order,
            ]);
        case AlbumListSort.SONG_COUNT:
            return orderBy(albums, ['songCount', 'name'], [order, order]);
        case AlbumListSort.RATING:
            return orderBy(albums, ['userRating', 'name'], [order, order]);
        case AlbumListSort.NAME:
        case AlbumListSort.SORT_NAME:
        default:
            return orderBy(albums, [(album) => album.name.toLowerCase()], [order]);
    }
};

const buildAlbumListResponse = (songs: Song[], query: Partial<AlbumListQuery> = {}) => {
    const albums = sortAlbums(
        filterAlbums(buildAlbumList(songs), query),
        query.sortBy,
        query.sortOrder,
    );

    return {
        items: paginateItems(albums, query.limit, query.startIndex),
        startIndex: query.startIndex ?? 0,
        totalRecordCount: albums.length,
    } satisfies AlbumListResponse;
};

const buildPlaylistSongResponse = (songs: Song[]) => {
    const sortedSongs = sortSongList(songs, SongListSort.ALBUM, SortOrder.ASC);

    return {
        items: sortedSongs,
        startIndex: 0,
        totalRecordCount: sortedSongs.length,
    } satisfies PlaylistSongListResponse;
};

const buildAlbumArtistFromSongs = (
    songs: Song[],
    artistId: string,
    itemType: LibraryItem.ALBUM_ARTIST | LibraryItem.ARTIST,
): AlbumArtist | null => {
    const artistSeed =
        songs.flatMap((song) => [...song.albumArtists, ...song.artists]).find((artist) => artist.id === artistId) ||
        songs[0]?.albumArtists[0] ||
        songs[0]?.artists[0];

    if (!artistSeed || songs.length === 0) {
        return null;
    }

    const ratings = songs
        .map((song) => song.userRating)
        .filter((rating): rating is number => rating !== null && rating !== undefined);

    return {
        _itemType: itemType,
        _serverId: songs[0]._serverId,
        _serverType: songs[0]._serverType,
        albumCount: new Set(songs.map((song) => song.albumId)).size,
        biography: null,
        duration: songs.reduce((sum, song) => sum + (song.duration || 0), 0),
        genres: dedupeGenres(songs),
        id: artistSeed.id,
        imageId: artistSeed.imageId,
        imageUrl: artistSeed.imageUrl,
        lastPlayedAt: null,
        mbz: null,
        name: artistSeed.name,
        playCount: songs.reduce((sum, song) => sum + (song.playCount || 0), 0),
        similarArtists: null,
        songCount: songs.length,
        userFavorite: songs.some((song) => song.userFavorite),
        userRating: ratings.length > 0 ? Math.max(...ratings) : null,
    } as AlbumArtist;
};

const buildArtists = (
    songs: Song[],
    itemType: LibraryItem.ALBUM_ARTIST | LibraryItem.ARTIST,
) => {
    const groupedSongs = new Map<string, Song[]>();

    songs.forEach((song) => {
        const relatedArtists = itemType === LibraryItem.ALBUM_ARTIST ? song.albumArtists : song.artists;

        relatedArtists.forEach((artist) => {
            groupedSongs.set(artist.id, [...(groupedSongs.get(artist.id) || []), song]);
        });
    });

    return Array.from(groupedSongs.entries())
        .map(([artistId, artistSongs]) => buildAlbumArtistFromSongs(artistSongs, artistId, itemType))
        .filter((artist): artist is AlbumArtist => Boolean(artist));
};

const filterArtists = (
    artists: AlbumArtist[],
    query: Partial<AlbumArtistListQuery | ArtistListQuery> = {},
) => {
    const searchTerm = normalizeSearchTerm(query.searchTerm);

    return artists.filter((artist) => {
        if (query.favorite !== undefined && artist.userFavorite !== query.favorite) {
            return false;
        }

        if (!searchTerm) {
            return true;
        }

        return artist.name.toLowerCase().includes(searchTerm);
    });
};

const sortArtists = (
    artists: AlbumArtist[],
    sortBy: AlbumArtistListSort | ArtistListSort = AlbumArtistListSort.NAME,
    sortOrder = SortOrder.ASC,
) => {
    const order = sortOrder === SortOrder.ASC ? 'asc' : 'desc';

    switch (sortBy) {
        case AlbumArtistListSort.ALBUM_COUNT:
        case ArtistListSort.ALBUM_COUNT:
            return orderBy(artists, ['albumCount', 'name'], [order, order]);
        case AlbumArtistListSort.DURATION:
        case ArtistListSort.DURATION:
            return orderBy(artists, ['duration', 'name'], [order, order]);
        case AlbumArtistListSort.FAVORITED:
        case ArtistListSort.FAVORITED:
            return orderBy(artists, ['userFavorite', 'name'], [order, order]);
        case AlbumArtistListSort.PLAY_COUNT:
        case ArtistListSort.PLAY_COUNT:
            return orderBy(artists, ['playCount', 'name'], [order, order]);
        case AlbumArtistListSort.SONG_COUNT:
        case ArtistListSort.SONG_COUNT:
            return orderBy(artists, ['songCount', 'name'], [order, order]);
        case AlbumArtistListSort.RATING:
        case ArtistListSort.RATING:
            return orderBy(artists, ['userRating', 'name'], [order, order]);
        case AlbumArtistListSort.NAME:
        case ArtistListSort.NAME:
        default:
            return orderBy(artists, [(artist) => artist.name.toLowerCase()], [order]);
    }
};

const buildArtistListResponse = (
    artists: AlbumArtist[],
    query: Partial<AlbumArtistListQuery | ArtistListQuery> = {},
) => {
    const filteredArtists = sortArtists(
        filterArtists(artists, query),
        query.sortBy,
        query.sortOrder,
    );

    return {
        items: paginateItems(filteredArtists, query.limit, query.startIndex),
        startIndex: query.startIndex ?? 0,
        totalRecordCount: filteredArtists.length,
    };
};

const buildGenreListResponse = (songs: Song[], query: Partial<GenreListQuery> = {}) => {
    const groupedSongs = new Map<string, Song[]>();
    const genreMap = new Map<string, Genre>();

    songs.forEach((song) => {
        song.genres.forEach((genre) => {
            groupedSongs.set(genre.id, [...(groupedSongs.get(genre.id) || []), song]);
            genreMap.set(genre.id, genre);
        });
    });

    const genres = Array.from(groupedSongs.entries()).map(([genreId, genreSongs]) => {
        const genre = genreMap.get(genreId)!;

        return {
            ...genre,
            albumCount: new Set(genreSongs.map((song) => song.albumId)).size,
            songCount: genreSongs.length,
        };
    });

    const searchTerm = normalizeSearchTerm(query.searchTerm);
    const filteredGenres = genres.filter((genre) =>
        searchTerm ? genre.name.toLowerCase().includes(searchTerm) : true,
    );
    const sortedGenres = orderBy(
        filteredGenres,
        [(genre) => genre.name.toLowerCase()],
        [query.sortOrder === SortOrder.DESC ? 'desc' : 'asc'],
    );

    return {
        items: paginateItems(sortedGenres, query.limit, query.startIndex),
        startIndex: query.startIndex ?? 0,
        totalRecordCount: sortedGenres.length,
    } satisfies GenreListResponse;
};

const filterCachedPlaylist = async (serverId: string, playlistId: string) => {
    const playlistRecord = await offlineDb.playlists.get(`${serverId}:${playlistId}`);

    if (!playlistRecord) {
        return null;
    }

    const downloadedSongs = await getDownloadedSongs(serverId);
    const downloadedSongIds = new Set(downloadedSongs.map((song) => song.id));
    const items = playlistRecord.songIds
        .map((songId) => downloadedSongs.find((song) => song.id === songId))
        .filter((song): song is Song => Boolean(song) && downloadedSongIds.has(song!.id));

    return {
        playlist: {
            ...playlistRecord.playlist,
            duration: items.reduce((sum, song) => sum + (song.duration || 0), 0),
            size: items.reduce((sum, song) => sum + (song.size || 0), 0),
            songCount: items.length,
        },
        songs: items,
    };
};

export const resolveOfflineQuery = async <T>(
    queryKey: readonly unknown[],
    fallback: () => Promise<T>,
) => {
    const cached = queryClient.getQueryData<T>(queryKey);

    if (cached !== undefined) {
        return cached;
    }

    return fallback();
};

export const shouldUseOfflineQuery = () => isOfflineReadEnabled();

export const getOfflineSongList = async (serverId: string, query: Partial<SongListQuery> = {}) => {
    const songs = await getDownloadedSongs(serverId);
    return buildSongListResponse(songs, query);
};

export const getOfflineSongDetail = async (serverId: string, songId: string) => {
    const songs = await getDownloadedSongs(serverId);
    return songs.find((song) => song.id === songId) || null;
};

export const getOfflineAlbumList = async (serverId: string, query: Partial<AlbumListQuery> = {}) => {
    const songs = await getDownloadedSongs(serverId);
    return buildAlbumListResponse(songs, query);
};

export const getOfflineAlbumDetail = async (serverId: string, query: AlbumDetailQuery) => {
    const songs = await getDownloadedSongs(serverId);
    const albumSongs = songs.filter((song) => song.albumId === query.id);

    if (albumSongs.length === 0) {
        throw new Error('Album is not available offline.');
    }

    return buildAlbumFromSongs(sortSongList(albumSongs, SongListSort.ALBUM, SortOrder.ASC));
};

export const getOfflinePlaylistList = async (
    serverId: string,
    query: Partial<PlaylistListQuery> = {},
) => {
    const playlistRecords = await offlineDb.playlists.where('serverId').equals(serverId).toArray();
    const searchTerm = normalizeSearchTerm(query.searchTerm);
    const downloadedSongs = await getDownloadedSongs(serverId);
    const downloadedSongIds = new Set(downloadedSongs.map((song) => song.id));

    const playlists = playlistRecords
        .reduce<Playlist[]>((acc, record) => {
            const playlistSongs = record.songIds.filter((songId) => downloadedSongIds.has(songId));

            if (playlistSongs.length === 0) {
                return acc;
            }

            acc.push({
                ...record.playlist,
                duration: downloadedSongs
                    .filter((song) => playlistSongs.includes(song.id))
                    .reduce((sum, song) => sum + (song.duration || 0), 0),
                size: downloadedSongs
                    .filter((song) => playlistSongs.includes(song.id))
                    .reduce((sum, song) => sum + (song.size || 0), 0),
                songCount: playlistSongs.length,
            });

            return acc;
        }, [])
        .filter((playlist) =>
            searchTerm ? playlist.name.toLowerCase().includes(searchTerm) : true,
        );

    const order = query.sortOrder === SortOrder.DESC ? 'desc' : 'asc';
    const sortedPlaylists = orderBy(
        playlists,
        [
            query.sortBy === PlaylistListSort.DURATION
                ? 'duration'
                : query.sortBy === PlaylistListSort.OWNER
                  ? 'owner'
                  : query.sortBy === PlaylistListSort.PUBLIC
                    ? 'public'
                    : query.sortBy === PlaylistListSort.SONG_COUNT
                      ? 'songCount'
                      : 'name',
            'name',
        ],
        [order, order],
    );

    return {
        items: paginateItems(sortedPlaylists, query.limit, query.startIndex),
        startIndex: query.startIndex ?? 0,
        totalRecordCount: sortedPlaylists.length,
    } satisfies PlaylistListResponse;
};

export const getOfflinePlaylistDetail = async (
    serverId: string,
    query: PlaylistDetailQuery,
) => {
    const result = await filterCachedPlaylist(serverId, query.id);

    if (!result) {
        throw new Error('Playlist is not available offline.');
    }

    return result.playlist;
};

export const getOfflinePlaylistSongList = async (serverId: string, playlistId: string) => {
    const result = await filterCachedPlaylist(serverId, playlistId);

    return buildPlaylistSongResponse(result?.songs || []);
};

export const getOfflineAlbumArtistDetail = async (
    serverId: string,
    query: AlbumArtistDetailQuery,
) => {
    const songs = await getDownloadedSongs(serverId);
    const artistSongs = songs.filter((song) =>
        [...song.albumArtists, ...song.artists].some((artist) => artist.id === query.id),
    );

    const detail = buildAlbumArtistFromSongs(artistSongs, query.id, LibraryItem.ALBUM_ARTIST);

    if (!detail) {
        throw new Error('Artist is not available offline.');
    }

    return detail;
};

export const getOfflineAlbumArtistInfo = async (
    serverId: string,
    query: AlbumArtistDetailQuery,
) => {
    const detail = await getOfflineAlbumArtistDetail(serverId, query);

    return {
        biography: null,
        imageUrl: detail?.imageUrl || null,
        similarArtists: null,
    } satisfies AlbumArtistInfoResponse;
};

export const getOfflineAlbumArtistList = async (
    serverId: string,
    query: Partial<AlbumArtistListQuery> = {},
) => {
    const songs = await getDownloadedSongs(serverId);
    const artists = buildArtists(songs, LibraryItem.ALBUM_ARTIST);
    return buildArtistListResponse(artists, query) satisfies AlbumArtistListResponse;
};

export const getOfflineArtistList = async (
    serverId: string,
    query: Partial<ArtistListQuery> = {},
) => {
    const songs = await getDownloadedSongs(serverId);
    const artists = buildArtists(songs, LibraryItem.ARTIST);

    return buildArtistListResponse(artists, query) satisfies ArtistListResponse;
};

export const getOfflineTopSongs = async (serverId: string, query: TopSongListQuery) => {
    const songs = await getDownloadedSongs(serverId);
    const artistSongs = songs.filter((song) =>
        [...song.albumArtists, ...song.artists].some((artist) => artist.id === query.artistId),
    );

    const items = sortSongList(artistSongs, SongListSort.PLAY_COUNT, SortOrder.DESC).slice(
        0,
        query.limit ?? artistSongs.length,
    );

    return {
        items,
        startIndex: 0,
        totalRecordCount: items.length,
    } satisfies TopSongListResponse;
};

export const getOfflineGenreList = async (serverId: string, query: Partial<GenreListQuery> = {}) => {
    const songs = await getDownloadedSongs(serverId);
    return buildGenreListResponse(songs, query);
};

export const getOfflineItemList = async (
    serverId: string,
    itemType: LibraryItem,
    query: Record<string, any> = {},
) => {
    switch (itemType) {
        case LibraryItem.ALBUM:
            return getOfflineAlbumList(serverId, query);
        case LibraryItem.ALBUM_ARTIST:
            return getOfflineAlbumArtistList(serverId, query);
        case LibraryItem.ARTIST:
            return getOfflineArtistList(serverId, query);
        case LibraryItem.GENRE:
            return getOfflineGenreList(serverId, query);
        case LibraryItem.PLAYLIST:
            return getOfflinePlaylistList(serverId, query);
        case LibraryItem.SONG:
            return getOfflineSongList(serverId, query);
        default:
            return {
                items: [],
                startIndex: query.startIndex ?? 0,
                totalRecordCount: 0,
            };
    }
};

export const getOfflineSongsForItem = async (
    serverId: string,
    ids: string[],
    itemType: LibraryItem,
) => {
    switch (itemType) {
        case LibraryItem.ALBUM:
            return (await getOfflineSongList(serverId, { albumIds: ids, limit: -1, startIndex: 0 }))
                .items;
        case LibraryItem.ALBUM_ARTIST:
        case LibraryItem.ARTIST:
            return (
                await getOfflineSongList(serverId, {
                    artistIds: ids,
                    limit: -1,
                    sortBy: SongListSort.ALBUM,
                    sortOrder: SortOrder.ASC,
                    startIndex: 0,
                })
            ).items;
        case LibraryItem.GENRE:
            return (
                await getOfflineSongList(serverId, {
                    genreIds: ids,
                    limit: -1,
                    sortBy: SongListSort.GENRE,
                    sortOrder: SortOrder.ASC,
                    startIndex: 0,
                })
            ).items;
        case LibraryItem.PLAYLIST: {
            const lists = await Promise.all(ids.map((id) => getOfflinePlaylistSongList(serverId, id)));
            return lists.flatMap((list) => list.items);
        }
        case LibraryItem.PLAYLIST_SONG:
        case LibraryItem.QUEUE_SONG:
        case LibraryItem.SONG:
            return (await getOfflineSongList(serverId, { limit: -1, startIndex: 0 })).items.filter(
                (song) => ids.includes(song.id),
            );
        default:
            return [];
    }
};

export const getOfflineSongsForListQuery = async (
    serverId: string,
    itemType: LibraryItem,
    listQuery: Record<string, any>,
) => {
    switch (itemType) {
        case LibraryItem.PLAYLIST: {
            const playlists = await getOfflinePlaylistList(serverId, {
                ...listQuery,
                limit: -1,
                startIndex: 0,
            });

            return getOfflineSongsForItem(
                serverId,
                playlists.items.map((playlist) => playlist.id),
                LibraryItem.PLAYLIST,
            );
        }
        case LibraryItem.ALBUM:
        case LibraryItem.ALBUM_ARTIST:
        case LibraryItem.ARTIST:
        case LibraryItem.GENRE:
        case LibraryItem.SONG:
            return (await getOfflineSongList(serverId, { ...listQuery, limit: -1, startIndex: 0 }))
                .items;
        default:
            return [];
    }
};
