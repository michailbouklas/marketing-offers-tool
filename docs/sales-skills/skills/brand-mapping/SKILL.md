---
name: brand-mapping
description: Brand code mappings for Novasero restaurant brands. Translates user-facing brand names and abbreviations to the lowercase codes used in ClickHouse queries.
version: 1.0.0
tags:
  - brands
  - mapping
  - reference
---

# Brand Mapping

All brands share the same ClickHouse tables (`transactions`, `transaction_details`) via the `brand` column (String). Always use lowercase brand codes in queries.

## Brand Codes

| User phrasing | Brand code |
|---|---|
| BK, Burger King | `bk` |
| Nero | `nero` |
| Wagamama | `wagamama` |
| Pizza Hut, PH, PHCY | `phcy` |
| KFC | `kfc` |
| Verde, Verdi | `verdi` |
| Taco Bell, tacobell, TB | `tacobell` |
| Tavernaki | `tavernaki` |
| Paul | `paul` |
| Pier One | `pierone` |
| Akashi | `akashi` |
| Remezzo, rem | `remezzo` |
| Kypriakon | `kypriakon` |
| Jamies, JMO, jok | `jamies` |
| Hobo | `hobo` |

## Listing All Available Brands

To discover all brands present in the data:
```sql
SELECT DISTINCT brand FROM transactions ORDER BY brand
```

## Multi-Brand Queries (Single-Source Model)

All brands live in the same tables — no UNION is needed. For multi-brand questions:
- Filter by a set of brands: `WHERE brand IN ('bk','kfc')` and `GROUP BY brand`
- Or omit the brand filter entirely to compute overall totals across all brands

Example — revenue by brand this year:
```sql
SELECT brand, sum(tran_net) AS total_revenue, count() AS txn_count
FROM transactions
WHERE toYear(tran_date) = toYear(today())
GROUP BY brand
ORDER BY total_revenue DESC
```
