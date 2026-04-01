import { LEGAL_CONTENT, TAB_LABELS } from '../../app/legalContent';

describe('legal content localization', () => {
    it('uses readable Simplified Chinese copy', () => {
        expect(LEGAL_CONTENT['zh-Hans'].privacy.title).toBe('隐私政策');
        expect(LEGAL_CONTENT['zh-Hans'].terms.sections[0].heading).toBe('账号删除');
        expect(LEGAL_CONTENT['zh-Hans'].terms.sections[0].body).toContain('个人中心');
        expect(TAB_LABELS['zh-Hans']).toEqual({
            privacy: '隐私',
            terms: '删除说明',
        });
    });

    it('uses readable Traditional Chinese copy', () => {
        expect(LEGAL_CONTENT['zh-Hant'].privacy.title).toBe('隱私政策');
        expect(LEGAL_CONTENT['zh-Hant'].terms.sections[0].heading).toBe('帳號刪除');
        expect(LEGAL_CONTENT['zh-Hant'].terms.sections[0].body).toContain('個人中心');
        expect(TAB_LABELS['zh-Hant']).toEqual({
            privacy: '隱私',
            terms: '刪除說明',
        });
    });
});
