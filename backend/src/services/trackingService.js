/**
 * Package Tracking Service
 * Uses 17TRACK API for tracking status with fallback to carrier websites
 *
 * To enable: Add TRACK17_API_KEY to your .env file
 * Get API key at: https://www.17track.net/en/api
 * Free tier: 100 tracking numbers/month
 */

const axios = require('axios');

// 17TRACK API configuration
const TRACK17_API_BASE = 'https://api.17track.net/track/v2.2';

// Carrier detection patterns (for URL generation and 17TRACK carrier codes)
const CARRIER_PATTERNS = {
  usps: [
    /^9[2-5]\d{20}$/,           // USPS Tracking (22 digits starting with 92-95)
    /^[A-Z]{2}\d{9}US$/,        // International USPS
    /^420\d{27}$/,              // USPS with routing
  ],
  ups: [
    /^1Z[A-Z0-9]{16}$/,         // UPS
    /^T\d{10}$/,                // UPS Freight
  ],
  fedex: [
    /^\d{12,15}$/,              // FedEx Express/Ground (12-15 digits)
    /^\d{20}$/,                 // FedEx SmartPost
    /^(96|98)\d{20}$/,          // FedEx with routing
  ],
  dhl: [
    /^\d{10,11}$/,              // DHL Express
    /^[A-Z]{3}\d{7}$/,          // DHL eCommerce
  ],
};

// 17TRACK carrier codes (common ones)
const CARRIER_CODES = {
  usps: 21051,
  ups: 100002,
  fedex: 100003,
  dhl: 100001,
};

// Carrier tracking URLs (fallback when API unavailable)
const TRACKING_URLS = {
  usps: (num) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${num}`,
  ups: (num) => `https://www.ups.com/track?tracknum=${num}`,
  fedex: (num) => `https://www.fedex.com/fedextrack/?trknbr=${num}`,
  dhl: (num) => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${num}`,
  unknown: (num) => `https://www.google.com/search?q=track+package+${num}`,
};

/**
 * Detect carrier from tracking number
 */
function detectCarrier(trackingNumber) {
  if (!trackingNumber) return null;

  const cleanNumber = trackingNumber.replace(/\s+/g, '').toUpperCase();

  for (const [carrier, patterns] of Object.entries(CARRIER_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(cleanNumber)) {
        return carrier;
      }
    }
  }

  return 'unknown';
}

/**
 * Get tracking URL for a tracking number
 */
function getTrackingUrl(trackingNumber) {
  const carrier = detectCarrier(trackingNumber);
  const urlGenerator = TRACKING_URLS[carrier] || TRACKING_URLS.unknown;
  return urlGenerator(trackingNumber.replace(/\s+/g, ''));
}

/**
 * Check tracking status using 17TRACK API
 * Returns: { delivered: boolean, deliveryDate: Date|null, status: string, carrier: string }
 */
async function checkTrackingStatus(trackingNumber) {
  if (!trackingNumber) {
    return { delivered: false, deliveryDate: null, status: 'No tracking number', carrier: null };
  }

  const carrier = detectCarrier(trackingNumber);
  const cleanNumber = trackingNumber.replace(/\s+/g, '').toUpperCase();

  const apiKey = process.env.TRACK17_API_KEY;
  if (!apiKey) {
    // No API key - return manual check required with tracking URL
    return {
      delivered: false,
      deliveryDate: null,
      status: 'API not configured - check manually',
      carrier,
      trackingUrl: getTrackingUrl(trackingNumber)
    };
  }

  try {
    // First, try to get tracking info (if already registered)
    let result = await getTrackingInfo17Track(cleanNumber, apiKey);

    // If not registered, register it first then get info
    if (!result) {
      const registered = await registerTracking17Track(cleanNumber, carrier, apiKey);
      if (registered) {
        // Wait a moment for tracking data to be fetched
        await new Promise(resolve => setTimeout(resolve, 2000));
        result = await getTrackingInfo17Track(cleanNumber, apiKey);
      }
    }

    if (result) {
      return { ...result, carrier, trackingUrl: getTrackingUrl(trackingNumber) };
    }
  } catch (error) {
    console.error('17TRACK lookup failed:', error.message);
  }

  // Return unknown status if API check fails
  return {
    delivered: false,
    deliveryDate: null,
    status: 'Unable to check - verify manually',
    carrier,
    trackingUrl: getTrackingUrl(trackingNumber)
  };
}

/**
 * Register tracking number with 17TRACK
 */
async function registerTracking17Track(trackingNumber, carrier, apiKey) {
  try {
    const payload = [{
      number: trackingNumber,
      auto_detection: true
    }];

    // Add carrier code if known
    if (carrier && CARRIER_CODES[carrier]) {
      payload[0].carrier = CARRIER_CODES[carrier];
    }

    const response = await axios.post(`${TRACK17_API_BASE}/register`, payload, {
      headers: {
        '17token': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const data = response.data;

    if (data.code === 0) {
      // Check if accepted or already registered
      if (data.data?.accepted?.length > 0) {
        console.log(`17TRACK: Registered tracking number ${trackingNumber}`);
        return true;
      }
      // Check if rejected because already registered (that's ok)
      const rejected = data.data?.rejected?.[0];
      if (rejected?.error?.code === -18019901) {
        // Already registered - that's fine
        return true;
      }
    }

    console.log('17TRACK register response:', JSON.stringify(data));
    return false;
  } catch (error) {
    // Check if it's a "already registered" error
    if (error.response?.data?.data?.rejected?.[0]?.error?.code === -18019901) {
      return true;
    }
    console.error('17TRACK register error:', error.message);
    return false;
  }
}

/**
 * Get tracking info from 17TRACK
 */
async function getTrackingInfo17Track(trackingNumber, apiKey) {
  try {
    const response = await axios.post(`${TRACK17_API_BASE}/gettrackinfo`, [
      { number: trackingNumber }
    ], {
      headers: {
        '17token': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const data = response.data;

    if (data.code === 0 && data.data?.accepted?.length > 0) {
      const trackingData = data.data.accepted[0];
      const track = trackingData.track || {};
      const latestStatus = trackingData.track_info?.latest_status;
      const latestEvent = trackingData.track_info?.latest_event;
      const tracking = trackingData.track_info?.tracking || {};

      // Get delivery status from package_status or latest_status
      const packageStatus = tracking.providers?.[0]?.events?.[0]?.status;
      const isDelivered = latestStatus?.status === 'Delivered' ||
                          packageStatus === 'Delivered' ||
                          track.e === 40; // Legacy status code for delivered

      // Get events list
      const events = tracking.providers?.[0]?.events || [];
      const formattedEvents = events.slice(0, 10).map(e => ({
        datetime: e.time_utc || e.time,
        status: e.description || e.status,
        location: e.location
      }));

      // Find delivery date
      let deliveryDate = null;
      if (isDelivered) {
        const deliveryEvent = events.find(e =>
          e.status === 'Delivered' ||
          e.description?.toLowerCase().includes('delivered')
        );
        if (deliveryEvent) {
          deliveryDate = new Date(deliveryEvent.time_utc || deliveryEvent.time);
        } else if (latestEvent?.time_utc) {
          deliveryDate = new Date(latestEvent.time_utc);
        }
      }

      // Determine status text
      let status = latestStatus?.status || latestEvent?.description || 'Unknown';
      if (status === 'NotFound') {
        status = 'Tracking info not yet available';
      }

      return {
        delivered: isDelivered,
        deliveryDate,
        status,
        subStatus: latestStatus?.sub_status,
        events: formattedEvents
      };
    }

    // Not found or not registered
    return null;
  } catch (error) {
    // Check for "not registered" error
    if (error.response?.data?.data?.rejected?.[0]?.error?.code === -18019902) {
      return null; // Not registered yet
    }
    console.error('17TRACK gettrackinfo error:', error.message);
    throw error;
  }
}

/**
 * Get remaining quota from 17TRACK
 */
async function getQuota17Track() {
  const apiKey = process.env.TRACK17_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await axios.post(`${TRACK17_API_BASE}/getquota`, {}, {
      headers: {
        '17token': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.data.code === 0) {
      return response.data.data;
    }
  } catch (error) {
    console.error('17TRACK quota check error:', error.message);
  }

  return null;
}

/**
 * Check all shipped RMAs and update delivery status
 */
async function checkAllShippedRMAs(query) {
  // Get all shipped RMAs with tracking numbers
  const result = await query(`
    SELECT id, rma_number, tracking_number, shipped_at
    FROM rmas
    WHERE status = 'shipped'
      AND tracking_number IS NOT NULL
      AND tracking_number != ''
    ORDER BY shipped_at DESC
  `);

  const updates = [];

  for (const rma of result.rows) {
    try {
      const trackingStatus = await checkTrackingStatus(rma.tracking_number);

      if (trackingStatus.delivered) {
        // Update RMA to received status with delivery date
        await query(`
          UPDATE rmas
          SET status = 'received',
              received_at = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [trackingStatus.deliveryDate || new Date(), rma.id]);

        // Add history entry
        await query(`
          INSERT INTO rma_history (rma_id, user_id, action, details)
          VALUES ($1, NULL, 'status_changed', $2)
        `, [rma.id, JSON.stringify({
          from: 'shipped',
          to: 'received',
          auto_detected: true,
          tracking_status: trackingStatus.status
        })]);

        updates.push({
          rma_number: rma.rma_number,
          status: 'received',
          delivery_date: trackingStatus.deliveryDate
        });

        console.log(`RMA ${rma.rma_number} auto-updated to received`);
      }
    } catch (error) {
      console.error(`Error checking RMA ${rma.rma_number}:`, error.message);
    }

    // Small delay between API calls to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return updates;
}

module.exports = {
  detectCarrier,
  getTrackingUrl,
  checkTrackingStatus,
  checkAllShippedRMAs,
  getQuota17Track
};
