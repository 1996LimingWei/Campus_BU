describe('app config widget plugin gating', () => {
    const originalEnv = process.env;

    afterEach(() => {
        process.env = originalEnv;
        jest.resetModules();
    });

    it('omits the schedule widget plugin for production builds', () => {
        process.env = {
            ...originalEnv,
            EAS_BUILD_PROFILE: 'production',
        };

        const createConfig = require('../app.config').default as () => { plugins?: unknown[] };
        const config = createConfig();
        const pluginEntries = config.plugins ?? [];
        const hasWidgetPlugin = pluginEntries.some((entry) =>
            Array.isArray(entry) ? entry[0] === './plugins/withScheduleWidget' : entry === './plugins/withScheduleWidget'
        );

        expect(hasWidgetPlugin).toBe(false);
    });
});
