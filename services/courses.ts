import { SEM2_COURSES_DATA } from '../constants/courses_sem2';
import storage from '../lib/storage';
import { Course, Review } from '../types';
import { ensureContentSafety } from './contentFilter';
import { getBlockedUserIds } from './moderation';
import { supabase } from './supabase';

const LOCAL_COURSES_KEY = 'hkcampus_local_courses';
const LOCAL_REVIEWS_KEY = 'hkcampus_local_reviews';

export const getLocalReviews = async (courseId: string): Promise<Review[]> => {
    try {
        const jsonValue = await storage.getItem(LOCAL_REVIEWS_KEY);
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
        const jsonValue = await storage.getItem(LOCAL_REVIEWS_KEY);
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
            semester: review.semester || '2025 Spring',
            isAnonymous: review.isAnonymous || false
        };

        const updated = [newReview, ...allReviews];
        await storage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(updated));

        // Update local course rating if needed (optional refinement)
        const localCourses = await getLocalCourses();
        const courseIndex = localCourses.findIndex(c => c.id === review.courseId);
        if (courseIndex !== -1) {
            const courseReviews = updated.filter(r => r.courseId === review.courseId);
            const sum = courseReviews.reduce((acc, curr) => acc + (curr.rating || 0), 0);
            localCourses[courseIndex].rating = parseFloat((sum / courseReviews.length).toFixed(1));
            localCourses[courseIndex].reviewCount = courseReviews.length;
            await storage.setItem(LOCAL_COURSES_KEY, JSON.stringify(localCourses));
        }

        return { error: null };
    } catch (e: any) {
        return { error: e };
    }
};

let cachedLocalCourses: Course[] | null = null;
let fetchCoursesPromise: Promise<Course[]> | null = null;

export const prefetchLocalCourses = () => {
    if (!fetchCoursesPromise) {
        fetchCoursesPromise = _getLocalCoursesInternal().then(data => {
            cachedLocalCourses = data;
            return data;
        });
    }
    return fetchCoursesPromise;
};

export const getLocalCourses = async (forceRefresh = false): Promise<Course[]> => {
    if (forceRefresh) {
        cachedLocalCourses = null;
        fetchCoursesPromise = null;
    }
    if (cachedLocalCourses) return cachedLocalCourses;
    return prefetchLocalCourses();
};

export const invalidateCourseCache = () => {
    cachedLocalCourses = null;
    fetchCoursesPromise = null;
};

const _getLocalCoursesInternal = async (): Promise<Course[]> => {
    try {
        const jsonValue = await storage.getItem(LOCAL_COURSES_KEY);
        const storageCourses: Course[] = jsonValue != null ? JSON.parse(jsonValue) : [];

        // Merge with static Sem2 data
        // Use a Map to avoid duplicates by 'id'
        const courseMap = new Map<string, Course>();

        // 1. Add static data first
        (SEM2_COURSES_DATA as Course[]).forEach(c => courseMap.set(c.id, c));

        // 2. Add storage data (can overwrite static if same ID, or add new ones)
        storageCourses.forEach(c => courseMap.set(c.id, c));

        const courses = Array.from(courseMap.values());

        // 3. Fetch review stats by joining with courses (avoids UUID mismatch)
        const { data: reviewData, error } = await supabase
            .from('course_reviews')
            .select(`
                rating,
                courses!inner(code)
            `)
            .not('rating', 'is', null);

        if (!error && reviewData) {
            // Aggregate ratings by course code
            const statsMap = new Map<string, { count: number; sum: number }>();
            reviewData.forEach((r: any) => {
                const code = r.courses?.code?.toUpperCase().replace(/\s+/g, '');
                if (code) {
                    const stats = statsMap.get(code) || { count: 0, sum: 0 };
                    stats.count += 1;
                    stats.sum += r.rating || 0;
                    statsMap.set(code, stats);
                }
            });

            // Update course review counts and ratings
            courses.forEach(course => {
                const code = (course.code || '').toUpperCase().replace(/\s+/g, '');
                const stats = statsMap.get(code);
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

/**
 * Recompute review stats for a course list using code-based matching.
 * This handles mixed course_id formats across old/new databases.
 */
export const enrichCoursesWithReviewStats = async (courseList: Course[]): Promise<Course[]> => {
    try {
        if (!courseList || courseList.length === 0) return courseList;

        const normalize = (value: string) => (value || '').toUpperCase().replace(/\s+/g, '');

        const { data: dbCourses } = await supabase
            .from('courses')
            .select('id, code');

        const codeToDbIds = new Map<string, Set<string>>();
        (dbCourses || []).forEach((row: any) => {
            const code = normalize(row.code);
            if (!code) return;
            if (!codeToDbIds.has(code)) codeToDbIds.set(code, new Set<string>());
            codeToDbIds.get(code)!.add(row.id);
        });

        const { data: reviewRows, error: reviewError } = await supabase
            .from('course_reviews')
            .select('course_id, rating')
            .not('course_id', 'is', null);

        if (reviewError || !reviewRows) {
            return courseList;
        }

        const statsByCourseId = new Map<string, { count: number; sum: number }>();
        reviewRows.forEach((row: any) => {
            const id = String(row.course_id || '');
            if (!id) return;
            const prev = statsByCourseId.get(id) || { count: 0, sum: 0 };
            prev.count += 1;
            prev.sum += row.rating || 0;
            statsByCourseId.set(id, prev);
        });

        return courseList.map(course => {
            const candidates = new Set<string>();
            candidates.add(course.id);

            const code = normalize(course.code);
            if (code) {
                candidates.add(code);
                candidates.add(`local_${code}`);
                const matchedIds = codeToDbIds.get(code);
                if (matchedIds) {
                    matchedIds.forEach(id => candidates.add(id));
                }
            }

            let totalCount = 0;
            let totalSum = 0;
            candidates.forEach(id => {
                const stat = statsByCourseId.get(id);
                if (!stat) return;
                totalCount += stat.count;
                totalSum += stat.sum;
            });

            if (totalCount === 0) {
                // Keep existing values when cross-ID aggregation cannot find matches.
                return course;
            }

            return {
                ...course,
                reviewCount: totalCount,
                rating: parseFloat((totalSum / totalCount).toFixed(1)),
            };
        });
    } catch (e) {
        console.error('Error enriching course review stats:', e);
        return courseList;
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
        await storage.setItem(LOCAL_COURSES_KEY, JSON.stringify(updated));

        // Invalidate cache
        cachedLocalCourses = null;
        fetchCoursesPromise = null;

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

export const searchCourses = async (query: string, limit: number = 10): Promise<Course[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const normalized = trimmed.toUpperCase();
    const localMatches = (SEM2_COURSES_DATA as Course[])
        .filter(course => {
            const code = (course.code || '').toUpperCase();
            const name = (course.name || '').toUpperCase();
            return code.includes(normalized) || name.includes(normalized);
        })
        .slice(0, limit);

    const merged = new Map<string, Course>();
    localMatches.forEach(course => {
        merged.set(course.code || course.id, course);
    });

    const safeTerm = trimmed.replace(/[%(),]/g, ' ').trim();
    if (safeTerm) {
        const { data, error } = await supabase
            .from('courses')
            .select('*')
            .or(`code.ilike.%${safeTerm}%,name.ilike.%${safeTerm}%`)
            .limit(limit);

        if (!error && data) {
            data.forEach((course: any) => {
                merged.set(course.code || course.id, {
                    id: course.id,
                    code: course.code,
                    name: course.name || '',
                    instructor: course.instructor || '',
                    department: course.department || '',
                    credits: course.credits || 3,
                    rating: course.rating || 0,
                    reviewCount: course.review_count || 0,
                });
            });
        }
    }

    return Array.from(merged.values()).slice(0, limit);
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

export const getReviews = async (courseId: string, courseCode?: string, currentUserId?: string): Promise<Review[]> => {
    const candidateCourseIds = await buildReviewCourseIdCandidates(courseId, courseCode);

    // Query Supabase for all courses (including local_ ones)
    const { data, error } = await supabase
        .from('course_reviews')
        .select('*, author:users!author_id(email, display_name, avatar_url)')
        .in('course_id', candidateCourseIds)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('getReviews error:', error);
        return [];
    }
    if (!data) return [];

    let rows = data;
    if (currentUserId) {
        const blockedIds = await getBlockedUserIds(currentUserId);
        if (blockedIds.length > 0) {
            const blockedSet = new Set(blockedIds);
            rows = rows.filter((row: any) => !blockedSet.has(row.author_id));
        }
    }

    return rows.map(r => {
        const author = r.author || {};
        return {
            id: r.id,
            courseId: courseId, // Return original courseId so frontend mapping works
            authorId: r.author_id,
            authorName: r.author_name || author.display_name || 'Anonymous',
            authorEmail: author.email,
            authorAvatar: r.author_avatar || author.avatar_url || '👤',
            rating: r.rating,
            difficulty: r.difficulty || 3,
            content: r.content || '',
            tags: [],
            likes: r.likes || 0,
            createdAt: new Date(r.created_at),
            semester: r.semester || 'Current',
            isAnonymous: r.is_anonymous || false
        };
    });
};


export const hasUserReviewed = async (courseId: string, userId: string, courseCode?: string): Promise<boolean> => {
    const candidateCourseIds = await buildReviewCourseIdCandidates(courseId, courseCode);

    const { count, error } = await supabase
        .from('course_reviews')
        .select('*', { count: 'exact', head: true })
        .in('course_id', candidateCourseIds)
        .eq('author_id', userId)
        .not('rating', 'is', null);

    return !error && (count || 0) > 0;
};

/**
 * Optimized: builds candidate IDs ONCE and fires both queries in parallel.
 * Use this instead of calling getReviews + hasUserReviewed separately to halve DB round-trips.
 */
export const getReviewsAndHasReviewed = async (
    courseId: string,
    userId: string | null,
    courseCode?: string
): Promise<{ reviews: Review[]; hasReviewed: boolean }> => {
    const candidateCourseIds = await buildReviewCourseIdCandidates(courseId, courseCode);

    const [reviewsResult, hasReviewedResult] = await Promise.all([
        supabase
            .from('course_reviews')
            .select('*, author:users!author_id(email, display_name, avatar_url)')
            .in('course_id', candidateCourseIds)
            .order('created_at', { ascending: false }),
        userId
            ? supabase
                .from('course_reviews')
                .select('*', { count: 'exact', head: true })
                .in('course_id', candidateCourseIds)
                .eq('author_id', userId)
                .not('rating', 'is', null)
            : Promise.resolve({ count: 0, error: null })
    ]);

    let reviewRows = reviewsResult.data || [];
    if (userId) {
        const blockedIds = await getBlockedUserIds(userId);
        if (blockedIds.length > 0) {
            const blockedSet = new Set(blockedIds);
            reviewRows = reviewRows.filter((row: any) => !blockedSet.has(row.author_id));
        }
    }

    const reviews: Review[] = reviewRows.map(r => {
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
            semester: r.semester || 'Current',
            isAnonymous: r.is_anonymous || false
        };
    });

    const hasReviewed = !hasReviewedResult.error && (hasReviewedResult.count || 0) > 0;
    return { reviews, hasReviewed };
};



const resolveCourseIdForReviewQueries = async (courseId: string): Promise<string> => {
    // Normal database IDs and seeded placeholder IDs can be queried directly.
    if (!courseId || !courseId.startsWith('local_')) {
        return courseId;
    }

    const localCourses = await getLocalCourses();
    const matchedCourse = localCourses.find(c => c.id === courseId);
    if (!matchedCourse) {
        return courseId;
    }

    const normalizedCode = (matchedCourse.code || courseId.replace(/^local_/, ''))
        .toUpperCase()
        .replace(/\s+/g, '');

    const { data: existingByCode } = await supabase
        .from('courses')
        .select('id')
        .eq('code', normalizedCode)
        .maybeSingle();

    // If this local course maps to an existing DB course, query reviews using that canonical ID.
    return existingByCode?.id || courseId;
};

const normalizeCourseCode = (value: string): string =>
    (value || '').toUpperCase().replace(/\s+/g, '');

const buildReviewCourseIdCandidates = async (courseId: string, seedCourseCode?: string): Promise<string[]> => {
    const candidates = new Set<string>();
    if (!courseId) return [];

    candidates.add(courseId);
    const normalizedInput = normalizeCourseCode(courseId);
    if (normalizedInput) {
        candidates.add(normalizedInput);
    }

    const resolved = await resolveCourseIdForReviewQueries(courseId);
    if (resolved) {
        candidates.add(resolved);
    }

    const normalizedSeedCode = normalizeCourseCode(seedCourseCode || '');
    if (normalizedSeedCode) {
        candidates.add(normalizedSeedCode);
        candidates.add(`local_${normalizedSeedCode}`);

        const { data: bySeedCode } = await supabase
            .from('courses')
            .select('id')
            .eq('code', normalizedSeedCode)
            .maybeSingle();
        if (bySeedCode?.id) {
            candidates.add(bySeedCode.id);
        }
    }

    if (courseId.startsWith('local_')) {
        const localCourses = await getLocalCourses();
        const matchedCourse = localCourses.find(c => c.id === courseId);
        const normalizedCode = normalizeCourseCode(matchedCourse?.code || courseId.replace(/^local_/, ''));

        if (normalizedCode) {
            candidates.add(normalizedCode);
            candidates.add(`local_${normalizedCode}`);

            const { data: byCode } = await supabase
                .from('courses')
                .select('id')
                .eq('code', normalizedCode)
                .maybeSingle();
            if (byCode?.id) {
                candidates.add(byCode.id);
            }
        }
    } else {
        // 1) Try to get course by ID first (if input is an ID)
        let normalizedCode = normalizedInput;
        const { data: byId } = await supabase
            .from('courses')
            .select('id, code')
            .eq('id', courseId)
            .maybeSingle();

        if (byId?.code) {
            normalizedCode = normalizeCourseCode(byId.code);
        } else {
            // 2) If input is not a valid ID, assume it might be a course code
            // Try to find course by code
            const { data: byCourseCode } = await supabase
                .from('courses')
                .select('id, code')
                .eq('code', normalizedInput)
                .maybeSingle();

            if (byCourseCode) {
                candidates.add(byCourseCode.id);
                normalizedCode = normalizeCourseCode(byCourseCode.code);
            }
        }

        if (normalizedCode) {
            candidates.add(normalizedCode);
            candidates.add(`local_${normalizedCode}`);

            // Also search by code to ensure we get the DB ID
            const { data: byCode } = await supabase
                .from('courses')
                .select('id')
                .eq('code', normalizedCode)
                .maybeSingle();
            if (byCode?.id) {
                candidates.add(byCode.id);
            }
        }
    }

    return Array.from(candidates).filter(Boolean);
};

const ensureCourseExistsForReview = async (courseId?: string): Promise<{ resolvedCourseId?: string; error: any }> => {
    if (!courseId) {
        return { resolvedCourseId: undefined, error: { message: 'MISSING_COURSE_ID' } };
    }

    // 1) Try to find course by ID
    const { data: existingCourse, error: checkError } = await supabase
        .from('courses')
        .select('id, code')
        .eq('id', courseId)
        .maybeSingle();

    if (checkError) {
        return { resolvedCourseId: undefined, error: checkError };
    }

    if (existingCourse) {
        return { resolvedCourseId: existingCourse.id, error: null };
    }

    // 2) If not found by ID, try to find by course code (input might be a code like "ACCT1006")
    const normalizedInputCode = normalizeCourseCode(courseId);
    if (normalizedInputCode) {
        const { data: existingByCode, error: codeCheckError } = await supabase
            .from('courses')
            .select('id, code')
            .eq('code', normalizedInputCode)
            .maybeSingle();

        if (!codeCheckError && existingByCode) {
            return { resolvedCourseId: existingByCode.id, error: null };
        }
    }

    // 3) If still not found, try local courses
    const localCourses = await getLocalCourses();
    const matchedCourse = localCourses.find(c => c.id === courseId);

    if (!matchedCourse) {
        return { resolvedCourseId: undefined, error: { message: 'COURSE_NOT_FOUND', details: `Course ${courseId} is not available in local catalog.` } };
    }

    const normalizedCode = (matchedCourse.code || courseId.replace(/^local_/, '')).toUpperCase().replace(/\s+/g, '');
    const { data: existingByCode, error: codeLookupError } = await supabase
        .from('courses')
        .select('id')
        .eq('code', normalizedCode)
        .maybeSingle();

    if (codeLookupError) {
        return { resolvedCourseId: undefined, error: codeLookupError };
    }

    if (existingByCode?.id) {
        return { resolvedCourseId: existingByCode.id, error: null };
    }

    const { error: createError } = await supabase.from('courses').insert({
        id: courseId,
        code: normalizedCode,
        name: matchedCourse.name,
        instructor: matchedCourse.instructor || 'TBD',
        department: matchedCourse.department || 'General',
        credits: matchedCourse.credits || 3
    });

    return { resolvedCourseId: courseId, error: createError };
};

export const addReview = async (reviewData: Partial<Review>): Promise<{ error: any }> => {
    ensureContentSafety(reviewData.content || '', '评价包含不符合社区规范的内容，请修改后再发布。');

    const requestedCourseId = reviewData.courseId;

    const { resolvedCourseId, error: ensureCourseError } = await ensureCourseExistsForReview(requestedCourseId);

    if (ensureCourseError) {
        console.error('addReview ensureCourseError:', ensureCourseError);
        if (requestedCourseId?.startsWith('local_')) {
            return await addLocalReview(reviewData);
        }
        return { error: ensureCourseError };
    }
    const courseId = resolvedCourseId || requestedCourseId;

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
            semester: reviewData.semester,
            is_anonymous: reviewData.isAnonymous || false
        });

    if (insertError) {
        console.error('addReview insertError:', insertError);
        // Fallback to local storage only if DB insert fails
        if (courseId?.startsWith('local_')) {
            return await addLocalReview(reviewData);
        }
        return { error: insertError };
    }

    // Recalculate average rating and review count using all possible course_id candidates
    // This handles cases where reviews might be stored with different ID formats (UUID, code, local_xxx)
    if (requestedCourseId && courseId) {
        await updateCourseStatsForAllCandidates(requestedCourseId, courseId);
    }

    return { error: null };
};

/**
 * Update course rating and review_count by aggregating reviews from all possible course_id candidates
 */
const updateCourseStatsForAllCandidates = async (originalCourseId: string, resolvedCourseId: string) => {
    try {
        // Get all possible course_id values that might be in course_reviews table
        const candidateIds = await buildReviewCourseIdCandidates(originalCourseId);

        if (candidateIds.length === 0) {
            return;
        }

        // Get all reviews with ratings for any of these candidate IDs
        const { data: allRatings, error: fetchError } = await supabase
            .from('course_reviews')
            .select('rating, course_id')
            .in('course_id', candidateIds)
            .not('rating', 'is', null);

        if (fetchError) {
            console.error('[updateCourseStats] Error fetching ratings:', fetchError);
            return;
        }

        if (allRatings && allRatings.length > 0) {
            const sum = allRatings.reduce((acc, curr) => acc + (curr.rating || 0), 0);
            const avg = sum / allRatings.length;

            // Update the courses table using the resolved course ID
            const { error: updateError } = await supabase
                .from('courses')
                .update({
                    rating: parseFloat(avg.toFixed(1)),
                    review_count: allRatings.length
                })
                .eq('id', resolvedCourseId);

            if (updateError) {
                console.error('[updateCourseStats] Error updating course stats:', updateError);
            }
        } else {
            // No ratings found, reset to 0
            await supabase
                .from('courses')
                .update({
                    rating: 0,
                    review_count: 0
                })
                .eq('id', resolvedCourseId);
        }
    } catch (error) {
        console.error('[updateCourseStats] Exception:', error);
    }
};

export const likeReview = async (reviewId: string, courseId: string, isUnlike: boolean = false): Promise<{ error: any }> => {
    // 1. Check for Local Review
    if (reviewId.startsWith('lrev_')) {
        try {
            const jsonValue = await storage.getItem(LOCAL_REVIEWS_KEY);
            const allReviews: Review[] = jsonValue != null ? JSON.parse(jsonValue) : [];
            const index = allReviews.findIndex(r => r.id === reviewId);

            if (index !== -1) {
                const currentLikes = allReviews[index].likes || 0;
                allReviews[index].likes = isUnlike ? Math.max(0, currentLikes - 1) : currentLikes + 1;
                await storage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(allReviews));
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

    if (!error && !isUnlike) {
        // Trigger notification
        const { data: review } = await supabase.from('course_reviews').select('author_id, course_id').eq('id', reviewId).single();
        const { getCurrentUser } = await import('./auth');
        const user = await getCurrentUser();
        if (review && user && review.author_id !== user.uid) {
            const course = await getCourseById(review.course_id);
            const { createNotification } = await import('./notifications');
            await createNotification({
                user_id: review.author_id,
                type: 'like',
                title: 'notifications.title_like',
                content: JSON.stringify({
                    key: 'notifications.review_like',
                    params: { course: course?.code || 'course' }
                }),
                related_id: reviewId,
            });
        }
    }

    // Fallback if RPC is not available
    if (error) {
        console.warn(`RPC ${rpcName} failed, falling back to manual update:`, error);
        // Manual update is less safe against concurrent likes, but keeps the action usable.
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

export const deleteReview = async (
    reviewId: string,
    userId: string,
    courseId?: string
): Promise<{ error: any }> => {
    // Local-only review deletion
    if (reviewId.startsWith('lrev_')) {
        try {
            const jsonValue = await storage.getItem(LOCAL_REVIEWS_KEY);
            const allReviews: Review[] = jsonValue != null ? JSON.parse(jsonValue) : [];
            const target = allReviews.find(r => r.id === reviewId);

            if (!target) {
                return { error: { message: 'REVIEW_NOT_FOUND' } };
            }

            if (target.authorId !== userId) {
                return { error: { message: 'PERMISSION_DENIED' } };
            }

            const updated = allReviews.filter(r => r.id !== reviewId);
            await storage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(updated));
            return { error: null };
        } catch (e: any) {
            return { error: e };
        }
    }

    const { error } = await supabase
        .from('course_reviews')
        .delete()
        .eq('id', reviewId)
        .eq('author_id', userId);

    if (error) {
        return { error };
    }

    // Keep course stats consistent after deletion when course ID is available.
    if (courseId) {
        const resolvedCourseId = await resolveCourseIdForReviewQueries(courseId);
        await updateCourseStatsForAllCandidates(courseId, resolvedCourseId);
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

/**
 * Refresh review counts and ratings for all courses in the database
 * This function can be used to fix inconsistent review_count values
 * that might have occurred due to reviews being stored with different course_id formats
 */
export const refreshAllCourseStats = async (): Promise<{
    processed: number;
    updated: number;
    errors: string[];
}> => {
    const errors: string[] = [];
    let processed = 0;
    let updated = 0;

    try {
        // Get all courses from database
        const { data: allCourses, error: fetchError } = await supabase
            .from('courses')
            .select('id, code');

        if (fetchError) {
            console.error('[refreshAllCourseStats] Error fetching courses:', fetchError);
            return { processed: 0, updated: 0, errors: [fetchError.message] };
        }

        if (!allCourses || allCourses.length === 0) return { processed: 0, updated: 0, errors: [] };

        // Process each course
        for (const course of allCourses) {
            processed++;
            try {
                // Use the course code as the input to get all candidate IDs
                const courseIdentifier = course.code || course.id;
                await updateCourseStatsForAllCandidates(courseIdentifier, course.id);
                updated++;
            } catch (error: any) {
                const errorMsg = `Error processing course ${course.code} (${course.id}): ${error?.message || 'Unknown error'}`;
                console.error('[refreshAllCourseStats]', errorMsg);
                errors.push(errorMsg);
            }
        }
        return { processed, updated, errors };
    } catch (error: any) {
        console.error('[refreshAllCourseStats] Exception:', error);
        return { processed, updated, errors: [error?.message || 'Unknown exception'] };
    }
};
