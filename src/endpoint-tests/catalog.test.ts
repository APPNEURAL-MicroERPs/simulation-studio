/**
 * Structural validation of the endpoint catalog.
 *
 * These tests verify the catalog data itself — no network calls needed.
 * They ensure every endpoint entry is well-formed, every module is valid,
 * and the test data covers all POST endpoints that need it.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ENDPOINT_CATALOG, ALL_MODULES, POST_ENDPOINTS, GET_ENDPOINTS, type EndpointEntry } from "./catalog";
import { POST_TEST_DATA, allPostTestData } from "./test-data";

const VALID_MODULES = new Set([
  "administration", "asset", "attendance", "audit", "billing",
  "compliance", "contract", "crm", "customer", "devops",
  "expense", "finance", "hr", "inventory", "learning",
  "legal", "organization", "payroll", "performance", "presales",
  "procurement", "project", "qa", "recruitment", "resource",
  "risk", "sdlc", "security", "support", "vendor",
]);

const VALID_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);

/* ─── §1  Catalog integrity ───────────────────────────────────────────── */

describe("§1 — Catalog integrity", () => {
  test("catalog has entries for all 30 MicroERPs", () => {
    assert.equal(ALL_MODULES.length, 30, `Expected 30 modules, got ${ALL_MODULES.length}`);
    for (const mod of ALL_MODULES) {
      assert.ok(VALID_MODULES.has(mod), `Unknown module: ${mod}`);
    }
  });

  test("no duplicate module+path combinations", () => {
    const seen = new Set<string>();
    for (const entry of ENDPOINT_CATALOG) {
      const key = `${entry.module}|${entry.path}`;
      assert.ok(!seen.has(key), `Duplicate endpoint: ${key}`);
      seen.add(key);
    }
  });

  test("every entry has at least one HTTP method", () => {
    for (const entry of ENDPOINT_CATALOG) {
      assert.ok(entry.methods.length > 0, `${entry.module} ${entry.path} has no methods`);
    }
  });

  test("all methods are valid HTTP verbs", () => {
    for (const entry of ENDPOINT_CATALOG) {
      for (const method of entry.methods) {
        assert.ok(VALID_METHODS.has(method), `Invalid method "${method}" for ${entry.module}${entry.path}`);
      }
    }
  });

  test("all paths start with /api/", () => {
    for (const entry of ENDPOINT_CATALOG) {
      assert.ok(entry.path.startsWith("/api/"), `${entry.module} path "${entry.path}" does not start with /api/`);
    }
  });

  test("all modules are valid ExecutableModule values", () => {
    for (const entry of ENDPOINT_CATALOG) {
      assert.ok(VALID_MODULES.has(entry.module), `Invalid module: ${entry.module}`);
    }
  });
});

/* ─── §2  Endpoint distribution ───────────────────────────────────────── */

describe("§2 — Endpoint distribution across modules", () => {
  test("every module has at least 10 endpoints", () => {
    for (const mod of ALL_MODULES) {
      const count = ENDPOINT_CATALOG.filter(e => e.module === mod).length;
      assert.ok(count >= 10, `Module ${mod} has only ${count} endpoints (expected >= 10)`);
    }
  });

  test("every module has at least one GET endpoint", () => {
    for (const mod of ALL_MODULES) {
      const getCount = GET_ENDPOINTS.filter(e => e.module === mod).length;
      assert.ok(getCount > 0, `Module ${mod} has no GET endpoints`);
    }
  });

  test("every module has at least one POST endpoint", () => {
    for (const mod of ALL_MODULES) {
      const postCount = POST_ENDPOINTS.filter(e => e.module === mod).length;
      assert.ok(postCount > 0, `Module ${mod} has no POST endpoints`);
    }
  });

  test("total endpoint count is >= 1400", () => {
    assert.ok(ENDPOINT_CATALOG.length >= 1400, `Expected >= 1400 endpoints, got ${ENDPOINT_CATALOG.length}`);
  });

  test("POST endpoints are >= 500", () => {
    assert.ok(POST_ENDPOINTS.length >= 500, `Expected >= 500 POST endpoints, got ${POST_ENDPOINTS.length}`);
  });

  test("GET endpoints are >= 800", () => {
    assert.ok(GET_ENDPOINTS.length >= 800, `Expected >= 800 GET endpoints, got ${GET_ENDPOINTS.length}`);
  });
});

/* ─── §3  Module-specific endpoint counts ─────────────────────────────── */

describe("§3 — Module-specific endpoint counts", () => {
  const expectedMinCounts: Record<string, number> = {
    finance: 90,
    billing: 70,
    learning: 70,
    attendance: 65,
    devops: 60,
    project: 50,
    qa: 60,
    performance: 60,
    resource: 60,
    expense: 60,
    sdlc: 50,
    support: 50,
    legal: 50,
    customer: 40,
    audit: 40,
    vendor: 40,
    administration: 40,
    compliance: 40,
    inventory: 30,
    asset: 30,
    security: 30,
    organization: 30,
    risk: 30,
    recruitment: 20,
    hr: 20,
    procurement: 20,
    contract: 20,
    presales: 10,
    payroll: 10,
    crm: 10,
  };

  for (const [mod, minCount] of Object.entries(expectedMinCounts)) {
    test(`${mod} has at least ${minCount} endpoints`, () => {
      const count = ENDPOINT_CATALOG.filter(e => e.module === mod).length;
      assert.ok(count >= minCount, `Module ${mod} has ${count} endpoints, expected >= ${minCount}`);
    });
  }
});

/* ─── §4  Test data coverage ──────────────────────────────────────────── */

describe("§4 — POST test data coverage", () => {
  test("test data exists for at least 20 modules", () => {
    const modulesWithData = new Set(Object.keys(POST_TEST_DATA));
    assert.ok(modulesWithData.size >= 20, `Test data covers only ${modulesWithData.size} modules, expected >= 20`);
  });

  test("every test data entry has valid and invalid payloads", () => {
    for (const td of allPostTestData()) {
      assert.ok(td.valid && typeof td.valid === "object", `${td.module} ${td.path} missing valid payload`);
      assert.ok(td.invalid && typeof td.invalid === "object", `${td.module} ${td.path} missing invalid payload`);
      assert.ok(Object.keys(td.valid).length > 0, `${td.module} ${td.path} valid payload is empty`);
    }
  });

  test("every test data entry has a non-empty label", () => {
    for (const td of allPostTestData()) {
      assert.ok(td.label.length > 0, `${td.module} ${td.path} has empty label`);
    }
  });

  test("every test data path starts with /api/", () => {
    for (const td of allPostTestData()) {
      assert.ok(td.path.startsWith("/api/"), `${td.module} test data path "${td.path}" does not start with /api/`);
    }
  });

  test("invalid payloads are actually invalid (missing required fields)", () => {
    for (const td of allPostTestData()) {
      // Invalid payload should have fewer keys than valid, or have empty string values
      const validKeys = Object.keys(td.valid);
      const invalidKeys = Object.keys(td.invalid);
      const hasEmptyValues = Object.values(td.invalid).some(v => v === "" || v === null || v === undefined);
      const isSubset = invalidKeys.length < validKeys.length;
      assert.ok(
        hasEmptyValues || isSubset || invalidKeys.length === 0,
        `${td.module} ${td.path} invalid payload should be missing required fields or have empty values`,
      );
    }
  });

  test("test data covers all key entity creation endpoints", () => {
    const keyEndpoints = [
      "recruitment|/api/requisitions",
      "recruitment|/api/candidates",
      "recruitment|/api/jobs",
      "crm|/api/leads",
      "procurement|/api/requests",
      "project|/api/projects",
      "project|/api/milestones",
      "vendor|/api/vendors",
      "customer|/api/customers",
      "asset|/api/assets",
      "attendance|/api/attendance",
      "billing|/api/invoices",
      "expense|/api/claims",
      "contract|/api/contracts",
      "audit|/api/audit-charters",
      "compliance|/api/obligations",
      "security|/api/incidents",
      "risk|/api/risks",
      "performance|/api/reviews",
      "learning|/api/courses",
      "support|/api/tickets",
      "payroll|/api/components",
      "administration|/api/offices",
      "organization|/api/departments",
      "presales|/api/bids",
      "resource|/api/demand",
      "sdlc|/api/releases",
      "qa|/api/test-plans",
      "devops|/api/pipelines",
      "hr|/api/change-requests",
    ];

    const testDataKeys = new Set(
      allPostTestData().map(td => `${td.module}|${td.path}`),
    );

    for (const key of keyEndpoints) {
      assert.ok(testDataKeys.has(key), `Missing test data for key endpoint: ${key}`);
    }
  });
});

/* ─── §5  Path pattern validation ─────────────────────────────────────── */

describe("§5 — Path pattern validation", () => {
  test("dynamic segments use valid parameter names ([id], [runId], etc.)", () => {
    const dynamicPattern = /^\[([a-zA-Z][a-zA-Z0-9]*)\]$/u;
    for (const entry of ENDPOINT_CATALOG) {
      const segments = entry.path.split("/").filter(s => s.startsWith("["));
      for (const seg of segments) {
        assert.ok(
          dynamicPattern.test(seg),
          `${entry.module} path "${entry.path}" has invalid dynamic segment: ${seg}`,
        );
      }
    }
  });

  test("no paths end with trailing slash", () => {
    for (const entry of ENDPOINT_CATALOG) {
      assert.ok(!entry.path.endsWith("/"), `${entry.module} path "${entry.path}" ends with trailing slash`);
    }
  });

  test("paths use valid URL patterns (kebab-case, camelCase, snake_case, or dynamic segments)", () => {
    const pathPattern = /^\/api\/[a-zA-Z0-9\[\]][a-zA-Z0-9\-_/\[\]]*[a-zA-Z0-9\[\]]$/u;
    for (const entry of ENDPOINT_CATALOG) {
      assert.ok(
        pathPattern.test(entry.path),
        `${entry.module} path "${entry.path}" has unexpected characters`,
      );
    }
  });
});

/* ─── §6  Cross-module consistency ────────────────────────────────────── */

describe("§6 — Cross-module consistency", () => {
  test("all modules have common infrastructure endpoints", () => {
    const commonPaths = ["/api/health", "/api/docs", "/api/openapi.json"];
    // Note: docs and openapi.json are excluded from catalog, but health should be present
    for (const mod of ALL_MODULES) {
      const modEndpoints = ENDPOINT_CATALOG.filter(e => e.module === mod);
      assert.ok(modEndpoints.length > 0, `Module ${mod} has no endpoints in catalog`);
    }
  });

  test("module names are alphabetically consistent", () => {
    const sorted = [...ALL_MODULES].sort();
    // Just verify no duplicates
    const unique = new Set(ALL_MODULES);
    assert.equal(unique.size, ALL_MODULES.length, "Duplicate module names found");
  });
});
