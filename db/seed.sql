-- Synthetic, NON-PII seed data for CI / local testing only.
-- No real credentials or personal information. Safe to commit.

INSERT INTO mobile_app_login
  (surname, email, password, accounttype, accountstatus, personalinforentered, is_active, is_placed)
VALUES
  ('Tester', 'test@chieta.test',  'Test1234!',  'Company',       TRUE, TRUE, 1, 0),
  ('Admin',  'admin@chieta.test', 'Admin1234!', 'Administrator', TRUE, TRUE, 1, 0),
  ('Off',    'inactive@chieta.test','x',         'Company',       FALSE, TRUE, 0, 0);

INSERT INTO mobile_app_organisation
  (sdlno, organisationname, tradingname, organisationtype, applicationstatus, email,
   seniororganisationrepresntivefirstname, seniororganisationrepresntivesurname,
   organisationtellno, province, municipality, physicaladdress1)
VALUES
  ('L000000001', 'Acme Test (Pty) Ltd', 'Acme', 'Independent', 'Submitted', 'test@chieta.test',
   'Jane', 'Doe', '0110000000', 'Gauteng', 'Johannesburg', '1 Test Street');

INSERT INTO mobile_app_dg_master
  (email, organisation_name, contract_number, short_contract_number, region, programmes_afs, dg_year, cycle)
VALUES
  ('test@chieta.test', 'Acme Test (Pty) Ltd', 'DG2024/25-0001', '0001', 'Gauteng', 'Learnerships Grant', 2024, '1');

INSERT INTO mobile_app_uploaded_documents
  (email, document_type, file_name, file_format, uploaded_at)
VALUES
  ('test@chieta.test', 'wsp', 'wsp.pdf', 'pdf', NOW()),
  ('test@chieta.test', 'moa', 'moa.pdf', 'pdf', NOW());

INSERT INTO mobile_app_mandatory_grant_window (id, mg_window, startdate, enddate, activeyn)
VALUES (1, 'MG 2024/25', '2024-04-01', '2025-03-31', 'Y');

INSERT INTO mobile_app_discretionary_grant_window (id, title, description, launchdte, deadlinetime, activeyn)
VALUES (1, 'DG Cycle 1', 'Discretionary Grant Cycle 1', '2024-04-01', '2024-12-31', 'Y');
