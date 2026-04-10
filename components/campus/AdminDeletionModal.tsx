import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type DeletionReason =
    | 'spam'
    | 'unfriendly'
    | 'duplicate'
    | 'other';

export interface DeletionReasonOption {
    id: DeletionReason;
    label: string;
}

export const DELETION_REASONS: DeletionReason[] = ['spam', 'unfriendly', 'duplicate', 'other'];

interface AdminDeletionModalProps {
    visible: boolean;
    onConfirm: (reason: DeletionReason, customReason?: string) => void;
    onCancel: () => void;
}

/**
 * AdminDeletionModal - Modal for admins to delete posts with reason selection
 * Features:
 * - Radio button style reason selection
 * - Custom reason text input when "Other" is selected
 * - Confirm/Cancel actions
 */
export const AdminDeletionModal: React.FC<AdminDeletionModalProps> = ({
    visible,
    onConfirm,
    onCancel,
}) => {
    const { t } = useTranslation();
    const [selectedReason, setSelectedReason] = useState<DeletionReason>('spam');
    const [customReasonText, setCustomReasonText] = useState('');

    const reasonOptions = useMemo<DeletionReasonOption[]>(() => {
        const getReasonLabel = (reason: DeletionReason) => {
            if (reason === 'spam') return t('campus_detail.deletion_reason_spam', '垃圾内容/广告');
            if (reason === 'unfriendly') return t('campus_detail.deletion_reason_unfriendly', '不友善/违规内容');
            if (reason === 'duplicate') return t('campus_detail.deletion_reason_duplicate', '重复内容');
            return t('campus_detail.deletion_reason_other', '其他');
        };

        return DELETION_REASONS.map((reason) => ({
            id: reason,
            label: getReasonLabel(reason),
        }));
    }, [t]);

    const handleConfirm = () => {
        console.log('[AdminDeletionModal] Confirm pressed');
        console.log('[AdminDeletionModal] Selected reason:', selectedReason);

        if (selectedReason === 'other') {
            if (!customReasonText.trim()) {
                console.log('[AdminDeletionModal] Custom reason required but empty');
                Alert.alert(
                    t('common.tip', '提示'),
                    t('campus_detail.delete_reason_required', '请输入删除原因'),
                );
                return;
            }
            console.log('[AdminDeletionModal] Custom reason:', customReasonText);
            onConfirm(selectedReason, customReasonText.trim());
        } else {
            onConfirm(selectedReason);
        }
    };

    const handleCancel = () => {
        console.log('[AdminDeletionModal] Cancel pressed');
        setSelectedReason('spam');
        setCustomReasonText('');
        onCancel();
    };

    const handleReasonSelect = (reason: DeletionReason) => {
        console.log('[AdminDeletionModal] Reason selected:', reason);
        setSelectedReason(reason);
        if (reason !== 'other') {
            setCustomReasonText('');
        }
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={handleCancel}
        >
            <Pressable style={styles.overlay} onPress={handleCancel}>
                <View style={styles.modalContent}>
                    <Text style={styles.title}>{t('campus_detail.delete_post_title', '删除帖子')}</Text>
                    <Text style={styles.subtitle}>{t('campus_detail.delete_reason_prompt', '请选择删除原因')}</Text>

                    {/* Reason Options */}
                    <View style={styles.reasonsContainer}>
                        {reasonOptions.map((option) => (
                            <TouchableOpacity
                                key={option.id}
                                style={[
                                    styles.reasonRow,
                                    selectedReason === option.id && styles.reasonRowSelected,
                                ]}
                                onPress={() => handleReasonSelect(option.id)}
                                activeOpacity={0.7}
                            >
                                {/* Radio Button */}
                                <View style={[
                                    styles.radioButton,
                                    selectedReason === option.id && styles.radioButtonSelected,
                                ]}>
                                    {selectedReason === option.id && (
                                        <View style={styles.radioDot} />
                                    )}
                                </View>

                                {/* Label */}
                                <Text style={[
                                    styles.reasonLabel,
                                    selectedReason === option.id && styles.reasonLabelSelected,
                                ]}>
                                    {option.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Custom Reason Input */}
                    {selectedReason === 'other' && (
                        <View style={styles.customReasonContainer}>
                            <Text style={styles.customReasonLabel}>{t('campus_detail.delete_reason_label', '请输入具体原因：')}</Text>
                            <TextInput
                                style={styles.customReasonInput}
                                placeholder={t('campus_detail.delete_reason_placeholder', '例如：违反社区准则...')}
                                placeholderTextColor="#9CA3AF"
                                value={customReasonText}
                                onChangeText={setCustomReasonText}
                                multiline
                                autoFocus
                            />
                        </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={styles.button}
                            onPress={handleCancel}
                        >
                            <Text style={styles.cancelText}>{t('common.cancel', '取消')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, styles.confirmButton]}
                            onPress={handleConfirm}
                        >
                            <Text style={styles.confirmText}>{t('campus_detail.confirm_delete', '确认删除')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 10,
        maxHeight: '80%',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 20,
        textAlign: 'center',
    },
    reasonsContainer: {
        gap: 12,
        marginBottom: 16,
    },
    reasonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    reasonRowSelected: {
        backgroundColor: '#FEF2F2',
        borderColor: '#DC2626',
    },
    radioButton: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    radioButtonSelected: {
        borderColor: '#DC2626',
        backgroundColor: '#DC2626',
    },
    radioDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#fff',
    },
    reasonLabel: {
        flex: 1,
        fontSize: 15,
        color: '#374151',
    },
    reasonLabelSelected: {
        color: '#DC2626',
        fontWeight: '600',
    },
    customReasonContainer: {
        marginBottom: 20,
        gap: 8,
    },
    customReasonLabel: {
        fontSize: 14,
        color: '#374151',
        fontWeight: '500',
    },
    customReasonInput: {
        width: '100%',
        minHeight: 80,
        padding: 12,
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        fontSize: 14,
        color: '#111827',
        textAlignVertical: 'top',
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmButton: {
        backgroundColor: '#DC2626',
    },
    confirmText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    cancelText: {
        color: '#6B7280',
        fontSize: 16,
        fontWeight: '600',
    },
});
