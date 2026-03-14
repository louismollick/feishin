import Dexie, { Table } from 'dexie';

import {
    OfflineArtworkRecord,
    OfflineDownloadJob,
    OfflineLyricsRecord,
    OfflineTrackRecord,
} from '/@/shared/types/domain-types';

export const getOfflineTrackId = (serverId: string, songId: string) => `${serverId}:${songId}`;
export const getOfflineArtworkId = (serverId: string, imageId: string) => `${serverId}:${imageId}`;
export const getOfflineLyricsId = (serverId: string, songId: string) => `${serverId}:${songId}`;
export const getOfflineJobId = (serverId: string, songId: string) => `${serverId}:${songId}`;

class OfflineDatabase extends Dexie {
    artworks!: Table<OfflineArtworkRecord, string>;
    jobs!: Table<OfflineDownloadJob, string>;
    lyrics!: Table<OfflineLyricsRecord, string>;
    tracks!: Table<OfflineTrackRecord, string>;

    constructor() {
        super('feishin-offline');

        this.version(1).stores({
            artworks: '&id, serverId, imageId, downloadedAt',
            jobs: '&id, serverId, songId, status, updatedAt',
            lyrics: '&id, serverId, songId, downloadedAt',
            tracks: '&id, serverId, songId, status, downloadedAt, imageId',
        });
    }
}

export const offlineDb = new OfflineDatabase();
