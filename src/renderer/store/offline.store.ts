import { createWithEqualityFn } from 'zustand/traditional';

import {
    downloadSongOffline,
    fetchSongsForOfflineCollection,
    getOfflineTrack,
    hasOfflineContent,
    loadOfflineLibrary,
    removeOfflineTrack,
} from '/@/renderer/features/offline/offline-service';
import { toast } from '/@/shared/components/toast/toast';
import {
    LibraryItem,
    OfflineDownloadJob,
    OfflineSourceRef,
    OfflineTrackRecord,
    Song,
} from '/@/shared/types/domain-types';

type OfflineState = {
    actions: {
        hydrate: () => Promise<void>;
        queueCollectionDownload: (args: {
            ids: string[];
            itemType: LibraryItem;
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

const toTrackRecordMap = (tracks: OfflineTrackRecord[]) =>
    Object.fromEntries(tracks.map((track) => [track.id, track])) as Record<
        string,
        OfflineTrackRecord
    >;

const toJobRecordMap = (jobs: OfflineDownloadJob[]) =>
    Object.fromEntries(jobs.map((job) => [job.id, job])) as Record<string, OfflineDownloadJob>;

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
        queueCollectionDownload: async ({ ids, itemType, serverId, songs }) => {
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

            for (const song of collectionSongs) {
                await get().actions.queueSongDownload(song, {
                    id: sourceType === LibraryItem.SONG ? song.id : ids[0] || song.id,
                    type: sourceType,
                });
            }

            toast.success({
                message: `Queued ${collectionSongs.length} song${collectionSongs.length === 1 ? '' : 's'} for offline download.`,
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
export const useOfflineTrackRecord = (serverId?: string, songId?: string) =>
    useOfflineStoreBase((state) => {
        if (!serverId || !songId) {
            return null;
        }

        return state.tracks[`${serverId}:${songId}`] || null;
    });
