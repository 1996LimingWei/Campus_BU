import { useRouter } from 'expo-router';
import { AlertTriangle, ChevronLeft, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { deleteAccount } from '../../services/auth';
import { getDeleteAccountErrorAlertCopy, getDeleteAccountSuccessAlertCopy } from '../../utils/deleteAccountFeedback';

type DeletionReason =
    | 'no_longer_needed'
    | 'privacy_concerns'
    | 'too_many_notifications'
    | 'switching_account'
    | 'other';

const REASONS: { id: DeletionReason; labelKey: string; defaultLabel: string }[] = [
    { id: 'no_longer_needed', labelKey: 'profile.delete_reason_no_longer_needed', defaultLabel: '不再需要此账号' },
    { id: 'privacy_concerns', labelKey: 'profile.delete_reason_privacy', defaultLabel: '隐私顾虑' },
    { id: 'too_many_notifications', labelKey: 'profile.delete_reason_notifications', defaultLabel: '通知太多' },
    { id: 'switching_account', labelKey: 'profile.delete_reason_switching', defaultLabel: '切换到其他账号' },
    { id: 'other', labelKey: 'profile.delete_reason_other', defaultLabel: '其他原因' },
];

export default function DeleteAccountScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();

    const [step, setStep] = useState<'info' | 'confirm'>('info');
    const [selectedReason, setSelectedReason] = useState<DeletionReason | null>(null);
    const [otherReasonText, setOtherReasonText] = useState('');
    const [confirmText, setConfirmText] = useState('');
    const [loading, setLoading] = useState(false);

    const CONFIRM_KEYWORD = t('profile.delete_confirm_keyword', { defaultValue: 'DELETE' });
    const isConfirmValid = confirmText.trim().toUpperCase() === CONFIRM_KEYWORD.toUpperCase();

    const handleProceedToConfirm = () => {
        if (!selectedReason) {
            Alert.alert(
                t('common.tip', '提示'),
                t('profile.delete_select_reason', '请选择注销原因')
            );
            return;
        }
        setStep('confirm');
    };

    const handleDelete = async () => {
        if (!isConfirmValid) return;

        setLoading(true);
        try {
            await deleteAccount();
            const successCopy = getDeleteAccountSuccessAlertCopy(t);
            Alert.alert(successCopy.title, successCopy.message, [
                {
                    text: t('common.ok', '确定'),
                    onPress: () => router.replace('/(auth)/login'),
                },
            ]);
        } catch (e) {
            console.error('Delete account failed:', e);
            const errorCopy = getDeleteAccountErrorAlertCopy(t);
            Alert.alert(errorCopy.title, errorCopy.message);
        } finally {
            setLoading(false);
        }
    };

    const renderInfoStep = () => (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {/* Warning Banner */}
            <View style={styles.warningBanner}>
                <AlertTriangle size={24} color="#DC2626" />
                <Text style={styles.warningText}>
                    {t('profile.delete_warning', '注销账号后，以下数据将被永久删除且无法恢复：')}
                </Text>
            </View>

            {/* Data list */}
            <View style={styles.dataList}>
                <Text style={styles.dataItem}>• {t('profile.delete_data_posts', '你发布的所有帖子和评论')}</Text>
                <Text style={styles.dataItem}>• {t('profile.delete_data_favorites', '收藏和点赞记录')}</Text>
                <Text style={styles.dataItem}>• {t('profile.delete_data_messages', '私信和聊天记录')}</Text>
                <Text style={styles.dataItem}>• {t('profile.delete_data_profile', '个人资料和头像')}</Text>
                <Text style={styles.dataItem}>• {t('profile.delete_data_schedule', '课程表和学习数据')}</Text>
            </View>

            {/* Reason Selection */}
            <Text style={styles.sectionTitle}>
                {t('profile.delete_reason_title', '请告诉我们注销原因')}
            </Text>
            <View style={styles.reasonList}>
                {REASONS.map((reason) => (
                    <TouchableOpacity
                        key={reason.id}
                        style={[
                            styles.reasonItem,
                            selectedReason === reason.id && styles.reasonItemSelected,
                        ]}
                        onPress={() => setSelectedReason(reason.id)}
                        activeOpacity={0.7}
                    >
                        <View style={[
                            styles.radioButton,
                            selectedReason === reason.id && styles.radioButtonSelected,
                        ]}>
                            {selectedReason === reason.id && <View style={styles.radioDot} />}
                        </View>
                        <Text style={[
                            styles.reasonText,
                            selectedReason === reason.id && styles.reasonTextSelected,
                        ]}>
                            {t(reason.labelKey, reason.defaultLabel)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Other reason input */}
            {selectedReason === 'other' && (
                <TextInput
                    style={styles.otherInput}
                    placeholder={t('profile.delete_reason_other_placeholder', '请输入具体原因...')}
                    placeholderTextColor="#9CA3AF"
                    value={otherReasonText}
                    onChangeText={setOtherReasonText}
                    multiline
                    maxLength={200}
                />
            )}

            {/* Proceed Button */}
            <TouchableOpacity
                style={[styles.proceedButton, !selectedReason && styles.proceedButtonDisabled]}
                onPress={handleProceedToConfirm}
                disabled={!selectedReason}
                activeOpacity={0.7}
            >
                <Text style={[styles.proceedButtonText, !selectedReason && styles.proceedButtonTextDisabled]}>
                    {t('profile.delete_proceed', '继续注销')}
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );

    const renderConfirmStep = () => (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {/* Final Warning */}
                <View style={styles.finalWarningContainer}>
                    <Trash2 size={48} color="#DC2626" />
                    <Text style={styles.finalWarningTitle}>
                        {t('profile.delete_final_title', '确认注销账号')}
                    </Text>
                    <Text style={styles.finalWarningDesc}>
                        {t('profile.delete_final_desc', '此操作不可逆。注销后你的所有数据将被永久删除，无法恢复。你可以使用同一邮箱重新注册，但将作为全新账号。')}
                    </Text>
                </View>

                {/* Confirm Input */}
                <Text style={styles.confirmLabel}>
                    {t('profile.delete_confirm_label', '请输入 {{keyword}} 确认注销', { keyword: CONFIRM_KEYWORD })}
                </Text>
                <TextInput
                    style={styles.confirmInput}
                    placeholder={CONFIRM_KEYWORD}
                    placeholderTextColor="#D1D5DB"
                    value={confirmText}
                    onChangeText={setConfirmText}
                    autoCapitalize="characters"
                    autoCorrect={false}
                />

                {/* Delete Button */}
                <TouchableOpacity
                    style={[styles.deleteButton, !isConfirmValid && styles.deleteButtonDisabled]}
                    onPress={handleDelete}
                    disabled={!isConfirmValid || loading}
                    activeOpacity={0.7}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={[styles.deleteButtonText, !isConfirmValid && styles.deleteButtonTextDisabled]}>
                            {t('profile.delete_confirm_button', '永久注销账号')}
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Go Back */}
                <TouchableOpacity
                    style={styles.goBackButton}
                    onPress={() => setStep('info')}
                    activeOpacity={0.7}
                >
                    <Text style={styles.goBackText}>
                        {t('profile.delete_go_back', '返回上一步')}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={24} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {t('profile.delete_account', '注销账号')}
                </Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Content */}
            {step === 'info' ? renderInfoStep() : renderConfirmStep()}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#111827',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 20,
        paddingBottom: 40,
    },
    warningBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FEF2F2',
        borderRadius: 12,
        padding: 16,
        gap: 12,
        marginBottom: 20,
    },
    warningText: {
        flex: 1,
        fontSize: 14,
        color: '#991B1B',
        lineHeight: 20,
    },
    dataList: {
        marginBottom: 24,
        gap: 8,
    },
    dataItem: {
        fontSize: 14,
        color: '#4B5563',
        lineHeight: 22,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 12,
    },
    reasonList: {
        gap: 10,
        marginBottom: 16,
    },
    reasonItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 12,
    },
    reasonItemSelected: {
        borderColor: '#DC2626',
        backgroundColor: '#FEF2F2',
    },
    radioButton: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioButtonSelected: {
        borderColor: '#DC2626',
    },
    radioDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#DC2626',
    },
    reasonText: {
        fontSize: 14,
        color: '#374151',
    },
    reasonTextSelected: {
        color: '#991B1B',
        fontWeight: '500',
    },
    otherInput: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        padding: 12,
        fontSize: 14,
        color: '#111827',
        minHeight: 80,
        textAlignVertical: 'top',
        marginBottom: 16,
    },
    proceedButton: {
        backgroundColor: '#DC2626',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    proceedButtonDisabled: {
        backgroundColor: '#F3F4F6',
    },
    proceedButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    proceedButtonTextDisabled: {
        color: '#9CA3AF',
    },
    finalWarningContainer: {
        alignItems: 'center',
        paddingVertical: 32,
        gap: 12,
    },
    finalWarningTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    finalWarningDesc: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 16,
    },
    confirmLabel: {
        fontSize: 14,
        color: '#374151',
        marginBottom: 8,
        fontWeight: '500',
    },
    confirmInput: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        padding: 14,
        fontSize: 16,
        color: '#111827',
        textAlign: 'center',
        marginBottom: 24,
    },
    deleteButton: {
        backgroundColor: '#DC2626',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    deleteButtonDisabled: {
        backgroundColor: '#F3F4F6',
    },
    deleteButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    deleteButtonTextDisabled: {
        color: '#9CA3AF',
    },
    goBackButton: {
        alignItems: 'center',
        padding: 16,
        marginTop: 12,
    },
    goBackText: {
        fontSize: 14,
        color: '#6B7280',
    },
});