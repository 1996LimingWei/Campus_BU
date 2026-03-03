// services/food.ts
import { supabase } from './supabase';

export interface FoodReview {
    id: string;
    outletId: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar?: string;
    rating: number;
    content: string;
    images: string[];
    likes: number;
    isLiked?: boolean;
    createdAt: string;
}

export const fetchFoodReviews = async (outletId?: string, userId?: string): Promise<FoodReview[]> => {
    let query = supabase
        .from('food_reviews')
        .select(`
            *,
            food_review_likes!left(user_id)
        `)
        .order('created_at', { ascending: false });

    if (outletId) {
        query = query.eq('outlet_id', outletId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(review => ({
        id: review.id,
        outletId: review.outlet_id,
        authorId: review.author_id,
        authorName: review.author_name,
        authorEmail: review.author_email,
        authorAvatar: review.author_avatar,
        rating: review.rating,
        content: review.content,
        images: Array.isArray(review.images) ? review.images : [],
        likes: review.likes,
        isLiked: userId ? (review.food_review_likes || []).some((l: any) => l.user_id === userId) : false,
        createdAt: review.created_at
    }));
};

export const addFoodReview = async (reviewData: {
    outletId: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar?: string;
    rating: number;
    content: string;
    images: string[];
}) => {
    const { data, error } = await supabase
        .from('food_reviews')
        .insert([{
            outlet_id: reviewData.outletId,
            author_id: reviewData.authorId,
            author_name: reviewData.authorName,
            author_email: reviewData.authorEmail,
            author_avatar: reviewData.authorAvatar,
            rating: reviewData.rating,
            content: reviewData.content,
            images: reviewData.images || []
        }])
        .select()
        .single();

    if (error) {
        console.error('Supabase error in addFoodReview:', error);
        throw error;
    }
    
    return data;
};

export const uploadFoodImage = async (uri: string): Promise<string> => {
    try {
        const arrayBuffer: ArrayBuffer = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = () => resolve(xhr.response);
            xhr.onerror = () => reject(new TypeError('Network request failed'));
            xhr.responseType = 'arraybuffer';
            xhr.open('GET', uri, true);
            xhr.send(null);
        });

        if (arrayBuffer.byteLength === 0) {
            throw new Error('Image file is empty');
        }

        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const filePath = `food/${fileName}`;

        const { data, error } = await supabase.storage
            .from('campus') // Reusing the 'campus' bucket
            .upload(filePath, arrayBuffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
            .from('campus')
            .getPublicUrl(filePath);

        return publicUrl;
    } catch (e: any) {
        console.error('Error in uploadFoodImage:', e);
        throw e;
    }
};

export const toggleFoodReviewLike = async (reviewId: string, userId: string) => {
    // Check if already liked
    const { data: existingLike } = await supabase
        .from('food_review_likes')
        .select()
        .eq('review_id', reviewId)
        .eq('user_id', userId)
        .single();

    if (existingLike) {
        // Unlike
        const { error: deleteError } = await supabase
            .from('food_review_likes')
            .delete()
            .eq('review_id', reviewId)
            .eq('user_id', userId);

        if (deleteError) throw deleteError;

        await supabase.rpc('decrement_food_review_likes', { rid: reviewId });
    } else {
        // Like
        const { error: insertError } = await supabase
            .from('food_review_likes')
            .insert({ review_id: reviewId, user_id: userId });

        if (insertError) throw insertError;

        await supabase.rpc('increment_food_review_likes', { rid: reviewId });
    }
};
