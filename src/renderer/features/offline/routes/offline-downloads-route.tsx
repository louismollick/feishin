import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { OfflineDownloadsList } from '/@/renderer/features/now-playing/components/offline-downloads-list';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { SearchInput } from '/@/renderer/features/shared/components/search-input';
import { Group } from '/@/shared/components/group/group';

const OfflineDownloadsRoute = () => {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState<string | undefined>(undefined);

    return (
        <AnimatedPage>
            <Group h="65px" justify="end" px="1rem" py="1rem" w="100%">
                <SearchInput
                    enableHotkey={false}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t('action.search', { postProcess: 'sentenceCase' })}
                    value={searchTerm}
                />
            </Group>
            <OfflineDownloadsList searchTerm={searchTerm} />
        </AnimatedPage>
    );
};

const OfflineDownloadsRouteWithBoundary = () => (
    <PageErrorBoundary>
        <OfflineDownloadsRoute />
    </PageErrorBoundary>
);

export default OfflineDownloadsRouteWithBoundary;
