import { useRouter } from 'expo-router';
import { LogIn } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface GuestLoginModalProps {
    visible: boolean;
    onClose: () => void;
    title?: string;
    message?: string;
}

export const GuestLoginModal: React.FC<GuestLoginModalProps> = ({
    visible,
    onClose,
    title,
    message,
}) => {
    const { t } = useTranslation();
    const router = useRouter();

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                    <View style={styles.iconContainer}>
                        <LogIn size={32} color="#1E3A8A" />
                    </View>
                    <Text style={styles.title}>{title || t('auth.guest_prompt_title', 'Login Required')}</Text>
                    <Text style={styles.message}>{message || t('auth.guest_prompt_msg', 'Please login to continue.')}</Text>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={() => {
                                onClose();
                                router.push('/(auth)/login');
                            }}
                        >
                            <Text style={styles.primaryText}>{t('auth.login_title', 'Log In / Sign Up')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={onClose}
                        >
                            <Text style={styles.secondaryText}>{t('common.cancel', 'Not Now')}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
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
        maxWidth: 340,
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 12,
        textAlign: 'center',
    },
    message: {
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 22,
        marginBottom: 32,
        textAlign: 'center',
    },
    buttonContainer: {
        width: '100%',
        gap: 12,
    },
    primaryButton: {
        width: '100%',
        backgroundColor: '#1E3A8A',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    primaryText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    secondaryButton: {
        width: '100%',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
    },
    secondaryText: {
        color: '#4B5563',
        fontSize: 16,
        fontWeight: '600',
    },
});
