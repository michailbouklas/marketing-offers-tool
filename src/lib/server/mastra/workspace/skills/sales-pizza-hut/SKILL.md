---
name: sales-pizza-hut
description: Pizza Hut specific attributes recorded in the Novasero sales data — pizza sizes (trde_size) and dough/base types (trde_type) with their code meanings.
---

# Pizza Hut Overview

Pizza Hut Cyprus (`brand = 'phcy'`) operates over 30 stores — some delivery
oriented, some Dine In focused. The majority of its sales are pizzas.

- Filter pizza **size** on `transaction_details.trde_size`.
- Filter pizza **dough type** on `transaction_details.trde_type`.

## Pizza Sizes (trde_size)

- `Solo`
- `PR` — rectangle
- `S` — Small
- `M` — Medium
- `L` — Large
- `XL` — Extra Large (user may say "xlarge", "extra large", …)
- `XXL` — Extra Extra Large

Users phrase sizes loosely ("large", "XL", "extra large") — map them to the
codes above.

## Pizza Types / Dough (trde_type)

| Code | Dough / base              |
| ---- | ------------------------- |
| AT   | American Thin             |
| B    | Cheesy Bites              |
| BG   | Cheesy Bites Garlic       |
| C    | Classic                   |
| CC   | Crunchy Crust             |
| CG   | Cheese Garlic             |
| CH   | Crunchy Philadelphia      |
| DR   | Dark                      |
| E    | Edge                      |
| H    | Philadelphia              |
| HD   | Hot Dog                   |
| HM   | Ham Cheese Mustard        |
| NY   | New Yorker                |
| P    | Pan                       |
| R    | Cheesy Bites Philadelphia |
| SF   | San Francisco             |
| T    | Thin                      |
| TR   | Traditional               |
| V    | Crown Crust               |
| WP   | Wingstreet                |
