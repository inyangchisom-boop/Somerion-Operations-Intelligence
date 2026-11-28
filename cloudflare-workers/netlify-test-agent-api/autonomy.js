const ACTIONS = new Set(["create_task", "update_task_status", "create_content_draft"]);
const CHANNELS = new Set(["instagram", "facebook", "tiktok", "linkedin", "email", "other"]);
const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  paused: true,
  allowed_actions: [],
  daily_action_limit: 10
});

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
const nowIso = () => new Date().toISOString();
const validText = (value, max, required = false) =>
  typeof value === "string" && value.length <= max && (!required || value.trim().length > 0);

export function parseAutonomySettings(row) {
  if (!row) return { ...DEFAULT_SETTINGS };
  let allowed = [];
  try { allowed = JSON.parse(row.allowed_actions || "[]"); } catch { allowed = []; }
  return {
    enabled: row.enabled === 1,
    paused: row.paused !== 0,
    allowed_actions: Array.isArray(allowed) ? allowed.filter(x => ACTIONS.has(x)) : [],
    daily_action_limit: Number.isInteger(row.daily_action_limit) ? Math.min(50, Math.max(1, row.daily_action_limit)) : 10
  };
}

export function validateAutonomySettings(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Settings must be an object." };
  if (typeof body.enabled !== "boolean" || typeof body.paused !== "boolean") return { error: "enabled and paused must be true or false." };
  if (!Array.isArray(body.allowed_actions) || body.allowed_actions.some(x => typeof x !== "string" || !ACTIONS.has(x)) || new Set(body.allowed_actions).size !== body.allowed_actions.length) {
    return { error: "allowed_actions contains an unsupported or duplicate action." };
  }
  if (!Number.isInteger(body.daily_action_limit) || body.daily_action_limit < 1 || body.daily_action_limit > 50) {
    return { error: "daily_action_limit must be an integer from 1 to 50." };
  }
  return { value: { enabled: body.enabled, paused: body.paused, allowed_actions: body.allowed_actions, daily_action_limit: body.daily_action_limit } };
}

export function validateAutonomyAction(actionType, payload) {
  if (!ACTIONS.has(actionType)) return { error: "This action is not supported by the isolated autonomy engine." };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { error: "Action payload must be an object." };
  if (actionType === "create_task") {
    if (!validText(payload.title, 160, true) || !validText(payload.details ?? "", 2000)) return { error: "Task title or details are invalid." };
    if (payload.due_at != null && (typeof payload.due_at !== "string" || !Number.isFinite(Date.parse(payload.due_at)))) return { error: "Task due_at must be a valid date or null." };
    return { value: { title: payload.title.trim(), details: (payload.details || "").trim(), due_at: payload.due_at ? new Date(payload.due_at).toISOString() : null } };
  }
  if (actionType === "update_task_status") {
    if (!validText(payload.task_id, 64, true) || !["open", "in_progress", "done"].includes(payload.status)) return { error: "A valid task_id and status are required." };
    return { value: { task_id: payload.task_id, status: payload.status } };
  }
  if (!CHANNELS.has(payload.channel) || !validText(payload.title, 160, true) || !validText(payload.body, 5000, true)) {
    return { error: "Content draft requires a supported channel, title, and body (up to 5,000 characters)." };
  }
  return { value: { channel: payload.channel, title: payload.title.trim(), body: payload.body.trim() } };
}

async function settingsFor(env, uid) {
  const row = await env.DB.prepare("SELECT enabled,paused,allowed_actions,daily_action_limit FROM agent_autonomy_settings WHERE uid=?").bind(uid).first();
  return parseAutonomySettings(row);
}

async function reserveDailySlot(env, uid, limit) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare("INSERT INTO agent_autonomy_daily_usage(uid,day,action_count) VALUES(?,?,1) ON CONFLICT(uid,day) DO UPDATE SET action_count=action_count+1 WHERE action_count<? RETURNING action_count")
    .bind(uid, day, limit).first();
  return !!row;
}

async function audit(env, uid, proposalId, actionType, decision, reason) {
  await env.DB.prepare("INSERT INTO agent_action_audit(id,uid,proposal_id,action_type,decision,reason,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), uid, proposalId, actionType, decision, reason, nowIso()).run();
}

async function executeInternalAction(env, uid, proposal) {
  const payload = JSON.parse(proposal.payload_json);
  const now = nowIso();
  if (proposal.action_type === "create_task") {
    const taskId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO agent_tasks(id,uid,title,details,status,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
        .bind(taskId, uid, payload.title, payload.details, "open", payload.due_at, now, now),
      env.DB.prepare("UPDATE agent_action_proposals SET status='executed',result_json=?,executed_at=?,updated_at=? WHERE id=? AND uid=? AND status IN ('pending_approval','executing')")
        .bind(JSON.stringify({ task_id: taskId }), now, now, proposal.id, uid),
      env.DB.prepare("INSERT INTO agent_action_audit(id,uid,proposal_id,action_type,decision,reason,created_at) VALUES(?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), uid, proposal.id, proposal.action_type, "executed", "Internal task created within the workspace.", now)
    ]);
    return { status: "executed", result: { task_id: taskId } };
  }
  if (proposal.action_type === "update_task_status") {
    const result = await env.DB.prepare("UPDATE agent_tasks SET status=?,updated_at=? WHERE id=? AND uid=?")
      .bind(payload.status, now, payload.task_id, uid).run();
    if (!result.meta?.changes) throw new Error("The requested task was not found in this workspace.");
    await env.DB.batch([
      env.DB.prepare("UPDATE agent_action_proposals SET status='executed',result_json=?,executed_at=?,updated_at=? WHERE id=? AND uid=? AND status IN ('pending_approval','executing')")
        .bind(JSON.stringify({ task_id: payload.task_id, status: payload.status }), now, now, proposal.id, uid),
      env.DB.prepare("INSERT INTO agent_action_audit(id,uid,proposal_id,action_type,decision,reason,created_at) VALUES(?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), uid, proposal.id, proposal.action_type, "executed", "Internal task status updated within the workspace.", now)
    ]);
    return { status: "executed", result: { task_id: payload.task_id, status: payload.status } };
  }
  if (proposal.action_type === "create_content_draft") {
    const draftId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO agent_content_drafts(id,uid,channel,title,body,status,created_at,updated_at) VALUES(?,?,?,?,?,'draft',?,?)")
        .bind(draftId, uid, payload.channel, payload.title, payload.body, now, now),
      env.DB.prepare("UPDATE agent_action_proposals SET status='executed',result_json=?,executed_at=?,updated_at=? WHERE id=? AND uid=? AND status IN ('pending_approval','executing')")
        .bind(JSON.stringify({ draft_id: draftId }), now, now, proposal.id, uid),
      env.DB.prepare("INSERT INTO agent_action_audit(id,uid,proposal_id,action_type,decision,reason,created_at) VALUES(?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), uid, proposal.id, proposal.action_type, "executed", "Internal content draft saved; nothing was published or sent.", now)
    ]);
    return { status: "executed", result: { draft_id: draftId } };
  }
  throw new Error("Unsupported internal action.");
}

export async function handleAutonomyRequest(request, env, uid, path) {
  if (path === "/v1/autonomy/settings" && request.method === "GET") {
    return json({ settings: await settingsFor(env, uid), execution_scope: "internal_workspace_only" });
  }

  if (path === "/v1/autonomy/settings" && request.method === "PUT") {
    const parsed = validateAutonomySettings(await request.json());
    if (parsed.error) return json({ error: parsed.error }, 400);
    const s = parsed.value, now = nowIso();
    await env.DB.prepare("INSERT INTO agent_autonomy_settings(uid,enabled,paused,allowed_actions,daily_action_limit,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET enabled=excluded.enabled,paused=excluded.paused,allowed_actions=excluded.allowed_actions,daily_action_limit=excluded.daily_action_limit,updated_at=excluded.updated_at")
      .bind(uid, s.enabled ? 1 : 0, s.paused ? 1 : 0, JSON.stringify(s.allowed_actions), s.daily_action_limit, now, now).run();
    await audit(env, uid, null, "settings", "updated", "Workspace owner updated bounded-autonomy settings.");
    return json({ settings: s, execution_scope: "internal_workspace_only" });
  }

  if (path === "/v1/autonomy/proposals" && request.method === "GET") {
    const { results = [] } = await env.DB.prepare("SELECT id,action_type,status,approval_required,created_at,expires_at,result_json FROM agent_action_proposals WHERE uid=? ORDER BY created_at DESC LIMIT 50").bind(uid).all();
    return json({ proposals: results });
  }

  if (path === "/v1/autonomy/audit" && request.method === "GET") {
    const { results = [] } = await env.DB.prepare("SELECT id,proposal_id,action_type,decision,reason,created_at FROM agent_action_audit WHERE uid=? ORDER BY created_at DESC LIMIT 100").bind(uid).all();
    return json({ events: results });
  }

  if (path === "/v1/autonomy/actions" && request.method === "POST") {
    const body = await request.json();
    const actionType = body?.action_type;
    const parsed = validateAutonomyAction(actionType, body?.payload);
    if (parsed.error) return json({ error: parsed.error }, 400);
    const idempotencyKey = request.headers.get("Idempotency-Key") || "";
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) return json({ error: "A unique Idempotency-Key (8–128 safe characters) is required." }, 400);
    const existing = await env.DB.prepare("SELECT id,action_type,status,approval_required,created_at,expires_at,result_json FROM agent_action_proposals WHERE uid=? AND idempotency_key=?").bind(uid, idempotencyKey).first();
    if (existing) return json({ proposal: existing, duplicate: true });
    const settings = await settingsFor(env, uid);
    const allowed = settings.enabled && !settings.paused && settings.allowed_actions.includes(actionType);
    const slotReserved = allowed ? await reserveDailySlot(env, uid, settings.daily_action_limit) : false;
    const status = allowed && slotReserved ? "executing" : (allowed ? "blocked_limit" : "pending_approval");
    const id = crypto.randomUUID(), now = nowIso(), expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("INSERT INTO agent_action_proposals(id,uid,idempotency_key,action_type,payload_json,status,approval_required,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(id, uid, idempotencyKey, actionType, JSON.stringify(parsed.value), status, status === "pending_approval" ? 1 : 0, now, now, expires).run();
    const proposal = { id, action_type: actionType, status, approval_required: status === "pending_approval", created_at: now, expires_at: expires };
    if (status === "blocked_limit") {
      await audit(env, uid, id, actionType, "blocked", "The configured daily action limit has been reached.");
      return json({ proposal, message: "Daily autonomy limit reached; no action was executed." }, 429);
    }
    if (status === "pending_approval") {
      await audit(env, uid, id, actionType, "approval_required", "Autonomy is disabled, paused, or this action is not pre-authorized.");
      return json({ proposal, message: "Owner approval is required before this internal action can run." }, 202);
    }
    const result = await executeInternalAction(env, uid, { id, action_type: actionType, payload_json: JSON.stringify(parsed.value) });
    return json({ proposal: { ...proposal, status: result.status }, result: result.result }, 201);
  }

  const approvalMatch = path.match(/^\/v1\/autonomy\/proposals\/([0-9a-f-]{36})\/(approve|reject)$/i);
  if (approvalMatch && request.method === "POST") {
    const [, id, decision] = approvalMatch;
    const proposal = await env.DB.prepare("SELECT id,uid,action_type,payload_json,status,expires_at FROM agent_action_proposals WHERE id=? AND uid=?").bind(id, uid).first();
    if (!proposal) return json({ error: "Proposal not found in this workspace." }, 404);
    if (proposal.status !== "pending_approval") return json({ error: "Only pending proposals can be approved or rejected." }, 409);
    if (Date.parse(proposal.expires_at) <= Date.now()) {
      await env.DB.prepare("UPDATE agent_action_proposals SET status='expired',updated_at=? WHERE id=? AND uid=?").bind(nowIso(), id, uid).run();
      await audit(env, uid, id, proposal.action_type, "expired", "Approval window expired.");
      return json({ error: "This proposal has expired." }, 410);
    }
    if (decision === "reject") {
      const now = nowIso();
      await env.DB.batch([
        env.DB.prepare("UPDATE agent_action_proposals SET status='rejected',updated_at=? WHERE id=? AND uid=? AND status='pending_approval'").bind(now, id, uid),
        env.DB.prepare("INSERT INTO agent_action_audit(id,uid,proposal_id,action_type,decision,reason,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), uid, id, proposal.action_type, "rejected", "Workspace owner rejected the proposal.", now)
      ]);
      return json({ status: "rejected" });
    }
    const settings = await settingsFor(env, uid);
    if (!await reserveDailySlot(env, uid, settings.daily_action_limit)) {
      const blockedAt = nowIso();
      await env.DB.batch([
        env.DB.prepare("UPDATE agent_action_proposals SET status='blocked_limit',updated_at=? WHERE id=? AND uid=? AND status='pending_approval'").bind(blockedAt, id, uid),
        env.DB.prepare("INSERT INTO agent_action_audit(id,uid,proposal_id,action_type,decision,reason,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), uid, id, proposal.action_type, "blocked", "The configured daily action limit has been reached.", blockedAt)
      ]);
      return json({ error: "The configured daily action limit has been reached." }, 429);
    }
    const now = nowIso();
    await env.DB.prepare("UPDATE agent_action_proposals SET status='executing',updated_at=? WHERE id=? AND uid=? AND status='pending_approval'").bind(now, id, uid).run();
    const result = await executeInternalAction(env, uid, { ...proposal, status: "executing" });
    return json({ status: result.status, result: result.result });
  }

  return null;
}
