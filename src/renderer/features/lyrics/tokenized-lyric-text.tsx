import styles from './lyric-line.module.css';

import { YomitanToken } from '/@/renderer/features/yomitan/core';

interface TokenizedLyricTextProps {
    onSelectToken?: (token: YomitanToken) => void;
    tokens: YomitanToken[];
}

export const TokenizedLyricText = ({ onSelectToken, tokens }: TokenizedLyricTextProps) => {
    return (
        <span className={styles.tokenContainer}>
            {tokens.map((token, index) =>
                token.selectable && onSelectToken ? (
                    <button
                        className={styles.tokenButton}
                        key={`${token.text}-${index}`}
                        onClick={(event) => {
                            event.stopPropagation();
                            onSelectToken(token);
                        }}
                        type="button"
                    >
                        {token.text}
                    </button>
                ) : (
                    <span className={styles.tokenText} key={`${token.text}-${index}`}>
                        {token.text}
                    </span>
                ),
            )}
        </span>
    );
};
