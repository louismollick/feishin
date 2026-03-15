import styles from './yomitan-dictionary-panel.module.css';

import {
    YomitanDictionarySummary,
    YomitanLookupEntry,
    YomitanToken,
} from '/@/renderer/features/yomitan/core';
import { YomitanResults } from '/@/renderer/features/yomitan/yomitan-results';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Text } from '/@/shared/components/text/text';

interface YomitanDictionaryPanelProps {
    dictionaries: YomitanDictionarySummary[];
    entries: YomitanLookupEntry[];
    error?: null | string;
    loading: boolean;
    onClose: () => void;
    token: YomitanToken;
}

export const YomitanDictionaryPanel = ({
    dictionaries,
    entries,
    error,
    loading,
    onClose,
    token,
}: YomitanDictionaryPanelProps) => {
    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <div className={styles.headerText}>
                    <Text fw={600}>{token.text}</Text>
                    {token.reading ? (
                        <Text isMuted size="sm">
                            {token.reading}
                        </Text>
                    ) : null}
                </div>
                <ActionIcon icon="x" onClick={onClose} size="sm" variant="subtle" />
            </div>
            <div className={styles.body}>
                {loading ? (
                    <Spinner container />
                ) : error ? (
                    <div className={styles.emptyState}>
                        <Text isMuted ta="center">
                            {error}
                        </Text>
                    </div>
                ) : entries.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Text isMuted ta="center">
                            No dictionary entries found for this token.
                        </Text>
                    </div>
                ) : (
                    <YomitanResults dictionaryInfo={dictionaries} entries={entries} />
                )}
            </div>
        </div>
    );
};
