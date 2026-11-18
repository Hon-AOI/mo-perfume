const crypto = require("crypto");
const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const { loadEmailConfiguration } = require("./orderRoutes");

const localSubscriptionsPath = path.join(__dirname, "..", "data", "newsletter-subscriptions.json");

function loadLocalSubscriptions() {
    try {
        const subscriptions = JSON.parse(fs.readFileSync(localSubscriptionsPath, "utf8"));
        return new Set(Array.isArray(subscriptions) ? subscriptions : []);
    } catch (_error) {
        return new Set();
    }
}

function saveLocalSubscriptions(subscriptions) {
    fs.mkdirSync(path.dirname(localSubscriptionsPath), { recursive: true });
    fs.writeFileSync(localSubscriptionsPath, JSON.stringify([...subscriptions].sort(), null, 2), "utf8");
}

function loadMailchimpConfiguration(environment = process.env) {
    const apiKey = environment.MAILCHIMP_API_KEY;
    const audienceId = environment.MAILCHIMP_AUDIENCE_ID;
    const serverPrefix = environment.MAILCHIMP_SERVER_PREFIX;
    if (typeof apiKey !== "string" || !apiKey.trim() ||
        typeof audienceId !== "string" || !audienceId.trim() ||
        typeof serverPrefix !== "string" || !/^[a-z0-9]+$/i.test(serverPrefix.trim())) {
        return null;
    }

    return {
        apiKey: apiKey.trim(),
        audienceId: audienceId.trim(),
        serverPrefix: serverPrefix.trim().toLowerCase()
    };
}

async function subscribeToMailchimp(email, configuration, fetchImplementation = fetch) {
    const subscriberHash = crypto.createHash("md5").update(email.toLowerCase()).digest("hex");
    const url = `https://${configuration.serverPrefix}.api.mailchimp.com/3.0/lists/${encodeURIComponent(configuration.audienceId)}/members/${subscriberHash}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
        response = await fetchImplementation(url, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${configuration.apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email_address: email,
                status_if_new: "pending"
            }),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(`Mailchimp API request failed with status ${response.status}.`);
    }

    const member = await response.json();
    if (!member || typeof member.status !== "string") {
        throw new Error("Mailchimp returned an invalid subscription response.");
    }
    return member;
}

async function sendNewsletterWelcome(email, configuration) {
    const transporter = nodemailer.createTransport({
        host: configuration.host,
        port: configuration.port,
        secure: configuration.secure,
        auth: {
            user: configuration.user,
            pass: configuration.password
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
    });

    const text = [
        "Welcome to Notes from MO",
        "",
        "Thanks for signing up for Notes from MO.",
        "Please confirm your subscription using the link in the confirmation email from Mailchimp.",
        "Once confirmed, you can expect fragrance stories and thoughtful recommendations.",
        "",
        "MO Perfume"
    ].join("\n");

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Welcome to Notes from MO</title>
  </head>
  <body style="margin:0;padding:0;background:#f4efe7;font-family:Georgia,'Times New Roman',serif;color:#302d28;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe7;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fffdf9;border:1px solid #ddd3c4;">
            <tr>
              <td align="center" style="padding:28px 24px;border-bottom:1px solid #e8e0d3;">
                <div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:5px;color:#786d5d;">MO PERFUME</div>
              </td>
            </tr>
            <tr>
              <td style="padding:48px 44px 40px;text-align:center;">
                <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9a8467;">Notes from MO</div>
                <h1 style="margin:18px 0 16px;font-size:42px;line-height:1.12;font-weight:normal;color:#302d28;">Welcome to a more<br><em>beautiful scent story.</em></h1>
                <p style="margin:0 auto 28px;max-width:410px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#686057;">
                  Thank you for joining us. Please confirm your subscription using the link in the confirmation email from Mailchimp.
                </p>
                <div style="width:52px;height:1px;background:#b09a79;margin:0 auto 28px;"></div>
                <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#686057;">
                  Once confirmed, you will receive fragrance stories, thoughtful recommendations, and notes worth sharing.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px;border-top:1px solid #e8e0d3;background:#eee7dc;">
                <div style="font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:#7b725f;">With scent and care,<br><strong style="color:#4f493f;">MO Perfume</strong></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
</body>
</html>`;

    await transporter.sendMail({
        from: configuration.from,
        to: email,
        subject: "Welcome to Notes from MO",
        text,
        html
    });
}

function createNewsletterRouter({
    getEmailConfiguration = loadEmailConfiguration,
    getMailchimpConfiguration = loadMailchimpConfiguration,
    subscribe = subscribeToMailchimp,
    sendWelcomeEmail = sendNewsletterWelcome
} = {}) {
    const router = express.Router();
    const localSubscriptions = loadLocalSubscriptions();

    router.post("/", async (req, res) => {
        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            res.status(400).json({ message: "Enter a valid email address and agree to receive email updates." });
            return;
        }

        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            body.consent !== true) {
            res.status(400).json({ message: "Enter a valid email address and agree to receive email updates." });
            return;
        }

        const mailchimpConfiguration = getMailchimpConfiguration();
        if (!mailchimpConfiguration) {
            if (localSubscriptions.has(email)) {
                res.status(200).json({ message: "This email is already subscribed to Notes from MO." });
                return;
            }

            localSubscriptions.add(email);
            try {
                saveLocalSubscriptions(localSubscriptions);
            } catch (error) {
                localSubscriptions.delete(email);
                console.error("Local newsletter subscription failed:", error.message);
                res.status(503).json({ message: "Newsletter sign-up is unavailable right now. Please try again later." });
                return;
            }

            const emailConfiguration = getEmailConfiguration();
            if (!emailConfiguration) {
                res.status(201).json({
                    message: "You’re subscribed to Notes from MO!",
                    welcomeEmailSent: false
                });
                return;
            }

            try {
                await sendWelcomeEmail(email, emailConfiguration);
                res.status(201).json({
                    message: "You’re subscribed to Notes from MO! Check your inbox for a welcome email.",
                    welcomeEmailSent: true
                });
            } catch (error) {
                console.error("Newsletter welcome email failed:", error.message);
                res.status(201).json({
                    message: "You’re subscribed to Notes from MO!",
                    welcomeEmailSent: false
                });
            }
            return;
        }

        let member;
        try {
            member = await subscribe(email, mailchimpConfiguration);
        } catch (error) {
            console.error("Newsletter subscription failed:", error.message);
            res.status(502).json({ message: "We could not complete your sign-up. Please try again later." });
            return;
        }

        if (member.status === "subscribed") {
            res.status(200).json({ message: "This email is already subscribed to Notes from MO." });
            return;
        }
        if (member.status !== "pending") {
            res.status(409).json({ message: "We could not add this email. Please contact us for help." });
            return;
        }

        const emailConfiguration = getEmailConfiguration();
        if (!emailConfiguration) {
            res.status(201).json({
                message: "Your sign-up request was received. Check your inbox for Mailchimp's confirmation email to finish subscribing. A separate welcome email could not be sent.",
                welcomeEmailSent: false
            });
            return;
        }

        try {
            await sendWelcomeEmail(email, emailConfiguration);
            res.status(201).json({
                message: "Welcome to Notes from MO! We sent a welcome email. Please also confirm your subscription using the link Mailchimp emailed you.",
                welcomeEmailSent: true
            });
        } catch (error) {
            console.error("Newsletter welcome email failed:", error.message);
            res.status(201).json({
                message: "Your sign-up request was received. Check your inbox for Mailchimp's confirmation email to finish subscribing. A separate welcome email could not be sent.",
                welcomeEmailSent: false
            });
        }
    });

    return router;
}

module.exports = {
    createNewsletterRouter,
    loadMailchimpConfiguration,
    subscribeToMailchimp
};
