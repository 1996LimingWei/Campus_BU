import AsyncStorage from '@react-native-async-storage/async-storage';
import { Course } from '../types';
import { searchCourses } from './courses';
import { supabase } from './supabase';

const COURSE_FAVORITES_KEY = 'hkcampus_favorite_courses';
const BUILDING_FAVORITES_KEY = 'hkcampus_favorite_buildings';

type FavoriteIdRow = { course_id?: string; building_id?: string };

const readLocalFavorites = async (key: string): Promise<string[]> => {
    try {
        const raw = await AsyncStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error('Error reading local favorites:', e);
        return [];
    }
};

const writeLocalFavorites = async (key: string, ids: string[]): Promise<void> => {
    try {
        await AsyncStorage.setItem(key, JSON.stringify(ids));
    } catch (e) {
        console.error('Error saving local favorites:', e);
    }
};

export const loadCourseFavorites = async (
    userId?: string | null,
    allowRemote: boolean = true
): Promise<string[]> => {
    const local = await readLocalFavorites(COURSE_FAVORITES_KEY);
    if (!userId || !allowRemote) return local;

    const { data, error } = await supabase
        .from('course_favorites')
        .select('course_id')
        .eq('user_id', userId);

    if (error) {
        console.warn('Failed to fetch course favorites from Supabase:', error.message);
        return local;
    }

    const ids = (data || [])
        .map((row: FavoriteIdRow) => row.course_id)
        .filter(Boolean) as string[];
    await writeLocalFavorites(COURSE_FAVORITES_KEY, ids);
    return ids;
};

export const saveCourseFavoritesLocal = async (ids: string[]): Promise<void> => {
    await writeLocalFavorites(COURSE_FAVORITES_KEY, ids);
};

export const setCourseFavoriteRemote = async (
    userId: string,
    courseId: string,
    makeFavorite: boolean
): Promise<void> => {
    if (makeFavorite) {
        const { error } = await supabase
            .from('course_favorites')
            .upsert({ user_id: userId, course_id: courseId }, { onConflict: 'user_id,course_id' });
        if (error) throw error;
        return;
    }

    const { error } = await supabase
        .from('course_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('course_id', courseId);
    if (error) throw error;
};

const normalizeCourseCode = (value?: string): string =>
    (value || '').toUpperCase().replace(/\s+/g, '');

const normalizeCourseName = (value?: string): string =>
    (value || '')
        .toUpperCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const scoreCourseMatch = (course: Course, params: { courseCode?: string; courseName?: string }): number => {
    const normalizedCode = normalizeCourseCode(params.courseCode);
    const normalizedName = normalizeCourseName(params.courseName);
    const courseCode = normalizeCourseCode(course.code);
    const courseName = normalizeCourseName(course.name);

    let score = 0;

    if (normalizedCode) {
        if (courseCode === normalizedCode) score += 100;
        else if (courseCode.startsWith(normalizedCode) || normalizedCode.startsWith(courseCode)) score += 40;
    }

    if (normalizedName) {
        if (courseName === normalizedName) score += 90;
        else if (courseName.startsWith(normalizedName) || normalizedName.startsWith(courseName)) score += 35;
    }

    return score;
};

const findBestCourseMatch = async (params: {
    matchedCourseId?: string | null;
    courseCode?: string;
    courseName?: string;
}): Promise<string | null> => {
    if (params.matchedCourseId) {
        return params.matchedCourseId;
    }

    const candidates = new Map<string, Course>();
    const queries = [params.courseCode, params.courseName]
        .map(value => value?.trim())
        .filter((value): value is string => Boolean(value));

    for (const query of queries) {
        const results = await searchCourses(query, 12);
        results.forEach(course => candidates.set(course.id, course));
    }

    let bestMatchId: string | null = null;
    let bestScore = 0;

    candidates.forEach(course => {
        const score = scoreCourseMatch(course, params);
        if (score > bestScore) {
            bestScore = score;
            bestMatchId = course.id;
        }
    });

    return bestScore >= 90 ? bestMatchId : null;
};

export const ensureCourseFavoriteForSchedule = async (params: {
    userId: string;
    matchedCourseId?: string | null;
    courseCode?: string;
    courseName?: string;
}): Promise<string | null> => {
    const courseId = await findBestCourseMatch(params);
    if (!courseId) return null;

    const existingIds = await loadCourseFavorites(params.userId, true);
    if (existingIds.includes(courseId)) {
        return courseId;
    }

    const nextIds = [...existingIds, courseId];
    await saveCourseFavoritesLocal(nextIds);
    await setCourseFavoriteRemote(params.userId, courseId, true);
    return courseId;
};

export const loadBuildingFavorites = async (
    userId?: string | null,
    allowRemote: boolean = true
): Promise<string[]> => {
    const local = await readLocalFavorites(BUILDING_FAVORITES_KEY);
    if (!userId || !allowRemote) return local;

    const { data, error } = await supabase
        .from('building_favorites')
        .select('building_id')
        .eq('user_id', userId);

    if (error) {
        console.warn('Failed to fetch building favorites from Supabase:', error.message);
        return local;
    }

    const ids = (data || [])
        .map((row: FavoriteIdRow) => row.building_id)
        .filter(Boolean) as string[];
    await writeLocalFavorites(BUILDING_FAVORITES_KEY, ids);
    return ids;
};

export const saveBuildingFavoritesLocal = async (ids: string[]): Promise<void> => {
    await writeLocalFavorites(BUILDING_FAVORITES_KEY, ids);
};

export const setBuildingFavoriteRemote = async (
    userId: string,
    buildingId: string,
    makeFavorite: boolean
): Promise<void> => {
    if (makeFavorite) {
        const { error } = await supabase
            .from('building_favorites')
            .upsert({ user_id: userId, building_id: buildingId }, { onConflict: 'user_id,building_id' });
        if (error) throw error;
        return;
    }

    const { error } = await supabase
        .from('building_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('building_id', buildingId);
    if (error) throw error;
};
