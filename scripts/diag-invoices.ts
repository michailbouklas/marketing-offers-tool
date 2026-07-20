import { prisma } from "$lib/server/prisma";

async function main() {
  const wolt = await prisma.$queryRawUnsafe<
    { month: string; n: bigint }[]
  >(
    `select to_char(date_trunc('month', documentdate), 'YYYY-MM') as month, count(*)::bigint as n
     from "api_WOLT_header" where documentdate is not null
     group by 1 order by 1 desc limit 12`,
  );
  const bolt = await prisma.$queryRawUnsafe<
    { month: string; n: bigint }[]
  >(
    `select to_char(date_trunc('month', documentdate), 'YYYY-MM') as month, count(*)::bigint as n
     from "api_BOLT_header" where documentdate is not null
     group by 1 order by 1 desc limit 12`,
  );

  console.log(
    "WOLT by month:",
    wolt.map((r) => `${r.month}=${r.n}`).join("  "),
  );
  console.log(
    "BOLT by month:",
    bolt.map((r) => `${r.month}=${r.n}`).join("  "),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
