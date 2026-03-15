import { api } from '/@/renderer/api';
import { queryKeys } from '/@/renderer/api/query-keys';
import { folderQueries } from '/@/renderer/features/folders/api/folder-api';
import { lyricsQueries } from '/@/renderer/features/lyrics/api/lyrics-api';
import {
    getOfflineArtworkId,
    getOfflineJobId,
    getOfflineLyricsId,
    getOfflinePlaylistId,
    getOfflineTrackId,
    offlineDb,
} from '/@/renderer/features/offline/offline-db';
import { queryClient } from '/@/renderer/lib/react-query';
import {
    LibraryItem,
    LyricsResponse,
    OfflineArtworkRecord,
    OfflineDownloadJob,
    OfflineLyricsRecord,
    OfflinePlaylistRecord,
    OfflineSourceRef,
    OfflineTrackRecord,
    QueueSong,
    Song,
    SongListQuery,
    SongListResponse,
    SongListSort,
    SortOrder,
} from '/@/shared/types/domain-types';

const OFFLINE_ARTWORK_SIZE = 1024;
const artworkObjectUrlCache = new Map<string, string>();

type DownloadProgressCallback = (job: OfflineDownloadJob) => Promise<void> | void;

const uniqueSourceRefs = (refs: OfflineSourceRef[]) => {
    const seen = new Set<string>();
    return refs.filter((ref) => {
        const key = `${ref.type}:${ref.id}`;
        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
};

const fetchSongList = async (serverId: string, query: SongListQuery) => {
    return queryClient.fetchQuery({
        gcTime: 1000 * 60,
        queryFn: ({ signal }) =>
            api.controller.getSongList({
                apiClientProps: { serverId, signal },
                query,
            }),
        queryKey: queryKeys.songs.list(serverId, query),
        staleTime: 1000 * 60,
    });
};

const getAlbumSongsById = async (serverId: string, ids: string[]) => {
    return fetchSongList(serverId, {
        albumIds: ids,
        sortBy: SongListSort.ALBUM,
        sortOrder: SortOrder.ASC,
        startIndex: 0,
    });
};

const getAlbumArtistSongsById = async (serverId: string, ids: string[]) => {
    return fetchSongList(serverId, {
        albumArtistIds: ids,
        sortBy: SongListSort.ALBUM_ARTIST,
        sortOrder: SortOrder.ASC,
        startIndex: 0,
    });
};

const getArtistSongsById = async (serverId: string, ids: string[]) => {
    return fetchSongList(serverId, {
        artistIds: ids,
        sortBy: SongListSort.ALBUM,
        sortOrder: SortOrder.ASC,
        startIndex: 0,
    });
};

const getGenreSongsById = async (serverId: string, ids: string[]) => {
    const data: SongListResponse = { items: [], startIndex: 0, totalRecordCount: 0 };

    for (const genreId of ids) {
        const result = await fetchSongList(serverId, {
            genreIds: [genreId],
            sortBy: SongListSort.GENRE,
            sortOrder: SortOrder.ASC,
            startIndex: 0,
        });

        data.items.push(...result.items);
        data.totalRecordCount = (data.totalRecordCount || 0) + (result.totalRecordCount || 0);
    }

    return data;
};

const getPlaylistSongsById = async (serverId: string, ids: string[]) => {
    const allSongs: Song[] = [];

    for (const id of ids) {
        await ensureOfflinePlaylistRecord(serverId, id).catch(() => null);

        const response = await queryClient.fetchQuery({
            gcTime: 1000 * 60,
            queryFn: ({ signal }) =>
                api.controller.getPlaylistSongList({
                    apiClientProps: { serverId, signal },
                    query: { id },
                }),
            queryKey: queryKeys.playlists.songList(serverId, id),
            staleTime: 1000 * 60,
        });

        allSongs.push(...response.items);
    }

    return {
        items: allSongs,
        startIndex: 0,
        totalRecordCount: allSongs.length,
    } satisfies SongListResponse;
};

const ensureOfflinePlaylistRecord = async (serverId: string, playlistId: string) => {
    const id = getOfflinePlaylistId(serverId, playlistId);
    const existing = await offlineDb.playlists.get(id);

    if (existing) {
        return existing;
    }

    const [playlist, playlistSongs] = await Promise.all([
        queryClient.fetchQuery({
            gcTime: 1000 * 60,
            queryFn: ({ signal }) =>
                api.controller.getPlaylistDetail({
                    apiClientProps: { serverId, signal },
                    query: { id: playlistId },
                }),
            queryKey: queryKeys.playlists.detail(serverId, playlistId, { id: playlistId }),
            staleTime: 1000 * 60,
        }),
        queryClient.fetchQuery({
            gcTime: 1000 * 60,
            queryFn: ({ signal }) =>
                api.controller.getPlaylistSongList({
                    apiClientProps: { serverId, signal },
                    query: { id: playlistId },
                }),
            queryKey: queryKeys.playlists.songList(serverId, playlistId),
            staleTime: 1000 * 60,
        }),
    ]);

    const record: OfflinePlaylistRecord = {
        downloadedAt: getNowIso(),
        id,
        playlist,
        playlistId,
        serverId,
        songIds: playlistSongs.items.map((song) => song.id),
    };

    await offlineDb.playlists.put(record);
    return record;
};

const getSongsByFolder = async (serverId: string, ids: string[]) => {
    const songs: Song[] = [];

    const collectFolderSongs = async (folderId: string): Promise<void> => {
        const folder = await queryClient.fetchQuery({
            ...folderQueries.folder({
                query: {
                    id: folderId,
                    sortBy: SongListSort.ID,
                    sortOrder: SortOrder.ASC,
                },
                serverId,
            }),
            gcTime: 0,
            staleTime: 0,
        });

        songs.push(...(folder.children?.songs || []));

        for (const child of folder.children?.folders || []) {
            await collectFolderSongs(child.id);
        }
    };

    for (const id of ids) {
        await collectFolderSongs(id);
    }

    return {
        items: songs,
        startIndex: 0,
        totalRecordCount: songs.length,
    } satisfies SongListResponse;
};

export const fetchSongsForOfflineCollection = async (args: {
    ids: string[];
    itemType: LibraryItem;
    serverId: string;
}) => {
    const { ids, itemType, serverId } = args;

    switch (itemType) {
        case LibraryItem.ALBUM:
            return (await getAlbumSongsById(serverId, ids)).items;
        case LibraryItem.ALBUM_ARTIST:
            return (await getAlbumArtistSongsById(serverId, ids)).items;
        case LibraryItem.ARTIST:
            return (await getArtistSongsById(serverId, ids)).items;
        case LibraryItem.FOLDER:
            return (await getSongsByFolder(serverId, ids)).items;
        case LibraryItem.GENRE:
            return (await getGenreSongsById(serverId, ids)).items;
        case LibraryItem.PLAYLIST:
            return (await getPlaylistSongsById(serverId, ids)).items;
        case LibraryItem.SONG: {
            const songs = await Promise.all(
                ids.map(async (id) => {
                    const song = await queryClient.fetchQuery({
                        gcTime: 1000 * 60,
                        queryFn: ({ signal }) =>
                            api.controller.getSongDetail({
                                apiClientProps: { serverId, signal },
                                query: { id },
                            }),
                        queryKey: queryKeys.songs.detail(serverId, { id }),
                        staleTime: 1000 * 60,
                    });

                    return song;
                }),
            );

            return songs;
        }
        default:
            return [];
    }
};

const getNowIso = () => new Date().toISOString();

const upsertJob = async (
    song: Song,
    status: OfflineDownloadJob['status'],
    progress: number,
    error: null | string,
) => {
    const job: OfflineDownloadJob = {
        createdAt: getNowIso(),
        error,
        id: getOfflineJobId(song._serverId, song.id),
        progress,
        serverId: song._serverId,
        song,
        songId: song.id,
        status,
        updatedAt: getNowIso(),
    };

    const existing = await offlineDb.jobs.get(job.id);
    const persistedJob = existing
        ? {
              ...existing,
              error,
              progress,
              song,
              status,
              updatedAt: getNowIso(),
          }
        : job;

    await offlineDb.jobs.put(persistedJob);
    return persistedJob;
};

const fetchBlobWithProgress = async (
    url: string,
    onProgress?: (progress: number) => Promise<void> | void,
) => {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    if (!response.body) {
        const blob = await response.blob();
        await onProgress?.(100);
        return { blob, mimeType: response.headers.get('content-type') };
    }

    const reader = response.body.getReader();
    const contentLength = Number(response.headers.get('content-length') || 0);
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    while (true) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        if (value) {
            chunks.push(value);
            receivedLength += value.length;

            if (contentLength > 0) {
                await onProgress?.(
                    Math.min(99, Math.round((receivedLength / contentLength) * 100)),
                );
            }
        }
    }

    const blob = new Blob(chunks, {
        type: response.headers.get('content-type') || 'application/octet-stream',
    });

    await onProgress?.(100);

    return {
        blob,
        mimeType: response.headers.get('content-type'),
    };
};

const ensureArtworkRecord = async (song: Song) => {
    if (!song.imageId) {
        return null;
    }

    const artworkId = getOfflineArtworkId(song._serverId, song.imageId);
    const existing = await offlineDb.artworks.get(artworkId);

    if (existing) {
        return existing;
    }

    const imageRequest = api.controller.getImageRequest({
        apiClientProps: { serverId: song._serverId },
        query: {
            id: song.imageId,
            itemType: LibraryItem.SONG,
            size: OFFLINE_ARTWORK_SIZE,
        },
    });

    if (!imageRequest?.url) {
        return null;
    }

    const { blob, mimeType } = await fetchBlobWithProgress(imageRequest.url);
    const record: OfflineArtworkRecord = {
        blob,
        downloadedAt: getNowIso(),
        id: artworkId,
        imageId: song.imageId,
        mimeType,
        serverId: song._serverId,
        sizeBytes: blob.size,
    };

    await offlineDb.artworks.put(record);
    return record;
};

const ensureLyricsRecord = async (song: Song) => {
    const lyricsId = getOfflineLyricsId(song._serverId, song.id);
    const existing = await offlineDb.lyrics.get(lyricsId);

    if (existing) {
        return existing;
    }

    const result = await queryClient
        .fetchQuery(
            lyricsQueries.songLyrics(
                {
                    options: { gcTime: Infinity, staleTime: Infinity },
                    query: { songId: song.id },
                    serverId: song._serverId,
                },
                song as QueueSong,
            ),
        )
        .catch(() => null);

    if (!result?.selected) {
        return null;
    }

    const { lyrics, ...metadata } = result.selected;
    const record: OfflineLyricsRecord = {
        downloadedAt: getNowIso(),
        id: lyricsId,
        lyrics: lyrics as LyricsResponse,
        metadata,
        serverId: song._serverId,
        songId: song.id,
    };

    await offlineDb.lyrics.put(record);
    return record;
};

export const requestOfflineStoragePersistence = async () => {
    if (!('storage' in navigator) || !navigator.storage?.persist) {
        return false;
    }

    return navigator.storage.persist().catch(() => false);
};

export const loadOfflineLibrary = async () => {
    const [tracks, jobs] = await Promise.all([
        offlineDb.tracks.toArray(),
        offlineDb.jobs.toArray(),
    ]);

    return { jobs, tracks };
};

export const hasOfflineContent = async () => {
    const count = await offlineDb.tracks.where('status').equals('downloaded').count();
    return count > 0;
};

export const getOfflineTrack = async (serverId: string, songId: string) => {
    return offlineDb.tracks.get(getOfflineTrackId(serverId, songId));
};

export const getOfflineArtworkRecord = async (serverId: string, imageId: string) => {
    return offlineDb.artworks.get(getOfflineArtworkId(serverId, imageId));
};

export const getOfflineLyricsRecord = async (serverId: string, songId: string) => {
    return offlineDb.lyrics.get(getOfflineLyricsId(serverId, songId));
};

export const getOfflineArtworkUrl = async (serverId: string, imageId: string) => {
    const artworkId = getOfflineArtworkId(serverId, imageId);
    const cached = artworkObjectUrlCache.get(artworkId);

    if (cached) {
        return cached;
    }

    const artwork = await getOfflineArtworkRecord(serverId, imageId);

    if (!artwork?.blob) {
        return null;
    }

    const objectUrl = URL.createObjectURL(artwork.blob);
    artworkObjectUrlCache.set(artworkId, objectUrl);
    return objectUrl;
};

export const resolvePlayableSource = async (song: QueueSong | Song) => {
    const record = await getOfflineTrack(song._serverId, song.id);

    if (!record?.audioBlob || record.status !== 'downloaded') {
        return null;
    }

    const objectUrl = URL.createObjectURL(record.audioBlob);

    return {
        revoke: () => URL.revokeObjectURL(objectUrl),
        url: objectUrl,
    };
};

export const removeOfflineTrack = async (serverId: string, songId: string) => {
    const trackId = getOfflineTrackId(serverId, songId);
    const track = await offlineDb.tracks.get(trackId);

    if (!track) {
        return;
    }

    await offlineDb.tracks.delete(trackId);
    await offlineDb.jobs.delete(getOfflineJobId(serverId, songId));
    await offlineDb.lyrics.delete(getOfflineLyricsId(serverId, songId));

    if (track.imageId) {
        const remainingTrackCount = await offlineDb.tracks
            .where('imageId')
            .equals(track.imageId)
            .count();

        if (remainingTrackCount <= 1) {
            const artworkId = getOfflineArtworkId(serverId, track.imageId);
            const cachedUrl = artworkObjectUrlCache.get(artworkId);
            if (cachedUrl) {
                URL.revokeObjectURL(cachedUrl);
                artworkObjectUrlCache.delete(artworkId);
            }

            await offlineDb.artworks.delete(artworkId);
        }
    }
};

export const downloadSongOffline = async (args: {
    onJobProgress?: DownloadProgressCallback;
    song: Song;
    sourceRef: OfflineSourceRef;
}) => {
    const { onJobProgress, song, sourceRef } = args;
    const trackId = getOfflineTrackId(song._serverId, song.id);
    const existingTrack = await offlineDb.tracks.get(trackId);
    const mergedSourceRefs = uniqueSourceRefs([...(existingTrack?.sourceRefs || []), sourceRef]);

    if (existingTrack?.status === 'downloaded' && existingTrack.audioBlob) {
        await offlineDb.tracks.put({
            ...existingTrack,
            song,
            sourceRefs: mergedSourceRefs,
        });

        const completeJob = await upsertJob(song, 'downloaded', 100, null);
        await onJobProgress?.(completeJob);
        return offlineDb.tracks.get(trackId);
    }

    const queuedJob = await upsertJob(song, 'queued', 0, null);
    await onJobProgress?.(queuedJob);
    await requestOfflineStoragePersistence();

    try {
        const downloadingJob = await upsertJob(song, 'downloading', 0, null);
        await onJobProgress?.(downloadingJob);

        const downloadUrl = api.controller.getDownloadUrl({
            apiClientProps: { serverId: song._serverId },
            query: { id: song.id },
        });

        const { blob, mimeType } = await fetchBlobWithProgress(downloadUrl, async (progress) => {
            const progressJob = await upsertJob(song, 'downloading', progress, null);
            await onJobProgress?.(progressJob);
        });

        const [artworkRecord, lyricsRecord] = await Promise.all([
            ensureArtworkRecord(song).catch(() => null),
            ensureLyricsRecord(song).catch(() => null),
        ]);

        const trackRecord: OfflineTrackRecord = {
            artworkId: artworkRecord?.id || null,
            audioBlob: blob,
            downloadedAt: getNowIso(),
            error: null,
            id: trackId,
            imageId: song.imageId,
            lyricsId: lyricsRecord?.id || null,
            mimeType,
            serverId: song._serverId,
            sizeBytes: blob.size,
            song,
            songId: song.id,
            sourceRefs: mergedSourceRefs,
            status: 'downloaded',
        };

        await offlineDb.tracks.put(trackRecord);
        const completeJob = await upsertJob(song, 'downloaded', 100, null);
        await onJobProgress?.(completeJob);
        return trackRecord;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Download failed';
        const failedTrack: OfflineTrackRecord = {
            artworkId: existingTrack?.artworkId || null,
            audioBlob: null,
            downloadedAt: existingTrack?.downloadedAt || null,
            error: message,
            id: trackId,
            imageId: song.imageId,
            lyricsId: existingTrack?.lyricsId || null,
            mimeType: existingTrack?.mimeType || null,
            serverId: song._serverId,
            sizeBytes: existingTrack?.sizeBytes || 0,
            song,
            songId: song.id,
            sourceRefs: mergedSourceRefs,
            status: 'failed',
        };

        await offlineDb.tracks.put(failedTrack);
        const failedJob = await upsertJob(song, 'failed', 0, message);
        await onJobProgress?.(failedJob);
        throw error;
    }
};
