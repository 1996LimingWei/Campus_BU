import { useRouter } from 'expo-router';
import { Check, ChevronDown, Eye, EyeOff, Globe } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { signIn } from '../../services/auth';
import { AUTH_DOMAIN_OPTIONS, AUTH_LANGUAGE_OPTIONS } from '../../constants/authOptions';
import { getAgreementGuardResult } from '../../services/authLegalAgreement';
import { changeLanguage } from '../i18n/i18n';

export default function LoginScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const isEnglish = i18n.language === 'en';
    const [emailPrefix, setEmailPrefix] = useState('');
    const [emailSuffix, setEmailSuffix] = useState('@life.hkbu.edu.hk');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showDomainPicker, setShowDomainPicker] = useState(false);
    const [showLangPicker, setShowLangPicker] = useState(false);
    const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);

    const ensureAgreementAccepted = (action: 'login' | 'send_otp' | 'register') => {
        const result = getAgreementGuardResult(hasAcceptedTerms, action);
        if (!result.ok) {
            Alert.alert(
                t('common.tip', 'Tip'),
                t(result.messageKey, 'Please agree to the terms, privacy policy, and community safety rules before continuing.'),
            );
            return false;
        }
        return true;
    };

    const handleLanguageChange = async (lang: string) => {
        await changeLanguage(lang);
        setShowLangPicker(false);
    };

    const handlePasswordLogin = async () => {
        if (!ensureAgreementAccepted('login')) {
            return;
        }

        if (!emailPrefix || !password) {
            const placeholder = emailSuffix === 'other' ? t('auth.email_label') : t('auth.email_placeholder');
            Alert.alert(t('common.tip', 'Tip'), `${placeholder} & ${t('auth.password_placeholder')}`);
            return;
        }

        let prefix = emailPrefix.trim();
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
            const isInvalidCredentials = error.message === 'Invalid login credentials' || error.status === 400 || error.status === 422;

            if (isInvalidCredentials) {
                Alert.alert(
                    t('common.error', 'Error'),
                    t('auth.invalid_credentials', 'Invalid email or password. Please try again or register if you do not have an account.'),
                    [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                            text: t('auth.register_title'),
                            onPress: () => router.push('/(auth)/register')
                        }
                    ]
                );
            } else {
                Alert.alert(t('common.error', 'Error'), error.message || t('auth.login_failed', 'Login failed'));
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
                            {AUTH_LANGUAGE_OPTIONS.find(l => l.value === i18n.language)?.label || 'Language'}
                        </Text>
                        <ChevronDown size={14} color="#4B5563" />
                    </TouchableOpacity>
                </View>
            </View>

            <TouchableWithoutFeedback
                testID="auth-background-login"
                onPress={Keyboard.dismiss}
                accessible={false}
            >
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
                                    placeholder={emailSuffix === '@life.hkbu.edu.hk' ? t('auth.email_placeholder') : t('auth.email_prefix_placeholder', 'example')}
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
                        onPress={() => {
                            if (!ensureAgreementAccepted('login')) {
                                return;
                            }
                            router.replace('/(tabs)/campus');
                        }}
                    >
                        <Text style={styles.guestButtonText}>{t('auth.guest_login')}</Text>
                    </TouchableOpacity>

                    <View style={styles.agreementCard}>
                        <Text style={styles.agreementNotice}>{t('auth.age_gate_notice', 'This app is intended for users 18+.')}</Text>
                        <View style={[styles.agreementLinksRow, isEnglish && styles.agreementLinksRowEnglish]}>
                            <TouchableOpacity onPress={() => router.push({ pathname: '/legal', params: { tab: 'terms' } } as any)}>
                                <Text style={[styles.agreementLink, isEnglish && styles.agreementLinkEnglish]}>{t('auth.user_agreement', 'Terms')}</Text>
                            </TouchableOpacity>
                            <Text style={[styles.agreementSeparator, isEnglish && styles.agreementSeparatorEnglish]}>{t('auth.and', ' / ')}</Text>
                            <TouchableOpacity onPress={() => router.push({ pathname: '/legal', params: { tab: 'privacy' } } as any)}>
                                <Text style={[styles.agreementLink, isEnglish && styles.agreementLinkEnglish]}>{t('auth.privacy_policy', 'Privacy Policy')}</Text>
                            </TouchableOpacity>
                            <Text style={[styles.agreementSeparator, isEnglish && styles.agreementSeparatorEnglish]}>{t('auth.and', ' / ')}</Text>
                            <TouchableOpacity onPress={() => router.push({ pathname: '/legal', params: { tab: 'terms' } } as any)}>
                                <Text style={[styles.agreementLink, isEnglish && styles.agreementLinkEnglish]}>{t('auth.community_rules', 'Community Safety Rules')}</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                            testID="auth-agreement-checkbox-login"
                            style={styles.checkboxRow}
                            activeOpacity={0.85}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            onPress={() => setHasAcceptedTerms((value) => !value)}
                        >
                            <View style={[styles.checkbox, hasAcceptedTerms && styles.checkboxChecked]}>
                                {hasAcceptedTerms && <Check size={14} color="#FFFFFF" />}
                            </View>
                            <Text style={styles.checkboxText}>
                                {t('auth.agreement_checkbox_prefix', 'I have read and agree to the terms, privacy policy, and community safety rules.')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    </View>
                </ScrollView>
            </TouchableWithoutFeedback>

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
                            <Text style={styles.modalTitle}>{t('auth.select_domain', 'Select Domain')}</Text>
                        </View>
                        <FlatList
                            data={[...AUTH_DOMAIN_OPTIONS]}
                            renderItem={renderDomainItem}
                            keyExtractor={item => item.value}
                        />
                    </View>
                </TouchableOpacity>
            </Modal>

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
                            data={[...AUTH_LANGUAGE_OPTIONS]}
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
    agreementCard: {
        marginTop: 28,
        padding: 16,
        borderRadius: 16,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    agreementNotice: {
        marginBottom: 8,
        color: '#475569',
        fontSize: 12,
        textAlign: 'center',
    },
    agreementLinksRow: {
        marginTop: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
    },
    agreementLinksRowEnglish: {
        flexWrap: 'nowrap',
    },
    agreementSeparator: {
        color: '#9CA3AF',
        fontSize: 11,
        marginHorizontal: 5,
    },
    agreementSeparatorEnglish: {
        fontSize: 10,
        marginHorizontal: 4,
    },
    agreementLink: {
        color: '#3B82F6',
        fontWeight: '600',
        fontSize: 11,
    },
    agreementLinkEnglish: {
        fontSize: 10,
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
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginTop: 14,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: '#94A3B8',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },
    checkboxChecked: {
        backgroundColor: '#1E3A8A',
        borderColor: '#1E3A8A',
    },
    checkboxText: {
        flex: 1,
        color: '#334155',
        fontSize: 12.2,
        lineHeight: 18,
        letterSpacing: -0.15,
    },
});
