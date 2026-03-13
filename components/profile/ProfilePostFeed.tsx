import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MasonryGrid from '../campus/MasonryGrid';
import { MasonryPostCard } from '../campus/MasonryPostCard';
import { Post } from '../../types';
import { ProfileTabType } from './ProfileTabs';

interface ProfilePostFeedProps {
    activeTab: ProfileTabType;
    posts: Post[];
    likedPosts: Post[];
    onPostPress: (postId: string) => void;
    onLikePost: (postId: string) => void;
    currentUserId?: string;
    onAuthorPress?: (authorId: string) => void;
}

export const ProfilePostFeed: React.FC<ProfilePostFeedProps> = ({
    activeTab,
    posts,
    likedPosts,
    onPostPress,
    onLikePost,
    currentUserId,
    onAuthorPress,
}) => {
    const getData = () => {
        switch (activeTab) {
            case 'posts':
                return posts;
            case 'likes':
                return likedPosts;
            default:
                return [];
        }
    };

    const data = getData();

    if (data.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                    {activeTab === 'posts' ? '还没有发布过笔记哦' : '还没有点赞过笔记哦'}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <MasonryGrid
                data={data}
                columnGap={8}
                columnPadding={12}
                keyExtractor={(post: Post) => post.id}
                renderItem={(post: Post) => (
                    <MasonryPostCard
                        key={post.id}
                        post={post}
                        onPress={() => onPostPress(post.id)}
                        onLike={() => onLikePost(post.id)}
                        currentUserId={currentUserId}
                        onAuthorPress={onAuthorPress}
                    />
                )}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 12,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 100,
    },
    emptyText: {
        fontSize: 14,
        color: '#999',
    },
});
