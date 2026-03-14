import { useEffect } from 'react';

import { useOfflineActions } from '/@/renderer/store';

export const OfflineBootstrap = () => {
    const { hydrate, setOfflineMode } = useOfflineActions();

    useEffect(() => {
        hydrate().catch(console.error);
        setOfflineMode(!navigator.onLine).catch(console.error);

        const handleOnline = () => {
            setOfflineMode(false).catch(console.error);
        };

        const handleOffline = () => {
            setOfflineMode(true).catch(console.error);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [hydrate, setOfflineMode]);

    return null;
};
