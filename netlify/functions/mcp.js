import { authorize, handleOptions, logError } from './lib/apiCommon.mjs';
import { handler as crmHandler } from './crm-data.js';
import { handler as cashflowHandler } from './cashflow.js';
import { handler as documentsHandler } from './documents.js';

const MCP_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-API-Key, Accept, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const PROTOCOL = '2025-03-26';
const FALLBACK_PROTOCOL = '2024-11-05';
const RESOURCE_METADATA = 'https://myecrm2026.netlify.app/.well-known/oauth-protected-resource/mcp';
const AUTH_CHALLENGE = `Bearer resource_metadata="${RESOURCE_METADATA}", error="invalid_token", error_description="Connect the CRM account to continue"`;
const SERVER_INFO = { name: 'me-crm', title: 'CRM כספים', version: '1.0.0' };
const INSTRUCTIONS = [
  'Read-only live CRM for the Grok bot איסוף חשבוניות. Never write or guess money figures.',
  'Use listDocuments for collected invoices and receipts waiting for review.',
  'Prefer getCashflow for receivables, tax debts, income, expenses, and cashflow.',
  'Use getCrmData for events, customers, leads, and tasks.',
  'Answer in Hebrew with ₪ amounts.',
].join(' ');

const TOOLS = [
  {
    name: 'getCashflow',
    description: 'Live cashflow: money owed to me, tax-authority debts, income, expenses, receipts, open invoices, and forecast.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: ['crm.read'] }],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from: { type: 'string', description: 'Range start YYYY-MM-DD' },
        to: { type: 'string', description: 'Range end YYYY-MM-DD' },
        asOf: { type: 'string', description: 'As-of date YYYY-MM-DD' },
        openingBalance: { type: 'number', description: 'Opening cash balance' },
      },
    },
  },
  {
    name: 'getCrmData',
    description: 'Live CRM records: events, customers, leads, tasks, or all.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: ['crm.read'] }],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        resource: { type: 'string', enum: ['events', 'customers', 'leads', 'tasks', 'all'], default: 'all' },
        from: { type: 'string', description: 'Filter start YYYY-MM-DD' },
        to: { type: 'string', description: 'Filter end YYYY-MM-DD' },
        limit: { type: 'integer', minimum: 1, maximum: 2000, default: 200 },
      },
    },
  },
  {
    name: 'listDocuments',
    description: 'Collected invoices and receipts in the CRM document archive. Read only. Use reviewStatus needs_review for documents waiting to be checked.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: 'oauth2', scopes: ['crm.read'] }],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        direction: { type: 'string', enum: ['income', 'expense', 'tracking'], description: 'income, expense, or tracking' },
        reviewStatus: { type: 'string', enum: ['needs_review', 'confirmed'], description: 'needs_review = waiting, confirmed = approved' },
        year: { type: 'integer', description: 'Document year, for example 2026' },
        monthKey: { type: 'string', description: 'Month YYYY-MM' },
        limit: { type: 'integer', minimum: 1, maximum: 80, default: 40 },
      },
    },
  },
];

function mcpJson(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...MCP_HEADERS, ...extraHeaders },
    body: body === '' ? '' : JSON.stringify(body),
  };
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function isNotification(msg) {
  return msg && typeof msg === 'object' && !Object.prototype.hasOwnProperty.call(msg, 'id');
}

function compactCashflow(parsed) {
  if (!parsed || typeof parsed !== 'object' || !parsed.data) return parsed;
  const details = parsed.data.details || {};
  return {
    ...parsed,
    data: {
      ...parsed.data,
      details: {
        openBalances: (details.openBalances || []).slice(0, 40),
        overdue: (details.overdue || []).slice(0, 20),
        undatedBalances: (details.undatedBalances || []).slice(0, 20),
        expectedCollections: (details.expectedCollections || []).slice(0, 20),
        expenses: (details.expenses || []).slice(0, 20),
      },
    },
  };
}

async function invokeApi(handler, headers, query) {
  const result = await handler({
    httpMethod: 'GET',
    headers,
    queryStringParameters: query,
    path: '/mcp',
  });
  let parsed = {};
  try {
    parsed = result.body ? JSON.parse(result.body) : {};
  } catch {
    parsed = { success: false, error: 'Invalid upstream JSON' };
  }
  return { statusCode: result.statusCode, parsed };
}

function toolText(payload) {
  return [{ type: 'text', text: JSON.stringify(payload) }];
}

function compactDocument(doc) {
  return {
    id: doc.id,
    direction: doc.direction,
    docType: doc.docType,
    counterparty: doc.counterparty,
    docNumber: doc.docNumber,
    docDate: doc.docDate,
    totalAmount: doc.totalAmount,
    vatAmount: doc.vatAmount,
    netAmount: doc.netAmount,
    currency: doc.currency,
    reviewStatus: doc.reviewStatus,
    notes: doc.notes ? String(doc.notes).slice(0, 180) : '',
    duplicateSuspect: Boolean(doc.duplicateSuspect),
    fileName: doc.fileName,
  };
}

async function listDocuments(args) {
  const key = process.env.DOCS_API_KEY;
  if (!key) return { success: false, error: 'מאגר המסמכים לא מוגדר בשרת' };
  const result = await documentsHandler({
    httpMethod: 'POST',
    headers: { 'x-docs-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'list',
      direction: args.direction,
      reviewStatus: args.reviewStatus,
      monthKey: args.monthKey,
      year: args.year,
    }),
  });
  let parsed = {};
  try { parsed = result.body ? JSON.parse(result.body) : {}; } catch { parsed = { success: false, error: 'Invalid documents response' }; }
  if (result.statusCode >= 400 || parsed.success === false) return parsed;
  const limit = Math.min(Math.max(Number(args.limit) || 40, 1), 80);
  const documents = (parsed.documents || []).slice(0, limit).map(compactDocument);
  return {
    success: true,
    count: documents.length,
    needsReview: documents.filter(doc => doc.reviewStatus === 'needs_review').length,
    documents,
  };
}

async function handleMessage(msg, event) {
  const method = String(msg?.method || '');
  const id = msg?.id ?? null;
  const params = msg?.params || {};

  if (method === 'initialize') {
    const requested = String(params.protocolVersion || PROTOCOL);
    // Grok disconnects if the server answers with an older version than it asked for.
    const protocolVersion = /^\d{4}-\d{2}-\d{2}$/.test(requested)
      ? requested
      : (requested.startsWith('2024') ? FALLBACK_PROTOCOL : PROTOCOL);
    return rpcResult(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
    });
  }

  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null;
  }

  if (method === 'ping') {
    return rpcResult(id, {});
  }

  if (method === 'tools/list') {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method === 'tools/call') {
    const auth = authorize(event);
    if (!auth.ok) {
      return rpcResult(id, {
        isError: true,
        content: toolText({ success: false, error: auth.error }),
        _meta: { 'mcp/www_authenticate': [AUTH_CHALLENGE] },
      });
    }

    const name = String(params.name || '');
    const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};

    try {
      if (name === 'getCashflow') {
        const { statusCode, parsed } = await invokeApi(cashflowHandler, event.headers, {
          from: args.from,
          to: args.to,
          asOf: args.asOf,
          openingBalance: args.openingBalance,
        });
        const body = compactCashflow(parsed);
        return rpcResult(id, {
          isError: statusCode >= 400 || body.success === false,
          content: toolText(body),
        });
      }

      if (name === 'getCrmData') {
        const { statusCode, parsed } = await invokeApi(crmHandler, event.headers, {
          resource: args.resource || 'all',
          from: args.from,
          to: args.to,
          limit: args.limit != null ? String(args.limit) : '200',
        });
        return rpcResult(id, {
          isError: statusCode >= 400 || parsed.success === false,
          content: toolText(parsed),
        });
      }

      if (name === 'listDocuments') {
        const parsed = await listDocuments(args);
        return rpcResult(id, {
          isError: parsed.success === false,
          content: toolText(parsed),
        });
      }

      return rpcResult(id, {
        isError: true,
        content: toolText({ success: false, error: `Unknown tool: ${name}` }),
      });
    } catch (err) {
      logError('mcp.tools/call', err);
      return rpcResult(id, {
        isError: true,
        content: toolText({ success: false, error: 'Tool call failed' }),
      });
    }
  }

  if (isNotification(msg)) return null;
  return rpcError(id, -32601, `Method not found: ${method}`);
}

export const handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) {
    return { ...preflight, headers: { ...preflight.headers, ...MCP_HEADERS } };
  }

  if (event.httpMethod === 'DELETE') {
    return mcpJson(204, '');
  }

  if (event.httpMethod === 'GET') {
    return mcpJson(405, { success: false, error: 'Use POST JSON-RPC on /mcp' });
  }

  if (event.httpMethod !== 'POST') {
    return mcpJson(405, { success: false, error: 'Method not allowed' });
  }

  const auth = authorize(event);
  if (!auth.ok) {
    return mcpJson(auth.statusCode || 401, rpcError(null, -32001, auth.error || 'Unauthorized'), {
      'WWW-Authenticate': AUTH_CHALLENGE,
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return mcpJson(400, rpcError(null, -32700, 'Parse error'));
  }

  const messages = Array.isArray(payload) ? payload : [payload];
  const results = [];
  for (const msg of messages) {
    try {
      const out = await handleMessage(msg, event);
      if (out) results.push(out);
    } catch (err) {
      logError('mcp', err);
      results.push(rpcError(msg?.id ?? null, -32603, 'Internal error'));
    }
  }

  if (!results.length) {
    return { statusCode: 202, headers: MCP_HEADERS, body: '' };
  }

  const body = Array.isArray(payload) ? results : results[0];
  return mcpJson(200, body);
};
