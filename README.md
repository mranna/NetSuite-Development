Problem Statement

NetSuite is the source of truth for vendor, customer, and employee disbursements, but its native APIs do not support direct creation or updating of bank account details for these entities.
Business teams maintain accurate bank info in external systems:
- Vendors & Customers → MySQL (synced to Snowflake)
- Employees → UKG Pro (flat files)
Due to the API limitation, updates were manual—causing payment delays, data errors, and compliance risks.
To fix this, I developed custom NetSuite RESTlets that allow secure, automated GET/POST/PUT operations on bank account fields for each entity type.

Architecture

[Website Table updates]           [UKG Tables updates]
          |                              |
          v                              v
          [Snowflake Daily Sync]  ← (data warehouse)
                    |
                    v
          [Databricks Python Job]  ← (ETL logic & orchestration) 
                    |
          Triggers REST API calls (insert/update)
                    |
                    v
          [NetSuite SuiteScript RESTlets]
                    |
       Inserts/Updates Vendor & Employee Records


Second use case required filtering open invoices by vendors, employee, which was also addressed via a targeted SuiteScript RESTlet or PORTlet (Dashboards).
