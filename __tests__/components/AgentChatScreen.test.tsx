import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AgentChatScreen from '../../components/agent/AgentChatScreen';

jest.mock('expo-location', () => ({
    requestForegroundPermissionsAsync: jest.fn(),
    getCurrentPositionAsync: jest.fn(),
    Accuracy: { Balanced: 1 },
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() }),
    useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback || _key }),
}));

jest.mock('../../services/auth', () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock('../../services/supabase', () => ({
    supabase: { from: jest.fn() },
}));

jest.mock('../../services/agent/dailyDigest', () => ({
    runDailyDigestJobForUser: jest.fn(),
}));

jest.mock('../../services/agent/executor', () => ({
    AgentExecutor: jest.fn().mockImplementation(() => ({
        setDeviceLocation: jest.fn(),
        process: jest.fn(),
    })),
}));

const { getCurrentUser } = require('../../services/auth');
const { AgentExecutor } = require('../../services/agent/executor');

describe('AgentChatScreen guest access', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('blocks guests from using the agent input and prompts login', async () => {
        getCurrentUser.mockResolvedValue(null);
        const { getByPlaceholderText, getByText, findByText } = render(<AgentChatScreen />);

        await waitFor(() => {
            expect(getCurrentUser).toHaveBeenCalled();
        });

        expect(await findByText('Login Required')).toBeTruthy();

        const input = getByPlaceholderText('\u8f93\u5165\u6307\u4ee4...');
        expect(input.props.editable).toBe(false);

        fireEvent.press(getByText('\u201d\u6700\u8fd1\u6709\u4ec0\u4e48\u65b0\u9c9c\u8d44\u8baf\u201d'));

        expect(await findByText('Please login to continue.')).toBeTruthy();
        expect(AgentExecutor).not.toHaveBeenCalled();
    });
});
