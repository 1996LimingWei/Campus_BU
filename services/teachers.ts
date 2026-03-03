
import { Teacher, TeacherReview } from '../types';
import { supabase } from './supabase';

/**
 * 获取教师列表，支持按学院、学系过滤和姓名搜索
 */
export const getTeachers = async (options?: {
    faculty?: string;
    department?: string;
    searchQuery?: string
}): Promise<Teacher[]> => {
    let query = supabase.from('teachers').select('*');

    if (options?.faculty && options.faculty !== 'All') {
        query = query.eq('faculty', options.faculty);
    }
    if (options?.department && options.department !== 'All') {
        query = query.eq('department', options.department);
    }
    if (options?.searchQuery) {
        query = query.ilike('name', `%${options.searchQuery}%`);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) {
        console.error('Error fetching teachers:', error);
        throw error;
    }
    if (!data) return [];

    return data.map(t => ({
        id: t.id,
        faculty: t.faculty,
        department: t.department,
        name: t.name,
        title: t.title,
        imageUrl: t.image_url,
        email: t.email,
        sourceUrl: t.source_url,
        ratingAvg: t.rating_avg || 0,
        reviewCount: t.review_count || 0,
        tags: Array.isArray(t.tags) ? t.tags : []
    }));
};

/**
 * 获取单个教师详情
 */
export const getTeacherById = async (id: string): Promise<Teacher | null> => {
    const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error(`Error fetching teacher ${id}:`, error);
        return null;
    }
    if (!data) return null;

    return {
        id: data.id,
        faculty: data.faculty,
        department: data.department,
        name: data.name,
        title: data.title,
        imageUrl: data.image_url,
        email: data.email,
        sourceUrl: data.source_url,
        ratingAvg: data.rating_avg || 0,
        reviewCount: data.review_count || 0,
        tags: Array.isArray(data.tags) ? data.tags : []
    };
};

/**
 * 获取教师的所有评价，支持按最新排序，并标记当前用户是否已点赞
 */
export const getTeacherReviews = async (teacherId: string, userId?: string): Promise<TeacherReview[]> => {
    const { data, error } = await supabase
        .from('teacher_reviews')
        .select(`
            *,
            author:users!author_id(email, display_name, avatar_url),
            teacher_review_likes!left(user_id)
        `)
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error(`Error fetching reviews for teacher ${teacherId}:`, error);
        throw error;
    }
    if (!data) return [];

    return data.map(r => ({
        id: r.id,
        teacherId: r.teacher_id,
        authorId: r.author_id,
        authorName: r.author && r.author_name !== '匿名的同学' ? (r.author.display_name || r.author.displayName) : r.author_name,
        authorEmail: r.author && r.author_name !== '匿名的同学' ? r.author.email : undefined,
        authorAvatar: r.author && r.author_name !== '匿名的同学' ? r.author.avatar_url : r.author_avatar,
        rating: r.rating,
        difficulty: r.difficulty || 3,
        workload: r.workload || 3,
        content: r.content,
        tags: Array.isArray(r.tags) ? r.tags : [],
        likes: r.likes || 0,
        isLiked: userId ? (r.teacher_review_likes || []).some((l: any) => l.user_id === userId) : false,
        createdAt: new Date(r.created_at)
    }));
};

/**
 * 提交针对教师的评价
 */
export const submitTeacherReview = async (review: Partial<TeacherReview>) => {
    const { data, error } = await supabase
        .from('teacher_reviews')
        .insert([{
            teacher_id: review.teacherId,
            author_id: review.authorId, // 仍然保留 ID 用于防止刷票/限流，但展示层匿名
            author_name: '匿名的同学',
            author_avatar: null,
            rating: review.rating,
            difficulty: review.difficulty,
            workload: review.workload,
            content: review.content,
            tags: review.tags || []
        }])
        .select()
        .single();

    if (error) {
        console.error('Error submitting teacher review:', error);
        throw error;
    }

    // 更新教师表中的评价统计数据 (建议在数据库端使用 Trigger 实现，此处为客户端逻辑备份)
    await updateTeacherStats(review.teacherId!);

    return data;
};

/**
 * 点赞/取消点赞教师评价
 */
export const toggleTeacherReviewLike = async (reviewId: string, userId: string) => {
    const { data: existingLike } = await supabase
        .from('teacher_review_likes')
        .select()
        .eq('review_id', reviewId)
        .eq('user_id', userId)
        .single();

    if (existingLike) {
        // 取消点赞
        const { error: deleteError } = await supabase
            .from('teacher_review_likes')
            .delete()
            .eq('review_id', reviewId)
            .eq('user_id', userId);

        if (deleteError) throw deleteError;

        await supabase.rpc('decrement_teacher_review_likes', { rid: reviewId });
    } else {
        // 点赞
        const { error: insertError } = await supabase
            .from('teacher_review_likes')
            .insert({ review_id: reviewId, user_id: userId });

        if (insertError) throw insertError;

        await supabase.rpc('increment_teacher_review_likes', { rid: reviewId });
    }
};

/**
 * 内部函数：手动更新教师评分统计
 */
async function updateTeacherStats(teacherId: string) {
    const { data: allRatings } = await supabase
        .from('teacher_reviews')
        .select('rating')
        .eq('teacher_id', teacherId);

    if (allRatings && allRatings.length > 0) {
        const sum = allRatings.reduce((acc, curr) => acc + (curr.rating || 0), 0);
        const avg = sum / allRatings.length;

        await supabase
            .from('teachers')
            .update({
                rating_avg: parseFloat(avg.toFixed(1)),
                review_count: allRatings.length
            })
            .eq('id', teacherId);
    }
}

/**
 * 生成教师的 AI 总结（虎扑风格锐评）
 */
export const summarizeTeacherReviews = async (teacherId: string): Promise<string> => {
    const reviews = await getTeacherReviews(teacherId);
    if (reviews.length === 0) return '暂无评价，期待你的首发锐评！';

    const teacher = await getTeacherById(teacherId);
    if (!teacher) return '';

    // 聚合数据进行模拟总结
    const avgDifficulty = reviews.reduce((acc, r) => acc + r.difficulty, 0) / reviews.length;

    // 聚合标签
    const commonTags = reviews.flatMap(r => r.tags);
    let topTag = '宝藏老师';
    if (commonTags.length > 0) {
        const counts: Record<string, number> = {};
        commonTags.forEach(tag => counts[tag] = (counts[tag] || 0) + 1);
        topTag = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    }

    // 虎扑风格模板
    const templates = [
        `这位${teacher.name}老师主打一个“${topTag}”。难度系数${avgDifficulty > 4 ? '直接拉满，建议抗压型选手选修' : '适中，是刷分的好去处'}。一句话总结：${teacher.ratingAvg > 4 ? '入股不亏，满分神作。' : '中庸之道，平稳落地。'}`,
        `“${topTag}”是大家对${teacher.name}老师的一致共识。如果你的目标是${avgDifficulty < 3 ? '稳过不挂' : '挑战自我'}，选他就对了。难度方面，${avgDifficulty > 3 ? '还是有点硬核的，别想躺平' : '基本是福利局，大家低调选修'}。`,
        `锐评：${teacher.name}老师在${teacher.department}简直是“${topTag}”的代名词。给分${teacher.ratingAvg > 4 ? '相当大方' : '比较严格'}。建议：${avgDifficulty > 4 ? '速速退散，除非你是战神' : '先到先得，不试后悔'}。`
    ];

    return templates[Math.floor(Math.random() * templates.length)];
};
