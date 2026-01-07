const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');
const path = require('path');

const router = express.Router();

// Verify GitHub webhook signature
function verifySignature(payload, signature, secret) {
  if (!secret) return true; // Skip verification if no secret configured
  if (!signature) return false;

  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// GitHub webhook endpoint
router.post('/github', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  const secret = process.env.WEBHOOK_SECRET;

  // Verify signature if secret is configured
  if (secret && !verifySignature(req.body, signature, secret)) {
    console.log('Webhook signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Only deploy on push to main branch
  if (event === 'push') {
    let payload;
    try {
      payload = JSON.parse(req.body);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    if (payload.ref === 'refs/heads/main') {
      console.log('Received push to main, starting deployment...');

      // Respond immediately
      res.json({ message: 'Deployment started' });

      // Run deploy script asynchronously
      const deployScript = path.join(__dirname, '../../../deploy.sh');
      exec(`bash ${deployScript}`, (error, stdout, stderr) => {
        if (error) {
          console.error('Deployment failed:', error);
          console.error('stderr:', stderr);
          return;
        }
        console.log('Deployment output:', stdout);
      });
    } else {
      res.json({ message: 'Ignored - not main branch' });
    }
  } else if (event === 'ping') {
    console.log('GitHub webhook ping received');
    res.json({ message: 'Pong!' });
  } else {
    res.json({ message: `Ignored event: ${event}` });
  }
});

// Manual deploy endpoint (protected)
router.post('/deploy', (req, res) => {
  const deployKey = req.headers['x-deploy-key'];

  if (deployKey !== process.env.DEPLOY_KEY) {
    return res.status(401).json({ error: 'Invalid deploy key' });
  }

  console.log('Manual deployment triggered...');
  res.json({ message: 'Deployment started' });

  const deployScript = path.join(__dirname, '../../../deploy.sh');
  exec(`bash ${deployScript}`, (error, stdout, stderr) => {
    if (error) {
      console.error('Deployment failed:', error);
      return;
    }
    console.log('Deployment output:', stdout);
  });
});

module.exports = router;
