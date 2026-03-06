import { useTranslation } from 'react-i18next';
import { useLoginPromptContext } from '../context/LoginPromptContext';
import { User } from '../types';

export const useLoginPrompt = () => {
    const { t } = useTranslation();
    const { showLoginPrompt } = useLoginPromptContext();

    /**
     * Checks if a user is logged in. 
     * If not, shows an alert and returns false.
     * If yes, returns true.
     */
    const checkLogin = (user: User | any | null, actionName?: string): boolean => {
        if (user) return true;

        showLoginPrompt(
            t('auth.guest_prompt_title', 'Login Required'),
            t('auth.guest_prompt_msg', 'Please login to continue.')
        );
        return false;
    };

    return { checkLogin };
};
