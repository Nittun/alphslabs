/**
 * API Configuration
 * Uses environment variable for production, falls back to localhost for development
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

/**
 * Helper function to make API calls
 * @param {string} endpoint - API endpoint (e.g., '/api/health')
 * @param {object} options - fetch options
 * @returns {Promise<Response>}
 */
export async function apiCall(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  return fetch(url, options);
}

/**
 * Helper for GET requests
 */
export async function apiGet(endpoint) {
  return apiCall(endpoint, { method: 'GET' });
}

/**
 * Helper for POST requests with JSON body
 */
export async function apiPost(endpoint, data) {
  return apiCall(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

