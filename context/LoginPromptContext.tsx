import React, { createContext, useContext, useState } from 'react';
import { GuestLoginModal } from '../components/common/GuestLoginModal';

interface LoginPromptContextType {
    showLoginPrompt: (title?: string, message?: string) => void;
}

const LoginPromptContext = createContext<LoginPromptContextType | null>(null);

export const LoginPromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [visible, setVisible] = useState(false);
    const [params, setParams] = useState({ title: '', message: '' });

    const showLoginPrompt = (title?: string, message?: string) => {
        setParams({ title: title || '', message: message || '' });
        setVisible(true);
    };

    return (
        <LoginPromptContext.Provider value={{ showLoginPrompt }}>
            {children}
            <GuestLoginModal
                visible={visible}
                onClose={() => setVisible(false)}
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
