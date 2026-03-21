import { DirectConversationSummary, DirectMessage, DirectMessagePeer } from '../types';
import { supabase } from './supabase';

const CONVERSATIONS_TABLE = 'direct_conversations';
const MESSAGES_TABLE = 'direct_messages';
const USERS_TABLE = 'users';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIRECT_IMAGE_PREFIX = '[image]';
const DIRECT_FILE_PREFIX = '[file]';

type ConversationRow = {
    id: string;
    participant_one: string;
    participant_two: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    created_at: string;
};

type MessageRow = {
    id: string;
    conversation_id: string;
    sender_id: string;
    receiver_id: string;
    content: string;
    created_at: string;
    read_at: string | null;
};

type UserRow = {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    major: string | null;
};

const isMessageTableMissing = (error: any): boolean => {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === '42P01'
        || message.includes(CONVERSATIONS_TABLE)
        || message.includes(MESSAGES_TABLE);
};

const sortParticipantIds = (userA: string, userB: string): [string, string] =>
    userA < userB ? [userA, userB] : [userB, userA];

const isUuid = (value?: string | null): value is string => !!value && UUID_PATTERN.test(value);

export const isDirectImageContent = (content?: string | null): boolean =>
    !!content && content.startsWith(DIRECT_IMAGE_PREFIX);

export const getDirectMessageImageUrl = (content?: string | null): string =>
    isDirectImageContent(content) ? content!.slice(DIRECT_IMAGE_PREFIX.length).trim() : '';

type DirectFilePayload = {
    name: string;
    url: string;
};

const parseDirectFilePayload = (content?: string | null): DirectFilePayload | null => {
    if (!content || !content.startsWith(DIRECT_FILE_PREFIX)) {
        return null;
    }

    try {
        const payload = JSON.parse(content.slice(DIRECT_FILE_PREFIX.length)) as DirectFilePayload;
        if (!payload?.url) {
            return null;
        }
        return {
            name: payload.name || 'File',
            url: payload.url,
        };
    } catch {
        return null;
    }
};

export const isDirectFileContent = (content?: string | null): boolean =>
    !!parseDirectFilePayload(content);

export const getDirectMessageFilePayload = (content?: string | null): DirectFilePayload | null =>
    parseDirectFilePayload(content);

export const getDirectMessagePreviewText = (content?: string | null): string => {
    if (!content) {
        return '';
    }

    if (content.startsWith(DIRECT_IMAGE_PREFIX)) {
        return '[图片]';
    }

    if (content.startsWith(DIRECT_FILE_PREFIX)) {
        return '[文件]';
    }

    return content;
};

export const getDirectMessageCopyText = (content?: string | null): string => {
    if (!content) {
        return '';
    }

    if (content.startsWith(DIRECT_IMAGE_PREFIX)) {
        return getDirectMessageImageUrl(content);
    }

    const filePayload = parseDirectFilePayload(content);
    if (filePayload) {
        return `${filePayload.name}\n${filePayload.url}`;
    }

    return content;
};

export const createDirectImageMessageContent = (imageUrl: string): string =>
    `${DIRECT_IMAGE_PREFIX}${imageUrl}`;

export const createDirectFileMessageContent = (payload: DirectFilePayload): string =>
    `${DIRECT_FILE_PREFIX}${JSON.stringify(payload)}`;

const buildPeerMap = (profiles: UserRow[] | null | undefined): Map<string, DirectMessagePeer> => {
    const map = new Map<string, DirectMessagePeer>();

    (profiles || []).forEach((profile) => {
        map.set(profile.id, {
            id: profile.id,
            name: profile.display_name || 'Unknown',
            avatar: profile.avatar_url || '',
            major: profile.major || '',
        });
    });

    return map;
};

const mapMessage = (
    row: MessageRow,
    peerMap: Map<string, DirectMessagePeer>,
): DirectMessage => {
    const sender = peerMap.get(row.sender_id);

    return {
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        receiverId: row.receiver_id,
        content: row.content,
        createdAt: new Date(row.created_at),
        readAt: row.read_at ? new Date(row.read_at) : null,
        senderName: sender?.name || 'Unknown',
        senderAvatar: sender?.avatar || '',
    };
};

export const fetchDirectConversations = async (
    currentUserId?: string,
): Promise<DirectConversationSummary[]> => {
    if (!currentUserId) {
        return [];
    }

    const { data: conversationRows, error: conversationError } = await supabase
        .from(CONVERSATIONS_TABLE)
        .select('id, participant_one, participant_two, last_message_at, last_message_preview, created_at')
        .or(`participant_one.eq.${currentUserId},participant_two.eq.${currentUserId}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

    if (conversationError) {
        if (isMessageTableMissing(conversationError)) {
            return [];
        }
        console.error('Error fetching direct conversations:', conversationError);
        throw conversationError;
    }

    const conversations = (conversationRows || []) as ConversationRow[];
    if (conversations.length === 0) {
        return [];
    }

    const conversationIds = conversations.map((conversation) => conversation.id);
    const otherUserIds = Array.from(new Set(
        conversations.map((conversation) =>
            conversation.participant_one === currentUserId
                ? conversation.participant_two
                : conversation.participant_one
        )
    ));

    const [profilesResult, unreadResult] = await Promise.all([
        otherUserIds.length > 0
            ? supabase
                .from(USERS_TABLE)
                .select('id, display_name, avatar_url, major')
                .in('id', otherUserIds)
            : Promise.resolve({ data: [], error: null } as any),
        supabase
            .from(MESSAGES_TABLE)
            .select('conversation_id')
            .eq('receiver_id', currentUserId)
            .is('read_at', null)
            .in('conversation_id', conversationIds),
    ]);

    if (profilesResult.error) {
        console.error('Error fetching message peers:', profilesResult.error);
        throw profilesResult.error;
    }

    if (unreadResult.error) {
        if (!isMessageTableMissing(unreadResult.error)) {
            console.error('Error fetching unread message counts:', unreadResult.error);
            throw unreadResult.error;
        }
    }

    const peerMap = buildPeerMap(profilesResult.data as UserRow[] | null);
    const unreadCountMap = new Map<string, number>();

    (unreadResult.data || []).forEach((row: any) => {
        const conversationId = row.conversation_id as string;
        unreadCountMap.set(conversationId, (unreadCountMap.get(conversationId) || 0) + 1);
    });

    return conversations
        .map((conversation) => {
            const otherUserId = conversation.participant_one === currentUserId
                ? conversation.participant_two
                : conversation.participant_one;
            const peer = peerMap.get(otherUserId) || {
                id: otherUserId,
                name: 'Unknown',
                avatar: '',
                major: '',
            };

            return {
                id: conversation.id,
                user: peer,
                lastMessage: getDirectMessagePreviewText(conversation.last_message_preview),
                timestamp: new Date(conversation.last_message_at || conversation.created_at),
                unreadCount: unreadCountMap.get(conversation.id) || 0,
            };
        })
        .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
};

export const getDirectConversationId = async (
    currentUserId: string,
    otherUserId: string,
): Promise<string | null> => {
    if (!isUuid(currentUserId) || !isUuid(otherUserId)) {
        return null;
    }

    const [participantOne, participantTwo] = sortParticipantIds(currentUserId, otherUserId);

    const { data, error } = await supabase
        .from(CONVERSATIONS_TABLE)
        .select('id')
        .eq('participant_one', participantOne)
        .eq('participant_two', participantTwo)
        .maybeSingle();

    if (error) {
        if (isMessageTableMissing(error)) {
            return null;
        }
        console.error('Error fetching direct conversation:', error);
        throw error;
    }

    return data?.id || null;
};

export const ensureDirectConversation = async (
    currentUserId: string,
    otherUserId: string,
): Promise<string> => {
    if (!isUuid(currentUserId) || !isUuid(otherUserId)) {
        throw new Error('Invalid direct conversation participants');
    }

    const existingConversationId = await getDirectConversationId(currentUserId, otherUserId);
    if (existingConversationId) {
        return existingConversationId;
    }

    const [participantOne, participantTwo] = sortParticipantIds(currentUserId, otherUserId);

    const { data, error } = await supabase
        .from(CONVERSATIONS_TABLE)
        .insert({
            participant_one: participantOne,
            participant_two: participantTwo,
        })
        .select('id')
        .single();

    if (error) {
        if (error.code === '23505') {
            const conversationId = await getDirectConversationId(currentUserId, otherUserId);
            if (conversationId) {
                return conversationId;
            }
        }

        console.error('Error creating direct conversation:', error);
        throw error;
    }

    return data.id;
};

export const fetchDirectMessages = async (
    currentUserId: string,
    otherUserId: string,
): Promise<{ conversationId: string | null; peer: DirectMessagePeer | null; messages: DirectMessage[] }> => {
    if (!isUuid(currentUserId) || !isUuid(otherUserId)) {
        return {
            conversationId: null,
            peer: null,
            messages: [],
        };
    }

    const [conversationId, profileResult] = await Promise.all([
        getDirectConversationId(currentUserId, otherUserId),
        supabase
            .from(USERS_TABLE)
            .select('id, display_name, avatar_url, major')
            .eq('id', otherUserId)
            .maybeSingle(),
    ]);

    if (profileResult.error) {
        console.error('Error fetching direct message peer profile:', profileResult.error);
        throw profileResult.error;
    }

    const peer = profileResult.data
        ? buildPeerMap([profileResult.data as UserRow]).get(otherUserId) || null
        : null;

    if (!conversationId) {
        return { conversationId: null, peer, messages: [] };
    }

    const { data: messageRows, error: messageError } = await supabase
        .from(MESSAGES_TABLE)
        .select('id, conversation_id, sender_id, receiver_id, content, created_at, read_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

    if (messageError) {
        console.error('Error fetching direct messages:', messageError);
        throw messageError;
    }

    const peerIds = Array.from(new Set(
        ((messageRows || []) as MessageRow[]).flatMap((row) => [row.sender_id, row.receiver_id])
    ));

    if (peerIds.length === 0) {
        return {
            conversationId,
            peer,
            messages: [],
        };
    }

    const { data: profileRows, error: profilesError } = await supabase
        .from(USERS_TABLE)
        .select('id, display_name, avatar_url, major')
        .in('id', peerIds);

    if (profilesError) {
        console.error('Error fetching direct message participants:', profilesError);
        throw profilesError;
    }

    const profileMap = buildPeerMap(profileRows as UserRow[] | null);

    return {
        conversationId,
        peer,
        messages: ((messageRows || []) as MessageRow[]).map((row) => mapMessage(row, profileMap)),
    };
};

export const sendDirectMessage = async (
    senderId: string,
    receiverId: string,
    content: string,
): Promise<{ conversationId: string; messageId: string }> => {
    if (!isUuid(senderId) || !isUuid(receiverId)) {
        throw new Error('Invalid direct message participants');
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
        throw new Error('Message content cannot be empty');
    }

    const conversationId = await ensureDirectConversation(senderId, receiverId);

    const { data, error } = await supabase
        .from(MESSAGES_TABLE)
        .insert({
            conversation_id: conversationId,
            sender_id: senderId,
            receiver_id: receiverId,
            content: trimmedContent,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error sending direct message:', error);
        throw error;
    }

    return {
        conversationId,
        messageId: data.id,
    };
};

export const deleteDirectMessage = async (
    messageId: string,
    senderId: string,
): Promise<void> => {
    if (!messageId || !isUuid(senderId)) {
        throw new Error('Invalid direct message deletion request');
    }

    const { error } = await supabase
        .from(MESSAGES_TABLE)
        .delete()
        .eq('id', messageId)
        .eq('sender_id', senderId);

    if (error) {
        console.error('Error deleting direct message:', error);
        throw error;
    }
};

export const uploadDirectMessageImage = async (uri: string): Promise<string> => {
    const arrayBuffer: ArrayBuffer = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = () => reject(new TypeError('Network request failed'));
        xhr.responseType = 'arraybuffer';
        xhr.open('GET', uri, true);
        xhr.send(null);
    });

    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const filePath = `direct-messages/${fileName}`;

    const { error } = await supabase.storage
        .from('campus')
        .upload(filePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

    if (error) {
        console.error('Error uploading direct message image:', error);
        throw error;
    }

    const { data: { publicUrl } } = supabase.storage.from('campus').getPublicUrl(filePath);
    return publicUrl;
};

export const uploadDirectMessageFile = async (
    uri: string,
    fileName?: string,
    mimeType?: string,
): Promise<DirectFilePayload> => {
    const arrayBuffer: ArrayBuffer = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = () => reject(new TypeError('Network request failed'));
        xhr.responseType = 'arraybuffer';
        xhr.open('GET', uri, true);
        xhr.send(null);
    });

    const safeName = (fileName || `file-${Date.now()}`).replace(/[^\w.\-]+/g, '-');
    const filePath = `direct-files/${Date.now()}-${safeName}`;

    const { error } = await supabase.storage
        .from('campus')
        .upload(filePath, arrayBuffer, {
            contentType: mimeType || 'application/octet-stream',
            upsert: true,
        });

    if (error) {
        console.error('Error uploading direct message file:', error);
        throw error;
    }

    const { data: { publicUrl } } = supabase.storage.from('campus').getPublicUrl(filePath);
    return {
        name: fileName || 'File',
        url: publicUrl,
    };
};

export const markConversationAsRead = async (
    conversationId?: string | null,
    currentUserId?: string,
): Promise<void> => {
    if (!conversationId || !currentUserId) {
        return;
    }

    const { error } = await supabase
        .from(MESSAGES_TABLE)
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('receiver_id', currentUserId)
        .is('read_at', null);

    if (error && !isMessageTableMissing(error)) {
        console.error('Error marking direct messages as read:', error);
        throw error;
    }
};

export const subscribeToDirectConversation = (
    conversationId: string,
    onChange: () => void,
) => {
    const channel = supabase
        .channel(`direct-conversation:${conversationId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: MESSAGES_TABLE,
            filter: `conversation_id=eq.${conversationId}`,
        }, onChange)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: MESSAGES_TABLE,
            filter: `conversation_id=eq.${conversationId}`,
        }, onChange)
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: MESSAGES_TABLE,
            filter: `conversation_id=eq.${conversationId}`,
        }, onChange)
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};

export const subscribeToDirectConversationList = (
    currentUserId: string,
    onChange: () => void,
) => {
    const channel = supabase
        .channel(`direct-conversation-list:${currentUserId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: MESSAGES_TABLE,
            filter: `sender_id=eq.${currentUserId}`,
        }, onChange)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: MESSAGES_TABLE,
            filter: `receiver_id=eq.${currentUserId}`,
        }, onChange)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: MESSAGES_TABLE,
            filter: `receiver_id=eq.${currentUserId}`,
        }, onChange)
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};
