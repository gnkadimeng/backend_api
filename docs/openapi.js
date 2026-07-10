// OpenAPI 3.0 specification for the CHIETA backend API.
// Served as interactive docs at /api-docs and as JSON at /openapi.json.
const pkg = require('../package.json');

// Reusable path parameters
const emailParam = {
  name: 'email', in: 'path', required: true,
  schema: { type: 'string', format: 'email' },
  example: 'test@chieta.test',
};
const sdlNoParam = {
  name: 'sdlNo', in: 'path', required: true,
  schema: { type: 'string' }, example: 'L000000001',
};
const applicationNumberParam = {
  name: 'applicationNumber', in: 'path', required: true,
  schema: { type: 'string' }, example: 'MG2024-0001',
};

// Common responses
const NotFound = { description: 'Resource not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const ServerError = { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const okArray = { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } };
const okObject = { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } };

// Helper: a GET endpoint keyed by :email
const byEmail = (tag, summary) => ({
  get: { tags: [tag], summary, parameters: [emailParam], responses: { 200: okObject, 404: NotFound, 500: ServerError } },
});
const bySdl = (tag, summary) => ({
  get: { tags: [tag], summary, parameters: [sdlNoParam], responses: { 200: okObject, 404: NotFound, 500: ServerError } },
});
const byApp = (tag, summary) => ({
  get: { tags: [tag], summary, parameters: [applicationNumberParam], responses: { 200: okObject, 404: NotFound, 500: ServerError } },
});

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'CHIETA Backend API',
    version: pkg.version || '1.0.0',
    description: [
      'REST API powering the CHIETA mobile application (grants, dashboards, documents).',
      '',
      '> **Security note:** these endpoints currently require **no authentication** — any',
      "> caller can read a user's data by supplying their email/SDL in the path. This is a",
      '> known gap (broken access control / IDOR) tracked for remediation; the docs',
      '> describe current behaviour, not the target security model.',
    ].join('\n'),
  },
  servers: [
    { url: 'http://localhost:5000', description: 'Local' },
    { url: '/', description: 'Same origin' },
  ],
  tags: [
    { name: 'System' }, { name: 'Auth' }, { name: 'Users' }, { name: 'Students' },
    { name: 'Documents' }, { name: 'GM Dashboard' }, { name: 'IM Dashboard' },
  ],
  components: {
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } } },
      LoginRequest: {
        type: 'object', required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email', example: 'test@chieta.test' }, password: { type: 'string', example: 'Test1234!' } },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Login successful' },
          user: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              accounttype: { type: 'string', example: 'Company' },
              is_active: { type: 'integer', example: 0 },
              is_placed: { type: 'integer', example: 0 },
            },
          },
        },
      },
      DocumentsStats: {
        type: 'object',
        properties: { total_documents: { type: 'integer' }, document_types: { type: 'integer' }, last_uploaded_at: { type: 'string', format: 'date-time', nullable: true } },
      },
    },
  },
  paths: {
    '/health': { get: { tags: ['System'], summary: 'Service health check', responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'OK' } } } } } } } } },
    '/uploads-check': { get: { tags: ['System'], summary: 'Uploads directory status', responses: { 200: okObject } } },

    '/login': {
      post: {
        tags: ['Auth'], summary: 'Authenticate a user',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: {
          200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
          400: { description: 'Missing email or password', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Invalid credentials or inactive account', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/user/{email}': byEmail('Users', 'Get a user by email'),
    '/students/{email}': byEmail('Students', 'List students for a company'),
    '/student-status/{email}': byEmail('Students', 'Student placement/status summary'),

    '/documents/{email}': byEmail('Documents', 'List uploaded documents'),
    '/documents-stats/{email}': {
      get: { tags: ['Documents'], summary: 'Document upload statistics', parameters: [emailParam], responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/DocumentsStats' } } } }, 500: ServerError } },
    },
    '/download/document/{filename}': {
      get: { tags: ['Documents'], summary: 'Download a stored file by name', parameters: [{ name: 'filename', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'File stream' }, 404: NotFound } },
    },
    '/download-document/{applicationNumber}/{documentType}': {
      get: {
        tags: ['Documents'], summary: 'Download an application document',
        parameters: [applicationNumberParam, { name: 'documentType', in: 'path', required: true, schema: { type: 'string', enum: ['wsp', 'moa', 'awards_letter', 'application_form', 'proposal'] } }],
        responses: { 200: { description: 'File stream' }, 400: { description: 'Invalid document type', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }, 404: NotFound },
      },
    },

    '/summary-stats/{email}': byEmail('GM Dashboard', 'GM summary statistics'),
    '/program-breakdown/{email}': byEmail('GM Dashboard', 'Program breakdown'),
    '/contract-details/{email}': byEmail('GM Dashboard', 'Contract details'),
    '/gm-dashboard/{email}': byEmail('GM Dashboard', 'GM dashboard payload'),
    '/organisation-profile/{email}': byEmail('GM Dashboard', 'Organisation profile (joins contact info)'),

    '/mg-status': { get: { tags: ['IM Dashboard'], summary: 'Mandatory grant windows', responses: { 200: okArray } } },
    '/dg-status': { get: { tags: ['IM Dashboard'], summary: 'Discretionary grant windows', responses: { 200: okArray } } },
    '/organisation-applications/{email}': byEmail('IM Dashboard', 'Organisation applications'),
    '/organisation-contracts': { get: { tags: ['IM Dashboard'], summary: 'All organisation contracts (legacy)', responses: { 200: okArray } } },
    '/organisation-detail/{sdlNo}': bySdl('IM Dashboard', 'Organisation detail by SDL number'),
    '/mg-applications-details/{sdlNo}': bySdl('IM Dashboard', 'MG application details by SDL'),
    '/dg-applications-details/{sdlNo}': bySdl('IM Dashboard', 'DG application details by SDL'),
    '/mg-application-detail/{applicationNumber}': byApp('IM Dashboard', 'Single MG application'),
    '/dg-application-detail/{applicationNumber}': byApp('IM Dashboard', 'Single DG application'),
  },
};
