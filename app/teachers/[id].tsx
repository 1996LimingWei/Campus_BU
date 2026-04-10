import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
    ArrowLeft,
    Plus,
    Star,
    Trash2,
    X,
    Zap
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCurrentUser } from '../../services/auth';
import {
    deleteTeacherReview,
    getTeacherById,
    getTeacherReviews,
    submitTeacherReview,
    summarizeTeacherReviews
} from '../../services/teachers';
import { Teacher, TeacherReview } from '../../types';
import { CachedRemoteImage } from '../../components/common/CachedRemoteImage';
import { isRemoteImageUrl } from '../../utils/remoteImage';
import { isHKBUEmail } from '../../utils/userUtils';
import { EduBadge } from '../../components/common/EduBadge';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { useUgcEntryActions } from '../../hooks/useUgcEntryActions';

// 根据姓名生成首字母
const getInitials = (name: string): string => {
    const parts = name.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0]?.[0] || '?').toUpperCase();
};

// 根据姓名生成专属配色
const AVATAR_COLORS = [
    '#1E3A8A', '#7C3AED', '#059669', '#DC2626', '#D97706',
    '#0891B2', '#BE185D', '#4338CA', '#065F46', '#9333EA',
    '#B45309', '#1D4ED8', '#047857', '#7C2D12', '#6D28D9',
];
const getAvatarColor = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export default function TeacherDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [teacher, setTeacher] = useState<Teacher | null>(null);
    const [reviews, setReviews] = useState<TeacherReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<string | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [rating, setRating] = useState(0);
    const [difficulty, setDifficulty] = useState(0);
    const [comment, setComment] = useState('');
    const [tags, setTags] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const { checkLogin } = useLoginPrompt();
    const ugcActions = useUgcEntryActions({
        currentUserId,
        ensureLoggedIn: () => !!checkLogin(currentUserId),
        onBlockedUser: (blockedUserId) => {
            setReviews((prev) => prev.filter((review) => review.authorId !== blockedUserId));
        },
    });

    useEffect(() => {
        loadData();
        getCurrentUser().then(u => setCurrentUserId(u?.uid || null));
    }, [id]);

    const loadData = async () => {
        if (!id) return;
        try {
            setLoading(true);
            const user = await getCurrentUser();
            setCurrentUserId(user?.uid || null);

            const teacherData = await getTeacherById(id as string);
            setTeacher(teacherData);

            const reviewsData = await getTeacherReviews(id as string, user?.uid);
            setReviews(reviewsData);

            // Generate AI summary if enough reviews
            if (reviewsData.length >= 3) {
                setSummaryLoading(true);
                summarizeTeacherReviews(id as string)
                    .then(s => setSummary(s))
                    .catch(err => console.log('Summary failed', err))
                    .finally(() => setSummaryLoading(false));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (rating === 0) {
            Alert.alert('Error', 'Please provide a rating');
            return;
        }

        try {
            setSubmitting(true);
            const user = await getCurrentUser();
            if (!user) {
                Alert.alert('Error', 'You must be logged in to review');
                return;
            }

            await submitTeacherReview({
                teacherId: id as string,
                authorId: user.uid,
                rating,
                difficulty,
                tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                content: comment,
            });

            setModalVisible(false);
            setRating(0);
            setDifficulty(0);
            setComment('');
            setTags('');

            // Reload
            loadData();
            Alert.alert('Success', 'Review submitted anonymously!');
        } catch (err: any) {
            Alert.alert('Error', err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteTeacherReview = (reviewId: string) => {
        Alert.alert(
            '删除评价',
            '确定要删除这条评价吗？此操作不可撤销。',
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '删除', style: 'destructive',
                    onPress: async () => {
                        const { success, error } = await deleteTeacherReview(reviewId, id as string);
                        if (success) {
                            setReviews(prev => prev.filter(r => r.id !== reviewId));
                        } else {
                            Alert.alert('Error', `Failed to delete review: ${error}`);
                        }
                    }
                }
            ]
        );
    };

    // Safe Area for Custom Header
    const headerHeight = Platform.OS === 'ios' ? 44 : 56;
    const totalHeaderHeight = insets.top + headerHeight;

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* 1. Custom Header (Always Visible) */}
            <View style={[styles.customHeader, { paddingTop: insets.top, height: totalHeaderHeight }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={24} color="#1E3A8A" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {loading ? t('common.loading') : (teacher?.name || 'Teacher not found')}
                </Text>
                <View style={{ width: 40 }} />
            </View>

            {/* 2. Content */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                </View>
            ) : !teacher ? (
                <View style={styles.center}>
                    <Text>Teacher not found.</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={[styles.content, { paddingTop: totalHeaderHeight }]}>
                    {/* Profile Section */}
                    <View style={styles.profileSection}>
                        <View style={[styles.initialsAvatarLarge, { backgroundColor: getAvatarColor(teacher.name) }]}>
                            <Text style={styles.initialsTextLarge}>{getInitials(teacher.name)}</Text>
                        </View>

                        <Text style={styles.nameLarge}>{teacher.name}</Text>
                        <Text style={styles.titleLarge}>{teacher.title}</Text>
                        <Text style={styles.deptLarge}>{teacher.department}</Text>

                        <View style={styles.statsCard}>
                            <View style={styles.statItem}>
                                <View style={styles.statValueRow}>
                                    <Star size={20} color="#F59E0B" fill="#F59E0B" />
                                    <Text style={styles.statValue}>{teacher.ratingAvg.toFixed(1)}</Text>
                                </View>
                                <Text style={styles.statLabel}>{t('teachers.overall_score')}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{reviews.length}</Text>
                                <Text style={styles.statLabel}>{t('teachers.reviews_count', { count: reviews.length }).replace('Reviews', '').replace('条评价', '').trim()}</Text>
                            </View>
                        </View>

                        {/* AI Summary */}
                        {(summary || summaryLoading) && (
                            <View style={styles.aiCard}>
                                <View style={styles.aiHeader}>
                                    <Zap size={16} color="#7C3AED" fill="#7C3AED" />
                                    <Text style={styles.aiTitle}>AI Summary</Text>
                                </View>
                                {summaryLoading ? (
                                    <ActivityIndicator size="small" color="#7C3AED" />
                                ) : (
                                    <Text style={styles.aiText}>{summary}</Text>
                                )}
                            </View>
                        )}
                    </View>

                    {/* Reviews List */}
                    <View style={styles.reviewsList}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Student Reviews</Text>
                            <TouchableOpacity 
                                style={styles.rateBtn} 
                                onPress={() => {
                                    if (checkLogin(currentUserId)) {
                                        setModalVisible(true);
                                    }
                                }}
                            >
                                <Plus size={16} color="#fff" />
                                <Text style={styles.rateBtnText}>{t('teachers.rate')}</Text>
                            </TouchableOpacity>
                        </View>

                        {reviews.length === 0 ? (
                            <Text style={styles.emptyText}>{t('teachers.no_reviews')}</Text>
                        ) : (
                            reviews.map(review => (
                                <Animated.View
                                    key={review.id}
                                    style={[styles.reviewCard, ugcActions.getHighlightStyle(review.id)]}
                                >
                                    <TouchableOpacity
                                        activeOpacity={0.96}
                                        onLongPress={() => ugcActions.openActions({
                                            id: review.id,
                                            targetId: review.id,
                                            targetType: 'teacher_review',
                                            content: review.content,
                                            authorId: review.authorName === '匿名的同学' ? undefined : review.authorId,
                                            authorName: review.authorName,
                                            isAnonymous: review.authorName === '匿名的同学',
                                        })}
                                    >
                                    <View style={styles.reviewHeader}>
                                        <View style={styles.reviewerInfo}>
                                            <View style={styles.reviewerAvatar}>
                                                {isRemoteImageUrl(review.authorAvatar) ? (
                                                    <CachedRemoteImage uri={review.authorAvatar} style={styles.avatarImage} />
                                                ) : (
                                                    <Text style={styles.reviewerInitial}>
                                                        {review.authorName ? review.authorName.charAt(0).toUpperCase() : 'S'}
                                                    </Text>
                                                )}
                                            </View>
                                            <View>
                                                <View style={styles.reviewerNameRow}>
                                                    <Text style={styles.reviewerName}>
                                                        {review.authorName || t('teachers.anonymous_student')}
                                                    </Text>
                                                    <EduBadge shouldShow={isHKBUEmail(review.authorEmail)} size="small" />
                                                </View>
                                                <Text style={styles.reviewDate}>
                                                    {new Date(review.createdAt).toLocaleDateString()}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={styles.reviewRating}>
                                            <Star size={14} color="#F59E0B" fill="#F59E0B" />
                                            <Text style={styles.reviewRatingText}>{review.rating.toFixed(1)}</Text>
                                        </View>
                                    </View>

                                    {review.tags && review.tags.length > 0 && (
                                        <View style={styles.tagsRow}>
                                            {review.tags.map((tag, i) => (
                                                <View key={i} style={styles.tagBadge}>
                                                    <Text style={styles.tagText}>{tag}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}

                                    <Text style={styles.comment}>{review.content}</Text>

                                    {review.difficulty > 0 && (
                                        <View style={styles.difficultyBadge}>
                                            <Text style={styles.difficultyText}>
                                                {t('teachers.difficulty')}: {review.difficulty.toFixed(1)}
                                            </Text>
                                        </View>
                                    )}

                                    {currentUserId && review.authorId === currentUserId && (
                                        <TouchableOpacity
                                            onPress={() => handleDeleteTeacherReview(review.id)}
                                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-end' }}
                                        >
                                            <Trash2 size={14} color="#EF4444" />
                                            <Text style={{ fontSize: 12, color: '#EF4444' }}>删除评价</Text>
                                        </TouchableOpacity>
                                    )}
                                    </TouchableOpacity>
                                </Animated.View>
                            ))
                        )}
                    </View>
                </ScrollView>
            )}
            {ugcActions.ActionSheet}

            {/* Rating Modal */}
            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('teachers.submit_review')}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <X size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.formScroll}>
                            <Text style={styles.label}>{t('teachers.teaching_quality')} (1-5)</Text>
                            <View style={styles.starRow}>
                                {[1, 2, 3, 4, 5].map(s => (
                                    <TouchableOpacity key={s} onPress={() => setRating(s)}>
                                        <Star
                                            size={32}
                                            color={s <= rating ? "#F59E0B" : "#D1D5DB"}
                                            fill={s <= rating ? "#F59E0B" : "none"}
                                            style={{ marginRight: 8 }}
                                        />
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.label}>{t('teachers.difficulty')} (1-5)</Text>
                            <View style={styles.diffRow}>
                                {[1, 2, 3, 4, 5].map(d => (
                                    <TouchableOpacity
                                        key={d}
                                        style={[
                                            styles.diffBtn,
                                            difficulty === d && styles.diffBtnActive
                                        ]}
                                        onPress={() => setDifficulty(d)}
                                    >
                                        <Text style={[
                                            styles.diffBtnText,
                                            difficulty === d && styles.diffBtnTextActive
                                        ]}>{d}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.label}>{t('teachers.comment_placeholder')}</Text>
                            <TextInput
                                style={styles.textArea}
                                multiline
                                numberOfLines={4}
                                placeholder={t('teachers.comment_placeholder')}
                                value={comment}
                                onChangeText={setComment}
                            />

                            <Text style={styles.label}>{t('teachers.tags')} (Comma separated)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Tough Grader, Inspiring"
                                value={tags}
                                onChangeText={setTags}
                            />

                            <TouchableOpacity
                                style={[styles.submitBtn, submitting && styles.disabledBtn]}
                                onPress={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.submitBtnText}>{t('common.submit')}</Text>
                                )}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
    },
    customHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        zIndex: 999,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    backBtn: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111827',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 16,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        paddingBottom: 40,
    },
    profileSection: {
        backgroundColor: '#fff',
        alignItems: 'center',
        padding: 24,
        paddingTop: 32, // Add some top padding incase header overlaps
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 4,
    },
    initialsAvatarLarge: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    initialsTextLarge: {
        color: '#fff',
        fontSize: 36,
        fontWeight: '800',
    },
    nameLarge: {
        fontSize: 24,
        fontWeight: '800',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 4,
    },
    titleLarge: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 2,
    },
    deptLarge: {
        fontSize: 14,
        color: '#1E3A8A',
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 20,
    },
    statsCard: {
        flexDirection: 'row',
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
        width: '100%',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    divider: {
        width: 1,
        backgroundColor: '#E5E7EB',
    },
    statValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
        marginLeft: 4,
    },
    statLabel: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
    },
    aiCard: {
        marginTop: 20,
        backgroundColor: '#F5F3FF',
        borderRadius: 12,
        padding: 16,
        width: '100%',
        borderWidth: 1,
        borderColor: '#DDD6FE',
    },
    aiHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    aiTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#7C3AED',
        marginLeft: 6,
    },
    aiText: {
        fontSize: 13,
        color: '#5B21B6',
        lineHeight: 20,
    },
    reviewsList: {
        padding: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#111827',
    },
    rateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    rateBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },
    emptyText: {
        textAlign: 'center',
        color: '#9CA3AF',
        marginTop: 20,
    },
    reviewCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    reviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    reviewerInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    reviewerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    reviewerInitial: {
        fontSize: 14,
        fontWeight: '700',
        color: '#6B7280',
    },
    reviewerName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111827',
        marginRight: 6,
    },
    reviewerNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    reviewDate: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    reviewRating: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFBEB',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    reviewRatingText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#D97706',
        marginLeft: 4,
    },
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 8,
    },
    tagBadge: {
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginRight: 6,
        marginBottom: 4,
    },
    tagText: {
        fontSize: 11,
        color: '#4B5563',
    },
    comment: {
        fontSize: 14,
        color: '#374151',
        lineHeight: 22,
        marginBottom: 12,
    },
    difficultyBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#FEF2F2',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    difficultyText: {
        fontSize: 11,
        color: '#EF4444',
        fontWeight: '500',
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
        maxHeight: '80%',
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    formScroll: {
        padding: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginTop: 16,
        marginBottom: 8,
    },
    starRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    diffRow: {
        flexDirection: 'row',
        gap: 8,
    },
    diffBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    diffBtnActive: {
        backgroundColor: '#1E3A8A',
        borderColor: '#1E3A8A',
    },
    diffBtnText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#4B5563',
    },
    diffBtnTextActive: {
        color: '#fff',
    },
    textArea: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 12,
        height: 100,
        textAlignVertical: 'top',
        fontSize: 15,
        color: '#111827',
    },
    input: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        color: '#111827',
        marginBottom: 24,
    },
    submitBtn: {
        backgroundColor: '#1E3A8A',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 16,
        marginBottom: 32,
    },
    disabledBtn: {
        opacity: 0.7,
    },
    submitBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});
