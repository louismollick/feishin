import { createWithEqualityFn } from 'zustand/traditional';

import {
    downloadSongOffline,
    fetchAllSongsForOfflineQuery,
    fetchSongsForOfflineCollection,
    getOfflineTrack,
    hasOfflineContent,
    loadOfflineLibrary,
    mergeOfflineTrackSourceRef,
    removeOfflineTrack,
} from '/@/renderer/features/offline/offline-service';
import { toast } from '/@/shared/components/toast/toast';
import {
    LibraryItem,
    OfflineDownloadJob,
    OfflineSourceRef,
    OfflineTrackRecord,
    Song,
    SongListQuery,
} from '/@/shared/types/domain-types';

type OfflineState = {
    actions: {
        hydrate: () => Promise<void>;
        queueAllTracksDownload: (args: {
            filters?: Omit<Partial<SongListQuery>, 'startIndex'>;
            retryFailed?: boolean;
            serverId: string;
        }) => Promise<void>;
        queueCollectionDownload: (args: {
            ids: string[];
            itemType: LibraryItem;
            retryFailed?: boolean;
            serverId: string;
            songs?: Song[];
        }) => Promise<void>;
        queueSongDownload: (song: Song, sourceRef?: OfflineSourceRef) => Promise<void>;
        removeTrack: (serverId: string, songId: string) => Promise<void>;
        retryTrack: (serverId: string, songId: string) => Promise<void>;
        setOfflineMode: (offlineMode: boolean) => Promise<void>;
    };
    hydrated: boolean;
    jobs: Record<string, OfflineDownloadJob>;
    offlineMode: boolean;
    tracks: Record<string, OfflineTrackRecord>;
};

type QueueOfflineSummary = {
    queued: number;
    retryQueued: number;
    skippedAlreadyDownloaded: number;
    skippedAlreadyQueuedOrDownloading: number;
    skippedFailed: number;
    totalScanned: number;
};

const toTrackRecordMap = (tracks: OfflineTrackRecord[]) =>
    Object.fromEntries(tracks.map((track) => [track.id, track])) as Record<
        string,
        OfflineTrackRecord
    >;

const toJobRecordMap = (jobs: OfflineDownloadJob[]) =>
    Object.fromEntries(jobs.map((job) => [job.id, job])) as Record<string, OfflineDownloadJob>;

const getOfflineTrackStateKey = (song: Song) => `${song._serverId}:${song.id}`;

export const useOfflineStoreBase = createWithEqualityFn<OfflineState>()((set, get) => ({
    actions: {
        hydrate: async () => {
            const { jobs, tracks } = await loadOfflineLibrary();

            set({
                hydrated: true,
                jobs: toJobRecordMap(jobs),
                tracks: toTrackRecordMap(tracks),
            });
        },
        queueAllTracksDownload: async ({ filters, retryFailed = false, serverId }) => {
            const { songs, totalScanned } = await fetchAllSongsForOfflineQuery({
                query: {
                    ...(filters || {}),
                },
                serverId,
            });

            const summary = await queueSongsForOfflineDownload({
                get,
                retryFailed,
                songs,
                sourceRefResolver: (song) => ({ id: song.id, type: LibraryItem.SONG }),
            });

            const resolvedSummary = {
                ...summary,
                totalScanned,
            };

            if (songs.length === 0) {
                toast.warn({
                    message: 'No songs available to download offline.',
                });
                return;
            }

            toast.success({
                message: formatQueueSummaryMessage(resolvedSummary),
            });
        },
        queueCollectionDownload: async ({
            ids,
            itemType,
            retryFailed = false,
            serverId,
            songs,
        }) => {
            let sourceType: OfflineSourceRef['type'];

            switch (itemType) {
                case LibraryItem.ALBUM:
                case LibraryItem.ALBUM_ARTIST:
                case LibraryItem.ARTIST:
                case LibraryItem.FOLDER:
                case LibraryItem.GENRE:
                case LibraryItem.PLAYLIST:
                case LibraryItem.SONG:
                    sourceType = itemType;
                    break;
                default:
                    sourceType = LibraryItem.SONG;
                    break;
            }
            const collectionSongs =
                songs && songs.length > 0
                    ? songs
                    : await fetchSongsForOfflineCollection({ ids, itemType, serverId });

            if (collectionSongs.length === 0) {
                toast.warn({
                    message: 'No songs available to download offline.',
                });
                return;
            }

            const summary = await queueSongsForOfflineDownload({
                get,
                retryFailed,
                songs: collectionSongs,
                sourceRefResolver: (song) => ({
                    id: sourceType === LibraryItem.SONG ? song.id : ids[0] || song.id,
                    type: sourceType,
                }),
            });

            toast.success({
                message: formatQueueSummaryMessage(summary),
            });
        },
        queueSongDownload: async (song, sourceRef) => {
            await downloadSongOffline({
                onJobProgress: (job) => {
                    set((state) => ({
                        jobs: {
                            ...state.jobs,
                            [job.id]: job,
                        },
                        tracks: {
                            ...state.tracks,
                            [job.id]: state.tracks[job.id]
                                ? {
                                      ...state.tracks[job.id],
                                      error: job.error,
                                      song: job.song,
                                      songId: job.songId,
                                      status: job.status,
                                  }
                                : {
                                      artworkId: null,
                                      audioBlob: null,
                                      downloadedAt: null,
                                      error: job.error,
                                      id: job.id,
                                      imageId: job.song.imageId,
                                      lyricsId: null,
                                      mimeType: null,
                                      serverId: job.serverId,
                                      sizeBytes: 0,
                                      song: job.song,
                                      songId: job.songId,
                                      sourceRefs: [],
                                      status: job.status,
                                  },
                        },
                    }));
                },
                song,
                sourceRef: sourceRef || { id: song.id, type: LibraryItem.SONG },
            })
                .then((track) => {
                    if (!track) {
                        return;
                    }

                    set((state) => ({
                        tracks: {
                            ...state.tracks,
                            [track.id]: track,
                        },
                    }));
                })
                .catch((error) => {
                    toast.error({
                        message:
                            error instanceof Error ? error.message : 'Failed to download song.',
                    });
                });
        },
        removeTrack: async (serverId, songId) => {
            await removeOfflineTrack(serverId, songId);
            await get().actions.hydrate();
        },
        retryTrack: async (serverId, songId) => {
            const track = await getOfflineTrack(serverId, songId);

            if (!track) {
                return;
            }

            await get().actions.queueSongDownload(track.song, {
                id: songId,
                type: LibraryItem.SONG,
            });
        },
        setOfflineMode: async (offlineMode) => {
            const canEnable = offlineMode ? await hasOfflineContent() : false;
            set({ offlineMode: offlineMode && canEnable });
        },
    },
    hydrated: false,
    jobs: {},
    offlineMode: false,
    tracks: {},
}));

const formatQueueSummaryMessage = (summary: QueueOfflineSummary) => {
    const parts = [
        `Scanned ${summary.totalScanned} track${summary.totalScanned === 1 ? '' : 's'}.`,
        `Queued ${summary.queued} new track${summary.queued === 1 ? '' : 's'}.`,
        `Skipped ${summary.skippedAlreadyDownloaded} already downloaded.`,
        `Skipped ${summary.skippedAlreadyQueuedOrDownloading} already queued/downloading.`,
    ];

    if (summary.retryQueued > 0) {
        parts.push(`Retried ${summary.retryQueued} previously failed.`);
    } else if (summary.skippedFailed > 0) {
        parts.push(`Skipped ${summary.skippedFailed} failed (retry not enabled).`);
    }

    return parts.join(' ');
};

const queueSongsForOfflineDownload = async (args: {
    get: () => OfflineState;
    retryFailed: boolean;
    songs: Song[];
    sourceRefResolver: (song: Song) => OfflineSourceRef;
}): Promise<QueueOfflineSummary> => {
    const { get, retryFailed, songs, sourceRefResolver } = args;
    const dedupeMap = new Map<string, Song>();

    for (const song of songs) {
        dedupeMap.set(getOfflineTrackStateKey(song), song);
    }

    const summary: QueueOfflineSummary = {
        queued: 0,
        retryQueued: 0,
        skippedAlreadyDownloaded: 0,
        skippedAlreadyQueuedOrDownloading: 0,
        skippedFailed: 0,
        totalScanned: songs.length,
    };

    for (const song of dedupeMap.values()) {
        const sourceRef = sourceRefResolver(song);
        const track = get().tracks[getOfflineTrackStateKey(song)];

        if (track?.status === 'downloaded') {
            summary.skippedAlreadyDownloaded += 1;
            await mergeOfflineTrackSourceRef(song, sourceRef);
            continue;
        }

        if (track?.status === 'queued' || track?.status === 'downloading') {
            summary.skippedAlreadyQueuedOrDownloading += 1;
            await mergeOfflineTrackSourceRef(song, sourceRef);
            continue;
        }

        if (track?.status === 'failed' && !retryFailed) {
            summary.skippedFailed += 1;
            await mergeOfflineTrackSourceRef(song, sourceRef);
            continue;
        }

        if (track?.status === 'failed' && retryFailed) {
            summary.retryQueued += 1;
        }

        await get().actions.queueSongDownload(song, sourceRef);
        summary.queued += 1;
    }

    return summary;
};

export const useOfflineHydrated = () => useOfflineStoreBase((state) => state.hydrated);
export const useOfflineMode = () => useOfflineStoreBase((state) => state.offlineMode);
export const useOfflineActions = () => useOfflineStoreBase((state) => state.actions);
export const useOfflineJobs = () => useOfflineStoreBase((state) => state.jobs);
export const useOfflineTracksMap = () => useOfflineStoreBase((state) => state.tracks);
export const useOfflineDownloadedTracks = () =>
    useOfflineStoreBase((state) =>
        Object.values(state.tracks)
            .filter((track) => track.status === 'downloaded')
            .sort((a, b) => {
                const left = a.downloadedAt || '';
                const right = b.downloadedAt || '';
                return right.localeCompare(left);
            }),
    );

export const useOfflineTrackList = () =>
    useOfflineStoreBase((state) => Object.values(state.tracks));
export const useOfflineInProgressTracks = () =>
    useOfflineStoreBase((state) =>
        Object.values(state.tracks)
            .filter((track) => track.status === 'queued' || track.status === 'downloading')
            .sort((a, b) => a.id.localeCompare(b.id)),
    );
export const useOfflineTrackRecord = (serverId?: string, songId?: string) =>
    useOfflineStoreBase((state) => {
        if (!serverId || !songId) {
            return null;
        }

        return state.tracks[`${serverId}:${songId}`] || null;
    });
