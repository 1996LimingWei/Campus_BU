import React, { createContext, useContext, useState } from 'react';
import { GuestLoginModal } from '../components/common/GuestLoginModal';

type LoginPromptOptions = {
    onClose?: () => void;
    onLogin?: () => void;
};

interface LoginPromptContextType {
    showLoginPrompt: (title?: string, message?: string, options?: LoginPromptOptions) => void;
}

const LoginPromptContext = createContext<LoginPromptContextType | null>(null);

export const LoginPromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [visible, setVisible] = useState(false);
    const [params, setParams] = useState({ title: '', message: '' });
    const [options, setOptions] = useState<LoginPromptOptions>({});

    const showLoginPrompt = (title?: string, message?: string, nextOptions?: LoginPromptOptions) => {
        setParams({ title: title || '', message: message || '' });
        setOptions(nextOptions || {});
        setVisible(true);
    };

    const handleClose = () => {
        setVisible(false);
        const onClose = options.onClose;
        setOptions({});
        onClose?.();
    };

    const handleLogin = () => {
        setVisible(false);
        const onLogin = options.onLogin;
        setOptions({});
        onLogin?.();
    };

    return (
        <LoginPromptContext.Provider value={{ showLoginPrompt }}>
            {children}
            <GuestLoginModal
                visible={visible}
                onClose={handleClose}
                onLogin={handleLogin}
                title={params.title}
                message={params.message}
            />
        </LoginPromptContext.Provider>
    );
};

export const useLoginPromptContext = () => {
    const context = useContext(LoginPromptContext);
    if (!context) {
        throw new Error('useLoginPromptContext must be used within a LoginPromptProvider');
    }
    return context;
};
