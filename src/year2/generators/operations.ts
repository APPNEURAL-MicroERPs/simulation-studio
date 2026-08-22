/**
 * Year 2 Scenario Generator — Operations Generator
 *
 * Generates operations stories: procurement requests, vendor evaluations,
 * asset management, administration, inventory, and support tickets.
 */

import type { ApiStory } from "../api-stories";
import type { GeneratorContext } from "../types";
import { step, generatedAssertions } from "../types";
import {
  randomCompanyName, randomDateTimeInMonth, randomFutureDate,
  nextPOCode, nextAssetCode, nextTicketCode,
} from "../probability";
import { selectActor } from "../business-rules";

// ─── Procurement ──────────────────────────────────────────────────────────────

function generateProcurementStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];
  const count = rng.int(1, 3);
  const actor = selectActor("procurement", state.employees, rng);

  const categories = [
    { title: "Office Supplies Restock", category: "Office Supplies", cost: [10000, 50000] as [number, number] },
    { title: "IT Equipment — Laptops", category: "IT Hardware", cost: [100000, 500000] as [number, number] },
    { title: "Cloud Infrastructure", category: "Cloud Services", cost: [50000, 300000] as [number, number] },
    { title: "Software Licenses", category: "Software", cost: [30000, 200000] as [number, number] },
    { title: "Training Materials", category: "Training", cost: [10000, 80000] as [number, number] },
    { title: "Furniture — New Hires", category: "Furniture", cost: [20000, 100000] as [number, number] },
  ];

  for (let i = 0; i < count; i++) {
    ctx.sequence++;
    const cat = rng.pick(categories);
    const poCode = nextPOCode();
    const cost = rng.int(cat.cost[0], cat.cost[1]);
    const vendor = state.vendors.length > 0 ? rng.pick(state.vendors) : null;

    // 2-step story: create request, then create PO linked to it
    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, 3 + i * 5, 7 + i * 5),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "procurement",
      preconditions: [`${state.vendorCount} active vendors`],
      intent: `Purchase request: ${cat.title} → PO (${Math.round(cost / 1000)}K).`,
      steps: [
        step("procurement", "POST", "/api/requests", 201, {
          requestNo: poCode,
          title: cat.title,
          category: cat.category,
          requesterEmail: actor.actorEmail,
          department: rng.pick(["Engineering", "Operations", "Administration", "Finance"]),
          estimatedCost: cost,
          neededBy: randomFutureDate(rng, `${month}-15`, 1, 2),
          justification: `Operational need: ${cat.title}. Approved by department head.`,
          status: "draft",
        }, "/api/requests?pageSize=200"),
        step("procurement", "POST", "/api/purchase-orders", 201, {
          poNumber: `PO-Y2-${String(ctx.sequence).padStart(3, "0")}`,
          vendor: vendor ? (vendor.displayName || (vendor as any).name || "Default Vendor") : "Default Vendor",
          requestRef: "$PREV.createdId",
          category: cat.category,
          itemSummary: cat.title,
          amount: cost,
          costCenter: rng.pick(["CC-ENG", "CC-OPS", "CC-ADMIN", "CC-FIN"]),
          orderDate: randomDateTimeInMonth(rng, month, 8 + i * 5, 12 + i * 5).slice(0, 10),
          expectedDate: randomFutureDate(rng, `${month}-15`, 2, 4),
          buyerEmail: actor.actorEmail,
          status: "approved",
        }, "/api/purchase-orders?pageSize=200"),
      ],
      expectedState: [`Purchase request ${poCode} created`, `PO created against request`],
      crossEvents: ["procurement.request-created", "procurement.po-created"],
      notifications: ["Procurement team notified", "Vendor notified of PO"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Vendor Evaluations ───────────────────────────────────────────────────────

function generateVendorStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];

  if (state.vendors.length === 0) return stories;

  // Evaluate 1-2 vendors per month.
  const evalCount = rng.int(1, Math.min(2, state.vendors.length));
  const actor = selectActor("vendor", state.employees, rng);
  const evaluatedVendors = rng.sample(state.vendors, evalCount);

  for (const vendor of evaluatedVendors) {
    ctx.sequence++;
    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, 10, 20),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "vendor",
      preconditions: [`Vendor ${vendor.displayName} is active`],
      intent: `Evaluate vendor: ${vendor.displayName}.`,
      steps: [
        step("vendor", "POST", "/api/vendor-scorecards", 201, {
          vendorId: vendor.id || vendor.code || vendor.displayName,
          period: month,
          deliveryScore: rng.int(6, 10),
          qualityScore: rng.int(6, 10),
          commercialScore: rng.int(5, 10),
          serviceScore: rng.int(6, 10),
          complianceScore: rng.int(7, 10),
          overallScore: rng.int(6, 10),
          band: rng.pick(["Preferred", "Approved", "Preferred"]),
          modelVersion: "v2",
        }, "/api/vendor-scorecards?pageSize=200"),
      ],
      expectedState: [`Vendor scorecard created for ${vendor.displayName}`],
      crossEvents: ["vendor.evaluation-completed"],
      notifications: ["Procurement team receives vendor evaluation"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Asset Management ─────────────────────────────────────────────────────────

function generateAssetStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];

  // 1-2 new assets per month (for new hires).
  const assetCount = rng.int(1, 2);
  const actor = selectActor("procurement", state.employees, rng);
  const assetTypes = [
    { tag: "LAPTOP", name: "MacBook Pro 16-inch", category: "laptop", cost: [180000, 280000] as [number, number] },
    { tag: "MONITOR", name: "Dell UltraSharp 27\"", category: "monitor", cost: [35000, 60000] as [number, number] },
    { tag: "PHONE", name: "Company Mobile Device", category: "phone", cost: [25000, 50000] as [number, number] },
  ];

  for (let i = 0; i < assetCount; i++) {
    ctx.sequence++;
    const assetType = rng.pick(assetTypes);
    const assetCode = nextAssetCode();
    const emp = rng.pick(state.employees);

    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, 5 + i * 5, 10 + i * 5),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "asset",
      preconditions: ["New hire needs equipment"],
      intent: `Assign ${assetType.name} to ${emp.fullName}.`,
      steps: [
        step("asset", "POST", "/api/assets", 201, {
          assetTag: `AST-${assetType.tag}-${assetCode}`,
          name: assetType.name,
          serialNumber: `SN-${assetType.tag.toUpperCase()}-Y2-${String(ctx.sequence).padStart(4, "0")}`,
          category: assetType.category,
          model: assetType.name,
          status: "assigned",
          assignedTo: emp.email,
          location: emp.location,
          purchaseDate: randomDateTimeInMonth(rng, month, 1, 5).slice(0, 10),
          purchaseCost: rng.int(assetType.cost[0], assetType.cost[1]),
        }, "/api/assets?pageSize=200"),
      ],
      expectedState: [`Asset AST-${assetType.tag}-${assetCode} assigned to ${emp.fullName}`],
      crossEvents: ["asset.assigned"],
      notifications: ["Employee notified of asset assignment"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Support Tickets ──────────────────────────────────────────────────────────

function generateSupportStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];
  const count = rng.int(1, 3);

  const ticketTypes = [
    { subject: "Login authentication failure", priority: "high", category: "access" },
    { subject: "Application performance degradation", priority: "medium", category: "performance" },
    { subject: "Data export request", priority: "low", category: "data" },
    { subject: "Feature request — dashboard customization", priority: "low", category: "feature" },
    { subject: "Integration error with third-party API", priority: "high", category: "integration" },
    { subject: "Password reset assistance", priority: "low", category: "access" },
    { subject: "Report generation failure", priority: "medium", category: "bug" },
    { subject: "Mobile app crash on startup", priority: "high", category: "bug" },
  ];

  for (let i = 0; i < count; i++) {
    ctx.sequence++;
    const ticket = rng.pick(ticketTypes);
    const customer = state.customers.length > 0
      ? rng.pick(state.customers).name
      : randomCompanyName(rng);
    const tktCode = nextTicketCode();
    const actor = selectActor("support", state.employees, rng);

    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, 3 + i * 7, 5 + i * 7),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "support",
      preconditions: [`Customer ${customer} has active contract`],
      intent: `Support ticket: ${ticket.subject} from ${customer}.`,
      steps: [
        step("support", "POST", "/api/tickets", 201, {
          ticketNo: tktCode,
          subject: ticket.subject,
          description: `${ticket.subject} reported by ${customer}. Priority: ${ticket.priority}. Category: ${ticket.category}.`,
          priority: ticket.priority,
          category: ticket.category,
          customerName: customer,
          raisedBy: `support.${customer.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          assignedTo: actor.actorEmail,
          status: "resolved",
        }, "/api/tickets?pageSize=200"),
      ],
      expectedState: [`Ticket ${tktCode} resolved`],
      crossEvents: ["support.ticket-resolved"],
      notifications: ["Customer notified of resolution"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Administration ───────────────────────────────────────────────────────────

function generateAdminStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];
  const actor = selectActor("administration", state.employees, rng);

  // 1 admin story per month (supplies, visitor, facility).
  ctx.sequence++;
  const adminTypes = [
    { name: "Monthly Office Supplies", unit: "batch", qty: rng.int(5, 20), status: "in_stock" },
    { name: "Visitor Management — Client Visit", unit: "visit", qty: rng.int(1, 5), status: "low" },
    { name: "Facility Maintenance — HVAC Service", unit: "service", qty: 1, status: "out_of_stock" },
    { name: "Pantry Restock", unit: "batch", qty: rng.int(10, 50), status: "in_stock" },
  ];

  const adminType = rng.pick(adminTypes);

  stories.push({
    id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
    month: month as ApiStory["month"],
    companyTime: randomDateTimeInMonth(rng, month, 8, 15),
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    module: "administration",
    preconditions: ["Office is operational"],
    intent: `Administration: ${adminType.name}.`,
    steps: [
      step("administration", "POST", "/api/supplies", 201, {
        name: adminType.name,
        unit: adminType.unit,
        quantity: adminType.qty,
        status: adminType.status,
      }, "/api/supplies?pageSize=200"),
    ],
    expectedState: [`Admin supply record created: ${adminType.name}`],
    crossEvents: ["administration.supply-recorded"],
    notifications: [],
    edgeCases: [],
    assertions: generatedAssertions,
  });

  return stories;
}

// ─── Combined Operations Generator ────────────────────────────────────────────

export function generateOperationsStories(ctx: GeneratorContext): ApiStory[] {
  return [
    ...generateProcurementStories(ctx),
    ...generateVendorStories(ctx),
    ...generateAssetStories(ctx),
    ...generateSupportStories(ctx),
    ...generateAdminStories(ctx),
  ];
}
