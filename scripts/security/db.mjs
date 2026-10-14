import pg from "pg";
export function isolatedPool() {
  const url =
    process.env.DREAM_TEST_DATABASE_URL ||
    "postgresql://postgres:isolated-test-only@127.0.0.1:55432/postgres";
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname))
    throw new Error("Tests refuse non-local databases");
  return new pg.Pool({
    connectionString: url,
    max: 20,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
}
export function rpcAdapter(pool) {
  return {
    async rpc(name, args) {
      if (!/^dream_(admit|reserve|release|provider_pause|reconcile)$/.test(name))
        throw new Error("Invalid test RPC");
      const parameters = Object.values(args);
      try {
        const result = await pool.query(
          `select public.${name}(${parameters.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
          parameters,
        );
        return { data: result.rows[0].result, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  };
}
