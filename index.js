import express from 'express';
import cors from 'cors';
import { URL } from 'url';

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

// Function to resolve relative URLs to absolute URLs
function resolveUrl(baseUrl, relativeUrl) {
  try {
    if (!relativeUrl) return relativeUrl;
    
    // If it's already absolute, return as-is
    if (/^https?:\/\//.test(relativeUrl)) {
      return relativeUrl;
    }
    
    // Handle protocol-relative URLs
    if (relativeUrl.startsWith('//')) {
      const baseProtocol = new URL(baseUrl).protocol;
      return baseProtocol + relativeUrl;
    }
    
    // Resolve relative URL
    return new URL(relativeUrl, baseUrl).href;
  } catch (error) {
    log('URL resolution error:', error.message);
    return relativeUrl;
  }
}

// Function to rewrite URLs in HTML content to use the proxy
function rewriteHtml(html, baseUrl, proxyBaseUrl) {
  if (!html || typeof html !== 'string') return html;
  
  // Define URL attributes that need to be rewritten
  const urlAttributes = [
    { tag: 'a', attr: 'href' },
    { tag: 'link', attr: 'href' },
    { tag: 'script', attr: 'src' },
    { tag: 'img', attr: 'src' },
    { tag: 'iframe', attr: 'src' },
    { tag: 'form', attr: 'action' },
    { tag: 'source', attr: 'src' },
    { tag: 'source', attr: 'srcset' },
    { tag: 'img', attr: 'srcset' },
    { tag: 'video', attr: 'src' },
    { tag: 'audio', attr: 'src' },
    { tag: 'object', attr: 'data' },
    { tag: 'embed', attr: 'src' }
  ];
  
  let rewrittenHtml = html;
  
  // Rewrite each type of URL attribute
  urlAttributes.forEach(({ tag, attr }) => {
    const regex = new RegExp(`(<${tag}[^>]*\\s${attr}\\s*=\\s*["'])([^"']+)(["'][^>]*>)`, 'gi');
    
    rewrittenHtml = rewrittenHtml.replace(regex, (match, prefix, url, suffix) => {
      try {
        // Skip if it's already a proxy URL
        if (url.includes('/proxy?url=')) {
          return match;
        }
        
        // Skip javascript:, mailto:, tel:, data:, blob: URLs
        if (/^(javascript:|mailto:|tel:|data:|blob:|#)/.test(url)) {
          return match;
        }
        
        // Resolve to absolute URL
        const absoluteUrl = resolveUrl(baseUrl, url);
        
        // Create proxy URL
        const proxyUrl = `${proxyBaseUrl}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
        
        return `${prefix}${proxyUrl}${suffix}`;
      } catch (error) {
        log('URL rewrite error:', error.message);
        return match;
      }
    });
  });
  
  // Handle CSS url() references
  rewrittenHtml = rewrittenHtml.replace(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi, (match, url) => {
    try {
      if (url.includes('/proxy?url=') || /^(data:|blob:|#)/.test(url)) {
        return match;
      }
      
      const absoluteUrl = resolveUrl(baseUrl, url);
      const proxyUrl = `${proxyBaseUrl}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      return `url("${proxyUrl}")`;
    } catch (error) {
      log('CSS URL rewrite error:', error.message);
      return match;
    }
  });
  
  // Handle meta refresh redirects
  rewrittenHtml = rewrittenHtml.replace(
    /<meta\s+http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["'](\d+);\s*url=([^"']+)["']/gi,
    (match, delay, url) => {
      try {
        const absoluteUrl = resolveUrl(baseUrl, url);
        const proxyUrl = `${proxyBaseUrl}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
        return match.replace(url, proxyUrl);
      } catch (error) {
        log('Meta refresh rewrite error:', error.message);
        return match;
      }
    }
  );
  
  // Inject base tag to help with relative URLs
  const baseTag = `<base href="${baseUrl}">`;
  if (!rewrittenHtml.includes('<base')) {
    rewrittenHtml = rewrittenHtml.replace('<head>', `<head>\n${baseTag}`);
  }
  
  return rewrittenHtml;
}

// Function to rewrite CSS content
function rewriteCss(css, baseUrl, proxyBaseUrl) {
  if (!css || typeof css !== 'string') return css;
  
  // Rewrite url() references in CSS
  return css.replace(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi, (match, url) => {
    try {
      if (url.includes('/proxy?url=') || /^(data:|blob:|#)/.test(url)) {
        return match;
      }
      
      const absoluteUrl = resolveUrl(baseUrl, url);
      const proxyUrl = `${proxyBaseUrl}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      return `url("${proxyUrl}")`;
    } catch (error) {
      log('CSS URL rewrite error:', error.message);
      return match;
    }
  });
}

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Serve a simple proxy interface
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CORS Proxy</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        input[type="url"] { width: 100%; padding: 10px; font-size: 16px; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; cursor: pointer; }
        button:hover { background: #0056b3; }
      </style>
    </head>
    <body>
      <h1>adarun</h1>
      <form method="get" action="/proxy">
        <div class="form-group">
          <label for="url">Enter URL to proxy:</label>
          <input type="url" name="url" id="url" placeholder="https://example.com" required>
        </div>
        <button type="submit">Visit Site</button>
      </form>
    </body>
    </html>
  `);
});
// Serve a simple proxy interface
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CORS Proxy</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
        h1 { margin-bottom: 10px; }
        form { display: flex; gap: 10px; margin-bottom: 20px; }
        input[type="url"] { flex: 1; padding: 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 6px; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; }
        button:hover { background: #0056b3; }
        iframe { width: 100%; height: 80vh; border: 1px solid #ccc; border-radius: 6px; }
      </style>
    </head>
    <body>
      <h1>CORS Proxy</h1>
      <form id="proxyForm">
        <input type="url" id="urlInput" placeholder="https://example.com" required>
        <button type="submit">Go</button>
      </form>
      <iframe id="proxyFrame" src="" title="Proxied site"></iframe>

      <script>
        const form = document.getElementById('proxyForm');
        const input = document.getElementById('urlInput');
        const frame = document.getElementById('proxyFrame');

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const url = encodeURIComponent(input.value);
          frame.src = '/proxy?url=' + url;
        });
      </script>
    </body>
    </html>
  `);
});

// Main proxy endpoint
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  
  try {
    log('Proxying request to:', targetUrl);
    
    // Build proxy base URL
    const proxyBaseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Prepare headers
    const requestHeaders = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (compatible; CORS-Proxy/1.0)',
      'Accept': req.headers.accept || '*/*',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };
    
    // Forward some original headers if present
    const headersToForward = [
      'referer',
      'cookie',
      'authorization',
      'x-requested-with'
    ];
    
    headersToForward.forEach(header => {
      if (req.headers[header]) {
        requestHeaders[header] = req.headers[header];
      }
    });
    
    // Make the request
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: requestHeaders,
      redirect: 'follow'
    });
    
    // Set response status
    res.status(response.status);
    
    // Get content type
    const contentType = response.headers.get('content-type') || '';
    
    // Copy relevant headers
    const headersToForward2 = [
      'content-type',
      'cache-control',
      'expires',
      'last-modified',
      'etag',
      'set-cookie'
    ];
    
    headersToForward2.forEach(header => {
      const value = response.headers.get(header);
      if (value && header !== 'content-length') { // Don't forward content-length as it may change
        res.set(header, value);
      }
    });
    
    // Handle different content types
    if (contentType.includes('text/html')) {
      // HTML content - rewrite URLs
      const html = await response.text();
      const rewrittenHtml = rewriteHtml(html, targetUrl, proxyBaseUrl);
      res.send(rewrittenHtml);
    } else if (contentType.includes('text/css')) {
      // CSS content - rewrite URLs
      const css = await response.text();
      const rewrittenCss = rewriteCss(css, targetUrl, proxyBaseUrl);
      res.send(rewrittenCss);
    } else if (contentType.includes('application/javascript') || contentType.includes('text/javascript')) {
      // JavaScript content - pass through (could add URL rewriting here too)
      const js = await response.text();
      res.send(js);
    } else if (contentType.includes('application/json') || contentType.includes('application/xml') || contentType.includes('text/')) {
      // Other text-based content
      const text = await response.text();
      res.send(text);
    } else {
      // Binary content (images, videos, etc.)
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    }
    
    log('Successfully proxied response, status:', response.status, 'type:', contentType);
    
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
  const { url, method = 'POST', headers = {}, body } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url in request body' });
  }
  
  try {
    log(`Proxying ${method} request to:`, url);
    
    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (compatible; CORS-Proxy/1.0)',
      'Content-Type': 'application/json',
      ...headers
    };
    
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined
    });
    
    res.status(response.status);
    
    // Copy headers (excluding CORS headers)
    response.headers.forEach((value, name) => {
      if (!name.toLowerCase().startsWith('access-control-') && name.toLowerCase() !== 'content-length') {
        res.set(name, value);
      }
    });
    
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json') || contentType.includes('text/')) {
      const text = await response.text();
      res.send(text);
    } else {
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

// Handle all other HTTP methods
app.all('/proxy', async (req, res) => {
  const targetUrl = req.query.url || req.body.url;
  const method = req.method;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  
  try {
    log(`Proxying ${method} request to:`, targetUrl);
    
    const requestHeaders = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (compatible; CORS-Proxy/1.0)',
      ...req.headers
    };
    
    // Remove headers that shouldn't be forwarded
    delete requestHeaders.host;
    delete requestHeaders.connection;
    delete requestHeaders.origin;
    
    const response = await fetch(targetUrl, {
      method,
      headers: requestHeaders,
      body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify(req.body)
    });
    
    res.status(response.status);
    
    // Copy relevant headers
    response.headers.forEach((value, name) => {
      if (!name.toLowerCase().startsWith('access-control-') && name.toLowerCase() !== 'content-length') {
        res.set(name, value);
      }
    });
    
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
    
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
  log('Web interface available at: http://localhost:' + PORT);
  log('Full site proxying enabled with URL rewriting');
});
