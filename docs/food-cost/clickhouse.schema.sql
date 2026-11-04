create table apidata_replica.dim_items
(
    id                     Int32,
    tablename              Nullable(String),
    item_code              Nullable(String),
    item_description       Nullable(String),
    item_short_description Nullable(String),
    item_category          Nullable(String),
    item_subcategory       Nullable(String),
    item_price             Decimal(18, 4),
    item_active            Nullable(UInt8),
    item_coupon            Nullable(Int32),
    _sign                  Int8 materialized 1,
    _version               UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

