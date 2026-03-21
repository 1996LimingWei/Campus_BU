import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeftRight, BookOpen, GraduationCap, Plus, Search, Star } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    FlatList,
    InteractionManager,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { Skeleton } from '../../components/common/Skeleton';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { useCourseActivity } from '../../context/CourseActivityContext';
import { getCurrentUser } from '../../services/auth';
import { enrichCoursesWithReviewStats, getLocalCourses } from '../../services/courses';
import {
    loadCourseFavorites,
    saveCourseFavoritesLocal,
    setCourseFavoriteRemote
} from '../../services/favorites';
import { supabase } from '../../services/supabase';
import { Course } from '../../types';

// Mock Data as fallback/initial
const MOCK_COURSES: Course[] = [
    {
        id: '1',
        code: 'COMP3015',
        name: 'Data Communications and Networking',
        instructor: 'Dr. Jean Lai',
        department: 'Computer Science',
        credits: 3,
        rating: 4.5,
        reviewCount: 12
    }
];

export default function CoursesScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [courses, setCourses] = useState<Course[]>([]);
    const [favoriteCourseIds, setFavoriteCourseIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [allowRemoteFavorites, setAllowRemoteFavorites] = useState(false);
    const { checkLogin } = useLoginPrompt();
    const { unreadByCourse, refresh: refreshCourseActivity } = useCourseActivity();

    const CourseSkeleton = () => (
        <View style={styles.skeletonCard}>
            <View style={{ flex: 1 }}>
                <Skeleton width="70%" height={18} style={{ marginBottom: 8 }} />
                <Skeleton width="40%" height={12} style={{ marginBottom: 12 }} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Skeleton width={60} height={20} borderRadius={10} />
                    <Skeleton width={60} height={20} borderRadius={10} />
                </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Skeleton width={40} height={40} borderRadius={8} />
            </View>
        </View>
    );

    const fetchCourses = async (isSilent = false) => {
        if (!isSilent && courses.length === 0) {
            setLoading(true);
        }
        try {
            const normalizeCode = (value?: string) => (value || '').toUpperCase().replace(/\s+/g, '');

            // 1. Fetch from Supabase (may fail if table missing)
            const { data: dbData, error: dbError } = await supabase
                .from('courses')
                .select('*')
                .order('created_at', { ascending: false });

            let dbCourses: Course[] = [];
            if (dbData && !dbError) {
                dbCourses = dbData.map(d => ({
                    id: d.id,
                    code: d.code,
                    name: d.name || '',
                    instructor: d.instructor || '',
                    department: d.department || '',
                    credits: d.credits || 3,
                    rating: d.rating || 0,
                    reviewCount: d.review_count || 0
                }));
            }

            // 2. Fetch from Local Storage
            const localCourses = await getLocalCourses();

            // 3. Merge by course code first (preferred), fallback to id.
            // This avoids duplicate local/db entries for the same course.
            const courseMap = new Map<string, Course>();
            const keyOf = (c: Course) => normalizeCode(c.code) || c.id;

            localCourses.forEach(c => courseMap.set(keyOf(c), c));

            dbCourses.forEach(c => {
                const key = keyOf(c);
                const existing = courseMap.get(key);
                if (!existing) {
                    courseMap.set(key, c);
                    return;
                }
                // Prefer DB ID when available so downstream queries align with canonical rows.
                const merged: Course = {
                    ...existing,
                    ...c,
                    id: c.id || existing.id,
                    code: existing.code || c.code,
                    name: existing.name || c.name,
                    instructor: existing.instructor || c.instructor,
                    department: existing.department || c.department,
                    credits: existing.credits || c.credits,
                    reviewCount: Math.max(existing.reviewCount || 0, c.reviewCount || 0),
                    rating: (c.reviewCount || 0) > 0 ? c.rating : existing.rating,
                };
                courseMap.set(key, merged);
            });

            MOCK_COURSES.forEach(mock => {
                const key = keyOf(mock);
                if (!courseMap.has(key)) {
                    courseMap.set(key, mock);
                }
            });

            const mergedCourses = Array.from(courseMap.values());
            const coursesWithStats = await enrichCoursesWithReviewStats(mergedCourses);
            setCourses(coursesWithStats);
        } catch (err) {
            console.log('Fetch courses silent error (expected if table missing):', err);
            // Fallback to local + mock if everything fails
            const localOnly = await getLocalCourses();
            const normalizeCode = (value?: string) => (value || '').toUpperCase().replace(/\s+/g, '');
            const fallbackMap = new Map<string, Course>();
            localOnly.forEach(c => fallbackMap.set(normalizeCode(c.code) || c.id, c));
            MOCK_COURSES.forEach(mock => {
                const key = normalizeCode(mock.code) || mock.id;
                if (!fallbackMap.has(key)) {
                    fallbackMap.set(key, mock);
                }
            });
            const mergedFallback = Array.from(fallbackMap.values());
            const fallbackWithStats = await enrichCoursesWithReviewStats(mergedFallback);
            setCourses(fallbackWithStats);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            const task = InteractionManager.runAfterInteractions(() => {
                fetchCourses(true); // Silent update on focus
                loadFavorites();
                void refreshCourseActivity();
            });
            return () => task.cancel();
        }, [refreshCourseActivity])
    );

    const loadFavorites = async () => {
        try {
            const user = await getCurrentUser();
            const canRemote = !!user?.uid && !user?.isDemo;
            setCurrentUserId(canRemote ? user.uid : null);
            setAllowRemoteFavorites(canRemote);

            const ids = await loadCourseFavorites(canRemote ? user.uid : null, canRemote);
            setFavoriteCourseIds(ids);
        } catch (e) {
            console.error('Error loading favorite courses:', e);
        }
    };

    const toggleFavorite = async (courseId: string) => {
        if (!checkLogin(currentUserId)) return;
        const isFavorite = favoriteCourseIds.includes(courseId);
        const nextFavorites = isFavorite
            ? favoriteCourseIds.filter(id => id !== courseId)
            : [...favoriteCourseIds, courseId];
        setFavoriteCourseIds(nextFavorites);

        try {
            await saveCourseFavoritesLocal(nextFavorites);
            if (allowRemoteFavorites && currentUserId) {
                await setCourseFavoriteRemote(currentUserId, courseId, !isFavorite);
            }
            await refreshCourseActivity();
        } catch (e) {
            console.error('Error saving favorite courses:', e);
        }
    };

    const filteredCourses = courses.filter(course => {
        const query = (searchQuery || '').toLowerCase();
        return (
            (course.code || '').toLowerCase().includes(query) ||
            (course.name || '').toLowerCase().includes(query) ||
            (course.instructor || '').toLowerCase().includes(query)
        );
    });
    const favoriteCourses = courses.filter(course => favoriteCourseIds.includes(course.id));

    const handleCoursePress = (courseId: string) => {
        if (!checkLogin(currentUserId)) return;
        router.push(`/courses/${courseId}` as any);
    };

    const handleAddCourse = () => {
        if (checkLogin(currentUserId)) {
            router.push('/courses/add');
        }
    };

    const renderCourseItem = ({ item }: { item: Course }) => {
        const hasUnread = !!unreadByCourse[item.id]?.hasAnyUnread;

        return (
        <TouchableOpacity
            style={styles.courseCard}
            onPress={() => handleCoursePress(item.id)}
        >
            {hasUnread && <View style={styles.courseUnreadDot} />}
            <View style={styles.courseRow}>
                <View style={styles.courseMain}>
                    <View style={styles.courseHeader}>
                        <View style={styles.codeContainer}>
                            <Text style={styles.courseCode}>{item.code}</Text>
                        </View>
                    </View>
                    <Text style={styles.courseName}>{item.name}</Text>
                    <Text style={styles.deptText}>{item.department}</Text>
                </View>

                <View style={styles.courseStatsColumn}>
                    <View style={styles.ratingContainer}>
                        <Star size={14} color="#FFD700" fill="#FFD700" />
                        <Text style={styles.ratingText}>{(item.rating || 0).toFixed(1)}</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.favoriteButton}
                        onPress={(e: any) => {
                            e?.stopPropagation?.();
                            toggleFavorite(item.id);
                        }}
                    >
                        <Star
                            size={18}
                            color={favoriteCourseIds.includes(item.id) ? '#FFD700' : '#D1D5DB'}
                            fill={favoriteCourseIds.includes(item.id) ? '#FFD700' : 'transparent'}
                        />
                    </TouchableOpacity>
                    <Text style={styles.reviewCount}>{t('teachers.reviews_count', { count: item.reviewCount })}</Text>
                </View>
            </View>
        </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <Text style={styles.headerTitle}>{t('courses.title')}</Text>
                    <View style={styles.headerRightActions}>
                        <TouchableOpacity style={styles.headerActionButton} onPress={handleAddCourse}>
                            <Plus size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Search size={20} color="#9CA3AF" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder={t('courses.search_placeholder')}
                        placeholderTextColor="#9CA3AF"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {favoriteCourses.length > 0 && !searchQuery && (
                <View style={styles.favoritesSection}>
                    <Text style={styles.favoritesTitle}>⭐ {t('courses.favorites')}</Text>
                    <FlatList
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        data={favoriteCourses}
                        keyExtractor={(item) => `fav-${item.id}`}
                        contentContainerStyle={styles.favoritesList}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.favoriteCard}
                                onPress={() => handleCoursePress(item.id)}
                            >
                                {!!unreadByCourse[item.id]?.hasAnyUnread && <View style={styles.favoriteUnreadDot} />}
                                <Text style={styles.favoriteCode}>{(item.code || '').toUpperCase()}</Text>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            )}

            <Text style={styles.allCoursesTitle}>{t('courses.all_courses')}</Text>

            {/* Course List */}
            <FlatList
                data={filteredCourses}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={renderCourseItem}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => fetchCourses(true)}
                        tintColor="#1E3A8A"
                    />
                }
                initialNumToRender={8}
                maxToRenderPerBatch={5}
                windowSize={5}
                removeClippedSubviews={true}
                ListEmptyComponent={
                    loading ? (
                        <View style={{ paddingTop: 10 }}>
                            <CourseSkeleton />
                            <CourseSkeleton />
                            <CourseSkeleton />
                            <CourseSkeleton />
                            <CourseSkeleton />
                        </View>
                    ) : (
                        <View style={styles.emptyState}>
                            <BookOpen size={48} color="#D1D5DB" />
                            <Text style={styles.emptyText}>{t('courses.no_courses_found')}</Text>
                            <TouchableOpacity style={styles.addCourseButton} onPress={handleAddCourse}>
                                <Text style={styles.addCourseText}>{t('courses.add_new_course')}</Text>
                            </TouchableOpacity>
                        </View>
                    )
                }
            />

            {/* Teacher Review FAB */}
            <TouchableOpacity
                testID="rate-fab"
                style={styles.teacherFab}
                onPress={() => router.push('/teachers' as any)}
            >
                <GraduationCap size={24} color="#fff" />
                <View style={[styles.fabBadge, { backgroundColor: '#1E3A8A' }]}>
                    <Text style={styles.fabBadgeText}>{t('teachers.rate')}</Text>
                </View>
            </TouchableOpacity>

            {/* Exchange FAB */}
            <TouchableOpacity
                style={styles.exchangeFab}
                onPress={() => router.push('/courses/exchange' as any)}
            >
                <ArrowLeftRight size={24} color="#fff" />
                <View style={styles.fabBadge}>
                    <Text style={styles.fabBadgeText}>{t('teachers.swap')}</Text>
                </View>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    skeletonCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    header: {
        paddingTop: 56,
        paddingBottom: 24,
        paddingHorizontal: 20,
        backgroundColor: '#1E3A8A',
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    headerRightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerActionButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
    },
    searchContainer: {
        paddingHorizontal: 20,
        marginTop: -24,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#111827',
        marginLeft: 12,
        lineHeight: 20,
        paddingVertical: 0,
    },
    listContent: {
        padding: 20,
        paddingTop: 12,
    },
    favoritesSection: { paddingTop: 12, paddingBottom: 8 },
    favoritesTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    favoritesList: { paddingHorizontal: 20 },
    favoriteCard: {
        backgroundColor: '#FEF3C7',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginRight: 10,
        maxWidth: 180,
        borderWidth: 1,
        borderColor: '#FDE68A',
        position: 'relative',
    },
    favoriteCode: {
        fontSize: 13,
        fontWeight: '700',
        color: '#92400E',
    },
    favoriteUnreadDot: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: '#EF4444',
    },
    allCoursesTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        paddingHorizontal: 20,
        marginTop: 4,
        marginBottom: 8,
    },
    courseCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        position: 'relative',
    },
    courseUnreadDot: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 10,
        height: 10,
        borderRadius: 999,
        backgroundColor: '#EF4444',
        zIndex: 2,
    },
    courseRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    courseMain: {
        flex: 1,
        paddingRight: 12,
    },
    courseHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        marginBottom: 8,
    },
    codeContainer: {
        backgroundColor: '#F3E8FF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    courseCode: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1E3A8A',
    },
    ratingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF9C4',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    ratingText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#F59E0B',
        marginLeft: 4,
    },
    courseStatsColumn: {
        width: 90,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
    },
    favoriteButton: {
        padding: 8,
    },
    courseName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 8,
    },
    instructorText: {
        fontSize: 14,
        color: '#4B5563',
        marginBottom: 12,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        paddingTop: 12,
    },
    deptText: {
        fontSize: 12,
        color: '#6B7280',
    },
    reviewCount: {
        fontSize: 11,
        color: '#9CA3AF',
        textAlign: 'right',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        fontSize: 16,
        color: '#6B7280',
        marginTop: 12,
        marginBottom: 20,
    },
    addCourseButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: '#1E3A8A',
        borderRadius: 20,
    },
    addCourseText: {
        color: '#fff',
        fontWeight: '600',
    },
    exchangeFab: {
        position: 'absolute',
        bottom: 110, // Adjust bottom to leave space
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#8B5CF6',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
        zIndex: 9999,
    },
    teacherFab: {
        position: 'absolute',
        bottom: 180, // Higher than exchangeFab
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
        zIndex: 9999,
    },
    fabBadge: {
        position: 'absolute',
        top: -10,
        right: -6,
        backgroundColor: '#EF4444',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#fff',
        minWidth: 40,
        alignItems: 'center',
    },
    fabBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
});
