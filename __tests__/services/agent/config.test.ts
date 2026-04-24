describe('agent config defaults', () => {
    const originalEnv = process.env;

    afterEach(() => {
        process.env = originalEnv;
        jest.resetModules();
    });

    it('defaults to the latest DeepSeek chat completion models', () => {
        process.env = {
            ...originalEnv,
        };
        delete process.env.EXPO_PUBLIC_AGENT_FAST_MODEL;
        delete process.env.EXPO_PUBLIC_AGENT_REASONING_MODEL;

        const { AGENT_CONFIG } = require('../../../services/agent/config') as {
            AGENT_CONFIG: { FAST_MODEL: string; REASONING_MODEL: string };
        };

        expect(AGENT_CONFIG.FAST_MODEL).toBe('deepseek-v4-flash');
        expect(AGENT_CONFIG.REASONING_MODEL).toBe('deepseek-v4-pro');
    });
});
