import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getCurrentUser } from '../services/auth';
import { fetchDirectConversations, subscribeToDirectConversationList } from '../services/messages';
import { fetchUnreadNotificationSummary, subscribeToNotifications } from '../services/notifications';

interface NotificationContextType {
    unreadCount: number;
    hasUnread: boolean;
    messageUnreadCount: number;
    totalUnreadCount: number;
    hasAnyUnread: boolean;
    refreshCount: () => Promise<void>;
    clearCount: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [unreadCount, setUnreadCount] = useState(0);
    const [hasUnread, setHasUnread] = useState(false);
    const [messageUnreadCount, setMessageUnreadCount] = useState(0);

    const refreshCount = useCallback(async () => {
        try {
            const user = await getCurrentUser();
            if (user) {
                const [summary, conversations] = await Promise.all([
                    fetchUnreadNotificationSummary(user.uid),
                    fetchDirectConversations(user.uid),
                ]);
                const unreadMessages = conversations.reduce((sum, conversation) => sum + (conversation.unreadCount || 0), 0);
                setUnreadCount(summary.unreadCount);
                setHasUnread(summary.hasUnread);
                setMessageUnreadCount(unreadMessages);
            } else {
                setUnreadCount(0);
                setHasUnread(false);
                setMessageUnreadCount(0);
            }
        } catch (error) {
            console.error('Error refreshing notification count:', error);
        }
    }, []);

    const clearCount = useCallback(() => {
        setUnreadCount(0);
        setHasUnread(false);
        setMessageUnreadCount(0);
    }, []);

    useEffect(() => {
        let notificationSubscription: any;
        let messageUnsubscribe: (() => void) | undefined;

        const init = async () => {
            const user = await getCurrentUser();
            if (user) {
                // Initial load
                await refreshCount();

                // Subscribe to real-time updates
                notificationSubscription = subscribeToNotifications(user.uid, (payload) => {
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

                messageUnsubscribe = subscribeToDirectConversationList(user.uid, () => {
                    refreshCount().catch((error) => {
                        console.error('Error refreshing counts after direct message update:', error);
                    });
                });
            }
        };

        init();

        return () => {
            if (notificationSubscription) notificationSubscription.unsubscribe();
            messageUnsubscribe?.();
        };
    }, [refreshCount]);

    const totalUnreadCount = unreadCount + messageUnreadCount;
    const hasAnyUnread = hasUnread || messageUnreadCount > 0;

    return (
        <NotificationContext.Provider
            value={{
                unreadCount,
                hasUnread,
                messageUnreadCount,
                totalUnreadCount,
                hasAnyUnread,
                refreshCount,
                clearCount,
            }}
        >
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
