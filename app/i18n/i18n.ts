import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import storage from '../../lib/storage';
import en from './locales/en.json';
import zhHas from './locales/zh-Hans.json';
import zhHant from './locales/zh-Hant.json';

const resources = {
    en: { translation: en },
    'zh-Hans': { translation: zhHas },
    'zh-Hant': { translation: zhHant },
};

const initI18n = async () => {
    let savedLanguage = await storage.getItem('language');

    if (!savedLanguage) {
        // Fallback to device locale
        const locales = Localization.getLocales();
        const deviceLocale = locales[0]?.languageCode;

        if (deviceLocale === 'zh') {
            // Basic detection. 
            // On iOS/Android, getLocales() usually returns explicit codes like 'zh-Hans-CN' or 'zh-Hant-TW'
            // If it is just 'zh', we might check regionCode or languageTag if available
            const languageTag = locales[0]?.languageTag || '';
            if (languageTag.includes('Hant') || languageTag.includes('TW') || languageTag.includes('HK')) {
                savedLanguage = 'zh-Hant';
            } else {
                savedLanguage = 'zh-Hans';
            }
        } else {
            savedLanguage = 'en';
        }
    }

    await i18n.use(initReactI18next).init({
        resources,
        lng: savedLanguage,
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false
        },
        compatibilityJSON: 'v3' as any // Required for Android, cast to silence TS error
    });
};

// Export the initialization promise so we can wait for it if needed
export let i18nInitialized = false;
export const i18nPromise = (async () => {
    await initI18n();
    i18nInitialized = true;
})();

/**
 * Switch language and persist the choice
 */
export const changeLanguage = async (lang: string) => {
    await i18n.changeLanguage(lang);
    await storage.setItem('language', lang);
};

export default i18n;
