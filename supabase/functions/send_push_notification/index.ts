import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// --- Simple localization fallback mapping based on zh-Hans.json ---
// In a full system, you might fetch user locale, but here we fallback to Chinese
const getLocalizedTitle = (key: string): string => {
  const titles: Record<string, string> = {
    'notifications.title_comment': '新评论',
    'notifications.title_reply': '新回复',
    'notifications.title_like': '获赞',
  };
  if (titles[key]) {
    return titles[key];
  }

  if (!key.startsWith('notifications.')) {
    return key;
  }

  return '新通知';
}

const getLocalizedBody = (contentRaw: string): string => {
  try {
    // Attempt to parse if it's JSON from campus.ts e.g., { key: '...', params: {...} }
    const obj = JSON.parse(contentRaw);
    if (obj.key === 'notifications.post_like' && obj.params?.content) {
      return `有人点赞了您的贴子: "${obj.params.content}..."`;
    }
    if (obj.key === 'notifications.post_comment' && obj.params?.name) {
      return `${obj.params.name} 评论了您的贴子。`;
    }
    if (obj.key === 'notifications.post_reply' && obj.params?.name) {
      return `${obj.params.name} 回复了您的评论。`;
    }
  } catch (e) {
    // Process plain string fallback
  }
  return contentRaw;
}

serve(async (req) => {
  try {
    const payload = await req.json()
    console.log("Received webhook payload:", JSON.stringify(payload))

    // This is triggered by INSERT on the `notifications` table
    const record = payload.record
    if (!record || !record.user_id) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 })
    }

    const { user_id, title, content } = record

    // Initialize Supabase Client to fetch push tokens
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch the push tokens for this user
    const { data: pushTokens, error } = await supabase
      .from('user_push_tokens')
      .select('token')
      .eq('user_id', user_id)

    if (error) {
      console.error("Error fetching tokens:", error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    if (!pushTokens || pushTokens.length === 0) {
      console.log(`No push tokens found for user ${user_id}`)
      return new Response(JSON.stringify({ message: 'No push tokens found' }), { status: 200 })
    }

    // Build the push message
    const messageTitle = getLocalizedTitle(title)
    const messageBody = getLocalizedBody(content)

    const messages = [];
    for (const pushToken of pushTokens) {
      // Check that all your push tokens appear to be valid Expo push tokens
      if (!pushToken.token.includes('ExponentPushToken[')) {
        console.error(`Push token ${pushToken.token} is not a valid Expo push token`)
        continue
      }

      // Construct the message (more info: https://docs.expo.dev/push-notifications/sending-notifications/)
      messages.push({
        to: pushToken.token,
        sound: 'default',
        title: messageTitle,
        body: messageBody,
        data: { notificationId: record.id, relatedId: record.related_id, type: record.type },
      })
    }

    if (messages.length === 0) {
      return new Response(JSON.stringify({ message: 'No valid Expo push tokens found' }), { status: 200 })
    }

    // Send notifications via Expo's API
    console.log("Sending push notification chunks to Expo...")
    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })

    const expoData = await expoResponse.json()
    console.log("Expo API Response:", JSON.stringify(expoData))

    return new Response(
      JSON.stringify({ message: 'Push notifications sent!', data: expoData }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error("Error processing push notification webhook:", error)
    return new Response(JSON.stringify({ error: error.message }), { status: 400 })
  }
})
