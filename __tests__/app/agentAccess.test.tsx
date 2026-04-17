import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import TabLayout from '../../app/(tabs)/_layout';

const recordedScreens: Array<{ name: string; options: any }> = [];

jest.mock('expo-router', () => {
    const React = require('react');
    const TabsImpl = ({ children }: { children: React.ReactNode }) => <>{children}</>;
    const Screen = ({ name, options }: any) => {
        recordedScreens.push({ name, options });
        return null;
    };
    (TabsImpl as any).Screen = Screen;
    return { Tabs: TabsImpl };
});

jest.mock('expo-blur', () => ({
    BlurView: ({ children }: any) => <>{children}</>,
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback || _key,
    }),
}));

jest.mock('../../context/NotificationContext', () => ({
    useNotifications: () => ({ hasAnyUnread: false, totalUnreadCount: 0 }),
}));

jest.mock('../../context/CourseActivityContext', () => ({
    useCourseActivity: () => ({ hasAnyUnread: false }),
}));

jest.mock('../../services/auth', () => ({
    getCurrentUser: jest.fn(),
}));

const { getCurrentUser } = require('../../services/auth');
const getLatestScreen = (name: string) => recordedScreens.filter((screen) => screen.name === name).at(-1);

describe('agent tab access control', () => {
    beforeEach(() => {
        recordedScreens.length = 0;
        jest.clearAllMocks();
    });

    it('hides the agent tab for guests', async () => {
        getCurrentUser.mockResolvedValue(null);
        render(<TabLayout />);

        await waitFor(() => {
            expect(getLatestScreen('agent')?.options?.href).toBe(null);
        });
    });

    it('shows the agent tab for logged-in users', async () => {
        getCurrentUser.mockResolvedValue({ uid: 'user-1' });
        render(<TabLayout />);

        await waitFor(() => {
            expect(getLatestScreen('agent')?.options?.href).toBeUndefined();
        });
    });
});
