import { queryOptions } from '@tanstack/react-query';

import { api } from '/@/renderer/api';
import { controller } from '/@/renderer/api/controller';
import { queryKeys } from '/@/renderer/api/query-keys';
import { getOptimizedListCount } from '/@/renderer/api/utils-list-count';
import {
    getOfflineAlbumDetail,
    getOfflineAlbumList,
    resolveOfflineQuery,
    shouldUseOfflineQuery,
} from '/@/renderer/features/offline/offline-read';
import { QueryHookArgs } from '/@/renderer/lib/react-query';
import { AlbumDetailQuery, AlbumListQuery, ListCountQuery } from '/@/shared/types/domain-types';

export const albumQueries = {
    detail: (args: QueryHookArgs<AlbumDetailQuery>) => {
        const queryKey = queryKeys.albums.detail(args.serverId, args.query);

        return queryOptions({
            queryFn: async ({ signal }) => {
                if (shouldUseOfflineQuery()) {
                    return resolveOfflineQuery(queryKey, () =>
                        getOfflineAlbumDetail(args.serverId, args.query),
                    );
                }

                return api.controller.getAlbumDetail({
                    apiClientProps: { serverId: args.serverId, signal },
                    query: args.query,
                });
            },
            queryKey,
            ...args.options,
        });
    },
    list: (args: QueryHookArgs<AlbumListQuery>) => {
        const queryKey = queryKeys.albums.list(
            args.serverId,
            args.query,
            args.query?.artistIds?.length === 1 ? args.query?.artistIds[0] : undefined,
        );

        return queryOptions({
            queryFn: async ({ signal }) => {
                if (shouldUseOfflineQuery()) {
                    return resolveOfflineQuery(queryKey, () =>
                        getOfflineAlbumList(args.serverId, args.query),
                    );
                }

                return api.controller.getAlbumList({
                    apiClientProps: { serverId: args.serverId, signal },
                    query: args.query,
                });
            },
            queryKey,
            ...args.options,
        });
    },
    listCount: (args: QueryHookArgs<ListCountQuery<AlbumListQuery>>) => {
        return queryOptions({
            gcTime: 1000 * 60 * 60,
            queryFn: async ({ client, signal }) => {
                if (shouldUseOfflineQuery()) {
                    const response = await getOfflineAlbumList(args.serverId, args.query);
                    return response.totalRecordCount ?? 0;
                }

                const optimizedCount = await getOptimizedListCount<
                    ListCountQuery<AlbumListQuery>,
                    AlbumListQuery,
                    { totalRecordCount: null | number }
                >({
                    client,
                    listQueryFn: controller.getAlbumList,
                    listQueryKeyFn: (serverId, query) => queryKeys.albums.list(serverId, query),
                    query: args.query,
                    serverId: args.serverId,
                    signal,
                });

                if (optimizedCount !== null) {
                    return optimizedCount;
                }

                return api.controller.getAlbumListCount({
                    apiClientProps: { serverId: args.serverId, signal },
                    query: args.query,
                });
            },
            queryKey: queryKeys.albums.count(
                args.serverId,
                args.query,
                args.query?.artistIds?.length === 1 ? args.query?.artistIds[0] : undefined,
            ),
            staleTime: 1000 * 60 * 60,
            ...args.options,
        });
    },
};
