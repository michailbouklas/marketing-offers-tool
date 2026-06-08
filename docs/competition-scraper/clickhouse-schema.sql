create table aggregator_scraper_replica.aggregator
(
    id           Int32,
    name         String,
    display_name String,
    base_domain  String,
    rating_scale Nullable(Float64),
    created_at   DateTime64(6),
    updated_at   DateTime64(6),
    _sign        Int8 materialized 1,
    _version     UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.canonical_category
(
    id         Int32,
    name       String,
    created_at DateTime64(6),
    updated_at DateTime64(6),
    embedding  Nullable(String),
    _sign      Int8 materialized 1,
    _version   UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.canonical_product
(
    id                   Int32,
    merged_restaurant_id Nullable(Int32),
    name                 String,
    embedding            Nullable(String),
    created_at           DateTime64(6),
    updated_at           DateTime64(6),
    _sign                Int8 materialized 1,
    _version             UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.category_mapping
(
    id                     Int32,
    restaurant_category_id Int32,
    canonical_category_id  Int32,
    confidence             Nullable(Float64),
    is_manual              UInt8,
    created_at             DateTime64(6),
    _sign                  Int8 materialized 1,
    _version               UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.merged_restaurant
(
    id         Int32,
    name       String,
    created_at DateTime64(6),
    updated_at DateTime64(6),
    _sign      Int8 materialized 1,
    _version   UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.merged_restaurant_link
(
    id                   Int32,
    merged_restaurant_id Int32,
    restaurant_id        Int32,
    confidence           Nullable(Float64),
    is_manual            UInt8,
    created_at           DateTime64(6),
    _sign                Int8 materialized 1,
    _version             UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.offer
(
    id            Int32,
    restaurant_id Int32,
    product_id    Nullable(Int32),
    title         String,
    description   Nullable(String),
    first_seen_at DateTime64(6),
    last_seen_at  DateTime64(6),
    is_active     UInt8,
    created_at    DateTime64(6),
    updated_at    DateTime64(6),
    _sign         Int8 materialized 1,
    _version      UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.offer_snapshot
(
    id          Int32,
    offer_id    Int32,
    product_id  Nullable(Int32),
    session_id  Int32,
    title       String,
    description Nullable(String),
    is_active   UInt8,
    recorded_at DateTime64(6),
    created_at  DateTime64(6),
    _sign       Int8 materialized 1,
    _version    UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.product
(
    id            Int32,
    restaurant_id Int32,
    category_id   Int32,
    title         String,
    slug          String,
    description   Nullable(String),
    is_offer      UInt8,
    first_seen_at DateTime64(6),
    last_seen_at  DateTime64(6),
    created_at    DateTime64(6),
    updated_at    DateTime64(6),
    _sign         Int8 materialized 1,
    _version      UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.product_badge
(
    id         Int32,
    product_id Int32,
    session_id Int32,
    badge      String,
    created_at DateTime64(6),
    _sign      Int8 materialized 1,
    _version   UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.product_mapping
(
    id                   Int32,
    product_id           Int32,
    canonical_product_id Int32,
    confidence           Nullable(Float64),
    is_manual            UInt8,
    created_at           DateTime64(6),
    _sign                Int8 materialized 1,
    _version             UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.product_price
(
    id          Int32,
    product_id  Int32,
    session_id  Int32,
    price       Nullable(Float64),
    recorded_at DateTime64(6),
    created_at  DateTime64(6),
    _sign       Int8 materialized 1,
    _version    UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.restaurant
(
    id                   Int32,
    aggregator_id        Int32,
    name                 String,
    slug                 String,
    source_url           String,
    provider_external_id Nullable(String),
    page_title           Nullable(String),
    rating_value         Nullable(Float64),
    rating_count         Nullable(Int32),
    rating_scale         Nullable(Float64),
    delivery_info        Nullable(String),
    minimum_order        Nullable(Float64),
    created_at           DateTime64(6),
    updated_at           DateTime64(6),
    _sign                Int8 materialized 1,
    _version             UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.restaurant_category
(
    id                Int32,
    restaurant_id     Int32,
    name              String,
    slug              String,
    item_count        Int32,
    is_offer_category UInt8,
    first_seen_at     DateTime64(6),
    last_seen_at      DateTime64(6),
    created_at        DateTime64(6),
    updated_at        DateTime64(6),
    _sign             Int8 materialized 1,
    _version          UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table aggregator_scraper_replica.scrape_session
(
    id             Int32,
    restaurant_id  Nullable(Int32),
    aggregator_id  Int32,
    source_url     String,
    language       String,
    scraped_at     DateTime64(6),
    duration_ms    Nullable(Int32),
    category_count Int32,
    item_count     Int32,
    offer_count    Int32,
    markdown_path  Nullable(String),
    json_path      Nullable(String),
    status         String,
    error_message  Nullable(String),
    created_at     DateTime64(6),
    _sign          Int8 materialized 1,
    _version       UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

