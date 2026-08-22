/**
 * Year 2 Scenario Generator — Sales Generator
 *
 * Generates CRM stories: leads, opportunities, pipeline progression,
 * wins and losses. Volume scales with company phase.
 */

import type { ApiStory } from "../../api-stories";
import type { GeneratorContext } from "../types";
import { step, generatedAssertions } from "../types";
import {
  randomFullName, randomEmail, randomPhone, randomCompanyName,
  randomIndustry, randomSource, randomDealSize, randomDateTimeInMonth,
  nextLeadCode, nextOpportunityCode,
} from "../probability";
import { leadsPerMonth, winProbability, selectActor } from "../business-rules";

// ─── Lead Generator ───────────────────────────────────────────────────────────

function generateLeadStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state, phase } = ctx;
  const stories: ApiStory[] = [];
  const count = leadsPerMonth(phase, rng);
  const actor = selectActor("crm", state.employees, rng);

  for (let i = 0; i < count; i++) {
    ctx.sequence++;
    const company = randomCompanyName(rng);
    const contactName = randomFullName(rng);
    const dealSize = randomDealSize(rng, phase.name);
    const source = randomSource(rng);
    const industry = randomIndustry(rng);
    const dayBase = Math.max(1, Math.floor((i / count) * 22) + 1);

    // 2-step story: create lead, then convert to opportunity (linked via $PREV.createdId)
    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, dayBase, dayBase + 2),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "crm",
      preconditions: [`${state.customerCount} active customers`, `Sales team operational`],
      intent: `New lead: ${company} (${industry}) via ${source} — qualified to opportunity.`,
      steps: [
        step("crm", "POST", "/api/leads", 201, {
          company,
          contactName,
          title: rng.pick(["CTO", "VP Engineering", "Head of IT", "Director", "CEO", "COO", "VP Operations"]),
          email: randomEmail(contactName),
          phone: randomPhone(rng),
          source,
          country: "India",
          industry,
          companySize: rng.pick(["201-1000", "1001-5000"]),
          ownerEmail: actor.actorEmail,
          value: dealSize,
          currency: "INR",
        }, "/api/leads?pageSize=200"),
        step("crm", "POST", "/api/opportunities", 201, {
          name: `${company} — ${rng.pick(["ERP Implementation", "Digital Transformation", "Cloud Migration", "Platform Development", "Analytics Suite"])}`,
          code: nextOpportunityCode(),
          amount: dealSize,
          currency: "INR",
          stage: rng.pick(["new", "qualified", "discovery"]),
          probability: 20,
          forecastCategory: "pipeline",
          sourceLeadId: "$PREV.createdId",
          expectedCloseOn: randomDateTimeInMonth(rng, month, Math.min(dayBase + 30, 25), Math.min(dayBase + 60, 28)).slice(0, 10),
          businessNeed: `${company} needs ${rng.pick(["process automation", "system modernization", "scalable platform", "data analytics"])}`,
          nextAction: rng.pick(["Discovery call", "Technical demo", "Proposal submission"]),
          nextActionOn: randomDateTimeInMonth(rng, month, Math.min(dayBase + 7, 25), Math.min(dayBase + 14, 28)).slice(0, 10),
        }, "/api/opportunities?pageSize=200"),
      ],
      expectedState: [`Lead created for ${company}`, `Opportunity created from lead`],
      crossEvents: ["crm.lead-created", "crm.opportunity-created"],
      notifications: ["Lead owner receives follow-up reminder", "Opportunity added to pipeline"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Opportunity Generator ────────────────────────────────────────────────────

function generateOpportunityStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state, phase } = ctx;
  const stories: ApiStory[] = [];
  const count = rng.int(2, Math.max(3, Math.floor(leadsPerMonth(phase, rng) * 0.5)));
  const actor = selectActor("crm", state.employees, rng);

  const stages = ["new", "qualified", "discovery", "solution", "proposal", "negotiation", "won", "lost"];

  for (let i = 0; i < count; i++) {
    ctx.sequence++;
    const oppCode = nextOpportunityCode();
    const dealSize = randomDealSize(rng, phase.name);
    const company = randomCompanyName(rng);
    const stage = rng.pick(stages);
    const dayBase = Math.max(1, Math.floor((i / count) * 20) + 3);

    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, dayBase, dayBase + 5),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "crm",
      preconditions: [`Pipeline has ${state.opportunityCount} opportunities`],
      intent: `Create opportunity: ${company} — ${oppCode} (${stage}).`,
      steps: [
        step("crm", "POST", "/api/opportunities", 201, {
          name: `${company} — ${rng.pick(["ERP Implementation", "Digital Transformation", "Cloud Migration", "Platform Development", "Analytics Suite", "Custom Software"])}`,
          code: oppCode,
          amount: dealSize,
          currency: "INR",
          stage,
          probability: stage === "new" ? 10 : stage === "qualified" ? 20 : stage === "discovery" ? 30 : stage === "solution" ? 40 : stage === "proposal" ? 55 : stage === "negotiation" ? 75 : stage === "commit" ? 90 : stage === "won" ? 100 : 0,
          forecastCategory: stage === "won" ? "closed" : stage === "lost" ? "omitted" : stage === "negotiation" || stage === "commit" ? "commit" : stage === "proposal" ? "best_case" : "pipeline",
          expectedCloseOn: randomDateTimeInMonth(rng, month, Math.min(dayBase + 30, 25), Math.min(dayBase + 60, 28)).slice(0, 10),
          businessNeed: `${company} needs ${rng.pick(["process automation", "system modernization", "scalable platform", "data analytics", "customer engagement tools"])}`,
          nextAction: rng.pick(["Discovery call", "Proposal submission", "Technical demo", "Pricing discussion", "Contract review"]),
          nextActionOn: randomDateTimeInMonth(rng, month, Math.min(dayBase + 7, 25), Math.min(dayBase + 14, 28)).slice(0, 10),
        }, "/api/opportunities?pageSize=200"),
      ],
      expectedState: [`Opportunity ${oppCode} created at ${stage} stage`],
      crossEvents: ["crm.opportunity-created"],
      notifications: ["Opportunity owner receives pipeline task"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Customer Onboarding (from won deals) ─────────────────────────────────────

function generateCustomerStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];

  // Probability of winning a new customer this month.
  if (rng.chance(winProbability(ctx.phase))) {
    ctx.sequence++;
    const company = randomCompanyName(rng);
    const actor = selectActor("customer", state.employees, rng);

    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, 15, 25),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "customer",
      preconditions: ["Deal won in CRM", "Customer ready for onboarding"],
      intent: `New customer onboarded: ${company}.`,
      steps: [
        step("customer", "POST", "/api/customers", 201, {
          name: company,
          ownerEmail: actor.actorEmail,
          tier: rng.pick(["growth", "mid_market", "enterprise"]),
          description: `New customer acquired through ${rng.pick(["direct sales", "partner referral", "marketing campaign", "inbound lead"])}. Contract signed for ${rng.pick(["ERP implementation", "platform development", "digital transformation", "managed services"])}.`,
        }, "/api/customers?pageSize=200"),
      ],
      expectedState: [`Customer ${company} onboarded`],
      crossEvents: ["customer.onboarded"],
      notifications: ["Customer success manager assigned"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Combined Sales Generator ─────────────────────────────────────────────────

export function generateSalesStories(ctx: GeneratorContext): ApiStory[] {
  return [
    ...generateLeadStories(ctx),
    ...generateOpportunityStories(ctx),
    ...generateCustomerStories(ctx),
  ];
}
