use SAPBW
go

create table dbo.sapbw_items
(
    databaseId             varchar(7)    not null,
    companyname            varchar(37)   not null,
    item_number            nvarchar(50)  not null,
    item_description       nvarchar(200) not null,
    Inactive               char,
    purchasing_uom         nvarchar(100),
    item_group             nvarchar(100) not null,
    item_sub_category      nvarchar(50),
    item_cost              numeric(19, 6),
    last_purchase_price    numeric(19, 6),
    preferred_supplier     nvarchar(15),
    mfr_catalogue_number   nvarchar(50),
    manufacturer           nvarchar(30)  not null,
    brand                  nvarchar(16),
    category               nvarchar(10),
    Finished_good          char,
    Raw_material           char,
    Other_stock            char,
    Fixed_asset            char,
    Fittings               char,
    Consider_stock_reports char,
    Hetafre_products       char,
    kg_per_case            numeric(19, 6),
    qty_per_box            numeric(19, 6),
    cases_per_pallet       int,
    model_type             nvarchar(50),
    service_provider       nvarchar(50),
    sales_uom              nvarchar(100),
    stock_uom              nvarchar(100),
    inner_dimension        nvarchar(20),
    oouter_dimension       nvarchar(20),
    foreign_name           nvarchar(100),
    vatcode_purchase       nvarchar(8),
    vatcode_sales          nvarchar(8),
    lastmodified           datetime,
    createdat              datetime,
    updatedat              datetime,
    row_guid               uniqueidentifier,
    BWSynched              nvarchar
        constraint DF_sapbw_items_BWSynched default N'N',
    BWSynchedAt            datetime,
    constraint PK_sapbw_items
        primary key (databaseId, item_number)
)
go

create index IX_sapbw_items
    on dbo.sapbw_items (updatedat, lastmodified)
go

