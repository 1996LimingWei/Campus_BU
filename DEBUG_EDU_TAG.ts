// 在浏览器控制台或React Native debugger中运行这个脚本来验证
// 或在你的应用中添加日志来调试

// 1. 验证getCurrentUser返回email
import { getCurrentUser } from './services/auth';

(async () => {
  const user = await getCurrentUser();
  console.log('Current User:', user);
  console.log('User Email:', user?.email);
})();

// 2. 验证isHKBUEmail函数
import { isHKBUEmail } from './utils/userUtils';

console.log('Test HKBU Email:', isHKBUEmail('test@life.hkbu.edu.hk')); // Should be true
console.log('Test non-HKBU Email:', isHKBUEmail('test@gmail.com')); // Should be false
console.log('Test undefined:', isHKBUEmail(undefined)); // Should be false

// 3. 在createPost中添加日志
// 在 app/campus/compose.tsx 中的handleSubmit函数内添加此日志：
console.log('Creating post with email:', (user as any).email);

// 4. 查看post数据中是否有authorEmail
import { fetchPosts } from './services/campus';

(async () => {
  const posts = await fetchPosts('All');
  console.log('First post author email:', posts[0]?.authorEmail);
  console.log('Full first post:', posts[0]);
})();
