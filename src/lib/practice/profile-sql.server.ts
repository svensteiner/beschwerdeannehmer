export async function getSql() {
  const { getSql } = await import("@/lib/db.server");
  return getSql();
}

export async function getDbSource() {
  const { dbSource } = await import("@/lib/db.server");
  return dbSource;
}
