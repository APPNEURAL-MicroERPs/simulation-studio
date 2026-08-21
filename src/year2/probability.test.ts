import assert from "node:assert/strict";
import test from "node:test";
import {
  createRNG,
  randomFullName, randomEmail, randomPhone, randomLocation,
  randomDepartment, randomDesignation, randomSkills, randomCompanyName,
  randomIndustry, randomSource, randomDealSize, randomSalary,
  randomNoticePeriod, randomDateInMonth, randomDateTimeInMonth,
  randomFutureDate, resetCounters, initializeCountersForMonth,
  nextRequisitionCode, nextCandidateCode, nextLeadCode,
  nextOpportunityCode, nextProjectCode, nextExpenseCode,
  nextJournalCode, nextTicketCode, nextPOCode, nextAssetCode,
  nextInvoiceCode, nextAllocationCode,
} from "./probability";

// ─── Seeded PRNG ─────────────────────────────────────────────────────────────

test("createRNG produces deterministic output for the same seed", () => {
  const rng1 = createRNG("test-seed-42");
  const rng2 = createRNG("test-seed-42");
  const seq1 = Array.from({ length: 10 }, () => rng1());
  const seq2 = Array.from({ length: 10 }, () => rng2());
  assert.deepEqual(seq1, seq2);
});

test("createRNG produces different output for different seeds", () => {
  const rng1 = createRNG("seed-alpha");
  const rng2 = createRNG("seed-beta");
  const v1 = rng1();
  const v2 = rng2();
  assert.notEqual(v1, v2);
});

test("createRNG produces values in [0, 1)", () => {
  const rng = createRNG("range-test");
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range [0, 1)`);
  }
});

test("RNG int produces values in [min, max] inclusive", () => {
  const rng = createRNG("int-test");
  for (let i = 0; i < 500; i++) {
    const v = rng.int(3, 7);
    assert.ok(v >= 3 && v <= 7, `int value ${v} out of range [3, 7]`);
    assert.equal(v, Math.floor(v), "int must return an integer");
  }
});

test("RNG chance returns boolean", () => {
  const rng = createRNG("chance-test");
  for (let i = 0; i < 100; i++) {
    const v = rng.chance(0.5);
    assert.equal(typeof v, "boolean");
  }
});

test("RNG chance(0) always returns false", () => {
  const rng = createRNG("chance-zero");
  for (let i = 0; i < 100; i++) {
    assert.equal(rng.chance(0), false);
  }
});

test("RNG chance(1) always returns true", () => {
  const rng = createRNG("chance-one");
  for (let i = 0; i < 100; i++) {
    assert.equal(rng.chance(1), true);
  }
});

test("RNG pick returns an element from the array", () => {
  const rng = createRNG("pick-test");
  const items = ["a", "b", "c", "d"];
  for (let i = 0; i < 100; i++) {
    const v = rng.pick(items);
    assert.ok(items.includes(v), `picked value ${v} not in array`);
  }
});

test("RNG shuffle returns same elements in potentially different order", () => {
  const rng = createRNG("shuffle-test");
  const items = [1, 2, 3, 4, 5];
  const shuffled = rng.shuffle([...items]);
  assert.equal(shuffled.length, items.length);
  assert.deepEqual([...shuffled].sort(), [...items].sort());
});

test("RNG sample returns n unique items", () => {
  const rng = createRNG("sample-test");
  const items = ["a", "b", "c", "d", "e", "f", "g"];
  const sample = rng.sample(items, 3);
  assert.equal(sample.length, 3);
  assert.equal(new Set(sample).size, 3, "sample must have unique items");
  for (const v of sample) {
    assert.ok(items.includes(v));
  }
});

test("RNG sample with n > items.length returns all items", () => {
  const rng = createRNG("sample-overflow");
  const items = ["x", "y"];
  const sample = rng.sample(items, 10);
  assert.equal(sample.length, 2);
});

// ─── Random Data Generators ──────────────────────────────────────────────────

test("randomFullName returns 'FirstName LastName' format", () => {
  const rng = createRNG("name-test");
  for (let i = 0; i < 20; i++) {
    const name = randomFullName(rng);
    assert.match(name, /^[A-Z][a-z]+ [A-Z][a-z]+$/u, `name '${name}' must be 'First Last' format`);
  }
});

test("randomEmail converts name to lowercase dotted email", () => {
  assert.equal(randomEmail("Priya Sharma"), "priya.sharma@example.com");
  assert.equal(randomEmail("Arjun Kumar"), "arjun.kumar@example.com");
  assert.equal(randomEmail("Single"), "single@example.com");
});

test("randomPhone returns Indian mobile format", () => {
  const rng = createRNG("phone-test");
  for (let i = 0; i < 20; i++) {
    const phone = randomPhone(rng);
    assert.match(phone, /^\+91-9[05-8]\d{8}$/u, `phone '${phone}' must match Indian mobile format`);
  }
});

test("randomLocation returns a known location", () => {
  const rng = createRNG("loc-test");
  const validLocations = ["Udaipur", "Bengaluru", "Gurugram", "Mumbai", "Pune", "Hyderabad", "Chennai", "Noida"];
  for (let i = 0; i < 20; i++) {
    assert.ok(validLocations.includes(randomLocation(rng)));
  }
});

test("randomDepartment returns a known department", () => {
  const rng = createRNG("dept-test");
  const validDepts = ["Engineering", "QA", "Product", "Design", "Sales", "Marketing", "Finance", "People", "Operations", "Support", "DevOps", "Data"];
  for (let i = 0; i < 20; i++) {
    assert.ok(validDepts.includes(randomDepartment(rng)));
  }
});

test("randomDesignation returns level-appropriate title", () => {
  const rng = createRNG("desig-test");
  const juniorTitles = ["Junior Engineer", "Associate Engineer", "Junior Analyst", "Junior Developer", "Trainee Engineer"];
  const seniorTitles = ["Lead Engineer", "Principal Engineer", "Manager", "Senior Manager", "Staff Engineer", "Tech Lead"];

  for (let i = 0; i < 20; i++) {
    assert.ok(juniorTitles.includes(randomDesignation(rng, "junior")));
    assert.ok(seniorTitles.includes(randomDesignation(rng, "senior")));
  }
});

test("randomSkills returns comma-separated skills", () => {
  const rng = createRNG("skills-test");
  const skills = randomSkills(rng, 3);
  const parts = skills.split(", ");
  assert.equal(parts.length, 3);
  for (const s of parts) {
    assert.ok(s.length > 0);
  }
});

test("randomCompanyName returns 'Part1 Part2' format", () => {
  const rng = createRNG("company-test");
  for (let i = 0; i < 10; i++) {
    const name = randomCompanyName(rng);
    const parts = name.split(" ");
    assert.equal(parts.length, 2, `company name '${name}' must have 2 parts`);
    assert.ok(parts[0]!.length > 0);
    assert.ok(parts[1]!.length > 0);
  }
});

test("randomDealSize respects phase ranges", () => {
  const rng = createRNG("deal-test");
  for (let i = 0; i < 50; i++) {
    const startup = randomDealSize(rng, "startup-40");
    assert.ok(startup >= 500000 && startup <= 5000000);
    assert.equal(startup % 10000, 0, "deal size must be rounded to 10K");
  }
});

test("randomSalary respects level ranges", () => {
  const rng = createRNG("salary-test");
  for (let i = 0; i < 50; i++) {
    const junior = randomSalary(rng, "junior");
    assert.ok(junior >= 400000 && junior <= 800000);
    assert.equal(junior % 50000, 0, "salary must be rounded to 50K");

    const senior = randomSalary(rng, "senior");
    assert.ok(senior >= 1800000 && senior <= 3500000);
  }
});

test("randomNoticePeriod returns standard values", () => {
  const rng = createRNG("notice-test");
  const valid = [0, 15, 30, 60, 90];
  for (let i = 0; i < 50; i++) {
    assert.ok(valid.includes(randomNoticePeriod(rng)));
  }
});

test("randomDateInMonth returns date within the month", () => {
  const rng = createRNG("date-test");
  for (let i = 0; i < 20; i++) {
    const date = randomDateInMonth(rng, "2027-06", 5, 15);
    assert.match(date, /^2027-06-\d{2}$/u);
    const day = parseInt(date.slice(8, 10), 10);
    assert.ok(day >= 5 && day <= 15);
  }
});

test("randomDateTimeInMonth returns ISO datetime within the month", () => {
  const rng = createRNG("datetime-test");
  for (let i = 0; i < 20; i++) {
    const dt = randomDateTimeInMonth(rng, "2027-08", 10, 20);
    assert.match(dt, /^2027-08-\d{2}T\d{2}:\d{2}:00\+05:30$/u);
    const day = parseInt(dt.slice(8, 10), 10);
    assert.ok(day >= 10 && day <= 20);
  }
});

test("randomFutureDate returns a date after the base", () => {
  const rng = createRNG("future-test");
  for (let i = 0; i < 20; i++) {
    const result = randomFutureDate(rng, "2027-06-15", 2, 4);
    const base = new Date("2027-06-15");
    const resultDate = new Date(result);
    assert.ok(resultDate > base, `future date ${result} must be after 2027-06-15`);
  }
});

// ─── Reference Code Counters ─────────────────────────────────────────────────

test("counters increment sequentially", () => {
  resetCounters();
  const req1 = nextRequisitionCode();
  const req2 = nextRequisitionCode();
  assert.equal(req1, "Y2-REQ-101");
  assert.equal(req2, "Y2-REQ-102");
});

test("all code generators produce unique codes", () => {
  resetCounters();
  const codes = new Set<string>();
  codes.add(nextRequisitionCode());
  codes.add(nextCandidateCode());
  codes.add(nextLeadCode());
  codes.add(nextOpportunityCode());
  codes.add(nextProjectCode());
  codes.add(nextExpenseCode());
  codes.add(nextJournalCode());
  codes.add(nextTicketCode());
  codes.add(nextPOCode());
  codes.add(nextAssetCode());
  codes.add(nextInvoiceCode());
  codes.add(nextAllocationCode());
  assert.equal(codes.size, 12, "all 12 code generators must produce unique codes");
});

test("resetCounters resets all counters to initial values", () => {
  resetCounters();
  nextRequisitionCode(); // 101
  nextRequisitionCode(); // 102
  resetCounters();
  assert.equal(nextRequisitionCode(), "Y2-REQ-101");
});

test("initializeCountersForMonth gives month-specific offsets", () => {
  initializeCountersForMonth("2027-04");
  const apr = nextRequisitionCode();

  initializeCountersForMonth("2027-05");
  const may = nextRequisitionCode();

  assert.notEqual(apr, may, "different months must produce different codes");
});

test("initializeCountersForMonth produces deterministic codes", () => {
  initializeCountersForMonth("2027-06");
  const first = nextRequisitionCode();
  initializeCountersForMonth("2027-06");
  const second = nextRequisitionCode();
  assert.equal(first, second, "same month must produce same first code");
});

test("invoice codes are zero-padded", () => {
  resetCounters();
  const code = nextInvoiceCode();
  assert.match(code, /^INV-Y2-\d{3}$/u);
});

test("allocation codes are zero-padded", () => {
  resetCounters();
  const code = nextAllocationCode();
  assert.match(code, /^Y2-ALLOC-\d{3}$/u);
});
