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

    it('includes the schedule widget plugin and extension metadata when explicitly enabled', () => {
        process.env = {
            ...originalEnv,
            EAS_BUILD_PROFILE: 'production',
            EXPO_ENABLE_SCHEDULE_WIDGET: '1',
        };

        const createConfig = require('../app.config').default as () => {
            plugins?: unknown[];
            extra?: {
                eas?: {
                    build?: {
                        experimental?: {
                            ios?: {
                                appExtensions?: Array<{
                                    targetName: string;
                                    bundleIdentifier: string;
                                    entitlements?: Record<string, unknown>;
                                }>;
                            };
                        };
                    };
                };
            };
        };
        const config = createConfig();
        const pluginEntries = config.plugins ?? [];
        const hasWidgetPlugin = pluginEntries.some((entry) =>
            Array.isArray(entry) ? entry[0] === './plugins/withScheduleWidget' : entry === './plugins/withScheduleWidget'
        );
        const appExtensions =
            config.extra?.eas?.build?.experimental?.ios?.appExtensions ?? [];

        expect(hasWidgetPlugin).toBe(true);
        expect(appExtensions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    targetName: 'ScheduleWidget',
                    bundleIdentifier: 'com.budev.HKCampus.ScheduleWidget',
                    entitlements: {
                        'com.apple.security.application-groups': ['group.com.budev.HKCampus'],
                    },
                }),
            ])
        );
    });

    it('uses the HKCampus brand asset for the home screen icons', () => {
        process.env = {
            ...originalEnv,
        };

        const createConfig = require('../app.config').default as () => {
            icon?: string;
            android?: {
                adaptiveIcon?: {
                    foregroundImage?: string;
                };
            };
        };
        const config = createConfig();

        expect(config.icon).toBe('./assets/images/HKCampusicon.png');
        expect(config.android?.adaptiveIcon?.foregroundImage).toBe('./assets/images/HKCampusicon.png');
    });
});
