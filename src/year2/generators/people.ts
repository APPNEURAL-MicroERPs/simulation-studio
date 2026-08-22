/**
 * Year 2 Scenario Generator — People Generator
 *
 * Generates people-related stories: attendance batches, leave requests,
 * payroll inputs, performance cycles, and learning assignments.
 * Volume scales directly with employee count.
 */

import type { ApiStory } from "../api-stories";
import type { GeneratorContext } from "../types";
import { step, generatedAssertions } from "../types";
import { randomDateTimeInMonth } from "../probability";
import { selectActor, isQuarterlyMonth, workingDaysInMonth } from "../business-rules";

// ─── Attendance Batch ─────────────────────────────────────────────────────────

function generateAttendanceStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];
  const workingDays = workingDaysInMonth(month);

  // Generate one attendance story per week (batch of 5 days).
  const weeksInMonth = Math.ceil(workingDays / 5);
  for (let w = 0; w < weeksInMonth; w++) {
    ctx.sequence++;
    const weekStart = w * 5 + 1;
    const weekEnd = Math.min(weekStart + 4, workingDays);
    const actor = selectActor("hr", state.employees, rng);

    // Pick a sample of employees for attendance (not all — just representative).
    const sampleSize = Math.min(state.employees.length, rng.int(3, 8));
    const sampleEmployees = rng.sample(state.employees, sampleSize);

    const attendanceSteps = sampleEmployees.map((emp, idx) => {
      const day = Math.min(weekStart + idx, weekEnd);
      return step("attendance", "POST", "/api/attendance", 201, {
        employeeCode: emp.employeeCode,
        employeeEmail: emp.email,
        workDate: `${month}-${String(day).padStart(2, "0")}`,
        shift: "General",
        checkIn: `${String(rng.int(8, 10)).padStart(2, "0")}:${String(rng.pick([0, 5, 10, 15, 20, 25, 30])).padStart(2, "0")}`,
        checkOut: `${String(rng.int(17, 19)).padStart(2, "0")}:${String(rng.pick([0, 15, 30, 45])).padStart(2, "0")}`,
        location: emp.location,
        status: rng.chance(0.95) ? "present" : "absent",
      }, "/api/attendance?pageSize=200");
    });

    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, weekStart, weekEnd),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "attendance",
      preconditions: [`${sampleSize} employees active`, `Week ${w + 1} of ${month}`],
      intent: `Record weekly attendance for ${sampleSize} employees (Week ${w + 1}).`,
      steps: attendanceSteps,
      expectedState: [`${sampleSize} attendance records for week ${w + 1}`],
      crossEvents: ["attendance.recorded"],
      notifications: [],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Leave Requests ───────────────────────────────────────────────────────────

function generateLeaveStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];
  const leaveCount = rng.int(2, Math.max(3, Math.floor(state.employeeCount * 0.1)));

  for (let i = 0; i < leaveCount; i++) {
    ctx.sequence++;
    const emp = rng.pick(state.employees);
    const leaveTypes = ["casual", "sick", "earned", "personal"] as const;
    const leaveType = rng.pick(leaveTypes);
    const dayStart = rng.int(1, 20);
    const duration = rng.int(1, 5);
    const dayEnd = Math.min(dayStart + duration - 1, 28);
    const actor = selectActor("hr", state.employees, rng);

    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, dayStart, dayStart + 1),
      actorId: emp.employeeCode,
      actorRole: "member",
      module: "attendance",
      preconditions: [`${emp.fullName} is an active employee`],
      intent: `${emp.fullName} applies for ${leaveType} leave (${dayStart}-${dayEnd} ${month}).`,
      steps: [
        step("attendance", "POST", "/api/leave-requests", 201, {
          employeeId: emp.employeeCode,
          employeeCode: emp.employeeCode,
          leaveTypeId: leaveType,
          fromDate: `${month}-${String(dayStart).padStart(2, "0")}`,
          toDate: `${month}-${String(dayEnd).padStart(2, "0")}`,
          duration: "full_day",
          reason: `${leaveType.charAt(0).toUpperCase() + leaveType.slice(1)} leave for personal matters.`,
        }, "/api/leave-requests?pageSize=200"),
      ],
      expectedState: [`${leaveType} leave approved for ${emp.fullName}`],
      crossEvents: ["attendance.leave-approved"],
      notifications: ["Manager notified of leave approval"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Payroll Inputs ───────────────────────────────────────────────────────────

function generatePayrollStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];
  const actor = selectActor("finance", state.employees, rng);

  // Monthly payroll batch — one story with multiple inputs.
  ctx.sequence++;
  const payrollEmployees = rng.sample(state.employees, Math.min(state.employees.length, rng.int(5, 12)));
  const payrollSteps = payrollEmployees.map((emp) =>
    step("payroll", "POST", "/api/inputs", 201, {
      period: month,
      employeeCode: emp.employeeCode,
      kind: "bonus",
      amount: rng.int(50000, 250000),
      remarks: `Monthly payroll input for ${month}`,
      status: "draft",
    })
  );

  stories.push({
    id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
    month: month as ApiStory["month"],
    companyTime: randomDateTimeInMonth(rng, month, 25, 28),
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    module: "payroll",
    preconditions: [`${payrollEmployees.length} employees active`, `Month ${month} end`],
    intent: `Monthly payroll batch for ${payrollEmployees.length} employees.`,
    steps: payrollSteps,
    expectedState: [`${payrollEmployees.length} payroll inputs created for ${month}`],
    crossEvents: ["payroll.monthly-batch-created"],
    notifications: ["Finance controller reviews payroll batch"],
    edgeCases: [],
    assertions: generatedAssertions,
  });

  // Variable pay / bonus for some employees.
  if (rng.chance(0.3)) {
    ctx.sequence++;
    const bonusEmployees = rng.sample(state.employees, rng.int(1, 3));
    const bonusSteps = bonusEmployees.map((emp) =>
      step("payroll", "POST", "/api/inputs", 201, {
        period: month,
        employeeCode: emp.employeeCode,
        kind: "bonus",
        amount: rng.int(10000, 75000),
        remarks: `Performance bonus for ${month}`,
        status: "draft",
      })
    );

    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, 26, 28),
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      module: "payroll",
      preconditions: ["Monthly payroll batch created"],
      intent: `Variable pay / bonus for ${bonusEmployees.length} employees.`,
      steps: bonusSteps,
      expectedState: [`${bonusEmployees.length} bonus inputs created`],
      crossEvents: ["payroll.bonus-input-created"],
      notifications: [],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Performance Cycles (quarterly) ───────────────────────────────────────────

function generatePerformanceStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];

  // Only fire quarterly.
  if (!isQuarterlyMonth(month)) return stories;

  const actor = selectActor("performance", state.employees, rng);
  const quarterNum = ["03", "06", "09", "12"].indexOf(month.slice(5, 7)) + 1;

  // 2-step story: create cycle, then create goal linked to it
  ctx.sequence++;
  const goalEmp = rng.pick(state.employees);
  stories.push({
    id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
    month: month as ApiStory["month"],
    companyTime: randomDateTimeInMonth(rng, month, 1, 5),
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    module: "performance",
    preconditions: [`${state.employeeCount} employees active`, `Q${quarterNum} review due`],
    intent: `Q${quarterNum} performance cycle opened with first goal.`,
    steps: [
      step("performance", "POST", "/api/cycles", 201, {
        name: `Q${quarterNum} Review ${month.slice(0, 4)}`,
        cycleType: isQuarterlyMonth(month) && month.slice(5, 7) === "03" ? "annual" : "custom",
        startsOn: `${month}-01`,
        endsOn: `${month}-28`,
        ownerEmail: actor.actorEmail,
        minimumServiceDays: 90,
      }, "/api/cycles?pageSize=200"),
      step("performance", "POST", "/api/goals", 201, {
        title: `Q${quarterNum} ${rng.pick(["Deliver project milestones", "Improve code quality metrics", "Reduce incident response time", "Complete compliance training", "Achieve customer satisfaction target"])}`,
        description: `Performance goal for Q${quarterNum} aligned with department objectives.`,
        goalType: rng.pick(["company", "department", "team", "individual", "development"]),
        level: rng.pick(["individual", "team", "department"]),
        ownerCode: goalEmp.employeeCode,
        cycle: "$PREV.createdId",
        weightPercent: rng.int(20, 40),
        progressPercent: 0,
        startsOn: `${month}-01`,
        dueDate: `${month}-28`,
        status: "active",
      }, "/api/goals?pageSize=200"),
    ],
    expectedState: [`Q${quarterNum} performance cycle opened`, `Goal created for ${goalEmp.fullName}`],
    crossEvents: ["performance.cycle-opened", "performance.goal-created"],
    notifications: ["All managers notified to begin reviews", `${goalEmp.fullName} notified of new goal`],
    edgeCases: [],
    assertions: generatedAssertions,
  });

  return stories;
}

// ─── Learning Assignments ─────────────────────────────────────────────────────

function generateLearningStories(ctx: GeneratorContext): ApiStory[] {
  const { rng, month, state } = ctx;
  const stories: ApiStory[] = [];
  const learningCount = rng.int(1, 3);

  const courseTitles = [
    "Cloud Architecture Fundamentals", "Advanced TypeScript Patterns",
    "Security Best Practices for Developers", "Agile Project Management",
    "Data Privacy and GDPR Compliance", "Leadership Development Program",
    "DevOps CI/CD Pipeline Mastery", "Customer Success Methodology",
    "Financial Modeling for Managers", "Effective Communication Skills",
    "Machine Learning Introduction", "Kubernetes Administration",
    "Sales Negotiation Techniques", "Product Management Essentials",
    "Incident Response Procedures", "Microservices Architecture",
  ];

  for (let i = 0; i < learningCount; i++) {
    ctx.sequence++;
    const emp = rng.pick(state.employees);
    const title = rng.pick(courseTitles);

    stories.push({
      id: `Y2-${month}-${String(ctx.sequence).padStart(3, "0")}`,
      month: month as ApiStory["month"],
      companyTime: randomDateTimeInMonth(rng, month, 5 + i * 5, 10 + i * 5),
      actorId: emp.employeeCode,
      actorRole: "member",
      module: "learning",
      preconditions: [`${emp.fullName} is an active employee`],
      intent: `${emp.fullName} enrolled in "${title}".`,
      steps: [
        step("learning", "POST", "/api/development-plans", 201, {
          employeeCode: emp.employeeCode,
          title,
          description: `Professional development: ${title}. Aligned with role growth and company needs.`,
          source: rng.pick(["manager_recommendation", "self_nominated", "compliance_required", "career_path"]),
          startsOn: `${month}-01`,
          completesBy: `${month.slice(0, 5)}${String(Number(month.slice(5, 7)) + 2).padStart(2, "0")}-28`,
        }, "/api/development-plans?pageSize=200"),
      ],
      expectedState: [`${emp.fullName} enrolled in ${title}`],
      crossEvents: ["learning.enrollment-created"],
      notifications: ["Manager notified of learning assignment"],
      edgeCases: [],
      assertions: generatedAssertions,
    });
  }

  return stories;
}

// ─── Combined People Generator ────────────────────────────────────────────────

export function generatePeopleStories(ctx: GeneratorContext): ApiStory[] {
  return [
    ...generateAttendanceStories(ctx),
    ...generateLeaveStories(ctx),
    ...generatePayrollStories(ctx),
    ...generatePerformanceStories(ctx),
    ...generateLearningStories(ctx),
  ];
}
