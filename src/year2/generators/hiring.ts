/**
 * Year 2 Scenario Generator — Hiring Generator
 *
 * Generates recruitment stories: requisitions, candidates, interview stages,
 * offers, and new employee joins. Volume scales with company phase.
 */

import type { ApiStory } from "../../api-stories";
import type { GeneratorContext } from "../types";
import { step, generatedAssertions } from "../types";
import {
  randomFullName, randomEmail, randomPhone, randomLocation,
  randomDesignation, randomSkills, randomSalary, randomNoticePeriod,
  randomDateTimeInMonth, nextRequisitionCode,
} from "../probability";
import { requisitionsPerMonth, offerRejectionProbability, selectActor } from "../business-rules";

// ─── Role Templates ───────────────────────────────────────────────────────────

const ROLE_TEMPLATES = [
  { title: "Software Engineer", dept: "Engineering", level: "mid" as const, skills: "React, TypeScript, Node.js", budget: [1200000, 2000000] },
  { title: "Senior Software Engineer", dept: "Engineering", level: "senior" as const, skills: "React, TypeScript, System Design", budget: [2000000, 3200000] },
  { title: "QA Engineer", dept: "QA", level: "mid" as const, skills: "Selenium, Cypress, TypeScript", budget: [1000000, 1800000] },
  { title: "Senior QA Engineer", dept: "QA", level: "senior" as const, skills: "Test Automation, CI/CD, Performance Testing", budget: [1800000, 2800000] },
  { title: "DevOps Engineer", dept: "DevOps", level: "mid" as const, skills: "Kubernetes, Terraform, AWS", budget: [1500000, 2500000] },
  { title: "Product Designer", dept: "Design", level: "mid" as const, skills: "Figma, User Research, Prototyping", budget: [1200000, 2200000] },
  { title: "Business Analyst", dept: "Product", level: "mid" as const, skills: "Requirements, User Stories, Data Analysis", budget: [1000000, 1800000] },
  { title: "Sales Executive", dept: "Sales", level: "junior" as const, skills: "CRM, Negotiation, Pipeline Management", budget: [800000, 1400000] },
  { title: "Account Manager", dept: "Sales", level: "mid" as const, skills: "Customer Success, Upselling, Relationship Management", budget: [1400000, 2400000] },
  { title: "Financial Analyst", dept: "Finance", level: "mid" as const, skills: "Financial Modeling, Excel, Accounting", budget: [1000000, 1800000] },
  { title: "HR Executive", dept: "People", level: "junior" as const, skills: "Recruitment, HR Operations, Compliance", budget: [600000, 1000000] },
  { title: "Support Engineer", dept: "Support", level: "junior" as const, skills: "Technical Support, Customer Communication, Troubleshooting", budget: [600000, 1200000] },
  { title: "Data Engineer", dept: "Data", level: "mid" as const, skills: "Python, SQL, ETL, Spark", budget: [1500000, 2500000] },
  { title: "Security Engineer", dept: "Governance", level: "mid" as const, skills: "Penetration Testing, SIEM, Compliance", budget: [1500000, 2800000] },
];

// ─── Generator ────────────────────────────────────────────────────────────────

export function generateHiringStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state, phase } = ctx;
  const stories: ApiStory[] = [];
  const count = requisitionsPerMonth(phase, rng);
  const templates = rng.sample(ROLE_TEMPLATES, Math.min(count, ROLE_TEMPLATES.length));

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length]!;
    const reqCode = nextRequisitionCode();
    const location = randomLocation(rng);
    const actor = selectActor("recruitment", state.employees, rng);
    const dayBase = Math.max(1, Math.floor((i / count) * 20) + 1);

    // Story 1: Create requisition + post job (2-step story with dynamic ID reference)
    ctx.sequence++;
    const workModes = ["onsite", "hybrid", "remote"] as const;
    const channels = ["careers_site", "agency", "referral_only", "campus"] as const;
    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, dayBase, dayBase + 3),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "recruitment",
      preconditions: [`Company has ${state.employeeCount} employees`, `${phase.label} phase`],
      intent: `Open requisition for ${template.title} in ${template.dept} and post job.`,
      steps: [
        step("recruitment", "POST", "/api/requisitions", 201, {
          title: `${template.title} — ${location}`,
          reason: "new",
          departmentName: template.dept,
          locationName: location,
          employmentType: "full_time",
          openings: rng.int(1, phase.name === "startup-40" ? 1 : 2),
          hiringManagerEmail: actor.actorEmail,
          recruiterEmail: actor.actorEmail,
          targetStartOn: (() => { const yr = Number(month.slice(0, 4)); const mo = Number(month.slice(5, 7)); return mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, "0")}-01`; })(),
          justification: `Hiring need driven by ${phase.label} growth phase. Department: ${template.dept}.`,
          budgetMin: template.budget[0],
          budgetMax: template.budget[1],
          currency: "INR",
        }, "/api/requisitions?pageSize=200"),
        step("recruitment", "POST", "/api/jobs", 201, {
          requisitionId: "$PREV.createdId",
          title: `${template.title} — ${location}`,
          summary: `Join our ${template.dept} team as a ${template.title}.`,
          responsibilities: `Deliver high-quality work in ${template.dept}; collaborate with cross-functional stakeholders.`,
          requirements: `${template.skills}; ${rng.int(2, 8)}+ years relevant experience.`,
          skills: template.skills,
          locationName: location,
          workMode: workModes[rng.int(0, workModes.length - 1)],
          experienceMinYears: template.level === "junior" ? 1 : template.level === "mid" ? 3 : 6,
          experienceMaxYears: template.level === "junior" ? 4 : template.level === "mid" ? 8 : 15,
          channel: channels[rng.int(0, channels.length - 1)],
        }, "/api/jobs?pageSize=200"),
      ],
      expectedState: [`Requisition ${reqCode} created for ${template.title}`, `Job posted for ${template.title}`],
      crossEvents: ["recruitment.requisition-created", "recruitment.job-posted"],
      notifications: [`Hiring manager notified for ${template.title} role`, `Job posted on recruitment channel`],
      edgeCases: [],
      assertions: generatedAssertions,
    });

    // Story 2: Add candidate(s) for this requisition
    const candidateCount = rng.int(1, 3);
    for (let c = 0; c < candidateCount; c++) {
      ctx.sequence++;
      const name = randomFullName(rng);
      const email = randomEmail(name);
      const phone = randomPhone(rng);
      const exp = rng.int(12, 120);
      const salary = randomSalary(rng, template.level);
      const notice = randomNoticePeriod(rng);
      const source = rng.pick(["referral", "linkedin", "careers_site", "inbound", "agency", "campus"]);

      stories.push({
        id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
        month: month as ApiStory["month"],
        companyTime: randomDateTimeInMonth(rng, month, dayBase + 3, dayBase + 10),
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        module: "recruitment",
        preconditions: [`Requisition ${reqCode} exists`],
        intent: `Add candidate ${name} for ${template.title} role.`,
        steps: [
          step("recruitment", "POST", "/api/candidates", 201, {
            fullName: name,
            email,
            phone,
            locationName: location,
            currentTitle: randomDesignation(rng, template.level),
            totalExperienceMonths: exp,
            skills: randomSkills(rng, rng.int(3, 6)),
            source,
            noticePeriodDays: notice,
            expectedCtc: salary,
            currency: "INR",
            status: "active",
            notes: `Candidate for ${template.title} — ${reqCode}`,
          }, "/api/candidates?pageSize=200"),
        ],
        expectedState: [`Candidate ${name} added to pipeline`],
        crossEvents: ["recruitment.candidate-created"],
        notifications: [],
        edgeCases: [],
        assertions: generatedAssertions,
      });
    }

    // Story 3: Create new employee (hire) — simulates offer accepted + joining
    if (rng.chance(0.7)) {
      ctx.sequence++;
      const hireName = randomFullName(rng);
      const hireEmail = randomEmail(hireName);
      const joinDate = randomDateTimeInMonth(rng, month, Math.min(dayBase + 14, 20), Math.min(dayBase + 25, 28));
      const hireDept = template.dept;
      const hireLocation = location;
      const hireDesignation = randomDesignation(rng, template.level);
      const hrActor = selectActor("hr", state.employees, rng);

      stories.push({
        id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
        month: month as ApiStory["month"],
        companyTime: joinDate,
        actorId: hrActor.actorId,
        actorRole: hrActor.actorRole,
        module: "hr",
        preconditions: [`Offer accepted by ${hireName}`, `${template.title} requisition filled`],
        intent: `Register new employee ${hireName} joining as ${hireDesignation}.`,
        steps: [
          step("hr", "POST", "/api/employees", 201, {
            employeeCode: `EMP-Y2-${String(ctx.sequence).padStart(3, "0")}`,
            fullName: hireName,
            email: hireEmail,
            designation: hireDesignation,
            department: hireDept,
            location: hireLocation,
            employmentType: "full_time",
            employmentStatus: "active",
            dateOfJoining: joinDate.slice(0, 10),
          }, "/api/employees?pageSize=500"),
        ],
        expectedState: [`${hireName} registered as active employee`],
        crossEvents: ["hr.employee-created", "hr.employee-joined"],
        notifications: ["Attendance, Payroll, Asset, Security receive employee.joined"],
        edgeCases: [],
        assertions: generatedAssertions,
      });
    }
  }

  return stories;
}
