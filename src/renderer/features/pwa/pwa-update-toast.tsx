import isElectron from 'is-electron';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

const PWA_UPDATE_TOAST_ID = 'pwa-update-ready';

export const PwaUpdateToast = () => {
    const { t } = useTranslation();
    const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

    useEffect(() => {
        if (isElectron() || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
            return;
        }

        let isDisposed = false;

        const reloadApp = () => {
            toast.hide(PWA_UPDATE_TOAST_ID);
            window.location.reload();
        };

        const requestActivation = () => {
            const waitingWorker = registrationRef.current?.waiting;

            if (waitingWorker) {
                waitingWorker.postMessage({ type: 'SKIP_WAITING' });
                return;
            }

            reloadApp();
        };

        const showUpdateToast = () => {
            toast.show({
                autoClose: false,
                id: PWA_UPDATE_TOAST_ID,
                message: (
                    <Stack gap="xs">
                        <Text size="sm">
                            {t('common.pwaUpdateReady', {
                                defaultValue:
                                    'A new version of the app is ready. Reload to update.',
                            })}
                        </Text>
                        <Group justify="flex-end">
                            <Button onClick={requestActivation} size="compact-xs" variant="filled">
                                {t('common.reload', { postProcess: 'sentenceCase' })}
                            </Button>
                        </Group>
                    </Stack>
                ),
                type: 'info',
            });
        };

        const handleControllerChange = () => {
            if (!isDisposed) {
                showUpdateToast();
            }
        };

        const attachRegistration = (registration: ServiceWorkerRegistration) => {
            registrationRef.current = registration;

            if (registration.waiting) {
                showUpdateToast();
            }

            registration.addEventListener('updatefound', () => {
                const installingWorker = registration.installing;

                if (!installingWorker) {
                    return;
                }

                installingWorker.addEventListener('statechange', () => {
                    if (
                        installingWorker.state === 'installed' &&
                        navigator.serviceWorker.controller
                    ) {
                        showUpdateToast();
                    }
                });
            });
        };

        const checkForUpdates = () => {
            void registrationRef.current?.update().catch(() => undefined);
        };

        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

        void navigator.serviceWorker.getRegistration().then((registration) => {
            if (isDisposed) {
                return;
            }

            if (registration) {
                attachRegistration(registration);
                checkForUpdates();
                return;
            }

            void navigator.serviceWorker.ready.then((readyRegistration) => {
                if (isDisposed) {
                    return;
                }

                attachRegistration(readyRegistration);
                checkForUpdates();
            });
        });

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkForUpdates();
            }
        };

        window.addEventListener('focus', checkForUpdates);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            isDisposed = true;
            navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
            window.removeEventListener('focus', checkForUpdates);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [t]);

    return null;
};
