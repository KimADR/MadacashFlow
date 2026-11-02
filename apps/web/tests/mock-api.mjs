import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.API_TEST_PORT ?? 3211);
const csrfToken = 'playwright-csrf-token';
const sessionToken = 'playwright-session-token';
const client = {
  id: '00000000-0000-4000-8000-000000000001',
  reference: 'CLIENT-DEMO',
  name: 'Client de démonstration',
};
const tenant = {
  tenantId: '00000000-0000-4000-8000-000000000002',
  tenantName: 'Entreprise de démonstration',
  role: 'FINANCE',
};

function resetState() {
  return {
    invoices: [
      {
        id: '00000000-0000-4000-8000-000000000003',
        number: 'FAC-DEMO-001',
        issueDate: '2026-10-01',
        dueDate: '2026-11-15',
        amountAr: '3000000',
        remainingAr: '3000000',
        status: 'ACTIVE',
        client,
      },
    ],
    payments: [],
    collectionEvents: [],
    collection: {
      id: '00000000-0000-4000-8000-000000000003',
      number: 'FAC-DEMO-001',
      dueDate: '2026-11-15',
      amountAr: '3000000',
      remainingAr: '3000000',
      client,
      dispute: null,
      promise: null,
      latestEventType: null,
    },
  };
}

let state = resetState();

function json(response, status, value, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function page(items, total = items.length) {
  return { items, pagination: { page: 1, pages: total ? 1 : 0, total } };
}

function summary() {
  return {
    totalOpenAr: state.invoices
      .reduce((sum, invoice) => sum + BigInt(invoice.remainingAr), 0n)
      .toString(),
    invoiceCount: state.invoices.length,
    dueNext7DaysAr: '0',
    dueNext7DaysCount: 0,
    buckets: {
      current: { amountAr: '3000000', count: 1 },
      days1To30: { amountAr: '0', count: 0 },
      days31To60: { amountAr: '0', count: 0 },
      days61To90: { amountAr: '0', count: 0 },
      over90: { amountAr: '0', count: 0 },
    },
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  const path = url.pathname.replace(/^\/api\/v1/, '');
  const isAuthenticated = (request.headers.cookie ?? '').includes(
    `madacash_session=${sessionToken}`,
  );
  const bodyText =
    request.method === 'POST' &&
    !request.headers['content-type']?.startsWith('multipart/form-data')
      ? await readBody(request)
      : '';
  const body = bodyText ? JSON.parse(bodyText) : {};

  if (path === '/health' && request.method === 'GET') {
    json(response, 200, { status: 'ok' });
    return;
  }
  if (path === '/__test/reset' && request.method === 'POST') {
    state = resetState();
    json(response, 200, { status: 'reset' });
    return;
  }
  if (path === '/auth/csrf' && request.method === 'GET') {
    json(response, 200, { csrfToken }, {
      'Set-Cookie': `madacash_csrf=${csrfToken}; Path=/; SameSite=Strict`,
    });
    return;
  }
  if (path === '/auth/login' && request.method === 'POST') {
    json(response, 200, {
      user: { id: '00000000-0000-4000-8000-000000000004', email: body.email },
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      memberships: [tenant],
    });
    return;
  }
  if (path === '/auth/tenant' && request.method === 'POST') {
    json(response, 201, { tenant }, {
      'Set-Cookie': `madacash_session=${sessionToken}; Path=/; HttpOnly; SameSite=Strict`,
    });
    return;
  }
  if (path === '/auth/me' && request.method === 'GET') {
    if (!isAuthenticated) {
      json(response, 401, { message: 'Session requise.' });
      return;
    }
    json(response, 200, {
      user: { id: '00000000-0000-4000-8000-000000000004', email: 'finance@example.test' },
      tenantId: tenant.tenantId,
      role: tenant.role,
      tenant: { id: tenant.tenantId, name: tenant.tenantName },
      memberships: [tenant],
    });
    return;
  }
  if (!isAuthenticated) {
    json(response, 401, { message: 'Session requise.' });
    return;
  }

  if (path === '/clients' && request.method === 'GET') {
    json(response, 200, page([client]));
    return;
  }
  if (path === '/invoices/summary' && request.method === 'GET') {
    json(response, 200, summary());
    return;
  }
  if (path === '/invoices' && request.method === 'GET') {
    const items = state.invoices.filter((invoice) => invoice.status === 'ACTIVE');
    json(response, 200, page(items));
    return;
  }
  if (path === '/forecast/opening-balance' && request.method === 'GET') {
    json(response, 200, { openingBalance: null });
    return;
  }
  if (path === '/forecast/expenses' && request.method === 'GET') {
    json(response, 200, page([]));
    return;
  }
  if (path === '/payments' && request.method === 'GET') {
    json(response, 200, page(state.payments));
    return;
  }
  if (path === '/collections' && request.method === 'GET') {
    json(
      response,
      200,
      page(state.collection.remainingAr === '0' ? [] : [state.collection]),
    );
    return;
  }
  if (path === '/imports/invoices/preview' && request.method === 'POST') {
    json(response, 201, {
      previewId: 'preview-demo',
      validCount: 1,
      rejectedCount: 0,
      rows: [
        {
          row: 2,
          clientReference: client.reference,
          clientName: client.name,
          number: 'FAC-IMPORT-001',
          issueDate: '2026-10-01',
          dueDate: '2026-11-15',
          amountAr: '1250000',
        },
      ],
      rejectedRows: [],
    });
    return;
  }
  if (path === '/imports/invoices/commit' && request.method === 'POST') {
    state.invoices.push({
      id: randomUUID(),
      number: 'FAC-IMPORT-001',
      issueDate: '2026-10-01',
      dueDate: '2026-11-15',
      amountAr: '1250000',
      remainingAr: '1250000',
      status: 'ACTIVE',
      client,
    });
    json(response, 201, {
      createdCount: 1,
      rejectedCount: 0,
      rejectedRows: [],
      idempotent: false,
    });
    return;
  }
  if (path === '/payments' && request.method === 'POST') {
    const payment = {
      id: randomUUID(),
      clientId: body.clientId,
      amountAr: String(body.amountAr),
      receivedAt: body.receivedAt,
      method: body.method,
      reference: body.reference || null,
      status: 'PENDING',
      allocatedAr: '0',
      unallocatedAr: String(body.amountAr),
      client,
      allocations: [],
    };
    state.payments.unshift(payment);
    json(response, 201, payment);
    return;
  }
  const paymentConfirm = path.match(/^\/payments\/([^/]+)\/confirm$/);
  if (paymentConfirm && request.method === 'POST') {
    const payment = state.payments.find((item) => item.id === paymentConfirm[1]);
    if (!payment) {
      json(response, 404, { message: 'Paiement introuvable.' });
      return;
    }
    payment.status = 'CONFIRMED';
    json(response, 201, { id: payment.id, status: payment.status });
    return;
  }
  const paymentAllocation = path.match(/^\/payments\/([^/]+)\/allocations$/);
  if (paymentAllocation && request.method === 'POST') {
    const payment = state.payments.find((item) => item.id === paymentAllocation[1]);
    const invoice = state.invoices.find((item) => item.id === body.invoiceId);
    if (!payment || !invoice || BigInt(body.amountAr) > BigInt(invoice.remainingAr)) {
      json(response, 409, { message: 'Affectation impossible.' });
      return;
    }
    invoice.remainingAr = (BigInt(invoice.remainingAr) - BigInt(body.amountAr)).toString();
    payment.allocatedAr = String(body.amountAr);
    payment.unallocatedAr = (BigInt(payment.amountAr) - BigInt(body.amountAr)).toString();
    payment.allocations.push({
      id: randomUUID(),
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amountAr: String(body.amountAr),
    });
    state.collection.remainingAr = invoice.remainingAr;
    json(response, 201, {
      id: randomUUID(),
      paymentId: payment.id,
      invoiceId: invoice.id,
      amountAr: String(body.amountAr),
    });
    return;
  }
  const collectionEvent = path.match(
    /^\/collections\/invoices\/([^/]+)\/(promises|disputes)$/,
  );
  if (collectionEvent && request.method === 'POST') {
    if (collectionEvent[2] === 'promises') {
      state.collection.promise = {
        promisedDate: body.promisedDate,
        amountAr: body.amountAr,
      };
      state.collection.latestEventType = 'PROMISE_RECORDED';
    } else {
      state.collection.dispute = {
        openedAt: new Date().toISOString(),
        reason: body.reason,
      };
      state.collection.latestEventType = 'DISPUTE_OPENED';
    }
    state.collectionEvents.push({
      id: randomUUID(),
      ...body,
      type: collectionEvent[2] === 'promises' ? 'PROMISE_RECORDED' : 'DISPUTE_OPENED',
      createdAt: new Date().toISOString(),
      user: { email: 'finance@example.test' },
    });
    json(response, 201, { status: 'ok' });
    return;
  }
  json(response, 404, { message: `Mock endpoint not found: ${request.method} ${path}` });
});

server.listen(port, '127.0.0.1');
