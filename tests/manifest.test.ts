import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("static/manifest.json", "utf8"));

describe("extension manifest", () => {
  it("uses temporary page access and only the configured API host", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage"]);
    expect(manifest.host_permissions).toEqual(["http://100.115.209.7:4323/*"]);
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
  });

  it("declares the requested shortcuts and build entries", () => {
    expect(manifest.commands["translate-selection"].suggested_key.default).toBe("Alt+T");
    expect(manifest.commands["toggle-page-translation"].suggested_key.default).toBe("Alt+Shift+T");
    expect(manifest.background.service_worker).toBe("service-worker.js");
    expect(manifest.action.default_popup).toBe("popup.html");
    expect(manifest.content_security_policy.extension_pages).toBe("script-src 'self'; object-src 'self'");
  });
});
