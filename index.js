require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors()); // Allow requests from frontend
app.use(bodyParser.json());

const usersSession = {}; // Track user sessions

// Menu Items
const MENU_ITEMS = {
    1: { name: "Pani Puri", price: 20 },
    2: { name: "Bhel Puri", price: 30 },
    3: { name: "Sev Puri", price: 25 },
    4: { name: "Dahi Puri", price: 35 }
};

// WhatsApp API URL
const WHATSAPP_URL = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;

// Function to send a message via WhatsApp API
async function sendMessage(to, message) {
    try {
        await axios.post(WHATSAPP_URL, {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: message }
        }, {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                "Content-Type": "application/json"
            }
        });
    } catch (error) {
        console.error("Error sending message:", error.response?.data || error.message);
    }
}

// Generate Menu Message
function getMenuMessage() {
    let menuMessage = "🍽️ *Menu:*\n";
    for (let id in MENU_ITEMS) {
        menuMessage += `*${id}*. ${MENU_ITEMS[id].name} - ₹${MENU_ITEMS[id].price}\n`;
    }
    menuMessage += "\n🛒 To order, type: <index> <quantity> (e.g., *1 2* for 2 Pani Puris)\n\n✅ Type *done* to confirm order.";
    return menuMessage;
}

// WhatsApp Webhook Verification
app.get('/webhook', (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
        res.send(req.query["hub.challenge"]);
    } else {
        res.send("Verification failed");
    }
});

// Handle Incoming WhatsApp Messages
app.post('/webhook', async (req, res) => {
    const messageData = req.body;

    if (messageData.object) {
        const messages = messageData.entry?.[0]?.changes?.[0]?.value?.messages;
        if (messages) {
            for (const message of messages) {
                const from = message.from;
                const text = message.text?.body?.toLowerCase().trim();

                if (!usersSession[from]) {
                    usersSession[from] = { stage: "greeting", order: [] };
                    await sendMessage(from, "🌟 *Welcome to Puchka Das!* 🌟\n\n🍽️ Type *menu* to see our delicious items.");
                    continue;
                }

                if (text === "menu") {
                    usersSession[from].stage = "ordering";
                    await sendMessage(from, getMenuMessage());
                    continue;
                }

                if (usersSession[from].stage === "ordering") {
                    const orderMatch = text.match(/^(\d+)\s+(\d+)$/);

                    if (orderMatch) {
                        const index = parseInt(orderMatch[1]);
                        const quantity = parseInt(orderMatch[2]);

                        if (MENU_ITEMS[index]) {
                            usersSession[from].order.push({ item: MENU_ITEMS[index], quantity });
                            await sendMessage(from, `✅ *${quantity}x ${MENU_ITEMS[index].name}* added to cart.\n\n🛍️ Type *done* to confirm.`);
                        } else {
                            await sendMessage(from, "❌ Invalid item number. Type *menu* to see items.");
                        }
                    } else if (text === "done") {
                        if (usersSession[from].order.length === 0) {
                            await sendMessage(from, "🛒 Your cart is empty!");
                            continue;
                        }

                        let totalAmount = 0;
                        let orderSummary = "🛒 *Order Summary:*\n";
                        usersSession[from].order.forEach(order => {
                            orderSummary += `- ${order.quantity}x ${order.item.name} - ₹${order.item.price * order.quantity}\n`;
                            totalAmount += order.item.price * order.quantity;
                        });
                        orderSummary += `\n💰 *Total: ₹${totalAmount}*\n\n🎉 Thank you for ordering! 🎊`;

                        await sendMessage(from, orderSummary);
                        delete usersSession[from]; // Reset session
                    }
                    continue;
                }

                await sendMessage(from, "🤖 I didn't understand. Type *menu* to see options.");
            }
        }
    }
    res.sendStatus(200);
});

// **Route to Receive Orders from Frontend**
app.post('/send-order', async (req, res) => {
    const { phoneNumber, order } = req.body;

    if (!phoneNumber || order.length === 0) {
        return res.status(400).json({ error: "Invalid order data" });
    }

    let orderText = order.map(item => `${item.name} - ₹${item.price}`).join("\n");
    let message = `🌟 Order from Puchka Das:\n${orderText}\nTotal: ₹${order.reduce((total, item) => total + item.price, 0)}`;

    try {
        await sendMessage(phoneNumber, message);
        res.json({ success: true, message: "Order sent successfully!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to send WhatsApp message" });
    }
});

// Start Server on Port 3001
app.listen(3001, () => console.log("🚀 WhatsApp bot running on port 3001"));
