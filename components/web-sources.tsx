"use client";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { WebSource } from "@/lib/types";

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Site logo from Google's favicon service (only the site name is sent);
 *  if it fails, the site's initial. */
function SiteIcon({ host }: { host: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !host)
    return (
      <span className="site-icon site-icon-letter" aria-hidden="true">
        {(host[0] ?? "?").toUpperCase()}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external 16 px favicon; next/image would proxy it for nothing
    <img
      className="site-icon"
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/** «Buscado en la web»: the pages the AI read, folded away from the answer. */
export function WebSources({ sources }: { sources: WebSource[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!sources.length) return null;
  const hosts = sources.map((s) => hostOf(s.url));
  return (
    <div className={`web-sources${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="web-sources-toggle press"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="web-sources-icons" aria-hidden="true">
          {[...new Set(hosts)].slice(0, 3).map((host) => (
            <SiteIcon host={host} key={host} />
          ))}
        </span>
        <span>
          Buscado en la web ·{" "}
          <span className="num">{sources.length}</span>{" "}
          {sources.length === 1 ? "fuente" : "fuentes"}
        </span>
        <ChevronDown size={16} className="web-sources-chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul className="web-sources-list" id={listId}>
          {sources.map((source, i) => (
            <li key={`${source.url}-${i}`}>
              <a
                className="web-source press"
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <SiteIcon host={hosts[i]} />
                <span className="web-source-text">
                  <strong>{source.title || hosts[i]}</strong>
                  <small>{hosts[i]}</small>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
