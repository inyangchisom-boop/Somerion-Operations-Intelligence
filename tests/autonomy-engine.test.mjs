import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import { handleAutonomyRequest } from "../cloudflare-workers/netlify-test-agent-api/autonomy.js";

function mockEnv() {
  const state = {
    settings: new Map(), proposals: new Map(), tasks: new Map(),
    drafts: new Map(), audits: [], daily: new Map(), pauseOnQuota: false
  };
  const clone = value => value ? structuredClone(value) : null;
  async function run(sql, p) {
    if (sql.startsWith("INSERT INTO agent_autonomy_settings")) {
      state.settings.set(p[0], { enabled:p[1], paused:p[2], allowed_actions:p[3], daily_action_limit:p[4], created_at:p[5], updated_at:p[6] });
      return { meta:{changes:1} };
    }
    if (sql.startsWith("INSERT OR IGNORE INTO agent_action_proposals")) {
      const key=p[1]+":"+p[2];
      if (![...state.proposals.values()].some(x=>x.uid+":"+x.idempotency_key===key)) {
        state.proposals.set(p[0], { id:p[0],uid:p[1],idempotency_key:p[2],action_type:p[3],payload_json:p[4],status:p[5],approval_required:p[6],created_at:p[7],updated_at:p[8],expires_at:p[9],result_json:null });
      }
      return { meta:{changes:1} };
    }
    if (sql.startsWith("INSERT INTO agent_tasks")) {
      state.tasks.set(p[0], { id:p[0],uid:p[1],title:p[2],details:p[3],status:p[4],due_at:p[5],created_at:p[6],updated_at:p[7] });
      return { meta:{changes:1} };
    }
    if (sql.startsWith("INSERT INTO agent_content_drafts")) {
      state.drafts.set(p[0], { id:p[0],uid:p[1],channel:p[2],title:p[3],body:p[4],status:"draft",created_at:p[5],updated_at:p[6] });
      return { meta:{changes:1} };
    }
    if (sql.startsWith("INSERT INTO agent_action_audit")) {
      if (sql.includes("SELECT ?,uid,id,action_type")) {
        const proposal=state.proposals.get(p[3]);
        if (proposal && proposal.uid===p[4] && proposal.status==="executed") state.audits.push({id:p[0],uid:proposal.uid,proposal_id:proposal.id,action_type:proposal.action_type,decision:"executed",reason:p[1],created_at:p[2]});
      } else {
        state.audits.push({id:p[0],uid:p[1],proposal_id:p[2],action_type:p[3],decision:p[4],reason:p[5],created_at:p[6]});
      }
      return { meta:{changes:1} };
    }
    if (sql.startsWith("UPDATE agent_tasks SET status=?")) {
      const task=state.tasks.get(p[2]);
      if (!task || task.uid!==p[3]) return { meta:{changes:0} };
      task.status=p[0];task.updated_at=p[1];return { meta:{changes:1} };
    }
    if (sql.startsWith("UPDATE agent_action_proposals")) {
      let proposal, status, updated;
      if (sql.includes("SET status='executed'")) {
        proposal=state.proposals.get(p[3]);status="executed";updated=p[2];
        if (sql.includes("AND EXISTS")) {
          const task=state.tasks.get(p[5]);
          if (!task || task.uid!==p[6]) return {meta:{changes:0}};
        }
        if (!proposal || proposal.uid!==p[4] || !["pending_approval","executing"].includes(proposal.status)) return {meta:{changes:0}};
        proposal.result_json=p[0];proposal.executed_at=p[1];
      } else if (sql.includes("SET status='executing'")) {
        proposal=state.proposals.get(p[1]);status="executing";updated=p[0];
        if (!proposal || proposal.uid!==p[2] || proposal.status!=="pending_approval") return {meta:{changes:0}};
      } else if (sql.includes("SET status='rejected'")) {
        proposal=state.proposals.get(p[1]);status="rejected";updated=p[0];
        if (!proposal || proposal.uid!==p[2] || proposal.status!=="pending_approval") return {meta:{changes:0}};
      } else if (sql.includes("SET status='pending_approval'")) {
        proposal=state.proposals.get(p[1]);status="pending_approval";updated=p[0];
        if (!proposal || proposal.uid!==p[2] || proposal.status!=="executing") return {meta:{changes:0}};
      } else if (sql.includes("SET status='expired'")) {
        proposal=state.proposals.get(p[1]);status="expired";updated=p[0];
      } else if (sql.includes("SET status='failed'")) {
        proposal=state.proposals.get(p[1]);status="failed";updated=p[0];
      } else if (sql.includes("SET status='blocked_limit'")) {
        proposal=state.proposals.get(p[1]);status="blocked_limit";updated=p[0];
      } else if (sql.includes("SET status=?")) {
        proposal=state.proposals.get(p[2]);status=p[0];updated=p[1];
      }
      if (!proposal || proposal.uid!==p[sql.includes("SET status=?")?3:sql.includes("SET status='executed'")?4:2]) return {meta:{changes:0}};
      proposal.status=status;proposal.updated_at=updated;
      if (sql.includes("approval_required=0")) proposal.approval_required=0;
      return {meta:{changes:1}};
    }
    return { meta:{changes:1} };
  }
  const DB={
    prepare(sql) {
      let params=[];
      const statement={
        sql,
        get params(){return params},
        bind(...values){params=values;return statement},
        async first(){
          if (sql.includes("SELECT enabled,paused,allowed_actions,daily_action_limit")) return clone(state.settings.get(params[0]));
          if (sql.includes("SELECT id,action_type,status,approval_required,created_at,expires_at,result_json FROM agent_action_proposals WHERE uid=? AND idempotency_key=?")) {
            const row=[...state.proposals.values()].find(x=>x.uid===params[0]&&x.idempotency_key===params[1]);return clone(row);
          }
          if (sql.includes("SELECT id,uid,action_type,payload_json,status,expires_at FROM agent_action_proposals WHERE id=? AND uid=?")) {
            const row=state.proposals.get(params[0]);return row?.uid===params[1]?clone(row):null;
          }
          if (sql.includes("INSERT INTO agent_autonomy_daily_usage")) {
            const key=params[0]+":"+params[1],limit=params[2],count=state.daily.get(key)||0;
            if(count>=limit)return null;
            state.daily.set(key,count+1);
            if(state.pauseOnQuota){const current=state.settings.get(params[0]);state.settings.set(params[0],{...current,paused:1});state.pauseOnQuota=false;}
            return {action_count:count+1};
          }
          return null;
        },
        async all(){
          if (sql.includes("FROM agent_action_proposals WHERE uid=?")) return {results:[...state.proposals.values()].filter(x=>x.uid===params[0]).map(x=>clone(x))};
          if (sql.includes("FROM agent_action_audit WHERE uid=?")) return {results:state.audits.filter(x=>x.uid===params[0]).map(x=>clone(x))};
          if (sql.includes("FROM agent_content_drafts WHERE uid=?")) return {results:[...state.drafts.values()].filter(x=>x.uid===params[0]).map(x=>clone(x))};
          return {results:[]};
        },
        async run(){return run(sql,params)}
      };
      return statement;
    },
    async batch(statements){
      const results=[];
      for(const s of statements) results.push(await run(s.sql,s.params));
      return results;
    }
  };
  return { DB, state };
}
function req(path,method="GET",body,headers={}) {
  return new Request("https://test.local"+path,{method,headers:{"Content-Type":"application/json",...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
async function json(response){return response.json()}

describe("Isolated bounded autonomy execution engine", function () {
  it("starts disabled and paused", async function () {
    const env=mockEnv(),res=await handleAutonomyRequest(req("/v1/autonomy/settings"),env,"user-a","/v1/autonomy/settings");
    const data=await json(res);
    assert.equal(data.settings.enabled,false);
    assert.equal(data.settings.paused,true);
    assert.deepEqual(data.settings.allowed_actions,[]);
  });

  it("executes only an explicitly allowed internal task and records the result", async function () {
    const env=mockEnv();
    await handleAutonomyRequest(req("/v1/autonomy/settings","PUT",{enabled:true,paused:false,allowed_actions:["create_task"],daily_action_limit:2}),env,"user-a","/v1/autonomy/settings");
    const res=await handleAutonomyRequest(req("/v1/autonomy/actions","POST",{action_type:"create_task",payload:{title:"Review orders",details:"Check today's orders.",due_at:null}},{"Idempotency-Key":"task-create-0001"}),env,"user-a","/v1/autonomy/actions");
    const data=await json(res);
    assert.equal(res.status,201);
    assert.equal(data.proposal.status,"executed");
    assert.equal(env.state.tasks.size,1);
    assert.equal([...env.state.proposals.values()][0].status,"executed");
    assert.ok(env.state.audits.some(x=>x.decision==="executed"));
  });

  it("uses idempotency keys to prevent duplicate task creation", async function () {
    const env=mockEnv();
    await handleAutonomyRequest(req("/v1/autonomy/settings","PUT",{enabled:true,paused:false,allowed_actions:["create_task"],daily_action_limit:5}),env,"user-a","/v1/autonomy/settings");
    const request=()=>req("/v1/autonomy/actions","POST",{action_type:"create_task",payload:{title:"One task",details:"",due_at:null}},{"Idempotency-Key":"same-request-0001"});
    await handleAutonomyRequest(request(),env,"user-a","/v1/autonomy/actions");
    const second=await handleAutonomyRequest(request(),env,"user-a","/v1/autonomy/actions");
    const data=await json(second);
    assert.equal(data.duplicate,true);
    assert.equal(env.state.tasks.size,1);
    assert.equal(env.state.daily.get("user-a:"+new Date().toISOString().slice(0,10)),1);
  });

  it("requires approval when autonomy is disabled and executes only after owner approval", async function () {
    const env=mockEnv();
    const created=await handleAutonomyRequest(req("/v1/autonomy/actions","POST",{action_type:"create_task",payload:{title:"Prepare report",details:"",due_at:null}},{"Idempotency-Key":"approval-test-0001"}),env,"user-a","/v1/autonomy/actions");
    const proposal=(await json(created)).proposal;
    assert.equal(created.status,202);
    assert.equal(proposal.status,"pending_approval");
    assert.equal(env.state.tasks.size,0);
    await handleAutonomyRequest(req("/v1/autonomy/settings","PUT",{enabled:false,paused:false,allowed_actions:[],daily_action_limit:5}),env,"user-a","/v1/autonomy/settings");
    const approved=await handleAutonomyRequest(req("/v1/autonomy/proposals/"+proposal.id+"/approve","POST",{}),env,"user-a","/v1/autonomy/proposals/"+proposal.id+"/approve");
    assert.equal(approved.status,200);
    assert.equal((await json(approved)).status,"executed");
    assert.equal(env.state.tasks.size,1);
  });

  it("blocks approvals during emergency pause", async function () {
    const env=mockEnv();
    const created=await handleAutonomyRequest(req("/v1/autonomy/actions","POST",{action_type:"create_task",payload:{title:"Prepare report",details:"",due_at:null}},{"Idempotency-Key":"pause-test-0001"}),env,"user-a","/v1/autonomy/actions");
    const proposal=(await json(created)).proposal;
    const paused=await handleAutonomyRequest(req("/v1/autonomy/proposals/"+proposal.id+"/approve","POST",{}),env,"user-a","/v1/autonomy/proposals/"+proposal.id+"/approve");
    assert.equal(paused.status,423);
    assert.equal(env.state.tasks.size,0);
  });

  it("enforces the daily action limit server-side", async function () {
    const env=mockEnv();
    await handleAutonomyRequest(req("/v1/autonomy/settings","PUT",{enabled:true,paused:false,allowed_actions:["create_task"],daily_action_limit:1}),env,"user-a","/v1/autonomy/settings");
    const create=(key,title)=>req("/v1/autonomy/actions","POST",{action_type:"create_task",payload:{title,details:"",due_at:null}},{"Idempotency-Key":key});
    const first=await handleAutonomyRequest(create("daily-limit-0001","First"),env,"user-a","/v1/autonomy/actions");
    const second=await handleAutonomyRequest(create("daily-limit-0002","Second"),env,"user-a","/v1/autonomy/actions");
    assert.equal(first.status,201);
    assert.equal(second.status,429);
    assert.equal(env.state.tasks.size,1);
  });


  it("rechecks the emergency pause after quota reservation and before execution", async function () {
    const env=mockEnv();
    await handleAutonomyRequest(req("/v1/autonomy/settings","PUT",{enabled:true,paused:false,allowed_actions:["create_task"],daily_action_limit:3}),env,"user-a","/v1/autonomy/settings");
    env.state.pauseOnQuota=true;
    const res=await handleAutonomyRequest(req("/v1/autonomy/actions","POST",{action_type:"create_task",payload:{title:"Must not run",details:"",due_at:null}},{"Idempotency-Key":"pause-race-test-01"}),env,"user-a","/v1/autonomy/actions");
    const data=await json(res);
    assert.equal(res.status,202);
    assert.equal(data.proposal.status,"pending_approval");
    assert.equal(env.state.tasks.size,0);
    assert.equal([...env.state.proposals.values()][0].status,"pending_approval");
    assert.ok(env.state.audits.some(x=>x.decision==="approval_required"&&x.reason.includes("policy changed")));
  });

  it("saves content drafts internally without external publication", async function () {
    const env=mockEnv();
    await handleAutonomyRequest(req("/v1/autonomy/settings","PUT",{enabled:true,paused:false,allowed_actions:["create_content_draft"],daily_action_limit:2}),env,"user-a","/v1/autonomy/settings");
    const res=await handleAutonomyRequest(req("/v1/autonomy/actions","POST",{action_type:"create_content_draft",payload:{channel:"instagram",title:"New collection",body:"Draft text only."}},{"Idempotency-Key":"draft-create-0001"}),env,"user-a","/v1/autonomy/actions");
    assert.equal(res.status,201);
    assert.equal(env.state.drafts.size,1);
    assert.equal([...env.state.drafts.values()][0].status,"draft");
  });

  it("keeps proposals and audit records scoped to the authenticated user", async function () {
    const env=mockEnv();
    await handleAutonomyRequest(req("/v1/autonomy/actions","POST",{action_type:"create_task",payload:{title:"A private task",details:"",due_at:null}},{"Idempotency-Key":"user-scope-0001"}),env,"user-a","/v1/autonomy/actions");
    await handleAutonomyRequest(req("/v1/autonomy/actions","POST",{action_type:"create_task",payload:{title:"B private task",details:"",due_at:null}},{"Idempotency-Key":"user-scope-0002"}),env,"user-b","/v1/autonomy/actions");
    const list=await handleAutonomyRequest(req("/v1/autonomy/proposals"),env,"user-a","/v1/autonomy/proposals");
    assert.equal((await json(list)).proposals.length,1);
    const audit=await handleAutonomyRequest(req("/v1/autonomy/audit"),env,"user-a","/v1/autonomy/audit");
    assert.ok((await json(audit)).events.every(x=>x.uid==="user-a"));
  });
});
