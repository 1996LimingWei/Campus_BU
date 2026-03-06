import { Languages, Loader } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    StyleProp,
    StyleSheet,
    Text,
    TextStyle,
    TouchableOpacity,
    View,
} from 'react-native';
import { AGENT_CONFIG } from '../../services/agent/config';
import { detectLanguage, translateText } from '../../services/translate';

interface TranslatableTextProps {
    text: string;
    style?: StyleProp<TextStyle>;
    numberOfLines?: number;
}

/**
 * Displays text with a small inline "Translate" button (like Xiaohongshu).
 * - Auto-detects content language and compares with current app language
 * - If content lang matches app lang → hides the translate button (no need to translate)
 * - Caches results so repeat taps are instant
 * - Hides the button gracefully if DeepSeek is not configured
 */
export const TranslatableText: React.FC<TranslatableTextProps> = ({
    text,
    style,
    numberOfLines,
}) => {
    const { i18n } = useTranslation();
    const [translated, setTranslated] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [showTranslated, setShowTranslated] = useState(false);

    if (!text?.trim()) {
        return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
    }

    // Language awareness: if content lang matches app lang, no translate button needed
    const contentLang = detectLanguage(text);
    const appIsZh = i18n.language.startsWith('zh');
    const contentIsZh = contentLang === 'zh';
    const sameLanguage = appIsZh === contentIsZh;

    if (!AGENT_CONFIG.DEEPSEEK_ENABLED || sameLanguage) {
        return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
    }

    const handleTranslate = async () => {
        if (showTranslated) {
            setShowTranslated(false);
            return;
        }
        if (translated) {
            setShowTranslated(true);
            return;
        }
        setLoading(true);
        setError(false);
        try {
            const result = await translateText(text);
            setTranslated(result);
            setShowTranslated(true);
        } catch (e) {
            console.error('[Translate] Error:', e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const displayText = showTranslated && translated ? translated : text;
    const btnLabel = loading ? '翻译中…' : error ? '翻译失败' : showTranslated ? '查看原文' : appIsZh ? '翻译' : 'Translate';

    return (
        <View>
            <Text style={style} numberOfLines={numberOfLines}>
                {displayText}
            </Text>
            <TouchableOpacity
                style={styles.btn}
                onPress={handleTranslate}
                disabled={loading}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
                {loading ? (
                    <Loader size={10} color="#6B7280" />
                ) : (
                    <Languages size={10} color={error ? '#EF4444' : showTranslated ? '#1E3A8A' : '#9CA3AF'} />
                )}
                <Text style={[styles.btnText, showTranslated && styles.btnTextActive, error && styles.btnTextError]}>
                    {btnLabel}
                </Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        marginTop: 4,
        alignSelf: 'flex-start',
    },
    btnText: {
        fontSize: 10,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    btnTextActive: {
        color: '#1E3A8A',
        fontWeight: '600',
    },
    btnTextError: {
        color: '#EF4444',
    },
});
