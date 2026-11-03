"use client";
// «Instalar Dream» de la landing: Dream es web/PWA, no está en tiendas. Si el
// navegador ofrece instalar, lo abre; si no (iPhone), explica los pasos.
import { useState, useSyncExternalStore } from "react";
import { installStore } from "@/lib/pwa";

export function InstallButton({ className }: { className?: string }) {
  const prompt = useSyncExternalStore(installStore.subscribe, installStore.getPrompt, () => null);
  const [help, setHelp] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <>
      <button
        type="button"
        className={className}
        aria-expanded={prompt ? undefined : help}
        onClick={async () => {
          if (!prompt) {
            setHelp((h) => !h);
            return;
          }
          await prompt.prompt();
          const choice = await prompt.userChoice;
          installStore.setPrompt(null);
          setMessage(choice.outcome === "accepted" ? "Dream ya está en tu pantalla de inicio." : "Puedes instalarlo cuando quieras.");
        }}
      >
        Instalar Dream
      </button>
      {help && !prompt && (
        <p role="status">
          En el móvil, abre Dream en el navegador y elige «Añadir a pantalla de inicio» en el menú de compartir.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </>
  );
}
