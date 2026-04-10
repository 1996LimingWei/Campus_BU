import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    DeviceEventEmitter,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ban, Copy, MessageCircleWarning, Send, ShieldAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { blockUser, ModerationTargetType, reportContent, ReportReason } from '../services/moderation';

export type UgcActionTarget = {
    id: string;
    targetId: string;
    targetType: ModerationTargetType;
    content?: string;
    authorId?: string;
    authorName?: string;
    isAnonymous?: boolean;
};

type UseUgcEntryActionsOptions = {
    currentUserId?: string | null;
    ensureLoggedIn: () => boolean;
    onFlash?: (id: string) => void;
    onBlockedUser?: (blockedUserId: string) => void;
};

const REPORT_REASONS: Array<{ key: string; value: ReportReason }> = [
    { key: 'moderation.ugc_report_reasons.spam', value: 'spam' },
    { key: 'moderation.ugc_report_reasons.harassment', value: 'harassment' },
    { key: 'moderation.ugc_report_reasons.hate_speech', value: 'hate_speech' },
    { key: 'moderation.ugc_report_reasons.sexual_content', value: 'sexual_content' },
    { key: 'moderation.ugc_report_reasons.violence', value: 'violence' },
    { key: 'moderation.ugc_report_reasons.scam', value: 'scam' },
    { key: 'moderation.ugc_report_reasons.other', value: 'other' },
];

export function useUgcEntryActions(options: UseUgcEntryActionsOptions) {
    const { t } = useTranslation();
    const { currentUserId, ensureLoggedIn, onFlash, onBlockedUser } = options;
    const router = useRouter();
    const flashAnim = useRef(new Animated.Value(0)).current;
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [target, setTarget] = useState<UgcActionTarget | null>(null);

    const runFlash = useCallback((id: string) => {
        if (onFlash) {
            onFlash(id);
            return;
        }

        setHighlightedId(id);
        flashAnim.stopAnimation();
        flashAnim.setValue(0);
        Animated.sequence([
            Animated.timing(flashAnim, {
                toValue: 1,
                duration: 140,
                useNativeDriver: false,
            }),
            Animated.timing(flashAnim, {
                toValue: 0,
                duration: 260,
                useNativeDriver: false,
            }),
        ]).start(() => {
            setHighlightedId((current) => (current === id ? null : current));
        });
    }, [flashAnim, onFlash]);

    const openActions = useCallback((nextTarget: UgcActionTarget) => {
        if (!ensureLoggedIn()) {
            return;
        }

        runFlash(nextTarget.id);
        setTarget(nextTarget);
        setVisible(true);
    }, [ensureLoggedIn, runFlash]);

    const closeActions = useCallback(() => {
        setVisible(false);
    }, []);

    const canMessage = useMemo(() => (
        !!target?.authorId
        && !target?.isAnonymous
        && target.authorId !== currentUserId
    ), [currentUserId, target]);

    const canBlock = useMemo(() => (
        !!target?.authorId
        && !target?.isAnonymous
        && target.authorId !== currentUserId
    ), [currentUserId, target]);

    const handleReportReason = useCallback(async (reason: ReportReason) => {
        if (!currentUserId || !target) {
            return;
        }

        try {
            closeActions();
            const result = await reportContent({
                reporterId: currentUserId,
                targetId: target.targetId,
                targetType: target.targetType,
                targetAuthorId: target.authorId,
                reason,
            });

            if (result.success) {
                Alert.alert(t('moderation.ugc_reported_title'), t('moderation.ugc_reported_msg'));
            } else {
                Alert.alert(t('common.error'), t('moderation.ugc_report_failed'));
            }
        } catch (error) {
            console.error('Error reporting UGC item:', error);
            Alert.alert(t('common.error'), t('moderation.ugc_report_failed'));
        }
    }, [closeActions, currentUserId, target, t]);

    const handleReport = useCallback(() => {
        Alert.alert(
            t('moderation.ugc_report_title'),
            t('moderation.ugc_report_desc'),
            [
                ...REPORT_REASONS.map((reason) => ({
                    text: t(reason.key),
                    onPress: () => {
                        void handleReportReason(reason.value);
                    },
                })),
                { text: t('common.cancel'), style: 'cancel' as const },
            ],
        );
    }, [handleReportReason, t]);

    const handleBlock = useCallback(() => {
        if (!currentUserId || !target?.authorId || !canBlock) {
            return;
        }
        const blockedAuthorId = target.authorId;

        Alert.alert(
            t('moderation.ugc_block_title'),
            target.authorName 
                ? t('moderation.ugc_block_msg_named', { name: target.authorName })
                : t('moderation.ugc_block_msg_default'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('moderation.ugc_block_confirm'),
                    style: 'destructive',
                    onPress: () => {
                        closeActions();
                        blockUser(currentUserId, blockedAuthorId, {
                            source: 'ugc_actions_sheet',
                            reason: 'abusive_user',
                        }).then((result) => {
                            if (result.success) {
                                Alert.alert(t('moderation.ugc_blocked_title'), t('moderation.ugc_blocked_msg'));
                                DeviceEventEmitter.emit('user_blocked', { userId: blockedAuthorId });
                                onBlockedUser?.(blockedAuthorId);
                            } else {
                                Alert.alert(t('common.error'), t('moderation.ugc_block_failed'));
                            }
                        }).catch((error) => {
                            console.error('Error blocking user from UGC actions:', error);
                            Alert.alert(t('common.error'), t('moderation.ugc_block_failed'));
                        });
                    },
                },
            ],
        );
    }, [canBlock, closeActions, currentUserId, onBlockedUser, target, t]);

    const handleMessage = useCallback(() => {
        if (!target?.authorId || !canMessage) {
            return;
        }

        closeActions();
        router.push({
            pathname: '/messages/[id]' as any,
            params: { id: target.authorId },
        });
    }, [canMessage, closeActions, router, target?.authorId]);

    const handleCopy = useCallback(async () => {
        const content = target?.content?.trim();
        if (!content) {
            Alert.alert(t('moderation.ugc_copy_empty_title'), t('moderation.ugc_copy_empty_msg'));
            return;
        }

        try {
            await Clipboard.setStringAsync(content);
            closeActions();
            Alert.alert(t('moderation.ugc_copied_title'), t('moderation.ugc_copied_msg'));
        } catch (error) {
            console.error('Error copying UGC content:', error);
            Alert.alert(t('moderation.ugc_copy_failed_title'), t('moderation.ugc_copy_failed_msg'));
        }
    }, [closeActions, target?.content, t]);

    const getHighlightStyle = useCallback((id: string) => {
        if (highlightedId !== id || onFlash) {
            return null;
        }

        return {
            backgroundColor: flashAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(59, 130, 246, 0)', 'rgba(59, 130, 246, 0.14)'],
            }),
        };
    }, [flashAnim, highlightedId, onFlash]);

    const ActionSheet = (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={closeActions}
        >
            <Pressable style={styles.overlay} onPress={closeActions}>
                <Pressable style={styles.sheet} onPress={() => { }}>
                    <View style={styles.handle} />
                    {canMessage && (
                        <TouchableOpacity style={styles.actionButton} activeOpacity={0.85} onPress={handleMessage}>
                            <View style={[styles.iconWrap, styles.messageIconWrap]}>
                                <Send size={18} color="#2563EB" />
                            </View>
                            <Text style={styles.actionText}>{t('moderation.ugc_action_message')}</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.actionButton} activeOpacity={0.85} onPress={handleCopy}>
                        <View style={[styles.iconWrap, styles.copyIconWrap]}>
                            <Copy size={18} color="#0F766E" />
                        </View>
                        <Text style={styles.actionText}>{t('moderation.ugc_action_copy')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} activeOpacity={0.85} onPress={handleReport}>
                        <View style={[styles.iconWrap, styles.reportIconWrap]}>
                            <ShieldAlert size={18} color="#DC2626" />
                        </View>
                        <Text style={styles.actionText}>{t('moderation.ugc_action_report')}</Text>
                    </TouchableOpacity>
                    {canBlock && (
                        <TouchableOpacity style={styles.actionButton} activeOpacity={0.85} onPress={handleBlock}>
                            <View style={[styles.iconWrap, styles.blockIconWrap]}>
                                <Ban size={18} color="#7C2D12" />
                            </View>
                            <Text style={styles.actionText}>{t('moderation.ugc_action_block')}</Text>
                        </TouchableOpacity>
                    )}
                    {target?.isAnonymous && (
                        <View style={styles.hintRow}>
                            <MessageCircleWarning size={14} color="#94A3B8" />
                            <Text style={styles.hintText}>{t('moderation.ugc_anonymous_hint')}</Text>
                        </View>
                    )}
                </Pressable>
            </Pressable>
        </Modal>
    );

    return {
        openActions,
        closeActions,
        getHighlightStyle,
        ActionSheet,
    };
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.24)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 28,
    },
    handle: {
        alignSelf: 'center',
        width: 42,
        height: 5,
        borderRadius: 999,
        backgroundColor: '#CBD5E1',
        marginBottom: 18,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
    },
    iconWrap: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    messageIconWrap: {
        backgroundColor: '#DBEAFE',
    },
    copyIconWrap: {
        backgroundColor: '#DCFCE7',
    },
    reportIconWrap: {
        backgroundColor: '#FEE2E2',
    },
    blockIconWrap: {
        backgroundColor: '#FFEDD5',
    },
    actionText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
    hintRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    hintText: {
        fontSize: 12,
        color: '#94A3B8',
    },
});
