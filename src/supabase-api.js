// supabase-api.js

const SUPABASE_URL = 'https://ttbwkjnipnwqaujkyotc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Mb7Bm7xyq0yaHjhGeHS76w_CNvfcCjU';

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export async function getOrCreateToken(userSlug) {
  if (!userSlug) return null;
  try {
    const getResponse = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync?user_slug=eq.${userSlug}&select=token`, {
      method: 'GET',
      headers: HEADERS,
    });
    if (!getResponse.ok) throw new Error('Failed to fetch existing token');
    const existingData = await getResponse.json();
    if (existingData && existingData.length > 0) return existingData[0].token;

    const postResponse = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync`, {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify({
        user_slug: userSlug,
        ratings_data: {},
        updated_at: new Date().toISOString(),
      }),
    });
    if (!postResponse.ok) throw new Error('Failed to create new token');
    const newData = await postResponse.json();
    return newData[0].token;
  } catch (error) {
    console.error('[CC Sync] Error generating token:', error);
    return null;
  }
}

/**
 * Downloads the user's ratings from Supabase.
 */
export async function downloadFromCloud(userToken) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync?token=eq.${userToken}&select=ratings_data`, {
      method: 'GET',
      headers: HEADERS,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.length > 0 ? data[0].ratings_data : null;
  } catch (error) {
    console.error('[CC Sync] Download error:', error);
    return null;
  }
}

/**
 * Uploads merged ratings to Supabase using an Upsert.
 */
export async function uploadToCloud(userToken, ratingsJson, userSlug) {
  try {
    const payload = {
      token: userToken,
      ratings_data: ratingsJson,
      updated_at: new Date().toISOString(),
    };

    // Include user_slug so Supabase's Upsert doesn't fail the Not-Null constraint
    if (userSlug) {
      payload.user_slug = userSlug;
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/cloud_sync`, {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    console.error('[CC Sync] Upload error:', error);
    return false;
  }
}
