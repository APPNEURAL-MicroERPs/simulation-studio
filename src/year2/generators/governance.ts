/**
 * Year 2 Scenario Generator — Governance Generator
 *
 * Generates governance stories: security reviews, compliance findings,
 * audit evidence, risk register updates, and legal matters.
 */

import type { ApiStory } from "../api-stories";
import type { GeneratorContext } from "../types";
import { step, generatedAssertions } from "../types";
import { randomDateTimeInMonth } from "../probability";
import { selectActor, isQuarterlyMonth, incidentProbability } from "../business-rules";

// ─── Security Reviews ─────────────────────────────────────────────────────────

function generateSecurityStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];
  const actor = selectActor("security", state.employees, rng);

  // 1 security review per month.
  ctx.sequence++;
  const reviewTypes: Array<{ name: string; kind: "access_review" | "architecture_review" | "code_review" | "third_party" }> = [
    { name: "Monthly Access Review", kind: "access_review" },
    { name: "Architecture Security Review", kind: "architecture_review" },
    { name: "Code Security Audit", kind: "code_review" },
    { name: "Third-Party Security Assessment", kind: "third_party" },
  ];
  const review = rng.pick(reviewTypes);
  const findings = rng.int(0, 3);

  // 2-step story: create review, then create findings linked to it
  stories.push({
    id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
    month: month as ApiStory["month"],
    companyTime: randomDateTimeInMonth(rng, month, 5, 15),
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    module: "security",
    preconditions: [`${state.employeeCount} employees`, `${state.securityReviewCount} prior security reviews`],
    intent: `Security review: ${review.name}. ${findings} findings raised and documented.`,
    steps: [
      step("security", "POST", "/api/reviews", 201, {
        name: `${review.name} — ${month}`,
        kind: review.kind,
        scope: `${state.employeeCount} employees, ${state.activeProjectCount} active projects, cloud infrastructure`,
        performedOn: randomDateTimeInMonth(rng, month, 5, 15).slice(0, 10),
        reviewerEmail: actor.actorEmail,
        findingsRaised: findings,
        status: "completed",
      }, "/api/reviews?pageSize=200"),
      ...(findings > 0 ? [{
        module: "security" as const,
        method: "POST" as const,
        path: "/api/findings",
        expectedStatus: 201,
        body: {
          findingCode: `SF-Y2-${String(ctx.sequence).padStart(3, "0")}`,
          title: `${review.name}: ${rng.pick(["Outdated dependency detected", "Open port found on staging", "Missing MFA on admin accounts", "Excessive IAM permissions", "Unencrypted data at rest"])}`,
          source: "SECURITY_ASSESSMENT" as const,
          reviewId: "$PREV.createdId",
          severity: rng.pick(["HIGH", "MEDIUM", "LOW"]) as string,
          priority: rng.pick(["P1", "P2", "P3"]) as string,
          status: "NEW",
          description: `Finding from ${review.name}. Requires remediation within SLA.`,
          ownerEmail: actor.actorEmail,
          team: review.kind === "code_review" ? "Engineering" : review.kind === "access_review" ? "IT" : "Infrastructure",
          detectedOn: randomDateTimeInMonth(rng, month, 5, 15).slice(0, 10),
          slaDays: 30,
        },
        verifyListPath: "/api/findings?pageSize=200",
      }] : []),
    ],
    expectedState: [`Security review completed: ${review.name}`, ...(findings > 0 ? [`Security finding documented`] : [])],
    crossEvents: ["security.review-completed", ...(findings > 0 ? ["security.finding-raised"] : [])],
    notifications: [findings > 0 ? `${findings} security findings require remediation` : "No critical findings"],
    edgeCases: [],
    assertions: generatedAssertions,
  });

  // Production incident (probability-based).
  if (rng.chance(incidentProbability(ctx.phase))) {
    ctx.sequence++;
    const severities = ["low", "medium", "high", "critical"];
    const severity = rng.pick(severities);
    const incidents = [
      "Credential stuffing attack detected and blocked",
      "Dependency vulnerability found in production package",
      "Unauthorized access attempt to admin panel",
      "SSL certificate near-expiry detected",
      "Production API rate limit exceeded",
      "Phishing email campaign targeting employees",
    ];

    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, 16, 25),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "security",
      preconditions: ["Production environment active"],
      intent: `Security incident: ${rng.pick(incidents)}.`,
      steps: [
        step("security", "POST", "/api/reviews", 201, {
          name: `SEC-INC-${String(ctx.sequence).padStart(3, "0")} — Security Incident Response`,
          kind: "access_review",
          scope: `Production systems affected. Severity: ${severity}. Incident detected and contained.`,
          performedOn: randomDateTimeInMonth(rng, month, 16, 25).slice(0, 10),
          reviewerEmail: actor.actorEmail,
          findingsRaised: 1,
          status: "completed",
        }),
      ],
      expectedState: [`Security incident documented and resolved`],
      crossEvents: ["security.incident-resolved"],
      notifications: ["Security team and management notified"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Compliance Findings ──────────────────────────────────────────────────────

function generateComplianceStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];
  const actor = selectActor("compliance", state.employees, rng);

  // 1 compliance finding per month.
  ctx.sequence++;
  const findings = [
    { ref: "COMP", title: "Access control review — user access rights validated", severity: "low" as const },
    { ref: "COMP", title: "Data retention policy compliance check", severity: "medium" as const },
    { ref: "COMP", title: "Change management process adherence audit", severity: "low" as const },
    { ref: "COMP", title: "Vendor risk assessment — annual review due", severity: "medium" as const },
    { ref: "COMP", title: "Backup and disaster recovery verification", severity: "low" as const },
    { ref: "COMP", title: "Employee onboarding compliance checklist", severity: "low" as const },
    { ref: "COMP", title: "Privacy impact assessment for new feature", severity: "medium" as const },
    { ref: "COMP", title: "Incident response plan drill — quarterly", severity: "low" as const },
  ];

  const finding = rng.pick(findings);

  stories.push({
    id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
    month: month as ApiStory["month"],
    companyTime: randomDateTimeInMonth(rng, month, 10, 20),
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    module: "compliance",
    preconditions: [`${state.findingCount} prior compliance findings`],
    intent: `Compliance finding: ${finding.title}.`,
    steps: [
      step("compliance", "POST", "/api/findings", 201, {
        findingRef: `${finding.ref}-Y2-${String(ctx.sequence).padStart(3, "0")}`,
        title: finding.title,
        severity: finding.severity,
        ownerEmail: actor.actorEmail,
        description: `${finding.title}. Assessed during ${month} compliance review cycle. Status: documented and tracked for remediation.`,
        status: "open",
      }, "/api/findings?pageSize=200"),
    ],
    expectedState: [`Compliance finding documented`],
    crossEvents: ["compliance.finding-raised"],
    notifications: ["Finding owner notified for remediation"],
    edgeCases: [],
    assertions: generatedAssertions,
  });

  return stories;
}

// ─── Audit Evidence ───────────────────────────────────────────────────────────

function generateAuditStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];

  // Audit evidence quarterly.
  if (!isQuarterlyMonth(month)) return stories;

  const actor = selectActor("audit", state.employees, rng);
  ctx.sequence++;

  stories.push({
    id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
    month: month as ApiStory["month"],
    companyTime: randomDateTimeInMonth(rng, month, 15, 25),
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    module: "audit",
    preconditions: [`${state.auditCampaignCount} prior audit campaigns`],
    intent: `Collect audit evidence for quarterly review.`,
    steps: [
      step("audit", "POST", "/api/evidence", 201, {
        auditRef: `AUD-Y2-Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`,
        name: `Quarterly Audit Evidence Collection — ${month}. Scope: Finance, HR, Procurement, Security, Projects. Samples reviewed: ${rng.int(10, 50)} transactions.`,
        obtainedOn: randomDateTimeInMonth(rng, month, 15, 25).slice(0, 10),
        obtainedBy: actor.actorEmail,
        source: "Internal audit fieldwork — cross-ERP evidence collection",
        status: "accepted",
      }, "/api/evidence?pageSize=200"),
    ],
    expectedState: ["Audit evidence collected and accepted"],
    crossEvents: ["audit.evidence-collected"],
    notifications: ["Audit findings shared with management"],
    edgeCases: [],
    assertions: generatedAssertions,
  });

  return stories;
}

// ─── Risk Register ────────────────────────────────────────────────────────────

function generateRiskStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];
  const actor = selectActor("risk", state.employees, rng);

  // 1 risk entry per month.
  ctx.sequence++;
  const risks = [
    { title: "Key person dependency risk", category: "operational", likelihood: 3, impact: 4 },
    { title: "Customer concentration risk", category: "financial", likelihood: 3, impact: 4 },
    { title: "Technology stack obsolescence", category: "technical", likelihood: 2, impact: 3 },
    { title: "Cash flow timing mismatch", category: "financial", likelihood: 2, impact: 3 },
    { title: "Vendor lock-in risk", category: "operational", likelihood: 2, impact: 3 },
    { title: "Regulatory change impact", category: "compliance", likelihood: 2, impact: 4 },
    { title: "Cybersecurity threat escalation", category: "security", likelihood: 3, impact: 5 },
    { title: "Talent attrition risk", category: "people", likelihood: 3, impact: 3 },
    { title: "Project delivery delay risk", category: "delivery", likelihood: 3, impact: 3 },
    { title: "Data breach potential", category: "security", likelihood: 2, impact: 5 },
  ];

  const risk = rng.pick(risks);

  stories.push({
    id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
    month: month as ApiStory["month"],
    companyTime: randomDateTimeInMonth(rng, month, 18, 25),
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    module: "risk",
    preconditions: [`${state.riskCount} risks in register`],
    intent: `Risk registered: ${risk.title}.`,
    steps: [
      step("risk", "POST", "/api/risks", 201, {
        riskRef: `RISK-Y2-${String(ctx.sequence).padStart(3, "0")}`,
        title: risk.title,
        category: risk.category,
        description: `${risk.title}. Identified during ${month} risk assessment. Likelihood: ${risk.likelihood}/5, Impact: ${risk.impact}/5. Treatment plan: ${rng.pick(["mitigate", "transfer", "accept", "avoid"])}.`,
        ownerEmail: actor.actorEmail,
        likelihood: risk.likelihood,
        impact: risk.impact,
        treatment: rng.pick(["mitigate", "transfer", "accept", "avoid"]),
        status: "assessed",
        reviewDue: randomDateTimeInMonth(rng, month, 25, 28).slice(0, 10),
      }, "/api/risks?pageSize=200"),
    ],
    expectedState: [`Risk registered: ${risk.title}`],
    crossEvents: ["risk.registered"],
    notifications: ["Risk owner notified for treatment plan"],
    edgeCases: [],
    assertions: generatedAssertions,
  });

  return stories;
}

// ─── Legal Matters ────────────────────────────────────────────────────────────

function generateLegalStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];

  // Legal matter every 2-3 months.
  if (!rng.chance(0.4)) return stories;

  const actor = selectActor("legal", state.employees, rng);
  ctx.sequence++;

  const matterTypes = [
    { title: "Contract dispute resolution", phase: "DISCUSSION", status: "PROPOSED" },
    { title: "IP protection filing", phase: "COMPLETED", status: "COMPLETED" },
    { title: "Regulatory compliance advisory", phase: "LEGAL_REVIEW", status: "PROPOSED" },
    { title: "Employee dispute mediation", phase: "IMPLEMENTATION", status: "APPROVED" },
    { title: "Vendor contract negotiation", phase: "PROPOSAL", status: "PROPOSED" },
  ];

  const matter = rng.pick(matterTypes);

  stories.push({
    id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
    month: month as ApiStory["month"],
    companyTime: randomDateTimeInMonth(rng, month, 12, 20),
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    module: "legal",
    preconditions: ["Legal department operational"],
    intent: `Legal matter: ${matter.title}.`,
    steps: [
      step("legal", "POST", "/api/settlements", 201, {
        matterRef: `MAT-Y2-${String(ctx.sequence).padStart(3, "0")}`,
        amount: rng.int(50000, 500000),
        currency: "INR",
        nonMonetaryTerms: `${matter.title}. Managed by legal team. Phase: ${matter.phase}.`,
        phase: matter.phase,
        status: matter.status,
      }, "/api/settlements?pageSize=200"),
    ],
    expectedState: [`Legal matter documented: ${matter.title}`],
    crossEvents: ["legal.matter-recorded"],
    notifications: ["Legal team and management notified"],
    edgeCases: [],
    assertions: generatedAssertions,
  });

  return stories;
}

// ─── Combined Governance Generator ────────────────────────────────────────────

export function generateGovernanceStories(ctx: GeneratorContext): ApiStory[] {
  return [
    ...generateSecurityStories(ctx),
    ...generateComplianceStories(ctx),
    ...generateAuditStories(ctx),
    ...generateRiskStories(ctx),
    ...generateLegalStories(ctx),
  ];
}
