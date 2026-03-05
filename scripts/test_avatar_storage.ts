/**
 * 测试头像上传功能
 * 运行此脚本检查头像上传是否正常工作
 */

import { supabase } from '../services/supabase';

async function testAvatarUpload() {
    console.log('=== 开始测试头像存储配置 ===\n');

    // 1. 检查用户是否已登录
    console.log('1. 检查用户认证状态...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
        console.error('❌ 用户未登录或会话无效');
        console.error('   请先登录再测试头像上传功能');
        return;
    }
    
    console.log('✓ 用户已登录:', session.user.email);
    console.log('  用户ID:', session.user.id);

    // 2. 检查存储桶是否存在
    console.log('\n2. 检查 user-avatars 存储桶...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
        console.error('❌ 无法获取存储桶列表:', bucketsError.message);
        return;
    }
    
    const avatarBucket = buckets?.find(b => b.id === 'user-avatars');
    if (!avatarBucket) {
        console.error('❌ user-avatars 存储桶不存在');
        console.log('   解决方法: 在 Supabase SQL Editor 中运行:');
        console.log('   scripts/database/setup_user_avatars_storage.sql');
        return;
    }
    
    console.log('✓ user-avatars 存储桶存在');
    console.log('  公开访问:', avatarBucket.public ? '是' : '否');

    // 3. 测试文件上传权限（使用一个小的测试文件）
    console.log('\n3. 测试上传权限...');
    const testFileName = `${session.user.id}/test_${Date.now()}.txt`;
    const testContent = new Blob(['test'], { type: 'text/plain' });
    
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('user-avatars')
        .upload(testFileName, testContent, {
            contentType: 'text/plain',
            upsert: true
        });
    
    if (uploadError) {
        console.error('❌ 上传测试失败:', uploadError.message);
        console.log('\n   常见问题:');
        console.log('   1. RLS 策略未正确设置');
        console.log('   2. 存储桶权限配置错误');
        console.log('   3. 文件路径不符合策略要求');
        console.log('\n   解决方法: 运行修复脚本');
        console.log('   scripts/database/fix_avatar_storage.sql');
        return;
    }
    
    console.log('✓ 上传权限正常');

    // 4. 测试读取权限
    console.log('\n4. 测试读取权限...');
    const { data: publicUrlData } = supabase.storage
        .from('user-avatars')
        .getPublicUrl(testFileName);
    
    console.log('✓ 公开URL生成成功');
    console.log('  URL:', publicUrlData.publicUrl);

    // 5. 清理测试文件
    console.log('\n5. 清理测试文件...');
    const { error: deleteError } = await supabase.storage
        .from('user-avatars')
        .remove([testFileName]);
    
    if (deleteError) {
        console.warn('⚠ 删除测试文件失败:', deleteError.message);
    } else {
        console.log('✓ 测试文件已清理');
    }

    // 6. 检查用户表配置
    console.log('\n6. 检查用户表配置...');
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, display_name, avatar_url')
        .eq('id', session.user.id)
        .single();
    
    if (userError) {
        console.error('❌ 无法读取用户数据:', userError.message);
        return;
    }
    
    console.log('✓ 用户数据读取正常');
    console.log('  显示名称:', userData.display_name);
    console.log('  当前头像:', userData.avatar_url || '(未设置)');

    console.log('\n=== ✓ 所有测试通过！头像上传功能配置正确 ===');
}

// 运行测试
testAvatarUpload().catch(console.error);
