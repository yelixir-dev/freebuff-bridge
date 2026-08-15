import { describe, expect, it } from "vitest";

import { dashboardHtml } from "../src/dashboard.js";
describe("dashboard credential editor", () => {
  it("renders CommandCode-style draft cards instead of an immediate token form", () => {
    const html = dashboardHtml();

    expect(html).toContain('id="addCred"');
    expect(html).toContain('class="cred-name"');
    expect(html).toContain("data-ctoken");
    expect(html).toContain("data-del");
    expect(html).not.toMatch(/credential-fold" open/);
    expect(html).not.toContain('id="newToken"');
  });

  it("saves credential card payloads with the dashboard configuration", () => {
    const html = dashboardHtml();

    expect(html).toContain("function credentialPayloads()");
    expect(html).toContain("policyPart(cfg.routing.policy,1)");
    expect(html).toContain('event.key==="Escape"');
    expect(html).toMatch(/credentials:\s*credentialPayloads\(\)/);
    expect(html).toContain("cfg.credentials.push(");
    expect(html).toContain('class="provider-fold"');
    expect(html).toContain("data-provider");
  });
});
