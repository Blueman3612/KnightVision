import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

// The EC2 URL is defined here to be easily updated
const EC2_URL = 'http://ec2-52-90-110-169.compute-1.amazonaws.com';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get the path from the URL
  const { path } = req.query;
  
  if (!path || !Array.isArray(path)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  
  // Construct the target URL
  const targetUrl = `${EC2_URL}/${path.join('/')}`;
  
  try {
    console.log(`🔄 Proxying ${req.method} request to: ${targetUrl}`);
    console.log(`Request body:`, req.body);
    
    // Forward the request to the EC2 instance with the same HTTP method
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        // Forward authorization headers if they exist
        ...(req.headers.authorization && { 
          'Authorization': req.headers.authorization 
        }),
      },
    });
    
    // Return the response from the EC2 instance
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('❌ Proxy error:', error);
    
    // Handle errors
    if (axios.isAxiosError(error) && error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Configure API endpoint to accept all HTTP methods
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    externalResolver: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  },
} 