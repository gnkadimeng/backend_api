// OpenAPI 3.0 specification for the CHIETA backend API.
// Served as interactive docs at /api-docs and as JSON at /openapi.json.
// Response schemas below are derived from the live API's actual responses.
const pkg = require('../package.json');

// ---- reusable path params ----
const emailParam = { name: 'email', in: 'path', required: true, schema: { type: 'string', format: 'email' }, example: 'company@example.com' };
const sdlNoParam = { name: 'sdlNo', in: 'path', required: true, schema: { type: 'string' }, example: 'L510798004' };
const appNoParam = { name: 'applicationNumber', in: 'path', required: true, schema: { type: 'string' }, example: 'MG2025-001' };

// ---- reusable responses ----
const errRef = { content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const R = {
  Unauthorized: { description: 'Missing or invalid token', ...errRef },
  Forbidden: { description: 'Token valid but not your resource', ...errRef },
  NotFound: { description: 'Not found', ...errRef },
  ServerError: { description: 'Server error', ...errRef },
};
// ok helpers: object($ref) / array($ref)
const okObj = (ref) => ({ description: 'OK', content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } });
const okArr = (ref) => ({ description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: `#/components/schemas/${ref}` } } } } });

// GET keyed by :email -> object
const emailObj = (tag, summary, ref) => ({ get: { tags: [tag], summary, parameters: [emailParam], responses: { 200: okObj(ref), 401: R.Unauthorized, 403: R.Forbidden, 404: R.NotFound, 500: R.ServerError } } });
// GET keyed by :email -> array
const emailArr = (tag, summary, ref) => ({ get: { tags: [tag], summary, parameters: [emailParam], responses: { 200: okArr(ref), 401: R.Unauthorized, 403: R.Forbidden, 500: R.ServerError } } });
const sdlObj = (tag, summary, ref) => ({ get: { tags: [tag], summary, parameters: [sdlNoParam], responses: { 200: okObj(ref), 401: R.Unauthorized, 404: R.NotFound, 500: R.ServerError } } });
const sdlArr = (tag, summary, ref) => ({ get: { tags: [tag], summary, parameters: [sdlNoParam], responses: { 200: okArr(ref), 401: R.Unauthorized, 500: R.ServerError } } });
const appObj = (tag, summary, ref) => ({ get: { tags: [tag], summary, parameters: [appNoParam], responses: { 200: okObj(ref), 401: R.Unauthorized, 404: R.NotFound, 500: R.ServerError } } });

const S = (props) => ({ type: 'object', properties: props });
const s = (t) => ({ type: t });

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'CHIETA Backend API',
    version: pkg.version || '1.0.0',
    description: [
      'REST API powering the CHIETA mobile application (grants, dashboards, documents).',
      '',
      '### Authentication',
      '1. `POST /login` with `{ email, password }` → returns a JWT `token`.',
      '2. Send it on every other request: `Authorization: Bearer <token>`.',
      '',
      'Email-keyed resources are **owner-scoped** — you may only read your own data',
      '(Administrators may read any). Public routes: `/health`, `/login`, these docs.',
    ].join('\n'),
  },
  servers: [
    { url: 'https://ssdd.chieta.org.za/mobile-api', description: 'Production (via VPN)' },
    { url: 'http://localhost:5000', description: 'Local' },
  ],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'System' }, { name: 'Auth' }, { name: 'Users' }, { name: 'Students' },
    { name: 'Documents' }, { name: 'GM Dashboard' }, { name: 'IM Dashboard' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: S({ error: s('string'), message: s('string') }),
      LoginRequest: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email', example: 'company@example.com' }, password: { type: 'string', example: 'secret' } } },
      User: S({ email: { type: 'string', format: 'email' }, accounttype: { type: 'string', example: 'Company' }, is_active: s('integer'), is_placed: s('integer') }),
      LoginResponse: S({
        message: { type: 'string', example: 'Login successful' },
        token: { type: 'string', description: 'JWT bearer token' },
        user: S({ email: { type: 'string', format: 'email' }, accounttype: s('string'), is_active: s('integer'), is_placed: s('integer'), organisation_name: s('string'), contract_number: s('string'), region: s('string'), programmes_afs: s('string') }),
      }),
      DocumentsStats: S({ total_documents: s('integer'), document_types: s('integer'), last_uploaded_at: { type: 'string', format: 'date-time', nullable: true } }),
      Document: S({ id: s('integer'), email: { type: 'string', format: 'email' }, document_type: s('string'), file_name: s('string'), file_format: s('string'), uploaded_at: { type: 'string', format: 'date-time' } }),
      Student: { type: 'object', description: 'Row from mobile_app_student_decision_outcome (all columns).', additionalProperties: true },
      SummaryStats: S({ totalfunding: s('string'), totallearners: s('string'), avgperlearner: s('string'), totalcontracts: s('string') }),
      ProgramBreakdown: S({ program: s('string'), count: s('string'), totalamount: s('string'), learners: s('string') }),
      Contract: S({ organisation_name: s('string'), contract_number: s('string'), short_contract_number: s('string'), programmes_afs: s('string'), amount_per_moa_gb_approvals: s('string'), number_of_learners_funded_per_moa: s('integer'), contract_start_date: s('string'), contract_end_date: s('string'), funding_window_name: s('string'), region: s('string'), cost_code: s('string'), dg_year: s('string'), cycle: s('string') }),
      ContractSummary: S({ organisation_name: s('string'), contract_number: s('string'), programmes_afs: s('string'), amount_per_moa_gb_approvals: s('string'), number_of_learners_funded_per_moa: s('integer'), contract_start_date: s('string'), contract_end_date: s('string') }),
      GmDashboard: S({
        summary: { $ref: '#/components/schemas/SummaryStats' },
        programBreakdown: { type: 'array', items: { $ref: '#/components/schemas/ProgramBreakdown' } },
        recentContracts: { type: 'array', items: { $ref: '#/components/schemas/Contract' } },
        userEmail: { type: 'string', format: 'email' },
      }),
      OrganisationProfile: S({ organisation_name: s('string'), contract_number: s('string'), region: s('string'), programmes_afs: s('string'), email: { type: 'string', format: 'email' }, contact_person: { type: 'string', nullable: true }, contact_number: { type: 'string', nullable: true }, physical_address: { type: 'string', nullable: true } }),
      OrganisationApplication: S({
        SDL_No: s('string'), Organisation_Name: s('string'), Trading_Name: s('string'), Organisation_Type: s('string'), Approval_Status: s('string'),
        dg_applications_count: s('string'), dg_total_funding: s('string'), dg_total_learners: s('string'), has_dg_applications: s('boolean'),
        mg_applications_count: s('string'), has_mg_applications: s('boolean'),
        wsp_approved_count: s('string'), wsp_pending_count: s('string'), wsp_rejected_count: s('string'),
        moa_approved_count: s('string'), moa_pending_count: s('string'), moa_rejected_count: s('string'),
        awards_approved_count: s('string'), awards_pending_count: s('string'), awards_rejected_count: s('string'),
        total_applications: s('string'),
      }),
      OrganisationDetail: S({ SDL_No: s('string'), Organisation_Name: s('string'), Trading_Name: s('string'), Organisation_Type: s('string'), Approval_Status: s('string'), email: { type: 'string', nullable: true }, Contact_Person: { type: 'string', nullable: true }, Contact_Number: { type: 'string', nullable: true }, province: s('string'), city: s('string'), address: s('string'), Date_Created: { type: 'string', nullable: true }, Last_Updated: { type: 'string', nullable: true } }),
      MgWindow: S({ id: s('integer'), title: { type: 'string', nullable: true }, startdate: { type: 'string', format: 'date-time' }, endDate: { type: 'string', format: 'date-time' }, extensionDate: { type: 'string', nullable: true } }),
      DgWindow: S({ id: s('integer'), title: s('string'), launchDte: { type: 'string', format: 'date-time' }, deadlineTime: { type: 'string', format: 'date-time' } }),
      Application: { type: 'object', description: 'Grant application detail (all columns from the application table).', additionalProperties: true },
      HealthStatus: S({ status: { type: 'string', example: 'OK' }, message: s('string'), timestamp: { type: 'string', format: 'date-time' }, version: s('string') }),
    },
  },
  paths: {
    '/health': { get: { tags: ['System'], summary: 'Service health check', security: [], responses: { 200: okObj('HealthStatus') } } },
    '/uploads-check': { get: { tags: ['System'], summary: 'Uploads directory status', security: [], responses: { 200: { description: 'OK' } } } },

    '/login': { post: { tags: ['Auth'], summary: 'Authenticate and get a JWT', security: [],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
      responses: { 200: okObj('LoginResponse'), 400: { description: 'Missing email or password', ...errRef }, 401: { description: 'Invalid credentials / inactive account', ...errRef } } } },

    '/user/{email}': emailObj('Users', 'Get a user by email', 'User'),
    '/students/{email}': emailArr('Students', 'Students / learner outcomes for a company', 'Student'),
    '/student-status/{email}': emailArr('Students', 'Student placement status', 'Student'),

    '/documents/{email}': emailArr('Documents', 'Uploaded documents', 'Document'),
    '/documents-stats/{email}': emailObj('Documents', 'Document upload statistics', 'DocumentsStats'),
    '/download/document/{filename}': { get: { tags: ['Documents'], summary: 'Download a stored file', parameters: [{ name: 'filename', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'File stream', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, 401: R.Unauthorized, 404: R.NotFound } } },
    '/download-document/{applicationNumber}/{documentType}': { get: { tags: ['Documents'], summary: 'Download an application document', parameters: [appNoParam, { name: 'documentType', in: 'path', required: true, schema: { type: 'string', enum: ['wsp', 'moa', 'awards_letter', 'application_form', 'proposal'] } }], responses: { 200: { description: 'File stream', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, 400: { description: 'Invalid document type', ...errRef }, 401: R.Unauthorized, 404: R.NotFound } } },

    '/summary-stats/{email}': emailObj('GM Dashboard', 'Funding summary statistics', 'SummaryStats'),
    '/program-breakdown/{email}': emailArr('GM Dashboard', 'Funding by programme', 'ProgramBreakdown'),
    '/contract-details/{email}': emailArr('GM Dashboard', 'Contract details', 'Contract'),
    '/gm-dashboard/{email}': emailObj('GM Dashboard', 'Full GM dashboard payload', 'GmDashboard'),
    '/organisation-profile/{email}': emailObj('GM Dashboard', 'Organisation profile (joined contact info)', 'OrganisationProfile'),

    '/mg-status': { get: { tags: ['IM Dashboard'], summary: 'Mandatory grant windows', responses: { 200: okArr('MgWindow'), 401: R.Unauthorized } } },
    '/dg-status': { get: { tags: ['IM Dashboard'], summary: 'Discretionary grant windows', responses: { 200: okArr('DgWindow'), 401: R.Unauthorized } } },
    '/organisation-applications/{email}': emailArr('IM Dashboard', 'Applications summary per organisation', 'OrganisationApplication'),
    '/organisation-contracts': { get: { tags: ['IM Dashboard'], summary: 'All organisation contracts (legacy)', responses: { 200: okArr('ContractSummary'), 401: R.Unauthorized } } },
    '/organisation-detail/{sdlNo}': sdlObj('IM Dashboard', 'Organisation detail by SDL number', 'OrganisationDetail'),
    '/mg-applications-details/{sdlNo}': sdlArr('IM Dashboard', 'MG applications for an SDL', 'Application'),
    '/dg-applications-details/{sdlNo}': sdlArr('IM Dashboard', 'DG applications for an SDL', 'Application'),
    '/mg-application-detail/{applicationNumber}': appObj('IM Dashboard', 'Single MG application', 'Application'),
    '/dg-application-detail/{applicationNumber}': appObj('IM Dashboard', 'Single DG application', 'Application'),
  },
};
