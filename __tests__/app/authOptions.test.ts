import { AUTH_DOMAIN_OPTIONS, AUTH_LANGUAGE_OPTIONS } from '../../app/authOptions';

describe('auth option labels', () => {
    it('exposes readable language labels', () => {
        expect(AUTH_LANGUAGE_OPTIONS).toEqual([
            { label: '简体中文', value: 'zh-Hans' },
            { label: '繁體中文', value: 'zh-Hant' },
            { label: 'English', value: 'en' },
        ]);
    });

    it('exposes a readable fallback domain label', () => {
        expect(AUTH_DOMAIN_OPTIONS[4]).toEqual({
            label: 'Other / 其他',
            value: 'other',
        });
    });
});
