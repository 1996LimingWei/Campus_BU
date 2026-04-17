import { Info, ShieldCheck } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

interface SafetyNoticeProps {
    variant?: 'full' | 'compact';
    showAnonymousWarning?: boolean;
}

export const SafetyNotice: React.FC<SafetyNoticeProps> = ({
    variant = 'full',
    showAnonymousWarning = false,
}) => {
    const { t } = useTranslation();

    if (variant === 'compact') {
        return (
            <View style={styles.compactContainer}>
                <View style={styles.compactRow}>
                    <ShieldCheck size={13} color="#6B7280" />
                    <Text style={styles.compactText}>
                        {t('safety.compact_notice')}
                    </Text>
                </View>
                {showAnonymousWarning && (
                    <View style={styles.compactRow}>
                        <Info size={12} color="#92400E" />
                        <Text style={styles.anonymousCompactText}>
                            {t('safety.anonymous_warning')}
                        </Text>
                    </View>
                )}
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <ShieldCheck size={16} color="#1E40AF" />
                <Text style={styles.title}>{t('safety.title')}</Text>
            </View>
            <View style={styles.rulesList}>
                <Text style={styles.ruleItem}>
                    {'\u2022  '}{t('safety.rule_filter')}
                </Text>
                <Text style={styles.ruleItem}>
                    {'\u2022  '}{t('safety.rule_report')}
                </Text>
                <Text style={styles.ruleItem}>
                    {'\u2022  '}{t('safety.rule_block')}
                </Text>
            </View>
            {showAnonymousWarning && (
                <View style={styles.anonymousWarning}>
                    <Info size={13} color="#92400E" />
                    <Text style={styles.anonymousText}>
                        {t('safety.anonymous_warning')}
                    </Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#EFF6FF',
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    title: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1E40AF',
    },
    rulesList: {
        gap: 3,
    },
    ruleItem: {
        fontSize: 12,
        color: '#374151',
        lineHeight: 18,
    },
    anonymousWarning: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FFFBEB',
        borderRadius: 6,
        padding: 8,
        marginTop: 8,
        gap: 6,
    },
    anonymousText: {
        flex: 1,
        fontSize: 11,
        color: '#92400E',
        lineHeight: 16,
    },
    compactContainer: {
        gap: 4,
        marginBottom: 8,
    },
    compactRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    compactText: {
        flex: 1,
        fontSize: 11,
        color: '#6B7280',
        lineHeight: 16,
    },
    anonymousCompactText: {
        flex: 1,
        fontSize: 11,
        color: '#92400E',
        lineHeight: 16,
    },
});
