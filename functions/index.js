const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const nodemailer = require("nodemailer");

initializeApp();

const db = getFirestore();
const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const EMAIL_FROM = defineSecret("EMAIL_FROM");

const REGION = "asia-southeast1";
const DAILY_EMAIL_LIMIT = 5;
const CONTINUE_URL =
  "https://inyangchisom-boop.github.io/Somerion-Operations-Intelligence/";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

/**
 * Reserves one message before contacting a provider.
 * The Firestore transaction makes concurrent requests count atomically.
 * Failed provider attempts are still counted, which fails safely against abuse.
 * A new quota window begins at 00:00 UTC.
 */
async function reserveDailyQuota(uid, channel, limit) {
  const date = new Date().toISOString().slice(0, 10);
  const ref = db.collection("messageUsage")
    .doc(uid)
    .collection("daily")
    .doc(date + "_" + channel);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const used = snapshot.exists ? Number(snapshot.data().count || 0) : 0;

    if (used >= limit) {
      throw new HttpsError(
        "resource-exhausted",
        "Daily " + channel + " limit reached. Try again after 00:00 UTC."
      );
    }

    transaction.set(ref, {
      channel,
      dateUtc: date,
      count: used + 1,
      limit,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

function mailTransport() {
  const port = Number(SMTP_PORT.value());
  if (!SMTP_HOST.value() || !SMTP_USER.value() || !SMTP_PASS.value() ||
      !EMAIL_FROM.value() || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HttpsError(
      "failed-precondition",
      "Email delivery is not configured by the project administrator."
    );
  }

  return nodemailer.createTransport({
    host: SMTP_HOST.value(),
    port,
    secure: port === 465,
    auth: {
      user: SMTP_USER.value(),
      pass: SMTP_PASS.value()
    }
  });
}

async function deliverAuthEmail(email, action, link) {
  const isReset = action === "password-reset";
  const subject = isReset
    ? "Reset your Somerion password"
    : "Verify your Somerion email address";
  const instruction = isReset
    ? "Use the link below to reset your password."
    : "Use the link below to verify your email address.";
  const safeLink = escapeHtml(link);

  await mailTransport().sendMail({
    from: EMAIL_FROM.value(),
    to: email,
    subject,
    text: instruction + "\n\n" + link +
      "\n\nIf you did not request this, you can ignore this email.",
    html: "<p>" + instruction + "</p><p><a href=\"" + safeLink +
      "\">Continue</a></p><p>If you did not request this, you can ignore this email.</p>"
  });
}

/**
 * Authenticated email verification and password-reset sender.
 * Reset requests intentionally return the same response for unknown addresses.
 */
exports.sendAuthEmail = onCall({
  region: REGION,
  secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM],
  maxInstances: 5
}, async (request) => {
  const action = request.data && request.data.action;

  if (action === "verify") {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before requesting verification.");
    }

    const user = await getAuth().getUser(request.auth.uid);
    if (!user.email) {
      throw new HttpsError("failed-precondition", "This account has no email address.");
    }
    if (user.emailVerified) {
      return { ok: true, message: "Email address is already verified." };
    }

    await reserveDailyQuota(user.uid, "email", DAILY_EMAIL_LIMIT);
    const link = await getAuth().generateEmailVerificationLink(user.email, {
      url: CONTINUE_URL,
      handleCodeInApp: false
    });
    await deliverAuthEmail(user.email, "verify", link);
    return { ok: true, message: "Verification email sent." };
  }

  if (action === "password-reset") {
    const email = typeof request.data.email === "string"
      ? request.data.email.trim().toLowerCase()
      : "";

    if (!email || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "Enter a valid email address.");
    }

    let user;
    try {
      user = await getAuth().getUserByEmail(email);
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        return { ok: true, message: "If the account exists, a reset email will be sent." };
      }
      throw error;
    }

    await reserveDailyQuota(user.uid, "email", DAILY_EMAIL_LIMIT);
    const link = await getAuth().generatePasswordResetLink(user.email, {
      url: CONTINUE_URL,
      handleCodeInApp: false
    });
    await deliverAuthEmail(user.email, "password-reset", link);
    return { ok: true, message: "If the account exists, a reset email will be sent." };
  }

  throw new HttpsError("invalid-argument", "Unsupported email action.");
});

/*
 * SMS quota is intentionally not exposed as a send endpoint yet.
 * The app currently has no SMS feature or provider account. When an SMS use
 * case and provider are selected, route every SMS through a server function
 * that calls reserveDailyQuota(uid, "sms", 5) before sending.
 */
