/**
 * Self-check for the role/page table.
 * Run: node --experimental-strip-types lib/access.check.ts
 *
 * The invariants that matter are the ones that would leak or strand someone:
 * a client reaching settings, HR reaching ad data, a menu link that bounces,
 * or a landing page the role itself isn't allowed to open (redirect loop).
 */
import assert from "node:assert/strict";
import { ROLES, canOpen, homeFor, menuFor, toRole, type Platforms } from "./access.ts";

const ALL_PLATFORM_COMBOS: Platforms[] = [
  { facebook: false, tiktok: false },
  { facebook: true, tiktok: false },
  { facebook: false, tiktok: true },
  { facebook: true, tiktok: true },
];

// ── role parsing never escalates ──
assert.equal(toRole("admin"), "admin");
assert.equal(toRole("specialist"), "specialist");
assert.equal(toRole(undefined), "user", "missing role falls to least privilege");
assert.equal(toRole("superadmin"), "user", "unknown role must not become admin");
assert.equal(toRole("ADMIN"), "user", "role match is exact");

// ── admin-only areas ──
for (const role of ["specialist", "user", "hr"] as const) {
  for (const p of ["/admin", "/admin/users", "/admin/sync", "/tiktok/sync", "/facebook/portfolio"]) {
    assert.equal(canOpen(role, p), false, `${role} must not open ${p}`);
  }
}
for (const p of ["/admin", "/admin/users", "/tiktok/sync", "/facebook/portfolio", "/facebook/dashboard"]) {
  assert.equal(canOpen("admin", p), true, `admin must open ${p}`);
}

// ── HR sees no ad data ──
for (const p of ["/facebook/dashboard", "/tiktok/dashboard"]) {
  assert.equal(canOpen("hr", p), false, `hr must not open ${p}`);
}

// ── prefix order: the specific rule wins over the general one ──
assert.equal(canOpen("user", "/tiktok/dashboard"), true, "/tiktok/dashboard sits above /tiktok");
assert.equal(canOpen("user", "/facebook/dashboard"), true);
assert.equal(canOpen("user", "/facebook/portfolio"), false, "/facebook/portfolio sits above /facebook");
assert.equal(canOpen("user", "/administrator"), true, "prefix match is per path segment, not per character");

// ── ADSCAN: Marcom only, never clients or HR ──
assert.equal(canOpen("specialist", "/adscan"), true);
assert.equal(canOpen("specialist", "/adscan/a1"), true);
assert.equal(canOpen("admin", "/adscan/hotels"), true);
for (const role of ["user", "hr"] as const) {
  assert.equal(canOpen(role, "/adscan"), false, `${role} must not open ADSCAN alerts`);
  assert.equal(canOpen(role, "/adscan/a1"), false, `${role} must not open an ADSCAN alert by URL`);
}
assert.equal(homeFor("specialist", { facebook: true, tiktok: false }), "/adscan");

// ── Performance Report: admin + HR only; HR sees nothing else of ADSCAN ──
assert.equal(canOpen("hr", "/adscan/report"), true);
assert.equal(canOpen("admin", "/adscan/report"), true);
assert.equal(canOpen("specialist", "/adscan/report"), false, "specialists don't see colleagues' performance");
assert.equal(canOpen("user", "/adscan/report"), false);
assert.equal(canOpen("hr", "/adscan/hotels"), false, "the report rule must not open the rest of ADSCAN to HR");
assert.equal(homeFor("hr", { facebook: true, tiktok: true }), "/adscan/report");

// ── public pages ──
for (const role of ROLES) {
  assert.equal(canOpen(role, "/login"), true);
  assert.equal(canOpen(role, "/privacy"), true);
  assert.equal(canOpen(role, "/account/password"), true, `${role} can change own password`);
}

// ── every landing page is openable (else proxy bounces to "/" forever) ──
// ── every menu link is openable (else clicking it bounces) ──
for (const role of ROLES) {
  for (const pl of ALL_PLATFORM_COMBOS) {
    const home = homeFor(role, pl);
    assert.ok(canOpen(role, home), `${role} ${JSON.stringify(pl)} lands on ${home} but can't open it`);
    for (const g of menuFor(role, pl)) {
      for (const l of g.links) assert.ok(canOpen(role, l.href), `${role} menu links to ${l.href} it can't open`);
    }
  }
}

// ── menu follows platform grants for non-admins ──
const labels = (role: (typeof ROLES)[number], pl: Platforms) => menuFor(role, pl).map((g) => g.label);
assert.deepEqual(labels("user", { facebook: true, tiktok: false }), ["Facebook", "บัญชี"]);
assert.deepEqual(labels("user", { facebook: false, tiktok: true }), ["TikTok", "บัญชี"]);
assert.deepEqual(labels("hr", { facebook: true, tiktok: true }), ["ADSCAN", "บัญชี"], "hr never gets platform menus");
assert.deepEqual(menuFor("hr", { facebook: true, tiktok: true })[0].links.map((l) => l.href), ["/adscan/report"], "hr's ADSCAN menu is the report only");
assert.deepEqual(labels("admin", { facebook: false, tiktok: false }), ["ADSCAN", "Facebook", "TikTok", "ตั้งค่า", "บัญชี"],
  "admin sees everything regardless of grants");

// ── landing ──
assert.equal(homeFor("user", { facebook: false, tiktok: true }), "/tiktok/dashboard");
assert.equal(homeFor("user", { facebook: false, tiktok: false }), "/no-access");
assert.equal(canOpen("specialist", "/admin/adscan-skill"), false, "AI Skill settings are admin-only");

console.log("OK — access: role parsing, admin-only areas, HR isolation, prefix order, landing & menu consistency");
