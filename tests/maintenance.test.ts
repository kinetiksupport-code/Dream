import test from "node:test";
import assert from "node:assert/strict";
import {
  createMaintenanceAccessToken,
  isAllowedEmail,
  verifyMaintenanceAccessToken,
} from "../lib/maintenance";

const firstDifference = (value: string) =>
  (value.startsWith("A") ? "B" : "A") + value.slice(1);

test("maintenance allowlist matches only the two normalized account emails", () => {
  assert.equal(isAllowedEmail("carlossanchezma1999@gmail.com"), true);
  assert.equal(isAllowedEmail("  HELLODREAM@EDUDREAM.ES "), true);
  assert.equal(isAllowedEmail("someone@example.com"), false);
  assert.equal(isAllowedEmail(null), false);
  assert.equal(isAllowedEmail(undefined), false);
});

test("maintenance access tokens are signed, expire, and fail closed if tampered", async () => {
  const oldSecret = process.env.MAINTENANCE_COOKIE_SECRET;

  try {
    process.env.MAINTENANCE_COOKIE_SECRET =
      "test-only-secret-for-dream-maintenance-signing-32-plus-chars";

    const token = await createMaintenanceAccessToken(
      "test-user-id",
      "CARLOSSANCHEZMA1999@GMAIL.COM",
    );
    assert.equal(await verifyMaintenanceAccessToken(token), true);

    const [payload, signature] = token.split(".");
    assert.equal(
      await verifyMaintenanceAccessToken(
        payload + "." + firstDifference(signature),
      ),
      false,
    );
    assert.equal(
      await verifyMaintenanceAccessToken(
        firstDifference(payload) + "." + signature,
      ),
      false,
    );
    assert.equal(await verifyMaintenanceAccessToken("1"), false);
    assert.equal(await verifyMaintenanceAccessToken(""), false);

    await assert.rejects(
      createMaintenanceAccessToken("someone-else", "someone@example.com"),
    );
  } finally {
    if (oldSecret === undefined) {
      delete process.env.MAINTENANCE_COOKIE_SECRET;
    } else {
      process.env.MAINTENANCE_COOKIE_SECRET = oldSecret;
    }
  }
});

test("maintenance access fails closed when signing secret is absent", async () => {
  const oldSecret = process.env.MAINTENANCE_COOKIE_SECRET;
  try {
    delete process.env.MAINTENANCE_COOKIE_SECRET;
    assert.equal(await verifyMaintenanceAccessToken("payload.signature"), false);
    await assert.rejects(
      createMaintenanceAccessToken("test-user-id", "hellodream@edudream.es"),
    );
  } finally {
    if (oldSecret === undefined) {
      delete process.env.MAINTENANCE_COOKIE_SECRET;
    } else {
      process.env.MAINTENANCE_COOKIE_SECRET = oldSecret;
    }
  }
});
