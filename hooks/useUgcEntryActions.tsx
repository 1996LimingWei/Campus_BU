import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Copy, MessageCircleWarning, Send, ShieldAlert } from 'lucide-react-native';
import { reportContent, ReportReason } from '../services/moderation';

export type UgcActionTarget = {
    id: string;
    targetId: string;
    targetType: 'post' | 'comment';
    content?: string;
    authorId?: string;
    authorName?: string;
    isAnonymous?: boolean;
};

type UseUgcEntryActionsOptions = {
    currentUserId?: string | null;
    ensureLoggedIn: () => boolean;
    onFlash?: (id: string) => void;
};

const REPORT_REASONS: Array<{ label: string; value: ReportReason }> = [
    { label: '垃圾内容', value: 'spam' },
    { label: '骚扰辱骂', value: 'harassment' },
    { label: '仇恨/歧视', value: 'hate_speech' },
    { label: '色情低俗', value: 'sexual_content' },
    { label: '其他', value: 'other' },
];

export function useUgcEntryActions(options: UseUgcEntryActionsOptions) {
    const { currentUserId, ensureLoggedIn, onFlash } = options;
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
                reason,
            });

            if (result.success) {
                Alert.alert('已举报', '感谢你帮助维护社区安全。我们将核实此内容。');
            } else {
                Alert.alert('举报失败', '请稍后再试。');
            }
        } catch (error) {
            console.error('Error reporting UGC item:', error);
            Alert.alert('举报失败', '请稍后再试。');
        }
    }, [closeActions, currentUserId, target]);

    const handleReport = useCallback(() => {
        Alert.alert(
            '举报内容',
            '你为什么要举报这个内容？',
            [
                ...REPORT_REASONS.map((reason) => ({
                    text: reason.label,
                    onPress: () => {
                        void handleReportReason(reason.value);
                    },
                })),
                { text: '取消', style: 'cancel' as const },
            ],
        );
    }, [handleReportReason]);

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
            Alert.alert('无法复制', '这条内容暂无可复制文本。');
            return;
        }

        try {
            await Clipboard.setStringAsync(content);
            closeActions();
            Alert.alert('已复制', '内容已复制到剪贴板。');
        } catch (error) {
            console.error('Error copying UGC content:', error);
            Alert.alert('复制失败', '请稍后再试。');
        }
    }, [closeActions, target?.content]);

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
                            <Text style={styles.actionText}>私信</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.actionButton} activeOpacity={0.85} onPress={handleCopy}>
                        <View style={[styles.iconWrap, styles.copyIconWrap]}>
                            <Copy size={18} color="#0F766E" />
                        </View>
                        <Text style={styles.actionText}>复制</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} activeOpacity={0.85} onPress={handleReport}>
                        <View style={[styles.iconWrap, styles.reportIconWrap]}>
                            <ShieldAlert size={18} color="#DC2626" />
                        </View>
                        <Text style={styles.actionText}>举报</Text>
                    </TouchableOpacity>
                    {target?.isAnonymous && (
                        <View style={styles.hintRow}>
                            <MessageCircleWarning size={14} color="#94A3B8" />
                            <Text style={styles.hintText}>匿名内容仅支持举报</Text>
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
