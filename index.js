import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS for all routes
app.use(cors({
  origin: true,
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// Simple logging
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Main proxy endpoint
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    log('Proxying request to:', targetUrl);
    
    // Make the request
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CORS-Proxy/1.0)',
        'Accept': req.headers.accept || '*/*'
      }
    });

    // Set response status
    res.status(response.status);
    
    // Copy relevant headers
    const headersToForward = [
      'content-type',
      'content-length',
      'cache-control',
      'expires',
      'last-modified',
      'etag'
    ];
    
    headersToForward.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        res.set(header, value);
      }
    });

    // Get the response body as text/buffer and send it
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/') || contentType.includes('application/json') || contentType.includes('application/xml')) {
      // Handle text-based content
      const text = await response.text();
      res.send(text);
    } else {
      // Handle binary content
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    }

    log('Successfully proxied response, status:', response.status);
    
  } catch (error) {
    log('Proxy error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch from target URL',
      details: error.message 
    });
  }
});

// POST proxy for other HTTP methods
app.post('/proxy', async (req, res) => {
  const { url, method = 'GET', headers = {} } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url in request body' });
  }

  try {
    log(`Proxying ${method} request to:`, url);
    
    const response = await fetch(url, {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CORS-Proxy/1.0)',
        ...headers
      },
      body: req.body.body ? JSON.stringify(req.body.body) : undefined
    });

    res.status(response.status);
    
    // Copy headers
    response.headers.forEach((value, name) => {
      if (!name.toLowerCase().startsWith('access-control-')) {
        res.set(name, value);
      }
    });

    const text = await response.text();
    res.send(text);
    
    log('Successfully proxied response, status:', response.status);
    
  } catch (error) {
    log('Proxy error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch from target URL',
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  log(`CORS Proxy server running on port ${PORT}`);
  log('Usage: GET /proxy?url=<encoded-url>');
  log('Auth: Disabled');
});
