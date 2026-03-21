import { AppState } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser } from '../services/auth';
import {
    CourseCommunityUnreadSummary,
    getFavoriteCourseCommunityUnreadMap,
    markCourseCommunitySeen,
} from '../services/courseActivity';
import { loadCourseFavorites } from '../services/favorites';

type CourseActivityContextValue = {
    unreadByCourse: Record<string, CourseCommunityUnreadSummary>;
    hasAnyUnread: boolean;
    refresh: () => Promise<void>;
    markCourseSeen: (courseId: string) => Promise<void>;
};

const CourseActivityContext = createContext<CourseActivityContextValue>({
    unreadByCourse: {},
    hasAnyUnread: false,
    refresh: async () => { },
    markCourseSeen: async () => { },
});

export const CourseActivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [userId, setUserId] = useState<string | null>(null);
    const [unreadByCourse, setUnreadByCourse] = useState<Record<string, CourseCommunityUnreadSummary>>({});

    const refresh = useCallback(async () => {
        try {
            const user = await getCurrentUser();
            const resolvedUserId = user?.uid || null;
            setUserId(resolvedUserId);

            if (!resolvedUserId) {
                setUnreadByCourse({});
                return;
            }

            const favoriteCourseIds = await loadCourseFavorites(resolvedUserId, !user?.isDemo);
            const unreadMap = await getFavoriteCourseCommunityUnreadMap(resolvedUserId, favoriteCourseIds);
            setUnreadByCourse(unreadMap);
        } catch (error) {
            console.error('Error refreshing course activity context:', error);
        }
    }, []);

    const markCourseSeen = useCallback(async (courseId: string) => {
        if (!userId || !courseId) return;

        await markCourseCommunitySeen(userId, courseId);
        setUnreadByCourse(prev => ({
            ...prev,
            [courseId]: {
                reviews: false,
                chat: false,
                teaming: false,
                hasAnyUnread: false,
            },
        }));
    }, [userId]);

    useEffect(() => {
        refresh();

        const appStateSubscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                void refresh();
            }
        });

        const interval = setInterval(() => {
            void refresh();
        }, 45000);

        return () => {
            appStateSubscription.remove();
            clearInterval(interval);
        };
    }, [refresh]);

    const value = useMemo(() => ({
        unreadByCourse,
        hasAnyUnread: Object.values(unreadByCourse).some(item => item?.hasAnyUnread),
        refresh,
        markCourseSeen,
    }), [markCourseSeen, refresh, unreadByCourse]);

    return (
        <CourseActivityContext.Provider value={value}>
            {children}
        </CourseActivityContext.Provider>
    );
};

export const useCourseActivity = () => useContext(CourseActivityContext);
