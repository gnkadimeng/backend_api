const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");

const app = express();

// Use Render's port or fallback for local development
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// PostgreSQL Connection - Use environment variables for production
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:V@lidation@uj2025@localhost:5432/Post",
  // Add SSL for production (Render PostgreSQL requires this)
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ==================== HEALTH CHECK ENDPOINT ====================
app.get("/health", async (req, res) => {
  try {
    // Test database connection
    await pgPool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      message: 'CHIETA Backend is running',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      message: 'Database connection failed',
      error: error.message 
    });
  }
});

// ==================== SSDD ENDPOINTS (Student/SSDD Screen) ====================

// Fetch student data based on email
app.get("/students/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pgPool.query(
      "SELECT * FROM public.ssdd_complete_student_decision_outcome WHERE email = $1", 
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
      "SELECT * FROM public.ssdd_complete_company_decision_outcome WHERE email = $1", 
      [email]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching student status:", error);
    res.status(500).json({ error: "Failed to fetch student status" });
  }
});

// Fetch documents based on email
app.get("/documents/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pgPool.query(
      "SELECT * FROM public.ssdd_complete_uploaded_documents WHERE email = $1", 
      [email]
    );
    
    // Use dynamic base URL for file URLs
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://${req.get('host')}`
      : `http://localhost:${port}`;
    
    const documentsWithUrls = result.rows.map((doc) => {
      const filePath = path.join(__dirname, "uploads", doc.file_name);
      const fileExists = fs.existsSync(filePath);
      return {
        ...doc,
        file_url: fileExists ? `${baseUrl}/uploads/${doc.file_name}` : null,
      };
    });

    res.json(documentsWithUrls);
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

// ==================== SINGLE LOGIN ENDPOINT ====================

// Universal Login for Students, Companies, and Implementation Managers
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
      FROM public.ssdd_complete_login
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
          contact_person_name
        FROM dg_master 
        WHERE organisation_email = $1 OR contact_person_email = $1
        LIMIT 1
      `;
      const orgResult = await pgPool.query(orgQuery, [email]);
      additionalData = orgResult.rows[0] || {};
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
    
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error. Please try again." });
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
      FROM dg_master
      WHERE organisation_email = $1 OR contact_person_email = $1
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
      FROM dg_master
      WHERE organisation_email = $1 OR contact_person_email = $1
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
      SELECT 
        contract_number,
        short_contract_number,
        organisation_name,
        organisation_email,
        contact_person_email,
        programmes_afs,
        amount_per_moa_gb_approvals,
        number_of_learners_funded_per_moa,
        contract_start_date,
        contract_end_date,
        funding_window_name,
        region,
        cost_code,
        dg_year,
        cycle,
        status
      FROM dg_master
      WHERE organisation_email = $1 OR contact_person_email = $1
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
      FROM dg_master
      WHERE organisation_email = $1 OR contact_person_email = $1
    `, [email]);
    
    // Get program breakdown
    const programBreakdown = await pgPool.query(`
      SELECT 
        programmes_afs AS program,
        COUNT(*) AS count,
        COALESCE(SUM(amount_per_moa_gb_approvals), 0) AS totalAmount,
        COALESCE(SUM(number_of_learners_funded_per_moa), 0) AS learners
      FROM dg_master
      WHERE organisation_email = $1 OR contact_person_email = $1
      GROUP BY programmes_afs
      ORDER BY totalAmount DESC
    `, [email]);
    
    // Get contracts by status
    const contractsByStatus = await pgPool.query(`
      SELECT 
        status,
        COUNT(*) AS count,
        COALESCE(SUM(amount_per_moa_gb_approvals), 0) AS total_amount
      FROM dg_master
      WHERE organisation_email = $1 OR contact_person_email = $1
      GROUP BY status
      ORDER BY count DESC
    `, [email]);
    
    // Get recent contracts
    const recentContracts = await pgPool.query(`
      SELECT 
        contract_number,
        organisation_name,
        programmes_afs,
        status,
        contract_start_date
      FROM dg_master
      WHERE organisation_email = $1 OR contact_person_email = $1
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

// Get GM Organization Profile by Email
app.get("/organisation-profile/:email", async (req, res) => {
  const { email } = req.params;
  
  try {
    const result = await pgPool.query(`
      SELECT 
        organisation_name,
        organisation_email,
        contact_person_name,
        contact_person_email,
        COUNT(DISTINCT contract_number) AS total_contracts,
        COUNT(DISTINCT programmes_afs) AS total_programs,
        SUM(number_of_learners_funded_per_moa) AS total_learners_funded,
        SUM(amount_per_moa_gb_approvals) AS total_funding_received
      FROM dg_master
      WHERE organisation_email = $1 OR contact_person_email = $1
      GROUP BY organisation_name, organisation_email, contact_person_name, contact_person_email
      LIMIT 1
    `, [email]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Organization not found for this email" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to fetch organization profile" });
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
        start_date AS "startDate",
        end_date AS "endDate",
        extension_date AS "extensionDate",
        description,
        status,
        time_remaining AS "timeRemaining"
      FROM tbl_mandatory_grant_window
      ORDER BY start_date DESC
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
        launch_date AS "launchDte",
        deadline_time AS "deadlineTime",
        description,
        status,
        time_remaining AS "timeRemaining"
      FROM tbl_discretionary_grant_window
      ORDER BY launch_date DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to fetch discretionary grant status" });
  }
});

// Get organization details with related contracts by email
app.get("/organisation-details/:email", async (req, res) => {
  const { email } = req.params;
  
  try {
    const orgResult = await pgPool.query(`
      SELECT 
        o.id,
        o.sdlno AS "SDL_No",
        o.organisationname AS "Organisation_Name",
        o.tradingname AS "Trading_Name",
        o.organisationtype AS "Organisation_Type",
        o.approvalstatus AS "Approval_Status",
        COUNT(d.contract_number) AS total_contracts,
        COALESCE(SUM(d.amount_per_moa_gb_approvals), 0) AS total_funding,
        COALESCE(SUM(d.number_of_learners_funded_per_moa), 0) AS total_learners
      FROM public.organisation o
      LEFT JOIN dg_master d ON o.organisationname = d.organisation_name
      WHERE o.contactemail = $1 OR o.primarycontact = $1
      GROUP BY 
        o.id, o.sdlno, o.organisationname, o.tradingname, 
        o.organisationtype, o.approvalstatus, o.contactemail, 
        o.primarycontact, o.createddate, o.updateddate
      ORDER BY o.organisationname
    `, [email]);
    
    res.json(orgResult.rows);
  } catch (error) {
    console.error("Error fetching organisation details:", error);
    res.status(500).json({ error: "Failed to fetch organisation details" });
  }
});

// ==================== DOCUMENTS ENDPOINTS ====================

app.get("/documents-stats", async (req, res) => {
  try {
    const result = await pgPool.query(`
      SELECT 
        entityid,
        newfilename,
        filename,
        documenttype,
        module
      FROM tbl_documents
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
      FROM public.ssdd_complete_login 
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
  console.log(`🚀 CHIETA Backend Server is running on port ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Health check: http://localhost:${port}/health`);
});