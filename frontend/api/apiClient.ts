import axios from 'axios';

// Determine if we're running in Docker/local development
const isDocker = process.env.NEXT_PUBLIC_DOCKER === 'true';
const isDevelopment = process.env.NODE_ENV === 'development';
const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');

// Set API URL based on environment
let apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

// Force local URL if we're in development/Docker
if (isDevelopment || isDocker) {
  apiUrl = 'http://localhost:80';
  console.log('⚠️ Development environment detected: Using local API URL:', apiUrl);
} 
// Ensure HTTPS for production environments, especially on Vercel
else if (apiUrl.startsWith('http://') && !apiUrl.includes('localhost')) {
  apiUrl = apiUrl.replace('http://', 'https://');
  console.log('🔒 Converting API URL to HTTPS for security:', apiUrl);
}

// Log the final API URL being used
console.log('🌐 API URL:', apiUrl);

// Create an instance of axios with a custom config
const apiClient = axios.create({
  baseURL: apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds timeout
});

// Add request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for logging
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Response Error:', error);
    
    // Enhance error logs with more details if available
    if (error.response) {
      console.error('Error Response Data:', error.response.data);
      console.error('Error Response Status:', error.response.status);
      console.error('Error Response Headers:', error.response.headers);
    } else if (error.request) {
      console.error('Error Request:', error.request);
    } else {
      console.error('Error Message:', error.message);
    }
    
    return Promise.reject(error);
  }
);

export default apiClient; 