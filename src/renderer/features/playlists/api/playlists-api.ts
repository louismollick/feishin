import { queryOptions } from '@tanstack/react-query';

import { api } from '/@/renderer/api';
import { queryKeys } from '/@/renderer/api/query-keys';
import {
    getOfflinePlaylistDetail,
    getOfflinePlaylistList,
    getOfflinePlaylistSongList,
    resolveOfflineQuery,
    shouldUseOfflineQuery,
} from '/@/renderer/features/offline/offline-read';
import { QueryHookArgs } from '/@/renderer/lib/react-query';
import {
    ListCountQuery,
    PlaylistDetailQuery,
    PlaylistListQuery,
    PlaylistSongListQuery,
} from '/@/shared/types/domain-types';

export const playlistsQueries = {
    detail: (args: QueryHookArgs<PlaylistDetailQuery>) => {
        const queryKey = queryKeys.playlists.detail(args.serverId, args.query.id, args.query);

        return queryOptions({
            queryFn: async ({ signal }) => {
                if (shouldUseOfflineQuery()) {
                    return resolveOfflineQuery(queryKey, () =>
                        getOfflinePlaylistDetail(args.serverId, args.query),
                    );
                }

                return api.controller.getPlaylistDetail({
                    apiClientProps: { serverId: args.serverId, signal },
                    query: args.query,
                });
            },
            queryKey,
            ...args.options,
        });
    },
    list: (args: QueryHookArgs<PlaylistListQuery>) => {
        const queryKey = queryKeys.playlists.list(args.serverId || '', args.query);

        return queryOptions({
            gcTime: 1000 * 60 * 60,
            queryFn: async ({ signal }) => {
                if (shouldUseOfflineQuery()) {
                    return resolveOfflineQuery(queryKey, () =>
                        getOfflinePlaylistList(args.serverId || '', args.query),
                    );
                }

                return api.controller.getPlaylistList({
                    apiClientProps: { serverId: args.serverId, signal },
                    query: args.query,
                });
            },
            queryKey,
            ...args.options,
        });
    },
    listCount: (args: QueryHookArgs<ListCountQuery<PlaylistListQuery>>) => {
        return queryOptions({
            gcTime: 1000 * 60 * 60,
            queryFn: async ({ signal }) => {
                if (shouldUseOfflineQuery()) {
                    const response = await getOfflinePlaylistList(args.serverId || '', args.query);
                    return response.totalRecordCount ?? 0;
                }

                return api.controller.getPlaylistListCount({
                    apiClientProps: { serverId: args.serverId, signal },
                    query: args.query,
                });
            },
            queryKey: queryKeys.playlists.count(
                args.serverId || '',
                Object.keys(args.query).length === 0 ? undefined : args.query,
            ),
            staleTime: 1000 * 60 * 60,
            ...args.options,
        });
    },
    songList: (args: QueryHookArgs<PlaylistSongListQuery>) => {
        const queryKey = queryKeys.playlists.songList(args.serverId || '', args.query.id);

        return queryOptions({
            queryFn: async ({ signal }) => {
                if (shouldUseOfflineQuery()) {
                    return resolveOfflineQuery(queryKey, () =>
                        getOfflinePlaylistSongList(args.serverId || '', args.query.id),
                    );
                }

                return api.controller.getPlaylistSongList({
                    apiClientProps: { serverId: args.serverId, signal },
                    query: args.query,
                });
            },
            queryKey,
            ...args.options,
        });
    },
};
