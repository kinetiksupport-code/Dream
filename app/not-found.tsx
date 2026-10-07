import Link from "next/link";
export default function NotFound() {
  return (
    <main className="boot">
      <div>
        <p className="eyebrow">404</p>
        <h1>Esta idea aún no tiene lugar.</h1>
        <Link className="text-link" href="/">
          Volver a Dream
        </Link>
      </div>
    </main>
  );
}
