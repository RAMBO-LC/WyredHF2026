import Database from 'better-sqlite3';
import { generatePrefixedId, sha256 } from './invariants.js';
import { ingestAndDistillContent } from './ingestionEngine.js';

export const NEXUSFLOW_PROJECT_ID = 'proj_nexusflow_software';

export const NEXUSFLOW_SOFTWARE_DOCS = [
  {
    title: 'NexusFlow_API_v2_Reference.md',
    folder: 'Projects',
    path: 'Projects/NexusFlow_API_v2_Reference.md',
    tags: ['api', 'v2', 'rest', 'workflows', 'executions', 'metrics'],
    author: 'Principal API Architect',
    pinned: true,
    content: `# NexusFlow Cloud API v2 Reference Specification

## Platform Overview
NexusFlow Cloud provides high-throughput workflow automation and event orchestration for distributed software systems. All endpoints strictly require TLS 1.3 and cryptographic authentication.

## Base URL
\`https://api.nexusflow.io/v2\`

## Authentication & Headers
All requests must include the following headers:
- \`Authorization: Bearer nx_live_<hex32>\` (Production Token)
- \`X-Nexus-Version: 2026-03-01\`
- \`Idempotency-Key: <UUIDv4>\` (Mandatory for all POST and PUT mutations)
- \`Content-Type: application/json\`

## Core Endpoints

### 1. Workflows
- **POST \`/v2/workflows\`**: Define a new workflow DAG pipeline.
  - Request Body: \`{ "name": string, "trigger": "webhook" | "cron" | "event", "steps": [{ "action": string, "timeout_ms": number, "retry_count": number }] }\`
  - Response (201 Created): \`{ "workflow_id": "wf_live_7721", "status": "ACTIVE", "created_at": "2026-10-25T00:00:00Z" }\`
- **GET \`/v2/workflows/{id}\`**: Retrieve workflow status, step definitions, and last 10 execution runs.
- **POST \`/v2/workflows/{id}/execute\`**: Trigger an immediate execution run.
  - Request Body: \`{ "payload": Record<string, any>, "idempotency_key": string }\`
  - Response (202 Accepted): \`{ "execution_id": "exec_98124", "state": "QUEUED", "queue_position": 1 }\`

### 2. Executions & Observability
- **GET \`/v2/executions/{id}\`**: Returns real-time state (\`QUEUED\`, \`RUNNING\`, \`COMPLETED\`, \`FAILED\`), step timings, and failure codes.
- **GET \`/v2/executions/{id}/logs\`**: Real-time streaming execution logs formatted as newline-delimited JSON (NDJSON).
- **POST \`/v2/executions/{id}/cancel\`**: Gracefully aborts an active execution within 500ms.

### 3. Webhooks & Subscriptions
- **POST \`/v2/webhooks/endpoints\`**: Register a webhook listener URL.
  - Request Body: \`{ "url": string, "events": ["workflow.completed", "workflow.failed"] }\`
  - Response (201 Created): \`{ "endpoint_id": "ep_4421", "secret": "nx_whsec_f8a29..." }\`

### 4. Telemetry & Metrics
- **GET \`/v2/metrics/realtime\`**: Ingestion rates, P95/P99 latency, and error codes over 1m, 5m, 1h windows.`
  },

  {
    title: 'Webhook_Architecture_and_Retries.md',
    folder: 'Knowledge',
    path: 'Knowledge/Webhook_Architecture_and_Retries.md',
    tags: ['webhooks', 'hmac', 'retries', 'backoff', 'dlq', 'security'],
    author: 'Distributed Systems Lead',
    pinned: true,
    content: `# Webhook Architecture, HMAC Verification & Retry Policy

## Cryptographic Signature Verification
Every webhook dispatched by NexusFlow includes the cryptographic signature header:
\`X-Nexus-Signature-256: t=1761350400,v1=9e82a...b62\`

To prevent replay attacks and payload tampering, recipients must verify:
\`\`\`typescript
const expectedSig = crypto
  .createHmac('sha256', webhookSecret)
  .update(\`\${timestamp}.\${rawPayload}\`)
  .digest('hex');

if (!crypto.timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expectedSig))) {
  throw new Error('Invalid HMAC-SHA256 signature');
}
\`\`\`

## 5-Step Exponential Backoff Retry Policy
If an endpoint does not return HTTP 2xx within 15 seconds, the dispatcher executes a 5-step exponential backoff schedule:
1. **Attempt 1**: Immediate + 10 seconds backoff
2. **Attempt 2**: 30 seconds
3. **Attempt 3**: 2 minutes (120 seconds)
4. **Attempt 4**: 10 minutes (600 seconds)
5. **Attempt 5**: 1 hour (3,600 seconds)

## Dead Letter Queue (DLQ) & Alerting
If all 5 retry attempts fail:
- The event payload is routed to the **Dead Letter Queue (DLQ)** in Kafka topic \`webhooks.deadletter\`.
- An automated **SEV-3 alert** is triggered via PagerDuty.
- Retained in DLQ for 14 days with manual re-drive capability via \`POST /v2/webhooks/dlq/{id}/replay\`.`
  },

  {
    title: 'Rate_Limiting_and_Quotas.md',
    folder: 'Knowledge',
    path: 'Knowledge/Rate_Limiting_and_Quotas.md',
    tags: ['ratelimiting', 'redis', 'tokenbucket', 'quotas', 'http429'],
    author: 'Infrastructure Architect',
    pinned: true,
    content: `# Rate Limiting, Token Bucket & Quota System

## Rate Limit Engine Architecture
NexusFlow uses a distributed **Token Bucket algorithm** backed by Redis Cluster with sliding-window sorted sets.

## Quotas by Customer Tier
1. **Developer / Standard Tier**:
   - 1,000 requests per minute per API key.
   - Burst capacity: 1,500 requests per minute.
2. **Enterprise Tier**:
   - 10,000 requests per minute per API key.
   - Burst capacity: 15,000 requests per minute.
   - Dedicated Redis rate limiter cluster.

## Rate Limit Headers
Every response includes:
- \`X-RateLimit-Limit\`: Total requests permitted in the window.
- \`X-RateLimit-Remaining\`: Number of remaining requests before throttle.
- \`X-RateLimit-Reset\`: Unix epoch timestamp when quota resets.

## Throttling Behavior (HTTP 429)
When a client exceeds quota:
- Status Code: \`HTTP 429 Too Many Requests\`
- Header: \`Retry-After: <seconds>\`
- Response Body:
\`\`\`json
{
  "error": "ERR_RATE_LIMIT_EXCEEDED",
  "message": "API key exceeded quota of 1,000 req/min",
  "retry_after_sec": 14
}
\`\`\``
  },

  {
    title: 'HMAC_Authentication_and_Token_Specs.md',
    folder: 'Security',
    path: 'Security/HMAC_Authentication_and_Token_Specs.md',
    tags: ['security', 'tokens', 'mtls', 'vault', 'encryption', 'spiffe'],
    author: 'Chief Information Security Officer',
    pinned: true,
    content: `# Authentication Tokens, mTLS & Security Architecture

## Token Taxonomy & Prefixes
- \`nx_live_<32-byte-hex>\`: Live production API secret tokens.
- \`nx_test_<32-byte-hex>\`: Sandbox environment tokens (zero charges, simulated runs).
- \`nx_whsec_<32-byte-hex>\`: 256-bit webhook signing secret.

## Invariant Security Constraints
- **Zero Plain-Text Token Storage**: All tokens are stored as salted SHA-256 hashes in CockroachDB.
- **Automatic 90-Day Rotation**: Tokens auto-expire after 90 days. Managed via HashiCorp Vault.
- **Grace Period**: 24-hour overlap window during key rotation allowing zero-downtime transition.

## Internal Microservice mTLS
All inter-service traffic requires **Mutual TLS (mTLS)** with X.509 certificates issued by SPIRE:
- Subject Alternative Name (SAN): \`spiffe://nexusflow.internal/ns/prod/sa/<service-name>\`
- Cipher Suite: \`TLS_AES_256_GCM_SHA384\`
- Payloads at rest in CockroachDB use AES-256-GCM field-level encryption.`
  },

  {
    title: 'Distributed_Workflow_Engine.md',
    folder: 'Architecture',
    path: 'Architecture/Distributed_Workflow_Engine.md',
    tags: ['architecture', 'microservices', 'rust', 'firecracker', 'kafka', 'cockroachdb'],
    author: 'VP of Platform Engineering',
    pinned: false,
    content: `# Distributed Workflow Engine & Microservices Topology

## Microservice Architecture
1. **nexus-gateway**: Go reverse proxy. Handles TLS 1.3 termination, SHA-256 key verification, and Redis token bucket rate limiting.
2. **nexus-router**: Raft consensus coordinator. Resolves workflow DAG dependencies and assigns work units to Kafka partitions.
3. **nexus-worker**: High-performance execution daemon written in **Rust**. Executes untrusted customer code in isolated **Firecracker microVMs** with 50ms cold-start time.
4. **nexus-event-bus**: Apache Kafka 3.6 cluster partitioned by \`tenant_id\` and \`workflow_id\`.
5. **nexus-edge-cache**: Local SQLite in WAL mode deployed on edge gateway pods for sub-millisecond route resolution.

## Consensus & Data Persistence
- **State Store**: CockroachDB v23.2 multi-region deployment across \`us-east-1\`, \`us-west-2\`, and \`eu-west-1\`.
- **RPO / RTO**: RPO = 0 seconds (synchronous replication across 3 AZs); RTO < 5 seconds.`
  },

  {
    title: 'SEV1_Incident_and_Rollback_Runbook.md',
    folder: 'Runbooks',
    path: 'Runbooks/SEV1_Incident_and_Rollback_Runbook.md',
    tags: ['runbook', 'sev1', 'incident', 'rollback', 'argocd', 'kubernetes'],
    author: 'Site Reliability Engineering Lead',
    pinned: true,
    content: `# SEV-1 Incident Protocol & ArgoCD Rollback Runbook

## SEV-1 Trigger Criteria
- API 5xx error rate > 1.5% across any active cloud region.
- Workflow execution latency P99 > 800ms for longer than 3 minutes.
- Database replica lag > 5 seconds.
- Mean Time to Recovery (MTTR) SLA: **15 minutes**.

## Emergency Rollback Procedures
When a regression occurs following a production release:

### Step 1: Drain Canary Traffic
\`\`\`bash
argocd app set nexus-gateway --parameter canary.weight=0
argocd app sync nexus-gateway
\`\`\`

### Step 2: Roll Back Deployment
\`\`\`bash
kubectl rollout undo deployment/nexus-gateway -n prod
kubectl rollout status deployment/nexus-gateway -n prod --timeout=120s
\`\`\`

### Step 3: Health Probe Verification
\`\`\`bash
curl -f https://api.nexusflow.io/healthz
# Expected HTTP 200: {"status":"HEALTHY","cluster":"prod-us-east-1","latency_ms":2.1}
\`\`\`

### Step 4: Incident Communications
- Post status update to \`#incidents-sev1\` on Slack.
- Update public status page at \`https://status.nexusflow.io\`.`
  },

  {
    title: 'Engineering_Onboarding_and_SDKs.md',
    folder: 'Team',
    path: 'Team/Engineering_Onboarding_and_SDKs.md',
    tags: ['sdks', 'typescript', 'python', 'go', 'quickstart', 'onboarding'],
    author: 'Developer Relations Lead',
    pinned: false,
    content: `# Official Client SDKs & Developer Quickstart

## Installation
- **TypeScript / Node.js**: \`npm install @nexusflow/sdk\`
- **Python 3.10+**: \`pip install nexusflow-python\`
- **Go**: \`go get github.com/nexusflow/nexusflow-go\`

## TypeScript Quickstart
\`\`\`typescript
import { NexusClient } from '@nexusflow/sdk';

const client = new NexusClient({
  apiKey: process.env.NEXUS_API_KEY!,
  timeoutMs: 10000,
  maxRetries: 3
});

// Trigger a workflow execution
const run = await client.workflows.execute('wf_order_processing', {
  orderId: 'ord_99182',
  amountCents: 4500
});

console.log(\`Execution started: \${run.executionId} (\${run.state})\`);
\`\`\`

## Python Quickstart
\`\`\`python
from nexusflow import NexusClient

client = NexusClient(api_key=os.environ["NEXUS_API_KEY"])

execution = client.workflows.execute(
    workflow_id="wf_order_processing",
    payload={"order_id": "ord_99182", "amount_cents": 4500}
)
print(f"Execution: {execution.id} - Status: {execution.status}")
\`\`\`

## Error Handling Pattern
The SDK exposes \`NexusAPIError\`, \`NexusRateLimitError\`, and \`NexusAuthError\`.
Always catch \`NexusRateLimitError\` to inspect \`e.retryAfterSeconds\`.`
  },

  {
    title: 'SuperUser_System_Manifest.md',
    folder: 'SuperUser',
    path: 'SuperUser/SuperUser_System_Manifest.md',
    tags: ['superuser', 'omniscient', 'orchestrator', 'nexusflow', 'system'],
    author: 'SuperUser System Core',
    pinned: true,
    content: `# NexusFlow Omniscient SuperUser Agent Manifest

## System Mandate
The central executive orchestrator for NexusFlow Cloud software operations. Coordinates Researcher, Analyst, Writer, and Critic agents with direct access to the persistent SQLite WAL knowledge base.

## Architectural Authority
- Enforces strict RAG hallucination boundaries: refuses any off-topic queries outside the software platform.
- Validates Invariants I1–I8 across all memory distillation.
- Manages multi-agent consensus across API v2, Webhooks, Rate Limiting, Security, and Rollback runbooks.`
  }
];

export const NEXUSFLOW_DEMO_CONVERSATIONS = [
  {
    id: 'conv_rate_limit_quotas',
    task: 'Explain the NexusFlow API v2 rate limiting quotas and Redis token bucket implementation',
    status: 'completed',
    started_at: '2026-10-24T18:00:00Z',
    completed_at: '2026-10-24T18:00:02Z',
    summary: `### NexusFlow API v2 Rate Limiting Architecture & Quotas

#### 1. Rate Limiting Quotas by Tier
- **Developer / Standard Tier**: **1,000 requests per minute** per API key, with a burst allowance of **1,500 requests**.
- **Enterprise Tier**: **10,000 requests per minute** per API key, with a burst allowance of **15,000 requests**.

#### 2. Implementation Mechanism
- **Distributed Token Bucket Algorithm**: Implemented in the \`nexus-gateway\` reverse proxy using Redis Cluster with sliding-window sorted sets.
- **Zero Lock Contention**: Counter increments and quota checks execute within a single Redis Lua script in sub-millisecond latency.

#### 3. HTTP Headers Returned on All Requests
- \`X-RateLimit-Limit\`: Total requests permitted in the sliding window.
- \`X-RateLimit-Remaining\`: Number of remaining request tokens.
- \`X-RateLimit-Reset\`: Unix epoch timestamp when quota replenishes.

#### 4. Throttling Protocol (HTTP 429)
When quota is exceeded, the gateway returns:
- Status: \`HTTP 429 Too Many Requests\`
- Header: \`Retry-After: <seconds>\`
- Payload: \`{ "error": "ERR_RATE_LIMIT_EXCEEDED", "retry_after_sec": 14 }\``,
    metadata: {
      source: 'NexusFlow RAG Knowledge Base',
      documentsUsed: ['Knowledge/Rate_Limiting_and_Quotas.md', 'Projects/NexusFlow_API_v2_Reference.md'],
      critique: { score: 10, is_acceptable: true, feedback: 'Thorough, precise, and 100% grounded in verified RAG docs.' },
      durationMs: 1240,
      agentsInvolved: ['researcher', 'analyst', 'writer', 'critic']
    }
  },

  {
    id: 'conv_webhook_hmac_dlq',
    task: 'Audit the Webhook Dispatcher HMAC-SHA256 signature verification and 5-step exponential backoff retry policy',
    status: 'completed',
    started_at: '2026-10-24T18:45:00Z',
    completed_at: '2026-10-24T18:45:02Z',
    summary: `### Webhook Security & 5-Step Exponential Backoff Audit

#### 1. HMAC-SHA256 Cryptographic Signing
All outgoing webhooks are signed with the \`nx_whsec_\` secret. Dispatched payloads include the header:
\`X-Nexus-Signature-256: t=<timestamp>,v1=<hmac_hex>\`
Recipients must verify using \`crypto.timingSafeEqual()\` over \`\${timestamp}.\${rawPayload}\`.

#### 2. 5-Step Exponential Backoff Retry Schedule
If a webhook destination fails or times out after 15 seconds, the dispatcher retries across 5 attempts:
1. **Attempt 1**: Immediate + 10s backoff
2. **Attempt 2**: 30s backoff
3. **Attempt 3**: 2 minutes (120s)
4. **Attempt 4**: 10 minutes (600s)
5. **Attempt 5**: 1 hour (3,600s)

#### 3. Dead Letter Queue (DLQ) & SEV-3 Alerting
If all 5 attempts fail:
- The event is pushed to the Kafka Dead Letter Queue (\`webhooks.deadletter\`).
- An automated PagerDuty **SEV-3 alert** is fired to engineering.
- Retained for 14 days with manual re-drive via \`POST /v2/webhooks/dlq/{id}/replay\`.`,
    metadata: {
      source: 'NexusFlow RAG Knowledge Base',
      documentsUsed: ['Knowledge/Webhook_Architecture_and_Retries.md'],
      critique: { score: 10, is_acceptable: true, feedback: 'Precise timings and cryptographic verification verified.' },
      durationMs: 1180,
      agentsInvolved: ['researcher', 'analyst', 'writer', 'critic']
    }
  },

  {
    id: 'conv_mtls_vault_security',
    task: 'Review internal mTLS service-to-service authentication and Vault token rotation specifications',
    status: 'completed',
    started_at: '2026-10-24T19:30:00Z',
    completed_at: '2026-10-24T19:30:02Z',
    summary: `### Security Specification: Token Taxonomy, mTLS & Vault Rotation

#### 1. Token Prefix Taxonomy
- \`nx_live_\`: Production live API tokens.
- \`nx_test_\`: Sandbox environment tokens (zero cost, mock executions).
- \`nx_whsec_\`: Webhook signature secrets (256-bit).

#### 2. Service-to-Service mTLS
Internal microservices communicate using Mutual TLS with X.509 certificates issued by SPIRE.
- SPIFFE ID format: \`spiffe://nexusflow.internal/ns/prod/sa/<service_name>\`
- Cipher: \`TLS_AES_256_GCM_SHA384\`

#### 3. 90-Day Key Rotation & Grace Period
- Managed automatically via HashiCorp Vault.
- Tokens rotate every 90 days with a 24-hour overlapping grace period to ensure zero downtime.
- Payload storage in CockroachDB is protected with AES-256-GCM field-level encryption.`,
    metadata: {
      source: 'NexusFlow RAG Knowledge Base',
      documentsUsed: ['Security/HMAC_Authentication_and_Token_Specs.md'],
      critique: { score: 9, is_acceptable: true, feedback: 'Accurately outlines SPIFFE ID and rotation policies.' },
      durationMs: 1350,
      agentsInvolved: ['researcher', 'analyst', 'writer', 'critic']
    }
  },

  {
    id: 'conv_sev1_rollback_runbook',
    task: 'Execute SEV-1 incident rollback runbook for the ArgoCD gateway cluster',
    status: 'completed',
    started_at: '2026-10-24T20:15:00Z',
    completed_at: '2026-10-24T20:15:02Z',
    summary: `### SEV-1 Incident Playbook: Gateway Rollback Execution

#### 1. Trigger Verification
- Trigger: API 5xx error rate exceeded 1.5% threshold following Canary release.
- MTTR SLA: 15 minutes.

#### 2. Rollback Execution Commands
\`\`\`bash
# Step 1: Drain Canary Traffic to 0%
argocd app set nexus-gateway --parameter canary.weight=0
argocd app sync nexus-gateway

# Step 2: Roll back deployment in Kubernetes
kubectl rollout undo deployment/nexus-gateway -n prod
kubectl rollout status deployment/nexus-gateway -n prod --timeout=120s

# Step 3: Health Probe Verification
curl -f https://api.nexusflow.io/healthz
# Returns HTTP 200 {"status":"HEALTHY"}
\`\`\`

#### 3. Incident Logging & Status Communication
- Broadcasted status to Slack channel \`#incidents-sev1\`.
- Updated public status page at \`https://status.nexusflow.io\`.`,
    metadata: {
      source: 'NexusFlow RAG Knowledge Base',
      documentsUsed: ['Runbooks/SEV1_Incident_and_Rollback_Runbook.md'],
      critique: { score: 10, is_acceptable: true, feedback: 'Follows official SRE runbook procedures.' },
      durationMs: 1100,
      agentsInvolved: ['researcher', 'analyst', 'writer', 'critic']
    }
  },

  {
    id: 'conv_sdk_error_matrix',
    task: 'Document Python and TypeScript SDK error handling for HTTP 429 and 503 responses',
    status: 'completed',
    started_at: '2026-10-24T21:00:00Z',
    completed_at: '2026-10-24T21:00:02Z',
    summary: `### Client SDK Error Handling Matrix (TypeScript & Python)

#### 1. Package Installation
- TypeScript: \`npm install @nexusflow/sdk\`
- Python: \`pip install nexusflow-python\`

#### 2. Error Classes
- \`NexusAPIError\`: Generic API failure.
- \`NexusRateLimitError\`: Triggered upon HTTP 429. Exposes \`e.retryAfterSeconds\`.
- \`NexusAuthError\`: Triggered on invalid or revoked API token (HTTP 401).

#### 3. TypeScript Handling Example
\`\`\`typescript
try {
  await client.workflows.execute('wf_sync', payload);
} catch (err) {
  if (err instanceof NexusRateLimitError) {
    console.warn(\`Throttled. Backing off for \${err.retryAfterSeconds}s\`);
    await sleep(err.retryAfterSeconds * 1000);
  }
}
\`\`\`

#### 4. Python Handling Example
\`\`\`python
try:
    client.workflows.execute(workflow_id="wf_sync", payload=payload)
except NexusRateLimitError as e:
    time.sleep(e.retry_after_seconds)
\`\`\``,
    metadata: {
      source: 'NexusFlow RAG Knowledge Base',
      documentsUsed: ['Team/Engineering_Onboarding_and_SDKs.md'],
      critique: { score: 9, is_acceptable: true, feedback: 'Code snippets verified against official SDK interfaces.' },
      durationMs: 1400,
      agentsInvolved: ['researcher', 'analyst', 'writer', 'critic']
    }
  }
];

/**
 * Seeds the comprehensive NexusFlow software documents and historical conversations
 * into SQLite, creating real resources, chunks, distilled memories, and task runs.
 */
export function seedNexusFlowSoftwareVault(db: Database.Database): void {
  // 1. Ensure project exists
  db.prepare(`
    INSERT OR REPLACE INTO projects (id, name, created_at, metadata)
    VALUES (?, ?, ?, ?)
  `).run(
    NEXUSFLOW_PROJECT_ID,
    'NexusFlow Cloud Platform',
    new Date().toISOString(),
    JSON.stringify({ industry: 'Software & Cloud APIs', tech_stack: ['Go', 'Rust', 'Kafka', 'CockroachDB', 'Redis', 'TypeScript', 'Python'] })
  );

  // 2. Ingest and distill each software document through universal RAG pipeline
  for (const doc of NEXUSFLOW_SOFTWARE_DOCS) {
    try {
      ingestAndDistillContent({
        title: doc.title,
        content: doc.content,
        folder: doc.folder,
        author: doc.author,
        tags: doc.tags,
        projectId: NEXUSFLOW_PROJECT_ID
      }, db);
    } catch (e: any) {
      console.warn(`Could not auto-ingest ${doc.title}:`, e.message);
    }
  }

  // 3. Connect cross-document graph links
  const insertLink = db.prepare(`
    INSERT OR REPLACE INTO document_links (source_id, target_id, context)
    VALUES (?, ?, ?)
  `);

  const links = [
    { src: 'Projects/NexusFlow_API_v2_Reference.md', tgt: 'Knowledge/Rate_Limiting_and_Quotas.md', ctx: 'Rate limit enforcement for v2 endpoints' },
    { src: 'Projects/NexusFlow_API_v2_Reference.md', tgt: 'Knowledge/Webhook_Architecture_and_Retries.md', ctx: 'Webhook event subscription specs' },
    { src: 'Projects/NexusFlow_API_v2_Reference.md', tgt: 'Security/HMAC_Authentication_and_Token_Specs.md', ctx: 'Token authentication & headers' },
    { src: 'Architecture/Distributed_Workflow_Engine.md', tgt: 'Projects/NexusFlow_API_v2_Reference.md', ctx: 'Gateway routing to workflow engine' },
    { src: 'Runbooks/SEV1_Incident_and_Rollback_Runbook.md', tgt: 'Architecture/Distributed_Workflow_Engine.md', ctx: 'ArgoCD canary rollback of gateway' },
    { src: 'Team/Engineering_Onboarding_and_SDKs.md', tgt: 'Projects/NexusFlow_API_v2_Reference.md', ctx: 'Client SDK implementations of v2 API' },
    { src: 'SuperUser/SuperUser_System_Manifest.md', tgt: 'Projects/NexusFlow_API_v2_Reference.md', ctx: 'SuperUser oversight of platform' },
  ];

  for (const l of links) {
    try {
      // Find matching IDs
      const sRow = db.prepare(`SELECT id FROM documents WHERE path = ?`).get(l.src) as any;
      const tRow = db.prepare(`SELECT id FROM documents WHERE path = ?`).get(l.tgt) as any;
      if (sRow && tRow) {
        insertLink.run(sRow.id, tRow.id, l.ctx);
      }
    } catch {
      // ignore
    }
  }

  // 4. Seed conversation history into task_runs
  const insertTask = db.prepare(`
    INSERT OR REPLACE INTO task_runs (id, task, status, summary, started_at, completed_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const conv of NEXUSFLOW_DEMO_CONVERSATIONS) {
    try {
      insertTask.run(
        conv.id,
        conv.task,
        conv.status,
        conv.summary,
        conv.started_at,
        conv.completed_at,
        JSON.stringify(conv.metadata)
      );
    } catch (e: any) {
      console.warn(`Could not seed conversation ${conv.id}:`, e.message);
    }
  }
}
