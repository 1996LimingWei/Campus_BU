import { getTabLabel } from '../../app/(tabs)/tabLabels';

describe('getTabLabel', () => {
    it('returns the translated label when i18n resolves it', () => {
        const t = jest.fn((key: string) => ({
            home: 'Campus',
        }[key] || key));

        expect(getTabLabel(t, 'home')).toBe('Campus');
    });

    it('falls back to Chinese when i18n returns the key itself', () => {
        const t = jest.fn((key: string) => key);

        expect(getTabLabel(t, 'home')).toBe('校园圈');
        expect(getTabLabel(t, 'map')).toBe('地图');
    });

    it('falls back to Chinese when i18n returns an empty label', () => {
        const t = jest.fn(() => '');

        expect(getTabLabel(t, 'agent')).toBe('助手');
    });
});
