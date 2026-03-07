import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getCurrentUser } from '../services/auth';
import { fetchUnreadNotificationSummary, subscribeToNotifications } from '../services/notifications';

interface NotificationContextType {
    unreadCount: number;
    hasUnread: boolean;
    refreshCount: () => Promise<void>;
    clearCount: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [unreadCount, setUnreadCount] = useState(0);
    const [hasUnread, setHasUnread] = useState(false);

    const refreshCount = useCallback(async () => {
        try {
            const user = await getCurrentUser();
            if (user) {
                const summary = await fetchUnreadNotificationSummary(user.uid);
                setUnreadCount(summary.unreadCount);
                setHasUnread(summary.hasUnread);
            } else {
                setUnreadCount(0);
                setHasUnread(false);
            }
        } catch (error) {
            console.error('Error refreshing notification count:', error);
        }
    }, []);

    const clearCount = useCallback(() => {
        setUnreadCount(0);
        setHasUnread(false);
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
                    if (payload.eventType === 'INSERT' && payload.new && !payload.new.is_read) {
                        setHasUnread(true);
                        setUnreadCount(prev => prev + 1);
                    } else if (
                        payload.eventType === 'UPDATE' &&
                        payload.old &&
                        payload.new &&
                        payload.old.is_read === false &&
                        payload.new.is_read === true
                    ) {
                        setUnreadCount(prev => {
                            const nextCount = Math.max(0, prev - 1);
                            return nextCount;
                        });
                        refreshCount().catch((error) => {
                            console.error('Error refreshing notification count after read update:', error);
                        });
                    } else if (
                        payload.eventType === 'UPDATE' &&
                        payload.old &&
                        payload.new &&
                        payload.old.is_read === true &&
                        payload.new.is_read === false
                    ) {
                        setHasUnread(true);
                        setUnreadCount(prev => prev + 1);
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
        <NotificationContext.Provider value={{ unreadCount, hasUnread, refreshCount, clearCount }}>
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
