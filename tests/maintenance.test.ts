import test from "node:test";
import assert from "node:assert/strict";
import { isMaintenanceEnabled } from "../lib/maintenance";
import {
  assertDreamAvailable,
  DreamAvailabilityError,
  DreamMaintenanceError,
  getMaintenanceStatus,
} from "../lib/maintenance-client";

test("el interruptor privado acepta valores explícitos y es apagado por defecto", () => {
  const original = process.env.DREAM_MAINTENANCE_MODE;
  try {
    delete process.env.DREAM_MAINTENANCE_MODE;
    assert.equal(isMaintenanceEnabled(), false);
    for (const value of ["true", "1", "yes", "on", " TRUE "]) {
      process.env.DREAM_MAINTENANCE_MODE = value;
      assert.equal(isMaintenanceEnabled(), true, value);
    }
    for (const value of ["false", "0", "no", "off", ""]) {
      process.env.DREAM_MAINTENANCE_MODE = value;
      assert.equal(isMaintenanceEnabled(), false, value);
    }
  } finally {
    if (original === undefined) delete process.env.DREAM_MAINTENANCE_MODE;
    else process.env.DREAM_MAINTENANCE_MODE = original;
  }
});

test("el cliente reconoce una respuesta 503 no cacheable de mantenimiento", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ maintenance: true }), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "X-Dream-Maintenance": "1",
        "Cache-Control": "no-store",
      },
    });
  try {
    assert.equal(await getMaintenanceStatus(), true);
    await assert.rejects(assertDreamAvailable(), DreamMaintenanceError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("el cliente deja pasar el servicio solo con una comprobación positiva", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ maintenance: false }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  try {
    assert.equal(await getMaintenanceStatus(), false);
    await assert.doesNotReject(assertDreamAvailable());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("si no se puede verificar el estado, el cliente no continúa con Auth/API", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("network unavailable");
  };
  try {
    await assert.rejects(getMaintenanceStatus(), DreamAvailabilityError);
    await assert.rejects(assertDreamAvailable(), DreamAvailabilityError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
