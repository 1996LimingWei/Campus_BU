import AsyncStorage from '@react-native-async-storage/async-storage';
import { SEM2_COURSES_DATA } from '../constants/courses_sem2';
import { Course, Review } from '../types';
import { supabase } from './supabase';

const LOCAL_COURSES_KEY = 'hkcampus_local_courses';
const LOCAL_REVIEWS_KEY = 'hkcampus_local_reviews';

export const getLocalReviews = async (courseId: string): Promise<Review[]> => {
    try {
        const jsonValue = await AsyncStorage.getItem(LOCAL_REVIEWS_KEY);
        const allReviews: Review[] = jsonValue != null ? JSON.parse(jsonValue) : [];
        // Convert string dates back to Date objects
        return allReviews
            .filter(r => r.courseId === courseId)
            .map(r => ({ ...r, createdAt: new Date(r.createdAt) }));
    } catch (e) {
        console.error('Error loading local reviews:', e);
        return [];
    }
};

export const addLocalReview = async (review: Partial<Review>): Promise<{ error: any }> => {
    try {
        const jsonValue = await AsyncStorage.getItem(LOCAL_REVIEWS_KEY);
        const allReviews: Review[] = jsonValue != null ? JSON.parse(jsonValue) : [];

        const newReview: Review = {
            id: `lrev_${Date.now()}`,
            courseId: review.courseId!,
            authorId: review.authorId || 'local_user',
            authorName: review.authorName || 'Local Student',
            authorAvatar: review.authorAvatar || '👤',
            rating: review.rating, // Optional
            difficulty: review.difficulty || 3,
            content: review.content || '',
            tags: [],
            likes: 0,
            createdAt: new Date(),
            semester: review.semester || '2025 Spring'
        };

        const updated = [newReview, ...allReviews];
        await AsyncStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(updated));

        // Update local course rating if needed (optional refinement)
        const localCourses = await getLocalCourses();
        const courseIndex = localCourses.findIndex(c => c.id === review.courseId);
        if (courseIndex !== -1) {
            const courseReviews = updated.filter(r => r.courseId === review.courseId);
            const sum = courseReviews.reduce((acc, curr) => acc + (curr.rating || 0), 0);
            localCourses[courseIndex].rating = parseFloat((sum / courseReviews.length).toFixed(1));
            localCourses[courseIndex].reviewCount = courseReviews.length;
            await AsyncStorage.setItem(LOCAL_COURSES_KEY, JSON.stringify(localCourses));
        }

        return { error: null };
    } catch (e: any) {
        return { error: e };
    }
};

export const getLocalCourses = async (): Promise<Course[]> => {
    try {
        const jsonValue = await AsyncStorage.getItem(LOCAL_COURSES_KEY);
        const storageCourses: Course[] = jsonValue != null ? JSON.parse(jsonValue) : [];

        // Merge with static Sem2 data
        // Use a Map to avoid duplicates by 'id'
        const courseMap = new Map<string, Course>();

        // 1. Add static data first
        (SEM2_COURSES_DATA as Course[]).forEach(c => courseMap.set(c.id, c));

        // 2. Add storage data (can overwrite static if same ID, or add new ones)
        storageCourses.forEach(c => courseMap.set(c.id, c));

        const courses = Array.from(courseMap.values());

        // 3. Fetch review data from database for all local courses
        const courseIds = courses.map(c => c.id);
        const { data: reviewData, error } = await supabase
            .from('course_reviews')
            .select('course_id, rating')
            .in('course_id', courseIds)
            .not('rating', 'is', null);

        if (!error && reviewData) {
            // Calculate count and average rating per course
            const statsMap = new Map<string, { count: number; sum: number }>();
            reviewData.forEach(r => {
                const stats = statsMap.get(r.course_id) || { count: 0, sum: 0 };
                stats.count += 1;
                stats.sum += r.rating || 0;
                statsMap.set(r.course_id, stats);
            });

            // Update course review counts and ratings
            courses.forEach(course => {
                const stats = statsMap.get(course.id);
                if (stats && stats.count > 0) {
                    course.reviewCount = stats.count;
                    course.rating = parseFloat((stats.sum / stats.count).toFixed(1));
                } else {
                    course.reviewCount = 0;
                }
            });
        }

        return courses;
    } catch (e) {
        console.error('Error loading local courses:', e);
        return SEM2_COURSES_DATA as Course[];
    }
};

export const addLocalCourse = async (course: Partial<Course>): Promise<{ data: any; error: any }> => {
    try {
        const existing = await getLocalCourses();
        const newCourse: Course = {
            id: `local_${Date.now()}`,
            code: course.code?.toUpperCase() || 'UNKNOWN',
            name: course.name || '',
            instructor: course.instructor || '',
            department: course.department || '',
            credits: course.credits || 0,
            rating: 0,
            reviewCount: 0
        };

        const updated = [newCourse, ...existing];
        await AsyncStorage.setItem(LOCAL_COURSES_KEY, JSON.stringify(updated));
        return { data: newCourse, error: null };
    } catch (e: any) {
        return { data: null, error: e };
    }
};

export const getCourseByCode = async (code: string): Promise<Course | null> => {
    const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('code', code.toUpperCase())
        .single();

    if (error || !data) return null;
    return {
        id: data.id,
        code: data.code,
        name: data.name || '',
        instructor: data.instructor || '',
        department: data.department || '',
        credits: data.credits || 3,
        rating: data.rating || 0,
        reviewCount: data.review_count || 0
    };
};

export const addCourse = async (courseData: Partial<Course>): Promise<{ data: any; error: any }> => {
    // Check if code exists first (redundant but better UX)
    const existing = await getCourseByCode(courseData.code || '');
    if (existing) {
        return { data: null, error: { message: 'DUPLICATE_CODE' } };
    }

    const { data, error } = await supabase
        .from('courses')
        .insert({
            code: courseData.code?.toUpperCase(),
            name: courseData.name,
            instructor: courseData.instructor,
            department: courseData.department,
            credits: courseData.credits
        })
        .select('id, code, name') // Explicitly select to avoid relationship guesses
        .single();

    return { data, error };
};

export const getCourseById = async (id: string): Promise<Course | null> => {
    // 1. Check for Mock ID '1'
    if (id === '1') {
        return {
            id: '1',
            code: 'COMP3015',
            name: 'Data Communications and Networking',
            instructor: 'Dr. Jean Lai',
            department: 'Computer Science',
            credits: 3,
            rating: 4.5,
            reviewCount: 12
        };
    }

    // 2. Check for Local ID
    if (id.startsWith('local_')) {
        const localCourses = await getLocalCourses();
        return localCourses.find(c => c.id === id) || null;
    }

    // 3. Query Supabase
    const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) return null;
    return {
        id: data.id,
        code: data.code,
        name: data.name || '',
        instructor: data.instructor || '',
        department: data.department || '',
        credits: data.credits || 3,
        rating: data.rating || 0,
        reviewCount: data.review_count || 0
    };
};

export const getReviews = async (courseId: string): Promise<Review[]> => {
    // Query Supabase for all courses (including local_ ones)
    const { data, error } = await supabase
        .from('course_reviews')
        .select('*, author:users!author_id(email, display_name, avatar_url)')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('getReviews error:', error);
        return [];
    }
    if (!data) return [];
    return data.map(r => {
        const author = r.author;
        return {
            id: r.id,
            courseId: r.course_id,
            authorId: r.author_id,
            authorName: r.author_name || author?.display_name || 'Anonymous',
            authorEmail: author?.email,
            authorAvatar: r.author_avatar || author?.avatar_url || '👤',
            rating: r.rating,
            difficulty: r.difficulty || 3,
            content: r.content || '',
            tags: [],
            likes: r.likes || 0,
            createdAt: new Date(r.created_at),
            semester: r.semester || 'Current'
        };
    });
};

export const hasUserReviewed = async (courseId: string, userId: string): Promise<boolean> => {
    // Check in database for all courses (including local_ ones)

    const { count, error } = await supabase
        .from('course_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('course_id', courseId)
        .eq('author_id', userId)
        .not('rating', 'is', null);

    return !error && (count || 0) > 0;
};

export const addReview = async (reviewData: Partial<Review>): Promise<{ error: any }> => {
    const courseId = reviewData.courseId;

    // Insert the review to Supabase (all courses including local_ ones)
    const { error: insertError } = await supabase
        .from('course_reviews')
        .insert({
            course_id: courseId,
            author_id: reviewData.authorId,
            author_name: reviewData.authorName,
            author_avatar: reviewData.authorAvatar,
            rating: reviewData.rating,
            difficulty: reviewData.difficulty,
            content: reviewData.content,
            semester: reviewData.semester
        });

    if (insertError) {
        console.error('addReview insertError:', insertError);
        // Fallback to local storage only if DB insert fails
        if (courseId?.startsWith('local_')) {
            return await addLocalReview(reviewData);
        }
        return { error: insertError };
    }

    // Recalculate average rating if stars were provided
    if (reviewData.rating) {
        const { data: allRatings } = await supabase
            .from('course_reviews')
            .select('rating')
            .eq('course_id', courseId)
            .not('rating', 'is', null);

        if (allRatings && allRatings.length > 0) {
            const sum = allRatings.reduce((acc, curr) => acc + (curr.rating || 0), 0);
            const avg = sum / allRatings.length;

            await supabase
                .from('courses')
                .update({
                    rating: parseFloat(avg.toFixed(1)),
                    review_count: allRatings.length
                })
                .eq('id', courseId);
        }
    }

    return { error: null };
};
export const likeReview = async (reviewId: string, courseId: string, isUnlike: boolean = false): Promise<{ error: any }> => {
    // 1. Check for Local Review
    if (reviewId.startsWith('lrev_')) {
        try {
            const jsonValue = await AsyncStorage.getItem(LOCAL_REVIEWS_KEY);
            const allReviews: Review[] = jsonValue != null ? JSON.parse(jsonValue) : [];
            const index = allReviews.findIndex(r => r.id === reviewId);

            if (index !== -1) {
                const currentLikes = allReviews[index].likes || 0;
                allReviews[index].likes = isUnlike ? Math.max(0, currentLikes - 1) : currentLikes + 1;
                await AsyncStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(allReviews));
                return { error: null };
            }
            return { error: { message: 'Review not found' } };
        } catch (e: any) {
            return { error: e };
        }
    }

    // 2. Database Review
    const rpcName = isUnlike ? 'decrement_review_likes' : 'increment_review_likes';
    const { error } = await supabase.rpc(rpcName, { review_id: reviewId });

    // Fallback if RPC not setup
    if (error) {
        console.warn(`RPC ${rpcName} failed, falling back to manual update:`, error);
        // Note: Manual update is less safe against concurrent likes but works for prototype
        const { data } = await supabase.from('course_reviews').select('likes').eq('id', reviewId).single();
        const currentLikes = data?.likes || 0;
        const { error: updateError } = await supabase
            .from('course_reviews')
            .update({ likes: isUnlike ? Math.max(0, currentLikes - 1) : currentLikes + 1 })
            .eq('id', reviewId);
        return { error: updateError };
    }

    return { error: null };
};

// ==================== 课程提交审核系统 ====================

export interface CourseSubmission {
    id: string;
    code: string;
    name?: string;
    instructor?: string;
    department?: string;
    credits: number;
    submitted_by?: string;
    submitter_name?: string;
    status: 'pending' | 'approved' | 'rejected';
    review_notes?: string;
    created_at: Date;
}

/**
 * 提交新课程（需审核后才会添加到正式课程库）
 */
export const submitCourseForReview = async (
    courseData: Partial<Course>,
    submitterInfo?: { userId?: string; name?: string; email?: string }
): Promise<{ data: CourseSubmission | null; error: any }> => {
    // 检查课程代码是否已存在于正式表
    const existingCourse = await getCourseByCode(courseData.code || '');
    if (existingCourse) {
        return { data: null, error: { message: 'COURSE_EXISTS', details: 'This course code already exists in the database.' } };
    }

    // 检查是否有相同代码的待审核提交
    const { data: pendingSubmission } = await supabase
        .from('course_submissions')
        .select('id')
        .eq('code', courseData.code?.toUpperCase())
        .eq('status', 'pending')
        .single();

    if (pendingSubmission) {
        return { data: null, error: { message: 'SUBMISSION_PENDING', details: 'A submission for this course code is already pending review.' } };
    }

    // 创建新的提交记录
    const { data, error } = await supabase
        .from('course_submissions')
        .insert({
            code: courseData.code?.toUpperCase(),
            name: courseData.name,
            instructor: courseData.instructor,
            department: courseData.department,
            credits: courseData.credits || 3,
            submitted_by: submitterInfo?.userId,
            submitter_name: submitterInfo?.name,
            submitter_email: submitterInfo?.email,
            status: 'pending'
        })
        .select()
        .single();

    if (error) {
        return { data: null, error };
    }

    return {
        data: {
            ...data,
            created_at: new Date(data.created_at)
        } as CourseSubmission,
        error: null
    };
};

/**
 * 获取用户自己的课程提交记录
 */
export const getUserCourseSubmissions = async (userId: string): Promise<CourseSubmission[]> => {
    const { data, error } = await supabase
        .from('course_submissions')
        .select('*')
        .eq('submitted_by', userId)
        .order('created_at', { ascending: false });

    if (error || !data) {
        console.error('Error fetching user submissions:', error);
        return [];
    }

    return data.map(item => ({
        ...item,
        created_at: new Date(item.created_at)
    })) as CourseSubmission[];
};

/**
 * 获取所有待审核的课程提交（管理员用）
 */
export const getPendingCourseSubmissions = async (): Promise<CourseSubmission[]> => {
    const { data, error } = await supabase
        .from('course_submissions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error || !data) {
        console.error('Error fetching pending submissions:', error);
        return [];
    }

    return data.map(item => ({
        ...item,
        created_at: new Date(item.created_at)
    })) as CourseSubmission[];
};

/**
 * 批准课程提交（管理员用）
 */
export const approveCourseSubmission = async (
    submissionId: string,
    reviewerId: string,
    notes?: string
): Promise<{ success: boolean; courseId?: string; error?: string }> => {
    const { data, error } = await supabase.rpc('approve_course_submission', {
        submission_id: submissionId,
        reviewer_id: reviewerId,
        notes: notes || null
    });

    if (error) {
        console.error('Error approving submission:', error);
        return { success: false, error: error.message };
    }

    return data as { success: boolean; courseId?: string; error?: string };
};

/**
 * 拒绝课程提交（管理员用）
 */
export const rejectCourseSubmission = async (
    submissionId: string,
    reviewerId: string,
    notes: string
): Promise<{ success: boolean; error?: string }> => {
    const { data, error } = await supabase.rpc('reject_course_submission', {
        submission_id: submissionId,
        reviewer_id: reviewerId,
        notes: notes
    });

    if (error) {
        console.error('Error rejecting submission:', error);
        return { success: false, error: error.message };
    }

    return data as { success: boolean; error?: string };
};

/**
 * 取消自己的待审核提交
 */
export const cancelCourseSubmission = async (submissionId: string): Promise<{ error: any }> => {
    const { error } = await supabase
        .from('course_submissions')
        .delete()
        .eq('id', submissionId)
        .eq('status', 'pending');

    return { error };
};
