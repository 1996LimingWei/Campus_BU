import storage from '../lib/storage';
import { getCourseByCode, getCourseById } from './courses';
import { supabase } from './supabase';

export type CourseCommunityKind = 'reviews' | 'chat' | 'teaming';

export type CourseCommunityUnreadSummary = {
    reviews: boolean;
    chat: boolean;
    teaming: boolean;
    hasAnyUnread: boolean;
    latestActivityAt?: string;
};

type SeenMap = Record<string, Partial<Record<CourseCommunityKind, string>>>;

const ALL_KINDS: CourseCommunityKind[] = ['reviews', 'chat', 'teaming'];

const normalizeCourseCode = (value?: string): string =>
    (value || '').toUpperCase().replace(/\s+/g, '');

const getSeenStorageKey = (userId?: string | null) =>
    `hkcampus_course_activity_seen_${userId || 'guest'}`;

const readSeenMap = async (userId?: string | null): Promise<SeenMap> => {
    try {
        const raw = await storage.getItem(getSeenStorageKey(userId));
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        console.error('Error reading course activity seen map:', error);
        return {};
    }
};

const writeSeenMap = async (userId: string, value: SeenMap): Promise<void> => {
    try {
        await storage.setItem(getSeenStorageKey(userId), JSON.stringify(value));
    } catch (error) {
        console.error('Error writing course activity seen map:', error);
    }
};

const buildCourseCandidateIds = async (courseId: string): Promise<string[]> => {
    const candidates = new Set<string>();
    candidates.add(courseId);

    const course = await getCourseById(courseId);
    const normalizedCode = normalizeCourseCode(course?.code || courseId.replace(/^local_/, ''));

    if (normalizedCode) {
        candidates.add(normalizedCode);
        candidates.add(`local_${normalizedCode}`);
        const byCode = await getCourseByCode(normalizedCode);
        if (byCode?.id) {
            candidates.add(byCode.id);
        }
    }

    return Array.from(candidates).filter(Boolean);
};

const getLatestUnreadAt = (
    rows: any[],
    actorField: string,
    currentUserId: string,
    candidateIds: Set<string>,
    seenAt?: string
): string | undefined => {
    for (const row of rows || []) {
        if (!candidateIds.has(String(row.course_id || ''))) continue;
        if (row[actorField] && row[actorField] === currentUserId) continue;

        const createdAt = String(row.created_at || '');
        if (!createdAt) continue;
        if (!seenAt || new Date(createdAt).getTime() > new Date(seenAt).getTime()) {
            return createdAt;
        }

        return undefined;
    }

    return undefined;
};

export const markCourseCommunitySeen = async (
    userId: string,
    courseId: string,
    kinds: CourseCommunityKind[] = ALL_KINDS
): Promise<void> => {
    const seenMap = await readSeenMap(userId);
    const existing = seenMap[courseId] || {};
    const now = new Date().toISOString();

    const nextEntry = { ...existing };
    kinds.forEach(kind => {
        nextEntry[kind] = now;
    });

    await writeSeenMap(userId, {
        ...seenMap,
        [courseId]: nextEntry,
    });
};

export const getFavoriteCourseCommunityUnreadMap = async (
    userId: string,
    favoriteCourseIds: string[]
): Promise<Record<string, CourseCommunityUnreadSummary>> => {
    if (!userId || favoriteCourseIds.length === 0) {
        return {};
    }

    const seenMap = await readSeenMap(userId);
    const candidateEntries = await Promise.all(
        favoriteCourseIds.map(async courseId => ({
            courseId,
            candidateIds: new Set(await buildCourseCandidateIds(courseId)),
        }))
    );

    const allCandidateIds = Array.from(new Set(
        candidateEntries.flatMap(entry => Array.from(entry.candidateIds))
    ));

    if (allCandidateIds.length === 0) {
        return {};
    }

    const [reviewsResult, chatResult, teamingResult] = await Promise.all([
        supabase
            .from('course_reviews')
            .select('course_id, created_at, author_id')
            .in('course_id', allCandidateIds)
            .order('created_at', { ascending: false }),
        supabase
            .from('messages')
            .select('course_id, created_at, sender_id')
            .in('course_id', allCandidateIds)
            .order('created_at', { ascending: false }),
        supabase
            .from('course_teaming')
            .select('course_id, created_at, user_id')
            .in('course_id', allCandidateIds)
            .order('created_at', { ascending: false }),
    ]);

    const reviewsRows = reviewsResult.error ? [] : (reviewsResult.data || []);
    const chatRows = chatResult.error ? [] : (chatResult.data || []);
    const teamingRows = teamingResult.error ? [] : (teamingResult.data || []);

    if (reviewsResult.error) {
        console.warn('Failed to fetch review activity for favorites:', reviewsResult.error.message);
    }
    if (chatResult.error) {
        console.warn('Failed to fetch chat activity for favorites:', chatResult.error.message);
    }
    if (teamingResult.error) {
        console.warn('Failed to fetch teaming activity for favorites:', teamingResult.error.message);
    }

    const result: Record<string, CourseCommunityUnreadSummary> = {};

    candidateEntries.forEach(({ courseId, candidateIds }) => {
        const seen = seenMap[courseId] || {};
        const latestReviewAt = getLatestUnreadAt(reviewsRows, 'author_id', userId, candidateIds, seen.reviews);
        const latestChatAt = getLatestUnreadAt(chatRows, 'sender_id', userId, candidateIds, seen.chat);
        const latestTeamingAt = getLatestUnreadAt(teamingRows, 'user_id', userId, candidateIds, seen.teaming);
        const latestActivityAt = [latestReviewAt, latestChatAt, latestTeamingAt]
            .filter(Boolean)
            .sort()
            .slice(-1)[0];

        result[courseId] = {
            reviews: !!latestReviewAt,
            chat: !!latestChatAt,
            teaming: !!latestTeamingAt,
            hasAnyUnread: !!(latestReviewAt || latestChatAt || latestTeamingAt),
            latestActivityAt,
        };
    });

    return result;
};
