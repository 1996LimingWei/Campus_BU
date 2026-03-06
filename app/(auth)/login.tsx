import { useRouter } from 'expo-router';
import { ChevronDown, Eye, EyeOff, Globe } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { signIn } from '../../services/auth';
import { changeLanguage } from '../i18n/i18n';

const DOMAINS = [
    { label: '@life.hkbu.edu.hk', value: '@life.hkbu.edu.hk' },
    { label: '@gmail.com', value: '@gmail.com' },
    { label: '@qq.com', value: '@qq.com' },
    { label: '@163.com', value: '@163.com' },
    { label: 'Other / 其他', value: 'other' },
];

const LANGUAGES = [
    { label: '简体中文', value: 'zh-Hans' },
    { label: '繁體中文', value: 'zh-Hant' },
    { label: 'English', value: 'en' },
];

export default function LoginScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const [emailPrefix, setEmailPrefix] = useState(''); // Also used for full email in 'other' mode
    const [emailSuffix, setEmailSuffix] = useState('@life.hkbu.edu.hk');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showDomainPicker, setShowDomainPicker] = useState(false);
    const [showLangPicker, setShowLangPicker] = useState(false);

    const handleLanguageChange = async (lang: string) => {
        await changeLanguage(lang);
        setShowLangPicker(false);
    };

    const handlePasswordLogin = async () => {
        if (!emailPrefix || !password) {
            const placeholder = emailSuffix === 'other' ? t('auth.email_label') : t('auth.email_placeholder');
            Alert.alert(t('common.tip', '提示'), placeholder + ' & ' + t('auth.password_placeholder'));
            return;
        }

        let prefix = emailPrefix.trim();
        // If user accidentally entered full email in the prefix field
        if (emailSuffix !== 'other' && prefix.toLowerCase().endsWith(emailSuffix.toLowerCase())) {
            prefix = prefix.substring(0, prefix.length - emailSuffix.length);
        }

        const fullEmail = emailSuffix === 'other' ? prefix.toLowerCase() : (prefix + emailSuffix).toLowerCase();

        setLoading(true);
        try {
            const user = await signIn(fullEmail, password);
            if (user) {
                router.replace('/(tabs)/campus');
            }
        } catch (error: any) {
            // Check if the error is "Invalid login credentials" which usually means user doesn't exist or wrong password.
            // In a campus context, if they can't login, we can offer registration or specifically check if they exist.
            const isInvalidCredentials = error.message === 'Invalid login credentials' || error.status === 400 || error.status === 422;

            if (isInvalidCredentials) {
                Alert.alert(
                    t('common.error', '错误'),
                    t('auth.invalid_credentials', '邮箱或密码错误，请重试。如未注册请先注册。'),
                    [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                            text: t('auth.register_title'),
                            onPress: () => router.push('/(auth)/register')
                        }
                    ]
                );
            } else {
                Alert.alert(t('common.error', '错误'), error.message || t('auth.login_failed', '登录失败'));
            }
        } finally {
            setLoading(false);
        }
    };

    const renderDomainItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => {
                setEmailSuffix(item.value);
                setShowDomainPicker(false);
            }}
        >
            <Text style={[styles.pickerItemText, emailSuffix === item.value && styles.pickerItemTextActive]}>
                {item.label}
            </Text>
        </TouchableOpacity>
    );

    const renderLangItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.pickerItem}
            onPress={() => handleLanguageChange(item.value)}
        >
            <Text style={[styles.pickerItemText, i18n.language === item.value && styles.pickerItemTextActive]}>
                {item.label}
            </Text>
        </TouchableOpacity>
    );

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.topBar}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B' }}>Language</Text>
                    <TouchableOpacity style={styles.langSelector} onPress={() => setShowLangPicker(true)}>
                        <Globe size={18} color="#4B5563" />
                        <Text style={styles.langSelectorText}>
                            {LANGUAGES.find(l => l.value === i18n.language)?.label || 'Language'}
                        </Text>
                        <ChevronDown size={14} color="#4B5563" />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <Text style={styles.title}>HKCampus</Text>
                    <Text style={styles.subtitle}>{t('auth.subtitle', 'Connect with your campus vibe')}</Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.label}>{t('auth.email_label')}</Text>

                    {emailSuffix === 'other' ? (
                        <View style={[styles.inputContainer, styles.fullEmailContainer]}>
                            <TextInput
                                style={styles.input}
                                placeholder="example@email.com"
                                placeholderTextColor="#9CA3AF"
                                value={emailPrefix}
                                onChangeText={setEmailPrefix}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                            <TouchableOpacity
                                style={styles.domainReset}
                                onPress={() => setEmailSuffix('@life.hkbu.edu.hk')}
                            >
                                <ChevronDown size={16} color="#4B5563" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.emailRow}>
                            <View style={[styles.inputContainer, { flex: 2 }]}>
                                <TextInput
                                    style={styles.input}
                                    placeholder={t('auth.email_placeholder')}
                                    placeholderTextColor="#9CA3AF"
                                    value={emailPrefix}
                                    onChangeText={setEmailPrefix}
                                    autoCapitalize="none"
                                />
                            </View>

                            <TouchableOpacity
                                style={styles.domainSelector}
                                onPress={() => setShowDomainPicker(true)}
                            >
                                <Text style={styles.domainSelectorText}>{emailSuffix}</Text>
                                <ChevronDown size={16} color="#4B5563" />
                            </TouchableOpacity>
                        </View>
                    )}

                    <Text style={styles.label}>{t('auth.password_label')}</Text>
                    <View style={styles.passwordContainer}>
                        <TextInput
                            style={styles.passwordInput}
                            placeholder={t('auth.password_placeholder')}
                            placeholderTextColor="#9CA3AF"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                        />
                        <TouchableOpacity
                            onPress={() => setShowPassword(!showPassword)}
                            style={styles.eyeIcon}
                        >
                            {showPassword ? <EyeOff size={20} color="#6B7280" /> : <Eye size={20} color="#6B7280" />}
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handlePasswordLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>{t('auth.login_btn')}</Text>
                        )}
                    </TouchableOpacity>

                    <View style={styles.footerLinkRow}>
                        <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')}>
                            <Text style={styles.forgotLink}>{t('auth.forgot_password_link', 'Forgot Password?')}</Text>
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                            <Text style={styles.registerLink}>{t('auth.go_to_register')}</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={styles.guestButton}
                        onPress={() => router.replace('/(tabs)/campus')}
                    >
                        <Text style={styles.guestButtonText}>{t('auth.guest_login')}</Text>
                    </TouchableOpacity>

                    {/* Developer Shortcut to Setup Screen */}
                    {__DEV__ && (
                        <TouchableOpacity
                            onPress={() => router.push('/(auth)/setup')}
                            style={{ marginTop: 10, alignSelf: 'center', opacity: 0.3 }}
                        >
                            <Text style={{ fontSize: 10, color: '#9CA3AF' }}>Dev: Skip to Setup UI</Text>
                        </TouchableOpacity>
                    )}

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>{t('auth.agreement_prefix', '登录即代表同意 ')}</Text>
                        <Text style={styles.link}>{t('auth.user_agreement', '用户协议')}</Text>
                        <Text style={styles.footerText}> {t('auth.and', '与')} </Text>
                        <Text style={styles.link}>{t('auth.privacy_policy', '隐私政策')}</Text>
                    </View>
                </View>
            </ScrollView>

            {/* Domain Picker Modal */}
            <Modal
                visible={showDomainPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowDomainPicker(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowDomainPicker(false)}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('auth.select_domain', '选择域名')}</Text>
                        </View>
                        <FlatList
                            data={DOMAINS}
                            renderItem={renderDomainItem}
                            keyExtractor={item => item.value}
                        />
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Language Picker Modal */}
            <Modal
                visible={showLangPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowLangPicker(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowLangPicker(false)}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('auth.language_select')}</Text>
                        </View>
                        <FlatList
                            data={LANGUAGES}
                            renderItem={renderLangItem}
                            keyExtractor={item => item.value}
                        />
                    </View>
                </TouchableOpacity>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
    },
    langSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    langSelectorText: {
        fontSize: 14,
        color: '#4B5563',
        fontWeight: '500',
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 48,
    },
    title: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#1E3A8A',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#6B7280',
    },
    form: {
        width: '100%',
        maxWidth: 400,
        alignSelf: 'center',
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4B5563',
        marginBottom: 8,
        marginLeft: 4,
    },
    emailRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    inputContainer: {
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        overflow: 'hidden',
    },
    fullEmailContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    domainReset: {
        paddingHorizontal: 16,
        justifyContent: 'center',
    },
    input: {
        flex: 1,
        padding: 16,
        fontSize: 16,
        color: '#111827',
    },
    domainSelector: {
        flex: 1.5,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        paddingHorizontal: 16,
    },
    domainSelectorText: {
        fontSize: 14,
        color: '#111827',
        fontWeight: '500',
    },
    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        marginBottom: 24,
    },
    passwordInput: {
        flex: 1,
        padding: 16,
        fontSize: 16,
        color: '#111827',
    },
    eyeIcon: {
        padding: 12,
    },
    button: {
        backgroundColor: '#1E3A8A',
        borderRadius: 12,
        padding: 18,
        alignItems: 'center',
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 3,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
    },
    footerLinkRow: {
        marginTop: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    forgotLink: {
        color: '#64748B',
        fontSize: 14,
        fontWeight: '500',
    },
    divider: {
        width: 1,
        height: 14,
        backgroundColor: '#E5E7EB',
    },
    registerLink: {
        color: '#1E3A8A',
        fontSize: 14,
        fontWeight: '700',
    },
    footer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginTop: 40,
    },
    footerText: {
        color: '#9CA3AF',
        fontSize: 12,
    },
    link: {
        color: '#3B82F6',
        fontWeight: '600',
        fontSize: 12,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 40,
        maxHeight: '60%',
    },
    modalHeader: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
    },
    pickerItem: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F9FAFB',
    },
    pickerItemText: {
        fontSize: 16,
        color: '#4B5563',
        textAlign: 'center',
    },
    pickerItemTextActive: {
        color: '#1E3A8A',
        fontWeight: 'bold',
    },
    guestButton: {
        marginTop: 24,
        padding: 12,
        alignItems: 'center',
    },
    guestButtonText: {
        color: '#64748B',
        fontSize: 15,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
});
