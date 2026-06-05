create table competition_scraper_replica.categories
(
    id            Int32,
    external_id   String,
    name          String,
    restaurant_id Int32,
    created_at    Nullable(DateTime64(6)),
    updated_at    Nullable(DateTime64(6)),
    processor_id  Int32,
    description   Nullable(String),
    product_count Int32,
    display_order Nullable(Int32),
    _sign         Int8 materialized 1,
    _version      UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table competition_scraper_replica.offer_time_series
(
    id              Int32,
    offer_id        Int32,
    created_at      Nullable(DateTime64(6)),
    status          String,
    effective_at    DateTime64(6),
    discount_value  Nullable(Decimal(18, 2)),
    resulting_price Nullable(Decimal(18, 2)),
    payload         Nullable(String),
    _sign           Int8 materialized 1,
    _version        UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table competition_scraper_replica.offers
(
    id              Int32,
    external_id     String,
    name            String,
    description     Nullable(String),
    discount_type   String,
    discount_value  Nullable(Decimal(18, 2)),
    start_time      Nullable(DateTime64(6)),
    end_time        Nullable(DateTime64(6)),
    product_id      Nullable(Int32),
    created_at      Nullable(DateTime64(6)),
    updated_at      Nullable(DateTime64(6)),
    processor_id    Int32,
    restaurant_id   Int32,
    resulting_price Nullable(Decimal(18, 2)),
    currency        String,
    cancelled_at    Nullable(DateTime64(6)),
    active          UInt8,
    priority        Nullable(Int32),
    metadata        Nullable(String),
    starts_at       Nullable(DateTime64(6)),
    ends_at         Nullable(DateTime64(6)),
    _sign           Int8 materialized 1,
    _version        UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table competition_scraper_replica.processors
(
    id          Int32,
    name        String,
    created_at  Nullable(DateTime64(6)),
    updated_at  Nullable(DateTime64(6)),
    description Nullable(String),
    _sign       Int8 materialized 1,
    _version    UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table competition_scraper_replica.products
(
    id                  Int32,
    external_id         String,
    name                String,
    description         Nullable(String),
    price               Nullable(Decimal(18, 2)),
    options             Nullable(String),
    category_id         Nullable(Int32),
    created_at          Nullable(DateTime64(6)),
    updated_at          Nullable(DateTime64(6)),
    processor_id        Int32,
    restaurant_id       Int32,
    original_price      Nullable(Decimal(18, 2)),
    currency            String,
    offer_name          Nullable(String),
    availability        UInt8,
    image_url           Nullable(String),
    display_order       Nullable(Int32),
    discount_percentage Nullable(Decimal(9, 2)),
    _sign               Int8 materialized 1,
    _version            UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table competition_scraper_replica.restaurants
(
    id            Int32,
    external_id   String,
    name          String,
    processor_id  Int32,
    created_at    Nullable(DateTime64(6)),
    updated_at    Nullable(DateTime64(6)),
    brand         Nullable(String),
    address       Nullable(String),
    phone         Nullable(String),
    rating        Nullable(Decimal(9, 2)),
    delivery_fee  Nullable(Decimal(18, 2)),
    minimum_order Nullable(Decimal(18, 2)),
    delivery_time Nullable(String),
    cuisine_types String,
    _sign         Int8 materialized 1,
    _version      UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table competition_scraper_replica.scrape_errors
(
    id          Int32,
    session_id  Int32,
    error_type  Nullable(String),
    message     String,
    context     Nullable(String),
    created_at  Nullable(DateTime64(6)),
    occurred_at DateTime64(6),
    code        Nullable(String),
    _sign       Int8 materialized 1,
    _version    UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table competition_scraper_replica.scrape_sessions
(
    id                      Int32,
    processor_id            Int32,
    started_at              DateTime64(6),
    status                  String,
    metadata                Nullable(String),
    created_at              Nullable(DateTime64(6)),
    external_id             Nullable(String),
    ended_at                Nullable(DateTime64(6)),
    restaurant_count        Int32,
    category_count          Int32,
    product_count           Int32,
    offer_count             Int32,
    request_count           Int32,
    success_request_count   Int32,
    failed_request_count    Int32,
    error_count             Int32,
    warning_count           Int32,
    total_bytes             Nullable(Int64),
    duration_ms             Nullable(Int32),
    avg_request_duration_ms Nullable(Decimal(18, 2)),
    throughput_rps          Nullable(Decimal(18, 2)),
    success_rate            Nullable(Decimal(9, 2)),
    error_rate              Nullable(Decimal(9, 2)),
    notes                   Nullable(String),
    updated_at              Nullable(DateTime64(6)),
    _sign                   Int8 materialized 1,
    _version                UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

