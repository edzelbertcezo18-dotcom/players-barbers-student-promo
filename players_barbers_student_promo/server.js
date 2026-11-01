
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const CONFIG = {
  business: 'PLAYERS BARBERS',
  location: '2nd floor, MAGIC MALL ANNEX URDANETA, PANGASINAN',
  facebook: 'https://www.facebook.com/p/Players-Barbers-Magic-Mall-Urdaneta-City-61589989845447/',
  price: '₱150',
  reward: 'FREE HAIRCUT after completing the required stamps',
  stamps: 5,
  schools: [
    'Urdaneta City University',
    'Pangasinan State University',
    'University of Eastern Pangasinan',
    'University of Pangasinan',
    'Lyceum-Northwestern University',
    'Urdaneta City National High School',
    'International Colleges for Excellence',
    'Others'
  ]
};

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error('Supabase environment variables are missing.');
  }

  return {
    url: supabaseUrl.replace(/\/+$/, ''),
    key: secretKey
  };
}

async function supabaseRequest(endpoint, options = {}) {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.hint ||
      `Supabase request failed (${response.status})`;

    throw new Error(message);
  }

  return data;
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;

      if (body.length > 10000) {
        reject(new Error('Request too large.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    });

    req.on('error', reject);
  });
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function serve(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;

  let file = path.resolve(PUBLIC_DIR, '.' + rel);

  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    return json(res, 403, { error: 'Forbidden' });
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      return json(res, 404, { error: 'Not found' });
    }

    const ext = path.extname(file).toLowerCase();

    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg'
    };

    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream'
    });

    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET' && u.pathname === '/api/config') {
      return json(res, 200, CONFIG);
    }

    // Generate a permanent code in Supabase.
    if (req.method === 'POST' && u.pathname === '/api/generate-code') {
      const body = await readBody(req);

      if (!CONFIG.schools.includes(body.school)) {
        return json(res, 400, {
          error: 'Please select a valid school.'
        });
      }

      let record = null;

      // Retry if a randomly generated code already exists.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode();

        try {
          const inserted = await supabaseRequest('promo_codes', {
            method: 'POST',
            headers: {
              Prefer: 'return=representation'
            },
            body: JSON.stringify({
              code,
              school: body.school,
              status: 'unused'
            })
          });

          record = inserted?.[0];
          if (record) break;
        } catch (error) {
          // PostgreSQL unique violation: generate another code.
          if (!String(error.message).includes('duplicate key')) {
            throw error;
          }
        }
      }

      if (!record) {
        throw new Error('Could not generate a unique promo code.');
      }

      return json(res, 200, {
        code: record.code,
        school: record.school
      });
    }

    // Check a code. No expiration date is applied.
    if (req.method === 'POST' && u.pathname === '/api/check-code') {
      const body = await readBody(req);
      const code = String(body.code || '').trim().toUpperCase();

      if (!code) {
        return json(res, 400, {
          valid: false,
          error: 'Enter a promo code.'
        });
      }

      const records = await supabaseRequest(
        `promo_codes?code=eq.${encodeURIComponent(code)}&select=code,school,status,created_at,used_at&limit=1`
      );

      const record = records?.[0];

      if (!record) {
        return json(res, 200, {
          valid: false,
          status: 'invalid',
          message: 'INVALID CODE — No matching promo code found.'
        });
      }

      if (record.status === 'used') {
        return json(res, 200, {
          valid: false,
          status: 'used',
          school: record.school,
          usedAt: record.used_at,
          message: 'CODE ALREADY USED'
        });
      }

      return json(res, 200, {
        valid: true,
        status: 'unused',
        school: record.school,
        createdAt: record.created_at,
        message: 'VALID CODE — Confirm the student ID and Facebook follow with the customer.'
      });
    }

    // Mark a code as used only once.
    if (req.method === 'POST' && u.pathname === '/api/use-code') {
      const body = await readBody(req);
      const code = String(body.code || '').trim().toUpperCase();

      if (!code) {
        return json(res, 400, {
          success: false,
          message: 'Enter a promo code.'
        });
      }

      const updated = await supabaseRequest(
        `promo_codes?code=eq.${encodeURIComponent(code)}&status=eq.unused`,
        {
          method: 'PATCH',
          headers: {
            Prefer: 'return=representation'
          },
          body: JSON.stringify({
            status: 'used',
            used_at: new Date().toISOString()
          })
        }
      );

      if (updated?.length) {
        return json(res, 200, {
          success: true,
          school: updated[0].school,
          message: 'Code confirmed and marked as USED.'
        });
      }

      const existing = await supabaseRequest(
        `promo_codes?code=eq.${encodeURIComponent(code)}&select=code,status,school&limit=1`
      );

      if (!existing?.length) {
        return json(res, 404, {
          success: false,
          message: 'Invalid code.'
        });
      }

      return json(res, 409, {
        success: false,
        message: 'This code has already been used.'
      });
    }

    if (req.method === 'GET') {
      return serve(req, res, u.pathname);
    }

    return json(res, 405, {
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('Server error:', error.message);

    return json(res, 500, {
      error: 'A server error occurred. Please try again.'
    });
  }

}).listen(PORT, '0.0.0.0', () => {
  console.log(`PLAYERS BARBERS site running on port ${PORT}`);
});
