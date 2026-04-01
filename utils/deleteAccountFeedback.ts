type TranslateFn = (...args: any[]) => any;

type AlertCopy = {
    title: string;
    message: string;
};

export const getDeleteAccountSuccessAlertCopy = (t: TranslateFn): AlertCopy => ({
    title: String(t('common.success', { defaultValue: 'Success' })),
    message: String(t('profile.delete_account_success', { defaultValue: 'Your account has been deleted.' })),
});

export const getDeleteAccountErrorAlertCopy = (t: TranslateFn): AlertCopy => ({
    title: String(t('common.error', { defaultValue: 'Error' })),
    message: String(t(
        'profile.delete_account_failed_logged_in',
        { defaultValue: 'Account deletion failed. You are still signed in. Please try again.' }
    )),
});
