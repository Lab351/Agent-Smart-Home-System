/**
 * Cloudflare Worker — GitHub push → Notify Webhook
 *
 * Receives GitHub repository push webhook events and forwards a
 * reformatted notification payload to the configured target webhook.
 *
 * Required secrets (set via `wrangler secret put`):
 *   NOTIFY_WEBHOOK_URL     — target webhook endpoint to POST notifications to
 *
 * Optional secrets:
 *   GITHUB_WEBHOOK_SECRET  — if set, all incoming requests are verified against
 *                            the X-Hub-Signature-256 header sent by GitHub
 */

export default {
  /**
   * @param {Request} request
   * @param {{ NOTIFY_WEBHOOK_URL: string, GITHUB_WEBHOOK_SECRET?: string }} env
   */
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await request.text();

    // Verify HMAC-SHA256 signature when a secret is configured
    if (env.GITHUB_WEBHOOK_SECRET) {
      const signature = request.headers.get("X-Hub-Signature-256");
      if (!signature) {
        return new Response("Missing signature", { status: 401 });
      }
      const valid = await verifySignature(
        body,
        signature,
        env.GITHUB_WEBHOOK_SECRET
      );
      if (!valid) {
        return new Response("Invalid signature", { status: 401 });
      }
    }

    // Ignore non-push events (e.g. the initial "ping")
    const event = request.headers.get("X-GitHub-Event");
    if (event === "ping") {
      return new Response("pong", { status: 200 });
    }
    if (event !== "push") {
      return new Response("Ignored event type", { status: 200 });
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const branch = (payload.ref ?? "").replace("refs/heads/", "");
    const commit = payload.head_commit ?? {};
    const commitMessage = commit.message ?? "";
    const author = commit.author?.name ?? "";
    const commitUrl =
      commit.url ??
      `${payload.repository?.html_url ?? ""}/commit/${commit.id ?? ""}`;

    if (!env.NOTIFY_WEBHOOK_URL) {
      console.error("NOTIFY_WEBHOOK_URL is not configured");
      return new Response("Webhook target not configured", { status: 500 });
    }

    const notifyPayload = {
      msg_type: "text",
      content: {
        summary: commitMessage,
        author: author,
        branch: branch,
        commit_url: commitUrl,
        commit_message: commitMessage,
      },
    };

    const resp = await fetch(env.NOTIFY_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notifyPayload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Webhook delivery failed: ${resp.status} ${text}`);
      return new Response("Upstream webhook delivery failed", { status: 502 });
    }

    return new Response("OK", { status: 200 });
  },
};

/**
 * Verify the GitHub HMAC-SHA256 webhook signature.
 *
 * @param {string} body       - Raw request body string
 * @param {string} signature  - Value of the X-Hub-Signature-256 header
 * @param {string} secret     - Webhook secret configured in GitHub
 * @returns {Promise<boolean>}
 */
async function verifySignature(body, signature, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected =
    "sha256=" +
    Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
