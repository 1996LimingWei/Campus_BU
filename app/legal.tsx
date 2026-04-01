import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ShieldCheck } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LEGAL_CONTENT, LegalTab, normalizeLanguage, TAB_LABELS } from './legalContent';

export default function LegalScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ tab?: string }>();
    const { i18n } = useTranslation();
    const language = normalizeLanguage(i18n.language);
    const initialTab = params.tab === 'terms' ? params.tab : 'privacy';
    const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

    const content = useMemo(() => LEGAL_CONTENT[language][activeTab], [activeTab, language]);
    const labels = TAB_LABELS[language];

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Pressable style={styles.backButton} onPress={() => router.back()}>
                    <ChevronLeft size={22} color="#0F172A" />
                </Pressable>
                <View style={styles.headerTitleWrap}>
                    <ShieldCheck size={18} color="#0F766E" />
                    <Text style={styles.headerTitle}>{content.title}</Text>
                </View>
                <View style={styles.headerSpacer} />
            </View>

            <View style={styles.tabRow}>
                {(['privacy', 'terms'] as LegalTab[]).map((tab) => (
                    <Pressable
                        key={tab}
                        style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                            {labels[tab]}
                        </Text>
                    </Pressable>
                ))}
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.intro}>{content.intro}</Text>
                {content.sections.map((section) => (
                    <View key={section.heading} style={styles.card}>
                        <Text style={styles.sectionHeading}>{section.heading}</Text>
                        <Text style={styles.sectionBody}>{section.body}</Text>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        paddingTop: 58,
        paddingHorizontal: 18,
        paddingBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F8FAFC',
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
    },
    headerTitleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
    },
    headerSpacer: {
        width: 36,
    },
    tabRow: {
        flexDirection: 'row',
        paddingHorizontal: 18,
        gap: 8,
        paddingBottom: 12,
    },
    tabButton: {
        flex: 1,
        borderRadius: 14,
        paddingVertical: 10,
        alignItems: 'center',
        backgroundColor: '#E2E8F0',
    },
    tabButtonActive: {
        backgroundColor: '#0F766E',
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#334155',
    },
    tabTextActive: {
        color: '#FFFFFF',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 18,
        paddingBottom: 32,
        gap: 12,
    },
    intro: {
        fontSize: 14,
        lineHeight: 22,
        color: '#334155',
        marginBottom: 4,
    },
    card: {
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    sectionHeading: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 8,
    },
    sectionBody: {
        fontSize: 14,
        lineHeight: 22,
        color: '#475569',
    },
});
