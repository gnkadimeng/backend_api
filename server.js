const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
require('dotenv').config();


const app = express();
const port = 5000;

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// PostgreSQL Connection - Single Database Connection
const pgPool = new Pool({
  user: process.env.DB_USER_NAME,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: process.env.DB_SSLMODE ? { rejectUnauthorized: false } : false, // Essential for Render
});

// ==================== HEALTH CHECK ENDPOINT ====================
app.get("/health", (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'CHIETA Backend is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ==================== SSDD ENDPOINTS (Student/SSDD Screen) ====================

// Fetch student data based on email
app.get("/students/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pgPool.query(
      "SELECT * FROM mobile_app_student_decision_outcome WHERE email = $1", 
      [email]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({ error: "Failed to fetch student data" });
  }
});

// Fetch student status based on email
app.get("/student-status/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pgPool.query(
      "SELECT * FROM mobile_app_company_decision_outcome WHERE email = $1", 
      [email]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching student status:", error);
    res.status(500).json({ error: "Failed to fetch student status" });
  }
});

// Fetch documents based on email
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/documents/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pgPool.query(
      "SELECT * FROM mobile_app_uploaded_documents WHERE email = $1", 
      [email]
    );
    
    const documentsWithUrls = result.rows.map((doc) => {
      const filePath = path.join(__dirname, "uploads", doc.file_name);
      const fileExists = fs.existsSync(filePath);
      return {
        ...doc,
        file_url: fileExists ? `http://localhost:${port}/uploads/${doc.file_name}` : null,
      };
    });

    res.json(documentsWithUrls);
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

// ==================== SINGLE LOGIN ENDPOINT ====================

// Universal Login for Students & Companies
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    // Query to check all user types in one go
    const query = `
      SELECT 
        email, 
        accounttype, 
        is_active, 
        is_placed,
        password
      FROM mobile_app_login
      WHERE email = $1 AND password = $2
        AND accountstatus = TRUE
      LIMIT 1
    `;
    
    const { rows } = await pgPool.query(query, [email, password]);
    
    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials or account not active" });
    }

    const user = rows[0];
    let additionalData = {};

    // Get additional data based on account type
    if (user.accounttype === 'Company') {
      // Get organization details for Company users
      const orgQuery = `
        SELECT 
          organisation_name,
          contract_number,
          region,
          programmes_afs
        FROM mobile_app_dg_master 
        WHERE email = $1
        LIMIT 1
      `;
      const orgResult = await pgPool.query(orgQuery, [email]);
      if (orgResult.rows.length > 0) {
        additionalData = {
          organisation_name: orgResult.rows[0].organisation_name,
          contract_number: orgResult.rows[0].contract_number,
          region: orgResult.rows[0].region,
          programmes_afs: orgResult.rows[0].programmes_afs
        };
      }
    }

    // Prepare response based on account type
    const response = {
      message: "Login successful",
      user: {
        email: user.email,
        accounttype: user.accounttype,
        is_active: user.is_active,
        is_placed: user.is_placed,
        ...additionalData
      },
    };

    res.json(response);
    
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error during login" });
  }
});

// ==================== GM DASHBOARD ENDPOINTS ====================

// Get GM Dashboard Summary Stats by Email
app.get("/summary-stats/:email", async (req, res) => {
  const { email } = req.params;
  
  try {
    const result = await pgPool.query(`
      SELECT 
        COALESCE(SUM(amount_per_moa_gb_approvals), 0) AS totalFunding,
        COALESCE(SUM(number_of_learners_funded_per_moa), 0) AS totalLearners,
        CASE 
          WHEN SUM(number_of_learners_funded_per_moa) > 0 
          THEN SUM(amount_per_moa_gb_approvals) / SUM(number_of_learners_funded_per_moa)
          ELSE 0
        END AS avgPerLearner,
        COUNT(*) AS totalContracts
      FROM mobile_app_dg_master
      WHERE email = $1 
    `, [email]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to fetch summary stats" });
  }
});

// Get GM Program Breakdown by Email
app.get("/program-breakdown/:email", async (req, res) => {
  const { email } = req.params;
  
  try {
    const result = await pgPool.query(`
      SELECT 
        programmes_afs AS program,
        COUNT(*) AS count,
        COALESCE(SUM(amount_per_moa_gb_approvals), 0) AS totalAmount,
        COALESCE(SUM(number_of_learners_funded_per_moa), 0) AS learners
      FROM mobile_app_dg_master
      WHERE email = $1 
      GROUP BY programmes_afs
      ORDER BY totalAmount DESC
    `, [email]);
    
    res.json(result.rows);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to fetch program breakdown" });
  }
});

// Get GM Contract Details by Email
app.get("/contract-details/:email", async (req, res) => {
  const { email } = req.params;
  
  try {
    const result = await pgPool.query(`
  SELECT organisation_name   
        contract_number,
        short_contract_number,
        organisation_name,
        programmes_afs,
        amount_per_moa_gb_approvals,
        number_of_learners_funded_per_moa,
        contract_start_date,
        contract_end_date,
        funding_window_name,
        region,
        cost_code,
        dg_year,
        cycle
      FROM mobile_app_dg_master
      WHERE email = $1
      ORDER BY contract_start_date DESC

    `, [email]);
    
    res.json(result.rows);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to fetch contract details" });
  }
});

// Get all GM Dashboard data in one endpoint by Email
app.get("/gm-dashboard/:email", async (req, res) => {
  const { email } = req.params;
  
  try {
    // Get summary stats
    const summaryStats = await pgPool.query(`
      SELECT 
        COALESCE(SUM(amount_per_moa_gb_approvals), 0) AS totalFunding,
        COALESCE(SUM(number_of_learners_funded_per_moa), 0) AS totalLearners,
        CASE 
          WHEN SUM(number_of_learners_funded_per_moa) > 0 
          THEN SUM(amount_per_moa_gb_approvals) / SUM(number_of_learners_funded_per_moa)
          ELSE 0
        END AS avgPerLearner,
        COUNT(*) AS totalContracts
      FROM mobile_app_dg_master
      WHERE organisation_email = $1 OR contact_person_email = $1
    `, [email]);
    
    // Get program breakdown
    const programBreakdown = await pgPool.query(`
      SELECT 
        programmes_afs AS program,
        COUNT(*) AS count,
        COALESCE(SUM(amount_per_moa_gb_approvals), 0) AS totalAmount,
        COALESCE(SUM(number_of_learners_funded_per_moa), 0) AS learners
      FROM mobile_app_dg_master
      WHERE email = $1 
      GROUP BY programmes_afs
      ORDER BY totalAmount DESC
    `, [email]);
    
    // Get contracts by status
    const contractsByStatus = await pgPool.query(`
    SELECT 
        COUNT(*) AS count,
        COALESCE(SUM(amount_per_moa_gb_approvals), 0) AS total_amount
      FROM mobile_app_dg_master
      WHERE email = $1
   
      ORDER BY count DESC
    `, [email]);
    
    // Get recent contracts
    const recentContracts = await pgPool.query(`
      SELECT 
        contract_number,
        organisation_name,
        programmes_afs,
        contract_start_date
      FROM mobile_app_dg_master
      WHERE email = $1 
      ORDER BY contract_start_date DESC
      LIMIT 5
    `, [email]);
    
    res.json({
      summary: summaryStats.rows[0],
      programBreakdown: programBreakdown.rows,
      contractsByStatus: contractsByStatus.rows,
      recentContracts: recentContracts.rows,
      userEmail: email
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to fetch GM dashboard data" });
  }
});



// ==================== IM DASHBOARD ENDPOINTS ====================

// Get Mandatory Grant Status for IM Dashboard
app.get("/mg-status", async (req, res) => {
  try {
    const result = await pgPool.query(`
      SELECT 
        id,
        mg_window AS title,
        startdate,
        enddate AS "endDate",
        extensiondate AS "extensionDate"
      FROM mobile_app_mandatory_grant_window
      ORDER BY startdate DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to fetch mandatory grant status" });
  }
});

// Get Discretionary Grant Status for IM Dashboard
app.get("/dg-status", async (req, res) => {
  try {
    const result = await pgPool.query(`
      SELECT 
        id,
        title,
        launchdte AS "launchDte",
        deadlinetime AS "deadlineTime"
      FROM mobile_app_discretionary_grant_window
      ORDER BY launchdte DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to fetch discretionary grant status" });
  }
});
// check organization applications with document status and download links
app.get("/organisation-applications/:email", async (req, res) => {
  const { email } = req.params;
  
  try {
    const orgResult = await pgPool.query(`
      SELECT 
        o.sdlno AS "SDL_No",
        o.organisationname AS "Organisation_Name",
        o.tradingname AS "Trading_Name",
        o.organisationtype AS "Organisation_Type",
        o.applicationstatus AS "Approval_Status",
        
        -- DG Application Stats (using the new dg_applications table)
        COUNT(DISTINCT dg.id) AS dg_applications_count,
        COALESCE(SUM(dg.total_funding_amount), 0) AS dg_total_funding,
        COALESCE(SUM(dg.number_of_learners), 0) AS dg_total_learners,
        BOOL_OR(dg.id IS NOT NULL) AS has_dg_applications,
        
        -- DG Document status counts
        COUNT(DISTINCT CASE WHEN dg.application_form_status = 'approved' THEN dg.id END) AS dg_app_form_approved_count,
        COUNT(DISTINCT CASE WHEN dg.proposal_status = 'approved' THEN dg.id END) AS dg_proposal_approved_count,
        COUNT(DISTINCT CASE WHEN dg.moa_status = 'approved' THEN dg.id END) AS dg_moa_approved_count,
        COUNT(DISTINCT CASE WHEN dg.awards_letter_status = 'approved' THEN dg.id END) AS dg_awards_approved_count,
        
        -- MG Application Stats with document status
        COUNT(DISTINCT mg.id) AS mg_applications_count,
        BOOL_OR(mg.id IS NOT NULL) AS has_mg_applications,
        
        -- MG Document status counts
        COUNT(DISTINCT CASE WHEN mg.wsp_approval_status = 'approved' THEN mg.id END) AS wsp_approved_count,
        COUNT(DISTINCT CASE WHEN mg.wsp_approval_status = 'pending' THEN mg.id END) AS wsp_pending_count,
        COUNT(DISTINCT CASE WHEN mg.wsp_approval_status = 'rejected' THEN mg.id END) AS wsp_rejected_count,
        
        COUNT(DISTINCT CASE WHEN mg.moa_status = 'approved' THEN mg.id END) AS moa_approved_count,
        COUNT(DISTINCT CASE WHEN mg.moa_status = 'pending' THEN mg.id END) AS moa_pending_count,
        COUNT(DISTINCT CASE WHEN mg.moa_status = 'rejected' THEN mg.id END) AS moa_rejected_count,
        
        COUNT(DISTINCT CASE WHEN mg.awards_letter_status = 'approved' THEN mg.id END) AS awards_approved_count,
        COUNT(DISTINCT CASE WHEN mg.awards_letter_status = 'pending' THEN mg.id END) AS awards_pending_count,
        COUNT(DISTINCT CASE WHEN mg.awards_letter_status = 'rejected' THEN mg.id END) AS awards_rejected_count,
        
        -- Overall stats
        (COUNT(DISTINCT dg.id) + COUNT(DISTINCT mg.id)) AS total_applications
        
      FROM mobile_app_organisation o
      LEFT JOIN mobile_app_dg_applications dg ON o.sdlno = dg.sdl_no
      LEFT JOIN mobile_app_mg_applications mg ON o.sdlno = mg.sdl_no
      WHERE o.email = $1
      GROUP BY 
        o.sdlno, o.organisationname, o.tradingname, 
        o.organisationtype, o.applicationstatus
      ORDER BY o.organisationname
    `, [email]);
    
    res.json(orgResult.rows);
  } catch (error) {
    console.error("Error fetching organisation applications:", error);
    res.status(500).json({ error: "Failed to fetch organisation applications" });
  }
});

// get detailed MG applications with documents
app.get("/mg-applications-details/:sdlNo", async (req, res) => {
  const { sdlNo } = req.params;
  
  try {
    const mgResult = await pgPool.query(`
      SELECT 
        id,
        application_number AS "Application_Number",
        application_title AS "Application_Title",
        application_description AS "Application_Description",
        submission_date AS "Submission_Date",
        status,
        
        -- WSP Document details
        wsp_file_path AS "WSP_File_Path",
        wsp_approval_status AS "WSP_Approval_Status",
        wsp_submission_date AS "WSP_Submission_Date",
        
        -- MOA Document details
        moa_file_path AS "MOA_File_Path",
        moa_status AS "MOA_Status",
        moa_submission_date AS "MOA_Submission_Date",
        
        -- Awards Letter details
        awards_letter_file_path AS "Awards_Letter_File_Path",
        awards_letter_status AS "Awards_Letter_Status",
        awards_letter_date AS "Awards_Letter_Date",
        
        -- Additional info
        organisation_name AS "Organisation_Name",
        datecreated AS "Date_Created"
        
      FROM mobile_app_mg_applications 
      WHERE sdl_no = $1 
      ORDER BY submission_date DESC
    `, [sdlNo]);
    
    res.json(mgResult.rows);
  } catch (error) {
    console.error("Error fetching MG application details:", error);
    res.status(500).json({ error: "Failed to fetch MG application details" });
  }
});

// New endpoint to get detailed DG applications with documents
app.get("/dg-applications-details/:sdlNo", async (req, res) => {
  const { sdlNo } = req.params;
  
  try {
    const dgResult = await pgPool.query(`
      SELECT 
        id,
        application_number AS "Application_Number",
        application_title AS "Application_Title",
        application_description AS "Application_Description",
        submission_date AS "Submission_Date",
        status,
        
        -- Project Details
        project_title AS "Project_Title",
        project_description AS "Project_Description",
        project_start_date AS "Project_Start_Date",
        project_end_date AS "Project_End_Date",
        number_of_learners AS "Number_Of_Learners",
        total_funding_amount AS "Total_Funding_Amount",
        
        -- Application Form
        application_form_path AS "Application_Form_Path",
        application_form_status AS "Application_Form_Status",
        application_form_submission_date AS "Application_Form_Submission_Date",
        
        -- Proposal Document
        proposal_document_path AS "Proposal_Document_Path",
        proposal_status AS "Proposal_Status",
        proposal_submission_date AS "Proposal_Submission_Date",
        
        -- MOA Document
        moa_file_path AS "MOA_File_Path",
        moa_status AS "MOA_Status",
        moa_submission_date AS "MOA_Submission_Date",
        
        -- Awards Letter
        awards_letter_file_path AS "Awards_Letter_File_Path",
        awards_letter_status AS "Awards_Letter_Status",
        awards_letter_date AS "Awards_Letter_Date",
        
        -- Contract Details
        contract_number AS "Contract_Number",
        contract_status AS "Contract_Status",
        
        -- Additional info
        organisation_name AS "Organisation_Name",
        datecreated AS "Date_Created"
        
      FROM mobile_app_dg_applications 
      WHERE sdl_no = $1 
      ORDER BY submission_date DESC
    `, [sdlNo]);
    
    res.json(dgResult.rows);
  } catch (error) {
    console.error("Error fetching DG application details:", error);
    res.status(500).json({ error: "Failed to fetch DG application details" });
  }
});

// Enhanced document download endpoint for both MG and DG
app.get("/download-document/:applicationNumber/:documentType", async (req, res) => {
  const { applicationNumber, documentType } = req.params;
  
  try {
    // Validate document type
    const validDocumentTypes = ['wsp', 'moa', 'awards_letter', 'application_form', 'proposal'];
    if (!validDocumentTypes.includes(documentType)) {
      return res.status(400).json({ error: "Invalid document type" });
    }
    
    // Determine which table to query based on application number prefix
    const table = applicationNumber.startsWith('MG') ? 'mobile_app_mg_applications' : 'mobile_app_dg_applications';
    
    // Map document types to column names
    const documentColumnMap = {
      'wsp': 'wsp_file_path',
      'moa': 'moa_file_path',
      'awards_letter': 'awards_letter_file_path',
      'application_form': 'application_form_path',
      'proposal': 'proposal_document_path'
    };
    
    const columnName = documentColumnMap[documentType];
    
    const result = await pgPool.query(`
      SELECT 
        ${columnName} as file_path,
        application_title,
        organisation_name,
        application_number
      FROM ${table} 
      WHERE application_number = $1
    `, [applicationNumber]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Application not found" });
    }
    
    const application = result.rows[0];
    
    if (!application.file_path) {
      return res.status(404).json({ error: "Document not available" });
    }
    
    res.json({
      success: true,
      message: "Document download ready",
      documentType: documentType.toUpperCase(),
      applicationNumber: application.application_number,
      applicationTitle: application.application_title,
      organisationName: application.organisation_name,
      filePath: application.file_path,
      downloadUrl: `/api/documents/${applicationNumber}/${documentType}`
    });
    
  } catch (error) {
    console.error("Error preparing document download:", error);
    res.status(500).json({ error: "Failed to prepare document download" });
  }
});

// ==================== DOCUMENTS ENDPOINTS ====================

app.get("/documents-stats/:email", async (req, res) => {
  try {
    const result = await pgPool.query(`
      SELECT 
        entityid,
        newfilename,
        filename,
        documenttype,
        module
      FROM mobile_app_tbl_documents
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      documents: result.rows
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

// ==================== USER ENDPOINTS ====================

// API Route to Fetch User Details by Email
app.get("/user/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const query = `
      SELECT email, accounttype, is_active, is_placed 
      FROM mobile_app_login 
      WHERE email = $1 
      LIMIT 1
    `;
    const { rows } = await pgPool.query(query, [email]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching user details:", err);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

// ==================== ERROR HANDLING ====================

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    error: "Endpoint not found",
    availableEndpoints: [
      "/health",
      "/login",
      "/students/:email", "/student-status/:email", "/documents/:email",
      "/summary-stats/:email", "/program-breakdown/:email", "/contract-details/:email",
      "/gm-dashboard/:email", "/organisation-profile/:email",
      "/mg-status", "/dg-status", "/organisation-details/:email",
      "/user/:email"
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  res.status(500).json({ 
    error: "Internal server error",
    message: err.message 
  });
});

// Start Server
app.listen(port, () => {
  console.log(`CHIETA Backend Server is running on http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Single login endpoint for all users`);
});