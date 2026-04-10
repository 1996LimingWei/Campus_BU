import { formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { ChevronRight, Flag, Heart, MapPin, MessageCircle, MoreVertical, Share2, Trash2, UserMinus, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, DeviceEventEmitter, Dimensions, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    CurvedTransition,
    FadeIn,
    FadeOut,
    SlideInDown,
    SlideOutDown,
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';
import { sendDirectMessage } from '../../services/messages';
import { blockUser, reportContent, ReportReason } from '../../services/moderation';
import { Post } from '../../types';
import { isRemoteImageUrl } from '../../utils/remoteImage';
import { isAdminSync, isHKBUEmail } from '../../utils/userUtils';
import { AdminBadge } from '../common/AdminBadge';
import { CachedRemoteImage } from '../common/CachedRemoteImage';
import { EduBadge } from '../common/EduBadge';
import { SharePostModal } from './SharePostModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PostCardProps {
    post: Post;
    onLike?: () => void;
    onComment?: () => void;
    onPress?: () => void;
    onDelete?: () => void;
    currentUserId?: string;
}

export const PostCard: React.FC<PostCardProps> = React.memo(({ post, onLike, onComment, onPress, onDelete, currentUserId }) => {
    const { t } = useTranslation();
    const [zoomImage, setZoomImage] = useState<string | null>(null);
    const [showMenu, setShowMenu] = useState(false);
    const [showReasons, setShowReasons] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);

    const timeAgo = formatDistanceToNow(post.createdAt, { addSuffix: true });
    const pressed = useSharedValue(1);

    const categoryColors: Record<string, string> = {
        'Events': '#FF6B6B',
        'Reviews': '#4ECDC4',
        'Guides': '#FFE66D',
        'Lost & Found': '#95E1D3',
    };

    const renderImages = () => {
        const images = post.images || (post.imageUrl ? [post.imageUrl] : []);
        if (images.length === 0) return null;

        if (images.length === 1) {
            return (
                <TouchableOpacity
                    style={styles.imageContainer}
                    onPress={() => setZoomImage(images[0])}
                    activeOpacity={0.9}
                >
                    <CachedRemoteImage
                        uri={images[0]}
                        style={styles.image}
                    />
                </TouchableOpacity>
            );
        }

        return (
            <View style={styles.multiImageContainer}>
                {images.map((img, idx) => (
                    <TouchableOpacity
                        key={idx}
                        style={[
                            styles.gridImageWrapper,
                            images.length === 2 && { width: '49%', aspectRatio: 1 },
                            images.length === 3 && { width: '32%', aspectRatio: 1 }
                        ]}
                        onPress={() => setZoomImage(img)}
                        activeOpacity={0.9}
                    >
                        <CachedRemoteImage uri={img} style={styles.gridImage} />
                    </TouchableOpacity>
                ))}
            </View>
        );
    };

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pressed.value }],
    }));

    const onPressIn = () => {
        pressed.value = withSpring(0.98, { damping: 20, stiffness: 100 });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const onPressOut = () => {
        pressed.value = withSpring(1, { damping: 20, stiffness: 100 });
    };

    const submitReport = async (reason: ReportReason) => {
        if (!currentUserId) return;
        try {
            setShowReasons(false);
            setShowMenu(false);
            await reportContent({
                reporterId: currentUserId,
                targetId: post.id,
                targetType: 'post',
                reason,
            });
            Alert.alert(t('moderation.report_success_title'), t('moderation.report_success_msg'));
        } catch (e) {
            Alert.alert(t('common.error'), t('campus.modals.post_error'));
        }
    };

    const handleBlock = async () => {
        if (!currentUserId) return;
        setShowMenu(false);

        Alert.alert(
            t('moderation.block_title'),
            t('moderation.block_msg'),
            [
                {
                    text: t('moderation.block_confirm'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await blockUser(currentUserId, post.authorId);
                            DeviceEventEmitter.emit('user_blocked', { userId: post.authorId });
                            Alert.alert(t('common.success'), t('moderation.block_success'));
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        } catch (e) {
                            Alert.alert(t('common.error'), t('moderation.block_error') || 'Failed to block');
                        }
                    }
                },
                { text: t('common.cancel'), style: 'cancel' },
            ]
        );
    };

    const handleMoreAction = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setShowMenu(true);
    };

    const reportReasons: { id: ReportReason; label: string }[] = [
        { id: 'spam', label: t('moderation.report_reasons.spam') },
        { id: 'harassment', label: t('moderation.report_reasons.harassment') },
        { id: 'hate_speech', label: t('moderation.report_reasons.hate_speech') },
        { id: 'sexual_content', label: t('moderation.report_reasons.sexual_content') },
        { id: 'other', label: t('moderation.report_reasons.other') },
    ];

    return (
        <Animated.View
            layout={CurvedTransition.duration(400)}
            style={[styles.cardContainer, animatedStyle]}
        >
            <TouchableOpacity
                style={styles.container}
                onPress={onPress}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                activeOpacity={1}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.avatar}>
                        {!post.isAnonymous && isRemoteImageUrl(post.authorAvatar) ? (
                            <CachedRemoteImage uri={post.authorAvatar} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarText}>
                                {post.isAnonymous ? '?' : post.authorName.charAt(0)}
                            </Text>
                        )}
                    </View>
                    <View style={styles.authorInfo}>
                        <View style={styles.authorNameRow}>
                            <Text style={styles.authorName}>
                                {post.isAnonymous ? t('teachers.anonymous_student') : post.authorName}
                            </Text>
                            <EduBadge shouldShow={!post.isAnonymous && isHKBUEmail(post.authorEmail)} size="small" />
                            <AdminBadge shouldShow={!post.isAnonymous && isAdminSync(post.authorId)} size="small" />
                        </View>
                        <Text style={styles.timeText}>{timeAgo}</Text>
                    </View>
                    {post.category && (
                        <View style={[styles.categoryBadge, { backgroundColor: categoryColors[post.category] || '#E5E7EB' }]}>
                            <Text style={styles.categoryText}>{post.category}</Text>
                        </View>
                    )}
                    <TouchableOpacity
                        style={styles.moreButton}
                        onPress={handleMoreAction}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    >
                        <MoreVertical size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                </View>

                {/* Content */}
                <Text style={styles.content}>{post.content}</Text>

                {/* Location Tag */}
                {post.locationTag && (
                    <View style={styles.locationContainer}>
                        <MapPin size={12} color="#1E3A8A" />
                        <Text style={styles.locationTag}>{post.locationTag}</Text>
                    </View>
                )}

                {/* Images */}
                {renderImages()}

                {/* Actions */}
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.actionButton} onPress={onLike}>
                        <Heart
                            size={20}
                            color={post.isLiked ? '#EF4444' : '#6B7280'}
                            fill={post.isLiked ? '#EF4444' : 'transparent'}
                        />
                        <Text style={[styles.actionText, post.isLiked && { color: '#EF4444' }]}>{post.likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={onComment}>
                        <MessageCircle size={20} color="#6B7280" />
                        <Text style={styles.actionText}>{post.comments}</Text>
                    </TouchableOpacity>

                    {currentUserId === post.authorId && (
                        <TouchableOpacity
                            style={[styles.actionButton, { marginLeft: 'auto', marginRight: 0 }]}
                            onPress={onDelete}
                        >
                            <Trash2 size={20} color="#EF4444" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Image Zoom Modal */}
                <Modal visible={!!zoomImage} transparent={true} animationType="fade">
                    <View style={styles.modalContainer}>
                        <TouchableOpacity
                            style={styles.modalCloseButton}
                            onPress={() => setZoomImage(null)}
                        >
                            <X size={30} color="#fff" />
                        </TouchableOpacity>
                        {isRemoteImageUrl(zoomImage) && (
                            <CachedRemoteImage
                                uri={zoomImage}
                                style={styles.modalImage}
                                contentFit="contain"
                            />
                        )}
                    </View>
                </Modal>

                {/* Share Post Modal */}
                {currentUserId && (
                    <SharePostModal
                        visible={showShareModal}
                        onClose={() => setShowShareModal(false)}
                        currentUserId={currentUserId}
                        postId={post.id}
                        postContent={post.content}
                        postImageUrl={post.imageUrl}
                        onShare={async (receiverId, message) => {
                            await sendDirectMessage(currentUserId, receiverId, message);
                        }}
                    />
                )}

                {/* Custom Moderation Menu */}
                <Modal
                    visible={showMenu}
                    transparent={true}
                    animationType="none"
                    onRequestClose={() => setShowMenu(false)}
                >
                    <Pressable
                        style={styles.menuOverlay}
                        onPress={() => {
                            setShowMenu(false);
                            setShowReasons(false);
                        }}
                    >
                        <Animated.View
                            entering={FadeIn.duration(200)}
                            exiting={FadeOut.duration(200)}
                            style={styles.menuDim}
                        />
                        <Animated.View
                            entering={SlideInDown.duration(350)}
                            exiting={SlideOutDown.duration(250)}
                            style={styles.menuContent}
                        >
                            <View style={styles.menuIndicator} />

                            {!showReasons ? (
                                <>
                                    <Text style={styles.menuTitle}>{t('moderation.options_title')}</Text>

                                    <View style={styles.menuSection}>
                                        {/* Share Post Option - Always at the top */}
                                        {currentUserId && (
                                            <TouchableOpacity
                                                style={styles.menuItem}
                                                onPress={() => {
                                                    setShowMenu(false);
                                                    setShowShareModal(true);
                                                }}
                                            >
                                                <View style={[styles.menuIcon, { backgroundColor: '#EFF6FF' }]}>
                                                    <Share2 size={20} color="#1E3A8A" />
                                                </View>
                                                <Text style={styles.menuItemText}>{t('profile.share.share_post', '分享帖子')}</Text>
                                                <ChevronRight size={18} color="#D1D5DB" />
                                            </TouchableOpacity>
                                        )}

                                        <TouchableOpacity
                                            style={styles.menuItem}
                                            onPress={() => setShowReasons(true)}
                                        >
                                            <View style={[styles.menuIcon, { backgroundColor: '#FEF2F2' }]}>
                                                <Flag size={20} color="#EF4444" />
                                            </View>
                                            <Text style={styles.menuItemText}>{t('moderation.report_post')}</Text>
                                            <ChevronRight size={18} color="#D1D5DB" />
                                        </TouchableOpacity>

                                        {post.authorId !== currentUserId && (
                                            <TouchableOpacity
                                                style={styles.menuItem}
                                                onPress={handleBlock}
                                            >
                                                <View style={[styles.menuIcon, { backgroundColor: '#F3F4F6' }]}>
                                                    <UserMinus size={20} color="#1F2937" />
                                                </View>
                                                <Text style={styles.menuItemText}>{t('moderation.block_user')}</Text>
                                                <ChevronRight size={18} color="#D1D5DB" />
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {post.authorId === currentUserId && (
                                        <View style={styles.menuSection}>
                                            <TouchableOpacity
                                                style={styles.menuItem}
                                                onPress={() => {
                                                    setShowMenu(false);
                                                    onDelete?.();
                                                }}
                                            >
                                                <View style={[styles.menuIcon, { backgroundColor: '#FEF2F2' }]}>
                                                    <Trash2 size={20} color="#EF4444" />
                                                </View>
                                                <Text style={[styles.menuItemText, { color: '#EF4444' }]}>{t('campus.modals.delete_title')}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    <TouchableOpacity
                                        style={styles.cancelButton}
                                        onPress={() => setShowMenu(false)}
                                    >
                                        <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <>
                                    <View style={styles.reasonsHeader}>
                                        <TouchableOpacity
                                            onPress={() => setShowReasons(false)}
                                            style={styles.backButton}
                                        >
                                            <Text style={styles.backButtonText}>{t('common.back')}</Text>
                                        </TouchableOpacity>
                                        <Text style={styles.menuTitle}>{t('moderation.report_title')}</Text>
                                        <View style={{ width: 60 }} />
                                    </View>

                                    <View style={styles.menuSection}>
                                        <Text style={styles.menuSubtitle}>{t('moderation.report_desc')}</Text>
                                        {reportReasons.map((reason) => (
                                            <TouchableOpacity
                                                key={reason.id}
                                                style={styles.menuItem}
                                                onPress={() => submitReport(reason.id)}
                                            >
                                                <Text style={styles.menuItemText}>{reason.label}</Text>
                                                <ChevronRight size={18} color="#D1D5DB" />
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    <View style={{ height: 20 }} />
                                </>
                            )}
                        </Animated.View>
                    </Pressable>
                </Modal>
            </TouchableOpacity>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    cardContainer: {
        marginBottom: 12,
    },
    container: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 16,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    avatarText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    authorInfo: {
        flex: 1,
    },
    authorNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    authorName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        letterSpacing: -0.3,
        marginRight: 6,
    },
    timeText: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 2,
    },
    categoryBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    categoryText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#111827',
        textTransform: 'uppercase',
    },
    moreButton: {
        marginLeft: 8,
        padding: 6,
        backgroundColor: '#F9FAFB',
        borderRadius: 10,
    },
    content: {
        fontSize: 16,
        lineHeight: 24,
        color: '#374151',
        marginBottom: 12,
    },
    imageContainer: {
        width: '100%',
        height: 240,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        marginBottom: 12,
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    multiImageContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    gridImageWrapper: {
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#F3F4F6',
        marginBottom: 6,
    },
    gridImage: {
        width: '100%',
        height: '100%',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.95)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalCloseButton: {
        position: 'absolute',
        top: 60,
        right: 20,
        zIndex: 10,
        padding: 10,
    },
    modalImage: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT * 0.8,
    },
    actions: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        paddingTop: 16,
        marginTop: 4,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 28,
        backgroundColor: '#F9FAFB',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
    },
    actionText: {
        marginLeft: 8,
        fontSize: 14,
        fontWeight: '600',
        color: '#4B5563',
    },
    locationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        backgroundColor: '#F0F7FF',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        alignSelf: 'flex-start',
        gap: 6,
    },
    locationTag: {
        fontSize: 12,
        color: '#1E3A8A',
        fontWeight: '700',
    },
    // Custom Menu Styles
    menuOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    menuDim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    menuContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingBottom: 40,
        paddingTop: 12,
    },
    menuIndicator: {
        width: 36,
        height: 4,
        backgroundColor: '#E5E7EB',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    reasonsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    menuTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 16,
    },
    menuSubtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 12,
        paddingHorizontal: 12,
    },
    menuSection: {
        backgroundColor: '#F9FAFB',
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 20,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    menuIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    menuItemText: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
    },
    cancelButton: {
        backgroundColor: '#F3F4F6',
        borderRadius: 18,
        paddingVertical: 18,
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#4B5563',
    },
    backButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    backButtonText: {
        color: '#1E3A8A',
        fontSize: 15,
        fontWeight: '600',
    },
});
