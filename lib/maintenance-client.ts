export class DreamMaintenanceError extends Error {
  readonly status = 503;

  constructor(message = "Dream está temporalmente en mantenimiento.") {
    super(message);
    this.name = "DreamMaintenanceError";
  }
}

export class DreamAvailabilityError extends Error {
  constructor(
    message = "No se pudo comprobar la disponibilidad de Dream. Comprueba la conexión e inténtalo de nuevo.",
  ) {
    super(message);
    this.name = "DreamAvailabilityError";
  }
}

export async function getMaintenanceStatus(signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch("/api/maintenance-status", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch {
    throw new DreamAvailabilityError();
  }

  if (response.headers.get("x-dream-maintenance") === "1") return true;
  if (!response.ok) throw new DreamAvailabilityError();

  try {
    const payload: unknown = await response.json();
    if (
      payload &&
      typeof payload === "object" &&
      "maintenance" in payload &&
      typeof payload.maintenance === "boolean"
    )
      return payload.maintenance;
  } catch {}
  throw new DreamAvailabilityError();
}

export async function assertDreamAvailable(signal?: AbortSignal) {
  if (await getMaintenanceStatus(signal)) throw new DreamMaintenanceError();
}
