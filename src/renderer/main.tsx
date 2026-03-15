import {
    PersistedClient,
    Persister,
    PersistQueryClientProvider,
} from '@tanstack/react-query-persist-client';
import { createRoot } from 'react-dom/client';

import { App } from '/@/renderer/app';
import { offlineDb } from '/@/renderer/features/offline/offline-db';
import { queryClient } from '/@/renderer/lib/react-query';

const QUERY_PERSIST_KEY = 'react-query-cache';
const PERSISTED_QUERY_NAMESPACES = new Set([
    'albumArtists',
    'albums',
    'artists',
    'genres',
    'playlists',
    'song',
    'songs',
]);
const PERSISTED_QUERY_OPERATIONS = new Set([
    'detail',
    'favoriteSongs',
    'info',
    'lyrics',
    'select',
    'songList',
    'topSongs',
]);

function createDexiePersister(id: string) {
    return {
        persistClient: async (client: PersistedClient) => {
            await offlineDb.kv.put({ id, value: client });
        },
        removeClient: async () => {
            await offlineDb.kv.delete(id);
        },
        restoreClient: async () => {
            const record = await offlineDb.kv.get(id);
            return (record?.value as PersistedClient | undefined) ?? undefined;
        },
    } as Persister;
}

const indexedDbPersister = createDexiePersister(QUERY_PERSIST_KEY);

createRoot(document.getElementById('root')!).render(
    <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
            buster: 'feishin',
            dehydrateOptions: {
                shouldDehydrateQuery: (query) => {
                    const isSuccess = query.state.status === 'success';
                    const hasPersistedNamespace = query.queryKey.some(
                        (segment) =>
                            typeof segment === 'string' &&
                            PERSISTED_QUERY_NAMESPACES.has(segment),
                    );
                    const hasPersistedOperation = query.queryKey.some(
                        (segment) =>
                            typeof segment === 'string' &&
                            PERSISTED_QUERY_OPERATIONS.has(segment),
                    );
                    const isTransientPlayerQuery = query.queryKey.includes('player');

                    return (
                        isSuccess &&
                        hasPersistedNamespace &&
                        hasPersistedOperation &&
                        !isTransientPlayerQuery
                    );
                },
            },
            hydrateOptions: {
                defaultOptions: {
                    queries: {
                        gcTime: Infinity,
                    },
                },
            },
            maxAge: Infinity,
            persister: indexedDbPersister,
        }}
    >
        <App />
    </PersistQueryClientProvider>,
);
