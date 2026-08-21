/**
 * Year 2 Scenario Generator — State Reader
 *
 * Queries all 30 Micro-ERP GET APIs via Cloudflare service bindings
 * to build a comprehensive CompanyState snapshot. This state drives
 * all generator decisions for Year 2.
 */

import type {
  CompanyState, EmployeeSummary, CustomerSummary, ProjectSummary,
  VendorSummary,
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ListResponse<T> {
  data: T[];
  total?: number;
  page?: number;
  pageSize?: number;
}

async function fetchList<T>(
  service: Fetcher,
  hostname: string,
  path: string,
): Promise<T[]> {
  try {
    const response = await service.fetch(new Request(`https://${hostname}${path}`, {
      method: "GET",
      headers: { accept: "application/json" },
    }));
    if (!response.ok) return [];
    const json = await response.json() as ListResponse<T>;
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

async function fetchCount(
  service: Fetcher,
  hostname: string,
  path: string,
): Promise<number> {
  try {
    const response = await service.fetch(new Request(`https://${hostname}${path}`, {
      method: "GET",
      headers: { accept: "application/json" },
    }));
    if (!response.ok) return 0;
    const json = await response.json() as { data?: unknown[]; total?: number };
    if (typeof json.total === "number") return json.total;
    if (Array.isArray(json.data)) return json.data.length;
    return 0;
  } catch {
    return 0;
  }
}

// ─── State Reader ─────────────────────────────────────────────────────────────

/**
 * Reads the current company state by querying all 30 Micro-ERP APIs.
 * Uses the Cloudflare service bindings from the simulation-studio env.
 */
export async function readCompanyState(env: Env, runId?: string): Promise<CompanyState> {
  // Query all APIs in parallel for speed.
  const [
    employees,
    customers,
    projects,
    vendors,
    requisitions,
    leads,
    opportunities,
    invoices,
    journalEntries,
    budgets,
    risks,
    findings,
    securityReviews,
    auditCampaigns,
    cycles,
    tickets,
    contracts,
    billingInvoices,
    purchaseOrders,
    expenses,
  ] = await Promise.all([
    // HR employees
    fetchList<EmployeeSummary>(env.HR_SERVICE, "hr.erp.appneural.com", "/api/employees?pageSize=500"),
    // Customer accounts
    fetchList<CustomerSummary>(env.CUSTOMER_SERVICE, "customer.erp.appneural.com", "/api/customers?pageSize=200"),
    // Projects
    fetchList<ProjectSummary>(env.PROJECT_SERVICE, "project.erp.appneural.com", "/api/projects?pageSize=200"),
    // Vendors
    fetchList<VendorSummary>(env.VENDOR_SERVICE, "vendor.erp.appneural.com", "/api/vendors?pageSize=200"),
    // Recruitment requisitions
    fetchCount(env.RECRUITMENT_SERVICE, "recruitment.erp.appneural.com", "/api/requisitions?pageSize=200"),
    // CRM leads
    fetchCount(env.CRM_SERVICE, "crm.erp.appneural.com", "/api/leads?pageSize=200"),
    // CRM opportunities
    fetchList<{ id: string; amount: number; stage: string }>(env.CRM_SERVICE, "crm.erp.appneural.com", "/api/opportunities?pageSize=500"),
    // Billing invoices
    fetchCount(env.BILLING_SERVICE, "billing.erp.appneural.com", "/api/invoices?pageSize=200"),
    // Finance journal entries
    fetchCount(env.FINANCE_SERVICE, "finance.erp.appneural.com", "/api/journal-entries?pageSize=200"),
    // Finance budgets
    fetchCount(env.FINANCE_SERVICE, "finance.erp.appneural.com", "/api/budgets?pageSize=200"),
    // Risks
    fetchCount(env.RISK_SERVICE, "risk.erp.appneural.com", "/api/risks?pageSize=200"),
    // Compliance findings
    fetchCount(env.COMPLIANCE_SERVICE, "compliance.erp.appneural.com", "/api/findings?pageSize=200"),
    // Security reviews
    fetchCount(env.SECURITY_SERVICE, "security.erp.appneural.com", "/api/reviews?pageSize=200"),
    // Asset audit campaigns
    fetchCount(env.ASSET_SERVICE, "asset.erp.appneural.com", "/api/audit_campaigns?pageSize=200"),
    // Performance cycles
    fetchCount(env.PERFORMANCE_SERVICE, "performance.erp.appneural.com", "/api/cycles?pageSize=200"),
    // Support tickets
    fetchCount(env.SUPPORT_SERVICE, "support.erp.appneural.com", "/api/tickets?pageSize=200"),
    // Contracts
    fetchCount(env.CONTRACT_SERVICE, "contract.erp.appneural.com", "/api/contracts?pageSize=200"),
    // Billing invoices (count)
    fetchCount(env.BILLING_SERVICE, "billing.erp.appneural.com", "/api/invoices?pageSize=200"),
    // Procurement POs
    fetchCount(env.PROCUREMENT_SERVICE, "procurement.erp.appneural.com", "/api/orders?pageSize=200"),
    // Expenses
    fetchCount(env.EXPENSE_SERVICE, "expense.erp.appneural.com", "/api/expenses?pageSize=200"),
  ]);

  // Compute derived state.
  const activeEmployees = employees.filter((e) => e.employmentStatus === "active" || e.employmentStatus === "ACTIVE");

  // If a runId is provided, filter employees to only those that exist in the
  // simulation_employees table. This ensures issueActorToken() can find them.
  let validEmployees = activeEmployees;
  if (runId) {
    const simEmps = await env.DB.prepare(
      `SELECT employee_id FROM simulation_employees WHERE run_id = ?`,
    ).bind(runId).all<{ employee_id: string }>();
    const simEmpIds = new Set(simEmps.results.map((e) => e.employee_id));
    validEmployees = activeEmployees.filter((e) => simEmpIds.has(e.employeeCode));
  }
  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "in_progress" || p.status === "in-progress");
  const completedProjects = projects.filter((p) => p.status === "completed" || p.status === "delivered" || p.status === "closed");
  const activeVendors = vendors.filter((v) => v.status === "ACTIVE" || v.status === "active");

  // Department breakdown.
  const departments: Record<string, number> = {};
  for (const emp of activeEmployees) {
    const dept = emp.department || "Unknown";
    departments[dept] = (departments[dept] ?? 0) + 1;
  }

  // Pipeline value from open opportunities.
  const pipelineValue = opportunities
    .filter((o) => !["closed_won", "closed_lost", "won", "lost"].includes(o.stage))
    .reduce((sum, o) => sum + (o.amount ?? 0), 0);

  // Active customers (exclude "former" tier).
  const activeCustomers = customers.filter((c) => c.tier !== "former" && c.tier !== "churned");

  return {
    employeeCount: validEmployees.length,
    departments,
    employees: validEmployees,
    customerCount: activeCustomers.length,
    customers: activeCustomers,
    activeProjectCount: activeProjects.length,
    completedProjectCount: completedProjects.length,
    projects,
    vendorCount: activeVendors.length,
    vendors: activeVendors,
    openRequisitionCount: requisitions,
    leadCount: leads,
    opportunityCount: opportunities.length,
    pipelineValue,
    invoiceCount: invoices,
    journalEntryCount: journalEntries,
    budgetCount: budgets,
    riskCount: risks,
    findingCount: findings,
    securityReviewCount: securityReviews,
    auditCampaignCount: auditCampaigns,
    performanceCycleCount: cycles,
    ticketCount: tickets,
    contractCount: contracts,
    billingInvoiceCount: billingInvoices,
    purchaseOrderCount: purchaseOrders,
    expenseCount: expenses,
  };
}
