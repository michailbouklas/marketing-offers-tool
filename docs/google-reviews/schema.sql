create table google_maps_scraper_replica.brands
(
    id          Int32,
    title       String,
    slug        String,
    description Nullable(String),
    website     Nullable(String),
    logo_url    Nullable(String),
    created_at  DateTime64(6),
    updated_at  DateTime64(6),
    _sign       Int8 materialized 1,
    _version    UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.business_brands
(
    id           Int32,
    business_cid String,
    brand_id     Int32,
    is_primary   Nullable(UInt8),
    position     Nullable(Int32),
    notes        Nullable(String),
    created_at   DateTime64(6),
    updated_at   DateTime64(6),
    _sign        Int8 materialized 1,
    _version     UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.business_features
(
    id               Int32,
    business_cid     Nullable(String),
    feature_category String,
    feature_name     String,
    is_enabled       Nullable(UInt8),
    created_at       Nullable(DateTime64(6)),
    updated_at       Nullable(DateTime64(6)),
    _sign            Int8 materialized 1,
    _version         UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.business_review_metrics
(
    id                  UUID,
    business_cid        String,
    recorded_at         DateTime64(6),
    review_rating       Nullable(Decimal(9, 2)),
    review_count        Nullable(Int32),
    reviews_1_star      Nullable(Int32),
    reviews_2_star      Nullable(Int32),
    reviews_3_star      Nullable(Int32),
    reviews_4_star      Nullable(Int32),
    reviews_5_star      Nullable(Int32),
    total_review_points Nullable(Int32) default
                                            ((((reviews_1_star * 1) + (reviews_2_star * 2)) + (reviews_3_star * 3)) +
                                             (reviews_4_star * 4)) + (reviews_5_star * 5),
    rating_change       Nullable(Decimal(9, 2)),
    count_change        Nullable(Int32),
    data_source         Nullable(String),
    import_batch_id     Nullable(UUID),
    created_at          DateTime64(6),
    updated_at          DateTime64(6),
    _sign               Int8 materialized 1,
    _version            UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.business_sentiment_metrics
(
    business_cid        String,
    total_reviews       Int32,
    positive_count      Int32,
    negative_count      Int32,
    neutral_count       Int32,
    positive_percentage Nullable(Decimal(9, 2)),
    negative_percentage Nullable(Decimal(9, 2)),
    neutral_percentage  Nullable(Decimal(9, 2)),
    sentiment_score     Nullable(Decimal(9, 2)),
    last_updated        Nullable(DateTime64(6)),
    _sign               Int8 materialized 1,
    _version            UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(business_cid);

create table google_maps_scraper_replica.businesses
(
    id           Int32,
    input_id     String,
    cid          String,
    title        String,
    category     Nullable(String),
    address      Nullable(String),
    latitude     Nullable(Decimal(18, 8)),
    longitude    Nullable(Decimal(18, 8)),
    phone        Nullable(String),
    website      Nullable(String),
    status       Nullable(String),
    description  Nullable(String),
    reviews_link Nullable(String),
    thumbnail    Nullable(String),
    timezone     Nullable(String),
    price_range  Nullable(String),
    data_id      Nullable(String),
    plus_code    Nullable(String),
    created_at   Nullable(DateTime64(6)),
    updated_at   Nullable(DateTime64(6)),
    _sign        Int8 materialized 1,
    _version     UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.operating_hours
(
    id           Int32,
    business_cid Nullable(String),
    day_of_week  String,
    hours        String,
    created_at   Nullable(DateTime64(6)),
    updated_at   Nullable(DateTime64(6)),
    _sign        Int8 materialized 1,
    _version     UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.ordering_options
(
    id            Int32,
    business_cid  Nullable(String),
    platform_name String,
    order_url     String,
    created_at    Nullable(DateTime64(6)),
    updated_at    Nullable(DateTime64(6)),
    _sign         Int8 materialized 1,
    _version      UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.popular_times
(
    id               Int32,
    business_cid     Nullable(String),
    day_of_week      String,
    hour_of_day      Int32,
    popularity_score Int32,
    created_at       Nullable(DateTime64(6)),
    updated_at       Nullable(DateTime64(6)),
    _sign            Int8 materialized 1,
    _version         UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.review_categories
(
    id                   Int32,
    category             Nullable(String),
    summary              Nullable(String),
    metadata             Nullable(String),
    created_at           Nullable(DateTime64(6)),
    updated_at           Nullable(DateTime64(6)),
    embedding            Nullable(String),
    review_count         Nullable(Int32),
    confidence_threshold Nullable(Decimal(9, 2)),
    version              Nullable(Int32),
    is_active            Nullable(UInt8),
    _sign                Int8 materialized 1,
    _version             UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.review_category_metrics_timeseries
(
    id            Int32,
    business_cid  String,
    category_id   Int32,
    snapshot_date DateTime64(6),
    review_count  Int32,
    percentage    Decimal(9, 2),
    run_id        UUID,
    created_at    DateTime64(6),
    _sign         Int8 materialized 1,
    _version      UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.review_sentiment_analysis
(
    id                Int32,
    review_id         Int32,
    business_cid      String,
    sentiment         String,
    confidence        Decimal(9, 3),
    processing_time   Int32,
    language_detected Nullable(String),
    fallback_used     Nullable(UInt8),
    processing_path   Nullable(String),
    analysis_date     Nullable(DateTime64(6)),
    analyzer_version  Nullable(String),
    _sign             Int8 materialized 1,
    _version          UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.review_summaries
(
    id                           Int32,
    business_cid                 Nullable(String),
    review_count                 Nullable(Int32),
    average_rating               Nullable(Decimal(9, 2)),
    rating_1_count               Nullable(Int32),
    rating_2_count               Nullable(Int32),
    rating_3_count               Nullable(Int32),
    rating_4_count               Nullable(Int32),
    rating_5_count               Nullable(Int32),
    created_at                   Nullable(DateTime64(6)),
    updated_at                   Nullable(DateTime64(6)),
    last_sentiment_analysis      Nullable(DateTime64(6)),
    latest_sentiment_summary_id  Nullable(Int32),
    positive_count               Nullable(Int32),
    neutral_count                Nullable(Int32),
    negative_count               Nullable(Int32),
    average_sentiment_confidence Nullable(Decimal(9, 3)),
    _sign                        Int8 materialized 1,
    _version                     UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.reviews
(
    id                       Int32,
    business_cid             Nullable(String),
    reviewer_name            String,
    reviewer_profile_picture Nullable(String),
    rating                   Int32,
    review_text              Nullable(String),
    review_date              Nullable(DateTime64(6)),
    review_images            Nullable(String),
    created_at               Nullable(DateTime64(6)),
    updated_at               Nullable(DateTime64(6)),
    sentiment                Nullable(String),
    sentiment_reason         Nullable(String),
    sentiment_certainty      Nullable(Decimal(9, 3)),
    embedding                Nullable(String),
    category_id              Nullable(Int32),
    category_confidence      Nullable(Decimal(9, 2)),
    review_text_hash         Nullable(String),
    sentiment_language       Nullable(String),
    _sign                    Int8 materialized 1,
    _version                 UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.sentiment_correction_audit
(
    id                     UUID,
    review_id              Int32,
    business_cid           String,
    old_sentiment          String,
    new_sentiment          String,
    corrected_by           String,
    correction_reason      Nullable(String),
    confidence             Nullable(Decimal(9, 3)),
    created_at             Nullable(DateTime64(6)),
    ip_address             Nullable(String),
    user_agent             Nullable(String),
    original_confidence    Nullable(Decimal(9, 3)),
    original_analysis_date Nullable(DateTime64(6)),
    correction_method      Nullable(String),
    metadata               Nullable(String),
    _sign                  Int8 materialized 1,
    _version               UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

create table google_maps_scraper_replica.sentiment_summary_timeseries
(
    id                     Int32,
    business_cid           String,
    snapshot_date          DateTime64(6),
    total_reviews_count    Int32,
    analyzed_reviews_count Int32,
    pending_reviews_count  Int32,
    positive_count         Int32,
    neutral_count          Int32,
    negative_count         Int32,
    positive_percentage    Decimal(9, 2),
    neutral_percentage     Decimal(9, 2),
    negative_percentage    Decimal(9, 2),
    average_confidence     Nullable(Decimal(9, 3)),
    average_rating         Nullable(Decimal(9, 2)),
    analyzer_version       Nullable(String),
    processing_time_ms     Nullable(Int32),
    fallback_used_count    Nullable(Int32),
    languages_detected     Nullable(String),
    run_id                 UUID,
    created_at             Nullable(DateTime64(6)),
    _sign                  Int8 materialized 1,
    _version               UInt64 materialized 1
)
    engine = ReplacingMergeTree(_version)
        ORDER BY tuple(id);

