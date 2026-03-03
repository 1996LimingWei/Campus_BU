import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Camera, Check, ChevronRight, LogOut, Sparkles, User as UserIcon, Wand2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { callDeepSeek } from '../../services/agent/llm';
import { auth, createUserProfile, getUserProfile, signOut } from '../../services/auth';
import { SOCIAL_TAGS } from '../../types';

export default function SetupScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const [displayName, setDisplayName] = useState('');
    const [major, setMajor] = useState('');
    const [avatar, setAvatar] = useState<string | null>(null);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [bio, setBio] = useState('');
    const [loading, setLoading] = useState(false);
    const [generatingBio, setGeneratingBio] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);

    React.useEffect(() => {
        const loadExistingProfile = async () => {
            const { data: { user } } = await auth.getUser();
            if (user) {
                const profile = await getUserProfile(user.id);
                if (profile) {
                    setIsEditMode(true);
                    setDisplayName(profile.displayName || '');
                    setMajor(profile.major || '');
                    setSelectedTags(profile.socialTags || []);
                    if (profile.avatarUrl) setAvatar(profile.avatarUrl);
                }
            }
        };
        loadExistingProfile();
    }, []);

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(t('common.tip', 'Tip'), t('setup.permission_denied', 'Permission denied'));
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            setAvatar(result.assets[0].uri);
        }
    };

    const toggleTag = (tag: string) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter(t => t !== tag));
        } else {
            if (selectedTags.length >= 3) {
                Alert.alert(t('common.tip', 'Tip'), t('setup.tags_limit', 'You can only select up to 3 tags'));
                return;
            }
            setSelectedTags([...selectedTags, tag]);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut();
            router.replace('/(auth)/login');
        } catch (error) {
            console.error(error);
        }
    };

    const handleSetup = async () => {
        // Validation: Nickname is required
        const finalDisplayName = displayName.trim();
        if (!finalDisplayName) {
            Alert.alert(t('common.tip', 'Tip'), t('setup.nickname_required', 'Nickname is required'));
            return;
        }
        if (finalDisplayName.length < 2) {
            Alert.alert(t('common.tip', 'Tip'), t('setup.nickname_too_short', 'Nickname too short'));
            return;
        }
        if (finalDisplayName.length > 20) {
            Alert.alert(t('common.tip', 'Tip'), t('setup.nickname_too_long', 'Nickname too long'));
            return;
        }

        const finalMajor = major.trim() || t('setup.default_major', '未设定专业');

        const { data: { user }, error: userError } = await auth.getUser();
        if (userError || !user) {
            Alert.alert(t('common.error', 'Error'), t('setup.error_no_auth', '找不到登录信息，请重新登录'));
            router.replace('/(auth)/login');
            return;
        }

        setLoading(true);
        try {
            await createUserProfile(user.id, finalDisplayName, selectedTags, finalMajor, avatar || '', user.email || '');

            Alert.alert(
                isEditMode ? t('common.success', 'Success') : t('setup.welcome_title', '欢迎加入!'),
                isEditMode ? t('setup.update_success', '个人资料已更新') : t('setup.welcome_msg', { name: finalDisplayName }),
                [{ text: isEditMode ? t('common.ok') : t('setup.welcome_action', '出发!'), onPress: () => router.replace('/(tabs)/profile') }]
            );
        } catch (error: any) {
            Alert.alert(t('common.error', 'Error'), error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateBio = async () => {
        if (selectedTags.length === 0) {
            Alert.alert(t('common.tip', 'Tip'), t('setup.ai_gen_hint', '请先选择几个标签，AI 才能了解你哦'));
            return;
        }

        setGeneratingBio(true);
        try {
            const result = await callDeepSeek([
                { role: 'system', content: '你是一个充满活力的校园社交助手。' },
                { role: 'user', content: `请根据以下标签，为用户写一段简短、有趣、有个性的个人简介（30字以内）：${selectedTags.join(', ')}。请直接输出简介内容。` }
            ]);
            setBio(result);
        } catch (error) {
            Alert.alert(t('common.error', 'Error'), t('setup.ai_gen_error', '生成失败，请重试'));
        } finally {
            setGeneratingBio(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
        >
            <LinearGradient
                colors={['#EEF2FF', '#FFFFFF', '#F0F9FF']}
                style={styles.container}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header Section */}
                    <Animated.View entering={FadeInDown.delay(100).springify()}>
                        {/* Language Switcher */}
                        <View style={styles.langSwitchContainer}>
                            <Text style={styles.langLabel}>Language</Text>
                            {['en', 'zh-Hans', 'zh-Hant'].map((lang) => {
                                const isActive = i18n.language === lang;
                                return (
                                    <TouchableOpacity
                                        key={lang}
                                        onPress={() => i18n.changeLanguage(lang)}
                                        style={[styles.langButton, isActive && { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }]}
                                    >
                                        <Text style={[styles.langText, isActive && { color: '#4F46E5', fontWeight: '700' }]}>
                                            {lang === 'en' ? 'EN' : lang === 'zh-Hans' ? '简' : '繁'}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <View style={styles.header}>
                            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                                <LogOut size={16} color="#6B7280" />
                                <Text style={styles.logoutText}>{t('setup.logout_btn', 'Sign Out')}</Text>
                            </TouchableOpacity>

                            <View style={styles.iconWrapper}>
                                <LinearGradient
                                    colors={['#4F46E5', '#3730A3']}
                                    style={styles.iconGradient}
                                >
                                    <Sparkles size={32} color="#FFFFFF" />
                                </LinearGradient>
                            </View>

                            <Text style={styles.title}>{t('setup.title')}</Text>
                            <Text style={styles.subtitle}>{t('setup.subtitle')}</Text>
                        </View>
                    </Animated.View>

                    {/* Avatar Section */}
                    <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.avatarSection}>
                        <View style={styles.avatarRow}>
                            <TouchableOpacity onPress={() => setAvatar(null)} style={[styles.avatarOption, !avatar && styles.avatarOptionSelected]}>
                                <View style={[styles.avatarCircleSmall, !avatar && styles.avatarCircleSelected]}>
                                    <UserIcon size={24} color={!avatar ? "#4F46E5" : "#94A3B8"} />
                                </View>
                                <Text style={[styles.avatarOptionText, !avatar && styles.avatarOptionTextSelected]}>Default</Text>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={pickImage} style={[styles.avatarContainer, avatar ? styles.avatarOptionSelected : null]}>
                                <View style={[styles.avatarCircle, avatar && styles.avatarCircleimage]}>
                                    {avatar ? (
                                        <Image source={{ uri: avatar }} style={styles.avatarImage} />
                                    ) : (
                                        <Camera size={32} color="#CBD5E1" />
                                    )}
                                    {avatar && (
                                        <View style={styles.editBadge}>
                                            <Check size={14} color="#FFF" />
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.avatarLabel}>{avatar ? t('setup.avatar_hint').replace('点击上传', '更换') : t('setup.avatar_hint')}</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>

                    {/* Form Section */}
                    <View style={styles.formContainer}>

                        {/* Nickname */}
                        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.inputGroup}>
                            <View style={styles.labelRow}>
                                <Text style={styles.label}>{t('setup.nickname_label')}</Text>
                                <Text style={styles.requiredMark}>*</Text>
                            </View>
                            <TextInput
                                style={styles.input}
                                placeholder={t('setup.nickname_placeholder')}
                                placeholderTextColor="#94A3B8"
                                value={displayName}
                                onChangeText={setDisplayName}
                            />
                            {displayName.length > 0 && (
                                <Text style={[styles.hint, displayName.length < 2 || displayName.length > 20 ? styles.errorText : null]}>
                                    {displayName.length} / 20 chars
                                </Text>
                            )}
                        </Animated.View>

                        {/* Major */}
                        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.inputGroup}>
                            <View style={styles.labelRow}>
                                <Text style={styles.label}>{t('setup.major_label')}</Text>
                                <Text style={styles.optionalBadge}>{t('setup.optional')}</Text>
                            </View>
                            <TextInput
                                style={styles.input}
                                placeholder={t('setup.major_placeholder')}
                                placeholderTextColor="#94A3B8"
                                value={major}
                                onChangeText={setMajor}
                            />
                        </Animated.View>

                        {/* Tags */}
                        <Animated.View entering={FadeInDown.delay(500).springify()} style={styles.inputGroup}>
                            <View style={styles.labelRow}>
                                <Text style={styles.label}>{t('setup.tags_label')}</Text>
                                <Text style={styles.counter}>{selectedTags.length}/3</Text>
                            </View>
                            <View style={styles.tagsContainer}>
                                {SOCIAL_TAGS.map((tag) => {
                                    const isSelected = selectedTags.includes(tag);
                                    return (
                                        <TouchableOpacity
                                            key={tag}
                                            onPress={() => toggleTag(tag)}
                                            style={[styles.tag, isSelected && styles.tagSelected]}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>{tag}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </Animated.View>

                        {/* AI Gen Bio */}
                        {selectedTags.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(600).springify()} style={styles.aiSection}>
                                <View style={styles.aiHeader}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Wand2 size={16} color="#4F46E5" style={{ marginRight: 6 }} />
                                        <Text style={styles.aiLabel}>{t('setup.ai_gen_title')}</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={handleGenerateBio}
                                        disabled={generatingBio}
                                        style={styles.aiButton}
                                    >
                                        <Text style={styles.aiButtonText}>
                                            {generatingBio ? t('setup.ai_gen_loading') : t('setup.ai_gen_btn')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                {bio ? (
                                    <View style={styles.bioBox}>
                                        <Text style={styles.bioText}>{bio}</Text>
                                    </View>
                                ) : null}
                            </Animated.View>
                        )}

                        <Animated.View entering={FadeInUp.delay(700).springify()} style={styles.submitCard}>
                            <LinearGradient
                                colors={['#FFFFFF', '#F8FAFC']}
                                style={styles.submitGradient}
                            >
                                <View style={styles.submitContent}>
                                    <View>
                                        <Text style={styles.submitTitle}>{t('setup.submit_btn')}</Text>
                                        <Text style={styles.submitSubtitle}>Ready to join HKCampus?</Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={handleSetup}
                                        disabled={loading}
                                        style={styles.submitArrowBtn}
                                    >
                                        {loading ? (
                                            <Sparkles size={24} color="#FFF" />
                                        ) : (
                                            <ChevronRight size={28} color="#FFF" />
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </LinearGradient>
                        </Animated.View>
                    </View>
                </ScrollView>
            </LinearGradient>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: 40,
        paddingHorizontal: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logoutButton: {
        position: 'absolute',
        top: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.6)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
    },
    logoutText: {
        fontSize: 12,
        color: '#6B7280',
        marginLeft: 4,
        fontWeight: '600',
    },
    iconWrapper: {
        marginBottom: 16,
        shadowColor: "#4F46E5",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 10,
    },
    iconGradient: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#1E293B',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#64748B',
        fontStyle: 'italic', // Made slightly more playful
    },
    avatarSection: {
        alignItems: 'center',
        marginBottom: 32,
    },
    avatarContainer: {
        alignItems: 'center',
    },
    avatarCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: '#FFFFFF',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 4,
    },
    avatarCircleimage: {
        borderWidth: 0,
    },
    avatarImage: {
        width: 100,
        height: 100,
        borderRadius: 50,
    },
    editBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#4F46E5',
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    avatarLabel: {
        marginTop: 12,
        color: '#6366F1',
        fontWeight: '600',
        fontSize: 14,
    },
    formContainer: {
        width: '100%',
    },
    inputGroup: {
        marginBottom: 24,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        justifyContent: 'space-between',
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: '#334155',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    requiredMark: {
        color: '#EF4444',
        marginLeft: 4,
    },
    optionalBadge: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500',
    },
    input: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#1E293B',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.02,
        shadowRadius: 2,
        elevation: 1,
    },
    hint: {
        marginTop: 6,
        fontSize: 12,
        color: '#94A3B8',
        alignSelf: 'flex-end',
    },
    errorText: {
        color: '#EF4444',
    },
    counter: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '600',
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    tag: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 100,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    tagSelected: {
        backgroundColor: '#4F46E5',
        borderColor: '#4F46E5',
        shadowColor: "#4F46E5",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    tagText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748B',
    },
    tagTextSelected: {
        color: '#FFFFFF',
    },
    aiSection: {
        marginTop: 8,
        padding: 16,
        backgroundColor: '#F5F3FF', // Very light purple
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E0E7FF',
    },
    aiHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    aiLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#4338CA',
    },
    aiButton: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#DDD6FE',
    },
    aiButtonText: {
        fontSize: 12,
        color: '#6D28D9',
        fontWeight: '700',
    },
    bioBox: {
        backgroundColor: '#FFFFFF',
        padding: 12,
        borderRadius: 12,
        borderLeftWidth: 3,
        borderLeftColor: '#8B5CF6',
    },
    bioText: {
        fontSize: 15,
        color: '#334155',
        lineHeight: 22,
        fontStyle: 'italic',
    },
    submitCard: {
        marginTop: 30,
        marginBottom: 20,
        shadowColor: "#4F46E5",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
        borderRadius: 24,
    },
    submitGradient: {
        borderRadius: 24,
        padding: 4,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    submitContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 24,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
    },
    submitTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1E293B',
    },
    submitSubtitle: {
        fontSize: 14,
        color: '#64748B',
        marginTop: 4,
    },
    submitArrowBtn: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#4F46E5',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#4F46E5",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    langSwitchContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center', // Align label and buttons center
        marginBottom: 24,
        backgroundColor: '#F1F5F9', // Slate-100
        alignSelf: 'center',
        padding: 4,
        paddingLeft: 16, // Add padding for label
        borderRadius: 20,
        gap: 8, // Gap between label and buttons
    },
    langLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B',
    },
    langButton: {
        paddingVertical: 6,
        paddingHorizontal: 16,
        borderRadius: 16,
    },
    langText: {
        fontSize: 13,
        color: '#64748B',
    },
    avatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
    },
    avatarOption: {
        alignItems: 'center',
        opacity: 0.5,
    },
    avatarOptionSelected: {
        opacity: 1,
        transform: [{ scale: 1.05 }],
    },
    avatarCircleSmall: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    avatarCircleSelected: {
        borderColor: '#4F46E5',
        backgroundColor: '#EEF2FF',
    },
    avatarOptionText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#94A3B8',
    },
    avatarOptionTextSelected: {
        color: '#4F46E5',
    },
});
