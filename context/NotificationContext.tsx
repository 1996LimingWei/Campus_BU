import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getCurrentUser } from '../services/auth';
import { fetchNotifications, subscribeToNotifications } from '../services/notifications';

interface NotificationContextType {
    unreadCount: number;
    refreshCount: () => Promise<void>;
    clearCount: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [unreadCount, setUnreadCount] = useState(0);

    const refreshCount = useCallback(async () => {
        try {
            const user = await getCurrentUser();
            if (user) {
                const notifications = await fetchNotifications(user.uid);
                const unread = notifications.filter(n => !n.is_read).length;
                setUnreadCount(unread);
            }
        } catch (error) {
            console.error('Error refreshing notification count:', error);
        }
    }, []);

    const clearCount = useCallback(() => {
        setUnreadCount(0);
    }, []);

    useEffect(() => {
        let subscription: any;

        const init = async () => {
            const user = await getCurrentUser();
            if (user) {
                // Initial load
                await refreshCount();

                // Subscribe to real-time updates
                subscription = subscribeToNotifications(user.uid, (payload) => {
                    if (payload.new && !payload.new.is_read) {
                        setUnreadCount(prev => prev + 1);
                    } else if (payload.old && payload.new && payload.old.is_read === false && payload.new.is_read === true) {
                        // If marked as read, decrease count
                        setUnreadCount(prev => Math.max(0, prev - 1));
                    }
                });
            }
        };

        init();

        return () => {
            if (subscription) subscription.unsubscribe();
        };
    }, [refreshCount]);

    return (
        <NotificationContext.Provider value={{ unreadCount, refreshCount, clearCount }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};
