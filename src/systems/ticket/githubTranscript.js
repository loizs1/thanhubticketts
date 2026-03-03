import { config } from 'dotenv';
config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // format: "username/repo"
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

/**
 * Upload HTML transcript to GitHub and return raw URL
 */
export async function uploadTranscriptToGitHub(ticketId, htmlContent, fileName) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    console.error('[GITHUB] Missing GITHUB_TOKEN or GITHUB_REPO environment variables');
    return null;
  }

  try {
    const [owner, repo] = GITHUB_REPO.split('/');
    const path = `transcripts/${fileName}`;
    const message = `Add transcript for ticket ${ticketId}`;
    
    // Check if file already exists
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${GITHUB_BRANCH}`;
    let sha = null;
    
    try {
      const getResponse = await fetch(getUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (getResponse.status === 200) {
        const fileData = await getResponse.json();
        sha = fileData.sha;
        console.log(`[GITHUB] File exists, will update. SHA: ${sha}`);
      }
    } catch (e) {
      // File doesn't exist, that's fine
    }

    // Create or update file
    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const body = {
      message: message,
      content: Buffer.from(htmlContent).toString('base64'),
      branch: GITHUB_BRANCH
    };
    
    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[GITHUB] API Error: ${response.status}`, error);
      return null;
    }

    const data = await response.json();
    console.log(`[GITHUB] File uploaded: ${data.content.html_url}`);
    
    // Return raw GitHub URL
    return `https://raw.githubusercontent.com/${owner}/${repo}/${GITHUB_BRANCH}/${path}`;

  } catch (error) {
    console.error('[GITHUB] Error uploading to GitHub:', error);
    return null;
  }
}

/**
 * Get GitHub-hosted transcript URL
 */
export function getGitHubTranscriptUrl(fileName) {
  if (!GITHUB_REPO) return null;
  const [owner, repo] = GITHUB_REPO.split('/');
  return `https://raw.githubusercontent.com/${owner}/${repo}/${GITHUB_BRANCH}/transcripts/${fileName}`;
}

export default {
  uploadTranscriptToGitHub,
  getGitHubTranscriptUrl
};
