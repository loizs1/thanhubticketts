import { config } from 'dotenv';
config();

const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;
const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;

/**
 * Upload HTML transcript to Netlify and return public URL
 */
export async function uploadTranscriptToNetlify(ticketId, htmlContent, fileName) {
  if (!NETLIFY_TOKEN || !NETLIFY_SITE_ID) {
    console.error('[NETLIFY] Missing NETLIFY_TOKEN or NETLIFY_SITE_ID environment variables');
    return null;
  }

  try {
    // First, get the current deploy to update it
    const deploysUrl = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys`;
    
    // Create a new deploy with the file
    const formData = new FormData();
    
    // Create a blob from the HTML content
    const blob = new Blob([htmlContent], { type: 'text/html' });
    formData.append('file', blob, fileName);
    
    const response = await fetch(`${deploysUrl}?unpublished=true`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NETLIFY_TOKEN}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[NETLIFY] API Error: ${response.status}`, error);
      return null;
    }

    const deploy = await response.json();
    console.log(`[NETLIFY] Deploy created: ${deploy.id}`);
    
    // Return the deploy URL
    return `https://${deploy.id}--${NETLIFY_SITE_ID}.netlify.app/${fileName}`;

  } catch (error) {
    console.error('[NETLIFY] Error uploading:', error);
    return null;
  }
}

/**
 * Alternative: Use Netlify Drop (simpler, no API needed)
 * Upload via their deploy API with base64 encoded files
 */
export async function deployToNetlify(ticketId, htmlContent, fileName) {
  if (!NETLIFY_TOKEN || !NETLIFY_SITE_ID) {
    console.error('[NETLIFY] Missing environment variables');
    return null;
  }

  try {
    // Prepare the file for deployment
    const files = {
      [fileName]: Buffer.from(htmlContent).toString('base64')
    };

    // Create deploy
    const deployUrl = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys`;
    
    const response = await fetch(deployUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NETLIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: files,
        draft: false
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[NETLIFY] Deploy Error: ${response.status}`, error);
      return null;
    }

    const deploy = await response.json();
    const url = `https://${NETLIFY_SITE_ID}.netlify.app/${fileName}`;
    
    console.log(`[NETLIFY] Deployed: ${url}`);
    return url;

  } catch (error) {
    console.error('[NETLIFY] Error:', error);
    return null;
  }
}

/**
 * Get Netlify site URL
 */
export function getNetlifyUrl(fileName) {
  if (!NETLIFY_SITE_ID) return null;
  return `https://${NETLIFY_SITE_ID}.netlify.app/${fileName}`;
}

export default {
  uploadTranscriptToNetlify,
  deployToNetlify,
  getNetlifyUrl
};
