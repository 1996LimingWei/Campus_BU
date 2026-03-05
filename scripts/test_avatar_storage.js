/**
 * 测试头像上传功能 (Node.js 版本)
 * 运行此脚本检查头像上传是否正常工作
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// 从环境变量读取配置
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 错误: 缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY');
    console.log('   请检查 .env 文件中的配置');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAvatarUpload() {
    console.log('=== 开始测试头像存储配置 ===\n');
    console.log('Supabase URL:', supabaseUrl);

    // 1. 检查用户是否已登录
    console.log('\n1. 检查用户认证状态...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
        console.log('ℹ️  当前没有活动会话（这是正常的，因为这是后台脚本）');
        console.log('   提示: 此测试需要在已登录状态下运行');
        console.log('   或者你可以直接检查存储桶配置');
    } else {
        console.log('✓ 用户已登录:', session.user.email);
        console.log('  用户ID:', session.user.id);
    }

    // 2. 检查存储桶是否存在
    console.log('\n2. 检查 user-avatars 存储桶...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
        console.error('❌ 无法获取存储桶列表:', bucketsError.message);
        console.log('\n可能的原因:');
        console.log('1. Supabase URL 或 Key 配置错误');
        console.log('2. 网络连接问题');
        console.log('3. Supabase 服务暂时不可用');
        return;
    }
    
    console.log('\n✓ 成功连接到 Supabase Storage');
    console.log('  找到的存储桶:', buckets.map(b => b.id).join(', '));
    
    const avatarBucket = buckets?.find(b => b.id === 'user-avatars');
    if (!avatarBucket) {
        console.error('\n❌ user-avatars 存储桶不存在');
        console.log('\n📋 解决步骤:');
        console.log('1. 打开 Supabase Dashboard → SQL Editor');
        console.log('2. 运行以下脚本:');
        console.log('   scripts/database/setup_user_avatars_storage.sql');
        console.log('   或者运行修复脚本:');
        console.log('   scripts/database/fix_avatar_storage.sql');
        return;
    }
    
    console.log('\n✓ user-avatars 存储桶存在');
    console.log('  公开访问:', avatarBucket.public ? '是 ✓' : '否 ✗');
    console.log('  ID:', avatarBucket.id);
    console.log('  名称:', avatarBucket.name);
    console.log('  创建时间:', avatarBucket.created_at);

    // 3. 检查存储桶中的文件
    console.log('\n3. 检查已上传的头像...');
    const { data: files, error: filesError } = await supabase.storage
        .from('user-avatars')
        .list('', { limit: 100 });
    
    if (filesError) {
        console.error('❌ 无法列出文件:', filesError.message);
    } else {
        if (files && files.length > 0) {
            console.log(`✓ 找到 ${files.length} 个文件/文件夹:`);
            files.slice(0, 5).forEach(file => {
                console.log(`  - ${file.name} (${file.metadata?.size || 'unknown size'})`);
            });
            if (files.length > 5) {
                console.log(`  ... 还有 ${files.length - 5} 个文件`);
            }
        } else {
            console.log('ℹ️  存储桶为空（还没有用户上传头像）');
        }
    }

    // 4. 测试公开 URL 生成
    console.log('\n4. 测试 URL 生成功能...');
    const testPath = 'test-user-id/avatar_1234567890.jpg';
    const { data: urlData } = supabase.storage
        .from('user-avatars')
        .getPublicUrl(testPath);
    
    console.log('✓ URL 生成功能正常');
    console.log('  示例 URL:', urlData.publicUrl);

    // 5. 检查 RLS 策略（需要使用 SQL 查询）
    console.log('\n5. 检查 RLS 策略...');
    const { data: policies, error: policiesError } = await supabase
        .rpc('exec_sql', { 
            query: `
                SELECT policyname, cmd 
                FROM pg_policies 
                WHERE schemaname = 'storage' 
                  AND tablename = 'objects' 
                  AND policyname LIKE '%avatar%'
            `
        })
        .catch(() => ({ data: null, error: null }));
    
    if (policiesError || !policies) {
        console.log('ℹ️  无法自动检查 RLS 策略（这需要在 SQL Editor 中手动检查）');
        console.log('   请在 Supabase SQL Editor 中运行:');
        console.log('   scripts/database/check_avatar_storage.sql');
    } else {
        console.log('✓ 策略检查完成');
    }

    // 总结
    console.log('\n=== 测试总结 ===');
    if (avatarBucket && avatarBucket.public) {
        console.log('✓ 存储桶配置正确');
        console.log('✓ 公开访问已启用');
        console.log('\n📱 应用端测试步骤:');
        console.log('1. 在应用中登录');
        console.log('2. 进入个人资料页面');
        console.log('3. 点击头像并选择图片');
        console.log('4. 检查是否成功上传');
        console.log('\n如果仍然无法上传，请检查:');
        console.log('- 网络连接');
        console.log('- 用户认证状态');
        console.log('- 浏览器控制台中的错误信息');
    } else {
        console.log('⚠️  需要修复存储桶配置');
        console.log('   请运行: scripts/database/fix_avatar_storage.sql');
    }
    
    console.log('\n=== 测试完成 ===\n');
}

// 运行测试
testAvatarUpload().catch(error => {
    console.error('\n❌ 测试过程中发生错误:', error.message);
    console.error('\n详细错误信息:');
    console.error(error);
    process.exit(1);
});
