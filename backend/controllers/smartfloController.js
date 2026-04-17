const axios = require('axios');
const { User } = require('../models');

// @desc    Initiate a click-to-call request via Smartflo API
// @route   POST /api/click-to-call
// @access  Private
exports.initiateCall = async (req, res) => {
  try {
    const { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Both "from" (agent) and "to" (customer) numbers are required.'
      });
    }

    // Phone formatter
    const validatePhone = (num) => {
      if (!num) return null;

      let clean = num.toString().replace(/\D/g, "");

      if (clean.length === 10) {
        clean = "91" + clean;
      }

      if (clean.length === 12 && clean.startsWith("91")) {
        return clean;
      }

      return null;
    };

    const cleanFrom = validatePhone(from);
    const cleanTo = validatePhone(to);

    if (!cleanFrom) {
      return res.status(400).json({
        success: false,
        message: "Invalid agent number format"
      });
    }

    if (!cleanTo) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer number format"
      });
    }

    const userRow = await User.findByPk(req.user.id, { attributes: ['id', 'token', 'phone'] });
    const userToken = String(userRow?.token || '').trim();
    const apiKey = userToken;

    if (!apiKey) {
      console.error("Smartflo API key missing (user.token and SMARTFLO_API_KEY both empty)");
      return res.status(500).json({
        success: false,
        message: "Smartflo API key not configured"
      });
    } 

    

    const callerId =  validatePhone(userRow?.phone) || cleanFrom;

    const payload1 = {
      "async": 1,        
      "customer_number": cleanTo.length === 12 && cleanTo.startsWith("91") ? cleanTo.substring(2) : cleanTo, // Match Postman: 10 digits
      "customer_ring_timeout": 30,
      "caller_id": callerId,          // Match Postman: 12 digits
      "api_key": apiKey
    };
    console.log("Payload:", { ...payload1, api_key: '[redacted]' });
    const response = await axios.post(
      "https://api-smartflo.tatateleservices.com/v1/click_to_call_support",
      payload1,
      {
        headers: {
          "accept": "application/json",
          "Content-Type": "application/json"
          // NO Authorization header needed
        },
        timeout: 15000
      }
    );

    
    console.log("========== SMARTFLO RESPONSE ==========");
    console.log(response.data);

    return res.status(200).json({
      success: true,
      message: "Call initiated successfully",
      data: response.data
    });

  } catch (error) {

    console.error("========== SMARTFLO ERROR ==========");

    if (error.response) {
      console.error(error.response.status);
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }

    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Click-to-Call failed",
      error: error.response?.data || error.message
    });
  }
};

// @desc    Webhook for Smartflo call status events
// @route   POST /api/smartflo-webhook
// @access  Public (or protected by signature if supported)
exports.handleWebhook = async (req, res) => {
  try {
    const eventData = req.body;

    // Log the event
    console.log('Smartflo Webhook Event:', JSON.stringify(eventData, null, 2));

    // Here you would typically update the call status in your database
    // e.g., finding the call record by ID and updating status to 'connected', 'completed', etc.

    res.status(200).json({ message: 'Webhook received successfully' });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ message: 'Error processing webhook' });
  }
};
