import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react-native';

export type ProfileTabType = 'posts' | 'private' | 'likes';

interface ProfileTabsProps {
    activeTab: ProfileTabType;
    onTabChange: (tab: ProfileTabType) => void;
}

export const ProfileTabs: React.FC<ProfileTabsProps> = ({ activeTab, onTabChange }) => {
    const { t } = useTranslation();
    const tabs = [
        { key: 'posts', label: t('profile.tabs_posts', '笔记') },
        { key: 'private', label: t('profile.tabs_private', '私密'), icon: true },
        { key: 'likes', label: t('profile.tabs_liked', '赞过') },
    ];

    return (
        <View style={styles.container}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                    <TouchableOpacity
                        key={tab.key}
                        style={styles.tabItem}
                        onPress={() => onTabChange(tab.key as ProfileTabType)}
                    >
                        <View style={styles.tabContent}>
                            {tab.icon && (
                                <Lock size={13} color={isActive ? '#1E3A8A' : '#9CA3AF'} />
                            )}
                            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                                {tab.label}
                            </Text>
                        </View>
                        {isActive && <View style={styles.activeIndicator} />}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        paddingHorizontal: 20,
        height: 52,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    tabItem: {
        marginRight: 24,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    tabContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    tabText: {
        fontSize: 15,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    tabTextActive: {
        color: '#1E3A8A',
        fontWeight: '700',
    },
    activeIndicator: {
        position: 'absolute',
        bottom: 6,
        width: 16,
        height: 3,
        backgroundColor: '#1E3A8A',
        borderRadius: 2,
    },
});
