import Dexie, { Table } from 'dexie';

import {
    OfflineArtworkRecord,
    OfflineDownloadJob,
    OfflineLyricsRecord,
    OfflinePlaylistRecord,
    OfflineTrackRecord,
} from '/@/shared/types/domain-types';

export const getOfflineTrackId = (serverId: string, songId: string) => `${serverId}:${songId}`;
export const getOfflineArtworkId = (serverId: string, imageId: string) => `${serverId}:${imageId}`;
export const getOfflineLyricsId = (serverId: string, songId: string) => `${serverId}:${songId}`;
export const getOfflineJobId = (serverId: string, songId: string) => `${serverId}:${songId}`;
export const getOfflinePlaylistId = (serverId: string, playlistId: string) =>
    `${serverId}:${playlistId}`;

type OfflineKeyValueRecord = {
    id: string;
    value: unknown;
};

class OfflineDatabase extends Dexie {
    artworks!: Table<OfflineArtworkRecord, string>;
    jobs!: Table<OfflineDownloadJob, string>;
    kv!: Table<OfflineKeyValueRecord, string>;
    lyrics!: Table<OfflineLyricsRecord, string>;
    playlists!: Table<OfflinePlaylistRecord, string>;
    tracks!: Table<OfflineTrackRecord, string>;

    constructor() {
        super('feishin-offline');

        this.version(2).stores({
            artworks: '&id, serverId, imageId, downloadedAt',
            jobs: '&id, serverId, songId, status, updatedAt',
            kv: '&id',
            lyrics: '&id, serverId, songId, downloadedAt',
            playlists: '&id, serverId, playlistId, downloadedAt',
            tracks: '&id, serverId, songId, status, downloadedAt, imageId',
        });
    }
}

export const offlineDb = new OfflineDatabase();
