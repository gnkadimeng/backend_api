const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// PostgreSQL Connection
const pgPool = new Pool({
  user: process.env.DB_USER_NAME,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: process.env.DB_SSLMODE ? { rejectUnauthorized: false } : false,
});

// ==================== HEALTH CHECK ENDPOINT ====================
app.get("/health", (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'CHIETA Backend is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: [
      "/health",
      "/login",
      "/user/:email",
      "/students/:email",
      "/student-status/:email",
      "/documents/:email",
      "/download/document/:filename",
      "/uploads-check",
      "/summary-stats/:email",
      "/program-breakdown/:email",
      "/contract-details/:email",
      "/gm-dashboard/:email",
      "/organisation-profile/:email",
      "/mg-status",
      "/dg-status",
      "/organisation-applications/:email",
      "/mg-applications-details/:sdlNo",
      "/dg-applications-details/:sdlNo",
      "/mg-application-detail/:applicationNumber",
      "/dg-application-detail/:applicationNumber",
      "/organisation-detail/:sdlNo",
      "/download-document/:applicationNumber/:documentType",
      "/documents-stats/:email",
      "/organisation-contracts"
    ]
  });
});

// ==================== UPLOADS CHECK ENDPOINT ====================
app.get("/uploads-check", (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');
    const exists = fs.existsSync(uploadsDir);
    const files = exists ? fs.readdirSync(uploadsDir) : [];
    
    res.json({
      uploadsDirectory: uploadsDir,
      exists: exists,
      fileCount: files.length,
      files: files.slice(0, 20), // Show first 20 files
      message: exists ? "Uploads directory exists" : "Uploads directory not found"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SIMPLIFIED FILE DOWNLOAD ENDPOINT ====================
app.get("/download/document/:filename", async (req, res) => {
  const { filename } = req.params;
  
  try {
    // Decode filename
    const decodedFilename = decodeURIComponent(filename);
    
    console.log(`📥 Download requested: ${decodedFilename}`);
    
    // Simple file path construction - FIXED
    const filePath = path.join(__dirname, 'uploads', decodedFilename);
    
    console.log(`🔍 Looking for file at: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${decodedFilename}`);
      
      // List what's actually in the uploads directory
      const uploadsDir = path.join(__dirname, 'uploads');
      if (fs.existsSync(uploadsDir)) {
        const existingFiles = fs.readdirSync(uploadsDir);
        console.log(`📁 Files in uploads directory: ${existingFiles.join(', ')}`);
      }
      
      return res.status(404).json({ 
        error: "File not found",
        filename: decodedFilename,
        searchedPath: filePath,
        message: "File not found in uploads directory" 
      });
    }
    
    // Get file stats
    const stat = fs.statSync(filePath);
    
    // Determine content type based on file extension
    const ext = path.extname(decodedFilename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    
    contentType = mimeTypes[ext] || 'application/octet-stream';
    
    // Set headers for file download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${decodedFilename}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    console.log(`📤 Serving file: ${decodedFilename} (${contentType}, ${stat.size} bytes)`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    
    // Handle stream errors
    fileStream.on('error', (err) => {
      console.error('❌ File stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error reading file" });
      }
    });
    
    fileStream.pipe(res);
    
  } catch (error) {
    console.error("❌ Error downloading file:", error);
    res.status(500).json({ 
      error: "Failed to download file",
      message: error.message
    });
  }
});

// ==================== SSDD ENDPOINTS ====================

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

// Fetch documents based on email with FIXED download URLs
app.get("/documents/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pgPool.query(
      "SELECT * FROM mobile_app_uploaded_documents WHERE email = $1", 
      [email]
    );
    
    // Get server's base URL dynamically
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    console.log(`🔗 Base URL for downloads: ${baseUrl}`);
    
    const documentsWithUrls = result.rows.map((doc) => {
      if (!doc.file_name) {
        return {
          ...doc,
          file_url: null,
          download_url: null,
          file_size: doc.file_size || 'N/A',
          uploaded_at: doc.uploaded_at || doc.upload_date || new Date().toISOString(),
          warning: "No filename provided"
        };
      }
      
      // Clean filename - remove any path components
      const cleanFilename = doc.file_name.split('/').pop().split('\\').pop();
      
      // FIXED: Generate proper download URL
      const downloadUrl = `${baseUrl}/download/document/${encodeURIComponent(cleanFilename)}`;
      
      console.log(`📄 Document: ${cleanFilename} -> ${downloadUrl}`);
      
      return {
        ...doc,
        file_name: cleanFilename, // Ensure clean filename
        file_url: downloadUrl,
        download_url: downloadUrl,
        direct_download_url: downloadUrl,
        file_size: doc.file_size || 'N/A',
        uploaded_at: doc.uploaded_at || doc.upload_date || new Date().toISOString(),
        can_download: true
      };
    });

    res.json(documentsWithUrls);
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

// ==================== SINGLE LOGIN ENDPOINT ====================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
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

    if (user.accounttype === 'Company') {
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
        additionalData = orgResult.rows[0];
      }
    }

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
    
    res.json(result.rows[0] || {
      totalFunding: 0,
      totalLearners: 0,
      avgPerLearner: 0,
      totalContracts: 0
    });
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
    
    res.json(result.rows || []);
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
      SELECT 
        organisation_name,
        contract_number,
        short_contract_number,
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
    
    res.json(result.rows || []);
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
      WHERE email = $1 
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
    
    // Get recent contracts
    const recentContracts = await pgPool.query(`
      SELECT 
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
      LIMIT 5
    `, [email]);
    
    res.json({
      summary: summaryStats.rows[0] || {
        totalFunding: 0,
        totalLearners: 0,
        avgPerLearner: 0,
        totalContracts: 0
      },
      programBreakdown: programBreakdown.rows || [],
      recentContracts: recentContracts.rows || [],
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
      LIMIT 2;
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to fetch discretionary grant status" });
  }
});

// Check organization applications with document status and download links
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

// Get detailed MG applications with documents
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

// Get detailed DG applications with documents
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

// ==================== APPLICATION DETAIL ENDPOINTS ====================

// Get MG Application Detail by Application Number
app.get("/mg-application-detail/:applicationNumber", async (req, res) => {
  const { applicationNumber } = req.params;
  
  try {
    const result = await pgPool.query(`
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
        sdl_no AS "SDL_No",
        datecreated AS "Date_Created"
        
      FROM mobile_app_mg_applications 
      WHERE application_number = $1
      LIMIT 1
    `, [applicationNumber]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "MG application not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching MG application detail:", error);
    res.status(500).json({ error: "Failed to fetch MG application details" });
  }
});

// Get DG Application Detail by Application Number
app.get("/dg-application-detail/:applicationNumber", async (req, res) => {
  const { applicationNumber } = req.params;
  
  try {
    const result = await pgPool.query(`
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
        sdl_no AS "SDL_No",
        datecreated AS "Date_Created"
        
      FROM mobile_app_dg_applications 
      WHERE application_number = $1
      LIMIT 1
    `, [applicationNumber]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "DG application not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching DG application detail:", error);
    res.status(500).json({ error: "Failed to fetch DG application details" });
  }
});

// Get Organization Detail by SDL Number
app.get("/organisation-detail/:sdlNo", async (req, res) => {
  const { sdlNo } = req.params;
  
  try {
    const result = await pgPool.query(`
      SELECT 
        sdlno AS "SDL_No",
        organisationname AS "Organisation_Name",
        tradingname AS "Trading_Name",
        organisationtype AS "Organisation_Type",
        applicationstatus AS "Approval_Status",
        email,
        contactperson AS "Contact_Person",
        contactnumber AS "Contact_Number",
        province,
        city,
        address,
        datecreated AS "Date_Created",
        lastupdated AS "Last_Updated"
      FROM mobile_app_organisation 
      WHERE sdlno = $1
      LIMIT 1
    `, [sdlNo]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Organization not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching organization detail:", error);
    res.status(500).json({ error: "Failed to fetch organization details" });
  }
});

// Enhanced document download endpoint for MG and DG applications
app.get("/download-document/:applicationNumber/:documentType", async (req, res) => {
  const { applicationNumber, documentType } = req.params;
  
  try {
    // Validate document type
    const validDocumentTypes = ['wsp', 'moa', 'awards_letter', 'application_form', 'proposal'];
    if (!validDocumentTypes.includes(documentType.toLowerCase())) {
      return res.status(400).json({ error: "Invalid document type" });
    }
    
    // Determine which table to query based on application number prefix
    let table, columnName;
    if (applicationNumber.startsWith('MG')) {
      table = 'mobile_app_mg_applications';
      columnName = documentType.toLowerCase() === 'wsp' ? 'wsp_file_path' : 
                   documentType.toLowerCase() === 'moa' ? 'moa_file_path' : 
                   'awards_letter_file_path';
    } else if (applicationNumber.startsWith('DG')) {
      table = 'mobile_app_dg_applications';
      columnName = documentType.toLowerCase() === 'application_form' ? 'application_form_path' : 
                   documentType.toLowerCase() === 'proposal' ? 'proposal_document_path' : 
                   documentType.toLowerCase() === 'moa' ? 'moa_file_path' : 
                   'awards_letter_file_path';
    } else {
      return res.status(400).json({ error: "Invalid application number format" });
    }
    
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
    
    // Extract filename from path
    const filename = application.file_path.split('/').pop().split('\\').pop();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const directDownloadUrl = `/download/document/${encodeURIComponent(filename)}`;
    
    res.json({
      success: true,
      message: "Document download ready",
      documentType: documentType.toUpperCase(),
      applicationNumber: application.application_number,
      applicationTitle: application.application_title,
      organisationName: application.organisation_name,
      filePath: application.file_path,
      fileName: filename,
      downloadUrl: directDownloadUrl,
      directDownload: `${baseUrl}${directDownloadUrl}`
    });
    
  } catch (error) {
    console.error("Error preparing document download:", error);
    res.status(500).json({ error: "Failed to prepare document download" });
  }
});

// Alternative document download endpoint for both MG and DG (compatibility)
app.get("/api/download-document/:applicationNumber/:documentType", async (req, res) => {
  const { applicationNumber, documentType } = req.params;
  
  try {
    // Validate document type
    const validDocumentTypes = ['wsp', 'moa', 'awards_letter', 'application_form', 'proposal'];
    if (!validDocumentTypes.includes(documentType.toLowerCase())) {
      return res.status(400).json({ error: "Invalid document type" });
    }
    
    // Determine which table to query based on application number prefix
    let table, columnName;
    if (applicationNumber.startsWith('MG')) {
      table = 'mobile_app_mg_applications';
      columnName = documentType.toLowerCase() === 'wsp' ? 'wsp_file_path' : 
                   documentType.toLowerCase() === 'moa' ? 'moa_file_path' : 
                   'awards_letter_file_path';
    } else if (applicationNumber.startsWith('DG')) {
      table = 'mobile_app_dg_applications';
      columnName = documentType.toLowerCase() === 'application_form' ? 'application_form_path' : 
                   documentType.toLowerCase() === 'proposal' ? 'proposal_document_path' : 
                   documentType.toLowerCase() === 'moa' ? 'moa_file_path' : 
                   'awards_letter_file_path';
    } else {
      return res.status(400).json({ error: "Invalid application number format" });
    }
    
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
    
    // Extract filename from path
    const filename = application.file_path.split('/').pop().split('\\').pop();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const directDownloadUrl = `/download/document/${encodeURIComponent(filename)}`;
    
    res.json({
      success: true,
      message: "Document download ready",
      documentType: documentType.toUpperCase(),
      applicationNumber: application.application_number,
      applicationTitle: application.application_title,
      organisationName: application.organisation_name,
      filePath: application.file_path,
      fileName: filename,
      downloadUrl: directDownloadUrl,
      directDownload: `${baseUrl}${directDownloadUrl}`
    });
    
  } catch (error) {
    console.error("Error preparing document download:", error);
    res.status(500).json({ error: "Failed to prepare document download" });
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

// Get Documents Stats by Email
app.get("/documents-stats/:email", async (req, res) => {
  const { email } = req.params;
  
  try {
    const result = await pgPool.query(`
      SELECT 
        COUNT(*) AS total_documents,
        COUNT(CASE WHEN approval_status = 'approved' THEN 1 END) AS approved_documents,
        COUNT(CASE WHEN approval_status = 'pending' THEN 1 END) AS pending_documents,
        COUNT(CASE WHEN approval_status = 'rejected' THEN 1 END) AS rejected_documents,
        COALESCE(SUM(file_size), 0) AS total_size
      FROM mobile_app_uploaded_documents 
      WHERE email = $1
    `, [email]);
    
    res.json(result.rows[0] || {
      total_documents: 0,
      approved_documents: 0,
      pending_documents: 0,
      rejected_documents: 0,
      total_size: 0
    });
  } catch (error) {
    console.error("Error fetching document stats:", error);
    res.status(500).json({ error: "Failed to fetch document statistics" });
  }
});

// Get Organisation Profile by Email
app.get("/organisation-profile/:email", async (req, res) => {
  const { email } = req.params;
  
  try {
    const result = await pgPool.query(`
      SELECT 
        organisation_name,
        contract_number,
        region,
        programmes_afs,
        email,
        contact_person,
        contact_number,
        physical_address
      FROM mobile_app_dg_master 
      WHERE email = $1
      LIMIT 1
    `, [email]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Organisation profile not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching organisation profile:", error);
    res.status(500).json({ error: "Failed to fetch organisation profile" });
  }
});

// Legacy endpoint for compatibility
app.get("/organisation-contracts", async (req, res) => {
  try {
    const result = await pgPool.query(`
      SELECT 
        organisation_name,
        contract_number,
        programmes_afs,
        amount_per_moa_gb_approvals,
        number_of_learners_funded_per_moa,
        contract_start_date,
        contract_end_date
      FROM mobile_app_dg_master 
      ORDER BY organisation_name
    `);
    
    res.json(result.rows || []);
  } catch (error) {
    console.error("Error fetching organisation contracts:", error);
    res.status(500).json({ error: "Failed to fetch organisation contracts" });
  }
});

// ==================== CREATE UPLOADS DIRECTORY IF NOT EXISTS ====================
const ensureUploadsDirectory = () => {
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    console.log('📁 Creating uploads directory...');
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Uploads directory created:', uploadsDir);
    
    // Create a test file for debugging
    const testFilePath = path.join(uploadsDir, 'test.pdf');
    if (!fs.existsSync(testFilePath)) {
      fs.writeFileSync(testFilePath, 'This is a test PDF file for debugging.');
      console.log('📄 Test file created: test.pdf');
    }
  } else {
    console.log('📁 Uploads directory exists:', uploadsDir);
    const files = fs.readdirSync(uploadsDir);
    console.log(`📄 Files in uploads: ${files.length} files`);
    if (files.length > 0) {
      console.log('📋 First 5 files:', files.slice(0, 5));
    }
  }
};

// ==================== ERROR HANDLING ====================

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ 
    error: "Endpoint not found",
    availableEndpoints: [
      "/health",
      "/uploads-check",
      "/login",
      "/user/:email",
      "/students/:email",
      "/student-status/:email",
      "/documents/:email",
      "/download/document/:filename",
      "/summary-stats/:email",
      "/program-breakdown/:email",
      "/contract-details/:email",
      "/gm-dashboard/:email",
      "/organisation-profile/:email",
      "/mg-status",
      "/dg-status",
      "/organisation-applications/:email",
      "/mg-applications-details/:sdlNo",
      "/dg-applications-details/:sdlNo",
      "/mg-application-detail/:applicationNumber",
      "/dg-application-detail/:applicationNumber",
      "/organisation-detail/:sdlNo",
      "/download-document/:applicationNumber/:documentType",
      "/api/download-document/:applicationNumber/:documentType",
      "/documents-stats/:email",
      "/organisation-contracts"
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
  console.log(`🚀 CHIETA Backend Server is running on port ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Checking uploads directory...`);
  
  // Ensure uploads directory exists
  ensureUploadsDirectory();
  
  console.log(`✅ Health check: http://localhost:${port}/health`);
  console.log(`📁 Uploads check: http://localhost:${port}/uploads-check`);
  console.log(`📥 File downloads: http://localhost:${port}/download/document/:filename`);
  console.log(`👤 Login endpoint: http://localhost:${port}/login`);
  console.log(`📄 Document download: http://localhost:${port}/download-document/:applicationNumber/:documentType`);
  console.log(`🏢 Organisation details: http://localhost:${port}/organisation-applications/:email`);
  console.log(`📊 GMS Dashboard: http://localhost:${port}/gm-dashboard/:email`);
  console.log(`📱 IMS Dashboard endpoints available`);
});