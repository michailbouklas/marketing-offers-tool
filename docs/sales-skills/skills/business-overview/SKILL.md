---
name: business-overview
description: Use this skill whenever the user asks about PHC Franchised Restaurants data,  sales, revenue, transactions, brands, stores, or anything related to the  group's ClickHouse database. Triggers include questions about KFC, Pizza Hut,  Taco Bell, Wagamama, Paul, Jamie Oliver, Burger King, Cafe Nero, Catercom  brands (Verdi, Tavernaki, Remezzo, Pier One, Kypriakon, Hobo, Akashi), or  ODL delivery. Also use for any SQL queries against the `transactions` or  `transaction_details` tables, brand comparisons, store performance, channel  breakdowns, or month-over-month analysis. Always consult this skill before  writing any SQL or answering any question about PHC business data.
---

# PHC Franchised Restaurants — Data Analytics Skill

## Group Structure

PHC Franchised Restaurants is the parent group operating multiple brands across
the Republic of Cyprus. Each legal entity (company) may operate one or more brands.

| Company | Brand(s) Operated |
|---|---|
| PHC FRANCHISED RESTAURANTS PUBLIC LTD | Pizza Hut, KFC, Taco Bell (YUM! brands) |
| AVANTAGE B&P CAFE LTD | PAUL |
| Avantage B&R Italian Restaurants Ltd | Jamie Oliver |
| CATERCOM LTD | Verdi, Tavernaki, Remezzo, Pier One (`pierone`), Kypriakon, Hobo, Akashi — plus catering/events |
| CAYLINK LTD | Cafe Nero — Molos store only (`NER511` / `511-NERO MOLOS LIMASSOL`) |
| DAFERA LTD | Wagamama |
| HETAFRE TRADING LTD | Cafe Nero (all other stores) |
| WOW BURGERS LTD | Burger King |
| ODL ONE DELIVERY (CYPRUS) LTD | Third-party logistics / delivery drivers (not a brand) |

> **Note:** CAYLINK LTD exists solely for accounting purposes for one Cafe Nero
> store (Molos, Limassol). All other Cafe Nero stores are under HETAFRE TRADING LTD.
> Use `store_company` to distinguish legal ownership when needed.

# Company Overview

## PHC Franchised Restaurants 

The group company is PHC Franchised Restaurants.  This business owns and operates multiple companie and brands in the republic of Cyprus. 
Below is a list of companies under the group:
- 'AVANTAGE B&P CAFE LTD' is the company name for the company that operates the brand 'PAUL'.
- 'Avantage B&R Italian Restaurants Ltd' is the company that operates the brands of 'Jamie Oliver' restaurants in the Republic of Cyprus
- 'CATERCOM LTD' is the company that operates multiple local stores, that can be local made brand or individual cafes/restaurants.  For example in transactions table in clickhouse you will find  'verdi','tavernaki', 'remezzo' , 'pierone' which is 'Pier One', 'kypriakon', 'hobo','akashi' .  all these brands belong in the same company called 'CATERCOM LTD'.  Catercom also operates in caterings and similar events.
- 'CAYLINK LTD' is a company created for the purpose of running  cafe Nero  in molos   , the store is 'NER511', or '511-NERO MOLOS LIMASSOL'.  this store is under the brand of 'nero'  or CAFE NERO  which is operated by another company, but for accounting purposes this store is owned by a different company
- 'DAFERA LTD' is the company that operates the brand of 'wagamama' in the republic of Cyprus.  
- 'HETAFRE TRADING LTD' is the company that operates the brand of 'CAFE NERO'  in the republic of Cyprus.  
- 'ODL ONE DELIVERY (CYPRUS)LTD  is the company that operates as a third-party logistics partner.  This company manages delivery drivers and their equipment.  They provide delivery services for most of the before-mentioned brands/stores across the republic of Cyprus.
- 'PHC FRANCHISED RESTAURANTS PUBLIC LTD'  is the group company or parent company.  This company operates the stores of the three YUM! brands,  'Pizza Hut', 'KFC' and 'Taco Bell'
- 'WOW BURGERS LTD' is the company that operates the burger king brand in the republic of Cyprus.

## POS System

- The POS system the stores of the various companies are using is called 'NOVASERO'.  The data from novasero is the data that fills the tables 'transactions' and 'transaction_details'.  That data is collected per brand and per store.
- In transactions the column 'pk' is the primary key.  to connect data from 'transactions' table to 'transaction_details'  you have to join on transactions.pk = transaction_details.transactionid. 
- In NOVASERO the orders are recorded with a wide variety of details.  The main split is the receipt method and the division. 
 Division  defines wether an order is dine in, delivery , take away etc, where receipt method signals and specific attributes to the transaction,  such as the customer has a coupon, is an employee that receives employee discount and many other cases. 
- These information is shown only in transactions table so if you want to see for specific items the receipt method you have to join from transactions.  
- For transaction_details , in this table all the items punched in the order are recorded, including the items that were eventually cancelled or voided from the order. 
If you want the sum of net revenue from transaction_details to match the net revenue of specific brands/stores , you have to exclude items that 'trde_void_series_number' is not equal to 0.  If 'trde_void_series_number' is equal to 0 then the item was valid and should count in sales.


## Aggregators
-  Aggregators are third party companies that own digital marketplaces where our stores have presence.  These stores receive orders and they transfer those orders to the relevant store.
The aggregators also have their own delivery services for most cases where they deliver to the end customer the product . 
- The main aggregators are 'Wolt', 'Foody' and 'Bolt' .  In Greece there is an aggregator called 'Efood'.  

## Different divisions and channels
- In `transactions` table you have a column called `division_name`  which is the division description for column `tran_division`. 
Divisions are the nature of the sale, since the stores service customers, the way the customers are served is split in these divisions.
For example 'DINE IN' is when the customer goes into the store and sits down to eat/drink. 
- Because there are too many divisions, for a user that wants to get the overview its more useful to use the data in columns `dim_division_group_source`, `dim_division_group_channel`,  and `im_division_group_name`
- in `dim_division_group_source`  it signifies if the division is 'Own', which means internal divisions ( such as dine in and take away) or  if the division is 'External' which signifies other divisions that are mainly third party logistics parterns and external delivery services.
- in `dim_division_group_channel` there is a bit more detail on what group of channel 
- in `dim_division_group_name` there is a groupping of the divisions by a more generic term.

## Discounts and offers
- The discounts and the way the discounts are captured is not as straight forward as it might seem.
- There are two main ways discounts are happening. One type of discounts are the 'Captured' discounts and the other are the 'Non-Captured' discounts.
 Captured discounts are those that are tracked in Novasero and in the  `transactions` table there is a column `tran_discount`
- In `transactions` table there is a column tran_discount. That column shows the captured discount amount, that discount is net.
- Non-Captured discounts occur mainly in the case of offers or limited time bundles where the individual items are not sold seperately.  
Many of these offers occur in aggregators but its not only limited to aggregators. 
For non captured discounts there is a seperate skill called   `[PLACE NAME OF NON CAPTURED DISCOUNTS HERE]`

## Sales amounts , revenue
- The company standard when talking about revenue is to use net amount.  When someone asks for sales or revenue , the answer is always in net amount , excluding VAT and service charge


## New and base stores
- When a location or store begins operations, for 365 days it is considered as 'new' store.  After 365 days of operation the store is then considered as 'base'.  Some people may ask you for example to calculate a year on year (YoY) sales comparison of base stores for 2025, that means that the stores shown in 2025 have been operating for more than 365 days. take the first day of sales you can find in the transactions table as the begining  of operation  
