/**
 * Valid POST test data for key entity creation endpoints.
 *
 * Each entry provides the minimum viable payload that passes both the zod
 * shape validation and the domain validators.  The data is intentionally
 * boring — realistic but unremarkable — so it never collides with real
 * simulation or production records.
 *
 * Field names verified against live API validation responses (2026-08-22).
 */

export interface PostTestData {
  /** Endpoint path (e.g. "/api/requisitions") */
  path: string;
  /** Valid payload that should succeed with 201 */
  valid: Record<string, unknown>;
  /** Invalid payload that should fail with 400/422 (missing required fields) */
  invalid: Record<string, unknown>;
  /** Human-readable label for test output */
  label: string;
}

/** Per-module POST test data keyed by endpoint path. */
export const POST_TEST_DATA: Record<string, PostTestData[]> = {
  /* ── recruitment ─────────────────────────────────────────────── */
  recruitment: [
    {
      path: "/api/requisitions",
      label: "requisition",
      valid: {
        title: "Senior TypeScript Engineer",
        reason: "new",
        departmentName: "Engineering",
        openings: 1,
        employmentType: "full_time",
        currency: "INR",
        hiringManagerEmail: "engineering@appneural.com",
        justification: "Backfill for Q3 roadmap",
      },
      invalid: { title: "" },
    },
    {
      path: "/api/candidates",
      label: "candidate",
      valid: {
        fullName: "Test Candidate",
        email: "test.candidate@example.com",
        source: "careers_site",
        status: "active",
        currency: "INR",
      },
      invalid: { fullName: "" },
    },
    {
      path: "/api/jobs",
      label: "job",
      valid: {
        requisitionId: "00000000-0000-0000-0000-000000000000",
        title: "Staff Engineer",
        workMode: "onsite",
        channel: "careers_site",
      },
      invalid: { title: "" },
    },
  ],

  /* ── crm ─────────────────────────────────────────────────────── */
  crm: [
    {
      path: "/api/leads",
      label: "lead",
      valid: {
        company: "Acme Test Corp",
        contactName: "Test Contact",
        email: "contact@acmetest.example.com",
        phone: "+91-9999900000",
        source: "website",
        status: "new",
      },
      invalid: { company: "" },
    },
  ],

  /* ── procurement ─────────────────────────────────────────────── */
  procurement: [
    {
      path: "/api/requests",
      label: "purchase request",
      valid: {
        title: "Office Supplies Q3",
        department: "Engineering",
        requestedBy: "test@example.com",
        totalAmount: 50000,
        currency: "INR",
        status: "draft",
      },
      invalid: {},
    },
    {
      path: "/api/categories",
      label: "procurement category",
      valid: { name: "Test IT Equipment", code: "CAT-TEST-001" },
      invalid: { name: "" },
    },
  ],

  /* ── hr ──────────────────────────────────────────────────────── */
  hr: [
    {
      path: "/api/change-requests",
      label: "HR change request",
      valid: {
        employeeId: "EMP-001",
        kind: "promotion",
        reason: "Annual review cycle",
        effectiveOn: "2026-04-01",
      },
      invalid: { kind: "" },
    },
  ],

  /* ── project ─────────────────────────────────────────────────── */
  project: [
    {
      path: "/api/projects",
      label: "project",
      valid: {
        name: "Test Project Alpha",
        code: "PRJ-TEST-001",
        status: "planning",
        startDate: "2026-03-01",
        endDate: "2026-09-30",
      },
      invalid: { name: "" },
    },
    {
      path: "/api/milestones",
      label: "milestone",
      valid: {
        projectId: "00000000-0000-0000-0000-000000000000",
        name: "Phase 1 Delivery",
        dueDate: "2026-06-30",
      },
      invalid: { name: "" },
    },
  ],

  /* ── vendor ──────────────────────────────────────────────────── */
  vendor: [
    {
      path: "/api/vendors",
      label: "vendor",
      valid: {
        displayName: "Test Vendor Pvt Ltd",
        category: "IT Services",
        email: "contact@testvendor.example.com",
        phone: "+91-8888800000",
        status: "active",
      },
      invalid: { displayName: "" },
    },
  ],

  /* ── customer ────────────────────────────────────────────────── */
  customer: [
    {
      path: "/api/customers",
      label: "customer",
      valid: {
        name: "Test Customer Inc",
        email: "contact@testcustomer.example.com",
        phone: "+91-7777700000",
        segment: "enterprise",
        status: "active",
      },
      invalid: { name: "" },
    },
  ],

  /* ── asset ───────────────────────────────────────────────────── */
  asset: [
    {
      path: "/api/assets",
      label: "asset",
      valid: {
        name: "Test MacBook Pro 16",
        assetTag: "ASSET-TEST-001",
        category: "laptop",
        status: "in_service",
        serialNumber: "SN-TEST-001",
      },
      invalid: { name: "" },
    },
    {
      path: "/api/asset_types",
      label: "asset type",
      valid: { name: "Test Peripheral", code: "TYPE-TEST-001", status: "active" },
      invalid: { name: "" },
    },
  ],

  /* ── attendance ──────────────────────────────────────────────── */
  attendance: [
    {
      path: "/api/attendance",
      label: "attendance record",
      valid: {
        employeeCode: "EMP-001",
        workDate: "2026-03-01",
        checkIn: "09:00:00",
        checkOut: "18:00:00",
        status: "present",
      },
      invalid: { workDate: "" },
    },
  ],

  /* ── billing ─────────────────────────────────────────────────── */
  billing: [
    {
      path: "/api/invoices",
      label: "invoice",
      valid: {
        invoiceNo: "INV-TEST-001",
        customer: "Test Customer",
        amount: 50000,
        currency: "INR",
        invoiceDate: "2026-03-01",
        dueDate: "2026-03-31",
        status: "draft",
      },
      invalid: { invoiceNo: "" },
    },
  ],

  /* ── expense ─────────────────────────────────────────────────── */
  expense: [
    {
      path: "/api/claims",
      label: "expense claim",
      valid: {
        claimNo: "CLM-TEST-001",
        employeeCode: "EMP-001",
        amount: 15000,
        currency: "INR",
        title: "Client Travel Expense",
        status: "draft",
        submittedOn: "2026-03-01",
      },
      invalid: { claimNo: "" },
    },
  ],

  /* ── contract ────────────────────────────────────────────────── */
  contract: [
    {
      path: "/api/contracts",
      label: "contract",
      valid: {
        title: "Test Service Agreement",
        contractNo: "CTR-TEST-001",
        partyName: "Test Partner Ltd",
        startDate: "2026-03-01",
        endDate: "2027-02-28",
        status: "draft",
      },
      invalid: { title: "" },
    },
  ],

  /* ── audit ───────────────────────────────────────────────────── */
  audit: [
    {
      path: "/api/audit-charters",
      label: "audit charter",
      valid: {
        name: "Test Audit Charter 2026",
        code: "AC-TEST-001",
        scope: "Internal financial controls",
        status: "draft",
      },
      invalid: { name: "" },
    },
  ],

  /* ── compliance ──────────────────────────────────────────────── */
  compliance: [
    {
      path: "/api/obligations",
      label: "compliance obligation",
      valid: {
        title: "Test GDPR Compliance",
        code: "OBL-TEST-001",
        category: "data_protection",
        status: "active",
      },
      invalid: { title: "" },
    },
  ],

  /* ── security ────────────────────────────────────────────────── */
  security: [
    {
      path: "/api/incidents",
      label: "security incident",
      valid: {
        title: "Test Phishing Attempt",
        code: "INC-TEST-001",
        severity: "medium",
        status: "reported",
        reportedAt: "2026-03-01T10:00:00Z",
      },
      invalid: { title: "" },
    },
  ],

  /* ── risk ────────────────────────────────────────────────────── */
  risk: [
    {
      path: "/api/risks",
      label: "risk",
      valid: {
        title: "Test Supply Chain Risk",
        code: "RSK-TEST-001",
        category: "operational",
        likelihood: "medium",
        impact: "high",
        status: "identified",
      },
      invalid: { title: "" },
    },
  ],

  /* ── performance ─────────────────────────────────────────────── */
  performance: [
    {
      path: "/api/reviews",
      label: "performance review",
      valid: {
        employeeId: "EMP-001",
        reviewPeriod: "2026-Q1",
        code: "PR-TEST-001",
        type: "quarterly",
        status: "draft",
      },
      invalid: { reviewPeriod: "" },
    },
  ],

  /* ── learning ────────────────────────────────────────────────── */
  learning: [
    {
      path: "/api/courses",
      label: "course",
      valid: {
        title: "Test TypeScript Advanced",
        code: "CRS-TEST-001",
        category: "technical",
        duration: 40,
        status: "draft",
      },
      invalid: { title: "" },
    },
  ],

  /* ── support ─────────────────────────────────────────────────── */
  support: [
    {
      path: "/api/tickets",
      label: "support ticket",
      valid: {
        subject: "Test Login Issue",
        category: "access",
        priority: "medium",
        status: "open",
        requesterEmail: "test@example.com",
      },
      invalid: { subject: "" },
    },
  ],

  /* ── payroll ─────────────────────────────────────────────────── */
  payroll: [
    {
      path: "/api/components",
      label: "payroll component",
      valid: {
        name: "Test HRA",
        code: "CMP-TEST-001",
        type: "earning",
        calculationType: "percentage",
        value: 20,
      },
      invalid: { name: "" },
    },
  ],

  /* ── administration ──────────────────────────────────────────── */
  administration: [
    {
      path: "/api/offices",
      label: "office",
      valid: {
        name: "Test Office Building",
        code: "OFF-TEST-001",
        location: "Mumbai",
        capacity: 200,
      },
      invalid: { name: "" },
    },
    {
      path: "/api/rooms",
      label: "room",
      valid: {
        name: "Test Conference Room A",
        code: "ROOM-TEST-001",
        floor: "3rd",
        capacity: 12,
      },
      invalid: { name: "" },
    },
  ],

  /* ── organization ────────────────────────────────────────────── */
  organization: [
    {
      path: "/api/departments",
      label: "department",
      valid: {
        name: "Test Department",
        code: "DEPT-TEST",
        headEmail: "head@testdept.example.com",
      },
      invalid: { name: "" },
    },
  ],

  /* ── presales ────────────────────────────────────────────────── */
  presales: [
    {
      path: "/api/bids",
      label: "bid",
      valid: {
        title: "Test RFP Response",
        bidNo: "BID-TEST-001",
        account: "Test Account",
        status: "draft",
        submissionDeadline: "2026-06-30",
      },
      invalid: { title: "" },
    },
  ],

  /* ── resource ────────────────────────────────────────────────── */
  resource: [
    {
      path: "/api/demand",
      label: "resource demand",
      valid: {
        demandNo: "DMN-TEST-001",
        projectCode: "PRJ-001",
        role: "Developer",
        count: 3,
        startDate: "2026-04-01",
      },
      invalid: { role: "" },
    },
  ],

  /* ── sdlc ────────────────────────────────────────────────────── */
  sdlc: [
    {
      path: "/api/releases",
      label: "SDLC release",
      valid: {
        name: "v2.1.0",
        projectCode: "PRJ-001",
        version: "2.1.0",
        environment: "staging",
        status: "planned",
        plannedAt: "2026-04-01",
      },
      invalid: { name: "" },
    },
  ],

  /* ── qa ──────────────────────────────────────────────────────── */
  qa: [
    {
      path: "/api/test-plans",
      label: "test plan",
      valid: {
        name: "Regression Suite Q1",
        workspaceId: "WS-001",
        module: "billing",
        status: "draft",
      },
      invalid: { name: "" },
    },
  ],

  /* ── devops ──────────────────────────────────────────────────── */
  devops: [
    {
      path: "/api/pipelines",
      label: "CI/CD pipeline",
      valid: {
        name: "Test Deploy Pipeline",
        repo: "appneural/test-repo",
        branch: "main",
        status: "active",
      },
      invalid: { name: "" },
    },
  ],
};

/**
 * Returns all POST test data entries flattened for iteration.
 */
export function allPostTestData(): Array<PostTestData & { module: string }> {
  const result: Array<PostTestData & { module: string }> = [];
  for (const [module, entries] of Object.entries(POST_TEST_DATA)) {
    for (const entry of entries) {
      result.push({ ...entry, module });
    }
  }
  return result;
}
